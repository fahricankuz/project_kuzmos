import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../finance/engine.mjs';
import * as P from '../payments/terminal.mjs';
import * as M from '../medula/medula.mjs';

const T = (tl) => Math.round(tl * 100);
function books() {
  const b = F.createBooks({ today: '2026-11-30' });
  b.branches = [];
  F.saveBranch(b, { newId: 'magaza', label: 'Mağaza', kind: 'store', cashAccount: 'cash' });
  F.saveMoneyAccount(b, { newId: 'bank', label: 'Banka', kind: 'bank' });
  F.saveMoneyAccount(b, { newId: 'cash', label: 'Kasa', kind: 'cash' });
  F.saveMoneyAccount(b, { newId: 'pos-garanti', label: 'Garanti POS', kind: 'pos', pos: { bankId: 'bank', settleDays: 1, rates: { 1: 350 } } });
  F.postOpening(b, { date: '2026-11-01', items: [{ account: 'bank', amount: T(1000) }, { account: 'cash', amount: T(100) }] });
  return b;
}
const order = (o = {}) => ({ id: 'o1', no: 'SP-1', date: '2026-11-10', customer: 'Müşteri', seller: 'Sema', total: T(5000), lines: [{ label: 'Gözlük', qty: 1, unitPrice: T(5000), vatRate: 10, category: 'Optik Çerçeve' }], payments: [{ amount: T(1000), date: '2026-11-10', method: 'cash' }], delivered: false, ...o });
const cfg = { provider: 'demo', posAccountId: 'pos-garanti', maxInstallments: 6 };

// ───────── tablet tahsilatı ─────────
test('Ödeme isteği tutar, taksit ve sağlayıcı ayarını doğrular', () => {
  assert.throws(() => P.createIntent({ id: 'x', amount: 0, config: cfg }), /sıfırdan büyük/);
  assert.throws(() => P.createIntent({ id: 'x', amount: 100, installments: 9, config: cfg }), /en fazla 6 taksit/);
  assert.throws(() => P.createIntent({ id: 'x', amount: 100, config: { provider: 'bank-softpos', maxInstallments: 1 } }), /Üye işyeri no gerekli/);
  assert.throws(() => P.validateStoreConfig({ provider: 'psp-softpos', merchantId: '1', terminalId: '2', apiKeyRef: 'sk_live_abc', posAccountId: 'p' }), /referans adını/);
  const i = P.createIntent({ id: 'x', amount: 100, installments: 3, config: cfg });
  assert.equal(i.installments, 3);
});

test('Köprü yanıtı: başka işleme ait, farklı tutarlı veya onay kodsuz yanıt kabul edilmez', () => {
  const i = P.createIntent({ id: 'abc', amount: T(250), config: cfg });
  assert.equal(P.parseResult(i, { ref: 'zzz', status: 'approved', amount: T(250), authCode: '1', txnId: '1' }).status, 'error');
  assert.equal(P.parseResult(i, { ref: 'abc', status: 'approved', amount: T(249), authCode: '1', txnId: '1' }).status, 'error');
  assert.equal(P.parseResult(i, { ref: 'abc', status: 'approved', amount: T(250), authCode: '', txnId: '1' }).status, 'error');
  assert.equal(P.parseResult(i, { ref: 'abc', status: 'approved', amount: T(250), authCode: 'A1', txnId: 't1', maskedPan: '5555123412344242' }).status, 'error', 'maskesiz kart no reddedilir');
  const ok = P.parseResult(i, JSON.stringify({ ref: 'abc', status: 'approved', amount: T(250), authCode: 'A1', txnId: 't1', maskedPan: '************4242' }));
  assert.equal(ok.status, 'approved');
  assert.equal(ok.maskedPan, '•••• 4242');
  assert.equal(P.parseResult(i, '{bozuk').status, 'error');
});

test('Gerçek sağlayıcıda köprü yoksa sessizce demoya düşmez', async () => {
  const real = { provider: 'bank-softpos', merchantId: '1', terminalId: '2', appPackage: 'com.banka.softpos', posAccountId: 'pos-garanti' };
  const i = P.createIntent({ id: 'r1', amount: 100, config: real });
  const r = await P.startPayment(i, { env: {} });
  assert.equal(r.status, 'error');
  const bridged = await P.startPayment(i, { env: { KuzmosPOS: { pay: (req) => JSON.stringify({ ...JSON.parse(req), ref: 'r1', status: 'approved', authCode: 'X', txnId: 'Y' }) } } });
  assert.equal(bridged.status, 'approved');
});

