// Kuzmos finans motoru (prototip).
//
// Akış: BELGE (fatura, tahakkuk, bordro, ekstre…) → BORÇ / AÇIK KALEM → ÖDEME → NAKİT.
// Her adım dengeli, çift taraflı fiş üretir. Ekranlardaki her rakam bu fişlerden türetilir;
// hiçbir rapor ayrı bir sayaçtan beslenmez. Tutarlar kuruş cinsinden tam sayıdır.
//
// Üç soru ayrı ayrı cevaplanır ve birbirine eklenmez:
//   1) Kime / ne için ne kadar ödendi?          → paymentReport
//   2) Hangi kasa / bankadan gerçekten para çıktı? → cashReport / cashFlow
//   3) Gelir-gider (kâr/zarar) etkisi ne?        → profitAndLoss
//
// Hesap kodları TDHP'ye yakın ÖNERİLERDİR; resmî hesap planı muhasebeciyle netleştirilir.

export const METHODS = {
  transfer: 'Havale / EFT',
  cash: 'Nakit',
  card: 'Şirket kredi kartı',
  cheque: 'Çek',
  note: 'Senet',
};
export const MONEY_KINDS = { bank: 'Banka hesabı', cash: 'Nakit kasa', card: 'Şirket kredi kartı', pos: 'POS hesabı' };
export const PARTY_TYPES = {
  supplier: 'Tedarikçi',
  service: 'Hizmet / gider firması',
  landlord: 'Ev sahibi / kiraya veren',
  personal: 'Şahsi / aile ödeme alıcısı',
  public: 'Kamu (vergi / SGK)',
  bank: 'Banka / finans kuruluşu',
  staff: 'Personel',
};
export const PL_GROUPS = {
  opex: 'Faaliyet giderleri',
  finance: 'Finansman giderleri',
  other: 'Diğer / kanunen kabul edilmeyen',
  tax: 'Vergi karşılığı',
};
export const CF_LABELS = {
  operating: 'İşletme faaliyetleri',
  investing: 'Yatırım faaliyetleri',
  financing: 'Finansman faaliyetleri',
  internal: 'Hesaplar arası transfer',
};
export const DOC_TYPES = {
  purchase: 'Mal alış faturası (stok)',
  expense: 'Hizmet / gider faturası',
  capex: 'Demirbaş / yatırım alışı',
  payroll: 'Bordro (maaş tahakkuku)',
  tax: 'Vergi / SGK tahakkuku',
  loan: 'Kredi taksiti',
  'card-statement': 'Kredi kartı ekstresi',
  personal: 'Şahsi / aile ödemesi',
};
export const TAX_TYPES = {
  MUHTASAR: 'Muhtasar (stopaj + damga)',
  KDV2: 'KDV tevkifatı (2 no.)',
  SGK: 'SGK primleri',
  KDV1: 'KDV (1 no.)',
  GECICI: 'Geçici vergi',
  KURUMLAR: 'Kurumlar / gelir vergisi',
  DAMGA: 'Damga vergisi (ayrı beyan)',
  MTV: 'MTV / harç',
  DIGER: 'Diğer vergi / harç',
};

const SYS = {
  INVENTORY: { code: '153', label: 'Ticari mallar (stok)', type: 'asset' },
  CARRY_VAT: { code: '190', label: 'Devreden KDV', type: 'asset' },
  INPUT_VAT: { code: '191', label: 'İndirilecek KDV', type: 'asset' },
  PREPAID_TAX: { code: '193', label: 'Peşin ödenen vergiler', type: 'asset' },
  OWNER: { code: '131', label: 'Ortaklardan alacaklar (şahsi / aile)', type: 'asset' },
  FIXED: { code: '255', label: 'Demirbaşlar', type: 'asset' },
  REVIEW: { code: 'ASKI', label: 'İnceleme / askı hesabı', type: 'asset' },
  LOAN: { code: '300', label: 'Banka kredileri', type: 'liability' },
  PAYABLE: { code: '320', label: 'Satıcılar ve hizmet firmaları', type: 'liability' },
  NOTES: { code: '321', label: 'Verilen çek ve senetler', type: 'liability' },
  STAFF: { code: '335', label: 'Personele borçlar', type: 'liability' },
  ADVANCES_IN: { code: '340', label: 'Alınan sipariş avansları', type: 'liability' },
  TAX: { code: '360', label: 'Ödenecek vergi ve harçlar', type: 'liability' },
  INCOME_WH: { code: '360.S', label: 'Stopaj / muhtasar kesintileri', type: 'liability' },
  VAT_WH: { code: '360.T', label: 'Sorumlu sıfatıyla KDV (tevkifat)', type: 'liability' },
  SGK: { code: '361', label: 'Ödenecek SGK primleri', type: 'liability' },
  OUTPUT_VAT: { code: '391', label: 'Hesaplanan KDV', type: 'liability' },
  OPENING: { code: '500', label: 'Açılış bakiyeleri / özkaynak', type: 'equity' },
  SALES: { code: '600', label: 'Yurt içi satışlar', type: 'income' },
};
export const ACCOUNTS = Object.freeze(Object.fromEntries(Object.keys(SYS).map((k) => [k, k])));
const DEBIT_NORMAL = new Set(['asset', 'expense']);
const PARTY_ACCOUNTS = new Set(['PAYABLE', 'STAFF', 'TAX', 'SGK', 'LOAN']);

// ───────────────────────── yardımcılar ─────────────────────────
export const isoDate = (s) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const clean = (s) => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const same = (a, b) => clean(a).toLocaleLowerCase('tr-TR') === clean(b).toLocaleLowerCase('tr-TR');
const amt = (v, name, { zero = false } = {}) => {
  if (!Number.isSafeInteger(v) || v < 0 || (!zero && v === 0)) throw Error(name + ' geçerli bir tutar olmalı.');
  return v;
};
export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const canonical = (x) =>
  JSON.stringify(x, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const sum = (rows, f = (x) => x) => rows.reduce((s, x) => s + f(x), 0);
function nextId(list, prefix) {
  let n = list.length + 1;
  while (list.some((x) => x.id === prefix + '-' + String(n).padStart(4, '0'))) n++;
  return prefix + '-' + String(n).padStart(4, '0');
}

/** Oran yardımcıları: oran belge üzerinden gelir, burada sadece hesaplanır (muhasebeci onaylı kural yerine geçmez). */
export function pct(base, rate) {
  return Math.round((base * rate) / 100);
}
export function fraction(base, num, den) {
  return den ? Math.round((base * num) / den) : 0;
}

// ───────────────────────── defter oluşturma ─────────────────────────
// Son sütun: motorun doğrudan kullandığı sistem kategorileri (pasife alınamaz).
const DEFAULT_CATEGORIES = [
  ['rent', 'Kira', 'opex', '770'],
  ['personnel', 'Personel giderleri', 'opex', '770', true],
  ['advertising', 'Reklam ve pazarlama', 'opex', '760'],
  ['accounting', 'Muhasebe ve danışmanlık', 'opex', '770'],
  ['utilities', 'Elektrik, su, internet', 'opex', '770'],
  ['software', 'Yazılım ve abonelik', 'opex', '770'],
  ['cargo', 'Kargo ve lojistik', 'opex', '760'],
  ['maintenance', 'Bakım ve onarım', 'opex', '770'],
  ['insurance', 'İşyeri sigortası', 'opex', '770'],
  ['taxes', 'Vergi, resim ve harçlar', 'opex', '770', true],
  ['other', 'Diğer işletme giderleri', 'opex', '770'],
  ['pos-fee', 'POS komisyonu', 'finance', '780', true],
  ['interest', 'Kredi / kart faizi ve BSMV', 'finance', '780', true],
  ['bank-fee', 'Banka ve kart masrafları', 'finance', '780', true],
  ['penalty', 'Gecikme zammı ve cezalar (KKEG)', 'other', '689', true],
  ['tax-provision', 'Kurumlar / gelir vergisi karşılığı', 'tax', '691', true],
];
export function createBooks({ tenant = 'demo-optik', today, company = 'Demo işletme' } = {}) {
  if (!isoDate(today)) throw Error('Çalışma günü geçerli bir tarih olmalı.');
  return {
    tenant,
    company,
    today,
    lockDate: '',
    accounts: [],
    parties: [
      { id: 'vergi', label: 'Vergi dairesi', type: 'public', active: true, system: true },
      { id: 'sgk', label: 'SGK', type: 'public', active: true, system: true },
      { id: 'personel', label: 'Personel (bordro)', type: 'staff', active: true, system: true },
    ],
    categories: DEFAULT_CATEGORIES.map(([id, label, pl, code, system]) => ({ id, label, pl, code, active: true, ...(system ? { system: true } : {}) })),
    documents: [],
    obligations: [],
    payments: [],
    instruments: [],
    reviews: [],
    collections: [],
    expected: [],
    templates: [],
    reconciliations: [],
    entries: [],
    entryKeys: {},
    commands: {},
    audit: [],
  };
}

export function accountInfo(b, id) {
  if (SYS[id]) return { id, ...SYS[id], group: 'system' };
  if (id.startsWith('exp:')) {
    const c = b.categories.find((x) => 'exp:' + x.id === id);
    if (!c) return null;
    return { id, code: c.code || '7xx', label: c.label, type: 'expense', pl: c.pl, group: 'expense' };
  }
  const a = b.accounts.find((x) => x.id === id);
  if (!a) return null;
  const code = { bank: '102', cash: '100', card: '309', pos: '108' }[a.kind];
  return { id, code, label: a.label, type: a.kind === 'card' ? 'liability' : 'asset', kind: a.kind, group: 'money' };
}

// ───────────────────────── tanımlar (katalog) ─────────────────────────
function uniqueLabel(rows, label, id) {
  const l = clean(label);
  if (!l || l.length > 100) throw Error('Ad 1–100 karakter olmalı.');
  if (rows.some((x) => x.id !== id && same(x.label, l))) throw Error('Bu ad zaten kayıtlı.');
  return l;
}
function slug(label, rows, prefix) {
  const base =
    prefix +
    '-' +
    clean(label)
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c])
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
  let id = base,
    n = 2;
  while (rows.some((x) => x.id === id)) id = base + '-' + n++;
  return id;
}
export function saveMoneyAccount(b, input) {
  const existing = input.id && b.accounts.find((x) => x.id === input.id);
  if (input.id && !existing) throw Error('Hesap bulunamadı.');
  const label = uniqueLabel(b.accounts, input.label, input.id);
  if (existing) {
    existing.label = label;
    if (input.iban !== undefined) existing.iban = clean(input.iban).slice(0, 40);
    return existing;
  }
  if (!MONEY_KINDS[input.kind]) throw Error('Hesap türünü seçin.');
  const row = {
    id: input.newId || slug(label, b.accounts, input.kind),
    label,
    kind: input.kind,
    iban: clean(input.iban || '').slice(0, 40),
    limit: input.kind === 'card' ? Number(input.limit) || 0 : 0,
    active: true,
  };
  b.accounts.push(row);
  return row;
}
export function saveParty(b, input) {
  const existing = input.id && b.parties.find((x) => x.id === input.id);
  if (input.id && !existing) throw Error('Firma / kişi bulunamadı.');
  const label = uniqueLabel(b.parties, input.label, input.id);
  if (existing) {
    if (existing.system && existing.label !== label) throw Error('Sistem tanımının adı değiştirilemez.');
    existing.label = label;
    if (input.taxNo !== undefined) existing.taxNo = clean(input.taxNo).slice(0, 11);
    if (input.defaultCategory !== undefined) existing.defaultCategory = input.defaultCategory;
    return existing;
  }
  if (!PARTY_TYPES[input.type] || ['public', 'staff'].includes(input.type)) throw Error('Firma türünü seçin.');
  const row = {
    id: input.newId || slug(label, b.parties, 'p'),
    label,
    type: input.type,
    taxNo: clean(input.taxNo || '').slice(0, 11),
    defaultCategory: input.defaultCategory || '',
    active: true,
  };
  b.parties.push(row);
  return row;
}
export function saveCategory(b, input) {
  const existing = input.id && b.categories.find((x) => x.id === input.id);
  if (input.id && !existing) throw Error('Kategori bulunamadı.');
  const label = uniqueLabel(b.categories, input.label, input.id);
  if (existing) {
    existing.label = label;
    return existing;
  }
  if (!PL_GROUPS[input.pl]) throw Error('Gider grubunu seçin.');
  const row = { id: input.newId || slug(label, b.categories, 'c'), label, pl: input.pl, code: input.code || '', active: true };
  b.categories.push(row);
  return row;
}
export function toggleDefinition(b, collection, id) {
  const rows = { accounts: b.accounts, parties: b.parties, categories: b.categories, templates: b.templates }[collection];
  const row = rows?.find((x) => x.id === id);
  if (!row) throw Error('Tanım bulunamadı.');
  if (row.system) throw Error('Sistem tanımı pasife alınamaz.');
  row.active = !row.active;
  return row;
}
const party = (b, id) => {
  const p = b.parties.find((x) => x.id === id);
  if (!p) throw Error('Firma / kişi bulunamadı.');
  return p;
};
const activeParty = (b, id, types) => {
  const p = party(b, id);
  if (!p.active) throw Error(p.label + ' pasif durumda.');
  if (types && !types.includes(p.type)) throw Error(p.label + ' bu belge türü için uygun değil.');
  return p;
};
const money = (b, id, kinds) => {
  const a = b.accounts.find((x) => x.id === id);
  if (!a || !a.active) throw Error('Aktif bir hesap seçin.');
  if (kinds && !kinds.includes(a.kind)) throw Error(a.label + ' bu işlem için uygun hesap türü değil.');
  return a;
};
const category = (b, id) => {
  const c = b.categories.find((x) => x.id === id);
  if (!c || !c.active) throw Error('Aktif bir gider kategorisi seçin.');
  return c;
};

