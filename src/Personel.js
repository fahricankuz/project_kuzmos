/**
 * Kuzmos — Satış personeli listesi.
 *
 * Bunlar giriş hesabı DEĞİLDİR. Mağazada herkes aynı tableti ve aynı
 * "Mağaza" hesabını kullandığı için, satışı kimin yaptığı ve bir kaydı
 * kimin değiştirdiği bu listeden seçilir.
 */

function personelSheet_() {
  return sheet_(SHEET_NAMES.PERSONEL, ['Ad Soyad', 'Aktif', 'Prim Muaf', 'Not']);
}

function personelListesiGetir_(hepsi) {
  var d = personelSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    var ad = cln_(d[i][0]);
    if (!ad) continue;
    var aktif = String(d[i][1]).toLowerCase() !== 'false';
    if (!hepsi && !aktif) continue;
    out.push({
      ad: ad,
      aktif: aktif,
      primMuaf: String(d[i][2]).toLowerCase() === 'true',
      notu: cln_(d[i][3])
    });
  }
  return out;
}

function personelEkle_(ad, primMuaf, notu) {
  personelSheet_().appendRow([cln_(ad), true, !!primMuaf, cln_(notu)]);
}

/** Adı listede yoksa ekler. */
function personelSagla_(ad) {
  var isim = cln_(ad);
  if (!isim) return false;
  var mevcut = personelListesiGetir_(true);
  for (var i = 0; i < mevcut.length; i++) {
    if (mevcut[i].ad.toLowerCase() === isim.toLowerCase()) return false;
  }
  personelEkle_(isim, false, '');
  return true;
}

/** Sipariş formunda seçilebilmesi için her role açık. */
function personelListele(token) {
  var s = guard_(token);
  var hepsi = s.rol === ROLLER.YONETICI || s.rol === ROLLER.MUHASEBE;
  return personelListesiGetir_(hepsi);
}

/** Tüm listeyi tek seferde yazar (Ayarlar ekranı). */
function personelKaydet(token, liste) {
  guardMuhasebe_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = personelSheet_();
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
    (liste || []).forEach(function (p) {
      if (!cln_(p.ad)) return;
      s.appendRow([cln_(p.ad), p.aktif !== false, !!p.primMuaf, cln_(p.notu)]);
    });
    logYaz_(token, 'PERSONEL_KAYDET', 'Personel', '', (liste || []).length + ' kişi');
    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    personelSheet_: personelSheet_,
    personelListesiGetir_: personelListesiGetir_,
    personelEkle_: personelEkle_,
    personelSagla_: personelSagla_,
    personelListele: personelListele,
    personelKaydet: personelKaydet
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
