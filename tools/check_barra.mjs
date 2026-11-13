// La barrita ('b', docs/JUEGO.md Gameplay 3) en el navegador: que se vea grande y clara, y que el toque se juzgue donde se ve
// el puntero. Cuatro pantallas: computadora 1280×720 en español y en inglés (teclado), teléfono acostado 667×375 en español
// y 844×390 en inglés (dedo). En cada una, con el reloj inyectado, juega los tres arranques de una final:
//   1. el primero en el verde (en el teléfono en español, como primera vez: presentación y aro de práctica);
//   2. el segundo en el amarillo; 3. el tercero, con 6 kg de más, en el rojo (la punta): si cae, la línea dice dónde pegó.
// Capturas en out/barra/<pantalla>_*.png: el panel del llamado con el verde que viene, la barrita quieta (PREPÁRATE), corriendo,
// el toque marcado con su palabra (¡PERFECTO!, REGULAR, LEJOS) y el veredicto con su línea.
// Además, en la computadora en español y con el reloj verdadero: Espacio cuando el puntero se ve en el verde sale en el verde, y
// la diferencia entre dónde se veía el puntero al apretar y dónde lo juzgó el núcleo (ms); dos Espacios a 40 ms cuentan uno.
// Criterio: cada barrita sale en la zona donde se tocó; la barrita entra en la pantalla, no tapa el zócalo ni el botón
// redondo, su texto no se corta y mide al menos 60 % del ancho libre; sin errores de consola. La diferencia del reloj
// verdadero se informa (con dibujo por software llega a un cuadro largo) y falla solo si pasa de 150 ms.
// Uso: node tools/check_barra.mjs [--headed] [--solo=pc_es|pc_en|tel_es|tel_en]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out/barra');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const HEADED = process.argv.includes('--headed'), SOLO = arg('solo'), SEMILLA = 20261113;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const problemas = [], notas = [];
const dormir = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const PANTALLAS = [
  { id: 'pc_es', lang: 'es', vp: { width: 1280, height: 720 }, tactil: false, real: true },
  { id: 'pc_en', lang: 'en', vp: { width: 1280, height: 720 }, tactil: false },
  { id: 'tel_es', lang: 'es', vp: { width: 667, height: 375 }, tactil: true, primera: true },
  { id: 'tel_en', lang: 'en', vp: { width: 844, height: 390 }, tactil: true },
  // la computadora baja del dueño (~1800×560 visibles): solo la bienvenida, con las tarjetas de los pesistas
  { id: 'bajo_es', lang: 'es', vp: { width: 1800, height: 560 }, tactil: false, soloInicio: true },
  { id: 'bajo_en', lang: 'en', vp: { width: 1800, height: 560 }, tactil: false, soloInicio: true },
  { id: 'pc600_es', lang: 'es', vp: { width: 1280, height: 600 }, tactil: false, soloInicio: true },
  { id: 'pc700_en', lang: 'en', vp: { width: 1440, height: 700 }, tactil: false, soloInicio: true },
].filter(x => !SOLO || x.id === SOLO);

