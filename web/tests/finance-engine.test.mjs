import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../finance/engine.mjs';

const T = (tl) => Math.round(tl * 100);
const {
  createBooks, saveMoneyAccount, saveParty, postOpening, recordDocument, planDocument, recordPayment, reversePayment,
  reverseDocument, resolveReview, reviewItems, balance, remaining, paymentReport, cashReport, profitAndLoss, cashFlow,
  trialBalance, transfer, returnInstrument, applyAdvance, advanceAvailable, lockPeriod, recordCollection, deliverOrder,
  settlePos, generateRecurring, saveTemplate, projection, openItems, demoBooks, updatePlan, closingChecks, reconcile,
} = F;

/** Seiko örneği için temiz defter: banka 100.000, Seiko borcu 50.000, kart açılışı 0. */
function books(today = '2026-11-30') {
  const b = createBooks({ today });
  saveMoneyAccount(b, { newId: 'bank', label: 'Banka', kind: 'bank' });
  saveMoneyAccount(b, { newId: 'bank2', label: 'İkinci banka', kind: 'bank' });
  saveMoneyAccount(b, { newId: 'cash', label: 'Kasa', kind: 'cash' });
  saveMoneyAccount(b, { newId: 'card', label: 'Şirket kartı', kind: 'card' });
  saveMoneyAccount(b, { newId: 'pos', label: 'POS', kind: 'pos' });
  saveParty(b, { newId: 'seiko', label: 'Seiko', type: 'supplier' });
  saveParty(b, { newId: 'lux', label: 'Luxottica', type: 'supplier' });
  saveParty(b, { newId: 'ajans', label: 'Ajans', type: 'service' });
  saveParty(b, { newId: 'ev', label: 'Ev sahibi', type: 'landlord' });
  saveParty(b, { newId: 'sigorta', label: 'Sigorta', type: 'personal' });
  saveParty(b, { newId: 'kredi', label: 'Kredi bankası', type: 'bank' });
  postOpening(b, {
    date: '2026-11-01',
    items: [
      { account: 'bank', amount: T(100000) },
      { account: 'cash', amount: T(5000) },
      { account: 'PAYABLE', party: 'seiko', amount: T(50000) },
      { account: 'LOAN', party: 'kredi', amount: T(100000) },
    ],
    dues: { 'seiko:PAYABLE': { due: '2026-11-10' } },
  });
  return b;
}
const seikoItem = (b) => b.obligations.find((o) => o.partyId === 'seiko');
const cashTotal = (b, asOf) => ['bank', 'bank2', 'cash'].reduce((s, a) => s + balance(b, a, { asOf }), 0);
function seiko({ pay = true } = {}) {
  const b = books();
  recordPayment(b, { key: 'k1', date: '2026-11-10', method: 'card', accountId: 'card', allocations: [{ obligationId: seikoItem(b).id, amount: T(50000) }] });
  const st = recordDocument(b, { key: 'st', type: 'card-statement', cardId: 'card', date: '2026-11-17', due: '2026-11-24', total: T(54000) });
  const stItem = b.obligations.find((o) => o.docId === st);
  if (pay) recordPayment(b, { key: 'k2', date: '2026-11-24', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: stItem.id, amount: T(54000) }] });
  return { b, stItem, st };
}

test('Seiko 10 Kasım: kartla ödeme satıcıyı kapatır, kart borcu doğar, bankadan para çıkmaz', () => {
  const { b } = seiko({ pay: false });
  assert.equal(balance(b, 'PAYABLE', { party: 'seiko' }), 0);
  assert.equal(balance(b, 'card'), T(50000));
  assert.equal(balance(b, 'bank'), T(100000));
  assert.equal(cashReport(b).out, 0);
});

