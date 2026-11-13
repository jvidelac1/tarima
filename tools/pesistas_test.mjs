// Pesistas y decisiones en finales enteras del nivel 'u' (docs/JUEGO.md, Gameplay 2: metas D y E), sin navegador.
// El jugador toca como el novato reactivo de tools/uno_bots.mjs (la meta A asegura que cualquier manera de tocar da lo
// mismo): lo único que cambia entre estrategias es qué kilos pide.
//   plan       abre al 90 % y sigue el plan del entrenador (lo que el panel trae puesto: +4 y +3 kg, repite si cae)
//   prudente   abre al 90 % y sube siempre 2 kg (repite si cae)
//   codicioso  abre al 90 % y sube siempre 5 kg (repite si cae)
//   lector     lee el panel: la chance de cada peso (chanceUno, la misma «X de 10» que ve la persona) y La cuenta (los kilos
//              que hacen falta para el oro); va por el oro cuando la chance lo justifica y, si no, por el peso más alto que
//              todavía es seguro para ese intento
// Criterios (rivales normales y amistosos, N finales por pesista y estrategia):
//   E. con rivales normales, el lector gana el oro al menos 15 puntos más seguido que el prudente y que el codicioso, con
//      cada pesista (las decisiones importan);
//   jugables: con rivales amistosos, el lector gana el oro en ≥ 40 % de las finales con cada pesista, y con el plan del
//      entrenador se caen ≤ 12 % de las barras con cada pesista (ninguno queda injugable);
//   distintos: en las caídas, lo que más le costó a Largo es pararse y a Potente, arriba de la cabeza (lo que dice su tarjeta).
// Uso: node tools/pesistas_test.mjs [--n=200]
import { Partida } from '../web/js/sim/match.js';
import { mezclar } from '../web/js/sim/fixed.js';
import { chanceUno, cuerpoDe, KG_MAX } from '../web/js/sim/rules.js';
import { jugarUno, datos, ATL, BOTS_U } from './uno_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 200);
const NOVATO = { ...BOTS_U.reactivo, lag: 60, siempre: true };
const TIPO = { ventura: 'Compacto', brenner: 'Largo', marangi: 'Potente' };

/** Chance (0 a 1) de `kg` para el pesista i ahora (la del panel). */
const chance = (p, i, lev, kg) => { const a = p.at[i], c = cuerpoDe(a.f); return chanceUno(p.intensidadDe(i, lev, kg), lev, lev === 'c' ? c.casa : undefined, c, { garra: a.garraUno[lev] }) / 1000; };

/** Kilos que pide cada estrategia en el llamado en curso (null: deja lo que trae el panel). */
const ESTRATEGIAS = {
  plan: () => null,
  prudente: (p, i, lev) => { const a = p.at[i], u = a[lev].at(-1); return u && u.res === 'valido' ? u.kg + 2 : null; },
  codicioso: (p, i, lev) => { const a = p.at[i], u = a[lev].at(-1); return u && u.res === 'valido' ? u.kg + 5 : null; },
  lector: (p, i, lev) => {
    const a = p.at[i], n = a[lev].length + 1, min = p.minimo(i), C = p.cuenta(i);
    // el peso más alto con al menos `x` de chance
    const hasta = x => { let k = min; while (k + 1 <= KG_MAX && chance(p, i, lev, k + 1) >= x) k++; return k; };
    if (n === 1) return null;      // abre con lo que propone el panel
    const seguro = hasta(n === 2 ? .9 : .6);
    if (lev === 'c' && C.oro !== null && C.oro > seguro) {
      // en el dos tiempos, por el oro cuando la chance lo justifica (en el último, cualquier chance); si no, lo seguro
      const ch = chance(p, i, lev, C.oro); if (ch >= (n === 3 ? .02 : .5)) return C.oro;
    }
    return seguro;
  },
};

function final(id, nivel, estrategia, k) {
  const yo = ATL.indexOf(id), semilla = mezclar(k, 5150, yo, nivel === 'normal' ? 1 : 0);
  const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: 'u', tactil: true, atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
  const f = datos.atletas[id], elegir = ESTRATEGIAS[estrategia], cuerpo = cuerpoDe(f), out = { barras: 0, caidas: 0, tramo: {} };
  for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(f.techo[lev] * .9)))); }
  p.empezar();
  for (let g = 0; p.fase !== 'fin' && g < 90; g++) {
    if (p.fase === 'intervalo') { p.empezar(); continue; }
    const L = p.llamado;
    if (p.at[L.a].ctrl !== 'persona') { p.resolverIA(); continue; }
    const kg = elegir(p, yo, L.lev);
    if (kg !== null && kg !== L.kg && !p.cambioValido(0, kg)) { if (p.cambio(0, kg).desplazado) continue; }
    const env = L.lev === 'c' ? cuerpo.casa : undefined, ctx = p.contexto(env), S = jugarUno(ctx, NOVATO, mezclar(semilla, g, 3)), res = S.m.res;
    p.resolver({ conf: S.conf, env, ent: S.ent });
    out.barras++; if (res.res !== 'valido') { out.caidas++; out.tramo[res.uno.tramo_mayor] = (out.tramo[res.uno.tramo_mayor] || 0) + 1; }
  }
  const t = p.tabla(), fila = t.find(x => x.a === yo);
  return { ...out, oro: fila.puesto === 1 && fila.total > 0, medalla: !!fila.total && fila.puesto <= 3 && t.filter(x => x.total).length >= 1 && fila.puesto <= 3, total: fila.total };
}

