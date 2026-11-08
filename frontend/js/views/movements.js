import { api, download, qs } from '../api.js';
import { icon, esc, toast, fmtDate, fmtQty, movementQty, emptyState, loading, pagination, debounce, MOVE_TYPES } from '../ui.js';
import { openMovementForm, openProductDetail, pickProduct } from '../forms.js';

const toIsoStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : '');
const toIsoEnd = (d) => {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
};

export async function renderMovements(root, { query }) {
  const state = { search: '', type: query.get('type') || '', fromDay: '', toDay: '', productId: query.get('product') || '', page: 1 };
  let productName = '';
  if (state.productId) {
    try { productName = (await api(`/products/${state.productId}`)).name; } catch { state.productId = ''; }
  }

  root.innerHTML = `
    ${state.productId ? `<div class="notice info" style="margin-bottom:14px">${icon('info', 18)}<div class="grow">Mostrando movimientos de <b>${esc(productName)}</b></div><a href="#/movements" class="btn sm">Ver todos</a></div>` : ''}
    <div class="toolbar">
      <div class="input-icon search">${icon('search', 18)}<input class="input" data-f="search" placeholder="Buscar producto, código o motivo…" /></div>
      <select class="input" data-f="type">
        <option value="">Todos los tipos</option>
        ${Object.entries(MOVE_TYPES).map(([k, t]) => `<option value="${k}">${t.label}s</option>`).join('')}
      </select>
      <input class="input" type="date" data-f="fromDay" title="Desde" style="width:auto" />
      <input class="input" type="date" data-f="toDay" title="Hasta" style="width:auto" />
    </div>
    <div class="toolbar">
      <button class="btn primary" data-new>${icon('plus', 18)}Nuevo movimiento</button>
      <button class="btn" data-export>${icon('download', 18)}Exportar CSV</button>
    </div>
    <div class="card" data-table>${loading()}</div>`;

  root.querySelector('[data-f="type"]').value = state.type;
  const box = root.querySelector('[data-table]');

  const params = () => ({
    search: state.search, type: state.type, productId: state.productId,
    from: toIsoStart(state.fromDay), to: toIsoEnd(state.toDay),
  });

  const load = async () => {
    try {
      const data = await api(`/movements${qs({ ...params(), page: state.page, pageSize: 30 })}`);
      if (!data.items.length) {
        box.innerHTML = emptyState('Sin movimientos', 'Aquí verás cada entrada, salida y ajuste de inventario.', 'arrows');
        return;
      }
      box.innerHTML = `
        <div class="table-wrap">
          <table class="table responsive">
            <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="text-right">Cantidad</th><th class="text-right">Stock</th><th>Motivo</th><th>Usuario</th></tr></thead>
            <tbody>
              ${data.items.map((m) => {
                const t = MOVE_TYPES[m.type];
                return `
                <tr>
                  <td data-label="Fecha" class="nowrap">${fmtDate(m.createdAt)}</td>
                  <td class="td-main"><a href="javascript:void 0" data-product="${m.productId}"><strong>${esc(m.productName)}</strong></a><div class="muted small mono">${esc(m.productCode)}</div></td>
                  <td data-label="Tipo"><span class="badge ${t.tone}">${icon(t.icon, 14)}${t.label}</span></td>
                  <td data-label="Cantidad" class="text-right">${movementQty(m)}</td>
                  <td data-label="Stock" class="text-right nowrap muted">${fmtQty(m.previousQty)} → <b style="color:var(--text)">${fmtQty(m.newQty)}</b> ${esc(m.unit)}</td>
                  <td data-label="Motivo">${esc(m.reason || '—')}</td>
                  <td data-label="Usuario">${esc(m.userName || 'Sistema')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      box.appendChild(pagination(data, (pg) => { state.page = pg; load(); }));
      box.querySelectorAll('[data-product]').forEach((a) => a.addEventListener('click', () => openProductDetail(Number(a.dataset.product), { onChange: load })));
    } catch (err) {
      box.innerHTML = emptyState('No se pudieron cargar los movimientos', err.message, 'alert');
    }
  };

  root.querySelector('[data-f="search"]').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300));
  root.querySelectorAll('select[data-f], input[type="date"][data-f]').forEach((el) =>
    el.addEventListener('change', () => { state[el.dataset.f] = el.value; state.page = 1; load(); }));

  root.querySelector('[data-new]').addEventListener('click', async () => {
    let product = null;
    if (state.productId) {
      try { product = await api(`/products/${state.productId}`); } catch { /* ignorar */ }
    }
    product = product || (await pickProduct('¿A qué producto le registras el movimiento?'));
    if (product) openMovementForm({ product, type: 'IN', onSaved: load });
  });
  root.querySelector('[data-export]').addEventListener('click', async () => {
    try {
      await download(`/movements/export.csv${qs(params())}`, 'movimientos.csv');
      toast('Archivo CSV descargado', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  await load();
}