// ───────────────────────── yevmiye (fiş) çekirdeği ─────────────────────────
const L = (account, debit, credit, extra = {}) => ({ account, debit, credit, ...extra });

function checkEntry(b, e) {
  if (!e.key) throw Error('INVALID_ENTRY');
  if (!isoDate(e.date)) throw Error('Geçersiz tarih: ' + e.date);
  if (e.date > b.today) throw Error('Gelecek tarihli kayıt yapılamaz (' + e.date + '). Planlamak için vade tarihini kullanın.');
  if (b.lockDate && e.date <= b.lockDate) throw Error(e.date + ' tarihi kilitli dönemde. Düzeltme için açık dönemde ters kayıt yapın.');
  if (!Array.isArray(e.lines) || e.lines.length < 2) throw Error('UNBALANCED_ENTRY');
  let dr = 0,
    cr = 0;
  for (const l of e.lines) {
    if (!accountInfo(b, l.account)) throw Error('Bilinmeyen hesap: ' + l.account);
    if (!Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit) || l.debit < 0 || l.credit < 0 || !!l.debit === !!l.credit)
      throw Error('INVALID_LINE');
    if (PARTY_ACCOUNTS.has(l.account) && !l.party) throw Error('Cari hesap satırında firma eksik.');
    dr += l.debit;
    cr += l.credit;
  }
  if (dr !== cr) throw Error('UNBALANCED_ENTRY');
}
/** Tüm fişleri doğrular, sonra birlikte işler (ya hepsi ya hiçbiri). */
function postAll(b, entries) {
  const fresh = [];
  for (const e of entries) {
    checkEntry(b, e);
    const hash = canonical(e);
    if (b.entryKeys[e.key]) {
      if (b.entryKeys[e.key] !== hash) throw Error('IDEMPOTENCY_CONFLICT');
      continue;
    }
    fresh.push([e, hash]);
  }
  for (const [e, hash] of fresh) {
    b.entries.push(structuredClone(e));
    b.entryKeys[e.key] = hash;
  }
  // Nakit kasa eksiye düşemez (banka hesabı KMH nedeniyle eksiye düşebilir; uyarı olarak raporlanır).
  for (const a of b.accounts.filter((x) => x.kind === 'cash')) {
    for (const [e] of fresh) {
      if (e.lines.some((l) => l.account === a.id) && balance(b, a.id, { asOf: e.date }) < 0) {
        for (const [x] of fresh) {
          b.entries.splice(b.entries.findIndex((y) => y.key === x.key), 1);
          delete b.entryKeys[x.key];
        }
        throw Error(a.label + ' ' + e.date + ' tarihinde eksi bakiyeye düşer.');
      }
    }
  }
  return fresh.length;
}
/** Komut seviyesinde tekrar koruması: aynı anahtar + aynı veri → önceki sonuç; farklı veri → hata. */
function once(b, key, payload, fn) {
  if (!key) throw Error('İşlem anahtarı eksik.');
  const sig = canonical(payload);
  const prev = b.commands[key];
  if (prev) {
    if (prev.sig !== sig) throw Error('IDEMPOTENCY_CONFLICT');
    return prev.result;
  }
  const result = fn();
  b.commands[key] = { sig, result };
  return result;
}
function audit(b, action, ref, note = '') {
  b.audit.push({ at: b.today, action, ref, note });
}

/** Fiş satırları, tarih sırasıyla (aynı gün içinde kayıt sırası korunur). */
export function lines(b, { asOf = '9999-12-31', from = '0000-01-01' } = {}) {
  return b.entries
    .map((e, i) => [e, i])
    .filter(([e]) => e.date <= asOf && e.date >= from)
    .sort(([a, i], [c, j]) => a.date.localeCompare(c.date) || i - j)
    .map(([e]) => e)
    .flatMap((e) => e.lines.map((l) => ({ ...l, date: e.date, entry: e.key, kind: e.kind, memo: e.memo, docId: e.docId, paymentId: e.paymentId })));
}
export function balance(b, account, { asOf = '9999-12-31', party, instrument, review } = {}) {
  const info = accountInfo(b, account);
  if (!info) throw Error('Bilinmeyen hesap: ' + account);
  const sign = DEBIT_NORMAL.has(info.type) ? 1 : -1;
  return b.entries
    .filter((e) => e.date <= asOf)
    .flatMap((e) => e.lines)
    .filter(
      (l) =>
        l.account === account &&
        (party === undefined || l.party === party) &&
        (instrument === undefined || l.instrument === instrument) &&
        (review === undefined || l.review === review),
    )
    .reduce((s, l) => s + sign * (l.debit - l.credit), 0);
}

// ───────────────────────── açılış ─────────────────────────
/** Açılış bakiyeleri. items: [{account, amount, party?}] — banka/kasa borç bakiyesi, kart/kredi/satıcı alacak bakiyesi. */
export function postOpening(b, { key = 'opening', date, items, dues = {} }) {
  return once(b, key, { date, items, dues }, () => {
    const ls = [];
    for (const it of items) {
      const info = accountInfo(b, it.account);
      if (!info) throw Error('Bilinmeyen hesap: ' + it.account);
      amt(it.amount, 'Açılış');
      const debitSide = DEBIT_NORMAL.has(info.type);
      ls.push(L(it.account, debitSide ? it.amount : 0, debitSide ? 0 : it.amount, it.party ? { party: it.party } : {}));
      ls.push(L('OPENING', debitSide ? 0 : it.amount, debitSide ? it.amount : 0));
    }
    postAll(b, [{ key, date, kind: 'opening', memo: 'Açılış bakiyeleri', lines: ls }]);
    // Açılıştaki satıcı / kredi borçları ödeme listesine açık kalem olarak düşer.
    for (const it of items.filter((x) => ['PAYABLE', 'LOAN'].includes(x.account) && dues[x.party + ':' + x.account])) {
      const d = dues[it.party + ':' + it.account];
      b.obligations.push({
        id: nextId(b.obligations, 'BK'),
        docId: '',
        kind: it.account === 'LOAN' ? 'loan' : 'party',
        partyId: it.party,
        ledger: { account: it.account, party: it.party },
        label: d.label || 'Devreden bakiye',
        amount: d.amount ?? it.amount,
        due: d.due,
        plan: { date: d.due, method: d.method || 'transfer', accountId: d.accountId || '' },
        cf: it.account === 'LOAN' ? 'financing' : 'operating',
        settlements: [],
        cancelled: false,
      });
    }
    return true;
  });
}

// ───────────────────────── belgeler ─────────────────────────
function docBase(b, input) {
  if (!DOC_TYPES[input.type]) throw Error('Belge türünü seçin.');
  if (!isoDate(input.date)) throw Error('Belge tarihi geçersiz.');
  if (input.date > b.today) throw Error('Belge tarihi bugünden sonra olamaz.');
  if (input.due !== undefined && input.due !== '' && !isoDate(input.due)) throw Error('Vade tarihi geçersiz.');
  if ((input.due || input.date) < input.date) throw Error('Vade, belge tarihinden önce olamaz.');
  const docNo = clean(input.docNo).slice(0, 60);
  if (docNo && input.partyId && b.documents.some((d) => !d.reversed && d.partyId === input.partyId && same(d.docNo, docNo) && d.type === input.type))
    throw Error('Bu firmadan aynı numaralı belge zaten kayıtlı: ' + docNo);
  return { docNo, note: clean(input.note).slice(0, 400), due: input.due || input.date };
}

/**
 * Belgenin muhasebe etkisini HESAPLAR, kaydetmez. Arayüz bunu canlı önizleme için kullanır.
 * Dönen: { doc, entry, obligations, effects:{expense, asset, payable, tax, cash:0, owner} }
 */
