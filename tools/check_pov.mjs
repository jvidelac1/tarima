// Primera persona y final del levantamiento, con navegador (corre en GitHub Actions, dibujo por software):
//  A. El final de un levantamiento cuadro a cuadro (válido, nulo y caída, game/caida.js), en los dos modelos: a 60 cuadros
//     por segundo mide cuánto resbalan los pies apoyados, cuánto gira el hueso que más gira (°/s), cuánto se meten las manos
//     en el tronco y la holgura de la barra; y saca una hoja de fotos cada 0,15 s desde la general y desde el costado.
//  B. La primera persona (stage.js, POV): hojas de fotos a lo largo del arranque, la cargada y los tres enviones, fotos
//     grandes de las fases clave y, reproduciendo cada segmento seguido, cuánto se mueve y gira la cámara (m/s, °/s) y que
//     la cabeza propia no se dibuje. También el final de un válido visto desde los ojos.
// Hojas y fotos en out/pov/. Falla con errores de consola o si la primera persona no cumple sus reglas (ver abajo).
// Uso: node tools/check_pov.mjs [--headed] [--solo=finales|pov]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'pov');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const HEADED = process.argv.includes('--headed'), SOLO = arg('solo');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const problemas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const page = await ctx.newPage(), hojas = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') problemas.push(`console.error: ${m.text()}`); });
page.on('pageerror', e => problemas.push(`pageerror: ${e.message}`));
await page.goto(`${base}juego.html?q=baja&dibujo=0`, { waitUntil: 'load' });
if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
await page.evaluate(() => { for (const id of ['capa', 'zocalo', 'senal', 'acuse', 'marcador', 'tablero']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
const toma = () => page.screenshot({ type: 'jpeg', quality: 70 });
/** Hoja de contactos: las fotos (búferes JPEG) con su rótulo, en `cols` columnas. */
async function hoja(nombre, fotos, cols = 6, ancho = 320) {
  if (!fotos.length) return;
  const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${ancho}px);gap:2px;font:11px monospace;color:#fff">${fotos.map(f => `<div style="position:relative"><img src="data:image/jpeg;base64,${f.b.toString('base64')}" style="width:${ancho}px;display:block"><span style="position:absolute;left:2px;top:1px;background:#000a;padding:0 3px">${f.t}</span></div>`).join('')}</body>`;
  await hojas.setViewportSize({ width: cols * (ancho + 2), height: 400 }); await hojas.setContent(html, { waitUntil: 'load' });
  await hojas.screenshot({ path: path.join(OUT, nombre + '.jpg'), type: 'jpeg', quality: 78, fullPage: true });
}
const J = (f, a) => page.evaluate(f, a);
const G = x => (x * 180 / Math.PI);

// ---------- A. finales ----------
const F = c => ({ res: 'fallo', causa: c }), N = c => ({ res: 'nulo', causa: c }), V = { res: 'valido' };
const FINALES = [
  ['arranque válido', 's', 'snatch', 'Recuperación', 's', V],
  ['envión válido (tijera)', 'c', 'split', 'Envión · Final', 'j', V],
  ['envión válido (power)', 'c', 'power', 'Envión · Final', 'j', V],
  ['envión nulo (squat)', 'c', 'squat', 'Envión · Final', 'j', N('codos_blandos')],
  ['arranque barra adelante', 's', 'snatch', 'Recepción', 's', F('adelante')],
  ['arranque barra atrás', 's', 'snatch', 'Recepción', 's', F('atras')],
  ['arranque sin altura', 's', 'snatch', 'Tirón de brazos', 's', F('sin_altura')],
  ['cargada aplastado', 'c', 'clean', 'Amortiguación', 'c', F('aplastado')],
  ['envión devuelve la barra', 'c', 'split', 'Recuperación', 'j', F('devuelve')],
  ['tijera barra adelante', 'c', 'split', 'Envión · Tijera', 'j', F('adelante')],
  ['tijera barra atrás', 'c', 'split', 'Envión · Tijera', 'j', F('atras')],
];
/** Recorre un final a 60 c/s y mide; con `fotos`, además una foto cada `cada` s con la cámara `camara`. */
async function recorrer(id, [nombre, lev, seg, fase, mov, res], camara, fotos, cada = .15) {
  const info = await J(o => window.JUEGO.test.final(o), { id, lev, seg, fase, mov, res, camara });
  if (!info) { problemas.push(`${id} · ${nombre}: no armó escena`); return null; }
  await J(() => window.JUEGO.test.medir());
  // la cámara se asienta en la pose del final antes de la primera foto (venía de la escena anterior)
  await J(() => { window.JUEGO.test.finalEn(0, false, 1 / 60, .5); window.JUEGO.test.finalEn(0, false, 1 / 60, .5); });
  let piso = 9; const M = { resbala: 0, vPie: 0, tPie: 0, giro: 0, cual: '', tGiro: 0, manoTronco: 9, tMano: 0, vMano: 0, tVMano: 0, holgura: 9, sube: 0 }, lista = []; let ant = null, prox = 0;
  for (let t = 0; t <= info.dur + .3; t += 1 / 60) {
    const sacar = fotos && t >= prox - 1e-9;
    const m = await J(([t, d]) => { const h = window.JUEGO.test.finalEn(t, d, 1 / 60, 1 / 60); return { ...window.JUEGO.test.medir(), h: h ? h.h : null }; }, [t, sacar]);
    if (sacar) { lista.push({ t: t.toFixed(2) + ' s', b: await toma() }); prox += cada; }
    if (ant) {
      // pies: un pie apoyado (la punta a menos de 12 mm de la altura más baja que se le vio) que se corre en el plano del piso
      for (const L of ['Left', 'Right']) {
        const a = ant[L + 'ToeBase'], b = m[L + 'ToeBase'], d = Math.hypot(b[0] - a[0], b[2] - a[2]);
        piso = Math.min(piso, a[1], b[1]); if (a[1] < piso + .012 && b[1] < piso + .012) { M.resbala += d; if (d * 60 > M.vPie) { M.vPie = d * 60; M.tPie = t; } }
        M.sube = Math.max(M.sube, b[1]);
      }
      for (const L of ['Left', 'Right']) { const v = Math.hypot(...m[L + 'Hand'].map((x, i) => x - ant[L + 'Hand'][i])) * 60; if (v > M.vMano) { M.vMano = v; M.tVMano = t; } }
      if (m.giro * 60 > M.giro) { M.giro = m.giro * 60; M.cual = m.cual; M.tGiro = t; }
    }
    // manos contra el tronco: distancia de cada mano al eje cadera–cabeza (menos 13 cm de radio del tronco), con la mano entre los dos
    for (const L of ['Left', 'Right']) {
      const p = m[L + 'Hand'], a = m.Hips, b = m.Head, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const u = Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2))), d = Math.hypot(ap[0] - ab[0] * u, ap[1] - ab[1] * u, ap[2] - ab[2] * u) - .13;
      if (d < M.manoTronco) { M.manoTronco = d; M.tMano = t; }
    }
    if (m.h !== null && m.h < M.holgura) M.holgura = m.h;
    ant = m;
  }
  return { info, M, lista };
}
if (!SOLO || SOLO === 'finales') {
  console.log('A. FINALES (60 c/s): pies apoyados que resbalan, hueso que más gira, manos contra el tronco, holgura de la barra');
  for (const id of ['ventura', 'brenner']) for (const caso of FINALES) {
    const r = await recorrer(id, caso, '3/4', true); if (!r) continue; const { M, info } = r;
    console.log(`${id.padEnd(8)} ${caso[0].padEnd(26)} ${info.tipo.padEnd(8)} ${info.dur.toFixed(2)} s · pies resbalan ${(M.resbala * 100).toFixed(1)} cm (máx ${(M.vPie * 100).toFixed(0)} cm/s a ${M.tPie.toFixed(2)} s; punta hasta ${(M.sube * 100).toFixed(0)} cm) · giro máx ${G(M.giro).toFixed(0)} °/s (${M.cual}, a ${M.tGiro.toFixed(2)} s) · mano hasta ${M.vMano.toFixed(1)} m/s (a ${M.tVMano.toFixed(2)} s) · mano–tronco mín ${(M.manoTronco * 100).toFixed(1)} cm a ${M.tMano.toFixed(2)} s · holgura barra ${(M.holgura * 100).toFixed(1)} cm`);
    await hoja(`final_${id}_${slug(caso[0])}_general`, r.lista);
    if (id === 'ventura') { const l = await recorrer(id, caso, 'lado', true); if (l) await hoja(`final_${id}_${slug(caso[0])}_lado`, l.lista); }
  }
}

