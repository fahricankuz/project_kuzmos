// Müşteri bildirimleri: sipariş durumu değişince otomatik e-posta.
//
// Mail içerikleri (HTML) korunan sipariş föyünün kendi şablonlarından gelir (mail_siparis, mail_hazir,
// mail_tesekkur). Bu modül yalnızca KARAR ve KAYIT tutar: hangi sipariş için hangi mail, bir kez mi gitti,
// alıcı geçerli mi, müşteri mail istemiyor mu. Gerçek gönderim sunucu tarafında yapılır (önizlemede yok).

export const STATUS_STEPS = ['Satış Yapıldı', 'Cam Siparişi Verildi', 'Montaj Yapıldı', 'Teslim Edildi'];
export const MAIL_TYPES = {
  siparis: { status: 'Satış Yapıldı', stage: 0, title: 'Siparişiniz için teşekkürler', when: 'Sipariş ilk kaydedildiğinde' },
  hazir: { status: 'Montaj Yapıldı', stage: 2, title: 'Gözlüğünüz teslimata hazır', when: 'Durum “Montaj Yapıldı” olunca' },
  tesekkur: { status: 'Teslim Edildi', stage: 3, title: 'Teslim edildi · teşekkürler ve kullanım önerileri', when: 'Durum “Teslim Edildi” olunca' },
};
export const ITEM_STATUS = {
  queued: 'Gönderilecek',
  sent: 'Gönderildi',
  failed: 'Gönderilemedi',
  'no-email': 'E-posta adresi yok',
  'invalid-email': 'E-posta adresi hatalı',
  'opted-out': 'Müşteri mail istemiyor',
};
const clean = (s) => String(s ?? '').normalize('NFKC').trim();
const lower = (s) => clean(s).toLocaleLowerCase('tr-TR');
export const isEmail = (s) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(clean(s));

export function createNotifier({ startDate = '2026-10-31', senderName = 'Damla Kuz Optik', replyTo = '' } = {}) {
  return {
    settings: { enabled: { siparis: true, hazir: true, tesekkur: true }, startDate, senderName, replyTo },
    seen: {},
    outbox: [],
    optOut: [],
  };
}

/** Siparişin geldiği aşamaya göre gönderilecek mail. Ara aşama atlandıysa yalnızca en güncel olan gider. */
function typeFor(prevStage, stage) {
  if (prevStage === undefined) return stage >= 3 ? 'tesekkur' : stage >= 2 ? 'hazir' : 'siparis';
  if (stage <= prevStage) return null;
  if (stage >= 3) return 'tesekkur';
  if (stage >= 2 && prevStage < 2) return 'hazir';
  return null;
}
function recipientStatus(n, to) {
  if (!clean(to)) return 'no-email';
  if (!isEmail(to)) return 'invalid-email';
  if (n.optOut.includes(lower(to))) return 'opted-out';
  return 'queued';
}
function nextId(n) {
  return 'ML-' + String(n.outbox.length + 1).padStart(4, '0');
}

/**
 * Föyde her kayıtta çağrılır (idempotent).
 * order: {id, no, customer, email, status, date}; mails: {siparis|hazir|tesekkur: {subject, html}} (föyden)
 * Dönen: bu çağrıda oluşan / güncellenen mail kayıtları.
 */
