// Controles (docs/CONTROLES.md, secciones 2 y 3): la capa que va del teclado al núcleo y la señal que se muestra.
// Todo puro, sin DOM ni reloj: lo usan el juego, los bots de tools/play_human.mjs y las pruebas.
//
// El núcleo (web/js/sim/) sigue recibiendo «apretar» [t,1] y «soltar» [t,0]. En Clásico la capa es la identidad. En Fácil
// cada gesto es UN toque: la capa mira en qué fase está el intento en el instante del toque y lo convierte en lo que el
// núcleo espera. Soltar la tecla no significa nada, la subida es asistida y la fijación y la bajada son automáticas.
import { simular } from '../sim/attempt.js';
import { TENSION, FACIL } from '../sim/rules.js';

const INF = 2147483647;
/**
 * Rebote de tecla, demora de la bajada automática tras la chicharra y márgenes del toque útil en la subida. En Fácil
 * empujar de más no hace temblar (sección 4), así que el margen es ancho: solo evita gastar Resto en toques que ya no suman.
 */
export const CAPA = { reboteMs: 60, bajaMs: 150, margen: 200, trabaMargen: 150 };
/** Un toque que no llega al núcleo siempre lleva `motivo`: 'espera' (todavía no), 'rebote', 'sobra' (no hace falta), 'tarde' (ya se perdió) o 'termino'. */
const no = (motivo, aviso = null) => ({ ent: [], aviso, motivo });

/**
 * Eventos que la capa agrega sola en Fácil. `m` es la máquina avanzada hasta ahora. Los instantes son fijos (no dependen
 * del cuadro): la bajada va 150 ms después de la chicharra.
 */
export function automaticos(m, ctl) {
  const f = m.fij;
  if (ctl !== 'f' || m.res || m.fase !== 'fijacion' || !f) return [];
  if (m.n === 0) return f.abajo ? [] : [[f.ts, 1]];      // no debería pasar: el contacto de la recepción queda apoyado
  if (!f.firme || m.t < f.tb + CAPA.bajaMs) return [];
  return [[f.tb + CAPA.bajaMs, 0]];
}

/**
 * Una tecla (v = 1 baja, 0 sube) en el instante t, con `m` avanzada hasta t. Devuelve los eventos para el núcleo, un
 * aviso para la presentación ('espera': todavía no se puede, 'rebote', 'sobra': toque de subida que no hace falta) y, si el
 * toque no llegó al núcleo, el `motivo` (ningún toque se descarta sin decir por qué).
 */
export function traducir(m, t, v, ctl) {
  if (m.res) return no('termino');
  if (ctl !== 'f') return v ? { ent: [[t, 1]], aviso: null } : m.n > 0 ? { ent: [[t, 0]], aviso: null } : no('sobra');
  if (!v) return no('sobra');
  const M = m.M;
  switch (m.fase) {
    case 'tension': case 'hombros':
      // en los 450 ms de RESPIRÁ el toque suele ser la cola de ¡EMPUJÁ!: no cuenta (y no dice «todavía no»); después de un amague sí se avisa
      if (t < M.ign) return no('espera', M.amagues.length ? 'espera' : null);
      return { ent: m.n > 0 ? [[t, 0], [t, 1]] : [[t, 1]], aviso: null };
    case 'tiron': case 'flexion':
      if (t - M.tp < CAPA.reboteMs) return no('rebote', 'rebote');
      return { ent: [[t, 0]], aviso: null };
    case 'vuelo': case 'empuje':
      if (M.tq) return no('sobra'); if (M.tFallo < INF) return no('tarde');
      if (t - M.tr < CAPA.reboteMs) return no('rebote', 'rebote');
      return { ent: [[t, 1]], aviso: null };
    case 'pelea': case 'traba': {
      const p = M.pelea; if (t < p.t0) return no('espera');
      const util = (p.modo === 'pelea' && p.P < 1000000 && p.aguja < p.exiAhora + CAPA.margen) || (!p.trabado && p.E < p.exiTraba + CAPA.trabaMargen);
      return util ? { ent: [[t, 1], [t, 0]], aviso: null } : no('sobra', 'sobra');
    }
    case 'acomodo': return no('espera', 'espera');
    default: return no('sobra');      // AGUANTÁ y ¡ABAJO!: no hay que tocar nada
  }
}

