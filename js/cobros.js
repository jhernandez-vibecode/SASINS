// ============================================================
// cobros.js
// Módulo de Cobros: tabla de pólizas del mes activo,
// chips de filtro, stats, checkboxes y paginación.
// ============================================================

import { fmt, trunc, fmtDate, rowKey, showToast } from './utils.js';
import { state } from './state.js';

// Tamaño de página de la tabla de cobros
const PAGE_SIZE = 25;

// ── Verificar si una póliza está marcada como pagada ─────────
// Busca en el cache local que se cargó desde Firebase
export const isPagado = r => !!state.pagadosCache[rowKey(r)];

// ── Cambiar filtro principal (chips superiores) ──────────────
// t puede ser: 'all', 'Pendiente', 'Período gracia', 'pagado'
export function setCobTab(t, el) {
  state.cobTab  = t;
  state.cobPage = 1;

  // Quitar color a todos los chips y poner el color correcto al activo
  document.querySelectorAll('#cob-chips .cob-chip')
    .forEach(c => c.classList.remove('on', 'gon', 'yon', 'ron'));
  if      (t === 'pagado')         el.classList.add('gon'); // verde
  else if (t === 'Pendiente')      el.classList.add('yon'); // amarillo
  else if (t === 'Período gracia') el.classList.add('ron'); // rojo
  else                             el.classList.add('on');  // azul (Todos)

  renderCobros();
}

// ── Activar/desactivar filtros secundarios ───────────────────
// 'nowa'    → mostrar solo pólizas SIN WhatsApp enviado
// 'noemail' → mostrar solo pólizas SIN correo enviado
export function toggleCobF(f) {
  if (f === 'nowa') {
    state.cobFiltNowa = !state.cobFiltNowa;
    document.getElementById('chip-nowa-cob')
      .classList.toggle('on', state.cobFiltNowa);
  } else {
    state.cobFiltNoEmail = !state.cobFiltNoEmail;
    document.getElementById('chip-noemail-cob')
      .classList.toggle('on', state.cobFiltNoEmail);
  }
  renderCobros();
}

