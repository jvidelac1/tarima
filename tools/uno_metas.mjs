// Metas A a D del nivel 'u' (docs/JUEGO.md, G2.9) sobre los bots de tools/uno_bots.mjs. Lo corre tools/play_human.mjs.
// A y B ponen la prueba en rojo; C y D se informan (dependen de los factores de cuerpo, que define quien calibra los
// pesistas con tools/margen_cal.mjs) y dicen PENDIENTE si no se cumplen.
import { jugarUno, ctxUno, BOTS_U, firma, verificar, ATL, datos } from './uno_bots.mjs';
import { mezclar, Azar } from '../web/js/sim/fixed.js';
import { gastoTramo, UNO } from '../web/js/sim/rules.js';

const CAUSAS_U = new Set(['sin_altura', 'atras', 'fondo', 'aplastado', 'codos']);
const INTS = [8800, 9000, 9500, 9700, 10000, 10300];
const pc = (a, b) => (b ? (a * 100 / b) : 0);
const f1 = x => x.toFixed(1).padStart(5);

/** Juega `n` intentos por casilla y devuelve true si A y B se cumplen. */
export function medirUno({ n = 600 } = {}) {
  const t0 = Date.now(), mal = [], info = [];
  console.log(`Nivel 'u' (un toque, un tramo) · ${n} intentos por casilla · pesistas ${ATL.join(', ')} · teclado y dedo`);
  // ---------- A: sin coordinación ----------
  let casos = 0, distintos = 0, entrada = 0, ausDif = 0; const ejemplo = [];
  const curva = {};      // I → lev → id → {v, n, caida: {tramo: n}, mayor: {tramo: n}}
  const aus90 = { v: 0, n: 0 };
  for (const I of INTS) for (const lev of ['s', 'c']) for (const id of ATL) for (const dedo of [false, true]) for (let k = 0; k < n; k++) {
    const f = datos.atletas[id], env = lev === 'c' ? (k % 2 ? f.enviones[0] : 'split') : undefined;
    const sem = mezclar(I, k, ATL.indexOf(id), dedo ? 7 : 3, lev === 's' ? 1 : 2), ctx = ctxUno(id, lev, env, I, sem, dedo ? { tactil: true } : {});
    const out = {};
    for (const [b, B] of Object.entries(BOTS_U)) {
      const S = jugarUno(ctx, B, mezclar(sem, b.length, b.charCodeAt(0))), res = verificar(ctx, S).res; out[b] = res;
      if (res.res !== 'valido' && !CAUSAS_U.has(res.causa)) { entrada++; if (ejemplo.length < 4) ejemplo.push(`${b} ${id} ${lev} ${I / 100} %: ${res.res}:${res.causa}`); }
      if (res.res === 'fallo' && (!res.uno.tramo_caida || res.uno.gastos[res.uno.tramo_caida] === undefined)) { entrada++; if (ejemplo.length < 4) ejemplo.push(`${b}: caída sin tramo`); }
    }
    casos++;
    const ref = firma(out.reactivo);
    for (const b of ['tardio', 'fantasma', 'mantiene', 'machacador']) if (firma(out[b]) !== ref) { distintos++; if (ejemplo.length < 4) ejemplo.push(`${b} ≠ reactivo: ${id} ${lev} ${I / 100} % ${firma(out[b])} vs ${ref}`); }
    // el ausente: lo único distinto es el ¼ del salto flojo y el ½ del pisotón (y lo que eso cambie en el resultado)
    { const a = out.ausente.uno, r = out.reactivo.uno, gp = gastoTramo('pararse', ctx.I, lev, env, ctx.cuerpo, {}), espera = UNO.sinSalto + Math.min(UNO.pisoton, gp);
      if (out.ausente.res === 'valido' && out.reactivo.res === 'valido' && a.garra === r.garra && r.margen_fin - a.margen_fin !== espera) ausDif++; }
    if (I === 9000) { aus90.n++; if (out.ausente.res === 'valido') aus90.v++; }
    // curva y pesistas: el reactivo con el dedo (el novato del celular)
    if (dedo) {
      const C = (((curva[I] ||= {})[lev] ||= {})[id] ||= { v: 0, n: 0, caida: {}, mayor: {}, freno: 0, garra: 0 }), res = out.reactivo;
      C.n++; if (res.res === 'valido') C.v++; else { C.caida[res.uno.tramo_caida] = (C.caida[res.uno.tramo_caida] || 0) + 1; C.mayor[res.uno.tramo_mayor] = (C.mayor[res.uno.tramo_mayor] || 0) + 1; }
      if (res.uno.garra === 'usada') C.garra++;
    }
  }
  console.log(`A. ${casos} casos × 6 bots: resultados distintos entre reactivo, tardío, fantasma, mantiene y machacador: ${distintos} · caídas con causa de entrada o sin tramo: ${entrada} · ausente fuera de ¼ + ½: ${ausDif} · ausente al 90 %: ${f1(pc(aus90.v, aus90.n))} %   meta 0 · 0 · 0 · ≥ 95 %`);
  if (distintos) mal.push(`A: ${distintos} casos con resultado distinto según cómo se toca (${ejemplo.join(' · ')})`);
  if (entrada) mal.push(`A: ${entrada} fallos por causa de entrada o sin tramo (${ejemplo.join(' · ')})`);
  if (ausDif) mal.push(`A: el ausente difiere en algo más que ¼ + ½ disco en ${ausDif} casos`);
  if (pc(aus90.v, aus90.n) < 95) mal.push(`A: el ausente saca ${pc(aus90.v, aus90.n).toFixed(1)} % al 90 % (meta ≥ 95 %)`);

  // ---------- B: primer intento ----------
  { const fila = []; let peor = 100;
    for (const id of ATL) for (const lev of ['s', 'c']) {
      let v = 0; const N = n;
      for (let k = 0; k < N; k++) {
        const r = new Azar(mezclar(k, 61)), f = datos.atletas[id], I = 8880 + r.ent(241), env = lev === 'c' ? f.enviones[0] : undefined;
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
    let prev = 101, mono = true, cumple = true;
    for (const I of INTS) {
      const filas = ['s', 'c'].map(lev => { const xs = ATL.map(id => curva[I][lev][id]), prom = xs.reduce((a, x) => a + pc(x.v, x.n), 0) / xs.length; return { lev, prom, xs }; });
      const prom = (filas[0].prom + filas[1].prom) / 2, [lo, hi] = meta(I); if (prom > prev + .5) mono = false; prev = prom; if (prom < lo || prom > hi) cumple = false;
      console.log(`   ${(I / 100).toFixed(0)} %: ${filas.map(F => `${f1(F.prom)} % (${F.xs.map(x => pc(x.v, x.n).toFixed(0)).join('/')})`).join(' · ')} · promedio ${f1(prom)} %   meta ${lo === 0 ? `≤ ${hi}` : hi === 100 ? `≥ ${lo}` : `${lo} a ${hi}`} %`);
    }
    info.push(`C: ${cumple && mono ? 'se cumple' : 'PENDIENTE (calibración con los factores de cuerpo: tools/margen_cal.mjs)'}${mono ? '' : ' · la curva no es monótona'}`); }

  // ---------- D: dónde caen (informativo) ----------
  { const tabla = {}; for (const I of [10000, 10300]) for (const lev of ['s', 'c']) for (const id of ATL) { const C = curva[I][lev][id], T = (tabla[id] ||= { n: 0 }); for (const [k, x] of Object.entries(C.mayor)) { T[k] = (T[k] || 0) + x; T.n += x; } }
    console.log('D. tramo que más gastó en las caídas del 100 al 103 %: ' + ATL.map(id => { const T = tabla[id]; return `${id}: ${['tiron', 'arriba', 'pararse'].map(k => `${k} ${pc(T[k] || 0, T.n).toFixed(0)} %`).join(', ')}`; }).join(' · '));
    const al100 = ['s', 'c'].map(lev => { const xs = ATL.map(id => pc(curva[10000][lev][id].v, curva[10000][lev][id].n)); return Math.max(...xs) - Math.min(...xs); });
    info.push(`D: al 100 %, la mayor diferencia entre pesistas es de ${Math.max(...al100).toFixed(0)} puntos (meta ≥ 15): ${Math.max(...al100) >= 15 ? 'se cumple' : 'PENDIENTE (los pesistas todavía usan CUERPO_NEUTRO si sim.json no trae cuerpoJuego)'}`); }

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
  console.log(mal.length ? `\nFALLÓ (nivel 'u'):\n  ${mal.join('\n  ')}` : `\nOK: metas A y B del nivel 'u' (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return !mal.length;
}
