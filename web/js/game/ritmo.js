// Ritmo de la final (docs/JUEGO.md G2.7): cuánto dura cada pantalla pasiva entre un levantamiento propio y el siguiente.
// Puro, sin DOM ni reloj: lo usan main.js (para mostrar) y tools/ritmo_test.mjs (para medir el presupuesto sin navegador).
//   rivalAntes, rivalDespues  el resumen de un rival no decisivo: desde `rivalAntes` ms antes de su última explosión
//                             hasta `rivalDespues` ms después de la recepción; después, corte al final
//   resumen                   su veredicto: luces de golpe en `luz` s, la línea en `ver` s y fin en `total` s
//   filaDesde, fila           del tercer turno seguido de rivales en adelante, ni eso: una fila en el marcador de `fila` ms
//   propioOk, propioFallo     el veredicto propio en 'u': `tVer` + esto (s); el válido no llega a 3 s
//   antes, rapido             la vista entera (decisivo o ritmo «Completa»): desde `antes` ms antes de agarrar la barra, y
//                             `rapido` veces más rápido en las fases lentas
//   rival                     desde el 13-nov (pedido del dueño: «quiero ver el levantamiento completo de mi rival, aunque lo
//                             pueda saltar con un botón»): todo turno de rival se ve ENTERO, desde `antes` ms antes de que
//                             agarre la barra, las fases de espera (pelea, de pie, barra en los hombros) `rapido` veces más
//                             rápido, el veredicto en `veredicto` s como mucho y la repetición (`rep` s) solo si cae un decisivo.
//                             Saltado (botón «Saltar» o la tecla S): luces de golpe y la línea en `saltado` s.
//   fundido                   el paso de un pesista al otro: fundido a negro de `fundido.fuera` ms y vuelta en `fundido.dentro` ms
export const RITMO = {
  rivalAntes: 1000, rivalDespues: 150, resumen: { luz: .1, ver: .2, total: 1 }, filaDesde: 3, fila: 1200,
  propioOk: 1.9, propioFallo: 2.4, antes: 1200, rapido: 2.5,
  // el decisivo (G2.7: «entero, en 9 s o menos»): desde 1 s antes de su primera explosión, las fases lentas a `rapido`, su
  // veredicto en `veredicto` s como mucho (la barra que rebota se corta) y repetición de `rep` ms solo si cae. Como mucho
  // `porHueco` turnos enteros entre dos levantamientos propios: el siguiente decisivo va resumido (la espera no pasa de 20 s)
  decisivo: { antes: 1000, rapido: 5, rep: 2.3, veredicto: 2.6, porHueco: 1 },
  rival: { antes: 1200, rapido: 4, veredicto: 2.2, rep: 1.8, saltado: .8 },
  fundido: { fuera: 120, dentro: 200 },
};
/** Tecla del botón «Saltar» del turno de un rival (Espacio y los toques en la escena ya no saltean nada de los rivales). */
export const TECLA_SALTAR = 's';
/** Fases de un rival que se muestran RITMO.rapido veces más rápido. */
export const FASES_RAPIDAS = new Set(['pelea', 'traba', 'post', 'hombros', 'fijacion', 'freno']);
/** Un turno de rival que se ve entero (G2.7): el que se juega el oro o una medalla en su último dos tiempos. */
export const esDecisivo = et => (et || []).some(e => e === 'oro' || e === 'medalla');
/**
 * Cómo se muestra un turno de rival: 'entero', 'resumen' o 'fila'. `seguidos`: turnos de rival desde el último propio
 * (contando este); `enteros`: cuántos se vieron enteros en ese tramo; `rapida`: ritmo «Rápida».
 */
export function modoRival({ et, seguidos, enteros, rapida = true, siempre = true }) {
  if (!rapida || siempre) return 'entero';      // desde el 13-nov, siempre entero (RITMO.rival); el resumen y la fila quedan para comparar

  if (esDecisivo(et) && enteros < RITMO.decisivo.porHueco) return 'entero';
  return seguidos >= RITMO.filaDesde ? 'fila' : 'resumen';
}
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
/** Desde dónde se muestra el turno de un rival (ms de su intento): `RITMO.rival.antes` antes de que agarre la barra. */
export function desdeRival(m, conf) { const M = m.movs[0]; return Math.max(0, conf - 500, (M && M.tp || 0) - RITMO.rival.antes); }
/** Desde dónde se muestra entero el turno decisivo de un rival (ms de su intento): 1 s antes de su primera explosión. */
export function desdeDecisivo(m, conf) { const M = m.movs[0]; return Math.max(0, conf, (M && (M.tr || M.tx || M.tp) || 0) - RITMO.decisivo.antes); }
/**
 * Duración del veredicto propio en 'u' (s), con los mismos momentos que decision() en main.js. `limite`: válido al límite,
 * las luces se prenden con suspenso (`paso` más largo) y el veredicto sigue sin pasar de 3 s en total.
 */
export function veredictoPropio(ok, conFinal = true, limite = false) {
  const paso = ok && limite ? .45 : .3, tLuz = conFinal && !ok ? .45 : conFinal ? .2 : .25, tVer = tLuz + 2 * paso + .25;
  const tot = tVer + (ok ? RITMO.propioOk : RITMO.propioFallo);
  return { tVer, paso, total: ok && limite ? Math.min(tot, veredictoPropio(true, conFinal).total) : tot };
}
