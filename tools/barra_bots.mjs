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
import { cuerpoBarra, BARRA, zonasBarra, chanceBarra } from '../web/js/sim/rules.js';
import { Partida } from '../web/js/sim/match.js';
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
export function centro(k) {
  const P = BARRA.pasada, L = BARRA.lentoDesde, x = (k + .5) * 1000, xL = L * 1000 / P;      // en milésimas de pasada
  return x <= xL ? x * P / 1000 : L + (x - xL) * BARRA.pasadaLenta / 1000;
}
/** Instante en que el perfil `B` toca una barrita que arrancó en `t0` (ms del intento). */
export function cuandoToca(B, t0, r) {
  const P = BARRA.pasada, reac = Math.max(150, B.reac + Math.round(normal(r) * 250));
  if (r.ent(1000) < (B.despiste || 0)) return t0 + reac + r.ent(2 * P);
  let k = 0; while (centro(k) < reac) k++;
  return Math.round(t0 + centro(k) + B.sesgo + normal(r) * B.sd);
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
      if (k && mira && s.tipo === 'barra') plan = Math.max(m.t, cuandoToca(B, s.desde, r));
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
  const o = { n: 0, v: 0, z: { verde: 0, amarillo: 0, rojo: 0 }, zi: [{ verde: 0, amarillo: 0, rojo: 0 }, { verde: 0, amarillo: 0, rojo: 0 }], caidaPorZona: { verde: 0, amarillo: 0, rojo: 0 }, contactos: 0, esf: 0, esfOk: 0 };
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
  const N = +(arg('n') || 400), Is = [8800, 9000, 9200, 9500, 9700, 10000, 10300], mal = [], t0 = Date.now();
  const pc = (a, b) => (b ? Math.round(a * 1000 / b) / 10 : 0);
  const T = {};
  console.log(`Barrita ('b') · ${N} intentos por casilla · válidos % (verde/amarillo/rojo % de los toques)`);
  for (const lev of ['s', 'c']) {
    console.log(`\n${lev === 's' ? 'ARRANQUE (una barrita: el tirón)' : 'DOS TIEMPOS (dos barritas: la cargada y el envión)'}`);
    console.log('perfil   pesista   ' + Is.map(I => `${(I / 100).toFixed(0)} %`.padStart(17)).join(''));
    for (const pf of ['novato', 'medio', 'bueno', 'tipico']) for (const id of ATL) {
      const fila = Is.map(I => { const o = casilla(id, lev, I, PERFILES[pf], N, 77); (T[pf] ||= {})[`${id}|${lev}|${I}`] = o; const nz = o.z.verde + o.z.amarillo + o.z.rojo; return `${pc(o.v, o.n).toFixed(0).padStart(4)} (${pc(o.z.verde, nz).toFixed(0)}/${pc(o.z.amarillo, nz).toFixed(0)}/${pc(o.z.rojo, nz).toFixed(0)})`.padStart(17); });
      console.log(`${pf.padEnd(8)} ${NOMBRE[id].padEnd(9)}${fila.join('')}`);
    }
  }
  // ancho del verde por pesista y barrita (ms de puntero, medio ancho) al 90 y al 100 %
  console.log('\nVerde (medio ancho, ms) por pesista · barrita del tirón / del envión · al 90 % y al 100 %');
  for (const id of ATL) { const c = cuerpoBarra(id), z = (I, i) => zonasBarra(I, c, i).vMs; console.log(`  ${NOMBRE[id].padEnd(9)} tirón ${z(9000, 0)} / ${z(10000, 0)} · envión ${z(9000, 1)} / ${z(10000, 1)}`); }
  // criterio
  for (const id of ATL) for (const lev of ['s', 'c']) {
    const o = T.novato[`${id}|${lev}|9000`], nz = o.z.verde + o.z.amarillo + o.z.rojo;
    if (pc(o.v, o.n) < 95) mal.push(`novato ${NOMBRE[id]} ${lev} al 90 %: ${pc(o.v, o.n)} % válidos (meta ≥ 95)`);
    if (pc(o.z.verde, nz) < 60) mal.push(`novato ${NOMBRE[id]} ${lev} al 90 %: ${pc(o.z.verde, nz)} % verde (meta ≥ 60)`);
    const n100 = T.novato[`${id}|${lev}|10000`], b100 = T.bueno[`${id}|${lev}|10000`];
    if (pc(n100.v, n100.n) < 30 || pc(n100.v, n100.n) > 65) mal.push(`novato ${NOMBRE[id]} ${lev} al 100 %: ${pc(n100.v, n100.n)} % válidos (meta 30 a 65)`);
    if (b100.v <= n100.v) mal.push(`${NOMBRE[id]} ${lev} al 100 %: el bueno (${pc(b100.v, b100.n)} %) no saca más que el novato (${pc(n100.v, n100.n)} %)`);
  }
  // diferencias por pesista en cada barrita (verde del novato al 97 %)
  for (const lev of ['s', 'c']) for (const i of lev === 's' ? [0] : [0, 1]) {
    const v = ATL.map(id => { const o = T.novato[`${id}|${lev}|9700`], z = o.zi[i], nz = z.verde + z.amarillo + z.rojo; return pc(z.verde, nz); });
    console.log(`verde del novato al 97 % · ${lev === 's' ? 'arranque' : 'dos tiempos'} · barrita ${i ? 'del envión' : 'del tirón'}: ${ATL.map((id, k) => `${NOMBRE[id]} ${v[k]} %`).join(' · ')}`);
    if (Math.max(...v) - Math.min(...v) < 10) mal.push(`barrita ${i} (${lev}): los pesistas no se distinguen (${v.join(' / ')} % verde)`);
  }
  // maneras raras de tocar: nada se rompe, no hay caídas con la apertura
  for (const pf of ['machacador', 'mantiene', 'ausente', 'doble']) {
    const fila = ATL.map(id => { const s = casilla(id, 's', 9000, PERFILES[pf], 100, 91), c = casilla(id, 'c', 9000, PERFILES[pf], 100, 91); return `${NOMBRE[id]} ${pc(s.v, s.n)} / ${pc(c.v, c.n)} %`; });
    console.log(`${pf.padEnd(10)} al 90 % (arranque / dos tiempos): ${fila.join(' · ')}`);
  }
  // el esfuerzo de pararse: nunca con la apertura; cuántas veces aparece y cuántas se hace (el lento toca 2 por segundo)
  for (const lev of ['s', 'c']) {
    const fila = Is.map(I => { let e = 0, n = 0, ok = 0; for (const id of ATL) { const o = T.novato[`${id}|${lev}|${I}`]; e += o.esf; n += o.n; ok += o.esfOk; } return { I, pct: pc(e, n), ok: pc(ok, e) }; });
    console.log(`esfuerzo al pararse (novato, ${lev === 's' ? 'arranque' : 'dos tiempos'}): ${fila.map(x => `${x.I / 100} % ${x.pct} %${x.pct ? ` (lo hace ${x.ok} %)` : ''}`).join(' · ')}`);
    for (const x of fila) if (x.I <= 9200 && x.pct > 0) mal(`el esfuerzo de pararse aparece con ${x.I / 100} % (${x.pct} %): nunca en los intentos fáciles`);
  }
  { let e = 0, ok = 0; for (const id of ATL) for (const lev of ['s', 'c']) { const o = casilla(id, lev, 9900, PERFILES.lento, Math.round(N / 2), 33); e += o.esf; ok += o.esfOk; }
    console.log(`esfuerzo con 2 toques por segundo (lento, 99 %): aparece ${e} veces y lo hace ${pc(ok, e)} %`); if (e && ok < e) mal(`con 2 toques por segundo el esfuerzo no siempre alcanza (${ok} de ${e})`); }
  // estilos del envión: split (tijera) el más fácil, power intermedio, squat el más difícil, con todos los pesistas
  for (const pf of ['novato', 'bueno']) {
    const fila = ATL.map(id => ['split', 'power', 'squat'].map(e => { const o = casilla(id, 'c', 9700, PERFILES[pf], N, 55, {}, e); return pc(o.v, o.n); }));
    console.log(`envión al 97 %, ${pf}: ${ATL.map((id, k) => `${NOMBRE[id]} split ${fila[k][0]} · power ${fila[k][1]} · squat ${fila[k][2]} %`).join(' | ')}`);
    ATL.forEach((id, k) => { if (!(fila[k][0] >= fila[k][1] && fila[k][1] >= fila[k][2])) mal.push(`${pf} ${NOMBRE[id]}: el orden de los enviones no es split ≥ power ≥ squat (${fila[k].join(' / ')})`); });
  }
  // finales enteras con el cansancio: la apertura sugerida (90 %) y después lo que trae el panel (el entrenador)
  for (const pf of ['novato', 'medio', 'bueno']) for (const id of ATL) {
    const F = { finales: 0, total: 0, val: [0, 0, 0, 0, 0, 0], int: [0, 0, 0, 0, 0, 0], fat3: 0, n3: 0 }, yo = ATL.indexOf(id);
    for (let k = 0; k < Math.max(60, Math.round(N / 4)); k++) {
      const p = new Partida(datos, { semilla: mezclar(k, 777, yo), nivel: 'normal', cal: 0, primera: false, ctl: 'b', tactil: true, atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
      for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(datos.atletas[id].techo[lev] * .9)))); }
      p.empezar();
      for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
        if (p.fase === 'intervalo') { p.empezar(); continue; }
        const L = p.llamado; if (p.at[L.a].ctrl === 'juego') { p.resolverIA(); continue; }
        const env = L.lev === 'c' ? 'split' : undefined, ctx = p.contexto(env), j = (L.lev === 'c' ? 3 : 0) + L.n - 1;
        if (L.n === 3) { F.fat3 += ctx.fatiga || 0; F.n3++; }
        const S = jugarBarra(ctx, PERFILES[pf], mezclar(k, g, 99)), x = p.resolver({ conf: S.conf, env, ent: S.ent });
        F.int[j]++; if (x.res.res === 'valido') F.val[j]++;
      }
      F.finales++; if (p.at[yo].mejor.s && p.at[yo].mejor.c) F.total++;
    }
    const v = F.val.map((x, i) => pc(x, F.int[i]).toFixed(0));
    console.log(`final ${pf.padEnd(6)} ${NOMBRE[id].padEnd(9)} con total ${pc(F.total, F.finales)} % · válidos por intento (arr. 1-2-3 / dt 1-2-3) ${v.slice(0, 3).join('-')} / ${v.slice(3).join('-')} % · cansancio medio al tercer intento ${Math.round(F.fat3 / Math.max(1, F.n3))}`);
    if (pf === 'novato' && pc(F.total, F.finales) < 90) mal.push(`el novato con ${NOMBRE[id]} termina con total solo el ${pc(F.total, F.finales)} % de las finales (meta ≥ 90)`);
  }
  // chance del panel (perfil típico) contra lo medido con el bot típico, por casilla (informativo; la prueba es chance_test)
  let peor = 0;
  for (const id of ATL) for (const lev of ['s', 'c']) for (const I of Is) { const o = T.tipico[`${id}|${lev}|${I}`], c = cuerpoBarra(id), ch = chanceBarra(I, lev, lev === 'c' ? c.casa : undefined, c) / 10; peor = Math.max(peor, Math.abs(ch - pc(o.v, o.n))); }
  console.log(`chance del panel contra el bot típico: error máximo por casilla ${peor.toFixed(1)} puntos (${N} intentos por casilla)`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: la barrita cumple las metas de Gameplay 3');
  process.exit(mal.length ? 1 : 0);
}