for (const P of PANTALLAS) try {
  const tag = `[${P.id}]`, mal = t => problemas.push(`${tag} ${t}`);
  const ctx = await browser.newContext({ viewport: P.vp, deviceScaleFactor: P.tactil ? 2 : 1, ...(P.tactil ? { hasTouch: true, isMobile: true } : {}), locale: P.lang === 'es' ? 'es-AR' : 'en-US' });
  const page = await ctx.newPage(), cdp = P.tactil ? await ctx.newCDPSession(page) : null, J = (fn, a) => page.evaluate(fn, a);
  page.on('console', m => { if (m.type() === 'error') mal(`console.error: ${m.text()}`); });
  page.on('pageerror', e => mal(`pageerror: ${e.message}`));
  if (!P.primera) await page.addInitScript(() => { try { if (!sessionStorage.getItem('__t')) { localStorage.setItem('tarima.jugadas', '1'); localStorage.setItem('tarima.visto.b_presenta', '1'); localStorage.setItem('tarima.visto.b_fantasma', '1'); sessionStorage.setItem('__t', '1'); } } catch { /* sin almacenamiento */ } });
  // dónde se veía el puntero cuando llegó cada Espacio (antes que el juego: este oyente se registra primero)
  await page.addInitScript(() => { window.__P = []; addEventListener('keydown', e => { if (e.code !== 'Space' || e.repeat) return; const p = document.querySelector('#barrita .b-punt'); window.__P.push({ ts: e.timeStamp, izq: p ? parseFloat(p.style.left) : null, visible: !document.getElementById('barrita')?.hidden }); }, true); });
  // sin dibujo continuo (?dibujo=0, como check_game): por software cada cuadro tarda; antes de cada captura se fuerza uno
  await page.goto(`${base}juego.html?lang=${P.lang}&q=baja&dibujo=0&semilla=${SEMILLA}`, { waitUntil: 'load' });
  if (!await J(() => window.JUEGO.listo)) { mal('el juego no inició'); await ctx.close(); continue; }
  await J(() => JUEGO.test.manual());
  const av = ms => J(ms => JUEGO.test.avanzar(ms), ms), ir = t => J(t => JUEGO.test.hasta(t, 8), t);
  const foto = async n => { await J(() => { try { window.JUEGO.escena?.cuadro?.(0, true); } catch (e) { console.error('cuadro forzado: ' + (e.stack || e)); } }).catch(() => null); return page.screenshot({ path: path.join(OUT, `${P.id}_${n}.png`) }).catch(() => null); };
  const punto = async () => { const b = await page.locator('#escena').boundingBox(); return { x: Math.round(b.x + b.width * .45), y: Math.round(b.y + b.height * .4) }; };
  const baja = async () => { if (P.tactil) { const p = await punto(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); } else await page.keyboard.down('Space'); };
  const sube = async () => { if (P.tactil) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space'); };
  const toque = async () => { await baja(); await av(30); await sube(); };
  const pulsa = async sel => { const l = page.locator(sel).first(); if (!(await l.count()) || !(await l.isVisible()) || !(await l.isEnabled())) return false; if (P.tactil) await l.tap(); else { await l.focus(); await page.keyboard.press('Enter'); } return true; };
  const caja = id => J(id => { const e = document.getElementById(id); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, id);
  const cruza = (a, b) => a && b && a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
  const PEDIR = ['verde', 'amarillo', 'rojo'], pedidas = [], vistas = [];
  let n = 0, hecho = '', fotoPanel = 0, lineas = [], revisada = false, medido = null;
  // la bienvenida: en cada tarjeta nada se pisa (nombre, frase y filas), la tarjeta no se corta y no queda debajo de la fila de
  // botones (Jugar, Opciones, Cómo se juega)
  await av(300); await foto('0_inicio');
  { const T = await J(() => { const pie = document.querySelector('#capa .panel .fila.pie')?.getBoundingClientRect(); return [...document.querySelectorAll('#capa .pesista')].map(p => {
      const r = p.getBoundingClientRect(), k = [...p.querySelectorAll('b, small, .med')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect()); let cruces = 0;
      for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i], b = k[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) cruces++; }
      const fuera = k.some(x => x.bottom > r.bottom + 1 || x.right > r.right + 1);
      return { id: p.dataset.id, cruces, fuera, tapa: !!pie && r.bottom > pie.top + 1 && r.top < pie.bottom, alto: Math.round(r.height) }; }); });
    const PN = await J(() => { const pn = document.querySelector('#capa .panel .bv-cuerpo') || document.querySelector('#capa .panel'), r = pn?.getBoundingClientRect(), ult = [...document.querySelectorAll('#capa .pesista')].map(x => x.getBoundingClientRect().bottom); return pn ? { cliente: pn.clientHeight, contenido: pn.scrollHeight, tarjetas: Math.round(Math.max(...ult) - r.bottom) } : null; });
    console.log(`${tag} parte de arriba de la bienvenida: ${PN?.cliente} px a la vista de ${PN?.contenido} px · ${PN && PN.tarjetas <= 0 ? 'las tarjetas se ven enteras sin desplazar' : `las tarjetas piden desplazar ${PN?.tarjetas} px (se desplaza; la fila de botones no las tapa)`}`);
    console.log(`${tag} tarjetas: ${T.map(x => `${x.id} ${x.alto} px${x.cruces ? ` · ${x.cruces} cruces` : ''}${x.fuera ? ' · se corta' : ''}${x.tapa ? ' · bajo los botones' : ''}`).join(' | ')}`);
    for (const x of T) if (x.cruces || x.fuera || x.tapa) mal(`la tarjeta de ${x.id} no se lee entera: ${JSON.stringify(x)}`); }
  if (P.soloInicio) { await ctx.close(); continue; }
  await pulsa('#btn-empezar');
  const t0 = Date.now();
  for (let g = 0; g < 20000 && Date.now() - t0 < 6 * 60000; g++) {
    const s = await J(() => { const e = JUEGO.estado(); e.propios = (JUEGO.E.propios || []).length; e.lev = JUEGO.E.p?.lev; return e; });
    if (s.errores.length) { mal('error en el juego: ' + s.errores[0]); break; }
    if (s.propios >= 3 && !(s.intento && s.intento.propio) && s.pantalla !== 'decision') break;
    const I = s.intento;
    if (I && I.propio && s.modo !== 'panel') {
      const sg = I.senal;
      if (sg && sg.tipo === 'espera' && sg.barra && n < 3 && hecho !== 'quieta' + n) { hecho = 'quieta' + n; if (n === 0) await foto('1_quieta'); }
      if (sg && sg.tipo === 'barra') {
        const k = sg.clave + sg.desde; if (hecho === k) { await av(20); continue; }
        if (P.real && n === 1) {
          // reloj verdadero: Espacio cuando el puntero se VE en el verde (y otro a los 60 ms: tiene que ser «doble»)
          await J(() => JUEGO.test.real()); const a = await J(() => window.__P.length); let ok = false;
          for (let w = 0; w < 3000 && !ok; w++) { const izq = await J(() => parseFloat(document.querySelector('#barrita .b-punt').style.left)); if (Math.abs(izq - 50) <= sg.barra.v / 10 * .6) ok = true; else await dormir(3); }
          await page.keyboard.down('Space'); await dormir(30); await page.keyboard.up('Space'); await dormir(30); await page.keyboard.down('Space'); await dormir(20); await page.keyboard.up('Space'); await dormir(150);
          medido = await J(a => { const p = window.__P[a], b = JUEGO.E.intento?.m?.U?.barras?.[0] || (JUEGO.E.propios || []).at(-1)?.uno?.barras?.[0]; return { visto: p?.izq * 10, juzgado: b?.pos, zona: b?.zona, doble: JUEGO.toques.ultimos.slice(-2).map(x => x.motivo) }; }, a);
          await J(() => JUEGO.test.manual()); hecho = k; pedidas.push(medido.zona); await foto(`${n + 1}_real_${medido.zona}`); n++; continue;
        }
        const z = PEDIR[n] || 'verde', obj = sg.objetivo + (z === 'amarillo' ? Math.round((sg.barra.vMs + sg.barra.aMs) / 2) : z === 'rojo' ? 700 : 0);
        // a mitad de camino hacia el verde: la barrita corriendo (y, la primera vez, el aro de práctica)
        await ir(sg.objetivo - 260); if (n < 2) await foto(`${n + 1}_corre`);
        if (!revisada) {      // la barrita entra, no tapa el zócalo ni el botón redondo, el texto no se corta, y es ancha
          revisada = true;
          const B = await caja('barrita'), Z = await caja('zocalo'), BOT = await caja('zona'), W = P.vp.width;
          const corte = await J(() => [...document.querySelectorAll('#barrita .b-cab > *')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
          const libre = BOT && BOT.w ? Math.min(BOT.l, W) : W;
          console.log(`${tag} barrita ${Math.round(B?.w)}×${Math.round(B?.h)} px en ${W}×${P.vp.height} · botón ${BOT ? Math.round(BOT.w) : '-'} px`);
          if (!B) mal('la barrita no se ve');
          else {
            if (B.l < -1 || B.r > W + 1 || B.t < -1 || B.b > P.vp.height + 1) mal(`la barrita se sale de la pantalla: ${JSON.stringify(B)}`);
            if (cruza(B, Z)) mal('la barrita tapa el zócalo'); if (cruza(B, BOT)) mal('la barrita tapa el botón redondo');
            if (B.w < libre * (P.tactil ? .6 : .45)) mal(`la barrita es angosta: ${Math.round(B.w)} px de ${Math.round(libre)} libres`);
          }
          if (corte.length) mal(`texto cortado en la barrita: ${corte.join(' · ')}`);
        }
        await ir(obj - 1); await toque(); hecho = k; pedidas.push(z); await av(320); await foto(`${n + 1}_${z}`); n++;
        continue;
      }
      await J(() => JUEGO.test.avanzar(60, 30)); continue;
    }
    if (s.panel && !s.sobre) {
      if (s.pantalla === 'llamado') {
        if (fotoPanel <= n && n < 3) { fotoPanel = n + 1; await av(450); if (n === 0) await foto('0_panel'); }
        if (n === 2) { for (let i = 0; i < 6; i++) { if (P.tactil) await pulsa('#kg-mas'); else await page.keyboard.press('ArrowRight'); } }      // el tercero, con 6 kg de más
      }
      await av(450); const ok = await pulsa('#capa .panel button.ir'); await av(ok ? 400 : 200); continue;
    }
    if (s.pantalla === 'decision') {
      const v = await J(() => document.getElementById('veredicto').hidden ? '' : document.getElementById('veredicto').textContent);
      if (v && !lineas.includes(v)) { lineas.push(v); if (lineas.length <= 3) await foto(`${lineas.length}_veredicto`); }
    }
    await J(() => JUEGO.test.avanzar(300, 50));
    if (['rival', 'decision', 'carga', 'desplazado'].includes(s.pantalla) && g % 3 === 0) await toque();
  }
  const R = await J(() => (JUEGO.E.propios || []).map(x => ({ res: x.res, linea: x.linea, barras: (x.uno?.barras || []).map(b => b.zona + (b.sola ? '*' : '')) })));
  for (const x of R) vistas.push(...x.barras);
  console.log(`${tag} pedidas ${pedidas.join(' ')} · salieron ${vistas.join(' ')} · ${R.map(x => `${x.res}${x.linea ? ` «${x.linea}»` : ''}`).join(' · ')}`);
  if (pedidas.length < 3) mal(`se jugaron ${pedidas.length} barritas (se esperaban 3)`);
  if (vistas.slice(0, pedidas.length).join() !== pedidas.join()) mal(`las barritas no salieron donde se tocó: pedidas ${pedidas.join(' ')}, salieron ${vistas.join(' ')}`);
  for (const x of R.filter(y => y.res === 'fallo')) if (!/(pegaste en el|hit the) (verde|amarillo|rojo|green|yellow|red)/i.test(x.linea || '')) mal(`una caída sin decir dónde pegó: ${JSON.stringify(x)}`);
  if (P.primera) { const gu = await J(() => localStorage.getItem('tarima.visto.b_fantasma')); if (!gu) mal('la primera vez no mostró el aro de práctica'); }

  if (P.real) {
    if (!medido) mal('no se llegó a medir el Espacio con el reloj verdadero');
    else {
      const ms = Math.abs(medido.visto - medido.juzgado) * 1400 / 1000;
      console.log(`${tag} reloj verdadero: el puntero se veía en ${medido.visto?.toFixed(0)} y el núcleo lo juzgó en ${medido.juzgado} (milésimas de la barrita): ${ms.toFixed(0)} ms de diferencia · zona ${medido.zona} · doble Espacio a 60 ms: ${medido.doble.join(', ')}`);
      if (!(ms <= 150)) mal(`entre lo que se ve y lo que juzga el núcleo hay ${ms.toFixed(0)} ms`); else if (ms > 40) notas.push(`${tag} ${ms.toFixed(0)} ms entre lo dibujado y lo juzgado (por software los cuadros son largos; con placa tiene que ser ≤ 1 cuadro)`);
      if (medido.doble[1] !== 'doble') mal(`dos Espacios a 60 ms no contaron uno: ${medido.doble.join(', ')}`);
    }
  }
  await ctx.close();
} catch (e) { problemas.push(`[${P.id}] excepción: ${(e.message || e).split('\n')[0]}`); }
await browser.close(); server.close();
for (const x of notas) console.log('nota: ' + x);
if (problemas.length) { console.log(`\nFALLÓ (${problemas.length}):`); for (const p of problemas.slice(0, 30)) console.log('  ' + p); process.exit(1); }
console.log(`\nOK: la barrita se ve y se juzga donde se toca en ${PANTALLAS.map(x => x.id).join(', ')} · capturas en out/barra`);
