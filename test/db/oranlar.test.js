/**
 * Oranlar: KDV, kredi kartı komisyonu ve personel primi.
 *
 * Üçü de işletmeye özeldir ve arayüzden düzenlenir. Para hesabı
 * olduğu için her kural ayrı sınanır.
 */
const { veritabaniKur, hataBekle } = require('./harness');

jest.setTimeout(45000);

let db, k;

beforeAll(async () => {
  db = await veritabaniKur();
});

afterAll(async () => {
  if (db) await db.kapat();
});

beforeEach(async () => {
  await db.sifirla();
  k = await db.kiraciKur({ onEk: 'or', ad: 'Oran Optik', subeKod: 'KUZ' });
  await db.oturumAc(k.uid.personel);
});

async function kaydet(ek) {
  return (
    await db.tek('select siparis_kaydet($1::jsonb, $2) as s', [
      JSON.stringify(
        Object.assign(
          {
            siparisTarihi: '2026-10-01',
            adSoyad: 'Ayşe Yılmaz',
            personel: 'Ali Veli',
            urunler: [],
            odemeler: [],
            recete: {}
          },
          ek || {}
        )
      ),
      'Ali Veli'
    ])
  ).s;
}

function urun(kategori, fiyat, adet) {
  return { marka: 'Marka', kategori: kategori, urun: 'X', adet: adet || 1, fiyat: fiyat };
}

describe('KDV', () => {
  test('varsayılan oranlar: optik çerçeve ve cam %10, diğerleri %20', async () => {
    const k2 = await db.sor('select ad, kdv::float8 as kdv from urun_kategorileri order by sira');
    const map = {};
    k2.forEach((x) => (map[x.ad] = x.kdv));
    expect(map['Optik Çerçeve']).toBe(10);
    expect(map['Optik Cam']).toBe(10);
    expect(map['Güneş Gözlüğü']).toBe(20);
    expect(map['Lens']).toBe(20);
    expect(map['Solüsyon']).toBe(20);
    expect(map['Tamir/Aksesuar']).toBe(20);
  });

  test('KDV dahil modu: fiyatın içinden ayrışır, toplam değişmez', async () => {
    const s = await kaydet({ urunler: [urun('Optik Cam', 1100), urun('Güneş Gözlüğü', 1200)] });
    expect(s.araToplam).toBe(2300);
    expect(s.tutar).toBe(2300);
    expect(Number(s.kdvTutari)).toBe(300); /* 100 + 200 */
  });

  test('KDV hariç modu: toplama eklenir', async () => {
    await db.oturumAc(k.uid.finans);
    await db.calistir(`select ayar_guncelle('kdv_modu', 'haric')`);
    await db.oturumAc(k.uid.personel);

    const s = await kaydet({ urunler: [urun('Optik Cam', 1000), urun('Güneş Gözlüğü', 1000)] });
    expect(s.araToplam).toBe(2000);
    expect(Number(s.kdvTutari)).toBe(300); /* 100 + 200 */
    expect(s.tutar).toBe(2300);
  });

  test('KDV hariç modda istemcinin gönderdiği KDV’li toplam indirim sanılmaz', async () => {
    await db.oturumAc(k.uid.finans);
    await db.calistir(`select ayar_guncelle('kdv_modu', 'haric')`);
    await db.oturumAc(k.uid.personel);

    const s = await kaydet({ urunler: [urun('Optik Cam', 2000)], tutar: 2200 });
    expect(s.tutarElle).toBe(false);
    expect(s.tutar).toBe(2200);
    expect(Number(s.kdvTutari)).toBe(200);
  });

  test('elle indirimde KDV orantılı düşer', async () => {
    const s = await kaydet({ urunler: [urun('Optik Cam', 1100)], tutar: 550, tutarElle: true });
    expect(s.tutar).toBe(550);
    expect(Number(s.kdvTutari)).toBe(50); /* 100 × 550/1100 */
  });

  test('kategori oranı değişince yeni siparişler yeni oranla hesaplanır', async () => {
    await db.oturumAc(k.uid.finans);
    await db.calistir('select urun_kategorileri_kaydet($1::jsonb)', [
      JSON.stringify([{ ad: 'Optik Cam', kdv: 20, ikon: '⭕', aktif: true }])
    ]);
    await db.oturumAc(k.uid.personel);
    const s = await kaydet({ urunler: [urun('Optik Cam', 1200)] });
    expect(Number(s.kdvTutari)).toBe(200); /* %20 dahil */
  });

  test('kategorisi olmayan satır KDV hesabına girmez', async () => {
    const s = await kaydet({ urunler: [{ marka: '', kategori: '', urun: 'Serbest', adet: 1, fiyat: 500 }] });
    expect(s.araToplam).toBe(500);
    expect(Number(s.kdvTutari)).toBe(0);
  });

  test('şube rolü KDV ayarını değiştiremez', async () => {
    expect(
      await hataBekle(() =>
        db.calistir('select urun_kategorileri_kaydet($1::jsonb)', [
          JSON.stringify([{ ad: 'Optik Cam', kdv: 1 }])
        ])
      )
    ).toMatch(/yetkiniz yok/i);
  });
});

