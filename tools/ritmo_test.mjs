// Ritmo de la final sin navegador (docs/JUEGO.md G2.7 y meta J de G2.9). Juega finales enteras en 'u' (el jugador es el
// novato reactivo de tools/uno_bots.mjs, que a veces no toca ¡TIRA! ni ¡ARRIBA!, y el ausente, que no toca nunca; con la
// apertura sugerida del 90 % y el peso que el panel trae puesto, web/js/game/entrenador.js) y suma, en segundos de
// reloj de juego, lo que dura cada pantalla con los mismos tiempos que usa main.js (web/js/game/ritmo.js):
//   intento propio  de la confirmación al final del núcleo (más 80 ms del cierre)
//   veredicto propio veredictoPropio(): ≤ 3 s si vale, tVer + 2,4 s si cae
//   turno de rival  resumen (de 1 s antes de su última explosión a poco después de la recepción, y su veredicto de 1,1 s),
//                   fila de 1,2 s (del tercero seguido en adelante), o entero si decide algo (desde poco antes de agarrar la
//                   barra, las fases lentas a 2,5×, veredicto con la caída de caida.js y repetición si cae o pasa adelante)
//   paneles         `--panel` s por decisión (por defecto 2,5: el novato confirma con Espacio el peso que ya viene puesto)
// Criterio (60 semillas × 3 pesistas × rivales amistosos y normales): final ≤ 150 s (mediana); espera sin tocar entre un
// levantamiento propio y el siguiente panel ≤ 20 s (máxima), p90 ≤ 15 s y mediana ≤ 10 s; turno de rival no decisivo
// ≤ 3 s; veredicto propio ≤ 3 s si vale y ≤ tVer + 2,4 s si cae; intento propio p90 ≤ 7 s en arranque y ≤ 12 s en dos
// tiempos (el ausente, ≤ 9 y ≤ 14 s: espera que cada paso salga solo); con lo que trae el panel, 15 % o menos de barras caídas (meta M). Todo eso con los DOS jugadores: el que no toca
// tampoco espera de más (Gameplay 2.1: ¡TIRA! sale sola a los 3 s y ¡ARRIBA! a los 2,5 s).
// Desde Gameplay 3 mide por defecto la barrita ('b'): el novato de tools/barra_bots.mjs (toca en la primera o segunda
// pasada, ±120 ms) y el lento, que espera a que el puntero vaya despacio (8 a 10 s por barrita: para él solo cuentan las
// esperas y lo demás es informativo). --ctl=u mide 'u' como antes.
// Uso: node tools/ritmo_test.mjs [--semillas=60] [--panel=2.5] [--ctl=b|u]
import { Partida } from '../web/js/sim/match.js';
import { HUELLA_IA } from '../web/js/sim/ai.js';      // los rivales del juego (con personalidad)
import { Intento, simular } from '../web/js/sim/attempt.js';
import { mezclar } from '../web/js/sim/fixed.js';
import { RITMO, FASES_RAPIDAS, esDecisivo, modoRival, tramoResumen, veredictoPropio, desdeDecisivo } from '../web/js/game/ritmo.js';
import { armarCaida } from '../web/js/game/caida.js';
import { jugarUno, datos, ATL, BOTS_U } from './uno_bots.mjs';
import { cuerpoDe } from '../web/js/sim/rules.js';
import { sugerencia } from '../web/js/sim/entrenador.js';
import { jugarBarra, PERFILES } from './barra_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SEM = +(arg('semillas') || 60), PANEL = +(arg('panel') || 2.5), CTL = arg('ctl') || 'b';
const JUGADORES = CTL === 'u' ? { novato: { ...BOTS_U.reactivo, lag: 60 }, ausente: BOTS_U.ausente } : { novato: PERFILES.novato, lento: { ...PERFILES.novato, reac: 9000 } };
const jugar = (ctx, B, sem) => (CTL === 'b' ? jugarBarra(ctx, B, sem) : jugarUno(ctx, B, sem));
const INFORMATIVO = q => q === 'lento';
const q = (xs, p) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0; };

/** Lo que dura (s) la vista entera de un rival decisivo: desde 1 s antes de su primera explosión, las fases lentas más rápido. */
function vistaEntera(ctx, conf, ent, res) {
  const m0 = simular(ctx, conf, ent), tv0 = desdeDecisivo(m0, conf);
  const m = new Intento(ctx); m.confirmar(conf); let i = 0, s = 0;
  for (let t = tv0; t < res.t; t += 20) { while (i < ent.length && ent[i][0] <= t) { m.entrada(ent[i][0], ent[i][1]); i++; } m.avanzar(t); s += 20 / (FASES_RAPIDAS.has(m.fase) ? RITMO.decisivo.rapido : 1); }
  return s / 1000;
}
/** La escena del final (caida.js) con una altura de barra típica para el tipo de final: su duración (s). */
function durFinal(res, mov) {
  const y = res.res === 'valido' ? 2.05 : res.causa === 'sin_altura' ? (mov === 'j' ? 1.45 : .9) : mov === 'c' ? .86 : 1.3;
  const c = armarCaida(res, mov, { y, z: 0 }, .225); return c ? c.dur : 0;
}

