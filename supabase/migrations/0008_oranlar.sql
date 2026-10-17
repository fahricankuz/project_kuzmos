-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0008 — Oranlar: KDV, kredi kartı komisyonu, personel primi
--
-- Üç oran da işletmeye özeldir ve arayüzden düzenlenir; hiçbiri koda
-- gömülü değildir:
--
--   KDV       — ürün kategorisi başına oran + "fiyatlar KDV dahil mi"
--               seçimi (dahil / hariç)
--   Komisyon  — BANKA ve TAKSİT kırılımında ayrı ayrı. Banka boş
--               bırakılan satır o taksit için varsayılandır.
--   Prim      — işletme varsayılanı + istenirse personel başına oran
-- ═══════════════════════════════════════════════════════════════════════

/* Personel başına prim oranı: null ise işletme varsayılanı kullanılır. */
alter table personel add column if not exists prim_orani numeric(5, 2);

/* Siparişin KDV tutarı (hariç modda toplama eklenir, dahil modda içinden ayrışır) */
alter table siparisler add column if not exists kdv_tutari numeric(12, 2) not null default 0;

/* Banka + taksit kırılımlı komisyon oranları */
create table if not exists kk_komisyonlari (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null references isletmeler on delete cascade,
  banka       text not null default '',          -- '' => tüm bankalar (varsayılan)
  taksit      text not null,
  oran        numeric(5, 2) not null default 0,
  unique (isletme_id, banka, taksit)
);
create index if not exists kk_komisyonlari_isletme_idx on kk_komisyonlari (isletme_id);

alter table kk_komisyonlari enable row level security;
grant select, insert, update, delete on kk_komisyonlari to authenticated;

create policy oku_isletme on kk_komisyonlari for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_finans on kk_komisyonlari for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());

create trigger isletme_damga before insert on kk_komisyonlari
for each row execute function isletme_damgala();

/*
 * Oturumdaki işletmenin ayarını okur. ayar_metin() definer olduğu için
 * dışarıya açılmaz (başka işletmenin id'si verilebilirdi); bu sürüm
 * invoker'dır, RLS kendi işletmesiyle sınırlar.
 */
create or replace function ayar_oku(p_anahtar text, p_varsayilan text default '')
returns text language sql stable as $$
  select coalesce(
    (select nullif(btrim(a.deger), '') from ayarlar a
      where a.isletme_id = aktif_isletme() and a.anahtar = p_anahtar),
    p_varsayilan)
$$;

/* Önce (banka, taksit), yoksa (varsayılan, taksit), yoksa 0. */
create or replace function komisyon_orani(p_isletme uuid, p_banka text, p_taksit text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select oran from kk_komisyonlari
      where isletme_id = p_isletme and banka = coalesce(btrim(p_banka), '')
        and taksit = btrim(p_taksit)),
    (select oran from kk_komisyonlari
      where isletme_id = p_isletme and banka = '' and taksit = btrim(p_taksit)),
    0)
$$;

/* Satış personelinin prim oranı (muafsa 0, kişiye özel yoksa varsayılan). */
create or replace function prim_orani(p_isletme uuid, p_personel text)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_muaf boolean;
  v_oran numeric;
begin
  select prim_muaf, prim_orani into v_muaf, v_oran
  from personel
   where isletme_id = p_isletme and ad = btrim(coalesce(p_personel, ''))
   limit 1;
  if v_muaf then return 0; end if;
  return coalesce(v_oran, ayar_sayi(p_isletme, 'personel_prim', 0));
end $$;

