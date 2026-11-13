// Rivales (docs/JUEGO.md, sección 7.3): gestos generados con la misma máquina del intento que usa el jugador, y elección de
// kilos con lo que se ve (techos de ficha, Resto y signo de la forma del día). No hay ayuda oculta.
import { idiv, rdiv, clampi, mezclar, Azar, huella, canonico } from './fixed.js';
import { Intento } from './attempt.js';
import { NIVELES, FIJA, APERTURA } from './rules.js';

const INF = 2147483647;

/**
 * Genera los gestos de un intento: mismo formato que los del jugador ({conf, ent}). El error de tiempo de cada gesto es
 * sembrado y depende solo del nivel (`sd`, ms); en la pelea apunta al centro de la franja verde con un error sembrado
 * (`pelea`, milésimas) y toca a lo sumo 6 veces por segundo. Siempre espera la chicharra. Para el informe de balance, un
 * nivel con `ritmo` (ms) toca a ritmo fijo durante toda la pelea, sin mirar la franja (machacador y metrónomo).
 * @param {object} ctx  contexto del intento   @param {{sd:number, pelea:number}} nivel   @param {number} semilla
 */
export function gestos(ctx, nivel, semilla) {
  const N = typeof nivel === 'string' ? NIVELES[nivel] : nivel, r = new Azar(mezclar(semilla, 1)), m = new Intento(ctx), ent = [];
  const conf = 1500 + r.ent(2000); m.confirmar(conf);
  const baja = t => { t = Math.max(t, m.t + 1); ent.push([t, 1]); m.entrada(t, 1); return t; };
  const sube = t => { t = Math.max(t, m.t + 1); ent.push([t, 0]); m.entrada(t, 0); return t; };
  let ult = -INF, err = r.campana(N.pelea);
  for (let guarda = 0; !m.res && guarda < 200000; guarda++) {
    const M = m.M;
    switch (m.fase) {
      case 'acomodo': m.avanzar(m.tSet); break;
      case 'tension': case 'hombros': {
        const desde = Math.max(m.t, M.ign) + 250; let k = idiv(desde - M.t0, m.per) + 1; if (k < 1) k = 1;
        baja(Math.max(M.ign, M.t0 + k * m.per + r.campana(N.sd))); break;
      }
      case 'tiron': sube(Math.max(M.tk + 1, M.tx + r.campana(N.sd))); break;
      case 'flexion': sube(Math.max(M.tx - M.w.l, M.tx + r.campana(N.sd))); break;
      case 'vuelo': case 'empuje': {
        if (M.tFallo < INF) { m.avanzar(M.tFallo); break; }
        const t = baja(M.tc + r.campana(N.sd)); ult = t; if (!m.res) sube(t + 50); break;
      }
      case 'pelea': case 'traba': {
        const p = M.pelea, t = Math.max(m.t, p.t0) + 8; m.avanzar(t);
        if (m.res || m.M.pelea !== p || (m.fase !== 'pelea' && m.fase !== 'traba')) break;
        const traba = !p.trabado && p.E < p.exiTraba + 150;
        const quiere = N.ritmo ? true : p.modo === 'traba' ? traba : (p.P < 1000000 && p.aguja < p.exiAhora + 50 + err) || traba;
        if (quiere && t - ult >= (N.ritmo || 167)) { ult = baja(t); if (!m.res) sube(ult + 40); err = r.campana(N.pelea); }
        break;
      }
      case 'post': m.avanzar(M.tPost); break;
      case 'fijacion': {
        const f = m.fij;
        if (m.n === 0) baja(m.t + 40 + r.ent(80));
        else if (!f.firme) m.avanzar(Math.max(f.desde + FIJA.firmeMs, m.t + 1));
        else sube(f.tb + 180 + r.ent(250));
        break;
      }
      default: m.avanzar(m.proximo());
    }
  }
  if (!m.res) throw new Error('gestos: el intento no terminó');
  return { conf, ent, res: m.res };
}

