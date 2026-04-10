// ============================================================
// dashboard.js
// Módulo de Dashboard: KPIs de resumen, gráfica de cartera
// por producto en colones, top 8 pólizas por monto y
// tabla de próximas renovaciones.
// ============================================================

import { fmt, trunc, fmtDate } from './utils.js';
import { state } from './state.js';

// ── Renderizar todo el Dashboard ─────────────────────────────
// Se llama cada vez que el agente hace clic en el tab Dashboard.
// Lee los datos de state.polizas que ya están en memoria.
export function renderDashboard() {
  const D   = state.polizas;
  const crc = D.filter(r => r.moneda === 'CRC');
  const usd = D.filter(r => r.moneda === 'USD');
  const tC  = crc.reduce((s, r) => s + (r.total || 0), 0);
  const tU  = usd.reduce((s, r) => s + (r.total || 0), 0);

  // ── KPIs superiores ───────────────────────────────────────
  // 4 tarjetas: cartera CRC, cartera USD, período gracia y ≤30 días
  document.getElementById('dash-kpi').innerHTML = `
    <div class="kc kc2">
      <div class="kl">Cartera CRC</div>
      <div class="kv" style="color:var(--crc)">₡${fmt(tC)}</div>
      <div class="ks2">${crc.length} pólizas</div>
    </div>
    <div class="kc ku">
      <div class="kl">Cartera USD</div>
      <div class="kv" style="color:var(--usd)">$${fmt(tU)}</div>
      <div class="ks2">${usd.length} pólizas</div>
    </div>
    <div class="kc kg">
      <div class="kl">Período gracia</div>
      <div class="kv" style="color:var(--yellow)">
        ${D.filter(r => r.estado_poliza === 'Período gracia').length}
      </div>
      <div class="ks2">Urgentes</div>
    </div>
    <div class="kc kp">
      <div class="kl">Próx. ≤30d</div>
      <div class="kv" style="color:var(--red)">
        ${D.filter(r => (r.dias_venc || 0) <= 30).length}
      </div>
      <div class="ks2">Renovar pronto</div>
    </div>`;

  // ── Gráfica de barras por producto (Colones) ──────────────
  // Agrupa las pólizas CRC por producto y muestra las top 8
  // como barras proporcionales al total más alto
  const byCRC = {};
  crc.forEach(r => {
    byCRC[r.prod] = (byCRC[r.prod] || 0) + (r.total || 0);
  });

  const sp = Object.entries(byCRC)
    .sort((a, b) => b[1] - a[1])  // Ordenar de mayor a menor
    .slice(0, 8);                   // Tomar solo los top 8

  const mx = sp[0]?.[1] || 1; // Valor máximo para calcular proporciones

  document.getElementById('dash-prod').innerHTML = sp.map(([p, v]) => `
    <div class="br">
      <div class="bl">
        <span>${trunc(p, 30)}</span>
        <span style="color:var(--crc)">₡${fmt(v)}</span>
      </div>
      <div class="bt">
        <div class="bf" style="width:${(v / mx * 100).toFixed(1)}%"></div>
      </div>
    </div>`).join('');

  // ── Top 8 pólizas por monto total ─────────────────────────
  // Las 8 pólizas con mayor prima en toda la cartera
  // (incluye CRC y USD mezclados)
  const top8 = [...D]
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, 8);

  document.getElementById('dash-top').innerHTML = top8.map((r, i) => `
    <div style="display:flex;align-items:center;gap:7px;padding:5px 0;
                border-bottom:1px solid var(--bdr)33;font-size:11px;">
      <span style="color:var(--muted);min-width:14px;font-family:var(--fh);font-weight:800">
        ${i + 1}
      </span>
      <span style="flex:1;font-weight:600">${trunc(r.asegurado || '', 24)}</span>
      <span class="${r.moneda === 'CRC' ? 'crc-t' : 'usd-t'}"
            style="font-family:'Courier New',monospace;font-size:10px">
        ${r.moneda === 'CRC' ? '₡' : '$'}${fmt(r.total || 0)}
      </span>
    </div>`).join('');

  // ── Tabla de próximas renovaciones ────────────────────────
  // Las 10 pólizas que vencen más pronto ordenadas por fecha hasta
  const proximas = [...D]
    .filter(r => r.hasta)
    .sort((a, b) => new Date(a.hasta) - new Date(b.hasta))
    .slice(0, 10);

  document.getElementById('dash-renov').innerHTML = `
    <table style="width:100%;font-size:11px;border-collapse:collapse">
      <thead>
        <tr style="color:var(--muted);font-size:10px;text-transform:uppercase;font-family:var(--fh)">
          <th style="padding:5px 7px;text-align:left">Asegurado</th>
          <th style="padding:5px 7px;text-align:left">Producto</th>
          <th style="padding:5px 7px;text-align:left">Vence</th>
          <th style="padding:5px 7px;text-align:left">Fr</th>
          <th style="padding:5px 7px;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${proximas.map(r => `
          <tr style="border-top:1px solid var(--bdr)33">
            <td style="padding:6px 7px;font-weight:600">
              ${trunc(r.asegurado || '', 24)}
            </td>
            <td style="padding:6px 7px;color:var(--muted)">
              ${trunc(r.prod || '', 22)}
            </td>
            <td style="padding:6px 7px;color:var(--accent);font-family:'Courier New',monospace">
              ${fmtDate(r.hasta)}
            </td>
            <td style="padding:6px 7px">
              <span class="pill pgr">${r.fr || '—'}</span>
            </td>
            <td style="padding:6px 7px;text-align:right;font-family:'Courier New',monospace"
                class="${r.moneda === 'CRC' ? 'crc-t' : 'usd-t'}">
              ${r.moneda === 'CRC' ? '₡' : '$'}${fmt(r.total || 0)}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
