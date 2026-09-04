/**
 * Kuzmos · Kasa — Tek seferlik kurulum.
 *
 * KULLANIM: Apps Script editöründe bu fonksiyonu bir kez, parametreleri
 * doldurarak elle çalıştırın (menüden ilkKurulum'u seçip "Çalıştır"):
 *
 *   ilkKurulum(
 *     "KASA_SPREADSHEET_ID_BURAYA",
 *     "SIPARIS_SPREADSHEET_ID_BURAYA",   // opsiyonel, yoksa "" bırakın
 *     "admin@sirket.com",
 *     "Ad Soyad",
 *     "en-az-8-karakterlik-gecici-sifre"
 *   );
 *
 * Bu, spreadsheet ID'lerini Script Properties'e yazar, gerekli sayfaları
 * oluşturur ve ilk yönetici kullanıcıyı ekler. Tekrar çalıştırmak var olan
 * verileri SİLMEZ; sadece eksik sayfaları/ilk yöneticiyi tamamlar.
 */
function ilkKurulum(kasaSpreadsheetId, siparisSpreadsheetId, adminEmail, adminAd, adminSifre) {
  if (!kasaSpreadsheetId) throw new Error('Kasa Spreadsheet ID gerekli.');
  if (!adminEmail || !adminSifre) throw new Error('Yönetici e-postası ve şifresi gerekli.');
  if (String(adminSifre).length < 8) throw new Error('Şifre en az 8 karakter olmalı.');

  setConfig_(kasaSpreadsheetId, siparisSpreadsheetId || '');

  sheet_(SHEET_NAMES.HAREKET, ['ID', 'Tarih', 'Yön', 'Ana Kategori', 'Alt Kategori', 'Tutar', 'Hesap', 'Açıklama', 'Kaydeden', 'Kayıt Zamanı', 'Silindi']);
  sheet_(SHEET_NAMES.CARI, ['Tedarikçi', 'Ay (YYYY-MM)', 'Planlanan Tutar', 'Not']);
  sheet_(SHEET_NAMES.BANKA, ['Tarih', 'Hesap', 'Gerçek Bakiye', 'Not']);
  sheet_(SHEET_NAMES.TEKRAR, ['Ad', 'Ana Kategori', 'Alt Kategori', 'Tutar', 'Ayın Günü', 'Hesap', 'Yön', 'Aktif']);
  kullaniciSheet_();

  var a = sheet_(SHEET_NAMES.AYAR, ['Anahtar', 'Değer', 'Açıklama']);
  if (a.getLastRow() < 2) {
    a.appendRow(['acilis_kasa', '0', 'Sistem başlangıç kasası']);
    a.appendRow(['acilis_tarih', dstr_(new Date()), 'Açılış kasasının geçerli olduğu tarih']);
    a.appendRow(['hesaplar', 'Nakit Kasa', 'Hesap listesi (virgülle)']);
    a.appendRow(['acilis_borc', '0', 'Açılış tarihindeki KK/KMH toplam borcu (mutabakat için)']);
    a.appendRow(['borc_hesaplari', '', 'KK/KMH borç hesapları (mutabakatta düşülür, virgülle)']);
  }

  if (kullaniciSayisi_() === 0) {
    kullaniciEkle_(adminEmail, adminAd || 'Yönetici', adminSifre, 'admin');
  }

  return 'Kurulum tamamlandı. ' + cln_(adminEmail).toLowerCase() + ' ile giriş yapabilirsiniz.';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ilkKurulum: ilkKurulum };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
