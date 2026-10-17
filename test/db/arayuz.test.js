/**
 * Uçtan uca: web/ arayüzü → js/api.js → gerçek Postgres şeması.
 *
 * Arayüz dosyaları jsdom içinde aynen yüklenir, Supabase istemcisi PGlite'a
 * bağlanır. Böylece "ekrandaki düğmeye basınca veritabanında doğru şey
 * oluyor mu" sorusu gerçekten sınanır.
 *
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { veritabaniKur } = require('./harness');
const { sbTaklitOlustur } = require('./sbTaklit');

jest.setTimeout(45000);

const WEB = path.join(__dirname, '..', '..', 'web');

let db, magaza, magazaUid, yoneticiUid, kullanicilar;
let dom, w, d;

/** web/index.html + js dosyalarını gerçek bir DOM'a yükler. */
async function arayuzuKur() {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const govde = html
    .substring(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

  dom = new JSDOM('<!doctype html><html lang="tr"><head></head><body>' + govde + '</body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://kuzmos.test/'
  });
  w = dom.window;
  d = w.document;

  w.Chart = undefined; /* grafik testte gerekmiyor */
  w.KUZMOS_CONFIG = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test' };
  const taklit = sbTaklitOlustur(db, kullanicilar);
  w.supabase = { createClient: () => taklit };

  ['js/api.js', 'js/core.js', 'js/siparis.js', 'js/panel.js', 'js/kasa.js'].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(WEB, f), 'utf8'));
  });
  w.receteTablolariniKur();
  return taklit;
}

/** Promise zincirinin boşalmasını bekler (gcall geri çağırmaları). */
async function bekle(tur) {
  for (let i = 0; i < (tur || 25); i++) await new Promise((r) => setImmediate(r));
}

/** jsdom içindeki setTimeout'ların (ör. form temizleme) çalışmasını bekler. */
async function zamanGecsin(ms) {
  await new Promise((r) => setTimeout(r, ms || 400));
  await bekle(10);
}

