// Prueba con navegador de las métricas, la grabación de sesión y la privacidad (docs/MVP.md 6.1, 6.6 y 5.2). Corre en
// GitHub Actions (flujo «Servidor y publicación»); no hace falta GPU. Uso: node tools/check_analitica.mjs
//  1. Con un Worker falso en el mismo servidor (/api/estado con clave pública, /qx/* que anota lo que llega):
//     posthog-js vendorizado arranca, manda los eventos por /qx (nunca a un dominio de PostHog), identifica con lista_id,
//     y después de todo no queda ninguna cookie ni clave de almacenamiento con «ph_» (posthog-js también usa nombres como
//     __ph_opt_in_out_<clave>).
//  2. Sin clave: PostHog ni se descarga.
//  3. web/privacidad.html: idioma (inglés por defecto aunque el navegador esté en español, ?lang=, botones), responsable y contacto completos (sin marcadores), la grabación de
//     sesión explicada en los dos idiomas, interruptor de la medición (manda
//     medicion_desactivada por /qx y deja tarima.medicion=0), formulario de baja contra /api/baja, sin la promesa de pago,
//     la encuesta opcional de dos preguntas explicada y las novedades sin frecuencia.
//  4. A 390x844 (teléfono parado) y a 844x390 (acostado) la privacidad no se desplaza de costado.
//  5. Grabación de sesión (docs/MVP.md 6.6), en una página de prueba con campos, el nombre del jugador en pantalla, un
//     lienzo y una «señal» que cambia en cada cuadro: con `grabacion=todas` se graba por /qx/s/ (grabador del propio
//     sitio, sin pedir nada a PostHog), los campos, el nombre y los correos van tapados, el texto de la interfaz se lee,
//     el lienzo y la señal quedan como cajas vacías (ni imagen ni una mutación por cuadro). Muestreo: `off` no descarga el
//     grabador, `tercio` graba según el sorteo, y con la medición desactivada no hay ni PostHog.
//  6. El juego de verdad (?dibujo=0) hasta el final del primer intento propio, con y sin grabación: mutaciones del DOM,
//     eventos del grabador, cuadros y tareas largas DURANTE el intento. Falla si el grabador manda más de
//     MAX_MUT_S mutaciones por segundo en el intento o si el nombre del jugador aparece en la grabación. Los cuadros se
//     informan (con dibujo por software no dicen mucho) y se comparan las dos corridas.
//  7. El lienzo 3D en la grabación (LIF-45, bandera `grabacion_lienzo`): en la página de prueba (sin escena del juego)
//     no sale ningún cuadro del lienzo (los carteles con el nombre no se pueden ubicar: falla cerrada); en el juego
//     dibujado (por software) hasta el final del primer intento propio, con el lienzo y sin él: cuadros del lienzo que
//     llegan, KB por segundo, cuadros negros, lo que cuesta cada captura en el hilo principal (createImageBitmap y
//     regionesLienzo), cuadros y tareas largas. Guarda algunos cuadros en out/analitica/lienzo_*.png para mirarlos.
//     Grabando el lienzo, los carteles del 3D dicen «LIFTING GAME» cuando levanta el jugador (y entonces no se tapa nada);
//     sin el lienzo, su nombre.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { saltarRival } from './saltar_rival.mjs';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.bin': 'application/octet-stream' };
const CLAVE = 'phc_PruebaDeCheckAnalitica123';
const AGENTE = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const LISTA_ID = 'c'.repeat(32);
// Eventos de mutación por segundo que puede mandar el grabador durante un intento. El juego dibuja ~60 cuadros por segundo:
// un nodo que cambia en cada cuadro y no está bloqueado lo pasa enseguida; los cambios por señal o por toque, no.
const MAX_MUT_S = 20;
const NOMBRE = 'Zoraida', ESCRITO = 'Wilfredo', CORREO = 'secreto@ejemplo.com', LIBRE = 'respuesta libre muy secreta';

let conClave = true;
let flagGrab = 'off';                 // bandera `grabacion` que devuelve /api/estado
let flagLienzo = 'off';               // bandera `grabacion_lienzo` (las secciones 5 y 6 miden la página sola)
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

// Eventos de rrweb de los $snapshot que llegaron a /qx/s/. posthog-js comprime con gzip (en cadenas latin1) el cuerpo de
// las instantáneas completas y los campos de las mutaciones (cv 2024-10): acá se abren.
const abrirGz = x => (typeof x === 'string' ? JSON.parse(zlib.gunzipSync(Buffer.from(x, 'latin1')).toString('utf8')) : x);
function abrirRrweb(e) {
  if (!e || typeof e !== 'object' || !e.cv) return e;
  try {
    if (e.type === 2) return { ...e, data: abrirGz(e.data) };
    if (e.type === 3 && e.data) { const d = { ...e.data }; for (const k of ['texts', 'attributes', 'removes', 'adds']) d[k] = abrirGz(d[k]); return { ...e, data: d }; }
  } catch { return { ...e, ilegible: true }; }
  return e;
}
const rrwebDe = desde => llegadas.slice(desde).filter(l => l.ruta.startsWith('/qx/s')).flatMap(l => l.eventos)
  .filter(e => e.event === '$snapshot').flatMap(e => [].concat(e.props.$snapshot_data || e.props.$snapshot_items || [])).map(abrirRrweb);
