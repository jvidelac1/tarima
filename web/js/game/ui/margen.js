// Margen a la vista en el levantamiento propio del nivel 'u' (docs/JUEGO.md, Gameplay 2, «Emoción»). Solo presentación: lo
// que dibuja sale del núcleo (m.U y su bitácora `log`), nunca lo decide.
//   - Arriba al centro (fuera del pulgar), la energía en tres puntos. Cada tramo que cierra apaga lo que gastó, con su palabra
//     («tirón −½», «pararse −1½ · pesó más» si tuvo mala suerte): el resultado se va viendo tramo a tramo, nunca antes.
//   - La ficha de la garra: apagada si ya se usó; en el FRENO late en dorado (y la escena se oscurece por los bordes).
//   - Al terminar: si cae, parpadea en rojo lo que faltó («Faltó ¼»); si vale, los discos que quedan brillan (en dorado si
//     fue al límite).
// Sin animaciones si la persona pidió movimiento reducido (solo cambia el número).
import { t, esc } from '../i18n/t.js';
import { cuartos } from './mensajes.js';

const MS = 380;      // lo que tarda un disco en apagarse
const lerp = (a, b, x) => a + (b - a) * x;
const suave = x => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);

export class Margen {
  /** @param {HTMLElement} el  contenedor (#margen) @param {{reduce?:boolean}} o */
  constructor(el, o = {}) { this.el = el; this.reduce = !!o.reduce; this.on = false; this.m = 3000; this.anim = null; this.pal = null; this.cola = []; }
  /** Prende el contador al empezar un intento propio: tres discos, y la garra si queda. */
  empezar({ garra = true, m = 3000 } = {}) {
    if (!this.el) return;
    this.on = true; this.m = m; this.anim = null; this.pal = null; this.cola = []; this.garra = garra ? 'disponible' : 'gastada'; this.estado = '';
    this.el.innerHTML = `<span class="m-t">${esc(t('margen.titulo'))}</span><span class="m-d"></span><span class="m-g">${esc(t('margen.garra_ficha'))}</span><span class="m-p" aria-live="off"></span>`;
    this.el.hidden = false; this.el.className = 'margen'; this._pintar(m);
  }
  /** Lleva el margen a `m` (animado) y dice `txt` debajo (clase: '', 'oro', 'mal', 'gris'). */
  ir(m, ahora, txt = null, clase = '') {
    if (!this.on) return;
    this.anim = this.reduce ? null : { de: this.anim ? this._valor(ahora) : this.m, a: m, t0: ahora };
    this.m = m; if (this.reduce) this._pintar(m);
    if (txt !== null) this.decir(txt, clase, ahora);
  }
  decir(txt, clase, ahora) {
    const p = this.el?.querySelector('.m-p'); if (!p) return;
    p.textContent = txt; p.className = 'm-p on ' + clase; this.pal = ahora;
  }
  /** Dice `txt` desde `cuando` (para que no tape la palabra del tramo que acaba de cerrar). */
  luego(txt, clase, cuando) { this.cola.push({ cuando, txt, clase }); }
  /** Un tramo cerró ({tramo, gasto, m} o {tramo, garra, m}, de m.U.log). */
  tramo(x, ahora) {
    if (x.garra) { this.garra = 'usada'; this._garra(); this.el.classList.add('garra-usada'); return this.ir(x.m, ahora, t('margen.garra', { d: cuartos(x.garra) }), 'oro'); }
    const nombre = t('margen.tramo.' + x.tramo), su = x.suerte || 0, clave = x.salva ? 'margen.b_salva' : x.zona ? 'margen.b_' + x.zona : x.esfuerzo ? 'margen.b_esfuerzo' : x.gasto <= 0 ? 'margen.gratis' : su >= 150 ? 'margen.mala' : su <= -150 ? 'margen.buena' : 'margen.gasto';
    // 'b': el tramo de una barrita dice dónde pegó («tirón −1¼ · regular»), en el color de la zona
    this.ir(x.m, ahora, t(clave, { tramo: nombre, d: cuartos(x.gasto) }), x.m < 0 ? 'mal' : x.salva || x.zona === 'verde' ? 'oro' : x.zona === 'rojo' ? 'mal' : su <= -150 ? 'oro' : '');
  }
  /** FRENO: la garra late; `on` false lo apaga. */
  freno(on) { if (!this.el) return; this.el.classList.toggle('freno', !!on); this._garra(); }
  /** Final del intento: `res` del núcleo. */
  fin(res, ahora) {
    if (!this.on || !res?.uno) return;
    const u = res.uno; this.freno(false);
    if (res.res === 'valido') { this.el.classList.add(u.al_limite ? 'limite' : 'vale'); return; }
    this.el.classList.add('cae'); this.decir(t('margen.falta', { d: cuartos(-u.margen_fin) }), 'mal', ahora);
  }
  ocultar() { if (!this.el) return; this.on = false; this.cola = []; this.el.hidden = true; this.el.innerHTML = ''; this.anim = null; }
  /** Cada cuadro: avanza la animación de los discos y apaga la palabra vieja. */
  cuadro(ahora) {
    if (!this.on) return;
    while (this.cola.length && ahora >= this.cola[0].cuando) { const x = this.cola.shift(); this.decir(x.txt, x.clase, ahora); }
    if (this.anim) { const x = suave((ahora - this.anim.t0) / MS); this._pintar(lerp(this.anim.de, this.anim.a, x)); if (x >= 1) this.anim = null; }
    if (this.pal !== null && ahora - this.pal > 1600) { const p = this.el.querySelector('.m-p'); if (p && !this.el.classList.contains('cae')) p.classList.remove('on'); this.pal = null; }
  }
  _valor(ahora) { const A = this.anim; return A ? lerp(A.de, A.a, suave((ahora - A.t0) / MS)) : this.m; }
  _garra() { const g = this.el?.querySelector('.m-g'); if (g) g.dataset.estado = this.garra; }
  /** Tres puntos de energía, cada uno lleno según lo que queda (`m` en milésimas). */
  _pintar(m) {
    const d = this.el?.querySelector('.m-d'); if (!d) return;
    const n = 3;
    while (d.children.length < n) d.appendChild(document.createElement('i'));
    while (d.children.length > n) d.lastChild.remove();
    for (let k = 0; k < n; k++) { const f = Math.max(0, Math.min(1, m / 1000 - k)), i = d.children[k]; i.style.setProperty('--f', f.toFixed(3)); i.classList.toggle('vacio', f <= 0); }
    d.classList.toggle('bajo', m < 0); this._garra();
  }
}