describe('kredi kartı komisyonu', () => {
  beforeEach(async () => {
    await db.oturumAc(k.uid.finans);
    await db.calistir('select kk_komisyon_kaydet($1::jsonb)', [
      JSON.stringify([
        { banka: '', taksit: 'Tek çekim', oran: 3.5 },
        { banka: '', taksit: '6 Taksit', oran: 14.49 },
        { banka: '', taksit: 'Diğer', oran: 12 },
        { banka: 'Garanti', taksit: 'Tek çekim', oran: 2.9 },
        { banka: 'Garanti', taksit: '6 Taksit', oran: 13.1 }
      ])
    ]);
  });

  test('bankanın kendi oranı varsayılanı ezer', async () => {
    const o = async (banka, taksit) =>
      Number((await db.tek('select komisyon_orani($1, $2, $3) as o', [k.isletme, banka, taksit])).o);
    expect(await o('Garanti', 'Tek çekim')).toBe(2.9);
    expect(await o('Garanti', '6 Taksit')).toBe(13.1);
    /* Bankaya özel oran yoksa varsayılan satır */
    expect(await o('Akbank', 'Tek çekim')).toBe(3.5);
    expect(await o('Akbank', '6 Taksit')).toBe(14.49);
    /* Hiç tanımlı olmayan taksit */
    expect(await o('Akbank', '12 Taksit')).toBe(0);
  });

  test('ayar paketi banka × taksit matrisi döner', async () => {
    const a = (await db.tek('select ayar_paketi() as a')).a;
    expect(a.kkKomisyon['']['Tek çekim']).toBe(3.5);
    expect(a.kkKomisyon['Garanti']['Tek çekim']).toBe(2.9);
    expect(Object.keys(a.kkKomisyon).sort()).toEqual(['', 'Garanti']);
  });

  test('kaydetme listeyi tamamen değiştirir', async () => {
    await db.calistir('select kk_komisyon_kaydet($1::jsonb)', [
      JSON.stringify([{ banka: '', taksit: 'Tek çekim', oran: 4 }])
    ]);
    const a = (await db.tek('select ayar_paketi() as a')).a;
    expect(a.kkKomisyon).toEqual({ '': { 'Tek çekim': 4 } });
  });

  test('şube rolü komisyon oranı giremez', async () => {
    await db.oturumAc(k.uid.personel);
    expect(
      await hataBekle(() =>
        db.calistir('select kk_komisyon_kaydet($1::jsonb)', [
          JSON.stringify([{ banka: '', taksit: 'Tek çekim', oran: 0 }])
        ])
      )
    ).toMatch(/yetkiniz yok/i);
  });

  test('oran 0-100 aralığına sıkıştırılır', async () => {
    await db.calistir('select kk_komisyon_kaydet($1::jsonb)', [
      JSON.stringify([
        { banka: '', taksit: 'Tek çekim', oran: -5 },
        { banka: '', taksit: '2 Taksit', oran: 500 }
      ])
    ]);
    const a = (await db.tek('select ayar_paketi() as a')).a;
    expect(a.kkKomisyon['']['Tek çekim']).toBe(0);
    expect(a.kkKomisyon['']['2 Taksit']).toBe(100);
  });
});

