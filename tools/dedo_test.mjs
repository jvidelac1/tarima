// Toques con el dedo (pedido del dueño del 12-nov: «es medio complicada la dinámica de pegarle perfecto al tap»). Sin
// navegador. Un bot que mira el círculo en pantalla (`visto`) toca con el atraso del dedo y de la pantalla (60 ms) y un
// desvío de campana; se mide qué parte de sus toques sale PERFECTO o BIEN y cuántos levantamientos valen, antes (corrección
// de 40 ms que corría también el círculo, sin ventanas del dedo) y ahora (corrección de 60 ms y FACIL.tactil).
// Uso: node tools/dedo_test.mjs [--n=600]   Sale con error si «ahora» no mejora a «antes» o si las aperturas bajan de 95 %.
import { BOTS, jugarSenal, ctxDe } from './play_human.mjs';
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
