/**
 * Kuzmos · Kasa — Web app giriş noktası ve toplu veri uç noktası.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kuzmos · Kasa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function tumVeriGetir(token) {
  guard_(token);
  return {
    ayar: ayarOku_(),
    hareketler: hareketleriGetir(token),
    cari: cariGetir(token),
    banka: bankaGetir(token),
    tekrar: tekrarGetir(token)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { doGet: doGet, tumVeriGetir: tumVeriGetir };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
