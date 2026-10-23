/**
 * Arayüz renk sözleşmesi.
 *
 * Buradaki kurallar tarayıcıda değil kaynak dosyada sınanır: jsdom CSS
 * kademesini gerçekçi hesaplamıyor, asıl risk de zaten kuralın hiç yazılmamış
 * olması. Koyu moddaki telefon, color-scheme bildirilmezse form denetimlerinin
 * YAZISINI beyaza çeviriyor; zemini biz verdiğimiz için açık kalıyor ve
 * reçete/tutar alanları yazarken görünmez oluyordu.
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');

describe('renk sözleşmesi', () => {
  test('açık tema bildirilir: tarayıcı form denetimlerini karartamaz', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(html).toMatch(/<meta name="color-scheme" content="light">/);
  });

  test('her form denetimi için temel yazı rengi ve zemin tanımlı', () => {
    const temel = css.match(/input,\s*select,\s*textarea\s*\{([^}]*)\}/);
    expect(temel).not.toBeNull();
    expect(temel[1]).toMatch(/(^|;)\s*color:/);
    expect(temel[1]).toMatch(/background-color:/);
  });

  test('soluk metin token’ları yeterince koyu', () => {
    /* WCAG AA (4.5) sınırına yakın gri tonlar ekranda kayboluyordu.
       Burada yalnızca token değerlerinin geri açılmadığını güvenceye alıyoruz. */
    const isik = (h) => {
      const c = [1, 3, 5]
        .map((i) => parseInt(h.substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const kontrast = (a, b) => (Math.max(isik(a), isik(b)) + 0.05) / (Math.min(isik(a), isik(b)) + 0.05);

    const tonlar = Array.from(css.matchAll(/--metin-silik:\s*(#[0-9A-Fa-f]{6})/g)).map((m) => m[1]);
    expect(tonlar.length).toBeGreaterThanOrEqual(3);
    tonlar.forEach((t) => expect(kontrast(t, '#FFFFFF')).toBeGreaterThanOrEqual(4.5));
  });
});

describe('salt okunur alanlar', () => {
  /* Yazı kabul etmeyen bir kutu, girilebilir gibi görünmemeli: kullanıcı
     tıklayıp yazmayı deniyor, imleç yanıp sönüyor, hiçbir şey olmuyor.
     Böyle bir alan ya tıklanınca doğru yeri açmalı (select-mock / tiklanir)
     ya da kutu olmaktan çıkmalı (turetilmis / no-input). */
  const okunurEtiketler = (kaynak) =>
    Array.from(kaynak.matchAll(/<input\b[^>]*\breadonly\b[^>]*>/g)).map((m) => m[0]);

  test('index.html: her salt okunur alan ya tıklanır ya türetilmiş', () => {
    const acikta = okunurEtiketler(html).filter(
      (t) => !/onclick=/.test(t) && !/class="[^"]*\b(turetilmis|no-input|select-mock)\b/.test(t)
    );
    expect(acikta).toEqual([]);
  });

  test('ekranda üretilen salt okunur alanlar seçici açar', () => {
    const js = ['siparis.js', 'kasa.js', 'panel.js', 'core.js']
      .map((f) => fs.readFileSync(path.join(__dirname, '..', 'web', 'js', f), 'utf8'))
      .join('\n');
    const acikta = okunurEtiketler(js).filter(
      (t) => !/onclick=/.test(t) && !/select-mock|turetilmis|no-input/.test(t)
    );
    expect(acikta).toEqual([]);
  });

  test('türetilmiş alanlarda metin imleci sözü verilmez', () => {
    const kural = css.match(/\.turetilmis\s*\{([^}]*)\}/);
    expect(kural).not.toBeNull();
    expect(kural[1]).toMatch(/caret-color:\s*transparent/);
    expect(kural[1]).toMatch(/cursor:\s*default/);
  });
});
