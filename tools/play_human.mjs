// Prueba de jugabilidad sin navegador (docs/CONTROLES.md, sección 9). Bots con error humano juegan intentos sueltos sobre
// el núcleo, pasando por la capa de traducción (web/js/game/controles.js). Los que miran, miran SOLO la señal (`senal()`):
//   casual     toca a `objetivo + 40 ms + error`, error de campana de 80 ms de desvío; en ¡EMPUJÁ!, unos 5 toques por segundo;
//   flojo      lo mismo con 160 ms de desvío y reacciones más lentas;
//   distraído  un toque por señal, 250 ms tarde (± 30); en ¡EMPUJÁ! también un solo toque;
//   machacador no mira: toca 6 a 8 veces por segundo desde que confirma hasta que termina el intento;
//   no toca    nunca toca.
// Si un toque cae antes de que abra la ventana, la capa responde «todavía no» y el bot que mira vuelve a decidir cuándo tocar.
// Criterio (Fácil, aperturas al 88 a 92 % del techo, arranque y dos tiempos con cada envión): machacador ≥ 80 %, casual ≥ 95 %,
// flojo ≥ 80 %, distraído ≥ 70 %, no toca 0 %, y el casual que toca 3 veces por segundo en ¡EMPUJÁ! ≥ 95 %. Al 100 % del
// techo: machacador ≤ 25 % y casual entre 35 y 70 %. Además: una subida fallada no dura más que el tope de Fácil, y con todos
// los toques en el borde de BIEN y un toque cada 250 ms en ¡EMPUJÁ! se levanta siempre hasta el 100 %.
// Cada intento se recalcula con simular() y tiene que dar lo mismo. Sale con error si el criterio no se cumple.
// Uso: node tools/play_human.mjs [--n=2000] [--imin=8800 --imax=9200] [--info]   (--info agrega filas que no son criterio:
//   95, 97 y 103 %, maneras de tocar a ciegas, seguir tocando después de ¡EMPUJÁ!, ritmos de ¡EMPUJÁ!, tutorial y Clásico)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { Intento, simular } from '../web/js/sim/attempt.js';
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { exigenciaTabla, FACIL, ventanas, anchoFacil } from '../web/js/sim/rules.js';
import { automaticos, traducir, senal } from '../web/js/game/controles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/sim.json'), 'utf8')));
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 2000), IMIN = +(arg('imin') || 8800), IMAX = +(arg('imax') || 9200), INFO = process.argv.includes('--info');
const META = { casual: 85, flojo: 50, azar: 10 };
/** sd y lag: error de tiempo (ms). reac: reacción a una señal libre. pelea: reacción a ¡EMPUJÁ! y ritmo de toques. */
export const BOTS = {
  casual: { sd: 80, lag: 40, reac: [350, 800], pelea: { reac: 300, per: 180, jit: 35 } },
  flojo: { sd: 160, lag: 40, reac: [450, 1100], pelea: { reac: 450, per: 230, jit: 60 } },
  distraido: { sd: 30, lag: 250, reac: [600, 1050], pelea: { reac: 550, per: Infinity, jit: 0 } },
};
/** Intervalo entre toques del machacador (ms): 6 a 8 por segundo. */
export const machaca = r => r.entre(125, 167);
const PASO = 8;      // ms: cada cuánto el bot «mira la pantalla»

/** Sesión de un intento: máquina incremental más la lista de entradas que quedaría en el registro. */
export function sesion(ctx, ctl, conf) {
  const m = new Intento(ctx), ent = []; let ult = 0; m.confirmar(conf);
  const push = evs => { for (const [t, v] of evs) { const x = Math.max(t, ult); ent.push([x, v]); m.entrada(x, v); ult = x; } };
  return {
    m, ent, conf,
    /** Deja pasar el tiempo hasta t, con los eventos automáticos de la capa. */
    av(t) { while (!m.res && m.t < t) { m.avanzar(Math.min(t, m.t + PASO)); push(automaticos(m, ctl)); } },
    /** Una tecla en t (v = 1 baja, 0 sube). */
    tecla(t, v = 1) { t = Math.max(t, m.t, ult); this.av(t); if (m.res) return null; const x = traducir(m, t, v, ctl); push(x.ent); return x; },
  };
}

