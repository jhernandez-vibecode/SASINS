// ============================================================
// app.js
// Punto de entrada principal del sistema SASINS.
// Une todos los módulos, carga los datos de Firebase y
// expone las funciones al HTML para que los onclick funcionen.
// Es el único archivo que importa de todos los demás módulos.
// ============================================================

// ── Importar Firebase ─────────────────────────────────────────
import { db, collection, doc, addDoc, updateDoc, setDoc,
         deleteDoc, getDocs, query, orderBy,
         serverTimestamp, where, getDoc } from './firebase.js';

// ── Importar utilidades y estado ──────────────────────────────
import { fmt, trunc, fmtDate, getIcon, rowKey,
         connSet, showToast, toast } from './utils.js';
import { state } from './state.js';

// ── Importar todos los módulos ────────────────────────────────
import { renderKPIs, populateSQProd, buscarC,
         limpiarC, sortCR, renderCRTable,
         crGo } from './cartera.js';

import { renderCobros, updateCobStats, setCobTab,
         toggleCobF, toggleSelCob, toggleAllCob,
         cobGo, isPagado, parseEmails,
         parsePhone } from './cobros.js';

import { saveGestion, confirmarPago,
         togglePagadaFields,
         toggleHistorialInline } from './pagos.js';

import { renderMesesList, setMesActivo,
         setCobData, loadEstadosCobros,
         checkMeses } from './meses.js';

import { handleXLS, confirmXLS, cancelXLS,
         confirmLimpiar, ejecutarLimpiar } from './importar.js';

import { gmailLogin, gmailLogout,
         togglePlt, loadPlt, savePlt,
         resetPlt, saveAdmEmail,
         resetAdmEmail } from './gmail.js';

import { abrirWa, confirmarWa, resetWa,
         abrirWaMasivo, saveAdmWa,
         resetAdmWa, loadAdmWa } from './whatsapp.js';

import { renderClientes, openClienteModal,
         setTipo, saveCliente,
         populateProdSelect } from './clientes.js';

import { renderProductos, openProdModal,
         saveProducto, seedProductos,
         setAdmTab } from './productos.js';

import { renderDashboard } from './dashboard.js';

import { enviarCorreos } from './gmail.js';

// ── Cargar todos los datos desde Firebase ─────────────────────
// Esta es la función principal del sistema.
// Se llama al iniciar y después de cada cambio importante.
// Carga pólizas, clientes y productos en paralelo para ser más rápido.
window.loadAll = async function () {
  connSet('loading');
  try {
    const [snapP, snapC, snapPr] = await Promise.all([
      getDocs(query(collection(db, 'polizas'),  orderBy('dias_venc'))),
      getDocs(query(collection(db, 'clientes'), orderBy('nombre_completo'))),
      getDocs(query(collection(db, 'productos'), orderBy('nombre')))
    ]);

    // Guardar datos en el estado global con su ID de documento
    state.polizas  = snapP.docs.map(d => ({ _id: d.id, ...d.data() }));
    state.clientes = snapC.docs.map(d => ({ _id: d.id, ...d.data() }));
    state.prods    = snapPr.docs.map(d => ({ _id: d.id, ...d.data() }));

    // Si no hay productos, cargar los 16 del INS por primera vez
    if (state.prods.length === 0) await seedProductos();

    connSet('ok', state.polizas.length);

    // Refrescar todos los módulos con los datos nuevos
    renderKPIs();
    renderClientes();
    renderProductos();
    populateSQProd();
    populateProdSelect();
    renderMesesList();
    checkMeses();
    loadPlt();

    // Si hay un mes activo seleccionado, refrescar la tabla de cobros
    if (state.mesActivo) setCobData();

    // Cargar estados de pagado y WA desde Firebase
    await loadEstadosCobros();

  } catch (e) {
    connSet('err');
    toast('Error de conexión: ' + e.message, 'e');
  }
};

