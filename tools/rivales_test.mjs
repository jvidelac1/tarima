// Estrategia de kilos de los rivales, sin navegador (pedido del 13-nov: «que los otros levantadores tengan su propia
// estrategia de pesos, no que siempre usen lo mismo que yo»). Juega finales enteras en 'b' (lo que trae el juego): el
// jugador es un bot de tools/barra_bots.mjs y lo único que cambia entre estrategias es qué kilos pide.
//   panel      confirma lo que el panel trae puesto (el entrenador, web/js/sim/entrenador.js), abre al 90 %
//   prudente   abre al 90 % y sube siempre 2 kg (repite si cae)
//   fijo       abre al 93 % y sube 4 y 3 kg (el plan viejo del entrenador)
//   codicioso  abre al 95 % y pide siempre el peso más alto que sube 3 de cada 10 veces
//   azar       abre en cualquier punto del rango y sube de 1 a 6 kg al azar: es la estrategia que mide si los rivales
//              SIGUEN al jugador (si copian, sus kilos se mueven con los del jugador aunque este pida cualquier cosa)
// Mide, con rivales viejos (registros sin `ia`) y nuevos (ai.js → PERSONALIDADES, HUELLA_IA):
//   correlación entre los kilos de cada intento del jugador y los del rival en el mismo intento (por pareja de pesistas
//   y por intento, centrada; con la estrategia azar es la medida de espejo), «coincide»: intentos del rival a ±1 kg
//   del jugador contra lo esperado por azar (el mismo rival en otra final), y cambios del rival que caen justo en lo que
//   declaró el jugador o un kilo más;
//   oro del jugador por nivel y estrategia (el bot de --jugador), y total, sin marca y válidos de cada rival;
//   contrafáctica: qué parte de las decisiones de los rivales cambia si el jugador declara otra cosa o tiene otra marca;
//   variedad: aperturas distintas por rival entre semillas, y planes distintos (los tres pedidos de cada levantamiento).
// Criterio (solo con --ia=nuevo): correlación con azar ≤ 0,25 con cada rival; cambios espejo ≤ 0,15 por final (los que
// quedan son reacciones a la tabla en el último dos tiempos, que en totales a veces caen en un kilo más que el jugador);
// ninguna decisión de un rival cambia si el jugador declara otra cosa (contrafáctica, ≤ 1 %); amistoso: el novato
// con el panel gana el oro en ≥ 40 %; normal: el novato con el panel gana menos que con amistoso y ≥ 15 %; al menos 8
// aperturas de arranque distintas por rival y 40 planes distintos cada 100 finales.
// N finales por estrategia y nivel, con el jugador manejando a cada pesista por turno.
// Uso: node tools/rivales_test.mjs [--n=500] [--ia=viejo|nuevo] [--jugador=novato] [--estrategias=panel,azar]
import { Partida } from '../web/js/sim/match.js';
import { mezclar } from '../web/js/sim/fixed.js';
import { cuerpoBarra, KG_MAX } from '../web/js/sim/rules.js';
import { sugerencia, chanceDe } from '../web/js/sim/entrenador.js';
import * as AI from '../web/js/sim/ai.js';
import { jugarBarra, PERFILES, datos, ATL, NOMBRE } from './barra_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 500), IA = arg('ia') || (AI.HUELLA_IA ? 'nuevo' : 'viejo'), QUIEN = arg('jugador') || 'novato';
const SLOTS = ['s1', 's2', 's3', 'c1', 'c2', 'c3'], SOLO = arg('estrategias') ? arg('estrategias').split(',') : null;

const ESTRATEGIAS = {
  panel: { abre: () => 0.90, kg: (p, i, lev) => (p.at[i].cambios === 0 ? sugerencia(p, i, lev, cuerpoBarra(p.at[i].id).casa) : null) },
  prudente: { abre: () => 0.90, kg: (p, i, lev) => { const u = p.at[i][lev].at(-1); return u && u.res === 'valido' ? u.kg + 2 : null; } },
  fijo: { abre: () => 0.93, kg: (p, i, lev) => { const a = p.at[i], u = a[lev].at(-1); return u ? (u.res === 'valido' ? u.kg + [4, 3][a[lev].length - 1] : u.kg) : null; } },
  codicioso: { abre: () => 0.95, kg: (p, i, lev) => { if (!p.at[i][lev].length) return null; let k = p.minimo(i); while (k + 1 <= KG_MAX && chanceDe(p, i, lev, k + 1, cuerpoBarra(p.at[i].id).casa) >= 300) k++; return k; } },
  azar: { abre: r => 0.88 + (r % 1000) / 1000 * 0.09, kg: (p, i, lev, r) => { const u = p.at[i][lev].at(-1); return u ? Math.max(p.minimo(i), u.kg + (u.res === 'valido' ? 1 + (r % 6) : 0)) : null; } },
};