/** Bot que mira la señal: un toque por señal en Fácil. `o.sinEmpujar`: no toca en la subida. `o.cola` [ms, ms]: sigue tocando ese rato después de ¡EMPUJÁ!. */
export function jugarSenal(ctx, B, sem, o = {}) {
  const r = new Azar(mezclar(sem, 11)), S = sesion(ctx, 'f', 1000 + r.ent(1500)), m = S.m;
  let clave = '', plan = Infinity, toques = 0, tipo = '', cola = null;
  for (let g = 0; !m.res && g < 400000; g++) {
    const s = senal(m, m.t, 'f'), k = s ? s.clave + ':' + (s.desde ?? '') : '';
    if (k !== clave) {      // apareció una señal nueva: el bot decide una sola vez cuándo va a tocar
      // una persona que venía tocando rápido no frena en seco: sigue tocando a su ritmo durante `cola` ms
      if (tipo === 'empuja' && toques && o.cola) cola = { hasta: m.t + r.entre(o.cola[0], o.cola[1]), prox: plan };
      clave = k; toques = 0; tipo = s ? s.tipo : '';
      plan = !s ? Infinity : s.tipo === 'libre' ? m.t + r.entre(B.reac[0], B.reac[1]) : s.tipo === 'cierre' ? Math.max(m.t + 1, s.objetivo + B.lag + r.campana(B.sd)) : s.tipo === 'empuja' && !o.sinEmpujar ? Math.max(m.t, s.desde) + B.pelea.reac : Infinity;
    }
    if (cola && cola.prox > cola.hasta) cola = null;
    if (cola && cola.prox <= m.t + PASO) { S.tecla(Math.max(cola.prox, m.t)); cola.prox = m.t + Math.max(100, B.pelea.per + r.campana(B.pelea.jit)); continue; }
    if (plan <= m.t + PASO) {
      const x = S.tecla(Math.max(plan, m.t)); toques++;
      // «TODAVÍA NO»: la señal sigue ahí, así que vuelve a decidir cuándo tocar (no antes de reaccionar al aviso)
      if (x && x.motivo === 'temprano' && s && s.tipo === 'cierre') { plan = Math.max(m.t + 150 + r.ent(100), s.objetivo + B.lag + r.campana(B.sd)); continue; }
      plan = s && s.tipo === 'empuja' ? m.t + Math.max(100, B.pelea.per + r.campana(B.pelea.jit)) : Infinity;
      continue;
    }
    S.av(m.t + PASO);
  }
  if (!m.res) throw new Error('el intento no terminó');
  return S;
}
/** Jugador con el error de cada toque de señal dado de antemano (`errs`, ms) y un toque cada `per` ms en ¡EMPUJÁ!. */
export function jugarFijo(ctx, errs, per, sem = 1) {
  const r = new Azar(mezclar(sem, 29)), S = sesion(ctx, 'f', 1200), m = S.m; let clave = '', plan = Infinity, i = 0;
  for (let g = 0; !m.res && g < 400000; g++) {
    const s = senal(m, m.t, 'f'), k = s ? s.clave + ':' + (s.desde ?? '') : '';
    if (k !== clave) { clave = k; plan = !s ? Infinity : s.tipo === 'libre' ? m.t + 500 : s.tipo === 'cierre' ? Math.max(m.t + 1, s.objetivo + errs[i++ % errs.length]) : s.tipo === 'empuja' && per ? Math.max(m.t, s.desde) + 300 : Infinity; }
    if (plan <= m.t + PASO) { S.tecla(Math.max(plan, m.t)); plan = s && s.tipo === 'empuja' ? m.t + per + r.entre(-10, 10) : Infinity; continue; }
    S.av(m.t + PASO);
  }
  return S;
}
/** Bot que no mira: `prox(r)` da el intervalo hasta el próximo toque (ms). */
export function jugarCiego(ctx, prox, sem) {
  const r = new Azar(mezclar(sem, 13)), S = sesion(ctx, 'f', 1000 + r.ent(1500)), m = S.m; let t = S.conf + prox(r);
  for (let g = 0; !m.res && g < 400000; g++) { S.av(t); if (m.res) break; S.tecla(t); t += prox(r); }
  if (!m.res) throw new Error('el intento no terminó');
  return S;
}
/** El mismo error humano con el esquema Clásico (para comparar): anillo, línea, recepción, pelea a ritmo fijo y chicharra. */
export function jugarClasico(ctx, B, sem) {
  const r = new Azar(mezclar(sem, 17)), S = sesion(ctx, 'c', 1000 + r.ent(1500)), m = S.m;
  let clave = '', plan = Infinity, gesto = null, abajo = false, sube = Infinity;
  for (let g = 0; !m.res && g < 400000; g++) {
    const s = senal(m, m.t, 'c'), k = s ? s.clave + ':' + (s.tipo === 'cierre' && s.clave.startsWith('aprieta') ? '' : s.desde ?? '') : '';
    if (k !== clave) {
      clave = k; gesto = s?.gesto ?? null;
      plan = !s ? Infinity : s.tipo === 'cierre' ? Math.max(m.t + 1, s.objetivo + B.lag + r.campana(B.sd)) : s.tipo === 'empuja' ? Math.max(m.t, s.desde) + B.pelea.reac : s.tipo === 'libre' ? (s.objetivo ?? m.t) + 250 + r.ent(250) : Infinity;
      if (s && s.clave.startsWith('aprieta') && plan < m.t + 250) plan += m.per;
    }
    if (sube <= m.t + PASO) { S.tecla(Math.max(sube, m.t), 0); abajo = false; sube = Infinity; continue; }
    if (plan <= m.t + PASO) {
      const t = Math.max(plan, m.t);
      if (s && s.tipo === 'empuja') { if (abajo) { S.tecla(t, 0); abajo = false; } S.tecla(t, 1); abajo = true; sube = t + 40; plan = t + Math.max(100, B.pelea.per + r.campana(B.pelea.jit)); continue; }
      if (gesto === 'baja' && !abajo) { S.tecla(t, 1); abajo = true; } else if (gesto === 'sube' && abajo) { S.tecla(t, 0); abajo = false; } else if (gesto === 'baja' && s.tipo === 'cierre' && abajo) { S.tecla(t, 0); S.tecla(t + 1, 1); }
      plan = Infinity; continue;
    }
    S.av(m.t + PASO);
  }
  if (!m.res) throw new Error('el intento no terminó');
  return S;
}

