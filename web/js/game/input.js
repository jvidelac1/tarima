// Reloj del juego y botón único (docs/JUEGO.md, sección 3.1). El instante de cada gesto sale del evento del navegador, en
// ms, y no del cuadro dibujado. La fuente de tiempo es inyectable: las pruebas detienen el reloj y lo adelantan a mano.

/** Reloj sin recorte: performance.now(), o un tiempo manual para las pruebas. */
export const reloj = {
  manual: null, desfase: 0,
  ahora() { return this.manual !== null ? this.manual : performance.now() + this.desfase; },
  /** Instante de un evento del navegador (mismo origen que performance.now). */
  deEvento(e) { return this.manual !== null ? this.manual : (e && e.timeStamp > 0 ? e.timeStamp : performance.now()) + this.desfase; },
  /** Vuelve al reloj verdadero sin que el tiempo del juego salte hacia atrás. */
  soltar() { if (this.manual !== null) { this.desfase = this.manual - performance.now(); this.manual = null; } },
};

/**
 * Botón único: barra espaciadora y Enter, clic sobre el escenario y dedos sobre la zona táctil. Cada tecla y cada puntero es
 * un contacto; quien escucha recibe (t, 1) cuando se apoya uno y (t, 0) cuando se levanta. La repetición automática de la
 * tecla se ignora. Si la página pierde visibilidad o el sistema cancela un toque, los contactos se levantan.
 */
export class Boton {
  /** @param {HTMLElement[]} zonas elementos que valen como botón */
  constructor(zonas) {
    this.contactos = new Set(); this.oye = null; this.via = 'teclado'; this.activo = true;
    const baja = (id, e) => { if (this.contactos.has(id)) return; this.contactos.add(id); this.oye?.(reloj.deEvento(e), 1); };
    const sube = (id, e) => { if (!this.contactos.delete(id)) return; this.oye?.(reloj.deEvento(e), 0); };
    this._kd = e => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      if (e.target.closest?.('button,input,select,a')) { if (e.code === 'Space') return; return; }
      e.preventDefault(); if (e.repeat || !this.activo) return; this.via = 'teclado'; baja('k' + e.code, e);
    };
    this._ku = e => { if (e.code === 'Space' || e.code === 'Enter') sube('k' + e.code, e); };
    this._pd = e => { if (!this.activo || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest?.('button,input,select,a,.panel')) return; e.preventDefault(); this.via = e.pointerType === 'mouse' ? 'mouse' : 'tactil'; baja('p' + e.pointerId, e); };
    this._pu = e => sube('p' + e.pointerId, e);
    this._todo = e => { for (const id of [...this.contactos]) sube(id, e); };
    this._vis = () => { if (document.visibilityState !== 'visible') this._todo(null); };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
    for (const z of zonas) { z.addEventListener('pointerdown', this._pd); z.addEventListener('contextmenu', e => e.preventDefault()); }
    addEventListener('pointerup', this._pu); addEventListener('pointercancel', this._pu); addEventListener('blur', this._todo); document.addEventListener('visibilitychange', this._vis);
  }
  get apretado() { return this.contactos.size > 0; }
}
