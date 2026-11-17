// Las personas del público: 16 variantes (cuerpo, pelo, ropa y gesto) armadas con gente.js. Sin dependencias del navegador:
// lo usan publico.js (atlas) y tools/gente_vista.mjs (vista previa sin navegador).
import { persona, limpiar } from './gente.js';

/** [cuerpo, talla, pelo, ropa, gesto, giro de cabeza, inclinación]. Las 10 primeras están quietas; 10 y 11 aplauden; 12 a 15 festejan. */
export const VARIANTES = [
  [.55, 1, 'corto', 'remera', 'falda', .25, .05], [.3, .95, 'largo', 'buzo', 'falda', -.2, .04], [.8, 1.03, 'rapado', 'buzo', 'cruzados', .1, 0], [.4, .96, 'melena', 'remera', 'menton', -.1, .06],
  [.65, 1.02, 'entradas', 'saco', 'cruzados', -.3, .02], [.25, .93, 'cola', 'remera', 'telefono', 0, -.04], [.9, 1.04, 'corto', 'remera', 'falda', -.35, .08], [.45, .97, 'rodete', 'buzo', 'falda', .3, .03],
  [.6, 1, 'corto', 'buzo', 'menton', .15, .05], [.35, .94, 'largo', 'remera', 'cruzados', .2, 0], [.5, .99, 'melena', 'buzo', 'aplauso', 0, 0], [.7, 1.02, 'corto', 'remera', 'aplauso', -.15, -.03],
  [.55, 1, 'corto', 'remera', 'arriba', 0, -.12], [.35, .95, 'cola', 'buzo', 'arriba', .1, -.1], [.75, 1.03, 'rapado', 'remera', 'puno', -.1, -.06], [.45, .97, 'largo', 'remera', 'puno', .2, -.08],
];
export const QUIETAS = 10, APLAUDEN = [10, 11], FESTEJAN = [12, 13, 14, 15];
/** Piezas { g, parte } de la variante v, listas para dibujar. */
export function armar(v, i = 0) {
  const [cuerpo, talla, pelo, ropa, gesto, giro, inc] = v;
  const { piezas } = persona({ cuerpo, talla, pelo, ropa, gesto, det: 1, semilla: 11 + i * 7, cabezaGiro: giro, cabezaInc: inc, forma: { ancho: .96 + cuerpo * .08, mandibula: .92 + cuerpo * .14 } });
  for (const p of piezas) limpiar(p.g);
  return piezas;
}
