// ============================================================
// pagos.js
// Módulo de Pagos: registrar pago, historial inline,
// y generación automática del siguiente período al pagar.
// Este es el módulo más crítico del sistema.
// ============================================================

import { db, collection, doc, addDoc, updateDoc, setDoc,
         deleteDoc, getDocs, query, where,
         serverTimestamp } from './firebase.js';
import { fmt, fmtDate, rowKey, calcProx, calcMesOrigen,
         FR_MESES, showToast, toast } from './utils.js';
import { state } from './state.js';
import { isPagado } from './cobros.js';

// ── Mostrar/ocultar campos de pago en el modal detalle ───────
// Cuando el agente selecciona estado "Pagada", aparece la
// sección verde con fecha y medio de pago
export function togglePagadaFields() {
  const estado = (document.getElementById('m-estado-sel') || {}).value || '';
  const fields = document.getElementById('pago-fields');
  if (fields) fields.style.display = estado === 'Pagada' ? 'block' : 'none';
}

// ── Guardar gestión desde el modal detalle ───────────────────
// Se llama al hacer clic en "Guardar en Firebase" dentro del modal.
// Si el estado es "Pagada": registra el pago en la bitácora,
// marca en pagados, y genera el siguiente período automáticamente.
export async function saveGestion() {
  if (!state.currentPolId) return;
  const r = state.polizas.find(x => x._id === state.currentPolId);
  if (!r) return;

  const estadoNuevo = document.getElementById('m-estado-sel').value;
  const fechaPago   = document.getElementById('m-confirmar').value;
  const medioPago   = document.getElementById('m-medio-pago')
    ? document.getElementById('m-medio-pago').value : '';
  const pagoObs     = document.getElementById('m-pago-obs')
    ? document.getElementById('m-pago-obs').value.trim() : '';

  // Validar campos obligatorios cuando el estado es Pagada
  if (estadoNuevo === 'Pagada') {
    if (!fechaPago) { toast('Ingrese la fecha de pago', 'e'); return; }
    if (!medioPago) { toast('Seleccione el medio de pago', 'e'); return; }
  }

  try {
    // 1. Actualizar el documento de la póliza en Firestore
    await updateDoc(doc(db, 'polizas', state.currentPolId), {
      telefonos:      document.getElementById('m-tel').value,
      correos:        document.getElementById('m-email').value,
      resultado:      document.getElementById('m-resultado').value,
      confirmar:      fechaPago,
      ultima_gestion: document.getElementById('m-gestion').value,
      prod:           document.getElementById('m-prod').value || r.prod,
      estado_poliza:  estadoNuevo,
      medio_pago:     medioPago,
      pago_obs:       pagoObs,
marca:      document.getElementById('m-marca')?.value      || r.marca      || '',
modelo:     document.getElementById('m-modelo')?.value     || r.modelo     || '',
anio:       document.getElementById('m-anio')?.value       || r.anio       || '',
color:      document.getElementById('m-color')?.value      || r.color      || '',
monto_aseg: document.getElementById('m-monto-aseg')?.value || r.monto_aseg || '',
placa:      document.getElementById('m-placa')?.value      || r.placa      || '',
coberturas: document.getElementById('m-coberturas')?.value || r.coberturas || '',
      actualizado:    serverTimestamp()
    });

    if (estadoNuevo === 'Pagada') {
      const k = rowKey(r);

      // 2. Marcar como pagado en cache local y en colección "pagados"
      state.pagadosCache[k] = true;
      await setDoc(doc(db, 'pagados', k), {
        pol: r.poliza,
        nom: r.asegurado,
        ts:  new Date().toISOString()
      });

      // 3. Guardar en bitácora "pagos" solo si no existe ya para este período
      const existePago = await getDocs(
        query(collection(db, 'pagos'),
          where('poliza',     '==', r.poliza   || ''),
          where('fecha_pago', '==', fechaPago))
      );
      if (existePago.empty) {
        await addDoc(collection(db, 'pagos'), {
          poliza_key:  k,
          poliza:      r.poliza     || '',
          asegurado:   r.asegurado  || '',
          prod:        r.prod       || '',
          desde:       r.desde      || '',
          hasta:       r.hasta      || '',
          fr:          r.fr         || '',
          monto:       r.total      || 0,
          moneda:      r.moneda     || 'CRC',
          mes_origen:  r.mes_origen || '',
          fecha_pago:  fechaPago,
          medio_pago:  medioPago,
          observacion: pagoObs,
          registrado:  serverTimestamp()
        });
      }

      // 4. Generar el siguiente período automáticamente ← CRÍTICO
      await generarSiguientePeriodo(r);

      toast('✅ Pago registrado en bitácora', 's');

    } else {
      // Si se cambia de Pagada a otro estado → desmarcar
      if (isPagado(r)) {
        const k = rowKey(r);
        delete state.pagadosCache[k];
        try { await deleteDoc(doc(db, 'pagados', k)); } catch (e2) {}
      }
      toast('Guardado en Firebase ✓', 's');
    }

    // 5. Guardar nota de gestión en historial si hay texto
    const g = document.getElementById('m-gestion').value;
    if (g) {
      await addDoc(collection(db, 'gestiones'), {
        poliza_id: state.currentPolId,
        texto:     g,
        resultado: document.getElementById('m-resultado').value,
        fecha:     serverTimestamp(),
        usuario:   'JHV'
      });
    }

    // Cerrar modal y recargar datos
    window._closeModal('modal-det');
    window.loadAll();

  } catch (e) {
    toast('Error al guardar: ' + e.message, 'e');
  }
}

