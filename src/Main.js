/**
 * Kuzmos — Web app giriş noktası ve toplu veri uç noktası.
 *
 * Arayüz birden fazla HTML dosyasına bölünmüştür (Index + Css + Js*.html);
 * doGet bunları şablon üzerinden tek sayfada birleştirir.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Kuzmos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

/** Index.html içinden <?!= include('Css') ?> şeklinde çağrılır. */
function include(dosyaAdi) {
  return HtmlService.createHtmlOutputFromFile(dosyaAdi).getContent();
}

/** Mağaza rolüne gönderilecek sadeleştirilmiş ayar paketi. */
function ayarPaketiRolFiltrele_(paket, rol) {
  if (rol === ROLLER.YONETICI || rol === ROLLER.MUHASEBE) return paket;
  return {
    hesaplar: paket.hesaplar,
    bankalar: paket.bankalar,
    taksitler: paket.taksitler,
    kkKomisyon: paket.kkKomisyon,
    personelPrim: paket.personelPrim,
    masrafKalemleri: paket.masrafKalemleri,
    masrafAnaKategori: paket.masrafAnaKategori,
    nakitHesap: paket.nakitHesap,
    siparisNoOnEk: paket.siparisNoOnEk,
    kasaEntegrasyon: paket.kasaEntegrasyon,
    ham: {}
  };
}

/**
 * Tek çağrıda uygulamanın ihtiyaç duyduğu her şeyi döner.
 * Finansal veriler (kasa hareketleri, cari, banka, tekrarlayan, kasa
 * kategorileri) yalnızca yönetici/muhasebe rolüne gider.
 */
function tumVeriGetir(token) {
  var session = guard_(token);
  var finans = session.rol === ROLLER.YONETICI || session.rol === ROLLER.MUHASEBE;
  var paket = ayarPaketiGetir_();

  var veri = {
    kullanici: { email: session.email, ad: session.ad, rol: session.rol },
    ayar: ayarPaketiRolFiltrele_(paket, session.rol),
    personel: personelListesiGetir_(finans),
    urunKategorileri: urunKategorileriGetir_(),
    markalar: markalariGetir_(),
    siparis: siparisListele(token),
    musteriler: musteriListele(token),
    hedefler: hedefleriGetir_(),
    masraflar: magazaMasrafListele(token, ''),
    hareketler: [],
    cari: [],
    banka: [],
    tekrar: [],
    kasaKategorileri: []
  };

  if (finans) {
    veri.hareketler = hareketleriGetir(token);
    veri.cari = cariGetir(token);
    veri.banka = bankaGetir(token);
    veri.tekrar = tekrarGetir(token);
    veri.kasaKategorileri = kasaKategorileriGetir_();
  }
  return veri;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet: doGet,
    include: include,
    ayarPaketiRolFiltrele_: ayarPaketiRolFiltrele_,
    tumVeriGetir: tumVeriGetir
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
