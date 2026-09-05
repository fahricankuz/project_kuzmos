/**
 * Kuzmos — Kurulum ve güncelleme.
 *
 * ilkKurulum(...)      : sıfırdan kurulum (bir kez, parametrelerle).
 * guncellemeKurulum()  : var olan kuruluma yeni sayfa/ayarları ekler.
 *                        Parametresiz çalıştırılır, mevcut veriye dokunmaz.
 */

/** Başlangıç kasa kategori ağacı — firma/şahıs ismi içermez, örnek niteliğindedir. */
var VARSAYILAN_KASA_KATEGORILERI = [
  ['Nakit Satış', ['Mağaza Nakit', 'Merkez Kasa', 'Diğer Nakit'], 'GELIR', 'OP'],
  ['POS / Kredi Kartı Satışı', ['Diğer POS'], 'GELIR', 'OP'],
  ['Satış İadesi', ['Mağaza Nakit', 'Diğer POS'], 'GIDER', 'OP'],
  [
    'Mal Alış',
    ['Optik Çerçeve', 'Optik Cam', 'Güneş Gözlüğü', 'Lens', 'Solüsyon', 'Diğer Mal Alış'],
    'GIDER',
    'OP'
  ],
  [
    'Hizmet Giderleri',
    ['Muhasebe / Mali Müşavir', 'Yazılım / Abonelik', 'Kargo / Reklam', 'Sigorta', 'Diğer Hizmet'],
    'GIDER',
    'OP'
  ],
  ['Personel & SGK', ['Maaş', 'SGK Primi', 'Prim / İkramiye', 'Yemek', 'Diğer Personel'], 'GIDER', 'OP'],
  ['Kira & Aidat', ['Kira', 'Aidat'], 'GIDER', 'OP'],
  ['Fatura & Abonelik', ['Elektrik', 'Su / Doğalgaz', 'Telefon / İnternet'], 'GIDER', 'OP'],
  [
    'Masraflar',
    ['Mağaza Günlük Kasa Masrafı', 'Temizlik / Sarf', 'Bakım / Onarım', 'Kargo', 'Yemek', 'Diğer Masraf'],
    'GIDER',
    'OP'
  ],
  ['Banka & Komisyon', ['Kredi Kartı Komisyonu', 'Banka Masrafı', 'POS Ücreti'], 'GIDER', 'OP'],
  ['Vergi', ['KDV', 'Stopaj', 'Geçici / Kurumlar Vergisi', 'Diğer Vergi'], 'GIDER', 'OP'],
  ['Ortak / Sermaye Girişi', ['Ortak Girişi'], 'GELIR', 'FD'],
  ['Kredi / KMH Kullanımı', ['Banka Kredisi', 'Kredi Kartı / KMH'], 'GELIR', 'FD'],
  ['Diğer Faaliyet Dışı Gelir', ['Diğer Gelir'], 'GELIR', 'FD'],
  ['Ortak Çekiş', ['Ortak Çekişi'], 'GIDER', 'FD'],
  ['Kredi & Kart Ödemeleri', ['Kredi Anapara / Faiz', 'Kredi Kartı Ödemesi'], 'GIDER', 'FD'],
  ['Yatırım / Demirbaş', ['Demirbaş / Ekipman', 'Tadilat / Dekorasyon'], 'GIDER', 'FD'],
  ['Diğer Faaliyet Dışı Gider', ['Diğer Gider'], 'GIDER', 'FD']
];

/** Sipariş ürün kategorileri ve KDV oranları. */
var VARSAYILAN_URUN_KATEGORILERI = [
  ['Optik Çerçeve', 10, '👓'],
  ['Optik Cam', 10, '⭕'],
  ['Güneş Gözlüğü', 20, '🕶️'],
  ['Lens', 10, '👁️'],
  ['Solüsyon', 10, '💧'],
  ['Tamir/Aksesuar', 20, '🔧'],
  ['Optik Yedek Parça', 10, '⚙️'],
  ['Güneş Yedek Parça', 20, '🛠️']
];

