// ============================================================
// clientes.js
// Módulo de Clientes: renderizado de la grilla de clientes,
// modal de nuevo cliente y guardado en Firebase.
// ============================================================

import { db, collection, addDoc, serverTimestamp } from './firebase.js';
import { trunc, calcDias, calcProx, calcMesOrigen,
         showToast } from './utils.js';
import { state } from './state.js';
import { generarPeriodos } from './importar.js';

// ── Renderizar grilla de clientes ────────────────────────────
// Muestra las tarjetas de clientes filtradas por el buscador.
// Si no hay búsqueda activa muestra todos los clientes.
export function renderClientes() {
  const C = state.clientes;
  const q = (document.getElementById('search-clientes') || {}).value || '';

  // Filtrar por nombre o cédula si hay texto en el buscador
  const filtered = !q ? C : C.filter(c =>
    (c.nombre_completo || '').toLowerCase().includes(q.toLowerCase()) ||
    (c.cedula || '').includes(q)
  );

  // Actualizar contador de clientes
  document.getElementById('clientes-count').textContent =
    `${C.length} cliente${C.length !== 1 ? 's' : ''}`;

  // Construir tarjetas HTML
  document.getElementById('clientes-grid').innerHTML = filtered.length
    ? filtered.map(c => {
        // Iniciales para el avatar (primeras 2 palabras del nombre)
        const ini = (c.nombre_completo || '??')
          .split(' ').slice(0, 2).map(w => w[0]).join('');
        const esJ = c.tipo_cliente === 'juridica';

        return `<div class="cc">
          <div class="cc-hdr">
            <div class="av ${esJ ? 'av-j' : 'av-f'}">${ini}</div>
            <div>
              <div class="cn">${trunc(c.nombre_completo || '', 30)}</div>
              <div class="ct">
                ${esJ ? '🏢 Jurídica' : '👤 Física'} · ${c.cedula || 'Sin cédula'}
              </div>
            </div>
          </div>
          <div class="ci">
            ${c.telefono_principal
              ? `<div class="cr"><span>Tel</span><span>${c.telefono_principal}</span></div>`
              : ''}
            ${c.correo_principal
              ? `<div class="cr"><span>Email</span><span>${trunc(c.correo_principal, 28)}</span></div>`
              : ''}
            ${c.actividad_comercial
              ? `<div class="cr"><span>Act.</span><span>${trunc(c.actividad_comercial, 26)}</span></div>`
              : ''}
          </div>
        </div>`;
      }).join('')
    : '<div style="color:var(--muted);font-size:12px;padding:16px;grid-column:1/-1">No hay clientes aún.</div>';
}

// ── Abrir modal de nuevo cliente ─────────────────────────────
// Resetea el formulario y abre el modal
export function openClienteModal() {
  resetCliForm();
  document.getElementById('modal-cli').classList.add('open');
}

// ── Cambiar tipo de cliente en el modal ──────────────────────
// Muestra el formulario de persona física o jurídica según selección
export function setTipo(tipo) {
  state.tipoCliente = tipo;

  // Activar botón seleccionado
  document.getElementById('btn-fis').classList.toggle('active', tipo === 'fisica');
  document.getElementById('btn-jur').classList.toggle('active', tipo === 'juridica');

  // Mostrar sección correspondiente
  document.getElementById('sec-fis').classList.toggle('active', tipo === 'fisica');
  document.getElementById('sec-jur').classList.toggle('active', tipo === 'juridica');
}