// ---------- B. primera persona ----------
if (!SOLO || SOLO === 'pov') {
  console.log('\nB. PRIMERA PERSONA');
  const SEGS = [['snatch', 's', 100], ['clean', 'c', 120], ['split', 'c', 60], ['power', 'c', 50], ['squat', 'c', 70]];
  for (const id of ['ventura', 'brenner']) {
    for (const [seg, lev, n] of SEGS) {
      // hoja: una foto cada 5 muestras (medio segundo de clip), con la cámara asentada en cada una
      const lista = [];
      for (let s = 0; s <= n; s += 5) { await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: .5, dibujar: false }); const m = await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: .5 }); const b = await toma(); lista.push({ t: `${seg} ${s} · ${G(m.cam.inc).toFixed(0)}°`, b }); if (b.length < 9000) problemas.push(`${id} ${seg} ${s}: la imagen en primera persona salió vacía (${b.length} bytes)`); if (!m.pov || !m.sinCabeza) problemas.push(`${id} ${seg} ${s}: la primera persona no quedó puesta o la cabeza propia se dibuja`); }
      await hoja(`pov_${id}_${seg}`, lista, 5, 384);
      // seguido, a 60 c/s y un segundo de clip por fase: cuánto se mueve y gira la cámara
      // con el reloj del juego detenido: si no, el bucle del juego mueve la cámara por su cuenta entre una muestra y la otra
      // (cuadros de más, en tiempo real) y la medida sale más alta que el movimiento de verdad, y distinta en cada corrida
      await J(() => window.JUEGO.test.manual());
      let ant = null, vMax = 0, wMax = 0, aMax = 0, vAnt = 0, incMin = 9, incMax = -9, lejos = 0;
      for (let k = 0; k <= n * 6; k++) {
        const s = k / 6, m = await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: 1 / 60, dibujar: false });
        if (ant && k > 30) {      // el primer medio segundo se asienta
          const v = Math.hypot(...m.cam.p.map((x, i) => x - ant.cam.p[i])) * 60, w = Math.abs(m.cam.inc - ant.cam.inc) * 60;
          vMax = Math.max(vMax, v); wMax = Math.max(wMax, w); aMax = Math.max(aMax, Math.abs(v - vAnt) * 60); vAnt = v;
          incMin = Math.min(incMin, m.cam.inc); incMax = Math.max(incMax, m.cam.inc);
          lejos = Math.max(lejos, Math.hypot(m.cam.p[0] - m.Head[0], m.cam.p[1] - m.Head[1], m.cam.p[2] - m.Head[2]));
        }
        ant = m;
      }
      await J(() => window.JUEGO.test.real());
      console.log(`${id.padEnd(8)} ${seg.padEnd(7)} cámara: hasta ${vMax.toFixed(2)} m/s y ${aMax.toFixed(0)} m/s² · mirada entre ${G(incMin).toFixed(0)}° y ${G(incMax).toFixed(0)}°, gira hasta ${G(wMax).toFixed(0)} °/s · a lo sumo a ${(lejos * 100).toFixed(0)} cm del hueso de la cabeza`);
      // reglas: la mirada no gira más de 160 °/s (sigue a la barra, con tope de 150) y la cámara no se aleja más de 80 cm de la cabeza (retrocede para que entren la barra y las dos manos)
      if (G(wMax) > 160) problemas.push(`${id} ${seg}: la mirada gira a ${G(wMax).toFixed(0)} °/s`);
      if (lejos > .8) problemas.push(`${id} ${seg}: la cámara queda a ${(lejos * 100).toFixed(0)} cm de la cabeza`);
    }
  }
  // fotos grandes de las fases clave (Ventura y Brenner) y en un teléfono acostado
  const CLAVE = [['snatch', 's', 'Parado', 0], ['snatch', 's', 'Salida', 0], ['snatch', 's', 'Primer tirón', 5], ['snatch', 's', 'Segundo tirón', 5], ['snatch', 's', 'Tirón de brazos', 0], ['snatch', 's', 'Giro', 5], ['snatch', 's', 'Recepción', 0], ['snatch', 's', 'Recuperación', 0],
    ['clean', 'c', 'Salida', 0], ['clean', 'c', 'Tirón de brazos', 5], ['clean', 'c', 'Amortiguación', 0], ['clean', 'c', 'Recuperación', 0], ['split', 'c', 'Envión · Dip', 0], ['split', 'c', 'Envión · Empuje', 0], ['split', 'c', 'Envión · Empuje', 5], ['split', 'c', 'Envión · Tijera', 0], ['split', 'c', 'Envión · Final', 0]];
  for (const [w, h, sufijo, ids] of [[1280, 720, '', ['ventura', 'brenner']], [844, 390, '_tel', ['ventura']]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200);
    for (const id of ids) for (const [seg, lev, fase, mas] of CLAVE) {
      // el pesista tiene que estar puesto para leer sus fases: primero se posa en 0
      const s = await J(async ([id, lev, seg, fase]) => { await window.JUEGO.test.posa({ id, lev, seg, s: 0, camara: 'pov', dibujar: false }); const P = window.JUEGO.escena.P; return P.sub * P.segs[seg].poses.findIndex(p => p.n === fase || (fase === 'Giro' && p.n === 'Giro de codos')); }, [id, lev, seg, fase]) + mas;
      await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: .5, dibujar: false }); await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: .5 });
      await page.screenshot({ path: path.join(OUT, `clave${sufijo}_${id}_${slug(seg + '_' + fase)}${mas ? '_' + mas : ''}.jpg`), type: 'jpeg', quality: 82 });
    }
  }
  await page.setViewportSize({ width: 960, height: 540 }); await page.waitForTimeout(200);
  // el final desde los ojos: válido de arranque y de envión, y una caída
  for (const caso of [FINALES[0], FINALES[1], FINALES[4], FINALES[7]]) { const r = await recorrer('ventura', caso, 'pov', true); if (r) await hoja(`pov_final_${slug(caso[0])}`, r.lista); }
}

await browser.close(); server.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.slice(0, 40).join('\n')); process.exit(1); }
console.log('\ncheck_pov: bien · hojas en out/pov');
