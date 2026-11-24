// Aprender jugando (LIF-52): explicaciones de una línea que salen UNA vez, en el momento en que el concepto aparece, y se
// cierran con ✕ (o solas). No frenan nada: el juego sigue igual con o sin ellas (no hay esperas nuevas). Cada una es la
// misma línea del glosario de «Cómo se juega» (glosario.<clave>.t y .d): un solo texto para las dos cosas.
// Una por momento: si ya hay una a la vista, la siguiente espera a otro momento. Se guarda como vista (tarima.visto.a_<clave>)
// si la persona la cerró, si estuvo a la vista LEIDO_MS o si ya salió dos veces (la cortó un momento corto).
// Dónde: con el panel del llamado abierto, encima del panel (el pesista está del otro lado); en lo demás (turno de un rival,
// veredicto de un rival), abajo a la izquierda, donde en 'b' y 'u' no hay nada (el zócalo no se muestra) y el pesista no llega.
// Solo en 'b' y 'u' (main.js decide); nunca durante el levantamiento propio.
import { t, alCambiarIdioma } from '../i18n/t.js';
import { ENVIONES } from '../roster.js';

/**
 * Las explicaciones en orden de prioridad. `en`: momentos en que pueden salir. `si(c)`: si tiene sentido con lo que hay en
 * pantalla. c: { lev, envFijo, barra, hechos (intentos propios en este levantamiento), cambiar (hay botón «Cambiar»), nulo }.
 */
export const APRENDE = [
  { clave: 'estilo', en: ['llamado'], si: c => c.lev === 'c' && !c.envFijo },
  { clave: 'dificultad', en: ['llamado'], si: c => !!c.barra },
  { clave: 'kilos', en: ['llamado'], si: c => c.hechos > 0 },
  { clave: 'cambiar', en: ['rival'], si: c => !!c.cambiar },
  { clave: 'nulo', en: ['decision'], si: c => !!c.nulo },
  { clave: 'luces', en: ['decision'], si: () => true },
  { clave: 'total', en: ['llamado', 'rival'], si: c => c.lev === 'c' },
];
export const CLAVES = APRENDE.map(x => x.clave);
/** A la vista al menos esto (ms del reloj del juego) para darla por leída aunque se cierre sola. */
export const LEIDO_MS = 3500;
/** Como mucho esto a la vista (ms). */
export const VIDA_MS = 15000;
/** Pantallas en las que sigue a la vista una que salió en la esquina (en las demás se cierra sola). */
const ESQUINA = new Set(['rival', 'decision', 'repeticion_rival', 'carga']);

/** La primera explicación sin ver que corresponde a este momento, o null. `visto(clave)`: si ya se vio. */
export function elegir(momento, c, visto) { return APRENDE.find(x => x.en.includes(momento) && !visto(x.clave) && x.si(c)) || null; }

/** Título y línea de una explicación en el idioma actual. `c.titulos[clave]`: título concreto del momento (p. ej. «Fácil · 9 de 10»). */
export function textoDe(clave, c = {}) { return { titulo: c.titulos?.[clave] || t(`glosario.${clave}.t`), linea: t(`glosario.${clave}.d`, varsGlosario()) }; }
/** Lo que completan las líneas del glosario (los nombres de los estilos de envión en el idioma actual). */
export const varsGlosario = () => ({ split: ENVIONES.split, power: ENVIONES.power, squat: ENVIONES.squat });

