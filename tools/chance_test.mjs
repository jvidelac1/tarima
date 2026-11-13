// Meta F de Gameplay 2 (docs/JUEGO.md): la chance que muestra el panel del llamado («X de 10», rules.js → chanceUno) es
// honesta. Sin navegador: intentos sueltos con el núcleo de verdad (attempt.js) y el jugador reactivo de tools/uno_bots.mjs,
// a intensidades al azar entre el 93 y el 104 %, con y sin la garra, los tres pesistas, arranque y dos tiempos con cada envión.
// Se agrupan por lo que dice el panel (0 de 10 … 10 de 10) y, en cada grupo, lo medido tiene que dar lo prometido con error
// ≤ 5 puntos (grupos de 200 intentos o más).
// Nivel 'b' (la barrita, Gameplay 3): lo mismo con chanceBarra (rules.js), que integra dónde suele pegar una persona típica
// (BARRA.tipico), contra el bot típico de tools/barra_bots.mjs: error ≤ 5 puntos por grupo. Informativo: cuánto se aparta la
// chance para el novato (le promete de más) y para el bueno (de menos). Cada nivel de dificultad (Fácil, Medio, Difícil:
// rules.js → NIVELES_B) con su propia persona típica y sus barritas: error ≤ 5 puntos por grupo en los tres.
// Uso: node tools/chance_test.mjs [--n=30000]
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { chanceUno, cuerpoDe, chanceBarra, cuerpoBarra, reglasB, DIFICULTADES } from '../web/js/sim/rules.js';
import { deDiez } from '../web/js/game/ui/mensajes.js';
import { jugarUno, ctxUno, verificar, datos, ATL, BOTS_U } from './uno_bots.mjs';
import { jugarBarra, ctxBarra, verificar as verificarB, PERFILES } from './barra_bots.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 30000), r = new Azar(97), G = {};
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const id = ATL[r.ent(3)], lev = r.ent(2) ? 's' : 'c', env = lev === 'c' ? ['split', 'power', 'squat'][r.ent(3)] : undefined, I = 9300 + r.ent(1101), garra = r.ent(4) !== 0;
  const f = datos.atletas[id], cuerpo = cuerpoDe(id), ch = chanceUno(I, lev, env, cuerpo, { garra });
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
  if (cuenta && Math.abs(med - b * 10) > 7) mal.push(`«${b} de 10» se lee como ${b * 10} % y da ${med.toFixed(1)} %`);
}
// ---------- 'b' ----------
for (const dif of DIFICULTADES) for (const pf of ['tipico', 'novato', 'bueno']) {
  const RB = reglasB(dif), perfil = pf === 'tipico' ? { ...PERFILES.tipico, ...RB.tipico, noEsfuerzo: 1000 - RB.tipico.esfuerzo } : PERFILES[pf], D = dif === 'facil' ? {} : { dif };
  const rb = new Azar(98), GB = {}, nB = pf === 'tipico' ? N : Math.round(N / 3);
  for (let k = 0; k < nB; k++) {
    const id = ATL[rb.ent(3)], lev = rb.ent(2) ? 's' : 'c', env = lev === 'c' ? ['split', 'power', 'squat'][rb.ent(3)] : undefined, I = 9300 + rb.ent(1101), garra = rb.ent(4) !== 0;
    // con cansancio de los intentos anteriores (0 a ¾) y, en los exigentes, el esfuerzo de pararse
    const fatiga = rb.ent(4) * 250, cuerpo = cuerpoBarra(id), ch = chanceBarra(I, lev, env, cuerpo, { garra, fatiga, ...D });
    const ctx = ctxBarra(id, lev, env, I, mezclar(k, 991), { tactil: !!rb.ent(2), garraUno: garra, fatiga, ...D });
    const res = verificarB(ctx, jugarBarra(ctx, perfil, mezclar(k, 992))).res, b = deDiez(ch), g = (GB[b] ||= { n: 0, v: 0, p: 0 });
    g.n++; g.p += ch / 10; if (res.res === 'valido') g.v++;
  }
  console.log(`\nBarrita ('b', ${dif}) · chance del panel (persona típica) contra el bot ${pf} · ${nB} intentos${pf === 'tipico' ? '' : ' (informativo)'}`);
  for (const b of Object.keys(GB).map(Number).sort((a, b) => a - b)) {
    const g = GB[b], med = g.v * 100 / g.n, prom = g.p / g.n, err = med - prom, cuenta = g.n >= 200;
    console.log(`   panel «${b} de 10»: ${String(g.n).padStart(5)} intentos · prometido ${prom.toFixed(1).padStart(5)} % · medido ${med.toFixed(1).padStart(5)} % · ${pf === 'tipico' ? 'error' : 'diferencia'} ${err >= 0 ? '+' : ''}${err.toFixed(1)}${cuenta ? '' : ' (pocos: no cuenta)'}`);
    if (pf === 'tipico' && cuenta && Math.abs(err) > 5) mal.push(`'b' ${dif} «${b} de 10»: prometido ${prom.toFixed(1)} %, medido ${med.toFixed(1)} %`);
    if (pf === 'tipico' && cuenta && Math.abs(med - b * 10) > 7) mal.push(`'b' ${dif} «${b} de 10» se lee como ${b * 10} % y da ${med.toFixed(1)} %`);
  }
}
console.log(mal.length ? `\nFALLÓ (meta F):\n  ${mal.join('\n  ')}` : '\nOK: meta F, la chance del panel es la que da el núcleo');
process.exit(mal.length ? 1 : 0);