// ── Construir selector de productos en Cobros ────────────────
// Lee los productos únicos del mes activo y llena el dropdown
export function buildCobProdFilter() {
  const sel = document.getElementById('cob-prod-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos los productos</option>';
  [...new Set(state.cobData.map(r => r.prod).filter(Boolean))]
    .sort()
    .forEach(p => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
}

// ── Actualizar estadísticas del mes activo ───────────────────
// Los 5 contadores arriba de la tabla: Total, Pendientes,
// Período gracia, Pagados y WA enviados
export function updateCobStats() {
  const D = state.cobData;
  const g = id => document.getElementById(id);
  if (g('cs-total')) g('cs-total').textContent = D.length;
  if (g('cs-pend'))  g('cs-pend').textContent  = D.filter(r => !isPagado(r) && r.estado_poliza === 'Vigente').length;
  if (g('cs-venc'))  g('cs-venc').textContent  = D.filter(r => !isPagado(r) && r.estado_poliza === 'Período gracia').length;
  if (g('cs-pag'))   g('cs-pag').textContent   = D.filter(r =>  isPagado(r)).length;
  if (g('cs-wa'))    g('cs-wa').textContent    = D.filter(r => (state.waCache[rowKey(r)] || 0) > 0).length;
}

// ── Renderizar tabla principal de Cobros ─────────────────────
// Aplica todos los filtros activos y dibuja las filas
export function renderCobros() {
  const q    = (document.getElementById('cob-search')   || {}).value || '';
  const prod = (document.getElementById('cob-prod-sel') || {}).value || '';
  const fr   = (document.getElementById('cob-fr-sel')   || {}).value || '';

  // Aplicar filtros uno a uno
  let data = state.cobData.filter(r => {
    const pag = isPagado(r);

    // Filtro por chip principal
    if (state.cobTab === 'pagado'         &&  !pag) return false;
    if (state.cobTab === 'Pendiente'      && ( pag || r.estado_poliza !== 'Vigente'))        return false;
    if (state.cobTab === 'Período gracia' && ( pag || r.estado_poliza !== 'Período gracia')) return false;

    // Filtro "Sin WA": excluir los que ya tienen WA enviado o no tienen teléfono
    if (state.cobFiltNowa && (state.waCache[rowKey(r)] || 0) > 0) return false;
    if (state.cobFiltNowa && !parsePhone(r.telefonos))             return false;

    // Filtro "Sin correo": excluir los que ya tienen correo registrado
    if (state.cobFiltNoEmail && parseEmails(r.correos).length > 0) return false;

    // Filtro por producto
    if (prod && r.prod !== prod) return false;

    // Filtro por frecuencia
    if (fr && r.fr !== fr) return false;

    // Filtro por búsqueda de texto (póliza o nombre)
    if (q) {
      const n = (r.asegurado || '').toLowerCase();
      const p = (r.poliza    || '').toLowerCase();
      if (!n.includes(q.toLowerCase()) && !p.includes(q.toLowerCase())) return false;
    }

    return true;
  });

  // Ordenar por días de vencimiento (los más urgentes primero)
  data.sort((a, b) => (a.dias_venc || 0) - (b.dias_venc || 0));
  state.cobFiltered = data;

  // Calcular paginación
  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.cobPage > pages) state.cobPage = 1;
  const start = (state.cobPage - 1) * PAGE_SIZE;
  const rows  = data.slice(start, start + PAGE_SIZE);

  // Actualizar contador de registros
  const cnt = document.getElementById('cob-count');
  if (cnt) cnt.textContent = `${total} registro${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('tbody-cobros');
  if (!tbody) return;

  // Mensaje si no hay mes seleccionado
  if (!state.cobData.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--muted);">Seleccione un mes activo en el panel izquierdo</td></tr>';
    document.getElementById('pag-cobros').innerHTML = '';
    return;
  }

  // Construir filas de la tabla
  tbody.innerHTML = rows.map(r => {
    const pag    = isPagado(r);
    const wa     = state.waCache[rowKey(r)] || 0;
    const emails = parseEmails(r.correos);
    const hasPh  = !!parsePhone(r.telefonos);
    const sym    = r.moneda === 'CRC' ? '₡' : '$';
    const tc     = r.moneda === 'CRC' ? 'crc-t' : 'usd-t';

    // Celda de correo: muestra el primer email o aviso "sin correo"
    const emailCell = emails.length
      ? `<span style="font-size:10px;color:var(--green);font-family:'Courier New',monospace;">${emails[0]}${emails.length > 1 ? '…' : ''}</span>`
      : '<span style="font-size:10px;color:var(--red);">sin correo</span>';

    // Celda de WhatsApp: botón enviar, o contador si ya se envió
    const waCell = !hasPh
      ? '<span style="font-size:10px;color:var(--muted);">sin tel.</span>'
      : wa > 0
        ? `<div style="display:flex;align-items:center;gap:4px;">
             <button onclick="window._abrirWa('${r._id}')" style="background:#25d366;color:#fff;border:none;padding:2px 7px;border-radius:6px;font-size:10px;cursor:pointer;">WA</button>
             <span onclick="window._resetWa('${r._id}')" style="font-size:10px;background:#fff;color:#000;padding:1px 5px;border-radius:10px;font-family:'Courier New',monospace;cursor:pointer;" title="Enviado ${wa}x · clic para desmarcar">✓${wa}</span>
           </div>`
        : `<button onclick="window._abrirWa('${r._id}')" style="background:#25d366;color:#fff;border:none;padding:2px 8px;border-radius:6px;font-size:10px;cursor:pointer;">📱 WA</button>`;

    // Botón de pago: verde si pagada, gris si pendiente
    const pagBtn = pag
      ? `<button class="pag-btn is-pag" onclick="window._openDet('${r._id}')">✅ Pagada</button>`
      : `<button class="pag-btn no-pag" onclick="window._openDet('${r._id}')">○ Registrar pago</button>`;

    return `<tr onclick="window._openDet('${r._id}')" style="cursor:pointer;">
      <td><input type="checkbox" ${state.selectedCob.has(r._id) ? 'checked' : ''}
          onchange="window._toggleSelCob('${r._id}', this)" style="cursor:pointer"></td>
      <td class="mn">${trunc(r.poliza    || '', 18)}</td>
      <td class="nm">${trunc(r.asegurado || '', 22)}</td>
      <td style="font-size:11px;color:var(--yellow);">${trunc(r.prod || '', 20)}</td>
      <td class="mn">${fmtDate(r.desde)}</td>
      <td class="mn">${fmtDate(r.hasta)}</td>
      <td><span class="pill pgr">${r.fr || '—'}</span></td>
      <td class="am ${tc}">${sym}${fmt(r.total || 0)}</td>
      <td>${emailCell}</td>
      <td>${waCell}</td>
      <td>${pagBtn}</td>
      <td><button class="btn-ghost" style="font-size:10px;padding:2px 7px;"
          onclick="window._openDet('${r._id}')">✏️</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--muted)">Sin registros para los filtros</td></tr>';

  // Actualizar checkbox "seleccionar todos"
  const chkAll = document.getElementById('chk-all-cob');
  if (chkAll) chkAll.checked =
    rows.length > 0 && rows.every(r => state.selectedCob.has(r._id));

  // ── Paginación ───────────────────────────────────────────
  let btns = '';
  const sp = Math.max(1, state.cobPage - 3);
  const ep = Math.min(pages, sp + 6);
  if (sp > 1) btns += `<button class="pgb" onclick="window._cobGo(1)">1</button>${sp > 2 ? '<span style="color:var(--muted)">…</span>' : ''}`;
  for (let i = sp; i <= ep; i++)
    btns += `<button class="pgb ${i === state.cobPage ? 'active' : ''}" onclick="window._cobGo(${i})">${i}</button>`;
  if (ep < pages)
    btns += `${ep < pages - 1 ? '<span style="color:var(--muted)">…</span>' : ''}<button class="pgb" onclick="window._cobGo(${pages})">${pages}</button>`;

  document.getElementById('pag-cobros').innerHTML =
    `${btns}<span class="pi">${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total}</span>`;
}