test('Ekstre girişi sistemdeki kart borcuyla karşılaştırılır; fark önceden görünür', () => {
  const { b, st } = seiko({ pay: false });
  const d = b.documents.find((x) => x.id === st);
  assert.equal(d.known, T(50000));
  assert.equal(d.difference, T(4000));
  assert.equal(profitAndLoss(b).expenses, 0, 'ekstre farkı otomatik gider değildir');
});

test('Seiko 24 Kasım: 54.000 bankadan bir kez çıkar, kart sıfırlanır, 4.000 incelemeye düşer', () => {
  const { b } = seiko();
  assert.equal(balance(b, 'bank'), T(46000));
  assert.equal(balance(b, 'card'), 0);
  assert.equal(balance(b, 'REVIEW'), T(4000));
  assert.equal(reviewItems(b).length, 1);
  assert.equal(profitAndLoss(b).expenses, 0);
});

test('Üç rapor ayrı: Seiko ödemesi 50.000 (kart), nakit çıkışı 54.000, toplam 104.000 olmaz', () => {
  const { b } = seiko();
  const pr = paymentReport(b);
  assert.equal(pr.rows.find((r) => r.party === 'Seiko').amount, T(50000));
  assert.equal(pr.byMethod.card, T(50000));
  assert.equal(pr.total, T(50000), 'ekstre ödemesi tedarikçiye ikinci ödeme değildir');
  assert.equal(cashReport(b).out, T(54000));
  const br = F.reportBridge(b);
  assert.equal(br.payments - br.card - br.instruments + br.statements + br.redemptions, br.cashOut);
  assert.equal(cashFlow(b).classes.operating.out, T(54000));
});

test('Fark faiz olarak sınıflanınca gider olur ama yeni nakit çıkışı yaratmaz', () => {
  const { b } = seiko();
  const r = reviewItems(b)[0];
  resolveReview(b, { key: 'r1', reviewId: r.id, amount: T(4000), target: 'interest', date: '2026-11-25' });
  assert.equal(balance(b, 'REVIEW'), 0);
  assert.equal(balance(b, 'exp:interest'), T(4000));
  assert.equal(cashReport(b).out, T(54000));
  assert.throws(() => resolveReview(b, { key: 'r2', reviewId: r.id, amount: 1, target: 'fee' }), /aşıyor/);
});

test('Fark önceki dönem borcu ise açılış düzeltmesidir; gider tablosunu bozmaz. Parçalı sınıflama desteklenir', () => {
  const { b } = seiko();
  const r = reviewItems(b)[0];
  resolveReview(b, { key: 'r1', reviewId: r.id, amount: T(3000), target: 'opening' });
  resolveReview(b, { key: 'r2', reviewId: r.id, amount: T(1000), target: 'fee' });
  assert.equal(profitAndLoss(b).expenses, T(1000));
  assert.equal(reviewItems(b)[0].remaining, 0);
});

test('Faiz ekstre girilirken belgelenirse kart borcuna eklenir, ödeme farksız kapanır', () => {
  const b = books();
  recordPayment(b, { key: 'k1', date: '2026-11-10', method: 'card', accountId: 'card', allocations: [{ obligationId: seikoItem(b).id, amount: T(50000) }] });
  const st = recordDocument(b, { key: 'st', type: 'card-statement', cardId: 'card', date: '2026-11-17', due: '2026-11-24', total: T(54000), explained: [{ amount: T(4000), categoryId: 'interest' }] });
  const o = b.obligations.find((x) => x.docId === st);
  recordPayment(b, { key: 'k2', date: '2026-11-24', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: o.id, amount: T(54000) }] });
  assert.equal(balance(b, 'REVIEW'), 0);
  assert.equal(balance(b, 'card'), 0);
  assert.equal(balance(b, 'exp:interest'), T(4000));
});

