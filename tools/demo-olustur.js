#!/usr/bin/env node
/*
 * Kuzmos demo sayfası üreticisi.
 *
 * web/ arayüzünü tek bir HTML dosyasına paketler ve veri katmanının yerine
 * tarayıcıda çalışan örnek veriyi koyar (sunucu gerekmez). Amacı arayüzü
 * göstermek: tıklanabilir, veri girilebilir, sayfa yenilenince başa döner.
 *
 *   node tools/demo-olustur.js [cikti.html]
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const WEB = path.join(KOK, 'web');
const cikti = process.argv[2] || path.join(KOK, 'kuzmos-demo.html');

function oku(...p) {
  return fs.readFileSync(path.join(...p), 'utf8');
}

/* index.html'in gövdesi: <head>, <body> ve script etiketleri çıkarılır */
const html = oku(WEB, 'index.html');
const govde = html
  .substring(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const css = oku(WEB, 'app.css');
const ekranlar = ['core', 'siparis', 'panel', 'kasa'].map((f) => oku(WEB, 'js', f + '.js'));
const demoVeri = oku(__dirname, 'demo-verisi.js');
const demoApi = oku(__dirname, 'demo-api.js');

const sayfa = `<title>Kuzmos</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap">
<style>
${css}

/* ═══ Demo kabuğu (yalnızca bu önizlemede) ═══ */
#demoKabuk {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 950;
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 8px max(16px, env(safe-area-inset-left, 0px))
           calc(8px + env(safe-area-inset-bottom, 0px))
           max(16px, env(safe-area-inset-right, 0px));
  background: var(--koyu-zemin); border-top: 2px solid var(--vurgu);
}
.demo-etiket {
  font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--koyu-vurgu); font-weight: 600; margin-right: 4px;
}
.demo-etiket-2 { width: 100%; margin: 4px 0 0; }
.demo-chip {
  font-family: var(--font); font-size: 12px; font-weight: 500;
  padding: 6px 11px; border-radius: 999px; cursor: pointer;
  background: transparent; color: var(--koyu-metin);
  border: 1px solid rgba(255,255,255,.28);
}
.demo-chip:hover { border-color: var(--koyu-vurgu); }
.demo-chip.on { background: var(--koyu-vurgu); color: var(--koyu-zemin); border-color: var(--koyu-vurgu); font-weight: 600; }
.demo-chip:focus-visible { outline: 2px solid var(--koyu-vurgu); outline-offset: 2px; }
/* Demo kabuğu ve abonelik bandı için alt boşluk (kabuk iki satır) */
.scroll { padding-bottom: 170px; }
.abonelik-bant { bottom: 110px; }
@media (max-width: 520px) {
  .demo-etiket { width: 100%; margin-bottom: 2px; }
  .scroll { padding-bottom: 250px; }
  .abonelik-bant { bottom: 192px; }
}
</style>

${govde}

<div id="demoKabuk"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script>
${ekranlar.join('\n')}
${demoVeri}
${demoApi}
</script>
`;

fs.writeFileSync(cikti, sayfa);
const kb = (Buffer.byteLength(sayfa) / 1024).toFixed(0);
console.log('Demo yazıldı: ' + cikti + ' (' + kb + ' KB)');
