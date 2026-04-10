// ============================================================
// cartera.js
// Módulo de Cartera: KPIs del header, buscador de pólizas
// y tabla de resultados de búsqueda.
// LÓGICA: Cada contrato tiene múltiples recibos (períodos).
// Cartera muestra 1 registro por contrato (el período activo).
// Cobros trabaja con todos los recibos mes a mes.
// ============================================================

import { fmt, trunc, fmtDate } from './utils.js';
import { state } from './state.js';

// Tamaño de página para resultados de búsqueda
const PAGE_SIZE = 25;

// ── Obtener el recibo activo de cada contrato ────────────────
// De todos los recibos de una póliza, selecciona el más relevante:
// 1. El que está activo hoy (hoy está entre desde y hasta)
// 2. Si no hay activo, el próximo a vencer
// 3. Si no, el más reciente
// Esto evita mostrar duplicados en Cartera
function getRecibosActivos(polizas) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Agrupar todos los recibos por número de póliza
  const byPoliza = {};
  polizas.forEach(r => {
    if (!r.poliza) return;
    if (!byPoliza[r.poliza]) byPoliza[r.poliza] = [];
    byPoliza[r.poliza].push(r);
  });

  // Para cada contrato, elegir el recibo más relevante
  return Object.values(byPoliza).map(records => {
    // Ordenar por fecha desde (más antiguo primero)
    const sorted = records.sort((a, b) =>
      new Date(a.desde + 'T12:00:00') - new Date(b.desde + 'T12:00:00')
    );

    // 1. Buscar el período activo hoy
    const activo = sorted.find(r => {
      if (!r.desde || !r.hasta) return false;
      const desde = new Date(r.desde + 'T12:00:00');
      const hasta = new Date(r.hasta + 'T12:00:00');
      return hoy >= desde && hoy <= hasta;
    });
    if (activo) return activo;

    // 2. Si no hay activo, el próximo período futuro
    const futuro = sorted.find(r =>
      r.desde && new Date(r.desde + 'T12:00:00') > hoy
    );
    if (futuro) return futuro;

    // 3. Si no, el más reciente (último de la lista)
    return sorted[sorted.length - 1];
  });
}

