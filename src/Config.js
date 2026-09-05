/**
 * Kuzmos · Kasa — Merkezi yapılandırma.
 *
 * Spreadsheet ID'si artık kodun içine gömülmez; Script Properties'te
 * tutulur (bkz. Setup.js / ilkKurulum). Böylece ID git geçmişine karışmaz
 * ve aynı kod farklı ortamlara (test/prod) bağlanabilir.
 *
 * Sipariş modülü artık ayrı bir spreadsheet/proje değil; Kasa ile aynı
 * spreadsheet içinde bir sayfa (bkz. SHEET_NAMES.SIPARIS, src/Siparis.js).
 */

var SHEET_NAMES = Object.freeze({
  HAREKET: 'Hareketler',
  AYAR: 'Ayarlar',
  CARI: 'Cari_Plan',
  BANKA: 'Banka_Dogrulama',
  TEKRAR: 'Tekrarlayan',
  KULLANICI: 'Kullanicilar',
  SIPARIS: 'Siparisler'
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
