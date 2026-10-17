/**
 * Veritabanı mantığı: sipariş numarası, toplamlar, teslim tarihi ve
 * sipariş → kasa senkronu. Bu testler gerçek Postgres'te çalışır.
 */
const { veritabaniKur, hataBekle } = require('./harness');

jest.setTimeout(30000);

let db, magaza, magazaUid, muhasebeUid;

beforeAll(async () => {
  db = await veritabaniKur();
  magazaUid = await db.kullaniciOlustur('magaza@ornek.com');
  muhasebeUid = await db.kullaniciOlustur('muhasebe@ornek.com');
});

afterAll(async () => {
  if (db) await db.kapat();
});

beforeEach(async () => {
  await db.sifirla();
  magaza = await db.magazaId('DK');
  await db.profilAta(magazaUid, 'Atrium Mağaza', 'magaza', magaza);
  await db.profilAta(muhasebeUid, 'Muhasebe', 'muhasebe', null);
  await db.oturumAc(magazaUid);
});

async function siparisEkle(ek) {
  ek = ek || {};
  const s = await db.tek(
    `insert into siparisler (magaza_id, siparis_tarihi, personel_adi, ad_soyad, telefon,
                             tutar, tutar_elle, olusturan_personel)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, no, to_char(siparis_tarihi,'YYYY-MM-DD') as siparis_tarihi`,
    [
      magaza,
      ek.tarih || '2026-10-01',
      ek.personel || 'Sema İpek',
      ek.adSoyad || 'Ayşe Yılmaz',
      ek.telefon || '0532 111 22 33',
      ek.tutar || 0,
      ek.tutarElle === true,
      ek.personel || 'Sema İpek'
    ]
  );
  for (const u of ek.urunler || []) {
    await db.calistir(
      `insert into siparis_urunleri (siparis_id, kategori, marka, urun, adet, birim_fiyat)
       values ($1, $2, $3, $4, $5, $6)`,
      [s.id, u.kategori || '', u.marka || '', u.urun || '', u.adet || 1, u.fiyat || 0]
    );
  }
  for (const o of ek.odemeler || []) {
    await odemeEkle(s.id, o);
  }
  return s;
}

