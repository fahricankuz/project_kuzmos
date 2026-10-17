-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0004 — Uygulama API'si (RPC)
--
-- Arayüz tek çağrıda iş yapar: tum_veri(), siparis_kaydet(...) gibi.
-- Dönen JSON, Apps Script sürümünün döndürdüğü şeklin AYNISI (camelCase);
-- böylece arayüz kodu değişmeden çalışır.
--
-- Bu fonksiyonlar security INVOKER'dır: RLS politikaları geçerlidir, yani
-- mağaza rolü bu uçlardan da yalnızca kendi şubesinin verisini görür/yazar.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Küçük yardımcılar ────────────────────────────────────────────────

/* "a, b, c" → {a,b,c} */
create or replace function liste_ayristir(p text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}'::text[])
  from unnest(string_to_array(coalesce(p, ''), ',')) x
$$;

/* "Tek çekim:3.5, 2 Taksit:7" → {"Tek çekim":3.5,"2 Taksit":7} */
create or replace function oran_ayristir(p text)
returns jsonb language plpgsql immutable as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_par text;
  v_i   integer;
  v_ad  text;
  v_or  text;
begin
  foreach v_par in array liste_ayristir(p) loop
    v_i := length(v_par) - strpos(reverse(v_par), ':') + 1;   -- son ':'
    if v_i < 2 then continue; end if;
    v_ad := btrim(left(v_par, v_i - 1));
    v_or := btrim(substr(v_par, v_i + 1));
    if v_ad = '' then continue; end if;
    begin
      v_out := v_out || jsonb_build_object(v_ad, replace(v_or, ',', '.')::numeric);
    exception when others then null;
    end;
  end loop;
  return v_out;
end $$;

