/*
 * Demo sunucu katmanı: web/js/api.js'in yerine geçer.
 * Aynı `gcall(fn, args, ok, fail)` imzası; veriler bellekte.
 */
var DEMO_ROL = 'yonetici';
var DEMO_ROL_AD = {
  yonetici: 'Mehmet Şahin',
  finans: 'Nurten Ak',
  magaza_muduru: 'Elif Şahin',
  personel: 'Burak Demir'
};
var DEMO_ROL_EPOSTA = {
  yonetici: 'mehmet@sahinoptik.com',
  finans: 'finans@sahinoptik.com',
  magaza_muduru: 'elif@sahinoptik.com',
  personel: 'burak@sahinoptik.com'
};

function demoFinans() {
  return DEMO_ROL === 'yonetici' || DEMO_ROL === 'finans';
}
function demoSubeRolu() {
  return DEMO_ROL === 'magaza_muduru' || DEMO_ROL === 'personel';
}
function demoKasaYonetimi() {
  return DEMO_ROL !== 'personel';
}

function demoKopya(x) {
  return JSON.parse(JSON.stringify(x));
}

function demoAyarPaketi() {
  var a = demoKopya(DEMO.ayar);
  if (!demoFinans()) {
    delete a.acilisKasa;
    delete a.acilisTarih;
    delete a.acilisBorc;
    delete a.borcHesaplari;
    a.ham = {};
  }
  return a;
}

function demoIsletmeOzeti() {
  var i = demoKopya(DEMO.isletme);
  i.kullaniciSayisi = 4;
  i.magazaSayisi = DEMO.magazalar.length;
  return i;
}

function demoTumVeri() {
  var finans = demoFinans();
  return {
    kullanici: {
      email: DEMO_ROL_EPOSTA[DEMO_ROL],
      ad: DEMO_ROL_AD[DEMO_ROL],
      rol: DEMO_ROL,
      magazaId: demoSubeRolu() ? DEMO_MAGAZA_ID : ''
    },
    isletme: demoIsletmeOzeti(),
    magazalar: demoKopya(DEMO.magazalar),
    ayar: demoAyarPaketi(),
    personel: demoKopya(DEMO.personel),
    urunKategorileri: demoKopya(DEMO.urunKategorileri),
    markalar: demoKopya(DEMO.markalar),
    siparis: demoKopya(DEMO.siparis),
    musteriler: demoKopya(DEMO.musteriler),
    hedefler: demoKopya(DEMO.hedefler),
    masraflar: demoKopya(DEMO.masraflar),
    hareketler: finans ? demoKopya(DEMO.hareketler) : [],
    cari: finans ? demoKopya(DEMO.cari) : [],
    banka: finans ? demoKopya(DEMO.banka) : [],
    tekrar: finans ? demoKopya(DEMO.tekrar) : [],
    kasaKategorileri: finans ? demoKopya(DEMO.kasaKategorileri) : []
  };
}

function demoSiparisNo(tarih) {
  var p = String(tarih).split('-');
  var onEk = 'KUZ-' + p[1] + '-' + p[0].slice(-2) + '-';
  var enBuyuk = 0;
  DEMO.siparis.forEach(function (s) {
    if (String(s.no).indexOf(onEk) === 0) {
      var n = parseInt(String(s.no).split('-').pop(), 10);
      if (n > enBuyuk) enBuyuk = n;
    }
  });
  return onEk + String(enBuyuk + 1).padStart(4, '0');
}

function demoKasaOzeti(tip, deger) {
  var gunMu = tip !== 'ay';
  var donem = deger || (gunMu ? bugunStr() : buAyStr());
  function uyar(t) {
    return gunMu ? t === donem : String(t).substring(0, 7) === donem;
  }
  var satis = { nakit: 0, pos: 0, iade: 0, toplam: 0 };
  var personel = {};
  DEMO.siparis.forEach(function (s) {
    if (s.silindi) return;
    (s.odemeler || []).forEach(function (o) {
      if (!uyar(o.tarih)) return;
      var isaret = o.tip === 'iade' ? -1 : 1;
      var t = o.tutar * isaret;
      if (o.tip === 'iade') satis.iade += o.tutar;
      if (o.yontem === 'kk') satis.pos += t;
      else satis.nakit += t;
      satis.toplam += t;
      var k = s.personel || 'Belirtilmemiş';
      personel[k] = (personel[k] || 0) + t;
    });
  });
  var masraflar = DEMO.masraflar.filter(function (m) {
    return uyar(m.tarih);
  });
  var toplam = masraflar.reduce(function (t, m) {
    return t + m.tutar;
  }, 0);
  var nakitMasraf = masraflar.reduce(function (t, m) {
    return t + (m.hesap === DEMO.ayar.nakitHesap ? m.tutar : 0);
  }, 0);
  return {
    tip: gunMu ? 'gun' : 'ay',
    donem: donem,
    satis: satis,
    personel: personel,
    masraflar: masraflar.slice().sort(function (a, b) {
      return b.tutar - a.tutar;
    }),
    masrafToplam: toplam,
    masrafNakit: nakitMasraf,
    netNakit: satis.nakit - nakitMasraf,
    nakitHesap: DEMO.ayar.nakitHesap
  };
}

