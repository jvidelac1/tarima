// Prueba sin navegador de los skins (web/js/game/skins.js y web/data/skins.json; docs/GRAFICOS_PLAN.md, G6): el catálogo es
// válido, cada skin se resuelve contra la ficha de cada pesista del plantel, y un skin no pesa (solo parámetros).
// Uso: node tools/skins_test.mjs
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverSkin, validarCatalogo, hexLineal, contraste, CAMPOS, MATERIAL, TOPE } from '../web/js/game/skins.js';
import { medir } from './presupuesto_modelos.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web'), mal = [], ok = (c, txt) => { if (!c) mal.push(txt); };
const cat = JSON.parse(readFileSync(join(WEB, 'data/skins.json'), 'utf8')), plantel = JSON.parse(readFileSync(join(WEB, 'data/plantel.json'), 'utf8')), poses = JSON.parse(readFileSync(join(WEB, 'data/poses.json'), 'utf8'));

// 1. catálogo
for (const m of validarCatalogo(cat)) mal.push('catálogo: ' + m);
const ids = Object.keys(cat.skins);
ok(ids.length >= 4 && ids.length <= 24, `el catálogo tiene ${ids.length} skins (de 4 a 24)`);
ok(statSync(join(WEB, 'data/skins.json')).size < 6000, 'skins.json pesa más de 6 KB: un skin son parámetros, no datos');
// el validador rechaza lo que tiene que rechazar
ok(validarCatalogo({ v: 1, skins: { a1: { capellada: 'rojo' } } }).length > 0, 'acepta un color que no es hex');
ok(validarCatalogo({ v: 1, skins: { a1: { gorra: '#ffffff' } } }).length > 0, 'acepta un campo desconocido');
ok(validarCatalogo({ v: 1, skins: { a1: { suela: '#ffffff' }, b1: { suela: '#FFFFFF' } } }).some(x => x.includes('igual')), 'acepta dos skins iguales');
ok(validarCatalogo({ v: 1, skins: { a1: { capellada: '#101010', tira: '#111111' } } }).length > 0, 'acepta una tira que no se distingue');

// 2. cuentas
ok(hexLineal('#ffffff').every(v => Math.abs(v - 1) < 1e-9) && hexLineal('#000000').every(v => v === 0), 'hexLineal: blanco y negro');
ok(Math.abs(contraste('#ffffff', '#000000') - 21) < 1e-6, 'contraste blanco/negro');
const vacio = resolverSkin({}, { piel: '#74482f' });
ok(vacio.piel === null && vacio.malla === null && vacio.pelo === null && !Object.keys(vacio.materiales).length, 'un skin vacío cambia algo');
{ const f = { piel: '#74482f', malla: '#1d4f9c', zapatilla: '#efeee9', cinturon: '#2b1d14' }, r = resolverSkin({ piel: f.piel, malla: f.malla, capellada: f.zapatilla, cinturon: f.cinturon }, f);
  for (const v of [r.piel, r.malla, r.materiales.ShoeUpper, r.materiales.Belt]) ok(v && v.every(x => Math.abs(x - 1) < 1e-9), 'pedir el color que ya tiene no da multiplicador 1'); }
ok(resolverSkin({ capellada: '#ffffff' }, { zapatilla: '#000000' }).materiales.ShoeUpper.every(x => x <= TOPE), 'el multiplicador pasa el tope');
ok(!('ShoeUpper' in resolverSkin({ capellada: '#ffffff' }, {}).materiales), 'sin color base en la ficha no se puede calcular la capellada');

// 3. cada skin contra cada pesista con modelo: multiplicadores finitos y dentro del tope; los materiales existen en su GLB
const nombres = new Set(Object.values(MATERIAL).map(x => x[0])), filas = [];
for (const [pid, ficha] of Object.entries(plantel.pesistas)) {
  if (!poses[pid]) continue;
  const mats = new Set(medir(join(WEB, 'models', pid + '_1024.glb')).materiales);
  for (const n of nombres) ok(mats.has(n), `${pid}: el modelo no trae el material ${n}`);
  for (const id of ids) {
    const r = resolverSkin(cat.skins[id], ficha), todos = [r.piel, r.malla, ...Object.values(r.materiales)].filter(Boolean);
    ok(todos.length > 0 || r.pelo, `${id} sobre ${pid}: no cambia nada`);
    ok(todos.every(v => v.length === 3 && v.every(x => Number.isFinite(x) && x >= 0 && x <= TOPE)), `${id} sobre ${pid}: multiplicador fuera de rango`);
    for (const k of Object.keys(r.materiales)) ok(mats.has(k), `${id} sobre ${pid}: material ${k} inexistente`);
  }
}
for (const id of ids) filas.push(`${id.padEnd(9)} ${CAMPOS.filter(k => cat.skins[id][k]).map(k => `${k} ${cat.skins[id][k]}`).join(' · ')}`);

console.log(filas.join('\n'));
if (mal.length) { console.error(`\nFALLÓ skins_test (${mal.length}):\n  ` + mal.slice(0, 30).join('\n  ')); process.exit(1); }
console.log(`\nOK skins_test: ${ids.length} skins`);
