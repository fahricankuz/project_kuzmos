/**
 * Kuzmos · Kasa — Anahtar/değer ayarları (açılış kasası, hesap listesi, vb.)
 */

function ayarOku_() {
  var s = sheet_(SHEET_NAMES.AYAR, ['Anahtar', 'Değer', 'Açıklama']);
  var d = s.getDataRange().getDisplayValues();
  var o = {};
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0])) o[cln_(d[i][0])] = cln_(d[i][1]);
  }
  return o;
}

function ayarYaz_(k, v) {
  var s = sheet_(SHEET_NAMES.AYAR, ['Anahtar', 'Değer', 'Açıklama']);
  var d = s.getDataRange().getDisplayValues();
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) === k) {
      s.getRange(i + 1, 2).setValue(v);
      return;
    }
  }
  s.appendRow([k, v, '']);
}

function ayarGuncelle(token, k, v) {
  guardAdmin_(token);
  ayarYaz_(cln_(k), v);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ayarOku_: ayarOku_, ayarYaz_: ayarYaz_, ayarGuncelle: ayarGuncelle };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