test('Kısmi ekstre ödemesi önce bilinen kart borcunu kapatır', () => {
  const { b, stItem } = seiko({ pay: false });
  recordPayment(b, { key: 'p1', date: '2026-11-20', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: stItem.id, amount: T(30000) }] });
  assert.equal(balance(b, 'card'), T(20000));
  assert.equal(balance(b, 'REVIEW'), 0);
  recordPayment(b, { key: 'p2', date: '2026-11-24', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: stItem.id, amount: T(24000) }] });
  assert.equal(balance(b, 'card'), 0);
  assert.equal(balance(b, 'REVIEW'), T(4000));
});

test('Kart ekstresi kartla kapatılamaz; gelecek tarihli ödeme ve fazla ödeme reddedilir', () => {
  const { b, stItem } = seiko({ pay: false });
  assert.throws(() => recordPayment(b, { key: 'x', date: '2026-11-24', method: 'card', accountId: 'card', allocations: [{ obligationId: stItem.id, amount: 1 }] }), /ödenemez/);
  assert.throws(() => recordPayment(b, { key: 'y', date: '2026-12-01', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: stItem.id, amount: 1 }] }), /Gerçekleşmemiş/);
  assert.throws(() => recordPayment(b, { key: 'z', date: '2026-11-24', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: stItem.id, amount: T(54001) }] }), /aşıyor/);
});

test('Aynı ödeme iki kez gelirse ikinci kayıt oluşmaz; aynı anahtar farklı veriyle reddedilir', () => {
  const { b, stItem } = seiko({ pay: false });
  const x = { key: 'bank-ref-77', date: '2026-11-24', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: stItem.id, amount: T(54000) }] };
  recordPayment(b, x);
  recordPayment(b, structuredClone(x));
  assert.equal(balance(b, 'bank'), T(46000));
  assert.throws(() => recordPayment(b, { ...x, date: '2026-11-25' }), /IDEMPOTENCY_CONFLICT/);
});

test('Hizmet faturası: matrah gider, KDV indirilecek, tevkifat ve satıcı borcu ayrılır; ödeme gider yaratmaz', () => {
  const b = books();
  const id = recordDocument(b, { key: 'h', type: 'expense', partyId: 'ajans', categoryId: 'advertising', date: '2026-11-05', due: '2026-11-20', net: T(1000), vat: T(200), vatWithheld: T(60) });
  assert.equal(balance(b, 'exp:advertising'), T(1000));
  assert.equal(balance(b, 'INPUT_VAT'), T(200));
  assert.equal(balance(b, 'VAT_WH'), T(60));
  assert.equal(balance(b, 'PAYABLE', { party: 'ajans' }), T(1140));
  const o = b.obligations.find((x) => x.docId === id);
  recordPayment(b, { key: 'p', date: '2026-11-20', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: o.id, amount: T(1140) }] });
  const tax = recordDocument(b, { key: 't', type: 'tax', taxType: 'KDV2', period: '2026-11', date: '2026-11-25', due: '2026-11-26', amount: T(60) });
  recordPayment(b, { key: 'p2', date: '2026-11-26', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: b.obligations.find((x) => x.docId === tax).id, amount: T(60) }] });
  assert.equal(cashReport(b).out, T(1200));
  assert.equal(profitAndLoss(b).expenses, T(1000));
  assert.equal(balance(b, 'VAT_WH'), 0);
});

test('Stopajlı kira: brüt kira gider, ev sahibine net, stopaj vergi borcu', () => {
  const b = books();
  recordDocument(b, { key: 'k', type: 'expense', partyId: 'ev', categoryId: 'rent', date: '2026-11-01', net: T(30000), incomeWithheld: T(6000) });
  assert.equal(balance(b, 'exp:rent'), T(30000));
  assert.equal(balance(b, 'PAYABLE', { party: 'ev' }), T(24000));
  assert.equal(balance(b, 'INCOME_WH'), T(6000));
  assert.throws(() => planDocument(b, { type: 'expense', partyId: 'ev', categoryId: 'rent', date: '2026-11-01', net: T(100), vat: T(10), vatWithheld: T(11) }), /aşamaz/);
});

