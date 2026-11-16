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
 * Barra que el pesista BAJA CON LAS MANOS antes de soltarla (levantamiento terminado: válido o nulo de los jueces). Como en una
 * tarima de verdad: afloja los codos y la barra baja por delante, pegada al cuerpo, de arriba de la cabeza (`y0`, `z0`) a la
 * altura del pecho (`y1`, `z1`) en `dur` s, cada vez más rápido; ahí la suelta hacia adelante y cae sola (BarraLibre, con la
 * velocidad que traía). Misma interfaz que BarraLibre; `guiada` vale true mientras va en las manos.
 */
export class BarraGuiada {
  constructor({ y0, z0, y1, z1, dur, vz = .45, piso = .225 }) {
    this.g = { y0, z0, y1: Math.max(y1, piso + .3), z1, dur }; const G = this.g;
    this.libre = new BarraLibre({ y: G.y1, z: G.z1, vy: -2 * (G.y0 - G.y1) / dur, vz, piso }); this.en(0);
  }
  en(t) {
    const G = this.g;
    if (t < G.dur) { const u = Math.max(0, t / G.dur), k = u * u, kz = u * u * (3 - 2 * u); this.libre.reset(); Object.assign(this, { guiada: true, y: G.y0 + (G.y1 - G.y0) * k, z: G.z0 + (G.z1 - G.z0) * kz, ang: 0, apoyada: false, quieta: false, golpes: [] }); return this; }
    const L = this.libre.en(t - G.dur);
    Object.assign(this, { guiada: false, y: L.y, z: L.z, ang: L.ang, apoyada: L.apoyada, quieta: L.quieta, golpes: L.golpes.map(x => ({ ...x, t: x.t + G.dur })) }); return this;
  }
  get reposo() { return this.g.dur + this.libre.reposo; }
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
  const pl = { tipo, causa, ...P, salto: null, valido };
  if (tipo === 'arriba' && causa === 'adelante') Object.assign(pl, { vz: 1.15, salto: { dz: -.14, desde: .05, dur: .32 } });
  if (tipo === 'arriba' && causa === 'atras') Object.assign(pl, { vz: -1.25, vy: .2, salto: { dz: .2, desde: .05, dur: .4 } });
  return pl;
}

/**
 * Reglas del cuerpo después de soltar (sin ellas, la mezcla en línea recta de antes: los brazos quedaban arriba medio
 * segundo sin la barra y bajaban en cruz, y los pies se arrastraban desde la tijera o la sentadilla hasta juntarse).
 * Con `R` (muestras globales del clip, las arma main.js con los nombres de las fases; nada por personaje):
 * - Los BRAZOS acompañan la barra: desde que se suelta desandan el clip por sus fases, de la pose del final a la de
 *   brazos estirados con la barra colgando (`R.brazosA`: la triple extensión; en el envión no desandan: ver main.js), pasando por
 *   la pose de cada fase anterior a la recepción (`R.brazosDe`) a `DESANDAR` s por fase, con arranque y llegada suaves;
 *   después van a «Parado» con el resto del cuerpo. Las manos salen `MANOS` s después que la barra: van detrás de ella y
 *   no por delante (en el envión, sin esa espera, los antebrazos cruzaban la barra que caía: BAD en check_escenas). Van de fase en fase y no muestra por muestra: el giro de codos del clip
 *   ocupa dos muestras y, desandado a esa velocidad, era un latigazo (58° en un cuadro, la mano a 13 m/s).
 * - El CUERPO se para por el clip: si el final lo encontró de la recepción en adelante (`R.rec`), sigue el clip hasta el
 *   final del segmento (`R.fin`: la recuperación validada, con los pies donde van) a `PARARSE` s por fase; recién ahí pasa
 *   a «Parado», y lo que les falta a los pies lo hacen en un saltito (`SALTITO`: la raíz sube y la mezcla ocurre en el aire).
 */
export const PARARSE = .8, DESANDAR = .24, MANOS = .2, SALTITO = { dur: .3, alto: .04 };
/**
 * Con la barra soltada desde arriba de la cabeza (`bajada` y `arriba`) los brazos NO desandan el clip (pasaban por codos
 * altos, «doble bíceps», y por la cruz): BARREN por delante, de arriba hacia abajo, detrás de la barra que cae, en
 * `BARRIDO.dur` s (stage.js los apunta por regla: brazo y antebrazo siguen un arco en el plano del frente).
 * Después, el GESTO (también por regla, sobre los huesos, igual para cualquier biotipo): válido = dos puños que suben y
 * marcan dos veces («¡vamos!»), y los brazos vuelven a colgar; nulo o fallo = la cabeza cae, los hombros se vencen y niega
 * con la cabeza. Tiempos en s desde que terminan de bajar los brazos.
 */
