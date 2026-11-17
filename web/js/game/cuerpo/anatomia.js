// Anatomía del pesista como lista de primitivas atadas al esqueleto (pose de generación). Cada músculo y cada volumen es
// una forma con origen e inserción en articulaciones concretas, en metros. Nada de esto es una rotación ni un valor por
// personaje: salen de las articulaciones del esqueleto (`J`) y de la ficha (`F`: ganancias por grupo muscular, colores).
// Convención: x a la izquierda del personaje, y arriba, z al frente. `s` = +1 lado izquierdo, −1 derecho.
import { add, sub, mul, mad, dot, nor, cruz, perp, lerp, len, ejesXYZ } from './algebra.js';

export const MAT = { piel: 0, zapatilla: 1, suela: 2, taco: 3, correa: 4, labio: 5, cuero: 6, metal: 7, neopreno: 8, venda: 9, ojo: 10, una: 11 };

/** Ficha por defecto (Kordan, M94): ganancia de cada grupo (1 = como está escrito) y colores. */
export const FICHA = {
  estatura: 1.71, piso: -.016, cabezas: 7, barba: 0,
  musculo: { deltoide: 1, biceps: 1, triceps: 1, antebrazo: 1, pectoral: 1, trapecio: 1, dorsal: 1, erectores: 1, gluteo: 1, cuadriceps: 1, isquios: 1, aductor: 1, gemelos: 1, abdomen: 1, cuello: 1 },
  color: { piel: '#b07a55', labio: '#8f5a48', pelo: '#14100d', iris: '#33261a', malla: '#ece8dd', panel: '#0f5a66', vivo: '#12181c', rodillera: '#14171a', rodillera2: '#0f5a66', cinturon: '#2a1d15', hebilla: '#8d8f93',
    zapatilla: '#efeee9', zapatilla2: '#d9d5ca', correa: '#0f5a66', taco: '#8a5f36', suela: '#1c1c1e', media: '#e9e7e2', venda: '#16181b', venda2: '#0f5a66' },
  // pose de generación: giros (grados) sobre la pose de reposo del esqueleto, alrededor de ejes del mundo. Las piernas se abren
  // para que los muslos no se fundan en la entrepierna; la malla vuelve al reposo deshaciendo la piel.
  poseGen: [['LeftUpLeg', [0, 0, 1], 9], ['RightUpLeg', [0, 0, 1], -9]],
};

/**
 * Fichas del prototipo: lo que cambia respecto de FICHA. `lamina`: el pesista de la lámina «realismo simplificado» del dueño
 * (malla roja con franja dorada, cinturón negro, muñequeras y rodilleras negras con vivo rojo, zapatillas blancas con rojo),
 * con emblema ficticio. `kordan`: los colores de la ficha de Kordan (blender/plantel.py).
 */
export const FICHAS = {
  kordan: {},
  lamina: {
    barba: 0, panel: 'franja', cabezas: 6.75, peloAlto: .0075,
    color: { piel: '#d6a07a', labio: '#b9806a', pelo: '#17171a', iris: '#2a2019', malla: '#b02a2c', panel: '#e3a62b', vivo: '#b02a2c', rodillera: '#2b2b2e', rodillera2: '#b8302c', cinturon: '#2a2a2d', hebilla: '#b4b7bc',
      zapatilla: '#f1f0ee', correa: '#bf2f2b', taco: '#e9e8e6', suela: '#b8302c', media: '#f3f2ef', venda: '#242427', venda2: '#b8302c' },
    ropa: { cinturon: .034, cinturonAncho: .088, rodilleraArriba: .075, rodilleraAbajo: .095, media: .125, botamanga: .6, escote: .16, escoteAncho: .07, escoteP: 3, sisa: .165, sisaX: .045, sisaAncho: .1, sisaAtras: .015, emblema: [-.056, -.07, .033, .023] },
    diseno: { sigla: '', nombre: '', dorsal: '', emblema: 'sol' },
  },
};

