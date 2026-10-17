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
  return hesaplariSagla_([hesapAdi]) > 0;
}

/** Birden fazla hesabı tek yazmayla sağlar (ödeme başına ayrı yazma yapmamak için). */
function hesaplariSagla_(hesapAdlari) {
  var liste = listeAyristir_(ayarOku_().hesaplar);
  var mevcut = {};
  liste.forEach(function (h) {
    mevcut[h.toLowerCase()] = true;
  });
  var eklenen = 0;
  (hesapAdlari || []).forEach(function (x) {
    var ad = cln_(x);
    if (!ad || mevcut[ad.toLowerCase()]) return;
    mevcut[ad.toLowerCase()] = true;
    liste.push(ad);
    eklenen++;
  });
  if (eklenen) ayarYaz_('hesaplar', liste.join(', '));
  return eklenen;
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

/**
 * Bu siparişe ait mevcut otomatik hareket satırlarını bulur.
 * `veri` verilirse sayfa yeniden okunmaz (tek okumayla senkron için).
 */
function siparisHareketSatirlari_(siparisId, veri) {
  var d = veri || hareketSheet_().getDataRange().getValues();
  var onEk = String(siparisId) + ':';
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][11]) !== KASA_KAYNAK_SIPARIS) continue;
    if (cln_(d[i][12]).indexOf(onEk) !== 0) continue;
    out.push({ row: i + 1, id: cln_(d[i][0]), kaynakId: cln_(d[i][12]), kaydeden: cln_(d[i][8]) });
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
 *
 * Hız: Hareketler sayfası TEK kez okunur, kategori/hesap kontrolü ödeme
 * başına değil senkron başına bir kez yapılır, yeni satırlar tek yazmayla
 * eklenir. `siparisObj` verilirse Siparisler sayfası hiç okunmaz.
 */
function siparisKasaSenkronla_(siparisId, siparisObj) {
  var ayar = ayarPaketiGetir_();
  if (!ayar.kasaEntegrasyon) return { eklenen: 0, guncellenen: 0, silinen: 0 };

  var siparis = siparisObj && String(siparisObj.id) === String(siparisId) ? siparisObj : null;
  if (!siparis) siparis = siparisBul_(siparisTumunuOku_(), siparisId);
  if (!siparis) return { eklenen: 0, guncellenen: 0, silinen: siparisKasaHareketleriniSil_(siparisId) };

  var hedefler = [];
  if (!siparis.silindi) {
    (siparis.odemeler || []).forEach(function (o) {
      hedefler.push(odemeHareketiOlustur_(siparis, o, ayar));
    });
  }

  var s = hareketSheet_();
  var d = s.getDataRange().getValues();
  var mevcutMap = {};
  siparisHareketSatirlari_(siparis.id, d).forEach(function (m) {
    mevcutMap[m.kaynakId] = m;
  });

  /* Kategori ve hesap kontrolü: ödeme başına değil, toplu */
  if (hedefler.length) {
    kasaKategorileriSagla_(
      hedefler.map(function (h) {
        return { ana: h.ana, alt: h.alt, yon: h.yon, bolum: 'OP' };
      })
    );
    hesaplariSagla_(
      hedefler.map(function (h) {
        return h.hesap;
      })
    );
  }

  var kaydeden = cln_(siparis.olusturanPersonel) || cln_(siparis.personel) || 'Sipariş';
  var yeniSatirlar = [];
  var guncellenen = 0;

  hedefler.forEach(function (h) {
    var row = hareketSatiriOlustur_(h, kaydeden, KASA_KAYNAK_SIPARIS, h.kaynakId);
    var m = mevcutMap[h.kaynakId];
    if (m) {
      /* Var olan kaydı güncellerken "kaydeden" bilgisini korur. */
      row[8] = m.kaydeden || kaydeden;
      s.getRange(m.row, 1, 1, HAREKET_KOLON_SAYISI).setValues([row]);
      guncellenen++;
      delete mevcutMap[h.kaynakId];
    } else {
      yeniSatirlar.push(row);
    }
  });

  var eklenen = satirlariEkle_(s, yeniSatirlar, HAREKET_KOLON_SAYISI);

  /* Artık karşılığı olmayan (silinmiş ödeme) hareketleri kaldır */
  var kalanlar = Object.keys(mevcutMap).map(function (k) {
    return mevcutMap[k];
  });
  kalanlar.sort(function (a, b) {
    return b.row - a.row;
  });
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
    var r = siparisKasaSenkronla_(s.id, s);
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
    hesaplariSagla_: hesaplariSagla_,
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
