// Reloj del juego, entrada del levantamiento y teclado de los paneles (docs/CONTROLES.md, sección 1). El instante de cada
// gesto sale del evento del navegador, en ms, y no del cuadro dibujado. La fuente de tiempo es inyectable: las pruebas
// detienen el reloj y lo adelantan a mano, y la pausa lo congela.

/** Reloj sin recorte: performance.now(), o un tiempo manual para las pruebas y la pausa. */
export const reloj = {
  manual: null, desfase: 0,
  ahora() { return this.manual !== null ? this.manual : performance.now() + this.desfase; },
  /** Instante de un evento del navegador (mismo origen que performance.now). */
  deEvento(e) { return this.manual !== null ? this.manual : (e && e.timeStamp > 0 ? e.timeStamp : performance.now()) + this.desfase; },
  /** Vuelve al reloj verdadero sin que el tiempo del juego salte hacia atrás. */
  soltar() { if (this.manual !== null) { this.desfase = this.manual - performance.now(); this.manual = null; } },
};

/**
 * Entrada del levantamiento: barra espaciadora (o Enter) y dedos sobre la zona táctil o el escenario. Cada tecla y cada
 * puntero es un contacto; quien escucha recibe (t, 1, vía) cuando se apoya uno y (t, 0, vía) cuando se levanta. La vía es
 * 'teclado', 'tactil' o 'mouse': el clic del mouse se informa (saltea esperas) pero NO vale como gesto del levantamiento.
 * La repetición automática de la tecla se ignora. Si la página pierde visibilidad o el sistema cancela un toque, los
 * contactos se levantan.
 */
export class Boton {
  /** @param {HTMLElement[]} zonas elementos que reciben punteros */
  constructor(zonas) {
    this.contactos = new Map(); this.oye = null; this.via = 'teclado'; this.activo = true;
    const baja = (id, e, via) => { if (this.contactos.has(id)) return; this.contactos.set(id, via); this.via = via; this.oye?.(reloj.deEvento(e), 1, via); };
    const sube = (id, e) => { const via = this.contactos.get(id); if (via === undefined) return; this.contactos.delete(id); this.oye?.(reloj.deEvento(e), 0, via); };
    this._kd = e => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      if (e.defaultPrevented || e.target.closest?.('button,input,select,a')) return;      // sobre un botón manda el botón
      e.preventDefault(); if (e.repeat || !this.activo) return; baja('k' + e.code, e, 'teclado');
    };
    this._ku = e => { if (e.code === 'Space' || e.code === 'Enter') sube('k' + e.code, e); };
    this._pd = e => { if (!this.activo || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest?.('button,input,select,a,.panel')) return; e.preventDefault(); baja('p' + e.pointerId, e, e.pointerType === 'mouse' ? 'mouse' : 'tactil'); };
    this._pu = e => sube('p' + e.pointerId, e);
    this._todo = e => { for (const id of [...this.contactos.keys()]) sube(id, e); };
    this._vis = () => { if (document.visibilityState !== 'visible') this._todo(null); };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
    for (const z of zonas) { z.addEventListener('pointerdown', this._pd); z.addEventListener('contextmenu', e => e.preventDefault()); }
    addEventListener('pointerup', this._pu); addEventListener('pointercancel', this._pu); addEventListener('blur', this._todo); document.addEventListener('visibilitychange', this._vis);
  }
  /** Hay un contacto que vale como gesto (teclado o dedo). */
  get apretado() { for (const v of this.contactos.values()) if (v !== 'mouse') return true; return false; }
}

// ---------- teclado de los paneles ----------
const visibles = raiz => [...raiz.querySelectorAll('button:not(:disabled)')].filter(b => b.offsetParent !== null);
/** Botón principal de un panel: el marcado con .ir, o el primero. */
export const principal = raiz => { const bs = visibles(raiz); return bs.find(b => b.classList.contains('ir')) || bs[0] || null; };
/** Clave para reencontrar un botón después de repintar el panel. */
export function claveDe(b) {
  if (!b || b.tagName !== 'BUTTON') return null; if (b.id) return '#' + b.id;
  const d = Object.entries(b.dataset)[0]; return d ? `button[data-${d[0]}="${d[1]}"]` : null;
}
/** Lleva el foco al botón de `clave` si sigue ahí y habilitado; si no, al principal. */
export function enfocar(raiz, clave = null, scroll = false) {
  let b = clave ? raiz.querySelector(clave) : null; if (!b || b.disabled || b.offsetParent === null) b = principal(raiz);
  b?.focus({ preventScroll: !scroll }); return b;
}
/**
 * Flechas y Tab dentro de un panel. ↑ ↓ y Tab mueven el foco; ← → cambian los kilos si el panel tiene selector y, si no,
 * mueven el foco dentro de la fila. Devuelve true si la tecla quedó atendida.
 */
export function navegar(raiz, e) {
  const DIR = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }, dir = DIR[e.key];
  if (!dir && e.key !== 'Tab') return false;
  const bs = visibles(raiz), act = document.activeElement, i = bs.indexOf(act); if (!bs.length) return false;
  if (dir && dir[0]) { const kg = raiz.querySelector(dir[0] < 0 ? '#kg-menos' : '#kg-mas'); if (kg) { if (!kg.disabled) kg.click(); return true; } }
  if (i < 0) { enfocar(raiz, null, true); return true; }
  if (!dir) { bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus(); return true; }
  // el más cercano en esa dirección: primero la distancia sobre el eje, y bastante más cara la distancia cruzada
  const r0 = act.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2]; let mejor = null, costo = Infinity;
  for (const b of bs) {
    if (b === act) continue; const r = b.getBoundingClientRect(), dx = r.left + r.width / 2 - c0[0], dy = r.top + r.height / 2 - c0[1];
    const eje = dx * dir[0] + dy * dir[1], cruz = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]); if (eje < 6) continue;
    // en vertical, un botón que se solapa en horizontal con el actual no paga cruce: baja «derecho»
    const solapa = dir[1] && r.left < r0.right && r.right > r0.left, c = eje + (solapa ? 0 : cruz * 3); if (c < costo) { costo = c; mejor = b; }
  }
  mejor?.focus(); return true;
}
