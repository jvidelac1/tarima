// Núcleo del juego: enteros, azar sembrado y huella. Sin reloj, sin DOM y sin funciones de punto flotante que puedan
// dar distinto en dos motores: solo suma, resta, producto, división con truncado y operaciones de bits.

/** División entera con truncado hacia cero. */
export const idiv = (a, b) => Math.trunc(a / b);
export const clampi = (x, a, b) => (x < a ? a : x > b ? b : x);
/** Redondeo al entero más cercano de a/b (b > 0). */
export const rdiv = (a, b) => (a >= 0 ? idiv(2 * a + b, 2 * b) : -idiv(-2 * a + b, 2 * b));
/** Interpolación lineal entera: de y0 (en x0) a y1 (en x1), evaluada en x. */
export const lerpi = (x, x0, x1, y0, y1) => (x1 === x0 ? y0 : y0 + rdiv((y1 - y0) * (x - x0), x1 - x0));

/** Mezcla de enteros en una semilla de 32 bits (para derivar la semilla de cada llamado y de cada uso). */
export function mezclar(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    let k = x >>> 0;
    k = Math.imul(k ^ (k >>> 16), 0x85ebca6b); k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35); k ^= k >>> 16;
    h = Math.imul(h ^ k, 0x01000193); h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** Generador sembrado (mulberry32) con salidas enteras. */
export class Azar {
  constructor(semilla) { this.a = semilla >>> 0; }
  /** Entero sin signo de 32 bits. */
  u32() {
    this.a = (this.a + 0x6D2B79F5) | 0; let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0;
  }
  /** Entero uniforme en [0, n). n hasta 2^20. */
  ent(n) { return Math.floor((this.u32() >>> 12) * n / 1048576); }
  /** Entero uniforme en [a, b]. */
  entre(a, b) { return a + this.ent(b - a + 1); }
  /** Entero con distribución de campana (suma de cuatro uniformes), media 0 y desvío típico `sd`. */
  campana(sd) { let s = 0; for (let i = 0; i < 4; i++) s += this.ent(2001) - 1000; return rdiv(s * sd, 1155); }
}

/** Huella de un texto (FNV-1a de 32 bits, en hexadecimal). */
export function huella(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** JSON con las claves ordenadas: el mismo objeto da siempre el mismo texto. */
export function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
