// Prueba de LIF-33 («se ven botones y stats pero no el levantador»): qué ve la persona cuando algo de la carga falla, en la
// computadora (1280 × 720, teclado) y en el teléfono acostado (844 × 390, táctil). Servidor estático propio con
// tools/sin_api.mjs (sin Worker ni PostHog: los eventos se miran en window.JUEGO.eventos).
//  1. modulo: three.core.js no baja nunca → la página se recarga sola 2 veces y después el aviso «No pudimos descargar el
//     juego» con «Probar de nuevo» (y carga_fallida etapa 'modulo', intentos 3). Con la red de vuelta, «Probar de nuevo»
//     abre el juego. Y si falla solo la primera vez, la recarga sola lo arregla sin aviso (reintentos_modulo 1).
//  2. modelo: los GLB no bajan → la bienvenida sale (bajan detrás), pero al tocar «Jugar» hay 3 intentos y el aviso de
//     descarga, nunca la interfaz sin el pesista; con la red de vuelta, «Probar de nuevo» sigue ahí mismo (presentación).
//  3. webgl: sin contexto WebGL → el aviso del 3D con qué probar (otro navegador, actualizar, salir de Facebook o Instagram,
//     la aceleración por hardware), sin ningún panel del juego; en el teléfono con el agente de Facebook, ese consejo primero.
//  4. shader: todo programa «no compila» (LINK_STATUS falso) → prueba la calidad Móvil y, como sigue, el aviso del 3D.
//  5. normal, con el 3D dibujado (por software): escena_visible al ver al pesista después de «Jugar».
// Capturas en out/carga_fallas/. Uso: node tools/check_carga_fallas.mjs [--solo=modulo|modelo|webgl|shader|normal] [--headed]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';
import ES from '../web/js/game/i18n/es.js';
import EN from '../web/js/game/i18n/en.js';
// modelos que el juego carga sin `?plantel=`: los clásicos si PLANTEL_DEFECTO es 'clasico', si no la terna nueva (web/js/game/roster.js)
const MODELOS_DEFECTO = /PLANTEL_DEFECTO = 'clasico'/.test((await import('node:fs')).readFileSync(new URL('../web/js/game/roster.js', import.meta.url), 'utf8')) ? 'brenner,ventura' : 'ilarraz,jastrev,kordan';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'carga_fallas');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SOLO = arg('solo'), HEADED = process.argv.includes('--headed');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'juego.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const problemas = [], notas = [];
const FB = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]';
const PANTALLAS = { compu: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, telefono: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } };

async function abrirCtx(nombre, extra = {}) {
  const ctx = await browser.newContext({ ...PANTALLAS[nombre], locale: 'en-US', ...extra });
  const page = await ctx.newPage(), J = (fn, a) => page.evaluate(fn, a);
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  return { ctx, page, J, errores };
}
const eventos = J => J(() => (window.JUEGO?.eventos || []).map(e => ({ ev: e.ev, props: e.props }))).catch(() => []);
/** El aviso a la vista: título, texto, consejos y botón; que tape la pantalla y no quede ningún panel del juego. */
const leerAviso = J => J(() => {
  const m = document.getElementById('msg'), c = document.getElementById('carga-aviso'), b = document.getElementById('btn-reintentar-carga');
  const r = b?.getBoundingClientRect();
  return { ve: !!c && !m.hidden && getComputedStyle(m).display !== 'none', titulo: document.getElementById('msg-txt')?.textContent || '', texto: c?.querySelector('.carga-aviso-texto')?.textContent || '', consejos: [...(c?.querySelectorAll('li') || [])].map(l => l.textContent), boton: b?.textContent || '',
    botonEntero: !!r && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, encima: !!r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b,
    paneles: document.querySelectorAll('#capa .panel').length, ancho: document.documentElement.scrollWidth > innerWidth + 1, falla: document.documentElement.dataset.falla || '' };
});
async function esperarAviso(page, J, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const a = await leerAviso(J).catch(() => null); if (a?.ve && a.boton) return a; await page.waitForTimeout(250); }
  return null;
}
function revisarAviso(tag, a, tipo, D = EN) {
  const mal = t => problemas.push(`${tag} ${t}`);
  if (!a) { mal(`no apareció el aviso de ${tipo}`); return; }
  if (a.titulo !== D[`falla.${tipo}.titulo`] || a.texto !== D[`falla.${tipo}.texto`] || a.boton !== D['conexion.reintentar']) mal(`el aviso de ${tipo} no dice lo que tiene que decir: ${JSON.stringify(a)}`);
  if (a.paneles) mal(`con el aviso de ${tipo} quedó un panel del juego a la vista`);
  if (!a.botonEntero || !a.encima) mal(`el botón «${a.boton}» no se ve entero o está tapado: ${JSON.stringify(a)}`);
  if (a.ancho) mal('el aviso desplaza la página de costado');
  if (tipo === 'webgl' && a.consejos.length !== 4) mal(`el aviso del 3D no trae los 4 consejos: ${JSON.stringify(a.consejos)}`);
}
const tocar = async (page, nombre) => { const b = page.locator('#btn-reintentar-carga'); if (nombre === 'telefono') await b.tap(); else { await b.focus(); await page.keyboard.press('Enter'); } };