export function onOrderSaved(n, order, mails = {}, now = new Date().toISOString()) {
  if (!order?.id) throw Error('Sipariş kimliği eksik.');
  const stage = STATUS_STEPS.indexOf(order.status);
  if (stage < 0) return [];
  const prev = n.seen[order.id];
  const touched = [];
  // E-postası sonradan eklenen / düzeltilen siparişin bekleyen maili güncellenir.
  for (const it of n.outbox.filter((x) => x.orderId === order.id && ['no-email', 'invalid-email'].includes(x.status))) {
    const st = recipientStatus(n, order.email);
    if (st !== it.status) {
      Object.assign(it, { to: clean(order.email), status: st, ...(mails[it.type] ? { subject: mails[it.type].subject, html: mails[it.type].html } : {}) });
      touched.push(it);
    }
  }
  if (!prev && order.date && order.date < n.settings.startDate) {
    n.seen[order.id] = { stage, status: order.status, legacy: true };
    return touched;
  }
  if (prev?.legacy) {
    n.seen[order.id] = { ...prev, stage: Math.max(prev.stage, stage) };
    return touched;
  }
  const type = typeFor(prev?.stage, stage);
  n.seen[order.id] = { stage: Math.max(prev?.stage ?? -1, stage), status: order.status };
  if (!type || !n.settings.enabled[type]) return touched;
  if (n.outbox.some((x) => x.orderId === order.id && x.type === type && !x.manual)) return touched;
  const mail = mails[type];
  if (!mail?.html) throw Error(MAIL_TYPES[type].title + ' maili için şablon gelmedi.');
  const it = {
    id: nextId(n),
    orderId: order.id,
    no: clean(order.no),
    customer: clean(order.customer),
    to: clean(order.email),
    type,
    subject: clean(mail.subject).slice(0, 200),
    html: String(mail.html),
    status: recipientStatus(n, order.email),
    createdAt: now,
    sentAt: '',
    attempts: 0,
    error: '',
    manual: false,
  };
  n.outbox.push(it);
  touched.push(it);
  return touched;
}

/** Elle "mail ilet" (föydeki düğme) veya tekrar gönderim: aynı türden yeni bir kayıt açar. */
export function queueManual(n, { orderId, no, customer, to, type, subject, html }, now = new Date().toISOString()) {
  if (!MAIL_TYPES[type]) throw Error('Mail türü bilinmiyor.');
  if (!html) throw Error('Mail içeriği yok.');
  const it = { id: nextId(n), orderId, no: clean(no), customer: clean(customer), to: clean(to), type, subject: clean(subject).slice(0, 200), html: String(html), status: recipientStatus(n, to), createdAt: now, sentAt: '', attempts: 0, error: '', manual: true };
  n.outbox.push(it);
  return it;
}
export function resend(n, itemId, now) {
  const it = n.outbox.find((x) => x.id === itemId);
  if (!it) throw Error('Mail kaydı bulunamadı.');
  return queueManual(n, it, now);
}

/** Kuyruktaki mailleri gönderici ile gönderir. sender(item) → {ok, error?}. Hata olursa en fazla 3 deneme. */
export function deliver(n, sender, now = new Date().toISOString()) {
  const done = [];
  for (const it of n.outbox.filter((x) => x.status === 'queued' || (x.status === 'failed' && x.attempts < 3))) {
    it.attempts++;
    let r;
    try {
      r = sender(it) || { ok: false, error: 'Gönderici cevap vermedi.' };
    } catch (e) {
      r = { ok: false, error: e.message };
    }
    if (r.ok) Object.assign(it, { status: 'sent', sentAt: now, error: '', demo: !!r.demo });
    else Object.assign(it, { status: 'failed', error: clean(r.error).slice(0, 200) });
    done.push(it);
  }
  return done;
}

export function setEnabled(n, type, on) {
  if (!MAIL_TYPES[type]) throw Error('Mail türü bilinmiyor.');
  n.settings.enabled[type] = !!on;
}
/** Müşteri mail istemiyor: bekleyenler durdurulur, sonrakiler gönderilmez. */
export function setOptOut(n, email, on = true) {
  const e = lower(email);
  if (!isEmail(e)) throw Error('Geçerli bir e-posta adresi seçin.');
  n.optOut = n.optOut.filter((x) => x !== e);
  if (on) n.optOut.push(e);
  for (const it of n.outbox.filter((x) => lower(x.to) === e && ['queued', 'failed', 'opted-out'].includes(x.status))) it.status = on ? 'opted-out' : 'queued';
}
export function summary(n) {
  const c = (s) => n.outbox.filter((x) => x.status === s).length;
  return { sent: c('sent'), queued: c('queued'), failed: c('failed'), missing: c('no-email') + c('invalid-email'), optedOut: c('opted-out'), total: n.outbox.length };
}
