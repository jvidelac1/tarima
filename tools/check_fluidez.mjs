// Prueba de fluidez y de entrada del juego, en tiempo real y con teclado real (sin reloj inyectado).
// Juega la final con Brenner hasta el primer dos tiempos propio y mide, DURANTE cada intento propio:
//  - cuadros que ofreció el navegador (requestAnimationFrame) contra cuadros que el juego dibujó (llamadas al render);
//  - percentiles del tiempo entre cuadros y cuántos pasaron de 33 y de 50 ms; tareas largas del hilo principal;
//  - toques de Espacio enviados por la prueba, recibidos por la página, y aceptados o descartados por el juego con su
//    motivo (window.JUEGO.toques). Además manda toques fuera de turno a propósito: tienen que quedar anotados con motivo
//    y con acuse en pantalla.
// Se repite con el procesador del navegador estrangulado (CDP Emulation.setCPUThrottlingRate) para parecerse a una
// máquina más lenta que la de la prueba. La placa no se estrangula: el costo de GPU de otra máquina NO sale de acá.
// Falla (exit 1) si en algún intento se dibuja menos del 95 % de los cuadros ofrecidos, si un toque que llegó a la página
// no figura en el registro del juego, o si un toque descartado no tiene motivo o no tuvo acuse.
// Uso: node tools/check_fluidez.mjs [--cpu=1,4,6] [--q=media] [--tutorial] [--ancho=1920 --alto=930] [--semilla=N] [--json=archivo]
//   --capturas=dir  guarda una captura por señal, por toque fuera de turno y por panel (ensucia los tiempos: no usar para medir).
//   --tutorial  además corre, con el almacenamiento vacío, el tutorial entero y verifica que no vuelve a aparecer al recargar.
//   --lastre=ms costo artificial por megapíxel dibujado (ver ?lastre en main.js), como si la placa fuera lenta.
//   --gobernador  prueba del gobernador de calidad con ese lastre: arranca con 18 ms por megapíxel (la calibración tiene que
//               bajar la calidad antes del primer intento) y en medio del primer intento lo sube a 40 (la calidad NO puede
//               cambiar hasta que el intento termine, y después tiene que bajar).
// MODO LÓGICA. Si el navegador dibuja por software (GitHub Actions, contenedor sin placa; ver tools/browser.mjs) los cuadros
// por segundo no dicen nada del juego. Ahí la prueba carga el juego sin dibujar el 3D (?dibujo=0), corre solo sin
// estrangular el procesador (salvo que se pida --cpu) y NO exige ni informa como medida los cuadros dibujados: verifica
// toques (registro, motivo y acuse), errores de consola y el tutorial. La calibración y el gobernador de calidad no actúan
// sin dibujo, así que tampoco se prueban ahí (--gobernador pide una placa).
// Con --capturas, en ese modo se fuerza un cuadro del 3D antes de cada captura para que la imagen sirva para mirar.
//   --logica   fuerza el modo lógica aunque haya placa.   --dibujar   lo impide aunque el dibujo sea por software.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions, isSoftware, rendererWebGL } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const Q = arg('q') || '', SEMILLA = +(arg('semilla') || 20261112), ANCHO = +(arg('ancho') || 1920), ALTO = +(arg('alto') || 930);
const CAPT = arg('capturas') || '', DEPURA = process.argv.includes('--depura');
if (CAPT) fs.mkdirSync(CAPT, { recursive: true });
const GOB = process.argv.includes('--gobernador');
const TUTORIAL = process.argv.includes('--tutorial'), LASTRE = arg('lastre') || (GOB ? '18' : ''), SOLO_TUT = process.argv.includes('--solo-tutorial'), UMBRAL = +(arg('umbral') || 95);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;      // /api/estado y /api/partida: juego sin límite (tools/sin_api.mjs)
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(launchOptions());
// ¿se dibuja por software? Se pregunta antes de cargar el juego, porque en modo lógica el juego se abre sin dibujar el 3D.
const GL0 = await rendererWebGL(browser);
const LOGICA = process.argv.includes('--logica') || (isSoftware(GL0) && !process.argv.includes('--dibujar'));
const CPUS = (arg('cpu') || (LOGICA ? '1' : '1,4,6')).split(',').map(Number);
if (LOGICA && GOB) { console.log('--gobernador necesita dibujar con una placa: por software (modo lógica) no se puede probar'); await browser.close(); server.close(); process.exit(2); }
if (LOGICA) console.log(`MODO LÓGICA (${GL0 || 'sin WebGL'}): el 3D no se dibuja, no se miden cuadros por segundo ni actúa el gobernador de calidad, y el procesador se prueba a ${CPUS.join(', ')}x. Se verifican toques, consola y tutorial.`);
/** En modo lógica el juego no dibuja: un cuadro del 3D a pedido, para las capturas. Si falla queda como error de consola. */
const cuadro3d = page => page.evaluate(() => { try { window.JUEGO.escena?.cuadro?.(0, true); } catch (e) { console.error('cuadro forzado para la captura: ' + (e.stack || e)); } }).catch(() => null);
const dormir = ms => new Promise(r => setTimeout(r, ms));
const problemas = [], informe = [];