/* Siparişin KDV tutarı: satır bazında kategori oranıyla. */
create or replace function siparis_kdv(p_siparis uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_isletme uuid;
  v_dahil   boolean;
  v_kdv     numeric(12, 2) := 0;
  v_satir   record;
  v_oran    numeric;
begin
  select s.isletme_id into v_isletme from siparisler s where s.id = p_siparis;
  if v_isletme is null then return 0; end if;
  v_dahil := lower(ayar_metin(v_isletme, 'kdv_modu', 'dahil')) <> 'haric';

  for v_satir in
    select u.kategori, u.satir_toplam from siparis_urunleri u where u.siparis_id = p_siparis
  loop
    select k.kdv into v_oran from urun_kategorileri k
     where k.isletme_id = v_isletme and k.ad = v_satir.kategori;
    if v_oran is null or v_oran = 0 then continue; end if;
    if v_dahil then
      v_kdv := v_kdv + v_satir.satir_toplam - (v_satir.satir_toplam / (1 + v_oran / 100));
    else
      v_kdv := v_kdv + v_satir.satir_toplam * v_oran / 100;
    end if;
  end loop;
  return round(v_kdv, 2);
end $$;

/*
 * Toplamları yeniden hesaplar (0002'deki sürümün KDV'li hali).
 *   KDV dahil modu : tutar = ara toplam (KDV fiyatın içinde)
 *   KDV hariç modu : tutar = ara toplam + KDV
 * Elle indirim girildiyse tutar korunur, KDV o tutardan ayrıştırılır.
 */
create or replace function siparis_yenile(p_siparis uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid;
  v_dahil   boolean;
  v_ara     numeric(12,2);
  v_kdv     numeric(12,2);
  v_tutar   numeric(12,2);
  v_tahsil  numeric(12,2);
  v_son     date;
  v_durum   siparis_durumu;
  v_elle    boolean;
  v_teslim  date;
begin
  select s.isletme_id, s.durum, s.tutar_elle, s.tutar, s.teslim_tarihi
    into v_isletme, v_durum, v_elle, v_tutar, v_teslim
  from siparisler s where s.id = p_siparis;
  if v_isletme is null then return; end if;

  v_dahil := lower(ayar_metin(v_isletme, 'kdv_modu', 'dahil')) <> 'haric';

  select coalesce(sum(satir_toplam), 0) into v_ara
  from siparis_urunleri where siparis_id = p_siparis;

  v_kdv := siparis_kdv(p_siparis);

  if not v_elle then
    v_tutar := case when v_dahil then v_ara else v_ara + v_kdv end;
  elsif v_ara > 0 then
    /* Elle indirimde KDV, indirimli tutarla orantılı düşer */
    v_kdv := round(v_kdv * v_tutar / (case when v_dahil then v_ara else v_ara + v_kdv end), 2);
  end if;

  v_tahsil := siparis_tahsilat(p_siparis);
  select max(tarih) into v_son from odemeler where siparis_id = p_siparis;

  if v_durum = 'Teslim Edildi' then
    v_teslim := coalesce(v_teslim, current_date);
  elsif v_tutar > 0 and v_tahsil >= v_tutar - 0.005 and v_son is not null then
    v_teslim := v_son;
  end if;

  update siparisler
     set ara_toplam = v_ara, tutar = v_tutar, kdv_tutari = v_kdv,
         teslim_tarihi = v_teslim, guncelleme = now()
   where id = p_siparis
     and (ara_toplam, tutar, kdv_tutari, teslim_tarihi)
         is distinct from (v_ara, v_tutar, v_kdv, v_teslim);
end $$;

-- ── Yeni işletmenin varsayılan oranları ──────────────────────────────
create or replace function oran_varsayilanlari(p_isletme uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into ayarlar (isletme_id, anahtar, deger, aciklama) values
    (p_isletme, 'kdv_modu', 'dahil',
     'Ürün fiyatları KDV dahil mi girilir? (dahil / haric)')
  on conflict (isletme_id, anahtar) do nothing;

  /* Taksit başına varsayılan komisyon (banka ayrımı olmadan).
     Oranlar örnektir; her işletme kendi sözleşmesine göre düzenler. */
  insert into kk_komisyonlari (isletme_id, banka, taksit, oran)
  select p_isletme, '', t.taksit, t.oran from (values
    ('Tek çekim', 0), ('2 Taksit', 0), ('3 Taksit', 0),
    ('4 Taksit', 0), ('5 Taksit', 0), ('6 Taksit', 0), ('Diğer', 0)
  ) as t(taksit, oran)
  on conflict (isletme_id, banka, taksit) do nothing;
end $$;

/* Kayıt sırasında da yüklensin */
create or replace function isletme_varsayilanlari_oranlar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform oran_varsayilanlari(new.id);
  return null;
end $$;

drop trigger if exists isletmeler_oran_varsayilan on isletmeler;
create trigger isletmeler_oran_varsayilan after insert on isletmeler
for each row execute function isletme_varsayilanlari_oranlar();

-- ── Düzenleme uçları ─────────────────────────────────────────────────

/* Ürün kategorileri ve KDV oranları */
create or replace function urun_kategorileri_kaydet(p_liste jsonb)
returns boolean language plpgsql as $$
declare v_s jsonb; v_isletme uuid := aktif_isletme(); v_sira integer := 0;
begin
  if not finans_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  for v_s in select * from jsonb_array_elements(coalesce(p_liste, '[]'::jsonb)) loop
    if btrim(coalesce(v_s->>'ad', '')) = '' then continue; end if;
    v_sira := v_sira + 1;
    insert into urun_kategorileri (isletme_id, ad, kdv, ikon, sira, aktif)
    values (v_isletme, btrim(v_s->>'ad'),
            least(greatest(coalesce((v_s->>'kdv')::numeric, 0), 0), 100),
            coalesce(v_s->>'ikon', ''), v_sira,
            coalesce((v_s->>'aktif')::boolean, true))
    on conflict (isletme_id, ad) do update
      set kdv = excluded.kdv, ikon = excluded.ikon, sira = excluded.sira,
          aktif = excluded.aktif;
  end loop;
  perform log_ekle('KDV_KAYDET', 'urun_kategorileri', '', '', p_liste);
  return true;
end $$;

/* Banka + taksit kırılımlı komisyon oranları */
create or replace function kk_komisyon_kaydet(p_liste jsonb)
returns boolean language plpgsql as $$
declare v_s jsonb; v_isletme uuid := aktif_isletme();
begin
  if not finans_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  delete from kk_komisyonlari where isletme_id = v_isletme;
  for v_s in select * from jsonb_array_elements(coalesce(p_liste, '[]'::jsonb)) loop
    if btrim(coalesce(v_s->>'taksit', '')) = '' then continue; end if;
    insert into kk_komisyonlari (isletme_id, banka, taksit, oran)
    values (v_isletme, coalesce(btrim(v_s->>'banka'), ''), btrim(v_s->>'taksit'),
            least(greatest(coalesce((v_s->>'oran')::numeric, 0), 0), 100))
    on conflict (isletme_id, banka, taksit) do update set oran = excluded.oran;
  end loop;
  perform log_ekle('KOMISYON_KAYDET', 'kk_komisyonlari', '', '', p_liste);
  return true;
end $$;

/* Personel listesi (prim oranı dahil) — 0004'teki sürümün yerini alır */
create or replace function personel_kaydet(p_liste jsonb)
returns boolean language plpgsql as $$
declare v_s jsonb; v_magaza uuid := varsayilan_magaza();
begin
  if not finans_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  delete from personel where magaza_id = v_magaza;
  for v_s in select * from jsonb_array_elements(coalesce(p_liste, '[]'::jsonb)) loop
    if btrim(coalesce(v_s->>'ad', '')) = '' then continue; end if;
    insert into personel (magaza_id, ad, aktif, prim_muaf, prim_orani)
    values (v_magaza, btrim(v_s->>'ad'),
            coalesce((v_s->>'aktif')::boolean, true),
            coalesce((v_s->>'primMuaf')::boolean, false),
            case when coalesce(v_s->>'primOrani', '') = '' then null
                 else least(greatest((v_s->>'primOrani')::numeric, 0), 100) end)
    on conflict (magaza_id, ad) do update
      set aktif = excluded.aktif, prim_muaf = excluded.prim_muaf,
          prim_orani = excluded.prim_orani;
  end loop;
  perform log_ekle('PERSONEL_KAYDET', 'personel', '', '');
  return true;
end $$;

revoke execute on function ayar_oku(text, text) from public, anon;
grant execute on function ayar_oku(text, text) to authenticated;

revoke execute on function komisyon_orani(uuid, text, text), prim_orani(uuid, text),
  siparis_kdv(uuid), oran_varsayilanlari(uuid), isletme_varsayilanlari_oranlar(),
  urun_kategorileri_kaydet(jsonb), kk_komisyon_kaydet(jsonb)
  from public, anon, authenticated;

grant execute on function komisyon_orani(uuid, text, text), prim_orani(uuid, text),
  urun_kategorileri_kaydet(jsonb), kk_komisyon_kaydet(jsonb)
  to authenticated;

-- ── Arayüze giden paketler (0004'teki sürümlerin yerini alır) ────────

create or replace function ayar_paketi()
returns jsonb language plpgsql stable as $$
declare
  v_isletme uuid := aktif_isletme();
  v_ham     jsonb;
  v_finans  boolean := finans_mi();
  v_paket   jsonb;
begin
  select coalesce(jsonb_object_agg(anahtar, deger), '{}'::jsonb) into v_ham
  from ayarlar where isletme_id = v_isletme;

  v_paket := jsonb_build_object(
    'hesaplar', (select coalesce(jsonb_agg(ad order by sira, ad), '[]'::jsonb)
                   from hesaplar where isletme_id = v_isletme and aktif),
    'bankalar', to_jsonb(liste_ayristir(v_ham->>'bankalar')),
    'taksitler', to_jsonb(liste_ayristir(v_ham->>'taksitler')),
    /* Komisyon artık banka × taksit matrisi; '' anahtarı varsayılan satır */
    'kkKomisyon', (
      select coalesce(jsonb_object_agg(banka, oranlar), '{}'::jsonb) from (
        select banka, jsonb_object_agg(taksit, oran) as oranlar
        from kk_komisyonlari where isletme_id = v_isletme group by banka
      ) x),
    'personelPrim', coalesce(replace(coalesce(v_ham->>'personel_prim', '0'), ',', '.')::numeric, 0),
    'kdvModu', case when lower(coalesce(v_ham->>'kdv_modu', 'dahil')) = 'haric'
                    then 'haric' else 'dahil' end,
    'masrafKalemleri', to_jsonb(liste_ayristir(v_ham->>'magaza_masraf_kalemleri')),
    'masrafAnaKategori', coalesce(nullif(v_ham->>'magaza_masraf_ana_kategori', ''), 'Masraflar'),
    'nakitHesap', coalesce(nullif(v_ham->>'nakit_hesap', ''), 'Nakit Kasa'),
    'siparisNoOnEk', coalesce((select kod from magazalar where id = varsayilan_magaza()), ''),
    'waSablon', coalesce(nullif(v_ham->>'wa_sablon', ''),
      'Sayın {ad}, {no} numaralı siparişiniz teslimata hazırdır. {isletme} iyi günler diler.'),
    'erpAktif', coalesce(nullif(v_ham->>'erp_aktif', ''), 'hayir') in ('evet', 'true', '1'),
    'erpEtiket', coalesce(nullif(v_ham->>'erp_etiket', ''), 'ERP''ye İşlendi'),
    'logoUrl', coalesce(v_ham->>'logo_url', ''),
    'kasaEntegrasyon', true
  );

  if v_finans then
    v_paket := v_paket || jsonb_build_object(
      'borcHesaplari', (select coalesce(jsonb_agg(ad order by ad), '[]'::jsonb)
                          from hesaplar where isletme_id = v_isletme and aktif and tip = 'kredi'),
      'acilisKasa', coalesce(replace(coalesce(v_ham->>'acilis_kasa', '0'), ',', '.')::numeric, 0),
      'acilisTarih', coalesce(v_ham->>'acilis_tarih', ''),
      'acilisBorc', coalesce(replace(coalesce(v_ham->>'acilis_borc', '0'), ',', '.')::numeric, 0),
      'ham', v_ham);
  else
    v_paket := v_paket || jsonb_build_object('ham', '{}'::jsonb);
  end if;
  return v_paket;
end $$;

create or replace function siparis_json(p_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'no', s.no, 'magazaId', s.magaza_id,
    'siparisTarihi', to_char(s.siparis_tarihi, 'YYYY-MM-DD'),
    'teslimTarihi', coalesce(to_char(s.teslim_tarihi, 'YYYY-MM-DD'), ''),
    'personel', s.personel_adi,
    'musteriId', coalesce(s.musteri_id::text, ''),
    'adSoyad', s.ad_soyad, 'telefon', s.telefon, 'eposta', s.eposta, 'tcVergi', s.tc_vergi,
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
    'kdvTutari', s.kdv_tutari,
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
    'erp', s.erp_islendi,
    'olusturanPersonel', s.olusturan_personel,
    'silindi', s.silindi,
    'silinmeTarihi', coalesce(to_char(s.silinme_tarihi, 'YYYY-MM-DD'), '')
  )
  from siparisler s join v_siparisler v on v.id = s.id where s.id = p_id
$$;

/*
 * siparis_kaydet (0004'teki sürümün yerini alır).
 * Tek fark: elle indirim tespiti KDV moduna göre yapılır. KDV hariç
 * modda istemci KDV'li genel toplamı gönderir; bunu indirim sanmamak
 * için beklenen toplam kategori oranlarıyla hesaplanır. İstemci
 * 'tutarElle' gönderirse o kesin kabul edilir.
 */
create or replace function siparis_kaydet(p jsonb, p_personel text default '')
returns jsonb language plpgsql as $$
declare
  v_id       uuid;
  v_isletme  uuid := aktif_isletme();
  v_magaza   uuid;
  v_ad       text := btrim(coalesce(p->>'adSoyad', ''));
  v_tarih    date;
  v_musteri  uuid;
  v_dahil    boolean;
  v_ara      numeric(12,2) := 0;
  v_kdv      numeric(12,2) := 0;
  v_beklenen numeric(12,2);
  v_oran     numeric;
  v_satirTop numeric(12,2);
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
  if not yazma_izni() then
    raise exception 'Aboneliğiniz yazma işlemine kapalı. Lütfen planınızı yenileyin.';
  end if;
  if v_ad = '' then raise exception 'Müşteri adı zorunludur.'; end if;
  if sube_rolu_mu() and btrim(coalesce(p_personel, '')) = '' then
    raise exception 'İşlemi yapan satış personelini seçin.';
  end if;

  begin
    v_magaza := nullif(btrim(coalesce(p->>'magazaId', '')), '')::uuid;
  exception when others then v_magaza := null;
  end;
  if v_magaza is null or not magaza_erisimi(v_magaza) then v_magaza := varsayilan_magaza(); end if;
  if v_magaza is null then raise exception 'Şube bulunamadı.'; end if;

  begin
    v_tarih := coalesce(nullif(p->>'siparisTarihi', '')::date, current_date);
  exception when others then raise exception 'Sipariş tarihi geçersiz.';
  end;

  v_durum := coalesce(nullif(p->>'durum', '')::siparis_durumu, 'Satış Yapıldı');
  v_dahil := lower(ayar_oku('kdv_modu', 'dahil')) <> 'haric';

  for v_satir in select * from jsonb_array_elements(coalesce(p->'urunler', '[]'::jsonb)) loop
    v_satirTop := greatest(coalesce((v_satir->>'adet')::integer, 1), 1)
                  * coalesce((v_satir->>'fiyat')::numeric, 0);
    v_ara := v_ara + v_satirTop;
    select k.kdv into v_oran from urun_kategorileri k
     where k.isletme_id = v_isletme and k.ad = coalesce(v_satir->>'kategori', '');
    if coalesce(v_oran, 0) > 0 then
      v_kdv := v_kdv + case when v_dahil
                            then v_satirTop - (v_satirTop / (1 + v_oran / 100))
                            else v_satirTop * v_oran / 100 end;
    end if;
  end loop;

  v_beklenen := case when v_dahil then v_ara else v_ara + round(v_kdv, 2) end;
  v_elle := coalesce((p->>'tutarElle')::boolean,
                     v_tutar > 0 and abs(v_tutar - v_beklenen) > 0.005);
  if not v_elle then v_tutar := v_beklenen; end if;

  v_musteri := musteri_upsert(jsonb_build_object(
    'musteriId', coalesce(p->>'musteriId', ''),
    'adSoyad', v_ad,
    'telefon', coalesce(p->>'telefon', ''),
    'eposta', coalesce(p->>'eposta', ''),
    'tcVergi', coalesce(p->>'tcVergi', ''),
    'recete', coalesce(p->'recete', '{}'::jsonb)));

  if v_yeni then
    insert into siparisler (
      magaza_id, siparis_tarihi, personel_adi, musteri_id, ad_soyad, telefon,
      eposta, tc_vergi, recete, tutar, tutar_elle, durum, erp_islendi, olusturan_personel
    ) values (
      v_magaza, v_tarih, coalesce(p->>'personel', ''), v_musteri, v_ad,
      coalesce(p->>'telefon', ''), coalesce(p->>'eposta', ''), coalesce(p->>'tcVergi', ''),
      coalesce(p->'recete', '{}'::jsonb), v_tutar, v_elle, v_durum,
      coalesce((p->>'erp')::boolean, false),
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
      erp_islendi = coalesce((p->>'erp')::boolean, false)
     where id = v_id;
    if not found then raise exception 'Sipariş bulunamadı.'; end if;
  end if;

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
      coalesce(v_satir->>'kol', ''), coalesce((v_satir->>'fiyat')::numeric, 0));
    perform marka_sagla(v_satir->>'kategori', v_satir->>'marka');
  end loop;

  v_tutulan := '{}'::uuid[];
  for v_satir in select * from jsonb_array_elements(coalesce(p->'odemeler', '[]'::jsonb)) loop
    if coalesce((v_satir->>'tutar')::numeric, 0) <= 0
       or coalesce(v_satir->>'tarih', '') = '' then
      continue;
    end if;
    begin
      v_odeme_id := nullif(btrim(coalesce(v_satir->>'id', '')), '')::uuid;
    exception when others then v_odeme_id := null;
    end;
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

  perform personel_sagla(p_personel, v_magaza);
  perform log_ekle(
    case when v_yeni then 'SIPARIS_EKLE' else 'SIPARIS_GUNCELLE' end,
    'siparisler', v_id::text, p_personel,
    jsonb_build_object('adSoyad', v_ad, 'tutar', v_tutar));

  return siparis_json(v_id);
end $$;
