import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../finance/engine.mjs';

const T = (tl) => Math.round(tl * 100);
function books() {
  const b = F.createBooks({ today: '2026-11-30' });
  b.branches = [];
  F.saveBranch(b, { newId: 'magaza', label: 'Mağaza', kind: 'store', cashAccount: 'cash' });
  F.saveBranch(b, { newId: 'online', label: 'E-ticaret', kind: 'online', sellers: ['İnternet'], stockFrom: 'magaza', cashAccount: 'cash' });
  F.saveBranch(b, { newId: 'merkez', label: 'Merkez', kind: 'hq' });
  F.saveMoneyAccount(b, { newId: 'bank', label: 'Banka', kind: 'bank' });
  F.saveMoneyAccount(b, { newId: 'cash', label: 'Kasa', kind: 'cash' });
  F.saveMoneyAccount(b, { newId: 'pos-garanti', label: 'Garanti POS', kind: 'pos', pos: { bankId: 'bank', settleDays: 1, rates: { 1: 350, 3: 900 }, auto: true } });
  F.saveMoneyAccount(b, { newId: 'pos-diger', label: 'Diğer POS', kind: 'pos' });
  F.saveParty(b, { newId: 'lux', label: 'Luxottica', type: 'supplier' });
  F.saveParty(b, { newId: 'ajans', label: 'Ajans', type: 'service' });
  F.postOpening(b, { date: '2026-11-01', items: [{ account: 'bank', amount: T(100000) }, { account: 'cash', amount: T(1000) }] });
  F.openingStock(b, { date: '2026-11-01', lines: [{ sku: 'GOZ', label: 'Çerçeve', branchId: 'magaza', qty: 10, unitCost: T(1000) }] });
  return b;
}
const order = (o = {}) => ({ id: 'o1', no: 'SP-1', date: '2026-11-10', customer: 'Müşteri', seller: 'Sema', total: T(4400), lines: [{ label: 'Çerçeve', qty: 2, unitPrice: T(2200), vatRate: 10, category: 'Optik Çerçeve', sku: 'GOZ' }], payments: [{ amount: T(1000), date: '2026-11-10', method: 'cash' }], delivered: false, ...o });

test('Alış faturası SKU satırlarıyla stoğa girer; ortalama maliyet güncellenir', () => {
  const b = books();
  F.recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', date: '2026-11-05', net: T(14000), vat: T(1400), lines: [{ sku: 'GOZ', qty: 10, unitCost: T(1400) }] });
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 20);
  assert.equal(F.avgCost(b, 'GOZ'), T(1200));
  assert.equal(F.balance(b, 'INVENTORY'), F.stockValue(b));
  assert.throws(() => F.planDocument(b, { type: 'purchase', partyId: 'lux', date: '2026-11-05', net: T(100), lines: [{ sku: 'GOZ', qty: 1, unitCost: T(99) }] }), /matrahla aynı/);
});

test('Föy kaydı: kapora avanstır, hasılat yok; teslimde satış, KDV ve SMM oluşur; aynı kayıt tekrar gelince çift kayıt olmaz', () => {
  const b = books();
  F.syncOrder(b, order());
  assert.equal(F.balance(b, 'ADVANCES_IN'), T(1000));
  assert.equal(F.profitAndLoss(b).sales, 0);
  F.syncOrder(b, order());
  assert.equal(F.balance(b, 'cash'), T(2000), 'aynı tahsilat ikinci kez işlenmez');
  F.syncOrder(b, order({ payments: [{ amount: T(1000), date: '2026-11-10', method: 'cash' }, { amount: T(3400), date: '2026-11-12', method: 'card', detail: 'Garanti 3 Taksit' }], delivered: true, deliveredOn: '2026-11-12' }));
  const pl = F.profitAndLoss(b);
  assert.equal(pl.sales, T(4000));
  assert.equal(F.balance(b, 'OUTPUT_VAT'), T(400));
  assert.equal(pl.cogs, T(2000));
  assert.equal(pl.grossProfit, T(2000));
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 8);
  assert.equal(F.balance(b, 'pos-garanti'), T(3400));
  assert.equal(F.orderBalance(b, 'o1'), 0);
  assert.equal(b.collections.find((c) => c.accountId === 'pos-garanti').installments, 3);
});