/**
 * Sonda que corre dentro de la página. No usa nada del juego para contar: los cuadros ofrecidos salen de su propio
 * requestAnimationFrame y los dibujados de envolver renderer.render. El «jugador» mira la señal del intento y agenda toques.
 */
function sonda(cfg) {
  let a = cfg.seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = sd => sd * Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const J = window.JUEGO, E = J.E, M = window.__flu = { intentos: [], teclas: [], largas: [], fuera: [], cierres: [], activo: true };
  // cuadros dibujados: cualquier llamada a renderer.render marca el cuadro como dibujado
  const R = J.escena.renderer, r0 = R.render.bind(R); let pinto = false; R.render = (s, c) => { pinto = true; return r0(s, c); };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) M.largas.push({ t: e.startTime, ms: Math.round(e.duration), en: !!(E.intento && E.intento.propio) }); }).observe({ entryTypes: ['longtask'] }); } catch { /* sin longtask */ }
  let cur = null, tPrev = 0, clave = '', unico = Infinity, mash = Infinity, hecho = false, ultTap = -1e9, extra = Infinity, extraDe = '', vistoVer = 0, pantPrev = '';
  const hechoExtra = new Set();
  function cuadro(t) {
    requestAnimationFrame(cuadro); if (!M.activo) return;
    const now = performance.now(), I = E.intento, en = !!(I && I.propio && E.modo !== 'panel' && I.m);
    if (en) {
      if (!cur || cur.I !== I) { cur = { I, pantalla: E.pantalla, lev: I.ctx.lev, guiado: !!I.guiado, t0: now, n: 0, dib: 0, dts: [], lentos: [] }; M.intentos.push(cur); tPrev = 0; }
      cur.n++; if (pinto) cur.dib++;
      if (tPrev) { const dt = t - tPrev; cur.dts.push(Math.round(dt * 10) / 10); if (dt > 33) cur.lentos.push({ ms: Math.round(dt), fase: I.m.fase, senal: I.senal ? I.senal.clave : null, a: Math.round(now - cur.t0) }); }
      tPrev = t; cur.t1 = now; cur.res = I.m.res ? I.m.res.res + (I.m.res.causa ? ':' + I.m.res.causa : '') : null;
      if (cfg.gob && M.intentos.length === 1 && !M.lastreT && I.m.fase !== 'acomodo' && I.m.fase !== 'tension' && I.m.fase !== 'llamado') { M.lastreT = now; J.test.lastre(cfg.gob); }      // la máquina se pone lenta en medio del intento
    } else { if (cur) { delete cur.I; cur = null; } tPrev = 0; }
    pinto = false;
    // ---- el jugador: una decisión por señal
    const s = en ? I.senal : null, k = s ? `${s.clave}|${s.tipo}|${s.desde ?? ''}` : '';
    if (k !== clave) {
      clave = k; hecho = false; unico = Infinity;
      // una señal en la que el reloj guiado se va a detener se toca cuando se detiene (más abajo); el resto, en su momento
      if (s && !(I.guiado && I.seDetiene)) {
        const falta = s.tipo === 'cierre' ? (s.objetivo - I.now) / (I.vel || 1) : 0;      // ms reales hasta el cierre
        if (s.tipo === 'libre') unico = now + cfg.reac;
        else if (s.tipo === 'cierre') { unico = Math.max(now + 100, now + falta + cfg.lag + gauss(cfg.sd)); M.cierres.push({ clave: s.clave, ms: Math.round(falta) }); }
      }
      if (s && s.tipo === 'empuja') { if (mash === Infinity) mash = now + 250; } else mash = Infinity;
      // toques fuera de turno, uno por tipo y por intento: en PREPARATE y en AGUANTÁ
      if (cfg.fuera && s && (s.clave === 'prep' || s.clave === 'aguanta') && !hechoExtra.has(cur.t0 + s.clave)) { hechoExtra.add(cur.t0 + s.clave); extra = now + 200; extraDe = s.clave; }
    }
    if (en && I.guiado && s && s.tipo !== 'empuja' && I.parado && unico === Infinity && now - ultTap > 700) unico = now + cfg.reac;      // tutorial: el reloj espera el toque
    // fuera del intento: un toque apenas aparece el veredicto (es temprano para saltearlo: tiene que tener acuse y motivo)
    if (E.pantalla !== pantPrev) { pantPrev = E.pantalla; if (cfg.fuera && E.pantalla === 'decision') vistoVer = 0; }
    if (cfg.fuera && E.pantalla === 'decision' && !vistoVer && !document.getElementById('veredicto').hidden) { vistoVer = now; extra = now + 150; extraDe = 'veredicto'; }
  }
  requestAnimationFrame(cuadro);
  addEventListener('keydown', e => {
    if (e.code !== 'Space') return; const I = E.intento, tJuego = e.timeStamp + J.reloj.desfase;
    const k = { ts: e.timeStamp, now: performance.now(), rep: e.repeat, tgt: e.target.tagName, pantalla: E.pantalla, modo: E.modo, propio: !!(I && I.propio), fase: I && I.m ? I.m.fase : null, senal: I && I.senal ? I.senal.clave : null, ent0: I ? I.ent.length : null };
    M.teclas.push(k);
    // al terminar de despacharse el evento: qué anotó el juego para ESTA pulsación (se busca por su instante) y si hubo acuse
    setTimeout(() => {
      const I2 = E.intento, T = J.toques ? J.toques.ultimos.find(x => Math.abs(x.t - tJuego) < 2) : null, ac = document.getElementById('acuse');
      k.ent1 = I2 && I2 === I ? I2.ent.length : null; k.reg = T ? { ok: T.ok, motivo: T.motivo, donde: T.donde, nota: T.nota || '' } : null;
      k.acuse = ac ? { visible: !ac.hidden && getComputedStyle(ac).display !== 'none', hundida: ac.classList.contains('on'), txt: ac.lastElementChild.textContent } : null;
    }, 0);
  }, true);
  /** Espera hasta el próximo toque agendado (máximo `ms`). Devuelve {tap} o el estado para navegar. */
  M.espera = ms => new Promise(res => {
    const fin = performance.now() + ms;
    const mira = () => {
      const now = performance.now(), prox = Math.min(unico, mash, extra);
      if (prox <= now) {
        let clase;
        if (extra <= now) { clase = 'fuera:' + extraDe; extra = Infinity; M.fuera.push({ t: now, de: extraDe }); }
        else if (unico <= mash) { clase = 'senal'; unico = Infinity; hecho = true; }
        else { clase = 'empuja'; mash = now + Math.max(100, cfg.per + gauss(cfg.jit)); }
        ultTap = now; return res({ tap: true, clase, senal: clave.split('|')[0], doble: cfg.doble && clase === 'senal' && clave.startsWith('tira|') });
      }
      if (now >= fin) {
        const st = J.estado(), I = st.intento;
        return res({ tap: false, pantalla: st.pantalla, panel: st.panel, modo: st.modo, sobre: st.sobre, foco: st.foco, errores: st.errores, propio: !!(I && I.propio), lev: E.intento ? E.intento.ctx.lev : null,
          titulo: document.querySelector('#capa .panel h1,#capa .panel h2')?.textContent || '', botones: document.querySelectorAll('#capa .panel button:not(:disabled)').length, propios: (E.propios || []).length });
      }
      setTimeout(mira, Math.max(0, Math.min(prox - now, fin - now, 4)));
    };
    mira();
  });
}

