// Perfil de rendimiento del visor: tiempo de GPU por etapa (consultas EXT_disjoint_timer_query_webgl2) y fps, por calidad.
// La GPU y la CPU se comparten con el resto de la máquina: por eso cada cifra es el MÍNIMO de muchos cuadros (y de varias
// rondas), que es lo más cercano al costo propio del cuadro; la mediana se informa al lado para ver cuánta carga había.
// Las rondas se repiten hasta que el mínimo deja de bajar (dos rondas seguidas sin mejorar un 4 %), con tope --max-rounds.
// Uso: node tools/check_viewer_perf.mjs [--q=alta,media,baja] [--rounds=3] [--max-rounds=10] [--reps=30] [--web=<carpeta>] [--web2=<otra carpeta, para comparar>] [--who=ventura]
//      [--size=1600x900] [--dpr=1] [--json=salida.json] [--shot=prefijo]   (el lienzo de 1600x900 queda en 1600x817)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright-core'; import { launchOptions } from './browser.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const WEBS = [path.resolve(arg('web', path.join(ROOT, 'web'))), ...(arg('web2') ? [path.resolve(arg('web2'))] : [])], QS = arg('q', 'alta,media,baja').split(','), ROUNDS = +arg('rounds', 3), MAXR = +arg('max-rounds', 10), REPS = +arg('reps', 30), WHO = arg('who', 'ventura');
const [VW, VH] = arg('size', '1600x900').split('x').map(Number), DPR = +arg('dpr', 1), SHOT = arg('shot', '');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const serve = WEB => new Promise(done => { const server = http.createServer((req, res) => { const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res); }); server.listen(0, '127.0.0.1', () => done(server)); });
const servers = await Promise.all(WEBS.map(serve));
const browser = await chromium.launch(launchOptions());
const load = () => os.loadavg()[0] / os.cpus().length, label = w => path.relative(ROOT, w).startsWith('..') ? path.basename(w) : (path.relative(ROOT, w) || '.'), issues = [];
const results = WEBS.map(w => ({ web: label(w), load0: +load().toFixed(1), q: {} }));
// Con dos carpetas (--web2, p. ej. una copia de antes del cambio) las rondas se alternan entre las dos páginas, así las dos
// ven la misma carga de máquina. La página que no se mide queda con el bucle de dibujo detenido.
const GATE = () => { const raf = window.requestAnimationFrame.bind(window), held = []; window.__paused = false;
  window.requestAnimationFrame = cb => window.__paused ? (held.push(cb), 0) : raf(cb); window.__pause = on => { window.__paused = on; if (!on) held.splice(0).forEach(cb => raf(cb)); }; };
