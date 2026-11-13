// Prueba de la entrada en tiempo real (pedido del dueño del 12 de noviembre: «a veces estoy tocando Espacio y es como que no
// se levanta; revisaría bien que me registre todas las acciones», y regla del 13: «el space desde la computadora tiene que
// estar perfectamente pensado»). Teclado real y reloj real (sin reloj inyectado), con ?dibujo=0. Nivel 'u' (por defecto).
// En los tres primeros intentos propios de una final:
//  1. Un toque durante PREPÁRATE no se pierde: queda «guardado» y el levantamiento arranca solo apenas aparece ¡TIRA!.
//  2. Un doble toque pegado (el segundo a 40 ms) cuenta como uno: el segundo sale «doble», resuelto y con acuse.
//  3. Una ráfaga (8 toques cada 60 ms) en ¡SALTA!: todos anotados y resueltos, el resultado no cambia.
//  4. Un toque largo (700 ms apretado) en ¡TIRA! cuenta como uno y, como sigue apoyado cuando abre ¡SALTA!, también la cumple.
//  5. Un botón con el foco dentro del intento: Espacio es del levantamiento (el botón no se activa, la página no se mueve).
//  6. Después de una pausa (Esc en el llamado, Esc para volver) el primer toque de ¡TIRA! funciona.
//  7. En el turno de un rival: cartel «Turno de X (rival)», sin señal ni botón de levantar; un toque lo saltea.
//  8. Acuse (meta I de G2.9): del timeStamp del keydown al cambio en pantalla (en el mismo manejador) y al cuadro siguiente.
// Siempre: cada pulsación que manda la prueba figura en el registro del juego (JUEGO.toques), resuelta (aceptada o
// descartada con motivo), y cada descartada tuvo su palabra en el acuse; el evento intento_propio lleva cuántos toques
// hubo y cuántos se descartaron por cada motivo.
// Uso: node tools/check_toques.mjs [--headed] [--semilla=N]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions, isSoftware } from './browser.mjs';
import { sinApi } from './sin_api.mjs';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

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
// acuse (meta I): del timeStamp del evento a que la tecla dibujada se hunde y al cuadro siguiente. Va antes que el juego:
// en el intento, el juego se queda con Espacio en captura (stopImmediatePropagation) y nadie más lo ve
await page.addInitScript(() => { window.__A = []; addEventListener('keydown', e => { if (e.code !== 'Space' || e.repeat) return; const ts = e.timeStamp, intento = !!window.JUEGO?.E?.intento?.propio; setTimeout(() => { const on = document.getElementById('acuse')?.classList.contains('on'), dom = performance.now() - ts; requestAnimationFrame(t => window.__A.push({ on, dom, pinta: t - ts, intento })); }, 0); }, true); });
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
  if (s.propios >= 3 && rivalVisto && !(s.intento && s.intento.propio) && s.pantalla !== 'decision') break;      // los tres primeros propios y al menos un turno de un rival
  const I = s.intento;
  if (I && I.propio && s.modo !== 'panel') {
    if (!estadoIntento) { k++; estadoIntento = { k, prep: false, tira: null, hecho: '', ultClave: '', ultEmp: 0, cambioHecho: false, dobleHecho: false, largo: false, ent0: I.entradas }; }
    const X = estadoIntento, g = I.senal;
    if (!g) { await dormir(8); continue; }
    // 1. primer intento: un toque con PREPÁRATE en pantalla, y nada más hasta ver si arranca solo
    if (X.k === 1 && g.clave === 'prep' && !X.prep) { X.prep = true; await espacio(); continue; }
    if (X.k === 1 && X.prep && R.guardado === null) {
      if (I.fase === 'tiron' || I.fase === 'vuelo') R.guardado = { arranco: true, ms: X.tira === null ? 0 : Date.now() - X.tira };      // arrancó sin otro toque
      else { if (g.clave === 'tira' && X.tira === null) X.tira = Date.now(); if (X.tira !== null && Date.now() - X.tira > 1500) R.guardado = { arranco: false, ms: Date.now() - X.tira }; await dormir(8); continue; }
    }
    // 4. segundo intento: toque largo en ¡TIRA! (sigue apoyado cuando abre ¡SALTA!: también la cumple)
    if (X.k === 2 && g.tipo === 'libre' && g.clave === 'tira' && !X.largo) { X.largo = true; const a = await J(() => JUEGO.toques.total); await page.keyboard.down('Space'); enviados++; await dormir(700); await page.keyboard.up('Space'); await dormir(150); const b = await J(() => ({ total: JUEGO.toques.total, fase: JUEGO.estado().intento?.fase, ent: JUEGO.estado().intento?.entradas, uno: JUEGO.estado().intento?.uno })); R.largo = { toques: b.total - a, fase: b.fase, entradas: b.ent, salto: b.uno?.salto }; continue; }
    // 2. primer intento: doble toque pegado en ¡SALTA!
    if (X.k === 1 && g.clave === 'salta' && !X.dobleHecho) { X.dobleHecho = true; const a = await J(() => JUEGO.toques.total); await espacio(25); await dormir(15); await espacio(25); await dormir(120); R.doble = await J(a => window.__T.filter(x => x.n > a), a); continue; }
    // 3. segundo intento: ráfaga en ¡PÁRATE!
    if (X.k === 2 && g.clave === 'parate' && !X.rafaga) { X.rafaga = true; for (let i = 0; i < 8; i++) { await espacio(25); await dormir(35); } R.rafagas++; continue; }
    // 5. tercer intento: un botón con el foco cuando aparece ¡TIRA!; Espacio es del levantamiento
    if (X.k === 3 && !R.foco && g.clave === 'tira') {
      await J(() => { const b = document.createElement('button'); b.id = '__b'; b.textContent = 'x'; b.style.cssText = 'position:fixed;left:0;top:0'; window.__clics = 0; b.onclick = () => window.__clics++; document.body.appendChild(b); b.focus(); window.__y0 = scrollY; });
      const a = await J(() => JUEGO.toques.total); await espacio(); await dormir(120);
      R.foco = await J(a => ({ clics: window.__clics, mueve: scrollY !== window.__y0, anotado: window.__T.filter(x => x.n > a).map(x => x.motivo), tira: JUEGO.estado().intento?.fase !== 'tension' }), a);
      await J(() => document.getElementById('__b')?.remove()); continue;
    }
    if (UNTOQUE.has(g.tipo)) { await dormir(200); await espacio(); continue; }
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
const gl = await J(() => { const g = JUEGO.escena?.renderer?.getContext(), x = g?.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; }).catch(() => '');
const fin = await J(() => ({ pinta: JUEGO.toques.pinta.slice(), manejo: JUEGO.toques.manejo.slice(), total: JUEGO.toques.total, T: window.__T, A: window.__A, eventos: JUEGO.eventos.filter(e => e.ev === 'intento_propio').map(e => e.props), propios: (JUEGO.E.propios || []).map(x => `${x.res}${x.causa ? ':' + x.causa : ''}`) }));
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
if (!R.largo) mal('no se llegó a probar el toque largo'); else if (R.largo.toques !== 1 || !R.largo.entradas || !R.largo.salto) mal(`el toque largo en ¡TIRA! tiene que contar uno y cumplir ¡SALTA! al seguir apoyado: ${JSON.stringify(R.largo)}`);
if (!R.doble) mal('no se llegó a probar el doble toque'); else if (R.doble.length !== 2 || R.doble[1].motivo !== 'doble' || R.doble.some(x => x.ok === null)) mal(`el doble toque pegado no salió «doble»: ${JSON.stringify(R.doble)}`);
if (!R.rafagas) mal('no se llegó a probar la ráfaga en ¡PÁRATE!');
if (!R.foco) mal('no se llegó a probar Espacio con un botón enfocado'); else if (R.foco.clics || R.foco.mueve || !R.foco.anotado.length || !R.foco.tira) mal(`con un botón enfocado, Espacio tiene que ser del levantamiento: ${JSON.stringify(R.foco)}`);
if (!R.pausa || !R.pausa.abrio || !R.pausa.cerro) mal(`la pausa en el llamado: ${JSON.stringify(R.pausa)}`);
if (!rivalVisto) mal('no se vio el turno de un rival'); else if (!rivalVisto.ve || rivalVisto.senal || !/rival/i.test(rivalVisto.txt)) mal(`en el turno de un rival: ${JSON.stringify(rivalVisto)}`);
// acuse (meta I): en el mismo manejador (la tecla ya está hundida al salir del evento) y pintado en el cuadro siguiente
{ const A = fin.A.filter(x => x.intento), p95 = xs => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * .95))] : 0; };
  const sinHundir = A.filter(x => !x.on).length, dom = p95(A.map(x => x.dom)), pinta = p95(A.map(x => x.pinta)), man = p95(fin.manejo);
  console.log(`acuse en el intento: ${A.length} pulsaciones · tecla hundida al salir del manejador en ${A.length - sinHundir} · manejador del juego (acuse, núcleo y palabra) p95 ${man.toFixed(1)} ms · del timeStamp: p95 hasta después del evento ${dom.toFixed(1)} ms, hasta el cuadro siguiente ${pinta.toFixed(1)} ms (meta ≤ 17 ms a 60 Hz) · ${gl || 'sin WebGL'}`);
  // la misma medida que hace el juego en cada aparato (input.js → toques.pinta, que va a intento_propio como acuse_p95_ms y se ve
  // en ?depura=1): del instante del evento al cuadro siguiente
  console.log(`acuse medido por el juego (lo que llega a las métricas desde los aparatos de verdad): ${fin.pinta.length} pulsaciones, p95 ${p95(fin.pinta).toFixed(1)} ms`);
  if (!fin.pinta.length) mal('el juego no midió el acuse (toques.pinta vacío)');
  if (!A.length) mal('no se midió el acuse');
  if (sinHundir) mal(`${sinHundir} pulsaciones sin acuse en el mismo manejador`);
  if (man > 8) mal(`el manejador de la pulsación tarda ${man.toFixed(1)} ms (p95; meta ≤ 8 ms para que el acuse entre en el cuadro)`);
  // por software (Actions) el hilo principal está ocupado dibujando y la entrada llega tarde: ahí es nota; con placa, criterio
  if (pinta > 17.5) (isSoftware(gl) || !gl ? notas : problemas).push(`acuse: p95 de ${pinta.toFixed(1)} ms del timeStamp al cuadro siguiente (meta ≤ 17 ms a 60 Hz)`); }