// ---------- 1. el módulo de three no baja ----------
async function modulo(nombre) {
  const tag = `[modulo ${nombre}]`, { ctx, page, J } = await abrirCtx(nombre);
  let cargas = 0; page.on('load', () => cargas++);
  const bloquear = r => r.abort('failed');
  await page.route('**/vendor/three/build/three.core.js', bloquear);
  await page.goto(`${base}juego.html?dibujo=0&q=baja`, { waitUntil: 'load' });
  const a = await esperarAviso(page, J, 45000);
  await page.screenshot({ path: path.join(OUT, `modulo_${nombre}.png`) });
  revisarAviso(tag, a, 'descarga');
  if (cargas !== 3) problemas.push(`${tag} la página se cargó ${cargas} veces (se esperaban 3: la primera y 2 recargas solas)`);
  { const c = (await eventos(J)).filter(e => e.ev === 'carga_fallida'); if (c.length !== 1 || c[0].props.etapa !== 'modulo' || c[0].props.intentos !== 3 || c[0].props.tipo !== 'descarga') problemas.push(`${tag} carga_fallida: ${JSON.stringify(c)}`); }
  // la red vuelve: «Probar de nuevo» abre el juego
  await page.unroute('**/vendor/three/build/three.core.js', bloquear);
  await tocar(page, nombre);
  await page.waitForFunction(() => window.JUEGO?.listo, null, { timeout: 60000 }).catch(() => null);
  const ok = await J(() => window.JUEGO.listo).catch(() => false);
  await page.waitForTimeout(400);
  if (!ok || !await J(() => !!document.getElementById('btn-empezar'))) problemas.push(`${tag} con la red de vuelta, «Probar de nuevo» no abrió el juego`);
  await page.screenshot({ path: path.join(OUT, `modulo_${nombre}_de_vuelta.png`) });
  await ctx.close();
  // falla solo la primera vez: la recarga sola lo arregla, sin aviso
  const x = await abrirCtx(nombre); let n = 0;
  await x.page.route('**/vendor/three/build/three.core.js', r => (n++ === 0 ? r.abort('failed') : r.continue()));
  await x.page.goto(`${base}juego.html?dibujo=0&q=baja`, { waitUntil: 'load' });
  await x.page.waitForFunction(() => window.JUEGO?.test, null, { timeout: 60000 }).catch(() => null);
  const listo = await x.J(() => window.JUEGO.listo).catch(() => false);
  const j = (await eventos(x.J)).find(e => e.ev === 'juego_abierto')?.props;
  if (!listo || j?.reintentos_modulo !== 1 || await x.J(() => !!document.getElementById('carga-aviso'))) problemas.push(`${tag} con una sola falla, la recarga sola no lo arregló: ${JSON.stringify(j)}`);
  console.log(`${tag} aviso tras ${cargas} cargas · «${a?.titulo}» · de vuelta: ${ok ? 'juego abierto' : 'NO'} · una sola falla: reintentos_modulo ${j?.reintentos_modulo}`);
  await x.ctx.close();
}

