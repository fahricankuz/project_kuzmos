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

let db, kiraci, kullanicilar;

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
  w.supabase = taklit; /* createClient(url, key, opts) */

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
  kiraci = await db.kiraciKur({ onEk: 'w', ad: 'Örnek Optik', subeKod: 'KUZ' });
  kullanicilar = {
    'w-yonetici@ornek.com': { uid: kiraci.uid.yonetici, sifre: 'dogruSifre1' },
    'w-finans@ornek.com': { uid: kiraci.uid.finans, sifre: 'dogruSifre1' },
    'w-magaza_muduru@ornek.com': { uid: kiraci.uid.magaza_muduru, sifre: 'dogruSifre1' },
    'w-personel@ornek.com': { uid: kiraci.uid.personel, sifre: 'dogruSifre1' }
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
    await girisYap('w-magaza_muduru@ornek.com', 'yanlis', true);
    expect(d.getElementById('loginErr').textContent).toMatch(/hatalı|başarısız/i);
    expect(d.getElementById('viewLogin').classList.contains('active')).toBe(true);
  });

  test('mağaza girişi sipariş ekranını açar ve rol sekmelerini kurar', async () => {
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    expect(w.KULLANICI.rol).toBe('magaza_muduru');
    expect(d.getElementById('viewSiparis').classList.contains('active')).toBe(true);
    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('Sipariş');
    expect(nav).toContain('Panel');
    expect(nav).not.toContain('>Kasa<'); /* mağaza kasa sekmesini görmez */
  });

  test('yönetici girişinde kasa sekmeleri görünür', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    expect(w.KULLANICI.rol).toBe('yonetici');
    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('Kasa');
    expect(nav).toContain('Hareketler');
  });

  test('ayarlar ekranı personel ve marka listesini doldurur', async () => {
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    /* Yeni işletme kimsenin personel listesini devralmaz */
    expect(w.DATA.personel).toHaveLength(0);
    expect(w.DATA.isletme.ad).toBe('Örnek Optik');
    expect(w.DATA.isletme.durum).toBe('deneme');
    expect(w.DATA.markalar['Optik Cam']).toContain('Seiko');
    expect(w.DATA.ayar.kkKomisyon['Tek çekim']).toBe(3.5);
    expect(w.DATA.magazalar).toHaveLength(1);
  });
});

describe('sipariş formu', () => {
  beforeEach(() => girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1'));

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
    expect(s[0]).toMatchObject({
      no: 'KUZ-10-26-0001',
      ara: 10000,
      tutar: 10000,
      ad_soyad: 'Ayşe Yılmaz'
    });

    const h = await veritabanindan(
      `select h.yon::text as yon, h.tutar::float8 as tutar, hs.ad as hesap, h.kaynak::text as kaynak
       from hareketler h join hesaplar hs on hs.id = h.hesap_id`
    );
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ yon: 'GELIR', tutar: 4000, hesap: 'Nakit Kasa', kaynak: 'SIPARIS' });

    /* Arayüz: yerel veri yamalandı, kayıt listesi ve kasa rozeti güncellendi */
    expect(w.DATA.siparis).toHaveLength(1);
    expect(w.DATA.siparis[0].no).toBe('KUZ-10-26-0001');
    w.goster('viewRecords');
    expect(d.getElementById('kayitListe').innerHTML).toContain('Ayşe Yılmaz');
    expect(d.getElementById('kayitListe').innerHTML).toContain('KUZ-10-26-0001');
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
  beforeEach(() => girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1'));

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
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    w.goster('viewOzet');
    expect(d.getElementById('viewOzet').classList.contains('active')).toBe(false);
    expect(w.DATA.hareketler).toEqual([]);
  });

  test('yönetici kasa hareketi girer ve hareket listesinde görür', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
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
    expect(h[0]).toMatchObject({ tutar: 15000, kaydeden: 'İşletme Sahibi' });
  });

  test('çıkış yapınca oturum kapanır', async () => {
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    w.cikisYap();
    await bekle();
    expect(w.TOKEN).toBeNull();
    expect(d.getElementById('viewLogin').classList.contains('active')).toBe(true);
  });
});

