// Controles (docs/CONTROLES.md, secciones 2 y 3): la capa que va del teclado al núcleo y la señal que se muestra.
// Todo puro, sin DOM ni reloj: lo usan el juego, los bots de tools/play_human.mjs y las pruebas.
//
// El núcleo (web/js/sim/) sigue recibiendo «apretar» [t,1] y «soltar» [t,0]. En Clásico la capa es la identidad. En Fácil
// cada gesto es UN toque: la capa mira en qué fase está el intento en el instante del toque y lo convierte en lo que el
// núcleo espera. Soltar la tecla no significa nada, la subida es asistida y la fijación y la bajada son automáticas.
import { simular } from '../sim/attempt.js';
import { TENSION, FACIL, UNO, BARRA, posBarra } from '../sim/rules.js';
import { t } from './i18n/t.js';

const INF = 2147483647;
/** Rebote de tecla y demora de la bajada automática tras la chicharra. */
export const CAPA = { reboteMs: 60, bajaMs: 150 };
/**
 * Un toque que no llega al núcleo siempre lleva `motivo`: 'espera' (todavía no hay nada que tocar), 'temprano' (hay
 * señal, pero su ventana todavía no abrió: «todavía no», y la señal sigue esperando), 'rebote', 'sobra' (no hace falta),
 * 'tarde' (ya se perdió) o 'termino'.
 */
const no = (motivo, aviso = null) => ({ ent: [], aviso, motivo });

/**
 * Eventos que la capa agrega sola en Fácil. `m` es la máquina avanzada hasta ahora. Los instantes son fijos (no dependen
 * del cuadro): la bajada va 150 ms después de la chicharra.
 */
export function automaticos(m, ctl) {
  if (ctl === 'u' || ctl === 'b') return [];      // en 'u' y 'b' el núcleo hace solo AGUANTA y ¡ABAJO!
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
  // 'u': la capa es la identidad. El núcleo decide qué cumple cada contacto (guardado, apoyado, doble); soltar solo cuenta
  // si había algo apoyado
  if (ctl === 'u' || ctl === 'b') return v ? { ent: [[t, 1]], aviso: null } : m.n > 0 || (m.U && m.U.ign > 0) ? { ent: [[t, 0]], aviso: null } : no('sobra');
  if (ctl !== 'f') return v ? { ent: [[t, 1]], aviso: null } : m.n > 0 ? { ent: [[t, 0]], aviso: null } : no('sobra');
  if (!v) return no('sobra');
  const M = m.M;
  switch (m.fase) {
    case 'tension': case 'hombros':
      // en los 450 ms de RESPIRÁ el toque suele ser la cola de ¡EMPUJÁ!: no cuenta (y no dice «todavía no»); después de un amague sí se avisa
      if (t < M.ign) return no('espera', M.amagues.length ? 'espera' : null);
      return { ent: m.n > 0 ? [[t, 0], [t, 1]] : [[t, 1]], aviso: null };
    // Entrada tolerante (12-nov, tarde): un toque antes de que abra la ventana de la señal no la gasta ni arruina el intento.
    // No llega al núcleo, la señal sigue esperando y vale el primer toque que cae adentro. Tocar de más no castiga.
    case 'tiron': case 'flexion':
      if (t - M.tp < CAPA.reboteMs) return no('rebote', 'rebote');
      if (t < abre(m)) return no('temprano', 'temprano');
      return { ent: [[t, 0]], aviso: null };
    case 'vuelo': case 'empuje':
      if (M.tq) return no('sobra'); if (M.tFallo < INF) return no('tarde');
      if (t - M.tr < CAPA.reboteMs) return no('rebote', 'rebote');
      if (t < abre(m)) return no('temprano', 'temprano');
      return { ent: [[t, 1]], aviso: null };
    case 'pelea': case 'traba': {
      // desde la recepción cada toque empuja, aunque la subida todavía no haya arrancado (antes se descartaban por «espera»)
      const p = M.pelea;
      // mientras la barra no está arriba (o los codos sin trabar) todo toque empuja: sin tocar, la subida va a lo sumo a su
      // velocidad sola. Los de después no llegan al núcleo (no gastan Resto)
      const util = (p.modo === 'pelea' && p.P < 1000000) || !p.trabado;
      return util ? { ent: [[t, 1], [t, 0]], aviso: null } : no('sobra', 'sobra');
    }
    case 'acomodo': return no('espera', 'espera');
    default: return no('sobra');      // AGUANTÁ y ¡ABAJO!: no hay que tocar nada
  }
}