/** Koşul sağlanana kadar bekler: sunucu çağrıları zincirleme olduğu için. */
async function kosulBekle(kosul, zamanAsimi) {
  const bitis = Date.now() + (zamanAsimi || 5000);
  while (Date.now() < bitis) {
    await bekle(5);
    let ok = false;
    try {
      ok = !!kosul();
    } catch (e) {
      ok = false;
    }
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

async function girisYap(email, sifre, basarisizBekle) {
  d.getElementById('loginEmail').value = email;
  d.getElementById('loginPass').value = sifre;
  w.doLogin();
  if (basarisizBekle) {
    await kosulBekle(() => d.getElementById('loginErr').textContent.indexOf('Kontrol') === -1);
  } else {
    await kosulBekle(() => w.DATA && w.DATA.kullanici && w.KULLANICI);
  }
  await bekle(10);
}

beforeEach(async () => {
  db = await veritabaniKur();
  magaza = await db.magazaId('DK');
  magazaUid = await db.kullaniciEkle('magaza@ornek.com', 'Atrium Mağaza', 'magaza', magaza);
  yoneticiUid = await db.kullaniciEkle('yonetici@ornek.com', 'Fahri Can Kuz', 'yonetici', null);
  await db.sistem();
  await db.calistir(`update profiller set eposta = 'magaza@ornek.com' where id = $1`, [magazaUid]);
  await db.calistir(`update profiller set eposta = 'yonetici@ornek.com' where id = $1`, [yoneticiUid]);
  kullanicilar = {
    'magaza@ornek.com': { uid: magazaUid, sifre: 'dogruSifre1' },
    'yonetici@ornek.com': { uid: yoneticiUid, sifre: 'dogruSifre1' }
  };
  await arayuzuKur();
});

afterEach(async () => {
  if (dom) dom.window.close();
  if (db) await db.kapat();
});

async function veritabanindan(sql, params) {
  const onceki = db.uid;
  await db.sistem();
  const r = await db.sor(sql, params);
  if (onceki) await db.oturumAc(onceki);
  return r;
}

describe('giriş', () => {
  test('hatalı şifre reddedilir, ekran açılmaz', async () => {
    await girisYap('magaza@ornek.com', 'yanlis', true);
    expect(d.getElementById('loginErr').textContent).toMatch(/hatalı|başarısız/i);
    expect(d.getElementById('viewLogin').classList.contains('active')).toBe(true);
  });

  test('mağaza girişi sipariş ekranını açar ve rol sekmelerini kurar', async () => {
    await girisYap('magaza@ornek.com', 'dogruSifre1');
    expect(w.KULLANICI.rol).toBe('magaza');
    expect(d.getElementById('viewSiparis').classList.contains('active')).toBe(true);
    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('Sipariş');
    expect(nav).toContain('Panel');
    expect(nav).not.toContain('>Kasa<'); /* mağaza kasa sekmesini görmez */
  });

  test('yönetici girişinde kasa sekmeleri görünür', async () => {
    await girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(w.KULLANICI.rol).toBe('yonetici');
    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('Kasa');
    expect(nav).toContain('Hareketler');
  });

  test('ayarlar ekranı personel ve marka listesini doldurur', async () => {
    await girisYap('magaza@ornek.com', 'dogruSifre1');
    expect(w.DATA.personel.length).toBe(5);
    expect(w.DATA.markalar['Optik Cam']).toContain('Seiko');
    expect(w.DATA.ayar.kkKomisyon['Tek çekim']).toBe(3.5);
  });
});

describe('sipariş formu', () => {
  beforeEach(() => girisYap('magaza@ornek.com', 'dogruSifre1'));

  function formuDoldur(opts) {
    opts = opts || {};
    d.getElementById('spAdSoyad').value = opts.adSoyad !== undefined ? opts.adSoyad : 'Ayşe Yılmaz';
    d.getElementById('spTelefon').value = opts.telefon || '0532 111 22 33';
    d.getElementById('spTarih').value = opts.tarih || '2026-10-01';
    d.getElementById('spPersonel').value = opts.personel || 'Sema İpek';
    w.formUrunler = opts.urunler || [
      { marka: 'Ray-Ban', kategori: 'Güneş Gözlüğü', urun: 'RB3025', adet: 1, fiyat: 6000 },
      { marka: 'Seiko', kategori: 'Optik Cam', urun: 'Superior', adet: 2, fiyat: 2000 }
    ];
    w.formOdemeler = opts.odemeler || [];
    w.urunleriCiz();
    w.toplamlariGuncelle();
    if (opts.tutar) {
      d.getElementById('spTutar').value = String(opts.tutar);
      d.getElementById('spTutar').dataset.elle = 'true';
    }
  }

  async function kaydet(personel) {
    const once = (w.DATA.siparis || []).length;
    w.siparisKaydetTikla();
    await kosulBekle(() => d.getElementById('personelOverlay').classList.contains('open'), 1000);
    if (d.getElementById('personelOverlay').classList.contains('open')) {
      w.personelSecildi(personel || 'Sema İpek');
    }
    await kosulBekle(() => (w.DATA.siparis || []).length > once);
    await bekle(10);
  }

  test('ürün satırları toplamı forma yazılır', () => {
    formuDoldur();
    expect(w.pTR(d.getElementById('spTutar').value)).toBe(10000);
  });

  test('kaydet: veritabanına yazılır, kasa hareketi oluşur, liste güncellenir', async () => {
    formuDoldur({ odemeler: [{ tutar: 4000, tarih: '2026-10-01', yontem: 'nakit', tip: 'tahsilat' }] });
    await kaydet('Sema İpek');

    const s = await veritabanindan(
      `select no, ara_toplam::float8 as ara, tutar::float8 as tutar, personel_adi, ad_soyad
       from siparisler`
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ no: 'DK-10-26-0001', ara: 10000, tutar: 10000, ad_soyad: 'Ayşe Yılmaz' });

    const h = await veritabanindan(
      `select h.yon::text as yon, h.tutar::float8 as tutar, hs.ad as hesap, h.kaynak::text as kaynak
       from hareketler h join hesaplar hs on hs.id = h.hesap_id`
    );
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ yon: 'GELIR', tutar: 4000, hesap: 'Nakit Kasa', kaynak: 'SIPARIS' });

    /* Arayüz: yerel veri yamalandı, kayıt listesi ve kasa rozeti güncellendi */
    expect(w.DATA.siparis).toHaveLength(1);
    expect(w.DATA.siparis[0].no).toBe('DK-10-26-0001');
    w.goster('viewRecords');
    expect(d.getElementById('kayitListe').innerHTML).toContain('Ayşe Yılmaz');
    expect(d.getElementById('kayitListe').innerHTML).toContain('DK-10-26-0001');
  });

  test('elle indirim veritabanına indirimli tutar olarak gider', async () => {
    formuDoldur({ tutar: 9000 });
    await kaydet();
    const s = await veritabanindan(
      'select ara_toplam::float8 as ara, tutar::float8 as tutar from siparisler'
    );
    expect(s[0]).toMatchObject({ ara: 10000, tutar: 9000 });
  });

  test('müşteri adı boşsa sunucuya gitmez', async () => {
    formuDoldur({ adSoyad: '' });
    w.siparisKaydetTikla();
    await bekle(5);
    expect(d.getElementById('toast').textContent).toMatch(/Müşteri adı/);
    expect(d.getElementById('personelOverlay').classList.contains('open')).toBe(false);
    expect(await veritabanindan('select id from siparisler')).toHaveLength(0);
  });

  test('ürün yoksa sunucuya gitmez', async () => {
    formuDoldur({ urunler: [] });
    w.siparisKaydetTikla();
    await bekle(5);
    expect(d.getElementById('toast').textContent).toMatch(/ürün/i);
    expect(d.getElementById('personelOverlay').classList.contains('open')).toBe(false);
    expect(await veritabanindan('select id from siparisler')).toHaveLength(0);
  });

  test('kayıt sonrası form temizlenir', async () => {
    formuDoldur();
    await kaydet();
    await zamanGecsin(400); /* siparisFormTemizle 300 ms sonra çalışır */
    expect(d.getElementById('spAdSoyad').value).toBe('');
    /* Form boş üç ürün satırıyla yeniden kurulur */
    expect(w.formUrunler.every((p) => !p.urun && !p.marka && !p.fiyat)).toBe(true);
    expect(w.formOdemeler).toHaveLength(0);
    expect(w.formId).toBeNull();
  });

  test('müşteri kartı otomatik oluşur ve müşteriler ekranında görünür', async () => {
    formuDoldur();
    await kaydet();
    w.goster('viewCustomers');
    expect(d.getElementById('musteriListe').innerHTML).toContain('Ayşe Yılmaz');
    expect(w.DATA.musteriler).toHaveLength(1);
  });
});

