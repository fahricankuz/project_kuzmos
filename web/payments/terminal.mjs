// Tablet üzerinden kartla tahsilat (NFC / SoftPOS) — sağlayıcıdan bağımsız çekirdek.
//
// ÖNEMLİ SINIR: Tarayıcıdaki Web NFC yalnızca NDEF etiketi okur; temassız kartın EMV ödeme çipini OKUYAMAZ.
// Kartı tablete okutup ödeme almak için BKM / kart şemaları onaylı bir SoftPOS uygulaması veya SDK'sı gerekir
// (banka SoftPOS uygulaması, lisanslı ödeme kuruluşu SDK'sı ya da Android ÖKC-POS cihazı). Kuzmos bu uygulamayla
// "köprü" üzerinden konuşur: tutarı ve sipariş numarasını gönderir, onay / red sonucunu alır, finansa işler.
//
// Para hiçbir zaman Kuzmos'un hesabından geçmez. Her mağaza kendi üye işyeri sözleşmesiyle çalışır; tahsilat
// mağazanın kendi POS hesabına düşer. Başka işletmelerin parasını toplayıp dağıtmak 6493 sayılı Kanun kapsamında
// ödeme kuruluşu lisansı gerektirir; bu yüzden "tek ortak sanal POS" modeli bilerek desteklenmez.

export const PROVIDERS = {
  demo: {
    label: 'Demo (simülasyon)',
    how: 'Gerçek kart çekilmez. Ekranı ve finans kaydını denemek içindir.',
    needs: [],
  },
  'bank-softpos': {
    label: 'Bankanın SoftPOS uygulaması',
    how: 'Mağazanın çalıştığı bankanın SoftPOS uygulaması tablete kurulur. Kuzmos tutarı uygulamaya gönderir, müşteri kartını tablete dokundurur, sonuç Kuzmos’a döner.',
    needs: ['merchantId', 'terminalId', 'appPackage'],
  },
  'psp-softpos': {
    label: 'Lisanslı ödeme kuruluşu (SoftPOS SDK)',
    how: 'TCMB lisanslı bir ödeme kuruluşunun SoftPOS SDK’sı Kuzmos tablet uygulamasına gömülür. Her mağaza kuruluşla kendi üye işyeri sözleşmesini yapar.',
    needs: ['merchantId', 'terminalId', 'apiKeyRef'],
  },
  'android-okc': {
    label: 'Android yazar kasa POS (ÖKC)',
    how: 'Mali fiş de basan yeni nesil ÖKC-POS cihazı. Kuzmos satış bilgisini cihaza gönderir; ödeme ve fiş cihazda tamamlanır.',
    needs: ['merchantId', 'terminalId', 'deviceSerial'],
  },
};

export const STATUS = { approved: 'Onaylandı', declined: 'Reddedildi', cancelled: 'Vazgeçildi', error: 'Hata', pending: 'Kart bekleniyor' };

const clean = (s) => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const MAX_AMOUNT = 100_000_000; // 1.000.000 TL (kuruş) — tek işlemde üst sınır, yanlış tuşlamaya karşı

/** Mağaza ödeme ayarını doğrular. Gizli anahtar asla ayarda tutulmaz; yalnızca sunucudaki referansı (apiKeyRef). */
export function validateStoreConfig(cfg) {
  const p = PROVIDERS[cfg?.provider];
  if (!p) throw Error('Ödeme sağlayıcısı seçin.');
  for (const k of p.needs) if (!clean(cfg[k])) throw Error(p.label + ': ' + FIELD_LABELS[k] + ' gerekli.');
  if (cfg.provider !== 'demo' && !clean(cfg.posAccountId)) throw Error('Tahsilatın düşeceği POS hesabını seçin.');
  const max = Number(cfg.maxInstallments ?? 1);
  if (!Number.isInteger(max) || max < 1 || max > 12) throw Error('Taksit sayısı 1–12 arası olmalı.');
  if (/^(sk|pk|key|secret)[_-]/i.test(clean(cfg.apiKeyRef)) || clean(cfg.apiKeyRef).length > 64) throw Error('API anahtarının kendisini değil, sunucudaki referans adını girin.');
  return { ...cfg, maxInstallments: max };
}
export const FIELD_LABELS = { merchantId: 'Üye işyeri no', terminalId: 'Terminal no', appPackage: 'Uygulama paket adı', apiKeyRef: 'Anahtar referansı (sunucuda)', deviceSerial: 'Cihaz seri no' };

/** Cihaz yeteneği. Web NFC varlığı ödeme alınabileceği anlamına GELMEZ (yukarıdaki not). */
export function deviceSupport(env = globalThis) {
  const ua = String(env.navigator?.userAgent || '');
  return {
    android: /Android/i.test(ua),
    webNfc: typeof env.NDEFReader === 'function',
    bridge: typeof env.KuzmosPOS?.pay === 'function',
  };
}

/** Ödeme isteği. id idempotency anahtarıdır: aynı istek iki kez çekilmez, sonucu iki kez işlenmez. */
export function createIntent({ id, amount, installments = 1, orderId = '', orderNo = '', customer = '', branchId = '', config }) {
  const cfg = validateStoreConfig(config);
  if (!clean(id)) throw Error('İşlem anahtarı eksik.');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('Tutar sıfırdan büyük olmalı.');
  if (amount > MAX_AMOUNT) throw Error('Tek işlemde en fazla 1.000.000 TL çekilebilir.');
  if (!Number.isInteger(installments) || installments < 1 || installments > cfg.maxInstallments) throw Error('Bu mağazada en fazla ' + cfg.maxInstallments + ' taksit yapılabilir.');
  return Object.freeze({ id: clean(id), amount, installments, orderId: clean(orderId), orderNo: clean(orderNo).slice(0, 30), customer: clean(customer).slice(0, 60), branchId, provider: cfg.provider, posAccountId: cfg.posAccountId || '', merchantId: clean(cfg.merchantId), terminalId: clean(cfg.terminalId), currency: 'TRY' });
}

