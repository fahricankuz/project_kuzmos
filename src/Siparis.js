/**
 * Kuzmos — Sipariş modülü.
 *
 * Sipariş verisi Kasa ile aynı spreadsheet içindeki `Siparisler` sayfasında
 * tutulur. Her sipariş: müşteri + reçete + ürün satırları (marka/kategori
 * dahil) + çoklu tahsilat/iade listesi + sipariş durumu.
 *
 * Önemli kurallar:
 *  - Tahsilat "nakit esaslı"dır: her ödeme KENDİ tarihine yazılır, sipariş
 *    tarihine değil. Günlük/aylık kasa bu tarihlerden hesaplanır.
 *  - Teslim tarihi elle girilmez: durum "Teslim Edildi" yapıldığında o gün,
 *    tamamı tahsil edildiğinde son ödeme tarihi olarak otomatik yazılır.
 *  - Kaydeden hesap sunucudan alınır; mağaza tek ortak hesap kullandığı için
 *    işlemi yapan satış personeli ayrıca istenir ve loglanır.
 */

var SIPARIS_DURUMLARI = ['Satış Yapıldı', 'Cam Siparişi Verildi', 'Montaj Yapıldı', 'Teslim Edildi'];
var COP_SAKLAMA_GUN = 3;

function siparisSheet_() {
  return sheet_(SHEET_NAMES.SIPARIS, [
    'ID',
    'Sipariş No',
    'Sipariş Tarihi',
    'Teslim Tarihi',
    'Satış Personeli',
    'Müşteri ID',
    'Ad Soyad',
    'Telefon',
    'E-Posta',
    'TC / Vergi No',
    'Ürünler (JSON)',
    'Reçete (JSON)',
    'Ara Toplam',
    'Genel Toplam',
    'Ödemeler (JSON)',
    'Tahsil Edilen',
    'Kalan',
    'Sipariş Durumu',
    'Durum Tarihi',
    'Nebim',
    'Oluşturan Hesap',
    'Oluşturan Personel',
    'Oluşturma Zamanı',
    'Güncelleme Zamanı',
    'Silindi',
    'Silinme Tarihi'
  ]);
}

/* ── yardımcılar ── */

function jsonOku_(deger, varsayilan) {
  try {
    var v = JSON.parse(deger || '');
    return v === null || v === undefined ? varsayilan : v;
  } catch (e) {
    return varsayilan;
  }
}