describe('kayıt ve abonelik (SaaS akışı)', () => {
  test('yeni işletme kendi kendine kaydolur ve çalışmaya başlar', async () => {
    w.goster('viewKayit', true);
    d.getElementById('kayitIsletme').value = 'Şahin Optik';
    d.getElementById('kayitAd').value = 'Mehmet Şahin';
    d.getElementById('kayitEposta').value = 'sahin@ornek.com';
    d.getElementById('kayitTelefon').value = '0212 000 00 00';
    d.getElementById('kayitSifre').value = 'guclüSifre1';
    w.kayitOl();
    await kosulBekle(() => w.DATA && w.DATA.isletme && w.DATA.isletme.ad === 'Şahin Optik', 8000);

    expect(w.KULLANICI.rol).toBe('yonetici');
    expect(w.DATA.isletme.durum).toBe('deneme');
    expect(Number(w.DATA.isletme.kalanGun)).toBe(14);
    expect(w.DATA.magazalar).toHaveLength(1);
    expect(w.DATA.magazalar[0].kod).toBe('KUZ');
    /* Kendi kategori/marka listesiyle başlar, kimsenin personelini almaz */
    expect(w.DATA.urunKategorileri.length).toBeGreaterThan(0);
    expect(w.DATA.personel).toHaveLength(0);
    expect(w.DATA.siparis).toHaveLength(0);

    /* Veritabanında iki ayrı işletme var ve veriler karışmıyor */
    const isletmeler = await veritabanindan('select ad from isletmeler order by ad');
    expect(isletmeler.map((x) => x.ad)).toEqual(['Örnek Optik', 'Şahin Optik']);
    expect(d.getElementById('viewSiparis').classList.contains('active')).toBe(true);
  });

  test('aynı e-posta ile ikinci kez kaydolunamaz', async () => {
    w.goster('viewKayit', true);
    d.getElementById('kayitIsletme').value = 'Deneme';
    d.getElementById('kayitEposta').value = 'w-magaza_muduru@ornek.com';
    d.getElementById('kayitSifre').value = 'guclüSifre1';
    w.kayitOl();
    await kosulBekle(() => /hesap var/i.test(d.getElementById('kayitErr').textContent), 6000);
    expect(d.getElementById('kayitErr').textContent).toMatch(/hesap var/i);
  });

  test('kısa şifre ve eksik işletme adı sunucuya gitmez', async () => {
    w.goster('viewKayit', true);
    d.getElementById('kayitIsletme').value = '';
    d.getElementById('kayitEposta').value = 'x@ornek.com';
    d.getElementById('kayitSifre').value = 'kisa';
    w.kayitOl();
    await bekle(5);
    expect(d.getElementById('kayitErr').textContent).toMatch(/İşletme adını girin/);
    d.getElementById('kayitIsletme').value = 'Yeni Optik';
    w.kayitOl();
    await bekle(5);
    expect(d.getElementById('kayitErr').textContent).toMatch(/en az 8 karakter/);
    expect(await veritabanindan("select id from isletmeler where ad = 'Yeni Optik'")).toHaveLength(0);
  });

  test('deneme bandı kalan günü gösterir', async () => {
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    const b = d.getElementById('abonelikBant');
    expect(b.className).toContain('show');
    expect(b.textContent).toMatch(/Deneme sürümü · 14 gün kaldı/);
    expect(b.className).not.toContain('uyari');
  });

  test('deneme bitince uyarı bandı çıkar ve kayıt engellenir', async () => {
    await db.abonelikAyarla(kiraci.isletme, { denemeBitis: '2020-01-01' });
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');

    const b = d.getElementById('abonelikBant');
    expect(b.className).toContain('uyari');
    expect(b.textContent).toMatch(/salt okunur/i);
    expect(w.yazmaIzni()).toBe(false);

    d.getElementById('spAdSoyad').value = 'Engellenecek Müşteri';
    d.getElementById('spTarih').value = '2026-10-01';
    w.formUrunler = [{ marka: 'Seiko', kategori: 'Optik Cam', urun: 'A', adet: 1, fiyat: 1000 }];
    w.formOdemeler = [];
    w.urunleriCiz();
    w.toplamlariGuncelle();
    w.siparisKaydetTikla();
    await kosulBekle(() => d.getElementById('personelOverlay').classList.contains('open'), 1000);
    w.personelSecildi('Ali Veli');
    await kosulBekle(() => /Aboneliğiniz|kuyrukta/i.test(d.getElementById('toast').textContent), 6000);

    expect(await veritabanindan('select id from siparisler')).toHaveLength(0);
  });

  test('ayarlar ekranı abonelik kartını ve şube limitini gösterir', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    w.goster('viewAyar');
    await bekle(10);

    const kart = d.getElementById('abonelikKart').textContent;
    expect(kart).toMatch(/Deneme/);
    expect(kart).toMatch(/1 \/ 1/); /* şube: 1/1 */
    expect(d.getElementById('subeListe').textContent).toMatch(/Örnek Optik/);
    expect(d.getElementById('isletmeAd').value).toBe('Örnek Optik');
  });

  test('plan limiti aşan şube ekleme ekranda hata verir', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    w.goster('viewAyar');
    await bekle(10);
    d.getElementById('yeniSubeAd').value = 'İkinci Şube';
    d.getElementById('yeniSubeKod').value = 'IK';
    w.subeEkleTikla();
    await kosulBekle(() => /şube/i.test(d.getElementById('toast').textContent), 6000);
    expect(d.getElementById('toast').textContent).toMatch(/en fazla 1 şube/);
    expect(await veritabanindan('select id from magazalar')).toHaveLength(1);
  });

  test('işletme bilgileri güncellenir, ticari alanlar korunur', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    w.goster('viewAyar');
    await bekle(10);
    d.getElementById('isletmeAd').value = 'Örnek Optik A.Ş.';
    d.getElementById('isletmeVergiNo').value = '1234567890';
    w.isletmeKaydetTikla();
    await kosulBekle(() => w.DATA.isletme.ad === 'Örnek Optik A.Ş.', 6000);

    const i = await veritabanindan('select ad, vergi_no, plan_kod from isletmeler');
    expect(i[0]).toMatchObject({ ad: 'Örnek Optik A.Ş.', vergi_no: '1234567890', plan_kod: 'deneme' });
  });

  test('WhatsApp mesajı işletmenin kendi şablonunu kullanır', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    const m = w.whatsappMesaji('Ayşe Yılmaz', 'KUZ-10-26-0001');
    expect(m).toMatch(/Ayşe Yılmaz/);
    expect(m).toMatch(/KUZ-10-26-0001/);
    expect(m).toMatch(/Örnek Optik/);
    expect(m).not.toMatch(/Damla/);
  });

  test('ERP işareti varsayılan olarak kapalıdır, ayarla açılır', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    expect(w.erpAktifMi()).toBe(false);
    expect(d.getElementById('chipErp').style.display).toBe('none');

    w.goster('viewAyar');
    await bekle(10);
    d.getElementById('ayarErpAktif').value = 'evet';
    d.getElementById('ayarErpEtiket').value = 'Nebim’e İşlendi';
    w.mesajAyarKaydetTikla();
    await kosulBekle(() => w.DATA.ayar.erpAktif === true, 8000);
    expect(w.erpEtiket()).toBe('Nebim’e İşlendi');
  });

  test('yazdırma başlığında işletme adı görünür', async () => {
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    expect(d.getElementById('printFirma').textContent).toBe('Örnek Optik');
  });
});

