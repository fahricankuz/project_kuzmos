/**
 * Kuzmos — Mağaza masraf girişi ve günlük/aylık kasa özeti.
 *
 * Mağaza rolü kasanın tamamını göremez; ama kendi masrafını girebilir ve
 * "bugünün / bu ayın kasası" özetini görebilir. Masraflar doğrudan kasanın
 * `Hareketler` sayfasına GİDER olarak yazılır, böylece muhasebe tarafında
 * ikinci bir giriş gerekmez.
 */

var KASA_KAYNAK_MASRAF = 'MAGAZA_MASRAF';

function masrafKalemDogrula_(ayar, kalem) {
  var k = cln_(kalem);
  if (!k) throw new Error('Masraf kalemi seçin.');
  var izinli = ayar.masrafKalemleri;
  if (izinli.length && izinli.indexOf(k) === -1) {
    throw new Error('Geçersiz masraf kalemi: ' + k);
  }
  return k;
}

/** Mağaza masrafı ekler (kasaya GİDER hareketi olarak yazılır). */
function magazaMasrafEkle(token, masraf, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  var ayar = ayarPaketiGetir_();
  var kalem = masrafKalemDogrula_(ayar, masraf && masraf.kalem);
  var tutar = num_(masraf && masraf.tutar);
  if (!(tutar > 0)) throw new Error('Tutar sıfırdan büyük olmalı.');
  var tarih = dstr_(masraf && masraf.tarih) || dstr_(new Date());
  var hesap = cln_(masraf && masraf.hesap) || ayar.nakitHesap;

  kasaKategoriSagla_(ayar.masrafAnaKategori, kalem, 'GIDER', 'OP');
  hesapSagla_(hesap);

  var id = Utilities.getUuid();
  var kaydeden = p || session.ad;
  hareketYaz_(
    {
      id: id,
      tarih: tarih,
      yon: 'GIDER',
      ana: ayar.masrafAnaKategori,
      alt: kalem,
      tutar: tutar,
      hesap: hesap,
      aciklama: cln_(masraf && masraf.aciklama)
    },
    kaydeden,
    KASA_KAYNAK_MASRAF,
    id
  );
  logYaz_(token, 'MASRAF_EKLE', 'Hareketler', id, kalem + ' · ' + tutar + ' · ' + tarih, p);
  /* Kaydın kendisi döner: istemci tüm veriyi yeniden çekmek zorunda kalmaz. */
  return {
    id: id,
    tarih: tarih,
    ana: ayar.masrafAnaKategori,
    kalem: kalem,
    tutar: tutar,
    hesap: hesap,
    aciklama: cln_(masraf && masraf.aciklama),
    kaydeden: kaydeden
  };
}

/** Mağaza tarafından girilmiş masrafları listeler (mağaza rolü için). */
function magazaMasrafListele(token, ay) {
  guard_(token);
  var filtre = cln_(ay);
  var d = hareketSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    if (String(d[i][10]).toLowerCase() === 'true') continue;
    if (cln_(d[i][11]) !== KASA_KAYNAK_MASRAF) continue;
    var tarih = dstr_(d[i][1]);
    if (filtre && tarih.indexOf(filtre) !== 0) continue;
    out.push({
      id: cln_(d[i][0]),
      tarih: tarih,
      kalem: cln_(d[i][4]),
      tutar: num_(d[i][5]),
      hesap: cln_(d[i][6]),
      aciklama: cln_(d[i][7]),
      kaydeden: cln_(d[i][8])
    });
  }
  return out.sort(function (a, b) {
    return String(b.tarih).localeCompare(String(a.tarih));
  });
}

