// ============================================================
// productos.js
// Módulo de Productos y Administrativo: CRUD de productos INS,
// renderizado de la tabla de productos y gestión de tabs
// del módulo Administrativo.
// ============================================================

import { db, collection, doc, addDoc, updateDoc,
         serverTimestamp } from './firebase.js';
import { showToast } from './utils.js';
import { state } from './state.js';
import { loadAdmEmail, saveAdmEmail,
         resetAdmEmail } from './gmail.js';
import { loadAdmWa, saveAdmWa,
         resetAdmWa } from './whatsapp.js';

// ── Renderizar tabla de productos ────────────────────────────
// Muestra todos los productos INS con sus comisiones
// y un botón de editar en cada fila
export function renderProductos() {
  const P = state.prods;

  document.getElementById('prod-count').textContent =
    `${P.length} producto${P.length !== 1 ? 's' : ''}`;

  document.getElementById('prod-tbody').innerHTML = P.map(p => `
    <tr>
      <td class="mn">${p.codigo || '—'}</td>
      <td style="font-weight:600">${p.nombre || ''}</td>
      <td style="color:var(--muted);font-size:11px">${p.ramo || ''}</td>
      <td>
        <span class="${(p.moneda || '') !== 'USD' ? 'crc-t' : 'usd-t'}"
              style="font-size:11px;font-weight:700">
          ${p.moneda || ''}
        </span>
      </td>
      <td class="pcom">${(p.comision || 0).toFixed(1)}%</td>
      <td style="color:var(--muted);font-size:11px">${(p.comision_ins || 0).toFixed(1)}%</td>
      <td>${p.activo
        ? '<span class="pill pg">Activo</span>'
        : '<span class="pill pr">Inactivo</span>'}
      </td>
      <td>
        <button class="btn-ghost" style="font-size:10px;padding:3px 8px"
                onclick="window._openProdModal('${p._id}')">
          Editar
        </button>
      </td>
    </tr>`).join('');
}

// ── Abrir modal de producto ──────────────────────────────────
// Si se pasa un id abre en modo edición con los datos precargados.
// Si id es null abre en modo creación con campos vacíos.
export function openProdModal(id) {
  state.currentProdId = id;
  document.getElementById('prod-modal-title').textContent =
    id ? 'Editar Producto' : 'Nuevo Producto';

  if (id) {
    // Modo edición: precargar datos del producto seleccionado
    const p = state.prods.find(x => x._id === id);
    if (!p) return;
    document.getElementById('p-cod').value   = p.codigo      || '';
    document.getElementById('p-nom').value   = p.nombre      || '';
    document.getElementById('p-ramo').value  = p.ramo        || '';
    document.getElementById('p-mon').value   = p.moneda      || 'CRC';
    document.getElementById('p-com').value   = p.comision    || 0;
    document.getElementById('p-cins').value  = p.comision_ins || 0;
    document.getElementById('p-desc').value  = p.descripcion || '';
    document.getElementById('p-activo').value = p.activo ? '1' : '0';
  } else {
    // Modo creación: limpiar todos los campos
    ['p-cod','p-nom','p-com','p-cins','p-desc'].forEach(i => {
      document.getElementById(i).value = '';
    });
  }

  document.getElementById('modal-prod').classList.add('open');
}

// ── Guardar producto en Firebase ─────────────────────────────
// Crea un producto nuevo o actualiza uno existente según
// si state.currentProdId tiene valor o no
export async function saveProducto() {
  const nom = document.getElementById('p-nom').value.trim().toUpperCase();
  if (!nom) { showToast('Ingrese el nombre', 'e'); return; }

  const data = {
    codigo:       document.getElementById('p-cod').value.trim().toUpperCase(),
    nombre:       nom,
    ramo:         document.getElementById('p-ramo').value,
    moneda:       document.getElementById('p-mon').value,
    comision:     parseFloat(document.getElementById('p-com').value)  || 0,
    comision_ins: parseFloat(document.getElementById('p-cins').value) || 0,
    descripcion:  document.getElementById('p-desc').value,
    activo:       document.getElementById('p-activo').value === '1',
    actualizado:  serverTimestamp()
  };

  try {
    if (state.currentProdId) {
      // Actualizar producto existente
      await updateDoc(doc(db, 'productos', state.currentProdId), data);
      showToast('Producto actualizado ✓', 's');
    } else {
      // Crear producto nuevo
      await addDoc(collection(db, 'productos'), {
        ...data,
        creado: serverTimestamp()
      });
      showToast('Producto creado ✓', 's');
    }

    window._closeModal('modal-prod');
    state.currentProdId = null;
    document.getElementById('prod-modal-title').textContent = 'Nuevo Producto';
    window.loadAll(); // Recargar para reflejar cambios

  } catch (e) {
    showToast('Error: ' + e.message, 'e');
  }
}

