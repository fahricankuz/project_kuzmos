/**
 * Kuzmos · Kasa — Gelir/gider hareketleri.
 *
 * "Kaynak" ve "Kaynak ID" kolonları, bir hareketin sipariş tahsilatından
 * otomatik üretilip üretilmediğini gösterir (bkz. KasaSenkron.js). Otomatik
 * hareketler elle düzenlenmemelidir; kaynak sipariş değişince yeniden yazılır.
 */

var HAREKET_KOLON_SAYISI = 13;

function hareketSheet_() {
  return sheet_(SHEET_NAMES.HAREKET, [
    'ID',
    'Tarih',
    'Yön',
    'Ana Kategori',
    'Alt Kategori',
    'Tutar',
    'Hesap',
    'Açıklama',
    'Kaydeden',
    'Kayıt Zamanı',
    'Silindi',
    'Kaynak',
    'Kaynak ID'
  ]);
}

function hareketleriGetir(token) {
  guardMuhasebe_(token);
  var d = hareketSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    var r = d[i];
    if (!cln_(r[0])) continue;
    if (String(r[10]).toLowerCase() === 'true') continue;
    out.push({
      id: cln_(r[0]),
      tarih: dstr_(r[1]),
      yon: cln_(r[2]),
      ana: cln_(r[3]),
      alt: cln_(r[4]),
      tutar: num_(r[5]),
      hesap: cln_(r[6]),
      aciklama: cln_(r[7]),
      kaydeden: cln_(r[8]),
      kaynak: cln_(r[11]),
      kaynakId: cln_(r[12])
    });
  }
  return out;
}

function hareketDogrula_(h) {
  if (!h || !dstr_(h.tarih)) throw new Error('Tarih gerekli.');
  if (h.yon !== 'GELIR' && h.yon !== 'GIDER') throw new Error('Yön GELIR veya GIDER olmalı.');
  if (!(num_(h.tutar) > 0)) throw new Error('Tutar sıfırdan büyük olmalı.');
  if (!cln_(h.ana)) throw new Error('Ana kategori gerekli.');
}

function hareketKaydet(token, h) {
  var session = guardMuhasebe_(token);
  return hareketYaz_(h, session.ad, '', '');
}

/**
 * Hareketi ekler/günceller. Kaynak dolu ise otomatik üretilmiş demektir.
 * "Kaydeden" her koşulda sunucudan gelir; istemci bunu belirleyemez.
 */
function hareketYaz_(h, kaydeden, kaynak, kaynakId) {
  hareketDogrula_(h);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = hareketSheet_();
    var row = [
      cln_(h.id) || Utilities.getUuid(),
      dstr_(h.tarih),
      cln_(h.yon),
      cln_(h.ana),
      cln_(h.alt),
      num_(h.tutar),
      cln_(h.hesap),
      cln_(h.aciklama),
      cln_(kaydeden),
      new Date(),
      false,
      cln_(kaynak),
      cln_(kaynakId)
    ];
    var d = s.getDataRange().getDisplayValues();
    for (var i = 1; i < d.length; i++) {
      if (cln_(d[i][0]) === String(row[0])) {
        /* Var olan kaydı güncellerken "kaydeden" bilgisini korur. */
        row[8] = cln_(d[i][8]) || cln_(kaydeden);
        s.getRange(i + 1, 1, 1, HAREKET_KOLON_SAYISI).setValues([row]);
        return row[0];
      }
    }
    s.appendRow(row);
    return row[0];
  } finally {
    lock.releaseLock();
  }
}

function hareketSil(token, id) {
  guardMuhasebe_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = hareketSheet_();
    var d = s.getDataRange().getDisplayValues();
    for (var i = 1; i < d.length; i++) {
      if (cln_(d[i][0]) === String(id)) {
        s.getRange(i + 1, 11).setValue(true);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HAREKET_KOLON_SAYISI: HAREKET_KOLON_SAYISI,
    hareketSheet_: hareketSheet_,
    hareketleriGetir: hareketleriGetir,
    hareketDogrula_: hareketDogrula_,
    hareketKaydet: hareketKaydet,
    hareketYaz_: hareketYaz_,
    hareketSil: hareketSil
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
