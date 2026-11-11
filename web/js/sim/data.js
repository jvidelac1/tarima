// Lectura de sim.json: verifica versión y huella antes de que el núcleo lo use.
import { huella, canonico } from './fixed.js';
import { VERSION } from './rules.js';

/** Devuelve los datos listos para el núcleo, o lanza si no son los que este núcleo sabe leer. */
export function leerDatos(sim) {
  if (!sim || sim.v !== 1 || sim.sim !== VERSION) throw new Error('sim.json: versión desconocida');
  const { huella: h, ...resto } = sim;
  if (huella(canonico(resto)) !== h) throw new Error('sim.json: la huella no coincide');
  for (const a of Object.values(sim.atletas)) if (!sim.modelos[a.modelo]) throw new Error('sim.json: falta el modelo ' + a.modelo);
  return sim;
}
