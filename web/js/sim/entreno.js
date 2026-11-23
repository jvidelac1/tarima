// Entrenamiento (LIF-62): una sesión es un ejercicio y 3 pasadas de la barrita. Puro: la sesión se recalcula desde los toques
// (ms desde que arrancó cada pasada), igual en el juego y en el servidor.
import { ENTRENO, posBarra, reglasB } from './rules.js';

export const EJERCICIOS = ['tiron', 'sentadilla', 'tecnica'];

/** Zona de un toque `ms` después de que arrancó la pasada: 'verde', 'amarillo' o 'rojo' (null: no tocó). */
export function zonaEntreno(ms) {
  if (!Number.isInteger(ms) || ms < 0) return null;
  const x = posBarra(ms, { ...reglasB('facil'), pasada: ENTRENO.pasada }), [v0, v1] = ENTRENO.verde, [a0, a1] = ENTRENO.amarillo;
  return x >= v0 && x <= v1 ? 'verde' : x >= a0 && x <= a1 ? 'amarillo' : 'rojo';
}

/**
 * Resultado de una sesión. `toques`: un ms por pasada (ENTRENO.pasadas). `antes`: lo entrenado hasta ahora con ese pesista
 * ({kg_s, kg_c, tecnica}). Devuelve {ok, zonas, verdes, suma: {kg_s, kg_c, tecnica}} (lo que suma esta sesión, con los topes).
 */
export function sesionEntreno(ejercicio, toques, antes = {}) {
  if (!EJERCICIOS.includes(ejercicio)) return { ok: false, error: 'ejercicio desconocido' };
  if (!Array.isArray(toques) || toques.length !== ENTRENO.pasadas || !toques.every(x => Number.isInteger(x) && x >= 0 && x <= 60000)) return { ok: false, error: 'toques mal formados' };
  const zonas = toques.map(zonaEntreno), verdes = zonas.filter(z => z === 'verde').length, sirve = verdes >= ENTRENO.verdesParaSumar;
  const suma = { kg_s: 0, kg_c: 0, tecnica: 0 };
  if (sirve && ejercicio === 'tiron') suma.kg_s = Math.min(ENTRENO.kg, Math.max(0, ENTRENO.topeKg - (antes.kg_s | 0)));
  if (sirve && ejercicio === 'sentadilla') suma.kg_c = Math.min(ENTRENO.kg, Math.max(0, ENTRENO.topeKg - (antes.kg_c | 0)));
  if (sirve && ejercicio === 'tecnica') suma.tecnica = Math.min(ENTRENO.tecnica, Math.max(0, ENTRENO.topeTecnica - (antes.tecnica | 0)));
  return { ok: true, zonas, verdes, suma };
}
