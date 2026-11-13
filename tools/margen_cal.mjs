// Calibración de la energía del nivel 'u' (docs/JUEGO.md, Gameplay 2 y 2.1, metas C y D). Sin navegador y sin bots: ningún
// toque cambia el resultado (meta A), así que un intento depende solo de la suerte de cada tramo (rules.js, ruidoDe: uniforme
// entre −ruido y +ruido pasos de UNO.ruidoPaso, una por tramo) y de la garra. Se recorren TODAS las combinaciones de suerte
// con las mismas reglas que attempt.js (_uCierra, garraAlcanza): la chance es exacta. tools/play_human.mjs (uno_metas.mjs)
// confirma lo mismo con el núcleo de verdad.
//
// Los cuerpos (rules.js → CUERPOS_U: factores por tramo y suerte) los decide el diseño de cada pesista. Lo que se calibra es la
// base de cada tramo (UNO.base). Uso:
//   node tools/margen_cal.mjs           informe con la base de rules.js (sale con error si C o D no se cumplen)
//   node tools/margen_cal.mjs --buscar  recorre una grilla de bases y muestra las mejores que cumplen C y D
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { UNO, TRAMOS, gastoTramo, cuerpoDe, chanceUno, conSuerte, garraAlcanza } from '../web/js/sim/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/sim.json'), 'utf8')));
const ATL = ['ventura', 'brenner', 'marangi'], TIPO = { ventura: 'Compacto', brenner: 'Largo', marangi: 'Potente' };
const INTS = [8800, 9000, 9500, 9700, 10000, 10300];
const cuerpos = Object.fromEntries(ATL.map(id => [id, cuerpoDe(id)]));
// --casa=split: prueba a Compacto con la tijera de la casa (sin tocar sim.json)
{ const c = process.argv.find(a => a.startsWith('--casa='))?.split('=')[1]; if (c) cuerpos.ventura.casa = c; }
/** Enviones con que se mide el dos tiempos de cada pesista (mitad y mitad, como uno_metas.mjs): el de la casa y la tijera. */
const envs = id => [cuerpos[id].casa || 'split', 'split'];

/** Todas las combinaciones de suerte del cuerpo (una por tramo), cada una con el mismo peso. */
function suertes(cuerpo, n = 3) {
  const k = cuerpo.ruido || 0, out = [[]];
  for (let i = 0; i < n; i++) { const sig = []; for (const x of out) for (let j = -k; j <= k; j++) sig.push([...x, j * UNO.ruidoPaso]); out.splice(0, out.length, ...sig); }
  return out;
}
/** Un intento con la suerte `su` (una por tramo): {ok, caida, mayor}. Mismas reglas que attempt.js (_uCierra). */
function jugar(I, lev, env, cuerpo, su) {
  const T = TRAMOS[lev], G = T.map(tr => gastoTramo(tr, I, lev, env, cuerpo));
  let m = UNO.margen, garra = true, mayor = null, gm = -1;
  for (let i = 0; i < T.length; i++) {
    const g = conSuerte(G[i], su[i]); m -= g; if (g > gm) { gm = g; mayor = T[i]; }
    if (m >= 0) continue;
    if (m >= UNO.frenoMin && garra && garraAlcanza(m, G.slice(i + 1))) { garra = false; m += UNO.garra; continue; }
    return { ok: false, caida: T[i], mayor };
  }
  return { ok: true, mayor };
}

/** Chance (0 a 1), exacta con chanceUno (rules.js, la del panel). */
const chance = (I, lev, env, cuerpo) => chanceUno(I, lev, env, cuerpo) / 1000;
/** Todo lo que miden las metas C y D con la base actual de UNO. */
export function medir() {
  const C = {}, D = {};
  for (const I of INTS) for (const lev of ['s', 'c']) for (const id of ATL) {
    const es = lev === 's' ? [undefined] : envs(id); let v = 0;
    for (const env of es) v += chance(I, lev, env, cuerpos[id]) / es.length;
    ((C[I] ||= {})[lev] ||= {})[id] = v * 100;
    if (I >= 9800) { const S = suertes(cuerpos[id]), w = 1 / S.length; for (const env of es) for (const su of S) {
      const r = jugar(I, lev, env, cuerpos[id], su); if (r.ok) continue;
      const T = (D[id] ||= { n: 0 }); T[r.mayor] = (T[r.mayor] || 0) + w / es.length; T.n += w / es.length;
    } }
  }
  // squat de Compacto contra tijera, intensidad por intensidad
  const squat = INTS.map(I => chance(I, 'c', 'squat', cuerpos.ventura) - chance(I, 'c', 'split', cuerpos.ventura));
  return { C, D, squat };
}