const pct = (v, p) => (v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0);
function resumenIntento(x) {
  const d = x.dts.slice().sort((a, b) => a - b);
  return { pantalla: x.pantalla, lev: x.lev, seg: +((x.t1 - x.t0) / 1000).toFixed(1), ofrecidos: x.n, dibujados: x.dib, pct: x.n ? +(100 * x.dib / x.n).toFixed(1) : 0, p50: pct(d, .5), p95: pct(d, .95), p99: pct(d, .99), max: d[d.length - 1] || 0, mas33: d.filter(v => v > 33).length, mas50: d.filter(v => v > 50).length, res: x.res, lentos: x.lentos };
}

/** Abre el juego y deja la sonda puesta. `guardado`: claves de localStorage antes de cargar. */
async function abrir(ctx, cpu, guardado, extra = '') {
  const page = await ctx.newPage(), errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  if (guardado) await page.addInitScript(g => { try { if (!sessionStorage.getItem('__flu')) { for (const [k, v] of Object.entries(g)) localStorage.setItem(k, v); sessionStorage.setItem('__flu', '1'); } } catch { /* sin almacenamiento */ } }, guardado);
  await page.goto(`${base}juego.html?lang=es&semilla=${SEMILLA}${Q ? '&q=' + Q : ''}${LASTRE ? '&lastre=' + LASTRE : ''}${DEPURA ? '&depura=1' : ''}${LOGICA ? '&dibujo=0' : ''}${extra}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 180000 });
  if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no inició');
  const cdp = await ctx.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return { page, errs, cdp };
}
/** Control: cadencia de requestAnimationFrame durante `ms` sin que el juego dibuje (panel abierto o pausa). Dice cuánto ruido trae la máquina de la prueba. */
const control = (page, ms) => page.evaluate(ms => new Promise(res => { const ts = []; const f = t => { ts.push(t); if (t - ts[0] < ms) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); res({ n: d.length, p50: +d[d.length >> 1].toFixed(1), max: +d[d.length - 1].toFixed(1), mas33: d.filter(v => v > 33).length }); } }; requestAnimationFrame(f); }), ms);
const poner = (page, cfg) => page.evaluate(`(${sonda.toString()})(${JSON.stringify(cfg)})`);
const toque = async page => { await page.keyboard.down('Space'); await dormir(35); await page.keyboard.up('Space'); };

/** Juega lo que haya hasta que `hasta(r)` sea cierto. Devuelve cuántos Espacio mandó. */
async function jugar(page, hasta, { minutos = 8, eti = '' } = {}) {
  let firma = '', tFirma = 0, ultSalto = 0, enviados = 0, nCapt = 0; const t0 = Date.now(), bit = [], vistas = new Set();
  const foto = async nombre => { if (CAPT && !vistas.has(nombre) && nCapt < 60) { vistas.add(nombre); if (LOGICA) await cuadro3d(page); await page.screenshot({ path: path.join(CAPT, `${eti}${String(++nCapt).padStart(2, '0')}_${nombre.replace(/[^a-z0-9áéíóúñ]+/gi, '_').slice(0, 40)}.jpg`), type: 'jpeg', quality: 70 }).catch(() => null); } };
  for (;;) {
    if (Date.now() - t0 > minutos * 60000) throw new Error(`la partida no avanza (${minutos} min): ${bit.slice(-4).join(' / ')}`);
    const r = await page.evaluate(() => window.__flu.espera(120));
    if (r.tap) {
      if (CAPT && r.clase === 'senal') await foto('senal_' + r.senal);
      await page.keyboard.down('Space'); if (CAPT) { await dormir(60); await foto(r.clase === 'senal' ? 'toque_' + r.senal : r.clase.replace(':', '_')); } else await dormir(35); await page.keyboard.up('Space'); enviados++;
      if (r.doble) { await dormir(5); await toque(page); enviados++; } continue;
    }
    if (r.errores.length) throw new Error('error en el juego: ' + r.errores[0]);
    if (hasta(r)) return { enviados, bit };
    if (r.propio && r.modo !== 'panel') continue;
    const f = `${r.pantalla}|${r.titulo}|${r.botones}`;
    if (f !== firma) { firma = f; tFirma = Date.now(); bit.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${r.pantalla}${r.titulo ? ' «' + r.titulo + '»' : ''}`); if (CAPT) { await dormir(500); await foto(`${r.pantalla}_${r.titulo}`); tFirma = Date.now(); } }
    if (r.panel && r.botones > 0 && !r.sobre) { if (Date.now() - tFirma > 700 && r.foco) { await page.keyboard.press('Enter'); tFirma = Date.now() + 400; } continue; }
    if (['rival', 'decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado'].includes(r.pantalla) && Date.now() - ultSalto > 700 && Date.now() - tFirma > 1500) { await toque(page); enviados++; ultSalto = Date.now(); }
  }
}

