import test from 'node:test';
import assert from 'node:assert/strict';
import { canPanel, monthDays, parseTL, formatInput, toCSV } from '../app/helpers.mjs';
import { toNamespace, buildFragment } from '../app/build.mjs';

test('demo rollerinin ekran sınırları belirli', () => {
  assert.equal(canPanel('staff', 'finance'), false);
  assert.equal(canPanel('accountant', 'staff'), false);
  assert.equal(canPanel('accountant', 'finance'), true);
  assert.equal(canPanel('admin', 'manager'), true);
  assert.equal(canPanel('hacker', 'finance'), false);
});
test('ay takvimi pazartesi başlangıcı ve artık yılı hesaplar', () => {
  assert.equal(monthDays('2026-11').offset, 6);
  assert.equal(monthDays('2026-11').days.length, 30);
  assert.equal(monthDays('2028-02').days.length, 29);
  assert.throws(() => monthDays('2026-13'));
});
test('TL tutarı kuruşa çevrilir; belirsiz yazım reddedilir', () => {
  assert.equal(parseTL('250.000'), 25000000);
  assert.equal(parseTL('1.250,50'), 125050);
  assert.equal(parseTL('1250,5'), 125050);
  assert.equal(parseTL('', { allowEmpty: true }), 0);
  assert.throws(() => parseTL('12.5'));
  assert.throws(() => parseTL('0'));
  assert.equal(formatInput(125050), '1.250,50');
  assert.equal(formatInput(parseTL('455,4')), '455,40');
});
test('CSV ayırıcı ve tırnak kaçışı', () => {
  assert.equal(toCSV([['a;b', 'c"d']]), '﻿"a;b";"c""d"');
});
test('paketleyici export/import dönüştürür ve önizleme üretilir', () => {
  const ns = toNamespace('N', "import {a} from './x.mjs';\nexport const b = a + 1;\nexport function c() { return b; }", { x: 'X' });
  const X = { a: 1 };
  assert.equal(new Function('X', ns + '; return N.c();')(X), 2);
  const html = buildFragment();
  assert.match(html, /const F = \(\(\) =>/);
  assert.match(html, /kuzmos-add-product/);
  assert.doesNotMatch(html, /\/\*__BUNDLE__\*\//);
});