/** Una final: devuelve los kilos de cada intento de cada pesista, los cambios de los rivales y la tabla. */
export function final({ yo, nivel, estrategia, k, ia, B }) {
  const semilla = mezclar(k, 7310, yo, nivel === 'normal' ? 1 : nivel === 'dificil' ? 2 : 0), E = ESTRATEGIAS[estrategia];
  const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: 'b', tactil: true, ...(ia ? { ia } : {}), atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
  const f = datos.atletas[ATL[yo]];
  for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(f.techo[lev] * E.abre(mezclar(semilla, lev === 's' ? 1 : 2)))))); }
  const aperturas = p.at.map(a => ({ s: a.decl.s, c: a.decl.c }));
  p.empezar();
  const cambios = [], palabras = {};
  for (let g = 0; p.fase !== 'fin' && g < 90; g++) {
    if (p.fase === 'intervalo') { p.empezar(); continue; }
    const L = p.llamado;
    if (p.at[L.a].ctrl !== 'persona') {
      if (p.estiloDe) { const w = p.estiloDe(L.a, L.lev, L.n); if (w) palabras[w] = (palabras[w] || 0) + 1; }
      p.resolverIA(); continue;
    }
    const kg = E.kg(p, yo, L.lev, mezclar(semilla, g, 11));
    if (kg !== null && kg !== L.kg && !p.cambioValido(0, kg)) { if (p.cambio(0, kg).desplazado) continue; }
    const env = L.lev === 'c' ? cuerpoBarra(ATL[yo]).casa : undefined, ctx = p.contexto(env), S = jugarBarra(ctx, B, mezclar(semilla, g, 3));
    const x = p.resolver({ conf: S.conf, env, ent: S.ent });
    for (const c of x.avisos) cambios.push({ a: c.a, kg: c.a_kg, declYo: p.at[yo].decl[L.lev], kgYo: L.kg });
  }
  const kilos = p.at.map(a => Object.fromEntries(SLOTS.map(s => [s, a[s[0]][+s[1] - 1]?.kg ?? null])));
  const t = p.tabla(), fila = t.find(x => x.a === yo);
  return { p, aperturas, kilos, cambios, oro: fila.puesto === 1 && fila.total > 0, total: fila.total, sinMarcaRival: t.filter(x => x.a !== yo && !x.total).length, palabras };
}

/**
 * Contrafáctica: antes de cada llamado, ¿qué pediría cada rival si el jugador hubiera DECLARADO 3 kg más o menos, o si tuviera
 * 3 kg más de marca? Devuelve la fracción de decisiones que cambian con lo declarado (espejo) y con la marca (la tabla).
 */
function dependencia(ia, n) {
  const B = PERFILES[QUIEN], D = { n: 0, decl: 0, marca: 0 };
  const dec = (p, i) => {
    if (!ia) return AI.decidir(p, i);
    const a = p.at[i], m = { ...a.plan.momento }, k = a[p.lev].length ? AI.decidirPlan(p, i, true) : a.decl[p.lev]; a.plan.momento = m; return k;
  };
  for (const nivel of ['amistoso', 'normal']) for (let k = 0; k < n; k++) {
    const yo = k % 3, semilla = mezclar(k, 999, yo, nivel === 'normal' ? 1 : 0);
    const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: 'b', tactil: true, ...(ia ? { ia } : {}), atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
    for (const lev of ['s', 'c']) p.abrir(yo, lev, Math.round(datos.atletas[ATL[yo]].techo[lev] * .9));
    p.empezar();
    for (let g = 0; p.fase !== 'fin' && g < 90; g++) {
      if (p.fase === 'intervalo') { p.empezar(); continue; }
      const L = p.llamado, lev = L.lev, Y = p.at[yo];
      for (const b of p.at) if (b.ctrl === 'juego' && b[lev].length < 3) {
        const k0 = dec(p, b.i), d0 = Y.decl[lev], m0 = Y.mejor[lev];
        Y.decl[lev] = d0 + 3; const k1 = dec(p, b.i); Y.decl[lev] = d0 - 3; const k2 = dec(p, b.i); Y.decl[lev] = d0;
        Y.mejor[lev] = m0 ? m0 + 3 : 0; const k3 = dec(p, b.i); Y.mejor[lev] = m0;
        D.n++; if (k1 !== k0 || k2 !== k0) D.decl++; if (k3 !== k0) D.marca++;
      }
      if (p.at[L.a].ctrl !== 'persona') { p.resolverIA(); continue; }
      const kg = ESTRATEGIAS.panel.kg(p, yo, lev);
      if (kg !== null && kg !== L.kg && !p.cambioValido(0, kg)) { if (p.cambio(0, kg).desplazado) continue; }
      const env = lev === 'c' ? cuerpoBarra(ATL[yo]).casa : undefined, ctx = p.contexto(env), S = jugarBarra(ctx, B, mezclar(semilla, g, 3));
      p.resolver({ conf: S.conf, env, ent: S.ent });
    }
  }
  return { n: D.n, decl: D.decl / D.n, marca: D.marca / D.n };
}

