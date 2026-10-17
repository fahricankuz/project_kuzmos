-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0001 — Şema (çok kiracılı SaaS)
--
-- Kuzmos tek bir işletmenin iç aracı değil, optik işletmelerine satılan bir
-- üründür. Bu yüzden veri modelinin en üstünde İŞLETME (kiracı) durur:
--
--   isletmeler (kiracı / abone)
--     └── magazalar (şubeler)
--           └── siparisler → siparis_urunleri, odemeler
--     └── musteriler, personel, hesaplar, kategoriler, ayarlar, hareketler...
--
-- Kurallar:
--   · Kiracıya ait HER tabloda isletme_id vardır ve RLS politikaları ilk
--     olarak bunu kontrol eder. Bir işletme başka işletmenin tek satırını
--     bile göremez (bkz. 0003_guvenlik.sql ve test/db/izolasyon.test.js).
--   · Varsayılan listeler (kategori, marka, ayar) global değil, işletme
--     başınadır: her abone kendi listesini düzenler.
--   · Tutarlar numeric(12,2) — kayan nokta hatası yok.
-- ═══════════════════════════════════════════════════════════════════════

/*
 * İşletme içi roller (Kuzmos ekibi bunlardan ayrıdır: platform_yoneticileri)
 *   yonetici      — işletmenin tamamı: kullanıcı, şube, ayar, kasa, rapor
 *   finans        — kasa, rapor, cari, banka; kullanıcı/şube yönetemez
 *   magaza_muduru — kendi şubesi: sipariş, müşteri, masraf, şube kasası
 *   personel      — kendi şubesi: sipariş, tahsilat, müşteri, masraf
 */
create type rol_tipi as enum ('yonetici', 'finans', 'magaza_muduru', 'personel');
create type abonelik_durumu as enum ('deneme', 'aktif', 'odeme_bekliyor', 'askida', 'iptal');
create type siparis_durumu as enum (
  'Satış Yapıldı', 'Cam Siparişi Verildi', 'Montaj Yapıldı', 'Teslim Edildi'
);
create type odeme_yontemi as enum ('nakit', 'kk');
create type odeme_tipi as enum ('tahsilat', 'iade');
create type hareket_yonu as enum ('GELIR', 'GIDER');
create type hareket_kaynagi as enum ('ELLE', 'SIPARIS', 'MAGAZA_MASRAF');
create type kategori_bolumu as enum ('OP', 'FD');
create type hesap_tipi as enum ('kasa', 'banka', 'pos', 'kredi');

-- ══ PLATFORM KATMANI ══════════════════════════════════════════════════

/* Satış paketleri. Fiyat ve limitler koda gömülmez. */
create table planlar (
  kod            text primary key,                 -- 'deneme', 'temel', 'pro'
  ad             text not null,
  aylik_fiyat    numeric(10, 2) not null default 0,
  yillik_fiyat   numeric(10, 2),
  para_birimi    text not null default 'TRY',
  max_kullanici  integer not null default 3,
  max_magaza     integer not null default 1,
  ozellikler     jsonb not null default '{}',      -- {"kasa":true,"rapor":true}
  aktif          boolean not null default true,
  sira           integer not null default 0
);

/* Kiracı = abone olan optik işletmesi. */
create table isletmeler (
  id              uuid primary key default gen_random_uuid(),
  ad              text not null,
  slug            text not null unique,            -- url/kimlik: 'damlakuz-optik'
  eposta          text not null default '',
  telefon         text not null default '',
  vergi_dairesi   text not null default '',
  vergi_no        text not null default '',
  adres           text not null default '',
  plan_kod        text not null default 'deneme' references planlar on update cascade,
  durum           abonelik_durumu not null default 'deneme',
  deneme_bitis    date not null default current_date + 14,
  abonelik_bitis  date,
  olusturma       timestamptz not null default now(),
  guncelleme      timestamptz not null default now(),
  constraint isletmeler_ad_dolu check (length(btrim(ad)) > 0),
  constraint isletmeler_slug_bicim check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$')
);

/* Abonelik geçmişi: plan değişimi, tahsilat, iptal. Faturalama sağlayıcısı
   buraya yazar (saglayici + saglayici_ref), uygulama buradan okur. */
