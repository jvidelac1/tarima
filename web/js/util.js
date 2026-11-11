// Utilidades compartidas: azar con semilla, texturas de canvas, mapas de normales e interpolación monótona.
import * as THREE from 'three';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Amortiguación exponencial independiente del framerate. */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function makeCanvas(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  if (draw) draw(cv.getContext('2d', { willReadFrequently: false }), w, h);
  return cv;
}

/**
 * Textura a partir de un canvas. Salvo `keep` (canvas que se vuelve a dibujar: tablero, reloj), el canvas se vacía apenas
 * la textura sube a la GPU: un canvas de 2048 px son 16 MB que no hace falta conservar, y el visor arma decenas.
 */
export function canvasTexture(cv, { srgb = true, repeat = false, aniso = 8, mip = true, keep = false } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = mip;
  if (!mip) t.minFilter = THREE.LinearFilter;
  if (!keep) t.onUpdate = () => { t.onUpdate = null; t.userData.w = cv.width; t.userData.h = cv.height; cv.width = cv.height = 1; };
  return t;
}

/** Mapa de normales tangente a partir de un canvas de alturas (canal rojo). */
export function normalFromHeight(heightCanvas, strength = 2, { wrap = true, aniso = 8 } = {}) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h), g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const H = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1); }
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx * l * .5 + .5) * 255; d[i + 1] = (dy * l * .5 + .5) * 255; d[i + 2] = (l * .5 + .5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(out, { srgb: false, repeat: wrap, aniso });
}

/** Ruido de valor suave y enlosable dibujado en un canvas (grises). */
export function noiseCanvas(size, cells, seed = 7, octaves = 3) {
  const r = rng(seed), cv = makeCanvas(size, size), g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const layers = [];
  for (let o = 0; o < octaves; o++) { const n = cells << o, grid = new Float32Array(n * n); for (let i = 0; i < grid.length; i++) grid[i] = r(); layers.push([n, grid]); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = .5, tot = 0;
    for (const [n, grid] of layers) {
      const fx = x / size * n, fy = y / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      const a = grid[y0 * n + x0], b = grid[y0 * n + x1], c = grid[y1 * n + x0], e = grid[y1 * n + x1];
      v += amp * lerp(lerp(a, b, sx), lerp(c, e, sx), sy); tot += amp; amp *= .5;
    }
    const i = (y * size + x) * 4, k = v / tot * 255; d[i] = d[i + 1] = d[i + 2] = k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Interpolador cúbico monótono (Fritsch–Carlson). x estrictamente creciente. */
export class Pchip {
  constructor(x, y, { flatEnds = false } = {}) {
    const n = x.length; this.x = x; this.y = y; this.m = new Float64Array(n);
    const d = new Float64Array(Math.max(1, n - 1));
    for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) { this.m[i] = 0; continue; }
      const h0 = x[i] - x[i - 1], h1 = x[i + 1] - x[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
      this.m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
    if (n > 1) { this.m[0] = flatEnds ? 0 : d[0]; this.m[n - 1] = flatEnds ? 0 : d[n - 2]; }
    this._i = 0;
  }
  _find(t) {
    const x = this.x, n = x.length; let i = this._i;
    if (!(t >= x[i] && t <= x[Math.min(n - 1, i + 1)])) { let lo = 0, hi = n - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (x[mid] <= t) lo = mid; else hi = mid - 1; } i = lo; }
    return this._i = clamp(i, 0, Math.max(0, n - 2));
  }
  at(t) {
    const x = this.x, y = this.y, n = x.length;
    if (n === 1 || t <= x[0]) return y[0]; if (t >= x[n - 1]) return y[n - 1];
    const i = this._find(t), h = x[i + 1] - x[i], s = (t - x[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * this.m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * this.m[i + 1];
  }
}

export function disposeObject(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); }
  });
}
