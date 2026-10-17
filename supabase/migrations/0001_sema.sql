-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0001 — Şema
--
-- Sheets'ten Postgres'e geçişin temel farkları:
--   · Ödemeler ve ürün satırları JSON değil, kendi tabloları (sorgulanabilir)
--   · Sipariş ↔ kasa bağı FK ile kurulur; senkron kodu yerine veritabanı
--     garantisi (bkz. 0002_mantik.sql)
--   · Çok şubeli: her kayıt bir mağazaya ait, tek şube bugün bir satır
--   · Tutarlar numeric(12,2) — kayan nokta hatası yok
-- ═══════════════════════════════════════════════════════════════════════

create type rol_tipi as enum ('yonetici', 'muhasebe', 'magaza');
create type siparis_durumu as enum (
  'Satış Yapıldı', 'Cam Siparişi Verildi', 'Montaj Yapıldı', 'Teslim Edildi'
);
create type odeme_yontemi as enum ('nakit', 'kk');
create type odeme_tipi as enum ('tahsilat', 'iade');
create type hareket_yonu as enum ('GELIR', 'GIDER');
create type hareket_kaynagi as enum ('ELLE', 'SIPARIS', 'MAGAZA_MASRAF');
create type kategori_bolumu as enum ('OP', 'FD');
create type hesap_tipi as enum ('kasa', 'banka', 'pos', 'kredi');

-- ── Şubeler ──────────────────────────────────────────────────────────
create table magazalar (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null,
  kod         text not null unique,          -- sipariş no ön eki, örn. 'DK'
  aktif       boolean not null default true,
  olusturma   timestamptz not null default now()
);

-- ── Kullanıcı profilleri (auth.users ile 1-1) ────────────────────────
-- magaza_id null => tüm şubeleri görür (yönetici / muhasebe)
create table profiller (
  id          uuid primary key references auth.users on delete cascade,
  magaza_id   uuid references magazalar on delete set null,
  ad          text not null default '',
  rol         rol_tipi not null default 'magaza',
  aktif       boolean not null default true,
  olusturma   timestamptz not null default now()
);

-- ── Satış personeli (giriş hesabı DEĞİL) ─────────────────────────────
-- Mağaza tek ortak tabletle çalışır; işlemi yapan kişi burada seçilir.
create table personel (
  id          uuid primary key default gen_random_uuid(),
  magaza_id   uuid not null references magazalar on delete cascade,
  ad          text not null,
  aktif       boolean not null default true,
  prim_muaf   boolean not null default false,
  sira        integer not null default 0,
  unique (magaza_id, ad)
);

-- ── Ürün kategorileri ve markalar ────────────────────────────────────
create table urun_kategorileri (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null unique,
  kdv         numeric(5, 2) not null default 0,
  ikon        text not null default '',
  sira        integer not null default 0,
  aktif       boolean not null default true
);

create table markalar (
  id            uuid primary key default gen_random_uuid(),
  kategori_id   uuid not null references urun_kategorileri on delete cascade,
  ad            text not null,
  aktif         boolean not null default true
);
create unique index markalar_kategori_ad_uniq on markalar (kategori_id, lower(ad));

-- ── Hesaplar (Nakit Kasa, <Banka> POS, kredi hesapları...) ───────────
create table hesaplar (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null unique,
  tip         hesap_tipi not null default 'kasa',
  aktif       boolean not null default true,
  sira        integer not null default 0
);

-- ── Kasa kategori ağacı ──────────────────────────────────────────────
create table kasa_kategorileri (
  id          uuid primary key default gen_random_uuid(),
  ana         text not null,
  alt         text not null default '',
  yon         hareket_yonu not null,
  bolum       kategori_bolumu not null default 'OP',
  sira        integer not null default 0,
  unique (ana, alt)
);

-- ── Anahtar/değer ayarlar (oranlar, listeler, varsayılanlar) ─────────
create table ayarlar (
  anahtar     text primary key,
  deger       text not null default '',
  aciklama    text not null default ''
);