/* Günlüğe yazma: log tablosuna doğrudan erişim yok, bu uçtan geçilir. */
create or replace function log_ekle(
  p_islem text, p_tablo text default '', p_kayit text default '',
  p_personel text default '', p_detay jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into log (kullanici_id, personel, islem, tablo, kayit_id, detay)
  values (auth.uid(), coalesce(p_personel, ''), p_islem,
          coalesce(p_tablo, ''), coalesce(p_kayit, ''), coalesce(p_detay, '{}'::jsonb))
$$;

/* Serbest girilen satış personelini listeye ekler (mağaza rolü de yapabilir). */
create or replace function personel_sagla(p_ad text)
returns void language plpgsql security definer set search_path = public as $$
declare v_magaza uuid;
begin
  if btrim(coalesce(p_ad, '')) = '' or aktif_rol() is null then return; end if;
  v_magaza := coalesce(aktif_magaza(),
                       (select id from magazalar where aktif order by olusturma limit 1));
  if v_magaza is null then return; end if;
  insert into personel (magaza_id, ad) values (v_magaza, btrim(p_ad))
  on conflict (magaza_id, ad) do nothing;
end $$;

/* Kullanıcının şubesi; finans rollerinde ilk aktif şube. */
create or replace function varsayilan_magaza()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(aktif_magaza(),
                  (select id from magazalar where aktif order by olusturma limit 1))
$$;

/* Telefonu eşleştirme biçimine indirger (telefon_norm ile aynı kural). */
create or replace function telefon_sadelestir(p text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(90|0)', '')
$$;

-- ── Müşteri ──────────────────────────────────────────────────────────
/*
 * Müşteriyi oluşturur veya günceller, id döner. Boş gelen alanlar mevcut
 * değerin üzerine YAZILMAZ. Eşleştirme: id → telefon → (telefonsuz) ad.
 */
create or replace function musteri_upsert(p jsonb)
returns uuid language plpgsql as $$
declare
  v_magaza uuid := varsayilan_magaza();
  v_ad     text := btrim(coalesce(p->>'adSoyad', ''));
  v_tel    text := telefon_sadelestir(p->>'telefon');
  v_id     uuid;
begin
  if v_ad = '' then return null; end if;

  begin
    v_id := nullif(btrim(coalesce(p->>'musteriId', '')), '')::uuid;
  exception when others then v_id := null;
  end;
  if v_id is not null then
    perform 1 from musteriler where id = v_id;
    if not found then v_id := null; end if;
  end if;

  if v_id is null and v_tel <> '' then
    select id into v_id from musteriler
     where magaza_id = v_magaza and telefon_norm = v_tel limit 1;
  end if;

  if v_id is null then
    select id into v_id from musteriler
     where magaza_id = v_magaza and lower(ad_soyad) = lower(v_ad) and telefon_norm = ''
     limit 1;
  end if;

  if v_id is not null then
    update musteriler set
      ad_soyad   = v_ad,
      telefon    = coalesce(nullif(btrim(p->>'telefon'), ''), telefon),
      eposta     = coalesce(nullif(btrim(p->>'eposta'), ''), eposta),
      tc_vergi   = coalesce(nullif(btrim(p->>'tcVergi'), ''), tc_vergi),
      son_recete = case when p ? 'recete' and p->'recete' <> '{}'::jsonb
                        then p->'recete' else son_recete end,
      notu       = coalesce(nullif(btrim(p->>'notu'), ''), notu)
     where id = v_id;
    return v_id;
  end if;

  insert into musteriler (magaza_id, ad_soyad, telefon, eposta, tc_vergi, son_recete, notu)
  values (v_magaza, v_ad, coalesce(p->>'telefon', ''), coalesce(p->>'eposta', ''),
          coalesce(p->>'tcVergi', ''), coalesce(p->'recete', '{}'::jsonb),
          coalesce(p->>'notu', ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function musteri_guncelle(p jsonb, p_personel text default '')
returns boolean language plpgsql as $$
declare v_id uuid;
begin
  begin
    v_id := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  exception when others then v_id := null;
  end;
  if v_id is null then raise exception 'Müşteri ID gerekli.'; end if;
  if btrim(coalesce(p->>'adSoyad', '')) = '' then raise exception 'Ad Soyad gerekli.'; end if;
  update musteriler set
    ad_soyad   = btrim(p->>'adSoyad'),
    telefon    = coalesce(p->>'telefon', ''),
    eposta     = coalesce(p->>'eposta', ''),
    tc_vergi   = coalesce(p->>'tcVergi', ''),
    son_recete = coalesce(p->'sonRecete', son_recete),
    notu       = coalesce(p->>'notu', '')
   where id = v_id;
  if not found then raise exception 'Müşteri bulunamadı.'; end if;
  perform log_ekle('MUSTERI_GUNCELLE', 'musteriler', v_id::text, p_personel, p);
  return true;
end $$;

-- ── Sipariş JSON (arayüzün beklediği şekil) ──────────────────────────
create or replace function siparis_json(p_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', s.id,
    'no', s.no,
    'siparisTarihi', to_char(s.siparis_tarihi, 'YYYY-MM-DD'),
    'teslimTarihi', coalesce(to_char(s.teslim_tarihi, 'YYYY-MM-DD'), ''),
    'personel', s.personel_adi,
    'musteriId', coalesce(s.musteri_id::text, ''),
    'adSoyad', s.ad_soyad,
    'telefon', s.telefon,
    'eposta', s.eposta,
    'tcVergi', s.tc_vergi,
    'recete', s.recete,
    'urunler', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'marka', u.marka, 'kategori', u.kategori, 'urun', u.urun, 'adet', u.adet,
        'ekartman', u.ekartman, 'kopru', u.kopru, 'kol', u.kol, 'fiyat', u.birim_fiyat
      ) order by u.sira, u.id), '[]'::jsonb)
      from siparis_urunleri u where u.siparis_id = s.id),
    'araToplam', s.ara_toplam,
    'tutar', s.tutar,
    'tutarElle', s.tutar_elle,
    'odemeler', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'tutar', o.tutar, 'tarih', to_char(o.tarih, 'YYYY-MM-DD'),
        'yontem', o.yontem, 'banka', o.banka, 'taksit', o.taksit, 'tip', o.tip
      ) order by o.tarih, o.olusturma), '[]'::jsonb)
      from odemeler o where o.siparis_id = s.id),
    'tahsilEdilen', v.tahsil_edilen,
    'kalan', v.kalan,
    'durum', s.durum,
    'durumTarihi', to_char(s.durum_tarihi, 'YYYY-MM-DD'),
    'nebim', s.nebim,
    'olusturanHesap', '',
    'olusturanPersonel', s.olusturan_personel,
    'silindi', s.silindi,
    'silinmeTarihi', coalesce(to_char(s.silinme_tarihi, 'YYYY-MM-DD'), '')
  )
  from siparisler s
  join v_siparisler v on v.id = s.id
  where s.id = p_id
$$;

-- ── Sipariş kaydet (ekle / güncelle) ─────────────────────────────────
/*
 * Tek çağrıda: müşteri kartı, sipariş, ürün satırları, ödemeler ve marka
 * listesi. Ödemeler payload ile eşitlenir; kaldırılan ödemenin kasa
 * hareketi FK cascade ile silinir.
 */
create or replace function siparis_kaydet(p jsonb, p_personel text default '')
returns jsonb language plpgsql as $$
declare
  v_id       uuid;
  v_magaza   uuid := varsayilan_magaza();
  v_ad       text := btrim(coalesce(p->>'adSoyad', ''));
  v_tarih    date;
  v_musteri  uuid;
  v_ara      numeric(12,2) := 0;
  v_tutar    numeric(12,2) := coalesce((p->>'tutar')::numeric, 0);
  v_elle     boolean;
  v_durum    siparis_durumu;
  v_satir    jsonb;
  v_sira     integer := 0;
  v_yeni     boolean;
  v_tutulan  uuid[];
  v_odeme_id uuid;
