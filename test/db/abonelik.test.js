/**
 * ABONELİK KAPISI ve PLAN LİMİTLERİ.
 *
 * SaaS'ta para ile veri arasındaki ilişki koddan değil veritabanından
 * geçer. Burada iki şey sınanır:
 *   · Süresi dolan abonelik SALT OKUNUR olur — müşteri verisini görmeye ve
 *     dışa aktarmaya devam eder, yeni kayıt giremez. (Veriyi rehin almak
 *     yok; KVKK taşınabilirlik hakkı da bunu gerektirir.)
 *   · Plan limitleri (kullanıcı, şube) veritabanında uygulanır.
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
  k = await db.kiraciKur({ onEk: 'ab', ad: 'Deneme Optik', subeKod: 'DN' });
  await db.oturumAc(k.uid.magaza);
});

function siparis(ek) {
  return JSON.stringify(
    Object.assign(
      {
        siparisTarihi: '2026-10-01',
        adSoyad: 'Ayşe Yılmaz',
        personel: 'Ali Veli',
        urunler: [{ marka: 'Seiko', kategori: 'Optik Cam', urun: 'A', adet: 1, fiyat: 1000 }],
        odemeler: [],
        recete: {}
      },
      ek || {}
    )
  );
}

async function kaydet(ek) {
  return db.tek('select siparis_kaydet($1::jsonb, $2) as s', [siparis(ek), 'Ali Veli']);
}

describe('deneme süresi', () => {
  test('yeni işletme 14 günlük denemeyle başlar ve yazabilir', async () => {
    const o = (await db.tek('select abonelik_ozeti() as o')).o;
    expect(o.durum).toBe('deneme');
    expect(o.plan).toBe('deneme');
    expect(Number(o.kalanGun)).toBe(14);
    expect(o.yazabilir).toBe(true);
    expect((await kaydet()).s.no).toMatch(/^DN-/);
  });

  test('deneme bitince yazma kapanır, okuma açık kalır', async () => {
    const ilk = await kaydet();
    await db.abonelikAyarla(k.isletme, { denemeBitis: '2020-01-01' });
    await db.oturumAc(k.uid.magaza);

    const o = (await db.tek('select abonelik_ozeti() as o')).o;
    expect(o.yazabilir).toBe(false);
    expect(Number(o.kalanGun)).toBe(0);

    /* Yazma kapalı */
    expect(await hataBekle(() => kaydet({ adSoyad: 'Yeni Müşteri' }))).toMatch(/Aboneliğiniz/);
    expect(
      await hataBekle(() =>
        db.calistir('select siparis_odeme_ekle($1, $2::jsonb, $3)', [
          ilk.s.id,
          JSON.stringify({ tutar: 100, tarih: '2026-10-02' }),
          'Ali Veli'
        ])
      )
    ).toMatch(/Aboneliğiniz/);
    expect(await hataBekle(() => db.calistir(`select magaza_masraf_ekle('Kargo', 50)`))).toMatch(
      /Aboneliğiniz/
    );

    /* Okuma ve dışa aktarma açık */
    const v = (await db.tek('select tum_veri() as v')).v;
    expect(v.siparis).toHaveLength(1);
    await db.oturumAc(k.uid.sahip);
    const d = (await db.tek('select isletme_verisi_aktar() as d')).d;
    expect(d.siparisler).toHaveLength(1);
  });

  test('askıya alınmış işletme de salt okunur', async () => {
    await kaydet();
    await db.abonelikAyarla(k.isletme, { durum: 'askida' });
    await db.oturumAc(k.uid.magaza);
    expect((await db.tek('select abonelik_ozeti() as o')).o.yazabilir).toBe(false);
    expect(await hataBekle(() => kaydet({ adSoyad: 'X' }))).toMatch(/Aboneliğiniz/);
    expect((await db.tek('select tum_veri() as v')).v.siparis).toHaveLength(1);
  });

  test('ödeme bekleyen işletme yazmaya devam eder (ödeme hatırlatma dönemi)', async () => {
    await db.abonelikAyarla(k.isletme, { durum: 'odeme_bekliyor' });
    await db.oturumAc(k.uid.magaza);
    expect((await db.tek('select abonelik_ozeti() as o')).o.yazabilir).toBe(true);
    expect((await kaydet()).s.no).toBeTruthy();
  });

  test('aktif abonelik bitiş tarihi geçmişse yazma kapanır', async () => {
    await db.abonelikAyarla(k.isletme, {
      durum: 'aktif',
      plan: 'temel',
      abonelikBitis: '2020-01-01'
    });
    await db.oturumAc(k.uid.magaza);
    expect((await db.tek('select abonelik_ozeti() as o')).o.yazabilir).toBe(false);
  });

  test('yenilenen abonelikte yazma geri açılır', async () => {
    await db.abonelikAyarla(k.isletme, { denemeBitis: '2020-01-01' });
    await db.oturumAc(k.uid.magaza);
    expect(await hataBekle(() => kaydet())).toMatch(/Aboneliğiniz/);
    await db.abonelikAyarla(k.isletme, {
      durum: 'aktif',
      plan: 'temel',
      abonelikBitis: '2030-01-01'
    });
    await db.oturumAc(k.uid.magaza);
    expect((await kaydet()).s.no).toBeTruthy();
  });

  test('abonelikleri_denetle eski denemeleri askıya alır', async () => {
    await db.abonelikAyarla(k.isletme, { denemeBitis: '2020-01-01' });
    await db.sistem();
    const n = (await db.tek('select abonelikleri_denetle() as n')).n;
    expect(Number(n)).toBe(1);
    const i = await db.tek('select durum::text as durum from isletmeler where id = $1', [k.isletme]);
    expect(i.durum).toBe('askida');
  });
});

