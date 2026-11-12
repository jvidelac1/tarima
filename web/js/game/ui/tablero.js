// Tablero de clasificación: los tres, sus seis intentos, total, puesto y medidor de energía. Solo DOM. El nombre del jugador
// reemplaza al de su pesista (o.nombre) y va escapado: lo escribió quien juega y entra en innerHTML. Su bandera es la del
// jugador (JUGADOR), no la del modelo que eligió.
import { PLANTEL, JUGADOR } from '../roster.js';
import { t, esc } from '../i18n/t.js';

const celda = (x, decl) => x ? `<td class="${x.res === 'valido' ? 'v' : 'x'}">${x.kg}</td>` : decl ? `<td class="d">${decl}</td>` : '<td class="d">·</td>';
/** @param {object} p partida  @param {{yo:number, sale?:number, nombre?:string}} o */
export function tableroHTML(p, o = {}) {
  const filas = p.tabla().map(f => {
    const a = p.at[f.a], P = PLANTEL[a.id], c = lev => [0, 1, 2].map(k => celda(a[lev][k], k === a[lev].length && (p.fase === lev || (lev === 'c' && p.fase === 'intervalo')) ? a.decl[lev] : 0)).join('');
    const quien = f.a === o.yo && o.nombre ? o.nombre : P.corto, e = Math.round(a.resto / 10);
    const puesto = f.puesto ?? (f.sinMarca ? `<span title="${esc(t('tabla.sin_total'))}">—</span>` : '–');
    return `<tr class="${f.a === o.yo ? 'yo' : ''} ${f.a === o.sale ? 'sale' : ''}"><td>${puesto}</td><td class="n"><i style="background:${(f.a === o.yo ? JUGADOR : P).bandera}"></i>${esc(quien)}</td>${c('s')}${c('c')}<td class="t">${f.total || '–'}</td><td><span class="resto" title="${esc(t('tabla.energia'))} ${e}"><b style="width:${a.resto / 10}%"></b></span> ${e}</td></tr>`;
  }).join('');
  return `<table class="tabla"><thead><tr><th></th><th></th><th colspan="3">${t('tabla.arranque')}</th><th colspan="3">${t('tabla.dos_tiempos')}</th><th>${t('tabla.total')}</th><th>${t('tabla.energia')}</th></tr></thead><tbody>${filas}</tbody></table>`;
}
