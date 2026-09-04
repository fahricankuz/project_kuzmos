/* eslint-disable no-control-regex -- strips stray control chars pasted into Sheets cells */
/**
 * Kuzmos · Kasa — Sipariş sisteminden salt okuma (satış/personel/kategori).
 * Bu modül Sipariş spreadsheet'ine ASLA yazmaz.
 */

function bankaAyikla_(cc) {
  var s = cln_(cc);
  if (!s) return '';
  var bankalar = ['Akbank', 'QNB', 'Garanti', 'İş Bankası', 'Yapıkredi', 'Yapı Kredi', 'Ziraat', 'Halkbank', 'TZH Vakıf', 'TEB'];
  for (var i = 0; i < bankalar.length; i++) {
    if (s.indexOf(bankalar[i]) > -1) return bankalar[i] === 'Yapıkredi' ? 'Yapı Kredi' : bankalar[i];
  }
  return '';
}

function siparisOzetiGetir(token) {
  guard_(token);
  var out = { tahsilat: [], personel: {}, kategori: {}, hata: '' };
  var siparisId = getConfig_().siparisId;
  if (!siparisId) {
    out.hata = 'Sipariş sistemi bağlantısı yapılandırılmamış (SIPARIS_SPREADSHEET_ID).';
    return out;
  }
  try {
    var sh = SpreadsheetApp.openById(siparisId).getSheetByName('Arsiv_DB');
    if (!sh) {
      out.hata = 'Arsiv_DB bulunamadı';
      return out;
    }
    var d = sh.getDataRange().getDisplayValues();
    for (var i = 1; i < d.length; i++) {
      var row = d[i];
      var colA = cln_(row[0]);
      if (!colA || colA === 'ID') continue;

      var rec = null;
      try {
        if (colA.indexOf('B64_V2|') === 0) {
          var parts = colA.split('|');
          if (parts.length >= 3) rec = JSON.parse(Utilities.newBlob(Utilities.base64Decode(parts[2])).getDataAsString());
        } else if (colA.charAt(0) === '{' || (colA.charAt(0) === "'" && colA.charAt(1) === '{')) {
          rec = JSON.parse(colA.replace(/^'/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, ''));
        }
      } catch (e) {
        rec = null;
      }

      if (!rec) {
        if (String(row[16]).toLowerCase() === 'true') continue;
        rec = {
          siparisTarihi: dstr_(row[2]),
          satisTem: cln_(row[4]),
          tutar: cln_(row[9]),
          kapora: cln_(row[10]),
          bakiye: cln_(row[11])
        };
        try {
          rec.products = JSON.parse(String(row[12] || '[]').replace(/[\x00-\x1F\x7F-\x9F]/g, ''));
        } catch (e) {
          rec.products = [];
        }
        var pay = {};
        try {
          pay = JSON.parse(String(row[14] || '{}').replace(/[\x00-\x1F\x7F-\x9F]/g, ''));
        } catch (e) {
          /* ignore malformed payment payload */
        }
        rec.ccDetails = pay.ccDetails || {};
        rec.kaporaKK = pay.kaporaKK;
        rec.kaporaNakit = pay.kaporaNakit;
        rec.bakiyeKK = pay.bakiyeKK;
        rec.bakiyeNakit = pay.bakiyeNakit;
        rec.bakiyeTarih = dstr_(pay.bakiyeTarih);
      }
      if (rec.deleted) continue;

      /* Ödemeler: yeni model varsa onu kullan, yoksa kapora/bakiyeden türet */
      var odemeler = [];
      var cd = rec.ccDetails || {};
      if (cd.payments && cd.payments.length) {
        cd.payments.forEach(function (p) {
          odemeler.push({ tutar: num_(p.tutar), tarih: dstr_(p.tarih), yontem: p.yontem, cc: cln_(p.ccDetail) });
        });
      } else {
        var kap = num_(rec.kapora);
        if (kap > 0) odemeler.push({ tutar: kap, tarih: dstr_(rec.siparisTarihi), yontem: rec.kaporaKK ? 'kk' : 'nakit', cc: cln_(cd.kaporaKK) });
        var bak = num_(rec.bakiye);
        if (bak > 0 && (rec.bakiyeNakit || rec.bakiyeKK))
          odemeler.push({ tutar: bak, tarih: dstr_(rec.bakiyeTarih || rec.siparisTarihi), yontem: rec.bakiyeKK ? 'kk' : 'nakit', cc: cln_(cd.bakiyeKK) });
      }

      odemeler.forEach(function (o) {
        if (o.tutar <= 0 || !o.tarih) return;
        out.tahsilat.push({ tarih: o.tarih, tutar: o.tutar, yontem: o.yontem, banka: bankaAyikla_(o.cc) });
        var ay = o.tarih.substring(0, 7);
        var rep = cln_(rec.satisTem) || 'Belirtilmemiş';
        if (!out.personel[ay]) out.personel[ay] = {};
        out.personel[ay][rep] = (out.personel[ay][rep] || 0) + o.tutar;
      });

      /* Kategori bazlı satış: sipariş tutarını ürün kategorilerine orantılı dağıt */
      var ay2 = dstr_(rec.siparisTarihi).substring(0, 7);
      var prods = rec.products || [];
      var ara = 0;
      prods.forEach(function (p) {
        ara += num_(p.fiyat) * (parseInt(p.adet, 10) || 1);
      });
      var tut = num_(rec.tutar);
      if (ara > 0 && ay2) {
        var oran = tut / ara;
        if (!out.kategori[ay2]) out.kategori[ay2] = {};
        prods.forEach(function (p) {
          var line = num_(p.fiyat) * (parseInt(p.adet, 10) || 1);
          if (line <= 0) return;
          var k = cln_(p.kategori) || 'Kategorisiz';
          if (!out.kategori[ay2][k]) out.kategori[ay2][k] = { tutar: 0, adet: 0 };
          out.kategori[ay2][k].tutar += line * oran;
          out.kategori[ay2][k].adet += parseInt(p.adet, 10) || 1;
        });
      }
    }
  } catch (e) {
    out.hata = String((e && e.message) || e);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bankaAyikla_: bankaAyikla_, siparisOzetiGetir: siparisOzetiGetir };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
