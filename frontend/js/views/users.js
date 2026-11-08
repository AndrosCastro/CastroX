import { api, auth } from '../api.js';
import { icon, esc, toast, fmtDate, fmtQty, emptyState, loading, openModal, confirmDialog, formToObject, setBusy, initials } from '../ui.js';

export async function renderUsers(root) {
  if (!auth.isAdmin) {
    root.innerHTML = `<div class="card">${emptyState('Acceso restringido', 'Solo los administradores pueden gestionar usuarios.', 'alert')}</div>`;
    return;
  }
  root.innerHTML = `
    <div class="toolbar">
      <p class="muted grow" style="margin:0"><b>Administrador:</b> acceso total. <b>Operador:</b> registra productos y movimientos, pero no elimina ni gestiona usuarios.</p>
      <button class="btn primary" data-new>${icon('plus', 18)}Nuevo usuario</button>
    </div>
    <div class="card" data-table>${loading()}</div>`;
  const box = root.querySelector('[data-table]');

  const load = async () => {
    try {
      const users = await api('/users');
      box.innerHTML = `
        <div class="table-wrap"><table class="table responsive">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th class="text-right">Movimientos</th><th>Creado</th><th class="text-right">Acciones</th></tr></thead>
          <tbody>${users.map((u) => `
            <tr data-id="${u.id}">
              <td class="td-main"><div class="prod-cell"><div class="avatar">${esc(initials(u.fullName))}</div><div><strong>${esc(u.fullName)}${u.id === auth.user.id ? ' <span class="badge info">Tú</span>' : ''}</strong><span class="muted small">@${esc(u.username)}</span></div></div></td>
              <td data-label="Rol"><span class="badge ${u.role === 'admin' ? 'info' : 'neutral'}">${u.role === 'admin' ? 'Administrador' : 'Operador'}</span></td>
              <td data-label="Estado"><span class="badge ${u.active ? 'success' : 'danger'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
              <td data-label="Movimientos" class="text-right">${fmtQty(u.movements)}</td>
              <td data-label="Creado">${fmtDate(u.createdAt)}</td>
              <td><div class="actions">
                <button class="icon-btn" data-a="edit" title="Editar">${icon('edit', 18)}</button>
                ${u.id !== auth.user.id ? `<button class="icon-btn danger" data-a="delete" title="Eliminar">${icon('trash', 18)}</button>` : ''}
              </div></td>
            </tr>`).join('')}</tbody>
        </table></div>`;
      const byId = new Map(users.map((u) => [u.id, u]));
      box.querySelectorAll('tr[data-id]').forEach((tr) => {
        const u = byId.get(Number(tr.dataset.id));
        tr.querySelector('[data-a="edit"]').addEventListener('click', () => openUserForm(u, load));
        tr.querySelector('[data-a="delete"]')?.addEventListener('click', async () => {
          const ok = await confirmDialog(`¿Eliminar al usuario "${u.fullName}"? Sus movimientos se conservarán sin autor. Si solo quieres bloquear el acceso, mejor desactívalo.`, { title: 'Eliminar usuario', okText: 'Eliminar', danger: true });
          if (!ok) return;
          try {
            await api(`/users/${u.id}`, { method: 'DELETE' });
            toast('Usuario eliminado', 'success');
            load();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      box.innerHTML = emptyState('Error', err.message, 'alert');
    }
  };

  root.querySelector('[data-new]').addEventListener('click', () => openUserForm(null, load));
  await load();
}

function openUserForm(user, onSaved) {
  const isEdit = !!user;
  const u = user || { username: '', fullName: '', role: 'operador', active: true };
  const modal = openModal({
    title: isEdit ? 'Editar usuario' : 'Nuevo usuario',
    body: `
      <form id="user-form" class="stack" novalidate>
        <div class="form-error hidden"></div>
        <div class="field"><label>Nombre completo *</label><input class="input" name="fullName" value="${esc(u.fullName)}" maxlength="100" autofocus /></div>
        <div class="field"><label>Usuario *</label><input class="input" name="username" value="${esc(u.username)}" maxlength="50" autocapitalize="none" ${isEdit ? 'disabled' : ''} /></div>
        <div class="field"><label>${isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label><input class="input" name="password" type="password" autocomplete="new-password" placeholder="${isEdit ? 'Déjala vacía para no cambiarla' : 'Mínimo 6 caracteres'}" /></div>
        <div class="field"><label>Rol</label>
          <select class="input" name="role">
            <option value="operador" ${u.role === 'operador' ? 'selected' : ''}>Operador</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        ${isEdit ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} /> Usuario activo (puede iniciar sesión)</label>` : ''}
      </form>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" form="user-form">Guardar</button>`,
  });
  const form = modal.el.querySelector('#user-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const data = formToObject(form);
    const btn = modal.el.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try {
      if (isEdit) {
        await api(`/users/${u.id}`, { method: 'PUT', body: { fullName: data.fullName, role: data.role, active: form.elements.active.checked, password: data.password } });
      } else {
        await api('/users', { method: 'POST', body: data });
      }
      toast(isEdit ? 'Usuario actualizado' : 'Usuario creado', 'success');
      modal.close();
      onSaved();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
      setBusy(btn, false);
    }
  });
}
