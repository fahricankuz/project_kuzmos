/**
 * src/*.js dosyalarını GAS'taki gibi ortak global scope'a yükler.
 * gasMocks.installGasMocks() bu fonksiyondan ÖNCE çağrılmış olmalı
 * ki dosyalar SpreadsheetApp vb. global'leri bulabilsin.
 */
function loadSrc() {
  require('../src/Config.js');
  require('../src/Utils.js');
  require('../src/Crypto.js');
  require('../src/SheetService.js');
  require('../src/Auth.js');
  require('../src/Log.js');
  require('../src/Ayarlar.js');
  require('../src/Kategori.js');
  require('../src/Personel.js');
  require('../src/Musteri.js');
  require('../src/Hareketler.js');
  require('../src/Cari.js');
  require('../src/Banka.js');
  require('../src/Tekrar.js');
  require('../src/KasaSenkron.js');
  require('../src/Siparis.js');
  require('../src/Masraf.js');
  require('../src/Hedef.js');
  require('../src/Rapor.js');
  require('../src/Setup.js');
  require('../src/Main.js');
}

module.exports = { loadSrc: loadSrc };
