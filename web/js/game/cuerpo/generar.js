// Generador del cuerpo del pesista por código: del esqueleto y la ficha a una malla con piel (pesos), normales y atributos de
// material. Sin Blender ni archivos: campo implícito (campo.js + anatomia.js) → mallado (mallar.js) → pesos por regla (piel.js)
// → ropa y equipo (capas sobre la misma superficie y bandas) → vuelta a la pose de reposo del esqueleto.
// Sin dependencias: corre igual en Node (tools/cuerpo/vista.mjs) y en el navegador (tres.js).
import { Campo } from './campo.js';
import { mallar } from './mallar.js';
import { hacerPiel, AUX } from './piel.js';
import { anatomia, FICHA, MAT } from './anatomia.js';
import { mmul, minv, giroEn, mpos, sub, dot, nor, cruz, perp, mad, add, mul, len, lerp, sstep } from './algebra.js';

/** Paso de la grilla (m) de cada bloque. «alta»: ~110 mil triángulos; «media»: ~75 mil; «movil»: ~45 mil; «fina»: ~200 mil (para mirar de cerca). */
export const CALIDAD = {
  fina: { h: .0075, cabeza: .0034, mano: .0034, pie: .0048, anillo: 64 },
  alta: { h: .009, cabeza: .0042, mano: .0052, pie: .0062, anillo: 64 },
  media: { h: .011, cabeza: .005, mano: .0062, pie: .0075, anillo: 48 },
  movil: { h: .014, cabeza: .0062, mano: .0075, pie: .009, anillo: 32 },
  previa: { h: .012, cabeza: .005, mano: .007, pie: .008, anillo: 32 },
};
export const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
// tipo de superficie de cada vértice (atributo `tipo`): el sombreador elige la función de material con esto
export const TIPO = { piel: 0, tela: 1, cuero: 2, neopreno: 3, goma: 4, zapatilla: 5, ojo: 6, metal: 7, venda: 8, madera: 9 };
const TIPO_MAT = { [MAT.piel]: 0, [MAT.zapatilla]: 5, [MAT.suela]: 4, [MAT.taco]: 9, [MAT.correa]: 5, [MAT.labio]: 0, [MAT.cuero]: 2, [MAT.metal]: 7, [MAT.neopreno]: 3, [MAT.venda]: 8, [MAT.ojo]: 6 };

/**
 * @param esq  { nombres: [...] (sin prefijo), padre: [índices], reposo: [matriz de mundo 4×4 por columnas de cada hueso] }
 * @param ficha  parcial; lo que falte sale de FICHA
 * @param calidad  clave de CALIDAD u objeto
 */