-- ── Müşteriler ───────────────────────────────────────────────────────
create table musteriler (
  id            uuid primary key default gen_random_uuid(),
  magaza_id     uuid not null references magazalar on delete cascade,
  ad_soyad      text not null,
  telefon       text not null default '',
  -- Eşleştirme için sadeleştirilmiş telefon: 0532.../+90532... -> 532...
  telefon_norm  text generated always as (
                  regexp_replace(regexp_replace(telefon, '\D', '', 'g'), '^(90|0)', '')
                ) stored,
  eposta        text not null default '',
  tc_vergi      text not null default '',
  son_recete    jsonb not null default '{}',
  notu          text not null default '',
  olusturma     timestamptz not null default now(),
  guncelleme    timestamptz not null default now()
);
create index musteriler_telefon_norm_idx on musteriler (magaza_id, telefon_norm);
create index musteriler_ad_idx on musteriler (magaza_id, lower(ad_soyad));

-- ── Siparişler ───────────────────────────────────────────────────────
create table siparisler (
  id                  uuid primary key default gen_random_uuid(),
  magaza_id           uuid not null references magazalar on delete restrict,
  no                  text not null,                    -- DK-10-26-0001
  siparis_tarihi      date not null default current_date,
  teslim_tarihi       date,
  personel_adi        text not null default '',
  musteri_id          uuid references musteriler on delete set null,
  -- Sipariş anındaki müşteri bilgisi (kart sonradan düzeltilse de fiş değişmez)
  ad_soyad            text not null,
  telefon             text not null default '',
  eposta              text not null default '',
  tc_vergi            text not null default '',
  recete              jsonb not null default '{}',
  ara_toplam          numeric(12, 2) not null default 0,  -- ürün satırlarından
  tutar               numeric(12, 2) not null default 0,  -- genel toplam
  tutar_elle          boolean not null default false,     -- indirim: elle girildi
  durum               siparis_durumu not null default 'Satış Yapıldı',
  durum_tarihi        date not null default current_date,
  nebim               boolean not null default false,
  olusturan           uuid references auth.users on delete set null,
  olusturan_personel  text not null default '',
  silindi             boolean not null default false,
  silinme_tarihi      date,
  olusturma           timestamptz not null default now(),
  guncelleme          timestamptz not null default now(),
  constraint siparisler_no_uniq unique (magaza_id, no),
  constraint siparisler_ad_dolu check (length(btrim(ad_soyad)) > 0)
);
create index siparisler_tarih_idx on siparisler (magaza_id, siparis_tarihi desc);
create index siparisler_durum_idx on siparisler (magaza_id, durum) where not silindi;
create index siparisler_musteri_idx on siparisler (musteri_id);

-- Sipariş numarası sayacı: ay başına atomik artış (yarış durumu yok)
create table siparis_sayaclari (
  magaza_id   uuid not null references magazalar on delete cascade,
  yil_ay      char(7) not null,            -- 'YYYY-MM'
  son_no      integer not null default 0,
  primary key (magaza_id, yil_ay)
);

-- ── Sipariş ürün satırları ───────────────────────────────────────────
create table siparis_urunleri (
  id            uuid primary key default gen_random_uuid(),
  siparis_id    uuid not null references siparisler on delete cascade,
  sira          integer not null default 0,
  kategori      text not null default '',
  marka         text not null default '',
  urun          text not null default '',
  adet          integer not null default 1 check (adet >= 1),
  ekartman      text not null default '',
  kopru         text not null default '',
  kol           text not null default '',
  birim_fiyat   numeric(12, 2) not null default 0,
  satir_toplam  numeric(12, 2) generated always as (adet * birim_fiyat) stored
);
create index siparis_urunleri_siparis_idx on siparis_urunleri (siparis_id);

