/**
 * Uygulama API'si (RPC): arayüzün çağırdığı uçlar.
 * Dönen JSON'un Apps Script sürümüyle aynı şekilde olması kritik —
 * arayüz kodu bu şekle göre yazıldı.
 */
const { veritabaniKur, hataBekle } = require('./harness');

jest.setTimeout(30000);

let db, isletme, magaza, magazaUid, muhasebeUid, yoneticiUid;

beforeAll(async () => {
  db = await veritabaniKur();
});

afterAll(async () => {
  if (db) await db.kapat();
});

beforeEach(async () => {
  await db.sifirla();
  const k = await db.kiraciKur({ onEk: 'a', ad: 'Örnek Optik', subeKod: 'DK' });
  isletme = k.isletme;
  magaza = k.magaza;
  magazaUid = k.uid.magaza;
  muhasebeUid = k.uid.muhasebe;
  yoneticiUid = k.uid.sahip; /* sahip, yönetici yetkilerini de taşır */
  await db.oturumAc(magazaUid);
});

function ornek(ek) {
  return Object.assign(
    {
      siparisTarihi: '2026-10-01',
      personel: 'Sema İpek',
      adSoyad: 'Ayşe Yılmaz',
      telefon: '0532 111 22 33',
      eposta: '',
      tcVergi: '',
      recete: { ur_sph: '-1.25' },
      urunler: [
        { marka: 'Ray-Ban', kategori: 'Güneş Gözlüğü', urun: 'RB3025', adet: 1, fiyat: 6000 },
        { marka: 'Seiko', kategori: 'Optik Cam', urun: 'Superior', adet: 2, fiyat: 2000 }
      ],
      odemeler: [],
      tutar: 0,
      durum: 'Satış Yapıldı',
      nebim: false
    },
    ek || {}
  );
}

async function kaydet(veri, personel) {
  const r = await db.tek('select siparis_kaydet($1::jsonb, $2) as s', [
    JSON.stringify(veri),
    personel === undefined ? 'Sema İpek' : personel
  ]);
  return r.s;
}

async function tumVeri() {
  return (await db.tek('select tum_veri() as v')).v;
}