// ── Navegación de página ─────────────────────────────────────
export function cobGo(p) {
  state.cobPage = p;
  renderCobros();
}

// ── Selección de checkboxes ──────────────────────────────────
// Agrega o quita un ID del Set de seleccionados
export function toggleSelCob(id, el) {
  if (el.checked) state.selectedCob.add(id);
  else            state.selectedCob.delete(id);
}

// Seleccionar o deseleccionar todos los visibles
export function toggleAllCob(el) {
  if (el.checked) state.cobFiltered.forEach(r => state.selectedCob.add(r._id));
  else            state.cobFiltered.forEach(r => state.selectedCob.delete(r._id));
  renderCobros();
}

// ── Helpers de contacto ──────────────────────────────────────
// Extrae lista de emails del campo correos (separados por ; o ,)
export const parseEmails = v => {
  if (!v || String(v).trim() === '' || String(v).trim() === 'NaN') return [];
  return String(v).split(/[;,]/).map(e => e.trim()).filter(e => e.includes('@'));
};

// Extrae el primer teléfono y lo formatea con código de CR (+506)
export const parsePhone = v => {
  if (!v || String(v).trim() === '' || String(v).trim() === 'NaN') return '';
  const raw    = String(v).trim().split(/[;,]/)[0].trim();
  const digits = raw.replace(/\([^)]*\)/g, '').replace(/[^0-9+]/g, '').trim();
  if (!digits) return '';
  if (digits.startsWith('+'))   return digits;
  if (digits.startsWith('506')) return '+' + digits;
  return '+506' + digits;
};
