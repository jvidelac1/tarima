// Comprime los modelos de web/models para la descarga. Se corre después de tools/export_web.py (build.sh lo hace solo).
// Uso: tools/comprimir_modelos.sh [ventura brenner] [--forzar]   (el .sh instala las dependencias fijadas y llama a este archivo)
//
// Por personaje, a partir del GLB que deja export_web.py (sin comprimir):
//  - <nombre>.glb       geometría y animación con EXT_meshopt_compression; las texturas, byte por byte las mismas. Lo usan el
//                       visor y el juego con calidad Alta o Media (texturas de hasta 2048 px).
//  - <nombre>_1024.glb  lo mismo, con las texturas a 1024 px como máximo: el juego con calidad Baja o Móvil (la de arranque en
//                       automático) ya las achicaba a 1024 al cargar (Athlete.load con maxTex 1024, en un lienzo); ahora viene
//                       hecho. Color, pelo y pestañas en WebP (EXT_texture_webp, alfa sin pérdida); normal y ORM en JPEG 4:4:4
//                       con la calidad de export_web.py (el WebP con pérdida submuestrea el croma y mezclaría los canales).
//  - <nombre>_mask.webp la máscara (R piel, G tela, B pelo) a 1024 px, sin pérdida: athlete.js nunca la usa más grande
//                       (MASK_MAX). Reemplaza al PNG.
//  - web/data/poses.json: `mask` apunta al WebP y `glb1024` al GLB liviano.
//
// Cómo se comprime la geometría (sin gltf-transform: se reescribe el GLB a mano para controlar cada accesor):
//  - Cada accesor va a su propio bufferView comprimido con el códec de meshopt (versión 0, la de EXT_meshopt_compression).
//  - Los float32 (posiciones, normales, UV, pesos, morphs, claves de animación) pasan por el filtro exponencial: siguen siendo
//    float32 al decodificar, con una grilla fija por componente (ver BITS: error de micrones en posiciones, de millonésimas
//    en rotaciones). No se usa KHR_mesh_quantization: cuantizar posiciones obliga a meter una escala en las matrices inversas
//    de enlace y athlete.js las usa (correctivos de brazos) y mide metros por unidad de UV sobre la malla.
//    Con BITS de abajo: posiciones a menos de 0,05 mm, normales a 0,03°, UV a 0,06 texel de 2048, rotaciones a 0,002°.
//  - Sin pérdida: índices, JOINTS, tiempos de las claves y matrices inversas de enlace.
//  - Las primitivas opacas se reordenan para la caché de vértices (mismos triángulos, otro orden: comprime mucho mejor). Las
//    de mezcla alfa (pelo y pestañas) no: el pelo es una primitiva en capas y el orden de sus triángulos es el de dibujo.
//  - Nombres de nodos, huesos, materiales, morphs (extras.targetNames) y la acción 'Poses' no cambian.
//  - Después de codificar, se decodifica todo de nuevo y se mide el error contra el original (líneas ERR): falla si algo
//    sin pérdida no sale idéntico o si un error supera su tope.
//
// Variables: TARIMA_WEB (por defecto web/). --forzar: comprime aunque el GLB ya venga comprimido (no se hace por defecto:
// texturas y filtros se aplicarían dos veces).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = process.env.TARIMA_WEB || path.join(ROOT, 'web'), MODELS = path.join(WEB, 'models'), POSES = path.join(WEB, 'data', 'poses.json');
// las dependencias (sharp y meshoptimizer) las instala tools/comprimir_modelos.sh en una carpeta aparte: no van en package.json
// porque sharp es pesado y las pruebas de Actions no las necesitan
const MODS = process.env.TARIMA_GLTF_MODULES; if (!MODS) { console.error('Falta TARIMA_GLTF_MODULES: corré tools/comprimir_modelos.sh'); process.exit(2); }
const req = createRequire(path.join(MODS, 'package.json'));
const { MeshoptEncoder, MeshoptDecoder } = req('meshoptimizer');
const sharp = req('sharp');