begin
  begin
    v_id := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  exception when others then v_id := null;
  end;
  v_yeni := v_id is null;

  if aktif_rol() is null then raise exception 'Yetkisiz.'; end if;
  if v_ad = '' then raise exception 'Müşteri adı zorunludur.'; end if;
  if aktif_rol() = 'magaza' and btrim(coalesce(p_personel, '')) = '' then
    raise exception 'İşlemi yapan satış personelini seçin.';
  end if;

  begin
    v_tarih := coalesce(nullif(p->>'siparisTarihi', '')::date, current_date);
  exception when others then raise exception 'Sipariş tarihi geçersiz.';
  end;

  v_durum := coalesce(nullif(p->>'durum', '')::siparis_durumu, 'Satış Yapıldı');

  /* Ürünlerden ara toplam; indirim = elle girilmiş farklı genel toplam */
  for v_satir in select * from jsonb_array_elements(coalesce(p->'urunler', '[]'::jsonb)) loop
    v_ara := v_ara + greatest(coalesce((v_satir->>'adet')::integer, 1), 1)
                     * coalesce((v_satir->>'fiyat')::numeric, 0);
  end loop;
  v_elle := v_tutar > 0 and abs(v_tutar - v_ara) > 0.005;
  if not v_elle then v_tutar := v_ara; end if;

  v_musteri := musteri_upsert(jsonb_build_object(
    'musteriId', coalesce(p->>'musteriId', ''),
    'adSoyad', v_ad,
    'telefon', coalesce(p->>'telefon', ''),
    'eposta', coalesce(p->>'eposta', ''),
    'tcVergi', coalesce(p->>'tcVergi', ''),
    'recete', coalesce(p->'recete', '{}'::jsonb)
  ));

  if v_yeni then
    insert into siparisler (
      magaza_id, siparis_tarihi, personel_adi, musteri_id, ad_soyad, telefon,
      eposta, tc_vergi, recete, tutar, tutar_elle, durum, nebim, olusturan_personel
    ) values (
      v_magaza, v_tarih, coalesce(p->>'personel', ''), v_musteri, v_ad,
      coalesce(p->>'telefon', ''), coalesce(p->>'eposta', ''), coalesce(p->>'tcVergi', ''),
      coalesce(p->'recete', '{}'::jsonb), v_tutar, v_elle, v_durum,
      coalesce((p->>'nebim')::boolean, false),
      coalesce(nullif(btrim(p_personel), ''), coalesce(p->>'personel', ''))
    ) returning id into v_id;
  else
    update siparisler set
      siparis_tarihi = v_tarih,
      personel_adi = coalesce(p->>'personel', personel_adi),
      musteri_id = coalesce(v_musteri, musteri_id),
      ad_soyad = v_ad,
      telefon = coalesce(p->>'telefon', ''),
      eposta = coalesce(p->>'eposta', ''),
      tc_vergi = coalesce(p->>'tcVergi', ''),
      recete = coalesce(p->'recete', recete),
      tutar = v_tutar,
      tutar_elle = v_elle,
      durum = v_durum,
      nebim = coalesce((p->>'nebim')::boolean, false)
     where id = v_id;
    if not found then raise exception 'Sipariş bulunamadı.'; end if;
  end if;

  /* Ürün satırları: tamamı yeniden yazılır (tetikleyici toplamı günceller) */
  delete from siparis_urunleri where siparis_id = v_id;
  for v_satir in select * from jsonb_array_elements(coalesce(p->'urunler', '[]'::jsonb)) loop
    v_sira := v_sira + 1;
    insert into siparis_urunleri (
      siparis_id, sira, kategori, marka, urun, adet, ekartman, kopru, kol, birim_fiyat
    ) values (
      v_id, v_sira,
      coalesce(v_satir->>'kategori', ''), coalesce(v_satir->>'marka', ''),
      coalesce(v_satir->>'urun', ''),
      greatest(coalesce((v_satir->>'adet')::integer, 1), 1),
      coalesce(v_satir->>'ekartman', ''), coalesce(v_satir->>'kopru', ''),
      coalesce(v_satir->>'kol', ''), coalesce((v_satir->>'fiyat')::numeric, 0)
    );
    perform marka_sagla(v_satir->>'kategori', v_satir->>'marka');
  end loop;

  /* Ödemeler: payload ile eşitle */
  v_tutulan := '{}'::uuid[];
  for v_satir in select * from jsonb_array_elements(coalesce(p->'odemeler', '[]'::jsonb)) loop
    if coalesce((v_satir->>'tutar')::numeric, 0) <= 0
       or coalesce(v_satir->>'tarih', '') = '' then
      continue;
    end if;
    v_odeme_id := nullif(btrim(coalesce(v_satir->>'id', '')), '')::uuid;
    if v_odeme_id is not null then
      update odemeler set
        tarih = (v_satir->>'tarih')::date,
        tutar = (v_satir->>'tutar')::numeric,
        yontem = coalesce(nullif(v_satir->>'yontem', '')::odeme_yontemi, 'nakit'),
        banka = coalesce(v_satir->>'banka', ''),
        taksit = coalesce(v_satir->>'taksit', ''),
        tip = coalesce(nullif(v_satir->>'tip', '')::odeme_tipi, 'tahsilat')
       where id = v_odeme_id and siparis_id = v_id;
      if not found then v_odeme_id := null; end if;
    end if;
    if v_odeme_id is null then
      insert into odemeler (siparis_id, tarih, tutar, yontem, banka, taksit, tip, olusturan_personel)
      values (
        v_id, (v_satir->>'tarih')::date, (v_satir->>'tutar')::numeric,
        coalesce(nullif(v_satir->>'yontem', '')::odeme_yontemi, 'nakit'),
        coalesce(v_satir->>'banka', ''), coalesce(v_satir->>'taksit', ''),
        coalesce(nullif(v_satir->>'tip', '')::odeme_tipi, 'tahsilat'),
        coalesce(nullif(btrim(p_personel), ''), coalesce(p->>'personel', ''))
      ) returning id into v_odeme_id;
    end if;
    v_tutulan := v_tutulan || v_odeme_id;
  end loop;
  delete from odemeler where siparis_id = v_id and not (id = any (v_tutulan));

  /* Personel listesinde yoksa ekle (mağaza serbest metin girebilir) */
  perform personel_sagla(p_personel);

  perform log_ekle(
    case when v_yeni then 'SIPARIS_EKLE' else 'SIPARIS_GUNCELLE' end,
    'siparisler', v_id::text, p_personel,
    jsonb_build_object('adSoyad', v_ad, 'tutar', v_tutar)
  );

  return siparis_json(v_id);