export function generar(esq, ficha = {}, calidad = 'alta') {
  const t0 = Date.now(), F = { ...FICHA, ...ficha, musculo: { ...FICHA.musculo, ...(ficha.musculo || {}) }, color: { ...FICHA.color, ...(ficha.color || {}) } }, Q = typeof calidad === 'string' ? CALIDAD[calidad] : calidad;
  const nombres = [...esq.nombres, ...AUX.map(a => a[0])], ixm = new Map(nombres.map((n, i) => [n, i])), ix = n => ixm.get(n), nb = nombres.length;
  // pose de generación
  const Gm = esq.reposo.map(m => m.slice()), hijos = i => { const r = [i]; for (let k = 0; k < r.length; k++) esq.padre.forEach((p, j) => { if (p === r[k]) r.push(j); }); return r; };
  for (const [h, eje, grados] of F.poseGen || []) { const i = esq.nombres.indexOf(h), M = giroEn(mpos(Gm[i]), eje, grados * Math.PI / 180); for (const j of hijos(i)) Gm[j] = mmul(M, Gm[j]); }
  const S = esq.reposo.map((r, i) => mmul(Gm[i], minv(r))); for (const a of AUX) S.push(S[esq.nombres.indexOf(a[2])]);
  const J = Object.fromEntries(esq.nombres.map((n, i) => [n, mpos(Gm[i])])), Jr = Object.fromEntries(esq.nombres.map((n, i) => [n, mpos(esq.reposo[i])])), Sg = Object.fromEntries(esq.nombres.map((n, i) => [n, S[i]]));
  const P = hacerPiel(J, ix), C = new Campo(), A = anatomia(C, J, P, F, Sg, Jr); C.preparar();
  const tCampo = Date.now();
  const { ref, marcos } = A, col = Object.fromEntries(Object.entries(F.color).map(([k, v]) => [k, hex(v)]));
  const colMat = { [MAT.piel]: col.piel, [MAT.zapatilla]: col.zapatilla, [MAT.suela]: col.suela, [MAT.taco]: col.taco, [MAT.correa]: col.correa, [MAT.labio]: col.labio };

  // ── bloques de mallado: cuerpo grueso; cabeza, manos y pies más finos. Se solapan unos milímetros sobre la misma superficie.
  const yCab = ref.menton - .005, manoPl = s => { const m = marcos[s].AN; return [m.pt(.84), m.u]; }, yPie = Math.max(J.LeftFoot[1], J.RightFoot[1]) + .075;
  const enMano = (s, x, y, z, e) => { const [p, u] = manoPl(s), dx = x - p[0], dy = y - p[1], dz = z - p[2]; return dx * u[0] + dy * u[1] + dz * u[2] > e && dx * dx + dy * dy + dz * dz < .09; };
  const cajaDe = (pts, m) => [[0, 1, 2].map(i => Math.min(...pts.map(p => p[i])) - m), [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])) + m)];
  const dedos = s => Object.keys(J).filter(n => n.startsWith((s === 'L' ? 'Left' : 'Right') + 'Hand')).map(n => J[n]);
  const e = .002, bloques = [
    { n: 'cuerpo', h: Q.h, caja: [C.lo, C.hi], dentro: (x, y, z) => y < yCab + e && y > yPie - e && !enMano('L', x, y, z, e) && !enMano('R', x, y, z, e) },
    { n: 'cabeza', h: Q.cabeza, caja: [[-.13, yCab - .01, C.lo[2]], [.13, C.hi[1], C.hi[2]]], dentro: (x, y, z) => y >= yCab - e },
    ...['L', 'R'].map(s => ({ n: 'mano' + s, h: Q.mano, caja: cajaDe([...dedos(s), manoPl(s)[0]], .06), dentro: (x, y, z) => enMano(s, x, y, z, -e) })),
    ...['Left', 'Right'].map(L => ({ n: 'pie' + L[0], h: Q.pie, caja: cajaDe([J[L + 'Foot'], J[L + 'ToeBase']], .13), dentro: (x, y, z) => y <= yPie + e && (L === 'Left') === (x > 0) })),
  ];
  const mallas = bloques.map(b => ({ ...mallar(C, b), n: b.n }));
  const tMalla = Date.now();

  // ── atributos de un punto de la superficie: pesos, color de base, capas (tela, media, pelo…)
  const acc = new Float32Array(nb), grupos = { tronco: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder'], cabeza: ['Head'],
    piernaL: ['LeftUpLeg', 'LeftLeg', 'aux_rodilla_L', 'LeftFoot', 'LeftToeBase'], piernaR: ['RightUpLeg', 'RightLeg', 'aux_rodilla_R', 'RightFoot', 'RightToeBase'] };
  const gi = Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.map(ix)])), suma = L => { let s = 0; for (const i of L) s += acc[i]; return s; };
  const elipse = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
  const c0 = A.cabeza.c0, zc = A.cabeza.z0, ch = A.cabeza.ch, R = F.ropa || {};
  const at = { col: [0, 0, 0], sup: [0, 0, 0, 0], sup2: [0, 0, 0, 0], tipo: 0, despl: 0 };
  function atributos(x, y, z) {
    acc.fill(0); const n = C.detalle(x, y, z), ii = C.ii, di = C.di, PP = C.P; let dm = 9; for (let k = 0; k < n; k++) if (di[k] < dm) dm = di[k];
    let wt = 0, r = 0, g = 0, b = 0, tp = 0, oreja = 0, calz = 0, zr = 0, zg = 0, zb = 0;
    for (let k = 0; k < n; k++) { const q = PP[ii[k]], a = Math.exp(-(di[k] - dm) / q.sig); if (a < 1e-4) continue; wt += a; q.piel(x, y, z, acc, a);
      const c = colMat[q.mat] || col.piel; r += a * c[0]; g += a * c[1]; b += a * c[2]; if (q.mat && q.mat !== MAT.labio) { tp += a * (TIPO_MAT[q.mat] || 0); calz += a; zr += a * c[0]; zg += a * c[1]; zb += a * c[2]; } if (q.nombre === 'oreja') oreja += a; }
    for (let i = 0; i < nb; i++) acc[i] /= wt; at.col[0] = r / wt; at.col[1] = g / wt; at.col[2] = b / wt; calz /= wt; at.tipo = calz > .5 ? Math.round(tp / (calz * wt)) : 0; if (calz > .5) { at.col[0] = zr / (calz * wt); at.col[1] = zg / (calz * wt); at.col[2] = zb / (calz * wt); }
    const wL = suma(gi.piernaL), wR = suma(gi.piernaR), wP = wL + wR, wC = acc[gi.cabeza[0]], wT = suma(gi.tronco), wB = Math.max(0, 1 - wP - wC - wT);
    // malla de halterofilia: escote, sisas y botamanga
    const fr = sstep(-.03, .03, z - .0), ax = Math.abs(x);
    const escote = elipse(x, Math.min(y, ref.yN + .03), 0, ref.yN + .03, .078 + .01 * fr, fr * .125 + (1 - fr) * .075);
    const sisa = elipse(Math.min(ax, ref.xA + .03), y, ref.xA + .03, ref.yA + .02, .105 + .03 * (1 - fr), .145 + .02 * (1 - fr));
    const cuello = Math.hypot(x, z - .005) - (.088 + .012 * fr) + Math.max(0, ref.yN - .015 - y) * 3;
    let tela = Math.min(escote, sisa, cuello, .03 - wB * .2, .03 - wC * .2);
    for (const [s, w] of [['L', wL], ['R', wR]]) if (w > 0) { const m = marcos[s].MU, t = ((x - m.A[0]) * m.u[0] + (y - m.A[1]) * m.u[1] + (z - m.A[2]) * m.u[2]) / m.L; tela = tela * (1 - w) + w * Math.min(tela + .2, (.56 - t) * m.L); }
    // panel de color al costado (tronco) y por fuera del muslo
    let panel = ax - (.092 + .1 * sstep(ref.yH + .1, ref.yA - .05, y)) - .04 * Math.abs(z - .02);
    for (const [s, w] of [['L', wL], ['R', wR]]) if (w > 0) { const m = marcos[s].MU, lt = (x - m.A[0]) * m.l[0] + (y - m.A[1]) * m.l[1] + (z - m.A[2]) * m.l[2], fz = (x - m.A[0]) * m.f[0] + (y - m.A[1]) * m.f[1] + (z - m.A[2]) * m.f[2]; panel = panel * (1 - w) + w * (lt - .05 - .5 * Math.abs(fz - .01)); }
    // emblema del pecho: un rombo
    const emb = .026 - (Math.abs(x - .0) * .9 + Math.abs(y - (ref.yA - .075)) * 1.25) - (z < 0 ? 1 : 0);
    // medias
    let media = -1; if (wP > .5) media = Math.min(wP - .5, (J.LeftFoot[1] + .175) - y);
    if (calz > .5) tela = -5;      // marca de zapatilla para el sombreador
    // pelo: casquete sobre el cráneo con el nacimiento por dirección desde el centro de la cabeza
    let pelo = -1, ceja = -1, barba = -1;
    if (wC > .3) { const dx = x - c0[0], dy = y - c0[1], dz = z - c0[2], l = Math.hypot(dx, dy, dz) || 1, el = dy / l, fz = dz / l, lx = Math.abs(dx) / l;
      const lim = fz > 0 ? .1 + (.76 - .1) * sstep(.1, .78, fz) - .1 * sstep(.25, .6, lx) * sstep(.3, .7, fz) : .1 - .62 * sstep(0, .75, -fz);
      pelo = (el - lim) * .1 - oreja / wt * .08 - (1 - wC) * .05;
      // cejas: un trazo sobre el arco superciliar
      const hs = A.cabeza.hs, ex = Math.abs(x) / hs, ty = A.cabeza.yCeja, t = Math.min(1, Math.max(0, (ex - .013) / .04)), cy = ty + .004 * Math.sin(t * 3.1416) - .003 * t;
      ceja = .0036 * (1 - .45 * t) - Math.hypot(ex - (.013 + .04 * t), (y - cy) / hs) - Math.max(0, zc + .05 - z);
      { const bx = ex / .024, by = A.cabeza.yBoca - .003 * hs * bx * bx; barba = .0021 * hs * (1.1 - bx * .8) - Math.abs(y - by) - Math.max(0, zc + .05 - z); }      // boca: un trazo serio
      if (F.barba) { const bj = Math.min(ch + .058 + .035 * sstep(.03, .07, ex) - y, y - (ch - .012), z - (zc - .028)); barba = Math.max(barba, bj - .03 * (1 - F.barba)); } }
    at.sup[0] = tela; at.sup[1] = media; at.sup[2] = pelo; at.sup[3] = barba; at.sup2[0] = panel; at.sup2[1] = ceja; at.sup2[2] = at.tipo; at.sup2[3] = emb;
    at.despl = at.tipo ? 0 : Math.max(.0016 * sstep(0, .004, tela), .0022 * sstep(0, .004, media), (F.peloAlto ?? .009) * sstep(-.002, .022, pelo) * (1 + .5 * sstep(.2, .9, (y - c0[1]) / .1)));
    if (calz > .5) { const L = x > 0 ? 'Left' : 'Right', An = J[L + 'Foot'], To = J[L + 'ToeBase'], u = nor(sub(To, An)), t = (x - An[0]) * u[0] + (y - An[1]) * u[1] + (z - An[2]) * u[2], up = nor(sub(J[L + 'Leg'], An)), hgt = (x - An[0]) * up[0] + (y - An[1]) * up[1] + (z - An[2]) * up[2];
      at.sup2[3] = Math.min(.017 - Math.abs(t - .075), hgt + .058); }
    return at;
  }

  // ── salida: se juntan los bloques, se calculan atributos y se vuelve a la pose de reposo
  const partes = []; let nv = 0, ni = 0; for (const m of mallas) { nv += m.pos.length / 3; ni += m.ind.length; }
  const extra = [];      // mallas explícitas (bandas, ojos): { pos (generación), nor, ind, base: puntos de la superficie de donde toman los pesos, col, tipo }
  // bandas: cinturón, rodilleras y muñequeras, como anillos sobre la superficie con canto
  const banda = (nombre, centro, s0, s1, grosor, color, tipo, nS = 10) => {
    const nA = Q.anillo, perfil = [[s0, -.003], [s0, grosor * .72], [s0 + (s1 - s0) * .012 + .0015, grosor]]; for (let k = 1; k < nS; k++) perfil.push([s0 + (s1 - s0) * k / nS, grosor]);
    perfil.push([s1 - (s1 - s0) * .012 - .0015, grosor], [s1, grosor * .72], [s1, -.003]);
    const pos = [], base = [], ind = [], uv = [];
    for (const [s, t] of perfil) { const { c, u, r0 } = centro(s), e1 = perp(r0, u), e2 = cruz(u, e1);
      for (let a = 0; a < nA; a++) { const an = a / nA * 6.2831853, d = [e1[0] * Math.cos(an) + e2[0] * Math.sin(an), e1[1] * Math.cos(an) + e2[1] * Math.sin(an), e1[2] * Math.cos(an) + e2[2] * Math.sin(an)];
        let lo = 0, hi = .004; while (hi < .4 && C.d(c[0] + d[0] * hi, c[1] + d[1] * hi, c[2] + d[2] * hi) < 0) { lo = hi; hi += .004; }
        for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (C.d(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
        base.push(c[0] + d[0] * lo, c[1] + d[1] * lo, c[2] + d[2] * lo); pos.push(c[0] + d[0] * (lo + t), c[1] + d[1] * (lo + t), c[2] + d[2] * (lo + t)); uv.push(a / nA, s); } }
    for (let j = 0; j + 1 < perfil.length; j++) for (let a = 0; a < nA; a++) { const p = j * nA + a, q = j * nA + (a + 1) % nA; ind.push(p, q, p + nA, q, q + nA, p + nA); }
    extra.push({ nombre, pos: Float32Array.from(pos), base: Float32Array.from(base), ind: Uint32Array.from(ind), col: color, tipo, uv });
  };
  const yCin = ref.yH + (R.cinturon ?? .165), aCin = R.cinturonAncho ?? .085;
  banda('cinturon', s => ({ c: [0, s, .028], u: [0, 1, 0], r0: [0, 0, 1] }), yCin - aCin / 2, yCin + aCin / 2, .0065, col.cinturon, TIPO.cuero, 6);
  for (const s of ['L', 'R']) {
    const { MU, PI, AN, mano } = marcos[s], Lt = MU.L + PI.L, k0 = MU.L / Lt;
    // la rodillera sigue el muslo y la pierna: el centro pasa del eje de uno al del otro alrededor de la rodilla
    banda('rodillera' + s, t => { const d = t * Lt, a = d < MU.L ? MU.pm(d, 0, .008) : PI.pm(d - MU.L, 0, .008 * (1 - (d - MU.L) / .12)), w = sstep(MU.L - .07, MU.L + .07, d); return { c: a, u: nor(lerp(MU.u, PI.u, w)), r0: MU.f }; },
      k0 - (R.rodilleraArriba ?? .105) / Lt, k0 + (R.rodilleraAbajo ?? .1) / Lt, .0055, col.rodillera, TIPO.neopreno, 12);
    banda('muñequera' + s, t => ({ c: AN.pm(t), u: AN.u, r0: AN.f }), AN.L - .062, AN.L - .002, .004, col.venda, TIPO.venda, 6);
  }
  // ojos: esferas chicas con iris y pupila por color de vértice
  for (const o of A.ojos) { const nU = 20, nV = 12, pos = [], ind = [], cl = [], base = [], iris = col.iris;
    for (let v = 0; v <= nV; v++) for (let u = 0; u <= nU; u++) { const th = v / nV * Math.PI, ph = u / nU * 2 * Math.PI, d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];      // polo en +z (hacia adelante)
      pos.push(o.c[0] + d[0] * o.r, o.c[1] + d[1] * o.r, o.c[2] + d[2] * o.r); base.push(o.c[0], o.c[1], o.c[2] + .03); const a = th / Math.PI * 180, k = a < 10 ? [.02, .02, .02] : a < 29 ? iris : a < 32 ? iris.map(c => c * .5) : [.86, .84, .8]; cl.push(...k); }
    for (let v = 0; v < nV; v++) for (let u = 0; u < nU; u++) { const p = v * (nU + 1) + u; ind.push(p, p + nU + 1, p + 1, p + 1, p + nU + 1, p + nU + 2); }
    extra.push({ nombre: 'ojo', pos: Float32Array.from(pos), base: Float32Array.from(base), ind: Uint32Array.from(ind), cols: cl, tipo: TIPO.ojo, rigido: ix('Head') }); }
  // hebilla del cinturón: un marco con su lengüeta, mallado aparte bien fino
  { const B = new Campo(), zf = (() => { let lo = 0, hi = .3; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (C.d(0, yCin, .028 + m) < 0) lo = m; else hi = m; } return .028 + lo + .0065; })();
    B.base = { piel: null, k: .0015 }; const w = .033, hh = aCin * .56, g = .0045;
    for (const sx of [-1, 1]) B.caja([sx * w, yCin, zf + g * .6], [g, hh, g * .8], { r: .002 });
    for (const sy of [-1, 1]) B.caja([0, yCin + sy * (hh - g), zf + g * .6], [w, g, g * .8], { r: .002 });
    B.caja([.004, yCin, zf + g * 1.1], [w * .95, g * .55, g * .5], { r: .0015 });
    B.preparar(.02, .004); const m = mallar(B, { h: .0022, caja: [B.lo, B.hi] }), base = new Float32Array(m.pos.length); for (let i = 0; i < base.length; i += 3) { base[i] = 0; base[i + 1] = yCin; base[i + 2] = zf - .0065; }
    extra.push({ nombre: 'hebilla', pos: m.pos, nor: m.nor, base, ind: m.ind, col: col.hebilla, tipo: TIPO.metal }); }

  for (const x of extra) { nv += x.pos.length / 3; ni += x.ind.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), gen = new Float32Array(nv * 3), ji = new Uint16Array(nv * 4), jw = new Float32Array(nv * 4), cl = new Float32Array(nv * 3), sup = new Float32Array(nv * 4), sup2 = new Float32Array(nv * 4), ind = new Uint32Array(ni);
  const top = new Int32Array(4), B = new Float64Array(12);
  const pesos = v => {      // los cuatro huesos que más pesan, y la matriz mezclada reposo→generación
    top.fill(-1); for (let k = 0; k < 4; k++) { let m = -1, w = 1e-4; for (let i = 0; i < nb; i++) if (acc[i] > w && i !== top[0] && i !== top[1] && i !== top[2]) { w = acc[i]; m = i; } top[k] = m; }
    let s = 0; for (let k = 0; k < 4; k++) if (top[k] >= 0) s += acc[top[k]]; B.fill(0);
    for (let k = 0; k < 4; k++) { const i = top[k], w = i >= 0 ? acc[i] / s : 0; ji[v * 4 + k] = i >= 0 ? i : 0; jw[v * 4 + k] = w; if (w > 0) { const M = S[i]; for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) B[c * 3 + r] += w * M[c * 4 + r]; } }
  };
  const aReposo = (v, x, y, z, nx, ny, nz) => {      // inversa de la mezcla lineal: el vértice vuelve a la pose de reposo
    const a = B[0], b = B[3], c = B[6], d = B[1], e2 = B[4], f = B[7], g = B[2], h = B[5], i = B[8], A2 = e2 * i - f * h, B2 = f * g - d * i, C2 = d * h - e2 * g, k = 1 / (a * A2 + b * B2 + c * C2);
    const px = x - B[9], py = y - B[10], pz = z - B[11];
    pos[v * 3] = (A2 * px + (c * h - b * i) * py + (b * f - c * e2) * pz) * k; pos[v * 3 + 1] = (B2 * px + (a * i - c * g) * py + (c * d - a * f) * pz) * k; pos[v * 3 + 2] = (C2 * px + (b * g - a * h) * py + (a * e2 - b * d) * pz) * k;
    const mx = a * nx + d * ny + g * nz, my = b * nx + e2 * ny + h * nz, mz = c * nx + f * ny + i * nz, l = Math.hypot(mx, my, mz) || 1; nrm[v * 3] = mx / l; nrm[v * 3 + 1] = my / l; nrm[v * 3 + 2] = mz / l;
  };
  let v0 = 0, i0 = 0;
  for (const m of mallas) { const n = m.pos.length / 3;
    for (let k = 0; k < n; k++) { const v = v0 + k; let x = m.pos[k * 3], y = m.pos[k * 3 + 1], z = m.pos[k * 3 + 2]; const nx = m.nor[k * 3], ny = m.nor[k * 3 + 1], nz = m.nor[k * 3 + 2], a = atributos(x, y, z);
      gen[v * 3] = x; gen[v * 3 + 1] = y; gen[v * 3 + 2] = z; x += nx * a.despl; y += ny * a.despl; z += nz * a.despl;
      cl.set(a.col, v * 3); sup.set(a.sup, v * 4); sup2.set(a.sup2, v * 4); sup2[v * 4 + 2] = 0; pesos(v); aReposo(v, x, y, z, nx, ny, nz); }
    for (let k = 0; k < m.ind.length; k++) ind[i0 + k] = m.ind[k] + v0; partes.push({ nombre: m.n, v: [v0, n], i: [i0, m.ind.length] }); v0 += n; i0 += m.ind.length; }
  for (const x of extra) { const n = x.pos.length / 3; let N = x.nor;
    if (!N) { N = new Float32Array(n * 3); for (let t = 0; t < x.ind.length; t += 3) { const a = x.ind[t], b = x.ind[t + 1], c = x.ind[t + 2], p = i => [x.pos[i * 3], x.pos[i * 3 + 1], x.pos[i * 3 + 2]], nn = cruz(sub(p(b), p(a)), sub(p(c), p(a))); for (const i of [a, b, c]) { N[i * 3] += nn[0]; N[i * 3 + 1] += nn[1]; N[i * 3 + 2] += nn[2]; } }
      for (let k = 0; k < n; k++) { const l = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1; N[k * 3] /= l; N[k * 3 + 1] /= l; N[k * 3 + 2] /= l; } }
    for (let k = 0; k < n; k++) { const v = v0 + k; if (x.rigido !== undefined) { acc.fill(0); acc[x.rigido] = 1; } else atributos(x.base[k * 3], x.base[k * 3 + 1], x.base[k * 3 + 2]);
      const c = x.cols ? [x.cols[k * 3], x.cols[k * 3 + 1], x.cols[k * 3 + 2]] : x.col; cl.set(c, v * 3); sup.set([-1, -1, -1, -1], v * 4); sup2.set([x.uv ? x.uv[k * 2] : 0, -1, x.tipo, -1], v * 4);
      gen[v * 3] = x.pos[k * 3]; gen[v * 3 + 1] = x.pos[k * 3 + 1]; gen[v * 3 + 2] = x.pos[k * 3 + 2]; pesos(v); aReposo(v, x.pos[k * 3], x.pos[k * 3 + 1], x.pos[k * 3 + 2], N[k * 3], N[k * 3 + 1], N[k * 3 + 2]); }
    for (let k = 0; k < x.ind.length; k++) ind[i0 + k] = x.ind[k] + v0; partes.push({ nombre: x.nombre, v: [v0, n], i: [i0, x.ind.length] }); v0 += n; i0 += x.ind.length; }
  const t1 = Date.now();
  return { pos, nor: nrm, gen, ind, ji, jw, col: cl, sup, sup2, huesos: nombres, aux: AUX, partes, ficha: F, colores: col, J: Jr, ref,
    info: { vertices: nv, triangulos: ni / 3, primitivas: C.P.length, ms: { campo: tCampo - t0, mallado: tMalla - tCampo, atributos: t1 - tMalla, total: t1 - t0 } } };
}