async function odemeEkle(siparisId, o) {
  return db.tek(
    `insert into odemeler (siparis_id, tarih, tutar, yontem, banka, taksit, tip, olusturan_personel)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      siparisId,
      o.tarih || '2026-10-01',
      o.tutar,
      o.yontem || 'nakit',
      o.banka || '',
      o.taksit || '',
      o.tip || 'tahsilat',
      o.personel || 'Sema İpek'
    ]
  );
}

async function siparisOku(id) {
  return db.tek(
    `select no, ara_toplam::float8 as ara_toplam, tutar::float8 as tutar,
            tahsil_edilen::float8 as tahsil_edilen, kalan::float8 as kalan, odendi,
            durum::text as durum,
            to_char(teslim_tarihi,'YYYY-MM-DD') as teslim_tarihi,
            to_char(durum_tarihi,'YYYY-MM-DD') as durum_tarihi
     from v_siparisler where id = $1`,
    [id]
  );
}

async function hareketler() {
  await db.sistem();
  const r = await db.sor(
    `select h.yon::text as yon, h.ana_kategori, h.alt_kategori, h.tutar::float8 as tutar,
            hs.ad as hesap, h.kaynak::text as kaynak, h.silindi, h.kaydeden,
            to_char(h.tarih,'YYYY-MM-DD') as tarih, h.aciklama
     from hareketler h join hesaplar hs on hs.id = h.hesap_id
     order by h.tarih, h.tutar`
  );
  await db.oturumAc(magazaUid);
  return r;
}

describe('sipariş numarası', () => {
  test('DK-AA-YY-0001 biçiminde üretilir ve ay içinde artar', async () => {
    const a = await siparisEkle({ tarih: '2026-10-01' });
    const b = await siparisEkle({ tarih: '2026-10-15' });
    expect(a.no).toBe('DK-10-26-0001');
    expect(b.no).toBe('DK-10-26-0002');
  });

  test('ay değişince sayaç sıfırdan başlar', async () => {
    await siparisEkle({ tarih: '2026-10-01' });
    const kasim = await siparisEkle({ tarih: '2026-11-01' });
    expect(kasim.no).toBe('DK-11-26-0001');
  });

  test('istemci sipariş numarası uydurmaya çalışsa bile sayaç bozulmaz', async () => {
    const a = await db.tek(
      `insert into siparisler (magaza_id, siparis_tarihi, ad_soyad, no)
       values ($1, '2026-10-01', 'Elle No', 'UYDURMA-1') returning no`,
      [magaza]
    );
    expect(a.no).toBe('UYDURMA-1');
    const b = await siparisEkle({ tarih: '2026-10-02' });
    expect(b.no).toBe('DK-10-26-0001');
  });
});

describe('toplamlar', () => {
  test('ara toplam ürün satırlarından hesaplanır', async () => {
    const s = await siparisEkle({
      urunler: [
        { kategori: 'Güneş Gözlüğü', marka: 'Ray-Ban', urun: 'RB3025', adet: 1, fiyat: 6000 },
        { kategori: 'Optik Cam', marka: 'Seiko', urun: 'Superior', adet: 2, fiyat: 2000 }
      ]
    });
    const r = await siparisOku(s.id);
    expect(r.ara_toplam).toBe(10000);
    expect(r.tutar).toBe(10000);
  });

  test('genel toplam elle girilirse indirim korunur', async () => {
    const s = await siparisEkle({
      tutar: 9000,
      tutarElle: true,
      urunler: [{ kategori: 'Optik Cam', urun: 'X', adet: 1, fiyat: 10000 }]
    });
    const r = await siparisOku(s.id);
    expect(r.ara_toplam).toBe(10000);
    expect(r.tutar).toBe(9000);
  });

  test('ürün silinince ara toplam düşer', async () => {
    const s = await siparisEkle({
      urunler: [
        { urun: 'A', adet: 1, fiyat: 1000 },
        { urun: 'B', adet: 1, fiyat: 500 }
      ]
    });
    await db.calistir('delete from siparis_urunleri where siparis_id = $1 and urun = $2', [s.id, 'B']);
    expect((await siparisOku(s.id)).ara_toplam).toBe(1000);
  });

  test('tahsilat ve iade; kalan ve ödendi durumu', async () => {
    const s = await siparisEkle({
      urunler: [{ urun: 'A', adet: 1, fiyat: 10000 }],
      odemeler: [
        { tutar: 4000, tarih: '2026-10-01' },
        { tutar: 7000, tarih: '2026-10-05', yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim' },
        { tutar: 1000, tarih: '2026-10-06', tip: 'iade' }
      ]
    });
    const r = await siparisOku(s.id);
    expect(r.tahsil_edilen).toBe(10000);
    expect(r.kalan).toBe(0);
    expect(r.odendi).toBe(true);
  });

  test('adet negatif olamaz', async () => {
    const s = await siparisEkle({});
    const hata = await hataBekle(() =>
      db.calistir('insert into siparis_urunleri (siparis_id, urun, adet) values ($1, $2, $3)', [s.id, 'A', 0])
    );
    expect(hata).toMatch(/adet/i);
  });

  test('sıfır veya negatif tutarlı ödeme kaydedilemez', async () => {
    const s = await siparisEkle({});
    expect(await hataBekle(() => odemeEkle(s.id, { tutar: 0 }))).toMatch(/tutar/i);
    expect(await hataBekle(() => odemeEkle(s.id, { tutar: -100 }))).toMatch(/tutar/i);
  });
});

describe('teslim tarihi (elle girilmez)', () => {
  test('tamamı tahsil edilince son ödeme tarihi olur', async () => {
    const s = await siparisEkle({
      urunler: [{ urun: 'A', adet: 1, fiyat: 5000 }],
      odemeler: [
        { tutar: 2000, tarih: '2026-10-01' },
        { tutar: 3000, tarih: '2026-10-09' }
      ]
    });
    expect((await siparisOku(s.id)).teslim_tarihi).toBe('2026-10-09');
  });

  test('durum Teslim Edildi yapılınca bugüne çekilir', async () => {
    const s = await siparisEkle({ urunler: [{ urun: 'A', adet: 1, fiyat: 5000 }] });
    await db.calistir(`update siparisler set durum = 'Teslim Edildi' where id = $1`, [s.id]);
    const r = await siparisOku(s.id);
    const bugun = new Date().toISOString().substring(0, 10);
    expect(r.teslim_tarihi).toBe(bugun);
    expect(r.durum_tarihi).toBe(bugun);
  });

  test('yarım tahsilat teslim tarihi yazmaz', async () => {
    const s = await siparisEkle({
      urunler: [{ urun: 'A', adet: 1, fiyat: 5000 }],
      odemeler: [{ tutar: 2000, tarih: '2026-10-01' }]
    });
    expect((await siparisOku(s.id)).teslim_tarihi).toBeNull();
  });

  test('geçersiz durum değeri kabul edilmez', async () => {
    const s = await siparisEkle({});
    const hata = await hataBekle(() =>
      db.calistir(`update siparisler set durum = 'Uydurma Durum' where id = $1`, [s.id])
    );
    expect(hata).toBeTruthy();
  });
});

describe('sipariş → kasa senkronu', () => {
  test('nakit tahsilat GELİR olarak nakit hesabına düşer', async () => {
    await siparisEkle({ odemeler: [{ tutar: 4000, tarih: '2026-10-01' }] });
    const h = await hareketler();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      yon: 'GELIR',
      ana_kategori: 'Nakit Satış',
      alt_kategori: 'Mağaza Nakit',
      hesap: 'Nakit Kasa',
      kaynak: 'SIPARIS',
      tutar: 4000,
      kaydeden: 'Sema İpek'
    });
  });

  test('kredi kartı tahsilatı POS hesabı açar', async () => {
    await siparisEkle({
      odemeler: [{ tutar: 6000, tarih: '2026-10-02', yontem: 'kk', banka: 'Garanti', taksit: '3 Taksit' }]
    });
    const h = await hareketler();
    expect(h[0]).toMatchObject({
      yon: 'GELIR',
      ana_kategori: 'POS / Kredi Kartı Satışı',
      alt_kategori: 'Garanti',
      hesap: 'Garanti POS'
    });
    expect(h[0].aciklama).toMatch(/3 Taksit/);
    await db.sistem();
    const hesap = await db.tek(`select tip::text as tip from hesaplar where ad = 'Garanti POS'`);
    expect(hesap.tip).toBe('pos');
  });

  test('iade GİDER olarak yazılır', async () => {
    await siparisEkle({
      odemeler: [
        { tutar: 5000, tarih: '2026-10-01' },
        { tutar: 1500, tarih: '2026-10-03', tip: 'iade' }
      ]
    });
    const h = await hareketler();
    const iade = h.filter((x) => x.ana_kategori === 'Satış İadesi')[0];
    expect(iade).toMatchObject({ yon: 'GIDER', tutar: 1500 });
    expect(iade.aciklama).toMatch(/İADE/);
  });

  test('ödeme güncellenince hareket de güncellenir', async () => {
    const s = await siparisEkle({ odemeler: [{ tutar: 4000, tarih: '2026-10-01' }] });
    const o = await db.tek('select id from odemeler where siparis_id = $1', [s.id]);
    await db.calistir(`update odemeler set tutar = 4500, tarih = '2026-10-04' where id = $1`, [o.id]);
    const h = await hareketler();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ tutar: 4500, tarih: '2026-10-04' });
  });

  test('ödeme silinince hareket de silinir', async () => {
    const s = await siparisEkle({
      odemeler: [
        { tutar: 4000, tarih: '2026-10-01' },
        { tutar: 1000, tarih: '2026-10-02' }
      ]
    });
    await db.calistir('delete from odemeler where siparis_id = $1 and tutar = 1000', [s.id]);
    const h = await hareketler();
    expect(h).toHaveLength(1);
    expect(h[0].tutar).toBe(4000);
  });

  test('sipariş çöpe atılınca hareketleri kalkar, geri alınca döner', async () => {
    const s = await siparisEkle({ odemeler: [{ tutar: 4000, tarih: '2026-10-01' }] });
    await db.calistir('update siparisler set silindi = true where id = $1', [s.id]);
    expect((await hareketler())[0].silindi).toBe(true);
    await db.calistir('update siparisler set silindi = false where id = $1', [s.id]);
    expect((await hareketler())[0].silindi).toBe(false);
  });

  test('kasa hareketi sipariş tarihine değil ödeme tarihine yazılır', async () => {
    await siparisEkle({
      tarih: '2026-10-01',
      odemeler: [{ tutar: 1000, tarih: '2026-11-20' }]
    });
    expect((await hareketler())[0].tarih).toBe('2026-11-20');
  });

  test('sipariş kalıcı silinince hareketleri de gider', async () => {
    const s = await siparisEkle({ odemeler: [{ tutar: 4000, tarih: '2026-10-01' }] });
    await db.sistem();
    await db.calistir('delete from siparisler where id = $1', [s.id]);
    const kalan = await db.sor('select * from hareketler');
    expect(kalan).toHaveLength(0);
    await db.oturumAc(magazaUid);
  });

  test('otomatik hareket elle oluşturulamaz (kaynak tutarlılığı)', async () => {
    await db.sistem();
    const hesap = await db.tek(`select id from hesaplar where ad = 'Nakit Kasa'`);
    const hata = await hataBekle(() =>
      db.calistir(
        `insert into hareketler (tarih, yon, ana_kategori, tutar, hesap_id, kaynak)
         values ('2026-10-01', 'GELIR', 'Nakit Satış', 100, $1, 'SIPARIS')`,
        [hesap.id]
      )
    );
    expect(hata).toMatch(/kaynak_tutarli/);
    await db.oturumAc(magazaUid);
  });
});

describe('mağaza masrafı', () => {
  test('masraf GİDER olarak kasaya düşer', async () => {
    const r = await db.tek(
      `select magaza_masraf_ekle('Temizlik / Sarf', 250, '2026-10-01', null, 'Deterjan', 'Nursu') as id`
    );
    expect(r.id).toBeTruthy();
    const h = await hareketler();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      yon: 'GIDER',
      ana_kategori: 'Masraflar',
      alt_kategori: 'Temizlik / Sarf',
      hesap: 'Nakit Kasa',
      kaynak: 'MAGAZA_MASRAF',
      tutar: 250,
      kaydeden: 'Nursu'
    });
  });

  test('listede olmayan kalem reddedilir', async () => {
    const hata = await hataBekle(() => db.calistir(`select magaza_masraf_ekle('Uydurma Kalem', 100)`));
    expect(hata).toMatch(/Geçersiz masraf kalemi/);
  });

  test('sıfır tutar reddedilir', async () => {
    const hata = await hataBekle(() => db.calistir(`select magaza_masraf_ekle('Kargo', 0)`));
    expect(hata).toMatch(/Tutar/);
  });

  test('mağaza kendi masrafını silebilir', async () => {
    const r = await db.tek(`select magaza_masraf_ekle('Kargo', 100, '2026-10-01') as id`);
    const sonuc = await db.tek('select magaza_masraf_sil($1, $2) as ok', [r.id, 'Nursu']);
    expect(sonuc.ok).toBe(true);
    expect((await hareketler())[0].silindi).toBe(true);
  });
});

describe('kasa özeti', () => {
  beforeEach(async () => {
    await siparisEkle({
      tarih: '2026-10-01',
      personel: 'Sema İpek',
      urunler: [{ urun: 'A', adet: 1, fiyat: 10000 }],
      odemeler: [
        { tutar: 4000, tarih: '2026-10-01' },
        { tutar: 6000, tarih: '2026-10-01', yontem: 'kk', banka: 'Garanti', taksit: 'Tek çekim' }
      ]
    });
    await db.calistir(`select magaza_masraf_ekle('Kargo', 500, '2026-10-01', null, '', 'Nursu')`);
  });

  test('günlük özet: nakit, pos, masraf ve net nakit', async () => {
    const r = await db.tek(`select kasa_ozeti('gun', '2026-10-01') as o`);
    const o = r.o;
    expect(Number(o.satis.nakit)).toBe(4000);
    expect(Number(o.satis.pos)).toBe(6000);
    expect(Number(o.satis.toplam)).toBe(10000);
    expect(Number(o.masrafToplam)).toBe(500);
    expect(Number(o.netNakit)).toBe(3500);
    expect(o.masraflar).toHaveLength(1);
    expect(Number(o.personel['Sema İpek'])).toBe(10000);
  });

  test('muhasebenin girdiği kasa gideri mağaza özetine karışmaz', async () => {
    await db.oturumAc(muhasebeUid);
    const hesap = await db.tek(`select id from hesaplar where ad = 'Nakit Kasa'`);
    await db.calistir(
      `insert into hareketler (magaza_id, tarih, yon, ana_kategori, alt_kategori, tutar, hesap_id, kaynak)
       values ($1, '2026-10-01', 'GIDER', 'Personel & SGK', 'Maaş', 136151, $2, 'ELLE')`,
      [magaza, hesap.id]
    );
    await db.oturumAc(magazaUid);
    const o = (await db.tek(`select kasa_ozeti('gun', '2026-10-01') as o`)).o;
    expect(o.masraflar).toHaveLength(1);
    expect(Number(o.masrafToplam)).toBe(500);
    expect(Number(o.netNakit)).toBe(3500);
  });

  test('aylık özet günleri toplar, başka gün karışmaz', async () => {
    await siparisEkle({ tarih: '2026-10-20', odemeler: [{ tutar: 2500, tarih: '2026-10-20' }] });
    const ay = (await db.tek(`select kasa_ozeti('ay', '2026-10') as o`)).o;
    expect(Number(ay.satis.nakit)).toBe(6500);
    const gun = (await db.tek(`select kasa_ozeti('gun', '2026-10-01') as o`)).o;
    expect(Number(gun.satis.nakit)).toBe(4000);
  });

  test('iade günlük satıştan düşülür', async () => {
    await siparisEkle({ tarih: '2026-10-02', odemeler: [{ tutar: 1000, tarih: '2026-10-02', tip: 'iade' }] });
    const o = (await db.tek(`select kasa_ozeti('gun', '2026-10-02') as o`)).o;
    expect(Number(o.satis.iade)).toBe(1000);
    expect(Number(o.satis.toplam)).toBe(-1000);
  });

  test('çöpe atılan sipariş özetten düşer', async () => {
    await db.calistir(`update siparisler set silindi = true where siparis_tarihi = '2026-10-01'`);
    const o = (await db.tek(`select kasa_ozeti('gun', '2026-10-01') as o`)).o;
    expect(Number(o.satis.toplam)).toBe(0);
  });
});

describe('müşteri eşleştirme', () => {
  test('telefon sadeleştirilmiş biçimde saklanır', async () => {
    await db.calistir(
      `insert into musteriler (magaza_id, ad_soyad, telefon) values ($1, 'Ayşe', '0532 111 22 33')`,
      [magaza]
    );
    await db.calistir(
      `insert into musteriler (magaza_id, ad_soyad, telefon) values ($1, 'Veli', '+90 532 444 55 66')`,
      [magaza]
    );
    const r = await db.sor('select ad_soyad, telefon_norm from musteriler order by ad_soyad');
    expect(r[0].telefon_norm).toBe('5321112233');
    expect(r[1].telefon_norm).toBe('5324445566');
  });
});

describe('marka listesi', () => {
  test('listede olmayan marka ilk kullanımda eklenir, tekrar eklenmez', async () => {
    await db.calistir(`select marka_sagla('Optik Cam', 'Yeni Marka')`);
    await db.calistir(`select marka_sagla('Optik Cam', 'yeni marka')`);
    await db.sistem();
    const r = await db.sor(
      `select m.ad from markalar m join urun_kategorileri k on k.id = m.kategori_id
       where k.ad = 'Optik Cam' and m.ad ilike 'yeni marka'`
    );
    expect(r).toHaveLength(1);
    await db.oturumAc(magazaUid);
  });
});