test('İşlem günlüğü: onaylanan işlem sonradan reddedildi olarak değiştirilemez', () => {
  const log = P.createTerminalLog();
  const i = P.createIntent({ id: 'k', amount: 100, config: cfg });
  P.logStart(log, i);
  P.logFinish(log, 'k', { status: 'approved' });
  P.logFinish(log, 'k', { status: 'declined' });
  assert.equal(log.items[0].status, 'approved');
  assert.throws(() => P.logStart(log, { ...i, amount: 200 }), /farklı tutarla/);
});

test('Tablet tahsilatı siparişe işlenir; föyde sonra girilen aynı kart ödemesi çift kayıt yaratmaz', () => {
  const b = books();
  F.syncOrder(b, order());
  F.terminalPayment(b, { key: 't1', date: '2026-11-12', posId: 'pos-garanti', amount: T(4000), orderId: 'o1', txnId: 'TX1', authCode: 'A1' });
  assert.equal(F.balance(b, 'pos-garanti'), T(4000));
  assert.equal(F.unmatchedTerminal(b).length, 1, 'föye girilmesi hatırlatılır');
  F.syncOrder(b, order({ payments: [{ amount: T(1000), date: '2026-11-10', method: 'cash' }, { amount: T(4000), date: '2026-11-12', method: 'card', detail: 'Garanti Tek Çekim' }] }));
  assert.equal(F.balance(b, 'pos-garanti'), T(4000), 'ikinci kez işlenmedi');
  assert.equal(b.orders[0].collected, T(5000));
  assert.equal(F.unmatchedTerminal(b).length, 0);
  assert.deepEqual(b.orders[0].warnings, []);
});

test('Föyde önce girilen kart ödemesi tabletten çekilince onay kodu mevcut kayda bağlanır', () => {
  const b = books();
  F.syncOrder(b, order({ payments: [{ amount: T(5000), date: '2026-11-30', method: 'card', detail: 'Garanti' }] }));
  F.terminalPayment(b, { key: 't2', date: '2026-11-30', posId: 'pos-garanti', amount: T(5000), orderId: 'o1', txnId: 'TX2', authCode: 'A2' });
  assert.equal(F.balance(b, 'pos-garanti'), T(5000));
  assert.equal(b.collections.filter((c) => c.orderId === 'o1').length, 1);
  assert.equal(b.collections[0].txnId, 'TX2');
});

test('Tablet tahsilatı: kalan bakiyeyi aşamaz, aynı kart işlemi iki kez kaydedilmez, siparişsiz avans olur', () => {
  const b = books();
  F.syncOrder(b, order());
  assert.throws(() => F.terminalPayment(b, { key: 'a', posId: 'pos-garanti', amount: T(4001), orderId: 'o1', txnId: 'T', authCode: 'A' }), /kalan bakiyesini/);
  assert.throws(() => F.terminalPayment(b, { key: 'b', posId: 'pos-garanti', amount: T(10), orderId: 'o1', txnId: 'T', authCode: '' }), /Onay kodu/);
  F.terminalPayment(b, { key: 'c', posId: 'pos-garanti', amount: T(300), customer: 'Kapıdan', txnId: 'T9', authCode: 'A' });
  assert.equal(F.balance(b, 'ADVANCES_IN'), T(1300));
  assert.throws(() => F.terminalPayment(b, { key: 'd', posId: 'pos-garanti', amount: T(300), txnId: 'T9', authCode: 'A' }), /zaten kaydedilmiş/);
  assert.equal(F.terminalPayment(b, { key: 'c', posId: 'pos-garanti', amount: T(300), customer: 'Kapıdan', txnId: 'T9', authCode: 'A' }), b.collections.at(-1).id, 'aynı anahtar → aynı sonuç');
});

