// ============================================================
// importar.js
// Módulo de Importación: lectura de archivos XLS/XLSX del INS,
// previsualización, deduplicación y carga a Firebase.
// También genera automáticamente los períodos futuros de cada
// contrato no-anual al importar.
// ============================================================

import { db, collection, addDoc, getDocs, query,
         where, writeBatch, serverTimestamp } from './firebase.js';
import { fmt, trunc, fmtDate, calcDias, calcProx,
         calcMesOrigen, FR_MESES, showToast } from './utils.js';
import { state } from './state.js';

// ── Leer y previsualizar archivo XLS ─────────────────────────
// Se dispara cuando el agente arrastra o selecciona un archivo.
// Usa la librería XLSX para leer el archivo y muestra un preview
// con las primeras 20 filas antes de importar.
export function handleXLS(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'binary' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        showToast('Archivo vacío o formato incorrecto', 'e');
        return;
      }

      // Mapa de nombres de mes en 3 letras → número de mes (0-11)
      const MM = {
        jan:0, ene:0, feb:1, mar:2, apr:3, abr:3, may:4,
        jun:5, jul:6, aug:7, ago:7, sep:8, set:8,
        oct:9, nov:10, dec:11, dic:11
      };

      // Convertir fecha del formato INS "01-May-26" → "2026-05-01"
      const parseD = v => {
        if (!v) return '';
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[\-\/]([a-zA-Z]{3})[\-\/](\d{2,4})$/);
        if (m) {
          const mo = MM[m[2].toLowerCase()];
          if (mo !== undefined) {
            const yr = parseInt(m[3]) + (m[3].length === 2 ? 2000 : 0);
            return new Date(yr, mo, parseInt(m[1])).toISOString().split('T')[0];
          }
        }
        return s;
      };

      // Helper para buscar un valor en múltiples nombres de columna posibles
      // El INS a veces cambia los nombres de columnas entre versiones del XLS
      const gv = (row, ...ks) => {
        for (const k of ks) {
          const v = row[k];
          if (v !== undefined && v !== '' && v !== null) return v;
        }
        return '';
      };

      // Detectar el nombre del mes desde el nombre del archivo
      // Ejemplo: "MAYO26.xls" → "MAYO2026"
      const mesNom = file.name
        .replace(/\.[^.]+$/, '')
        .toUpperCase()
        .replace(/\s/g, '');

      // Parsear cada fila del XLS al formato interno del sistema
      const records = rows.map(row => {
        const monRaw = String(gv(row, 'moneda', 'Moneda', '')).toUpperCase();
        const moneda = monRaw.includes('COLONES') || monRaw === 'CRC' ? 'CRC' : 'USD';
        const fr     = String(gv(row, 'fr', 'Fr', '')).trim();
        const hasta  = parseD(gv(row, 'hasta',  'Hasta',  ''));
        const desde  = parseD(gv(row, 'desde',  'Desde',  ''));

        // Extraer placa del XLS — el INS puede usar varios nombres de columna
        // Si no viene en el XLS queda vacío y se puede completar manualmente
        const placaRaw = String(gv(row,
          'placa', 'Placa', 'PLACA',
          'número_placa', 'numero_placa',
          'placa_vehículo', 'placa_vehiculo',
          'matrícula', 'matricula', ''
        )).trim().toUpperCase();

        return {
          poliza:         String(gv(row, 'número_póliza', 'poliza', '')),
          asegurado:      String(gv(row, 'asegurado', '')),
          prod:           String(gv(row, 'prod', 'producto', '')),
          desde,
          hasta,
          fr,
          prima:          parseFloat(gv(row, 'prima', 0))  || 0,
          total:          parseFloat(gv(row, 'total', 0))  || 0,
          moneda,
          estado_poliza:  String(gv(row, 'estado_póliza', 'estado_poliza', 'Vigente')) || 'Vigente',
          estado_recibo:  'Pendiente',
          dias_venc:      parseInt(gv(row, 'días_venc', 'dias_venc', calcDias(hasta))) || calcDias(hasta),
          verif:          !!gv(row, 'verif', ''),
          confirmar:      parseD(gv(row, 'confirmar', '')),
          telefonos:      String(gv(row, 'teléfonos_asegurado', 'telefonos', '')),
          correos:        String(gv(row, 'correos_asegurado',   'correos',   '')).trim(),
          ultima_gestion: String(gv(row, 'ultima_gestión',  'ultima_gestion',  '')),
          resultado:      String(gv(row, 'resultado_última_gestión', 'resultado', '')),
          proxima_renovacion: calcProx(hasta, fr),
          tipo:           String(gv(row, 'tipo', '')),
          mes_origen:     mesNom,
          // Placa del vehículo — se extrae si el XLS la incluye
          placa:          placaRaw
        };
      }).filter(r => r.poliza && r.asegurado); // Descartar filas sin datos

      // Guardar en estado para confirmar después
      state.xlsPending = records;

      // Calcular totales para el preview
      const crc = records.filter(r => r.moneda === 'CRC').reduce((s, r) => s + r.total, 0);
      const usd = records.filter(r => r.moneda === 'USD').reduce((s, r) => s + r.total, 0);

      // Actualizar UI del preview en ambas vistas (Import y sidebar Cobros)
      const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setEl('xls-prev-title',  mesNom + ' — ' + records.length + ' pólizas');
      setEl('xls-prev-stats',  '₡' + fmt(crc) + ' · $' + fmt(usd));
      setEl('prev-count', records.length);
      setEl('prev-crc',   '₡' + fmt(crc));
      setEl('prev-usd',   '$' + fmt(usd));
      setEl('prev-mes',   mesNom);

      // Mostrar tabla preview con las primeras 20 filas
      // Incluye columna de placa si al menos un registro la tiene
      const hayPlacas = records.some(r => r.placa);
      const pb = document.getElementById('prev-tbody');
      if (pb) pb.innerHTML = records.slice(0, 20).map(r => `
        <tr>
          <td class="mn">${trunc(r.poliza,    18)}</td>
          <td style="font-weight:600">${trunc(r.asegurado, 24)}</td>
          <td>${trunc(r.prod, 22)}</td>
          <td class="mn">${fmtDate(r.hasta)}</td>
          <td><span class="pill pgr">${r.fr || '—'}</span></td>
          <td class="am ${r.moneda === 'CRC' ? 'crc-t' : 'usd-t'}">
            ${r.moneda === 'CRC' ? '₡' : '$'}${fmt(r.total)}
          </td>
          <td><span style="font-size:10px;font-weight:700"
               class="${r.moneda === 'CRC' ? 'crc-t' : 'usd-t'}">${r.moneda}</span></td>
          ${hayPlacas ? `<td class="mn">${r.placa || '—'}</td>` : ''}
        </tr>`).join('');

      // Agregar encabezado de placa si hay datos
      const thead = document.querySelector('#xls-preview table thead tr');
      if (thead && hayPlacas && !thead.querySelector('.placa-th')) {
        const th = document.createElement('th');
        th.className = 'placa-th';
        th.textContent = 'Placa';
        thead.appendChild(th);
      }

      // Mostrar secciones de preview
      ['xls-preview', 'xls-prev'].forEach(id => {
        const e = document.getElementById(id);
        if (e) e.style.display = 'block';
      });
      const dz = document.getElementById('drop-xls');
      if (dz) dz.classList.add('loaded');

    } catch (err) {
      showToast('Error leyendo archivo: ' + err.message, 'e');
    }
  };
  reader.readAsBinaryString(file);
}