-- ── Tahsilat / iade ──────────────────────────────────────────────────
-- Nakit esaslı: her ödeme KENDİ tarihiyle sayılır, sipariş tarihiyle değil.
create table odemeler (
  id                  uuid primary key default gen_random_uuid(),
  siparis_id          uuid not null references siparisler on delete cascade,
  tarih               date not null default current_date,
  tutar               numeric(12, 2) not null check (tutar > 0),
  yontem              odeme_yontemi not null default 'nakit',
  banka               text not null default '',
  taksit              text not null default '',
  tip                 odeme_tipi not null default 'tahsilat',
  olusturan_personel  text not null default '',
  olusturma           timestamptz not null default now()
);
create index odemeler_siparis_idx on odemeler (siparis_id);
create index odemeler_tarih_idx on odemeler (tarih);

-- ── Kasa hareketleri ─────────────────────────────────────────────────
-- kaynak = 'SIPARIS'  -> odeme_id dolu, trigger üretir, elle düzenlenmez
-- kaynak = 'MAGAZA_MASRAF' -> mağazanın kendi girdiği masraf
-- kaynak = 'ELLE'     -> muhasebenin girdiği kalem
create table hareketler (
  id            uuid primary key default gen_random_uuid(),
  magaza_id     uuid references magazalar on delete set null,
  tarih         date not null default current_date,
  yon           hareket_yonu not null,
  ana_kategori  text not null,
  alt_kategori  text not null default '',
  tutar         numeric(12, 2) not null check (tutar > 0),
  hesap_id      uuid not null references hesaplar on delete restrict,
  aciklama      text not null default '',
  kaydeden      text not null default '',
  kaydeden_id   uuid references auth.users on delete set null,
  kaynak        hareket_kaynagi not null default 'ELLE',
  -- Sipariş tahsilatından üretilmiş hareketin kaynağı. Ödeme silinirse
  -- hareket de silinir: kasa ile sipariş arasında kopukluk olamaz.
  odeme_id      uuid references odemeler on delete cascade,
  silindi       boolean not null default false,
  olusturma     timestamptz not null default now(),
  guncelleme    timestamptz not null default now(),
  constraint hareketler_kaynak_tutarli check (
    (kaynak = 'SIPARIS' and odeme_id is not null) or
    (kaynak <> 'SIPARIS' and odeme_id is null)
  )
);
create unique index hareketler_odeme_uniq on hareketler (odeme_id) where odeme_id is not null;
create index hareketler_tarih_idx on hareketler (tarih) where not silindi;
create index hareketler_kaynak_idx on hareketler (kaynak, tarih) where not silindi;

-- ── Aylık mağaza hedefi ──────────────────────────────────────────────
create table hedefler (
  magaza_id   uuid not null references magazalar on delete cascade,
  ay          char(7) not null check (ay ~ '^\d{4}-\d{2}$'),
  hedef       numeric(12, 2) not null default 0,
  notu        text not null default '',
  primary key (magaza_id, ay)
);

-- ── Planlanan ödemeler / banka doğrulama / tekrarlayan kalemler ──────
create table cari_plan (
  id          uuid primary key default gen_random_uuid(),
  tedarikci   text not null,
  ay          char(7) not null check (ay ~ '^\d{4}-\d{2}$'),
  planlanan   numeric(12, 2) not null default 0,
  notu        text not null default '',
  unique (tedarikci, ay)
);

create table banka_dogrulama (
  tarih       date not null,
  hesap_id    uuid not null references hesaplar on delete cascade,
  bakiye      numeric(12, 2) not null default 0,
  notu        text not null default '',
  primary key (tarih, hesap_id)
);

create table tekrarlayan (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null,
  ana         text not null,
  alt         text not null default '',
  tutar       numeric(12, 2) not null default 0,
  gun         integer not null default 1 check (gun between 1 and 31),
  hesap_id    uuid references hesaplar on delete set null,
  yon         hareket_yonu not null default 'GIDER',
  aktif       boolean not null default true
);

-- ── Değişiklik günlüğü ───────────────────────────────────────────────
create table log (
  id                bigserial primary key,
  zaman             timestamptz not null default now(),
  kullanici_id      uuid references auth.users on delete set null,
  kullanici_eposta  text not null default '',
  personel          text not null default '',
  islem             text not null,
  tablo             text not null default '',
  kayit_id          text not null default '',
  detay             jsonb not null default '{}'
);
create index log_zaman_idx on log (zaman desc);
