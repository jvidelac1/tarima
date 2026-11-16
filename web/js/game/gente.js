// Personas por código (Gráficos fase 4): un solo constructor para el público, los jueces y los oficiales. Sin imágenes ni
// caras de nadie: todo sale de perfiles y medidas (cabeza de 23 cm de mentón a coronilla, hombros de 41 cm, sentado 90 cm).
// Cada persona es una lista de piezas { g, parte }: `parte` dice qué es (piel, pelo, traje, camisa, corbata, pantalon,
// zapato, silla) y quien la usa decide el color. Mira a +z, con el piso en y = 0.
// - jueces.js: piezas con color por vértice y luz pintada (una malla por mesa).
// - publico.js: dibuja 16 variantes a un atlas (luz de sala, luz del escenario, material) para las siluetas instanciadas.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
/** Azar con semilla (mulberry32): las mismas personas en cada carga. */
export function azar(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const se = (c, p) => Math.sign(c) * Math.abs(c) ** p;      // superelipse

/** Malla a partir de una grilla de puntos [fila][columna] cerrada en columnas; `polo0`/`polo1`: punto que cierra cada extremo. */
function grilla(filas, { polo0 = null, polo1 = null } = {}) {
  const n = filas[0].length, pos = [], idx = [];
  for (const f of filas) for (const p of f) pos.push(p.x, p.y, p.z);
  for (let j = 0; j < filas.length - 1; j++) for (let k = 0; k < n; k++) { const a = j * n + k, b = j * n + (k + 1) % n, c = a + n, d = b + n; idx.push(a, c, b, b, c, d); }
  if (polo0) { const t = pos.length / 3; pos.push(polo0.x, polo0.y, polo0.z); for (let k = 0; k < n; k++) idx.push(k, (k + 1) % n, t); }
  if (polo1) { const t = pos.length / 3, o = (filas.length - 1) * n; pos.push(polo1.x, polo1.y, polo1.z); for (let k = 0; k < n; k++) idx.push(o + k, t, o + (k + 1) % n); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Tronco por secciones horizontales [y, radio x, radio z, centro z, exponente]: superelipses, cerrado arriba y abajo. */
function tronco(sec, n = 16) {
  const filas = sec.map(([y, rx, rz, zc = 0, e = 2.5]) => { const p = 2 / e, f = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; f.push(V(rx * se(Math.cos(a), p), y, zc + rz * se(Math.sin(a), p))); } return f; });
  const a = sec[0], b = sec[sec.length - 1];
  return grilla(filas, { polo0: V(0, a[0] - .01, a[3] || 0), polo1: V(0, b[0] + .008, b[3] || 0) });
}
/** Miembro: tubo que pasa por `pts` (Vector3) con radios [ancho, fondo] por punto; se suaviza con una curva. */
function miembro(pts, radios, n = 8, pasos = 4) {
  const curva = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), m = (pts.length - 1) * pasos, filas = [];
  let u = null;
  for (let i = 0; i <= m; i++) {
    const t = i / m, c = curva.getPoint(t), tg = curva.getTangent(t), x = t * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(x)), f = x - k;
    const ra = mix(radios[k][0], radios[k + 1][0], f), rb = mix(radios[k][1] ?? radios[k][0], radios[k + 1][1] ?? radios[k + 1][0], f);
    // marco sin torsión: el eje de ancho se arrastra de una sección a la otra
    u = (u ? u.clone() : Math.abs(tg.y) > .9 ? V(1, 0, 0) : V(0, 1, 0).cross(tg)).addScaledVector(tg, -(u ? u.dot(tg) : 0)).normalize(); const w = u.clone().cross(tg);
    const fila = []; for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2; fila.push(c.clone().addScaledVector(u, Math.cos(a) * ra).addScaledVector(w, Math.sin(a) * rb)); }
    filas.push(fila);
  }
  const tg0 = curva.getTangent(0), tg1 = curva.getTangent(1), r0 = radios[0][0], r1 = radios[radios.length - 1][0];
  return grilla(filas, { polo0: pts[0].clone().addScaledVector(tg0, -r0 * .5), polo1: pts[pts.length - 1].clone().addScaledVector(tg1, r1 * .6) });
}
/** Codo de un brazo de dos tramos (largos l1 y l2) entre el hombro S y la mano H, abierto hacia `polo`. */
function codo(S, H, l1, l2, polo) {
  const d = H.clone().sub(S); let L = d.length(); const max = (l1 + l2) * .995; if (L > max) { d.multiplyScalar(max / L); L = max; }
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), dir = d.clone().normalize();
  const lado = polo.clone().addScaledVector(dir, -polo.dot(dir)).normalize();
  return { E: S.clone().addScaledVector(dir, a).addScaledVector(lado, h), H: S.clone().add(d) };
}