// ---------- 2. los modelos no bajan ----------
async function modelo(nombre) {
  const tag = `[modelo ${nombre}]`, { ctx, page, J, errores } = await abrirCtx(nombre);
  let pedidos = 0; const bloquear = r => { pedidos++; return r.abort('failed'); };
  await page.route('**/models/*.glb', bloquear);
  await page.goto(`${base}juego.html?dibujo=0&q=baja&lang=es`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) problemas.push(`${tag} el juego no inició`);
  await page.waitForTimeout(500);
  const b = page.locator('#btn-empezar'); if (nombre === 'telefono') await b.tap(); else { await b.focus(); await page.keyboard.press('Enter'); }
  const a = await esperarAviso(page, J, 60000);
  await page.screenshot({ path: path.join(OUT, `modelo_${nombre}.png`) });
  revisarAviso(tag, a, 'descarga', ES);
  { const c = (await eventos(J)).filter(e => e.ev === 'carga_fallida'); if (c.length !== 1 || c[0].props.etapa !== 'modelo' || c[0].props.intentos !== 3 || !c[0].props.mensaje) problemas.push(`${tag} carga_fallida: ${JSON.stringify(c)}`); }
  const antes = pedidos;
  await page.unroute('**/models/*.glb', bloquear);
  await tocar(page, nombre);
  await page.waitForFunction(() => ['presentacion', 'apertura'].includes(window.JUEGO.estado().pantalla), null, { timeout: 90000 }).catch(() => null);
  const s = await J(() => ({ pantalla: JUEGO.estado().pantalla, modelos: Object.keys(JUEGO.escena.atletas).sort().join(','), aviso: !!document.getElementById('carga-aviso') }));
  await page.screenshot({ path: path.join(OUT, `modelo_${nombre}_de_vuelta.png`) });
  if (s.pantalla !== 'presentacion' || s.modelos !== MODELOS_DEFECTO || s.aviso) problemas.push(`${tag} con la red de vuelta no siguió a la presentación: ${JSON.stringify(s)}`);
  if (errores.length) problemas.push(`${tag} errores sin atrapar: ${errores.slice(0, 3).join(' | ')}`);
  console.log(`${tag} ${antes} pedidos de GLB fallidos · «${a?.titulo}» · de vuelta: ${s.pantalla} con ${s.modelos}`);
  await ctx.close();
}

// ---------- 3. sin WebGL ----------
async function webgl(nombre, fb = false) {
  const tag = `[webgl ${nombre}${fb ? ' facebook' : ''}]`, { ctx, page, J } = await abrirCtx(nombre, fb ? { userAgent: FB } : {});
  await ctx.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (tipo, ...r) { return /webgl/i.test(tipo) ? null : orig.call(this, tipo, ...r); }; });
  await page.goto(`${base}juego.html?dibujo=0&q=baja`, { waitUntil: 'load' });
  const a = await esperarAviso(page, J, 30000);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `webgl_${nombre}${fb ? '_facebook' : ''}.png`) });
  revisarAviso(tag, a, 'webgl');
  if (fb && a?.consejos[0] !== EN['falla.webgl.app']) problemas.push(`${tag} dentro de Facebook el primer consejo no es salir de la app: ${JSON.stringify(a?.consejos)}`);
  { const c = (await eventos(J)).filter(e => e.ev === 'carga_fallida'); if (c.length !== 1 || c[0].props.etapa !== 'webgl' || !/WebGL/i.test(c[0].props.mensaje || '') || c[0].props.app !== (fb ? 'facebook' : null)) problemas.push(`${tag} carga_fallida: ${JSON.stringify(c)}`); }
  if (await J(() => !!document.getElementById('btn-empezar'))) problemas.push(`${tag} sin WebGL se ve la bienvenida`);
  console.log(`${tag} «${a?.titulo}» · consejos: ${a?.consejos.length}${fb ? ` (primero: «${a?.consejos[0]}»)` : ''}`);
  await ctx.close();
}

