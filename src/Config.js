/**
 * Kuzmos — Merkezi yapılandırma.
 *
 * Spreadsheet ID'si kodun içine gömülmez; Script Properties'te tutulur
 * (bkz. Setup.js / ilkKurulum). Kasa ve Sipariş modülleri aynı spreadsheet
 * içinde, farklı sayfalarda yaşar.
 */

var SHEET_NAMES = Object.freeze({
  /* Kasa modülü */
  HAREKET: 'Hareketler',
  AYAR: 'Ayarlar',
  CARI: 'Cari_Plan',
  BANKA: 'Banka_Dogrulama',
  TEKRAR: 'Tekrarlayan',
  KULLANICI: 'Kullanicilar',
  KASA_KATEGORI: 'Kategoriler',
  /* Sipariş modülü */
  SIPARIS: 'Siparisler',
  MUSTERI: 'Musteriler',
  PERSONEL: 'Personel',
  MARKA: 'Markalar',
  URUN_KATEGORI: 'Urun_Kategorileri',
  /* Ortak */
  HEDEF: 'Hedefler',
  LOG: 'Log'
});

/** Script Properties'ten Kasa spreadsheet ID'sini okur. */
function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  var kasaId = p.getProperty('KASA_SPREADSHEET_ID');
  if (!kasaId) {
    throw new Error('KASA_SPREADSHEET_ID tanımlı değil. Önce ilkKurulum() fonksiyonunu çalıştırın.');
  }
  return { kasaId: kasaId };
}

/** Script Properties'e Kasa spreadsheet ID'sini yazar. */
function setConfig_(kasaId) {
  var p = PropertiesService.getScriptProperties();
  if (kasaId) p.setProperty('KASA_SPREADSHEET_ID', kasaId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHEET_NAMES: SHEET_NAMES, getConfig_: getConfig_, setConfig_: setConfig_ };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