async function medir(cpu, gob = false) {
  const tag = gob ? '[gobernador]' : `[cpu ${cpu}x]`, ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });
  const { page, errs } = await abrir(ctx, cpu, { 'tarima.tutorial': '1', 'tarima.pesista': 'brenner', 'tarima.jugadas': '1' });
  const info = await page.evaluate(() => { const e = JUEGO.escena, g = e.renderer.getContext(), x = g.getExtension('WEBGL_debug_renderer_info'); return { gl: x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : '?', calidad: (JUEGO.calidad ? JUEGO.calidad.nombre : e.Q.label), lienzo: `${g.drawingBufferWidth}x${g.drawingBufferHeight}`, ventana: `${innerWidth}x${innerHeight}`, toques: !!JUEGO.toques }; });
  console.log(`${tag} ${info.gl} · calidad ${info.calidad} · lienzo ${info.lienzo} (ventana ${info.ventana})${LOGICA ? ' · MODO LÓGICA: sin dibujo, los cuadros no se miden' : isSoftware(info.gl) ? ' · POR SOFTWARE: los tiempos no dicen nada' : ''}`);
  info.logica = LOGICA;
  const c0 = await control(page, 3000);
  await poner(page, { seed: SEMILLA + cpu, reac: 450, lag: 30, sd: 45, per: 170, jit: 25, fuera: !gob, doble: cpu === 1 && !gob && !CAPT, gob: gob ? 40 : 0 });      // con capturas no hay toque doble: la foto estira el primero y el segundo ya no cae como rebote
  await dormir(500);
  // hasta el veredicto del primer dos tiempos propio (en la prueba del gobernador, hasta terminar el segundo intento propio)
  let visto = false; const { enviados, bit } = await jugar(page, r => { if (r.propio && (gob ? r.propios >= 1 : r.lev === 'c')) visto = true; return visto && !r.propio && r.pantalla !== 'intento' && r.pantalla !== 'decision'; }, { eti: `cpu${cpu}_` });
  await dormir(300);
  // control al final: con la pausa abierta el juego no dibuja
  await page.keyboard.press('Escape'); await dormir(300); const c1 = await control(page, 3000);
  console.log(`${tag} control sin dibujar (ruido de la máquina de la prueba): al empezar ${c0.n} cuadros, p50 ${c0.p50} ms, >33 ms: ${c0.mas33} · al terminar ${c1.n} cuadros, p50 ${c1.p50} ms, >33 ms: ${c1.mas33}`);
  const out = await page.evaluate(() => { __flu.activo = false; return { lastreT: __flu.lastreT || 0, intentos: __flu.intentos.map(x => { const { I, ...r } = x; return r; }), teclas: __flu.teclas, largas: __flu.largas, fuera: __flu.fuera, cierres: __flu.cierres, propios: JUEGO.E.propios || [], errores: JUEGO.E.errores, perf: JUEGO.perf.resumen(), calidad: JUEGO.calidad ? { nombre: JUEGO.calidad.nombre, cambios: JUEGO.calidad.cambios } : null, toques: JUEGO.toques ? { total: JUEGO.toques.total } : null }; });
  const R = out.intentos.map(resumenIntento), fila = { cpu, info, control: [c0, c1], intentos: R, enviados, recibidos: out.teclas.length, calidad: out.calidad, perf: out.perf };
  if (LOGICA) for (const x of R) { for (const k of ['ofrecidos', 'dibujados', 'pct', 'p50', 'p95', 'p99', 'max', 'mas33', 'mas50', 'lentos']) delete x[k]; x.cuadros = 'sin medir (modo lógica)'; }
  for (const x of R) {
    if (LOGICA) { console.log(`${tag} ${x.pantalla} ${x.lev === 's' ? 'arranque' : 'dos tiempos'} ${x.seg} s → ${x.res || 'sin resultado'} · cuadros dibujados: sin medir (modo lógica)`); continue; }
    console.log(`${tag} ${x.pantalla} ${x.lev === 's' ? 'arranque' : 'dos tiempos'} ${x.seg} s → ${x.res || 'sin resultado'} · ofrecidos ${x.ofrecidos} · dibujados ${x.dibujados} (${x.pct} %) · entre cuadros p50 ${x.p50} p95 ${x.p95} p99 ${x.p99} máx ${x.max} ms · >33 ms: ${x.mas33} · >50 ms: ${x.mas50}`);
    if (x.lentos.length) console.log(`${tag}    cuadros largos: ${x.lentos.slice(0, 8).map(l => `${l.ms} ms a ${l.a} (${l.fase}/${l.senal})`).join(' · ')}`);
    if (gob) continue;
    if (x.pct < UMBRAL) problemas.push(`${tag} ${x.pantalla} ${x.lev}: se dibujó el ${x.pct} % de los cuadros ofrecidos (${x.dibujados} de ${x.ofrecidos}); el mínimo es ${UMBRAL} %`);
  }
  // cuánto tiempo hay entre que aparece cada círculo y su cierre (lo que el jugador tiene para reaccionar)
  const porClave = {}; for (const c of out.cierres) (porClave[c.clave] ||= []).push(c.ms);
  fila.cierres = Object.fromEntries(Object.entries(porClave).map(([k, v]) => [k, { min: Math.min(...v), max: Math.max(...v) }]));
  console.log(`${tag} tiempo del círculo desde que aparece hasta que cierra: ${Object.entries(fila.cierres).map(([k, v]) => `${k} ${v.min}${v.max !== v.min ? ' a ' + v.max : ''} ms`).join(' · ')}`);
  // ---- toques
  const T = out.teclas.filter(k => !k.rep), enInt = T.filter(k => k.propio && k.modo !== 'panel');
  const acept = enInt.filter(k => (k.reg ? k.reg.ok : k.ent1 !== null && k.ent1 > k.ent0)), desc = enInt.filter(k => !acept.includes(k));
  // el registro del juego contra lo que de verdad pasó: un toque «aceptado» en el intento tiene que haber agregado entradas, y uno «descartado» no
  const cruzados = enInt.filter(k => k.reg && k.ent1 !== null && k.reg.ok !== (k.ent1 > k.ent0));
  if (cruzados.length) problemas.push(`${tag} ${cruzados.length} toques del intento con registro que no coincide con las entradas (${cruzados.slice(0, 3).map(k => `${k.fase}: ${k.reg.ok ? 'aceptado' : k.reg.motivo}, entradas ${k.ent0}→${k.ent1}`).join('; ')})`);
  const motivos = {}; for (const k of desc) { const m = k.reg ? (k.reg.motivo || 'SIN MOTIVO') : 'sin registro'; motivos[m] = (motivos[m] || 0) + 1; }
  const sinReg = T.filter(k => info.toques && !k.reg), sinMotivo = T.filter(k => k.reg && !k.reg.ok && !k.reg.motivo), sinAcuse = T.filter(k => info.toques && (!k.acuse || !k.acuse.visible || !k.acuse.hundida || (k.reg && k.reg.ok === false && !k.acuse.txt)));
  fila.toques = { enviados, recibidos: T.length, enIntento: enInt.length, aceptados: acept.length, descartados: desc.length, motivos, fueraDeIntento: T.length - enInt.length, sinRegistro: sinReg.length, sinMotivo: sinMotivo.length, sinAcuse: sinAcuse.length };
  console.log(`${tag} toques: enviados ${enviados} · recibidos por la página ${T.length} · en el intento ${enInt.length}: aceptados ${acept.length}, descartados ${desc.length} ${JSON.stringify(motivos)} · fuera del intento ${T.length - enInt.length}`);
  const porPant = {}; for (const k of T.filter(k => !enInt.includes(k))) { const m = `${k.pantalla}:${k.reg ? (k.reg.ok ? 'ok' : k.reg.motivo || 'SIN MOTIVO') : 'sin registro'}`; porPant[m] = (porPant[m] || 0) + 1; }
  console.log(`${tag}    fuera del intento, por pantalla: ${JSON.stringify(porPant)} · toques fuera de turno mandados a propósito: ${out.fuera.map(f => f.de).join(' ')}`);
  if (enviados !== out.teclas.filter(k => !k.rep).length) problemas.push(`${tag} la prueba mandó ${enviados} Espacio y la página recibió ${T.length}`);
  if (!info.toques) problemas.push(`${tag} el juego no lleva registro de toques (JUEGO.toques): los descartes son silenciosos`);
  else {
    if (sinReg.length) problemas.push(`${tag} ${sinReg.length} toques llegaron a la página y no figuran en el registro del juego (${[...new Set(sinReg.map(k => `${k.pantalla}/${k.modo}/${k.fase || '-'}/${k.tgt}`))].join(', ')})`);
    if (sinMotivo.length) problemas.push(`${tag} ${sinMotivo.length} toques descartados sin motivo (${[...new Set(sinMotivo.map(k => `${k.pantalla}/${k.fase || '-'}`))].join(', ')})`);
    if (sinAcuse.length) problemas.push(`${tag} ${sinAcuse.length} toques sin acuse en pantalla (${[...new Set(sinAcuse.map(k => `${k.pantalla}/${k.modo}/${k.fase || '-'}`))].join(', ')})`);
  }
  const lt = out.largas.filter(l => l.en); fila.largas = { n: lt.length, max: Math.max(0, ...lt.map(l => l.ms)) };
  console.log(`${tag} tareas largas (>50 ms) durante el intento: ${lt.length}${lt.length ? ` · la peor ${fila.largas.max} ms` : ''} · registrador del juego: ${Object.entries(out.perf).filter(([k]) => ['intento', 'decision', 'repeticion', 'llamado', 'resumen', 'inicio'].includes(k)).map(([k, v]) => `${k} ${v.mediana}/${v.minimo}`).join(' · ')} (mediana/mínimo de cuadros por segundo)`);
  if (out.calidad) console.log(`${tag} calidad al terminar: ${out.calidad.nombre} · cambios: ${out.calidad.cambios.length ? out.calidad.cambios.map(c => `${c.de}→${c.a} (${c.ms} ms/cuadro, en ${c.pantalla})`).join(' · ') : 'ninguno'}`);
  // la calidad no cambia con un intento en curso: ni lo dice el juego (enIntento) ni cae un cambio dentro del intervalo medido de un intento
  if (out.calidad) for (const c of out.calidad.cambios) if (c.enIntento || out.intentos.some(x => c.t > x.t0 && c.t < x.t1)) problemas.push(`${tag} la calidad cambió en medio de un intento (${c.de}→${c.a} en ${c.pantalla})`);
  if (gob) {
    const cs = out.calidad ? out.calidad.cambios : [], i1 = out.intentos[0], i2 = out.intentos[1], antes = cs.filter(c => i1 && c.t < i1.t0), despues = cs.filter(c => i1 && c.t > i1.t1);
    const lento1 = i1 ? i1.dts.filter((d, k) => k > 0).slice(-60).sort((a, b) => a - b) : [], d2 = i2 ? i2.dts.slice().sort((a, b) => a - b) : [];
    console.log(`${tag} lastre ${LASTRE} ms/MP al cargar: la calibración bajó ${antes.length} escalón(es) antes del primer intento (${antes.map(c => `${c.de}→${c.a} con ${c.ms} ms`).join(', ') || 'ninguno'}) · lastre 40 ms/MP desde la mitad del primer intento: últimos cuadros de ese intento p50 ${pct(lento1, .5)} ms, calidad sin cambios hasta que terminó · después bajó ${despues.length} (${despues.map(c => `${c.de}→${c.a} en ${c.pantalla}`).join(', ') || 'ninguno'}) · segundo intento p50 ${pct(d2, .5)} ms`);
    if (!antes.length) problemas.push(`${tag} con ${LASTRE} ms por megapíxel la calibración no bajó la calidad antes del primer intento`);
    if (!out.lastreT) problemas.push(`${tag} no se llegó a subir el lastre en medio del primer intento`);
    if (!despues.length) problemas.push(`${tag} con el cuadro lento desde la mitad del primer intento, el gobernador no bajó la calidad al terminar`);
    informe.push(fila); await ctx.close(); return;
  }
  console.log(`${tag} propios: ${out.propios.map(x => `${x.res}${x.causa ? ':' + x.causa : ''}`).join(' ')} · recorrido: ${bit.length} pantallas · errores de consola ${errs.length}`);
  for (const e of [...errs, ...out.errores].slice(0, 5)) problemas.push(`${tag} ${e}`);
  if (!R.some(x => x.lev === 's') || !R.some(x => x.lev === 'c')) problemas.push(`${tag} no se midió un arranque y un dos tiempos (${R.map(x => x.lev).join('')})`);
  informe.push(fila); await ctx.close();
}