function adetNormalize_(deger) {
  var n = parseInt(String(deger === undefined || deger === null ? '' : deger).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

function urunleriTemizle_(urunler) {
  return (urunler || [])
    .map(function (p) {
      return {
        marka: cln_(p && p.marka),
        kategori: cln_(p && p.kategori),
        urun: cln_(p && p.urun),
        adet: adetNormalize_(p && p.adet),
        ekartman: cln_(p && p.ekartman),
        kopru: cln_(p && p.kopru),
        kol: cln_(p && p.kol),
        fiyat: num_(p && p.fiyat)
      };
    })
    .filter(function (p) {
      return p.urun || p.marka || p.fiyat > 0;
    });
}

function araToplamHesapla_(urunler) {
  var t = 0;
  (urunler || []).forEach(function (p) {
    t += num_(p.fiyat) * adetNormalize_(p.adet);
  });
  return t;
}

function odemeleriTemizle_(odemeler) {
  return (odemeler || [])
    .map(function (o) {
      return {
        id: cln_(o && o.id) || Utilities.getUuid(),
        tutar: num_(o && o.tutar),
        tarih: dstr_(o && o.tarih),
        yontem: cln_(o && o.yontem).toLowerCase() === 'kk' ? 'kk' : 'nakit',
        banka: cln_(o && o.banka),
        taksit: cln_(o && o.taksit),
        tip: cln_(o && o.tip).toLowerCase() === 'iade' ? 'iade' : 'tahsilat'
      };
    })
    .filter(function (o) {
      return o.tutar > 0 && o.tarih;
    })
    .sort(function (a, b) {
      return String(a.tarih).localeCompare(String(b.tarih));
    });
}

/** Tahsilatlar artı, iadeler eksi. */
function tahsilatToplami_(odemeler) {
  var t = 0;
  (odemeler || []).forEach(function (o) {
    t += o.tip === 'iade' ? -num_(o.tutar) : num_(o.tutar);
  });
  return t;
}

function siparisSatiriOku_(r, rowIndex) {
  var urunler = urunleriTemizle_(jsonOku_(r[10], []));
  var odemeler = odemeleriTemizle_(jsonOku_(r[14], []));
  return {
    row: rowIndex,
    id: cln_(r[0]),
    no: cln_(r[1]),
    siparisTarihi: dstr_(r[2]),
    teslimTarihi: dstr_(r[3]),
    personel: cln_(r[4]),
    musteriId: cln_(r[5]),
    adSoyad: cln_(r[6]),
    telefon: cln_(r[7]),
    eposta: cln_(r[8]),
    tcVergi: cln_(r[9]),
    urunler: urunler,
    recete: jsonOku_(r[11], {}),
    araToplam: num_(r[12]),
    tutar: num_(r[13]),
    odemeler: odemeler,
    tahsilEdilen: num_(r[15]),
    kalan: num_(r[16]),
    durum: cln_(r[17]) || SIPARIS_DURUMLARI[0],
    durumTarihi: dstr_(r[18]),
    nebim: String(r[19]).toLowerCase() === 'true',
    olusturanHesap: cln_(r[20]),
    olusturanPersonel: cln_(r[21]),
    silindi: String(r[24]).toLowerCase() === 'true',
    silinmeTarihi: dstr_(r[25])
  };
}

function siparisTumunuOku_() {
  var d = siparisSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    out.push(siparisSatiriOku_(d[i], i + 1));
  }
  return out;
}

function siparisBul_(liste, id) {
  for (var i = 0; i < liste.length; i++) {
    if (liste[i].id === String(id)) return liste[i];
  }
  return null;
}

/**
 * Sunucu tarafında sipariş numarası üretir (DK-AA-YY-0001).
 * Kilit içinde çağrılmalıdır; iki kişi aynı anda kaydederse çakışmaz.
 */
function siparisNoUret_(tarih, mevcutListe) {
  var t = dstr_(tarih) || dstr_(new Date());
  var parcalar = t.split('-');
  var yil = (parcalar[0] || '').slice(-2);
  var ay = parcalar[1] || '01';
  var onEk = ayarPaketiGetir_().siparisNoOnEk + '-' + ay + '-' + yil + '-';
  var enBuyuk = 0;
  (mevcutListe || []).forEach(function (s) {
    if (s.no && s.no.indexOf(onEk) === 0) {
      var n = parseInt(s.no.split('-').pop(), 10);
      if (!isNaN(n) && n > enBuyuk) enBuyuk = n;
    }
  });
  return onEk + String(enBuyuk + 1).padStart(4, '0');
}

function siparisDogrula_(s) {
  if (!s) throw new Error('Sipariş verisi gerekli.');
  if (!cln_(s.adSoyad)) throw new Error('Müşteri adı zorunludur.');
  if (!dstr_(s.siparisTarihi)) throw new Error('Sipariş tarihi gerekli.');
}

/** Mağaza rolünde işlemi yapan personelin seçilmesi zorunludur. */
function personelDogrula_(session, personel) {
  var p = cln_(personel);
  if (session.rol === ROLLER.MAGAZA && !p) {
    throw new Error('İşlemi yapan satış personelini seçin.');
  }
  return p;
}

/** Durum/tahsilat değişiminde teslim tarihini otomatik belirler. */
function teslimTarihiHesapla_(mevcutTeslim, durum, odemeler, tutar) {
  if (durum === 'Teslim Edildi') return dstr_(new Date());
  var toplam = tahsilatToplami_(odemeler);
  if (tutar > 0 && toplam >= tutar - 0.005 && odemeler.length) {
    return odemeler[odemeler.length - 1].tarih;
  }
  return dstr_(mevcutTeslim);
}

function siparisSatirinaYaz_(s, siparis, odemeler, urunler, mevcut, session, personel) {
  var araToplam = araToplamHesapla_(urunler);
  var tutar = num_(siparis.tutar) > 0 ? num_(siparis.tutar) : araToplam;
  var tahsil = tahsilatToplami_(odemeler);
  var durum =
    SIPARIS_DURUMLARI.indexOf(cln_(siparis.durum)) > -1 ? cln_(siparis.durum) : SIPARIS_DURUMLARI[0];
  var simdi = new Date();
  var id = mevcut ? mevcut.id : Utilities.getUuid();

  var musteriId = musteriUpsert_(
    {
      musteriId: siparis.musteriId || (mevcut ? mevcut.musteriId : ''),
      adSoyad: siparis.adSoyad,
      telefon: siparis.telefon,
      eposta: siparis.eposta,
      tcVergi: siparis.tcVergi
    },
    siparis.recete
  );

  urunler.forEach(function (p) {
    if (p.kategori && p.marka) markaSagla_(p.kategori, p.marka);
  });

  var satir = [
    id,
    mevcut ? mevcut.no : siparisNoUret_(siparis.siparisTarihi, siparisTumunuOku_()),
    dstr_(siparis.siparisTarihi),
    teslimTarihiHesapla_(mevcut ? mevcut.teslimTarihi : siparis.teslimTarihi, durum, odemeler, tutar),
    cln_(siparis.personel),
    musteriId,
    cln_(siparis.adSoyad),
    cln_(siparis.telefon),
    cln_(siparis.eposta),
    cln_(siparis.tcVergi),
    JSON.stringify(urunler),
    JSON.stringify(siparis.recete || {}),
    araToplam,
    tutar,
    JSON.stringify(odemeler),
    tahsil,
    tutar - tahsil,
    durum,
    mevcut && mevcut.durum === durum ? dstr_(mevcut.durumTarihi) || dstr_(simdi) : dstr_(simdi),
    !!siparis.nebim,
    mevcut ? mevcut.olusturanHesap : session.email,
    mevcut ? mevcut.olusturanPersonel : personel || cln_(siparis.personel),
    mevcut ? '' : simdi,
    simdi,
    mevcut ? mevcut.silindi : false,
    mevcut ? dstr_(mevcut.silinmeTarihi) : ''
  ];

  if (mevcut) {
    /* Oluşturma zamanına dokunmadan güncelle */
    s.getRange(mevcut.row, 1, 1, 22).setValues([satir.slice(0, 22)]);
    s.getRange(mevcut.row, 24, 1, 3).setValues([[satir[23], satir[24], satir[25]]]);
  } else {
    s.appendRow(satir);
  }
  return { id: id, no: satir[1] };
}

/* ── API ── */

function siparisListele(token) {
  guard_(token);
  return siparisTumunuOku_().map(function (s) {
    delete s.row;
    return s;
  });
}

/**
 * Sipariş ekler veya günceller (id varsa günceller).
 * Kasa entegrasyonu açıksa tahsilatlar kasa hareketlerine yansıtılır.
 */
function siparisKaydet(token, siparis, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  siparisDogrula_(siparis);
  var urunler = urunleriTemizle_(siparis.urunler);
  var odemeler = odemeleriTemizle_(siparis.odemeler);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = siparisSheet_();
    var mevcut = cln_(siparis.id) ? siparisBul_(siparisTumunuOku_(), siparis.id) : null;
    var sonuc = siparisSatirinaYaz_(s, siparis, odemeler, urunler, mevcut, session, p);
    if (p) personelSagla_(p);
    logYaz_(
      token,
      mevcut ? 'SIPARIS_GUNCELLE' : 'SIPARIS_EKLE',
      'Siparisler',
      sonuc.id,
      sonuc.no + ' · ' + cln_(siparis.adSoyad) + ' · ' + num_(siparis.tutar),
      p
    );
    siparisKasaSenkronla_(sonuc.id);
    return sonuc;
  } finally {
    lock.releaseLock();
  }
}

