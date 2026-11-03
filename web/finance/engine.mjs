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
  RECEIVABLE: { code: '120', label: 'Alıcılar (müşteri bakiyeleri)', type: 'asset' },
  INVENTORY: { code: '153', label: 'Ticari mallar (stok)', type: 'asset' },
  CARRY_VAT: { code: '190', label: 'Devreden KDV', type: 'asset' },
  INPUT_VAT: { code: '191', label: 'İndirilecek KDV', type: 'asset' },
  PREPAID_TAX: { code: '193', label: 'Peşin ödenen vergiler', type: 'asset' },
  OWNER: { code: '131', label: 'Ortaklardan alacaklar (şahsi / aile)', type: 'asset' },
  FIXED: { code: '255', label: 'Demirbaşlar', type: 'asset' },
  REVIEW: { code: 'ASKI', label: 'İnceleme / askı hesabı', type: 'asset' },
  LOAN: { code: '300', label: 'Banka kredileri', type: 'liability' },
  PAYABLE: { code: '320', label: 'Satıcılar ve hizmet firmaları', type: 'liability' },
  GRNI: { code: '329', label: 'Faturası gelmemiş mal kabulleri', type: 'liability' },
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
  SALES_RET: { code: '610', label: 'Satıştan iadeler (−)', type: 'income' },
  COGS: { code: '621', label: 'Satılan ticari mallar maliyeti', type: 'expense' },
  OTHER_INCOME: { code: '649', label: 'Kasa fazlası ve diğer gelirler', type: 'income' },
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
  ['stock-diff', 'Sayım ve fire farkları', 'opex', '770', true],
  ['dues', 'Aidat', 'opex', '770'],
  ['meal', 'Yemek / yan haklar', 'opex', '770'],
  ['bonus', 'Prim / ikramiye', 'opex', '770'],
  ['cleaning', 'Temizlik / sarf', 'opex', '770'],
  ['safety', 'İş güvenliği / OSGB', 'opex', '770'],
  ['social', 'Sosyal medya danışmanlığı', 'opex', '760'],
];
export const BRANCH_KINDS = { store: 'Mağaza', online: 'E-ticaret', hq: 'Merkez / ortak giderler' };
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
      { id: 'perakende', label: 'Perakende / fişli mağaza masrafı', type: 'service', active: true, system: true },
    ],
    branches: [{ id: 'main', label: 'Ana şube', kind: 'store', active: true, sellers: [], stockFrom: '', cashAccount: '' }],
    stock: { items: [], moves: [] },
    receipts: [],
    orders: [],
    budgets: {},
    cashCounts: [],
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
    if (existing.kind === 'pos' && input.pos) existing.pos = posConfig(input.pos, existing.pos);
    if (['card', 'bank'].includes(existing.kind) && input.limit !== undefined) existing.limit = Number(input.limit) || 0;
    return existing;
  }
  if (!MONEY_KINDS[input.kind]) throw Error('Hesap türünü seçin.');
  const row = {
    id: input.newId || slug(label, b.accounts, input.kind),
    label,
    kind: input.kind,
    iban: clean(input.iban || '').slice(0, 40),
    // Kart: kredi limiti. Banka: KMH (kredili mevduat) limiti; bakiye en fazla bu kadar eksiye düşebilir.
    limit: ['card', 'bank'].includes(input.kind) ? Number(input.limit) || 0 : 0,
    active: true,
    ...(input.kind === 'pos' ? { pos: posConfig(input.pos) } : {}),
  };
  b.accounts.push(row);
  return row;
}
/**
 * POS ayarı. rates: taksit sayısı → komisyon (onbinde; 249 = %2,49). settleDays: valör (kaç gün sonra bankaya geçer).
 * auto=false (varsayılan): komisyon ertesi gün banka ekstresinden muhasebeci tarafından girilir; oranlar yalnızca tahmindir.
 * auto=true: bankaya geçiş, tanımlı orana göre otomatik hesaplanabilir.
 */
