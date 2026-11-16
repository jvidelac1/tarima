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

/** Gradación del juego: exposición, saturación, contraste, gamma de sombras, tinte de sombras y de altas, viñeta y negro. */
export const GRADO_LOOK = Object.freeze({ exp: 1.0, sat: .88, con: 1.03, gam: 1.0, frio: [.92, .995, 1.09], calido: [1.07, 1.0, .91], vin: .36, negro: .01 });
/** Niebla y fondo de la sala (a oscuras, azul petróleo). */
export const SALA = Object.freeze({ fondo: '#04060a', niebla: '#070b12', densidad: .021 });

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
  for (let i = 0; i < NP; i++) { const cortes = []; let z = -r() * 1.6; while (z < 4.2) { z += 1.1 + r() * 1.5; cortes.push([z, r(), r(), r() * 50]); } tablas.push(cortes); }
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
    const t = cl((.6 * hilos + .4 * banda * (.35 + .65 * nD(gx * 26 + off, z * 1.3))) * 1.15 - .08 + (B[1] - .5) * .42), tono = (.8 + .3 * B[2]) * (.78 + .36 * M[0]);
    let R = (.80 - .31 * t) * tono, G = (.60 - .29 * t) * tono, Bc = (.37 - .22 * t) * tono, h = .62 + (hilos - .5) * .12, rg = .3 + .14 * hilos;
    // barniz comido donde se paran: más claro, más parejo y mate
    const st = Math.exp(-((cx / 1.05) * (cx / 1.05) + ((cz - .12) / .75) * ((cz - .12) / .75))), w = cl(st * 1.35 * (.3 + .95 * M[1]));
    R += (R * 1.1 + .06 - R) * w * .55; G += (G * 1.1 + .055 - G) * w * .55; Bc += (Bc * 1.12 + .05 - Bc) * w * .55; rg += w * .36;
    // donde caen los discos: marcas de goma, abolladuras
    const ax = (Math.abs(cx) - .97) / .19, gl = ax * ax < 9 ? Math.exp(-ax * ax) * sm(-.8, -.35, cz) * (1 - sm(.6, .98, cz)) : 0;
    if (gl > .01) { const mk = gl * (.35 + .9 * M[3]), kk = 1 - .5 * cl(mk); R *= kk; G *= kk; Bc *= kk; rg += mk * .25; h -= gl * sm(.64, .82, nC(x * 36, z * 36)) * .3; }
    // magnesio en nubes
    const ch = cl(sm(.5, .74, M[2] * (.42 + .95 * st + .5 * gl)) * .5);
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
  const motas = []; for (let k = 0; k < 4200; k++) { const lado = rr() < .3 ? (rr() < .5 ? -1 : 1) * (.97 + (rr() - .5) * .3) : (rr() + rr() - 1) * 1.1; motas.push([S * (lado / 4 + .5), S * ((.12 + (rr() + rr() + rr() - 1.5) * .55) / 4 + .5), 1 + rr() * 1.7, .12 + rr() * .45]); }
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
  const nA = ruido(11), nB = ruido(12), pal = [[.34, .37, .44], [.46, .47, .49], [.22, .3, .42], [.6, .6, .6], [.3, .31, .33]];
  const lento = grillas(256, 2, (u, v, o) => { o[0] = fbm(nA, u * 8, v * 8, 4); o[1] = fbm(nB, u * 4 + 3, v * 4, 3); }), M = new Float32Array(2);
  const c = generar(S, (u, v, o, px, py) => {
    lento(u, v, M); const polvo = M[0], mancha = M[1], fino = hash2(px, py), fu = (u * 2) % 1, fv = (v * 2) % 1, du = fu < .5 ? fu : 1 - fu, dv = fv < .5 ? fv : 1 - fv, dj = du < dv ? du : dv;
    let k = .05 + .028 * sm(.4, .8, polvo) + (fino - .5) * .012, R = k, G = k * 1.02, B = k * 1.08, h = .5 + (fino - .5) * .3, rg = .5 + .32 * sm(.35, .75, polvo) - .16 * sm(.55, .8, mancha);
    const mx = px >> 1, my = py >> 1, hm = hash2(mx + 91, my + 17);
    if (hm < .085) { const P = pal[(hash2(mx, my) * pal.length) | 0], a = .35 + hm * 5; R += (P[0] - R) * a * .5; G += (P[1] - G) * a * .5; B += (P[2] - B) * a * .5; h += .1; rg += .08; }
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

// ---------- gráficas ----------
/** Fondo de la pantalla LED: casi negro, con líneas finas y dos paneles apagados; lo brillante son los textos y las luces. */
function ledFondo(w, h) {
  return makeCanvas(w, h, g => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#0b1a22'); gr.addColorStop(.35, '#070c12'); gr.addColorStop(.65, '#0b0a0d'); gr.addColorStop(1, '#22140b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = -2; i < 26; i++) { const x = i * w / 24, calido = i >= 12; g.fillStyle = calido ? `rgba(255,150,60,${.035 + .03 * (i & 1)})` : `rgba(70,190,210,${.03 + .028 * (i & 1)})`; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * .012, 0); g.lineTo(x + w * .05, h); g.lineTo(x + w * .038, h); g.closePath(); g.fill(); }
    const cg = g.createRadialGradient(w / 2, h * .62, h * .1, w / 2, h * .62, w * .32); cg.addColorStop(0, 'rgba(0,0,0,.75)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,170,70,.85)'; g.fillRect(0, h * .93, w, h * .01); g.fillStyle = 'rgba(210,225,230,.5)'; g.fillRect(0, h * .952, w, h * .005);
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
  }

  /** Luz de competencia: sala a oscuras, clave casi cenital, contraluz cálido marcado desde atrás a la izquierda. */
  _luces(L) {
    L.key.position.set(1.6, 9.6, 4.8); L.key.color.set('#fff0dc'); L.key.intensity = 7.2; L.key.angle = .3; L.key.penumbra = .7;
    L.key2.color.set('#c6d6ff'); L.key2.intensity = .55;
    L.stage.color.set('#b9c6e0'); L.stage.intensity = .42;
    L.hemi.color.set('#56688a'); L.hemi.groundColor.set('#2c2016'); L.hemi.intensity = .1;
    L.wash.color.set('#8fa0c4'); L.wash.intensity = .07;
    // rimA mira a la cámara general (atrás a la izquierda): es EL contraluz, cálido y ancho (también rasa el piso)
    L.rimA.color.set('#ffa85c'); L.rimA.intensity = 9.5; L.rimA.angle = .46; L.rimA.penumbra = .85; L.rimA.position.set(-6.3, 5.6, -4.6);
    L.rimB.color.set('#9fd0ff'); L.rimB.intensity = 3.2; L.rimB.angle = .4;
    L.hair.color.set('#ffe2bc'); L.hair.intensity = 3.4;
  }
  _tarima(S, aniso) {
    const A = this.arena, m = A.madera; if (!m) return;
    const M = madera(S, aniso); for (const k of ['map', 'normalMap', 'roughnessMap']) { m[k]?.dispose(); m[k] = M[k]; this.texturas.push(M[k]); }
    m.color.setRGB(.86, .86, .86); m.roughness = 1; m.metalness = 0; m.normalScale.set(.9, .9); m.envMapIntensity = .7; m.needsUpdate = true;
    const canto = A.tarima?.material?.[0]; if (canto) { canto.color.set('#1b1612'); canto.roughness = .62; }
  }
  _piso(S, aniso) {
    const m = this.arena.alfombra; if (!m) return;
    const G = gomaPiso(S, aniso); for (const k of ['map', 'normalMap', 'roughnessMap']) { m[k]?.dispose(); m[k] = G[k]; this.texturas.push(G[k]); }
    m.color.setRGB(1, 1, 1); m.roughness = 1; m.normalScale.set(.9, .9); m.envMapIntensity = .5; m.needsUpdate = true; this.gomaPiso = G;
  }
  /** Lo que no está bajo los focos queda en penumbra: tribunas, pabellón, cintas y telón. */
  _sala() {
    const A = this.arena, k = (m, f) => { if (m && m.color) m.color.multiplyScalar(f); };
    if (A.crowd) { const u = A.crowd.material.uniforms; u.uGain.value = .05; if (u.uRebote) u.uRebote.value.set(.11, .075, .045); }
    A.group.traverse(o => {
      const m = o.material; if (!m || Array.isArray(m) || !m.isMeshBasicMaterial) return;
      if (o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop > 30) k(m, o.geometry.parameters.height > 5 ? .5 : .45);      // pabellón y cinta de luz
      else if (o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === 90) m.color.set('#090a0d');                                 // piso de sala
      else if (o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === 17) k(m, .55);                                               // telón
    });
    if (A.cinta) { const vistos = new Set(); for (const o of A.group.children) { const m = o.material; if (m?.map?.source === A.cinta.source && !vistos.has(m)) { vistos.add(m); k(m, .55); } } }
    for (const o of A.group.children) if (o.isInstancedMesh && o.material.isMeshBasicMaterial && o.geometry.type === 'BoxGeometry' && !o.material.map) k(o.material, .6);      // escalones y barandas
    // los focos del fondo: ámbar a la izquierda (acompañan al contraluz), blanco frío a la derecha; nada de rosa y celeste
    (A.beams || []).forEach((b, i) => b.mat.uniforms.uColor.value.set(i < 5 ? (i % 2 ? '#ffb469' : '#ffc890') : (i % 2 ? '#cfe0ff' : '#e9eeff')));
    this.salaImpostor = .45;
  }
  /** Pantalla LED: fondo oscuro y grano de píxel en el sombreador (un punto por LED; de lejos se promedia: sin muaré). */
  _pantalla() {
    const A = this.arena, amb = this.ambiente, m = A.pantalla?.material; if (!m || !amb?.led) return;
    amb.ledFondo = ledFondo(amb.led.width, amb.led.height); amb.sinRejilla = true; amb._led();
    m.color.multiplyScalar(1.5);
    const antes = m.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) {
      antes.call(this, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	{ vec2 ledP = vMapUv * vec2( 500.0, 175.0 ); vec2 ledF = abs( fract( ledP ) - 0.5 );
	  float ledM = ( 1.0 - smoothstep( 0.3, 0.48, max( ledF.x, ledF.y ) ) ) * ( 1.0 - smoothstep( 0.2, 0.62, length( ledF ) ) );
	  float ledW = clamp( max( fwidth( ledP.x ), fwidth( ledP.y ) ) * 1.6, 0.0, 1.0 );
	  diffuseColor.rgb *= mix( ledM * 1.75, 0.82, ledW ); }`);
    };
    m.customProgramCacheKey = () => 'led con grano'; m.needsUpdate = true;
  }

  _utileria(aniso, grande) {
    const P = this.props, S = grande ? 512 : 256, tx = (c, o) => { const M = mapas(c, { aniso, ...o }); this.texturas.push(M.map, M.normalMap, M.roughnessMap); return M; };
    const metal = new THREE.MeshStandardMaterial({ name: 'metal pintado', ...tx(metalPintado(S)), roughness: 1, metalness: .55, envMapIntensity: .9 });
    const acero = new THREE.MeshStandardMaterial({ name: 'acero', color: new THREE.Color('#aeb2b8'), roughness: .3, metalness: 1, envMapIntensity: 1.1 });
    const baul = new THREE.MeshStandardMaterial({ name: 'fenólico', ...tx(fenolico(S)), roughness: 1, metalness: 0, envMapIntensity: .5 });
    const ply = new THREE.MeshStandardMaterial({ name: 'terciado', ...tx(terciado(S)), roughness: 1, metalness: 0, envMapIntensity: .4 });
    const negro = new THREE.MeshStandardMaterial({ name: 'goma negra', color: new THREE.Color('#0d0d10'), roughness: .7, envMapIntensity: .4 });
    const tela = new THREE.MeshStandardMaterial({ name: 'tela', color: new THREE.Color('#b9b6ac'), roughness: .95 });
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
      const mat = new THREE.MeshStandardMaterial({ name: 'discos de utilería', color: new THREE.Color(1, 1, 1), roughness: 1, roughnessMap: G.roughnessMap || null, bumpMap: G.bumpMap || null, bumpScale: .35, envMapIntensity: .5 });
      const im = new THREE.InstancedMesh(geo, mat, discos.length), c = new THREE.Color(); discos.forEach(([m, col], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.set(col)); });
      im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.receiveShadow = true; im.name = 'discos de utilería'; this.arena.group.add(im); this.discos = im; }

    // calcomanías del piso: magnesio derramado junto a la magnesiera y a la caja, cinta y número
    const calcoDe = (tipo, x, z, w, ry = 0) => { const t = canvasTexture(calco(tipo), { aniso: 4 }); this.texturas.push(t);
      const m = new THREE.MeshStandardMaterial({ name: 'calco ' + tipo, map: t, transparent: true, depthWrite: false, roughness: tipo === 'tiza' ? 1 : .7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, w), m); o.rotation.set(-Math.PI / 2, 0, ry); o.position.set(x, Y0 + .003, z); o.receiveShadow = true; o.renderOrder = 1; P.add(o); };
    calcoDe('tiza', -3.15, -1.9, 1.7); calcoDe('tiza', 3.2, -1.95, 1.5, 1); calcoDe('cinta', -3.6, 3.3, 1.5); calcoDe('cinta', 3.6, -3.0, 1.5, Math.PI);

    // banderines ficticios colgados del truss del fondo, a los lados de las luces de arbitraje
    { const t = canvasTexture(banderines(), { aniso: 4 }); this.texturas.push(t); const N = 8, pos = [], uv = [], idx = [];
      const xs = [-6.6, -5.4, -4.2, -3.0, 3.0, 4.2, 5.4, 6.6];
      xs.forEach((x, i) => { const w = .5, y1 = 5.95, y0 = 4.45 + (i % 2) * .06, b = i * 4; pos.push(x - w, y0, -4.95, x + w, y0, -4.95, x + w, y1, -4.95, x - w, y1, -4.95); uv.push(i / N, 0, (i + 1) / N, 0, (i + 1) / N, 1, i / N, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ name: 'banderines', map: t, color: new THREE.Color(.2, .2, .2), side: THREE.DoubleSide })); o.frustumCulled = false; P.add(o); }
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
    rayo(L.key, .05, .8); rayo(L.rimA, .085, .62); rayo(L.rimB, .03, .6); rayo(L.hair, .03, .7);
    this.group.visible = false;
  }

  /** Lo que depende de la calidad: los rayos solo con post y haces; `A.rayos` escala su fuerza. */
  setNivel(Q) {
    const A = Q.amb || {}, k = A.rayos ?? 1; this.group.visible = !Q.directo && !!Q.beams && k > 0;
    for (const r of this.rayos || []) r.mat.uniforms.uFuerza.value = r.base * k;
    const imp = this.arena.impostors; if (imp && !imp.userData.look) { imp.userData.look = true; imp.traverse(o => { if (o.material?.color) o.material.color.multiplyScalar(this.salaImpostor || 1); }); }
  }
  /** Gradación y brillo del pase final (post.js) para este look. */
  post(p) {
    const u = p.finalMat.uniforms, G = GRADO_LOOK;
    u.toneMappingExposure.value = G.exp; u.uSat.value = G.sat; u.uContrast.value = G.con; u.uShadowGamma.value = G.gam; u.uVignette.value = G.vin;
    u.uFrio.value.set(...G.frio); u.uCalido.value.set(...G.calido); u.uNegro.value = G.negro; u.uGrain.value = .028;
    if (p.bloom) { p.bloom.strength = .34; p.bloom.radius = .55; p.bloom.threshold = 1.35; }
    if (p.mixMat) p.mixMat.uniforms.uBloomClamp.value = 7;
  }
  update(dt) { if (!this.reduce) this.T.value += dt; }
  dispose() { this.group.removeFromParent(); for (const t of this.texturas) t.dispose(); for (const r of this.rayos || []) r.mat.dispose(); }
}
