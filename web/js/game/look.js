// El look de competencia (Gráficos fase 3). Solo en el juego; todo generado por código, sin imágenes.
// - Luz: sala oscura, una clave fuerte casi cenital, contraluz cálido marcado desde atrás a la izquierda (el que mira a la
//   cámara general), relleno frío mínimo. Gradación desaturada, sombras frías y altas cálidas (GRADO_LOOK: lo usan el pase
//   final de post.js y el tono «a medida» del camino directo de stage.js).
// - Texturas por campo: cada mapa se calcula píxel a píxel (ruido de valor en octavas, deformación de dominio) y de la misma
//   cuenta salen color, altura (de ahí las normales) y rugosidad, así el brillo sigue al desgaste: madera barnizada con
//   veta, juntas, zona gastada, marcas de discos y magnesio; goma del escenario con motas, juntas, polvo y roces; metal
//   pintado con saltaduras y óxido; fenólico de los baúles; goma de los discos.
// - Pantalla LED con grano de píxel en el sombreador (cada LED es un punto; de lejos se funde sin muaré).
// - Utilería de sala: cajones y pilas de discos, portabarras, bancos, baúles, monitores de piso, cámara de TV con trípode,
//   caja de magnesio, cables, cinta en el piso, banderines ficticios y polvo de magnesio derramado.
// - Rayos de luz: conos de bruma de la clave y de los contraluces (solo con post).
// Nada de esto decide nada del juego. Costo por cuadro: los materiales son los de siempre con más mapas; la utilería fija se
// junta por material (stage.js, juntarFijos) y los discos de los cajones son un solo dibujo instanciado.
import * as THREE from 'three';
import { rng, makeCanvas, canvasTexture } from '../util.js';
import { EVENT } from '../config.js';
import { BOKEH } from '../post.js';
import { FINO } from '../athlete.js';
import { conSuperficie, setSuperficies, chapa, USO } from './materiales.js';
import { LEJOS } from './jueces.js';

/** Gradación del juego: exposición, saturación, contraste, gamma de sombras, tinte de sombras y de altas, viñeta y negro. */
export const GRADO_LOOK = Object.freeze({ exp: 1.0, sat: .88, con: 1.03, gam: 1.0, frio: [.92, .995, 1.09], calido: [1.07, 1.0, .91], vin: .36, negro: .004 });
/** Niebla y fondo de la sala (a oscuras, azul petróleo). */
export const SALA = Object.freeze({ fondo: '#0a0f19', niebla: '#111b2d', densidad: .026, nieblaDirecto: '#111a2a' });      // nieblaDirecto: en «Baja» y «Móvil» la bruma es más clara y azul (da fondo y profundidad sin costo: la niebla ya se calculaba)

const DISPLAY = "'Saira Condensed','Arial Narrow',sans-serif";
const Y0 = -.1;      // piso del escenario (la tarima tiene su cara de arriba en 0)
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cl = x => Math.min(1, Math.max(0, x));

