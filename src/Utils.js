/**
 * Kuzmos · Kasa — Genel yardımcı fonksiyonlar (saf mantık, test edilebilir).
 */

function cln_(v) {
  if (v == null) return '';
  // eslint-disable-next-line no-control-regex -- strips stray control chars pasted into Sheets cells
  return String(v).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

/** Tarih hücrelerini her koşulda YYYY-MM-DD stringe indirger. */
function dstr_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return (
      v.getFullYear() +
      '-' +
      String(v.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(v.getDate()).padStart(2, '0')
    );
  }
  var s = String(v).trim();
  if (s.indexOf('T') > -1) s = s.split('T')[0];
  if (s.indexOf(' ') > -1) s = s.split(' ')[0];
  /* 21.09.2026 -> 2026-09-21 */
  var m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return s;
}

/** Sayısal alanları güvenli parse eder (TR formatı dahil). */
function num_(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  var s = String(v).trim().replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
  if (s.indexOf(',') > -1) {
    /* TR: nokta binlik, virgul ondalik */
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    var p = s.split('.');
    if (p.length > 2) s = p.join(''); /* 1.250.000 */
    else if (p.length === 2 && p[1].length === 3) s = p.join(''); /* 20.000 */
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cln_: cln_, dstr_: dstr_, num_: num_ };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
