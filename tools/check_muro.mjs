// Prueba de punta a punta del muro con la REGLA VIEJA (GRATIS_ETAPA='final', GRATIS=2, BONO_ENCUESTA=2: la que se
// recupera cambiando esas variables del Worker; la de producción, el arranque gratis, la prueba tools/check_muro_medio.mjs)
// (docs/MVP.md, secciones 2, 5 y 7), con el Worker de verdad sobre una D1 falsa
// (tools/servidor_local.mjs: sin cuenta de Cloudflare, sin red y sin PostHog). Dos jugadores nuevos, cada uno con su
// propio servidor (base vacía):
//  - en: computadora (1280 × 720), navegador en inglés, todo con teclado. Juega 2 finales (después de la primera, la
//    invitación del podio y «1 free final left»), ve el muro en el podio, recarga y lo sigue viendo (al cargar), contesta
//    la encuesta, juega 2 finales más, vuelve el muro sin la encuesta, deja el correo y queda libre: la final siguiente
//    sale con fuente «lista», y al recargar la bienvenida dice «unlimited play».
//  - es: teléfono de costado (844 × 390, táctil), navegador con el inglés primero y el español después (el caso del
//    dueño: tiene que salir en español), todo con toques; los campos se escriben en el editor de arriba (telefono.js).
// Además: la cuenta en la base (partidas, encuesta, lista), que ningún evento lleve el correo o el nombre, y capturas de
// cada momento en out/muro/<idioma>/.
// Uso: node tools/check_muro.mjs [--solo=en|es] [--headed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { iniciarServidorLocal } from './servidor_local.mjs';
import ES from '../web/js/game/i18n/es.js';
import EN from '../web/js/game/i18n/en.js';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'out', 'muro');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SOLO = arg('solo'), HEADED = process.argv.includes('--headed');
fs.mkdirSync(OUT, { recursive: true });      // cada escenario borra solo su carpeta (el flujo corre en, después es)
const problemas = [], notas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const CORREO = { en: 'player.one@pruebas-tarima.com', es: 'ana.prueba@pruebas-tarima.com' };      // example.com está en la lista de descartables del Worker

