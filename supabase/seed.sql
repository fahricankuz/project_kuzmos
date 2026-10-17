-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · Başlangıç verisi (PLATFORM)
--
-- Burada yalnızca ürünün kendisine ait veri bulunur: satış paketleri.
-- İşletmeye ait listeler (kategori, marka, ayar, kasa ağacı) kayıt
-- sırasında isletme_olustur() tarafından o işletme için oluşturulur.
--
-- Tekrar çalıştırmak güvenlidir.
-- ═══════════════════════════════════════════════════════════════════════

insert into planlar (kod, ad, aylik_fiyat, yillik_fiyat, max_kullanici, max_magaza, ozellikler, sira)
values
  ('deneme', 'Deneme', 0, 0, 3, 1,
   '{"deneme_gun":14,"kasa":true,"rapor":true,"destek":"e-posta"}', 0),
  ('temel', 'Temel', 790, 7900, 3, 1,
   '{"kasa":true,"rapor":true,"destek":"e-posta"}', 1),
  ('pro', 'Pro', 1490, 14900, 10, 3,
   '{"kasa":true,"rapor":true,"coklu_sube":true,"destek":"telefon"}', 2),
  ('zincir', 'Zincir', 2990, 29900, 50, 25,
   '{"kasa":true,"rapor":true,"coklu_sube":true,"api":true,"destek":"oncelikli"}', 3)
on conflict (kod) do update set
  ad = excluded.ad,
  max_kullanici = excluded.max_kullanici,
  max_magaza = excluded.max_magaza,
  ozellikler = excluded.ozellikler,
  sira = excluded.sira;

-- Not: fiyatlar örnektir; planlar tablosundan güncellenir, koda gömülü değildir.
