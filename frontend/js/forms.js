// Formularios y diálogos compartidos entre vistas
import { api, auth, qrUrl, qs } from './api.js';
import {
  openModal, confirmDialog, toast, icon, esc, $, formToObject, setBusy, fmtMoney, fmtQty, fmtDate,
  stockBadge, stockStatus, categoryBadge, productThumb, movementQty, MOVE_TYPES, debounce, emptyState, loading,
} from './ui.js';
import { scanOnce } from './scanner.js';

const UNITS = ['pza', 'caja', 'paquete', 'kg', 'g', 'lt', 'ml', 'm', 'cm', 'par', 'docena', 'rollo'];
const REASONS = {
  IN: ['Compra a proveedor', 'Devolución de cliente', 'Producción', 'Traspaso recibido'],
  OUT: ['Venta', 'Merma / daño', 'Uso interno', 'Traspaso enviado', 'Devolución a proveedor'],
  ADJUST: ['Conteo físico', 'Corrección de error', 'Inventario inicial'],
};

export async function getCategories() {
  try { return await api('/categories'); } catch { return []; }
}

// ---------------------------------------------------------------------------
// Producto: crear / editar
// ---------------------------------------------------------------------------
export async function openProductForm({ product = null, code = '', onSaved } = {}) {
  const isEdit = !!product;
  const p = product || { code, unit: 'pza', cost: 0, price: 0, minStock: 0, quantity: 0 };
  const categories = await getCategories();

  const modal = openModal({
    title: isEdit ? 'Editar producto' : 'Nuevo producto',
    size: 'lg',
    body: `
      <form id="product-form" class="stack" novalidate>
        <div class="form-error hidden"></div>
        <div class="form-grid">
          <div class="field full">
            <label>Código QR / código de barras</label>
            <div class="input-group">
              <input class="input mono" name="code" value="${esc(p.code)}" maxlength="100" placeholder="Déjalo vacío para generarlo automáticamente" autocomplete="off" />
              <button type="button" class="btn" data-scan title="Escanear con cámara">${icon('camera', 18)}<span class="hide-mobile">Escanear</span></button>
            </div>
            <span class="help">Puedes escanear el código del empaque o dejar que CastroX genere uno.</span>
          </div>
          <div class="field full">
            <label>Nombre del producto *</label>
            <input class="input" name="name" value="${esc(p.name)}" maxlength="150" required autofocus placeholder="Ej. Cable USB-C 1m" />
          </div>
          <div class="field">
            <label>Categoría</label>
            <select class="input" name="categoryId">
              <option value="">Sin categoría</option>
              ${categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Unidad de medida</label>
            <input class="input" name="unit" value="${esc(p.unit || 'pza')}" list="units-list" maxlength="20" />
            <datalist id="units-list">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>
          </div>
          <div class="field">
            <label>Costo (compra)</label>
            <input class="input" name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${p.cost ?? 0}" />
          </div>
          <div class="field">
            <label>Precio (venta)</label>
            <input class="input" name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${p.price ?? 0}" />
          </div>
          ${isEdit ? `
          <div class="field">
            <label>Cantidad actual</label>
            <input class="input" value="${fmtQty(p.quantity)} ${esc(p.unit)}" disabled />
            <span class="help">Para cambiar la cantidad registra una entrada, salida o ajuste.</span>
          </div>` : `
          <div class="field">
            <label>Cantidad inicial</label>
            <input class="input" name="quantity" type="number" min="0" step="0.01" inputmode="decimal" value="${p.quantity ?? 0}" />
          </div>`}
          <div class="field">
            <label>Stock mínimo (alerta)</label>
            <input class="input" name="minStock" type="number" min="0" step="0.01" inputmode="decimal" value="${p.minStock ?? 0}" />
            <span class="help">Te avisaremos cuando quede esta cantidad o menos.</span>
          </div>
          <div class="field">
            <label>Ubicación</label>
            <input class="input" name="location" value="${esc(p.location)}" maxlength="100" placeholder="Ej. Estante A1, Bodega 2" />
          </div>
          <div class="field">
            <label>Proveedor</label>
            <input class="input" name="supplier" value="${esc(p.supplier)}" maxlength="100" />
          </div>
          <div class="field full">
            <label>Descripción</label>
            <textarea class="input" name="description" maxlength="500" rows="3">${esc(p.description)}</textarea>
          </div>
        </div>
      </form>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="product-form" type="submit">${icon('check', 18)}${isEdit ? 'Guardar cambios' : 'Registrar producto'}</button>`,
  });

  const form = $('#product-form', modal.el);
  const errBox = $('.form-error', form);
  $('[data-scan]', form).addEventListener('click', async () => {
    const scanned = await scanOnce('Escanear código del producto');
    if (scanned) form.elements.code.value = scanned;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const data = formToObject(form);
    if (!data.name) {
      errBox.textContent = 'El nombre del producto es obligatorio';
      errBox.classList.remove('hidden');
      form.elements.name.focus();
      return;
    }
    const btn = modal.el.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Guardando…');
    try {
      const saved = isEdit
        ? await api(`/products/${p.id}`, { method: 'PUT', body: data })
        : await api('/products', { method: 'POST', body: data });
      toast(isEdit ? 'Producto actualizado' : `Producto "${saved.name}" registrado`, 'success');
      modal.close();
      onSaved?.(saved);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      setBusy(btn, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Movimiento: entrada / salida / ajuste
// ---------------------------------------------------------------------------
export function openMovementForm({ product, type = 'IN', quantity = 1, onSaved } = {}) {
  let current = type;
  const modal = openModal({
    title: 'Registrar movimiento',
    body: `
      <form id="movement-form" class="stack" novalidate>
        <div class="form-error hidden"></div>
        <div class="result-head">
          ${productThumb(product)}
          <div class="grow" style="min-width:0">
            <strong>${esc(product.name)}</strong>
            <div class="muted small mono">${esc(product.code)}</div>
          </div>
          <div class="text-right"><div class="muted small">Stock actual</div>${stockBadge(product)}</div>
        </div>
        <div class="segmented" role="tablist">
          ${Object.entries(MOVE_TYPES).map(([k, t]) => `<button type="button" data-v="${k}" class="${k === current ? 'active' : ''}">${icon(t.icon, 16)}${t.label}</button>`).join('')}
        </div>
        <div class="field">
          <label data-qty-label>Cantidad</label>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Menos">${icon('minus')}</button>
            <input name="quantity" type="number" min="0" step="any" inputmode="decimal" value="${quantity}" autofocus />
            <button type="button" data-step="1" aria-label="Más">${icon('plus')}</button>
          </div>
        </div>
        <div class="field">
          <label>Motivo</label>
          <input class="input" name="reason" list="reasons-list" maxlength="255" placeholder="Opcional" />
          <datalist id="reasons-list"></datalist>
        </div>
        <div class="notice info" data-preview></div>
      </form>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" form="movement-form">${icon('check', 18)}Registrar</button>`,
  });

  const form = $('#movement-form', modal.el);
  const errBox = $('.form-error', form);
  const qty = form.elements.quantity;
  const preview = $('[data-preview]', form);
  const btn = modal.el.querySelector('button[type="submit"]');

  const update = () => {
    const q = Number(qty.value) || 0;
    const prev = Number(product.quantity);
    const next = current === 'IN' ? prev + q : current === 'OUT' ? prev - q : q;
    $('[data-qty-label]', form).textContent = current === 'ADJUST' ? 'Nueva cantidad total (conteo físico)' : 'Cantidad';
    $('#reasons-list', form).innerHTML = REASONS[current].map((r) => `<option value="${esc(r)}">`).join('');
    preview.className = `notice ${next < 0 ? 'warning' : 'info'}`;
    preview.innerHTML = `${icon(next < 0 ? 'alert' : 'info', 18)}<div>${next < 0
      ? `Stock insuficiente: solo hay ${fmtQty(prev)} ${esc(product.unit)}`
      : `El stock pasará de <b>${fmtQty(prev)}</b> a <b>${fmtQty(next)}</b> ${esc(product.unit)}`}</div>`;
    btn.className = `btn ${current === 'IN' ? 'success' : current === 'OUT' ? 'danger' : 'primary'}`;
  };

  form.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    current = b.dataset.v;
    form.querySelectorAll('.segmented button').forEach((x) => x.classList.toggle('active', x === b));
    if (current === 'ADJUST') qty.value = Number(product.quantity);
    else if (Number(qty.value) <= 0) qty.value = 1;
    update();
    qty.focus();
    qty.select();
  }));
  form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    qty.value = Math.max(0, (Number(qty.value) || 0) + Number(b.dataset.step));
    update();
  }));
  qty.addEventListener('input', update);
  update();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const data = formToObject(form);
    setBusy(btn, true, 'Registrando…');
    try {
      const mv = await api('/movements', { method: 'POST', body: { productId: product.id, type: current, quantity: Number(data.quantity), reason: data.reason } });
      toast(`${MOVE_TYPES[current].label} registrada · nuevo stock: ${fmtQty(mv.newQty)} ${product.unit}`, 'success');
      modal.close();
      onSaved?.(mv);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      setBusy(btn, false);
      update();
    }
  });
}

