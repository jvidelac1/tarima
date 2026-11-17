// Álgebra mínima del cuerpo por código: vectores como [x, y, z] y matrices 4×4 por columnas (como three y glTF). Sin dependencias.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const mad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]);
export const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Componente de `v` perpendicular a `u` (unitario), normalizada. */
export const perp = (v, u) => nor(mad(v, u, -dot(v, u)));
export const mmul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
/** Inversa de una matriz afín. */
export function minv(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10], A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, k = 1 / (a * A + b * B + c * C);
  const r = [A * k, B * k, C * k, 0, (c * h - b * i) * k, (a * i - c * g) * k, (b * g - a * h) * k, 0, (b * f - c * e) * k, (c * d - a * f) * k, (a * e - b * d) * k, 0, 0, 0, 0, 1];
  r[12] = -(r[0] * m[12] + r[4] * m[13] + r[8] * m[14]); r[13] = -(r[1] * m[12] + r[5] * m[13] + r[9] * m[14]); r[14] = -(r[2] * m[12] + r[6] * m[13] + r[10] * m[14]); return r;
}
/** Giro de `ang` radianes alrededor del eje unitario `e` que pasa por el punto `p`. */
export function giroEn(p, e, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, [x, y, z] = e;
  const R = [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
  R[12] = p[0] - (R[0] * p[0] + R[4] * p[1] + R[8] * p[2]); R[13] = p[1] - (R[1] * p[0] + R[5] * p[1] + R[9] * p[2]); R[14] = p[2] - (R[2] * p[0] + R[6] * p[1] + R[10] * p[2]); return R;
}
export const mpos = m => [m[12], m[13], m[14]];
/** Ejes de un giro por ángulos (grados) alrededor de x, después y, después z: devuelve [ex, ey, ez] (las columnas). */
export function ejesXYZ(gx = 0, gy = 0, gz = 0) {
  const r = Math.PI / 180, cx = Math.cos(gx * r), sx = Math.sin(gx * r), cy = Math.cos(gy * r), sy = Math.sin(gy * r), cz = Math.cos(gz * r), sz = Math.sin(gz * r);
  // R = Rz · Ry · Rx
  return [[cz * cy, sz * cy, -sy], [cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx], [cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx]];
}
