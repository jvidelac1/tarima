// Línea de tiempo de un levantamiento: une los segmentos del clip, mapea tiempo real <-> muestra con `tt`
// (o con duraciones por defecto) y deriva altura, velocidad y aceleración de la barra.
import { Pchip, clamp } from './util.js';
import { DUR, DUR_DEFAULT, RACK_HOLD, PLATE_R } from './config.js';

/** La barra se da por apoyada mientras el hueso Bar no suba más que esto sobre el radio del disco (m). */
const LIFT_EPS = .012, LIFT_RISE = .002;

// Fases que empiezan y terminan casi en reposo: sin `tt` del build, las muestras se reparten con aceleración y frenado
// (inversa de smoothstep) en vez de una rampa de velocidad constante.
const EASE = { 'Salida': .85, 'Recuperación': .8, 'Envión · Recuperación': .75, 'Envión · Final': .75, 'Squat jerk · Recuperación': .8 };
const invSmooth = u => .5 - Math.sin(Math.asin(1 - 2 * u) / 3);
function defaultTT(seg, sub) {
  const tt = [0]; let t = 0;
  for (let k = 1; k < seg.poses.length; k++) {
    const d = DUR[seg.poses[k].n] || DUR_DEFAULT, e = EASE[seg.poses[k].n] || 0;
    for (let j = 1; j <= sub; j++) { const u = j / sub; tt.push(t + d * (u + (invSmooth(u) - u) * e)); }
    t += d;
  }
  return tt;
}
function validTT(tt, n) {
  if (!Array.isArray(tt) || tt.length !== n) return false;
  for (let i = 1; i < n; i++) if (!(tt[i] > tt[i - 1])) return false;
  return true;
}

