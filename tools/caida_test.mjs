// Prueba sin navegador de web/js/game/caida.js: qué escena le toca a cada final de intento, y que la barra suelta caiga,
// rebote y quede quieta sobre la tarima siempre igual. Las holguras contra el cuerpo se miden con navegador
// (tools/check_escenas.mjs), porque necesitan los huesos del modelo.
// Uso: node tools/caida_test.mjs
import { BarraLibre, tipoCaida, planCaida, poseCaida, armarCaida } from '../web/js/game/caida.js';
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
  const pl = planCaida(tipo, null, true), p0 = poseCaida(pl, 123.4, 0, 0), p1 = poseCaida(pl, 123.4, 0, pl.quieto + pl.mezcla + .01);
  ok(p0.w === 0 && p0.i === 123 && Math.abs(p0.u - .4) < 1e-9, `${tipo}: no arranca en la pose del final`);
  ok(p1.w === 1 && p1.k === 0, `${tipo}: no termina en el destino`);
  ok(pl.quieto >= pl.suelta + .1, `${tipo}: el cuerpo se mueve antes de soltar la barra`);
}
const c = armarCaida({ res: 'valido' }, 'j', { y: 2, z: 0 }, .225);
ok(c && c.dur > c.pl.suelta + 1 && c.dur < 3.5, `válido: duración rara ${c && c.dur}`);

console.log(filas.join('\n'));
if (mal.length) { console.log(`\nMAL (${mal.length}):\n` + mal.slice(0, 30).join('\n')); process.exit(1); }
console.log('\ncaida_test: bien');
