// La señal (docs/CONTROLES.md, sección 5): siempre en el mismo lugar, dice qué tocar y cuándo. Verbo en imperativo, aro
// fijo con un círculo que se cierra sobre él a ritmo parejo, la franja dorada donde el toque sale BIEN (y una más clara
// para PERFECTO), la cuenta 3-2-1, la tecla dibujada, el paso («2 de 3») y la palabra del último toque. Mientras la
// ventana de la señal no abrió el círculo va apagado: un toque ahí no cuenta («todavía no»).
// Solo DOM: lo que muestra sale de senal() en controles.js, que es lo mismo que leen las pruebas y los bots.
import { t } from '../i18n/t.js';
import { conTecla } from './mensajes.js';
const HTML = `<div class="s-paso"></div><div class="s-verbo"></div>
<div class="s-aro"><i class="s-franja"></i><i class="s-franja s-perf"></i><i class="s-fijo"></i><i class="s-cierra"></i><b class="s-cuenta"></b><div class="s-teclas"><kbd class="tecla"></kbd><kbd class="tecla"></kbd><kbd class="tecla"></kbd></div><div class="s-avance"><b></b><i></i></div></div>
<div class="s-sub"></div><div class="s-pal"></div>`;

export class Senal {
  /** @param {HTMLElement} el  @param {boolean} tactil  sin teclado: la tecla dibujada dice TOCA */
  constructor(el, tactil = false) {
    this.el = el; el.innerHTML = HTML; this.tactil = tactil; this.clave = null; this.pal = null;
    const q = s => el.querySelector(s); this.paso = q('.s-paso'); this.verbo = q('.s-verbo'); this.cierra = q('.s-cierra'); this.sub = q('.s-sub'); this.palEl = q('.s-pal'); this.avance = q('.s-avance b'); this.piso = q('.s-avance i'); this.subTxt = this.subBase = '';
    [this.franja, this.franjaP] = el.querySelectorAll('.s-franja'); this.cuenta = q('.s-cuenta'); this.franjaDe = null; this.cuentaTxt = null;
    this.setTactil(tactil);
  }
  setTactil(v) { this.tactil = v; for (const k of this.el.querySelectorAll('.tecla')) k.textContent = t(v ? 'tecla.toca' : 'tecla.espacio'); }
  /** Cambió el idioma: la tecla dibujada y, en el próximo cuadro, el verbo y la línea de abajo. */
  repintar() { this.setTactil(this.tactil); this.clave = null; this.subTxt = null; }
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
      this.clave = clave; el.dataset.tipo = s ? s.tipo : 'nada'; el.dataset.clave = s ? s.clave : ''; el.classList.toggle('sale', !!(s && s.tipo === 'libre' && s.sale && s.desde !== undefined)); el.dataset.gesto = s?.gesto || ''; el.dataset.largo = s && s.verbo.length > 12 ? '1' : '';      // «APRETÁ Y MANTENÉ» no entra a tamaño completo
      this.paso.textContent = s && s.paso ? t('practica.paso', { n: s.paso, de: s.de }) : ''; this.verbo.textContent = s ? s.verbo : '';
      this.subBase = s && s.sub ? conTecla(s.sub, this.tactil) : ''; this.subTxt = null;
    }
    // toque libre con plazo: en los últimos 10 s (5 en los hombros) la línea de abajo cuenta lo que queda
    const queda = s && s.tipo === 'libre' && s.vence && !s.sale ? s.vence - now : Infinity, apuro = queda <= (s && s.clave === 'flexiona' ? 5000 : 10000);
    const sub = apuro ? t('senal.quedan', { s: Math.max(0, Math.ceil(queda / 1000)), tactil: this.tactil }) : this.subBase;
    if (sub !== this.subTxt) { this.subTxt = sub; this.sub.textContent = sub; el.classList.toggle('apuro', apuro); }
    let oro = false, cuenta = '', abierta = true;
    if (s && s.tipo === 'cierre') {
      // a ritmo parejo: de 1,6 veces el aro (cuando arranca) a 1 en el objetivo, y sigue achicándose igual de rápido hasta el límite
      const obj = s.visto ?? s.objetivo, falta = obj - now, total = Math.max(1, obj - s.desde), vel = .6 / total, k = o.parado ? 1 : Math.max(.4, 1 + vel * Math.min(falta, total));
      abierta = o.parado || s.abre === undefined || now >= s.abre;
      oro = o.parado || Math.abs(falta) <= s.perf;
      this.cierra.style.transform = `scale(${k.toFixed(3)})`; this.cierra.style.opacity = abierta ? '1' : (.3 + .25 * (1 - Math.min(1, falta / total))).toFixed(2);
      // la franja de BIEN (y la de PERFECTO) en la misma escala que el círculo: el toque sale bien mientras el borde la cruza
      const fk = `${s.desde}|${obj}`;
      if (fk !== this.franjaDe) {
        this.franjaDe = fk;
        const banda = (el, w) => {
          const antes = Math.min(w, Math.max(0, obj - Math.max((s.abre ?? -Infinity) - (s.objetivo - obj), s.desde))), ko = Math.min(1.6, 1 + vel * antes), ki = Math.max(.4, 1 - vel * w);
          el.hidden = !(w > 0); el.style.setProperty('--ko', ko.toFixed(3)); el.style.setProperty('--kb', ((ko - ki) / 2).toFixed(3));
        };
        banda(this.franja, s.bien ?? 0); banda(this.franjaP, s.perf ?? 0);
      }
      // cuenta 3-2-1 en tercios parejos del cierre; en el objetivo, nada (el aro se pone dorado)
      if (!o.parado && falta > 0) cuenta = String(Math.min(3, Math.ceil(falta / (total / 3))));
    }
    if (cuenta !== this.cuentaTxt) { this.cuentaTxt = cuenta; this.cuenta.textContent = cuenta; if (cuenta) { this.cuenta.classList.remove('late'); void this.cuenta.offsetWidth; this.cuenta.classList.add('late'); } }
    el.classList.toggle('cerrada', !abierta);
    if (s && s.tipo === 'empuja') { this.avance.style.width = `${Math.round(Math.max(0, Math.min(1, s.avance)) * 100)}%`; this.piso.style.width = `${Math.round((s.piso || 0) * 100)}%`; }
    // 'u': ¡PÁRATE! muestra la barra subiendo; ¡TIRA! y ¡ARRIBA!, lo que falta para que salgan solas (sin apuro: si se llena,
    // el pesista lo hace solo y no pasa nada malo). ¡SALTA! no tiene barra: no hay un momento justo que marcar
    else if (s && (s.tipo === 'uno' || (s.tipo === 'libre' && s.sale && s.desde !== undefined))) {
      const k = s.tipo === 'uno' ? s.avance : (now - s.desde) / Math.max(1, s.vence - s.desde);
      this.avance.style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`; this.piso.style.width = '0%';
    }
    el.classList.toggle('guardado', !!(s && s.guardado));
    el.classList.toggle('oro', oro); el.classList.toggle('parado', !!o.parado);
    const txt = vivo ? vivo.txt : '';
    if (txt !== this.pal) { this.pal = txt; this.palEl.textContent = txt; this.palEl.className = 's-pal' + (vivo ? (vivo.mal ? ' mal' : vivo.floja ? ' floja' : vivo.gris ? ' gris' : '') + ' ya' : ''); }
  }
}
