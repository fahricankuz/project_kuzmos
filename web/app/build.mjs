// Önizleme paketleyici: test edilen modülleri tek bir bağımsız HTML'e gömer.
// Kullanım: node web/app/build.mjs          → dosyaları yazar
//           node web/app/build.mjs --check  → dosyalar güncel değilse hata verir (CI)
import { readFileSync, writeFileSync } from 'node:fs';

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');

/** ES modülünü global ad alanına çevirir: `export function x` → `const NS = (() => {...; return {x}})()`. */
export function toNamespace(name, src, deps = {}) {
  const exported = [];
  let out = src.replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)\.mjs';?[ \t]*$/gm, (_, names, mod) => {
    if (!deps[mod]) throw Error(name + ': bilinmeyen bağımlılık ' + mod);
    return 'const {' + names + '} = ' + deps[mod] + ';';
  });
  out = out.replace(/^export\s+(async\s+function|function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => {
    exported.push(id);
    return kw + ' ' + id;
  });
  if (/^\s*(export|import)\s/m.test(out)) throw Error(name + ': desteklenmeyen import/export biçimi');
  return 'const ' + name + ' = (() => {\n' + out + '\nreturn Object.freeze({ ' + exported.join(', ') + ' });\n})();';
}

export function buildFragment() {
  const modules = [
    toNamespace('F', read('finance/engine.mjs')),
    toNamespace('V', read('inventory/variants.mjs')),
    toNamespace('I', read('inventory/import.mjs'), { variants: 'V' }),
    toNamespace('X', read('inventory/xlsx.mjs'), { import: 'I' }),
    toNamespace('H', read('app/helpers.mjs')),
    toNamespace('N', read('notify/notify.mjs')),
  ];
  const form = JSON.stringify(read('reference/sales/Index.html')).replace(/</g, '\\u003c');
  const template = readFileSync(at('templates/Kuzmos_Stok_Aktarim_Sablonu.xlsx')).toString('base64');
  const bundle = ['"use strict";', ...modules, 'const ORIGINAL_FORM = ' + form + ';', 'const TEMPLATE_B64 = "' + template + '";', read('app/app.js')].join('\n');
  if (/<\/script/i.test(bundle.replace(/<\\\/script>/g, ''))) throw Error('Paket içinde kapanmamış </script> var.');
  const shell = read('app/shell.html');
  if (!shell.includes('/*__BUNDLE__*/')) throw Error('shell.html içinde /*__BUNDLE__*/ yok.');
  return shell.replace('/*__BUNDLE__*/', () => bundle);
}

export function buildPage(fragment) {
  return '<!doctype html>\n<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="Kuzmos satış, finans ve envanter deneme ortamı"><title>Kuzmos · Deneme</title><style>html,body{margin:0;background:#f5f5f7}</style></head><body>\n' + fragment + '\n</body></html>\n';
}

const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isMain) {
  const fragment = buildFragment();
  const outputs = [
    [at('previews/kuzmos-panels.html'), fragment],
    [new URL('../../hostinger-preview/index.html', import.meta.url), buildPage(fragment)],
  ];
  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([u, c]) => readFileSync(u, 'utf8') !== c);
    if (stale.length) {
      console.error('Güncel değil: ' + stale.map(([u]) => u.pathname).join(', ') + '\nÇalıştırın: node web/app/build.mjs');
      process.exit(1);
    }
    console.log('Önizleme dosyaları güncel.');
  } else {
    for (const [u, c] of outputs) writeFileSync(u, c);
    console.log('Yazıldı: web/previews/kuzmos-panels.html, hostinger-preview/index.html (' + Math.round(fragment.length / 1024) + ' KB)');
  }
}
