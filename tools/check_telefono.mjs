// Prueba del juego en un teléfono emulado (táctil, isMobile): se juega DE COSTADO con el botón bajo el pulgar.
//  - De costado (844 × 390 a densidad 3 con las áreas seguras de un iPhone, y 667 × 375 a densidad 2): una partida jugada
//    solo con toques (el botón táctil para levantar, los botones de los paneles con el dedo), con el reloj inyectado. En
//    cada pantalla nueva, una captura y una revisión: la página no se desplaza, nada se sale de la pantalla ni de las áreas
//    seguras, el botón no tapa la señal, el zócalo ni el acuse, la señal no tapa el zócalo, y los paneles entran sin
//    cortar texto (si un panel necesita desplazarse, falla). Varios dedos a la vez cuentan como varios toques. También
//    844 × 340: el iPhone en Safari con la barra de direcciones a la vista (el iPhone no deja pantalla completa).
//  - Campos: al tocar un campo de texto (nombre, correo) se abre el editor de arriba (#editor, telefono.js), derecho y
//    dentro de lo visible, con «Listo»; Espacio y Enter son del campo (no cuentan como toques ni activan botones) y el
//    texto vuelve entero al campo del panel.
//  - Mano izquierda (?mano=izq): el botón va a la izquierda sin tapar nada.
//  - Parado (LIF-50): 390 × 844 (iPhone, con muesca y barra de inicio; una final entera solo con el pulgar), 375 × 667 en
//    inglés (hasta el cartel de anotarse, con ?muro=firme&etapa=arranque) y 430 × 932. Sin girar nada (html.vert): el
//    botón redondo abajo al centro, la barrita encima, los paneles abajo. Además de lo de siempre: el botón principal de
//    cada panel queda al alcance del pulgar (mitad de abajo de la pantalla), y al girar el teléfono a horizontal y volver,
//    cada orientación usa su diseño. `?vertical=girado` deja el contenido girado como antes (no se prueba acá).
// Sin --dibujo el 3D no se dibuja solo (?dibujo=0, como check_game): antes de cada captura se fuerza un cuadro.
// Cuánto tapa la interfaz al pesista (tools/tapa.mjs) en el llamado, con la barrita quieta y corriendo, en el levantamiento, en el
// veredicto y en el turno de un rival, por tamaño de pantalla (tabla al final y out/telefono/tapa.json). Falla
// si se pasa del umbral (cuerpo ≤ 15 % durante la barrita y el levantamiento, torso ≤ 20 % en el llamado).
// Uso: node tools/check_telefono.mjs [--headed] [--solo=nombre] [--capturas=out/telefono] [--dibujo]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';
import { saltarRival } from './saltar_rival.mjs';
import { medirEnPagina, fila, revisar as revisarTapa, estadoEnPagina, seguidor } from './tapa.mjs';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SOLO = (arg('solo') || '').split(',').filter(Boolean), HEADED = process.argv.includes('--headed'), DIBUJO = process.argv.includes('--dibujo'), OUT = path.resolve(ROOT, arg('capturas') || 'out/telefono');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;      // /api/estado y /api/partida: juego sin límite (tools/sin_api.mjs)
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const problemas = [], notas = [], TAPA = [], PANEL = [], PULGAR = [], INFORMA = process.env.TAPA_INFORMA === '1';      // TAPA_INFORMA=1: solo informa (para medir un antes)
// LIF-31: alto del panel del llamado con el detalle plegado (teléfono acostado, 'b'): ≤ 38 % del alto de la pantalla, y cada
// botón a la vista del panel con 40 px de alto o más (el toque en el teléfono).
// PANEL_INFORMA=1: solo informa (para medir un antes)
const PANEL_TOPE = .38, PANEL_TOPE_V = .4, BOTON_MIN = 40, PANEL_INFORMA = process.env.PANEL_INFORMA === '1';
const browser = await chromium.launch(launchOptions({ headed: HEADED }));

const CASOS = [
  { nombre: 'iphone_844x390', w: 844, h: 390, dpr: 3, seguras: { top: 0, right: 47, bottom: 21, left: 47 }, partida: true, campos: true, dedos: true },
  { nombre: 'android_667x375', w: 667, h: 375, dpr: 2, partida: true },
  { nombre: 'zurdo_740x360', w: 740, h: 360, dpr: 3, url: '&mano=izq', hastaIntentos: 2 },
  // iPhone en Safari de costado, con la barra de direcciones a la vista: quedan unos 340 px de alto
  { nombre: 'safari_844x340', w: 844, h: 340, dpr: 3, seguras: { top: 0, right: 47, bottom: 21, left: 47 }, hastaIntentos: 2 },
  { nombre: 'android_932x430', w: 932, h: 430, dpr: 3, hastaPropios: 2, falla: 2, lang: 'en' },      // en inglés (LIF-52: las explicaciones de primera vez en los dos idiomas)
  // LIF-50: parado, sin girar el contenido
  { nombre: 'vertical_390x844', w: 390, h: 844, dpr: 3, vertical: true, partida: true, dedos: true, seguras: { top: 47, right: 0, bottom: 34, left: 0 } },
  { nombre: 'vertical_375x667', w: 375, h: 667, dpr: 2, vertical: true, lang: 'en', url: '&muro=firme&etapa=arranque', hastaPantalla: 'muro' },
  { nombre: 'vertical_430x932', w: 430, h: 932, dpr: 3, vertical: true, hastaPropios: 2, falla: 2, seguras: { top: 59, right: 0, bottom: 34, left: 0 } },
];