// ---------- cabeza ----------
// Perfil de la cabeza de un adulto, del mentón (y = 0) a la coronilla (0,232): [y, medio ancho, z del frente, z de atrás].
const PERFIL = [[0, .021, .068, .034], [.012, .035, .079, .014], [.03, .048, .087, -.018], [.055, .0585, .0905, -.05], [.08, .0645, .092, -.073], [.105, .068, .0905, -.087],
  [.13, .0705, .0885, -.095], [.155, .0725, .09, -.099], [.18, .0705, .0845, -.097], [.2, .064, .071, -.087], [.217, .049, .049, -.065], [.228, .027, .023, -.037]];
const Y_TOPE = .232;
/** Sección de la cabeza a la altura y: medio ancho, centro y radio en z (debajo del mentón sigue recto: de ahí cuelga el pelo largo). */
function perfil(y) {
  const P = PERFIL; if (y <= 0) return { rx: .06, zc: -.05, rz: .05 };
  let k = 0; while (k < P.length - 2 && y > P[k + 1][0]) k++;
  const a = P[k], b = P[k + 1], t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0]))), rx = mix(a[1], b[1], t), zf = mix(a[2], b[2], t), zb = mix(a[3], b[3], t);
  return { rx, zc: (zf + zb) / 2, rz: (zf - zb) / 2 };
}
const EXP = 2 / 2.25;
/** Punto de la superficie de la cabeza a la altura y y el ángulo a (0 = +x, π/2 = frente), inflado `mas` metros hacia afuera. */
function enCabeza(y, a, mas = 0, forma = null) {
  const p = perfil(y), c = Math.cos(a), s = Math.sin(a), ancho = forma?.ancho ?? 1, mand = forma ? 1 + (forma.mandibula - 1) * suave(.09, .02, y) : 1;
  return V((p.rx * ancho * mand + mas) * se(c, EXP), y, p.zc + (p.rz + mas) * se(s, EXP));
}
const G2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
/**
 * Relieve de la cara (metros hacia afuera) en el punto (x, y) del frente de la cabeza: cuencas, arco de las cejas, pómulos,
 * nariz con lomo, punta y aletas, labios con su línea, mentón. Medidas de un adulto: ojos a 128 mm del mentón y 62 mm entre
 * pupilas, base de la nariz a 80 mm, boca a 52 mm.
 */
function relieve(x, y) {
  let d = 0;
  for (const s of [-1, 1]) {
    d -= .0085 * G2(x, y, s * .031, .127, .0165, .0105);      // cuenca
    d += .0032 * G2(x, y, s * .03, .1465, .022, .0055);       // arco superciliar
    d += .0036 * G2(x, y, s * .047, .1, .019, .017);          // pómulo
    d += .0058 * G2(x, y, s * .0125, .0855, .0058, .0062);    // aleta de la nariz
    d -= .0022 * G2(x, y, s * .026, .07, .008, .016);         // surco de la nariz a la boca
  }
  d += .0026 * G2(x, y, 0, .147, .011, .008);                 // entrecejo
  const t = suave(.14, .089, y), lomo = (.0028 + .0215 * t * t) * Math.exp(-((x / (.0058 + .0078 * t)) ** 2)) * suave(.0755, .0865, y) * suave(.156, .138, y);
  d += lomo;
  d += .0036 * G2(x, y, 0, .0585, .0205, .0042) + .0042 * G2(x, y, 0, .0452, .018, .005) - .0032 * G2(x, y, 0, .0518, .023, .0017);      // labios y su línea
  d -= .0022 * G2(x, y, 0, .0345, .02, .005) ; d += .0045 * G2(x, y, 0, .019, .021, .013);      // hueco bajo el labio y mentón
  return d;
}
/** z de la cara (con relieve) en (x, y): para apoyar ojos, cejas y anteojos sobre la superficie. */
function zCara(x, y, forma) {
  const p = perfil(y), ancho = forma?.ancho ?? 1, mand = forma ? 1 + (forma.mandibula - 1) * suave(.09, .02, y) : 1;
  const c = Math.min(1, Math.abs(x) / (p.rx * ancho * mand)) ** (1 / EXP), sn = Math.sqrt(Math.max(0, 1 - c * c));
  return p.zc + p.rz * sn ** EXP + relieve(x, y);
}
/**
 * Cabeza con cuello, cara y orejas. `forma`: { ancho, mandibula, barba } (1 = media; barba 0 a 1: sombra de barba).
 * `n` ≥ 24: cabeza fina (los jueces y el atlas del público), con la malla más densa en la cara, ojos con párpados, cejas y,
 * si se pide, anteojos. La cara va pintada en `sombra` (por vértice, 0 a 1) y `tinte` (rgb: labios, mejillas, barba), que
 * cada uso multiplica en su color.
 */