describe('siparis_kaydet', () => {
  test('yeni sipariş: no, toplamlar, müşteri ve marka otomatik', async () => {
    const s = await kaydet(ornek());
    expect(s.no).toBe('DK-10-26-0001');
    expect(s.araToplam).toBe(10000);
    expect(s.tutar).toBe(10000);
    expect(s.kalan).toBe(10000);
    expect(s.musteriId).toBeTruthy();
    expect(s.urunler).toHaveLength(2);
    expect(s.recete.ur_sph).toBe('-1.25');
    expect(s.silindi).toBe(false);

    const v = await tumVeri();
    expect(v.musteriler).toHaveLength(1);
    expect(v.musteriler[0].adSoyad).toBe('Ayşe Yılmaz');
    expect(v.siparis).toHaveLength(1);
  });

  test('genel toplam elle düşürülürse indirim korunur', async () => {
    const s = await kaydet(ornek({ tutar: 9000 }));
    expect(s.araToplam).toBe(10000);
    expect(s.tutar).toBe(9000);
  });

  test('elle indirim yoksa ürün değişince toplam kendini günceller', async () => {
    const s = await kaydet(ornek());
    const g = await kaydet(
      ornek({
        id: s.id,
        urunler: [{ marka: 'Seiko', kategori: 'Optik Cam', urun: 'A', adet: 1, fiyat: 1500 }]
      })
    );
    expect(g.araToplam).toBe(1500);
    expect(g.tutar).toBe(1500);
  });

  test('güncellemede sipariş numarası değişmez', async () => {
    const s = await kaydet(ornek());
    const g = await kaydet(ornek({ id: s.id, adSoyad: 'Ayşe Yılmaz (düzeltme)' }));
    expect(g.no).toBe(s.no);
    expect(g.adSoyad).toBe('Ayşe Yılmaz (düzeltme)');
    expect((await tumVeri()).siparis).toHaveLength(1);
  });

  test('listede olmayan marka ilk kullanımda eklenir', async () => {
    await kaydet(
      ornek({
        urunler: [{ marka: 'Bilinmeyen Marka', kategori: 'Optik Cam', urun: 'X', adet: 1, fiyat: 100 }]
      })
    );
    const v = await tumVeri();
    expect(v.markalar['Optik Cam']).toContain('Bilinmeyen Marka');
  });

  test('serbest girilen satış personeli listeye eklenir', async () => {
    await kaydet(ornek(), 'Yeni Personel');
    const v = await tumVeri();
    expect(v.personel.map((p) => p.ad)).toContain('Yeni Personel');
  });

  test('mağaza rolünde işlemi yapan personel zorunlu', async () => {
    expect(await hataBekle(() => kaydet(ornek(), ''))).toMatch(/personel/i);
    await db.oturumAc(muhasebeUid);
    expect(await hataBekle(() => kaydet(ornek(), ''))).toBeNull();
  });

  test('müşteri adı olmadan kaydedilemez', async () => {
    expect(await hataBekle(() => kaydet(ornek({ adSoyad: '' })))).toMatch(/Müşteri adı/);
  });

  test('ödemeler payload ile eşitlenir; kaldırılan ödemenin kasa hareketi silinir', async () => {
    const s = await kaydet(
      ornek({
        odemeler: [
          { tutar: 4000, tarih: '2026-10-01', yontem: 'nakit' },
          { tutar: 6000, tarih: '2026-10-02', yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim' }
        ]
      })
    );
    expect(s.odemeler).toHaveLength(2);
    expect(s.tahsilEdilen).toBe(10000);

    const kalan = s.odemeler.filter((o) => o.yontem === 'nakit');
    const g = await kaydet(ornek({ id: s.id, odemeler: kalan }));
    expect(g.odemeler).toHaveLength(1);
    expect(g.tahsilEdilen).toBe(4000);

    await db.oturumAc(muhasebeUid);
    const h = (await tumVeri()).hareketler;
    expect(h).toHaveLength(1);
    expect(h[0].tutar).toBe(4000);
  });

  test('aynı müşteri telefondan eşleşir, ikinci kart açılmaz', async () => {
    await kaydet(ornek());
    await kaydet(ornek({ adSoyad: 'Ayşe Y.', telefon: '+90 532 111 22 33' }));
    const v = await tumVeri();
    expect(v.musteriler).toHaveLength(1);
    expect(v.musteriler[0].adSoyad).toBe('Ayşe Y.');
  });
});

describe('tahsilat, durum ve çöp kutusu', () => {
  test('siparis_odeme_ekle tahsilatı ekler ve kasaya yazar', async () => {
    const s = await kaydet(ornek());
    const g = (
      await db.tek('select siparis_odeme_ekle($1, $2::jsonb, $3) as s', [
        s.id,
        JSON.stringify({ tutar: 2500, tarih: '2026-10-03', yontem: 'nakit' }),
        'Nursu'
      ])
    ).s;
    expect(g.tahsilEdilen).toBe(2500);
    expect(g.kalan).toBe(7500);

    await db.oturumAc(muhasebeUid);
    const h = (await tumVeri()).hareketler;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ yon: 'GELIR', ana: 'Nakit Satış', tutar: 2500, kaynak: 'SIPARIS' });
  });

  test('iade tahsilattan düşülür', async () => {
    const s = await kaydet(ornek({ odemeler: [{ tutar: 5000, tarih: '2026-10-01' }] }));
    const g = (
      await db.tek('select siparis_odeme_ekle($1, $2::jsonb, $3) as s', [
        s.id,
        JSON.stringify({ tutar: 1500, tarih: '2026-10-05', yontem: 'nakit', tip: 'iade' }),
        'Nursu'
      ])
    ).s;
    expect(g.tahsilEdilen).toBe(3500);
  });

  test('durum güncellenince teslim tarihi otomatik yazılır', async () => {
    const s = await kaydet(ornek());
    const g = (
      await db.tek('select siparis_durum_guncelle($1, $2, $3) as s', [s.id, 'Teslim Edildi', 'Nursu'])
    ).s;
    expect(g.durum).toBe('Teslim Edildi');
    expect(g.teslimTarihi).toBe(new Date().toISOString().substring(0, 10));
  });

  test('çöpe atma ve geri alma', async () => {
    const s = await kaydet(ornek({ odemeler: [{ tutar: 1000, tarih: '2026-10-01' }] }));
    const silinen = (await db.tek('select siparis_sil($1, $2) as s', [s.id, 'Nursu'])).s;
    expect(silinen.silindi).toBe(true);
    expect(silinen.silinmeTarihi).toBe(new Date().toISOString().substring(0, 10));

    const geri = (await db.tek('select siparis_geri_al($1, $2) as s', [s.id, 'Nursu'])).s;
    expect(geri.silindi).toBe(false);
  });

  test('kalıcı silme mağaza rolüne kapalı, muhasebeye açık', async () => {
    const s = await kaydet(ornek());
    expect((await db.tek('select siparis_kalici_sil($1) as ok', [s.id])).ok).toBe(false);
    await db.oturumAc(muhasebeUid);
    expect((await db.tek('select siparis_kalici_sil($1) as ok', [s.id])).ok).toBe(true);
  });

  test('çöpte 3 günden uzun bekleyen kalıcı silinir', async () => {
    const s = await kaydet(ornek());
    await db.sistem();
    await db.calistir(
      `update siparisler set silindi = true, silinme_tarihi = current_date - 5 where id = $1`,
      [s.id]
    );
    await db.oturumAc(muhasebeUid);
    expect((await db.tek('select cop_temizle() as n')).n).toBe(1);
    expect((await tumVeri()).siparis).toHaveLength(0);
  });
});