/**
 * Instante (ms del intento) en que abre la ventana de la señal de toque en curso: `A` ms antes del objetivo (en Fácil,
 * FACIL.abreMs, fijo a cualquier peso) y, en el tirón, no antes de que la barra pase la rodilla.
 */
export function abre(m) {
  const M = m.M, c = m.c;
  if (m.fase === 'tiron') return Math.max(M.tk, M.tx + c.cal - M.w.A);
  if (m.fase === 'flexion') return M.tx + c.cal - M.w.A;
  if (m.fase === 'vuelo' || m.fase === 'empuje') return M.tc + c.cal - M.wr.A;
  return -INF;
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
  // 'u': qué hizo el contacto, para el acuse (QUE_U): lo dice el núcleo, recalculado con el contacto adentro
  let que = null;
  if ((ctl === 'u' || ctl === 'b') && v && r.ent.length) { const m2 = simular(ctx, conf, ent, t), c = m2.U && m2.U.contactos; que = c && c.length && c[c.length - 1].t === t ? c[c.length - 1].que : m2.res ? 'listo' : 'espera'; }
  return { t, aviso: r.aviso, n: r.ent.length, motivo: r.ent.length ? null : r.motivo || 'espera', que };
}
/**
 * Acuse de cada contacto en 'u' (la palabra que sale enseguida, en la placa del pulgar): `clave` del diccionario y si es
 * gris (`gris`: el contacto no hizo nada nuevo). Nunca hay dos imperativos: estas son palabras, no órdenes.
 */
export const QUE_U = {
  tira: { clave: 'palabra.vamos' }, salta: { clave: 'palabra.salto' }, pisoton: { clave: 'palabra.pisoton' }, arriba: { clave: 'palabra.eso' }, garra: { clave: 'palabra.garra' },
  guardado: { clave: 'palabra.guardado', gris: true }, listo: { clave: 'palabra.listo', gris: true }, doble: { clave: 'palabra.doble', gris: true }, espera: { clave: 'palabra.guardado', gris: true },
};
/** Acuse de cada contacto en 'b': la zona donde pegó la barrita, o en gris que no hizo nada (nunca hace nada malo). */
export const QUE_B = {
  verde: { clave: 'barra.verde', zona: 'verde' }, amarillo: { clave: 'barra.amarillo', zona: 'amarillo' }, rojo: { clave: 'barra.rojo', zona: 'rojo' },
  listo: { clave: 'palabra.listo', gris: true }, doble: { clave: 'palabra.doble', gris: true }, espera: { clave: 'barra.todavia', gris: true },
  esfuerzo: { clave: 'palabra.vamos' }, de_pie: { clave: 'barra.de_pie' },
};

/** Pasos con número de cada levantamiento en Fácil (de círculos) y en 'u'. */
export const PASOS = { s: 3, c: 6 };
export const PASOS_U = { s: 3, c: 4 };

/**
 * La señal de 'u'. Ningún toque cambia el resultado (Gameplay 2.1): las señales con toque son para acompañar y todas salen
 * solas si no se toca. Tipos: 'espera' (PREPÁRATE, RESPIRA), 'libre' (¡TIRA!, ¡ARRIBA!: cuando quieras; `desde` y `vence`:
 * cuándo apareció y cuándo sale sola; `sale`: sale sola, sin castigo), 'luz' (¡SALTA!: vale de `abre` a `hasta`; sin
 * barra que se llene, porque no hay un momento justo), 'uno' (¡PÁRATE!: un toque, de `desde` a `hasta`; `avance` 0..1, la
 * barra que sube) y 'auto' (AGUANTA, ¡ABAJO!, y ¡DA TODO! del FRENO, donde la garra se usa sola). null entre tramos: la
 * palabra del toque anterior queda sola, sin una orden al lado. `guardado`: hay un contacto guardado para el tramo que viene.
 */
