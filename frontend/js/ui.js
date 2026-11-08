// Utilidades de interfaz: íconos, formato, toasts, modales
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  arrows: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  in: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  out: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  adjust: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  cameraOff: '<line x1="2" x2="22" y1="2" y2="22"/><path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/><path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/><path d="M14.121 15.121A3 3 0 1 1 9.88 10.88"/>',
  dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Preferencias ----------
export const prefs = {
  get(key, def) { try { return localStorage.getItem(`castrox_${key}`) ?? def; } catch { return def; } },
  set(key, val) { try { localStorage.setItem(`castrox_${key}`, val); } catch { /* ignorar */ } },
};

// ---------- Formato ----------
export const CURRENCIES = { MXN: 'es-MX', USD: 'en-US', EUR: 'es-ES', COP: 'es-CO', ARS: 'es-AR', CLP: 'es-CL', PEN: 'es-PE', GTQ: 'es-GT', HNL: 'es-HN' };
export function fmtMoney(n) {
  const cur = prefs.get('currency', 'HNL');
  try {
    return new Intl.NumberFormat(CURRENCIES[cur] || 'es-HN', { style: 'currency', currency: cur }).format(Number(n) || 0);
  } catch {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }
}
const qtyFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
export const fmtQty = (n) => qtyFmt.format(Number(n) || 0);
export const fmtDate = (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtDay = (d) => new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
export function timeAgo(d) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `hace ${Math.floor(s / 86400)} d`;
  return fmtDate(d);
}
export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// ---------- Componentes de inventario ----------
export const MOVE_TYPES = {
  IN: { label: 'Entrada', icon: 'in', tone: 'success' },
  OUT: { label: 'Salida', icon: 'out', tone: 'danger' },
  ADJUST: { label: 'Ajuste', icon: 'adjust', tone: 'info' },
};

export function stockStatus(p) {
  const q = Number(p.quantity), min = Number(p.minStock);
  if (q <= 0) return { tone: 'danger', label: 'Agotado' };
  if (q <= min) return { tone: 'warning', label: 'Stock bajo' };
  return { tone: 'success', label: 'Disponible' };
}

export function stockBadge(p) {
  const s = stockStatus(p);
  return `<span class="badge ${s.tone}">${fmtQty(p.quantity)} ${esc(p.unit || '')}</span>`;
}

export function productThumb(p) {
  const color = p.categoryColor || '#6366f1';
  return `<div class="prod-thumb" style="background:${esc(color)}">${esc(initials(p.name).slice(0, 2))}</div>`;
}

export function categoryBadge(p) {
  if (!p.categoryName) return '<span class="badge neutral">Sin categoría</span>';
  return `<span class="badge neutral"><span class="dot" style="background:${esc(p.categoryColor)}"></span>${esc(p.categoryName)}</span>`;
}

export function movementQty(m) {
  const t = MOVE_TYPES[m.type];
  const sign = m.type === 'IN' ? '+' : m.type === 'OUT' ? '−' : Number(m.quantity) >= 0 ? '+' : '−';
  return `<span class="badge ${t.tone}">${sign}${fmtQty(Math.abs(m.quantity))}</span>`;
}

export function emptyState(title, text = '', iconName = 'box', action = '') {
  return `<div class="empty"><div class="empty-icon">${icon(iconName, 30)}</div><h4>${esc(title)}</h4><p>${esc(text)}</p>${action}</div>`;
}

export const loading = () => '<div class="loading-block"><div class="spinner"></div></div>';

// ---------- Toasts ----------
export function toast(message, type = 'info', ms = 3200) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ic = { success: 'check', error: 'alert', warning: 'alert', info: 'info' }[type] || 'info';
  el.innerHTML = `${icon(ic, 18)}<div>${esc(message)}</div>`;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

// ---------- Modales ----------
export function openModal({ title, body, footer = '', size = '', onClose } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 180);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const first = wrap.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 60);
  return { el: wrap, close };
}

export function confirmDialog(message, { title = 'Confirmar', okText = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      size: 'sm',
      body: `<p style="margin:0">${esc(message)}</p>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); m.close(); });
  });
}

export function formToObject(form) {
  const obj = {};
  new FormData(form).forEach((v, k) => { obj[k] = typeof v === 'string' ? v.trim() : v; });
  return obj;
}

export function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner sm"></span>${text ? esc(text) : ''}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- Sonido ----------
let audioCtx;
export function beep(ok = true) {
  if (prefs.get('sound', 'on') !== 'on') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = ok ? 'sine' : 'square';
    o.frequency.value = ok ? 1100 : 220;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (ok ? 0.12 : 0.3));
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (ok ? 0.12 : 0.3));
    if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
  } catch { /* sin audio */ }
}

export function pagination(data, onPage) {
  const el = document.createElement('div');
  el.className = 'pagination';
  const from = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = Math.min(data.total, data.page * data.pageSize);
  el.innerHTML = `
    <span class="muted small">Mostrando ${from}–${to} de ${data.total}</span>
    <div class="row">
      <button class="btn sm" data-p="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="small">Página ${data.page} de ${data.pages}</span>
      <button class="btn sm" data-p="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Siguiente</button>
    </div>`;
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
  return el;
}