describe('tum_veri rol filtresi', () => {
  beforeEach(async () => {
    await kaydet(ornek({ odemeler: [{ tutar: 4000, tarih: '2026-10-01' }] }));
    await db.calistir(`select magaza_masraf_ekle('Kargo', 500, '2026-10-01', null, '', 'Nursu')`);
  });

  test('mağaza rolü kasa verisi almaz, kendi masrafını alır', async () => {
    const v = await tumVeri();
    expect(v.kullanici.rol).toBe('magaza');
    expect(v.hareketler).toEqual([]);
    expect(v.cari).toEqual([]);
    expect(v.kasaKategorileri).toEqual([]);
    expect(v.masraflar).toHaveLength(1);
    expect(v.masraflar[0]).toMatchObject({ kalem: 'Kargo', tutar: 500, kaydeden: 'Nursu' });
    expect(v.ayar.ham).toEqual({});
    expect(v.ayar.acilisKasa).toBeUndefined();
  });

  test('muhasebe tam veri seti alır', async () => {
    await db.oturumAc(muhasebeUid);
    const v = await tumVeri();
    expect(v.kullanici.rol).toBe('muhasebe');
    expect(v.hareketler).toHaveLength(2);
    expect(v.kasaKategorileri.length).toBeGreaterThan(10);
    expect(v.kasaKategorileri[0].alt.length).toBeGreaterThan(0);
    expect(v.ayar.acilisKasa).toBe(0);
    expect(Object.keys(v.ayar.ham).length).toBeGreaterThan(5);
  });

  test('ayar paketi oranları ayrıştırır', async () => {
    const v = await tumVeri();
    /* Yeni işletme kimsenin prim oranını devralmaz: varsayılan 0 */
    expect(v.ayar.personelPrim).toBe(0);
    expect(v.ayar.kkKomisyon['Tek çekim']).toBe(3.5);
    expect(v.ayar.kkKomisyon['3 Taksit']).toBe(9);
    expect(v.ayar.bankalar).toContain('Garanti');
    expect(v.ayar.taksitler[0]).toBe('Tek çekim');
    expect(v.ayar.siparisNoOnEk).toBe('DK');
    expect(v.ayar.hesaplar).toContain('Nakit Kasa');
  });

  test('pasif hesap veri alamaz', async () => {
    await db.sistem();
    await db.calistir('update profiller set aktif = false where id = $1', [magazaUid]);
    await db.oturumAc(magazaUid);
    expect(await hataBekle(() => tumVeri())).toMatch(/Oturum geçersiz|pasif/);
  });
});

