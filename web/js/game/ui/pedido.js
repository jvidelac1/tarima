// «Cambiar» el pedido mientras no le toca (LIF-4, 15-nov): un botón chico debajo del tablero, en el turno de un rival. Abre
// una sola fila: − kilos + y «Pedir». Solo hacia arriba y hasta dos cambios por intento (junto con los del panel del
// llamado), como en match.js → pedidoValido. Lo puro (qué se puede pedir) está acá y lo prueba tools/sim_test.mjs; el DOM y
// el teclado, en main.js.
import { KG_MAX } from '../../sim/rules.js';
import { TURNOS } from '../../sim/match.js';
import { t, esc } from '../i18n/t.js';

/** Tecla del botón «Cambiar» (con teclado): C. Las flechas cambian los kilos, Enter pide y Esc cierra. */
export const TECLA_PEDIDO = 'c';
/** Cuántos kilos por encima del pedido actual ofrece como mucho (más que eso no se pide de un turno a otro). */
const RANGO = 15;

/**
 * Lo que la persona `yo` puede pedir ahora, o null si el botón no va. `pend`: un pedido que ya hizo y que todavía no entró en
 * la partida (le toca a ella en la partida, pero en pantalla sigue el rival anterior: main.js lo aplica al abrir su llamado).
 * @returns {null | {lev, n, decl, min, max, quedan}}
 */
export function opcionesPedido(p, yo, pend = null) {
  if (!p || !p.cfg.turnos || (p.fase !== 's' && p.fase !== 'c') || pend !== null) return null;
  const lev = p.lev, a = p.at[yo]; if (!a || a.ctrl !== 'persona' || a[lev].length >= 3 || a.cambios >= TURNOS.previos) return null;
  const decl = a.decl[lev], min = Math.max(decl + 1, p.minimo(yo)), max = Math.min(KG_MAX, decl + RANGO);
  if (min > max) return null;
  return { lev, n: a[lev].length + 1, decl, min, max, quedan: TURNOS.previos - a.cambios };
}

/**
 * HTML del control. `S`: {abierto, kg}; `o.chance(kg)`: «X de 10» (o null), `o.tecla`: mostrar la tecla (computadora).
 */
export function pedidoHTML(op, S, o = {}) {
  if (!op) return '';
  const kbd = k => (o.tecla ? ` <kbd class="tecla">${k}</kbd>` : '');
  // 23-nov: cerrado, además de «Cambiar», la pregunta «¿Subes?» con los dos pesos más cercanos, a un toque
  if (!S.abierto) {
    const sube = [op.min, op.min + 1].filter(k => k <= op.max).map(k => `<button type="button" class="tb-sube" data-pedido="kg${k}" aria-label="${esc(t('pedido.pedir', { kg: k }))}">${k}</button>`).join('');
    return `<span class="tb-sube-q">${esc(t('pedido.subes'))}</span>${sube}<button type="button" class="tb-cambiar" data-pedido="abrir" aria-label="${esc(t('pedido.aria', { kg: op.decl }))}">${esc(t('pedido.boton'))}${kbd(TECLA_PEDIDO.toUpperCase())}</button>`;
  }
  const ch = o.chance ? o.chance(S.kg) : null;
  return `<div class="tb-ped" role="group" aria-label="${esc(t('pedido.aria', { kg: op.decl }))}">`
    + `<button type="button" data-pedido="menos" aria-label="${esc(t('pedido.menos'))}"${S.kg <= op.min ? ' disabled' : ''}>−</button>`
    + `<b>${S.kg}</b>${ch !== null ? `<small>${esc(t('llamado.u_chance', { n: ch }))}</small>` : ''}`
    + `<button type="button" data-pedido="mas" aria-label="${esc(t('pedido.mas'))}"${S.kg >= op.max ? ' disabled' : ''}>+</button>`
    + `<button type="button" class="ir" data-pedido="ok">${esc(t('pedido.pedir', { kg: S.kg }))}</button>`
    + `<button type="button" data-pedido="no" aria-label="${esc(t('pedido.cerrar'))}">✕</button>`
    + `<small class="tb-ped-nota">${esc(t(op.quedan === 1 ? 'pedido.queda_1' : 'pedido.quedan', { n: op.quedan }))}</small></div>`;
}
