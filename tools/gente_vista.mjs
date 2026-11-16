// Vista previa de las personas por código (web/js/game/gente.js) sin navegador: un rasterizador mínimo con z-buffer que
// escribe un PPM. Sirve para mirar siluetas, pelo y gestos en segundos antes de mandar capturas a Actions.
//   node tools/gente_vista.mjs salida.ppm [frente|atras|lado]     (después: python3 -c "from PIL import Image; Image.open('salida.ppm').save('salida.png')")
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V3 = pathToFileURL(path.join(raiz, 'web/vendor/three/')).href;
register('data:text/javascript,' + encodeURIComponent(`const V = ${JSON.stringify(V3)};
export async function resolve(s, c, n) { if (s === 'three') return { url: V + 'build/three.module.js', shortCircuit: true }; if (s.startsWith('three/addons/')) return { url: V + 'addons/' + s.slice(13), shortCircuit: true }; return n(s, c); }`));
const { VARIANTES, armar } = await import(pathToFileURL(path.join(raiz, 'web/js/game/publico_gente.js')).href);
const out = process.argv[2] || 'gente.ppm', vista = process.argv[3] || 'frente';
const CAB = process.argv[4] === 'cabeza', X0 = CAB ? -.14 : -.45, XW = CAB ? .28 : .9, YB = CAB ? 1.08 : .4, YH = CAB ? .39 : 1.25;      // cuarto argumento «cabeza»: solo la cabeza, grande
const CW = CAB ? 288 : 144, CH = CAB ? 400 : 200, K = 2, cols = 8, filas = Math.ceil(VARIANTES.length / cols), W = cols * CW * K, H = filas * CH * K, img = new Float32Array(W * H * 3), zb = new Float32Array(W * H).fill(-1e9);
const COL = { esclera: [.56, .54, .52], iris: [.08, .05, .03], marco: [.03, .03, .03], piel: [.78, .56, .42], pelo: [.12, .09, .07], traje: [.2, .24, .34], ropa: [.5, .2, .2], camisa: [.85, .86, .9], corbata: [.4, .1, .12], pantalon: [.12, .13, .16], zapato: [.05, .05, .06], silla: [.2, .2, .25] };
const L1 = [0, .9, .44], L2 = [.5, -.15, .85].map(v => v / Math.hypot(.5, .15, .85));
VARIANTES.forEach((v, i) => {
  const ox = (i % cols) * CW * K, oy = Math.floor(i / cols) * CH * K;
  for (const { g, parte, sombra } of armar(v)) {
    const P = g.attributes.position, N = g.attributes.normal, ix = g.index.array, so = g.attributes.sombra, ti = g.attributes.tinte, c = COL[parte] || [.5, .5, .5];
    const pt = k => { let x = P.getX(k), y = P.getY(k), z = P.getZ(k), nx = N.getX(k), ny = N.getY(k), nz = N.getZ(k); if (vista === 'atras') { x = -x; z = -z; nx = -nx; nz = -nz; } else if (vista === 'lado') { [x, z] = [z, -x]; [nx, nz] = [nz, -nx]; }
      return { sx: ox + (x - X0) / XW * CW * K, sy: oy + (1 - (y - YB) / YH) * CH * K, z, n: [nx, ny, nz], s: so ? so.getX(k) : 1, t: ti ? [ti.getX(k), ti.getY(k), ti.getZ(k)] : null }; };
    for (let t = 0; t < ix.length; t += 3) {
      const a = pt(ix[t]), b = pt(ix[t + 1]), d = pt(ix[t + 2]), ar = (b.sx - a.sx) * (d.sy - a.sy) - (d.sx - a.sx) * (b.sy - a.sy); if (Math.abs(ar) < 1e-9) continue;
      const x0 = Math.max(ox, Math.floor(Math.min(a.sx, b.sx, d.sx))), x1 = Math.min(ox + CW * K - 1, Math.ceil(Math.max(a.sx, b.sx, d.sx))), y0 = Math.max(oy, Math.floor(Math.min(a.sy, b.sy, d.sy))), y1 = Math.min(oy + CH * K - 1, Math.ceil(Math.max(a.sy, b.sy, d.sy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w0 = ((b.sx - x) * (d.sy - y) - (d.sx - x) * (b.sy - y)) / ar, w1 = ((d.sx - x) * (a.sy - y) - (a.sx - x) * (d.sy - y)) / ar, w2 = 1 - w0 - w1; if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = a.z * w0 + b.z * w1 + d.z * w2, o = y * W + x; if (z <= zb[o]) continue; zb[o] = z;
        let n = [0, 1, 2].map(j => a.n[j] * w0 + b.n[j] * w1 + d.n[j] * w2); const l = Math.hypot(...n) || 1; n = n.map(q => q / l); if (n[2] < 0) n = n.map(q => -q);
        const s = a.s * w0 + b.s * w1 + d.s * w2, tt = a.t ? [0, 1, 2].map(j => a.t[j] * w0 + b.t[j] * w1 + d.t[j] * w2) : [1, 1, 1], luz = (.18 + .5 * Math.max(0, n[0] * L1[0] + n[1] * L1[1] + n[2] * L1[2]) + .55 * Math.max(0, n[0] * L2[0] + n[1] * L2[1] + n[2] * L2[2])) * s;
        img[o * 3] = c[0] * luz * tt[0]; img[o * 3 + 1] = c[1] * luz * tt[1]; img[o * 3 + 2] = c[2] * luz * tt[2];
      }
    }
  }
});
const w = W / K, h = H / K, buf = Buffer.alloc(w * h * 3);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) s += img[((y * K + j) * W + x * K + i) * 3 + c] || .06 * (zb[(y * K + j) * W + x * K + i] < -1e8 ? 1 : 0); buf[(y * w + x) * 3 + c] = Math.min(255, Math.round(255 * Math.pow(Math.min(1, s / (K * K)), 1 / 2.2))); }
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf])); console.log(out, w, h, VARIANTES.length, 'personas');