/**
 * Envión que elige un rival: el power si lo domina y el peso es de apertura (hasta el 95 %); si no, el primero que domina
 * que no sea squat. Con el balance de hoy el squat no tiene premio (ver el informe de balance), así que los rivales no lo usan.
 */
export function elegirEnvion(ficha, I) { return ficha.enviones.includes('power') && I <= 9500 ? 'power' : ficha.enviones.find(e => e !== 'squat') || ficha.enviones[0]; }

/**
 * Kilos que quiere pedir el rival `i` para su próximo intento, o null si se queda con lo declarado. Solo mira lo que se ve.
 * - Tercer intento de dos tiempos: lo que hace falta para subir un puesto si entra en su umbral; si no, lo máximo que mejora
 *   su total sin pasar del 99 %; y si va puntero, lo que obliga al perseguidor a pasar del 100 % de su techo visible.
 * - Antes: su plan, sin declarar por encima de su umbral, con su estilo de cambios («pasa» por un kilo para salir después,
 *   u «orgullo»: sube si lo pasaron).
 */
export function decidir(p, i) {
  const a = p.at[i], lev = p.lev, n = a[lev].length + 1; if (n > 3 || a.ctrl !== 'juego') return null;
  const min = p.minimo(i), tv = p.techoVisible(i, lev), ia = a.f.ia, tope = Math.max(min, idiv(tv * (ia.umbral + NIVELES[p.cfg.nivel].abre), 1000000));
  let kg = Math.max(a.decl[lev], min);
  if (lev === 'c' && n === 3 && a.mejor.s > 0) {
    const actual = p.puestoSi(i, lev, 0);
    if (actual === 1) {
      const per = p.at.filter(b => b.i !== i && b.mejor.s > 0 && b.c.length < 3).sort((x, y) => (y.mejor.s + y.mejor.c) - (x.mejor.s + x.mejor.c))[0];
      if (per) kg = Math.min(Math.max(min, idiv(p.techoVisible(per.i, 'c'), 1000) + per.mejor.s - a.mejor.s), Math.max(min, idiv(tv, 1000)));
    } else {
      let hecho = false;
      for (let puesto = 1; puesto < actual && !hecho; puesto++) for (let k = min; k <= tope; k++) if (p.puestoSi(i, lev, k) <= puesto) { kg = k; hecho = true; break; }
      if (!hecho) { const m99 = idiv(tv * 99, 100000); kg = m99 > a.mejor.c && m99 >= min ? m99 : min; }
    }
  } else {
    if (kg > tope) kg = tope;
    const riv = p.at.filter(b => b.i !== i && b[lev].length < 3).map(b => b.decl[lev]);
    if (ia.estilo === 'pasa') { for (const d of riv) if (d >= kg && d <= kg + 2 && d + 1 <= tope) kg = d + 1; }
    else if (ia.estilo === 'orgullo') { for (const d of riv) if (d > kg && d <= kg + 2 && d + 1 <= tope) kg = d + 1; }
  }
  return kg !== a.decl[lev] ? kg : null;
}