describe('kasa yazma uçları', () => {
  test('mağaza rolü kasaya hareket yazamaz', async () => {
    const hata = await hataBekle(() =>
      db.calistir('select hareket_kaydet($1::jsonb)', [
        JSON.stringify({
          tarih: '2026-10-01',
          yon: 'GIDER',
          ana: 'Kira & Aidat',
          tutar: 15000,
          hesap: 'Nakit Kasa'
        })
      ])
    );
    expect(hata).toMatch(/yetkiniz yok/i);
  });

  test('muhasebe hareket yazar, istemcinin uydurduğu id sorun olmaz', async () => {
    await db.oturumAc(muhasebeUid);
    const h = (
      await db.tek('select hareket_kaydet($1::jsonb) as h', [
        JSON.stringify({
          id: 'h1760000000000',
          tarih: '2026-10-01',
          yon: 'GIDER',
          ana: 'Kira & Aidat',
          alt: 'Kira',
          tutar: 15000,
          hesap: 'Nakit Kasa',
          aciklama: 'Ekim kirası'
        })
      ])
    ).h;
    expect(h).toMatchObject({ yon: 'GIDER', ana: 'Kira & Aidat', tutar: 15000, kaydeden: 'Muhasebe' });
    expect((await tumVeri()).hareketler).toHaveLength(1);
  });

  test('hareket_kaydet tutarsız veriyi reddeder', async () => {
    await db.oturumAc(muhasebeUid);
    expect(
      await hataBekle(() =>
        db.calistir('select hareket_kaydet($1::jsonb)', [
          JSON.stringify({ tarih: '2026-10-01', yon: 'GIDER', ana: 'Kira', tutar: 0, hesap: 'Nakit Kasa' })
        ])
      )
    ).toMatch(/Tutar/);
    expect(
      await hataBekle(() =>
        db.calistir('select hareket_kaydet($1::jsonb)', [
          JSON.stringify({ tarih: '2026-10-01', yon: 'GIDER', ana: '', tutar: 10, hesap: 'Nakit Kasa' })
        ])
      )
    ).toMatch(/Ana kategori/);
  });

  test('hedef mağazada yazılamaz, muhasebede yazılır ve görünür', async () => {
    expect(await hataBekle(() => db.calistir(`select hedef_kaydet('2026-10', 500000, '')`))).toMatch(
      /row-level security/i
    );
    await db.oturumAc(muhasebeUid);
    expect((await db.tek(`select hedef_kaydet('2026-10', 500000, 'Ekim hedefi') as ok`)).ok).toBe(true);
    await db.oturumAc(magazaUid);
    const v = await tumVeri();
    expect(v.hedefler['2026-10']).toMatchObject({ hedef: 500000, notu: 'Ekim hedefi' });
  });

  test('ayar yalnızca yöneticide değişir', async () => {
    await db.oturumAc(muhasebeUid);
    expect(await hataBekle(() => db.calistir(`select ayar_guncelle('personel_prim', '6')`))).toMatch(
      /row-level security/i
    );
    await db.oturumAc(yoneticiUid);
    expect((await db.tek(`select ayar_guncelle('personel_prim', '6') as ok`)).ok).toBe(true);
    expect((await tumVeri()).ayar.personelPrim).toBe(6);
  });

  test('günlüğü yalnızca finans görür', async () => {
    await kaydet(ornek());
    expect((await db.tek('select log_listele(50) as l')).l).toEqual([]);
    await db.oturumAc(muhasebeUid);
    const l = (await db.tek('select log_listele(50) as l')).l;
    expect(l.length).toBeGreaterThan(0);
    expect(l.map((x) => x.islem)).toContain('SIPARIS_EKLE');
  });
});

