// Prueba de la entrada en tiempo real (pedido del dueño del 12 de noviembre: «a veces estoy tocando Espacio y es como que no
// se levanta; revisaría bien que me registre todas las acciones»). Teclado real y reloj real (sin reloj inyectado), con
// ?dibujo=0 para que el dibujo por software no atrase nada. En los dos primeros intentos propios de una final:
//  1. Un toque durante PREPÁRATE (antes de ¡TIRA!) no se pierde: queda guardado y el levantamiento arranca solo apenas
//     aparece ¡TIRA!, sin otro toque. Antes se descartaba con «ESPERA» y no se levantaba nada.
//  2. Un toque justo al cambiar de señal (pegado al de ¡EXPLOTA!) y un doble toque pegado: se anotan, y si se descartan
//     (un toque a menos de 60 ms del anterior es un rebote del dedo), con motivo y acuse.
//  3. Ráfagas en ¡EMPUJA! (8 toques cada 60 ms): todas anotadas.
//  4. Un toque largo (700 ms apretado) en ¡TIRA! cuenta como uno y arranca el levantamiento.
//  5. Después de una pausa (Esc en el llamado, Esc para volver) el primer toque de ¡TIRA! funciona.
//  6. En el turno de un rival: cartel «Turno de X (rival)», sin señal ni botón de levantar; un toque lo saltea.
// Siempre: cada pulsación que manda la prueba figura en el registro del juego (JUEGO.toques), resuelta (aceptada o
// descartada con motivo), y cada descartada tuvo su palabra en el acuse; el evento intento_propio lleva cuántos toques
// hubo y cuántos se descartaron por cada motivo.
// Uso: node tools/check_toques.mjs [--headed] [--semilla=N]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const HEADED = process.argv.includes('--headed'), SEMILLA = +(arg('semilla') || 20261112);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const problemas = [], notas = [], mal = t => { if (!problemas.includes(t)) problemas.push(t); };
const dormir = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
page.on('pageerror', e => mal(`pageerror: ${e.message}`));
await page.addInitScript(() => { try { if (!sessionStorage.getItem('__t')) { localStorage.setItem('tarima.tutorial', '1'); localStorage.setItem('tarima.jugadas', '1'); localStorage.setItem('tarima.visto.tarjeta', '1'); sessionStorage.setItem('__t', '1'); } } catch { /* nada */ } });
await page.goto(`${base}juego.html?lang=es&dibujo=0&q=baja&semilla=${SEMILLA}`, { waitUntil: 'load' });
if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no inició');
// registro de cada pulsación como la ve el juego, con la palabra del acuse en el momento en que se resuelve
await page.evaluate(() => {
  const T = window.JUEGO.toques, orig = T.alCambiar; window.__T = [];
  T.alCambiar = (x, que) => { orig?.(x, que); if (que === 'resuelto' && x) { const a = document.querySelector('#acuse b')?.textContent || ''; const r = window.__T.find(y => y.n === x.n); const o = { n: x.n, ok: x.ok, motivo: x.motivo, donde: x.donde, acuse: a }; if (r) Object.assign(r, o); else window.__T.push(o); } else if (que === 'baja' && x) window.__T.push({ n: x.n, ok: null, motivo: '', donde: x.donde, acuse: '' }); };
});
const J = (fn, a) => page.evaluate(fn, a);
let enviados = 0;
const espacio = async (ms = 35) => { await page.keyboard.down('Space'); enviados++; await dormir(ms); await page.keyboard.up('Space'); };
const enter = async () => { await page.keyboard.press('Enter'); enviados++; };