const args = process.argv.slice(2), FORZAR = args.includes('--forzar'), NAMES = args.filter(a => !a.startsWith('--'));
const LADO = 1024;
// imagen -> calidad JPEG (la de SPEC en export_web.py), para las de datos; el resto va en WebP
const JPEG = { body_normal: 90, body_orm: 86, shoe_normal: 90, shoe_orm: 84, belt_normal: 90, belt_orm: 84 };
const WEBP_Q = 90;
// bits de mantisa del filtro exponencial por uso, con modo SharedComponent (un exponente por componente para todo el accesor:
// equivale a una grilla fija de max|x|·2^(1−bits)), y el error máximo tolerado relativo a ese máximo
const BITS = { POSITION: 16, NORMAL: 12, TEXCOORD: 16, WEIGHTS: 14, 'target POSITION': 16, 'target NORMAL': 14, translation: 18, rotation: 16, scale: 18 };

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const MB = n => (n / 1e6).toFixed(2) + ' MB', KB = n => (n / 1e3).toFixed(0) + ' KB';
const CS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const pad4 = n => (n + 3) & ~3;

function leerGlb(file) {
  const d = fs.readFileSync(file); if (d.readUInt32LE(0) !== 0x46546C67) throw new Error(file + ': no es un GLB');
  const jl = d.readUInt32LE(12), J = JSON.parse(d.subarray(20, 20 + jl)); const o = 20 + jl, bl = d.readUInt32LE(o);
  return { J, B: d.subarray(o + 8, o + 8 + bl) };
}
function escribirGlb(J, bin) {
  let js = Buffer.from(JSON.stringify(J)); js = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc(pad4(bin.length) - bin.length)]), h = Buffer.alloc(12), hj = Buffer.alloc(8), hb = Buffer.alloc(8);
  h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + b.length, 8);
  hj.writeUInt32LE(js.length, 0); hj.writeUInt32LE(0x4E4F534A, 4); hb.writeUInt32LE(b.length, 0); hb.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([h, hj, js, hb, b]);
}
const usaExt = (J, e) => (J.extensionsUsed || []).includes(e);
const vista = (J, B, i) => { const v = J.bufferViews[i]; if ((v.buffer ?? 0) !== 0) throw new Error('bufferView fuera del BIN'); return B.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };

/** Uso de cada accesor: 'indices', 'POSITION', 'target NORMAL', 'rotation', 'input', 'ibm'... */
function usos(J) {
  const u = new Map(), pon = (i, x) => { if (i === undefined) return; const a = u.get(i); u.set(i, a && a !== x ? 'mixto' : x); };
  for (const m of J.meshes || []) for (const p of m.primitives) {
    for (const [k, i] of Object.entries(p.attributes)) pon(i, k.replace(/_\d+$/, ''));
    pon(p.indices, 'indices'); for (const t of p.targets || []) for (const [k, i] of Object.entries(t)) pon(i, 'target ' + k.replace(/_\d+$/, ''));
  }
  for (const s of J.skins || []) pon(s.inverseBindMatrices, 'ibm');
  for (const a of J.animations || []) for (const c of a.channels) { const s = a.samplers[c.sampler]; pon(s.input, 'input'); pon(s.output, c.target.path); }
  return u;
}