/** Marco de un segmento: origen A, eje u hacia B, frente f (la pista, perpendicular al eje) y lateral l (hacia afuera del cuerpo). */
function marco(A, B, pista, s) {
  const u = nor(sub(B, A)), f = perp(pista, u), l = mul(cruz(f, u), s), L = len(sub(B, A));
  const pm = (d, lat = 0, fr = 0) => [A[0] + u[0] * d + l[0] * lat + f[0] * fr, A[1] + u[1] * d + l[1] * lat + f[1] * fr, A[2] + u[2] * d + l[2] * lat + f[2] * fr];
  return { A, B, u, f, l, L, pm, pt: (t, lat, fr) => pm(t * L, lat, fr), ejes: [l, u, f] };
}

/**
 * Agrega al campo `C` el cuerpo entero. `J`: articulaciones en la pose de generación; `P`: funciones de piel (piel.js);
 * `Sg`: nombre de hueso → matriz reposo→generación (para lo que se escribe en reposo: zapatillas).
 * Devuelve datos que usa generar.js: marcos, puntos de referencia y los bloques de mallado.
 */
export function anatomia(C, J, P, F, Sg, Jr) {
  const g = n => F.musculo[n] ?? 1, G = (n, R) => R.map(v => v * g(n));
  const yH = J.Hips[1], yN = J.Neck[1], yA = (J.LeftArm[1] + J.RightArm[1]) / 2, xA = (J.LeftArm[0] - J.RightArm[0]) / 2, piso = F.piso, yTop = piso + F.estatura, alto = F.estatura / (F.cabezas ?? 7);
  const T = P.tronco, X = (s, p) => [s * p[0], p[1], p[2]], E = (s, gx, gy, gz) => ejesXYZ(gx, gy * s, gz * s).map(e => e);
  const ref = { yH, yN, yA, xA, yTop, menton: yTop - alto };

  // ───────── tronco: volúmenes de base, blandos ─────────
  C.base = { piel: T, k: .05 };
  C.elip([0, yH + .0, .004], [.152, .1, .104], { nombre: 'pelvis' });
  C.elip([0, yH + .14, .028], [.144, .13, .102], { nombre: 'abdomen' });
  C.elip([0, yH + .33, .02], [.158, .17, .12], { nombre: 'costillas' });
  C.huso([-.135, yA - .014, -.005], [.135, yA - .014, -.005], [.04, .052, .04], { nombre: 'cintura escapular', n: [0, 0, 1], sn: 1.15, k: .04 });
  C.huso([0, yN - .04, -.008], [0, yN + .09, .028], G('cuello', [.056, .05, .047]), { nombre: 'cuello', k: .02 });
  for (const s of [1, -1]) {
    C.base = { piel: T, k: .035 };
    C.elip(X(s, [.122, yH + .29, -.022]), G('dorsal', [.047, .14, .078]), { nombre: 'dorsal', ejes: E(s, 0, 0, -12), k: .04 });
    C.elip(X(s, [.07, yA - .035, -.08]), G('dorsal', [.075, .085, .036]), { nombre: 'espalda alta', k: .035 });
    C.huso(X(s, [.04, yH + .03, -.07]), X(s, [.04, yH + .34, -.088]), G('erectores', [.022, .028, .022]), { nombre: 'erector', k: .03 });
    C.huso(X(s, [.03, yN + .012, -.026]), X(s, [.14, yA + .012, -.01]), G('trapecio', [.024, .027, .018]), { nombre: 'trapecio', tm: .4 });
    C.elip(X(s, [.084, yA - .062, .092]), G('pectoral', [.086, .066, .05]), { nombre: 'pectoral', ejes: E(s, 0, 14, 0) });
    C.elip(X(s, [.086, yH - .02, -.062]), G('gluteo', [.086, .096, .08]), { nombre: 'gluteo', ejes: E(s, 10, 0, 6), piel: P.mezcla(T, .55, s > 0 ? P.L.muslo : P.R.muslo, .45) });
    C.elip(X(s, [.13, yH + .0, -.01]), G('gluteo', [.044, .07, .066]), { nombre: 'cadera', piel: P.mezcla(T, .7, s > 0 ? P.L.muslo : P.R.muslo, .3) });
  }

  const marcos = {};
  for (const [s, L, Pl] of [[1, 'Left', P.L], [-1, 'Right', P.R]]) {
    // ───────── brazo ─────────
    const S = J[L + 'Arm'], Eb = J[L + 'ForeArm'], W = J[L + 'Hand'];
    const BA = marco(S, Eb, sub(W, Eb), s), AN = marco(Eb, W, sub(S, Eb), s);
    C.base = { piel: Pl.brazo, k: .03 };
    C.elip(S, .044, { nombre: 'hombro', k: .035 });
    C.huso(BA.pm(.0, .008, 0), BA.pm(.165, .016, 0), G('deltoide', [.028, .05, .025]), { nombre: 'deltoide', tm: .36, n: BA.f, sn: 1.12 });
    C.huso(BA.pm(.02), BA.pm(BA.L), [.044, .045, .036], { nombre: 'brazo' });
    C.huso(BA.pm(.06, -.004, .024), BA.pm(BA.L, 0, .014), G('biceps', [.024, .044, .023]), { nombre: 'biceps', tm: .52 });
    C.huso(BA.pm(.03, 0, -.026), BA.pm(BA.L - .008, 0, -.018), G('triceps', [.03, .045, .023]), { nombre: 'triceps', tm: .42 });
    C.elip(Eb, [.037, .04, .036], { nombre: 'codo', ejes: AN.ejes, k: .025 });
    C.huso(AN.pm(0), AN.pm(AN.L), G('antebrazo', [.04, .041, .024]), { nombre: 'antebrazo', tm: .28, n: AN.l, sn: 1.1 });
    C.huso(AN.pm(-.012, -.02, .01), AN.pm(.17, -.008, .006), G('antebrazo', [.024, .032, .013]), { nombre: 'flexores', tm: .35, k: .025 });
    C.huso(BA.pm(BA.L - .06, .02, .012), AN.pm(.15, .016, .004), G('antebrazo', [.016, .029, .012]), { nombre: 'braquiorradial', tm: .52, k: .025 });
    C.elip(W, [.03, .03, .02], { nombre: 'muñeca', ejes: AN.ejes, k: .016 });
    // ───────── mano: palma y dedos (cada dedo con sus tres huesos) ─────────
    const jd = (n, k) => J[`${L}Hand${n}${k}`], M1 = jd('Middle', 1), uh = nor(sub(M1, W)), ac = perp(sub(jd('Index', 1), jd('Pinky', 1)), uh);
    let pn = cruz(uh, ac); if (dot(pn, sub(jd('Middle', 3), M1)) < 0) pn = mul(pn, -1);      // la palma mira hacia donde se curvan los dedos
    const Lp = len(sub(M1, W));
    C.base = { piel: Pl.mano, k: .008 };
    C.caja(add(mad(W, uh, Lp * .52), mul(ac, -.004)), [.043, Lp * .5, .0135], { nombre: 'palma', ejes: [ac, uh, pn], r: .012 });
    C.elip(add(lerp(W, jd('Thumb', 1), .7), mul(pn, .006)), [.02, .03, .016], { nombre: 'tenar', ejes: [ac, nor(sub(jd('Thumb', 1), W)), pn], k: .01 });
    const DED = { Index: [[.0105, .0095, .0085], .024], Middle: [[.011, .0098, .0088], .026], Ring: [[.0102, .009, .0082], .024], Pinky: [[.009, .008, .0073], .021], Thumb: [[.0135, .012, .0105], .029] };
    for (const n of Object.keys(DED)) { const [R, lt] = DED[n], j = [1, 2, 3].map(k => jd(n, k)), tip = mad(j[2], nor(sub(j[2], j[1])), lt), o = { piel: Pl.dedo[n], k: .004, nombre: 'dedo ' + n };
      C.huso(j[0], j[1], [R[0] * 1.05, R[0], R[0] * .97], o); C.huso(j[1], j[2], [R[1] * 1.04, R[1], R[1] * .97], o); C.huso(j[2], tip, [R[2] * 1.03, R[2], R[2] * .86], o);
      if (n !== 'Thumb') C.elip(mad(j[0], pn, -.004), R[0] * 1.15, { piel: Pl.mano, k: .006, nombre: 'nudillo' }); }
    // ───────── pierna ─────────
    const Hp = J[L + 'UpLeg'], Kn = J[L + 'Leg'], An = J[L + 'Foot'], MU = marco(Hp, Kn, [0, 0, 1], s), PI = marco(Kn, An, [0, 0, 1], s);
    C.base = { piel: Pl.pierna, k: .032 };
    C.huso(MU.pm(0, 0, .005), MU.pt(1, 0, .012), [.082, .097, .05], { nombre: 'muslo', tm: .32, k: .04 });
    C.huso(MU.pt(.06, .012, .056), MU.pt(.93, 0, .036), G('cuadriceps', [.036, .064, .026]), { nombre: 'cuadriceps', tm: .45, n: MU.l, sn: 1.25 });
    C.huso(MU.pt(.12, .044, .02), MU.pt(.9, .032, .026), G('cuadriceps', [.032, .064, .028]), { nombre: 'vasto lateral', tm: .5 });
    C.elip(MU.pt(.8, -.036, .03), G('cuadriceps', [.034, .068, .038]), { nombre: 'vasto medial', ejes: MU.ejes });
    C.huso(MU.pm(.02, -.066, -.005), MU.pt(.7, -.034, -.012), G('aductor', [.046, .06, .03]), { nombre: 'aductores', tm: .3 });
    C.huso(MU.pt(.1, 0, -.046), MU.pt(.97, 0, -.028), G('isquios', [.042, .068, .028]), { nombre: 'isquios', tm: .45, n: MU.l, sn: 1.3 });
    C.elip(MU.pt(1, 0, .014), [.047, .058, .05], { nombre: 'rodilla', ejes: MU.ejes });
    C.huso(PI.pm(0), PI.pt(1), [.052, .054, .021], { nombre: 'pierna', tm: .3 });
    C.huso(PI.pm(-.02, 0, -.028), PI.pt(.5, 0, -.026), G('gemelos', [.036, .072, .016]), { nombre: 'gemelos', tm: .5, n: PI.l, sn: 1.3, k: .025 });
    C.huso(PI.pt(.2, 0, -.018), PI.pt(.68, 0, -.018), G('gemelos', [.03, .052, .014]), { nombre: 'soleo', n: PI.l, sn: 1.15, k: .025 });
    C.huso(PI.pt(.06, .02, .02), PI.pt(.62, .005, .016), [.018, .026, .01], { nombre: 'tibial anterior', k: .025 });
    C.elip(PI.pt(1, .022, 0), .013, { nombre: 'maleolo', k: .014 }); C.elip(PI.pt(1, -.02, .005), .013, { nombre: 'maleolo', k: .014 });
    // ───────── zapatilla de halterofilia (se escribe en reposo y va con el pie) ─────────
    const A0 = Jr[L + 'Foot'], x = A0[0], z0 = A0[2], y0 = piso;      // tobillo en reposo
    C.M = Sg[L + 'Foot']; C.base = { piel: Pl.pie, k: .006 };
    C.huso([x, y0 + .0075, z0 - .04], [x + s * .004, y0 + .0075, z0 + .185], [.043, .058, .052], { nombre: 'suela', mat: MAT.suela, losa: .0075, r: .003, n: [0, 1, 0], tm: .68, forma: 0, k: .002 });
    C.huso([x, y0 + .026, z0 - .04], [x, y0 + .02, z0 + .06], [.041, .048, .05], { nombre: 'taco', mat: MAT.taco, losa: .0125, r: .003, n: [0, 1, 0], tm: .5, forma: 0, k: .003 });
    C.huso([x, y0 + .06, z0 - .034], [x + s * .004, y0 + .04, z0 + .176], [.046, .057, .045], { nombre: 'capellada', mat: MAT.zapatilla, n: [0, 1, 0], sn: .8, tm: .62, k: .012 });
    C.huso([x, y0 + .06, z0 - .014], [x, y0 + .108, z0 + .002], [.046, .044, .038], { nombre: 'caña', mat: MAT.zapatilla, k: .012 });
    C.huso([x, y0 + .112, z0 + .028], [x + s * .003, y0 + .052, z0 + .115], [.026, .031, .028], { nombre: 'lengüeta', mat: MAT.zapatilla, k: .012 });
    C.M = null;
    marcos[s > 0 ? 'L' : 'R'] = { BA, AN, MU, PI, mano: { W, uh, ac, pn } };
  }

  // ───────── cabeza (rígida con el hueso Head): simple y agradable, de adulto ─────────
  // Se escribe para una cabeza de 22,8 cm (mentón a coronilla) y se escala a `alto`, desde el mentón.
  const z0 = J.Head[2] + .034, ch = ref.menton, hs = alto / .228, hp = (x, dy, dz) => [x * hs, ch + dy * hs, z0 + dz * hs], hr = r => (typeof r === 'number' ? r * hs : r.map(v => v * hs)), c0 = hp(0, .131, -.012);
  C.base = { piel: P.cabeza, k: .025 * hs };
  C.elip(c0, hr([.0775, .097, .099]), { nombre: 'craneo', k: .03 });
  C.huso(hp(0, .15, .018), hp(0, .05, .046), hr([.066, .066, .034]), { nombre: 'cara', k: .03, forma: 2, tm: .3 });
  C.elip(hp(0, .03, .008), hr([.034, .02, .046]), { nombre: 'piso de la boca', k: .02, piel: P.mezcla(P.cabeza, .6, T, .4) });
  C.elip(hp(0, .052, .058), hr([.026, .026, .028]), { nombre: 'boca' });
  C.elip(hp(0, .019, .066), hr([.023, .017, .02]), { nombre: 'menton', k: .02 });
  C.huso(hp(0, .127, .084), hp(0, .091, .106), hr([.008, .0095, .0105]), { nombre: 'nariz', k: .012 });
  C.elip(hp(0, .086, .105), hr([.0115, .0105, .011]), { nombre: 'punta de la nariz', k: .012 });
  for (const s of [1, -1]) {
    C.elip(hp(s * .037, .05, -.004), hr([.013, .02, .02]), { nombre: 'angulo de la mandibula', k: .03 });
    C.huso(hp(s * .035, .038, .004), hp(s * .014, .017, .06), hr([.01, .011, .012]), { nombre: 'mandibula', k: .03 });
    C.elip(hp(s * .027, .066, .044), hr([.018, .026, .022]), { nombre: 'mejilla', k: .03 });
    C.elip(hp(s * .044, .097, .05), hr([.018, .015, .02]), { nombre: 'pomulo', k: .03 });
    C.huso(hp(s * .014, .1375, .083), hp(s * .055, .1345, .062), hr(.006), { nombre: 'arco superciliar', k: .02 });
    C.elip(hp(s * .013, .081, .094), hr([.007, .007, .009]), { nombre: 'ala de la nariz', k: .008 });
    C.elip(hp(s * .079, .106, -.02), hr([.0075, .03, .017]), { nombre: 'oreja', ejes: ejesXYZ(0, s * 24, s * -8), k: .007 });
  }
  const ojos = [];
  for (const s of [1, -1]) {
    ojos.push({ c: hp(s * .0315, .117, .0735), r: .0125 * hs, s });
    C.elip(hp(s * .0315, .117, .0915), hr([.0138, .0062, .0085]), { nombre: 'cuenca', resta: true, k: .004 });
    C.elip(hp(s * .0315, .1255, .078), hr([.016, .004, .011]), { nombre: 'parpado de arriba', ejes: ejesXYZ(-18, 0, 0), k: .004 });
    C.elip(hp(s * .085, .108, -.017), hr([.004, .017, .0085]), { nombre: 'concha de la oreja', resta: true, k: .004 });
  }
  C.base = {};
  return { ref, marcos, ojos, cabeza: { c0, z0, ch, hs, yCeja: ch + .1435 * hs, yBoca: ch + .05 * hs } };
}