/** Köprüye gönderilecek ileti (yerel Android uygulaması window.KuzmosPOS.pay ile alır). Kart verisi Kuzmos'a hiç gelmez. */
export function bridgeRequest(intent) {
  return JSON.stringify({ v: 1, type: 'sale', ref: intent.id, amount: intent.amount, currency: intent.currency, installments: intent.installments, orderNo: intent.orderNo, provider: intent.provider, merchantId: intent.merchantId, terminalId: intent.terminalId });
}

/** Köprüden dönen sonucu sıkı doğrular. Tutar / referans uyuşmazsa onay kabul edilmez. */
export function parseResult(intent, raw) {
  let r = raw;
  if (typeof raw === 'string') {
    try { r = JSON.parse(raw); } catch { return { status: 'error', message: 'Ödeme uygulamasından okunamayan yanıt.' }; }
  }
  if (!r || typeof r !== 'object') return { status: 'error', message: 'Ödeme uygulamasından yanıt gelmedi.' };
  const status = ['approved', 'declined', 'cancelled'].includes(r.status) ? r.status : 'error';
  if (r.ref !== intent.id) return { status: 'error', message: 'Yanıt başka bir işleme ait; kayıt yapılmadı. Banka ekstresinden kontrol edin.' };
  if (status === 'approved') {
    if (r.amount !== intent.amount) return { status: 'error', message: 'Onaylanan tutar istenenle aynı değil; kayıt yapılmadı. Banka uygulamasından kontrol edin.' };
    if (!clean(r.authCode) || !clean(r.txnId)) return { status: 'error', message: 'Onay kodu eksik; kayıt yapılmadı.' };
    const pan = clean(r.maskedPan);
    if (pan && (!/^[0-9*• ]{4,19}$/.test(pan) || pan.replace(/\D/g, '').length > 10)) return { status: 'error', message: 'Kart numarası maskeli değil; yanıt reddedildi.' };
    return { status, authCode: clean(r.authCode).slice(0, 12), txnId: clean(r.txnId).slice(0, 40), maskedPan: pan ? '•••• ' + pan.replace(/\D/g, '').slice(-4) : '', installments: Number(r.installments) || intent.installments, cardBrand: clean(r.cardBrand).slice(0, 20) };
  }
  return { status, message: clean(r.message).slice(0, 140) || STATUS[status] };
}

/** Demo sağlayıcı: 0,13 TL ile biten tutarlar reddedilir (test için), diğerleri onaylanır. */
export function simulate(intent, { outcome } = {}) {
  const status = outcome || (intent.amount % 100 === 13 ? 'declined' : 'approved');
  return { ref: intent.id, status, amount: intent.amount, authCode: status === 'approved' ? 'D' + String(intent.amount % 99991).padStart(5, '0') : '', txnId: status === 'approved' ? 'DEMO-' + intent.id.slice(-10) : '', maskedPan: status === 'approved' ? '************4242' : '', installments: intent.installments, cardBrand: 'Demo', message: status === 'declined' ? 'Kart reddedildi (demo)' : '' };
}

/** Ödemeyi başlatır. Gerçek sağlayıcıda köprü yoksa açıkça hata verir; sessizce demo'ya düşmez. */
export async function startPayment(intent, { env = globalThis, timeoutMs = 120000 } = {}) {
  if (intent.provider === 'demo') return parseResult(intent, simulate(intent));
  const bridge = env.KuzmosPOS;
  if (typeof bridge?.pay !== 'function') return { status: 'error', message: 'Bu cihazda Kuzmos ödeme köprüsü yok. Ödemeyi Kuzmos tablet uygulamasından (Android, NFC açık) başlatın.' };
  let timer;
  const timeout = new Promise((res) => (timer = setTimeout(() => res(JSON.stringify({ ref: intent.id, status: 'error', message: 'Zaman aşımı' })), timeoutMs)));
  try {
    const raw = await Promise.race([Promise.resolve(bridge.pay(bridgeRequest(intent))), timeout]);
    const r = parseResult(intent, raw);
    if (r.status === 'error' && /Zaman aşımı/.test(r.message || '')) r.message = 'Yanıt gelmedi. Kart çekilmiş olabilir: aynı tutarı tekrar çekmeden önce banka uygulamasındaki son işlemi kontrol edin.';
    return r;
  } finally {
    clearTimeout(timer);
  }
}

/** Oturum içi işlem günlüğü: aynı istek iki kez çalıştırılmaz; sonuç değişmez. */
export function createTerminalLog() {
  return { items: [] };
}
export function logStart(log, intent) {
  const prev = log.items.find((x) => x.id === intent.id);
  if (prev) {
    if (prev.amount !== intent.amount) throw Error('Bu işlem anahtarı farklı tutarla kullanılmış.');
    return prev;
  }
  const it = { id: intent.id, amount: intent.amount, installments: intent.installments, orderId: intent.orderId, orderNo: intent.orderNo, customer: intent.customer, provider: intent.provider, status: 'pending', at: Date.now(), result: null };
  log.items.push(it);
  return it;
}
export function logFinish(log, id, result) {
  const it = log.items.find((x) => x.id === id);
  if (!it) throw Error('İşlem bulunamadı.');
  if (it.status === 'approved') return it; // onaylanmış işlem sonradan değiştirilemez
  it.status = result.status;
  it.result = result;
  return it;
}
