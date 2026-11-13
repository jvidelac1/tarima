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
  total: 0, aceptados: 0, descartados: 0, motivos: {}, ultimos: [], abierto: null, alCambiar: null, contexto: null,
  /** Lo que tardó el manejador de cada pulsación del levantamiento (ms, las últimas 64): acuse, núcleo y palabra incluidos. */
  manejo: [],
  /**
   * Acuse medido en el aparato de verdad (meta I): ms desde el instante del evento hasta el cuadro siguiente, en que la
   * tecla hundida (o el anillo del botón) ya se pinta. `esperan`: instantes (performance.now) de pulsaciones que todavía no
   * tuvieron cuadro; main.js las cierra en cada requestAnimationFrame. `pinta`: las últimas 64; `nPinta`: cuántas hubo.
   */
  esperan: [], pinta: [], nPinta: 0,
  /** En cada cuadro del navegador (main.js, bucle): cierra las pulsaciones que esperaban ese cuadro. */
  cuadro() {
    if (!this.esperan.length) return; const a = performance.now();
    for (const ts of this.esperan) { this.pinta.push(Math.max(0, a - ts)); this.nPinta++; } this.esperan.length = 0;
    if (this.pinta.length > 64) this.pinta.splice(0, this.pinta.length - 64);
  },
  /** p95 del acuse (ms) de las últimas `n` pulsaciones (todas las anotadas, si no se dice). */
  acuseP95(n = this.pinta.length) { const v = this.pinta.slice(-Math.min(n, this.pinta.length)).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * .95))] : null; },
  /** Una pulsación nueva (no una repetición del sistema). `t`: instante del evento en el reloj del juego. */
  nuevo(t, via, tecla) {
    const T = this.abierto = { n: ++this.total, t: Math.round(t), via, tecla, ok: null, motivo: '', donde: this.contexto?.() || '', vivo: performance.now() };
    if (reloj.manual === null) this.esperan.push(t - reloj.desfase);      // el instante del evento en el reloj de performance.now
    this.ultimos.push(T); if (this.ultimos.length > 16) this.ultimos.shift(); this.alCambiar?.(T, 'baja'); return T;
  },
  /**
   * Qué pasó con la última pulsación. Se puede corregir (Espacio sobre un botón queda «aceptado» y, si el panel todavía
   * estaba bloqueado, el botón lo cambia a descartado). `sigue`: queda abierta a esa corrección.
   */
  resolver(ok, motivo = '', sigue = false) {
    const T = this.abierto; if (!T || !T.vivo || performance.now() - T.vivo > 1500) return;
    if (T.ok !== null) { this[T.ok ? 'aceptados' : 'descartados']--; if (!T.ok) this.motivos[T.motivo] = (this.motivos[T.motivo] || 1) - 1; }
    T.ok = !!ok; T.motivo = motivo; this[ok ? 'aceptados' : 'descartados']++; if (!ok) this.motivos[motivo] = (this.motivos[motivo] || 0) + 1; if (!sigue) T.vivo = 0; this.alCambiar?.(T, 'resuelto');
  },
  suelta() { this.alCambiar?.(this.abierto, 'sube'); },
  /** Foto de los contadores, para restar después (cuántos toques y descartes por motivo hubo en un tramo). */
  foto() { return { total: this.total, aceptados: this.aceptados, descartados: this.descartados, motivos: { ...this.motivos }, nPinta: this.nPinta }; },
  /** Lo que pasó desde `f` (foto()): {toques, aceptados, descartados, desc_<motivo>…}, todo números (va a las métricas). */
  desde(f) {
    const o = { toques: this.total - f.total, aceptados: this.aceptados - f.aceptados, descartados: this.descartados - f.descartados };
    // el acuse medido en este tramo (va a las métricas: es la medida en los aparatos de verdad de la gente)
    const np = this.nPinta - (f.nPinta || 0); if (np > 0) { o.acuse_n = np; o.acuse_p95_ms = Math.round(this.acuseP95(np)); }
    for (const [k, v] of Object.entries(this.motivos)) { const d = v - (f.motivos[k] || 0); if (d > 0) o['desc_' + k] = d; }
    return o;
  },
  /**
   * Inicio de la ráfaga a la que pertenece la pulsación del instante `t`: hacia atrás, mientras entre una y la anterior
   * haya menos de `hueco` ms. Sirve para no saltear una pantalla con toques que venían del levantamiento (el que machaca
   * Espacio en ¡EMPUJÁ! sigue machacando un rato después del final). -Infinity si la ráfaga es más vieja que lo anotado.
   */
  rafaga(t, hueco = 300) {
    const u = this.ultimos; let i = u.length - 1; while (i >= 0 && u[i].t > t + 1) i--; if (i < 0) return t;
    let ini = u[i].t; for (let k = i - 1; k >= 0; k--) { if (ini - u[k].t >= hueco) return ini; ini = u[k].t; }
    return u.length >= 16 ? -Infinity : ini;
  },
};

