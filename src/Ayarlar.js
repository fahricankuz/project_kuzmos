/**
 * Kuzmos — Anahtar/değer ayarları (açılış kasası, hesap listesi, oranlar...).
 *
 * Oranlar (KDV, KK komisyonu, personel primi), banka/taksit listeleri ve
 * mağaza masraf kalemleri koda gömülmez; buradan okunur. Böylece oran
 * değişince kod dağıtmaya gerek kalmaz.
 */

function ayarSheet_() {
  return sheet_(SHEET_NAMES.AYAR, ['Anahtar', 'Değer', 'Açıklama']);
}

/**
 * Ayarlar tek bir kayıt sırasında birçok kez okunur (sipariş no, kasa
 * senkronu, hesap doğrulama...). Çağrı ömürlü önbellek bunu tek okumaya
 * indirir; her yazma önbelleği boşaltır.
 */
var AYAR_ONBELLEK_ = { veri: null };

function ayarOnbellekBosalt_() {
  AYAR_ONBELLEK_.veri = null;
}

function ayarOku_() {
  if (AYAR_ONBELLEK_.veri) return AYAR_ONBELLEK_.veri;
  var d = ayarSheet_().getDataRange().getDisplayValues();
  var o = {};
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0])) o[cln_(d[i][0])] = cln_(d[i][1]);
  }
  AYAR_ONBELLEK_.veri = o;
  return o;
}

function ayarYaz_(k, v, aciklama) {
  var s = ayarSheet_();
  var d = s.getDataRange().getDisplayValues();
  for (var i = 1; i < d.length; i++) {
    if (cln_(d[i][0]) === k) {
      s.getRange(i + 1, 2).setValue(v);
      ayarOnbellekBosalt_();
      return;
    }
  }
  s.appendRow([k, v, aciklama || '']);
  ayarOnbellekBosalt_();
}

/** Ayar yoksa oluşturur; varsa dokunmaz (kurulum/güncelleme için). */
function ayarVarsayilan_(k, v, aciklama) {
  if (Object.prototype.hasOwnProperty.call(ayarOku_(), cln_(k))) return false;
  ayarSheet_().appendRow([k, v, aciklama || '']);
  ayarOnbellekBosalt_();
  return true;
}

/* ── tip dönüşümleri ── */

/** "a, b, c" → ['a','b','c'] */
function listeAyristir_(deger) {
  return String(deger || '')
    .split(',')
    .map(function (s) {
      return cln_(s);
    })
    .filter(Boolean);
}

/** "Tek çekim:3.5, 2 Taksit:7" → { 'Tek çekim': 3.5, '2 Taksit': 7 } */
function oranAyristir_(deger) {
  var out = {};
  listeAyristir_(deger).forEach(function (parca) {
    var i = parca.lastIndexOf(':');
    if (i === -1) return;
    var ad = cln_(parca.substring(0, i));
    var oran = num_(parca.substring(i + 1));
    if (ad) out[ad] = oran;
  });
  return out;
}

function ayarListe_(ayar, k, varsayilan) {
  var v = ayar && ayar[k];
  var liste = listeAyristir_(v);
  return liste.length ? liste : varsayilan || [];
}

function ayarSayi_(ayar, k, varsayilan) {
  var v = ayar && ayar[k];
  if (v === undefined || v === null || cln_(v) === '') return varsayilan;
  return num_(v);
}

function ayarEvetMi_(ayar, k, varsayilan) {
  var v = cln_(ayar && ayar[k]).toLowerCase();
  if (!v) return !!varsayilan;
  return v === 'evet' || v === 'true' || v === 'aktif' || v === '1';
}

/**
 * Frontend'in ihtiyaç duyduğu yapılandırılmış ayar paketi.
 * Ham anahtar/değerler de `ham` altında döner.
 */
function ayarPaketiGetir_() {
  var a = ayarOku_();
  return {
    ham: a,
    hesaplar: ayarListe_(a, 'hesaplar', ['Nakit Kasa']),
    borcHesaplari: ayarListe_(a, 'borc_hesaplari', []),
    acilisKasa: ayarSayi_(a, 'acilis_kasa', 0),
    acilisTarih: cln_(a.acilis_tarih),
    acilisBorc: ayarSayi_(a, 'acilis_borc', 0),
    bankalar: ayarListe_(a, 'bankalar', []),
    taksitler: ayarListe_(a, 'taksitler', []),
    kkKomisyon: oranAyristir_(a.kk_komisyon),
    personelPrim: ayarSayi_(a, 'personel_prim', 0),
    masrafKalemleri: ayarListe_(a, 'magaza_masraf_kalemleri', []),
    masrafAnaKategori: cln_(a.magaza_masraf_ana_kategori) || 'Masraflar',
    nakitHesap: cln_(a.nakit_hesap) || 'Nakit Kasa',
    siparisNoOnEk: cln_(a.siparis_no_onek) || 'DK',
    kasaEntegrasyon: ayarEvetMi_(a, 'siparis_kasa_entegrasyon', true)
  };
}

function ayarGuncelle(token, k, v) {
  guardYonetici_(token);
  ayarYaz_(cln_(k), v);
  logYaz_(token, 'AYAR_GUNCELLE', 'Ayarlar', cln_(k), String(v));
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ayarSheet_: ayarSheet_,
    ayarOnbellekBosalt_: ayarOnbellekBosalt_,
    ayarOku_: ayarOku_,
    ayarYaz_: ayarYaz_,
    ayarVarsayilan_: ayarVarsayilan_,
    listeAyristir_: listeAyristir_,
    oranAyristir_: oranAyristir_,
    ayarListe_: ayarListe_,
    ayarSayi_: ayarSayi_,
    ayarEvetMi_: ayarEvetMi_,
    ayarPaketiGetir_: ayarPaketiGetir_,
    ayarGuncelle: ayarGuncelle
  };
  Object.keys(module.exports).forEach(function (k) {
    global[k] = module.exports[k];
  });
}
