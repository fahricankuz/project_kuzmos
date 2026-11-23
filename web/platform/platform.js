'use strict';

const element = (id) => document.getElementById(id);
const status = element('status');
const login = element('login');
const editor = element('editor');
const subscription = element('subscription');
const editorStatus = element('editor-status');
const states = {
  deneme: 'Deneme', aktif: 'Aktif', odeme_bekliyor: 'Ödeme bekliyor',
  askida: 'Askıda', iptal: 'İptal'
};
const config = window.KUZMOS_CONFIG;
let client;
let companies = [];
let trials = new Set();
let plans = [];
let selected;
let sessionVersion = 0;

function option(select, value, label) {
  select.add(new Option(label, value));
}

for (const [value, label] of Object.entries(states)) {
  option(element('filter'), value, label);
  option(subscription.elements.state, value, label);
}

async function unwrap(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

function renderRows() {
  const search = element('search').value.trim().toLocaleLowerCase('tr-TR');
  const state = element('filter').value;
  const rows = companies.filter((company) =>
    (!state || company.durum === state) &&
    [company.ad, company.slug].some((value) => String(value ?? '').toLocaleLowerCase('tr-TR').includes(search))
  );
  const body = element('rows');
  body.replaceChildren();
  for (const company of rows) {
    const row = body.insertRow();
    const stateLabel = states[company.durum] ?? company.durum;
    const planLabel = plans.find((plan) => plan.kod === company.plan)?.ad ?? company.plan;
    for (const value of [company.ad, planLabel, trials.has(company.id) ? stateLabel + ' · Bitiş yakın' : stateLabel,
      company.magaza, company.kullanici, company.siparis, company.sonIslem]) {
      row.insertCell().textContent = value ?? '—';
    }
    const button = document.createElement('button');
    button.textContent = 'Düzenle';
    button.setAttribute('aria-label', company.ad + ' aboneliğini düzenle');
    button.addEventListener('click', () => openEditor(company));
    row.insertCell().append(button);
  }
  element('empty').hidden = rows.length > 0;
}

async function loadDashboard() {
  const version = ++sessionVersion;
  status.textContent = 'İşletmeler yükleniyor…';
  try {
    const summary = await unwrap(client.rpc('platform_ozet'));
    const nextPlans = await unwrap(client.from('planlar').select('kod,ad').eq('aktif', true).order('kod'));
    if (version !== sessionVersion) return;
    companies = summary.isletmeler;
    trials = new Set(summary.denemesiBitenler.map((company) => company.id));
    plans = nextPlans;
    element('total').textContent = summary.toplamIsletme;
    element('active').textContent = summary.durumDagilimi.aktif ?? 0;
    element('trials').textContent = trials.size;
    renderRows();
    login.hidden = true;
    element('dashboard').hidden = false;
    status.textContent = '';
  } catch (error) {
    if (version !== sessionVersion) return;
    companies = [];
    element('rows').replaceChildren();
    element('dashboard').hidden = true;
    status.textContent = error.message;
  }
}

async function openEditor(company) {
  if (editor.open) return;
  selected = company;
  subscription.reset();
  element('company').textContent = company.ad;
  const { elements } = subscription;
  elements.plan.replaceChildren();
  for (const plan of plans) option(elements.plan, plan.kod, plan.ad);
  if (!plans.some((plan) => plan.kod === company.plan)) option(elements.plan, company.plan, company.plan);
  elements.plan.value = company.plan;
  elements.state.value = company.durum;
  element('history').replaceChildren();
  editorStatus.textContent = 'Abonelik yükleniyor…';
  const submit = subscription.querySelector('[type="submit"], button:not([type])');
  submit.disabled = true;
  editor.showModal();
  try {
    const [details, history] = await Promise.all([
      unwrap(client.from('isletmeler').select('abonelik_bitis').eq('id', company.id).single()),
      unwrap(client.from('abonelik_hareketleri').select('tip,plan_kod,tutar,saglayici_ref,donem_bitis,olusturma')
        .eq('isletme_id', company.id).order('olusturma', { ascending: false }).limit(10))
    ]);
    if (selected !== company || !editor.open) return;
    elements.ends.value = details.abonelik_bitis ?? '';
    for (const item of history) {
      const entry = document.createElement('li');
      entry.textContent = [item.olusturma?.slice(0, 10), item.plan_kod,
        item.tutar == null ? 'Plan veya durum değişikliği' : item.tutar + ' TL',
        item.saglayici_ref, item.donem_bitis && 'Bitiş ' + item.donem_bitis].filter(Boolean).join(' · ');
      element('history').append(entry);
    }
    editorStatus.textContent = '';
    submit.disabled = false;
  } catch (error) {
    if (selected === company && editor.open) editorStatus.textContent = error.message;
  }
}

subscription.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(subscription);
  const amount = form.get('amount');
  const reference = form.get('reference').trim();
  if (amount && !reference) {
    editorStatus.textContent = 'Manuel ödeme için referans girin.';
    return;
  }
  event.submitter.disabled = true;
  element('close').disabled = true;
  editorStatus.textContent = 'Kaydediliyor…';
  try {
    await unwrap(client.rpc('abonelik_guncelle', {
      p_isletme: selected.id, p_plan: form.get('plan'), p_durum: form.get('state'),
      p_bitis: form.get('ends') || null, p_tutar: amount ? Number(amount) : null,
      p_saglayici: 'elle', p_ref: reference
    }));
    editor.close();
    await loadDashboard();
    if (!element('dashboard').hidden) status.textContent = 'Abonelik güncellendi.';
  } catch (error) {
    editorStatus.textContent = error.message;
  } finally {
    event.submitter.disabled = false;
    element('close').disabled = false;
  }
});

element('close').addEventListener('click', () => editor.close());
editor.addEventListener('cancel', (event) => {
  if (element('close').disabled) event.preventDefault();
});
editor.addEventListener('close', () => { selected = null; });
element('refresh').addEventListener('click', loadDashboard);
element('search').addEventListener('input', renderRows);
element('filter').addEventListener('change', renderRows);

async function showSession(session) {
  element('logout').hidden = !session;
  login.hidden = Boolean(session);
  if (session) return loadDashboard();
  sessionVersion++;
  companies = [];
  element('rows').replaceChildren();
  element('history').replaceChildren();
  element('dashboard').hidden = true;
  if (editor.open) editor.close();
  status.textContent = '';
}

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(login);
  event.submitter.disabled = true;
  try {
    const { session } = await unwrap(client.auth.signInWithPassword({
      email: form.get('email'), password: form.get('password')
    }));
    login.reset();
    await showSession(session);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    event.submitter.disabled = false;
  }
});

element('logout').addEventListener('click', async () => {
  try {
    await unwrap(client.auth.signOut());
    await showSession(null);
  } catch (error) {
    status.textContent = error.message;
  }
});

async function init() {
  try {
    if (!config?.SUPABASE_URL?.startsWith('https://') || !config.SUPABASE_ANON_KEY) {
      status.textContent = 'Paneli açmak için Supabase bağlantı ayarlarını girin.';
      return;
    }
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') showSession(null);
    });
    const { session } = await unwrap(client.auth.getSession());
    await showSession(session);
  } catch (error) {
    status.textContent = error.message;
  }
}
init();