export class Aprende {
  /**
   * @param {HTMLElement} tv   capa de la transmisión (#tv): ahí va el cartelito
   * @param {object} o  ahora() reloj del juego · guardado {get,set} · ev(nombre, props) · pantalla() · panel() el panel del llamado o null
   */
  constructor(tv, o) {
    this.o = o; this.act = null;
    const el = this.el = document.createElement('div'); el.id = 'aprende'; el.className = 'aprende'; el.hidden = true; el.setAttribute('role', 'note'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<p><b></b> <span></span></p><button type="button" tabindex="-1"><span aria-hidden="true">✕</span></button>';
    // el botón no se lleva el foco ni el toque: Espacio sigue siendo del juego, y el toque no cuenta para el levantamiento (input.js ignora botones)
    el.querySelector('button').addEventListener('click', e => { e.preventDefault(); e.currentTarget.blur(); this.cerrar('boton'); });
    tv.appendChild(el);
    alCambiarIdioma(() => { if (this.act) { this._pintar(); this.colocar(); } });      // cambia el idioma con una a la vista (desde la pausa)
  }
  _pintar() {
    const a = this.act, { titulo, linea } = textoDe(a.clave, a.c), b = this.el.querySelector('button');
    this.el.querySelector('b').textContent = titulo; this.el.querySelector('p span').textContent = linea; b.setAttribute('aria-label', t('aprende.cerrar')); b.title = t('aprende.cerrar');
  }
  visto(clave) { return !!this.o.guardado.get('tarima.visto.a_' + clave); }
  /** Intenta mostrar la explicación de este momento. Devuelve la clave mostrada o null. */
  momento(momento, c = {}) {
    if (this.act) { if (this.o.ahora() - this.act.t0 < LEIDO_MS) return null; this.cerrar('sola'); }
    const x = elegir(momento, c, k => this.visto(k)); if (!x) return null;
    const n = (+this.o.guardado.get('tarima.aprende.n_' + x.clave) || 0) + 1;
    this.o.guardado.set('tarima.aprende.n_' + x.clave, String(n));
    this.act = { clave: x.clave, c, t0: this.o.ahora(), donde: momento === 'llamado' ? 'panel' : 'esquina', n }; this._pintar();
    this.el.dataset.clave = x.clave; this.el.dataset.donde = this.act.donde; this.el.hidden = false; this.colocar();
    this.o.ev('explicacion_vista', { clave: x.clave, momento, pantalla: this.o.pantalla(), vez: n });
    return x.clave;
  }
  /** Cierra la que está a la vista. via: 'boton' (la cerró la persona) o 'sola'. */
  cerrar(via = 'sola') {
    const a = this.act; if (!a) return; this.act = null; this.el.hidden = true;
    const ms = Math.round(this.o.ahora() - a.t0), leida = via === 'boton' || ms >= LEIDO_MS || a.n >= 2;
    if (leida) this.o.guardado.set('tarima.visto.a_' + a.clave, '1');
    this.o.ev('explicacion_cerrada', { clave: a.clave, via, ms, leida });
  }
  /** Al cambiar de pantalla: la del panel se va con el panel; la de la esquina sigue en el turno de un rival y en los veredictos. */
  alVisitar(p) { const a = this.act; if (a && (a.donde === 'panel' ? p !== 'llamado' : !ESQUINA.has(p))) this.cerrar('sola'); }
  /** En cada cuadro: el tope de VIDA_MS. */
  tic(now) { if (this.act && now - this.act.t0 >= VIDA_MS) this.cerrar('sola'); else if (this.act?.donde === 'esquina' && document.documentElement.classList.contains('vert')) this.colocar(); }
  /**
   * Encima del panel del llamado (alineada a su derecha y del mismo ancho), o abajo a la izquierda (clase CSS). Si encima del
   * panel no entra (el detalle abierto lo agranda), se oculta mientras tanto.
   */
  colocar() {
    const el = this.el, a = this.act; if (!a) return;
    const s = el.style; s.left = s.right = s.bottom = s.width = ''; el.classList.remove('sin-lugar');
    if (a.donde !== 'panel') { this._apilar(); return; }
    const pn = this.o.panel(), tv = el.parentElement; if (!pn || !tv) return;
    const rotado = document.documentElement.classList.contains('rotado');
    // con el contenido girado (teléfono en vertical) las cajas salen rotadas: ahí se usan los desplazamientos
    const de = e => { let x = 0, y = 0; for (let n = e; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; }, o0 = rotado ? de(tv) : null;
    const caja = rotado ? (() => { const o = de(pn); return { l: o.x - o0.x, t: o.y - o0.y, w: pn.offsetWidth }; })() : (() => { const r = pn.getBoundingClientRect(), q = tv.getBoundingClientRect(); return { l: r.left - q.left, t: r.top - q.top, w: r.width }; })();
    const W = tv.clientWidth, H = tv.clientHeight, gap = 6;
    s.right = Math.max(0, W - caja.l - caja.w) + 'px'; s.width = caja.w + 'px'; s.bottom = (H - caja.t + gap) + 'px';
    // arriba quedan la caja de las luces y los botones de sonido, pausa y ayuda
    const techo = Math.max(...['.relojbox', '#pausa', '#sonidob', '#ayudab'].map(q => { const e = document.querySelector(q); if (!e || e.hidden || !e.offsetParent) return 0; return rotado ? de(e).y - o0.y + e.offsetHeight : e.getBoundingClientRect().bottom - tv.getBoundingClientRect().top; }));
    if (caja.t - gap - el.offsetHeight < techo + gap) el.classList.add('sin-lugar');
  }
  /**
   * Teléfono parado (LIF-50): la de la esquina va a lo ancho, justo encima de lo que haya abajo (el veredicto, «Saltar», el
   * botón redondo, «Toca: seguir»), que cambia mientras está a la vista: se recoloca en cada cuadro (tic).
   */
  _apilar() {
    if (!document.documentElement.classList.contains('vert')) return;
    const tv = this.el.parentElement, q = tv?.getBoundingClientRect(); if (!q) return;
    let arriba = q.bottom;
    for (const sel of ['#veredicto', '#prono', '#acuse', '#zona', '#seguir', '#barrita', '#senal']) {
      const e = document.querySelector(sel); if (!e || e.hidden) continue; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.top < arriba) arriba = r.top;      // #zona es fija: sin offsetParent
    }
    this.el.style.bottom = Math.round(q.bottom - arriba + 8) + 'px';
  }
  /** Para las pruebas: lo que está a la vista. */
  estado() { const a = this.act; return a ? { clave: a.clave, donde: a.donde, ms: Math.round(this.o.ahora() - a.t0), texto: this.el.textContent.replace('✕', '').trim() } : null; }
}