// ── Confirmar pago desde botón en tabla de Cobros ────────────
// Se llama desde el modal de confirmación rápida de pago
export async function confirmarPago() {
  const fecha = document.getElementById('pago-fecha').value;
  const medio = document.getElementById('pago-medio').value;
  const obs   = document.getElementById('pago-obs').value.trim();

  if (!fecha) { showToast('Ingrese la fecha de pago', 'e'); return; }
  if (!medio) { showToast('Seleccione el medio de pago', 'e'); return; }

  const r = state.polizas.find(x => x._id === state.currentPolId);
  if (!r) return;

  const k = rowKey(r);

  try {
    // 1. Marcar como pagado en cache y en Firebase
    state.pagadosCache[k] = true;
    await setDoc(doc(db, 'pagados', k), {
      pol: r.poliza,
      nom: r.asegurado,
      ts:  new Date().toISOString()
    });

    // 2. Guardar en bitácora de pagos
    await addDoc(collection(db, 'pagos'), {
      poliza_key:  k,
      poliza:      r.poliza     || '',
      asegurado:   r.asegurado  || '',
      prod:        r.prod       || '',
      desde:       r.desde      || '',
      hasta:       r.hasta      || '',
      fr:          r.fr         || '',
      monto:       r.total      || 0,
      moneda:      r.moneda     || 'CRC',
      mes_origen:  r.mes_origen || '',
      fecha_pago:  fecha,
      medio_pago:  medio,
      observacion: obs,
      registrado:  serverTimestamp()
    });

    // 3. Generar el siguiente período automáticamente ← CRÍTICO
    await generarSiguientePeriodo(r);

    window._closeModal('modal-pago');
    showToast('✅ Pago registrado en bitácora');

    // Refrescar tabla y stats sin recargar toda la página
    const { renderCobros, updateCobStats } = await import('./cobros.js');
    renderCobros();
    updateCobStats();

  } catch (e) {
    showToast('Error guardando pago: ' + e.message, 'e');
  }
}

// ── Generar siguiente período al pagar ───────────────────────
// Esta función es el corazón de la automatización del sistema.
// Cuando se marca una póliza como pagada, crea automáticamente
// el próximo recibo en Firebase según la frecuencia de pago:
//   Mensual     → siguiente mes
//   Trimestral  → 3 meses después
//   Semestral   → 6 meses después
//   Anual       → 12 meses después
// Si el recibo ya existe (por carga previa de XLS), no lo duplica.
export async function generarSiguientePeriodo(r) {
  const incremento = FR_MESES[r.fr];

  // Si no tiene frecuencia definida o no tiene fecha hasta, salir
  if (!incremento || !r.hasta) return;

  // El nuevo período empieza exactamente donde termina el actual
  const nextDesde     = r.hasta;
  const nextHastaDate = new Date(r.hasta + 'T12:00:00');
  nextHastaDate.setMonth(nextHastaDate.getMonth() + incremento);
  const nextHasta = nextHastaDate.toISOString().split('T')[0];

  // 1. Verificar en memoria local primero (más rápido)
  const enMemoria = state.polizas.find(
    x => x.poliza === r.poliza && x.desde === nextDesde
  );
  if (enMemoria) return; // Ya existe, no duplicar

  // 2. Verificar en Firestore por si la memoria no está actualizada
  try {
    const snapEx = await getDocs(
      query(collection(db, 'polizas'),
        where('poliza', '==', r.poliza || ''),
        where('desde',  '==', nextDesde))
    );
    if (!snapEx.empty) return; // Ya existe en Firebase, no duplicar
  } catch (e) {
    console.warn('[generarSiguientePeriodo] Error verificando:', e);
  }

  // 3. Calcular datos del nuevo recibo
  const hoy       = new Date();
  const diasVenc  = Math.round((nextHastaDate - hoy) / 86400000);
  const mesOrigen = calcMesOrigen(nextDesde);

  // 4. Crear el nuevo documento en Firebase
  await addDoc(collection(db, 'polizas'), {
    poliza:             r.poliza     || '',
    asegurado:          r.asegurado  || '',
    prod:               r.prod       || '',
    desde:              nextDesde,
    hasta:              nextHasta,
    prima:              r.prima      || 0,
    total:              r.total      || 0,
    moneda:             r.moneda     || 'CRC',
    fr:                 r.fr         || '',
    dias_venc:          diasVenc,
    estado_poliza:      'Vigente',
    estado_recibo:      'Pendiente',
    verif:              false,
    confirmar:          '',
    telefonos:          r.telefonos  || '',
    correos:            r.correos    || '',
    ultima_gestion:     '',
    resultado:          '',
    proxima_renovacion: calcProx(nextHasta, r.fr),
    mes_origen:         mesOrigen,
    tipo:               'RENOVACION',
    es_proyeccion:      true,
    creado:             serverTimestamp(),
    actualizado:        serverTimestamp()
  });

  // 5. Notificar al agente con un toast informativo
  const sym = r.moneda === 'CRC' ? '₡' : '$';
  toast(
    `📅 Próx. renovación generada: ${mesOrigen} · Vence ${fmtDate(nextHasta)} · ${sym}${fmt(r.total || 0)}`,
    'i'
  );
}