export class Timeline {
  /**
   * @param {object} data   entrada del personaje en poses.json
   * @param {'c'|'s'} lift  dos tiempos o arranque
   * @param {string} jerk   split | power | squat
   * @param {Array<{y:number,z:number}>} barPos posición de la barra por muestra del clip
   */
  constructor(data, lift, jerk, barPos) {
    const sub = this.sub = data.sub, S = data.segs;
    this.lift = lift; this.jerk = jerk;
    this.phases = [];      // una entrada por fase de la línea de tiempo
    const clipIdx = [];    // muestra del clip para cada muestra de la línea de tiempo
    const knotT = [], knotS = [];
    this.hasRealTiming = true;
    const add = (name, from, t0) => {
      const seg = S[name], n = (seg.poses.length - 1) * sub + 1;
      let tt = seg.tt;
      if (!validTT(tt, n)) { tt = defaultTT(seg, sub); this.hasRealTiming = false; }
      seg.poses.forEach((p, i) => { if (i >= from) this.phases.push({ seg: name, i, ...p }); });
      const base = Math.round(seg.start * sub), first = from * sub;
      for (let j = first + (from ? 1 : 0); j < n; j++) { clipIdx.push(base + j); knotT.push(t0 + tt[j] - tt[first]); knotS.push(clipIdx.length - 1); }
      return t0 + tt[n - 1] - tt[first];
    };
    if (lift === 's') add('snatch', 0, 0);
    else {
      const tEnd = add('clean', 0, 0);
      // pausa en el rack: mismo cuadro, más tiempo. El índice 0 del envión duplica el último de la cargada.
      knotT.push(tEnd + RACK_HOLD); knotS.push(knotS[knotS.length - 1]);
      this.rackSample = knotS[knotS.length - 1]; this.rackT0 = tEnd; this.rackT1 = tEnd + RACK_HOLD; this._holdKnot = knotT.length - 1;
      this.rackFrom = clipIdx[clipIdx.length - 1]; this.rackTo = Math.round(S[jerk].start * sub);
      const seg = S[jerk], n = (seg.poses.length - 1) * sub + 1, base = Math.round(seg.start * sub);
      let tt = seg.tt; if (!validTT(tt, n)) { tt = defaultTT(seg, sub); this.hasRealTiming = false; }
      seg.poses.forEach((p, i) => { if (i >= 1) this.phases.push({ seg: jerk, i, ...p }); });
      for (let j = 1; j < n; j++) { clipIdx.push(base + j); knotT.push(tEnd + RACK_HOLD + tt[j] - tt[0]); knotS.push(clipIdx.length - 1); }
    }
    this.clipIdx = clipIdx; this.count = clipIdx.length; this.nPhases = this.phases.length;
    this.duration = knotT[knotT.length - 1];
    this._s = new Pchip(knotT, knotS, { flatEnds: true });
    this._knotT = knotT; this._knotS = knotS;
    this.grip = lift === 's' ? data.grip?.snatch : data.grip?.clean;
    // trayectoria de la barra en el tiempo (para velocidad, aceleración y traza)
    const by = knotS.map(s => barPos[clipIdx[s]].y), bz = knotS.map(s => barPos[clipIdx[s]].z);
    if (this._holdKnot !== undefined) { by[this._holdKnot] = barPos[this.rackTo].y; bz[this._holdKnot] = barPos[this.rackTo].z; }
    // La barra cargada no se mueve hasta el despegue: de 'Parado' a 'Salida' queda apoyada en la tarima (centro a un
    // radio de disco) y en el z de la salida, aunque el hueso Bar del build suba o ruede mientras el atleta se acomoda.
    // La diferencia con el hueso en la salida se disuelve en la primera mitad del primer tirón.
    this.liftT = 0; this.liftFadeT = 0;
    // El despegue se lee de los datos (último nudo con el hueso Bar todavía a la altura del disco apoyado), no del nombre
    // ni del número de las fases.
    {
      // (último nudo en que la barra todavía no subió LIFT_RISE sobre su mínimo: con un umbral más ancho el despegue caía un
      // nudo adentro del primer tirón y las manos subían unos 9 mm antes que la barra)
      let kL = -1, lo = by[0]; const y0 = by[0];
      if (y0 < PLATE_R + .04) while (kL + 1 < by.length && Math.abs(by[kL + 1] - y0) < LIFT_EPS && by[kL + 1] <= lo + LIFT_RISE) { kL++; lo = Math.min(lo, by[kL]); }
      if (kL >= by.length - 1) kL = -1;
      const kF = Math.min(by.length - 1, kL + Math.max(2, Math.ceil(sub / 2)));
      if (kL > 0 && kF > kL) {
        this.liftT = knotT[kL]; this.liftFadeT = knotT[kF]; this._liftDy = PLATE_R - by[kL]; this._liftZ = bz[kL];
        // cuánto se mueve el hueso antes del despegue (m) y a qué altura queda sobre el apoyo real en ese momento (m)
        this.preLiftDrift = Math.max(...by.slice(0, kL + 1).map(y => Math.abs(y - by[kL])), ...bz.slice(0, kL + 1).map(z => Math.abs(z - bz[kL])));
        this.preLiftFloat = by[kL] - PLATE_R;
        for (let k = 0; k <= kL; k++) { by[k] = PLATE_R; bz[k] = this._liftZ; }
        for (let k = kL + 1; k < kF; k++) by[k] = Math.max(PLATE_R, by[k] + this._liftDy * this._liftFade(knotT[k]));
      }
    }
    this._by = new Pchip(knotT, by, { flatEnds: true }); this._bz = new Pchip(knotT, bz, { flatEnds: true });
  }
  _liftFade(t) { const x = clamp((t - this.liftT) / (this.liftFadeT - this.liftT), 0, 1); return 1 - x * x * (3 - 2 * x); }
  /** Corrige la posición del hueso Bar (v, en mundo) para que la barra no se mueva antes del despegue. */
  barFix(t, v) {
    if (!this.liftFadeT) return v;
    if (t <= this.liftT) { v.y = PLATE_R; v.z = this._liftZ; }
    else if (t < this.liftFadeT) v.y = Math.max(PLATE_R, v.y + this._liftDy * this._liftFade(t));
    return v;
  }
  /** Muestra (fraccionaria) de la línea de tiempo en el instante t. */
  sampleAt(t) { return clamp(this._s.at(clamp(t, 0, this.duration)), 0, this.count - 1); }
  /** Instante en que se alcanza la muestra s (inversa por bisección: sampleAt es monótona). */
  timeAt(s) {
    s = clamp(s, 0, this.count - 1); let lo = 0, hi = this.duration;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (this._s.at(mid) < s) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  /**
   * Pausa del rack: el índice 0 del envión debería duplicar la última muestra de la cargada (contrato 2), pero si el
   * build trae una diferencia chica se funde de una a la otra a lo largo de la pausa, sin salto.
   * Devuelve null fuera de la pausa, o {from, to, u} con índices de muestra del clip.
   */
  rackBlend(t) {
    if (this.rackT0 === undefined || t <= this.rackT0 || t > this.rackT1) return null;
    const x = (t - this.rackT0) / (this.rackT1 - this.rackT0); return { from: this.rackFrom, to: this.rackTo, u: x * x * (3 - 2 * x) };
  }
  /**
   * Pose del clip en el instante t: {from, to, u} con dos índices de muestra del clip y la mezcla entre ellos.
   * Entre muestras de la línea de tiempo se interpola sobre muestras contiguas del clip; pasada la pausa del rack, la
   * muestra del rack es la primera del envión.
   */
  clipPose(t) {
    const h = this.rackBlend(t); if (h) return h;
    const s = this.sampleAt(t), i0 = Math.floor(s), u = s - i0;
    if (u > 1e-9) { const b = this.clipIdx[Math.min(this.count - 1, i0 + 1)]; return { from: b - 1, to: b, u }; }
    const i = this.rackT1 !== undefined && t > this.rackT1 && i0 === this.rackSample ? this.rackTo : this.clipIdx[i0];
    return { from: i, to: i, u: 0 };
  }
  /** Altura máxima de la barra entre t y t + ventana (para que la cámara se anticipe). */
  barTopAhead(t, win = 1.5, n = 12) { let m = this.barY(t); for (let i = 1; i <= n; i++) m = Math.max(m, this.barY(Math.min(this.duration, t + win * i / n))); return m; }
  phaseAt(t) { return this.sampleAt(t) / this.sub; }
  timeAtPhase(p) { return this.timeAt(p * this.sub); }
  barY(t) { return this._by.at(clamp(t, 0, this.duration)); }
  barZ(t) { return this._bz.at(clamp(t, 0, this.duration)); }
  barVel(t, h = 1 / 60) { const a = Math.max(0, t - h), b = Math.min(this.duration, t + h); return b > a ? (this.barY(b) - this.barY(a)) / (b - a) : 0; }
  /** Velocidad vertical máxima de la barra en todo el levantamiento: {v (m/s), t (s)}. */
  peakVel() {
    if (!this._peak) { let v = 0, t = 0; const n = Math.ceil(this.duration * 240); for (let i = 0; i <= n; i++) { const x = this.duration * i / n, y = this.barVel(x, 1 / 120); if (y > v) { v = y; t = x; } } this._peak = { v, t }; }
    return this._peak;
  }
  barAcc(t, h = 1 / 45) {
    if (t < h || t > this.duration - h) return 0;
    return clamp((this.barY(t + h) - 2 * this.barY(t) + this.barY(t - h)) / (h * h), -45, 45);
  }
  /** Lecturas interpoladas entre fases (torso, cadera) en la posición de fase p. */
  readout(p) {
    const a = clamp(Math.floor(p), 0, this.nPhases - 2), u = clamp(p - a, 0, 1), A = this.phases[a], B = this.phases[a + 1];
    const mix = k => A[k] + (B[k] - A[k]) * u;
    return { name: this.phases[clamp(Math.round(p), 0, this.nPhases - 1)].n, index: clamp(Math.round(p), 0, this.nPhases - 1), lean: mix('lean'), hip: mix('hip'), bz: mix('bz') };
  }
}
