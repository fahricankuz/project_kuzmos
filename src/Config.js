/**
 * Kuzmos · Kasa — Merkezi yapılandırma.
 *
 * Spreadsheet ID'leri artık kodun içine gömülmez; Script Properties'te
 * tutulur (bkz. Setup.js / ilkKurulum). Böylece ID'ler git geçmişine
 * karışmaz ve aynı kod farklı ortamlara (test/prod) bağlanabilir.
 */

var SHEET_NAMES = Object.freeze({
  HAREKET: 'Hareketler',
  AYAR: 'Ayarlar',
  CARI: 'Cari_Plan',
  BANKA: 'Banka_Dogrulama',
  TEKRAR: 'Tekrarlayan',
  KULLANICI: 'Kullanicilar'
});

/** Script Properties'ten Kasa/Sipariş spreadsheet ID'lerini okur. */
function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  var kasaId = p.getProperty('KASA_SPREADSHEET_ID');
  var siparisId = p.getProperty('SIPARIS_SPREADSHEET_ID');
  if (!kasaId) {
    throw new Error('KASA_SPREADSHEET_ID tanımlı değil. Önce ilkKurulum() fonksiyonunu çalıştırın.');
  }
  return { kasaId: kasaId, siparisId: siparisId || '' };
}

/** Script Properties'e Kasa/Sipariş spreadsheet ID'lerini yazar. */
function setConfig_(kasaId, siparisId) {
  var p = PropertiesService.getScriptProperties();
  if (kasaId) p.setProperty('KASA_SPREADSHEET_ID', kasaId);
  if (siparisId) p.setProperty('SIPARIS_SPREADSHEET_ID', siparisId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHEET_NAMES: SHEET_NAMES, getConfig_: getConfig_, setConfig_: setConfig_ };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
