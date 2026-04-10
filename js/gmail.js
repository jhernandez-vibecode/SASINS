// ============================================================
// gmail.js
// Módulo de Gmail: autenticación OAuth, envío masivo de
// correos y gestión de la plantilla de email.
// Usa la API de Gmail directamente desde el navegador,
// sin servidor intermedio.
// ============================================================

import { db, doc, setDoc, getDoc, deleteDoc,
         serverTimestamp } from './firebase.js';
import { interpol, PLT_SUBJECT_DEF, PLT_BODY_DEF } from './plantillas.js';
import { trunc, showToast } from './utils.js';
import { state } from './state.js';
import { parseEmails } from './cobros.js';

// ID de cliente OAuth de Google Cloud para este proyecto
const GMAIL_CID = '446215450096-i2s3glor63qodpf3t12ogdgunedqgp27.apps.googleusercontent.com';

// ── Conectar Gmail con OAuth ─────────────────────────────────
// Abre el popup de Google para que el agente autorice el envío
// de correos desde su cuenta. Guarda el token en state.
export function gmailLogin() {
  if (typeof google === 'undefined' || !google.accounts) {
    showToast('Cargando Google…', 'i');
    return;
  }

  const client = google.accounts.oauth2.initTokenClient({
    client_id: GMAIL_CID,
    scope:     'https://www.googleapis.com/auth/gmail.send',
    callback:  async resp => {
      if (resp.error) {
        showToast('Error Gmail: ' + resp.error, 'e');
        return;
      }

      // Guardar token de acceso en el estado global
      state.gmailToken = resp.access_token;

      // Obtener el email del usuario conectado
      try {
        const info = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: 'Bearer ' + state.gmailToken } }
        ).then(r => r.json());
        state.gmailUser = info.email;
      } catch (e) {}

      updateGmailUI(true);
      showToast('Gmail conectado: ' + (state.gmailUser || '✓'));
    }
  });

  client.requestAccessToken();
}

// ── Desconectar Gmail ────────────────────────────────────────
// Limpia el token y actualiza la UI
export function gmailLogout() {
  state.gmailToken = null;
  state.gmailUser  = null;
  updateGmailUI(false);
  showToast('Gmail desconectado');
}

// ── Actualizar indicador de conexión Gmail en pantalla ───────
// ok=true → punto verde y botón desconectar
// ok=false → punto rojo y botón conectar
export function updateGmailUI(ok) {
  const dot = document.getElementById('gmail-dot');
  const st  = document.getElementById('gmail-status');
  const gu  = document.getElementById('gmail-user-lbl');
  const bl  = document.getElementById('btn-gm-login');
  const bol = document.getElementById('btn-gm-logout');

  if (dot) dot.style.background = ok ? 'var(--green)' : 'var(--red)';
  if (st)  { st.textContent = ok ? 'Gmail conectado' : 'Gmail no conectado'; st.style.color = ok ? 'var(--green)' : ''; }
  if (gu)  gu.textContent = ok && state.gmailUser ? 'Enviando desde: ' + state.gmailUser : '';
  if (bl)  bl.style.display = ok ? 'none'         : 'inline-block';
  if (bol) bol.style.display = ok ? 'inline-block' : 'none';
}

// ── Enviar correos masivos ───────────────────────────────────
// Envía un correo a cada póliza seleccionada que tenga email.
// Usa la plantilla guardada en Firebase o la plantilla por defecto.
// Espera 650ms entre correo y correo para no exceder límites de Gmail.
export function enviarCorreos() {
  if (!state.gmailToken) {
    showToast('Primero conecta tu Gmail', 'e');
    return;
  }

  // Si hay checkboxes seleccionados usar solo esos,
  // si no hay ninguno seleccionado usar todos los filtrados
  const base = state.selectedCob.size > 0
    ? state.cobFiltered.filter(r => state.selectedCob.has(r._id))
    : state.cobFiltered;

  // De ese grupo, solo los que tienen correo registrado
  const conEmail = base.filter(r => parseEmails(r.correos).length > 0);

  if (!conEmail.length) {
    showToast('No hay pólizas con correo en la vista actual', 'e');
    return;
  }

  const detalle = state.selectedCob.size > 0
    ? `${conEmail.length} seleccionados con correo`
    : `${conEmail.length} pólizas del mes con correo`;

  if (!confirm(`Enviar correos a ${detalle}\nDesde: ${state.gmailUser}`)) return;

  state.sendingActive = true;
  document.getElementById('send-prog-box').style.display = 'block';
  document.getElementById('send-log').innerHTML = '';
  document.getElementById('send-fill').style.width = '0%';

  const subj = document.getElementById('plt-subject').value    || PLT_SUBJECT_DEF;
  const body = document.getElementById('plt-body-text').value  || PLT_BODY_DEF;

  procesarEnvio(conEmail, subj, body, 0);
}

