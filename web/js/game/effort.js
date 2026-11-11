// Capas de esfuerzo por código (docs/JUEGO.md, sección 9.4): temblor de cadera de hasta 4 mm. Se mueve la raíz del personaje
// antes de posar, así la barra (hueso Bar) recibe el mismo desplazamiento que las manos. No rota columna, hombros ni brazos.
const SUELA = .016;
/** @param {object} atleta  @param {number} temblor 0..1  @param {number} t segundos */
export function aplicarEsfuerzo(atleta, temblor, t, quieto = false) {
  const k = quieto ? 0 : Math.min(1, Math.max(0, temblor)) * .004, p = atleta.root.position;
  p.x = k * (Math.sin(t * 61) * .6 + Math.sin(t * 97 + 1.3) * .4); p.z = k * (Math.sin(t * 53 + .7) * .6 + Math.sin(t * 113) * .4); p.y = SUELA;
  if (atleta.skin?.uSweat) atleta.skin.uSweat.value = .55 + .35 * Math.min(1, temblor * 1.5);
}
