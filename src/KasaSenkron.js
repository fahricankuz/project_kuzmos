/**
 * Kuzmos — Sipariş tahsilatlarının kasaya otomatik yansıtılması.
 *
 * Birleşik sistemin asıl kazancı burasıdır: mağaza bir tahsilat girdiğinde
 * kasa tarafında ayrıca gelir kaydı açılmasına gerek kalmaz.
 *
 *  - Her ödeme, KENDİ tarihiyle bir kasa hareketine dönüşür (nakit esaslı).
 *  - Nakit → "Nakit Satış" / nakit hesabı; Kredi kartı → "POS / Kredi Kartı
 *    Satışı" / "<Banka> POS" hesabı; iade → "Satış İadesi" (GİDER).
 *  - Ödeme silinir/değişirse ilgili hareket güncellenir veya kaldırılır.
 *  - Sipariş çöpe atılırsa hareketleri de geri alınır, geri alınırsa döner.
 *
 * Senkron, `siparis_kasa_entegrasyon` ayarı ile kapatılabilir.
 */

var KASA_KAYNAK_SIPARIS = 'SIPARIS';

function kasaKaynakIdUret_(siparisId, odemeId) {
  return String(siparisId) + ':' + String(odemeId);
}

function posHesapAdi_(banka) {
  var b = cln_(banka);
  return b ? b + ' POS' : 'POS';
}

/** Hesap Ayarlar'daki hesap listesinde yoksa ekler (banka mutabakatı için). */
function hesapSagla_(hesapAdi) {
  var ad = cln_(hesapAdi);
  if (!ad) return false;
  var a = ayarOku_();
  var liste = listeAyristir_(a.hesaplar);
  for (var i = 0; i < liste.length; i++) {
    if (liste[i].toLowerCase() === ad.toLowerCase()) return false;
  }
  liste.push(ad);
  ayarYaz_('hesaplar', liste.join(', '));
  return true;
}

/** Bir ödemeden üretilecek kasa hareketini tanımlar. */
function odemeHareketiOlustur_(siparis, odeme, ayar) {
  var iade = odeme.tip === 'iade';
  var nakit = odeme.yontem !== 'kk';
  var ana = iade ? 'Satış İadesi' : nakit ? 'Nakit Satış' : 'POS / Kredi Kartı Satışı';
  var alt = nakit ? 'Mağaza Nakit' : cln_(odeme.banka) || 'Diğer POS';
  var hesap = nakit ? ayar.nakitHesap : posHesapAdi_(odeme.banka);
  var aciklama =
    'Sipariş ' +
    cln_(siparis.no) +
    ' · ' +
    cln_(siparis.adSoyad) +
    (odeme.yontem === 'kk' && cln_(odeme.taksit) ? ' · ' + cln_(odeme.taksit) : '') +
    (iade ? ' · İADE' : '');

  return {
    id: 'sip_' + siparis.id + '_' + odeme.id,
    tarih: odeme.tarih,
    yon: iade ? 'GIDER' : 'GELIR',
    ana: ana,
    alt: alt,
    tutar: num_(odeme.tutar),
    hesap: hesap,
    aciklama: aciklama,
    kaynakId: kasaKaynakIdUret_(siparis.id, odeme.id)
  };
}

/** Bu siparişe ait mevcut otomatik hareket satırlarını bulur. */
function siparisHareketSatirlari_(siparisId) {
  var d = hareketSheet_().getDataRange().getValues();
  var onEk = String(siparisId) + ':';
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][11]) !== KASA_KAYNAK_SIPARIS) continue;
    if (cln_(d[i][12]).indexOf(onEk) !== 0) continue;
    out.push({ row: i + 1, id: cln_(d[i][0]), kaynakId: cln_(d[i][12]) });
  }
  return out;
}

/** Siparişin tüm otomatik hareketlerini fiziksel olarak siler. */
function siparisKasaHareketleriniSil_(siparisId) {
  var s = hareketSheet_();
  var satirlar = siparisHareketSatirlari_(siparisId);
  for (var i = satirlar.length - 1; i >= 0; i--) {
    s.deleteRow(satirlar[i].row);
  }
  return satirlar.length;
}

/**
 * Siparişin ödemelerini kasa hareketleriyle eşitler.
 * Sipariş silinmişse (çöpte) hareketleri kaldırır.
 */
function siparisKasaSenkronla_(siparisId) {
  var ayar = ayarPaketiGetir_();
  if (!ayar.kasaEntegrasyon) return { eklenen: 0, guncellenen: 0, silinen: 0 };

  var siparis = siparisBul_(siparisTumunuOku_(), siparisId);
  if (!siparis) return { eklenen: 0, guncellenen: 0, silinen: siparisKasaHareketleriniSil_(siparisId) };

  var hedefler = [];
  if (!siparis.silindi) {
    siparis.odemeler.forEach(function (o) {
      hedefler.push(odemeHareketiOlustur_(siparis, o, ayar));
    });
  }

  var mevcutSatirlar = siparisHareketSatirlari_(siparis.id);
  var mevcutMap = {};
  mevcutSatirlar.forEach(function (m) {
    mevcutMap[m.kaynakId] = m;
  });

  var kaydeden = cln_(siparis.olusturanPersonel) || cln_(siparis.personel) || 'Sipariş';
  var eklenen = 0;
  var guncellenen = 0;

  hedefler.forEach(function (h) {
    kasaKategoriSagla_(h.ana, h.alt, h.yon, 'OP');
    hesapSagla_(h.hesap);
    var vardi = !!mevcutMap[h.kaynakId];
    hareketYaz_(h, kaydeden, KASA_KAYNAK_SIPARIS, h.kaynakId);
    if (vardi) guncellenen++;
    else eklenen++;
    delete mevcutMap[h.kaynakId];
  });

  /* Artık karşılığı olmayan (silinmiş ödeme) hareketleri kaldır */
  var kalanlar = Object.keys(mevcutMap).map(function (k) {
    return mevcutMap[k];
  });
  kalanlar.sort(function (a, b) {
    return b.row - a.row;
  });
  var s = hareketSheet_();
  kalanlar.forEach(function (m) {
    s.deleteRow(m.row);
  });

  return { eklenen: eklenen, guncellenen: guncellenen, silinen: kalanlar.length };
}

/** Tüm siparişleri kasayla yeniden eşitler (ayar sonradan açılırsa). */
function kasaSenkronYenile(token) {
  guardMuhasebe_(token);
  var liste = siparisTumunuOku_();
  var toplam = { eklenen: 0, guncellenen: 0, silinen: 0 };
  liste.forEach(function (s) {
    var r = siparisKasaSenkronla_(s.id);
    toplam.eklenen += r.eklenen;
    toplam.guncellenen += r.guncellenen;
    toplam.silinen += r.silinen;
  });
  logYaz_(token, 'KASA_SENKRON', 'Hareketler', '', JSON.stringify(toplam));
  return toplam;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KASA_KAYNAK_SIPARIS: KASA_KAYNAK_SIPARIS,
    kasaKaynakIdUret_: kasaKaynakIdUret_,
    posHesapAdi_: posHesapAdi_,
    hesapSagla_: hesapSagla_,
    odemeHareketiOlustur_: odemeHareketiOlustur_,
    siparisHareketSatirlari_: siparisHareketSatirlari_,
    siparisKasaHareketleriniSil_: siparisKasaHareketleriniSil_,
    siparisKasaSenkronla_: siparisKasaSenkronla_,
    kasaSenkronYenile: kasaSenkronYenile
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
