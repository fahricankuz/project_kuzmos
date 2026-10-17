-- ═══════════════════════════════════════════════════════════════════════
-- Kuzmos · Başlangıç verisi
--
-- Tekrar tekrar çalıştırmak güvenlidir (on conflict do nothing): var olan
-- kayıtlara ve girilmiş verilere dokunmaz.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Şube ─────────────────────────────────────────────────────────────
insert into magazalar (ad, kod) values ('Damlakuz Optik', 'DK')
on conflict (kod) do nothing;

-- ── Ayarlar ──────────────────────────────────────────────────────────
insert into ayarlar (anahtar, deger, aciklama) values
  ('nakit_hesap', 'Nakit Kasa', 'Nakit tahsilat/masrafların işlendiği hesap'),
  ('acilis_kasa', '0', 'Sistem başlangıç kasası'),
  ('acilis_borc', '0', 'Açılıştaki KK/KMH toplam borcu'),
  ('bankalar', 'Akbank, QNB, Garanti, İş Bankası, Yapı Kredi, Ziraat, Halkbank, TZH Vakıf, TEB',
   'Kredi kartı tahsilatında seçilebilecek bankalar'),
  ('taksitler', 'Tek çekim, 2 Taksit, 3 Taksit, 4 Taksit, 5 Taksit, 6 Taksit, Diğer',
   'Kredi kartı taksit seçenekleri'),
  ('kk_komisyon',
   'Tek çekim:3.5, 2 Taksit:7, 3 Taksit:9, 4 Taksit:10.69, 5 Taksit:12.49, 6 Taksit:14.49, Diğer:14.49',
   'Taksit bazlı banka komisyon oranları (%)'),
  ('personel_prim', '4.5', 'Tahsilat üzerinden personel prim oranı (%)'),
  ('magaza_masraf_kalemleri',
   'Mağaza Günlük Kasa Masrafı, Temizlik / Sarf, Bakım / Onarım, Kargo, Yemek, Diğer Masraf',
   'Mağazanın girebileceği masraf kalemleri'),
  ('magaza_masraf_ana_kategori', 'Masraflar', 'Mağaza masraflarının yazıldığı ana kategori')
on conflict (anahtar) do nothing;

-- ── Hesaplar ─────────────────────────────────────────────────────────
insert into hesaplar (ad, tip, sira) values ('Nakit Kasa', 'kasa', 1)
on conflict (ad) do nothing;

-- ── Ürün kategorileri (KDV) ──────────────────────────────────────────
insert into urun_kategorileri (ad, kdv, ikon, sira) values
  ('Optik Çerçeve', 10, '👓', 1),
  ('Optik Cam', 10, '⭕', 2),
  ('Güneş Gözlüğü', 20, '🕶️', 3),
  ('Lens', 10, '👁️', 4),
  ('Solüsyon', 10, '💧', 5),
  ('Tamir/Aksesuar', 20, '🔧', 6),
  ('Optik Yedek Parça', 10, '⚙️', 7),
  ('Güneş Yedek Parça', 20, '🛠️', 8)
on conflict (ad) do nothing;

-- ── Markalar (örnek liste; Ayarlar'dan düzenlenir) ───────────────────
insert into markalar (kategori_id, ad)
select k.id, m.ad
from (values
  ('Optik Cam', 'Seiko'), ('Optik Cam', 'Essilor'), ('Optik Cam', 'Optiswiss'),
  ('Optik Cam', 'Zeiss'), ('Optik Cam', 'Hoya'),
  ('Optik Çerçeve', 'Ray-Ban'), ('Optik Çerçeve', 'Vogue'), ('Optik Çerçeve', 'Emporio Armani'),
  ('Güneş Gözlüğü', 'Ray-Ban'), ('Güneş Gözlüğü', 'Oakley'), ('Güneş Gözlüğü', 'Persol'),
  ('Lens', 'Acuvue'), ('Lens', 'Bausch + Lomb'), ('Lens', 'Alcon'),
  ('Solüsyon', 'Renu'), ('Solüsyon', 'Opti-Free')
) as m(kategori, ad)
join urun_kategorileri k on k.ad = m.kategori
on conflict (kategori_id, lower(ad)) do nothing;

-- ── Satış personeli (giriş hesabı değil) ─────────────────────────────
insert into personel (magaza_id, ad, prim_muaf, sira)
select g.id, p.ad, p.prim_muaf, p.sira
from magazalar g,
     (values ('Erdoğan Günay', false, 1), ('Sema İpek', false, 2),
             ('Şuayip Önür', false, 3), ('Nursu', false, 4),
             ('Fahri Can Kuz', true, 5)) as p(ad, prim_muaf, sira)
where g.kod = 'DK'
on conflict (magaza_id, ad) do nothing;

-- ── Kasa kategori ağacı ──────────────────────────────────────────────
insert into kasa_kategorileri (ana, alt, yon, bolum, sira)
select k.ana, alt, k.yon::hareket_yonu, k.bolum::kategori_bolumu, k.sira
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
on conflict (ana, alt) do nothing;