/**
 * Un campo donde se escribe (nombre, mail, encuesta): ahí Espacio y Enter son del campo, no del juego. Con el foco en un
 * campo, ni el botón del levantamiento ni el teclado de los paneles toman esas teclas (docs/MVP.md, sección 2, «Teléfono»).
 */
export function esCampo(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const t = el.tagName;
  if (t === 'TEXTAREA' || t === 'SELECT') return true;
  if (t !== 'INPUT') return false;
  // casillas, radios y botones no reciben texto: Espacio los marca y eso lo resuelve el navegador
  return !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(el.type || 'text');
}
/** El evento de teclado viene de un campo de texto (o el foco está en uno). */
export const enCampo = e => esCampo(e?.target) || esCampo(document.activeElement);

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
    /**
     * `intento`: hay un levantamiento propio en curso (docs/JUEGO.md G2.2). Espacio y Enter son del levantamiento: se
     * atienden en captura sobre window, con preventDefault, y no activan ningún botón ni el teclado de los paneles; y
     * si el primer evento de una tecla es una repetición (el foco llegó con la tecla ya apretada), cuenta como apretar.
     * `tolerante` (nivel 'u'): un puntero que el sistema cancela sigue apoyado GRACIA_MS por si vuelve. En Clásico soltar es un
     * gesto (¡SUELTA!), así que ahí el puntero cancelado se levanta en el acto, como siempre.
     * Los toques cerca de los bordes de la pantalla CUENTAN (Gameplay 2.1): ningún toque cambia el resultado en 'u', así que
     * no hay nada que proteger, y descartarlos en silencio era un toque perdido sin acuse.
     */
    this.intento = false; this.tolerante = false; this.gracia = new Map();
    /** `sinRepeticion` (nivel 'b', la barrita): una tecla que llega ya repitiendo no es un toque; la barrita pide bajar de nuevo. */
    this.sinRepeticion = false;
    const sube = (id, e) => { const via = this.contactos.get(id); if (via === undefined) return; this.contactos.delete(id); const g = this.gracia.get(id); if (g) { clearTimeout(g); this.gracia.delete(id); } this.oye?.(reloj.deEvento(e), 0, via); };
    const baja = (id, e, via) => {
      if (this.contactos.has(id)) sube(id, e);
      this.contactos.set(id, via); this.via = via; this.oye?.(reloj.deEvento(e), 1, via);
      if (toques.abierto && toques.abierto.ok === null) toques.resolver(false, 'espera');      // nadie lo tomó
    };
    // por código físico o por carácter: un teclado remapeado que manda ' ' con otro código también vale
    const esEspacio = e => e.code === 'Space' || e.key === ' ', esTecla = e => esEspacio(e) || e.code === 'Enter' || e.key === 'Enter';
    const idTecla = e => 'k' + (e.code || e.key);
    // en captura y antes que el teclado de los paneles: la pulsación queda anotada (y con acuse) pase lo que pase después
    this._k0 = e => {
      if (!esTecla(e) || enCampo(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.intento) {
        // el levantamiento es dueño de la tecla: ni desplaza la página ni activa un botón con foco (preventDefault; el
        // teclado de los paneles y _kd la dejan pasar porque ya viene atendida)
        e.preventDefault();
        if (e.repeat && (this.sinRepeticion || this.contactos.has(idTecla(e)))) return;      // la repetición del sistema no es un toque nuevo
        const c0 = performance.now(); toques.nuevo(reloj.deEvento(e), 'teclado', esEspacio(e) ? 'ESPACIO' : 'ENTER');
        if (!this.activo) { toques.resolver(false, 'pausa'); return; }
        baja(idTecla(e), e, 'teclado'); toques.manejo.push(performance.now() - c0); if (toques.manejo.length > 64) toques.manejo.shift(); return;
      }
      if (!e.repeat) toques.nuevo(reloj.deEvento(e), 'teclado', esEspacio(e) ? 'ESPACIO' : 'ENTER');
    };
    this._kd = e => {
      if (!esTecla(e) || enCampo(e)) return;
      const T = toques.abierto, pend = !e.repeat && T && T.ok === null;
      // sobre un botón manda el botón (o ya lo activó el teclado del panel): cuenta como aceptado salvo que el botón diga otra cosa
      if (e.defaultPrevented || e.target.closest?.('button,input,select,textarea,label,a')) { if (pend) toques.resolver(true, 'boton', true); return; }
      e.preventDefault(); if (e.repeat) return;
      if (!this.activo) { if (pend) toques.resolver(false, 'pausa'); return; }
      baja(idTecla(e), e, 'teclado');
    };
    this._ku = e => { if (esTecla(e) && (!enCampo(e) || this.contactos.has(idTecla(e)))) { if (this.intento) e.preventDefault(); sube(idTecla(e), e); toques.suelta(); } };
    this._pd = e => {
      // un panel con botones o campos es para tocar esos botones; uno sin nada que tocar («Toca para seguir») cuenta como toque
      if (!this.activo || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest?.('button,input,select,textarea,label,a,[contenteditable]') || e.target.closest?.('.panel')?.querySelector('button,input,textarea,select,a')) return;
      const via = e.pointerType === 'mouse' ? 'mouse' : 'tactil';
      e.preventDefault(); toques.nuevo(reloj.deEvento(e), via, via === 'mouse' ? 'CLIC' : 'TOQUE');
      if (via === 'tactil' && this.intento) { try { navigator.vibrate?.(12); } catch { /* sin vibración */ } }
      baja('p' + e.pointerId, e, via);
    };
    this._pu = e => { if (this.contactos.has('p' + e.pointerId)) { sube('p' + e.pointerId, e); toques.suelta(); } };
    // el sistema canceló el puntero (lupa, desplazamiento, gesto): lo ya contado no se anula, y el dedo sigue apoyado
    // GRACIA_MS por si vuelve; después se levanta
    this._pc = e => {
      const id = 'p' + e.pointerId; if (!this.tolerante) return this._pu(e);
      if (!this.contactos.has(id) || this.gracia.has(id)) return;
      this.gracia.set(id, setTimeout(() => { this.gracia.delete(id); if (this.contactos.has(id)) { sube(id, null); toques.suelta(); } }, GRACIA_MS));
    };
    this._todo = e => { for (const id of [...this.contactos.keys()]) sube(id, e); };
    this._vis = () => { if (document.visibilityState !== 'visible') this._todo(null); };
    addEventListener('keydown', this._k0, true); addEventListener('keydown', this._kd); addEventListener('keyup', this._ku, true);
    for (const z of zonas) { z.addEventListener('pointerdown', this._pd); z.addEventListener('contextmenu', e => e.preventDefault()); }
    addEventListener('pointerup', this._pu); addEventListener('pointercancel', this._pc); addEventListener('blur', this._todo); document.addEventListener('visibilitychange', this._vis);
  }
  /** Hay un contacto que vale como gesto (teclado o dedo). */
  get apretado() { for (const v of this.contactos.values()) if (v !== 'mouse') return true; return false; }
}
/** Gracia de un puntero cancelado por el sistema (ms) y bordes de la pantalla (px: arriba, costados, abajo), que en 'u' cuentan igual. */
export const GRACIA_MS = 400;
export const BORDES = { arriba: 56, lado: 24, abajo: 20 };
/** El toque cae en un borde de la pantalla (docs/JUEGO.md G2.3). */
export function enBorde(e, w = innerWidth, h = innerHeight) { const x = e.clientX, y = e.clientY; return y < BORDES.arriba || y >= h - BORDES.abajo || x < BORDES.lado || x >= w - BORDES.lado; }

// ---------- teclado de los paneles ----------
const visibles = raiz => [...raiz.querySelectorAll('button:not(:disabled)')].filter(b => b.offsetParent !== null);
/**
 * Botón principal de un panel: el marcado con .ir, o el primero que no sea del selector ES · EN. Un panel que solo tiene
 * el selector de idioma (el podio en sus primeros 2,5 s) no enfoca nada: si no, el Espacio que saltea la espera
 * cambiaba el idioma.
 */
export const principal = raiz => { const bs = visibles(raiz); return bs.find(b => b.classList.contains('ir')) || bs.find(b => !b.classList.contains('idi')) || null; };
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