export function planDocument(b, input) {
  const base = docBase(b, input);
  const id = input.id || nextId(b.documents, 'BLG');
  const ls = [];
  const obligations = [];
  const effects = { expense: 0, asset: 0, payable: 0, tax: 0, cash: 0, owner: 0, review: 0, financing: 0 };
  let partyRow = null;
  let cf = 'operating';
  const doc = { id, type: input.type, date: input.date, due: base.due, docNo: base.docNo, note: base.note, period: input.period || input.date.slice(0, 7) };
  const payableTo = (p, amount, label, ledgerAccount = 'PAYABLE', extra = {}) => {
    if (amount <= 0) return;
    obligations.push({
      kind: { PAYABLE: 'party', STAFF: 'staff', TAX: 'tax', SGK: 'tax', INCOME_WH: 'tax', VAT_WH: 'tax', LOAN: 'loan' }[ledgerAccount] || 'party',
      partyId: p,
      ledger: { account: ledgerAccount, ...(PARTY_ACCOUNTS.has(ledgerAccount) ? { party: p } : {}) },
      label,
      amount,
      due: base.due,
      ...extra,
    });
  };

  switch (input.type) {
    case 'purchase':
    case 'capex': {
      partyRow = activeParty(b, input.partyId, ['supplier', 'service']);
      const net = amt(input.net, 'Matrah'),
        vat = amt(input.vat || 0, 'KDV', { zero: true });
      const total = net + vat;
      ls.push(L(input.type === 'capex' ? 'FIXED' : 'INVENTORY', net, 0));
      if (vat) ls.push(L('INPUT_VAT', vat, 0));
      ls.push(L('PAYABLE', 0, total, { party: partyRow.id }));
      effects.asset = net;
      effects.tax = vat;
      effects.payable = total;
      cf = input.type === 'capex' ? 'investing' : 'operating';
      Object.assign(doc, { net, vat, total });
      payableTo(partyRow.id, total, (base.docNo || DOC_TYPES[input.type]) + ' · ' + partyRow.label);
      break;
    }
    case 'expense': {
      partyRow = activeParty(b, input.partyId, ['supplier', 'service', 'landlord']);
      const cat = category(b, input.categoryId);
      const net = amt(input.net, 'Matrah'),
        vat = amt(input.vat || 0, 'KDV', { zero: true }),
        vw = amt(input.vatWithheld || 0, 'KDV tevkifatı', { zero: true }),
        iw = amt(input.incomeWithheld || 0, 'Stopaj', { zero: true });
      if (vw > vat) throw Error('KDV tevkifatı belgedeki KDV tutarını aşamaz.');
      if (iw > net) throw Error('Stopaj matrahı aşamaz.');
      const vendor = net + vat - vw - iw;
      ls.push(L('exp:' + cat.id, net, 0));
      if (vat) ls.push(L('INPUT_VAT', vat, 0));
      if (vendor) ls.push(L('PAYABLE', 0, vendor, { party: partyRow.id }));
      if (vw) ls.push(L('VAT_WH', 0, vw));
      if (iw) ls.push(L('INCOME_WH', 0, iw));
      effects.expense = net;
      effects.tax = vat;
      effects.payable = vendor;
      Object.assign(doc, { categoryId: cat.id, net, vat, vatWithheld: vw, incomeWithheld: iw, total: net + vat, vendor });
      payableTo(partyRow.id, vendor, (base.docNo || cat.label) + ' · ' + partyRow.label);
      break;
    }
    case 'payroll': {
      partyRow = party(b, 'personel');
      const gross = amt(input.gross, 'Brüt ücret'),
        empSgk = amt(input.employeeSgk || 0, 'İşçi SGK', { zero: true }),
        erSgk = amt(input.employerSgk || 0, 'İşveren SGK', { zero: true }),
        it = amt(input.incomeTax || 0, 'Gelir vergisi', { zero: true }),
        st = amt(input.stampTax || 0, 'Damga vergisi', { zero: true });
      const net = gross - empSgk - it - st;
      if (net <= 0) throw Error('Kesintiler brüt ücreti aşamaz.');
      const cat = category(b, input.categoryId || 'personnel');
      ls.push(L('exp:' + cat.id, gross + erSgk, 0));
      ls.push(L('STAFF', 0, net, { party: 'personel' }));
      if (empSgk + erSgk) ls.push(L('SGK', 0, empSgk + erSgk, { party: 'sgk' }));
      if (it + st) ls.push(L('INCOME_WH', 0, it + st));
      effects.expense = gross + erSgk;
      effects.payable = net;
      effects.tax = empSgk + erSgk + it + st;
      Object.assign(doc, { categoryId: cat.id, gross, employeeSgk: empSgk, employerSgk: erSgk, incomeTax: it, stampTax: st, net, total: gross + erSgk });
      payableTo('personel', net, 'Net maaşlar · ' + doc.period, 'STAFF');
      break;
    }
    case 'tax': {
      const t = input.taxType;
      if (!TAX_TYPES[t]) throw Error('Vergi / SGK türünü seçin.');
      const amount = amt(input.amount ?? 0, 'Tahakkuk tutarı', { zero: t === 'KDV1' });
      const penalty = amt(input.penalty || 0, 'Gecikme zammı / ceza', { zero: true });
      const p = t === 'SGK' ? 'sgk' : 'vergi';
      partyRow = party(b, p);
      const label = TAX_TYPES[t] + ' · ' + doc.period;
      if (['MUHTASAR', 'KDV2', 'SGK'].includes(t)) {
        // Kesintiler faturalar / bordro ile zaten borç olarak oluştu. Tahakkuk bu borcu ödemeye açar.
        const acc = { MUHTASAR: 'INCOME_WH', KDV2: 'VAT_WH', SGK: 'SGK' }[t];
        const recorded = balance(b, acc, { asOf: input.date, ...(acc === 'SGK' ? { party: 'sgk' } : {}) }) - openTaxAccrued(b, acc);
        const diff = amount - Math.max(0, recorded);
        if (diff > 0) {
          // Tahakkuk, sistemdeki kesintiden fazla: fark gider sayılmaz, incelemeye alınır.
          ls.push(L('REVIEW', diff, 0, { review: 'R-' + id }));
          ls.push(L(acc, 0, diff, acc === 'SGK' ? { party: 'sgk' } : {}));
          effects.review = diff;
        }
        Object.assign(doc, { recorded: Math.max(0, recorded), difference: diff });
        payableTo(p, amount, label, acc);
      } else if (t === 'KDV1') {
        const out = amt(input.outputVat || 0, 'Hesaplanan KDV', { zero: true }),
          inp = amt(input.inputVat || 0, 'İndirilecek KDV', { zero: true }),
          carry = amt(input.carriedVat || 0, 'Devreden KDV', { zero: true });
        if (inp > balance(b, 'INPUT_VAT', { asOf: input.date })) throw Error('İndirilecek KDV sistemdeki bakiyeyi aşıyor.');
        if (out > balance(b, 'OUTPUT_VAT', { asOf: input.date })) throw Error('Hesaplanan KDV sistemdeki bakiyeyi aşıyor.');
        if (carry > balance(b, 'CARRY_VAT', { asOf: input.date })) throw Error('Devreden KDV sistemdeki bakiyeyi aşıyor.');
        const payable = out - inp - carry;
        if (amount && amount !== Math.max(0, payable)) throw Error('Ödenecek KDV, hesaplanan − indirilecek − devreden ile aynı olmalı.');
        if (out) ls.push(L('OUTPUT_VAT', out, 0));
        if (inp) ls.push(L('INPUT_VAT', 0, inp));
        if (carry) ls.push(L('CARRY_VAT', 0, carry));
        if (payable > 0) ls.push(L('TAX', 0, payable, { party: 'vergi' }));
        if (payable < 0) ls.push(L('CARRY_VAT', -payable, 0));
        Object.assign(doc, { outputVat: out, inputVat: inp, carriedVat: carry, payable });
        payableTo('vergi', Math.max(0, payable), label, 'TAX');
        effects.tax = Math.max(0, payable);
      } else {
        const debit = t === 'GECICI' ? 'PREPAID_TAX' : t === 'KURUMLAR' ? 'exp:tax-provision' : 'exp:taxes';
        ls.push(L(debit, amount, 0));
        ls.push(L('TAX', 0, amount, { party: 'vergi' }));
        if (debit.startsWith('exp:')) effects.expense += amount;
        else effects.asset += amount;
        payableTo('vergi', amount, label, 'TAX');
      }
      if (penalty) {
        ls.push(L('exp:penalty', penalty, 0));
        ls.push(L('TAX', 0, penalty, { party: p === 'sgk' ? 'sgk' : 'vergi' }));
        effects.expense += penalty;
        payableTo(p, penalty, 'Gecikme zammı / ceza · ' + label, 'TAX');
      }
      effects.payable = sum(obligations, (o) => o.amount);
      Object.assign(doc, { taxType: t, amount, penalty, total: amount + penalty });
      break;
    }
    case 'loan': {
      partyRow = activeParty(b, input.partyId, ['bank']);
      const principal = amt(input.principal || 0, 'Anapara', { zero: true }),
        interest = amt(input.interest || 0, 'Faiz', { zero: true }),
        bsmv = amt(input.bsmv || 0, 'BSMV / KKDF', { zero: true });
      if (!principal && !interest) throw Error('Anapara veya faiz girin.');
      const outstanding = balance(b, 'LOAN', { party: partyRow.id, asOf: input.date }) - openLoanPrincipal(b, partyRow.id);
      if (principal > outstanding) throw Error('Anapara, kalan kredi bakiyesini (' + (outstanding / 100).toLocaleString('tr-TR') + ' TL) aşıyor.');
      if (interest + bsmv) {
        ls.push(L('exp:interest', interest + bsmv, 0));
        ls.push(L('LOAN', 0, interest + bsmv, { party: partyRow.id }));
      }
      effects.expense = interest + bsmv;
      effects.financing = principal;
      cf = 'financing';
      Object.assign(doc, { principal, interest, bsmv, total: principal + interest + bsmv });
      payableTo(partyRow.id, principal + interest + bsmv, 'Kredi taksiti ' + (base.docNo || '') + ' · ' + partyRow.label, 'LOAN', { principal });
      effects.payable = principal + interest + bsmv;
      break;
    }
    case 'card-statement': {
      const card = money(b, input.cardId, ['card']);
      const total = amt(input.total, 'Ekstre tutarı');
      const explained = (input.explained || []).filter((x) => x.amount);
      for (const x of explained) {
        amt(x.amount, 'Açıklanan fark');
        const c = category(b, x.categoryId);
        ls.push(L('exp:' + c.id, x.amount, 0));
        ls.push(L(card.id, 0, x.amount));
        effects.expense += x.amount;
      }
      const prior = b.obligations.filter((o) => o.kind === 'card-statement' && o.ledger.account === card.id && !o.cancelled);
      const knownBefore = balance(b, card.id, { asOf: input.date }) - sum(prior, (o) => remainingKnown(b, o));
      const known = Math.max(0, knownBefore + sum(explained, (x) => x.amount));
      Object.assign(doc, { cardId: card.id, total, known, difference: total - known, minimum: input.minimum || 0, explained });
      obligations.push({
        kind: 'card-statement',
        partyId: '',
        ledger: { account: card.id },
        label: card.label + ' · ' + (base.docNo || 'ekstre ' + input.date),
        amount: total,
        due: base.due,
        knownDebt: known,
      });
      effects.payable = total;
      effects.review = Math.max(0, total - known);
      break;
    }
    case 'personal': {
      partyRow = activeParty(b, input.partyId, ['personal', 'service', 'supplier', 'landlord']);
      const amount = amt(input.amount, 'Tutar');
      const beneficiary = clean(input.beneficiary).slice(0, 80),
        purpose = clean(input.purpose).slice(0, 80);
      if (!beneficiary || !purpose) throw Error('Şahsi ödemede kimin için ve ne amaçla yapıldığı zorunlu.');
      ls.push(L('OWNER', amount, 0));
      ls.push(L('PAYABLE', 0, amount, { party: partyRow.id }));
      effects.owner = amount;
      effects.payable = amount;
      cf = 'financing';
      Object.assign(doc, { amount, beneficiary, purpose, total: amount });
      payableTo(partyRow.id, amount, purpose + ' · ' + beneficiary);
      break;
    }
  }
  doc.partyId = partyRow?.id || '';
  doc.partyLabel = partyRow?.label || (doc.cardId ? accountInfo(b, doc.cardId).label : '');
  const entry = ls.length
    ? { key: 'doc:' + id, date: input.date, kind: input.type, memo: DOC_TYPES[input.type] + (base.docNo ? ' ' + base.docNo : ''), docId: id, lines: ls }
    : null;
  if (entry) checkEntry(b, entry);
  return {
    doc,
    entry,
    obligations: obligations.map((o) => ({ ...o, cf: o.cf || cf, plan: { date: o.due, method: input.plannedMethod || defaultMethod(o), accountId: input.plannedAccount || '' } })),
    effects,
  };
}
const defaultMethod = (o) => (o.kind === 'card-statement' || o.kind === 'loan' || o.kind === 'tax' || o.kind === 'staff' ? 'transfer' : 'transfer');
function openTaxAccrued(b, acc) {
  // Daha önce tahakkuk edilip henüz ödenmemiş tutar (aynı kesinti iki kez tahakkuk edilmesin).
  return sum(
    b.obligations.filter((o) => !o.cancelled && o.kind === 'tax' && o.ledger.account === acc),
    (o) => remaining(o),
  );
}
function openLoanPrincipal(b, partyId) {
  return sum(
    b.obligations.filter((o) => !o.cancelled && o.kind === 'loan' && o.partyId === partyId && o.principal !== undefined),
    (o) => Math.min(o.principal, remaining(o)),
  );
}

