// Kuzmos önizleme arayüzü. Bu dosya build sırasında F (finans motoru), I/V/X (envanter), H (yardımcılar),
// ORIGINAL_FORM (korunan personel sipariş föyü) ve TEMPLATE_B64 (Excel şablonu) ile birlikte paketlenir.
(function () {
  'use strict';
  const { tl, esc, dateTR, monthTR, parseTL, formatInput } = H;
  const root = document.getElementById('kuzmos-app');
  const main = root.querySelector('#kz-main');
  let uidN = 0;
  const uid = () => Date.now().toString(36) + '-' + ++uidN;

  // ───────────────────────── durum ─────────────────────────
  const S = {
    books: F.demoBooks(),
    stock: I.inventorySeed(),
    role: 'admin',
    panel: 'finance',
    fin: 'overview',
    flash: null,
    doc: null,
    pay: null,
    plan: null,
    payFilter: 'open',
    payKind: 'all',
    paySearch: '',
    cal: { month: '2026-11', day: '' },
    partyId: '',
    accountId: 'bank-garanti',
    accRange: { from: '2026-11-01', to: '' },
    accAction: '',
    report: { tab: 'compare', from: '2026-11-01', to: '2026-11-30', branch: '', period: '2026-11', budgetBranch: '' },
    defs: 'parties',
    editDef: '',
    reviewId: '',
    inv: { view: 'eyewear', importPlan: null, manualKind: 'Gozluk' },
    staff: { barcode: '8680000001041', product: null, frame: null, ready: false, pending: null, nonce: '' },
    users: [],
    quickParty: false,
    files: {},
    ret: null,
    staffView: 'form',
    petty: { attachments: [] },
    pettyCat: {},
    stockAction: '',
  };
  const today = () => S.books.today;
  S.accRange.to = today();

  // ───────────────────────── küçük bileşenler ─────────────────────────
  const tag = (t, tone = '') => '<span class="tag ' + tone + '">' + esc(t) + '</span>';
  const statusTone = (s) => ({ Gecikmiş: 'bad', 'Kısmi · gecikmiş': 'bad', Bugün: 'warn', 'Bu hafta': 'warn', 'Kısmi ödendi': 'info', Ödendi: 'ok', İptal: '' })[s] || '';
  function head(title, sub, actions = '') {
    return '<div class="head"><div><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="row">' + actions + '</div></div>';
  }
  function kpi(label, value, sub = '', cls = '') {
    return '<article class="kpi ' + cls + '"><small>' + label + '</small><strong>' + value + '</strong><em>' + sub + '</em></article>';
  }
  function card(title, body, { sub = '', actions = '', id = '' } = {}) {
    return '<section class="card"' + (id ? ' id="' + id + '"' : '') + '><header><div><h3>' + title + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="row">' + actions + '</div></header>' + body + '</section>';
  }
  function table(headers, rows, { empty = 'Kayıt yok.', foot = '' } = {}) {
    if (!rows.length) return '<div class="empty">' + empty + '</div>';
    return '<div class="tbl"><table><thead><tr>' + headers.map((h) => (h.startsWith('#') ? '<th class="num">' + h.slice(1) + '</th>' : '<th>' + h + '</th>')).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody>' + (foot ? '<tfoot>' + foot + '</tfoot>' : '') + '</table></div>';
  }
  const td = (v, sub = '') => '<td>' + v + (sub ? '<small>' + sub + '</small>' : '') + '</td>';
  const tdn = (v, cls = '') => '<td class="num ' + cls + '">' + v + '</td>';
  function field(label, control, { hint = '', wide = false } = {}) {
    return '<label class="f' + (wide ? ' wide' : '') + '">' + label + control + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>';
  }
  function input(name, value = '', attrs = '') {
    return '<input name="' + name + '" value="' + esc(value) + '" ' + attrs + '>';
  }
  const money = (name, value, attrs = '') => input(name, value, 'inputmode="decimal" autocomplete="off" placeholder="0,00" ' + attrs);
  function select(name, options, value, attrs = '') {
    return '<select name="' + name + '" ' + attrs + '>' + options.map((o) => {
      const [v, t, dis] = Array.isArray(o) ? o : [o, o];
      return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + esc(t) + '</option>';
    }).join('') + '</select>';
  }
  const btn = (act, text, { cls = '', data = {}, pressed, disabled } = {}) =>
    '<button type="button" class="' + cls + '" data-act="' + act + '"' + Object.entries(data).map(([k, v]) => ' data-' + k + '="' + esc(v) + '"').join('') + (pressed !== undefined ? ' aria-pressed="' + pressed + '"' : '') + (disabled ? ' disabled' : '') + '>' + text + '</button>';
  const chips = (act, items, current) => '<div class="chips">' + items.map(([v, t]) => btn(act, t, { data: { v }, pressed: v === current })).join('') + '</div>';

  const partyLabel = (id) => S.books.parties.find((p) => p.id === id)?.label || '—';
  const accLabel = (id) => F.accountInfo(S.books, id)?.label || id || '—';
  const catLabel = (id) => S.books.categories.find((c) => c.id === id)?.label || '—';
  const activeAccounts = (kinds) => S.books.accounts.filter((a) => a.active && (!kinds || kinds.includes(a.kind)));
  const partiesOf = (types) => S.books.parties.filter((p) => p.active && (!types || types.includes(p.type)));
  const method = (m) => F.METHODS[m] || m;
  const branchLabel = (id) => S.books.branches.find((x) => x.id === id)?.label || (id ? id : 'Atanmamış');
  const branchOptions = (all) => [...(all ? [['', 'Tüm işletme']] : []), ...S.books.branches.filter((x) => x.active).map((x) => [x.id, x.label + ' · ' + F.BRANCH_KINDS[x.kind]])];
  const pctText = (v) => (v === undefined || v === null ? '' : (v / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }));
  const parseRate = (v) => {
    const t = String(v || '').trim().replace('%', '').replace(',', '.');
    if (!t) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 50) throw Error('Komisyon oranı % olarak 0–50 arası olmalı.');
    return Math.round(n * 100);
  };
  function attachList(kind, list) {
    return '<div class="row" style="gap:6px;margin-top:8px">' + (list || []).map((a) => '<span class="tag info">📎 ' + (S.files[a.id] ? '<a href="' + S.files[a.id].url + '" target="_blank" rel="noopener">' + esc(a.name) + '</a>' : esc(a.name)) + ' ' + btn('attach-del', '✕', { cls: 'ghost small', data: { kind, id: a.id } }) + '</span>').join('') + '<label class="small" style="cursor:pointer;color:var(--blue)">＋ Fatura / fiş / dekont ekle<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*" data-attach="' + kind + '" style="display:none"></label></div>';
  }
  function attachLinks(list) {
    return (list || []).map((a) => (S.files[a.id] ? '<a href="' + S.files[a.id].url + '" target="_blank" rel="noopener">📎 ' + esc(a.name) + '</a>' : '📎 ' + esc(a.name))).join(' ');
  }
  const kindLabel = (k) => ({ party: 'Firma borcu', staff: 'Maaş', tax: 'Vergi / SGK', loan: 'Kredi', 'card-statement': 'Kart ekstresi', instrument: 'Çek / senet', expected: 'Belge bekleniyor' })[k] || k;

  // ───────────────────────── işlem çalıştırma ─────────────────────────
  function flash(text, kind = 'ok') {
    S.flash = { text, kind };
  }
  /** Defterin kopyası üzerinde çalışır; hata olursa hiçbir şey değişmez (ya hepsi ya hiçbiri). */
  function mutate(fn, okText, errTarget) {
    const next = structuredClone(S.books);
    try {
      const r = fn(next);
      S.books = next;
      syncStock();
      if (okText) flash(typeof okText === 'function' ? okText(r) : okText);
      render();
      return true;
    } catch (e) {
      showError(e, errTarget);
      return false;
    }
  }
  /** Defterle envanter ekranını eşitler: miktar ve maliyet stok defterinden, rezerv teslim bekleyen siparişlerden gelir. */
  function syncStock() {
    const b = S.books;
    const brId = (label) => (b.branches.find((x) => x.label.toLocaleLowerCase('tr-TR').startsWith(String(label).toLocaleLowerCase('tr-TR'))) || { id: F.defaultBranch(b) }).id;
    for (const it of b.stock.items) {
      if (!S.stock.items.some((x) => x.sku === it.sku)) S.stock.items.push({ kind: /^CAM/.test(it.sku) ? 'opticalLens' : /^LEN/.test(it.sku) ? 'contactLens' : 'eyewear', brand: it.label, model: '', color: '', colorCode: '', eyeSize: '', bridge: '', temple: '', power: '', category: it.category || 'Optik Çerçeve', sku: it.sku, barcode: '', branch: 'Atrium', qty: 0, reserved: 0, price: 0 });
    }
    for (const x of S.stock.items) {
      if (!b.stock.items.some((i) => i.sku === x.sku)) continue;
      const br = brId(x.branch);
      x.qty = F.stockQty(b, x.sku, br);
      x.cost = F.avgCost(b, x.sku);
      x.reserved = b.orders.filter((o) => !o.delivered && !o.cancelled && o.stockBranch === br).reduce((s, o) => s + o.lines.filter((l) => l.sku === x.sku).reduce((t, l) => t + l.qty, 0), 0);
    }
  }
  function showError(e, target) {
    const msg = friendly(e.message);
    const el = target && main.querySelector(target);
    if (el) {
      el.textContent = msg;
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      flash(msg, 'err');
      render();
    }
  }
  function friendly(m) {
    return ({ IDEMPOTENCY_CONFLICT: 'Bu işlem farklı bilgilerle daha önce kaydedilmiş.', UNBALANCED_ENTRY: 'Fiş dengesiz; tutarları kontrol edin.', INVALID_LINE: 'Tutarlardan biri geçersiz.' })[m] || m;
  }
  function go(panel, fin) {
    S.panel = panel;
    if (fin) S.fin = fin;
    S.flash = null;
    render();
    root.scrollIntoView({ block: 'start' });
  }

  // ───────────────────────── kabuk ─────────────────────────
  const PANELS = [
    ['manager', 'Yönetici'],
    ['finance', 'Finans · Gider'],
    ['staff', 'Personel · Sipariş'],
    ['inventory', 'Envanter · Barkod'],
  ];
  function render() {
    if (!H.canPanel(S.role, S.panel) && !(S.panel === 'users' && S.role === 'admin')) S.panel = H.ROLE_PANELS[S.role][0];
    root.querySelector('#kz-today').textContent = 'Çalışma günü: ' + dateTR(today(), { year: true, weekday: true });
    const roleSel = root.querySelector('#kz-role');
    roleSel.innerHTML = Object.entries(H.ROLE_LABELS).map(([v, t]) => '<option value="' + v + '"' + (v === S.role ? ' selected' : '') + '>' + t + '</option>').join('');
    root.querySelector('#kz-tabs').innerHTML = PANELS.filter(([p]) => H.canPanel(S.role, p)).map(([p, t]) => btn('panel', t, { data: { v: p }, pressed: p === S.panel || (p === 'manager' && S.panel === 'users') })).join('');
    S.staff.frame = null;
    S.staff.ready = false;
    const fl = S.flash ? '<div class="flash ' + (S.flash.kind === 'err' ? 'err' : '') + '" role="status"><span>' + esc(S.flash.text) + '</span>' + btn('dismiss', '✕', { cls: 'ghost' }) + '</div>' : '';
    if (S.panel === 'finance') main.innerHTML = '<div class="layout">' + financeNav() + '<div class="content">' + fl + financeScreen() + '</div></div>';
    else main.innerHTML = '<div class="layout single"><div class="content">' + fl + ({ manager: managerScreen, staff: staffScreen, inventory: inventoryScreen, users: usersScreen }[S.panel] || managerScreen)() + '</div></div>';
    if (S.panel === 'staff') mountStaffFrame();
    if (S.panel === 'finance' && S.fin === 'new') refreshDocPreview();
    if (S.panel === 'finance' && S.pay) refreshPayPreview();
  }

  // ───────────────────────── finans menüsü ─────────────────────────
  function financeNav() {
    const b = S.books;
    const overdue = F.openItems(b).filter((o) => o.due < today()).length;
    const reviews = F.reviewItems(b).filter((r) => r.remaining > 0).length + b.documents.filter((d) => d.pending && !d.reversed).length;
    const ins = b.instruments.filter((x) => x.status === 'issued').length;
    const items = [
      ['Günlük', [['overview', 'Özet'], ['new', '＋ Yeni kayıt'], ['payables', 'Ödemeler', overdue], ['calendar', 'Takvim']]],
      ['Kayıtlar', [['parties', 'Cariler'], ['accounts', 'Banka · kasa · kart'], ['instruments', 'Çek / senet', ins, 'soft'], ['sales', 'Satışlar & POS'], ['stock', 'Stok & maliyet']]],
      ['Kontrol', [['review', 'İnceleme', reviews], ['reports', 'Raporlar'], ['closing', 'Kapanış'], ['defs', 'Tanımlar']]],
    ];
    return '<nav class="side" aria-label="Finans menüsü">' + items.map(([g, xs]) => '<div class="grp">' + g + '</div>' + xs.map(([v, t, n, cls]) => btn('fin', '<span>' + t + '</span>' + (n ? '<span class="badge ' + (cls || '') + '">' + n + '</span>' : ''), { data: { v }, pressed: S.fin === v || (v === 'parties' && S.fin === 'party') })).join('')).join('') + '</nav>';
  }
  function financeScreen() {
    return ({ overview, new: newRecord, payables, calendar, parties, party: partyDetail, accounts, instruments, sales, stock, review, reports, closing, defs }[S.fin] || overview)();
  }

  // ───────────────────────── Özet ─────────────────────────
  function overview() {
    const b = S.books;
    const bal = F.moneyBalances(b);
    const cash = bal.filter((a) => ['bank', 'cash'].includes(a.kind));
    const cards = bal.filter((a) => a.kind === 'card');
    const open = F.openItems(b);
    const overdue = open.filter((o) => o.due < today());
    const week = open.filter((o) => (o.plan?.date || o.due) <= F.addDays(today(), 7));
    const rv = F.reviewItems(b).filter((r) => r.remaining > 0);
    const pj = F.projection(b, 30);
    const month = today().slice(0, 7);
    const range = { from: month + '-01', to: today() };
    const br = F.reportBridge(b, range);
    const alerts = [];
    if (overdue.length) alerts.push(['bad', overdue.length + ' ödeme vadesini geçti: ' + overdue.map((o) => esc(o.partyLabel)).join(', '), 'payables']);
    if (rv.length) alerts.push(['warn', 'İncelemede ' + tl(rv.reduce((s, r) => s + r.remaining, 0)) + ' açıklanmamış fark var (' + esc(rv[0].source) + '). Otomatik gider yazılmadı.', 'review']);
    for (const ins of b.instruments.filter((x) => x.status === 'issued')) {
      const days = H.daysBetween(today(), ins.maturity);
      const accBal = ins.accountId ? F.balance(b, ins.accountId, { asOf: today() }) : null;
      if (days <= 10) alerts.push([accBal !== null && accBal < ins.amount ? 'bad' : 'warn', method(ins.type) + ' ' + esc(ins.no) + ' · ' + tl(ins.amount) + ' · ' + (days >= 0 ? days + ' gün sonra' : 'vadesi geçti') + (accBal !== null ? ' · ' + esc(accLabel(ins.accountId)) + ' bakiyesi ' + tl(accBal) + (accBal < ins.amount ? ' (yetersiz, virman gerekli)' : '') : ''), 'instruments']);
    }
    if (pj.min.balance < 0) alerts.push(['bad', 'Nakit projeksiyonu ' + dateTR(pj.min.date) + ' tarihinde ' + tl(pj.min.balance) + ' gösteriyor.', 'calendar']);
    const exp = b.expected.filter((x) => x.status === 'expected');
    return (
      head('Finans özeti', 'Belge → borç → ödeme → nakit. Bütün rakamlar aynı dengeli fişlerden üretilir.', btn('fin', '＋ Yeni kayıt', { cls: 'primary', data: { v: 'new' } })) +
      '<div class="kpis">' +
      kpi('Kasa + banka (bugün)', tl(cash.reduce((s, a) => s + a.balance, 0)), cash.map((a) => esc(a.label.split(' · ')[0]) + ' ' + tl(a.balance)).join(' · '), 'hl') +
      kpi('Şirket kartı borcu', tl(cards.reduce((s, a) => s + a.balance, 0)), 'Ekstre ödenince bankadan çıkar') +
      kpi('Açık borçlar', tl(open.reduce((s, o) => s + o.remaining, 0)), overdue.length ? '<span class="neg">' + tl(overdue.reduce((s, o) => s + o.remaining, 0)) + ' gecikmiş</span>' : 'Gecikmiş yok', overdue.length ? 'bad' : '') +
      kpi('30 gün sonra tahmini nakit', tl(pj.end), 'En düşük ' + tl(pj.min.balance) + ' · ' + dateTR(pj.min.date), pj.min.balance < 0 ? 'bad' : '') +
      '</div>' +
      (alerts.length ? '<div class="card"><header><h3>Dikkat edilmesi gerekenler</h3></header><div class="list">' + alerts.map(([t, x, l]) => '<div><span>' + tag(t === 'bad' ? 'Acil' : 'Uyarı', t) + ' ' + x + '</span>' + btn('fin', 'Aç →', { cls: 'ghost', data: { v: l } }) + '</div>').join('') + '</div></div>' : '') +
      '<div class="grid2">' +
      card('Nakit projeksiyonu · 30 gün', projectionChart(pj) + '<div class="legend"><span><i style="background:#1d1d1f"></i>Tahmini kasa + banka</span><span><i style="background:#f5c800"></i>Planlanan çıkış</span><span><i style="background:#c7c7cc"></i>Belgesi beklenen</span></div>', { sub: 'Bugünkü kasa+banka − plan tarihindeki ödemeler. Kartla planlananlar ekstre gününe kadar nakit çıkarmaz. POS’ta bekleyen ' + tl(pj.posPending) + ' dahil değildir.' }) +
      card('Önümüzdeki 7 gün', week.length ? '<div class="list">' + week.map((o) => '<div><span><b>' + esc(o.partyLabel) + '</b><small>' + dateTR(o.plan?.date || o.due) + ' · ' + esc(kindLabel(o.kind)) + ' · ' + esc(method(o.plan?.method)) + '</small></span><span class="row"><b class="num">' + tl(o.remaining) + '</b>' + tag(o.status, statusTone(o.status)) + btn('open-pay', 'Öde', { cls: 'small', data: { id: o.id } }) + '</span></div>').join('') + '</div>' : '<div class="empty">Bu hafta ödeme yok.</div>', { actions: btn('fin', 'Tümü →', { cls: 'ghost', data: { v: 'payables' } }) }) +
      '</div>' +
      card(monthTR(month) + ': üç soru, üç ayrı cevap', threeAnswers(br) + bridgeView(br), { sub: 'Firmalara ödenen, kasadan çıkan ve gider (kâr/zarar) aynı rakam değildir; birbirine eklenmez.', actions: btn('fin', 'Raporlar →', { cls: 'ghost', data: { v: 'reports' } }) }) +
      (exp.length ? card('Belgesi beklenen planlar', table(['Vade', 'Firma', 'Açıklama', '#Tahmini', ''], exp.map((x) => '<tr>' + td(dateTR(x.due)) + td(esc(partyLabel(x.partyId))) + td(esc(x.label), 'Muhasebe kaydı yok · fatura gelince kaydedilir') + tdn(tl(x.amount)) + '<td class="num">' + btn('expected-to-doc', 'Faturayı gir', { cls: 'small', data: { id: x.id } }) + '</td></tr>')), { sub: 'Tekrarlayan ödemelerden üretildi. Nakit projeksiyonuna girer, gider ve borç yaratmaz.' }) : '')
    );
  }
  function threeAnswers(br) {
    return '<div class="three" style="padding:14px 16px 0;margin:0">' +
      '<div><small>1 · Kime ne ödendi?</small><strong>' + tl(br.payments) + '</strong><p>Firmalara, personele, vergi dairesine ve bankaya kapatılan borçlar (kart, çek, senet dahil).</p></div>' +
      '<div><small>2 · Kasadan / bankadan çıkan</small><strong>' + tl(br.cashOut) + '</strong><p>Gerçek para çıkışı. Hesaplar arası virman hariç.</p></div>' +
      '<div><small>3 · Gider (kâr/zarar etkisi)</small><strong>' + tl(br.expenses) + '</strong><p>Belgeye göre, ödemeden bağımsız. Stok alımı ve vergi ödemesi gider değildir.</p></div></div>';
  }
  function bridgeView(br) {
    const row = (sign, label, v) => '<div><i>' + sign + '</i><span>' + label + '</span><b class="num">' + tl(v) + '</b></div>';
    return '<div class="bridge"><h4 style="padding:12px 0 4px">Ödemeden nakit çıkışına köprü</h4>' +
      row('', 'Firmalara ödenen toplam', br.payments) +
      row('−', 'Şirket kartıyla ödenen (bankadan çıkmadı, kart borcu oldu)', br.card) +
      row('−', 'Çek / senetle ödenen (vadesinde çıkacak)', br.instruments) +
      row('+', 'Kart ekstresi ödemesi (kart borcu kapandı)', br.statements) +
      row('+', 'Vadesi gelen çek / senet ödemesi', br.redemptions) +
      (br.reversals ? row('±', 'Ters kayıtlar', -br.reversals) : '') +
      row('=', 'Kasadan / bankadan çıkan', br.cashOut) + '</div>';
  }
  function projectionChart(pj) {
    const W = 640, Hh = 190, P = { l: 8, r: 8, t: 14, b: 22 };
    const vals = pj.series.map((s) => s.balance).concat([pj.start, 0]);
    const max = Math.max(...vals), min = Math.min(...vals);
    const span = max - min || 1;
    const n = pj.series.length;
    const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, n - 1);
    const y = (v) => P.t + ((max - v) * (Hh - P.t - P.b)) / span;
    const maxOut = Math.max(1, ...pj.series.map((s) => s.out));
    const bars = pj.series.map((s, i) => {
      if (!s.out) return '';
      const items = pj.items.filter((it) => it.date === s.date);
      const exp = items.every((it) => it.expected);
      const h = Math.max(3, (s.out / maxOut) * 52);
      return '<rect x="' + (x(i) - 4) + '" y="' + (Hh - P.b - h) + '" width="8" height="' + h + '" rx="2" fill="' + (exp ? '#c7c7cc' : '#f5c800') + '"><title>' + dateTR(s.date) + ': ' + tl(s.out) + ' — ' + items.map((it) => it.label).join(', ').replace(/[<>&]/g, '') + '</title></rect>';
    }).join('');
    const path = pj.series.map((s, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(s.balance).toFixed(1)).join('');
    const zero = min < 0 ? '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#b4362a" stroke-dasharray="4 4"/>' : '';
    const ticks = [0, Math.floor(n / 2), n - 1].map((i) => '<text x="' + x(i) + '" y="' + (Hh - 6) + '" font-size="11" fill="#6e6e73" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + dateTR(pj.series[i].date) + '</text>').join('');
    const last = pj.series[n - 1];
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="30 günlük nakit projeksiyonu">' + bars + zero + '<path d="' + path + '" fill="none" stroke="#1d1d1f" stroke-width="2"/>' +
      '<text x="' + P.l + '" y="' + (y(pj.start) - 6) + '" font-size="11" fill="#1d1d1f">' + tl(pj.start) + '</text>' +
      '<text x="' + (W - P.r) + '" y="' + (y(last.balance) - 6) + '" font-size="11" fill="' + (last.balance < 0 ? '#b4362a' : '#1d1d1f') + '" text-anchor="end">' + tl(last.balance) + '</text>' + ticks + '</svg></div>';
  }

  // ───────────────────────── Yeni kayıt (belge) ─────────────────────────
  const DOC_UI = {
    expense: { type: 'expense', title: 'Hizmet / gider faturası', desc: 'Reklam, yazılım, elektrik, kargo, bakım… KDV, tevkifat ve stopaj ayrılır.', parties: ['service', 'supplier', 'landlord'] },
    purchase: { type: 'purchase', title: 'Mal alış faturası', desc: 'Çerçeve, cam, lens alımı. Stoğa girer; gider yazılmaz.', parties: ['supplier'] },
    rent: { type: 'expense', title: 'Kira', desc: 'Şahıs ev sahibinde stopaj kesilir, ev sahibine net ödenir.', parties: ['landlord', 'service'], preset: { categoryId: 'rent', vatRate: '0', stopaj: '20' } },
    smm: { type: 'expense', title: 'Serbest meslek makbuzu', desc: 'Mali müşavir, avukat, danışman: KDV + stopaj.', parties: ['service'], preset: { categoryId: 'accounting', vatRate: '20', stopaj: '20' } },
    payroll: { type: 'payroll', title: 'Bordro', desc: 'Brüt ücret; SGK, gelir ve damga vergisi ayrı borçlara bölünür.' },
    tax: { type: 'tax', title: 'Vergi / SGK tahakkuku', desc: 'Muhtasar, KDV, SGK, geçici vergi… tahakkuk fişinden.' },
    card: { type: 'card-statement', title: 'Kart ekstresi', desc: 'Ekstre tutarı sistemdeki kart harcamalarıyla karşılaştırılır.' },
    loan: { type: 'loan', title: 'Kredi taksiti', desc: 'Anapara borcu azaltır; yalnızca faiz ve BSMV giderdir.', parties: ['bank'] },
    capex: { type: 'capex', title: 'Demirbaş alımı', desc: 'Cihaz, bilgisayar, mobilya. Varlık olur; yatırım çıkışıdır.', parties: ['supplier', 'service'] },
    personal: { type: 'personal', title: 'Şahsi / aile ödemesi', desc: 'Şirketten çıkar, işletme gideri olmaz; ortak carisine yazılır.', parties: ['personal', 'service', 'supplier', 'landlord'] },
    expected: { title: 'Belgesi beklenen plan', desc: 'Fatura gelmeden ödeme planı. Muhasebe kaydı oluşturmaz.', parties: ['supplier', 'service', 'landlord', 'personal'] },
    advance: { title: 'Faturasız avans', desc: 'Fatura gelmeden firmaya ödeme. Fatura gelince mahsup edilir.', parties: ['supplier', 'service', 'landlord'] },
  };
  const WH_OPTIONS = [['0', 'Tevkifat yok'], ['2', '2/10'], ['3', '3/10'], ['4', '4/10'], ['5', '5/10'], ['7', '7/10'], ['9', '9/10'], ['10', '10/10 (tam)'], ['manual', 'Tutarı elle gir']];
  const VAT_OPTIONS = [['0', '%0 / KDV yok'], ['1', '%1'], ['10', '%10'], ['20', '%20'], ['manual', 'Tutarı elle gir']];
  const STOPAJ_OPTIONS = [['0', 'Stopaj yok'], ['15', '%15'], ['17', '%17'], ['20', '%20'], ['manual', 'Tutarı elle gir']];

  function newDocDraft(ui, extra = {}) {
    const d = {
      ui, partyId: '', docNo: '', date: S.books?.today || '2026-11-25', due: '', categoryId: '', net: '', vatRate: '20', vat: '', wh: '0', vatWithheld: '', stopaj: '0', incomeWithheld: '', note: '',
      payMode: 'plan', planMethod: 'transfer', planAccount: '', payMethod: 'transfer', payAccount: 'bank-garanti', payDate: S.books?.today || '2026-11-25', payRef: '', insNo: '', insMaturity: '',
      period: '', gross: '', employeeSgk: '', employerSgk: '', incomeTax: '', stampTax: '',
      taxType: 'MUHTASAR', amount: '', penalty: '', outputVat: '', inputVat: '', carriedVat: '',
      principal: '', interest: '', bsmv: '', cardId: 'card-garanti', total: '', minimum: '', explainAmount: '', explainCategory: 'interest',
      beneficiary: '', purpose: '', label: '', expectedId: '',
      branchId: ['tax', 'loan', 'card'].includes(ui) ? (S.books.branches.find((x) => x.kind === 'hq') || {}).id || F.defaultBranch(S.books) : F.defaultBranch(S.books),
      lines: [], receiptId: '', schedMode: 'single', schedCount: '3', schedFirst: '', schedEvery: '1', attachments: [],
      ...(DOC_UI[ui]?.preset || {}),
      ...extra,
    };
    if (ui === 'payroll' || ui === 'tax') d.period = d.period || F.addDays(d.date.slice(0, 7) + '-01', -1).slice(0, 7);
    if (ui === 'card') d.payMethod = 'transfer';
    return d;
  }
  function readForm(form) {
    const o = {};
    for (const [k, v] of new FormData(form)) o[k] = String(v);
    return o;
  }
  /** Oran seçimlerinden KDV / tevkifat / stopaj tutarlarını türetir. */
  function collectLines(d) {
    const rows = {};
    for (const k of Object.keys(d)) {
      const m = /^ln_(sku|label|qty|cost)_(\d+)$/.exec(k);
      if (!m) continue;
      (rows[m[2]] ||= {})[m[1]] = d[k];
      delete d[k];
    }
    if (Object.keys(rows).length) d.lines = Object.keys(rows).sort((a, c) => a - c).map((i) => ({ sku: rows[i].sku || '', label: rows[i].label || '', qty: rows[i].qty || '', cost: rows[i].cost || '' }));
    if (d.lines?.length && !d.receiptId) {
      let t = 0;
      for (const l of d.lines) t += (parseInt(l.qty, 10) || 0) * parseSafe(l.cost);
      d.net = formatInput(t);
    }
    return d;
  }
  function addMonths(date, n) {
    const [y, m, dd] = date.split('-').map(Number);
    const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + n, Math.min(dd, last))).toISOString().slice(0, 10);
  }
  function derive(d) {
    collectLines(d);
    let net = 0;
    try { net = parseTL(d.net, { allowEmpty: true }); } catch { net = 0; }
    if (d.vatRate !== 'manual') d.vat = formatInput(F.pct(net, Number(d.vatRate)));
    let vat = 0;
    try { vat = parseTL(d.vat, { allowEmpty: true }); } catch { vat = 0; }
    if (d.wh !== 'manual') d.vatWithheld = formatInput(F.fraction(vat, Number(d.wh), 10));
    if (d.stopaj !== 'manual') d.incomeWithheld = formatInput(F.pct(net, Number(d.stopaj)));
    return d;
  }
  /** Taslağı motorun beklediği girdiye çevirir. */
  function docInput(d) {
    const u = DOC_UI[d.ui];
    const p = (v, field, opt = {}) => parseTL(v, { field, ...opt });
    const base = { type: u.type, partyId: d.partyId, branchId: d.branchId, attachments: d.attachments, docNo: d.docNo, date: d.date, due: d.due || d.date, note: d.note, period: d.period || undefined, plannedMethod: d.payMode === 'plan' ? d.planMethod : undefined, plannedAccount: d.payMode === 'plan' ? d.planAccount : undefined, expectedId: d.expectedId || undefined };
    if (!d.partyId && u.parties && u.type !== 'card-statement') throw Error('Firma / kişi seçin.');
    switch (u.type) {
      case 'purchase':
      case 'capex': {
        const lines = u.type === 'purchase' && !d.receiptId ? (d.lines || []).filter((l) => l.sku || l.qty || l.cost).map((l, i) => {
          const qty = parseInt(l.qty, 10);
          if (!l.sku) throw Error((i + 1) + '. stok satırında SKU girin.');
          if (!qty || qty < 1) throw Error(l.sku + ': adet girin.');
          return { sku: l.sku.trim(), label: l.label, qty, unitCost: p(l.cost, l.sku + ' birim maliyet') };
        }) : [];
        return withSchedule(d, { ...base, net: p(d.net, 'Matrah'), vat: p(d.vat, 'KDV', { allowEmpty: true }), lines, receiptId: d.receiptId || undefined });
      }
      case 'expense':
        if (!d.categoryId) throw Error('Gider kategorisi seçin.');
        return withSchedule(d, { ...base, categoryId: d.categoryId, net: p(d.net, 'Matrah'), vat: p(d.vat, 'KDV', { allowEmpty: true }), vatWithheld: p(d.vatWithheld, 'Tevkifat', { allowEmpty: true }), incomeWithheld: p(d.incomeWithheld, 'Stopaj', { allowEmpty: true }) });
      case 'payroll':
        return { ...base, gross: p(d.gross, 'Brüt ücret'), employeeSgk: p(d.employeeSgk, 'İşçi SGK', { allowEmpty: true }), employerSgk: p(d.employerSgk, 'İşveren SGK', { allowEmpty: true }), incomeTax: p(d.incomeTax, 'Gelir vergisi', { allowEmpty: true }), stampTax: p(d.stampTax, 'Damga vergisi', { allowEmpty: true }) };
      case 'tax':
        return { ...base, taxType: d.taxType, amount: p(d.amount, 'Tahakkuk tutarı', { allowEmpty: d.taxType === 'KDV1' }), penalty: p(d.penalty, 'Gecikme zammı', { allowEmpty: true }), outputVat: p(d.outputVat, 'Hesaplanan KDV', { allowEmpty: true }), inputVat: p(d.inputVat, 'İndirilecek KDV', { allowEmpty: true }), carriedVat: p(d.carriedVat, 'Devreden KDV', { allowEmpty: true }) };
      case 'loan':
        return { ...base, principal: p(d.principal, 'Anapara', { allowEmpty: true }), interest: p(d.interest, 'Faiz', { allowEmpty: true }), bsmv: p(d.bsmv, 'BSMV', { allowEmpty: true }) };
      case 'card-statement':
        return { ...base, cardId: d.cardId, total: p(d.total, 'Ekstre tutarı'), minimum: p(d.minimum, 'Asgari ödeme', { allowEmpty: true }), explained: d.explainAmount ? [{ amount: p(d.explainAmount, 'Açıklanan fark'), categoryId: d.explainCategory }] : [] };
      case 'personal':
        return { ...base, amount: p(d.amount, 'Tutar'), beneficiary: d.beneficiary, purpose: d.purpose };
    }
    throw Error('Belge türü seçin.');
  }
  /** Eşit taksit: ödenecek tutar motorun hesabından alınır, kalan kuruş son taksite eklenir. */
  function withSchedule(d, input) {
    if (d.schedMode !== 'equal') return input;
    const n = parseInt(d.schedCount, 10);
    if (!n || n < 2 || n > 36) throw Error('Taksit sayısı 2–36 olmalı.');
    const main = F.planDocument(S.books, input).obligations.find((o) => o.kind === 'party');
    if (!main) return input;
    const first = d.schedFirst || d.due || d.date;
    const every = Math.max(1, parseInt(d.schedEvery, 10) || 1);
    const each = Math.floor(main.amount / n);
    return { ...input, schedule: Array.from({ length: n }, (_, i) => ({ due: addMonths(first, i * every), amount: i === n - 1 ? main.amount - each * (n - 1) : each })) };
  }
  function payInputFromDraft(d) {
    const isIns = d.payMethod === 'cheque' || d.payMethod === 'note';
    return { date: d.payDate, method: d.payMethod, accountId: d.payMethod === 'note' ? '' : d.payAccount, ref: d.payRef, instrument: isIns ? { no: d.insNo, maturity: d.insMaturity } : undefined, attachments: d.attachments };
  }

  function newRecord() {
    const d = S.doc;
    const u = DOC_UI[d.ui];
    const types = '<div class="types">' + Object.entries(DOC_UI).map(([k, x]) => '<button type="button" data-act="doc-type" data-v="' + k + '" aria-pressed="' + (k === d.ui) + '"><b>' + x.title + '</b><span>' + x.desc + '</span></button>').join('') + '</div>';
    return head('Yeni kayıt', 'Önce belgeyi girin: borç ve gider belgeden doğar. Ödeme aynı ekranda “şimdi ödendi” ya da vadesinde ödenecek olarak işaretlenir.') + types +
      '<div class="grid2"><form data-form="doc" data-live="doc" autocomplete="off">' + card(u.title, docFields(d) + '<div id="doc-error" class="error" role="alert"></div>' + docSavebar(d), { sub: u.desc }) + '</form>' +
      '<div class="sticky">' + card('Muhasebe etkisi', '<div id="doc-preview"></div>', { sub: 'Kaydetmeden önce: neyi değiştirir, neyi değiştirmez?' }) + '</div></div>';
  }
  function partyPicker(d, types, label = 'Firma / kişi *') {
    const opts = [['', 'Seçiniz…'], ...partiesOf(types).map((p) => [p.id, p.label + ' · ' + F.PARTY_TYPES[p.type]])];
    return '<div class="wide">' + field(label, '<div class="row" style="flex-wrap:nowrap">' + select('partyId', opts, d.partyId, 'data-rerender') + btn('quick-party', S.quickParty ? 'Vazgeç' : '＋ Yeni', { cls: 'small' }) + '</div>') +
      (S.quickParty ? '<div class="form" style="margin-top:8px;padding:10px;background:var(--bg);border-radius:10px">' + field('Yeni firma / kişi adı', input('qpLabel', '', 'maxlength="100"')) + field('Türü', select('qpType', Object.entries(F.PARTY_TYPES).filter(([k]) => (types || []).includes(k) || !types).filter(([k]) => !['public', 'staff'].includes(k)), (types || ['supplier'])[0])) + '<div class="wide row">' + btn('quick-party-save', 'Listeye ekle ve seç', { cls: 'small primary' }) + '<span class="small muted">Tanımlar ekranından sonra düzenlenebilir.</span></div></div>' : '') + '</div>';
  }
  function docFields(d) {
    const u = DOC_UI[d.ui];
    const t = u.type;
    const dates = field('Belge tarihi *', input('date', d.date, 'type="date" max="' + today() + '"')) + field('Son ödeme / vade', input('due', d.due, 'type="date"'), { hint: 'Boşsa belge tarihi' });
    let f = '';
    if (d.ui === 'expected') {
      return '<div class="pad form">' + partyPicker(d, u.parties) + field('Açıklama *', input('label', d.label, 'maxlength="80" placeholder="Örn. Aralık cam siparişi"')) + field('Tahmini tutar *', money('amount', d.amount)) + field('Vade *', input('due', d.due || today(), 'type="date"')) + field('Gider kategorisi', select('categoryId', [['', '— (stok / diğer)'], ...S.books.categories.filter((c) => c.active).map((c) => [c.id, c.label])], d.categoryId)) + '</div><p class="note">Plan; fatura değildir. Borç, gider ve nakit hareketi oluşturmaz. Takvime ve nakit projeksiyonuna girer. Fatura gelince “Faturayı gir” ile gerçek kayda dönüşür.</p>';
    }
    if (d.ui === 'advance') {
      return '<div class="pad form">' + partyPicker(d, u.parties) + field('Avans tutarı *', money('amount', d.amount)) + '</div>' + paymentFields(d, ['transfer', 'cash', 'card'], true);
    }
    if (['purchase', 'capex', 'expense'].includes(t)) {
      f += partyPicker(d, u.parties) + field('Belge / fatura no', input('docNo', d.docNo, 'maxlength="60"')) + (t === 'expense' ? field('Gider kategorisi *', select('categoryId', [['', 'Seçiniz…'], ...S.books.categories.filter((c) => c.active && !c.system || ['personnel', 'taxes'].includes(c.id) && c.active).map((c) => [c.id, c.label])], d.categoryId)) : '<div></div>') + dates +
        field(t === 'expense' && d.ui === 'rent' ? 'Brüt kira (matrah) *' : 'Matrah (KDV hariç) *', money('net', d.net)) +
        field('KDV', '<div class="pair">' + select('vatRate', VAT_OPTIONS, d.vatRate, 'data-rerender') + money('vat', d.vat, d.vatRate !== 'manual' ? 'readonly tabindex="-1"' : '') + '</div>');
      if (t === 'expense') {
        f += field('KDV tevkifatı', '<div class="pair">' + select('wh', WH_OPTIONS, d.wh, 'data-rerender') + money('vatWithheld', d.vatWithheld, d.wh !== 'manual' ? 'readonly tabindex="-1"' : '') + '</div>', { hint: 'Faturadaki tevkifat oranı; satıcıya değil vergi dairesine ödenir' }) +
          field('Gelir vergisi stopajı', '<div class="pair">' + select('stopaj', STOPAJ_OPTIONS, d.stopaj, 'data-rerender') + money('incomeWithheld', d.incomeWithheld, d.stopaj !== 'manual' ? 'readonly tabindex="-1"' : '') + '</div>', { hint: 'Kira, serbest meslek: muhtasarla ödenir' });
      }
    } else if (t === 'payroll') {
      f += field('Bordro dönemi *', input('period', d.period, 'type="month"')) + dates + field('Brüt ücretler toplamı *', money('gross', d.gross)) + field('İşveren SGK payı', money('employerSgk', d.employerSgk)) + field('İşçi SGK kesintisi', money('employeeSgk', d.employeeSgk)) + field('Gelir vergisi kesintisi', money('incomeTax', d.incomeTax)) + field('Damga vergisi kesintisi', money('stampTax', d.stampTax)) + '<div></div>';
    } else if (t === 'tax') {
      const b = S.books;
      const bals = { MUHTASAR: F.balance(b, 'INCOME_WH'), KDV2: F.balance(b, 'VAT_WH'), SGK: F.balance(b, 'SGK', { party: 'sgk' }) };
      f += field('Vergi / SGK türü *', select('taxType', Object.entries(F.TAX_TYPES), d.taxType, 'data-rerender')) + field('Dönem *', input('period', d.period, 'type="month"')) + field('Tahakkuk tarihi *', input('date', d.date, 'type="date" max="' + today() + '"')) + field('Son ödeme günü *', input('due', d.due, 'type="date"'), { hint: 'Tahakkuk fişindeki tarih' });
      if (d.taxType === 'KDV1') {
        f += field('Hesaplanan KDV (satışlar)', money('outputVat', d.outputVat), { hint: 'Sistemde: ' + tl(F.balance(b, 'OUTPUT_VAT')) }) + field('İndirilecek KDV (alışlar)', money('inputVat', d.inputVat), { hint: 'Sistemde: ' + tl(F.balance(b, 'INPUT_VAT')) + ' · muhasebeci onayı' }) + field('Devreden KDV kullanımı', money('carriedVat', d.carriedVat), { hint: 'Sistemde: ' + tl(F.balance(b, 'CARRY_VAT')) }) + field('Ödenecek KDV', money('amount', d.amount), { hint: 'Boş bırakılırsa hesaplanır; beyannameyle aynı olmalı' }) + '<div class="wide">' + btn('fill-vat', 'Sistem bakiyelerini doldur', { cls: 'small' }) + '</div>';
      } else {
        f += field('Tahakkuk tutarı *', money('amount', d.amount), { hint: bals[d.taxType] !== undefined ? 'Sistemde kayıtlı kesinti: ' + tl(bals[d.taxType]) : 'Gider / peşin vergi olarak kaydedilir' }) + field('Gecikme zammı / ceza', money('penalty', d.penalty), { hint: 'Ayrı gider (KKEG) ve ayrı ödeme kalemi' });
      }
    } else if (t === 'loan') {
      f += partyPicker(d, u.parties, 'Kredi veren banka *') + field('Taksit no / açıklama', input('docNo', d.docNo, 'maxlength="60" placeholder="Taksit 8/24"')) + '<div></div>' + dates + field('Anapara', money('principal', d.principal), { hint: d.partyId ? 'Kalan kredi: ' + tl(F.balance(S.books, 'LOAN', { party: d.partyId })) : '' }) + field('Faiz', money('interest', d.interest)) + field('BSMV / KKDF', money('bsmv', d.bsmv)) + '<div></div>';
    } else if (t === 'card-statement') {
      f += field('Şirket kartı *', select('cardId', activeAccounts(['card']).map((a) => [a.id, a.label]), d.cardId, 'data-rerender')) + field('Ekstre / dönem', input('docNo', d.docNo, 'maxlength="60" placeholder="Aralık ekstresi"')) + field('Hesap kesim tarihi *', input('date', d.date, 'type="date" max="' + today() + '"')) + field('Son ödeme tarihi *', input('due', d.due, 'type="date"')) + field('Ekstre borcu *', money('total', d.total)) + field('Asgari ödeme', money('minimum', d.minimum), { hint: 'Bilgi amaçlı' }) +
        '<fieldset class="wide"><legend>Farkın nedeni ekstrede yazıyorsa (opsiyonel)</legend><div class="form">' + field('Açıklanan tutar', money('explainAmount', d.explainAmount)) + field('Ne?', select('explainCategory', [['interest', 'Kart faizi / gecikme faizi'], ['bank-fee', 'Kart aidatı / banka masrafı']], d.explainCategory)) + '</div><p class="small muted" style="margin-top:8px">Bilinmeyen fark otomatik gider yazılmaz; ödeme yapıldığında incelemeye düşer.</p></fieldset>';
    } else if (t === 'personal') {
      f += partyPicker(d, u.parties, 'Ödeme alıcısı (firma / kişi) *') + field('Kimin için? *', input('beneficiary', d.beneficiary, 'maxlength="80" placeholder="Şirket sahibi / eşi / çocuğu"')) + field('Ne için? *', select('purpose', ['', 'Şahsi sağlık sigortası', 'Aile sağlık gideri', 'Eğitim', 'Konut / şahsi fatura', 'Şahsi kredi kartı', 'Diğer şahsi ödeme'].map((x) => [x, x || 'Seçiniz…']), d.purpose)) + dates + field('Tutar *', money('amount', d.amount));
    }
    if (t === 'purchase') f += linesEditor(d);
    if (['purchase', 'capex', 'expense'].includes(t)) f += scheduleFields(d);
    f += field('Şube / masraf merkezi', select('branchId', branchOptions(), d.branchId), { hint: 'Kâr/zarar şube bazında izlenir. E-ticaret giderleri (sosyal medya, ajans) E-ticaret’e; ortak giderler Merkez’e.' });
    f += field('Açıklama', '<textarea name="note" maxlength="400">' + esc(d.note) + '</textarea>', { wide: true });
    f += '<div class="wide">' + attachList('doc', d.attachments) + '</div>';
    return '<div class="pad form">' + f + '</div>' + paymentFields(d, null, false);
  }
  /** Belge formunun alt bölümü: vadesinde mi ödenecek, şimdi mi ödendi? */
  function linesEditor(d) {
    const b = S.books;
    const skus = [...new Set([...b.stock.items.map((x) => x.sku), ...S.stock.items.map((x) => x.sku)])];
    const recs = b.receipts.filter((r) => !r.invoiced && (!d.partyId || !r.partyId || r.partyId === d.partyId));
    const ls = d.lines || [];
    let t = 0;
    ls.forEach((l) => (t += (parseInt(l.qty, 10) || 0) * parseSafe(l.cost)));
    return '<fieldset class="wide"><legend>Stok satırları — stoğa ne girdi?</legend>' +
      (recs.length ? field('Mal kabulü daha önce yapıldıysa', select('receiptId', [['', '— Bu faturayla stoğa girecek'], ...recs.map((r) => [r.id, r.id + ' · ' + dateTR(r.date) + ' · ' + tl(r.value) + (r.ref ? ' · ' + r.ref : '')])], d.receiptId, 'data-rerender')) : '') +
      (d.receiptId ? '<p class="small muted">Stok mal kabulde girdi. Fatura “faturası gelmemiş mal” borcunu kapatır; tutar farkı stok maliyetine yansır.</p>' :
        '<datalist id="sku-list-doc">' + skus.map((x) => '<option value="' + esc(x) + '">' + esc(b.stock.items.find((i) => i.sku === x)?.label || '') + '</option>').join('') + '</datalist>' +
        (ls.length ? '<div class="tbl"><table><thead><tr><th>SKU</th><th>Ürün</th><th class="num">Adet</th><th class="num">Birim maliyet (KDV hariç)</th><th class="num">Tutar</th><th></th></tr></thead><tbody>' + ls.map((l, i) => '<tr><td><input name="ln_sku_' + i + '" value="' + esc(l.sku) + '" list="sku-list-doc" style="width:110px"></td><td><input name="ln_label_' + i + '" value="' + esc(l.label) + '" style="min-width:140px"></td><td><input name="ln_qty_' + i + '" value="' + esc(l.qty) + '" inputmode="numeric" style="width:70px;text-align:right"></td><td><input name="ln_cost_' + i + '" value="' + esc(l.cost) + '" inputmode="decimal" style="width:120px;text-align:right"></td>' + tdn(tl((parseInt(l.qty, 10) || 0) * parseSafe(l.cost))) + '<td>' + btn('line-del', '✕', { cls: 'ghost', data: { i } }) + '</td></tr>').join('') + '</tbody><tfoot><tr><td colspan="4">Toplam = matrah</td>' + tdn(tl(t)) + '<td></td></tr></tfoot></table></div>' : '<p class="small muted">Satır eklenmezse alış stoğa SKU’suz girer; satılan malın maliyeti hesaplanamaz ve kapanış kontrolü uyarır.</p>') +
        btn('line-add', '＋ Stok satırı', { cls: 'small' })) + '</fieldset>';
  }
  function scheduleFields(d) {
    return '<fieldset class="wide"><legend>Vade planı</legend><div class="seg">' + btn('sched-mode', 'Tek vade', { data: { v: 'single' }, pressed: d.schedMode !== 'equal' }) + btn('sched-mode', 'Eşit taksitler', { data: { v: 'equal' }, pressed: d.schedMode === 'equal' }) + '</div>' +
      (d.schedMode === 'equal' ? '<div class="form three" style="margin-top:10px">' + field('Taksit sayısı', input('schedCount', d.schedCount, 'type="number" min="2" max="36"')) + field('İlk vade', input('schedFirst', d.schedFirst || d.due || d.date, 'type="date"')) + field('Kaç ayda bir', input('schedEvery', d.schedEvery, 'type="number" min="1" max="12"')) + '</div><p class="small muted">Her taksit ödemeler ve takvimde ayrı kalem olur; her biri ayrı ödenir (çek / senet de verilebilir).</p>' : '') + '</fieldset>';
  }
  function paymentFields(d, only, forceNow) {
    const u = DOC_UI[d.ui];
    const kind = { 'card-statement': 'card-statement', payroll: 'staff', tax: 'tax', loan: 'loan' }[u.type] || 'party';
    const methods = only || F.allowedMethods({ kind });
    const now = forceNow || d.payMode === 'now';
    const m = methods.includes(now ? d.payMethod : d.planMethod) ? (now ? d.payMethod : d.planMethod) : methods[0];
    const accs = activeAccounts(F.methodKinds(m));
    const accField = (name, value, label) => (m === 'note' ? '<div></div>' : field(label, select(name, [['', m === 'card' ? 'Kart seçin…' : 'Hesap seçin…'], ...accs.map((a) => [a.id, a.label])], accs.some((a) => a.id === value) ? value : accs[0]?.id || '')));
    let html = '<div class="pad" style="border-top:1px solid var(--line)"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h4>Ödeme</h4>' + (forceNow ? '' : '<div class="seg">' + btn('pay-mode', 'Vadesinde ödenecek', { data: { v: 'plan' }, pressed: !now }) + btn('pay-mode', 'Şimdi ödendi', { data: { v: 'now' }, pressed: now }) + '</div>') + '</div><div class="form">';
    if (!now) {
      html += field('Planlanan ödeme şekli', select('planMethod', methods.map((x) => [x, method(x)]), m, 'data-rerender')) + accField('planAccount', d.planAccount, m === 'card' ? 'Kullanılacak kart' : 'Planlanan hesap') + '</div><p class="small muted" style="margin-top:10px">Kayıt borcu açar; para çıkmaz. Vadesinde “Ödemeler” ekranından onaylanır. Takvim ve nakit projeksiyonuna girer.</p></div>';
    } else {
      html += field('Ödeme şekli *', select('payMethod', methods.map((x) => [x, method(x)]), m, 'data-rerender')) + accField('payAccount', d.payAccount, m === 'card' ? 'Kullanılan şirket kartı *' : m === 'cheque' ? 'Çekin keşide edildiği banka *' : 'Paranın çıktığı hesap *') +
        field(m === 'cheque' || m === 'note' ? 'Veriliş tarihi *' : 'Gerçek ödeme tarihi *', input('payDate', d.payDate, 'type="date" max="' + today() + '"')) +
        (m === 'cheque' || m === 'note' ? field(method(m) + ' no *', input('insNo', d.insNo, 'maxlength="40"')) + field('Vade tarihi *', input('insMaturity', d.insMaturity, 'type="date"')) : field('Dekont / işlem no', input('payRef', d.payRef, 'maxlength="60"'))) +
        '</div><p class="small muted" style="margin-top:10px">' + ({ card: 'Firma borcu kapanır, şirket kartı borcu artar. Bankadan para ekstre ödenince çıkar.', cheque: 'Firma borcu kapanır, çek borcu oluşur. Bankadan para çekin vadesinde bir kez çıkar.', note: 'Firma borcu kapanır, senet borcu oluşur. Para vadesinde bir kez çıkar.' }[m] || 'Seçilen hesaptan para çıkışı bu tarihte kaydedilir.') + '</p></div>';
    }
    return html;
  }
  function docSavebar(d) {
    const now = d.payMode === 'now' || d.ui === 'advance';
    const label = d.ui === 'expected' ? 'Planı kaydet' : d.ui === 'advance' ? 'Avansı öde' : now ? 'Belgeyi ve ödemeyi kaydet' : 'Belgeyi kaydet';
    return '<div class="savebar"><span>' + (d.expectedId ? 'Belgesi beklenen plandan geliyor; kaydedince plan kapanır.' : 'Tüm satırlar dengeli fiş olarak kaydedilir. Hata olursa hiçbir şey kaydedilmez.') + '</span>' + btn('doc-clear', 'Temizle', { cls: 'small' }) + '<button type="submit" class="primary">' + label + '</button></div>';
  }
  function refreshDocPreview() {
    const box = main.querySelector('#doc-preview');
    if (!box) return;
    const d = S.doc;
    if (d.ui === 'expected') {
      box.innerHTML = '<div class="fx">' + fx('Gider', 0) + fx('Borç', 0) + fx('Nakit', 0) + fx('Projeksiyon', parseSafe(d.amount), true) + '</div><p class="note">Plan yalnızca takvim ve nakit tahmini içindir.</p>';
      return;
    }
    if (d.ui === 'advance') {
      const a = parseSafe(d.amount);
      box.innerHTML = '<div class="fx">' + fx('Gider', 0) + fx(d.payMethod === 'card' ? 'Kart borcu' : 'Nakit çıkışı', a, true) + fx('Firmadan alacak (avans)', a) + fx('Fatura', 0) + '</div><p class="note">Avans firma carisinde borç bakiyesini eksiye (alacağa) çevirir. Fatura gelince <b>Cariler</b> ekranından mahsup edilir; ikinci nakit çıkışı olmaz.</p>';
      return;
    }
    try {
      const plan = F.planDocument(S.books, docInput(d));
      const e = plan.effects;
      const now = d.payMode === 'now';
      const payable = plan.obligations.reduce((s, o) => s + o.amount, 0);
      const cashNow = now && !['card', 'cheque', 'note'].includes(d.payMethod) ? payable : 0;
      const doc = plan.doc;
      let extra = '';
      if (doc.type === 'card-statement') extra = '<div class="callout ' + (doc.difference ? 'warn' : '') + '" style="margin:0 16px 12px">Sistemde bu karta kayıtlı harcama: <b>' + tl(doc.known) + '</b> · Ekstre: <b>' + tl(doc.total) + '</b>' + (doc.difference > 0 ? '<br>' + tl(doc.difference) + ' fark ödeme yapılınca <b>incelemeye</b> düşer; faiz / masraf / önceki borç olarak siz sınıflarsınız.' : doc.difference < 0 ? '<br>Ekstre sistemden ' + tl(-doc.difference) + ' az: bazı harcamalar sonraki ekstreye kalmış olabilir.' : '<br>Fark yok.') + '</div>';
      if (doc.type === 'tax' && doc.difference > 0) extra = '<div class="callout warn" style="margin:0 16px 12px">Tahakkuk, sistemdeki kesintiden ' + tl(doc.difference) + ' fazla. Fark gider yazılmaz, incelemeye alınır.</div>';
      if (doc.type === 'payroll') extra = '<div class="callout" style="margin:0 16px 12px">Net ödenecek maaş: <b>' + tl(doc.net) + '</b>. SGK ve muhtasar tutarları tahakkuk girilince ödemeye açılır.</div>';
      box.innerHTML = '<div class="fx">' +
        fx('Gider (kâr/zarar)', e.expense, e.expense > 0) + fx(doc.type === 'capex' ? 'Demirbaş (varlık)' : doc.type === 'purchase' ? 'Stok (varlık)' : 'Varlık', e.asset) +
        fx('KDV / vergi kalemleri', e.tax) + fx('Ödenecek borç', payable, payable > 0) +
        fx(now ? (d.payMethod === 'card' ? 'Kart borcu' : ['cheque', 'note'].includes(d.payMethod) ? 'Çek / senet borcu' : 'Nakit çıkışı (şimdi)') : 'Nakit çıkışı', now ? payable : cashNow, now) + fx(e.owner ? 'Ortak carisi (şahsi)' : 'İncelemeye', e.owner || e.review) +
        '</div>' + extra + journalTable(plan.entry) + (plan.obligations.length ? '<div class="note"><b>Açılacak ödeme kalemleri:</b><br>' + plan.obligations.map((o) => esc(o.label) + ' — ' + tl(o.amount) + ' · vade ' + dateTR(o.due)).join('<br>') + '</div>' : '');
    } catch (err) {
      box.innerHTML = '<div class="empty">' + esc(friendly(err.message)) + '</div>';
    }
  }
  const parseSafe = (v) => { try { return parseTL(v, { allowEmpty: true }); } catch { return 0; } };
  const fx = (label, v, hot) => '<div class="' + (v ? (hot ? 'hot' : '') : 'zero') + '"><small>' + label + '</small><b>' + tl(v) + '</b></div>';
  function journalTable(entry) {
    if (!entry) return '<p class="note">Bu belge muhasebe fişi üretmez; yalnızca ödeme kalemi açar.</p>';
    return '<div class="tbl"><table class="journal"><thead><tr><th class="code">Kod</th><th>Hesap</th><th class="num">Borç</th><th class="num">Alacak</th></tr></thead><tbody>' + entry.lines.map((l) => {
      const info = F.accountInfo(S.books, l.account);
      return '<tr><td class="code">' + esc(info.code) + '</td><td>' + esc(info.label) + (l.party ? '<small>' + esc(partyLabel(l.party)) + '</small>' : '') + '</td>' + tdn(l.debit ? tl(l.debit) : '') + tdn(l.credit ? tl(l.credit) : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }
  function submitDoc(form) {
    S.doc = derive({ ...S.doc, ...readForm(form) });
    const d = S.doc;
    if (d.ui === 'expected') {
      return mutate((b) => F.addExpected(b, { key: 'ui-exp-' + uid(), partyId: d.partyId, label: d.label, amount: parseTL(d.amount), due: d.due || today(), categoryId: d.categoryId }), 'Plan kaydedildi. Muhasebe kaydı oluşmadı; takvimde ve nakit projeksiyonunda görünür.', '#doc-error') && resetDoc();
    }
    if (d.ui === 'advance') {
      return mutate((b) => F.recordPayment(b, { key: 'ui-adv-' + uid(), ...payInputFromDraft(d), advance: { partyId: d.partyId, amount: parseTL(d.amount) } }), 'Avans ödendi. Fatura gelince Cariler ekranından mahsup edin.', '#doc-error') && resetDoc();
    }
    const ok = mutate((b) => {
      const id = F.recordDocument(b, { key: 'ui-doc-' + uid(), ...docInput(d) });
      if (d.payMode === 'now') {
        for (const o of b.obligations.filter((x) => x.docId === id && F.remaining(x) > 0)) {
          F.recordPayment(b, { key: 'ui-pay-' + uid(), ...payInputFromDraft(d), allocations: [{ obligationId: o.id, amount: F.remaining(o) }] });
        }
      }
      return id;
    }, (id) => id + ' kaydedildi.' + (d.payMode === 'now' ? ' Ödeme de işlendi.' : ' Ödeme kalemi açıldı; vadesinde Ödemeler ekranından onaylayın.'), '#doc-error');
    if (ok) resetDoc();
  }
  function resetDoc() {
    S.doc = newDocDraft(S.doc.ui);
    S.quickParty = false;
    render();
  }

  // ───────────────────────── Ödemeler (açık kalemler) ─────────────────────────
  function payables() {
    const b = S.books;
    let rows = F.openItems(b, { includePaid: S.payFilter === 'paid' || S.payFilter === 'all' });
    if (S.payFilter === 'overdue') rows = rows.filter((o) => o.due < today());
    if (S.payFilter === 'week') rows = rows.filter((o) => (o.plan?.date || o.due) <= F.addDays(today(), 7));
    if (S.payFilter === 'paid') rows = rows.filter((o) => o.remaining <= 0);
    if (S.payKind !== 'all') rows = rows.filter((o) => o.kind === S.payKind);
    if (S.paySearch) rows = rows.filter((o) => (o.label + ' ' + o.partyLabel).toLocaleLowerCase('tr-TR').includes(S.paySearch.toLocaleLowerCase('tr-TR')));
    const open = F.openItems(b);
    const sumBy = (f) => open.filter(f).reduce((s, o) => s + o.remaining, 0);
    return head('Ödemeler', 'Açık borçlar vade sırasıyla. “Öde” ile gerçek tarih, tutar ve hesabı onaylayın; kısmi ödeme desteklenir.', btn('doc-new', '＋ Belge gir', { cls: 'primary', data: { v: 'expense' } }) + btn('doc-new', 'Faturasız avans', { data: { v: 'advance' } })) +
      '<div class="kpis">' + kpi('Gecikmiş', tl(sumBy((o) => o.due < today())), open.filter((o) => o.due < today()).length + ' kalem', sumBy((o) => o.due < today()) ? 'bad' : '') + kpi('Bu hafta', tl(sumBy((o) => o.due >= today() && (o.plan?.date || o.due) <= F.addDays(today(), 7))), 'Bugün dahil 7 gün') + kpi('Tüm açık borç', tl(sumBy(() => true)), open.length + ' kalem') + kpi('Çek / senet vadeleri', tl(sumBy((o) => o.kind === 'instrument')), 'Vadesinde bankadan çıkacak') + '</div>' +
      (S.pay ? payDrawer() : '') + (S.plan ? planDrawer() : '') +
      '<div class="row" style="justify-content:space-between;align-items:flex-start">' + chips('pay-filter', [['open', 'Açık'], ['overdue', 'Gecikmiş'], ['week', 'Bu hafta'], ['paid', 'Ödenenler'], ['all', 'Tümü']], S.payFilter) +
      '<div class="row" style="margin-bottom:14px"><select data-act-change="pay-kind" aria-label="Tür" style="width:auto">' + [['all', 'Tüm türler'], ['party', 'Firma borçları'], ['tax', 'Vergi / SGK'], ['staff', 'Maaş'], ['card-statement', 'Kart ekstresi'], ['instrument', 'Çek / senet'], ['loan', 'Kredi']].map(([v, t]) => '<option value="' + v + '"' + (v === S.payKind ? ' selected' : '') + '>' + t + '</option>').join('') + '</select><input type="search" data-act-input="pay-search" placeholder="Firma ara…" value="' + esc(S.paySearch) + '" style="width:180px"></div></div>' +
      card('Ödeme listesi', payTable(rows));
  }
  function payTable(rows) {
    return table(['Plan / vade', 'Kime', 'Ne için', 'Tür', 'Plan', '#Tutar', '#Kalan', 'Durum', ''], rows.map((o) => '<tr>' +
      td(dateTR(o.plan?.date || o.due), o.plan?.date && o.plan.date !== o.due ? 'Vade ' + dateTR(o.due) : '') +
      td('<b>' + esc(o.partyLabel) + '</b>') + td(esc(o.label), o.docId ? esc(o.docId) : '') + td(esc(kindLabel(o.kind))) +
      td(esc(method(o.plan?.method)), o.plan?.accountId ? esc(accLabel(o.plan.accountId)) : '') +
      tdn(tl(o.amount)) + tdn('<b>' + tl(o.remaining) + '</b>') + td(tag(o.status, statusTone(o.status))) +
      '<td class="num">' + (o.remaining > 0 ? btn('open-pay', 'Öde', { cls: 'small primary', data: { id: o.id } }) + ' ' + btn('open-plan', 'Planla', { cls: 'small', data: { id: o.id } }) : btn('show-settle', 'Geçmiş', { cls: 'small', data: { id: o.id } })) + '</td></tr>'), { empty: 'Bu filtrede ödeme yok.' });
  }
  function openPay(id) {
    const o = S.books.obligations.find((x) => x.id === id);
    const methods = F.allowedMethods(o);
    const m = methods.includes(o.plan?.method) ? o.plan.method : methods[0];
    S.pay = { obligationId: id, amount: formatInput(F.remaining(o)), date: today(), method: m, accountId: o.plan?.accountId || (o.kind === 'instrument' ? o.plan.accountId : activeAccounts(F.methodKinds(m))[0]?.id || ''), ref: '', insNo: '', insMaturity: '', attachments: [] };
    S.plan = null;
    S.panel = 'finance';
    S.fin = 'payables';
    S.flash = null;
    render();
    main.querySelector('#pay-drawer')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function payDrawer() {
    const o = S.books.obligations.find((x) => x.id === S.pay.obligationId);
    if (!o) return '';
    const p = S.pay;
    const methods = F.allowedMethods(o);
    const accs = activeAccounts(F.methodKinds(p.method)).filter((a) => !(o.kind === 'instrument' && o.instrumentType === 'cheque') || a.id === o.plan.accountId);
    const isIns = p.method === 'cheque' || p.method === 'note';
    const hist = o.settlements.filter((s) => !s.reversed);
    return '<form class="drawer" id="pay-drawer" data-form="pay" data-live="pay" autocomplete="off"><header><div><h3>Ödemeyi onayla · ' + esc(o.label) + '</h3><p class="small muted">' + esc(kindLabel(o.kind)) + ' · vade ' + dateTR(o.due) + ' · toplam ' + tl(o.amount) + ' · kalan <b>' + tl(F.remaining(o)) + '</b></p></div>' + btn('close-pay', '✕ Kapat', { cls: 'small' }) + '</header>' +
      '<div class="pad form three">' + field('Ödeme şekli *', select('method', methods.map((x) => [x, method(x)]), p.method, 'data-rerender')) +
      (p.method === 'note' ? '<div></div>' : field(p.method === 'card' ? 'Kullanılan kart *' : p.method === 'cheque' ? 'Çekin bankası *' : 'Paranın çıktığı hesap *', select('accountId', [['', 'Seçiniz…'], ...accs.map((a) => [a.id, a.label + ' · ' + tl(F.balance(S.books, a.id))])], accs.some((a) => a.id === p.accountId) ? p.accountId : accs[0]?.id || ''))) +
      field('Tutar *', money('amount', p.amount, o.kind === 'instrument' ? 'readonly' : ''), { hint: o.kind === 'instrument' ? 'Çek / senet tam tutarla ödenir' : 'Kısmi ödeme yapılabilir' }) +
      field(isIns ? 'Veriliş tarihi *' : 'Gerçek ödeme tarihi *', input('date', p.date, 'type="date" max="' + today() + '"')) +
      (isIns ? field(method(p.method) + ' no *', input('insNo', p.insNo, 'maxlength="40"')) + field('Vade *', input('insMaturity', p.insMaturity, 'type="date"')) : field('Dekont / işlem no', input('ref', p.ref, 'maxlength="60"'))) +
      '</div><div class="pad" style="padding-top:0">' + attachList('pay', p.attachments) + '</div><div id="pay-preview"></div>' + (hist.length ? '<div class="note"><b>Önceki ödemeler:</b> ' + hist.map((s) => dateTR(s.date) + ' ' + tl(s.amount) + ' (' + esc(method(s.via) || s.via) + ')').join(' · ') + '</div>' : '') +
      '<div id="pay-error" class="error" role="alert"></div><div class="savebar"><span>Gelecek tarihli ödeme onaylanamaz; ileri tarih için “Planla”yı kullanın.</span><button type="submit" class="primary">Ödendi olarak kaydet</button></div></form>';
  }
  function payInput() {
    const p = S.pay;
    const isIns = p.method === 'cheque' || p.method === 'note';
    return { date: p.date, method: p.method, accountId: p.method === 'note' ? '' : p.accountId, ref: p.ref, allocations: [{ obligationId: p.obligationId, amount: parseTL(p.amount) }], instrument: isIns ? { no: p.insNo, maturity: p.insMaturity } : undefined, attachments: p.attachments || [] };
  }
  function refreshPayPreview() {
    const box = main.querySelector('#pay-preview');
    if (!box) return;
    try {
      const r = F.planPayment(S.books, payInput());
      const rv = r.reviews.reduce((s, x) => s + x.amount, 0);
      box.innerHTML = '<div class="fx" style="grid-template-columns:repeat(4,minmax(0,1fr))">' + fx('Kapanan borç', r.total, true) + fx('Nakit / banka çıkışı', r.cashOut, r.cashOut > 0) + fx('Kart borcu artışı', r.cardCharge) + fx(r.instrument ? 'Çek / senet borcu' : 'İncelemeye düşen', r.instrument ? r.total : rv, rv > 0) + '</div>' +
        (rv ? '<div class="callout warn" style="margin:0 16px 12px">Sistemde kayıtlı kart borcu ' + tl(r.total - rv) + '. Kalan <b>' + tl(rv) + '</b> bankadan çıkar ama gider yazılmaz; <b>İnceleme</b> ekranında faiz, masraf veya önceki borç olarak sınıflandırılır.</div>' : '');
    } catch (err) {
      box.innerHTML = '<div class="note">' + esc(friendly(err.message)) + '</div>';
    }
  }
  function submitPay(form) {
    Object.assign(S.pay, readForm(form));
    let reviewed = false;
    const ok = mutate((b) => {
      const id = F.recordPayment(b, { key: 'ui-pay-' + uid(), ...payInput() });
      reviewed = b.reviews.some((r) => r.paymentId === id);
      return id;
    }, (id) => id + ' ödemesi kaydedildi.' + (reviewed ? ' Ekstre farkı İnceleme ekranına alındı.' : ''), '#pay-error');
    if (ok) {
      S.pay = null;
      render();
    }
  }
  function openPlan(id) {
    const o = S.books.obligations.find((x) => x.id === id);
    S.plan = { obligationId: id, date: o.plan?.date || o.due, method: o.plan?.method || 'transfer', accountId: o.plan?.accountId || '' };
    S.pay = null;
    render();
  }
  function planDrawer() {
    const o = S.books.obligations.find((x) => x.id === S.plan.obligationId);
    const methods = F.allowedMethods(o);
    const accs = activeAccounts(F.methodKinds(S.plan.method));
    return '<form class="drawer" data-form="plan"><header><div><h3>Ödeme planı · ' + esc(o.label) + '</h3><p class="small muted">Plan değişikliği muhasebe kaydı oluşturmaz; takvim ve nakit projeksiyonunu günceller.</p></div>' + btn('close-plan', '✕', { cls: 'small' }) + '</header><div class="pad form three">' +
      field('Planlanan tarih', input('date', S.plan.date, 'type="date"'), { hint: 'Vade: ' + dateTR(o.due) }) + field('Ödeme şekli', select('method', methods.map((x) => [x, method(x)]), S.plan.method, 'data-rerender')) + (S.plan.method === 'note' ? '<div></div>' : field('Hesap / kart', select('accountId', [['', '—'], ...accs.map((a) => [a.id, a.label])], S.plan.accountId))) +
      '</div><div id="plan-error" class="error"></div><div class="savebar"><span>' + (S.plan.method === 'card' ? 'Kartla planlanan ödeme ekstre gününe kadar nakit çıkarmaz.' : '') + '</span><button class="primary" type="submit">Planı kaydet</button></div></form>';
  }

  // ───────────────────────── Takvim ─────────────────────────
  function calendarItems() {
    const b = S.books;
    return [
      ...F.openItems(b, { includePaid: true }).map((o) => ({ date: o.plan?.date || o.due, amount: o.remaining > 0 ? o.remaining : o.amount, paid: o.remaining <= 0, label: o.label, party: o.partyLabel, kind: o.kind, id: o.id, status: o.status })),
      ...b.expected.filter((x) => x.status === 'expected').map((x) => ({ date: x.due, amount: x.amount, label: x.label, party: partyLabel(x.partyId), kind: 'expected', expectedId: x.id, status: 'Belge bekleniyor' })),
    ];
  }
  function calendar() {
    const grid = H.monthDays(S.cal.month);
    const items = calendarItems().filter((x) => x.date.startsWith(S.cal.month));
    const day = S.cal.day;
    const list = items.filter((x) => !day || x.date === day).sort((a, c) => a.date.localeCompare(c.date));
    const cells = grid.days.map((d) => {
      const xs = items.filter((x) => x.date === d && !x.paid);
      const amount = xs.reduce((s, x) => s + x.amount, 0);
      const over = xs.some((x) => x.status && x.status.includes('Gecikmiş'));
      return '<button type="button" data-act="cal-day" data-v="' + d + '" aria-pressed="' + (d === day) + '" class="' + (d === today() ? 'today ' : '') + (d < today() ? 'past ' : '') + (over ? 'has-over' : '') + '"><span class="d">' + Number(d.slice(8)) + '</span>' + (xs.length ? '<span class="a">' + tl(amount) + '</span><span class="c">' + xs.length + ' kalem</span><span class="dots">' + xs.slice(0, 6).map((x) => '<i class="' + x.kind + '"></i>').join('') + '</span>' : '') + '</button>';
    }).join('');
    return head('Ödeme takvimi', 'Plan tarihine göre: fatura borçları, vergi/SGK, çek-senet vadeleri, kart ekstreleri ve belgesi beklenen planlar.', btn('cal-month', '‹', { data: { v: -1 } }) + '<b style="min-width:110px;text-align:center">' + monthTR(S.cal.month) + '</b>' + btn('cal-month', '›', { data: { v: 1 } })) +
      card(monthTR(S.cal.month), '<div class="cal">' + ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((x) => '<b>' + x + '</b>').join('') + Array.from({ length: grid.offset }, () => '<div></div>').join('') + cells + '</div><div class="legend"><span><i style="background:#1d1d1f"></i>Firma</span><span><i style="background:#2457a6"></i>Vergi / SGK</span><span><i style="background:#1f7a45"></i>Maaş</span><span><i style="background:#b4362a"></i>Çek / senet</span><span><i style="background:#bd9b00"></i>Kart ekstresi</span><span><i style="background:#6b4fa3"></i>Kredi</span><span><i style="background:#c7c7cc"></i>Belge bekleniyor</span></div>') +
      card(day ? dateTR(day, { weekday: true }) : monthTR(S.cal.month) + ' · tüm kalemler', table(['Tarih', 'Kime', 'Ne için', 'Tür', '#Tutar', 'Durum', ''], list.map((x) => '<tr>' + td(dateTR(x.date)) + td('<b>' + esc(x.party) + '</b>') + td(esc(x.label)) + td(esc(kindLabel(x.kind))) + tdn(tl(x.amount)) + td(tag(x.paid ? 'Ödendi' : x.status, x.paid ? 'ok' : x.kind === 'expected' ? '' : statusTone(x.status))) + '<td class="num">' + (x.expectedId ? btn('expected-to-doc', 'Faturayı gir', { cls: 'small', data: { id: x.expectedId } }) : !x.paid ? btn('open-pay', 'Öde', { cls: 'small', data: { id: x.id } }) : '') + '</td></tr>'), { empty: 'Bu tarihte kalem yok.' }), { actions: day ? btn('cal-day', 'Ayın tamamı', { cls: 'small', data: { v: '' } }) : '' });
  }

  // ───────────────────────── Cariler ─────────────────────────
  function parties() {
    const rows = F.partySummary(S.books).filter((p) => p.debt || p.openCount || p.advance || p.active);
    return head('Cariler', 'Firma / kişi bazında borç, gecikmiş tutar ve verilen avans. Satıra tıklayınca cari ekstresi açılır.', btn('defs-go', '＋ Firma tanımla', { data: { v: 'parties' } })) +
      card('Firma ve kişiler', table(['Firma / kişi', 'Tür', '#Bakiye (borcumuz)', '#Açık kalem', '#Gecikmiş', '#Avans', ''], rows.sort((a, c) => c.debt - a.debt).map((p) => '<tr>' + td('<b>' + esc(p.label) + '</b>', p.taxNo ? 'VKN ' + esc(p.taxNo) : '') + td(esc(F.PARTY_TYPES[p.type])) + tdn(tl(p.debt), p.debt < 0 ? 'pos' : '') + tdn(p.openCount ? tl(p.open) + '<small>' + p.openCount + ' kalem</small>' : '—') + tdn(p.overdue ? tl(p.overdue) : '—', p.overdue ? 'neg' : '') + tdn(p.advance ? tl(p.advance) : '—') + '<td class="num">' + btn('party', 'Ekstre', { cls: 'small', data: { id: p.id } }) + '</td></tr>')), { sub: 'Eksi bakiye: firmaya fazla / avans ödenmiş (firmadan alacaklıyız).' });
  }
  function partyDetail() {
    const b = S.books;
    const p = b.parties.find((x) => x.id === S.partyId);
    if (!p) return parties();
    const sum = F.partySummary(b).find((x) => x.id === p.id);
    const st = F.partyStatement(b, p.id);
    const open = F.openItems(b).filter((o) => o.partyId === p.id);
    const docs = b.documents.filter((d) => d.partyId === p.id);
    const adv = F.advanceAvailable(b, p.id);
    return head(esc(p.label), esc(F.PARTY_TYPES[p.type]) + (p.taxNo ? ' · VKN ' + esc(p.taxNo) : ''), btn('fin', '← Cariler', { data: { v: 'parties' } }) + (['supplier', 'service', 'landlord'].includes(p.type) ? btn('doc-new', '＋ Fatura gir', { cls: 'primary', data: { v: p.type === 'supplier' ? 'purchase' : p.type === 'landlord' ? 'rent' : 'expense', party: p.id } }) : '')) +
      '<div class="kpis">' + kpi('Bakiye', tl(sum.debt), sum.debt < 0 ? 'Firmadan alacaklıyız' : 'Borcumuz', 'hl') + kpi('Açık kalemler', tl(sum.open), sum.openCount + ' kalem') + kpi('Gecikmiş', tl(sum.overdue), '', sum.overdue ? 'bad' : '') + kpi('Kullanılabilir avans', tl(adv), adv ? 'Açık faturaya mahsup edilebilir' : '') + '</div>' +
      (adv && open.some((o) => o.kind === 'party') ? '<div class="callout">Bu firmaya ' + tl(adv) + ' avans verilmiş. ' + open.filter((o) => o.kind === 'party').map((o) => btn('apply-adv', esc(o.label) + ' faturasına mahsup et (' + tl(Math.min(adv, o.remaining)) + ')', { cls: 'small', data: { id: o.id, party: p.id } })).join(' ') + '</div>' : '') +
      card('Açık kalemler', payTable(F.openItems(b).filter((o) => o.partyId === p.id).map((o) => o)), {}) +
      card('Cari ekstre', table(['Tarih', 'Açıklama', '#Borçlanma', '#Ödeme / mahsup', '#Bakiye'], st.map((r) => '<tr>' + td(dateTR(r.date, { year: true })) + td(esc(r.memo), esc(F.accountInfo(b, r.account).label)) + tdn(r.debt ? tl(r.debt) : '') + tdn(r.paid ? tl(r.paid) : '') + tdn('<b>' + tl(r.balance) + '</b>') + '</tr>'), { empty: 'Hareket yok.' }), { sub: 'Faturalar borcu artırır; ödemeler, çek/senet verilişi ve kartla ödeme azaltır.' }) +
      card('Belgeler', table(['Tarih', 'Belge', 'Tür', '#Tutar', 'Durum', ''], docs.map((d) => '<tr>' + td(dateTR(d.date)) + td(esc(d.docNo || d.id), esc(d.id) + (d.attachments?.length ? ' · ' + attachLinks(d.attachments) : '')) + td(esc(F.DOC_TYPES[d.type])) + tdn(tl(d.total)) + td(d.reversed ? tag('İptal', '') : tag('Kayıtlı', 'ok')) + '<td class="num">' + (!d.reversed ? btn('reverse-doc', 'İptal (ters kayıt)', { cls: 'small danger', data: { id: d.id } }) : '') + '</td></tr>')));
  }

  // ───────────────────────── Hesaplar ─────────────────────────
  function accounts() {
    const b = S.books;
    const bal = F.moneyBalances(b).filter((a) => a.active || a.balance);
    const sel = b.accounts.find((a) => a.id === S.accountId) || bal[0];
    const st = F.accountStatement(b, sel.id, { from: S.accRange.from, to: S.accRange.to || today() });
    const isCard = sel.kind === 'card';
    const lastRec = [...b.reconciliations].reverse().find((r) => r.accountId === sel.id);
    const action = S.accAction;
    return head('Banka · kasa · kart · POS', 'Her hesap kendi hareketleriyle izlenir. Kart borçtur; POS’taki tutar bankaya geçene kadar nakit sayılmaz. KMH, banka hesabının eksi bakiyesidir: kullanımı gelir, kapatılması gider değildir.', btn('acc-action', 'Virman', { data: { v: 'transfer' }, pressed: action === 'transfer' }) + btn('acc-action', 'POS → banka', { data: { v: 'pos' }, pressed: action === 'pos' }) + btn('acc-action', 'Ekstre mutabakatı', { data: { v: 'reconcile' }, pressed: action === 'reconcile' }) + btn('defs-go', 'Hesap tanımla', { data: { v: 'accounts' } })) +
      (action ? accActionForm(action, sel) : '') +
      '<div class="acc-cards">' + bal.map((a) => '<button type="button" class="acc" data-act="acc-select" data-v="' + a.id + '" aria-pressed="' + (a.id === sel.id) + '"><small>' + esc(F.MONEY_KINDS[a.kind]) + '</small><b>' + esc(a.label) + '</b><strong class="' + (a.kind !== 'card' && a.balance < 0 ? 'neg' : '') + '">' + tl(a.balance) + '</strong><small>' + (a.kind === 'card' ? 'Kart borcu' + (a.limit ? ' · limit ' + tl(a.limit) : '') : a.kind === 'pos' ? 'Bankaya geçmeyi bekleyen' : a.kind === 'bank' && a.limit ? (a.balance < 0 ? 'KMH kullanımı ' + tl(-a.balance) : 'Bakiye') + ' · KMH limiti ' + tl(a.limit) : 'Bakiye') + '</small>' + (a.kind === 'card' && a.limit ? '<div class="meter"><i style="width:' + Math.min(100, Math.max(0, (a.balance / a.limit) * 100)) + '%"></i></div>' : '') + (a.kind === 'bank' && a.limit ? '<div class="meter"><i style="background:#b4362a;width:' + Math.min(100, Math.max(0, (-a.balance / a.limit) * 100)) + '%"></i></div>' : '') + '</button>').join('') + '</div>' +
      card(esc(sel.label) + ' · hesap ekstresi', '<form class="pad row" data-form="acc-range">' + field('Başlangıç', input('from', S.accRange.from, 'type="date"')) + field('Bitiş', input('to', S.accRange.to || today(), 'type="date" max="' + today() + '"')) + '<button type="submit" style="align-self:flex-end">Uygula</button></form>' +
        table(['Tarih', 'Açıklama', '#' + (isCard ? 'Harcama (borç +)' : 'Giriş'), '#' + (isCard ? 'Ödeme (borç −)' : 'Çıkış'), '#Bakiye'], st.rows.map((r) => '<tr>' + td(dateTR(r.date, { year: true })) + td(esc(r.memo), r.cf === 'internal' ? 'İç transfer' : '') + tdn(r.in ? tl(r.in) : '') + tdn(r.out ? tl(r.out) : '') + tdn('<b>' + tl(r.balance) + '</b>') + '</tr>'), { empty: 'Bu aralıkta hareket yok.', foot: '<tr><td colspan="4">Dönem başı ' + tl(st.opening) + ' → dönem sonu</td>' + tdn(tl(st.closing)) + '</tr>' }),
        { sub: lastRec ? 'Son mutabakat ' + dateTR(lastRec.date) + ': ekstre ' + tl(lastRec.statementBalance) + ', sistem ' + tl(lastRec.system) + (lastRec.difference ? ' · fark ' + tl(lastRec.difference) : ' · mutabık') : 'Henüz ekstre mutabakatı yapılmadı.' });
  }
  function accActionForm(action, sel) {
    const banks = activeAccounts(['bank', 'cash']);
    if (action === 'transfer')
      return '<form class="drawer" data-form="transfer"><header><h3>Hesaplar arası virman</h3>' + btn('acc-action', '✕', { cls: 'small', data: { v: '' } }) + '</header><div class="pad form three">' + field('Çıkan hesap', select('from', banks.map((a) => [a.id, a.label + ' · ' + tl(F.balance(S.books, a.id))]), 'bank-is')) + field('Giren hesap', select('to', banks.map((a) => [a.id, a.label]), 'bank-garanti')) + field('Tutar *', money('amount', '')) + field('Tarih', input('date', today(), 'type="date" max="' + today() + '"')) + field('Açıklama', input('note', '', 'maxlength="80"')) + '</div><div id="act-error" class="error"></div><div class="savebar"><span>Toplam nakdi, gelir ve gideri değiştirmez; nakit akışında “iç transfer” olarak ayrılır.</span><button class="primary" type="submit">Virmanı kaydet</button></div></form>';
    if (action === 'pos') {
      const pos = activeAccounts(['pos']);
      const pid = S.posPrefill || pos.find((a) => F.balance(S.books, a.id) > 0)?.id || pos[0]?.id;
      const pa = S.books.accounts.find((a) => a.id === pid);
      const pp = pid ? F.posPending(S.books, pid) : { due: 0, dueFee: null };
      return '<form class="drawer" data-form="pos"><header><h3>POS tahsilatı bankaya geçti</h3>' + btn('acc-action', '✕', { cls: 'small', data: { v: '' } }) + '</header><div class="pad form three">' + field('POS hesabı', select('posId', pos.map((a) => [a.id, a.label + ' · bekleyen ' + tl(F.balance(S.books, a.id))]), pid)) + field('Banka', select('bankId', activeAccounts(['bank']).map((a) => [a.id, a.label]), pa?.pos?.bankId || 'bank-garanti')) + field('Tarih', input('date', today(), 'type="date" max="' + today() + '"')) + field('Brüt tutar *', money('gross', formatInput(pp.due || F.balance(S.books, pid || '')))) + field('Komisyon', money('fee', pp.dueFee ? formatInput(pp.dueFee) : ''), { hint: pp.dueFee ? 'Tanımlı orana göre tahmin; ekstredeki gerçek kesintiyle düzeltin' : 'Banka ekstresindeki kesinti' }) + '</div><div id="act-error" class="error"></div><div class="savebar"><span>Net tutar bankaya girer, komisyon finansman gideri olur. Satış hasılatı değişmez.</span><button class="primary" type="submit">Kaydet</button></div></form>';
    }
    return '<form class="drawer" data-form="reconcile"><header><h3>Ekstre mutabakatı · ' + esc(sel.label) + '</h3>' + btn('acc-action', '✕', { cls: 'small', data: { v: '' } }) + '</header><div class="pad form three">' + field('Hesap', select('accountId', S.books.accounts.filter((a) => a.active).map((a) => [a.id, a.label]), sel.id)) + field('Ekstre tarihi', input('date', today(), 'type="date" max="' + today() + '"')) + field('Ekstredeki bakiye *', money('balance', formatInput(F.balance(S.books, sel.id))), { hint: sel.kind === 'card' ? 'Kartta borç tutarı' : 'Bankanın gösterdiği bakiye' }) + '</div><div id="act-error" class="error"></div><div class="savebar"><span>Sistem bakiyesiyle karşılaştırılır; fark kapanış kontrolünde görünür.</span><button class="primary" type="submit">Karşılaştır</button></div></form>';
  }

  // ───────────────────────── Çek / senet ─────────────────────────
  function instruments() {
    const b = S.books;
    const rows = [...b.instruments].sort((a, c) => a.maturity.localeCompare(c.maturity));
    const issued = rows.filter((x) => x.status === 'issued');
    return head('Çek / senet', 'Verildiğinde firma borcu kapanır, nakit çıkmaz. Vadesinde bankadan / kasadan bir kez ödenir. İade edilirse firma borcu yeniden açılır.') +
      '<div class="kpis">' + kpi('Vadesi bekleyen', tl(issued.reduce((s, x) => s + x.amount, 0)), issued.length + ' adet', 'hl') + kpi('30 gün içinde', tl(issued.filter((x) => x.maturity <= F.addDays(today(), 30)).reduce((s, x) => s + x.amount, 0)), '') + kpi('Ödenen', tl(rows.filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount, 0)), '') + kpi('İade / iptal', String(rows.filter((x) => ['returned', 'cancelled'].includes(x.status)).length), 'adet') + '</div>' +
      card('Portföy', table(['No', 'Tür', 'Firma', 'Veriliş', 'Vade', '#Tutar', 'Banka', 'Durum', ''], rows.map((x) => {
        const o = b.obligations.find((y) => y.ledger.instrument === x.id && !y.cancelled);
        const days = H.daysBetween(today(), x.maturity);
        const st = { issued: days < 0 ? ['Vadesi geçti', 'bad'] : days <= 7 ? [days + ' gün kaldı', 'warn'] : ['Vade bekliyor', 'info'], paid: ['Ödendi', 'ok'], returned: ['İade edildi', ''], cancelled: ['İptal', ''] }[x.status];
        return '<tr>' + td('<b>' + esc(x.no) + '</b>') + td(method(x.type)) + td(esc(partyLabel(x.partyId))) + td(dateTR(x.issueDate)) + td(dateTR(x.maturity)) + tdn(tl(x.amount)) + td(x.accountId ? esc(accLabel(x.accountId)) : '—') + td(tag(st[0], st[1])) + '<td class="num">' + (x.status === 'issued' && o ? btn('open-pay', 'Vadesinde öde', { cls: 'small primary', data: { id: o.id } }) + ' ' + btn('return-ins', 'İade / karşılıksız', { cls: 'small', data: { id: x.id } }) : '') + '</td></tr>';
      }), { empty: 'Verilmiş çek / senet yok. Ödemeler ekranında ödeme şekli olarak Çek veya Senet seçin.' }));
  }

  // ───────────────────────── Tahsilatlar ─────────────────────────
  function sales() {
    const b = S.books;
    const month = today().slice(0, 7);
    const pl = F.profitAndLoss(b, { from: month + '-01', to: today() });
    const orders = [...b.orders].reverse();
    const pos = b.accounts.filter((a) => a.kind === 'pos' && a.active).map((a) => ({ a, p: F.posPending(b, a.id) })).filter((x) => x.p.gross);
    const manual = [...b.collections].filter((c) => !c.orderId).reverse();
    const st = (o) => (o.cancelled ? tag('İptal', '') : o.delivered ? (o.returns.length ? tag('Teslim · iade var', 'warn') : tag('Teslim edildi', 'ok')) : tag('Kapora · teslim bekliyor', 'warn'));
    return head('Satışlar & POS', 'Sipariş föyünde kaydedilen her sipariş buraya gelir. Kapora avanstır; föyde “Teslim Edildi” olunca hasılat, KDV ve satılan malın maliyeti kaydedilir.') +
      '<div class="kpis">' + kpi('Bu ay net satış', tl(pl.sales), pl.returns ? 'İade ' + tl(pl.returns) + ' düşüldü' : 'KDV hariç, teslim edilen', 'hl') + kpi('Satılan malın maliyeti', tl(pl.cogs), 'Ortalama maliyetle') + kpi('Brüt kâr', tl(pl.grossProfit), pl.sales ? '%' + ((pl.grossProfit / pl.sales) * 100).toFixed(1) + (pl.unlinked ? ' · ' + tl(pl.unlinked) + ' satışın maliyeti bağlı değil' : '') : '', pl.unlinked ? '' : '') + kpi('POS’ta bekleyen', tl(pos.reduce((s, x) => s + x.p.gross, 0)), 'Bankaya geçmedi') + '</div>' +
      (S.ret ? returnDrawer() : '') +
      card('Siparişler (föyden)', table(['Tarih', 'Sipariş', 'Müşteri / temsilci', 'Şube', '#Tutar', '#Tahsil', '#Müşteri bakiyesi', '#SMM', 'Durum', ''], orders.map((o) => {
        const bal = F.orderBalance(b, o.id);
        return '<tr>' + td(dateTR(o.date), o.delivered ? 'Teslim ' + dateTR(o.deliveredOn) : '') + td('<b>' + esc(o.no) + '</b>', o.lines.map((l) => esc(l.label) + ' ×' + l.qty + (l.sku ? '' : ' (SKU yok)')).join(' · ')) + td(esc(o.customer), esc(o.seller)) + td(esc(branchLabel(o.branchId))) + tdn(tl(o.total)) + tdn(tl(o.collected)) + tdn(bal > 0 ? tl(bal) + '<small>alacak</small>' : bal < 0 ? tl(-bal) + '<small>' + (o.delivered ? 'müşteriye borç' : 'avans') + '</small>' : '—', bal > 0 ? 'neg' : '') + tdn(o.delivered ? tl(o.cogs || 0) : '—') + td(st(o) + (o.warnings.length ? ' ' + tag('Föyde değişti, kontrol edin', 'bad') : '')) + '<td class="num">' + (o.cancelled ? '' : !o.delivered ? btn('deliver-order', 'Teslim et', { cls: 'small', data: { id: o.id } }) + ' ' + btn('open-return', 'İptal / iade', { cls: 'small', data: { id: o.id } }) : btn('open-return', 'İade', { cls: 'small', data: { id: o.id } })) + '</td></tr>';
      }), { empty: 'Henüz föyden sipariş gelmedi. Personel · Sipariş ekranında föyü kaydedince burada görünür.' }), { sub: 'Föydeki tahsilatlar, kayıt anında kasa / POS hesabına işlenir. Aynı kayıt tekrar kaydedilirse çift tahsilat oluşmaz.' }) +
      card('POS → banka', pos.length ? table(['POS', 'Taksit / valör', '#Bekleyen', '#Valörü gelen', '#Tahmini komisyon', 'Mod', ''], pos.map(({ a, p }) => '<tr>' + td('<b>' + esc(a.label) + '</b>', a.pos?.bankId ? '→ ' + esc(accLabel(a.pos.bankId)) : '') + td(p.rows.map((c) => (c.installments > 1 ? c.installments + ' taksit' : 'tek çekim') + ' ' + tl(c.open)).join(' · '), 'Valör ' + (a.pos?.settleDays ?? 1) + ' gün') + tdn(tl(p.gross)) + tdn(tl(p.due)) + tdn(p.dueFee === null ? '<small>oran tanımsız</small>' : tl(p.dueFee)) + td(a.pos?.auto ? tag('Otomatik', 'info') : tag('Elle (ekstreden)', '')) + '<td class="num">' + (a.pos?.auto ? btn('pos-auto', 'Valörü geleni aktar', { cls: 'small primary', data: { id: a.id }, disabled: !p.due }) + ' ' : '') + btn('pos-manual', 'Ekstreden gir', { cls: 'small', data: { id: a.id } }) + '</td></tr>')) : '<div class="empty">Bekleyen POS tahsilatı yok.</div>', { sub: 'Komisyon her banka ve taksitte farklı; ertesi gün hesaba geçen tutardan muhasebeci girer. Oranlar tanımlıysa tahmin gösterilir; istenen POS için Tanımlar’dan otomatik mod açılabilir.', actions: btn('defs-go', 'POS oranları', { cls: 'small', data: { v: 'accounts' } }) }) +
      '<div class="grid2">' + card('Föy dışı tahsilatlar', table(['Tarih', 'Açıklama', 'Şube', 'Hesap', '#Tutar', 'Durum', ''], manual.map((c) => '<tr>' + td(dateTR(c.date)) + td(esc(c.orderNo || '—'), esc(c.customer || '')) + td(esc(branchLabel(c.branchId))) + td(esc(accLabel(c.accountId))) + tdn(tl(c.gross)) + td(c.delivered ? tag('Hasılat · stok bağlantısız', 'warn') : tag('Avans', 'warn')) + '<td class="num">' + (!c.delivered ? btn('deliver', 'Teslim edildi', { cls: 'small', data: { id: c.id } }) : '') + '</td></tr>')), { sub: 'Föy öncesi gün sonu özetleri. Kalem bilgisi olmadığı için satılan malın maliyeti bağlanamaz.' }) +
      '<form data-form="collection">' + card('Föy dışı tahsilat gir', '<div class="pad form">' + field('Tarih', input('date', today(), 'type="date" max="' + today() + '"')) + field('Şube', select('branchId', branchOptions(), F.defaultBranch(b))) + field('Hesap', select('accountId', activeAccounts(['cash', 'pos', 'bank']).map((a) => [a.id, a.label]), 'cash-store')) + field('Taksit (POS)', select('installments', Array.from({ length: 12 }, (_, i) => [String(i + 1), i ? i + 1 + ' taksit' : 'Tek çekim']), '1')) + field('Tahsil edilen (KDV dahil) *', money('gross', '')) + field('KDV oranı', select('vatRate', [['10', '%10'], ['20', '%20'], ['1', '%1'], ['0', '%0']], '10')) + field('Açıklama', input('orderNo', '', 'maxlength="30"')) + field('Müşteri', input('customer', '', 'maxlength="60"')) + '<label class="f wide" style="flex-direction:row;align-items:center;gap:8px;color:var(--text)"><input type="checkbox" name="delivered" value="1" style="width:auto"> Ürün teslim edildi (hasılat)</label></div><div id="col-error" class="error"></div><div class="savebar"><span>Tercihen satışı föyden girin; maliyet ve stok otomatik bağlanır.</span><button class="primary" type="submit">Kaydet</button></div>') + '</form></div>';
  }
  function returnDrawer() {
    const o = S.books.orders.find((x) => x.id === S.ret.orderId);
    if (!o) return '';
    const credit = -F.orderBalance(S.books, o.id);
    const returned = (i) => o.returns.flatMap((r) => r.lines).filter((x) => x.index === i).reduce((s, x) => s + x.qty, 0);
    const accs = activeAccounts(['cash', 'bank', 'pos']);
    return '<form class="drawer" data-form="return"><header><div><h3>' + (o.delivered ? 'Satış iadesi · ' : 'Sipariş iptali / kapora iadesi · ') + esc(o.no) + '</h3><p class="small muted">' + esc(o.customer) + ' · ' + tl(o.total) + (o.delivered ? '' : ' · tahsil edilen kapora ' + tl(o.collected)) + '</p></div>' + btn('close-return', '✕ Kapat', { cls: 'small' }) + '</header>' +
      (o.delivered ? '<div class="tbl"><table><thead><tr><th>Ürün</th><th class="num">Satılan</th><th class="num">İade edilmiş</th><th class="num">Satır tutarı</th><th>İade adedi</th></tr></thead><tbody>' + o.lines.map((l, i) => '<tr>' + td(esc(l.label), l.sku ? esc(l.sku) + ' · stoğa geri girer' : 'SKU yok · stok etkisi yok') + tdn(l.qty) + tdn(returned(i)) + tdn(tl(l.gross)) + '<td><input name="q' + i + '" type="number" min="0" max="' + (l.qty - returned(i)) + '" value="0" style="width:90px"' + (l.qty - returned(i) ? '' : ' disabled') + '></td></tr>').join('') + '</tbody></table></div>' : '') +
      '<div class="pad form three">' + field('Para iadesi tutarı', money('refund', o.delivered ? '' : formatInput(Math.max(0, credit))), { hint: o.delivered ? 'Ürün tutarına kadar; boş bırakılırsa müşteri alacağı olarak kalır' : 'En fazla tahsil edilen kapora' }) + field('İade hesabı', select('accountId', accs.map((a) => [a.id, a.label]), 'cash-store'), { hint: 'Kartla ödendiyse POS iadesi seçin' }) + field('Tarih', input('date', today(), 'type="date" max="' + today() + '"')) + field('Neden *', input('reason', '', 'maxlength="120" required'), { wide: true }) + (o.delivered ? '<label class="f wide" style="flex-direction:row;align-items:center;gap:8px;color:var(--text)"><input type="checkbox" name="restock" value="1" checked style="width:auto"> İade ürün satılabilir; stoğa geri al (hasarlıysa işareti kaldırın)</label>' : '') + '</div><div id="ret-error" class="error"></div><div class="savebar"><span>' + (o.delivered ? 'Satıştan iadeler (610) ve KDV düzeltmesi; stok teslimdeki maliyetle geri girer. Asıl satış silinmez.' : 'Kapora avansı kapanır; hasılat ve stok etkilenmez.') + '</span><button class="primary" type="submit">' + (o.delivered ? 'İadeyi kaydet' : 'İptal et ve iade et') + '</button></div></form>';
  }

  // ───────────────────────── Stok & maliyet ─────────────────────────
  function stock() {
    const b = S.books;
    const rows = F.stockSummary(b);
    const total = F.stockValue(b);
    const skus = [...new Set([...b.stock.items.map((x) => x.sku), ...S.stock.items.map((x) => x.sku)])];
    const act = S.stockAction;
    const skuInput = (name) => '<input name="' + name + '" list="sku-list" required autocomplete="off"><datalist id="sku-list">' + skus.map((x) => '<option value="' + esc(x) + '">' + esc(b.stock.items.find((i) => i.sku === x)?.label || '') + '</option>').join('') + '</datalist>';
    return head('Stok & maliyet', 'Stok miktarı şube bazında, maliyet SKU bazında ağırlıklı ortalamadır. Alış faturası stoğa girer (gider değildir); teslim edilen satışta maliyet satılan malın maliyetine (621) geçer.', btn('stock-action', 'Mal kabul (faturası sonra)', { data: { v: 'receipt' }, pressed: act === 'receipt' }) + btn('stock-action', 'Sayım', { data: { v: 'count' }, pressed: act === 'count' })) +
      '<div class="kpis">' + kpi('Stok değeri', tl(total), 'Muhasebe (153): ' + tl(F.balance(b, 'INVENTORY')), 'hl') + kpi('SKU', String(new Set(rows.map((r) => r.sku)).size), rows.reduce((s, r) => s + r.qty, 0) + ' adet') + kpi('Faturası gelmemiş mal', tl(F.balance(b, 'GRNI')), b.receipts.filter((r) => !r.invoiced).length + ' mal kabul') + kpi('Bu ay sayım / fire farkı', tl(F.profitAndLoss(b, { from: today().slice(0, 7) + '-01', to: today() }).categories.find((c) => c.id === 'stock-diff')?.amount || 0), 'Gider etkisi') + '</div>' +
      (act === 'receipt' ? '<form class="drawer" data-form="receipt"><header><h3>Mal kabul · fatura sonra gelecek</h3>' + btn('stock-action', '✕', { cls: 'small', data: { v: '' } }) + '</header><div class="pad form three">' + field('Tedarikçi', select('partyId', [['', '— (belirsiz)'], ...partiesOf(['supplier']).map((p) => [p.id, p.label])], '')) + field('Depo / şube', select('branchId', branchOptions(), F.defaultBranch(b))) + field('Tarih', input('date', today(), 'type="date" max="' + today() + '"')) + field('SKU *', skuInput('sku')) + field('Ürün adı', input('label', '', 'maxlength="80"')) + field('Adet *', input('qty', '1', 'type="number" min="1" step="1"')) + field('Birim maliyet (KDV hariç) *', money('unitCost', '')) + field('İrsaliye no', input('ref', '', 'maxlength="40"')) + '</div><div id="stk-error" class="error"></div><div class="savebar"><span>Stok girer; “faturası gelmemiş mal kabulleri” (329) borcu oluşur. Fatura girilirken bu kabul seçilir, fiyat farkı stoğa yansır.</span><button class="primary" type="submit">Kaydet</button></div></form>' : '') +
      (act === 'count' ? '<form class="drawer" data-form="count"><header><h3>Stok sayımı</h3>' + btn('stock-action', '✕', { cls: 'small', data: { v: '' } }) + '</header><div class="pad form three">' + field('SKU *', skuInput('sku')) + field('Depo / şube', select('branchId', branchOptions(), F.defaultBranch(b))) + field('Sayılan adet *', input('counted', '', 'type="number" min="0" step="1" required')) + field('Tarih', input('date', today(), 'type="date" max="' + today() + '"')) + field('Not', input('note', '', 'maxlength="80"'), { wide: true }) + '</div><div id="stk-error" class="error"></div><div class="savebar"><span>Fark ortalama maliyetle “sayım ve fire farkları” giderine yazılır.</span><button class="primary" type="submit">Sayımı kaydet</button></div></form>' : '') +
      card('Stok değeri', table(['SKU', 'Ürün', 'Şube', '#Adet', '#Ort. maliyet', '#Değer'], rows.map((r) => '<tr>' + td('<b>' + esc(r.sku) + '</b>') + td(esc(r.label)) + td(esc(branchLabel(r.branch))) + tdn(r.qty) + tdn(tl(r.avg)) + tdn(tl(r.value)) + '</tr>'), { foot: '<tr><td colspan="5">Toplam</td>' + tdn(tl(total)) + '</tr>' })) +
      '<div class="grid2">' + card('Son stok hareketleri', table(['Tarih', 'SKU', 'Hareket', '#Adet', '#Değer', 'Kaynak'], b.stock.moves.slice(-25).reverse().map((m) => '<tr>' + td(dateTR(m.date)) + td(esc(m.sku)) + td(esc({ opening: 'Açılış', purchase: 'Alış faturası', receipt: 'Mal kabul', sale: 'Satış (SMM)', return: 'Satış iadesi', count: 'Sayım', 'price-variance': 'Fiyat farkı', reversal: 'Ters kayıt' }[m.type] || m.type)) + tdn(m.qty > 0 ? '+' + m.qty : m.qty) + tdn(tl(m.value), m.value < 0 ? 'neg' : '') + td(esc(m.ref)) + '</tr>'))) +
      card('Mal kabulleri', table(['Tarih', 'Firma', '#Değer', 'Fatura'], b.receipts.map((r) => '<tr>' + td(dateTR(r.date)) + td(esc(r.partyId ? partyLabel(r.partyId) : '—'), esc(r.ref)) + tdn(tl(r.value)) + td(r.invoiced ? tag(r.invoiced, 'ok') : tag('Fatura bekleniyor', 'warn')) + '</tr>'), { empty: 'Mal kabul yok.' })) + '</div>';
  }

  // ───────────────────────── İnceleme ─────────────────────────
  function review() {
    const items = F.reviewItems(S.books);
    const open = items.filter((r) => r.remaining > 0);
    const sel = items.find((r) => r.id === S.reviewId) || open[0];
    return head('İnceleme', 'Açıklanamayan farklar burada bekler. Otomatik gider yazılmaz; belgeye göre siz sınıflandırırsınız. Sınıflandırma yeni nakit hareketi yaratmaz.') +
      pettyApproval() +
      (open.length ? '' : '<div class="callout">İncelemede bekleyen fark yok.</div>') +
      '<div class="grid2"><div>' + card('Farklar', table(['Tarih', 'Kaynak', 'Açıklama', '#Fark', '#Kalan', ''], items.map((r) => '<tr>' + td(dateTR(r.date)) + td(esc(r.source)) + td(esc(r.label)) + tdn(tl(r.amount)) + tdn('<b>' + tl(r.remaining) + '</b>', r.remaining ? 'neg' : 'pos') + '<td class="num">' + btn('review-select', r.remaining ? 'Sınıflandır' : 'Geçmiş', { cls: 'small' + (r.remaining ? ' primary' : ''), data: { id: r.id } }) + '</td></tr>'), { empty: 'Fark yok.' })) +
      (sel && sel.resolutions.length ? card('Sınıflandırma geçmişi', '<div class="list">' + sel.resolutions.map((x) => '<div><span>' + esc(F.REVIEW_TARGETS[x.target]) + '<small>' + dateTR(x.date) + (x.note ? ' · ' + esc(x.note) : '') + (x.categoryId ? ' · ' + esc(catLabel(x.categoryId)) : '') + '</small></span><b>' + tl(x.amount) + '</b></div>').join('') + '</div>') : '') + '</div>' +
      (sel && sel.remaining > 0 ? '<form data-form="review" data-live="review">' + card('Farkı sınıflandır', '<div class="pad"><div class="callout warn">' + esc(sel.label) + '<br>Kalan fark: <b>' + tl(sel.remaining) + '</b></div><div class="form">' + field('Bu fark nedir? *', select('target', [['', 'Seçiniz…'], ...Object.entries(F.REVIEW_TARGETS).filter(([k]) => k !== 'card-credit' || sel.cardId)], S.reviewDraft?.target || '', 'data-rerender'), { wide: true }) +
        (S.reviewDraft?.target === 'expense' ? field('Gider kategorisi *', select('categoryId', S.books.categories.filter((c) => c.active).map((c) => [c.id, c.label]), S.reviewDraft?.categoryId || 'other')) : '') +
        (S.reviewDraft?.target === 'supplier' ? field('Firma *', select('partyId', [['', 'Seçiniz…'], ...partiesOf(['supplier', 'service', 'landlord']).map((p) => [p.id, p.label])], S.reviewDraft?.partyId || '')) : '') +
        field('Tutar *', money('amount', S.reviewDraft?.amount || formatInput(sel.remaining)), { hint: 'Parça parça sınıflandırılabilir' }) + field('Belge / açıklama', input('note', S.reviewDraft?.note || '', 'maxlength="120" placeholder="Örn. ekstre faiz satırı"'), { wide: true }) + '</div>' +
        '<p class="small muted" style="margin-top:10px">' + reviewHint(S.reviewDraft?.target) + '</p></div><div id="review-error" class="error"></div><div class="savebar"><span>Banka çıkışı zaten kayıtlı; burada yalnızca neyin karşılığı olduğu belirlenir.</span><button class="primary" type="submit">Sınıflandır</button></div>', { sub: esc(sel.id) }) + '</form>' : '<div></div>') + '</div>';
  }
  function pettyApproval() {
    const b = S.books;
    const ds = b.documents.filter((d) => d.pending && !d.reversed);
    if (!ds.length) return '';
    const cats = b.categories.filter((c) => c.active).map((c) => [c.id, c.label]);
    return card('Onay bekleyen mağaza masrafları', table(['Tarih', 'Giren', 'Açıklama', 'Şube', '#Tutar', 'Belge', 'Kategori', ''], ds.map((d) => '<tr>' + td(dateTR(d.date)) + td(esc(d.enteredBy)) + td(esc(d.note)) + td(esc(branchLabel(d.branchId))) + tdn(tl(d.total)) + td(d.hasReceipt ? tag('Fiş var', 'ok') : tag('Belgesiz', 'bad'), attachLinks(d.attachments)) + '<td><select data-act-change="petty-cat" data-id="' + d.id + '" style="width:auto">' + cats.map(([v, t]) => '<option value="' + v + '"' + ((S.pettyCat[d.id] || d.categoryId) === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></td><td class="num">' + btn('approve-petty', 'Onayla', { cls: 'small primary', data: { id: d.id } }) + '</td></tr>')), { sub: 'Kasadan zaten çıktı. Onay yalnızca kategoriyi kesinleştirir; değişirse yeniden sınıflandırma fişi kesilir, nakit etkisi olmaz.' });
  }
  function reviewHint(t) {
    return ({ interest: 'Finansman gideri (780) olur. Kâr/zararı etkiler, nakdi etkilemez.', fee: 'Banka / kart masrafı olarak finansman giderine yazılır.', expense: 'Seçilen gider kategorisine yazılır. Belge numarasını açıklamaya ekleyin.', opening: 'Sistem açılmadan önceki kart / satıcı borcuydu. Açılış bakiyesi düzeltilir; bu dönemin gideri olmaz.', owner: 'Şahsi harcama: ortaklardan alacak (131). İşletme gideri olmaz.', 'card-credit': 'Karta fazla ödenmiş: kart hesabı alacak bakiyesine geçer, sonraki harcamalardan düşer.', supplier: 'Aslında bir firmaya ödeme: o firmanın carisine avans/ödeme olarak işlenir.' })[t] || 'Faiz, masraf, önceki dönem borcu, şahsi harcama veya fazla ödeme olabilir. Emin değilseniz bekletin; kapanış kontrolü uyarır.';
  }

  // ───────────────────────── Raporlar ─────────────────────────
  function reports() {
    const r = S.report;
    const range = { from: r.from, to: r.to > today() ? today() : r.to };
    const tabs = [['compare', 'Üç soru'], ['pl', 'Kâr / zarar'], ['branches', 'Şubeler'], ['budget', 'Bütçe'], ['payments', 'Ödeme raporu'], ['cash', 'Nakit çıkışı'], ['cf', 'Nakit akışı'], ['tb', 'Mizan'], ['journal', 'Yevmiye']];
    if (r.tab === 'budget') return head('Raporlar', 'Yönetim amaçlıdır; resmî mali tablo değildir.') + chips('report-tab', tabs, r.tab) + rBudget();
    return head('Raporlar', 'Yönetim amaçlıdır; resmî mali tablo değildir. Hepsi aynı fişlerden ve aynı tarih aralığından üretilir.', btn('csv', '⤓ CSV indir', { data: { v: r.tab } })) +
      '<form class="row" data-form="report-range" style="margin-bottom:12px">' + field('Başlangıç', input('from', r.from, 'type="date"')) + field('Bitiş', input('to', r.to, 'type="date"')) + field('Şube', select('branch', branchOptions(true), r.branch)) + '<button type="submit" style="align-self:flex-end">Uygula</button>' + btn('report-preset', 'Bu ay', { cls: 'small', data: { v: 'month' } }) + btn('report-preset', 'Son 7 gün', { cls: 'small', data: { v: 'week' } }) + '</form>' +
      chips('report-tab', tabs, r.tab) + ({ compare: rCompare, payments: rPayments, cash: rCash, pl: rPL, branches: rBranches, cf: rCF, tb: rTB, journal: rJournal }[r.tab])(range);
  }
  function rCompare(range) {
    const br = F.reportBridge(S.books, range);
    return card(dateTR(range.from) + ' – ' + dateTR(range.to), threeAnswers(br) + bridgeView(br) + '<p class="note"><b>Gider neden ödemeden farklı?</b> Mal alışı stoğa girer (satıldıkça maliyet olur), vergi/SGK ödemesi daha önce kaydedilmiş bir borcu kapatır, kredi anaparası gider değildir, şahsi ödemeler ortak carisine yazılır. Buna karşılık ödenmemiş faturalar da gider olarak raporlanır.</p>');
  }
  function rPayments(range) {
    const pr = F.paymentReport(S.books, range);
    const byParty = {};
    pr.rows.forEach((x) => (byParty[x.party] = (byParty[x.party] || 0) + x.amount));
    return '<div class="grid2">' + card('Kime ne ödendi', table(['Tarih', 'Kime', 'Ne için', 'Şekil', '#Tutar'], pr.rows.map((x) => '<tr>' + td(dateTR(x.date)) + td('<b>' + esc(x.party) + '</b>') + td(esc(x.label)) + td(esc(method(x.method))) + tdn(tl(x.amount)) + '</tr>'), { foot: '<tr><td colspan="4">Toplam</td>' + tdn(tl(pr.total)) + '</tr>' }), { sub: 'Çek/senet verilişi ve kartla ödeme dahil. Çek tahsili ve kart ekstresi ödemesi burada tekrar sayılmaz.' }) +
      '<div>' + card('Firmaya göre', '<div class="list">' + Object.entries(byParty).sort((a, c) => c[1] - a[1]).map(([k, v]) => '<div><span>' + esc(k) + '</span><b class="num">' + tl(v) + '</b></div>').join('') + '</div>') + card('Ödeme şekline göre', '<div class="list">' + Object.entries(pr.byMethod).filter(([, v]) => v).map(([k, v]) => '<div><span>' + esc(method(k)) + '</span><b class="num">' + tl(v) + '</b></div>').join('') + '</div>') + '</div></div>';
  }
  function rCash(range) {
    const cr = F.cashReport(S.books, range);
    return card('Kasadan / bankadan gerçekten çıkan', table(['Tarih', 'Hesap', 'Açıklama', 'Sınıf', '#Tutar'], cr.rows.map((x) => '<tr>' + td(dateTR(x.date)) + td(esc(x.account)) + td(esc(x.memo)) + td(esc(F.CF_LABELS[x.cf])) + tdn(tl(x.amount)) + '</tr>'), { foot: '<tr><td colspan="4">Toplam çıkış (virman hariç ' + tl(cr.internal) + ')</td>' + tdn(tl(cr.out)) + '</tr>' }), { sub: 'Kartla yapılan ödemeler burada değil, ekstre ödendiğinde görünür.' });
  }
  function rPL(range) {
    const pl = F.profitAndLoss(S.books, { ...range, branch: S.report.branch || undefined });
    const rows = Object.entries(F.PL_GROUPS).flatMap(([g, gl]) => {
      const cs = pl.categories.filter((c) => c.pl === g);
      if (!cs.length) return [];
      return ['<tr><td colspan="2"><b>' + gl + '</b></td>' + tdn('<b>' + tl(pl.groups[g]) + '</b>') + '</tr>', ...cs.map((c) => '<tr><td class="small muted" style="width:60px">' + esc(c.code) + '</td>' + td(esc(c.label)) + tdn(tl(c.amount)) + '</tr>')];
    });
    const line = (code, label, v, bold, cls = '') => '<tr><td class="small muted">' + code + '</td><td>' + (bold ? '<b>' + label + '</b>' : label) + '</td>' + tdn(bold ? '<b>' + tl(v) + '</b>' : tl(v), cls) + '</tr>';
    return '<div class="grid2">' + card('Gelir tablosu · ' + esc(S.report.branch ? branchLabel(S.report.branch) : 'tüm işletme'), table(['Kod', 'Kalem', '#Tutar'], [line('600', 'Brüt satışlar (KDV hariç, teslim edilen)', pl.grossSales), ...(pl.returns ? [line('610', 'Satıştan iadeler (−)', -pl.returns, false, 'neg')] : []), line('', 'Net satışlar', pl.sales, true), line('621', 'Satılan malın maliyeti (−)', -pl.cogs, false, 'neg'), line('', 'Brüt kâr' + (pl.sales ? ' · %' + ((pl.grossProfit / pl.sales) * 100).toFixed(1) : ''), pl.grossProfit, true), ...rows, ...(pl.otherIncome ? [line('649', 'Kasa fazlası ve diğer gelirler', pl.otherIncome)] : [])], { foot: '<tr><td colspan="2">Dönem sonucu</td>' + tdn(tl(pl.result), pl.result < 0 ? 'neg' : 'pos') + '</tr>' }), { sub: pl.unlinked ? tl(pl.unlinked) + ' satışın ürün satırı stoğa bağlı değil (föy öncesi özetler / SKU’suz ürün); bu satışların maliyeti hesaba girmedi, brüt kâr olduğundan yüksek görünür.' : 'Tüm satışların maliyeti stok defterinden geldi.' }) +
      card('Gider dağılımı', '<div class="pad">' + pl.categories.sort((a, c) => c.amount - a.amount).map((c) => '<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><span class="small">' + esc(c.label) + '</span><b class="small num">' + tl(c.amount) + '</b></div><div class="meter"><i style="width:' + ((c.amount / Math.max(1, pl.expenses)) * 100).toFixed(1) + '%;background:' + (c.pl === 'finance' ? '#2457a6' : c.pl === 'other' ? '#b4362a' : '#1d1d1f') + '"></i></div></div>').join('') + '</div>') + '</div>';
  }
  function rBranches(range) {
    const br = F.branchPL(S.books, range);
    const cols = br.rows;
    const row = (label, f, bold, neg) => '<tr><td>' + (bold ? '<b>' + label + '</b>' : label) + '</td>' + cols.map((c) => tdn((bold ? '<b>' : '') + tl(f(c.pl)) + (bold ? '</b>' : ''), neg && f(c.pl) ? 'neg' : '')).join('') + tdn('<b>' + tl(f(br.total)) + '</b>') + '</tr>';
    const cats = [...new Set(cols.flatMap((c) => c.pl.categories.map((x) => x.id)))];
    return card('Şube kâr / zararı', '<div class="tbl"><table><thead><tr><th>Kalem</th>' + cols.map((c) => '<th class="num">' + esc(c.branch.label) + '</th>').join('') + '<th class="num">Toplam</th></tr></thead><tbody>' +
      row('Net satışlar', (p) => p.sales, true) + row('Satılan malın maliyeti', (p) => -p.cogs, false, true) + row('Brüt kâr', (p) => p.grossProfit, true) +
      cats.map((id) => row(esc(catLabel(id)), (p) => -(p.categories.find((x) => x.id === id)?.amount || 0), false, true)).join('') +
      row('Diğer gelir', (p) => p.otherIncome) + '</tbody><tfoot>' + row('Sonuç', (p) => p.result, true) + '</tfoot></table></div>', { sub: 'E-ticaret ayrı şube: online satışlar, sosyal medya ve ajans giderleri burada. Merkez ortak giderleri şubelere dağıtılmaz (dağıtım anahtarı sonraki adım).' });
  }
  function rBudget() {
    const r = S.report;
    const rep = F.budgetReport(S.books, { period: r.period, branchId: r.budgetBranch });
    return '<form data-form="budget">' + '<div class="row" style="margin-bottom:12px">' + field('Ay', input('period', r.period, 'type="month" data-rerender-budget')) + field('Şube', select('budgetBranch', branchOptions(true), r.budgetBranch, 'data-rerender-budget')) + btn('budget-copy', 'Önceki aydan kopyala', { cls: 'small' }) + '</div>' +
      card('Bütçe · ' + monthTR(r.period) + (r.budgetBranch ? ' · ' + esc(branchLabel(r.budgetBranch)) : ''), table(['Kalem', '#Plan (TL)', '#Fiili', '#Sapma', 'Durum'], rep.rows.map((x) => {
        const pace = x.plan ? x.actual / (x.plan * rep.elapsed || 1) : 0;
        const bad = x.income ? x.variance < 0 && rep.elapsed >= 1 : x.variance < 0;
        return '<tr>' + td('<b>' + esc(x.label) + '</b>', x.income ? 'Gelir' : '') + '<td class="num"><input name="b_' + x.key + '" value="' + esc(formatInput(x.plan)) + '" inputmode="decimal" style="width:130px;text-align:right"></td>' + tdn(tl(x.actual)) + tdn(x.plan ? tl(x.variance) : '—', x.plan ? (bad ? 'neg' : 'pos') : '') + td(x.plan ? (bad ? tag(x.income ? 'Hedefin altında' : 'Aşıldı', 'bad') : x.income && pace < 0.9 ? tag('Hedefin gerisinde', 'warn') : tag('Yolunda', 'ok')) : '') + '</tr>';
      }), { foot: '<tr><td>Plan sonucu / fiili sonuç</td>' + tdn(tl(rep.planResult)) + tdn(tl(rep.actualResult)) + '<td colspan="2"></td></tr>' }) + '<div id="bud-error" class="error"></div><div class="savebar"><span>Ayın %' + Math.round(rep.elapsed * 100) + '’i geçti. Gelir için sapma = fiili − plan; gider için plan − fiili (eksi = bütçe aşıldı).</span><button class="primary" type="submit">Bütçeyi kaydet</button></div>', { sub: 'Fiili rakamlar kâr / zarar raporuyla aynı fişlerden gelir.' }) + '</form>';
  }
  function rCF(range) {
    const cf = F.cashFlow(S.books, range);
    return card('Nakit akışı (doğrudan yöntem, yönetim amaçlı)', '<div class="bridge"><div><i></i><span>Dönem başı kasa + banka</span><b class="num">' + tl(cf.opening) + '</b></div>' + Object.entries(F.CF_LABELS).map(([k, l]) => '<div><i>±</i><span>' + l + '<small class="sub">Giriş ' + tl(cf.classes[k].in) + ' · Çıkış ' + tl(cf.classes[k].out) + '</small></span><b class="num ' + (cf.classes[k].in - cf.classes[k].out < 0 ? 'neg' : '') + '">' + tl(cf.classes[k].in - cf.classes[k].out) + '</b></div>').join('') + '<div><i>=</i><span>Dönem sonu kasa + banka ' + (cf.balanced ? tag('Bakiye ile tutarlı', 'ok') : tag('Tutarsız', 'bad')) + '</span><b class="num">' + tl(cf.closing) + '</b></div></div><p class="note">Faiz ödemeleri ve şahsi/ortak ödemeleri finansman olarak gösterilir. Resmî eşleme işletmenin raporlama esasına göre muhasebeciyle doğrulanır.</p>');
  }
  function rTB(range) {
    const tb = F.trialBalance(S.books, range.to);
    return card('Yönetim mizanı · ' + dateTR(range.to, { year: true }), table(['Kod', 'Hesap', '#Borç', '#Alacak', '#Borç bakiye', '#Alacak bakiye'], tb.rows.map((r) => '<tr><td class="small muted">' + esc(r.code) + '</td>' + td(esc(r.label)) + tdn(tl(r.debit)) + tdn(tl(r.credit)) + tdn(r.debit > r.credit ? tl(r.debit - r.credit) : '') + tdn(r.credit > r.debit ? tl(r.credit - r.debit) : '') + '</tr>'), { foot: '<tr><td colspan="2">Toplam ' + (tb.debit === tb.credit ? tag('Dengeli', 'ok') : tag('Dengesiz', 'bad')) + '</td>' + tdn(tl(tb.debit)) + tdn(tl(tb.credit)) + '<td colspan="2"></td></tr>' }), { sub: 'Hesap kodları TDHP önerisidir; resmî hesap planı muhasebeciyle netleşir.' });
  }
  function rJournal(range) {
    const es = S.books.entries.filter((e) => e.date >= range.from && e.date <= range.to).slice().reverse();
    return card('Yevmiye (fiş listesi)', es.length ? es.map((e) => '<details class="fis"><summary><span>' + dateTR(e.date, { year: true }) + '</span><span>' + esc(e.memo) + (e.kind === 'reversal' ? ' ' + tag('Ters kayıt', 'warn') : '') + '</span><b class="num">' + tl(e.lines.reduce((s, l) => s + l.debit, 0)) + '</b></summary>' + journalTable(e) + '</details>').join('') : '<div class="empty">Bu aralıkta fiş yok.</div>', { sub: es.length + ' fiş · silme yoktur, düzeltmeler ters kayıtla yapılır.' });
  }
  function reportCSV(tab) {
    const r = S.report;
    const range = { from: r.from, to: r.to > today() ? today() : r.to };
    const b = S.books;
    const a = H.csvAmount;
    let rows;
    if (tab === 'payments') rows = [['Tarih', 'Kime', 'Ne için', 'Şekil', 'Tutar'], ...F.paymentReport(b, range).rows.map((x) => [x.date, x.party, x.label, method(x.method), a(x.amount)])];
    else if (tab === 'cash') rows = [['Tarih', 'Hesap', 'Açıklama', 'Sınıf', 'Tutar'], ...F.cashReport(b, range).rows.map((x) => [x.date, x.account, x.memo, F.CF_LABELS[x.cf], a(x.amount)])];
    else if (tab === 'pl') {
      const pl = F.profitAndLoss(b, range);
      rows = [['Kod', 'Kalem', 'Grup', 'Tutar'], ['600', 'Net satışlar', '', a(pl.sales)], ...pl.categories.map((c) => [c.code, c.label, F.PL_GROUPS[c.pl], a(c.amount)]), ['', 'Sonuç', '', a(pl.result)]];
    } else if (tab === 'tb') rows = [['Kod', 'Hesap', 'Borç', 'Alacak'], ...F.trialBalance(b, range.to).rows.map((x) => [x.code, x.label, a(x.debit), a(x.credit)])];
    else rows = [['Tarih', 'Fiş', 'Açıklama', 'Kod', 'Hesap', 'Cari', 'Borç', 'Alacak'], ...b.entries.filter((e) => e.date >= range.from && e.date <= range.to).flatMap((e) => e.lines.map((l) => [e.date, e.key, e.memo, F.accountInfo(b, l.account).code, F.accountInfo(b, l.account).label, l.party ? partyLabel(l.party) : '', a(l.debit), a(l.credit)]))];
    const url = URL.createObjectURL(new Blob([H.toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kuzmos-' + (tab === 'compare' ? 'journal' : tab) + '-' + range.from + '_' + range.to + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ───────────────────────── Kapanış ─────────────────────────
  function closing() {
    const b = S.books;
    const cc = F.closingChecks(b);
    return head('Dönem kapanışı', 'Kapanış öncesi kontroller. Kilitli döneme kayıt yapılamaz; düzeltme açık dönemde ters kayıtla yapılır.') +
      '<div class="grid2">' + card('Kontrol listesi', '<div class="checks">' + cc.checks.map((c) => '<div><span class="ck ' + (c.info ? 'info' : c.ok ? 'ok' : 'no') + '">' + (c.info ? 'i' : c.ok ? '✓' : '!') + '</span><span>' + esc(c.label) + '<small class="sub">' + esc(c.detail) + '</small></span>' + (c.link && !c.ok ? btn(c.link === 'reconcile' ? 'reconcile-go' : 'fin', 'Git →', { cls: 'ghost', data: { v: c.link } }) : '<span></span>') + '</div>').join('') + '</div>', { sub: cc.ready ? 'Kapanışa hazır.' : 'Eksikler giderilmeden kilitlemeniz önerilmez.' }) +
      '<div><form data-form="lock">' + card('Dönem kilidi', '<div class="pad form">' + field('Bu tarih dahil kilitle', input('date', b.lockDate || F.addDays(today().slice(0, 7) + '-01', -1), 'type="date" max="' + today() + '"')) + '<div class="small muted" style="align-self:end">Mevcut kilit: <b>' + (b.lockDate ? dateTR(b.lockDate, { year: true }) : 'yok') + '</b></div></div><div id="lock-error" class="error"></div><div class="savebar"><span>Kilit geri alınamaz (prototip).</span><button type="submit"' + (cc.ready ? ' class="primary"' : '') + '>Kilitle</button></div>') + '</form>' +
      card('Mutabakat geçmişi', table(['Tarih', 'Hesap', '#Ekstre', '#Sistem', '#Fark'], [...b.reconciliations].reverse().map((r) => '<tr>' + td(dateTR(r.date)) + td(esc(accLabel(r.accountId))) + tdn(tl(r.statementBalance)) + tdn(tl(r.system)) + tdn(r.difference ? tl(r.difference) : '✓', r.difference ? 'neg' : 'pos') + '</tr>'), { empty: 'Mutabakat yok.' }), { actions: btn('reconcile-go', 'Mutabakat yap', { cls: 'small' }) }) +
      card('İşlem günlüğü (bu oturum)', b.audit.length ? '<div class="list">' + b.audit.slice(-12).reverse().map((x) => '<div><span>' + esc(x.action) + '<small>' + esc(x.ref) + (x.note ? ' · ' + esc(x.note) : '') + '</small></span><span class="small muted">' + dateTR(x.at) + '</span></div>').join('') + '</div>' : '<div class="empty">Bu oturumda işlem yok.</div>') + '</div></div>';
  }

  // ───────────────────────── Tanımlar ─────────────────────────
  function defs() {
    const b = S.books;
    const tabs = [['parties', 'Firmalar / kişiler'], ['categories', 'Gider kategorileri'], ['accounts', 'Banka / kasa / kart / POS'], ['branches', 'Şubeler'], ['templates', 'Tekrarlayan ödemeler']];
    const col = S.defs;
    const rows = { parties: b.parties, categories: b.categories, accounts: b.accounts, templates: b.templates, branches: b.branches }[col];
    const item = rows.find((x) => x.id === S.editDef);
    let form = '';
    if (col === 'parties') form = field('Ad *', input('label', item?.label || '', 'maxlength="100" required')) + (item ? field('Tür', '<input readonly value="' + esc(F.PARTY_TYPES[item.type]) + '">') : field('Tür *', select('type', Object.entries(F.PARTY_TYPES).filter(([k]) => !['public', 'staff'].includes(k)), 'supplier'))) + field('VKN / TCKN', input('taxNo', item?.taxNo || '', 'maxlength="11" inputmode="numeric"')) + field('Varsayılan gider kategorisi', select('defaultCategory', [['', '—'], ...b.categories.filter((c) => c.active).map((c) => [c.id, c.label])], item?.defaultCategory || ''));
    if (col === 'categories') form = field('Ad *', input('label', item?.label || '', 'maxlength="100" required')) + (item ? field('Grup', '<input readonly value="' + esc(F.PL_GROUPS[item.pl]) + '">') : field('Gelir tablosu grubu *', select('pl', Object.entries(F.PL_GROUPS), 'opex')));
    if (col === 'accounts') form = field('Ad *', input('label', item?.label || '', 'maxlength="100" required')) + (item ? field('Tür', '<input readonly value="' + esc(F.MONEY_KINDS[item.kind]) + '">') : field('Hesap türü *', select('kind', Object.entries(F.MONEY_KINDS), 'bank'))) + field('IBAN / kart son 4', input('iban', item?.iban || '', 'maxlength="40"')) + (!item || ['card', 'bank'].includes(item.kind) ? field('Kart / KMH limiti', money('limit', formatInput(item?.limit || 0)), { hint: 'Banka için KMH limiti: hesap bu kadar eksiye düşebilir' }) : '') +
      (item?.kind === 'pos' ? '<fieldset class="wide"><legend>POS ayarları</legend><div class="form three">' + field('Hesaba geçtiği banka', select('posBank', [['', '—'], ...activeAccounts(['bank']).map((a) => [a.id, a.label])], item.pos?.bankId || '')) + field('Valör (gün)', input('settleDays', String(item.pos?.settleDays ?? 1), 'type="number" min="0" max="60"')) + '<label class="f" style="flex-direction:row;align-items:center;gap:8px;color:var(--text)"><input type="checkbox" name="auto" value="1" style="width:auto"' + (item.pos?.auto ? ' checked' : '') + '> Otomatik hesapla (orana göre bankaya aktar)</label>' + Array.from({ length: 12 }, (_, i) => field((i ? i + 1 + ' taksit' : 'Tek çekim') + ' komisyon %', input('rate' + (i + 1), pctText(item.pos?.rates?.[i + 1]), 'inputmode="decimal" placeholder="—"'))).join('') + '</div><p class="small muted" style="margin-top:8px">Oran boşsa o taksit için tahmin yapılmaz. Otomatik kapalıyken komisyon her zaman ekstreden elle girilir; oranlar sadece kontrol amaçlıdır.</p></fieldset>' : '');
    if (col === 'branches') form = field('Ad *', input('label', item?.label || '', 'maxlength="100" required')) + (item ? field('Tür', '<input readonly value="' + esc(F.BRANCH_KINDS[item.kind]) + '">') : field('Tür *', select('kind', Object.entries(F.BRANCH_KINDS), 'store'))) + field('Bu şubeye yazılacak satış temsilcileri', input('sellers', (item?.sellers || []).join(', '), 'maxlength="200" placeholder="Örn. Fahri Can, İnternet"'), { hint: 'Föydeki temsilci adı bunlardan birini içeriyorsa satış bu şubeye yazılır' }) + field('Stok hangi depodan düşsün', select('stockFrom', [['', 'Kendi deposu'], ...b.branches.filter((x) => x.id !== item?.id).map((x) => [x.id, x.label])], item?.stockFrom || '')) + field('Nakit kasası', select('cashAccount', [['', '—'], ...activeAccounts(['cash']).map((a) => [a.id, a.label])], item?.cashAccount || ''));
    if (col === 'templates') form = field('Ad *', input('label', item?.label || '', 'maxlength="100" required')) + field('Firma *', select('partyId', [['', 'Seçiniz…'], ...partiesOf(['service', 'supplier', 'landlord', 'personal']).map((p) => [p.id, p.label])], item?.partyId || '')) + field('Kategori *', select('categoryId', b.categories.filter((c) => c.active).map((c) => [c.id, c.label]), item?.categoryId || 'rent')) + field('Ayın günü (1–28) *', input('day', item?.day || '5', 'type="number" min="1" max="28"')) + field('Tahmini tutar *', money('amount', formatInput(item?.amount || 0)));
    const typeOf = (x) => (col === 'parties' ? F.PARTY_TYPES[x.type] : col === 'categories' ? F.PL_GROUPS[x.pl] + (x.code ? ' · ' + x.code : '') : col === 'accounts' ? F.MONEY_KINDS[x.kind] + (x.kind === 'pos' ? ' · ' + (x.pos?.auto ? 'otomatik' : 'elle') + (Object.keys(x.pos?.rates || {}).length ? ' · ' + Object.keys(x.pos.rates).length + ' oran' : '') : x.limit ? ' · limit ' + tl(x.limit) : '') : col === 'branches' ? F.BRANCH_KINDS[x.kind] + (x.sellers?.length ? ' · temsilci: ' + x.sellers.join(', ') : '') + (x.stockFrom ? ' · stok: ' + branchLabel(x.stockFrom) : '') : partyLabel(x.partyId) + ' · her ayın ' + x.day + '’i · ' + tl(x.amount));
    return head('Tanımlar', 'Listeye ekleyin, yeniden adlandırın veya pasife alın. Kullanılmış tanımlar silinmez; geçmiş kayıtlardaki ad ve davranış korunur.') + chips('defs-tab', tabs, col) +
      '<div class="grid2">' + card(tabs.find((t) => t[0] === col)[1], table(['Ad', 'Tür / ayrıntı', 'Durum', ''], rows.map((x) => '<tr>' + td('<b>' + esc(x.label) + '</b>', x.system ? 'Sistem tanımı' : x.iban ? esc(x.iban) : '') + td(esc(typeOf(x))) + td(tag(x.active ? 'Aktif' : 'Pasif', x.active ? 'ok' : '')) + '<td class="num">' + (!x.system ? btn('def-edit', 'Düzenle', { cls: 'small', data: { id: x.id } }) + ' ' + btn('def-toggle', x.active ? 'Pasife al' : 'Aktifleştir', { cls: 'small', data: { id: x.id } }) : '') + '</td></tr>')), { actions: col === 'templates' ? btn('gen-recurring', 'Gelecek ayın planlarını üret', { cls: 'small primary' }) : '' }) +
      '<form data-form="def">' + card(item ? 'Düzenle: ' + esc(item.label) : 'Yeni ekle', '<div class="pad form">' + form + '</div><div id="def-error" class="error"></div><div class="savebar"><span>' + (col === 'templates' ? 'Tekrarlayan ödemeler belge değildir; her ay “belgesi beklenen plan” üretir.' : 'Tür ve muhasebe davranışı sonradan değiştirilemez.') + '</span>' + (item ? btn('def-cancel', 'Vazgeç', { cls: 'small' }) : '') + '<button class="primary" type="submit">' + (item ? 'Kaydet' : 'Ekle') + '</button></div>') + '</form></div>';
  }

  // ───────────────────────── Yönetici paneli ─────────────────────────
  function managerScreen() {
    const b = S.books;
    const month = today().slice(0, 7);
    const pl = F.profitAndLoss(b, { from: month + '-01', to: today() });
    const pj = F.projection(b, 30);
    const cash = F.moneyBalances(b).filter((a) => ['bank', 'cash'].includes(a.kind)).reduce((s, a) => s + a.balance, 0);
    const open = F.openItems(b);
    const low = S.stock.items.filter((x) => x.qty - x.reserved <= 2);
    return head('Mağazanın gündemi', dateTR(today(), { year: true, weekday: true }) + ' · Damla Kuz Optik · Atrium', btn('panel', 'Kullanıcılar & roller', { data: { v: 'users' } }) + btn('go-fin', 'Finansa git →', { cls: 'primary', data: { v: 'overview' } })) +
      '<div class="kpis">' + kpi('Bu ay net satış', tl(pl.sales), 'KDV hariç, teslim edilen', 'hl') + kpi('Brüt kâr', tl(pl.grossProfit), pl.sales ? '%' + ((pl.grossProfit / pl.sales) * 100).toFixed(1) + ' · SMM ' + tl(pl.cogs) : '') + kpi('Bu ay gider', tl(pl.expenses), 'Belgeye göre (stok alımı hariç)') + kpi('30 gün sonra tahmini', tl(pj.end), 'En düşük ' + tl(pj.min.balance), pj.min.balance < 0 ? 'bad' : '') + '</div>' +
      '<div class="grid2">' + card('Nakit projeksiyonu', projectionChart(pj), { actions: btn('go-fin', 'Takvim →', { cls: 'ghost', data: { v: 'calendar' } }) }) +
      card('Yaklaşan ödemeler', '<div class="list">' + open.slice(0, 7).map((o) => '<div><span><b>' + esc(o.partyLabel) + '</b><small>' + dateTR(o.plan?.date || o.due) + ' · ' + esc(kindLabel(o.kind)) + '</small></span><span class="row"><b class="num">' + tl(o.remaining) + '</b>' + tag(o.status, statusTone(o.status)) + '</span></div>').join('') + '</div>', { actions: btn('go-fin', 'Ödemeler →', { cls: 'ghost', data: { v: 'payables' } }) }) + '</div>' +
      card('Şubeler · ' + monthTR(month), '<div class="three" style="padding:14px 16px 0">' + F.branchPL(b, { from: month + '-01', to: today() }).rows.map((r) => '<div><small>' + esc(r.branch.label) + '</small><strong class="' + (r.pl.result < 0 ? 'neg' : '') + '">' + tl(r.pl.result) + '</strong><p>Satış ' + tl(r.pl.sales) + ' · brüt kâr ' + tl(r.pl.grossProfit) + ' · gider ' + tl(r.pl.expenses) + '</p></div>').join('') + '</div>', { actions: btn('go-report', 'Şube raporu →', { cls: 'ghost' }) }) +
      '<div class="grid2e">' + card('Stok özeti', table(['Ürün', 'SKU', '#Stok', '#Rezerve', '#Satılabilir'], S.stock.items.map((x) => '<tr>' + td(esc(x.brand + ' ' + x.model), esc([x.color, x.power].filter(Boolean).join(' · '))) + td(esc(x.sku)) + tdn(x.qty) + tdn(x.reserved) + tdn(x.qty - x.reserved, x.qty - x.reserved <= 2 ? 'neg' : '') + '</tr>')), { sub: low.length ? low.length + ' üründe satılabilir stok 2 veya altında.' : 'Kritik stok yok.' }) +
      card('Kim neyi görür?', '<div class="list"><div><span><b>Satış personeli</b><small>Sipariş föyü, müşteri, satılabilir stok</small></span>' + tag('Finans yok', '') + '</div><div><span><b>Muhasebeci</b><small>Belgeler, ödemeler, cariler, banka, raporlar, kapanış</small></span>' + tag('Reçete yok', '') + '</div><div><span><b>Yönetici</b><small>Tüm paneller, tanımlar, stok girişi, kullanıcılar</small></span>' + tag('Tam', 'ok') + '</div></div><p class="note">Demo rol seçimi yalnızca ekranı değiştirir; canlıda yetki sunucuda (Supabase RLS) uygulanır.</p>') + '</div>';
  }
  function usersScreen() {
    return head('Kullanıcılar & roller', 'Davet taslağıdır. Gerçek hesap açmaz, e-posta göndermez; Supabase Auth bağlantısı bekleniyor.', btn('panel', '← Yönetici', { data: { v: 'manager' } })) +
      '<div class="grid2"><form data-form="user">' + card('Kullanıcı davet taslağı', '<div class="pad form">' + field('Ad soyad *', input('name', '', 'required maxlength="80"')) + field('E-posta *', input('email', '', 'type="email" required maxlength="120"')) + field('Rol', select('role', Object.entries(H.ROLE_LABELS), 'staff')) + '</div><div id="user-error" class="error"></div><div class="savebar"><span>Taslak yalnızca bu oturumda tutulur.</span><button class="primary" type="submit">Taslağa ekle</button></div>') + '</form>' +
      card('Davet taslakları', S.users.length ? '<div class="list">' + S.users.map((u) => '<div><span>' + esc(u.name) + '<small>' + esc(u.email) + '</small></span>' + tag(H.ROLE_LABELS[u.role] + ' · davet edilmedi', 'warn') + '</div>').join('') + '</div>' : '<div class="empty">Taslak yok.</div>') + '</div>';
  }

  // ───────────────────────── Personel (korunan föy + barkod köprüsü) ─────────────────────────
  function staffScreen() {
    const v = S.staffView;
    return head('Personel · Sipariş föyü', 'Kaynak form korunur. Föy kaydedildiğinde tahsilat ve teslim finansa işlenir; barkod ürün satırına bağlanır.', '<div class="seg">' + btn('staff-view', 'Sipariş föyü', { data: { v: 'form' }, pressed: v === 'form' }) + btn('staff-view', 'Kasa & masraf', { data: { v: 'kasa' }, pressed: v === 'kasa' }) + '</div>') +
      (v === 'kasa' ? staffKasa() :
        '<form class="scan" data-form="staff-scan"><input name="barcode" aria-label="Sipariş için barkod" value="' + esc(S.staff.barcode) + '" placeholder="Ürün barkodu okutun"><button type="submit" class="primary">Ürün satırına ekle</button></form>' +
        '<div id="staff-sync">' + (S.staff.notice ? '<div class="callout ' + (S.staff.notice.kind === 'err' ? 'bad' : '') + '">' + esc(S.staff.notice.text) + '</div>' : '') + '</div>' +
        (S.staff.product ? '<div class="callout">' + esc(S.staff.product.urun) + ' · ' + esc(S.staff.product.sku) + ' · ' + esc(S.staff.product.fiyat) + ' TL · Satılabilir ' + S.staff.product.available + '</div>' : '') +
        '<iframe class="staff-frame" title="Kaynak personel sipariş formu" sandbox="allow-scripts allow-modals"></iframe>');
  }
  function staffKasa() {
    const b = S.books;
    const br = b.branches.find((x) => x.id === F.defaultBranch(b));
    const cashId = br?.cashAccount || 'cash-store';
    const bal = F.balance(b, cashId);
    const recent = b.documents.filter((d) => d.enteredBy && d.partyId === 'perakende').slice(-10).reverse();
    const counts = b.cashCounts.filter((x) => x.accountId === cashId).slice(-5).reverse();
    const todayCount = b.cashCounts.find((x) => x.accountId === cashId && x.date === today());
    const pd = S.petty;
    const cats = F.STAFF_EXPENSE_CATEGORIES.map((id) => [id, catLabel(id)]);
    return '<div class="kpis">' + kpi('Kasada olması gereken', tl(bal), esc(accLabel(cashId)), 'hl') + kpi('Bugünkü masraflar', tl(recent.filter((d) => d.date === today()).reduce((s, d) => s + d.total, 0)), recent.filter((d) => d.date === today()).length + ' fiş') + kpi('Son sayım', counts[0] ? tl(counts[0].counted) : '—', counts[0] ? dateTR(counts[0].date) + (counts[0].diff ? ' · fark ' + tl(counts[0].diff) : ' · fark yok') : 'Sayım yok') + kpi('Bugünkü tahsilat (nakit)', tl(b.collections.filter((c) => c.accountId === cashId && c.date === today()).reduce((s, c) => s + c.gross, 0)), 'Föyden gelen') + '</div>' +
      '<div class="grid2e"><form data-form="petty">' + card('Kasadan masraf', '<div class="pad form">' + field('Tutar (KDV dahil) *', money('amount', pd.amount || '')) + field('Ne için? *', select('categoryId', [['', 'Seçiniz…'], ...cats], pd.categoryId || '')) + field('Açıklama *', input('note', pd.note || '', 'maxlength="120" placeholder="Örn. temizlik malzemesi, kurye, çay-şeker"'), { wide: true }) + field('Kim girdi?', select('by', ['Sema', 'Erdoğan', 'Şuayip', 'Nursu', 'Fahri Can'].map((x) => [x, x]), pd.by || 'Sema')) + '<label class="f" style="flex-direction:row;align-items:center;gap:8px;color:var(--text)"><input type="checkbox" name="hasReceipt" value="1" style="width:auto"' + (pd.hasReceipt ? ' checked' : '') + '> Fiş / fatura var</label><div class="wide">' + attachList('petty', pd.attachments) + '</div></div><div id="petty-error" class="error"></div><div class="savebar"><span>Para kasadan şimdi çıkar. Muhasebe kategoriyi kontrol edip onaylar.</span><button class="primary" type="submit">Masrafı kaydet</button></div>', { sub: 'Yalnızca mağaza içi küçük masraflar. Tedarikçi / fatura ödemeleri muhasebeden yapılır.' }) + '</form>' +
      '<form data-form="cashcount">' + card('Gün sonu kasa sayımı', '<div class="pad form">' + field('Bankaya yatırılan', money('deposit', '')) + field('Yatırılan banka', select('bankId', activeAccounts(['bank']).map((a) => [a.id, a.label]), 'bank-is')) + field('Sayılan nakit (yatırdıktan sonra) *', money('counted', '')) + field('Sayan', select('by', ['Sema', 'Erdoğan', 'Şuayip', 'Nursu', 'Fahri Can'].map((x) => [x, x]), 'Sema')) + field('Not', input('note', '', 'maxlength="80"'), { wide: true }) + '</div><div id="count-error" class="error"></div><div class="savebar"><span>' + (todayCount ? 'Bugün sayım yapıldı (' + tl(todayCount.counted) + ').' : 'Sistem kasası, yatırılan tutar düşülerek karşılaştırılır. Açık incelemeye, fazla “kasa fazlası”na yazılır.') + '</span><button class="primary" type="submit"' + (todayCount ? ' disabled' : '') + '>Sayımı kaydet</button></div>') + '</form></div>' +
      '<div class="grid2e">' + card('Son masraflar', table(['Tarih', 'Giren', 'Açıklama', '#Tutar', 'Durum'], recent.map((d) => '<tr>' + td(dateTR(d.date)) + td(esc(d.enteredBy)) + td(esc(d.note), attachLinks(d.attachments)) + tdn(tl(d.total)) + td(d.pending ? tag('Onay bekliyor', 'warn') : tag('Onaylandı', 'ok')) + '</tr>'), { empty: 'Masraf yok.' })) +
      card('Son sayımlar', table(['Tarih', 'Sayan', '#Sayılan', '#Sistem', '#Fark', '#Bankaya'], counts.map((x) => '<tr>' + td(dateTR(x.date)) + td(esc(x.by)) + tdn(tl(x.counted)) + tdn(tl(x.system)) + tdn(x.diff ? tl(x.diff) : '✓', x.diff < 0 ? 'neg' : x.diff > 0 ? 'pos' : '') + tdn(x.deposit ? tl(x.deposit) : '—') + '</tr>'), { empty: 'Sayım yok.' })) + '</div>';
  }
  function bridgeScript(nonce) {
    return '<script>(function(){const token=' + JSON.stringify(nonce) + ';window.addEventListener("message",function(e){if(e.source!==parent||!e.data||e.data.type!=="kuzmos-add-product"||e.data.nonce!==token)return;const p=e.data.product;if(!p||!["urun","ekartman","kopru","kol","kategori","fiyat","sku"].every(k=>typeof p[k]==="string"&&p[k].length<200))return;let row=[...document.querySelectorAll("#productRows .product-row")].find(r=>!r.querySelector("input").value.trim());if(!row){addProductRow();row=document.querySelector("#productRows .product-row:last-child")}const inputs=row.querySelectorAll("input");[p.urun,"1",p.ekartman,p.kopru,p.kol,p.kategori,p.fiyat].forEach((v,i)=>{if(inputs[i])inputs[i].value=v});row.dataset.kuzmosSku=p.sku;calcSubtotal();parent.postMessage({type:"kuzmos-product-added",nonce:token,sku:p.sku},"*")});try{var _save=saveRecordToServer;saveRecordToServer=function(rec,onOk){try{var skus={};document.querySelectorAll("#productRows .product-row").forEach(function(r){var i=r.querySelector("input");if(r.dataset.kuzmosSku&&i)skus[i.value.trim()]=r.dataset.kuzmosSku});var pays=getPayments(rec).map(function(p){return{amount:Math.round(parseTRMoney(p.tutar)*100),date:String(p.tarih||rec.siparisTarihi||""),method:p.yontem==="kk"?"card":"cash",detail:String(p.ccDetail||"")}});var lines=(rec.products||[]).map(function(p){var v=getCatVAT(p.kategori);return{label:String(p.urun||""),qty:parseInt(p.adet,10)||1,unitPrice:Math.round(parseTRMoney(p.fiyat)*100),vatRate:v===null?-1:v,category:String(p.kategori||""),sku:skus[String(p.urun||"").trim()]||""}});parent.postMessage({type:"kuzmos-order-saved",nonce:token,order:{id:String(rec.id),no:String(rec.no||""),date:String(rec.siparisTarihi||""),customer:String(rec.adSoyad||""),seller:String(rec.satisTem||""),total:Math.round(parseTRMoney(rec.tutar)*100),lines:lines,payments:pays,delivered:rec.siparisDurumu==="Teslim Edildi",deliveredOn:String(rec.teslimTarihi||"")}},"*")}catch(err){parent.postMessage({type:"kuzmos-order-error",nonce:token,message:String(err&&err.message||err)},"*")}return _save(rec,onOk)}}catch(e){}parent.postMessage({type:"kuzmos-staff-ready",nonce:token},"*")})();<\/script>';
  }
  function mountStaffFrame() {
    const f = main.querySelector('iframe.staff-frame');
    if (!f) return;
    S.staff.frame = f;
    S.staff.nonce = 'kz-' + Math.random().toString(36).slice(2);
    f.srcdoc = ORIGINAL_FORM.replace('</body>', bridgeScript(S.staff.nonce) + '</body>');
  }
  function sendStaffProduct() {
    const s = S.staff;
    if (s.ready && s.frame && s.pending) {
      s.frame.contentWindow.postMessage({ type: 'kuzmos-add-product', nonce: s.nonce, product: s.pending }, '*');
      s.pending = null;
    }
  }
  window.addEventListener('message', (e) => {
    const s = S.staff;
    if (!s.frame || e.source !== s.frame.contentWindow || e.data?.nonce !== s.nonce) return;
    if (e.data.type === 'kuzmos-staff-ready') {
      s.ready = true;
      sendStaffProduct();
    }
    if (e.data.type === 'kuzmos-order-saved') receiveOrder(e.data.order);
    if (e.data.type === 'kuzmos-order-error') staffNotice('err', 'Föy kaydı finansa aktarılamadı: ' + String(e.data.message).slice(0, 200));
  });
  /** Föyden gelen siparişi finansa işler. Föyün kendi durumunu bozmamak için sayfa yeniden çizilmez. */
  const skuMemory = {};
  function receiveOrder(raw) {
    const o = structuredClone(raw);
    const mem = (skuMemory[o.id] ||= {});
    o.lines.forEach((l) => {
      if (l.sku) mem[l.label] = l.sku;
      else if (mem[l.label]) l.sku = mem[l.label];
    });
    const clamp = (d) => (!d || d > today() ? today() : d);
    o.date = clamp(o.date);
    o.payments.forEach((p) => (p.date = clamp(p.date)));
    o.deliveredOn = o.deliveredOn ? clamp(o.deliveredOn) : '';
    const bad = o.lines.find((l) => l.vatRate < 0);
    if (bad) return staffNotice('err', '“' + bad.label + '” için kategori seçilmemiş; KDV oranı bilinmediği için finansa işlenmedi. Föyde kategoriyi seçip tekrar kaydedin.');
    const next = structuredClone(S.books);
    try {
      const r = F.syncOrder(next, o);
      S.books = next;
      syncStock();
      staffNotice('ok', o.no + ' finansa işlendi: ' + (r.payments ? r.payments + ' yeni tahsilat' : 'yeni tahsilat yok') + (r.delivered ? ' · teslim edildi: hasılat, KDV ve satılan malın maliyeti kaydedildi' : '') + '.');
    } catch (err) {
      staffNotice('err', o.no + ' finansa işlenemedi: ' + friendly(err.message));
    }
  }
  function staffNotice(kind, text) {
    S.staff.notice = { kind, text };
    const box = main.querySelector('#staff-sync');
    if (box) box.innerHTML = '<div class="callout ' + (kind === 'err' ? 'bad' : '') + '">' + esc(text) + '</div>';
  }
  function scanIntoStaff(barcode) {
    const product = I.orderProductFromBarcode(S.stock, barcode, 'Atrium');
    if (product.available <= 0) throw Error('Ürünün satılabilir stoğu yok.');
    S.staff.barcode = barcode;
    S.staff.product = product;
    S.staff.pending = product;
    if (S.panel === 'staff' && S.staff.ready) {
      // Föyü yeniden yüklememek için tam render yapılmaz; yalnızca bilgi şeridi güncellenir.
      sendStaffProduct();
      main.querySelector('.flash')?.remove();
      main.querySelector('.content').insertAdjacentHTML('afterbegin', '<div class="flash" role="status"><span>' + esc(product.urun + ' · ' + product.sku + ' ürün satırına eklendi.') + '</span></div>');
      return;
    }
    S.panel = 'staff';
    render();
  }

  // ───────────────────────── Envanter ─────────────────────────
  function inventoryScreen() {
    const v = S.inv.view;
    const admin = S.role === 'admin';
    if (!admin && ['import', 'manual'].includes(v)) S.inv.view = 'eyewear';
    const rows = S.stock.items.filter((x) => x.kind === S.inv.view);
    const fields = { eyewear: [['brand', 'Marka'], ['model', 'Model'], ['color', 'Renk'], ['colorCode', 'Renk kodu'], ['eyeSize', 'Ekartman'], ['bridge', 'Burun'], ['temple', 'Kol']], opticalLens: [['brand', 'Marka'], ['model', 'Model'], ['power', 'Numara']], contactLens: [['brand', 'Marka'], ['model', 'Model'], ['power', 'Numara'], ['color', 'Renk']] }[S.inv.view];
    return head('Envanter & barkod', 'Barkodla ürünü bulun, siparişe aktarın veya Excel şablonuyla toplu stok girin.', tag('Atrium')) +
      chips('inv-view', [['eyewear', 'Gözlük'], ['opticalLens', 'Cam'], ['contactLens', 'Lens'], ...(admin ? [['import', 'Excel aktarımı'], ['manual', 'Manuel giriş']] : [])], S.inv.view) +
      (S.inv.view === 'manual' ? manualInventory() : S.inv.view === 'import' ? importScreen() :
        '<form class="scan" data-form="inv-scan"><input name="barcode" aria-label="Barkod" placeholder="Barkod okutun / yazın" value="' + esc(rows[0]?.barcode || '') + '"><button type="submit" class="primary">Siparişe aktar</button></form>' +
        card('Ürün varyantları', table([...fields.map(([, l]) => l), 'SKU / barkod', '#Satış fiyatı', ...(S.role === 'admin' ? ['#Ort. maliyet', '#Stok değeri'] : []), '#Stok', '#Rezerve', '#Satılabilir'], rows.map((p) => '<tr>' + fields.map(([k]) => td(esc(p[k]))).join('') + td('<b>' + esc(p.sku) + '</b>', esc(p.barcode)) + tdn(p.price ? tl(p.price) : '—') + (S.role === 'admin' ? tdn(tl(p.cost || 0)) + tdn(tl(F.stockSummary(S.books).filter((r) => r.sku === p.sku).reduce((t, r) => t + r.value, 0))) : '') + tdn(p.qty) + tdn(p.reserved) + tdn(p.qty - p.reserved) + '</tr>')), { sub: '“Siparişe aktar” ürünü personel föyünün ürün satırına ekler: ad/model, ölçüler, kategori ve fiyat dolar.' }));
  }
  function importScreen() {
    const plan = S.inv.importPlan;
    return card('1 · Şablonu indirin ve doldurun', '<div class="pad row">' + btn('dl-template', '⤓ Excel şablonu (.xlsx)', { cls: 'primary' }) + btn('example-import', 'Örnek satırları kontrol et') + '</div><p class="note">EKLE: stoğa ekler. SAYIM: fiziksel stoğu sayım değerine eşitler (rezervin altına inemez). URUN: yalnızca ürün bilgisini günceller. SKU ve barkod metin olmalı.</p>') +
      card('2 · Dosyayı kontrol edin', '<div class="pad">' + field('Excel dosyası (.xlsx)', '<input type="file" accept=".xlsx" data-act-file="upload-xlsx">') + '<p class="small muted" style="margin-top:8px">Yükleme stoğu değiştirmez. Hatalar kontrol edilir; onaydan sonra tek seferde uygulanır.</p></div>') +
      (plan ? card('3 · Kontrol sonucu ve onay', '<div class="pad row">' + tag(plan.errors.length + ' hata', plan.errors.length ? 'bad' : 'ok') + tag(plan.changes.length + ' satır') + tag(plan.applied ? 'Uygulandı' : 'Onay bekliyor', plan.applied ? 'ok' : 'warn') + '</div>' + (plan.errors.length ? '<div class="list">' + plan.errors.map((e) => '<div><span>Satır ' + e.row + '</span><b>' + esc(e.message) + '</b></div>').join('') + '</div>' : '') + table(['SKU', 'İşlem', '#Önce', '#Sonra', '#Fark'], plan.changes.map((c) => '<tr>' + td(esc(c.item.sku)) + td(esc(c.operation)) + tdn(c.before) + tdn(c.after) + tdn(c.after - c.before) + '</tr>')) + '<div class="savebar"><span></span>' + btn('apply-import', plan.applied ? '✓ Stoklar güncellendi' : 'Kontrol edilen satırları uygula', { cls: 'primary', disabled: plan.errors.length || plan.applied }) + '</div>') : '');
  }
  function manualInventory() {
    const k = S.inv.manualKind;
    const glass = k === 'Gozluk', lens = k === 'Lens';
    return '<form data-form="manual-stock">' + card('Manuel ürün / stok girişi', '<div class="pad form three">' + field('Ürün türü', select('urun_turu', [['Gozluk', 'Gözlük'], ['Cam', 'Cam'], ['Lens', 'Lens']], k, 'data-act-change="manual-kind"')) + field('Marka *', input('marka', '', 'required')) + field('Model *', input('model', '', 'required')) + (glass || lens ? field('Renk adı *', input('renk', '', 'required')) : '') + (glass ? field('Renk kodu', input('renk_kodu', '', 'placeholder="Örn. 2000"')) + field('Ekartman *', input('ekartman', '', 'required')) + field('Burun *', input('burun', '', 'required')) + field('Kol boyu *', input('kol_boyu', '', 'required')) : field('Numara *', input('numara', '', 'required placeholder="-1.00"'))) + field('Kategori *', input('kategori', '', 'required')) + field('İç SKU *', input('ic_sku', '', 'required')) + field('Üretici barkodu *', input('uretici_barkodu', '', 'required')) + field('Şube *', input('sube', 'Atrium', 'required')) + field('Adet *', input('adet', '1', 'type="number" min="0" step="1" required')) + field('Satış fiyatı (TL) *', input('birim_fiyat_tl', '', 'type="number" min="0" step="0.01" required')) + field('Birim maliyet (TL, KDV hariç)', input('birim_maliyet_tl', '', 'type="number" min="0" step="0.01"'), { hint: 'EKLE için; boşsa mevcut ortalama maliyet' }) + field('Stok işlemi', select('islem', ['EKLE', 'SAYIM', 'URUN'], 'EKLE')) + field('Belge / referans *', input('referans', '', 'required')) + '</div><div id="stock-error" class="error"></div><div class="savebar"><span>Excel aktarımıyla aynı varyant, barkod, rezerv ve tekrar referans kontrolleri uygulanır.</span><button class="primary" type="submit">Kontrol et ve kaydet</button></div>') + '</form>';
  }
  function downloadTemplate() {
    const bytes = Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Kuzmos_Stok_Aktarim_Sablonu.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ───────────────────────── olaylar ─────────────────────────
  const ACTIONS = {
    panel: (el) => go(el.dataset.v),
    fin: (el) => { S.pay = null; S.plan = null; go('finance', el.dataset.v); },
    'go-fin': (el) => go('finance', el.dataset.v),
    dismiss: () => { S.flash = null; render(); },
    'reset-demo': () => { if (confirm('Demo verisi başlangıç haline dönsün mü?')) { S.books = F.demoBooks(); S.stock = I.inventorySeed(); syncStock(); S.pay = S.plan = S.ret = null; S.doc = newDocDraft('expense'); flash('Demo verisi sıfırlandı.'); render(); } },
    'doc-type': (el) => { S.doc = newDocDraft(el.dataset.v); S.quickParty = false; render(); },
    'doc-new': (el) => { S.doc = newDocDraft(el.dataset.v, el.dataset.party ? { partyId: el.dataset.party } : {}); go('finance', 'new'); },
    'doc-clear': () => resetDoc(),
    'pay-mode': (el) => { syncDoc(); S.doc.payMode = el.dataset.v; render(); },
    'quick-party': () => { syncDoc(); S.quickParty = !S.quickParty; render(); },
    'quick-party-save': () => {
      syncDoc();
      const form = main.querySelector('form[data-form="doc"]');
      const label = form.querySelector('[name=qpLabel]').value, type = form.querySelector('[name=qpType]').value;
      let id;
      if (mutate((b) => (id = F.saveParty(b, { label, type }).id), 'Firma eklendi ve seçildi.', '#doc-error')) {
        S.doc.partyId = id;
        S.quickParty = false;
        render();
      }
    },
    'fill-vat': () => {
      syncDoc();
      const b = S.books;
      Object.assign(S.doc, { outputVat: formatInput(F.balance(b, 'OUTPUT_VAT')), inputVat: formatInput(F.balance(b, 'INPUT_VAT')), carriedVat: formatInput(F.balance(b, 'CARRY_VAT')), amount: formatInput(Math.max(0, F.balance(b, 'OUTPUT_VAT') - F.balance(b, 'INPUT_VAT') - F.balance(b, 'CARRY_VAT'))) });
      render();
    },
    'expected-to-doc': (el) => {
      const x = S.books.expected.find((e) => e.id === el.dataset.id);
      const p = S.books.parties.find((y) => y.id === x.partyId);
      const ui = x.categoryId === 'rent' ? 'rent' : p.type === 'supplier' && !x.categoryId ? 'purchase' : 'expense';
      S.doc = newDocDraft(ui, { partyId: x.partyId, categoryId: x.categoryId || DOC_UI[ui].preset?.categoryId || '', due: x.due, net: formatInput(x.amount), note: x.label, expectedId: x.id, vatRate: ui === 'rent' ? '0' : '20' });
      if (ui === 'rent') S.doc.net = formatInput(Math.round(x.amount / 0.8));
      go('finance', 'new');
    },
    'open-pay': (el) => openPay(el.dataset.id),
    'close-pay': () => { S.pay = null; render(); },
    'open-plan': (el) => openPlan(el.dataset.id),
    'close-plan': () => { S.plan = null; render(); },
    'show-settle': (el) => {
      const o = S.books.obligations.find((x) => x.id === el.dataset.id);
      flash(o.label + ': ' + o.settlements.map((s) => dateTR(s.date) + ' ' + tl(s.amount) + ' (' + (method(s.via) || s.via) + (s.reversed ? ', geri alındı' : '') + ')').join(' · '));
      render();
    },
    'pay-filter': (el) => { S.payFilter = el.dataset.v; render(); },
    'cal-day': (el) => { S.cal.day = el.dataset.v; render(); },
    'cal-month': (el) => { S.cal.month = H.shiftMonth(S.cal.month, Number(el.dataset.v)); S.cal.day = ''; render(); },
    party: (el) => { S.partyId = el.dataset.id; go('finance', 'party'); },
    'apply-adv': (el) => {
      const o = S.books.obligations.find((x) => x.id === el.dataset.id);
      mutate((b) => F.applyAdvance(b, { key: 'ui-adv-' + uid(), partyId: el.dataset.party, obligationId: o.id, amount: Math.min(F.advanceAvailable(b, el.dataset.party), F.remaining(o)) }), 'Avans faturaya mahsup edildi. Nakit hareketi oluşmadı.');
    },
    'reverse-doc': (el) => {
      const reason = prompt('İptal nedeni (zorunlu). Belge silinmez, ters kayıt oluşturulur:');
      if (reason) mutate((b) => F.reverseDocument(b, { docId: el.dataset.id, reason }), 'Belge ters kayıtla iptal edildi.');
    },
    'acc-select': (el) => { S.accountId = el.dataset.v; render(); },
    'acc-action': (el) => { S.accAction = S.accAction === el.dataset.v ? '' : el.dataset.v; render(); },
    'reconcile-go': () => { S.accAction = 'reconcile'; go('finance', 'accounts'); },
    'return-ins': (el) => {
      const reason = prompt('İade / karşılıksız nedeni:');
      if (reason) mutate((b) => F.returnInstrument(b, { key: 'ui-ret-' + uid(), instrumentId: el.dataset.id, reason }), 'Çek / senet iade edildi; firma borcu yeniden açıldı.');
    },
    deliver: (el) => mutate((b) => F.deliverOrder(b, { collectionId: el.dataset.id }), 'Teslim kaydedildi; avans hasılata döndü.'),
    'review-select': (el) => { S.reviewId = el.dataset.id; S.reviewDraft = null; render(); },
    'report-tab': (el) => { S.report.tab = el.dataset.v; render(); },
    'report-preset': (el) => {
      if (el.dataset.v === 'month') Object.assign(S.report, { from: today().slice(0, 7) + '-01', to: today() });
      else Object.assign(S.report, { from: F.addDays(today(), -6), to: today() });
      render();
    },
    csv: (el) => reportCSV(el.dataset.v),
    'defs-tab': (el) => { S.defs = el.dataset.v; S.editDef = ''; render(); },
    'defs-go': (el) => { S.defs = el.dataset.v; S.editDef = ''; go('finance', 'defs'); },
    'def-edit': (el) => { S.editDef = el.dataset.id; render(); },
    'def-cancel': () => { S.editDef = ''; render(); },
    'def-toggle': (el) => mutate((b) => F.toggleDefinition(b, S.defs, el.dataset.id), 'Durum güncellendi. Geçmiş kayıtlar korunur.'),
    'gen-recurring': () => {
      const next = H.shiftMonth(today().slice(0, 7), 1);
      mutate((b) => F.generateRecurring(b, next), (n) => monthTR(next) + ' için ' + n + ' plan üretildi' + (n ? '' : ' (zaten üretilmiş)') + '.');
    },
    'inv-view': (el) => { S.inv.view = el.dataset.v; render(); },
    'dl-template': () => downloadTemplate(),
    'example-import': () => { S.inv.importPlan = I.importPreview(S.stock, I.templateRows()); flash('Örnek satırlar kontrol edildi. Stok henüz değişmedi.'); render(); },
    'apply-import': () => {
      try {
        const plan = S.inv.importPlan;
        const next = structuredClone(S.books);
        postStockPlan(next, plan, {});
        const n = I.applyImport(S.stock, plan);
        S.books = next;
        syncStock();
        flash(n + ' satır uygulandı; stok defteri ve muhasebe stoğu güncellendi. Aynı dosya tekrar stok ekleyemez.');
      } catch (e) {
        flash(friendly(e.message), 'err');
      }
      render();
    },
    'line-add': () => { syncDoc(); S.doc.lines = [...(S.doc.lines || []), { sku: '', label: '', qty: '1', cost: '' }]; render(); },
    'line-del': (el) => { syncDoc(); S.doc.lines.splice(Number(el.dataset.i), 1); collectLines(S.doc); render(); },
    'sched-mode': (el) => { syncDoc(); S.doc.schedMode = el.dataset.v; render(); },
    'attach-del': (el) => {
      const k = el.dataset.kind;
      if (k === 'doc') { syncDoc(); S.doc.attachments = S.doc.attachments.filter((a) => a.id !== el.dataset.id); }
      if (k === 'pay') { Object.assign(S.pay, readForm(main.querySelector('#pay-drawer'))); S.pay.attachments = S.pay.attachments.filter((a) => a.id !== el.dataset.id); }
      if (k === 'petty') { Object.assign(S.petty, readForm(main.querySelector('form[data-form="petty"]'))); S.petty.attachments = S.petty.attachments.filter((a) => a.id !== el.dataset.id); }
      render();
    },
    'deliver-order': (el) => mutate((b) => F.deliverOrderById(b, { orderId: el.dataset.id }), 'Teslim kaydedildi: hasılat, KDV ve satılan malın maliyeti işlendi.'),
    'open-return': (el) => { S.ret = { orderId: el.dataset.id }; render(); main.querySelector('form[data-form="return"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    'close-return': () => { S.ret = null; render(); },
    'pos-auto': (el) => mutate((b) => F.settlePosAuto(b, { key: 'ui-posauto-' + uid(), posId: el.dataset.id }), 'Valörü gelen POS tahsilatları tanımlı oranla bankaya aktarıldı.'),
    'pos-manual': (el) => { S.posPrefill = el.dataset.id; S.accAction = 'pos'; go('finance', 'accounts'); },
    'stock-action': (el) => { S.stockAction = S.stockAction === el.dataset.v ? '' : el.dataset.v; render(); },
    'approve-petty': (el) => mutate((b) => F.approveExpense(b, { docId: el.dataset.id, categoryId: S.pettyCat[el.dataset.id] }), 'Masraf onaylandı.'),
    'budget-copy': () => {
      const prev = H.shiftMonth(S.report.period, -1);
      mutate((b) => F.copyBudget(b, { from: prev, to: S.report.period, branchId: S.report.budgetBranch }), (n) => n ? monthTR(prev) + ' bütçesinden ' + n + ' kalem kopyalandı.' : monthTR(prev) + ' için bütçe yok.');
    },
    'staff-view': (el) => { S.staffView = el.dataset.v; render(); },
    'go-report': () => { S.report.tab = 'branches'; go('finance', 'reports'); },
  };
  /** Excel / manuel stok satırlarını stok defterine işler: EKLE → mal kabul (maliyetle), SAYIM → sayım farkı. */
  function postStockPlan(b, plan, costs) {
    const brId = (label) => (b.branches.find((x) => x.label.toLocaleLowerCase('tr-TR').startsWith(String(label).toLocaleLowerCase('tr-TR'))) || { id: F.defaultBranch(b) }).id;
    for (const c of plan.changes) {
      const br = brId(c.item.branch);
      if (c.operation === 'EKLE' && c.after > c.before) {
        const unit = costs[c.item.sku] || F.avgCost(b, c.item.sku);
        if (!unit) throw Error(c.item.sku + ': yeni ürün için birim maliyet gerekli (Manuel giriş ekranında girin).');
        F.goodsReceipt(b, { key: 'stk-' + uid(), date: today(), branchId: br, lines: [{ sku: c.item.sku, label: [c.item.brand, c.item.model, c.item.color].filter(Boolean).join(' '), qty: c.after - c.before, unitCost: unit }], ref: c.operationKey.split('|').pop() });
      }
      if (c.operation === 'SAYIM') F.stockCount(b, { key: 'cnt-' + uid(), date: today(), sku: c.item.sku, branchId: br, counted: c.after, note: 'Excel / manuel sayım' });
    }
  }
  function syncDoc() {
    const form = main.querySelector('form[data-form="doc"]');
    if (form) S.doc = derive({ ...S.doc, ...readForm(form) });
  }
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el);
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'kz-role') {
      S.role = H.ROLE_PANELS[t.value] ? t.value : 'staff';
      S.panel = H.ROLE_PANELS[S.role][0];
      flash('Demo rolü: ' + H.ROLE_LABELS[S.role] + '. Bu seçim gerçek giriş güvenliği sağlamaz.');
      return render();
    }
    if (t.dataset.actChange === 'pay-kind') { S.payKind = t.value; return render(); }
    if (t.dataset.actChange === 'petty-cat') { S.pettyCat[t.dataset.id] = t.value; return; }
    if (t.hasAttribute('data-rerender-budget')) {
      const v = readForm(t.closest('form'));
      if (/^\d{4}-\d{2}$/.test(v.period)) S.report.period = v.period;
      S.report.budgetBranch = v.budgetBranch;
      return render();
    }
    if (t.dataset.attach) {
      const kind = t.dataset.attach;
      const form = t.closest('form');
      const files = [...t.files];
      const typeOf = (f) => f.type || ({ pdf: 'application/pdf', heic: 'image/heic', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[f.name.split('.').pop().toLowerCase()] || '';
      const metas = files.map((f) => {
        const id = 'ek-' + uid();
        S.files[id] = { url: URL.createObjectURL(f), name: f.name };
        return { id, name: f.name, type: typeOf(f), size: f.size };
      });
      if (kind === 'doc') { syncDoc(); S.doc.attachments = [...(S.doc.attachments || []), ...metas]; }
      if (kind === 'pay') { Object.assign(S.pay, readForm(form)); S.pay.attachments = [...(S.pay.attachments || []), ...metas]; }
      if (kind === 'petty') { Object.assign(S.petty, readForm(form)); S.petty.attachments = [...(S.petty.attachments || []), ...metas]; }
      return render();
    }
    if (t.dataset.actChange === 'manual-kind') { S.inv.manualKind = t.value; return render(); }
    if (t.dataset.actFile === 'upload-xlsx') {
      const file = t.files[0];
      if (!file) return;
      file.arrayBuffer().then((buf) => X.readInventoryXlsx(buf)).then((rows) => { S.inv.importPlan = I.importPreview(S.stock, rows); flash(file.name + ' kontrol edildi. Stok henüz değişmedi.'); render(); }).catch((err) => { flash(err.message, 'err'); render(); });
      return;
    }
    const form = t.closest('form[data-live]');
    if (form && t.hasAttribute('data-rerender')) {
      if (form.dataset.live === 'doc') { syncDoc(); return render(); }
      if (form.dataset.live === 'pay') { Object.assign(S.pay, readForm(form)); const accs = activeAccounts(F.methodKinds(S.pay.method)); if (!accs.some((a) => a.id === S.pay.accountId)) S.pay.accountId = accs[0]?.id || ''; return render(); }
      if (form.dataset.live === 'review') { S.reviewDraft = readForm(form); return render(); }
    }
    if (t.closest('form[data-form="plan"]') && t.hasAttribute('data-rerender')) { Object.assign(S.plan, readForm(t.closest('form'))); return render(); }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.actInput === 'pay-search') {
      S.paySearch = t.value;
      const pos = t.selectionStart;
      render();
      const n = main.querySelector('[data-act-input="pay-search"]');
      n.focus();
      n.setSelectionRange(pos, pos);
      return;
    }
    const form = t.closest('form[data-live]');
    if (!form) return;
    if (form.dataset.live === 'doc') {
      S.doc = derive({ ...S.doc, ...readForm(form) });
      for (const k of ['vat', 'vatWithheld', 'incomeWithheld']) {
        const el = form.querySelector('[name=' + k + ']');
        if (el && el.readOnly) el.value = S.doc[k];
      }
      refreshDocPreview();
    }
    if (form.dataset.live === 'pay') {
      Object.assign(S.pay, readForm(form));
      refreshPayPreview();
    }
  });
  const FORMS = {
    doc: (f) => submitDoc(f),
    pay: (f) => submitPay(f),
    plan: (f) => {
      Object.assign(S.plan, readForm(f));
      if (mutate((b) => F.updatePlan(b, { obligationId: S.plan.obligationId, ...S.plan }), 'Plan güncellendi. Muhasebe kaydı oluşmadı.', '#plan-error')) { S.plan = null; render(); }
    },
    'acc-range': (f) => { const v = readForm(f); if (v.from > v.to) return showError(Error('Başlangıç bitişten sonra olamaz.')); S.accRange = v; render(); },
    transfer: (f) => {
      const v = readForm(f);
      if (mutate((b) => F.transfer(b, { key: 'ui-trf-' + uid(), date: v.date, from: v.from, to: v.to, amount: parseTL(v.amount), note: v.note }), 'Virman kaydedildi. Toplam nakit değişmedi.', '#act-error')) { S.accAction = ''; render(); }
    },
    pos: (f) => {
      const v = readForm(f);
      if (mutate((b) => F.settlePos(b, { key: 'ui-pos-' + uid(), date: v.date, posId: v.posId, bankId: v.bankId, gross: parseTL(v.gross), fee: parseTL(v.fee, { allowEmpty: true }) }), 'POS geçişi kaydedildi.', '#act-error')) { S.accAction = ''; render(); }
    },
    reconcile: (f) => {
      const v = readForm(f);
      let r;
      if (mutate((b) => (r = F.reconcile(b, { accountId: v.accountId, date: v.date, statementBalance: parseTL(v.balance, { allowZero: true }) })), () => (r.difference ? 'Fark var: ekstre ' + tl(r.statementBalance) + ', sistem ' + tl(r.system) + ' (' + tl(r.difference) + '). Eksik kayıtları kontrol edin.' : 'Mutabık: ekstre ve sistem aynı.'), '#act-error')) { S.accAction = ''; render(); }
    },
    collection: (f) => {
      const v = readForm(f);
      mutate((b) => {
        const gross = parseTL(v.gross);
        const rate = Number(v.vatRate);
        return F.recordCollection(b, { key: 'ui-col-' + uid(), date: v.date, accountId: v.accountId, branchId: v.branchId, installments: Number(v.installments) || 1, gross, vat: Math.round((gross * rate) / (100 + rate)), orderNo: v.orderNo, customer: v.customer, delivered: v.delivered === '1' });
      }, (id) => id + ' tahsilatı kaydedildi.', '#col-error');
    },
    review: (f) => {
      const v = readForm(f);
      if (mutate((b) => F.resolveReview(b, { key: 'ui-rvw-' + uid(), reviewId: S.reviewId || F.reviewItems(b).find((r) => r.remaining > 0).id, amount: parseTL(v.amount), target: v.target, categoryId: v.categoryId, partyId: v.partyId, note: v.note }), 'Fark sınıflandırıldı. Yeni nakit hareketi oluşmadı.', '#review-error')) { S.reviewDraft = null; render(); }
    },
    return: (f) => {
      const v = readForm(f);
      const o = S.books.orders.find((x) => x.id === S.ret.orderId);
      const ok = mutate((b) => F.returnOrder(b, { key: 'ui-ret-' + uid(), orderId: o.id, date: v.date, reason: v.reason, restock: v.restock === '1', lines: o.delivered ? o.lines.map((l, i) => ({ index: i, qty: parseInt(v['q' + i], 10) || 0 })).filter((x) => x.qty) : [], refund: v.refund ? { accountId: v.accountId, amount: parseTL(v.refund) } : undefined }), o.delivered ? 'Satış iadesi kaydedildi.' : 'Sipariş iptal edildi; kapora iade edildi.', '#ret-error');
      if (ok) { S.ret = null; render(); }
    },
    receipt: (f) => {
      const v = readForm(f);
      if (mutate((b) => F.goodsReceipt(b, { key: 'ui-grn-' + uid(), date: v.date, partyId: v.partyId, branchId: v.branchId, ref: v.ref, lines: [{ sku: v.sku.trim(), label: v.label, qty: parseInt(v.qty, 10), unitCost: parseTL(v.unitCost, { field: 'Birim maliyet' }) }] }), (id) => id + ' mal kabulü kaydedildi; fatura gelince alış faturasında seçin.', '#stk-error')) { S.stockAction = ''; render(); }
    },
    count: (f) => {
      const v = readForm(f);
      let d = 0;
      if (mutate((b) => (d = F.stockCount(b, { key: 'ui-cnt-' + uid(), date: v.date, sku: v.sku.trim(), branchId: v.branchId, counted: parseInt(v.counted, 10), note: v.note })), () => (d ? 'Sayım farkı ' + (d > 0 ? '+' : '') + d + ' adet kaydedildi.' : 'Sayım sistemle aynı; fark yok.'), '#stk-error')) { S.stockAction = ''; render(); }
    },
    budget: (f) => {
      const v = readForm(f);
      mutate((b) => {
        for (const [k, val] of Object.entries(v)) if (k.startsWith('b_')) F.setBudget(b, { period: S.report.period, branchId: S.report.budgetBranch, key: k.slice(2), amount: parseTL(val, { allowEmpty: true, field: 'Bütçe' }) });
      }, 'Bütçe kaydedildi.', '#bud-error');
    },
    petty: (f) => {
      Object.assign(S.petty, readForm(f));
      const v = S.petty;
      const b0 = S.books;
      const br = b0.branches.find((x) => x.id === F.defaultBranch(b0));
      const ok = mutate((b) => F.pettyExpense(b, { key: 'ui-petty-' + uid(), date: today(), branchId: br.id, accountId: br.cashAccount || 'cash-store', amount: parseTL(v.amount), categoryId: v.categoryId, note: v.note, hasReceipt: v.hasReceipt === '1', attachments: v.attachments, by: v.by }), 'Masraf kaydedildi; kasadan düştü, muhasebe onayına gitti.', '#petty-error');
      if (ok) { S.petty = { attachments: [], by: v.by }; render(); }
    },
    cashcount: (f) => {
      const v = readForm(f);
      const b0 = S.books;
      const br = b0.branches.find((x) => x.id === F.defaultBranch(b0));
      let r;
      mutate((b) => (r = F.cashCount(b, { key: 'ui-cc-' + uid(), date: today(), accountId: br.cashAccount || 'cash-store', counted: parseTL(v.counted, { allowZero: true, field: 'Sayılan nakit' }), deposit: v.deposit ? { bankId: v.bankId, amount: parseTL(v.deposit) } : undefined, note: v.note, by: v.by })), () => (r.diff ? 'Kasa ' + (r.diff < 0 ? 'açığı ' : 'fazlası ') + tl(Math.abs(r.diff)) + ' (sistem ' + tl(r.system) + '). ' + (r.diff < 0 ? 'Muhasebe incelemesine düştü.' : 'Kasa fazlası olarak kaydedildi.') : 'Kasa tuttu: ' + tl(r.system) + '.'), '#count-error');
    },
    'report-range': (f) => { const v = readForm(f); if (v.from > v.to) return showError(Error('Başlangıç bitişten sonra olamaz.')); Object.assign(S.report, v); render(); },
    lock: (f) => {
      const v = readForm(f);
      if (!confirm(dateTR(v.date, { year: true }) + ' dahil önceki kayıtlar kilitlensin mi?')) return;
      mutate((b) => F.lockPeriod(b, v.date), 'Dönem kilitlendi.', '#lock-error');
    },
    def: (f) => {
      const v = readForm(f);
      const id = S.editDef || undefined;
      const ok = mutate((b) => {
        if (S.defs === 'parties') return F.saveParty(b, { id, label: v.label, type: v.type, taxNo: v.taxNo, defaultCategory: v.defaultCategory });
        if (S.defs === 'categories') return F.saveCategory(b, { id, label: v.label, pl: v.pl });
        if (S.defs === 'accounts') {
          const cur = b.accounts.find((x) => x.id === id);
          const pos = cur?.kind === 'pos' ? { bankId: v.posBank, settleDays: Number(v.settleDays), auto: v.auto === '1', rates: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, parseRate(v['rate' + (i + 1)])]).filter(([, r]) => r !== undefined)) } : undefined;
          return F.saveMoneyAccount(b, { id, label: v.label, kind: v.kind, iban: v.iban, limit: v.limit ? parseTL(v.limit, { allowZero: true }) : 0, pos });
        }
        if (S.defs === 'branches') return F.saveBranch(b, { id, label: v.label, kind: v.kind, sellers: String(v.sellers || '').split(','), stockFrom: v.stockFrom, cashAccount: v.cashAccount });
        return F.saveTemplate(b, { id, label: v.label, partyId: v.partyId, categoryId: v.categoryId, day: v.day, amount: parseTL(v.amount) });
      }, 'Tanım kaydedildi.', '#def-error');
      if (ok) { S.editDef = ''; render(); }
    },
    user: (f) => {
      const u = readForm(f);
      const el = main.querySelector('#user-error');
      if (S.role !== 'admin') return (el.textContent = 'Yetkisiz işlem.');
      if (!u.email || !H.ROLE_LABELS[u.role]) return (el.textContent = 'Geçerli kullanıcı taslağı girin.');
      if (S.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) return (el.textContent = 'E-posta zaten taslaklarda var.');
      S.users.push(u);
      render();
    },
    'staff-scan': (f) => { try { scanIntoStaff(readForm(f).barcode.trim()); } catch (e) { showError(e); } },
    'inv-scan': (f) => { try { scanIntoStaff(readForm(f).barcode.trim()); } catch (e) { showError(e); } },
    'manual-stock': (f) => {
      try {
        if (S.role !== 'admin') throw Error('Stok değiştirme yetkiniz yok.');
        const row = readForm(f);
        const plan = I.importPreview(S.stock, [row]);
        if (plan.errors.length) throw Error(plan.errors.map((x) => x.message).join(' '));
        const next = structuredClone(S.books);
        const cost = row.birim_maliyet_tl ? Math.round(Number(row.birim_maliyet_tl) * 100) : 0;
        postStockPlan(next, plan, cost ? { [String(row.ic_sku).trim()]: cost } : {});
        I.applyImport(S.stock, plan);
        S.books = next;
        syncStock();
        S.inv.view = { Gozluk: 'eyewear', Cam: 'opticalLens', Lens: 'contactLens' }[row.urun_turu];
        flash('Manuel stok kaydı oluşturuldu.');
        render();
      } catch (e) {
        main.querySelector('#stock-error').textContent = e.message;
      }
    },
  };
  root.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    FORMS[f.dataset.form]?.(f);
  });

  S.doc = newDocDraft('expense');
  syncStock();
  render();
})();