const prom = o => Object.values(o).reduce((a, x) => a + x, 0) / Object.values(o).length;
/** Revisa las metas. Devuelve {mal: [...], puntos} (puntos: qué tan lejos queda la curva del centro de cada banda). */
export function revisar(R) {
  const mal = [];
  const avg = I => (prom(R.C[I].s) + prom(R.C[I].c)) / 2;
  const banda = { 8800: [97, 100], 9000: [97, 100], 9500: [97, 100], 9700: [85, 100], 10000: [35, 65], 10300: [0, 20] };
  let prev = 101;
  for (const I of INTS) {
    const a = avg(I), [lo, hi] = banda[I];
    if (a < lo - 1e-6 || a > hi + 1e-6) mal.push(`C: ${I / 100} % da ${a.toFixed(1)} % (meta ${lo} a ${hi})`);
    if (a > prev + .5) mal.push(`C: la curva sube en ${I / 100} %`); prev = a;
    if (I <= 9700) for (const id of ATL) { const x = (R.C[I].s[id] + R.C[I].c[id]) / 2; if (x < a - 10) mal.push(`C: ${TIPO[id]} queda ${(a - x).toFixed(0)} puntos debajo del promedio en ${I / 100} %`); }
  }
  // los pesistas se distinguen por la forma de su curva (Compacto empinada y segura, Potente ancha): entre el 97 y el 103 %,
  // en algún punto dos pesistas difieren en ≥ 15 puntos
  const dif = Math.max(...[9700, 10000, 10300].flatMap(I => ['s', 'c'].map(lev => Math.max(...Object.values(R.C[I][lev])) - Math.min(...Object.values(R.C[I][lev])))));
  if (dif < 15) mal.push(`D: entre el 97 y el 103 % los pesistas difieren a lo sumo ${dif.toFixed(0)} puntos (meta ≥ 15)`);
  const pc = (id, k) => (R.D[id] ? (R.D[id][k] || 0) * 100 / R.D[id].n : 0);
  if (pc('brenner', 'pararse') < 70) mal.push(`D: Largo cae por pararse en ${pc('brenner', 'pararse').toFixed(0)} % (meta ≥ 70)`);
  if (pc('marangi', 'arriba') < 70) mal.push(`D: Potente cae por arriba en ${pc('marangi', 'arriba').toFixed(0)} % (meta ≥ 70)`);
  for (const k of ['tiron', 'arriba', 'pararse']) if (pc('ventura', k) > 60) mal.push(`D: Compacto cae por ${k} en ${pc('ventura', k).toFixed(0)} % (meta ≤ 60)`);
  if (cuerpos.ventura.casa === 'squat' && R.squat.some(x => x < -.005)) mal.push('D: el squat de Compacto rinde menos que la tijera');
  const puntos = Math.abs(avg(10000) - 50) + Math.abs(avg(10300) - 8) / 2 + Math.abs(avg(9700) - 93) / 2;
  return { mal, puntos, avg, dif, pc };
}

function informe(R, V) {
  console.log(`Base: tirón ${UNO.base.tiron} · arriba ${UNO.base.arriba} · pararse ${UNO.base.pararse} · r(I) desde ${UNO.rDesde / 100} % · suerte ${ATL.map(id => `${TIPO[id]} ±${cuerpos[id].ruido * UNO.ruidoPaso}`).join(', ')} · garra ${UNO.garra}`);
  console.log('C. chance de cualquiera (ningún toque cambia el resultado; garra si alcanza), arranque / dos tiempos, por pesista (Compacto/Largo/Potente):');
  for (const I of INTS) console.log(`   ${(I / 100).toFixed(0)} %: ${['s', 'c'].map(lev => `${prom(R.C[I][lev]).toFixed(1).padStart(5)} % (${ATL.map(id => R.C[I][lev][id].toFixed(0)).join('/')})`).join(' · ')} · promedio ${V.avg(I).toFixed(1)} %`);
  console.log(`D. entre el 97 y el 103 %, mayor diferencia entre pesistas: ${V.dif.toFixed(0)} puntos · tramo que más gastó en las caídas del 98 al 103 %: ${ATL.map(id => `${TIPO[id]} ${['tiron', 'arriba', 'pararse'].map(k => `${k} ${V.pc(id, k).toFixed(0)} %`).join(', ')}`).join(' · ')}`);
  console.log(`   squat de Compacto menos tijera (puntos): ${R.squat.map((x, i) => `${INTS[i] / 100} % ${(x * 100).toFixed(0)}`).join(' · ')}`);
  console.log(V.mal.length ? `PENDIENTE:\n  ${V.mal.join('\n  ')}` : 'OK: metas C y D con los cuerpos de rules.js (CUERPOS_U)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--buscar')) {
    const orig = { ...UNO.base }, todos = [], paso = +(process.argv.find(a => a.startsWith('--paso='))?.split('=')[1] || 100);
    const B0 = { ...UNO.base }, R = +(process.argv.find(a => a.startsWith('--radio='))?.split('=')[1] || 300);
    for (let bt = B0.tiron - R; bt <= B0.tiron + R; bt += paso) for (let ba = B0.arriba - R; ba <= B0.arriba + R; ba += paso) for (let bp = B0.pararse - R; bp <= B0.pararse + R; bp += paso) {
      UNO.base.tiron = bt; UNO.base.arriba = ba; UNO.base.pararse = bp;
      const V = revisar(medir()); todos.push({ bt, ba, bp, mal: V.mal, puntos: V.puntos, a100: V.avg(10000), a103: V.avg(10300), a97: V.avg(9700) });
    }
    todos.sort((a, b) => a.mal.length - b.mal.length || a.puntos - b.puntos);
    console.log(`${todos.filter(x => !x.mal.length).length} bases cumplen C y D (paso ${paso}). Las mejores (cerca de 50 % al 100 %, 8 % al 103 % y 93 % al 97 %):`);
    for (const x of todos.slice(0, 12)) console.log(`   tirón ${x.bt} · arriba ${x.ba} · pararse ${x.bp}: 97 % ${x.a97.toFixed(1)} · 100 % ${x.a100.toFixed(1)} · 103 % ${x.a103.toFixed(1)}${x.mal.length ? ' · ' + x.mal.join(' · ') : ''}`);
    Object.assign(UNO.base, orig);
  } else {
    const R = medir(), V = revisar(R); informe(R, V); process.exit(V.mal.length ? 1 : 0);
  }
}
