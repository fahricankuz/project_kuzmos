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
  return kasaKategorileriSagla_([{ ana: ana, alt: alt, yon: yon, bolum: bolum }]) > 0;
}

/**
 * Birden fazla ana/alt kategori çiftini TEK okuma + TEK yazma ile sağlar.
 * Çok tahsilatlı siparişlerde ödeme başına ayrı okuma yapmamak için.
 */
function kasaKategorileriSagla_(ciftler) {
  if (!ciftler || !ciftler.length) return 0;
  var s = kasaKategoriSheet_();
  var d = s.getDataRange().getValues();
  var var_ = {};
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0])) var_[cln_(d[i][0]) + '\u0000' + cln_(d[i][1])] = true;
  }
  var yeni = [];
  ciftler.forEach(function (c) {
    var ana = cln_(c.ana);
    if (!ana) return;
    var anahtar = ana + '\u0000' + cln_(c.alt);
    if (var_[anahtar]) return;
    var_[anahtar] = true;
    yeni.push([
      ana,
      cln_(c.alt),
      cln_(c.yon).toUpperCase() === 'GELIR' ? 'GELIR' : 'GIDER',
      cln_(c.bolum).toUpperCase() === 'FD' ? 'FD' : 'OP',
      999
    ]);
  });
  return satirlariEkle_(s, yeni, 5);
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
  return markalariSagla_([{ kategori: kategori, marka: marka }]) > 0;
}

/**
 * Birden fazla kategori/marka çiftini TEK okuma + TEK yazma ile sağlar.
 * Siparişteki her ürün satırı için Markalar sayfasını baştan okumamak için.
 */
function markalariSagla_(ciftler) {
  if (!ciftler || !ciftler.length) return 0;
  var s = markaSheet_();
  var d = s.getDataRange().getValues();
  var var_ = {};
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) && cln_(d[i][1])) {
      var_[cln_(d[i][0]) + '\u0000' + cln_(d[i][1]).toLowerCase()] = true;
    }
  }
  var yeni = [];
  ciftler.forEach(function (c) {
    var kat = cln_(c.kategori);
    var mrk = cln_(c.marka);
    if (!kat || !mrk) return;
    var anahtar = kat + '\u0000' + mrk.toLowerCase();
    if (var_[anahtar]) return;
    var_[anahtar] = true;
    yeni.push([kat, mrk, true]);
  });
  return satirlariEkle_(s, yeni, 3);
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
    kasaKategorileriSagla_: kasaKategorileriSagla_,
    kasaKategoriKaydet: kasaKategoriKaydet,
    urunKategoriSheet_: urunKategoriSheet_,
    urunKategorileriGetir_: urunKategorileriGetir_,
    urunKategoriKaydet: urunKategoriKaydet,
    markaSheet_: markaSheet_,
    markalariGetir_: markalariGetir_,
    markaSagla_: markaSagla_,
    markalariSagla_: markalariSagla_,
    markaEkle: markaEkle,
    markaSil: markaSil
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
