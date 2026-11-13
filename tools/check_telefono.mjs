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
//  - En vertical (390 × 844, teléfono con la rotación trabada): el contenido se gira 90° (html.rotado) y se juega igual,
//    con toques sobre el botón; al girar el teléfono de verdad, se usa la orientación real.
// Sin --dibujo el 3D no se dibuja solo (?dibujo=0, como check_game): antes de cada captura se fuerza un cuadro.
// Uso: node tools/check_telefono.mjs [--headed] [--solo=nombre] [--capturas=out/telefono] [--dibujo]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SOLO = arg('solo'), HEADED = process.argv.includes('--headed'), DIBUJO = process.argv.includes('--dibujo'), OUT = path.resolve(ROOT, arg('capturas') || 'out/telefono');
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
const problemas = [], notas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));

const CASOS = [
  { nombre: 'iphone_844x390', w: 844, h: 390, dpr: 3, seguras: { top: 0, right: 47, bottom: 21, left: 47 }, partida: true, campos: true, dedos: true },
  { nombre: 'android_667x375', w: 667, h: 375, dpr: 2, partida: true },
  { nombre: 'zurdo_740x360', w: 740, h: 360, dpr: 3, url: '&mano=izq', hastaIntentos: 2 },
  // iPhone en Safari de costado, con la barra de direcciones a la vista: quedan unos 340 px de alto
  { nombre: 'safari_844x340', w: 844, h: 340, dpr: 3, seguras: { top: 0, right: 47, bottom: 21, left: 47 }, hastaIntentos: 2 },
  { nombre: 'vertical_390x844', w: 390, h: 844, dpr: 3, vertical: true, hastaIntentos: 2 },
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

  await page.goto(`${base}juego.html?lang=es&semilla=20261112&dibujo=${DIBUJO ? 1 : 0}${C.url || ''}`, { waitUntil: 'load' });
  const S0 = await J(() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.append(p); const c = getComputedStyle(p), r = { top: parseFloat(c.paddingTop), right: parseFloat(c.paddingRight), bottom: parseFloat(c.paddingBottom), left: parseFloat(c.paddingLeft) }; p.remove(); return { seguras: r, tactil: matchMedia('(pointer:coarse)').matches }; });
  if (!S0.tactil) mal('la emulación no da puntero grueso: la prueba no sirve');
  if (C.seguras && S0.seguras.left !== C.seguras.left) { notas.push(`${tag} áreas seguras pedidas ${JSON.stringify(C.seguras)}, la página ve ${JSON.stringify(S0.seguras)}`); seguras = S0.seguras; }

  // ---------- vertical: el contenido va girado 90° (html.rotado) y se juega igual ----------
  if (C.vertical) {
    const g = () => J(() => { const app = document.getElementById('app'), r = app.getBoundingClientRect(), tf = getComputedStyle(app).transform; return { rotado: document.documentElement.classList.contains('rotado'), horiz: document.documentElement.classList.contains('horiz'), tf, caja: [Math.round(r.width), Math.round(r.height)], interior: [app.clientWidth, app.clientHeight], girar: !!document.getElementById('girar'), scroll: document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollWidth > innerWidth + 1 }; });
    const v = await g(); await foto('vertical_girado');
    console.log(`${tag} en vertical: html.rotado ${v.rotado}, #app ${v.interior.join('x')} girado a ${v.caja.join('x')} (${v.tf})`);
    if (!v.rotado || !v.horiz) mal(`en vertical el contenido no se giró (html.rotado ${v.rotado}, html.horiz ${v.horiz})`);
    if (v.interior[0] < v.interior[1]) mal(`en vertical, el juego girado no quedó apaisado: ${v.interior.join('x')}`);
    if (Math.abs(v.caja[0] - C.w) > 2 || Math.abs(v.caja[1] - C.h) > 2) mal(`en vertical, el contenido girado no ocupa la pantalla: ${v.caja.join('x')} en ${C.w}x${C.h}`);
    if (v.girar) mal('sigue en la página el aviso «Gira el teléfono»');
    if (v.scroll) mal('en vertical la página se desplaza');
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
      const ids = ['zona', 'senal', 'barrita', 'margen', 'zocalo', 'acuse', 'guia', 'veredicto', 'cartel', 'rival', 'etiqueta', 'pausa', 'ayudab', 'sonidob', 'saltar'], B = {};
      for (const id of ids) if (ve($(id))) B[id] = caja($(id));
      for (const k of ['bug', 'relojbox']) { const el = document.querySelector('.' + k); if (ve(el)) B[k] = caja(el); }
      for (const [id, b] of Object.entries(B)) {
        if (b.l < -1 || b.t < -1 || b.r > W + 1 || b.b > H + 1) o.fuera.push(`${id} ${Math.round(b.l)},${Math.round(b.t)}-${Math.round(b.r)},${Math.round(b.b)}`);
        // lo que se toca o se lee no va debajo de la muesca ni de la barra de inicio (el veredicto y el cartel van centrados)
        if (!['veredicto', 'cartel'].includes(id) && (b.l < seg.left - 1 || b.r > W - seg.right + 1 || b.b > H - seg.bottom + 1)) o.seguras.push(id);
      }
      for (const [a, b] of [['zona', 'barrita'], ['barrita', 'zocalo'], ['barrita', 'guia'], ['barrita', 'margen'], ['zona', 'senal'], ['zona', 'zocalo'], ['zona', 'acuse'], ['zona', 'guia'], ['zona', 'rival'], ['zona', 'pausa'], ['zona', 'saltar'], ['zona', 'sonidob'], ['sonidob', 'pausa'], ['sonidob', 'bug'], ['sonidob', 'senal'], ['ayudab', 'relojbox'], ['senal', 'zocalo'], ['senal', 'guia'], ['senal', 'etiqueta'], ['senal', 'bug'], ['zocalo', 'acuse'], ['guia', 'zocalo'], ['acuse', 'guia']])
        if (B[a] && B[b] && cruza(B[a], B[b])) o.cruces.push(`${a}/${b}`);
      const pn = document.querySelector('#capa .panel') || (ve($('sobre')) ? $('sobre').querySelector('.panel') : null);
      if (pn) {
        const b = caja(pn), cortados = [];
        // texto cortado a lo ancho dentro del panel (una celda o un botón que no entra)
        for (const el of pn.querySelectorAll('h1,h2,p,li,button,td,th,label,b,span,output')) if (ve(el) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') cortados.push((el.textContent || '').trim().slice(0, 30));
        o.panel = { titulo: (pn.querySelector('h1,h2')?.textContent || '').trim().slice(0, 50), alto: Math.round(b.b - b.t), sobraAlto: pn.scrollHeight - pn.clientHeight, sobraAncho: pn.scrollWidth - pn.clientWidth, fuera: b.l < seg.left - 1 || b.r > W - seg.right + 1 || b.t < -1 || b.b > H - seg.bottom + 1, cortados, tapa: B.zona && cruza(B.zona, b) };
      }
      return o;
    }, seguras);
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
  const vistas = new Set(), pantallas = new Set(); let firma = '', dedosProbados = false, bordesProbados = false, campoSolo = false, nIntentos = 0, ultToque = 0, hecho = '', revisadas = 0;
  const hasta = s => s.pantalla === 'fin' || (C.hastaIntentos && nIntentos >= C.hastaIntentos);
  for (let n = 0; n < 60000; n++) {
    const s = await J(() => JUEGO.estado());
    if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
    if (hasta(s)) break;
    const I = s.intento;
    // una captura y una revisión por pantalla nueva, por panel nuevo y por señal nueva
    const clave = `${s.pantalla}|${s.panel ? 'panel' : ''}|${s.sobre || ''}|${I && I.propio && I.senal ? I.senal.clave : ''}`;
    if (clave !== firma && !(I && I.propio && !I.senal)) {
      firma = clave; pantallas.add(s.pantalla);
      if (s.panel) await av(450);
      const R = await revisar(clave.replace(/\|+/g, ' ').trim()); revisadas++;
      if (I && I.propio && !R.zona) mal(`en el intento («${I.senal?.verbo || I.fase}») no se ve el botón táctil`);
      await foto(clave.replace(/\|+/g, '_'));
    }
    if (I && I.propio && s.modo !== 'panel') {
      const g = I.senal; if (!g) { await av(20); continue; }
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
      if (g.tipo === 'barra') { await ir(g.objetivo); await toque(); continue; }      // 'b': toca cuando el puntero pasa por el centro del verde
      if (UNTOQUE.has(g.tipo)) { await av(150); await toque(); continue; }
      if (g.tipo === 'cierre') { const k = g.clave + g.desde; if (I.seDetiene || hecho === k) { await av(30); continue; } await ir(g.objetivo); await toque(); hecho = k; continue; }
      if (g.tipo === 'empuja') { if (s.ahora - ultToque >= 150) { await toque(); ultToque = s.ahora; } else await av(16); continue; }
      await av(30); continue;
    }
    if (s.panel && !s.sobre) {
      const hay = await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)'));
      if (hay) { const ok = await pulsa('#capa .panel button.ir'); if (s.pantalla === 'llamado' && ok) nIntentos++; await av(ok ? 50 : 200); continue; }
    }
    await av(['rival', 'decision', 'repeticion', 'repeticion_rival'].includes(s.pantalla) ? 450 : 200);
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
  // la última pantalla (el podio con sus botones) también se revisa
  if (fin.s.pantalla === 'fin') { await av(3000); await revisar('fin (podio con botones)'); }
  if (C.vertical) {      // el teléfono gira de verdad: orientación real, sin girar el contenido
    await page.setViewportSize({ width: C.h, height: C.w }); await page.waitForTimeout(300);
    const r = await J(() => ({ rotado: document.documentElement.classList.contains('rotado'), horiz: document.documentElement.classList.contains('horiz'), tf: getComputedStyle(document.getElementById('app')).transform }));
    if (r.rotado || !r.horiz || r.tf !== 'none') mal(`al girar el teléfono a horizontal el contenido sigue girado (${JSON.stringify(r)})`);
    await foto('girado_a_horizontal');
  }
  await foto('final'); await ctx.close();
}

try { for (const C of CASOS.filter(c => !SOLO || c.nombre === SOLO)) await correr(C); }
catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close(); server.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 40)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: teléfono de costado (dos tamaños y mano izquierda) y en vertical con el contenido girado, jugado con toques, campos de texto con el editor de arriba y dos dedos, sin cortes ni superposiciones');
