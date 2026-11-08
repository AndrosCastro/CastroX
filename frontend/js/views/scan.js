import { api } from '../api.js';
import {
  icon, esc, toast, beep, fmtQty, fmtMoney, stockBadge, stockStatus, productThumb, categoryBadge, emptyState, prefs, MOVE_TYPES,
} from '../ui.js';
import { Scanner, cameraSupportError } from '../scanner.js';
import { openMovementForm, openProductDetail, openProductForm } from '../forms.js';

const MODES = {
  lookup: { label: 'Consultar', icon: 'search', help: 'Escanea un código para ver el producto y registrar movimientos.' },
  IN: { label: 'Entrada rápida', icon: 'in', help: 'Cada escaneo suma la cantidad indicada al stock automáticamente.' },
  OUT: { label: 'Salida rápida', icon: 'out', help: 'Cada escaneo descuenta la cantidad indicada del stock automáticamente.' },
};

export function renderScan(root) {
  let mode = prefs.get('scan_mode', 'lookup');
  if (!MODES[mode]) mode = 'lookup';
  const log = [];
  let scanner;
  let busy = false;

  const supportErr = cameraSupportError();

  root.innerHTML = `
    <div class="scan-layout">
      <div class="stack">
        <div class="card card-pad stack">
          <div class="segmented" data-modes>
            ${Object.entries(MODES).map(([k, m]) => `<button type="button" data-v="${k}" class="${k === mode ? 'active' : ''}">${icon(m.icon, 16)}<span>${m.label}</span></button>`).join('')}
          </div>
          <p class="muted small" data-mode-help style="margin:0"></p>
          <div class="row ${mode === 'lookup' ? 'hidden' : ''}" data-quick-qty>
            <label class="small" style="font-weight:600;white-space:nowrap">Cantidad por escaneo</label>
            <div class="stepper grow">
              <button type="button" data-step="-1">${icon('minus')}</button>
              <input type="number" min="0.01" step="any" value="${esc(prefs.get('scan_qty', '1'))}" data-qty inputmode="decimal" />
              <button type="button" data-step="1">${icon('plus')}</button>
            </div>
          </div>

          <div class="reader-box" data-reader-box>
            <div id="reader"></div>
            <div class="reader-placeholder" data-placeholder>
              ${icon('camera', 48)}
              <div>${supportErr ? supportErr : 'Presiona <b>Iniciar cámara</b> para escanear códigos QR o de barras'}</div>
            </div>
          </div>

          <div class="row wrap">
            <button class="btn primary lg grow" data-toggle ${supportErr ? 'disabled' : ''}>${icon('camera', 20)}Iniciar cámara</button>
            <select class="input hidden" data-cameras style="flex:1;min-width:160px"></select>
          </div>

          <form class="stack" data-manual style="gap:6px">
            <label class="small" style="font-weight:600">Código manual o lector USB</label>
            <div class="input-group">
              <div class="input-icon grow">${icon('qr', 18)}<input class="input lg mono" name="code" placeholder="Escribe o escanea con lector de mano" autocomplete="off" autofocus /></div>
              <button class="btn primary" type="submit">Buscar</button>
            </div>
          </form>
        </div>
      </div>

      <div class="stack">
        <div class="card card-pad" data-result>
          ${emptyState('Esperando código', 'El producto escaneado aparecerá aquí.', 'scan')}
        </div>
        <div class="card scan-log">
          <div class="card-head"><h3>Escaneos de esta sesión</h3><button class="btn sm ghost" data-clear>Limpiar</button></div>
          <div class="list" data-log><div class="empty small" style="padding:20px">Aún no hay escaneos</div></div>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const result = $('[data-result]');
  const qtyInput = $('[data-qty]');
  const toggleBtn = $('[data-toggle]');
  const camSelect = $('[data-cameras]');
  const readerBox = $('[data-reader-box]');
  const manualInput = $('[data-manual] input');

  const setMode = (m) => {
    mode = m;
    prefs.set('scan_mode', m);
    root.querySelectorAll('[data-modes] button').forEach((b) => b.classList.toggle('active', b.dataset.v === m));
    $('[data-mode-help]').textContent = MODES[m].help;
    $('[data-quick-qty]').classList.toggle('hidden', m === 'lookup');
  };
  setMode(mode);

  root.querySelectorAll('[data-modes] button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.v)));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    qtyInput.value = Math.max(1, (Number(qtyInput.value) || 0) + Number(b.dataset.step));
    prefs.set('scan_qty', qtyInput.value);
  }));
  qtyInput.addEventListener('change', () => prefs.set('scan_qty', qtyInput.value));

  const flash = (ok) => {
    readerBox.classList.remove('flash', 'flash-error');
    void readerBox.offsetWidth;
    readerBox.classList.add(ok ? 'flash' : 'flash-error');
  };

  const addLog = (entry) => {
    log.unshift({ ...entry, at: new Date() });
    if (log.length > 30) log.pop();
    const el = $('[data-log]');
    el.innerHTML = log.map((l) => `
      <div class="list-item">
        <div class="mv-icon tone-${l.tone}">${icon(l.icon, 16)}</div>
        <div class="grow"><div class="title">${esc(l.title)}</div><div class="muted small mono">${esc(l.code)} · ${l.at.toLocaleTimeString('es-MX')}</div></div>
        ${l.badge || ''}
      </div>`).join('');
  };
  $('[data-clear]').addEventListener('click', () => {
    log.length = 0;
    $('[data-log]').innerHTML = '<div class="empty small" style="padding:20px">Aún no hay escaneos</div>';
  });

  // ----- Resultado: producto encontrado -----
  const showProduct = (p) => {
    const st = stockStatus(p);
    result.innerHTML = `
      <div class="result-product">
        <div class="result-head">
          ${productThumb(p)}
          <div class="grow" style="min-width:0">
            <h3>${esc(p.name)}</h3>
            <div class="muted small mono">${esc(p.code)}</div>
          </div>
          <span class="badge ${st.tone}">${st.label}</span>
        </div>
        <div class="stock-big"><strong>${fmtQty(p.quantity)}</strong><span class="muted">${esc(p.unit)} disponibles</span></div>
        <div class="info-grid">
          <div><span>Categoría</span><strong>${categoryBadge(p)}</strong></div>
          <div><span>Precio</span><strong>${fmtMoney(p.price)}</strong></div>
          <div><span>Ubicación</span><strong>${esc(p.location || '—')}</strong></div>
          <div><span>Stock mínimo</span><strong>${fmtQty(p.minStock)} ${esc(p.unit)}</strong></div>
        </div>
        <div class="big-actions">
          <button class="btn success" data-a="IN">${icon('in', 18)}Entrada</button>
          <button class="btn danger" data-a="OUT">${icon('out', 18)}Salida</button>
          <button class="btn" data-a="detail">${icon('eye', 18)}Ver detalle</button>
          <button class="btn" data-a="edit">${icon('edit', 18)}Editar</button>
        </div>
      </div>`;
    const reload = async () => {
      try { showProduct(await api(`/products/${p.id}`)); } catch { /* ignorar */ }
    };
    const actions = {
      IN: () => openMovementForm({ product: p, type: 'IN', onSaved: reload }),
      OUT: () => openMovementForm({ product: p, type: 'OUT', onSaved: reload }),
      detail: () => openProductDetail(p.id, { onChange: reload }),
      edit: () => openProductForm({ product: p, onSaved: reload }),
    };
    result.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.a]()));
  };

  // ----- Resultado: código no registrado -----
  const showNotFound = (code) => {
    result.innerHTML = `
      <div class="empty" style="padding:24px 10px">
        <div class="empty-icon tone-warning">${icon('alert', 30)}</div>
        <h4>Producto no registrado</h4>
        <p>El código <b class="mono">${esc(code)}</b> no existe en tu inventario.</p>
        <button class="btn primary lg" data-register>${icon('plus', 18)}Registrar este producto</button>
      </div>`;
    result.querySelector('[data-register]').addEventListener('click', () =>
      openProductForm({ code, onSaved: (p) => { showProduct(p); addLog({ title: `Registrado: ${p.name}`, code: p.code, icon: 'plus', tone: 'brand' }); } }));
  };

  // ----- Procesar código -----
  const handleCode = async (code) => {
    if (busy || !code) return;
    busy = true;
    if (scanner) scanner.paused = true;
    try {
      if (mode === 'lookup') {
        const p = await api(`/products/code/${encodeURIComponent(code)}`);
        beep(true); flash(true);
        showProduct(p);
        addLog({ title: p.name, code, icon: 'search', tone: 'brand', badge: stockBadge(p) });
      } else {
        const quantity = Number(qtyInput.value) || 1;
        const mv = await api('/movements', { method: 'POST', body: { code, type: mode, quantity, reason: mode === 'IN' ? 'Entrada por escáner' : 'Salida por escáner' } });
        beep(true); flash(true);
        const t = MOVE_TYPES[mode];
        toast(`${t.label}: ${mv.productName} (${mode === 'IN' ? '+' : '−'}${fmtQty(quantity)}) → ${fmtQty(mv.newQty)} ${mv.unit}`, 'success', 2200);
        addLog({ title: mv.productName, code, icon: t.icon, tone: t.tone, badge: `<span class="badge ${t.tone}">${mode === 'IN' ? '+' : '−'}${fmtQty(quantity)} → ${fmtQty(mv.newQty)}</span>` });
        showProduct(await api(`/products/${mv.productId}`));
      }
    } catch (err) {
      beep(false); flash(false);
      if (err.status === 404) {
        showNotFound(code);
        addLog({ title: 'No registrado', code, icon: 'alert', tone: 'warning' });
      } else {
        toast(err.message, 'error');
        addLog({ title: err.message, code, icon: 'alert', tone: 'danger' });
      }
    } finally {
      busy = false;
      setTimeout(() => { if (scanner) scanner.paused = false; }, 600);
    }
  };

  $('[data-manual]').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = manualInput.value.trim();
    manualInput.value = '';
    handleCode(code);
  });

  // ----- Cámara -----
  const setRunning = (running) => {
    $('[data-placeholder]').classList.toggle('hidden', running);
    let frame = readerBox.querySelector('.reader-frame');
    if (running && !frame) {
      frame = document.createElement('div');
      frame.className = 'reader-frame';
      readerBox.appendChild(frame);
    } else if (!running && frame) frame.remove();
    toggleBtn.className = `btn lg grow ${running ? '' : 'primary'}`;
    toggleBtn.innerHTML = running ? `${icon('cameraOff', 20)}Detener cámara` : `${icon('camera', 20)}Iniciar cámara`;
  };

  const startCamera = async (cameraId) => {
    toggleBtn.disabled = true;
    try {
      scanner = scanner || new Scanner('reader', handleCode);
      await scanner.start(cameraId || prefs.get('camera', '') || undefined);
      setRunning(true);
      const cams = await Scanner.cameras();
      if (cams.length > 1) {
        camSelect.innerHTML = cams.map((c, i) => `<option value="${esc(c.id)}">${esc(c.label || `Cámara ${i + 1}`)}</option>`).join('');
        const saved = cameraId || prefs.get('camera', '');
        if (saved) camSelect.value = saved;
        camSelect.classList.remove('hidden');
      }
    } catch (err) {
      // Si la cámara guardada ya no existe, intenta con la predeterminada
      if (prefs.get('camera', '') && !cameraId) {
        prefs.set('camera', '');
        toggleBtn.disabled = false;
        return startCamera();
      }
      toast(err.message, 'error', 5000);
      setRunning(false);
    } finally {
      toggleBtn.disabled = false;
    }
  };

  toggleBtn.addEventListener('click', async () => {
    if (scanner?.running) {
      await scanner.stop();
      setRunning(false);
    } else {
      startCamera();
    }
  });
  camSelect.addEventListener('change', () => {
    prefs.set('camera', camSelect.value);
    startCamera(camSelect.value);
  });

  // Inicia automáticamente si el usuario ya usó la cámara antes
  if (!supportErr && prefs.get('autostart', 'on') === 'on' && prefs.get('camera_used', '') === '1') startCamera();
  toggleBtn.addEventListener('click', () => prefs.set('camera_used', '1'), { once: true });

  return () => { scanner?.stop(); };
}
