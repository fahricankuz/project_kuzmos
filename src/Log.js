/**
 * Kuzmos — Değişiklik günlüğü.
 *
 * Mağaza tek bir ortak hesapla (tablet) çalıştığı için, hesabın yanında
 * işlemi fiilen yapan satış personelinin adı da kaydedilir.
 *
 * Log yazımı asla ana işlemi bozmaz: hata olursa sessizce yutulur.
 */

function logSheet_() {
  return sheet_(SHEET_NAMES.LOG, [
    'Zaman',
    'Kullanıcı',
    'Personel',
    'İşlem',
    'Kayıt Tipi',
    'Kayıt ID',
    'Detay'
  ]);
}

function logYaz_(token, islem, kayitTipi, kayitId, detay, personel) {
  try {
    var email = '';
    try {
      var s = oturumGetir_(token);
      if (s) email = s.email;
    } catch (e) {
      email = '';
    }
    logSheet_().appendRow([
      new Date(),
      email,
      cln_(personel),
      cln_(islem),
      cln_(kayitTipi),
      cln_(kayitId),
      cln_(detay).substring(0, 500)
    ]);
  } catch (e) {
    /* log yazılamadıysa işlemi bozma */
  }
}

/** Son N log kaydı (yeniden eskiye). Yönetici/muhasebe görebilir. */
function logListele(token, limit) {
  guardMuhasebe_(token);
  var n = parseInt(limit, 10) || 200;
  var d = logSheet_().getDataRange().getValues();
  var out = [];
  for (var i = d.length - 1; i >= 1 && out.length < n; i--) {
    if (!d[i][0]) continue;
    out.push({
      zaman: dstr_(d[i][0]),
      kullanici: cln_(d[i][1]),
      personel: cln_(d[i][2]),
      islem: cln_(d[i][3]),
      kayitTipi: cln_(d[i][4]),
      kayitId: cln_(d[i][5]),
      detay: cln_(d[i][6])
    });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { logSheet_: logSheet_, logYaz_: logYaz_, logListele: logListele };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
