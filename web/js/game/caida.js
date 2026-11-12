// Qué pasa con la barra y el pesista cuando termina un intento (docs/JUEGO.md 5.2 y 8.4), sin animaciones nuevas de Blender.
// APROXIMACIÓN HECHA EN EL VISOR, no pasó por check() de Blender (ver HANDOFF.md):
// - La barra suelta es un cuerpo con gravedad, rebote de los discos de goma contra la tarima y rodado con resistencia.
//   Aritmética simple con paso fijo: el mismo instante da siempre el mismo estado (la repetición vuelve a calcularlo).
// - El pesista solo usa poses de poses.json: sostiene la del fallo y después se mezcla en línea recta hacia «Parado»
//   (athlete.setMix). La barra se suelta ANTES de que el cuerpo se mueva, y sale hacia donde no está el cuerpo.
// - La raíz puede correrse unos centímetros (el salto hacia atrás de la barra adelante, el paso adelante de la barra atrás).
// Sin three ni DOM: lo usa el juego y lo prueba tools/caida_test.mjs.

export const GRAV = 9.81;
const PASO = 1 / 240;
const suave = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * Barra soltada. `y`, `z`: centro de la barra (m; +z es el frente del pesista). `vy`, `vz`: velocidad inicial (m/s).
 * `piso`: altura del centro apoyada (radio del disco más grande). `en(t)` lleva el estado a t segundos desde que se soltó;
 * si t es menor que el último pedido, vuelve a empezar (repetición en cámara lenta).
 */
export class BarraLibre {
  constructor({ y, z, vy = 0, vz = 0, piso = .225, rebote = .32, roceGolpe = .72, rodar = 1.1, vMin = .7, borde = 1.8 }) {
    this.o = { y: Math.max(y, piso), z, vy, vz, piso, rebote, roceGolpe, rodar, vMin, borde }; this.reset();
  }
  reset() { const o = this.o; this.t = 0; this.y = o.y; this.z = o.z; this.vy = o.vy; this.vz = o.vz; this.ang = 0; this.apoyada = false; this.quieta = false; this.golpes = []; }
  en(t) {
    if (t < this.t - 1e-9) this.reset();
    const o = this.o, R = o.piso;
    while (!this.quieta && this.t + PASO <= t + 1e-9) {
      this.t += PASO;
      if (!this.apoyada) {
        this.vy -= GRAV * PASO; this.y += this.vy * PASO; this.z += this.vz * PASO;
        if (this.y <= R) {
          const v = -this.vy; this.y = R; this.golpes.push({ t: this.t, v, z: this.z });
          if (v > o.vMin) { this.vy = v * o.rebote; this.vz *= o.roceGolpe; } else { this.vy = 0; this.apoyada = true; }
        }
      } else {
        const v = Math.abs(this.vz) - o.rodar * PASO; this.vz = v > 0 ? Math.sign(this.vz) * v : 0; this.z += this.vz * PASO;
        if (!this.vz) this.quieta = true;
      }
      if (Math.abs(this.z) > o.borde) { this.z = Math.sign(this.z) * o.borde; this.vz = -this.vz * .3; }
      if (this.golpes.length) this.ang += this.vz / R * PASO;      // desde que toca la tarima rueda sin deslizar (en el aire no gira)
    }
    if (this.quieta && t > this.t) this.t = t;
    return this;
  }
  /** Segundos hasta quedar quieta (para saber cuánto dura la escena). */
  get reposo() { const b = new BarraLibre(this.o); for (let x = .05; x < 8; x += .05) { b.en(x); if (b.quieta) return x; } return 8; }
}

/**
 * Cómo termina el intento. null: no hay nada que soltar (nulo por reloj sin levantar).
 * - bajo: tirón sin altura o anticipado; la barra está entre la rodilla y el pecho.
 * - hombros: la barra en los hombros con el pesista de pie (devuelve, o la flexión del envión que no sale).
 * - sentado: cargada perdida en el fondo (aplastado, la pierde en el fondo, barra adelante): se queda sentado y la suelta adelante.
 * - arriba: arranque o envión perdido con la barra por encima de la cabeza.
 * - bajada: levantamiento terminado (válido o nulo por los jueces): la deja caer adelante desde arriba.
 */
export function tipoCaida(res, mov) {
  if (!res) return null;
  if (res.res !== 'fallo') return res.causa === 'reloj' ? null : 'bajada';
  const c = res.causa;
  if (c === 'devuelve') return 'hombros';
  if (c === 'sin_altura' || c === 'anticipado') return mov === 'j' ? 'hombros' : 'bajo';
  return mov === 'c' ? 'sentado' : 'arriba';
}

/**
 * Plan de la escena: cuándo se suelta la barra y con qué velocidad, cuánto sostiene el pesista la pose del fallo
 * (`quieto`), en cuánto se mezcla hacia «Parado» (`mezcla`) y si la raíz se corre (`salto`: dz en m, desde y dur en s).
 * Las velocidades sacan la barra hacia donde no está el cuerpo: adelante (o atrás en «barra atrás») y lejos de rodillas y muslos.
 */
export function planCaida(tipo, causa, valido = false) {
  const P = {
    bajo: { suelta: 0, vy: 0, vz: .55, quieto: .15, mezcla: .8 },
    hombros: { suelta: 0, vy: .5, vz: 1.0, quieto: .25, mezcla: .85 },
    sentado: { suelta: 0, vy: .55, vz: 1.25, quieto: .8, mezcla: 1.05 },
    arriba: { suelta: 0, vy: .15, vz: .9, quieto: .5, mezcla: 1.0 },
    bajada: { suelta: valido ? .7 : .35, vy: .25, vz: .6, quieto: (valido ? .7 : .35) + .5, mezcla: .9 },
  }[tipo];
  if (!P) return null;
  const pl = { tipo, causa, ...P, salto: null };
  if (tipo === 'arriba' && causa === 'adelante') Object.assign(pl, { vz: 1.15, salto: { dz: -.14, desde: .05, dur: .32 } });
  if (tipo === 'arriba' && causa === 'atras') Object.assign(pl, { vz: -1.25, vy: .2, salto: { dz: .2, desde: .05, dur: .4 } });
  return pl;
}

/** Pose del pesista a t s del final: {i, j, u} es la pose del fallo (muestra fraccionaria g0), `k` el destino y `w` cuánto. */
export function poseCaida(pl, g0, destino, t) {
  const i = Math.floor(g0), u = g0 - i, w = t <= pl.quieto ? 0 : suave((t - pl.quieto) / pl.mezcla);
  let dz = 0, dy = 0;
  if (pl.salto) { const s = Math.min(1, Math.max(0, (t - pl.salto.desde) / pl.salto.dur)); dz = pl.salto.dz * suave(s); dy = .05 * Math.sin(Math.PI * s); }
  return { i, j: i + 1, u, k: destino, w, dz, dy };
}

/** Escena entera: plan, barra (desde que se suelta) y duración. `bar`: {y, z} de la barra dibujada en el instante final. */
export function armarCaida(res, mov, bar, piso) {
  const tipo = tipoCaida(res, mov); if (!tipo) return null;
  const pl = planCaida(tipo, res.causa, res.res === 'valido');
  const barra = new BarraLibre({ y: bar.y, z: bar.z, vy: pl.vy, vz: pl.vz, piso });
  const dur = Math.max(pl.quieto + pl.mezcla, pl.suelta + barra.reposo) + .1;
  return { tipo, pl, barra, dur };
}
