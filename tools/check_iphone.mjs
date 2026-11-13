// Prueba del iPhone acostado (emulado: táctil, isMobile y el agente de usuario de Safari o de Chrome de iOS), sobre lo que
// el dueño vio en su iPhone el 12-nov:
//  1. Sonido. Antes del primer toque no hay AudioContext; después del primero ya corre ('running'), la sesión de WebKit
//     queda en 'playback' (navigator.audioSession se simula: Chrome no la tiene) y el <audio> silencioso suena (lo que hace
//     que el iPhone en silencio igual suene). «Sonido» en Opciones y el parlante de la barra (#sonidob) lo apagan y lo
//     prenden, se ve el estado (aria-pressed, tachado), se recuerda al recargar y, apagado, ningún toque crea audio.
//  2. Opciones acostado (de 340 a 430 px de alto): con Opciones abierto el panel se desplaza con el dedo (toques reales por
//     CDP, empezando sobre un botón), la página no se mueve, ningún botón queda cortado o tapado por la fila de abajo, y
//     tocar una opción no hace saltar el desplazamiento. Lo mismo con «Cómo se juega», el panel más largo.
//  3. Pantalla completa. El aviso para instalarlo sale una vez sola, con los pasos del navegador (Safari o Chrome de iOS,
//     en español o en inglés), se cierra, no vuelve al recargar y se puede volver a pedir desde Opciones. El cuerpo mide el
//     alto visible (visualViewport).
// Por software (sin GPU): no mide cuadros ni el hilo de WebKit; verifica lógica, toques y que nada quede cortado.
// Uso: node tools/check_iphone.mjs [--headed] [--solo=nombre] [--capturas=out/iphone]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SOLO = arg('solo'), HEADED = process.argv.includes('--headed'), OUT = path.resolve(ROOT, arg('capturas') || 'out/iphone');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const problemas = [], notas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));

const UA = {
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  chrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
};
const SEG = { top: 0, right: 47, bottom: 21, left: 47 };
const CASOS = [
  { nombre: 'safari_es_844x340', w: 844, h: 340, nav: 'safari', lang: 'es', barra: true },
  { nombre: 'chrome_es_844x390', w: 844, h: 390, nav: 'chrome', lang: 'es' },
  { nombre: 'chrome_en_932x430', w: 932, h: 430, nav: 'chrome', lang: 'en' },
  { nombre: 'safari_en_667x375', w: 667, h: 375, nav: 'safari', lang: 'en', dpr: 2 },
  { nombre: 'chrome_es_740x360', w: 740, h: 360, nav: 'chrome', lang: 'es' },
];
// lo que tiene que decir el aviso de cada navegador (los pasos de ESE navegador)
const PASOS = { safari: { es: /Compartir.*···|···.*Compartir/, en: /Share.*···|···.*Share/ }, chrome: { es: /barra de la dirección/, en: /address bar/ } };