/** Mağaza yalnızca kendi girdiği masraf kayıtlarını silebilir. */
function magazaMasrafSil(token, id, personel) {
  var session = guard_(token);
  var p = personelDogrula_(session, personel);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = hareketSheet_();
    var d = s.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if (cln_(d[i][0]) !== String(id)) continue;
      if (cln_(d[i][11]) !== KASA_KAYNAK_MASRAF && session.rol === ROLLER.MAGAZA) {
        throw new Error('Bu kaydı silme yetkiniz yok.');
      }
      s.getRange(i + 1, 11).setValue(true);
      logYaz_(token, 'MASRAF_SIL', 'Hareketler', String(id), cln_(d[i][4]) + ' · ' + num_(d[i][5]), p);
      return true;
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Gün veya ay için MAĞAZA kasa özeti.
 *
 * Bu ekran mağazanın gün sonu kontrol aracıdır, şirket kasası değildir:
 *  - Satış: o dönemde TAHSİL EDİLEN tutarlar (nakit esaslı; ödemenin kendi
 *    tarihiyle sayılır, sipariş tarihiyle değil).
 *  - Masraf: yalnızca mağazanın bu ekrandan girdiği masraflar. Muhasebenin
 *    girdiği maaş, kira, mal alımı, kredi ödemesi gibi kalemler buraya
 *    KARIŞMAZ.
 *  - Net nakit: nakit satış − nakit mağaza masrafı, yani gün sonunda kasada
 *    sayılması gereken para.
 *
 * tip: 'gun' → tarih 'YYYY-MM-DD', 'ay' → 'YYYY-MM'.
 */
function kasaOzetGetir(token, tip, deger) {
  guard_(token);
  var ayar = ayarPaketiGetir_();
  var donem = cln_(deger) || (tip === 'ay' ? dstr_(new Date()).substring(0, 7) : dstr_(new Date()));
  var gunMu = tip !== 'ay';

  function donemeAitMi(tarih) {
    if (!tarih) return false;
    return gunMu ? tarih === donem : String(tarih).substring(0, 7) === donem;
  }

  var satis = { nakit: 0, pos: 0, iade: 0, toplam: 0 };
  var personelDagilim = {};

  siparisTumunuOku_().forEach(function (s) {
    if (s.silindi) return;
    s.odemeler.forEach(function (o) {
      if (!donemeAitMi(o.tarih)) return;
      var isaret = o.tip === 'iade' ? -1 : 1;
      var tutar = num_(o.tutar) * isaret;
      if (o.tip === 'iade') satis.iade += num_(o.tutar);
      if (o.yontem === 'kk') satis.pos += tutar;
      else satis.nakit += tutar;
      satis.toplam += tutar;
      var kisi = cln_(s.personel) || 'Belirtilmemiş';
      personelDagilim[kisi] = (personelDagilim[kisi] || 0) + tutar;
    });
  });

  /* Yalnızca mağazanın girdiği masraflar */
  var d = hareketSheet_().getDataRange().getValues();
  var masraflar = [];
  var masrafToplam = 0;
  var masrafNakit = 0;

  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    if (String(d[i][10]).toLowerCase() === 'true') continue;
    if (cln_(d[i][11]) !== KASA_KAYNAK_MASRAF) continue;
    var tarih = dstr_(d[i][1]);
    if (cln_(d[i][2]) !== 'GIDER' || !donemeAitMi(tarih)) continue;
    var tutar = num_(d[i][5]);
    var hesap = cln_(d[i][6]);
    masrafToplam += tutar;
    if (hesap === ayar.nakitHesap) masrafNakit += tutar;
    masraflar.push({
      id: cln_(d[i][0]),
      tarih: tarih,
      ana: cln_(d[i][3]),
      kalem: cln_(d[i][4]),
      tutar: tutar,
      hesap: hesap,
      aciklama: cln_(d[i][7]),
      kaydeden: cln_(d[i][8])
    });
  }

  masraflar.sort(function (a, b) {
    return b.tutar - a.tutar;
  });

  return {
    tip: gunMu ? 'gun' : 'ay',
    donem: donem,
    satis: satis,
    personel: personelDagilim,
    masraflar: masraflar,
    masrafToplam: masrafToplam,
    masrafNakit: masrafNakit,
    netNakit: satis.nakit - masrafNakit,
    nakitHesap: ayar.nakitHesap
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KASA_KAYNAK_MASRAF: KASA_KAYNAK_MASRAF,
    masrafKalemDogrula_: masrafKalemDogrula_,
    magazaMasrafEkle: magazaMasrafEkle,
    magazaMasrafListele: magazaMasrafListele,
    magazaMasrafSil: magazaMasrafSil,
    kasaOzetGetir: kasaOzetGetir
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