create table abonelik_hareketleri (
  id             bigserial primary key,
  isletme_id     uuid not null references isletmeler on delete cascade,
  tip            text not null,                    -- 'deneme_basladi','odeme','plan_degisti','iptal'
  plan_kod       text references planlar on update cascade,
  tutar          numeric(10, 2),
  para_birimi    text not null default 'TRY',
  saglayici      text not null default '',         -- 'iyzico','paddle','elle'
  saglayici_ref  text not null default '',
  donem_bas      date,
  donem_bitis    date,
  detay          jsonb not null default '{}',
  olusturma      timestamptz not null default now()
);
create index abonelik_hareketleri_isletme_idx on abonelik_hareketleri (isletme_id, olusturma desc);

/* Platform (Kuzmos ekibi) yöneticileri. Abonelik ve kullanım verisini
   görür; kiracıların İŞ VERİSİNE erişimi yoktur (bkz. 0003). */
create table platform_yoneticileri (
  id         uuid primary key references auth.users on delete cascade,
  ad         text not null default '',
  olusturma  timestamptz not null default now()
);

-- ══ KİRACI KATMANI ════════════════════════════════════════════════════

create table magazalar (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  ad          text not null,
  kod         text not null,                       -- sipariş no ön eki, örn. 'DK'
  telefon     text not null default '',
  adres       text not null default '',
  aktif       boolean not null default true,
  olusturma   timestamptz not null default now(),
  unique (isletme_id, kod)
);
create index magazalar_isletme_idx on magazalar (isletme_id);

/*
 * Kullanıcı profili. Roller:
 *   sahip    — abonelik ve faturalama dahil her şey (işletme kurucusu)
 *   yonetici — kullanıcı ve ayar yönetimi, tüm veri
 *   muhasebe — kasa/rapor/sipariş verisi; kullanıcı yönetemez
 *   magaza   — yalnızca kendi şubesi; kasanın tamamını göremez
 * magaza_id null => işletmenin tüm şubeleri (sahip/yonetici/muhasebe).
 */
create table profiller (
  id          uuid primary key references auth.users on delete cascade,
  isletme_id  uuid references isletmeler on delete cascade,
  /* null => işletmenin tüm şubeleri (yonetici/finans) */
  magaza_id   uuid references magazalar on delete set null,
  ad          text not null default '',
  eposta      text not null default '',
  rol         rol_tipi not null default 'personel',
  /* İşletmeyi kuran kullanıcı: pasife alınamaz, rolü düşürülemez */
  kurucu      boolean not null default false,
  aktif       boolean not null default true,
  olusturma   timestamptz not null default now()
);
create index profiller_isletme_idx on profiller (isletme_id);

/* Satış personeli (giriş hesabı DEĞİL): mağaza ortak tabletle çalışır,
   işlemi yapan kişi bu listeden seçilir. */
create table personel (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  magaza_id   uuid not null references magazalar on delete cascade,
  ad          text not null,
  aktif       boolean not null default true,
  prim_muaf   boolean not null default false,
  sira        integer not null default 0,
  unique (magaza_id, ad)
);
create index personel_isletme_idx on personel (isletme_id);

create table urun_kategorileri (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  ad          text not null,
  kdv         numeric(5, 2) not null default 0,
  ikon        text not null default '',
  sira        integer not null default 0,
  aktif       boolean not null default true,
  unique (isletme_id, ad)
);

create table markalar (
  id           uuid primary key default gen_random_uuid(),
  isletme_id   uuid not null references isletmeler on delete cascade,
  kategori_id  uuid not null references urun_kategorileri on delete cascade,
  ad           text not null,
  aktif        boolean not null default true
);
create unique index markalar_kategori_ad_uniq on markalar (kategori_id, lower(ad));
create index markalar_isletme_idx on markalar (isletme_id);

create table hesaplar (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  ad          text not null,
  tip         hesap_tipi not null default 'kasa',
  aktif       boolean not null default true,
  sira        integer not null default 0,
  unique (isletme_id, ad)
);

create table kasa_kategorileri (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  ana         text not null,
  alt         text not null default '',
  yon         hareket_yonu not null,
  bolum       kategori_bolumu not null default 'OP',
  sira        integer not null default 0,
  unique (isletme_id, ana, alt)
);

/* Anahtar/değer ayarlar: oranlar, listeler, markalaşma (işletme başına). */
create table ayarlar (
  isletme_id  uuid not null references isletmeler on delete cascade,
  anahtar     text not null,
  deger       text not null default '',
  aciklama    text not null default '',
  primary key (isletme_id, anahtar)
);