/** El tutorial con el almacenamiento vacío: uno solo, corto, y no vuelve al recargar. */
async function tutorial() {
  const tag = '[tutorial]', ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });
  const { page, errs } = await abrir(ctx, 1, null);
  const ini = await page.evaluate(() => document.querySelector('#capa .panel').textContent.replace(/\s+/g, ' '));
  await poner(page, { seed: SEMILLA, reac: 450, lag: 30, sd: 45, per: 170, jit: 25, fuera: false, doble: false });
  const t0 = Date.now(); let tFin = 0, levs = 0;
  // Empezar → tutorial → hasta el panel de la presentación (apertura)
  await jugar(page, r => { if (r.pantalla === 'presentacion' && !tFin) tFin = Date.now(); return r.pantalla === 'presentacion' && r.panel; }, { minutos: 4, eti: 'tut_' });
  const a = await page.evaluate(() => ({ visitados: JUEGO.E.visitados.slice(), propios: (JUEGO.E.propios || []).map(x => ({ pantalla: x.pantalla, res: x.res })), intentos: __flu.intentos.map(x => ({ pantalla: x.pantalla, lev: x.lev, guiado: x.guiado, n: x.n, dib: x.dib, seg: (x.t1 - x.t0) / 1000 })), guardado: localStorage.getItem('tarima.tutorial') }));
  levs = a.intentos.length; const seg = (tFin - t0) / 1000;
  console.log(`${tag} de «Empezar» a la presentación: ${seg.toFixed(0)} s · levantamientos antes de jugar: ${levs} (${a.intentos.map(x => `${x.pantalla} ${x.lev} ${x.seg.toFixed(0)} s`).join(', ')}) · resultado: ${a.propios.map(x => x.res).join(' ')} · guardado tarima.tutorial=${a.guardado}`);
  if (levs !== 1) problemas.push(`${tag} antes de jugar hay ${levs} levantamientos; tiene que ser uno solo`);
  if (seg > 60) problemas.push(`${tag} el tutorial tardó ${seg.toFixed(0)} s con un jugador que toca a los 450 ms de cada señal; tiene que durar menos de un minuto`);
  if (a.guardado !== '1') problemas.push(`${tag} al terminar el tutorial no quedó guardado que ya se hizo`);
  if (!/saltar la práctica/i.test(ini)) problemas.push(`${tag} el inicio no ofrece saltar la práctica`);
  // recargar: no se repite
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 180000 });
  await poner(page, { seed: SEMILLA, reac: 450, lag: 30, sd: 45, per: 170, jit: 25, fuera: false, doble: false });
  const ini2 = await page.evaluate(() => document.querySelector('#capa .panel').textContent.replace(/\s+/g, ' '));
  await jugar(page, r => r.pantalla === 'presentacion' && r.panel, { minutos: 2 });
  const b = await page.evaluate(() => ({ visitados: JUEGO.E.visitados.slice(), intentos: __flu.intentos.length }));
  console.log(`${tag} después de recargar: pantallas ${b.visitados.join(' → ')} · levantamientos de tutorial: ${b.intentos} · el inicio ${/repetir la práctica/i.test(ini2) ? 'ofrece «Repetir la práctica»' : 'NO ofrece repetirla'}`);
  if (b.intentos || b.visitados.includes('tutorial') || b.visitados.includes('guiado')) problemas.push(`${tag} al recargar el tutorial volvió a aparecer`);
  if (!/repetir la práctica/i.test(ini2)) problemas.push(`${tag} después de hacerla, el inicio no ofrece «Repetir la práctica»`);
  // «Repetir tutorial» y saltearlo con Esc en medio del levantamiento guiado
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 180000 }); await dormir(600);
  for (let i = 0; i < 40 && !await page.evaluate(() => document.activeElement?.id === 'btn-otro'); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); await page.waitForFunction(() => JUEGO.estado().pantalla === 'guiado' && JUEGO.estado().intento, null, { timeout: 60000 }); await dormir(1500);
  const sv = await page.evaluate(() => { const b = document.getElementById('saltar'); return { visible: !!b && !b.hidden && b.getBoundingClientRect().width > 0, txt: b ? b.textContent.replace(/\s+/g, ' ').trim() : '' }; });
  const tEsc = Date.now(); await page.keyboard.press('Escape');
  const salto = await page.waitForFunction(() => JUEGO.estado().pantalla === 'presentacion', null, { timeout: 5000 }).then(() => true, () => false);
  const c = await page.evaluate(() => ({ pantalla: JUEGO.estado().pantalla, sobre: JUEGO.estado().sobre, propios: (JUEGO.E.propios || []).length, saltar: !document.getElementById('saltar').hidden, errores: JUEGO.E.errores }));
  console.log(`${tag} «Repetir tutorial» y Esc en medio del guiado: botón visible ${sv.visible} («${sv.txt}») · ${salto ? `a la presentación en ${Date.now() - tEsc} ms` : 'NO salteó'} · pantalla ${c.pantalla}`);
  if (!sv.visible || !/saltar/i.test(sv.txt) || !/esc/i.test(sv.txt)) problemas.push(`${tag} durante el tutorial no se ve cómo saltearlo (${JSON.stringify(sv)})`);
  if (!salto || c.sobre || c.propios || c.saltar) problemas.push(`${tag} Esc no salteó el tutorial limpio: ${JSON.stringify(c)}`);
  for (const e of c.errores.slice(0, 3)) problemas.push(`${tag} ${e}`);
  for (const e of errs.slice(0, 5)) problemas.push(`${tag} ${e}`);
  informe.push({ tutorial: { seg, levantamientos: levs, intentos: a.intentos } }); await ctx.close();
}

