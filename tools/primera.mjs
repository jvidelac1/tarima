// Capturas de lo que ve un jugador nuevo (docs/CONTROLES.md, sección 8): inicio, cada parada del tutorial guiado, cada
// señal a velocidad real, una línea de fallo, la pausa y la ayuda, en escritorio (teclado) y en teléfono (toques).
// Corre con el reloj verdadero y dibujando. Uso: node tools/primera.mjs [--out=out/primera] [--only=escritorio|telefono|clasico]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const OUT = path.resolve(arg('out') || path.join(ROOT, 'out', 'primera')), ONLY = arg('only');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launchOptions());

async function recorrido(via) {
  const tel = via === 'telefono', clasico = via === 'clasico';
  const ctx = await browser.newContext(tel ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), cdp = tel ? await ctx.newCDPSession(page) : null;
  page.on('console', m => { if (m.type() === 'error') console.log(`[${via}] console.error:`, m.text()); });
  page.on('pageerror', e => console.log(`[${via}] pageerror:`, e.message));
  let n = 0; const foto = async tag => { const f = `${via}_${String(++n).padStart(2, '0')}_${tag}.jpg`; await page.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 78 }); console.log('  ' + f); };
  const E = () => page.evaluate(() => JUEGO.estado());
  const zona = async () => { const b = await page.locator('#zona').boundingBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; };
  const baja = async () => { if (tel) { const p = await zona(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); } else await page.keyboard.down('Space'); };
  const sube = async () => { if (tel) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space'); };
  const toque = async () => { await baja(); await page.waitForTimeout(35); await sube(); };
  const ok = async () => { await page.waitForTimeout(550); if (tel) await page.locator('#capa .panel button.ir').tap(); else await page.keyboard.press('Enter'); };
  const hasta = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms, polling: 16 }).catch(() => console.log(`  (no llegó: ${fn})`));
  const irA = async t => { const d = t - await page.evaluate(() => JUEGO.reloj.ahora()); if (d > 0) await page.waitForTimeout(d); };

  /** Juega el intento en curso tocando cada señal en su momento; saca una foto la primera vez que ve cada señal. `o.sin`: señal que no toca. `o.mitad`: foto con el círculo a medio cerrar. */
  async function intento(tag, o = {}) {
    const vistas = new Set(); let ult = 0, hecho = '';
    for (let k = 0; k < 20000; k++) {
      const s = await E(), I = s.intento; if (!I || !I.propio) { if (s.pantalla === 'decision') return; await page.waitForTimeout(30); continue; }
      const g = I.senal; if (!g) { await page.waitForTimeout(16); continue; }
      const clave = g.clave + (I.parado ? '_parado' : '');
      if (!vistas.has(clave) && (I.parado || g.tipo !== 'cierre' || !I.seDetiene)) { vistas.add(clave); if (g.tipo === 'cierre' && !I.parado) { if (o.mitad) { await irA((g.desde + g.objetivo) / 2); await foto(`${tag}_${g.clave}_cerrando`); } } else { await page.waitForTimeout(g.tipo === 'empuja' ? 60 : 250); await foto(`${tag}_${clave}`); } }
      if (I.seDetiene && g.tipo === 'cierre' && !I.parado && !vistas.has(g.clave + '_lento')) { vistas.add(g.clave + '_lento'); await page.waitForTimeout(500); await foto(`${tag}_${g.clave}_lento`); continue; }
      if (I.ctl === 'c') {      // Clásico
        if (I.fase === 'pelea' || I.fase === 'traba') { const p = I.pelea; if (((p.P < 1e6 && p.aguja < p.exi + 55) || (!p.trabado && p.E < p.exiTraba + 150)) && s.ahora - ult >= 150) { await toque(); ult = s.ahora; } else await page.waitForTimeout(10); }
        else if (I.fase === 'fijacion' && !I.apretado) { await baja(); await page.waitForTimeout(30); }
        else if (I.objetivo !== null) { await irA(I.objetivo); if (I.accion === 'baja') { await baja(); if (I.fase === 'vuelo' || I.fase === 'empuje') { await page.waitForTimeout(40); await sube(); } else { await page.waitForTimeout(250); await foto(`${tag}_mantiene`); } } else await sube(); await page.waitForTimeout(16); }
        else await page.waitForTimeout(15);
        continue;
      }
      if (I.parado) { await page.waitForTimeout(700); await toque(); await page.waitForTimeout(120); if (g.tipo === 'cierre') await foto(`${tag}_${g.clave}_palabra`); continue; }
      if (g.tipo === 'libre') { await page.waitForTimeout(900); await toque(); continue; }
      if (g.tipo === 'cierre') { const kk = g.clave + g.desde; if (I.seDetiene || hecho === kk || o.sin === g.clave) { await page.waitForTimeout(15); continue; } await irA(g.objetivo + (o.atraso || 0)); await toque(); hecho = kk; await page.waitForTimeout(110); if (!vistas.has(g.clave + '_pal')) { vistas.add(g.clave + '_pal'); await foto(`${tag}_${g.clave}_palabra`); } continue; }
      if (g.tipo === 'empuja') { if (s.ahora - ult >= 160) { await toque(); ult = s.ahora; } else await page.waitForTimeout(10); continue; }
      await page.waitForTimeout(15);
    }
  }
  const veredicto = async tag => { await hasta(() => !document.getElementById('veredicto').hidden); await page.waitForTimeout(350); await foto(tag); };

  await page.goto(`${base}juego.html?semilla=7&q=${tel ? 'movil' : 'alta'}${clasico ? '&ctl=c' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 90000 });
  console.log(`[${via}] ${await page.evaluate(() => { const g = JUEGO.escena.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })}`);
  await page.waitForTimeout(1500); await foto('inicio');
  if (clasico) {
    await ok(); await hasta(() => JUEGO.estado().pantalla === 'metronomo'); await page.waitForTimeout(600);
    if (tel) await page.locator('#btn-saltear').tap(); else { await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); }
    await hasta(() => JUEGO.estado().pantalla === 'practica' && JUEGO.estado().panel); await page.waitForTimeout(1500); await foto('practica_panel');
    await ok(); await intento('practica'); await veredicto('practica_veredicto');
    await ctx.close(); return;
  }
  if (!tel) { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200); await foto('inicio_foco_con_flechas'); await page.keyboard.press('h'); await page.waitForTimeout(300); await foto('ayuda'); await page.keyboard.press('h'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); await foto('pausa'); await page.keyboard.press('Escape'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); }
  if (tel) await page.locator('#btn-empezar').tap(); else { await page.keyboard.press('Tab'); await page.evaluate(() => document.getElementById('btn-empezar').focus()); await page.keyboard.press('Enter'); }
  await hasta(() => JUEGO.estado().pantalla === 'tutorial' && JUEGO.estado().panel, null, 90000); await page.waitForTimeout(2000); await foto('tutorial_panel');
  await ok(); await intento('guiado'); await veredicto('guiado_veredicto');
  // práctica 1: primero sin tocar la explosión (para ver la línea de fallo), después bien
  await hasta(() => JUEGO.estado().pantalla === 'practica' && JUEGO.estado().panel); await page.waitForTimeout(900); await foto('practica1_panel');
  await ok(); await intento('falla', { sin: 'explota' }); await veredicto('falla_veredicto');
  await hasta(() => JUEGO.estado().pantalla === 'practica' && JUEGO.estado().panel); await page.waitForTimeout(900); await foto('falla_reintentar');
  await ok(); await intento('practica1', { mitad: true }); await veredicto('practica1_veredicto');
  // práctica 2: dos tiempos, con un toque tarde en la recepción de arriba
  await hasta(() => JUEGO.estado().pantalla === 'practica' && JUEGO.estado().panel); await page.waitForTimeout(900); await foto('practica2_panel');
  await ok(); await intento('practica2', { mitad: true, atraso: 150 }); await veredicto('practica2_veredicto');
  await hasta(() => JUEGO.estado().pantalla === 'tutorial' && JUEGO.estado().panel); await page.waitForTimeout(900); await foto('tutorial_listo');
  // la final: presentación, panel del llamado y el primer intento
  await ok(); await hasta(() => JUEGO.estado().pantalla === 'presentacion' && JUEGO.estado().panel); await page.waitForTimeout(900); await foto('presentacion');
  if (!tel) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150); }
  await ok();
  for (let k = 0; k < 400; k++) {      // los rivales que salgan antes
    const s = await E(); if (s.pantalla === 'llamado' && s.panel) break;
    if (['resumen', 'decision', 'carga', 'repeticion'].includes(s.pantalla)) await toque(); await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900); await foto('llamado_panel');
  await ok(); await intento('final', { mitad: true }); await veredicto('final_veredicto');
  await ctx.close();
}
try { for (const via of ['escritorio', 'telefono', 'clasico'].filter(v => !ONLY || v === ONLY)) { console.log(`== ${via} ==`); await recorrido(via); } }
catch (e) { console.log('excepción: ' + (e.stack || e.message)); process.exitCode = 1; }
await browser.close(); server.close();
console.log('capturas en ' + OUT);
