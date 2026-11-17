// Vista previa local del cuerpo por código (sin navegador ni Blender): genera la malla, la mide y la dibuja en PNG.
//   node tools/cuerpo/vista.mjs [--pesista=kordan] [--calidad=previa|movil|media|alta] [--out=archivo.png]
//        [--vistas=0,45,90,180] (grados: 0 frente, 90 perfil, 180 espalda)  [--poses=parado,arriba,...] (ver POSES)  [--actual] (al lado, el GLB actual)
//        [--zoom=cabeza|torso|mano] [--medidas] [--alto=560]
import path from 'node:path';
import fs from 'node:fs';
import { esqueletoDe, RAIZ, m4 } from './glb.mjs';
import { actual } from './actual.mjs';
import { Lienzo } from './raster.mjs';
import { generar, capas } from '../../web/js/game/cuerpo/generar.js';
import { FICHAS } from '../../web/js/game/cuerpo/anatomia.js';
import { giroEn, mmul, cruz, nor, sub } from '../../web/js/game/cuerpo/algebra.js';
import { medir, tabla } from '../../web/js/game/cuerpo/medidas.js';

const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; }, tiene = k => process.argv.includes('--' + k);
const nombre = arg('pesista', 'kordan'), calidad = arg('calidad', 'previa'), out = arg('out', path.join(process.env.HOME, 'tarima-datos/tmp/cuerpo/vista.png'));
const e = await esqueletoDe(path.join(RAIZ, 'web/models', nombre + '.glb'));
const t0 = Date.now(), M = generar({ nombres: e.nombres, padre: e.padre, reposo: e.reposo }, FICHAS[arg('ficha', 'lamina')] || {}, calidad);
console.log(`generado en ${Date.now() - t0} ms · ${M.info.triangulos} triángulos · ${M.info.vertices} vértices · ${M.info.primitivas} primitivas ·`, JSON.stringify(M.info.ms), M.partes.map(p => `${p.nombre} ${p.i[1] / 3}`).join(' · '));

// poses: fase del clip (segmento y nombre de la pose en poses.json) → instante del clip
const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'web/data/poses.json'), 'utf8'))[nombre];
export const POSES = { parado: ['clean', 'Parado'], salida: ['clean', 'Salida'], tiron: ['clean', 'Segundo tirón'], extension: ['clean', 'Triple extensión'], recepcion: ['clean', 'Amortiguación'], rack: ['clean', 'Recuperación'], dip: ['split', 'Envión · Dip'], tijera: ['split', 'Envión · Tijera'], final: ['split', 'Envión · Final'] };
for (const [k, s] of Object.entries(datos.segs)) s.poses.forEach((p, i) => { POSES[`${k}:${i}`] = [k, p.n]; });
const instante = clave => { const [seg, n] = POSES[clave] || []; const s = datos.segs[seg]; if (!s) throw new Error('pose desconocida: ' + clave + ' (hay: ' + Object.keys(POSES).join(', ') + ')'); const i = s.poses.findIndex(p => p.n === n); return e.t0 + s.start + i; };
if (tiene('lista')) { for (const [k, s] of Object.entries(datos.segs)) console.log(k, s.start, s.poses.map((p, i) => `${i}:${p.n}`).join(' | ')); }

/** Matrices de piel (mundo × inversa de reposo) de la pose en el instante t, con los huesos auxiliares. `reposo`: sin animar. */
function pielEn(t) {
  const L = t === null ? e.local : e.locales(t), W = e.mundo(L), S = W.map((w, i) => m4.mul(w, e.inversas[i]));
  for (const [, padre, hijo] of M.aux) { const ip = e.nombres.indexOf(padre), ih = e.nombres.indexOf(hijo), q0 = e.local[ih].q, q = L[ih].q; let d = q0[0] * q[0] + q0[1] * q[1] + q0[2] * q[2] + q0[3] * q[3]; const sg = d < 0 ? -1 : 1, h = [q0[0] + sg * q[0], q0[1] + sg * q[1], q0[2] + sg * q[2], q0[3] + sg * q[3]], n = Math.hypot(...h);
    S.push(m4.mul(m4.mul(W[ip], m4.trs(L[ih].t, h.map(v => v / n), L[ih].s)), e.inversas[ih])); }
  return { S, W };
}
/**
 * Pose de la lámina del dueño (de pie, brazos colgando un poco abiertos, codos apenas doblados): la pose de reposo del
 * esqueleto con los brazos bajados `bajar` grados y los codos estirados `estirar` grados. No sale del clip.
 */
