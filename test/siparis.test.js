const { installGasMocks } = require('./gasMocks');
const { loadSrc } = require('./loadSrc');

let yoneticiToken, muhasebeToken, magazaToken;

beforeEach(() => {
  installGasMocks();
  loadSrc();
  ilkKurulum('test-kasa-id', 'yonetici@ornek.com', 'Yönetici', 'dogruSifre1');
  kullaniciEkle_('muhasebe@ornek.com', 'Muhasebe', 'dogruSifre1', 'muhasebe');
  kullaniciEkle_('magaza@ornek.com', 'Atrium Mağaza', 'dogruSifre1', 'magaza');
  yoneticiToken = girisYap('yonetici@ornek.com', 'dogruSifre1').token;
  muhasebeToken = girisYap('muhasebe@ornek.com', 'dogruSifre1').token;
  magazaToken = girisYap('magaza@ornek.com', 'dogruSifre1').token;
});

function ornekSiparis(overrides) {
  return Object.assign(
    {
      siparisTarihi: '2026-09-01',
      personel: 'Sema İpek',
      adSoyad: 'Ayşe Yılmaz',
      telefon: '0532 111 22 33',
      urunler: [
        { marka: 'Ray-Ban', kategori: 'Güneş Gözlüğü', urun: 'RB3025', adet: 1, fiyat: 6000 },
        { marka: 'Seiko', kategori: 'Optik Cam', urun: 'Superior', adet: 2, fiyat: 2000 }
      ],
      recete: { ur_sph: '-1.25' },
      odemeler: []
    },
    overrides || {}
  );
}

describe('sipariş kaydı', () => {
  test('mağaza sipariş oluşturur; no, müşteri ve toplamlar otomatik', () => {
    const r = siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    expect(r.no).toBe('DK-09-26-0001');

    const liste = siparisListele(magazaToken);
    expect(liste).toHaveLength(1);
    expect(liste[0].araToplam).toBe(10000);
    expect(liste[0].tutar).toBe(10000);
    expect(liste[0].musteriId).toBeTruthy();

    const musteriler = musteriListele(magazaToken);
    expect(musteriler).toHaveLength(1);
    expect(musteriler[0].adSoyad).toBe('Ayşe Yılmaz');
  });

  test('genel toplam elle düşürülürse indirimli tutar korunur', () => {
    siparisKaydet(magazaToken, ornekSiparis({ tutar: 9000 }), 'Sema İpek');
    const s = siparisListele(magazaToken)[0];
    expect(s.araToplam).toBe(10000);
    expect(s.tutar).toBe(9000);
  });

  test('sipariş numarası ay içinde artar', () => {
    siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    const r2 = siparisKaydet(magazaToken, ornekSiparis({ adSoyad: 'Veli Kaya' }), 'Sema İpek');
    expect(r2.no).toBe('DK-09-26-0002');
  });

  test('mağaza rolünde işlemi yapan personel zorunlu', () => {
    expect(() => siparisKaydet(magazaToken, ornekSiparis(), '')).toThrow(/personel/i);
    expect(() => siparisKaydet(yoneticiToken, ornekSiparis(), '')).not.toThrow();
  });

  test('müşteri adı olmadan kaydedilemez', () => {
    expect(() => siparisKaydet(magazaToken, ornekSiparis({ adSoyad: '' }), 'Sema İpek')).toThrow();
  });

  test('yeni marka ilk kullanımda marka listesine eklenir', () => {
    siparisKaydet(
      magazaToken,
      ornekSiparis({
        urunler: [{ marka: 'Yepyeni Marka', kategori: 'Optik Çerçeve', urun: 'X1', adet: 1, fiyat: 100 }]
      }),
      'Sema İpek'
    );
    expect(markalariGetir_()['Optik Çerçeve']).toContain('Yepyeni Marka');
  });

  test('işlem loga düşer ve personeli taşır', () => {
    siparisKaydet(magazaToken, ornekSiparis(), 'Şuayip Önür');
    const log = logListele(yoneticiToken, 50);
    const kayit = log.find((l) => l.islem === 'SIPARIS_EKLE');
    expect(kayit).toBeTruthy();
    expect(kayit.personel).toBe('Şuayip Önür');
    expect(kayit.kullanici).toBe('magaza@ornek.com');
  });
});