// Nodos serializados de una instantánea completa (para mirar lienzos y bloqueos).
function nodos(n, out = []) { if (n && typeof n === 'object') { out.push(n); for (const c of n.childNodes || []) nodos(c, out); } return out; }
const esMutacion = e => e.type === 3 && e.data?.source === 0;
// Un cuadro del lienzo: mutación de lienzo (source 9) con un drawImage de un Blob (lo que manda el grabador a pocos cuadros por segundo).
const esCuadroLienzo = e => e.type === 3 && e.data?.source === 9;
const base64DeCuadro = e => { for (const c of e.data?.commands || []) { const b = c?.args?.[0]?.args?.[0]?.data?.[0]?.base64; if (b) return { b64: b, tipo: c.args[0].args[0].type || 'image/webp' }; } return null; };
// De qué nodo de la página (el id propio o el del antepasado más cercano con id) es cada nodo de la grabación.
function mapaNodos(ev) {
  const m = new Map();
  const visitar = (n, padre) => {
    if (!n || typeof n !== 'object') return;
    const d = n.attributes?.id ? '#' + n.attributes.id : (padre ?? n.tagName ?? '?');
    if (n.id != null) m.set(n.id, d);
    for (const c of n.childNodes || []) visitar(c, d);
  };
  for (const e of ev) {
    if (e.type === 2) visitar(e.data?.node, null);
    else if (esMutacion(e)) for (const a of e.data.adds || []) visitar(a.node, m.get(a.parentId));
  }
  return m;
}
// Qué nodos movieron las mutaciones grabadas: «#zona class», «#reloj texto»…
function quienGrabo(ev, mut) {
  const m = mapaNodos(ev), out = {};
  const sumar = k => { out[k] = (out[k] || 0) + 1; };
  for (const e of mut) {
    for (const t of e.data.texts || []) sumar(`${m.get(t.id) ?? '?'} texto`);
    for (const a of e.data.attributes || []) sumar(`${m.get(a.id) ?? '?'} ${Object.keys(a.attributes || {}).join('+')}`);
    for (const a of e.data.adds || []) sumar(`${m.get(a.parentId) ?? '?'} agrega`);
    for (const r of e.data.removes || []) sumar(`${m.get(r.parentId) ?? '?'} quita`);
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 6);
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
        dispositivo: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', puede: true, quedan: null, lista: true, lista_id: LISTA_ID, encuesta_disponible: false,
        flags: { 'muro-partidas-gratis': '2', 'muro-texto': 'b', 'invitacion-podio1': 'on', grabacion: flagGrab, grabacion_lienzo: flagLienzo },
        contexto: { pais: 'UY', previas: 1, dias: '0' },
        metricas: conClave ? { clave: CLAVE, host: '/qx', ui: 'https://us.posthog.com' } : null,
      }));
      return;
    }
    if (u.pathname === '/api/baja') { bajas.push(JSON.parse(b.toString('utf8') || '{}')); res.writeHead(202, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (u.pathname === '/api/partida') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ estado: 'ok', fuente: 'local', pase: null, quedan: null })); return; }
    if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (u.pathname.startsWith('/qx/')) {
      llegadas.push({ ruta: u.pathname, eventos: req.method === 'POST' ? eventosDe(req, b) : [], cookie: req.headers.cookie || '', bytes: b.length });
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
a.ev('muro_visto', { motivo: 'dispositivo', caminos: 'mail', origen: 'podio', variante_texto: a.bandera('muro-texto') });
a.identificar('${LISTA_ID}');
a.ev('anotar_respuesta', { estado: 'nuevo', pantalla: 'muro', finales_previas: 2 });
a.encuestaVista({ momento: 'tras_arranque' });
a.ev('encuesta_enviada', { momento: 'tras_arranque', plataforma: 'app', features: 2, otra: true });
window.__sesion = a.idSesion();
window.__listo = true;
</script>`);
      return;
    }
    if (u.pathname === '/__grabacion.html') {
      // Como la bienvenida del juego: el título sigue al nombre mientras se escribe, saludo con el nombre guardado,
      // campos de correo y respuesta libre, un lienzo y una señal que cambia dos estilos por cuadro.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>grabación</title><link rel="icon" href="data:,">
<style>#senal{position:fixed;top:8px;right:8px;width:90px;height:90px;background:#123}#gl{width:128px;height:72px}</style>
<h1 id="pesista-t">Elige tu pesista</h1><p id="ui">Juega la final contra dos rivales</p><p id="saludo"></p>
<label>Nombre <input id="nombre" type="text" maxlength="20"></label><label>Correo <input id="correo" type="email"></label>
<textarea id="q5" rows="2"></textarea><canvas id="gl" width="128" height="72"></canvas>
<div id="senal"><div class="cierra">TIRA</div></div><button id="jugar" type="button">Jugar</button>
<input id="viejo" type="text" value="${NOMBRE}"><p class="sugerencia"><button id="sug" type="button" data-v="${CORREO}" title="Perfil de ${NOMBRE}">¿Quisiste decir…?</button></p>
<script type="module">
// Como la bienvenida del juego (value="\${S.nombre}") y el correo de la lista: campos que se vacían con el atributo del
// HTML todavía puesto, y la sugerencia de correo en data-v. Se agregan otra vez después de arrancar (camino de mutación).
document.getElementById('viejo').value = '';
const tardio = () => { const d = document.createElement('div'); d.innerHTML = '<input id="viejo2" type="email" value="${CORREO}"><span id="sug2" data-v="${CORREO}" aria-label="Hola ${NOMBRE}">x</span>'; document.body.appendChild(d); d.querySelector('input').value = ''; };
import { crearServidor } from './js/game/servidor.js';
import { crearAnalitica } from './js/game/analitica.js';
const q = new URLSearchParams(location.search);
const c = document.getElementById('gl').getContext('2d'); c.fillStyle = '#e33'; c.fillRect(0, 0, 128, 72);
document.getElementById('saludo').textContent = 'Hola de nuevo, ' + (localStorage.getItem('tarima.nombre') || '');
const inp = document.getElementById('nombre');
// El título muestra el nombre limpio, como el juego (limpiarNombre de main.js): «Wilfredo.» → «Wilfredo».
const limpiar = v => [...v.normalize('NFC')].filter(c => /[\p{L}\p{M} '’-]/u.test(c)).join('').replace(/\s+/g, ' ').trim();
inp.addEventListener('input', () => { document.getElementById('pesista-t').textContent = 'Elige tu pesista, ' + limpiar(inp.value); });
window.__mut = 0;
new MutationObserver(r => { window.__mut += r.length; }).observe(document.getElementById('senal'), { subtree: true, attributes: true });
window.__animar = ms => new Promise(res => {
  const el = document.querySelector('#senal .cierra'), t0 = performance.now(); let n = 0;
  const f = t => { const k = Math.max(0, t - t0) / ms; el.style.transform = 'scale(' + (1 + k).toFixed(3) + ')'; el.style.opacity = (1 - k / 2).toFixed(2); n++; if (t - t0 < ms) requestAnimationFrame(f); else res(n); };
  requestAnimationFrame(f);
});
const s = crearServidor(), a = crearAnalitica({ azar: () => Number(q.get('azar') ?? 0) });
const e = await s.estado({ idioma: 'es' });
window.__activa = await a.iniciar({ estado: e, idioma: 'es', idioma_origen: 'url', version: 'prueba', pantalla: 'bienvenida' });
window.__grabando = a.grabando();
window.__lienzo = a.grabandoLienzo();
setTimeout(tardio, 200);
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
  // Además mira navigator.webdriver (true bajo Playwright) y las marcas de userAgentData («HeadlessChrome»).
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true });
  });
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
const pedidos1 = [];
{
  const { ctx, page } = await pagina();
  page.on('request', r => pedidos1.push(r.url()));
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
  for (const ev of ['juego_abierto', 'muro_visto', 'anotar_respuesta', 'encuesta_vista', 'encuesta_enviada']) ok(nombres.includes(ev), `llegó ${ev} por /qx`);
  ok(!nombres.some(n => /^survey /.test(n)), 'sin eventos de la API de Surveys de PostHog');
  ok(nombres.includes('$identify') || eventos.some(e => e.props.distinct_id === LISTA_ID || e.props.$user_id === LISTA_ID), 'identify con lista_id');
  const todo = JSON.stringify(eventos);
  ok(!todo.includes('NoDebeSalir') && !todo.includes('no@debe.salir'), 'ni el nombre ni el correo llegan a PostHog');
  const abierto = eventos.find(e => e.event === 'juego_abierto');
  ok(abierto && abierto.props.idioma === 'es' && abierto.props.pais === 'UY' && abierto.props['$feature/muro-texto'] === 'b', 'súper propiedades y banderas en el evento de la cola');
  ok(eventos.every(e => !e.clave || e.clave === CLAVE), 'los eventos van con la clave pública del proyecto');
  ok(llegadas.every(l => !/ph_/.test(l.cookie)), 'no viajan cookies de PostHog');
  ok(!llegadas.some(l => /^\/qx\/(static|array)\//.test(l.ruta)), 'no se descargan scripts extra de PostHog');
  ok(!llegadas.some(l => /^\/qx\/s\//.test(l.ruta)) && !pedidos1.some(u => /lazy-recorder/.test(u)), 'grabacion=off: ni grabador ni grabación');
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
  // Inglés por defecto aunque el navegador esté en español (locale es-AR) y sin idioma guardado.
  await page.evaluate(() => localStorage.removeItem('tarima.idioma'));
  await page.goto(base + 'privacidad.html');
  ok(await page.locator('article[lang=en]').isVisible() && !(await page.locator('article[lang=es]').isVisible()) && (await page.evaluate(() => document.documentElement.lang)) === 'en', 'sin ?lang= ni idioma guardado, la privacidad abre en inglés (navegador en español)');
  ok(await page.locator('[data-lang=es]').isVisible(), 'con el botón ES a la vista');
  {
    const en = await page.locator('article[lang=en]').innerText();
    ok(/two-question survey/.test(en) && /optional/i.test(en) && !/once a month/i.test(en), 'en inglés: la encuesta opcional de dos preguntas y las novedades sin frecuencia');
  }
  await page.goto(base + 'privacidad.html?lang=es');
  const html = await page.content();
  ok(!/nunca vas a pagar|never pay to lift/i.test(html), 'sin la promesa de pago');
  ok(!/PENDIENTE\]|PENDING\]|data-completar/.test(html) && (html.match(/mailto:[^"']+@/g) || []).length >= 6, 'responsable y contacto completos en los dos idiomas, sin marcadores pendientes');
  ok(await page.locator('article[lang=es]').isVisible() && !(await page.locator('article[lang=en]').isVisible()), '?lang=es muestra el español');
  ok(/16 años/.test(await page.locator('article[lang=es]').innerText()), 'edad mínima de 16 en español');
  ok(/Estados Unidos/.test(await page.locator('article[lang=es]').innerText()) && /HMAC/.test(html) && /tdv/.test(html), 'PostHog en EE. UU., HMAC de la IP y cookie técnica');
  ok(!/\bvos\b|tenés|podés|querés|anotate|escribinos/i.test(await page.locator('article[lang=es]').innerText()), 'español sin voseo');
  {
    const es = await page.locator('article[lang=es] [data-grabacion]').innerText(), en = await page.locator('article[lang=en] [data-grabacion]').textContent();
    ok(/una de cada tres/.test(es) && /tapados/.test(es) && /correo/.test(es) && /one in three/.test(en) && /blanked out/.test(en),
      'la privacidad explica la grabación en los dos idiomas: proporción y campos tapados');
    // LIF-45: el 3D se graba (por defecto en computadoras) con los carteles del nombre tapados; ya no se promete lo contrario
    ok(/grabamos la imagen 3D/.test(es) && /solo en computadoras/.test(es) && /carteles[^.]*no muestran tu nombre[^.]*LIFTING GAME/.test(es) && !/No grabamos la imagen 3D/.test(es)
      && /record the 3D picture/.test(en) && /only on computers/.test(en) && /don't show your name[^.]*LIFTING GAME/.test(en) && !/don't record the 3D/i.test(en),
      'la privacidad dice que se graba el 3D (por defecto en computadoras) con los carteles diciendo LIFTING GAME en vez del nombre');
    ok(/2026-11-g/.test(await page.locator('article[lang=es] .version').innerText()), 'la privacidad está en la versión 2026-11-g');
    const txt = await page.locator('article[lang=es]').innerText();
    // el texto de la encuesta sigue a la regla que se publica (worker/wrangler.jsonc): con ENCUESTA_LIBRE "1" (LIF-53) desbloquea el juego libre; con "0" es opcional y no da nada
    const encuestaLibre = /"ENCUESTA_LIBRE":\s*"1"/.test((await import('node:fs')).readFileSync(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8'));
    ok(/dos preguntas/.test(txt) && (encuestaLibre ? /jugar sin límite/.test(txt) : /no da ni quita nada/.test(txt) && !/jugar sin límite/.test(txt)) && !/una por mes|al mes/.test(txt) && !/encuesta[^.]*finales/i.test(txt), encuestaLibre ? 'en español: la encuesta de dos preguntas, que desbloquea el juego libre (LIF-53), sin finales de premio, y las novedades sin frecuencia' : 'en español: la encuesta de dos preguntas, opcional y que no da ni quita nada, sin finales de premio, y las novedades sin frecuencia');
  }
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

// ---- 5. grabación de sesión en una página de prueba ----
const sinRastros = async (ctx, page, que) => {
  const r = await rastros(ctx, page);
  ok(!r.cookies.some(n => /ph_/i.test(n)) && !r.claves.some(k => /ph_|rrweb/i.test(k)), `${que}: sin cookies ni almacenamiento de PostHog (${[...r.cookies, ...r.claves].join(', ') || 'nada'})`);
};
async function paginaGrabacion({ flag, azar = 0, medicion = true }) {
  flagGrab = flag;
  const { ctx, page } = await pagina();
  const pedidos = [];
  page.on('request', r => pedidos.push(r.url()));
  await ctx.addInitScript(([n, m]) => { try { localStorage.setItem('tarima.nombre', n); if (!m) localStorage.setItem('tarima.medicion', '0'); } catch { /* nada */ } }, [NOMBRE, medicion]);
  const desde = llegadas.length;
  await page.goto(base + `__grabacion.html?azar=${azar}`);
  await page.waitForFunction(() => window.__listo === true, null, { timeout: 20000 });
  const r = await page.evaluate(() => ({ activa: window.__activa, grabando: window.__grabando, lienzo: window.__lienzo }));
  return { ctx, page, pedidos, desde, ...r, grabador: () => pedidos.some(u => /vendor\/posthog\/lazy-recorder\.js/.test(u)) };
}
{
  const g = await paginaGrabacion({ flag: 'todas', azar: 0.99 });
  ok(g.activa && g.grabando && g.grabador(), `todas: graba y el grabador sale del propio sitio (activa ${g.activa}, grabando ${g.grabando})`);
  // clic (para PostHog es una interacción), el nombre letra por letra (el título lo sigue), correo y respuesta libre
  await g.page.click('#jugar');
  // con un punto y un emoji al final: el campo dice «Wilfredo. 🙂», el título «Wilfredo» (tiene que salir tapado igual)
  await g.page.type('#nombre', ESCRITO + '.', { delay: 40 });
  await g.page.waitForTimeout(400);
  await g.page.type('#nombre', ' 🙂', { delay: 40 });
  await g.page.fill('#correo', CORREO);
  await g.page.fill('#q5', LIBRE);
  await g.page.waitForTimeout(300);
  const t0 = Date.now();
  const cuadros = await g.page.evaluate(ms => window.__animar(ms), 3000);
  const t1 = Date.now();
  const crudas = await g.page.evaluate(() => window.__mut);
  await g.page.waitForTimeout(3500);
  await g.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await g.page.waitForTimeout(1500);
  await sinRastros(g.ctx, g.page, 'con grabación');
  const ev = rrwebDe(g.desde), todo = JSON.stringify(ev);
  const completas = ev.filter(e => e.type === 2 && !e.ilegible);
  ok(completas.length > 0 && ev.some(e => e.type === 4), `llegó la grabación por /qx/s/ (${ev.length} eventos de rrweb, ${completas.length} instantáneas completas)`);
  ok(!ev.some(e => e.ilegible), 'la prueba pudo abrir todos los eventos comprimidos');
  for (const [txt, que] of [[NOMBRE, 'el nombre guardado'], [ESCRITO, 'el nombre que se escribe'], [CORREO, 'el correo'], ['secreto@', 'el correo (parte)'], [LIBRE, 'la respuesta libre']]) ok(!todo.includes(txt), `${que} no aparece en la grabación`);
  ok(['"viejo"', '"sug"', '"viejo2"', '"sug2"'].every(x => todo.includes(x)) && /data-v/.test(todo),
    'están grabados los campos vaciados con value en el HTML y la sugerencia con data-v (tapados: la línea de arriba)');
  ok(todo.includes('Juega la final contra dos rivales') && todo.includes('Jugar'), 'el texto de la interfaz se lee en la grabación');
  ok(!/rr_dataURL|data:image\//.test(todo), 'ni un cuadro del lienzo en la grabación');
  const n = completas.flatMap(e => nodos(e.data?.node));
  const lienzos = n.filter(x => x.tagName === 'canvas');
  ok(lienzos.length > 0 && lienzos.every(x => x.attributes?.rr_width && !x.attributes?.id), `el lienzo queda como caja vacía (${JSON.stringify(lienzos.map(x => x.attributes))})`);
  ok(!todo.includes('TIRA') && !n.some(x => x.attributes?.id === 'senal'), 'la señal queda como caja vacía (bloqueada)');
  const mutAnim = ev.filter(e => esMutacion(e) && e.timestamp >= t0 && e.timestamp <= t1);
  ok(mutAnim.length <= 3, `la señal que cambia en cada cuadro no llega al grabador: ${crudas} mutaciones del DOM en ${cuadros} cuadros, ${mutAnim.length} eventos de mutación grabados`);
  ok(!llegadas.slice(g.desde).some(l => /^\/qx\/(static|array|flags|decide)/.test(l.ruta)), `no se pide nada más a PostHog (${[...new Set(llegadas.slice(g.desde).map(l => l.ruta))].join(' ')})`);
  await g.ctx.close();
}
{
  // Con el lienzo prendido pero sin la escena del juego: regionesLienzo no encuentra los carteles y el grabador no manda
  // ningún cuadro del lienzo (falla cerrada); el lienzo ya no va bloqueado (se ve su nodo, sin imagen).
  flagLienzo = 'todas';
  const g = await paginaGrabacion({ flag: 'todas', azar: 0.99 });
  flagLienzo = 'off';
  ok(g.grabando && g.lienzo, `lienzo=todas: graba la página y el lienzo (grabando ${g.grabando}, lienzo ${g.lienzo})`);
  await g.page.evaluate(ms => window.__animar(ms), 2500);
  await g.page.waitForTimeout(3000);
  await g.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await g.page.waitForTimeout(1500);
  const ev = rrwebDe(g.desde), todo = JSON.stringify(ev);
  const n = ev.filter(e => e.type === 2 && !e.ilegible).flatMap(e => nodos(e.data?.node));
  ok(n.some(x => x.tagName === 'canvas' && x.attributes?.id === 'gl'), 'lienzo=todas: el lienzo ya no va bloqueado');
  ok(!ev.some(esCuadroLienzo) && !/rr_dataURL|data:image\//.test(todo), `lienzo=todas sin la escena del juego: ningún cuadro del lienzo (${ev.filter(esCuadroLienzo).length})`);
  ok(!todo.includes(NOMBRE) && !todo.includes('TIRA'), 'lienzo=todas: el nombre sigue tapado y la señal bloqueada');
  await g.ctx.close();
}
{
  const g = await paginaGrabacion({ flag: 'tercio', azar: 0.5 });
  ok(g.activa && !g.grabando && !g.grabador(), `tercio con sorteo 0,5: mide sin grabar ni descargar el grabador (grabando ${g.grabando})`);
  await g.ctx.close();
}
{
  const g = await paginaGrabacion({ flag: 'tercio', azar: 0.2 });
  ok(g.activa && g.grabando && g.grabador(), `tercio con sorteo 0,2: graba (grabando ${g.grabando})`);
  await g.ctx.close();
}
{
  const g = await paginaGrabacion({ flag: 'off', azar: 0 });
  ok(g.activa && !g.grabando && !g.grabador(), 'off: mide sin grabar ni descargar el grabador');
  await g.ctx.close();
}
{
  const g = await paginaGrabacion({ flag: 'todas', azar: 0, medicion: false });
  await g.page.waitForTimeout(1500);
  ok(!g.activa && !g.grabando && !g.grabador() && !g.pedidos.some(u => /vendor\/posthog|\/qx\//.test(u)) && llegadas.length === g.desde, 'medición desactivada: ni PostHog ni grabador ni nada a /qx, aunque la bandera diga todas');
  await g.ctx.close();
}

// ---- 6. el juego de verdad: costo de la grabación durante el intento ----
async function interactuarJuego(page) {
  const J = fn => page.evaluate(fn);
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const espacio = async () => { await page.keyboard.down('Space'); await dormir(35); await page.keyboard.up('Space'); };
  let tA = null, tB = null, ultSalto = 0, clic = false, hecho = '';
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 4 * 60000) { mal('juego: no se llegó al final del primer intento propio en 4 minutos'); break; }
    const s = await J(() => { const e = JUEGO.estado(); e.propios = (JUEGO.E.propios || []).length; return e; });
    if (s.errores.length) { mal('juego: ' + s.errores[0]); break; }
    const I = s.intento;
    if (I && I.propio) { if (tA === null) tA = Date.now(); }
    else if (tA !== null && tB === null) tB = Date.now();
    if (tB !== null && s.propios >= 1) break;
    if (I && I.propio && s.modo !== 'panel') {
      const g = I.senal;
      if (!g) { await dormir(8); continue; }
      if (g.tipo === 'barra') { const falta = g.objetivo - s.ahora - 25; if (falta > 0) await dormir(Math.min(falta, 3000)); await espacio(); continue; }      // 'b': en el verde
      if (UNTOQUE.has(g.tipo)) { await dormir(200); await espacio(); continue; }
      if (g.tipo === 'cierre') { const kk = g.clave + g.desde; if (I.seDetiene || hecho === kk) { await dormir(8); continue; } const falta = g.objetivo - s.ahora - 25; if (falta > 0) await dormir(Math.min(falta, 2000)); await espacio(); hecho = kk; continue; }
      if (g.tipo === 'empuja') { for (let i = 0; i < 6; i++) { await espacio(); await dormir(40); } continue; }
      await dormir(10); continue;
    }
    if (s.panel && !s.sobre) {
      // el primer botón con el ratón (para PostHog es una interacción), después con Enter como la otra prueba
      if (!clic && await page.locator('#capa .panel button.ir:not(:disabled)').count()) { clic = true; await dormir(400); await page.locator('#capa .panel button.ir:not(:disabled)').first().click({ timeout: 120000 }); await dormir(300); continue; }      // con el 3D por software y tres modelos distintos (plantel nuevo), compilar al abrir pasa de 30 s
      const P = await J(() => { const ir = document.querySelector('#capa .panel button.ir:not(:disabled)'); return { ir: !!ir, foco: document.activeElement === ir }; });
      if (P.ir) { await dormir(400); if (!P.foco) await J(() => document.querySelector('#capa .panel button.ir:not(:disabled)')?.focus()); await page.keyboard.press('Enter'); await dormir(300); continue; }
    }
    if (['rival', 'decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado'].includes(s.pantalla) && Date.now() - ultSalto > 1500) { if (!await saltarRival(page)) await espacio(); ultSalto = Date.now(); continue; }
    await dormir(30);
  }
  return { tA, tB };
}
const pct = (xs, p) => { if (!xs.length) return 0; const o = [...xs].sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.floor(p * o.length))]; };
async function partida(flag, { lienzo = 'off', dibujo = false } = {}) {
  flagGrab = flag; flagLienzo = lienzo;
  const { ctx, page } = await pagina();
  await ctx.addInitScript(n => {
    try { if (!sessionStorage.getItem('__t')) { localStorage.setItem('tarima.tutorial', '1'); localStorage.setItem('tarima.jugadas', '1'); localStorage.setItem('tarima.visto.tarjeta', '1'); localStorage.setItem('tarima.nombre', n); sessionStorage.setItem('__t', '1'); } } catch { /* nada */ }
    // mutaciones del DOM (lo que observa el grabador), cuadros y tareas largas, con la hora del reloj de pared
    window.__mut = []; window.__raf = []; window.__lt = [];
    const desc = x => { const el = x.nodeType === 1 ? x : x.parentElement; const c = el?.closest?.('[id]'); return (c ? '#' + c.id : el?.tagName || '?'); };
    new MutationObserver(rs => { const t = Date.now(); for (const r of rs) window.__mut.push([t, desc(r.target) + ' ' + r.type + (r.attributeName ? ':' + r.attributeName : '')]); })
      .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const f = t => { window.__raf.push(performance.timeOrigin + t); requestAnimationFrame(f); }; requestAnimationFrame(f);
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([performance.timeOrigin + e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* sin longtask */ }
    // lo que cuesta en el hilo principal pedir cada captura del lienzo (la parte síncrona de createImageBitmap)
    // LIF-45: lo que muestran los carteles del 3D cuando levanta el jugador («LIFTING GAME» si se graba el lienzo)
    setInterval(() => { const b = window.JUEGO?.escena?.arena?.board; if (b?.jugador) { window.__cartelYo = { name: b.name, entero: !!b.entero }; if (!b.entero) window.__cartelYoNombre = b.name; } }, 150);
    window.__cib = [];
    const cib = window.createImageBitmap;
    window.createImageBitmap = function (...a) { const t = performance.now(); try { return cib.apply(this, a); } finally { window.__cib.push([Date.now(), performance.now() - t, a[0]?.id || a[0]?.constructor?.name || '?']); } };
  }, NOMBRE);
  const desde = llegadas.length;
  await page.goto(base + `juego.html?lang=es${dibujo ? '' : '&dibujo=0'}&q=baja&semilla=20261112`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 90000 });
  const { tA, tB } = await interactuarJuego(page);
  // Lo que costaría la instantánea completa que posthog-js vuelve a tomar cada 5 minutos (puede caer en un intento).
  const instantanea = await page.evaluate(() => {
    const rec = window.__PosthogExtensions__?.rrweb?.record;
    if (!rec?.takeFullSnapshot) return null;
    const ms = [];
    for (let i = 0; i < 3; i++) { const t = performance.now(); rec.takeFullSnapshot(); ms.push(performance.now() - t); }
    return ms.map(x => +x.toFixed(1));
  });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(([a, b]) => ({
    mut: window.__mut.filter(x => x[0] >= a && x[0] <= b).map(x => x[1]),
    raf: window.__raf.filter(t => t >= a && t <= b),
    lt: window.__lt.filter(x => x[0] >= a && x[0] <= b).map(x => x[1]),
    cib: window.__cib.filter(x => x[0] >= a && x[0] <= b).map(x => [x[1], x[2]]),
    preservar: window.JUEGO?.escena?.renderer?.getContext?.()?.getContextAttributes?.()?.preserveDrawingBuffer ?? null,
    cartelYo: window.__cartelYo || null, cartelYoNombre: window.__cartelYoNombre || null,
  }), [tA ?? 0, tB ?? 0]);
  // lo que tarda regionesLienzo (los carteles proyectados) con la escena de este momento
  const reg = !dibujo ? null : await page.evaluate(async () => {
    const A = await import('/js/game/analitica.js'), c = document.getElementById('gl'), e = window.JUEGO.escena;
    // con el cartel como si mostrara el nombre del jugador (el respaldo): se mide y se ubican los carteles
    const b = e.arena.board; e.arena.board = { ...b, jugador: true, entero: false };
    let r = null; const t = performance.now();
    try { for (let i = 0; i < 200; i++) r = A.regionesLienzo(c, e); } finally { e.arena.board = b; }
    const ahora = A.regionesLienzo(c, e);
    return { ms: (performance.now() - t) / 200, n: r.length, r, ancho: c.clientWidth, alto: c.clientHeight, ahora: ahora.length, cartel: { name: b?.name, jugador: b?.jugador, entero: b?.entero } };
  }).catch(e => ({ error: String(e) }));
  const ev = rrwebDe(desde);
  const seg = Math.max(0.001, ((tB ?? 0) - (tA ?? 0)) / 1000);
  const dt = m.raf.slice(1).map((t, i) => t - m.raf[i]);
  const quien = {}; for (const d of m.mut) quien[d] = (quien[d] || 0) + 1;
  const r = {
    flag, seg, ev, instantanea, bytes: llegadas.slice(desde).filter(l => l.ruta.startsWith('/qx/s')).reduce((a, l) => a + l.bytes, 0),
    mutDom: m.mut.length, top: Object.entries(quien).sort((a, b) => b[1] - a[1]).slice(0, 6),
    mutGrab: ev.filter(e => esMutacion(e) && e.timestamp >= tA && e.timestamp <= tB).length,
    topGrab: quienGrabo(ev, ev.filter(e => esMutacion(e) && e.timestamp >= tA && e.timestamp <= tB)),
    cuadros: m.raf.length, p50: pct(dt, 0.5), p95: pct(dt, 0.95), lentos: dt.filter(x => x > 33).length, lt: m.lt.length, ltMs: Math.round(m.lt.reduce((a, b) => a + b, 0)),
    cib: m.cib, preservar: m.preservar, reg, cartelYo: m.cartelYo, cartelYoNombre: m.cartelYoNombre, dibujo, lienzo, page,
    lienzoCuadros: ev.filter(esCuadroLienzo), lienzoIntento: ev.filter(e => esCuadroLienzo(e) && e.timestamp >= tA && e.timestamp <= tB),
  };
  r.lienzoBytes = r.lienzoCuadros.reduce((a, e) => a + (base64DeCuadro(e)?.b64.length || 0) * 0.75, 0);
  console.log(`  juego, grabacion=${flag}: intento de ${seg.toFixed(1)} s · ${r.mutDom} mutaciones del DOM (${(r.mutDom / seg).toFixed(0)}/s; ${r.top.map(([k, v]) => `${k} ${v}`).join(', ')}) · ` +
    `al grabador ${r.mutGrab} (${(r.mutGrab / seg).toFixed(1)}/s; ${r.topGrab.map(([k, v]) => `${k} ${v}`).join(', ') || 'nada'}) · cuadros ${r.cuadros}, p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, >33 ms ${r.lentos} · tareas largas ${r.lt} (${r.ltMs} ms) · instantánea completa ${r.instantanea ? r.instantanea.join(', ') + ' ms' : '—'} · /qx/s/ ${(r.bytes / 1024).toFixed(1)} KB en toda la carga`);
  if (!dibujo) await ctx.close(); else r.ctx = ctx;
  return r;
}
{
  const con = await partida('todas');
  const sin = await partida('off');
  const todo = JSON.stringify(con.ev);
  ok(con.ev.some(e => e.type === 2), 'juego: con grabacion=todas la carga se graba');
  ok(!sin.ev.length, 'juego: con grabacion=off no se graba nada');
  ok(!todo.includes(NOMBRE), `juego: el nombre del jugador no aparece en la grabación`);
  ok(!/rr_dataURL|data:image\//.test(todo), 'juego: ni un cuadro del 3D en la grabación');
  ok(con.mutGrab / con.seg <= MAX_MUT_S, `juego: durante el intento el grabador recibe ${(con.mutGrab / con.seg).toFixed(1)} mutaciones por segundo (tope ${MAX_MUT_S}; el DOM tuvo ${(con.mutDom / con.seg).toFixed(0)}/s)`);
  ok(con.instantanea && Math.max(...con.instantanea) < 50, `juego: una instantánea completa de la página cuesta ${con.instantanea?.join(', ')} ms (menos de 50)`);
  notas.push(`juego: cuadros durante el intento con grabación p95 ${con.p95.toFixed(1)} ms, >33 ms ${con.lentos}, tareas largas ${con.lt}; sin grabación p95 ${sin.p95.toFixed(1)} ms, >33 ms ${sin.lentos}, tareas largas ${sin.lt}`);
}

// ---- 7. el lienzo 3D en la grabación, con el juego dibujado (por software) ----
// Los tiempos de SwiftShader no son los de una placa: lo que dice algo es la diferencia entre las dos corridas y el
// costo de cada captura en el hilo principal.
{
  const sin = await partida('todas', { lienzo: 'off', dibujo: true });
  const con = await partida('todas', { lienzo: 'compu', dibujo: true });
  const seg = con.seg;
  const cibGl = con.cib.filter(x => x[1] === 'gl').map(x => x[0]);
  const fps = con.lienzoIntento.length / seg, kbs = con.lienzoIntento.reduce((a, e) => a + (base64DeCuadro(e)?.b64.length || 0) * 0.75, 0) / 1024 / seg;
  // los cuadros grabados, abiertos en la página: tamaño, brillo (un cuadro negro sería el lienzo leído sin dibujar) y algunos guardados
  const muestras = con.lienzoIntento.length ? con.lienzoIntento : con.lienzoCuadros;
  const elegidos = [0, 0.25, 0.5, 0.75, 1].map(k => muestras[Math.min(muestras.length - 1, Math.floor(k * (muestras.length - 1)))]).filter(Boolean);
  const vistos = await con.page.evaluate(async cs => {
    const out = [];
    for (const { b64, tipo } of cs) {
      const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: tipo }));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, neg = 0;
      for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; if (l < 4) neg++; }
      out.push({ w: bmp.width, h: bmp.height, brillo: s / (d.length / 16), negro: neg / (d.length / 16) });
    }
    return out;
  }, con.lienzoCuadros.map(base64DeCuadro).filter(Boolean)).catch(e => [{ error: String(e) }]);
  const negros = vistos.filter(v => v.brillo !== undefined && v.negro > 0.97).length;
  const vistosElegidos = await con.page.evaluate(async cs => Promise.all(cs.map(async ({ b64, tipo }) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], { type: tipo }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return c.toDataURL('image/png');
  })), elegidos.map(base64DeCuadro).filter(Boolean)).catch(() => []);
  fs.mkdirSync(path.join(ROOT, 'out', 'analitica'), { recursive: true });
  vistosElegidos.forEach((png, i) => fs.writeFileSync(path.join(ROOT, 'out', 'analitica', `lienzo_${i}.png`), Buffer.from(png.split(',')[1], 'base64')));
  try { await con.page.screenshot({ path: path.join(ROOT, 'out', 'analitica', 'lienzo_pagina.png') }); } catch { /* nada */ }
  const todo = JSON.stringify(con.ev);
  console.log(`  lienzo: preserveDrawingBuffer ${con.preservar} · ${con.lienzoCuadros.length} cuadros en la carga, ${con.lienzoIntento.length} en el intento de ${seg.toFixed(1)} s (${fps.toFixed(2)} por segundo) · ` +
    `${vistos[0]?.w ?? '?'}×${vistos[0]?.h ?? '?'} px, ${(con.lienzoBytes / Math.max(1, con.lienzoCuadros.length) / 1024).toFixed(1)} KB por cuadro, ${kbs.toFixed(1)} KB/s en el intento, ${(con.lienzoBytes / 1024).toFixed(0)} KB en la carga · negros ${negros} de ${vistos.length} · ` +
    `createImageBitmap(#gl) ${cibGl.length} veces, p50 ${pct(cibGl, 0.5).toFixed(2)} ms, máx ${Math.max(0, ...cibGl).toFixed(2)} ms · regionesLienzo ${con.reg?.ms?.toFixed?.(3) ?? con.reg?.error} ms (${con.reg?.n} rectángulos: ${JSON.stringify(con.reg?.r)} en ${con.reg?.ancho}×${con.reg?.alto})`);
  console.log(`  lienzo: cuadros del juego durante el intento: con lienzo p50 ${con.p50.toFixed(1)} ms, p95 ${con.p95.toFixed(1)} ms, >33 ms ${con.lentos} de ${con.cuadros}, tareas largas ${con.lt} (${con.ltMs} ms en ${con.seg.toFixed(1)} s); ` +
    `sin lienzo p50 ${sin.p50.toFixed(1)} ms, p95 ${sin.p95.toFixed(1)} ms, >33 ms ${sin.lentos} de ${sin.cuadros}, tareas largas ${sin.lt} (${sin.ltMs} ms en ${sin.seg.toFixed(1)} s)`);
  ok(!sin.lienzoCuadros.length, `grabacion_lienzo=off: ningún cuadro del lienzo (${sin.lienzoCuadros.length})`);
  ok(con.lienzoIntento.length >= 1, `grabacion_lienzo=compu en computadora: llegan cuadros del 3D durante el intento (${con.lienzoIntento.length})`);
  ok(fps <= 3.5, `pocos cuadros del lienzo por segundo: ${fps.toFixed(2)}`);
  ok(negros <= Math.max(1, vistos.length * 0.1), `cuadros negros (el lienzo leído sin dibujar): ${negros} de ${vistos.length}`);
  ok(con.reg && con.reg.n >= 1 && !con.reg.error, `los carteles con el nombre se ubican en la pantalla (respaldo; ${JSON.stringify(con.reg)})`);
  // LIF-45: grabando el lienzo, los carteles dicen LIFTING GAME cuando levanta el jugador y entonces no se tapa nada
  ok(con.cartelYo?.name === 'LIFTING GAME' && con.cartelYo.entero && !con.cartelYoNombre, `con el lienzo, los carteles del jugador dicen LIFTING GAME (${JSON.stringify(con.cartelYo)}, con nombre: ${con.cartelYoNombre})`);
  ok(!con.reg?.cartel?.entero || con.reg.ahora === 0, `con LIFTING GAME en los carteles no se tapa nada (${con.reg?.ahora} rectángulos)`);
  ok(sin.cartelYoNombre && sin.cartelYoNombre !== 'LIFTING GAME', `sin el lienzo, los carteles muestran el nombre del jugador (${sin.cartelYoNombre})`);
  ok(!todo.includes(NOMBRE), 'con el lienzo: el nombre del jugador no aparece como texto en la grabación');
  ok(!/rr_dataURL|data:image\//.test(todo), 'con el lienzo: ninguna instantánea completa con la imagen del lienzo sin tapar (rr_dataURL)');
  notas.push(`lienzo: ${con.lienzoIntento.length} cuadros en ${seg.toFixed(1)} s de intento, ${(con.lienzoBytes / 1024).toFixed(0)} KB en la carga, createImageBitmap p50 ${pct(cibGl, 0.5).toFixed(2)} ms`);
  await sin.ctx.close(); await con.ctx.close();
}

await browser.close();
server.close();
console.log(notas.map(n => '  bien: ' + n).join('\n'));
console.log(`check_analitica: ${problemas.length ? problemas.length + ' MAL' : 'todo bien'}`);
process.exit(problemas.length ? 1 : 0);
