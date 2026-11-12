// Prueba automática del juego (docs/JUEGO.md, sección 9.7, y docs/CONTROLES.md, sección 8). El navegador sale de
// tools/browser.mjs: placa real si la hay (pod con NVIDIA), software si no.
// Por software (GitHub Actions, contenedor sin placa) verifica lo mismo: lógica, toques, paneles y tutorial; no mide cuadros
// por segundo, y un intento a velocidad real que no sale válido queda como nota.
//  - teclado (Fácil): partida completa SIN MOUSE con el reloj inyectado: menús con Tab, flechas y Enter; el tutorial (un
//    arranque guiado); cada levantamiento con toques cortos de Espacio, mirando solo la señal que expone JUEGO.estado().
//    Después, con el reloj verdadero: pausa (Esc), ayuda (H), el tutorial repetido y el primer intento de la final.
//  - tactil (Fácil): lo mismo en tamaño de teléfono, con toques sobre la zona táctil y sobre los botones.
//  - clasico: metrónomo y un intento de práctica con el esquema de mantener y soltar.
//  - lento (Fácil, con Brenner): el arranque guiado tocando ¡EMPUJÁ! cada 600 ms tiene que salir válido a la primera; en la
//    final, 40 s con el panel del llamado abierto no gastan reloj; y después de confirmar, sin tocar, la señal cuenta los
//    últimos segundos y el nulo por reloj lleva su línea.
//  - Falla ante errores de consola, excepciones, 404 o pedidos externos; si no se visitan todos los estados; si un panel
//    abre sin foco en su botón principal; si un clic en el escenario agrega entradas; si la señal no se ve o se sale del
//    escenario; si la barra queda bajo la tarima, separada de las manos o no sube en el tutorial; o si el registro
//    exportado no recalcula a la misma tabla.
// Uso: node tools/check_game.mjs [--headed] [--only=teclado|tactil|clasico|lento] [--semilla=N] [--dibujo]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions, isSoftware } from './browser.mjs';
import { leerDatos } from '../web/js/sim/data.js';
import { recalcular, resumen } from '../web/js/sim/replay.js';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'game');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const ONLY = arg('only'), HEADED = process.argv.includes('--headed'), SEMILLA = +(arg('semilla') || 20261111), DIBUJO = process.argv.includes('--dibujo'), TRAZA = process.argv.includes('--traza');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(WEB, 'data/sim.json'), 'utf8')));

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const problemas = [], notas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));

const ESTADOS = ['inicio', 'presentacion', 'llamado', 'intento', 'decision', 'repeticion', 'resumen', 'intervalo', 'clasificacion', 'ceremonia', 'fin'];

