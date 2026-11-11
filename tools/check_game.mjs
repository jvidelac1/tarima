// Prueba automática del juego (docs/JUEGO.md, sección 9.7), con el mismo patrón que la del visor. No pide GPU ni mide
// cuadros por segundo: la sesión cloud dibuja por software.
//  - Juega una partida completa por la vía real de entrada con el reloj inyectado (la prueba adelanta el tiempo): una vez
//    con teclado en escritorio y otra con toques en tamaño de teléfono.
//  - Juega además un intento corto en tiempo real por cada vía, para probar el reloj verdadero.
//  - Falla ante errores de consola, excepciones, 404 o pedidos externos; si no se visitan todos los estados; si la barra
//    queda bajo la tarima o separada de las manos; o si el registro exportado no recalcula a la misma tabla.
// Uso: node tools/check_game.mjs [--headed] [--only=teclado|tactil] [--semilla=N] [--dibujo]   (CHROME_PATH elige el navegador)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { leerDatos } from '../web/js/sim/data.js';
import { recalcular, resumen } from '../web/js/sim/replay.js';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'game');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const ONLY = arg('only'), HEADED = process.argv.includes('--headed'), SEMILLA = +(arg('semilla') || 20261111), DIBUJO = process.argv.includes('--dibujo');
const CHROME = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(WEB, 'data/sim.json'), 'utf8')));

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const problemas = [], notas = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: !HEADED, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--mute-audio'] });

const ESTADOS = ['inicio', 'metronomo', 'practica', 'presentacion', 'llamado', 'intento', 'decision', 'repeticion', 'resumen', 'intervalo', 'clasificacion', 'ceremonia', 'fin'];

