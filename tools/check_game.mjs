// Prueba automática del juego (docs/JUEGO.md, sección 9.7, y docs/CONTROLES.md, sección 8). El navegador sale de
// tools/browser.mjs: placa real si la hay (pod con NVIDIA), software si no.
// Por software (GitHub Actions, contenedor sin placa) verifica lo mismo: lógica, toques, paneles y tutorial; no mide cuadros
// por segundo, y un intento a velocidad real que no sale válido queda como nota.
//  - teclado (Fácil, 'u': «un toque, un tramo»): partida completa SIN MOUSE con el reloj inyectado: menús con Tab, flechas y
//    Enter; cada levantamiento con un toque corto de Espacio por señal (¡TIRA!, ¡SALTA!, ¡PÁRATE!, ¡ARRIBA!), mirando solo la
//    señal que expone JUEGO.estado(). Sin tutorial aparte. El primer dos tiempos se juega SIN TOCAR (sale solo y vale) y el
//    tercer arranque pide 25 kg de más (se cae, con la línea que nombra el tramo). Después, con el reloj verdadero: pausa
//    (Esc), ayuda (H) y el primer intento de otra final.
//  - tactil (Fácil): lo mismo en un teléfono de costado (844 × 390: en vertical solo se ve «Gira el teléfono»), con toques
//    sobre el escenario y sobre los botones.
//  - clasico: metrónomo y un intento de práctica con el esquema de mantener y soltar.
//  - lento (Fácil, con Brenner): en la final, 40 s con el panel del llamado abierto no gastan reloj (no hay reloj); y
//    después de confirmar, sin tocar nada, el levantamiento sale solo y vale (en 'u' no hay nulo por reloj).
//  - idioma: con ?lang=en la bienvenida sale en inglés; el selector ES · EN la pasa a español sin recargar, lo recuerda y
//    actualiza <html lang> y <title>. Las demás corridas fijan ?lang=es y comparan con las claves de web/js/game/i18n/es.js.
//  - Falla ante errores de consola, excepciones, 404 o pedidos externos; si no se visitan todos los estados; si un panel
//    abre sin foco en su botón principal; si un clic en el escenario agrega entradas; si la señal no se ve o se sale del
//    escenario; si la barra queda bajo la tarima, separada de las manos o no sube en el tutorial; o si el registro
//    exportado no recalcula a la misma tabla.
// Uso: node tools/check_game.mjs [--headed] [--only=idioma|teclado|tactil|clasico|lento] [--semilla=N] [--dibujo]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions, isSoftware } from './browser.mjs';
import { sinApi } from './sin_api.mjs';
import { leerDatos } from '../web/js/sim/data.js';
import { recalcular, resumen } from '../web/js/sim/replay.js';
import ES from '../web/js/game/i18n/es.js';
import EN from '../web/js/game/i18n/en.js';
/** Señales de un toque (la libre de siempre y las de 'u': ¡SALTA!, ¡PÁRATE!, ¡DA TODO!): un toque y la señal se va. */
const UNTOQUE = new Set(['libre', 'luz', 'uno', 'decide']);

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'game');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const ONLY = arg('only'), HEADED = process.argv.includes('--headed'), SEMILLA = +(arg('semilla') || 20261111), DIBUJO = process.argv.includes('--dibujo'), TRAZA = process.argv.includes('--traza');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(WEB, 'data/sim.json'), 'utf8')));

const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;      // /api/estado y /api/partida: juego sin límite (tools/sin_api.mjs)
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const problemas = [], notas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));

// en 'u' no hay repetición de los intentos propios (la línea dice dónde cayó; no hay un momento que mirar)
const ESTADOS = ['inicio', 'presentacion', 'apertura', 'llamado', 'intento', 'decision', 'rival', 'intervalo', 'clasificacion', 'ceremonia', 'fin'];

