/**
 * Kuzmos · Kasa — Tedarikçi bazlı aylık planlanan ödemeler.
 */

function cariGetir(token) {
  guard_(token);
  var s = sheet_(SHEET_NAMES.CARI);
  var d = s.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    out.push({ tedarikci: cln_(d[i][0]), ay: cln_(d[i][1]), planlanan: num_(d[i][2]), notu: cln_(d[i][3]) });
  }
  return out;
}

function cariKaydet(token, tedarikci, ay, planlanan, notu) {
  guard_(token);
  if (!cln_(tedarikci)) throw new Error('Tedarikçi gerekli.');
  if (!/^\d{4}-\d{2}$/.test(cln_(ay))) throw new Error('Ay YYYY-MM biçiminde olmalı.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = sheet_(SHEET_NAMES.CARI);
    var d = s.getDataRange().getDisplayValues();
    for (var i = 1; i < d.length; i++) {
      if (cln_(d[i][0]) === cln_(tedarikci) && cln_(d[i][1]) === cln_(ay)) {
        s.getRange(i + 1, 3).setValue(num_(planlanan));
        s.getRange(i + 1, 4).setValue(cln_(notu));
        return true;
      }
    }
    s.appendRow([cln_(tedarikci), cln_(ay), num_(planlanan), cln_(notu)]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cariGetir: cariGetir, cariKaydet: cariKaydet };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