// BARRIDO.espera: s más que MANOS; la barra ya pasó por debajo de los hombros cuando los brazos bajan por delante (check_escenas)
/**
 * BAJADA (levantamiento terminado): la barra baja en las manos `GUIA.dur` s hasta el pecho, `GUIA.adelante` m por delante de
 * los hombros y `GUIA.bajo` m por debajo (BarraGuiada); las manos la acompañan (stage.js: los brazos se resuelven con la mano
 * en la barra), la sueltan, quedan abiertas al frente `GUIA.abiertas` s y bajan en `GUIA.cuelgan` s; el pesista da un paso
 * corto hacia atrás (`GUIA.paso` m) mientras la barra cae.
 */
export const GUIA = { dur: .5, adelante: .3, bajo: .14, abiertas: .16, cuelgan: .45, paso: -.11 };
export const BARRIDO = { dur: .55, espera: .22 }, GESTO = { festejo: { sube: .28, dura: 1.0, baja: .45 }, bronca: { sube: .5 } };
/** Lo que tarda en pasar a «Parado» (s): con saltito, medio segundo como mucho (el saltito va en el medio). */
const mezclaDe = (pl, g0, R) => (R && g0 >= R.rec ? Math.min(pl.mezcla, SALTITO.dur + .2) : pl.mezcla);
/** Poses (muestras globales) por las que pasan los brazos: la del final y la de cada fase anterior, hasta `R.brazosA`. */
export function clavesBrazos(g0, R) {
  const k = [g0]; if (!R || g0 <= R.brazosA) return k;
  for (let g = Math.min(R.brazosDe - R.sub, Math.floor((g0 - R.sub / 2) / R.sub) * R.sub); g >= R.brazosA; g -= R.sub) k.push(g);
  return k;
}
/** Tiempos (s desde el final) de las reglas de arriba: cuándo termina de pararse y cuándo llega a «Parado». */
export function tiemposCaida(pl, g0, R) {
  if (!R) return { sube: 0, fin: pl.quieto + pl.mezcla };
  const sube = g0 >= R.rec && g0 < R.fin ? (R.fin - g0) / R.sub * PARARSE : 0;
  return { sube, fin: pl.quieto + sube + mezclaDe(pl, g0, R) };
}
/**
 * Pose del pesista a t s del final: {i, j, u} es la pose del fallo (muestra fraccionaria g0), `k` el destino y `w` cuánto.
 * Con las reglas `R`, además `brazos` ({i, u, k, w} para los huesos de los brazos) y el cuerpo que sigue el clip.
 */
