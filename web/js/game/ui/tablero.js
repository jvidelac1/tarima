// Tablero de clasificación: los tres, sus seis intentos, total, puesto y medidor de energía. Solo DOM. El nombre del jugador
// reemplaza al de su pesista (o.nombre) y va escapado: lo escribió quien juega y entra en innerHTML. Su bandera es la del
// jugador (JUGADOR), no la del modelo que eligió.
import { PLANTEL, JUGADOR } from '../roster.js';
import { t, esc } from '../i18n/t.js';
import { marcadorDe } from './marcador.js';

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

// ---------- tablero de la final, siempre a la vista (pedido del dueño del 13-nov: «un mini tablero que me diga cuánto peso
// eligen los otros pesistas, más enfoque de competencia y estrategia»). Reemplaza al marcador de una línea (ui/marcador.js
// queda como la cuenta de quién va ganando, que el tablero dice en su pie) y a los avisos sueltos de los rivales.
// datosTablero() es puro (lo prueba tools/sim_test.mjs); tableroVivoHTML() arma el DOM.

/**
 * Orden en que van a levantar en la sesión: el llamado en curso primero y después los que tienen intentos, como los
 * ordena la partida (match.js, _siguiente: kilos pedidos, intentos hechos, quién levantó antes). Los que terminaron, al final.
 */
export function ordenSalida(p, L = p.llamado) {
  const lev = p.lev, cand = p.at.filter(a => a[lev].length < 3 && (!L || a.i !== L.a));
  cand.sort((x, y) => (x.decl[lev] - y.decl[lev]) || (x[lev].length - y[lev].length) || (x.ult[lev] - y.ult[lev]) || (x.f.dorsal - y.f.dorsal));
  return [...(L ? [p.at[L.a]] : []), ...cand, ...p.at.filter(a => a[lev].length >= 3 && (!L || a.i !== L.a))].map(a => a.i);
}

/**
 * Lo que muestra el tablero: una fila por pesista en el orden de salida y, al pie, la cuenta (quién va ganando) y la
 * estrategia del rival que más importa ahora (el que está en la tarima o el próximo): cuánto pidió, si sale antes o después
 * del jugador, y cuánto necesita para pasarlo (o si con lo que pidió lo pasa).
 * @param {object} p Partida  @param {number} yo  @param {object|null} L llamado en curso (sin resolver)
 * @param {object} cambios {índice: kilos que tenía pedidos antes de su último cambio}
 * @returns {null | {lev, filas: object[], pie: Array<{clave:string, kg?:number, rival?:number}>}}
 */
export function datosTablero(p, yo, L = p?.llamado ?? null, cambios = {}) {
  if (!p || (p.fase !== 's' && p.fase !== 'c')) return null;
  const lev = p.lev, tab = p.tabla(), orden = ordenSalida(p, L), sigue = orden.find(i => i !== L?.a && p.at[i][lev].length < 3);
  const filas = orden.map(i => {
    const a = p.at[i], hechos = a[lev].length, quedan = 3 - hechos, f = tab.find(x => x.a === i), ahora = !!L && L.a === i;
    const pide = ahora ? L.kg : quedan ? a.decl[lev] : null, I = pide ? p.intensidadDe(i, lev, pide) : 0;
    return {
      a: i, id: a.id, yo: i === yo, s: a.mejor.s, c: a.mejor.c, total: a.mejor.s && a.mejor.c ? a.mejor.s + a.mejor.c : 0, puesto: f?.puesto ?? null,
      quedan, n: Math.min(3, hechos + 1), pide, cambio: quedan && cambios[i] !== undefined && cambios[i] !== pide ? cambios[i] : null,
      estado: ahora ? 'ahora' : i === sigue ? 'sigue' : quedan ? '' : 'fin',
      intentos: a[lev].map(x => x.res === 'valido'),
      estilo: i !== yo && quedan ? p.estiloDe(i, lev, Math.min(3, hechos + 1)) || '' : '',
      apuesta: i !== yo && ahora ? (I <= 9500 ? 'comodo' : I <= 9900 ? 'justo' : 'limite') : '',
    };
  });
  const pie = [];
  // la cuenta: quién va ganando y cuánto le falta al jugador (lo de ui/marcador.js, sin el «te pasa»: lo dice la estrategia)
  const m = marcadorDe(p, yo, null);
  if (m) pie.push({ clave: m.clave, kg: m.kg, rival: m.lider, ...(m.sub ? { sub: { clave: m.sub.clave, kg: m.sub.kg } } : {}) });
  // la estrategia del rival que importa ahora: el que levanta, o el próximo rival con intentos
  const r = L && L.a !== yo ? L.a : orden.find(i => i !== yo && p.at[i][lev].length < 3);
  if (r !== undefined && r !== null) {
    const fr = filas.find(x => x.a === r), yoF = filas.find(x => x.yo), ahora = fr.estado === 'ahora';
    const partes = [{ clave: ahora ? 'tablero.va_por' : 'tablero.pidio', rival: r, kg: fr.pide }];
    if (!ahora && yoF.quedan) partes.push({ clave: orden.indexOf(r) < orden.indexOf(yo) ? 'tablero.antes_que_tu' : 'tablero.despues_de_ti' });
    const need = p.paraPasar(r, yo, lev);
    if (need !== null) partes.push(fr.pide >= need ? { clave: 'tablero.te_pasa', kg: fr.pide } : { clave: 'tablero.para_pasarte', kg: need });
    pie.push({ clave: 'tablero.rival', partes });
  }
  return { lev, filas, pie };
}