function cabeza(n, forma, { anteojos = false } = {}) {
  const fino = n >= 24, NA = fino ? 46 : n, NY = fino ? 44 : 22, filas = [];
  // columnas: más juntas en el frente (la cara) que en la nuca
  const ang = k => { const t = k / NA * Math.PI * 2 - Math.PI; return Math.PI / 2 + t - (fino ? .56 : 0) * Math.sin(t); };
  for (let j = 0; j <= NY; j++) { const y = Math.max(.0005, .228 * j / NY), f = []; for (let k = 0; k < NA; k++) { const p = enCabeza(y, ang(k), 0, forma); if (fino && p.z > .012) p.z += relieve(p.x, y) * suave(.012, .04, p.z); f.push(p); } filas.push(f); }
  const g = grilla(filas, { polo0: V(0, -.004, .05), polo1: V(0, Y_TOPE, -.008) }), P = g.attributes.position, sombra = new Float32Array(P.count).fill(1), tinte = new Float32Array(P.count * 3).fill(1), barba = forma?.barba ?? 0;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (z < .02) continue;
    let k = 1;
    if (fino) {
      for (const s of [-1, 1]) { k -= .5 * G2(x, y, s * .031, .1305, .02, .0105); k -= .5 * G2(x, y, s * .0085, .0805, .0045, .003); k -= .16 * G2(x, y, s * .0165, .104, .006, .02); k -= .1 * G2(x, y, s * .05, .07, .014, .03); }      // cuencas y narinas
      k -= .62 * G2(x, y, 0, .0518, .022, .0024); k -= .12 * G2(x, y, 0, .076, .018, .005);                                                  // línea de la boca y bajo la nariz
      const labio = Math.max(G2(x, y, 0, .058, .019, .0042), G2(x, y, 0, .0452, .017, .0048)), mej = Math.max(G2(x, y, -.046, .094, .02, .02), G2(x, y, .046, .094, .02, .02));
      const bb = barba * suave(.092, .064, y) * (1 - .85 * labio) * (1 - .6 * G2(x, y, 0, .09, .012, .02));
      const L = .9 * labio, M = .75 * Math.max(mej, G2(x, y, 0, .092, .012, .012));
      tinte[i * 3] = (1 + .04 * M) * (1 - .26 * bb) * (1 - .04 * L); tinte[i * 3 + 1] = (1 - .3 * L - .06 * M) * (1 - .24 * bb); tinte[i * 3 + 2] = (1 - .3 * L - .08 * M) * (1 - .2 * bb);
    } else {
      for (const s of [-1, 1]) { k -= .5 * Math.exp(-(((x - s * .031) / .017) ** 2 + ((y - .128) / .011) ** 2)); k -= .3 * Math.exp(-(((x - s * .03) / .02) ** 2 + ((y - .143) / .0045) ** 2)); }      // cuencas y cejas
      k -= .38 * Math.exp(-((x / .024) ** 2 + ((y - .052) / .0045) ** 2));      // boca
      k -= .22 * Math.exp(-((x / .02) ** 2 + ((y - .078) / .006) ** 2));        // bajo la nariz
    }
    k -= .18 * suave(.02, 0, y);                                              // bajo el mentón
    sombra[i] = Math.max(.25, k);
  }
  g.setAttribute('sombra', new THREE.BufferAttribute(sombra, 1)); g.setAttribute('tinte', new THREE.BufferAttribute(tinte, 3));
  const piezas = [{ g, parte: 'piel' }], ax = forma?.ancho ?? 1;
  if (!fino) {
    // nariz: cuña con puente, punta y aletas
    const nz = new THREE.BufferGeometry(), pn = [0, .132, .09, 0, .088, .114, -.0165, .08, .09, .0165, .08, .09, 0, .077, .096, -.011, .112, .085, .011, .112, .085];
    nz.setAttribute('position', new THREE.Float32BufferAttribute(pn, 3)); nz.setIndex([0, 5, 1, 0, 1, 6, 5, 2, 1, 6, 1, 3, 2, 4, 1, 4, 3, 1]); nz.computeVertexNormals(); piezas.push({ g: nz, parte: 'piel' });
  } else {
    const esf = (r, c, e = V(1, 1, 1)) => { const o = new THREE.SphereGeometry(r, 12, 9); o.applyMatrix4(new THREE.Matrix4().compose(c, new THREE.Quaternion(), e)); return o; };
    for (const s of [-1, 1]) {
      const ex = s * .031, ey = .1272, R = .0118, c = V(ex, ey, zCara(ex, ey, forma) - R + .0042);
      piezas.push({ g: esf(R, c), parte: 'esclera' }, { g: esf(.0064, c.clone().add(V(-s * .0008, -.0004, R - .0036))), parte: 'iris' });
      // párpados: dos casquetes de piel apenas más grandes que el ojo, corridos arriba y abajo; queda una hendidura de 7 mm
      piezas.push({ g: esf(.0134, c.clone().add(V(0, .0046, -.0008)), V(1.12, 1, 1)), parte: 'piel' }, { g: esf(.0128, c.clone().add(V(0, -.0074, -.0018)), V(1.1, 1, 1)), parte: 'piel' });
      { const pos = [], idx = [], NL = 6; for (let i = 0; i <= NL; i++) { const dx = (i / NL - .5) * .023, yy = c.y + .0012 - 18 * dx * dx, zz = c.z + Math.sqrt(Math.max(1e-6, .0134 * .0134 - dx * dx / 1.25)) - .0002; pos.push(c.x + dx, yy + .0011, zz, c.x + dx, yy - .0006, zz + .0004); }
        for (let i = 0; i < NL; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const lp = new THREE.BufferGeometry(); lp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lp.setIndex(idx); lp.computeVertexNormals(); piezas.push({ g: lp, parte: 'iris' }); }
      // ceja: una tira de pelo apoyada en el arco, más gruesa adentro, con una leve curva
      const pos = [], idx = [], NB = 7;
      for (let i = 0; i <= NB; i++) { const u = i / NB, x = s * (.011 + .043 * u), y = .1462 + .0042 * Math.sin(Math.PI * u ** .8) - .0034 * u * u, th = .0048 - .0026 * u; for (const q of [-1, 1]) { const yy = y + q * th; pos.push(x, yy, zCara(x, yy, forma) + .0016); } }
      for (let i = 0; i < NB; i++) { const a = i * 2; if (s > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const cj = new THREE.BufferGeometry(); cj.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cj.setIndex(idx); cj.computeVertexNormals(); piezas.push({ g: cj, parte: 'pelo' });
      if (anteojos) {
        const zl = zCara(ex, .127, forma) + .0125, aro = new THREE.TorusGeometry(.0228, .0015, 5, 22); aro.applyMatrix4(new THREE.Matrix4().compose(V(ex, .1265, zl), new THREE.Quaternion(), V(1.08, .86, 1))); piezas.push({ g: aro, parte: 'marco' });
        piezas.push({ g: new THREE.BoxGeometry(.0026, .0026, .095).translate(s * .0585 * ax, .129, zl - .05), parte: 'marco' });
      }
    }
    if (anteojos) piezas.push({ g: new THREE.BoxGeometry(.016, .0024, .0024).translate(0, .131, zCara(.031, .127, forma) + .0125), parte: 'marco' });
  }
  for (const s of [-1, 1]) { const o = new THREE.SphereGeometry(1, 8, 6); o.applyMatrix4(new THREE.Matrix4().compose(V(s * .0735 * ax, .112, -.012), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * -.35, s * -.12)), V(.009, .03, .017))); piezas.push({ g: o, parte: 'piel' }); }
  piezas.push({ g: miembro([V(0, -.1, -.03), V(0, -.03, -.022), V(0, .04, -.012)], [[.056, .058], [.05, .052], [.05, .05]], Math.max(8, n >> 1), 2), parte: 'piel' });      // cuello
  return piezas;
}
/**
 * Pelo: una cáscara sobre la cabeza entre la línea de nacimiento (por ángulo) y la coronilla, con volumen y mechones.
 * estilo: 'corto' | 'rapado' | 'entradas' | 'melena' | 'largo' | 'rodete' | 'cola'.
 */