test('Teslimden sonra kalan bakiye müşteri alacağıdır; sonraki tahsilat alacağı kapatır', () => {
  const b = books();
  F.syncOrder(b, order({ delivered: true, deliveredOn: '2026-11-11' }));
  assert.equal(F.orderBalance(b, 'o1'), T(3400));
  F.syncOrder(b, order({ delivered: true, payments: [{ amount: T(1000), date: '2026-11-10', method: 'cash' }, { amount: T(3400), date: '2026-11-20', method: 'cash' }] }));
  assert.equal(F.orderBalance(b, 'o1'), 0);
  assert.equal(F.balance(b, 'ADVANCES_IN'), 0);
});

test('İndirim satırlara oranla dağıtılır; farklı KDV oranları ayrı hesaplanır; SKU olmayan satış işaretlenir', () => {
  const b = books();
  F.syncOrder(b, order({ total: T(9000), lines: [{ label: 'Çerçeve', qty: 1, unitPrice: T(5500), vatRate: 10, sku: 'GOZ' }, { label: 'Güneş', qty: 1, unitPrice: T(4500), vatRate: 20 }], payments: [], delivered: true }));
  const o = b.orders[0];
  assert.equal(o.lines[0].gross + o.lines[1].gross, T(9000));
  assert.equal(o.lines[1].vat, Math.round((o.lines[1].gross * 20) / 120));
  assert.equal(F.profitAndLoss(b).unlinked, o.lines[1].net);
});

test('E-ticaret satışı şubesine yazılır, stok mağazadan düşer; şube kâr/zararı ayrışır', () => {
  const b = books();
  F.recordDocument(b, { key: 'r', type: 'expense', partyId: 'ajans', categoryId: 'advertising', branchId: 'online', date: '2026-11-05', net: T(500) });
  F.syncOrder(b, order({ seller: 'İnternet (Online)', delivered: true }));
  const br = F.branchPL(b);
  const on = br.rows.find((r) => r.branch.id === 'online').pl;
  assert.equal(on.sales, T(4000));
  assert.equal(on.cogs, T(2000));
  assert.equal(on.expenses, T(500));
  assert.equal(br.rows.find((r) => r.branch.id === 'magaza').pl.sales, 0);
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 8);
});

test('Negatif stok kapalı: stokta olmayan ürün teslim edilemez', () => {
  const b = books();
  assert.throws(() => F.syncOrder(b, order({ lines: [{ label: 'Çerçeve', qty: 11, unitPrice: T(400), vatRate: 10, sku: 'GOZ' }], delivered: true })), /stoğu yetersiz/);
});

test('Satış iadesi: 610 + KDV düzeltmesi, stoğa teslim maliyetiyle geri giriş, nakit iade bir kez', () => {
  const b = books();
  F.syncOrder(b, order({ payments: [{ amount: T(4400), date: '2026-11-10', method: 'cash' }], delivered: true }));
  F.returnOrder(b, { key: 'ret', orderId: 'o1', date: '2026-11-15', lines: [{ index: 0, qty: 1 }], refund: { accountId: 'cash', amount: T(2200) }, reason: 'Beğenmedi' });
  const pl = F.profitAndLoss(b);
  assert.equal(pl.returns, T(2000));
  assert.equal(pl.sales, T(2000));
  assert.equal(pl.cogs, T(1000));
  assert.equal(F.balance(b, 'OUTPUT_VAT'), T(200));
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 9);
  assert.equal(F.balance(b, 'cash'), T(1000 + 4400 - 2200));
  assert.equal(F.orderBalance(b, 'o1'), 0);
  assert.throws(() => F.returnOrder(b, { key: 'ret2', orderId: 'o1', lines: [{ index: 0, qty: 2 }], reason: 'x' }), /aşamaz/);
  assert.throws(() => F.returnOrder(b, { key: 'ret3', orderId: 'o1', lines: [{ index: 0, qty: 1 }], refund: { accountId: 'cash', amount: T(2201) }, reason: 'x' }), /aşamaz/);
  assert.equal(F.reportBridge(b).other, 0);
});

test('Teslim edilmemiş sipariş iptali: kapora iadesi avansı kapatır, hasılat ve stok etkilenmez', () => {
  const b = books();
  F.syncOrder(b, order());
  F.returnOrder(b, { key: 'c', orderId: 'o1', date: '2026-11-12', refund: { accountId: 'cash', amount: T(1000) }, reason: 'Müşteri vazgeçti' });
  assert.equal(F.balance(b, 'ADVANCES_IN'), 0);
  assert.equal(b.orders[0].cancelled, true);
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 10);
  assert.equal(F.profitAndLoss(b).sales, 0);
});

