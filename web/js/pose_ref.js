// Poses de referencia del pesista: T (brazos horizontales) y A (brazos a 45° hacia abajo), calculadas sobre el esqueleto
// (docs/GRAFICOS_PLAN.md, historia G1). No dependen de cómo vino armado el modelo ni de ninguna animación: parten del
// reposo del GLB y apuntan cada hueso por regla, así valen para cualquier biotipo. Sirven para revisar proporciones,
// pesos de piel y skins siempre desde la misma pose, y son el punto de partida de un rig o de una captura de movimiento.
// Sin DOM: `T3` es el módulo de three (el visor pasa el suyo; tools/pose_ref_test.mjs, el vendorizado).
// Ejes del personaje: +x su izquierda, +y arriba, +z su frente.

/** Ángulo del brazo bajo la horizontal (grados) en cada pose. */
export const REF = { T: { brazo: 0 }, A: { brazo: 45 } };
const LADOS = [['Left', 1], ['Right', -1]];

/**
 * Lleva los huesos a la pose de referencia `tipo` ('T' o 'A').
 * @param {object} T3        módulo three
 * @param {Map<string, object>} H  huesos por nombre sin prefijo ('Hips', 'LeftArm'…)
 * @param {Array<[object, object, object]>} reposo  [hueso, cuaternión, posición] del reposo del GLB (todos los huesos)
 * @param {object} raiz      nodo raíz del personaje (su giro define los ejes del personaje)
 * @returns {{tipo:string, brazo:number}} lo que quedó aplicado
 */
export function poseReferencia(T3, H, reposo, raiz, tipo = 'T') {
  const R = REF[tipo]; if (!R) throw new Error('pose de referencia desconocida: ' + tipo);
  const V = () => new T3.Vector3(), Q = () => new T3.Quaternion();
  for (const [b, q, p] of reposo) { b.quaternion.copy(q); b.position.copy(p); }
  raiz.updateMatrixWorld(true);
  const marco = raiz.getWorldQuaternion(Q()), dir = (x, y, z) => V().set(x, y, z).normalize().applyQuaternion(marco);
  const pos = n => H.get(n).getWorldPosition(V());
  /** Gira `h` (en el mundo) para que la línea de `h` a `hijo` quede en la dirección `d`. */
  const apuntar = (h, hijo, d) => {
    const b = H.get(h), c = H.get(hijo); if (!b || !c) return;
    b.updateWorldMatrix(true, true);
    const d0 = c.getWorldPosition(V()).sub(b.getWorldPosition(V())).normalize(), giro = Q().setFromUnitVectors(d0, d), qp = b.parent.getWorldQuaternion(Q());
    b.quaternion.premultiply(qp.clone().invert().multiply(giro).multiply(qp)); b.updateWorldMatrix(false, true);
  };
  /** Gira `h` (en el mundo) `ang` rad alrededor de `eje`. */
  const girar = (h, eje, ang) => {
    const b = H.get(h), qp = b.parent.getWorldQuaternion(Q());
    b.quaternion.premultiply(qp.clone().invert().multiply(Q().setFromAxisAngle(eje, ang)).multiply(qp)); b.updateWorldMatrix(false, true);
  };
  const pie0 = {}, qPie0 = {};
  for (const [L] of LADOS) { const f = H.get(L + 'Foot'); if (f) { pie0[L] = f.getWorldPosition(V()); qPie0[L] = f.getWorldQuaternion(Q()); } }
  const abajo = dir(0, -1, 0), ang = R.brazo * Math.PI / 180;
  for (const [L, sx] of LADOS) {
    // piernas rectas hacia abajo y el pie como en el reposo (apoyado)
    apuntar(L + 'UpLeg', L + 'Leg', abajo); apuntar(L + 'Leg', L + 'Foot', abajo);
    const f = H.get(L + 'Foot'); if (f && qPie0[L]) { f.quaternion.copy(f.parent.getWorldQuaternion(Q()).invert().multiply(qPie0[L])); f.updateWorldMatrix(false, true); }
    // brazo, antebrazo y mano en una sola línea
    const d = dir(sx * Math.cos(ang), -Math.sin(ang), 0);
    apuntar(L + 'Arm', L + 'ForeArm', d); apuntar(L + 'ForeArm', L + 'Hand', d);
    if (H.get(L + 'HandMiddle1')) apuntar(L + 'Hand', L + 'HandMiddle1', d);
    // palmas hacia abajo: índice × meñique (por el lado) es el DORSO de la mano; la palma es la contraria y se lleva lo más abajo que deja el eje del brazo
    const i1 = H.get(L + 'HandIndex1'), p1 = H.get(L + 'HandPinky1');
    if (i1 && p1) {
      const m = pos(L + 'Hand'), n = i1.getWorldPosition(V()).sub(m).cross(p1.getWorldPosition(V()).sub(m)).multiplyScalar(-sx).normalize();
      const pl = v => v.clone().addScaledVector(d, -v.dot(d)), a = pl(n), b = pl(abajo);
      if (a.lengthSq() > 1e-8 && b.lengthSq() > 1e-8) { a.normalize(); b.normalize(); girar(L + 'Arm', d, Math.atan2(V().crossVectors(a, b).dot(d), a.dot(b))); }
    }
  }
  // la raíz de la cadera sube o baja lo que haga falta para que los pies queden a la altura del reposo (el piso)
  const cad = H.get('Hips');
  if (cad && pie0.Left && pie0.Right) {
    raiz.updateMatrixWorld(true);
    const dy = (pie0.Left.y + pie0.Right.y) / 2 - (pos('LeftFoot').y + pos('RightFoot').y) / 2;
    const p = cad.getWorldPosition(V()); p.y += dy; cad.parent.worldToLocal(p); cad.position.copy(p);
  }
  raiz.updateMatrixWorld(true);
  return { tipo, brazo: R.brazo };
}

