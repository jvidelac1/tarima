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
// Dificultad (rules.js → NIVELES_B): en 'b' mide los tres niveles, cada uno con su apertura sugerida y sus metas: final mediana
// ≤ 150 / 165 / 180 s (Fácil / Medio / Difícil), intento propio p90 ≤ 10 · 15, ≤ 12 · 16 y ≤ 14 · 18 s, barras caídas con el
// panel ≤ 15 / 18 / 25 %, espera máxima ≤ 20 / 21 / 21 s.
// Turnos de los rivales (23-nov, pedido del dueño: «que no se pueda saltear a los pesistas, pero que no sea aburrida la
// dinámica de esperar los tiros, rápido»): no hay botón «Saltar»; todo turno de rival se ve (RITMO.rival) desde poco antes
// de su primera explosión, con su fundido (RITMO.fundido). Meta: turno de rival mediana ≤ 5,5 s y máximo ≤ 7 s (antes, 8,3 s de mediana).
// Orden de los turnos (LIF-3, match.js → TURNOS): por defecto 'rondas', como el juego; --orden=oficial o --orden=viejo (sin
// turnos: los registros de antes) para comparar. Informa además cuántos turnos de rivales seguidos ve el jugador entre dos
// levantamientos propios (máximo y p90).
// Uso: node tools/ritmo_test.mjs [--semillas=60] [--panel=2.5] [--ctl=b|u] [--dif=facil,medio,dificil] [--orden=rondas|oficial|viejo]
import { Partida } from '../web/js/sim/match.js';
import { HUELLA_IA } from '../web/js/sim/ai.js';      // los rivales del juego (con personalidad)
import { Intento, simular } from '../web/js/sim/attempt.js';
import { mezclar } from '../web/js/sim/fixed.js';
import { RITMO, FASES_RAPIDAS, esDecisivo, veredictoPropio, desdeRival } from '../web/js/game/ritmo.js';
import { armarCaida } from '../web/js/game/caida.js';
import { jugarUno, datos, ATL, BOTS_U } from './uno_bots.mjs';
import { cuerpoDe, reglasB, DIFICULTADES } from '../web/js/sim/rules.js';
import { sugerencia } from '../web/js/sim/entrenador.js';
import { jugarBarra, PERFILES } from './barra_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SEM = +(arg('semillas') || 60), PANEL = +(arg('panel') || 2.5), CTL = arg('ctl') || 'b';
const JUGADORES = CTL === 'u' ? { novato: { ...BOTS_U.reactivo, lag: 60 }, ausente: BOTS_U.ausente } : { novato: PERFILES.novato, lento: { ...PERFILES.novato, reac: 9000 } };
const jugar = (ctx, B, sem) => (CTL === 'b' ? jugarBarra(ctx, B, sem) : jugarUno(ctx, B, sem));
const ORDEN = arg('orden') || 'rondas', TURNOS_CFG = ORDEN === 'viejo' ? {} : { turnos: ORDEN };
const ESPECTADORES = ['mira'];
const FUNDIDO = (RITMO.fundido.fuera + RITMO.fundido.dentro) / 1000, MAX_RIVAL = 7, MED_RIVAL = 5.5;
const INFORMATIVO = (q, esp) => q === 'lento' || esp === 'mira';
const q = (xs, p) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0; };

/** Lo que dura (s) la vista entera de un rival: desde poco antes de que agarre la barra, las fases de espera más rápido (main.js). */
function vistaEntera(ctx, conf, ent, res) {
  const m0 = simular(ctx, conf, ent), tv0 = desdeRival(m0, conf);
  const m = new Intento(ctx); m.confirmar(conf); let i = 0, s = 0;
  for (let t = tv0; t < res.t; t += 20) { while (i < ent.length && ent[i][0] <= t) { m.entrada(ent[i][0], ent[i][1]); i++; } m.avanzar(t); s += 20 / (FASES_RAPIDAS.has(m.fase) ? RITMO.rival.rapido : 1); }
  return s / 1000;
}
/** La escena del final (caida.js) con una altura de barra típica para el tipo de final: su duración (s). */
function durFinal(res, mov) {
  const y = res.res === 'valido' ? 2.05 : res.causa === 'sin_altura' ? (mov === 'j' ? 1.45 : .9) : mov === 'c' ? .86 : 1.3;
  const c = armarCaida(res, mov, { y, z: 0 }, .225); return c ? c.dur : 0;
}