async function corrida(via) {
  const tactil = via === 'tactil', tag = `[${via}]`;
  const ctx = await browser.newContext(tactil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), cdp = tactil ? await ctx.newCDPSession(page) : null;
  page.on('console', m => { if (m.type() === 'error') problemas.push(`${tag} console.error: ${m.text()}`); });
  page.on('pageerror', e => problemas.push(`${tag} pageerror: ${e.message}`));
  // En Chromium sin GPU un GLB que cargó bien puede quedar informado como abortado (le pasa también a la prueba del visor):
  // se anota, y más abajo se verifica que los dos modelos estén en memoria.
  page.on('requestfailed', r => (/\.glb$/.test(r.url()) && r.failure()?.errorText === 'net::ERR_ABORTED' ? notas : problemas).push(`${tag} requestfailed: ${r.url().replace(base, '')} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) problemas.push(`${tag} HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problemas.push(`${tag} pedido externo: ${r.url()}`); });
  const J = (fn, a) => page.evaluate(fn, a);
  // el botón, por la vía real: tecla o dedo sobre la zona táctil
  let dedo = false;
  const zona = async () => { const b = await page.locator('#zona').boundingBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; };
  const baja = async () => { if (tactil) { const p = await zona(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); dedo = true; } else await page.keyboard.down('Space'); };
  const sube = async () => { if (tactil) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); dedo = false; } else await page.keyboard.up('Space'); };
  const pulsa = async sel => { const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible()) || !(await l.isEnabled())) return false; if (tactil) await l.tap(); else await l.click(); return true; };

  await page.goto(`${base}juego.html?semilla=${SEMILLA}&q=${tactil ? 'movil&ritmo=completa' : 'baja'}${DIBUJO ? '' : '&dibujo=0'}`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
  const gl = await J(() => { const g = JUEGO.escena.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.log(`${tag} ${gl}`);

  /** Juega lo que haya en pantalla hasta que `hasta(estado)` sea cierto. `manual`: la prueba adelanta el reloj. */
  async function jugar(hasta, manual, opciones = {}) {
    const av = async ms => { if (manual) await J(ms => JUEGO.test.avanzar(ms), ms); else await page.waitForTimeout(ms); };
    const ir = async t => { if (manual) await J(t => JUEGO.test.hasta(t, 8), t); else { const d = t - await J(() => JUEGO.reloj.ahora()); if (d > 0) await page.waitForTimeout(d); } };
    let ultToque = 0, metro = false, kgHecho = '';
    for (let n = 0; n < 60000; n++) {
      const s = await J(() => JUEGO.estado());
      if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
      if (hasta(s)) return s;
      const I = s.intento;
      if (I && I.propio && s.modo !== 'panel') {
        if (I.fase === 'pelea' || I.fase === 'traba') {
          const p = I.pelea, quiere = p.modo === 'traba' ? p.E < p.exiTraba + 150 : (p.P < 1e6 && p.aguja < p.exi + 55) || (!p.trabado && p.E < p.exiTraba + 150);
          if (quiere && s.ahora - ultToque >= 150) { await baja(); await av(40); await sube(); ultToque = s.ahora; } else await av(manual ? 16 : 10);
        } else if (I.fase === 'fijacion' && !I.apretado) { await baja(); await av(30); }
        else if (I.objetivo !== null) { await ir(I.objetivo + (I.fase === 'tiron' && opciones.tarde?.(kgHecho) || 0)); if (I.accion === 'baja') { await baja(); if (I.fase === 'vuelo' || I.fase === 'empuje') { await av(40); await sube(); } } else await sube(); await av(16); }
        else await av(manual ? 30 : 15);
        continue;
      }
      if (s.pantalla === 'metronomo' && !metro && opciones.metronomo) {      // ocho toques sobre el pulso, con 30 ms de atraso
        metro = true; for (let i = 0; i < 8; i++) { await ir(s.metro + i * 700 + 30); await baja(); await av(50); await sube(); } await av(800); continue;
      }
      if (s.pantalla === 'llamado' && s.modo === 'panel') {      // el panel único: a veces sube un kilo (cuenta como cambio) y elige envión
        const clave = await page.locator('.panel h2').first().textContent().catch(() => '');
        if (clave && clave !== kgHecho) { kgHecho = clave; await av(450); if (opciones.cambia && /intento 2/.test(clave)) await pulsa('#kg-mas'); if (opciones.envion) await pulsa(`.envion[data-env="${opciones.envion(clave)}"]`); }
      }
      let hizo = false;
      for (const sel of opciones.botones || ['#btn-confirmar', '#btn-practicar', '#cal-si', '#btn-empezar']) if (await pulsa(sel)) { hizo = true; break; }
      await av(hizo ? 50 : s.pantalla === 'resumen' || s.pantalla === 'decision' || s.pantalla === 'repeticion' ? 450 : 200);
      if (!hizo && ['resumen', 'decision', 'repeticion', 'carga', 'desplazado'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) { await baja(); await av(20); await sube(); }      // el toque de saltear
    }
    throw new Error('la prueba no avanza (pantalla ' + (await J(() => JUEGO.estado().pantalla)) + ')');
  }

  // 1. partida completa con el reloj inyectado
  const t0 = Date.now();
  await J(() => JUEGO.test.manual());
  await pulsa(`.pesista[data-id="${tactil ? 'brenner' : 'ventura'}"]`); await pulsa('.nivel[data-n="normal"]');
  const envion = tactil ? () => 'split' : clave => (/intento 1/.test(clave) ? 'power' : /intento 2/.test(clave) ? 'squat' : 'split');
  // con teclado, el tercer arranque se suelta 400 ms tarde a propósito: tiene que ser un fallo, con su corte y su causa
  const tarde = tactil ? null : clave => (/Arranque · intento 3/.test(clave) ? 400 : 0);
  const fin = await jugar(s => s.pantalla === 'fin', true, { metronomo: true, cambia: true, envion, tarde });
  const r = await J(() => ({ registro: JUEGO.registro, tabla: JUEGO.E.p.tabla().map(f => `${f.id}:${f.s}+${f.c}=${f.total}#${f.puesto ?? '-'}`).join(' '), monitor: JUEGO.E.monitor, visitados: JUEGO.E.visitados, juego: (JUEGO.estado().ahora), cal: JUEGO.E.cfg.cal,
    modelos: Object.keys(JUEGO.escena.atletas).sort().join(','), mios: JUEGO.E.p.at[JUEGO.E.yo].s.concat(JUEGO.E.p.at[JUEGO.E.yo].c).map(x => `${x.kg}${x.res === 'valido' ? '✓' : '✗' + (x.causa || '')}`).join(' ') }));
  const seg = (Date.now() - t0) / 1000;
  console.log(`${tag} partida completa en ${seg.toFixed(1)} s de reloj real · tabla: ${r.tabla}`);
  console.log(`${tag} intentos del jugador: ${r.mios} · corrección de atraso ${r.cal} ms · llamados ${r.registro.llamados.length}`);
  if (seg > 60) notas.push(`${tag} la partida tardó ${seg.toFixed(0)} s (meta: menos de un minuto)`);
  if (tactil && !r.visitados.includes('rival')) problemas.push(`${tag} final completa: no se mostró ningún intento de un rival`);
  if (r.cal !== 30) problemas.push(`${tag} el metrónomo midió ${r.cal} ms y los toques iban con 30 ms de atraso`);
  for (const e of ESTADOS.filter(e => !(tactil && e === 'resumen'))) if (!r.visitados.includes(e)) problemas.push(`${tag} no se visitó el estado «${e}»`);
  const rc = recalcular(r.registro, datos);
  if (!rc.ok) problemas.push(`${tag} el registro exportado no recalcula: ${rc.error}`); else if (resumen(rc.tabla) !== r.tabla) problemas.push(`${tag} recalculado «${resumen(rc.tabla)}», en pantalla «${r.tabla}»`);
  if (r.modelos !== 'brenner,ventura') problemas.push(`${tag} modelos en memoria: ${r.modelos}`);
  if (!(r.monitor.cuadros > 500)) problemas.push(`${tag} el monitor de la barra casi no midió (${r.monitor.cuadros} cuadros)`);
  if (r.monitor.barraMin < .2249) problemas.push(`${tag} la barra quedó bajo la tarima: centro a ${(r.monitor.barraMin * 1000).toFixed(1)} mm`);
  if (r.monitor.manosMax > .16) problemas.push(`${tag} la barra se separó de las manos: ${(r.monitor.manosMax * 1000).toFixed(0)} mm`);
  console.log(`${tag} barra: mínimo ${(r.monitor.barraMin * 1000).toFixed(1)} mm · manos a barra, máximo ${(r.monitor.manosMax * 1000).toFixed(0)} mm · ${r.monitor.cuadros} cuadros medidos`);
  if (via === 'teclado' && !/✗sin_altura/.test(r.mios)) problemas.push(`${tag} el arranque soltado 400 ms tarde no dio «tirón sin altura»: ${r.mios}`);
  if (via === 'teclado' && !r.registro.llamados.some(c => c.cambios?.length)) notas.push(`${tag} la partida no tuvo ningún cambio de kilos`);
  await page.screenshot({ path: path.join(OUT, `${via}_fin.png`) }).catch(() => null);

  // 2. un intento corto en tiempo real (calentamiento), con el reloj verdadero
  await J(() => JUEGO.test.real()); const antes = await J(() => JUEGO.E.visitados.length);
  await page.waitForTimeout(700); await pulsa('#btn-cambiar'); await page.waitForFunction(() => JUEGO.estado().pantalla === 'inicio');
  await page.waitForTimeout(100); await pulsa('#btn-empezar');
  await page.waitForFunction(() => JUEGO.estado().pantalla === 'metronomo'); await page.waitForTimeout(500); await pulsa('#btn-saltear');
  await page.waitForFunction(() => JUEGO.estado().pantalla === 'practica'); await page.waitForTimeout(500);
  await J(() => { JUEGO.E.visitados.length = 0; }); const tr0 = Date.now();
  await pulsa('#btn-practicar');
  await jugar(s => s.visitados.includes('decision'), false, { botones: [] });
  const real = await J(() => JUEGO.E.visitados.slice());
  console.log(`${tag} intento en tiempo real: ${((Date.now() - tr0) / 1000).toFixed(1)} s, llegó a la decisión (${real.join(' → ')})`);
  await page.screenshot({ path: path.join(OUT, `${via}_real.png`) }).catch(() => null);
  void antes; void fin;
  await ctx.close();
}

try {
  for (const via of ['teclado', 'tactil'].filter(v => !ONLY || v === ONLY)) await corrida(via);
} catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close(); server.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 25)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: partida completa por teclado y por toques, sin errores de consola ni pedidos externos');
