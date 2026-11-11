// Tablero de clasificación: los tres, sus seis intentos, total, puesto y medidor de Resto. Solo DOM.
import { PLANTEL } from '../roster.js';

const celda = (x, decl) => x ? `<td class="${x.res === 'valido' ? 'v' : 'x'}">${x.kg}</td>` : decl ? `<td class="d">${decl}</td>` : '<td class="d">·</td>';
/** @param {object} p partida  @param {{yo:number, sale?:number}} o */
export function tableroHTML(p, o = {}) {
  const filas = p.tabla().map(f => {
    const a = p.at[f.a], P = PLANTEL[a.id], c = lev => [0, 1, 2].map(k => celda(a[lev][k], k === a[lev].length && (p.fase === lev || (lev === 'c' && p.fase === 'intervalo')) ? a.decl[lev] : 0)).join('');
    return `<tr class="${f.a === o.yo ? 'yo' : ''} ${f.a === o.sale ? 'sale' : ''}"><td>${f.puesto ?? (f.sinMarca ? 'SM' : '–')}</td><td class="n"><i style="background:${P.bandera}"></i>${P.corto} <small>${a.f.dorsal}</small></td>${c('s')}${c('c')}<td class="t">${f.total || '–'}</td><td><span class="resto" title="Resto ${Math.round(a.resto / 10)}"><b style="width:${a.resto / 10}%"></b></span> ${Math.round(a.resto / 10)}</td></tr>`;
  }).join('');
  return `<table class="tabla"><thead><tr><th></th><th></th><th colspan="3">Arranque</th><th colspan="3">Dos tiempos</th><th>Total</th><th>Resto</th></tr></thead><tbody>${filas}</tbody></table>`;
}
