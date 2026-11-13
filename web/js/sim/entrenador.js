// El entrenador del nivel 'u' (Gameplay 2.1): el peso que se declara solo después de cada levantamiento propio (match.js) y
// que el panel del llamado trae puesto. Antes era el plan fijo (+4 y +3 kg) y quien confirmaba siempre con Espacio no ganaba
// nunca con rivales normales. Ahora lee lo mismo que la persona ve en el panel: la chance de cada peso («X de 10», rules.js →
// chanceUno) y La cuenta (los kilos que hacen falta para el oro). La persona puede cambiarlo con ← → antes de confirmar.
// Núcleo: enteros (chances en milésimas), sin DOM ni reloj; lo usan match.js, main.js y tools/pesistas_test.mjs.
import { chanceUno, chanceBarra, cuerpoDe, cuerpoBarra, KG_MAX, RESTO, multFondo, techoMomento, intensidad } from './rules.js';
import { idiv } from './fixed.js';

/** Chance (milésimas) de `kg` para el pesista `i` en el levantamiento `lev` (con el envión `env`), la misma del panel. */
export function chanceDe(p, i, lev, kg, env, o = {}) {
  const a = p.at[i], b = p.cfg.ctl === 'b', c = b ? cuerpoBarra(a.id) : cuerpoDe(a.id);
  return (b ? chanceBarra : chanceUno)(p.intensidadDe(i, lev, kg), lev, lev === 'c' ? env || c.casa : undefined, c, { garra: a.garraUno[lev], fatiga: a.fatiga ? a.fatiga[lev] : 0, dif: p.cfg.dif, perfil: o.perfil });
}

/**
 * Chance (milésimas) del intento siguiente con `kg2`, si este sale válido con `kg`: con el cansancio que deja este intento (el
 * Resto que cuesta, las mismas cuentas que match.js → _aplicar, sin el envión ni los rivales) y SIN la garra: si este
 * intento la necesita, el siguiente ya no la tiene.
 */
function chanceDespues(p, i, lev, kg, kg2, env, o = {}) {
  const a = p.at[i], I = p.intensidadDe(i, lev, kg), costo = RESTO.base[lev] + Math.max(0, idiv(I - 9500, 100)) * RESTO.sobre95;
  const b = p.cfg.ctl === 'b', resto = Math.max(0, a.resto - Math.max(0, idiv(costo * multFondo(a.f.attrs.fon), 1000))), c = b ? cuerpoBarra(a.id) : cuerpoDe(a.id);
  const I2 = intensidad(kg2, techoMomento(p.techoDia(i, lev), resto));
  // 'b': el intento siguiente arranca por lo menos con el cansancio que ya hay (el de este intento todavía no se sabe)
  return (b ? chanceBarra : chanceUno)(I2, lev, lev === 'c' ? env || c.casa : undefined, c, { garra: false, fatiga: a.fatiga ? a.fatiga[lev] : 0, dif: p.cfg.dif, perfil: o.perfil });
}

/**
 * Peso sugerido para el llamado en curso del pesista `i` (null: el primer intento, que abre con lo declarado).
 *   - Segundo intento: el peso más alto que sube 9 de cada 10 veces y que, si sale, deja para el tercero un kilo más que sube
 *     por lo menos 6 de 10 con el cansancio de este intento (con Compacto, que casi no tiene suerte, sin mirar eso el tercero
 *     no subía nunca). Si ninguno deja eso, el que sube 9 de 10.
 *   - Tercero: el más alto que sube 7½ de 10.
 *   - En el dos tiempos, si el oro pide más que eso: va por el oro cuando sube 5 de 10 o más (en el último intento, con
 *     2 de 10 o más: es eso o la plata).
 * Nunca baja del mínimo (la barra no baja) ni pasa de KG_MAX. `o.perfil` (solo pruebas): la puntería de otra persona en
 * lugar de la típica del nivel (tools/barra_bots.mjs: el que conoce su propia puntería).
 */
export function sugerencia(p, i, lev, env, o = {}) {
  const a = p.at[i], n = a[lev].length + 1; if (n === 1) return null;
  const min = p.minimo(i), C = p.cuenta(i), ch = kg => chanceDe(p, i, lev, kg, env, o);
  const hasta = x => { let k = min; while (k + 1 <= KG_MAX && ch(k + 1) >= x) k++; return k; };
  let seguro;
  // 'b' es un poco más prudente: la persona puede pegar en el amarillo y el cansancio pasa factura al intento siguiente
  const pb = p.cfg.ctl === 'b';
  if (n === 2) { const k9 = hasta(pb ? 930 : 900); seguro = k9; while (seguro > min && chanceDespues(p, i, lev, seguro, seguro + 1, env, o) < 600) seguro--; if (chanceDespues(p, i, lev, seguro, seguro + 1, env, o) < 600) seguro = k9; }
  else seguro = hasta(pb ? 800 : 750);
  if (lev === 'c' && C.oro !== null && C.oro > seguro && C.oro <= KG_MAX && ch(C.oro) >= (n === 3 ? 200 : 500)) return C.oro;
  return seguro;
}