/**
 * Medidas de la pose aplicada, para la prueba y para la lámina: ángulo de cada brazo bajo la horizontal (grados), desvío
 * de cada pierna respecto de la vertical, asimetría entre lados (m), envergadura, estatura de huesos y altura de los pies.
 */
export function medirReferencia(T3, H, raiz) {
  const V = () => new T3.Vector3(), inv = raiz.getWorldQuaternion(new T3.Quaternion()).invert(), o = raiz.getWorldPosition(V());
  const P = n => H.get(n).getWorldPosition(V()).sub(o).applyQuaternion(inv), g = r => r * 180 / Math.PI, s = {};
  for (const [L, sx] of LADOS) {
    const a = P(L + 'Arm'), m = P(L + 'Hand'), c = P(L + 'ForeArm'), d = m.clone().sub(a).normalize();
    const u = P(L + 'UpLeg'), f = P(L + 'Foot'), pd = f.clone().sub(u).normalize();
    s[L] = { brazo: g(Math.asin(-d.y)), adelante: g(Math.asin(d.z)), codo: g(c.clone().sub(a).normalize().angleTo(m.clone().sub(c).normalize())), pierna: g(Math.acos(Math.min(1, -pd.y))), mano: m, pie: f, lado: sx };
  }
  const mi = s.Left.mano, md = s.Right.mano, pi = s.Left.pie, pd = s.Right.pie, cx = 2 * P('Hips').x;      // el eje de simetría pasa por la cadera
  return { izq: s.Left, der: s.Right, asimetria: Math.max(Math.abs(mi.x + md.x - cx), Math.abs(mi.y - md.y), Math.abs(mi.z - md.z), Math.abs(pi.x + pd.x - cx), Math.abs(pi.y - pd.y)),
    envergadura: mi.x - md.x, cabeza: P('Head').y, pies: (pi.y + pd.y) / 2 };
}