const mal = [];
for (const [quien, NOVATO] of Object.entries(JUGADORES)) {
const peores = [], filas = [], decisivos = [], esperas = [], finales = [], rivalesNo = [], verOk = [], verMal = [], intS = [], intC = [], caidasPlan = { n: 0, caidas: 0 };
for (const nivel of ['amistoso', 'normal']) for (const id of ATL) for (let k = 0; k < SEM; k++) {
  const yo = ATL.indexOf(id), semilla = mezclar(k, 4242, yo, nivel === 'normal' ? 1 : 0);
  const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: CTL, tactil: true, ia: HUELLA_IA, atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
  const f = datos.atletas[id];
  for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(f.techo[lev] * .9)))); }
  p.empezar();
  let reloj = 0, espera = null, seguidos = 0, enteros = 0; const mias = [];
  const cierraEspera = () => { if (espera !== null) { esperas.push(reloj - espera); if (reloj - espera > 20) peores.push(`${(reloj - espera).toFixed(1)} s: ${traza.join(' + ')}`); espera = null; } traza = []; };
  let traza = [];
  for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
    if (p.fase === 'intervalo') { cierraEspera(); reloj += PANEL; p.empezar(); continue; }      // panel del intervalo (apertura del dos tiempos)
    const L = { ...p.llamado }, a = p.at[L.a];
    if (a.ctrl === 'persona') {
      cierraEspera(); seguidos = 0; enteros = 0; reloj += PANEL;
      const kg = p.at[yo].cambios === 0 ? sugerencia(p, yo, L.lev) : null;
      if (kg !== null && kg !== L.kg && !p.cambioValido(0, kg) && p.cambio(0, kg).desplazado) { reloj += 1.8; continue; }      // desplazado: su cartel y sigue otro
      const env = L.lev === 'c' ? cuerpoDe(id).casa : undefined, ctx = p.contexto(env), S = jugar(ctx, NOVATO, mezclar(semilla, g)), res = S.m.res;
      p.resolver({ conf: S.conf, env, ent: S.ent });
      const dur = (res.t + 80) / 1000; (L.lev === 's' ? intS : intC).push(dur); reloj += dur;
      const v = veredictoPropio(res.res === 'valido', true); (res.res === 'valido' ? verOk : verMal).push(v.total - v.tVer);
      espera = reloj; reloj += v.total; mias.push(res.res); traza = [`propio ${v.total.toFixed(1)}`];
      caidasPlan.n++; if (res.res !== 'valido') caidasPlan.caidas++;
      continue;
    }
    // rival
    const antes = p.tabla()[0], lider0 = antes && antes.puesto === 1 ? antes.a : null, x = p.resolverIA(), d = p.tabla()[0], lider1 = d && d.puesto === 1 ? d.a : null;
    void lider0; void lider1; seguidos++;
    const modo = modoRival({ et: L.et, seguidos, enteros }), decisivo = esDecisivo(L.et); if (modo === 'entero') enteros++;
    let t = 0;
    if (modo === 'fila') t = RITMO.fila / 1000;
    else if (modo === 'resumen') { const m = simular(x.ctx, x.conf, x.ent), c = tramoResumen(m); t = (c.a - c.de) / 1000 + RITMO.resumen.total; rivalesNo.push(t); }
    else {
      const ok = x.res.res === 'valido', mov = x.res.gestos?.at(-1)?.mov || L.lev, tLuz = !ok ? .45 : .2, paso = (L.et || []).some(e => e === 'oro' || e === 'medalla' || e === 'todo_o_nada') ? .55 : .3, tVer = tLuz + 2 * paso + .25;
      t = vistaEntera(x.ctx, x.conf, x.ent, x.res) + Math.min(RITMO.decisivo.veredicto, Math.max(tVer + 1.3, durFinal(x.res, mov))) + (!ok ? RITMO.decisivo.rep / 1000 : 0); decisivos.push(t);
    }
    if (modo === 'fila') rivalesNo.push(t);
    reloj += t; traza.push(`${modo} ${t.toFixed(1)}`);
  }
  cierraEspera();
  finales.push(reloj); filas.push({ nivel, id, k, reloj, mias: mias.join(' ') });
}