// ── Mostrar/ocultar historial de pagos inline ─────────────────
// Se expande dentro del mismo modal detalle, sin abrir otro modal.
// Carga todos los pagos registrados para esa póliza desde Firebase.
export async function toggleHistorialInline(btn) {
  const panel = document.getElementById('historial-panel');
  if (!panel) return;

  // Si ya está visible, ocultarlo
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    btn.textContent = '📋 Ver historial';
    return;
  }

  // Obtener datos del botón
  const poliza = btn.dataset.poliza || '';
  const moneda = btn.dataset.moneda || 'CRC';

  panel.style.display = 'block';
  btn.textContent = '🔼 Ocultar historial';
  document.getElementById('historial-inline-content').innerHTML =
    '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">Cargando…</div>';

  try {
    // Buscar todos los pagos de esta póliza en Firebase
    const snap = await getDocs(
      query(collection(db, 'pagos'), where('poliza', '==', poliza))
    );

    if (snap.empty) {
      document.getElementById('historial-inline-content').innerHTML =
        '<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">Sin pagos registrados aún.</div>';
      return;
    }

    // Ordenar por fecha de pago descendente (más reciente primero)
    const rows  = snap.docs.map(d => d.data())
      .sort((a, b) => (b.fecha_pago || '').localeCompare(a.fecha_pago || ''));
    const sym   = moneda === 'CRC' ? '₡' : '$';
    const tc    = moneda === 'CRC' ? 'crc-t' : 'usd-t';
    const total = rows.reduce((s, p) => s + (p.monto || 0), 0);

    // Construir HTML del historial
    document.getElementById('historial-inline-content').innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:11px;">
        <span style="color:var(--muted)">${rows.length} pago${rows.length !== 1 ? 's' : ''}</span>
        <span class="${tc}" style="font-family:'Courier New',monospace;font-weight:700;">
          Total: ${sym}${fmt(total)}
        </span>
      </div>
      ${rows.map(p => `
        <div style="display:grid;grid-template-columns:90px 130px 1fr;gap:8px;
             align-items:center;padding:7px 0;border-bottom:1px solid var(--bdr)44;font-size:11px;">
          <div style="font-family:'Courier New',monospace;color:var(--green);">
            ${p.fecha_pago || '—'}
          </div>
          <div>
            <span style="background:var(--surf3);padding:2px 7px;border-radius:6px;
                  font-size:10px;font-family:var(--fh);font-weight:700;">
              💳 ${p.medio_pago || '—'}
            </span>
          </div>
          <div style="text-align:right;font-family:'Courier New',monospace;font-weight:700;"
               class="${tc}">
            ${sym}${fmt(p.monto || 0)}
          </div>
          ${p.observacion
            ? `<div style="grid-column:1/-1;font-size:10px;color:var(--muted);">↳ ${p.observacion}</div>`
            : ''}
        </div>`).join('')}`;

  } catch (e) {
    document.getElementById('historial-inline-content').innerHTML =
      `<div style="color:var(--red);font-size:12px;padding:12px">Error: ${e.message}</div>`;
  }
}