/** Var olan siparişe tek tahsilat/iade ekler (hızlı tahsilat). */
function siparisOdemeEkle(token, id, odeme, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = siparisSheet_();
    var mevcut = siparisBul_(siparisTumunuOku_(), id);
    if (!mevcut) throw new Error('Sipariş bulunamadı.');
    var odemeler = odemeleriTemizle_(mevcut.odemeler.concat([odeme]));
    var guncel = {
      id: mevcut.id,
      siparisTarihi: mevcut.siparisTarihi,
      teslimTarihi: mevcut.teslimTarihi,
      personel: mevcut.personel,
      musteriId: mevcut.musteriId,
      adSoyad: mevcut.adSoyad,
      telefon: mevcut.telefon,
      eposta: mevcut.eposta,
      tcVergi: mevcut.tcVergi,
      urunler: mevcut.urunler,
      recete: mevcut.recete,
      tutar: mevcut.tutar,
      durum: mevcut.durum,
      nebim: mevcut.nebim
    };
    siparisSatirinaYaz_(s, guncel, odemeler, mevcut.urunler, mevcut, session, p);
    logYaz_(
      token,
      cln_(odeme && odeme.tip).toLowerCase() === 'iade' ? 'SIPARIS_IADE' : 'SIPARIS_TAHSILAT',
      'Siparisler',
      mevcut.id,
      mevcut.no + ' · ' + num_(odeme && odeme.tutar) + ' · ' + cln_(odeme && odeme.yontem),
      p
    );
    siparisKasaSenkronla_(mevcut.id);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function siparisDurumGuncelle(token, id, durum, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  if (SIPARIS_DURUMLARI.indexOf(cln_(durum)) === -1) throw new Error('Geçersiz sipariş durumu.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = siparisSheet_();
    var mevcut = siparisBul_(siparisTumunuOku_(), id);
    if (!mevcut) throw new Error('Sipariş bulunamadı.');
    var simdi = dstr_(new Date());
    var teslim = teslimTarihiHesapla_(mevcut.teslimTarihi, cln_(durum), mevcut.odemeler, mevcut.tutar);
    s.getRange(mevcut.row, 4).setValue(teslim);
    s.getRange(mevcut.row, 18, 1, 2).setValues([[cln_(durum), simdi]]);
    s.getRange(mevcut.row, 24).setValue(new Date());
    logYaz_(token, 'SIPARIS_DURUM', 'Siparisler', mevcut.id, mevcut.no + ' → ' + cln_(durum), p);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Çöp kutusuna taşır (soft delete) ve kasa hareketlerini geri alır. */
function siparisSil(token, id, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = siparisSheet_();
    var mevcut = siparisBul_(siparisTumunuOku_(), id);
    if (!mevcut) return false;
    s.getRange(mevcut.row, 25, 1, 2).setValues([[true, dstr_(new Date())]]);
    s.getRange(mevcut.row, 24).setValue(new Date());
    logYaz_(token, 'SIPARIS_SIL', 'Siparisler', mevcut.id, mevcut.no + ' · ' + mevcut.adSoyad, p);
    siparisKasaSenkronla_(mevcut.id);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function siparisGeriAl(token, id, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = siparisSheet_();
    var mevcut = siparisBul_(siparisTumunuOku_(), id);
    if (!mevcut) return false;
    s.getRange(mevcut.row, 25, 1, 2).setValues([[false, '']]);
    s.getRange(mevcut.row, 24).setValue(new Date());
    logYaz_(token, 'SIPARIS_GERI_AL', 'Siparisler', mevcut.id, mevcut.no, p);
    siparisKasaSenkronla_(mevcut.id);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Kalıcı silme yalnızca muhasebe/yöneticide. */
function siparisKaliciSil(token, id) {
  guardMuhasebe_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = siparisSheet_();
    var mevcut = siparisBul_(siparisTumunuOku_(), id);
    if (!mevcut) return false;
    siparisKasaHareketleriniSil_(mevcut.id);
    s.deleteRow(mevcut.row);
    logYaz_(token, 'SIPARIS_KALICI_SIL', 'Siparisler', mevcut.id, mevcut.no + ' · ' + mevcut.adSoyad);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Çöpte 3 günden uzun süredir bekleyen siparişleri kalıcı siler.
 * Sunucu tarafındadır; istemciden tetiklenmez (zamanlayıcıya da bağlanabilir).
 */
function copTemizle_() {
  var liste = siparisTumunuOku_();
  var bugun = new Date();
  var s = siparisSheet_();
  var silinen = 0;
  for (var i = liste.length - 1; i >= 0; i--) {
    var rec = liste[i];
    if (!rec.silindi || !rec.silinmeTarihi) continue;
    var t = new Date(rec.silinmeTarihi + 'T00:00:00');
    if (isNaN(t.getTime())) continue;
    if ((bugun - t) / 86400000 > COP_SAKLAMA_GUN) {
      siparisKasaHareketleriniSil_(rec.id);
      s.deleteRow(rec.row);
      silinen++;
    }
  }
  return silinen;
}

function copTemizle(token) {
  guardMuhasebe_(token);
  return copTemizle_();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SIPARIS_DURUMLARI: SIPARIS_DURUMLARI,
    COP_SAKLAMA_GUN: COP_SAKLAMA_GUN,
    siparisSheet_: siparisSheet_,
    jsonOku_: jsonOku_,
    adetNormalize_: adetNormalize_,
    urunleriTemizle_: urunleriTemizle_,
    araToplamHesapla_: araToplamHesapla_,
    odemeleriTemizle_: odemeleriTemizle_,
    tahsilatToplami_: tahsilatToplami_,
    siparisTumunuOku_: siparisTumunuOku_,
    siparisBul_: siparisBul_,
    siparisNoUret_: siparisNoUret_,
    siparisDogrula_: siparisDogrula_,
    personelDogrula_: personelDogrula_,
    teslimTarihiHesapla_: teslimTarihiHesapla_,
    siparisListele: siparisListele,
    siparisKaydet: siparisKaydet,
    siparisOdemeEkle: siparisOdemeEkle,
    siparisDurumGuncelle: siparisDurumGuncelle,
    siparisSil: siparisSil,
    siparisGeriAl: siparisGeriAl,
    siparisKaliciSil: siparisKaliciSil,
    copTemizle_: copTemizle_,
    copTemizle: copTemizle
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
