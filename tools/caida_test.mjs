// Prueba sin navegador de web/js/game/caida.js: qué escena le toca a cada final de intento, y que la barra suelta caiga,
// rebote y quede quieta sobre la tarima siempre igual. Las holguras contra el cuerpo se miden con navegador
// (tools/check_escenas.mjs), porque necesitan los huesos del modelo.
// Uso: node tools/caida_test.mjs
import { BarraLibre, tipoCaida, planCaida, poseCaida, armarCaida, PIERDE, ladoPerdida } from '../web/js/game/caida.js';
import { CAUSAS } from '../web/js/sim/rules.js';

const mal = []; const ok = (c, txt) => { if (!c) mal.push(txt); };

// 1. Cada causa del núcleo tiene escena (salvo el nulo por reloj, donde no se levantó nada)
for (const causa of Object.keys(CAUSAS)) for (const mov of ['s', 'c', 'j']) {
  const nulo = ['codos_blandos', 'tiembla', 'antes', 'sin_apoyo', 'reloj'].includes(causa), res = { res: nulo ? 'nulo' : 'fallo', causa };
  const t = tipoCaida(res, mov);
  if (causa === 'reloj') ok(t === null, `nulo por reloj (${mov}) no debería tener escena: ${t}`);
  else { ok(!!t, `${causa} (${mov}) no tiene escena`); ok(!!planCaida(t, causa), `${causa} (${mov}): sin plan para «${t}»`); }
}
ok(tipoCaida({ res: 'valido' }, 's') === 'bajada', 'el válido no deja caer la barra');
ok(tipoCaida({ res: 'fallo', causa: 'adelante' }, 'c') === 'sentado', 'cargada adelante: tiene que quedar sentado');
ok(tipoCaida({ res: 'fallo', causa: 'sin_altura' }, 'j') === 'hombros', 'envión sin altura: la barra está en los hombros');
ok(tipoCaida({ res: 'fallo', causa: 'sin_altura' }, 's') === 'bajo', 'arranque sin altura: la barra está abajo');
ok(planCaida('arriba', 'atras').vz < 0 && planCaida('arriba', 'adelante').vz > 0, 'la barra atrás tiene que salir hacia atrás y la de adelante hacia adelante');

// 2. Física: nunca debajo de la tarima, quieta antes de 3 s, rebotes que pierden altura, igual al repetir
const filas = [];
for (const tipo of ['bajo', 'hombros', 'sentado', 'arriba', 'bajada']) for (const causa of [null, 'adelante', 'atras']) {
  if (causa && tipo !== 'arriba') continue;
  const pl = planCaida(tipo, causa, true), y0 = { bajo: .9, hombros: 1.45, sentado: .86, arriba: 1.3, bajada: 2.05 }[tipo];
  const b = new BarraLibre({ y: y0, z: .05, vy: pl.vy, vz: pl.vz, piso: .225 }), camino = [];
  for (let t = 0; t <= 4; t += 1 / 75) { b.en(t); camino.push([b.y, b.z, b.ang]); ok(b.y >= .225 - 1e-9, `${tipo}: la barra pasó debajo de la tarima (${b.y})`); ok(Math.abs(b.z) <= 1.8 + 1e-9, `${tipo}: la barra salió de la tarima`); }
  ok(b.quieta, `${tipo}${causa ? ' ' + causa : ''}: la barra no quedó quieta en 4 s`);
  const r = b.reposo; ok(r < 3, `${tipo}: tarda ${r.toFixed(2)} s en quedar quieta`);
  for (let k = 1; k < b.golpes.length; k++) ok(b.golpes[k].v < b.golpes[k - 1].v, `${tipo}: un rebote más fuerte que el anterior`);
  const c = new BarraLibre({ y: y0, z: .05, vy: pl.vy, vz: pl.vz, piso: .225 }); let igual = true;
  for (let i = camino.length - 1, t = 4; i >= 0; i -= 7, t -= 7 / 75) { c.en(Math.max(0, t)); const k = Math.round(Math.max(0, t) * 75); if (k < camino.length && (Math.abs(c.y - camino[k][0]) > 1e-9 || Math.abs(c.z - camino[k][1]) > 1e-9)) igual = false; }
  ok(igual, `${tipo}: al repetir hacia atrás no da lo mismo`);
  filas.push(`${(tipo + (causa ? ' ' + causa : '')).padEnd(16)} desde ${y0.toFixed(2)} m · primer golpe ${b.golpes[0].t.toFixed(2)} s a ${b.golpes[0].v.toFixed(1)} m/s en z ${b.golpes[0].z.toFixed(2)} · ${b.golpes.length} golpes · quieta en ${r.toFixed(2)} s, z ${b.z.toFixed(2)} m`);
}