const s = x => x.toFixed(1);
const mFinal = q(finales, .5), eMax = Math.max(...esperas), e90 = q(esperas, .9), e50 = q(esperas, .5), rMax = Math.max(...rivalesNo), vOk = Math.max(...verOk), vMal = Math.max(...verMal), pS = q(intS, .9), pC = q(intC, .9), caidas = caidasPlan.caidas * 100 / caidasPlan.n;
console.log(`\n${quien === 'novato' ? (CTL === 'b' ? 'Novato (±120 ms, primera o segunda pasada)' : 'Novato (toca, a veces no)') : quien === 'lento' ? 'Lento (espera a que el puntero vaya despacio: informativo)' : 'Ausente (no toca nunca)'} · ritmo de la final en '${CTL}' · ${finales.length} finales (${SEM} semillas × 3 pesistas × rivales amistosos y normales) · panel ${PANEL} s por decisión`);
console.log(`final completa: mediana ${s(mFinal)} s, p90 ${s(q(finales, .9))} s, máxima ${s(Math.max(...finales))} s   meta mediana ≤ 150 s`);
console.log(`espera sin tocar entre un levantamiento propio y el siguiente panel: mediana ${s(e50)} s, p90 ${s(e90)} s, máxima ${s(eMax)} s   meta ≤ 10 · ≤ 15 · ≤ 20 s`);
console.log(`turno de rival no decisivo: máximo ${s(rMax)} s (mediana ${s(q(rivalesNo, .5))} s)   meta ≤ 3 s`);
console.log(`turno de rival decisivo (entero): mediana ${s(q(decisivos, .5))} s, máximo ${s(Math.max(0, ...decisivos))} s · ${decisivos.length} de ${decisivos.length + rivalesNo.length} turnos   meta ≤ 9 s`);
console.log(`veredicto propio después de las luces: válido ${s(vOk)} s, caída ${verMal.length ? s(vMal) : '—'} s   meta válido ≤ 3 s en total, caída tVer + 2,4 s`);
console.log(`intento propio: arranque p90 ${s(pS)} s · dos tiempos p90 ${s(pC)} s   meta ${quien === 'ausente' ? '≤ 9 · ≤ 14' : CTL === 'b' ? '≤ 10 · ≤ 15' : '≤ 7 · ≤ 12'} s`);
console.log(`con lo que trae el panel: ${s(caidas)} % de barras caídas   meta ≤ 15 %`);
if (peores.length) console.log(`esperas de más de 20 s (${peores.length}): ${peores.slice(0, 4).join(' · ')}`);
if (mFinal > 150 && !INFORMATIVO(quien)) mal.push(`${quien}: final: mediana ${s(mFinal)} s (meta ≤ 150)`);
if ((eMax > 20 || e90 > 15 || e50 > 10) && !INFORMATIVO(quien)) mal.push(`${quien}: espera: mediana ${s(e50)}, p90 ${s(e90)}, máxima ${s(eMax)} s (meta ≤ 10 · ≤ 15 · ≤ 20)`);
if (Math.max(0, ...decisivos) > 9) mal.push(`${quien}: un turno de rival decisivo dura ${s(Math.max(...decisivos))} s (meta ≤ 9)`);
if (rMax > 3.05) mal.push(`${quien}: un turno de rival no decisivo dura ${s(rMax)} s (meta ≤ 3)`);
if (veredictoPropio(true).total > 3) mal.push(`el veredicto propio válido dura ${s(veredictoPropio(true).total)} s (meta ≤ 3)`);
// en 'b' el jugador elige cuándo tira (la barrita reemplaza a ¡TIRA! y ¡ARRIBA!, que salían solas a los 2 s): ≤ 10 · ≤ 15 s
const [mS, mC] = quien === 'ausente' ? [9, 14] : CTL === 'b' ? [10, 15] : [7, 12];      // 'b': + el esfuerzo de pararse en los exigentes      // quien no toca espera a que cada paso salga solo: un poco más largo, nunca trabado
if ((pS > mS || pC > mC) && !INFORMATIVO(quien)) mal.push(`${quien}: intento propio p90: arranque ${s(pS)} s, dos tiempos ${s(pC)} s (meta ≤ ${mS} · ≤ ${mC})`);
if (caidas > 15 && !INFORMATIVO(quien)) mal.push(`${quien}: con lo que trae el panel se caen el ${s(caidas)} % de las barras (meta ≤ 15 %)`);
if (verMal.length && Math.max(...verMal) > RITMO.propioFallo + .01) mal.push(`${quien}: el veredicto de una caída propia dura ${s(Math.max(...verMal))} s después de las luces (meta tVer + 2,4)`);
}
console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: el ritmo de la final cumple el presupuesto de G2.7');
process.exit(mal.length ? 1 : 0);