export function recordDocument(b, input) {
  return once(b, input.key || 'doc:' + canonical(input), input, () => {
    const plan = planDocument(b, input);
    if (plan.entry) postAll(b, [plan.entry]);
    b.documents.push({ ...plan.doc, reversed: false, effects: plan.effects });
    for (const o of plan.obligations) {
      b.obligations.push({ ...o, id: nextId(b.obligations, 'BK'), docId: plan.doc.id, settlements: [], cancelled: false });
    }
    if (plan.effects.review && plan.doc.type === 'tax')
      b.reviews.push({ id: 'R-' + plan.doc.id, date: plan.doc.date, amount: plan.effects.review, source: 'Tahakkuk / kayıt farkı', docId: plan.doc.id, label: TAX_TYPES[plan.doc.taxType] + ' tahakkuku sistemdeki kesintiden fazla', resolutions: [] });
    if (input.expectedId) {
      const ex = b.expected.find((x) => x.id === input.expectedId);
      if (ex) {
        ex.status = 'converted';
        ex.docId = plan.doc.id;
      }
    }
    audit(b, 'Belge kaydedildi', plan.doc.id, DOC_TYPES[plan.doc.type]);
    return plan.doc.id;
  });
}

export function reverseDocument(b, { docId, date = b.today, reason }) {
  const d = b.documents.find((x) => x.id === docId);
  if (!d || d.reversed) throw Error('Belge bulunamadı veya zaten iptal.');
  if (!clean(reason)) throw Error('İptal nedeni zorunlu.');
  const obls = b.obligations.filter((o) => o.docId === docId);
  if (obls.some((o) => o.settlements.some((s) => !s.reversed))) throw Error('Ödemesi yapılmış belge iptal edilemez. Önce ödemeyi ters kayıtla geri alın.');
  const rv = b.reviews.find((r) => r.docId === docId);
  if (rv && rv.resolutions.length) throw Error('İnceleme farkı sınıflandırılmış; önce sınıflandırmayı geri alın.');
  const orig = b.entries.find((e) => e.key === 'doc:' + docId);
  if (orig) postAll(b, [reversal(orig, date, 'rev:doc:' + docId, reason)]);
  d.reversed = true;
  d.reverseReason = clean(reason);
  obls.forEach((o) => (o.cancelled = true));
  if (rv) b.reviews.splice(b.reviews.indexOf(rv), 1);
  audit(b, 'Belge ters kayıtla iptal edildi', docId, reason);
}
function reversal(e, date, key, reason) {
  if (date < e.date) throw Error('Ters kayıt tarihi asıl kayıttan önce olamaz.');
  return { key, date, kind: 'reversal', memo: 'Ters kayıt: ' + e.memo + ' · ' + clean(reason), docId: e.docId, paymentId: e.paymentId, lines: e.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })) };
}

// ───────────────────────── açık kalemler ─────────────────────────
export function remaining(o) {
  return o.amount - sum(o.settlements.filter((s) => !s.reversed), (s) => s.amount);
}
function remainingKnown(b, o) {
  // Ekstrenin, sistemde bilinen kart borcundan henüz kapanmamış kısmı.
  const paidCard = sum(o.settlements.filter((s) => !s.reversed), (s) => s.cardPart ?? s.amount);
  return Math.max(0, Math.min(o.knownDebt ?? 0, o.knownDebt - paidCard));
}
export function obligationStatus(b, o) {
  if (o.cancelled) return 'İptal';
  const r = remaining(o);
  if (r <= 0) return 'Ödendi';
  const plan = o.plan?.date || o.due;
  if (o.due < b.today) return o.settlements.some((s) => !s.reversed) ? 'Kısmi · gecikmiş' : 'Gecikmiş';
  if (o.settlements.some((s) => !s.reversed)) return 'Kısmi ödendi';
  if (o.due === b.today || plan === b.today) return 'Bugün';
  if (o.due <= addDays(b.today, 7)) return 'Bu hafta';
  return 'Planlandı';
}
export function openItems(b, { includePaid = false } = {}) {
  return b.obligations
    .filter((o) => !o.cancelled && (includePaid || remaining(o) > 0))
    .map((o) => ({ ...o, remaining: remaining(o), status: obligationStatus(b, o), partyLabel: o.partyId ? party(b, o.partyId).label : accountInfo(b, o.ledger.account)?.label }))
    .sort((a, c) => (a.plan?.date || a.due).localeCompare(c.plan?.date || c.due) || a.id.localeCompare(c.id));
}
export function updatePlan(b, { obligationId, date, method, accountId }) {
  const o = b.obligations.find((x) => x.id === obligationId);
  if (!o || o.cancelled || remaining(o) <= 0) throw Error('Açık kalem bulunamadı.');
  if (!isoDate(date)) throw Error('Plan tarihi geçersiz.');
  if (!allowedMethods(o).includes(method)) throw Error(METHODS[method] + ' bu kalem için kullanılamaz.');
  if (accountId) money(b, accountId, methodKinds(method));
  o.plan = { date, method, accountId: accountId || '' };
  audit(b, 'Ödeme planı değişti', o.id, date + ' ' + METHODS[method]);
}

/** Kalem türüne göre kullanılabilir ödeme şekilleri. */
export function allowedMethods(o) {
  switch (o.kind) {
    case 'party':
      return ['transfer', 'cash', 'card', 'cheque', 'note'];
    case 'staff':
      return ['transfer', 'cash'];
    case 'tax':
      return ['transfer', 'cash', 'card'];
    case 'loan':
      return ['transfer'];
    case 'card-statement':
      return ['transfer', 'cash'];
    case 'instrument':
      return o.instrumentType === 'cheque' ? ['transfer'] : ['transfer', 'cash'];
    default:
      return [];
  }
}
export function methodKinds(method) {
  return { transfer: ['bank'], cash: ['cash'], card: ['card'], cheque: ['bank'], note: [] }[method] || [];
}

// ───────────────────────── ödemeler ─────────────────────────
/**
 * Bir veya birden çok açık kalemi (aynı firmaya ait) tek ödemeyle kapatır. Ayrıca avans (eşleşmemiş) desteklenir.
 * input: {key, date, method, accountId, allocations:[{obligationId, amount}], advance?:{partyId, amount}, instrument?:{no, maturity}, ref}
 */