/**
 * Barras caídas con lo que trae el panel, en una muestra más grande (`--semillas-caidas`, 250 por defecto): con 60 semillas
 * la cifra se mueve ±2 puntos según en qué orden salen los llamados (la semilla de cada intento depende de su número de
 * llamado), y en Medio está a 1 punto de la meta. Solo juega los intentos (sin tiempos de pantalla). Una vez por nivel y jugador.
 */
const SEM_C = +(arg('semillas-caidas') || 250), CAIDAS = {};
function caidasPanel(dif, B, D, R) {
  const k0 = dif + JSON.stringify(B); if (CAIDAS[k0] !== undefined) return CAIDAS[k0];
  let n = 0, x = 0;
  for (const nivel of ['amistoso', 'normal']) for (const id of ATL) for (let k = 0; k < SEM_C; k++) {
    const yo = ATL.indexOf(id), semilla = mezclar(k, 4242, yo, nivel === 'normal' ? 1 : 0), f = datos.atletas[id];
    const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: CTL, tactil: true, ia: HUELLA_IA, envFijo: true, ...TURNOS_CFG, ...D, atletas: ATL.map((y, i) => ({ id: y, ctrl: i === yo ? 'persona' : 'juego' })) });
    for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(f.techo[lev] * (CTL === 'b' ? R.apertura / 1000 : .9))))); }
    p.empezar();
    for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
      if (p.fase === 'intervalo') { p.empezar(); continue; }
      const L = p.llamado; if (p.at[L.a].ctrl !== 'persona') { p.resolverIA(); continue; }
      const kg = p.at[yo].cambios === 0 ? sugerencia(p, yo, L.lev) : null;
      if (kg !== null && kg !== L.kg && !p.cambioValido(0, kg) && p.cambio(0, kg).desplazado) continue;
      const env = L.lev === 'c' ? cuerpoDe(id).casa : undefined, ctx = p.contexto(env), S = jugar(ctx, B, mezclar(semilla, g));
      p.resolver({ conf: S.conf, env, ent: S.ent }); n++; if (S.m.res.res !== 'valido') x++;
    }
  }
  return (CAIDAS[k0] = x * 100 / n);
}

