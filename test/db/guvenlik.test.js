/**
 * RLS politikaları: yetki artık arayüzde değil veritabanında.
 *
 * Bu testler gerçek Postgres'te 'authenticated' rolüyle çalışır — yani
 * tarayıcıdan gelen istekle aynı koşullarda. Arayüzü atlayıp doğrudan
 * sorgu atan biri de bu sınırlara takılır.
 */
const { veritabaniKur, hataBekle } = require('./harness');

jest.setTimeout(30000);

let db, magazaA, magazaB;
let magazaUid, magazaBUid, muhasebeUid, yoneticiUid, profilsizUid, pasifUid;

beforeAll(async () => {
  db = await veritabaniKur();
  magazaUid = await db.kullaniciOlustur('magaza@ornek.com');
  magazaBUid = await db.kullaniciOlustur('sube2@ornek.com');
  muhasebeUid = await db.kullaniciOlustur('muhasebe@ornek.com');
  yoneticiUid = await db.kullaniciOlustur('yonetici@ornek.com');
  profilsizUid = await db.kullaniciOlustur('profilsiz@ornek.com');
  pasifUid = await db.kullaniciOlustur('pasif@ornek.com');
});

afterAll(async () => {
  if (db) await db.kapat();
});

beforeEach(async () => {
  await db.sifirla();
  await db.sistem();
  magazaA = await db.magazaId('DK');
  magazaB = (await db.tek("insert into magazalar (ad, kod) values ('İkinci Şube', 'IK') returning id")).id;

  await db.profilAta(magazaUid, 'Atrium Mağaza', 'magaza', magazaA);
  await db.profilAta(magazaBUid, 'İkinci Şube', 'magaza', magazaB);
  await db.profilAta(muhasebeUid, 'Muhasebe', 'muhasebe', null);
  await db.profilAta(yoneticiUid, 'Yönetici', 'yonetici', null);
  await db.profilAta(pasifUid, 'Pasif Kullanıcı', 'muhasebe', null);
  await db.sistem();
  await db.calistir('update profiller set aktif = false where id = $1', [pasifUid]);

  /* A şubesinde tahsilatlı bir sipariş + bir mağaza masrafı */
  await db.oturumAc(magazaUid);
  const s = await db.tek(
    `insert into siparisler (magaza_id, siparis_tarihi, personel_adi, ad_soyad, olusturan_personel)
     values ($1, '2026-10-01', 'Sema İpek', 'Ayşe Yılmaz', 'Sema İpek') returning id`,
    [magazaA]
  );
  await db.calistir(
    `insert into odemeler (siparis_id, tarih, tutar, yontem) values ($1, '2026-10-01', 4000, 'nakit')`,
    [s.id]
  );
  await db.calistir(`select magaza_masraf_ekle('Kargo', 500, '2026-10-01', null, '', 'Nursu')`);

  /* B şubesinde bir sipariş */
  await db.oturumAc(magazaBUid);
  await db.calistir(
    `insert into siparisler (magaza_id, siparis_tarihi, ad_soyad) values ($1, '2026-10-01', 'Başka Müşteri')`,
    [magazaB]
  );
});

