import { api, auth } from '../api.js';
import { icon, esc, setBusy } from '../ui.js';

export function renderLogin(root, onLogin) {
  root.innerHTML = `
    <div class="login-page">
      <section class="login-hero">
        <div class="brand"><img src="/img/icon.svg" alt="" /><b>CastroX</b></div>
        <div style="position:relative;z-index:1">
          <h1>Tu inventario,<br/>bajo control.</h1>
          <p>Escanea códigos QR, registra entradas y salidas y conoce tu stock en tiempo real desde cualquier dispositivo.</p>
          <div class="login-features">
            <div><span>${icon('scan')}</span>Lectura de códigos QR y de barras con la cámara</div>
            <div><span>${icon('box')}</span>Registro rápido de productos y cantidades</div>
            <div><span>${icon('alert')}</span>Alertas automáticas de stock bajo</div>
            <div><span>${icon('printer')}</span>Etiquetas QR listas para imprimir</div>
          </div>
        </div>
        <small style="opacity:.7;position:relative;z-index:1">© ${new Date().getFullYear()} CastroX · Inventario inteligente</small>
      </section>
      <section class="login-form-wrap">
        <form class="login-card stack" id="login-form" novalidate>
          <div>
            <h2>Iniciar sesión</h2>
            <p class="muted" style="margin:0">Ingresa con tu usuario para continuar</p>
          </div>
          <div class="form-error hidden"></div>
          <div class="field">
            <label for="username">Usuario</label>
            <input class="input lg" id="username" name="username" autocomplete="username" autocapitalize="none" required autofocus />
          </div>
          <div class="field">
            <label for="password">Contraseña</label>
            <input class="input lg" id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn primary lg block" type="submit">Entrar</button>
          <div class="hint">${icon('info', 16)} Primer acceso: usuario <b>admin</b> y contraseña <b>admin123</b>. Cámbiala en <i>Ajustes</i>.</div>
        </form>
      </section>
    </div>`;

  const form = root.querySelector('#login-form');
  const err = form.querySelector('.form-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    if (!username || !password) {
      err.textContent = 'Escribe tu usuario y contraseña';
      err.classList.remove('hidden');
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Entrando…');
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      auth.save(token, user);
      onLogin();
    } catch (ex) {
      err.innerHTML = esc(ex.message);
      err.classList.remove('hidden');
      setBusy(btn, false);
    }
  });
}
