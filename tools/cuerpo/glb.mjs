// Lector mínimo de GLB para Node (sin three): nodos, piel, animación y mallas, con EXT_meshopt_compression.
// Lo usan las herramientas del cuerpo por código (tools/cuerpo/*.mjs) para sacar el esqueleto y las poses de un pesista.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from '../../web/vendor/three/addons/libs/meshopt_decoder.module.js';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TIPOS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export async function leerGlb(archivo) {
  await MeshoptDecoder.ready;
  const buf = fs.readFileSync(archivo), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nJ = dv.getUint32(12, true), json = JSON.parse(buf.subarray(20, 20 + nJ).toString('utf8'));
  const bin = buf.subarray(20 + nJ + 8);
  const vistas = new Map();
  const vista = i => {
    if (vistas.has(i)) return vistas.get(i);
    const bv = json.bufferViews[i], m = bv.extensions?.EXT_meshopt_compression; let out;
    if (m) { out = new Uint8Array(m.count * m.byteStride); MeshoptDecoder.decodeGltfBuffer(out, m.count, m.byteStride, bin.subarray(m.byteOffset || 0, (m.byteOffset || 0) + m.byteLength), m.mode, m.filter); }
    else out = new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength).slice();
    vistas.set(i, out); return out;
  };
  /** Accessor como Float32Array (normalizados convertidos) o entero si `crudo`. */
  const acc = (i, crudo = false) => {
    const a = json.accessors[i], T = TIPOS[a.componentType], nc = NCOMP[a.type], bv = json.bufferViews[a.bufferView], src = vista(a.bufferView);
    const paso = bv.byteStride || bv.extensions?.EXT_meshopt_compression?.byteStride || T.BYTES_PER_ELEMENT * nc, out = new (crudo ? T : Float32Array)(a.count * nc);
    const d = new DataView(src.buffer, src.byteOffset, src.byteLength), lee = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    const div = a.normalized && !crudo ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) { const v = d[lee]((a.byteOffset || 0) + k * paso + c * T.BYTES_PER_ELEMENT, true); out[k * nc + c] = div ? Math.max(-1, v / div) : v; }
    return out;
  };
  return { json, acc };
}

// ---- álgebra mínima (matrices 4×4 por columnas, como glTF y three) ----
export const m4 = {
  ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  trs(t, q, s = [1, 1, 1]) { const [x, y, z, w] = q; return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0, 2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; },
  /** Inversa de una matriz afín. */
  inv(m) { const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C, k = 1 / det;
    const r = [A * k, B * k, C * k, 0, (c * h - b * i) * k, (a * i - c * g) * k, (b * g - a * h) * k, 0, (b * f - c * e) * k, (c * d - a * f) * k, (a * e - b * d) * k, 0, 0, 0, 0, 1];
    r[12] = -(r[0] * m[12] + r[4] * m[13] + r[8] * m[14]); r[13] = -(r[1] * m[12] + r[5] * m[13] + r[9] * m[14]); r[14] = -(r[2] * m[12] + r[6] * m[13] + r[10] * m[14]); return r; },
};
const slerp = (a, b, u) => { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1; if (d < 0) { d = -d; s = -1; }
  let ka = 1 - u, kb = u; if (d < .9995) { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - u) * th) / sn; kb = Math.sin(u * th) / sn; }
  const o = [ka * a[0] + s * kb * b[0], ka * a[1] + s * kb * b[1], ka * a[2] + s * kb * b[2], ka * a[3] + s * kb * b[3]], n = Math.hypot(...o); return o.map(v => v / n); };

/**
 * Esqueleto y poses de un GLB de pesista. Devuelve
 *  { nombres[], padre[] (índice en la lista o -1), reposo[] (matriz de mundo de cada hueso en reposo, de las inversas de la piel),
 *    local[] ({t, q, s} de reposo), pose(t) → matrices de mundo de cada hueso en el instante t del clip 'Poses', t0, duracion }
 * Los nombres van sin el prefijo de Mixamo. La lista sigue el orden de `joints` de la piel.
 */