/** Reescribe el GLB: un bufferView comprimido por accesor, las imágenes tal cual (o las que vengan en `imagenes`). */
function comprimir(J0, B0, imagenes = new Map()) {
  const J = structuredClone(J0), U = usos(J), partes = [], respaldo = { n: 0 }, errores = [];
  let off = 0; const agrega = buf => { const o = off; partes.push(buf, Buffer.alloc(pad4(buf.length) - buf.length)); off += pad4(buf.length); return o; };
  const vistas = [];
  // imágenes primero (las lee el navegador apenas llega el BIN)
  for (const [ii, im] of (J.images || []).entries()) {
    if (im.bufferView === undefined) continue;
    const nuevo = imagenes.get(ii), buf = nuevo ? nuevo.buf : vista(J0, B0, im.bufferView);
    if (nuevo) im.mimeType = nuevo.mime;
    vistas.push({ buffer: 0, byteOffset: agrega(buf), byteLength: buf.length }); im.bufferView = vistas.length - 1;
  }
  // 1) datos compactos de cada accesor (sin el stride de la vista original)
  const RAW = new Map();
  for (const [ai, a] of J.accessors.entries()) {
    if (a.bufferView === undefined && !a.sparse) continue;
    const el = CS[a.componentType] * NC[a.type], raw = Buffer.alloc(a.count * el);
    if (a.bufferView !== undefined) {
      const v0 = J0.bufferViews[a.bufferView], stride0 = v0.byteStride || el, src = vista(J0, B0, a.bufferView), o0 = a.byteOffset || 0;
      for (let k = 0; k < a.count; k++) src.copy(raw, k * el, o0 + k * stride0, o0 + k * stride0 + el);
    }
    // los morphs del exportador de Blender vienen dispersos: se pasan a densos (three los arma densos igual al cargar, y los
    // ceros del filtro exponencial casi no ocupan)
    if (a.sparse) {
      const s = a.sparse, iv = vista(J0, B0, s.indices.bufferView), vv = vista(J0, B0, s.values.bufferView), ics = CS[s.indices.componentType];
      for (let k = 0; k < s.count; k++) {
        const io = (s.indices.byteOffset || 0) + k * ics, idx = ics === 1 ? iv.readUInt8(io) : ics === 2 ? iv.readUInt16LE(io) : iv.readUInt32LE(io);
        vv.copy(raw, idx * el, (s.values.byteOffset || 0) + k * el, (s.values.byteOffset || 0) + (k + 1) * el);
      }
      delete a.sparse;
    }
    RAW.set(ai, raw);
  }
  // 2) primitivas opacas: triángulos en el orden de la caché de vértices y vértices en el orden de uso (comprime mucho mejor).
  //    Las de mezcla alfa (pelo y pestañas, en capas) no se tocan: su orden de triángulos es su orden de dibujo.
  const cuenta = new Map(); for (const m of J.meshes) for (const p of m.primitives) for (const i of [p.indices, ...Object.values(p.attributes), ...(p.targets || []).flatMap(t => Object.values(t))]) cuenta.set(i, (cuenta.get(i) || 0) + 1);
  let reordenadas = 0;
  for (const m of J.meshes) for (const p of m.primitives) {
    const mat = J.materials?.[p.material], todos = [...Object.values(p.attributes), ...(p.targets || []).flatMap(t => Object.values(t))];
    if (p.indices === undefined || (p.mode ?? 4) !== 4 || mat?.alphaMode === 'BLEND' || [p.indices, ...todos].some(i => cuenta.get(i) !== 1 || !RAW.has(i))) continue;
    const ia = J.accessors[p.indices], cs = CS[ia.componentType], ib = RAW.get(p.indices), n = J.accessors[todos[0]].count;
    const idx = new Uint32Array(ia.count); for (let k = 0; k < ia.count; k++) idx[k] = cs === 2 ? ib.readUInt16LE(k * 2) : cs === 1 ? ib.readUInt8(k) : ib.readUInt32LE(k * 4);
    const [remap, unico] = MeshoptEncoder.reorderMesh(idx, true, true);
    for (let k = 0; k < ia.count; k++) cs === 2 ? ib.writeUInt16LE(idx[k], k * 2) : cs === 1 ? ib.writeUInt8(idx[k], k) : ib.writeUInt32LE(idx[k], k * 4);
    for (const ai of todos) {
      const a = J.accessors[ai], el = CS[a.componentType] * NC[a.type], viejo = RAW.get(ai), nuevo = Buffer.alloc(unico * el);
      if (a.count !== n) throw new Error('primitiva con atributos de distinto largo');
      for (let k = 0; k < n; k++) if (remap[k] !== 0xffffffff) viejo.copy(nuevo, remap[k] * el, k * el, k * el + el);
      RAW.set(ai, nuevo); a.count = unico;
      if (a.min && a.max && !/^target/.test(U.get(ai))) { const nc = NC[a.type], f = new Float32Array(nuevo.buffer, nuevo.byteOffset, unico * nc); if (a.componentType === 5126) { a.min = a.min.map((_, c) => { let x = Infinity; for (let k = c; k < f.length; k += nc) x = Math.min(x, f[k]); return x; }); a.max = a.max.map((_, c) => { let x = -Infinity; for (let k = c; k < f.length; k += nc) x = Math.max(x, f[k]); return x; }); } }
    }
    reordenadas++;
  }
  comprimir.reordenadas = reordenadas;
  // 3) cada accesor a su bufferView comprimido
  for (const [ai, a] of J.accessors.entries()) {
    if (!RAW.has(ai)) continue;
    const uso = U.get(ai) || 'mixto', cs = CS[a.componentType], nc = NC[a.type], el = cs * nc, raw = RAW.get(ai);
    const vtx = !['indices', 'input', 'ibm', 'translation', 'rotation', 'scale', 'weights'].includes(uso) && uso !== 'mixto';
    let modo = 'ATTRIBUTES', filtro = 'NONE', tam = el, datos = raw;
    if (uso === 'indices') { modo = 'TRIANGLES'; if (a.count % 3) modo = 'INDICES'; }
    else if (el % 4) {      // el códec de atributos pide múltiplos de 4 bytes: se rellena el elemento (u8 VEC3, u16 VEC3)
      tam = pad4(el); datos = Buffer.alloc(a.count * tam); for (let k = 0; k < a.count; k++) raw.copy(datos, k * tam, k * el, k * el + el);
    }
    let bits = BITS[uso];
    // UV en mosaico (valores de varias unidades): la grilla es relativa al máximo, así que se suman los bits que hagan falta
    // para que el error absoluto siga siendo el de una UV entre 0 y 1
    if (bits && uso === 'TEXCOORD' && a.componentType === 5126) { const f = new Float32Array(raw.buffer, raw.byteOffset, a.count * nc); let m = 0; for (const x of f) m = Math.max(m, Math.abs(x)); bits = Math.min(24, bits + Math.max(0, Math.ceil(Math.log2(m || 1)))); }
    if (bits && a.componentType === 5126) {
      filtro = 'EXPONENTIAL';
      datos = Buffer.from(MeshoptEncoder.encodeFilterExp(new Float32Array(raw.buffer, raw.byteOffset, a.count * nc), a.count, el, bits, 'SharedComponent'));
    }
    const enc = Buffer.from(MeshoptEncoder.encodeGltfBuffer(new Uint8Array(datos.buffer, datos.byteOffset, datos.length), a.count, tam, modo));
    // verificación: se decodifica y se compara contra el original
    const dec = new Uint8Array(a.count * tam); MeshoptDecoder.decodeGltfBuffer(dec, a.count, tam, enc, modo, filtro);
    if (filtro === 'NONE') {
      if (modo === 'TRIANGLES') { const A = cs === 2 ? new Uint16Array(raw.buffer, raw.byteOffset, a.count) : new Uint32Array(raw.buffer, raw.byteOffset, a.count), D = cs === 2 ? new Uint16Array(dec.buffer, 0, a.count) : new Uint32Array(dec.buffer, 0, a.count);
        // el códec puede rotar los vértices dentro de cada triángulo (mismo triángulo, mismo sentido); el orden de triángulos se conserva
        for (let t = 0; t < a.count; t += 3) { const x = [A[t], A[t + 1], A[t + 2]], y = [D[t], D[t + 1], D[t + 2]]; if (![0, 1, 2].some(r => x.every((q, j) => q === y[(j + r) % 3]))) { errores.push(`accesor ${ai} (${uso}): triángulo ${t / 3} distinto`); break; } }
      } else for (let k = 0; k < a.count; k++) if (Buffer.compare(Buffer.from(dec.buffer, k * tam, el), raw.subarray(k * el, k * el + el))) { errores.push(`accesor ${ai} (${uso}): elemento ${k} distinto`); break; }
    } else {
      const A = new Float32Array(raw.buffer, raw.byteOffset, a.count * nc), D = new Float32Array(dec.buffer, 0, a.count * nc), mx = new Array(nc).fill(0), er = new Array(nc).fill(0);
      for (let k = 0; k < A.length; k++) { const c = k % nc; mx[c] = Math.max(mx[c], Math.abs(A[k])); er[c] = Math.max(er[c], Math.abs(A[k] - D[k])); }
      const rel = Math.max(...er.map((e, c) => mx[c] ? e / mx[c] : e)), tope = 2 ** (1 - bits);
      if (!(rel <= tope)) errores.push(`accesor ${ai} (${uso}): error relativo ${rel.toExponential(2)} > ${tope.toExponential(2)}`);
      (comprimir.err[uso] ||= { abs: 0, rel: 0 }); comprimir.err[uso].abs = Math.max(comprimir.err[uso].abs, ...er); comprimir.err[uso].rel = Math.max(comprimir.err[uso].rel, rel);
    }
    const bo = agrega(enc), ro = respaldo.n; respaldo.n += pad4(a.count * tam);
    const bv = { buffer: 1, byteOffset: ro, byteLength: a.count * tam, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: bo, byteLength: enc.length, byteStride: tam, count: a.count, mode: modo, ...(filtro !== 'NONE' ? { filter: filtro } : {}) } } };
    if (vtx) { bv.byteStride = tam; bv.target = 34962; } else if (uso === 'indices') bv.target = 34963;
    vistas.push(bv); a.bufferView = vistas.length - 1; delete a.byteOffset;
  }
  J.bufferViews = vistas;
  J.buffers = [{ byteLength: off }, { byteLength: respaldo.n, extensions: { EXT_meshopt_compression: { fallback: true } } }];
  for (const k of ['extensionsUsed', 'extensionsRequired']) J[k] = [...new Set([...(J[k] || []), 'EXT_meshopt_compression'])];
  if (errores.length) throw new Error('la verificación de la compresión falló:\n  ' + errores.join('\n  '));
  return escribirGlb(J, Buffer.concat(partes));
}
comprimir.err = {};