/** Siparişi kaydeder/günceller ve kasaya yansıtır. */
function demoSiparisKaydet(siparis, personel) {
  if (!DEMO.isletme.yazabilir) throw new Error('Aboneliğiniz yazma işlemine kapalı.');
  if (!String(siparis.adSoyad || '').trim()) throw new Error('Müşteri adı zorunludur.');
  if (demoSubeRolu() && !String(personel || '').trim()) {
    throw new Error('İşlemi yapan satış personelini seçin.');
  }
  var urunler = (siparis.urunler || []).map(function (u) {
    return {
      marka: u.marka || '',
      kategori: u.kategori || '',
      urun: u.urun || '',
      adet: parseInt(u.adet, 10) || 1,
      ekartman: u.ekartman || '',
      kopru: u.kopru || '',
      kol: u.kol || '',
      fiyat: pTR(u.fiyat)
    };
  });
  var ara = urunler.reduce(function (t, u) {
    return t + u.fiyat * u.adet;
  }, 0);
  var tutar = pTR(siparis.tutar) > 0 ? pTR(siparis.tutar) : ara;
  var odemeler = (siparis.odemeler || [])
    .filter(function (o) {
      return pTR(o.tutar) > 0 && o.tarih;
    })
    .map(function (o, i) {
      return {
        id: o.id || 'od-y-' + Date.now() + '-' + i,
        tutar: pTR(o.tutar),
        tarih: o.tarih,
        yontem: o.yontem === 'kk' ? 'kk' : 'nakit',
        banka: o.banka || '',
        taksit: o.taksit || '',
        tip: o.tip === 'iade' ? 'iade' : 'tahsilat'
      };
    });
  var tahsil = odemeler.reduce(function (t, o) {
    return t + (o.tip === 'iade' ? -o.tutar : o.tutar);
  }, 0);

  var mevcut = null;
  DEMO.siparis.forEach(function (s) {
    if (s.id === siparis.id) mevcut = s;
  });
  var tarih = siparis.siparisTarihi || bugunStr();
  var teslim = mevcut ? mevcut.teslimTarihi : '';
  if (siparis.durum === 'Teslim Edildi') teslim = bugunStr();
  else if (tutar > 0 && tahsil >= tutar - 0.005 && odemeler.length) {
    teslim = odemeler[odemeler.length - 1].tarih;
  }

  var musteriId = siparis.musteriId || '';
  var eslesen = null;
  DEMO.musteriler.forEach(function (m) {
    var a = String(m.telefon || '')
      .replace(/\D/g, '')
      .slice(-10);
    var b = String(siparis.telefon || '')
      .replace(/\D/g, '')
      .slice(-10);
    if ((musteriId && m.id === musteriId) || (a && a === b)) eslesen = m;
  });
  if (eslesen) {
    eslesen.adSoyad = siparis.adSoyad;
    eslesen.telefon = siparis.telefon || eslesen.telefon;
    if (siparis.recete && Object.keys(siparis.recete).length) eslesen.sonRecete = siparis.recete;
    musteriId = eslesen.id;
  } else {
    musteriId = 'm-y-' + Date.now();
    DEMO.musteriler.push({
      id: musteriId,
      adSoyad: siparis.adSoyad,
      telefon: siparis.telefon || '',
      eposta: siparis.eposta || '',
      tcVergi: siparis.tcVergi || '',
      sonRecete: siparis.recete || {},
      notu: ''
    });
  }

  var kayit = {
    id: mevcut ? mevcut.id : 's-y-' + Date.now(),
    no: mevcut ? mevcut.no : demoSiparisNo(tarih),
    magazaId: DEMO_MAGAZA_ID,
    siparisTarihi: tarih,
    teslimTarihi: teslim || '',
    personel: siparis.personel || personel || '',
    musteriId: musteriId,
    adSoyad: siparis.adSoyad,
    telefon: siparis.telefon || '',
    eposta: siparis.eposta || '',
    tcVergi: siparis.tcVergi || '',
    recete: siparis.recete || {},
    urunler: urunler,
    araToplam: ara,
    tutar: tutar,
    tutarElle: Math.abs(tutar - ara) > 0.005,
    odemeler: odemeler,
    tahsilEdilen: tahsil,
    kalan: tutar - tahsil,
    durum: siparis.durum || 'Satış Yapıldı',
    durumTarihi: bugunStr(),
    erp: !!siparis.erp,
    olusturanPersonel: personel || siparis.personel || '',
    silindi: false,
    silinmeTarihi: ''
  };

  if (mevcut) DEMO.siparis[DEMO.siparis.indexOf(mevcut)] = kayit;
  else DEMO.siparis.push(kayit);

  /* Satış personeli listede yoksa eklenir (sunucu da böyle yapar) */
  var ad = String(personel || '').trim();
  if (
    ad &&
    !DEMO.personel.some(function (p) {
      return p.ad === ad;
    })
  ) {
    DEMO.personel.push({ ad: ad, aktif: true, primMuaf: false, notu: '' });
  }

  demoKasaSenkron(kayit);
  return { id: kayit.id, no: kayit.no, kayit: demoKopya(kayit) };
}

