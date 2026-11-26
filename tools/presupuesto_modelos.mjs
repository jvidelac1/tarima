// Presupuesto de los modelos de los pesistas (docs/GRAFICOS_PLAN.md, historia G0). Sin navegador ni Blender: lee los GLB de
// web/models y cuenta triángulos por material, huesos, morphs, texturas (formato y lado) y peso de descarga, y falla si un
// modelo pasa su tope. Los topes son los del teléfono (el juego baja <id>_1024.glb en «Baja» y «Móvil»).
//   node tools/presupuesto_modelos.mjs            tabla y control (sale con 1 si algo pasa su tope)
//   node tools/presupuesto_modelos.mjs --json     lo mismo como JSON (para comparar antes/después)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'models');
/**
 * Topes por modelo. `tri`: triángulos en el nivel completo; `triCuerpo`: material Body; `mbMovil`: MB del _1024.glb;
 * `mbAlta`: MB del .glb; `texMovil` / `texAlta`: lado máximo de textura; `huesos`: huesos con piel; `morphs`: correctivos.
 */
export const TOPE = { tri: 190000, triCuerpo: 100000, mbMovil: 3.6, mbAlta: 6.4, texMovil: 1024, texAlta: 4096, huesos: 80, morphs: 6, mascaraKb: 280 };

function leerGlb(ruta) {
  const b = readFileSync(ruta); if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(ruta + ': no es GLB');
  const n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n).toString('utf8')), bin = b.subarray(20 + n + 8);
  return { json, bin, bytes: b.length };
}
/** Lado (ancho, alto) y formato de una imagen PNG, JPEG o WebP leyendo solo su cabecera. */
export function ladoImagen(d) {
  if (d[0] === 0x89 && d[1] === 0x50) return [d.readUInt32BE(16), d.readUInt32BE(20), 'png'];
  if (d[0] === 0xff && d[1] === 0xd8) {
    let i = 2;
    while (i + 9 < d.length) { const m = d[i + 1], L = d.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [d.readUInt16BE(i + 7), d.readUInt16BE(i + 5), 'jpeg']; i += 2 + L; }
  }
  if (d.toString('ascii', 0, 4) === 'RIFF' && d.toString('ascii', 8, 12) === 'WEBP') {
    const k = d.toString('ascii', 12, 16);
    if (k === 'VP8 ') return [d.readUInt16LE(26) & 0x3fff, d.readUInt16LE(28) & 0x3fff, 'webp'];
    if (k === 'VP8L') { const v = d.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1, 'webp']; }
    if (k === 'VP8X') return [d.readUIntLE(24, 3) + 1, d.readUIntLE(27, 3) + 1, 'webp'];
  }
  return [0, 0, '?'];
}
export function medir(ruta) {
  const { json, bin, bytes } = leerGlb(ruta), tri = {}, mats = json.materials || [];
  let total = 0, morphs = 0;
  for (const m of json.meshes || []) for (const p of m.primitives) {
    const n = (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3, k = mats[p.material]?.name || '?';
    tri[k] = (tri[k] || 0) + n; total += n; morphs = Math.max(morphs, (p.targets || []).length);
  }
  const tex = (json.images || []).map((im, i) => {
    const v = json.bufferViews[im.bufferView], o = v.byteOffset || 0, [w, h, f] = ladoImagen(bin.subarray(o, o + v.byteLength));
    return { nombre: im.name || 'img' + i, w, h, formato: f, kb: Math.round(v.byteLength / 1024) };
  });
  const huesos = Math.max(0, ...(json.skins || []).map(s => s.joints.length));
  return { bytes, tri, triTotal: total, morphs, huesos, tex, texMax: Math.max(0, ...tex.map(t => Math.max(t.w, t.h))), materiales: mats.map(m => m.name), nodos: (json.nodes || []).map(n => n.name) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ids = readdirSync(RAIZ).filter(f => f.endsWith('_1024.glb')).map(f => f.replace('_1024.glb', '')).sort(), sale = {}, mal = [];
  const mb = x => (x / 1048576).toFixed(2);
  for (const id of ids) {
    const A = medir(join(RAIZ, id + '.glb')), M = medir(join(RAIZ, id + '_1024.glb'));
    let mascara = 0; for (const s of ['_mask.webp', '_mask2.webp']) { try { mascara += statSync(join(RAIZ, id + s)).size; } catch { /* no la trae */ } }
    sale[id] = { alta: A, movil: M, mascaraKb: Math.round(mascara / 1024) };
    const c = (ok, txt) => { if (!ok) mal.push(`${id}: ${txt}`); };
    c(A.triTotal <= TOPE.tri, `${A.triTotal} triángulos (tope ${TOPE.tri})`);
    c((A.tri.Body || 0) <= TOPE.triCuerpo, `cuerpo de ${A.tri.Body} triángulos (tope ${TOPE.triCuerpo})`);
    c(M.bytes / 1048576 <= TOPE.mbMovil, `${mb(M.bytes)} MB en el teléfono (tope ${TOPE.mbMovil})`);
    c(A.bytes / 1048576 <= TOPE.mbAlta, `${mb(A.bytes)} MB en alta (tope ${TOPE.mbAlta})`);
    c(M.texMax <= TOPE.texMovil, `textura de ${M.texMax} px en el teléfono (tope ${TOPE.texMovil})`);
    c(A.texMax <= TOPE.texAlta, `textura de ${A.texMax} px en alta (tope ${TOPE.texAlta})`);
    c(A.huesos <= TOPE.huesos, `${A.huesos} huesos (tope ${TOPE.huesos})`);
    c(A.morphs <= TOPE.morphs, `${A.morphs} morphs (tope ${TOPE.morphs})`);
    c(sale[id].mascaraKb <= TOPE.mascaraKb, `máscaras de ${sale[id].mascaraKb} KB (tope ${TOPE.mascaraKb})`);
    c(A.triTotal === M.triTotal, 'el modelo del teléfono no tiene la misma malla que el de alta');
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(sale, null, 1));
  else {
    console.log('pesista    triáng.  cuerpo   pelo  huesos morphs  alta MB  tel. MB  tex alta  tex tel.  máscaras KB');
    for (const id of ids) {
      const { alta: A, movil: M, mascaraKb } = sale[id];
      console.log(`${id.padEnd(10)} ${String(A.triTotal).padStart(7)} ${String(A.tri.Body || 0).padStart(7)} ${String(A.tri.Hair || 0).padStart(6)} ${String(A.huesos).padStart(7)} ${String(A.morphs).padStart(6)} ${mb(A.bytes).padStart(8)} ${mb(M.bytes).padStart(8)} ${String(A.texMax).padStart(9)} ${String(M.texMax).padStart(9)} ${String(mascaraKb).padStart(12)}`);
    }
    const A = sale[ids[0]].alta;
    console.log(`\nmateriales (${ids[0]}): ${A.materiales.join(', ')}`);
    console.log(`texturas (${ids[0]}, alta): ${A.tex.map(t => `${t.nombre} ${t.w}×${t.h} ${t.formato} ${t.kb} KB`).join(' · ')}`);
    console.log(`triángulos por material (${ids[0]}): ${Object.entries(A.tri).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }
  if (mal.length) { console.error('\nFALLÓ el presupuesto:\n  ' + mal.join('\n  ')); process.exit(1); }
  console.log('\nOK presupuesto de modelos');
}
