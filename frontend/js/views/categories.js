import { api, auth } from '../api.js';
import { icon, esc, toast, fmtQty, emptyState, loading, openModal, confirmDialog, formToObject, setBusy } from '../ui.js';

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b'];

export async function renderCategories(root) {
  root.innerHTML = `
    <div class="toolbar">
      <p class="muted grow" style="margin:0">Organiza tus productos en grupos para encontrarlos más rápido.</p>
      <button class="btn primary" data-new>${icon('plus', 18)}Nueva categoría</button>
    </div>
    <div data-grid>${loading()}</div>`;
  const grid = root.querySelector('[data-grid]');

  const load = async () => {
    try {
      const cats = await api('/categories');
      if (!cats.length) {
        grid.innerHTML = `<div class="card">${emptyState('Sin categorías', 'Crea tu primera categoría.', 'tag')}</div>`;
        return;
      }
      grid.innerHTML = `<div class="cat-grid">${cats.map((c) => `
        <div class="card cat-card" style="--c:${esc(c.color)}" data-id="${c.id}">
          <div class="row">
            <span class="dot" style="background:${esc(c.color)};width:12px;height:12px"></span>
            <h3 class="grow" style="font-size:17px">${esc(c.name)}</h3>
            <button class="icon-btn" data-a="edit" title="Editar">${icon('edit', 18)}</button>
            ${auth.isAdmin ? `<button class="icon-btn danger" data-a="delete" title="Eliminar">${icon('trash', 18)}</button>` : ''}
          </div>
          <p class="muted small" style="margin:0;min-height:20px">${esc(c.description || 'Sin descripción')}</p>
          <div class="cat-stats">
            <div><strong>${fmtQty(c.productCount)}</strong><span class="muted small">productos</span></div>
            <div><strong>${fmtQty(c.units)}</strong><span class="muted small">unidades</span></div>
          </div>
          <a class="btn sm" href="#/products?categoryId=${c.id}">Ver productos</a>
        </div>`).join('')}</div>`;
      const byId = new Map(cats.map((c) => [c.id, c]));
      grid.querySelectorAll('[data-id]').forEach((card) => {
        const c = byId.get(Number(card.dataset.id));
        card.querySelector('[data-a="edit"]').addEventListener('click', () => openCategoryForm(c, load));
        card.querySelector('[data-a="delete"]')?.addEventListener('click', async () => {
          const ok = await confirmDialog(`¿Eliminar la categoría "${c.name}"? Sus ${c.productCount} producto(s) quedarán sin categoría.`, { title: 'Eliminar categoría', okText: 'Eliminar', danger: true });
          if (!ok) return;
          try {
            await api(`/categories/${c.id}`, { method: 'DELETE' });
            toast('Categoría eliminada', 'success');
            load();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      grid.innerHTML = emptyState('Error', err.message, 'alert');
    }
  };

  root.querySelector('[data-new]').addEventListener('click', () => openCategoryForm(null, load));
  await load();
}

function openCategoryForm(cat, onSaved) {
  const c = cat || { name: '', description: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)] };
  const modal = openModal({
    title: cat ? 'Editar categoría' : 'Nueva categoría',
    size: 'sm',
    body: `
      <form id="cat-form" class="stack" novalidate>
        <div class="form-error hidden"></div>
        <div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(c.name)}" maxlength="80" autofocus /></div>
        <div class="field"><label>Descripción</label><textarea class="input" name="description" maxlength="255" rows="2">${esc(c.description)}</textarea></div>
        <div class="field">
          <label>Color</label>
          <div class="row wrap">
            ${PALETTE.map((p) => `<button type="button" data-color="${p}" style="width:30px;height:30px;border-radius:50%;border:3px solid ${p === c.color ? 'var(--text)' : 'transparent'};background:${p};cursor:pointer" aria-label="${p}"></button>`).join('')}
            <input type="color" class="input" name="color" value="${esc(c.color)}" style="width:56px" />
          </div>
        </div>
      </form>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" form="cat-form">Guardar</button>`,
  });
  const form = modal.el.querySelector('#cat-form');
  const colorInput = form.elements.color;
  form.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    colorInput.value = b.dataset.color;
    form.querySelectorAll('[data-color]').forEach((x) => { x.style.borderColor = x === b ? 'var(--text)' : 'transparent'; });
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const data = formToObject(form);
    if (!data.name) {
      err.textContent = 'El nombre es obligatorio';
      err.classList.remove('hidden');
      return;
    }
    const btn = modal.el.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try {
      await api(cat ? `/categories/${cat.id}` : '/categories', { method: cat ? 'PUT' : 'POST', body: data });
      toast(cat ? 'Categoría actualizada' : 'Categoría creada', 'success');
      modal.close();
      onSaved();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
      setBusy(btn, false);
    }
  });
}