async function correr(C) {
  const tag = `[${C.nombre}]`, dir = path.join(OUT, C.nombre); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: C.w, height: C.h }, deviceScaleFactor: C.dpr, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  const mal = txt => { const m = `${tag} ${txt}`; if (!problemas.includes(m)) problemas.push(m); };
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  page.on('requestfailed', r => (/\.glb$/.test(r.url()) && r.failure()?.errorText === 'net::ERR_ABORTED' ? notas : problemas).push(`${tag} requestfailed: ${r.url().replace(base, '')} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) mal(`HTTP ${r.status()}: ${r.url()}`); });
  // áreas seguras de un iPhone de costado (la muesca a los costados, la barra de inicio abajo), si este Chrome deja emularlas
  let seguras = { top: 0, right: 0, bottom: 0, left: 0 };
  if (C.seguras) {
    try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: C.seguras }); seguras = C.seguras; }
    catch (e) { notas.push(`${tag} este Chrome no emula áreas seguras (${e.message.split('\n')[0]}): se revisan sin muesca`); }
  }
  const J = (fn, a) => page.evaluate(fn, a);
  let nFoto = 0;
  const foto = async nombre => {
    if (!DIBUJO) await J(() => { try { window.JUEGO?.escena?.cuadro?.(0, true); } catch (e) { console.error('cuadro forzado para la captura: ' + (e.stack || e)); } }).catch(() => null);
    const f = `${String(++nFoto).padStart(2, '0')}_${nombre.replace(/[^\w.-]+/g, '_').slice(0, 60)}.png`;
    await page.screenshot({ path: path.join(dir, f) }).catch(() => null); return f;
  };

  await page.goto(`${base}juego.html?lang=${C.lang || 'es'}&semilla=20261112&dibujo=${DIBUJO ? 1 : 0}${C.url || ''}`, { waitUntil: 'load' });
  const S0 = await J(() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.append(p); const c = getComputedStyle(p), r = { top: parseFloat(c.paddingTop), right: parseFloat(c.paddingRight), bottom: parseFloat(c.paddingBottom), left: parseFloat(c.paddingLeft) }; p.remove(); return { seguras: r, tactil: matchMedia('(pointer:coarse)').matches }; });
  if (!S0.tactil) mal('la emulación no da puntero grueso: la prueba no sirve');
  if (C.seguras && S0.seguras.left !== C.seguras.left) { notas.push(`${tag} áreas seguras pedidas ${JSON.stringify(C.seguras)}, la página ve ${JSON.stringify(S0.seguras)}`); seguras = S0.seguras; }

  // ---------- parado (LIF-50): sin girar nada, con el diseño vertical ----------
  if (C.vertical) {
    const v = await J(() => { const h = document.documentElement.classList, app = document.getElementById('app'); return { vert: h.contains('vert'), rotado: h.contains('rotado'), horiz: h.contains('horiz'), tf: getComputedStyle(app).transform, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollWidth > innerWidth + 1, pie: getComputedStyle(document.documentElement).getPropertyValue('--pie-v'), boton: getComputedStyle(document.documentElement).getPropertyValue('--boton-v') }; });
    console.log(`${tag} parado: html.vert ${v.vert}, rotado ${v.rotado}, botón ${v.boton}, pie ${v.pie}`);
    if (!v.vert || v.rotado || v.horiz || v.tf !== 'none') mal(`parado: no quedó el diseño vertical (${JSON.stringify(v)})`);
    if (v.scroll) mal('parado: la página se desplaza');
  }

  if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
  await J(() => JUEGO.test.manual());

  // ---------- entrada: dedos sobre el botón (o sobre el escenario si un panel con botones lo esconde) ----------
  const zonaBox = () => page.locator('#zona').boundingBox();
  const punto = async () => { const b = await zonaBox(); return b ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), boton: true } : { x: Math.round(seguras.left + 4), y: Math.round(C.h / 2), boton: false }; };
  let enBoton = 0, fueraBoton = 0;
  const baja = async (id = 1) => { const p = await punto(); if (p.boton) enBoton++; else fueraBoton++; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id }] }); };
  const sube = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const av = ms => J(ms => JUEGO.test.avanzar(ms), ms), ir = t => J(t => JUEGO.test.hasta(t, 8), t);
  const toque = async () => { await baja(); await av(30); await sube(); };
  const pulsa = async sel => { const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible()) || !(await l.isEnabled())) return false; await l.tap(); return true; };

  // ---------- revisión de lo que se ve ----------
  const revisar = async donde => {
    const R = await J(seg => {
      const $ = id => document.getElementById(id), W = innerWidth, H = innerHeight, se = document.scrollingElement;
      const ve = el => { if (!el || el.hidden) return false; for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && +getComputedStyle(el).opacity > 0; };
      const caja = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const cruza = (a, b) => a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
      const o = { scroll: se.scrollWidth > W + 1 || se.scrollHeight > H + 1 || scrollX !== 0 || scrollY !== 0, fuera: [], seguras: [], cruces: [], panel: null, zona: ve($('zona')) };
      const ids = ['seguir', 'zona', 'senal', 'barrita', 'margen', 'zocalo', 'acuse', 'guia', 'veredicto', 'cartel', 'rival', 'etiqueta', 'pausa', 'ayudab', 'sonidob', 'saltar', 'turno', 'marcador', 'tablero', 'saltar-rival', 'aprende'], B = {};
      for (const id of ids) if (ve($(id))) B[id] = caja($(id));
      for (const k of ['bug', 'relojbox']) { const el = document.querySelector('.' + k); if (ve(el)) B[k] = caja(el); }
      for (const [id, b] of Object.entries(B)) {
        if (b.l < -1 || b.t < -1 || b.r > W + 1 || b.b > H + 1) o.fuera.push(`${id} ${Math.round(b.l)},${Math.round(b.t)}-${Math.round(b.r)},${Math.round(b.b)}`);
        // lo que se toca o se lee no va debajo de la muesca ni de la barra de inicio (el veredicto y el cartel van centrados)
        if (!['veredicto', 'cartel'].includes(id) && (b.l < seg.left - 1 || b.r > W - seg.right + 1 || b.b > H - seg.bottom + 1)) o.seguras.push(id);
      }
      for (const [a, b] of [...(seg.vertical ? [['seguir', 'zona'], ['seguir', 'saltar-rival'], ['seguir', 'veredicto'], ['seguir', 'acuse'], ['veredicto', 'zona'], ['barrita', 'acuse'], ['senal', 'acuse'], ['tablero', 'guia'], ['aprende', 'seguir'], ['tablero', 'saltar'], ['saltar', 'pausa'], ['saltar', 'sonidob'], ['margen', 'saltar']] : []), ['zona', 'barrita'], ['barrita', 'zocalo'], ['barrita', 'guia'], ['barrita', 'margen'], ['zona', 'senal'], ['zona', 'zocalo'], ['zona', 'acuse'], ['zona', 'guia'], ['zona', 'rival'], ['zona', 'pausa'], ['zona', 'saltar'], ['zona', 'sonidob'], ['sonidob', 'pausa'], ['sonidob', 'bug'], ['sonidob', 'senal'], ['ayudab', 'relojbox'], ['senal', 'zocalo'], ['senal', 'guia'], ['senal', 'etiqueta'], ['senal', 'bug'], ['zocalo', 'acuse'], ['guia', 'zocalo'], ['acuse', 'guia'], ['turno', 'sonidob'], ['turno', 'pausa'], ['turno', 'ayudab'], ['turno', 'marcador'], ['margen', 'guia'], ['margen', 'senal'], ['veredicto', 'margen'], ['veredicto', 'turno'], ['tablero', 'veredicto'], ['tablero', 'sonidob'], ['tablero', 'pausa'], ['tablero', 'ayudab'], ['tablero', 'relojbox'], ['tablero', 'senal'], ['tablero', 'margen'], ['tablero', 'acuse'], ['saltar-rival', 'acuse'], ['saltar-rival', 'veredicto'], ['saltar-rival', 'zona'],
        // LIF-52: la explicación de primera vez no se encima con nada
        ...['tablero', 'veredicto', 'zona', 'saltar-rival', 'pausa', 'sonidob', 'ayudab', 'relojbox', 'acuse', 'margen', 'senal', 'barrita', 'guia', 'saltar', 'bug'].map(x => ['aprende', x])])
        if (B[a] && B[b] && cruza(B[a], B[b])) o.cruces.push(`${a}/${b}`);
      const pn = document.querySelector('#capa .panel') || (ve($('sobre')) ? $('sobre').querySelector('.panel') : null);
      if (pn) {
        const b = caja(pn), cortados = [];
        // texto cortado a lo ancho dentro del panel (una celda o un botón que no entra)
        for (const el of pn.querySelectorAll('h1,h2,p,li,button,td,th,label,b,span,output')) if (ve(el) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') cortados.push((el.textContent || '').trim().slice(0, 30));
        o.panel = { titulo: (pn.querySelector('h1,h2')?.textContent || '').trim().slice(0, 50), alto: Math.round(b.b - b.t), sobraAlto: pn.scrollHeight - pn.clientHeight, sobraAncho: pn.scrollWidth - pn.clientWidth, fuera: b.l < seg.left - 1 || b.r > W - seg.right + 1 || b.t < -1 || b.b > H - seg.bottom + 1, cortados, tapa: B.zona && cruza(B.zona, b), aprende: !!B.aprende && cruza(B.aprende, b) };
      }
      return o;
    }, { ...seguras, vertical: !!C.vertical });
    const d = `en «${donde}»`;
    if (R.scroll) mal(`${d} la página se desplaza o es más grande que la pantalla`);
    if (R.fuera.length) mal(`${d} se sale de la pantalla: ${R.fuera.join(', ')}`);
    if (R.seguras.length) mal(`${d} queda debajo de la muesca o de la barra de inicio: ${R.seguras.join(', ')}`);
    if (R.cruces.length) mal(`${d} se tapan: ${R.cruces.join(', ')}`);
    if (R.panel) {
      const P = R.panel, q = `${d} el panel «${P.titulo}»`;
      if (P.sobraAlto > 4) mal(`${q} no entra en ${C.h} px de alto: le faltan ${P.sobraAlto} px y hay que desplazarlo`);
      if (P.sobraAncho > 2) mal(`${q} desborda a lo ancho (${P.sobraAncho} px)`);
      if (P.fuera) mal(`${q} se sale de la pantalla o de las áreas seguras`);
      if (P.cortados.length) mal(`${q} corta texto: ${P.cortados.join(' | ')}`);
      if (P.tapa) mal(`${q} queda debajo del botón táctil`);
      if (P.aprende) mal(`${q} se encima con la explicación de primera vez`);
    }
    return R;
  };

  // ---------- campos: Espacio y Enter son del campo ----------
  if (C.campos) {
    await page.waitForFunction(() => document.querySelector('#capa .panel'));
    const antes = await J(() => ({ total: JUEGO.toques.total, firma: document.querySelector('#capa .panel').innerHTML.length, pantalla: JUEGO.estado().pantalla }));
    let campo = await page.locator('#capa .panel input[type=text], #capa .panel input:not([type]), #capa .panel input[type=email]').first();
    const propio = await campo.count();
    if (!propio) { await J(() => { const i = document.createElement('input'); i.id = 'prueba-campo'; i.type = 'text'; i.autocomplete = 'off'; document.querySelector('#capa .panel').prepend(i); }); campo = page.locator('#prueba-campo'); }
    await campo.tap(); await page.waitForTimeout(400);
    // un campo del juego abre el editor de arriba (#editor): se escribe ahí y «Listo» (o Enter) lo devuelve al campo
    const ed = await J(() => { const e = document.getElementById('editor'), r = e.getBoundingClientRect(); return { abierto: !e.hidden, foco: document.activeElement?.id, caja: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], W: innerWidth, H: (window.visualViewport?.height ?? innerHeight) }; });
    const esc = await J(() => ({ clase: document.documentElement.classList.contains('escribiendo'), zona: getComputedStyle(document.getElementById('zona')).display, fs: parseFloat(getComputedStyle(document.activeElement).fontSize) }));
    if (propio && (!ed.abierto || ed.foco !== 'editor-campo')) mal(`al tocar el campo del juego no se abrió el editor de arriba (${JSON.stringify(ed)})`);
    if (propio && ed.abierto && (ed.caja[1] < -1 || ed.caja[3] > ed.H + 1 || ed.caja[2] > ed.W + 1)) mal(`el editor no queda dentro de lo visible: ${JSON.stringify(ed)}`);
    // Enter en el nombre de la bienvenida es «Jugar» (docs/MVP.md, P1), salvo en el editor, donde es «Listo»
    if (!propio) await campo.fill('');
    await page.keyboard.type('Ana María  h'); await page.keyboard.press('ArrowLeft'); await foto('campo_con_teclado');
    if (propio) await page.locator('#editor-listo').tap(); else await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const desp = await J(sel => { const el = document.querySelector(sel); return { total: JUEGO.toques.total, valor: el?.value, foco: el && (document.activeElement === el || el.readOnly) ? 'INPUT' : document.activeElement?.tagName, editor: !document.getElementById('editor').hidden, pantalla: JUEGO.estado().pantalla, sobre: JUEGO.estado().sobre, firma: document.querySelector('#capa .panel')?.innerHTML.length }; }, propio ? '#capa .panel input' : '#prueba-campo');
    if (desp.editor) mal('«Listo» no cerró el editor');
    console.log(`${tag} campo de texto${propio ? ' del juego' : ' de prueba'}: «${desp.valor}», toques ${antes.total} → ${desp.total}, escribiendo ${esc.clase}, botón ${esc.zona}, letra ${esc.fs} px`);
    if (desp.foco === 'INPUT' && desp.total !== antes.total) mal(`escribir en un campo contó ${desp.total - antes.total} toques del levantamiento (input.js)`);
    if (desp.valor !== 'Ana María  h') mal(`en un campo de texto se escribió «${desp.valor}» en lugar de «Ana María  h»: el juego se come teclas (main.js, alTeclado: falta \`if (enCampo(e)) return;\`)`);
    if (desp.pantalla !== antes.pantalla || desp.sobre || desp.foco !== 'INPUT') mal(`Espacio, H o Enter en un campo activaron el juego (pantalla ${antes.pantalla} → ${desp.pantalla}, sobre ${desp.sobre}, foco ${desp.foco}): main.js, alTeclado, tiene que ignorar los campos`);
    if (!esc.clase) mal('con el foco en un campo no se marca html.escribiendo');
    if (esc.zona !== 'none') mal('con el teclado de pantalla abierto el botón táctil sigue a la vista');
    if (esc.fs < 16) mal(`la letra del campo es de ${esc.fs} px: Safari agranda la página al enfocar (hace falta 16 px o más)`);
    if (!propio) await J(() => document.getElementById('prueba-campo')?.remove());
    await J(() => document.activeElement?.blur?.());
    if (desp.sobre) await J(() => JUEGO.seguir?.());
  }

  // ---------- la partida ----------
  // cuánto tapa la interfaz al pesista, una vez por momento
  const medidos = new Set(), tapa = async momento => {
    if (medidos.has(momento)) return; medidos.add(momento); await page.waitForTimeout(300);      // las entradas animadas (0,18 s) terminan
    const x = await J(medirEnPagina).catch(e => ({ error: String(e) })); if (!x) return; if (x.error) { notas.push(`${tag} tapa ${momento}: ${x.error}`); return; }
    TAPA.push({ p: C.nombre, momento, x }); const r = revisarTapa(momento, x); if (r && !INFORMA) mal(r);
  };
  // 17-nov: los momentos que faltaban (preparación, barra arriba, veredicto grande y chico, de un rival, repetición, carga)
  const sigue = seguidor({ page, tapa, foto: n => foto(n), medidos });
  const probado = { detalle: false, estilo: false }, aprendes = new Set(); let aprendeCerrada = false;
  const vistas = new Set(), pantallas = new Set(); let firma = '', dedosProbados = false, bordesProbados = false, campoSolo = false, nIntentos = 0, ultToque = 0, hecho = '', revisadas = 0;
  // hastaPropios: hasta el llamado que sigue a ese intento propio (su veredicto ya pasó)
  let masKilos = false;
  const hasta = s => s.pantalla === 'fin' || (C.hastaIntentos && nIntentos >= C.hastaIntentos) || (C.hastaPropios && s.propios >= C.hastaPropios && s.pantalla === 'llamado') || (C.hastaPantalla && s.pantalla === C.hastaPantalla);
  for (let n = 0; n < 60000; n++) {
    const s = await J(estadoEnPagina);
    if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
    if (hasta(s)) break;
    const I = s.intento, suf = s.lev === 'c' ? '@c' : '';
    await sigue(s);
    // una captura y una revisión por pantalla nueva, por panel nuevo y por señal nueva
    const clave = `${s.pantalla}|${s.panel ? 'panel' : ''}|${s.sobre || ''}|${I && I.propio && I.senal ? I.senal.clave : ''}|${s.aprende ? 'aprende_' + s.aprende.clave : ''}`;
    if (clave !== firma && !(I && I.propio && !I.senal)) {
      firma = clave; pantallas.add(s.pantalla);
      if (s.panel) await av(450);
      const R = await revisar(clave.replace(/\|+/g, ' ').trim()); revisadas++;
      if (s.panel && s.pantalla === 'llamado' && R.panel) {
        const d = await J(() => { const pn = document.querySelector('#capa .panel'); return { detalle: !!pn?.querySelector('.pn-detalle:not([hidden])'), estilo: (pn?.querySelector('.pn-estilo')?.textContent || '').replace(/\s+/g, ' ').trim(),
          botones: [...(pn?.querySelectorAll('button') || [])].filter(b => b.offsetParent && b.getBoundingClientRect().height > 0).map(b => ({ id: b.id || b.className || b.textContent.trim().slice(0, 12), alto: Math.round(b.getBoundingClientRect().height) })) }; });
        const chicos = d.botones.filter(b => b.alto < BOTON_MIN); d.botonMin = Math.min(...d.botones.map(b => b.alto)); delete d.botones;
        if (chicos.length && !PANEL_INFORMA) mal(`en el panel del llamado «${R.panel.titulo}» hay botones de menos de ${BOTON_MIN} px: ${chicos.map(b => `${b.id} ${b.alto}`).join(', ')}`);
        const pct = R.panel.alto / C.h; PANEL.push({ p: C.nombre, titulo: R.panel.titulo, alto: R.panel.alto, pct, ...d });
        if (!d.detalle && pct > PANEL_TOPE && ['iphone_844x390', 'android_667x375'].includes(C.nombre) && !PANEL_INFORMA) mal(`el panel del llamado «${R.panel.titulo}» ocupa ${Math.round(pct * 100)} % del alto con el detalle plegado (tope ${PANEL_TOPE * 100} %)`);
        // parado (LIF-50): el panel sube desde abajo y el pesista queda arriba: como mucho el 40 % del alto
        if (C.vertical && !d.detalle && pct > PANEL_TOPE_V && !PANEL_INFORMA) mal(`parado: el panel del llamado «${R.panel.titulo}» ocupa ${Math.round(pct * 100)} % del alto (tope ${PANEL_TOPE_V * 100} %)`);
      }
      // con el dedo: «Detalles» se abre y se cierra, y el estilo de envión se elige sin salir del panel; todo entra en la pantalla
      if (s.panel && s.pantalla === 'llamado' && C.partida && R.panel) {
        if (!probado.detalle && await pulsa('#btn-detalle')) {
          probado.detalle = true; await av(50); const Rd = await revisar('llamado con el detalle abierto'); await foto('llamado_detalle');
          PANEL.push({ p: C.nombre, titulo: Rd.panel?.titulo, alto: Rd.panel?.alto, pct: (Rd.panel?.alto || 0) / C.h, detalle: true });
          await pulsa('#btn-detalle'); await av(50);
          if (await J(() => !document.querySelector('#capa .pn-detalle')?.hidden)) mal('«Detalles» no se volvió a plegar');
        }
        if (!probado.estilo && /Dos tiempos · intento 1/.test(R.panel.titulo)) {
          if (!await pulsa('#btn-estilo')) mal('en el primer dos tiempos no hay botón del estilo de envión');
          else {
            probado.estilo = true; await av(50); const Re = await revisar('llamado eligiendo el estilo de envión'); await foto('llamado_estilo');
            PANEL.push({ p: C.nombre, titulo: (Re.panel?.titulo || '') + ' (eligiendo estilo)', alto: Re.panel?.alto, pct: (Re.panel?.alto || 0) / C.h, detalle: false });
            const altos = await J(() => [...document.querySelectorAll('#capa .envion')].map(b => Math.round(b.getBoundingClientRect().height)));
            if (altos.length !== 3 || altos.some(h => h < BOTON_MIN)) mal(`los tres estilos de envión: alturas ${altos.join(', ')} px (mínimo ${BOTON_MIN})`);
            if (!await pulsa('#capa .envion[data-env="split"]')) mal('no se pudo elegir el split con el dedo'); await av(50);
          }
        }
        if (/Dos tiempos · intento [23]/.test(R.panel.titulo) && !await J(() => !!document.querySelector('#capa .pn-estilo.fijo') && !document.querySelector('#capa #btn-estilo'))) mal(`«${R.panel.titulo}»: el estilo de envión no se ve fijo`);
      }
      // LIF-52: cuánto tapa la explicación al pesista (meta: nada; tope 5 % del cuerpo) y, en el iPhone, cerrarla con el dedo
      if (s.aprende && !aprendes.has(s.aprende.clave)) {
        aprendes.add(s.aprende.clave); await tapa('aprende_' + s.aprende.clave); await foto('aprende_' + s.aprende.clave);
        if (C.campos && !aprendeCerrada) {
          aprendeCerrada = true; const t0 = await J(() => JUEGO.toques.total);
          if (!await pulsa('#aprende button')) mal('no se pudo tocar la ✕ de la explicación de primera vez');
          else { await av(50); const x = await J(() => ({ vis: !document.getElementById('aprende').hidden, ev: JUEGO.eventos.filter(e => e.ev === 'explicacion_cerrada').map(e => e.props), toques: JUEGO.toques.total }));
            if (x.vis || !x.ev.some(e => e.via === 'boton' && e.leida)) mal(`la ✕ no cerró la explicación (${JSON.stringify(x)})`);
            if (x.toques !== t0) mal(`tocar la ✕ de la explicación contó ${x.toques - t0} toques del juego`); }
        }
      }
      // parado (LIF-50): el botón principal del panel, al alcance del pulgar (en la mitad de abajo de la pantalla)
      if (C.vertical && s.panel) {
        const y = await J(() => { const pn = document.querySelector('#sobre:not([hidden]) .panel') || document.querySelector('#capa .panel'); const b = [...(pn?.querySelectorAll('button.ir, button.grande') || [])].find(x => x.getBoundingClientRect().height > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { y: (r.top + r.bottom) / 2 / innerHeight, txt: b.textContent.trim().slice(0, 24) }; });
        if (y) { PULGAR.push({ p: C.nombre, donde: clave.replace(/\|+/g, ' ').trim(), ...y }); if (y.y < .5) mal(`parado: en «${clave}» el botón «${y.txt}» queda arriba (${Math.round(y.y * 100)} % del alto): fuera del pulgar`); }
      }
      const sg = I && I.propio ? I.senal : null;
      if (s.panel && ['inicio', 'presentacion', 'apertura', 'intervalo'].includes(s.pantalla)) await tapa(s.pantalla);
      if (s.panel && s.pantalla === 'llamado') await tapa('llamado'); else if (sg && sg.tipo === 'barra') { await av(500); await tapa('corre' + suf); } else if (sg && sg.tipo === 'espera' && sg.barra) await tapa('quieta' + suf);
      else if (s.pantalla === 'decision') { await av(1200); await sigue(await J(estadoEnPagina)); } else if (s.pantalla === 'rival') { await av(900); await tapa('rival'); }
      if (I && I.propio && !R.zona) mal(`en el intento («${I.senal?.verbo || I.fase}») no se ve el botón táctil`);
      await foto(clave.replace(/\|+/g, '_'));
    }
    if (I && I.propio && s.modo !== 'panel') {
      const g = I.senal; if (!g) { if (['tiron', 'vuelo', 'pelea', 'empuje', 'flexion'].includes(I.fase) && !medidos.has('levanta' + suf)) { await tapa('levanta' + suf); await foto('levanta' + suf); } await av(20); continue; }
      vistas.add(g.verbo);
      if (C.dedos && !dedosProbados && (g.tipo === 'luz' || g.tipo === 'barra')) {
        if (g.tipo === 'barra') await ir(g.objetivo);      // 'b': después de la gracia de la barrita      // dos dedos a la vez en ¡SALTA!: dos toques anotados, un solo contacto («doble»)
        dedosProbados = true; const t0 = await J(() => JUEGO.toques.total), p = await punto();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }, { x: p.x - 30, y: p.y - 20, id: 2 }] }); await av(30);
        const t1 = await J(() => ({ total: JUEGO.toques.total, motivos: JUEGO.toques.ultimos.slice(-2).map(x => x.motivo) })); await sube(); await av(30);
        if (t1.total - t0 !== 2 || !t1.motivos.includes('doble')) mal(`dos dedos a la vez: ${t1.total - t0} toques anotados, motivos ${t1.motivos.join(', ')} (se esperaban 2 anotados y uno «doble»)`); else console.log(`${tag} dos dedos a la vez: 2 toques anotados, un solo contacto (${t1.motivos.join(', ')})`);
        ultToque = s.ahora; continue;
      }
      if (C.partida && !bordesProbados && (g.clave === 'tira' || g.tipo === 'barra')) {      // un toque en el borde cuenta como cualquier otro, con su acuse (Gameplay 2.1)
        bordesProbados = true; if (g.tipo === 'barra') await ir(g.objetivo); const t0 = await J(() => ({ total: JUEGO.toques.total, ent: JUEGO.estado().intento?.entradas })), H = (await page.viewportSize()).height;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: Math.round(H / 2), id: 1 }] }); await av(30); await sube(); await av(30);
        const t1 = await J(() => ({ total: JUEGO.toques.total, ent: JUEGO.estado().intento?.entradas, fase: JUEGO.estado().intento?.fase }));
        if (t1.total !== t0.total + 1 || t1.ent === t0.ent || t1.fase === 'tension') mal(`un toque en el borde de la pantalla no contó: ${JSON.stringify({ antes: t0, despues: t1 })}`); else console.log(`${tag} un toque en el borde cuenta (tira)`);
        continue;
      }
      if (C.campos && !campoSolo && (g.clave === 'tira' || g.tipo === 'barra')) {      // un campo sin panel abierto: solo input.js decide (main.js no toca teclas sin panel)
        campoSolo = true; const t0 = await J(() => JUEGO.toques.total);
        await J(() => { const i = document.createElement('input'); i.id = 'prueba-campo2'; i.type = 'text'; i.style.cssText = 'position:fixed;left:30%;top:40%;z-index:20;width:40%'; document.body.append(i); });
        await page.locator('#prueba-campo2').tap(); await page.keyboard.type('a b@c.de '); await page.keyboard.press('Enter');
        const x = await J(() => ({ total: JUEGO.toques.total, valor: document.getElementById('prueba-campo2').value, intento: JUEGO.estado().intento?.entradas }));
        await J(() => { document.getElementById('prueba-campo2').remove(); document.activeElement?.blur?.(); });
        console.log(`${tag} campo sin panel (input.js solo): «${x.valor}», toques ${t0} → ${x.total}`);
        if (x.total !== t0 || x.valor !== 'a b@c.de ') mal(`con el foco en un campo, Espacio o Enter contaron como toques o se perdieron (input.js): «${x.valor}», toques ${t0} → ${x.total}`);
        continue;
      }
      if (I.parado) { await av(80); await toque(); continue; }
      // un intento tocado en el rojo (lejos del verde): para ver el cartel de un intento que no sale
      if (g.tipo === 'barra' && C.falla === s.propios + 1) { await ir(g.objetivo + 699); await toque(); await av(320); continue; }
      if (g.tipo === 'barra') { await ir(g.objetivo); await toque(); continue; }      // 'b': toca cuando el puntero pasa por el centro del verde
      if (UNTOQUE.has(g.tipo)) { await av(150); await toque(); continue; }
      if (g.tipo === 'cierre') { const k = g.clave + g.desde; if (I.seDetiene || hecho === k) { await av(30); continue; } await ir(g.objetivo); await toque(); hecho = k; continue; }
      if (g.tipo === 'empuja') { if (s.ahora - ultToque >= 150) { await toque(); ultToque = s.ahora; } else await av(16); continue; }
      await av(30); continue;
    }
    if (s.panel && !s.sobre) {
      const hay = await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)'));
      // el intento que no sale: 6 kg de más (una vez: con más kilos sale después de un rival y el llamado vuelve) y tocado en el rojo
      if (hay && s.pantalla === 'llamado' && C.falla === s.propios + 1 && !masKilos) { masKilos = true; for (let i = 0; i < 6; i++) await pulsa('#kg-mas'); }
      if (hay) { const ok = await pulsa('#capa .panel button.ir'); if (s.pantalla === 'llamado' && ok) nIntentos++; await av(ok ? 50 : 200); continue; }
    }
    await av(['rival', 'decision', 'repeticion', 'repeticion_rival'].includes(s.pantalla) ? 450 : 200);
    if (!(I && I.propio) && n % 3 === 0 && await saltarRival(page, true)) continue;      // un rival: solo con el botón «Saltar»
    if (['decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado', 'rival'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) await toque();      // el toque de saltear
  }
  const fin = await J(() => ({ s: JUEGO.estado(), propios: (JUEGO.E.propios || []).map(x => `${x.pantalla} ${x.res}${x.causa ? ':' + x.causa : ''}`), toques: { total: JUEGO.toques.total, aceptados: JUEGO.toques.aceptados } }));
  console.log(`${tag} ${C.partida ? 'partida' : 'recorrido'} con toques: pantalla final ${fin.s.pantalla} · intentos propios: ${fin.propios.join(' · ')} · toques ${fin.toques.total} (${fin.toques.aceptados} aceptados; ${enBoton} sobre el botón, ${fueraBoton} sobre el escenario) · señales: ${[...vistas].join(' ')} · ${revisadas} pantallas revisadas · ${nFoto} capturas en ${path.relative(ROOT, dir)}`);
  if (C.partida && fin.s.pantalla !== 'fin') mal(`la partida no llegó al final (${fin.s.pantalla})`);
  if (!enBoton) mal('ningún toque cayó sobre el botón táctil');
  if (C.partida && (fin.propios.filter(x => / valido/.test(x)).length < 3)) mal(`tocando cada señal en su momento salieron pocos válidos: ${fin.propios.join(' · ')}`);
  if (C.dedos && !dedosProbados) mal('no se llegó a probar dos dedos a la vez');
  if (C.partida && !bordesProbados) mal('no se llegó a probar un toque en el borde');
  if (C.campos && !campoSolo) mal('no se llegó a probar un campo sin panel');
  // LIF-52: cada explicación se da por vista una sola vez, y en la final entera salen varias
  { const E2 = await J(() => JUEGO.eventos.filter(e => /^explicacion_/.test(e.ev)).map(e => ({ ev: e.ev, ...e.props }))), vistas = E2.filter(e => e.ev === 'explicacion_vista'), leidas = {};
    for (const e of E2) if (e.ev === 'explicacion_cerrada' && e.leida) leidas[e.clave] = (leidas[e.clave] || 0) + 1;
    for (const [k, n] of Object.entries(leidas)) if (n > 1) mal(`la explicación «${k}» se dio por vista ${n} veces`);
    for (const v of vistas) { const i = E2.indexOf(v), antes = E2.slice(0, i).some(e => e.ev === 'explicacion_cerrada' && e.clave === v.clave && e.leida); if (antes) mal(`la explicación «${v.clave}» volvió a salir después de vista`); }
    console.log(`${tag} explicaciones de primera vez: ${vistas.map(v => `${v.clave}@${v.momento}${v.vez > 1 ? '×' + v.vez : ''}`).join(' ') || 'ninguna'} · cerradas ${E2.filter(e => e.ev === 'explicacion_cerrada').map(e => `${e.clave}:${e.via}:${e.ms}ms${e.leida ? '' : ':sin_leer'}`).join(' ')}`);
    if (C.partida && new Set(vistas.map(v => v.clave)).size < 4) mal(`en la final entera salieron pocas explicaciones de primera vez: ${vistas.map(v => v.clave).join(', ') || 'ninguna'}`); }
  if (C.partida && (!probado.detalle || !probado.estilo)) mal(`no se llegó a probar ${!probado.detalle ? '«Detalles»' : 'el estilo de envión'} en el panel del llamado`);
  // la última pantalla (el podio con sus botones) también se revisa
  if (fin.s.pantalla === 'fin') { await av(3000); await revisar('fin (podio con botones)'); }
  if (C.hastaPantalla) {      // el cartel (muro) parado: entra, se lee y se toca con el pulgar
    const s2 = await J(() => JUEGO.estado()); if (s2.pantalla !== C.hastaPantalla) mal(`no se llegó a «${C.hastaPantalla}» (pantalla ${s2.pantalla})`);
    else { await page.waitForFunction(() => document.querySelector('#capa .panel'), null, { timeout: 15000 }).catch(() => null); await av(600); await revisar(C.hastaPantalla); await tapa(C.hastaPantalla); await foto(C.hastaPantalla); }
  }
  if (C.vertical) {      // gira a horizontal y vuelve: cada orientación con su diseño, sin recargar
    const o = () => J(() => { const h = document.documentElement.classList; return { vert: h.contains('vert'), horiz: h.contains('horiz'), rotado: h.contains('rotado'), ev: JUEGO.eventos.filter(e => e.ev === 'orientacion_cambio').map(e => e.props.orientacion) }; });
    await page.setViewportSize({ width: C.h, height: C.w }); await page.waitForTimeout(400); const r = await o(); await foto('girado_a_horizontal');
    if (r.vert || !r.horiz || r.rotado) mal(`al girar a horizontal no se usó el diseño acostado (${JSON.stringify(r)})`);
    await page.setViewportSize({ width: C.w, height: C.h }); await page.waitForTimeout(400); const r2 = await o(); await foto('de_nuevo_parado');
    if (!r2.vert || r2.horiz) mal(`al volver a vertical no se usó el diseño parado (${JSON.stringify(r2)})`);
    if (r2.ev.join(',') !== 'horizontal,vertical') mal(`eventos orientacion_cambio: ${r2.ev.join(',') || 'ninguno'} (se esperaban horizontal y vertical)`);
    const pr = await J(() => JUEGO.eventos.find(e => e.ev === 'juego_abierto')?.props.orientacion); if (pr !== 'vertical') mal(`juego_abierto lleva orientacion=${pr} (se esperaba vertical)`);
  }
  await foto('final'); await ctx.close();
}

