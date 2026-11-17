// Malla y medidas del pesista actual (GLB de Blender), con la misma vara que el cuerpo por código.
import { esqueletoDe, mallaDe, RAIZ } from './glb.mjs';
import { medir } from '../../web/js/game/cuerpo/medidas.js';
import path from 'node:path';
export async function actual(nombre = 'kordan') {
  const f = path.join(RAIZ, 'web/models', nombre + '.glb'), e = await esqueletoDe(f), partes = await mallaDe(f);
  const J = Object.fromEntries(e.nombres.map((n, i) => [n, e.reposo[i].slice(12, 15)]));
  const b = partes.find(p => p.material === 'Body'), n = b.pos.length / 3, dom = new Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = 1; k < 4; k++) if (b.jw[i * 4 + k] > b.jw[i * 4 + m]) m = k; dom[i] = e.nombres[b.ji[i * 4 + m]]; }
  return { e, partes, J, cuerpo: { pos: b.pos, dom } };
}
if (process.argv[1].endsWith('actual.mjs')) {
  const A = await actual(process.argv[2] || 'kordan'), r = medir(A.cuerpo, A.J, 1.71); console.log(r);
  // cortes del tronco y de los miembros: para calibrar dónde está la superficie respecto del esqueleto
  const P = A.cuerpo.pos, n = P.length / 3;
  for (const y of [.05, .2, .3, .4, .487, .6, .7, .8, .874, .92, .96, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.43, 1.46, 1.5, 1.55, 1.6, 1.65, 1.7]) {
    let x0 = 9, x1 = -9, z0 = 9, z1 = -9, zc0 = 9, zc1 = -9, xi = 9; for (let i = 0; i < n; i++) { if (Math.abs(P[i * 3 + 1] - y) > .006 || P[i * 3] < 0) continue; const x = P[i * 3], z = P[i * 3 + 2]; if (x > (y > 1.0 ? .26 : 9)) continue; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); if (x < .02) { zc0 = Math.min(zc0, z); zc1 = Math.max(zc1, z); } }
    console.log('y', y.toFixed(3), 'x', x0.toFixed(3), x1.toFixed(3), 'z', z0.toFixed(3), z1.toFixed(3), 'linea media z', zc0.toFixed(3), zc1.toFixed(3));
  }
}
