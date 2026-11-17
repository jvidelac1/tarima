// Prueba del laboratorio interactivo del cuerpo por código (juego.html?banco=1&lab=cuerpo&plantel=kordan) en un Chrome sin
// pantalla: carga, arrastra para girar, rueda para el zoom, toca los botones de pose, de vista y «Comparar», en ventana de
// computadora y de teléfono, y guarda una captura de cada paso. Falla si la página tira un error.
//   node tools/cuerpo/check_lab.mjs [--out=out/cuerpo/lab] [--calidad=media]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from '../browser.mjs';
import { sinApi } from '../sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), WEB = path.join(ROOT, 'web');
const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; }, OUT = arg('out', path.join(ROOT, 'out/cuerpo/lab'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => { if (sinApi(req, res)) return; const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`, browser = await chromium.launch(launchOptions({})), problemas = [];
fs.mkdirSync(OUT, { recursive: true });
for (const [nombre, vp, tactil] of [['pc', { width: 1280, height: 720 }, false], ['tel', { width: 390, height: 780 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: tactil, isMobile: tactil }), page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') problemas.push(`${nombre} console.error: ${m.text().split('\n')[0]}`); }); page.on('pageerror', e => problemas.push(`${nombre} pageerror: ${e.message}`));
  const t0 = Date.now(); await page.goto(`${base}juego.html?banco=1&lab=cuerpo&plantel=kordan&calidad=${arg('calidad', 'media')}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.BANCO && window.BANCO.listo, null, { timeout: 300000 });
  const info = await page.evaluate(() => ({ cuerpo: window.BANCO.cuerpo, errores: window.BANCO.errores })); for (const e of info.errores) problemas.push(`${nombre}: ${e.split('\n')[0]}`);
  console.log(`${nombre}: listo en ${((Date.now() - t0) / 1000).toFixed(1)} s · cuerpo ${JSON.stringify(info.cuerpo)}`);
  const foto = async n => { await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, `${nombre}_${n}.png`), timeout: 120000 }); console.log(`  ${nombre}_${n}.png`); };
  await foto('1-inicio');
  const cx = vp.width / 2, cy = vp.height * .4; await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + vp.width * .22, cy + 30, { steps: 6 }); await page.mouse.up(); await foto('2-girado');
  await page.mouse.wheel(0, -500); await foto('3-zoom');
  for (const [b, n] of [['Sentadilla', '4-sentadilla'], ['Espalda', '5-espalda'], ['Barra arriba', '6-arriba'], ['Comparar', '7-comparar'], ['Frente', '8-comparar-frente']]) { await page.getByRole('button', { name: b, exact: true }).click(); await foto(n); }
  await ctx.close();
}
await browser.close(); server.close();
if (problemas.length) { console.log('\nPROBLEMAS:'); for (const p of problemas) console.log(' - ' + p); process.exit(1); }
console.log('\nOK: el laboratorio del cuerpo carga y responde · ' + path.relative(ROOT, OUT));