async function escenario(L) {
  const tactil = L === 'es', D = L === 'es' ? ES : EN, tag = `[${L}]`, dir = path.join(OUT, L); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const srv = await iniciarServidorLocal({ silencio: true, vars: { GRATIS_ETAPA: 'final', GRATIS: '2', BONO_ENCUESTA: '2' } });
  const base = srv.url.replace(/\/$/, '');
  const ctx = await browser.newContext(tactil
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'en-US' }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
  // el teléfono del caso del dueño: el inglés primero en la lista de idiomas del navegador y el español después
  if (tactil) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'es-AR'] }); });
  const page = await ctx.newPage(), cdp = tactil ? await ctx.newCDPSession(page) : null;
  const mal = txt => { const m = `${tag} ${txt}`; if (!problemas.includes(m)) problemas.push(m); };
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400 && !/\/api\/(anotar|encuesta)$/.test(new URL(r.url()).pathname)) mal(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (!r.url().startsWith(base) && !/^(data|blob):/.test(r.url())) mal(`pedido externo: ${r.url()}`); });
  const J = (fn, a) => page.evaluate(fn, a);
  let nFoto = 0;
  const foto = async nombre => { await J(() => { try { window.JUEGO?.escena?.cuadro?.(0, true); } catch { /* sin escena */ } }).catch(() => null); await page.screenshot({ path: path.join(dir, `${String(++nFoto).padStart(2, '0')}_${nombre}.png`) }).catch(() => null); };
  const eventos = () => J(() => (window.JUEGO?.eventos || []).map(e => ({ ev: e.ev, props: e.props })));
  const abrir = async () => {
    await page.goto(`${base}/?dibujo=0&q=baja&semilla=2026111${tactil ? 3 : 2}`, { waitUntil: 'load' });
    if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
    await J(() => JUEGO.test.manual());
  };
  const av = ms => J(ms => JUEGO.test.avanzar(ms), ms), ir = t => J(t => JUEGO.test.hasta(t, 8), t);
  const zona = async () => { const b = await page.locator('#zona').boundingBox().catch(() => null); return b && b.width ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } : { x: 6, y: 195 }; };
  const baja = async () => { if (tactil) { const p = await zona(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); } else await page.keyboard.down('Space'); };
  const sube = async () => { if (tactil) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space'); };
  const toque = async () => { await baja(); await av(30); await sube(); };
  /** Activa un botón: con el dedo, un toque; con teclado, foco y Enter (la vía real, sin mouse). */
  const pulsa = async sel => {
    const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible()) || !(await l.isEnabled())) return false;
    if (tactil) await l.tap(); else { await l.focus(); await page.keyboard.press('Enter'); }
    return true;
  };
  /** Escribe en un campo: con el dedo, en el editor de arriba («Listo» lo devuelve); con teclado, directo. */
  const escribir = async (sel, txt) => {
    if (tactil) {
      await page.locator(sel).tap(); await page.waitForTimeout(150);
      if (!await J(() => !document.getElementById('editor').hidden && document.activeElement?.id === 'editor-campo')) mal(`al tocar ${sel} no se abrió el editor de arriba`);
      await page.keyboard.type(txt); await page.locator('#editor-listo').tap(); await page.waitForTimeout(100);
    } else { await page.locator(sel).focus(); await page.keyboard.type(txt); }
    const v = await J(sel => document.querySelector(sel)?.value, sel); if (v !== txt) mal(`en ${sel} quedó «${v}» en lugar de «${txt}»`);
  };
  /** Marca una casilla o elige una opción. */
  const marca = async sel => { if (tactil) await page.locator(sel).tap(); else { await page.locator(sel).focus(); await page.keyboard.press('Space'); } };

  /** Juega lo que haya en pantalla hasta `hasta(estado)`: señales en su momento, botones principales, saltea rivales. */
  async function jugar(hasta, que, minutos = 12) {
    const t0 = Date.now(); let ultToque = 0, hecho = '', firma = '', tFirma = Date.now(), traza = [];
    for (let n = 0; ; n++) {
      if (Date.now() - t0 > minutos * 60000) throw new Error(`${que}: no avanza en ${minutos} min (${traza.slice(-5).join(' / ')})`);
      const s = await J(() => JUEGO.estado());
      if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
      if (hasta(s)) return s;
      const f = `${s.pantalla}${s.panel ? ' panel' : ''}`; if (f !== firma) { firma = f; tFirma = Date.now(); traza.push(f); if (traza.length > 30) traza.shift(); }
      if (s.pantalla === 'muro' && s.panel) throw new Error(`${que}: apareció el muro antes de lo esperado`);      // sin panel: el muro ya se cerró y la final está cargando
      const I = s.intento;
      if (I && I.propio && s.modo !== 'panel') {
        const g = I.senal; if (!g) { await av(20); continue; }
        if (I.parado) { await av(80); await toque(); continue; }
        if (g.tipo === 'libre') { await av(150); await toque(); continue; }
        if (g.tipo === 'cierre') { const k = g.clave + g.desde; if (I.seDetiene || hecho === k) { await av(30); continue; } await ir(g.objetivo); await toque(); hecho = k; continue; }
        if (g.tipo === 'empuja') { if (s.ahora - ultToque >= 150) { await toque(); ultToque = s.ahora; } else await av(16); continue; }
        await av(30); continue;
      }
      if (s.panel && !s.sobre) {
        const hay = await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)'));
        if (hay) { await av(450); if (await pulsa('#capa .panel button.ir:not(:disabled)')) { await av(60); continue; } }
        // el panel de la encuesta o del anotado lo maneja la prueba; si se queda quieto mucho, algo anda mal
        if (Date.now() - tFirma > 20000) throw new Error(`${que}: panel sin salida en «${s.pantalla}»`);
      }
      await av(['rival', 'decision', 'repeticion', 'repeticion_rival'].includes(s.pantalla) ? 450 : 200);
      if (['decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado', 'rival'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) await toque();      // saltear
    }
  }
  const enFin = s => s.pantalla === 'fin';
  const enMuro = s => s.pantalla === 'muro' && !!s.panel;
  const ultimo = async nombre => (await eventos()).filter(e => e.ev === nombre).at(-1)?.props;
  const texto = sel => J(sel => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
  /** Espera que aparezca algo en el DOM con el reloj del juego corriendo (las esperas del flujo van con ese reloj). */
  const esperar = async (fn, que, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await J(fn)) return true; await av(100); await page.waitForTimeout(30); } mal(`no apareció: ${que}`); return false; };

  // ---------- 1. jugador nuevo: bienvenida en su idioma ----------
  await abrir();
  let s = await J(() => JUEGO.estado());
  if (s.idioma !== L) mal(`el idioma detectado es «${s.idioma}» (se esperaba «${L}»)`);
  if (await texto('#btn-empezar') !== D['bienvenida.jugar']) mal(`la bienvenida no dice «${D['bienvenida.jugar']}»: «${await texto('#btn-empezar')}»`);
  if (!(await eventos()).some(e => e.ev === 'juego_abierto' && e.props.pantalla_inicial === 'bienvenida')) mal('falta juego_abierto con pantalla_inicial=bienvenida');
  if (tactil) await escribir('#nombre', 'Ana');
  await foto('bienvenida');

  // ---------- 2. final 1: invitación suave y «te queda 1 final» ----------
  s = await jugar(enFin, 'final 1');
  await av(400); await foto('podio_1');
  const otra1 = await texto('#btn-revancha');
  if (otra1 !== D['podio.otra_quedan']) mal(`después de la final 1 el botón dice «${otra1}» (se esperaba «${D['podio.otra_quedan']}»)`);
  if (!await J(() => !!document.querySelector('#podio-extra .invitacion'))) mal('después de la final 1 no está la invitación a la lista');
  const p1 = (await eventos()).filter(e => e.ev === 'partida_pedida');
  if (p1.length !== 1 || p1[0].props.resultado !== 'ok' || p1[0].props.fuente !== 'gratis') mal(`partida_pedida de la final 1: ${JSON.stringify(p1)}`);

  // ---------- 3. final 2 y el muro en el podio ----------
  await pulsa('#btn-revancha');
  s = await jugar(enMuro, 'final 2');
  await av(300); await foto('muro_podio');
  const muro1 = await J(() => ({ titulo: document.querySelector('#capa .panel h1')?.textContent, correo: !!document.getElementById('correo'), encuesta: !!document.getElementById('btn-encuesta'), zona: getComputedStyle(document.getElementById('zona')).display, idioma: !!document.querySelector('#capa .panel .idi') }));
  if (!muro1.correo || !muro1.encuesta) mal(`el muro de la final 2 no tiene los dos caminos: ${JSON.stringify(muro1)}`);
  if (!muro1.idioma) mal('el muro no tiene el selector ES · EN');
  if (tactil && muro1.zona !== 'none') mal('en el muro se ve el botón de levantar');
  const nombreVisto = tactil ? 'Ana' : D['bienvenida.nombre_defecto'];
  if (!muro1.titulo?.includes(nombreVisto)) mal(`el título del muro no lleva el nombre «${nombreVisto}»: «${muro1.titulo}»`);
  { const m = await ultimo('muro_visto'); if (!m || m.origen !== 'podio' || m.caminos !== 'mail+encuesta') mal(`muro_visto en el podio: ${JSON.stringify(m)}`); }

  // ---------- 4. recarga: el muro sigue (lo dice el servidor) ----------
  await abrir();
  if (!await esperar(() => JUEGO.estado().pantalla === 'muro' && !!document.getElementById('correo'), 'el muro después de recargar')) await foto('recarga_sin_muro');
  await foto('muro_recarga');
  if (!(await eventos()).some(e => e.ev === 'juego_abierto' && e.props.pantalla_inicial === 'muro')) mal('al recargar, juego_abierto no dice pantalla_inicial=muro');
  { const m = await ultimo('muro_visto'); if (!m || m.origen !== 'carga') mal(`muro_visto al recargar: ${JSON.stringify(m)}`); }

  // ---------- 5. la encuesta: +2 finales ----------
  await pulsa('#btn-encuesta'); await esperar(() => !!document.getElementById('btn-enviar'), 'la encuesta');
  await foto('encuesta');
  await pulsa('#btn-enviar'); await av(100);      // sin contestar: tiene que pedir las 4 primeras
  if (await texto('#capa .panel #err') !== D['encuesta.falta']) mal(`enviar la encuesta vacía no pidió las 4 primeras: «${await texto('#capa .panel #err')}»`);
  for (const sel of ['.op[data-q="q1"][data-o="mujeres_categorias"]', '.op[data-q="q1"][data-o="sedes"]', '.op[data-q="q2"][data-o="largo"]', '.op[data-q="q3"][data-o="telefono"]', '.op[data-q="q4"][data-o="cosmeticos"]']) await marca(sel);
  await escribir('#q5', 'Más pesistas');
  await foto('encuesta_contestada');
  await pulsa('#btn-enviar');
  await esperar(() => JUEGO.estado().pantalla === 'inicio' && !!document.getElementById('btn-empezar'), 'la bienvenida después de la encuesta');
  await foto('bienvenida_con_2');
  { const e = await ultimo('encuesta_enviada'); if (!e || e.con_premio !== true) mal(`encuesta_enviada: ${JSON.stringify(e)}`); }
  const q2 = await texto('#capa .quedan');
  if (q2 !== D['bienvenida.quedan'].replace('{n}', '2')) mal(`después de la encuesta la bienvenida dice «${q2}» (se esperaba «${D['bienvenida.quedan'].replace('{n}', '2')}»)`);

  // ---------- 6. finales 3 y 4 (las de la encuesta) y el muro sin la encuesta ----------
  s = await jugar(enFin, 'final 3');
  { const p = await ultimo('partida_pedida'); if (p?.fuente !== 'encuesta') mal(`la final 3 no salió con fuente «encuesta»: ${JSON.stringify(p)}`); }
  await av(400);
  if (await texto('#btn-revancha') !== D['podio.otra_quedan']) mal(`después de la final 3 el botón dice «${await texto('#btn-revancha')}»`);
  await pulsa('#btn-revancha');
  s = await jugar(enMuro, 'final 4');
  await av(300); await foto('muro_solo_correo');
  const muro2 = await J(() => ({ encuesta: !!document.getElementById('btn-encuesta'), txt: document.querySelector('#capa .panel')?.textContent || '' }));
  if (muro2.encuesta) mal('después de usar las finales de la encuesta el muro sigue ofreciendo la encuesta');
  if (!muro2.txt.includes(D['muro.solo_mail'])) mal(`el segundo muro no dice «${D['muro.solo_mail']}»`);
  { const m = await ultimo('muro_visto'); if (!m || m.caminos !== 'mail') mal(`muro_visto después de la encuesta: ${JSON.stringify(m)}`); }

  // ---------- 7. deja el correo: juego libre ----------
  await pulsa('#btn-anotar'); await av(100);      // sin correo: error de formato, sin mandar nada
  if (await texto('#capa .panel #err') !== D['lista.error_formato']) mal(`anotarse sin correo no dio el error de formato: «${await texto('#capa .panel #err')}»`);
  await escribir('#correo', CORREO[L]);
  await pulsa('#btn-anotar'); await av(100);      // sin la casilla de aviso: error
  if (await texto('#capa .panel #err') !== D['lista.error_aviso']) mal(`anotarse sin la casilla de aviso no dio su error: «${await texto('#capa .panel #err')}»`);
  await marca('#aviso'); await foto('muro_con_correo');
  await pulsa('#btn-anotar');
  await esperar(() => !!document.getElementById('btn-seguir'), 'el panel de anotado');
  await foto('anotado');
  const anot = await texto('#capa .panel h2');
  if (anot !== D['lista.ok'].replace('{nombre}', nombreVisto)) mal(`el panel de anotado dice «${anot}»`);
  { const a = await ultimo('anotar_ok'); if (!a || a.estado !== 'nuevo' || a.pantalla !== 'muro') mal(`anotar_ok: ${JSON.stringify(a)}`); }
  await pulsa('#btn-seguir');
  s = await jugar(x => ['presentacion', 'apertura'].includes(x.pantalla), 'la final después de anotarse', 4);
  { const p = await ultimo('partida_pedida'); if (p?.fuente !== 'lista') mal(`la final después de anotarse no salió con fuente «lista»: ${JSON.stringify(p)}`); }
  await foto('final_libre');
  { const todos = await eventos(), sucio = todos.filter(e => JSON.stringify(e.props).includes('@') || /\bAna\b/.test(JSON.stringify(e.props)));
    if (sucio.length) mal(`eventos con el correo o el nombre: ${JSON.stringify(sucio.slice(0, 3))}`); }

  // ---------- 8. recarga: bienvenida con juego libre ----------
  await abrir(); await av(200);
  s = await J(() => JUEGO.estado());
  if (s.pantalla !== 'inicio') mal(`anotado, al recargar se ve «${s.pantalla}» en lugar de la bienvenida`);
  if (await texto('#capa .quedan') !== D['bienvenida.anotado']) mal(`anotado, la bienvenida dice «${await texto('#capa .quedan')}»`);
  await foto('bienvenida_anotado');

  // ---------- lo que quedó en el servidor y en las métricas ----------
  const db = { partidas: await srv.db.prepare('SELECT COUNT(*) n FROM partidas').first('n'), lista: await srv.db.prepare('SELECT COUNT(*) n FROM lista').first('n'), encuestas: await srv.db.prepare('SELECT COUNT(*) n FROM encuestas').first('n'), fuentes: (await srv.db.prepare('SELECT fuente, COUNT(*) n FROM partidas GROUP BY fuente ORDER BY fuente').all()).results.map(r => `${r.fuente}:${r.n}`).join(' ') };
  if (db.lista !== 1 || db.encuestas !== 1) mal(`en la base: ${JSON.stringify(db)}`);
  console.log(`${tag} idioma ${L} · 4 finales gratis (2 + 2 de la encuesta) · muro en el podio, al recargar y sin encuesta · anotado y libre · base: ${JSON.stringify(db)} · ${nFoto} capturas en ${path.relative(ROOT, dir)}`);
  await ctx.close();
  await extras(L, base).catch(e => notas.push(`${tag} capturas extra: ${e.message}`));
  await srv.cerrar();
}

