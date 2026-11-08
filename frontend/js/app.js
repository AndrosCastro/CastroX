// CastroX · Aplicación principal (SPA con rutas por hash)
import { api, auth } from './api.js';
import { icon, esc, initials, confirmDialog } from './ui.js';
import { toggleTheme } from './theme.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderScan } from './views/scan.js';
import { renderProducts } from './views/products.js';
import { renderMovements } from './views/movements.js';
import { renderCategories } from './views/categories.js';
import { renderUsers } from './views/users.js';
import { renderSettings } from './views/settings.js';

const ROUTES = {
  '/dashboard': { title: 'Panel', icon: 'dashboard', render: renderDashboard },
  '/scan': { title: 'Escanear', icon: 'scan', render: renderScan },
  '/products': { title: 'Productos', icon: 'box', render: renderProducts },
  '/movements': { title: 'Movimientos', icon: 'arrows', render: renderMovements },
  '/categories': { title: 'Categorías', icon: 'tag', render: renderCategories },
  '/users': { title: 'Usuarios', icon: 'users', render: renderUsers, admin: true },
  '/settings': { title: 'Ajustes', icon: 'settings', render: renderSettings },
};

const app = document.getElementById('app');
let cleanup = null;
let layoutReady = false;
let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, search = ''] = raw.split('?');
  return { path, query: new URLSearchParams(search) };
}

function navLink(path, extraClass = '') {
  const r = ROUTES[path];
  return `<a href="#${path}" data-path="${path}" class="${extraClass}">${icon(r.icon)}<span>${r.title}</span></a>`;
}

function renderLayout() {
  const u = auth.user;
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#/dashboard"><img src="/img/icon.svg" alt="" /><b>CastroX</b></a>
        <nav class="nav">
          ${navLink('/scan', 'scan-link')}
          <div class="nav-label">Inventario</div>
          ${navLink('/dashboard')}
          ${navLink('/products')}
          ${navLink('/movements')}
          ${navLink('/categories')}
          <div class="nav-label">Sistema</div>
          ${auth.isAdmin ? navLink('/users') : ''}
          ${navLink('/settings')}
        </nav>
        <div class="sidebar-user">
          <div class="avatar">${esc(initials(u.fullName))}</div>
          <div class="info"><strong>${esc(u.fullName)}</strong><span>${u.role === 'admin' ? 'Administrador' : 'Operador'}</span></div>
          <button class="icon-btn" data-logout title="Cerrar sesión">${icon('logout', 18)}</button>
        </div>
      </aside>
      <div class="overlay" id="overlay"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-menu aria-label="Menú">${icon('menu')}</button>
          <h1 id="page-title"></h1>
          <a class="btn sm hide-mobile" href="#/scan">${icon('scan', 16)}Escanear</a>
          <button class="icon-btn" data-theme title="Cambiar tema">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        </header>
        <main class="content" id="view"></main>
      </div>
      <nav class="bottom-nav">
        ${navLink('/dashboard')}
        ${navLink('/products')}
        <a href="#/scan" data-path="/scan" class="scan-fab"><span class="fab">${icon('scan', 26)}</span><span>Escanear</span></a>
        ${navLink('/movements')}
        ${navLink('/settings')}
      </nav>
    </div>`;

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const closeMenu = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
  app.querySelector('[data-menu]').addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('show'); });
  overlay.addEventListener('click', closeMenu);
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));
  app.querySelector('[data-theme]').addEventListener('click', (e) => {
    toggleTheme();
    e.currentTarget.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
  });
  app.querySelector('[data-logout]').addEventListener('click', async () => {
    if (await confirmDialog('¿Deseas cerrar tu sesión?', { title: 'Cerrar sesión', okText: 'Salir' })) {
      auth.clear();
      location.hash = '#/login';
    }
  });
  layoutReady = true;
}

async function router() {
  const { path, query } = parseHash();
  const token = ++renderToken;

  if (typeof cleanup === 'function') {
    try { await cleanup(); } catch { /* ignorar */ }
  }
  cleanup = null;
  document.getElementById('modal-root').innerHTML = '';

  if (!auth.token) {
    layoutReady = false;
    if (path !== '/login') { location.hash = '#/login'; return; }
    document.title = 'Iniciar sesión · CastroX';
    renderLogin(app, () => { location.hash = '#/dashboard'; });
    return;
  }
  if (path === '/login') { location.hash = '#/dashboard'; return; }

  const route = ROUTES[path];
  if (!route || (route.admin && !auth.isAdmin)) { location.hash = '#/dashboard'; return; }

  if (!layoutReady) renderLayout();
  document.getElementById('page-title').textContent = route.title;
  document.title = `${route.title} · CastroX`;
  app.querySelectorAll('[data-path]').forEach((a) => a.classList.toggle('active', a.dataset.path === path));

  const view = document.getElementById('view');
  view.innerHTML = '';
  window.scrollTo(0, 0);
  const result = await route.render(view, { query });
  if (token === renderToken) cleanup = result;
  else if (typeof result === 'function') result();
}

window.addEventListener('hashchange', router);
window.addEventListener('themechange', () => {
  if (parseHash().path === '/dashboard') router();
});

// Verifica la sesión guardada al iniciar
(async function boot() {
  if (auth.token) {
    try {
      const { user } = await api('/auth/me');
      auth.save(auth.token, user);
    } catch { /* api() limpia la sesión si expiró */ }
  }
  router();
})();
