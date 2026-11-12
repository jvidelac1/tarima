// Corre en un Chrome sin pantalla los dos caminos de fluidez que solo existen con el 3D dibujándose, y guarda lo que dieron:
//   node tools/banco.mjs            el banco de medición (juego.html?banco=1): imprime la tabla y guarda window.BANCO
//   node tools/banco.mjs --juego    abre el juego dibujando, empieza una partida y espera a que termine la calibración de
//                                   calidad (precalentado de programas y decisión de megapíxeles); guarda JUEGO.calidad
// Opciones: --ancho=1745 --alto=845 (ventana)  --limite=115 (segundos del banco)  --solo=baja,media  --variantes=sombras,luces  --vueltas=3  --mp=0.5,1.5  --n=10
//           --pesista=ventura  --lastre=18 (solo --juego: ms artificiales por megapíxel)  --json=archivo  --headed
// Falla (exit 1) si la página tira un error, si el banco anota errores o si la calibración no llegó a decidir.
// OJO: sin placa (GitHub Actions, contenedor) Chrome dibuja por software y LOS TIEMPOS NO DICEN NADA: ahí esto solo prueba
// que el código corre de punta a punta. Y un Chrome sin pantalla va a 60 Hz aunque el monitor sea de otra frecuencia: la
// medición que vale para el usuario es abrir juego.html?banco=1 en su navegador, con la pestaña a la vista.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions, isSoftware, angleBackend } from './browser.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1], tiene = k => process.argv.includes(`--${k}`);
const JUEGO = tiene('juego'), ANCHO = +(arg('ancho') || 1745), ALTO = +(arg('alto') || 845), LIMITE = +(arg('limite') || 115), SALIDA = arg('json') || path.join(ROOT, 'out', 'banco', JUEGO ? 'juego.json' : 'banco.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`, dormir = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch(launchOptions({ headed: tiene('headed') }));
const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: +(arg('dpr') || 1) }), page = await ctx.newPage();
const errores = [], avisos = [];
page.on('console', m => { const t = m.text(); if (m.type() === 'error') errores.push('console.error: ' + t); else if (m.type() === 'warning' && !/GPU stall|GL Driver Message/i.test(t)) avisos.push(t.slice(0, 400)); });
page.on('pageerror', e => errores.push('pageerror: ' + (e.stack || e.message)));
const n = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');
const guardar = o => { fs.mkdirSync(path.dirname(path.resolve(SALIDA)), { recursive: true }); fs.writeFileSync(SALIDA, JSON.stringify(o, null, 1)); };
const problemas = [];
try {
  if (!JUEGO) {
    // por software un cuadro a 1,5 MP tarda segundos: medidas chicas y dos vueltas alcanzan para probar que el banco corre entero
    const soft = angleBackend() === 'swiftshader' && !arg('mp') ? ['mp=0.06,0.18', 'n=4', 'vueltas=2'] : [];
    const q = ['banco=1', `limite=${LIMITE}`, ...soft, ...['solo', 'variantes', 'pesista', 'mp', 'n', 'vueltas'].filter(k => arg(k)).map(k => `${k}=${arg(k)}`)].join('&');
    await page.goto(`${base}juego.html?${q}`, { waitUntil: 'load' });
    let ult = '';
    for (const t0 = Date.now(); ;) {
      const e = await page.evaluate(() => (window.BANCO ? { listo: window.BANCO.listo, progreso: window.BANCO.progreso } : null)).catch(() => null);
      if (e && e.listo) break;
      if (e && e.progreso !== ult) { ult = e.progreso; console.log(`  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)} s · ${ult}`); }
      if (Date.now() - t0 > (LIMITE + 300) * 1000) throw new Error(`el banco no terminó en ${LIMITE + 300} s (iba por: ${ult || 'sin empezar'})`);
      await dormir(1000);
    }
    const B = await page.evaluate(() => JSON.parse(JSON.stringify(window.BANCO)));
    await page.screenshot({ path: SALIDA.replace(/\.json$/, '') + '.png' }).catch(() => null);
    guardar(B);
    console.log(`\nBanco de medición · ${B.gl} · ventana ${(B.ventana || []).join(' × ')} · pantalla ${n(B.hz)} Hz (período ${n(B.periodoMs)} ms) · a su resolución ${n(B.nativoMP)} MP · ${(B.calidades || []).length} calidades y ${B.variantes.length} variantes en ${n(B.duracionS, 1)} s`);
    if (isSoftware(B.gl)) console.log('DIBUJO POR SOFTWARE: los tiempos de esta tabla no dicen nada de ninguna placa. Solo prueba que el banco corre.');
    const fila = (nombre, cols) => console.log(`${nombre.slice(0, 57).padEnd(58)}${cols.map(x => String(x).padStart(9)).join('')}`), marca = v => (v.ruidosa ? ' · ruidosa' : '') + (v.error ? ' · ERROR' : '');
    fila('calidad', ['vueltas', 'fijo', 'por MP', 'a 1 MP', 'rango', 'vs Baja', 'MP cta', 'MP real', 'pierde', 'llam', 'triáng']);
    for (const v of B.calidades || []) fila(v.nombre + marca(v), [v.vueltas, n(v.fijoMs), n(v.porMPms), n(v.ms1MP), `${n(v.ms1MPmin, 1)}-${n(v.ms1MPmax, 1)}`, n(v.vsBajaMs), n(v.mpModelo), n(v.mpReal), n(v.mpFalla), v.llamadas ?? '—', v.triangulos ? Math.round(v.triangulos / 1000) + 'k' : '—']);
    fila('variante de Baja', ['vueltas', 'a 1 MP', 'ahorro', 'rango', '%', 'fijo', 'por MP', 'llam', 'triáng', 'progr+']);
    for (const v of B.variantes) fila(v.nombre + marca(v), [v.vueltas, n(v.ms1MP), n(v.ahorroMs), `${n(v.ahorroMin, 1)}..${n(v.ahorroMax, 1)}`, n(v.ahorroPct, 1), n(v.ahorroFijoMs), n(v.ahorroPorMPms), v.llamadas ?? '—', v.triangulos ? Math.round(v.triangulos / 1000) + 'k' : '—', v.programasSobrantes ?? '—']);
    if (B.deriva) console.log(`deriva de la completa: ${n(B.deriva.primeraMs)} → ${n(B.deriva.ultimaMs)} ms a 1 MP (${n(B.deriva.cambioPct, 1)} %) · programas ${B.programasAlEmpezar} → ${B.programasAlTerminar} · mallas fijas de la arena: ${B.mallasFijas ? `${B.mallasFijas.antes} → ${B.mallasFijas.despues}` : '—'}`);
    for (const v of B.variantes) if (v.programasSobrantes) problemas.push(`banco: ${v.id} dejó ${v.programasSobrantes} programas compilados al deshacerse${v.sobrantesDe ? ` (${v.sobrantesDe.join('; ')})` : ''}`);
    const internos = B.variantes.filter(v => v.programasInternos).map(v => `${v.quita} ${v.programasInternos}`); if (internos.length) console.log(`programas internos de three que quedan (pasada de sombra, no se usan): ${internos.join(', ')}`);
    for (const x of B.notas) console.log('nota: ' + x);
    for (const x of B.errores) problemas.push('banco: ' + x.split('\n')[0]);
    if (!B.variantes.length || !(B.calidades || []).length) problemas.push('el banco no midió ninguna variante o ninguna calidad');
  } else {
    await page.goto(`${base}juego.html?semilla=20261112&depura=1${arg('lastre') ? '&lastre=' + arg('lastre') : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 180000 });
    if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no inició');
    const antes = await page.evaluate(() => JSON.parse(JSON.stringify(window.JUEGO.calidad)));
    console.log(`al cargar: ${antes.nombre} · pantalla ${antes.hz} Hz, meta ${antes.meta}, se dibuja uno de cada ${antes.paso} · a su resolución ${antes.nativo} MP`);
    await dormir(800); await page.keyboard.press('Enter');      // «Empezar»: carga, precalentado y calibración
    await page.waitForFunction(() => { const c = window.JUEGO.calidad.calibracion; return c && c.ms > 0; }, null, { timeout: 420000 });
    await dormir(1500);
    const o = await page.evaluate(() => { const e = window.JUEGO.escena, g = e.renderer.getContext(), x = g.getExtension('WEBGL_debug_renderer_info'); return JSON.parse(JSON.stringify({ gl: x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : '?', calidad: window.JUEGO.calidad, erroresJuego: window.JUEGO.E.errores, pantalla: window.JUEGO.estado().pantalla, programas: e.renderer.info.programs.length, largos: window.JUEGO.perf.largos.slice(-10) })); });
    await page.screenshot({ path: SALIDA.replace(/\.json$/, '') + '.png' }).catch(() => null);
    guardar(o);
    const c = o.calidad, k = c.calibracion;
    console.log(`${o.gl}${isSoftware(o.gl) ? ' · DIBUJO POR SOFTWARE: los tiempos no dicen nada' : ''}`);
    console.log(`calibración en ${k.ms} ms · pantalla ${k.hz} Hz · quedó en ${c.nombre} (${c.megapixeles} MP de ${c.nativo}) · ${o.programas} programas compilados · pantalla del juego: ${o.pantalla}`);
    for (const p of k.pruebas || []) console.log(`  ${p.calidad}: ${p.medidas.map(m => `${m.ms} ms a ${m.mp} MP`).join(', ')} → fijo ${p.fijo} ms + ${p.porMP} ms/MP → entran ${p.sostiene} MP (pantalla: ${p.techo})`);
    for (const v of k.verificacion || []) console.log(`  verificación a ${v.mp} MP: ${v.cuadros} cuadros, ${v.perdidos} refrescos perdidos, mediana ${v.p50} ms, máximo ${v.max} ms`);
    console.log(`  cambios anotados: ${c.cambios.length ? c.cambios.map(x => `${x.de} → ${x.a} (${x.ms} ms, ${x.pantalla})`).join(' · ') : 'ninguno'}`);
    if (k.error) problemas.push('la calibración falló: ' + k.error.split('\n')[0]);
    if (k.gl) problemas.push('WebGL dio un error durante la carga o la calibración: 0x' + k.gl.toString(16));
    if (!k.pruebas || !k.pruebas.length) problemas.push('la calibración no midió ninguna calidad');
    for (const e of o.erroresJuego.slice(0, 5)) problemas.push('juego: ' + e.split('\n')[0]);
  }
} catch (e) { problemas.push('EXCEPCIÓN: ' + (e.stack || e.message)); }
for (const a of avisos.slice(0, 12)) console.log('aviso de consola: ' + a);
for (const e of errores.slice(0, 8)) problemas.push(e.split('\n')[0]);
await browser.close(); server.close();
if (problemas.length) { console.log('\nPROBLEMAS:'); for (const p of problemas) console.log(' - ' + p); process.exit(1); }
console.log(`\nOK: ${JUEGO ? 'la calibración corrió de punta a punta' : 'el banco corrió de punta a punta'} · ${path.relative(ROOT, path.resolve(SALIDA))}`);