export function poseCaida(pl, g0, destino, t, R = null) {
  let dz = 0, dy = 0;
  if (pl.salto) { const s = Math.min(1, Math.max(0, (t - pl.salto.desde) / pl.salto.dur)); dz = pl.salto.dz * suave(s); dy = .05 * Math.sin(Math.PI * s); }
  if (!R) { const i = Math.floor(g0), w = t <= pl.quieto ? 0 : suave((t - pl.quieto) / pl.mezcla); return { i, j: i + 1, u: g0 - i, k: destino, w, dz, dy, t }; }
  const T = tiemposCaida(pl, g0, R), tM = pl.quieto + T.sube, mz = mezclaDe(pl, g0, R);
  // cuerpo: quieto, se para por el clip y pasa a «Parado» (con saltito si venía de una recepción: los pies no se arrastran)
  const gC = T.sube ? g0 + (R.fin - g0) * suave((t - pl.quieto) / T.sube) : g0, conSalto = g0 >= R.rec, dur = conSalto ? SALTITO.dur : mz, t0 = conSalto ? tM + (mz - SALTITO.dur) / 2 : tM;
  const s = Math.min(1, Math.max(0, (t - t0) / dur)), w = suave(s); if (conSalto) dy += SALTITO.alto * Math.sin(Math.PI * s);
  // brazos: desandan el clip desde que se suelta la barra y después bajan a «Parado» mientras el cuerpo llega
  const K = clavesBrazos(g0, R), n = K.length - 1, tD = n * DESANDAR, tb = t - pl.suelta - MANOS, x = tb <= 0 || !n ? 0 : suave(tb / tD) * n, kB = Math.min(Math.max(0, n - 1), Math.floor(x));
  const tBajar = pl.suelta + MANOS + tD, wB = suave((t - tBajar) / Math.min(.8, Math.max(.3, tM + mz - tBajar)));
  if (pl.tipo === 'bajada' && pl.guia) {
    // bajada controlada: las manos van con la barra hasta soltarla, quedan abiertas al frente y cuelgan; después, el gesto
    const G = pl.guia, i = Math.floor(gC), f0 = Math.floor(g0), ta = t - pl.suelta, u = Math.min(1, Math.max(0, ta / G.dur)), ts = ta - G.dur, wP = suave(ta / (G.dur + GUIA.abiertas));
    const mano = ta < 0 ? null : { y: G.y0 + (G.y1 - G.y0) * u * u, z: G.z0 + (G.z1 - G.z0) * suave(u), w: suave(ta / .08) * (1 - suave((ts - GUIA.abiertas) / GUIA.cuelgan)), dedos: suave(ts / .12) };
    const tG = ts - GUIA.abiertas - GUIA.cuelgan * .8; let gesto = null;
    if (tG > 0) { if (pl.valido) { const F = GESTO.festejo; gesto = { tipo: 'festejo', w: suave(tG / F.sube) * (1 - suave((tG - F.sube - F.dura) / F.baja)), t: tG, dedos: f0 }; } else gesto = { tipo: 'bronca', w: suave(tG / GESTO.bronca.sube), t: tG }; }
    return { i, j: i + 1, u: gC - i, k: destino, w, dz, dy, t, brazos: { i: f0, j: f0 + 1, u: g0 - f0, k: destino, w: wP }, mano, gesto };
  }
  if (pl.tipo === 'bajada' || pl.tipo === 'arriba') {
    // barrido: los brazos quedan en la pose del final (stage.js los apunta) y al llegar abajo pasan a «Parado»
    const tq = tb - BARRIDO.espera, x = suave(tq / BARRIDO.dur), wP = suave((tq - BARRIDO.dur * .7) / (BARRIDO.dur * .45)), tG = t - (pl.suelta + MANOS + BARRIDO.espera + BARRIDO.dur * 1.1), i = Math.floor(gC), f0 = Math.floor(g0);
    let gesto = null;
    if (tG > 0) { if (pl.valido) { const F = GESTO.festejo; gesto = { tipo: 'festejo', w: suave(tG / F.sube) * (1 - suave((tG - F.sube - F.dura) / F.baja)), t: tG, dedos: f0 }; } else gesto = { tipo: 'bronca', w: suave(tG / GESTO.bronca.sube), t: tG }; }
    return { i, j: i + 1, u: gC - i, k: destino, w, dz, dy, t, brazos: { i: f0, j: f0 + 1, u: g0 - f0, k: destino, w: wP }, barrido: tq > 0 ? { x, w: suave(tq / .1) * (1 - wP) } : null, gesto };
  }
  const i = Math.floor(gC), a0 = K[kB], a1 = K[Math.min(n, kB + 1)], f0 = Math.floor(a0);
  // la primera pose puede ser fraccionaria (g0): se aproxima a su muestra más cercana solo si no es entera
  // los demás fallos (barra que no sube, devuelta, perdida sentado): la misma bronca, apenas llega a «Parado»
  const tG = t - (tM + mz) + .25, gesto = tG > 0 ? { tipo: 'bronca', w: suave(tG / GESTO.bronca.sube), t: tG } : null;
  return { i, j: i + 1, u: gC - i, k: destino, w, dz, dy, t, brazos: { i: n ? Math.round(a0) : f0, j: n ? Math.round(a1) : f0 + 1, u: n ? x - kB : g0 - f0, k: destino, w: wB }, gesto };
}

/** Escena entera: plan, barra (desde que se suelta) y duración. `bar`: {y, z} de la barra dibujada en el instante final. `g0` y `R`: ver poseCaida. */
export function armarCaida(res, mov, bar, piso, g0 = 0, R = null, hombros = null) {
  const tipo = tipoCaida(res, mov); if (!tipo) return null;
  const pl = planCaida(tipo, res.causa, res.res === 'valido'); let barra;
  // `hombros` ({y, z} de la línea de los hombros en la pose del final): con eso, la bajada es controlada (GUIA)
  if (tipo === 'bajada' && hombros && bar.y > hombros.y + .15) {
    pl.guia = { y0: bar.y, z0: bar.z, y1: hombros.y - GUIA.bajo, z1: hombros.z + GUIA.adelante, dur: GUIA.dur };
    pl.salto = { dz: GUIA.paso, desde: pl.suelta + GUIA.dur * .8, dur: .34 };
    barra = new BarraGuiada({ ...pl.guia, piso });
  } else barra = new BarraLibre({ y: bar.y, z: bar.z, vy: pl.vy, vz: pl.vz, piso });
  const dur = Math.max(tiemposCaida(pl, g0, R).fin, pl.suelta + barra.reposo) + .1;
  return { tipo, pl, barra, dur, R };
}