/** Başlangıç marka listesi — örnektir, Ayarlar'dan düzenlenir/genişletilir. */
var VARSAYILAN_MARKALAR = [
  ['Optik Cam', ['Seiko', 'Essilor', 'Optiswiss', 'Zeiss', 'Hoya']],
  ['Optik Çerçeve', ['Ray-Ban', 'Vogue', 'Emporio Armani']],
  ['Güneş Gözlüğü', ['Ray-Ban', 'Oakley', 'Persol']],
  ['Lens', ['Acuvue', 'Bausch + Lomb', 'Alcon']],
  ['Solüsyon', ['Renu', 'Opti-Free']]
];

var VARSAYILAN_PERSONEL = [
  ['Erdoğan Günay', false],
  ['Sema İpek', false],
  ['Şuayip Önür', false],
  ['Nursu', false],
  ['Fahri Can Kuz', true]
];

function varsayilanAyarlariYaz_() {
  ayarVarsayilan_('acilis_kasa', '0', 'Sistem başlangıç kasası');
  ayarVarsayilan_('acilis_tarih', dstr_(new Date()), 'Açılış kasasının geçerli olduğu tarih');
  ayarVarsayilan_('hesaplar', 'Nakit Kasa', 'Hesap listesi (virgülle)');
  ayarVarsayilan_('acilis_borc', '0', 'Açılıştaki KK/KMH toplam borcu');
  ayarVarsayilan_('borc_hesaplari', '', 'KK/KMH borç hesapları (virgülle)');
  ayarVarsayilan_('nakit_hesap', 'Nakit Kasa', 'Nakit tahsilat/masrafların işlendiği hesap');
  ayarVarsayilan_(
    'bankalar',
    'Akbank, QNB, Garanti, İş Bankası, Yapı Kredi, Ziraat, Halkbank, TZH Vakıf, TEB',
    'Kredi kartı tahsilatında seçilebilecek bankalar'
  );
  ayarVarsayilan_(
    'taksitler',
    'Tek çekim, 2 Taksit, 3 Taksit, 4 Taksit, 5 Taksit, 6 Taksit, Diğer',
    'Kredi kartı taksit seçenekleri'
  );
  ayarVarsayilan_(
    'kk_komisyon',
    'Tek çekim:3.5, 2 Taksit:7, 3 Taksit:9, 4 Taksit:10.69, 5 Taksit:12.49, 6 Taksit:14.49, Diğer:14.49',
    'Taksit bazlı banka komisyon oranları (%)'
  );
  ayarVarsayilan_('personel_prim', '4.5', 'Tahsilat üzerinden personel prim oranı (%)');
  ayarVarsayilan_(
    'magaza_masraf_kalemleri',
    'Mağaza Günlük Kasa Masrafı, Temizlik / Sarf, Bakım / Onarım, Kargo, Yemek, Diğer Masraf',
    'Mağazanın girebileceği masraf kalemleri'
  );
  ayarVarsayilan_('magaza_masraf_ana_kategori', 'Masraflar', 'Mağaza masraflarının yazıldığı ana kategori');
  ayarVarsayilan_('siparis_no_onek', 'DK', 'Sipariş numarası ön eki');
  ayarVarsayilan_(
    'siparis_kasa_entegrasyon',
    'evet',
    'Sipariş tahsilatları kasaya otomatik işlensin mi? (evet/hayır)'
  );
}

/**
 * Var olan kuruluma yeni sayfaları ve varsayılan listeleri ekler.
 * Doldurulmuş sayfalara ve mevcut ayarlara dokunmaz; tekrar tekrar
 * çalıştırmak güvenlidir.
 */
