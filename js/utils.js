// ============================================================
// utils.js
// Funciones de ayuda compartidas por todos los módulos.
// Ninguna función aquí toca Firebase ni el DOM directamente.
// ============================================================

// ── Formateo de números ──────────────────────────────────────
// Convierte 46498516 → "46.498.516" (formato costarricense)
export const fmt = n => Number(n || 0).toLocaleString('es-CR');

// Corta texto largo y agrega "…" si supera n caracteres
// Ejemplo: trunc("HERNANDEZ VARGAS JUAN CARLOS", 20) → "HERNANDEZ VARGAS JUA…"
export const trunc = (s, n) =>
  (s || '').length > n ? (s || '').substring(0, n - 1) + '…' : (s || '');

// ── Fechas ───────────────────────────────────────────────────
// Calcula cuántos días faltan para que venza una póliza
// Retorna 99 si no hay fecha (para que aparezca al final al ordenar)
export const calcDias = h => {
  if (!h) return 99;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(h) - hoy) / 86400000);
};

// Nombres de meses en español para construir claves como "MAYO2026"
export const MESES_ES = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
];

// Convierte una fecha "desde" al mes de cobro
// Ejemplo: "2026-05-01" → "MAYO2026"
export const calcMesOrigen = desde => {
  if (!desde) return 'NUEVO';
  try {
    const d = new Date(desde + 'T12:00:00');
    return MESES_ES[d.getMonth()] + d.getFullYear();
  } catch (e) { return 'NUEVO'; }
};

// Mapa de frecuencia → cantidad de meses que avanza cada período
// Mensual = 1 mes, Trimestral = 3 meses, etc.
export const FR_MESES = {
  Mensual: 1,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12
};

// Calcula la fecha de la próxima renovación sumando la frecuencia
// Ejemplo: hasta="2026-08-01", fr="Trimestral" → "2026-11-01"
export const calcProx = (hasta, fr) => {
  if (!hasta) return '';
  const d = new Date(hasta + 'T12:00:00');
  d.setMonth(d.getMonth() + (FR_MESES[fr] || 12));
  return d.toISOString().split('T')[0];
};

// Formatea fecha para mostrar en pantalla
// Ejemplo: "2026-05-01" → "01 may. 26"
export const fmtDate = d => {
  if (!d) return '—';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: '2-digit'
    });
  } catch { return d; }
};

// ── Íconos por tipo de producto ──────────────────────────────
// Devuelve un emoji según el nombre del producto
export const getIcon = p => {
  if ((p || '').includes('AUTO'))    return '🚗';
  if ((p || '').includes('RIESGO'))  return '👷';
  if ((p || '').includes('HOGAR') || (p || '').includes('INCENDIO')) return '🏠';
  if ((p || '').includes('MEDICAL') || (p || '').includes('FAMILIAR') || (p || '').includes('AUCOL')) return '❤️';
  if ((p || '').includes('VIDA'))    return '🌿';
  if ((p || '').includes('CAUCION') || (p || '').includes('FIDELIDAD')) return '📋';
  if ((p || '').includes('ROBO') || (p || '').includes('VALOR')) return '🔒';
  if ((p || '').includes('CIVIL') || (p || '').includes('UMBRELLA')) return '⚖️';
  return '🛡️';
};

// ── Clave única por recibo ───────────────────────────────────
// Combina número de póliza + fecha desde para identificar cada recibo
// Ejemplo: "01-01-AUT-1991782__2026-05-02" → "01_01_AUT_1991782__2026_05_02"
export const rowKey = r =>
  ((r.poliza || '') + '__' + (r.desde || ''))
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 500);

// ── Toast (mensaje emergente en pantalla) ────────────────────
// type: 's'=verde éxito, 'e'=rojo error, 'i'=azul info, 'w'=amarillo aviso
export const toast = (msg, type = 's') => {
  const t = document.getElementById('toast');
  t.className = `toast t${type}`;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
};

// Alias de toast para usarlo como showToast() en algunos módulos
export const showToast = toast;

// ── Indicador de conexión Firebase en el header ──────────────
// s='ok' → punto verde, s='err' → punto rojo, otro → amarillo cargando
export const connSet = (s, total = 0) => {
  const dot = document.getElementById('conn-dot');
  dot.className = s === 'ok' ? 'ok' : s === 'err' ? 'err' : '';
  document.getElementById('conn-txt').textContent =
    s === 'ok'  ? `${total} pólizas · Firebase ✓` :
    s === 'err' ? '⚠ Sin conexión' : 'Conectando…';
};