export async function esqueletoDe(archivo) {
  const { json, acc } = await leerGlb(archivo), skin = json.skins[0], J = skin.joints, ibm = acc(skin.inverseBindMatrices);
  const padreNodo = new Map(); json.nodes.forEach((n, i) => (n.children || []).forEach(c => padreNodo.set(c, i)));
  const nombres = J.map(i => json.nodes[i].name.replace(/^mixamorig:?/, '')), idx = new Map(J.map((n, i) => [n, i]));
  const padre = J.map(i => idx.has(padreNodo.get(i)) ? idx.get(padreNodo.get(i)) : -1);
  const local = J.map(i => { const n = json.nodes[i]; return { t: n.translation || [0, 0, 0], q: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }; });
  const reposo = J.map((_, k) => m4.inv(Array.from(ibm.subarray(k * 16, k * 16 + 16))));
  const inversas = J.map((_, k) => Array.from(ibm.subarray(k * 16, k * 16 + 16)));
  const an = json.animations.find(a => a.name === 'Poses') || json.animations[0], pistas = [];
  let t0 = Infinity, fin = 0;
  for (const ch of an.channels) { const k = idx.get(ch.target.node); if (k === undefined) continue; const s = an.samplers[ch.sampler], tiempos = acc(s.input), val = acc(s.output);
    pistas.push({ k, que: ch.target.path, tiempos, val }); t0 = Math.min(t0, tiempos[0]); fin = Math.max(fin, tiempos[tiempos.length - 1]); }
  const orden = nombres.map((_, i) => i).sort((a, b) => { const d = i => { let n = 0; for (let x = i; padre[x] >= 0; x = padre[x]) n++; return n; }; return d(a) - d(b); });
  /** Transformaciones locales en el instante t. */
  const locales = t => {
    const L = local.map(l => ({ t: l.t.slice(), q: l.q.slice(), s: l.s.slice() }));
    for (const p of pistas) { const T = p.tiempos, n = T.length, nc = p.que === 'rotation' ? 4 : 3; let i = 0; while (i < n - 2 && T[i + 1] <= t) i++;
      const u = n < 2 ? 0 : Math.min(1, Math.max(0, (t - T[i]) / (T[i + 1] - T[i]))), a = Array.from(p.val.subarray(i * nc, i * nc + nc)), b = n < 2 ? a : Array.from(p.val.subarray((i + 1) * nc, (i + 1) * nc + nc));
      const v = nc === 4 ? slerp(a, b, u) : a.map((x, c) => x + (b[c] - x) * u); if (p.que === 'rotation') L[p.k].q = v; else if (p.que === 'translation') L[p.k].t = v; else L[p.k].s = v; }
    return L;
  };
  const mundo = L => { const W = new Array(L.length); for (const i of orden) { const m = m4.trs(L[i].t, L[i].q, L[i].s); W[i] = padre[i] >= 0 ? m4.mul(W[padre[i]], m) : m; } return W; };
  return { json, acc, nombres, padre, local, reposo, inversas, orden, locales, mundo, pose: t => mundo(locales(t)), t0, duracion: fin };
}

/** Malla del GLB (todas las primitivas juntas) en reposo, con pesos: para dibujar al pesista actual con el rasterizador local. */
export async function mallaDe(archivo) {
  const { json, acc } = await leerGlb(archivo), partes = [];
  for (const m of json.meshes) for (const p of m.primitives) {
    partes.push({ material: json.materials[p.material]?.name, pos: acc(p.attributes.POSITION), nor: acc(p.attributes.NORMAL), ind: acc(p.indices, true), ji: acc(p.attributes.JOINTS_0, true), jw: acc(p.attributes.WEIGHTS_0) });
  }
  return partes;
}
