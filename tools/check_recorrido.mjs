// Recorrido de un jugador nuevo (revisión de experiencia), con navegador (corre en GitHub Actions, dibujo por software).
// Juega por teclado una final exprés en Fácil, con tutorial, a 1745×845 (la ventana del Mac del dueño), con el reloj del
// juego inyectado. A diferencia de check_game, NO toca entre levantamientos: deja correr veredicto, repetición, avisos,
// resúmenes de rivales y cambio de carga hasta que aparece el próximo panel que pide algo. Así mide, en segundos del reloj
// del juego, cuánto pasa sin que el jugador haga nada entre un levantamiento propio y el siguiente, y en qué se va.
// Además:
//  - algunos levantamientos se pierden a propósito (no toca ¡RECIBÍ! o ¡EXPLOTÁ!), para ver la barra que cae y la línea;
//  - en uno de ellos, después del final sigue machacando Espacio cada 120 ms (lo que hace un jugador que venía empujando):
//    anota si el veredicto con el motivo llegó a verse antes de que el machaque lo saltee;
//  - por cada señal con círculo anota cuánto antes del cierre aparece, y cuándo abre la ventana;
//  - capturas de cada momento en out/recorrido/ (un cuadro del 3D forzado antes de cada una).
// Criterios (falla si no se cumplen, además de errores de consola o si el recorrido no avanza):
//  - cuando entre un levantamiento propio y el próximo panel no hay nada de los rivales (el jugador se sigue a sí mismo),
//    la espera sin tocar es de menos de 6 s;
//  - machacando Espacio después del fallo, el veredicto con el motivo se ve, y al menos 1 s.
// No mide cuadros por segundo.
// Uso: node tools/check_recorrido.mjs [--headed] [--semilla=N] [--sin-fotos]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'recorrido');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const HEADED = process.argv.includes('--headed'), FOTOS = !process.argv.includes('--sin-fotos'), SEMILLA = +(arg('semilla') || 20261112);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const problemas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const ctx = await browser.newContext({ viewport: { width: 1745, height: 845 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') problemas.push(`console.error: ${m.text()}`); });
page.on('pageerror', e => problemas.push(`pageerror: ${e.message}`));
await page.goto(`${base}juego.html?semilla=${SEMILLA}&q=baja&dibujo=0`, { waitUntil: 'load' });
if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
const J = (fn, a) => page.evaluate(fn, a);
await J(() => JUEGO.test.manual());

// ---- entrada y reloj
const av = ms => J(ms => JUEGO.test.avanzar(ms), ms);
const ir = t => J(t => JUEGO.test.hasta(t, 8), t);
const toque = async () => { await page.keyboard.down('Space'); await av(30); await page.keyboard.up('Space'); };
let nFoto = 0;
const foto = async nombre => {
  if (!FOTOS) return;
  await J(() => { try { window.JUEGO.escena?.cuadro?.(0, true); } catch (e) { console.error('cuadro forzado para la captura: ' + (e.stack || e)); } }).catch(() => null);
  await page.screenshot({ path: path.join(OUT, `${String(++nFoto).padStart(3, '0')}_${nombre}.jpg`), type: 'jpeg', quality: 70 }).catch(() => null);
};
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();
const leerUI = () => J(() => {
  const v = document.getElementById('veredicto'), pn = document.querySelector('#capa .panel');
  return { veredicto: v && !v.hidden ? v.textContent.replace(/\s+/g, ' ').trim() : '', panel: pn ? (pn.querySelector('h1,h2')?.textContent || '').trim() : '' };
});

// ---- qué levantamientos se pierden a propósito (por el título del panel del llamado)
//   arranque 2: no toca ¡RECIBÍ! · arranque 3: no toca ¡EXPLOTÁ! y después del final machaca Espacio
//   dos tiempos 2: no toca el ¡RECIBÍ! del envión (la barra arriba)
const PLAN = [
  { re: /Arranque · intento 2/, omite: c => c === 'recibi', nombre: 'arranque 2 sin ¡RECIBÍ!' },
  { re: /Arranque · intento 3/, omite: c => c === 'explota', machaca: true, nombre: 'arranque 3 sin ¡EXPLOTÁ!, machacando después' },
  { re: /Dos tiempos · intento 2/, omite: c => c === 'recibi2', nombre: 'dos tiempos 2 sin el ¡RECIBÍ! del envión' },
];

// ---- capturas por pantalla: segundos (reloj del juego) desde que se entra a cada una
const FOTOS_EN = { decision: [.5, 1.25, 2, 3.5], repeticion: [.6, 3], carga: [.25, .7, 1.4], resumen: [.3, 1.6], desplazado: [.3] };
const seg = [];              // pantallas en orden: {p, t0, t1}
let actual = null, plan = null, llamadoTxt = '', nLev = 0, enIntento = false, tFin = null, tConfirma = null, fotosPend = [];
const tramos = [];           // por levantamiento propio: espera hasta el próximo panel, y en qué
const senales = [];          // por señal con círculo: anticipación y apertura
const machaque = [], preps = [];          // preps: de Confirmar en el llamado a que aparece ¡TIRÁ!
let senalPrev = '', senalesFoto = 0;

