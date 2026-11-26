// Anatomía por cuadro del pesista nuevo (web/js/character.js) dentro del juego: las formas del hombro, la axila y el codo
// siguen la pose, el pecho respira, el cuerpo se hincha con el esfuerzo y la malla y el cinturón copian todo eso para no
// separarse de la piel. Es la parte de web/js/performance.js del visor (syncAnatomy y las formas de `perform`) que le sirve al
// juego: acá las poses, las caídas y los gestos los pone el juego (stage.js, caida.js), no el visor.
// Un pesista de los de siempre (sin `suit`) no pasa por acá.
import * as T from 'three';

const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3(), _e = new T.Vector3();
const suave = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const pone = (mesh, k, v) => { const i = mesh.morphTargetDictionary?.[k]; if (i !== undefined) mesh.morphTargetInfluences[i] = v; };
const lee = (mesh, k) => { const i = mesh.morphTargetDictionary?.[k]; return i === undefined ? 0 : mesh.morphTargetInfluences[i]; };

/**
 * @param a        el pesista (Athlete con `body`, `suit`, `sleeves`, `belt`: lo arma createDigitalHuman)
 * @param o.t        reloj en s (respiración)
 * @param o.esfuerzo 0..1: cuánto aprieta (hincha, traba el tronco, suda, enrojece)
 * @param o.agitado  0..1: recuperación después del intento (respira hondo y rápido, boca entreabierta)
 * @param o.alivio   0..1: cara de alivio (el festejo del válido)   @param o.bronca 0..1: cara de decepción (la barra se cayó)
 * @param o.altura   estatura del pesista en m (para saber cuánto flexiona la cadera: la tela se comprime)
 */
export function actuar(a, { t = 0, esfuerzo = 0, agitado = 0, alivio = 0, bronca = 0, altura = 1.7 } = {}) {
  const cuerpo = a.body; if (!cuerpo || !a.suit) return;
  const b = a._byName; a.root.updateMatrixWorld(true);
  const columna = b.get('Neck').getWorldPosition(_a).sub(b.get('Hips').getWorldPosition(_b)).normalize();
  for (const [lado, s] of [['Left', 'L'], ['Right', 'R']]) {
    const hombro = b.get(lado + 'Arm').getWorldPosition(_c), codo = b.get(lado + 'ForeArm').getWorldPosition(_d), mano = b.get(lado + 'Hand').getWorldPosition(_e);
    const brazo = _b.copy(codo).sub(hombro).normalize(), ante = mano.sub(codo).normalize();
    const elev = 180 - T.MathUtils.radToDeg(brazo.angleTo(columna)), flex = T.MathUtils.radToDeg(brazo.angleTo(ante));
    pone(cuerpo, 'scapula' + s, suave(22, 151, elev));
    pone(cuerpo, 'armLevel' + s, suave(36, 86, elev) * (1 - suave(98, 137, elev)));      // el pliegue de la axila, a la altura del hombro
    pone(cuerpo, 'elbow' + s, suave(7, 116, flex));
    pone(cuerpo, 'bladeSlide' + s, 0); pone(cuerpo, 'bladeTurn' + s, 0);
  }
  const onda = Math.sin(t * (agitado > 0 ? 4 : 2.25) - .7), recupera = .5 - .5 * Math.cos(t * 3.85);
  let aire = .35 + .27 * onda * (1 - esfuerzo) + .33 * esfuerzo; aire += (.18 + .72 * recupera - aire) * agitado;
  pone(cuerpo, 'breath', aire); pone(cuerpo, 'pump', Math.min(1, .76 * esfuerzo + .2)); pone(cuerpo, 'brace', esfuerzo);
  pone(cuerpo, 'openJaw', .19 * esfuerzo + agitado * (.27 + .42 * recupera)); pone(cuerpo, 'relief', alivio); pone(cuerpo, 'disappointment', bronca);
  // la tela: cae suelta en reposo, se pega con el esfuerzo y se comprime con la cadera flexionada; el resto lo copia del cuerpo
  const cadera = b.get('Hips').getWorldPosition(_a).y, dobla = 1 - Math.min(1, Math.max(0, (cadera / altura - .15) / .39));
  const tela = { drape: .22 + .52 * (1 - esfuerzo) + .17 * dobla, compression: dobla, settle: 0 };
  for (const prenda of [a.suit, a.sleeves]) { if (!prenda?.morphTargetDictionary) continue; for (const [k, i] of Object.entries(prenda.morphTargetDictionary)) prenda.morphTargetInfluences[i] = tela[k] ?? lee(cuerpo, k); }
  for (const pieza of a.belt || []) { if (!pieza.morphTargetDictionary) continue; for (const [k, i] of Object.entries(pieza.morphTargetDictionary)) pieza.morphTargetInfluences[i] = lee(a.suit, k); }
  const cara = cuerpo.material.userData.portraitEffort; if (cara) cara.value = esfuerzo;
  if (a.skin?.uSweat) a.skin.uSweat.value = .12 + .31 * esfuerzo + .1 * agitado;
}

const _q = new T.Quaternion(), _q2 = new T.Quaternion(), _eje = new T.Vector3(), _ad = new T.Vector3(), _cruz = new T.Vector3();
/** Gira un hueso `ang` rad alrededor de un eje del mundo y deja al día sus hijos. */
function girarMundo(hueso, ang, eje) {
  _q.setFromAxisAngle(eje, ang).multiply(hueso.getWorldQuaternion(_q2));
  hueso.quaternion.copy(hueso.parent.getWorldQuaternion(_q2).invert().multiply(_q)); hueso.updateWorldMatrix(false, true);
}
/** Cuánto se cierra cada dedo de una mano que cuelga (rad en la primera falange; la tercera, un poco menos). */
const CIERRE = { Index: .17, Middle: .23, Ring: .29, Pinky: .33 };
/**
 * Manos sueltas del pesista nuevo cuando no agarra nada (de pie antes de ir a la barra, o después de soltarla): los dedos
 * vuelven a su pose de descanso del esqueleto y se cierran un poco, más el meñique que el índice, como cuelga una mano
 * de verdad. `w` 0..1: cuánto (0 no toca nada). Viene del visor (performance.js, la parte de la mano en reposo).
 * Hay que llamarla después de posar, con las matrices del mundo al día.
 */
export function relajarManos(a, w) {
  if (!a.restHand || !(w > .001)) return;
  const b = a._byName;
  for (const [lado, k] of [['Left', 1], ['Right', -1]]) {
    const mano = b.get(lado + 'Hand'), ante = b.get(lado + 'ForeArm'); if (!mano || !ante) continue;
    // eje de la mano (del codo a la muñeca) y «adelante» perpendicular a él: alrededor de ese se cierran los dedos
    _eje.copy(mano.getWorldPosition(_a)).sub(ante.getWorldPosition(_b)).normalize();
    _ad.set(0, 0, 1).addScaledVector(_eje, -_eje.z); if (_ad.lengthSq() < 1e-6) continue; _ad.normalize();
    for (const [dedo, reposo] of a.restHand) {
      if (!dedo.name.includes(lado + 'Hand')) continue;
      dedo.quaternion.slerp(reposo, w * .86); dedo.updateWorldMatrix(true, false);
      const m = dedo.name.match(/(Index|Middle|Ring|Pinky)([123])$/);
      if (m) girarMundo(dedo, -k * w * CIERRE[m[1]] * (m[2] === '3' ? .58 : 1), _cruz.copy(_ad));
    }
  }
}
