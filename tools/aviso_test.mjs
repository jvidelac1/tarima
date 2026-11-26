// LIF-78: el aviso del núcleo (Intento#aviso, solo lectura) para que la presentación muestre que la barra se va ANTES de
// que se cierre el tramo. Sin navegador. Comprueba:
//   1. Leerlo en cada paso no cambia nada (mismo resultado que sin leerlo) y no hay aviso en el control clásico.
//   2. Con la barra caída: riesgo 1000, tFallo = instante del fallo, tramo y causa los del resultado.
//   3. Sirve: en las caídas «arriba», el riesgo ya estaba alto (≥ 500) al menos 400 ms antes del fallo en la mayoría, y en
//      promedio es bastante más alto que en los válidos en el mismo momento.
// Uso: node tools/aviso_test.mjs [--n=300]
import { Intento } from '../web/js/sim/attempt.js';
import { mezclar } from '../web/js/sim/fixed.js';
import { ATL, ctxBarra, jugarBarra, PERFILES } from './barra_bots.mjs';
import { cuerpoBarra } from '../web/js/sim/rules.js';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 300), mal = [], ok = (c, m) => { if (!c) mal.push(m); };
const ANTES = 400, ALTO = 500;

/** Rehace el intento leyendo el aviso cada 20 ms; devuelve el resultado y el riesgo en t (función). */
function conAviso(ctx, S) {
  const m = new Intento(ctx), muestras = []; m.confirmar(S.conf);
  const leer = () => { const a = m.aviso; muestras.push([m.t, a.riesgo]); return a; };
  let t = S.conf;
  for (const [te, v] of S.ent) { for (; t < te; t += 20) { m.avanzar(t); if (m.res) break; leer(); } m.entrada(te, v); if (!m.res) leer(); }
  for (let g = 0; !m.res && g < 5000; g++, t += 20) { m.avanzar(t); if (!m.res) leer(); }
  const en = x => { let r = 0; for (const [tm, k] of muestras) { if (tm > x) break; r = k; } return r; };
  return { m, en };
}

const cuenta = { arriba: 0, avisadas: 0, validos: 0, sumV: 0, sumC: 0 };
for (const dif of ['facil', 'medio', 'dificil']) {
  const extra = dif === 'facil' ? {} : { dif };
  for (const id of ATL) for (const lev of ['s', 'c']) for (const I of [9500, 10000, 10300]) for (let k = 0; k < Math.ceil(N / 6); k++) {
    const sem = mezclar(k, I, lev === 'c' ? 7 : 3, ATL.indexOf(id), dif.length), ctx = ctxBarra(id, lev, lev === 'c' ? cuerpoBarra(id).casa : undefined, I, sem, extra);
    const S = jugarBarra(ctx, PERFILES.medio, mezclar(sem, 5)), { m, en } = conAviso(ctx, S);
    ok(JSON.stringify(m.res) === JSON.stringify(S.m.res), `${dif} ${id} ${lev} ${I} #${k}: leer el aviso cambió el resultado`);
    const a = m.aviso, r = m.res;
    if (r.res === 'fallo') ok(a.riesgo === 1000 && a.tFallo === r.t && a.causa === r.causa && a.tramo === r.uno.tramo_caida, `${dif} ${id} ${lev}: aviso tras el fallo ${JSON.stringify(a)}`);
    else ok(a.riesgo === 0 && a.tFallo === null, `${dif} ${id} ${lev}: aviso tras ${r.res} ${JSON.stringify(a)}`);
    if (r.res === 'fallo' && r.uno.tramo_caida === 'arriba') { cuenta.arriba++; const x = en(r.t - ANTES); cuenta.sumC += x; if (x >= ALTO) cuenta.avisadas++; }
    if (r.res === 'valido' && r.uno.tramo_mayor) { // el válido, en el mismo momento relativo: ANTES ms antes de cerrar «arriba»
      const L = r.uno && m.U.log.find(e => e.tramo === 'arriba' && e.gasto !== undefined); if (L) { cuenta.validos++; cuenta.sumV += en(L.t - ANTES); }
    }
  }
}
{ const ctx = { ...ctxBarra('ventura', 's', undefined, 9500, 1), ctl: 'c' }; ok(new Intento(ctx).aviso === null, 'el clásico no tiene aviso'); }

const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0), medC = cuenta.arriba ? Math.round(cuenta.sumC / cuenta.arriba) : 0, medV = cuenta.validos ? Math.round(cuenta.sumV / cuenta.validos) : 0;
console.log(`Caídas «arriba»: ${cuenta.arriba} · con riesgo ≥ ${ALTO} ${ANTES} ms antes: ${pct(cuenta.avisadas, cuenta.arriba)} % · riesgo medio ahí: caídas ${medC}, válidos ${medV}`);
ok(cuenta.arriba >= 30, `pocas caídas «arriba» para medir (${cuenta.arriba})`);
ok(pct(cuenta.avisadas, cuenta.arriba) >= 60, `el aviso llega tarde: solo ${pct(cuenta.avisadas, cuenta.arriba)} % de las caídas «arriba» con riesgo ≥ ${ALTO} ${ANTES} ms antes (meta ≥ 60 %)`);
ok(medC >= 900 && medV <= 400, `el aviso no distingue: riesgo medio ${medC} en las caídas (meta ≥ 900) y ${medV} en los válidos (meta ≤ 400)`);
if (mal.length) { console.log(`FALLA (${mal.length}):\n` + [...new Set(mal)].slice(0, 15).join('\n')); process.exit(1); }
console.log('OK: el aviso es de solo lectura, cierra bien con el fallo y anticipa las caídas de arriba');
