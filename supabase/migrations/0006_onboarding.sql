-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0006 — Kayıt (onboarding), abonelik ve platform
--
-- Bir optik işletmesi kendi kendine kaydolur:
--   1. Tarayıcı auth.signUp ile hesap açar
--   2. isletme_olustur(...) işletmeyi + ilk şubeyi + yönetici (kurucu)
--      profilini kurar
--      ve o işletmeye ait varsayılan listeleri yükler
--   3. 14 günlük deneme başlar
--
-- Varsayılan listeler GLOBAL DEĞİL, işletme başınadır: her abone kendi
-- kategorisini, markasını, oranını düzenler; biri diğerini etkilemez.
-- ═══════════════════════════════════════════════════════════════════════

/* "Damlakuz Optik" → "damlakuz-optik" (Türkçe karakterler dahil) */
create or replace function slug_uret(p_ad text)
returns text language plpgsql immutable as $$
declare v text;
begin
  v := translate(coalesce(p_ad, ''), 'ĞÜŞİÖÇğüşıöç', 'GUSIOCgusioc');
  v := lower(v);
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := btrim(v, '-');
  if length(v) < 2 then v := 'isletme'; end if;
  return left(v, 40);
end $$;

/*
 * Sipariş numarası ön eki. Varsayılan ürün ön eki 'KUZ' — sipariş formunda
 * işletmeyi logosu temsil eder, numara biçimi KUZ-10-26-0001 olarak sabittir.
 * Çok şubeli işletmeler ikinci şubeye farklı bir kod verir (şube başına
 * benzersiz olmak zorunda: her şubenin kendi sayacı var).
 */
create or replace function sube_kodu_uret(p_ad text)
returns text language sql immutable as $$
  select 'KUZ'
$$;

