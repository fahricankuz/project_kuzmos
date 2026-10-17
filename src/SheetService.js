/**
 * Kuzmos · Kasa — Kasa Spreadsheet'e genel erişim yardımcıları.
 *
 * Apps Script'te her SpreadsheetApp/Range çağrısı ayrı bir ağ turudur ve
 * tanesi 100-300 ms sürer. Bir çalıştırma (request) içinde aynı spreadsheet
 * ya da aynı sayfa birden fazla kez istendiğinde tekrar açmamak için çağrı
 * ömürlü bir önbellek tutulur.
 *
 * GAS'ta global'ler her istekte sıfırlandığı için bu önbellek kendiliğinden
 * istek kapsamındadır (bayat veri riski yok). Node/Jest'te global'ler kalıcı
 * olduğu için testler onbellekSifirla_() ile boşaltır.
 */

var SS_ONBELLEK_ = { ss: null, sheets: {} };

/** Çağrı ömürlü tüm önbellekleri boşaltır (test / spreadsheet değişimi). */
function onbellekSifirla_() {
  SS_ONBELLEK_.ss = null;
  SS_ONBELLEK_.sheets = {};
  if (typeof ayarOnbellekBosalt_ === 'function') ayarOnbellekBosalt_();
}

function ss_() {
  if (!SS_ONBELLEK_.ss) SS_ONBELLEK_.ss = SpreadsheetApp.openById(getConfig_().kasaId);
  return SS_ONBELLEK_.ss;
}

function sheet_(name, headers) {
  if (SS_ONBELLEK_.sheets[name]) return SS_ONBELLEK_.sheets[name];
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    if (headers && headers.length) {
      s.appendRow(headers);
      s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#111').setFontColor('#F5C800');
      s.setFrozenRows(1);
    }
  }
  SS_ONBELLEK_.sheets[name] = s;
  return s;
}

/**
 * Birden fazla satırı tek çağrıda sayfanın sonuna ekler.
 * appendRow'u döngüde çağırmak her satır için bir ağ turu demektir.
 */
function satirlariEkle_(s, satirlar, kolonSayisi) {
  if (!satirlar || !satirlar.length) return 0;
  var baslangic = s.getLastRow() + 1;
  s.getRange(baslangic, 1, satirlar.length, kolonSayisi).setValues(satirlar);
  return satirlar.length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    onbellekSifirla_: onbellekSifirla_,
    ss_: ss_,
    sheet_: sheet_,
    satirlariEkle_: satirlariEkle_
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