/**
 * HTML del tablero. `o.nombre(i)` y `o.corto(i)`: nombre del pesista (el del jugador ya escapado afuera o no: acá se escapa);
 * `o.ident(i)`: {color, bandera}; `o.rm`: el RM del jugador en este levantamiento (kg); `o.compacto`: teléfono acostado
 * (nombre corto, lo que lleva y lo que pide, y una sola línea al pie).
 */
export function tableroVivoHTML(d, o) {
  if (!d) return '';
  const lev = d.lev, dt = lev === 'c', C = o.compacto, T = (k, x = {}) => esc(t(k, x));
  const marca = f => (dt ? f.total || '—' : f.s || '—');
  const puntos = f => `<span class="tb-int" aria-hidden="true">${[0, 1, 2].map(k => `<i class="${k < f.intentos.length ? (f.intentos[k] ? 'v' : 'x') : k === f.intentos.length && f.estado === 'ahora' ? 'ya' : ''}"></i>`).join('')}</span>`;
  const estado = f => (f.estado === 'ahora' ? `<em class="tb-est ahora">${T('tablero.ahora')}</em>` : f.estado === 'sigue' ? `<em class="tb-est">${T('tablero.sigue')}</em>` : f.estado === 'fin' ? `<em class="tb-est fin">${T('tablero.termino')}</em>` : '');
  const filas = d.filas.map(f => {
    const P = o.ident(f.a), nom = esc(C ? o.corto(f.a) : o.nombre(f.a)) + (f.yo ? ` <small>${T('tablero.tu')}</small>` : '');
    const extra = C ? '' : f.yo && o.rm ? `<small class="tb-rm">${T('tablero.tu_rm', { kg: o.rm })}</small>` : f.estilo ? `<small class="tb-estilo">${T('rival.estilo.' + f.estilo)}</small>` : '';
    const pide = f.pide ? `<b>${f.pide}</b>${f.cambio !== null ? `<small class="tb-cambio">${T('tablero.antes', { kg: f.cambio })}</small>` : f.apuesta && !C ? `<small class="tb-apuesta">${T('rival.apuesta.' + f.apuesta)}</small>` : ''}` : '—';
    const cols = C ? `<td class="tb-m">${marca(f)}</td>` : dt ? `<td class="tb-m">${f.s || '—'}</td><td class="tb-m">${f.c || '—'}</td><td class="tb-m tb-t">${f.total || '—'}</td>` : `<td class="tb-m tb-t">${f.s || '—'}</td>`;
    return `<tr class="${f.yo ? 'yo' : ''} ${f.estado}${f.cambio !== null ? ' cambio' : ''}" style="--c:${P.color}"><td class="tb-p">${f.puesto ?? ''}</td><td class="tb-n"><i style="background:${P.bandera}"></i><span>${nom}${extra}</span></td>${cols}<td class="tb-pide">${pide}</td><td class="tb-e">${C ? '' : puntos(f)}${estado(f)}</td></tr>`;
  }).join('');
  const cab = C ? `<th></th><th></th><th>${T(dt ? 'tabla.total' : 'tablero.mejor')}</th><th>${T('tablero.pide')}</th><th></th>`
    : `<th></th><th>${esc(t('lev.' + lev))}</th>${dt ? `<th>${T('tablero.col_s')}</th><th>${T('tablero.col_c')}</th><th>${T('tabla.total')}</th>` : `<th>${T('tablero.mejor')}</th>`}<th>${T('tablero.pide')}</th><th></th>`;
  const txt = x => { const datos = { ...x, rival: x.rival !== undefined ? o.corto(x.rival) : '' }; return t(x.clave, datos); };
  const pieTxt = d.pie.filter(x => !C || x.clave === 'tablero.rival').map(x => x.clave === 'tablero.rival' ? x.partes.map(txt).join(' · ') : [txt(x), x.sub ? txt(x.sub) : ''].filter(Boolean).join(' · '));
  return `<table class="tb"><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table>${pieTxt.length ? `<div class="tb-pie">${pieTxt.map((s, k) => `<p class="${k === pieTxt.length - 1 && d.pie.at(-1).clave === 'tablero.rival' ? 'est' : ''}">${esc(s)}</p>`).join('')}</div>` : ''}`;
}