/** Sipariş ödemelerini kasa hareketleriyle eşitler. */
function demoKasaSenkron(s) {
  DEMO.hareketler = DEMO.hareketler.filter(function (h) {
    return !(h.kaynak === 'SIPARIS' && String(h.kaynakId).indexOf('od-') === 0 && h.siparisId === s.id);
  });
  DEMO.hareketler = DEMO.hareketler.filter(function (h) {
    return h.siparisId !== s.id;
  });
  if (s.silindi) return;
  (s.odemeler || []).forEach(function (o) {
    var iade = o.tip === 'iade';
    var nakit = o.yontem !== 'kk';
    DEMO.hareketler.push({
      id: 'h-' + o.id,
      siparisId: s.id,
      tarih: o.tarih,
      yon: iade ? 'GIDER' : 'GELIR',
      ana: iade ? 'Satış İadesi' : nakit ? 'Nakit Satış' : 'POS / Kredi Kartı Satışı',
      alt: nakit ? 'Mağaza Nakit' : o.banka || 'Diğer POS',
      tutar: o.tutar,
      hesap: nakit ? 'Nakit Kasa' : (o.banka || '') + ' POS',
      aciklama: 'Sipariş ' + s.no + ' · ' + s.adSoyad + (iade ? ' · İADE' : ''),
      kaydeden: s.olusturanPersonel || s.personel,
      kaynak: 'SIPARIS',
      kaynakId: o.id
    });
  });
}

function demoSiparisBul(id) {
  var b = null;
  DEMO.siparis.forEach(function (s) {
    if (s.id === id) b = s;
  });
  if (!b) throw new Error('Sipariş bulunamadı.');
  return b;
}