// ---------- ruido ----------
/** Ruido de valor periódico (período n): devuelve f(x, y) en 0..1. */
function ruido(seed, n = 64) {
  const r = rng(seed), g = new Float32Array(n * n), M = n - 1; for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i0 = x0 & M, i1 = (i0 + 1) & M, j0 = (y0 & M) * n, j1 = ((y0 + 1) & M) * n;      // n es potencia de dos
    const a = g[j0 + i0], b = g[j0 + i1], c = g[j1 + i0], d = g[j1 + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
const fbm = (f, x, y, oct = 4) => { let v = 0, a = .5, t = 0; for (let o = 0; o < oct; o++) { v += a * f(x, y); t += a; x *= 2; y *= 2; a *= .5; } return v / t; };
/** K campos de baja frecuencia calculados juntos en una grilla de N×N: f(u, v, o) los escribe; leer(u, v, out) los interpola (para no pagar octavas por píxel). */
function grillas(N, K, f) {
  const d = new Float32Array(N * N * K), o = new Float32Array(K); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { f((x + .5) / N, (y + .5) / N, o); d.set(o, (y * N + x) * K); }
  return (u, v, out) => {
    let fx = u * N - .5, fy = v * N - .5; if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001; if (fy < 0) fy = 0; else if (fy > N - 1.001) fy = N - 1.001;
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, a = (y0 * N + x0) * K, b = a + K, c = a + N * K, e = c + K, w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    for (let k = 0; k < K; k++) out[k] = d[a + k] * w00 + d[b + k] * w10 + d[c + k] * w01 + d[e + k] * w11;
  };
}
/** Normales tangentes desde un lienzo de alturas (canal rojo), con acceso directo a los píxeles. */
function normales(alt, fuerza, wrap, aniso) {
  const w = alt.width, h = alt.height, src = alt.getContext('2d').getImageData(0, 0, w, h).data, out = makeCanvas(w, h), g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data, k = fuerza / 255;
  for (let y = 0, i = 0; y < h; y++) {
    const ya = (y ? y - 1 : wrap ? h - 1 : 0) * w, yb = (y < h - 1 ? y + 1 : wrap ? 0 : y) * w, yy = y * w;
    for (let x = 0; x < w; x++, i += 4) {
      const xa = x ? x - 1 : wrap ? w - 1 : 0, xb = x < w - 1 ? x + 1 : wrap ? 0 : x;
      const dx = (src[(yy + xb) * 4] - src[(yy + xa) * 4]) * k, dy = (src[(yb + x) * 4] - src[(ya + x) * 4]) * k, l = 127.5 / Math.sqrt(dx * dx + dy * dy + 1);
      d[i] = 127.5 - dx * l; d[i + 1] = 127.5 + dy * l; d[i + 2] = 127.5 + l; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0); return canvasTexture(out, { srgb: false, repeat: wrap, aniso });
}
const hash2 = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };

/**
 * Calcula tres lienzos (color sRGB, altura y rugosidad) llamando a fn(u, v, o) por píxel: o = [r, g, b, altura, rugosidad] en 0..1.
 * @returns {{col:HTMLCanvasElement, alt:HTMLCanvasElement, rug:HTMLCanvasElement}}
 */
function generar(S, fn, H = S) {
  const col = makeCanvas(S, H), alt = makeCanvas(S, H), rug = makeCanvas(S, H), gc = col.getContext('2d'), ga = alt.getContext('2d'), gr = rug.getContext('2d');
  const ic = gc.createImageData(S, H), ia = ga.createImageData(S, H), ir = gr.createImageData(S, H), C = ic.data, A = ia.data, R = ir.data, o = [0, 0, 0, .5, .5];
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < S; x++, i += 4) {
    fn((x + .5) / S, (y + .5) / H, o, x, y);
    C[i] = o[0] * 255; C[i + 1] = o[1] * 255; C[i + 2] = o[2] * 255; C[i + 3] = 255;
    A[i] = A[i + 1] = A[i + 2] = o[3] * 255; A[i + 3] = 255; R[i] = R[i + 1] = R[i + 2] = o[4] * 255; R[i + 3] = 255;
  }
  gc.putImageData(ic, 0, 0); ga.putImageData(ia, 0, 0); gr.putImageData(ir, 0, 0);
  return { col, alt, rug };
}
/** Los tres lienzos como mapas de un material físico. La rugosidad del material tiene que ser 1 (el mapa la multiplica). */
function mapas(c, { fuerza = 2, wrap = true, aniso = 4, repeat = null } = {}) {
  const normalMap = normales(c.alt, fuerza, wrap, aniso), map = canvasTexture(c.col, { aniso, repeat: wrap }), roughnessMap = canvasTexture(c.rug, { srgb: false, repeat: wrap, aniso: Math.min(aniso, 4) });
  if (repeat) for (const t of [map, normalMap, roughnessMap]) t.repeat.set(repeat[0], repeat[1]);
  return { map, normalMap, roughnessMap };
}

// ---------- tarima ----------
/** Veta fina enlosable (grises alrededor de 0,5): hilos a lo largo de y y poros en rayitas. Se superpone a la madera a resolución final. */
function vetaFina(W, H) {
  const n = ruido(71);
  return generar(W, (u, v, o, px, py) => {
    const hilos = fbm(n, u * 64, v * 4, 2), poro = hash2(px, py >> 3) > .86 ? .22 : 0, k = cl(.5 + (hilos - .5) * 1.1 - poro);
    o[0] = o[1] = o[2] = k; o[3] = k; o[4] = cl(.5 + (hilos - .5) * .5 + poro);
  }, H);
}
/**
 * Madera de la tarima (4 × 4 m en lienzos de S px): tablas a lo largo de z con veta, barniz gastado, golpes de discos,
 * magnesio y pintura. Lo que cambia despacio se calcula por píxel a media resolución; la veta fina, las juntas, los rayones
 * y el salpicado se agregan a resolución final con el lienzo 2D (que compone en la placa): un lienzo de 2048 por píxel
 * tardaba varios segundos de JavaScript.
 */
function madera(S, aniso) {
  const Sb = S >> 1, r = rng(77), nA = ruido(1), nB = ruido(2), nC = ruido(3), nD = ruido(4), NP = 26, pw = 4 / NP, tablas = [];
  for (let i = 0; i < NP; i++) { const cortes = []; let z = -r() * 1.6; while (z < 4.2) { z += 1.9 + r() * 1.6; cortes.push([z, r(), r(), r() * 50]); } tablas.push(cortes); }
  // pintura: línea perimetral gastada y la marca estarcida al frente (se lee desde el jurado)
  const mask = makeCanvas(Sb, Sb, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, Sb, Sb); g.strokeStyle = '#fff'; g.lineWidth = Sb * .012; const b = Sb * .03; g.strokeRect(b, b, Sb - 2 * b, Sb - 2 * b);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Sb * .06}px ${DISPLAY}`; g.fillText(EVENT.marca, Sb / 2, Sb * .9);
    g.font = `700 ${Sb * .026}px ${DISPLAY}`; g.fillText('PLATAFORMA 1 · PLATFORM 1', Sb / 2, Sb * .1);
  });
  const md = mask.getContext('2d').getImageData(0, 0, Sb, Sb).data, M = new Float32Array(5);
  // lo lento: mugre, barniz gastado, nubes de magnesio, marcas de goma y desgaste de la pintura
  const macro = grillas(256, 5, (u, v, o) => { o[0] = fbm(nD, u * 3.6, v * 3.6, 4); o[1] = fbm(nA, u * 12 + 9, v * 12, 3); o[2] = fbm(nC, u * 10.4 + 3, v * 10.4 + 7, 4); o[3] = fbm(nB, u * 56, v * 20, 3); o[4] = fbm(nB, u * 36 + 5, v * 36, 3); });
  const c = generar(Sb, (u, v, o, px, py) => {
    const x = u * 4, z = v * 4, cx = x - 2, cz = z - 2, fi = x / pw, i = Math.min(NP - 1, fi | 0), gx = (fi - i) * pw, cortes = tablas[i];
    let j = 0; while (cortes[j][0] < z) j++;
    const B = cortes[j], off = B[3]; macro(u, v, M);
    // veta: hilos a lo largo de la tabla, deformados, más bandas anchas («catedral»)
    const warp = nA(gx * 7 + off, z * .8 + off) * .65 + nA(gx * 14 + off, z * 1.6 + off) * .35;
    const hilos = fbm(nB, gx * 120 + off * 3, z * 2.4 + warp * 3, 3), banda = .5 + .5 * Math.sin((gx * 48 + warp * 8 + z * .3) * 6.2832);
    const t = cl((.6 * hilos + .4 * banda * (.35 + .65 * nD(gx * 26 + off, z * 1.3))) * 1.15 - .08 + (B[1] - .5) * .2), tono = (.9 + .13 * B[2]) * (.78 + .36 * M[0]);
    let R = (.66 - .27 * t) * tono, G = (.47 - .23 * t) * tono, Bc = (.29 - .17 * t) * tono, h = .62 + (hilos - .5) * .12, rg = .3 + .14 * hilos;
    // barniz comido donde se paran: más claro, más parejo y mate
    const st = Math.exp(-((cx / 1.05) * (cx / 1.05) + ((cz - .12) / .75) * ((cz - .12) / .75))), w = cl(st * 1.35 * (.3 + .95 * M[1]));
    R += (R * 1.12 + .075 - R) * w * .85; G += (G * 1.12 + .07 - G) * w * .85; Bc += (Bc * 1.14 + .065 - Bc) * w * .85; rg += w * .42;
    // donde caen los discos: marcas de goma, abolladuras
    const ax = (Math.abs(cx) - .97) / .19, gl = ax * ax < 9 ? Math.exp(-ax * ax) * sm(-.8, -.35, cz) * (1 - sm(.6, .98, cz)) : 0;
    if (gl > .01) { const mk = gl * (.5 + 1.1 * M[3]), kk = 1 - .62 * cl(mk); R *= kk; G *= kk; Bc *= kk; rg += mk * .25; h -= gl * sm(.64, .82, nC(x * 36, z * 36)) * .3; }
    // magnesio en nubes
    const ch = cl(sm(.5, .78, M[2] * (.42 + 1.05 * st + .6 * gl)) * .44);
    if (ch > 0) { R += (.93 - R) * ch; G += (.92 - G) * ch; Bc += (.88 - Bc) * ch; rg += (.97 - rg) * cl(ch * 1.7); }
    // pintura gastada
    const pm = md[(py * Sb + px) * 4];
    if (pm > 0) { const p = pm / 255 * sm(.34, .52, M[4] + .2 - w * .25) * .8; R += (.84 - R) * p; G += (.82 - G) * p; Bc += (.76 - Bc) * p; rg += (.52 - rg) * p; h += p * .04; }
    o[0] = R; o[1] = G; o[2] = Bc; o[3] = cl(h); o[4] = cl(rg);
  });
  // a resolución final: veta fina superpuesta, juntas entre tablas, rayones y salpicado de magnesio
  const fino = vetaFina(256, 512), rr = rng(505), px = S / 4, lw = Math.max(1, S / 1024 * 1.25);
  const juntas = g => { g.beginPath(); for (let i = 0; i < NP; i++) { const x0 = i * pw * px; if (i) { g.moveTo(x0, 0); g.lineTo(x0, S); } for (const [z] of tablas[i]) if (z < 4) { g.moveTo(x0, z * px); g.lineTo(x0 + pw * px, z * px); } } g.stroke(); };
  const rayas = []; for (let k = 0; k < 170; k++) rayas.push([S * (.08 + rr() * .84), S * (.2 + rr() * .7), (rr() - .5) * 1.2 + Math.PI / 2, S * (.01 + rr() * rr() * .09), .1 + rr() * .3, .6 + rr() * 1.2]);
  const motas = []; for (let k = 0; k < 2000; k++) { const lado = rr() < .3 ? (rr() < .5 ? -1 : 1) * (.97 + (rr() - .5) * .3) : (rr() + rr() - 1) * 1.1; motas.push([S * (lado / 4 + .5), S * ((.12 + (rr() + rr() + rr() - 1.5) * .55) / 4 + .5), 1 + rr() * 1.7, .07 + rr() * .26]); }
  const subir = (base, tile, modo, alfa, extra) => makeCanvas(S, S, g => {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(base, 0, 0, S, S);
    g.globalCompositeOperation = modo; g.globalAlpha = alfa; g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.lineCap = 'round';
    extra(g);
  });
  const trazos = (g, tinta, ka) => { for (const [x, y, a, L, al, w] of rayas) { g.strokeStyle = tinta.replace('A', Math.min(1, al * ka).toFixed(2)); g.lineWidth = w * lw; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } };
  const salpicar = (g, tinta, ka) => { g.fillStyle = tinta; for (const [x, y, s, a] of motas) { g.globalAlpha = Math.min(1, a * ka); g.fillRect(x, y, s * lw, s * lw); } g.globalAlpha = 1; };
  const col = subir(c.col, fino.col, 'overlay', .6, g => { g.strokeStyle = 'rgba(22,13,6,.82)'; g.lineWidth = lw * 1.2; juntas(g); trazos(g, 'rgba(238,226,204,A)', 1); salpicar(g, 'rgb(250,249,243)', 1); });
  const alt = subir(c.alt, fino.alt, 'overlay', .75, g => { g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = lw * 4; juntas(g); g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = lw * 1.5; juntas(g); trazos(g, 'rgba(0,0,0,A)', 1.4); });
  const rug = subir(c.rug, fino.rug, 'soft-light', .5, g => { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = lw * 1.5; juntas(g); trazos(g, 'rgba(255,255,255,A)', 1.4); salpicar(g, 'rgb(255,255,255)', 1.5); });
  return mapas({ col, alt, rug }, { fuerza: 3.4, wrap: false, aniso });
}

/** Goma del escenario: baldosa de 1 m con motas, junta, polvo y roces. El lienzo cubre 2 × 2 m (cuatro baldosas distintas). */
function gomaPiso(S, aniso) {
  const nA = ruido(11), nB = ruido(12), pal = [[.36, .37, .39], [.46, .47, .49], [.27, .29, .32], [.55, .55, .56], [.3, .31, .33]];      // motas grises: las de color, de lejos, se leían como manchas rojas y azules
  const lento = grillas(256, 2, (u, v, o) => { o[0] = fbm(nA, u * 8, v * 8, 4); o[1] = fbm(nB, u * 4 + 3, v * 4, 3); }), M = new Float32Array(2);
  const c = generar(S, (u, v, o, px, py) => {
    lento(u, v, M); const polvo = M[0], mancha = M[1], fino = hash2(px, py), fu = (u * 2) % 1, fv = (v * 2) % 1, du = fu < .5 ? fu : 1 - fu, dv = fv < .5 ? fv : 1 - fv, dj = du < dv ? du : dv;
    let k = .13 + .006 * sm(.4, .8, polvo) + (fino - .5) * .012, R = k, G = k * 1.02, B = k * 1.08, h = .5 + (fino - .5) * .3, rg = .5 + .12 * sm(.35, .75, polvo) - .06 * sm(.55, .8, mancha);
    const mx = px >> 1, my = py >> 1, hm = hash2(mx + 91, my + 17);
    if (hm < .05) { const P = pal[(hash2(mx, my) * pal.length) | 0], a = .35 + hm * 5; R += (P[0] - R) * a * .5; G += (P[1] - G) * a * .5; B += (P[2] - B) * a * .5; h += .1; rg += .08; }
    const gap = 1 - sm(.001, .005, dj); R *= 1 - .7 * gap; G *= 1 - .7 * gap; B *= 1 - .7 * gap; h -= gap * .45; rg += gap * .3;
    const borde = (1 - sm(.005, .05, dj)) * .5 * polvo; R += borde * .05; G += borde * .05; B += borde * .05;      // polvo juntado contra la junta
    o[0] = R; o[1] = G; o[2] = B; o[3] = cl(h); o[4] = cl(rg);
  });
  const r = rng(606), gc = c.col.getContext('2d'), gr = c.rug.getContext('2d');
  for (let k = 0; k < 70; k++) {      // roces de suela y arrastres: más claros y más lisos (brillan con el contraluz)
    const x = S * (.06 + r() * .88), y = S * (.06 + r() * .88), a = r() * 7, L = S * (.02 + r() * .1), cv = (r() - .5) * S * .04, lw = 1 + r() * 5;
    for (const [g, st] of [[gc, `rgba(150,150,158,${(.03 + r() * .07).toFixed(3)})`], [gr, `rgba(0,0,0,${(.1 + r() * .22).toFixed(3)})`]]) { g.strokeStyle = st; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * .5 + cv, y + Math.sin(a) * L * .5 - cv, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
  }
  return mapas(c, { fuerza: 2.4, aniso, repeat: [6.5, 5.5] });
}

/** Metal pintado de taller (enlosable): pintura oscura cepillada, saltaduras que dejan ver el acero y óxido alrededor. */
function metalPintado(S, base = [.085, .095, .115]) {
  const nA = ruido(21), nB = ruido(22);
  return generar(S, (u, v, o, px, py) => {
    const cep = fbm(nA, u * 4, v * 64, 3), salt = fbm(nB, u * 16, v * 16, 4), ox = fbm(nA, u * 8 + 5, v * 8 + 2, 4), f = hash2(px, py);
    let k = .8 + .5 * cep, R = base[0] * k, G = base[1] * k, B = base[2] * k, h = .55 + (cep - .5) * .1, rg = .42 + .2 * cep;
    const s = sm(.66, .7, salt), oxi = sm(.52, .64, salt) * sm(.42, .62, ox) * (1 - s);
    R += (.36 - R) * oxi * .8; G += (.17 - G) * oxi * .8; B += (.07 - B) * oxi * .8; rg += oxi * .4;
    R += (.5 + f * .08 - R) * s; G += (.5 + f * .08 - G) * s; B += (.52 + f * .08 - B) * s; h -= s * .22; rg += (.3 - rg) * s;
    o[0] = R; o[1] = G; o[2] = B; o[3] = cl(h); o[4] = cl(rg);
  });
}
/** Fenólico negro de baúl de gira (enlosable): relieve de rombos chicos, raspones y polvo. */
function fenolico(S) {
  const nA = ruido(31);
  return generar(S, (u, v, o) => {
    const a = (u + v) * 48 % 1, b = (u - v + 1) * 48 % 1, rombo = sm(.1, .3, Math.min(a, 1 - a)) * sm(.1, .3, Math.min(b, 1 - b)), polvo = fbm(nA, u * 6, v * 6, 4), rasp = sm(.7, .78, fbm(nA, u * 3 + 7, v * 40, 3));
    const k = .05 + .03 * sm(.4, .8, polvo) + rasp * .1;
    o[0] = k; o[1] = k * 1.02; o[2] = k * 1.06; o[3] = cl(.4 + rombo * .35 - rasp * .2); o[4] = cl(.5 + .3 * polvo + rasp * .2 - rombo * .08);
  });
}
/** Terciado de cajón y de banco (enlosable): veta larga, nudos apagados, manchas de magnesio. */
function terciado(S) {
  const nA = ruido(41), nB = ruido(42);
  return generar(S, (u, v, o) => {
    const warp = fbm(nA, u * 2, v * 2, 2), hilos = fbm(nB, u * 4 + warp * 2, v * 64, 3), banda = .5 + .5 * Math.sin((v * 9 + warp * 5) * 6.2832), t = cl(.6 * hilos + .4 * banda), su = fbm(nA, u * 4 + 9, v * 4, 4), tz = sm(.62, .8, su) * .35;
    let R = (.62 - .26 * t) * (.75 + .4 * su), G = (.46 - .22 * t) * (.75 + .4 * su), B = (.29 - .16 * t) * (.75 + .4 * su);
    R += (.9 - R) * tz; G += (.89 - G) * tz; B += (.85 - B) * tz;
    o[0] = R; o[1] = G; o[2] = B; o[3] = cl(.5 + (hilos - .5) * .3); o[4] = cl(.55 + .25 * hilos + tz * .4);
  });
}
/** Goma de disco (enlosable, grises): rugosidad con polvo y roces, altura con poro fino. Va en roughnessMap y bumpMap. */
function gomaDisco(S) {
  const nA = ruido(51);
  const c = generar(S, (u, v, o, px, py) => {
    const polvo = fbm(nA, u * 8, v * 8, 4), roce = sm(.62, .72, fbm(nA, u * 32 + 3, v * 4, 3)), f = hash2(px, py);
    o[0] = o[1] = o[2] = 1; o[3] = cl(.5 + (f - .5) * .5 - roce * .25); o[4] = cl(.5 + .4 * sm(.4, .75, polvo) - roce * .2 + (f - .5) * .1);
  });
  const rough = canvasTexture(c.rug, { srgb: false, repeat: true, aniso: 4 }), bump = canvasTexture(c.alt, { srgb: false, repeat: true, aniso: 4 });
  for (const t of [rough, bump]) t.repeat.set(3, 1);
  return { roughnessMap: rough, bumpMap: bump };
}

/**
 * Telón de fondo con luz: pliegues verticales y bañadores de piso que lo lavan desde abajo (ámbar a la izquierda, azul frío
 * a la derecha, como los contraluces), con la caída de la luz hacia arriba. Va horneado en la textura: el telón sigue
 * siendo un plano sin luces. 17 × 6,4 m.
 */
function telon(W = 1024, H = 384) {
  const n = ruido(91), r = rng(19), pl = []; let x = 0; while (x < 1) { const w = (.012 + r() * .02); pl.push([x, w, r()]); x += w; }
  const focos = []; for (let i = 0; i < 9; i++) { const u = (i + .5) / 9; if (Math.abs(u - .5) < .27) continue; focos.push([u + (r() - .5) * .01, u < .5 ? [1, .56, .24] : [.42, .62, 1], .8 + r() * .4]); }
  let k = 0;
  const c = generar(W, (u, v, o) => {
    while (k < pl.length - 1 && pl[k + 1][0] <= u) k++; if (u < pl[k][0]) k = 0; while (k < pl.length - 1 && pl[k + 1][0] <= u) k++;
    const P = pl[k], t = (u - P[0]) / P[1], pliegue = .5 - .5 * Math.cos(t * 6.2832), y = 1 - v;      // y: 0 en el piso, 1 arriba
    const base = .012 + .03 * pliegue * (.6 + .4 * P[2]) + .01 * fbm(n, u * 40, v * 6, 2);
    let R = base * .75, G = base * .85, B = base * 1.15;
    for (const [fu, col, f] of focos) { const dx = (u - fu) * 17, ancho = .35 + y * 6.4 * .42, g = Math.exp(-(dx * dx) / (ancho * ancho)) * Math.exp(-y * 3.1) * f * (.35 + .65 * pliegue) * .5; R += col[0] * g; G += col[1] * g; B += col[2] * g; }
    const piso = sm(0, .03, y); o[0] = cl(Math.sqrt(R * piso)); o[1] = cl(Math.sqrt(G * piso)); o[2] = cl(Math.sqrt(B * piso)); o[3] = .5; o[4] = .5;
  }, H);
  return canvasTexture(c.col, { aniso: 4 });
}

/** Las ocho banderas ficticias como paños largos (2,6 × 9 m): el diseño estirado a lo alto, con pliegues de tela, más luz abajo (la del escenario) que arriba, y el dobladillo. */
function banderasLargas() {
  const N = 8, W = 128, H = 448, src = banderines(), r = rng(73);
  return canvasTexture(makeCanvas(N * W, H, g => {
    g.drawImage(src, 0, 0, N * W, H);
    for (let i = 0; i < N; i++) { const x0 = i * W; g.save(); g.beginPath(); g.rect(x0, 0, W, H); g.clip();
      let x = x0; while (x < x0 + W) { const fw = 9 + r() * 20, lg = g.createLinearGradient(x, 0, x + fw, 0); lg.addColorStop(0, 'rgba(0,0,0,.42)'); lg.addColorStop(.5, 'rgba(255,255,255,.1)'); lg.addColorStop(1, 'rgba(0,0,0,.42)'); g.fillStyle = lg; g.fillRect(x, 0, fw, H); x += fw; }
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x0, 0, 3, H); g.fillRect(x0 + W - 3, 0, 3, H); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x0, H - 10, W, 10); g.restore(); }
    const luz = g.createLinearGradient(0, 0, 0, H); luz.addColorStop(0, 'rgba(0,0,0,.8)'); luz.addColorStop(.55, 'rgba(0,0,0,.4)'); luz.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = luz; g.fillRect(0, 0, N * W, H);
    g.fillStyle = 'rgba(40,36,44,.22)'; g.fillRect(0, 0, N * W, H);      // tela gastada: el color no es pleno
  }), { aniso: 4 });
}
/** Ocho banderas de países ficticios en proporción 2:3 (192 × 128 px cada una): franjas, cantón o diagonal y un símbolo (disco, rombo, anillo, triángulo, barras), con pliegues suaves y la luz de abajo. Ninguna copia una real. */
function banderas23() {
  const N = 8, W = 192, H = 128, r = rng(321), P = [['#1f5d8a', '#e9e2d0', '#c2452a'], ['#263c2c', '#e3b33a', '#e6dfcc'], ['#6e1f2a', '#d9cfb8', '#16264a'], ['#4f2a78', '#efeadf', '#178f7e'], ['#c9602c', '#101c3c', '#e9e2d0'], ['#0f6a70', '#14161a', '#e3b33a'], ['#b84a78', '#f0ece2', '#2b2d33'], ['#16264a', '#9fc23a', '#e8e4da']];
  return canvasTexture(makeCanvas(N * W, H, g => {
    for (let i = 0; i < N; i++) { const [a, b, c] = P[i], x = i * W; g.save(); g.beginPath(); g.rect(x, 0, W, H); g.clip(); g.translate(x, 0); g.fillStyle = a; g.fillRect(0, 0, W, H);
      switch (i % 4) { case 0: g.fillStyle = b; g.fillRect(0, H / 3, W, H / 3); break; case 1: g.fillStyle = b; g.fillRect(0, 0, W * .36, H); break; case 2: g.fillStyle = b; g.beginPath(); g.moveTo(0, H); g.lineTo(W, 0); g.lineTo(W, H * .3); g.lineTo(W * .3, H); g.fill(); break; default: g.fillStyle = b; g.fillRect(0, 0, W * .45, H * .5); }
      const cx = [W / 2, W * .18, W * .5, W * .225][i % 4], cy = [H / 2, H / 2, H / 2, H * .25][i % 4], q = H * [.2, .13, .2, .14][i % 4]; g.fillStyle = c; g.strokeStyle = c; g.lineWidth = q * .3;
      switch (i) { case 0: case 5: g.beginPath(); g.arc(cx, cy, q, 0, 7); g.fill(); break; case 1: case 6: g.beginPath(); g.moveTo(cx, cy - q); g.lineTo(cx + q * .8, cy); g.lineTo(cx, cy + q); g.lineTo(cx - q * .8, cy); g.fill(); break; case 2: case 7: g.beginPath(); g.arc(cx, cy, q * .8, 0, 7); g.stroke(); break; case 3: g.beginPath(); g.moveTo(cx, cy - q); g.lineTo(cx + q, cy + q * .8); g.lineTo(cx - q, cy + q * .8); g.fill(); break; default: for (const k of [-1, 0, 1]) g.fillRect(cx + k * q * .7 - q * .15, cy - q, q * .3, q * 2); }
      let xx = 0; while (xx < W) { const fw = 14 + r() * 26, f = g.createLinearGradient(xx, 0, xx + fw, 0); f.addColorStop(0, 'rgba(0,0,0,.26)'); f.addColorStop(.5, 'rgba(255,255,255,.07)'); f.addColorStop(1, 'rgba(0,0,0,.26)'); g.fillStyle = f; g.fillRect(xx, 0, fw, H); xx += fw; }
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H); g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2); g.restore(); }
    const luz = g.createLinearGradient(0, 0, 0, H); luz.addColorStop(0, 'rgba(0,0,0,.5)'); luz.addColorStop(1, 'rgba(0,0,0,.05)'); g.fillStyle = luz; g.fillRect(0, 0, N * W, H); g.fillStyle = 'rgba(40,36,44,.2)'; g.fillRect(0, 0, N * W, H);
  }), { aniso: 4 });
}
/** Parrilla del techo (84 × 84 m vista desde abajo): vigas, cerchas con diagonales, conductos y el resplandor cálido de las luces sobre el escenario. Cierra la sala desde cualquier cámara. */
function techo(S = 1024) {
  return canvasTexture(makeCanvas(S, S, g => {
    g.fillStyle = '#07080b'; g.fillRect(0, 0, S, S); const m = S / 84, r = rng(31);
    const res = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 26 * m); res.addColorStop(0, 'rgba(255,196,130,.36)'); res.addColorStop(.35, 'rgba(210,150,100,.16)'); res.addColorStop(1, 'rgba(120,90,70,0)'); g.fillStyle = res; g.fillRect(0, 0, S, S);
    for (let i = 0; i <= 14; i++) { const x = i * 6 * m; g.fillStyle = 'rgba(96,100,112,.5)'; g.fillRect(x - .22 * m, 0, .44 * m, S); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x + .22 * m, 0, .2 * m, S); }      // vigas principales
    g.strokeStyle = 'rgba(86,90,102,.42)'; g.lineWidth = Math.max(1, .12 * m);
    for (let j = 0; j <= 28; j++) { const y = j * 3 * m; g.fillStyle = 'rgba(70,74,86,.42)'; g.fillRect(0, y - .1 * m, S, .2 * m); if (j % 2 === 0) { g.beginPath(); for (let i = 0; i < 14; i++) { const x = i * 6 * m; g.moveTo(x, y); g.lineTo(x + 3 * m, y + 3 * m); g.lineTo(x + 6 * m, y); } g.stroke(); } }      // correas y diagonales
    for (let k = 0; k < 7; k++) { const x = (8 + r() * 68) * m, w = (.5 + r() * .5) * m; g.fillStyle = 'rgba(58,62,72,.7)'; g.fillRect(x, 0, w, S); g.fillStyle = 'rgba(130,134,146,.25)'; g.fillRect(x, 0, w * .25, S); }      // conductos
    for (const d of [15, 23, 31]) { g.strokeStyle = 'rgba(255,205,150,.1)'; g.lineWidth = 1.6 * m; g.beginPath(); g.arc(S / 2, S / 2, d * m, 0, 7); g.stroke(); }      // pasarelas de luminarias
  }), { aniso: 4 });
}
/** Estandarte de lona del evento (2,3 × 4,6 m): la marca en vertical, el pictograma de la barra, franjas y la sesión; tela con pliegues, lavada por un bañador desde el piso. Tipografía, no dibujo: se ve de oficio a cualquier distancia. */
function mural(W = 384, H = 768, calido = false) {
  return canvasTexture(makeCanvas(W, H, g => {
    const r = rng(calido ? 57 : 43), A = calido ? ['#5a1d16', '#2a0f0d', '#ffb060'] : ['#123f4c', '#081c24', '#6fe6f0'];
    const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, A[1]); lg.addColorStop(1, A[0]); g.fillStyle = lg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = -8; i < 30; i++) { g.beginPath(); g.moveTo(0, i * 56); g.lineTo(W, i * 56 - 150); g.lineTo(W, i * 56 - 122); g.lineTo(0, i * 56 + 28); g.fill(); }
    g.save(); g.translate(W * .56, H * .5); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2ede2'; g.font = `800 ${W * .5}px ${DISPLAY}`; g.fillText(calido ? 'OPEN · ' + EVENT.session.toUpperCase() : EVENT.marca, 0, 0, H * .78); g.restore();
    g.fillStyle = A[2]; g.fillRect(W * .1, H * .045, W * .8, H * .012); g.fillRect(W * .1, H * .935, W * .8, H * .012);
    { const x = W * .5, y = H * .09, q = W * .2; g.fillRect(x - q, y - q * .05, q * 2, q * .1); for (const sx of [-1, 1]) { g.fillRect(x + sx * q * .72 - q * .06, y - q * .34, q * .12, q * .68); g.fillRect(x + sx * q * .9 - q * .05, y - q * .24, q * .1, q * .48); } }
    g.fillStyle = '#f2ede2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${W * .1}px ${DISPLAY}`; g.fillText(calido ? 'HALTEROFILIA' : 'OPEN · ' + EVENT.session.toUpperCase(), W / 2, H * .972, W * .8);
    let x = 0; while (x < W) { const fw = 16 + r() * 34, f = g.createLinearGradient(x, 0, x + fw, 0); f.addColorStop(0, 'rgba(0,0,0,.34)'); f.addColorStop(.5, 'rgba(255,255,255,.06)'); f.addColorStop(1, 'rgba(0,0,0,.34)'); g.fillStyle = f; g.fillRect(x, 0, fw, H); x += fw; }      // pliegues
    const som = g.createLinearGradient(0, 0, 0, H); som.addColorStop(0, 'rgba(0,0,0,.72)'); som.addColorStop(.5, 'rgba(0,0,0,.25)'); som.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = som; g.fillRect(0, 0, W, H);      // la luz le llega de abajo
  }), { aniso: 4 });
}