async function corrida(via) {
  const tactil = via === 'tactil', clasico = via === 'clasico', lento = via === 'lento', tag = `[${via}]`;
  const ctx = await browser.newContext(tactil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
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
  const zona = async () => { const b = await page.locator('#zona').boundingBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; };
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

  await page.goto(`${base}juego.html?semilla=${SEMILLA}&q=${tactil ? 'movil&ritmo=completa' : 'baja'}${clasico ? '&ctl=c' : ''}${DIBUJO ? '' : '&dibujo=0'}`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
  const gl = await J(() => { const g = JUEGO.escena.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.log(`${tag} ${gl}`);
  const vistas = new Set(), paneles = new Set(), fotos = []; let senalMal = 0, senalN = 0, clicProbado = false, escProbado = false;

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
          if (!g.visible || !(tactil ? /TOCÁ/ : /ESPACIO/).test(g.texto) || !g.texto.includes(g.verbo)) { senalMal++; if (senalMal < 3) mal(`la señal «${g.verbo}» no se ve completa: visible ${g.visible}, texto «${g.texto}»`); }
          if (senalN % 40 === 1) { const r = await J(() => { const a = document.getElementById('senal').getBoundingClientRect(), b = document.getElementById('escena').getBoundingClientRect(), z = document.getElementById('zocalo').getBoundingClientRect(); return { fuera: a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1, zocalo: z.width > 0 && a.left < z.right && a.right > z.left && a.top < z.bottom && a.bottom > z.top, ancho: document.documentElement.scrollWidth > innerWidth + 1 }; }); if (r.fuera) mal('la señal se sale del escenario'); if (r.zocalo) mal('la señal tapa el zócalo'); if (r.ancho) mal('la página desborda a lo ancho'); }
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
        if (!g) { await av(20); continue; }
        if (!tactil && !clicProbado && g.tipo === 'libre' && !I.guiado) {      // un clic en el escenario no es un gesto
          clicProbado = true; await page.mouse.click(640, 260); await av(60); const d = (await J(() => JUEGO.estado())).intento;
          if (!d || d.entradas !== I.entradas || d.fase !== I.fase) mal(`un clic en el escenario cambió el intento (entradas ${I.entradas} → ${d?.entradas}, fase ${I.fase} → ${d?.fase})`);
          continue;
        }
        if (!tactil && !manual && !escProbado && g.tipo === 'libre' && !I.guiado) {      // Esc no pausa dentro del intento (en el tutorial guiado, Esc lo saltea)
          escProbado = true; await page.keyboard.press('Escape'); await av(60); if ((await J(() => JUEGO.estado())).sobre) mal('Esc abrió la pausa en medio del intento'); continue;
        }
        if (I.parado) { await av(80); await toque(); continue; }      // tutorial: el reloj está detenido esperando el toque
        if (g.tipo === 'libre') { await av(150); await toque(); continue; }
        if (g.tipo === 'cierre') {
          const k = g.clave + g.desde;
          if (I.seDetiene || hecho === k || (g.clave === 'explota' && o.sinExplotar?.(llamado))) { await av(manual ? 30 : 15); continue; }
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
              if (o.envion && /Dos tiempos/.test(llamado)) await pulsa(`.envion[data-env="${o.envion(llamado)}"]`);
            }
          }
          let hizo = false; for (const sel of o.botones || ['#capa .panel button.ir']) if (await pulsa(sel)) { hizo = true; break; }
          await av(hizo ? 50 : 200); continue;
        }
      }
      await av(s.pantalla === 'resumen' || s.pantalla === 'decision' || s.pantalla === 'repeticion' ? 450 : 200);
      if (['resumen', 'decision', 'repeticion', 'carga', 'desplazado'].includes(s.pantalla) && n % 3 === 0 && !(I && I.propio)) { await baja(); await av(20); await sube(); }      // el toque de saltear
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
  const cerrar = async () => { if (fotos.length) console.log(`${tag} capturas en out/game con un cuadro del 3D forzado: ${fotos.length} · ms por cuadro forzado: ${fotos.join(', ')}${isSoftware(gl) ? ' (por software: no es una medida de fluidez)' : ''}`); await ctx.close(); };

  await J(() => JUEGO.test.manual());
  const s0 = await J(() => JUEGO.estado());
  if (s0.foco !== '#btn-empezar') mal(`el inicio no abre con el foco en «Empezar» (foco: ${s0.foco})`);
  const inicioTxt = await page.locator('#capa .panel').textContent();
  if (!/Cómo se juega/.test(inicioTxt) || !(tactil ? /TOCÁ/ : /ESPACIO/).test(inicioTxt) || /Un solo botón/.test(inicioTxt)) mal('la pantalla de inicio no muestra los tres pasos con la tecla dibujada');

  if (clasico) {
    // ---- Clásico: metrónomo y un intento de práctica, con el esquema de mantener y soltar
    if (s0.ctl !== 'c') mal('con ?ctl=c el inicio no quedó en Clásico');
    await jugar(s => s.visitados.includes('decision') && s.pantalla === 'practica' && s.panel, true, { metronomo: true });
    const r = await J(() => ({ propios: JUEGO.E.propios || [], cal: JUEGO.E.cfg.cal, alto: JUEGO.E.monitor.alto, visitados: JUEGO.E.visitados }));
    console.log(`${tag} práctica en Clásico: ${r.propios.map(x => x.res + (x.causa ? ':' + x.causa : '')).join(' ')} · atraso medido ${r.cal} ms · señales: ${[...vistas].join(' ')}`);
    if (r.cal !== 30) mal(`el metrónomo midió ${r.cal} ms y los toques iban con 30 ms de atraso`);
    if (r.propios[0]?.res !== 'valido' || r.propios[0].ctl !== 'c') mal(`la práctica en Clásico no salió válida: ${JSON.stringify(r.propios[0])}`);
    if (!(r.alto.practica > 1.5)) mal(`en el calentamiento la barra no subió (máximo ${r.alto.practica?.toFixed(2)} m)`);
    for (const v of ['APRETÁ Y MANTENÉ', '¡SOLTÁ!', '¡APRETÁ!', 'DEJÁ APRETADO']) if (!vistas.has(v)) mal(`en Clásico no apareció la señal «${v}»`);
    await foto('practica'); await cerrar(); return;
  }

  if (lento) {
    // ---- el arranque guiado no se puede fallar, ni con el pesista de menos garra y un toque cada 600 ms en ¡EMPUJÁ!
    if (!await pulsa('.pesista[data-id="brenner"]')) mal('no se pudo elegir a Brenner');
    await jugar(s => s.pantalla === 'presentacion' && s.panel, true, { empujeCada: 600 });
    const g = await J(() => JUEGO.E.propios || []);
    console.log(`${tag} arranque guiado con Brenner y un toque cada 600 ms en ¡EMPUJÁ!: ${g.map(x => x.res + (x.causa ? ':' + x.causa : '')).join(' ')}`);
    if (g.length !== 1 || g[0].pantalla !== 'guiado' || g[0].res !== 'valido') mal(`el arranque guiado con toques lentos no salió válido a la primera: ${JSON.stringify(g)}`);
    // ---- la final: el panel del llamado no gasta reloj
    await jugar(s => s.pantalla === 'llamado' && s.panel, true, { botones: ['#btn-saltear', '#capa .panel button.ir'] });
    await J(() => JUEGO.test.avanzar(450));
    const a1 = await J(() => ({ reloj: document.getElementById('reloj').textContent, txt: document.querySelector('#capa .panel').textContent }));
    await J(() => JUEGO.test.avanzar(40000, 100));
    const a2 = await J(() => ({ s: JUEGO.estado(), reloj: document.getElementById('reloj').textContent }));
    console.log(`${tag} panel del llamado: reloj ${a1.reloj}; 40 s después, ${a2.reloj} (pantalla ${a2.s.pantalla})`);
    if (a2.s.pantalla !== 'llamado' || !a2.s.panel || a2.reloj !== a1.reloj || !/^0:(30|45)$/.test(a1.reloj)) mal(`con el panel del llamado abierto el reloj corrió o venció: ${a1.reloj} → ${a2.reloj}, pantalla ${a2.s.pantalla}`);
    if (!/arranca cuando confirmás/.test(a1.txt) || !/ENTER/.test(a1.txt)) mal(`el panel del llamado no dice cuándo arranca el reloj: «${a1.txt.replace(/\s+/g, ' ').slice(0, 300)}»`);
    // ---- confirmar y no tocar: cuenta regresiva en la señal y nulo por reloj con su línea
    await page.keyboard.press('Enter'); let aviso = '', ultimo = null;
    for (let i = 0; i < 100 && !ultimo; i++) {
      await J(() => JUEGO.test.avanzar(500));
      const x = await J(() => ({ senal: document.getElementById('senal').hidden ? '' : document.getElementById('senal').textContent.replace(/\s+/g, ' '), reloj: document.getElementById('reloj').textContent, propios: JUEGO.E.propios || [], err: JUEGO.estado().errores }));
      if (x.err.length) throw new Error('error en el juego: ' + x.err[0]);
      if (!aviso && /Quedan \d+ s/.test(x.senal)) aviso = `${x.senal.trim()} (reloj ${x.reloj})`;
      if (x.propios.length > 1) ultimo = x.propios[x.propios.length - 1];
    }
    console.log(`${tag} sin tocar después de confirmar: aviso «${aviso}» · ${ultimo ? `${ultimo.res}:${ultimo.causa} · «${ultimo.linea}»` : 'no terminó'}`);
    if (!aviso) mal('la señal no avisó que se acababa el reloj');
    if (!ultimo || ultimo.res !== 'nulo' || ultimo.causa !== 'reloj' || !/desde que confirmás/.test(ultimo.linea)) mal(`el nulo por reloj no salió con su línea: ${JSON.stringify(ultimo)}`);
    await foto('reloj'); await cerrar(); return;
  }

  // ---- 1. Fácil: partida completa con el reloj inyectado, sin mouse
  const t0 = Date.now();
  if (!await pulsa(`.pesista[data-id="${tactil ? 'brenner' : 'ventura'}"]`) || !await pulsa('.nivel[data-n="normal"]')) mal('no se pudo elegir pesista y nivel');
  if (tactil) await pulsa('#btn-otro');      // táctil: saltea el tutorial (lo juega después, con el reloj verdadero)
  const envion = tactil ? () => 'split' : clave => (/intento 1/.test(clave) ? 'split' : /intento 2/.test(clave) ? 'squat' : 'power');
  // con teclado, en el tercer arranque no se toca la explosión a propósito: tiene que ser un fallo, con su corte y su línea
  const sinExplotar = tactil ? null : clave => /Arranque · intento 3/.test(clave);
  const fin = await jugar(s => s.pantalla === 'fin', true, { cambia: true, envion, sinExplotar });
  const r = await J(() => ({ registro: JUEGO.registro, tabla: JUEGO.E.p.tabla().map(f => `${f.id}:${f.s}+${f.c}=${f.total}#${f.puesto ?? '-'}`).join(' '), monitor: JUEGO.E.monitor, visitados: JUEGO.E.visitados, cal: JUEGO.E.cfg.cal, propios: JUEGO.E.propios || [],
    modelos: Object.keys(JUEGO.escena.atletas).sort().join(','), mios: JUEGO.E.p.at[JUEGO.E.yo].s.concat(JUEGO.E.p.at[JUEGO.E.yo].c).map(x => `${x.kg}${x.res === 'valido' ? '✓' : '✗' + (x.causa || '')}`).join(' ') }));
  const seg = (Date.now() - t0) / 1000;
  console.log(`${tag} partida completa en ${seg.toFixed(1)} s de reloj real · tabla: ${r.tabla}`);
  console.log(`${tag} intentos del jugador: ${r.mios} · controles ${r.registro.ctl} · corrección de atraso ${r.cal} ms · llamados ${r.registro.llamados.length}`);
  console.log(`${tag} señales vistas: ${[...vistas].join(' ')} · paneles con foco verificado: ${[...paneles].join(', ')}`);
  if (seg > 90) notas.push(`${tag} la partida tardó ${seg.toFixed(0)} s`);
  if (r.registro.ctl !== 'f') mal(`el registro no quedó en Fácil (ctl ${r.registro.ctl})`);
  if (tactil && !r.visitados.includes('rival')) mal('final completa: no se mostró ningún intento de un rival');
  for (const e of ESTADOS.concat(tactil ? [] : ['tutorial', 'guiado']).filter(e => !(tactil && e === 'resumen'))) if (!r.visitados.includes(e)) mal(`no se visitó el estado «${e}»`);
  const rc = recalcular(r.registro, datos);
  if (!rc.ok) mal(`el registro exportado no recalcula: ${rc.error}`); else if (resumen(rc.tabla) !== r.tabla) mal(`recalculado «${resumen(rc.tabla)}», en pantalla «${r.tabla}»`);
  if (r.modelos !== 'brenner,ventura') mal(`modelos en memoria: ${r.modelos}`);
  if (!(r.monitor.cuadros > 500)) mal(`el monitor de la barra casi no midió (${r.monitor.cuadros} cuadros)`);
  if (r.monitor.barraMin < .2249) mal(`la barra quedó bajo la tarima: centro a ${(r.monitor.barraMin * 1000).toFixed(1)} mm`);
  if (r.monitor.manosMax > .16) mal(`la barra se separó de las manos: ${(r.monitor.manosMax * 1000).toFixed(0)} mm`);
  console.log(`${tag} barra: mínimo ${(r.monitor.barraMin * 1000).toFixed(1)} mm · manos a barra, máximo ${(r.monitor.manosMax * 1000).toFixed(0)} mm · ${r.monitor.cuadros} cuadros medidos · altura máxima por pantalla: ${Object.entries(r.monitor.alto).map(([k, v]) => `${k} ${v.toFixed(2)} m`).join(', ')}`);
  for (const v of ['¡TIRÁ!', '¡EXPLOTÁ!', '¡RECIBÍ!', '¡EMPUJÁ!', 'AGUANTÁ', '¡ABAJO!', '¡FLEXIONÁ!', '¡ARRIBA!']) if (!vistas.has(v)) mal(`no apareció la señal «${v}»`);
  // el que toca cada señal en su momento tiene que levantar todo (salvo el fallo a propósito)
  const esperado = tactil ? 6 : 5, validos = (r.mios.match(/✓/g) || []).length;
  if (validos < esperado) mal(`tocando cada señal en su momento salieron ${validos} válidos de ${esperado}: ${r.mios}`);
  if (!tactil) {
    if (!clicProbado) mal('no se llegó a probar el clic en el escenario');
    const tut = r.propios.filter(x => x.pantalla === 'guiado' || x.pantalla === 'practica');
    if (tut.length !== 1 || tut[0].pantalla !== 'guiado' || tut[0].res !== 'valido') mal(`tutorial: se esperaba un solo levantamiento (el guiado), válido: ${JSON.stringify(tut)}`);
    if (!(r.monitor.alto.guiado > 1.5)) mal(`en el tutorial la barra no subió: ${JSON.stringify(r.monitor.alto)}`);
    const f = r.propios.find(x => x.res === 'fallo');
    if (!/✗sin_altura/.test(r.mios) || !f || !/No tocaste ¡EXPLOTÁ!/.test(f.linea)) mal(`el arranque sin explosión no dio «sin altura» con su línea: ${r.mios} · ${JSON.stringify(f)}`); else console.log(`${tag} línea del fallo a propósito: «${f.linea}»`);
    if (!r.registro.llamados.some(c => c.cambios?.length)) notas.push(`${tag} la partida no tuvo ningún cambio de kilos`);
  }
  await foto('fin');

  // ---- 2. con el reloj verdadero: pausa, ayuda, tutorial guiado y una práctica a velocidad real
  await J(() => JUEGO.test.real()); await page.waitForTimeout(700);
  await pulsa('#btn-cambiar'); await page.waitForFunction(() => JUEGO.estado().pantalla === 'inicio'); await page.waitForTimeout(500);
  // la pausa: con Esc desde el inicio; con el dedo, en el veredicto del tutorial (el botón no se muestra sobre un panel grande ni dentro del intento)
  await J(() => { JUEGO.E.visitados.length = 0; JUEGO.E.propios = []; }); const tr0 = Date.now();
  if (tactil) { await pulsa('#btn-otro'); await jugar(s => s.pantalla === 'decision', false); await page.waitForTimeout(300); await page.locator('#pausa').tap(); } else await page.keyboard.press('Escape');
  const p1 = await J(() => ({ sobre: JUEGO.estado().sobre, t: JUEGO.reloj.ahora(), foco: document.activeElement?.id })); await page.waitForTimeout(300);
  const p2 = await J(() => JUEGO.reloj.ahora());
  if (p1.sobre !== 'pausa' || p1.foco !== 'so-seguir') mal(`la pausa no abrió con foco en «Seguir»: ${JSON.stringify(p1)}`); else if (p2 !== p1.t) mal(`el reloj siguió corriendo en pausa (${(p2 - p1.t).toFixed(0)} ms)`);
  if (tactil) await page.locator('#so-seguir').tap(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const p3 = await J(() => ({ sobre: JUEGO.estado().sobre, t: JUEGO.reloj.ahora(), foco: JUEGO.estado().foco }));
  if (p3.sobre || !(p3.t > p2 + 100) || (!tactil && !p3.foco)) mal(`al volver de la pausa: ${JSON.stringify(p3)} (antes ${p2.toFixed(0)})`);
  if (!tactil) {
    await page.keyboard.press('h'); const a1 = await J(() => ({ sobre: JUEGO.estado().sobre, txt: document.getElementById('sobre').textContent })); await foto('ayuda');
    if (a1.sobre !== 'ayuda' || !/Cómo se juega/.test(a1.txt) || !/ESPACIO/.test(a1.txt)) mal(`H no abrió «Cómo se juega»: ${JSON.stringify(a1).slice(0, 200)}`);
    await page.keyboard.press('h'); if (await J(() => JUEGO.estado().sobre)) mal('H no cerró la ayuda');
  }
  if (!tactil) {
    const otro = await page.locator('#btn-otro').textContent();
    if (!/Repetir tutorial/.test(otro)) mal(`después del tutorial el inicio no ofrece repetirlo (dice «${otro}»)`);
    await pulsa('#btn-otro'); await page.waitForFunction(() => JUEGO.estado().pantalla === 'guiado'); await page.waitForTimeout(300);
    if (!await page.locator('#saltar').isVisible()) mal('durante el tutorial no se ve el botón «Saltear tutorial»');
  }
  await jugar(s => s.pantalla === 'presentacion' && s.panel, false);      // el arranque guiado, en cámara lenta
  const tTut = (Date.now() - tr0) / 1000; await foto('presentacion');
  await jugar(s => (s.visitados.includes('llamado') || s.visitados.includes('intento')) && s.pantalla === 'decision' && s.visitados.includes('intento'), false);      // el primer intento propio de la final, a velocidad real
  await page.waitForFunction(() => (JUEGO.E.propios || []).length >= 2, null, { timeout: 20000 }).catch(() => null); await foto('real');
  const real = await J(() => ({ propios: JUEGO.E.propios, v: JUEGO.E.visitados.slice() }));
  console.log(`${tag} tutorial en tiempo real: ${tTut.toFixed(1)} s hasta la presentación · con el primer intento de la final: ${((Date.now() - tr0) / 1000).toFixed(1)} s · ${real.propios.map(x => `${x.pantalla} ${x.res}${x.causa ? ':' + x.causa : ''}`).join(' · ')}`);
  if (real.propios.length < 2 || real.propios[0].pantalla !== 'guiado' || real.propios[0].res !== 'valido') mal(`el arranque guiado en tiempo real no salió válido: ${JSON.stringify(real.propios[0])}`);
  if (real.propios.filter(x => x.pantalla === 'guiado' || x.pantalla === 'practica').length !== 1) mal(`el tutorial tiene que ser un solo levantamiento: ${JSON.stringify(real.propios)}`);
  if (tTut > 60) mal(`el tutorial tardó ${tTut.toFixed(0)} s en tiempo real; tiene que durar menos de un minuto`);
  if (real.propios[1]?.res !== 'valido') (isSoftware(gl) ? notas : problemas).push(`${tag} el primer intento de la final a velocidad real no salió válido: ${JSON.stringify(real.propios[1])}`);
  if (!tactil && !escProbado) mal('no se llegó a probar Esc dentro del intento');
  void fin;
  await cerrar();
}

try {
  for (const via of ['teclado', 'tactil', 'clasico', 'lento'].filter(v => !ONLY || v === ONLY)) await corrida(via);
} catch (e) { problemas.push('excepción de la prueba: ' + (e.stack || e.message)); }
await browser.close(); server.close();
for (const n of notas) console.log('nota: ' + n);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 30)) console.log('  ' + p); process.exit(1); }
console.log('\nOK: partida completa en Fácil por teclado (sin mouse) y por toques, un intento en Clásico, y tutorial guiado (uno solo) con toques lentos y reloj del llamado, sin errores de consola ni pedidos externos');