// ---------- selección de pesista (main.js, elegirPesista; `?elegir=1`) ----------
// En computadora (1280 × 720, ratón y teclado), teléfono acostado (844 × 390) y parado (390 × 844): cada pesista de la terna
// de frente, de perfil y de espalda, de pie y con la barra arriba (capturas en out/telefono/seleccion_*). Revisa que el panel
// no tape al pesista (caja del cuerpo de three contra el panel), que entre en la pantalla, que gire solo y arrastrando, que
// los botones de cuarto de vuelta y «barra arriba» anden, y que «Listo» vuelva a la bienvenida con ese pesista elegido.
// Siempre se dibuja (calidad Alta; en la computadora, además, Móvil y Baja con un pesista).
const SELECCION = [
  { nombre: 'seleccion_pc_1280x720', w: 1280, h: 720, dpr: 1, pc: true, calidades: ['movil', 'baja'] },
  { nombre: 'seleccion_acostado_844x390', w: 844, h: 390, dpr: 2, seguras: { top: 0, right: 47, bottom: 21, left: 47 } },
  { nombre: 'seleccion_vertical_390x844', w: 390, h: 844, dpr: 2, vertical: true, seguras: { top: 47, right: 0, bottom: 34, left: 0 } },
];
async function seleccion(C, calidad = 'alta') {
  const tag = `[${C.nombre}${calidad === 'alta' ? '' : ' ' + calidad}]`, dir = path.join(OUT, C.nombre); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: C.w, height: C.h }, deviceScaleFactor: C.dpr, hasTouch: !C.pc, isMobile: !C.pc });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  const mal = txt => { const m = `${tag} ${txt}`; if (!problemas.includes(m)) problemas.push(m); };
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) mal(`HTTP ${r.status()}: ${r.url()}`); });
  if (C.seguras) { try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: C.seguras }); } catch { /* este Chrome no emula áreas seguras */ } }
  const J = (fn, a) => page.evaluate(fn, a), av = ms => J(ms => JUEGO.test.avanzar(ms), ms);
  const foto = async nombre => { await J(() => { try { JUEGO.escena.cuadro(0, true); } catch (e) { console.error('cuadro forzado: ' + (e.stack || e)); } }); await page.screenshot({ path: path.join(dir, `${calidad === 'alta' ? '' : calidad + '_'}${nombre}.png`) }).catch(() => null); };
  const pulsa = async sel => { const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible())) { mal(`no está a la vista ${sel}`); return false; } if (C.pc) await l.click(); else await l.tap(); return true; };
  const est = () => J(() => { const G = JUEGO.E.elegir, e = JUEGO.escena; return { pantalla: JUEGO.E.pantalla, G: G ? { id: G.id, visto: G.visto, ang: G.ang, meta: G.meta, arriba: G.arriba, u: G.u } : null, giro: e.giro || 0, barra: e.barbell.group.visible, toques: JUEGO.toques.total }; });
  const hasta = async (cond, que, tope = 240000) => { const t0 = Date.now(); for (;;) { const x = await est(); if (cond(x)) return x; if (Date.now() - t0 > tope) { mal(`no se llegó a: ${que} (${JSON.stringify(x)})`); return x; } await av(100); await page.waitForTimeout(100); } };
  /** Cajas en la página: el panel, el cuerpo del pesista (three) y la pantalla. */
  const medir = donde => J(donde => {
    const pn = document.querySelector('#capa .panel.elegir'), r = pn?.getBoundingClientRect(), c = JUEGO.escena.cajas()?.cuerpo, W = innerWidth, H = innerHeight, se = document.scrollingElement;
    if (!r || !c) return { donde, falta: !r ? 'panel' : 'pesista' };
    const ix = Math.max(0, Math.min(c.r, r.right) - Math.max(c.l, r.left)), iy = Math.max(0, Math.min(c.b, r.bottom) - Math.max(c.t, r.top)), area = Math.max(1, (c.r - c.l) * (c.b - c.t));
    return { donde, tapa: ix * iy / area, alto: (c.b - c.t) / H, fuera: c.l < -2 || c.t < -2 || c.r > W + 2 || c.b > H + 2, cuerpo: [c.l, c.t, c.r, c.b].map(Math.round), panel: [r.left, r.top, r.right, r.bottom].map(Math.round), panelFuera: r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1, panelCorta: pn.scrollHeight > pn.clientHeight + 1, scroll: se.scrollWidth > W + 1 || se.scrollHeight > H + 1 };
  }, donde);
  const MED = [];
  const revisar = async donde => {
    const m = await medir(donde); MED.push(m);
    if (m.falta) return mal(`${donde}: no hay ${m.falta}`);
    if (m.tapa > .01) mal(`${donde}: el panel tapa ${Math.round(m.tapa * 100)} % del pesista (cuerpo ${m.cuerpo}, panel ${m.panel})`);
    if (m.fuera) mal(`${donde}: el pesista se sale de la pantalla (${m.cuerpo})`);
    if (m.panelFuera || m.panelCorta || m.scroll) mal(`${donde}: el panel ${m.panelFuera ? 'se sale de la pantalla' : m.panelCorta ? 'no entra sin desplazar' : 'hace desplazar la página'} (${m.panel})`);
  };
  await page.goto(`${base}juego.html?lang=es&semilla=20261112&dibujo=0&elegir=1&calidad=${calidad}`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
  await J(() => JUEGO.test.manual());
  let x = await hasta(s => s.pantalla === 'elegir' && s.G && s.G.visto === s.G.id, 'la selección con el pesista a la vista');
  await J(() => JUEGO.E.precal); await av(450);
  const ids = await J(() => [...document.querySelectorAll('#capa .panel.elegir .pesista')].map(b => b.dataset.id));
  if (ids.length !== 3) mal(`la selección muestra ${ids.length} tarjetas`);
  const ficha0 = await J(() => document.getElementById('el-ficha')?.innerText.replace(/\s+/g, ' ').trim());
  console.log(`${tag} selección abierta con ${x.G?.id}: «${ficha0}»`);
  // gira solo: un cuarto de vuelta en 3 s (una vuelta en 12 s)
  { const a0 = (await est()).G.ang; await av(3000); const d = (await est()).G.ang - a0; if (Math.abs(d - Math.PI / 2) > .12) mal(`en 3 s giró ${d.toFixed(2)} rad (se esperaba un cuarto de vuelta)`); }
  // arrastrando sobre la escena libre: gira con el dedo (o el ratón) y no cuenta como toque del juego
  { const m = await medir('arrastre'), cx = m.cuerpo ? (m.cuerpo[0] + m.cuerpo[2]) / 2 : 60, cy = m.cuerpo ? (m.cuerpo[1] + m.cuerpo[3]) / 2 : 60, a0 = await est();
    if (C.pc) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 50, cy, { steps: 4 }); await page.mouse.up(); }
    else { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 7 }] }); for (const dx of [15, 30, 50]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx, y: cy, id: 7 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await av(100); const a1 = await est(), d = a1.G.ang - a0.G.ang;
    if (Math.abs(d - 50 * .012) > .1) mal(`arrastrar 50 px giró ${d.toFixed(2)} rad (se esperaban ${(50 * .012).toFixed(2)})`);
    if (a1.toques !== a0.toques) mal(`el arrastre contó como toque del juego (${a0.toques} → ${a1.toques})`);
    await av(1500); if (Math.abs((await est()).G.ang - a1.G.ang) > .01) mal('recién soltado, el pesista ya volvió a girar solo');
  }
  const frente = () => J(() => { const G = JUEGO.E.elegir; G.ang = 0; G.meta = null; G.pausa = 1e9; });
  const vistas = async (id, pose) => {
    await frente(); await av(60); await revisar(`${id} ${pose} frente`); await foto(`${id}_${pose}_frente`);
    for (const v of ['perfil', 'espalda']) { await pulsa('#el-der'); await av(1000); const g = await est(), q = v === 'perfil' ? Math.PI / 2 : Math.PI; if (Math.abs(g.G.ang - q) > .02 || Math.abs(g.giro - q) > .02) mal(`${id} ${pose}: el botón de girar no dejó al pesista de ${v} (${g.G.ang.toFixed(2)} rad, escena ${g.giro.toFixed(2)})`); await revisar(`${id} ${pose} ${v}`); await foto(`${id}_${pose}_${v}`); }
  };
  const orden = calidad === 'alta' ? [...ids.filter(id => id === x.G?.id), ...ids.filter(id => id !== x.G?.id)] : [x.G?.id];
  for (const id of orden) {
    if ((await est()).G.id !== id) { await pulsa(`#capa .panel.elegir .pesista[data-id="${id}"]`); await av(500); x = await hasta(s => s.G && s.G.id === id && s.G.visto === id, `el pesista ${id} a la vista`); await av(300); }
    const pr = await J(() => document.querySelector('#capa .panel.elegir .pesista[aria-pressed=true]')?.dataset.id); if (pr !== id) mal(`la tarjeta marcada es ${pr} y el pesista a la vista ${id}`);
    console.log(`${tag} ${id}: «${await J(() => document.getElementById('el-ficha')?.innerText.replace(/\s+/g, ' ').trim())}»`);
    if ((await est()).barra) mal(`${id}: de pie se dibuja la barra`);
    await vistas(id, 'pie');
    await pulsa('#el-pose'); await av(2600); { const g = await est(); if (!g.G.arriba || g.G.u !== 1 || !g.barra) mal(`${id}: «barra arriba» no terminó arriba (${JSON.stringify(g.G)})`); }
    await vistas(id, 'arriba');
    await pulsa('#el-pose'); await av(2600); { const g = await est(); if (g.G.arriba || g.G.u !== 0 || g.barra) mal(`${id}: no volvió a quedar de pie (${JSON.stringify(g.G)})`); }
  }
  if (C.pc && calidad === 'alta') {      // teclado: las flechas cambian de tarjeta y Enter sobre la elegida la confirma
    const a = (await est()).G.id; await J(() => document.querySelector('#capa .panel.elegir .pesista[aria-pressed=true]').focus());
    await page.keyboard.press(ids.indexOf(a) > 0 ? 'ArrowLeft' : 'ArrowRight'); await av(500); const b = await hasta(s => s.G && s.G.visto === s.G.id, 'el pesista elegido con las flechas', 60000);
    if (b.G.id === a) mal('las flechas no cambiaron de pesista'); await av(500); await page.keyboard.press('Enter'); await av(300);
  } else { await pulsa('#el-listo'); await av(300); }
  const fin = await J(() => ({ pantalla: JUEGO.E.pantalla, tarjetas: document.querySelectorAll('#capa .panel.bienvenida .pesista').length, marcado: document.querySelector('#capa .panel.bienvenida .pesista[aria-pressed=true]')?.dataset.id, giro: JUEGO.escena.giro || 0, barra: JUEGO.escena.barbell.group.visible, jugar: !!document.getElementById('btn-empezar'), errores: JUEGO.E.errores }));
  if (fin.pantalla !== 'inicio' || fin.tarjetas !== 3 || !fin.jugar) mal(`«Listo» no volvió a la bienvenida con las tarjetas (${JSON.stringify(fin)})`);
  if (fin.giro || !fin.barra) mal(`al salir de la selección la escena no quedó como estaba (giro ${fin.giro}, barra ${fin.barra})`);
  if (fin.errores.length) mal(`errores del juego: ${fin.errores.join(' | ').slice(0, 300)}`);
  await foto('bienvenida_despues');
  const alto = k => { const v = MED.filter(m => !m.falta && m.donde.includes(k)).map(m => m.alto); return v.length ? `${Math.round(Math.min(...v) * 100)}–${Math.round(Math.max(...v) * 100)} %` : '—'; };
  console.log(`${tag} ${orden.length} pesistas, ${MED.length} vistas medidas · alto del pesista en pantalla: de pie ${alto(' pie ')}, barra arriba ${alto(' arriba ')} · el panel tapa como mucho ${Math.round(Math.max(0, ...MED.filter(m => !m.falta).map(m => m.tapa)) * 100)} % · vuelve a la bienvenida con ${fin.marcado} marcado`);
  await ctx.close();
}