// ---------- Rivales con personalidad (13-nov: «que los otros levantadores tengan su propia estrategia de pesos») ----------
// Diagnóstico (tools/rivales_test.mjs y HANDOFF.md, «Rivales con personalidad»): con `decidir` de arriba, Brenner («pasa») y
// Marangi («orgullo») declaraban un kilo más que lo que tuviera declarado otro pesista dentro de sus 2 kg, y el tercer dos
// tiempos salía de los kilos del puntero: un tercio de sus decisiones cambiaba si el jugador declaraba 3 kg más o menos, y
// el 39 % de los cambios que se ven después del intento del jugador caían justo en lo que él había declarado más un kilo.
// Ahora cada rival tiene una personalidad (la de su ficha, docs/JUEGO.md 7.1) y un plan sembrado por final que sale de SU
// techo visible, su forma del día y su Resto; la tabla solo la mira en el dos tiempos, en términos de total.
//   seguro    (Ventura, «el relojero»)   abre cómodo, sube de a poco, el tercero sin pasar del 99 %; si no tiene marca en ese
//             levantamiento, repite (asegura el total). En el último dos tiempos sube un puesto solo si cuesta ≤ 99 %.
//   calcula   (Brenner, «el calculador») abre en el medio. En el dos tiempos mira la tabla: si va primero, el segundo es
//             cómodo (≤ 97,5 %); en el último, si va atrás, pide lo justo para subir un puesto (hasta su umbral) y si va
//             primero obliga al perseguidor a pasar del 100 % de su techo visible. Algunas finales «se guarda» en el
//             tercer arranque (≤ 96,5 %) para llegar más entero al dos tiempos.
//   arriesga  (Marangi, «el showman»)    abre alto, saltos grandes, tras un nulo a veces sube un kilo, y el tercero va por
//             encima del 100 % («va por todo»); en el último dos tiempos va por el oro si cuesta ≤ 106 %. Se queda sin marca
//             más seguido que los otros.
// Permilajes del techo visible (antes de NIVELES.abre): `abre` la apertura, `meta2` y `meta3` adónde quiere llegar en el
// segundo y el tercer intento (de ahí salen sus saltos, en kg, al empezar la final); `guarda` y `sube`, milésimas de
// probabilidad por final.
export const PERSONALIDADES = {
  ventura: { estilo: 'seguro', abre: [915, 950], meta2: [965, 980], meta3: [985, 1000], sube: 0, pasar: 1010 },
  brenner: { estilo: 'calcula', abre: [910, 950], meta2: [965, 985], meta3: [990, 1010], sube: 0, umbral: [1010, 1030], guarda: 400, guardaHasta: 965, asegura: 975 },
  marangi: { estilo: 'arriesga', abre: [930, 970], meta2: [960, 980], meta3: [1005, 1035], sube: 500, oro: 1070 },
};
const NEUTRA = PERSONALIDADES.brenner;
/**
 * Versión de las reglas de los rivales con personalidad: va en la cabecera del registro (`ia`) y replay.js la exige. La lógica
 * de planRival y decidirPlan no entra en la huella: si cambia, hay que subir `version` (y regenerar tools/sim_ref_rivales.json).
 */
export const IA = { version: '2.0' };
export const HUELLA_IA = huella(canonico({ IA, PERSONALIDADES }));

/**
 * Plan de un rival para una final (sembrado, sin mirar a nadie más): aperturas, saltos, topes y, según la personalidad, si
 * se guarda en el arranque o si sube tras un nulo. `tv`: techo visible de cada levantamiento al empezar (g).
 */
export function planRival(id, tv, techo, nivel, semilla) {
  const P = PERSONALIDADES[id] || NEUTRA, r = new Azar(mezclar(semilla, 31)), N = NIVELES[nivel], ent = ([a, b]) => r.entre(a, b);
  const plan = { estilo: P.estilo, abre: { s: ent(P.abre), c: ent(P.abre) }, meta2: ent(P.meta2), meta3: ent(P.meta3), umbral: P.umbral ? ent(P.umbral) : 0,
    guarda: !!P.guarda && r.ent(1000) < P.guarda, sube: [r.ent(1000) < P.sube, r.ent(1000) < P.sube], decl: {}, saltos: {}, momento: {} };
  for (const lev of ['s', 'c']) {
    const kg = x => rdiv(tv[lev] * (x + N.abre), 1000000), d = clampi(kg(plan.abre[lev]), -idiv(-techo[lev] * APERTURA.min, 1000), idiv(techo[lev] * APERTURA.max, 1000));
    const k2 = Math.max(d + 1, kg(plan.meta2)), k3 = Math.max(k2 + 1, kg(plan.meta3));
    plan.decl[lev] = d; plan.saltos[lev] = [k2 - d, k3 - k2];
  }
  return plan;
}

/**
 * Kilos del próximo intento del rival `i` con su personalidad. `propio`: acaba de levantar (siempre devuelve un peso, su
 * plan); si no, levantó otro y solo cambia si la TABLA del dos tiempos le pide otra cosa (null: se queda con lo declarado).
 * La tabla se lee en totales («lo justo para subir un puesto»), nunca copiando lo que declaró otro.
 */