function senalU(m, now) {
  const M = m.M, U = m.U, c = m.c, de = PASOS_U[c.lev], g = U.guarda > 0;
  switch (m.fase) {
    case 'acomodo': return { clave: 'prep', verbo: t('senal.prep'), tipo: 'espera', guardado: g };
    case 'tension': return { clave: 'tira', verbo: t('senal.tira'), sub: t('senal.tira_u'), paso: 1, de, tipo: 'libre', desde: m.tSet, vence: m.tSet + UNO.tiraSolo, sale: true, guardado: g };
    case 'tiron': case 'vuelo':
      if (U.salto !== null) return null;
      return { clave: 'salta', verbo: t('senal.salta'), sub: t('senal.salta_sub'), paso: 2, de, tipo: 'luz', desde: M.tp, abre: M.tSalta, hasta: M.tx + M.an.rec, guardado: g };
    case 'pelea': {
      const p = M.pelea;
      if (M.mov === 'j' || p.cerrado || U.pisoton !== null) return null;
      return { clave: 'parate', verbo: t('senal.parate'), sub: t('senal.parate_sub'), paso: 3, de, tipo: 'uno', desde: p.t0, hasta: p.tCierre, avance: p.P / 1000000, guardado: g };
    }
    case 'freno': return { clave: 'datodo', verbo: t('senal.datodo'), sub: t('senal.datodo_sub'), tipo: 'auto', desde: U.freno.t0, hasta: U.freno.hasta, tramo: U.freno.tramo };
    case 'hombros':
      if (!M.abierto) return { clave: 'respira', verbo: t('senal.respira'), tipo: 'espera', guardado: g };
      return { clave: 'arriba', verbo: t('senal.arriba'), sub: t('senal.arriba_u'), paso: 4, de, tipo: 'libre', desde: M.ign, vence: M.tDev, sale: true, guardado: g };
    case 'post': return { clave: 'aguanta', verbo: t('senal.aguanta'), sub: t('senal.aguanta_sub'), tipo: 'auto' };
    case 'fijacion': return now >= m.fij.tb ? { clave: 'abajo', verbo: t('senal.abajo'), sub: t('senal.abajo_sub'), tipo: 'auto' } : { clave: 'aguanta', verbo: t('senal.aguanta'), sub: t('senal.aguanta_sub'), tipo: 'auto' };
    default: return null;
  }
}

/**
 * Instante (ms del intento) en que el puntero de una barrita que arrancó en `desde` pasa por el centro del verde por
 * primera vez a partir de `desde_` (más lento desde BARRA.lentoDesde, como posBarra). Lo usan las pruebas y la práctica.
 */
export function proximoCentro(desde, desde_) {
  const P = BARRA.pasada, L = BARRA.lentoDesde, PL = BARRA.pasadaLenta, xL = L * 1000 / P;
  const e = Math.max(0, desde_ - desde), xe = e <= L ? e * 1000 / P : xL + (e - L) * 1000 / PL;      // en milésimas de pasada
  const x = Math.ceil((xe - 500) / 1000) * 1000 + 500;
  return Math.round(desde + (x <= xL ? x * P / 1000 : L + (x - xL) * PL / 1000));
}

/**
 * La señal de 'b' (la barrita). Tipos: 'barra' (la barrita corre: toca cuando el puntero esté en el verde; `i` 0 tirón o 1
 * envión, `desde` cuándo arrancó el puntero, `z` las zonas, `pos` dónde está el puntero ahora, `lento` si ya va despacio),
 * 'espera' (PREPÁRATE y RESPIRA: la barrita está a la vista, quieta, con `z` e `i`) y 'auto' (AGUANTA, ¡ABAJO!, ¡DA TODO!).
 * Entre medio, null: el pesista hace solo el resto. `de` y `paso`: «1 de 2» en el dos tiempos.
 */
