// Bots del nivel 'u' («un toque, un tramo», docs/JUEGO.md G2.9): juegan intentos sueltos sobre el núcleo, pasando por la
// capa (web/js/game/controles.js), y miran SOLO la señal de senal(). Sin navegador y por eventos (saltan de un cambio
// del núcleo al siguiente, sin pasos fijos), así que miles de intentos tardan segundos.
//   reactivo   toca 250 ± 80 ms (más el atraso del aparato) después de que aparece cada señal con toque; a veces mira tarde
//              (+400 ms), a veces toca dos veces y a veces no toca una señal libre (¡TIRA!, ¡ARRIBA!: el juego la hace sola)
//   tardio     el reactivo, 600 ms más tarde (sin el «a veces mira tarde»: ya es el que mira tarde)
//   fantasma   el reactivo, más contactos sueltos al azar que duran de 30 a 300 ms (bolsillo, pulgar que roza, gato)
//   mantiene   apoya la tecla o el dedo al confirmar y no la suelta nunca
//   machacador no mira: 8 toques por segundo desde que confirma hasta el final
//   ausente    no toca nunca
// `dedo`: atraso de 60 ms y dos dedos a menos de 80 ms son uno (ctx.tactil); con teclado, 30 ms.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { Intento, simular } from '../web/js/sim/attempt.js';
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { cuerpoDe } from '../web/js/sim/rules.js';
import { traducir, senal } from '../web/js/game/controles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/sim.json'), 'utf8')));
export const ATL = ['ventura', 'brenner', 'marangi'];
const INF = 2147483647;
/** Señales que piden un toque. */
export const CON_TOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

/** Contexto de un intento en 'u' para el pesista `id` (sin Partida: intensidad dada, reloj de 30 s, garra disponible). */
export function ctxUno(id, lev, env, I, sem, extra = {}) {
  const f = datos.atletas[id], r = new Azar(mezclar(sem, 23));
  return { lev, env: lev === 'c' ? env : undefined, I, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: sem, cal: 0, primera: false, domina: lev === 's' || f.enviones.includes(env),
    jueces: [r.entre(900, 1100), r.entre(900, 1100), r.entre(900, 1100)], reloj: 30000, ctl: 'u', cuerpo: cuerpoDe(f), garraUno: true, ...extra };
}

export const BOTS_U = {
  reactivo: { reac: 250, sd: 80 },
  tardio: { reac: 850, sd: 80, sinDistraccion: true },
  fantasma: { reac: 250, sd: 80, fantasma: 700 },
  mantiene: { mantiene: true },
  machacador: { machaca: 125 },
  ausente: { ausente: true },
};

/**
 * Juega un intento con el bot `B` y devuelve {m, conf, ent, contactos}. `B.lag`: atraso del aparato (ms). La lista
 * `ent` es la que quedaría en el registro; el intento se recalcula con simular() al final y tiene que dar lo mismo.
 */
export function jugarUno(ctx, B, sem, o = {}) {
  const r = new Azar(mezclar(sem, 41)), conf = o.conf ?? 0, m = new Intento(ctx), ent = [], lag = B.lag ?? (ctx.tactil ? 60 : 30);
  m.confirmar(conf);
  // eventos pendientes de la persona: [t, v]; se procesan en orden
  const cola = [];
  const agenda = (t, v) => { cola.push([t, v]); cola.sort((a, b) => a[0] - b[0] || b[1] - a[1]); };
  const toque = (t, dur) => { agenda(t, 1); if (dur < INF) agenda(t + dur, 0); };
  if (B.mantiene) toque(conf + 400, INF);
  let machaca = B.machaca ? conf + 200 : INF;
  let fantasma = B.fantasma ? conf + 300 + r.ent(B.fantasma) : INF;
  let clave = null, plan = INF, contactos = 0;
  for (let g = 0; !m.res && g < 100000; g++) {
    const s = senal(m, m.t, 'u'), k = s ? `${s.clave}:${s.desde ?? s.vence ?? ''}` : '';
    if (k !== clave) {
      clave = k; plan = INF;
      if (s && CON_TOQUE.has(s.tipo) && !B.ausente && !B.mantiene && !B.machaca) {
        let d = Math.max(120, B.reac + r.campana(B.sd)) + lag;
        if (r.ent(10) === 0 && !B.sinDistraccion) d += 400;              // a veces mira tarde
        if (s.tipo === 'libre' && r.ent(15) === 0) d = INF;             // a veces no toca una señal libre: sale sola
        plan = m.t + d;
      }
    }
    const tc = cola.length ? cola[0][0] : INF, prox = Math.min(m.proximo(), plan, tc, fantasma, machaca);
    if (prox >= INF) break;
    m.avanzar(prox); if (m.res) break;
    const meter = (t, v) => { const x = traducir(m, t, v, 'u'); for (const e of x.ent) { ent.push(e); m.entrada(e[0], e[1]); } if (v && x.ent.length) contactos++; };
    if (tc === prox) { const [t, v] = cola.shift(); meter(t, v); continue; }
    if (plan === prox) { plan = INF; toque(prox, 60 + r.ent(80)); if (!B.ausente && r.ent(12) === 0) toque(prox + 140 + r.ent(200), 60); continue; }
    if (machaca === prox) { toque(prox, 40); machaca = prox + B.machaca; continue; }
    if (fantasma === prox) { toque(prox, 30 + r.ent(271)); fantasma = prox + 300 + r.ent(2 * B.fantasma); continue; }
  }
  if (!m.res) throw new Error('el intento no terminó');
  return { m, conf, ent, contactos };
}

/** Lo que tiene que dar igual entre bots con la misma semilla (meta A). */
export const firma = res => `${res.res}|${res.causa}|${res.uno.margen_fin}|${res.uno.garra}|${res.uno.tramo_caida}`;
/** Recalcula y verifica que el registro esté bien formado. */
export function verificar(ctx, S) {
  const re = simular(ctx, S.conf, S.ent);
  if (JSON.stringify(re.res) !== JSON.stringify(S.m.res)) throw new Error('el recálculo no coincide');
  let t0 = 0, n = 0; for (const e of S.ent) { if (e[0] < t0 || !Number.isInteger(e[0])) throw new Error('entradas fuera de orden'); t0 = e[0]; n += e[1] ? 1 : -1; if (n < 0) throw new Error('se levanta un contacto que no estaba apoyado'); }
  return re;
}
