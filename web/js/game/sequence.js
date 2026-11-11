// De la máquina del intento a la pose dibujada (docs/JUEGO.md, secciones 3.5 y 9.4). El núcleo fija el calendario y acá se
// acomoda el clip: ritmo variable en el tirón y en el vuelo, esperas solo en poses de reposo, marcha atrás en el amague y
// avance de la pelea entre la pose del fondo y la de pie. Cuerpo y barra salen siempre de la misma muestra.
// Las fases se buscan por segmento y nombre en poses.json, nunca por índice.

const SEG = { s: 'snatch', c: 'clean' };
const REC = { split: 'Envión · Tijera', power: 'Power jerk · Recepción', squat: 'Squat jerk · Recepción' };
const cache = new WeakMap();
/** Tiempos (s) de un segmento: por nombre de fase y la inversa tiempo → muestra fraccionaria. */
export function tramo(P, nombre) {
  let porSeg = cache.get(P); if (!porSeg) cache.set(P, porSeg = {});
  if (porSeg[nombre]) return porSeg[nombre];
  const g = P.segs[nombre], sub = P.sub, tt = g.tt, n = tt.length;
  const i = fase => { const k = g.poses.findIndex(p => p.n === fase || (fase === 'Giro' && p.n === 'Giro de codos')); if (k < 0) throw new Error(`falta ${nombre}/${fase}`); return k * sub; };
  const t = fase => tt[i(fase)];
  const inv = x => { if (x <= tt[0]) return 0; if (x >= tt[n - 1]) return n - 1; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tt[m] <= x) lo = m; else hi = m; } return lo + (x - tt[lo]) / (tt[hi] - tt[lo]); };
  return porSeg[nombre] = { nombre, base: Math.round(g.start * sub), tt, n, i, t, inv, fin: tt[n - 1] };
}
const mix = (a, b, u) => a + (b - a) * Math.min(1, Math.max(0, u));

function tiron(M, now, m, G) {
  const t0 = G.t('Salida'), tx = G.t('Segundo tirón'), jalar = t => (t <= M.tx ? mix(t0, tx, (t - M.tp) / (M.tx - M.tp)) : tx + (t - M.tx) / 1000 * .6);
  if (now < M.t0 && M.amagues.length) { const a = M.amagues[M.amagues.length - 1]; return mix(jalar(a.t), t0, (now - a.t) / Math.max(1, M.t0 - a.t)); }
  if (!M.tp || m.fase === 'tension') return t0;
  if (!M.tr) return jalar(now);
  const fondo = M.mov === 'c' ? G.t('Amortiguación') : G.t('Recepción'), pie = M.mov === 'c' ? G.t('Subida') : G.t('Recuperación');
  if (M.tEnPie && now >= M.tEnPie) return M.mov === 'c' ? Math.min(G.fin, pie + (now - M.tEnPie) / 1000) : pie;
  if (M.pelea && now >= M.pelea.t0 && M.pelea.modo === 'pelea') return mix(fondo, pie, M.pelea.P / 1e6);
  const giro = G.t('Giro'), rec = G.t('Recepción'), tr = jalar(M.tr), tGiro = M.tc - (rec - giro) * 1000;
  if (now <= tGiro) return mix(tr, Math.max(tr, giro), (now - M.tr) / Math.max(1, tGiro - M.tr));
  if (now <= M.tc) return mix(Math.max(tr, giro), rec, (now - tGiro) / Math.max(1, M.tc - tGiro));
  return Math.min(fondo, rec + (now - M.tc) / 1000);      // espera en la primera pose de reposo
}
function envion(M, now, m, G, env) {
  const dip = G.t('Envión · Dip'), rec = G.t(REC[env]), bajar = t => Math.min(dip, (t - M.tp) / 1000 * m.vel / 1000);
  if (now < M.t0 && M.amagues.length) { const a = M.amagues[M.amagues.length - 1]; return mix(bajar(a.t), 0, (now - a.t) / Math.max(1, M.t0 - a.t)); }
  if (!M.tp || m.fase === 'hombros') return 0;
  if (!M.tr) return bajar(now);
  if (now <= M.tc) return mix(bajar(M.tr), rec, (now - M.tr) / Math.max(1, M.tc - M.tr));
  if (env === 'squat') {
    const fondo = G.t('Squat jerk · Fondo'), pie = G.t('Squat jerk · Recuperación');
    if (M.tEnPie && now >= M.tEnPie) return Math.min(G.fin, pie + (now - M.tEnPie) / 1000);
    if (M.pelea && now >= M.pelea.t0) return mix(fondo, pie, M.pelea.P / 1e6);
    return Math.min(fondo, rec + (now - M.tc) / 1000);
  }
  if (M.tPost) { const ini = M.tPost - M.an.post; return now <= ini ? rec : Math.min(G.fin, rec + (now - ini) / 1000); }
  return rec;      // tijera o power con codos blandos: espera en la recepción hasta trabar
}
/**
 * Pose del intento en el instante `now` (ms desde el llamado). `m` es la máquina del intento avanzada hasta `now`.
 * @returns {{seg:string, s:number, tau:number}} segmento, muestra fraccionaria local y tiempo del clip (s)
 */
export function poseDe(m, now, P) {
  const lev = m.c.lev, G = tramo(P, SEG[lev]);
  let seg = G, tau;
  if (m.fase === 'llamado' || !m.tConf) tau = 0;
  else if (!m.movs.length) tau = Math.min(G.t('Salida'), (now - m.tConf) / 1000);
  else {
    const M1 = m.movs[0], M2 = m.movs[1];
    tau = tiron(M1, now, m, G);
    if (M2 && (tau >= G.fin - 1e-6 || M2.tp || M2.amagues.length)) { seg = tramo(P, m.c.env); tau = envion(M2, now, m, seg, m.c.env); }
  }
  return { seg: seg.nombre, s: seg.inv(tau), tau, base: seg.base, primero: seg === G };
}
/** Pose de reposo con la barra en la tarima (el corte tras un fallo y el llamado). */
export const poseParado = (P, lev) => { const G = tramo(P, SEG[lev]); return { seg: G.nombre, s: 0, tau: 0, base: G.base, primero: true }; };
/** Altura (muestra local) de las líneas de ayuda: potencia (muslo alto) y fondo de la flexión. */
export const marcas = (P, lev, env) => ({ potencia: tramo(P, SEG[lev]).i('Segundo tirón') + tramo(P, SEG[lev]).base, flexion: env ? tramo(P, env).i('Envión · Dip') + tramo(P, env).base : -1 });
