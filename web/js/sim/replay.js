// Recalcula una partida entera desde su registro (docs/JUEGO.md, sección 9.6). Lo usan las pruebas y, en la etapa 5, el
// servidor: el cliente manda lo que el jugador tocó, nunca un resultado. Cualquier registro que no cierre se rechaza.
import { Partida } from './match.js';
import { HUELLA_IA } from './ai.js';
import { VERSION, NIVELES, RELOJ, CONTROLES, HUELLA_U, HUELLAS_B, NIVELES_B } from './rules.js';

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
    if (!Array.isArray(reg.atletas) || !Array.isArray(reg.aperturas) || reg.aperturas.length !== 3 || !Array.isArray(reg.llamados) || reg.llamados.length > 40) return { ok: false, error: 'forma del registro' };
    const p = new Partida(datos, { semilla: reg.semilla, nivel: reg.nivel, cal: reg.cal, primera: reg.primera, ctl: reg.ctl, tactil: reg.tactil === true, ...(reg.ia !== undefined ? { ia: reg.ia } : {}), ...(reg.dif !== undefined ? { dif: reg.dif } : {}), atletas: reg.atletas });
    const abrir = lev => { p.at.forEach((a, i) => { if (a.ctrl === 'persona') p.abrir(i, lev, reg.aperturas[i][lev]); else if (reg.aperturas[i][lev] !== a.decl[lev]) throw new Error('la apertura de un rival no coincide'); }); p.empezar(); };
    abrir('s');
    for (const c of reg.llamados) {
      if (p.fase === 'intervalo') abrir('c');
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