const mal = [], DIFS = CTL === 'b' ? (arg('dif') ? arg('dif').split(',') : DIFICULTADES) : ['facil'];
// espera máxima: en Medio y Difícil el panel propone menos kilos y hay más turnos de rivales seguidos (21 s en lugar de 20)
const META = { facil: { final: 150, s: 10, c: 15, caidas: 15, espera: 20 }, medio: { final: 165, s: 12, c: 16, caidas: 18, espera: 21 }, dificil: { final: 180, s: 14, c: 18, caidas: 25, espera: 21 } };
for (const dif of DIFS) for (const esp of ESPECTADORES) for (const [quien, NOVATO] of Object.entries(JUGADORES)) {
const R = reglasB(dif), MT = META[dif], D = CTL === 'b' && dif !== 'facil' ? { dif } : {};
const rachas = [], peores = [], filas = [], decisivos = [], esperas = [], finales = [], rivalesNo = [], verOk = [], verMal = [], intS = [], intC = [], caidasPlan = { n: 0, caidas: 0 };
for (const nivel of ['amistoso', 'normal']) for (const id of ATL) for (let k = 0; k < SEM; k++) {
  const yo = ATL.indexOf(id), semilla = mezclar(k, 4242, yo, nivel === 'normal' ? 1 : 0);
  const p = new Partida(datos, { semilla, nivel, cal: 0, primera: false, ctl: CTL, tactil: true, ia: HUELLA_IA, envFijo: true, ...TURNOS_CFG, ...D, atletas: ATL.map((x, i) => ({ id: x, ctrl: i === yo ? 'persona' : 'juego' })) });
  const f = datos.atletas[id];
  for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(f.techo[lev] * (CTL === 'b' ? R.apertura / 1000 : .9))))); }
  p.empezar();
  let reloj = 0, espera = null, seguidos = 0, enteros = 0, ultimo = null, hay = false; const mias = [];
  const cierraEspera = () => { if (espera !== null) { esperas.push(reloj - espera); if (reloj - espera > 20) peores.push(`${(reloj - espera).toFixed(1)} s: ${traza.join(' + ')}`); espera = null; } traza = []; };
  let traza = [];
  for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
    if (p.fase === 'intervalo') { cierraEspera(); reloj += PANEL; p.empezar(); hay = false; seguidos = 0; continue; }      // panel del intervalo (apertura del dos tiempos)
    const L = { ...p.llamado }, a = p.at[L.a];
    if (a.ctrl === 'persona') {
      if (ultimo !== null && ultimo !== yo) reloj += FUNDIDO;      // del rival al jugador, fundido corto
      ultimo = yo;
      if (hay) rachas.push(seguidos); hay = true; cierraEspera(); seguidos = 0; enteros = 0; reloj += PANEL;
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
    const decisivo = esDecisivo(L.et), modo = 'entero'; enteros++;
    const ok = x.res.res === 'valido', mov = x.res.gestos?.at(-1)?.mov || L.lev, tLuz = RITMO.rival.luz, paso = (L.et || []).some(e => e === 'oro' || e === 'medalla' || e === 'todo_o_nada') ? RITMO.rival.pasoLento : RITMO.rival.paso, tVer = tLuz + 2 * paso + .25;
    const vista = vistaEntera(x.ctx, x.conf, x.ent, x.res);
    // fundido de entrada, la vista y el veredicto (main.js → decision con o.max = RITMO.rival.veredicto); sin repetición
    const t = FUNDIDO + vista + Math.min(Math.max(RITMO.rival.veredicto, tVer + RITMO.rival.lee), Math.max(tVer + 1.3, durFinal(x.res, mov)));
    (decisivo ? decisivos : rivalesNo).push(t); ultimo = L.a;
    reloj += t; traza.push(`${modo} ${t.toFixed(1)}`);
  }
  cierraEspera();
  finales.push(reloj); filas.push({ nivel, id, k, reloj, mias: mias.join(' ') });
}