// ── Guardar cliente nuevo en Firebase ────────────────────────
// Recopila todos los campos del formulario, guarda el cliente
// y opcionalmente crea la póliza inicial si se ingresó una
export async function saveCliente() {
  const tipo = state.tipoCliente;

  // Construir nombre completo según tipo de cliente
let nombre = tipo === 'fisica'
  ? [
      document.getElementById('c-ap1').value,  // Primer apellido primero
      document.getElementById('c-ap2').value,  // Segundo apellido
      document.getElementById('c-nom').value   // Nombre al final
    ].filter(Boolean).join(' ')
  : document.getElementById('c-rz').value;

  nombre = nombre.trim().toUpperCase();
  if (!nombre) { showToast('Ingrese el nombre', 'e'); return; }

  // Armar objeto con datos del cliente
  const data = {
    tipo_cliente:       tipo,
    nombre_completo:    nombre,
    cedula:             tipo === 'fisica'
      ? document.getElementById('c-ced').value
      : document.getElementById('c-cj').value,
    telefono_principal:  document.getElementById('c-t1').value,
    telefono_secundario: document.getElementById('c-t2').value,
    correo_principal:    document.getElementById('c-e1').value,
    correo_secundario:   document.getElementById('c-e2').value,
    direccion:           document.getElementById('c-dir').value,
    observaciones:       document.getElementById('c-obs').value,
    creado:              serverTimestamp()
  };

  // Agregar campos específicos según tipo
  if (tipo === 'fisica') {
    data.fecha_nacimiento = document.getElementById('c-nac').value;
    data.estado_civil     = document.getElementById('c-eciv').value;
    data.ocupacion        = document.getElementById('c-ocup').value;
  } else {
    data.representante_legal  = document.getElementById('c-rep').value;
    data.cedula_representante = document.getElementById('c-crep').value;
    data.actividad_comercial  = document.getElementById('c-act').value;
  }

  try {
    // Guardar cliente en colección "clientes"
    await addDoc(collection(db, 'clientes'), data);

    // Si se ingresó número de póliza, crear también el primer recibo
    const np = document.getElementById('cp-num').value;
    if (np) {
      const fr    = document.getElementById('cp-fr').value;
      const hasta = document.getElementById('cp-hasta').value;
      const desde = document.getElementById('cp-desde').value;

      const pdata = {
        poliza:             np,
        asegurado:          nombre,
        prod:               document.getElementById('cp-prod').value,
        desde,
        hasta,
        fr,
        prima:              parseFloat(document.getElementById('cp-prima').value) || 0,
        total:              parseFloat(document.getElementById('cp-total').value) || 0,
        moneda:             document.getElementById('cp-mon').value,
        estado_poliza:      'Vigente',
        estado_recibo:      'Pendiente',
        proxima_renovacion: calcProx(hasta, fr),
        dias_venc:          calcDias(hasta),
        mes_origen:         calcMesOrigen(desde),
        verif:              false,
        confirmar:          '',
        ultima_gestion:     '',
        resultado:          '',
        telefonos:          data.telefono_principal,
        correos:            data.correo_principal,
        creado:             serverTimestamp(),
        actualizado:        serverTimestamp()
      };

      // Guardar primer recibo de la póliza
      await addDoc(collection(db, 'polizas'), pdata);

      // Generar períodos futuros si la frecuencia no es anual
      const ekMap = new Map(
        state.polizas
          .filter(r => r.poliza && r.desde)
          .map(r => [(r.poliza + '__' + r.desde), r._id])
      );
      for (const p of generarPeriodos(pdata, ekMap)) {
        await addDoc(collection(db, 'polizas'), {
          ...p,
          creado:      serverTimestamp(),
          actualizado: serverTimestamp()
        });
      }
    }

    window._closeModal('modal-cli');
    showToast('Cliente guardado ✓', 's');
    resetCliForm();
    window.loadAll(); // Recargar todos los datos

  } catch (e) {
    showToast('Error: ' + e.message, 'e');
  }
}

// ── Resetear formulario del modal cliente ────────────────────
// Limpia todos los campos y vuelve al tipo "física"
export function resetCliForm() {
  [
    'c-nom','c-ap1','c-ap2','c-ced','c-ocup',
    'c-rz','c-cj','c-rep','c-crep','c-act',
    'c-t1','c-t2','c-e1','c-e2','c-dir','c-obs',
    'cp-num','cp-prima','cp-total'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['c-nac','cp-desde','cp-hasta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setTipo('fisica');
}

// ── Poblar selector de productos en modal cliente ────────────
// Llena el dropdown de producto con los productos activos.
// Incluye opción en blanco para forzar selección manual.
export function populateProdSelect() {
  const s = document.getElementById('cp-prod');
  if (!s) return;
  s.innerHTML =
    '<option value="">— Seleccionar producto —</option>' +
    state.prods
      .filter(p => p.activo)
      .map(p => `<option value="${p.nombre}">${p.nombre}</option>`)
      .join('');
}
