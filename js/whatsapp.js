// ============================================================
// whatsapp.js
// Módulo de WhatsApp: envío individual, masivo y gestión
// del contador de mensajes enviados por póliza.
// Abre WhatsApp Web con el mensaje pre-llenado.
// También maneja la plantilla de WA en Administrativo.
// ============================================================

import { db, doc, setDoc, deleteDoc, getDoc,
         serverTimestamp } from './firebase.js';
import { interpol, WA_DEF } from './plantillas.js';
import { rowKey, showToast } from './utils.js';
import { state } from './state.js';
import { parsePhone } from './cobros.js';
import { renderCobros, updateCobStats } from './cobros.js';

// ── Abrir modal de WhatsApp para una póliza ──────────────────
// Precarga el teléfono y el mensaje interpolado con los datos
// de la póliza para que el agente pueda editarlo antes de enviar
export function abrirWa(id) {
  const r = state.polizas.find(x => x._id === id);
  if (!r) return;

  state.currentWaIdx = id;

  // Extraer primer teléfono sin el código de país +506
  const phone = parsePhone(r.telefonos || '').replace('+506', '');

  // Usar plantilla guardada en localStorage o la por defecto
  const tpl = localStorage.getItem('sasins_wa_tpl') || WA_DEF;

  // Precargar datos en el modal
  document.getElementById('wa-modal-sub').textContent = r.asegurado || '';
  document.getElementById('wa-phone').value           = phone;
  document.getElementById('wa-msg').value             = interpol(tpl, r);

  // Abrir el modal
  document.getElementById('modal-wa').classList.add('open');
}

// ── Confirmar y abrir WhatsApp ───────────────────────────────
// Abre WhatsApp Web en una nueva pestaña con el número y mensaje
// pre-llenados, y registra el envío en Firebase
export async function confirmarWa() {
  const phone = document.getElementById('wa-phone').value
    .trim().replace(/[^0-9]/g, '');
  const msg   = document.getElementById('wa-msg').value.trim();

  if (!phone) { showToast('Ingrese un número', 'e'); return; }

  // Abrir WhatsApp Web con el mensaje codificado en la URL
  window.open(
    `https://wa.me/506${phone}?text=${encodeURIComponent(msg)}`,
    '_blank'
  );

  window._closeModal('modal-wa');

  // Registrar el envío en Firebase y actualizar el contador
  if (state.currentWaIdx) {
    const r = state.polizas.find(x => x._id === state.currentWaIdx);
    if (!r) return;

    const k    = rowKey(r);
    const next = (state.waCache[k] || 0) + 1; // Incrementar contador
    state.waCache[k] = next;

    try {
      // Guardar contador en Firebase para sincronizar entre dispositivos
      await setDoc(doc(db, 'wa_envios', k), { count: next });
    } catch (e) {}

    renderCobros();
    updateCobStats();
    showToast('WhatsApp abierto ✓');
  }
}

// ── Desmarcar WhatsApp enviado ───────────────────────────────
// Permite al agente resetear el contador de WA de una póliza
// si lo envió por error o quiere volver a marcarlo como pendiente
export async function resetWa(id) {
  const r = state.polizas.find(x => x._id === id);
  if (!r) return;
  if (!confirm('¿Desmarcar WA de esta póliza?')) return;

  const k = rowKey(r);
  delete state.waCache[k]; // Limpiar cache local

  try {
    // Eliminar registro de Firebase
    await deleteDoc(doc(db, 'wa_envios', k));
  } catch (e) {}

  renderCobros();
  updateCobStats();
  showToast('WA desmarcado');
}

// ── Envío masivo de WhatsApp ─────────────────────────────────
// Abre WhatsApp Web secuencialmente para cada póliza seleccionada
// que tenga número de teléfono registrado.
// Espera 1.5 segundos entre cada apertura para no saturar el navegador.
export function abrirWaMasivo() {
  // Filtrar seleccionados que tengan teléfono
  const sel = state.cobFiltered.filter(r =>
    state.selectedCob.has(r._id) && parsePhone(r.telefonos)
  );

  if (!sel.length) {
    showToast('Seleccione pólizas con teléfono', 'e');
    return;
  }

  const tpl = localStorage.getItem('sasins_wa_tpl') || WA_DEF;
  let i = 0;

  // Función recursiva con delay para abrir de a uno
  const next = () => {
    if (i >= sel.length) return;
    const r     = sel[i++];
    const phone = parsePhone(r.telefonos).replace('+506', '');
    window.open(
      `https://wa.me/506${phone}?text=${encodeURIComponent(interpol(tpl, r))}`,
      '_blank'
    );
    if (i < sel.length) setTimeout(next, 1500); // Esperar 1.5s antes del siguiente
  };

  next();
  showToast(`Abriendo ${sel.length} chats WhatsApp…`, 'i');
}

// ── Gestión de plantilla WhatsApp en Administrativo ──────────
// Carga la plantilla guardada en Firebase o localStorage
export async function loadAdmWa() {
  try {
    const snap = await getDoc(doc(db, 'config', 'plantilla_wa'));
    if (snap.exists()) {
      document.getElementById('adm-wa-body').value = snap.data().body || WA_DEF;
      return;
    }
  } catch (e) {}
  // Fallback a localStorage si Firebase no tiene plantilla
  document.getElementById('adm-wa-body').value =
    localStorage.getItem('sasins_wa_tpl') || WA_DEF;
}

// Guardar plantilla de WhatsApp en Firebase y localStorage
export async function saveAdmWa() {
  const body = document.getElementById('adm-wa-body').value.trim();
  if (!body) { showToast('Ingrese el mensaje WhatsApp', 'e'); return; }

  // Guardar en localStorage para acceso rápido sin consultar Firebase
  localStorage.setItem('sasins_wa_tpl', body);

  try {
    await setDoc(doc(db, 'config', 'plantilla_wa'), {
      body, ts: new Date().toISOString()
    });
  } catch (e) {}

  const saved = document.getElementById('adm-wa-saved');
  if (saved) {
    saved.style.display = 'inline';
    setTimeout(() => saved.style.display = 'none', 3000);
  }
  showToast('Plantilla WhatsApp guardada ✓');
}

// Restaurar plantilla original de WhatsApp
export function resetAdmWa() {
  if (!confirm('¿Restaurar plantilla original WhatsApp?')) return;
  document.getElementById('adm-wa-body').value = WA_DEF;
  localStorage.removeItem('sasins_wa_tpl');
  showToast('Plantilla WhatsApp restaurada');
}
