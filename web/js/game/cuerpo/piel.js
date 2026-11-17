// Pesos de piel por regla. Cada región del cuerpo (tronco, brazo, pierna, dedo) tiene una función que reparte un punto entre
// los huesos de su cadena según por dónde pasa respecto de cada articulación; cada primitiva del campo apunta a una de estas
// funciones, y el peso final de un vértice es la mezcla de las primitivas que lo dominan (generar.js).
// Codo y rodilla llevan un hueso auxiliar (`aux_codo_L`, `aux_rodilla_L`…) que gira la mitad que el hijo: reparte el doblez
// en dos y la articulación no se aplasta. No llevan claves de animación: los mueve quien anima (tres.js, tools/cuerpo).
import { sub, dot, nor, add, sstep } from './algebra.js';

/** Huesos auxiliares: [nombre, padre, hijo (el hueso del que toma la mitad del giro)]. */
export const AUX = [['aux_codo_L', 'LeftArm', 'LeftForeArm'], ['aux_codo_R', 'RightArm', 'RightForeArm'], ['aux_rodilla_L', 'LeftUpLeg', 'LeftLeg'], ['aux_rodilla_R', 'RightUpLeg', 'RightLeg']];

/**
 * @param J    nombre de hueso → posición de su articulación (pose de generación)
 * @param ix   nombre de hueso → índice en la lista de huesos de la malla
 * Devuelve funciones `f(x, y, z, acc, peso)` que suman en `acc` (Float32Array, un lugar por hueso).
 */