/** Recalcula el intento hasta `t` y agrega a `ent` los eventos automáticos que ya vencieron. Devuelve la máquina. */
export function alDia(ctx, conf, ent, t, ctl) {
  let m = simular(ctx, conf, ent, t);
  const au = automaticos(m, ctl);
  if (au.length) { const u = ent.length ? ent[ent.length - 1][0] : 0; for (const e of au) ent.push([Math.max(e[0], u), e[1]]); m = simular(ctx, conf, ent, t); }
  return m;
}

/**
 * Una tecla del jugador sobre el intento en vivo: recalcula hasta el instante de la tecla, la traduce y agrega lo que
 * corresponda a `ent`. El instante nunca es anterior al último evento registrado.
 * @returns {{t:number, aviso:string|null, n:number, motivo:string|null}} instante usado, aviso de la capa, cuántos eventos
 *   se agregaron y, si no se agregó ninguno, por qué
 */
export function tocar(ctx, conf, ent, t, v, ctl) {
  t = Math.max(t, ent.length ? ent[ent.length - 1][0] : 0, conf ?? 0);
  const m = alDia(ctx, conf, ent, t, ctl), r = traducir(m, t, v, ctl);
  for (const e of r.ent) ent.push(e);
  return { t, aviso: r.aviso, n: r.ent.length, motivo: r.ent.length ? null : r.motivo || 'espera' };
}

/** Pasos con número de cada levantamiento en Fácil. */
export const PASOS = { s: 3, c: 6 };

/**
 * La señal del instante `now`: qué hay que hacer y cuándo. `m` es la máquina avanzada hasta `now`. null si no hay nada que
 * mostrar. Es lo único que mira el jugador (y lo único que miran los bots de la prueba de jugabilidad).
 *   tipo 'espera'  no se toca            · 'libre'  cuando quieras
 *        'cierre'  en `objetivo` (ms del intento): el círculo arranca en `desde`, es perfecto a ±`perf` y vale hasta ±`lim`
 *        'empuja'  toques repetidos; `avance` 0..1 · 'auto' lo hace solo
 *   `gesto` (Clásico): 'baja' apretar, 'sube' soltar, 'mantiene' no soltar. `{T}` en los textos es la tecla.
 */