test('Aynı firmadan aynı numaralı belge ikinci kez girilemez; gelecek tarihli belge reddedilir', () => {
  const b = books();
  recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', docNo: 'LUX-1', date: '2026-11-03', net: T(100), vat: T(20) });
  assert.throws(() => recordDocument(b, { key: 'b', type: 'purchase', partyId: 'lux', docNo: 'lux-1', date: '2026-11-04', net: T(100) }), /zaten kayıtlı/);
  assert.throws(() => recordDocument(b, { key: 'c', type: 'purchase', partyId: 'lux', docNo: 'LUX-2', date: '2026-12-01', net: T(100) }), /bugünden sonra/);
});

test('Mal alışı stoğa girer, dönem gideri olmaz', () => {
  const b = books();
  recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', date: '2026-11-03', net: T(200000), vat: T(40000) });
  assert.equal(balance(b, 'INVENTORY'), T(200000));
  assert.equal(profitAndLoss(b).expenses, 0);
});

test('Çek verilişi nakit çıkışı değildir; vadede keşide bankasından tam tutarla bir kez ödenir', () => {
  const b = books();
  const d = recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', date: '2026-11-03', net: T(50000) });
  recordPayment(b, { key: 'c', date: '2026-11-05', method: 'cheque', accountId: 'bank', allocations: [{ obligationId: b.obligations.find((x) => x.docId === d).id, amount: T(50000) }], instrument: { no: 'CK-1', maturity: '2026-11-28' } });
  assert.equal(balance(b, 'PAYABLE', { party: 'lux' }), 0);
  assert.equal(balance(b, 'NOTES'), T(50000));
  assert.equal(cashReport(b).out, 0);
  assert.equal(paymentReport(b).byMethod.cheque, T(50000));
  const ins = b.obligations.find((o) => o.kind === 'instrument');
  assert.throws(() => recordPayment(b, { key: 'r0', date: '2026-11-28', method: 'transfer', accountId: 'bank2', allocations: [{ obligationId: ins.id, amount: T(50000) }] }), /keşide/);
  assert.throws(() => recordPayment(b, { key: 'r1', date: '2026-11-28', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: ins.id, amount: T(10000) }] }), /tam tutar/);
  recordPayment(b, { key: 'r2', date: '2026-11-28', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: ins.id, amount: T(50000) }] });
  assert.equal(cashReport(b).out, T(50000));
  assert.equal(paymentReport(b).total, T(50000), 'çek tahsili firmaya ikinci ödeme sayılmaz');
  assert.equal(b.instruments[0].status, 'paid');
});

test('İade edilen çek firma borcunu yeniden açar, nakit hareketi oluşturmaz', () => {
  const b = books();
  const d = recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', date: '2026-11-03', net: T(50000) });
  recordPayment(b, { key: 'c', date: '2026-11-05', method: 'note', allocations: [{ obligationId: b.obligations.find((x) => x.docId === d).id, amount: T(50000) }], instrument: { no: 'SN-1', maturity: '2026-12-28' } });
  returnInstrument(b, { key: 'ret', instrumentId: b.instruments[0].id, date: '2026-11-20', reason: 'Firma iade etti' });
  assert.equal(balance(b, 'NOTES'), 0);
  assert.equal(balance(b, 'PAYABLE', { party: 'lux' }), T(50000));
  assert.equal(openItems(b).filter((o) => o.partyId === 'lux').length, 1);
  assert.equal(cashReport(b).out, 0);
});

test('Kısmi havale desteklenir; kalan izlenir', () => {
  const b = books();
  const o = seikoItem(b);
  recordPayment(b, { key: 'a', date: '2026-11-10', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: o.id, amount: T(20000) }] });
  assert.equal(remaining(o), T(30000));
  assert.equal(F.obligationStatus(b, o), 'Kısmi · gecikmiş');
});

