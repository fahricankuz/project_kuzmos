/*
 * Kuzmos demo verisi — tarayıcıda çalışan, sunucusuz örnek veri katmanı.
 *
 * Gerçek uygulamada bu dosyanın yerini web/js/api.js alır (Supabase RPC).
 * Burada aynı `gcall(fn, args, ok, fail)` imzası taklit edilir; ekran
 * kodlarının tek satırı değişmez. Yazma işlemleri bellekte tutulur, sayfa
 * yenilenince başa döner.
 */

/* ── Örnek işletme ── */
var BUGUN = new Date();
function gun(ofset) {
  var d = new Date(BUGUN.getFullYear(), BUGUN.getMonth(), BUGUN.getDate() + ofset);
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
function ay(ofset) {
  var d = new Date(BUGUN.getFullYear(), BUGUN.getMonth() + ofset, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function noUret(tarih, sira) {
  var p = tarih.split('-');
  return 'KUZ-' + p[1] + '-' + p[0].slice(-2) + '-' + String(sira).padStart(4, '0');
}

var DEMO_ISLETME_ID = 'demo-isletme';
var DEMO_MAGAZA_ID = 'demo-magaza';

var DEMO = {
  isletme: {
    id: DEMO_ISLETME_ID,
    ad: 'Şahin Optik',
    slug: 'sahin-optik',
    eposta: 'info@sahinoptik.com',
    telefon: '0212 555 00 00',
    plan: 'deneme',
    planAd: 'Deneme',
    durum: 'deneme',
    denemeBitis: gun(11),
    abonelikBitis: '',
    kalanGun: 11,
    yazabilir: true,
    maxKullanici: 3,
    maxMagaza: 1,
    kullaniciSayisi: 4,
    magazaSayisi: 1
  },
  magazalar: [{ id: DEMO_MAGAZA_ID, ad: 'Şahin Optik · Merkez', kod: 'KUZ', aktif: true }],
  ayar: {
    hesaplar: ['Nakit Kasa', 'Garanti POS', 'İş Bankası POS'],
    borcHesaplari: [],
    bankalar: ['Akbank', 'QNB', 'Garanti', 'İş Bankası', 'Yapı Kredi', 'Ziraat', 'Halkbank'],
    taksitler: ['Tek çekim', '2 Taksit', '3 Taksit', '4 Taksit', '5 Taksit', '6 Taksit', 'Diğer'],
    kkKomisyon: {
      'Tek çekim': 3.5,
      '2 Taksit': 7,
      '3 Taksit': 9,
      '4 Taksit': 10.69,
      '5 Taksit': 12.49,
      '6 Taksit': 14.49,
      Diğer: 14.49
    },
    personelPrim: 4.5,
    masrafKalemleri: [
      'Mağaza Günlük Kasa Masrafı',
      'Temizlik / Sarf',
      'Bakım / Onarım',
      'Kargo',
      'Yemek',
      'Diğer Masraf'
    ],
    masrafAnaKategori: 'Masraflar',
    nakitHesap: 'Nakit Kasa',
    siparisNoOnEk: 'KUZ',
    waSablon: 'Sayın {ad}, {no} numaralı siparişiniz teslimata hazırdır. {isletme} iyi günler diler.',
    erpAktif: false,
    erpEtiket: "ERP'ye İşlendi",
    logoUrl: '',
    kasaEntegrasyon: true,
    acilisKasa: 12500,
    acilisTarih: ay(-2) + '-01',
    acilisBorc: 0,
    ham: { personel_prim: '4.5', nakit_hesap: 'Nakit Kasa' }
  },
  personel: [
    { ad: 'Elif Şahin', aktif: true, primMuaf: true, notu: '' },
    { ad: 'Burak Demir', aktif: true, primMuaf: false, notu: '' },
    { ad: 'Selin Aydın', aktif: true, primMuaf: false, notu: '' },
    { ad: 'Kerem Yılmaz', aktif: true, primMuaf: false, notu: '' }
  ],
  urunKategorileri: [
    { ad: 'Optik Çerçeve', kdv: 10, ikon: '👓', sira: 1 },
    { ad: 'Optik Cam', kdv: 10, ikon: '⭕', sira: 2 },
    { ad: 'Güneş Gözlüğü', kdv: 20, ikon: '🕶️', sira: 3 },
    { ad: 'Lens', kdv: 10, ikon: '👁️', sira: 4 },
    { ad: 'Solüsyon', kdv: 10, ikon: '💧', sira: 5 },
    { ad: 'Tamir/Aksesuar', kdv: 20, ikon: '🔧', sira: 6 }
  ],
  markalar: {
    'Optik Cam': ['Essilor', 'Hoya', 'Optiswiss', 'Seiko', 'Zeiss'],
    'Optik Çerçeve': ['Emporio Armani', 'Ray-Ban', 'Vogue'],
    'Güneş Gözlüğü': ['Oakley', 'Persol', 'Ray-Ban'],
    Lens: ['Acuvue', 'Alcon', 'Bausch + Lomb'],
    Solüsyon: ['Opti-Free', 'Renu']
  },
  musteriler: [],
  siparis: [],
  hedefler: {},
  masraflar: [],
  hareketler: [],
  cari: [
    { tedarikci: 'Merkez Optik Dağıtım', ay: ay(0), planlanan: 42000, notu: 'ayın 20’si' },
    { tedarikci: 'Cam Tedarik A.Ş.', ay: ay(0), planlanan: 18500, notu: '' }
  ],
  banka: [],
  tekrar: [
    {
      ad: 'Dükkan kirası',
      ana: 'Kira & Aidat',
      alt: 'Kira',
      tutar: 28000,
      gun: 5,
      hesap: 'Nakit Kasa',
      yon: 'GIDER',
      aktif: true
    },
    {
      ad: 'Muhasebe ücreti',
      ana: 'Hizmet Giderleri',
      alt: 'Muhasebe / Mali Müşavir',
      tutar: 4500,
      gun: 10,
      hesap: 'Nakit Kasa',
      yon: 'GIDER',
      aktif: true
    }
  ],
  kasaKategorileri: [
    { ad: 'Nakit Satış', yon: 'GELIR', bolum: 'OP', alt: ['Mağaza Nakit', 'Diğer Nakit'] },
    { ad: 'POS / Kredi Kartı Satışı', yon: 'GELIR', bolum: 'OP', alt: ['Diğer POS'] },
    { ad: 'Satış İadesi', yon: 'GIDER', bolum: 'OP', alt: ['Mağaza Nakit', 'Diğer POS'] },
    { ad: 'Mal Alış', yon: 'GIDER', bolum: 'OP', alt: ['Optik Cam', 'Optik Çerçeve', 'Güneş Gözlüğü'] },
    { ad: 'Kira & Aidat', yon: 'GIDER', bolum: 'OP', alt: ['Kira', 'Aidat'] },
    { ad: 'Personel & SGK', yon: 'GIDER', bolum: 'OP', alt: ['Maaş', 'SGK Primi'] },
    { ad: 'Masraflar', yon: 'GIDER', bolum: 'OP', alt: ['Kargo', 'Temizlik / Sarf', 'Yemek'] },
    { ad: 'Banka & Komisyon', yon: 'GIDER', bolum: 'OP', alt: ['Kredi Kartı Komisyonu'] },
    { ad: 'Vergi', yon: 'GIDER', bolum: 'OP', alt: ['KDV'] },
    { ad: 'Kredi & Kart Ödemeleri', yon: 'GIDER', bolum: 'FD', alt: ['Kredi Kartı Ödemesi'] }
  ]
};

/* ── Örnek siparişler ── */
var DEMO_SIPARISLER = [
  {
    t: gun(0),
    p: 'Elif Şahin',
    ad: 'Ayşe Yılmaz',
    tel: '0532 111 22 33',
    u: [
      {
        marka: 'Ray-Ban',
        kategori: 'Optik Çerçeve',
        urun: 'RB5154',
        adet: 1,
        fiyat: 7200,
        ekartman: '51',
        kopru: '21',
        kol: '145'
      },
      { marka: 'Seiko', kategori: 'Optik Cam', urun: 'Superior A4', adet: 2, fiyat: 3100 }
    ],
    tutar: 12500,
    o: [{ tutar: 6000, tarih: gun(0), yontem: 'nakit' }],
    durum: 'Satış Yapıldı',
    recete: { ur_sph: '-1.25', ur_cyl: '-0.50', ur_axis: '90', ul_sph: '-1.00', pd: '62' }
  },
  {
    t: gun(0),
    p: 'Burak Demir',
    ad: 'Mehmet Kaya',
    tel: '0533 222 33 44',
    u: [{ marka: 'Oakley', kategori: 'Güneş Gözlüğü', urun: 'Holbrook', adet: 1, fiyat: 8900 }],
    tutar: 8900,
    o: [{ tutar: 8900, tarih: gun(0), yontem: 'kk', banka: 'Garanti', taksit: '3 Taksit' }],
    durum: 'Teslim Edildi'
  },
  {
    t: gun(-1),
    p: 'Selin Aydın',
    ad: 'Zeynep Arslan',
    tel: '0534 333 44 55',
    u: [
      { marka: 'Vogue', kategori: 'Optik Çerçeve', urun: 'VO5392', adet: 1, fiyat: 4300 },
      { marka: 'Essilor', kategori: 'Optik Cam', urun: 'Varilux X', adet: 2, fiyat: 5400 }
    ],
    tutar: 14000,
    o: [
      { tutar: 5000, tarih: gun(-1), yontem: 'nakit' },
      { tutar: 9000, tarih: gun(0), yontem: 'kk', banka: 'İş Bankası', taksit: 'Tek çekim' }
    ],
    durum: 'Montaj Yapıldı',
    recete: { ur_sph: '+2.00', ul_sph: '+2.25', ur_add: '2.00', pd: '64' }
  },
  {
    t: gun(-3),
    p: 'Elif Şahin',
    ad: 'Hasan Çelik',
    tel: '0535 444 55 66',
    u: [
      { marka: 'Acuvue', kategori: 'Lens', urun: 'Oasys 6’lı', adet: 2, fiyat: 950 },
      { marka: 'Renu', kategori: 'Solüsyon', urun: '360 ml', adet: 1, fiyat: 310 }
    ],
    tutar: 2100,
    o: [{ tutar: 2100, tarih: gun(-3), yontem: 'nakit' }],
    durum: 'Teslim Edildi'
  },
  {
    t: gun(-6),
    p: 'Kerem Yılmaz',
    ad: 'Fatma Şen',
    tel: '0536 555 66 77',
    u: [
      { marka: 'Emporio Armani', kategori: 'Optik Çerçeve', urun: 'EA1098', adet: 1, fiyat: 6100 },
      { marka: 'Hoya', kategori: 'Optik Cam', urun: 'Nulux', adet: 2, fiyat: 2400 }
    ],
    tutar: 10200,
    o: [{ tutar: 4000, tarih: gun(-6), yontem: 'kk', banka: 'Garanti', taksit: '6 Taksit' }],
    durum: 'Cam Siparişi Verildi'
  },
  {
    t: gun(-9),
    p: 'Burak Demir',
    ad: 'Ali Doğan',
    tel: '0537 666 77 88',
    u: [{ marka: 'Persol', kategori: 'Güneş Gözlüğü', urun: 'PO3019', adet: 1, fiyat: 11400 }],
    tutar: 11400,
    o: [
      { tutar: 11400, tarih: gun(-9), yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim' },
      { tutar: 11400, tarih: gun(-7), yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim', tip: 'iade' }
    ],
    durum: 'Satış Yapıldı'
  },
  {
    t: gun(-14),
    p: 'Selin Aydın',
    ad: 'Emine Kurt',
    tel: '0538 777 88 99',
    u: [
      { marka: 'Ray-Ban', kategori: 'Optik Çerçeve', urun: 'RB6375', adet: 1, fiyat: 5800 },
      { marka: 'Zeiss', kategori: 'Optik Cam', urun: 'SmartLife', adet: 2, fiyat: 4100 }
    ],
    tutar: 13000,
    o: [{ tutar: 13000, tarih: gun(-14), yontem: 'nakit' }],
    durum: 'Teslim Edildi'
  },
  {
    t: gun(-34),
    p: 'Elif Şahin',
    ad: 'Osman Bulut',
    tel: '0539 888 99 00',
    u: [{ marka: 'Optiswiss', kategori: 'Optik Cam', urun: 'Be4ty+', adet: 2, fiyat: 3600 }],
    tutar: 7200,
    o: [{ tutar: 7200, tarih: gun(-34), yontem: 'kk', banka: 'Yapı Kredi', taksit: '2 Taksit' }],
    durum: 'Teslim Edildi'
  }
];

(function demoKur() {
  var sayac = {};
  DEMO_SIPARISLER.forEach(function (x, i) {
    var ayAnahtar = x.t.substring(0, 7);
    sayac[ayAnahtar] = (sayac[ayAnahtar] || 0) + 1;
    var urunler = x.u.map(function (u) {
      return {
        marka: u.marka || '',
        kategori: u.kategori || '',
        urun: u.urun || '',
        adet: u.adet || 1,
        ekartman: u.ekartman || '',
        kopru: u.kopru || '',
        kol: u.kol || '',
        fiyat: u.fiyat || 0
      };
    });
    var ara = urunler.reduce(function (t, u) {
      return t + u.fiyat * u.adet;
    }, 0);
    var odemeler = (x.o || []).map(function (o, j) {
      return {
        id: 'od-' + i + '-' + j,
        tutar: o.tutar,
        tarih: o.tarih,
        yontem: o.yontem || 'nakit',
        banka: o.banka || '',
        taksit: o.taksit || '',
        tip: o.tip || 'tahsilat'
      };
    });
    var tahsil = odemeler.reduce(function (t, o) {
      return t + (o.tip === 'iade' ? -o.tutar : o.tutar);
    }, 0);
    var musteriId = 'm-' + i;
    DEMO.musteriler.push({
      id: musteriId,
      adSoyad: x.ad,
      telefon: x.tel,
      eposta: '',
      tcVergi: '',
      sonRecete: x.recete || {},
      notu: ''
    });
    DEMO.siparis.push({
      id: 's-' + i,
      no: noUret(x.t, sayac[ayAnahtar]),
      magazaId: DEMO_MAGAZA_ID,
      siparisTarihi: x.t,
      teslimTarihi: x.durum === 'Teslim Edildi' ? x.t : '',
      personel: x.p,
      musteriId: musteriId,
      adSoyad: x.ad,
      telefon: x.tel,
      eposta: '',
      tcVergi: '',
      recete: x.recete || {},
      urunler: urunler,
      araToplam: ara,
      tutar: x.tutar,
      tutarElle: x.tutar !== ara,
      odemeler: odemeler,
      tahsilEdilen: tahsil,
      kalan: x.tutar - tahsil,
      durum: x.durum,
      durumTarihi: x.t,
      erp: false,
      olusturanPersonel: x.p,
      silindi: false,
      silinmeTarihi: ''
    });

    /* Tahsilatlar kasaya düşer (gerçekte veritabanı trigger'ı yapar) */
    odemeler.forEach(function (o) {
      var iade = o.tip === 'iade';
      var nakit = o.yontem !== 'kk';
      DEMO.hareketler.push({
        id: 'h-' + o.id,
        tarih: o.tarih,
        yon: iade ? 'GIDER' : 'GELIR',
        ana: iade ? 'Satış İadesi' : nakit ? 'Nakit Satış' : 'POS / Kredi Kartı Satışı',
        alt: nakit ? 'Mağaza Nakit' : o.banka || 'Diğer POS',
        tutar: o.tutar,
        hesap: nakit ? 'Nakit Kasa' : o.banka + ' POS',
        aciklama: 'Sipariş ' + noUret(x.t, sayac[ayAnahtar]) + ' · ' + x.ad + (iade ? ' · İADE' : ''),
        kaydeden: x.p,
        kaynak: 'SIPARIS',
        kaynakId: o.id
      });
    });
  });

  DEMO.hedefler[ay(0)] = { hedef: 320000, notu: 'Ekim kampanyası' };
  DEMO.hedefler[ay(-1)] = { hedef: 280000, notu: '' };

  [
    { kalem: 'Kargo', tutar: 420, t: gun(0), aciklama: 'MNG · cam gönderimi', kaydeden: 'Selin Aydın' },
    { kalem: 'Temizlik / Sarf', tutar: 260, t: gun(0), aciklama: '', kaydeden: 'Burak Demir' },
    { kalem: 'Yemek', tutar: 850, t: gun(-1), aciklama: 'ekip öğle', kaydeden: 'Elif Şahin' }
  ].forEach(function (m, i) {
    DEMO.masraflar.push({
      id: 'ms-' + i,
      tarih: m.t,
      kalem: m.kalem,
      tutar: m.tutar,
      hesap: 'Nakit Kasa',
      aciklama: m.aciklama,
      kaydeden: m.kaydeden
    });
    DEMO.hareketler.push({
      id: 'h-ms-' + i,
      tarih: m.t,
      yon: 'GIDER',
      ana: 'Masraflar',
      alt: m.kalem,
      tutar: m.tutar,
      hesap: 'Nakit Kasa',
      aciklama: m.aciklama,
      kaydeden: m.kaydeden,
      kaynak: 'MAGAZA_MASRAF',
      kaynakId: ''
    });
  });

  [
    { ana: 'Kira & Aidat', alt: 'Kira', tutar: 28000, t: gun(-5) },
    { ana: 'Mal Alış', alt: 'Optik Cam', tutar: 46500, t: gun(-8) },
    { ana: 'Personel & SGK', alt: 'Maaş', tutar: 74000, t: gun(-10) },
    { ana: 'Banka & Komisyon', alt: 'Kredi Kartı Komisyonu', tutar: 3120, t: gun(-12) }
  ].forEach(function (h, i) {
    DEMO.hareketler.push({
      id: 'h-el-' + i,
      tarih: h.t,
      yon: 'GIDER',
      ana: h.ana,
      alt: h.alt,
      tutar: h.tutar,
      hesap: 'Nakit Kasa',
      aciklama: '',
      kaydeden: 'Finans',
      kaynak: 'ELLE',
      kaynakId: ''
    });
  });

  DEMO.banka = [
    { tarih: gun(-2), hesap: 'Nakit Kasa', bakiye: 18400, notu: '' },
    { tarih: gun(-2), hesap: 'Garanti POS', bakiye: 31200, notu: 'blokede' }
  ];
})();
