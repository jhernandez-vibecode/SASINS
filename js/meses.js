// ============================================================
// meses.js
// Módulo de Meses: gestiona el selector de mes activo en
// Cobros y la carga de pólizas del mes seleccionado desde Firebase.
// ============================================================

import { db, collection, getDocs } from './firebase.js';
import { calcMesOrigen, MESES_ES } from './utils.js';
import { state } from './state.js';
import { buildCobProdFilter, renderCobros, updateCobStats } from './cobros.js';

// ── Renderizar selector de meses en el sidebar de Cobros ─────
// Solo muestra el dropdown con los meses que tienen pólizas.
// Los chips fueron eliminados para simplificar la interfaz.
export function renderMesesList() {
  const list = document.getElementById('meses-list');
  const sel  = document.getElementById('mes-activo-sel');
  if (!list || !sel) return;

  // Generar rango de meses: 2 atrás hasta 19 adelante
  const hoy   = new Date();
  const start = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
  const end   = new Date(hoy.getFullYear(), hoy.getMonth() + 19, 1);
  const rango = [];
  for (let d = new Date(start); d < end; d.setMonth(d.getMonth() + 1))
    rango.push(MESES_ES[d.getMonth()] + d.getFullYear());

  // Contar pólizas por mes según su fecha "desde"
  const cuentas = {};
  state.polizas.forEach(r => {
    if (!r.desde) return;
    const m = calcMesOrigen(r.desde);
    cuentas[m] = (cuentas[m] || 0) + 1;
  });

  // Agregar meses con pólizas que estén fuera del rango generado
  Object.keys(cuentas).forEach(m => {
    if (!rango.includes(m)) rango.push(m);
  });
  rango.sort();

  // Llenar el selector solo con meses que tienen pólizas
  sel.innerHTML = '<option value="">— Seleccionar mes —</option>';
  rango.filter(m => cuentas[m] > 0).forEach(m => {
    const o       = document.createElement('option');
    o.value       = m;
    o.textContent = `${m}  (${cuentas[m]} pólizas)`;
    sel.appendChild(o);
  });

  // Mantener el mes activo seleccionado si ya había uno
  if (state.mesActivo) sel.value = state.mesActivo;

  // Ocultar la sección de chips — ya no se usan
  list.innerHTML    = '';
  list.style.display = 'none';
}

// ── Activar un mes como mes activo para cobros ───────────────
// Se llama cuando el agente selecciona un mes en el dropdown
export function setMesActivo(mes) {
  state.mesActivo = mes;
  setCobData();
  renderMesesList();
}

// ── Filtrar pólizas del mes activo ───────────────────────────
// Carga en state.cobData solo los recibos del mes seleccionado
export function setCobData() {
  if (!state.mesActivo) {
    state.cobData = [];
  } else {
    state.cobData = state.polizas.filter(r =>
      r.desde && calcMesOrigen(r.desde) === state.mesActivo
    );
  }
  state.selectedCob = new Set();
  buildCobProdFilter();
  renderCobros();
  updateCobStats();
}

// ── Cargar estados de pagado y WA desde Firebase ─────────────
// Llena los caches locales para no consultar Firebase en cada fila
export async function loadEstadosCobros() {
  try {
    const [ps, ws] = await Promise.all([
      getDocs(collection(db, 'pagados')),
      getDocs(collection(db, 'wa_envios'))
    ]);
    state.pagadosCache = {};
    ps.forEach(d => { state.pagadosCache[d.id] = true; });
    state.waCache = {};
    ws.forEach(d => { state.waCache[d.id] = d.data().count || 0; });
  } catch (e) {
    console.warn('loadEstadosCobros error:', e);
  }
}

// ── Verificar meses cargados en la vista Import ──────────────
// Muestra qué meses ya tienen datos en Firebase
export async function checkMeses() {
  const snap  = await getDocs(collection(db, 'polizas'));
  const meses = {};
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

  el.innerHTML = Object.entries(meses).sort().map(([m, n]) => `
    <div class="mes-card">
      <span style="color:var(--green);font-weight:800">✓</span>
      <span style="font-family:var(--fh);font-weight:700;font-size:12px">${m}</span>
      <span class="cbadge">${n} pólizas</span>
    </div>`).join('');
}
