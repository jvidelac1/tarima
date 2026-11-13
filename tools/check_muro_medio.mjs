// Prueba de punta a punta del muro en el medio de la final (regla de producción GRATIS_ETAPA='arranque', docs/MVP.md 5.5),
// con el Worker de verdad sobre una D1 falsa (tools/servidor_local.mjs: sin cuenta de Cloudflare, sin red, sin PostHog) y
// las variables de worker/wrangler.jsonc. Dos jugadores nuevos, cada uno con su servidor (base vacía):
//  - en: computadora (1280 × 720), en inglés, todo con teclado. Juega el arranque de su final gratis, ve el muro en el
//    intervalo (momento 'tras_arranque'), prueba la API a mano (el dos tiempos sin correo es muro), se anota con un correo
//    de prueba y la MISMA final sigue con el dos tiempos sin recargar, hasta el podio.
//  - es: teléfono de costado (844 × 390, táctil), en español, todo con toques. Juega el arranque, ve el muro, «Ahora no»:
//    la tabla del arranque y «La final termina aquí», vuelve al inicio; «Jugar» da el muro antes del primer intento
//    (momento 'inicio'); recarga y sigue el muro (al cargar); contesta la encuesta y la final siguiente sale completa.
// Además: la base (etapa de cada partida, lista, encuesta), los eventos (muro_visto con momento, anotar_ok, envion_ok,
// muro_cerrado, final_cortada) sin correo ni nombre, y capturas de cada momento en out/muro_medio/<idioma>/.
// Uso: node tools/check_muro_medio.mjs [--solo=en|es] [--headed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { iniciarServidorLocal } from './servidor_local.mjs';
import ES from '../web/js/game/i18n/es.js';
import EN from '../web/js/game/i18n/en.js';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'out', 'muro_medio');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const SOLO = arg('solo'), HEADED = process.argv.includes('--headed');
fs.mkdirSync(OUT, { recursive: true });
const problemas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const CORREO = 'jugador.intervalo@pruebas-tarima.com';      // example.com está en la lista de descartables del Worker

