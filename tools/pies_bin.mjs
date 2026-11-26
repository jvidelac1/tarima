// Compacta web/models/barefoot/<nombre>.json (los pies del pesista nuevo, blender/barefoot.py) a <nombre>.bin: la misma malla
// en binario (un tercio del peso y sin analizar 1,4 MB de texto en el teléfono). Formato: uint32 con el largo de la cabecera,
// la cabecera en JSON ({names, campos: [{k, tipo, n, escala}]}), relleno hasta múltiplo de 4 y los campos uno tras otro, cada
// uno alineado a 4 bytes. Lo lee web/js/character.js (leerPies).
// Uso: node tools/pies_bin.mjs [nombre ...]   (sin nombres: todos los .json de la carpeta). Comprueba la ida y vuelta.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/models/barefoot');
const TIPOS = { f32: Float32Array, u16: Uint16Array, u8: Uint8Array, i16: Int16Array, u32: Uint32Array };
// posición exacta (float32); normal y uv a 16 bits; pesos a 16 bits; huesos y uña a 8 bits; índices a 16 o 32 según haga falta
const PLAN = { position: ['f32', 1], normal: ['i16', 32767], uv: ['u16', 65535], nail: ['u8', 255], weight: ['u16', 65535], joint: ['u8', 1], index: [null, 1] };
export function empaquetar(d) {
  const campos = [], partes = [];
  for (const [k, [t0, escala]] of Object.entries(PLAN)) {
    const v = d[k], tipo = t0 || (Math.max(...v) > 65535 ? 'u32' : 'u16'), A = new TIPOS[tipo](v.length);
    for (let i = 0; i < v.length; i++) A[i] = escala === 1 ? v[i] : Math.round(v[i] * escala);
    campos.push({ k, tipo, n: v.length, escala }); partes.push(Buffer.from(A.buffer));
  }
  let cab = Buffer.from(JSON.stringify({ names: d.names, campos })); cab = Buffer.concat([cab, Buffer.alloc((4 - cab.length % 4) % 4, 32)]);
  const largo = Buffer.alloc(4); largo.writeUInt32LE(cab.length);
  return Buffer.concat([largo, cab, ...partes.map(p => Buffer.concat([p, Buffer.alloc((4 - p.length % 4) % 4)]))]);
}
/** El mismo lector que usa el navegador (character.js): ArrayBuffer → {names, position, normal, ...} con arreglos comunes. */
export function leerPies(buf) {
  const dv = new DataView(buf), n = dv.getUint32(0, true), cab = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))), out = { names: cab.names };
  let o = 4 + n;
  for (const c of cab.campos) { const T = TIPOS[c.tipo], A = new T(buf, o, c.n); out[c.k] = c.escala === 1 ? Array.from(A) : Array.from(A, x => x / c.escala); o += Math.ceil(c.n * T.BYTES_PER_ELEMENT / 4) * 4; }
  return out;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const nombres = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  for (const n of nombres) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8')), b = empaquetar(d); fs.writeFileSync(path.join(DIR, n + '.bin'), b);
    const r = leerPies(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); let peor = 0;
    for (const k of Object.keys(PLAN)) { if (r[k].length !== d[k].length) throw new Error(`${n}.${k}: largo`); for (let i = 0; i < d[k].length; i++) peor = Math.max(peor, Math.abs(r[k][i] - d[k][i])); }
    if (JSON.stringify(r.index) !== JSON.stringify(d.index) || JSON.stringify(r.joint) !== JSON.stringify(d.joint)) throw new Error(`${n}: índices o huesos distintos`);
    console.log(`${n}: ${(fs.statSync(path.join(DIR, n + '.json')).size / 1e3).toFixed(0)} KB → ${(b.length / 1e3).toFixed(0)} KB · diferencia máxima ${peor.toExponential(1)}`);
  }
}