describe('mağaza rolü', () => {
  beforeEach(() => db.oturumAc(magazaUid));

  test('kasa hareketlerinin tamamını göremez, yalnızca kendi masrafını görür', async () => {
    const h = await db.sor('select kaynak::text as kaynak, tutar::float8 as tutar from hareketler');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ kaynak: 'MAGAZA_MASRAF', tutar: 500 });
  });

  test('kasaya elle hareket ekleyemez', async () => {
    await db.sistem();
    const hesap = await db.tek(`select id from hesaplar where ad = 'Nakit Kasa'`);
    await db.oturumAc(magazaUid);
    const hata = await hataBekle(() =>
      db.calistir(
        `insert into hareketler (magaza_id, tarih, yon, ana_kategori, tutar, hesap_id, kaynak)
         values ($1, '2026-10-01', 'GIDER', 'Personel & SGK', 50000, $2, 'ELLE')`,
        [magazaA, hesap.id]
      )
    );
    expect(hata).toMatch(/row-level security/i);
  });

  test('kendi masraf hareketini elle güncelleyemez (sadece fonksiyonla siler)', async () => {
    const r = await db.calistir(`update hareketler set tutar = 1 where kaynak = 'MAGAZA_MASRAF'`);
    expect(r.affectedRows).toBe(0);
  });

  test('başka şubenin siparişini göremez', async () => {
    const r = await db.sor('select ad_soyad from siparisler');
    expect(r).toHaveLength(1);
    expect(r[0].ad_soyad).toBe('Ayşe Yılmaz');
  });

  test('başka şubeye sipariş yazamaz', async () => {
    const hata = await hataBekle(() =>
      db.calistir(
        `insert into siparisler (magaza_id, siparis_tarihi, ad_soyad)
         values ($1, '2026-10-01', 'Sızma Denemesi')`,
        [magazaB]
      )
    );
    expect(hata).toMatch(/row-level security/i);
  });

  test('siparişi kalıcı silemez (çöp kutusu kullanır)', async () => {
    const r = await db.calistir('delete from siparisler');
    expect(r.affectedRows).toBe(0);
    await db.oturumAc(magazaUid);
    const kalan = await db.sor('select id from siparisler');
    expect(kalan).toHaveLength(1);
  });

  test('siparişi çöp kutusuna taşıyabilir', async () => {
    const r = await db.calistir('update siparisler set silindi = true');
    expect(r.affectedRows).toBe(1);
  });

  test('ayarları değiştiremez', async () => {
    const r = await db.calistir(`update ayarlar set deger = '0' where anahtar = 'personel_prim'`);
    expect(r.affectedRows).toBe(0);
  });

  test('personel listesini okur ama değiştiremez', async () => {
    expect((await db.sor('select ad from personel')).length).toBeGreaterThan(0);
    const hata = await hataBekle(() =>
      db.calistir(`insert into personel (magaza_id, ad) values ($1, 'Sahte Personel')`, [magazaA])
    );
    expect(hata).toMatch(/row-level security/i);
  });

  test('hedefi görür ama belirleyemez', async () => {
    await db.oturumAc(muhasebeUid);
    await db.calistir(`insert into hedefler (magaza_id, ay, hedef) values ($1, '2026-10', 500000)`, [
      magazaA
    ]);
    await db.oturumAc(magazaUid);
    expect((await db.sor('select hedef from hedefler')).length).toBe(1);
    const hata = await hataBekle(() =>
      db.calistir(`insert into hedefler (magaza_id, ay, hedef) values ($1, '2026-11', 1)`, [magazaA])
    );
    expect(hata).toMatch(/row-level security/i);
  });

  test('planlanan ödeme / banka / tekrarlayan verisini göremez', async () => {
    await db.oturumAc(muhasebeUid);
    await db.calistir(
      `insert into cari_plan (tedarikci, ay, planlanan) values ('Merve Optik', '2026-10', 50000)`
    );
    await db.oturumAc(magazaUid);
    expect(await db.sor('select * from cari_plan')).toHaveLength(0);
  });

  test('değişiklik günlüğünü göremez', async () => {
    expect(await db.sor('select * from log')).toHaveLength(0);
  });

  test('sipariş numarası sayacına erişemez', async () => {
    const hata = await hataBekle(() => db.calistir('select * from siparis_sayaclari'));
    expect(hata).toMatch(/permission denied|izin/i);
  });

  test('sipariş numarası üretme fonksiyonunu doğrudan çağıramaz', async () => {
    const hata = await hataBekle(() =>
      db.calistir('select siparis_no_uret($1, $2)', [magazaA, '2026-10-01'])
    );
    expect(hata).toMatch(/permission denied|izin/i);
  });

  test('başka şubenin masrafını silemez', async () => {
    await db.oturumAc(magazaBUid);
    const r = await db.tek(
      `select magaza_masraf_sil(h.id) as ok from hareketler h where h.kaynak = 'MAGAZA_MASRAF' limit 1`
    );
    /* Kendi şubesinde masraf yok; A şubesinin kaydını hiç göremez */
    expect(r).toBeNull();
  });
});