async function escenario(L) {
  const tactil = L === 'es', D = L === 'es' ? ES : EN, tag = `[${L}]`, dir = path.join(OUT, L); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const srv = await iniciarServidorLocal({ silencio: true });
  if (srv.env.GRATIS_ETAPA !== 'arranque') problemas.push(`${tag} el servidor local no tiene la regla del arranque gratis (GRATIS_ETAPA=${srv.env.GRATIS_ETAPA})`);
  const base = srv.url.replace(/\/$/, '');
  const ctx = await browser.newContext(tactil
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'es-AR' }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
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
    await page.goto(`${base}/?dibujo=0&q=baja&semilla=2026112${tactil ? 3 : 2}`, { waitUntil: 'load' });
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
    const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible()) || !(await l.isEnabled())) { mal(`no se pudo pulsar ${sel}`); return false; }
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
  const marca = async sel => { if (tactil) await page.locator(sel).tap(); else { await page.locator(sel).focus(); await page.keyboard.press('Space'); } };

  /** Juega lo que haya en pantalla hasta `hasta(estado)`: señales en su momento, botones principales, saltea rivales. */
  async function jugar(hasta, que, minutos = 14) {
    const t0 = Date.now(); let ultToque = 0, hecho = '', firma = '', tFirma = Date.now(), traza = [];
    for (let n = 0; ; n++) {
      if (Date.now() - t0 > minutos * 60000) throw new Error(`${que}: no avanza en ${minutos} min (${traza.slice(-5).join(' / ')})`);
      const s = await J(() => JUEGO.estado());
      if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
      if (hasta(s)) return s;
      const f = `${s.pantalla}${s.panel ? ' panel' : ''}`; if (f !== firma) { firma = f; tFirma = Date.now(); traza.push(f); if (traza.length > 30) traza.shift(); }
      if (s.pantalla === 'muro' && s.panel) throw new Error(`${que}: apareció el muro antes de lo esperado (fase ${s.fase})`);
      const I = s.intento;
      if (I && I.propio && s.modo !== 'panel') {
        const g = I.senal; if (!g) { await av(20); continue; }
        if (I.parado) { await av(80); await toque(); continue; }
        if (UNTOQUE.has(g.tipo)) { await av(150); await toque(); continue; }
        if (g.tipo === 'cierre') { const k = g.clave + g.desde; if (I.seDetiene || hecho === k) { await av(30); continue; } await ir(g.objetivo); await toque(); hecho = k; continue; }
        if (g.tipo === 'empuja') { if (s.ahora - ultToque >= 150) { await toque(); ultToque = s.ahora; } else await av(16); continue; }
        await av(30); continue;
      }
      if (s.panel && !s.sobre) {
        const hay = await J(() => !!document.querySelector('#capa .panel button.ir:not(:disabled)'));
        if (hay) { await av(450); const l = page.locator('#capa .panel button.ir:not(:disabled)').first(); if (await l.count() && await l.isVisible()) { if (tactil) await l.tap(); else { await l.focus(); await page.keyboard.press('Enter'); } await av(60); continue; } }
        if (Date.now() - tFirma > 20000) throw new Error(`${que}: panel sin salida en «${s.pantalla}»`);
      }
      await av(['rival', 'decision', 'repeticion', 'repeticion_rival'].includes(s.pantalla) ? 450 : 200);
      if (['decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado', 'rival'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) await toque();
    }
  }
  const enMuro = s => s.pantalla === 'muro' && !!s.panel;
  const ultimo = async nombre => (await eventos()).filter(e => e.ev === nombre).at(-1)?.props;
  const texto = sel => J(sel => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
  const esperar = async (fn, que, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await J(fn)) return true; await av(100); await page.waitForTimeout(30); } mal(`no apareció: ${que}`); return false; };
  const partidas = async () => (await srv.db.prepare('SELECT fuente, etapa, envion_por FROM partidas ORDER BY id').all()).results.map(r => `${r.fuente}/${r.etapa}${r.envion_por ? '/' + r.envion_por : ''}`);
  const nombreVisto = tactil ? 'Ana' : D['bienvenida.nombre_defecto'];

  // ---------- 1. jugador nuevo: bienvenida sin «te queda 1 final» ----------
  await abrir();
  if ((await J(() => JUEGO.estado())).idioma !== L) mal('idioma detectado distinto del esperado');
  if (await J(() => !!document.querySelector('#capa .quedan'))) mal(`la bienvenida promete finales: «${await texto('#capa .quedan')}»`);
  if (tactil) await escribir('#nombre', 'Ana');
  await foto('bienvenida');

  // ---------- 2. el arranque y el muro en el intervalo ----------
  let s = await jugar(enMuro, 'arranque de la final gratis');
  await av(300); await foto('muro_intervalo');
  const muro = await J(() => ({ titulo: document.querySelector('#capa .panel h1')?.textContent || '', txt: document.querySelector('#capa .panel')?.textContent.replace(/\s+/g, ' ') || '', correo: !!document.getElementById('correo'), encuesta: !!document.getElementById('btn-encuesta'), zona: getComputedStyle(document.getElementById('zona')).display, fase: JUEGO.estado().fase, s: JUEGO.E.p?.at?.[JUEGO.E.yo]?.s?.length ?? null, c: JUEGO.E.p?.at?.[JUEGO.E.yo]?.c?.length ?? null }));
  if (muro.fase !== 'intervalo') mal(`el muro no salió en el intervalo (fase ${muro.fase})`);
  if (muro.s !== 3 || muro.c !== 0) mal(`al subir el muro el jugador lleva ${muro.s} arranques y ${muro.c} dos tiempos (se esperaba 3 y 0)`);
  if (muro.titulo !== D['muro.arranque.titulo'].replace('{nombre}', nombreVisto)) mal(`título del muro: «${muro.titulo}»`);
  for (const k of ['muro.arranque.bajada', 'muro.arranque.camino_mail', 'muro.privado', 'muro.arranque.camino_encuesta_1']) if (!muro.txt.includes(D[k])) mal(`el muro no dice «${D[k]}»`);
  if (!muro.correo || !muro.encuesta) mal(`el muro del intervalo no tiene los dos caminos: ${JSON.stringify(muro)}`);
  if (tactil && muro.zona !== 'none') mal('en el muro se ve el botón de levantar');
  { const m = await ultimo('muro_visto'); if (!m || m.momento !== 'tras_arranque' || m.motivo !== 'envion' || m.caminos !== 'mail+encuesta' || m.gratis_etapa !== 'arranque') mal(`muro_visto en el intervalo: ${JSON.stringify(m)}`); }
  { const p = await partidas(); if (p.join() !== 'gratis/arranque') mal(`en la base, antes de decidir: ${p.join(' ')}`); }
  // El dos tiempos sin correo, por la API a mano con el pase de la pestaña: muro.
  { const r = await J(async () => { const p = JSON.parse(sessionStorage.getItem('tarima.pase') || '{}'); const x = await fetch('/api/envion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dispositivo: localStorage.getItem('tarima.dispositivo'), pase: p.pase }) }); return { etapa: p.etapa, j: await x.json() }; });
    if (r.etapa !== 'arranque' || r.j.estado !== 'muro') mal(`la API a mano dio el dos tiempos sin correo: ${JSON.stringify(r)}`); }

  if (!tactil) {
    // ---------- 3 (en). se anota en el muro y la MISMA final sigue con el dos tiempos ----------
    await escribir('#correo', CORREO); await marca('#aviso'); await foto('muro_con_correo');
    if (await texto('#btn-anotar') !== D['muro.arranque.boton']) mal(`el botón del muro dice «${await texto('#btn-anotar')}»`);
    await pulsa('#btn-anotar');
    await esperar(() => !!document.getElementById('btn-seguir'), 'el panel de anotado');
    await foto('anotado');
    if (await texto('#btn-seguir') !== D['lista.seguir_envion']) mal(`el anotado dice «${await texto('#btn-seguir')}»`);
    if (await J(() => !!document.getElementById('btn-encuesta'))) mal('en el medio de la final el anotado ofrece la encuesta');
    { const a = await ultimo('anotar_ok'); if (!a || a.momento !== 'tras_arranque' || a.pantalla !== 'muro') mal(`anotar_ok: ${JSON.stringify(a)}`); }
    await pulsa('#btn-seguir');
    await esperar(() => JUEGO.estado().pantalla === 'intervalo' && !!document.getElementById('btn-confirmar'), 'el primer peso del dos tiempos');
    await av(200); await foto('dos_tiempos');
    { const e = await ultimo('envion_ok'); if (!e || e.via !== 'lista') mal(`envion_ok: ${JSON.stringify(e)}`); }
    { const p = await partidas(); if (p.join() !== 'gratis/completa/lista') mal(`en la base, después de anotarse: ${p.join(' ')}`); }
    s = await jugar(x => x.pantalla === 'fin', 'el dos tiempos después de anotarse');
    await av(400); await foto('podio');
    { const f = (await eventos()).filter(e => e.ev === 'final_fin'); if (f.length !== 1 || f[0].props.n !== 1) mal(`final_fin: ${JSON.stringify(f)}`); }
    const c = await J(() => JUEGO.E.p?.at?.[JUEGO.E.yo]?.c?.length ?? null); if (c !== 3) mal(`se jugaron ${c} dos tiempos`);
    if ((await partidas()).length !== 1) mal('el dos tiempos pidió otra partida');
  } else {
    // ---------- 3 (es). «Ahora no»: la tabla del arranque y la final termina ----------
    await pulsa('#btn-ahora-no');
    await esperar(() => !!document.querySelector('#capa .panel.corte'), 'el panel de la final cortada');
    await foto('final_cortada');
    if (await texto('#capa .panel h1') !== D['corte.titulo']) mal(`el corte dice «${await texto('#capa .panel h1')}»`);
    if (!await J(() => !!document.querySelector('#capa .panel table, #capa .panel tr'))) mal('el corte no muestra la tabla del arranque');
    if (!(await texto('#capa .panel')).includes(D['corte.texto'])) mal(`el corte no dice «${D['corte.texto']}»`);
    await pulsa('#capa .panel #btn-volver');
    await esperar(() => JUEGO.estado().pantalla === 'inicio' && !!document.getElementById('btn-empezar'), 'la bienvenida después del corte');
    await foto('bienvenida_tras_corte');
    { const ev = await eventos(); const c = ev.filter(e => e.ev === 'muro_cerrado').at(-1)?.props, k = ev.filter(e => e.ev === 'final_cortada').at(-1)?.props;
      if (c?.momento !== 'tras_arranque') mal(`muro_cerrado: ${JSON.stringify(c)}`);
      if (k?.momento !== 'tras_arranque') mal(`final_cortada: ${JSON.stringify(k)}`);
      if (ev.some(e => e.ev === 'final_fin')) mal('la final cortada mandó final_fin'); }

    // ---------- 4 (es). «Jugar» otra vez: muro antes del primer intento ----------
    await pulsa('#btn-empezar');
    s = await jugar(enMuro, 'la final siguiente');
    await av(300); await foto('muro_inicio');
    if (s.fase !== null && s.intento) mal('el muro del inicio salió con un intento en curso');
    if (await texto('#capa .panel h1') !== D['muro.inicio.titulo'].replace('{nombre}', nombreVisto)) mal(`título del muro del inicio: «${await texto('#capa .panel h1')}»`);
    { const m = await ultimo('muro_visto'); if (!m || m.momento !== 'inicio' || m.motivo !== 'dispositivo') mal(`muro_visto antes de la final: ${JSON.stringify(m)}`); }
    if ((await partidas()).length !== 1) mal(`el muro del inicio gastó una partida: ${(await partidas()).join(' ')}`);

    // ---------- 5 (es). recarga: el muro sigue (no regala otro arranque) ----------
    await abrir();
    if (!await esperar(() => JUEGO.estado().pantalla === 'muro' && !!document.getElementById('correo'), 'el muro al recargar')) await foto('recarga_sin_muro');
    await foto('muro_recarga');
    { const m = await ultimo('muro_visto'); if (!m || m.momento !== 'inicio' || m.origen !== 'carga') mal(`muro_visto al recargar: ${JSON.stringify(m)}`); }

    // ---------- 6 (es). la encuesta: una final completa ----------
    await pulsa('#btn-encuesta'); await esperar(() => !!document.getElementById('btn-enviar'), 'la encuesta');
    if (!(await texto('#capa .panel .cuenta')).includes(D['encuesta.premio_completa_1'])) mal(`la encuesta promete «${await texto('#capa .panel .cuenta')}»`);
    for (const sel of ['.op[data-q="q1"][data-o="carrera"]', '.op[data-q="q2"][data-o="largo"]', '.op[data-q="q3"][data-o="telefono"]', '.op[data-q="q4"][data-o="unico"]']) await marca(sel);
    await foto('encuesta');
    await pulsa('#btn-enviar');
    await esperar(() => JUEGO.estado().pantalla === 'inicio' && !!document.getElementById('btn-empezar'), 'la bienvenida después de la encuesta');
    { const e = await ultimo('encuesta_enviada'); if (!e || e.con_premio !== true || e.momento !== 'inicio') mal(`encuesta_enviada: ${JSON.stringify(e)}`); }
    await pulsa('#btn-empezar');
    s = await jugar(x => ['presentacion', 'apertura'].includes(x.pantalla), 'la final de la encuesta', 6);
    await foto('final_encuesta');
    { const p = await ultimo('partida_pedida'); if (p?.fuente !== 'encuesta') mal(`la final de la encuesta salió con fuente ${JSON.stringify(p)}`); }
    { const p = await partidas(); if (p.join(' ') !== 'gratis/arranque encuesta/completa') mal(`en la base: ${p.join(' ')}`); }
  }

  { const todos = await eventos(), sucio = todos.filter(e => JSON.stringify(e.props).includes('@') || /\bAna\b/.test(JSON.stringify(e.props)));
    if (sucio.length) mal(`eventos con el correo o el nombre: ${JSON.stringify(sucio.slice(0, 3))}`); }
  const db = { partidas: (await partidas()).join(' '), lista: await srv.db.prepare('SELECT COUNT(*) n FROM lista').first('n'), encuestas: await srv.db.prepare('SELECT COUNT(*) n FROM encuestas').first('n') };
  if (db.lista !== (tactil ? 0 : 1) || db.encuestas !== (tactil ? 1 : 0)) mal(`en la base: ${JSON.stringify(db)}`);
  console.log(`${tag} ${tactil ? 'arranque · muro · Ahora no · tabla y fin · muro al empezar · recarga · encuesta · final completa' : 'arranque · muro · API a mano negada · correo · dos tiempos en la misma final · podio'} · base: ${JSON.stringify(db)} · ${nFoto} capturas en ${path.relative(ROOT, dir)}`);
  await ctx.close();
  await srv.cerrar();
}

try { for (const L of ['en', 'es'].filter(x => !SOLO || x === SOLO)) await escenario(L); }
catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close();
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 40)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: muro en el medio de la final con el Worker local, en inglés con teclado y en español en el teléfono con toques');
