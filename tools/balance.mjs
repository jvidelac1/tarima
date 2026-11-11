// Informe de balance (docs/JUEGO.md, sección 9.7): jugadores simulados y su porcentaje de válidos por intensidad, con todo
// el intento (gestos y pelea). Es la herramienta para ajustar los números de rules.js: las metas mandan.
// Uso: node tools/balance.mjs [--n=300] [--rivales]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { gestos } from '../web/js/sim/ai.js';
import { Partida } from '../web/js/sim/match.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/sim.json'), 'utf8')));
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 300);
const INT = [9000, 9500, 10000, 10300, 10600];
const PERFILES = { 'Experto (25 ms)': { sd: 25, pelea: 40 }, 'Hábil (40 ms)': { sd: 40, pelea: 60 }, 'Casual (60 ms)': { sd: 60, pelea: 90 } };
const METAS = { 'Experto (25 ms)': [99, 97, 85, 50, 10], 'Hábil (40 ms)': [97, 90, 60, 30, 3], 'Casual (60 ms)': [85, 60, 25, 5, 1] };
const MOVS = [['Arranque', 's', undefined], ['Dos tiempos · tijera', 'c', 'split'], ['Dos tiempos · power', 'c', 'power'], ['Dos tiempos · squat', 'c', 'squat']];
// pesista neutro: Técnica 7, Garra 6, sin etiqueta, jueces sin sesgo
const ctx = (lev, env, I, semilla) => ({ lev, env, I, tec: 7, temple: 0, garra: 6, anclas: datos.modelos.ventura, semilla, cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000 });
function validos(lev, env, I, perfil, base) { let v = 0; for (let k = 0; k < N; k++) if (gestos(ctx(lev, env, I, base + k * 7919), perfil, base + k * 104729).res.res === 'valido') v++; return Math.round(v * 100 / N); }
const fila = (c0, xs) => `| ${c0} | ${xs.join(' | ')} |`;

console.log(`# Informe de balance (${N} intentos por casilla, huella ${datos.huella})\n`);
for (const [nombre, lev, env] of MOVS) {
  console.log(`## ${nombre}\n`); console.log(fila('Intensidad', Object.keys(PERFILES).map(k => `${k} · meta`))); console.log(fila('---', Object.keys(PERFILES).map(() => '---')));
  INT.forEach((I, i) => console.log(fila(`${I / 100} %`, Object.entries(PERFILES).map(([k, p], j) => `${validos(lev, env, I, p, 1000 * (i + 1) + j)} % · ${METAS[k][i]} %`))));
  console.log('');
}
console.log('## Jugadores que no deberían ganar (arranque y dos tiempos con tijera)\n');
{
  const I2 = [8500, 9000, 9500, 10000, 10300, 10600];
  console.log(fila('Jugador', I2.map(I => `${I / 100} %`))); console.log(fila('---', I2.map(() => '---')));
  const mach = { sd: 25, pelea: 40, ritmo: 143 };
  for (const [nombre, lev, env] of MOVS.slice(0, 2)) console.log(fila(`Machacador · ${nombre} (meta: menos de 30 % hasta el 100 %)`, I2.map((I, i) => `${validos(lev, env, I, mach, 50 + i)} %`)));
  let mejor = null;
  for (const ritmo of [200, 250, 300, 350, 400, 500, 650]) {
    const xs = I2.map((I, i) => (validos('s', undefined, I, { sd: 40, pelea: 60, ritmo }, 70 + i) + validos('c', 'split', I, { sd: 40, pelea: 60, ritmo }, 90 + i)) / 2), m = xs.reduce((a, b) => a + b, 0) / xs.length;
    if (!mejor || m > mejor.m) mejor = { ritmo, xs, m };
  }
  console.log(fila(`Metrónomo, mejor ritmo fijo: uno cada ${mejor.ritmo} ms (meta: promedio menor a 50 %; da ${Math.round(mejor.m)} %)`, mejor.xs.map(x => `${Math.round(x)} %`)));
  console.log('');
}
if (process.argv.includes('--rivales')) {
  console.log('## Rivales en una final (200 finales por nivel, los tres manejados por el juego)\n');
  console.log(fila('Nivel', ['Válidos', 'Ventura: total medio (mín a máx)', 'Brenner', 'Marangi', 'Sin marca', 'Resto final medio'])); console.log(fila('---', new Array(6).fill('---')));
  for (const nivel of ['amistoso', 'normal', 'dificil']) {
    let v = 0, n = 0, sm = 0, resto = 0; const T = { ventura: [], brenner: [], marangi: [] };
    for (let s = 1; s <= 200; s++) {
      const p = new Partida(datos, { semilla: s * 7919, nivel, cal: 0, primera: false, atletas: ['ventura', 'brenner', 'marangi'].map(id => ({ id, ctrl: 'juego' })) });
      p.empezar(); while (p.fase !== 'fin') { if (p.fase === 'intervalo') p.empezar(); const r = p.resolverIA(); n++; if (r.res.res === 'valido') v++; }
      for (const f of p.tabla()) { if (f.total) T[f.id].push(f.total); else sm++; } for (const a of p.at) resto += a.resto;
    }
    const d = xs => `${Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)} (${Math.min(...xs)} a ${Math.max(...xs)})`;
    console.log(fila(nivel, [`${Math.round(v * 100 / n)} %`, d(T.ventura), d(T.brenner), d(T.marangi), `${(sm / 6).toFixed(1)} %`, Math.round(resto / 6000)]));
  }
}