test('POS: taksit oranından tahmini komisyon; elle girişte FIFO kapanır; otomatik modda valörü gelenler aktarılır', () => {
  const b = books();
  F.syncOrder(b, order({ payments: [{ amount: T(1000), date: '2026-11-10', method: 'card', detail: 'Garanti Tek çekim' }, { amount: T(2000), date: '2026-11-11', method: 'card', detail: 'Garanti 3 Taksit' }] }));
  const pp = F.posPending(b, 'pos-garanti', '2026-11-11');
  assert.equal(pp.gross, T(3000));
  assert.equal(pp.due, T(1000));
  assert.equal(pp.dueFee, T(35));
  F.settlePosAuto(b, { key: 'auto', posId: 'pos-garanti', date: '2026-11-11' });
  assert.equal(F.balance(b, 'bank'), T(100000 + 1000 - 35));
  assert.equal(F.posPending(b, 'pos-garanti', '2026-11-30').gross, T(2000));
  F.settlePos(b, { key: 'man', date: '2026-11-13', posId: 'pos-garanti', bankId: 'bank', gross: T(2000), fee: T(185) });
  assert.equal(F.balance(b, 'exp:pos-fee'), T(220));
  assert.equal(F.posPending(b, 'pos-garanti').gross, 0);
  assert.equal(F.posForCard(b, 'Ziraat 2 Taksit'), 'pos-diger');
  assert.throws(() => F.settlePosAuto(b, { key: 'x', posId: 'pos-diger' }), /otomatik hesaplama kapalı/);
});

test('Mal kabul (faturasız) stoğu artırır; fatura gelince GRNI kapanır, fiyat farkı stok değerine yansır', () => {
  const b = books();
  const rc = F.goodsReceipt(b, { key: 'g', date: '2026-11-03', partyId: 'lux', branchId: 'magaza', lines: [{ sku: 'GOZ', qty: 5, unitCost: T(1000) }], ref: 'İRS-1' });
  assert.equal(F.balance(b, 'GRNI'), T(5000));
  F.recordDocument(b, { key: 'f', type: 'purchase', partyId: 'lux', date: '2026-11-06', net: T(5500), vat: T(550), receiptId: rc });
  assert.equal(F.balance(b, 'GRNI'), 0);
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 15);
  assert.equal(F.balance(b, 'INVENTORY'), F.stockValue(b));
  assert.equal(F.stockValue(b), T(15500));
});

test('Sayım farkı ortalama maliyetle gider olur; muhasebe stoğu defterle tutarlı kalır', () => {
  const b = books();
  F.stockCount(b, { key: 's', date: '2026-11-20', sku: 'GOZ', branchId: 'magaza', counted: 9 });
  assert.equal(F.balance(b, 'exp:stock-diff'), T(1000));
  assert.equal(F.stockQty(b, 'GOZ', 'magaza'), 9);
  assert.equal(F.balance(b, 'INVENTORY'), F.stockValue(b));
});

test('Personel masrafı kasadan bir kez çıkar, onay bekler; muhasebe kategoriyi değiştirince nakit etkisi olmaz', () => {
  const b = books();
  const id = F.pettyExpense(b, { key: 'p', date: '2026-11-20', branchId: 'magaza', accountId: 'cash', amount: T(200), categoryId: 'cleaning', note: 'Deterjan', hasReceipt: true, by: 'Sema' });
  assert.equal(F.balance(b, 'cash'), T(800));
  assert.equal(b.documents.find((d) => d.id === id).pending, true);
  F.approveExpense(b, { docId: id, categoryId: 'maintenance' });
  assert.equal(F.balance(b, 'exp:cleaning'), 0);
  assert.equal(F.balance(b, 'exp:maintenance'), T(200));
  assert.equal(F.balance(b, 'cash'), T(800));
  assert.throws(() => F.pettyExpense(b, { key: 'q', date: '2026-11-20', accountId: 'cash', amount: T(1), categoryId: 'rent', note: 'x' }), /Masraf türünü/);
});