function pelo(estilo, n, r, forma) {
  const E = { corto: [.176, .118, .028, .02], rapado: [.18, .125, .04, .004], entradas: [.2, .112, .03, .009], melena: [.172, .06, -.06, .028], largo: [.172, .05, -.2, .024], rodete: [.176, .112, .03, .009], cola: [.176, .112, .03, .01] }[estilo] || [.176, .118, .028, .014];
  const [yF, yL, yA, gr] = E, NV = 9, filas = [], fase = r() * 6.28;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, f = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      // nacimiento: frente alta con leve pico, baja en la sien hasta la patilla delante de la oreja, y nuca
      const y0 = s > 0 ? mix(yL, yF, suave(.25, .8, s)) - .012 * Math.exp(-(((s - .72) / .12) ** 2)) * (estilo === 'entradas' ? -2.2 : 1) : mix(yL, yA, suave(.05, .75, -s));
      const y = mix(y0, .2295, 1 - (1 - v) ** 1.35), bajo = y < 0;
      // volumen: nace pegado, se abre enseguida; más arriba y atrás que en la sien; mechones
      const mech = 1 + .28 * Math.sin(a * 7 + fase + v * 3) * Math.sin(v * 9 + a * 3 + fase) + .14 * Math.sin(a * 17 + v * 11);
      const mas = gr * (.25 + .75 * suave(0, .22, v)) * (.75 + .25 * suave(.1, .19, y)) * mech + .0015;
      const p = enCabeza(Math.max(y, -.2), a, mas, forma); p.y += mas * suave(.15, .225, y) * .95;
      if (bajo) { const cae = suave(0, -.1, y); p.x *= 1 + .12 * cae; p.z -= .012 * cae; if (s > -.2) p.z = Math.min(p.z, -.02); }      // el pelo largo cae detrás de los hombros
      f.push(p);
    }
    filas.push(f);
  }
  const gp = grilla(filas, { polo1: V(0, Y_TOPE + gr * 1.02 + .002, -.012) }), so = new Float32Array(gp.attributes.position.count).fill(1);
  // mechones (franjas que siguen la caída del pelo), raíz más oscura y un brillo ancho en la coronilla
  for (let j = 0; j <= NV; j++) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, v = j / NV; so[j * n + k] = (.72 + .2 * Math.sin(a * 5 + fase) + .12 * Math.sin(a * 9 + v * 4 + fase * 2)) * (.7 + .3 * suave(0, .25, v)) * (1 + .45 * Math.exp(-(((v - .62) / .16) ** 2))); }
  gp.setAttribute('sombra', new THREE.BufferAttribute(so, 1));
  const piezas = [{ g: gp, parte: 'pelo' }];
  if (estilo === 'rodete') { const o = new THREE.SphereGeometry(.036, 10, 8); o.translate(0, .19, -.105); piezas.push({ g: o, parte: 'pelo' }); }
  if (estilo === 'cola') piezas.push({ g: miembro([V(0, .165, -.1), V(0, .13, -.135), V(0, .04, -.13), V(0, -.06, -.115)], [[.022, .02], [.026, .022], [.022, .018], [.01, .008]], 8, 3), parte: 'pelo' });
  return piezas;
}