end $$;

-- ── Hızlı tahsilat / iade ────────────────────────────────────────────
create or replace function siparis_odeme_ekle(p_id uuid, p jsonb, p_personel text default '')
returns jsonb language plpgsql as $$
declare v_odeme uuid;
begin
  if aktif_rol() is null then raise exception 'Yetkisiz.'; end if;
  if aktif_rol() = 'magaza' and btrim(coalesce(p_personel, '')) = '' then
    raise exception 'İşlemi yapan satış personelini seçin.';
  end if;
  if coalesce((p->>'tutar')::numeric, 0) <= 0 then
    raise exception 'Tutar sıfırdan büyük olmalı.';
  end if;
  perform 1 from siparisler where id = p_id;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;

  insert into odemeler (siparis_id, tarih, tutar, yontem, banka, taksit, tip, olusturan_personel)
  values (
    p_id, coalesce(nullif(p->>'tarih', '')::date, current_date), (p->>'tutar')::numeric,
    coalesce(nullif(p->>'yontem', '')::odeme_yontemi, 'nakit'),
    coalesce(p->>'banka', ''), coalesce(p->>'taksit', ''),
    coalesce(nullif(p->>'tip', '')::odeme_tipi, 'tahsilat'), coalesce(p_personel, '')
  ) returning id into v_odeme;

  perform log_ekle(
    case when coalesce(p->>'tip', '') = 'iade' then 'SIPARIS_IADE' else 'SIPARIS_TAHSILAT' end,
    'odemeler', v_odeme::text, p_personel, p
  );
  return siparis_json(p_id);
end $$;

-- ── Durum / çöp kutusu ───────────────────────────────────────────────
create or replace function siparis_durum_guncelle(p_id uuid, p_durum text, p_personel text default '')
returns jsonb language plpgsql as $$
begin
  if aktif_rol() is null then raise exception 'Yetkisiz.'; end if;
  update siparisler set durum = p_durum::siparis_durumu where id = p_id;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;
  perform log_ekle('SIPARIS_DURUM', 'siparisler', p_id::text, p_personel,
                   jsonb_build_object('durum', p_durum));
  return siparis_json(p_id);
end $$;

create or replace function siparis_sil(p_id uuid, p_personel text default '')
returns jsonb language plpgsql as $$
begin
  update siparisler set silindi = true where id = p_id;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;
  perform log_ekle('SIPARIS_SIL', 'siparisler', p_id::text, p_personel);
  return siparis_json(p_id);
end $$;

create or replace function siparis_geri_al(p_id uuid, p_personel text default '')
returns jsonb language plpgsql as $$
begin
  update siparisler set silindi = false where id = p_id;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;
  perform log_ekle('SIPARIS_GERI_AL', 'siparisler', p_id::text, p_personel);
  return siparis_json(p_id);
end $$;

/* Kalıcı silme: RLS gereği yalnızca muhasebe/yönetici. */
create or replace function siparis_kalici_sil(p_id uuid)
returns boolean language plpgsql as $$
begin
  delete from siparisler where id = p_id;
  if not found then return false; end if;
  perform log_ekle('SIPARIS_KALICI_SIL', 'siparisler', p_id::text);
  return true;
end $$;

/* Çöpte 3 günden uzun bekleyenleri kalıcı siler. */
create or replace function cop_temizle()
returns integer language plpgsql as $$
declare v_sayi integer;
begin
  delete from siparisler
   where silindi and silinme_tarihi is not null
     and silinme_tarihi < current_date - 3;
  get diagnostics v_sayi = row_count;
  if v_sayi > 0 then
    perform log_ekle('COP_TEMIZLE', 'siparisler', '', '',
                     jsonb_build_object('silinen', v_sayi));
  end if;
  return v_sayi;
