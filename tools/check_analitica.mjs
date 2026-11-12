// Prueba con navegador de las métricas y la privacidad (docs/MVP.md 6.1 y 5.2). Corre en GitHub Actions (flujo «Pruebas
// del juego»); no hace falta GPU. Uso: node tools/check_analitica.mjs
//  1. Con un Worker falso en el mismo servidor (/api/estado con clave pública, /qx/* que anota lo que llega):
//     posthog-js vendorizado arranca, manda los eventos por /qx (nunca a un dominio de PostHog), identifica con lista_id,
//     y después de todo no queda ninguna cookie ni clave de almacenamiento con «ph_» (posthog-js también usa nombres como
//     __ph_opt_in_out_<clave>).
//  2. Sin clave: PostHog ni se descarga.
//  3. web/privacidad.html: idioma (?lang=, botones), marcadores de contacto pendiente, interruptor de la medición (manda
//     medicion_desactivada por /qx y deja tarima.medicion=0), formulario de baja contra /api/baja, y sin la promesa de pago.
//  4. A 390x844 (teléfono parado) y a 844x390 (acostado) la privacidad no se desplaza de costado.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2' };
const CLAVE = 'phc_PruebaDeCheckAnalitica123';
const AGENTE = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const LISTA_ID = 'c'.repeat(32);

let conClave = true;
const llegadas = [];   // lo que recibió /qx
const bajas = [];

