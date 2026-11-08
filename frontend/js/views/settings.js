import { api, auth, isApp, qrUrl } from '../api.js';
import { icon, esc, toast, prefs, CURRENCIES, formToObject, setBusy, initials } from '../ui.js';
import { applyTheme } from '../theme.js';

export function renderSettings(root) {
  const u = auth.user;
  const theme = document.documentElement.dataset.theme;
  root.innerHTML = `
    ${u.mustChangePassword ? `<div class="notice warning" style="margin-bottom:18px">${icon('alert', 18)}<div><b>Por seguridad, cambia la contraseña inicial</b> antes de usar la aplicación. Nadie más debe poder entrar con la contraseña por defecto.</div></div>` : ''}
    <div class="grid halves">
      <div class="stack">
        <div class="card card-pad">
          <div class="row">
            <div class="avatar" style="width:56px;height:56px;font-size:20px">${esc(initials(u.fullName))}</div>
            <div><h3>${esc(u.fullName)}</h3><div class="muted">@${esc(u.username)} · ${u.role === 'admin' ? 'Administrador' : 'Operador'}</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Preferencias</h3></div>
          <div class="card-body stack">
            <div class="field">
              <label>Tema</label>
              <div class="segmented" data-theme-switch>
                <button type="button" data-v="light" class="${theme === 'light' ? 'active' : ''}">${icon('sun', 16)}Claro</button>
                <button type="button" data-v="dark" class="${theme === 'dark' ? 'active' : ''}">${icon('moon', 16)}Oscuro</button>
              </div>
            </div>
            <div class="field">
              <label>Moneda</label>
              <select class="input" data-currency>
                ${Object.keys(CURRENCIES).map((c) => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <label class="check"><input type="checkbox" data-pref="sound" ${prefs.get('sound', 'on') === 'on' ? 'checked' : ''} /> Sonido y vibración al escanear</label>
            <label class="check"><input type="checkbox" data-pref="autostart" ${prefs.get('autostart', 'on') === 'on' ? 'checked' : ''} /> Encender la cámara automáticamente al abrir el escáner</label>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Cambiar contraseña</h3></div>
        <form class="card-body stack" id="pwd-form" novalidate>
          <div class="form-error hidden"></div>
          <div class="field"><label>Contraseña actual</label><input class="input" type="password" name="currentPassword" autocomplete="current-password" /></div>
          <div class="field"><label>Nueva contraseña</label><input class="input" type="password" name="newPassword" autocomplete="new-password" placeholder="Mínimo 6 caracteres" /></div>
          <div class="field"><label>Confirmar nueva contraseña</label><input class="input" type="password" name="confirm" autocomplete="new-password" /></div>
          <button class="btn primary" type="submit">Actualizar contraseña</button>
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="card-head"><h3>${icon('scan', 18)} App Android</h3></div>
      <div class="card-body">
        ${isApp ? `
          <div class="stack">
            <p style="margin:0">Estás usando la app de CastroX <b>v${esc(window.CastroXApp.getVersion())}</b>.</p>
            <div class="field"><label>Servidor conectado</label><input class="input mono" value="${esc(location.origin)}" disabled /></div>
            <button class="btn" data-change-server>${icon('settings', 18)}Cambiar servidor</button>
          </div>` : `
          <div class="detail" style="grid-template-columns:180px 1fr">
            <div class="qr-box"><img src="${qrUrl(location.origin, 360)}" alt="QR de conexión" /><div class="mono small">${esc(location.origin)}</div></div>
            <div class="stack">
              <p style="margin:0"><b>1.</b> Descarga e instala la app en el teléfono Android.</p>
              <a class="btn primary" href="/downloads/CastroX.apk" download>${icon('download', 18)}Descargar APK para Android</a>
              <p style="margin:0"><b>2.</b> Abre la app y toca <i>Escanear código QR de conexión</i>. Luego apunta a este código para conectarla con este servidor.</p>
              <p class="muted small" style="margin:0">Al instalar, Android puede pedir permiso para "instalar apps desconocidas". Es normal porque la app no viene de Google Play.</p>
            </div>
          </div>`}
      </div>
    </div>`;
  root.querySelector('[data-change-server]')?.addEventListener('click', () => window.CastroXApp.changeServer());

  root.querySelectorAll('[data-theme-switch] button').forEach((b) => b.addEventListener('click', () => {
    applyTheme(b.dataset.v);
    root.querySelectorAll('[data-theme-switch] button').forEach((x) => x.classList.toggle('active', x === b));
  }));
  const cur = root.querySelector('[data-currency]');
  cur.value = prefs.get('currency', 'HNL');
  cur.addEventListener('change', () => { prefs.set('currency', cur.value); toast(`Moneda cambiada a ${cur.value}`, 'success'); });
  root.querySelectorAll('[data-pref]').forEach((c) => c.addEventListener('change', () => prefs.set(c.dataset.pref, c.checked ? 'on' : 'off')));

  const form = root.querySelector('#pwd-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    err.classList.add('hidden');
    const data = formToObject(form);
    if (data.newPassword !== data.confirm) {
      err.textContent = 'Las contraseñas nuevas no coinciden';
      err.classList.remove('hidden');
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try {
      const r = await api('/auth/password', { method: 'PUT', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
      const wasForced = auth.user.mustChangePassword;
      if (r?.token) auth.save(r.token, r.user);
      toast('Contraseña actualizada', 'success');
      form.reset();
      if (wasForced) location.hash = '#/dashboard';
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    } finally {
      setBusy(btn, false);
    }
  });
}
