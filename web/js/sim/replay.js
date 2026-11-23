// Recalcula una partida entera desde su registro (docs/JUEGO.md, sección 9.6). Lo usan las pruebas y, en la etapa 5, el
// servidor: el cliente manda lo que el jugador tocó, nunca un resultado. Cualquier registro que no cierre se rechaza.
import { Partida, TURNOS, HUELLA_TURNOS } from './match.js';
import { HUELLA_IA } from './ai.js';
import { VERSION, NIVELES, RELOJ, CONTROLES, HUELLA_U, HUELLAS_B, NIVELES_B, PROGRESION } from './rules.js';

const MAX_ENT = 4000, MAX_MS = 240000;
const entero = x => Number.isInteger(x);

function validarLlamado(c, reloj) {
  if (!Array.isArray(c.cambios) || c.cambios.length > 2) return 'cambios mal formados';
  for (const x of c.cambios) if (!Array.isArray(x) || x.length !== 2 || !entero(x[0]) || !entero(x[1])) return 'cambio mal formado';
  if (c.fin === 'desplazado') return c.cambios.length ? null : 'desplazado sin cambio';
  if (c.fin !== 'intento') return 'fin desconocido';
  if (c.conf !== null && (!entero(c.conf) || c.conf < 0 || c.conf > reloj)) return 'confirmación fuera del reloj';
  if (c.conf !== null && c.cambios.length && c.conf < c.cambios[c.cambios.length - 1][0]) return 'cambio después de confirmar';
  if (!Array.isArray(c.ent) || c.ent.length > MAX_ENT) return 'entradas mal formadas';
  let t = 0, n = 0;
  for (const e of c.ent) {
    if (!Array.isArray(e) || e.length !== 2 || !entero(e[0]) || (e[1] !== 0 && e[1] !== 1)) return 'entrada mal formada';
    if (e[0] < t || e[0] > reloj + MAX_MS) return 'instantes fuera de orden o de rango';
    t = e[0]; n += e[1] ? 1 : -1; if (n < 0) return 'se levanta un contacto que no estaba apoyado';
  }
  return null;
}

/**
 * @param {object} reg    registro exportado por la partida
 * @param {object} datos  sim.json ya verificado
 * @param {{parcial?:boolean}} [o]  acepta un registro que todavía no terminó
 * @returns {{ok:true, tabla:object[], partida:Partida} | {ok:false, error:string}}
 */
