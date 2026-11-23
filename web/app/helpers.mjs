// Arayüz yardımcıları (DOM'dan bağımsız, test edilir).

/** Demo rol → görebildiği paneller. Gerçek erişim kontrolü DEĞİLDİR; sunucu tarafı RLS gerekir. */
export const ROLE_PANELS = { admin: ['manager', 'finance', 'staff', 'inventory'], accountant: ['finance'], staff: ['staff', 'inventory'] };
export const ROLE_LABELS = { admin: 'Yönetici', accountant: 'Muhasebeci', staff: 'Satış personeli' };
export function canPanel(role, panel) {
  return ROLE_PANELS[role]?.includes(panel) || false;
}

/** Pazartesi başlangıçlı ay ızgarası. */
export function monthDays(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('INVALID_MONTH');
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) throw Error('INVALID_MONTH');
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  return { offset, days: Array.from({ length: n }, (_, i) => month + '-' + String(i + 1).padStart(2, '0')) };
}
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "250.000", "1.250,50", "1250,5" → kuruş. Boş → 0 (allowEmpty ile). "12.5" gibi belirsiz yazım reddedilir. */
export function parseTL(value, { allowEmpty = false, allowZero = false, field = 'Tutar' } = {}) {
  const s = String(value ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!s) {
    if (allowEmpty) return 0;
    throw Error(field + ' girin.');
  }
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(s) && !/^\d+(?:,\d{1,2})?$/.test(s))
    throw Error(field + ': 250.000 veya 1.250,50 biçiminde girin.');
  const [whole, decimal = ''] = s.replace(/\./g, '').split(',');
  const n = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw Error(field + ' çok büyük.');
  if (n === 0 && !allowZero && !allowEmpty) throw Error(field + ' sıfırdan büyük olmalı.');
  return n;
}
/** Kuruş → giriş alanı metni ("1.250,50"). */
export function formatInput(k) {
  if (!k) return '';
  const neg = k < 0;
  const abs = Math.abs(k);
  const whole = Math.floor(abs / 100).toLocaleString('tr-TR');
  const dec = abs % 100;
  return (neg ? '-' : '') + whole + (dec ? ',' + String(dec).padStart(2, '0') : '');
}
const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tl = (k) => TRY.format((k || 0) / 100);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export function dateTR(s, { year = false, weekday = false } = {}) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  const wd = weekday ? ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' : '';
  return wd + d + ' ' + MONTHS[m - 1] + (year ? ' ' + y : '');
}
export const monthTR = (month) => MONTHS[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4);
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
/** Basit CSV (Excel TR için ; ayırıcı, UTF-8 BOM). */
export function toCSV(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
/** CSV için kuruş → "1250,50" (binlik ayırıcısız). */
export const csvAmount = (k) => (k < 0 ? '-' : '') + Math.floor(Math.abs(k) / 100) + ',' + String(Math.abs(k) % 100).padStart(2, '0');