/* ── Çağrı tablosu ── */
var DEMO_API = {
  girisYap: function (email) {
    return { ok: true, token: 'demo', email: email || DEMO_ROL_EPOSTA[DEMO_ROL] };
  },
  mevcutKullaniciGetir: function () {
    return demoTumVeri().kullanici;
  },
  cikis: function () {
    return true;
  },
  kayitOl: function () {
    throw new Error('Demoda kayıt kapalı. Gerçek sürümde burada işletmeniz kurulur.');
  },
  isletmeOlustur: function () {
    throw new Error('Demoda kapalı.');
  },
  tumVeriGetir: demoTumVeri,
  hareketleriGetir: function () {
    return demoFinans() ? demoKopya(DEMO.hareketler) : [];
  },
  kasaOzetGetir: function (token, tip, deger) {
    if (!demoKasaYonetimi()) throw new Error('Kasa özetini görme yetkiniz yok.');
    return demoKasaOzeti(tip, deger);
  },
  abonelikOzeti: demoIsletmeOzeti,
  logListele: function () {
    return DEMO.siparis.slice(-20).map(function (s) {
      return {
        zaman: s.siparisTarihi + ' 10:00',
        kullanici: DEMO_ROL_EPOSTA[DEMO_ROL],
        personel: s.personel,
        islem: 'SIPARIS_EKLE',
        kayitTipi: 'siparisler',
        kayitId: s.id,
        detay: {}
      };
    });
  },

  siparisKaydet: function (token, siparis, personel) {
    return demoSiparisKaydet(siparis, personel);
  },
  siparisOdemeEkle: function (token, id, odeme, personel) {
    var s = demoSiparisBul(id);
    s.odemeler.push({
      id: 'od-y-' + Date.now(),
      tutar: pTR(odeme.tutar),
      tarih: odeme.tarih || bugunStr(),
      yontem: odeme.yontem === 'kk' ? 'kk' : 'nakit',
      banka: odeme.banka || '',
      taksit: odeme.taksit || '',
      tip: odeme.tip === 'iade' ? 'iade' : 'tahsilat'
    });
    s.tahsilEdilen = s.odemeler.reduce(function (t, o) {
      return t + (o.tip === 'iade' ? -o.tutar : o.tutar);
    }, 0);
    s.kalan = s.tutar - s.tahsilEdilen;
    if (s.tutar > 0 && s.kalan <= 0.005) s.teslimTarihi = s.odemeler[s.odemeler.length - 1].tarih;
    demoKasaSenkron(s);
    return { id: s.id, no: s.no, kayit: demoKopya(s) };
  },
  siparisDurumGuncelle: function (token, id, durum) {
    var s = demoSiparisBul(id);
    s.durum = durum;
    s.durumTarihi = bugunStr();
    if (durum === 'Teslim Edildi') s.teslimTarihi = bugunStr();
    return { id: id, durum: durum, durumTarihi: s.durumTarihi, teslimTarihi: s.teslimTarihi };
  },
  siparisSil: function (token, id) {
    var s = demoSiparisBul(id);
    s.silindi = true;
    s.silinmeTarihi = bugunStr();
    demoKasaSenkron(s);
    return true;
  },
  siparisGeriAl: function (token, id) {
    var s = demoSiparisBul(id);
    s.silindi = false;
    s.silinmeTarihi = '';
    demoKasaSenkron(s);
    return true;
  },
  siparisKaliciSil: function (token, id) {
    if (!demoFinans()) throw new Error('Bu işlem için yetkiniz yok.');
    DEMO.siparis = DEMO.siparis.filter(function (s) {
      return s.id !== id;
    });
    DEMO.hareketler = DEMO.hareketler.filter(function (h) {
      return h.siparisId !== id;
    });
    return true;
  },
  copTemizle: function () {
    return 0;
  },
  musteriGuncelle: function (token, m) {
    DEMO.musteriler.forEach(function (x) {
      if (x.id === m.id) Object.assign(x, m);
    });
    return true;
  },

  magazaMasrafEkle: function (token, masraf, personel) {
    if (!DEMO.isletme.yazabilir) throw new Error('Aboneliğiniz yazma işlemine kapalı.');
    if (pTR(masraf.tutar) <= 0) throw new Error('Tutar sıfırdan büyük olmalı.');
    var k = {
      id: 'ms-y-' + Date.now(),
      tarih: masraf.tarih || bugunStr(),
      kalem: masraf.kalem,
      tutar: pTR(masraf.tutar),
      hesap: masraf.hesap || DEMO.ayar.nakitHesap,
      aciklama: masraf.aciklama || '',
      kaydeden: personel || DEMO_ROL_AD[DEMO_ROL]
    };
    DEMO.masraflar.unshift(k);
    DEMO.hareketler.push({
      id: 'h-' + k.id,
      tarih: k.tarih,
      yon: 'GIDER',
      ana: 'Masraflar',
      alt: k.kalem,
      tutar: k.tutar,
      hesap: k.hesap,
      aciklama: k.aciklama,
      kaydeden: k.kaydeden,
      kaynak: 'MAGAZA_MASRAF',
      kaynakId: ''
    });
    return k;
  },
  magazaMasrafSil: function (token, id) {
    DEMO.masraflar = DEMO.masraflar.filter(function (m) {
      return m.id !== id;
    });
    DEMO.hareketler = DEMO.hareketler.filter(function (h) {
      return h.id !== 'h-' + id;
    });
    return true;
  },

  hareketKaydet: function (token, h) {
    if (!demoFinans()) throw new Error('Bu işlem için yetkiniz yok.');
    if (pTR(h.tutar) <= 0) throw new Error('Tutar sıfırdan büyük olmalı.');
    var k = {
      id: 'h-y-' + Date.now(),
      tarih: h.tarih,
      yon: h.yon,
      ana: h.ana,
      alt: h.alt || '',
      tutar: pTR(h.tutar),
      hesap: h.hesap,
      aciklama: h.aciklama || '',
      kaydeden: DEMO_ROL_AD[DEMO_ROL],
      kaynak: 'ELLE',
      kaynakId: ''
    };
    DEMO.hareketler.push(k);
    return k;
  },
  hareketSil: function (token, id) {
    DEMO.hareketler = DEMO.hareketler.filter(function (h) {
      return h.id !== id || h.kaynak === 'SIPARIS';
    });
    return true;
  },
  hedefKaydet: function (token, ayDeger, hedef, notu) {
    DEMO.hedefler[ayDeger] = { hedef: pTR(hedef), notu: notu || '' };
    return true;
  },
  cariKaydet: function (token, tedarikci, ayDeger, planlanan, notu) {
    var v = false;
    DEMO.cari.forEach(function (c) {
      if (c.tedarikci === tedarikci && c.ay === ayDeger) {
        c.planlanan = pTR(planlanan);
        c.notu = notu || '';
        v = true;
      }
    });
    if (!v)
      DEMO.cari.push({ tedarikci: tedarikci, ay: ayDeger, planlanan: pTR(planlanan), notu: notu || '' });
    return true;
  },
  bankaKaydet: function (token, tarih, satirlar) {
    (satirlar || []).forEach(function (x) {
      var v = false;
      DEMO.banka.forEach(function (b) {
        if (b.tarih === tarih && b.hesap === x.hesap) {
          b.bakiye = pTR(x.bakiye);
          v = true;
        }
      });
      if (!v) DEMO.banka.push({ tarih: tarih, hesap: x.hesap, bakiye: pTR(x.bakiye), notu: x.notu || '' });
    });
    return true;
  },
  tekrarKaydet: function (token, liste) {
    DEMO.tekrar = (liste || []).slice();
    return true;
  },
  personelKaydet: function (token, liste) {
    DEMO.personel = (liste || []).slice();
    return true;
  },
  markaEkle: function (token, kategori, marka) {
    DEMO.markalar[kategori] = DEMO.markalar[kategori] || [];
    if (DEMO.markalar[kategori].indexOf(marka) > -1) throw new Error('Bu marka zaten kayıtlı.');
    DEMO.markalar[kategori].push(marka);
    DEMO.markalar[kategori].sort();
    return true;
  },
  markaSil: function (token, kategori, marka) {
    DEMO.markalar[kategori] = (DEMO.markalar[kategori] || []).filter(function (m) {
      return m !== marka;
    });
    return true;
  },
  ayarGuncelle: function (token, anahtar, deger) {
    var esle = { wa_sablon: 'waSablon', erp_etiket: 'erpEtiket', personel_prim: 'personelPrim' };
    if (anahtar === 'erp_aktif') DEMO.ayar.erpAktif = deger === 'evet';
    else if (esle[anahtar]) DEMO.ayar[esle[anahtar]] = anahtar === 'personel_prim' ? pTR(deger) : deger;
    DEMO.ayar.ham[anahtar] = String(deger);
    return true;
  },
  isletmeGuncelle: function (token, bilgi) {
    DEMO.isletme.ad = bilgi.ad || DEMO.isletme.ad;
    DEMO.isletme.telefon = bilgi.telefon || DEMO.isletme.telefon;
    DEMO.isletme.eposta = bilgi.eposta || DEMO.isletme.eposta;
    return demoIsletmeOzeti();
  },
  magazaEkle: function () {
    throw new Error('Deneme planı en fazla 1 şubeye izin veriyor. Planı yükseltin.');
  },
  isletmeVerisiAktar: function () {
    return { isletme: DEMO.isletme, siparisler: DEMO.siparis, musteriler: DEMO.musteriler };
  },
  logoYukle: function (token, dosya) {
    return new Promise(function (coz, red) {
      var r = new FileReader();
      r.onload = function () {
        DEMO.ayar.logoUrl = r.result;
        coz(demoAyarPaketi());
      };
      r.onerror = function () {
        red(new Error('Dosya okunamadı.'));
      };
      r.readAsDataURL(dosya);
    });
  },
  logoKaldir: function () {
    DEMO.ayar.logoUrl = '';
    return demoAyarPaketi();
  },

  kullaniciListele: function () {
    return [
      {
        email: 'mehmet@sahinoptik.com',
        ad: 'Mehmet Şahin',
        rol: 'yonetici',
        aktif: true,
        kurucu: true,
        magaza: ''
      },
      {
        email: 'finans@sahinoptik.com',
        ad: 'Nurten Ak',
        rol: 'finans',
        aktif: true,
        kurucu: false,
        magaza: ''
      },
      {
        email: 'elif@sahinoptik.com',
        ad: 'Elif Şahin',
        rol: 'magaza_muduru',
        aktif: true,
        kurucu: false,
        magaza: 'Şahin Optik · Merkez'
      },
      {
        email: 'burak@sahinoptik.com',
        ad: 'Burak Demir',
        rol: 'personel',
        aktif: true,
        kurucu: false,
        magaza: 'Şahin Optik · Merkez'
      }
    ];
  },
  kullaniciEkleApi: function () {
    throw new Error('Deneme planı en fazla 3 kullanıcıya izin veriyor. Planı yükseltin.');
  },
  kullaniciDurumDegistir: function () {
    throw new Error('Demoda kullanıcı durumu değiştirilemez.');
  },
  kullaniciSifreDegistir: function () {
    return true;
  },
  kullaniciSifreSifirlamaGonder: function () {
    return true;
  }
};

