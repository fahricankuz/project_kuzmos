-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0007 — İşletme logosu (Supabase Storage)
--
-- Sipariş numarası ürün ön ekiyle sabittir (KUZ-10-26-0001); sipariş
-- formunda işletmeyi LOGOSU temsil eder. Logo dosyaları 'logolar'
-- kovasında, her işletme kendi klasöründe tutulur:
--
--     logolar/<isletme_id>/logo.png
--
-- Yazma yetkisi klasör adının işletmenin id'sine eşit olmasına bağlıdır;
-- bir işletme başka bir işletmenin klasörüne yazamaz. Okuma herkese
-- açıktır (logo zaten basılı evrakta görünür).
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logolar', 'logolar', true, 1048576,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = excluded.allowed_mime_types;

/* Klasör adı = işletme id'si mi? */
create or replace function logo_klasoru_mu(p_ad text)
returns boolean language sql stable as $$
  select p_ad is not null and p_ad = aktif_isletme()::text
$$;

drop policy if exists logo_oku on storage.objects;
create policy logo_oku on storage.objects for select
  using (bucket_id = 'logolar');

drop policy if exists logo_yaz on storage.objects;
create policy logo_yaz on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logolar'
    and logo_klasoru_mu((storage.foldername(name))[1])
    and yonetici_mi()
    and yazma_izni()
  );

drop policy if exists logo_guncelle on storage.objects;
create policy logo_guncelle on storage.objects for update to authenticated
  using (bucket_id = 'logolar' and logo_klasoru_mu((storage.foldername(name))[1]) and yonetici_mi())
  with check (bucket_id = 'logolar' and logo_klasoru_mu((storage.foldername(name))[1]));

drop policy if exists logo_sil on storage.objects;
create policy logo_sil on storage.objects for delete to authenticated
  using (bucket_id = 'logolar' and logo_klasoru_mu((storage.foldername(name))[1]) and yonetici_mi());

/* Logo adresini işletme ayarına yazar (ayarlar.logo_url). */
create or replace function logo_kaydet(p_url text)
returns jsonb language plpgsql as $$
begin
  if not yonetici_mi() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  insert into ayarlar (isletme_id, anahtar, deger, aciklama)
  values (aktif_isletme(), 'logo_url', coalesce(btrim(p_url), ''),
          'Sipariş formunda görünen işletme logosu')
  on conflict (isletme_id, anahtar) do update set deger = excluded.deger;
  perform log_ekle('LOGO_KAYDET', 'ayarlar', 'logo_url', '',
                   jsonb_build_object('url', p_url));
  return ayar_paketi();
end $$;

revoke execute on function logo_kaydet(text) from public, anon;
revoke execute on function logo_klasoru_mu(text) from public, anon;
grant execute on function logo_kaydet(text), logo_klasoru_mu(text) to authenticated;
