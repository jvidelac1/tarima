// Escenas de emoción del juego, con navegador (corre en GitHub Actions, dibujo por software):
//  - El final de cada tipo de intento (game/caida.js): para cada causa de fallo, el válido y el nulo, en los dos modelos,
//    arma la pose del final con una fase de poses.json, suelta la barra y mide cuadro a cuadro la holgura entre la barra y el
//    cuerpo (eje y discos contra tronco, cabeza, piernas y brazos). Un cuadro con holgura negativa es BAD: la barra
//    atraviesa el cuerpo. La prueba falla con un solo BAD, como check() del build de poses.
//  - El cambio de carga animado (discos que salen y entran por la manga) y el plano del llamado con el panel al costado.
//  - Capturas en out/escenas/ para mirar. No mide cuadros por segundo.
// Uso: node tools/check_escenas.mjs [--headed] [--sin-fotos]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'escenas');
const HEADED = process.argv.includes('--headed'), FOTOS = !process.argv.includes('--sin-fotos');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;      // /api/estado y /api/partida: juego sin límite (tools/sin_api.mjs)
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const problemas = [];
const browser = await chromium.launch(launchOptions({ headed: HEADED }));

// [nombre, levantamiento, segmento, fase del final, movimiento, resultado]
const F = c => ({ res: 'fallo', causa: c }), N = c => ({ res: 'nulo', causa: c }), V = { res: 'valido' };
const CASOS = [
  ['arranque sin altura (extensión)', 's', 'snatch', 'Triple extensión', 's', F('sin_altura')],
  ['arranque sin altura (brazos)', 's', 'snatch', 'Tirón de brazos', 's', F('sin_altura')],
  ['arranque anticipado', 's', 'snatch', 'Segundo tirón', 's', F('anticipado')],
  ['arranque barra adelante', 's', 'snatch', 'Recepción', 's', F('adelante')],
  ['arranque barra atrás', 's', 'snatch', 'Recepción', 's', F('atras')],
  ['arranque la pierde en el fondo', 's', 'snatch', 'Recepción', 's', F('fondo')],
  ['arranque ceden los codos', 's', 'snatch', 'Giro', 's', F('codos')],
  ['arranque pierde la barra arriba', 's', 'snatch', 'Recuperación', 's', F('temblor')],
  ['cargada sin altura', 'c', 'clean', 'Triple extensión', 'c', F('sin_altura')],
  ['cargada barra adelante', 'c', 'clean', 'Recepción', 'c', F('adelante')],
  ['cargada aplastado', 'c', 'clean', 'Amortiguación', 'c', F('aplastado')],
  ['envión devuelve la barra', 'c', 'split', 'Recuperación', 'j', F('devuelve')],
  ['envión sin altura', 'c', 'split', 'Envión · Dip', 'j', F('sin_altura')],
  ['tijera barra adelante', 'c', 'split', 'Envión · Tijera', 'j', F('adelante')],
  ['tijera barra atrás', 'c', 'split', 'Envión · Tijera', 'j', F('atras')],
  ['tijera ceden los codos', 'c', 'split', 'Envión · Recuperación', 'j', F('codos')],
  ['power barra adelante', 'c', 'power', 'Power jerk · Recepción', 'j', F('adelante')],
  ['power barra atrás', 'c', 'power', 'Power jerk · Recepción', 'j', F('atras')],
  ['squat jerk barra atrás', 'c', 'squat', 'Squat jerk · Recepción', 'j', F('atras')],
  ['squat jerk ceden los codos', 'c', 'squat', 'Squat jerk · Fondo', 'j', F('codos')],
  ['arranque válido', 's', 'snatch', 'Recuperación', 's', V],
  ['envión válido (tijera)', 'c', 'split', 'Envión · Final', 'j', V],
  ['envión nulo (squat)', 'c', 'squat', 'Envión · Final', 'j', N('codos_blandos')],
];
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();

