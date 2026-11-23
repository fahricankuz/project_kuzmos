import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../notify/notify.mjs';

const mails = { siparis: { subject: 'Sipariş', html: '<p>1</p>' }, hazir: { subject: 'Hazır', html: '<p>2</p>' }, tesekkur: { subject: 'Teşekkürler', html: '<p>3</p>' } };
const order = (o = {}) => ({ id: '1', no: 'DK-1', customer: 'Ayşe', email: 'ayse@example.com', status: 'Satış Yapıldı', date: '2026-11-04', ...o });
const ok = () => ({ ok: true, demo: true });

test('Satış → montaj → teslim: her aşamada bir mail, sırayla', () => {
  const n = N.createNotifier();
  assert.equal(N.onOrderSaved(n, order(), mails)[0].type, 'siparis');
  assert.equal(N.onOrderSaved(n, order({ status: 'Cam Siparişi Verildi' }), mails).length, 0, 'cam siparişinde mail yok');
  assert.equal(N.onOrderSaved(n, order({ status: 'Montaj Yapıldı' }), mails)[0].type, 'hazir');
  assert.equal(N.onOrderSaved(n, order({ status: 'Teslim Edildi' }), mails)[0].type, 'tesekkur');
  N.deliver(n, ok);
  assert.deepEqual(n.outbox.map((x) => [x.type, x.status]), [['siparis', 'sent'], ['hazir', 'sent'], ['tesekkur', 'sent']]);
});

test('Aynı kayıt tekrar kaydedilince ikinci mail gitmez; durum geri alınıp ilerletilince de tekrar gitmez', () => {
  const n = N.createNotifier();
  N.onOrderSaved(n, order(), mails);
  N.onOrderSaved(n, order(), mails);
  N.onOrderSaved(n, order({ status: 'Montaj Yapıldı' }), mails);
  N.onOrderSaved(n, order({ status: 'Satış Yapıldı' }), mails);
  N.onOrderSaved(n, order({ status: 'Montaj Yapıldı' }), mails);
  assert.equal(n.outbox.length, 2);
});

test('Ara aşama atlanırsa yalnızca güncel mail gider (satıştan doğrudan teslim → teşekkür)', () => {
  const n = N.createNotifier();
  N.onOrderSaved(n, order(), mails);
  N.onOrderSaved(n, order({ status: 'Teslim Edildi' }), mails);
  assert.deepEqual(n.outbox.map((x) => x.type), ['siparis', 'tesekkur']);
  const m = N.createNotifier();
  N.onOrderSaved(m, order({ status: 'Teslim Edildi' }), mails);
  assert.deepEqual(m.outbox.map((x) => x.type), ['tesekkur'], 'ilk kayıt teslim edilmiş satışsa yalnızca teşekkür');
});

test('E-postası olmayan sipariş görünür kalır; e-posta eklenince aynı mail gönderilir', () => {
  const n = N.createNotifier();
  N.onOrderSaved(n, order({ email: '' }), mails);
  N.deliver(n, ok);
  assert.equal(n.outbox[0].status, 'no-email');
  N.onOrderSaved(n, order({ email: 'ayse@exmaple' }), mails);
  assert.equal(n.outbox[0].status, 'invalid-email');
  N.onOrderSaved(n, order({ email: 'ayse@example.com' }), mails);
  N.deliver(n, ok);
  assert.equal(n.outbox.length, 1);
  assert.equal(n.outbox[0].status, 'sent');
  assert.equal(n.outbox[0].to, 'ayse@example.com');
});

test('Müşteri mail istemiyorsa gönderilmez; tür kapatılabilir', () => {
  const n = N.createNotifier();
  N.setOptOut(n, 'AYSE@example.com');
  N.onOrderSaved(n, order(), mails);
  N.deliver(n, ok);
  assert.equal(n.outbox[0].status, 'opted-out');
  N.setEnabled(n, 'hazir', false);
  N.onOrderSaved(n, order({ id: '2', email: 'b@example.com' }), mails);
  N.onOrderSaved(n, order({ id: '2', email: 'b@example.com', status: 'Montaj Yapıldı' }), mails);
  assert.deepEqual(n.outbox.filter((x) => x.orderId === '2').map((x) => x.type), ['siparis']);
});

test('Sistem açılmadan önceki eski siparişlere geriye dönük mail atılmaz', () => {
  const n = N.createNotifier({ startDate: '2026-11-01' });
  N.onOrderSaved(n, order({ date: '2026-10-15' }), mails);
  N.onOrderSaved(n, order({ date: '2026-10-15', status: 'Teslim Edildi' }), mails);
  assert.equal(n.outbox.length, 0);
});

test('Gönderim hatası tekrar denenir (en fazla 3); elle tekrar gönderim yeni kayıt açar', () => {
  const n = N.createNotifier();
  N.onOrderSaved(n, order(), mails);
  N.deliver(n, () => ({ ok: false, error: 'SMTP' }));
  assert.equal(n.outbox[0].status, 'failed');
  N.deliver(n, () => ({ ok: false, error: 'SMTP' }));
  N.deliver(n, () => ({ ok: false, error: 'SMTP' }));
  N.deliver(n, ok);
  assert.equal(n.outbox[0].attempts, 3);
  assert.equal(n.outbox[0].status, 'failed');
  N.resend(n, n.outbox[0].id);
  N.deliver(n, ok);
  assert.equal(n.outbox[1].status, 'sent');
  assert.equal(n.outbox[1].manual, true);
});
