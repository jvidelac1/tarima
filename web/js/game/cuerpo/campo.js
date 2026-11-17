// Campo implícito del cuerpo: una lista ordenada de primitivas (elipsoides, husos, cajas redondeadas) que se suman con unión
// suave (o se restan: surcos y cuencas). `d(x, y, z)` es la distancia aproximada con signo a la superficie (negativa adentro).
// Cada primitiva lleva además su material y su función de pesos de piel; `detalle()` dice cuáles dominan en un punto.
// Sin dependencias: corre en Node y en el navegador.
import { nor, cruz, perp, sub, dot } from './algebra.js';

const LEJOS = 1;
export class Campo {
  constructor() { this.P = []; this.ii = new Int32Array(256); this.di = new Float32Array(256); this.M = null; this.base = {}; }
  /** Mientras `M` (matriz 4×4) esté puesta, los puntos y ejes de las primitivas nuevas pasan por ella (p. ej. la zapatilla, que se escribe en reposo y va al pie). */
  _p(p) { const M = this.M; return M ? [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]] : p; }
  _v(p) { const M = this.M; return M ? [M[0] * p[0] + M[4] * p[1] + M[8] * p[2], M[1] * p[0] + M[5] * p[1] + M[9] * p[2], M[2] * p[0] + M[6] * p[1] + M[10] * p[2]] : p; }
  _add(q, o) { o = { ...this.base, ...o }; q.k = o.k ?? .012; q.op = o.resta ? 1 : 0; q.mat = o.mat ?? 0; q.piel = o.piel ?? null; q.sig = o.sig ?? .008; q.nombre = o.nombre || ''; q.color = o.color ?? null; this.P.push(q); return q; }
  /** Elipsoide de centro `c` y radios `r` sobre los ejes `o.ejes` ([ex, ey, ez], por defecto los del mundo). */
  elip(c, r, o = {}) { c = this._p(c); const E = (o.ejes || [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).map(e => this._v(e)), R = typeof r === 'number' ? [r, r, r] : r; return this._elip(c, R, E, o); }
  _elip(c, R, E, o) { const _ = o.ejes || 0;
    return this._add({ t: 0, cx: c[0], cy: c[1], cz: c[2], rx: R[0], ry: R[1], rz: R[2], e0: E[0], e1: E[1], e2: E[2], rmin: Math.min(R[0], R[1], R[2]) }, o); }
  /**
   * Huso: de `a` a `b`, con radio `R[0]` en a, `R[1]` en la fracción `o.tm` del largo y `R[2]` en b (un número: cápsula).
   * Sección elíptica: el radio se multiplica por `o.sn` en la dirección `o.n` (perpendicular al eje) y por `o.sw` en la otra.
   * `o.forma`: 0 perfil redondo (como una elipse), 1 seno, 2 fusiforme (puntas afinadas).
   */
  huso(a, b, R, o = {}) {
    a = this._p(a); b = this._p(b); if (o.n) o = { ...o, n: this._v(o.n) };
    const [ra, rm, rb] = typeof R === 'number' ? [R, R, R] : R, ab = sub(b, a), L2 = dot(ab, ab) || 1e-12, u = nor(ab);
    let n = o.n ? perp(o.n, u) : perp(Math.abs(u[1]) < .9 ? [0, 1, 0] : [1, 0, 0], u); const w = cruz(u, n), sn = o.sn ?? 1, sw = o.sw ?? 1;
    return this._add({ t: o.losa ? 3 : 1, hy: (o.losa || 0) - (o.r ?? 0), r: o.r ?? 0, ax: a[0], ay: a[1], az: a[2], bx: ab[0], by: ab[1], bz: ab[2], il2: 1 / L2, ra, rm, rb, tm: o.tm ?? .5, forma: o.forma ?? 1,
      nx: n[0], ny: n[1], nz: n[2], wx: w[0], wy: w[1], wz: w[2], ux: u[0], uy: u[1], uz: u[2], isn: 1 / sn, isw: 1 / sw, esc: Math.min(sn, sw, 1), rmax: Math.max(ra, rm, rb) * Math.max(sn, sw, 1) }, o);
  }
  /** Caja redondeada de centro `c`, medios lados `m` y radio de borde `o.r`, sobre los ejes `o.ejes`. */
  caja(c, m, o = {}) { c = this._p(c); const E = (o.ejes || [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).map(e => this._v(e)), r = o.r ?? .005;
    return this._add({ t: 2, cx: c[0], cy: c[1], cz: c[2], mx: m[0] - r, my: m[1] - r, mz: m[2] - r, r, e0: E[0], e1: E[1], e2: E[2] }, o); }

  _d(q, x, y, z) {
    if (q.t === 3) {      // losa: el perfil del huso en el plano perpendicular a `n`, extruido ±hy con el borde redondeado
      const px = x - q.ax, py = y - q.ay, pz = z - q.az, h = px * q.nx + py * q.ny + pz * q.nz; let t = (px * q.bx + py * q.by + pz * q.bz) * q.il2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const vx = px - q.bx * t, vy = py - q.by * t, vz = pz - q.bz * t, vw = vx * q.wx + vy * q.wy + vz * q.wz, vu = vx * q.ux + vy * q.uy + vz * q.uz;
      let r, s; if (t < q.tm) { s = t / q.tm; r = q.ra; } else { s = (1 - t) / (1 - q.tm); r = q.rb; }
      s = q.forma === 0 ? Math.sqrt(1 - (1 - s) * (1 - s)) : q.forma === 1 ? Math.sin(s * 1.5707963) : s * s * (3 - 2 * s);
      const d2 = Math.sqrt(vw * vw + vu * vu) - (r + (q.rm - r) * s) + q.r, dy = Math.abs(h) - q.hy, ox = d2 > 0 ? d2 : 0, oy = dy > 0 ? dy : 0;
      return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(d2, dy), 0) - q.r;
    }
    if (q.t === 1) {
      const px = x - q.ax, py = y - q.ay, pz = z - q.az; let t = (px * q.bx + py * q.by + pz * q.bz) * q.il2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const vx = px - q.bx * t, vy = py - q.by * t, vz = pz - q.bz * t;
      const vn = (vx * q.nx + vy * q.ny + vz * q.nz) * q.isn, vw = (vx * q.wx + vy * q.wy + vz * q.wz) * q.isw, vu = vx * q.ux + vy * q.uy + vz * q.uz;
      let r, s; if (t < q.tm) { s = t / q.tm; r = q.ra; } else { s = (1 - t) / (1 - q.tm); r = q.rb; }
      s = q.forma === 0 ? Math.sqrt(1 - (1 - s) * (1 - s)) : q.forma === 1 ? Math.sin(s * 1.5707963) : s * s * (3 - 2 * s);
      return (Math.sqrt(vn * vn + vw * vw + vu * vu) - (r + (q.rm - r) * s)) * q.esc;
    }
    const px = x - q.cx, py = y - q.cy, pz = z - q.cz, e0 = q.e0, e1 = q.e1, e2 = q.e2;
    const lx = px * e0[0] + py * e0[1] + pz * e0[2], ly = px * e1[0] + py * e1[1] + pz * e1[2], lz = px * e2[0] + py * e2[1] + pz * e2[2];
    if (q.t === 0) {
      const ax = lx / q.rx, ay = ly / q.ry, az = lz / q.rz, k0 = Math.sqrt(ax * ax + ay * ay + az * az); if (k0 < 1e-6) return -q.rmin;
      const bx = ax / q.rx, by = ay / q.ry, bz = az / q.rz; return k0 * (k0 - 1) / Math.sqrt(bx * bx + by * by + bz * bz);
    }
    const qx = Math.abs(lx) - q.mx, qy = Math.abs(ly) - q.my, qz = Math.abs(lz) - q.mz, ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - q.r;
  }
  _caja(q) {
    if (q.t === 1 || q.t === 3) { const r = q.t === 3 ? Math.max(q.rmax, q.hy + q.r) : q.rmax, a = [q.ax, q.ay, q.az], b = [q.ax + q.bx, q.ay + q.by, q.az + q.bz]; return [a.map((v, i) => Math.min(v, b[i]) - r), a.map((v, i) => Math.max(v, b[i]) + r)]; }
    const R = q.t === 0 ? [q.rx, q.ry, q.rz] : [q.mx + q.r, q.my + q.r, q.mz + q.r], c = [q.cx, q.cy, q.cz];
    const ext = [0, 1, 2].map(i => q.t === 0 ? Math.hypot(R[0] * q.e0[i], R[1] * q.e1[i], R[2] * q.e2[i]) : Math.abs(R[0] * q.e0[i]) + Math.abs(R[1] * q.e1[i]) + Math.abs(R[2] * q.e2[i]));
    return [c.map((v, i) => v - ext[i]), c.map((v, i) => v + ext[i])];
  }
  /** Arma la aceleración espacial (celdas de `celda` metros con la lista ordenada de primitivas que las tocan). */
  preparar(celda = .025, margen = .022) {
    const P = this.P, cajas = P.map(q => { const [a, b] = this._caja(q), m = q.op ? q.k + .004 : q.k + margen; return [a.map(v => v - m), b.map(v => v + m)]; });
    const lo = [9, 9, 9], hi = [-9, -9, -9]; for (const [a, b] of cajas) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); }
    this.lo = lo; this.hi = hi; this.ic = 1 / celda; const n = this.n = [0, 1, 2].map(i => Math.max(1, Math.ceil((hi[i] - lo[i]) / celda)));
    const tmp = new Array(n[0] * n[1] * n[2]);
    cajas.forEach(([a, b], idx) => { const i0 = a.map((v, i) => Math.max(0, Math.floor((v - lo[i]) / celda))), i1 = b.map((v, i) => Math.min(n[i] - 1, Math.floor((v - lo[i]) / celda)));
      for (let z = i0[2]; z <= i1[2]; z++) for (let y = i0[1]; y <= i1[1]; y++) for (let x = i0[0]; x <= i1[0]; x++) { const c = (z * n[1] + y) * n[0] + x; (tmp[c] ||= []).push(idx); } });
    this.celdas = tmp.map(l => l ? Int32Array.from(l) : null); let mx = 0; for (const l of this.celdas) if (l && l.length > mx) mx = l.length;
    if (mx > this.ii.length) { this.ii = new Int32Array(mx); this.di = new Float32Array(mx); }
    return this;
  }
  _celda(x, y, z) { const n = this.n, lo = this.lo, i = Math.floor((x - lo[0]) * this.ic), j = Math.floor((y - lo[1]) * this.ic), k = Math.floor((z - lo[2]) * this.ic);
    return i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2] ? null : this.celdas[(k * n[1] + j) * n[0] + i]; }
  /** Distancia con signo (aprox.) al cuerpo. */
  d(x, y, z) {
    const B = this._celda(x, y, z); if (!B) return LEJOS; const P = this.P; let v = LEJOS;
    for (let n = 0; n < B.length; n++) { const q = P[B[n]], k = q.k; let d = this._d(q, x, y, z);
      if (q.op === 0) { if (d < v + k) { const h = k - Math.abs(v - d); v = (d < v ? d : v) - (h > 0 ? h * h * .25 / k : 0); } }
      else { d = -d; if (d > v - k) { const h = k - Math.abs(v - d); v = (d > v ? d : v) + (h > 0 ? h * h * .25 / k : 0); } } }
    return v;
  }
  /** Primitivas (de unión) cerca del punto: deja sus índices en `ii` y sus distancias en `di`; devuelve cuántas. */
  detalle(x, y, z) { const B = this._celda(x, y, z); if (!B) return 0; const P = this.P; let m = 0; for (let n = 0; n < B.length; n++) { const q = P[B[n]]; if (q.op) continue; this.ii[m] = B[n]; this.di[m++] = this._d(q, x, y, z); } return m; }
  grad(x, y, z, e, out) { out[0] = this.d(x + e, y, z) - this.d(x - e, y, z); out[1] = this.d(x, y + e, z) - this.d(x, y - e, z); out[2] = this.d(x, y, z + e) - this.d(x, y, z - e); const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l; return l / (2 * e); }
}
