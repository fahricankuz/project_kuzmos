/**
 * Kuzmos · Kasa — Aylık raporun Sheets'e sabit bir sayfa olarak üretilmesi.
 * Script çalışmasa bile Sheets'te okunabilir rapor kalsın diye.
 */

function raporUret(token, ay) {
  guard_(token);
  if (!/^\d{4}-\d{2}$/.test(cln_(ay))) throw new Error('Ay YYYY-MM biçiminde olmalı.');
  var veri = tumVeriGetir(token);
  var ad = 'Rapor_' + String(ay).replace('-', '_');
  var s = ss_().getSheetByName(ad);
  if (s) ss_().deleteSheet(s);
  s = ss_().insertSheet(ad);

  var grup = {};
  veri.hareketler.forEach(function (h) {
    if (String(h.tarih).substring(0, 7) !== ay) return;
    var k = h.yon + '|' + h.ana + '|' + h.alt;
    grup[k] = (grup[k] || 0) + h.tutar;
  });

  var rows = [['KUZMOS · AYLIK KASA RAPORU', ay, ''], ['', '', ''], ['Yön', 'Ana Kategori', 'Alt Kategori', 'Tutar']];
  Object.keys(grup)
    .sort()
    .forEach(function (k) {
      var p = k.split('|');
      rows.push([p[0], p[1], p[2], grup[k]]);
    });
  var gelir = 0,
    gider = 0;
  Object.keys(grup).forEach(function (k) {
    if (k.indexOf('GELIR|') === 0) gelir += grup[k];
    else gider += grup[k];
  });
  rows.push(['', '', '', '']);
  rows.push(['TOPLAM GELİR', '', '', gelir]);
  rows.push(['TOPLAM GİDER', '', '', gider]);
  rows.push(['NET', '', '', gelir - gider]);

  s.getRange(1, 1, rows.length, 4).setValues(rows);
  s.getRange(3, 1, 1, 4).setFontWeight('bold').setBackground('#111').setFontColor('#F5C800');
  s.setFrozenRows(3);
  return 'Rapor üretildi: ' + ad;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { raporUret: raporUret };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