/** Texturas a 1024 px como máximo: Map(índice de imagen -> {buf, mime}) y cambios en J (EXT_texture_webp). */
async function texturas1024(J, B) {
  const nuevas = new Map(), log = [], webp = new Set();
  for (const [ii, im] of (J.images || []).entries()) {
    if (im.bufferView === undefined) continue;
    const img = vista(J, B, im.bufferView), nm = (im.name || '').replace(/\.[a-z]+$/i, ''), meta = await sharp(img).metadata();
    const lado = Math.max(meta.width, meta.height), chico = lado > LADO, w = chico ? Math.round(meta.width * LADO / lado) : meta.width, h = chico ? Math.round(meta.height * LADO / lado) : meta.height;
    let s = sharp(img); if (chico) s = s.resize({ width: w, height: h, kernel: 'lanczos3' });
    let buf = null, mime = null;
    if (JPEG[nm] !== undefined) { if (chico) { buf = await s.jpeg({ quality: JPEG[nm], chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer(); mime = 'image/jpeg'; } }
    else if (chico || im.mimeType === 'image/png') { buf = await s.webp({ quality: WEBP_Q, alphaQuality: 100, smartSubsample: true, effort: 6 }).toBuffer(); mime = 'image/webp'; webp.add(ii); }
    if (buf) { nuevas.set(ii, { buf, mime }); log.push(`${nm} ${meta.width}→${w} ${mime.slice(6)} ${KB(img.length)}→${KB(buf.length)}`); }
  }
  if (webp.size) {
    for (const t of J.textures || []) if (webp.has(t.source)) { t.extensions = { ...(t.extensions || {}), EXT_texture_webp: { source: t.source } }; delete t.source; }
    for (const k of ['extensionsUsed', 'extensionsRequired']) J[k] = [...new Set([...(J[k] || []), 'EXT_texture_webp'])];
  }
  return { nuevas, log };
}

const poses = JSON.parse(fs.readFileSync(POSES, 'utf8'));
const nombres = NAMES.length ? NAMES : Object.keys(poses);
let antes = 0, despues = 0;
for (const n of nombres) {
  const src = path.join(MODELS, n + '.glb'); if (!fs.existsSync(src)) { console.error(`no está ${src}`); process.exit(1); }
  const p0 = poses[n]; if (!p0) { console.error(`${n} no está en poses.json`); process.exit(1); }
  let { J, B } = leerGlb(src);
  if (usaExt(J, 'EXT_meshopt_compression')) {
    if (!FORZAR) {
      console.log(`${n}: ya comprimido, se saltea (export_web.py lo deja sin comprimir; --forzar para hacerlo igual)`);
      if (fs.existsSync(path.join(MODELS, n + '_mask.webp'))) p0.mask = `models/${n}_mask.webp`;
      if (fs.existsSync(path.join(MODELS, n + '_1024.glb'))) p0.glb1024 = `models/${n}_1024.glb`;
      continue;
    }
    throw new Error('--forzar sobre un GLB comprimido todavía no está hecho: volvé a correr tools/export_web.py');
  }
  const t0 = performance.now(), size0 = B.length + 0, file0 = fs.statSync(src).size; comprimir.err = {};
  const full = comprimir(J, B);
  const J1 = structuredClone(J), { nuevas, log } = await texturas1024(J1, B), lite = comprimir(J1, B, nuevas);
  const errs = Object.entries(comprimir.err).map(([k, e]) => `${k} ${e.abs.toExponential(1)} (${e.rel.toExponential(1)} del máximo)`).join(' · ');
  fs.writeFileSync(src, full); fs.writeFileSync(path.join(MODELS, n + '_1024.glb'), lite);
  // máscara
  let m0 = 0, m1 = 0;
  const maskPng = path.join(MODELS, n + '_mask.png'), maskWebp = path.join(MODELS, n + '_mask.webp');
  if (fs.existsSync(maskPng)) {
    m0 = fs.statSync(maskPng).size; const meta = await sharp(maskPng).metadata(), lado = Math.max(meta.width, meta.height);
    let s = sharp(maskPng); if (lado > LADO) s = s.resize({ width: Math.round(meta.width * LADO / lado), height: Math.round(meta.height * LADO / lado), kernel: 'lanczos3' });
    fs.writeFileSync(maskWebp, await s.removeAlpha().webp({ lossless: true, effort: 6 }).toBuffer()); fs.rmSync(maskPng); m1 = fs.statSync(maskWebp).size;
  }
  if (fs.existsSync(maskWebp)) p0.mask = `models/${n}_mask.webp`;
  p0.glb1024 = `models/${n}_1024.glb`;
  antes += file0 + m0; despues += lite.length + m1;
  console.log(`COMPRIMIR ${n}: ${n}.glb ${MB(file0)} → ${MB(full.length)} · ${n}_1024.glb ${MB(lite.length)}` + (m0 ? ` · máscara ${KB(m0)} → ${KB(m1)} (WebP sin pérdida, ${LADO} px)` : '') + ` · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  texturas del liviano: ${log.join(' · ')} · primitivas opacas reordenadas: ${comprimir.reordenadas}`);
  console.log(`  ERR (error máximo al decodificar, filtro exponencial; el resto sale idéntico): ${errs}`);
}
// poses.json se toca como texto (lo escribe export_web.py con el formato de Python): solo cambian `mask` y `glb1024`
let txt = fs.readFileSync(POSES, 'utf8');
for (const n of nombres) {
  const p0 = poses[n]; if (!p0?.glb1024) continue;
  if (p0.mask) txt = txt.replace(`"models/${n}_mask.png"`, `"${p0.mask}"`);
  if (!txt.includes(`"glb1024": "${p0.glb1024}"`)) {
    const m = txt.match(new RegExp(`\\n( *)"mask": "${p0.mask?.replace(/[.]/g, '\\.')}"`));
    if (m) txt = txt.replace(m[0], `${m[0]},\n${m[1]}"glb1024": "${p0.glb1024}"`);
  }
}
const vuelta = JSON.parse(txt);
if (JSON.stringify(vuelta) !== JSON.stringify(poses)) txt = JSON.stringify(poses, null, 1);      // formato inesperado: se reescribe entero
fs.writeFileSync(POSES, txt);
if (antes) console.log(`COMPRIMIR lo que baja el juego (GLB liviano + máscara, todos los personajes): ${MB(antes)} → ${MB(despues)}`);
