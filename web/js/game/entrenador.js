// El entrenador del nivel 'u' (Gameplay 2.1): el peso que el panel del llamado trae puesto. Antes el panel traía el plan
// fijo (+4 y +3 kg) y quien confirmaba siempre con Espacio no ganaba nunca con rivales normales. Ahora lee lo mismo que la
// persona ve en el panel: la chance de cada peso («X de 10», rules.js → chanceUno) y La cuenta (los kilos que hacen falta
// para el oro). La persona puede cambiarlo con ← → antes de confirmar: la decisión sigue siendo suya.
// Puro, sin DOM: lo usan main.js y tools/pesistas_test.mjs (la estrategia «panel»).
import { chanceUno, cuerpoDe, KG_MAX, RESTO, multFondo, techoMomento, intensidad } from '../sim/rules.js';
import { idiv } from '../sim/fixed.js';

/** Chance (0 a 1) de `kg` para el pesista `i` en el levantamiento `lev` (con el envión `env`), la misma del panel. */
export function chanceDe(p, i, lev, kg, env) {
  const a = p.at[i], c = cuerpoDe(a.id);
  return chanceUno(p.intensidadDe(i, lev, kg), lev, lev === 'c' ? env || c.casa : undefined, c, { garra: a.garraUno[lev] }) / 1000;
}

/**
 * Chance (0 a 1) del intento siguiente con `kg2`, si este sale válido con `kg`: con el cansancio que deja este intento (el
 * Resto que cuesta, las mismas cuentas que match.js → _aplicar, sin el envión ni los rivales) y SIN la garra: si este
 * intento la necesita, el siguiente ya no la tiene.
 */
function chanceDespues(p, i, lev, kg, kg2, env) {
  const a = p.at[i], I = p.intensidadDe(i, lev, kg), costo = RESTO.base[lev] + Math.max(0, idiv(I - 9500, 100)) * RESTO.sobre95;
  const resto = Math.max(0, a.resto - Math.max(0, idiv(costo * multFondo(a.f.attrs.fon), 1000))), c = cuerpoDe(a.id);
  const I2 = intensidad(kg2, techoMomento(p.techoDia(i, lev), resto));
  return chanceUno(I2, lev, lev === 'c' ? env || c.casa : undefined, c, { garra: false }) / 1000;
}

/**
 * Peso sugerido para el llamado en curso del pesista `i` (null: el primer intento, que abre con lo declarado).
 *   - Segundo intento: el peso más alto que sube 9 de cada 10 veces y que, si sale, deja para el tercero un kilo más que sube
 *     por lo menos 6 de 10 con el cansancio de este intento (con Compacto, que casi no tiene suerte, sin mirar eso el tercero
 *     no subía nunca). Si ninguno deja eso, el que sube 9 de 10.
 *   - Tercero: el más alto que sube 7½ de 10.
 *   - En el dos tiempos, si el oro pide más que eso: va por el oro cuando sube 5 de 10 o más (en el último intento, con
 *     2 de 10 o más: es eso o la plata).
 * Nunca baja del mínimo (la barra no baja) ni pasa de KG_MAX.
 */
export function sugerencia(p, i, lev, env) {
  const a = p.at[i], n = a[lev].length + 1; if (n === 1) return null;
  const min = p.minimo(i), C = p.cuenta(i), ch = kg => chanceDe(p, i, lev, kg, env);
  const hasta = x => { let k = min; while (k + 1 <= KG_MAX && ch(k + 1) >= x) k++; return k; };
  let seguro;
  if (n === 2) { const k9 = hasta(.9); seguro = k9; while (seguro > min && chanceDespues(p, i, lev, seguro, seguro + 1, env) < .6) seguro--; if (chanceDespues(p, i, lev, seguro, seguro + 1, env) < .6) seguro = k9; }
  else seguro = hasta(.75);
  if (lev === 'c' && C.oro !== null && C.oro > seguro && C.oro <= KG_MAX && ch(C.oro) >= (n === 3 ? .2 : .5)) return C.oro;
  return seguro;
}
