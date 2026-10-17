/**
 * KİRACI İZOLASYONU — bu dosya ürünün can damarı.
 *
 * Kuzmos farklı optik işletmelerine satıldığı için en büyük risk, bir
 * işletmenin başka bir işletmenin verisini görmesi ya da ona yazmasıdır.
 * Testler gerçek Postgres'te 'authenticated' rolüyle, yani tarayıcıdan
 * gelen istekle aynı koşullarda çalışır: arayüzü atlayıp doğrudan sorgu
 * atan biri de aynı sınırlara takılır.
 *
 * Her tablo ayrı ayrı sınanır — birinde politika eksik kalsa test kırılır.
 */
const { veritabaniKur, hataBekle } = require('./harness');

jest.setTimeout(45000);

let db, A, B;

beforeAll(async () => {
  db = await veritabaniKur();
});

afterAll(async () => {
  if (db) await db.kapat();
});

/** Bir işletmede tam veri seti üretir (sipariş, müşteri, kasa, hedef...). */
async function veriUret(k, etiket) {
  await db.oturumAc(k.uid.magaza);
  const s = (
    await db.tek('select siparis_kaydet($1::jsonb, $2) as s', [
      JSON.stringify({
        siparisTarihi: '2026-10-01',
        personel: etiket + ' Personeli',
        adSoyad: etiket + ' Müşterisi',
        telefon: etiket === 'A' ? '0532 111 11 11' : '0532 222 22 22',
        urunler: [{ marka: 'Seiko', kategori: 'Optik Cam', urun: etiket, adet: 1, fiyat: 5000 }],
        odemeler: [{ tutar: 3000, tarih: '2026-10-01', yontem: 'nakit' }],
        recete: {}
      }),
      etiket + ' Personeli'
    ])
  ).s;
  await db.calistir(`select magaza_masraf_ekle('Kargo', 250, '2026-10-01', null, $1, $2)`, [
    etiket + ' masrafı',
    etiket + ' Personeli'
  ]);
  await db.oturumAc(k.uid.muhasebe);
  await db.calistir(`select hedef_kaydet('2026-10', 100000, $1)`, [etiket + ' hedefi']);
  await db.calistir(`select cari_kaydet($1, '2026-10', 5000, '')`, [etiket + ' Tedarikçi']);
  await db.calistir('select hareket_kaydet($1::jsonb)', [
    JSON.stringify({
      tarih: '2026-10-01',
      yon: 'GIDER',
      ana: 'Kira & Aidat',
      alt: 'Kira',
      tutar: 10000,
      hesap: 'Nakit Kasa',
      aciklama: etiket + ' kirası'
    })
  ]);
  await db.calistir(`select tekrar_kaydet($1::jsonb)`, [
    JSON.stringify([{ ad: etiket + ' aboneliği', ana: 'Fatura & Abonelik', tutar: 100, gun: 1 }])
  ]);
  return s;
}

beforeEach(async () => {
  await db.sifirla();
  A = await db.kiraciKur({ onEk: 'a', ad: 'A Optik', subeKod: 'AA' });
  B = await db.kiraciKur({ onEk: 'b', ad: 'B Gözlük', subeKod: 'BB' });
  await veriUret(A, 'A');
  await veriUret(B, 'B');
});