// ---------- cuerpo ----------
/** Mano: palma, dedos juntos y pulgar. Sale de la muñeca W en la dirección f, con la palma hacia `palma`. */
function mano(W, f, palma, k = 1) {
  const lado = f.clone().cross(palma).normalize(), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado, f.clone().cross(lado).normalize(), f));
  const out = [], el = (c, e, n = 7) => { const o = new THREE.SphereGeometry(1, n, 5); o.applyMatrix4(new THREE.Matrix4().compose(c, q, e)); out.push({ g: o, parte: 'piel' }); };
  el(W.clone().addScaledVector(f, .042 * k), V(.041 * k, .017 * k, .046 * k), 8);                                  // palma
  // cuatro dedos juntos, apenas curvados hacia la palma, de largo desparejo; pulgar abierto
  for (let i = 0; i < 4; i++) { const u = (i - 1.5) * .0195 * k, L = [.036, .041, .039, .031][i] * k; el(W.clone().addScaledVector(f, .084 * k + L * .8).addScaledVector(lado, u).addScaledVector(palma, .006 * k), V(.0092 * k, .0085 * k, L), 6); }
  el(W.clone().addScaledVector(f, .05 * k).addScaledVector(lado, .043 * k).addScaledVector(palma, .004 * k), V(.012 * k, .011 * k, .034 * k), 6);
  return out;
}
/**
 * Brazo con manga y mano, del hombro S a la mano en H. `manga`: 'larga' (saco, buzo) o 'corta' (remera: antebrazo de piel).
 * Devuelve piezas; `tramos` separa brazo (0) y antebrazo con mano (1) para animarlos (paleta del árbitro).
 */