test('Faturasız avans verilir, sonra gelen faturaya nakit hareketi olmadan mahsup edilir', () => {
  const b = books();
  recordPayment(b, { key: 'av', date: '2026-11-02', method: 'transfer', accountId: 'bank', advance: { partyId: 'lux', amount: T(10000) } });
  assert.equal(balance(b, 'PAYABLE', { party: 'lux' }), -T(10000));
  const d = recordDocument(b, { key: 'f', type: 'purchase', partyId: 'lux', date: '2026-11-04', net: T(25000) });
  const o = b.obligations.find((x) => x.docId === d);
  applyAdvance(b, { key: 'm', partyId: 'lux', obligationId: o.id, amount: T(10000) });
  assert.equal(remaining(o), T(15000));
  assert.equal(advanceAvailable(b, 'lux'), 0);
  assert.equal(balance(b, 'PAYABLE', { party: 'lux' }), T(15000));
  assert.equal(cashReport(b).out, T(10000));
});

test('Şahsi / aile ödemesi şirket hesabından çıkar ama işletme gideri olmaz', () => {
  const b = books();
  const d = recordDocument(b, { key: 'p', type: 'personal', partyId: 'sigorta', date: '2026-11-20', amount: T(8000), beneficiary: 'Şirket sahibi', purpose: 'Sağlık sigortası' });
  recordPayment(b, { key: 'pp', date: '2026-11-21', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: b.obligations.find((x) => x.docId === d).id, amount: T(8000) }] });
  assert.equal(profitAndLoss(b).expenses, 0);
  assert.equal(balance(b, 'OWNER'), T(8000));
  assert.equal(cashFlow(b).classes.financing.out, T(8000));
  assert.throws(() => planDocument(b, { type: 'personal', partyId: 'sigorta', date: '2026-11-20', amount: 1, beneficiary: '', purpose: 'x' }), /zorunlu/);
});

test('Virman toplam nakdi ve gelir-gideri değiştirmez; kasa eksiye düşemez', () => {
  const b = books();
  transfer(b, { key: 't', date: '2026-11-12', from: 'cash', to: 'bank', amount: T(3000) });
  assert.equal(cashTotal(b), T(105000));
  assert.equal(cashReport(b).out, 0);
  assert.equal(cashFlow(b).classes.internal.in, T(3000));
  assert.throws(() => transfer(b, { key: 't2', date: '2026-11-12', from: 'cash', to: 'bank', amount: T(2001) }), /eksi bakiye/);
  assert.equal(balance(b, 'cash'), T(2000));
});

test('Bordro: brüt + işveren SGK gider; net maaş, SGK ve muhtasar ayrı borç; tahakkuk fazlası incelemeye', () => {
  const b = books();
  recordDocument(b, { key: 'b', type: 'payroll', date: '2026-11-01', period: '2026-10', gross: T(60000), employeeSgk: T(8400), employerSgk: T(9450), incomeTax: T(5850), stampTax: T(455.4) });
  assert.equal(balance(b, 'exp:personnel'), T(69450));
  assert.equal(balance(b, 'STAFF', { party: 'personel' }), T(45294.6));
  assert.equal(balance(b, 'SGK', { party: 'sgk' }), T(17850));
  assert.equal(balance(b, 'INCOME_WH'), T(6305.4));
  recordDocument(b, { key: 's', type: 'tax', taxType: 'SGK', period: '2026-10', date: '2026-11-20', due: '2026-11-30', amount: T(17850) });
  assert.equal(balance(b, 'REVIEW'), 0);
  recordDocument(b, { key: 'm', type: 'tax', taxType: 'MUHTASAR', period: '2026-10', date: '2026-11-20', due: '2026-11-26', amount: T(6500) });
  assert.equal(balance(b, 'REVIEW'), T(194.6));
  assert.equal(profitAndLoss(b).expenses, T(69450), 'tahakkuk ödemesi tekrar personel gideri yaratmaz');
  recordDocument(b, { key: 'm2', type: 'tax', taxType: 'MUHTASAR', period: '2026-10', date: '2026-11-20', due: '2026-11-26', amount: T(1) });
  assert.equal(balance(b, 'REVIEW'), T(195.6), 'aynı kesinti iki kez tahakkuk edilirse fark incelemeye düşer');
});