// ---------- 4. un programa del 3D que no compila ----------
async function shader(nombre) {
  const tag = `[shader ${nombre}]`, { ctx, page, J } = await abrirCtx(nombre);
  await ctx.addInitScript(() => {
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext].filter(Boolean)) {
      const orig = C.prototype.getProgramParameter;
      C.prototype.getProgramParameter = function (p, k) { return k === 0x8B82 ? false : orig.call(this, p, k); };      // LINK_STATUS
    }
  });
  page.on('console', m => { if (m.type() === 'error' && !/no compila/.test(m.text())) notas.push(`${tag} console.error: ${m.text().slice(0, 160)}`); });
  await page.goto(`${base}juego.html?q=baja`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO?.test, null, { timeout: 90000 }).catch(() => null);
  await page.waitForTimeout(800);
  // la bienvenida puede tardar en pintarse por software: sin esperarla, a veces «Jugar» todavía no estaba y la final no arrancaba
  await page.waitForSelector('#btn-empezar', { state: 'visible', timeout: 120000 }).catch(() => null);
  const b = page.locator('#btn-empezar'); if (await b.count()) { if (nombre === 'telefono') await b.tap(); else { await b.focus(); await page.keyboard.press('Enter'); } }
  const a = await esperarAviso(page, J, 420000);      // por software, cargar, calibrar y volver a compilar con la calidad «Móvil» puede pasar de 180 s en corridas lentas (hipótesis sin confirmar: en esas corridas el aviso no llegó a verse)
  await page.screenshot({ path: path.join(OUT, `shader_${nombre}.png`) });
  revisarAviso(tag, a, 'webgl');
  { const c = (await eventos(J)).filter(e => e.ev === 'carga_fallida'); if (!c.some(x => x.props.etapa === 'shader' && !x.props.recuperada)) problemas.push(`${tag} carga_fallida: ${JSON.stringify(c)}`); }
  console.log(`${tag} «${a?.titulo}»`);
  await ctx.close();
}

// ---------- 5. normal, con el 3D: escena_visible ----------
async function normal(nombre) {
  const tag = `[normal ${nombre}]`, { ctx, page, J, errores } = await abrirCtx(nombre);
  await page.goto(`${base}juego.html?q=baja`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) problemas.push(`${tag} el juego no inició`);
  await page.waitForTimeout(800);
  if ((await eventos(J)).some(e => e.ev === 'escena_visible')) problemas.push(`${tag} escena_visible antes de ver al pesista`);
  const b = page.locator('#btn-empezar'); if (nombre === 'telefono') await b.tap(); else { await b.focus(); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => (window.JUEGO.eventos || []).some(e => e.ev === 'escena_visible'), null, { timeout: 240000 }).catch(() => null);
  const v = (await eventos(J)).filter(e => e.ev === 'escena_visible');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `normal_${nombre}.png`) });
  if (v.length !== 1 || !(v[0].props.ms > 0) || !(v[0].props.ms_jugar > 0) || !v[0].props.calidad) problemas.push(`${tag} escena_visible: ${JSON.stringify(v)}`);
  if ((await eventos(J)).some(e => e.ev === 'carga_fallida')) problemas.push(`${tag} carga_fallida sin ninguna falla`);
  if (errores.length) problemas.push(`${tag} errores sin atrapar: ${errores.slice(0, 3).join(' | ')}`);
  console.log(`${tag} escena_visible a los ${v[0]?.props.ms} ms de la carga (${v[0]?.props.ms_jugar} ms desde «Jugar») · ${v[0]?.props.calidad}`);
  await ctx.close();
}

const CASOS = [['modulo', () => modulo('compu')], ['modulo', () => modulo('telefono')], ['modelo', () => modelo('compu')], ['modelo', () => modelo('telefono')],
  ['webgl', () => webgl('compu')], ['webgl', () => webgl('telefono', true)], ['shader', () => shader('compu')], ['normal', () => normal('compu')], ['normal', () => normal('telefono')]];
for (const [k, f] of CASOS.filter(c => !SOLO || c[0] === SOLO)) {
  try { await f(); } catch (e) { problemas.push(`[${k}] excepción de la prueba: ${e.stack || e.message}`); }
}
await browser.close(); server.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 40)) console.log('  ' + p); process.exit(1); }
console.log(`\nOK: avisos de descarga, de módulo y del 3D, reintentos y escena_visible · capturas en ${path.relative(ROOT, OUT)}`);