async function corrida(via) {
  if (via === 'idioma') return idiomas();
  const tactil = via === 'tactil', clasico = via === 'clasico', lento = via === 'lento', tag = `[${via}]`;
  const ctx = await browser.newContext(tactil ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), cdp = tactil ? await ctx.newCDPSession(page) : null;
  page.on('console', m => { if (m.type() === 'error') problemas.push(`${tag} console.error: ${m.text()}`); });
  page.on('pageerror', e => problemas.push(`${tag} pageerror: ${e.message}`));
  // En Chromium sin GPU un GLB que cargó bien puede quedar informado como abortado (le pasa también a la prueba del visor):
  // se anota, y más abajo se verifica que los dos modelos estén en memoria.
  page.on('requestfailed', r => (/\.glb$/.test(r.url()) && r.failure()?.errorText === 'net::ERR_ABORTED' ? notas : problemas).push(`${tag} requestfailed: ${r.url().replace(base, '')} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) problemas.push(`${tag} HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problemas.push(`${tag} pedido externo: ${r.url()}`); });
  const J = (fn, a) => page.evaluate(fn, a);
  const mal = txt => { const m = `${tag} ${txt}`; if (!problemas.includes(m)) problemas.push(m); };

  // ---- la vía real de entrada: tecla o dedo. Nunca el mouse (salvo para probar que no hace nada).
  // el botón táctil; si un panel con botones lo esconde, el borde izquierdo del escenario (también recibe toques)
  const zona = async () => { const b = await page.locator('#zona').boundingBox(); return b ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } : { x: 4, y: Math.round((await page.viewportSize()).height / 2) }; };
  const baja = async () => { if (tactil) { const p = await zona(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); } else await page.keyboard.down('Space'); };
  const sube = async () => { if (tactil) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space'); };
  /** Lleva el foco con Tab hasta el botón `sel` (teclado). */
  const foco = async sel => { for (let i = 0; i < 40; i++) { if (await J(sel => !!document.activeElement?.matches?.(sel), sel)) return true; await page.keyboard.press('Tab'); } mal(`con Tab no se llega a ${sel}`); return false; };
  /** Activa un botón: con Tab y Enter en teclado, con el dedo en táctil. */
  const pulsa = async sel => {
    const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible()) || !(await l.isEnabled())) return false;
    if (tactil) await l.tap(); else { if (!await foco(sel)) return false; await page.keyboard.press('Enter'); }
    return true;
  };

  await page.goto(`${base}juego.html?lang=es&semilla=${SEMILLA}&q=${tactil ? 'movil&ritmo=completa' : 'baja'}${clasico ? '&ctl=c' : ''}${DIBUJO ? '' : '&dibujo=0'}`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
  const gl = await J(() => { const g = JUEGO.escena.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.log(`${tag} ${gl}`);
  const vistas = new Set(), paneles = new Set(), fotos = [], pedidas = []; let senalMal = 0, senalN = 0, clicProbado = false, escProbado = false, fotosBarra = 0;

  /** Juega lo que haya en pantalla hasta que `hasta(estado)` sea cierto. `manual`: la prueba adelanta el reloj. */
  async function jugar(hasta, manual, o = {}) {
    const av = async ms => { if (manual) await J(ms => JUEGO.test.avanzar(ms), ms); else await page.waitForTimeout(ms); };
    const ir = async t => { if (manual) await J(t => JUEGO.test.hasta(t, 8), t); else { const d = t - await J(() => JUEGO.reloj.ahora()); if (d > 0) await page.waitForTimeout(d); } };
    const toque = async () => { await baja(); await av(30); await sube(); };
    let ultToque = 0, metro = false, llamado = '', hecho = '', firma = '', traza = '';
    for (let n = 0; n < 80000; n++) {
      const s = await J(() => JUEGO.estado());
      if (s.errores.length) throw new Error('error en el juego: ' + s.errores[0]);
      if (hasta(s)) return s;
      const I = s.intento;
      if (TRAZA) { const k = `${s.pantalla} ${s.modo}${s.panel ? ' panel' : ''}${s.sobre ? ' sobre:' + s.sobre : ''} foco:${s.foco} ${I ? `${I.fase} ${I.senal ? I.senal.clave + (I.parado ? ' PARADO' : '') : '-'}` : ''}`; if (k !== traza) { traza = k; console.log(`   ${tag} ${Math.round(s.ahora)} ${k}`); } }
      if (I && I.propio && s.modo !== 'panel') {
        const g = I.senal;
        if (g) {      // la señal tiene que verse, con la tecla dibujada, y quedar dentro del escenario
          vistas.add(g.verbo); senalN++;
          if (!g.visible || !g.texto.includes(ES[tactil ? 'tecla.toca' : 'tecla.espacio']) || !g.texto.includes(g.verbo)) { senalMal++; if (senalMal < 3) mal(`la señal «${g.verbo}» no se ve completa: visible ${g.visible}, texto «${g.texto}»`); }
          if (senalN % 40 === 1) { const r = await J(id => { const a = document.getElementById(id).getBoundingClientRect(), b = document.getElementById('escena').getBoundingClientRect(), z = document.getElementById('zocalo').getBoundingClientRect(); return { fuera: a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1, zocalo: z.width > 0 && a.left < z.right && a.right > z.left && a.top < z.bottom && a.bottom > z.top, ancho: document.documentElement.scrollWidth > innerWidth + 1 }; }, g.barra ? 'barrita' : 'senal'); if (r.fuera) mal('la señal se sale del escenario'); if (r.zocalo) mal('la señal tapa el zócalo'); if (r.ancho) mal('la página desborda a lo ancho'); }
        }
        if (I.ctl === 'c') {      // Clásico: apretar, mantener y soltar
          if (I.fase === 'pelea' || I.fase === 'traba') {
            const p = I.pelea, quiere = p.modo === 'traba' ? p.E < p.exiTraba + 150 : (p.P < 1e6 && p.aguja < p.exi + 55) || (!p.trabado && p.E < p.exiTraba + 150);
            if (quiere && s.ahora - ultToque >= 150) { await baja(); await av(40); await sube(); ultToque = s.ahora; } else await av(manual ? 16 : 10);
          } else if (I.fase === 'fijacion' && !I.apretado) { await baja(); await av(30); }
          else if (I.objetivo !== null) { await ir(I.objetivo); if (I.accion === 'baja') { await baja(); if (I.fase === 'vuelo' || I.fase === 'empuje') { await av(40); await sube(); } } else await sube(); await av(16); }
          else await av(manual ? 30 : 15);
          continue;
        }
        // Fácil: un toque por señal. La prueba no mira nada más que la señal.
        if (!g || o.ausente?.(llamado)) { await av(o.ausente?.(llamado) ? 500 : 20); continue; }
        if (!tactil && !clicProbado && (g.tipo === 'libre' || g.tipo === 'barra') && !I.guiado) {      // un clic en el escenario no es un gesto
          clicProbado = true; await page.mouse.click(640, 260); await av(60); const d = (await J(() => JUEGO.estado())).intento;
          if (!d || d.entradas !== I.entradas || d.fase !== I.fase) mal(`un clic en el escenario cambió el intento (entradas ${I.entradas} → ${d?.entradas}, fase ${I.fase} → ${d?.fase})`);
          continue;
        }
        if (!tactil && !manual && !escProbado && (g.tipo === 'libre' || g.tipo === 'barra') && !I.guiado) {      // Esc no pausa dentro del intento (en el tutorial guiado, Esc lo saltea)
          escProbado = true; await page.keyboard.press('Escape'); await av(60); if ((await J(() => JUEGO.estado())).sobre) mal('Esc abrió la pausa en medio del intento'); continue;
        }
        if (I.parado) { await av(80); await toque(); continue; }      // tutorial: el reloj está detenido esperando el toque
        // 'b': la barrita. Toca cuando el puntero pasa por la zona pedida (verde: el centro; amarillo: el medio del amarillo;
        // rojo: la punta), con el reloj inyectado; fotos de la barrita corriendo y del toque marcado
        if (g.tipo === 'barra') {
          const k = g.clave + g.desde; if (hecho === k) { await av(manual ? 30 : 15); continue; }
          const z = o.zona?.(llamado, g.barra.i) || 'verde', obj = g.objetivo + (z === 'amarillo' ? Math.round((g.barra.vMs + g.barra.aMs) / 2) : z === 'rojo' ? 700 : 0);
          if (fotosBarra < 2) await foto(`barrita_${++fotosBarra}_corre`);
          await ir(obj - 1); await toque(); hecho = k; pedidas.push({ llamado: llamado.split('|')[0], i: g.barra.i, z });
          if (pedidas.length <= 3 || z !== 'verde') { await av(60); await foto(`barrita_${pedidas.length}_${z}`); }
          continue;
        }
        if (UNTOQUE.has(g.tipo)) { await av(150); await toque(); continue; }
        if (g.tipo === 'cierre') {
          const k = g.clave + g.desde;
          if (I.seDetiene || hecho === k || (g.clave === 'explota' && o.sinExplotar?.(llamado)) || (g.clave === 'recibi' && o.sinRecibir?.(llamado))) { await av(manual ? 30 : 15); continue; }
          await ir(g.objetivo); await toque(); hecho = k; continue;
        }
        if (g.tipo === 'empuja') { if (s.ahora - ultToque >= (o.empujeCada || 150)) { await toque(); ultToque = s.ahora; } else await av(manual ? 16 : 10); continue; }
        await av(manual ? 30 : 15); continue;
      }
      if (s.pantalla === 'metronomo' && !metro && o.metronomo) {      // ocho toques sobre el pulso, con 30 ms de atraso
        metro = true; for (let i = 0; i < 8; i++) { await ir(s.metro + i * 700 + 30); await baja(); await av(50); await sube(); } await av(800); continue;
      }
      if (s.panel && !s.sobre) {
        const P = await J(() => { const pn = document.querySelector('#capa .panel'); if (!pn) return null; const ir = pn.querySelector('button.ir:not(:disabled)'), act = document.activeElement; return { firma: (pn.querySelector('h1,h2')?.textContent || '') + '|' + pn.querySelectorAll('button').length, botones: pn.querySelectorAll('button:not(:disabled)').length, foco: !ir || act === ir, visible: !act || act === document.body || getComputedStyle(act).outlineStyle !== 'none' }; });
        if (P && P.botones) {
          if (P.firma !== firma) {      // panel recién abierto: el foco tiene que estar en el botón principal, y verse
            firma = P.firma; paneles.add(s.pantalla);
            if (!P.foco && s.pantalla !== 'inicio') mal(`el panel «${P.firma.split('|')[0]}» (${s.pantalla}) abrió sin foco en su botón principal`);
            if (!tactil && !P.visible) mal(`en el panel «${P.firma.split('|')[0]}» el foco no se ve`);
            await av(450);
            if (s.pantalla === 'llamado') {      // el panel único: a veces sube un kilo (cuenta como cambio) y elige envión
              llamado = P.firma;
              if (o.cambia && /intento 2/.test(llamado)) { if (tactil) await pulsa('#kg-mas'); else { const k0 = await page.locator('#kg-val').textContent(); await page.keyboard.press('ArrowRight'); if (+(await page.locator('#kg-val').textContent()) !== +k0 + 1) mal('la flecha derecha no sumó un kilo'); } }
              if (o.pesado?.(llamado)) for (let i = 0; i < 5; i++) { if (tactil) await pulsa('#kg-mas5'); else await page.keyboard.press('ArrowUp'); }
              if (o.envion && /Dos tiempos/.test(llamado)) { await pulsa('#btn-mas'); await pulsa(`.envion[data-env="${o.envion(llamado)}"]`); }
            }
          }
          let hizo = false; for (const sel of o.botones || ['#capa .panel button.ir']) if (await pulsa(sel)) { hizo = true; break; }
          // 350 ms entre dos pulsaciones del mismo panel: el segundo «¿Seguro?» no acepta una ráfaga que empezó antes (G2.1)
          await av(hizo ? 350 : 200); continue;
        }
      }
      await av(['rival', 'decision', 'repeticion', 'repeticion_rival'].includes(s.pantalla) ? 450 : 200);
      if (['rival', 'decision', 'repeticion', 'repeticion_rival', 'carga', 'desplazado'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) { await baja(); await av(20); await sube(); }      // el toque de saltear
    }
    throw new Error('la prueba no avanza (pantalla ' + (await J(() => JUEGO.estado().pantalla)) + ')');
  }
  // Sin --dibujo el juego no dibuja el 3D (?dibujo=0): antes de cada captura se fuerza un cuadro, para que la imagen sirva
  // para mirar y para que el dibujo (sombreadores, texturas) se ejerza al menos una vez por corrida, también por software.
  // Si ese cuadro falla, queda como error de consola y la prueba falla.
  const foto = async nombre => {
    if (!DIBUJO) { const t = Date.now(); await J(() => { try { window.JUEGO.escena?.cuadro?.(0, true); } catch (e) { console.error('cuadro forzado para la captura: ' + (e.stack || e)); } }).catch(() => null); fotos.push(Date.now() - t); }
    return page.screenshot({ path: path.join(OUT, `${via}_${nombre}.png`) }).catch(() => null);
  };
  const cerrar = async () => { if (fotos.length) console.log(`${tag} capturas en out/game con un cuadro del 3D forzado: ${fotos.length} · ms de JavaScript de cada uno (el primero compila sombreadores; no es una medida de fluidez): ${fotos.join(', ')}`); await ctx.close(); };

  await J(() => JUEGO.test.manual());
  const s0 = await J(() => JUEGO.estado());
  // la bienvenida: con teclado el foco arranca en el nombre; con el dedo, en «Jugar» (no abre el teclado de pantalla sin pedirlo)
  if (s0.foco !== (tactil ? '#btn-empezar' : '#nombre')) mal(`la bienvenida no abre con el foco en ${tactil ? '«Jugar»' : 'el nombre'} (foco: ${s0.foco})`);
  const ini = await J(() => { const pn = document.querySelector('#capa .panel'); return { jugar: pn.querySelector('#btn-empezar')?.textContent.trim(), nombre: !!pn.querySelector('input#nombre'), idiomas: pn.querySelectorAll('.idi').length, ayuda: !!pn.querySelector('#btn-ayuda'), tarjetas: pn.querySelectorAll('.pesista').length, opciones: !!pn.querySelector('.nivel'), lang: document.documentElement.lang }; });
  if (ini.jugar !== ES['bienvenida.jugar'] || !ini.nombre || ini.idiomas !== 2 || !ini.ayuda || ini.tarjetas !== 3 || ini.opciones || ini.lang !== 'es') mal(`la bienvenida no tiene nombre, tres tarjetas, «Jugar», ES · EN y ayuda con «Opciones» plegado: ${JSON.stringify(ini)}`);
  // el nombre se escribe sin que el juego se coma las teclas: la H no abre la ayuda y Espacio no es un toque
  const NOMBRE = "Hugo O'Neil";
  if (!tactil) {
    const k0 = await J(() => JUEGO.toques.total); await page.keyboard.type(NOMBRE);
    const k1 = await J(() => ({ toques: JUEGO.toques.total, sobre: JUEGO.estado().sobre, valor: document.getElementById('nombre')?.value, titulo: document.getElementById('pesista-t')?.textContent }));
    if (k1.toques !== k0 || k1.sobre || k1.valor !== NOMBRE || !k1.titulo.includes(NOMBRE)) mal(`escribir el nombre: ${JSON.stringify(k1)} (toques antes ${k0})`);
  }

  if (clasico) {
    // ---- Clásico: metrónomo y un intento de práctica, con el esquema de mantener y soltar
    if (s0.ctl !== 'c') mal('con ?ctl=c el inicio no quedó en Clásico');
    await jugar(s => s.visitados.includes('decision') && s.pantalla === 'practica' && s.panel, true, { metronomo: true });
    const r = await J(() => ({ propios: JUEGO.E.propios || [], cal: JUEGO.E.cfg.cal, alto: JUEGO.E.monitor.alto, visitados: JUEGO.E.visitados }));
    console.log(`${tag} práctica en Clásico: ${r.propios.map(x => x.res + (x.causa ? ':' + x.causa : '')).join(' ')} · atraso medido ${r.cal} ms · señales: ${[...vistas].join(' ')}`);
    if (r.cal !== 30) mal(`el metrónomo midió ${r.cal} ms y los toques iban con 30 ms de atraso`);
    if (r.propios[0]?.res !== 'valido' || r.propios[0].ctl !== 'c') mal(`la práctica en Clásico no salió válida: ${JSON.stringify(r.propios[0])}`);
    if (!(r.alto.practica > 1.5)) mal(`en el calentamiento la barra no subió (máximo ${r.alto.practica?.toFixed(2)} m)`);
    for (const v of ['senal.aprieta', 'senal.suelta', 'senal.recibe_pro', 'senal.deja'].map(k => ES[k])) if (!vistas.has(v)) mal(`en Clásico no apareció la señal «${v}»`);
    await foto('practica'); await cerrar(); return;
  }

  if (lento) {
    // ---- 'u': el panel del llamado no tiene reloj, y sin tocar nada el levantamiento sale solo y vale
    if (!await pulsa('.pesista[data-id="brenner"]')) mal('no se pudo elegir a Brenner');
    await jugar(s => s.pantalla === 'llamado' && s.panel, true);
    await J(() => JUEGO.test.avanzar(450));
    const a1 = await J(() => ({ reloj: document.getElementById('reloj').textContent, txt: document.querySelector('#capa .panel').textContent }));
    await J(() => JUEGO.test.avanzar(40000, 100));
    const a2 = await J(() => ({ s: JUEGO.estado(), reloj: document.getElementById('reloj').textContent }));
    console.log(`${tag} panel del llamado: reloj ${a1.reloj}; 40 s después, ${a2.reloj} (pantalla ${a2.s.pantalla})`);
    if (a2.s.pantalla !== 'llamado' || !a2.s.panel || a2.reloj !== a1.reloj) mal(`con el panel del llamado abierto el reloj corrió o venció: ${a1.reloj} → ${a2.reloj}, pantalla ${a2.s.pantalla}`);
    if (!/Sin apuro/.test(a1.txt) || !/ESPACIO: levantar \d+ kg/.test(a1.txt) || !/Te sobra|Te falta/.test(a1.txt)) mal(`el panel del llamado no dice «Sin apuro», «ESPACIO: levantar N kg» y «Te sobra / Te falta»: «${a1.txt.replace(/\s+/g, ' ').slice(0, 300)}»`);
    // ---- confirmar con Espacio (el foco está en «levantar») y no tocar nada más
    await page.keyboard.press('Space'); let quedan = '', ultimo = null, x0 = null;
    let fotoLenta = false;
    for (let i = 0; i < 200 && !ultimo; i++) {
      await J(() => JUEGO.test.avanzar(500));
      if (!fotoLenta && i === 20) { fotoLenta = true; await foto('barrita_lenta'); }      // a los 10 s: el puntero ya va más despacio
      const x = await J(() => ({ senal: document.getElementById('senal').hidden ? '' : document.getElementById('senal').textContent.replace(/\s+/g, ' '), propios: JUEGO.E.propios || [], err: JUEGO.estado().errores, I: JUEGO.estado().intento }));
      if (x.err.length) throw new Error('error en el juego: ' + x.err[0]);
      if (!x0 && x.I) x0 = x.I;
      if (!quedan && /Quedan \d+ s/.test(x.senal)) quedan = x.senal;
      if (x.propios.length) ultimo = x.propios[x.propios.length - 1];
    }
    console.log(`${tag} sin tocar después de confirmar: ${ultimo ? `${ultimo.res}${ultimo.causa ? ':' + ultimo.causa : ''} · barrita ${ultimo.uno?.barras?.[0]?.zona} sola ${ultimo.uno?.barras?.[0]?.sola} · margen ${ultimo.uno?.margen_fin}` : 'no terminó'}`);
    if (!x0) mal('Espacio en el panel no empezó el levantamiento');
    if (quedan) mal(`en 'b' no hay cuenta regresiva: «${quedan}»`);
    if (!ultimo || ultimo.res !== 'valido' || !ultimo.uno?.barras?.[0]?.sola) mal(`sin tocar, el levantamiento no salió solo (regular) y válido: ${JSON.stringify(ultimo)}`);
    await foto('solo'); await cerrar(); return;
  }

  // ---- 1. Fácil: partida completa con el reloj inyectado, sin mouse
  const t0 = Date.now();
  if (!await pulsa(`.pesista[data-id="${tactil ? 'brenner' : 'ventura'}"]`) || !await pulsa('#btn-opciones') || !await pulsa('.nivel[data-n="normal"]')) mal('no se pudo elegir pesista y nivel (en «Opciones»)');
  const envion = tactil ? () => 'split' : clave => (/intento 1/.test(clave) ? 'split' : /intento 2/.test(clave) ? 'squat' : 'power');
  // en 'u' un fallo no sale de tocar mal: sale de pedir mucho. El tercer arranque pide 25 kg de más (se cae, con su línea),
  // y el primer dos tiempos se juega sin tocar nada (sale solo y vale: no tocar nunca tira la barra)
  const pesado = clave => /Arranque · intento 3/.test(clave), ausente = clave => /Dos tiempos · intento 1/.test(clave);
  // 'b': dónde pega cada barrita. El segundo arranque en el amarillo; el tercero (25 kg de más) en el verde, y se cae igual
  // (la línea dice «pegaste en el verde, pero…»); el segundo dos tiempos, la cargada en el rojo (la punta) y el envión en el verde
  const dondePega = (clave, i) => (/Arranque · intento 2/.test(clave) ? 'amarillo' : /Dos tiempos · intento 2/.test(clave) && i === 0 ? 'rojo' : 'verde');
  const fin = await jugar(s => s.pantalla === 'fin', true, { cambia: true, envion, pesado, ausente, zona: dondePega });
  const r = await J(() => ({ registro: JUEGO.registro, tabla: JUEGO.E.p.tabla().map(f => `${f.id}:${f.s}+${f.c}=${f.total}#${f.puesto ?? '-'}`).join(' '), monitor: JUEGO.E.monitor, visitados: JUEGO.E.visitados, cal: JUEGO.E.cfg.cal, propios: JUEGO.E.propios || [],
    modelos: Object.keys(JUEGO.escena.atletas).sort().join(','), mios: JUEGO.E.p.at[JUEGO.E.yo].s.concat(JUEGO.E.p.at[JUEGO.E.yo].c).map(x => `${x.kg}${x.res === 'valido' ? '✓' : '✗' + (x.causa || '')}`).join(' ') }));
  const seg = (Date.now() - t0) / 1000;
  console.log(`${tag} partida completa en ${seg.toFixed(1)} s de reloj real · tabla: ${r.tabla}`);
  console.log(`${tag} intentos del jugador: ${r.mios} · controles ${r.registro.ctl} · corrección de atraso ${r.cal} ms · llamados ${r.registro.llamados.length}`);
  console.log(`${tag} señales vistas: ${[...vistas].join(' ')} · paneles con foco verificado: ${[...paneles].join(', ')}`);
  if (seg > 90) notas.push(`${tag} la partida tardó ${seg.toFixed(0)} s`);
  if (r.registro.ctl !== 'b') mal(`el registro no quedó en Fácil, la barrita (ctl ${r.registro.ctl})`);
  if (tactil && !r.visitados.includes('rival')) mal('final completa: no se mostró ningún intento de un rival');
  // la repetición es solo de los fallos: con el dedo los seis salen válidos y no tiene que haber ninguna
  for (const e of ESTADOS) if (!r.visitados.includes(e)) mal(`no se visitó el estado «${e}»`);
  for (const e of ['tarjeta', 'tutorial', 'guiado', 'repeticion']) if (r.visitados.includes(e)) mal(`en 'u' no tiene que aparecer «${e}» (sin tutorial aparte ni repetición propia)`);
  const rc = recalcular(r.registro, datos);
  if (!rc.ok) mal(`el registro exportado no recalcula: ${rc.error}`); else if (resumen(rc.tabla) !== r.tabla) mal(`recalculado «${resumen(rc.tabla)}», en pantalla «${r.tabla}»`);
  if (r.modelos !== 'brenner,ventura') mal(`modelos en memoria: ${r.modelos}`);
  if (!(r.monitor.cuadros > 500)) mal(`el monitor de la barra casi no midió (${r.monitor.cuadros} cuadros)`);
  if (r.monitor.barraMin < .2249) mal(`la barra quedó bajo la tarima: centro a ${(r.monitor.barraMin * 1000).toFixed(1)} mm`);
  if (r.monitor.manosMax > .16) mal(`la barra se separó de las manos: ${(r.monitor.manosMax * 1000).toFixed(0)} mm`);
  console.log(`${tag} barra: mínimo ${(r.monitor.barraMin * 1000).toFixed(1)} mm · manos a barra, máximo ${(r.monitor.manosMax * 1000).toFixed(0)} mm · ${r.monitor.cuadros} cuadros medidos · altura máxima por pantalla: ${Object.entries(r.monitor.alto).map(([k, v]) => `${k} ${v.toFixed(2)} m`).join(', ')}`);
  for (const v of [ES['barra.verbo'], ES['senal.aguanta'], ES['senal.abajo']]) if (!vistas.has(v)) mal(`no apareció la señal «${v}»`);
  for (const v of ['explota', 'recibi', 'empuja', 'flexiona', 'tira', 'salta', 'parate'].map(k => ES['senal.' + k])) if (vistas.has(v)) mal(`en 'b' apareció la señal «${v}» (de círculos o de 'u')`);
  // las aperturas valen siempre (también el dos tiempos sin tocar); el de 25 kg de más se cae. Los otros llevan el peso del
  // entrenador (G2.1), que en el tercer intento va por más o por el oro con 7½ o 2 de 10: pueden caer, y entonces cada caída
  // tiene que decir dónde se quedó sin energía (nunca un tiempo)
  const marcas = r.mios.split(" "), f = r.propios.find(x => x.res === 'fallo'), aus = r.propios.find(x => x.uno && x.uno.barras?.length && x.uno.barras.every(b => b.sola));
  if (!/✓/.test(marcas[0] || '') || !/✓/.test(marcas[3] || '')) mal(`las aperturas tienen que valer: ${r.mios}`);
  // toda caída dice dónde pegó en la barrita y dónde se quedó sin energía (nunca un tiempo)
  for (const x of r.propios.filter(y => y.res === 'fallo')) if (!/se quedó sin energía en /i.test(x.linea || '') || !/pegaste en el (verde|amarillo|rojo)/i.test(x.linea || '') || /ms\b/.test(x.linea || '')) mal(`una caída sin la línea de la barrita y el tramo: ${JSON.stringify(x)}`);
  if (!f || !/^Pegaste en el verde, pero /.test(f.linea)) mal(`el arranque con 25 kg de más (pegando en el verde) no cayó con «Pegaste en el verde, pero…»: ${r.mios} · ${JSON.stringify(f)}`); else console.log(`${tag} línea del fallo por kilos: «${f.linea}»`);
  if (!aus || aus.res !== 'valido') mal(`el dos tiempos sin tocar no salió solo (regular) y válido: ${JSON.stringify(aus)}`); else console.log(`${tag} dos tiempos sin tocar: ${aus.res} · barritas ${aus.uno.barras.map(b => b.zona + (b.sola ? ' sola' : '')).join(', ')} · margen ${aus.uno.margen_fin}`);
  // cada barrita quedó en la zona donde se tocó (el núcleo juzga el instante del evento con la misma función que dibuja)
  { const vistas2 = r.propios.flatMap(x => (x.uno?.barras || []).filter(b => !b.sola).map(b => b.zona)), quer = pedidas.map(x => x.z);
    console.log(`${tag} barritas: pedidas ${quer.join(' ')} · salieron ${vistas2.join(' ')}`);
    if (vistas2.join() !== quer.join()) mal(`las barritas no salieron donde se tocó: pedidas ${quer.join(' ')}, salieron ${vistas2.join(' ')}`); }
  if (!tactil) {
    if (!clicProbado) mal('no se llegó a probar el clic en el escenario');
    if (!r.registro.llamados.some(c => c.cambios?.length)) notas.push(`${tag} la partida no tuvo ningún cambio de kilos`);
  }
  // el nombre del jugador en la tabla y en el podio (con teclado, el que escribió; con el dedo, el de siempre), y los eventos del embudo
  { const quien = tactil ? ES['bienvenida.nombre_defecto'] : NOMBRE;
    const x = await J(() => ({ titulo: document.querySelector('#capa .panel h1')?.textContent || '', fila: document.querySelector('#capa .tabla tr.yo td.n')?.textContent || '', botones: [...document.querySelectorAll('#capa .panel button')].map(b => b.id), eventos: (JUEGO.eventos || []).map(e => e.ev) }));
    if (!x.titulo.includes(quien) || !x.fila.includes(quien)) mal(`el podio o la tabla no llevan el nombre «${quien}»: «${x.titulo}» · «${x.fila}»`);
    for (const b of ['btn-revancha', 'btn-cambiar', 'btn-compartir']) if (!x.botones.includes(b)) mal(`el podio no tiene #${b}: ${x.botones.join(', ')}`);
    for (const e of ['juego_abierto', 'nombre_puesto', 'pesista_elegido', 'partida_pedida', 'final_inicio', 'intento_propio', 'final_fin'].concat(tactil ? [] : ['opciones_abiertas'])) if (!x.eventos.includes(e)) mal(`falta el evento «${e}» (hubo: ${[...new Set(x.eventos)].join(', ')})`);
    console.log(`${tag} podio: «${x.titulo}» · eventos: ${x.eventos.length} (${[...new Set(x.eventos)].join(', ')})`); }
  await foto('fin');

  // ---- 2. con el reloj verdadero: pausa, ayuda y el primer intento de otra final a velocidad real
  await J(() => JUEGO.test.real()); await page.waitForTimeout(700);
  await pulsa('#btn-cambiar'); await page.waitForFunction(() => JUEGO.estado().pantalla === 'inicio'); await page.waitForTimeout(500);
  await J(() => { JUEGO.E.visitados.length = 0; JUEGO.E.propios = []; }); const tr0 = Date.now();
  if (!tactil) {
    await page.keyboard.press('Escape');
    const p1 = await J(() => ({ sobre: JUEGO.estado().sobre, t: JUEGO.reloj.ahora(), foco: document.activeElement?.id })); await page.waitForTimeout(300);
    const p2 = await J(() => JUEGO.reloj.ahora());
    if (p1.sobre !== 'pausa' || p1.foco !== 'so-seguir') mal(`la pausa no abrió con foco en «Seguir»: ${JSON.stringify(p1)}`); else if (p2 !== p1.t) mal(`el reloj siguió corriendo en pausa (${(p2 - p1.t).toFixed(0)} ms)`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const p3 = await J(() => ({ sobre: JUEGO.estado().sobre, t: JUEGO.reloj.ahora(), foco: JUEGO.estado().foco }));
    if (p3.sobre || !(p3.t > p2 + 100) || !p3.foco) mal(`al volver de la pausa: ${JSON.stringify(p3)} (antes ${p2.toFixed(0)})`);
    await page.keyboard.press('h'); const a1 = await J(() => ({ sobre: JUEGO.estado().sobre, txt: document.getElementById('sobre').textContent })); await foto('ayuda');
    const glosario = await J(() => document.querySelectorAll('#sobre .glosario dt').length);
    if (glosario !== 11) mal(`el glosario de «Cómo se juega» tiene ${glosario} palabras (en 'b' son 11: la barrita, el cansancio, la energía, la garra y la suerte)`);
    if (a1.sobre !== 'ayuda' || !/Cómo se juega/.test(a1.txt) || !/ESPACIO/.test(a1.txt) || !/verde/.test(a1.txt) || /círculo|¡SALTA!/.test(a1.txt)) mal(`H no abrió «Cómo se juega» de 'b': ${JSON.stringify(a1).slice(0, 300)}`);
    await page.keyboard.press('h'); if (await J(() => JUEGO.estado().sobre)) mal('H no cerró la ayuda');
    if (await page.locator('#btn-otro').count()) mal('en \'u\' el inicio no tiene que ofrecer práctica aparte');
  }
  await jugar(s => s.visitados.includes('intento') && s.pantalla === 'decision', false);      // el primer intento propio de la final, a velocidad real
  await page.waitForFunction(() => (JUEGO.E.propios || []).length >= 1, null, { timeout: 20000 }).catch(() => null); await foto('real');
  const real = await J(() => ({ propios: JUEGO.E.propios, v: JUEGO.E.visitados.slice() }));
  console.log(`${tag} primer intento de otra final en tiempo real: ${((Date.now() - tr0) / 1000).toFixed(1)} s · ${real.propios.map(x => `${x.pantalla} ${x.res}${x.causa ? ':' + x.causa : ''}`).join(' · ')}`);
  if (real.propios[0]?.res !== 'valido') (isSoftware(gl) ? notas : problemas).push(`${tag} el primer intento de la final a velocidad real no salió válido: ${JSON.stringify(real.propios[0])}`);
  if (!tactil && !escProbado) mal('no se llegó a probar Esc dentro del intento');
  void fin;
  await cerrar();
}

/** Idioma: ?lang=en, el selector ES · EN sin recargar, lo que queda guardado y el aviso de girar en los dos idiomas. */
async function idiomas() {
  const tag = '[idioma]', ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' }), page = await ctx.newPage();
  const mal = txt => problemas.push(`${tag} ${txt}`), J = (fn, a) => page.evaluate(fn, a);
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  const leer = () => J(() => ({ lang: document.documentElement.lang, titulo: document.title, jugar: document.getElementById('btn-empezar')?.textContent.trim(), h2: document.getElementById('pesista-t')?.textContent, ev: document.getElementById('ev-titulo')?.textContent, guardado: localStorage.getItem('tarima.idioma'), eventos: (JUEGO.eventos || []).map(e => e.ev) }));
  // sin ?lang= y con el navegador en inglés: inglés
  await page.goto(`${base}juego.html?dibujo=0&q=baja`, { waitUntil: 'load' }); if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
  let x = await leer();
  if (x.lang !== 'en' || x.jugar !== EN['bienvenida.jugar'] || x.titulo !== EN['app.titulo'] || x.ev !== EN['app.evento'] || !x.h2.includes(EN['bienvenida.nombre_defecto'])) mal(`con el navegador en inglés la bienvenida no salió en inglés: ${JSON.stringify(x)}`);
  await page.screenshot({ path: path.join(OUT, 'idioma_en.png') }).catch(() => null);
  // el selector la pasa a español sin recargar, y queda guardado
  await page.locator('#capa .idi[data-lang="es"]').click(); await page.waitForTimeout(150); x = await leer();
  if (x.lang !== 'es' || x.jugar !== ES['bienvenida.jugar'] || x.titulo !== ES['app.titulo'] || x.ev !== ES['app.evento'] || x.guardado !== 'es' || !x.eventos.includes('idioma_cambiado')) mal(`el selector no pasó a español: ${JSON.stringify(x)}`);
  await page.screenshot({ path: path.join(OUT, 'idioma_es.png') }).catch(() => null);
  await page.reload({ waitUntil: 'load' }); await J(() => window.JUEGO.listo); x = await leer();
  if (x.lang !== 'es') mal(`al recargar no se recordó el español: ${JSON.stringify(x)}`);
  // ?lang= manda sobre lo guardado
  await page.goto(`${base}juego.html?dibujo=0&q=baja&lang=en`, { waitUntil: 'load' }); await J(() => window.JUEGO.listo); x = await leer();
  if (x.lang !== 'en' || x.jugar !== EN['bienvenida.jugar']) mal(`?lang=en no mandó sobre lo guardado: ${JSON.stringify(x)}`);
  // la ayuda (H) en inglés, con las siete palabras
  await page.locator('#capa .panel').click({ position: { x: 5, y: 5 } }).catch(() => null);
  await J(() => document.getElementById('btn-ayuda').click()); await page.waitForTimeout(150);
  const ay = await J(() => ({ dt: [...document.querySelectorAll('#sobre .glosario dt')].map(d => d.textContent), h2: document.querySelector('#sobre h2')?.textContent }));
  // en 'u' el glosario suma la energía del levantamiento, la garra y la suerte (9 palabras; Clásico tiene 7)
  if (ay.dt.length !== 11 || ay.dt[0] !== EN['glosario.barrita.t'] || !ay.dt.includes(EN['glosario.u_energia.t'])) mal(`la ayuda en inglés: ${JSON.stringify(ay)}`);
  await page.screenshot({ path: path.join(OUT, 'idioma_ayuda_en.png') }).catch(() => null);
  await ctx.close();
  // el caso del dueño: el inglés primero en la lista del navegador y el español después → español
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' }); await ctx2.addInitScript(() => { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'es-419'] }); });
  const p2 = await ctx2.newPage(); await p2.goto(`${base}juego.html?dibujo=0&q=baja`, { waitUntil: 'load' }); await p2.evaluate(() => window.JUEGO.listo);
  const l2 = await p2.evaluate(() => ({ lang: document.documentElement.lang, jugar: document.getElementById('btn-empezar')?.textContent.trim() }));
  if (l2.lang !== 'es' || l2.jugar !== ES['bienvenida.jugar']) mal(`con el inglés primero y el español después en el navegador no salió en español: ${JSON.stringify(l2)}`);
  await ctx2.close();
  console.log(`${tag} navegador en inglés → ${EN['bienvenida.jugar']} · inglés y después español → ${l2.jugar} · selector → ${ES['bienvenida.jugar']}, guardado y recordado al recargar · ?lang=en manda · ayuda: ${ay.h2} (${ay.dt.length} palabras)`);
}

try {
  for (const via of ['idioma', 'teclado', 'tactil', 'clasico', 'lento'].filter(v => !ONLY || v === ONLY)) await corrida(via);
} catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close(); server.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 30)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: partida completa en Fácil (\'u\') por teclado (sin mouse) y por toques, un intento en Clásico, y un levantamiento que sale solo sin tocar, sin errores de consola ni pedidos externos');