export function brazo(S, H, { lado = 1, polo = null, manga = 'larga', tela = 'traje', k = 1, n = 8, palma = null, grosor = 1 } = {}) {
  const l1 = .29 * k, l2 = .26 * k, { E, H: W } = codo(S, H, l1, l2, polo || V(lado * .6, -.6, -.5)), f = W.clone().sub(E).normalize(), g = grosor;
  const sup = miembro([S.clone().add(V(0, .012, 0)), S.clone().lerp(E, .5), E], [[.064 * g, .066 * g], [.054 * g, .056 * g], [.046 * g, .048 * g]], n, 3);
  const inf = miembro([E, E.clone().lerp(W, .55), W], [[.047 * g, .048 * g], [.042 * g, .043 * g], [manga === 'larga' ? .034 * g : .028, manga === 'larga' ? .032 * g : .025]], n, 3);
  const pz = [{ g: sup, parte: tela, tramo: 0 }, { g: inf, parte: manga === 'larga' ? tela : 'piel', tramo: 1 }];
  for (const m of mano(W, f, palma || V(0, -1, 0).addScaledVector(f, f.y).normalize(), k * .86)) pz.push({ ...m, tramo: 1 });
  return { piezas: pz, S, E, W, f };
}
/** Manos de cada gesto, por lado (s = ±1), para una persona sentada con los hombros a la altura hy. */
const GESTOS = {
  falda: (s, hy) => [V(s * .1, hy - .43, .3), V(s * .7, -.5, -.4)],
  mesa: (s, hy) => [V(s * .15, hy - .2, .41), V(s * .6, -.6, -.5)],
  cruzados: (s, hy) => [V(-s * .09, hy - .2 + s * .025, .16), V(s * .8, -.6, .1)],
  menton: (s, hy) => s > 0 ? [V(.035, hy + .1, .13), V(.5, -.8, .2)] : [V(.1, hy - .26, .2), V(-.8, -.5, .1)],
  telefono: (s, hy) => [V(s * .055, hy + .19, .3), V(s * .7, -.7, 0)],
  aplauso: (s, hy) => [V(s * .022, hy - .04, .3), V(s * .8, -.6, 0)],
  arriba: (s, hy) => [V(s * .3, hy + .5, .06), V(s * .9, 0, -.5)],
  abajo: (s, hy) => [V(s * .25, hy - .56, .04), V(s * .3, -.2, -.9)],
  atras: (s, hy) => [V(s * .1, hy - .5, -.14), V(s * .9, 0, -.3)],
  puno: (s, hy) => s > 0 ? [V(.26, hy + .46, .12), V(.9, 0, -.4)] : [V(-.1, hy - .43, .3), V(-.7, -.5, -.4)],
};
/**
 * Persona sentada. opciones: cuerpo (0 angosto … 1 ancho), talla (escala), pelo (estilo), forma de cabeza, ropa ('saco',
 * 'remera', 'buzo'), gesto (clave de GESTOS o función), det (0 lejos, 1 cerca), silla, sinBrazo (lado que se arma aparte),
 * piernas. Devuelve { piezas, hombro(s), hy }.
 */