test('Kredi taksiti: anapara gider değildir, faiz giderdir, ödeme finansman çıkışıdır', () => {
  const b = books();
  const d = recordDocument(b, { key: 'l', type: 'loan', partyId: 'kredi', date: '2026-11-15', principal: T(25000), interest: T(6000), bsmv: T(300) });
  recordPayment(b, { key: 'lp', date: '2026-11-15', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: b.obligations.find((x) => x.docId === d).id, amount: T(31300) }] });
  assert.equal(profitAndLoss(b).expenses, T(6300));
  assert.equal(balance(b, 'LOAN', { party: 'kredi' }), T(75000));
  assert.equal(cashFlow(b).classes.financing.out, T(31300));
  assert.throws(() => planDocument(b, { type: 'loan', partyId: 'kredi', date: '2026-11-15', principal: T(75001) }), /aşıyor/);
});

test('KDV beyannamesi: hesaplanan − indirilecek netleşir, kâr/zararı etkilemez', () => {
  const b = books();
  recordCollection(b, { key: 'c', date: '2026-11-05', accountId: 'cash', gross: T(1200), vat: T(200), delivered: true });
  recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', date: '2026-11-03', net: T(500), vat: T(100) });
  const before = profitAndLoss(b).result;
  recordDocument(b, { key: 'v', type: 'tax', taxType: 'KDV1', period: '2026-11', date: '2026-11-25', due: '2026-11-28', outputVat: T(200), inputVat: T(100), amount: T(100) });
  assert.equal(balance(b, 'TAX', { party: 'vergi' }), T(100));
  assert.equal(balance(b, 'INPUT_VAT'), 0);
  assert.equal(profitAndLoss(b).result, before);
  assert.throws(() => planDocument(b, { type: 'tax', taxType: 'KDV1', date: '2026-11-25', outputVat: T(1), inputVat: 0, amount: T(1) }), /aşıyor/);
});

test('Sipariş kaporası avanstır; teslimde hasılata döner. POS komisyonu gider, net tutar bankaya geçer', () => {
  const b = books();
  const id = recordCollection(b, { key: 'k', date: '2026-11-18', accountId: 'pos', gross: T(4400), vat: T(400), delivered: false });
  assert.equal(balance(b, 'ADVANCES_IN'), T(4400));
  assert.equal(profitAndLoss(b).sales, 0);
  deliverOrder(b, { collectionId: id, date: '2026-11-25' });
  assert.equal(profitAndLoss(b).sales, T(4000));
  assert.equal(balance(b, 'OUTPUT_VAT'), T(400));
  settlePos(b, { key: 's', date: '2026-11-25', posId: 'pos', bankId: 'bank', gross: T(4400), fee: T(110) });
  assert.equal(balance(b, 'bank'), T(104290));
  assert.equal(balance(b, 'exp:pos-fee'), T(110));
  assert.throws(() => settlePos(b, { key: 's2', date: '2026-11-25', posId: 'pos', bankId: 'bank', gross: 1, fee: 0 }), /bekleyen/);
});

test('Ödenmiş belge iptal edilemez; ödeme ters kayıtla geri alınınca belge iptal edilebilir ve bakiyeler geri döner', () => {
  const b = books();
  const d = recordDocument(b, { key: 'a', type: 'expense', partyId: 'ajans', categoryId: 'advertising', date: '2026-11-05', net: T(1000) });
  const o = b.obligations.find((x) => x.docId === d);
  const pid = recordPayment(b, { key: 'p', date: '2026-11-06', method: 'transfer', accountId: 'bank', allocations: [{ obligationId: o.id, amount: T(1000) }] });
  assert.throws(() => reverseDocument(b, { docId: d, reason: 'hata' }), /ters kayıt/);
  reversePayment(b, { paymentId: pid, reason: 'Yanlış hesap' });
  reverseDocument(b, { docId: d, reason: 'Mükerrer fatura' });
  assert.equal(balance(b, 'bank'), T(100000));
  assert.equal(profitAndLoss(b).expenses, 0);
  assert.equal(trialBalance(b).debit, trialBalance(b).credit);
  assert.ok(b.entries.length >= 4, 'silme yok, ters kayıt var');
});

