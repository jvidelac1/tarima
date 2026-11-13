// Metas A a D del nivel 'u' (docs/JUEGO.md, G2.9) sobre los bots de tools/uno_bots.mjs. Lo corre tools/play_human.mjs.
// A, B, C y D ponen la prueba en rojo. C y D dependen de los factores de cuerpo (sim.json → cuerpoJuego, fijos) y de la base
// de cada tramo (rules.js → UNO.base), que calibra tools/margen_cal.mjs; acá se confirman con el núcleo de verdad.
import { jugarUno, ctxUno, BOTS_U, firma, verificar, ATL, datos } from './uno_bots.mjs';
import { mezclar, Azar } from '../web/js/sim/fixed.js';
import { cuerpoDe } from '../web/js/sim/rules.js';

const CAUSAS_U = new Set(['sin_altura', 'atras', 'fondo', 'aplastado', 'codos']);
const INTS = [8800, 9000, 9500, 9700, 10000, 10300];
const pc = (a, b) => (b ? (a * 100 / b) : 0);
const f1 = x => x.toFixed(1).padStart(5);

/** Juega `n` intentos por casilla y devuelve true si A y B se cumplen. */
export function medirUno({ n = 600 } = {}) {
  const t0 = Date.now(), mal = [], info = [];
  console.log(`Nivel 'u' (un toque, un tramo) · ${n} intentos por casilla · pesistas ${ATL.join(', ')} · teclado y dedo`);
  // ---------- A: sin coordinación ----------
  let casos = 0, distintos = 0, entrada = 0; const ejemplo = [];
  const curva = {};      // I → lev → id → {v, n, caida: {tramo: n}, mayor: {tramo: n}}
  const aus90 = { v: 0, n: 0 };
  for (const I of INTS) for (const lev of ['s', 'c']) for (const id of ATL) for (const dedo of [false, true]) for (let k = 0; k < n; k++) {
    const f = datos.atletas[id], env = lev === 'c' ? (k % 2 ? cuerpoDe(id).casa : 'split') : undefined;
    const sem = mezclar(I, k, ATL.indexOf(id), dedo ? 7 : 3, lev === 's' ? 1 : 2), ctx = ctxUno(id, lev, env, I, sem, dedo ? { tactil: true } : {});
    const out = {};
    for (const [b, B] of Object.entries(BOTS_U)) {
      const S = jugarUno(ctx, B, mezclar(sem, b.length, b.charCodeAt(0))), res = verificar(ctx, S).res; out[b] = res;
      if (res.res !== 'valido' && !CAUSAS_U.has(res.causa)) { entrada++; if (ejemplo.length < 4) ejemplo.push(`${b} ${id} ${lev} ${I / 100} %: ${res.res}:${res.causa}`); }
      if (res.res === 'fallo' && (!res.uno.tramo_caida || res.uno.gastos[res.uno.tramo_caida] === undefined)) { entrada++; if (ejemplo.length < 4) ejemplo.push(`${b}: caída sin tramo`); }
    }
    casos++;
    const ref = firma(out.reactivo);
    // Gameplay 2.1: ningún toque cambia el resultado, así que también el ausente (no toca nunca) da lo mismo
    for (const b of ['tardio', 'fantasma', 'mantiene', 'machacador', 'ausente']) if (firma(out[b]) !== ref) { distintos++; if (ejemplo.length < 4) ejemplo.push(`${b} ≠ reactivo: ${id} ${lev} ${I / 100} % ${firma(out[b])} vs ${ref}`); }
    if (I === 9000) { aus90.n++; if (out.ausente.res === 'valido') aus90.v++; }
    // curva y pesistas: el reactivo con el dedo (el novato del celular)
    if (dedo) {
      const C = (((curva[I] ||= {})[lev] ||= {})[id] ||= { v: 0, n: 0, caida: {}, mayor: {}, freno: 0, garra: 0 }), res = out.reactivo;
      C.n++; if (res.res === 'valido') C.v++; else { C.caida[res.uno.tramo_caida] = (C.caida[res.uno.tramo_caida] || 0) + 1; C.mayor[res.uno.tramo_mayor] = (C.mayor[res.uno.tramo_mayor] || 0) + 1; }
      if (res.uno.garra === 'usada') C.garra++;
    }
  }
  console.log(`A. ${casos} casos × 6 bots: resultados distintos entre reactivo, tardío, fantasma, mantiene, machacador y ausente: ${distintos} · caídas con causa de entrada o sin tramo: ${entrada} · ausente al 90 %: ${f1(pc(aus90.v, aus90.n))} %   meta 0 · 0 · ≥ 95 %`);
  if (distintos) mal.push(`A: ${distintos} casos con resultado distinto según cómo se toca (${ejemplo.join(' · ')})`);
  if (entrada) mal.push(`A: ${entrada} fallos por causa de entrada o sin tramo (${ejemplo.join(' · ')})`);
  if (pc(aus90.v, aus90.n) < 95) mal.push(`A: el ausente saca ${pc(aus90.v, aus90.n).toFixed(1)} % al 90 % (meta ≥ 95 %)`);

  // ---------- B: primer intento ----------
  { const fila = []; let peor = 100;
    for (const id of ATL) for (const lev of ['s', 'c']) {
      let v = 0; const N = n;
      for (let k = 0; k < N; k++) {
        const r = new Azar(mezclar(k, 61)), f = datos.atletas[id], I = 8880 + r.ent(241), env = lev === 'c' ? cuerpoDe(id).casa : undefined;
        const ctx = ctxUno(id, lev, env, I, mezclar(k, 62, ATL.indexOf(id), lev === 's' ? 1 : 2), { tactil: true, primera: true });
        const S = jugarUno(ctx, BOTS_U.reactivo, mezclar(k, 63)); if (verificar(ctx, S).res.res === 'valido') v++;
      }
      const x = pc(v, N); peor = Math.min(peor, x); fila.push(`${id} ${lev === 's' ? 'arranque' : 'dos tiempos'} ${x.toFixed(1)} %`);
    }
    console.log(`B. primer intento del novato (dedo) con la apertura sugerida (88,8 a 91,2 %): ${fila.join(' · ')}   meta ≥ 97 %`);
    if (peor < 97) mal.push(`B: el primer intento del novato baja a ${peor.toFixed(1)} %`); }

  // ---------- C: curva (informativo) ----------
  { console.log('C. curva del novato (dedo), válidos por intensidad, promedio de los tres pesistas · arranque / dos tiempos (y cada pesista):');
    const meta = I => (I <= 9500 ? [97, 100] : I === 9700 ? [85, 100] : I === 10000 ? [35, 65] : I >= 10300 ? [0, 20] : [0, 100]);
    let prev = 101, mono = true, cumple = true; const bajo = [];
    for (const I of INTS) {
      const filas = ['s', 'c'].map(lev => { const xs = ATL.map(id => curva[I][lev][id]), prom = xs.reduce((a, x) => a + pc(x.v, x.n), 0) / xs.length; return { lev, prom, xs }; });
      const prom = (filas[0].prom + filas[1].prom) / 2, [lo, hi] = meta(I); if (prom > prev + .5) mono = false; prev = prom; if (prom < lo || prom > hi) cumple = false;
      // hasta el 97 %, ningún pesista más de 10 puntos debajo del promedio (nadie queda injugable)
      if (I <= 9700) ATL.forEach((id, j) => { const x = (pc(filas[0].xs[j].v, filas[0].xs[j].n) + pc(filas[1].xs[j].v, filas[1].xs[j].n)) / 2; if (x < prom - 10) bajo.push(`${id} ${x.toFixed(0)} % al ${I / 100} %`); });
      console.log(`   ${(I / 100).toFixed(0)} %: ${filas.map(F => `${f1(F.prom)} % (${F.xs.map(x => pc(x.v, x.n).toFixed(0)).join('/')})`).join(' · ')} · promedio ${f1(prom)} %   meta ${lo === 0 ? `≤ ${hi}` : hi === 100 ? `≥ ${lo}` : `${lo} a ${hi}`} %`);
    }
    if (!cumple || !mono) mal.push(`C: la curva sale de sus bandas${mono ? '' : ' o no baja siempre'} (calibrar con tools/margen_cal.mjs)`);
    if (bajo.length) mal.push(`C: pesistas más de 10 puntos debajo del promedio: ${bajo.join(', ')}`);
    info.push(`C: ${cumple && mono && !bajo.length ? 'se cumple' : 'NO se cumple'}`); }

  // ---------- D: dónde caen (informativo) ----------
  { const tabla = {}; for (const I of [10000, 10300]) for (const lev of ['s', 'c']) for (const id of ATL) { const C = curva[I][lev][id], T = (tabla[id] ||= { n: 0 }); for (const [k, x] of Object.entries(C.mayor)) { T[k] = (T[k] || 0) + x; T.n += x; } }
    console.log('D. tramo que más gastó en las caídas del 100 al 103 %: ' + ATL.map(id => { const T = tabla[id]; return `${id}: ${['tiron', 'arriba', 'pararse'].map(k => `${k} ${pc(T[k] || 0, T.n).toFixed(0)} %`).join(', ')}`; }).join(' · '));
    // los pesistas se distinguen por la forma de la curva (Gameplay 2.1): entre el 97 y el 103 %, en algún punto dos difieren ≥ 15
    const al100 = [9700, 10000, 10300].flatMap(I => ['s', 'c'].map(lev => { const xs = ATL.map(id => pc(curva[I][lev][id].v, curva[I][lev][id].n)); return Math.max(...xs) - Math.min(...xs); }));
    // cada pesista cae donde dice su tarjeta: Largo al pararse, Potente arriba de la cabeza; Compacto, repartido
    const de = (id, k) => pc(tabla[id][k] || 0, tabla[id].n), dmal = [];
    if (de('brenner', 'pararse') < 70) dmal.push(`Largo cae por pararse en ${de('brenner', 'pararse').toFixed(0)} % (meta ≥ 70)`);
    if (de('marangi', 'arriba') < 70) dmal.push(`Potente cae por arriba en ${de('marangi', 'arriba').toFixed(0)} % (meta ≥ 70)`);
    for (const k of ['tiron', 'arriba', 'pararse']) if (de('ventura', k) > 60) dmal.push(`Compacto cae por ${k} en ${de('ventura', k).toFixed(0)} % (meta ≤ 60)`);
    if (Math.max(...al100) < 15) dmal.push(`entre el 97 y el 103 % los pesistas difieren a lo sumo ${Math.max(...al100).toFixed(0)} puntos (meta ≥ 15)`);
    if (dmal.length) mal.push(`D: ${dmal.join(' · ')}`);
    info.push(`D: entre el 97 y el 103 %, la mayor diferencia entre pesistas es de ${Math.max(...al100).toFixed(0)} puntos (meta ≥ 15): ${dmal.length ? 'NO se cumple' : 'se cumple'}`); }

  // ---------- novato / medio / bueno por tramo (informativo) ----------
  { const NIV = { novato: { ...BOTS_U.reactivo, sd: 120, lag: 60 }, medio: BOTS_U.reactivo, bueno: { reac: 170, sd: 30 } };
    console.log('Por tramo: válidos y dónde cae (tirón / arriba / pararse), novato (dedo) · medio · bueno, los tres pesistas, arranque y dos tiempos:');
    for (const I of [9500, 10000, 10300]) {
      const fila = Object.entries(NIV).map(([nombre, B]) => {
        let v = 0, N = 0; const caida = {};
        for (const id of ATL) for (const lev of ['s', 'c']) for (let k = 0; k < Math.ceil(n / 3); k++) {
          const ctx = ctxUno(id, lev, 'split', I, mezclar(k, 71, ATL.indexOf(id), lev === 's' ? 1 : 2), nombre === 'novato' ? { tactil: true } : {}), res = verificar(ctx, jugarUno(ctx, B, mezclar(k, 72))).res;
          N++; if (res.res === 'valido') v++; else caida[res.uno.tramo_caida] = (caida[res.uno.tramo_caida] || 0) + 1;
        }
        return `${nombre} ${f1(pc(v, N))} % [${['tiron', 'arriba', 'pararse'].map(k => pc(caida[k] || 0, N).toFixed(0)).join('/')}]`;
      });
      console.log(`   ${I / 100} %: ${fila.join(' · ')}`);
    } }
  for (const x of info) console.log('   ' + x);
  console.log(mal.length ? `\nFALLÓ (nivel 'u'):\n  ${mal.join('\n  ')}` : `\nOK: metas A, B, C y D del nivel 'u' (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return !mal.length;
}
