-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0002 — Mantık (fonksiyonlar, trigger'lar, görünümler)
--
-- İki şeyi veritabanına taşır:
--   1. İş kuralları: sipariş no, toplamlar, teslim tarihi, sipariş→kasa
--      senkronu. Elle senkron kodu yok; "kasa tutmuyor" durumu yapısal
--      olarak imkânsız.
--   2. Kiracı güvenliği: isletme_id istemciden GELMEZ, trigger ile üst
--      kayıttan damgalanır. Böylece yanlış işletmeye veri yazılamaz.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Oturum ve kiracı bağlamı ─────────────────────────────────────────

create or replace function aktif_profil()
returns profiller language sql stable security definer set search_path = public as $$
  select p.* from profiller p where p.id = auth.uid() and p.aktif
$$;

create or replace function aktif_isletme()
returns uuid language sql stable security definer set search_path = public as $$
  select p.isletme_id from profiller p where p.id = auth.uid() and p.aktif
$$;

create or replace function aktif_rol()
returns rol_tipi language sql stable security definer set search_path = public as $$
  select p.rol from profiller p where p.id = auth.uid() and p.aktif
$$;

create or replace function aktif_magaza()
returns uuid language sql stable security definer set search_path = public as $$
  select p.magaza_id from profiller p where p.id = auth.uid() and p.aktif
$$;

create or replace function aktif_ad()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.ad, '') from profiller p where p.id = auth.uid()
$$;

/* İşletme kasasının tamamına ve raporlara erişen roller. */
create or replace function finans_mi()
returns boolean language sql stable as $$
  select coalesce(aktif_rol() in ('yonetici', 'finans'), false)
$$;

/* Kullanıcı, şube, işletme bilgisi ve abonelik yönetimi. */
create or replace function yonetici_mi()
returns boolean language sql stable as $$
  select coalesce(aktif_rol() = 'yonetici', false)
$$;

/* Şube düzeyinde yönetim: şube kasası özeti, hedef görünümü, personel listesi. */
create or replace function magaza_yonetimi_mi()
returns boolean language sql stable as $$
  select coalesce(aktif_rol() in ('yonetici', 'finans', 'magaza_muduru'), false)
$$;

/* Yalnızca kendi şubesinde çalışan roller. */
create or replace function sube_rolu_mu()
returns boolean language sql stable as $$
  select coalesce(aktif_rol() in ('magaza_muduru', 'personel'), false)
$$;

/* Kuzmos ekibi (platform). Kiracıların iş verisine erişimi yoktur. */
create or replace function platform_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_yoneticileri where id = auth.uid())
$$;

/* Satır kullanıcının işletmesine mi ait? */
create or replace function isletme_erisimi(p_isletme uuid)
returns boolean language sql stable as $$
  select p_isletme is not null and p_isletme = aktif_isletme()
$$;

/*
 * Şube erişimi: önce işletme, sonra rol.
 * Şube rolleri (magaza_muduru, personel) yalnızca kendi şubesini görür;
 * yonetici ve finans işletmenin tüm şubelerini görür.
 */
create or replace function magaza_erisimi(p_magaza uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from magazalar m, profiller p
     where m.id = p_magaza
       and p.id = auth.uid() and p.aktif
       and m.isletme_id = p.isletme_id
       and (p.rol not in ('magaza_muduru', 'personel') or p.magaza_id = m.id)
  )
$$;

/*
 * Abonelik durumu yazmaya izin veriyor mu?
 * Süresi dolan abonelik SALT OKUNUR olur: müşteri verisini görmeye ve
 * dışa aktarmaya devam eder, yeni kayıt giremez.
 */