function eventosDe(req, cuerpo) {
  const u = new URL(req.url, 'http://x');
  let txt = null;
  try {
    if (u.searchParams.get('compression') === 'gzip-js' || (cuerpo[0] === 0x1f && cuerpo[1] === 0x8b)) txt = zlib.gunzipSync(cuerpo).toString('utf8');
    else txt = cuerpo.toString('utf8');
    if (/^data=/.test(txt)) txt = Buffer.from(decodeURIComponent(txt.slice(5)), 'base64').toString('utf8');
    const j = JSON.parse(txt);
    const lista = Array.isArray(j) ? j : Array.isArray(j.batch) ? j.batch : [j];
    return lista.map(e => ({ event: e.event, props: e.properties || {}, clave: e.api_key || j.api_key || e.token || e.properties?.token }));
  } catch { return [{ event: '(no se pudo leer)', props: {}, txt: String(txt).slice(0, 80) }]; }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cuerpo = [];
  req.on('data', c => cuerpo.push(c));
  req.on('end', () => {
    const b = Buffer.concat(cuerpo);
    if (u.pathname === '/api/estado') {
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'tdv=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee; Path=/api; HttpOnly; SameSite=Strict' });
      res.end(JSON.stringify({
        dispositivo: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', puede: true, quedan: null, lista: true, lista_id: LISTA_ID, encuesta_disponible: true,
        flags: { 'muro-partidas-gratis': '2', 'muro-texto': 'b', 'invitacion-podio1': 'on', grabacion: 'off' },
        contexto: { pais: 'UY', previas: 1, dias: '0' },
        metricas: conClave ? { clave: CLAVE, host: '/qx', ui: 'https://us.posthog.com', encuesta: 'encuesta-prueba' } : null,
      }));
      return;
    }
    if (u.pathname === '/api/baja') { bajas.push(JSON.parse(b.toString('utf8') || '{}')); res.writeHead(202, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (u.pathname.startsWith('/qx/')) {
      llegadas.push({ ruta: u.pathname, eventos: req.method === 'POST' ? eventosDe(req, b) : [], cookie: req.headers.cookie || '' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(u.pathname.startsWith('/qx/flags') ? '{"flags":{}}' : '{"status":1}');
      return;
    }
    if (u.pathname === '/__prueba.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>prueba</title><link rel="icon" href="data:,"><script type="module">
import { crearServidor } from './js/game/servidor.js';
import { crearAnalitica } from './js/game/analitica.js';
const s = crearServidor(), a = crearAnalitica();
window.__a = a;
a.ev('juego_abierto', { carga_ms: 5, pantalla_inicial: 'bienvenida', nombre: 'NoDebeSalir', email: 'no@debe.salir' });
const e = await s.estado({ idioma: 'es' });
window.__activa = await a.iniciar({ estado: e, idioma: 'es', idioma_origen: 'url', version: 'prueba', pantalla: 'bienvenida' });
a.visita('muro');
a.ev('muro_visto', { motivo: 'dispositivo', caminos: 'mail+encuesta', origen: 'podio', variante_texto: a.bandera('muro-texto') });
a.identificar('${LISTA_ID}');
a.ev('anotar_ok', { estado: 'nuevo', pantalla: 'muro', finales_previas: 2 });
a.encuestaVista({ con_premio: true });
window.__sesion = a.idSesion();
window.__listo = true;
</script>`);
      return;
    }
    const rel = decodeURIComponent(u.pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const problemas = [], notas = [];
const mal = m => { problemas.push(m); console.log('  MAL: ' + m); };
const ok = (c, m) => { if (!c) mal(m); else notas.push(m); };
const browser = await chromium.launch(launchOptions());

async function pagina(o = {}) {
  // posthog-js descarta los eventos de navegadores que se anuncian como robots («HeadlessChrome»): en producción es lo que
  // se quiere; acá se usa el agente de un Chrome común para ver qué manda.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-AR', userAgent: AGENTE, ...o });
  const page = await ctx.newPage();
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()} (${m.location()?.url || ''})`); });
  page.on('response', r => { if (r.status() >= 400 && !/\/baja/.test(r.url())) mal(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { const url = r.url(); if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) mal(`pedido externo: ${url}`); });
  return { ctx, page };
}

async function rastros(ctx, page) {
  const cookies = (await ctx.cookies()).map(c => c.name);
  const claves = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
  return { cookies, claves };
}

// ---- 1. con clave ----
{
  const { ctx, page } = await pagina();
  await page.goto(base + '__prueba.html');
  await page.waitForFunction(() => window.__listo === true, null, { timeout: 20000 });
  ok(await page.evaluate(() => window.__activa) === true, 'con clave, PostHog arranca');
  // posthog-js junta los eventos y los manda cada pocos segundos; al ocultar la página se vacía la cola.
  await page.waitForTimeout(5000);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(1500);
  const r = await rastros(ctx, page);
  ok(!r.cookies.some(n => /ph_/i.test(n)), `sin cookies de PostHog (cookies: ${r.cookies.join(', ') || 'ninguna'})`);
  ok(!r.claves.some(k => /ph_/i.test(k)), `sin almacenamiento de PostHog (claves: ${r.claves.join(', ') || 'ninguna'})`);
  ok(r.cookies.every(n => n === 'tdv'), 'la única cookie es la técnica tdv');
  const eventos = llegadas.flatMap(l => l.eventos);
  const nombres = eventos.map(e => e.event);
  ok(llegadas.length > 0, `llegaron pedidos a /qx (${llegadas.map(l => l.ruta).join(' ')})`);
  for (const ev of ['juego_abierto', 'muro_visto', 'anotar_ok', 'survey shown']) ok(nombres.includes(ev), `llegó ${ev} por /qx`);
  ok(nombres.includes('$identify') || eventos.some(e => e.props.distinct_id === LISTA_ID || e.props.$user_id === LISTA_ID), 'identify con lista_id');
  const todo = JSON.stringify(eventos);
  ok(!todo.includes('NoDebeSalir') && !todo.includes('no@debe.salir'), 'ni el nombre ni el correo llegan a PostHog');
  const abierto = eventos.find(e => e.event === 'juego_abierto');
  ok(abierto && abierto.props.idioma === 'es' && abierto.props.pais === 'UY' && abierto.props['$feature/muro-texto'] === 'b', 'súper propiedades y banderas en el evento de la cola');
  ok(eventos.every(e => !e.clave || e.clave === CLAVE), 'los eventos van con la clave pública del proyecto');
  ok(llegadas.every(l => !/ph_/.test(l.cookie)), 'no viajan cookies de PostHog');
  ok(!llegadas.some(l => /^\/qx\/(static|array)\//.test(l.ruta)), 'no se descargan scripts extra de PostHog');
  if (!nombres.length) notas.push('rutas que llegaron a /qx: ' + llegadas.map(l => l.ruta).join(' '));
  await ctx.close();
}

// ---- 2. sin clave ----
{
  conClave = false;
  const { ctx, page } = await pagina();
  const pedidos = [];
  page.on('request', r => pedidos.push(r.url()));
  await page.goto(base + '__prueba.html');
  await page.waitForFunction(() => window.__listo === true, null, { timeout: 20000 });
  ok(await page.evaluate(() => window.__activa) === false, 'sin clave, PostHog no arranca');
  ok(!pedidos.some(u => /vendor\/posthog/.test(u)), 'sin clave, posthog-js ni se descarga');
  ok((await page.evaluate(() => window.JUEGO.eventos.map(e => e.ev))).includes('muro_visto'), 'sin clave, los eventos quedan en window.JUEGO.eventos');
  await ctx.close();
  conClave = true;
}

// ---- 3. privacidad ----
{
  const { ctx, page } = await pagina();
  // Primero el juego de prueba en la misma pestaña, para que quede la clave pública (como al venir desde el juego).
  await page.goto(base + '__prueba.html');
  await page.waitForFunction(() => window.__listo === true, null, { timeout: 20000 });
  const antes = llegadas.length;
  await page.goto(base + 'privacidad.html?lang=es');
  const html = await page.content();
  ok(!/nunca vas a pagar|never pay to lift/i.test(html), 'sin la promesa de pago');
  ok((await page.locator('[data-completar="contacto"]').count()) >= 4, 'marcadores de contacto pendiente en los dos idiomas');
  ok(await page.locator('article[lang=es]').isVisible() && !(await page.locator('article[lang=en]').isVisible()), '?lang=es muestra el español');
  ok(/16 años/.test(await page.locator('article[lang=es]').innerText()), 'edad mínima de 16 en español');
  ok(/Estados Unidos/.test(await page.locator('article[lang=es]').innerText()) && /HMAC/.test(html) && /tdv/.test(html), 'PostHog en EE. UU., HMAC de la IP y cookie técnica');
  ok(!/\bvos\b|tenés|podés|querés|anotate|escribinos/i.test(await page.locator('article[lang=es]').innerText()), 'español sin voseo');
  await page.click('article[lang=es] [data-medicion-boton]');
  ok(await page.evaluate(() => localStorage.getItem('tarima.medicion')) === '0', 'el interruptor apaga la medición');
  ok(/desactivada/.test(await page.locator('article[lang=es] [data-medicion-valor]').innerText()), 'el interruptor dice «desactivada»');
  await page.waitForTimeout(800);
  ok(llegadas.slice(antes).flatMap(l => l.eventos).some(e => e.event === 'medicion_desactivada'), 'manda medicion_desactivada antes de apagar');
  await page.click('article[lang=es] [data-medicion-boton]');
  ok(await page.evaluate(() => localStorage.getItem('tarima.medicion')) === null, 'y lo vuelve a prender');
  await page.fill('#baja-es', 'mal');
  await page.click('article[lang=es] [data-baja] button[type=submit]');
  ok(/no parece completo/.test(await page.locator('article[lang=es] [data-baja-resultado]').innerText()), 'baja: correo mal escrito');
  await page.fill('#baja-es', 'ana@ejemplo.com');
  await page.click('article[lang=es] [data-baja] button[type=submit]');
  await page.waitForFunction(() => /Listo/.test(document.querySelector('article[lang=es] [data-baja-resultado]').textContent), null, { timeout: 10000 });
  ok(bajas.at(-1)?.email === 'ana@ejemplo.com', 'baja: el formulario llama a /api/baja con el correo');
  await page.click('[data-lang=en]');
  ok(await page.locator('article[lang=en]').isVisible() && (await page.evaluate(() => document.documentElement.lang)) === 'en', 'el botón EN cambia el idioma');
  ok(await page.evaluate(() => localStorage.getItem('tarima.idioma')) === 'en', 'el idioma elegido queda guardado');
  ok((await page.getAttribute('[data-volver]', 'href')) === 'juego.html?lang=en', 'volver al juego conserva el idioma');
  await ctx.close();
}

// ---- 4. teléfono ----
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const { ctx, page } = await pagina({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(base + 'privacidad.html?lang=en');
  const ancho = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(ancho[0] <= ancho[1], `privacidad a ${vp.width}x${vp.height} sin desplazamiento lateral (${ancho.join(' ≤ ')})`);
  fs.mkdirSync(path.join(ROOT, 'out', 'analitica'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'out', 'analitica', `privacidad_${vp.width}x${vp.height}.png`) });
  await ctx.close();
}

await browser.close();
server.close();
console.log(notas.map(n => '  bien: ' + n).join('\n'));
console.log(`check_analitica: ${problemas.length ? problemas.length + ' MAL' : 'todo bien'}`);
process.exit(problemas.length ? 1 : 0);
