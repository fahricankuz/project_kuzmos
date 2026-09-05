/**
 * Kuzmos — Mağaza satış hedefleri (aylık, mağaza bazlı).
 *
 * Kişi bazlı değil: bir ay için tek hedef girilir, panelde gerçekleşme
 * yüzdesi ve kalan güne göre gereken günlük tempo hesaplanır.
 */

function hedefSheet_() {
  return sheet_(SHEET_NAMES.HEDEF, ['Ay (YYYY-MM)', 'Hedef', 'Not']);
}

function hedefleriGetir_() {
  var d = hedefSheet_().getDataRange().getValues();
  var out = {};
  for (var i = 1; i < d.length; i++) {
    var ay = cln_(d[i][0]);
    if (!/^\d{4}-\d{2}$/.test(ay)) continue;
    out[ay] = { hedef: num_(d[i][1]), notu: cln_(d[i][2]) };
  }
  return out;
}

function hedefListele(token) {
  guard_(token);
  return hedefleriGetir_();
}

function hedefKaydet(token, ay, hedef, notu) {
  guardMuhasebe_(token);
  var a = cln_(ay);
  if (!/^\d{4}-\d{2}$/.test(a)) throw new Error('Ay YYYY-MM biçiminde olmalı.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = hedefSheet_();
    var d = s.getDataRange().getDisplayValues();
    for (var i = 1; i < d.length; i++) {
      if (cln_(d[i][0]) === a) {
        s.getRange(i + 1, 2, 1, 2).setValues([[num_(hedef), cln_(notu)]]);
        logYaz_(token, 'HEDEF_KAYDET', 'Hedefler', a, String(num_(hedef)));
        return true;
      }
    }
    s.appendRow([a, num_(hedef), cln_(notu)]);
    logYaz_(token, 'HEDEF_KAYDET', 'Hedefler', a, String(num_(hedef)));
    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hedefSheet_: hedefSheet_,
    hedefleriGetir_: hedefleriGetir_,
    hedefListele: hedefListele,
    hedefKaydet: hedefKaydet
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
