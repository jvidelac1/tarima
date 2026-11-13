// Bots del nivel 'b' (la barrita, docs/JUEGO.md Gameplay 3) y su tabla de medición. Sin navegador y por eventos: miran
// SOLO la señal de senal(m, t, 'b') (la barrita que corre, desde cuándo y sus zonas) y tocan pasando por la capa
// (web/js/game/controles.js), igual que el juego. Cada intento se recalcula con simular() y tiene que dar lo mismo.
//   Perfiles humanos (error de campana alrededor del centro del verde, corrido `sesgo` ms por la reacción y el aparato;
//   `despiste` milésimas de toques en cualquier lado; `reac`: lo que tarda en animarse desde que arranca el puntero):
//     novato ±120 ms · medio ±70 ms · bueno ±35 ms · tipico (el que supone el panel, rules.js → BARRA.tipico)
//   Maneras de tocar raras (no miran): machacador (8 toques por segundo desde que confirma), mantiene (apoya y no suelta),
//   ausente (no toca nunca), doble (cada toque son dos a 40–110 ms).
// Uso: node tools/barra_bots.mjs [--n=400]   tabla por perfil × pesista × % de kilos y criterio de Gameplay 3:
//   novato con la apertura sugerida (90 %): ≥ 95 % válidos y ≥ 60 % verde, en arranque y dos tiempos con los tres;
//   al 100 %: novato entre 30 y 65 % válidos y el bueno más que el novato; diferencias por pesista en cada barrita (el
//   verde del pesista fuerte en esa barrita, más ancho que el del débil); ninguna caída por no tocar con la apertura.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { Intento, simular } from '../web/js/sim/attempt.js';
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { cuerpoBarra, BARRA, zonasBarra, chanceBarra, reglasB, DIFICULTADES } from '../web/js/sim/rules.js';
import { Partida } from '../web/js/sim/match.js';
import { HUELLA_IA } from '../web/js/sim/ai.js';
import { sugerencia } from '../web/js/sim/entrenador.js';
import { traducir, senal } from '../web/js/game/controles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/sim.json'), 'utf8')));
export const ATL = ['ventura', 'brenner', 'marangi'];
export const NOMBRE = { ventura: 'Compacto', brenner: 'Largo', marangi: 'Potente' };
const INF = 2147483647;

export const PERFILES = {
  // `ritmo`: ms entre toques del esfuerzo de pararse (2 por segundo alcanzan); `noEsfuerzo`: de cada 1000, cuántas veces no lo hace
  novato: { sd: 120, sesgo: 40, despiste: 50, reac: 900, ritmo: 500, noEsfuerzo: 60 },
  medio: { sd: 70, sesgo: 20, despiste: 20, reac: 600, ritmo: 400, noEsfuerzo: 20 },
  bueno: { sd: 35, sesgo: 5, despiste: 5, reac: 400, ritmo: 300, noEsfuerzo: 5 },
  tipico: { ...BARRA.tipico, reac: 700, ritmo: 450, noEsfuerzo: 1000 - BARRA.tipico.esfuerzo },
  machacador: { machaca: 125 }, mantiene: { mantiene: true }, ausente: { ausente: true },
  doble: { sd: 70, sesgo: 20, despiste: 20, reac: 600, ritmo: 400, noEsfuerzo: 20, doble: true },
  lento: { sd: 120, sesgo: 40, despiste: 50, reac: 900, ritmo: 520, noEsfuerzo: 0 },      // 2 toques por segundo en el esfuerzo
};