describe('personel primi', () => {
  beforeEach(async () => {
    await db.oturumAc(k.uid.finans);
    await db.calistir(`select ayar_guncelle('personel_prim', '4.5')`);
    await db.calistir('select personel_kaydet($1::jsonb)', [
      JSON.stringify([
        { ad: 'Elif', aktif: true, primMuaf: false, primOrani: 3 },
        { ad: 'Burak', aktif: true, primMuaf: false, primOrani: '' },
        { ad: 'Patron', aktif: true, primMuaf: true }
      ])
    ]);
  });

  test('kişiye özel oran, varsayılan ve muafiyet', async () => {
    const p = async (ad) => Number((await db.tek('select prim_orani($1, $2) as o', [k.isletme, ad])).o);
    expect(await p('Elif')).toBe(3);
    expect(await p('Burak')).toBe(4.5); /* varsayılan */
    expect(await p('Patron')).toBe(0); /* muaf */
    expect(await p('Listede Yok')).toBe(4.5);
  });

  test('varsayılan oran değişince kişiye özel oran etkilenmez', async () => {
    await db.calistir(`select ayar_guncelle('personel_prim', '6')`);
    const p = async (ad) => Number((await db.tek('select prim_orani($1, $2) as o', [k.isletme, ad])).o);
    expect(await p('Elif')).toBe(3);
    expect(await p('Burak')).toBe(6);
  });

  test('prim oranı tum_veri ile arayüze gider', async () => {
    const v = (await db.tek('select tum_veri() as v')).v;
    const elif = v.personel.filter((x) => x.ad === 'Elif')[0];
    const burak = v.personel.filter((x) => x.ad === 'Burak')[0];
    expect(Number(elif.primOrani)).toBe(3);
    expect(burak.primOrani).toBeNull();
    expect(v.ayar.personelPrim).toBe(4.5);
  });

  test('şube rolü personel listesini ve primi değiştiremez', async () => {
    await db.oturumAc(k.uid.personel);
    expect(
      await hataBekle(() =>
        db.calistir('select personel_kaydet($1::jsonb)', [JSON.stringify([{ ad: 'Sahte', primOrani: 50 }])])
      )
    ).toMatch(/yetkiniz yok/i);
  });
});

describe('oranlar işletmeye özeldir', () => {
  test('bir işletmenin oranları diğerini etkilemez', async () => {
    const b = await db.kiraciKur({ onEk: 'or2', ad: 'İkinci Optik', subeKod: 'IK' });

    await db.oturumAc(k.uid.finans);
    await db.calistir(`select ayar_guncelle('kdv_modu', 'haric')`);
    await db.calistir(`select ayar_guncelle('personel_prim', '9')`);
    await db.calistir('select kk_komisyon_kaydet($1::jsonb)', [
      JSON.stringify([{ banka: 'Garanti', taksit: 'Tek çekim', oran: 1.5 }])
    ]);
    await db.calistir('select urun_kategorileri_kaydet($1::jsonb)', [
      JSON.stringify([{ ad: 'Optik Cam', kdv: 1, aktif: true }])
    ]);

    await db.oturumAc(b.uid.finans);
    const a = (await db.tek('select ayar_paketi() as a')).a;
    expect(a.kdvModu).toBe('dahil');
    expect(a.personelPrim).toBe(0);
    expect(a.kkKomisyon['Garanti']).toBeUndefined();
    const kat = await db.sor(`select kdv::float8 as kdv from urun_kategorileri where ad = 'Optik Cam'`);
    expect(kat[0].kdv).toBe(10);
  });
});
