/**
 * Kuzmos — Kategori ve marka yönetimi.
 *
 * Üç ayrı liste:
 *  1. Kasa kategori ağacı (`Kategoriler`)   — gelir/gider kalemleri, kasa modülü
 *  2. Ürün kategorileri (`Urun_Kategorileri`) — sipariş kalemleri + KDV oranları
 *  3. Markalar (`Markalar`)                  — ürün kategorisine bağlı marka listesi
 *
 * Hiçbiri koda gömülü değildir; hepsi Sheets'ten okunur ve yöneticinin
 * Ayarlar ekranından düzenlenebilir.
 */

/* ══ Kasa kategori ağacı ══ */

function kasaKategoriSheet_() {
  return sheet_(SHEET_NAMES.KASA_KATEGORI, [
    'Ana Kategori',
    'Alt Kategori',
    'Yön (GELIR/GIDER)',
    'Bölüm (OP/FD)',
    'Sıra'
  ]);
}

/** Frontend'in beklediği ağaç: [{ ad, yon, bolum, alt: [...] }] */
function kasaKategorileriGetir_() {
  var d = kasaKategoriSheet_().getDataRange().getValues();
  var map = {};
  var sira = [];
  for (var i = 1; i < d.length; i++) {
    var ana = cln_(d[i][0]);
    if (!ana) continue;
    if (!map[ana]) {
      map[ana] = {
        ad: ana,
        yon: cln_(d[i][2]).toUpperCase() === 'GELIR' ? 'GELIR' : 'GIDER',
        bolum: cln_(d[i][3]).toUpperCase() === 'FD' ? 'FD' : 'OP',
        sira: num_(d[i][4]),
        alt: []
      };
      sira.push(ana);
    }
    var alt = cln_(d[i][1]);
    if (alt && map[ana].alt.indexOf(alt) === -1) map[ana].alt.push(alt);
  }
  return sira
    .map(function (ad) {
      return map[ad];
    })
    .sort(function (a, b) {
      return (a.sira || 0) - (b.sira || 0);
    });
}

function kasaKategoriEkle_(ana, alt, yon, bolum, sira) {
  kasaKategoriSheet_().appendRow([
    cln_(ana),
    cln_(alt),
    cln_(yon).toUpperCase() === 'GELIR' ? 'GELIR' : 'GIDER',
    cln_(bolum).toUpperCase() === 'FD' ? 'FD' : 'OP',
    num_(sira)
  ]);
}

/** Ana/alt kategori çifti yoksa ekler (otomatik kasa hareketleri için). */
function kasaKategoriSagla_(ana, alt, yon, bolum) {
  var d = kasaKategoriSheet_().getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) === cln_(ana) && cln_(d[i][1]) === cln_(alt)) return false;
  }
  kasaKategoriEkle_(ana, alt, yon, bolum, 999);
  return true;
}

function kasaKategoriKaydet(token, satirlar) {
  guardYonetici_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = kasaKategoriSheet_();
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
    (satirlar || []).forEach(function (r) {
      if (!cln_(r.ana)) return;
      kasaKategoriEkle_(r.ana, r.alt, r.yon, r.bolum, r.sira);
    });
    logYaz_(token, 'KATEGORI_KAYDET', 'Kategoriler', '', (satirlar || []).length + ' satır');
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ══ Ürün kategorileri (sipariş) ══ */

function urunKategoriSheet_() {
  return sheet_(SHEET_NAMES.URUN_KATEGORI, ['Kategori', 'KDV (%)', 'İkon', 'Sıra', 'Aktif']);
}

function urunKategorileriGetir_() {
  var d = urunKategoriSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    var ad = cln_(d[i][0]);
    if (!ad) continue;
    if (String(d[i][4]).toLowerCase() === 'false') continue;
    out.push({ ad: ad, kdv: num_(d[i][1]), ikon: cln_(d[i][2]), sira: num_(d[i][3]) });
  }
  return out.sort(function (a, b) {
    return (a.sira || 0) - (b.sira || 0);
  });
}

function urunKategoriKaydet(token, satirlar) {
  guardYonetici_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = urunKategoriSheet_();
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
    (satirlar || []).forEach(function (r, idx) {
      if (!cln_(r.ad)) return;
      s.appendRow([
        cln_(r.ad),
        num_(r.kdv),
        cln_(r.ikon),
        r.sira !== undefined ? num_(r.sira) : idx + 1,
        r.aktif !== false
      ]);
    });
    logYaz_(token, 'URUN_KATEGORI_KAYDET', 'Urun_Kategorileri', '', (satirlar || []).length + ' satır');
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ══ Markalar ══ */

function markaSheet_() {
  return sheet_(SHEET_NAMES.MARKA, ['Kategori', 'Marka', 'Aktif']);
}

/** { 'Optik Cam': ['Seiko', 'Essilor'], ... } */
function markalariGetir_() {
  var d = markaSheet_().getDataRange().getValues();
  var out = {};
  for (var i = 1; i < d.length; i++) {
    var kat = cln_(d[i][0]);
    var marka = cln_(d[i][1]);
    if (!kat || !marka) continue;
    if (String(d[i][2]).toLowerCase() === 'false') continue;
    if (!out[kat]) out[kat] = [];
    if (out[kat].indexOf(marka) === -1) out[kat].push(marka);
  }
  Object.keys(out).forEach(function (k) {
    out[k].sort(function (a, b) {
      return a.localeCompare(b, 'tr');
    });
  });
  return out;
}

/**
 * Listede olmayan bir marka ("Diğer" ile elle yazılan) ilk kullanımda
 * listeye eklenir; böylece bir dahaki sefere seçilebilir olur.
 */
function markaSagla_(kategori, marka) {
  var kat = cln_(kategori);
  var mrk = cln_(marka);
  if (!kat || !mrk) return false;
  var d = markaSheet_().getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) === kat && cln_(d[i][1]).toLowerCase() === mrk.toLowerCase()) return false;
  }
  markaSheet_().appendRow([kat, mrk, true]);
  return true;
}

function markaEkle(token, kategori, marka) {
  guardYonetici_(token);
  if (!cln_(kategori) || !cln_(marka)) throw new Error('Kategori ve marka gerekli.');
  var eklendi = markaSagla_(kategori, marka);
  if (!eklendi) throw new Error('Bu marka zaten kayıtlı.');
  logYaz_(token, 'MARKA_EKLE', 'Markalar', cln_(kategori), cln_(marka));
  return true;
}

function markaSil(token, kategori, marka) {
  guardYonetici_(token);
  var s = markaSheet_();
  var d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) === cln_(kategori) && cln_(d[i][1]) === cln_(marka)) {
      s.deleteRow(i + 1);
      logYaz_(token, 'MARKA_SIL', 'Markalar', cln_(kategori), cln_(marka));
      return true;
    }
  }
  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    kasaKategoriSheet_: kasaKategoriSheet_,
    kasaKategorileriGetir_: kasaKategorileriGetir_,
    kasaKategoriEkle_: kasaKategoriEkle_,
    kasaKategoriSagla_: kasaKategoriSagla_,
    kasaKategoriKaydet: kasaKategoriKaydet,
    urunKategoriSheet_: urunKategoriSheet_,
    urunKategorileriGetir_: urunKategorileriGetir_,
    urunKategoriKaydet: urunKategoriKaydet,
    markaSheet_: markaSheet_,
    markalariGetir_: markalariGetir_,
    markaSagla_: markaSagla_,
    markaEkle: markaEkle,
    markaSil: markaSil
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