export function poseLamina(bajar = +arg('bajar', 28), estirar = +arg('estirar', 30), abrir = +arg('abrir', 3.5)) {
  const W = e.reposo.map(m => m.slice()), ix = n => e.nombres.indexOf(n), desc = i => { const r = [i]; for (let k = 0; k < r.length; k++) e.padre.forEach((p, j) => { if (p === r[k]) r.push(j); }); return r; }, pos = i => W[i].slice(12, 15), aux = {};
  for (const [L, sg, sa] of [['Left', 1, 'L'], ['Right', -1, 'R']]) {
    const iA = ix(L + 'Arm'), iF = ix(L + 'ForeArm'), iH = ix(L + 'Hand'), iU = ix(L + 'UpLeg'), iP = ix(L + 'Foot');
    { const M0 = giroEn(pos(iU), [0, 0, 1], sg * abrir * Math.PI / 180); for (const j of desc(iU)) W[j] = mmul(M0, W[j]); const M3 = giroEn(pos(iP), [0, 0, 1], -sg * abrir * Math.PI / 180); for (const j of desc(iP)) W[j] = mmul(M3, W[j]); }      // piernas un poco más abiertas, con el pie plano
    const M1 = giroEn(pos(iA), [0, 0, 1], -sg * bajar * Math.PI / 180); for (const j of desc(iA)) W[j] = mmul(M1, W[j]);
    const eje = nor(cruz(sub(pos(iH), pos(iF)), sub(pos(iA), pos(iF)))), mitad = mmul(giroEn(pos(iF), eje, -estirar * .5 * Math.PI / 180), W[iF]), M2 = giroEn(pos(iF), eje, -estirar * Math.PI / 180); for (const j of desc(iF)) W[j] = mmul(M2, W[j]);
    aux['aux_codo_' + sa] = mitad;
  }
  const S = W.map((w, i) => m4.mul(w, e.inversas[i])); for (const [n, , hijo] of M.aux) { const ih = ix(hijo); S.push(m4.mul(aux[n] || W[ih], e.inversas[ih])); }
  return { S, W };
}
function posar(m, S) {
  const n = m.pos.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2], nx = m.nor[i * 3], ny = m.nor[i * 3 + 1], nz = m.nor[i * 3 + 2]; let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) { const w = m.jw[i * 4 + k]; if (!w) continue; const A = S[m.ji[i * 4 + k]]; px += w * (A[0] * x + A[4] * y + A[8] * z + A[12]); py += w * (A[1] * x + A[5] * y + A[9] * z + A[13]); pz += w * (A[2] * x + A[6] * y + A[10] * z + A[14]); qx += w * (A[0] * nx + A[4] * ny + A[8] * nz); qy += w * (A[1] * nx + A[5] * ny + A[9] * nz); qz += w * (A[2] * nx + A[6] * ny + A[10] * nz); }
    const l = Math.hypot(qx, qy, qz) || 1; P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz; N[i * 3] = qx / l; N[i * 3 + 1] = qy / l; N[i * 3 + 2] = qz / l; }
  return { pos: P, nor: N };
}
/** Barra simple en el hueso Bar (un cilindro y dos discos), para ver las manos. */
function barra(W) {
  const B = W[e.nombres.indexOf('Bar')], pos = [], nor = [], ind = [], cols = [];
  const cil = (x0, x1, r, col) => { const n = 20, b = pos.length / 3; for (const x of [x0, x1]) for (let i = 0; i < n; i++) { const a = i / n * 6.2832, p = [x, Math.cos(a) * r, Math.sin(a) * r]; pos.push(B[0] * p[0] + B[4] * p[1] + B[8] * p[2] + B[12], B[1] * p[0] + B[5] * p[1] + B[9] * p[2] + B[13], B[2] * p[0] + B[6] * p[1] + B[10] * p[2] + B[14]); nor.push(0, Math.cos(a), Math.sin(a)); cols.push(col); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; ind.push(b + i, b + j, b + n + i, b + j, b + n + j, b + n + i); } const c = pos.length / 3; for (const [x, s] of [[x0, -1], [x1, 1]]) { const o = pos.length / 3; pos.push(B[0] * x + B[12], B[1] * x + B[13], B[2] * x + B[14]); nor.push(s, 0, 0); cols.push(col); for (let i = 0; i < n; i++) { const j = (i + 1) % n, k = b + (s > 0 ? n : 0); ind.push(o, k + (s > 0 ? i : j), k + (s > 0 ? j : i)); } } };
  cil(-1.1, 1.1, .014, [.75, .76, .78]); for (const s of [-1, 1]) cil(s * .68, s * .76, .225, [.72, .13, .12]);
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), ind: Uint32Array.from(ind), color: (i, o) => { o[0] = cols[i][0]; o[1] = cols[i][1]; o[2] = cols[i][2]; }, dosCaras: true };
}