let propios = 0, pausaProbada = false, ultSalto = 0, k = 0, rivalVisto = null;
const R = { guardado: null, largo: null, cambio: null, doble: null, rafagas: 0, pausa: null };
let estadoIntento = null;      // lo que hace la prueba dentro del intento propio en curso
const t0 = Date.now();
for (;;) {
  if (Date.now() - t0 > 6 * 60000) { mal('la prueba no avanza en 6 minutos'); break; }
  const s = await J(() => { const e = JUEGO.estado(); e.propios = (JUEGO.E.propios || []).length; e.turno = { ve: !document.getElementById('turno').hidden, txt: document.getElementById('turno').textContent, senal: !document.getElementById('senal').hidden }; return e; });
  if (s.errores.length) { mal('error en el juego: ' + s.errores[0]); break; }
  if (s.propios >= 2 && !(s.intento && s.intento.propio) && s.pantalla !== 'decision') break;
  const I = s.intento;
  if (I && I.propio && s.modo !== 'panel') {
    if (!estadoIntento) { k++; estadoIntento = { k, prep: false, tira: null, hecho: '', ultClave: '', ultEmp: 0, cambioHecho: false, dobleHecho: false, largo: false, ent0: I.entradas }; }
    const X = estadoIntento, g = I.senal;
    if (!g) { await dormir(8); continue; }
    // 1. primer intento: un toque con PREPÁRATE en pantalla, y nada más hasta ver si arranca solo
    if (X.k === 1 && g.clave === 'prep' && !X.prep) { X.prep = true; await espacio(); continue; }
    if (X.k === 1 && X.prep && R.guardado === null) {
      if (I.entradas > X.ent0) R.guardado = { arranco: true, ms: X.tira === null ? 0 : Date.now() - X.tira };      // arrancó sin otro toque
      else { if (g.clave === 'tira' && X.tira === null) X.tira = Date.now(); if (X.tira !== null && Date.now() - X.tira > 1500) R.guardado = { arranco: false, ms: Date.now() - X.tira }; await dormir(8); continue; }
    }
    // 4. segundo intento: toque largo en ¡TIRA!
    if (X.k === 2 && g.tipo === 'libre' && g.clave === 'tira' && !X.largo) { X.largo = true; const a = await J(() => JUEGO.toques.total); await page.keyboard.down('Space'); enviados++; await dormir(700); await page.keyboard.up('Space'); await dormir(150); const b = await J(() => ({ total: JUEGO.toques.total, fase: JUEGO.estado().intento?.fase, ent: JUEGO.estado().intento?.entradas })); R.largo = { toques: b.total - a, fase: b.fase, entradas: b.ent }; continue; }
    if (g.tipo === 'libre') { await dormir(200); await espacio(); continue; }
    // 2. toque justo al cambiar de señal (de ¡EXPLOTA! a ¡ATRÁPALA!), en el primer intento
    if (X.k === 1 && g.clave !== X.ultClave && X.ultClave === 'explota' && !X.cambioHecho) { X.cambioHecho = true; const a = await J(() => JUEGO.toques.total); await espacio(); await dormir(120); R.cambio = await J(a => window.__T.filter(x => x.n > a), a); X.ultClave = g.clave; continue; }
    X.ultClave = g.clave;
    if (g.tipo === 'cierre') {
      const kk = g.clave + g.desde; if (I.seDetiene || X.hecho === kk) { await dormir(8); continue; }
      const falta = g.objetivo - s.ahora - 25; if (falta > 0) await dormir(Math.min(falta, 2000)); await espacio(); X.hecho = kk;
      // doble toque pegado (el segundo a 40 ms), en el segundo intento
      if (X.k === 2 && !X.dobleHecho) { X.dobleHecho = true; const a = await J(() => JUEGO.toques.total); await dormir(5); await espacio(); await dormir(120); R.doble = await J(a => window.__T.filter(x => x.n >= a), a); }
      continue;
    }
    // 3. ráfagas en ¡EMPUJA!
    if (g.tipo === 'empuja') { if (Date.now() - X.ultEmp > 400) { for (let i = 0; i < 8; i++) { await espacio(25); await dormir(35); } R.rafagas++; X.ultEmp = Date.now(); } else await dormir(10); continue; }
    await dormir(10); continue;
  }
  if (estadoIntento && !(I && I.propio)) estadoIntento = null;
  if (s.turno.ve && !rivalVisto) rivalVisto = { ...s.turno, pantalla: s.pantalla };
  if (s.panel && !s.sobre) {
    const P = await J(() => { const pn = document.querySelector('#capa .panel'), ir = pn?.querySelector('button.ir:not(:disabled)'); return { ir: !!ir, foco: document.activeElement === ir }; });
    if (P.ir) {
      // 5. pausa en el llamado: Esc la abre, Esc la cierra; después el intento tiene que andar igual
      if (s.pantalla === 'llamado' && !pausaProbada) { pausaProbada = true; await dormir(500); await page.keyboard.press('Escape'); await dormir(400); const a = await J(() => JUEGO.estado().sobre); await page.keyboard.press('Escape'); await dormir(300); const b = await J(() => JUEGO.estado().sobre); R.pausa = { abrio: a, cerro: b === null }; continue; }
      await dormir(500); if (!P.foco) await J(() => document.querySelector('#capa .panel button.ir:not(:disabled)')?.focus()); await enter(); await dormir(300); continue;
    }
  }
  if (['rival', 'decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado'].includes(s.pantalla) && Date.now() - ultSalto > 1500 && (s.pantalla !== 'rival' || rivalVisto)) { await espacio(); ultSalto = Date.now(); continue; }
  await dormir(30);
}
await dormir(1600);
const fin = await J(() => ({ total: JUEGO.toques.total, T: window.__T, eventos: JUEGO.eventos.filter(e => e.ev === 'intento_propio').map(e => e.props), propios: (JUEGO.E.propios || []).map(x => `${x.res}${x.causa ? ':' + x.causa : ''}`) }));
await browser.close(); server.close();

