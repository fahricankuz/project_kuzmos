-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · 0003 — Güvenlik (RLS)
--
-- Çok kiracılı bir SaaS'ta en büyük risk kiracı sızıntısıdır: bir optik
-- işletmesinin başka bir işletmenin verisini görmesi. Bu yüzden yetki
-- arayüzde değil VERİTABANINDA, iki katmanlı kurulur:
--
--   1. KİRACI İZOLASYONU — her politika önce isletme_id = aktif_isletme()
--      kontrolünü yapar. Tarayıcıdan doğrudan sorgu atan biri de bu
--      sınırın dışına çıkamaz (test/db/izolasyon.test.js).
--   2. ROL — sahip / yonetici / muhasebe / magaza.
--
-- Ayrıca:
--   · ABONELİK KAPISI: süresi dolan işletme SALT OKUNUR olur. Verisini
--     görür ve dışa aktarır, yeni kayıt giremez (yazma_izni()).
--   · ABONELİK ALANLARI kiracıya kapalıdır: plan/durum/bitiş tarihini
--     kendi değiştiremez (isletmeler tablosunda update politikası yok;
--     ticari bilgiler yalnızca platform veya ödeme webhook'u ile değişir).
--   · PLATFORM YÖNETİCİSİ (Kuzmos ekibi) abonelik ve kullanım verisini
--     görür; kiracıların iş verisine (sipariş, müşteri, kasa) ERİŞEMEZ.
-- ═══════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

alter table planlar                enable row level security;
alter table isletmeler             enable row level security;
alter table abonelik_hareketleri   enable row level security;
alter table platform_yoneticileri  enable row level security;
alter table magazalar              enable row level security;
alter table profiller              enable row level security;
alter table personel               enable row level security;
alter table urun_kategorileri      enable row level security;
alter table markalar               enable row level security;
alter table hesaplar               enable row level security;
alter table kasa_kategorileri      enable row level security;
alter table ayarlar                enable row level security;
alter table musteriler             enable row level security;
alter table siparisler             enable row level security;
alter table siparis_sayaclari      enable row level security;
alter table siparis_urunleri       enable row level security;
alter table odemeler               enable row level security;
alter table hareketler             enable row level security;
alter table hedefler               enable row level security;
alter table cari_plan               enable row level security;
alter table banka_dogrulama        enable row level security;
alter table tekrarlayan            enable row level security;
alter table log                    enable row level security;

-- ══ Platform katmanı ══════════════════════════════════════════════════

grant select on planlar to anon, authenticated;
create policy oku_herkes on planlar for select to anon, authenticated using (aktif);
create policy yaz_platform on planlar for all to authenticated
  using (platform_mi()) with check (platform_mi());

-- UPDATE hakkı tablo düzeyinde verilir ama politika yalnızca platform
-- yöneticisine izin verir: kiracı kendi planını/durumunu değiştiremez.
grant select, update on isletmeler to authenticated;
create policy oku_kendi_isletme on isletmeler for select to authenticated
  using (id = aktif_isletme() or platform_mi());
/* Kiracı için UPDATE politikası YOK: ticari alanlar (plan, durum, bitiş)
   kendi değiştirilemez. Kurumsal bilgiler isletme_guncelle() ile değişir. */
create policy yaz_platform on isletmeler for update to authenticated
  using (platform_mi()) with check (platform_mi());

grant select on abonelik_hareketleri to authenticated;
create policy oku_kendi on abonelik_hareketleri for select to authenticated
  using ((isletme_id = aktif_isletme() and yonetici_mi()) or platform_mi());
create policy yaz_platform on abonelik_hareketleri for all to authenticated
  using (platform_mi()) with check (platform_mi());

grant select on platform_yoneticileri to authenticated;
create policy oku_platform on platform_yoneticileri for select to authenticated
  using (platform_mi());

-- ══ Kiracı katmanı ════════════════════════════════════════════════════

-- ── Şubeler ──────────────────────────────────────────────────────────
grant select, insert, update, delete on magazalar to authenticated;
create policy oku_isletme on magazalar for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_yonetici on magazalar for all to authenticated
  using (isletme_erisimi(isletme_id) and yonetici_mi())
  with check (isletme_erisimi(isletme_id) and yonetici_mi() and yazma_izni());

-- ── Profiller: kendi satırı + işletme içi yönetim ────────────────────
grant select, insert, update, delete on profiller to authenticated;
create policy oku_kendi_veya_isletme on profiller for select to authenticated
  using (id = auth.uid() or (isletme_erisimi(isletme_id) and finans_mi()));
create policy yaz_yonetici on profiller for all to authenticated
  using (isletme_erisimi(isletme_id) and yonetici_mi())
  with check (isletme_erisimi(isletme_id) and yonetici_mi());

-- ── Referans listeler: işletme içinde okunur, yönetici yazar ─────────
grant select, insert, update, delete on
  urun_kategorileri, markalar, hesaplar, kasa_kategorileri, ayarlar, personel
  to authenticated;

create policy oku_isletme on urun_kategorileri for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_yonetici on urun_kategorileri for all to authenticated
  using (isletme_erisimi(isletme_id) and yonetici_mi())
  with check (isletme_erisimi(isletme_id) and yonetici_mi() and yazma_izni());

create policy oku_isletme on markalar for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_yonetici on markalar for all to authenticated
  using (isletme_erisimi(isletme_id) and yonetici_mi())
  with check (isletme_erisimi(isletme_id) and yonetici_mi() and yazma_izni());

create policy oku_isletme on hesaplar for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_finans on hesaplar for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());