/** Contexto de un intento en 'b' para el pesista `id` (sin Partida: intensidad dada, garra disponible). */
export function ctxBarra(id, lev, env, I, sem, extra = {}) {
  const f = datos.atletas[id], r = new Azar(mezclar(sem, 23));
  return { lev, env: lev === 'c' ? env : undefined, I, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: sem, cal: 0, primera: false, domina: lev === 's' || f.enviones.includes(env),
    jueces: [r.entre(900, 1100), r.entre(900, 1100), r.entre(900, 1100)], reloj: 30000, ctl: 'b', cuerpo: cuerpoBarra(id), garraUno: true, ...extra };
}
/** Normal de media 0 y desvío 1 (Box-Muller sobre el azar sembrado: los bots no son núcleo, pueden usar flotantes). */
const normal = r => { const u = (r.u32() + 1) / 4294967297, v = r.u32() / 4294967296; return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** ms desde que arranca la barrita hasta la k-ésima vez que el puntero pasa por el centro (más lento desde BARRA.lentoDesde). */
export function centro(k, R = BARRA) {
  const P = R.pasada, L = R.lentoDesde, x = (k + .5) * 1000, xL = L * 1000 / P;      // en milésimas de pasada
  return x <= xL ? x * P / 1000 : L + (x - xL) * R.pasadaLenta / 1000;
}
/** Instante en que el perfil `B` toca una barrita que arrancó en `t0` (ms del intento). */
export function cuandoToca(B, t0, r, R = BARRA) {
  const P = R.pasada, reac = Math.max(150, B.reac + Math.round(normal(r) * 250));
  if (r.ent(1000) < (B.despiste || 0)) return t0 + reac + r.ent(2 * P);
  let k = 0; while (centro(k, R) < reac) k++;
  return Math.round(t0 + centro(k, R) + B.sesgo + normal(r) * B.sd);
}

/** Juega un intento con el perfil `B` y devuelve {m, conf, ent, contactos}. */
export function jugarBarra(ctx, B, sem, o = {}) {
  const r = new Azar(mezclar(sem, 41)), conf = o.conf ?? 0, m = new Intento(ctx), ent = [];
  m.confirmar(conf);
  const cola = [];
  const agenda = (t, v) => { cola.push([t, v]); cola.sort((a, b) => a[0] - b[0] || b[1] - a[1]); };
  const toque = (t, dur) => { agenda(t, 1); if (dur < INF) agenda(t + dur, 0); };
  if (B.mantiene) toque(conf + 400, INF);
  let machaca = B.machaca ? conf + 200 : INF, clave = null, plan = INF, contactos = 0, esfuerzoSigue = null;
  for (let g = 0; !m.res && g < 100000; g++) {
    const s = senal(m, m.t, 'b'), k = s && (s.tipo === 'barra' || s.clave === 'esfuerzo') ? `${s.clave}:${s.desde}` : '';
    const mira = !B.ausente && !B.mantiene && !B.machaca;
    if (k !== clave) {
      clave = k; plan = INF;
      if (k && mira && s.tipo === 'barra') plan = Math.max(m.t, cuandoToca(B, s.desde, r, s.R));
      // el esfuerzo de pararse: a su ritmo, desde que reacciona (a veces no lo hace)
      if (k && mira && s.clave === 'esfuerzo' && r.ent(1000) >= (B.noEsfuerzo || 0)) plan = m.t + 300 + r.ent(300);
    } else if (k && mira && s.clave === 'esfuerzo' && plan === INF && esfuerzoSigue) plan = esfuerzoSigue;
    esfuerzoSigue = null;
    const tc = cola.length ? cola[0][0] : INF, prox = Math.min(m.proximo(), plan, tc, machaca);
    if (prox >= INF) break;
    m.avanzar(prox); if (m.res) break;
    const meter = (t, v) => { const x = traducir(m, t, v, 'b'); for (const e of x.ent) { ent.push(e); m.entrada(e[0], e[1]); } if (v && x.ent.length) contactos++; };
    if (tc === prox) { const [t, v] = cola.shift(); meter(t, v); continue; }
    if (plan === prox) { plan = INF; toque(prox, 60 + r.ent(80)); if (B.doble) toque(prox + 40 + r.ent(71), 50); if (s && s.clave === 'esfuerzo') esfuerzoSigue = prox + Math.max(150, (B.ritmo || 450) + Math.round(normal(r) * 60)); continue; }
    if (machaca === prox) { toque(prox, 40); machaca = prox + B.machaca; continue; }
  }
  if (!m.res) throw new Error('el intento no terminó');
  return { m, conf, ent, contactos };
}
/** Recalcula y verifica que el registro esté bien formado y dé lo mismo. */
export function verificar(ctx, S) {
  const re = simular(ctx, S.conf, S.ent);
  if (JSON.stringify(re.res) !== JSON.stringify(S.m.res)) throw new Error('el recálculo no coincide');
  let t0 = 0, n = 0; for (const e of S.ent) { if (e[0] < t0 || !Number.isInteger(e[0])) throw new Error('entradas fuera de orden'); t0 = e[0]; n += e[1] ? 1 : -1; if (n < 0) throw new Error('se levanta un contacto que no estaba apoyado'); }
  return re;
}

/** Una casilla: `n` intentos del perfil con el pesista, levantamiento e intensidad dados. */
export function casilla(id, lev, I, B, n, sem0 = 0, extra = {}, envFijo = null) {
  const o = { n: 0, v: 0, z: { verde: 0, amarillo: 0, rojo: 0 }, zi: [0, 1, 2, 3].map(() => ({ verde: 0, amarillo: 0, rojo: 0 })), caidaPorZona: { verde: 0, amarillo: 0, rojo: 0 }, contactos: 0, esf: 0, esfOk: 0 };
  const env = lev === 'c' ? envFijo || cuerpoBarra(id).casa : undefined;
  for (let k = 0; k < n; k++) {
    const sem = mezclar(sem0, k, I, lev === 'c' ? 1 : 0, ATL.indexOf(id)), ctx = ctxBarra(id, lev, env, I, sem, extra), S = jugarBarra(ctx, B, mezclar(sem, 5)), res = verificar(ctx, S).res;
    o.n++; if (res.res === 'valido') o.v++; o.contactos += S.contactos; if (res.uno.esfuerzo) { o.esf++; if (res.uno.esfuerzo.ok) o.esfOk++; }
    let peor = 'verde';
    for (const b of res.uno.barras || []) { o.z[b.zona]++; o.zi[b.i][b.zona]++; if (b.zona === 'rojo' || (b.zona === 'amarillo' && peor === 'verde')) peor = b.zona; }
    if (res.res !== 'valido') o.caidaPorZona[peor]++;
  }
  return o;
}

// ---------- tabla y criterio ----------
const principal = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (principal) {
  const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
  const N = +(arg('n') || 400), DIFS = arg('dif') ? arg('dif').split(',') : DIFICULTADES, mal = [], t0 = Date.now();
  const pc = (a, b) => (b ? Math.round(a * 1000 / b) / 10 : 0);
  for (const dif of DIFS) {
  const R = reglasB(dif), D = dif === 'facil' ? {} : { dif }, AP = R.apertura * 10, Is = [...new Set([8800, AP, 9000, 9200, 9500, 9700, 10000, 10300])].sort((a, b) => a - b);
  const tipico = { ...PERFILES.tipico, ...R.tipico, noEsfuerzo: 1000 - R.tipico.esfuerzo }, perfil = pf => (pf === 'tipico' ? tipico : PERFILES[pf]);
  const T = {}, OROS = {};
  console.log(`\n========== ${dif.toUpperCase()} · barritas: arranque ${R.barritas.s.join('+')}, dos tiempos ${R.barritas.c.join('+')} (0 tirón, 1 envión, 2 atrapar, 3 pararse) · puntero ${R.pasada} ms · apertura sugerida ${AP / 100} %`);
  console.log(`Barrita ('b', ${dif}) · ${N} intentos por casilla · válidos % (verde/amarillo/rojo % de los toques)`);
  for (const lev of ['s', 'c']) {
    console.log(`\n${lev === 's' ? 'ARRANQUE' : 'DOS TIEMPOS'}`);
    console.log('perfil   pesista   ' + Is.map(I => `${(I / 100).toFixed(0)} %`.padStart(17)).join(''));
    for (const pf of ['novato', 'medio', 'bueno', 'tipico']) for (const id of ATL) {
      const fila = Is.map(I => { const o = casilla(id, lev, I, perfil(pf), N, 77, D); (T[pf] ||= {})[`${id}|${lev}|${I}`] = o; const nz = o.z.verde + o.z.amarillo + o.z.rojo; return `${pc(o.v, o.n).toFixed(0).padStart(4)} (${pc(o.z.verde, nz).toFixed(0)}/${pc(o.z.amarillo, nz).toFixed(0)}/${pc(o.z.rojo, nz).toFixed(0)})`.padStart(17); });
      console.log(`${pf.padEnd(8)} ${NOMBRE[id].padEnd(9)}${fila.join('')}`);
    }
  }
  // ancho del verde por pesista y barrita (ms de puntero, medio ancho) al 90 y al 100 %
  console.log('\nVerde (medio ancho, ms) por pesista y barrita · al 90 % y al 100 %');
  for (const id of ATL) { const c = cuerpoBarra(id), z = (I, i) => zonasBarra(I, c, i, false, 'split', R).vMs; console.log(`  ${NOMBRE[id].padEnd(9)} ${[...new Set([...R.barritas.s, ...R.barritas.c])].map(i => `${['tirón', 'envión', 'atrapar', 'pararse'][i]} ${z(9000, i)} / ${z(10000, i)}`).join(' · ')}`); }
  // criterio
  const val = (pf, id, lev, I) => { const o = T[pf][`${id}|${lev}|${I}`]; return pc(o.v, o.n); };
  for (const id of ATL) for (const lev of ['s', 'c']) {
    if (dif === 'facil') {
      const o = T.novato[`${id}|${lev}|9000`], nz = o.z.verde + o.z.amarillo + o.z.rojo;
      if (pc(o.v, o.n) < 95) mal.push(`novato ${NOMBRE[id]} ${lev} al 90 %: ${pc(o.v, o.n)} % válidos (meta ≥ 95)`);
      if (pc(o.z.verde, nz) < 60) mal.push(`novato ${NOMBRE[id]} ${lev} al 90 %: ${pc(o.z.verde, nz)} % verde (meta ≥ 60)`);
      const n100 = T.novato[`${id}|${lev}|10000`];
      if (pc(n100.v, n100.n) < 30 || pc(n100.v, n100.n) > 65) mal.push(`novato ${NOMBRE[id]} ${lev} al 100 %: ${pc(n100.v, n100.n)} % válidos (meta 30 a 65)`);
    } else {
      // metas de la dificultad: con la apertura sugerida, Medio: novato ≥ 90 % y medio ≥ 95 %; Difícil: novato ≥ 75 % y bueno ≥ 95 %
      const [pn, pm, qm] = dif === 'medio' ? [90, 'medio', 95] : [75, 'bueno', 95];
      if (val('novato', id, lev, AP) < pn) mal.push(`${dif}: novato ${NOMBRE[id]} ${lev} con la apertura (${AP / 100} %): ${val('novato', id, lev, AP)} % válidos (meta ≥ ${pn})`);
      if (val(pm, id, lev, AP) < qm) mal.push(`${dif}: ${pm} ${NOMBRE[id]} ${lev} con la apertura: ${val(pm, id, lev, AP)} % válidos (meta ≥ ${qm})`);
    }
    // en todos los niveles, el bueno le gana claramente al novato al 97 y al 100 %
    const d97 = val('bueno', id, lev, 9700) - val('novato', id, lev, 9700), d100 = val('bueno', id, lev, 10000) - val('novato', id, lev, 10000);
    if (d100 < 15 || d97 < 0 || d97 + d100 < 25) mal.push(`${dif} ${NOMBRE[id]} ${lev}: el bueno no gana claramente al novato (97 %: +${d97.toFixed(0)}, 100 %: +${d100.toFixed(0)} puntos; meta +15 al 100 % y +25 sumando los dos)`);
  }
  // diferencias por pesista en cada barrita (verde del novato al 97 %)
  for (const lev of ['s', 'c']) for (const i of R.barritas[lev]) {
    const v = ATL.map(id => { const o = T.novato[`${id}|${lev}|9700`], z = o.zi[i], nz = z.verde + z.amarillo + z.rojo; return pc(z.verde, nz); });
    console.log(`verde del novato al 97 % · ${lev === 's' ? 'arranque' : 'dos tiempos'} · barrita ${['del tirón', 'del envión', 'de atrapar', 'de pararse'][i]}: ${ATL.map((id, k) => `${NOMBRE[id]} ${v[k]} %`).join(' · ')}`);
    if (Math.max(...v) - Math.min(...v) < 10 && i < 2) mal.push(`${dif}: barrita ${i} (${lev}): los pesistas no se distinguen (${v.join(' / ')} % verde)`);
  }
  // maneras raras de tocar: nada se rompe, no hay caídas con la apertura
  for (const pf of ['machacador', 'mantiene', 'ausente', 'doble']) {
    const fila = ATL.map(id => { const s = casilla(id, 's', AP, PERFILES[pf], 100, 91, D), c = casilla(id, 'c', AP, PERFILES[pf], 100, 91, D); return `${NOMBRE[id]} ${pc(s.v, s.n)} / ${pc(c.v, c.n)} %`; });
    console.log(`${pf.padEnd(10)} con la apertura (arranque / dos tiempos): ${fila.join(' · ')}`);
  }
  // el esfuerzo de pararse: nunca por debajo de su intensidad; cuántas veces aparece y cuántas se hace
  for (const lev of ['s', 'c']) {
    const fila = Is.map(I => { let e = 0, n = 0, ok = 0; for (const id of ATL) { const o = T.novato[`${id}|${lev}|${I}`]; e += o.esf; n += o.n; ok += o.esfOk; } return { I, pct: pc(e, n), ok: pc(ok, e) }; });
    console.log(`esfuerzo al pararse (novato, ${lev === 's' ? 'arranque' : 'dos tiempos'}, ${R.esfuerzo.toques} toques en ${R.esfuerzo.ms / 1000} s desde el ${R.esfuerzo.desdeI / 100} %): ${fila.map(x => `${x.I / 100} % ${x.pct} %${x.pct ? ` (lo hace ${x.ok} %)` : ''}`).join(' · ')}`);
    for (const x of fila) if (x.I < R.esfuerzo.desdeI && x.pct > 0) mal.push(`${dif}: el esfuerzo de pararse aparece con ${x.I / 100} % (${x.pct} %)`);
  }
  // a un ritmo cómodo alcanza siempre: Fácil 2 toques por segundo, Medio 2,5 y Difícil 3 (sin apuro)
  { const ritmo = dif === 'facil' ? 520 : dif === 'medio' ? 400 : 333; let e = 0, ok = 0; for (const id of ATL) for (const lev of ['s', 'c']) { const o = casilla(id, lev, 9900, { ...PERFILES.lento, ritmo }, Math.round(N / 2), 33, D); e += o.esf; ok += o.esfOk; }
    console.log(`esfuerzo con ${(1000 / ritmo).toFixed(1)} toques por segundo (99 %): aparece ${e} veces y lo hace ${pc(ok, e)} %`); if (e && ok < e) mal.push(`${dif}: con ${(1000 / ritmo).toFixed(1)} toques por segundo el esfuerzo no siempre alcanza (${ok} de ${e})`); }
  // estilos del envión: split (tijera) el más fácil, power intermedio, squat el más difícil, con todos los pesistas
  for (const pf of ['novato', 'bueno']) {
    const fila = ATL.map(id => ['split', 'power', 'squat'].map(e => { const o = casilla(id, 'c', 9700, PERFILES[pf], N, 55, D, e); return pc(o.v, o.n); }));
    console.log(`envión al 97 %, ${pf}: ${ATL.map((id, k) => `${NOMBRE[id]} split ${fila[k][0]} · power ${fila[k][1]} · squat ${fila[k][2]} %`).join(' | ')}`);
    ATL.forEach((id, k) => { if (!(fila[k][0] >= fila[k][1] - 1 && fila[k][1] >= fila[k][2] - 1)) mal.push(`${dif} ${pf} ${NOMBRE[id]}: el orden de los enviones no es split ≥ power ≥ squat (${fila[k].join(' / ')})`); });
  }
  // finales enteras con el cansancio: la apertura sugerida y después lo que trae el panel (el entrenador, «panel») o lo que
  // le propondría el entrenador a alguien que conoce su propia puntería («lector»: cambia los kilos con ← →). Oro contra los
  // rivales que trae el nivel: Fácil y Medio, amistosos (y normales, informativo); Difícil, normales
  const RIV = dif === 'dificil' ? ['normal'] : ['amistoso', 'normal'];
  for (const nivel of RIV) for (const [pf, est] of [['novato', 'panel'], ['medio', 'panel'], ['bueno', 'panel'], ['medio', 'lector'], ['bueno', 'lector']]) for (const id of ATL) {
    const F = { finales: 0, total: 0, oro: 0, val: [0, 0, 0, 0, 0, 0], int: [0, 0, 0, 0, 0, 0], fat3: 0, n3: 0 }, yo = ATL.indexOf(id);
    for (let k = 0; k < Math.max(60, Math.round(N / 4)); k++) {
      const p = new Partida(datos, { semilla: mezclar(k, 777, yo, nivel === 'normal' ? 1 : 0), nivel, cal: 0, primera: false, ctl: 'b', tactil: true, ia: HUELLA_IA, ...D, atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
      for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(datos.atletas[id].techo[lev] * R.apertura / 1000)))); }
      p.empezar();
      for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
        if (p.fase === 'intervalo') { p.empezar(); continue; }
        const L = p.llamado; if (p.at[L.a].ctrl === 'juego') { p.resolverIA(); continue; }
        const env = L.lev === 'c' ? 'split' : undefined;
        if (est === 'lector' && L.n > 1 && p.at[yo].cambios === 0) { const kg = sugerencia(p, yo, L.lev, env, { perfil: PERFILES[pf] }); if (kg !== null && kg !== L.kg && !p.cambioValido(500, kg) && p.cambio(500, kg).desplazado) continue; }
        const ctx = p.contexto(env), j = (L.lev === 'c' ? 3 : 0) + L.n - 1;
        if (L.n === 3) { F.fat3 += ctx.fatiga || 0; F.n3++; }
        const S = jugarBarra(ctx, PERFILES[pf], mezclar(k, g, 99), { conf: 600 }), x = p.resolver({ conf: S.conf, env, ent: S.ent });
        F.int[j]++; if (x.res.res === 'valido') F.val[j]++;
      }
      F.finales++; if (p.at[yo].mejor.s && p.at[yo].mejor.c) F.total++; if (p.tabla()[0].a === yo && p.tabla()[0].puesto === 1) F.oro++;
    }
    const v = F.val.map((x, i) => pc(x, F.int[i]).toFixed(0));
    console.log(`final ${nivel.padEnd(8)} ${pf.padEnd(6)} ${est.padEnd(6)} ${NOMBRE[id].padEnd(9)} total ${pc(F.total, F.finales)} % · oro ${pc(F.oro, F.finales)} % · válidos (arr. 1-2-3 / dt 1-2-3) ${v.slice(0, 3).join('-')} / ${v.slice(3).join('-')} % · cansancio al tercero ${Math.round(F.fat3 / Math.max(1, F.n3))}`);
    (OROS[`${nivel}|${pf}|${est}`] ||= []).push(pc(F.oro, F.finales));
    if (pf === 'novato' && pc(F.total, F.finales) < 90) mal.push(`${dif}: el novato con ${NOMBRE[id]} termina con total solo el ${pc(F.total, F.finales)} % de las finales (meta ≥ 90)`);
  }
  for (const [k, xs] of Object.entries(OROS)) console.log(`oro medio (${dif}, ${k.replaceAll('|', ' · ')}): ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} %`);
  // ganable: en Medio, el novato con lo que trae el panel gana contra amistosos; en Difícil, el bueno que lee su puntería
  // gana contra normales
  const media = k => { const xs = OROS[k] || []; return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); };
  if (dif === 'medio' && media('amistoso|novato|panel') < 50) mal.push(`medio: el novato con el panel gana el oro solo el ${media('amistoso|novato|panel').toFixed(0)} % contra amistosos (meta ≥ 50)`);
  if (dif === 'dificil' && media('normal|bueno|lector') < 25) mal.push(`dificil: el bueno que lee su puntería gana el oro solo el ${media('normal|bueno|lector').toFixed(0)} % contra normales (meta ≥ 25)`);
  // chance del panel (perfil típico) contra lo medido con el bot típico, por casilla (informativo; la prueba es chance_test)
  let peor = 0;
  for (const id of ATL) for (const lev of ['s', 'c']) for (const I of Is) { const o = T.tipico[`${id}|${lev}|${I}`], c = cuerpoBarra(id), ch = chanceBarra(I, lev, lev === 'c' ? c.casa : undefined, c, D) / 10; peor = Math.max(peor, Math.abs(ch - pc(o.v, o.n))); }
  console.log(`chance del panel contra el bot típico: error máximo por casilla ${peor.toFixed(1)} puntos (${N} intentos por casilla)`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: la barrita cumple las metas de Gameplay 3 y de la dificultad');
  process.exit(mal.length ? 1 : 0);
}
