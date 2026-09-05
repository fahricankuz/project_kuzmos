/**
 * Kuzmos · Kasa — Sipariş modülü.
 *
 * Eskiden ayrı bir Google Sheets projesinden salt okuma yapılıyordu; artık
 * sipariş verisi Kasa ile aynı spreadsheet içinde kendi sayfasında
 * (SHEET_NAMES.SIPARIS) tutulur ve buradan hem yazılır hem okunur.
 *
 * Erişim: sipariş oluşturma/listeleme herkese (magaza dahil) açık, çünkü
 * mağaza rolünün tek işi budur. Kendi girmediği bir siparişi düzenlemek/
 * silmek için ise yönetici veya muhasebe olmak ya da o siparişi kendisinin
 * oluşturmuş olmak gerekir. Finansal özet (siparisOzetiGetir) sadece
 * yönetici/muhasebe rolüne açıktır.
 */

function siparisSheet_() {
  return sheet_(SHEET_NAMES.SIPARIS, [
    'ID',
    'Sipariş Tarihi',
    'Müşteri',
    'Satış Temsilcisi',
    'Ürünler (JSON)',
    'Kapora Tutar',
    'Kapora Yöntem',
    'Bakiye Tutar',
    'Bakiye Yöntem',
    'Bakiye Tarihi',
    'Not',
    'Oluşturan',
    'Oluşturma Zamanı',
    'Güncelleme Zamanı',
    'Silindi'
  ]);
}

function siparisDogrula_(s) {
  if (!s || !dstr_(s.tarih)) throw new Error('Tarih gerekli.');
  if (!cln_(s && s.musteri)) throw new Error('Müşteri adı gerekli.');
  if (!s.urunler || !s.urunler.length) throw new Error('En az bir ürün gerekli.');
}

function siparisUrunleriTemizle_(urunler) {
  return (urunler || []).map(function (p) {
    return {
      urun: cln_(p && p.urun),
      kategori: cln_(p && p.kategori) || 'Kategorisiz',
      fiyat: num_(p && p.fiyat),
      adet: parseInt(p && p.adet, 10) || 1
    };
  });
}

function siparisSatiriBul_(d, id) {
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) === String(id)) return i;
  }
  return -1;
}

function siparisDuzenlemeYetkisiVarMi_(session, olusturanEmail) {
  if (session.rol === ROLLER.YONETICI || session.rol === ROLLER.MUHASEBE) return true;
  return cln_(olusturanEmail).toLowerCase() === cln_(session.email).toLowerCase();
}

function siparisEkle(token, siparis) {
  var session = guard_(token);
  var urunler = siparisUrunleriTemizle_(siparis && siparis.urunler);
  siparisDogrula_({ tarih: siparis && siparis.tarih, musteri: siparis && siparis.musteri, urunler: urunler });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = Utilities.getUuid();
    var simdi = new Date();
    siparisSheet_().appendRow([
      id,
      dstr_(siparis.tarih),
      cln_(siparis.musteri),
      cln_(siparis.temsilci) || session.ad,
      JSON.stringify(urunler),
      num_(siparis.kaporaTutar),
      cln_(siparis.kaporaYontem) || 'nakit',
      num_(siparis.bakiyeTutar),
      cln_(siparis.bakiyeYontem) || 'nakit',
      dstr_(siparis.bakiyeTarih),
      cln_(siparis.notlar),
      session.email,
      simdi,
      simdi,
      false
    ]);
    return id;
  } finally {
    lock.releaseLock();
  }
}