describe('muhasebe rolü', () => {
  beforeEach(() => db.oturumAc(muhasebeUid));

  test('tüm şubelerin siparişlerini görür', async () => {
    const r = await db.sor('select ad_soyad from siparisler order by ad_soyad');
    expect(r.map((x) => x.ad_soyad)).toEqual(['Ayşe Yılmaz', 'Başka Müşteri']);
  });

  test('tüm kasa hareketlerini görür', async () => {
    const r = await db.sor('select kaynak::text as kaynak from hareketler order by kaynak');
    expect(r.map((x) => x.kaynak)).toEqual(['MAGAZA_MASRAF', 'SIPARIS']);
  });

  test('kasaya elle hareket ekleyebilir', async () => {
    const hesap = await db.tek(`select id from hesaplar where ad = 'Nakit Kasa'`);
    await db.calistir(
      `insert into hareketler (magaza_id, tarih, yon, ana_kategori, alt_kategori, tutar, hesap_id)
       values ($1, '2026-10-01', 'GIDER', 'Kira & Aidat', 'Kira', 15000, $2)`,
      [magazaA, hesap.id]
    );
    expect(await db.sor(`select * from hareketler where ana_kategori = 'Kira & Aidat'`)).toHaveLength(1);
  });

  test('sipariş tahsilatından doğan hareketi elle değiştiremez veya silemez', async () => {
    const g = await db.calistir(`update hareketler set tutar = 1 where kaynak = 'SIPARIS'`);
    expect(g.affectedRows).toBe(0);
    const s = await db.calistir(`delete from hareketler where kaynak = 'SIPARIS'`);
    expect(s.affectedRows).toBe(0);
  });

  test('kullanıcı rolü değiştiremez (yönetici işi)', async () => {
    const r = await db.calistir(`update profiller set rol = 'yonetici' where id = $1`, [magazaUid]);
    expect(r.affectedRows).toBe(0);
  });

  test('ayar değiştiremez', async () => {
    const r = await db.calistir(`update ayarlar set deger = '0' where anahtar = 'personel_prim'`);
    expect(r.affectedRows).toBe(0);
  });

  test('siparişi kalıcı silebilir', async () => {
    const r = await db.calistir(`delete from siparisler where ad_soyad = 'Ayşe Yılmaz'`);
    expect(r.affectedRows).toBe(1);
  });
});

describe('yönetici rolü', () => {
  beforeEach(() => db.oturumAc(yoneticiUid));

  test('ayarları değiştirebilir', async () => {
    const r = await db.calistir(`update ayarlar set deger = '5' where anahtar = 'personel_prim'`);
    expect(r.affectedRows).toBe(1);
  });

  test('kullanıcı rolü atayabilir', async () => {
    const r = await db.calistir(`update profiller set rol = 'muhasebe' where id = $1`, [magazaUid]);
    expect(r.affectedRows).toBe(1);
  });

  test('yeni şube açabilir', async () => {
    await db.calistir(`insert into magazalar (ad, kod) values ('Üçüncü Şube', 'UC')`);
    expect(await db.sor('select * from magazalar')).toHaveLength(3);
  });
});

describe('yetkisiz oturumlar', () => {
  test('profili olmayan kullanıcı hiçbir veri göremez', async () => {
    await db.oturumAc(profilsizUid);
    expect(await db.sor('select * from siparisler')).toHaveLength(0);
    expect(await db.sor('select * from hareketler')).toHaveLength(0);
    expect(await db.sor('select * from musteriler')).toHaveLength(0);
  });

  test('pasif kullanıcı hiçbir veri göremez', async () => {
    await db.oturumAc(pasifUid);
    expect(await db.sor('select * from siparisler')).toHaveLength(0);
    expect(await db.sor('select * from hareketler')).toHaveLength(0);
  });

  test('profilsiz kullanıcı masraf ekleyemez', async () => {
    await db.oturumAc(profilsizUid);
    const hata = await hataBekle(() => db.calistir(`select magaza_masraf_ekle('Kargo', 100)`));
    expect(hata).toMatch(/Yetkisiz/);
  });

  test('profilsiz kullanıcı kasa özeti alamaz', async () => {
    await db.oturumAc(profilsizUid);
    const hata = await hataBekle(() => db.calistir(`select kasa_ozeti('gun', '2026-10-01')`));
    expect(hata).toMatch(/Yetkisiz/);
  });

  test('oturumsuz (anon) istek veri göremez', async () => {
    await db.sistem();
    await db.db.exec("set app.uid = ''; set role anon;");
    const hata = await hataBekle(() => db.calistir('select * from siparisler'));
    await db.sistem();
    expect(hata).toMatch(/permission denied|izin/i);
  });
});