// ── Procesamiento secuencial de envíos ───────────────────────
// Procesa un correo a la vez con pausa de 650ms entre cada uno
// para respetar los límites de envío de Gmail
async function procesarEnvio(queue, subj, body, idx) {
  if (!state.sendingActive || idx >= queue.length) {
    if (state.sendingActive) {
      document.getElementById('send-lbl').textContent =
        `✓ ${queue.length} correos enviados`;
      showToast(`✓ ${queue.length} correos enviados`);
    }
    document.getElementById('send-prog-box').style.display = 'none';
    state.sendingActive = false;
    return;
  }

  const r      = queue[idx];
  const emails = parseEmails(r.correos);
  const to     = emails.join(', ');
  const pct    = Math.round(idx / queue.length * 100);

  // Actualizar progreso en pantalla
  document.getElementById('send-fill').style.width  = pct + '%';
  document.getElementById('send-lbl').textContent   = `Enviando ${idx + 1}/${queue.length}: ${trunc(r.asegurado || '', 25)}`;
  document.getElementById('send-cnt').textContent   = `${idx + 1}/${queue.length}`;

  try {
    await sendGmailRaw(to, subj, body, r);
    logSendLine(idx, r.asegurado, to, true, '');
  } catch (e) {
    logSendLine(idx, r.asegurado, to, false, e.message.slice(0, 60));
  }

  // Pausa 650ms antes del siguiente correo
  setTimeout(() => procesarEnvio(queue, subj, body, idx + 1), 650);
}

// ── Construir y enviar correo via Gmail API ──────────────────
// Construye el correo en formato MIME multipart (texto plano + HTML)
// y lo envía usando el endpoint de Gmail API con el token OAuth
async function sendGmailRaw(to, subj, body, r) {
  // Reemplazar variables de la plantilla con datos reales
  const htmlBody  = interpol(body, r);
  const subjFmt   = interpol(subj, r);
  const plain     = htmlBody.replace(/<[^>]+>/g, ''); // Versión texto plano

  // Envolver el contenido HTML en una plantilla de email profesional
  const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<tr><td style="background:#1a3a5c;padding:24px 32px 20px;text-align:center">
  <div style="font-size:18px;font-weight:700;color:#fff">Juan Carlos Hernández Vargas</div>
  <div style="font-size:12px;color:#a0c4e8;margin-top:2px">Agente de Seguros | Licencia 08-1318 | INS</div>
</td></tr>
<tr><td style="padding:30px 32px">
  <div style="font-size:14px;color:#1a1a1a;line-height:1.8">${htmlBody}</div>
</td></tr>
<tr><td style="background:#f8f9fa;padding:14px 32px;border-top:1px solid #e9ecef;text-align:center">
  <div style="font-size:11px;color:#6c757d">SASINS · Sistema de Administración de Seguros</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  // Construir mensaje MIME multipart (texto plano + HTML)
  const bnd = 'b' + Date.now();
  const raw = [
    `From: ${state.gmailUser}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subjFmt)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${bnd}"`,
    '',
    `--${bnd}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(plain))),
    '',
    `--${bnd}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(full))),
    '',
    `--${bnd}--`
  ].join('\r\n');

  // Codificar en base64url (requerido por la API de Gmail)
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // Enviar a la API de Gmail
  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method:  'POST',
      headers: {
        Authorization:  'Bearer ' + state.gmailToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encoded })
    }
  );

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error?.message || resp.statusText);
  }
}