export function decidirPlan(p, i, propio) {
  const a = p.at[i], lev = p.lev, n = a[lev].length + 1; if (n > 3 || a.ctrl !== 'juego' || n === 1) return null;
  const P = PERSONALIDADES[a.id] || NEUTRA, pl = a.plan, min = p.minimo(i), tv = p.techoVisible(i, lev), N = NIVELES[p.cfg.nivel];
  const al = x => idiv(tv * (x + N.abre), 1000000), u = a[lev][a[lev].length - 1], tiene = a.mejor[lev] > 0, clave = lev + n;
  // 1. su plan: lo que sube tras un válido, repetir (o un kilo más) tras un nulo; si el cansancio le bajó el techo visible,
  // no pasa de su meta más un 1 %
  let kg = u.res === 'valido' ? u.kg + pl.saltos[lev][n - 2] : u.kg + (pl.sube[lev === 'c' ? 1 : 0] ? 1 : 0), por = 'plan', momento = '';
  kg = Math.min(kg, al((n === 3 ? pl.meta3 : pl.meta2) + 10));
  if (pl.estilo === 'seguro' && n === 3 && !tiene) kg = min;                                   // asegura una marca
  if (pl.estilo === 'arriesga' && n === 3 && tiene) { kg = Math.max(kg, al(pl.meta3)); if (kg * 1000000 >= tv * 1000) momento = 'todo'; }
  if (pl.estilo === 'calcula' && lev === 's' && n === 3 && pl.guarda) { kg = Math.min(kg, Math.max(min, al(P.guardaHasta))); momento = 'guarda'; }
  // 2. la tabla, solo en el dos tiempos y con un total en la mano (sin marca, cada uno sigue su plan)
  if (lev === 'c' && a.mejor.s > 0 && a.mejor.c > 0) {
    const ahora = p.puestoSi(i, 'c', 0), primero = ahora === 1 && p.at.some(b => b.i !== i && b.mejor.s > 0);
    const subir = hasta => { for (let k = min; k <= hasta; k++) if (p.puestoSi(i, 'c', k) < ahora) return k; return null; };
    if (pl.estilo === 'calcula') {
      if (primero && n === 2) { kg = Math.min(kg, Math.max(min, al(P.asegura))); por = 'tabla'; }
      else if (primero && n === 3) {
        const per = p.at.filter(b => b.i !== i && b.mejor.s > 0 && b.c.length < 3).sort((x, y) => (y.mejor.s + y.mejor.c) - (x.mejor.s + x.mejor.c))[0];
        if (per) { kg = Math.min(Math.max(min, idiv(p.techoVisible(per.i, 'c'), 1000) + per.mejor.s - a.mejor.s), Math.max(min, al(1000))); por = 'tabla'; }
      } else if (!primero && n === 3) { const k = subir(al(pl.umbral)); if (k !== null) { kg = k; por = 'tabla'; momento = 'pasar'; } }
    } else if (n === 3 && !primero) {
      if (pl.estilo === 'seguro') { const k = subir(al(P.pasar)); if (k !== null) { kg = k; por = 'tabla'; momento = 'pasar'; } }
      else if (pl.estilo === 'arriesga') { let k = null; for (let x = min; x <= al(P.oro) && k === null; x++) if (p.puestoSi(i, 'c', x) === 1) k = x; if (k !== null && k > kg) { kg = k; por = 'tabla'; momento = 'todo'; } }
    }
  }
  kg = Math.max(kg, min);
  if (!propio && (por !== 'tabla' || kg === a.decl[lev])) return null;
  pl.momento[clave] = momento;
  return kg;
}
/** Palabra de la personalidad para el intento `lev`+`n` del rival `a` (clave de i18n `rival.estilo.*`), o '' sin plan. */
export const estiloRival = (a, lev, n) => (a.plan ? a.plan.momento[lev + n] || a.plan.estilo : '');