function senalB(m, now) {
  const M = m.M, U = m.U, c = m.c, de = c.lev === 'c' ? 2 : 1, B = U.barras;
  switch (m.fase) {
    case 'acomodo': return { clave: 'prep', verbo: t('senal.prep'), tipo: 'espera', i: 0, z: B[0].z, paso: de > 1 ? 1 : undefined, de };
    case 'tension': { const e = now - B[0].t0; return { clave: 'barra', verbo: t('barra.verbo'), sub: t('barra.sub'), tipo: 'barra', i: 0, z: B[0].z, desde: B[0].t0, pos: posBarra(e), lento: e > BARRA.lentoDesde, paso: de > 1 ? 1 : undefined, de }; }
    case 'freno': return { clave: 'datodo', verbo: t('senal.datodo'), sub: t('senal.datodo_sub'), tipo: 'auto', desde: U.freno.t0, hasta: U.freno.hasta, tramo: U.freno.tramo };
    case 'pelea': {
      // el esfuerzo de pararse (solo en los intentos exigentes): unos pocos toques sin apuro, con la barra que se llena
      const p = M.pelea, e = p && p.esf;
      if (!e || p.cerrado || e.ok || now >= e.hasta) return null;
      return { clave: 'esfuerzo', verbo: t('senal.parate'), sub: t('barra.esfuerzo_sub', { n: e.meta - e.n }), tipo: 'uno', desde: e.desde, hasta: e.hasta, avance: e.n / e.meta, n: e.n, meta: e.meta };
    }
    case 'hombros': {
      if (!M.abierto) return { clave: 'respira', verbo: t('senal.respira'), tipo: 'espera', i: 1, z: B[1].z, paso: 2, de };
      const e = now - B[1].t0;
      return { clave: 'barra2', verbo: t('barra.verbo'), sub: t('barra.sub'), tipo: 'barra', i: 1, z: B[1].z, desde: B[1].t0, pos: posBarra(e), lento: e > BARRA.lentoDesde, paso: 2, de };
    }
    case 'post': return { clave: 'aguanta', verbo: t('senal.aguanta'), sub: t('senal.aguanta_sub'), tipo: 'auto' };
    case 'fijacion': return now >= m.fij.tb ? { clave: 'abajo', verbo: t('senal.abajo'), sub: t('senal.abajo_sub'), tipo: 'auto' } : { clave: 'aguanta', verbo: t('senal.aguanta'), sub: t('senal.aguanta_sub'), tipo: 'auto' };
    default: return null;
  }
}

/**
 * La señal del instante `now`: qué hay que hacer y cuándo. `m` es la máquina avanzada hasta `now`. null si no hay nada que
 * mostrar. Es lo único que mira el jugador (y lo único que miran los bots de la prueba de jugabilidad).
 *   tipo 'espera'  no se toca            · 'libre'  cuando quieras
 *        'cierre'  en `objetivo` (ms del intento): el círculo arranca en `desde`, es perfecto a ±`perf` y vale hasta ±`lim`
 *        'empuja'  toques repetidos; `avance` 0..1 · 'auto' lo hace solo
 *   `gesto` (Clásico): 'baja' apretar, 'sube' soltar, 'mantiene' no soltar. `verbo` y `sub` salen del diccionario del idioma
 *   actual (i18n/t.js); `{A}` en `sub` es la tecla, y la resuelve quien dibuja (Senal).
 */
