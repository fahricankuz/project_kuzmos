/**
 * Kuzmos — Müşteri kartları.
 *
 * Müşteri artık siparişlerden türetilen geçici bir kayıt değil, kendi
 * tablosu olan bir varlık: telefon düzeltildiğinde geçmiş siparişler de
 * doğru müşteriye bağlı kalır. Sipariş kaydedilirken müşteri otomatik
 * oluşturulur/güncellenir (musteriUpsert_).
 */

function musteriSheet_() {
  return sheet_(SHEET_NAMES.MUSTERI, [
    'ID',
    'Ad Soyad',
    'Telefon',
    'E-Posta',
    'TC / Vergi No',
    'Son Reçete (JSON)',
    'Not',
    'İlk Kayıt',
    'Son Güncelleme'
  ]);
}

/** Telefonu karşılaştırma için sadeleştirir: 0532..., +90532... → 532... */
function telefonNormalize_(tel) {
  var s = cln_(tel).replace(/\D/g, '');
  if (!s) return '';
  if (s.indexOf('90') === 0 && s.length > 10) s = s.substring(2);
  if (s.indexOf('0') === 0) s = s.substring(1);
  return s;
}

function musteriSatiriOku_(r, rowIndex) {
  var recete = {};
  try {
    recete = JSON.parse(r[5] || '{}');
  } catch (e) {
    recete = {};
  }
  return {
    row: rowIndex,
    id: cln_(r[0]),
    adSoyad: cln_(r[1]),
    telefon: cln_(r[2]),
    eposta: cln_(r[3]),
    tcVergi: cln_(r[4]),
    sonRecete: recete,
    notu: cln_(r[6])
  };
}

function musteriListesiGetir_() {
  var d = musteriSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    out.push(musteriSatiriOku_(d[i], i + 1));
  }
  return out;
}

/** Telefon (varsa) yoksa ad-soyad üzerinden eşleştirir. */
function musteriBul_(liste, musteri) {
  var tel = telefonNormalize_(musteri && musteri.telefon);
  var ad = cln_(musteri && musteri.adSoyad).toLowerCase();
  for (var i = 0; i < liste.length; i++) {
    if (musteri && cln_(musteri.musteriId) && liste[i].id === cln_(musteri.musteriId)) return liste[i];
  }
  if (tel) {
    for (var j = 0; j < liste.length; j++) {
      if (telefonNormalize_(liste[j].telefon) === tel) return liste[j];
    }
  }
  if (ad) {
    for (var k = 0; k < liste.length; k++) {
      if (cln_(liste[k].adSoyad).toLowerCase() === ad && !telefonNormalize_(liste[k].telefon))
        return liste[k];
    }
  }
  return null;
}

/**
 * Müşteriyi oluşturur veya günceller; müşteri ID'sini döner.
 * Boş gelen alanlar mevcut değerin üzerine yazılmaz.
 */
function musteriUpsert_(musteri, recete) {
  var ad = cln_(musteri && musteri.adSoyad);
  if (!ad) return '';
  var s = musteriSheet_();
  var liste = musteriListesiGetir_();
  var mevcut = musteriBul_(liste, musteri);
  var simdi = new Date();
  var receteJson = JSON.stringify(recete || (mevcut ? mevcut.sonRecete : {}) || {});

  if (mevcut) {
    var satir = [
      mevcut.id,
      ad,
      cln_(musteri.telefon) || mevcut.telefon,
      cln_(musteri.eposta) || mevcut.eposta,
      cln_(musteri.tcVergi) || mevcut.tcVergi,
      receteJson,
      cln_(musteri.notu) || mevcut.notu,
      '',
      simdi
    ];
    /* İlk kayıt tarihine dokunma */
    s.getRange(mevcut.row, 1, 1, 7).setValues([satir.slice(0, 7)]);
    s.getRange(mevcut.row, 9).setValue(simdi);
    return mevcut.id;
  }

  var id = Utilities.getUuid();
  s.appendRow([
    id,
    ad,
    cln_(musteri.telefon),
    cln_(musteri.eposta),
    cln_(musteri.tcVergi),
    receteJson,
    cln_(musteri.notu),
    simdi,
    simdi
  ]);
  return id;
}

function musteriListele(token) {
  guard_(token);
  return musteriListesiGetir_().map(function (m) {
    return {
      id: m.id,
      adSoyad: m.adSoyad,
      telefon: m.telefon,
      eposta: m.eposta,
      tcVergi: m.tcVergi,
      sonRecete: m.sonRecete,
      notu: m.notu
    };
  });
}

/** Müşteri kartını elle düzenleme (mağaza dahil her rol). */
function musteriGuncelle(token, musteri, personel) {
  guard_(token);
  if (!musteri || !cln_(musteri.id)) throw new Error('Müşteri ID gerekli.');
  if (!cln_(musteri.adSoyad)) throw new Error('Ad Soyad gerekli.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = musteriSheet_();
    var liste = musteriListesiGetir_();
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].id === cln_(musteri.id)) {
        s.getRange(liste[i].row, 2, 1, 6).setValues([
          [
            cln_(musteri.adSoyad),
            cln_(musteri.telefon),
            cln_(musteri.eposta),
            cln_(musteri.tcVergi),
            JSON.stringify(musteri.sonRecete || liste[i].sonRecete || {}),
            cln_(musteri.notu)
          ]
        ]);
        s.getRange(liste[i].row, 9).setValue(new Date());
        logYaz_(token, 'MUSTERI_GUNCELLE', 'Musteriler', liste[i].id, cln_(musteri.adSoyad), personel);
        return true;
      }
    }
    throw new Error('Müşteri bulunamadı.');
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    musteriSheet_: musteriSheet_,
    telefonNormalize_: telefonNormalize_,
    musteriListesiGetir_: musteriListesiGetir_,
    musteriBul_: musteriBul_,
    musteriUpsert_: musteriUpsert_,
    musteriListele: musteriListele,
    musteriGuncelle: musteriGuncelle
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