// 3. Pose: sostiene la del final hasta `quieto`, y termina en el destino
for (const tipo of ['bajo', 'hombros', 'sentado', 'arriba', 'bajada']) {
  const pl = planCaida(tipo, null, true), p0 = poseCaida(pl, 123.4, 0, 0), p1 = poseCaida(pl, 123.4, 0, (pl.pierde?.dur || 0) + pl.quieto + pl.mezcla + .01);
  ok(p0.w === 0 && p0.i === 123 && Math.abs(p0.u - .4) < 1e-9, `${tipo}: no arranca en la pose del final`);
  ok(p1.w === 1 && p1.k === 0, `${tipo}: no termina en el destino`);
  ok(pl.quieto >= pl.suelta + .1, `${tipo}: el cuerpo se mueve antes de soltar la barra`);
}
// 4. La barra perdida desde arriba se ve venir (docs/GRAFICOS_PLAN.md, G3): se le va en las manos antes de soltarla, el
// cuerpo reacciona, y nunca queda firme (barra y cuerpo quietos) más de 200 ms antes de soltar
const FIRME_MS = 200, perd = [];
for (const causa of ['atras', 'adelante', 'codos', 'fondo', 'temblor']) for (const mov of ['s', 'j']) for (const g0 of [93.0, 97.4, 131.2]) {
  const res = { res: 'fallo', causa }, bar = { y: 1.62 + (g0 % 7) * .04, z: -.04 }, e = `pérdida ${causa} (${mov}, ${g0}): `;
  if (tipoCaida(res, mov) !== 'arriba') continue;
  const c = armarCaida(res, mov, bar, .225, g0, null, { hombros: { y: bar.y - .5, z: 0 }, cadera: { y: bar.y - 1 }, kg: 140 }), D = c.pl.pierde;
  ok(!!D && D.lado === ladoPerdida(causa), e + 'sin plan de pérdida'); if (!D) continue;
  const en = t => { const b = c.barra.en(t); return { y: b.y, z: b.z, guiada: b.guiada }; }, d = (a, b) => Math.hypot(a.y - b.y, a.z - b.z);
  const b0 = en(0), bS = en(D.dur - 1e-4), bS2 = en(D.dur + 1e-4), bD = en(D.dur + .3);
  // cuánto tarda en notarse: primer instante con la barra a más de 1 cm de donde estaba
  let firme = 0; for (let t = 0; t <= D.dur; t += .005) { if (d(en(t), b0) > .01) break; firme = t + .005; }
  ok(firme * 1000 < FIRME_MS, `${e}queda firme ${(firme * 1000).toFixed(0)} ms (tope ${FIRME_MS})`);
  ok(en(D.dur * .5).guiada === true && bS2.guiada === false, e + 'la barra no va en las manos mientras se le va');
  ok(d(bS, b0) > .04, `${e}al soltar la barra se movió solo ${(d(bS, b0) * 100).toFixed(1)} cm`);
  ok(d(bS, bS2) < .01, `${e}salto de ${(d(bS, bS2) * 100).toFixed(1)} cm al soltar`);
  ok(Math.sign(bS.z - b0.z) === Math.sign(bD.z - bS.z), e + 'se le va para un lado y cae para el otro');
  ok(D.lado !== 'atras' || bD.z < b0.z, e + 'la barra atrás no cae atrás'); ok(D.lado === 'atras' || bD.z > b0.z, e + 'la barra no cae adelante');
  let sube = 0; for (let t = 0; t <= D.dur; t += .01) sube = Math.max(sube, en(t).y - b0.y); ok(sube < .02, `${e}la barra sube ${(sube * 100).toFixed(1)} cm mientras se le va`);
  // el cuerpo: a los 200 ms ya cambió (tronco, cabeza o cadera) y las manos siguen la barra; después de soltar, las manos la dejan
  const p2 = poseCaida(c.pl, g0, 0, .2, null), pS = poseCaida(c.pl, g0, 0, D.dur - 1e-4, null), pD = poseCaida(c.pl, g0, 0, D.dur + PIERDE.sale + .01, null), pF = poseCaida(c.pl, g0, 0, c.dur + 2, null);
  ok(p2.pierde && Math.abs(p2.pierde.tronco) + Math.abs(p2.pierde.cabeza) + Math.abs(p2.dy || 0) > .03, e + 'a los 200 ms el cuerpo no cambió');
  ok(p2.mano && p2.mano.w > .95 && Math.abs(p2.mano.y - en(.2).y) < 1e-9 && Math.abs(p2.mano.z - en(.2).z) < 1e-9, e + 'las manos no van con la barra');
  ok(p2.w === 0 && pS.w === 0, e + 'se mezcla hacia «Parado» antes de soltar');
  ok(!pD.mano || pD.mano.w === 0, e + 'las manos siguen en la barra después de soltarla');
  ok(pF.w === 1 && (!pF.pierde || pF.pierde.u === 0) && Math.abs(pF.dy || 0) < 1e-9, e + 'no termina de pie y derecho');
  // siempre igual para el mismo intento (la repetición)
  const c2 = armarCaida(res, mov, bar, .225, g0, null, { hombros: { y: bar.y - .5, z: 0 }, cadera: { y: bar.y - 1 }, kg: 140 }), q = c2.barra.en(D.dur * .7);
  ok(Math.abs(q.y - en(D.dur * .7).y) < 1e-12 && Math.abs(q.z - en(D.dur * .7).z) < 1e-12, e + 'no da lo mismo al repetir');
  if (g0 === 93.0) perd.push(`pérdida ${(causa + ' ' + mov).padEnd(11)} ${D.lado.padEnd(8)} ${D.dur.toFixed(2)} s en las manos · firme ${(firme * 1000).toFixed(0).padStart(3)} ms · se va ${(d(bS, b0) * 100).toFixed(1)} cm (z ${((bS.z - b0.z) * 100).toFixed(0)}, y ${((bS.y - b0.y) * 100).toFixed(0)}) · sale a ${c.barra.g.vz.toFixed(2)} m/s`);
}
ok(perd.length >= 8, 'no se probaron las pérdidas desde arriba');
// los demás finales no cambian: sin pérdida
for (const [res, mov] of [[{ res: 'valido' }, 's'], [{ res: 'fallo', causa: 'sin_altura' }, 's'], [{ res: 'fallo', causa: 'aplastado' }, 'c'], [{ res: 'fallo', causa: 'devuelve' }, 'j']]) ok(!armarCaida(res, mov, { y: 1.5, z: 0 }, .225).pl.pierde, `${res.causa || res.res}: no es una barra perdida desde arriba`);
filas.push('', ...perd);

const c = armarCaida({ res: 'valido' }, 'j', { y: 2, z: 0 }, .225);
ok(c && c.dur > c.pl.suelta + 1 && c.dur < 3.5, `válido: duración rara ${c && c.dur}`);

console.log(filas.join('\n'));
if (mal.length) { console.log(`\nMAL (${mal.length}):\n` + mal.slice(0, 30).join('\n')); process.exit(1); }
console.log('\ncaida_test: bien');
