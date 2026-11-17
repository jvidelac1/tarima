// Cámara con sensación (LIF-38): temblor por «trauma» y un pequeño dip con resorte. No decide el encuadre: el rig de
// cameras.js arma la cámara de cero en cada cuadro y esto le suma, después, un corrimiento chico que se apaga solo.
// - Temblor: `golpe(k)` suma trauma (0 a 1); la amplitud va con el cuadrado del trauma (los golpes chicos casi no se ven,
//   los grandes sí) y el trauma se gasta en medio segundo. El movimiento es una suma de senos, sin azar: mismo golpe, mismo
//   temblor (las capturas de las pruebas no cambian de una corrida a otra).
// - Dip: `dip(k)` le da un empujón hacia abajo a un resorte amortiguado; la cámara baja un poco y vuelve sin rebotar de más.
// Todo se mide en fracción del alto de la imagen, no en metros: se ve igual con un lente largo que con uno corto.
// Con movimiento reducido (prefers-reduced-motion) no hace nada.

/** Fracción del alto de la imagen que se mueve la cámara con trauma 1 (1,4 %: unos 12 px en 845 de alto). */
export const TEMBLOR_MAX = .014;
/** Trauma que se gasta por segundo. */
export const TEMBLOR_GASTO = 1.9;
/** Resorte del dip: rigidez y amortiguación (frecuencia propia ~1,8 Hz, amortiguación 0,65: baja, vuelve y casi no pasa de largo). */
export const DIP_K = 125, DIP_C = 14.5;
/** Empujón de un dip de fuerza 1 (fracción del alto por segundo): baja como mucho ~1,2 % del alto. */
export const DIP_V = .25;

export class CamaraViva {
  constructor({ reduceMotion = false } = {}) { this.reduce = reduceMotion; this.trauma = 0; this.y = 0; this.vy = 0; this.t = 0; }
  /** Suma trauma (0 a 1): la barra contra la tarima. */
  golpe(k = .5) { if (!this.reduce && k > 0) this.trauma = Math.min(1, this.trauma + k); }
  /** Empujón hacia abajo: el pesista recibe la barra. */
  dip(k = 1) { if (!this.reduce) this.vy -= DIP_V * k; }
  /** Está quieta (nada que sumar). */
  get quieta() { return this.trauma <= 0 && Math.abs(this.y) < 1e-5 && Math.abs(this.vy) < 1e-4; }
  /** Avanza `dt` s y devuelve el corrimiento de este cuadro: {x, y} en fracción del alto y `giro` (rad) sobre el eje de la mirada. */
  paso(dt) {
    const o = this._o ||= { x: 0, y: 0, giro: 0 }; o.x = o.y = o.giro = 0;
    if (this.reduce || this.quieta) { this.trauma = 0; this.y = this.vy = 0; return o; }
    dt = Math.min(.05, Math.max(0, dt)); this.t += dt;
    // resorte del dip, en pasos cortos (estable aunque el cuadro sea largo)
    for (let n = Math.max(1, Math.ceil(dt / .008)), h = dt / n, k = 0; k < n; k++) { this.vy += (-DIP_K * this.y - DIP_C * this.vy) * h; this.y += this.vy * h; }
    const a = this.trauma * this.trauma * TEMBLOR_MAX, t = this.t;
    o.x = a * (Math.sin(t * 71.3) * .6 + Math.sin(t * 113.7 + 1.3) * .4);
    o.y = a * (Math.sin(t * 83.9 + .7) * .6 + Math.sin(t * 127.1 + 2.1) * .4) + this.y;
    o.giro = a * .35 * Math.sin(t * 59.3 + .4);
    this.trauma = Math.max(0, this.trauma - TEMBLOR_GASTO * dt);
    return o;
  }
  /**
   * Suma el corrimiento a una cámara de perspectiva ya armada. `d`: distancia al sujeto (m): con ella la fracción del alto
   * pasa a metros. Mueve la cámara en su propio plano (no cambia hacia dónde mira) y la inclina apenas.
   */
  aplicar(cam, dt, d = 6) {
    const o = this.paso(dt); if (!o.x && !o.y && !o.giro) return false;
    const alto = 2 * Math.max(.5, d) * Math.tan(cam.fov * Math.PI / 360);
    cam.translateX(o.x * alto); cam.translateY(o.y * alto); cam.rotateZ(o.giro); cam.updateMatrixWorld();
    return true;
  }
}