export function hacerPiel(J, ix) {
  const I = n => { const i = ix(n); if (i === undefined || i < 0) throw new Error('hueso desconocido: ' + n); return i; };
  const rigido = n => { const i = I(n); return (x, y, z, acc, f) => { acc[i] += f; }; };
  const mezcla = (...pares) => (x, y, z, acc, f) => { for (let i = 0; i < pares.length; i += 2) pares[i](x, y, z, acc, f * pares[i + 1]); };
  // tronco: por altura. La parte de Spine2 cerca de los hombros pasa a las clavículas (cintura escapular).
  const T = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'].map(I), ty = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'].map(n => J[n][1]), tw = [.05, .05, .06, .03, .028];
  const cL = I('LeftShoulder'), cR = I('RightShoulder'), yh = J.LeftArm[1];
  const tronco = (x, y, z, acc, f) => {
    let resto = f;
    for (let k = 4; k >= 0; k--) { const u = sstep(ty[k] - tw[k], ty[k] + tw[k], y), w = resto * u;
      if (k === 2 && w > 0) { const c = sstep(.07, .19, Math.abs(x)) * sstep(yh - .1, yh - .01, y) * .85; acc[x > 0 ? cL : cR] += w * c; acc[T[3]] += w * (1 - c); } else acc[T[k + 1]] += w;
      resto -= w; if (resto <= 0) return; }
    acc[T[0]] += resto;
  };
  const cabeza = rigido('Head');
  const lados = {};
  for (const [L, s] of [['Left', 'L'], ['Right', 'R']]) {
    // brazo: clavícula → brazo → (aux del codo) → antebrazo → mano
    const C = J[L + 'Shoulder'], S = J[L + 'Arm'], E = J[L + 'ForeArm'], W = J[L + 'Hand'], uS = nor(sub(E, S)), uF = nor(sub(W, E)), bE = nor(add(uS, uF));
    const iC = I(L + 'Shoulder'), iA = I(L + 'Arm'), iX = I('aux_codo_' + s), iF = I(L + 'ForeArm'), iH = I(L + 'Hand'), i2 = I('Spine2'), uC = nor(sub(S, C));
    const brazo = (x, y, z, acc, f) => {
      const a = sstep(-.055, .04, (x - S[0]) * uS[0] + (y - S[1]) * uS[1] + (z - S[2]) * uS[2]);
      if (a < 1) { const c = sstep(-.02, .1, (x - C[0]) * uC[0] + (y - C[1]) * uC[1] + (z - C[2]) * uC[2]); acc[iC] += f * (1 - a) * c; acc[i2] += f * (1 - a) * (1 - c); if (a <= 0) return; }
      const e = sstep(-.05, .05, (x - E[0]) * bE[0] + (y - E[1]) * bE[1] + (z - E[2]) * bE[2]); acc[iA] += f * a * (1 - e) * (1 - e); acc[iX] += f * a * 2 * e * (1 - e);
      if (e <= 0) return; const w = sstep(-.03, .02, (x - W[0]) * uF[0] + (y - W[1]) * uF[1] + (z - W[2]) * uF[2]); acc[iF] += f * a * e * e * (1 - w); acc[iH] += f * a * e * e * w;
    };
    // pierna: cadera → muslo → (aux de la rodilla) → pierna → pie → punta
    const Hp = J[L + 'UpLeg'], Kn = J[L + 'Leg'], An = J[L + 'Foot'], To = J[L + 'ToeBase'], uM = nor(sub(Kn, Hp)), uT = nor(sub(An, Kn)), bK = nor(add(uM, uT)), uP = nor(sub(To, An));
    const iHp = I('Hips'), iU = I(L + 'UpLeg'), iK = I('aux_rodilla_' + s), iL = I(L + 'Leg'), iFt = I(L + 'Foot'), iT = I(L + 'ToeBase');
    const pierna = (x, y, z, acc, f) => {
      const a = sstep(-.05, .09, (x - Hp[0]) * uM[0] + (y - Hp[1]) * uM[1] + (z - Hp[2]) * uM[2]); acc[iHp] += f * (1 - a); if (a <= 0) return;
      const e = sstep(-.065, .065, (x - Kn[0]) * bK[0] + (y - Kn[1]) * bK[1] + (z - Kn[2]) * bK[2]); acc[iU] += f * a * (1 - e) * (1 - e); acc[iK] += f * a * 2 * e * (1 - e);
      if (e <= 0) return; const w = sstep(-.035, .025, (x - An[0]) * uT[0] + (y - An[1]) * uT[1] + (z - An[2]) * uT[2]); acc[iL] += f * a * e * e * (1 - w); acc[iFt] += f * a * e * e * w;
    };
    const pie = (x, y, z, acc, f) => { const t = sstep(-.012, .022, (x - To[0]) * uP[0] + (y - To[1]) * uP[1] + (z - To[2]) * uP[2]); acc[iFt] += f * (1 - t); acc[iT] += f * t; };
    // dedos: mano → falange 1 → 2 → 3
    const dedo = n => { const j = [1, 2, 3].map(k => J[`${L}Hand${n}${k}`]), ii = [1, 2, 3].map(k => I(`${L}Hand${n}${k}`)), ej = [nor(sub(j[0], W)), nor(sub(j[1], j[0])), nor(sub(j[2], j[1]))], an = n === 'Thumb' ? .012 : .008;
      const e0 = n === 'Thumb' ? nor(sub(j[1], j[0])) : nor(add(ej[0], ej[1]));
      return (x, y, z, acc, f) => {
        const a = sstep(-an, an, (x - j[0][0]) * e0[0] + (y - j[0][1]) * e0[1] + (z - j[0][2]) * e0[2]); acc[iH] += f * (1 - a); if (a <= 0) return;
        const b = sstep(-.007, .007, (x - j[1][0]) * ej[1][0] + (y - j[1][1]) * ej[1][1] + (z - j[1][2]) * ej[1][2]); acc[ii[0]] += f * a * (1 - b); if (b <= 0) return;
        const c = sstep(-.006, .006, (x - j[2][0]) * ej[2][0] + (y - j[2][1]) * ej[2][1] + (z - j[2][2]) * ej[2][2]); acc[ii[1]] += f * a * b * (1 - c); acc[ii[2]] += f * a * b * c; }; };
    lados[s] = { brazo, pierna, pie, mano: rigido(L + 'Hand'), dedo: Object.fromEntries(['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].map(n => [n, dedo(n)])), muslo: rigido(L + 'UpLeg'), clav: rigido(L + 'Shoulder') };
  }
  return { tronco, cabeza, rigido, mezcla, L: lados.L, R: lados.R };
}