async function correr(C) {
  const tag = `[${C.nombre}]`, dir = path.join(OUT, C.nombre); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: C.w, height: C.h }, deviceScaleFactor: C.dpr || 3, hasTouch: true, isMobile: true, userAgent: UA[C.nav] });
  // WebKit tiene navigator.audioSession y Chrome no: se simula para ver qué pide el juego
  // sin la práctica guiada (Jugar va directo a la final): la prueba solo necesita llegar a la barra de la partida
  await ctx.addInitScript(() => { try { localStorage.setItem('tarima.tutorial', '1'); } catch { /* nada */ } if (!('audioSession' in navigator)) Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  const mal = txt => { const m = `${tag} ${txt}`; if (!problemas.includes(m)) problemas.push(m); };
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) mal(`HTTP ${r.status()}: ${r.url()}`); });
  try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: SEG }); } catch { notas.push(`${tag} sin áreas seguras emuladas`); }
  const J = (fn, a) => page.evaluate(fn, a);
  let nFoto = 0;
  const foto = async nombre => {
    await J(() => { try { window.JUEGO?.escena?.cuadro?.(0, true); } catch { /* sin escena */ } }).catch(() => null);
    await page.screenshot({ path: path.join(dir, `${String(++nFoto).padStart(2, '0')}_${nombre}.png`) }).catch(() => null);
  };
  const audio = () => J(async () => (await import('./js/game/audio.js')).sonido.estado);
  const av = ms => J(ms => JUEGO.test.avanzar(ms), ms);
  /** Toque real (touchStart/touchEnd por CDP) en el centro de un elemento, si se ve. */
  const toca = async sel => {
    const b = await J(sel => { const el = document.querySelector(sel); if (!el || el.offsetParent === null) return null; el.scrollIntoView?.({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    if (!b) return false;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(60); return true;
  };
  /** Arrastre con el dedo de (x, y) a (x, y + dy), en pasos de 12 px, como una persona (sin soltar de golpe). */
  const arrastra = async (x, y, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }] });
    const n = Math.max(4, Math.ceil(Math.abs(dy) / 12));
    for (let i = 1; i <= n; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / n, id: 7 }] }); await page.waitForTimeout(8); }
    await page.waitForTimeout(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(500);
  };
  const doc = () => J(() => ({ y: scrollY, x: scrollX, se: document.scrollingElement.scrollTop, alto: Math.round(document.body.getBoundingClientRect().height), vv: Math.round(visualViewport.height) }));

  await page.goto(`${base}juego.html?lang=${C.lang}&semilla=20261112&dibujo=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO?.listo && document.querySelector('#capa .panel.bienvenida'), null, { timeout: 120000 });
  await J(() => JUEGO.test.manual()); await av(450);

  // ---------- 3. aviso de pantalla completa: una vez, con los pasos de este navegador ----------
  const aviso = () => J(() => { const el = document.getElementById('instalar'), r = el.getBoundingClientRect(); return { ve: !el.hidden && r.width > 0, texto: el.querySelector('#instalar-t').textContent, nav: el.dataset.navegador, caja: [r.left, r.top, r.right, r.bottom].map(Math.round) }; });
  let A = await aviso(); const a0 = await audio();
  await foto('inicio_con_aviso');
  console.log(`${tag} aviso: ${A.ve ? 'a la vista' : 'NO'} (${A.nav}) «${A.texto}» · audio antes de tocar: ${a0.contexto}`);
  if (!A.ve) mal('el aviso para instalar no salió en la primera visita');
  if (A.nav !== C.nav) mal(`el aviso detectó el navegador «${A.nav}» y es «${C.nav}»`);
  if (!PASOS[C.nav][C.lang].test(A.texto)) mal(`el aviso no da los pasos de ${C.nav} en ${C.lang}: «${A.texto}»`);
  if (A.ve && (A.caja[0] < -1 || A.caja[2] > C.w + 1 || A.caja[1] < -1 || A.caja[3] > C.h + 1)) mal(`el aviso se sale de la pantalla: ${A.caja}`);
  if (a0.contexto !== 'sin contexto') mal(`se creó el AudioContext antes del primer toque (${a0.contexto})`);
  await toca('#instalar-ok'); A = await aviso();
  if (A.ve) mal('«Entendido» no cerró el aviso');

  // ---------- 1. el primer toque ya desbloquea el sonido ----------
  await page.waitForTimeout(200); let a1 = await audio();
  console.log(`${tag} audio después del primer toque: ${JSON.stringify(a1)}`);
  if (a1.contexto !== 'running') mal(`después del primer toque el audio no corre (${a1.contexto})`);
  if (a1.sesion !== 'playback') mal(`la sesión de audio quedó en «${a1.sesion}» y no en «playback» (el iPhone en silencio no sonaría)`);
  if (!a1.silencio) mal('no suena el <audio> silencioso que hace sonar al iPhone en silencio');

  // ---------- 2. Opciones acostado: desplazar con el dedo ----------
  const D0 = await doc();
  if (Math.abs(D0.alto - D0.vv) > 1) mal(`el cuerpo mide ${D0.alto} px y lo visible ${D0.vv} px`);
  await toca('#btn-opciones'); await av(450);
  const P = () => J(() => {
    const pn = document.querySelector('#capa .panel'), r = pn.getBoundingClientRect(), pie = pn.querySelector('.pie')?.getBoundingClientRect();
    return { st: Math.round(pn.scrollTop), max: pn.scrollHeight - pn.clientHeight, caja: [r.left, r.top, r.right, r.bottom].map(Math.round), pie: pie ? Math.round(pie.top) : null, opciones: !!pn.querySelector('.opciones'),
      verOpc: (() => { const o = pn.querySelector('.opciones'); if (!o) return false; const q = o.getBoundingClientRect(); return q.top < (pie ? pie.top : r.bottom) && q.bottom > r.top; })(),
      ta: getComputedStyle(pn).touchAction, ob: getComputedStyle(pn).overscrollBehaviorY };
  });
  let p = await P();
  console.log(`${tag} Opciones abierto: desplazamiento ${p.st} de ${p.max} px, touch-action «${p.ta}», overscroll «${p.ob}», opciones a la vista ${p.verOpc}`);
  if (!p.opciones) mal('Opciones no se abrió');
  if (!p.verOpc) mal('al abrir Opciones las opciones quedaron fuera de la vista');
  if (p.ob !== 'contain') mal(`el panel no contiene el arrastre al llegar al borde (overscroll-behavior ${p.ob})`);
  await foto('opciones_abierto');
  // con un dedo sobre una tarjeta de pesista (un botón): hacia abajo hasta arriba de todo, después hacia arriba hasta el fondo
  // el dedo empieza sobre un botón que se vea entero entre el borde de arriba del panel y la fila de abajo
  const dedo = () => J(() => {
    const pn = document.querySelector('#capa .panel'), r = pn.getBoundingClientRect(), tope = pn.querySelector('.pie')?.getBoundingClientRect().top ?? r.bottom;
    const b = [...pn.querySelectorAll('button')].filter(x => !x.closest('.pie') && x.offsetParent !== null).find(x => { const q = x.getBoundingClientRect(), y = q.top + q.height / 2; return y > r.top + 20 && y < tope - 20; });
    const q = b ? b.getBoundingClientRect() : r;
    return { x: Math.round(q.left + Math.min(q.width / 2, 60)), y: Math.round(b ? q.top + q.height / 2 : (r.top + tope) / 2), banda: Math.round(tope - r.top), en: b ? (b.dataset.id || b.textContent.trim().slice(0, 20)) : 'panel' };
  });
  const antes = await J(() => ({ pantalla: JUEGO.estado().pantalla, pesista: document.querySelector('#capa .pesista[aria-pressed=true]')?.dataset.id, toques: JUEGO.toques.total }));
  if (p.max > 4) {
    let d = await dedo(); const en1 = d.en;
    for (let i = 0; i < 4 && (await P()).st > 2; i++) { d = await dedo(); await arrastra(d.x, d.y, Math.round(d.banda * .6)); }
    const arriba = await P(); await foto('opciones_dedo_arriba');
    for (let i = 0; i < 4 && (await P()).st < p.max - 2; i++) { d = await dedo(); await arrastra(d.x, d.y, -Math.round(d.banda * .6)); }
    const abajo = await P(); await foto('opciones_dedo_abajo');
    console.log(`${tag} arrastre con el dedo (empezando en «${en1}», luego «${d.en}»): ${p.st} → ${arriba.st} (arriba) → ${abajo.st} (abajo) de ${p.max}`);
    if (arriba.st > 2) mal(`arrastrando hacia abajo el panel no llegó arriba (${p.st} → ${arriba.st})`);
    if (abajo.st < abajo.max - 2) mal(`arrastrando hacia arriba el panel no llegó al fondo (${abajo.st} de ${abajo.max})`);
  } else notas.push(`${tag} con Opciones abierto el panel entra sin desplazar`);
  const D1 = await doc(), desp = await J(() => ({ pantalla: JUEGO.estado().pantalla, pesista: document.querySelector('#capa .pesista[aria-pressed=true]')?.dataset.id, toques: JUEGO.toques.total }));
  if (D1.y || D1.x || D1.se) mal(`al arrastrar se movió la página (${JSON.stringify(D1)})`);
  if (desp.pantalla !== antes.pantalla || desp.pesista !== antes.pesista) mal(`un arrastre eligió algo: ${JSON.stringify(antes)} → ${JSON.stringify(desp)}`);

  // ningún botón del panel queda cortado ni tapado: para cada uno hay un desplazamiento en el que se ve entero y es lo que se toca
  const cortados = await J(({ W, H, seg }) => {
    const pn = document.querySelector('#capa .panel'), malos = [];
    for (const b of pn.querySelectorAll('button')) {
      if (b.offsetParent === null) continue;
      const pie = pn.querySelector('.pie'), enPie = pie && pie.contains(b);
      if (!enPie) { const r0 = b.getBoundingClientRect(), r = pn.getBoundingClientRect(), tope = pie ? pie.getBoundingClientRect().top : r.bottom; pn.scrollTop += (r0.bottom > tope - 4 ? r0.bottom - tope + 8 : 0) + (r0.top < r.top + 4 ? r0.top - r.top - 8 : 0); }
      const q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, en = document.elementFromPoint(x, y);
      const fuera = q.left < seg.left - 1 || q.right > W - seg.right + 1 || q.top < -1 || q.bottom > H - seg.bottom + 1;
      if (fuera || !en || !(b === en || b.contains(en))) malos.push(`${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24)}${fuera ? ' (fuera)' : ''}${en && !(b === en || b.contains(en)) ? ` (tapado por ${en.id || en.className || en.tagName})` : ''}`);
    }
    return malos;
  }, { W: C.w, H: C.h, seg: SEG });
  if (cortados.length) mal(`en Opciones hay botones cortados o tapados: ${cortados.join(' | ')}`);

  // ---------- 1. «Sonido» en Opciones: apagar y prender sin que salte el desplazamiento ----------
  await J(() => { const pn = document.querySelector('#capa .panel'); pn.querySelector('[data-sonido="no"]').scrollIntoView({ block: 'nearest' }); });
  const st0 = (await P()).st;
  await toca('[data-sonido="no"]'); await av(450);
  let s = await audio(); const st1 = (await P()).st, pres = await J(() => [...document.querySelectorAll('[data-sonido]')].map(b => `${b.dataset.sonido}:${b.getAttribute('aria-pressed')}`).join(' '));
  await foto('opciones_sin_sonido');
  console.log(`${tag} «Sin sonido»: ${JSON.stringify(s)} · botones ${pres} · desplazamiento ${st0} → ${st1}`);
  if (s.encendido || s.contexto === 'running' || s.silencio) mal(`«Sin sonido» no apagó el audio (${JSON.stringify(s)})`);
  if (pres !== 'si:false no:true') mal(`los botones de Sonido no muestran el estado: ${pres}`);
  if (Math.abs(st1 - st0) > 2) mal(`tocar una opción hizo saltar el panel (${st0} → ${st1})`);
  if (await J(() => localStorage.getItem('tarima.sonido')) !== '0') mal('«Sin sonido» no quedó guardado');
  await toca('[data-sonido="si"]'); await av(450); await page.waitForTimeout(150);
  s = await audio();
  if (!s.encendido || s.contexto !== 'running' || s.sesion !== 'playback') mal(`«Con sonido» no lo volvió a prender (${JSON.stringify(s)})`);

  // ---------- 3. el aviso se vuelve a pedir desde Opciones ----------
  if (!await toca('[data-instalar]')) mal('Opciones no ofrece cómo verlo a pantalla completa');
  else { await av(450); A = await aviso(); await foto('aviso_desde_opciones'); if (!A.ve || !PASOS[C.nav][C.lang].test(A.texto)) mal(`desde Opciones no volvió el aviso con los pasos de ${C.nav}`); await toca('#instalar-ok'); }

  // ---------- 2. «Cómo se juega» (#sobre), el panel más largo ----------
  await toca('#btn-ayuda'); await page.waitForTimeout(200);
  const S = () => J(() => { const pn = document.querySelector('#sobre .panel'); return pn ? { st: Math.round(pn.scrollTop), max: pn.scrollHeight - pn.clientHeight, r: pn.getBoundingClientRect().toJSON() } : null; });
  let h = await S();
  if (!h) mal('«Cómo se juega» no se abrió');
  else if (h.max > 4) {
    const x = Math.round(h.r.left + h.r.width / 2), y = Math.round(h.r.top + h.r.height * .7);
    await arrastra(x, y, -170); const h1 = await S(); await foto('ayuda_dedo');
    console.log(`${tag} «Cómo se juega»: desplazamiento ${h.st} → ${h1.st} de ${h.max}`);
    if (h1.st < Math.min(h.max, 60)) mal(`«Cómo se juega» no se desplaza con el dedo (${h.st} → ${h1.st} de ${h.max})`);
    const D2 = await doc(); if (D2.y || D2.se) mal('al arrastrar «Cómo se juega» se movió la página');
  }
  if (h) { await J(() => JUEGO.seguir()); }

  // ---------- 1. el parlante de la barra, ya en la partida ----------
  await toca('#btn-empezar');
  let vista = false;
  for (let i = 0; i < 400 && !vista; i++) {
    vista = await J(() => { const b = document.getElementById('sonidob'); return !!b && !b.hidden && b.offsetParent !== null; });
    if (vista) break;
    const pend = await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)'));
    if (pend) { await toca('#capa .panel button.ir'); await av(450); } else await av(200);
  }
  if (!vista) mal('el parlante de la barra (#sonidob) no apareció en la partida');
  else {
    const barra = () => J(() => { const b = document.getElementById('sonidob'), r = b.getBoundingClientRect(), pa = document.getElementById('pausa').getBoundingClientRect(), ay = document.getElementById('ayudab')?.getBoundingClientRect(); const cruza = (a, c) => a && c && c.width && a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1; const bug = document.querySelector('.bug')?.getBoundingClientRect(), rel = document.querySelector('.relojbox')?.getBoundingClientRect(); return { pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), apagado: b.classList.contains('apagado'), svg: !!b.querySelector('svg'), cruces: [cruza(r, pa) && 'pausa', cruza(r, ay) && 'ayuda', cruza(r, bug) && 'título', cruza(r, rel) && 'reloj'].filter(Boolean), caja: [r.left, r.top, r.right, r.bottom].map(Math.round) }; });
    let B = await barra(); await foto('barra_con_sonido');
    if (B.pressed !== 'true' || B.apagado || !B.svg) mal(`el parlante no muestra «prendido»: ${JSON.stringify(B)}`);
    if (B.cruces.length) mal(`el parlante tapa: ${B.cruces.join(', ')} (${B.caja})`);
    await toca('#sonidob'); B = await barra(); s = await audio(); await foto('barra_sin_sonido');
    console.log(`${tag} parlante de la barra: ${JSON.stringify(B)} · ${JSON.stringify(s)}`);
    if (B.pressed !== 'false' || !B.apagado || s.encendido) mal(`el parlante no apagó el sonido o no lo muestra: ${JSON.stringify(B)} ${JSON.stringify(s)}`);
    // apagado se recuerda al recargar, y ningún toque crea audio
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.JUEGO?.listo && document.querySelector('#capa .panel.bienvenida'), null, { timeout: 120000 });
    await J(() => JUEGO.test.manual()); await av(450);
    A = await aviso(); if (A.ve) mal('el aviso para instalar volvió a salir después de cerrarlo');
    await toca('#btn-opciones'); await av(450); s = await audio();
    const pres2 = await J(() => [...document.querySelectorAll('[data-sonido]')].map(b => `${b.dataset.sonido}:${b.getAttribute('aria-pressed')}`).join(' '));
    console.log(`${tag} después de recargar: ${JSON.stringify(s)} · ${pres2}`);
    if (s.encendido || s.contexto !== 'sin contexto') mal(`apagado no se recordó o un toque creó audio igual (${JSON.stringify(s)})`);
    if (pres2 !== 'si:false no:true') mal(`después de recargar Opciones no muestra «Sin sonido»: ${pres2}`);
    await toca('[data-sonido="si"]'); await page.waitForTimeout(200); s = await audio();
    if (!s.encendido || s.contexto !== 'running') mal(`«Con sonido» después de recargar no prendió el audio en el mismo toque (${JSON.stringify(s)})`);
  }
  await ctx.close();
}

try { for (const C of CASOS.filter(c => !SOLO || c.nombre === SOLO)) await correr(C); }
catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close(); server.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 50)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: iPhone acostado (Safari y Chrome de iOS, 340 a 430 px de alto): sonido desde el primer toque y con el parlante, Opciones y «Cómo se juega» se desplazan con el dedo sin cortar botones, y el aviso de pantalla completa con los pasos de cada navegador');