for (let n = 0; n < 60000; n++) {
  const s = await J(() => JUEGO.estado());
  if (s.errores.length) { problemas.push('error en el juego: ' + s.errores[0]); break; }
  if (s.pantalla === 'fin' && s.panel) { await foto('fin'); break; }
  // cambio de pantalla
  if (s.pantalla !== actual) {
    if (seg.length) seg[seg.length - 1].t1 = s.ahora;
    seg.push({ p: s.pantalla, t0: s.ahora, t1: null }); actual = s.pantalla;
    fotosPend = (FOTOS_EN[s.pantalla] || []).map(x => s.ahora + x * 1000);
    if (['inicio', 'presentacion', 'intervalo', 'ceremonia'].includes(s.pantalla)) await foto(s.pantalla);
  }
  while (fotosPend.length && s.ahora >= fotosPend[0]) { fotosPend.shift(); const u = await leerUI(); await foto(`${slug(s.pantalla)}_${nLev}_${slug(u.veredicto.slice(0, 40)) || 'sin_texto'}`); }
  const I = s.intento;
  if (I && I.propio && s.modo !== 'panel') {
    if (!enIntento) { enIntento = true; nLev++; }
    const g = I.senal;
    if (g && g.clave + g.desde !== senalPrev) {
      senalPrev = g.clave + g.desde;
      if (g.tipo === 'cierre') senales.push({ lev: nLev, clave: g.clave, guiado: I.guiado, ve: s.ahora, objetivo: g.objetivo, anticipa: g.objetivo !== null ? Math.round(g.objetivo - s.ahora) : null });
      if (g.clave === 'tira' && tConfirma !== null && !I.guiado) { preps.push(`lev ${nLev} ${((s.ahora - tConfirma) / 1000).toFixed(1)} s`); tConfirma = null; }
      if (senalesFoto < 14 && (nLev <= 2 || I.guiado || g.clave === 'flexiona' || g.clave === 'arriba' || g.clave === 'recibi2')) { senalesFoto++; await foto(`senal_${nLev}_${g.clave}_aparece`); }
    }
    if (!g) { await av(20); continue; }
    if (I.parado) { await av(80); await toque(); continue; }
    if (g.tipo === 'libre') { await av(150); await toque(); continue; }
    if (g.tipo === 'cierre') {
      if (I.seDetiene || (plan && plan.omite(g.clave))) { await av(20); continue; }
      if (senalesFoto < 20 && nLev <= 2 && g.objetivo - s.ahora > 250) { await ir(g.objetivo - 200); senalesFoto++; await foto(`senal_${nLev}_${g.clave}_200ms_antes`); }
      await ir(g.objetivo); await toque(); await av(40); continue;
    }
    if (g.tipo === 'empuja') { await toque(); await av(120); continue; }
    await av(30); continue;
  }
  // terminó un levantamiento propio: desde acá no se toca nada hasta el próximo panel que pida algo
  if (enIntento && !(I && I.propio)) {
    enIntento = false; tFin = s.ahora;
    const p = (await J(() => JUEGO.E.propios || [])).at(-1) || {};
    tramos.push({ lev: nLev, llamado: llamadoTxt || '(tutorial)', res: p.res + (p.causa ? ':' + p.causa : ''), linea: p.linea || '', desde: seg.length - 1 });
    if (plan && plan.machaca) {      // el que venía empujando sigue tocando: ¿llega a leer el motivo, y cuánto?
      const t0 = s.ahora, trozo = (p.linea || '').slice(0, 25); let visto = '', tVe = null, tSale = null;
      for (let k = 0; k < 25; k++) {
        await toque(); await av(90);
        const u = await leerUI(), e = await J(() => JUEGO.estado().pantalla), ahora = await J(() => JUEGO.reloj.ahora());
        if (u.veredicto && !visto) visto = `${Math.round(ahora - t0)} ms: «${u.veredicto}»`;
        const conMotivo = !!trozo && u.veredicto.includes(trozo);
        if (conMotivo && tVe === null) tVe = ahora; else if (!conMotivo && tVe !== null && tSale === null) tSale = ahora;
        if (k === 10 || k === 16) await foto(`machaque_${k}_${e}`);
        machaque.push(`${Math.round((await J(() => JUEGO.reloj.ahora())) - t0)} ${e}${u.veredicto ? ' «' + u.veredicto.slice(0, 60) + '»' : ''}`);
      }
      tramos.at(-1).machaca = visto || 'el veredicto con el motivo no llegó a verse';
      tramos.at(-1).motivoMs = tVe === null ? 0 : Math.round((tSale ?? await J(() => JUEGO.reloj.ahora())) - tVe);
      tramos.at(-1).motivoSigue = tVe !== null && tSale === null;
    }
    plan = null; continue;
  }
  if (s.panel) {
    const P = await J(() => { const pn = document.querySelector('#capa .panel'); return pn ? { titulo: (pn.querySelector('h1,h2')?.textContent || '').trim(), botones: pn.querySelectorAll('button:not(:disabled)').length } : null; });
    if (P && P.botones) {
      if (tFin !== null) { const T = tramos.at(-1); T.espera = Math.round(s.ahora - tFin); T.hasta = `${s.pantalla}: ${P.titulo}`; const entre = seg.slice(T.desde, -1); T.pantallas = entre.map(x => `${x.p} ${((x.t1 - x.t0) / 1000).toFixed(1)}`).join(' · '); T.lista = entre.map(x => x.p); tFin = null; }
      if (s.pantalla === 'llamado') { llamadoTxt = P.titulo; plan = PLAN.find(x => x.re.test(P.titulo)) || null; await foto(`llamado_${slug(P.titulo)}`); }
      await av(300);
      const ok = await J(() => { const b = document.querySelector('#capa .panel button.ir:not(:disabled)'); if (!b) return false; b.focus(); return document.activeElement === b; });
      if (ok) { await page.keyboard.press('Enter'); if (s.pantalla === 'llamado') tConfirma = (await J(() => JUEGO.reloj.ahora())); }
      await av(50); continue;
    }
  }
  await av(50);
}
const fin = await J(() => ({ tabla: JUEGO.E.p ? JUEGO.E.p.tabla().map(f => `${f.id}:${f.s}+${f.c}=${f.total}#${f.puesto ?? '-'}`).join(' ') : '', propios: JUEGO.E.propios || [] }));
await browser.close(); server.close();