// ---------- gráficas ----------
/** Fondo de la pantalla LED: casi negro, con líneas finas y dos paneles apagados; lo brillante son los textos y las luces. */
function ledFondo(w, h) {
  return makeCanvas(w, h, g => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1a4958'); gr.addColorStop(.33, '#0e202b'); gr.addColorStop(.67, '#1d1719'); gr.addColorStop(1, '#5c3417'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = -2; i < 26; i++) { const x = i * w / 24, calido = i >= 12; g.fillStyle = calido ? `rgba(255,150,60,${.1 + .08 * (i & 1)})` : `rgba(70,190,210,${.09 + .07 * (i & 1)})`; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * .012, 0); g.lineTo(x + w * .05, h); g.lineTo(x + w * .038, h); g.closePath(); g.fill(); }
    // marca de agua del evento, enorme y apenas visible, y una guarda de pictogramas abajo: la pantalla nunca es un paño vacío
    g.save(); g.globalAlpha = .07; g.fillStyle = '#dff6ff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${h * .62}px ${DISPLAY}`; g.fillText(EVENT.marca, w / 2, h * .46, w * .9); g.restore();
    g.save(); g.globalAlpha = .16; for (let i = 0; i < 30; i++) { const x = (i + .5) * w / 30, c = i < 15 ? '#6fe6f0' : '#ffb060', s2 = h * .022; g.fillStyle = c; g.fillRect(x - s2 * 2, h * .873, s2 * 4, s2 * .22); for (const sx of [-1, 1]) { g.fillRect(x + sx * s2 * 1.45 - s2 * .14, h * .873 - s2 * .7, s2 * .28, s2 * 1.6); } } g.restore();
    const cg = g.createRadialGradient(w / 2, h * .62, h * .1, w / 2, h * .62, w * .3); cg.addColorStop(0, 'rgba(0,0,0,.5)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, w, h);
    { const lg = g.createLinearGradient(0, h * .6, 0, h); lg.addColorStop(0, 'rgba(120,200,220,0)'); lg.addColorStop(1, 'rgba(120,200,220,.1)'); g.fillStyle = lg; g.fillRect(0, h * .6, w / 2, h * .4); const lw = g.createLinearGradient(0, h * .6, 0, h); lw.addColorStop(0, 'rgba(255,170,90,0)'); lw.addColorStop(1, 'rgba(255,170,90,.11)'); g.fillStyle = lw; g.fillRect(w / 2, h * .6, w / 2, h * .4); }
    g.fillStyle = 'rgba(255,170,70,.85)'; g.fillRect(0, h * .93, w, h * .01); g.fillStyle = 'rgba(210,225,230,.5)'; g.fillRect(0, h * .952, w, h * .005);
  });
}
/** Reflejo de la pantalla en el piso del escenario: una mancha de luz teal a la izquierda y ámbar a la derecha que se apaga hacia la tarima. */
function brilloPiso(W = 256, H = 64) {
  return makeCanvas(W, H, g => {
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgb(40,120,140)'); gr.addColorStop(.42, 'rgb(22,40,52)'); gr.addColorStop(.58, 'rgb(46,30,24)'); gr.addColorStop(1, 'rgb(150,84,36)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const cae = g.createLinearGradient(0, 0, 0, H); cae.addColorStop(0, 'rgba(0,0,0,.15)'); cae.addColorStop(.35, 'rgba(0,0,0,.62)'); cae.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = cae; g.fillRect(0, 0, W, H);
    for (const x of [0, 1]) { const b = g.createLinearGradient(x ? W : 0, 0, x ? W * .88 : W * .12, 0); b.addColorStop(0, 'rgba(0,0,0,1)'); b.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = b; g.fillRect(x ? W * .88 : 0, 0, W * .12, H); }
  });
}
/** Ocho banderines ficticios en una tira (ninguno copia una bandera real: diagonales, discos corridos, rombos y cuñas en colores raros). */
function banderines() {
  const N = 8, W = 160, H = 256;
  return makeCanvas(N * W, H, g => {
    const P = [['#c9602c', '#101c3c', '#e9e2d0'], ['#4f2a78', '#178f7e', '#efeadf'], ['#0f6a70', '#e3b33a', '#14161a'], ['#6e1f2a', '#d9cfb8', '#7c8088'], ['#16264a', '#9fc23a', '#e8e4da'], ['#b84a78', '#2b2d33', '#f0ece2'], ['#d7d2c4', '#1f5d8a', '#c2452a'], ['#263c2c', '#e07a2a', '#e6dfcc']];
    for (let i = 0; i < N; i++) {
      const [a, b, c] = P[i], x = i * W; g.save(); g.beginPath(); g.rect(x, 0, W, H); g.clip(); g.translate(x, 0); g.fillStyle = a; g.fillRect(0, 0, W, H);
      switch (i) {
        case 0: g.fillStyle = b; g.beginPath(); g.moveTo(0, H * .3); g.lineTo(W, H * .05); g.lineTo(W, H * .4); g.lineTo(0, H * .65); g.fill(); break;
        case 1: g.fillStyle = b; g.fillRect(0, H / 2, W, H / 2); g.fillStyle = c; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W / 2, H * .3); g.fill(); break;
        case 2: g.fillStyle = c; g.fillRect(0, H * .8, W, H * .2); g.fillStyle = b; g.beginPath(); g.arc(W * .38, H * .34, W * .22, 0, 7); g.fill(); break;
        case 3: g.fillStyle = b; g.fillRect(0, 0, W / 2, H / 2); g.fillRect(W / 2, H / 2, W / 2, H / 2); g.fillStyle = c; g.beginPath(); g.moveTo(W / 2, H * .36); g.lineTo(W * .7, H / 2); g.lineTo(W / 2, H * .64); g.lineTo(W * .3, H / 2); g.fill(); break;
        case 4: g.strokeStyle = b; g.lineWidth = W * .13; for (const y of [.25, .5, .75]) { g.beginPath(); g.moveTo(-10, H * y - W * .3); g.lineTo(W / 2, H * y); g.lineTo(W + 10, H * y - W * .3); g.stroke(); } break;
        case 5: g.fillStyle = b; g.fillRect(W / 2, 0, W / 2, H); g.fillStyle = c; g.beginPath(); for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; g.lineTo(W / 2 + Math.cos(an) * W * .2, H * .4 + Math.sin(an) * W * .2); } g.fill(); break;
        case 6: g.fillStyle = b; g.beginPath(); g.moveTo(0, H); g.lineTo(W, H); g.lineTo(W, H * .45); g.fill(); g.fillStyle = c; g.fillRect(W * .12, H * .1, W * .1, H * .5); break;
        default: g.fillStyle = b; g.fillRect(0, H * .42, W, H * .16); g.strokeStyle = c; g.lineWidth = W * .05; g.beginPath(); g.arc(W / 2, H / 2, W * .26, 0, 7); g.stroke();
      }
      // pliegues de la tela y borde cosido
      for (let k = 0; k < 5; k++) { const fx = W * (k + .5) / 5, lg = g.createLinearGradient(fx - W * .1, 0, fx + W * .1, 0); lg.addColorStop(0, 'rgba(0,0,0,.28)'); lg.addColorStop(.5, 'rgba(255,255,255,.1)'); lg.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = lg; g.fillRect(fx - W * .1, 0, W * .2, H); }
      const sg = g.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, 'rgba(0,0,0,.35)'); sg.addColorStop(.15, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = sg; g.fillRect(0, 0, W, H);
      g.restore();
    }
  });
}
/** Calcomanía de piso con alfa: cinta blanca en ángulos y una X, un número estarcido, y magnesio derramado (tipo). */
function calco(tipo, S = 256) {
  const n = ruido(61 + tipo.length);
  return makeCanvas(S, S, g => {
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i += 4) {
      const u = (x + .5) / S, v = (y + .5) / S, r = Math.hypot(u - .5, v - .5) * 2, f = fbm(n, u * 6, v * 6, 4), gr = hash2(x, y);
      const a = tipo === 'tiza' ? cl(sm(1, .1, r) * sm(.3, .7, f + .35 * (1 - r)) * (.55 + .5 * gr) * .8) : 0;
      d[i] = 236; d[i + 1] = 234; d[i + 2] = 226; d[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    if (tipo === 'cinta') {
      g.strokeStyle = 'rgba(226,224,214,.9)'; g.lineWidth = S * .05; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(S * .1, S * .38); g.lineTo(S * .1, S * .1); g.lineTo(S * .38, S * .1); g.stroke();
      g.beginPath(); g.moveTo(S * .62, S * .62); g.lineTo(S * .9, S * .9); g.moveTo(S * .9, S * .62); g.lineTo(S * .62, S * .9); g.stroke();
      g.fillStyle = 'rgba(226,224,214,.8)'; g.font = `800 ${S * .3}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1', S * .72, S * .26);
      g.globalCompositeOperation = 'destination-out';      // cinta pisada: se le comen pedazos
      for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) { const f = fbm(n, x / S * 14, y / S * 14, 3); if (f > .58) { g.fillStyle = `rgba(0,0,0,${cl((f - .58) * 6)})`; g.fillRect(x, y, 2, 2); } }
    }
  });
}

// ---------- rayos de luz ----------
const RAYO_VS = /* glsl */`varying vec3 vN; varying vec3 vV; varying float vT; varying vec2 vA;
void main(){ vT = uv.y; vA = normalize( position.xz + vec2( 1e-4 ) ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`;
const RAYO_FS = /* glsl */`uniform vec3 uColor; uniform float uFuerza; uniform float uTiempo; varying vec3 vN; varying vec3 vV; varying float vT; varying vec2 vA;
float h21( vec2 p ){ p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float ruido( vec2 p ){ vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
void main(){
  float borde = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 1.6 );
  float cae = pow( clamp( vT, 0.0, 1.0 ), 1.25 ) * smoothstep( 0.0, 0.12, vT );
  vec2 q = vA * 3.0 + vec2( vT * 1.5 + uTiempo * 0.02, vT * 3.0 - uTiempo * 0.035 );
  float veta = 0.55 + 0.75 * ruido( q ) * ruido( q * 2.7 + 3.1 ) + 0.2 * ruido( vec2( atan( vA.y, vA.x ) * 9.0, uTiempo * 0.05 ) );
  gl_FragColor = vec4( uColor * uFuerza * borde * cae * veta, 1.0 );
}`;


// ---------- halos de los focos ----------
// Un foco de escenario visto de frente no es un disco blanco: es un punto que quema con un halo ancho, un destello
// horizontal corto (el de un lente de transmisión) y una estrella leve. Un sprite por luminaria (un solo dibujo de puntos),
// aditivo; brilla según cuánto mira el foco a la cámara y se apaga de costado. Sin lecturas de textura.
const HALO_VS = /* glsl */`attribute vec3 aColor; attribute vec3 aDir; attribute float aTam;
uniform float uAlto; uniform float uFuerza; uniform float uMax; varying vec3 vCol; varying float vK;
void main(){
  vec4 mv = modelViewMatrix * vec4( position, 1.0 ); float d = max( - mv.z, 0.1 );
  vec3 alOjo = normalize( cameraPosition - position ); float f = max( dot( normalize( aDir ), alOjo ), 0.0 );
  float k = 0.1 + 0.9 * pow( f, 5.0 ); vK = k; vCol = aColor * uFuerza * ( 0.25 + 0.75 * k );
  gl_PointSize = clamp( aTam * ( 0.55 + 0.45 * k ) * projectionMatrix[ 1 ][ 1 ] * uAlto * 0.5 / d, 2.0, uMax );
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = /* glsl */`uniform float uDirecto; varying vec3 vCol; varying float vK;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length( p ), borde = 1.0 - smoothstep( 0.82, 1.0, r );
  float nucleo = exp( - r * r * 90.0 ) * 2.6, halo = exp( - r * 5.5 ) * 0.34 + exp( - r * r * 9.0 ) * 0.1;
  float raya = exp( - abs( p.y ) * 46.0 ) * exp( - abs( p.x ) * 3.4 ) * 0.5 * vK;                      // destello anamórfico
  float estrella = ( exp( - abs( p.x ) * 70.0 ) * exp( - abs( p.y ) * 6.0 ) + exp( - abs( p.x + p.y ) * 60.0 ) * exp( - r * 7.0 ) * 0.5 + exp( - abs( p.x - p.y ) * 60.0 ) * exp( - r * 7.0 ) * 0.5 ) * 0.16 * vK;
  vec3 c = vCol * ( nucleo + halo + raya + estrella ) * borde;
  if ( uDirecto > 0.5 ) c = min( vCol * 0.5 * ( exp( - r * r * 60.0 ) * 2.4 + exp( - r * 7.0 ) * 0.3 + raya * 0.8 ) * borde, vec3( 1.0 ) );      // camino directo: va al lienzo sin pase de tono (valores de pantalla, caída más corta)
  gl_FragColor = vec4( c, 1.0 );
}`;

// ---------- utilería ----------
const DISCOS = ['#a8241f', '#1d3f96', '#c79a12', '#1f7436', '#a8241f', '#1d3f96'];

export class Look {
  /**
   * Se arma después de la arena, el ambiente y las luces, y antes del primer dibujo (retoca materiales sin compilar).
   * @param {{arena:object, ambiente:object, lighting:object, aniso?:number, grande?:boolean, reduceMotion?:boolean}} o  `grande`: texturas de 2048 (computadora)
   */
  constructor({ arena, ambiente, lighting, aniso = 4, grande = true, reduceMotion = false }) {
    this.arena = arena; this.ambiente = ambiente; this.reduce = reduceMotion; this.T = { value: 0 }; this.texturas = [];
    this.group = new THREE.Group(); this.group.name = 'Look';                 // lo que se mueve o se suma (rayos): fuera de la arena
    this.props = new THREE.Group(); this.props.name = 'Utilería'; arena.group.add(this.props);      // fijo: stage.js lo junta por material
    const paso = (nombre, f) => { try { f(); } catch (e) { console.warn('look:', nombre, e); } };
    { const g = ambiente.golpe.bind(ambiente); ambiente.golpe = (z, k) => { g(z, k); USO.value = Math.min(1, USO.value + .03); }; }      // cada barra que cae deja más magnesio
    { const s = ambiente.setLuces.bind(ambiente); ambiente.setLuces = L => { s(L); for (const c of ambiente.uPolvo.uLuzCol.value) c.multiplyScalar(.1); }; }      // el polvo solo se insinúa en los conos (se leía como nieve)
    { const u = ambiente.update.bind(ambiente); ambiente.update = dt => { u(dt); this.update(dt); }; }      // avanza con el ambiente (stage.js no cambia)
    paso('luces', () => this._luces(lighting));
    paso('tarima', () => this._tarima(grande ? 2048 : 1024, aniso));
    paso('piso', () => this._piso(grande ? 1024 : 512, aniso));
    paso('sala', () => this._sala());
    paso('pantalla', () => this._pantalla());
    /** Rugosidad y relieve de la goma de los discos ({roughnessMap, bumpMap}): también para los de la barra (barbell.js). */
    this.goma = null; paso('goma de disco', () => { this.goma = gomaDisco(256); this.texturas.push(this.goma.roughnessMap, this.goma.bumpMap); });
    paso('utilería', () => this._utileria(aniso, grande));
    paso('rayos', () => this._rayos(lighting));
    paso('halos', () => this._halos());
    paso('vestir', () => this._vestir());
  }

  /** Luz de competencia: sala a oscuras, clave casi cenital, contraluz cálido marcado desde atrás a la izquierda. */
  _luces(L) {
    L.key.position.set(4.4, 9.3, 3.9); L.key.color.set('#fff0dc'); L.key.intensity = 5.1; L.key.angle = .3; L.key.penumbra = .7;
    L.key2.color.set('#ffe9d2'); L.key2.intensity = .5; L.key2.position.set(-3.6, 4.6, 7.2);      // relleno bajo y de frente: abre las cuencas de los ojos que la cenital deja apagadas
    L.stage.color.set('#b9c6e0'); L.stage.intensity = 2.8;
    L.hemi.color.set('#56688a'); L.hemi.groundColor.set('#2c2016'); L.hemi.intensity = .15;
    L.wash.color.set('#8fa0c4'); L.wash.intensity = .07;
    // rimA mira a la cámara general (atrás a la izquierda): es EL contraluz, cálido y ancho (también rasa el piso)
    // Contraluces heroicos: dos focos potentes desde atrás y a media altura, uno cálido y uno frío, que dibujan un filo claro en
    // hombros, brazos, cabeza y discos desde cualquier cámara general; más la luz de pelo desde arriba y atrás.
    L.rimA.color.set('#ffa85c'); L.rimA.intensity = 10; L.rimA.angle = .5; L.rimA.penumbra = .85; L.rimA.position.set(-5.4, 4.3, -5.0);
    L.rimB.color.set('#9fd0ff'); L.rimB.intensity = 9; L.rimB.angle = .5; L.rimB.penumbra = .85; L.rimB.position.set(5.4, 4.5, -5.0);
    L.hair.color.set('#ffe2bc'); L.hair.intensity = 5;
  }
  _tarima(S, aniso) {
    const A = this.arena, m = A.madera; if (!m) return;
    const M = madera(S, aniso); for (const k of ['map', 'normalMap', 'roughnessMap']) { m[k]?.dispose(); m[k] = M[k]; this.texturas.push(M[k]); }
    m.color.setRGB(.86, .86, .86); m.roughness = 1; m.metalness = 0; m.normalScale.set(.9, .9); m.envMapIntensity = .7; conSuperficie(m, 'madera'); m.needsUpdate = true;
    const canto = A.tarima?.material?.[0]; if (canto) { canto.color.set('#1b1612'); canto.roughness = .62; }
  }
  _piso(S, aniso) {
    const m = this.arena.alfombra; if (!m) return;
    const G = gomaPiso(S, aniso); for (const k of ['map', 'normalMap', 'roughnessMap']) { m[k]?.dispose(); m[k] = G[k]; this.texturas.push(G[k]); }
    m.color.setRGB(1, 1, 1); m.roughness = 1; m.normalScale.set(.9, .9); m.envMapIntensity = .5; conSuperficie(m, 'goma'); m.needsUpdate = true; this.gomaPiso = G;
  }
  /** Lo que no está bajo los focos queda en penumbra: tribunas, pabellón, cintas y telón. */
  _sala() {
    const A = this.arena, k = (m, f) => { if (m && m.color) m.color.multiplyScalar(f); };
    if (A.crowd) { const u = A.crowd.material.uniforms; u.uGain.value = .095; if (u.uRebote) u.uRebote.value.set(.16, .11, .065); }
    A.group.traverse(o => {
      const m = o.material; if (!m || Array.isArray(m) || !m.isMeshBasicMaterial) return;
      if (o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop > 30) k(m, o.geometry.parameters.height > 5 ? 1.25 : .6);      // pabellón y cinta de luz
      else if (o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === 90) m.color.set('#090a0d');                                 // piso de sala
      else if (o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === 17) { const t = telon(); this.texturas.push(t); m.map?.dispose(); m.map = t; m.color.setRGB(1.15, 1.15, 1.15); m.needsUpdate = true; }                                               // telón
    });
    if (A.cinta) { const vistos = new Set(); for (const o of A.group.children) { const m = o.material; if (m?.map?.source === A.cinta.source && !vistos.has(m)) { vistos.add(m); k(m, .55); } } }
    for (const o of A.group.children) if (o.isInstancedMesh && o.material.isMeshBasicMaterial && o.geometry.type === 'BoxGeometry' && !o.material.map) o.material.color.multiply(new THREE.Color(.8, .95, 1.3));      // escalones y barandas
    // los focos del fondo: ámbar a la izquierda (acompañan al contraluz), blanco frío a la derecha; nada de rosa y celeste
    (A.beams || []).forEach((b, i) => b.mat.uniforms.uColor.value.set(i < 5 ? (i % 2 ? '#ffb469' : '#ffc890') : (i % 2 ? '#cfe0ff' : '#e9eeff')));
    this.salaImpostor = 1.0;
    // los dos cargadores de pie eran cápsulas azules fuera de escala (lo único que queda en esos lotes en el juego): fuera
    for (const o of A.group.children) if (o.isInstancedMesh && (o.geometry.type === 'CapsuleGeometry' || (o.geometry.type === 'SphereGeometry' && Math.abs(o.geometry.parameters.radius - .105) < 1e-6))) o.visible = false;
    // la bruma de sala (velos aditivos) lavaba los negros: a un tercio
    { const hechos = new Set(); A.group.traverse(o => { const m = o.material; if (m?.map === A.hazeTex && m.color && !hechos.has(m)) { hechos.add(m); m.color.set('#8fa0b8').multiplyScalar(.004); /* casi nada y frío: de costado los velos se sumaban en un banco beige sobre la tribuna */ } }); }
    if (this.ambiente?.uPolvo) this.ambiente.uPolvo.uTam.value = .013;      // motas grandes, blandas y tenues (chicas y fuertes eran píxeles blancos sueltos)
  }
  /** Pantalla LED: fondo oscuro y grano de píxel en el sombreador (un punto por LED; de lejos se promedia: sin muaré). */
  _pantalla() {
    const A = this.arena, amb = this.ambiente, m = A.pantalla?.material; if (!m || !amb?.led) return;
    amb.ledFondo = ledFondo(amb.led.width, amb.led.height); amb.sinRejilla = true; amb._led();
    m.color.multiplyScalar(3.0);
    const antes = m.onBeforeCompile, yo = this;
    m.onBeforeCompile = function (sh, r) {
      antes.call(this, sh, r); if (yo.ledPlano) return;
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	{ vec2 ledP = vMapUv * vec2( 500.0, 175.0 ); vec2 ledF = abs( fract( ledP ) - 0.5 );
	  float ledM = ( 1.0 - smoothstep( 0.3, 0.48, max( ledF.x, ledF.y ) ) ) * ( 1.0 - smoothstep( 0.2, 0.62, length( ledF ) ) );
	  float ledW = smoothstep( 0.12, 0.4, max( fwidth( ledP.x ), fwidth( ledP.y ) ) );
	  diffuseColor.rgb *= mix( ledM * 1.75, 0.82, ledW ); }`);
    };
    m.customProgramCacheKey = () => (yo.ledPlano ? 'led plano' : 'led con grano'); m.needsUpdate = true;
  }

  _utileria(aniso, grande) {
    const P = this.props, S = grande ? 512 : 256, tx = (c, o) => { const M = mapas(c, { aniso, ...o }); this.texturas.push(M.map, M.normalMap, M.roughnessMap); return M; };
    const metal = this.metalMat = new THREE.MeshStandardMaterial({ name: 'metal pintado', ...tx(metalPintado(S)), roughness: 1, metalness: .55, envMapIntensity: .9 });
    const acero = new THREE.MeshStandardMaterial({ name: 'acero', color: new THREE.Color('#aeb2b8'), roughness: .3, metalness: 1, envMapIntensity: 1.1 });
    const baul = new THREE.MeshStandardMaterial({ name: 'fenólico', ...tx(fenolico(S)), roughness: 1, metalness: 0, envMapIntensity: .5 });
    const ply = new THREE.MeshStandardMaterial({ name: 'terciado', ...tx(terciado(S)), roughness: 1, metalness: 0, envMapIntensity: .4 });
    const negro = new THREE.MeshStandardMaterial({ name: 'goma negra', color: new THREE.Color('#0d0d10'), roughness: .7, envMapIntensity: .4 });
    const tela = new THREE.MeshStandardMaterial({ name: 'tela', color: new THREE.Color('#b9b6ac'), roughness: .95 });
    this.propMats = new Set([metal, acero, baul, ply, negro, tela]);
    this.utilMats = [metal, baul, ply]; for (const m of this.utilMats) { m.userData.normal = m.normalMap; m.userData.rug = m.roughnessMap; }
    const caja = new THREE.BoxGeometry(1, 1, 1), cil = new THREE.CylinderGeometry(1, 1, 1, 14);
    /** Caja o cilindro de tamaño (sx, sy, sz) centrado en (x, y, z) dentro de `g`. */
    const pz = (g, geo, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.receiveShadow = true; g.add(o); return o; };
    const grupo = (x, z, ry = 0, y = Y0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; P.add(g); return g; };
    const discos = [];      // [matriz, color] de cada disco de los cajones: un solo dibujo instanciado
    const disco = (g, x, y, z, eje, color, r = .225, t = .05) => { const o = new THREE.Object3D(); o.position.set(x, y, z); if (eje === 'x') o.rotation.z = Math.PI / 2; o.scale.set(r, t, r); g.add(o); g.updateWorldMatrix(true, true); discos.push([o.matrixWorld.clone(), color]); g.remove(o); };

    // cajón de discos: dos rieles y discos parados, algunos recostados
    const cajon = (x, z, ry, n, seed) => {
      const g = grupo(x, z, ry), r = rng(seed), L = n * .075 + .25;
      for (const s of [-1, 1]) { pz(g, caja, metal, L, .05, .05, 0, .07, s * .15); pz(g, caja, metal, .05, .34, .05, s * (L / 2 - .03), .17, .22); pz(g, caja, metal, .05, .34, .05, s * (L / 2 - .03), .17, -.22); pz(g, caja, metal, .06, .05, .5, s * (L / 2 - .03), .025, 0); }
      pz(g, caja, metal, L, .04, .04, 0, .33, .22); pz(g, caja, metal, L, .04, .04, 0, .33, -.22);
      let xx = -L / 2 + .12; for (let i = 0; i < n; i++) { const t = .034 + r() * .03; disco(g, xx + t / 2, .225 + .06, 0, 'x', DISCOS[(i * 3 + (r() * 2 | 0)) % DISCOS.length], .225, t); xx += t + .004 + (r() < .2 ? .03 : 0); }
    };
    cajon(-4.75, -3.75, .42, 13, 3); cajon(3.7, -4.35, -.2, 9, 5);
    // pilas de discos en el piso, con discos chicos encima
    const pila = (x, z, cols, seed) => { const g = grupo(x, z), r = rng(seed); let y = 0; cols.forEach((c, i) => { const t = .045 + r() * .02; disco(g, (r() - .5) * .03, y + t / 2, (r() - .5) * .03, 'y', c, .225, t); y += t; }); disco(g, .03, y + .012, -.02, 'y', '#c9c7c0', .115, .024); disco(g, -.01, y + .036, .02, 'y', '#a8241f', .1, .02); };
    pila(-3.75, -4.45, ['#1f7436', '#1f7436', '#c79a12', '#1d3f96'], 7); pila(-5.9, -1.35, ['#a8241f', '#a8241f', '#1d3f96'], 8); pila(4.75, -2.0, ['#c79a12', '#1f7436'], 9);

    // portabarras vertical con tres barras
    { const g = grupo(-5.55, -2.5, .3); pz(g, caja, metal, .62, .06, .34, 0, .03, 0); pz(g, caja, metal, .62, .04, .05, 0, .9, -.14); for (const s of [-1, 1]) pz(g, caja, metal, .04, .9, .04, s * .29, .45, -.14);
      for (let i = 0; i < 3; i++) { const x = (i - 1) * .2; pz(g, cil, metal, .035, .12, .035, x, .1, 0); pz(g, cil, acero, .014, 2.2, .014, x, 1.14, -.02 * i, -.04, 0, 0); pz(g, cil, acero, .025, .41, .025, x, .245, 0, -.04); pz(g, cil, acero, .025, .41, .025, x, 2.0, -.07, -.04); } }

    // bancos de espera con toalla y botella
    const banco = (x, z, ry, toalla) => { const g = grupo(x, z, ry); pz(g, caja, ply, .36, .045, 1.7, 0, .46, 0); for (const sz of [-.7, .7]) { pz(g, caja, metal, .32, .44, .04, 0, .22, sz); pz(g, caja, metal, .4, .03, .08, 0, .015, sz); }
      pz(g, caja, metal, .04, .04, 1.4, 0, .2, 0);
      if (toalla) { pz(g, caja, tela, .3, .025, .52, .01, .495, .35, 0, .12); pz(g, caja, tela, .3, .3, .02, .01, .34, .62, .06); pz(g, cil, acero, .035, .2, .035, -.06, .585, -.45); pz(g, cil, negro, .037, .03, .037, -.06, .695, -.45); } };
    banco(-5.35, .9, .06, true); banco(5.45, 1.5, -.05, true); banco(-5.25, 3.0, -.03, false);

    // baúles de gira: cuerpo de fenólico, cantos y esquinas de aluminio, cierres
    const baulDe = (x, z, ry, w, h, d, y = Y0) => { const g = grupo(x, z, ry, y), e = .028;
      pz(g, caja, baul, w, h, d, 0, h / 2 + .06, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { pz(g, caja, acero, e, h + e, e, sx * w / 2, h / 2 + .06, sz * d / 2); pz(g, cil, negro, .04, .05, .04, sx * (w / 2 - .08), .03, sz * (d / 2 - .08)); }
      for (const sy of [0, 1]) { for (const sz of [-1, 1]) pz(g, caja, acero, w + e, e, e, 0, sy * h + .06, sz * d / 2); for (const sx of [-1, 1]) pz(g, caja, acero, e, e, d + e, sx * w / 2, sy * h + .06, 0); }
      pz(g, caja, acero, w + e * .5, e * .7, d + e * .5, 0, h * .68 + .06, 0);
      for (const sx of [-.28, .28]) pz(g, caja, acero, .09, .1, .012, sx * w, h * .68 + .06, d / 2 + .012);
      return g; };
    baulDe(-6.0, -3.55, .08, .62, .56, 1.15); baulDe(-6.02, -3.6, -.1, .56, .4, .8, Y0 + .62); baulDe(6.0, .1, -.04, .6, .5, 1.0); baulDe(-3.0, -4.75, 1.62, .55, .45, .9);

    // monitores de piso (cuñas) y cámara de TV con trípode
    for (const s of [-1, 1]) { const g = grupo(s * 4.5, 4.75, s * -.5 + Math.PI); pz(g, caja, baul, .62, .32, .4, 0, .17, 0, -.5); pz(g, caja, negro, .54, .26, .02, 0, .2, .2, -.5); pz(g, cil, acero, .1, .012, .1, -.12, .21, .215, Math.PI / 2 - .5); }
    { const g = grupo(5.1, 4.2, -2.3); for (let i = 0; i < 3; i++) { const a = i * 2.094; pz(g, cil, metal, .016, 1.35, .016, Math.cos(a) * .3, .62, Math.sin(a) * .3, Math.sin(a) * .44, 0, -Math.cos(a) * .44); }
      pz(g, cil, metal, .05, .12, .05, 0, 1.28, 0); pz(g, caja, negro, .2, .24, .52, 0, 1.48, 0); pz(g, cil, negro, .075, .22, .075, 0, 1.47, .36, Math.PI / 2); pz(g, cil, acero, .068, .012, .068, 0, 1.47, .475, Math.PI / 2);
      pz(g, caja, negro, .16, .12, .05, 0, 1.68, -.2); pz(g, cil, metal, .012, .5, .012, .2, 1.3, -.3, .9, 0, .2); pz(g, caja, baul, .34, .34, .34, .45, .17, -.2); }

    // caja de magnesio de madera con patas, del otro lado de la magnesiera
    { const g = grupo(3.2, -1.95, -.2); for (const sx of [-1, 1]) for (const sz of [-1, 1]) pz(g, caja, ply, .045, .78, .045, sx * .2, .39, sz * .15);
      pz(g, caja, ply, .5, .02, .4, 0, .76, 0); for (const sz of [-1, 1]) pz(g, caja, ply, .5, .16, .02, 0, .85, sz * .19); for (const sx of [-1, 1]) pz(g, caja, ply, .02, .16, .4, sx * .24, .85, 0);
      const tiza = new THREE.MeshStandardMaterial({ name: 'magnesio', color: new THREE.Color('#eceae2'), roughness: 1 }); pz(g, caja, tiza, .44, .07, .34, 0, .81, 0); pz(g, caja, tiza, .1, .06, .07, .08, .87, .03, .2, .5, .1); pz(g, caja, tiza, .09, .05, .06, -.1, .86, -.05, 0, -.4, .2); }

    // cables por el piso (de las torres a la mesa técnica y al frente) y canaleta pasacables
    const cable = (pts, radio = .011) => { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], Y0 + radio * .9, p[1]))); const o = new THREE.Mesh(new THREE.TubeGeometry(c, pts.length * 10, radio, 5), negro); o.receiveShadow = true; P.add(o); };
    cable([[-5.75, -4.4], [-5.2, -4.0], [-5.6, -3.0], [-6.15, -1.6], [-6.2, .5], [-6.1, 2.6], [-6.25, 4.6], [-5.6, 5.3]]);
    cable([[-5.7, -4.45], [-5.0, -4.2], [-5.3, -3.2], [-6.05, -1.8], [-6.12, .9], [-6.2, 3.4], [-6.0, 5.2]], .008);
    cable([[5.75, -4.4], [5.3, -3.9], [5.9, -2.6], [6.2, -.8], [6.15, 2.0], [5.4, 3.9], [5.15, 4.3]]);
    cable([[-5.6, -4.6], [-3.6, -4.95], [-1, -4.9], [2, -4.95], [4.4, -4.8], [5.6, -4.55]], .014);
    { const g = grupo(-6.1, 1.9, 0); pz(g, caja, negro, .5, .035, .9, 0, .018, 0); const am = new THREE.MeshStandardMaterial({ name: 'canaleta', color: new THREE.Color('#b8901c'), roughness: .6 }); pz(g, caja, am, .16, .04, .9, 0, .02, 0); }

    // discos de los cajones y las pilas: un dibujo instanciado, color por instancia
    { const geo = new THREE.CylinderGeometry(1, 1, 1, 30); const G = this.goma || {};
      const mat = new THREE.MeshStandardMaterial({ name: 'discos de utilería', color: new THREE.Color(1, 1, 1), roughness: 1, roughnessMap: G.roughnessMap || null, envMapIntensity: .5 }); conSuperficie(mat, 'disco');
      const im = new THREE.InstancedMesh(geo, mat, discos.length), c = new THREE.Color(); discos.forEach(([m, col], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.set(col)); });
      im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.receiveShadow = true; im.name = 'discos de utilería'; this.arena.group.add(im); this.discos = im; }

    // calcomanías del piso: magnesio derramado junto a la magnesiera y a la caja, cinta y número
    const calcoDe = (tipo, x, z, w, ry = 0) => { const t = canvasTexture(calco(tipo), { aniso: 4 }); this.texturas.push(t);
      const m = new THREE.MeshStandardMaterial({ name: 'calco ' + tipo, map: t, transparent: true, depthWrite: false, roughness: tipo === 'tiza' ? 1 : .7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, w), m); o.rotation.set(-Math.PI / 2, 0, ry); o.position.set(x, Y0 + .003, z); o.receiveShadow = true; o.renderOrder = 1; P.add(o); (this.calcos ||= []).push(o); };
    calcoDe('tiza', -3.15, -1.9, 1.7); calcoDe('tiza', 3.2, -1.95, 1.5, 1); calcoDe('cinta', -3.6, 3.3, 1.5); calcoDe('cinta', 3.6, -3.0, 1.5, Math.PI);

    // charcos de luz de los focos en el piso del escenario (alrededor de la tarima) y nube tenue de magnesio sobre el bol
    { const cv = makeCanvas(256, 256, g => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); const r = rng(88);
        const anillo = g.createRadialGradient(128, 128, 30, 128, 128, 120); anillo.addColorStop(0, 'rgba(255,214,170,.5)'); anillo.addColorStop(.5, 'rgba(200,190,200,.22)'); anillo.addColorStop(1, 'rgba(120,150,200,0)'); g.fillStyle = anillo; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + r(), d = 62 + r() * 40, x = 128 + Math.cos(a) * d * 1.15, y = 128 + Math.sin(a) * d, rad = 22 + r() * 22, rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, `rgba(${i % 2 ? '255,200,140' : '190,215,255'},.42)`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); } }), t = canvasTexture(cv, { aniso: 2 }); this.texturas.push(t);
      const o = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 10.8), new THREE.MeshBasicMaterial({ name: 'charcos de luz en el piso', map: t, color: new THREE.Color(.085, .085, .085), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      o.rotation.x = -Math.PI / 2; o.position.set(0, Y0 + .0035, 0); o.renderOrder = 2; this.arena.group.add(o); (this.calcos ||= []).push(o); }
    // la pantalla tiñe el piso delante suyo (aditivo, solo con post: va con las calcomanías)
    { const t = canvasTexture(brilloPiso(), { aniso: 2 }); this.texturas.push(t);
      const o = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 3.0), new THREE.MeshBasicMaterial({ name: 'brillo de la pantalla en el piso', map: t, color: new THREE.Color(.5, .5, .5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      o.rotation.x = -Math.PI / 2; o.position.set(0, Y0 + .004, -3.45); o.renderOrder = 2; P.add(o); (this.calcos ||= []).push(o); }
    { const cv = makeCanvas(256, 64, g => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64); for (let i = 0; i < 6; i++) { const x = (i + .5) * 256 / 6, rg = g.createRadialGradient(x, 30, 0, x, 30, 40); rg.addColorStop(0, 'rgba(255,226,190,.55)'); rg.addColorStop(1, 'rgba(255,226,190,0)'); g.fillStyle = rg; g.fillRect(x - 40, 0, 80, 64); } }), t = canvasTexture(cv, { aniso: 2 }); this.texturas.push(t);
      const o = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 2.9), new THREE.MeshBasicMaterial({ name: 'luz del truss del frente en el piso', map: t, color: new THREE.Color(.3, .3, .3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      o.rotation.x = -Math.PI / 2; o.position.set(0, Y0 + .004, 3.95); o.renderOrder = 2; P.add(o); (this.calcos ||= []).push(o); }
    // pared de chapa pintada a los lados de la pantalla (materiales.js: toda por función), con columnas, caño y tablero eléctrico
    { const ch = this.chapaMat = chapa('#2a4350'); this.propMats.add(ch);
      for (const s of [-1, 1]) { const g = grupo(s * 7.05, -5.72, 0, -1);
        pz(g, caja, ch, 3.5, 6.6, .06, 0, 3.3, 0);
        for (const x of [-1.72, 0, 1.72]) pz(g, caja, metal, .14, 6.6, .12, x, 3.3, .08);
        pz(g, caja, metal, 3.5, .1, .1, 0, 4.35, .09); pz(g, caja, metal, 3.5, .1, .1, 0, 1.75, .09);
        pz(g, cil, acero, .025, 3.4, .025, s * .1, 5.2, .16, 0, 0, Math.PI / 2); pz(g, cil, acero, .02, 4.0, .02, s * 1.2, 3.1, .13);
        pz(g, caja, metal, .5, .7, .16, s * 1.2, 2.2, .14); pz(g, caja, acero, .06, .1, .03, s * 1.2 + .17, 2.2, .235); } }
    // banderines ficticios colgados del truss del fondo, a los lados de las luces de arbitraje
    { const t = canvasTexture(banderines(), { aniso: 4 }); this.texturas.push(t); const N = 8, pos = [], uv = [], idx = [];
      const xs = [-6.6, -5.4, -4.2, -3.0, 3.0, 4.2, 5.4, 6.6];
      xs.forEach((x, i) => { const w = .5, y1 = 5.95, y0 = 4.45 + (i % 2) * .06, b = i * 4; pos.push(x - w, y0, -4.95, x + w, y0, -4.95, x + w, y1, -4.95, x - w, y1, -4.95); uv.push(i / N, 0, (i + 1) / N, 0, (i + 1) / N, 1, i / N, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ name: 'banderines', map: t, color: new THREE.Color(.2, .2, .2), side: THREE.DoubleSide })); o.frustumCulled = false; /* reemplazados por las banderas largas de _vestir */ }
  }

  /** Todo lo que dibuja la utilería (después de juntarFijos las piezas fijas son mallas por material en la arena): para la variante «sin utilería» del banco. */
  utileria() { const M = this.propMats, o = []; this.arena.group.traverse(x => { if (x === this.props || x === this.discos || (x.isMesh && M.has(x.material))) o.push(x); }); return o; }



  /** Lo que cierra y viste la sala: parrilla del techo, murales con siluetas a los lados de la pantalla y banderas grandes colgadas sobre las tribunas. Planos sin luces (todo pintado): valen en cualquier calidad. */
  _vestir() {
    const A = this.arena, G = A.group, tx = t => { this.texturas.push(t); return t; };
    // techo: tapa el vacío de arriba (desde la primera persona se veía un cielo negro con puntos sueltos)
    A.group.traverse(o => { if (o.geometry?.type === 'CircleGeometry' && o.geometry.parameters.radius === 42) o.visible = false; });
    const te = new THREE.Mesh(new THREE.PlaneGeometry(84, 84), new THREE.MeshBasicMaterial({ name: 'techo', map: tx(techo()), color: new THREE.Color(.5, .5, .5), fog: false })); te.rotation.x = Math.PI / 2; te.position.y = 13; te.frustumCulled = false; G.add(te);
    // murales a los lados de la pantalla (entre la pantalla y los tableros), lavados por bañadores desde el piso
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.6), new THREE.MeshBasicMaterial({ name: 'mural', map: tx(mural(384, 768, s > 0)), color: new THREE.Color(.55, .55, .55) })); m.position.set(s * 4.95, 2.25, -5.5); G.add(m); }
    // banderas ficticias largas (hasta ~3 m del piso), colgadas del techo: detrás del escenario, a los costados y al frente.
    // Entran en las tomas generales (3/4, costado, medio, frontal) y tapan la parte alta de las tribunas.
    const bt = tx(banderasLargas()), pos = [], uv = [], idx = [], N = 8;
    const colgar = (cx, cz, nx, nz, i, w = 2.6, y0 = 3.3, y1 = 12.4) => { const tx2 = -nz, tz = nx, b = pos.length / 3; pos.push(cx - tx2 * w / 2, y0, cz - tz * w / 2, cx + tx2 * w / 2, y0, cz + tz * w / 2, cx + tx2 * w / 2, y1, cz + tz * w / 2, cx - tx2 * w / 2, y1, cz - tz * w / 2); uv.push(i / N, 0, (i + 1) / N, 0, (i + 1) / N, 1, i / N, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    [-8.0, -2.5, 0, 2.5, 8.0].forEach((x, k) => colgar(x, -5.62, 0, 1, (k * 3 + 1) % N, 2.3, Math.abs(x) < 4 ? 4.3 : 2.7));      // detrás de la pantalla (las del medio terminan arriba del puente de luces)
    // (a los costados van banderas 2:3 con símbolo: más abajo)
    for (let k = 0; k < 7; k++) colgar(-12 + k * 4, 11.5, 0, -1, (k * 3) % N, 2.6, 4.4);
    for (const s of [-1, 1]) colgar(s * 6.3, -4.74, 0, 1, s > 0 ? 6 : 3, 1.7, 2.72, 6.2);      // sobre el tablero y el reloj, colgadas del truss del fondo: a cuadro en 3/4, jurado y frontal      // frente (lo que mira el pesista), por encima de los árbitros
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ name: 'banderas', map: bt, color: new THREE.Color(.85, .85, .85), side: THREE.DoubleSide })); o.frustumCulled = false; G.add(o);
    { const t2 = tx(banderas23()), p2 = [], u2 = [], i2 = [];      // banderas de países ficticios, 3 × 2 m, enteras a cuadro en la toma lateral
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z = -8.4 + k * 3.4, x = s * 10.85, y0 = 1.95, y1 = 3.95, b = p2.length / 3, i = (k * 3 + (s > 0 ? 2 : 5)) % 8;
        p2.push(x, y0, z - s * 1.5, x, y0, z + s * 1.5, x, y1, z + s * 1.5, x, y1, z - s * 1.5); u2.push(i / 8, 0, (i + 1) / 8, 0, (i + 1) / 8, 1, i / 8, 1); i2.push(b, b + 1, b + 2, b, b + 2, b + 3); }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2)); g2.setIndex(i2);
      const o2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ name: 'banderas 2:3', map: t2, color: new THREE.Color(.62, .62, .62), side: THREE.DoubleSide })); o2.frustumCulled = false; G.add(o2); }
    this._sombras();
  }

  /**
   * Sombras de contacto: una mancha oscura y blanda bajo cada zapatilla y bajo los discos de cada lado, pegada a la tarima.
   * Cuatro planos chicos con mezcla (también en «Móvil»); se apagan con la altura. Los pies y la barra se buscan por nombre
   * en la escena (el pesista visible), sin tocar el escenario.
   */
  _sombras() {
    const cv = makeCanvas(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.9)'); r.addColorStop(.45, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }), t = canvasTexture(cv, { aniso: 1 }); this.texturas.push(t);
    const mat = () => new THREE.MeshBasicMaterial({ name: 'sombra de contacto', map: t, color: 0x000000, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const S = this.contacto = [0, 1, 2, 3].map(i => { const m = new THREE.Mesh(geo, mat()); m.renderOrder = 3; m.frustumCulled = false; m.visible = false; m.scale.set(i < 2 ? .27 : .42, 1, i < 2 ? .5 : .7); this.arena.group.add(m); return m; });
    const v = new THREE.Vector3(); let pies = null, barra = null, n = 0;
    // el primero se entera en cada dibujo: ubica los cuatro antes de que se dibujen (él mismo va con la posición del cuadro anterior)
    this.halos.onAfterRender = () => {
      const esc = this.arena.group.parent; if (!esc) return;
      if (!(n++ % 30) || (pies && !pies.every(b => { for (let x = b; x; x = x.parent) if (!x.visible) return false; return true; }))) {
        pies = null; barra = esc.getObjectByName('Barbell') || null;
        esc.traverse(o => { if (pies || !o.isSkinnedMesh || !o.visible) return; for (let x = o; x; x = x.parent) if (!x.visible) return; const B = o.skeleton.bones, a = B.find(b => /LeftToeBase$/.test(b.name)) || B.find(b => /LeftFoot$/.test(b.name)), c = B.find(b => /RightToeBase$/.test(b.name)) || B.find(b => /RightFoot$/.test(b.name)); if (a && c) pies = [a, c]; });
      }
      for (let i = 0; i < 2; i++) { const m = S[i], b = pies?.[i]; if (!b) { m.visible = false; continue; } b.getWorldPosition(v); const k = 1 - Math.min(1, Math.max(0, (v.y - .1) / .22)); m.visible = k > .02 && Math.abs(v.x) < 2.1 && Math.abs(v.z) < 2.1; m.position.set(v.x, .004, v.z - .06); m.material.opacity = .9 * k; }
      for (let i = 0; i < 2; i++) { const m = S[2 + i]; if (!barra || !barra.visible) { m.visible = false; continue; } const p = barra.position, k = 1 - Math.min(1, Math.max(0, (p.y - .225) / .4)); m.visible = k > .02; m.position.set(p.x + (i ? 1 : -1) * .93, .004, p.z); m.material.opacity = .95 * k; }
    };
  }

  /** Halos de las luminarias del truss y de las torres (las mismas posiciones que arma arena.js). */
  _halos() {
    const TY = 7.1, TB = 6.3, L = [], luz = (pos, hacia, color, tam, k = 1) => L.push({ pos, hacia, color, tam, k });
    for (let i = 0; i < 8; i++) { const x = -6.3 + i * 1.8; luz([x, TB - .3, -4.6], [x * .25, .4, -.2], i < 4 ? '#ffb877' : '#d6e4ff', 2.3, 1); }
    for (let i = 0; i < 6; i++) { const x = -5 + i * 2; luz([x, TY - .3, 6.8], [x * .2, 1, 0], '#ffe6c4', 2.3, 1); }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) luz([s * 7.4, TY - .35 - i * .05, 3.6 - i * 2.8], [0, 1, 0], i === 1 ? '#fff0d8' : (s < 0 ? '#ffc48a' : '#cfe0ff'), 2.0, .9);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) luz([s * 7.22, 3.7 + i * .9, -4.4], [s * 1.2, 1.2, 0], i === 1 ? '#ffd9a0' : '#f4f0ff', 1.0, .4);
    for (let i = 0; i < 8; i++) { const x = -4.2 + i * 1.2; luz([x, 3.56, -4.86], [x * .45, 1.3, 2.5], i % 2 ? '#ffd9a0' : '#f2ecff', 1.5, .8); }      // puente de luces sobre la pantalla
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) luz([s * 4.02, 1.55 + i * .72, -4.4], [-s * .4, 1.3, .6], i === 1 ? (s < 0 ? '#ffb877' : '#cfe0ff') : '#fff0d8', 1.3, .75);      // torres de contraluz
    const n = L.length, P = new Float32Array(n * 3), C = new Float32Array(n * 3), D = new Float32Array(n * 3), T = new Float32Array(n), c = new THREE.Color(), a = new THREE.Vector3(), b = new THREE.Vector3();
    L.forEach((l, i) => { a.set(...l.pos); b.set(...l.hacia).sub(a).normalize(); a.addScaledVector(b, .14); a.toArray(P, i * 3); b.toArray(D, i * 3); c.set(l.color).multiplyScalar(l.k); c.toArray(C, i * 3); T[i] = l.tam; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(C, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(D, 3)); g.setAttribute('aTam', new THREE.BufferAttribute(T, 1));
    const m = this.haloMat = new THREE.ShaderMaterial({ name: 'halos de focos', vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: { uAlto: { value: 720 }, uFuerza: { value: 3.2 }, uDirecto: { value: 0 }, uMax: { value: 220 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const o = this.halos = new THREE.Points(g, m); o.name = 'halos de focos'; o.frustumCulled = false; o.renderOrder = 6;
    const tam = new THREE.Vector2(); o.onBeforeRender = r => { const rt = r.getRenderTarget(); m.uniforms.uAlto.value = rt ? rt.height : r.getDrawingBufferSize(tam).y; for (const b of this.arena.beams || []) if (this.reduce || !b.puesto) { b.mat.uniforms.uStrength.value = b.base; b.puesto = true; } };      // los conos, con su fuerza desde el primer cuadro (en las fotos del banco quedaban en la inicial)
    this.arena.group.add(o);
  }

  /** Conos de bruma de la clave y de los dos contraluces. Solo se ven con post (setNivel). */
  _rayos(L) {
    const geo = new THREE.CylinderGeometry(.05, 1, 1, 32, 1, true); geo.translate(0, -.5, 0); this.rayos = [];
    const rayo = (l, fuerza, abre) => {
      const hasta = l.target.position.clone(); hasta.y = 0; const len = l.position.distanceTo(hasta) * 1.03, rad = Math.tan(l.angle * abre) * len;
      const mat = new THREE.ShaderMaterial({ name: 'rayo de luz', vertexShader: RAYO_VS, fragmentShader: RAYO_FS, uniforms: { uColor: { value: l.color.clone() }, uFuerza: { value: fuerza }, uTiempo: this.T }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const g = new THREE.Group(); g.position.copy(l.position); g.lookAt(hasta); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat); m.scale.set(rad, len, rad); m.renderOrder = 5; m.frustumCulled = false; g.add(m); this.group.add(g); this.rayos.push({ mat, base: fuerza });
    };
    rayo(L.rimA, .02, .5); rayo(L.rimB, .016, .5);      // (el cono de la clave y los del truss del frente lavaban de beige las tribunas: fuera)
    // conos anchos y suaves desde el puente de focos y las torres hasta la tarima (focos de mentira: solo el volumen de bruma)
    const foco = (p, t, color, ang) => ({ position: new THREE.Vector3(...p), target: { position: new THREE.Vector3(...t) }, color: new THREE.Color(color), angle: ang });
    for (const x of [-3.0, -1.0, 1.0, 3.0]) rayo(foco([x, 3.56, -4.86], [x * .35, 0, .6], x < 0 ? '#ffd0a0' : '#dfe8ff', .2), .014, 1);
    for (const s2 of [-1, 1]) rayo(foco([s2 * 7.22, 4.6, -4.4], [s2 * .6, 0, 0], s2 < 0 ? '#ffb877' : '#cfe0ff', .17), .013, 1);
    for (const s2 of [-1, 1]) rayo(foco([s2 * 4.02, 3.0, -4.4], [-s2 * .9, 0, .9], s2 < 0 ? '#ffb877' : '#cfe0ff', .16), .02, 1);      // haces de las torres de contraluz, cruzados detrás del pesista      // haces angostos y definidos: anchos eran un banco de niebla beige sobre la tribuna      // solo los dos contraluces: los conos de la clave y del pelo casi no se veían y eran pantalla entera de mezcla
    this.group.visible = false;
  }

  /** Lo que depende de la calidad: los rayos solo con post y haces; `A.rayos` escala su fuerza. */
  setNivel(Q) {
    const sup = !Q.directo && (Q.amb?.superficies ?? true); setSuperficies(sup);
    // camino directo: la pantalla sin grano por píxel y la utilería sin mapa de normales (se pagaban en «Baja» y «Móvil»)
    { const d = !!Q.directo; if (this.ledPlano !== d) { this.ledPlano = d; const m = this.arena.pantalla?.material; if (m) m.needsUpdate = true; }
      // la utilería en el camino directo: solo el mapa de color (sin normales ni rugosidad) y sin las calcomanías del piso
      // (mezcla con luces sobre mucha pantalla): el banco decía que la utilería era el 20 % del cuadro de «Baja»
      for (const m of this.utilMats || []) { const n = d ? null : m.userData.normal, g = d ? null : m.userData.rug; if (m.normalMap !== n || m.roughnessMap !== g) { m.normalMap = n; m.roughnessMap = g; m.roughness = d ? .6 : 1; m.needsUpdate = true; } }
      for (const o of this.calcos || []) o.visible = !d || /charcos/.test(o.material.name);
      // medido (run 43827293011): ni sin mapas la utilería entraba en la meta de «Baja» (+16 %); el banco dice que es el 22 % del cuadro.
      // En el camino directo no se dibuja (Media para arriba sí), hasta medir en una placa
      for (const o of this.utileria()) if (o !== this.props) o.visible = !d; this.props.visible = !d; }
    FINO.value = Q.directo ? 0 : 1;
    for (const m of LEJOS.fino) m.visible = !Q.directo; for (const m of LEJOS.liviano) m.visible = !!Q.directo;      // gente lejana: malla completa con post, liviana en Móvil y Baja
    if (this.haloMat) { this.haloMat.uniforms.uDirecto.value = Q.directo ? 1 : 0; this.haloMat.uniforms.uMax.value = Q.directo ? 72 : 240; for (const b of this.arena.beams || []) b.puesto = false; }      // en el camino directo, halos chicos: poca pantalla de mezcla
    // en el camino directo la pared de chapa (material físico en mucha pantalla) no se dibuja: queda el telón, como antes
    this.arena.group.traverse(o => { if (o.material === this.chapaMat) o.visible = sup; });      // la chapa es toda por función: sin superficies sería un paño liso
    BOKEH.uScale.value = Q.directo ? .12 : .18;      // luces de fondo: puntos con halo en el camino directo (eran discos grises), bokeh moderado con post      // superficies por función solo con post
    const A = Q.amb || {}, k = A.rayos ?? 1; this.group.visible = !Q.directo && !!Q.beams && k > 0;
    for (const r of this.rayos || []) r.mat.uniforms.uFuerza.value = r.base * k;
    const imp = this.arena.impostors; if (imp && !imp.userData.look) { imp.userData.look = true; imp.traverse(o => { if (o.material?.color) o.material.color.multiplyScalar(this.salaImpostor || 1); }); }
  }
  /** Gradación y brillo del pase final (post.js) para este look. */
  post(p) {
    const u = p.finalMat.uniforms, G = GRADO_LOOK;
    u.toneMappingExposure.value = G.exp; u.uSat.value = G.sat; u.uContrast.value = G.con; u.uShadowGamma.value = G.gam; u.uVignette.value = G.vin;
    u.uFrio.value.set(...G.frio); u.uCalido.value.set(...G.calido); u.uNegro.value = G.negro; u.uGrain.value = .012;
    if (p.bloom) { p.bloom.strength = .08; p.bloom.radius = .3; p.bloom.threshold = 2.6; }
    // menos desenfoque de fondo que la transmisión de antes: la sala (utilería, chapa, público) tiene que leerse
    for (const m of [p.dofPre, p.dofBlur, p.mixMat]) if (m?.uniforms.uScale) m.uniforms.uScale.value = .18;
    if (p.mixMat) p.mixMat.uniforms.uBloomClamp.value = 7;
  }
  update(dt) { if (!this.reduce) this.T.value += dt; }
  dispose() { this.group.removeFromParent(); for (const t of this.texturas) t.dispose(); for (const r of this.rayos || []) r.mat.dispose(); }
}