test('Kilitli döneme kayıt yapılamaz', () => {
  const b = books();
  lockPeriod(b, '2026-11-15');
  assert.throws(() => recordDocument(b, { key: 'a', type: 'purchase', partyId: 'lux', date: '2026-11-10', net: T(1) }), /kilitli/);
  recordDocument(b, { key: 'b', type: 'purchase', partyId: 'lux', date: '2026-11-16', net: T(1) });
  assert.throws(() => lockPeriod(b, '2026-11-01'), /geriye/);
});

test('Tekrarlayan planlar belge değildir: fiş ve nakit oluşturmaz, aynı ay iki kez üretilmez', () => {
  const b = books();
  saveTemplate(b, { label: 'Kira', partyId: 'ev', categoryId: 'rent', day: 5, amount: T(24000) });
  const n = b.entries.length;
  assert.equal(generateRecurring(b, '2026-12'), 1);
  assert.equal(generateRecurring(b, '2026-12'), 0);
  assert.equal(b.entries.length, n);
  assert.equal(projection(b, 10).items.filter((x) => x.expected).length, 1);
});

test('Kartla planlanan kalem nakit projeksiyonundan düşmez; plan değişikliği tarih ve şekli kontrol eder', () => {
  const b = books('2026-11-05');
  const o = seikoItem(b);
  const p0 = projection(b, 10).totalOut;
  updatePlan(b, { obligationId: o.id, date: '2026-11-10', method: 'card', accountId: 'card' });
  assert.equal(projection(b, 10).totalOut, p0 - T(50000));
  assert.throws(() => updatePlan(b, { obligationId: o.id, date: '2026-11-10', method: 'transfer', accountId: 'card' }), /uygun hesap/);
});

test('Mutabakat farkı kapanış kontrolünde görünür', () => {
  const { b } = seiko();
  reconcile(b, { accountId: 'bank', date: '2026-11-24', statementBalance: T(46000) });
  reconcile(b, { accountId: 'bank2', date: '2026-11-24', statementBalance: 0 });
  reconcile(b, { accountId: 'card', date: '2026-11-24', statementBalance: T(10) });
  const c = closingChecks(b).checks.find((x) => x.label.includes('mutabık'));
  assert.equal(c.ok, false);
  assert.match(c.detail, /Şirket kartı/);
});

test('Demo defteri: tüm fişler dengeli, nakit akışı kapanışla tutarlı, Seiko farkı incelemede', () => {
  const b = demoBooks();
  for (const e of b.entries) assert.equal(e.lines.reduce((s, l) => s + l.debit - l.credit, 0), 0);
  const tb = trialBalance(b);
  assert.equal(tb.debit, tb.credit);
  assert.equal(cashFlow(b, { from: '2026-11-01', to: '2026-11-25' }).balanced, true);
  assert.equal(reviewItems(b)[0].amount, T(4000));
  assert.ok(openItems(b).some((o) => o.status === 'Gecikmiş'));
  assert.ok(b.expected.length >= 3);
  assert.ok(paymentReport(b).total > cashReport(b).out, 'çek ve kartla ödemeler nakit çıkışı değildir');
  const br = F.reportBridge(b, { from: '2026-11-01', to: '2026-11-25' });
  assert.equal(br.other, 0, 'tüm nakit çıkışları ödeme kayıtlarıyla açıklanır');
});
