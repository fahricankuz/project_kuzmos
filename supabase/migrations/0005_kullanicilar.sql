-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0005 — Kullanıcı yönetimi ve küçük uçlar
--
-- Supabase'de şifreler auth.users'da tutulur ve oradan okunamaz. Yönetici
-- ekranı bu yüzden profil tablosu üzerinden çalışır:
--   · kullanıcı ekleme: tarayıcı auth.signUp çağırır, ardından bu profil
--     satırını açar (ikisi de 'anon' anahtarıyla, RLS kontrolünde)
--   · pasife alma: profiller.aktif = false → tüm RLS kontrolleri kapanır
--   · şifre: kullanıcı kendi şifresini auth.updateUser ile değiştirir
-- ═══════════════════════════════════════════════════════════════════════

alter table profiller add column if not exists eposta text not null default '';

create or replace function kullanici_listesi()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', p.eposta,
    'ad', p.ad,
    'rol', p.rol,
    'aktif', p.aktif,
    'magaza', coalesce(m.ad, ''),
    'sonGiris', ''
  ) order by p.rol, p.ad), '[]'::jsonb)
  from profiller p left join magazalar m on m.id = p.magaza_id
$$;

/* Yeni kullanıcının profilini açar (auth kaydı tarayıcıda signUp ile yapılır). */
create or replace function profil_olustur(
  p_eposta text, p_ad text, p_rol text, p_magaza_kod text default null
) returns boolean language plpgsql as $$
declare
  v_uid    uuid;
  v_magaza uuid;
begin
  if aktif_rol() <> 'yonetici' then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_eposta));
  if v_uid is null then
    raise exception 'Bu e-posta ile bir hesap bulunamadı: %', p_eposta;
  end if;
  if p_rol::rol_tipi = 'magaza' then
    select id into v_magaza from magazalar
     where kod = coalesce(btrim(p_magaza_kod), 'DK') limit 1;
    if v_magaza is null then raise exception 'Şube bulunamadı: %', p_magaza_kod; end if;
  end if;

  insert into profiller (id, magaza_id, ad, rol, eposta)
  values (v_uid, v_magaza, btrim(p_ad), p_rol::rol_tipi, lower(btrim(p_eposta)))
  on conflict (id) do update
    set ad = excluded.ad, rol = excluded.rol, magaza_id = excluded.magaza_id,
        eposta = excluded.eposta, aktif = true;

  perform log_ekle('KULLANICI_EKLE', 'profiller', v_uid::text, '',
                   jsonb_build_object('eposta', p_eposta, 'rol', p_rol));
  return true;
end $$;

create or replace function kullanici_durum_degistir(p_eposta text, p_aktif boolean)
returns boolean language plpgsql as $$
declare v_uid uuid;
begin
  if aktif_rol() <> 'yonetici' then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select id into v_uid from profiller where lower(eposta) = lower(btrim(p_eposta));
  if v_uid is null then raise exception 'Kullanıcı bulunamadı.'; end if;
  if v_uid = auth.uid() and not p_aktif then
    raise exception 'Kendi hesabınızı pasif yapamazsınız.';
  end if;
  update profiller set aktif = p_aktif where id = v_uid;
  perform log_ekle('KULLANICI_DURUM', 'profiller', v_uid::text, '',
                   jsonb_build_object('aktif', p_aktif));
  return true;
end $$;

/* Kasa ekranlarının arka planda tazelemesi için (tek sayfa okuması). */
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

/* Marka ekle/sil (Ayarlar ekranı) */
create or replace function marka_ekle(p_kategori text, p_marka text)
returns boolean language plpgsql as $$
declare v_kat uuid;
begin
  if btrim(coalesce(p_kategori, '')) = '' or btrim(coalesce(p_marka, '')) = '' then
    raise exception 'Kategori ve marka gerekli.';
  end if;
  select id into v_kat from urun_kategorileri where ad = btrim(p_kategori);
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

revoke execute on function kullanici_listesi() from public;
revoke execute on function profil_olustur(text, text, text, text) from public;
revoke execute on function kullanici_durum_degistir(text, boolean) from public;
revoke execute on function hareketler_listesi() from public;
revoke execute on function marka_ekle(text, text) from public;
revoke execute on function marka_sil(text, text) from public;

grant execute on function kullanici_listesi() to authenticated;
grant execute on function profil_olustur(text, text, text, text) to authenticated;
grant execute on function kullanici_durum_degistir(text, boolean) to authenticated;
grant execute on function hareketler_listesi() to authenticated;
grant execute on function marka_ekle(text, text) to authenticated;
grant execute on function marka_sil(text, text) to authenticated;