console.log(`recorrido de un jugador nuevo (Fácil, exprés, rivales amistosos, 1745×845, semilla ${SEMILLA}) · tabla: ${fin.tabla}`);
console.log(`levantamientos propios: ${fin.propios.map(x => `${x.pantalla}:${x.res}${x.causa ? ':' + x.causa : ''}`).join(' ')}`);
console.log('\nESPERA SIN TOCAR entre el final de cada levantamiento propio y el próximo panel que pide algo (reloj del juego):');
for (const T of tramos) console.log(`  lev ${T.lev} [${T.llamado}] ${T.res} → ${T.espera !== undefined ? (T.espera / 1000).toFixed(1) + ' s hasta ' + T.hasta : 'fin'}\n     ${T.pantallas || ''}${T.linea ? `\n     línea: «${T.linea}»` : ''}${T.machaca ? `\n     machacando Espacio cada 120 ms después del final: ${T.machaca}` : ''}`);
console.log(`\nDE CONFIRMAR A ¡TIRÁ! (sin tocar): ${preps.join(' · ')}`);
console.log('\nSEÑALES CON CÍRCULO: ms desde que aparece hasta el cierre');
const porClave = {}; for (const x of senales) (porClave[(x.guiado ? 'guiado ' : '') + x.clave] ||= []).push(x.anticipa);
for (const [k, v] of Object.entries(porClave)) console.log(`  ${k}: ${v.join(', ')}`);
if (machaque.length) console.log('\nMACHAQUE (ms desde el final · pantalla · veredicto):\n  ' + machaque.join('\n  '));
// criterios
const PROPIAS = new Set(['decision', 'repeticion', 'carga', 'desplazado']), META_MS = 6000;
console.log('\nCRITERIOS:');
for (const T of tramos) {
  if (T.espera === undefined || !T.lista) continue;
  const solo = T.lista.every(x => PROPIAS.has(x)), txt = `lev ${T.lev} [${T.llamado}] ${T.res}: ${(T.espera / 1000).toFixed(1)} s (${T.pantallas})`;
  if (!solo) { console.log(`  info   ${txt} · con rivales en el medio`); continue; }
  const bien = T.espera < META_MS; console.log(`  ${bien ? 'cumple' : 'NO    '} ${txt} · meta < ${META_MS / 1000} s`);
  if (!bien) problemas.push(`espera de ${(T.espera / 1000).toFixed(1)} s sin rivales en el medio (lev ${T.lev}, ${T.pantallas}); meta < ${META_MS / 1000} s`);
}
for (const T of tramos.filter(x => x.machaca)) {
  const bien = T.motivoMs >= 1000; console.log(`  ${bien ? 'cumple' : 'NO    '} machacando después del fallo, el motivo se ve ${T.motivoMs} ms${T.motivoSigue ? ' (y sigue a la vista al dejar de machacar)' : ''} · meta ≥ 1 s`);
  if (!bien) problemas.push(`machacando Espacio el motivo del fallo se vio ${T.motivoMs} ms (meta ≥ 1 s): ${T.machaca}`);
}
if (!tramos.some(x => x.machaca)) problemas.push('no se llegó a probar el machaque después del fallo');
console.log('\nPANTALLAS (s): ' + seg.map(x => `${x.p} ${(((x.t1 ?? x.t0) - x.t0) / 1000).toFixed(1)}`).join(' · '));
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log(`\ncheck_recorrido: terminó (${nFoto} capturas en out/recorrido)`);
