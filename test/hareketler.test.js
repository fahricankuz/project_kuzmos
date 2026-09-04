const { installGasMocks } = require('./gasMocks');
const { loadSrc } = require('./loadSrc');

let token;

beforeEach(() => {
  installGasMocks();
  loadSrc();
  ilkKurulum('test-kasa-id', '', 'admin@ornek.com', 'Yönetici', 'dogruSifre1');
  token = girisYap('admin@ornek.com', 'dogruSifre1').token;
});

describe('hareketDogrula_', () => {
  test('throws when tutar is not greater than zero', () => {
    expect(() => hareketDogrula_({ tarih: '2026-09-01', yon: 'GIDER', tutar: 0, ana: 'Kira' })).toThrow();
  });
  test('throws for an invalid yon', () => {
    expect(() => hareketDogrula_({ tarih: '2026-09-01', yon: 'BOSVER', tutar: 10, ana: 'Kira' })).toThrow();
  });
  test('throws when ana kategori is missing', () => {
    expect(() => hareketDogrula_({ tarih: '2026-09-01', yon: 'GIDER', tutar: 10, ana: '' })).toThrow();
  });
  test('passes for a valid hareket', () => {
    expect(() =>
      hareketDogrula_({ tarih: '2026-09-01', yon: 'GIDER', tutar: 10, ana: 'Kira & Aidat' })
    ).not.toThrow();
  });
});

describe('hareketKaydet / hareketleriGetir', () => {
  test('records the logged-in user as kaydeden, ignoring client input', () => {
    hareketKaydet(token, {
      id: 'h1',
      tarih: '2026-09-01',
      yon: 'GIDER',
      ana: 'Kira & Aidat',
      alt: 'Mağaza / Kira',
      tutar: 15000,
      hesap: 'Nakit Kasa',
      aciklama: 'Eylül kirası',
      kaydeden: 'Sahte İsim'
    });
    const list = hareketleriGetir(token);
    expect(list).toHaveLength(1);
    expect(list[0].kaydeden).toBe('Yönetici');
    expect(list[0].tutar).toBe(15000);
  });

  test('rejects an invalid hareket before writing', () => {
    expect(() =>
      hareketKaydet(token, { id: 'h2', tarih: '2026-09-01', yon: 'GIDER', ana: 'Kira & Aidat', tutar: -5 })
    ).toThrow();
    expect(hareketleriGetir(token)).toHaveLength(0);
  });

  test('hareketSil soft-deletes so it no longer shows up', () => {
    hareketKaydet(token, {
      id: 'h3',
      tarih: '2026-09-01',
      yon: 'GELIR',
      ana: 'Nakit Satış',
      alt: 'Merkez Kasa',
      tutar: 500,
      hesap: 'Nakit Kasa'
    });
    expect(hareketSil(token, 'h3')).toBe(true);
    expect(hareketleriGetir(token)).toHaveLength(0);
  });

  test('preserves the original kaydeden on edit instead of overwriting it', () => {
    hareketKaydet(token, {
      id: 'h4',
      tarih: '2026-09-01',
      yon: 'GIDER',
      ana: 'Kira & Aidat',
      tutar: 100
    });
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'personel');
    const token2 = girisYap('kisi@ornek.com', 'dogruSifre1').token;
    hareketKaydet(token2, {
      id: 'h4',
      tarih: '2026-09-01',
      yon: 'GIDER',
      ana: 'Kira & Aidat',
      tutar: 200
    });
    const list = hareketleriGetir(token);
    expect(list[0].kaydeden).toBe('Yönetici');
    expect(list[0].tutar).toBe(200);
  });
});
