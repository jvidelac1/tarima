// Finales validadas (LIF-10), ranking (LIF-9) y campeonato semanal (LIF-8). El cliente manda lo que el jugador tocó (el
// registro de la partida), nunca un resultado: el Worker la recalcula con el mismo núcleo del juego y guarda lo que da.
import sim from '../../web/data/sim.json' with { type: 'json' };
import { leerDatos } from '../../web/js/sim/data.js';
import { recalcular } from '../../web/js/sim/replay.js';
import { resumenFinal } from '../../web/js/sim/final.js';
import { CAMPEONATO, semanaDe, semillaSemana } from '../../web/js/sim/semana.js';
import { normalizarNombre } from './reglas.js';
import { bonoRM } from '../../web/js/sim/rules.js';

let datos = null;
const datosSim = () => (datos ||= leerDatos(sim));

export const MAX_FINAL = 16384;      // bytes del cuerpo de /api/final (un registro real pesa 1,5 a 3 KB)
const TOPE_SALTOS = 60, TOPE_DURA = 3 * 3600;

/**
 * Valida una final contra su registro. `campeonato`: si dice ser la del campeonato, tiene que ser la de esa semana (o la
 * anterior, si terminó en la primera hora de la semana nueva) y con sus condiciones.
 * @returns {{ok:true, r:object, semana:string, campeonato:boolean} | {ok:false, error:string}}
 */
export function validarFinal(reg, { campeonato = false, ahora, desafio = null }) {
  const rc = recalcular(reg, datosSim());
  if (!rc.ok) return { ok: false, error: rc.error };
  const r = resumenFinal(rc.partida);
  let semana = semanaDe(ahora).clave;
  if (campeonato) {
    const previa = semanaDe(ahora - 3600).clave, vale = [semana, previa].find(k => semillaSemana(k) === reg.semilla);
    if (!vale) return { ok: false, error: 'no es la final de la semana' };
    if (reg.ctl !== CAMPEONATO.ctl || (reg.dif ?? 'facil') !== CAMPEONATO.dif || reg.nivel !== CAMPEONATO.nivel || reg.orden !== CAMPEONATO.orden) return { ok: false, error: 'condiciones del campeonato' };
    semana = vale;
  }
  // desafío (LIF-12): la misma final que la de origen, sin progresión
  if (desafio) {
    if (reg.semilla !== desafio.semilla || (reg.ctl ?? 'c') !== desafio.ctl || (reg.dif ?? 'facil') !== desafio.dif || reg.nivel !== desafio.nivel || (reg.orden ?? 'rondas') !== desafio.orden) return { ok: false, error: 'no es la final del desafío' };
    const yo = reg.atletas.find(x => x && x.ctrl === 'persona'); if (yo?.rm && (yo.rm.s || yo.rm.c)) return { ok: false, error: 'el desafío se juega sin progresión' };
  }
  return { ok: true, r, semana, campeonato: campeonato && !desafio, desafio: desafio ? desafio.id : null };
}

/** Lo que manda el cliente además del registro: entero en rango o null. */
const entero = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

/** Inserta la final. Devuelve el id, o null si ese pase ya tenía una final. */
export async function guardarFinal(db, { p, d, ahora, v, reg, b, pais }) {
  const r = v.r, apodo = b.publico === true ? normalizarNombre(b.apodo) : null;
  const res = await db.prepare(`INSERT INTO finales (p, d, en, semana, campeonato, semilla, ctl, dif, nivel, pesista, s, c, total, puesto,
      intentos, validos, nulos, caidas, barritas, verdes, todo_verde, saltos, duracion_s, apodo, pais, desafio, orden)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)
      ON CONFLICT (p) DO NOTHING`).bind(p, d, ahora, v.semana, v.campeonato ? 1 : 0, reg.semilla, reg.ctl ?? 'c', reg.dif ?? 'facil', reg.nivel, r.pesista,
    r.s, r.c, r.total, r.puesto, r.intentos, r.validos, r.nulos, r.caidas, r.barritas, r.verdes, r.todo_verde,
    entero(b.saltos, TOPE_SALTOS), entero(b.duracion_s, TOPE_DURA), apodo, pais, v.desafio ?? null, reg.orden ?? 'rondas').run();
  return res.meta.changes === 1 ? res.meta.last_row_id : null;
}