export function senal(m, now, ctl = 'c') {
  if (!m || m.res) return null;
  if (ctl === 'u') return senalU(m, now);
  if (ctl === 'b') return senalB(m, now);
  const M = m.M, c = m.c, f = ctl === 'f', de = PASOS[c.lev];
  // `bien`: borde de BIEN (± ms); `lim`: hasta cuándo vale el toque; `abre` (Fácil): desde cuándo vale (antes, «todavía no»)
  // `visto`: donde el círculo se cierra en pantalla. Es el objetivo SIN la corrección de atraso (`c.cal`): el jugador apunta
  // ahí, su toque llega `cal` ms tarde (pantalla y dedo) y el núcleo lo mide contra `objetivo`. Antes el círculo se cerraba
  // en `objetivo` y la corrección no corregía nada (el atraso se sumaba igual).
  const cierre = (clave, verbo, paso, objetivo, desde, w, sub, gesto) => ({ clave, verbo, sub, paso, de, tipo: 'cierre', objetivo, visto: objetivo - c.cal, desde, perf: w.p, bien: w.g, lim: w.L ?? w.l, abre: f ? abre(m) : objetivo - (w.A ?? w.l), gesto });
  switch (m.fase) {
    case 'acomodo': return { clave: 'prep', verbo: t('senal.prep'), tipo: 'espera' };
    case 'tension': case 'hombros': {
      const j = m.fase === 'hombros';
      if (now < M.ign) {
        if (!M.amagues.length) return { clave: 'respira', verbo: t(j ? 'senal.respira' : 'senal.prep'), tipo: 'espera' };
        const quedan = FACIL.amagues - M.amagues.length;
        return { clave: 'amague', verbo: t('senal.amague'), sub: t(!f ? 'senal.amague_pro' : quedan > 0 ? 'senal.amague_sub' : 'senal.amague_ultimo'), tipo: 'espera' };
      }
      // `vence`: instante en que se acaba el tiempo para este toque libre (el reloj del llamado, o los 8 s en los hombros)
      if (f) return j ? { clave: 'flexiona', verbo: t('senal.flexiona'), sub: t('senal.flexiona_sub', { A: '{A}' }), paso: 4, de, tipo: 'libre', vence: M.tDev }
        : { clave: 'tira', verbo: t('senal.tira'), sub: t('senal.tira_sub', { A: '{A}' }), paso: 1, de, tipo: 'libre', vence: c.reloj || undefined };
      // Clásico: el anillo respira; los llenos caen en t0 + k·per
      const k = Math.max(1, Math.ceil((now - c.cal - M.t0 - TENSION.buena) / m.per));      // el lleno más cercano que todavía vale
      const obj = M.t0 + k * m.per + c.cal;
      return { clave: j ? 'aprieta2' : 'aprieta', verbo: t('senal.aprieta'), sub: t('senal.aprieta_sub'), tipo: 'cierre', objetivo: obj, desde: obj - m.per, perf: TENSION.perfecta, lim: TENSION.buena, gesto: 'baja', vence: j ? M.tDev : undefined };
    }
    case 'tiron': return f ? cierre('explota', t('senal.explota'), 2, M.tx + c.cal, M.tp, M.w) : cierre('suelta', t('senal.suelta'), 0, M.tx + c.cal, M.tp, M.w, t('senal.suelta_sub'), 'sube');
    case 'flexion': return f ? cierre('arriba', t('senal.arriba'), 5, M.tx + c.cal, M.tp, M.w) : cierre('suelta2', t('senal.suelta'), 0, M.tx + c.cal, M.tp, M.w, t('senal.suelta2_sub'), 'sube');
    case 'vuelo': case 'empuje':
      if (M.tq || M.tFallo < INF) return null;
      return f ? cierre(m.fase === 'vuelo' ? 'recibi' : 'recibi2', t('senal.recibi'), m.fase === 'vuelo' ? 3 : 6, M.tc + c.cal, M.tr, M.wr) : cierre(m.fase === 'vuelo' ? 'recibe' : 'recibe2', t('senal.recibe_pro'), 0, M.tc + c.cal, M.tr, M.wr, t('senal.recibe_pro_sub'), 'baja');
    case 'pelea': case 'traba': {
      const p = M.pelea, avance = p.modo === 'pelea' && p.P < 1000000 ? p.P / 1000000 : p.L === null ? 1 : p.L / 1000000;
      // `piso` (Fácil): lo que el avance tiene que llevar de ventaja; si lo alcanza, la barra se cae
      const piso = f && p.modo === 'pelea' && p.P < 1000000 ? Math.max(0, Math.min(1, (now - p.t0 - FACIL.plazoMs) * FACIL.ritmo / 1000000)) : 0;
      return { clave: 'empuja', verbo: t('senal.empuja'), sub: t(f ? 'senal.empuja_sub' : 'senal.empuja_pro_sub'), tipo: 'empuja', avance, piso, desde: p.t0 };
    }
    case 'post': return f ? { clave: 'aguanta', verbo: t('senal.aguanta'), sub: t('senal.aguanta_sub'), tipo: 'auto' } : { clave: 'deja', verbo: t(m.n > 0 ? 'senal.deja' : 'senal.aprieta'), sub: t('senal.deja_sub'), tipo: m.n > 0 ? 'auto' : 'libre', gesto: m.n > 0 ? 'mantiene' : 'baja' };
    case 'fijacion': {
      const x = m.fij, ya = x.firme && now >= x.tb;
      if (f) return ya ? { clave: 'abajo', verbo: t('senal.abajo'), sub: t('senal.abajo_sub'), tipo: 'auto' } : { clave: 'aguanta', verbo: t('senal.aguanta'), sub: t('senal.aguanta_sub'), tipo: 'auto' };
      if (ya) return { clave: 'abajo', verbo: t('senal.suelta'), sub: t('senal.abajo_pro_sub'), tipo: 'libre', gesto: 'sube', objetivo: x.tb + CAPA.bajaMs };
      return x.abajo ? { clave: 'deja', verbo: t('senal.deja'), sub: t('senal.deja_sub'), tipo: 'auto', gesto: 'mantiene' } : { clave: 'apoya', verbo: t('senal.aprieta'), sub: t('senal.deja_sub'), tipo: 'libre', gesto: 'baja' };
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