export function recalcular(reg, datos, o = {}) {
  try {
    if (!reg || reg.v !== 2 || reg.sim !== VERSION) return { ok: false, error: 'versión de reglas' };
    if (reg.datos !== datos.huella || reg.temporada !== datos.temporada) return { ok: false, error: 'huella o temporada de sim.json' };
    if (!NIVELES[reg.nivel] || !entero(reg.cal) || reg.cal < 0 || reg.cal > 100 || !entero(reg.semilla)) return { ok: false, error: 'cabecera' };
    if (reg.ctl !== undefined && !CONTROLES.includes(reg.ctl)) return { ok: false, error: 'nivel de control desconocido' };
    // 'u' tiene sus reglas fuera de sim.json (rules.js → UNO y CUERPOS_U): su huella va aparte
    if (reg.ctl === 'u' && reg.uno !== HUELLA_U) return { ok: false, error: "huella de las reglas de 'u'" };
    // 'b': cada nivel de dificultad tiene su huella (Fácil, sin `dif` en la cabecera: la de siempre)
    if (reg.dif !== undefined && (reg.ctl !== 'b' || !NIVELES_B[reg.dif])) return { ok: false, error: 'nivel de dificultad desconocido' };
    if (reg.ctl === 'b' && reg.barra !== HUELLAS_B[reg.dif ?? 'facil']) return { ok: false, error: "huella de las reglas de 'b'" };
    // rivales con personalidad (ai.js): su propia huella; sin `ia`, los rivales de siempre (registros anteriores)
    if (reg.ia !== undefined && reg.ia !== HUELLA_IA) return { ok: false, error: 'huella de las reglas de los rivales' };
    // el estilo de envión fijo toda la competencia (LIF-43): `envFijo: true`; sin él, las reglas de antes
    if (reg.envFijo !== undefined && reg.envFijo !== true) return { ok: false, error: 'regla del estilo de envión desconocida' };
    // orden de turnos (LIF-3 y LIF-4): `orden` ('rondas' u 'oficial') con la huella de sus reglas; sin los dos, el de siempre
    if ((reg.orden !== undefined || reg.turnos !== undefined) && (reg.turnos !== HUELLA_TURNOS || !TURNOS.modos.includes(reg.orden))) return { ok: false, error: 'huella u orden de los turnos' };
    const turnos = reg.orden !== undefined, maxLl = turnos ? 40 + 6 * TURNOS.previos : 40;
    if (!Array.isArray(reg.atletas) || !Array.isArray(reg.aperturas) || reg.aperturas.length !== 3 || !Array.isArray(reg.llamados) || reg.llamados.length > maxLl) return { ok: false, error: 'forma del registro' };
    // progresión (LIF-14): solo la persona, enteros entre 0 y el tope; el servidor además la compara con los oros que validó
    for (const x of reg.atletas) if (x && x.rm !== undefined) { const r = x.rm; if (x.ctrl !== 'persona' || !r || Object.keys(r).length !== 2 || ![r.s, r.c].every(v => entero(v) && v >= 0 && v <= PROGRESION.tope)) return { ok: false, error: 'progresión mal formada' }; }
    const p = new Partida(datos, { semilla: reg.semilla, nivel: reg.nivel, cal: reg.cal, primera: reg.primera, ctl: reg.ctl, tactil: reg.tactil === true, ...(reg.ia !== undefined ? { ia: reg.ia } : {}), ...(turnos ? { turnos: reg.orden } : {}), ...(reg.dif !== undefined ? { dif: reg.dif } : {}), ...(reg.envFijo ? { envFijo: true } : {}), atletas: reg.atletas });
    const abrir = lev => { p.at.forEach((a, i) => { if (a.ctrl === 'persona') p.abrir(i, lev, reg.aperturas[i][lev]); else if (reg.aperturas[i][lev] !== a.decl[lev]) throw new Error('la apertura de un rival no coincide'); }); p.empezar(); };
    abrir('s');
    for (const c of reg.llamados) {
      if (p.fase === 'intervalo') abrir('c');
      // un cambio de pedido de la persona antes de su turno: {a, lev, pide}
      if (c && c.pide !== undefined) {
        if (!turnos || Object.keys(c).length !== 3 || c.lev !== p.lev || !entero(c.a) || !entero(c.pide)) return { ok: false, error: 'pedido mal formado' };
        const v = p.pedidoValido(c.a, c.pide); if (v) return { ok: false, error: 'pedido inválido: ' + v };
        p.pedir(c.a, c.pide); continue;
      }
      const L = p.llamado; if (!L) return { ok: false, error: 'sobran llamados' };
      if (c.a !== L.a || c.lev !== L.lev || c.n !== L.n) return { ok: false, error: `el llamado ${L.idx} no es el que toca` };
      if (p.at[L.a].ctrl === 'juego') { if (Object.keys(c).length !== 3) return { ok: false, error: 'el llamado de un rival trae datos de más' }; p.resolverIA(); continue; }
      if (c.kg !== L.kg) return { ok: false, error: 'los kilos declarados no coinciden' };
      const mal = validarLlamado(c, L.reloj); if (mal) return { ok: false, error: mal };
      let desplazado = false;
      for (const [ms, kg] of c.cambios) { if (desplazado) return { ok: false, error: 'cambio después de quedar desplazado' }; const v = p.cambioValido(ms, kg); if (v) return { ok: false, error: 'cambio inválido: ' + v }; desplazado = p.cambio(ms, kg).desplazado; }
      if ((c.fin === 'desplazado') !== desplazado) return { ok: false, error: 'el desplazamiento no coincide' };
      if (!desplazado) p.resolver({ conf: c.conf, env: c.env, ent: c.ent });
    }
    if (p.fase !== 'fin' && !o.parcial) return { ok: false, error: 'la partida no terminó' };
    return { ok: true, tabla: p.tabla(), partida: p };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Resumen comparable de una tabla (lo que se guarda como resultado). */
export const resumen = tabla => tabla.map(f => `${f.id}:${f.s}+${f.c}=${f.total}#${f.puesto ?? '-'}`).join(' ');
export { RELOJ };
