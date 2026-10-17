/**
 * Apps Script'te hız doğrudan Sheets çağrısı sayısına bağlıdır: her
 * getDataRange/appendRow/openById ayrı bir ağ turudur (~100-300 ms).
 *
 * Bu testler mantığı değil ÇAĞRI SAYISINI sabitler; bir sayfanın aynı
 * işlemde ikinci kez okunması gibi hız gerilemelerini yakalar.
 */
const { installGasMocks } = require('./gasMocks');
const { loadSrc } = require('./loadSrc');

let mock, magazaToken, muhasebeToken;

function sayaciSifirla() {
  mock.sayac.okuma = 0;
  mock.sayac.yazma = 0;
  mock.sayac.acma = 0;
}

function toplamCagri() {
  return mock.sayac.okuma + mock.sayac.yazma + mock.sayac.acma;
}

beforeEach(() => {
  mock = installGasMocks();
  loadSrc();
  ilkKurulum('test-kasa-id', 'yonetici@ornek.com', 'Yönetici', 'dogruSifre1');
  kullaniciEkle_('muhasebe@ornek.com', 'Muhasebe', 'dogruSifre1', 'muhasebe');
  kullaniciEkle_('magaza@ornek.com', 'Mağaza', 'dogruSifre1', 'magaza');
  magazaToken = girisYap('magaza@ornek.com', 'dogruSifre1').token;
  muhasebeToken = girisYap('muhasebe@ornek.com', 'dogruSifre1').token;
});