end $$;

-- ── Ayar paketi ──────────────────────────────────────────────────────
create or replace function ayar_paketi()
returns jsonb language plpgsql stable as $$
declare
  v_ham    jsonb;
  v_finans boolean := finans_mi();
  v_paket  jsonb;
begin
  select coalesce(jsonb_object_agg(anahtar, deger), '{}'::jsonb) into v_ham from ayarlar;

  v_paket := jsonb_build_object(
    'hesaplar', (select coalesce(jsonb_agg(ad order by sira, ad), '[]'::jsonb)
                   from hesaplar where aktif),
    'bankalar', to_jsonb(liste_ayristir(v_ham->>'bankalar')),
    'taksitler', to_jsonb(liste_ayristir(v_ham->>'taksitler')),
    'kkKomisyon', oran_ayristir(v_ham->>'kk_komisyon'),
    'personelPrim', coalesce(replace(coalesce(v_ham->>'personel_prim', '0'), ',', '.')::numeric, 0),
    'masrafKalemleri', to_jsonb(liste_ayristir(v_ham->>'magaza_masraf_kalemleri')),
    'masrafAnaKategori', coalesce(nullif(v_ham->>'magaza_masraf_ana_kategori', ''), 'Masraflar'),
    'nakitHesap', coalesce(nullif(v_ham->>'nakit_hesap', ''), 'Nakit Kasa'),
    'siparisNoOnEk', coalesce((select kod from magazalar where id = varsayilan_magaza()), 'DK'),
    'kasaEntegrasyon', true
  );

  if v_finans then
    v_paket := v_paket || jsonb_build_object(
      'borcHesaplari', (select coalesce(jsonb_agg(ad order by ad), '[]'::jsonb)
                          from hesaplar where aktif and tip = 'kredi'),
      'acilisKasa', coalesce(replace(coalesce(v_ham->>'acilis_kasa', '0'), ',', '.')::numeric, 0),
      'acilisTarih', coalesce(v_ham->>'acilis_tarih', ''),
      'acilisBorc', coalesce(replace(coalesce(v_ham->>'acilis_borc', '0'), ',', '.')::numeric, 0),
      'ham', v_ham
    );
  else
    v_paket := v_paket || jsonb_build_object('ham', '{}'::jsonb);
  end if;
  return v_paket;
end $$;

-- ── Tüm veri (tek çağrı) ─────────────────────────────────────────────
/*
 * Arayüzün açılışta ihtiyaç duyduğu her şey. Finansal veri (kasa
 * hareketleri, cari, banka, tekrarlayan, kasa kategorileri) yalnızca
 * yönetici/muhasebe rolüne gider; RLS de ayrıca kapıyı tutar.
 */
create or replace function tum_veri()
returns jsonb language plpgsql stable as $$
declare
  v_finans boolean := finans_mi();
  v_rol    rol_tipi := aktif_rol();
  v_out    jsonb;
