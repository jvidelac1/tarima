// Mallado del campo implícito: redes de superficie (surface nets) sobre una grilla de paso `h`, y después cada vértice se
// proyecta sobre la superficie verdadera del campo (Newton) y toma la normal del gradiente: la malla queda lisa aunque la
// grilla sea gruesa. Un bloque es una caja con su paso; `dentro(x, y, z)` filtra los triángulos (bloques que se solapan).
export function mallar(campo, { h, caja, dentro = null, iter = 3 }) {
  const [lo, hi] = caja, nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1, nxy = nx * ny;
  const V = new Float32Array(nx * ny * nz);
  for (let k = 0, o = 0; k < nz; k++) { const z = lo[2] + k * h; for (let j = 0; j < ny; j++) { const y = lo[1] + j * h; for (let i = 0; i < nx; i++, o++) V[o] = campo.d(lo[0] + i * h, y, z); } }
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, vert = new Int32Array(cx * cy * cz).fill(-1), pos = [], esq = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const AR = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const o = (k * ny + j) * nx + i; let m = 0; for (let c = 0; c < 8; c++) if (V[o + esq[c]] < 0) m |= 1 << c; if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of AR) { const va = V[o + esq[a]], vb = V[o + esq[b]]; if ((va < 0) === (vb < 0)) continue; const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++; }
    vert[(k * cy + j) * cx + i] = pos.length / 3; pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  // proyección sobre la superficie verdadera y normal del gradiente
  const nv = pos.length / 3, P = new Float32Array(pos), N = new Float32Array(nv * 3), g = [0, 0, 0], e = Math.min(.0008, h * .25);
  for (let v = 0; v < nv; v++) { let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    for (let it = 0; it < iter; it++) { const d = campo.d(x, y, z), m = campo.grad(x, y, z, e, g), paso = Math.max(-h, Math.min(h, d / Math.max(m, .3))); x -= g[0] * paso; y -= g[1] * paso; z -= g[2] * paso; }
    campo.grad(x, y, z, e, g); P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2]; }
  // caras: un cuadrilátero por cada arista de la grilla que cruza la superficie
  const ind = [], cv = (i, j, k) => vert[(k * cy + j) * cx + i];
  const quad = (a, b, c, d, inv) => { if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (dentro) { const x = (P[a * 3] + P[c * 3]) * .5, y = (P[a * 3 + 1] + P[c * 3 + 1]) * .5, z = (P[a * 3 + 2] + P[c * 3 + 2]) * .5; if (!dentro(x, y, z)) return; }
    const d2 = (p, q) => (P[p * 3] - P[q * 3]) ** 2 + (P[p * 3 + 1] - P[q * 3 + 1]) ** 2 + (P[p * 3 + 2] - P[q * 3 + 2]) ** 2;
    if (d2(a, c) <= d2(b, d)) { if (inv) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d); } else { if (inv) ind.push(b, a, d, b, d, c); else ind.push(a, b, d, b, c, d); } };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const o = (k * ny + j) * nx + i, v0 = V[o] < 0;
    if (v0 !== (V[o + 1] < 0)) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), !v0);
    if (v0 !== (V[o + nx] < 0)) quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), !v0);
    if (v0 !== (V[o + nxy] < 0)) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), !v0);
  }
  // se sueltan los vértices sin cara
  const usa = new Int32Array(nv).fill(-1); let m = 0; for (const i of ind) if (usa[i] < 0) usa[i] = m++;
  const P2 = new Float32Array(m * 3), N2 = new Float32Array(m * 3); for (let v = 0; v < nv; v++) { const u = usa[v]; if (u < 0) continue; for (let c = 0; c < 3; c++) { P2[u * 3 + c] = P[v * 3 + c]; N2[u * 3 + c] = N[v * 3 + c]; } }
  return { pos: P2, nor: N2, ind: Uint32Array.from(ind, i => usa[i]) };
}