function guncellemeKurulum() {
  /* Kasa modülü sayfaları */
  hareketSheet_();
  sheet_(SHEET_NAMES.CARI, ['Tedarikçi', 'Ay (YYYY-MM)', 'Planlanan Tutar', 'Not']);
  sheet_(SHEET_NAMES.BANKA, ['Tarih', 'Hesap', 'Gerçek Bakiye', 'Not']);
  sheet_(SHEET_NAMES.TEKRAR, [
    'Ad',
    'Ana Kategori',
    'Alt Kategori',
    'Tutar',
    'Ayın Günü',
    'Hesap',
    'Yön',
    'Aktif'
  ]);
  kullaniciSheet_();
  ayarSheet_();

  /* Sipariş modülü sayfaları */
  siparisSheet_();
  musteriSheet_();
  personelSheet_();
  markaSheet_();
  urunKategoriSheet_();

  /* Ortak */
  kasaKategoriSheet_();
  hedefSheet_();
  logSheet_();

  varsayilanAyarlariYaz_();

  /* Boşsa başlangıç listelerini doldur */
  if (kasaKategoriSheet_().getLastRow() < 2) {
    VARSAYILAN_KASA_KATEGORILERI.forEach(function (grup, i) {
      grup[1].forEach(function (alt) {
        kasaKategoriEkle_(grup[0], alt, grup[2], grup[3], i + 1);
      });
    });
  }
  if (urunKategoriSheet_().getLastRow() < 2) {
    VARSAYILAN_URUN_KATEGORILERI.forEach(function (k, i) {
      urunKategoriSheet_().appendRow([k[0], k[1], k[2], i + 1, true]);
    });
  }
  if (markaSheet_().getLastRow() < 2) {
    VARSAYILAN_MARKALAR.forEach(function (grup) {
      grup[1].forEach(function (marka) {
        markaSheet_().appendRow([grup[0], marka, true]);
      });
    });
  }
  if (personelSheet_().getLastRow() < 2) {
    VARSAYILAN_PERSONEL.forEach(function (p) {
      personelEkle_(p[0], p[1], '');
    });
  }

  return 'Güncelleme kurulumu tamamlandı.';
}

/**
 * KULLANIM: Apps Script editöründe bir kez, parametreleri doldurarak
 * çalıştırın:
 *
 *   ilkKurulum(
 *     "KASA_SPREADSHEET_ID",
 *     "yonetici@sirket.com",
 *     "Ad Soyad",
 *     "en-az-8-karakterlik-gecici-sifre"
 *   );
 */
function ilkKurulum(kasaSpreadsheetId, yoneticiEmail, yoneticiAd, yoneticiSifre) {
  if (!kasaSpreadsheetId) throw new Error('Kasa Spreadsheet ID gerekli.');
  if (!yoneticiEmail || !yoneticiSifre) throw new Error('Yönetici e-postası ve şifresi gerekli.');
  if (String(yoneticiSifre).length < 8) throw new Error('Şifre en az 8 karakter olmalı.');

  setConfig_(kasaSpreadsheetId);
  guncellemeKurulum();

  if (kullaniciSayisi_() === 0) {
    kullaniciEkle_(yoneticiEmail, yoneticiAd || 'Yönetici', yoneticiSifre, ROLLER.YONETICI);
  }

  return 'Kurulum tamamlandı. ' + cln_(yoneticiEmail).toLowerCase() + ' ile giriş yapabilirsiniz.';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VARSAYILAN_KASA_KATEGORILERI: VARSAYILAN_KASA_KATEGORILERI,
    VARSAYILAN_URUN_KATEGORILERI: VARSAYILAN_URUN_KATEGORILERI,
    VARSAYILAN_MARKALAR: VARSAYILAN_MARKALAR,
    VARSAYILAN_PERSONEL: VARSAYILAN_PERSONEL,
    varsayilanAyarlariYaz_: varsayilanAyarlariYaz_,
    guncellemeKurulum: guncellemeKurulum,
    ilkKurulum: ilkKurulum
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