describe('plan limitleri', () => {
  test('deneme planı 3 kullanıcıyla sınırlı', async () => {
    await db.kullaniciOlustur('ab-dort@ornek.com');
    await db.oturumAc(k.uid.sahip);
    /* sahip + muhasebe + magaza = 3, dördüncü reddedilir */
    expect(
      await hataBekle(() =>
        db.calistir(`select profil_olustur('ab-dort@ornek.com', 'Dördüncü', 'muhasebe', null)`)
      )
    ).toMatch(/en fazla 3 kullanıcı/);
  });

  test('pasife alınan kullanıcı limitten düşer', async () => {
    await db.kullaniciOlustur('ab-dort@ornek.com');
    await db.oturumAc(k.uid.sahip);
    await db.calistir(`select kullanici_durum_degistir('ab-muhasebe@ornek.com', false)`);
    expect(
      (await db.tek(`select profil_olustur('ab-dort@ornek.com', 'Dördüncü', 'muhasebe', null) as ok`)).ok
    ).toBe(true);
  });

  test('deneme planı tek şube; Pro üçe çıkarır', async () => {
    await db.oturumAc(k.uid.sahip);
    expect(await hataBekle(() => db.calistir(`select magaza_ekle('İkinci', 'IK')`))).toMatch(
      /en fazla 1 şube/
    );
    await db.abonelikAyarla(k.isletme, { plan: 'pro' });
    await db.oturumAc(k.uid.sahip);
    expect((await db.tek(`select magaza_ekle('İkinci', 'IK') as m`)).m.kod).toBe('IK');
    expect(Number((await db.tek('select abonelik_ozeti() as o')).o.magazaSayisi)).toBe(2);
  });

  test('şube kodu sipariş numarasında kullanılır, biçimi doğrulanır', async () => {
    await db.abonelikAyarla(k.isletme, { plan: 'pro' });
    await db.oturumAc(k.uid.sahip);
    expect(await hataBekle(() => db.calistir(`select magaza_ekle('Hatalı', 'çok uzun kod')`))).toMatch(
      /1-6 harf/
    );
  });

  test('süresi dolan işletme yeni kullanıcı/şube ekleyemez', async () => {
    await db.abonelikAyarla(k.isletme, { plan: 'pro', denemeBitis: '2020-01-01' });
    await db.kullaniciOlustur('ab-yeni@ornek.com');
    await db.oturumAc(k.uid.sahip);
    expect(
      await hataBekle(() =>
        db.calistir(`select profil_olustur('ab-yeni@ornek.com', 'Yeni', 'muhasebe', null)`)
      )
    ).toMatch(/Aboneliğiniz/);
    expect(await hataBekle(() => db.calistir(`select magaza_ekle('İkinci', 'IK')`))).toMatch(/Aboneliğiniz/);
  });
});

describe('kayıt (onboarding)', () => {
  test('aynı isimde ikinci işletme benzersiz slug alır', async () => {
    const b = await db.kiraciKur({ onEk: 'x', ad: 'Deneme Optik', subeKod: 'D2' });
    expect(b.ozet.slug).toBe('deneme-optik-1');
    expect(k.ozet.slug).toBe('deneme-optik');
  });

  test('zaten bir işletmeye bağlı kullanıcı ikinci işletme kuramaz', async () => {
    await db.oturumAc(k.uid.sahip);
    expect(await hataBekle(() => db.calistir(`select isletme_olustur('İkinci İşletme')`))).toMatch(
      /zaten bir işletmeye bağlı/i
    );
  });

  test('işletme adı boş olamaz', async () => {
    const uid = await db.kullaniciOlustur('ab-bos@ornek.com');
    await db.oturumAc(uid);
    expect(await hataBekle(() => db.calistir(`select isletme_olustur('   ')`))).toMatch(
      /İşletme adı gerekli/
    );
  });

  test('kurulumda şube kodu verilmezse addan üretilir', async () => {
    const uid = await db.kullaniciOlustur('ab-kodsuz@ornek.com');
    await db.oturumAc(uid);
    await db.calistir(`select isletme_olustur('Şahin Optik', 'Ali', '', '', '')`);
    const m = await db.tek(`select kod from magazalar where ad = 'Şahin Optik'`);
    expect(m.kod).toBe('SA');
  });

  test('sahip rolü elle atanamaz', async () => {
    await db.kullaniciOlustur('ab-sahte@ornek.com');
    await db.oturumAc(k.uid.sahip);
    expect(
      await hataBekle(() =>
        db.calistir(`select profil_olustur('ab-sahte@ornek.com', 'Sahte Sahip', 'sahip', null)`)
      )
    ).toMatch(/Sahip rolü/);
  });

  test('kurumsal bilgiler güncellenir, ticari alanlar korunur', async () => {
    await db.oturumAc(k.uid.sahip);
    const o = (
      await db.tek('select isletme_guncelle($1::jsonb) as o', [
        JSON.stringify({
          ad: 'Deneme Optik A.Ş.',
          telefon: '0212 000 00 00',
          vergiNo: '1234567890',
          plan: 'zincir',
          durum: 'aktif'
        })
      ])
    ).o;
    expect(o.ad).toBe('Deneme Optik A.Ş.');
    expect(o.plan).toBe('deneme'); /* ticari alan değişmedi */
    expect(o.durum).toBe('deneme');
  });
});