describe('kullanıcı yönetimi', () => {
  beforeEach(async () => {
    /* Deneme planı 3 kullanıcıyla sınırlı; bu testler için Pro'ya geç */
    await db.abonelikAyarla(isletme, { plan: 'pro' });
    await db.oturumAc(yoneticiUid);
  });

  test('yönetici kullanıcıları listeler', async () => {
    const l = (await db.tek('select kullanici_listesi() as l')).l;
    expect(l).toHaveLength(3);
    expect(l.map((x) => x.rol).sort()).toEqual(['magaza', 'muhasebe', 'sahip']);
    expect(l.filter((x) => x.rol === 'magaza')[0].magaza).toBe('Örnek Optik');
  });

  test('mağaza rolü kullanıcı listesini göremez', async () => {
    await db.oturumAc(magazaUid);
    const l = (await db.tek('select kullanici_listesi() as l')).l;
    expect(l).toHaveLength(1); /* yalnızca kendi profili */
    expect(l[0].rol).toBe('magaza');
  });

  test('yönetici kullanıcıyı pasife alır, kendini alamaz', async () => {
    expect((await db.tek(`select kullanici_durum_degistir('a-magaza@ornek.com', false) as ok`)).ok).toBe(
      true
    );
    await db.oturumAc(magazaUid);
    expect(await hataBekle(() => db.calistir('select tum_veri()'))).toMatch(/pasif|geçersiz/i);
    await db.oturumAc(yoneticiUid);
    expect(
      await hataBekle(() => db.calistir(`select kullanici_durum_degistir('a-sahip@ornek.com', false)`))
    ).toMatch(/Kendi hesabınızı|sahibinin/);
  });

  test('muhasebe kullanıcı durumu değiştiremez', async () => {
    await db.oturumAc(muhasebeUid);
    expect(
      await hataBekle(() => db.calistir(`select kullanici_durum_degistir('a-magaza@ornek.com', false)`))
    ).toMatch(/yetkiniz yok/i);
  });

  test('profil_olustur auth kaydı olmayan e-postayı reddeder', async () => {
    expect(
      await hataBekle(() => db.calistir(`select profil_olustur('yok@ornek.com', 'Yok', 'magaza', 'DK')`))
    ).toMatch(/hesap bulunamadı/i);
  });

  test('yönetici yeni profil açar, mağaza rolü şubeye bağlanır', async () => {
    const yeniUid = await db.kullaniciOlustur('yeni@ornek.com');
    await db.oturumAc(yoneticiUid);
    expect(
      (await db.tek(`select profil_olustur('yeni@ornek.com', 'Yeni Kişi', 'magaza', 'DK') as ok`)).ok
    ).toBe(true);
    await db.oturumAc(yeniUid);
    const v = (await db.tek('select tum_veri() as v')).v;
    expect(v.kullanici).toMatchObject({ ad: 'Yeni Kişi', rol: 'magaza' });
  });

  test('mağaza rolü profil açamaz', async () => {
    await db.kullaniciOlustur('sahte@ornek.com');
    await db.oturumAc(magazaUid);
    expect(
      await hataBekle(() =>
        db.calistir(`select profil_olustur('sahte@ornek.com', 'Sahte', 'yonetici', null)`)
      )
    ).toMatch(/yetkiniz yok/i);
  });

  test('marka ekle/sil yalnızca yöneticide', async () => {
    expect((await db.tek(`select marka_ekle('Optik Cam', 'Nikon') as ok`)).ok).toBe(true);
    expect(await hataBekle(() => db.calistir(`select marka_ekle('Optik Cam', 'Nikon')`))).toMatch(
      /zaten kayıtlı/
    );
    expect((await db.tek(`select marka_sil('Optik Cam', 'Nikon') as ok`)).ok).toBe(true);
    await db.oturumAc(magazaUid);
    expect(await hataBekle(() => db.calistir(`select marka_ekle('Optik Cam', 'Canon')`))).toMatch(
      /row-level security/i
    );
  });

  test('hareketler_listesi mağaza rolüne boş döner', async () => {
    await db.oturumAc(magazaUid);
    await kaydet(ornek({ odemeler: [{ tutar: 1000, tarih: '2026-10-01' }] }));
    expect((await db.tek('select hareketler_listesi() as h')).h).toEqual([]);
    await db.oturumAc(muhasebeUid);
    expect((await db.tek('select hareketler_listesi() as h')).h).toHaveLength(1);
  });
});