const ATL = ['ventura', 'brenner', 'marangi'];
export function ctxDe(id, lev, env, I, sem, ctl, extra = {}) {
  const f = datos.atletas[id], r = new Azar(mezclar(sem, 23));
  return { lev, env: lev === 'c' ? env : undefined, I, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: sem, cal: 0, primera: false, domina: lev === 's' || f.enviones.includes(env),
    jueces: [r.entre(900, 1100), r.entre(900, 1100), r.entre(900, 1100)], reloj: 30000, ctl, ...extra };
}
/** Columnas: arranque y dos tiempos con cada envión. `env` puede ser una función de la ficha (el envión de la casa). */
const COLS = [['s', 'split', 'arranque'], ['c', 'split', 'tijera'], ['c', 'power', 'power'], ['c', 'squat', 'squat']];
const CASA = [['s', 'split', 'arranque'], ['c', f => f.enviones[0], 'dos tiempos (envión de la casa)']];
/** Duración (ms) de las subidas falladas de los bots que miran la señal (casual y flojo, a cualquier peso): la pelea, desde que empieza hasta el fallo. */
const SUBIDAS = { dur: [], limpias: 0, cuenta: false };
/** Porcentaje de válidos por columna. Verifica en cada intento que el registro recalcula igual y que está bien formado. */
function medir(jugar, ctl, cols = COLS, extra, imin = IMIN, imax = IMAX) {
  return cols.map(([lev, env, nombre]) => {
    let v = 0; const causas = {}, dur = [], subidaOk = [];
    for (let k = 0; k < N; k++) {
      const id = ATL[k % 3], r = new Azar(mezclar(k, 3)), I = imin + r.ent(imax - imin + 1), f = datos.atletas[id];
      const ctx = ctxDe(id, lev, typeof env === 'function' ? env(f) : env, I, mezclar(k, 5), ctl, extra);
      const S = jugar(ctx, mezclar(k, lev === 's' ? 21 : 22)), re = simular(ctx, S.conf, S.ent);
      if (JSON.stringify(re.res) !== JSON.stringify(S.m.res)) throw new Error(`intento ${k}: el recálculo no coincide`);
      let t0 = 0, n = 0; for (const e of S.ent) { if (e[0] < t0 || !Number.isInteger(e[0])) throw new Error('entradas fuera de orden'); t0 = e[0]; n += e[1] ? 1 : -1; if (n < 0) throw new Error('se levanta un contacto que no estaba apoyado'); }
      const res = S.m.res;
      if (res.res === 'valido') v++; else { const c = res.causa; causas[c] = (causas[c] || 0) + 1; }
      // duración de la última subida ganada (la del arranque, o la de la cargada si el envión no tiene subida)
      for (const M of S.m.movs) if (M.pelea && M.tEnPie) subidaOk.push(M.tEnPie - M.pelea.t0);
      if (ctl === 'f' && res.res === 'fallo' && (res.causa === 'aplastado' || res.causa === 'codos') && S.m.M.pelea) {
        const d = res.t - S.m.M.pelea.t0; dur.push(d); if (SUBIDAS.cuenta) { SUBIDAS.dur.push(d); if (res.gestos.every(g => g.pal === 'perfecto' || g.pal === 'bien')) SUBIDAS.limpias++; }
        if (d > FACIL.maxMs + 10) throw new Error(`intento ${k}: una subida fallada duró ${d} ms (tope de Fácil: ${FACIL.maxMs})`);
      }
    }
    subidaOk.sort((a, b) => a - b);
    return { nombre, pct: v * 100 / N, subidaOk: subidaOk.length ? subidaOk[subidaOk.length >> 1] : null, causas: Object.entries(causas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, x]) => `${c} ${(x * 100 / N).toFixed(0)}`).join(', ') };
  });
}
const pct = x => x.pct.toFixed(1).padStart(5) + ' %';
function fila(nombre, xs, meta = '', o = {}) {
  console.log(`${nombre.padEnd(44)} ${xs.map(pct).join(' · ')}   ${meta}${o.subida ? `   subida ganada: mediana ${xs.map(x => (x.subidaOk === null ? '–' : (x.subidaOk / 1000).toFixed(1) + ' s')).join(' · ')}` : ''}${xs.some(x => x.causas) && !o.sinCausas ? `   [${xs.map(x => x.causas || '–').join(' | ')}]` : ''}`);
}
const poisson = mu => r => Math.max(100, Math.round(-mu * Math.log(1 - (r.ent(1000000) + .5) / 1000000)));
/** Criterio: [bot, jugar, meta mínima, meta máxima]. */
const senalDe = B => (c, s) => jugarSenal(c, B, s);
const ciego = prox => (c, s) => jugarCiego(c, prox, s);
const nunca = (c, s) => jugarCiego(c, () => 1e9, s);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now(), mal = [], tijera = [COLS[0], COLS[1]];
  const cumple = (nombre, xs, min, max) => { for (const x of xs) if (x.pct < min || x.pct > max) mal.push(`${nombre}, ${x.nombre}: ${x.pct.toFixed(1)} % (meta ${min === max ? min + ' %' : max >= 100 ? min + ' % o más' : min <= 0 ? max + ' % o menos' : `entre ${min} y ${max} %`})`); };
  const metaTxt = (min, max) => (min === max ? `meta ${min} %` : max >= 100 ? `meta ≥ ${min} %` : min <= 0 ? `meta ≤ ${max} %` : `meta ${min} a ${max} %`);
  console.log(`Jugabilidad de Fácil · ${N} intentos por casilla · los tres pesistas · columnas: ${COLS.map(c => c[2]).join(' · ')}`);
  console.log(`— aperturas, ${IMIN / 100} a ${IMAX / 100} % del techo —`);
  const CRIT = [
    ['machacador (6 a 8 toques por s, sin mirar)', ciego(machaca), 80, 100],
    ['casual (desvío 80 ms)', senalDe(BOTS.casual), 95, 100],
    ['flojo (desvío 160 ms)', senalDe(BOTS.flojo), 80, 100],
    ['distraído (un toque por señal, 250 ms tarde)', senalDe(BOTS.distraido), 70, 100],
    ['no toca', nunca, 0, 0],
    ['casual, 3 toques por s en ¡EMPUJÁ!', senalDe({ ...BOTS.casual, pelea: { reac: 300, per: 333, jit: 40 } }), 95, 100],
  ];
  for (const [nombre, jugar, min, max] of CRIT) {
    const mira = nombre.startsWith('casual (') || nombre.startsWith('flojo'); SUBIDAS.cuenta = mira;
    const xs = medir(jugar, 'f'); SUBIDAS.cuenta = false; fila(nombre, xs, metaTxt(min, max), { subida: true }); cumple(nombre, xs, min, max);
  }
  console.log('— al 100 % del techo —');
  for (const [nombre, jugar, min, max] of [['machacador', ciego(machaca), 0, 25], ['casual', senalDe(BOTS.casual), 35, 70]]) {
    const xs = medir(jugar, 'f', COLS, undefined, 10000, 10000); fila(nombre + ' al 100 %', xs, metaTxt(min, max)); cumple(nombre + ' al 100 %', xs, min, max);
  }
  // la palabra no contradice a la subida: todos los toques en el borde de BIEN y un toque cada 250 ms levantan siempre hasta el 100 %
  { let n = 0, v = 0; const malos = [];
    for (const id of ATL) for (const lev of ['s', 'c']) for (const I of [8800, 9200, 9500, 9700, 10000]) for (const sg of [-1, 1]) for (let k = 0; k < 6; k++) {
      const ctx = ctxDe(id, lev, 'split', I, mezclar(k, 5 + I), 'f'), f = datos.atletas[id], w = g => ventanas(I, g, { tec: f.attrs.tec, temple: 0, primera: false, ancho: anchoFacil(I) }).g - 2;
      // del lado temprano, el tirón no puede soltarse antes de la rodilla (antes la ventana no abrió): se queda 140 ms antes como mucho
      const ex = g => (sg < 0 ? -Math.min(w(g), 140) : w(g));
      const S = jugarFijo(ctx, lev === 's' ? [ex('s_exp'), sg * w('s_rec')] : [ex('c_exp'), sg * w('c_rec'), sg * w('j_exp'), sg * w('j_rec')], 250, k), res = S.m.res; n++;
      if (res.gestos.some(g => g.pal !== 'bien' && g.pal !== 'perfecto')) throw new Error('el jugador de BIEN recibió ' + res.gestos.map(g => g.pal).join(' '));
      if (res.res === 'valido') v++; else if (malos.length < 3) malos.push(`${id} ${lev === 's' ? 'arranque' : 'dos tiempos'} ${I / 100} % ${sg < 0 ? 'temprano' : 'tarde'}: ${res.res} ${res.causa}`);
    }
    console.log(`${'todo en el borde de BIEN, toque cada 250 ms'.padEnd(44)} ${v} de ${n} válidos (88 a 100 %, los tres, temprano y tarde)   meta: todos`);
    if (v < n) mal.push(`con todos los toques en BIEN no se levanta siempre: ${v} de ${n} (${malos.join(' · ')})`); }
  if (INFO) {
    console.log('— informativo (no es criterio) —');
    for (const I of [9500, 9700, 10300]) for (const [nombre, jugar] of [['machacador', ciego(machaca)], ['casual', senalDe(BOTS.casual)], ['flojo', senalDe(BOTS.flojo)], ['distraído', senalDe(BOTS.distraido)]]) {
      SUBIDAS.cuenta = nombre === 'casual' || nombre === 'flojo'; fila(`${nombre} al ${I / 100} %`, medir(jugar, 'f', COLS, undefined, I, I)); SUBIDAS.cuenta = false; }
    fila('casual, sin tocar en ¡EMPUJÁ!', medir(senalDe({ ...BOTS.casual, pelea: { reac: 300, per: Infinity, jit: 0 } }), 'f'), '', { subida: true });
    fila('casual, sin tocar en ¡EMPUJÁ!, al 95 %', medir(senalDe({ ...BOTS.casual, pelea: { reac: 300, per: Infinity, jit: 0 } }), 'f', COLS, undefined, 9500, 9500));
    fila('distraído que en ¡EMPUJÁ! toca 3 por s', medir(senalDe({ ...BOTS.distraido, pelea: { reac: 550, per: 333, jit: 50 } }), 'f'));
    for (const per of [250, 400, 500]) fila(`casual, un toque cada ${per} ms en ¡EMPUJÁ!`, medir(senalDe({ ...BOTS.casual, pelea: { reac: 300, per, jit: per / 5 } }), 'f'), '', { subida: true });
    for (const [x, y] of [[300, 700], [500, 1000], [1000, 2500]]) for (const bb of ['casual', 'flojo']) fila(`${bb}, sigue tocando ${x}–${y} ms después`, medir((c, s) => jugarSenal(c, BOTS[bb], s, { cola: [x, y] }), 'f'));
    for (const [sd, lag] of [[120, 40], [80, 120]]) fila(`casual, desvío ${sd}, atraso ${lag}`, medir(senalDe({ ...BOTS.casual, sd, lag }), 'f'));
    const CIEGOS = [...[250, 400, 800].map(mu => [`Poisson, media ${mu} ms`, poisson(mu)]), ['uniforme 150–900 ms', r => r.entre(150, 900)], ['metrónomo de 500 ms', () => 500], ['metrónomo de 1000 ms', () => 1000]];
    for (const [nombre, prox] of CIEGOS) fila(`a ciegas, ${nombre}`, medir(ciego(prox), 'f'), '', { sinCausas: true });
    fila('casual · práctica del tutorial', medir(senalDe(BOTS.casual), 'f', tijera, { I: 8000, primera: true, reloj: 0, exiFija: exigenciaTabla(9000) }));
    fila('flojo · práctica del tutorial', medir(senalDe(BOTS.flojo), 'f', tijera, { I: 8000, primera: true, reloj: 0, exiFija: exigenciaTabla(9000) }));
    for (const b of ['casual', 'flojo']) fila(`Clásico · ${b} · envión de la casa`, medir((c, s) => jugarClasico(c, BOTS[b], s), 'c', CASA));
  }
  { const d = SUBIDAS.dur.sort((a, b) => a - b), n = d.length; console.log(n ? `Subidas falladas del casual y del flojo: ${n} · duración mediana ${(d[n >> 1] / 1000).toFixed(1)} s, percentil 90 ${(d[Math.floor(n * .9)] / 1000).toFixed(1)} s, máxima ${(d[n - 1] / 1000).toFixed(1)} s (tope ${FACIL.maxMs / 1000} s) · con todos los toques en PERFECTO o BIEN: ${(SUBIDAS.limpias * 100 / n).toFixed(0)} %` : 'Subidas falladas del casual y del flojo: ninguna'); }
  console.log(mal.length ? `\nFALLÓ el criterio de jugabilidad:\n  ${mal.join('\n  ')}` : `\nOK: criterio de jugabilidad cumplido (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(mal.length ? 1 : 0);
}