describe('kasa özeti ve masraf (mağaza)', () => {
  beforeEach(() => girisYap('magaza@ornek.com', 'dogruSifre1'));

  test('masraf girilir, kasa özeti net nakdi doğru hesaplar', async () => {
    /* Önce tahsilatlı bir sipariş */
    d.getElementById('spAdSoyad').value = 'Ayşe Yılmaz';
    d.getElementById('spTarih').value = w.bugunStr();
    d.getElementById('spPersonel').value = 'Sema İpek';
    w.formUrunler = [{ marka: 'Seiko', kategori: 'Optik Cam', urun: 'A', adet: 1, fiyat: 5000 }];
    w.formOdemeler = [{ tutar: 4000, tarih: w.bugunStr(), yontem: 'nakit', tip: 'tahsilat' }];
    w.urunleriCiz();
    w.toplamlariGuncelle();
    w.siparisKaydetTikla();
    await kosulBekle(() => d.getElementById('personelOverlay').classList.contains('open'), 1000);
    w.personelSecildi('Sema İpek');
    await kosulBekle(() => (w.DATA.siparis || []).length > 0);

    /* Masraf */
    w.masrafModaliAc();
    d.getElementById('masrafKalem').value = 'Kargo';
    d.getElementById('masrafTutar').value = '500';
    d.getElementById('masrafTarih').value = w.bugunStr();
    w.masrafKaydetTikla();
    await kosulBekle(() => d.getElementById('personelOverlay').classList.contains('open'), 1000);
    w.personelSecildi('Nursu');
    await kosulBekle(() => (w.DATA.masraflar || []).length > 0);

    expect(w.DATA.masraflar).toHaveLength(1);

    /* Kasa özeti modalı */
    w.kasaOzetModaliAc('gun');
    await kosulBekle(() => d.getElementById('kasaOzetBody').innerHTML.indexOf('Hesaplanıyor') === -1);
    const govde = d.getElementById('kasaOzetBody').innerHTML;
    expect(govde).toContain('4.000');
    expect(govde).toContain('500');
    expect(govde).toContain('3.500'); /* net nakit */
  });

  test('bugünün kasa rozeti tahsilatı gösterir', async () => {
    expect(d.querySelector('[id^="hdrBugun_"]').textContent).toBe('0 ₺');
  });
});

describe('yetki (arayüz + veritabanı)', () => {
  test('mağaza rolü kasa ekranına geçemez', async () => {
    await girisYap('magaza@ornek.com', 'dogruSifre1');
    w.goster('viewOzet');
    expect(d.getElementById('viewOzet').classList.contains('active')).toBe(false);
    expect(w.DATA.hareketler).toEqual([]);
  });

  test('yönetici kasa hareketi girer ve hareket listesinde görür', async () => {
    await girisYap('yonetici@ornek.com', 'dogruSifre1');
    w.hareketModaliAc('GIDER');
    d.getElementById('hTarih').value = '2026-10-01';
    d.getElementById('hTutar').value = '15.000';
    d.getElementById('hKategori').value = 'Kira & Aidat / Kira';
    d.getElementById('hHesap').value = 'Nakit Kasa';
    d.getElementById('hAciklama').value = 'Ekim kirası';
    w.hareketKaydetTikla();
    await kosulBekle(() => (w.DATA.hareketler || []).length > 0);

    expect(w.DATA.hareketler).toHaveLength(1);
    expect(w.DATA.hareketler[0]).toMatchObject({ yon: 'GIDER', tutar: 15000, hesap: 'Nakit Kasa' });
    const h = await veritabanindan(`select tutar::float8 as tutar, kaydeden from hareketler`);
    expect(h[0]).toMatchObject({ tutar: 15000, kaydeden: 'Fahri Can Kuz' });
  });

  test('çıkış yapınca oturum kapanır', async () => {
    await girisYap('magaza@ornek.com', 'dogruSifre1');
    w.cikisYap();
    await bekle();
    expect(w.TOKEN).toBeNull();
    expect(d.getElementById('viewLogin').classList.contains('active')).toBe(true);
  });
});
