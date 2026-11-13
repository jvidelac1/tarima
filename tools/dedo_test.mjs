// Toques con el dedo (pedido del dueño del 12-nov: «es medio complicada la dinámica de pegarle perfecto al tap»). Sin
// navegador. Un bot que mira el círculo en pantalla (`visto`) toca con el atraso del dedo y de la pantalla (60 ms) y un
// desvío de campana; se mide qué parte de sus toques sale PERFECTO o BIEN y cuántos levantamientos valen, antes (corrección
// de 40 ms que corría también el círculo, sin ventanas del dedo) y ahora (corrección de 60 ms y FACIL.tactil).
// Uso: node tools/dedo_test.mjs --f [--n=600]   Sale con error si «ahora» no mejora a «antes» o si las aperturas bajan de 95 %.
//
// Sin --f prueba el dedo en 'u' (por defecto desde Gameplay 2, docs/JUEGO.md G2.3 y meta H): 10 000 secuencias al azar de
// dedos sobre intentos enteros, por la clase Boton de verdad en un DOM de mentira (tools/entrada_sim.mjs): dos dedos a
// menos de 80 ms, pointercancel con y sin dedo que vuelve (400 ms de gracia), doble toque a 100 ms, mantener 10 s,
// machacar y toques en los bordes de la pantalla. Criterio: 0 toques sin resolver, 0 contados dos veces, el 100 % con
// acción o palabra, los toques en los bordes también se anotan y se resuelven (Gameplay 2.1: ninguno se pierde sin acuse) y
// la ráfaga de la confirmación nunca arranca el tirón.
// Uso: node tools/dedo_test.mjs [--n=10000]
if (!process.argv.includes('--f')) {
  const { probarEntrada } = await import('./entrada_sim.mjs');
  const a = k => (process.argv.find(x => x.startsWith(`--${k}=`)) || '').split('=')[1];
  // desde Gameplay 3, la barrita ('b', por defecto) y 'u'; en 'b', además, cada barrita la dispara un solo contacto
  const t0 = Date.now(), R = { ejemplos: [] }; let mal = 0;
  // y en 'b', los tres niveles de dificultad (Medio y Difícil tienen barritas de más: atrapar y pararse)
  for (const [ctl, dif] of [['b', 'facil'], ['b', 'medio'], ['b', 'dificil'], ['u', 'facil']]) {
    const X = await probarEntrada({ via: 'dedo', n: +(a('n') || 10000), ctl, dif });
    console.log(`dedo '${ctl}'${ctl === 'b' ? ` ${dif}` : ''}: ${X.secuencias} secuencias, ${X.pulsaciones} toques (con los del borde) · casos: ${JSON.stringify(X.casos)}`);
    console.log(`sin resolver ${X.sinResolver} · contados dos veces ${X.dobles} · sin acción ni palabra ${X.sinPalabra} · bordes sin anotar ${X.bordesQueCuentan} · ráfaga de la confirmación que arrancó el tirón ${X.rafagaTira} · registros mal formados ${X.malFormadas} · intentos sin terminar ${X.sinTerminar}${ctl === 'b' ? ` · barritas disparadas ${X.barritas}, con más de un contacto ${X.barritaDoble}` : ''}`);
    mal += X.sinResolver + X.dobles + X.sinPalabra + X.bordesQueCuentan + X.rafagaTira + X.malFormadas + X.sinTerminar + X.barritaDoble; R.ejemplos.push(...X.ejemplos.map(x => `${ctl} ${dif}: ${x}`));
  }
  // Clásico: un dedo cancelado por el sistema se suelta en el acto (soltar es un gesto); la gracia de 400 ms es solo de 'u'
  const { probarCancelClasico } = await import('./entrada_sim.mjs'), C = await probarCancelClasico();
  console.log(`pointercancel: en Clásico el soltar llega a los ${C.clasico} ms · en 'u' a los ${C.uno} ms (gracia)`);
  if (C.clasico !== 0) { mal++; R.ejemplos.push(`en Clásico un pointercancel tiene que soltar en el acto y soltó a los ${C.clasico} ms`); }
  if (!(C.uno >= 400)) { mal++; R.ejemplos.push(`en 'u' un pointercancel tiene que esperar la gracia y soltó a los ${C.uno} ms`); }
  if (mal) { console.log('FALLÓ:\n  ' + R.ejemplos.join('\n  ')); process.exit(1); }
  console.log(`OK: con el dedo ningún toque se pierde ni cuenta dos veces, tampoco en los bordes (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(0);
}
const { BOTS, jugarSenal, ctxDe } = await import('./play_human.mjs');
import { mezclar, Azar } from '../web/js/sim/fixed.js';
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 600), ATL = ['ventura', 'brenner', 'marangi'], COLS = [['s', 'split'], ['c', 'split']];
function medir(B, extra, imin, imax) {
  let v = 0, g = 0, bien = 0, perf = 0, n = 0;
  for (const [lev, env] of COLS) for (let k = 0; k < N; k++) {
    const r = new Azar(mezclar(k, 3)), I = imin + r.ent(imax - imin + 1), ctx = ctxDe(ATL[k % 3], lev, env, I, mezclar(k, 5), 'f', extra);
    const S = jugarSenal(ctx, B, mezclar(k, lev === 's' ? 21 : 22)), res = S.m.res; n++;
    if (res.res === 'valido') v++;
    for (const x of res.gestos || []) { g++; if (x.pal === 'perfecto') { perf++; bien++; } else if (x.pal === 'bien') bien++; }
  }
  return { valido: v * 100 / n, bien: bien * 100 / Math.max(1, g), perf: perf * 100 / Math.max(1, g) };
}
const f = x => `válidos ${x.valido.toFixed(1)} % · toques en PERFECTO o BIEN ${x.bien.toFixed(0)} % (PERFECTO ${x.perf.toFixed(0)} %)`;
const mal = [];
for (const [sd, nombre] of [[120, 'casual'], [180, 'flojo']]) {
  const B = { ...BOTS.casual, sd, lag: 60, visto: true };
  for (const [imin, imax, tramo] of [[8800, 9200, 'aperturas (88 a 92 %)'], [9500, 9700, '95 a 97 %']]) {
    const a = medir(B, { cal: 40 }, imin, imax), b = medir(B, { cal: 60, tactil: true }, imin, imax);
    console.log(`dedo ${nombre} (atraso 60, desvío ${sd}), ${tramo}\n  antes: ${f(a)}\n  ahora: ${f(b)}`);
    if (b.bien + .5 < a.bien) mal.push(`${nombre} ${tramo}: menos toques en BIEN que antes`);
    if (imin === 8800 && sd === 120 && b.valido < 95) mal.push(`casual en aperturas: ${b.valido.toFixed(1)} % (meta ≥ 95 %)`);
  }
}
const k = { ...BOTS.casual, visto: true };
console.log(`teclado casual (atraso 40, desvío 80), aperturas, para comparar: ${f(medir(k, {}, 8800, 9200))}`);
if (mal.length) { console.log('FALLÓ:\n  ' + mal.join('\n  ')); process.exit(1); }
console.log('OK: con el dedo, más toques en BIEN y aperturas que se levantan');
