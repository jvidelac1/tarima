// Medidas sobre una malla de pesista, como fracción de la estatura. Las mismas definiciones que la línea ANTROM del build de
// Blender (blender/geo.py, antro_malla): perímetros = casco convexo del corte con un plano perpendicular al hueso, tomando los
// vértices del miembro a menos de 7 mm del plano. Sirve para la malla por código y para la del GLB actual (misma vara).
// Sin dependencias: corre en Node y en el navegador.

/** Perímetro del casco convexo de puntos 2D [[x, y], …]. */
export function perimetroCasco(P) {
  const pts = [...new Map(P.map(p => [Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 6) return NaN;
  const medio = L => { const h = []; for (const q of L) { while (h.length >= 2 && (h[h.length - 1][0] - h[h.length - 2][0]) * (q[1] - h[h.length - 2][1]) - (h[h.length - 1][1] - h[h.length - 2][1]) * (q[0] - h[h.length - 2][0]) <= 0) h.pop(); h.push(q); } return h; };
  const hull = [...medio(pts).slice(0, -1), ...medio(pts.slice().reverse()).slice(0, -1)]; let s = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return s;
}

export const METAS = { 'cabeza (H/alto)': [7.3, 7.9], 'cuello perim': [.225, .275], 'hombros malla': [.275, .315], 'biceps perim': [.21, .25], 'antebrazo perim': [.17, .195], 'muñeca perim': [.095, .115],
  'pecho perim': [.62, .70], 'cintura perim': [.46, .53], 'hombros/cintura': [1.35, 9], 'cadera perim': null, 'muslo perim': [.37, .42], 'muslo bajo perim': null, 'pantorrilla perim': [.235, .26], 'gluteo proyeccion': [.08, .16], 'entrepierna': [.43, .475] };
/** Lo que pidió el dueño para Kordan (fracción de la estatura). */
export const OBJETIVO = { 'cabeza (H/alto)': 7.5, 'hombros malla': .295, 'biceps perim': .23, 'pecho perim': .66, 'cintura perim': .50, 'muslo perim': .40, 'pantorrilla perim': .245 };

/**
 * @param m  { pos: Float32Array (reposo, y arriba, +z al frente), dom: nombre del hueso que más pesa en cada vértice (array), piel: Uint8Array opcional (1 = vértice de piel/cuerpo) }
 * @param J  nombre de hueso → [x, y, z] de la articulación en reposo
 * @param H  estatura (m)
 * @param piso  y del piso en las coordenadas de la malla
 */
export function medir(m, J, H, { piso = -.016 } = {}) {
  const P = m.pos, n = P.length / 3, dom = m.dom, K = H / 1.69, r = {};
  const es = (...N) => { const S = new Set(N); return i => S.has(dom[i]); };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nor = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const corte = (mask, p0, eje, rmax, tol = .007) => {
    eje = nor(eje); let e1 = cruz(eje, [0, 0, 1]); if (Math.hypot(...e1) < .1) e1 = cruz(eje, [1, 0, 0]); e1 = nor(e1); const e2 = cruz(eje, e1), pts = [];
    for (let i = 0; i < n; i++) { if (!mask(i)) continue; const q = [P[i * 3] - p0[0], P[i * 3 + 1] - p0[1], P[i * 3 + 2] - p0[2]], d = dot(q, eje); if (Math.abs(d) > tol) continue; const a = dot(q, e1), b = dot(q, e2); if (a * a + b * b < rmax * rmax) pts.push([a, b]); }
    return perimetroCasco(pts);
  };
  const izq = i => P[i * 3] > .004, y = [0, 1, 0], max = L => Math.max(...L.filter(Number.isFinite)), min = L => Math.min(...L.filter(Number.isFinite));
  // cabeza: del mentón (lo más bajo de la cara en la línea media, adelante) a la coronilla
  const cab = es('Head'); let top = -9, znariz = -9; for (let i = 0; i < n; i++) if (cab(i)) { top = Math.max(top, P[i * 3 + 1]); znariz = Math.max(znariz, P[i * 3 + 2]); }
  let chin = 9; for (let i = 0; i < n; i++) if (cab(i) && Math.abs(P[i * 3]) < .015 && P[i * 3 + 2] > znariz - .045) chin = Math.min(chin, P[i * 3 + 1]);
  r['cabeza (H/alto)'] = H / Math.max(top - chin, 1e-3); r._menton = chin; r._coronilla = top;
  const nk = J.Neck, hd = J.Head, mc = es('Neck', 'Head', 'Spine2', 'LeftShoulder', 'RightShoulder');
  r['cuello perim'] = min([.3, .45, .6, .75, .9].map(q => corte(mc, lerp(nk, hd, q), sub(hd, nk), .11 * K))) / H;
  const a = J.LeftArm, f = J.LeftForeArm, w = J.LeftHand, mb = es('LeftArm', 'LeftShoulder', 'LeftForeArm', 'aux_codo_L'), brazo = i => izq(i) && mb(i);
  r['biceps perim'] = max([.45, .55, .65].map(q => corte(brazo, lerp(a, f, q), sub(f, a), .105 * K))) / H;
  const ma = es('LeftForeArm', 'LeftArm', 'aux_codo_L'), mm = es('LeftForeArm', 'LeftHand');
  r['antebrazo perim'] = max([.15, .22, .3].map(q => corte(i => izq(i) && ma(i), lerp(f, w, q), sub(w, f), .085 * K))) / H; r['muñeca perim'] = corte(mm, lerp(f, w, .93), sub(w, f), .06 * K) / H;
  // ancho de hombros con deltoides: articulación más el radio del deltoides sobre el eje del húmero, del lado de afuera (percentil 96)
  { const ax = nor(sub(f, a)), L = Math.hypot(...sub(f, a)); let lat = cruz(ax, [0, 0, 1]); if (lat[0] < 0) lat = lat.map(v => -v); const da = [];
    for (let i = 0; i < n; i++) { if (!izq(i)) continue; const q = [P[i * 3] - a[0], P[i * 3 + 1] - a[1], P[i * 3 + 2] - a[2]], t = dot(q, ax); if (t < -.01 || t > .30 * L) continue; const pr = q.map((v, c) => v - t * ax[c]), d = Math.hypot(...pr); if (d < .12 * K && dot(pr, lat) > .8 * d) da.push(d); }
    da.sort((p, q) => p - q); r['hombros malla'] = da.length > 5 ? (2 * a[0] + 2 * da[Math.floor(da.length * .96)]) / H : NaN; }
  const tr = es('Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftUpLeg', 'RightUpLeg'), hz = J.LeftUpLeg[1], sz = a[1];
  r['pecho perim'] = max([.09, .115, .14].map(q => corte(tr, [0, sz - q * K, 0], y, .30 * K))) / H;
  let cmin = 9, zc = 0; for (let k = 0; k < 9; k++) { const zz = hz + (.07 + (.24 - .07) * k / 8) * K, c = corte(tr, [0, zz, 0], y, .30 * K); if (c < cmin) { cmin = c; zc = zz; } }
  r['cintura perim'] = cmin / H; let anc = 0; for (let i = 0; i < n; i++) if (tr(i) && Math.abs(P[i * 3 + 1] - zc) < .008) anc = Math.max(anc, Math.abs(P[i * 3]));
  r['hombros/cintura'] = r['hombros malla'] * H / Math.max(2 * anc, 1e-3);
  r['cadera perim'] = max([-.03, 0, .03].map(q => corte(tr, [0, hz + q * K, 0], y, .32 * K))) / H;
  const u = J.LeftUpLeg, k = J.LeftLeg, t2 = J.LeftFoot, mp = es('LeftUpLeg', 'Hips', 'LeftLeg', 'aux_rodilla_L'), pierna = i => izq(i) && mp(i);
  r['muslo perim'] = max([.30, .36, .42].map(q => corte(pierna, lerp(u, k, q), sub(k, u), .22 * K))) / H; r['muslo bajo perim'] = corte(pierna, lerp(u, k, .78), sub(k, u), .16 * K) / H;
  const mq = es('LeftLeg', 'LeftUpLeg', 'aux_rodilla_L'); r['pantorrilla perim'] = max([.22, .28, .34, .4].map(q => corte(i => izq(i) && mq(i), lerp(k, t2, q), sub(t2, k), .13 * K))) / H;
  const mg = es('Hips', 'LeftUpLeg', 'RightUpLeg'); let gl = -9, en = 9; for (let i = 0; i < n; i++) { if (!mg(i)) continue; const py = P[i * 3 + 1];
    if (py > hz - .07 * K && py < hz + .08 * K) gl = Math.max(gl, -P[i * 3 + 2]); if (Math.abs(P[i * 3]) < .012 && py > k[1]) en = Math.min(en, py); }
  r['gluteo proyeccion'] = (gl + u[2]) / H; r['entrepierna'] = (en - piso) / H;
  return r;
}

/** Tabla de texto: medida, valor, meta de pesista (ANTROM), objetivo del dueño. `otras`: { etiqueta: resultado de medir() } para comparar. */
export function tabla(r, otras = {}) {
  const f = v => (Number.isFinite(v) ? (v > 3 ? v.toFixed(2) : v.toFixed(3)) : '—').padStart(8), L = [];
  L.push('medida'.padEnd(20) + 'código'.padStart(8) + Object.keys(otras).map(k => k.padStart(8)).join('') + '   meta ANTROM    objetivo');
  for (const k of Object.keys(METAS)) { const m = METAS[k], v = r[k], fuera = m && !(v >= m[0] && v <= m[1]);
    L.push(k.padEnd(20) + f(v) + Object.values(otras).map(o => f(o[k])).join('') + '   ' + (m ? `${m[0]}–${m[1] === 9 ? '' : m[1]}`.padEnd(13) : ''.padEnd(13)) + (OBJETIVO[k] ? String(OBJETIVO[k]).padStart(7) : '       ') + (fuera ? '   FUERA' : '')); }
  return L.join('\n');
}