const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') problemas.push(`console.error: ${m.text()}`); });
page.on('pageerror', e => problemas.push(`pageerror: ${e.message}`));
await page.goto(`${base}juego.html?q=baja&dibujo=0`, { waitUntil: 'load' });
if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
await page.evaluate(() => { for (const id of ['capa', 'zocalo', 'senal', 'acuse']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });      // las escenas sin el panel del inicio encima
const foto = async nombre => { if (FOTOS) await page.screenshot({ path: path.join(OUT, nombre + '.jpg'), type: 'jpeg', quality: 72 }); };

const filas = []; let bad = 0;
for (const id of ['ventura', 'brenner']) {
  for (const [nombre, lev, seg, fase, mov, res] of CASOS) {
    const info = await page.evaluate(o => window.JUEGO.test.final(o), { id, lev, seg, fase, mov, res, camara: 'lado' });
    if (!info) { problemas.push(`${id} · ${nombre}: no armó escena`); continue; }
    // Las cápsulas del cuerpo son gruesas a propósito: en la pose del final (validada en Blender con las mallas, cero BAD
    // en check()) la barra apoyada en los hombros o rozando la cadera ya da holgura negativa contra ellas. Por eso cada
    // segmento se compara con su holgura en el primer cuadro que se mide: BAD es atravesarlo MÁS que en esa pose (5 mm).
    let min = { h: 9 }, n = 0, malos = 0; const base = {}, peor = [];
    for (let t = info.suelta; t <= info.dur + 1e-9; t += 1 / 60) {
      const h = await page.evaluate(t => window.JUEGO.test.finalEn(t), t); if (!h) continue; n++;
      let mal = false;
      for (const [k, v] of Object.entries(h.todos)) { if (!(k in base)) base[k] = v; if (v < 0 && v < Math.min(0, base[k]) - .005) { mal = true; if (peor.length < 3) peor.push(`${k} ${(v * 100).toFixed(1)} cm a ${(t - info.suelta).toFixed(2)} s`); } }
      if (mal) malos++; if (h.h < min.h) min = { ...h, t: Math.round((t - info.suelta) * 100) / 100 };
    }
    bad += malos;
    filas.push(`${malos ? 'BAD' : 'ok '} ${id.padEnd(8)} ${nombre.padEnd(34)} ${info.tipo.padEnd(8)} ${String(Math.round(info.dur * 100) / 100).padEnd(5)} s · holgura mínima ${(min.h * 100).toFixed(1)} cm (${min.que}, a ${min.t} s de soltar; barra y ${min.y} z ${min.z})${malos ? ` · ${malos} de ${n} cuadros con la barra más adentro del cuerpo que en la pose validada (${peor.join('; ')})` : ''}`);
    // capturas: de costado mientras cae, y el final en el plano de la caída (Ventura todas; Brenner, las que fallan)
    if (FOTOS && (id === 'ventura' || malos)) {
      const k = slug(`${id}_${nombre}`);
      await page.evaluate(t => window.JUEGO.test.finalEn(t, true), info.suelta + .3); await foto(`${k}_1_lado`);
      await page.evaluate(o => window.JUEGO.test.final(o), { id, lev, seg, fase, mov, res, camara: 'caida' });
      await page.evaluate(t => window.JUEGO.test.finalEn(t, true), info.suelta + .5); await foto(`${k}_2_caida`);
      await page.evaluate(t => window.JUEGO.test.finalEn(t, true), info.dur); await foto(`${k}_3_fin`);
    }
  }
}
console.log(filas.join('\n'));

// cambio de carga: de afuera (cambia un disco chico), de adentro (sale el collarín) y bajando kilos
for (const [k0, k1] of [[140, 143], [140, 151], [151, 146]]) {
  const A = await page.evaluate(([a, b]) => window.JUEGO.test.carga(a, b), [k0, k1]);
  if (!A) { problemas.push(`carga ${k0} → ${k1}: no armó la animación`); continue; }
  const kgs = [];
  for (let t = 0; t <= A.dur + 1e-9; t += 1 / 30) { const x = await page.evaluate(t => window.JUEGO.test.cargaEn(t), t); kgs.push(x.kg); }
  const fin = await page.evaluate(t => window.JUEGO.test.cargaEn(t), A.dur + 1);
  if (fin.kg !== k1) problemas.push(`carga ${k0} → ${k1}: termina en ${fin.kg} kg`);
  console.log(`carga ${k0} → ${k1}: ${A.sale} piezas salen y ${A.entra} entran por lado, ${A.dur.toFixed(2)} s; kilos a la vista: ${[...new Set(kgs)].join(' → ')}`);
  // la animación no vuelve atrás en el tiempo (cargaEn de antes ya la dejó en el final): se arma de nuevo para las capturas
  if (FOTOS) { await page.evaluate(([a, b]) => window.JUEGO.test.carga(a, b), [k0, k1]); for (const [i, f] of [[1, .15], [2, .5], [3, .8]]) { await page.evaluate(t => window.JUEGO.test.cargaEn(t, true), A.dur * f); await foto(`carga_${k0}_${k1}_${i}`); } }
}

// plano del llamado: el pesista a la vista con el panel al costado (escritorio) o al pie (teléfono)
for (const [w, h, nombre] of [[1280, 720, 'escritorio'], [1745, 845, 'mac'], [390, 844, 'telefono']]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150); await page.evaluate(() => { document.getElementById('capa').style.visibility = ''; });
  const r = await page.evaluate(() => window.JUEGO.test.planoLlamado());
  console.log(`plano del llamado (${nombre} ${w}×${h}): sujeto en ${JSON.stringify(r.encuadre)}, panel ${Math.round(r.panel.x)},${Math.round(r.panel.y)} ${Math.round(r.panel.width)}×${Math.round(r.panel.height)}`);
  await foto(`llamado_${nombre}`);
}

await browser.close(); server.close();
if (bad) problemas.push(`${bad} cuadros con la barra más adentro del cuerpo que en la pose validada (BAD)`);
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.join('\n')); process.exit(1); }
console.log(`\ncheck_escenas: bien (${CASOS.length * 2} finales, cero cuadros BAD)`);
