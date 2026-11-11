// Prueba de jugabilidad sin navegador (docs/CONTROLES.md, sección 9). Bots con error humano juegan intentos sueltos sobre
// el núcleo, pasando por la capa de traducción (web/js/game/controles.js) y mirando SOLO la señal visible (`senal()`):
//   casual   toca a `objetivo + 40 ms + error` con error de campana de 80 ms de desvío;
//   flojo    lo mismo con 160 ms de desvío y reacciones más lentas;
//   al azar  toca sin mirar la señal, en instantes de Poisson (mínimo 100 ms entre toques); vale el peor de cinco ritmos.
// Criterio (aperturas al 88 a 92 % del techo, Fácil, envión de tijera): casual ≥ 85 %, flojo ≥ 50 %, al azar < 10 %.
// Cada intento se recalcula con simular() y tiene que dar lo mismo. Sale con error si el criterio no se cumple.
// Uso: node tools/play_human.mjs [--n=2000] [--imin=8800 --imax=9200] [--info]   (--info agrega filas que no son criterio)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { Intento, simular } from '../web/js/sim/attempt.js';
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { exigenciaTabla } from '../web/js/sim/rules.js';
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
};
const PASO = 8;      // ms: cada cuánto el bot «mira la pantalla»

/** Sesión de un intento: máquina incremental más la lista de entradas que quedaría en el registro. */
function sesion(ctx, ctl, conf) {
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

/** Bot que mira la señal: un toque por señal en Fácil. */
export function jugarSenal(ctx, B, sem, o = {}) {
  const r = new Azar(mezclar(sem, 11)), S = sesion(ctx, 'f', 1000 + r.ent(1500)), m = S.m;
  let clave = '', plan = Infinity, toques = 0;
  for (let g = 0; !m.res && g < 400000; g++) {
    const s = senal(m, m.t, 'f'), k = s ? s.clave + ':' + (s.desde ?? '') : '';
    if (k !== clave) {      // apareció una señal nueva: el bot decide una sola vez cuándo va a tocar
      clave = k; toques = 0;
      plan = !s ? Infinity : s.tipo === 'libre' ? m.t + r.entre(B.reac[0], B.reac[1]) : s.tipo === 'cierre' ? Math.max(m.t + 1, s.objetivo + B.lag + r.campana(B.sd)) : s.tipo === 'empuja' && !o.sinEmpujar ? Math.max(m.t, s.desde) + B.pelea.reac : Infinity;
    }
    if (plan <= m.t + PASO) {
      S.tecla(Math.max(plan, m.t)); toques++;
      plan = s && s.tipo === 'empuja' ? m.t + Math.max(100, B.pelea.per + r.campana(B.pelea.jit)) : Infinity;
      continue;
    }
    S.av(m.t + PASO);
  }
  if (!m.res) throw new Error('el intento no terminó');
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
/** Porcentaje de válidos por levantamiento. Verifica en cada intento que el registro recalcula igual y que está bien formado. */
function medir(jugar, ctl, envDe, extra) {
  const out = {};
  for (const lev of ['s', 'c']) {
    let v = 0; const causas = {};
    for (let k = 0; k < N; k++) {
      const id = ATL[k % 3], r = new Azar(mezclar(k, 3)), I = IMIN + r.ent(IMAX - IMIN + 1), ctx = ctxDe(id, lev, envDe(datos.atletas[id]), I, mezclar(k, 5), ctl, extra);
      const S = jugar(ctx, mezclar(k, lev === 's' ? 21 : 22)), re = simular(ctx, S.conf, S.ent);
      if (JSON.stringify(re.res) !== JSON.stringify(S.m.res)) throw new Error(`intento ${k}: el recálculo no coincide`);
      let t0 = 0, n = 0; for (const e of S.ent) { if (e[0] < t0 || !Number.isInteger(e[0])) throw new Error('entradas fuera de orden'); t0 = e[0]; n += e[1] ? 1 : -1; if (n < 0) throw new Error('se levanta un contacto que no estaba apoyado'); }
      if (S.m.res.res === 'valido') v++; else { const c = S.m.res.causa; causas[c] = (causas[c] || 0) + 1; }
    }
    out[lev] = { pct: v * 100 / N, causas: Object.entries(causas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, x]) => `${c} ${(x * 100 / N).toFixed(0)}`).join(', ') };
  }
  return out;
}
const fila = (nombre, x, meta = '') => console.log(`${nombre.padEnd(38)} arranque ${x.s.pct.toFixed(1).padStart(5)} %   dos tiempos ${x.c.pct.toFixed(1).padStart(5)} %   ${meta}${x.s.causas || x.c.causas ? `   [${x.s.causas} | ${x.c.causas}]` : ''}`);
const poisson = mu => r => Math.max(100, Math.round(-mu * Math.log(1 - (r.ent(1000000) + .5) / 1000000)));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now(), tijera = () => 'split', casa = f => f.enviones[0], mal = [];
  console.log(`Jugabilidad · ${N} intentos por casilla · intensidad ${IMIN / 100} a ${IMAX / 100} % · los tres pesistas`);
  for (const b of ['casual', 'flojo']) {
    const x = medir((c, s) => jugarSenal(c, BOTS[b], s), 'f', tijera); fila(`Fácil · ${b} (desvío ${BOTS[b].sd} ms)`, x, `meta ≥ ${META[b]} %`);
    for (const lev of ['s', 'c']) if (x[lev].pct < META[b]) mal.push(`${b} en ${lev === 's' ? 'arranque' : 'dos tiempos'}: ${x[lev].pct.toFixed(1)} % (meta ${META[b]} % o más)`);
  }
  const peor = { s: { pct: 0 }, c: { pct: 0 } };
  for (const mu of [250, 400, 600, 800, 1200]) { const x = medir((c, s) => jugarCiego(c, poisson(mu), s), 'f', tijera); if (INFO) fila(`  al azar, Poisson media ${mu} ms`, x); for (const lev of ['s', 'c']) if (x[lev].pct >= peor[lev].pct) peor[lev] = { ...x[lev], mu }; }
  fila('Fácil · al azar (peor de 5 ritmos)', peor, `meta < ${META.azar} %`);
  for (const lev of ['s', 'c']) if (peor[lev].pct >= META.azar) mal.push(`al azar en ${lev === 's' ? 'arranque' : 'dos tiempos'}: ${peor[lev].pct.toFixed(1)} % (meta menos de ${META.azar} %)`);
  if (INFO) {
    console.log('— informativo (no es criterio) —');
    for (const b of ['casual', 'flojo']) fila(`Fácil · ${b} · envión de la casa`, medir((c, s) => jugarSenal(c, BOTS[b], s), 'f', casa));
    fila('Fácil · casual · sin tocar en ¡EMPUJÁ!', medir((c, s) => jugarSenal(c, BOTS.casual, s, { sinEmpujar: true }), 'f', tijera));
    fila('Fácil · casual · práctica del tutorial', medir((c, s) => jugarSenal(c, BOTS.casual, s), 'f', tijera, { I: 8000, primera: true, reloj: 0, exiFija: exigenciaTabla(9000) }));
    fila('Fácil · flojo · práctica del tutorial', medir((c, s) => jugarSenal(c, BOTS.flojo, s), 'f', tijera, { I: 8000, primera: true, reloj: 0, exiFija: exigenciaTabla(9000) }));
    for (const b of ['casual', 'flojo']) fila(`Clásico · ${b} · envión de la casa`, medir((c, s) => jugarClasico(c, BOTS[b], s), 'c', casa));
    for (const [a, b] of [[150, 900], [300, 900], [600, 900]]) fila(`  ciego, uniforme ${a}–${b} ms`, medir((c, s) => jugarCiego(c, r => r.entre(a, b), s), 'f', tijera));
    for (const p of [500, 750, 1000]) fila(`  ciego, metrónomo de ${p} ms`, medir((c, s) => jugarCiego(c, () => p, s), 'f', tijera));
  }
  console.log(mal.length ? `\nFALLÓ el criterio de jugabilidad:\n  ${mal.join('\n  ')}` : `\nOK: criterio de jugabilidad cumplido (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(mal.length ? 1 : 0);
}