describe('roller (işletme içi kırılım)', () => {
  test('personel kasa özetini ve paneli göremez', async () => {
    await girisYap('w-personel@ornek.com', 'dogruSifre1');
    expect(w.KULLANICI.rol).toBe('personel');

    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('Sipariş');
    expect(nav).toContain('Masraf');
    expect(nav).not.toContain('>Panel<');
    expect(nav).not.toContain('>Kasa<');

    /* Gün sonu kasa rozetleri gizli */
    expect(d.querySelector('.stat-box').style.display).toBe('none');
    w.kasaOzetModaliAc('gun');
    await bekle(5);
    expect(d.getElementById('kasaOzetOverlay').classList.contains('open')).toBe(false);
    expect(d.getElementById('toast').textContent).toMatch(/yetkiniz yok/i);

    /* Sipariş girebilir */
    w.goster('viewSiparis');
    expect(d.getElementById('viewSiparis').classList.contains('active')).toBe(true);
  });

  test('mağaza müdürü kendi şubesinin kasa özetini görür', async () => {
    await girisYap('w-magaza_muduru@ornek.com', 'dogruSifre1');
    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('>Panel<');
    expect(nav).not.toContain('>Hareketler<');
    expect(d.querySelector('.stat-box').style.display).not.toBe('none');

    w.kasaOzetModaliAc('gun');
    await kosulBekle(() => d.getElementById('kasaOzetBody').innerHTML.indexOf('Hesaplanıyor') === -1);
    expect(d.getElementById('kasaOzetBody').innerHTML).toMatch(/Nakit satış/);
  });

  test('finans kasayı görür ama kullanıcı ve şube yönetemez', async () => {
    await girisYap('w-finans@ornek.com', 'dogruSifre1');
    const nav = d.querySelector('.header[data-baslik]').innerHTML;
    expect(nav).toContain('>Hareketler<');
    w.goster('viewAyar');
    await bekle(10);
    expect(d.getElementById('cardKullanicilar').style.display).toBe('none');
    expect(d.getElementById('cardSubeler').style.display).toBe('none');
    expect(d.getElementById('cardLogo').style.display).toBe('none');
    /* Ama personel ve marka ayarlarını düzenler */
    expect(d.getElementById('cardPersonel').style.display).not.toBe('none');
  });

  test('yönetici kullanıcı listesinde kurucuyu görür', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    w.goster('viewAyar');
    await kosulBekle(() => d.getElementById('kullaniciListe').innerHTML.indexOf('@') > -1);
    const liste = d.getElementById('kullaniciListe').innerHTML;
    expect(liste).toContain('w-yonetici@ornek.com');
    expect(liste).toContain('w-personel@ornek.com');
  });
});