// ───────── Medula ─────────
test('TC kimlik algoritması ve reçete numarası kontrolü', () => {
  assert.equal(M.tcValid('10000000146'), true);
  assert.equal(M.tcValid('10000000147'), false);
  assert.equal(M.tcValid('01234567890'), false);
  assert.equal(M.receteNoValid('3K7P2QA'), true);
  assert.equal(M.receteNoValid('12'), false);
  assert.equal(M.maskTC('10000000146'), '100******46');
});

test('SGK payı: Medula tutarı önceliklidir; satış tutarını aşamaz; tarife boşsa sıfır', () => {
  assert.deepEqual(M.computeShares({ total: T(3000), items: [{ tur: 'uzak-cam', adet: 2 }], tariff: { 'uzak-cam': T(200) } }), { sgk: T(400), patient: T(2600), source: 'tarife' });
  assert.equal(M.computeShares({ total: T(3000), items: [], medulaAmount: T(500) }).sgk, T(500));
  assert.equal(M.computeShares({ total: T(100), items: [{ tur: 'cerceve' }], tariff: { cerceve: T(400) } }).sgk, T(100));
  assert.equal(M.computeShares({ total: T(100), items: [{ tur: 'cerceve' }] }).sgk, 0);
});

test('Provizyon: aynı reçeteye ikinci provizyon açılmaz; teslim edilmeyen faturaya girmez; faturalanan iptal edilemez', async () => {
  const st = M.createMedulaState({ tariff: { 'uzak-cam': T(150), cerceve: T(100) } });
  const ad = M.demoAdapter();
  const q = await ad.sorgula({ tc: '10000000146', receteNo: '3K7P2QA' });
  assert.equal(q.ok, true);
  const pv = await ad.provizyon({ tc: '10000000146', receteNo: '3K7P2QA' });
  const p = M.addProvision(st, { tc: '10000000146', receteNo: '3K7P2QA', hasta: 'Örnek', kalemler: q.recete.kalemler, takipNo: pv.takipNo, date: '2026-11-20', total: T(4000) });
  assert.equal(p.sgk, T(400));
  assert.throws(() => M.addProvision(st, { tc: '10000000146', receteNo: '3k7p2qa', kalemler: [], takipNo: 'BAŞKA', date: '2026-11-20', total: T(4000) }), /zaten provizyon/);
  assert.equal(M.monthlyBatch(st, '2026-11').count, 0);
  M.markDelivered(st, p.id);
  assert.equal(M.markInvoiced(st, '2026-11', 'SGK-11').total, T(400));
  assert.throws(() => M.cancelProvision(st, p.id, 'x'), /faturalanmış/);
  assert.equal(M.markPaid(st, 'SGK-11').total, T(400));
  assert.equal((await ad.sorgula({ tc: '10000000146', receteNo: 'ABC99' })).hak.uygun, false);
});

test('SGK payı finansta müşteri alacağından SGK alacağına geçer; SGK ödeyince kapanır', () => {
  const b = books();
  F.syncOrder(b, order({ delivered: true, deliveredOn: '2026-11-20' }));
  assert.equal(F.orderBalance(b, 'o1'), T(4000));
  assert.throws(() => F.sgkClaim(b, { key: 's0', orderId: 'o1', amount: T(4001), takipNo: 'X' }), /açık bakiyesinden/);
  F.sgkClaim(b, { key: 's1', orderId: 'o1', amount: T(600), takipNo: 'DEMO1' });
  assert.equal(F.orderBalance(b, 'o1'), T(3400), 'müşteri yalnızca farkı öder');
  assert.equal(F.balance(b, 'SGK_RECEIVABLE'), T(600));
  F.sgkCollect(b, { key: 'c1', bankId: 'bank', amount: T(600), invoiceNo: 'SGK-11' });
  assert.equal(F.balance(b, 'SGK_RECEIVABLE'), 0);
  assert.equal(F.balance(b, 'bank'), T(1600));
  assert.throws(() => F.sgkCollect(b, { key: 'c2', bankId: 'bank', amount: T(1) }), /alacak yok/);
  const nd = books();
  F.syncOrder(nd, order());
  assert.throws(() => F.sgkClaim(nd, { key: 's', orderId: 'o1', amount: T(1), takipNo: 'X' }), /teslimden sonra/);
});