// ---------------------------------------------------------------------------
// Detalle de producto con QR e historial
// ---------------------------------------------------------------------------
export async function openProductDetail(id, { onChange } = {}) {
  const modal = openModal({ title: 'Detalle del producto', size: 'lg', body: loading() });
  const body = $('.modal-body', modal.el);

  const render = async () => {
    let p;
    try {
      p = await api(`/products/${id}`);
    } catch (err) {
      body.innerHTML = emptyState('No se pudo cargar', err.message, 'alert');
      return;
    }
    const status = stockStatus(p);
    body.innerHTML = `
      <div class="detail">
        <div class="stack">
          <div class="qr-box">
            <img src="${qrUrl(p.code, 400)}" alt="Código QR de ${esc(p.name)}" />
            <div class="mono">${esc(p.code)}</div>
          </div>
          <button class="btn block" data-act="print">${icon('printer', 18)}Imprimir etiqueta</button>
          <a class="btn block" href="${qrUrl(p.code, 800)}" download="QR-${esc(p.code)}.png">${icon('download', 18)}Descargar QR</a>
        </div>
        <div class="stack">
          <div class="result-head">
            ${productThumb(p)}
            <div class="grow" style="min-width:0">
              <h3>${esc(p.name)}</h3>
              <div class="row wrap" style="margin-top:4px">${categoryBadge(p)}<span class="badge ${status.tone}">${status.label}</span></div>
            </div>
          </div>
          <div class="stock-big"><strong>${fmtQty(p.quantity)}</strong><span class="muted">${esc(p.unit)} en stock · mínimo ${fmtQty(p.minStock)}</span></div>
          <div class="big-actions">
            <button class="btn success" data-act="IN">${icon('in', 18)}Entrada</button>
            <button class="btn danger" data-act="OUT">${icon('out', 18)}Salida</button>
          </div>
          <div class="info-grid">
            <div><span>Precio de venta</span><strong>${fmtMoney(p.price)}</strong></div>
            <div><span>Costo</span><strong>${fmtMoney(p.cost)}</strong></div>
            <div><span>Valor en inventario</span><strong>${fmtMoney(p.price * p.quantity)}</strong></div>
            <div><span>Margen</span><strong>${p.price > 0 ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%` : '—'}</strong></div>
            <div><span>Ubicación</span><strong>${esc(p.location || '—')}</strong></div>
            <div><span>Proveedor</span><strong>${esc(p.supplier || '—')}</strong></div>
            <div><span>Registrado</span><strong>${fmtDate(p.createdAt)}</strong></div>
            <div><span>Última actualización</span><strong>${fmtDate(p.updatedAt)}</strong></div>
          </div>
          ${p.description ? `<p class="muted" style="margin:0">${esc(p.description)}</p>` : ''}
        </div>
      </div>
      <h4 style="margin:24px 0 8px">Historial de movimientos</h4>
      <div class="card">
        ${p.movements.length ? `<div class="list">${p.movements.map(movementListItem).join('')}</div>` : emptyState('Sin movimientos', 'Aún no hay entradas ni salidas para este producto.', 'arrows')}
      </div>`;

    const foot = modal.el.querySelector('.modal-foot') || Object.assign(document.createElement('div'), { className: 'modal-foot' });
    foot.innerHTML = `
      ${auth.isAdmin ? `<button class="btn ghost" data-act="delete" style="color:var(--danger);margin-right:auto">${icon('trash', 18)}Eliminar</button>` : ''}
      <button class="btn" data-act="ADJUST">${icon('adjust', 18)}Ajustar</button>
      <button class="btn primary" data-act="edit">${icon('edit', 18)}Editar</button>`;
    modal.el.querySelector('.modal').appendChild(foot);

    const handlers = {
      print: () => printLabels([p]),
      IN: () => openMovementForm({ product: p, type: 'IN', onSaved: refresh }),
      OUT: () => openMovementForm({ product: p, type: 'OUT', onSaved: refresh }),
      ADJUST: () => openMovementForm({ product: p, type: 'ADJUST', quantity: p.quantity, onSaved: refresh }),
      edit: () => openProductForm({ product: p, onSaved: refresh }),
      delete: async () => {
        if (await deleteProduct(p)) { modal.close(); onChange?.(); }
      },
    };
    modal.el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => handlers[b.dataset.act]?.()));
  };

  const refresh = () => { render(); onChange?.(); };
  await render();
}

export function movementListItem(m) {
  const t = MOVE_TYPES[m.type];
  return `
    <div class="list-item">
      <div class="mv-icon tone-${t.tone}">${icon(t.icon, 18)}</div>
      <div class="grow">
        <div class="title">${esc(m.productName ? `${t.label} · ${m.productName}` : t.label)}</div>
        <div class="muted small">${fmtDate(m.createdAt)} · ${esc(m.userName || 'Sistema')}${m.reason ? ` · ${esc(m.reason)}` : ''}</div>
      </div>
      <div class="text-right">
        ${movementQty(m)}
        <div class="muted small nowrap">${fmtQty(m.previousQty)} → ${fmtQty(m.newQty)}</div>
      </div>
    </div>`;
}

export async function deleteProduct(p) {
  const ok = await confirmDialog(`¿Eliminar "${p.name}"? También se borrará su historial de movimientos. Esta acción no se puede deshacer.`, {
    title: 'Eliminar producto', okText: 'Eliminar', danger: true,
  });
  if (!ok) return false;
  try {
    await api(`/products/${p.id}`, { method: 'DELETE' });
    toast('Producto eliminado', 'success');
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Selector de producto (búsqueda o escaneo)
// ---------------------------------------------------------------------------
export function pickProduct(title = 'Selecciona un producto') {
  return new Promise((resolve) => {
    let picked = false;
    const modal = openModal({
      title,
      body: `
        <div class="input-group">
          <div class="input-icon grow">${icon('search', 18)}<input class="input" data-search placeholder="Busca por nombre o código…" autofocus autocomplete="off" /></div>
          <button class="btn" data-scan title="Escanear">${icon('camera', 18)}</button>
        </div>
        <div class="pick-list" data-results>${loading()}</div>`,
      onClose: () => { if (!picked) resolve(null); },
    });
    const results = $('[data-results]', modal.el);
    const choose = (p) => { picked = true; resolve(p); modal.close(); };

    const search = async (term) => {
      try {
        const data = await api(`/products${qs({ search: term, pageSize: 30 })}`);
        if (!data.items.length) {
          results.innerHTML = emptyState('Sin resultados', 'No hay productos que coincidan.', 'search');
          return;
        }
        results.innerHTML = data.items.map((p, i) => `
          <div class="list-item" data-i="${i}">
            ${productThumb(p)}
            <div class="grow"><div class="title">${esc(p.name)}</div><div class="muted small mono">${esc(p.code)}</div></div>
            ${stockBadge(p)}
          </div>`).join('');
        results.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => choose(data.items[Number(el.dataset.i)])));
      } catch (err) {
        results.innerHTML = emptyState('Error', err.message, 'alert');
      }
    };
    $('[data-search]', modal.el).addEventListener('input', debounce((e) => search(e.target.value.trim()), 250));
    $('[data-scan]', modal.el).addEventListener('click', async () => {
      const code = await scanOnce();
      if (!code) return;
      try {
        choose(await api(`/products/code/${encodeURIComponent(code)}`));
      } catch (err) {
        toast(err.status === 404 ? `El código "${code}" no está registrado` : err.message, 'error');
      }
    });
    search('');
  });
}

// ---------------------------------------------------------------------------
// Impresión de etiquetas con QR
// ---------------------------------------------------------------------------
export function printLabels(products) {
  if (!products.length) return;
  const win = window.open('', '_blank');
  if (!win) {
    toast('Permite las ventanas emergentes para imprimir etiquetas', 'warning');
    return;
  }
  const labels = products.map((p) => `
    <div class="label">
      <img src="${location.origin}${qrUrl(p.code, 300)}" />
      <div class="name">${esc(p.name)}</div>
      <div class="code">${esc(p.code)}</div>
      ${Number(p.price) > 0 ? `<div class="price">${esc(fmtMoney(p.price))}</div>` : ''}
    </div>`).join('');
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas CastroX</title>
    <style>
      @page { margin: 10mm; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #000; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, 58mm); gap: 4mm; }
      .label { border: 1px dashed #999; border-radius: 3mm; padding: 3mm; text-align: center; page-break-inside: avoid; }
      .label img { width: 38mm; height: 38mm; }
      .name { font-weight: bold; font-size: 11pt; margin-top: 1mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .code { font-family: monospace; font-size: 9pt; word-break: break-all; }
      .price { font-size: 13pt; font-weight: bold; margin-top: 1mm; }
      .bar { padding: 10px; text-align: center; font-size: 14px; }
      @media print { .bar { display: none; } }
    </style></head><body>
    <div class="bar">Vista previa de ${products.length} etiqueta(s) · <button onclick="print()">Imprimir</button></div>
    <div class="grid">${labels}</div>
    <script>
      const imgs = [...document.images];
      Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => print(), 200));
    <\/script>
    </body></html>`);
  win.document.close();
}
