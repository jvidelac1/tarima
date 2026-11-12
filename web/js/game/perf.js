// Calidad y medición de cuadros del juego (docs/JUEGO.md, sección 8.7). El juego prioriza cuadros sobre efectos: arranca en
// «Baja» (sin oclusión, desenfoque ni resplandor) y un gobernador baja resolución y después más efectos solo si el
// navegador no llega al refresco de la pantalla. Nunca sube solo, y main.js no cambia nada en medio de un intento.
import { QUALITY } from '../config.js';

/** Debajo de «baja»: pensado para un teléfono. Valores iniciales sin medir en un teléfono real. */
export const MOVIL = { label: 'Móvil', dpr: 1.5, maxPixels: 1280 * 720, msaa: 2, shadow: 512, shadowR: 4.5, shadow2: 0, ao: 0, aoScale: .5, dof: 0, dofSamples: 0, bloom: false, smaa: false, crowd: .3, beams: false, aniso: 2, tex: 1024 };
const PRESET = { movil: MOVIL, ...QUALITY };
/** Escalones del modo automático, del más barato al más caro. `s`: fracción de resolución (bajar píxeles no rehace los pases). */
export const ESCALONES = [{ q: 'movil', s: .6 }, { q: 'movil', s: .8 }, { q: 'movil', s: 1 }, { q: 'baja', s: .8 }, { q: 'baja', s: 1 }];
export const nombreDe = e => PRESET[e.q].label + (e.s < 1 ? ` ${Math.round(e.s * 100)} %` : '');
export const presetDe = e => PRESET[e.q];
/**
 * Calidad de arranque. Con `?q=alta|media|baja|movil` queda fija (sin gobernador); sin el parámetro es automática y
 * empieza en el escalón más caro de la escalera («Baja»), o en «Móvil» con puntero grueso.
 * @returns {{auto:boolean, i:number, Q:object, s:number, nombre:string}}
 */
export function calidadInicial(pedida) {
  if (PRESET[pedida]) return { auto: false, i: -1, Q: PRESET[pedida], s: 1, nombre: PRESET[pedida].label };
  const i = matchMedia('(pointer:coarse)').matches ? 2 : ESCALONES.length - 1, e = ESCALONES[i];
  return { auto: true, i, Q: PRESET[e.q], s: e.s, nombre: nombreDe(e) };
}

/** Refresco de la pantalla (Hz): mediana de intervalos de requestAnimationFrame sin dibujar nada. 60 si no se puede medir. */
export function medirRefresco(n = 24) {
  const HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  return new Promise(res => {
    const ts = []; let listo = false; const fin = hz => { if (!listo) { listo = true; res(hz); } };
    setTimeout(() => fin(60), 1500);      // pestaña oculta o navegador que no da cuadros
    const f = t => {
      if (listo) return; ts.push(t); if (ts.length <= n) { requestAnimationFrame(f); return; }
      const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b), hz = 1000 / d[d.length >> 1], cerca = HZ.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
      fin(Math.abs(cerca - hz) / cerca < .08 ? cerca : 60);
    };
    requestAnimationFrame(f);
  });
}
/** Cuadros por segundo que se le piden al juego: el refresco, o la mitad en pantallas de más de 90 Hz. */
export const metaDe = hz => (hz > 90 ? hz / 2 : hz);

/**
 * Gobernador: mira los cuadros dibujados en ventanas de 1 s y pide bajar un escalón cuando dos ventanas seguidas quedan
 * por debajo del 80 % de la meta. Solo pide: el cambio lo aplica main.js cuando no hay un intento en curso.
 */
export class Gobernador {
  constructor(hz) { this.hz = hz; this.meta = metaDe(hz); this.t = 0; this.n = 0; this.lentas = 0; this.hasta = 0; this.pide = false; this.fps = 0; }
  /** Descarta lo medido hasta dentro de `ms`: después de cargar o de cambiar de calidad los primeros cuadros compilan shaders. */
  calentar(now, ms = 2500) { this.hasta = now + ms; this.t = this.n = this.lentas = 0; this.pide = false; }
  /** @param {number} ms tiempo desde el cuadro dibujado anterior  @returns {boolean} hay que bajar un escalón */
  cuadro(ms, now) {
    if (ms > 250 || now < this.hasta) { this.t = this.n = 0; return this.pide; }      // una pausa o un panel no son lentitud
    this.t += ms; this.n++;
    if (this.t >= 1000) { this.fps = this.n * 1000 / this.t; this.t = this.n = 0; this.lentas = this.fps < this.meta * .8 ? this.lentas + 1 : 0; if (this.lentas >= 2) { this.pide = true; this.lentas = 0; } }
    return this.pide;
  }
}

/** Registrador: cuadros por segundo por tramo de la partida, y lo del último segundo (ofrecidos por el navegador y dibujados). */
export class Registrador {
  constructor() { this.tramos = {}; this.tramo = 'inicio'; this.v = { t0: 0, of: 0, dib: 0, suma: 0, max: 0 }; this.ult = { ofrecidos: 0, dibujados: 0, ms: 0, max: 0 }; }
  marcar(nombre) { this.tramo = nombre; }
  /** Un cuadro de requestAnimationFrame (se haya dibujado o no). `now`: performance.now(). */
  ofrecido(now) {
    const v = this.v; if (!v.t0) v.t0 = now; v.of++; if (now - v.t0 < 1000) return;
    const seg = (now - v.t0) / 1000; this.ult = { ofrecidos: Math.round(v.of / seg), dibujados: Math.round(v.dib / seg), ms: v.dib ? v.suma / v.dib : 0, max: v.max };
    v.t0 = now; v.of = v.dib = v.suma = v.max = 0;
  }
  /** dt de un cuadro dibujado, en ms. */
  cuadro(ms) {
    if (ms <= 0 || ms > 1000) return; const v = this.v; v.dib++; v.suma += ms; if (ms > v.max) v.max = ms;
    (this.tramos[this.tramo] ||= []).push(ms); if (this.tramos[this.tramo].length > 20000) this.tramos[this.tramo].splice(0, 10000);
  }
  /** Mínimo y mediana de cuadros por segundo por tramo. */
  resumen() { const o = {}; for (const [k, v] of Object.entries(this.tramos)) { const s = v.slice().sort((a, b) => a - b); o[k] = { n: s.length, mediana: Math.round(1000 / s[s.length >> 1]), minimo: Math.round(1000 / s[s.length - 1]) }; } return o; }
}