function siparisGuncelle(token, id, siparis) {
  var session = guard_(token);
  var urunler = siparisUrunleriTemizle_(siparis && siparis.urunler);
  siparisDogrula_({ tarih: siparis && siparis.tarih, musteri: siparis && siparis.musteri, urunler: urunler });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var s = siparisSheet_();
    var d = s.getDataRange().getDisplayValues();
    var rowIdx = siparisSatiriBul_(d, id);
    if (rowIdx === -1) throw new Error('Sipariş bulunamadı.');
    if (!siparisDuzenlemeYetkisiVarMi_(session, d[rowIdx][11])) {
      throw new Error('Bu siparişi düzenleme yetkiniz yok.');
    }
    s.getRange(rowIdx + 1, 2, 1, 13).setValues([
      [
        dstr_(siparis.tarih),
        cln_(siparis.musteri),
        cln_(siparis.temsilci) || d[rowIdx][3],
        JSON.stringify(urunler),
        num_(siparis.kaporaTutar),
        cln_(siparis.kaporaYontem) || 'nakit',
        num_(siparis.bakiyeTutar),
        cln_(siparis.bakiyeYontem) || 'nakit',
        dstr_(siparis.bakiyeTarih),
        cln_(siparis.notlar),
        d[rowIdx][11],
        d[rowIdx][12],
        new Date()
      ]
    ]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function siparisSil(token, id) {
  var session = guard_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = siparisSheet_();
    var d = s.getDataRange().getDisplayValues();
    var rowIdx = siparisSatiriBul_(d, id);
    if (rowIdx === -1) return false;
    if (!siparisDuzenlemeYetkisiVarMi_(session, d[rowIdx][11])) {
      throw new Error('Bu siparişi silme yetkiniz yok.');
    }
    s.getRange(rowIdx + 1, 15).setValue(true);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function siparisListele(token) {
  guard_(token);
  var d = siparisSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    var r = d[i];
    if (!cln_(r[0])) continue;
    if (String(r[14]).toLowerCase() === 'true') continue;
    var urunler = [];
    try {
      urunler = JSON.parse(r[4] || '[]');
    } catch (e) {
      urunler = [];
    }
    out.push({
      id: cln_(r[0]),
      tarih: dstr_(r[1]),
      musteri: cln_(r[2]),
      temsilci: cln_(r[3]),
      urunler: urunler,
      kaporaTutar: num_(r[5]),
      kaporaYontem: cln_(r[6]),
      bakiyeTutar: num_(r[7]),
      bakiyeYontem: cln_(r[8]),
      bakiyeTarih: dstr_(r[9]),
      notlar: cln_(r[10]),
      olusturanEmail: cln_(r[11])
    });
  }
  return out;
}

/** Yönetici/muhasebe için aylık personel satışı ve kategori kırılımı. */
function siparisOzetiGetir(token) {
  guardMuhasebe_(token);
  var out = { tahsilat: [], personel: {}, kategori: {} };
  var d = siparisSheet_().getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var r = d[i];
    if (!cln_(r[0])) continue;
    if (String(r[14]).toLowerCase() === 'true') continue;

    var tarih = dstr_(r[1]);
    var temsilci = cln_(r[3]) || 'Belirtilmemiş';
    var urunler = [];
    try {
      urunler = JSON.parse(r[4] || '[]');
    } catch (e) {
      urunler = [];
    }
    var kaporaTutar = num_(r[5]);
    var kaporaYontem = cln_(r[6]);
    var bakiyeTutar = num_(r[7]);
    var bakiyeYontem = cln_(r[8]);
    var bakiyeTarih = dstr_(r[9]);

    if (kaporaTutar > 0 && tarih) {
      out.tahsilat.push({ tarih: tarih, tutar: kaporaTutar, yontem: kaporaYontem });
      var ayK = tarih.substring(0, 7);
      if (!out.personel[ayK]) out.personel[ayK] = {};
      out.personel[ayK][temsilci] = (out.personel[ayK][temsilci] || 0) + kaporaTutar;
    }
    if (bakiyeTutar > 0) {
      var bTarih = bakiyeTarih || tarih;
      if (bTarih) {
        out.tahsilat.push({ tarih: bTarih, tutar: bakiyeTutar, yontem: bakiyeYontem });
        var ayB = bTarih.substring(0, 7);
        if (!out.personel[ayB]) out.personel[ayB] = {};
        out.personel[ayB][temsilci] = (out.personel[ayB][temsilci] || 0) + bakiyeTutar;
      }
    }

    var ayKat = tarih.substring(0, 7);
    if (ayKat) {
      urunler.forEach(function (p) {
        var line = num_(p.fiyat) * (parseInt(p.adet, 10) || 1);
        if (line <= 0) return;
        var k = cln_(p.kategori) || 'Kategorisiz';
        if (!out.kategori[ayKat]) out.kategori[ayKat] = {};
        if (!out.kategori[ayKat][k]) out.kategori[ayKat][k] = { tutar: 0, adet: 0 };
        out.kategori[ayKat][k].tutar += line;
        out.kategori[ayKat][k].adet += parseInt(p.adet, 10) || 1;
      });
    }
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    siparisSheet_: siparisSheet_,
    siparisDogrula_: siparisDogrula_,
    siparisUrunleriTemizle_: siparisUrunleriTemizle_,
    siparisEkle: siparisEkle,
    siparisGuncelle: siparisGuncelle,
    siparisSil: siparisSil,
    siparisListele: siparisListele,
    siparisOzetiGetir: siparisOzetiGetir
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