const _b = [0, 0, 0], _s = [0, 0, 0, 0], _s2 = [0, 0, 0, 0];
const pixel = (a, b, c, w0, w1, w2, out) => { for (let k = 0; k < 3; k++) _b[k] = w0 * M.col[a * 3 + k] + w1 * M.col[b * 3 + k] + w2 * M.col[c * 3 + k];
  for (let k = 0; k < 4; k++) { _s[k] = w0 * M.sup[a * 4 + k] + w1 * M.sup[b * 4 + k] + w2 * M.sup[c * 4 + k]; _s2[k] = w0 * M.sup2[a * 4 + k] + w1 * M.sup2[b * 4 + k] + w2 * M.sup2[c * 4 + k]; } _s2[2] = Math.max(M.sup2[a * 4 + 2], M.sup2[b * 4 + 2], M.sup2[c * 4 + 2]); return capas(M.colores, _b, _s, _s2, out); };
const vistas = arg('vistas', '0,45,90,180').split(',').map(Number), poses = arg('poses', 'lamina').split(','), alto = +arg('alto', 560), zoom = arg('zoom', '');
const A = tiene('actual') ? await actual(nombre) : null, filas = poses.length * (A ? 2 : 1), cw = Math.round(alto * (zoom ? .9 : .62));
const lz = new Lienzo(cw * vistas.length, alto * filas, arg('fondo', '') ? arg('fondo').split(',').map(Number) : undefined);
const ZOOM = { cabeza: [[0, 1.58, .05], 1 / .34], torso: [[0, 1.2, 0], 1 / .8], mano: [[.5, 1.0, .2], 1 / .3], pie: [[.2, .05, .05], 1 / .4], pierna: [[.1, .5, 0], 1 / 1.0] };
poses.forEach((clave, f) => {
  const { S, W } = clave === 'lamina' ? poseLamina() : pielEn(clave === 'reposo' ? null : instante(clave)), nuevo = posar(M, S), m = { ...nuevo, ind: M.ind, pixel };
  // encuadre: el centro de la caja de la malla en esta pose
  let lo = [9, 9, 9], hi = [-9, -9, -9]; for (let i = 0; i < m.pos.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], m.pos[i + c]); hi[c] = Math.max(hi[c], m.pos[i + c]); }
  let z = ZOOM[zoom]; if (zoom.startsWith('hueso:')) { const [, h, an] = zoom.split(':'), w = W[e.nombres.indexOf(h)]; z = [[w[12], w[13], w[14]], 1 / +(an || .35)]; }
  const centro = z ? z[0] : [0, (!tiene('barra') ? (lo[1] + hi[1]) / 2 : .98), (lo[2] + hi[2]) / 2], escala = z ? alto * z[1] : alto / (!tiene('barra') ? 1.9 : 2.35);
  const bar = clave !== 'reposo' && clave !== 'lamina' && tiene('barra') ? barra(W) : null;
  vistas.forEach((g, c) => { const cam = { giro: g, alto: +arg('picado', 6), centro, escala }, rect = [c * cw, f * (A ? 2 : 1) * alto, cw, alto]; lz.malla(m, cam, rect); if (bar) lz.malla(bar, cam, rect);
    if (A) { const r2 = [c * cw, (f * 2 + 1) * alto, cw, alto]; for (const p of A.partes) { const q = posar(p, S), gris = p.material === 'Body' ? [.62, .6, .58] : p.material === 'Hair' ? [.2, .18, .17] : [.45, .45, .5]; lz.malla({ ...q, ind: p.ind, color: (i, o) => { o[0] = gris[0]; o[1] = gris[1]; o[2] = gris[2]; } }, cam, r2); } if (bar) lz.malla(bar, cam, r2); } });
});
fs.mkdirSync(path.dirname(out), { recursive: true }); lz.png(out); console.log('→', out);
if (tiene('medidas')) {
  const dom = new Array(M.pos.length / 3); for (let i = 0; i < dom.length; i++) { let k = 0; for (let j = 1; j < 4; j++) if (M.jw[i * 4 + j] > M.jw[i * 4 + k]) k = j; dom[i] = M.huesos[M.ji[i * 4 + k]]; }
  const cuerpo = M.partes.filter(p => !/cinturon|rodillera|muñequera|ojo|hebilla/.test(p.nombre)), n = cuerpo.reduce((s, p) => Math.max(s, p.v[0] + p.v[1]), 0);
  const r = medir({ pos: M.pos.subarray(0, n * 3), dom: dom.slice(0, n) }, M.J, M.ficha.estatura), ra = (A || await actual(nombre)); const rA = medir(ra.cuerpo, ra.J, M.ficha.estatura);
  const txt = tabla(r, { actual: rA }); console.log(txt); if (arg('tabla')) fs.writeFileSync(arg('tabla'), `Medidas sobre la malla (fracción de la estatura, ${M.ficha.estatura} m) · ${nombre} · calidad ${calidad} · ${M.info.triangulos} triángulos\n` + txt + '\n');
}
