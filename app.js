'use strict';
/* SaveyCustom — app de ingresos y gastos, inspirada en Savey.
   Todos los datos viven en el propio dispositivo (localStorage). */

const KEY = 'mc.db.v1';
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Datos por defecto ---------------- */
const DEFAULT_CATS = [
  // id, nombre, tipo, icono, color
  ['c_casa', 'Casa', 'expense', '🏠', '#8e6ce0'],
  ['c_coche', 'Coche', 'expense', '🚗', '#43b5c9'],
  ['c_moto', 'Moto', 'expense', '🛵', '#35b3d6'],
  ['c_compras', 'Compras', 'expense', '🛒', '#f08a3c'],
  ['c_desayunos', 'Desayunos', 'expense', '🥐', '#e5585a'],
  ['c_cafe', 'Cafe/Meriendas', 'expense', '☕', '#e35d61'],
  ['c_restaurante', 'Restaurante', 'expense', '🍽️', '#e2555e'],
  ['c_cervecitis', 'Cervecitis', 'expense', '🍺', '#f0b341'],
  ['c_gasolina', 'Gasolina', 'expense', '⛽', '#9c6b4e'],
  ['c_butano', 'Butano', 'expense', '🔥', '#6b8cf0'],
  ['c_electricidad', 'Electricidad', 'expense', '⚡', '#6b7cf0'],
  ['c_agua', 'Agua', 'expense', '💧', '#5b9cf0'],
  ['c_suscripcion', 'Suscripción', 'expense', '📺', '#7c84e8'],
  ['c_deporte', 'Deporte', 'expense', '🏋️', '#3fb9c9'],
  ['c_cositas', 'Cositas pa mí', 'expense', '🛍️', '#e66ba0'],
  ['c_regalos', 'Regalos', 'expense', '🎁', '#e6619a'],
  ['c_vacaciones', 'Vacaciones', 'expense', '🏖️', '#e8659b'],
  ['c_gato', 'Gato', 'expense', '🐱', '#e978a8'],
  ['c_atipicos', 'Atípicos', 'expense', '📦', '#7a7f8c'],
  ['c_otro', 'Otro', 'expense', '📄', '#6e7380'],
  ['c_salario', 'Salario', 'income', '💶', '#5daa62'],
  ['c_bizum', 'Bizum', 'income', '📲', '#6b7cf0'],
  ['c_extra', 'Ingreso adicional', 'income', '💰', '#f0884a'],
  ['c_otro_in', 'Otro', 'income', '📄', '#6e7380'],
];
// Nombres internos de Savey (en inglés en el CSV) -> nombre visible
const SAVEY_NAMES = {
  'Salary': 'Salario', 'Extra income': 'Ingreso adicional', 'Other': 'Otro', 'Restaurant': 'Restaurante',
  'Gifts': 'Regalos', 'Gas': 'Gasolina', 'Electricity': 'Electricidad', 'Water': 'Agua',
  'Subscription': 'Suscripción', 'Vacation': 'Vacaciones', 'Coffee': 'Cafe/Meriendas', 'Sport': 'Deporte',
};
const COLORS = ['#8e6ce0', '#6b7cf0', '#5b9cf0', '#43b5c9', '#3fb9a0', '#5daa62', '#f0b341', '#f08a3c', '#9c6b4e', '#e5585a', '#e6619a', '#e978a8', '#7a7f8c', '#2a2f3a'];
const EMOJIS = ['🏠', '🚗', '🛵', '🛒', '🥐', '☕', '🍽️', '🍺', '⛽', '🔥', '⚡', '💧', '📺', '🏋️', '🛍️', '🎁', '🏖️', '🐱', '🐶', '📦', '📄', '💶', '📲', '💰', '💳', '💵', '🏦', '📈', '📊', '🤝', '🎮', '📚', '💊', '🩺', '✂️', '👕', '🚌', '✈️', '🎬', '🎵', '🍕', '🍷', '🧾', '📱', '💡', '🧸', '🌱', '🎓'];

function defaultDB() {
  return {
    version: 1,
    accounts: [{ id: 'a_principal', name: 'Cuenta Principal', icon: '💳', color: '#6b8cf0', initial: 0 }],
    categories: DEFAULT_CATS.map(([id, name, type, icon, color]) => ({ id, name, type, icon, color })),
    transactions: [],
    recurring: [],
    budgets: { general: 0, cats: {} },
    settings: { theme: 'auto', budgetMode: 'income', currency: 'EUR', netWorth: true, decimals: true, counts: true, lastBackup: null, lastAcc: null },
  };
}
const SETTINGS_DEFAULT = defaultDB().settings;

let db;
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.transactions)) db = defaultDB();
  normalize();
  takeSnap();
}
function normalize() {
  db.settings = Object.assign({}, SETTINGS_DEFAULT, db.settings || {});
  db.budgets = Object.assign({ general: 0, cats: {} }, db.budgets || {});
  db.recurring = db.recurring || [];
  db.accounts = db.accounts || [];
  db.categories = db.categories || [];
  db.deleted = db.deleted || {};
  db.budgetsU = db.budgetsU || 0;
}
// Guarda un cambio hecho en este dispositivo: marca qué registros cambiaron (para sincronizar) y guarda.
function save() { stamp(); saveRaw(); scheduleSync(); }
function saveRaw() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { alert('No se pudieron guardar los datos: ' + e.message); }
  takeSnap();
}

/* Seguimiento de cambios por registro: cada registro lleva "u" (última modificación)
   y los borrados quedan en db.deleted, para poder combinar los datos de varios dispositivos. */
const SYNC_FIELDS = ['accounts', 'categories', 'transactions', 'recurring'];
let snap = new Map();
const stripU = r => { const { u, ...rest } = r; return JSON.stringify(rest); };
function takeSnap() {
  snap = new Map();
  for (const k of SYNC_FIELDS) for (const r of db[k]) snap.set(r.id, stripU(r));
  snap.set('__budgets', JSON.stringify(db.budgets));
}
function stamp() {
  const now = Date.now(), seen = new Set();
  db.deleted = db.deleted || {};
  for (const k of SYNC_FIELDS) for (const r of db[k]) {
    seen.add(r.id);
    if (snap.get(r.id) !== stripU(r)) r.u = now;
  }
  for (const id of snap.keys()) if (id !== '__budgets' && !seen.has(id)) db.deleted[id] = now;
  if (snap.get('__budgets') !== JSON.stringify(db.budgets)) db.budgetsU = now;
}

/* ---------------- Utilidades ---------------- */
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const FREQS = { never: 'Nunca', day: 'Cada día', week: 'Cada semana', month: 'Cada mes', year: 'Cada año' };
const CURRENCIES = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', MXN: 'MX$' };

function money(cents, opts = {}) {
  const v = Math.abs(cents) / 100;
  const dec = db.settings.decimals || !Number.isInteger(v) ? 2 : 0;
  const num = v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const sym = CURRENCIES[db.settings.currency] || db.settings.currency;
  const sign = cents < 0 ? '−' : (opts.sign && cents > 0 ? '+' : '');
  return db.settings.currency === 'EUR' ? `${sign}${num} ${sym}` : `${sign}${sym}${num}`;
}
const toCents = s => Math.round(parseFloat(String(s).replace(/\s/g, '').replace(',', '.')) * 100);
const centsToInput = c => (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = d => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const longDate = d => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
const inMonth = (iso, y, m) => { const d = new Date(iso); return d.getFullYear() === y && d.getMonth() === m; };
const cat = id => db.categories.find(c => c.id === id);
const acc = id => db.accounts.find(a => a.id === id);
const soft = (hex, a = .2) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const ico = (item, cls = '') => `<span class="ico ${cls}" style="background:${soft(item?.color || '#7a7f8c', .22)}">${item?.icon || '❔'}</span>`;
const TRANSFER_ICON = { icon: '🔁', color: '#5b8def' };
const ADJUST_ICON = { icon: '⚖️', color: '#7a7f8c' };

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------------- Cálculos ---------------- */
function balances() {
  const b = {};
  db.accounts.forEach(a => b[a.id] = a.initial || 0);
  for (const t of db.transactions) {
    if (t.type === 'income') b[t.acc] = (b[t.acc] || 0) + t.amount;
    else if (t.type === 'expense') b[t.acc] = (b[t.acc] || 0) - t.amount;
    else if (t.type === 'transfer') { b[t.acc] = (b[t.acc] || 0) - t.amount; b[t.to] = (b[t.to] || 0) + t.amount; }
    else if (t.type === 'adjust') b[t.acc] = (b[t.acc] || 0) + t.amount;
  }
  return b;
}
const netWorth = () => Object.values(balances()).reduce((a, b) => a + b, 0);
function monthTx(y, m, accId = ui.acc) {
  return db.transactions.filter(t => inMonth(t.date, y, m) && (accId === 'all' || t.acc === accId || t.to === accId));
}
function monthStats(y, m, accId = ui.acc) {
  let inc = 0, exp = 0;
  for (const t of monthTx(y, m, accId)) {
    if (t.type === 'income') inc += t.amount;
    else if (t.type === 'expense') exp += t.amount;
  }
  return { inc, exp, bal: inc - exp };
}
function groupByCat(list) {
  const g = {};
  for (const t of list) {
    if (t.type !== 'income' && t.type !== 'expense') continue;
    (g[t.cat] ||= { cat: cat(t.cat), type: t.type, total: 0, n: 0, id: t.cat }).total += t.amount;
    g[t.cat].n++;
  }
  return Object.values(g).sort((a, b) => (a.type === b.type ? b.total - a.total : a.type === 'income' ? -1 : 1));
}

/* ---------------- Recurrentes ---------------- */
function advance(r) {
  const d = new Date(r.next);
  if (r.freq === 'day') d.setDate(d.getDate() + 1);
  else if (r.freq === 'week') d.setDate(d.getDate() + 7);
  else {
    const day = r.day || d.getDate();
    const y = d.getFullYear() + (r.freq === 'year' ? 1 : 0);
    const m = d.getMonth() + (r.freq === 'month' ? 1 : 0);
    const last = new Date(y, m + 1, 0).getDate();
    d.setFullYear(y, m, Math.min(day, last));
  }
  r.next = d.toISOString();
}
function processRecurring() {
  const now = Date.now(); let n = 0;
  for (const r of db.recurring) {
    let guard = 0;
    while (new Date(r.next).getTime() <= now && guard++ < 2000) {
      // id determinista: si dos dispositivos generan la misma repetición, al sincronizar no se duplica
      const id = `${r.id}_${r.next.slice(0, 10)}`;
      if (!db.transactions.some(t => t.id === id) && !db.deleted?.[id])
        db.transactions.push({ id, type: r.type, amount: r.amount, cat: r.cat, acc: r.acc, to: r.to, date: r.next, note: r.note || '', rec: r.id });
      advance(r); n++;
    }
  }
  if (n) save();
  return n;
}

/* ---------------- Estado de la interfaz ---------------- */
const now0 = new Date();
const UI_KEY = 'mc.ui';
const ui = { tab: 'home', y: now0.getFullYear(), m: now0.getMonth(), acc: 'all', ideasType: 'expense' };
try { // recuerda pestaña, cuenta seleccionada y tipo de Ideas entre recargas
  const saved = JSON.parse(localStorage.getItem(UI_KEY)) || {};
  for (const k of ['tab', 'acc', 'ideasType']) if (saved[k]) ui[k] = saved[k];
} catch (e) { }
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab, acc: ui.acc, ideasType: ui.ideasType })); } catch (e) { }
}

