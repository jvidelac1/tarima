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
 * Registro de toques: toda pulsación de Espacio o Enter (y todo dedo o clic sobre el escenario) queda anotada como aceptada
 * o descartada con su motivo, y se avisa a quien dibuja el acuse en pantalla. Ningún toque se pierde en silencio.
 * Motivos de descarte: 'espera' (todavía no hay nada que tocar), 'rebote' (segundo toque pegado al anterior), 'sobra' (no hace
 * falta), 'tarde' (la barra ya se perdió), 'termino' (el intento ya cerró), 'pausa', 'mouse' (el clic no es un gesto).
 */
export const toques = {
  total: 0, aceptados: 0, descartados: 0, ultimos: [], abierto: null, alCambiar: null, contexto: null,
  /** Una pulsación nueva (no una repetición del sistema). `t`: instante del evento en el reloj del juego. */
  nuevo(t, via, tecla) {
    const T = this.abierto = { n: ++this.total, t: Math.round(t), via, tecla, ok: null, motivo: '', donde: this.contexto?.() || '', vivo: performance.now() };
    this.ultimos.push(T); if (this.ultimos.length > 16) this.ultimos.shift(); this.alCambiar?.(T, 'baja'); return T;
  },
  /**
   * Qué pasó con la última pulsación. Se puede corregir (Espacio sobre un botón queda «aceptado» y, si el panel todavía
   * estaba bloqueado, el botón lo cambia a descartado). `sigue`: queda abierta a esa corrección.
   */
  resolver(ok, motivo = '', sigue = false) {
    const T = this.abierto; if (!T || !T.vivo || performance.now() - T.vivo > 1500) return;
    if (T.ok !== null) this[T.ok ? 'aceptados' : 'descartados']--;
    T.ok = !!ok; T.motivo = motivo; this[ok ? 'aceptados' : 'descartados']++; if (!sigue) T.vivo = 0; this.alCambiar?.(T, 'resuelto');
  },
  suelta() { this.alCambiar?.(this.abierto, 'sube'); },
};

/**
 * Entrada del levantamiento: barra espaciadora (o Enter) y dedos sobre la zona táctil o el escenario. Cada tecla y cada
 * puntero es un contacto; quien escucha recibe (t, 1, vía) cuando se apoya uno y (t, 0, vía) cuando se levanta. La vía es
 * 'teclado', 'tactil' o 'mouse': el clic del mouse se informa (saltea esperas) pero NO vale como gesto del levantamiento.
 * La repetición automática de la tecla no es un toque nuevo (la tecla sigue apoyada). Si la página pierde visibilidad o el
 * sistema cancela un toque, los contactos se levantan; y si llega una pulsación nueva de una tecla que figuraba apoyada
 * (se perdió su `keyup`), se levanta antes de volver a apoyarla: no se descarta.
 * Cada pulsación se anota en `toques`; quien escucha la resuelve (aceptada, o descartada con motivo). Sin nadie
 * escuchando, queda descartada con 'espera'.
 */
export class Boton {
  /** @param {HTMLElement[]} zonas elementos que reciben punteros */
  constructor(zonas) {
    this.contactos = new Map(); this.oye = null; this.via = 'teclado'; this.activo = true;
    const sube = (id, e) => { const via = this.contactos.get(id); if (via === undefined) return; this.contactos.delete(id); this.oye?.(reloj.deEvento(e), 0, via); };
    const baja = (id, e, via) => {
      if (this.contactos.has(id)) sube(id, e);
      this.contactos.set(id, via); this.via = via; this.oye?.(reloj.deEvento(e), 1, via);
      if (toques.abierto && toques.abierto.ok === null) toques.resolver(false, 'espera');      // nadie lo tomó
    };
    // por código físico o por carácter: un teclado remapeado que manda ' ' con otro código también vale
    const esEspacio = e => e.code === 'Space' || e.key === ' ', esTecla = e => esEspacio(e) || e.code === 'Enter' || e.key === 'Enter';
    // en captura y antes que el teclado de los paneles: la pulsación queda anotada (y con acuse) pase lo que pase después
    this._k0 = e => { if (esTecla(e) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toques.nuevo(reloj.deEvento(e), 'teclado', esEspacio(e) ? 'ESPACIO' : 'ENTER'); };
    this._kd = e => {
      if (!esTecla(e)) return;
      const T = toques.abierto, pend = !e.repeat && T && T.ok === null;
      // sobre un botón manda el botón (o ya lo activó el teclado del panel): cuenta como aceptado salvo que el botón diga otra cosa
      if (e.defaultPrevented || e.target.closest?.('button,input,select,a')) { if (pend) toques.resolver(true, 'boton', true); return; }
      e.preventDefault(); if (e.repeat) return;
      if (!this.activo) { if (pend) toques.resolver(false, 'pausa'); return; }
      baja('k' + (e.code || e.key), e, 'teclado');
    };
    this._ku = e => { if (esTecla(e)) { sube('k' + (e.code || e.key), e); toques.suelta(); } };
    this._pd = e => {
      if (!this.activo || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest?.('button,input,select,a,.panel')) return;
      const via = e.pointerType === 'mouse' ? 'mouse' : 'tactil'; e.preventDefault(); toques.nuevo(reloj.deEvento(e), via, via === 'mouse' ? 'CLIC' : 'TOQUE'); baja('p' + e.pointerId, e, via);
    };
    this._pu = e => { if (this.contactos.has('p' + e.pointerId)) { sube('p' + e.pointerId, e); toques.suelta(); } };
    this._todo = e => { for (const id of [...this.contactos.keys()]) sube(id, e); };
    this._vis = () => { if (document.visibilityState !== 'visible') this._todo(null); };
    addEventListener('keydown', this._k0, true); addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
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