begin
  if v_rol is null then raise exception 'Oturum geçersiz veya hesap pasif.'; end if;

  v_out := jsonb_build_object(
    'kullanici', jsonb_build_object(
      'email', coalesce(auth.jwt() ->> 'email', ''),
      'ad', aktif_ad(),
      'rol', v_rol
    ),
    'ayar', ayar_paketi(),
    'personel', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ad', ad, 'aktif', aktif, 'primMuaf', prim_muaf, 'notu', ''
      ) order by sira, ad), '[]'::jsonb)
      from personel where (v_finans or aktif)),
    'urunKategorileri', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ad', ad, 'kdv', kdv, 'ikon', ikon, 'sira', sira
      ) order by sira, ad), '[]'::jsonb)
      from urun_kategorileri where aktif),
    'markalar', (
      select coalesce(jsonb_object_agg(kategori, markalar), '{}'::jsonb) from (
        select k.ad as kategori,
               jsonb_agg(m.ad order by m.ad) as markalar
        from markalar m join urun_kategorileri k on k.id = m.kategori_id
        where m.aktif group by k.ad
      ) x),
    'siparis', (
      select coalesce(jsonb_agg(siparis_json(s.id) order by s.siparis_tarihi desc, s.no desc),
                      '[]'::jsonb)
      from siparisler s),
    'musteriler', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'adSoyad', ad_soyad, 'telefon', telefon, 'eposta', eposta,
        'tcVergi', tc_vergi, 'sonRecete', son_recete, 'notu', notu
      ) order by ad_soyad), '[]'::jsonb)
      from musteriler),
    'hedefler', (
      select coalesce(jsonb_object_agg(ay, jsonb_build_object('hedef', hedef, 'notu', notu)),
                      '{}'::jsonb)
      from hedefler),
    'masraflar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'tarih', to_char(tarih, 'YYYY-MM-DD'), 'kalem', kalem, 'tutar', tutar,
        'hesap', hesap, 'aciklama', aciklama, 'kaydeden', kaydeden
      ) order by tarih desc), '[]'::jsonb)
      from v_magaza_masraflari),
    'hareketler', '[]'::jsonb,
    'cari', '[]'::jsonb,
    'banka', '[]'::jsonb,
    'tekrar', '[]'::jsonb,
    'kasaKategorileri', '[]'::jsonb
  );

  if not v_finans then return v_out; end if;

  return v_out || jsonb_build_object(
    'hareketler', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'tarih', to_char(h.tarih, 'YYYY-MM-DD'), 'yon', h.yon,
        'ana', h.ana_kategori, 'alt', h.alt_kategori, 'tutar', h.tutar,
        'hesap', hs.ad, 'aciklama', h.aciklama, 'kaydeden', h.kaydeden,
        'kaynak', h.kaynak, 'kaynakId', coalesce(h.odeme_id::text, '')
      ) order by h.tarih desc), '[]'::jsonb)
      from hareketler h join hesaplar hs on hs.id = h.hesap_id
      where not h.silindi),
    'cari', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tedarikci', tedarikci, 'ay', ay, 'planlanan', planlanan, 'notu', notu
      ) order by ay desc, tedarikci), '[]'::jsonb)
      from cari_plan),
    'banka', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tarih', to_char(b.tarih, 'YYYY-MM-DD'), 'hesap', hs.ad,
        'bakiye', b.bakiye, 'notu', b.notu
      ) order by b.tarih desc), '[]'::jsonb)
      from banka_dogrulama b join hesaplar hs on hs.id = b.hesap_id),
    'tekrar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ad', t.ad, 'ana', t.ana, 'alt', t.alt, 'tutar', t.tutar, 'gun', t.gun,
        'hesap', coalesce(hs.ad, ''), 'yon', t.yon, 'aktif', t.aktif
      ) order by t.gun, t.ad), '[]'::jsonb)
      from tekrarlayan t left join hesaplar hs on hs.id = t.hesap_id),
    'kasaKategorileri', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ad', ana, 'yon', yon, 'bolum', bolum, 'alt', altlar
      ) order by sira, ana), '[]'::jsonb)
      from (
        select ana, min(sira) as sira,
               (array_agg(yon))[1] as yon, (array_agg(bolum))[1] as bolum,
               coalesce(jsonb_agg(alt order by alt) filter (where alt <> ''), '[]'::jsonb) as altlar
        from kasa_kategorileri group by ana
      ) k)
  );
end $$;

