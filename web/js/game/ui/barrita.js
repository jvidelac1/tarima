// La barrita del nivel 'b' (docs/JUEGO.md, Gameplay 3): horizontal, grande y abajo al centro. Un puntero va y vuelve sobre
// tres zonas (rojo a rayas en las puntas, amarillo liso, verde con borde blanco en el centro). Solo presentación: las zonas,
// la posición del puntero y la zona de cada toque salen del núcleo (rules.js → posBarra, zonasBarra; m.U.barras), con la
// misma función de tiempo con la que el núcleo juzga el toque.
//   - El puntero se dibuja `adelanto` ms adelante del cuadro: lo que se ve cuando la pantalla lo muestra es dónde está el
//     puntero para el núcleo en ese instante (compensa el atraso del cuadro).
//   - Después del toque queda la marca de dónde pegaste y una palabra (¡PERFECTO!, REGULAR, LEJOS) hasta que la barrita se va.
//   - `fantasma`: la práctica del primer arranque de la primera final, un aro con la tecla sobre el verde que se llena cuando
//     el puntero pasa por el verde.
// Sin animaciones si la persona pidió movimiento reducido (el puntero se mueve igual: es el juego).
import { t } from '../i18n/t.js';
import { posBarra } from '../../sim/rules.js';

const HTML = `<div class="b-cab"><span class="b-nombre"></span><b class="b-verbo"></b><kbd class="tecla b-tecla"></kbd></div>
<div class="b-pista"><i class="b-am"></i><i class="b-ve"></i><i class="b-marca"></i><i class="b-punt"></i><div class="b-fant"><i></i><kbd class="tecla"></kbd></div></div>
<div class="b-pal"></div>`;

export class Barrita {
  /** @param {HTMLElement} el  contenedor (#barrita) @param {{reduce?:boolean}} o */
  constructor(el, o = {}) {
    this.el = el; this.reduce = !!o.reduce; this.tactil = false; this.clave = null; this.hasta = 0; this.zonaPintada = null; this.vistas = new Set();
    if (!el) return;
    el.innerHTML = HTML; const q = s => el.querySelector(s);
    this.nombre = q('.b-nombre'); this.verbo = q('.b-verbo'); this.tecla = q('.b-tecla'); this.pista = q('.b-pista'); this.am = q('.b-am'); this.ve = q('.b-ve'); this.marca = q('.b-marca'); this.punt = q('.b-punt'); this.pal = q('.b-pal'); this.fant = q('.b-fant');
  }
  setTactil(v) { this.tactil = !!v; if (this.el) { this.nombre.dataset.lento = t('barra.lento'); this.tecla.textContent = t(v ? 'tecla.toca' : 'tecla.espacio'); this.fant.querySelector('kbd').textContent = this.tecla.textContent; this.tecla.hidden = !!v; } }
  repintar() { this.setTactil(this.tactil); this.clave = null; }
  /** Zonas de la barrita (v, a en milésimas alrededor del centro): el ancho del amarillo y del verde. */
  _zonas(z) {
    const k = `${z.v}|${z.a}`; if (k === this.zonaPintada) return; this.zonaPintada = k;
    this.ve.style.left = `${(500 - z.v) / 10}%`; this.ve.style.width = `${z.v / 5}%`;
    this.am.style.left = `${(500 - z.a) / 10}%`; this.am.style.width = `${z.a / 5}%`;
    this.fant.style.left = '50%';
  }
  _puntero(pos) { this.punt.style.left = `${pos / 10}%`; }
  /**
   * Un cuadro. `s`: la señal de 'b' (controles.js, senalB) o null; `now`: ms del intento; `adelanto`: ms que tarda el cuadro
   * en verse; `U`: m.U (las barritas, con t0, zona y pos de cada una); `lev`; `ahora`: reloj del juego (para apagar la
   * palabra); `fantasma`: práctica con el aro sobre el verde.
   */
  pintar(s, now, adelanto, U, lev, ahora, fantasma = false) {
    if (!this.el) return;
    const B = U && U.barras, viva = s && (s.tipo === 'barra' || s.tipo === 'espera') && s.z ? s : null;
    // después del toque la barrita queda 1,4 s con la marca y la palabra; la siguiente (el envión) la reemplaza al aparecer
    const ult = B ? [...B].reverse().find(b => b.zona) : null;
    if (ult && !this.vistas.has(ult.i)) { this.vistas.add(ult.i); this.hasta = ahora + 1400; }      // la que salió sola (sin toque)
    if (!viva && !(ult && this.hasta && ahora < this.hasta)) return this.ocultar();
    const el = this.el; el.hidden = false;
    const i = viva ? viva.i : ult.i, b = B[i], clave = `${i}|${b.zona || ''}|${viva ? viva.tipo : 'fin'}`;
    if (clave !== this.clave) {
      this.clave = clave; this._zonas(b.z);
      el.dataset.estado = viva ? viva.tipo : 'fin'; el.dataset.zona = b.zona || '';
      this.nombre.textContent = t(`barra.nombre.${lev}${i}`) + (lev === 'c' ? ` · ${t('practica.paso', { n: i + 1, de: 2 })}` : '');
      this.verbo.textContent = b.zona ? '' : viva.verbo;      // PREPÁRATE / RESPIRA con la barrita quieta; TOCA EN EL VERDE cuando corre
      if (b.zona) {
        this.marca.hidden = false; this.marca.style.left = `${b.pos / 10}%`; this.marca.dataset.zona = b.zona;
        this.pal.textContent = b.sola ? t('barra.sola') : t('barra.' + b.zona); this.pal.className = 'b-pal on ' + b.zona;
        this._puntero(b.pos);
      } else { this.marca.hidden = true; this.pal.textContent = ''; this.pal.className = 'b-pal'; }
    }
    if (viva && viva.tipo === 'barra' && !b.zona) {
      const pos = posBarra(now + adelanto - viva.desde); this._puntero(pos);
      el.classList.toggle('lento', !!viva.lento);
      const dentro = Math.abs(pos - 500) <= b.z.v; el.classList.toggle('en-verde', dentro);
      this.fant.hidden = !fantasma; if (fantasma) this.fant.classList.toggle('ya', dentro);
    } else if (viva) { this._puntero(0); el.classList.remove('en-verde', 'lento'); this.fant.hidden = !fantasma; }
    else { el.classList.remove('en-verde', 'lento'); this.fant.hidden = true; }
  }
  /** Marca el toque recién juzgado (lo llama el manejador del toque, sin esperar al cuadro). */
  pega(i, zona, pos, ahora) {
    if (!this.el) return;
    this.vistas.add(i); this.hasta = ahora + 1400; this.clave = null;
    this.marca.hidden = false; this.marca.style.left = `${pos / 10}%`; this.marca.dataset.zona = zona; this._puntero(pos);
    this.el.dataset.zona = zona; this.pal.textContent = t('barra.' + zona); this.pal.className = 'b-pal on ' + zona;
    if (!this.reduce) { this.el.classList.remove('golpe'); void this.el.offsetWidth; this.el.classList.add('golpe'); }
  }
  ocultar() { if (this.el && !this.el.hidden) { this.el.hidden = true; this.clave = null; this.el.classList.remove('golpe', 'en-verde', 'lento'); } }
  /** Al empezar un intento: sin marca vieja. */
  empezar() { this.hasta = 0; this.clave = null; this.vistas.clear(); this.ocultar(); }
}