create policy oku_isletme on kasa_kategorileri for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_finans on kasa_kategorileri for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());

create policy oku_isletme on ayarlar for select to authenticated
  using (isletme_erisimi(isletme_id));
create policy yaz_yonetici on ayarlar for all to authenticated
  using (isletme_erisimi(isletme_id) and yonetici_mi())
  with check (isletme_erisimi(isletme_id) and yonetici_mi() and yazma_izni());

create policy oku_magaza on personel for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy yaz_finans on personel for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());

-- ── Müşteriler ───────────────────────────────────────────────────────
grant select, insert, update, delete on musteriler to authenticated;
create policy oku_magaza on musteriler for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy ekle_magaza on musteriler for insert to authenticated
  with check (magaza_erisimi(magaza_id) and yazma_izni());
create policy guncelle_magaza on musteriler for update to authenticated
  using (magaza_erisimi(magaza_id))
  with check (magaza_erisimi(magaza_id) and yazma_izni());
create policy sil_finans on musteriler for delete to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi());

-- ── Siparişler ───────────────────────────────────────────────────────
grant select, insert, update, delete on siparisler to authenticated;
create policy oku_magaza on siparisler for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy ekle_magaza on siparisler for insert to authenticated
  with check (magaza_erisimi(magaza_id) and yazma_izni());
create policy guncelle_magaza on siparisler for update to authenticated
  using (magaza_erisimi(magaza_id))
  with check (magaza_erisimi(magaza_id) and yazma_izni());
/* Kalıcı silme yalnızca muhasebe/yönetici/sahip (mağaza çöp kutusu kullanır) */
create policy sil_finans on siparisler for delete to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi());

/* siparis_sayaclari: politika YOK → yalnızca siparis_no_uret() erişir. */

-- ── Ürün satırları ve ödemeler: bağlı siparişin yetkisini alır ───────
grant select, insert, update, delete on siparis_urunleri, odemeler to authenticated;

create policy siparis_uzerinden on siparis_urunleri for all to authenticated
  using (exists (select 1 from siparisler s
                  where s.id = siparis_urunleri.siparis_id and magaza_erisimi(s.magaza_id)))
  with check (exists (select 1 from siparisler s
                  where s.id = siparis_urunleri.siparis_id and magaza_erisimi(s.magaza_id))
              and yazma_izni());

create policy siparis_uzerinden on odemeler for all to authenticated
  using (exists (select 1 from siparisler s
                  where s.id = odemeler.siparis_id and magaza_erisimi(s.magaza_id)))
  with check (exists (select 1 from siparisler s
                  where s.id = odemeler.siparis_id and magaza_erisimi(s.magaza_id))
              and yazma_izni());

-- ── Kasa hareketleri ─────────────────────────────────────────────────
-- Mağaza rolü kasanın tamamını göremez: yalnızca kendi girdiği masraflar.
-- Masraf ekleme/silme magaza_masraf_ekle() / magaza_masraf_sil() ile yapılır.
-- Sipariş tahsilatından doğan hareket (kaynak='SIPARIS') hiçbir rol
-- tarafından elle değiştirilemez veya silinemez.
grant select, insert, update, delete on hareketler to authenticated;

create policy oku_finans_veya_kendi_masrafi on hareketler for select to authenticated
  using (
    (isletme_erisimi(isletme_id) and finans_mi())
    or (kaynak = 'MAGAZA_MASRAF' and magaza_erisimi(magaza_id))
  );
create policy ekle_finans on hareketler for insert to authenticated
  with check (isletme_erisimi(isletme_id) and finans_mi() and kaynak <> 'SIPARIS'
              and yazma_izni());
create policy guncelle_finans on hareketler for update to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi() and kaynak <> 'SIPARIS')
  with check (isletme_erisimi(isletme_id) and finans_mi() and kaynak <> 'SIPARIS'
              and yazma_izni());
create policy sil_finans on hareketler for delete to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi() and kaynak <> 'SIPARIS');

-- ── Hedefler ─────────────────────────────────────────────────────────
grant select, insert, update, delete on hedefler to authenticated;
create policy oku_magaza on hedefler for select to authenticated
  using (magaza_erisimi(magaza_id));