function posConfig(input = {}, prev = {}) {
  const c = { bankId: prev.bankId || '', settleDays: 1, rates: {}, auto: false, ...prev };
  if (input.bankId !== undefined) c.bankId = input.bankId;
  if (input.settleDays !== undefined) {
    const d = Number(input.settleDays);
    if (!Number.isInteger(d) || d < 0 || d > 60) throw Error('Valör 0–60 gün olmalı.');
    c.settleDays = d;
  }
  if (input.auto !== undefined) c.auto = !!input.auto;
  if (input.rates) {
    const r = {};
    for (const [k, v] of Object.entries(input.rates)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 1 || n > 12) throw Error('Taksit sayısı 1–12 olmalı.');
      if (v === '' || v === null || v === undefined) continue;
      if (!Number.isInteger(v) || v < 0 || v > 5000) throw Error('Komisyon oranı geçersiz.');
      r[n] = v;
    }
    c.rates = r;
  }
  return c;
}
export function saveBranch(b, input) {
  const existing = input.id && b.branches.find((x) => x.id === input.id);
  const label = uniqueLabel(b.branches, input.label, input.id);
  const sellers = (input.sellers || []).map(clean).filter(Boolean).slice(0, 20);
  if (input.stockFrom && !b.branches.some((x) => x.id === input.stockFrom)) throw Error('Stok şubesi bulunamadı.');
  if (existing) {
    Object.assign(existing, { label, sellers, stockFrom: input.stockFrom ?? existing.stockFrom, cashAccount: input.cashAccount ?? existing.cashAccount });
    return existing;
  }
  if (!BRANCH_KINDS[input.kind]) throw Error('Şube türünü seçin.');
  const row = { id: input.newId || slug(label, b.branches, 'sb'), label, kind: input.kind, active: true, sellers, stockFrom: input.stockFrom || '', cashAccount: input.cashAccount || '' };
  b.branches.push(row);
  return row;
}
export function defaultBranch(b) {
  return (b.branches.find((x) => x.active && x.kind !== 'hq') || b.branches[0]).id;
}
function hqBranch(b) {
  return (b.branches.find((x) => x.active && x.kind === 'hq') || b.branches.find((x) => x.id === defaultBranch(b))).id;
}
function branchOf(b, id) {
  const br = b.branches.find((x) => x.id === (id || defaultBranch(b)));
  if (!br || !br.active) throw Error('Aktif bir şube / masraf merkezi seçin.');
  return br;
}
/** Satış temsilcisine göre şube (ör. "İnternet (Online)" → E-ticaret). */
export function branchForSeller(b, seller) {
  const s = clean(seller).toLocaleLowerCase('tr-TR');
  return (s && b.branches.find((x) => x.active && x.sellers.some((y) => s.includes(y.toLocaleLowerCase('tr-TR'))))?.id) || defaultBranch(b);
}
function cleanAttachments(list) {
  const out = [];
  for (const a of list || []) {
    const name = clean(a.name).slice(0, 120);
    if (!a.id || !name) throw Error('Ek dosya bilgisi eksik.');
    if (!/^(application\/pdf|image\/(png|jpeg|webp|heic))$/.test(a.type)) throw Error(name + ': yalnızca PDF, JPG, PNG, WEBP veya HEIC eklenebilir.');
    if (!Number.isSafeInteger(a.size) || a.size <= 0 || a.size > 10 * 1024 * 1024) throw Error(name + ': dosya en fazla 10 MB olabilir.');
    out.push({ id: String(a.id).slice(0, 60), name, type: a.type, size: a.size });
  }
  if (out.length > 10) throw Error('En fazla 10 ek dosya.');
  return out;
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
  const rows = { accounts: b.accounts, parties: b.parties, categories: b.categories, templates: b.templates, branches: b.branches }[collection];
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
  // Nakit kasa eksiye düşemez. Banka hesabı yalnızca tanımlı KMH limiti kadar eksiye düşebilir (KMH gelir değildir,
  // hesabın eksi bakiyesidir; kapatılması da gider değildir).
  const rollback = (msg) => {
    for (const [x] of fresh) {
      b.entries.splice(b.entries.findIndex((y) => y.key === x.key), 1);
      delete b.entryKeys[x.key];
    }
    throw Error(msg);
  };
  for (const a of b.accounts.filter((x) => x.kind === 'cash' || (x.kind === 'bank' && x.limit > 0))) {
    for (const [e] of fresh) {
      if (!e.lines.some((l) => l.account === a.id)) continue;
      const bal = balance(b, a.id, { asOf: e.date });
      if (a.kind === 'cash' && bal < 0) rollback(a.label + ' ' + e.date + ' tarihinde eksi bakiyeye düşer.');
      if (a.kind === 'bank' && bal < -a.limit) rollback(a.label + ' ' + e.date + ' tarihinde KMH limitini aşar.');
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
export function balance(b, account, { asOf = '9999-12-31', party, instrument, review, order } = {}) {
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
        (review === undefined || l.review === review) &&
        (order === undefined || l.order === order),
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
  return { docNo, note: clean(input.note).slice(0, 400), due: input.due || input.date, branch: branchOf(b, input.branchId), attachments: cleanAttachments(input.attachments) };
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
  const doc = { id, type: input.type, date: input.date, due: base.due, docNo: base.docNo, note: base.note, period: input.period || input.date.slice(0, 7), branchId: base.branch.id, attachments: base.attachments };
  let stockMoves = [];
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
      if (input.type === 'purchase' && input.receiptId) {
        // Mal kabulü (irsaliye) daha önce stoğa girdi: fatura GRNI'yi kapatır; fiyat farkı stok değerine yansır.
        const rc = b.receipts.find((x) => x.id === input.receiptId);
        if (!rc || rc.invoiced) throw Error('Faturalanmamış mal kabulü seçin.');
        if (rc.partyId && rc.partyId !== partyRow.id) throw Error('Mal kabulü başka bir firmaya ait.');
        ls.push(L('GRNI', rc.value, 0));
        const diff = net - rc.value;
        if (diff) {
          ls.push(L('INVENTORY', diff > 0 ? diff : 0, diff < 0 ? -diff : 0));
          stockMoves.push({ sku: rc.lines[0].sku, branch: rc.branchId, qty: 0, value: diff, type: 'price-variance' });
        }
        Object.assign(doc, { receiptId: rc.id, priceVariance: diff });
      } else {
        const sl = (input.type === 'purchase' ? input.lines || [] : []).filter((x) => x && x.qty);
        if (sl.length) {
          let t = 0;
          for (const x of sl) {
            if (!clean(x.sku)) throw Error('Stok satırında SKU eksik.');
            if (!Number.isSafeInteger(x.qty) || x.qty <= 0) throw Error(x.sku + ': adet pozitif tam sayı olmalı.');
            amt(x.unitCost, x.sku + ' birim maliyet');
            t += x.qty * x.unitCost;
          }
          if (t !== net) throw Error('Stok satırlarının toplamı (' + (t / 100).toLocaleString('tr-TR') + ' TL) matrahla aynı olmalı.');
          stockMoves = sl.map((x) => ({ sku: clean(x.sku), label: clean(x.label), branch: branchOf(b, x.branchId || base.branch.id).id, qty: x.qty, value: x.qty * x.unitCost, type: 'purchase' }));
          doc.stockLines = stockMoves.map((m) => ({ sku: m.sku, qty: m.qty, unitCost: m.value / m.qty }));
        }
        ls.push(L(input.type === 'capex' ? 'FIXED' : 'INVENTORY', net, 0));
      }
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
  // Vade planı (taksitli alış): ana firma borcu birden çok vadeye bölünür.
  if (input.schedule?.length) {
    const main = obligations.find((o) => ['party', 'staff', 'loan'].includes(o.kind));
    if (!main) throw Error('Bu belgede bölünecek firma borcu yok.');
    const parts = input.schedule.map((x, i) => {
      if (!isoDate(x.due) || x.due < input.date) throw Error((i + 1) + '. taksit vadesi geçersiz.');
      amt(x.amount, (i + 1) + '. taksit');
      return x;
    });
    if (parts.length > 36) throw Error('En fazla 36 taksit.');
    const tot = sum(parts, (x) => x.amount);
    if (tot !== main.amount) throw Error('Taksitlerin toplamı (' + (tot / 100).toLocaleString('tr-TR') + ' TL) ödenecek tutarla aynı olmalı (' + (main.amount / 100).toLocaleString('tr-TR') + ' TL).');
    const at = obligations.indexOf(main);
    obligations.splice(at, 1, ...parts.map((x, i) => ({ ...main, amount: x.amount, due: x.due, label: main.label + ' · taksit ' + (i + 1) + '/' + parts.length })));
    doc.schedule = parts.map((x) => ({ due: x.due, amount: x.amount }));
  }
  for (const l of ls) if (!l.branch) l.branch = base.branch.id;
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
    stockMoves,
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
    for (const m of plan.stockMoves) addMove(b, { ...m, date: plan.doc.date, ref: plan.doc.id });
    if (plan.doc.receiptId) b.receipts.find((x) => x.id === plan.doc.receiptId).invoiced = plan.doc.id;
    b.documents.push({ ...plan.doc, reversed: false, effects: plan.effects, pending: !!input.pending, enteredBy: input.enteredBy || '' });
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
  for (const m of b.stock.moves.filter((x) => x.ref === docId && x.qty > 0)) {
    if (stockQty(b, m.sku, m.branch) < m.qty) throw Error(m.sku + ' stoğu satılmış; alış faturası iptal yerine alış iadesi gerekir.');
  }
  const orig = b.entries.find((e) => e.key === 'doc:' + docId);
  if (orig) postAll(b, [reversal(orig, date, 'rev:doc:' + docId, reason)]);
  for (const m of b.stock.moves.filter((x) => x.ref === docId)) addMove(b, { ...m, id: undefined, date, qty: -m.qty, value: -m.value, type: 'reversal', ref: 'rev:' + docId });
  if (d.receiptId) b.receipts.find((x) => x.id === d.receiptId).invoiced = false;
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
      attachments: cleanAttachments(input.attachments),
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
    debit.branch = r.branchId || hqBranch(b);
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
// ───────────────────────── stok defteri (ortalama maliyet) ─────────────────────────
// Miktar şube (depo) bazında, maliyet SKU bazında hareketli ağırlıklı ortalamadır. Muhasebe stoğu (153) ile
// stok defteri değeri kapanış kontrolünde karşılaştırılır.
function ensureItem(b, { sku, label = '', category = '' }) {
  let it = b.stock.items.find((x) => x.sku === sku);
  if (!it) {
    it = { sku, label: clean(label) || sku, category: clean(category) };
    b.stock.items.push(it);
  } else if (label && it.label === sku) it.label = clean(label);
  return it;
}
function addMove(b, m) {
  ensureItem(b, m);
  b.stock.moves.push({ id: 'SH-' + (b.stock.moves.length + 1), date: m.date, sku: m.sku, branch: m.branch, qty: m.qty, value: m.value, type: m.type, ref: m.ref || '' });
}
export function stockQty(b, sku, branch, asOf = '9999-12-31') {
  return sum(b.stock.moves.filter((m) => m.sku === sku && (!branch || m.branch === branch) && m.date <= asOf), (m) => m.qty);
}
export function stockValue(b, sku, asOf = '9999-12-31') {
  return sum(b.stock.moves.filter((m) => (!sku || m.sku === sku) && m.date <= asOf), (m) => m.value);
}
/** Birim ortalama maliyet (kuruş, yuvarlanmış; çıkışta tam oran kullanılır). */
export function avgCost(b, sku, asOf) {
  const q = stockQty(b, sku, undefined, asOf);
  return q > 0 ? Math.round(stockValue(b, sku, asOf) / q) : 0;
}
function issue(b, sku, branch, qty, asOf) {
  const here = stockQty(b, sku, branch, asOf);
  if (qty > here) throw Error(sku + ': ' + (b.branches.find((x) => x.id === branch)?.label || branch) + ' stoğu yetersiz (' + here + ' adet). Negatif stok kapalı.');
  const q = stockQty(b, sku, undefined, asOf),
    v = stockValue(b, sku, asOf);
  return qty === q ? v : Math.round((v * qty) / q);
}
export function stockSummary(b, asOf = b.today) {
  const keys = [...new Set(b.stock.moves.map((m) => m.sku + '|' + m.branch))];
  return keys
    .map((k) => {
      const [sku, branch] = k.split('|');
      const qty = stockQty(b, sku, branch, asOf);
      const all = stockQty(b, sku, undefined, asOf);
      // Değer, SKU'nun toplam stok değerinden şube payıdır (ortalama yuvarlamasıyla 153 hesabından sapmaz).
      return { sku, branch, label: b.stock.items.find((x) => x.sku === sku)?.label || sku, qty, avg: avgCost(b, sku, asOf), value: all ? Math.round((stockValue(b, sku, asOf) * qty) / all) : 0 };
    })
    .filter((r) => r.qty || r.value);
}
function stockLines(b, list, defBranch) {
  return (list || []).filter((x) => x && x.qty).map((x) => {
    if (!clean(x.sku)) throw Error('SKU eksik.');
    if (!Number.isSafeInteger(x.qty) || x.qty <= 0) throw Error(x.sku + ': adet pozitif tam sayı olmalı.');
    return { sku: clean(x.sku), label: x.label, category: x.category, branch: branchOf(b, x.branchId || defBranch).id, qty: x.qty, unitCost: x.unitCost };
  });
}
export function openingStock(b, { key = 'opening-stock', date, lines: list }) {
  return once(b, key, { date, list }, () => {
    const ls = stockLines(b, list);
    ls.forEach((x) => amt(x.unitCost, x.sku + ' birim maliyet'));
    const value = sum(ls, (x) => x.qty * x.unitCost);
    postAll(b, [{ key: 'stk:' + key, date, kind: 'opening', memo: 'Açılış stoğu', lines: [L('INVENTORY', value, 0, { branch: ls[0].branch }), L('OPENING', 0, value)] }]);
    ls.forEach((x) => addMove(b, { ...x, date, value: x.qty * x.unitCost, type: 'opening', ref: key }));
    return value;
  });
}
/** Mal kabul (irsaliye / faturası sonra gelecek). Stok girer, "faturası gelmemiş mal" borcu oluşur. */
export function goodsReceipt(b, { key, date, partyId = '', branchId, lines: list, ref = '' }) {
  return once(b, key, { date, partyId, branchId, list, ref }, () => {
    if (partyId) activeParty(b, partyId, ['supplier']);
    const br = branchOf(b, branchId);
    const ls = stockLines(b, list, br.id);
    if (!ls.length) throw Error('En az bir stok satırı girin.');
    ls.forEach((x) => amt(x.unitCost, x.sku + ' birim maliyet'));
    const value = sum(ls, (x) => x.qty * x.unitCost);
    const id = nextId(b.receipts, 'MK');
    postAll(b, [{ key: 'grn:' + id, date, kind: 'goods-receipt', memo: 'Mal kabul ' + (clean(ref) || id) + (partyId ? ' · ' + party(b, partyId).label : ''), lines: [L('INVENTORY', value, 0, { branch: br.id }), L('GRNI', 0, value, { branch: br.id })] }]);
    ls.forEach((x) => addMove(b, { ...x, date, value: x.qty * x.unitCost, type: 'receipt', ref: id }));
    b.receipts.push({ id, date, partyId, branchId: br.id, value, lines: ls.map((x) => ({ sku: x.sku, qty: x.qty, unitCost: x.unitCost })), ref: clean(ref), invoiced: false });
    return id;
  });
}
/** Sayım: fark ortalama maliyetle "sayım ve fire farkları"na yazılır (eksik gider, fazla gider azaltır). */
export function stockCount(b, { key, date, sku, branchId, counted, note = '' }) {
  return once(b, key, { date, sku, branchId, counted, note }, () => {
    const br = branchOf(b, branchId);
    if (!Number.isSafeInteger(counted) || counted < 0) throw Error('Sayılan adet sıfır veya pozitif olmalı.');
    const now = stockQty(b, sku, br.id, date);
    const diff = counted - now;
    if (!diff) return 0;
    const unit = avgCost(b, sku, date);
    const value = diff < 0 ? -issue(b, sku, br.id, -diff, date) : diff * unit;
    if (value) postAll(b, [{ key: 'cnt:' + key, date, kind: 'stock-count', memo: 'Sayım farkı ' + sku + ' (' + (diff > 0 ? '+' : '') + diff + ')' + (note ? ' · ' + clean(note) : ''), lines: value < 0 ? [L('exp:stock-diff', -value, 0, { branch: br.id }), L('INVENTORY', 0, -value, { branch: br.id })] : [L('INVENTORY', value, 0, { branch: br.id }), L('exp:stock-diff', 0, value, { branch: br.id })] }]);
    addMove(b, { sku, branch: br.id, date, qty: diff, value, type: 'count', ref: key });
    return diff;
  });
}

// ───────────────────────── satış: sipariş föyü → tahsilat → teslim (hasılat + SMM) → iade ─────────────────────────
/** POS hesabını föydeki "Garanti 3 Taksit" gibi bilgiden bulur. */
export function posForCard(b, detail) {
  const s = clean(detail).toLocaleLowerCase('tr-TR');
  const pos = b.accounts.filter((a) => a.kind === 'pos' && a.active);
  const word = (l) => l.toLocaleLowerCase('tr-TR').replace(/ pos.*$/, '').replace(/\(.*\)/, '').trim();
  return (pos.find((a) => s && s.includes(word(a.label).split(' ')[0])) || pos.find((a) => /diğer/i.test(a.label)) || pos[0])?.id;
}
export function installmentsOf(detail) {
  const m = /(\d{1,2})\s*taksit/i.exec(String(detail || ''));
  return m ? Math.min(12, Math.max(1, Number(m[1]))) : 1;
}
function posExpectation(b, accId, date, gross, inst) {
  const a = b.accounts.find((x) => x.id === accId);
  if (a?.kind !== 'pos') return {};
  const rate = a.pos?.rates?.[inst];
  return { expectedDate: addDays(date, a.pos?.settleDays ?? 1), expectedFee: rate === undefined ? null : Math.round((gross * rate) / 10000) };
}
/** Satır brüt tutarlarını sipariş toplamına (indirim sonrası) göre dağıtır; KDV satır kategorisinin oranıyla ayrılır. */
function priceLines(order) {
  const raw = order.lines.map((l) => l.qty * l.unitPrice);
  const base = sum(raw);
  const ratio = base > 0 ? order.total / base : 0;
  let left = order.total;
  return order.lines.map((l, i) => {
    const gross = i === order.lines.length - 1 ? left : Math.round(raw[i] * ratio);
    left -= gross;
    const vat = Math.round((gross * l.vatRate) / (100 + l.vatRate));
    return { ...l, gross, vat, net: gross - vat };
  });
}
function collectionTarget(order) {
  return order.delivered ? 'RECEIVABLE' : 'ADVANCES_IN';
}
function postOrderPayment(b, order, p, key) {
  const acc = money(b, p.accountId, ['cash', 'bank', 'pos']);
  amt(p.amount, 'Tahsilat');
  if (p.date > b.today) throw Error('Gelecek tarihli tahsilat işlenemez.');
  const id = nextId(b.collections, 'TH');
  const inst = p.installments || 1;
  postAll(b, [{ key: 'col:' + key, date: p.date, kind: 'collection', memo: 'Tahsilat ' + order.no + ' · ' + order.customer + (acc.kind === 'pos' ? ' · ' + acc.label + (inst > 1 ? ' ' + inst + ' taksit' : ' tek çekim') : ''), lines: [L(acc.id, p.amount, 0, { ...(acc.kind === 'pos' ? {} : { cf: 'operating' }), branch: order.branchId }), L(collectionTarget(order), 0, p.amount, { order: order.id, branch: order.branchId })] }]);
  b.collections.push({ id, orderId: order.id, date: p.date, accountId: acc.id, gross: p.amount, vat: 0, installments: inst, orderNo: order.no, customer: order.customer, branchId: order.branchId, delivered: order.delivered, settled: 0, ...posExpectation(b, acc.id, p.date, p.amount, inst) });
  order.collected += p.amount;
  return id;
}
/**
 * Sipariş föyünden gelen kaydı finansa işler (idempotent). Yeni tahsilatlar avans olarak girer;
 * föyde durum "Teslim Edildi" olunca hasılat, KDV ve (SKU bağlı satırlar için) satılan malın maliyeti kaydedilir.
 * order: {id, no, date, customer, seller, branchId?, total, lines:[{label, qty, unitPrice, vatRate, category, sku?}],
 *         payments:[{amount, date, method:'cash'|'card', detail, accountId?}], delivered, deliveredOn}
 */
export function syncOrder(b, input) {
  if (!input.id || !clean(input.no)) throw Error('Sipariş numarası eksik.');
  const total = amt(input.total, 'Sipariş tutarı');
  const lines = (input.lines || []).map((l) => {
    if (!Number.isSafeInteger(l.qty) || l.qty <= 0) throw Error('Ürün adedi geçersiz.');
    amt(l.unitPrice, 'Birim fiyat', { zero: true });
    if (![0, 1, 10, 20].includes(l.vatRate)) throw Error((l.label || 'Ürün') + ': KDV oranı bilinmiyor (kategori seçin).');
    return { label: clean(l.label).slice(0, 120), qty: l.qty, unitPrice: l.unitPrice, vatRate: l.vatRate, category: clean(l.category), sku: clean(l.sku) };
  });
  if (!lines.length) throw Error('Siparişte ürün yok.');
  let order = b.orders.find((o) => o.id === input.id);
  const branchId = input.branchId || branchForSeller(b, input.seller);
  const br = branchOf(b, branchId);
  if (!order) {
    order = { id: input.id, no: clean(input.no), date: input.date, customer: clean(input.customer).slice(0, 80), seller: clean(input.seller), branchId: br.id, stockBranch: br.stockFrom || br.id, total, lines, collected: 0, paymentKeys: [], delivered: false, deliveredOn: '', returns: [], warnings: [], cancelled: false };
    b.orders.push(order);
  } else if (!order.delivered) {
    Object.assign(order, { customer: clean(input.customer).slice(0, 80), total, lines, seller: clean(input.seller) });
  } else if (total !== order.total || lines.length !== order.lines.length) {
    if (!order.warnings.includes('changed-after-delivery')) order.warnings.push('changed-after-delivery');
  }
  const result = { payments: 0, delivered: false };
  const seen = [];
  (input.payments || []).forEach((p, i) => {
    const k = order.id + ':' + p.date + ':' + p.amount + ':' + p.method + ':' + clean(p.detail) + ':' + seen.filter((x) => x === p.date + p.amount).length;
    seen.push(p.date + p.amount);
    if (order.paymentKeys.includes(k)) return;
    const accountId = p.accountId || (p.method === 'card' ? posForCard(b, p.detail) : br.cashAccount || b.accounts.find((a) => a.kind === 'cash' && a.active)?.id);
    postOrderPayment(b, order, { ...p, accountId, installments: installmentsOf(p.detail) }, k);
    order.paymentKeys.push(k);
    result.payments++;
  });
  if (order.paymentKeys.length > (input.payments || []).length && !order.warnings.includes('payment-removed')) order.warnings.push('payment-removed');
  if (input.delivered && !order.delivered) {
    deliverSale(b, order, input.deliveredOn && input.deliveredOn <= b.today ? input.deliveredOn : b.today);
    result.delivered = true;
  }
  return result;
}
function deliverSale(b, order, date) {
  const priced = priceLines(order);
  const ls = [];
  const applied = Math.min(order.collected - sum(order.returns, (r) => r.refund || 0), order.total);
  if (applied > 0) ls.push(L('ADVANCES_IN', applied, 0, { order: order.id, branch: order.branchId }));
  if (order.total - applied > 0) ls.push(L('RECEIVABLE', order.total - applied, 0, { order: order.id, branch: order.branchId }));
  for (const l of priced) {
    if (l.net) ls.push(L('SALES', 0, l.net, { branch: order.branchId }));
    if (l.vat) ls.push(L('OUTPUT_VAT', 0, l.vat, { branch: order.branchId }));
  }
  const moves = [];
  let cogs = 0;
  priced.forEach((l, i) => {
    l.cost = null;
    if (!l.sku) return;
    const c = issue(b, l.sku, order.stockBranch, l.qty, date);
    l.cost = c;
    cogs += c;
    moves.push({ sku: l.sku, branch: order.stockBranch, qty: -l.qty, value: -c, type: 'sale', ref: order.id + ':' + i });
  });
  if (cogs) ls.push(L('COGS', cogs, 0, { branch: order.branchId }), L('INVENTORY', 0, cogs, { branch: order.stockBranch }));
  postAll(b, [{ key: 'dlv:' + order.id, date, kind: 'delivery', memo: 'Teslim · hasılat ' + order.no + ' · ' + order.customer, lines: ls }]);
  moves.forEach((m) => addMove(b, { ...m, date }));
  order.lines = priced;
  order.delivered = true;
  order.deliveredOn = date;
  order.cogs = cogs;
  order.unlinked = sum(priced.filter((l) => !l.sku), (l) => l.net);
  b.collections.filter((c) => c.orderId === order.id).forEach((c) => (c.delivered = true));
}
export function deliverOrderById(b, { orderId, date = b.today }) {
  const o = b.orders.find((x) => x.id === orderId);
  if (!o || o.delivered || o.cancelled) throw Error('Teslim bekleyen sipariş bulunamadı.');
  deliverSale(b, o, date);
}
export function orderBalance(b, orderId) {
  // Pozitif: müşteri borçlu. Negatif: müşteriye iade edilecek / avans.
  return balance(b, 'RECEIVABLE', { order: orderId }) - balance(b, 'ADVANCES_IN', { order: orderId });
}
/**
 * İade / iptal. Teslim edilmediyse kapora iadesi (avans kapanır). Teslim edildiyse seçilen satırlar için satış iadesi
 * (610 + KDV düzeltmesi), stoğa geri giriş (teslimdeki maliyetle) ve isteğe bağlı para iadesi. Asıl kayıtlar silinmez.
 * input: {key, orderId, date, lines:[{index, qty}], refund:{accountId, amount}, restock, reason}
 */
export function returnOrder(b, input) {
  return once(b, input.key, { ...input, key: undefined }, () => {
    const o = b.orders.find((x) => x.id === input.orderId);
    if (!o || o.cancelled) throw Error('Sipariş bulunamadı.');
    if (!clean(input.reason)) throw Error('İade / iptal nedeni zorunlu.');
    const date = input.date || b.today;
    if (date > b.today) throw Error('Gelecek tarihli iade olamaz.');
    const ls = [];
    const moves = [];
    let credit = 0;
    const done = [];
    if (o.delivered) {
      for (const r of input.lines || []) {
        const l = o.lines[r.index];
        if (!l) throw Error('İade satırı bulunamadı.');
        const prev = sum(o.returns.flatMap((x) => x.lines).filter((x) => x.index === r.index), (x) => x.qty);
        if (!Number.isSafeInteger(r.qty) || r.qty <= 0 || prev + r.qty > l.qty) throw Error(l.label + ': iade adedi satılan adedi aşamaz.');
        const part = (v) => (prev + r.qty === l.qty ? v - Math.round((v * prev) / l.qty) : Math.round((v * r.qty) / l.qty));
        const gross = part(l.gross),
          vat = part(l.vat);
        credit += gross;
        if (gross - vat) ls.push(L('SALES_RET', gross - vat, 0, { branch: o.branchId }));
        if (vat) ls.push(L('OUTPUT_VAT', vat, 0, { branch: o.branchId }));
        if (l.sku && l.cost && input.restock !== false) {
          const c = part(l.cost);
          ls.push(L('INVENTORY', c, 0, { branch: o.stockBranch }), L('COGS', 0, c, { branch: o.branchId }));
          moves.push({ sku: l.sku, branch: o.stockBranch, qty: r.qty, value: c, type: 'return', ref: o.id + ':' + r.index });
        }
        done.push({ index: r.index, qty: r.qty, gross });
      }
      if (!done.length && !input.refund?.amount) throw Error('İade edilecek satır seçin.');
      if (credit) ls.push(L('RECEIVABLE', 0, credit, { order: o.id, branch: o.branchId }));
    }
    const owed = -(orderBalance(b, o.id) - credit); // müşteriye borçlu olduğumuz tutar (iade sonrası)
    const refund = input.refund?.amount || 0;
    if (refund) {
      amt(refund, 'İade tutarı');
      if (refund > owed) throw Error('Para iadesi müşterinin alacağını (' + (Math.max(0, owed) / 100).toLocaleString('tr-TR') + ' TL) aşamaz.');
      const acc = money(b, input.refund.accountId, ['cash', 'bank', 'pos']);
      if (acc.kind === 'pos' && balance(b, acc.id, { asOf: date }) < refund) throw Error(acc.label + ' bakiyesi yetersiz; iadeyi bankadan yapın.');
      ls.push(L(o.delivered ? 'RECEIVABLE' : 'ADVANCES_IN', refund, 0, { order: o.id, branch: o.branchId }), L(acc.id, 0, refund, acc.kind === 'pos' ? {} : { cf: 'operating' }));
    }
    if (!ls.length) throw Error('İşlenecek iade yok.');
    postAll(b, [{ key: 'ret:' + input.key, date, kind: 'refund', memo: (o.delivered ? 'Satış iadesi ' : 'Sipariş iptali / kapora iadesi ') + o.no + ' · ' + clean(input.reason), lines: ls }]);
    moves.forEach((m) => addMove(b, { ...m, date }));
    o.returns.push({ date, lines: done, credit, refund, reason: clean(input.reason) });
    if (!o.delivered && refund && orderBalance(b, o.id) === 0) o.cancelled = true;
    audit(b, o.delivered ? 'Satış iadesi' : 'Sipariş iptali', o.id, input.reason);
    return true;
  });
}
/** Föy dışı toplu tahsilat (ör. gün sonu özeti). Stok satırı yoksa maliyet bağlanmamış satış olarak işaretlenir. */
export function recordCollection(b, { key, date, accountId, gross, vat = 0, orderNo, customer, delivered = false, installments = 1, branchId }) {
  return once(b, key, { date, accountId, gross, vat, orderNo, customer, delivered, installments, branchId }, () => {
    const acc = money(b, accountId, ['cash', 'bank', 'pos']);
    const br = branchOf(b, branchId);
    amt(gross, 'Tahsilat');
    amt(vat, 'KDV', { zero: true });
    if (vat >= gross) throw Error('KDV tahsilat tutarından küçük olmalı.');
    const id = nextId(b.collections, 'TH');
    const ls = [L(acc.id, gross, 0, { ...(acc.kind === 'pos' ? {} : { cf: 'operating' }), branch: br.id })];
    if (delivered) ls.push(L('SALES', 0, gross - vat, { branch: br.id }), ...(vat ? [L('OUTPUT_VAT', 0, vat, { branch: br.id })] : []));
    else ls.push(L('ADVANCES_IN', 0, gross, { order: 'col:' + id, branch: br.id }));
    postAll(b, [{ key: 'col:' + id, date, kind: 'collection', memo: 'Tahsilat ' + clean(orderNo) + ' · ' + clean(customer), lines: ls }]);
    b.collections.push({ id, date, accountId, gross, vat, orderNo: clean(orderNo), customer: clean(customer), delivered, deliveredOn: delivered ? date : '', installments, branchId: br.id, settled: 0, unlinked: delivered ? gross - vat : 0, ...posExpectation(b, acc.id, date, gross, installments) });
    return id;
  });
}
export function deliverOrder(b, { collectionId, date = b.today }) {
  const c = b.collections.find((x) => x.id === collectionId);
  if (!c || c.delivered || c.orderId) throw Error('Teslim bekleyen tahsilat bulunamadı.');
  postAll(b, [{ key: 'dlv:' + c.id, date, kind: 'delivery', memo: 'Teslim · hasılat ' + c.orderNo, lines: [L('ADVANCES_IN', c.gross, 0, { order: 'col:' + c.id, branch: c.branchId }), L('SALES', 0, c.gross - c.vat, { branch: c.branchId }), ...(c.vat ? [L('OUTPUT_VAT', 0, c.vat, { branch: c.branchId })] : [])] }]);
  c.delivered = true;
  c.deliveredOn = date;
  c.unlinked = c.gross - c.vat;
}

// ───────────────────────── POS → banka ─────────────────────────
/** Bankaya geçmeyi bekleyen POS tahsilatları ve tanımlı orana göre tahmini komisyon. */
export function posPending(b, posId, asOf = b.today) {
  const rows = b.collections
    .filter((c) => c.accountId === posId && c.gross - (c.settled || 0) > 0)
    .map((c) => ({ ...c, open: c.gross - (c.settled || 0) }));
  const due = rows.filter((c) => (c.expectedDate || c.date) <= asOf);
  return { rows, gross: sum(rows, (c) => c.open), due: sum(due, (c) => c.open), dueFee: due.every((c) => c.expectedFee !== null && c.expectedFee !== undefined) ? sum(due, (c) => Math.round(((c.expectedFee || 0) * c.open) / c.gross)) : null, unknownRates: rows.filter((c) => c.expectedFee === null || c.expectedFee === undefined).length };
}
/** POS bloke çözümü: brüt POS alacağı bankaya net geçer, komisyon gider olur. Tahsilatlar eski tarihliden başlayarak kapanır. */
export function settlePos(b, { key, date, posId, bankId, gross, fee }) {
  return once(b, key, { date, posId, bankId, gross, fee }, () => {
    const pos = money(b, posId, ['pos']),
      bank = money(b, bankId, ['bank']);
    amt(gross, 'Brüt tutar');
    amt(fee, 'Komisyon', { zero: true });
    if (fee >= gross) throw Error('Komisyon brüt tutardan küçük olmalı.');
    if (gross > balance(b, pos.id, { asOf: date })) throw Error('POS hesabında bu kadar bekleyen tahsilat yok.');
    const firstOpen = b.collections.filter((x) => x.accountId === pos.id && x.gross - (x.settled || 0) > 0).sort((x, y) => x.date.localeCompare(y.date))[0];
    postAll(b, [{ key: 'pos:' + key, date, kind: 'pos-settlement', memo: 'POS → ' + bank.label + ' · ' + pos.label, lines: [L(bank.id, gross - fee, 0, { cf: 'operating' }), ...(fee ? [L('exp:pos-fee', fee, 0, { branch: firstOpen?.branchId || defaultBranch(b) })] : []), L(pos.id, 0, gross)] }]);
    let left = gross;
    for (const c of b.collections.filter((x) => x.accountId === pos.id).sort((x, y) => x.date.localeCompare(y.date))) {
      const open = c.gross - (c.settled || 0);
      if (open <= 0) continue;
      const use = Math.min(open, left);
      c.settled = (c.settled || 0) + use;
      left -= use;
      if (!left) break;
    }
    return true;
  });
}
/** Otomatik mod: valörü gelmiş tahsilatları tanımlı komisyon oranıyla bankaya aktarır. */
export function settlePosAuto(b, { key, posId, date = b.today }) {
  const pos = money(b, posId, ['pos']);
  if (!pos.pos?.auto) throw Error(pos.label + ' için otomatik hesaplama kapalı; komisyonu ekstreden girin.');
  if (!pos.pos.bankId) throw Error(pos.label + ' için hesabın geçtiği banka tanımlı değil.');
  const pp = posPending(b, posId, date);
  if (!pp.due) throw Error('Valörü gelmiş POS tahsilatı yok.');
  if (pp.dueFee === null) throw Error('Bazı taksit seçenekleri için komisyon oranı tanımlı değil.');
  return settlePos(b, { key, date, posId, bankId: pos.pos.bankId, gross: pp.due, fee: pp.dueFee });
}

// ───────────────────────── mağaza kasası: personel masrafı ve gün sonu sayımı ─────────────────────────
export const STAFF_EXPENSE_CATEGORIES = ['cleaning', 'cargo', 'meal', 'maintenance', 'other'];
/** Satış personelinin kasadan yaptığı küçük masraf. Belge + nakit ödeme birlikte; muhasebe onayı bekler. */
export function pettyExpense(b, { key, date, branchId, accountId, amount, vat = 0, categoryId, note, hasReceipt = false, attachments = [], by = '' }) {
  return once(b, key, { date, branchId, accountId, amount, vat, categoryId, note, hasReceipt, attachments, by }, () => {
    if (!STAFF_EXPENSE_CATEGORIES.includes(categoryId)) throw Error('Masraf türünü seçin.');
    if (!clean(note)) throw Error('Masrafın ne için yapıldığını yazın.');
    amt(amount, 'Tutar');
    amt(vat, 'KDV', { zero: true });
    if (vat >= amount) throw Error('KDV tutardan küçük olmalı.');
    money(b, accountId, ['cash']);
    const docId = recordDocument(b, { key: 'petty-doc:' + key, type: 'expense', partyId: 'perakende', categoryId, branchId, date, net: amount - vat, vat, note: clean(note) + (hasReceipt ? ' · fiş/fatura var' : ' · BELGESİZ'), attachments, pending: true, enteredBy: by || 'personel' });
    const o = b.obligations.find((x) => x.docId === docId);
    recordPayment(b, { key: 'petty-pay:' + key, date, method: 'cash', accountId, allocations: [{ obligationId: o.id, amount }], ref: 'Mağaza kasası' });
    b.documents.find((d) => d.id === docId).hasReceipt = !!hasReceipt;
    return docId;
  });
}
/** Muhasebe onayı; kategori değiştiyse yeniden sınıflandırma fişi (nakit etkisi yok). */
export function approveExpense(b, { docId, categoryId, date = b.today }) {
  const d = b.documents.find((x) => x.id === docId);
  if (!d || !d.pending || d.reversed) throw Error('Onay bekleyen masraf bulunamadı.');
  const c = category(b, categoryId || d.categoryId);
  if (c.id !== d.categoryId)
    postAll(b, [{ key: 'reclass:' + docId, date, kind: 'reclassification', memo: 'Masraf sınıflandırma ' + docId + ': ' + catLabel(b, d.categoryId) + ' → ' + c.label, lines: [L('exp:' + c.id, d.net, 0, { branch: d.branchId }), L('exp:' + d.categoryId, 0, d.net, { branch: d.branchId })] }]);
  d.categoryId = c.id;
  d.pending = false;
  audit(b, 'Mağaza masrafı onaylandı', docId, c.label);
}
const catLabel = (b, id) => b.categories.find((c) => c.id === id)?.label || id;
/**
 * Gün sonu kasa sayımı. Önce bankaya yatırılan tutar virmanlanır, sonra sayılan nakit sistemle karşılaştırılır.
 * Açık: incelemeye (personel / hata / belgesiz masraf olabilir). Fazla: kasa fazlası geliri (649).
 */
export function cashCount(b, { key, date, accountId, counted, deposit, note = '', by = '' }) {
  return once(b, key, { date, accountId, counted, deposit, note, by }, () => {
    const acc = money(b, accountId, ['cash']);
    if (!Number.isSafeInteger(counted) || counted < 0) throw Error('Sayılan nakdi girin.');
    if (b.cashCounts.some((x) => x.accountId === acc.id && x.date === date)) throw Error(acc.label + ' için bu güne ait sayım zaten var.');
    if (deposit?.amount) transfer(b, { key: 'dep:' + key, date, from: acc.id, to: deposit.bankId, amount: deposit.amount, note: 'Gün sonu bankaya yatan' });
    const system = balance(b, acc.id, { asOf: date });
    const diff = counted - system;
    const id = nextId(b.cashCounts, 'KS');
    const cbr = (b.branches.find((x) => x.cashAccount === acc.id) || { id: defaultBranch(b) }).id;
    if (diff < 0) {
      postAll(b, [{ key: 'cc:' + id, date, kind: 'cash-count', memo: 'Kasa sayım açığı · ' + acc.label + (note ? ' · ' + clean(note) : ''), lines: [L('REVIEW', -diff, 0, { review: 'R-' + id }), L(acc.id, 0, -diff, { cf: 'operating' })] }]);
      b.reviews.push({ id: 'R-' + id, date, amount: -diff, branchId: cbr, source: 'Kasa sayım açığı', label: acc.label + ' ' + date + ': sayılan ' + (counted / 100).toLocaleString('tr-TR') + ' TL, sistem ' + (system / 100).toLocaleString('tr-TR') + ' TL', resolutions: [] });
    } else if (diff > 0) {
      postAll(b, [{ key: 'cc:' + id, date, kind: 'cash-count', memo: 'Kasa fazlası · ' + acc.label + (note ? ' · ' + clean(note) : ''), lines: [L(acc.id, diff, 0, { cf: 'operating' }), L('OTHER_INCOME', 0, diff, { branch: cbr })] }]);
    }
    b.cashCounts.push({ id, date, accountId: acc.id, counted, system, diff, deposit: deposit?.amount || 0, note: clean(note), by: clean(by) });
    return { id, diff, system };
  });
}

// ───────────────────────── bütçe (plan / fiili) ─────────────────────────
/** key: 'sales' | 'cogs' | kategori id. branchId '' = tüm işletme. */
export function setBudget(b, { period, branchId = '', key, amount }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw Error('Ay seçin.');
  if (branchId) branchOf(b, branchId);
  if (key !== 'sales' && key !== 'cogs') category(b, key);
  if (!Number.isSafeInteger(amount) || amount < 0) throw Error('Bütçe tutarı geçersiz.');
  const k = period + '|' + branchId + '|' + key;
  if (amount) b.budgets[k] = amount;
  else delete b.budgets[k];
}
export function copyBudget(b, { from, to, branchId = '' }) {
  let n = 0;
  for (const [k, v] of Object.entries(b.budgets)) {
    const [p, br, key] = k.split('|');
    if (p === from && br === branchId) {
      setBudget(b, { period: to, branchId, key, amount: v });
      n++;
    }
  }
  return n;
}
export function budgetReport(b, { period, branchId = '' }) {
  const [y, m] = period.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const pl = profitAndLoss(b, { from: period + '-01', to, branch: branchId || undefined });
  const plan = (key) => b.budgets[period + '|' + branchId + '|' + key] || 0;
  const rows = [
    { key: 'sales', label: 'Net satışlar', plan: plan('sales'), actual: pl.sales, income: true },
    { key: 'cogs', label: 'Satılan malın maliyeti', plan: plan('cogs'), actual: pl.cogs },
    ...b.categories.filter((c) => c.active || pl.categories.some((x) => x.id === c.id)).map((c) => ({ key: c.id, label: c.label, plan: plan(c.id), actual: pl.categories.find((x) => x.id === c.id)?.amount || 0 })),
  ].filter((r) => r.plan || r.actual || r.key === 'sales' || r.key === 'cogs');
  rows.forEach((r) => (r.variance = r.income ? r.actual - r.plan : r.plan - r.actual));
  const planResult = plan('sales') - sum(rows.filter((r) => !r.income), (r) => r.plan);
  return { period, rows, planResult, actualResult: pl.result - pl.otherIncome, elapsed: Math.min(1, Math.max(0, (Date.parse(b.today) - Date.parse(period + '-01') + 86400000) / (Date.parse(to) - Date.parse(period + '-01') + 86400000))) };
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
/** 3) Gelir tablosu etkisi (tahakkuk esaslı; ödemeler gider yaratmaz). branch verilirse yalnızca o şubenin satırları. */
export function profitAndLoss(b, { from = '0000-01-01', to = b.today, branch } = {}) {
  const ls = lines(b, { from, asOf: to }).filter((l) => l.kind !== 'opening' && (!branch || (branch === '__none__' ? !l.branch : l.branch === branch)));
  const grossSales = sum(ls.filter((l) => l.account === 'SALES'), (l) => l.credit - l.debit);
  const returns = sum(ls.filter((l) => l.account === 'SALES_RET'), (l) => l.debit - l.credit);
  const cogs = sum(ls.filter((l) => l.account === 'COGS'), (l) => l.debit - l.credit);
  const otherIncome = sum(ls.filter((l) => l.account === 'OTHER_INCOME'), (l) => l.credit - l.debit);
  const cats = b.categories
    .map((c) => ({ ...c, amount: sum(ls.filter((l) => l.account === 'exp:' + c.id), (l) => l.debit - l.credit) }))
    .filter((c) => c.amount);
  const groups = Object.fromEntries(Object.keys(PL_GROUPS).map((g) => [g, sum(cats.filter((c) => c.pl === g), (c) => c.amount)]));
  const expenses = sum(cats, (c) => c.amount);
  const sales = grossSales - returns;
  // Stok satırı bağlanmamış teslim edilmiş satışlar: maliyeti bilinmiyor (brüt kâr olduğundan yüksek görünür).
  const inRange = (d) => d >= from && d <= to;
  const unlinked =
    sum(b.orders.filter((o) => o.delivered && inRange(o.deliveredOn) && (!branch || o.branchId === branch)), (o) => o.unlinked || 0) +
    sum(b.collections.filter((c) => !c.orderId && c.delivered && inRange(c.deliveredOn || c.date) && (!branch || c.branchId === branch)), (c) => c.unlinked || 0);
  return { grossSales, returns, sales, cogs, grossProfit: sales - cogs, otherIncome, categories: cats, groups, expenses, result: sales - cogs - expenses + otherIncome, unlinked };
}
/** Şube kâr/zararı. Merkez (ortak gider) ayrı sütundur; dağıtım anahtarı uygulanmaz. */
export function branchPL(b, range = {}) {
  const all = profitAndLoss(b, range);
  const rows = b.branches.filter((x) => x.active || profitAndLoss(b, { ...range, branch: x.id }).result).map((x) => ({ branch: x, pl: profitAndLoss(b, { ...range, branch: x.id }) }));
  const un = profitAndLoss(b, { ...range, branch: '__none__' });
  if (un.result || un.expenses || un.sales) rows.push({ branch: { id: '', label: 'Atanmamış', kind: 'hq' }, pl: un });
  return { rows, total: all };
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
  const kindOut = (k) => sum(cash.rows.filter((r) => r.kind === k), (r) => r.amount);
  const refunds = kindOut('refund'),
    counts = kindOut('cash-count');
  return { ...parts, refunds, counts, cashOut: cash.out, reversals, other: cash.out - reversals - cashFromPayments - refunds - counts, expenses: profitAndLoss(b, { from, to }).expenses };
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
    .filter((a) => a.active && ['bank', 'card'].includes(a.kind) && b.entries.some((e) => e.lines.some((l) => l.account === a.id)))
    .map((a) => ({ account: a, last: [...b.reconciliations].reverse().find((r) => r.accountId === a.id) }));
  const cards = b.accounts.filter((a) => a.kind === 'card' && balance(b, a.id, { asOf }) < 0);
  const negBanks = b.accounts.filter((a) => a.kind === 'bank' && balance(b, a.id, { asOf }) < 0 && !a.limit);
  const kmh = b.accounts.filter((a) => a.kind === 'bank' && a.limit && balance(b, a.id, { asOf }) < 0);
  const stockGap = balance(b, 'INVENTORY', { asOf }) - stockValue(b, undefined, asOf);
  const pendingPetty = b.documents.filter((d) => d.pending && !d.reversed);
  const pl = profitAndLoss(b, { to: asOf });
  const checks = [
    { ok: tb.debit === tb.credit, label: 'Tüm fişler dengeli (mizan borç = alacak)', detail: tb.debit === tb.credit ? 'Dengeli' : 'Fark var' },
    { ok: !review.length, label: 'İnceleme hesabında bekleyen fark yok', detail: review.length ? review.length + ' kalem, ' + TL(sum(review, (r) => r.remaining)) : 'Temiz', link: 'review' },
    { ok: recon.every((r) => r.last && r.last.difference === 0), label: 'Banka ve kart hesapları ekstreyle mutabık', detail: recon.filter((r) => !r.last || r.last.difference !== 0).map((r) => r.account.label).join(', ') || 'Tamam', link: 'reconcile' },
    { ok: !overdue.length, label: 'Vadesi geçmiş ödeme yok', detail: overdue.length ? overdue.length + ' kalem gecikmiş' : 'Yok', link: 'payables' },
    { ok: !negBanks.length, label: 'KMH tanımı olmayan banka hesabı eksi bakiyede değil', detail: negBanks.map((a) => a.label).join(', ') || 'Tamam' },
    { ok: true, info: true, label: 'KMH kullanımı (banka borcu, bilgi)', detail: kmh.map((a) => a.label + ' ' + TL(-balance(b, a.id, { asOf }))).join(', ') || 'Kullanılmıyor' },
    { ok: balance(b, 'ADVANCES_IN', { asOf }) === 0, label: 'Teslim bekleyen sipariş avansı (bilgi)', detail: TL(balance(b, 'ADVANCES_IN', { asOf })) + ' avans; teslimde hasılata döner', info: true },
    { ok: true, label: 'İndirilecek KDV muhasebeci onayı bekliyor (bilgi)', detail: TL(balance(b, 'INPUT_VAT', { asOf })), info: true },
    { ok: !cards.length, label: 'Kart alacakları (fazla ödeme) izlenir', detail: cards.map((a) => a.label).join(', ') || 'Yok', info: true },
    { ok: stockGap === 0, label: 'Muhasebe stoğu (153) stok defteriyle tutarlı', detail: stockGap ? 'Fark ' + TL(stockGap) + ' (SKU satırı girilmeden kaydedilen alış olabilir)' : 'Tutarlı' },
    { ok: !pendingPetty.length, label: 'Onay bekleyen mağaza masrafı yok', detail: pendingPetty.length ? pendingPetty.length + ' masraf, ' + TL(sum(pendingPetty, (d) => d.total)) : 'Yok', link: 'review' },
    { ok: balance(b, 'GRNI', { asOf }) === 0, label: 'Faturası gelmemiş mal kabulü yok', detail: TL(balance(b, 'GRNI', { asOf })), info: true },
    { ok: !pl.unlinked, label: 'Satışların maliyeti stoğa bağlı', detail: pl.unlinked ? TL(pl.unlinked) + ' satışta SKU yok; brüt kâr olduğundan yüksek görünür' : 'Tamam', info: true },
    { ok: true, info: true, label: 'Tahsil edilmemiş teslim edilmiş satış (bilgi)', detail: TL(balance(b, 'RECEIVABLE', { asOf })) },
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
  // Tanımlar işletmenin yönetim Excel'indeki banka, POS, kart, tedarikçi ve gider kalemlerinden alınmıştır.
  // Tutarlar sentetiktir; gerçek bakiye ve ödeme kayıtları depoya konmaz.
  [
    ['bank-garanti', 'Garanti BBVA · TL', 'bank', 0],
    ['bank-teb', 'TEB · TL', 'bank', 0],
    ['bank-ziraat', 'Ziraat Bankası · TL (KMH)', 'bank', T(500000)],
    ['bank-akbank', 'Akbank · TL', 'bank', 0],
    ['bank-yapikredi', 'Yapı Kredi · TL', 'bank', 0],
    ['bank-is', 'İş Bankası · TL', 'bank', 0],
    ['bank-qnb', 'QNB · TL', 'bank', 0],
    ['bank-halkbank', 'Halkbank · TL', 'bank', 0],
    ['cash-store', 'Atrium mağaza kasası', 'cash', 0],
    ['cash-hq', 'Merkez kasa', 'cash', 0],
    ['card-garanti', 'Garanti şirket kartı', 'card', T(150000)],
    ['card-ziraat', 'Ziraat şirket kartı', 'card', T(600000)],
    ['card-isbank', 'İş Bankası şirket kartı', 'card', T(50000)],
    ['card-qnb', 'QNB şirket kartı', 'card', T(50000)],
    ['pos-garanti', 'Garanti POS', 'pos', 0],
    ['pos-teb', 'TEB POS', 'pos', 0],
    ['pos-akbank', 'Akbank POS', 'pos', 0],
    ['pos-ziraat', 'Ziraat POS', 'pos', 0],
    ['pos-yapikredi', 'Yapı Kredi POS', 'pos', 0],
    ['pos-is', 'İş Bankası POS', 'pos', 0],
    ['pos-qnb', 'QNB POS', 'pos', 0],
    ['pos-halkbank', 'Halkbank POS', 'pos', 0],
    ['pos-vakif', 'TZH Vakıf (diğer POS)', 'pos', 0],
  ].forEach(([id, label, kind, limit]) => saveMoneyAccount(b, { newId: id, label, kind, limit }));

  const suppliers = [
    // Optik (çerçeve / güneş)
    'Ant Optik', 'BDT Optik', 'Cem-Fa Gözlük', 'Derigo Gözlük', 'Dita İthalat', 'Emko Optik', 'Marchon', 'Hantes', 'Hazel Optik', 'Mercan Optik', 'Merve Optik', 'Mykita', 'Optomod', 'Optiser', 'Safilo', 'Ser Optik', 'Turkuaz Toptan', 'Opticmet (Vanni)', 'Armati', 'Platin Optik', 'Opka Optik', 'Asal Optik', 'Maybach',
    // Cam
    'Adellens', 'Beta Optik', 'Turkuaz General', 'Opsa Camlar', 'Opak Optik', 'Sektör Optik', 'Opticon', 'Demirkaya', 'Hoya',
    // Lens
    'Opak Lens', 'Tech Contact Lens', 'Lens Medikal', 'Zepa Lens', 'Optik Dünyası',
  ];
  suppliers.forEach((label) => saveParty(b, { label, type: 'supplier' }));
  [
    ['lux', 'Luxottica Türkiye (Ziraat DBS)', 'supplier', ''],
    ['seiko', 'Seiko Optical', 'supplier', ''],
    ['cam', 'Örnek Cam Tedarikçisi', 'supplier', ''],
    ['ajans', 'Kargo / reklam ajansı', 'service', 'advertising'],
    ['sosyal', 'Sosyal medya danışmanı', 'service', 'social'],
    ['muhasebe', 'Mali müşavir', 'service', 'accounting'],
    ['ikas', 'İkas / yazılım abonelikleri', 'service', 'software'],
    ['axa', 'Axa Sigorta', 'service', 'insurance'],
    ['osgb', 'İş güvenliği firması', 'service', 'safety'],
    ['elektrik', 'Elektrik dağıtım şirketi', 'service', 'utilities'],
    ['internet', 'Telefon / internet operatörü', 'service', 'utilities'],
    ['evsahibi', 'Atrium mağaza kiraya veren', 'landlord', 'rent'],
    ['avm', 'Atrium AVM yönetimi (aidat)', 'service', 'dues'],
    ['merkez-ev', 'Merkez ofis kiraya veren', 'landlord', 'rent'],
    ['sigorta', 'Örnek Sigorta A.Ş.', 'personal', ''],
    ['sahsi-kart', 'Ortakların şahsi kredi kartları', 'personal', ''],
    ['aile', 'Aile / ev giderleri', 'personal', ''],
    ['kredi-garanti', 'Garanti BBVA · işletme kredisi', 'bank', ''],
  ].forEach(([id, label, type, defaultCategory]) => saveParty(b, { newId: id, label, type, defaultCategory }));

  // Şubeler: Atrium mağaza, E-ticaret (sosyal medya / ajans giderleri ve online satışlar), Merkez (ortak giderler).
  b.branches = [];
  saveBranch(b, { newId: 'atrium', label: 'Atrium mağaza', kind: 'store', cashAccount: 'cash-store' });
  saveBranch(b, { newId: 'online', label: 'E-ticaret', kind: 'online', sellers: ['Fahri Can', 'İnternet'], stockFrom: 'atrium', cashAccount: 'cash-store' });
  saveBranch(b, { newId: 'merkez', label: 'Merkez (ortak giderler)', kind: 'hq', cashAccount: 'cash-hq' });
  // POS: föydeki örnek komisyon tablosu (onbinde). Komisyon varsayılan olarak ekstreden elle girilir; sanal POS otomatik.
  const rates = { 1: 350, 2: 700, 3: 900, 4: 1069, 5: 1249, 6: 1449 };
  for (const [id, bankId] of [['pos-garanti', 'bank-garanti'], ['pos-teb', 'bank-teb'], ['pos-akbank', 'bank-akbank'], ['pos-ziraat', 'bank-ziraat'], ['pos-yapikredi', 'bank-yapikredi'], ['pos-is', 'bank-is'], ['pos-qnb', 'bank-qnb'], ['pos-halkbank', 'bank-halkbank'], ['pos-vakif', 'bank-garanti']])
    saveMoneyAccount(b, { id, label: b.accounts.find((x) => x.id === id).label, pos: { bankId, settleDays: 1, rates, auto: false } });
  saveMoneyAccount(b, { newId: 'pos-online', label: 'E-ticaret sanal POS', kind: 'pos', pos: { bankId: 'bank-garanti', settleDays: 2, rates: { 1: 299, 3: 899, 6: 1449 }, auto: true } });

  b.today = '2026-11-01';
  postOpening(b, {
    date: '2026-11-01',
    items: [
      { account: 'bank-garanti', amount: T(320000) },
      { account: 'bank-is', amount: T(185000) },
      { account: 'bank-teb', amount: T(60000) },
      { account: 'cash-store', amount: T(6000) },
      { account: 'PAYABLE', party: 'seiko', amount: T(50000) },
      { account: 'LOAN', party: 'kredi-garanti', amount: T(300000) },
    ],
    dues: { 'seiko:PAYABLE': { due: '2026-11-10', label: 'Seiko · önceki alıştan devreden borç', method: 'card', accountId: 'card-garanti' } },
  });
  openingStock(b, {
    date: '2026-11-01',
    lines: [
      { sku: 'GOZ-001', label: 'Ray-Ban RX5154 · Siyah [2000]', branchId: 'atrium', qty: 8, unitCost: T(4000) },
      { sku: 'CAM-001', label: 'Seiko örnek stok camı +1.00', branchId: 'atrium', qty: 20, unitCost: T(900) },
      { sku: 'LEN-001', label: 'Demo Lens Color -1.00 Ela', branchId: 'atrium', qty: 6, unitCost: T(600) },
    ],
  });
  const run = (day, fn) => {
    b.today = day;
    return fn();
  };
  const ob = (docId) => b.obligations.find((o) => o.docId === docId);
  // Kira: şahıs ev sahibi, brüt 30.000, %20 stopaj (örnek oran) → ev sahibine 24.000
  const rent = run('2026-11-01', () => recordDocument(b, { key: 'seed-rent', type: 'expense', partyId: 'evsahibi', categoryId: 'rent', branchId: 'atrium', docNo: 'KİRA-2026-11', date: '2026-11-01', due: '2026-11-05', net: T(30000), incomeWithheld: T(6000), period: '2026-11' }));
  run('2026-11-05', () => recordPayment(b, { key: 'seed-rent-pay', date: '2026-11-05', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(rent).id, amount: T(24000) }], ref: 'EFT-55120' }));
  // Ekim bordrosu (örnek kesinti tutarları)
  const pay = run('2026-11-01', () => recordDocument(b, { key: 'seed-payroll', type: 'payroll', branchId: 'atrium', date: '2026-11-01', due: '2026-11-05', period: '2026-10', gross: T(60000), employeeSgk: T(8400), employerSgk: T(9450), incomeTax: T(5850), stampTax: T(455.4) }));
  run('2026-11-05', () => recordPayment(b, { key: 'seed-payroll-pay', date: '2026-11-05', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(pay).id, amount: remaining(ob(pay)) }], ref: 'Maaş toplu EFT' }));
  // Luxottica mal alışı (SKU satırlı) → 05.11 çek verildi, vadesi 30.11 (nakit çıkışı vadede)
  const lux = run('2026-11-03', () => recordDocument(b, { key: 'seed-lux', type: 'purchase', partyId: 'lux', branchId: 'atrium', docNo: 'LUX-2048', date: '2026-11-03', due: '2026-11-05', net: T(200000), vat: T(20000), note: 'Kasım çerçeve alımı', lines: [{ sku: 'GOZ-001', qty: 50, unitCost: T(4000) }] }));
  run('2026-11-05', () => recordPayment(b, { key: 'seed-lux-cheque', date: '2026-11-05', method: 'cheque', accountId: 'bank-garanti', allocations: [{ obligationId: ob(lux).id, amount: T(220000) }], instrument: { no: 'CK-2026-018', maturity: '2026-11-30' } }));
  // Reklam ajansı: KDV tevkifatlı hizmet (örnek 3/10) — e-ticaret gideri
  run('2026-11-06', () => recordDocument(b, { key: 'seed-ajans', type: 'expense', partyId: 'ajans', categoryId: 'advertising', branchId: 'online', docNo: 'HZ-112', date: '2026-11-06', due: '2026-11-22', net: T(15000), vat: T(3000), vatWithheld: T(900) }));
  // Sosyal medya danışmanlığı — e-ticaret gideri, ödendi
  const sos = run('2026-11-07', () => recordDocument(b, { key: 'seed-sosyal', type: 'expense', partyId: 'sosyal', categoryId: 'social', branchId: 'online', docNo: 'SM-11', date: '2026-11-07', due: '2026-11-10', net: T(20000), vat: T(4000) }));
  run('2026-11-10', () => recordPayment(b, { key: 'seed-sosyal-pay', date: '2026-11-10', method: 'transfer', accountId: 'bank-teb', allocations: [{ obligationId: ob(sos).id, amount: T(24000) }] }));
  // Seiko: devreden 50.000 borç 10.11 şirket kartıyla ödendi (kart borcu doğar, bankadan para çıkmaz)
  run('2026-11-10', () => recordPayment(b, { key: 'seed-seiko-card', date: '2026-11-10', method: 'card', accountId: 'card-garanti', allocations: [{ obligationId: b.obligations.find((o) => o.partyId === 'seiko').id, amount: T(50000) }], ref: 'Kart slip 4471' }));
  // Kasadan bankaya para yatırma (iç transfer)
  run('2026-11-12', () => transfer(b, { key: 'seed-deposit', date: '2026-11-12', from: 'cash-store', to: 'bank-is', amount: T(5000), note: 'Kasa fazlası yatırıldı' }));
  // Föy öncesi gün sonu özetleri (kalem detayı yok → maliyeti bağlanmamış satış olarak işaretlenir)
  [
    ['2026-11-05', T(68000), T(6181.82), T(9500), T(863.64)],
    ['2026-11-10', T(92000), T(8363.64), T(7200), T(654.55)],
  ].forEach(([d, pos, pv, cash, cv], i) => {
    run(d, () => recordCollection(b, { key: 'seed-day-pos-' + i, date: d, accountId: 'pos-garanti', gross: pos, vat: pv, orderNo: 'Gün sonu ' + d.slice(8) + '.11', customer: 'POS satışları (föy öncesi)', delivered: true, branchId: 'atrium' }));
    run(d, () => recordCollection(b, { key: 'seed-day-cash-' + i, date: d, accountId: 'cash-store', gross: cash, vat: cv, orderNo: 'Gün sonu ' + d.slice(8) + '.11', customer: 'Nakit satışlar (föy öncesi)', delivered: true, branchId: 'atrium' }));
    run(addDays(d, 1), () => settlePos(b, { key: 'seed-day-settle-' + i, date: addDays(d, 1), posId: 'pos-garanti', bankId: 'bank-garanti', gross: pos, fee: Math.round(pos * 0.035) }));
  });
  // Föy siparişleri (sipariş föyünden senkron). Fiyatlar KDV dahil birim fiyat.
  const frame = { label: 'Ray-Ban RX5154 · Siyah [2000]', qty: 1, unitPrice: T(8500), vatRate: 10, category: 'Optik Çerçeve', sku: 'GOZ-001' };
  const glass = { label: 'Seiko örnek stok camı +1.00', qty: 2, unitPrice: T(2250), vatRate: 10, category: 'Optik Cam', sku: 'CAM-001' };
  run('2026-11-14', () => syncOrder(b, { id: 'ord-2041', no: 'SP-2041', date: '2026-11-12', customer: 'Örnek müşteri A', seller: 'Sema', total: T(12500), lines: [frame, glass], payments: [{ amount: T(4000), date: '2026-11-12', method: 'cash' }, { amount: T(8500), date: '2026-11-14', method: 'card', detail: 'Garanti Tek çekim' }], delivered: true, deliveredOn: '2026-11-14' }));
  run('2026-11-15', () => syncOrder(b, { id: 'ord-2044', no: 'SP-2044', date: '2026-11-15', customer: 'Örnek müşteri E', seller: 'Nursu', total: T(2500), lines: [{ label: 'Demo Lens Color -1.00 Ela', qty: 2, unitPrice: T(1250), vatRate: 10, category: 'Lens', sku: 'LEN-001' }], payments: [{ amount: T(2500), date: '2026-11-15', method: 'cash' }], delivered: true, deliveredOn: '2026-11-15' }));
  run('2026-11-18', () => syncOrder(b, { id: 'ord-2050', no: 'SP-2050', date: '2026-11-18', customer: 'Örnek müşteri C', seller: 'Erdoğan', total: T(13000), lines: [frame, glass], payments: [{ amount: T(4000), date: '2026-11-18', method: 'cash' }], delivered: false }));
  run('2026-11-19', () => syncOrder(b, { id: 'ord-2051', no: 'SP-2051', date: '2026-11-19', customer: 'Örnek müşteri F', seller: 'Şuayip', total: T(17000), lines: [{ ...frame, qty: 2 }], payments: [{ amount: T(17000), date: '2026-11-19', method: 'card', detail: 'TEB 3 Taksit' }], delivered: true, deliveredOn: '2026-11-19' }));
  run('2026-11-23', () => syncOrder(b, { id: 'ord-2053', no: 'SP-2053', date: '2026-11-22', customer: 'Örnek müşteri D', seller: 'İnternet (Online)', total: T(8500), lines: [{ label: 'Demo Lens Color -1.00 Ela', qty: 2, unitPrice: T(1250), vatRate: 10, category: 'Lens', sku: 'LEN-001' }, { label: 'Güneş gözlüğü (katalog dışı)', qty: 1, unitPrice: T(6000), vatRate: 20, category: 'Güneş Gözlüğü' }], payments: [{ amount: T(8500), date: '2026-11-22', method: 'card', detail: 'E-ticaret sanal POS', accountId: 'pos-online' }], delivered: true, deliveredOn: '2026-11-23' }));
  run('2026-11-24', () => syncOrder(b, { id: 'ord-2054', no: 'SP-2054', date: '2026-11-24', customer: 'Örnek müşteri G', seller: 'Fahri Can', total: T(8500), lines: [frame], payments: [{ amount: T(8500), date: '2026-11-24', method: 'card', detail: 'Garanti 2 Taksit' }], delivered: true, deliveredOn: '2026-11-24' }));
  // Müşteri 1 lensi iade etti: satış iadesi + stoğa geri giriş + nakit iade
  run('2026-11-20', () => returnOrder(b, { key: 'seed-ret-2044', orderId: 'ord-2044', date: '2026-11-20', lines: [{ index: 0, qty: 1 }], refund: { accountId: 'cash-store', amount: T(1250) }, restock: true, reason: 'Numara uymadı' }));
  run('2026-11-20', () => settlePos(b, { key: 'seed-pos-2051', date: '2026-11-20', posId: 'pos-teb', bankId: 'bank-teb', gross: T(17000), fee: T(1530) }));
  run('2026-11-15', () => settlePos(b, { key: 'seed-pos-2041', date: '2026-11-15', posId: 'pos-garanti', bankId: 'bank-garanti', gross: T(8500), fee: T(297.5) }));
  run('2026-11-24', () => settlePosAuto(b, { key: 'seed-pos-online', posId: 'pos-online', date: '2026-11-24' }));
  // Kredi taksiti
  const loan = run('2026-11-15', () => recordDocument(b, { key: 'seed-loan', type: 'loan', partyId: 'kredi-garanti', branchId: 'merkez', docNo: 'Taksit 7/24', date: '2026-11-15', due: '2026-11-15', principal: T(25000), interest: T(6000), bsmv: T(300) }));
  run('2026-11-15', () => recordPayment(b, { key: 'seed-loan-pay', date: '2026-11-15', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(loan).id, amount: T(31300) }], ref: 'Otomatik tahsil' }));
  // Muhasebe ücreti: serbest meslek makbuzu, %20 stopaj (örnek) — merkez gideri
  run('2026-11-15', () => recordDocument(b, { key: 'seed-smm', type: 'expense', partyId: 'muhasebe', categoryId: 'accounting', branchId: 'merkez', docNo: 'SMM-0381', date: '2026-11-15', due: '2026-11-25', net: T(10000), vat: T(2000), incomeWithheld: T(2000) }));
  // Kart ekstresi: kesim 17.11, son ödeme 24.11, ekstre 54.000 — sistemde bilinen 50.000
  const st = run('2026-11-17', () => recordDocument(b, { key: 'seed-statement', type: 'card-statement', cardId: 'card-garanti', branchId: 'merkez', docNo: 'Kasım ekstresi', date: '2026-11-17', due: '2026-11-24', total: T(54000), minimum: T(16200) }));
  run('2026-11-24', () => recordPayment(b, { key: 'seed-statement-pay', date: '2026-11-24', method: 'transfer', accountId: 'bank-garanti', allocations: [{ obligationId: ob(st).id, amount: T(54000) }], ref: 'Ekstre ödemesi' }));
  // Şahsi / aile: şirket hesabından ödenen şahsi sağlık sigortası → işletme gideri değil, ortak carisi
  const pers = run('2026-11-20', () => recordDocument(b, { key: 'seed-personal', type: 'personal', partyId: 'sigorta', branchId: 'merkez', date: '2026-11-20', due: '2026-11-21', amount: T(8000), beneficiary: 'Şirket sahibi', purpose: 'Şahsi sağlık sigortası' }));
  run('2026-11-21', () => recordPayment(b, { key: 'seed-personal-pay', date: '2026-11-21', method: 'transfer', accountId: 'bank-is', allocations: [{ obligationId: ob(pers).id, amount: T(8000) }] }));
  // Ekim muhtasar ve SGK tahakkukları (bordro kesintileriyle eşleşir)
  run('2026-11-20', () => recordDocument(b, { key: 'seed-muhtasar', type: 'tax', taxType: 'MUHTASAR', branchId: 'merkez', period: '2026-10', date: '2026-11-20', due: '2026-11-26', amount: T(6305.4) }));
  run('2026-11-20', () => recordDocument(b, { key: 'seed-sgk', type: 'tax', taxType: 'SGK', branchId: 'merkez', period: '2026-10', date: '2026-11-20', due: '2026-11-30', amount: T(17850) }));
  // Açık faturalar
  run('2026-11-21', () => recordDocument(b, { key: 'seed-elektrik', type: 'expense', partyId: 'elektrik', categoryId: 'utilities', branchId: 'atrium', docNo: 'ELK-99812', date: '2026-11-21', due: '2026-11-28', net: T(4500), vat: T(900) }));
  run('2026-11-23', () => recordDocument(b, { key: 'seed-cam', type: 'purchase', partyId: 'cam', branchId: 'atrium', docNo: 'CAM-18', date: '2026-11-23', due: '2026-12-10', net: T(40000), vat: T(4000), note: 'Stok cam alımı', lines: [{ sku: 'CAM-001', qty: 40, unitCost: T(1000) }] }));
  // Taksitli alış: Merve Optik, 3 eşit vade
  const merveId = b.parties.find((x) => x.label === 'Merve Optik').id;
  run('2026-11-20', () => recordDocument(b, { key: 'seed-merve', type: 'purchase', partyId: merveId, branchId: 'atrium', docNo: 'MRV-7781', date: '2026-11-20', net: T(240000), vat: T(24000), lines: [{ sku: 'GOZ-010', label: 'Merve Optik çerçeve (karma)', qty: 48, unitCost: T(5000) }], schedule: [{ due: '2026-11-30', amount: T(88000) }, { due: '2026-12-30', amount: T(88000) }, { due: '2027-01-30', amount: T(88000) }] }));
  // Mağazada personelin kasadan yaptığı masraflar (muhasebe onayı bekliyor) ve gün sonu sayımı
  run('2026-11-24', () => pettyExpense(b, { key: 'seed-petty-1', date: '2026-11-24', branchId: 'atrium', accountId: 'cash-store', amount: T(350), categoryId: 'cleaning', note: 'Temizlik malzemesi', hasReceipt: true, by: 'Sema' }));
  run('2026-11-24', () => pettyExpense(b, { key: 'seed-petty-2', date: '2026-11-24', branchId: 'atrium', accountId: 'cash-store', amount: T(180), categoryId: 'cargo', note: 'Müşteriye kurye', hasReceipt: false, by: 'Erdoğan' }));
  run('2026-11-24', () => cashCount(b, { key: 'seed-count-24', date: '2026-11-24', accountId: 'cash-store', counted: T(16300), deposit: { bankId: 'bank-is', amount: T(10000) }, note: 'Akşam sayımı', by: 'Sema' }));
  b.today = '2026-11-25';
  // Tekrarlayan ödemeler ve Aralık için belgesi beklenen planlar
  saveTemplate(b, { label: 'Mağaza kirası', partyId: 'evsahibi', categoryId: 'rent', day: 5, amount: T(24000), withholding: true });
  saveTemplate(b, { label: 'İnternet', partyId: 'internet', categoryId: 'utilities', day: 15, amount: T(1200) });
  saveTemplate(b, { label: 'Muhasebe ücreti', partyId: 'muhasebe', categoryId: 'accounting', day: 25, amount: T(10000) });
  saveTemplate(b, { label: 'Atrium aidatı', partyId: 'avm', categoryId: 'dues', day: 5, amount: T(15000) });
  saveTemplate(b, { label: 'Sosyal medya danışmanlığı', partyId: 'sosyal', categoryId: 'social', day: 30 - 2, amount: T(20000) });
  generateRecurring(b, '2026-12');
  // Kasım bütçesi (tüm işletme, örnek)
  for (const [key, v] of [['sales', 400000], ['cogs', 120000], ['rent', 30000], ['personnel', 70000], ['advertising', 12000], ['social', 20000], ['accounting', 10000], ['utilities', 6000], ['pos-fee', 9000], ['interest', 6500]]) setBudget(b, { period: '2026-11', key, amount: T(v) });
  b.audit = [];
  return b;
}