try {
  if (GOB) await medir(1, true);
  else if (!SOLO_TUT) for (const c of CPUS) await medir(c);
  if (TUTORIAL || SOLO_TUT) await tutorial();
} catch (e) { problemas.push('EXCEPCIÓN: ' + (e.stack || e.message)); }
await browser.close(); server.close();
if (arg('json')) { fs.mkdirSync(path.dirname(path.resolve(arg('json'))), { recursive: true }); fs.writeFileSync(arg('json'), JSON.stringify(informe, null, 1)); }
if (problemas.length) { console.log(`\nFALLA (${problemas.length}):`); for (const p of problemas) console.log(' - ' + p); process.exit(1); }
console.log(GOB ? '\nOK: la calibración bajó la calidad antes del primer intento, nada cambió con un intento en curso y el gobernador bajó al terminar'
  : SOLO_TUT ? '\nOK: el tutorial es un solo levantamiento, dura menos de un minuto, se saltea con Esc y no vuelve al recargar'
    : LOGICA ? '\nOK (modo lógica, sin dibujo: los cuadros por segundo NO se midieron): ningún toque se perdió sin motivo ni sin acuse' + (TUTORIAL ? '; el tutorial es un solo levantamiento, dura menos de un minuto, se saltea con Esc y no vuelve al recargar' : '')
      : '\nOK: en cada intento se dibujó al menos el ' + UMBRAL + ' % de los cuadros ofrecidos y ningún toque se perdió sin motivo');
