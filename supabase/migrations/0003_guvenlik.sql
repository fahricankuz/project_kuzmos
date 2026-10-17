-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0003 — Güvenlik (RLS politikaları)
--
-- Yetki artık arayüzde değil, VERİTABANINDA. Tarayıcıdan gelen istek
-- doğrudan Postgres'e gider; politikalar geçmezse satır hiç dönmez.
-- Üç rol:
--   yonetici  — her şey + kullanıcı/ayar yönetimi
--   muhasebe  — tüm kasa/sipariş verisi, kullanıcı yönetemez
--   magaza    — yalnızca kendi şubesi; kasanın tamamını GÖRMEZ, sadece
--               kendi girdiği masrafları ve kasa_ozeti() çıktısını görür
-- ═══════════════════════════════════════════════════════════════════════

-- Tarayıcıdan gelen oturumlar 'authenticated' rolüyle bağlanır.
grant usage on schema public to anon, authenticated;

alter table magazalar            enable row level security;
alter table profiller            enable row level security;
alter table personel             enable row level security;
alter table urun_kategorileri    enable row level security;
alter table markalar             enable row level security;
alter table hesaplar             enable row level security;
alter table kasa_kategorileri    enable row level security;
alter table ayarlar              enable row level security;
alter table musteriler           enable row level security;
alter table siparisler           enable row level security;
alter table siparis_sayaclari    enable row level security;
alter table siparis_urunleri     enable row level security;
alter table odemeler             enable row level security;
alter table hareketler           enable row level security;
alter table hedefler             enable row level security;
alter table cari_plan            enable row level security;
alter table banka_dogrulama      enable row level security;
alter table tekrarlayan          enable row level security;
alter table log                  enable row level security;

-- ── Referans listeler: herkes okur, yönetici yazar ───────────────────
grant select on magazalar, urun_kategorileri, markalar, hesaplar,
                kasa_kategorileri, ayarlar, personel to authenticated;
grant insert, update, delete on urun_kategorileri, markalar, hesaplar,
                kasa_kategorileri, ayarlar, personel, magazalar to authenticated;

create policy oku_herkes on magazalar for select to authenticated using (true);
create policy yaz_yonetici on magazalar for all to authenticated
  using (aktif_rol() = 'yonetici') with check (aktif_rol() = 'yonetici');

create policy oku_herkes on urun_kategorileri for select to authenticated using (true);
create policy yaz_yonetici on urun_kategorileri for all to authenticated
  using (aktif_rol() = 'yonetici') with check (aktif_rol() = 'yonetici');

create policy oku_herkes on markalar for select to authenticated using (true);
create policy yaz_yonetici on markalar for all to authenticated
  using (aktif_rol() = 'yonetici') with check (aktif_rol() = 'yonetici');

create policy oku_herkes on hesaplar for select to authenticated using (true);
create policy yaz_finans on hesaplar for all to authenticated
  using (finans_mi()) with check (finans_mi());

create policy oku_herkes on kasa_kategorileri for select to authenticated using (true);
create policy yaz_finans on kasa_kategorileri for all to authenticated
  using (finans_mi()) with check (finans_mi());

create policy oku_herkes on ayarlar for select to authenticated using (true);
create policy yaz_yonetici on ayarlar for all to authenticated
  using (aktif_rol() = 'yonetici') with check (aktif_rol() = 'yonetici');

create policy oku_magaza on personel for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy yaz_finans on personel for all to authenticated
  using (finans_mi()) with check (finans_mi());

-- ── Profiller: kendi satırını görür, yönetici hepsini yönetir ────────
grant select on profiller to authenticated;
grant insert, update, delete on profiller to authenticated;

create policy oku_kendi on profiller for select to authenticated
  using (id = auth.uid() or finans_mi());
create policy yaz_yonetici on profiller for all to authenticated
  using (aktif_rol() = 'yonetici') with check (aktif_rol() = 'yonetici');

