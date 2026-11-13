// El Espacio en la computadora, sin navegador (docs/JUEGO.md G2.2 y meta H de G2.9). 10 000 secuencias al azar de teclas
// sobre intentos enteros de 'u', por la clase Boton de verdad (web/js/game/input.js) dentro de un DOM de mentira
// (tools/entrada_sim.mjs), conectada al núcleo como en main.js. Casos: repetición del teclado, keyup perdido, primer evento
// que ya es repetición (el foco llegó con la tecla apretada), foco en un botón, blur de la ventana, Enter, doble toque a
// 100 ms, mantener 10 s y la ráfaga de la confirmación.
// Criterio: 0 pulsaciones sin resolver, 0 contadas dos veces (una pulsación, un registro y a lo sumo un contacto para el
// núcleo), el 100 % con acción o palabra, la ráfaga de la confirmación nunca arranca el tirón, y todos los intentos terminan
// con un registro bien formado.
// Uso: node tools/teclado_test.mjs [--n=10000]
import { probarEntrada } from './entrada_sim.mjs';
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
// Desde Gameplay 3 corre la barrita ('b', por defecto) y 'u': en 'b', además, cada barrita la dispara un solo contacto.
const t0 = Date.now(); let mal = 0; const ejemplos = [];
// y en 'b', los tres niveles de dificultad (Medio y Difícil tienen barritas de más: atrapar y pararse)
for (const [ctl, dif] of [['b', 'facil'], ['b', 'medio'], ['b', 'dificil'], ['u', 'facil']]) {
  const R = await probarEntrada({ via: 'teclado', n: +(arg('n') || 10000), ctl, dif });
  console.log(`teclado '${ctl}'${ctl === 'b' ? ` ${dif}` : ''}: ${R.secuencias} secuencias, ${R.pulsaciones} pulsaciones · casos: ${JSON.stringify(R.casos)}`);
  console.log(`sin resolver ${R.sinResolver} · contadas dos veces ${R.dobles} · sin acción ni palabra ${R.sinPalabra} · ráfaga de la confirmación que arrancó el tirón ${R.rafagaTira} · registros mal formados ${R.malFormadas} · intentos sin terminar ${R.sinTerminar}${ctl === 'b' ? ` · barritas disparadas ${R.barritas}, con más de un contacto ${R.barritaDoble}` : ''}`);
  mal += R.sinResolver + R.dobles + R.sinPalabra + R.rafagaTira + R.malFormadas + R.sinTerminar + R.barritaDoble; ejemplos.push(...R.ejemplos.map(x => `${ctl} ${dif}: ${x}`));
}
if (mal) { console.log('FALLÓ:\n  ' + ejemplos.join('\n  ')); process.exit(1); }
console.log(`OK: ninguna pulsación perdida ni contada dos veces (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