// ── KPIs del header de Cartera ───────────────────────────────
// Muestra las 6 tarjetas de resumen basadas en contratos únicos,
// no en el total de recibos almacenados en Firebase
export function renderKPIs() {
  // Obtener solo el recibo activo de cada contrato
  const D   = getRecibosActivos(state.polizas);
  const crc = D.filter(r => r.moneda === 'CRC');
  const usd = D.filter(r => r.moneda === 'USD');
  const tC  = crc.reduce((s, r) => s + (r.total || 0), 0);
  const tU  = usd.reduce((s, r) => s + (r.total || 0), 0);

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kc kt">
      <div class="kl">Total contratos</div>
      <div class="kv">${D.length}</div>
      <div class="ks2">Pólizas únicas · ${state.polizas.length} recibos</div>
    </div>
    <div class="kc kc2">
      <div class="kl">Total Colones</div>
      <div class="kv" style="color:var(--crc)">₡${fmt(tC)}</div>
      <div class="ks2">${crc.length} contratos CRC</div>
    </div>
    <div class="kc ku">
      <div class="kl">Total Dólares</div>
      <div class="kv" style="color:var(--usd)">$${fmt(tU)}</div>
      <div class="ks2">${usd.length} contratos USD</div>
    </div>
    <div class="kc kg">
      <div class="kl">Período Gracia</div>
      <div class="kv" style="color:var(--yellow)">
        ${D.filter(r => r.estado_poliza === 'Período gracia').length}
      </div>
      <div class="ks2">Atención urgente</div>
    </div>
    <div class="kc ks">
      <div class="kl">Sin verificar</div>
      <div class="kv" style="color:var(--muted)">
        ${D.filter(r => !r.verif).length}
      </div>
      <div class="ks2">Pendientes</div>
    </div>
    <div class="kc kp">
      <div class="kl">≤30 días</div>
      <div class="kv" style="color:var(--red)">
        ${D.filter(r => (r.dias_venc || 0) <= 30).length}
      </div>
      <div class="ks2">Vencen pronto</div>
    </div>`;
}

// ── Poblar selector de productos en el buscador ──────────────
export function populateSQProd() {
  const sel = document.getElementById('sq-prod-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos los productos</option>';
  [...new Set(state.polizas.map(r => r.prod).filter(Boolean))]
    .sort()
    .forEach(p => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
}

// ── Buscar pólizas ───────────────────────────────────────────
// Filtra sobre los recibos activos (1 por contrato)
// para que el resultado no muestre duplicados
export function buscarC() {
  const pol  = (document.getElementById('sq-pol').value  || '').trim().toLowerCase();
  const nom  = (document.getElementById('sq-nom').value  || '').trim().toLowerCase();
  const ced  = (document.getElementById('sq-ced').value  || '').trim().toLowerCase();
  const prod =  document.getElementById('sq-prod-sel').value;
  const est  =  document.getElementById('sq-est').value;
  const mon  =  document.getElementById('sq-mon').value;

  if (!pol && !nom && !ced && !prod && !est && !mon) {
    import('./utils.js').then(u => u.showToast('Ingrese al menos un criterio', 'w'));
    return;
  }

  // Buscar primero en TODOS los recibos para encontrar contratos
  // que coincidan, luego mostrar solo el recibo activo de cada uno
  const polizasCoinciden = new Set(
    state.polizas.filter(r => {
      if (pol  && !(r.poliza    || '').toLowerCase().includes(pol))  return false;
      if (nom  && !(r.asegurado || '').toLowerCase().includes(nom))  return false;
      if (ced  && !((r.cedula   || r.poliza || '') + ' ' + (r.telefonos || '')).toLowerCase().includes(ced)) return false;
      if (prod && r.prod          !== prod) return false;
      if (est  && r.estado_poliza !== est)  return false;
      if (mon  && r.moneda        !== mon)  return false;
      return true;
    }).map(r => r.poliza)
  );

  // De los contratos que coinciden, mostrar solo el recibo activo
  const activosPorContrato = getRecibosActivos(
    state.polizas.filter(r => polizasCoinciden.has(r.poliza))
  );

  // Aplicar filtros de estado y moneda sobre los activos
  state.crResults = activosPorContrato.filter(r => {
    if (est && r.estado_poliza !== est) return false;
    if (mon && r.moneda        !== mon) return false;
    return true;
  });

  state.crPage = 1;
  sortCR();

  document.getElementById('cart-empty').style.display   = 'none';
  document.getElementById('cart-results').style.display = 'block';
  document.getElementById('sq-hint').textContent =
    `${state.crResults.length} contrato${state.crResults.length !== 1 ? 's' : ''}`;
}

// ── Limpiar búsqueda ─────────────────────────────────────────
export function limpiarC() {
  ['sq-pol', 'sq-nom', 'sq-ced'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
  ['sq-prod-sel', 'sq-est', 'sq-mon'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
  state.crResults = [];
  document.getElementById('cart-results').style.display = 'none';
  document.getElementById('cart-empty').style.display   = 'block';
  document.getElementById('sq-hint').textContent =
    'Ingrese al menos un criterio de búsqueda';
}

// ── Ordenar resultados ───────────────────────────────────────
export function sortCR() {
  const k = document.getElementById('cr-sort').value;
  if (k === 'az')
    state.crResults.sort((a, b) => (a.asegurado || '').localeCompare(b.asegurado || ''));
  else if (k === 'tdesc')
    state.crResults.sort((a, b) => (b.total || 0) - (a.total || 0));
  else
    state.crResults.sort((a, b) => (a.dias_venc || 0) - (b.dias_venc || 0));
  renderCRTable();
}

// ── Renderizar tabla de resultados ───────────────────────────
export function renderCRTable() {
  const total = state.crResults.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.crPage > pages) state.crPage = 1;
  const start = (state.crPage - 1) * PAGE_SIZE;
  const rows  = state.crResults.slice(start, start + PAGE_SIZE);

  document.getElementById('cr-count').textContent =
    `${total} contrato${total !== 1 ? 's' : ''}`;

  document.getElementById('tbody-cr').innerHTML = rows.length
    ? rows.map(r => {
        const dv  = r.dias_venc || 0;
        const dc  = dv <= 25 ? 'dh' : dv <= 35 ? 'dm' : 'dok';
        const sym = r.moneda === 'CRC' ? '₡' : '$';
        const tc  = r.moneda === 'CRC' ? 'crc-t' : 'usd-t';
        const ep  = r.estado_poliza === 'Período gracia'
          ? '<span class="pill py">⚠ Gracia</span>'
          : r.estado_poliza === 'Cancelada'
            ? '<span class="pill pr">✕</span>'
            : '<span class="pill pg">● Vigente</span>';
        return `<tr onclick="window._openDet('${r._id}')">
          <td style="color:${r.verif ? 'var(--green)' : 'var(--muted)'};font-weight:800">${r.verif ? '✓' : '–'}</td>
          <td><span class="db ${dc}">${dv}d</span></td>
          <td class="nm">${trunc(r.asegurado || '', 26)}</td>
          <td class="mn">${trunc(r.poliza    || '', 20)}</td>
          <td>${trunc(r.prod || '', 24)}</td>
          <td class="mn">${fmtDate(r.desde)}</td>
          <td class="mn">${fmtDate(r.hasta)}</td>
          <td class="rvc">${fmtDate(r.hasta)}</td>
          <td><span class="pill pgr">${r.fr || '—'}</span></td>
          <td class="am ${tc}">${sym}${fmt(r.total || 0)}</td>
          <td><span class="${tc}" style="font-size:10px;font-weight:700">${r.moneda || ''}</span></td>
          <td>${ep}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--muted)">Sin resultados</td></tr>';

  // Paginación
  let btns = '';
  const sp = Math.max(1, state.crPage - 3);
  const ep = Math.min(pages, sp + 6);
  if (sp > 1) btns += `<button class="pgb" onclick="window._crGo(1)">1</button>${sp > 2 ? '<span style="color:var(--muted)">…</span>' : ''}`;
  for (let i = sp; i <= ep; i++)
    btns += `<button class="pgb ${i === state.crPage ? 'active' : ''}" onclick="window._crGo(${i})">${i}</button>`;
  if (ep < pages)
    btns += `${ep < pages - 1 ? '<span style="color:var(--muted)">…</span>' : ''}<button class="pgb" onclick="window._crGo(${pages})">${pages}</button>`;

  document.getElementById('pag-cr').innerHTML =
    `${btns}<span class="pi">${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total}</span>`;
}

// Navegación de página
export function crGo(p) {
  state.crPage = p;
  renderCRTable();
}