-- ── Kasa yazma uçları (finans) ───────────────────────────────────────
create or replace function hareket_kaydet(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id    uuid;
  v_hesap uuid;
  v_yon   hareket_yonu := (p->>'yon')::hareket_yonu;
begin
  /* İstemci yeni kayıt için uuid olmayan geçici id üretebilir */
  begin
    v_id := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  exception when others then v_id := null;
  end;
  if not finans_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if coalesce((p->>'tutar')::numeric, 0) <= 0 then
    raise exception 'Tutar sıfırdan büyük olmalı.';
  end if;
  if btrim(coalesce(p->>'ana', '')) = '' then raise exception 'Ana kategori gerekli.'; end if;

  select id into v_hesap from hesaplar where lower(ad) = lower(btrim(coalesce(p->>'hesap', '')));
  if v_hesap is null then raise exception 'Hesap bulunamadı: %', p->>'hesap'; end if;

  /* Kategori çifti yoksa eklenir. Doğrudan insert: bu fonksiyon security
     INVOKER olduğu için kasa_kategorileri RLS politikası geçerli kalır
     (yalnızca finans rolü kategori açabilir). */
  insert into kasa_kategorileri (ana, alt, yon, bolum, sira)
  values (btrim(p->>'ana'), coalesce(btrim(p->>'alt'), ''), v_yon, 'OP', 999)
  on conflict (ana, alt) do nothing;

  if v_id is not null then
    update hareketler set
      tarih = (p->>'tarih')::date, yon = v_yon, ana_kategori = p->>'ana',
      alt_kategori = coalesce(p->>'alt', ''), tutar = (p->>'tutar')::numeric,
      hesap_id = v_hesap, aciklama = coalesce(p->>'aciklama', '')
     where id = v_id and kaynak <> 'SIPARIS';
    if found then
      perform log_ekle('HAREKET_GUNCELLE', 'hareketler', v_id::text, '', p);
      return hareket_json(v_id);
    end if;
  end if;

  insert into hareketler (
    magaza_id, tarih, yon, ana_kategori, alt_kategori, tutar, hesap_id,
    aciklama, kaydeden, kaydeden_id, kaynak
  ) values (
    varsayilan_magaza(), coalesce(nullif(p->>'tarih', '')::date, current_date), v_yon,
    p->>'ana', coalesce(p->>'alt', ''), (p->>'tutar')::numeric, v_hesap,
    coalesce(p->>'aciklama', ''), aktif_ad(), auth.uid(), 'ELLE'
  ) returning id into v_id;

  perform log_ekle('HAREKET_EKLE', 'hareketler', v_id::text, '', p);
  return hareket_json(v_id);
end $$;

create or replace function hareket_json(p_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', h.id, 'tarih', to_char(h.tarih, 'YYYY-MM-DD'), 'yon', h.yon,
    'ana', h.ana_kategori, 'alt', h.alt_kategori, 'tutar', h.tutar,
    'hesap', hs.ad, 'aciklama', h.aciklama, 'kaydeden', h.kaydeden,
    'kaynak', h.kaynak, 'kaynakId', coalesce(h.odeme_id::text, '')
  )
  from hareketler h join hesaplar hs on hs.id = h.hesap_id where h.id = p_id
$$;

create or replace function hareket_sil(p_id uuid)
returns boolean language plpgsql as $$
begin
  update hareketler set silindi = true where id = p_id and kaynak <> 'SIPARIS';
  if not found then return false; end if;
  perform log_ekle('HAREKET_SIL', 'hareketler', p_id::text);
  return true;
end $$;

create or replace function hedef_kaydet(p_ay text, p_hedef numeric, p_notu text default '')
returns boolean language plpgsql as $$
begin
  if p_ay !~ '^\d{4}-\d{2}$' then raise exception 'Ay YYYY-MM biçiminde olmalı.'; end if;
  insert into hedefler (magaza_id, ay, hedef, notu)
  values (varsayilan_magaza(), p_ay, coalesce(p_hedef, 0), coalesce(p_notu, ''))
  on conflict (magaza_id, ay) do update
    set hedef = excluded.hedef, notu = excluded.notu;
  perform log_ekle('HEDEF_KAYDET', 'hedefler', p_ay, '',
                   jsonb_build_object('hedef', p_hedef));
  return true;
end $$;

create or replace function cari_kaydet(p_tedarikci text, p_ay text, p_planlanan numeric, p_notu text default '')
returns boolean language plpgsql as $$
begin
  if btrim(coalesce(p_tedarikci, '')) = '' then raise exception 'Tedarikçi gerekli.'; end if;
  if p_ay !~ '^\d{4}-\d{2}$' then raise exception 'Ay YYYY-MM biçiminde olmalı.'; end if;
  insert into cari_plan (tedarikci, ay, planlanan, notu)
  values (btrim(p_tedarikci), p_ay, coalesce(p_planlanan, 0), coalesce(p_notu, ''))
  on conflict (tedarikci, ay) do update
    set planlanan = excluded.planlanan, notu = excluded.notu;
  return true;
end $$;

create or replace function banka_kaydet(p_tarih date, p_satirlar jsonb)
returns boolean language plpgsql as $$
declare v_s jsonb; v_hesap uuid;
begin
  for v_s in select * from jsonb_array_elements(coalesce(p_satirlar, '[]'::jsonb)) loop
    select id into v_hesap from hesaplar where lower(ad) = lower(btrim(coalesce(v_s->>'hesap', '')));
    if v_hesap is null then continue; end if;
    insert into banka_dogrulama (tarih, hesap_id, bakiye, notu)
    values (coalesce(p_tarih, current_date), v_hesap,
            coalesce((v_s->>'bakiye')::numeric, 0), coalesce(v_s->>'notu', ''))
    on conflict (tarih, hesap_id) do update
      set bakiye = excluded.bakiye, notu = excluded.notu;
  end loop;
  return true;
end $$;

create or replace function tekrar_kaydet(p_liste jsonb)
returns boolean language plpgsql as $$
declare v_s jsonb; v_hesap uuid;
begin
  if not finans_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  delete from tekrarlayan;
  for v_s in select * from jsonb_array_elements(coalesce(p_liste, '[]'::jsonb)) loop
    if btrim(coalesce(v_s->>'ad', '')) = '' then continue; end if;
    select id into v_hesap from hesaplar where lower(ad) = lower(btrim(coalesce(v_s->>'hesap', '')));
    insert into tekrarlayan (ad, ana, alt, tutar, gun, hesap_id, yon, aktif)
    values (
      btrim(v_s->>'ad'), coalesce(v_s->>'ana', ''), coalesce(v_s->>'alt', ''),
      coalesce((v_s->>'tutar')::numeric, 0),
      least(greatest(coalesce((v_s->>'gun')::integer, 1), 1), 31),
      v_hesap, coalesce(nullif(v_s->>'yon', '')::hareket_yonu, 'GIDER'),
      coalesce((v_s->>'aktif')::boolean, true)
    );
  end loop;
  return true;
end $$;

create or replace function personel_kaydet(p_liste jsonb)
returns boolean language plpgsql as $$
declare v_s jsonb; v_magaza uuid := varsayilan_magaza();
begin
  if not finans_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  delete from personel where magaza_id = v_magaza;
  for v_s in select * from jsonb_array_elements(coalesce(p_liste, '[]'::jsonb)) loop
    if btrim(coalesce(v_s->>'ad', '')) = '' then continue; end if;
    insert into personel (magaza_id, ad, aktif, prim_muaf)
    values (v_magaza, btrim(v_s->>'ad'),
            coalesce((v_s->>'aktif')::boolean, true),
            coalesce((v_s->>'primMuaf')::boolean, false))
    on conflict (magaza_id, ad) do update
      set aktif = excluded.aktif, prim_muaf = excluded.prim_muaf;
  end loop;
  perform log_ekle('PERSONEL_KAYDET', 'personel', '', '');
  return true;
end $$;

create or replace function ayar_guncelle(p_anahtar text, p_deger text)
returns boolean language plpgsql as $$
begin
  insert into ayarlar (anahtar, deger) values (btrim(p_anahtar), coalesce(p_deger, ''))
  on conflict (anahtar) do update set deger = excluded.deger;
  perform log_ekle('AYAR_GUNCELLE', 'ayarlar', btrim(p_anahtar), '',
                   jsonb_build_object('deger', p_deger));
  return true;
end $$;

create or replace function log_listele(p_limit integer default 200)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'zaman', to_char(zaman, 'YYYY-MM-DD HH24:MI'), 'kullanici', kullanici_eposta,
    'personel', personel, 'islem', islem, 'kayitTipi', tablo, 'kayitId', kayit_id,
    'detay', detay
  ) order by zaman desc), '[]'::jsonb)
  from (select * from log order by zaman desc limit greatest(coalesce(p_limit, 200), 1)) x