// ── Modal detalle de póliza ───────────────────────────────────
// Abre el modal con todos los datos de la póliza seleccionada.
// Se usa tanto desde Cartera como desde Cobros.
window._openDet = function (id) {
  const r = state.polizas.find(x => x._id === id);
  if (!r) return;

  state.currentPolId = id;

  // Rellenar encabezado del modal
  document.getElementById('m-icon').textContent = getIcon(r.prod);
  document.getElementById('m-nom').textContent  = r.asegurado || '';
  document.getElementById('m-pol').textContent  = (r.poliza || '') + ' · ' + (r.prod || '');

  // Rellenar datos de la póliza (solo lectura)
  // Poblar selector de producto con todos los productos activos
const mprod = document.getElementById('m-prod');
mprod.innerHTML = '<option value="">— Seleccionar producto —</option>' +
  state.prods.filter(p => p.activo).map(p =>
    `<option value="${p.nombre}" ${p.nombre === r.prod ? 'selected' : ''}>${p.nombre}</option>`
  ).join('');
  document.getElementById('m-desde').textContent = fmtDate(r.desde);
  document.getElementById('m-hasta').textContent = fmtDate(r.hasta);
  document.getElementById('m-fr').textContent    = r.fr    || '—';
  document.getElementById('m-prox').textContent  = fmtDate(r.hasta);

  // Mostrar monto con color según moneda
  const sym = r.moneda === 'CRC' ? '₡' : '$';
  const tc  = r.moneda === 'CRC' ? 'crc-t' : 'usd-t';
  document.getElementById('m-total').innerHTML =
    `<span class="${tc}">${sym}${fmt(r.total || 0)}</span>`;
  document.getElementById('m-dias').textContent =
    `${r.dias_venc || 0} días`;

  // Badge de estado de la póliza
  document.getElementById('m-ebadge').innerHTML =
    r.estado_poliza === 'Período gracia'
      ? '<span class="pill py">⚠ Período gracia</span>'
      : '<span class="pill pg">● Vigente</span>';

  // Rellenar campos editables de contacto y gestión
  document.getElementById('m-tel').value       = r.telefonos      || '';
  document.getElementById('m-email').value     = (r.correos || '').trim();
  document.getElementById('m-resultado').value = r.resultado      || '';
  document.getElementById('m-confirmar').value = r.confirmar      || '';
  document.getElementById('m-gestion').value   = r.ultima_gestion || '';
  document.getElementById('m-estado-sel').value = r.estado_poliza || 'Vigente';
  document.getElementById('m-medio-pago').value = r.medio_pago    || '';
  document.getElementById('m-pago-obs').value   = r.pago_obs      || '';

  // Mostrar/ocultar sección de pago según estado
  // Mostrar sección vehículo solo para pólizas de automóviles
const esAuto = (r.prod || '').toUpperCase().includes('AUTO');
const secVeh = document.getElementById('sec-vehiculo');
if (secVeh) secVeh.style.display = esAuto ? 'block' : 'none';

// Cargar datos del vehículo si existen
document.getElementById('m-marca').value       = r.marca      || '';
document.getElementById('m-modelo').value      = r.modelo     || '';
document.getElementById('m-anio').value        = r.anio       || '';
document.getElementById('m-color').value       = r.color      || '';
document.getElementById('m-monto-aseg').value  = r.monto_aseg || '';
document.getElementById('m-placa').value       = r.placa      || '';
document.getElementById('m-coberturas').value  = r.coberturas || '';

// Cargar bitácora de cambios
const bitEl = document.getElementById('m-bitacora-list');
const bits  = r.bitacora || [];
bitEl.innerHTML = bits.length
  ? bits.map(b => `<div style="padding:3px 0;border-bottom:1px solid var(--bdr)33;">
      <span style="color:var(--muted);font-size:10px;">${b.fecha}</span>
      <span style="margin-left:8px;">${b.texto}</span>
    </div>`).join('')
  : '<span style="color:var(--muted);">Sin cambios registrados aún.</span>';

// Limpiar campo de nueva entrada
document.getElementById('m-bitacora-nueva').value = '';       
  togglePagadaFields();

  // Resetear historial inline al abrir modal
  const hp = document.getElementById('historial-panel');
  if (hp) hp.style.display = 'none';
  const bh = document.getElementById('btn-historial');
  if (bh) {
    bh.textContent      = '📋 Ver historial';
    bh.dataset.poliza   = r.poliza  || '';
    bh.dataset.moneda   = r.moneda  || 'CRC';
  }

  document.getElementById('modal-det').classList.add('open');
};

// ── Cerrar cualquier modal ────────────────────────────────────
window._closeModal = function (id) {
  document.getElementById(id).classList.remove('open');
};

// ── Cambiar vista principal ───────────────────────────────────
// Muestra el panel correcto y activa el botón del nav
window.showView = function (v, btn) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  document.querySelectorAll('.nb').forEach(x => x.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Acciones específicas al cambiar de vista
  if (v === 'dashboard') renderDashboard();
  if (v === 'cobros')    { renderCobros(); updateCobStats(); }
  if (v === 'clientes')  renderClientes();
  if (v === 'productos') {
    renderProductos();
    document.querySelectorAll('.adm-panel')
      .forEach((p, i) => p.style.display = i === 0 ? 'block' : 'none');
    document.querySelectorAll('.tab2')
      .forEach((t, i) => t.classList.toggle('active', i === 0));
  }
};