const t0 = Date.now(), R = {};
for (const nivel of ['amistoso', 'normal']) for (const id of ATL) for (const e of Object.keys(ESTRATEGIAS)) {
  const A = { n: 0, oro: 0, total: 0, sinTotal: 0, barras: 0, caidas: 0, tramo: {} };
  for (let k = 0; k < N; k++) {
    const r = final(id, nivel, e, k); A.n++; if (r.oro) A.oro++; if (r.total) A.total += r.total; else A.sinTotal++;
    A.barras += r.barras; A.caidas += r.caidas; for (const [x, c] of Object.entries(r.tramo)) A.tramo[x] = (A.tramo[x] || 0) + c;
  }
  ((R[nivel] ||= {})[id] ||= {})[e] = A;
}
const pc = (a, b) => (b ? a * 100 / b : 0), f0 = x => x.toFixed(0).padStart(3);
console.log(`Pesistas y decisiones en 'u' · ${N} finales por pesista, estrategia y nivel de rivales (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const nivel of ['amistoso', 'normal']) {
  console.log(`Rivales ${nivel}: oro % · barras caídas % · sin total % · total medio (kg)`);
  for (const id of ATL) console.log(`   ${TIPO[id].padEnd(8)} ${Object.entries(R[nivel][id]).map(([e, A]) => `${e} ${f0(pc(A.oro, A.n))} · ${f0(pc(A.caidas, A.barras))} · ${f0(pc(A.sinTotal, A.n))} · ${(A.total / Math.max(1, A.n - A.sinTotal)).toFixed(0)}`).join('  |  ')}`);
}
// qué tramo gastó más en las caídas (lo que nombra la línea de caída), todas las estrategias y niveles juntos
const donde = {}; for (const nivel in R) for (const id in R[nivel]) for (const e in R[nivel][id]) for (const [x, c] of Object.entries(R[nivel][id][e].tramo)) { const D = (donde[id] ||= { n: 0 }); D[x] = (D[x] || 0) + c; D.n += c; }
console.log('Tramo que más gastó en las caídas (todas las finales): ' + ATL.map(id => `${TIPO[id]} ${['tiron', 'arriba', 'pararse'].map(x => `${x} ${pc(donde[id]?.[x] || 0, donde[id]?.n || 0).toFixed(0)} %`).join(', ')}`).join(' · '));

const mal = [];
for (const id of ATL) {
  const N0 = R.normal[id], d1 = pc(N0.lector.oro, N0.lector.n) - pc(N0.prudente.oro, N0.prudente.n), d2 = pc(N0.lector.oro, N0.lector.n) - pc(N0.codicioso.oro, N0.codicioso.n);
  console.log(`E. ${TIPO[id]}: el lector gana el oro ${d1.toFixed(0)} puntos más que el prudente y ${d2.toFixed(0)} más que el codicioso (rivales normales)   meta ≥ 15 · ≥ 15`);
  if (d1 < 15 || d2 < 15) mal.push(`E: con ${TIPO[id]}, el lector gana el oro ${d1.toFixed(0)} / ${d2.toFixed(0)} puntos más que el prudente / codicioso (meta ≥ 15)`);
  const am = R.amistoso[id]; if (pc(am.lector.oro, am.lector.n) < 40) mal.push(`jugable: con ${TIPO[id]} y rivales amistosos, el lector gana el oro en ${pc(am.lector.oro, am.lector.n).toFixed(0)} % (meta ≥ 40)`);
  for (const nivel of ['amistoso', 'normal']) { const P = R[nivel][id].plan; if (pc(P.caidas, P.barras) > 12) mal.push(`jugable: con ${TIPO[id]} y el plan del entrenador se caen ${pc(P.caidas, P.barras).toFixed(0)} % de las barras (rivales ${nivel}, meta ≤ 12)`); }
}
const D = (id, x) => pc(donde[id]?.[x] || 0, donde[id]?.n || 0);
if (D('brenner', 'pararse') < 50) mal.push(`distintos: Largo cae al pararse solo en ${D('brenner', 'pararse').toFixed(0)} % de sus caídas`);
if (D('marangi', 'arriba') < 50) mal.push(`distintos: Potente cae arriba solo en ${D('marangi', 'arriba').toFixed(0)} % de sus caídas`);
console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: los pesistas se juegan distinto, ninguno queda injugable y elegir los kilos importa (meta E)');
process.exit(mal.length ? 1 : 0);