test('Gün sonu sayımı: bankaya yatan virmanlanır; açık incelemeye, fazla diğer gelire yazılır; aynı gün ikinci sayım yok', () => {
  const b = books();
  const r = F.cashCount(b, { key: 'k', date: '2026-11-20', accountId: 'cash', counted: T(400), deposit: { bankId: 'bank', amount: T(500) } });
  assert.equal(r.system, T(500));
  assert.equal(r.diff, -T(100));
  assert.equal(F.balance(b, 'cash'), T(400));
  assert.equal(F.reviewItems(b)[0].amount, T(100));
  F.cashCount(b, { key: 'k2', date: '2026-11-21', accountId: 'cash', counted: T(450) });
  assert.equal(F.profitAndLoss(b).otherIncome, T(50));
  assert.throws(() => F.cashCount(b, { key: 'k3', date: '2026-11-21', accountId: 'cash', counted: T(450) }), /zaten var/);
});

test('Taksitli alış: borç vadelere bölünür, toplam tutmazsa reddedilir', () => {
  const b = books();
  const id = F.recordDocument(b, { key: 'm', type: 'purchase', partyId: 'lux', date: '2026-11-20', net: T(3000), lines: [{ sku: 'GOZ', qty: 3, unitCost: T(1000) }], schedule: [{ due: '2026-11-30', amount: T(1000) }, { due: '2026-12-30', amount: T(1000) }, { due: '2027-01-30', amount: T(1000) }] });
  const obs = b.obligations.filter((o) => o.docId === id);
  assert.equal(obs.length, 3);
  assert.deepEqual(obs.map((o) => o.due), ['2026-11-30', '2026-12-30', '2027-01-30']);
  assert.throws(() => F.planDocument(b, { type: 'purchase', partyId: 'lux', date: '2026-11-20', net: T(3000), schedule: [{ due: '2026-11-30', amount: T(1000) }] }), /aynı olmalı/);
});

test('Bütçe: plan / fiili / sapma; önceki aydan kopyalanır', () => {
  const b = books();
  F.setBudget(b, { period: '2026-11', key: 'sales', amount: T(5000) });
  F.setBudget(b, { period: '2026-11', key: 'advertising', amount: T(400) });
  F.recordDocument(b, { key: 'r', type: 'expense', partyId: 'ajans', categoryId: 'advertising', date: '2026-11-05', net: T(500) });
  F.syncOrder(b, order({ delivered: true }));
  const r = F.budgetReport(b, { period: '2026-11' });
  assert.equal(r.rows.find((x) => x.key === 'sales').variance, T(4000) - T(5000));
  assert.equal(r.rows.find((x) => x.key === 'advertising').variance, -T(100));
  assert.equal(F.copyBudget(b, { from: '2026-11', to: '2026-12' }), 2);
  assert.equal(F.budgetReport(b, { period: '2026-12' }).rows.find((x) => x.key === 'sales').plan, T(5000));
});

test('Ek dosya: tür ve boyut kontrolü; belge ve ödemede saklanır', () => {
  const b = books();
  const ok = [{ id: 'f1', name: 'fatura.pdf', type: 'application/pdf', size: 1000 }];
  const id = F.recordDocument(b, { key: 'a', type: 'expense', partyId: 'ajans', categoryId: 'advertising', date: '2026-11-05', net: T(10), attachments: ok });
  assert.equal(b.documents.find((d) => d.id === id).attachments[0].name, 'fatura.pdf');
  assert.throws(() => F.planDocument(b, { type: 'expense', partyId: 'ajans', categoryId: 'advertising', date: '2026-11-05', net: T(10), attachments: [{ id: 'x', name: 'virus.exe', type: 'application/x-msdownload', size: 10 }] }), /yalnızca PDF/);
  assert.throws(() => F.planDocument(b, { type: 'expense', partyId: 'ajans', categoryId: 'advertising', date: '2026-11-05', net: T(10), attachments: [{ id: 'x', name: 'b.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }] }), /10 MB/);
});

test('Demo: şubeler, stok ve satış kayıtları tutarlı', () => {
  const b = F.demoBooks();
  const tb = F.trialBalance(b);
  assert.equal(tb.debit, tb.credit);
  assert.equal(F.balance(b, 'INVENTORY'), F.stockValue(b));
  assert.equal(F.reportBridge(b, { from: '2026-11-01', to: '2026-11-25' }).other, 0);
  assert.equal(F.cashFlow(b, { from: '2026-11-01', to: '2026-11-25' }).balanced, true);
  const br = F.branchPL(b, { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(br.rows.reduce((s, r) => s + r.pl.result, 0), br.total.result);
});