/**
 * Color final (sRGB 0–1) de un punto según su color de base y sus capas: lo mismo que hace el sombreador (tres.js), para la
 * vista previa sin navegador. `b`: color de base [r, g, b]; `s`: [tela, media, pelo, barba]; `s2`: [panel, ceja, tipo, emblema].
 */
export function capas(c, b, s, s2, out = [0, 0, 0]) {
  let r = b[0], g = b[1], bl = b[2]; const mix = (k, w) => { r += (k[0] - r) * w; g += (k[1] - g) * w; bl += (k[2] - bl) * w; }, e = x => Math.min(1, Math.max(0, x / .0012 + .5));
  if (s2[2] < .5) { mix(c.pelo, e(s[3]) * .6); const zap = s[0] < -2; if (!zap) mix(c.media, e(s[1])); else mix(c.correa, e(s2[3])); const tl = e(s[0]); if (tl > 0) { mix(c.malla, tl); mix(c.panel, tl * e(s2[0])); mix(c.vivo, tl * e(s2[3])); mix(c.vivo, tl * (1 - e(Math.abs(s[0]) - .006)) * .9); } mix(c.pelo, e(s[2])); mix(c.pelo, e(s2[1])); }
  out[0] = r; out[1] = g; out[2] = bl; return out;
}
