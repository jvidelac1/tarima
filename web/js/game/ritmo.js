// Ritmo de la final (docs/JUEGO.md G2.7): cuánto dura cada pantalla pasiva entre un levantamiento propio y el siguiente.
// Puro, sin DOM ni reloj: lo usan main.js (para mostrar) y tools/ritmo_test.mjs (para medir el presupuesto sin navegador).
//   rivalAntes, rivalDespues  el resumen de un rival no decisivo: desde `rivalAntes` ms antes de su última explosión
//                             hasta `rivalDespues` ms después de la recepción; después, corte al final
//   resumen                   su veredicto: luces de golpe en `luz` s, la línea en `ver` s y fin en `total` s
//   filaDesde, fila           del tercer turno seguido de rivales en adelante, ni eso: una fila en el marcador de `fila` ms
//   propioOk, propioFallo     el veredicto propio en 'u': `tVer` + esto (s); el válido no llega a 3 s
//   antes, rapido             la vista entera (decisivo o ritmo «Completa»): desde `antes` ms antes de agarrar la barra, y
//                             `rapido` veces más rápido en las fases lentas
export const RITMO = {
  rivalAntes: 1000, rivalDespues: 250, resumen: { luz: .1, ver: .2, total: 1.1 }, filaDesde: 3, fila: 1200,
  propioOk: 1.9, propioFallo: 2.4, antes: 1200, rapido: 2.5,
};
/** Fases de un rival que se muestran RITMO.rapido veces más rápido. */
export const FASES_RAPIDAS = new Set(['pelea', 'traba', 'post', 'hombros', 'fijacion', 'freno']);
/** Un turno de rival que se ve entero: pasa adelante, o va por el oro, una medalla o un récord. */
export const esDecisivo = (et, pasa) => !!pasa || (et || []).some(e => e === 'oro' || e === 'medalla' || e === 'record');
/**
 * Tramo del resumen de un rival, en ms de su intento: de 1 s antes de la última explosión a poco después de la recepción.
 * `m` es su máquina ya terminada (simular). Si no llegó a explotar, desde 1 s antes de donde se cortó.
 */
export function tramoResumen(m) {
  const res = m.res, M = [...m.movs].reverse().find(x => x.tr) || m.movs[m.movs.length - 1];
  if (!M) return { de: Math.max(0, res.t - RITMO.rivalAntes), a: res.t };
  const x = M.tr || M.tx || M.tp || res.t, de = Math.max(0, x - RITMO.rivalAntes), a = Math.min(res.t, (M.tc || x) + RITMO.rivalDespues);
  return { de, a: Math.max(a, de) };
}
/** Duración del veredicto propio en 'u' (s), con los mismos momentos que decision() en main.js. */
export function veredictoPropio(ok, conFinal = true) {
  const paso = .3, tLuz = conFinal && !ok ? .45 : conFinal ? .2 : .25, tVer = tLuz + 2 * paso + .25;
  return { tVer, total: tVer + (ok ? RITMO.propioOk : RITMO.propioFallo) };
}
