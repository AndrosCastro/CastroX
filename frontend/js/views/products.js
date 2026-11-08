import { api, auth, download, qs } from '../api.js';
import {
  icon, esc, toast, fmtMoney, fmtQty, stockBadge, categoryBadge, productThumb, emptyState, loading, pagination, debounce, prefs,
} from '../ui.js';
import { deleteProduct, getCategories, openMovementForm, openProductDetail, openProductForm, printLabels } from '../forms.js';

export async function renderProducts(root, { query }) {
  const state = {
    search: query.get('search') || '',
    categoryId: query.get('categoryId') || '',
    stock: query.get('stock') || '',
    sort: prefs.get('prod_sort', 'name'),
    dir: prefs.get('prod_dir', 'asc'),
    page: 1,
    pageSize: Number(prefs.get('prod_ps', '25')),
  };
  const selected = new Map();
  const categories = await getCategories();

  root.innerHTML = `
    <div class="toolbar">
      <div class="input-icon search">${icon('search', 18)}<input class="input" data-f="search" placeholder="Buscar por nombre, código, proveedor o ubicación…" value="${esc(state.search)}" /></div>
      <select class="input" data-f="categoryId">
        <option value="">Todas las categorías</option>
        <option value="none">Sin categoría</option>
        ${categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
      </select>
      <select class="input" data-f="stock">
        <option value="">Todo el stock</option>
        <option value="ok">Disponible</option>
        <option value="alert">Requiere atención</option>
        <option value="low">Stock bajo</option>
        <option value="out">Agotados</option>
      </select>
    </div>
    <div class="toolbar">
      <button class="btn primary" data-new>${icon('plus', 18)}Nuevo producto</button>
      <button class="btn" data-print disabled>${icon('printer', 18)}Imprimir etiquetas <span data-sel-count></span></button>
      <button class="btn" data-export>${icon('download', 18)}Exportar CSV</button>
      <span class="grow"></span>
      <select class="input" data-ps style="min-width:0;width:auto">
        ${[10, 25, 50, 100].map((n) => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n} por página</option>`).join('')}
      </select>
    </div>
    <div class="card" data-table>${loading()}</div>`;

  root.querySelector('[data-f="categoryId"]').value = state.categoryId;
  root.querySelector('[data-f="stock"]').value = state.stock;
  const tableBox = root.querySelector('[data-table]');
  const printBtn = root.querySelector('[data-print]');

  const updateSelection = () => {
    printBtn.disabled = selected.size === 0;
    root.querySelector('[data-sel-count]').textContent = selected.size ? `(${selected.size})` : '';
  };

  const load = async () => {
    try {
      const data = await api(`/products${qs({ ...state })}`);
      renderTable(data);
    } catch (err) {
      tableBox.innerHTML = emptyState('No se pudieron cargar los productos', err.message, 'alert');
    }
  };

  const sortTh = (key, label, cls = '') => {
    const active = state.sort === key;
    return `<th class="sortable ${cls}" data-sort="${key}">${label}${active ? (state.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
  };

  const renderTable = (data) => {
    if (!data.items.length) {
      const filtered = state.search || state.categoryId || state.stock;
      tableBox.innerHTML = filtered
        ? emptyState('Sin resultados', 'Prueba con otros filtros o términos de búsqueda.', 'search')
        : emptyState('Aún no tienes productos', 'Registra tu primer producto o escanea un código para comenzar.', 'box',
          '<div class="row" style="justify-content:center;margin-top:12px"><a class="btn" href="#/scan">Escanear</a><button class="btn primary" data-new-empty>Nuevo producto</button></div>');
      tableBox.querySelector('[data-new-empty]')?.addEventListener('click', newProduct);
      return;
    }
    const allChecked = data.items.every((p) => selected.has(p.id));
    tableBox.innerHTML = `
      <div class="table-wrap">
        <table class="table responsive">
          <thead><tr>
            <th class="td-check" style="width:40px"><input type="checkbox" class="check" data-all ${allChecked ? 'checked' : ''} aria-label="Seleccionar todos" /></th>
            ${sortTh('name', 'Producto')}
            ${sortTh('category', 'Categoría')}
            ${sortTh('quantity', 'Stock')}
            ${sortTh('price', 'Precio', 'text-right')}
            <th>Ubicación</th>
            <th class="text-right">Acciones</th>
          </tr></thead>
          <tbody>
            ${data.items.map((p) => `
              <tr data-id="${p.id}">
                <td class="td-check"><input type="checkbox" class="check" data-sel ${selected.has(p.id) ? 'checked' : ''} aria-label="Seleccionar" /></td>
                <td class="td-main"><div class="prod-cell clickable" data-a="detail">${productThumb(p)}<div><strong>${esc(p.name)}</strong><span class="muted small mono">${esc(p.code)}</span></div></div></td>
                <td data-label="Categoría">${categoryBadge(p)}</td>
                <td data-label="Stock">${stockBadge(p)}</td>
                <td data-label="Precio" class="text-right nowrap">${fmtMoney(p.price)}</td>
                <td data-label="Ubicación">${esc(p.location || '—')}</td>
                <td><div class="actions">
                  <button class="icon-btn" data-a="IN" title="Entrada">${icon('in', 18)}</button>
                  <button class="icon-btn" data-a="OUT" title="Salida">${icon('out', 18)}</button>
                  <button class="icon-btn" data-a="qr" title="Ver QR y detalle">${icon('qr', 18)}</button>
                  <button class="icon-btn" data-a="edit" title="Editar">${icon('edit', 18)}</button>
                  ${auth.isAdmin ? `<button class="icon-btn danger" data-a="delete" title="Eliminar">${icon('trash', 18)}</button>` : ''}
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    tableBox.appendChild(pagination(data, (pg) => { state.page = pg; load(); }));

    const byId = new Map(data.items.map((p) => [p.id, p]));
    tableBox.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      state.dir = state.sort === key && state.dir === 'asc' ? 'desc' : 'asc';
      state.sort = key;
      prefs.set('prod_sort', state.sort);
      prefs.set('prod_dir', state.dir);
      load();
    }));
    tableBox.querySelector('[data-all]').addEventListener('change', (e) => {
      data.items.forEach((p) => (e.target.checked ? selected.set(p.id, p) : selected.delete(p.id)));
      tableBox.querySelectorAll('[data-sel]').forEach((c) => { c.checked = e.target.checked; });
      updateSelection();
    });
    tableBox.querySelectorAll('tr[data-id]').forEach((tr) => {
      const p = byId.get(Number(tr.dataset.id));
      tr.querySelector('[data-sel]').addEventListener('change', (e) => {
        e.target.checked ? selected.set(p.id, p) : selected.delete(p.id);
        updateSelection();
      });
      tr.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
        const a = b.dataset.a;
        if (a === 'detail' || a === 'qr') openProductDetail(p.id, { onChange: load });
        if (a === 'IN' || a === 'OUT') openMovementForm({ product: p, type: a, onSaved: load });
        if (a === 'edit') openProductForm({ product: p, onSaved: load });
        if (a === 'delete' && (await deleteProduct(p))) { selected.delete(p.id); updateSelection(); load(); }
      }));
    });
  };

  const newProduct = () => openProductForm({ onSaved: load });

  root.querySelector('[data-f="search"]').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300));
  root.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => { state[s.dataset.f] = s.value; state.page = 1; load(); }));
  root.querySelector('[data-ps]').addEventListener('change', (e) => { state.pageSize = Number(e.target.value); prefs.set('prod_ps', e.target.value); state.page = 1; load(); });
  root.querySelector('[data-new]').addEventListener('click', newProduct);
  printBtn.addEventListener('click', () => printLabels([...selected.values()]));
  root.querySelector('[data-export]').addEventListener('click', async () => {
    try {
      await download(`/products/export.csv${qs({ search: state.search, categoryId: state.categoryId, stock: state.stock })}`, 'productos.csv');
      toast('Archivo CSV descargado', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  updateSelection();
  await load();
}
