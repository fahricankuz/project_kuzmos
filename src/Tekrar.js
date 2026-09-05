/**
 * Kuzmos · Kasa — Tekrarlayan ödemeler (kira, maaş, SGK, aidat...).
 */

function tekrarGetir(token) {
  guardMuhasebe_(token);
  var s = sheet_(SHEET_NAMES.TEKRAR);
  var d = s.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    out.push({
      ad: cln_(d[i][0]),
      ana: cln_(d[i][1]),
      alt: cln_(d[i][2]),
      tutar: num_(d[i][3]),
      gun: parseInt(d[i][4], 10) || 1,
      hesap: cln_(d[i][5]),
      yon: cln_(d[i][6]) || 'GIDER',
      aktif: String(d[i][7]).toLowerCase() !== 'false'
    });
  }
  return out;
}

function tekrarKaydet(token, liste) {
  guardMuhasebe_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = sheet_(SHEET_NAMES.TEKRAR);
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
    (liste || []).forEach(function (t) {
      s.appendRow([
        cln_(t.ad),
        cln_(t.ana),
        cln_(t.alt),
        num_(t.tutar),
        parseInt(t.gun, 10) || 1,
        cln_(t.hesap),
        cln_(t.yon) || 'GIDER',
        t.aktif !== false
      ]);
    });
    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tekrarGetir: tekrarGetir, tekrarKaydet: tekrarKaydet };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
