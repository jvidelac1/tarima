// Meta F de Gameplay 2 (docs/JUEGO.md): la chance que muestra el panel del llamado («X de 10», rules.js → chanceUno) es
// honesta. Sin navegador: intentos sueltos con el núcleo de verdad (attempt.js) y el jugador reactivo de tools/uno_bots.mjs,
// a intensidades al azar entre el 93 y el 104 %, con y sin la garra, los tres pesistas, arranque y dos tiempos con cada envión.
// Se agrupan por lo que dice el panel (0 de 10 … 10 de 10) y, en cada grupo, lo medido tiene que dar lo prometido con error
// ≤ 5 puntos (grupos de 200 intentos o más).
// Uso: node tools/chance_test.mjs [--n=30000]
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { chanceUno, cuerpoDe } from '../web/js/sim/rules.js';
import { jugarUno, ctxUno, verificar, datos, ATL, BOTS_U } from './uno_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 30000), r = new Azar(97), G = {};
/** Lo que muestra el panel: la chance redondeada a décimos. */
export const deDiez = ch => Math.round(ch / 100);
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const id = ATL[r.ent(3)], lev = r.ent(2) ? 's' : 'c', env = lev === 'c' ? ['split', 'power', 'squat'][r.ent(3)] : undefined, I = 9300 + r.ent(1101), garra = r.ent(4) !== 0;
  const f = datos.atletas[id], cuerpo = cuerpoDe(f), ch = chanceUno(I, lev, env, cuerpo, { garra });
  const ctx = ctxUno(id, lev, env, I, mezclar(k, 881), { tactil: !!r.ent(2), garraUno: garra });
  const res = verificar(ctx, jugarUno(ctx, BOTS_U.reactivo, mezclar(k, 882))).res, b = deDiez(ch), g = (G[b] ||= { n: 0, v: 0, p: 0 });
  g.n++; g.p += ch / 10; if (res.res === 'valido') g.v++;
}
const mal = [];
console.log(`Chance del panel contra el núcleo · ${N} intentos (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const b of Object.keys(G).map(Number).sort((a, b) => a - b)) {
  const g = G[b], med = g.v * 100 / g.n, prom = g.p / g.n, err = Math.abs(med - prom), cuenta = g.n >= 200;
  console.log(`   panel «${b} de 10»: ${String(g.n).padStart(5)} intentos · prometido ${prom.toFixed(1).padStart(5)} % · medido ${med.toFixed(1).padStart(5)} % · error ${err.toFixed(1)}${cuenta ? '' : ' (pocos: no cuenta)'}`);
  if (cuenta && err > 5) mal.push(`«${b} de 10»: prometido ${prom.toFixed(1)} %, medido ${med.toFixed(1)} %`);
  if (cuenta && Math.abs(med - b * 10) > 10) mal.push(`«${b} de 10» se lee como ${b * 10} % y da ${med.toFixed(1)} %`);
}
console.log(mal.length ? `\nFALLÓ (meta F):\n  ${mal.join('\n  ')}` : '\nOK: meta F, la chance del panel es la que da el núcleo');
process.exit(mal.length ? 1 : 0);
