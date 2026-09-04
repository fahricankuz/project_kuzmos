/**
 * Kuzmos · Kasa — Haftalık banka bakiye doğrulaması (mutabakat).
 */

function bankaGetir(token) {
  guard_(token);
  var s = sheet_(SHEET_NAMES.BANKA);
  var d = s.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    out.push({ tarih: dstr_(d[i][0]), hesap: cln_(d[i][1]), bakiye: num_(d[i][2]), notu: cln_(d[i][3]) });
  }
  return out;
}

function bankaKaydet(token, tarih, satirlar) {
  guard_(token);
  var t = dstr_(tarih);
  if (!t) throw new Error('Tarih gerekli.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = sheet_(SHEET_NAMES.BANKA);
    var d = s.getDataRange().getDisplayValues();
    (satirlar || []).forEach(function (x) {
      var bulundu = false;
      for (var i = 1; i < d.length; i++) {
        if (dstr_(d[i][0]) === t && cln_(d[i][1]) === cln_(x.hesap)) {
          s.getRange(i + 1, 3).setValue(num_(x.bakiye));
          bulundu = true;
          break;
        }
      }
      if (!bulundu) s.appendRow([t, cln_(x.hesap), num_(x.bakiye), cln_(x.notu)]);
    });
    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bankaGetir: bankaGetir, bankaKaydet: bankaKaydet };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