$$;

-- ── Yetkiler ─────────────────────────────────────────────────────────
revoke execute on function liste_ayristir(text) from public;
revoke execute on function oran_ayristir(text) from public;
revoke execute on function log_ekle(text, text, text, text, jsonb) from public;
revoke execute on function varsayilan_magaza() from public;
revoke execute on function personel_sagla(text) from public;
revoke execute on function telefon_sadelestir(text) from public;
revoke execute on function musteri_upsert(jsonb) from public;
revoke execute on function siparis_json(uuid) from public;
revoke execute on function hareket_json(uuid) from public;
revoke execute on function siparis_kaydet(jsonb, text) from public;
revoke execute on function siparis_odeme_ekle(uuid, jsonb, text) from public;
revoke execute on function siparis_durum_guncelle(uuid, text, text) from public;
revoke execute on function siparis_sil(uuid, text) from public;
revoke execute on function siparis_geri_al(uuid, text) from public;
revoke execute on function siparis_kalici_sil(uuid) from public;
revoke execute on function cop_temizle() from public;
revoke execute on function ayar_paketi() from public;
revoke execute on function tum_veri() from public;
revoke execute on function musteri_guncelle(jsonb, text) from public;
revoke execute on function hareket_kaydet(jsonb) from public;
revoke execute on function hareket_sil(uuid) from public;
revoke execute on function hedef_kaydet(text, numeric, text) from public;
revoke execute on function cari_kaydet(text, text, numeric, text) from public;
revoke execute on function banka_kaydet(date, jsonb) from public;
revoke execute on function tekrar_kaydet(jsonb) from public;
revoke execute on function personel_kaydet(jsonb) from public;
revoke execute on function ayar_guncelle(text, text) from public;
revoke execute on function log_listele(integer) from public;

grant execute on function log_ekle(text, text, text, text, jsonb) to authenticated;
grant execute on function varsayilan_magaza() to authenticated;
grant execute on function personel_sagla(text) to authenticated;
grant execute on function liste_ayristir(text) to authenticated;
grant execute on function oran_ayristir(text) to authenticated;
grant execute on function telefon_sadelestir(text) to authenticated;
grant execute on function musteri_upsert(jsonb) to authenticated;
grant execute on function musteri_guncelle(jsonb, text) to authenticated;
grant execute on function siparis_json(uuid) to authenticated;
grant execute on function hareket_json(uuid) to authenticated;
grant execute on function siparis_kaydet(jsonb, text) to authenticated;
grant execute on function siparis_odeme_ekle(uuid, jsonb, text) to authenticated;
grant execute on function siparis_durum_guncelle(uuid, text, text) to authenticated;
grant execute on function siparis_sil(uuid, text) to authenticated;
grant execute on function siparis_geri_al(uuid, text) to authenticated;
grant execute on function siparis_kalici_sil(uuid) to authenticated;
grant execute on function cop_temizle() to authenticated;
grant execute on function ayar_paketi() to authenticated;
grant execute on function tum_veri() to authenticated;
grant execute on function hareket_kaydet(jsonb) to authenticated;
grant execute on function hareket_sil(uuid) to authenticated;
grant execute on function hedef_kaydet(text, numeric, text) to authenticated;
grant execute on function cari_kaydet(text, text, numeric, text) to authenticated;
grant execute on function banka_kaydet(date, jsonb) to authenticated;
grant execute on function tekrar_kaydet(jsonb) to authenticated;
grant execute on function personel_kaydet(jsonb) to authenticated;
grant execute on function ayar_guncelle(text, text) to authenticated;
grant execute on function log_listele(integer) to authenticated;
