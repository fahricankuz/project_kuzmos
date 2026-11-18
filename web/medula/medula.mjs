// SGK Medula (optik) — reçete sorgulama, provizyon, aylık SGK faturası.
//
// Bu modül iş kurallarını ve ekran akışını taşır; SGK ile asıl bağlantı (Medula web servisleri) SUNUCUDA yapılır.
// Sebep: Medula kullanıcı adı / şifresi ve tesis kodu SGK'nın optik firmaya verdiği gizli bilgilerdir, tarayıcıya
// inemez; ayrıca servisler tarayıcıdan doğrudan çağrılamaz. Ekran yalnızca adaptör arayüzünü kullanır:
//   adapter.sorgula({ tc, receteNo })                 → { ok, hasta, recete, hak, mesaj }
//   adapter.provizyon({ tc, receteNo, kalemler, ref }) → { ok, takipNo, sgkTutar, mesaj }
//   adapter.iptal({ takipNo })                         → { ok, mesaj }
// Önizlemede demoAdapter çalışır; canlıda serverAdapter('/api/medula') kullanılır.
//
// SGK'nın ödediği tutarlar Sağlık Uygulama Tebliği (SUT) eklerinden gelir ve değişir. Burada SABİT TUTAR YOKTUR:
// tarife işletme ayarıdır, Medula'nın döndürdüğü tutar her zaman önceliklidir.

export const ITEM_TYPES = {
  'uzak-cam': 'Uzak gözlük camı',
  'yakin-cam': 'Yakın gözlük camı',
  'cerceve': 'Gözlük çerçevesi',
  'kontakt-lens': 'Kontakt lens',
};
export const PROVISION_STATUS = { open: 'Provizyon alındı', delivered: 'Teslim edildi', invoiced: 'SGK’ya faturalandı', paid: 'SGK ödedi', cancelled: 'İptal' };

const clean = (s) => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');

/** T.C. kimlik numarası algoritma kontrolü (gerçek kişi doğrulaması değildir). */
export function tcValid(tc) {
  const s = String(tc ?? '').trim();
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, x) => a + x, 0) % 10 === d[10];
}
/** e-Reçete numarası: harf/rakam, 5–12 karakter. */
export function receteNoValid(no) {
  return /^[A-Z0-9]{5,12}$/i.test(String(no ?? '').trim());
}
/** Ekranda TC gizleme: 123******01 */
export const maskTC = (tc) => (String(tc).length === 11 ? String(tc).slice(0, 3) + '******' + String(tc).slice(9) : '•••');

/** İşletmenin girdiği tarife (kuruş). Boş kalem SGK payı hesaplamaya girmez; Medula tutarı her zaman önceliklidir. */
export function validateTariff(t) {
  const out = {};
  for (const k of Object.keys(ITEM_TYPES)) {
    const v = t?.[k];
    if (v === undefined || v === null || v === '') continue;
    if (!Number.isSafeInteger(v) || v < 0) throw Error(ITEM_TYPES[k] + ': tarife tutarı geçersiz.');
    out[k] = v;
  }
  return out;
}

/** SGK payı ve hastanın ödeyeceği fark. SGK payı satış tutarını aşamaz. */
export function computeShares({ total, items, tariff = {}, medulaAmount }) {
  if (!Number.isSafeInteger(total) || total <= 0) throw Error('Satış tutarı sıfırdan büyük olmalı.');
  let sgk;
  let source;
  if (Number.isSafeInteger(medulaAmount) && medulaAmount >= 0) {
    sgk = medulaAmount;
    source = 'medula';
  } else {
    sgk = (items || []).reduce((s, it) => s + (tariff[it.tur] || 0) * (it.adet || 1), 0);
    source = 'tarife';
  }
  sgk = Math.min(sgk, total);
  return { sgk, patient: total - sgk, source };
}

export function createMedulaState({ tariff = {}, facility = '' } = {}) {
  return { tariff: validateTariff(tariff), facility: clean(facility), provisions: [], log: [] };
}

/** Provizyonu kaydeder. Aynı reçete için açık provizyon varken ikincisi açılmaz. */
export function addProvision(st, { tc, receteNo, hasta, kalemler, takipNo, sgkTutar, date, orderId = '', orderNo = '', total }) {
  if (!tcValid(tc)) throw Error('T.C. kimlik numarası geçersiz.');
  if (!receteNoValid(receteNo)) throw Error('Reçete numarası geçersiz.');
  if (!clean(takipNo)) throw Error('Medula takip numarası alınamadı.');
  const no = clean(receteNo).toUpperCase();
  const dup = st.provisions.find((p) => p.receteNo === no && p.status !== 'cancelled');
  if (dup) {
    if (dup.takipNo === clean(takipNo)) return dup;
    throw Error('Bu reçete için zaten provizyon var (takip no ' + dup.takipNo + ').');
  }
  const shares = computeShares({ total, items: kalemler, tariff: st.tariff, medulaAmount: sgkTutar });
  const p = { id: 'MDL-' + String(st.provisions.length + 1).padStart(4, '0'), tc: String(tc), receteNo: no, hasta: clean(hasta).slice(0, 80), kalemler: (kalemler || []).map((k) => ({ tur: k.tur, adet: k.adet || 1 })), takipNo: clean(takipNo), date, total, sgk: shares.sgk, patient: shares.patient, source: shares.source, orderId: clean(orderId), orderNo: clean(orderNo), status: 'open', invoice: '', claimed: false };
  st.provisions.push(p);
  st.log.push({ at: date, action: 'provizyon', ref: p.id });
  return p;
}
export function linkOrder(st, id, { orderId, orderNo }) {
  const p = st.provisions.find((x) => x.id === id);
  if (!p || p.status === 'cancelled') throw Error('Provizyon bulunamadı.');
  if (p.claimed) throw Error('Finansa işlenmiş provizyonun siparişi değiştirilemez.');
  Object.assign(p, { orderId: clean(orderId), orderNo: clean(orderNo) });
  return p;
}
export function markDelivered(st, id) {
  const p = st.provisions.find((x) => x.id === id);
  if (!p || p.status !== 'open') throw Error('Teslim edilecek açık provizyon yok.');
  p.status = 'delivered';
  return p;
}
export function cancelProvision(st, id, reason) {
  const p = st.provisions.find((x) => x.id === id);
  if (!p) throw Error('Provizyon bulunamadı.');
  if (['invoiced', 'paid'].includes(p.status)) throw Error('SGK’ya faturalanmış provizyon iptal edilemez; iade / düzeltme faturası gerekir.');
  if (p.claimed) throw Error('Finansa işlenmiş provizyon için önce finansta ters kayıt gerekir.');
  if (!clean(reason)) throw Error('İptal nedeni zorunlu.');
  p.status = 'cancelled';
  p.cancelReason = clean(reason);
  return p;
}