/**
 * Capturas extra para la revisión de un jugador nuevo (solo fotos, no fallan la prueba): la página de privacidad, la pausa,
 * y en el teléfono el iPhone de costado (aviso de instalar), en vertical con la rotación trabada (con y sin el editor del
 * nombre abierto). Quedan en out/muro/<idioma>/extra_*.png.
 */
async function extras(L, base) {
  const dir = path.join(OUT, L), q = `?dibujo=0&semilla=2026111${L === 'es' ? 5 : 4}&lang=${L}`;
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
  const casos = L === 'es'
    ? [['iphone', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: IPHONE, locale: 'es-AR' }],
       ['vertical', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: IPHONE, locale: 'es-AR' }]]
    : [['compu', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' }]];
  for (const [nombre, opts] of casos) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), J = (fn, a) => page.evaluate(fn, a);
    const foto = async n => { await J(() => { try { window.JUEGO?.escena?.cuadro?.(0, true); } catch { /* sin escena */ } }).catch(() => null); await page.screenshot({ path: path.join(dir, `extra_${nombre}_${n}.png`) }).catch(() => null); };
    await page.goto(`${base}/${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.JUEGO?.listo, null, { timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(1500); await foto('1_inicio');
    const priv = await J(() => document.querySelector('a[href*="rivac"]')?.href || '').catch(() => '');
    const tactil = !!opts.hasTouch;
    if (tactil) {
      await page.locator('#nombre').tap().catch(() => null); await page.waitForTimeout(300);
      await page.keyboard.type('Sofía'); await foto('2_nombre_teclado');
      await page.locator('#editor-listo').tap().catch(() => null); await page.waitForTimeout(300);
      await page.locator('#btn-empezar').tap().catch(() => null);
    } else { await page.locator('#nombre').fill('Sam').catch(() => null); await page.locator('#btn-empezar').click().catch(() => null); }
    await page.waitForTimeout(2500); await foto('3_tras_jugar');
    await page.waitForTimeout(4000); await foto('4_mas_tarde');
    await page.keyboard.press('Escape').catch(() => null); await page.waitForTimeout(800); await foto('5_pausa');
    if (priv) { await page.goto(priv, { waitUntil: 'load' }); await page.waitForTimeout(500); await page.screenshot({ path: path.join(dir, `extra_${nombre}_6_privacidad.png`), fullPage: true }).catch(() => null); }
    else notas.push(`[${L}] ${nombre}: no encontré el enlace a la privacidad`);
    await ctx.close();
  }
}

try { for (const L of ['en', 'es'].filter(x => !SOLO || x === SOLO)) await escenario(L); }
catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 40)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: muro de punta a punta con el Worker local, en inglés con teclado y en español en el teléfono con toques');