create or replace function abonelik_yazabilir(p_isletme uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case i.durum
           when 'deneme' then i.deneme_bitis >= current_date
           when 'aktif' then coalesce(i.abonelik_bitis, current_date) >= current_date
           when 'odeme_bekliyor' then true     -- ödeme hatırlatma dönemi
           else false
         end
  from isletmeler i where i.id = p_isletme
$$;

create or replace function yazma_izni()
returns boolean language sql stable as $$
  select coalesce(abonelik_yazabilir(aktif_isletme()), false)
$$;

-- ── Ortak yardımcılar ────────────────────────────────────────────────

create or replace function guncelleme_damgala()
returns trigger language plpgsql as $$
begin
  new.guncelleme := now();
  return new;
end $$;

/*
 * isletme_id'yi üst kayıttan damgalar. İstemci bu alanı gönderemez;
 * gönderse de üzerine yazılır. Yanlış işletmeye yazma denemesi, damga
 * sonrası RLS politikasına takılır.
 */
create or replace function isletme_damgala()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_isletme uuid;
begin
  if tg_table_name in ('personel', 'musteriler', 'siparisler', 'hedefler') then
    select m.isletme_id into v_isletme from magazalar m where m.id = new.magaza_id;
  elsif tg_table_name = 'markalar' then
    select k.isletme_id into v_isletme from urun_kategorileri k where k.id = new.kategori_id;
  elsif tg_table_name = 'banka_dogrulama' then
    select h.isletme_id into v_isletme from hesaplar h where h.id = new.hesap_id;
  elsif tg_table_name = 'hareketler' then
    /* Koşulun İÇİNDE new.magaza_id'ye bakmıyoruz: plpgsql ifade kısa devre
       yapmaz, magaza_id sütunu olmayan tablolarda hata verirdi. */
    if new.magaza_id is not null then
      select m.isletme_id into v_isletme from magazalar m where m.id = new.magaza_id;
    end if;
  end if;

  /* Sıra önemli: üst kayıttan türetilen değer > oturumun işletmesi >
     istemcinin gönderdiği değer. Böylece istemci başka bir işletmenin
     id'sini göndererek veri sızdıramaz; platform/servis betikleri (oturum
     yok) ise açıkça verdikleri id ile çalışmaya devam eder. */
  new.isletme_id := coalesce(v_isletme, aktif_isletme(), new.isletme_id);
  if new.isletme_id is null then
    raise exception 'İşletme belirlenemedi (oturum veya üst kayıt eksik).';
  end if;
  return new;
end $$;

create trigger isletme_damga before insert on personel
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on musteriler
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on siparisler
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on hedefler
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on markalar
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on banka_dogrulama
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on hareketler
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on urun_kategorileri
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on hesaplar
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on kasa_kategorileri
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on cari_plan
for each row execute function isletme_damgala();
create trigger isletme_damga before insert on tekrarlayan
for each row execute function isletme_damgala();

create trigger guncelleme_damga before update on isletmeler
for each row execute function guncelleme_damgala();
create trigger guncelleme_damga before update on musteriler
for each row execute function guncelleme_damgala();
create trigger guncelleme_damga before update on hareketler
for each row execute function guncelleme_damgala();

/* Ayar okuma (işletme başına). */
create or replace function ayar_metin(p_isletme uuid, p_anahtar text, p_varsayilan text default '')
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(btrim(a.deger), '') from ayarlar a
      where a.isletme_id = p_isletme and a.anahtar = p_anahtar),
    p_varsayilan)
$$;

create or replace function ayar_sayi(p_isletme uuid, p_anahtar text, p_varsayilan numeric default 0)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  v := ayar_metin(p_isletme, p_anahtar, null);
  if v is null or btrim(v) = '' then return p_varsayilan; end if;
  begin
    return replace(btrim(v), ',', '.')::numeric;
  exception when others then return p_varsayilan;
  end;
end $$;

/* Hesap yoksa oluşturur (POS hesapları otomatik açılır). */
create or replace function hesap_sagla(p_isletme uuid, p_ad text, p_tip hesap_tipi default 'kasa')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_ad), '') = '' then raise exception 'Hesap adı boş olamaz.'; end if;
  select id into v_id from hesaplar
   where isletme_id = p_isletme and lower(ad) = lower(btrim(p_ad));
  if v_id is not null then return v_id; end if;
  insert into hesaplar (isletme_id, ad, tip) values (p_isletme, btrim(p_ad), p_tip)
  on conflict (isletme_id, ad) do update set aktif = true
  returning id into v_id;
  return v_id;
end $$;

create or replace function kasa_kategori_sagla(
  p_isletme uuid, p_ana text, p_alt text, p_yon hareket_yonu,
  p_bolum kategori_bolumu default 'OP'
) returns void language sql security definer set search_path = public as $$
  insert into kasa_kategorileri (isletme_id, ana, alt, yon, bolum, sira)
  values (p_isletme, btrim(p_ana), coalesce(btrim(p_alt), ''), p_yon, p_bolum, 999)
  on conflict (isletme_id, ana, alt) do nothing