// ── Confirmar e importar el XLS a Firebase ───────────────────
// Deduplica por poliza+desde para no crear recibos repetidos.
// Genera períodos futuros para contratos no-anuales.
export async function confirmXLS() {
  const records = state.xlsPending;
  if (!records || !records.length) {
    showToast('No hay datos para importar', 'e');
    return;
  }

  const mes = records[0].mes_origen;

  // Construir mapa de recibos existentes para deduplicar
  const existingKeys = new Map(
    state.polizas
      .filter(r => r.poliza && r.desde)
      .map(r => [(r.poliza + '__' + r.desde), r._id])
  );

  const nuevas = records.filter(r =>
    !existingKeys.has((r.poliza || '') + '__' + (r.desde || ''))
  );
  const dup = records.length - nuevas.length;

  if (!nuevas.length) {
    showToast(`Todos los recibos de "${mes}" ya existen (${dup} omitidos).`, 'w');
    return;
  }

  // Mostrar barra de progreso
  const showFill = (id, show) => { const e = document.getElementById(id); if (e) e.style.display = show ? 'block' : 'none'; };
  const setFill  = (id, w)    => { const e = document.getElementById(id); if (e) e.style.width = w; };
  const setTxt   = (id, t)    => { const e = document.getElementById(id); if (e) e.textContent = t; };
  showFill('xls-pg-wrap',  true);
  showFill('progress-xls', true);

  let n = 0, nPer = 0;

  for (const r of nuevas) {
    // Guardar el recibo en Firebase incluyendo la placa si existe
    await addDoc(collection(db, 'polizas'), {
      ...r,
      creado:      serverTimestamp(),
      actualizado: serverTimestamp()
    });

    existingKeys.set((r.poliza + '__' + r.desde), 'new');

    // Generar períodos futuros para frecuencias no-anuales
    const periodos = generarPeriodos(r, existingKeys);
    for (const p of periodos) {
      await addDoc(collection(db, 'polizas'), {
        ...p,
        creado:      serverTimestamp(),
        actualizado: serverTimestamp()
      });
      existingKeys.set((p.poliza + '__' + p.desde), 'new');
      nPer++;
    }

    n++;
    setFill('xls-fill',  Math.round(n / nuevas.length * 100) + '%');
    setFill('mayo-fill', Math.round(n / nuevas.length * 100) + '%');
    setTxt('xls-ptxt',         `${n}/${nuevas.length} recibos · ${nPer} períodos…`);
    setTxt('xls-progress-txt', `Importando ${n} de ${nuevas.length}…`);
  }

  showToast(
    `✅ ${n} recibos importados` +
    (nPer ? ` · ${nPer} períodos generados` : '') +
    (dup  ? ` · ${dup} ya existían` : '')
  );

  cancelXLS();
  window.loadAll();
}

