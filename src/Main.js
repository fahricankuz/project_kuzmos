/**
 * Kuzmos · Kasa — Web app giriş noktası ve toplu veri uç noktası.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kuzmos · Kasa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function tumVeriGetir(token) {
  var session = guard_(token);
  var finansYetkili = session.rol === ROLLER.YONETICI || session.rol === ROLLER.MUHASEBE;
  return {
    ayar: finansYetkili ? ayarOku_() : {},
    hareketler: finansYetkili ? hareketleriGetir(token) : [],
    cari: finansYetkili ? cariGetir(token) : [],
    banka: finansYetkili ? bankaGetir(token) : [],
    tekrar: finansYetkili ? tekrarGetir(token) : [],
    siparis: siparisListele(token)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { doGet: doGet, tumVeriGetir: tumVeriGetir };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