export function planPayment(b, input) {
  const { date, method } = input;
  if (!METHODS[method]) throw Error('Ödeme şeklini seçin.');
  if (!isoDate(date)) throw Error('Ödeme tarihi geçersiz.');
  if (date > b.today) throw Error('Gerçekleşmemiş ödeme onaylanamaz. İleri tarih için planı güncelleyin.');
  const allocations = (input.allocations || []).filter((a) => a.amount);
  const advance = input.advance?.amount ? input.advance : null;
  if (!allocations.length && !advance) throw Error('Ödenecek kalemi veya avans tutarını girin.');
  const id = input.id || nextId(b.payments, 'OD');
  const isInstrument = method === 'cheque' || method === 'note';
  const acc = method === 'note' ? null : money(b, input.accountId, methodKinds(method));
  const ls = [];
  const settlements = [];
  const reviews = [];
  const partyIds = new Set();
  let instrument = null;
  for (const a of allocations) {
    const o = b.obligations.find((x) => x.id === a.obligationId);
    if (!o || o.cancelled) throw Error('Açık kalem bulunamadı.');
    amt(a.amount, 'Ödeme tutarı');
    const r = remaining(o);
    if (a.amount > r) throw Error('Ödeme kalan tutarı (' + (r / 100).toLocaleString('tr-TR') + ' TL) aşıyor.');
    if (!allowedMethods(o).includes(method)) throw Error(METHODS[method] + ' ile bu kalem ödenemez.');
    if (o.kind === 'instrument') {
      if (a.amount !== r) throw Error('Çek / senet vadesinde tam tutarıyla ödenir.');
      const ins = b.instruments.find((x) => x.id === o.ledger.instrument);
      if (ins.type === 'cheque' && acc.id !== ins.accountId) throw Error('Çek, keşide edildiği banka hesabından ödenir: ' + accountInfo(b, ins.accountId).label);
      if (date < ins.issueDate) throw Error('Çek / senet, verilmeden önce ödenemez.');
    }
    if (method === 'card' && acc.id === o.ledger.account) throw Error('Kart borcu aynı kartla kapatılamaz.');
    if (o.partyId) partyIds.add(o.partyId);
    const cf = o.cf || 'operating';
    if (o.kind === 'card-statement') {
      const cardBal = Math.max(0, balance(b, o.ledger.account, { asOf: date }));
      const cardPart = Math.min(a.amount, remainingKnown(b, o), cardBal);
      const diff = a.amount - cardPart;
      if (cardPart) ls.push(L(o.ledger.account, cardPart, 0));
      if (diff) {
        const rid = 'R-' + id + '-' + o.id;
        ls.push(L('REVIEW', diff, 0, { review: rid }));
        reviews.push({ id: rid, date, amount: diff, source: 'Kart ekstresi farkı', obligationId: o.id, paymentId: id, cardId: o.ledger.account, label: o.label + ': ekstre, sistemde kayıtlı kart harcamasından fazla', resolutions: [] });
      }
      settlements.push({ obligationId: o.id, amount: a.amount, cardPart });
    } else {
      ls.push(L(o.ledger.account, a.amount, 0, { ...(o.ledger.party ? { party: o.ledger.party } : {}), ...(o.ledger.instrument ? { instrument: o.ledger.instrument } : {}) }));
      settlements.push({ obligationId: o.id, amount: a.amount });
    }
    if (!isInstrument) ls.push(L(acc.id, 0, a.amount, acc.kind === 'card' ? {} : { cf }));
  }
  if (advance) {
    const p = activeParty(b, advance.partyId, ['supplier', 'service', 'landlord']);
    amt(advance.amount, 'Avans');
    if (isInstrument) throw Error('Avans çek / senetle verilemez (prototip).');
    partyIds.add(p.id);
    ls.push(L('PAYABLE', advance.amount, 0, { party: p.id }));
    ls.push(L(acc.id, 0, advance.amount, acc.kind === 'card' ? {} : { cf: 'operating' }));
  }
  if (partyIds.size > 1) throw Error('Tek ödemede yalnızca aynı firmanın kalemleri kapatılabilir.');
  const total = sum(allocations, (a) => a.amount) + (advance?.amount || 0);
  if (isInstrument) {
    const no = clean(input.instrument?.no).slice(0, 40),
      maturity = input.instrument?.maturity;
    if (!no) throw Error((method === 'cheque' ? 'Çek' : 'Senet') + ' numarası zorunlu.');
    if (!isoDate(maturity) || maturity < date) throw Error('Vade tarihi, veriliş tarihinden önce olamaz.');
    if (b.instruments.some((x) => same(x.no, no) && x.type === method && x.status !== 'cancelled')) throw Error('Bu numarayla kayıtlı ' + METHODS[method].toLowerCase() + ' var.');
    const pid = [...partyIds][0];
    if (!pid || allocations.some((a) => b.obligations.find((x) => x.id === a.obligationId).kind !== 'party')) throw Error('Çek / senet yalnızca firma borcuna verilir.');
    instrument = { id: 'CS-' + id, type: method, no, partyId: pid, amount: total, issueDate: date, maturity, accountId: method === 'cheque' ? acc.id : input.accountId || '', status: 'issued', paymentId: id };
    ls.push(L('NOTES', 0, total, { instrument: instrument.id }));
  }
  const first = allocations.length && b.obligations.find((x) => x.id === allocations[0].obligationId);
  const who = allocations.length === 1 ? first.label : partyIds.size ? party(b, [...partyIds][0]).label : '';
  const memo = (advance && !allocations.length ? 'Avans · ' + party(b, advance.partyId).label : who) + ' · ' + METHODS[method] + (input.ref ? ' · ' + clean(input.ref) : '');
  const entry = { key: 'pay:' + id, date, kind: isInstrument ? 'instrument-issue' : 'payment', memo, paymentId: id, lines: ls };
  checkEntry(b, entry);
  const cashOut = isInstrument || acc.kind === 'card' ? 0 : total;
  return { id, entry, settlements, reviews, instrument, total, cashOut, cardCharge: acc?.kind === 'card' ? total : 0, partyId: [...partyIds][0] || '', advance: advance?.amount || 0 };
}
export function recordPayment(b, input) {
  return once(b, input.key, { ...input, key: undefined }, () => {
    const p = planPayment(b, input);
    postAll(b, [p.entry]);
    const payment = {
      id: p.id,
      date: input.date,
      method: input.method,
      accountId: input.accountId || '',
      ref: clean(input.ref).slice(0, 60),
      partyId: p.partyId,
      total: p.total,
      advance: p.advance,
      advanceUsed: 0,
      allocations: p.settlements,
      instrumentId: p.instrument?.id || '',
      reversed: false,
    };
    b.payments.push(payment);
    for (const s of p.settlements) {
      const o = b.obligations.find((x) => x.id === s.obligationId);
      o.settlements.push({ id: p.id + ':' + o.id, paymentId: p.id, date: input.date, amount: s.amount, cardPart: s.cardPart, via: input.method, reversed: false });
      if (o.kind === 'instrument' && remaining(o) === 0) b.instruments.find((x) => x.id === o.ledger.instrument).status = 'paid';
    }
    b.reviews.push(...p.reviews);
    if (p.instrument) {
      b.instruments.push(p.instrument);
      const pr = party(b, p.instrument.partyId);
      b.obligations.push({
        id: nextId(b.obligations, 'BK'),
        docId: '',
        kind: 'instrument',
        instrumentType: p.instrument.type,
        partyId: p.instrument.partyId,
        ledger: { account: 'NOTES', instrument: p.instrument.id },
        label: METHODS[p.instrument.type] + ' ' + p.instrument.no + ' · ' + pr.label,
        amount: p.instrument.amount,
        due: p.instrument.maturity,
        plan: { date: p.instrument.maturity, method: 'transfer', accountId: p.instrument.accountId },
        cf: 'operating',
        settlements: [],
        cancelled: false,
      });
    }
    audit(b, 'Ödeme kaydedildi', p.id, METHODS[input.method]);
    return p.id;
  });
}
export function reversePayment(b, { paymentId, date = b.today, reason }) {
  const p = b.payments.find((x) => x.id === paymentId);
  if (!p || p.reversed) throw Error('Ödeme bulunamadı veya zaten geri alınmış.');
  if (!clean(reason)) throw Error('Geri alma nedeni zorunlu.');
  if (p.advanceUsed) throw Error('Avansı başka faturaya mahsup edilmiş ödeme geri alınamaz.');
  const ins = p.instrumentId && b.instruments.find((x) => x.id === p.instrumentId);
  if (ins && ins.status !== 'issued') throw Error('Ödenmiş / iade edilmiş çek-senet bu ödemeden geri alınamaz.');
  const rvs = b.reviews.filter((r) => r.paymentId === p.id);
  if (rvs.some((r) => r.resolutions.length)) throw Error('Ekstre farkı sınıflandırılmış; önce sınıflandırmayı geri alın.');
  const orig = b.entries.find((e) => e.key === 'pay:' + paymentId);
  postAll(b, [reversal(orig, date, 'rev:pay:' + paymentId, reason)]);
  p.reversed = true;
  p.reverseReason = clean(reason);
  b.obligations.forEach((o) => o.settlements.forEach((s) => s.paymentId === p.id && (s.reversed = true)));
  rvs.forEach((r) => b.reviews.splice(b.reviews.indexOf(r), 1));
  if (ins) {
    ins.status = 'cancelled';
    b.obligations.filter((o) => o.ledger.instrument === ins.id).forEach((o) => (o.cancelled = true));
  }
  audit(b, 'Ödeme ters kayıtla geri alındı', paymentId, reason);
}

/** Verilmiş avansı sonradan gelen faturaya mahsup eder. Nakit hareketi yoktur. */
export function applyAdvance(b, { key, date = b.today, partyId, obligationId, amount }) {
  return once(b, key, { date, partyId, obligationId, amount }, () => {
    const o = b.obligations.find((x) => x.id === obligationId);
    if (!o || o.cancelled || o.partyId !== partyId || o.kind !== 'party') throw Error('Bu firmaya ait açık fatura seçin.');
    amt(amount, 'Mahsup tutarı');
    if (amount > remaining(o)) throw Error('Mahsup, fatura kalanını aşıyor.');
    if (amount > advanceAvailable(b, partyId)) throw Error('Kullanılabilir avans yetersiz.');
    let left = amount;
    for (const p of b.payments.filter((x) => !x.reversed && x.partyId === partyId && x.advance > x.advanceUsed)) {
      const use = Math.min(left, p.advance - p.advanceUsed);
      p.advanceUsed += use;
      left -= use;
      if (!left) break;
    }
    o.settlements.push({ id: key, paymentId: '', date, amount, via: 'advance', reversed: false });
    audit(b, 'Avans faturaya mahsup edildi', o.id);
    return true;
  });
}
export function advanceAvailable(b, partyId) {
  return sum(b.payments.filter((p) => !p.reversed && p.partyId === partyId), (p) => p.advance - p.advanceUsed);
}

// ───────────────────────── çek / senet ─────────────────────────
/** Karşılıksız / iade: çek-senet borcu tekrar firma borcuna döner. Nakit hareketi yok. */
export function returnInstrument(b, { key, instrumentId, date = b.today, reason }) {
  return once(b, key, { instrumentId, date, reason }, () => {
    const ins = b.instruments.find((x) => x.id === instrumentId);
    if (!ins || ins.status !== 'issued') throw Error('Yalnızca vadesi bekleyen çek / senet iade edilebilir.');
    if (!clean(reason)) throw Error('İade nedeni zorunlu.');
    postAll(b, [
      {
        key: 'ret:' + ins.id,
        date,
        kind: 'instrument-return',
        memo: METHODS[ins.type] + ' ' + ins.no + ' iade / karşılıksız · ' + clean(reason),
        lines: [L('NOTES', ins.amount, 0, { instrument: ins.id }), L('PAYABLE', 0, ins.amount, { party: ins.partyId })],
      },
    ]);
    ins.status = 'returned';
    const o = b.obligations.find((x) => x.ledger.instrument === ins.id);
    o.settlements.push({ id: 'ret:' + ins.id, paymentId: '', date, amount: remaining(o), via: 'returned', reversed: false });
    b.obligations.push({
      id: nextId(b.obligations, 'BK'),
      docId: '',
      kind: 'party',
      partyId: ins.partyId,
      ledger: { account: 'PAYABLE', party: ins.partyId },
      label: 'İade edilen ' + METHODS[ins.type].toLowerCase() + ' ' + ins.no + ' · borç yeniden açıldı',
      amount: ins.amount,
      due: date,
      plan: { date, method: 'transfer', accountId: '' },
      cf: 'operating',
      settlements: [],
      cancelled: false,
    });
    audit(b, 'Çek / senet iade edildi', ins.id, reason);
    return true;
  });
}

// ───────────────────────── inceleme (askı) ─────────────────────────
export const REVIEW_TARGETS = {
  interest: 'Kart faizi / gecikme faizi (finansman gideri)',
  fee: 'Banka / kart masrafı (finansman gideri)',
  expense: 'Belgeli başka bir gider (kategori seçin)',
  opening: 'Önceki dönemden devreden borç (açılış düzeltmesi)',
  owner: 'Şahsi / ortak harcaması',
  'card-credit': 'Karta fazla ödeme (kart alacağı olarak kalsın)',
  supplier: 'Bir firmaya yapılmış ödeme (firmayı seçin)',
};
export function reviewItems(b) {
  return b.reviews.map((r) => ({ ...r, remaining: r.amount - sum(r.resolutions, (x) => x.amount) }));
}
export function resolveReview(b, { key, reviewId, amount, target, categoryId, partyId, date = b.today, note }) {
  return once(b, key, { reviewId, amount, target, categoryId, partyId, date, note }, () => {
    const r = b.reviews.find((x) => x.id === reviewId);
    if (!r) throw Error('İnceleme kaydı bulunamadı.');
    amt(amount, 'Sınıflandırılan tutar');
    const left = r.amount - sum(r.resolutions, (x) => x.amount);
    if (amount > left) throw Error('Tutar, incelemedeki kalan farkı aşıyor.');
    if (!REVIEW_TARGETS[target]) throw Error('Farkın ne olduğunu seçin.');
    if (['expense'].includes(target) && !clean(note)) throw Error('Belgeli gider için belge / açıklama girin.');
    const debit =
      target === 'interest'
        ? L('exp:interest', amount, 0)
        : target === 'fee'
          ? L('exp:bank-fee', amount, 0)
          : target === 'expense'
            ? L('exp:' + category(b, categoryId).id, amount, 0)
            : target === 'opening'
              ? L('OPENING', amount, 0)
              : target === 'owner'
                ? L('OWNER', amount, 0)
                : target === 'card-credit'
                  ? L(money(b, r.cardId || '', ['card']).id, amount, 0)
                  : L('PAYABLE', amount, 0, { party: activeParty(b, partyId).id });
    const rk = r.id + ':' + (r.resolutions.length + 1);
    postAll(b, [{ key: 'rvw:' + rk, date, kind: 'reclassification', memo: 'İnceleme sınıflandırma · ' + REVIEW_TARGETS[target] + (note ? ' · ' + clean(note) : ''), lines: [debit, L('REVIEW', 0, amount, { review: r.id })] }]);
    r.resolutions.push({ id: rk, date, amount, target, categoryId: categoryId || '', partyId: partyId || '', note: clean(note).slice(0, 200) });
    audit(b, 'İnceleme farkı sınıflandırıldı', r.id, REVIEW_TARGETS[target]);
    return true;
  });
}