/** Ay sonu: teslim edilmiş provizyonlar tek SGK faturasına toplanır. Teslim edilmemiş olan faturaya girmez. */
export function monthlyBatch(st, period) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw Error('Dönem YYYY-AA olmalı.');
  const rows = st.provisions.filter((p) => p.status === 'delivered' && p.date.slice(0, 7) <= period);
  return { period, rows, count: rows.length, total: rows.reduce((s, p) => s + p.sgk, 0), waiting: st.provisions.filter((p) => p.status === 'open').length };
}
export function markInvoiced(st, period, invoiceNo) {
  if (!clean(invoiceNo)) throw Error('SGK fatura numarasını girin.');
  const batch = monthlyBatch(st, period);
  if (!batch.count) throw Error('Faturalanacak teslim edilmiş provizyon yok.');
  batch.rows.forEach((p) => Object.assign(p, { status: 'invoiced', invoice: clean(invoiceNo) }));
  return batch;
}
export function markPaid(st, invoiceNo) {
  const rows = st.provisions.filter((p) => p.status === 'invoiced' && p.invoice === clean(invoiceNo));
  if (!rows.length) throw Error('Bu numarayla ödeme bekleyen SGK faturası yok.');
  rows.forEach((p) => (p.status = 'paid'));
  return { count: rows.length, total: rows.reduce((s, p) => s + p.sgk, 0) };
}
export function summary(st) {
  const by = (s) => st.provisions.filter((p) => p.status === s);
  const t = (xs) => xs.reduce((a, p) => a + p.sgk, 0);
  return { open: by('open').length, delivered: by('delivered').length, invoicedTotal: t(by('invoiced')), deliveredTotal: t(by('delivered')), openTotal: t(by('open')), paidTotal: t(by('paid')) };
}

// ───────────────────────── adaptörler ─────────────────────────
/** Demo: sentetik hasta/reçete. TC algoritmasını geçen her numarayı kabul eder; 99 ile biten reçete "hak yok" döner. */
export function demoAdapter() {
  let n = 0;
  return {
    demo: true,
    async sorgula({ tc, receteNo }) {
      if (!tcValid(tc)) return { ok: false, mesaj: 'T.C. kimlik numarası geçersiz.' };
      if (!receteNoValid(receteNo)) return { ok: false, mesaj: 'Reçete numarası geçersiz.' };
      const no = String(receteNo).toUpperCase();
      const yakin = /Y/.test(no);
      return {
        ok: true,
        hasta: { ad: 'Örnek', soyad: 'Hasta ' + String(tc).slice(-2) },
        recete: { no, tarih: '2026-11-20', doktor: 'Dr. Örnek (Göz Hastalıkları)', kalemler: [{ tur: yakin ? 'yakin-cam' : 'uzak-cam', adet: 2 }, { tur: 'cerceve', adet: 1 }] },
        hak: /99$/.test(no) ? { uygun: false, neden: 'Hastanın bu dönem için gözlük hakkı kullanılmış (demo).' } : { uygun: true },
      };
    },
    async provizyon({ receteNo }) {
      if (/99$/.test(String(receteNo))) return { ok: false, mesaj: 'Hak sahipliği yok.' };
      n++;
      return { ok: true, takipNo: 'DEMO' + String(Date.now()).slice(-6) + n, sgkTutar: undefined };
    },
    async iptal() {
      return { ok: true };
    },
  };
}
/** Canlı: Kuzmos sunucusu Medula'ya bağlanır; tarayıcı yalnızca kendi sunucusunu çağırır (kimlik çerezi ile). */
export function serverAdapter(base, fetchFn = globalThis.fetch) {
  const call = async (path, body) => {
    const r = await fetchFn(base + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return { ok: false, mesaj: 'Medula sunucusu yanıt vermedi (' + r.status + ').' };
    return r.json();
  };
  return { demo: false, sorgula: (x) => call('/sorgula', x), provizyon: (x) => call('/provizyon', x), iptal: (x) => call('/iptal', x) };
}
