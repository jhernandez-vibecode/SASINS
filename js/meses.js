// ============================================================
// meses.js
// Módulo de Meses: gestiona el selector de mes activo en
// Cobros, los chips de meses disponibles y la carga de
// pólizas del mes seleccionado desde Firebase.
// ============================================================

import { db, collection, getDocs } from './firebase.js';
import { calcMesOrigen, MESES_ES } from './utils.js';
import { state } from './state.js';
import { buildCobProdFilter, renderCobros, updateCobStats } from './cobros.js';

// ── Renderizar lista de meses en el sidebar de Cobros ────────
// Genera el selector dropdown y los chips de meses que
// tienen pólizas cargadas en Firebase.
// Muestra un rango desde 2 meses atrás hasta 18 meses adelante.
export function renderMesesList() {
  const list = document.getElementById('meses-list');
  const sel  = document.getElementById('mes-activo-sel');
  if (!list || !sel) return;

  // Generar rango de meses a mostrar en el selector
  const hoy  = new Date();
  const start = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
  const end   = new Date(hoy.getFullYear(), hoy.getMonth() + 19, 1);
  const rango = [];
  for (let d = new Date(start); d < end; d.setMonth(d.getMonth() + 1))
    rango.push(MESES_ES[d.getMonth()] + d.getFullYear());

  // Contar pólizas por mes según su fecha "desde"
  // (mes en que inicia el período = mes en que se cobra)
  const cuentas = {};
  state.polizas.forEach(r => {
    if (!r.desde) return;
    const m = calcMesOrigen(r.desde);
    cuentas[m] = (cuentas[m] || 0) + 1;
  });

  // Agregar meses que tienen pólizas pero están fuera del rango
  Object.keys(cuentas).forEach(m => {
    if (!rango.includes(m)) rango.push(m);
  });
  rango.sort(); // Ordenar cronológicamente

  // Construir opciones del selector dropdown
  sel.innerHTML = '<option value="">— Seleccionar mes —</option>';
  rango.forEach(m => {
    const o   = document.createElement('option');
    o.value   = m;
    const cnt = cuentas[m] || 0;
    // Mostrar cantidad de pólizas y marcar el mes activo actual
    o.textContent = m
      + (cnt ? ` (${cnt})` : '  — sin pólizas')
      + (state.mesActivo === m ? ' ←' : '');
    sel.appendChild(o);
  });

  // Mantener seleccionado el mes activo si ya había uno
  if (state.mesActivo) sel.value = state.mesActivo;

  // Construir chips de meses que tienen pólizas
  const conPolizas = rango.filter(m => cuentas[m] > 0);
  if (!conPolizas.length) {
    list.innerHTML = '<span style="color:var(--muted);font-size:11px;">Sin pólizas cargadas. Use el drop XLS.</span>';
  } else {
    list.innerHTML = conPolizas.map(m => `
      <span class="mes-chip ${m === state.mesActivo ? 'mes-active' : ''}">
        <strong>${m}</strong>
        <span style="color:var(--muted);font-size:10px;">
          ${cuentas[m]} póliza${cuentas[m] !== 1 ? 's' : ''}
        </span>
      </span>`).join('');
  }
}

// ── Activar un mes como mes activo para cobros ───────────────
// Filtra state.polizas por el mes seleccionado y actualiza
// la tabla de cobros con los recibos de ese mes
export function setMesActivo(mes) {
  state.mesActivo = mes;
  setCobData();
  renderMesesList(); // Actualizar chips para reflejar el mes activo
}

// ── Filtrar pólizas del mes activo ───────────────────────────
// Carga en state.cobData solo las pólizas cuyo mes de cobro
// coincide con el mes activo seleccionado
export function setCobData() {
  if (!state.mesActivo) {
    state.cobData = [];
  } else {
    // Filtrar por calcMesOrigen(desde) para obtener el mes de cobro
    state.cobData = state.polizas.filter(r =>
      r.desde && calcMesOrigen(r.desde) === state.mesActivo
    );
  }

  // Resetear selección y reconstruir filtros
  state.selectedCob = new Set();
  buildCobProdFilter();
  renderCobros();
  updateCobStats();
}

// ── Cargar estados de pagado y WA desde Firebase ─────────────
// Se ejecuta al iniciar la app y después de cada cambio.
// Llena los caches locales para no consultar Firebase en cada fila.
export async function loadEstadosCobros() {
  try {
    const [ps, ws] = await Promise.all([
      getDocs(collection(db, 'pagados')),   // pólizas pagadas
      getDocs(collection(db, 'wa_envios'))  // WhatsApps enviados
    ]);

    // Cache de pagados: { rowKey: true }
    state.pagadosCache = {};
    ps.forEach(d => { state.pagadosCache[d.id] = true; });

    // Cache de WA: { rowKey: cantidad_enviada }
    state.waCache = {};
    ws.forEach(d => { state.waCache[d.id] = d.data().count || 0; });

  } catch (e) {
    console.warn('loadEstadosCobros error:', e);
  }
}

// ── Verificar meses cargados en la vista Import ──────────────
// Muestra en la pantalla de importación qué meses ya tienen
// datos en Firebase con su cantidad de pólizas
export async function checkMeses() {
  const snap   = await getDocs(collection(db, 'polizas'));
  const meses  = {};
  snap.docs.forEach(d => {
    const m = d.data().mes_origen;
    if (m) meses[m] = (meses[m] || 0) + 1;
  });

  const el = document.getElementById('meses-cargados');
  if (!el) return;

  if (!Object.keys(meses).length) {
    el.innerHTML = '<span style="color:var(--yellow)">⚠ No hay datos. Cargue un archivo XLS del INS.</span>';
    return;
  }

  // Mostrar cada mes como una tarjeta con su cantidad de pólizas
  el.innerHTML = Object.entries(meses).sort().map(([m, n]) => `
    <div class="mes-card">
      <span style="color:var(--green);font-weight:800">✓</span>
      <span style="font-family:var(--fh);font-weight:700;font-size:12px">${m}</span>
      <span class="cbadge">${n} pólizas</span>
    </div>`).join('');
}
