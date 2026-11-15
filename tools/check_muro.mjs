// Prueba de punta a punta del CARTEL con la regla de producción (LIF-53, decisión del dueño del 15 de noviembre;
// worker/wrangler.jsonc: GRATIS_ETAPA='final', GRATIS=1, ENCUESTA_LIBRE=1), con el Worker de verdad sobre una D1 falsa
// (tools/servidor_local.mjs: sin cuenta de Cloudflare, sin red y sin PostHog). La primera final entera es gratis; al
// terminarla, el cartel con dos caminos: «Leave your email» o «Answer 2 quick questions», cualquiera desbloquea el juego
// libre. Dos jugadores nuevos, cada uno con su propio servidor (base vacía):
//  - en: computadora (1280 × 720), navegador en inglés, todo con teclado. Bienvenida sin elegir pesista; final 1 entera;
//    el cartel en el podio; elige el correo (errores del nombre, del formato y de la casilla), se anota, contesta las
//    preguntas optativas con el teclado y queda en el inicio con las tarjetas de los pesistas; la final siguiente sale
//    por la lista (siguio_jugando); al recargar, «unlimited play».
//  - es: teléfono de costado (844 × 390, táctil), en español con ?lang=es, todo con toques (los campos en el editor de
//    arriba). Final 1; el cartel; «Ahora no» y «Volver al inicio» (muro_resultado cerro); «Jugar» da el cartel antes de
//    empezar; recarga y lo sigue viendo; elige las preguntas: sin contestar no sigue, contestadas desbloquean («¡Gracias!»);
//    la final siguiente sale por la encuesta; al recargar, sin cartel.
// Además: lo que quedó en la base, los eventos de LIF-46 (un muro_resultado por cartel, siguio_jugando), que ningún evento
// lleve el correo o el nombre, la API a mano y capturas de cada momento en out/muro/<idioma>/.
// Uso: node tools/check_muro.mjs [--solo=en|es] [--headed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { saltarRival } from './saltar_rival.mjs';
import { iniciarServidorLocal } from './servidor_local.mjs';
import ES from '../web/js/game/i18n/es.js';
import EN from '../web/js/game/i18n/en.js';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

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
  const srv = await iniciarServidorLocal({ silencio: true });
  if (srv.env.GRATIS_ETAPA !== 'final' || srv.env.GRATIS !== '1' || srv.env.ENCUESTA_LIBRE !== '1') problemas.push(`${tag} el servidor local no tiene la regla de LIF-53 (${JSON.stringify(srv.env)})`);
  const base = srv.url.replace(/\/$/, '');
  const ctx = await browser.newContext(tactil
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'en-US' }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
  // el teléfono con el navegador en español: el español sale por ?lang=es (sin eso, el juego abre en inglés)
  if (tactil) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'languages', { get: () => ['es-AR', 'es', 'en'] }); });
  const page = await ctx.newPage(), cdp = tactil ? await ctx.newCDPSession(page) : null;
  const mal = txt => { const m = `${tag} ${txt}`; if (!problemas.includes(m)) problemas.push(m); };
  // los 400 de /api/anotar y /api/encuesta son a propósito (la API a mano, una pregunta sola): el navegador los anota en la consola
  page.on('console', m => { if (m.type() === 'error' && !/status of 400/.test(m.text())) mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400 && !/\/api\/(anotar|encuesta)$/.test(new URL(r.url()).pathname)) mal(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (!r.url().startsWith(base) && !/^(data|blob):/.test(r.url())) mal(`pedido externo: ${r.url()}`); });
  const J = (fn, a) => page.evaluate(fn, a);
  let nFoto = 0;
  const foto = async nombre => { await J(() => { try { window.JUEGO?.escena?.cuadro?.(0, true); } catch { /* sin escena */ } }).catch(() => null); await page.screenshot({ path: path.join(dir, `${String(++nFoto).padStart(2, '0')}_${nombre}.png`) }).catch(() => null); };
  const eventos = () => J(() => (window.JUEGO?.eventos || []).map(e => ({ ev: e.ev, props: e.props })));
  const abrir = async () => {
    await page.goto(`${base}/?dibujo=0&q=baja&semilla=2026111${tactil ? '3&lang=es' : 2}`, { waitUntil: 'load' });
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
        if (g.tipo === 'barra') { await ir(g.objetivo); await toque(); continue; }      // 'b': toca cuando el puntero pasa por el centro del verde
        if (UNTOQUE.has(g.tipo)) { await av(150); await toque(); continue; }
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
      if (!(I && I.propio) && n % 3 === 0 && await saltarRival(page, tactil)) continue;      // un rival: solo con «Saltar»
      if (['decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado', 'rival'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) await toque();      // saltear
    }
  }
  const enFin = s => s.pantalla === 'fin';
  const enMuro = s => s.pantalla === 'muro' && !!s.panel;
  const ultimo = async nombre => (await eventos()).filter(e => e.ev === nombre).at(-1)?.props;
  const texto = sel => J(sel => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
  /** Espera que aparezca algo en el DOM con el reloj del juego corriendo (las esperas del flujo van con ese reloj). */
  const esperar = async (fn, que, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await J(fn)) return true; await av(100); await page.waitForTimeout(30); } mal(`no apareció: ${que}`); return false; };

  const fuentes = async () => (await srv.db.prepare('SELECT fuente FROM partidas ORDER BY id').all()).results.map(r => r.fuente).join(' ');
  const cuenta = (lista, nombre) => lista.filter(e => e.ev === nombre).length;
  /** El cartel con los dos caminos, sin elegir todavía. */
  async function revisarCartel(que) {
    const x = await J(() => ({ titulo: document.querySelector('#capa .panel h1')?.textContent || '', mail: document.getElementById('btn-via-mail')?.textContent.trim(), preg: document.getElementById('btn-via-preguntas')?.textContent.trim(), nota: document.querySelector('#capa .nota-caminos')?.textContent.trim(), correo: !!document.getElementById('correo'), zona: getComputedStyle(document.getElementById('zona')).display, idioma: !!document.querySelector('#capa .panel .idi'), ancho: [document.documentElement.scrollWidth, innerWidth], txt: document.querySelector('#capa .panel')?.textContent || '' }));
    if (x.mail !== D['muro.via.mail'] || x.preg !== D['muro.via.preguntas'] || x.nota !== D['muro.via.nota']) mal(`${que}: el cartel no tiene los dos caminos: ${JSON.stringify(x).slice(0, 300)}`);
    if (x.correo) mal(`${que}: el cartel ya muestra el formulario antes de elegir`);
    if (!x.idioma) mal(`${que}: el cartel no tiene el selector ES · EN`);
    if (tactil && x.zona !== 'none') mal(`${que}: en el cartel se ve el botón de levantar`);
    if (x.ancho[0] > x.ancho[1]) mal(`${que}: el cartel desplaza la página de costado`);
    if (/\bmonth|\bmes\b|\bmensual|\bprice|precio/i.test(x.txt)) mal(`${que}: el cartel habla de frecuencia o precios`);
    return x;
  }

  // ---------- 1. jugador nuevo: bienvenida en su idioma, un toque para jugar, sin elegir pesista ----------
  await abrir();
  let s = await J(() => JUEGO.estado());
  if (s.idioma !== L) mal(`el idioma detectado es «${s.idioma}» (se esperaba «${L}»)`);
  if (await texto('#btn-empezar') !== D['bienvenida.jugar']) mal(`la bienvenida no dice «${D['bienvenida.jugar']}»: «${await texto('#btn-empezar')}»`);
  { const b = await J(() => ({ tarjetas: document.querySelectorAll('#capa .pesista').length, titulo: !!document.getElementById('pesista-t'), nombre: !!document.getElementById('nombre') }));
    if (b.tarjetas || b.titulo || !b.nombre) mal(`la primera bienvenida tiene que ser nombre (opcional) y «Jugar», sin elegir pesista: ${JSON.stringify(b)}`); }
  if (!(await eventos()).some(e => e.ev === 'juego_abierto' && e.props.pantalla_inicial === 'bienvenida')) mal('falta juego_abierto con pantalla_inicial=bienvenida');
  if (tactil) await escribir('#nombre', 'Ana');
  await foto('bienvenida');

  // ---------- 2. final 1 entera y el cartel en el podio ----------
  s = await jugar(enMuro, 'final 1');
  await av(300); await foto('cartel_podio');
  { const ev = await eventos(), pe = ev.find(e => e.ev === 'pesista_elegido')?.props;
    if (!pe || pe.pesista !== 'compacto' || pe.por_defecto !== true || pe.ofrecido !== false) mal(`pesista_elegido en la primera vez: ${JSON.stringify(pe)}`);
    const c = await J(() => JUEGO.E.p?.at?.[JUEGO.E.yo]?.c?.length ?? null); if (c !== 3) mal(`la final gratis no fue entera: ${c} dos tiempos`);
    if (cuenta(ev, 'final_fin') !== 1) mal('el cartel salió sin final_fin'); }
  const nombreVisto = tactil ? 'Ana' : D['bienvenida.nombre_defecto'];
  { const x = await revisarCartel('podio'); if (x.titulo !== D['muro.titulo_1'].replace('{nombre}', nombreVisto)) mal(`título del cartel: «${x.titulo}»`); }
  { const m = await ultimo('muro_visto'); if (!m || m.momento !== 'podio' || m.caminos !== 'mail+preguntas' || m.gratis_etapa !== 'final') mal(`muro_visto en el podio: ${JSON.stringify(m)}`); }
  if (await fuentes() !== 'gratis') mal(`en la base, antes de decidir: ${await fuentes()}`);
  // la API a mano: sin las dos preguntas no desbloquea (otro dispositivo, sin la cookie)
  { const r = await J(async () => { const x = await fetch('/api/encuesta', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dispositivo: crypto.randomUUID(), r: { plataforma: 'web' } }) }); return [x.status, await x.json()]; });
    if (r[0] !== 400 || r[1].error !== 'incompleta') mal(`la encuesta a mano con una sola pregunta: ${JSON.stringify(r)}`); }

  if (!tactil) {
    // ---------- 3 (en). el correo: errores, alta, preguntas optativas y el inicio con las tarjetas ----------
    await pulsa('#btn-via-mail'); await av(150);
    if (await J(() => document.getElementById('btn-via-mail')?.getAttribute('aria-pressed')) !== 'true' || !await J(() => !!document.getElementById('correo'))) mal('«Leave your email» no abrió el formulario');
    { const n = await J(() => document.getElementById('novedades')?.checked); if (n !== false) mal('la casilla de novedades no viene destildada'); }
    if (await J(() => document.getElementById('nombre-lista')?.value || '') !== '') mal('el campo del nombre debería venir vacío con el nombre de siempre');
    await pulsa('#btn-anotar'); await av(100);
    if (await texto('#capa .panel #err') !== D['lista.error_nombre']) mal(`anotarse sin nombre no dio el error del nombre: «${await texto('#capa .panel #err')}»`);
    await escribir('#nombre-lista', 'Lucía Romero');
    await pulsa('#btn-anotar'); await av(100);
    if (await texto('#capa .panel #err') !== D['lista.error_formato']) mal(`anotarse sin correo no dio el error de formato: «${await texto('#capa .panel #err')}»`);
    await escribir('#correo', CORREO[L]);
    await pulsa('#btn-anotar'); await av(100);
    if (await texto('#capa .panel #err') !== D['lista.error_aviso']) mal(`anotarse sin la casilla de aviso no dio su error: «${await texto('#capa .panel #err')}»`);
    await marca('#aviso'); await foto('cartel_correo');
    await pulsa('#btn-anotar');
    await esperar(() => !!document.getElementById('btn-enviar') && !!document.getElementById('btn-saltar'), 'el panel de anotado con las preguntas optativas');
    await foto('anotado_preguntas');
    if (await texto('#capa .panel h2') !== D['lista.ok'].replace('{nombre}', nombreVisto)) mal(`el panel de anotado dice «${await texto('#capa .panel h2')}»`);
    if (await texto('#btn-saltar') !== D['encuesta.saltar']) mal(`el paso optativo no dice «${D['encuesta.saltar']}»`);
    { const a = await ultimo('anotar_respuesta'); if (!a || a.estado !== 'nuevo' || a.pantalla !== 'muro' || a.momento !== 'podio' || a.novedades !== false) mal(`anotar_respuesta: ${JSON.stringify(a)}`); }
    { const r = (await eventos()).filter(e => e.ev === 'muro_resultado'); if (r.length !== 1 || r[0].props.via !== 'mail' || r[0].props.novedades !== false) mal(`muro_resultado: ${JSON.stringify(r)}`); }
    if ((await eventos()).some(e => e.ev === 'anotar_ok')) mal('el navegador mandó anotar_ok (lo manda el Worker, solo para altas nuevas)');
    for (const sel of ['.op[data-q="plataforma"][data-o="web"]', '.op[data-q="features"][data-o="mujeres_categorias"]', '.op[data-q="features"][data-o="pesista_propio"]']) await marca(sel);
    await escribir('#otra', 'Online duels');
    await pulsa('#btn-enviar');
    await esperar(() => JUEGO.estado().pantalla === 'inicio' && !!document.getElementById('btn-empezar'), 'el inicio después del cartel');
    await av(200); await foto('inicio_tarjetas');
    { const b = await J(() => ({ tarjetas: document.querySelectorAll('#capa .pesista').length, elegido: document.querySelector('#capa .pesista[aria-pressed=true]')?.dataset.id }));
      if (b.tarjetas !== 3 || b.elegido !== 'ventura') mal(`después de la primera final el inicio ofrece elegir pesista: ${JSON.stringify(b)}`); }
    { const e = await ultimo('encuesta_enviada'); if (!e || e.paso !== 'anotado' || e.desbloquea !== false || e.features !== 2) mal(`encuesta_enviada: ${JSON.stringify(e)}`); }
    // elige otro pesista y juega: la final sale por la lista, y el cartel queda con «siguió jugando»
    await pulsa('.pesista[data-id="brenner"]');
    await pulsa('#btn-empezar');
    s = await jugar(x => x.visitados.includes('llamado') && x.pantalla === 'llamado', 'la final después de anotarse', 6);
    { const p = await ultimo('partida_pedida'); if (p?.fuente !== 'lista') mal(`la final después de anotarse no salió con fuente «lista»: ${JSON.stringify(p)}`); }
    { const g = (await eventos()).filter(e => e.ev === 'siguio_jugando'); if (g.length !== 1 || g[0].props.siguio !== true || g[0].props.via !== 'mail') mal(`siguio_jugando: ${JSON.stringify(g)}`); }
    { const pe = (await eventos()).filter(e => e.ev === 'pesista_elegido').at(-1)?.props; if (pe?.pesista !== 'largo' || pe.ofrecido !== true) mal(`pesista_elegido después de la primera final: ${JSON.stringify(pe)}`); }
    await foto('final_libre');
    // recarga: bienvenida con juego libre
    await abrir(); await av(200);
    s = await J(() => JUEGO.estado());
    if (s.pantalla !== 'inicio') mal(`anotado, al recargar se ve «${s.pantalla}» en lugar de la bienvenida`);
    if (await texto('#capa .quedan') !== D['bienvenida.anotado']) mal(`anotado, la bienvenida dice «${await texto('#capa .quedan')}»`);
    await foto('bienvenida_anotado');
  } else {
    // ---------- 3 (es). «Ahora no», «Volver al inicio»; «Jugar» da el cartel antes de empezar ----------
    await pulsa('#btn-ahora-no'); await av(100);
    await pulsa('#btn-ahora-no').catch(() => null);      // un toque de más no suma nada
    await esperar(() => !!document.getElementById('btn-volver'), '«Volver al inicio»');
    await foto('cartel_despues');
    await pulsa('#btn-volver');
    await esperar(() => JUEGO.estado().pantalla === 'inicio' && !!document.getElementById('btn-empezar'), 'el inicio después de cerrar el cartel');
    { const ev = await eventos(), r = ev.filter(e => e.ev === 'muro_resultado');
      if (cuenta(ev, 'muro_ahora_no') !== 1 || cuenta(ev, 'muro_cerrado') !== 1) mal(`muro_ahora_no/muro_cerrado más de una vez: ${cuenta(ev, 'muro_ahora_no')}/${cuenta(ev, 'muro_cerrado')}`);
      if (r.length !== 1 || r[0].props.via !== 'cerro' || r[0].props.salida !== 'volver') mal(`muro_resultado al cerrar: ${JSON.stringify(r)}`); }
    if (await J(() => document.querySelectorAll('#capa .pesista').length) !== 3) mal('después de la primera final el inicio no ofrece elegir pesista');
    await foto('inicio_tarjetas');
    await pulsa('#btn-empezar');
    s = await jugar(enMuro, 'la final siguiente');
    await av(300); await foto('cartel_inicio');
    if (s.intento) mal('el cartel del inicio salió con un intento en curso');
    { const ev = await eventos(), m = ev.filter(e => e.ev === 'muro_visto').at(-1)?.props, g = ev.filter(e => e.ev === 'siguio_jugando');
      if (!m || m.momento !== 'inicio' || m.caminos !== 'mail+preguntas') mal(`muro_visto antes de la final: ${JSON.stringify(m)}`);
      if (g.length !== 1 || g[0].props.siguio !== false || g[0].props.motivo !== 'muro') mal(`siguio_jugando después de cerrar y volver al cartel: ${JSON.stringify(g)}`); }
    if (await fuentes() !== 'gratis') mal(`el cartel del inicio gastó una partida: ${await fuentes()}`);

    // ---------- 4 (es). recarga: el cartel sigue; las dos preguntas desbloquean ----------
    await abrir();
    if (!await esperar(() => JUEGO.estado().pantalla === 'muro' && !!document.getElementById('btn-via-preguntas'), 'el cartel al recargar')) await foto('recarga_sin_cartel');
    await revisarCartel('recarga'); await foto('cartel_recarga');
    { const m = await ultimo('muro_visto'); if (!m || m.momento !== 'inicio' || m.origen !== 'carga') mal(`muro_visto al recargar: ${JSON.stringify(m)}`); }
    await pulsa('#btn-via-preguntas'); await av(150);
    { const x = await J(() => ({ legends: [...document.querySelectorAll('#capa .panel fieldset legend')].map(l => l.textContent.trim()), boton: document.getElementById('btn-preguntas')?.textContent.trim() }));
      if (JSON.stringify(x.legends) !== JSON.stringify([D['encuesta.plataforma'], D['encuesta.features']]) || x.boton !== D['encuesta.enviar']) mal(`las preguntas del cartel: ${JSON.stringify(x)}`); }
    await foto('cartel_preguntas');
    await pulsa('#btn-preguntas'); await av(100);
    if (await texto('#err-preg') !== D['muro.preguntas.falta']) mal(`sin contestar, el cartel no pide las dos preguntas: «${await texto('#err-preg')}»`);
    await marca('.op[data-q="plataforma"][data-o="app"]');
    await pulsa('#btn-preguntas'); await av(100);
    if (await texto('#err-preg') !== D['muro.preguntas.falta']) mal('con una sola pregunta siguió');
    await marca('.op[data-q="features"][data-o="sedes_campeonatos"]');
    await escribir('#otra', 'Más rivales, escríbanme a ana@pruebas.com');
    await foto('cartel_preguntas_contestadas');
    await pulsa('#btn-preguntas');
    await esperar(() => !!document.querySelector('#capa .panel.anotado #btn-seguir'), '«¡Gracias!» después de las preguntas');
    await foto('preguntas_gracias');
    if (await texto('#capa .panel h2') !== D['encuesta.ok'] || !(await texto('#capa .panel')).includes(D['lista.ok_libre'])) mal(`después de las preguntas: «${await texto('#capa .panel')}»`);
    { const e = await ultimo('encuesta_enviada'); if (!e || e.paso !== 'cartel' || e.desbloquea !== true || e.plataforma !== 'app' || e.otra !== true) mal(`encuesta_enviada en el cartel: ${JSON.stringify(e)}`); }
    { const r = await ultimo('muro_resultado'); if (!r || r.via !== 'preguntas' || r.momento !== 'inicio') mal(`muro_resultado por las preguntas: ${JSON.stringify(r)}`); }
    { const n = await srv.db.prepare('SELECT COUNT(*) n, SUM(i IS NOT NULL) con_ip FROM encuestas').first(); if (n.n !== 1 || n.con_ip !== 1) mal(`encuestas en la base: ${JSON.stringify(n)}`); }
    await pulsa('#btn-seguir');
    await esperar(() => JUEGO.estado().pantalla === 'inicio' && !!document.getElementById('btn-empezar'), 'el inicio después de las preguntas');
    await pulsa('#btn-empezar');
    s = await jugar(x => x.visitados.includes('llamado') && x.pantalla === 'llamado', 'la final después de las preguntas', 6);
    { const p = await ultimo('partida_pedida'); if (p?.fuente !== 'encuesta') mal(`la final después de las preguntas salió con fuente ${JSON.stringify(p)}`); }
    { const g = await ultimo('siguio_jugando'); if (!g || g.siguio !== true || g.via !== 'preguntas') mal(`siguio_jugando: ${JSON.stringify(g)}`); }
    await foto('final_libre');
    await abrir(); await av(200);
    if ((await J(() => JUEGO.estado())).pantalla !== 'inicio') mal('con las preguntas contestadas, al recargar salió el cartel');
    await foto('bienvenida_libre');
  }

  // ---------- lo que quedó en el servidor y en las métricas ----------
  { const todos = await eventos(), sucio = todos.filter(e => JSON.stringify(e.props).includes('@') || /\bAna\b|Lucía/.test(JSON.stringify(e.props)));
    if (sucio.length) mal(`eventos con el correo o el nombre: ${JSON.stringify(sucio.slice(0, 3))}`); }
  const db = { lista: await srv.db.prepare('SELECT COUNT(*) n FROM lista').first('n'), encuestas: await srv.db.prepare('SELECT COUNT(*) n FROM encuestas').first('n'), fuentes: await fuentes() };
  const esperado = tactil ? { lista: 0, encuestas: 1, fuentes: 'gratis encuesta' } : { lista: 1, encuestas: 1, fuentes: 'gratis lista' };
  if (JSON.stringify(db) !== JSON.stringify(esperado)) mal(`en la base: ${JSON.stringify(db)} (se esperaba ${JSON.stringify(esperado)})`);
  console.log(`${tag} idioma ${L} · 1 final entera gratis · cartel con dos caminos · ${tactil ? 'Ahora no · cartel al empezar y al recargar · preguntas: desbloquean' : 'correo (errores, alta) · preguntas optativas · inicio con pesistas · lista'} · base: ${JSON.stringify(db)} · ${nFoto} capturas en ${path.relative(ROOT, dir)}`);
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
console.log('\nOK: el cartel de LIF-53 de punta a punta con el Worker local, en inglés con teclado y en español en el teléfono con toques');