// ── Exponer funciones al HTML (onclick en botones) ────────────
// Todas las funciones llamadas desde onclick="..." en index.html
// deben estar aquí asignadas a window

// Cartera
window.buscarC    = buscarC;
window.limpiarC   = limpiarC;
window.sortCR     = sortCR;
window._crGo      = crGo;

// Cobros
window.setCobTab      = setCobTab;
window.toggleCobF     = toggleCobF;
window.renderCobros   = renderCobros;
window._cobGo         = cobGo;
window._toggleSelCob  = toggleSelCob;
window.toggleAllCob   = toggleAllCob;
window.enviarCorreos  = enviarCorreos;
window.abrirWaMasivo  = abrirWaMasivo;

// Pagos y modal detalle
window.saveGestion          = saveGestion;
window.confirmarPago        = confirmarPago;
window.togglePagadaFields   = togglePagadaFields;
window.toggleHistorialInline = toggleHistorialInline;

// Meses
window.setMesActivo = setMesActivo;

// Importar
window.handleXLS       = handleXLS;
window.confirmXLS      = confirmXLS;
window.cancelXLS       = cancelXLS;
window.confirmImport   = confirmXLS;  // alias para la vista Import
window.cancelImport    = cancelXLS;   // alias para la vista Import
window.confirmLimpiar  = confirmLimpiar;
window.ejecutarLimpiar = ejecutarLimpiar;

// Gmail
window.gmailLogin  = gmailLogin;
window.gmailLogout = gmailLogout;
window.togglePlt   = togglePlt;
window.savePlt     = savePlt;
window.resetPlt    = resetPlt;
window.saveAdmEmail  = saveAdmEmail;
window.resetAdmEmail = resetAdmEmail;

// WhatsApp
window._abrirWa    = abrirWa;
window.confirmarWa = confirmarWa;
window._resetWa    = resetWa;
window.saveAdmWa   = saveAdmWa;
window.resetAdmWa  = resetAdmWa;

// Clientes
window.openClienteModal = openClienteModal;
window.setTipo          = setTipo;
window.saveCliente      = saveCliente;

// Productos y Administrativo
window._openProdModal = openProdModal;
window.saveProducto   = saveProducto;
window.setAdmTab      = setAdmTab;

// ── Eventos de teclado y overlay ─────────────────────────────
// Cerrar modal con tecla Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.ov.open')
      .forEach(o => o.classList.remove('open'));
});

// Cerrar modal al hacer clic fuera del contenido
document.querySelectorAll('.ov').forEach(o =>
  o.addEventListener('click', e => {
    if (e.target === o) o.classList.remove('open');
  })
);

// ── Drag & drop para archivos XLS ────────────────────────────
// Funciona en la zona de drop de Cobros y de la vista Import
['drop-zone', 'drop-xls'].forEach(dzId => {
  const dz = document.getElementById(dzId);
  if (!dz) return;
  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', () =>
    dz.classList.remove('drag-over')
  );
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleXLS(f);
  });
});

// ── Iniciar la aplicación ─────────────────────────────────────
// Carga todos los datos de Firebase al abrir la página
// ── Agregar entrada a la bitácora de cambios ─────────────────
window.agregarBitacora = async function() {
  const texto = document.getElementById('m-bitacora-nueva').value.trim();
  if (!texto) return;
  if (!state.currentPolId) return;

  const r = state.polizas.find(x => x._id === state.currentPolId);
  if (!r) return;

  const fecha = new Date().toLocaleDateString('es-CR',
    { day:'2-digit', month:'short', year:'numeric' });
  const nuevaEntrada = { fecha, texto };
  const bitacoraActual = r.bitacora || [];
  const nuevaBitacora  = [...bitacoraActual, nuevaEntrada];

  try {
    await updateDoc(doc(db, 'polizas', state.currentPolId), {
      bitacora: nuevaBitacora,
      actualizado: serverTimestamp()
    });
    // Actualizar en memoria
    r.bitacora = nuevaBitacora;
    // Refrescar visual
    const bitEl = document.getElementById('m-bitacora-list');
    bitEl.innerHTML = nuevaBitacora.map(b => `
      <div style="padding:3px 0;border-bottom:1px solid var(--bdr)33;">
        <span style="color:var(--muted);font-size:10px;">${b.fecha}</span>
        <span style="margin-left:8px;">${b.texto}</span>
      </div>`).join('');
    document.getElementById('m-bitacora-nueva').value = '';
    toast('Cambio registrado en bitácora ✓', 's');
  } catch(e) {
    toast('Error: ' + e.message, 'e');
  }
};
window.loadAll();
