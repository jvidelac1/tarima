// Ayudas del intento, pegadas a la barra (docs/JUEGO.md, sección 8.2): anillo de tensión, línea de potencia, anillo de
// recepción, palabra del gesto y medidores de pelea y de traba. Se leen por posición y por trama, no solo por color.
import { t } from '../i18n/t.js';
const F = "'Saira Condensed','Arial Narrow',sans-serif";
export class Ayudas {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.w = this.h = 0; this.sucio = false; canvas.style.visibility = 'hidden'; }
  _medir() { const w = this.cv.clientWidth, h = this.cv.clientHeight, d = Math.min(2, devicePixelRatio || 1); if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.cv.width = Math.round(w * d); this.cv.height = Math.round(h * d); } this.g.setTransform(d, 0, 0, d, 0, 0); }
  /**
   * Vacía el lienzo y lo saca de la composición. No lo reinicia (`width = width` lo realoja entero, y eso pasaba en medio
   * del intento cada vez que las ayudas aparecían o se iban): oculto, un búfer viejo no puede volver a mostrarse.
   */
  limpiar() { if (!this.sucio) return; this.sucio = false; this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.cv.width, this.cv.height); this.cv.style.visibility = 'hidden'; }
  /**
   * @param {object} a  bar {x,y} · anillo 0..1 (lleno en 1) · linea {y} y lineaLejos (0..1: cuánto falta) · rec 0..1 (cuánto falta para la recepción)
   *                    · palabra {txt, edad s, mal} · pelea {aguja, exi, franja, roja, P, T, L, modo} en milésimas y 0..1
   */
  dibujar(a) {
    if (!(a.anillo !== undefined || a.linea || a.rec !== undefined || (a.palabra && a.palabra.edad < 1.1) || a.pelea)) return this.limpiar();
    if (!this.sucio) { this.sucio = true; this.cv.style.visibility = ''; } this._medir(); this.g.clearRect(0, 0, this.w, this.h); const g = this.g, u = Math.max(9, Math.min(17, this.h * .017)), bx = a.bar?.x ?? this.w / 2, by = a.bar?.y ?? this.h / 2;
    g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (a.anillo !== undefined) {
      const R = u * 3.2, lleno = a.anillo > .9;
      g.lineWidth = u * .22; g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(bx, by, R, 0, 7); g.stroke();
      g.strokeStyle = lleno ? '#ffd23f' : '#35e6d6'; g.lineWidth = u * (lleno ? .5 : .3); g.beginPath(); g.arc(bx, by, Math.max(2, R * a.anillo), 0, 7); g.stroke();
    }
    if (a.linea) {
      const y = a.linea.y, cerca = a.lineaLejos !== undefined && a.lineaLejos < .12;
      g.setLineDash([u * .8, u * .5]); g.lineWidth = u * (cerca ? .35 : .2); g.strokeStyle = cerca ? '#ffd23f' : 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(bx - u * 9, y); g.lineTo(bx + u * 9, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(bx - u * 9.8, by); g.lineTo(bx - u * 11, by - u * .6); g.lineTo(bx - u * 11, by + u * .6); g.fill();
    }
    if (a.rec !== undefined) {
      const R = u * 2.2; g.lineWidth = u * .25; g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(bx, by, R, 0, 7); g.stroke();
      g.strokeStyle = a.rec < .08 ? '#ffd23f' : '#35e6d6'; g.lineWidth = u * .35; g.beginPath(); g.arc(bx, by, R * (1 + 2.5 * Math.max(0, a.rec)), 0, 7); g.stroke();
    }
    if (a.palabra && a.palabra.edad < 1.1) {
      g.globalAlpha = Math.min(1, (1.1 - a.palabra.edad) * 3); g.font = `800 ${u * 2}px ${F}`; g.lineWidth = u * .35; g.strokeStyle = '#020810'; g.fillStyle = a.palabra.mal ? '#ff6a5e' : '#fff';
      const y = by - u * 5 - a.palabra.edad * u; g.strokeText(a.palabra.txt, bx, y); g.fillText(a.palabra.txt, bx, y); g.globalAlpha = 1;
    }
    if (a.pelea) this._medidor(a.pelea, u);
  }
  _medidor(p, u) {
    const g = this.g, x = Math.min(this.w - u * 4.2, this.w * .5 + u * 15), y0 = this.h * .2, H = this.h * .5, W = u * 2, Y = v => y0 + H * (1 - v / 1000);
    g.fillStyle = 'rgba(6,14,48,.9)'; g.fillRect(x - u * .4, y0 - u * 1.6, W + u * .8, H + u * 3.4);
    g.fillStyle = '#3a4160'; g.fillRect(x, y0, W, H);
    if (p.modo === 'pelea') {
      const top = Y(Math.min(1000, p.exi + p.franja)), bot = Y(p.exi);
      // por encima de la franja: rojo rayado; por debajo: gris liso
      g.fillStyle = '#7a1d1a'; g.fillRect(x, y0, W, top - y0); g.save(); g.beginPath(); g.rect(x, y0, W, top - y0); g.clip(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5;
      for (let k = -H; k < H; k += u * .7) { g.beginPath(); g.moveTo(x, y0 + k); g.lineTo(x + W, y0 + k + W); g.stroke(); } g.restore();
      g.fillStyle = '#39d98a'; g.fillRect(x, top, W, bot - top); g.fillStyle = '#fff'; g.fillRect(x - u * .3, top - 1.5, W + u * .6, 3); g.fillRect(x - u * .3, bot - 1.5, W + u * .6, 3);
      // avance y temblor
      g.fillStyle = '#1a2040'; g.fillRect(x + W + u * .5, y0, u * .5, H); g.fillStyle = '#35e6d6'; g.fillRect(x + W + u * .5, y0 + H * (1 - p.P), u * .5, H * p.P);
      g.font = `700 ${u * .85}px ${F}`; g.fillStyle = p.T > .5 ? '#ff6a5e' : '#93a0cc'; g.fillText(p.T > .05 ? t('medidor.temblor', { n: Math.round(p.T * 100) }) : t('medidor.empuje'), x + W / 2, y0 + H + u);
    } else { g.fillStyle = '#35e6d6'; g.fillRect(x, Y(p.L * 1000), W, y0 + H - Y(p.L * 1000)); g.fillStyle = '#fff'; g.fillRect(x - u * .3, y0 - 1.5, W + u * .6, 3); g.font = `700 ${u * .85}px ${F}`; g.fillText(t('medidor.brazos'), x + W / 2, y0 + H + u); }
    if (p.L !== null && p.modo === 'pelea' && p.L < 1) { g.font = `700 ${u * .85}px ${F}`; g.fillStyle = '#ffd23f'; g.fillText(t('medidor.brazos_n', { n: Math.round(p.L * 100) }), x + W / 2, y0 - u * .8); }
    const ya = Y(p.aguja); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - u * .2, ya); g.lineTo(x - u * 1.4, ya - u * .7); g.lineTo(x - u * 1.4, ya + u * .7); g.fill();
  }
}
