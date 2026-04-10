// ============================================================
// plantillas.js
// Textos por defecto para correos y WhatsApp.
// Se usan si el agente no ha guardado una plantilla personalizada
// en Firebase. Las variables entre llaves {así} se reemplazan
// automáticamente con los datos de cada póliza al enviar.
// ============================================================

// ── Variables disponibles en ambas plantillas ────────────────
// {nombre}     → Nombre completo del asegurado
// {poliza}     → Número de póliza
// {producto}   → Nombre del producto (ej: AUTOMOVILES VOLUNTARIO)
// {vence}      → Fecha de vencimiento formateada (ej: 01 may. 26)
// {frecuencia} → Frecuencia de pago (Mensual, Trimestral, etc.)
// {total}      → Monto a pagar formateado
// {moneda}     → CRC ₡ o USD $

// ── Asunto por defecto del correo ────────────────────────────
export const PLT_SUBJECT_DEF =
  'Aviso de Vencimiento — Póliza {poliza}';

// ── Cuerpo HTML por defecto del correo ───────────────────────
// Incluye tabla de opciones de pago con cuentas bancarias,
// SINPE Móvil e INS en Línea
export const PLT_BODY_DEF = `Estimado/a <b>{nombre}</b>,

Le informamos que su póliza <b>N° {poliza}</b> — <b>{producto}</b> vence el <b>{vence}</b>.

<b>Frecuencia de pago:</b> {frecuencia}<br>
<b>Monto a cancelar:</b> {moneda} <b>{total}</b>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 6px;border-top:2px solid #1a3a5c">
<tr><td style="padding:8px 0 2px;font-size:15px;font-weight:700;color:#1a3a5c">🏦 OPCIONES DE PAGO</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="8" style="margin-bottom:10px">
<tr valign="top">
<td width="48%" style="background:#f0f4f8;border-radius:8px;padding:14px;border-left:4px solid #1a3a5c">
<div style="font-weight:700;color:#1a3a5c;margin-bottom:8px">🇨🇷 COLONES (CRC)</div>
<div style="font-size:13px;line-height:1.8">
🏛 <b>BCR</b><br>Cta: 001-0000296-8<br>IBAN: CR55015201001000029681<br><br>
🏛 <b>Banco Nacional</b><br>Cta: 100-01-000-007722-2<br>IBAN: CR12015100010010077221
</div>
</td>
<td width="4%"></td>
<td width="48%" style="background:#f0f4f8;border-radius:8px;padding:14px;border-left:4px solid #2d6a2d">
<div style="font-weight:700;color:#2d6a2d;margin-bottom:8px">🇺🇸 DÓLARES (USD)</div>
<div style="font-size:13px;line-height:1.8">
🏛 <b>BCR</b><br>Cta: 001-0202691-0<br>IBAN: CR02015201001020269103<br><br>
🏛 <b>Banco Nacional</b><br>Cta: 100-02-000-060455-3<br>IBAN: CR27015100010020604555
</div>
</td>
</tr>
</table>
<div style="background:#e8f0fe;border-radius:8px;padding:12px 16px;margin:8px 0;border-left:4px solid #4285f4">
📱 <b>SINPE Móvil:</b> 8992-8228<br>
🌐 <a href="https://insenlinea.grupoins.com/" style="color:#1a3a5c;font-weight:600">https://insenlinea.grupoins.com/</a>
</div>
📌 Si paga con depósito o SINPE, envíenos el comprobante de pago.<br><br>
Atentamente,<br>
<b>Juan Carlos Hernández Vargas</b><br>
Agente de Seguros — Licencia 08-1318 · INS`;

// ── Mensaje por defecto de WhatsApp ──────────────────────────
// Solo texto plano — WhatsApp no soporta HTML
// Los saltos de línea sí funcionan
export const WA_DEF =
`Estimado/a {nombre}, le informamos que su póliza N° {poliza} — {producto} vence el {vence}.

Frecuencia: {frecuencia}
Monto: {moneda} {total}

📱 SINPE Móvil: 8992-8228
🌐 https://insenlinea.grupoins.com/

Envíe comprobante de pago al cancelar.
Juan Carlos Hernández Vargas · Lic. 08-1318`;

// ── Función que reemplaza las variables en cualquier plantilla ─
// Recibe el texto de la plantilla y los datos de una póliza
// Devuelve el texto con los datos reales del asegurado
export const interpol = (tpl, r) => {
  const n = parseFloat(String(r.total || '0').replace(/,/g, '.'));
  const total = isNaN(n)
    ? String(r.total || '')
    : n.toLocaleString('es-CR');
  const sym = r.moneda === 'USD' ? 'USD $' : 'CRC ₡';
  return (tpl || '')
    .replace(/{nombre}/g,     r.asegurado  || '')
    .replace(/{poliza}/g,     r.poliza     || '')
    .replace(/{producto}/g,   r.prod       || '')
    .replace(/{vence}/g,      fmtDate(r.hasta))
    .replace(/{frecuencia}/g, r.fr         || '')
    .replace(/{total}/g,      total)
    .replace(/{moneda}/g,     sym);
};

// Importar fmtDate desde utils para usarla en interpol
import { fmtDate } from './utils.js';