function siparisVerisi() {
  return {
    siparisTarihi: '2026-09-01',
    personel: 'Sema İpek',
    adSoyad: 'Ayşe Yılmaz',
    telefon: '0532 111 22 33',
    urunler: [
      { marka: 'Ray-Ban', kategori: 'Güneş Gözlüğü', urun: 'RB3025', adet: 1, fiyat: 6000 },
      { marka: 'Seiko', kategori: 'Optik Cam', urun: 'Superior', adet: 2, fiyat: 2000 },
      { marka: 'Listede Yok', kategori: 'Optik Cam', urun: 'X', adet: 1, fiyat: 100 }
    ],
    recete: {},
    odemeler: [
      { tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' },
      { tutar: 6000, tarih: '2026-09-02', yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim' }
    ]
  };
}

describe('Sheets çağrı sayısı', () => {
  test('3 ürün + 2 ödemeli sipariş kaydı 20 çağrıyı aşmaz', () => {
    sayaciSifirla();
    siparisKaydet(magazaToken, siparisVerisi(), 'Sema İpek');
    expect(toplamCagri()).toBeLessThanOrEqual(20);
    /* Siparisler sayfası tek kez okunmalı; Ayarlar da tek kez. */
    expect(mock.sayac.okuma).toBeLessThanOrEqual(9);
    /* Spreadsheet çağrı başına en fazla bir kez açılır. */
    expect(mock.sayac.acma).toBeLessThanOrEqual(1);
  });

  test('ürün satırı artınca Markalar sayfası tekrar okunmaz', () => {
    const tekUrun = siparisVerisi();
    tekUrun.urunler = [tekUrun.urunler[0]];
    sayaciSifirla();
    siparisKaydet(magazaToken, tekUrun, 'Sema İpek');
    const tek = mock.sayac.okuma;

    const cokUrun = siparisVerisi();
    cokUrun.urunler = cokUrun.urunler.concat([
      { marka: 'Essilor', kategori: 'Optik Cam', urun: 'A', adet: 1, fiyat: 500 },
      { marka: 'Optiswiss', kategori: 'Optik Cam', urun: 'B', adet: 1, fiyat: 500 }
    ]);
    sayaciSifirla();
    siparisKaydet(magazaToken, cokUrun, 'Sema İpek');
    expect(mock.sayac.okuma).toBeLessThanOrEqual(tek);
  });

  test('ödeme sayısı artınca okuma sayısı artmaz', () => {
    const birOdeme = siparisVerisi();
    birOdeme.odemeler = [birOdeme.odemeler[0]];
    sayaciSifirla();
    siparisKaydet(magazaToken, birOdeme, 'Sema İpek');
    const tek = mock.sayac.okuma;

    const dortOdeme = siparisVerisi();
    dortOdeme.odemeler = dortOdeme.odemeler.concat([
      { tutar: 1000, tarih: '2026-09-03', yontem: 'nakit' },
      { tutar: 2000, tarih: '2026-09-04', yontem: 'kk', banka: 'Garanti', taksit: '3 Taksit' }
    ]);
    sayaciSifirla();
    siparisKaydet(magazaToken, dortOdeme, 'Sema İpek');
    expect(mock.sayac.okuma).toBeLessThanOrEqual(tek);
  });

  test('tumVeriGetir sayfa başına tek okuma yapar', () => {
    siparisKaydet(magazaToken, siparisVerisi(), 'Sema İpek');
    sayaciSifirla();
    tumVeriGetir(magazaToken);
    expect(mock.sayac.okuma).toBeLessThanOrEqual(8);
    expect(mock.sayac.acma).toBeLessThanOrEqual(1);

    sayaciSifirla();
    tumVeriGetir(muhasebeToken);
    expect(mock.sayac.okuma).toBeLessThanOrEqual(13);
  });

  test('kasa özeti iki sayfa okumasıyla hesaplanır', () => {
    siparisKaydet(magazaToken, siparisVerisi(), 'Sema İpek');
    magazaMasrafEkle(magazaToken, { kalem: 'Kargo', tutar: 500, tarih: '2026-09-01' }, 'Nursu');
    sayaciSifirla();
    kasaOzetGetir(magazaToken, 'gun', '2026-09-01');
    expect(mock.sayac.okuma).toBeLessThanOrEqual(3);
    expect(mock.sayac.yazma).toBe(0);
  });
});

describe('kayıt sonrası istemciye dönen veri', () => {
  test('siparisKaydet güncel kaydı döner (istemci tüm veriyi çekmesin)', () => {
    const r = siparisKaydet(magazaToken, siparisVerisi(), 'Sema İpek');
    expect(r.no).toBe('DK-09-26-0001');
    expect(r.kayit.id).toBe(r.id);
    expect(r.kayit.no).toBe(r.no);
    expect(r.kayit.araToplam).toBe(10100);
    expect(r.kayit.tahsilEdilen).toBe(10000);
    expect(r.kayit.odemeler).toHaveLength(2);
    expect(r.kayit.urunler).toHaveLength(3);
    expect(r.kayit.musteriId).toBeTruthy();
    expect(r.kayit.silindi).toBe(false);
    expect(r.kayit.row).toBeUndefined();
    /* Sunucudan dönen kayıt, listeden okunanla aynı olmalı */
    const listeden = siparisListele(magazaToken)[0];
    expect(r.kayit).toEqual(listeden);
  });

  test('siparisOdemeEkle güncel kaydı döner', () => {
    const r = siparisKaydet(magazaToken, siparisVerisi(), 'Sema İpek');
    const o = siparisOdemeEkle(
      magazaToken,
      r.id,
      { tutar: 500, tarih: '2026-09-05', yontem: 'nakit' },
      'Sema İpek'
    );
    expect(o.kayit.odemeler).toHaveLength(3);
    expect(o.kayit.tahsilEdilen).toBe(10500);
    expect(o.kayit).toEqual(siparisListele(magazaToken)[0]);
  });

  test('siparisDurumGuncelle değişen alanları döner', () => {
    const r = siparisKaydet(magazaToken, siparisVerisi(), 'Sema İpek');
    const d = siparisDurumGuncelle(magazaToken, r.id, 'Montaj Yapıldı', 'Sema İpek');
    expect(d).toMatchObject({ id: r.id, durum: 'Montaj Yapıldı' });
    expect(d.durumTarihi).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('magazaMasrafEkle kaydın kendisini döner', () => {
    const m = magazaMasrafEkle(
      magazaToken,
      { kalem: 'Kargo', tutar: 500, tarih: '2026-09-01', aciklama: 'MNG' },
      'Nursu'
    );
    expect(m).toMatchObject({ kalem: 'Kargo', tutar: 500, tarih: '2026-09-01', kaydeden: 'Nursu' });
    expect(m.id).toBeTruthy();
    expect(magazaMasrafListele(magazaToken, '2026-09')[0].id).toBe(m.id);
  });
});
