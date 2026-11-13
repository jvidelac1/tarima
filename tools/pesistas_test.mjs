// Pesistas y decisiones en finales enteras del nivel 'u' (docs/JUEGO.md, Gameplay 2 y 2.1: metas D y E), sin navegador.
// El jugador toca como el novato reactivo de tools/uno_bots.mjs (la meta A asegura que cualquier manera de tocar, o no
// tocar, da lo mismo): lo único que cambia entre estrategias es qué kilos pide.
//   panel      confirma siempre lo que el panel trae puesto: el peso del entrenador (web/js/game/entrenador.js), que lee la
//              chance de cada peso y La cuenta. Es lo que hace quien aprieta Espacio sin pensar
//   plan       abre al 90 % y confirma lo declarado, que en 'u' ya es el peso del entrenador al cerrar el intento anterior
//              (match.js); el panel lo vuelve a mirar al abrir el llamado, con lo que hicieron los rivales en el medio
//   prudente   abre al 90 % y sube siempre 2 kg (repite si cae)
//   codicioso  pide siempre el peso más alto que sube 3 de cada 10 veces (lo que el panel muestra como «3 de 10»)
// Criterios (rivales normales y amistosos, N finales por pesista y estrategia):
//   E. con rivales normales, el panel gana el oro al menos 15 puntos más seguido que el prudente y que el codicioso, con
//      cada pesista (elegir los kilos importa, y lo que el panel propone es una buena elección);
//   jugables: con rivales amistosos, el panel gana el oro en ≥ 40 % de las finales con cada pesista, y con rivales normales
//      en ≥ 20 %; con el panel se caen ≤ 15 % de las barras con cada pesista (meta M; las que caen son terceros intentos que van
//      por más o por el oro: riesgo elegido, no falta de coordinación);
//   distintos: en las caídas, lo que más le costó a Largo es pararse y a Potente, arriba de la cabeza (lo que dice su tarjeta);
//   parejos: con rivales normales, ningún pesista gana con el panel más de 25 puntos que otro.
// Uso: node tools/pesistas_test.mjs [--n=200]
import { Partida } from '../web/js/sim/match.js';
import { HUELLA_IA } from '../web/js/sim/ai.js';      // los rivales del juego (con personalidad)
import { mezclar } from '../web/js/sim/fixed.js';
import { cuerpoDe, KG_MAX } from '../web/js/sim/rules.js';
import { sugerencia, chanceDe } from '../web/js/sim/entrenador.js';
import { jugarUno, datos, ATL, BOTS_U } from './uno_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 200);
const NOVATO = { ...BOTS_U.reactivo, lag: 60 };
const TIPO = { ventura: 'Compacto', brenner: 'Largo', marangi: 'Potente' };

/** Kilos que pide cada estrategia en el llamado en curso (null: deja lo declarado). */
const ESTRATEGIAS = {
  panel: (p, i, lev) => (p.at[i].cambios === 0 ? sugerencia(p, i, lev) : null),      // como main.js: después de un cambio, se respeta el peso
  plan: () => null,
  prudente: (p, i, lev) => { const a = p.at[i], u = a[lev].at(-1); return u && u.res === 'valido' ? u.kg + 2 : null; },
  codicioso: (p, i, lev) => { const a = p.at[i]; if (!a[lev].length) return null; let k = p.minimo(i); while (k + 1 <= KG_MAX && chanceDe(p, i, lev, k + 1) >= 300) k++; return k; },
};

function final(id, nivel, estrategia, k) {
  const yo = ATL.indexOf(id), semilla = mezclar(k, 5150, yo, nivel === 'normal' ? 1 : 0);
  const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: 'u', tactil: true, ia: HUELLA_IA, atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
  const f = datos.atletas[id], elegir = ESTRATEGIAS[estrategia], cuerpo = cuerpoDe(id), out = { barras: 0, caidas: 0, tramo: {} };
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

const mal = [], oroN = {};
for (const id of ATL) {
  const N0 = R.normal[id], o = e => pc(N0[e].oro, N0[e].n), d1 = o('panel') - o('prudente'), d2 = o('panel') - o('codicioso'); oroN[id] = o('panel');
  console.log(`E. ${TIPO[id]}: con lo que trae el panel gana el oro ${d1.toFixed(0)} puntos más que el prudente y ${d2.toFixed(0)} más que el codicioso (rivales normales)   meta ≥ 15 · ≥ 15`);
  if (d1 < 15 || d2 < 15) mal.push(`E: con ${TIPO[id]}, el panel gana el oro ${d1.toFixed(0)} / ${d2.toFixed(0)} puntos más que el prudente / codicioso (meta ≥ 15)`);
  const am = R.amistoso[id]; if (pc(am.panel.oro, am.panel.n) < 40) mal.push(`jugable: con ${TIPO[id]} y rivales amistosos, el panel gana el oro en ${pc(am.panel.oro, am.panel.n).toFixed(0)} % (meta ≥ 40)`);
  if (o('panel') < 20) mal.push(`jugable: con ${TIPO[id]} y rivales normales, el panel gana el oro en ${o('panel').toFixed(0)} % (meta ≥ 20)`);
  for (const nivel of ['amistoso', 'normal']) { const P = R[nivel][id].panel; if (pc(P.caidas, P.barras) > 15) mal.push(`jugable: con ${TIPO[id]} y el panel se caen ${pc(P.caidas, P.barras).toFixed(0)} % de las barras (rivales ${nivel}, meta ≤ 15)`); }
}
{ const v = Object.values(oroN), d = Math.max(...v) - Math.min(...v); console.log(`Parejos: oro con el panel y rivales normales ${ATL.map(id => `${TIPO[id]} ${oroN[id].toFixed(0)} %`).join(' · ')} (diferencia ${d.toFixed(0)} puntos, meta ≤ 25)`); if (d > 25) mal.push(`parejos: con el panel, un pesista gana ${d.toFixed(0)} puntos más que otro (meta ≤ 25)`); }
const D = (id, x) => pc(donde[id]?.[x] || 0, donde[id]?.n || 0);
if (D('brenner', 'pararse') < 50) mal.push(`distintos: Largo cae al pararse solo en ${D('brenner', 'pararse').toFixed(0)} % de sus caídas`);
if (D('marangi', 'arriba') < 50) mal.push(`distintos: Potente cae arriba solo en ${D('marangi', 'arriba').toFixed(0)} % de sus caídas`);
console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: los pesistas se juegan distinto, ninguno queda injugable ni domina, y elegir los kilos importa (meta E)');
process.exit(mal.length ? 1 : 0);