describe('logo', () => {
  test('yönetici logo yükler, sipariş formu başlığında görünür', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    w.goster('viewAyar');
    await bekle(10);
    expect(d.getElementById('logoOnizleme').textContent).toMatch(/yüklenmemiş/);

    /* Dosya seçimini taklit et */
    const dosya = new w.File([new w.Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png'
    });
    const girdi = d.getElementById('logoDosya');
    Object.defineProperty(girdi, 'files', { value: [dosya], configurable: true });

    w.logoYukleTikla();
    await kosulBekle(() => !!(w.DATA.ayar && w.DATA.ayar.logoUrl), 8000);

    expect(w.DATA.ayar.logoUrl).toMatch(/logolar\/.+\/logo\.png/);
    expect(d.getElementById('printLogo').getAttribute('src')).toBe(w.DATA.ayar.logoUrl);
    expect(d.getElementById('logoOnizleme').innerHTML).toContain('<img');

    /* Veritabanında doğru klasöre yazıldı */
    const o = await veritabanindan('select name from storage.objects');
    expect(o[0].name).toBe(kiraci.isletme + '/logo.png');
  });

  test('logo kaldırılır', async () => {
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    await db.oturumAc(kiraci.uid.yonetici);
    await db.calistir(`select logo_kaydet('https://cdn/logo.png')`);
    await girisYap('w-yonetici@ornek.com', 'dogruSifre1');
    expect(w.DATA.ayar.logoUrl).toBe('https://cdn/logo.png');

    w.confirm = () => true;
    w.logoKaldirTikla();
    await kosulBekle(() => w.DATA.ayar.logoUrl === '', 6000);
    expect(d.getElementById('printLogo').getAttribute('src')).toBeNull();
  });
});
