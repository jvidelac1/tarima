// Arma web/data/sim.json: los tiempos de cada ancla (ms enteros, leídos de `tt` en web/data/poses.json por segmento y nombre
// de fase, nunca por índice) y las fichas de los tres pesistas del juego (docs/JUEGO.md, secciones 7 y 9.4).
// sim.json se versiona por temporada: dentro de una temporada no cambia. Sin argumentos lo reescribe; con --check compara
// contra el publicado y avisa si algún tiempo del clip se alejó más de 8 %.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { huella, canonico } from '../web/js/sim/fixed.js';
import { VERSION } from '../web/js/sim/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(ROOT, 'web/data/sim.json');
const TEMPORADA = 1;

/**
 * Fichas del juego (sección 7.1). `ia`: apertura habitual y umbral en milésimas, saltos planeados y estilo de cambios (7.3).
 * `cuerpoJuego` (solo el nivel 'u', docs/JUEGO.md G2.5): cuánto le cuesta cada tramo a ese cuerpo (milésimas sobre la base de
 * rules.js → UNO.base), si la movilidad le alcanza para el squat (`movil`) y su envión de la casa (`casa`, el que el panel
 * propone). Compacto: fuerte arriba de la cabeza, débil en kilos (techo más bajo). Largo: fuerte en el tirón, débil al
 * pararse. Potente: fuerte al pararse, débil arriba de la cabeza. Los rivales siguen en Clásico y no los leen.
 */
const ATLETAS = {
  ventura: { nombre: 'Dario Ventura', pais: 'Arxenia', codigo: 'ARX', dorsal: 7, modelo: 'ventura', techo: { s: 169, c: 211 }, apertura: { s: 158, c: 197 }, enviones: ['squat', 'split'],
    attrs: { tec: 9, tem: 6, gar: 6, fon: 7 }, ia: { apertura: 935, saltos: { s: [5, 3], c: [6, 4] }, umbral: 1010, estilo: 'fijo' },
    cuerpoJuego: { tiron: 1100, arriba: 700, pararse: 850, movil: true, casa: 'split' } },
  brenner: { nombre: 'Ilya Brenner', pais: 'Novakia', codigo: 'NVK', dorsal: 12, modelo: 'brenner', techo: { s: 175, c: 207 }, apertura: { s: 165, c: 195 }, enviones: ['split', 'power'],
    attrs: { tec: 7, tem: 8, gar: 5, fon: 8 }, ia: { apertura: 940, saltos: { s: [5, 5], c: [5, 4] }, umbral: 1005, estilo: 'pasa' },
    cuerpoJuego: { tiron: 500, arriba: 900, pararse: 1200, movil: false, casa: 'split' } },
  marangi: { nombre: 'Teo Marangi', pais: 'Pelagia', codigo: 'PEL', dorsal: 3, modelo: 'brenner', techo: { s: 172, c: 209 }, apertura: { s: 160, c: 194 }, enviones: ['power', 'split'],
    attrs: { tec: 5, tem: 9, gar: 9, fon: 5 }, ia: { apertura: 930, saltos: { s: [5, 5], c: [5, 5] }, umbral: 1030, estilo: 'orgullo' },
    cuerpoJuego: { tiron: 1000, arriba: 1350, pararse: 600, movil: false, casa: 'split' } },
};

function anclas(datos) {
  const ms = x => Math.round(x * 1000), sub = datos.sub;
  const seg = (nombre) => {
    const s = datos.segs[nombre]; if (!s) throw new Error(`falta el segmento ${nombre}`);
    const n = (s.poses.length - 1) * sub + 1; if (!Array.isArray(s.tt) || s.tt.length !== n) throw new Error(`${nombre}: tt no trae un tiempo por muestra`);
    return { t: fase => { const i = s.poses.findIndex(p => p.n === fase); if (i < 0) throw new Error(`falta la fase ${nombre}/${fase}`); return s.tt[i * sub]; } };
  };
  const tiron = (nombre) => { const g = seg(nombre); return { knee: ms(g.t('Segundo tirón') - g.t('Salida')) - ms(g.t('Segundo tirón') - g.t('Primer tirón')), power: ms(g.t('Segundo tirón') - g.t('Salida')), rec: ms(g.t('Recepción') - g.t('Segundo tirón')) }; };
  const out = { s: tiron('snatch'), c: tiron('clean') };
  { const g = seg('clean'); out.c.amort = ms(g.t('Amortiguación') - g.t('Recepción')); }
  const env = (nombre, rec, fin) => { const g = seg(nombre); return { dip: ms(g.t('Envión · Dip') - g.t('Recuperación')), rec: ms(g.t(rec) - g.t('Envión · Dip')), post: ms(g.t('Envión · Final') - g.t(fin)) }; };
  out.split = env('split', 'Envión · Tijera', 'Envión · Tijera');
  out.power = env('power', 'Power jerk · Recepción', 'Power jerk · Recepción');
  out.squat = env('squat', 'Squat jerk · Recepción', 'Squat jerk · Recuperación');
  { const g = seg('squat'); out.squat.fondo = ms(g.t('Squat jerk · Fondo') - g.t('Squat jerk · Recepción')); }
  return out;
}

const poses = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/poses.json'), 'utf8'));
const modelos = {}; for (const k of Object.keys(poses)) modelos[k] = anclas(poses[k]);
for (const a of Object.values(ATLETAS)) if (!modelos[a.modelo]) throw new Error(`no hay modelo ${a.modelo}`);
const sim = { v: 1, sim: VERSION, temporada: TEMPORADA, modelos, atletas: ATLETAS };
sim.huella = huella(canonico(sim));

if (process.argv.includes('--check')) {
  const pub = JSON.parse(fs.readFileSync(SALIDA, 'utf8')); let mal = 0;
  for (const m in pub.modelos) for (const g in pub.modelos[m]) for (const k in pub.modelos[m][g]) {
    const a = pub.modelos[m][g][k], b = modelos[m]?.[g]?.[k];
    if (b === undefined || Math.abs(b - a) > a * .08) { console.log(`AVISO ${m}/${g}/${k}: publicado ${a} ms, clip ${b} ms`); mal++; }
  }
  console.log(pub.huella === sim.huella ? `sim.json al día (huella ${pub.huella})` : `sim.json publicado ${pub.huella}, recalculado ${sim.huella}: ${mal ? 'el clip se alejó más de 8 %' : 'la presentación acomoda el clip a los tiempos publicados'}`);
  process.exit(mal ? 1 : 0);
}
fs.writeFileSync(SALIDA, JSON.stringify(sim, null, 1) + '\n');
console.log(`sim.json · temporada ${TEMPORADA} · huella ${sim.huella}`);
for (const m in modelos) console.log(m, JSON.stringify(modelos[m]));