/* ---------------- Iconos SVG ---------------- */
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  gear: (() => {
    // Engranaje de 8 dientes generado como polígono
    const pts = []; const N = 8;
    for (let i = 0; i < N * 4; i++) {
      const a = (i / (N * 4)) * Math.PI * 2 - Math.PI / 2 + Math.PI / (N * 4);
      const r = (i % 4 === 0 || i % 4 === 1) ? 10 : 7.6;
      pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
    }
    return `<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M${pts.join('L')}Z M12 8.6a3.4 3.4 0 1 0 0.001 0Z"/></svg>`;
  })(),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  wallet: svg('<rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M16 12.5h2.5M3 9h18"/>'),
  list: svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6" fill="currentColor"/><circle cx="4" cy="12" r=".6" fill="currentColor"/><circle cx="4" cy="18" r=".6" fill="currentColor"/>'),
  home: svg('<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5h3v5H18V9.5"/>'),
  ideas: svg('<path d="M3 17l5-6 4 3 6-8 3 3"/><path d="M3 21h18"/>'),
  budget: svg('<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>'),
  repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  shapes: svg('<path d="M12 3l4 7H8z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>'),
};

/* ---------------- Render principal ---------------- */
function render() {
  if (ui.acc !== 'all' && !acc(ui.acc)) ui.acc = 'all';
  if (!['home', 'timeline', 'ideas', 'budgets', 'accounts'].includes(ui.tab)) ui.tab = 'home';
  saveUi();
  applyTheme();
  renderTop(); renderTabs();
  const v = $('#view');
  v.innerHTML = ({ home: viewHome, timeline: viewTimeline, ideas: viewIdeas, budgets: viewBudgets, accounts: viewAccounts })[ui.tab]();
  sheets.forEach(s => s.live && s.refresh());
}
function renderTop() {
  const t = $('#topbar');
  const mid = ui.tab === 'accounts'
    ? `<div class="pagetitle">Cuentas</div>`
    : `<div class="monthnav"><button class="iconbtn" data-act="prevMonth" aria-label="Mes anterior">${I.left}</button>
       <button class="title" data-act="today">${MONTHS[ui.m]} <span class="yr">${ui.y}</span></button>
       <button class="iconbtn" data-act="nextMonth" aria-label="Mes siguiente">${I.right}</button></div>`;
  t.innerHTML = `<button class="iconbtn" data-act="menu" aria-label="Menú">${I.menu}</button>${mid}<button class="iconbtn" data-act="settings" aria-label="Configuración">${I.gear}</button>`;
}
function renderTabs() {
  const tabs = [['accounts', 'Cuentas', I.wallet], ['timeline', 'Línea temp.', I.list], ['home', 'Inicio', I.home], ['ideas', 'Ideas', I.ideas], ['budgets', 'Presupuestos', I.budget]];
  $('#tabbar').innerHTML = tabs.map(([k, l, i]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${i}<span>${l}</span></button>`).join('');
}
function accRow(short, right = '') {
  const name = ui.acc === 'all' ? 'Todas las cuentas' : (acc(ui.acc)?.name || '—');
  const bal = ui.acc === 'all' ? netWorth() : (balances()[ui.acc] || 0);
  const r = right || (db.settings.netWorth ? `<div class="bigbal">${money(bal)}</div>` : '');
  return `<div class="accrow"><button class="accsel" data-act="pickViewAcc"><span>${esc(short && name.length > 12 ? name.slice(0, 11) + '…' : name)}</span>${I.down}</button>${r}</div>`;
}
function backupBanner() {
  if (!db.transactions.length) return '';
  const lb = db.settings.lastBackup ? new Date(db.settings.lastBackup) : null;
  if (lb && Date.now() - lb.getTime() < 30 * 864e5) return '';
  return `<button class="banner" data-act="backup">💾 <span>${lb ? 'Hace más de un mes de tu última copia de seguridad.' : 'Aún no has hecho ninguna copia de seguridad.'} <b>Toca para hacerla ahora.</b></span></button>`;
}

function viewHome() {
  const s = monthStats(ui.y, ui.m);
  const tot = s.inc + s.exp;
  const groups = groupByCat(monthTx(ui.y, ui.m));
  const counts = db.settings.counts;
  return `${backupBanner()}${accRow(false)}
    <div class="ratio ${tot ? '' : 'empty'}"><div style="width:${tot ? (s.inc / tot * 100) : 0}%"></div></div>
    <div class="stats">
      <div><div class="lbl green">Ingresos</div><div class="val">${money(s.inc)}</div></div>
      <div><div class="lbl red">Gastos</div><div class="val">${money(s.exp)}</div></div>
      <div><div class="lbl muted">Saldo</div><div class="val">${money(s.bal, { sign: true })}</div></div>
    </div>
    <h2 class="sec">Transacciones</h2>
    ${groups.length ? groups.map(g => `<button class="row" data-act="catDetail" data-cat="${g.id}">
        ${ico(g.cat)}<div class="main"><div class="name">${esc(g.cat?.name || '¿?')}${counts && g.n > 1 ? ` (${g.n})` : ''}</div></div>
        <div class="amt ${g.type === 'income' ? 'green' : ''}">${money(g.total)}</div></button>`).join('')
      : `<div class="empty-state">No hay movimientos este mes.<br>Pulsa <b>+</b> para añadir uno.</div>`}`;
}

function txRow(t) {
  let item, name, sub = t.note || '', cls = '', amt = t.amount;
  if (t.type === 'transfer') { item = TRANSFER_ICON; name = 'Transferencia'; sub = `${acc(t.acc)?.name || '?'} → ${acc(t.to)?.name || '?'}${t.note ? ' · ' + t.note : ''}`; cls = 'muted'; }
  else if (t.type === 'adjust') { item = ADJUST_ICON; name = 'Ajuste de saldo'; sub = acc(t.acc)?.name || ''; cls = 'muted'; }
  else { item = cat(t.cat); name = item?.name || '¿?'; if (t.type === 'income') cls = 'green'; }
  const amtTxt = t.type === 'adjust' ? money(amt, { sign: true }) : money(amt);
  return `<button class="row" data-act="editTx" data-id="${t.id}">${ico(item)}<div class="main"><div class="name">${esc(name)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div><div class="amt ${cls}">${amtTxt}</div></button>`;
}
function dayGroups(list) {
  list = [...list].sort((a, b) => b.date.localeCompare(a.date));
  let out = '', last = '';
  for (const t of list) {
    const d = new Date(t.date), k = dayKey(d);
    if (k !== last) { out += `<div class="dayhdr">${dayLabel(d)}</div>`; last = k; }
    out += txRow(t);
  }
  return out;
}
function viewTimeline() {
  const list = monthTx(ui.y, ui.m);
  return `${accRow(false)}${list.length ? dayGroups(list) : `<div class="empty-state">No hay movimientos en ${MONTHS_L[ui.m]} de ${ui.y}.</div>`}`;
}

function donut(groups, total, selId) {
  const R = 80, C = 2 * Math.PI * R; let off = 0;
  const sel = groups.find(g => g.id === selId);
  const segs = groups.map(g => {
    const len = total ? g.total / total * C : 0;
    const gap = groups.length > 1 ? Math.min(2, len / 3) : 0;
    const on = !sel || sel === g;
    const s = `<circle data-act="donutSel" data-cat="${g.id}" r="${R}" cx="110" cy="110" fill="none" stroke="${g.cat?.color || '#999'}" stroke-width="${sel === g ? 40 : 34}" opacity="${on ? 1 : .3}" stroke-dasharray="${Math.max(len - gap, 0)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 110 110)" style="cursor:pointer;transition:opacity .2s"/>`;
    off += len; return s;
  }).join('');
  const center = sel
    ? `<text x="110" y="98" text-anchor="middle" font-size="22">${sel.cat?.icon || ''}</text>
       <text x="110" y="122" text-anchor="middle" font-size="17">${money(sel.total)}</text>
       <text x="110" y="140" text-anchor="middle" font-size="11" opacity=".6">${esc(sel.cat?.name || '')} · ${(sel.total / total * 100).toFixed(1).replace('.', ',')}%</text>`
    : `<text x="110" y="116" text-anchor="middle" font-size="17">${money(total)}</text>`;
  return `<svg class="donut" viewBox="0 0 220 220" data-act="donutSel" data-cat=""><circle r="${R}" cx="110" cy="110" fill="none" stroke="var(--line)" stroke-width="34"/>${segs}${center}</svg>`;
}
function viewIdeas() {
  const type = ui.ideasType;
  const groups = groupByCat(monthTx(ui.y, ui.m)).filter(g => g.type === type);
  const total = groups.reduce((a, g) => a + g.total, 0);
  const seg = `<div class="seg" style="flex:none"><button class="${type === 'income' ? 'on income' : ''}" data-act="ideasType" data-type="income">Ingresos</button><button class="${type === 'expense' ? 'on expense' : ''}" data-act="ideasType" data-type="expense">Gasto</button></div>`;
  const yearBtn = `<button class="row" data-act="yearSummary" style="justify-content:center;border:0;color:var(--accent)">Ver resumen de ${ui.y} ›</button>`;
  return `${accRow(true, seg)}${groups.length ? donut(groups, total, ui.ideasSel) + groups.map(g => `<button class="row" data-act="catDetail" data-cat="${g.id}" style="${ui.ideasSel && ui.ideasSel !== g.id ? 'opacity:.45' : ''}">${ico(g.cat)}
      <div class="main"><div class="name">${esc(g.cat?.name)} <span class="muted">(${(g.total / total * 100).toFixed(1).replace('.', ',')}%)</span></div></div>
      <div class="amt ${type === 'income' ? 'green' : ''}">${money(g.total)}</div></button>`).join('')
    : `<div class="empty-state">No hay ${type === 'income' ? 'ingresos' : 'gastos'} este mes.</div>`}${yearBtn}`;
}

function budgetBar(spent, limit) {
  const p = limit ? spent / limit : (spent ? 2 : 0);
  return `<div class="bar ${p > 1 ? 'over' : p > .85 ? 'warn' : ''}"><div style="width:${Math.min(p, 1) * 100}%"></div></div>`;
}
function viewBudgets() {
  const all = db.transactions.filter(t => inMonth(t.date, ui.y, ui.m));
  let inc = 0, exp = 0; const byCat = {};
  for (const t of all) {
    if (t.type === 'income') inc += t.amount;
    if (t.type === 'expense') { exp += t.amount; byCat[t.cat] = (byCat[t.cat] || 0) + t.amount; }
  }
  const general = db.settings.budgetMode === 'income' ? inc : (db.budgets.general || 0);
  const left = general - exp;
  const cats = Object.entries(db.budgets.cats).filter(([id]) => cat(id)).map(([id, lim]) => ({ c: cat(id), lim, spent: byCat[id] || 0 }))
    .sort((a, b) => b.spent / b.lim - a.spent / a.lim);
  return `<button class="bcard" data-act="editGeneral">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="serif" style="font-size:19px">Presupuesto general</span><span class="small">${db.settings.budgetMode === 'income' ? 'según ingresos' : 'cantidad fija'}</span></div>
      ${budgetBar(exp, general)}
      <div class="brow"><span>Gastado ${money(exp)} de ${money(general)}</span><span class="${left < 0 ? 'red' : 'green'}">${left < 0 ? 'Te pasas ' + money(-left) : 'Quedan ' + money(left)}</span></div>
    </button>
    <h2 class="sec">Por categoría</h2>
    ${cats.map(({ c, lim, spent }) => `<button class="bcard" data-act="editBudget" data-cat="${c.id}">
      <div style="display:flex;align-items:center;gap:10px">${ico(c)}<span style="flex:1">${esc(c.name)}</span><span class="small">${Math.round(spent / lim * 100)}%</span></div>
      ${budgetBar(spent, lim)}
      <div class="brow"><span>${money(spent)} de ${money(lim)}</span><span class="${lim - spent < 0 ? 'red' : ''}">${lim - spent < 0 ? 'Te pasas ' + money(spent - lim) : 'Quedan ' + money(lim - spent)}</span></div></button>`).join('')
    || `<div class="empty-state" style="padding:16px">Aún no tienes presupuestos por categoría.</div>`}
    <button class="addcard" data-act="addBudget">+ Añadir presupuesto</button>`;
}

function viewAccounts() {
  const b = balances();
  return `<div class="networth"><div class="v">${money(netWorth())}</div><div class="small">Valor neto</div></div>
    ${db.accounts.map(a => `<button class="acard" data-act="editAcc" data-id="${a.id}"><div><div class="n">${esc(a.name)}</div><div class="b">${money(b[a.id] || 0)}</div></div>
      <span class="sq" style="background:${soft(a.color, .25)}">${a.icon}</span></button>`).join('')}
    <button class="addcard" data-act="newAcc">+ Toque para agregar una cuenta</button>
    <div style="margin-top:16px"><button class="btn blue" style="width:100%" data-act="newTransfer">⇄ Realizar una transferencia</button></div>`;
}

/* ---------------- Hojas (sheets) ---------------- */
const sheets = [];
function openSheet({ render, actions = {}, cls = '', onRender }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="backdrop"></div><div class="sheet ${cls}"></div>`;
  document.body.appendChild(wrap);
  const s = { wrap, el: wrap.querySelector('.sheet'), actions, render, onRender, live: cls === 'full' };
  s.refresh = () => { const st = s.el.scrollTop; s.el.innerHTML = s.render(s); s.el.scrollTop = st; s.onRender?.(s); };
  s.close = () => closeSheet(s);
  wrap.querySelector('.backdrop').addEventListener('click', () => closeSheet(s));
  const handle = ev => {
    const t = ev.target.closest(ev.type === 'click' ? '[data-act]' : '[data-on]');
    if (!t || !s.el.contains(t)) return;
    const name = ev.type === 'click' ? t.dataset.act : t.dataset.on;
    if (name === 'close') return closeSheet(s);
    s.actions[name]?.(t, s, ev);
  };
  s.el.addEventListener('click', handle);
  s.el.addEventListener('change', handle);
  s.el.addEventListener('input', ev => { const t = ev.target.closest('[data-input]'); if (t) s.actions[t.dataset.input]?.(t, s, ev); });
  sheets.push(s);
  s.refresh();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return s;
}
function closeSheet(s = sheets[sheets.length - 1]) {
  if (!s) return;
  sheets.splice(sheets.indexOf(s), 1);
  s.wrap.classList.remove('open');
  setTimeout(() => s.wrap.remove(), 280);
}
const head = (title, sub = '', right = '') => `<div class="grab"></div><div class="shead"><button class="iconbtn" data-act="close">${I.close}</button><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div>${right}</div></div>`;

function pickList(title, items, current, onPick) {
  openSheet({
    render: () => `${head(title)}<div class="picklist">${items.map(([v, l]) => `<button class="${v === current ? 'on' : ''}" data-act="pick" data-v="${esc(v)}">${l}</button>`).join('')}</div>`,
    actions: { pick: (t, s) => { s.close(); onPick(t.dataset.v); } },
  });
}
function pickAccount(current, onPick, withAll = false) {
  const b = balances();
  const items = (withAll ? [['all', 'Todas las cuentas']] : []).concat(db.accounts.map(a => [a.id, `${a.icon} ${esc(a.name)} <span class="small">${money(b[a.id] || 0)}</span>`]));
  pickList('Seleccionar cuenta', items, current, onPick);
}
function pickCategory(type, current, onPick) {
  let tp = type === 'income' ? 'income' : 'expense';
  openSheet({
    cls: 'full',
    render: () => `${head('Seleccionar categoría', '', `<button class="iconbtn" data-act="manage">${I.gear}</button>`)}
      <div class="seg lg"><button class="${tp === 'income' ? 'on income' : ''}" data-act="tp" data-t="income">Ingresos</button><button class="${tp === 'expense' ? 'on expense' : ''}" data-act="tp" data-t="expense">Gasto</button></div>
      <div class="catgrid">${db.categories.filter(c => c.type === tp && !c.hidden).map(c => `<button data-act="pick" data-id="${c.id}">${ico(c, 'lg')}<span>${esc(c.name)}</span></button>`).join('')}</div>`,
    actions: {
      tp: (t, s) => { tp = t.dataset.t; s.refresh(); },
      pick: (t, s) => { s.close(); onPick(t.dataset.id); },
      manage: (t, s) => openCategories(tp, () => s.refresh()),
    },
  });
}

/* ---------------- Formulario de transacción ---------------- */
function openTxForm(existing, mode = 'tx', preset = {}) {
  // mode: 'tx' (nueva/editar transacción) o 'rule' (editar recurrente)
  const isEdit = !!existing;
  const firstAcc = db.accounts.find(a => a.id === (ui.acc !== 'all' ? ui.acc : db.settings.lastAcc)) || db.accounts[0];
  const f = existing ? {
    type: existing.type, amountStr: centsToInput(Math.abs(existing.amount)), cat: existing.cat, acc: existing.acc, to: existing.to,
    date: mode === 'rule' ? existing.next : existing.date, freq: mode === 'rule' ? existing.freq : 'never', note: existing.note || '',
    neg: existing.type === 'adjust' && existing.amount < 0,
  } : {
    type: 'expense', amountStr: '', cat: null, acc: firstAcc?.id, to: (db.accounts.find(a => a.id !== firstAcc?.id) || firstAcc)?.id,
    date: new Date().toISOString(), freq: 'never', note: '', ...preset,
  };
  let keypad = !isEdit;
  const title = mode === 'rule' ? 'Recurrente' : isEdit ? 'Editar transacción' : 'Nueva transacción';

  const renderForm = () => {
    const c = cat(f.cat), a = acc(f.acc), b = acc(f.to), d = new Date(f.date);
    const amt = f.amountStr ? f.amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '0';
    const typeBtns = f.type === 'adjust' ? `<div class="typeseg"><button class="on transfer">Ajuste de saldo</button></div>` :
      `<div class="typeseg">${[['income', 'Ingresos'], ['expense', 'Gasto'], ['transfer', 'Transferir']].map(([k, l]) => `<button class="${f.type === k ? 'on ' + k : ''}" data-act="type" data-t="${k}">${l}</button>`).join('')}</div>`;
    const rows = [];
    if (f.type === 'income' || f.type === 'expense') rows.push(`<button class="frow" data-act="pickCat"><span>Categoría</span><span class="v ${c ? '' : 'ph'}">${c ? `${ico(c)} ${esc(c.name)}` : 'Seleccionar'} ›</span></button>`);
    rows.push(`<button class="frow" data-act="pickAcc"><span>Cuenta</span><span class="v">${a ? `${ico(a)} ${esc(a.name)}` : 'Seleccionar ›'}</span></button>`);
    if (f.type === 'transfer') rows.push(`<button class="frow" data-act="pickTo"><span>A la cuenta</span><span class="v">${b ? `${ico(b)} ${esc(b.name)}` : 'Seleccionar ›'}</span></button>`);
    rows.push(`<div class="frow"><span>${mode === 'rule' ? 'Próxima fecha' : 'Fecha'}</span><span class="v">${longDate(d)}</span><input type="date" value="${dayKey(d)}" data-on="date"></div>`);
    if (mode === 'rule' || (!isEdit && f.type !== 'adjust')) rows.push(`<div class="frow"><span>Recurrente</span><span class="v">${FREQS[f.freq]} ›</span>
      <select class="overlay" data-on="freq">${Object.entries(FREQS).filter(([k]) => mode !== 'rule' || k !== 'never').map(([k, l]) => `<option value="${k}" ${k === f.freq ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`);
    if (f.type === 'adjust') rows.push(`<button class="frow" data-act="toggleNeg"><span>Signo</span><span class="v">${f.neg ? '− Resta del saldo' : '+ Suma al saldo'}</span></button>`);
    const next = (f.type === 'income' || f.type === 'expense') && !c ? `<button data-act="kpNext">Categoría ›</button>` : `<button data-act="kpDone">Hecho</button>`;
    const btnCls = f.type === 'income' ? 'green' : f.type === 'transfer' ? 'blue' : 'navy';
    return `${head(title)}
      <div class="form-body">
        <div class="amount" data-act="showKeypad">${f.type === 'adjust' ? (f.neg ? '−' : '+') : ''}${amt} ${CURRENCIES[db.settings.currency] || ''}</div>
        ${typeBtns}${rows.join('')}
        <textarea class="note" rows="2" placeholder="Notas..." data-input="note">${esc(f.note)}</textarea>
      </div>
      ${keypad ? `<div class="keypad-wrap"><div class="keypad-top">${next}</div><div class="keypad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map(k => `<button class="${k === ',' || k === '⌫' ? 'flat' : ''}" data-act="key" data-k="${k}">${k}</button>`).join('')}
        </div></div>`
        : `<div class="form-foot">${isEdit ? `<button class="btn ghost" data-act="del">Eliminar</button>` : ''}<button class="btn ${btnCls}" data-act="save">Guardar</button></div>`}`;
  };

  const s = openSheet({
    cls: 'form', render: renderForm,
    actions: {
      type: (t, s) => { f.type = t.dataset.t; const c = cat(f.cat); if (c && c.type !== f.type) f.cat = null; s.refresh(); },
      key: (t, s) => {
        const k = t.dataset.k; let v = f.amountStr;
        if (k === '⌫') v = v.slice(0, -1);
        else if (k === ',') { if (!v.includes(',')) v = (v || '0') + ','; }
        else {
          if (v.includes(',') && v.split(',')[1].length >= 2) return;
          if (v.replace(',', '').length >= 9) return;
          v = v === '0' ? k : v + k;
        }
        f.amountStr = v; s.refresh();
      },
      showKeypad: (t, s) => { keypad = true; s.refresh(); },
      kpDone: (t, s) => { keypad = false; s.refresh(); },
      kpNext: (t, s) => { keypad = false; s.refresh(); s.actions.pickCat(t, s); },
      pickCat: (t, s) => pickCategory(f.type, f.cat, id => { f.cat = id; f.type = cat(id).type; keypad = false; s.refresh(); }),
      pickAcc: (t, s) => pickAccount(f.acc, id => { f.acc = id; s.refresh(); }),
      pickTo: (t, s) => pickAccount(f.to, id => { f.to = id; s.refresh(); }),
      toggleNeg: (t, s) => { f.neg = !f.neg; s.refresh(); },
      date: (t, s) => {
        if (!t.value) return;
        const [y, m, d] = t.value.split('-').map(Number);
        const old = new Date(f.date), nd = new Date(y, m - 1, d, old.getHours(), old.getMinutes(), old.getSeconds());
        if (!isEdit && dayKey(nd) !== dayKey(new Date())) nd.setHours(12, 0, 0, 0);
        f.date = nd.toISOString(); s.refresh();
      },
      freq: (t, s) => { f.freq = t.value; s.refresh(); },
      note: t => { f.note = t.value; },
      del: (t, s) => {
        if (mode === 'rule') {
          if (!confirm('¿Eliminar esta recurrente? Los movimientos ya creados se mantienen.')) return;
          db.recurring = db.recurring.filter(r => r.id !== existing.id);
        } else {
          if (!confirm('¿Eliminar esta transacción?')) return;
          db.transactions = db.transactions.filter(x => x.id !== existing.id);
        }
        save(); s.close(); render(); toast('Eliminada');
      },
      save: (t, s) => {
        const cents = f.amountStr ? toCents(f.amountStr) : 0;
        if (!cents) { keypad = true; s.refresh(); return toast('Introduce un importe'); }
        if ((f.type === 'income' || f.type === 'expense') && !cat(f.cat)) return s.actions.pickCat(t, s);
        if (!acc(f.acc)) return toast('Elige una cuenta');
        if (f.type === 'transfer' && (!acc(f.to) || f.to === f.acc)) return toast('Elige una cuenta de destino distinta');
        const data = {
          type: f.type, amount: f.type === 'adjust' && f.neg ? -cents : cents,
          cat: f.type === 'income' || f.type === 'expense' ? f.cat : null, acc: f.acc, to: f.type === 'transfer' ? f.to : null, note: f.note.trim(),
        };
        db.settings.lastAcc = f.acc;
        if (mode === 'rule') {
          Object.assign(existing, data, { freq: f.freq, next: f.date, day: new Date(f.date).getDate() });
          processRecurring();
        } else if (isEdit) {
          Object.assign(existing, data, { date: f.date });
        } else if (f.freq !== 'never') {
          db.recurring.push({ id: uid(), ...data, freq: f.freq, next: f.date, day: new Date(f.date).getDate() });
          processRecurring();
        } else {
          db.transactions.push({ id: uid(), ...data, date: f.date });
        }
        save(); s.close();
        const d = new Date(f.date);
        if (!isEdit && mode === 'tx' && new Date(f.date) <= new Date()) { ui.y = d.getFullYear(); ui.m = d.getMonth(); }
        render(); toast(isEdit || mode === 'rule' ? 'Guardado' : 'Añadido');
      },
    },
  });
  return s;
}

/* ---------------- Detalle de categoría ---------------- */
function openCatDetail(catId) {
  const c = cat(catId);
  openSheet({
    cls: 'full',
    render: () => {
      const list = monthTx(ui.y, ui.m).filter(t => t.cat === catId && (t.type === 'income' || t.type === 'expense'));
      const total = list.reduce((a, t) => a + t.amount, 0);
      return `${head(esc(c?.name || ''), `${MONTHS_L[ui.m]} ${ui.y} · ${money(total)}`)}${list.length ? dayGroups(list) : '<div class="empty-state">Sin movimientos.</div>'}
        <button class="row" data-act="history" style="justify-content:center;border:0;color:var(--accent);margin-top:12px">Ver evolución de los últimos 12 meses ›</button>`;
    },
    actions: {
      editTx: (t, s) => { const tx = db.transactions.find(x => x.id === t.dataset.id); if (tx) openTxForm(tx); },
      history: () => openHistory(catId),
    },
  });
}
function bars(rows) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.a, r.b || 0)));
  return rows.map(r => `<div style="display:grid;grid-template-columns:62px 1fr 92px;align-items:center;gap:8px;padding:5px 0;font-size:13px">
    <span class="muted">${r.label}</span><div>
      <div style="height:9px;border-radius:5px;background:${r.color || 'var(--accent)'};width:${r.a / max * 100}%"></div>
      ${r.b !== undefined ? `<div style="height:9px;border-radius:5px;background:var(--income);width:${r.b / max * 100}%;margin-top:3px"></div>` : ''}
    </div><span style="text-align:right">${money(r.a)}</span></div>`).join('');
}
function openHistory(catId) {
  const c = cat(catId);
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ui.y, ui.m - i, 1);
    const a = monthTx(d.getFullYear(), d.getMonth()).filter(t => t.cat === catId && t.type === c.type).reduce((s, t) => s + t.amount, 0);
    rows.push({ label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, a, color: c.color });
  }
  const avg = rows.reduce((s, r) => s + r.a, 0) / 12;
  openSheet({ cls: 'full', render: () => `${head(esc(c.name), 'Últimos 12 meses')}<div style="margin:10px 0 14px" class="small">Media mensual: <b>${money(Math.round(avg))}</b></div>${bars(rows)}` });
}
function openYearSummary() {
  const y = ui.y;
  openSheet({
    cls: 'full',
    render: () => {
      const rows = []; let ti = 0, te = 0;
      for (let m = 0; m < 12; m++) { const s = monthStats(y, m); ti += s.inc; te += s.exp; rows.push({ label: MONTHS[m], a: s.exp, b: s.inc }); }
      const yearCats = groupByCat(db.transactions.filter(t => new Date(t.date).getFullYear() === y && (ui.acc === 'all' || t.acc === ui.acc))).filter(g => g.type === 'expense');
      return `${head('Resumen ' + y, ui.acc === 'all' ? 'Todas las cuentas' : esc(acc(ui.acc)?.name))}
        <div class="stats" style="margin-top:10px"><div><div class="lbl green">Ingresos</div><div class="val">${money(ti)}</div></div>
        <div><div class="lbl red">Gastos</div><div class="val">${money(te)}</div></div><div><div class="lbl muted">Ahorro</div><div class="val">${money(ti - te, { sign: true })}</div></div></div>
        <div class="small" style="margin-bottom:6px"><span class="red">■</span> gastos &nbsp; <span class="green">■</span> ingresos</div>
        ${bars(rows)}
        <h2 class="sec">Gastos por categoría</h2>
        ${yearCats.map(g => `<div class="row">${ico(g.cat)}<div class="main"><div class="name">${esc(g.cat?.name)} <span class="muted">(${te ? (g.total / te * 100).toFixed(1).replace('.', ',') : 0}%)</span></div><div class="sub">Media ${money(Math.round(g.total / 12))}/mes</div></div><div class="amt">${money(g.total)}</div></div>`).join('')}`;
    },
  });
}

/* ---------------- Cuentas ---------------- */
function openAccountEdit(a) {
  const isNew = !a;
  const cur = isNew ? 0 : (balances()[a.id] || 0);
  const f = { name: a?.name || '', icon: a?.icon || '💳', color: a?.color || COLORS[1], bal: centsToInput(cur) };
  openSheet({
    cls: 'full',
    render: () => `${head(isNew ? 'Nueva cuenta' : 'Editar cuenta')}
      <div style="display:flex;justify-content:center;padding:10px">${ico(f, 'lg')}</div>
      <div class="field"><label>Nombre</label><input data-input="name" value="${esc(f.name)}" placeholder="Ej. Cuenta Principal"></div>
      <div class="field"><label>${isNew ? 'Saldo inicial' : 'Saldo actual'}</label><input data-input="bal" inputmode="decimal" value="${esc(f.bal)}"></div>
      ${isNew ? '' : '<div class="small" style="padding-top:6px">Si cambias el saldo actual se crea un movimiento de «Ajuste de saldo» por la diferencia (no cuenta como ingreso ni gasto).</div>'}
      <div class="field"><label>Color</label><div class="swatches">${COLORS.map(c => `<button class="${c === f.color ? 'on' : ''}" style="background:${c}" data-act="color" data-c="${c}"></button>`).join('')}</div></div>
      <div class="field"><label>Icono</label><div class="emojis">${EMOJIS.map(e => `<button class="${e === f.icon ? 'on' : ''}" data-act="emoji" data-e="${e}">${e}</button>`).join('')}</div></div>
      <div class="form-foot">${isNew ? '' : '<button class="btn ghost" data-act="del">Eliminar</button>'}<button class="btn navy" data-act="save">Guardar</button></div>`,
    actions: {
      name: t => f.name = t.value, bal: t => f.bal = t.value,
      color: (t, s) => { f.color = t.dataset.c; s.refresh(); },
      emoji: (t, s) => { f.icon = t.dataset.e; s.refresh(); },
      del: (t, s) => {
        const used = db.transactions.some(x => x.acc === a.id || x.to === a.id);
        if (used) return alert('Esta cuenta tiene movimientos. Para no perder histórico no se puede eliminar.');
        if (!confirm('¿Eliminar la cuenta?')) return;
        db.accounts = db.accounts.filter(x => x.id !== a.id); if (ui.acc === a.id) ui.acc = 'all';
        save(); s.close(); render();
      },
      save: (t, s) => {
        if (!f.name.trim()) return toast('Pon un nombre');
        const bal = toCents(f.bal || '0');
        if (isNaN(bal)) return toast('Saldo no válido');
        if (isNew) db.accounts.push({ id: uid(), name: f.name.trim(), icon: f.icon, color: f.color, initial: bal });
        else {
          Object.assign(a, { name: f.name.trim(), icon: f.icon, color: f.color });
          if (bal !== cur) db.transactions.push({ id: uid(), type: 'adjust', amount: bal - cur, cat: null, acc: a.id, to: null, date: new Date().toISOString(), note: '' });
        }
        save(); s.close(); render();
      },
    },
  });
}
function openAccountsList() {
  openSheet({
    cls: 'full',
    render: () => { const b = balances(); return `${head('Cuentas')}${db.accounts.map((a, i) => `<div style="display:flex;gap:6px;align-items:center"><button class="acard" style="flex:1" data-act="edit" data-id="${a.id}"><div><div class="n">${esc(a.name)}</div><div class="b">${money(b[a.id] || 0)}</div></div><span class="sq" style="background:${soft(a.color, .25)}">${a.icon}</span></button>
        <div style="display:flex;flex-direction:column;margin-bottom:12px"><button class="iconbtn" style="height:30px" data-act="up" data-i="${i}">▲</button><button class="iconbtn" style="height:30px" data-act="dn" data-i="${i}">▼</button></div></div>`).join('')}
      <button class="addcard" data-act="add">+ Toque para agregar una cuenta</button>
      <div class="form-foot"><button class="btn blue" data-act="transfer">⇄ Realizar una transferencia</button></div>`; },
    actions: {
      edit: (t, s) => openAccountEdit(acc(t.dataset.id)), add: () => openAccountEdit(null),
      transfer: () => openTxForm(null, 'tx', { type: 'transfer' }),
      up: (t, s) => move(db.accounts, +t.dataset.i, -1, s), dn: (t, s) => move(db.accounts, +t.dataset.i, 1, s),
    },
  });
}
function move(arr, i, d, s) {
  const j = i + d; if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]]; save(); render();
}

/* ---------------- Categorías ---------------- */
function openCategories(type = 'expense', onChange) {
  let tp = type;
  openSheet({
    cls: 'full',
    render: () => {
      const list = db.categories.filter(c => c.type === tp);
      return `${head('Categorías')}
      <div class="seg lg"><button class="${tp === 'income' ? 'on income' : ''}" data-act="tp" data-t="income">Ingresos</button><button class="${tp === 'expense' ? 'on expense' : ''}" data-act="tp" data-t="expense">Gasto</button></div>
      ${list.map(c => `<div style="display:flex;align-items:center"><button class="row" style="flex:1" data-act="edit" data-id="${c.id}">${ico(c)}<div class="main"><div class="name">${esc(c.name)}${c.hidden ? ' <span class="small">(oculta)</span>' : ''}</div></div></button>
        <button class="iconbtn" style="width:34px" data-act="up" data-id="${c.id}">▲</button><button class="iconbtn" style="width:34px" data-act="dn" data-id="${c.id}">▼</button></div>`).join('')}
      <div class="form-foot"><button class="btn ${tp === 'income' ? 'green' : 'pink'}" data-act="add">+ Nueva categoría</button></div>`;
    },
    actions: {
      tp: (t, s) => { tp = t.dataset.t; s.refresh(); },
      edit: (t, s) => openCategoryEdit(cat(t.dataset.id), tp, () => { s.refresh(); onChange?.(); }),
      add: (t, s) => openCategoryEdit(null, tp, () => { s.refresh(); onChange?.(); }),
      up: (t, s) => moveCat(t.dataset.id, -1, s), dn: (t, s) => moveCat(t.dataset.id, 1, s),
    },
  });
}
function moveCat(id, d, s) {
  const c = cat(id); const same = db.categories.filter(x => x.type === c.type);
  const i = same.indexOf(c), j = i + d; if (j < 0 || j >= same.length) return;
  const a = db.categories.indexOf(same[i]), b = db.categories.indexOf(same[j]);
  [db.categories[a], db.categories[b]] = [db.categories[b], db.categories[a]]; save(); render();
}
function openCategoryEdit(c, type, onDone) {
  const isNew = !c;
  const f = { name: c?.name || '', icon: c?.icon || '📄', color: c?.color || COLORS[0], hidden: !!c?.hidden };
  openSheet({
    cls: 'full',
    render: () => `${head(isNew ? 'Nueva categoría' : 'Editar categoría')}
      <div style="display:flex;justify-content:center;padding:10px">${ico(f, 'lg')}</div>
      <div class="field"><label>Nombre</label><input data-input="name" value="${esc(f.name)}"></div>
      <div class="field"><label>Color</label><div class="swatches">${COLORS.map(x => `<button class="${x === f.color ? 'on' : ''}" style="background:${x}" data-act="color" data-c="${x}"></button>`).join('')}</div></div>
      <div class="field"><label>Icono</label><div class="emojis">${EMOJIS.map(e => `<button class="${e === f.icon ? 'on' : ''}" data-act="emoji" data-e="${e}">${e}</button>`).join('')}</div></div>
      ${isNew ? '' : `<button class="set-row" data-act="hide"><span class="t">Ocultar al añadir transacciones</span><span class="switch ${f.hidden ? 'on' : ''}"></span></button>`}
      <div class="form-foot">${isNew ? '' : '<button class="btn ghost" data-act="del">Eliminar</button>'}<button class="btn navy" data-act="save">Guardar</button></div>`,
    actions: {
      name: t => f.name = t.value,
      color: (t, s) => { f.color = t.dataset.c; s.refresh(); },
      emoji: (t, s) => { f.icon = t.dataset.e; s.refresh(); },
      hide: (t, s) => { f.hidden = !f.hidden; s.refresh(); },
      del: (t, s) => {
        const n = db.transactions.filter(x => x.cat === c.id).length;
        if (n) return alert(`Esta categoría tiene ${n} movimientos. Para no perder histórico no se puede eliminar; puedes ocultarla.`);
        if (!confirm('¿Eliminar la categoría?')) return;
        db.categories = db.categories.filter(x => x.id !== c.id); delete db.budgets.cats[c.id];
        save(); s.close(); onDone?.(); render();
      },
      save: (t, s) => {
        if (!f.name.trim()) return toast('Pon un nombre');
        if (isNew) db.categories.push({ id: uid(), name: f.name.trim(), type, icon: f.icon, color: f.color });
        else Object.assign(c, { name: f.name.trim(), icon: f.icon, color: f.color, hidden: f.hidden });
        save(); s.close(); onDone?.(); render();
      },
    },
  });
}

/* ---------------- Recurrentes ---------------- */
function openRecurringList() {
  openSheet({
    cls: 'full',
    render: () => {
      const groups = ['day', 'week', 'month', 'year'].map(k => [k, db.recurring.filter(r => r.freq === k)]).filter(([, l]) => l.length);
      return `${head('Recurrente', 'Transacciones')}
        ${groups.map(([k, l]) => `<h2 class="sec" style="font-size:18px">${FREQS[k]}</h2>${l.map(r => {
          const c = r.type === 'transfer' ? TRANSFER_ICON : cat(r.cat);
          return `<button class="row" data-act="edit" data-id="${r.id}">${ico(c)}<div class="main"><div class="name">${esc(r.type === 'transfer' ? 'Transferencia' : c?.name)}</div><div class="sub">${esc(r.note ? r.note + ' · ' : '')}próxima: ${longDate(new Date(r.next))}</div></div><div class="amt ${r.type === 'income' ? 'green' : ''}">${money(r.amount)}</div></button>`;
        }).join('')}`).join('') || '<div class="empty-state">No tienes transacciones recurrentes.<br>Al crear una transacción puedes elegir que se repita.</div>'}
        <div class="form-foot"><button class="btn pink" data-act="add">+ Nueva recurrente</button></div>`;
    },
    actions: {
      edit: (t, s) => openTxForm(db.recurring.find(r => r.id === t.dataset.id), 'rule'),
      add: () => openTxForm(null, 'tx', { freq: 'month' }),
    },
    onRender: () => { },
  });
}

/* ---------------- Presupuestos ---------------- */
function openBudgetEdit(catId) {
  const c = cat(catId);
  let val = db.budgets.cats[catId] ? centsToInput(db.budgets.cats[catId]) : '';
  openSheet({
    render: () => `${head('Presupuesto mensual')}<div style="display:flex;align-items:center;gap:10px;padding:12px 0">${ico(c)}<b>${esc(c.name)}</b></div>
      <div class="field"><label>Límite al mes (${CURRENCIES[db.settings.currency]})</label><input data-input="v" inputmode="decimal" value="${esc(val)}" placeholder="0"></div>
      <div class="form-foot">${db.budgets.cats[catId] ? '<button class="btn ghost" data-act="del">Quitar</button>' : ''}<button class="btn navy" data-act="save">Guardar</button></div>`,
    actions: {
      v: t => val = t.value,
      del: (t, s) => { delete db.budgets.cats[catId]; save(); s.close(); render(); },
      save: (t, s) => { const v = toCents(val); if (!v || v < 0) return toast('Importe no válido'); db.budgets.cats[catId] = v; save(); s.close(); render(); },
    },
    onRender: s => setTimeout(() => s.el.querySelector('input')?.focus(), 300),
  });
}
function openGeneralBudget() {
  let mode = db.settings.budgetMode, val = db.budgets.general ? centsToInput(db.budgets.general) : '';
  openSheet({
    render: () => `${head('Presupuesto general')}
      <div class="seg lg" style="margin:10px 0"><button class="${mode === 'income' ? 'on income' : ''}" data-act="m" data-m="income">Según ingresos del mes</button><button class="${mode === 'fixed' ? 'on expense' : ''}" data-act="m" data-m="fixed">Cantidad fija</button></div>
      ${mode === 'fixed' ? `<div class="field"><label>Cantidad al mes</label><input data-input="v" inputmode="decimal" value="${esc(val)}"></div>` : '<div class="small">El presupuesto de cada mes será lo que hayas ingresado ese mes.</div>'}
      <div class="form-foot"><button class="btn navy" data-act="save">Guardar</button></div>`,
    actions: {
      m: (t, s) => { mode = t.dataset.m; s.refresh(); }, v: t => val = t.value,
      save: (t, s) => { db.settings.budgetMode = mode; if (mode === 'fixed') db.budgets.general = toCents(val || '0') || 0; save(); s.close(); render(); },
    },
  });
}

/* ---------------- Configuración y datos ---------------- */
function openSettings() {
  const st = db.settings;
  const sel = (key, opts) => `<select data-on="set" data-k="${key}">${Object.entries(opts).map(([k, l]) => `<option value="${k}" ${st[key] === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const sw = (key, label, ic) => `<button class="set-row" data-act="toggle" data-k="${key}"><span class="ic">${ic}</span><span class="t">${label}</span><span class="switch ${st[key] ? 'on' : ''}"></span></button>`;
  openSheet({
    cls: 'full',
    render: () => `${head('Configuración')}
      <div class="set-h">Características</div>
      <div class="set-row"><span class="ic">☾</span><span class="t">Modo oscuro</span><span class="v">${{ light: 'Claro', dark: 'Oscuro', auto: 'Automático' }[st.theme]} ${I.down.replace('<svg', '<svg width="12" height="12"')}</span>${sel('theme', { auto: 'Automático', light: 'Claro', dark: 'Oscuro' })}</div>
      <div class="set-row"><span class="ic">▤</span><span class="t">Presupuesto general</span><span class="v">${st.budgetMode === 'income' ? 'Ingresos' : 'Fijo'}</span>${sel('budgetMode', { income: 'Ingresos', fixed: 'Fijo' })}</div>
      <div class="set-h">Personalización</div>
      <div class="set-row"><span class="ic">€</span><span class="t">Moneda</span><span class="v">${st.currency}</span>${sel('currency', Object.fromEntries(Object.keys(CURRENCIES).map(k => [k, k])))}</div>
      ${sw('netWorth', 'Valor neto de la cuenta', '▣')}
      ${sw('decimals', 'Mostrar decimales dobles', '.00')}
      ${sw('counts', 'Número de transacciones', '10')}
      <div class="set-h">Sincronización</div>
      <button class="set-row" data-act="syncSetup"><span class="ic">⇅</span><span class="t">${sync?.token ? 'GitHub: ' + esc(sync.owner + '/' + sync.repo) : 'Sincronizar entre dispositivos'}<div class="small">${esc(syncStatus())}</div></span>›</button>
      ${sync?.token ? '<button class="set-row" data-act="syncNow"><span class="ic">⟳</span><span class="t">Sincronizar ahora</span></button>' : ''}
      <div class="set-h">Datos</div>
      <button class="set-row" data-act="backup"><span class="ic">☁︎</span><span class="t">Copia de seguridad<div class="small">${st.lastBackup ? 'Última: ' + longDate(new Date(st.lastBackup)) : 'Nunca'}</div></span>›</button>
      <button class="set-row" data-act="restore"><span class="ic">⤓</span><span class="t">Restaurar copia de seguridad</span>›</button>
      <button class="set-row" data-act="exportCsv"><span class="ic">⇪</span><span class="t">Exportar datos (CSV)</span>›</button>
      <button class="set-row" data-act="importCsv"><span class="ic">⇩</span><span class="t">Importar CSV de Savey</span>›</button>
      <button class="set-row" data-act="reset"><span class="ic">⟲</span><span class="t">Restablecer datos</span>›</button>
      <p class="small" style="margin-top:18px">${db.transactions.length} transacciones · ${db.accounts.length} cuentas · ${db.categories.length} categorías.<br>
      Los datos se guardan solo en este dispositivo. Haz copias de seguridad de vez en cuando y guárdalas en iCloud Drive: es lo que te permitirá pasar todo a otro iPhone.</p>`,
    actions: {
      set: (t, s) => { st[t.dataset.k] = t.value; save(); s.refresh(); render(); },
      toggle: (t, s) => { st[t.dataset.k] = !st[t.dataset.k]; save(); s.refresh(); render(); },
      syncSetup: () => openSyncSetup(),
      syncNow: (t, s) => { const p = syncNow(); s.refresh(); p.then(() => toast(sync?.lastError ? 'Error al sincronizar' : 'Sincronizado')); },
      backup: (t, s) => exportBackup().then(() => s.refresh()),
      restore: () => pickFile('.json,application/json', restoreBackup),
      exportCsv: () => exportCsv(),
      importCsv: () => pickFile('.csv,text/csv,text/comma-separated-values', importSaveyCsv),
      reset: (t, s) => {
        if (!confirm(sync?.token ? 'Se borrarán TODOS los datos, también en GitHub y en el resto de dispositivos sincronizados. ¿Seguro?' : 'Se borrarán TODOS los datos de este dispositivo. ¿Seguro?')) return;
        if (!confirm('Última confirmación: ¿has hecho una copia de seguridad? Esta acción no se puede deshacer.')) return;
        db = defaultDB(); save(); ui.acc = 'all'; s.close(); render(); toast('Datos restablecidos');
      },
    },
  });
}

function pickFile(accept, cb) {
  const inp = $('#filepick'); inp.value = ''; inp.accept = accept;
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(String(r.result), f.name); r.readAsText(f, 'utf-8'); };
  inp.click();
}
async function shareOrDownload(text, name, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}
async function exportBackup() {
  const name = `saveycustom-${dayKey(new Date())}.json`;
  const ok = await shareOrDownload(JSON.stringify({ app: 'saveycustom', exportedAt: new Date().toISOString(), ...db }, null, 1), name, 'application/json');
  if (ok) { db.settings.lastBackup = new Date().toISOString(); save(); render(); toast('Copia de seguridad creada'); }
}
function restoreBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return alert('El archivo no es una copia válida.'); }
  if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts) || !Array.isArray(data.categories)) return alert('El archivo no es una copia de SaveyCustom.');
  if (!confirm(`La copia tiene ${data.transactions.length} transacciones. Se REEMPLAZARÁN los datos actuales (${db.transactions.length} transacciones). ¿Continuar?`)) return;
  delete data.app; delete data.exportedAt;
  db = data; normalize(); processRecurring(); save();
  ui.acc = 'all'; sheets.slice().forEach(closeSheet); render(); toast('Copia restaurada');
}

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && !cur.trim()) { q = true; cur = ''; }
    else if (ch === ',') { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); if (row.some(x => x)) rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  row.push(cur.trim()); if (row.some(x => x)) rows.push(row);
  return rows;
}
function importSaveyCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2 || rows[0].length < 6) return alert('No parece un CSV exportado de Savey.');
  const body = rows.slice(1);
  if (!confirm(`El CSV tiene ${body.length} movimientos. Se REEMPLAZARÁN los datos actuales (${db.transactions.length} transacciones). Después podrás ajustar el saldo de cada cuenta en la pestaña Cuentas. ¿Continuar?`)) return;
  const nd = defaultDB(); nd.accounts = []; nd.settings = db.settings;
  const accByName = {}, catByKey = {};
  nd.categories.forEach(c => catByKey[c.type + '|' + c.name.toLowerCase()] = c);
  const getAcc = name => {
    if (!name) return null;
    if (!accByName[name]) {
      const a = { id: uid(), name, icon: '💳', color: COLORS[Object.keys(accByName).length % COLORS.length], initial: 0 };
      accByName[name] = a; nd.accounts.push(a);
    }
    return accByName[name].id;
  };
  const getCat = (raw, type) => {
    const name = SAVEY_NAMES[raw] || raw, k = type + '|' + name.toLowerCase();
    if (!catByKey[k]) { const c = { id: uid(), name, type, icon: '📄', color: COLORS[12] }; catByKey[k] = c; nd.categories.push(c); }
    return catByKey[k].id;
  };
  let bad = 0;
  for (const r of body) {
    const [date, kind, catName, accName, toName, amountRaw, note = ''] = r;
    const amount = Math.round(parseFloat(String(amountRaw).replace(',', '.')) * 100);
    const d = new Date(date);
    if (isNaN(amount) || isNaN(d)) { bad++; continue; }
    const t = { id: uid(), date: d.toISOString(), acc: getAcc(accName), to: null, cat: null, note, amount: Math.abs(amount) };
    if (kind === 'Income') { t.type = 'income'; t.cat = getCat(catName, 'income'); }
    else if (kind === 'Expense') { t.type = 'expense'; t.cat = getCat(catName, 'expense'); }
    else if (kind === 'Transfer') { t.type = 'transfer'; t.to = getAcc(toName); }
    else if (kind === 'Account') { t.type = 'adjust'; t.amount = amount; }
    else { bad++; continue; }
    nd.transactions.push(t);
  }
  if (!nd.accounts.length) nd.accounts = defaultDB().accounts;
  db = nd; save(); ui.acc = 'all'; sheets.slice().forEach(closeSheet); render();
  alert(`Importados ${nd.transactions.length} movimientos${bad ? ` (${bad} filas ignoradas)` : ''}.\n\nRevisa en la pestaña Cuentas que los saldos coinciden con Savey y corrígelos tocando cada cuenta si hace falta.`);
}
function exportCsv() {
  const q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = ['Fecha,Tipo de transacción,Categoría,Cuenta,Transferir a,Amount,Notas'];
  for (const t of [...db.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const kind = { income: 'Income', expense: 'Expense', transfer: 'Transfer', adjust: 'Account' }[t.type];
    const cname = t.type === 'transfer' ? 'Transfer' : t.type === 'adjust' ? 'Balance update' : cat(t.cat)?.name || '';
    const amt = t.type === 'expense' ? -t.amount : t.amount;
    lines.push([t.date, kind, q(cname), q(acc(t.acc)?.name || ''), q(t.to ? acc(t.to)?.name || '' : ''), (amt / 100).toFixed(2), q(t.note || '')].join(','));
  }
  shareOrDownload('﻿' + lines.join('\n'), `saveycustom-${dayKey(new Date())}.csv`, 'text/csv');
}

/* ---------------- Menú lateral ---------------- */
function openMenu() {
  openSheet({
    render: () => `${head('')}<div class="menu-list">
      <button data-act="rec"><span style="color:var(--accent);width:24px">${I.repeat}</span>Recurrente</button>
      <button data-act="accs"><span style="color:var(--accent);width:24px">${I.wallet}</span>Cuentas</button>
      <button data-act="cats"><span style="color:var(--accent);width:24px">${I.shapes}</span>Categorías</button></div>`,
    actions: {
      rec: (t, s) => { s.close(); openRecurringList(); },
      accs: (t, s) => { s.close(); openAccountsList(); },
      cats: (t, s) => { s.close(); openCategories(); },
    },
  });
}

/* ---------------- Acciones de la vista principal ---------------- */
const mainActions = {
  tab: t => { ui.tab = t.dataset.tab; render(); window.scrollTo(0, 0); },
  prevMonth: () => { ui.m--; if (ui.m < 0) { ui.m = 11; ui.y--; } render(); },
  nextMonth: () => { ui.m++; if (ui.m > 11) { ui.m = 0; ui.y++; } render(); },
  today: () => { const d = new Date(); ui.y = d.getFullYear(); ui.m = d.getMonth(); render(); },
  menu: () => openMenu(),
  settings: () => openSettings(),
  pickViewAcc: () => pickAccount(ui.acc, id => { ui.acc = id; render(); }, true),
  catDetail: t => openCatDetail(t.dataset.cat),
  editTx: t => { const tx = db.transactions.find(x => x.id === t.dataset.id); if (tx) openTxForm(tx); },
  ideasType: t => { ui.ideasType = t.dataset.type; ui.ideasSel = null; render(); },
  donutSel: t => { const id = t.dataset.cat || null; ui.ideasSel = id && ui.ideasSel !== id ? id : null; render(); },
  yearSummary: () => openYearSummary(),
  editAcc: t => openAccountEdit(acc(t.dataset.id)),
  newAcc: () => openAccountEdit(null),
  newTransfer: () => openTxForm(null, 'tx', { type: 'transfer' }),
  editGeneral: () => openGeneralBudget(),
  editBudget: t => openBudgetEdit(t.dataset.cat),
  addBudget: () => {
    const free = db.categories.filter(c => c.type === 'expense' && !db.budgets.cats[c.id]);
    if (!free.length) return toast('Todas las categorías tienen presupuesto');
    pickList('Elige categoría', free.map(c => [c.id, `${c.icon} ${esc(c.name)}`]), null, id => openBudgetEdit(id));
  },
  backup: () => exportBackup(),
};
document.addEventListener('click', ev => {
  if (ev.target.closest('.sheet-wrap')) return;
  if (ev.target.closest('#fab')) return openTxForm(null);
  const t = ev.target.closest('[data-act]');
  if (t) mainActions[t.dataset.act]?.(t, ev);
});

// Deslizar a izquierda/derecha para cambiar de mes
let sx = null, sy = null;
$('#view').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$('#view').addEventListener('touchend', e => {
  if (sx === null || ui.tab === 'accounts') return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? mainActions.nextMonth : mainActions.prevMonth)();
}, { passive: true });

function applyTheme() {
  const th = db.settings.theme;
  if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#17181c' : '#f3eeeb';
}

/* ---------------- Sincronización con un repositorio privado de GitHub ----------------
   La configuración (con el token) se guarda aparte y nunca entra en las copias de seguridad. */
const SYNC_KEY = 'mc.sync';
const SYNC_FILE = 'datos.json';
let sync = null;
try { sync = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { }
let syncing = false, syncAgain = false, syncTimer = null;
const saveSyncCfg = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { } };
const deviceName = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'navegador';

const b64enc = s => {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));

function syncPayload(d) {
  return { version: 1, accounts: d.accounts, categories: d.categories, transactions: d.transactions, recurring: d.recurring, budgets: d.budgets, budgetsU: d.budgetsU || 0, deleted: d.deleted || {} };
}
// Representación ordenada por id, para comparar contenidos sin que importe el orden
function canon(d) {
  const p = syncPayload(d), o = {};
  for (const k of SYNC_FIELDS) o[k] = [...(p[k] || [])].sort((a, b) => a.id < b.id ? -1 : 1);
  o.budgets = p.budgets; o.budgetsU = p.budgetsU; o.deleted = Object.keys(p.deleted).sort().map(k => [k, p.deleted[k]]);
  return JSON.stringify(o);
}
// Combina registro a registro: gana la versión modificada más recientemente; los borrados se respetan.
function mergeData(L, R) {
  const out = { ...L }, del = { ...(R.deleted || {}) };
  for (const [id, t] of Object.entries(L.deleted || {})) del[id] = Math.max(del[id] || 0, t);
  const dead = r => del[r.id] && del[r.id] >= (r.u || 0);
  for (const k of SYNC_FIELDS) {
    const rm = new Map((R[k] || []).map(r => [r.id, r])), seen = new Set(), res = [];
    for (const l of L[k] || []) {
      const r = rm.get(l.id); seen.add(l.id);
      const pick = r && (r.u || 0) > (l.u || 0) ? r : l;
      if (!dead(pick)) res.push(pick);
    }
    for (const r of R[k] || []) if (!seen.has(r.id) && !dead(r)) res.push(r);
    out[k] = res;
  }
  out.deleted = del;
  if ((R.budgetsU || 0) > (L.budgetsU || 0)) { out.budgets = R.budgets; out.budgetsU = R.budgetsU; }
  return out;
}

async function gh(path, opts = {}, cfg = sync) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`, {
    ...opts, cache: 'no-store',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return res;
}
function ghError(res) {
  if (res.status === 401) return 'El token no es válido o ha caducado';
  if (res.status === 403) return 'El token no tiene permiso de escritura en el repositorio';
  if (res.status === 404) return 'No se encuentra el repositorio (revisa usuario, nombre y permisos del token)';
  return 'Error de GitHub ' + res.status;
}
async function pullRemote(cfg = sync) {
  const r = await gh(`/contents/${SYNC_FILE}`, {}, cfg);
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw new Error(ghError(r));
  const j = await r.json();
  let b64 = j.content;
  if (!b64 || j.encoding === 'none') { // archivos de más de 1 MB
    const b = await gh(`/git/blobs/${j.sha}`, {}, cfg);
    if (!b.ok) throw new Error(ghError(b));
    b64 = (await b.json()).content;
  }
  return { sha: j.sha, data: JSON.parse(b64dec(b64)) };
}
function applyRemote(newDb) {
  const changed = canon(newDb) !== canon(db);
  db = newDb; normalize(); saveRaw();
  if (processRecurring()) return true;
  return changed;
}
function scheduleSync(delay = 1500) {
  if (!sync?.token) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, delay);
}
async function syncNow() {
  clearTimeout(syncTimer); syncTimer = null;
  if (!sync?.token || !navigator.onLine) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true; let changed = false;
  try {
    for (let attempt = 0; ; attempt++) {
      const { sha, data } = await pullRemote();
      if (data) changed = applyRemote(mergeData(db, data)) || changed;
      if (data && canon(data) === canon(db)) break; // la nube ya está al día
      const res = await gh(`/contents/${SYNC_FILE}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `Cambios desde ${deviceName}`, content: b64enc(JSON.stringify(syncPayload(db))), ...(sha ? { sha } : {}) }),
      });
      if (res.ok) break;
      if ((res.status === 409 || res.status === 422) && attempt < 3) continue; // otro dispositivo subió algo a la vez: reintentar
      throw new Error(ghError(res));
    }
    sync.lastSync = new Date().toISOString(); sync.lastError = null;
  } catch (e) {
    sync.lastError = e.message || String(e);
  } finally {
    syncing = false; saveSyncCfg();
    if (changed) render(); else sheets.forEach(s => s.live && s.refresh());
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}
function syncStatus() {
  if (!sync?.token) return 'Desactivada';
  if (syncing) return 'Sincronizando…';
  if (sync.lastError) return '⚠️ ' + sync.lastError;
  if (!sync.lastSync) return 'Pendiente';
  const m = Math.round((Date.now() - new Date(sync.lastSync)) / 60000);
  return 'Sincronizado ' + (m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : longDate(new Date(sync.lastSync)));
}
function openSyncSetup() {
  const f = { owner: sync?.owner || '', repo: sync?.repo || 'savey-data', token: sync?.token || '' };
  let busy = false;
  openSheet({
    cls: 'full',
    render: () => `${head('Sincronización')}
      <p class="small">Tus datos se guardan en un repositorio <b>privado</b> de tu cuenta de GitHub, y todos los dispositivos conectados ven lo mismo. Cada cambio queda en el historial del repositorio, así que también sirve de copia de seguridad.</p>
      <div class="field"><label>Usuario de GitHub</label><input data-input="owner" value="${esc(f.owner)}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <div class="field"><label>Repositorio privado</label><input data-input="repo" value="${esc(f.repo)}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <div class="field"><label>Token</label><input data-input="token" type="password" value="${esc(f.token)}" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <p class="small">El token se guarda solo en este dispositivo y no se incluye en las copias de seguridad.</p>
      <div class="form-foot">${sync?.token ? '<button class="btn ghost" data-act="off">Desconectar</button>' : ''}<button class="btn navy" data-act="connect">${busy ? 'Conectando…' : sync?.token ? 'Guardar' : 'Conectar'}</button></div>`,
    actions: {
      owner: t => f.owner = t.value.trim(), repo: t => f.repo = t.value.trim(), token: t => f.token = t.value.trim(),
      off: (t, s) => {
        if (!confirm('¿Desconectar este dispositivo? Los datos se quedan aquí y en GitHub, pero dejarán de sincronizarse.')) return;
        sync = null; localStorage.removeItem(SYNC_KEY); s.close(); render();
      },
      connect: async (t, s) => {
        if (busy) return;
        if (!f.owner || !f.repo || !f.token) return toast('Rellena los tres campos');
        const cfg = { owner: f.owner, repo: f.repo, token: f.token };
        busy = true; s.refresh();
        try {
          const r = await gh('', {}, cfg);
          if (!r.ok) throw new Error(ghError(r));
          const info = await r.json();
          if (!info.private) throw new Error('El repositorio es PÚBLICO. Hazlo privado (Settings → General → Change visibility) antes de guardar tus datos en él.');
          const { data } = await pullRemote(cfg);
          if (data && data.transactions?.length) {
            const replace = confirm(`En GitHub ya hay datos (${data.transactions.length} movimientos).\n\nAceptar: usar los de GitHub y descartar los de este dispositivo (${db.transactions.length} movimientos). Recomendado si este no es tu dispositivo principal.\n\nCancelar: combinar ambos.`);
            if (replace) { db = { ...data, settings: db.settings }; normalize(); saveRaw(); }
          }
          sync = { ...cfg, lastSync: null, lastError: null }; saveSyncCfg();
          busy = false; s.close();
          await syncNow(); render();
          toast(sync.lastError ? 'Error al sincronizar' : 'Sincronización activada');
        } catch (e) {
          busy = false; s.refresh(); alert(e.message || String(e));
        }
      },
    },
  });
}

/* ---------------- Arranque ---------------- */
load();
processRecurring();
render();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (syncTimer) syncNow(); return; } // sube lo pendiente antes de que iOS congele la app
  if (processRecurring()) render();
  syncNow();
});
window.addEventListener('online', () => syncNow());
syncNow();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
if (navigator.storage?.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