// ---------- veredicto ----------
const sinResolver = fin.T.filter(x => x.ok === null), sinMotivo = fin.T.filter(x => x.ok === false && !x.motivo), sinAcuse = fin.T.filter(x => x.ok === false && !x.acuse && x.motivo !== 'boton');
if (fin.total !== enviados) mal(`la prueba mandó ${enviados} pulsaciones y el juego anotó ${fin.total}`);
if (sinResolver.length) mal(`${sinResolver.length} pulsaciones sin resolver: ${JSON.stringify(sinResolver.slice(0, 3))}`);
if (sinMotivo.length) mal(`${sinMotivo.length} descartadas sin motivo: ${JSON.stringify(sinMotivo.slice(0, 3))}`);
if (sinAcuse.length) mal(`${sinAcuse.length} descartadas sin palabra en el acuse: ${JSON.stringify(sinAcuse.slice(0, 3))}`);
if (!R.guardado) mal('no se llegó a probar el toque durante PREPÁRATE');
else if (!R.guardado.arranco) mal(`un toque durante PREPÁRATE no levantó: con ¡TIRA! en pantalla ${R.guardado.ms} ms y nada`);
const g = fin.T.find(x => x.motivo === 'guardado'); if (R.guardado && !g) mal('el toque durante PREPÁRATE no quedó como «guardado»');
if (!R.largo) mal('no se llegó a probar el toque largo'); else if (R.largo.toques !== 1 || !R.largo.entradas) mal(`el toque largo en ¡TIRA!: ${JSON.stringify(R.largo)}`);
if (!R.pausa || !R.pausa.abrio || !R.pausa.cerro) mal(`la pausa en el llamado: ${JSON.stringify(R.pausa)}`);
if (!R.rafagas) notas.push('no hubo ¡EMPUJA! en estos intentos: las ráfagas no se probaron');
if (!rivalVisto) mal('no se vio el turno de un rival'); else if (!rivalVisto.ve || rivalVisto.senal || !/rival/i.test(rivalVisto.txt)) mal(`en el turno de un rival: ${JSON.stringify(rivalVisto)}`);
const ip = fin.eventos[0];
if (!ip || !Number.isFinite(ip.toques) || !Number.isFinite(ip.aceptados) || !Number.isFinite(ip.descartados)) mal(`intento_propio sin la cuenta de toques: ${JSON.stringify(ip)}`);
const motivos = {}; for (const x of fin.T) if (x.ok === false) motivos[x.motivo] = (motivos[x.motivo] || 0) + 1;
console.log(`pulsaciones: ${enviados} mandadas, ${fin.total} anotadas, ${fin.T.filter(x => x.ok).length} aceptadas · descartadas por motivo: ${JSON.stringify(motivos)}`);
console.log(`PREPÁRATE → ¡TIRA!: ${JSON.stringify(R.guardado)} · toque largo: ${JSON.stringify(R.largo)} · al cambiar de señal: ${JSON.stringify(R.cambio)} · doble: ${JSON.stringify(R.doble)} · ráfagas en ¡EMPUJA!: ${R.rafagas} · pausa: ${JSON.stringify(R.pausa)}`);
console.log(`turno de un rival: ${JSON.stringify(rivalVisto)} · intentos propios: ${fin.propios.join(' · ')}`);
console.log(`intento_propio: ${fin.eventos.map(e => JSON.stringify({ toques: e.toques, aceptados: e.aceptados, descartados: e.descartados, ...Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith('desc_'))), guardados: e.guardados })).join(' · ')}`);
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas) console.log('  ' + p); process.exit(1); }
console.log('\nOK: toques en tiempo real anotados y resueltos, con motivo y acuse; PREPÁRATE guarda el toque, el toque largo vale uno, la pausa no rompe nada y el turno del rival se ve como tal');