// ── Seed inicial de productos ────────────────────────────────
// Se ejecuta solo la primera vez que se carga el sistema,
// cuando Firebase no tiene ningún producto todavía.
// Carga los 16 productos estándar del INS con sus comisiones base.
export async function seedProductos() {
  const prods = [
    { codigo:'AUT-VOL',   nombre:'AUTOMOVILES VOLUNTARIO',          ramo:'Automóviles',        moneda:'CRC',   comision:15, comision_ins:0, activo:true },
    { codigo:'AUT-VOL-A', nombre:'AUTOMOVILES VOLUNTARIO - ANUAL',  ramo:'Automóviles',        moneda:'CRC',   comision:15, comision_ins:0, activo:true },
    { codigo:'RT',        nombre:'RIESGOS DEL TRABAJO',             ramo:'Trabajo',            moneda:'CRC',   comision:10, comision_ins:0, activo:true },
    { codigo:'HOGAR',     nombre:'HOGAR COMPRENSIVO',               ramo:'Hogar',              moneda:'AMBAS', comision:20, comision_ins:0, activo:true },
    { codigo:'RC',        nombre:'RESPONSABILIDAD CIVIL',           ramo:'Responsabilidad Civil', moneda:'USD', comision:20, comision_ins:0, activo:true },
    { codigo:'RCU',       nombre:'RESP. CIVIL UMBRELLA',            ramo:'Responsabilidad Civil', moneda:'USD', comision:20, comision_ins:0, activo:true },
    { codigo:'INCOM',     nombre:'INCENDIO COMERCIAL',              ramo:'Incendio',           moneda:'AMBAS', comision:18, comision_ins:0, activo:true },
    { codigo:'ROBO',      nombre:'ROBO COMERCIAL',                  ramo:'Robo',               moneda:'CRC',   comision:18, comision_ins:0, activo:true },
    { codigo:'MED',       nombre:'INS MEDICAL SIAS',                ramo:'Salud',              moneda:'USD',   comision:12, comision_ins:0, activo:true },
    { codigo:'PFC',       nombre:'PLAN FAMILIAR (COL)',             ramo:'Salud',              moneda:'CRC',   comision:12, comision_ins:0, activo:true },
    { codigo:'PFAU',      nombre:'PLAN FAMILIAR AUCOL',             ramo:'Salud',              moneda:'CRC',   comision:12, comision_ins:0, activo:true },
    { codigo:'VUP',       nombre:'VIDA UNIVERSAL PLUS',             ramo:'Vida',               moneda:'CRC',   comision:8,  comision_ins:0, activo:true },
    { codigo:'EEL',       nombre:'EQUIPO ELECTRONICO',              ramo:'Incendio',           moneda:'CRC',   comision:20, comision_ins:0, activo:true },
    { codigo:'FID',       nombre:'FIDELIDAD',                       ramo:'Caución',            moneda:'CRC',   comision:15, comision_ins:0, activo:true },
    { codigo:'CAU',       nombre:'CAUCION',                         ramo:'Caución',            moneda:'CRC',   comision:15, comision_ins:0, activo:true },
    { codigo:'VTR',       nombre:'VALORES EN TRANSITO',             ramo:'Robo',               moneda:'CRC',   comision:18, comision_ins:0, activo:true }
  ];

  for (const p of prods) {
    await addDoc(collection(db, 'productos'), {
      ...p,
      descripcion: '',
      creado:      serverTimestamp()
    });
  }
}

// ── Gestión de tabs del módulo Administrativo ────────────────
// Muestra el panel correcto según el tab seleccionado:
// 'prod' → tabla de productos
// 'email' → editor de plantilla de correo
// 'wa'    → editor de plantilla de WhatsApp
export function setAdmTab(tab, el) {
  // Ocultar todos los paneles y desactivar todos los tabs
  document.querySelectorAll('.adm-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tab2').forEach(t => t.classList.remove('active'));

  // Mostrar el panel seleccionado y activar su tab
  document.getElementById('adm-' + tab).style.display = 'block';
  el.classList.add('active');

  // Cargar contenido del tab seleccionado
  if (tab === 'email') loadAdmEmail();
  if (tab === 'wa')    loadAdmWa();
}
