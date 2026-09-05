const { installGasMocks } = require('./gasMocks');
const { loadSrc } = require('./loadSrc');

let yoneticiToken, muhasebeToken, magazaToken;

beforeEach(() => {
  installGasMocks();
  loadSrc();
  ilkKurulum('test-kasa-id', 'yonetici@ornek.com', 'Yönetici', 'dogruSifre1');
  kullaniciEkle_('muhasebe@ornek.com', 'Muhasebe', 'dogruSifre1', 'muhasebe');
  kullaniciEkle_('magaza@ornek.com', 'Mağaza', 'dogruSifre1', 'magaza');
  yoneticiToken = girisYap('yonetici@ornek.com', 'dogruSifre1').token;
  muhasebeToken = girisYap('muhasebe@ornek.com', 'dogruSifre1').token;
  magazaToken = girisYap('magaza@ornek.com', 'dogruSifre1').token;
});

function ornekSiparis(overrides) {
  return Object.assign(
    {
      tarih: '2026-09-01',
      musteri: 'Ayşe Yılmaz',
      temsilci: 'Mağaza',
      urunler: [{ urun: 'Çerçeve X', kategori: 'Optik Çerçeve', fiyat: 1000, adet: 1 }],
      kaporaTutar: 500,
      kaporaYontem: 'nakit',
      bakiyeTutar: 500,
      bakiyeYontem: 'kk',
      bakiyeTarih: '2026-10-05'
    },
    overrides || {}
  );
}

describe('siparisEkle / siparisListele', () => {
  test('a magaza user can create an order', () => {
    const id = siparisEkle(magazaToken, ornekSiparis());
    expect(id).toBeTruthy();
    const list = siparisListele(magazaToken);
    expect(list).toHaveLength(1);
    expect(list[0].musteri).toBe('Ayşe Yılmaz');
    expect(list[0].olusturanEmail).toBe('magaza@ornek.com');
  });

  test('rejects an order without a customer name', () => {
    expect(() => siparisEkle(magazaToken, ornekSiparis({ musteri: '' }))).toThrow();
  });

  test('rejects an order without any products', () => {
    expect(() => siparisEkle(magazaToken, ornekSiparis({ urunler: [] }))).toThrow();
  });

  test('all three roles can list orders', () => {
    siparisEkle(magazaToken, ornekSiparis());
    expect(siparisListele(yoneticiToken)).toHaveLength(1);
    expect(siparisListele(muhasebeToken)).toHaveLength(1);
    expect(siparisListele(magazaToken)).toHaveLength(1);
  });
});

describe('siparisGuncelle / siparisSil yetkilendirme', () => {
  test('the creator (magaza) can edit their own order', () => {
    const id = siparisEkle(magazaToken, ornekSiparis());
    expect(() => siparisGuncelle(magazaToken, id, ornekSiparis({ musteri: 'Güncel İsim' }))).not.toThrow();
    expect(siparisListele(magazaToken)[0].musteri).toBe('Güncel İsim');
  });

  test("a different magaza user cannot edit someone else's order", () => {
    kullaniciEkle_('magaza2@ornek.com', 'Mağaza 2', 'dogruSifre1', 'magaza');
    const magaza2Token = girisYap('magaza2@ornek.com', 'dogruSifre1').token;
    const id = siparisEkle(magazaToken, ornekSiparis());
    expect(() => siparisGuncelle(magaza2Token, id, ornekSiparis({ musteri: 'Başkası' }))).toThrow();
  });

  test('yonetici and muhasebe can edit any order regardless of creator', () => {
    const id = siparisEkle(magazaToken, ornekSiparis());
    expect(() =>
      siparisGuncelle(yoneticiToken, id, ornekSiparis({ musteri: 'Yönetici Düzenledi' }))
    ).not.toThrow();
    expect(() =>
      siparisGuncelle(muhasebeToken, id, ornekSiparis({ musteri: 'Muhasebe Düzenledi' }))
    ).not.toThrow();
  });

  test('siparisSil soft-deletes so it no longer shows up in the list', () => {
    const id = siparisEkle(magazaToken, ornekSiparis());
    expect(siparisSil(magazaToken, id)).toBe(true);
    expect(siparisListele(magazaToken)).toHaveLength(0);
  });

  test("a different magaza user cannot delete someone else's order", () => {
    kullaniciEkle_('magaza2@ornek.com', 'Mağaza 2', 'dogruSifre1', 'magaza');
    const magaza2Token = girisYap('magaza2@ornek.com', 'dogruSifre1').token;
    const id = siparisEkle(magazaToken, ornekSiparis());
    expect(() => siparisSil(magaza2Token, id)).toThrow();
  });
});

describe('siparisOzetiGetir', () => {
  test('is denied for a magaza session', () => {
    expect(() => siparisOzetiGetir(magazaToken)).toThrow();
  });

  test('aggregates payments and category totals for yonetici/muhasebe', () => {
    siparisEkle(magazaToken, ornekSiparis());
    const ozet = siparisOzetiGetir(muhasebeToken);
    expect(ozet.tahsilat).toHaveLength(2);
    expect(ozet.personel['2026-09']['Mağaza']).toBe(500);
    expect(ozet.personel['2026-10']['Mağaza']).toBe(500);
    expect(ozet.kategori['2026-09']['Optik Çerçeve'].tutar).toBe(1000);
    expect(ozet.kategori['2026-09']['Optik Çerçeve'].adet).toBe(1);
  });
});

describe('tumVeriGetir rol filtresi', () => {
  test('magaza gets orders but not financial data', () => {
    siparisEkle(magazaToken, ornekSiparis());
    const veri = tumVeriGetir(magazaToken);
    expect(veri.siparis).toHaveLength(1);
    expect(veri.hareketler).toEqual([]);
    expect(veri.cari).toEqual([]);
    expect(veri.banka).toEqual([]);
    expect(veri.tekrar).toEqual([]);
  });

  test('yonetici and muhasebe get the full data set', () => {
    siparisEkle(magazaToken, ornekSiparis());
    hareketKaydet(yoneticiToken, {
      id: 'h1',
      tarih: '2026-09-01',
      yon: 'GELIR',
      ana: 'Nakit Satış',
      tutar: 100
    });
    const veri = tumVeriGetir(muhasebeToken);
    expect(veri.siparis).toHaveLength(1);
    expect(veri.hareketler).toHaveLength(1);
  });
});