const ip = fin.eventos[0];
if (!ip || !Number.isFinite(ip.toques) || !Number.isFinite(ip.aceptados) || !Number.isFinite(ip.descartados)) mal(`intento_propio sin la cuenta de toques: ${JSON.stringify(ip)}`);
const motivos = {}; for (const x of fin.T) if (x.ok === false) motivos[x.motivo] = (motivos[x.motivo] || 0) + 1;
console.log(`pulsaciones: ${enviados} mandadas, ${fin.total} anotadas, ${fin.T.filter(x => x.ok).length} aceptadas · descartadas por motivo: ${JSON.stringify(motivos)}`);
console.log(`PREPÁRATE → ¡TIRA!: ${JSON.stringify(R.guardado)} · toque largo: ${JSON.stringify(R.largo)} · doble: ${JSON.stringify(R.doble)} · ráfagas en ¡PÁRATE!: ${R.rafagas} · botón con foco: ${JSON.stringify(R.foco)} · pausa: ${JSON.stringify(R.pausa)}`);
console.log(`turno de un rival: ${JSON.stringify(rivalVisto)} · intentos propios: ${fin.propios.join(' · ')}`);
console.log(`intento_propio: ${fin.eventos.map(e => JSON.stringify({ toques: e.toques, aceptados: e.aceptados, descartados: e.descartados, ...Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith('desc_'))), guardados: e.guardados })).join(' · ')}`);
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas) console.log('  ' + p); process.exit(1); }
console.log('\nOK: toques en tiempo real anotados y resueltos, con acuse en el mismo manejador; PREPÁRATE guarda el toque, el doble vale uno, el largo vale uno y cumple ¡SALTA!, un botón con foco no se lleva Espacio, la pausa no rompe nada y el turno del rival se ve como tal');