$$;

/* Markayı kategorisiyle sağlar ("Diğer" ile elle yazılanlar). */
create or replace function marka_sagla(p_kategori text, p_marka text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_kat     uuid;
begin
  if v_isletme is null then return; end if;
  if coalesce(btrim(p_kategori), '') = '' or coalesce(btrim(p_marka), '') = '' then return; end if;

  select id into v_kat from urun_kategorileri
   where isletme_id = v_isletme and lower(ad) = lower(btrim(p_kategori));
  if v_kat is null then
    insert into urun_kategorileri (isletme_id, ad, sira) values (v_isletme, btrim(p_kategori), 999)
    on conflict (isletme_id, ad) do update set aktif = true
    returning id into v_kat;
  end if;

  insert into markalar (isletme_id, kategori_id, ad) values (v_isletme, v_kat, btrim(p_marka))
  on conflict (kategori_id, lower(ad)) do nothing;
end $$;

/* Serbest girilen satış personelini listeye ekler. */
create or replace function personel_sagla(p_ad text, p_magaza uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_magaza uuid;
begin
  if btrim(coalesce(p_ad, '')) = '' or aktif_rol() is null then return; end if;
  v_magaza := coalesce(p_magaza, aktif_magaza(),
    (select id from magazalar where isletme_id = aktif_isletme() and aktif
      order by olusturma limit 1));
  if v_magaza is null then return; end if;
  insert into personel (magaza_id, ad) values (v_magaza, btrim(p_ad))
  on conflict (magaza_id, ad) do nothing;
end $$;

/* Kullanıcının çalıştığı şube; finans rollerinde işletmenin ilk şubesi. */
create or replace function varsayilan_magaza()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(aktif_magaza(),
                  (select m.id from magazalar m
                    where m.isletme_id = aktif_isletme() and m.aktif
                    order by m.olusturma limit 1))
$$;

-- ── Sipariş numarası (atomik, şube başına) ───────────────────────────

create or replace function siparis_no_uret(p_magaza uuid, p_tarih date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_kod text;
  v_ay  char(7) := to_char(p_tarih, 'YYYY-MM');
  v_no  integer;
begin
  select kod into v_kod from magazalar where id = p_magaza;
  if v_kod is null then raise exception 'Şube bulunamadı: %', p_magaza; end if;

  insert into siparis_sayaclari (magaza_id, yil_ay, son_no)
  values (p_magaza, v_ay, 1)
  on conflict (magaza_id, yil_ay) do update
    set son_no = siparis_sayaclari.son_no + 1
  returning son_no into v_no;

  return v_kod || '-' || to_char(p_tarih, 'MM') || '-' || to_char(p_tarih, 'YY')
         || '-' || lpad(v_no::text, 4, '0');
end $$;

create or replace function siparis_hazirla()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(new.no), '') = '' then
    new.no := siparis_no_uret(new.magaza_id, new.siparis_tarihi);
  end if;
  if new.olusturan is null then new.olusturan := auth.uid(); end if;
  if coalesce(btrim(new.olusturan_personel), '') = '' then
    new.olusturan_personel := new.personel_adi;
  end if;
  return new;
end $$;

create trigger siparisler_hazirla before insert on siparisler
for each row execute function siparis_hazirla();

create trigger siparisler_damga before update on siparisler
for each row execute function guncelleme_damgala();

-- ── Toplamlar ve teslim tarihi ───────────────────────────────────────

create or replace function siparis_tahsilat(p_siparis uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tip = 'iade' then -tutar else tutar end), 0)
  from odemeler where siparis_id = p_siparis
$$;

/*
 * Ürün satırları veya ödemeler değişince siparişi yeniden hesaplar:
 *  · ara_toplam = satır toplamları
 *  · tutar      = ara_toplam (elle indirim girilmediyse)
 *  · teslim_tarihi: durum "Teslim Edildi" ise bugün; tamamı tahsil
 *    edildiyse son ödeme tarihi. Elle girilmez.
 */
create or replace function siparis_yenile(p_siparis uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ara    numeric(12,2);
  v_tutar  numeric(12,2);
  v_tahsil numeric(12,2);
  v_son    date;
  v_durum  siparis_durumu;
  v_elle   boolean;
  v_teslim date;
begin
  select coalesce(sum(satir_toplam), 0) into v_ara
  from siparis_urunleri where siparis_id = p_siparis;

  select durum, tutar_elle, tutar, teslim_tarihi
    into v_durum, v_elle, v_tutar, v_teslim
  from siparisler where id = p_siparis;
  if not found then return; end if;

  if not v_elle then v_tutar := v_ara; end if;

  v_tahsil := siparis_tahsilat(p_siparis);
  select max(tarih) into v_son from odemeler where siparis_id = p_siparis;

  if v_durum = 'Teslim Edildi' then
    v_teslim := coalesce(v_teslim, current_date);
  elsif v_tutar > 0 and v_tahsil >= v_tutar - 0.005 and v_son is not null then
    v_teslim := v_son;
  end if;

  update siparisler
     set ara_toplam = v_ara, tutar = v_tutar, teslim_tarihi = v_teslim, guncelleme = now()
   where id = p_siparis
     and (ara_toplam, tutar, teslim_tarihi) is distinct from (v_ara, v_tutar, v_teslim);
end $$;

create or replace function siparis_yenile_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform siparis_yenile(coalesce(new.siparis_id, old.siparis_id));
  return null;
end $$;

create trigger siparis_urunleri_yenile after insert or update or delete on siparis_urunleri
for each row execute function siparis_yenile_trg();

create trigger odemeler_siparis_yenile after insert or update or delete on odemeler
for each row execute function siparis_yenile_trg();

create or replace function siparis_durum_degisti()
returns trigger language plpgsql as $$
begin
  if new.durum <> old.durum then
    new.durum_tarihi := current_date;
    if new.durum = 'Teslim Edildi' then new.teslim_tarihi := current_date; end if;
  end if;
  if new.silindi and not old.silindi then
    new.silinme_tarihi := coalesce(new.silinme_tarihi, current_date);
  elsif not new.silindi and old.silindi then
    new.silinme_tarihi := null;
  end if;
  return new;
end $$;

create trigger siparisler_durum before update on siparisler
for each row execute function siparis_durum_degisti();

-- ── Sipariş tahsilatı → kasa hareketi ────────────────────────────────

create or replace function odeme_hareketi_yaz()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sip       siparisler;
  v_iade      boolean := new.tip = 'iade';
  v_nakit     boolean := new.yontem <> 'kk';
  v_ana       text;
  v_alt       text;
  v_hesap_ad  text;
  v_hesap_tip hesap_tipi;
  v_hesap     uuid;
  v_yon       hareket_yonu;
  v_kaydeden  text;
  v_aciklama  text;
begin
  select * into v_sip from siparisler where id = new.siparis_id;
  if not found then return null; end if;

  v_yon := case when v_iade then 'GIDER' else 'GELIR' end;
  v_ana := case
             when v_iade then 'Satış İadesi'
             when v_nakit then 'Nakit Satış'
             else 'POS / Kredi Kartı Satışı'
           end;
  v_alt := case when v_nakit then 'Mağaza Nakit'
                else coalesce(nullif(btrim(new.banka), ''), 'Diğer POS') end;

  if v_nakit then
    v_hesap_ad := ayar_metin(v_sip.isletme_id, 'nakit_hesap', 'Nakit Kasa');
    v_hesap_tip := 'kasa';
  else
    v_hesap_ad := coalesce(nullif(btrim(new.banka), '') || ' POS', 'POS');
    v_hesap_tip := 'pos';
  end if;

  v_hesap := hesap_sagla(v_sip.isletme_id, v_hesap_ad, v_hesap_tip);
  perform kasa_kategori_sagla(v_sip.isletme_id, v_ana, v_alt, v_yon, 'OP');

  v_kaydeden := coalesce(
    nullif(btrim(new.olusturan_personel), ''),
    nullif(btrim(v_sip.olusturan_personel), ''),
    nullif(btrim(v_sip.personel_adi), ''),
    'Sipariş');

  v_aciklama := 'Sipariş ' || v_sip.no || ' · ' || v_sip.ad_soyad
    || case when new.yontem = 'kk' and btrim(new.taksit) <> ''
            then ' · ' || new.taksit else '' end
    || case when v_iade then ' · İADE' else '' end;

  insert into hareketler (
    isletme_id, magaza_id, tarih, yon, ana_kategori, alt_kategori, tutar, hesap_id,
    aciklama, kaydeden, kaydeden_id, kaynak, odeme_id, silindi
  ) values (
    v_sip.isletme_id, v_sip.magaza_id, new.tarih, v_yon, v_ana, v_alt, new.tutar, v_hesap,
    v_aciklama, v_kaydeden, auth.uid(), 'SIPARIS', new.id, v_sip.silindi
  )
  on conflict (odeme_id) where odeme_id is not null do update set
    tarih = excluded.tarih,
    yon = excluded.yon,
    ana_kategori = excluded.ana_kategori,
    alt_kategori = excluded.alt_kategori,
    tutar = excluded.tutar,
    hesap_id = excluded.hesap_id,
    aciklama = excluded.aciklama,
    guncelleme = now();

  return null;
end $$;

create trigger odemeler_hareket after insert or update on odemeler
for each row execute function odeme_hareketi_yaz();

create or replace function siparis_silindi_yayilsin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.silindi is distinct from old.silindi then
    update hareketler h set silindi = new.silindi, guncelleme = now()
     where h.odeme_id in (select o.id from odemeler o where o.siparis_id = new.id);
  end if;
  return null;
end $$;

create trigger siparisler_silindi after update on siparisler
for each row execute function siparis_silindi_yayilsin();

-- ── Görünümler (hepsi kiracı kapsamlı) ───────────────────────────────

create or replace view v_siparisler as
select
  s.*,
  coalesce(t.tahsil_edilen, 0) as tahsil_edilen,
  s.tutar - coalesce(t.tahsil_edilen, 0) as kalan,
  (s.tutar > 0 and coalesce(t.tahsil_edilen, 0) >= s.tutar - 0.005) as odendi,
  coalesce(u.urun_adedi, 0) as urun_adedi
from siparisler s
left join (
  select siparis_id, sum(case when tip = 'iade' then -tutar else tutar end) as tahsil_edilen
  from odemeler group by siparis_id
) t on t.siparis_id = s.id
left join (
  select siparis_id, sum(adet) as urun_adedi from siparis_urunleri group by siparis_id
) u on u.siparis_id = s.id;

/* Nakit esaslı günlük tahsilat (ödemenin kendi tarihiyle). */
create or replace view v_gunluk_tahsilat as
select
  s.isletme_id,
  s.magaza_id,
  o.tarih,
  sum(case when o.tip = 'iade' then -o.tutar
           when o.yontem = 'nakit' then o.tutar else 0 end) as nakit,
  sum(case when o.tip <> 'iade' and o.yontem = 'kk' then o.tutar else 0 end) as pos,
  sum(case when o.tip = 'iade' then o.tutar else 0 end) as iade,
  sum(case when o.tip = 'iade' then -o.tutar else o.tutar end) as toplam
from odemeler o
join siparisler s on s.id = o.siparis_id
where not s.silindi
group by s.isletme_id, s.magaza_id, o.tarih;

create or replace view v_personel_tahsilat as
select
  s.isletme_id,
  s.magaza_id,
  to_char(o.tarih, 'YYYY-MM') as ay,
  o.tarih,
  coalesce(nullif(btrim(s.personel_adi), ''), 'Belirtilmemiş') as personel,
  sum(case when o.tip = 'iade' then -o.tutar else o.tutar end) as tahsilat
from odemeler o
join siparisler s on s.id = o.siparis_id
where not s.silindi
group by s.isletme_id, s.magaza_id, 3, o.tarih, 5;

/* Mağazanın kendi girdiği masraflar (muhasebe kalemleri KARIŞMAZ). */
create or replace view v_magaza_masraflari as
select
  h.id, h.isletme_id, h.magaza_id, h.tarih, h.ana_kategori,
  h.alt_kategori as kalem, h.tutar, h.hesap_id, hs.ad as hesap,
  h.aciklama, h.kaydeden
from hareketler h
join hesaplar hs on hs.id = h.hesap_id
where h.kaynak = 'MAGAZA_MASRAF' and not h.silindi and h.yon = 'GIDER';

-- ── Mağaza kasa özeti (gün / ay) ─────────────────────────────────────
/*
 * Mağaza rolü kasanın tamamını göremez; bu fonksiyon gün sonu kontrolü
 * için gereken özeti döner: satış (tahsil edilen) · personel dağılımı ·
 * mağaza masrafları · net nakit (= nakit satış − nakit mağaza masrafı).
 *
 * p_magaza: finans rolleri belirli bir şubeyi sorabilir; boşsa mağaza
 * rolünde kendi şubesi, finans rollerinde işletmenin tamamı.
 */
create or replace function kasa_ozeti(p_tip text, p_deger text, p_magaza uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_magaza  uuid;
  v_gun_mu  boolean := coalesce(p_tip, 'gun') <> 'ay';
  v_donem   text := coalesce(nullif(btrim(p_deger), ''),
                      case when coalesce(p_tip, 'gun') = 'ay'
                           then to_char(current_date, 'YYYY-MM')
                           else to_char(current_date, 'YYYY-MM-DD') end);
  v_nakit_hesap text;
  v_satis    jsonb;
  v_personel jsonb;
  v_masraf   jsonb;
  v_m_toplam numeric(12,2);
  v_m_nakit  numeric(12,2);
  v_nakit    numeric(12,2);
begin
  if aktif_rol() is null or v_isletme is null then raise exception 'Yetkisiz.'; end if;
  /* Şube rolü kendi şubesini görür; yonetici/finans şube seçebilir ya da
     boş bırakıp işletmenin tamamını görür. */
  v_magaza := case when sube_rolu_mu() then aktif_magaza() else p_magaza end;
  v_nakit_hesap := ayar_metin(v_isletme, 'nakit_hesap', 'Nakit Kasa');

  select jsonb_build_object(
           'nakit', coalesce(sum(g.nakit), 0),
           'pos', coalesce(sum(g.pos), 0),
           'iade', coalesce(sum(g.iade), 0),
           'toplam', coalesce(sum(g.toplam), 0)),
         coalesce(sum(g.nakit), 0)
    into v_satis, v_nakit
  from v_gunluk_tahsilat g
  where g.isletme_id = v_isletme
    and (v_magaza is null or g.magaza_id = v_magaza)
    and case when v_gun_mu then to_char(g.tarih, 'YYYY-MM-DD') = v_donem
             else to_char(g.tarih, 'YYYY-MM') = v_donem end;

  select coalesce(jsonb_object_agg(x.personel, x.tahsilat), '{}'::jsonb) into v_personel
  from (
    select p.personel, sum(p.tahsilat) as tahsilat
    from v_personel_tahsilat p
    where p.isletme_id = v_isletme
      and (v_magaza is null or p.magaza_id = v_magaza)
      and case when v_gun_mu then to_char(p.tarih, 'YYYY-MM-DD') = v_donem
               else p.ay = v_donem end
    group by p.personel
  ) x;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.tutar desc), '[]'::jsonb),
         coalesce(sum(m.tutar), 0),
         coalesce(sum(case when m.hesap = v_nakit_hesap then m.tutar else 0 end), 0)
    into v_masraf, v_m_toplam, v_m_nakit
  from v_magaza_masraflari m
  where m.isletme_id = v_isletme
    and (v_magaza is null or m.magaza_id = v_magaza)
    and case when v_gun_mu then to_char(m.tarih, 'YYYY-MM-DD') = v_donem
             else to_char(m.tarih, 'YYYY-MM') = v_donem end;

  return jsonb_build_object(
    'tip', case when v_gun_mu then 'gun' else 'ay' end,
    'donem', v_donem,
    'satis', v_satis,
    'personel', v_personel,
    'masraflar', v_masraf,
    'masrafToplam', v_m_toplam,
    'masrafNakit', v_m_nakit,
    'netNakit', v_nakit - v_m_nakit,
    'nakitHesap', v_nakit_hesap
  );
end $$;

-- ── Mağaza masrafı ───────────────────────────────────────────────────
create or replace function magaza_masraf_ekle(
  p_kalem text, p_tutar numeric, p_tarih date default current_date,
  p_hesap text default null, p_aciklama text default '', p_personel text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_magaza  uuid := varsayilan_magaza();
  v_ana     text;
  v_izinli  text[];
  v_temiz   text[];
  v_hesap   uuid;
  v_id      uuid;
begin
  if aktif_rol() is null or v_isletme is null then raise exception 'Yetkisiz.'; end if;
  if not abonelik_yazabilir(v_isletme) then
    raise exception 'Aboneliğiniz yazma işlemine kapalı. Lütfen planınızı yenileyin.';
  end if;
  if coalesce(p_tutar, 0) <= 0 then raise exception 'Tutar sıfırdan büyük olmalı.'; end if;

  v_ana := ayar_metin(v_isletme, 'magaza_masraf_ana_kategori', 'Masraflar');
  v_izinli := string_to_array(ayar_metin(v_isletme, 'magaza_masraf_kalemleri', ''), ',');
  select array_agg(btrim(x)) into v_temiz from unnest(v_izinli) x where btrim(x) <> '';
  if v_temiz is not null and not (btrim(p_kalem) = any (v_temiz)) then
    raise exception 'Geçersiz masraf kalemi: %', p_kalem;
  end if;

  v_hesap := hesap_sagla(v_isletme,
    coalesce(nullif(btrim(p_hesap), ''), ayar_metin(v_isletme, 'nakit_hesap', 'Nakit Kasa')));
  perform kasa_kategori_sagla(v_isletme, v_ana, btrim(p_kalem), 'GIDER', 'OP');

  insert into hareketler (
    isletme_id, magaza_id, tarih, yon, ana_kategori, alt_kategori, tutar, hesap_id,
    aciklama, kaydeden, kaydeden_id, kaynak
  ) values (
    v_isletme, v_magaza, coalesce(p_tarih, current_date), 'GIDER', v_ana, btrim(p_kalem),
    p_tutar, v_hesap, coalesce(p_aciklama, ''),
    coalesce(nullif(btrim(p_personel), ''), aktif_ad()), auth.uid(), 'MAGAZA_MASRAF'
  ) returning id into v_id;

  insert into log (isletme_id, kullanici_id, personel, islem, tablo, kayit_id, detay)
  values (v_isletme, auth.uid(), p_personel, 'MASRAF_EKLE', 'hareketler', v_id::text,
          jsonb_build_object('kalem', p_kalem, 'tutar', p_tutar, 'tarih', p_tarih));
  return v_id;
end $$;

create or replace function magaza_masraf_sil(p_id uuid, p_personel text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_magaza  uuid := aktif_magaza();
  v_sayi    integer;
begin
  if aktif_rol() is null or v_isletme is null then raise exception 'Yetkisiz.'; end if;
  update hareketler h set silindi = true, guncelleme = now()
   where h.id = p_id
     and h.isletme_id = v_isletme
     and h.kaynak = 'MAGAZA_MASRAF'
     and not h.silindi
     and (not sube_rolu_mu() or h.magaza_id = v_magaza);
  get diagnostics v_sayi = row_count;
  if v_sayi = 0 then return false; end if;
  insert into log (isletme_id, kullanici_id, personel, islem, tablo, kayit_id)
  values (v_isletme, auth.uid(), p_personel, 'MASRAF_SIL', 'hareketler', p_id::text);
  return true;
end $$;

-- ── Değişiklik günlüğü ───────────────────────────────────────────────
create or replace function log_yaz()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_satir    jsonb;
  v_detay    jsonb;
  v_isletme  uuid;
begin
  if tg_op = 'INSERT' then
    v_satir := to_jsonb(new);
    v_detay := jsonb_build_object('yeni', v_satir);
  elsif tg_op = 'DELETE' then
    v_satir := to_jsonb(old);
    v_detay := jsonb_build_object('eski', v_satir);
  else
    v_satir := to_jsonb(new);
    v_detay := jsonb_build_object('eski', to_jsonb(old), 'yeni', v_satir);
  end if;

  v_isletme := nullif(v_satir ->> 'isletme_id', '')::uuid;
  if v_isletme is null and (v_satir ? 'siparis_id') then
    select s.isletme_id into v_isletme from siparisler s
     where s.id = (v_satir ->> 'siparis_id')::uuid;
  end if;

  insert into log (isletme_id, kullanici_id, personel, islem, tablo, kayit_id, detay)
  values (
    coalesce(v_isletme, aktif_isletme()),
    auth.uid(),
    coalesce(v_satir ->> 'olusturan_personel', ''),
    tg_table_name || '_' || tg_op,
    tg_table_name,
    coalesce(v_satir ->> 'id', ''),
    v_detay
  );
  return null;
end $$;

create trigger siparisler_log after insert or update or delete on siparisler
for each row execute function log_yaz();
create trigger odemeler_log after insert or update or delete on odemeler
for each row execute function log_yaz();
create trigger hareketler_log after insert or update or delete on hareketler
for each row execute function log_yaz();
