-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0005 — Kullanıcı, şube ve işletme yönetimi
--
-- Her işletme kendi kullanıcılarını yönetir; plan limitleri burada
-- uygulanır (max_kullanici / max_magaza). Şifreler Supabase auth'ta
-- tutulur, uygulamadan okunamaz.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function kullanici_listesi()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', p.eposta, 'ad', p.ad, 'rol', p.rol, 'aktif', p.aktif,
    'magaza', coalesce(m.ad, ''), 'sonGiris', ''
  ) order by p.rol, p.ad), '[]'::jsonb)
  from profiller p left join magazalar m on m.id = p.magaza_id
$$;

/*
 * Yeni kullanıcının profilini açar (auth kaydı tarayıcıda signUp ile
 * yapılır). Plan limiti burada kontrol edilir; 'sahip' rolü atanamaz.
 */
create or replace function profil_olustur(
  p_eposta text, p_ad text, p_rol text, p_magaza_kod text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_uid     uuid;
  v_magaza  uuid;
  v_sayi    integer;
  v_limit   integer;
  v_rol     rol_tipi;
begin
  if not yonetici_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if not abonelik_yazabilir(v_isletme) then
    raise exception 'Aboneliğiniz yazma işlemine kapalı.';
  end if;

  v_rol := p_rol::rol_tipi;
  if v_rol = 'sahip' then
    raise exception 'Sahip rolü devredilerek değişir, elle atanamaz.';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(btrim(p_eposta));
  if v_uid is null then
    raise exception 'Bu e-posta ile bir hesap bulunamadı: %', p_eposta;
  end if;

  /* Başka bir işletmenin kullanıcısı devralınamaz */
  perform 1 from profiller where id = v_uid and isletme_id is distinct from v_isletme;
  if found then raise exception 'Bu hesap başka bir işletmeye bağlı.'; end if;

  select pl.max_kullanici into v_limit
  from isletmeler i join planlar pl on pl.kod = i.plan_kod where i.id = v_isletme;
  select count(*) into v_sayi from profiller
   where isletme_id = v_isletme and aktif and id <> v_uid;
  if v_sayi >= v_limit then
    raise exception 'Planınız en fazla % kullanıcıya izin veriyor. Planı yükseltin.', v_limit;
  end if;

  if v_rol = 'magaza' then
    select id into v_magaza from magazalar
     where isletme_id = v_isletme and kod = coalesce(btrim(p_magaza_kod), kod)
     order by (kod = btrim(coalesce(p_magaza_kod, ''))) desc, olusturma limit 1;
    if v_magaza is null then raise exception 'Şube bulunamadı: %', p_magaza_kod; end if;
  end if;

  insert into profiller (id, isletme_id, magaza_id, ad, rol, eposta)
  values (v_uid, v_isletme, v_magaza, btrim(p_ad), v_rol, lower(btrim(p_eposta)))
  on conflict (id) do update
    set ad = excluded.ad, rol = excluded.rol, magaza_id = excluded.magaza_id,
        eposta = excluded.eposta, aktif = true;

  perform log_ekle('KULLANICI_EKLE', 'profiller', v_uid::text, '',
                   jsonb_build_object('eposta', p_eposta, 'rol', p_rol));
  return true;
end $$;

create or replace function kullanici_durum_degistir(p_eposta text, p_aktif boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_uid     uuid;
  v_rol     rol_tipi;
begin
  if not yonetici_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select id, rol into v_uid, v_rol from profiller
   where isletme_id = v_isletme and lower(eposta) = lower(btrim(p_eposta));
  if v_uid is null then raise exception 'Kullanıcı bulunamadı.'; end if;
  if v_uid = auth.uid() and not p_aktif then
    raise exception 'Kendi hesabınızı pasif yapamazsınız.';
  end if;
  if v_rol = 'sahip' and not p_aktif then
    raise exception 'İşletme sahibinin hesabı pasife alınamaz.';
  end if;
  update profiller set aktif = p_aktif where id = v_uid;
  perform log_ekle('KULLANICI_DURUM', 'profiller', v_uid::text, '',
                   jsonb_build_object('aktif', p_aktif));
  return true;
end $$;

-- ── Şube ekleme (plan limitiyle) ─────────────────────────────────────
create or replace function magaza_ekle(p_ad text, p_kod text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_isletme uuid := aktif_isletme();
  v_limit   integer;
  v_sayi    integer;
  v_id      uuid;
begin
  if not yonetici_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if not abonelik_yazabilir(v_isletme) then
    raise exception 'Aboneliğiniz yazma işlemine kapalı.';
  end if;
  if btrim(coalesce(p_ad, '')) = '' then raise exception 'Şube adı gerekli.'; end if;
  if btrim(coalesce(p_kod, '')) !~ '^[A-Za-z0-9]{1,6}$' then
    raise exception 'Şube kodu 1-6 harf/rakam olmalı (sipariş numarasında kullanılır).';
  end if;

  select pl.max_magaza into v_limit
  from isletmeler i join planlar pl on pl.kod = i.plan_kod where i.id = v_isletme;
  select count(*) into v_sayi from magazalar where isletme_id = v_isletme and aktif;
  if v_sayi >= v_limit then
    raise exception 'Planınız en fazla % şubeye izin veriyor. Planı yükseltin.', v_limit;
  end if;

  insert into magazalar (isletme_id, ad, kod)
  values (v_isletme, btrim(p_ad), upper(btrim(p_kod)))
  returning id into v_id;

  perform log_ekle('MAGAZA_EKLE', 'magazalar', v_id::text, '',
                   jsonb_build_object('ad', p_ad, 'kod', p_kod));
  return jsonb_build_object('id', v_id, 'ad', btrim(p_ad), 'kod', upper(btrim(p_kod)));
end $$;

-- ── İşletme kurumsal bilgileri ───────────────────────────────────────
/*
 * Yalnızca kurumsal alanlar. Plan/durum/bitiş tarihi gibi TİCARİ alanlar
 * buradan değiştirilemez: onlar platform veya ödeme sağlayıcısı
 * tarafından güncellenir.
 */
create or replace function isletme_guncelle(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_isletme uuid := aktif_isletme();
begin
  if not yonetici_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if btrim(coalesce(p->>'ad', '')) = '' then raise exception 'İşletme adı gerekli.'; end if;
  update isletmeler set
    ad = btrim(p->>'ad'),
    eposta = coalesce(p->>'eposta', eposta),
    telefon = coalesce(p->>'telefon', telefon),
    vergi_dairesi = coalesce(p->>'vergiDairesi', vergi_dairesi),
    vergi_no = coalesce(p->>'vergiNo', vergi_no),
    adres = coalesce(p->>'adres', adres)
   where id = v_isletme;
  perform log_ekle('ISLETME_GUNCELLE', 'isletmeler', v_isletme::text, '', p);
  return abonelik_ozeti();
end $$;

-- ── Kasa listesi ve markalar ─────────────────────────────────────────
create or replace function hareketler_listesi()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'tarih', to_char(h.tarih, 'YYYY-MM-DD'), 'yon', h.yon,
    'ana', h.ana_kategori, 'alt', h.alt_kategori, 'tutar', h.tutar,
    'hesap', hs.ad, 'aciklama', h.aciklama, 'kaydeden', h.kaydeden,
    'kaynak', h.kaynak, 'kaynakId', coalesce(h.odeme_id::text, '')
  ) order by h.tarih desc), '[]'::jsonb)
  from hareketler h join hesaplar hs on hs.id = h.hesap_id
  where not h.silindi
$$;

create or replace function marka_ekle(p_kategori text, p_marka text)
returns boolean language plpgsql as $$
declare v_kat uuid;
begin
  if btrim(coalesce(p_kategori, '')) = '' or btrim(coalesce(p_marka, '')) = '' then
    raise exception 'Kategori ve marka gerekli.';
  end if;
  select id into v_kat from urun_kategorileri
   where isletme_id = aktif_isletme() and ad = btrim(p_kategori);
  if v_kat is null then raise exception 'Kategori bulunamadı: %', p_kategori; end if;
  insert into markalar (kategori_id, ad) values (v_kat, btrim(p_marka))
  on conflict (kategori_id, lower(ad)) do nothing;
  if not found then raise exception 'Bu marka zaten kayıtlı.'; end if;
  perform log_ekle('MARKA_EKLE', 'markalar', btrim(p_kategori), '',
                   jsonb_build_object('marka', p_marka));
  return true;
end $$;

create or replace function marka_sil(p_kategori text, p_marka text)
returns boolean language plpgsql as $$
begin
  delete from markalar m using urun_kategorileri k
   where m.kategori_id = k.id and k.ad = btrim(p_kategori) and m.ad = btrim(p_marka);
  if not found then return false; end if;
  perform log_ekle('MARKA_SIL', 'markalar', btrim(p_kategori), '',
                   jsonb_build_object('marka', p_marka));
  return true;
end $$;

-- ── KVKK / veri taşınabilirliği ──────────────────────────────────────
/*
 * İşletmenin tüm verisini tek JSON olarak döner. Hem KVKK/GDPR veri
 * taşınabilirliği yükümlülüğü için, hem de "verim bende kalsın" diyen
 * müşteri için. Abonelik kapanmış olsa da çalışır (okuma serbesttir).
 */
create or replace function isletme_verisi_aktar()
returns jsonb language plpgsql stable as $$
declare v_isletme uuid := aktif_isletme();
begin
  if not yonetici_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  return jsonb_build_object(
    'aktarmaZamani', to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    'isletme', (select to_jsonb(i) from isletmeler i where i.id = v_isletme),
    'magazalar', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                    from magazalar m where m.isletme_id = v_isletme),
    'kullanicilar', kullanici_listesi(),
    'ayarlar', (select coalesce(jsonb_object_agg(anahtar, deger), '{}'::jsonb)
                  from ayarlar where isletme_id = v_isletme),
    'personel', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                   from personel p where p.isletme_id = v_isletme),
    'urunKategorileri', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                           from urun_kategorileri k where k.isletme_id = v_isletme),
    'markalar', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                   from markalar m where m.isletme_id = v_isletme),
    'hesaplar', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
                   from hesaplar h where h.isletme_id = v_isletme),
    'kasaKategorileri', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                           from kasa_kategorileri k where k.isletme_id = v_isletme),
    'musteriler', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                     from musteriler m where m.isletme_id = v_isletme),
    'siparisler', (select coalesce(jsonb_agg(siparis_json(s.id)), '[]'::jsonb)
                     from siparisler s where s.isletme_id = v_isletme),
    'hareketler', hareketler_listesi(),
    'hedefler', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
                   from hedefler h where h.isletme_id = v_isletme),
    'cariPlan', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                   from cari_plan c where c.isletme_id = v_isletme),
    'tekrarlayan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                      from tekrarlayan t where t.isletme_id = v_isletme)
  );
end $$;

revoke execute on function kullanici_listesi(), profil_olustur(text, text, text, text),
  kullanici_durum_degistir(text, boolean), magaza_ekle(text, text), isletme_guncelle(jsonb),
  hareketler_listesi(), marka_ekle(text, text), marka_sil(text, text),
  isletme_verisi_aktar()
  from public, anon;

grant execute on function kullanici_listesi(), profil_olustur(text, text, text, text),
  kullanici_durum_degistir(text, boolean), magaza_ekle(text, text), isletme_guncelle(jsonb),
  hareketler_listesi(), marka_ekle(text, text), marka_sil(text, text),
  isletme_verisi_aktar()
  to authenticated;