const pearson = (xs, ys) => {
  const n = xs.length; if (n < 3) return 0; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

function medir(ia) {
  const B = PERFILES[QUIEN], out = { corr: {}, oro: {}, variedad: {}, coincide: {}, espejo: {}, sinMarca: {}, totales: {} };
  for (const nivel of ['amistoso', 'normal']) for (const est of Object.keys(ESTRATEGIAS).filter(e => !SOLO || SOLO.includes(e))) {
    // por pareja (jugador, rival) y slot: listas de kilos
    const oro = { n: 0, si: 0 }, tot = {}; let cambiosN = 0, cambiosEspejo = 0, sinMarca = 0;
    const kilosPorFinal = {};
    for (let k = 0; k < N; k++) {
      const yo = k % 3, r = final({ yo, nivel, estrategia: est, k, ia, B });
      oro.n++; if (r.oro) oro.si++; sinMarca += r.sinMarcaRival;
      for (const f of r.p.tabla()) if (f.a !== yo) { const T = (tot[f.id] ||= { n: 0, s: 0, s2: 0, cero: 0, int: 0, val: 0 }), a = r.p.at[f.a]; T.n++; if (f.total) { T.s += f.total; T.s2 += f.total * f.total; } else T.cero++; for (const x of [...a.s, ...a.c]) { T.int++; if (x.res === 'valido') T.val++; } }
      for (const c of r.cambios) { cambiosN++; if (c.kg === c.declYo || c.kg === c.declYo + 1 || c.kg === c.kgYo + 1) cambiosEspejo++; }
      for (let j = 0; j < 3; j++) if (j !== yo) {
        const key = `${ATL[yo]}>${ATL[j]}`; (kilosPorFinal[key] ||= []).push({ yo: r.kilos[yo], el: r.kilos[j], ap: r.aperturas[j] });
      }
    }
    // correlación centrada por slot dentro de cada pareja, agrupada por rival
    const porRival = {}, coin = {};
    for (const [key, fs] of Object.entries(kilosPorFinal)) {
      const riv = key.split('>')[1], P = (porRival[riv] ||= { x: [], y: [] }), C = (coin[riv] ||= { n: 0, si: 0, base: 0, dif: 0 });
      for (const s of SLOTS) {
        const ok = fs.filter(f => f.yo[s] !== null && f.el[s] !== null); if (ok.length < 3) continue;
        const mx = ok.reduce((a, f) => a + f.yo[s], 0) / ok.length, my = ok.reduce((a, f) => a + f.el[s], 0) / ok.length;
        for (const f of ok) { P.x.push(f.yo[s] - mx); P.y.push(f.el[s] - my); }
        ok.forEach((f, i) => { C.n++; C.dif += Math.abs(f.yo[s] - f.el[s]); if (Math.abs(f.yo[s] - f.el[s]) <= 1) C.si++; const g = ok[(i + 1) % ok.length]; if (Math.abs(g.yo[s] - f.el[s]) <= 1) C.base++; });
      }
    }
    const K = `${nivel}/${est}`;
    out.corr[K] = Object.fromEntries(Object.entries(porRival).map(([riv, P]) => [riv, pearson(P.x, P.y)]));
    out.coincide[K] = Object.fromEntries(Object.entries(coin).map(([riv, C]) => [riv, { si: C.si / C.n, base: C.base / C.n, dif: C.dif / C.n }]));
    out.espejo[K] = { n: cambiosN, pct: cambiosN ? cambiosEspejo / cambiosN : 0, porFinal: cambiosEspejo / oro.n };
    out.totales[K] = Object.fromEntries(Object.entries(tot).map(([id, T]) => [id, { media: T.s / Math.max(1, T.n - T.cero), sd: Math.sqrt(Math.max(0, T.s2 / Math.max(1, T.n - T.cero) - (T.s / Math.max(1, T.n - T.cero)) ** 2)), cero: T.cero / T.n, val: T.val / T.int }]));
    out.oro[K] = oro.si / oro.n; out.sinMarca[K] = sinMarca / (2 * oro.n);
    if (est === 'panel') {
      const V = {};
      for (const [key, fs] of Object.entries(kilosPorFinal)) {
        const riv = key.split('>')[1], X = (V[riv] ||= { ap: new Set(), apc: new Set(), planes: new Set(), n: 0 });
        for (const f of fs) { X.n++; X.ap.add(f.ap.s); X.apc.add(f.ap.c); X.planes.add(SLOTS.map(s => f.el[s] === null ? '-' : f.el[s] - f.ap[s[0]]).join(',')); }
      }
      out.variedad[nivel] = V;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now(), ia = IA === 'nuevo' ? AI.HUELLA_IA : undefined;
  if (IA === 'nuevo' && !ia) { console.log('ai.js no tiene HUELLA_IA: no hay rivales nuevos'); process.exit(1); }
  const R = medir(ia), dep = dependencia(ia, Math.max(30, Math.round(N / 5))), f2 = x => x.toFixed(2).padStart(5), pc = x => (x * 100).toFixed(0).padStart(3) + ' %';
  console.log(`Rivales ${IA}${ia ? ` (huella ${ia})` : ''} · ${N} finales por estrategia y nivel (el jugador maneja a los tres por turno) · jugador ${QUIEN} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log('Correlación de kilos jugador → rival (centrada por intento) · intentos a ±1 kg (por azar) y distancia media en kg · cambios del rival a lo del jugador o +1 · oro del jugador · rivales sin marca');
  for (const K of Object.keys(R.corr)) {
    console.log(`  ${K.padEnd(19)} r ${ATL.map(id => `${NOMBRE[id]} ${f2(R.corr[K][id])}`).join(' ')}  · ±1 ${ATL.map(id => `${pc(R.coincide[K][id].si)} (${pc(R.coincide[K][id].base)}) ${R.coincide[K][id].dif.toFixed(1)} kg`).join(' ')}  · espejo ${pc(R.espejo[K].pct)} de ${R.espejo[K].n} (${R.espejo[K].porFinal.toFixed(2)} por final)  · oro ${pc(R.oro[K])}  · sin marca ${pc(R.sinMarca[K])}`);
    console.log(`  ${''.padEnd(19)} total medio de cada rival (sin marca · válidos): ${ATL.map(id => R.totales[K][id] ? `${NOMBRE[id]} ${R.totales[K][id].media.toFixed(0)} ±${R.totales[K][id].sd.toFixed(1)} (${pc(R.totales[K][id].cero)} · ${pc(R.totales[K][id].val)})` : '').join(' · ')}`);
  }
  console.log(`Contrafáctica (${dep.n} decisiones de rivales): cambian si el jugador declara ±3 kg ${pc(dep.decl)} · si tiene 3 kg más de marca ${pc(dep.marca)}`);
  for (const nivel of Object.keys(R.variedad)) console.log(`Variedad (${nivel}, panel): ${ATL.map(id => { const X = R.variedad[nivel][id]; return `${NOMBRE[id]} aperturas ${X.ap.size} / ${X.apc.size} · planes ${X.planes.size} de ${X.n}`; }).join('  |  ')}`);
  if (IA === 'nuevo') {
    const mal = [];
    for (const nivel of ['amistoso', 'normal']) for (const id of ATL) { const r = R.corr[`${nivel}/azar`]?.[id] ?? 0; if (r > 0.25) mal.push(`correlación con el azar, ${nivel}, ${NOMBRE[id]}: ${r.toFixed(2)} (meta ≤ 0,25)`); }
    for (const K of Object.keys(R.espejo)) if (R.espejo[K].porFinal > 0.15) mal.push(`cambios espejo en ${K}: ${R.espejo[K].porFinal.toFixed(2)} por final (meta ≤ 0,15)`);
    if (dep.decl > 0.01) mal.push(`el ${pc(dep.decl)} de las decisiones de los rivales cambia con lo que declara el jugador (meta ≤ 1 %)`);
    if (QUIEN === 'novato') {
      if (R.oro['amistoso/panel'] < 0.40) mal.push(`amistoso: el novato con el panel gana el oro en ${pc(R.oro['amistoso/panel'])} (meta ≥ 40 %)`);
      if (R.oro['normal/panel'] < 0.15 || R.oro['normal/panel'] >= R.oro['amistoso/panel']) mal.push(`normal: el novato con el panel gana el oro en ${pc(R.oro['normal/panel'])} (meta ≥ 15 % y menos que en amistoso)`);
    }
    for (const nivel of Object.keys(R.variedad)) for (const id of ATL) { const X = R.variedad[nivel][id]; if (X.ap.size < 8) mal.push(`${nivel}: ${NOMBRE[id]} abre el arranque con solo ${X.ap.size} pesos distintos`); if (X.planes.size * 100 < 40 * X.n) mal.push(`${nivel}: ${NOMBRE[id]} repite planes (${X.planes.size} de ${X.n})`); }
    console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: los rivales tienen su propia estrategia de kilos');
    process.exit(mal.length ? 1 : 0);
  }
}