/** Puesto de un total en la semana del campeonato (1 = el mejor; empata quien llegó antes). */
export async function puestoEnSemana(db, semana, total, en) {
  const x = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM (SELECT d, MAX(total) t, MIN(en) e FROM finales WHERE campeonato = 1 AND semana = ?1 GROUP BY d)
        WHERE t > ?2 OR (t = ?2 AND e < ?3)) + 1 AS puesto,
      (SELECT COUNT(DISTINCT d) FROM finales WHERE campeonato = 1 AND semana = ?1) AS de`).bind(semana, total, en).first();
  return { puesto: x.puesto, de: x.de };
}

const ALCANCES = new Set(['semana', 'global']);
/**
 * Ranking: `semana` (campeonato de esa semana: el mejor total de cada dispositivo) o `global` (mejor total validado de cada
 * dispositivo, con los campeonatos ganados). `pais` filtra (código de 2 letras). Sin apodo publicado sale anónimo.
 */
export async function ranking(db, { alcance = 'semana', semana, pais = null, tope = 50, d = null }) {
  if (!ALCANCES.has(alcance)) alcance = 'semana';
  const filtroPais = pais ? 'AND pais = ?2' : '';
  let filas;
  if (alcance === 'semana') {
    filas = (await db.prepare(`SELECT d, MAX(total) AS total, MIN(en) AS en, COUNT(*) AS finales,
        (SELECT apodo FROM finales g WHERE g.d = f.d AND g.apodo IS NOT NULL ORDER BY g.en DESC LIMIT 1) AS apodo,
        (SELECT pesista FROM finales g WHERE g.d = f.d AND g.campeonato = 1 AND g.semana = ?1 ORDER BY g.total DESC, g.en LIMIT 1) AS pesista,
        MAX(pais) AS pais
      FROM finales f WHERE campeonato = 1 AND semana = ?1 ${filtroPais} GROUP BY d ORDER BY total DESC, en LIMIT ?3`).bind(semana, pais, tope).all()).results;
  } else {
    filas = (await db.prepare(`SELECT d, MAX(total) AS total, MIN(en) AS en, COUNT(*) AS finales,
        (SELECT apodo FROM finales g WHERE g.d = f.d AND g.apodo IS NOT NULL ORDER BY g.en DESC LIMIT 1) AS apodo,
        (SELECT pesista FROM finales g WHERE g.d = f.d ORDER BY g.total DESC, g.en LIMIT 1) AS pesista,
        MAX(pais) AS pais,
        (SELECT COUNT(*) FROM campeones k WHERE k.d = f.d AND k.semana != ?1) AS titulos
      FROM finales f WHERE d != '' ${filtroPais} GROUP BY d ORDER BY titulos DESC, total DESC, en LIMIT ?3`).bind(semana, pais, tope).all()).results;
  }
  return filas.map((f, k) => ({ puesto: k + 1, apodo: f.apodo || null, pais: f.pais || null, pesista: f.pesista, total: f.total, finales: f.finales, ...(f.titulos !== undefined ? { titulos: f.titulos } : {}), ...(d && f.d === d ? { yo: true } : {}) }));
}

/** Oros validados de un dispositivo con un pesista (la base de su progresión). */
export const orosCon = async (db, d, pesista) => (await db.prepare('SELECT COUNT(*) AS n FROM finales WHERE d = ?1 AND pesista = ?2 AND puesto = 1').bind(d, pesista).first()).n;

/**
 * La progresión que trae el registro (atletas[persona].rm) tiene que estar respaldada por los oros ya validados con ese
 * pesista, y el campeonato se juega sin progresión. Devuelve null si está bien, o el motivo.
 */
export async function revisarProgresion(db, d, reg, campeonato) {
  const yo = reg.atletas.find(x => x && x.ctrl === 'persona'); if (!yo || !yo.rm) return null;
  if (campeonato && (yo.rm.s || yo.rm.c)) return 'el campeonato se juega sin progresión';
  const tope = bonoRM(await orosCon(db, d, yo.id));
  return yo.rm.s > tope.s || yo.rm.c > tope.c ? 'progresión sin respaldo' : null;
}

/** El perfil del jugador (LIF-68, LIF-11), sacado de sus finales validadas. */
export async function perfil(db, d, semana = '') {
  const tot = await db.prepare(`SELECT COUNT(*) AS finales, SUM(puesto = 1) AS oros, SUM(puesto = 2) AS platas, SUM(puesto = 3) AS bronces,
      MAX(total) AS mejor_total, SUM(validos) AS validos, SUM(intentos) AS intentos, SUM(campeonato) AS de_campeonato,
      (SELECT COUNT(*) FROM campeones k WHERE k.d = ?1 AND k.semana != ?2) AS titulos FROM finales WHERE d = ?1`).bind(d, semana).first();
  const por = (await db.prepare(`SELECT pesista, COUNT(*) AS finales, SUM(puesto = 1) AS oros, MAX(total) AS mejor_total, MAX(s) AS mejor_s, MAX(c) AS mejor_c
      FROM finales WHERE d = ?1 GROUP BY pesista`).bind(d).all()).results;
  const recientes = (await db.prepare(`SELECT en, pesista, total, puesto, campeonato FROM finales WHERE d = ?1 ORDER BY en DESC LIMIT 10`).bind(d).all()).results;
  return {
    finales: tot.finales || 0, oros: tot.oros || 0, platas: tot.platas || 0, bronces: tot.bronces || 0, mejor_total: tot.mejor_total || 0,
    validos: tot.validos || 0, intentos: tot.intentos || 0, de_campeonato: tot.de_campeonato || 0, titulos: tot.titulos || 0,
    pesistas: Object.fromEntries(por.map(x => [x.pesista, { finales: x.finales, oros: x.oros || 0, mejor_total: x.mejor_total || 0, mejor_s: x.mejor_s || 0, mejor_c: x.mejor_c || 0, rm: bonoRM(x.oros || 0) }])),
    recientes: recientes.map(x => ({ en: x.en, pesista: x.pesista, total: x.total, puesto: x.puesto, campeonato: !!x.campeonato })),
  };
}

/** Una final de origen para un desafío (LIF-12): sus condiciones y su resultado, sin nada del dispositivo. */
export async function finalDeDesafio(db, id) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const f = await db.prepare(`SELECT id, semilla, ctl, dif, nivel, orden, pesista, s, c, total, puesto, apodo, pais, en,
      (SELECT COUNT(*) FROM finales g WHERE g.desafio = finales.id) AS aceptados,
      (SELECT COUNT(*) FROM finales g WHERE g.desafio = finales.id AND g.total > finales.total) AS lo_superaron
    FROM finales WHERE id = ?1`).bind(id).first();
  return f || null;
}