create table musteriler (
  id            uuid primary key default gen_random_uuid(),
  isletme_id    uuid not null references isletmeler on delete cascade,
  magaza_id     uuid not null references magazalar on delete cascade,
  ad_soyad      text not null,
  telefon       text not null default '',
  /* Eşleştirme için sadeleştirilmiş telefon: 0532.../+90532... -> 532... */
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
create index musteriler_isletme_idx on musteriler (isletme_id);

create table siparisler (
  id                  uuid primary key default gen_random_uuid(),
  isletme_id          uuid not null references isletmeler on delete cascade,
  magaza_id           uuid not null references magazalar on delete restrict,
  no                  text not null,
  siparis_tarihi      date not null default current_date,
  teslim_tarihi       date,
  personel_adi        text not null default '',
  musteri_id          uuid references musteriler on delete set null,
  /* Sipariş anındaki müşteri bilgisi: kart sonradan düzeltilse de fiş değişmez */
  ad_soyad            text not null,
  telefon             text not null default '',
  eposta              text not null default '',
  tc_vergi            text not null default '',
  recete              jsonb not null default '{}',
  ara_toplam          numeric(12, 2) not null default 0,
  tutar               numeric(12, 2) not null default 0,
  tutar_elle          boolean not null default false,
  durum               siparis_durumu not null default 'Satış Yapıldı',
  durum_tarihi        date not null default current_date,
  erp_islendi         boolean not null default false,  -- harici ERP'ye aktarıldı mı
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
create index siparisler_isletme_idx on siparisler (isletme_id);

/* Sipariş numarası sayacı: ay başına atomik artış (yarış durumu yok) */
create table siparis_sayaclari (
  magaza_id   uuid not null references magazalar on delete cascade,
  yil_ay      char(7) not null,
  son_no      integer not null default 0,
  primary key (magaza_id, yil_ay)
);

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

/* Nakit esaslı: her ödeme KENDİ tarihiyle sayılır, sipariş tarihiyle değil. */
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

/*
 * Kasa hareketleri.
 *   kaynak = 'SIPARIS'        → odeme_id dolu, trigger üretir, elle düzenlenmez
 *   kaynak = 'MAGAZA_MASRAF'  → mağazanın kendi girdiği masraf
 *   kaynak = 'ELLE'           → muhasebenin girdiği kalem
 */
create table hareketler (
  id            uuid primary key default gen_random_uuid(),
  isletme_id    uuid not null references isletmeler on delete cascade,
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
create index hareketler_tarih_idx on hareketler (isletme_id, tarih) where not silindi;
create index hareketler_kaynak_idx on hareketler (isletme_id, kaynak, tarih) where not silindi;

create table hedefler (
  isletme_id  uuid not null references isletmeler on delete cascade,
  magaza_id   uuid not null references magazalar on delete cascade,
  ay          char(7) not null check (ay ~ '^\d{4}-\d{2}$'),
  hedef       numeric(12, 2) not null default 0,
  notu        text not null default '',
  primary key (magaza_id, ay)
);

create table cari_plan (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  tedarikci   text not null,
  ay          char(7) not null check (ay ~ '^\d{4}-\d{2}$'),
  planlanan   numeric(12, 2) not null default 0,
  notu        text not null default '',
  unique (isletme_id, tedarikci, ay)
);

create table banka_dogrulama (
  isletme_id  uuid not null references isletmeler on delete cascade,
  tarih       date not null,
  hesap_id    uuid not null references hesaplar on delete cascade,
  bakiye      numeric(12, 2) not null default 0,
  notu        text not null default '',
  primary key (tarih, hesap_id)
);

create table tekrarlayan (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  ad          text not null,
  ana         text not null,
  alt         text not null default '',
  tutar       numeric(12, 2) not null default 0,
  gun         integer not null default 1 check (gun between 1 and 31),
  hesap_id    uuid references hesaplar on delete set null,
  yon         hareket_yonu not null default 'GIDER',
  aktif       boolean not null default true
);

create table log (
  id                bigserial primary key,
  isletme_id        uuid references isletmeler on delete cascade,
  zaman             timestamptz not null default now(),
  kullanici_id      uuid references auth.users on delete set null,
  kullanici_eposta  text not null default '',
  personel          text not null default '',
  islem             text not null,
  tablo             text not null default '',
  kayit_id          text not null default '',
  detay             jsonb not null default '{}'
);
create index log_zaman_idx on log (isletme_id, zaman desc);