-- ── Müşteriler ───────────────────────────────────────────────────────
grant select, insert, update on musteriler to authenticated;
grant delete on musteriler to authenticated;

create policy oku_magaza on musteriler for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy ekle_magaza on musteriler for insert to authenticated
  with check (magaza_erisimi(magaza_id));
create policy guncelle_magaza on musteriler for update to authenticated
  using (magaza_erisimi(magaza_id)) with check (magaza_erisimi(magaza_id));
create policy sil_finans on musteriler for delete to authenticated
  using (finans_mi());

-- ── Siparişler ───────────────────────────────────────────────────────
grant select, insert, update on siparisler to authenticated;
grant delete on siparisler to authenticated;

create policy oku_magaza on siparisler for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy ekle_magaza on siparisler for insert to authenticated
  with check (magaza_erisimi(magaza_id));
create policy guncelle_magaza on siparisler for update to authenticated
  using (magaza_erisimi(magaza_id)) with check (magaza_erisimi(magaza_id));
-- Kalıcı silme yalnızca muhasebe/yönetici (mağaza "çöp kutusu" kullanır)
create policy sil_finans on siparisler for delete to authenticated
  using (finans_mi());

-- Sipariş numarası sayacı: sadece siparis_no_uret() (security definer)
-- erişir; doğrudan kimse okuyup yazamaz (politika yok = erişim yok).

-- ── Ürün satırları ve ödemeler: bağlı olduğu siparişin yetkisini alır ─
grant select, insert, update, delete on siparis_urunleri to authenticated;
grant select, insert, update, delete on odemeler to authenticated;

create policy siparis_uzerinden on siparis_urunleri for all to authenticated
  using (exists (select 1 from siparisler s
                  where s.id = siparis_urunleri.siparis_id and magaza_erisimi(s.magaza_id)))
  with check (exists (select 1 from siparisler s
                  where s.id = siparis_urunleri.siparis_id and magaza_erisimi(s.magaza_id)));

create policy siparis_uzerinden on odemeler for all to authenticated
  using (exists (select 1 from siparisler s
                  where s.id = odemeler.siparis_id and magaza_erisimi(s.magaza_id)))
  with check (exists (select 1 from siparisler s
                  where s.id = odemeler.siparis_id and magaza_erisimi(s.magaza_id)));

-- ── Kasa hareketleri ─────────────────────────────────────────────────
-- Mağaza rolü kasanın tamamını göremez: yalnızca kendi girdiği masraflar.
-- Masraf ekleme/silme magaza_masraf_ekle() / magaza_masraf_sil() ile yapılır.
grant select, insert, update, delete on hareketler to authenticated;

create policy oku_finans_veya_kendi_masrafi on hareketler for select to authenticated
  using (finans_mi() or (kaynak = 'MAGAZA_MASRAF' and magaza_erisimi(magaza_id)));
create policy ekle_finans on hareketler for insert to authenticated
  with check (finans_mi() and kaynak <> 'SIPARIS');
create policy guncelle_finans on hareketler for update to authenticated
  using (finans_mi() and kaynak <> 'SIPARIS')
  with check (finans_mi() and kaynak <> 'SIPARIS');
create policy sil_finans on hareketler for delete to authenticated
  using (finans_mi() and kaynak <> 'SIPARIS');

-- ── Hedefler: mağaza görür, finans belirler ──────────────────────────
grant select, insert, update, delete on hedefler to authenticated;

create policy oku_magaza on hedefler for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy yaz_finans on hedefler for all to authenticated
  using (finans_mi()) with check (finans_mi());

-- ── Yalnızca finans: planlanan ödeme, banka doğrulama, tekrarlayan ───
grant select, insert, update, delete on cari_plan, banka_dogrulama, tekrarlayan
  to authenticated;

create policy sadece_finans on cari_plan for all to authenticated
  using (finans_mi()) with check (finans_mi());
create policy sadece_finans on banka_dogrulama for all to authenticated
  using (finans_mi()) with check (finans_mi());