describe('okuma izolasyonu', () => {
  const tablolar = [
    ['siparisler', 'ad_soyad'],
    ['musteriler', 'ad_soyad'],
    ['hareketler', 'aciklama'],
    ['hedefler', 'notu'],
    ['cari_plan', 'tedarikci'],
    ['tekrarlayan', 'ad'],
    ['personel', 'ad'],
    ['magazalar', 'ad'],
    ['hesaplar', 'ad'],
    ['urun_kategorileri', 'ad'],
    ['markalar', 'ad'],
    ['kasa_kategorileri', 'ana'],
    ['ayarlar', 'anahtar'],
    ['profiller', 'eposta'],
    ['log', 'islem']
  ];

  test.each(tablolar)('%s tablosunda yalnızca kendi işletmesinin satırları görünür', async (tablo) => {
    await db.oturumAc(A.uid.sahip);
    const a = await db.sor('select isletme_id from ' + tablo);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((r) => r.isletme_id === A.isletme)).toBe(true);

    await db.oturumAc(B.uid.sahip);
    const b = await db.sor('select isletme_id from ' + tablo);
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((r) => r.isletme_id === B.isletme)).toBe(true);
  });

  test('sipariş ürünleri ve ödemeleri de sızmaz', async () => {
    await db.oturumAc(A.uid.sahip);
    const u = await db.sor('select urun from siparis_urunleri');
    expect(u.map((x) => x.urun)).toEqual(['A']);
    const o = await db.sor('select tutar::float8 as tutar from odemeler');
    expect(o).toHaveLength(1);
  });

  test('görünümler de kiracı kapsamlıdır', async () => {
    await db.oturumAc(A.uid.sahip);
    expect(await db.sor('select id from v_siparisler')).toHaveLength(1);
    expect(await db.sor('select tarih from v_gunluk_tahsilat')).toHaveLength(1);
    expect(await db.sor('select id from v_magaza_masraflari')).toHaveLength(1);
    expect(await db.sor('select personel from v_personel_tahsilat')).toHaveLength(1);
  });

  test('tum_veri() yalnızca kendi işletmesini döner', async () => {
    await db.oturumAc(A.uid.sahip);
    const v = (await db.tek('select tum_veri() as v')).v;
    expect(v.isletme.ad).toBe('A Optik');
    expect(v.siparis).toHaveLength(1);
    expect(v.siparis[0].adSoyad).toBe('A Müşterisi');
    expect(v.musteriler).toHaveLength(1);
    expect(v.hareketler.map((h) => h.aciklama).join(' ')).not.toMatch(/B /);
    expect(v.magazalar).toHaveLength(1);
    expect(v.magazalar[0].kod).toBe('AA');
  });

  test('kasa özeti başka işletmenin tahsilatını toplamaz', async () => {
    await db.oturumAc(A.uid.sahip);
    const o = (await db.tek(`select kasa_ozeti('gun', '2026-10-01') as o`)).o;
    expect(Number(o.satis.nakit)).toBe(3000);
    expect(Number(o.masrafToplam)).toBe(250);
  });

  test('günlük (log) başka işletmenin işlemlerini göstermez', async () => {
    await db.oturumAc(A.uid.sahip);
    const l = (await db.tek('select log_listele(500) as l')).l;
    expect(l.length).toBeGreaterThan(0);
    expect(JSON.stringify(l)).not.toMatch(/B Müşterisi|B masrafı/);
  });

  test('veri aktarımı (KVKK) yalnızca kendi verisini içerir', async () => {
    await db.oturumAc(A.uid.sahip);
    const d = (await db.tek('select isletme_verisi_aktar() as d')).d;
    expect(d.isletme.ad).toBe('A Optik');
    expect(d.siparisler).toHaveLength(1);
    expect(JSON.stringify(d)).not.toMatch(/B Optik|B Gözlük|B Müşterisi/);
  });
});

describe('yazma izolasyonu', () => {
  test('başka işletmenin şubesine sipariş yazılamaz', async () => {
    await db.oturumAc(A.uid.magaza);
    const hata = await hataBekle(() =>
      db.calistir(
        `insert into siparisler (magaza_id, siparis_tarihi, ad_soyad)
         values ($1, '2026-10-01', 'Sızma')`,
        [B.magaza]
      )
    );
    expect(hata).toMatch(/row-level security/i);
  });

  test('siparis_kaydet başka işletmenin şubesini kabul etmez, kendi şubesine yazar', async () => {
    await db.oturumAc(A.uid.magaza);
    const s = (
      await db.tek('select siparis_kaydet($1::jsonb, $2) as s', [
        JSON.stringify({
          magazaId: B.magaza,
          siparisTarihi: '2026-10-02',
          adSoyad: 'Yönlendirme Denemesi',
          urunler: [{ urun: 'X', adet: 1, fiyat: 100 }],
          odemeler: [],
          recete: {}
        }),
        'A Personeli'
      ])
    ).s;
    expect(s.magazaId).toBe(A.magaza);
    expect(s.no).toMatch(/^AA-/);
  });

  test('başka işletmenin siparişi güncellenemez ve silinemez', async () => {
    await db.oturumAc(B.uid.sahip);
    const b = await db.tek('select id from siparisler limit 1');
    await db.oturumAc(A.uid.sahip);

    const g = await db.calistir('update siparisler set ad_soyad = $2 where id = $1', [b.id, 'Değiştirildi']);
    expect(g.affectedRows).toBe(0);
    const d = await db.calistir('delete from siparisler where id = $1', [b.id]);
    expect(d.affectedRows).toBe(0);
    expect((await db.tek('select siparis_kalici_sil($1) as ok', [b.id])).ok).toBe(false);
    expect(await hataBekle(() => db.calistir('select siparis_sil($1)', [b.id]))).toMatch(/bulunamadı/i);
  });

  test('başka işletmenin ödemesi silinemez (kasa bozulamaz)', async () => {
    await db.oturumAc(B.uid.sahip);
    const o = await db.tek('select id from odemeler limit 1');
    await db.oturumAc(A.uid.sahip);
    const r = await db.calistir('delete from odemeler where id = $1', [o.id]);
    expect(r.affectedRows).toBe(0);
  });

  test('başka işletmenin ayarı değiştirilemez', async () => {
    await db.oturumAc(A.uid.sahip);
    const r = await db.calistir(
      `update ayarlar set deger = '99' where isletme_id = $1 and anahtar = 'personel_prim'`,
      [B.isletme]
    );
    expect(r.affectedRows).toBe(0);
  });

  test('başka işletmenin masrafı silinemez', async () => {
    await db.oturumAc(B.uid.magaza);
    const m = await db.tek(`select id from v_magaza_masraflari limit 1`);
    await db.oturumAc(A.uid.magaza);
    expect((await db.tek('select magaza_masraf_sil($1) as ok', [m.id])).ok).toBe(false);
  });

  test('başka işletmenin kullanıcısı devralınamaz', async () => {
    await db.oturumAc(A.uid.sahip);
    const hata = await hataBekle(() =>
      db.calistir(`select profil_olustur('b-magaza@ornek.com', 'Kaçırma', 'yonetici', null)`)
    );
    expect(hata).toMatch(/başka bir işletmeye bağlı/i);
  });

  test('başka işletmenin kullanıcısı pasife alınamaz', async () => {
    await db.oturumAc(A.uid.sahip);
    expect(
      await hataBekle(() => db.calistir(`select kullanici_durum_degistir('b-magaza@ornek.com', false)`))
    ).toMatch(/bulunamadı/i);
  });

  test('isletme_id elle gönderilse bile üzerine yazılır', async () => {
    await db.oturumAc(A.uid.muhasebe);
    const hesap = await db.tek(`select id from hesaplar limit 1`);
    await db.calistir(
      `insert into cari_plan (isletme_id, tedarikci, ay, planlanan)
       values ($1, 'Damga Testi', '2026-11', 1)`,
      [B.isletme]
    );
    const r = await db.tek(`select isletme_id from cari_plan where tedarikci = 'Damga Testi'`);
    expect(r.isletme_id).toBe(A.isletme);
    expect(hesap.id).toBeTruthy();
  });

  test('ikinci işletme kendi sipariş numarasını kendi sayacından alır', async () => {
    await db.oturumAc(A.uid.magaza);
    const a = (
      await db.tek('select siparis_kaydet($1::jsonb, $2) as s', [
        JSON.stringify({ siparisTarihi: '2026-11-01', adSoyad: 'A2', urunler: [], odemeler: [], recete: {} }),
        'A Personeli'
      ])
    ).s;
    await db.oturumAc(B.uid.magaza);
    const b = (
      await db.tek('select siparis_kaydet($1::jsonb, $2) as s', [
        JSON.stringify({ siparisTarihi: '2026-11-01', adSoyad: 'B2', urunler: [], odemeler: [], recete: {} }),
        'B Personeli'
      ])
    ).s;
    expect(a.no).toBe('AA-11-26-0001');
    expect(b.no).toBe('BB-11-26-0001');
  });
});