create policy yaz_finans on hedefler for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());

-- ── Yalnızca finans: planlanan ödeme, banka doğrulama, tekrarlayan ───
grant select, insert, update, delete on cari_plan, banka_dogrulama, tekrarlayan
  to authenticated;

create policy sadece_finans on cari_plan for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());
create policy sadece_finans on banka_dogrulama for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());
create policy sadece_finans on tekrarlayan for all to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi())
  with check (isletme_erisimi(isletme_id) and finans_mi() and yazma_izni());

-- ── Günlük: finans okur, kimse elle yazmaz ───────────────────────────
grant select on log to authenticated;
create policy oku_finans on log for select to authenticated
  using (isletme_erisimi(isletme_id) and finans_mi());

-- ── Görünümler ───────────────────────────────────────────────────────
-- security_invoker: altındaki tabloların RLS'i uygulanır, yani kiracı
-- izolasyonu görünümlerde de geçerlidir.
alter view v_siparisler set (security_invoker = on);
alter view v_gunluk_tahsilat set (security_invoker = on);
alter view v_personel_tahsilat set (security_invoker = on);
alter view v_magaza_masraflari set (security_invoker = on);

grant select on v_siparisler, v_gunluk_tahsilat, v_personel_tahsilat,
                v_magaza_masraflari to authenticated;

-- ── Fonksiyon yetkileri ──────────────────────────────────────────────
-- Postgres yeni fonksiyonlara VARSAYILAN olarak PUBLIC execute hakkı verir;
-- 'authenticated' rolünden geri almak yetmez, PUBLIC'ten de alınmalıdır.
revoke all on siparis_sayaclari from anon, authenticated;

revoke execute on function siparis_no_uret(uuid, date) from public, anon, authenticated;
revoke execute on function hesap_sagla(uuid, text, hesap_tipi) from public, anon, authenticated;
revoke execute on function kasa_kategori_sagla(uuid, text, text, hareket_yonu, kategori_bolumu)
  from public, anon, authenticated;
revoke execute on function siparis_yenile(uuid) from public, anon, authenticated;
revoke execute on function siparis_tahsilat(uuid) from public, anon, authenticated;
revoke execute on function ayar_metin(uuid, text, text) from public, anon, authenticated;
revoke execute on function ayar_sayi(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function log_yaz() from public, anon, authenticated;
revoke execute on function guncelleme_damgala() from public, anon, authenticated;
revoke execute on function isletme_damgala() from public, anon, authenticated;
revoke execute on function siparis_hazirla() from public, anon, authenticated;
revoke execute on function siparis_yenile_trg() from public, anon, authenticated;
revoke execute on function siparis_durum_degisti() from public, anon, authenticated;
revoke execute on function odeme_hareketi_yaz() from public, anon, authenticated;
revoke execute on function siparis_silindi_yayilsin() from public, anon, authenticated;
revoke execute on function aktif_profil() from public, anon, authenticated;

-- Oturum yardımcıları RLS politikalarının İÇİNDE çalışır: 'authenticated'
-- bunları çağırabilmek zorundadır.
revoke execute on function aktif_rol() from public, anon;
revoke execute on function aktif_isletme() from public, anon;
revoke execute on function aktif_magaza() from public, anon;
revoke execute on function aktif_ad() from public, anon;
revoke execute on function finans_mi() from public, anon;
revoke execute on function yonetici_mi() from public, anon;
revoke execute on function sahip_mi() from public, anon;
revoke execute on function platform_mi() from public, anon;
revoke execute on function isletme_erisimi(uuid) from public, anon;
revoke execute on function magaza_erisimi(uuid) from public, anon;
revoke execute on function abonelik_yazabilir(uuid) from public, anon;
revoke execute on function yazma_izni() from public, anon;
revoke execute on function varsayilan_magaza() from public, anon;

grant execute on function aktif_rol(), aktif_isletme(), aktif_magaza(), aktif_ad(),
                          finans_mi(), yonetici_mi(), sahip_mi(), platform_mi(),
                          isletme_erisimi(uuid), magaza_erisimi(uuid),
                          abonelik_yazabilir(uuid), yazma_izni(), varsayilan_magaza()
  to authenticated;

-- Mağazanın kullanması gereken uçlar
revoke execute on function kasa_ozeti(text, text, uuid) from public, anon;
revoke execute on function magaza_masraf_ekle(text, numeric, date, text, text, text)
  from public, anon;
revoke execute on function magaza_masraf_sil(uuid, text) from public, anon;
revoke execute on function marka_sagla(text, text) from public, anon;
revoke execute on function personel_sagla(text, uuid) from public, anon;

grant execute on function kasa_ozeti(text, text, uuid),
                          magaza_masraf_ekle(text, numeric, date, text, text, text),
                          magaza_masraf_sil(uuid, text),
                          marka_sagla(text, text),
                          personel_sagla(text, uuid)
  to authenticated;
