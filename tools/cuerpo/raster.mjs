// Rasterizador mínimo para la vista previa local del cuerpo por código (sin navegador ni GPU): triángulos con z-buffer,
// normales interpoladas, una luz clave, relleno y contraluz, y salida PNG (zlib). Sirve para iterar la forma en segundos.
import zlib from 'node:zlib';
import fs from 'node:fs';

export class Lienzo {
  constructor(w, h, fondo = [.82, .81, .83], ss = 2) { this.w = w * ss; this.h = h * ss; this.ss = ss; this.c = new Float32Array(this.w * this.h * 3); this.z = new Float32Array(this.w * this.h).fill(Infinity);
    for (let i = 0; i < this.w * this.h; i++) { this.c[i * 3] = fondo[0]; this.c[i * 3 + 1] = fondo[1]; this.c[i * 3 + 2] = fondo[2]; } }
  /**
   * Dibuja una malla en el recuadro [x, y, w, h] (píxeles de salida). cam: { giro (grados alrededor de y; 0 = de frente), alto (grados de picado),
   * centro [x, y, z], escala (px por metro) }. malla: { pos, nor, ind, color(v, out) }.
   */
  malla(m, cam, rect) {
    const ss = this.ss, [rx, ry, rw, rh] = rect.map(v => v * ss), g = cam.giro * Math.PI / 180, a = (cam.alto || 0) * Math.PI / 180, cg = Math.cos(g), sg = Math.sin(g), ca = Math.cos(a), sa = Math.sin(a), esc = cam.escala * ss, [ox, oy, oz] = cam.centro;
    const nv = m.pos.length / 3, X = new Float32Array(nv), Y = new Float32Array(nv), Z = new Float32Array(nv), L = new Float32Array(nv * 3), col = [0, 0, 0];
    const luz = (nx, ny, nz) => { const k = Math.max(0, nx * -.45 + ny * .55 + nz * .7), f = Math.max(0, nx * .7 + ny * .1 + nz * .35) * .28, c = Math.max(0, nx * .5 + ny * .5 - nz * .7) * .35, amb = .34 + .16 * ny; return [amb + k * .78 + f + c * .6, amb + k * .74 + f + c * .7, amb * 1.04 + k * .68 + f * 1.1 + c * .9]; };
    for (let i = 0; i < nv; i++) { const x = m.pos[i * 3] - ox, y = m.pos[i * 3 + 1] - oy, z = m.pos[i * 3 + 2] - oz, x1 = x * cg - z * sg, z1 = x * sg + z * cg, y2 = y * ca - z1 * sa, z2 = y * sa + z1 * ca;
      X[i] = rx + rw / 2 + x1 * esc; Y[i] = ry + rh / 2 - y2 * esc; Z[i] = -z2;
      const nx = m.nor[i * 3], ny = m.nor[i * 3 + 1], nz = m.nor[i * 3 + 2], n1 = nx * cg - nz * sg, nz1 = nx * sg + nz * cg, n2 = ny * ca - nz1 * sa, nz2 = ny * sa + nz1 * ca, l = luz(n1, n2, nz2);
      if (m.color) m.color(i, col); else col[0] = col[1] = col[2] = 1; const rim = Math.pow(1 - Math.min(1, Math.abs(nz2)), 3) * .12; L[i * 3] = col[0] * l[0] + (m.pixel ? 0 : rim); L[i * 3 + 1] = col[1] * l[1] + (m.pixel ? 0 : rim); L[i * 3 + 2] = col[2] * l[2] + (m.pixel ? 0 : rim); }
    const W = this.w, x0c = Math.max(0, rx), x1c = Math.min(W, rx + rw), y0c = Math.max(0, ry), y1c = Math.min(this.h, ry + rh), C = this.c, Zb = this.z;
    for (let t = 0; t < m.ind.length; t += 3) { const a = m.ind[t], b = m.ind[t + 1], c = m.ind[t + 2], ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (area >= 0 && !m.dosCaras) continue; if (area === 0) continue;
      const mnx = Math.max(x0c, Math.floor(Math.min(ax, bx, cx))), mxx = Math.min(x1c - 1, Math.ceil(Math.max(ax, bx, cx))), mny = Math.max(y0c, Math.floor(Math.min(ay, by, cy))), mxy = Math.min(y1c - 1, Math.ceil(Math.max(ay, by, cy))), ia = 1 / area;
      for (let py = mny; py <= mxy; py++) for (let px = mnx; px <= mxx; px++) { const qx = px + .5, qy = py + .5, w0 = ((bx - qx) * (cy - qy) - (by - qy) * (cx - qx)) * ia, w1 = ((cx - qx) * (ay - qy) - (cy - qy) * (ax - qx)) * ia, w2 = 1 - w0 - w1; if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * Z[a] + w1 * Z[b] + w2 * Z[c], o = py * W + px; if (z >= Zb[o]) continue; Zb[o] = z; if (m.pixel) { m.pixel(a, b, c, w0, w1, w2, col); C[o * 3] = col[0] * (w0 * L[a * 3] + w1 * L[b * 3] + w2 * L[c * 3]); C[o * 3 + 1] = col[1] * (w0 * L[a * 3 + 1] + w1 * L[b * 3 + 1] + w2 * L[c * 3 + 1]); C[o * 3 + 2] = col[2] * (w0 * L[a * 3 + 2] + w1 * L[b * 3 + 2] + w2 * L[c * 3 + 2]); continue; } C[o * 3] = w0 * L[a * 3] + w1 * L[b * 3] + w2 * L[c * 3]; C[o * 3 + 1] = w0 * L[a * 3 + 1] + w1 * L[b * 3 + 1] + w2 * L[c * 3 + 1]; C[o * 3 + 2] = w0 * L[a * 3 + 2] + w1 * L[b * 3 + 2] + w2 * L[c * 3 + 2]; } }
  }
  png(archivo) {
    const ss = this.ss, w = this.w / ss, h = this.h / ss, raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) s += this.c[((y * ss + j) * this.w + x * ss + i) * 3 + c]; raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(s / (ss * ss) * 255))); } }
    const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; }), crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
    const trozo = (tipo, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(tipo, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
    fs.writeFileSync(archivo, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ih), trozo('IDAT', zlib.deflateSync(raw, { level: 6 })), trozo('IEND', Buffer.alloc(0))]));
  }
}