function gcall(fn, args, ok, fail) {
  var f = DEMO_API[fn];
  if (!f) {
    if (fail) fail(new Error('Demoda bu işlem yok: ' + fn));
    return;
  }
  /* Gerçek ağ gecikmesini taklit et (çok kısa) */
  setTimeout(function () {
    var sonuc;
    try {
      sonuc = f.apply(null, args || []);
    } catch (e) {
      if (fail) fail(e);
      return;
    }
    Promise.resolve(sonuc).then(
      function (x) {
        if (ok) ok(x);
      },
      function (e) {
        if (fail) fail(e);
      }
    );
  }, 60);
}

/* ── Demo kabuğu: rol değiştirici ── */
function demoRolDegistir(r) {
  DEMO_ROL = r;
  KULLANICI = demoTumVeri().kullanici;
  verileriYukle(true);
  demoKabukCiz();
}

function demoAboneligiBitir() {
  DEMO.isletme.yazabilir = !DEMO.isletme.yazabilir;
  DEMO.isletme.durum = DEMO.isletme.yazabilir ? 'deneme' : 'askida';
  DEMO.isletme.kalanGun = DEMO.isletme.yazabilir ? 11 : 0;
  verileriYukle(false);
  demoKabukCiz();
}

function demoKabukCiz() {
  var el = document.getElementById('demoKabuk');
  if (!el) return;
  var roller = [
    ['yonetici', 'Yönetici'],
    ['finans', 'Finans'],
    ['magaza_muduru', 'Mağaza Müdürü'],
    ['personel', 'Personel']
  ];
  el.innerHTML =
    '<span class="demo-etiket">DEMO · rolü değiştir</span>' +
    roller
      .map(function (r) {
        return (
          '<button class="demo-chip' +
          (DEMO_ROL === r[0] ? ' on' : '') +
          '" onclick="demoRolDegistir(\'' +
          r[0] +
          '\')">' +
          r[1] +
          '</button>'
        );
      })
      .join('') +
    '<button class="demo-chip' +
    (DEMO.isletme.yazabilir ? '' : ' on') +
    '" onclick="demoAboneligiBitir()">' +
    (DEMO.isletme.yazabilir ? 'Aboneliği bitir' : 'Aboneliği aç') +
    '</button>';
}

/* Demo ortamında dosya indirme, diyalog ve yazdırma devre dışı */
function verileriIndir() {
  toast('Gerçek sürümde tüm veriniz JSON dosyası olarak iner (KVKK veri taşınabilirliği)', true);
}

/* Bu önizlemede dosya indirme yok; gerçek sürümde CSV iner. */
function csvIndir(satirlar, dosyaAdi) {
  toast(dosyaAdi + ' · ' + (satirlar.length - 1) + ' satır — indirme gerçek sürümde çalışır', true);
}

window.confirm = function () {
  return true;
};
window.print = function () {
  toast('Yazdırma gerçek sürümde çalışır: A4 tek sayfa sipariş föyü', true);
};

/* core.js kendi DOMContentLoaded'ında oturumu açıp veriyi yükler;
   burada yalnızca demo kabuğunu çizip panele geçiyoruz. */
document.addEventListener('DOMContentLoaded', function () {
  demoKabukCiz();
  setTimeout(function () {
    goster('viewPanel', true);
  }, 400);
});