// ── Cancelar importación ─────────────────────────────────────
export function cancelXLS() {
  state.xlsPending = null;
  ['xls-preview', 'xls-prev', 'xls-pg-wrap', 'progress-xls'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });
  const dz  = document.getElementById('drop-xls');   if (dz)  dz.classList.remove('loaded');
  const xi  = document.getElementById('xls-file');   if (xi)  xi.value = '';
  const xi2 = document.getElementById('xls-input');  if (xi2) xi2.value = '';
}

// ── Limpiar toda la colección de pólizas ─────────────────────
export async function confirmLimpiar() {
  const snap = await getDocs(collection(db, 'polizas'));
  document.getElementById('limpiar-count').textContent = snap.size;
  document.getElementById('confirm-input').value = '';
  document.getElementById('btn-limpiar-ok').disabled = true;
  document.getElementById('modal-limpiar').classList.add('open');
}

export async function ejecutarLimpiar() {
  window._closeModal('modal-limpiar');
  showToast('Eliminando registros…', 'w');

  const snap = await getDocs(collection(db, 'polizas'));
  const docs = snap.docs;
  let deleted = 0;

  // Firebase permite máximo 499 operaciones por batch
  for (let i = 0; i < docs.length; i += 499) {
    const batch = writeBatch(db);
    docs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(499, docs.length - i);
  }

  state.polizas = [];
  showToast(`🗑 ${deleted} pólizas eliminadas`, 's');
  window.loadAll();
}

// ── Generador de períodos futuros al importar XLS ────────────
// Dado el primer recibo de un contrato no-anual, genera todos
// los recibos restantes del año. La placa se propaga a todos
// los períodos futuros automáticamente.
export function generarPeriodos(base, existingKeys) {
  const incremento = FR_MESES[base.fr] || 12;
  if (incremento >= 12) return [];

  const periodos = [];
  const hoy      = new Date();

  const inicioContrato = new Date(base.desde + 'T12:00:00');
  const finContrato    = new Date(inicioContrato);
  finContrato.setFullYear(finContrato.getFullYear() + 1);

  let desdeActual = new Date(base.hasta + 'T12:00:00');

  while (desdeActual < finContrato) {
    const hastaActual = new Date(desdeActual);
    hastaActual.setMonth(hastaActual.getMonth() + incremento);

    const hastaFinal = hastaActual > finContrato ? finContrato : hastaActual;
    const desdeStr   = desdeActual.toISOString().split('T')[0];
    const hastaStr   = hastaFinal.toISOString().split('T')[0];
    const pKey       = (base.poliza || '') + '__' + desdeStr;

    if (!existingKeys.has(pKey)) {
      const diasVenc = Math.round((hastaFinal - hoy) / 86400000);
      periodos.push({
        poliza:             base.poliza    || '',
        asegurado:          base.asegurado || '',
        prod:               base.prod      || '',
        desde:              desdeStr,
        hasta:              hastaStr,
        prima:              base.prima     || 0,
        total:              base.total     || 0,
        moneda:             base.moneda    || 'CRC',
        fr:                 base.fr        || '',
        dias_venc:          diasVenc,
        estado_poliza:      'Vigente',
        estado_recibo:      'Pendiente',
        verif:              false,
        confirmar:          '',
        telefonos:          base.telefonos || '',
        correos:            base.correos   || '',
        ultima_gestion:     '',
        resultado:          '',
        proxima_renovacion: base.proxima_renovacion || '',
        mes_origen:         calcMesOrigen(desdeStr),
        tipo:               'RENOVACION',
        es_proyeccion:      true,
        // La placa se propaga a todos los períodos futuros del contrato
        placa:              base.placa     || ''
      });
    }

    desdeActual = hastaFinal;
    if (hastaFinal >= finContrato) break;
  }

  return periodos;
}
