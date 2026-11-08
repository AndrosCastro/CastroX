import { api, auth } from '../api.js';
import { icon, esc, fmtMoney, fmtQty, fmtDay, stockBadge, productThumb, emptyState, loading, timeAgo, MOVE_TYPES, movementQty } from '../ui.js';
import { openProductDetail, openProductForm } from '../forms.js';

export async function renderDashboard(root) {
  root.innerHTML = loading();
  let d;
  try {
    d = await api(`/dashboard?tz=${new Date().getTimezoneOffset()}`);
  } catch (err) {
    root.innerHTML = emptyState('No se pudo cargar el panel', err.message, 'alert');
    return;
  }
  const charts = [];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  root.innerHTML = `
    <div class="row wrap" style="justify-content:space-between;margin-bottom:20px">
      <div>
        <h2 style="font-size:24px">${greet}, ${esc(auth.user?.fullName?.split(' ')[0] || '')} 👋</h2>
        <p class="muted" style="margin:4px 0 0">Este es el resumen de tu inventario hoy.</p>
      </div>
      <div class="row wrap">
        <a class="btn" href="#/scan">${icon('scan', 18)}Escanear</a>
        <button class="btn primary" data-new>${icon('plus', 18)}Nuevo producto</button>
      </div>
    </div>

    <div class="grid kpis">
      ${kpi('Productos', fmtQty(d.totalProducts), `${d.totalCategories} categorías`, 'box', 'brand')}
      ${kpi('Unidades en stock', fmtQty(d.totalUnits), 'Suma de todas las existencias', 'layers', 'info')}
      ${kpi('Valor del inventario', fmtMoney(d.inventoryValue), `Costo: ${fmtMoney(d.inventoryCost)}`, 'dollar', 'success')}
      ${kpi('Alertas de stock', fmtQty(d.lowStock + d.outOfStock), `${d.outOfStock} agotados · ${d.lowStock} bajos`, 'alert', d.lowStock + d.outOfStock ? 'danger' : 'success')}
      ${kpi('Movimientos hoy', fmtQty(d.movementsToday), `+${fmtQty(d.inToday)} entradas · −${fmtQty(d.outToday)} salidas`, 'activity', 'warning')}
    </div>

    <div class="grid two" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>Entradas y salidas · últimos 7 días</h3></div>
        <div class="card-body"><div class="chart-box"><canvas id="chart-moves" role="img" aria-label="Gráfica de entradas y salidas de los últimos 7 días"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Unidades por categoría</h3></div>
        <div class="card-body">${d.byCategory.length ? '<div class="chart-box"><canvas id="chart-cats" role="img" aria-label="Unidades por categoría"></canvas></div>' : emptyState('Sin datos', 'Registra productos para ver esta gráfica.', 'tag')}</div>
      </div>
    </div>

    <div class="grid halves" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>${icon('alert', 18)} Productos por reabastecer</h3><a class="btn sm" href="#/products?stock=alert">Ver todos</a></div>
        ${d.lowStockItems.length ? `<div class="list">${d.lowStockItems.map((p) => `
          <div class="list-item clickable" data-product="${p.id}">
            ${productThumb(p)}
            <div class="grow"><div class="title">${esc(p.name)}</div><div class="muted small">Mínimo: ${fmtQty(p.minStock)} ${esc(p.unit)}${p.location ? ` · ${esc(p.location)}` : ''}</div></div>
            ${stockBadge(p)}
          </div>`).join('')}</div>` : emptyState('¡Todo en orden!', 'Ningún producto está por debajo de su stock mínimo.', 'check')}
      </div>
      <div class="card">
        <div class="card-head"><h3>${icon('arrows', 18)} Actividad reciente</h3><a class="btn sm" href="#/movements">Ver historial</a></div>
        ${d.recentMovements.length ? `<div class="list">${d.recentMovements.map((m) => {
          const t = MOVE_TYPES[m.type];
          return `
          <div class="list-item clickable" data-product="${m.productId}">
            <div class="mv-icon tone-${t.tone}">${icon(t.icon, 18)}</div>
            <div class="grow"><div class="title">${esc(m.productName)}</div><div class="muted small">${t.label} · ${esc(m.userName || 'Sistema')} · ${timeAgo(m.createdAt)}</div></div>
            ${movementQty(m)}
          </div>`;
        }).join('')}</div>` : emptyState('Sin actividad', 'Las entradas y salidas aparecerán aquí.', 'activity')}
      </div>
    </div>`;

  root.querySelector('[data-new]').addEventListener('click', () => openProductForm({ onSaved: () => renderDashboard(root) }));
  root.querySelectorAll('[data-product]').forEach((el) =>
    el.addEventListener('click', () => openProductDetail(Number(el.dataset.product), { onChange: () => renderDashboard(root) })));

  if (window.Chart) {
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue('--muted').trim();
    const grid = css.getPropertyValue('--border').trim();
    const success = css.getPropertyValue('--success').trim();
    const danger = css.getPropertyValue('--danger').trim();
    window.Chart.defaults.font.family = css.getPropertyValue('--font');
    window.Chart.defaults.color = text;

    // Últimos 7 días (en hora local)
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      days.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
    }
    const sum = (day, type) => d.chart.filter((c) => c.day === day && c.type === type).reduce((a, c) => a + Number(c.qty), 0);
    charts.push(new window.Chart(root.querySelector('#chart-moves'), {
      type: 'bar',
      data: {
        labels: days.map((x) => fmtDay(`${x}T12:00:00`)),
        datasets: [
          { label: 'Entradas', data: days.map((x) => sum(x, 'IN')), backgroundColor: success, borderRadius: 6, maxBarThickness: 28 },
          { label: 'Salidas', data: days.map((x) => sum(x, 'OUT')), backgroundColor: danger, borderRadius: 6, maxBarThickness: 28 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: grid }, ticks: { precision: 0 } } },
      },
    }));

    const catCanvas = root.querySelector('#chart-cats');
    if (catCanvas) {
      charts.push(new window.Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: d.byCategory.map((c) => c.name),
          datasets: [{ data: d.byCategory.map((c) => Number(c.units)), backgroundColor: d.byCategory.map((c) => c.color), borderWidth: 2, borderColor: css.getPropertyValue('--surface').trim() }],
        },
        options: {
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtQty(ctx.raw)} unidades` } },
          },
        },
      }));
    }
  }
  return () => charts.forEach((c) => c.destroy());
}

function kpi(label, value, sub, iconName, tone) {
  return `
    <div class="card kpi">
      <div class="kpi-icon tone-${tone}">${icon(iconName, 22)}</div>
      <div style="min-width:0">
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
        <div class="kpi-sub">${esc(sub)}</div>
      </div>
    </div>`;
}