try {
  for (const C of CASOS.filter(c => !SOLO.length || SOLO.some(x => c.nombre.startsWith(x)))) await correr(C);
  // la selección de pesista corre aparte (--solo=seleccion): dibuja siempre y no entra en el tiempo de los demás casos
  for (const C of SELECCION.filter(c => SOLO.some(x => c.nombre.startsWith(x)))) { await seleccion(C); for (const q of C.calidades || []) await seleccion(C, q); }
}
catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close(); server.close();
if (TAPA.length) { console.log('\nCuánto tapa la interfaz al pesista (caja proyectada desde three; tools/tapa.mjs):'); for (const id of [...new Set(TAPA.map(x => x.p))]) { console.log(`  [${id}]`); for (const x of TAPA.filter(y => y.p === id)) console.log('    ' + fila(x.momento, x.x)); } fs.writeFileSync(path.join(OUT, 'tapa.json'), JSON.stringify(TAPA, null, 1)); }
if (PANEL.length) { console.log('\nAlto del panel del llamado (con el detalle plegado salvo que diga «detalle»):'); for (const x of PANEL) console.log(`  [${x.p}] ${x.titulo}: ${x.alto} px · ${Math.round(x.pct * 100)} % del alto${x.botonMin ? ` · botón más bajo ${x.botonMin} px` : ''}${x.detalle ? ' · detalle' : ''}${x.estilo ? ` · «${x.estilo}»` : ''}`); fs.writeFileSync(path.join(OUT, 'panel.json'), JSON.stringify(PANEL, null, 1)); }
if (PULGAR.length) { console.log('\nParado: altura del botón principal de cada panel (0 = arriba, 1 = abajo; pulgar ≥ 0,5):'); for (const x of PULGAR) console.log(`  [${x.p}] ${x.donde}: «${x.txt}» a ${x.y.toFixed(2)}`); }
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 40)) console.log('  ' + p); process.exit(1); }
if (SOLO.length && SOLO.every(x => x.startsWith('seleccion'))) { console.log('\nOK: selección de pesista en computadora, teléfono acostado y parado: el panel no tapa al pesista, gira solo y arrastrando, cuartos de vuelta, barra arriba y «Listo»'); process.exit(0); }
console.log('\nOK: teléfono de costado (dos tamaños y mano izquierda) y parado (tres tamaños, sin girar el contenido), jugado con toques, campos de texto con el editor de arriba y dos dedos, sin cortes ni superposiciones');
