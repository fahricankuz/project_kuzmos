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
  background: var(--black); border-top: 2px solid var(--yellow);
}
.demo-etiket {
  font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--yellow); font-weight: 600; margin-right: 4px;
}
.demo-chip {
  font-family: var(--font); font-size: 12px; font-weight: 500;
  padding: 6px 11px; border-radius: 999px; cursor: pointer;
  background: transparent; color: var(--white);
  border: 1px solid rgba(255,255,255,.28);
}
.demo-chip:hover { border-color: var(--yellow); }
.demo-chip.on { background: var(--yellow); color: var(--black); border-color: var(--yellow); }
.demo-chip:focus-visible { outline: 2px solid var(--yellow); outline-offset: 2px; }
/* Demo kabuğu ve abonelik bandı için alt boşluk */
.scroll { padding-bottom: 96px; }
.abonelik-bant { bottom: 46px; }
@media (max-width: 520px) {
  .demo-etiket { width: 100%; margin-bottom: 2px; }
  .scroll { padding-bottom: 136px; }
  .abonelik-bant { bottom: 76px; }
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