// ───────────────────────── hesaplar arası, tahsilat, POS ─────────────────────────
export function transfer(b, { key, date, from, to, amount, note }) {
  return once(b, key, { date, from, to, amount, note }, () => {
    const a = money(b, from, ['bank', 'cash']),
      c = money(b, to, ['bank', 'cash']);
    if (a.id === c.id) throw Error('Aynı hesaba virman yapılamaz.');
    amt(amount, 'Tutar');
    postAll(b, [{ key: 'trf:' + key, date, kind: 'transfer', memo: 'Virman: ' + a.label + ' → ' + c.label + (note ? ' · ' + clean(note) : ''), lines: [L(c.id, amount, 0, { cf: 'internal' }), L(a.id, 0, amount, { cf: 'internal' })] }]);
    return true;
  });
}
/** Satış tahsilatı. Teslim edilmemiş sipariş için avans (340), teslimde hasılat (600) ve KDV (391). */
export function recordCollection(b, { key, date, accountId, gross, vat = 0, orderNo, customer, delivered = false }) {
  return once(b, key, { date, accountId, gross, vat, orderNo, customer, delivered }, () => {
    const acc = money(b, accountId, ['cash', 'bank', 'pos']);
    amt(gross, 'Tahsilat');
    amt(vat, 'KDV', { zero: true });
    if (vat >= gross) throw Error('KDV tahsilat tutarından küçük olmalı.');
    const id = nextId(b.collections, 'TH');
    const ls = [L(acc.id, gross, 0, acc.kind === 'pos' ? {} : { cf: 'operating' })];
    if (delivered) ls.push(L('SALES', 0, gross - vat), ...(vat ? [L('OUTPUT_VAT', 0, vat)] : []));
    else ls.push(L('ADVANCES_IN', 0, gross));
    postAll(b, [{ key: 'col:' + id, date, kind: 'collection', memo: 'Tahsilat ' + clean(orderNo) + ' · ' + clean(customer), lines: ls }]);
    b.collections.push({ id, date, accountId, gross, vat, orderNo: clean(orderNo), customer: clean(customer), delivered, deliveredOn: delivered ? date : '' });
    return id;
  });
}
export function deliverOrder(b, { collectionId, date = b.today }) {
  const c = b.collections.find((x) => x.id === collectionId);
  if (!c || c.delivered) throw Error('Teslim bekleyen tahsilat bulunamadı.');
  postAll(b, [{ key: 'dlv:' + c.id, date, kind: 'delivery', memo: 'Teslim · hasılat ' + c.orderNo, lines: [L('ADVANCES_IN', c.gross, 0), L('SALES', 0, c.gross - c.vat), ...(c.vat ? [L('OUTPUT_VAT', 0, c.vat)] : [])] }]);
  c.delivered = true;
  c.deliveredOn = date;
}
/** POS bloke çözümü: brüt POS alacağı bankaya net geçer, komisyon gider olur. */
export function settlePos(b, { key, date, posId, bankId, gross, fee }) {
  return once(b, key, { date, posId, bankId, gross, fee }, () => {
    const pos = money(b, posId, ['pos']),
      bank = money(b, bankId, ['bank']);
    amt(gross, 'Brüt tutar');
    amt(fee, 'Komisyon', { zero: true });
    if (fee >= gross) throw Error('Komisyon brüt tutardan küçük olmalı.');
    if (gross > balance(b, pos.id, { asOf: date })) throw Error('POS hesabında bu kadar bekleyen tahsilat yok.');
    postAll(b, [{ key: 'pos:' + key, date, kind: 'pos-settlement', memo: 'POS → ' + bank.label, lines: [L(bank.id, gross - fee, 0, { cf: 'operating' }), ...(fee ? [L('exp:pos-fee', fee, 0)] : []), L(pos.id, 0, gross)] }]);
    return true;
  });
}

// ───────────────────────── beklenen ödemeler (belgesiz plan) & tekrarlayanlar ─────────────────────────
/** Belge henüz yok: muhasebe kaydı ve nakit hareketi oluşturmaz, yalnızca takvim ve nakit projeksiyonuna girer. */
export function addExpected(b, { key, partyId, label, amount, due, categoryId = '', templateId = '', period = '' }) {
  return once(b, key, { partyId, label, amount, due, categoryId, templateId, period }, () => {
    const p = activeParty(b, partyId);
    amt(amount, 'Tahmini tutar');
    if (!isoDate(due)) throw Error('Vade tarihi geçersiz.');
    const id = nextId(b.expected, 'PL');
    b.expected.push({ id, partyId: p.id, label: clean(label) || p.label, amount, due, categoryId, templateId, period, status: 'expected' });
    return id;
  });
}
export function cancelExpected(b, id) {
  const x = b.expected.find((e) => e.id === id);
  if (!x || x.status !== 'expected') throw Error('Plan bulunamadı.');
  x.status = 'cancelled';
}
export function saveTemplate(b, input) {
  const existing = input.id && b.templates.find((x) => x.id === input.id);
  const label = uniqueLabel(b.templates, input.label, input.id);
  activeParty(b, input.partyId);
  category(b, input.categoryId);
  const day = Number(input.day);
  if (!Number.isInteger(day) || day < 1 || day > 28) throw Error('Ayın günü 1–28 arası olmalı.');
  amt(input.amount, 'Tahmini tutar');
  const row = { label, partyId: input.partyId, categoryId: input.categoryId, day, amount: input.amount, withholding: !!input.withholding };
  if (existing) return Object.assign(existing, row);
  const t = { id: slug(label, b.templates, 't'), ...row, active: true };
  b.templates.push(t);
  return t;
}
/** Seçilen ay için tekrarlayan ödemelerin beklenen kayıtlarını üretir. Aynı ay ikinci kez üretilmez. */
export function generateRecurring(b, period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw Error('Ay seçin.');
  let n = 0;
  for (const t of b.templates.filter((x) => x.active)) {
    if (b.expected.some((x) => x.templateId === t.id && x.period === period && x.status !== 'cancelled')) continue;
    addExpected(b, { key: 'rec:' + t.id + ':' + period, partyId: t.partyId, label: t.label + ' · ' + period, amount: t.amount, due: period + '-' + String(t.day).padStart(2, '0'), categoryId: t.categoryId, templateId: t.id, period });
    n++;
  }
  return n;
}

// ───────────────────────── mutabakat & dönem kilidi ─────────────────────────
export function reconcile(b, { accountId, date, statementBalance }) {
  const a = money(b, accountId, ['bank', 'cash', 'card', 'pos']);
  if (!isoDate(date) || date > b.today) throw Error('Mutabakat tarihi geçersiz.');
  if (!Number.isSafeInteger(statementBalance)) throw Error('Ekstre bakiyesini girin.');
  const system = balance(b, a.id, { asOf: date });
  const row = { id: nextId(b.reconciliations, 'MT'), accountId: a.id, date, statementBalance, system, difference: statementBalance - system };
  b.reconciliations.push(row);
  return row;
}
export function lockPeriod(b, date) {
  if (!isoDate(date) || date > b.today) throw Error('Kilit tarihi bugünden sonra olamaz.');
  if (b.lockDate && date < b.lockDate) throw Error('Kilit geriye alınamaz.');
  b.lockDate = date;
  audit(b, 'Dönem kilitlendi', date);
}

// ───────────────────────── sorgular ve raporlar ─────────────────────────
export function moneyBalances(b, asOf = b.today) {
  return b.accounts.map((a) => ({ ...a, balance: balance(b, a.id, { asOf }) }));
}
/** Firma / kişi carisi: PAYABLE, STAFF, TAX, SGK, LOAN satırları + açık kalemler. Pozitif = borcumuz, negatif = avans. */
export function partySummary(b, asOf = b.today) {
  return b.parties.map((p) => {
    const debt = ['PAYABLE', 'STAFF', 'TAX', 'SGK', 'LOAN'].reduce((s, a) => s + balance(b, a, { asOf, party: p.id }), 0);
    const open = b.obligations.filter((o) => !o.cancelled && o.partyId === p.id && remaining(o) > 0);
    return { ...p, debt, open: sum(open, remaining), overdue: sum(open.filter((o) => o.due < b.today), remaining), advance: advanceAvailable(b, p.id), openCount: open.length };
  });
}
export function partyStatement(b, partyId) {
  let run = 0;
  return lines(b)
    .filter((l) => l.party === partyId)
    .map((l) => {
      run += l.credit - l.debit;
      return { date: l.date, memo: l.memo, account: l.account, debt: l.credit, paid: l.debit, balance: run, docId: l.docId, paymentId: l.paymentId };
    });
}
export function accountStatement(b, accountId, { from = '0000-01-01', to = b.today } = {}) {
  const info = accountInfo(b, accountId);
  const sign = DEBIT_NORMAL.has(info.type) ? 1 : -1;
  let run = balance(b, accountId, { asOf: addDays(from, -1) });
  const rows = lines(b, { from, asOf: to })
    .filter((l) => l.account === accountId)
    .map((l) => {
      run += sign * (l.debit - l.credit);
      return { date: l.date, memo: l.memo, in: sign > 0 ? l.debit : l.credit, out: sign > 0 ? l.credit : l.debit, balance: run, kind: l.kind, cf: l.cf };
    });
  return { opening: balance(b, accountId, { asOf: addDays(from, -1) }), rows, closing: run };
}

const isCashAccount = (b, id) => ['bank', 'cash'].includes(b.accounts.find((a) => a.id === id)?.kind);