for (const q of QS) {
  const pages = [];
  for (let i = 0; i < WEBS.length; i++) {
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR }); await page.addInitScript(GATE);
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') issues.push(`${label(WEBS[i])} ${q} [${m.type()}] ${m.text().slice(0, 300)}`); }); page.on('pageerror', e => issues.push(`${label(WEBS[i])} ${q} [pageerror] ${e.message}`));
    await page.goto(`http://127.0.0.1:${servers[i].address().port}/?auto=0&q=${q}&who=${WHO}`); await page.evaluate(() => window.TARIMA.ready);
    await page.evaluate(() => { TARIMA.cam(0); TARIMA.seekPhase(Math.max(1, TARIMA.phaseIndex('^Primer tirón'))); TARIMA.step(0); });
    await page.waitForTimeout(800); await page.evaluate(() => window.__pause(true));
    pages.push({ page, acc: { min: {}, med: {}, still: {}, frame: Infinity, frameMed: Infinity }, calm: 0 });
  }
  for (let r = 0; r < MAXR && (r < ROUNDS || pages.some(p => p.calm < 2)); r++) for (const P of pages) {
    const { page, acc } = P, prev = [acc.frame, acc.min.total ?? Infinity];
    await page.bringToFront(); await page.evaluate(() => window.__pause(false));
    const o = await page.evaluate(async reps => { const A = TARIMA; if (!A.profilePasses) return null; return { play: await A.profilePasses(reps, true), still: await A.profilePasses(reps, false), whole: await A.profilePasses(reps, true, true), info: (() => { const i = A.renderer.info; i.autoReset = false; i.reset(); A.renderer.shadowMap.needsUpdate = true; A.post.render(0); const o = { calls: i.render.calls, tris: i.render.triangles, progs: i.programs.length, tex: i.memory.textures }; i.autoReset = true; return o; })() }; }, REPS);
    await page.evaluate(() => window.__pause(true));
    if (!o) { P.calm = 9; continue; }
    for (const k in o.play.min) { acc.min[k] = Math.min(acc.min[k] ?? Infinity, o.play.min[k]); acc.med[k] = Math.min(acc.med[k] ?? Infinity, o.play.med[k]); }
    for (const k in o.still.min) acc.still[k] = Math.min(acc.still[k] ?? Infinity, o.still.min[k]);
    acc.frame = Math.min(acc.frame, o.whole.min.escena); acc.frameMed = Math.min(acc.frameMed, o.whole.med.escena); acc.w = o.play.w; acc.h = o.play.h; acc.info = o.info; acc.rounds = r + 1;
    P.calm = acc.frame > prev[0] * .96 && acc.min.total > prev[1] * .96 ? P.calm + 1 : 0;
  }
  for (let i = 0; i < pages.length; i++) {
    const { page, acc } = pages[i]; await page.bringToFront(); await page.evaluate(() => window.__pause(false));
    acc.cpu = await page.evaluate(() => { const A = TARIMA; let m = 1e9; for (let i = 0; i < 90; i++) { A.renderer.shadowMap.needsUpdate = true; const t0 = performance.now(); A.post.render(0); m = Math.min(m, performance.now() - t0); } return m; });
    if (SHOT) { await page.evaluate(() => { TARIMA.cam(0); TARIMA.seekPhase(Math.max(1, TARIMA.phaseIndex('^Primer tirón'))); }); await page.waitForTimeout(600); await page.screenshot({ path: `${SHOT}${WEBS.length > 1 ? '-' + results[i].web.replace(/\W+/g, '_') : ''}-${q}.png` }); }
    results[i].q[q] = acc; await page.close();
  }
}
await browser.close();
// fps: en esta máquina una página que dibuja sin parar se frena sola a los 6 a 9 s (también una página de control sin
// three.js), así que se cuentan los cuadros de los primeros segundos de reproducción en un navegador recién abierto.
for (const q of QS) for (let i = 0; i < WEBS.length; i++) {
  const b = await chromium.launch(launchOptions());
  const page = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  await page.goto(`http://127.0.0.1:${servers[i].address().port}/?auto=0&q=${q}&who=${WHO}`); await page.evaluate(() => window.TARIMA.ready);
  const r = await page.evaluate(() => new Promise(res => { TARIMA.play(false); let n = 0, n1 = 0; const t0 = performance.now(); const f = () => { const t = performance.now() - t0; n++; if (t < 1500) n1++; t < 3000 ? requestAnimationFrame(f) : res([n / 3, n1 / 1.5]); }; requestAnimationFrame(f); }));
  results[i].q[q].fpsFresh = r[0]; results[i].q[q].fpsFresh1 = r[1]; results[i].q[q].loadFps = +load().toFixed(1); await b.close();
}
servers.forEach(s => s.close());
const f1 = x => x === undefined || !Number.isFinite(x) ? '  -  ' : x.toFixed(1).padStart(5);
const keys = ['escena', 'ao', 'dof', 'bokeh', 'mblur', 'bloom', 'final', 'total'];
for (const result of results) {
  console.log(`perfil de ${result.web} · ${VW}x${VH} DPR ${DPR} · carga del sistema ${result.load0} por núcleo · mínimo de rondas de ${REPS} cuadros (ms de GPU; 'total' = suma de mínimos por etapa)`);
  console.log('calidad  lienzo      ' + keys.map(k => k.padStart(6)).join('') + '  cuadro(min/med)  escena s/sombras  CPU dibujo  fps reprod. (3 s / 1,5 s iniciales)  draw calls / triángulos  rondas');
  for (const q of QS) { const a = result.q[q]; console.log(`${q.padEnd(8)} ${`${a.w}x${a.h}`.padEnd(10)} ` + keys.map(k => ' ' + f1(a.min[k])).join('') + `   ${f1(a.frame)} /${f1(a.frameMed)}      ${f1(a.still.escena)}          ${f1(a.cpu)}      ${a.fpsFresh.toFixed(0)} / ${a.fpsFresh1.toFixed(0)} (carga ${a.loadFps})     ${a.info?.calls} / ${a.info ? Math.round(a.info.tris / 1000) : '-'} mil      ${a.rounds}`); }
}
if (issues.length) { console.log(`\nconsola (${issues.length}):`); [...new Set(issues)].forEach(i => console.log('  ' + i)); }
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(results, null, 1));
process.exit(issues.length ? 1 : 0);