const s = x => x.toFixed(1);
const mFinal = q(finales, .5), eMax = Math.max(...esperas), e90 = q(esperas, .9), e50 = q(esperas, .5), rMax = Math.max(...rivalesNo), vOk = Math.max(...verOk), vMal = Math.max(...verMal), pS = q(intS, .9), pC = q(intC, .9), caidas = caidasPlan.caidas * 100 / caidasPlan.n;
console.log(`\n[mira cada rival, sin saltar] ${quien === 'novato' ? (CTL === 'b' ? 'Novato (±120 ms, primera o segunda pasada)' : 'Novato (toca, a veces no)') : quien === 'lento' ? 'Lento (espera a que el puntero vaya despacio: informativo)' : 'Ausente (no toca nunca)'} · ritmo de la final en '${CTL}'${CTL === 'b' ? ` (${dif})` : ''} · ${finales.length} finales (${SEM} semillas × 3 pesistas × rivales amistosos y normales) · panel ${PANEL} s por decisión`);
console.log(`orden ${ORDEN} · turnos de rivales seguidos entre dos levantamientos propios: mediana ${q(rachas, .5)}, p90 ${q(rachas, .9)}, máximo ${Math.max(...rachas)}`);
console.log(`final completa: mediana ${s(mFinal)} s, p90 ${s(q(finales, .9))} s, máxima ${s(Math.max(...finales))} s   meta mediana ≤ ${MT.final} s`);
console.log(`espera sin tocar entre un levantamiento propio y el siguiente panel: mediana ${s(e50)} s, p90 ${s(e90)} s, máxima ${s(eMax)} s   meta ≤ 10 · ≤ 15 · ≤ ${MT.espera} s`);
console.log(`turno de rival (con su fundido): mediana ${s(q(rivalesNo.concat(decisivos), .5))} s, p90 ${s(q(rivalesNo.concat(decisivos), .9))} s, máximo ${s(Math.max(rMax, ...decisivos))} s · decisivos: mediana ${s(q(decisivos, .5))} s, máximo ${s(Math.max(0, ...decisivos))} s · ${decisivos.length} de ${decisivos.length + rivalesNo.length} turnos   meta mediana ≤ ${MED_RIVAL} · máximo ≤ ${MAX_RIVAL} s`);
console.log(`veredicto propio después de las luces: válido ${s(vOk)} s, caída ${verMal.length ? s(vMal) : '—'} s   meta válido ≤ 3 s en total, caída tVer + 2,4 s`);
console.log(`intento propio: arranque p90 ${s(pS)} s · dos tiempos p90 ${s(pC)} s   meta ${quien === 'ausente' ? '≤ 9 · ≤ 14' : CTL === 'b' ? `≤ ${MT.s} · ≤ ${MT.c}` : '≤ 7 · ≤ 12'} s`);
const caidasG = caidasPanel(dif, NOVATO, D, R);
console.log(`con lo que trae el panel: ${s(caidasG)} % de barras caídas en ${SEM_C} semillas (${s(caidas)} % en estas ${SEM}: informativo)   meta ≤ ${MT.caidas} %`);
if (peores.length) console.log(`esperas de más de 20 s (${peores.length}): ${peores.slice(0, 4).join(' · ')}`);
if (mFinal > MT.final && !INFORMATIVO(quien, esp)) mal.push(`${dif} ${quien}: final: mediana ${s(mFinal)} s (meta ≤ ${MT.final})`);
if ((eMax > MT.espera || e90 > 15 || e50 > 10) && !INFORMATIVO(quien, esp)) mal.push(`${dif} ${quien}: espera: mediana ${s(e50)}, p90 ${s(e90)}, máxima ${s(eMax)} s (meta ≤ 10 · ≤ 15 · ≤ ${MT.espera})`);
if (Math.max(rMax, ...decisivos) > MAX_RIVAL || q(rivalesNo.concat(decisivos), .5) > MED_RIVAL) mal.push(`${quien}: turno de rival: mediana ${s(q(rivalesNo.concat(decisivos), .5))} s, máximo ${s(Math.max(rMax, ...decisivos))} s (meta ≤ ${MED_RIVAL} · ≤ ${MAX_RIVAL})`);
if (veredictoPropio(true).total > 3) mal.push(`el veredicto propio válido dura ${s(veredictoPropio(true).total)} s (meta ≤ 3)`);
// en 'b' el jugador elige cuándo tira (la barrita reemplaza a ¡TIRA! y ¡ARRIBA!, que salían solas a los 2 s): ≤ 10 · ≤ 15 s
const [mS, mC] = quien === 'ausente' ? [9, 14] : CTL === 'b' ? [MT.s, MT.c] : [7, 12];      // 'b': + el esfuerzo de pararse en los exigentes      // quien no toca espera a que cada paso salga solo: un poco más largo, nunca trabado
if ((pS > mS || pC > mC) && !INFORMATIVO(quien, esp)) mal.push(`${quien}: intento propio p90: arranque ${s(pS)} s, dos tiempos ${s(pC)} s (meta ≤ ${mS} · ≤ ${mC})`);
if (caidasG > MT.caidas && !INFORMATIVO(quien, esp)) mal.push(`${dif} ${quien}: con lo que trae el panel se caen el ${s(caidasG)} % de las barras en ${SEM_C} semillas (meta ≤ ${MT.caidas} %)`);
if (verMal.length && Math.max(...verMal) > RITMO.propioFallo + .01) mal.push(`${quien}: el veredicto de una caída propia dura ${s(Math.max(...verMal))} s después de las luces (meta tVer + 2,4)`);
}
console.log(mal.length ? `\nFALLÓ:\n  ${mal.join('\n  ')}` : '\nOK: el ritmo de la final cumple el presupuesto de G2.7');
process.exit(mal.length ? 1 : 0);
