// La señal (docs/CONTROLES.md, sección 5): siempre en el mismo lugar, dice qué tocar y cuándo. Verbo en imperativo, aro
// fijo con un círculo que se cierra sobre él, la tecla dibujada, el paso («2 de 3») y la palabra del último toque.
// Solo DOM: lo que muestra sale de senal() en controles.js, que es lo mismo que leen las pruebas y los bots.
const HTML = `<div class="s-paso"></div><div class="s-verbo"></div>
<div class="s-aro"><i class="s-fijo"></i><i class="s-cierra"></i><div class="s-teclas"><kbd class="tecla"></kbd><kbd class="tecla"></kbd><kbd class="tecla"></kbd></div><div class="s-avance"><b></b></div></div>
<div class="s-sub"></div><div class="s-pal"></div>`;

export class Senal {
  /** @param {HTMLElement} el  @param {boolean} tactil  sin teclado: la tecla dibujada dice TOCÁ */
  constructor(el, tactil = false) {
    this.el = el; el.innerHTML = HTML; this.tactil = tactil; this.clave = null; this.pal = null;
    const q = s => el.querySelector(s); this.paso = q('.s-paso'); this.verbo = q('.s-verbo'); this.cierra = q('.s-cierra'); this.sub = q('.s-sub'); this.palEl = q('.s-pal'); this.avance = q('.s-avance b');
    this.setTactil(tactil);
  }
  setTactil(t) { this.tactil = t; for (const k of this.el.querySelectorAll('.tecla')) k.textContent = t ? 'TOCÁ' : 'ESPACIO'; }
  ocultar() { if (!this.el.hidden) { this.el.hidden = true; this.clave = null; this.pal = null; this.palEl.textContent = ''; } }
  /**
   * @param {object|null} s   resultado de senal()   @param {number} now  ms del intento
   * @param {{txt:string, floja?:boolean, mal?:boolean, edad:number}|null} pal  palabra del último toque (edad en s)
   * @param {{parado?:boolean}} [o]  parado: el tutorial detuvo el reloj y espera el toque
   */
  pintar(s, now, pal, o = {}) {
    const vivo = pal && pal.edad < 1.3 ? pal : null;
    if (!s && !vivo) return this.ocultar();
    const el = this.el; el.hidden = false;
    const clave = s ? s.clave + '|' + s.tipo : '';
    if (clave !== this.clave) {
      this.clave = clave; el.dataset.tipo = s ? s.tipo : 'nada'; el.dataset.gesto = s?.gesto || '';
      this.paso.textContent = s && s.paso ? `${s.paso} de ${s.de}` : ''; this.verbo.textContent = s ? s.verbo : '';
      this.sub.textContent = s && s.sub ? s.sub.replace('{T}', this.tactil ? 'la pantalla' : 'ESPACIO').replace('Apretá la pantalla', 'Tocá la pantalla') : '';
    }
    let oro = false;
    if (s && s.tipo === 'cierre') {
      // de 2,1 veces el aro (cuando arranca) a 1 en el objetivo; después sigue achicándose hasta el límite
      const falta = s.objetivo - now, total = Math.max(1, s.objetivo - s.desde), k = o.parado ? 1 : falta >= 0 ? 1 + 1.1 * Math.min(1, falta / total) : 1 - .3 * Math.min(1, -falta / Math.max(1, s.lim));
      oro = o.parado || Math.abs(falta) <= s.perf;
      this.cierra.style.transform = `scale(${k.toFixed(3)})`; this.cierra.style.opacity = (falta >= 0 ? .45 + .55 * (1 - Math.min(1, falta / total)) : 1).toFixed(2);
    }
    if (s && s.tipo === 'empuja') this.avance.style.width = `${Math.round(Math.max(0, Math.min(1, s.avance)) * 100)}%`;
    el.classList.toggle('oro', oro); el.classList.toggle('parado', !!o.parado);
    const txt = vivo ? vivo.txt : '';
    if (txt !== this.pal) { this.pal = txt; this.palEl.textContent = txt; this.palEl.className = 's-pal' + (vivo ? (vivo.mal ? ' mal' : vivo.floja ? ' floja' : '') + ' ya' : ''); }
  }
}