/** 1) Kime / ne için ödendi? (çek-senet verilişi ve kartla ödeme dahil; çek tahsili ödeme değil nakit çıkışıdır) */
export function paymentReport(b, { from = '0000-01-01', to = b.today } = {}) {
  const rows = [];
  for (const p of b.payments.filter((x) => !x.reversed && x.date >= from && x.date <= to)) {
    for (const a of p.allocations) {
      const o = b.obligations.find((x) => x.id === a.obligationId);
      if (o.kind === 'instrument' || o.kind === 'card-statement') continue; // çek tahsili ve ekstre ödemesi firmaya yeni ödeme değildir
      rows.push({ date: p.date, paymentId: p.id, party: o.partyId ? party(b, o.partyId).label : accountInfo(b, o.ledger.account).label, kind: o.kind, label: o.label, method: p.method, amount: a.amount });
    }
    if (p.advance) rows.push({ date: p.date, paymentId: p.id, party: party(b, p.partyId).label, kind: 'advance', label: 'Avans (faturasız)', method: p.method, amount: p.advance });
  }
  const byMethod = Object.fromEntries(Object.keys(METHODS).map((m) => [m, sum(rows.filter((r) => r.method === m), (r) => r.amount)]));
  return { rows, total: sum(rows, (r) => r.amount), byMethod };
}
/** 2) Kasadan / bankadan gerçekten çıkan para (iç virman hariç). */
export function cashReport(b, { from = '0000-01-01', to = b.today } = {}) {
  const ls = lines(b, { from, asOf: to }).filter((l) => isCashAccount(b, l.account) && l.kind !== 'opening');
  const out = ls.filter((l) => l.credit && l.cf !== 'internal');
  const inn = ls.filter((l) => l.debit && l.cf !== 'internal');
  const rows = out.map((l) => ({ date: l.date, account: accountInfo(b, l.account).label, memo: l.memo, cf: l.cf || 'operating', amount: l.credit, kind: l.kind }));
  return { rows, out: sum(out, (l) => l.credit), in: sum(inn, (l) => l.debit), internal: sum(ls.filter((l) => l.cf === 'internal' && l.credit), (l) => l.credit) };
}
/** 3) Gelir tablosu etkisi (tahakkuk esaslı; ödemeler gider yaratmaz). */
export function profitAndLoss(b, { from = '0000-01-01', to = b.today } = {}) {
  const ls = lines(b, { from, asOf: to }).filter((l) => l.kind !== 'opening');
  const sales = sum(ls.filter((l) => l.account === 'SALES'), (l) => l.credit - l.debit);
  const cats = b.categories
    .map((c) => ({ ...c, amount: sum(ls.filter((l) => l.account === 'exp:' + c.id), (l) => l.debit - l.credit) }))
    .filter((c) => c.amount);
  const groups = Object.fromEntries(Object.keys(PL_GROUPS).map((g) => [g, sum(cats.filter((c) => c.pl === g), (c) => c.amount)]));
  const expenses = sum(cats, (c) => c.amount);
  return { sales, categories: cats, groups, expenses, result: sales - expenses };
}
/**
 * "Firmalara ödenen" ile "kasadan/bankadan çıkan" arasındaki köprü. İki rakam neden farklı, kalem kalem açıklar.
 * nakit çıkışı = ödemeler − kartla ödenen − çek/senetle verilen + ekstre ödemeleri + çek/senet tahsilleri
 */
export function reportBridge(b, range = {}) {
  const from = range.from || '0000-01-01',
    to = range.to || b.today;
  const pr = paymentReport(b, { from, to });
  const cash = cashReport(b, { from, to });
  const live = b.payments.filter((p) => !p.reversed && p.date >= from && p.date <= to && ['transfer', 'cash'].includes(p.method));
  const kindSum = (kind) => sum(live, (p) => sum(p.allocations.filter((a) => b.obligations.find((o) => o.id === a.obligationId).kind === kind), (a) => a.amount));
  const reversals = sum(lines(b, { from, asOf: to }).filter((l) => l.kind === 'reversal' && isCashAccount(b, l.account) && l.cf !== 'internal'), (l) => l.debit - l.credit);
  const parts = {
    payments: pr.total,
    card: pr.byMethod.card,
    instruments: pr.byMethod.cheque + pr.byMethod.note,
    statements: kindSum('card-statement'),
    redemptions: kindSum('instrument'),
  };
  const cashFromPayments = parts.payments - parts.card - parts.instruments + parts.statements + parts.redemptions;
  return { ...parts, cashOut: cash.out, reversals, other: cash.out - reversals - cashFromPayments, expenses: profitAndLoss(b, { from, to }).expenses };
}
/** Nakit akışı (doğrudan yöntem, yönetim amaçlı). Açılış + giriş − çıkış = kapanış kontrolü yapılır. */
export function cashFlow(b, { from = '0000-01-01', to = b.today } = {}) {
  const cashIds = b.accounts.filter((a) => ['bank', 'cash'].includes(a.kind)).map((a) => a.id);
  const opening = sum(cashIds, (id) => balance(b, id, { asOf: addDays(from, -1) }));
  const closing = sum(cashIds, (id) => balance(b, id, { asOf: to }));
  const ls = lines(b, { from, asOf: to }).filter((l) => cashIds.includes(l.account) && l.kind !== 'opening');
  const classes = Object.fromEntries(
    Object.keys(CF_LABELS).map((k) => {
      const x = ls.filter((l) => (l.cf || 'operating') === k);
      return [k, { in: sum(x, (l) => l.debit), out: sum(x, (l) => l.credit) }];
    }),
  );
  const openingInPeriod = sum(lines(b, { from, asOf: to }).filter((l) => cashIds.includes(l.account) && l.kind === 'opening'), (l) => l.debit - l.credit);
  const net = sum(Object.values(classes), (c) => c.in - c.out);
  return { opening: opening + openingInPeriod, closing, classes, net, balanced: opening + openingInPeriod + net === closing };
}
/** Yönetim mizanı. Toplam borç = toplam alacak olmak zorunda. */
export function trialBalance(b, asOf = b.today) {
  const ids = [...new Set(b.entries.filter((e) => e.date <= asOf).flatMap((e) => e.lines.map((l) => l.account)))];
  const rows = ids
    .map((id) => {
      const ls = lines(b, { asOf }).filter((l) => l.account === id);
      const info = accountInfo(b, id);
      return { id, code: info.code, label: info.label, type: info.type, debit: sum(ls, (l) => l.debit), credit: sum(ls, (l) => l.credit) };
    })
    .sort((a, c) => String(a.code).localeCompare(String(c.code), 'tr', { numeric: true }));
  return { rows, debit: sum(rows, (r) => r.debit), credit: sum(rows, (r) => r.credit) };
}
/** Nakit projeksiyonu: bugünkü kasa+banka, açık kalemlerin plan tarihleri ve belgesi beklenen planlar. Kartla planlanan kalemler nakit çıkarmaz. */
export function projection(b, days = 30) {
  const cashIds = b.accounts.filter((a) => ['bank', 'cash'].includes(a.kind)).map((a) => a.id);
  const start = sum(cashIds, (id) => balance(b, id, { asOf: b.today }));
  const posPending = sum(b.accounts.filter((a) => a.kind === 'pos'), (a) => balance(b, a.id, { asOf: b.today }));
  const end = addDays(b.today, days);
  const items = [
    ...openItems(b)
      .filter((o) => !['card', 'cheque', 'note'].includes(o.plan?.method))
      .map((o) => ({ date: (o.plan?.date || o.due) < b.today ? b.today : o.plan?.date || o.due, amount: o.remaining, label: o.label, overdue: o.due < b.today, kind: o.kind })),
    ...b.expected.filter((x) => x.status === 'expected').map((x) => ({ date: x.due < b.today ? b.today : x.due, amount: x.amount, label: x.label + ' (belge bekleniyor)', expected: true })),
  ].filter((x) => x.date <= end);
  let run = start;
  const series = [];
  let min = { date: b.today, balance: start };
  for (let d = b.today; d <= end; d = addDays(d, 1)) {
    const out = sum(items.filter((x) => x.date === d), (x) => x.amount);
    run -= out;
    series.push({ date: d, out, balance: run });
    if (run < min.balance) min = { date: d, balance: run };
  }
  return { start, posPending, items: items.sort((a, c) => a.date.localeCompare(c.date)), series, min, end: run, totalOut: sum(items, (x) => x.amount) };
}
/** Dönem kapanış kontrolleri. */
export function closingChecks(b, asOf = b.today) {
  const TL = (k) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  const tb = trialBalance(b, asOf);
  const review = reviewItems(b).filter((r) => r.remaining > 0);
  const overdue = openItems(b).filter((o) => o.due < b.today);
  const recon = b.accounts
    .filter((a) => a.active && ['bank', 'card'].includes(a.kind))
    .map((a) => ({ account: a, last: [...b.reconciliations].reverse().find((r) => r.accountId === a.id) }));
  const cards = b.accounts.filter((a) => a.kind === 'card' && balance(b, a.id, { asOf }) < 0);
  const negBanks = b.accounts.filter((a) => a.kind === 'bank' && balance(b, a.id, { asOf }) < 0);
  const checks = [
    { ok: tb.debit === tb.credit, label: 'Tüm fişler dengeli (mizan borç = alacak)', detail: tb.debit === tb.credit ? 'Dengeli' : 'Fark var' },
    { ok: !review.length, label: 'İnceleme hesabında bekleyen fark yok', detail: review.length ? review.length + ' kalem, ' + TL(sum(review, (r) => r.remaining)) : 'Temiz', link: 'review' },
    { ok: recon.every((r) => r.last && r.last.difference === 0), label: 'Banka ve kart hesapları ekstreyle mutabık', detail: recon.filter((r) => !r.last || r.last.difference !== 0).map((r) => r.account.label).join(', ') || 'Tamam', link: 'reconcile' },
    { ok: !overdue.length, label: 'Vadesi geçmiş ödeme yok', detail: overdue.length ? overdue.length + ' kalem gecikmiş' : 'Yok', link: 'payables' },
    { ok: !negBanks.length, label: 'Banka hesapları eksi bakiyede değil', detail: negBanks.map((a) => a.label).join(', ') || 'Tamam' },
    { ok: balance(b, 'ADVANCES_IN', { asOf }) === 0, label: 'Teslim bekleyen sipariş avansı (bilgi)', detail: TL(balance(b, 'ADVANCES_IN', { asOf })) + ' avans; teslimde hasılata döner', info: true },
    { ok: true, label: 'İndirilecek KDV muhasebeci onayı bekliyor (bilgi)', detail: TL(balance(b, 'INPUT_VAT', { asOf })), info: true },
    { ok: !cards.length, label: 'Kart alacakları (fazla ödeme) izlenir', detail: cards.map((a) => a.label).join(', ') || 'Yok', info: true },
  ];
  return { checks, ready: checks.filter((c) => !c.info).every((c) => c.ok) };
}

// ───────────────────────── demo verisi ─────────────────────────
/**
 * Damla Kuz Optik · Kasım 2026 sentetik senaryosu. Oranlar örnek değerlerdir, mevzuat tavsiyesi değildir.
 * Seiko örneği: önceki alıştan 50.000 TL borç → 10 Kasım şirket kartıyla ödendi → 24 Kasım ekstre 54.000 TL bankadan
 * ödendi → 4.000 TL fark incelemede bekliyor (otomatik gider yazılmadı).
 */