export function senal(m, now, ctl = 'c') {
  if (!m || m.res) return null;
  const M = m.M, c = m.c, f = ctl === 'f', de = PASOS[c.lev];
  const cierre = (clave, verbo, paso, objetivo, desde, w, sub, gesto) => ({ clave, verbo, sub, paso, de, tipo: 'cierre', objetivo, desde, perf: w.p, lim: w.l, gesto });
  switch (m.fase) {
    case 'acomodo': return { clave: 'prep', verbo: 'PREPARATE', tipo: 'espera' };
    case 'tension': case 'hombros': {
      const j = m.fase === 'hombros';
      if (now < M.ign) {
        if (!M.amagues.length) return { clave: 'respira', verbo: j ? 'RESPIRÁ' : 'PREPARATE', tipo: 'espera' };
        const quedan = FACIL.amagues - M.amagues.length;
        return { clave: 'amague', verbo: 'AMAGUE', sub: !f ? 'muy temprano: de nuevo' : quedan > 0 ? 'muy temprano · esperá el círculo' : 'muy temprano · otro más y es fallo', tipo: 'espera' };
      }
      // `vence`: instante en que se acaba el tiempo para este toque libre (el reloj del llamado, o los 8 s en los hombros)
      if (f) return j ? { clave: 'flexiona', verbo: '¡FLEXIONÁ!', sub: 'Apretá {T} para el envión', paso: 4, de, tipo: 'libre', vence: M.tDev }
        : { clave: 'tira', verbo: '¡TIRÁ!', sub: 'Apretá {T} para empezar el levantamiento', paso: 1, de, tipo: 'libre', vence: c.reloj || undefined };
      // Clásico: el anillo respira; los llenos caen en t0 + k·per
      const k = Math.max(1, Math.ceil((now - c.cal - M.t0 - TENSION.buena) / m.per));      // el lleno más cercano que todavía vale
      const obj = M.t0 + k * m.per + c.cal;
      return { clave: j ? 'aprieta2' : 'aprieta', verbo: 'APRETÁ Y MANTENÉ', sub: 'con el anillo lleno', tipo: 'cierre', objetivo: obj, desde: obj - m.per, perf: TENSION.perfecta, lim: TENSION.buena, gesto: 'baja', vence: j ? M.tDev : undefined };
    }
    case 'tiron': return f ? cierre('explota', '¡EXPLOTÁ!', 2, M.tx + c.cal, M.tp, M.w) : cierre('suelta', '¡SOLTÁ!', 0, M.tx + c.cal, M.tp, M.w, 'cuando la barra llega a la línea', 'sube');
    case 'flexion': return f ? cierre('arriba', '¡ARRIBA!', 5, M.tx + c.cal, M.tp, M.w) : cierre('suelta2', '¡SOLTÁ!', 0, M.tx + c.cal, M.tp, M.w, 'en el fondo de la flexión', 'sube');
    case 'vuelo': case 'empuje':
      if (M.tq || M.tFallo < INF) return null;
      return f ? cierre(m.fase === 'vuelo' ? 'recibi' : 'recibi2', '¡RECIBÍ!', m.fase === 'vuelo' ? 3 : 6, M.tc + c.cal, M.tr, M.wr) : cierre(m.fase === 'vuelo' ? 'recibe' : 'recibe2', '¡APRETÁ!', 0, M.tc + c.cal, M.tr, M.wr, 'para recibir', 'baja');
    case 'pelea': case 'traba': {
      const p = M.pelea, avance = p.modo === 'pelea' && p.P < 1000000 ? p.P / 1000000 : p.L === null ? 1 : p.L / 1000000;
      // `piso` (Fácil): lo que el avance tiene que llevar de ventaja; si lo alcanza, la barra se cae
      const piso = f && p.modo === 'pelea' && p.P < 1000000 ? Math.max(0, Math.min(1, (now - p.t0 - FACIL.plazoMs) * FACIL.ritmo / 1000000)) : 0;
      return { clave: 'empuja', verbo: '¡EMPUJÁ!', sub: f ? 'tocá rápido: que no te alcance el rojo' : 'tocá repetido, sin pasarte de la franja', tipo: 'empuja', avance, piso, desde: p.t0 };
    }
    case 'post': return f ? { clave: 'aguanta', verbo: 'AGUANTÁ', sub: 'no toques nada', tipo: 'auto' } : { clave: 'deja', verbo: m.n > 0 ? 'DEJÁ APRETADO' : 'APRETÁ Y MANTENÉ', sub: 'hasta la chicharra', tipo: m.n > 0 ? 'auto' : 'libre', gesto: m.n > 0 ? 'mantiene' : 'baja' };
    case 'fijacion': {
      const x = m.fij, ya = x.firme && now >= x.tb;
      if (f) return ya ? { clave: 'abajo', verbo: '¡ABAJO!', sub: 'baja solo', tipo: 'auto' } : { clave: 'aguanta', verbo: 'AGUANTÁ', sub: 'no toques nada', tipo: 'auto' };
      if (ya) return { clave: 'abajo', verbo: '¡SOLTÁ!', sub: 'sonó la chicharra', tipo: 'libre', gesto: 'sube', objetivo: x.tb + CAPA.bajaMs };
      return x.abajo ? { clave: 'deja', verbo: 'DEJÁ APRETADO', sub: 'hasta la chicharra', tipo: 'auto', gesto: 'mantiene' } : { clave: 'apoya', verbo: 'APRETÁ Y MANTENÉ', sub: 'hasta la chicharra', tipo: 'libre', gesto: 'baja' };
    }
    default: return null;
  }
}

/**
 * Reloj guiado del tutorial (lo lleva la presentación, main.js): a media velocidad, se detiene en cada objetivo hasta el
 * toque, y en la subida solo avanza `porToque` ms después de cada toque. Así, para el núcleo, hasta el jugador más lento
 * empuja a 4 toques por segundo, que le alcanza a cualquiera de los tres pesistas (lo verifica tools/sim_test.mjs).
 */
export const GUIADO = { vel: .5, para: new Set(['tira', 'explota', 'recibi']), empuje: true, estricto: true, porToque: 250 };
/** Práctica de dos tiempos: velocidad real, con una sola parada en los hombros. */
export const EN_HOMBROS = { vel: 1, para: new Set(['flexiona']), empuje: false, estricto: false, porToque: 250 };