create policy sadece_finans on tekrarlayan for all to authenticated
  using (finans_mi()) with check (finans_mi());

-- ── Günlük: finans okur, kimse elle yazmaz/siler ─────────────────────
grant select on log to authenticated;
create policy oku_finans on log for select to authenticated using (finans_mi());

-- ── Görünüm ve fonksiyon hakları ─────────────────────────────────────
-- Görünümler security_invoker: altındaki tabloların RLS'i uygulanır.
alter view v_siparisler set (security_invoker = on);
alter view v_gunluk_tahsilat set (security_invoker = on);
alter view v_personel_tahsilat set (security_invoker = on);
alter view v_magaza_masraflari set (security_invoker = on);

grant select on v_siparisler, v_gunluk_tahsilat, v_personel_tahsilat,
                v_magaza_masraflari to authenticated;

grant execute on function kasa_ozeti(text, text) to authenticated;
grant execute on function magaza_masraf_ekle(text, numeric, date, text, text, text)
  to authenticated;
grant execute on function magaza_masraf_sil(uuid, text) to authenticated;
grant execute on function marka_sagla(text, text) to authenticated;
grant execute on function aktif_rol() to authenticated;
grant execute on function aktif_magaza() to authenticated;
grant execute on function finans_mi() to authenticated;

-- ── İç fonksiyonlara doğrudan erişimi kapat ──────────────────────────
-- Postgres yeni fonksiyonlara VARSAYILAN olarak PUBLIC execute hakkı verir;
-- 'authenticated' rolünden geri almak yetmez, PUBLIC'ten de alınmalıdır.
-- (Bu satırlar olmadan mağaza rolü siparis_no_uret() çağırıp sipariş
-- numarası sayacını yakabilir veya hesap_sagla() ile hesap açabilirdi.)
revoke all on siparis_sayaclari from anon, authenticated;

revoke execute on function siparis_no_uret(uuid, date) from public, anon, authenticated;
revoke execute on function hesap_sagla(text, hesap_tipi) from public, anon, authenticated;
revoke execute on function kasa_kategori_sagla(text, text, hareket_yonu, kategori_bolumu)
  from public, anon, authenticated;
revoke execute on function siparis_yenile(uuid) from public, anon, authenticated;
revoke execute on function siparis_tahsilat(uuid) from public, anon, authenticated;
revoke execute on function ayar_metin(text, text) from public, anon, authenticated;
revoke execute on function ayar_sayi(text, numeric) from public, anon, authenticated;
revoke execute on function log_yaz() from public, anon, authenticated;
revoke execute on function guncelleme_damgala() from public, anon, authenticated;
revoke execute on function siparis_hazirla() from public, anon, authenticated;
revoke execute on function siparis_yenile_trg() from public, anon, authenticated;
revoke execute on function siparis_durum_degisti() from public, anon, authenticated;
revoke execute on function odeme_hareketi_yaz() from public, anon, authenticated;
revoke execute on function siparis_silindi_yayilsin() from public, anon, authenticated;

-- Oturum yardımcıları RLS politikalarının İÇİNDE çalışır: 'authenticated'
-- bunları çağırabilmek zorundadır, yoksa hiçbir politika değerlendirilemez.
revoke execute on function aktif_rol() from public, anon;
revoke execute on function aktif_magaza() from public, anon;
revoke execute on function aktif_ad() from public, anon;
revoke execute on function finans_mi() from public, anon;
revoke execute on function magaza_erisimi(uuid) from public, anon;
grant execute on function magaza_erisimi(uuid) to authenticated;
grant execute on function aktif_ad() to authenticated;

-- Mağazanın kullanması gereken uçlar (açıkça izinli)
revoke execute on function kasa_ozeti(text, text) from public, anon;
revoke execute on function magaza_masraf_ekle(text, numeric, date, text, text, text)
  from public, anon;
revoke execute on function magaza_masraf_sil(uuid, text) from public, anon;
revoke execute on function marka_sagla(text, text) from public, anon;