export function demoBooks() {
  const T = (tl) => Math.round(tl * 100);
  const b = createBooks({ tenant: 'damla-kuz-optik', today: '2026-11-25', company: 'Damla Kuz Optik' });
  [
    ['bank-garanti', 'Garanti BBVA · TL hesabı', 'bank', 'TR00 0006 2000 0000 0000 0000 01'],
    ['bank-is', 'İş Bankası · TL hesabı', 'bank', 'TR00 0006 4000 0000 0000 0000 02'],
    ['cash-store', 'Mağaza kasası', 'cash', ''],
    ['card-garanti', 'Garanti şirket kartı', 'card', ''],
    ['pos-garanti', 'Garanti POS', 'pos', ''],
  ].forEach(([id, label, kind, iban]) => saveMoneyAccount(b, { newId: id, label, kind, iban, limit: kind === 'card' ? T(150000) : 0 }));

  [
    ['lux', 'Luxottica Türkiye', 'supplier', ''],
    ['seiko', 'Seiko Optical', 'supplier', ''],
    ['cam', 'Örnek Cam Tedarikçisi', 'supplier', ''],
    ['ajans', 'Örnek Reklam Ajansı', 'service', 'advertising'],
    ['muhasebe', 'Örnek Mali Müşavirlik', 'service', 'accounting'],
    ['elektrik', 'Elektrik dağıtım şirketi', 'service', 'utilities'],
    ['internet', 'İnternet sağlayıcı', 'service', 'utilities'],
    ['evsahibi', 'Mağaza ev sahibi (şahıs)', 'landlord', 'rent'],
    ['sigorta', 'Örnek Sigorta A.Ş.', 'personal', ''],
    ['kredi-garanti', 'Garanti BBVA · işletme kredisi', 'bank', ''],
  ].forEach(([id, label, type, defaultCategory]) => saveParty(b, { newId: id, label, type, defaultCategory }));

  b.today = '2026-11-01';
  postOpening(b, {
    date: '2026-11-01',
    items: [
      { account: 'bank-garanti', amount: T(320000) },
      { account: 'bank-is', amount: T(185000) },
      { account: 'cash-store', amount: T(6000) },
      { account: 'PAYABLE', party: 'seiko', amount: T(50000) },
      { account: 'LOAN', party: 'kredi-garanti', amount: T(300000) },
    ],
    dues: { 'seiko:PAYABLE': { due: '2026-11-10', label: 'Seiko · önceki alıştan devreden borç', method: 'card', accountId: 'card-garanti' } },
  });
  const run = (day, fn) => {
    b.today = day;
    return fn();
  };
  const ob = (docId) => b.obligations.find((o) => o.docId === docId);
  // Kira: şahıs ev sahibi, brüt 30.000, %20 stopaj (örnek oran) → ev sahibine 24.000
  const rent = run('2026-11-01', () => recordDocument(b, { key: 'seed-rent', type: 'expense', partyId: 'evsahibi', categoryId: 'rent', docNo: 'KİRA-2026-11', date: '2026-11-01', due: '2026-11-05', net: T(30000), incomeWithheld: T(6000), period: '2026-11' }));
  run('2026-11-05', () => recordPayment(b, { key: 'seed-rent-pay', date: '2026-11-05', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(rent).id, amount: T(24000) }], ref: 'EFT-55120' }));
  // Ekim bordrosu (örnek kesinti tutarları)
  const pay = run('2026-11-01', () => recordDocument(b, { key: 'seed-payroll', type: 'payroll', date: '2026-11-01', due: '2026-11-05', period: '2026-10', gross: T(60000), employeeSgk: T(8400), employerSgk: T(9450), incomeTax: T(5850), stampTax: T(455.4) }));
  run('2026-11-05', () => recordPayment(b, { key: 'seed-payroll-pay', date: '2026-11-05', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(pay).id, amount: remaining(ob(pay)) }], ref: 'Maaş toplu EFT' }));
  // Luxottica mal alışı → 05.11 çek verildi, vadesi 30.11 (nakit çıkışı vadede)
  const lux = run('2026-11-03', () => recordDocument(b, { key: 'seed-lux', type: 'purchase', partyId: 'lux', docNo: 'LUX-2048', date: '2026-11-03', due: '2026-11-05', net: T(200000), vat: T(40000), note: 'Kasım çerçeve alımı' }));
  run('2026-11-05', () => recordPayment(b, { key: 'seed-lux-cheque', date: '2026-11-05', method: 'cheque', accountId: 'bank-garanti', allocations: [{ obligationId: ob(lux).id, amount: T(240000) }], instrument: { no: 'CK-2026-018', maturity: '2026-11-30' } }));
  // Reklam ajansı: KDV tevkifatlı hizmet (örnek 3/10)
  run('2026-11-06', () => recordDocument(b, { key: 'seed-ajans', type: 'expense', partyId: 'ajans', categoryId: 'advertising', docNo: 'HZ-112', date: '2026-11-06', due: '2026-11-22', net: T(15000), vat: T(3000), vatWithheld: T(900) }));
  // Seiko: devreden 50.000 borç 10.11 şirket kartıyla ödendi (kart borcu doğar, bankadan para çıkmaz)
  run('2026-11-10', () => recordPayment(b, { key: 'seed-seiko-card', date: '2026-11-10', method: 'card', accountId: 'card-garanti', allocations: [{ obligationId: b.obligations.find((o) => o.partyId === 'seiko').id, amount: T(50000) }], ref: 'Kart slip 4471' }));
  // Kasadan bankaya para yatırma (iç transfer)
  run('2026-11-12', () => transfer(b, { key: 'seed-deposit', date: '2026-11-12', from: 'cash-store', to: 'bank-is', amount: T(5000), note: 'Kasa fazlası yatırıldı' }));
  // Satışlar: POS ve nakit; bir sipariş avansı (teslim bekliyor)
  run('2026-11-12', () => recordCollection(b, { key: 'seed-col-1', date: '2026-11-12', accountId: 'pos-garanti', gross: T(36000), vat: T(3272.73), orderNo: 'SP-2041', customer: 'Örnek müşteri A', delivered: true }));
  run('2026-11-12', () => recordCollection(b, { key: 'seed-col-2', date: '2026-11-12', accountId: 'cash-store', gross: T(8500), vat: T(772.73), orderNo: 'SP-2042', customer: 'Örnek müşteri B', delivered: true }));
  run('2026-11-13', () => settlePos(b, { key: 'seed-pos-1', date: '2026-11-13', posId: 'pos-garanti', bankId: 'bank-garanti', gross: T(36000), fee: T(900) }));
  run('2026-11-18', () => recordCollection(b, { key: 'seed-col-3', date: '2026-11-18', accountId: 'cash-store', gross: T(4000), vat: T(363.64), orderNo: 'SP-2050', customer: 'Örnek müşteri C (kapora)', delivered: false }));
  run('2026-11-22', () => recordCollection(b, { key: 'seed-col-4', date: '2026-11-22', accountId: 'pos-garanti', gross: T(14500), vat: T(1318.18), orderNo: 'SP-2053', customer: 'Örnek müşteri D', delivered: true }));
  // Gün sonu POS / nakit satış özetleri (örnek)
  [
    ['2026-11-05', T(68000), T(6181.82), T(9500), T(863.64)],
    ['2026-11-10', T(92000), T(8363.64), T(7200), T(654.55)],
    ['2026-11-19', T(74000), T(6727.27), T(12000), T(1090.91)],
  ].forEach(([d, pos, pv, cash, cv], i) => {
    run(d, () => recordCollection(b, { key: 'seed-day-pos-' + i, date: d, accountId: 'pos-garanti', gross: pos, vat: pv, orderNo: 'Gün sonu ' + d.slice(8) + '.11', customer: 'POS satışları', delivered: true }));
    run(d, () => recordCollection(b, { key: 'seed-day-cash-' + i, date: d, accountId: 'cash-store', gross: cash, vat: cv, orderNo: 'Gün sonu ' + d.slice(8) + '.11', customer: 'Nakit satışlar', delivered: true }));
    run(addDays(d, 1), () => settlePos(b, { key: 'seed-day-settle-' + i, date: addDays(d, 1), posId: 'pos-garanti', bankId: 'bank-garanti', gross: pos, fee: Math.round(pos * 0.025) }));
  });
  // Kredi taksiti
  const loan = run('2026-11-15', () => recordDocument(b, { key: 'seed-loan', type: 'loan', partyId: 'kredi-garanti', docNo: 'Taksit 7/24', date: '2026-11-15', due: '2026-11-15', principal: T(25000), interest: T(6000), bsmv: T(300) }));
  run('2026-11-15', () => recordPayment(b, { key: 'seed-loan-pay', date: '2026-11-15', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(loan).id, amount: T(31300) }], ref: 'Otomatik tahsil' }));
  // Muhasebe ücreti: serbest meslek makbuzu, %20 stopaj (örnek)
  run('2026-11-15', () => recordDocument(b, { key: 'seed-smm', type: 'expense', partyId: 'muhasebe', categoryId: 'accounting', docNo: 'SMM-0381', date: '2026-11-15', due: '2026-11-25', net: T(10000), vat: T(2000), incomeWithheld: T(2000) }));
  // Kart ekstresi: kesim 17.11, son ödeme 24.11, ekstre 54.000 — sistemde bilinen 50.000
  const st = run('2026-11-17', () => recordDocument(b, { key: 'seed-statement', type: 'card-statement', cardId: 'card-garanti', docNo: 'Kasım ekstresi', date: '2026-11-17', due: '2026-11-24', total: T(54000), minimum: T(16200) }));
  run('2026-11-24', () => recordPayment(b, { key: 'seed-statement-pay', date: '2026-11-24', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(st).id, amount: T(54000) }], ref: 'Ekstre ödemesi' }));
  // Şahsi / aile: şirket hesabından ödenen şahsi sağlık sigortası → işletme gideri değil, ortak carisi
  const pers = run('2026-11-20', () => recordDocument(b, { key: 'seed-personal', type: 'personal', partyId: 'sigorta', date: '2026-11-20', due: '2026-11-21', amount: T(8000), beneficiary: 'Şirket sahibi', purpose: 'Şahsi sağlık sigortası' }));
  run('2026-11-21', () => recordPayment(b, { key: 'seed-personal-pay', date: '2026-11-21', method: 'transfer', accountId: 'bank-is', allocations: [{ obligationId: ob(pers).id, amount: T(8000) }] }));
  // Ekim muhtasar ve SGK tahakkukları (bordro kesintileriyle eşleşir)
  run('2026-11-20', () => recordDocument(b, { key: 'seed-muhtasar', type: 'tax', taxType: 'MUHTASAR', period: '2026-10', date: '2026-11-20', due: '2026-11-26', amount: T(6305.4) }));
  run('2026-11-20', () => recordDocument(b, { key: 'seed-sgk', type: 'tax', taxType: 'SGK', period: '2026-10', date: '2026-11-20', due: '2026-11-30', amount: T(17850) }));
  // Açık faturalar
  run('2026-11-21', () => recordDocument(b, { key: 'seed-elektrik', type: 'expense', partyId: 'elektrik', categoryId: 'utilities', docNo: 'ELK-99812', date: '2026-11-21', due: '2026-11-28', net: T(4500), vat: T(900) }));
  run('2026-11-23', () => recordDocument(b, { key: 'seed-cam', type: 'purchase', partyId: 'cam', docNo: 'CAM-18', date: '2026-11-23', due: '2026-12-10', net: T(40000), vat: T(8000), note: 'Stok cam alımı' }));
  b.today = '2026-11-25';
  // Tekrarlayan ödemeler ve Aralık için belgesi beklenen planlar
  saveTemplate(b, { label: 'Mağaza kirası', partyId: 'evsahibi', categoryId: 'rent', day: 5, amount: T(24000), withholding: true });
  saveTemplate(b, { label: 'İnternet', partyId: 'internet', categoryId: 'utilities', day: 15, amount: T(1200) });
  saveTemplate(b, { label: 'Muhasebe ücreti', partyId: 'muhasebe', categoryId: 'accounting', day: 25, amount: T(10000) });
  generateRecurring(b, '2026-12');
  b.audit = [];
  return b;
}