export function persona({ cuerpo = .5, talla = 1, pelo: estilo = 'corto', forma = null, ropa = 'saco', gesto = 'falda', det = 1, silla = false, sinBrazo = 0, piernas = true, corbata = true, semilla = 1, cabezaGiro = 0, cabezaInc = 0, anteojos = false, dePie = false } = {}) {
  const r = azar(semilla), P = [], add = (g, parte) => P.push({ g, parte }), n = det ? 18 : 12, nl = det ? 10 : 7;
  const w = mix(.86, 1.08, cuerpo), hy = 1.0, sx = .2 * w;
  if (silla) {
    add(new THREE.BoxGeometry(.44, .04, .42).translate(0, .45, -.02), 'silla'); add(new THREE.BoxGeometry(.4, .36, .035).translate(0, .71, -.235), 'silla');
    for (const a of [-1, 1]) for (const b of [-1, 1]) add(new THREE.BoxGeometry(.03, .45, .03).translate(a * .19, .225, -.02 + b * .18), 'silla');
  }
  if (dePie) piernas = false;
  if (piernas) for (const s of [-1, 1]) {
    add(miembro([V(s * .095, .545, -.06), V(s * .105, .55, .18), V(s * .11, .54, .4)], [[.092 * w, .085], [.08 * w, .075], [.062, .06]], nl, 3), 'pantalon');
    add(miembro([V(s * .11, .53, .41), V(s * .11, .3, .44), V(s * .11, .09, .43)], [[.06, .06], [.052, .055], [.042, .045]], nl, 3), 'pantalon');
    add(miembro([V(s * .11, .045, .38), V(s * .11, .04, .5), V(s * .11, .03, .62)], [[.045, .042], [.047, .04], [.04, .026]], 8, 2), 'zapato');
  }
  // tronco: cadera, cintura, pecho, hombros con caída de trapecio, base del cuello
  const saco = ropa === 'saco', b = saco ? 1.04 : 1;
  add(tronco([[.47, .17 * w * b, .122 * b, 0], [.6, .162 * w * b, .118 * b, .002], [.76, .168 * w * b, .12 * b, .006], [.9, .192 * w * b, .126 * b, .012], [.975, .214 * w * b, .12 * b, .01, 2.5],
    [1.03, .212 * w * b, .1 * b, .003, 2.6], [1.058, .168 * w, .086, -.002, 2.3], [1.08, .095 * w, .07, -.006, 2], [1.094, .062, .058, -.01, 2]], n), saco ? 'traje' : 'ropa');
  const yc = 1.128;      // altura del mentón
  if (saco) {
    // camisa en V, corbata y cuello de camisa
    const tira = filas => { const pos = [], idx = []; for (const [y, hw, z] of filas) pos.push(-hw, y, z, hw, y, z); for (let j = 0; j < filas.length - 1; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    add(tira([[1.082, .058, .07], [1.0, .046, .129], [.9, .026, .141], [.78, 0, .13]]), 'camisa');
    if (corbata) { add(tira([[1.07, .019, .083], [1.0, .024, .133], [.86, .03, .143], [.8, 0, .136]]), 'corbata'); add(new THREE.BoxGeometry(.04, .032, .02).translate(0, 1.078, .072), 'corbata'); }
    add(miembro([V(0, 1.083, -.012), V(0, 1.108, -.014)], [[.063, .067], [.056, .06]], 12, 1), 'camisa');
    // solapas: dos cuñas apoyadas sobre el borde de la V, un tono distinto del saco
    for (const s2 of [-1, 1]) { const g = new THREE.BufferGeometry(), q = [[.062, 1.084, .074], [.1, 1.02, .118], [.066, .93, .142], [.012, .8, .14], [.03, .9, .146], [.05, 1.0, .136]].flatMap(([x, y, z]) => [s2 * x, y, z + .004]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(q, 3)); g.setIndex(s2 > 0 ? [0, 5, 1, 1, 5, 2, 5, 4, 2, 4, 3, 2] : [0, 1, 5, 1, 2, 5, 5, 2, 4, 4, 2, 3]); g.computeVertexNormals(); add(g, 'solapa'); }
  } else if (ropa === 'buzo') add(miembro([V(0, 1.08, -.014), V(0, 1.118, -.016)], [[.075, .08], [.064, .07]], 12, 1), 'ropa');      // capucha o cuello alto
  // cabeza (mentón en yc), girada e inclinada
  const M = new THREE.Matrix4().compose(V(0, yc, .004), new THREE.Quaternion().setFromEuler(new THREE.Euler(cabezaInc, cabezaGiro, 0, 'YXZ')), V(1, 1, 1));
  for (const p of [...cabeza(det ? 26 : 16, forma, { anteojos }), ...pelo(estilo, det ? 26 : 16, r, forma)]) { p.g.applyMatrix4(M); P.push(p); }
  // brazos
  const G = typeof gesto === 'function' ? gesto : GESTOS[gesto] || GESTOS.falda, manga = ropa === 'remera' ? 'corta' : 'larga', tela = saco ? 'traje' : 'ropa';
  const hombro = s => V(s * (sx + .016), hy + .008, -.004);
  for (const s of [-1, 1]) { if (s === sinBrazo) continue; const [H, polo] = G(s, hy); P.push(...brazo(hombro(s), H, { lado: s, polo, manga, tela, n: nl, grosor: mix(.92, 1.1, cuerpo) }).piezas); }
  if (dePie) {      // de pie: todo lo armado sube 43 cm (la cadera queda a 0,9 m) y se le ponen piernas rectas, apenas separadas
    const T = new THREE.Matrix4().makeTranslation(0, .43, 0); for (const p of P) p.g.applyMatrix4(T);
    for (const s of [-1, 1]) {
      add(miembro([V(s * .095, .98, 0), V(s * .1, .52, .012), V(s * .105, .1, 0)], [[.092 * w, .09], [.062, .064], [.045, .05]], nl, 4), 'pantalon');
      add(miembro([V(s * .105, .045, -.05), V(s * .108, .04, .06), V(s * .11, .03, .17)], [[.045, .042], [.047, .04], [.04, .026]], 8, 2), 'zapato');
    }
  }
  if (talla !== 1) { const S = new THREE.Matrix4().makeScale(talla, talla, talla); for (const p of P) p.g.applyMatrix4(S); }
  return { piezas: P, hombro, hy };
}
/** Mesa de largo L con mantel hasta el piso y una banda clara; el frente (+z) mira a la tarima. */
export function mesa(L) {
  return [{ g: new THREE.BoxGeometry(L, .035, .62).translate(0, .7425, 0), parte: 'tapa' }, { g: new THREE.BoxGeometry(L, .725, .025).translate(0, .3625, .297), parte: 'mantel' },
    { g: new THREE.BoxGeometry(.025, .725, .6).translate(-L / 2 + .0125, .3625, 0), parte: 'mantel' }, { g: new THREE.BoxGeometry(.025, .725, .6).translate(L / 2 - .0125, .3625, 0), parte: 'mantel' },
    { g: new THREE.BoxGeometry(L, .05, .012).translate(0, .64, .312), parte: 'banda' },
    { g: new THREE.BoxGeometry(L + .05, .014, .67).translate(0, .767, 0), parte: 'tapa' }, { g: new THREE.BoxGeometry(L + .02, .07, .03).translate(0, .035, .3), parte: 'zocalo' },
    { g: new THREE.BoxGeometry(.035, .725, .035).translate(-L / 2 + .012, .3625, .297), parte: 'canto' }, { g: new THREE.BoxGeometry(.035, .725, .035).translate(L / 2 - .012, .3625, .297), parte: 'canto' }];
}
/** Deja cada pieza sin UV ni índice propio raro, con normales, lista para juntar. */
export function limpiar(g) { g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals(); if (!g.index) { const n = g.attributes.position.count, ix = new Uint16Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); } return g; }
export { GESTOS, V as vec, suave };