describe('platform yöneticisi sınırları', () => {
  let platformUid;

  beforeEach(async () => {
    platformUid = await db.platformYoneticisiEkle('platform@kuzmos.app');
    await db.oturumAc(platformUid);
  });

  test('abonelik ve kullanım verisini görür', async () => {
    const o = (await db.tek('select platform_ozet() as o')).o;
    expect(Number(o.toplamIsletme)).toBe(2);
    expect(o.isletmeler.map((i) => i.ad).sort()).toEqual(['A Optik', 'B Gözlük']);
    expect(Number(o.isletmeler[0].siparis)).toBeGreaterThan(0);
  });

  test('kiracıların iş verisine erişemez', async () => {
    expect(await db.sor('select id from siparisler')).toHaveLength(0);
    expect(await db.sor('select id from musteriler')).toHaveLength(0);
    expect(await db.sor('select id from hareketler')).toHaveLength(0);
    expect(await db.sor('select id from log')).toHaveLength(0);
  });

  test('aboneliği aktifleştirebilir', async () => {
    const r = (
      await db.tek(`select abonelik_guncelle($1, 'pro', 'aktif', '2027-10-01', 1490, 'elle', 'EFT-1') as r`, [
        A.isletme
      ])
    ).r;
    expect(r.plan).toBe('pro');
    expect(r.durum).toBe('aktif');
    await db.oturumAc(A.uid.sahip);
    const v = (await db.tek('select abonelik_ozeti() as o')).o;
    expect(v.plan).toBe('pro');
    expect(v.yazabilir).toBe(true);
  });

  test('kiracı kendi aboneliğini değiştiremez', async () => {
    await db.oturumAc(A.uid.sahip);
    const r = await db.calistir(
      `update isletmeler set durum = 'aktif', plan_kod = 'zincir', abonelik_bitis = '2030-01-01'
        where id = $1`,
      [A.isletme]
    );
    expect(r.affectedRows).toBe(0);
    expect(
      await hataBekle(() =>
        db.calistir(`select abonelik_guncelle($1, 'zincir', 'aktif', '2030-01-01')`, [A.isletme])
      )
    ).toMatch(/platform yöneticisine/i);
  });

  test('sıradan kullanıcı platform özetini göremez', async () => {
    await db.oturumAc(A.uid.sahip);
    expect(await hataBekle(() => db.calistir('select platform_ozet()'))).toMatch(/platform yöneticisine/i);
  });
});