describe('çoklu tahsilat ve iade', () => {
  test('her ödeme kendi tarihiyle sayılır, tahsil/kalan güncellenir', () => {
    const { id } = siparisKaydet(
      magazaToken,
      ornekSiparis({
        odemeler: [
          { tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' },
          { tutar: 3000, tarih: '2026-10-05', yontem: 'kk', banka: 'Garanti', taksit: '3 Taksit' }
        ]
      }),
      'Sema İpek'
    );
    const s = siparisListele(magazaToken).find((x) => x.id === id);
    expect(s.tahsilEdilen).toBe(7000);
    expect(s.kalan).toBe(3000);
    expect(s.odemeler).toHaveLength(2);
  });

  test('siparisOdemeEkle var olan siparişe tahsilat ekler', () => {
    const { id } = siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    siparisOdemeEkle(magazaToken, id, { tutar: 2500, tarih: '2026-09-03', yontem: 'nakit' }, 'Nursu');
    const s = siparisListele(magazaToken).find((x) => x.id === id);
    expect(s.tahsilEdilen).toBe(2500);
    expect(s.kalan).toBe(7500);
  });

  test('iade tahsilattan düşülür', () => {
    const { id } = siparisKaydet(
      magazaToken,
      ornekSiparis({ odemeler: [{ tutar: 10000, tarih: '2026-09-01', yontem: 'nakit' }] }),
      'Sema İpek'
    );
    siparisOdemeEkle(
      magazaToken,
      id,
      { tutar: 1500, tarih: '2026-09-10', yontem: 'nakit', tip: 'iade' },
      'Nursu'
    );
    const s = siparisListele(magazaToken).find((x) => x.id === id);
    expect(s.tahsilEdilen).toBe(8500);
  });
});

describe('teslim tarihi otomatiği', () => {
  test('tamamı tahsil edilince son ödeme tarihi teslim tarihi olur', () => {
    siparisKaydet(
      magazaToken,
      ornekSiparis({
        odemeler: [
          { tutar: 5000, tarih: '2026-09-01', yontem: 'nakit' },
          { tutar: 5000, tarih: '2026-09-09', yontem: 'nakit' }
        ]
      }),
      'Sema İpek'
    );
    expect(siparisListele(magazaToken)[0].teslimTarihi).toBe('2026-09-09');
  });

  test('durum "Teslim Edildi" yapılınca teslim tarihi bugüne çekilir', () => {
    const { id } = siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    siparisDurumGuncelle(magazaToken, id, 'Teslim Edildi', 'Sema İpek');
    const s = siparisListele(magazaToken).find((x) => x.id === id);
    expect(s.durum).toBe('Teslim Edildi');
    expect(s.teslimTarihi).toBe(dstr_(new Date()));
  });

  test('geçersiz durum reddedilir', () => {
    const { id } = siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    expect(() => siparisDurumGuncelle(magazaToken, id, 'Uçtu Gitti', 'Sema İpek')).toThrow();
  });
});

describe('kasa entegrasyonu', () => {
  test('nakit tahsilat kasaya GELİR olarak düşer', () => {
    siparisKaydet(
      magazaToken,
      ornekSiparis({ odemeler: [{ tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' }] }),
      'Sema İpek'
    );
    const hareketler = hareketleriGetir(muhasebeToken);
    expect(hareketler).toHaveLength(1);
    expect(hareketler[0]).toMatchObject({
      tarih: '2026-09-01',
      yon: 'GELIR',
      ana: 'Nakit Satış',
      tutar: 4000,
      hesap: 'Nakit Kasa',
      kaynak: 'SIPARIS'
    });
  });

  test('kredi kartı tahsilatı POS hesabına yazılır ve hesap listesine eklenir', () => {
    siparisKaydet(
      magazaToken,
      ornekSiparis({
        odemeler: [{ tutar: 6000, tarih: '2026-09-02', yontem: 'kk', banka: 'Garanti', taksit: '3 Taksit' }]
      }),
      'Sema İpek'
    );
    const h = hareketleriGetir(muhasebeToken)[0];
    expect(h.ana).toBe('POS / Kredi Kartı Satışı');
    expect(h.alt).toBe('Garanti');
    expect(h.hesap).toBe('Garanti POS');
    expect(ayarPaketiGetir_().hesaplar).toContain('Garanti POS');
  });

  test('iade kasaya GİDER olarak düşer', () => {
    const { id } = siparisKaydet(
      magazaToken,
      ornekSiparis({ odemeler: [{ tutar: 10000, tarih: '2026-09-01', yontem: 'nakit' }] }),
      'Sema İpek'
    );
    siparisOdemeEkle(
      magazaToken,
      id,
      { tutar: 1500, tarih: '2026-09-10', yontem: 'nakit', tip: 'iade' },
      'Nursu'
    );
    const hareketler = hareketleriGetir(muhasebeToken);
    const iade = hareketler.find((h) => h.yon === 'GIDER');
    expect(iade).toMatchObject({ ana: 'Satış İadesi', tutar: 1500, tarih: '2026-09-10' });
  });

  test('ödeme kaldırılınca kasa hareketi de silinir', () => {
    const siparis = ornekSiparis({
      odemeler: [
        { id: 'o1', tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' },
        { id: 'o2', tutar: 3000, tarih: '2026-09-05', yontem: 'nakit' }
      ]
    });
    const { id } = siparisKaydet(magazaToken, siparis, 'Sema İpek');
    expect(hareketleriGetir(muhasebeToken)).toHaveLength(2);

    siparis.id = id;
    siparis.odemeler = [{ id: 'o1', tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' }];
    siparisKaydet(magazaToken, siparis, 'Sema İpek');
    expect(hareketleriGetir(muhasebeToken)).toHaveLength(1);
  });

  test('sipariş çöpe atılınca hareketleri kalkar, geri alınca döner', () => {
    const { id } = siparisKaydet(
      magazaToken,
      ornekSiparis({ odemeler: [{ tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' }] }),
      'Sema İpek'
    );
    siparisSil(magazaToken, id, 'Sema İpek');
    expect(hareketleriGetir(muhasebeToken)).toHaveLength(0);
    expect(siparisListele(magazaToken).find((s) => s.id === id).silindi).toBe(true);

    siparisGeriAl(magazaToken, id, 'Sema İpek');
    expect(hareketleriGetir(muhasebeToken)).toHaveLength(1);
  });

  test('entegrasyon kapalıyken kasaya yazılmaz', () => {
    ayarYaz_('siparis_kasa_entegrasyon', 'hayır');
    siparisKaydet(
      magazaToken,
      ornekSiparis({ odemeler: [{ tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' }] }),
      'Sema İpek'
    );
    expect(hareketleriGetir(muhasebeToken)).toHaveLength(0);
  });
});

describe('mağaza masrafı', () => {
  test('mağaza masraf girer, kasada GİDER olarak görünür', () => {
    magazaMasrafEkle(
      magazaToken,
      { kalem: 'Temizlik / Sarf', tutar: 250, tarih: '2026-09-01', aciklama: 'Deterjan' },
      'Nursu'
    );
    const h = hareketleriGetir(muhasebeToken);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ yon: 'GIDER', ana: 'Masraflar', alt: 'Temizlik / Sarf', tutar: 250 });
    expect(magazaMasrafListele(magazaToken, '2026-09')).toHaveLength(1);
  });

  test('listede olmayan masraf kalemi reddedilir', () => {
    expect(() => magazaMasrafEkle(magazaToken, { kalem: 'Uydurma Kalem', tutar: 100 }, 'Nursu')).toThrow();
  });

  test('mağaza kasa hareketlerinin tamamını göremez', () => {
    expect(() => hareketleriGetir(magazaToken)).toThrow();
  });
});

describe('kasa özeti (gün / ay)', () => {
  beforeEach(() => {
    siparisKaydet(
      magazaToken,
      ornekSiparis({
        personel: 'Sema İpek',
        odemeler: [
          { tutar: 4000, tarih: '2026-09-01', yontem: 'nakit' },
          { tutar: 6000, tarih: '2026-09-01', yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim' }
        ]
      }),
      'Sema İpek'
    );
    magazaMasrafEkle(magazaToken, { kalem: 'Kargo', tutar: 500, tarih: '2026-09-01' }, 'Nursu');
  });

  test('günlük özet: nakit/pos satış, masraf ve net nakit', () => {
    const o = kasaOzetGetir(magazaToken, 'gun', '2026-09-01');
    expect(o.satis.nakit).toBe(4000);
    expect(o.satis.pos).toBe(6000);
    expect(o.satis.toplam).toBe(10000);
    expect(o.personel['Sema İpek']).toBe(10000);
    expect(o.masrafToplam).toBe(500);
    expect(o.netNakit).toBe(3500);
  });

  test('devirli nakit kasa bakiyesi açılış kasasını da içerir', () => {
    ayarYaz_('acilis_kasa', '1000');
    const o = kasaOzetGetir(magazaToken, 'gun', '2026-09-01');
    /* 1000 açılış + 4000 nakit tahsilat - 500 nakit masraf */
    expect(o.nakitKasaBakiye).toBe(4500);
  });

  test('aylık özet günleri toplar', () => {
    const o = kasaOzetGetir(muhasebeToken, 'ay', '2026-09');
    expect(o.satis.toplam).toBe(10000);
    expect(o.masrafToplam).toBe(500);
  });

  test('başka güne ait tahsilat o güne sayılmaz', () => {
    const o = kasaOzetGetir(magazaToken, 'gun', '2026-09-02');
    expect(o.satis.toplam).toBe(0);
  });
});

describe('çöp kutusu', () => {
  test('3 günden eski silinmiş sipariş kalıcı temizlenir', () => {
    const { id } = siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    siparisSil(magazaToken, id, 'Sema İpek');
    const s = siparisSheet_();
    const satir = s.rows.findIndex((r) => r[0] === id);
    s.rows[satir][25] = '2020-01-01';
    expect(copTemizle(muhasebeToken)).toBe(1);
    expect(siparisListele(magazaToken)).toHaveLength(0);
  });

  test('kalıcı silme mağaza rolüne kapalı', () => {
    const { id } = siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    expect(() => siparisKaliciSil(magazaToken, id)).toThrow();
    expect(siparisKaliciSil(muhasebeToken, id)).toBe(true);
  });
});

describe('tumVeriGetir rol filtresi', () => {
  test('mağaza sipariş/müşteri/personel alır, kasa verisi almaz', () => {
    siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    const veri = tumVeriGetir(magazaToken);
    expect(veri.siparis).toHaveLength(1);
    expect(veri.musteriler).toHaveLength(1);
    expect(veri.personel.length).toBeGreaterThan(0);
    expect(veri.urunKategorileri.length).toBe(8);
    expect(veri.hareketler).toEqual([]);
    expect(veri.kasaKategorileri).toEqual([]);
    expect(veri.ayar.ham).toEqual({});
  });

  test('muhasebe tam veri seti alır', () => {
    siparisKaydet(magazaToken, ornekSiparis(), 'Sema İpek');
    const veri = tumVeriGetir(muhasebeToken);
    expect(veri.siparis).toHaveLength(1);
    expect(veri.kasaKategorileri.length).toBeGreaterThan(0);
    expect(veri.ayar.acilisKasa).toBe(0);
  });
});