/* Yeni işletmeye varsayılan ayar, kategori, marka ve kasa ağacını yükler. */
create or replace function isletme_varsayilanlari(p_isletme uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into ayarlar (isletme_id, anahtar, deger, aciklama) values
    (p_isletme, 'nakit_hesap', 'Nakit Kasa', 'Nakit tahsilat/masrafların işlendiği hesap'),
    (p_isletme, 'acilis_kasa', '0', 'Sistem başlangıç kasası'),
    (p_isletme, 'acilis_borc', '0', 'Açılıştaki KK/KMH toplam borcu'),
    (p_isletme, 'bankalar',
     'Akbank, QNB, Garanti, İş Bankası, Yapı Kredi, Ziraat, Halkbank, TEB, Vakıfbank',
     'Kredi kartı tahsilatında seçilebilecek bankalar'),
    (p_isletme, 'taksitler', 'Tek çekim, 2 Taksit, 3 Taksit, 4 Taksit, 5 Taksit, 6 Taksit, Diğer',
     'Kredi kartı taksit seçenekleri'),
    (p_isletme, 'kk_komisyon',
     'Tek çekim:3.5, 2 Taksit:7, 3 Taksit:9, 4 Taksit:10.69, 5 Taksit:12.49, 6 Taksit:14.49, Diğer:14.49',
     'Taksit bazlı banka komisyon oranları (%) — kendi sözleşmenize göre düzenleyin'),
    (p_isletme, 'personel_prim', '0', 'Tahsilat üzerinden personel prim oranı (%)'),
    (p_isletme, 'magaza_masraf_kalemleri',
     'Mağaza Günlük Kasa Masrafı, Temizlik / Sarf, Bakım / Onarım, Kargo, Yemek, Diğer Masraf',
     'Mağazanın girebileceği masraf kalemleri'),
    (p_isletme, 'magaza_masraf_ana_kategori', 'Masraflar',
     'Mağaza masraflarının yazıldığı ana kategori'),
    (p_isletme, 'erp_aktif', 'hayir', 'Harici ERP aktarım işareti gösterilsin mi (evet/hayır)'),
    (p_isletme, 'erp_etiket', 'ERP''ye İşlendi', 'ERP işaretinin ekrandaki adı')
  on conflict (isletme_id, anahtar) do nothing;

  insert into hesaplar (isletme_id, ad, tip, sira) values (p_isletme, 'Nakit Kasa', 'kasa', 1)
  on conflict (isletme_id, ad) do nothing;

  insert into urun_kategorileri (isletme_id, ad, kdv, ikon, sira)
  select p_isletme, k.ad, k.kdv, k.ikon, k.sira from (values
    ('Optik Çerçeve', 10, '👓', 1), ('Optik Cam', 10, '⭕', 2),
    ('Güneş Gözlüğü', 20, '🕶️', 3), ('Lens', 10, '👁️', 4),
    ('Solüsyon', 10, '💧', 5), ('Tamir/Aksesuar', 20, '🔧', 6),
    ('Optik Yedek Parça', 10, '⚙️', 7), ('Güneş Yedek Parça', 20, '🛠️', 8)
  ) as k(ad, kdv, ikon, sira)
  on conflict (isletme_id, ad) do nothing;

  insert into markalar (isletme_id, kategori_id, ad)
  select p_isletme, k.id, m.ad
  from (values
    ('Optik Cam', 'Seiko'), ('Optik Cam', 'Essilor'), ('Optik Cam', 'Optiswiss'),
    ('Optik Cam', 'Zeiss'), ('Optik Cam', 'Hoya'),
    ('Optik Çerçeve', 'Ray-Ban'), ('Optik Çerçeve', 'Vogue'), ('Optik Çerçeve', 'Emporio Armani'),
    ('Güneş Gözlüğü', 'Ray-Ban'), ('Güneş Gözlüğü', 'Oakley'), ('Güneş Gözlüğü', 'Persol'),
    ('Lens', 'Acuvue'), ('Lens', 'Bausch + Lomb'), ('Lens', 'Alcon'),
    ('Solüsyon', 'Renu'), ('Solüsyon', 'Opti-Free')
  ) as m(kategori, ad)
  join urun_kategorileri k on k.isletme_id = p_isletme and k.ad = m.kategori
  on conflict (kategori_id, lower(ad)) do nothing;

  insert into kasa_kategorileri (isletme_id, ana, alt, yon, bolum, sira)
  select p_isletme, k.ana, alt, k.yon::hareket_yonu, k.bolum::kategori_bolumu, k.sira
  from (values
    ('Nakit Satış', array['Mağaza Nakit','Merkez Kasa','Diğer Nakit'], 'GELIR', 'OP', 1),
    ('POS / Kredi Kartı Satışı', array['Diğer POS'], 'GELIR', 'OP', 2),
    ('Satış İadesi', array['Mağaza Nakit','Diğer POS'], 'GIDER', 'OP', 3),
    ('Mal Alış', array['Optik Çerçeve','Optik Cam','Güneş Gözlüğü','Lens','Solüsyon','Diğer Mal Alış'], 'GIDER', 'OP', 4),
    ('Hizmet Giderleri', array['Muhasebe / Mali Müşavir','Yazılım / Abonelik','Kargo / Reklam','Sigorta','Diğer Hizmet'], 'GIDER', 'OP', 5),
    ('Personel & SGK', array['Maaş','SGK Primi','Prim / İkramiye','Yemek','Diğer Personel'], 'GIDER', 'OP', 6),
    ('Kira & Aidat', array['Kira','Aidat'], 'GIDER', 'OP', 7),
    ('Fatura & Abonelik', array['Elektrik','Su / Doğalgaz','Telefon / İnternet'], 'GIDER', 'OP', 8),
    ('Masraflar', array['Mağaza Günlük Kasa Masrafı','Temizlik / Sarf','Bakım / Onarım','Kargo','Yemek','Diğer Masraf'], 'GIDER', 'OP', 9),
    ('Banka & Komisyon', array['Kredi Kartı Komisyonu','Banka Masrafı','POS Ücreti'], 'GIDER', 'OP', 10),
    ('Vergi', array['KDV','Stopaj','Geçici / Kurumlar Vergisi','Diğer Vergi'], 'GIDER', 'OP', 11),
    ('Ortak / Sermaye Girişi', array['Ortak Girişi'], 'GELIR', 'FD', 12),
    ('Kredi / KMH Kullanımı', array['Banka Kredisi','Kredi Kartı / KMH'], 'GELIR', 'FD', 13),
    ('Diğer Faaliyet Dışı Gelir', array['Diğer Gelir'], 'GELIR', 'FD', 14),
    ('Ortak Çekiş', array['Ortak Çekişi'], 'GIDER', 'FD', 15),
    ('Kredi & Kart Ödemeleri', array['Kredi Anapara / Faiz','Kredi Kartı Ödemesi'], 'GIDER', 'FD', 16),
    ('Yatırım / Demirbaş', array['Demirbaş / Ekipman','Tadilat / Dekorasyon'], 'GIDER', 'FD', 17),
    ('Diğer Faaliyet Dışı Gider', array['Diğer Gider'], 'GIDER', 'FD', 18)
  ) as k(ana, altlar, yon, bolum, sira)
  cross join unnest(k.altlar) as alt
  on conflict (isletme_id, ana, alt) do nothing;
end $$;

/*
 * Kayıt: oturum açmış ama henüz bir işletmeye bağlı OLMAYAN kullanıcı
 * kendi işletmesini kurar ve sahibi olur.
 */
create or replace function isletme_olustur(
  p_isletme_ad text,
  p_ad_soyad text default '',
  p_telefon text default '',
  p_sube_ad text default '',
  p_sube_kod text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_eposta  text := coalesce(auth.jwt() ->> 'email', '');
  v_slug    text;
  v_son     integer := 0;
  v_isletme uuid;
  v_magaza  uuid;
  v_gun     integer;
begin
  if v_uid is null then raise exception 'Önce hesap açmanız gerekir.'; end if;
  perform 1 from profiller where id = v_uid and isletme_id is not null;
  if found then raise exception 'Hesabınız zaten bir işletmeye bağlı.'; end if;
  if btrim(coalesce(p_isletme_ad, '')) = '' then raise exception 'İşletme adı gerekli.'; end if;

  /* Benzersiz slug */
  v_slug := slug_uret(p_isletme_ad);
  while exists (select 1 from isletmeler where slug = v_slug || case when v_son = 0 then ''
                                                                     else '-' || v_son end) loop
    v_son := v_son + 1;
  end loop;
  if v_son > 0 then v_slug := v_slug || '-' || v_son; end if;

  select coalesce((ozellikler->>'deneme_gun')::integer, 14) into v_gun
  from planlar where kod = 'deneme';

  insert into isletmeler (ad, slug, eposta, telefon, plan_kod, durum, deneme_bitis)
  values (btrim(p_isletme_ad), v_slug, v_eposta, coalesce(btrim(p_telefon), ''),
          'deneme', 'deneme', current_date + coalesce(v_gun, 14))
  returning id into v_isletme;

  insert into magazalar (isletme_id, ad, kod)
  values (v_isletme,
          coalesce(nullif(btrim(p_sube_ad), ''), btrim(p_isletme_ad)),
          upper(coalesce(nullif(regexp_replace(btrim(p_sube_kod), '[^A-Za-z0-9]', '', 'g'), ''),
                         sube_kodu_uret(p_isletme_ad))))
  returning id into v_magaza;

  insert into profiller (id, isletme_id, magaza_id, ad, rol, kurucu, eposta)
  values (v_uid, v_isletme, null,
          coalesce(nullif(btrim(p_ad_soyad), ''), split_part(v_eposta, '@', 1)),
          'yonetici', true, lower(v_eposta))
  on conflict (id) do update
    set isletme_id = excluded.isletme_id, ad = excluded.ad, rol = 'yonetici',
        kurucu = true, eposta = excluded.eposta, aktif = true;

  perform isletme_varsayilanlari(v_isletme);

  insert into abonelik_hareketleri (isletme_id, tip, plan_kod, donem_bas, donem_bitis, detay)
  values (v_isletme, 'deneme_basladi', 'deneme', current_date,
          current_date + coalesce(v_gun, 14),
          jsonb_build_object('eposta', v_eposta));

  insert into log (isletme_id, kullanici_id, islem, tablo, kayit_id, detay)
  values (v_isletme, v_uid, 'ISLETME_OLUSTUR', 'isletmeler', v_isletme::text,
          jsonb_build_object('ad', p_isletme_ad, 'slug', v_slug));

  return abonelik_ozeti();
end $$;

-- ══ Platform (Kuzmos ekibi) ═══════════════════════════════════════════

/*
 * Abonelik durumunu değiştirir. Elle tahsilat (havale/EFT) veya ödeme
 * sağlayıcısının webhook'u bunu çağırır. Kiracı kendi aboneliğini
 * değiştiremez.
 */
create or replace function abonelik_guncelle(
  p_isletme uuid, p_plan text, p_durum text, p_bitis date default null,
  p_tutar numeric default null, p_saglayici text default 'elle', p_ref text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_eski text;
begin
  if not platform_mi() then raise exception 'Bu işlem yalnızca platform yöneticisine açıktır.'; end if;
  select plan_kod into v_eski from isletmeler where id = p_isletme;
  if v_eski is null then raise exception 'İşletme bulunamadı.'; end if;

  update isletmeler set
    plan_kod = coalesce(nullif(btrim(p_plan), ''), plan_kod),
    durum = coalesce(nullif(btrim(p_durum), ''), durum::text)::abonelik_durumu,
    abonelik_bitis = coalesce(p_bitis, abonelik_bitis)
   where id = p_isletme;

  insert into abonelik_hareketleri (
    isletme_id, tip, plan_kod, tutar, saglayici, saglayici_ref, donem_bas, donem_bitis, detay
  ) values (
    p_isletme, case when p_tutar is not null then 'odeme' else 'plan_degisti' end,
    coalesce(nullif(btrim(p_plan), ''), v_eski), p_tutar, coalesce(p_saglayici, 'elle'),
    coalesce(p_ref, ''), current_date, p_bitis,
    jsonb_build_object('durum', p_durum, 'eskiPlan', v_eski)
  );

  return (select jsonb_build_object('id', i.id, 'ad', i.ad, 'plan', i.plan_kod,
                                    'durum', i.durum,
                                    'abonelikBitis', coalesce(to_char(i.abonelik_bitis,'YYYY-MM-DD'), ''))
            from isletmeler i where i.id = p_isletme);
end $$;

/*
 * Platform panosu: abone sayıları, plan dağılımı, denemesi bitenler ve
 * işletme başına KULLANIM SAYILARI. Kiracıların iş verisi (müşteri adı,
 * sipariş içeriği, tutarlar) buraya GİRMEZ.
 */
create or replace function platform_ozet()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not platform_mi() then raise exception 'Bu işlem yalnızca platform yöneticisine açıktır.'; end if;
  return jsonb_build_object(
    'toplamIsletme', (select count(*) from isletmeler),
    'durumDagilimi', (select coalesce(jsonb_object_agg(durum, n), '{}'::jsonb)
                        from (select durum, count(*) as n from isletmeler group by durum) x),
    'planDagilimi', (select coalesce(jsonb_object_agg(plan_kod, n), '{}'::jsonb)
                       from (select plan_kod, count(*) as n from isletmeler group by plan_kod) x),
    'denemesiBitenler', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'ad', ad, 'eposta', eposta, 'telefon', telefon,
        'denemeBitis', to_char(deneme_bitis, 'YYYY-MM-DD'),
        'kalanGun', deneme_bitis - current_date
      ) order by deneme_bitis), '[]'::jsonb)
      from isletmeler
      where durum = 'deneme' and deneme_bitis between current_date - 7 and current_date + 7),
    'isletmeler', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'ad', i.ad, 'slug', i.slug, 'plan', i.plan_kod, 'durum', i.durum,
        'olusturma', to_char(i.olusturma, 'YYYY-MM-DD'),
        'kullanici', (select count(*) from profiller p where p.isletme_id = i.id and p.aktif),
        'magaza', (select count(*) from magazalar m where m.isletme_id = i.id),
        'siparis', (select count(*) from siparisler s where s.isletme_id = i.id),
        'sonIslem', coalesce(to_char((select max(zaman) from log l where l.isletme_id = i.id),
                                     'YYYY-MM-DD HH24:MI'), '')
      ) order by i.olusturma desc), '[]'::jsonb)
      from isletmeler i)
  );
end $$;

/* Denemesi/aboneliği biten işletmeleri askıya alır (zamanlanmış görev). */
create or replace function abonelikleri_denetle()
returns integer language plpgsql security definer set search_path = public as $$
declare v_sayi integer;
begin
  update isletmeler set durum = 'askida'
   where durum = 'deneme' and deneme_bitis < current_date - 3;
  get diagnostics v_sayi = row_count;
  update isletmeler set durum = 'odeme_bekliyor'
   where durum = 'aktif' and abonelik_bitis is not null and abonelik_bitis < current_date;
  return v_sayi;
end $$;

revoke execute on function slug_uret(text), sube_kodu_uret(text),
  isletme_varsayilanlari(uuid), isletme_olustur(text, text, text, text, text),
  abonelik_guncelle(uuid, text, text, date, numeric, text, text),
  platform_ozet(), abonelikleri_denetle()
  from public, anon, authenticated;

/* Kayıt ve platform uçları: yalnızca oturum açmış kullanıcı çağırabilir;
   içlerindeki kontroller kimin ne yapabileceğini belirler. */
grant execute on function isletme_olustur(text, text, text, text, text),
  abonelik_guncelle(uuid, text, text, date, numeric, text, text), platform_ozet()
  to authenticated;