// ── Registrar línea en el log de envío ───────────────────────
// Muestra cada resultado (éxito o error) en el panel de progreso
function logSendLine(idx, nom, to, ok, err) {
  const log = document.getElementById('send-log');
  if (!log) return;
  log.innerHTML += `<div style="color:${ok ? 'var(--green)' : 'var(--red)'}">
    ${ok ? '✓' : '✗'} [${idx + 1}] ${trunc(nom || '', 25)} → ${trunc(to, 30)}${err ? ' — ' + err : ''}
  </div>`;
  log.scrollTop = log.scrollHeight; // Auto-scroll al último registro
}

// ── Gestión de plantilla de correo (colapsable en Cobros) ────
// Muestra/oculta el editor de plantilla en el módulo Cobros
export function togglePlt() {
  const b = document.getElementById('plt-body');
  const a = document.getElementById('plt-arrow');
  const t = document.getElementById('plt-toggle');
  const open = !b.classList.contains('open');
  b.classList.toggle('open', open);
  t.classList.toggle('open', open);
  a.textContent = open ? '▲ Cerrar' : '▼ Editar';
}

// Cargar plantilla guardada en Firebase o usar la por defecto
export async function loadPlt() {
  try {
    const snap = await getDoc(doc(db, 'config', 'plantilla'));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById('plt-subject').value   = d.subject || PLT_SUBJECT_DEF;
      document.getElementById('plt-body-text').value = d.body    || PLT_BODY_DEF;
      document.getElementById('plt-saved').style.display = 'inline';
      return;
    }
  } catch (e) {}
  // Si no hay plantilla guardada, usar la por defecto
  document.getElementById('plt-subject').value   = PLT_SUBJECT_DEF;
  document.getElementById('plt-body-text').value = PLT_BODY_DEF;
}

// Guardar plantilla en Firebase
export async function savePlt() {
  try {
    await setDoc(doc(db, 'config', 'plantilla'), {
      subject: document.getElementById('plt-subject').value,
      body:    document.getElementById('plt-body-text').value,
      ts:      new Date().toISOString()
    });
    document.getElementById('plt-saved').style.display = 'inline';
  } catch (e) {}
  togglePlt();
  showToast('Plantilla guardada ✓');
}

// Restaurar plantilla por defecto
export function resetPlt() {
  document.getElementById('plt-subject').value   = PLT_SUBJECT_DEF;
  document.getElementById('plt-body-text').value = PLT_BODY_DEF;
  showToast('Plantilla restaurada');
}

// ── Gestión de plantilla en módulo Administrativo ────────────
// Carga la plantilla en el editor del tab Administrativo
export async function loadAdmEmail() {
  try {
    const snap = await getDoc(doc(db, 'config', 'plantilla'));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById('adm-email-subject').value = d.subject || PLT_SUBJECT_DEF;
      document.getElementById('adm-email-body').value    = d.body    || PLT_BODY_DEF;
      return;
    }
  } catch (e) {}
  document.getElementById('adm-email-subject').value = PLT_SUBJECT_DEF;
  document.getElementById('adm-email-body').value    = PLT_BODY_DEF;
}

// Guardar desde el editor de Administrativo y sincronizar con Cobros
export async function saveAdmEmail() {
  const subj = document.getElementById('adm-email-subject').value.trim();
  const body = document.getElementById('adm-email-body').value.trim();
  if (!subj || !body) { showToast('Complete asunto y cuerpo', 'e'); return; }
  try {
    await setDoc(doc(db, 'config', 'plantilla'), {
      subject: subj, body, ts: new Date().toISOString()
    });
    // Sincronizar con el editor de plantilla en Cobros
    const ps = document.getElementById('plt-subject');
    const pb = document.getElementById('plt-body-text');
    if (ps) ps.value = subj;
    if (pb) pb.value = body;
    const saved = document.getElementById('adm-email-saved');
    if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 3000); }
    showToast('Plantilla de correo guardada ✓');
  } catch (e) { showToast('Error: ' + e.message, 'e'); }
}

// Restaurar plantilla original desde Administrativo
export async function resetAdmEmail() {
  if (!confirm('¿Restaurar plantilla original de correo?')) return;
  try { await deleteDoc(doc(db, 'config', 'plantilla')); } catch (e) {}
  document.getElementById('adm-email-subject').value = PLT_SUBJECT_DEF;
  document.getElementById('adm-email-body').value    = PLT_BODY_DEF;
  showToast('Plantilla restaurada');
}
