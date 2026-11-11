// Rivales (docs/JUEGO.md, sección 7.3): gestos generados con la misma máquina del intento que usa el jugador, y elección de
// kilos con lo que se ve (techos de ficha, Resto y signo de la forma del día). No hay ayuda oculta.
import { idiv, mezclar, Azar } from './fixed.js';
import { Intento } from './attempt.js';
import { NIVELES, FIJA } from './rules.js';

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
