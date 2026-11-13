// Prueba automática del visor: sirve web/, abre Chrome con WebGL, recorre 2 personajes x (arranque + dos tiempos
// con tijera, power y squat), reproduce cada uno, guarda capturas en out/viewer/ y falla ante cualquier error de
// consola, excepción de página, pedido fallido o respuesta 4xx/5xx. Las fases se buscan por nombre en lo que trae
// poses.json (nada de índices fijos). Verifica: estructura del GLB (dos nodos de malla, materiales Hair y Lashes con alfa,
// máscara, normales de detalle, morphs corr_armUp y corr_knee), tt real por muestra, velocidad de barra, encuadre en las
// cinco cámaras, continuidad de la barra (unión cargada → envión incluida), barra quieta antes del despegue, dedos sobre
// la barra, primeros planos (cara, torso, rack, manos, brazos arriba, zapatillas) de los dos personajes, desenfoque de
// movimiento, luminancia, cambio de calidad, gobernador (escalones de calidad y resolución), costo por pase y por etapa, fps, carga
// lenta, carrera de carga y layout móvil.
// Uso: npm install && node tools/check_viewer.mjs [--quality=alta|media|baja] [--headed] [--only=ventura]
//      CHROME_PATH y TARIMA_ANGLE eligen navegador y backend de WebGL (tools/browser.mjs). En Linux sin GPU dibuja por software
//      (SwiftShader): se verifica todo menos los fps y el tiempo de cambio de calidad, que quedan como aviso.
//      [--min-fps=N] falla si los fps a DPR 1 quedan por debajo   [--strict] falla si el build no cumple el contrato 2
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { launchOptions, isSoftware } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'out', 'viewer');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const QUALITY = arg('quality') || 'alta', ONLY = arg('only'), HEADED = process.argv.includes('--headed'), STRICT = process.argv.includes('--strict'), MIN_FPS = +(arg('min-fps') || 0);
// Sin --min-fps la prueba exige igual un piso (alta 45, media 55, baja 58), salvo que la máquina esté saturada: ahí la medición no
// vale y se informa como no concluyente. Con --min-fps=N se exige siempre.
const FPS_FLOOR = { alta: 45, media: 55, baja: 58 }, loadNow = () => os.loadavg()[0] / os.cpus().length;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
if (!ONLY) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.rmSync(path.join(OUT, f));      // las capturas de una corrida anterior (otro GLB, otras fases) no se mezclan con las nuevas

const problems = [], warnings = [], notes = [];
const LAUNCH = launchOptions({ headed: HEADED });      // ruta de Chrome y backend de WebGL según la plataforma (tools/browser.mjs)
const browser = await chromium.launch(LAUNCH);
// ¿WebGL por software (SwiftShader o llvmpipe en un Linux sin GPU)? Se pregunta el renderizador real en una página vacía antes
// de empezar. Por software cada cuadro tarda segundos: la prueba vale para lógica, consola, 404 y capturas, pero no se exigen
// fps, tiempos de cambio de calidad ni desenfoque de movimiento, no se perfila el costo por pase, y las esperas de reproducción
// se alargan (el visor avanza como mucho 0,05 s de levantamiento por cuadro).
const GPU0 = await (async () => { const p = await browser.newPage(); try { return await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return null; const e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }); } catch { return null; } finally { await p.close().catch(() => null); } })();
const SOFT = isSoftware(GPU0), TO = ms => SOFT ? ms * 80 : ms;
// Por software el costo es por píxel (SwiftShader, 4 núcleos: 3,8 s por cuadro reproduciendo a 1600x817 y 1,5 s a 800x408), así
// que las páginas de escritorio se abren a la mitad de densidad: el layout en px CSS, el encuadre y la lógica no cambian, las
// capturas salen de 800x450. TARIMA_SOFT_DPR=1 las deja a tamaño completo (la prueba tarda más del doble).
const SDPR = SOFT ? +(process.env.TARIMA_SOFT_DPR || .5) : 1;
const extra = [];      // navegadores aparte para medir rendimiento (ver más abajo)
const watch = page => {
  if (SOFT) { page.setDefaultTimeout(900000); page.setDefaultNavigationTimeout(900000); }
  page.on('console', m => { const t = m.type(); if (t === 'error') problems.push(`console.error: ${m.text()}`); else if (t === 'warning') warnings.push(m.text()); });
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`pedido externo: ${r.url()}`); });
};
const fpsOf = (pg, ms = 3000) => pg.evaluate(ms => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : res({ fps: n / (ms / 1000), w: TARIMA.renderer.domElement.width, h: TARIMA.renderer.domElement.height, blur: TARIMA.post.maxBlur }); }; requestAnimationFrame(f); }), ms);
// fps: se miden ANTES que nada, en un navegador recién abierto. La propia prueba (capturas, perfiles, varios navegadores) sube
// la carga de la máquina a varias unidades por núcleo, y medidos al final los fps hablaban de la prueba y no del visor.
// Reproduce el dos tiempos 4 s (parado, salida, tirones y recepción: sombras y desenfoque de movimiento en cada cuadro).
const fps0 = await (async () => {
  const b0 = await chromium.launch(LAUNCH); extra.push(b0);
  try {
    const pg = await b0.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: SDPR }); watch(pg);
    await pg.goto(`${base}?q=${QUALITY}&auto=0`, { waitUntil: 'load' }); if (!await pg.evaluate(() => window.TARIMA.ready)) return null;
    const ld = loadNow(); await pg.evaluate(() => TARIMA.play(false)); const f1p = await fpsOf(pg, 4000); await pg.evaluate(() => TARIMA.seekPhase(1)); const f1 = await fpsOf(pg, 2000);
    return { f1p, f1, ld };
  } catch (e) { problems.push(`medición de fps: ${e.message}`); return null; } finally { await b0.close().catch(() => null); }
})();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: SDPR });
watch(page);

const shots = [];
const shot = async name => { await page.waitForTimeout(350); const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, timeout: 120000 }); shots.push(path.relative(ROOT, f)); };
const T = fn => page.evaluate(fn);

try {
  await page.goto(`${base}?q=${QUALITY}&auto=0`, { waitUntil: 'load' });
  const ok = await page.evaluate(() => window.TARIMA.ready);
  if (!ok) throw new Error('el visor no terminó de iniciar');
  const info = await T(() => { const gl = TARIMA.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { three: TARIMA.renderer.constructor.name, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', q: TARIMA.state.qName }; });
  console.log(`GPU: ${info.gpu} · calidad ${info.q}${SOFT ? ` · RENDER POR SOFTWARE: no se exigen fps, tiempos ni desenfoque de movimiento, no se perfila, y la densidad de píxeles se multiplica por ${SDPR}` : ''}`);

  const combos = [{ lift: 's', tag: 'arranque' }, { lift: 'c', jerk: 'split', tag: 'dostiempos-tijera' }, { lift: 'c', jerk: 'power', tag: 'dostiempos-power' }, { lift: 'c', jerk: 'squat', tag: 'dostiempos-squat' }];
  for (const who of ['ventura', 'brenner'].filter(w => !ONLY || w === ONLY)) {
    await page.click(`#who-${who}`);
    await page.waitForFunction(w => TARIMA.state.who === w && document.getElementById('msg').hidden, who, { timeout: TO(60000) });
    for (const c of combos) {
      await page.click(c.lift === 's' ? '#lift-s' : '#lift-c');
      if (c.jerk) await page.click(`#jk-${c.jerk}`);
      const meta = await T(() => ({ n: TARIMA.state.tl.nPhases, dur: TARIMA.state.tl.duration, real: TARIMA.state.tl.hasRealTiming, kg: TARIMA.barbell.totalKg, names: TARIMA.state.tl.phases.map(p => p.n) }));
      const pre = `${who}_${c.tag}`;
      // poses fijas, buscadas por nombre de fase (con respaldo por posición si el build cambia los nombres)
      const P = (re, frac) => { const i = meta.names.findIndex(n => new RegExp(re).test(n)); return i >= 0 ? i : Math.round(frac * (meta.n - 1)); };
      const at = (cam, ph) => page.evaluate(([cam, ph]) => { TARIMA.cam(cam); TARIMA.seekPhase(ph); }, [cam, ph]);
      const close = (key, ph) => page.evaluate(([key, ph]) => { TARIMA.seekPhase(ph); TARIMA.shot(key); }, [key, ph]);
      await at(1, P('^Salida', .1)); await shot(`${pre}_salida-lateral`);
      await at(0, P('^Primer tirón', .25)); await shot(`${pre}_tiron-34`);
      await at(1, P('^Triple extensión', .5)); await shot(`${pre}_extension-lateral`);
      await at(1, P('^Tirón de brazos', .55)); await shot(`${pre}_tiron-brazos-lateral`);
      await at(2, P('^Recepción', .7)); await shot(`${pre}_recepcion-frontal`);
      if (c.jerk) { await at(1, P('Impulso', .8)); await shot(`${pre}_impulso-lateral`); await at(0, P('Empuje', .85)); await shot(`${pre}_empuje-34`); }
      await at(3, meta.n - 1); await shot(`${pre}_final-cenital`);
      await T(() => { TARIMA.cam(4); }); await shot(`${pre}_final-reversa`);
      // primeros planos del personaje (una vez por levantamiento: arranque y dos tiempos con tijera)
      if (!c.jerk || c.jerk === 'split') {
        const L = c.jerk ? 'c' : 's';
        await close('manos', P('^Primer tirón', .25)); await shot(`${who}_${L}_pp-manos-hook`);
        await close('manos-atras', P('^Despegue', .2)); await shot(`${who}_${L}_pp-manos-dorso`);
        await close('pies', P('^Salida', .1)); await shot(`${who}_${L}_pp-zapatillas-salida`);
        await close('rack-lado', P('^Giro', .6)); await shot(`${who}_${L}_pp-giro-costado`);
        await close('arriba', P('^Tirón de brazos', .55)); await shot(`${who}_${L}_pp-tiron-brazos`);
        await close('cara', P('^Recepción', .7)); await shot(`${who}_${L}_pp-cara`);
        await close('torso', P('^Recepción', .7)); await shot(`${who}_${L}_pp-torso`);
        await close('piernas', P('^Recepción', .7)); await shot(`${who}_${L}_pp-piernas-recepcion`);
        if (c.jerk) {
          await close('rack', P('^Recuperación', .65)); await shot(`${who}_c_pp-rack-frente`);
          await close('rack-lado', P('^Recuperación', .65)); await shot(`${who}_c_pp-rack-costado`);
          await close('manos', P('^Recuperación', .65)); await shot(`${who}_c_pp-manos-rack`);
          await close('torso', P('Impulso', .8)); await shot(`${who}_c_pp-impulso-torso`);
          await close('arriba', P('Tijera', .9)); await shot(`${who}_c_pp-overhead-tijera`);
          await close('pies', P('Tijera', .9)); await shot(`${who}_c_pp-zapatillas-tijera`);
          await close('cara', meta.n - 1); await shot(`${who}_c_pp-cara-final`);
        } else { await close('arriba', P('^Recepción', .7)); await shot(`${who}_s_pp-overhead-recepcion`); await close('manos', meta.n - 1); await shot(`${who}_s_pp-manos-final`); }
      }
      await T(() => TARIMA.shot());
      // reproducción completa en tiempo real, con una captura en movimiento
      await T(() => TARIMA.cam(0)); await page.click('#play');
      await page.waitForTimeout(Math.min(meta.dur * 1000 * .62, 6000)); await page.screenshot({ path: path.join(OUT, `${pre}_play.png`), timeout: 120000 }); shots.push(`out/viewer/${pre}_play.png`);
      await page.waitForFunction(() => !TARIMA.state.playing, null, { timeout: TO(30000) });
      await page.waitForFunction(() => !!TARIMA.arena.decision, null, { timeout: TO(5000) });
      const end = await T(() => { const tl = TARIMA.state.tl, pk = tl.peakVel(); return { t: TARIMA.state.t, dur: tl.duration, phase: document.getElementById('phase').textContent, whip: TARIMA.barbell.freqHz, pk: pk.v, pkPhase: tl.phases[Math.min(tl.nPhases - 1, Math.ceil(tl.phaseAt(pk.t) - 1e-6))].n, liftPhase: tl.phases[Math.round(tl.phaseAt(tl.liftT))]?.n }; });
      if (!meta.real) problems.push(`${pre}: el visor no está usando el tt real de poses.json`);
      if (!(end.pk > .8 && end.pk < 3.2)) problems.push(`${pre}: velocidad vertical pico de la barra fuera de rango (${end.pk.toFixed(2)} m/s)`);
      if (Math.abs(end.t - end.dur) > 1e-6) problems.push(`${pre}: la reproducción no llegó al final (${end.t} de ${end.dur})`);
      await shot(`${pre}_final-34`);
      // pasada determinista a paso fijo: el whip no explota, los discos nunca atraviesan la tarima y la barra no salta
      const sim = await T(() => { const A = TARIMA, b = A.barbell, tl = A.state.tl, dt = 1 / 120; A.manualClock(true); A.cam(0); A.play(false); let lo = 0, hi = 0, floor = 1, vmax = 0, vhold = 0, tv = 0, prev = b.group.position.clone();
        for (let i = 0; i < 120 * (tl.duration + 1.5); i++) { A.step(dt); lo = Math.min(lo, b.tipDrop); hi = Math.max(hi, b.tipDrop); floor = Math.min(floor, b.group.position.y + b.q - b.plateR);
          const v = i ? b.group.position.distanceTo(prev) / dt : 0, t = A.state.t; prev.copy(b.group.position); if (v > vmax) { vmax = v; tv = t; }
          if (tl.rackT0 !== undefined && t > tl.rackT0 + dt && t < tl.rackT1 + .02) vhold = Math.max(vhold, v); }
        const join = tl.rackFrom !== undefined ? A.state.athletes[A.state.who].sampleDiff(tl.rackFrom, tl.rackTo) : null;
        A.manualClock(false); return { lo, hi, floor, vmax, tv, vhold, join, ended: !A.state.playing }; });
      if (!sim.ended || !(sim.lo > -.09 && sim.hi < .09)) problems.push(`${pre}: whip fuera de rango (${sim.lo.toFixed(3)} .. ${sim.hi.toFixed(3)} m)`);
      if (sim.floor < -.0015) problems.push(`${pre}: los discos atraviesan la tarima ${(-sim.floor * 1000).toFixed(1)} mm`);
      if (sim.vmax > 5) problems.push(`${pre}: salto de barra, ${sim.vmax.toFixed(2)} m/s en t=${sim.tv.toFixed(2)} s`);
      if (sim.vhold > .25) problems.push(`${pre}: la barra salta en la pausa del rack (${sim.vhold.toFixed(3)} m/s)`);
      if (sim.join && (sim.join[0] > 1 || sim.join[1] > .5)) { const msg = `contrato 2: ${pre}: el índice 0 del envión no duplica el último de la cargada (barra ${sim.join[0].toFixed(1)} mm, huesos ${sim.join[1].toFixed(1)}°); el visor lo funde en la pausa`; (STRICT ? problems : notes).push(msg); }
      // encuadre: en cada cuadro y en cada cámara, discos (con flecha), puntas de barra, cabeza y pies dentro del rectángulo libre de gráfica
      const fr = await T(() => { const A = TARIMA, tl = A.state.tl, dt = 1 / 60, out = []; A.manualClock(true);
        for (let cam = 0; cam < 5; cam++) { A.cam(cam); A.play(false); const w = { cam, top: -9, bot: 9, side: 0, t: 0, free: null };
          for (let i = 0; i < 60 * (tl.duration + 1.2); i++) { A.step(dt); const f = A.framing(); w.free = f.free;
            if (f.maxY - f.free.maxY > w.top) { w.top = f.maxY - f.free.maxY; w.t = A.state.t; w.ndc = f.maxY; }
            w.bot = Math.min(w.bot, f.minY - f.free.minY); w.side = Math.max(w.side, f.maxX - f.free.maxX, f.free.minX - f.minX, Math.abs(f.maxX) - .97, Math.abs(f.minX) - .97); }
          out.push(w); }
        A.manualClock(false); A.cam(0); A.seekTime(tl.duration); return out; });
      for (const w of fr) {
        if (w.top > .01 || w.ndc > .92) problems.push(`${pre}: cámara ${w.cam}: la barra o la cabeza salen por arriba (NDC y ${w.ndc.toFixed(3)}, excede el área libre en ${w.top.toFixed(3)}) en t=${w.t.toFixed(2)} s`);
        if (w.bot < -.01) problems.push(`${pre}: cámara ${w.cam}: pies o discos por debajo del área libre (${w.bot.toFixed(3)})`);
        if (w.side > .01) problems.push(`${pre}: cámara ${w.cam}: la barra sale por un costado (${w.side.toFixed(3)})`);
      }
      // barra quieta antes del despegue: de 'Parado' a 'Salida' los discos no se levantan ni ruedan (se muestrea a 120 Hz)
      const pre0 = await T(() => { const A = TARIMA, tl = A.state.tl, b = A.barbell, dt = 1 / 120; A.manualClock(true); A.play(false); A.step(0); const p0 = b.group.position.clone(); let move = 0, gap = 0, lift = 0;   // step(0): posa en t=0 antes de tomar la referencia
        const bone = p0.clone(), a = A.state.athletes[A.state.who];
        while (A.state.t < tl.liftT - dt) { A.step(dt); move = Math.max(move, b.group.position.distanceTo(p0)); lift = Math.max(lift, b.group.position.y + b.q - b.plateR); a.barWorld(bone); gap = Math.max(gap, bone.distanceTo(b.group.position)); }
        A.manualClock(false); A.seekTime(0); return { move, gap, lift, liftT: tl.liftT, drift: tl.preLiftDrift || 0, float: tl.preLiftFloat || 0 }; });
      if (!(pre0.liftT > 0)) problems.push(`${pre}: no hay fase de salida reconocible para fijar la barra al piso`);
      else if (pre0.move > .001 || pre0.lift > .001) problems.push(`${pre}: la barra se mueve antes del primer tirón (${(pre0.move * 1000).toFixed(1)} mm, discos a ${(pre0.lift * 1000).toFixed(1)} mm del piso)`);
      if (pre0.drift > .002 || Math.abs(pre0.float) > .003) notes.push(`POSES: ${pre}: antes del despegue el hueso Bar se mueve ${(pre0.drift * 1000).toFixed(1)} mm (de 'Parado' a 'Salida' la barra cargada debería quedar quieta) y en la salida su centro queda ${(pre0.float * 1000).toFixed(1)} mm por encima del apoyo real (radio de disco 225 mm sobre la tarima); el visor la fija a la tarima y las manos quedan hasta ${(pre0.gap * 1000).toFixed(0)} mm del eje mientras tanto`);
      // agarre: distancia de la última articulación de cada dedo (índice a meñique) al eje de la barra, por fase. Con la
      // mano cerrada sobre una barra de 14 mm de radio no debería pasar de unos 45 mm.
      const grip = await T(() => { const A = TARIMA, tl = A.state.tl, a = A.state.athletes[A.state.who], b = A.barbell.group.position, out = [], v = b.clone();
        for (let p = 1; p < tl.nPhases; p++) { A.seekPhase(p); let worst = 0, sum = 0, n = 0;
          for (const s of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) { a.boneWorld(`${s}Hand${f}3`, v); const d = Math.hypot(v.y - b.y, v.z - b.z); worst = Math.max(worst, d); sum += d; n++; }
          out.push({ n: tl.phases[p].n, worst: worst * 1000, mean: sum / n * 1000 }); }
        A.seekPhase(0); return out; });
      const open = grip.filter(g => g.worst > 45);
      if (open.length) notes.push(`POSES/PERSONAJE: ${pre}: dedos lejos de la barra (última articulación a más de 45 mm del eje) en ${open.length} de ${grip.length} fases: ${open.map(g => `${g.n} ${g.worst.toFixed(0)} mm`).join(', ')}`);
      meta.grip = `dedos a ${Math.min(...grip.map(g => g.worst)).toFixed(0)}..${Math.max(...grip.map(g => g.worst)).toFixed(0)} mm del eje`;
      meta.frame = `encuadre máx NDC y ${Math.max(...fr.map(w => w.ndc)).toFixed(2)}`;
      meta.whip = `flecha ${(sim.lo * 1000).toFixed(0)}..${(sim.hi * 1000).toFixed(0)} mm`;
      console.log(`ok ${pre}: ${meta.n} fases, ${meta.dur.toFixed(2)} s (${meta.real ? 'tt real' : 'duraciones por defecto'}), ${meta.kg} kg, whip ${end.whip.toFixed(2)} Hz (${meta.whip}), vel. máx barra ${sim.vmax.toFixed(2)} m/s, ${meta.frame}, vel. vertical pico ${end.pk.toFixed(2)} m/s llegando a "${end.pkPhase}", barra quieta hasta t=${pre0.liftT.toFixed(2)} s ("${end.liftPhase}"), ${meta.grip}, fin en "${end.phase}"`);
    }
    // look: negros no aplastados y fondo con señal en las cámaras con público (3/4, lateral, reversa), en la calidad pedida
    if (QUALITY !== 'baja') {
      const lum = await T(() => { const A = TARIMA, out = []; A.setLift('c'); const ix = (re, d) => { const i = A.phaseIndex(re); return i < 0 ? d : i; }; for (const [cam, ph] of [[0, ix('^Primer tirón', 3)], [1, ix('^Triple extensión', 4)], [4, A.state.tl.nPhases - 1], [2, ix('^Recepción', 6)]]) { A.cam(cam); A.seekPhase(ph); A.step(0); out.push({ cam, ...A.luma() }); } return out; });
      for (const l of lum) { const name = ['3/4', 'lateral', 'frontal', 'cenital', 'reversa'][l.cam];
        if (l.cam !== 2 && (l.median < 20 || l.median > 75 || l.dark > .15)) problems.push(`${who}: luminancia fuera de rango en ${name}: mediana ${l.median}/255, ${(l.dark * 100).toFixed(0)}% por debajo de 8`);
        if (l.rgb[2] > l.rgb[0] * 1.35) problems.push(`${who}: dominante azul en ${name}: RGB medio ${l.rgb}`); }
      console.log(`ok ${who} luminancia: ` + lum.map(l => `${['3/4', 'lateral', 'frontal', 'cenital', 'reversa'][l.cam]} mediana ${l.median} p25 ${l.p25} p75 ${l.p75} oscuros ${(l.dark * 100).toFixed(0)}% RGB ${l.rgb}`).join(' · '));
    }
    // estructura del personaje nuevo: materiales con alfa, máscara, detalle y morphs correctivos con el GLB real
    const st = await T(() => { const A = TARIMA, a = A.state.athletes[A.state.who], ix = re => A.phaseIndex(re), w = () => ({ ...a.corr }), out = {};
      const mats = a.meshes.map(m => m.material), hair = mats.find(m => m.name === 'Hair'), lash = mats.find(m => m.name === 'Lashes'), body = mats.find(m => m.name === 'Body');
      out.meshes = a.meshes.length; out.skinned = a.meshes.every(m => m.isSkinnedMesh); out.names = a.materialNames; out.nodes = [...new Set(a.meshes.map(m => m.parent?.name || m.name))];
      out.hair = hair && { blend: hair.transparent, depthWrite: hair.depthWrite, pre: !!a.hairDepth, shadow: a.meshes.find(m => m.material === hair).castShadow }; out.lash = lash && { blend: lash.transparent, depthWrite: lash.depthWrite, two: lash.side === 2 };
      out.mask = a.hasMask; out.mode = body.userData.skin.uMaskMode.value; out.detail = !!body.userData.skin.tDetailSkin.value?.image && !!body.userData.skin.tDetailCloth.value?.image; out.tile = body.userData.skin.uTile.value.toArray().map(Math.round); out.mpu = a.metersPerUv;
      out.morphMeshes = a.morphs.length; out.keys = Object.keys(a.morphs[0]?.dict || {});
      A.setLift('c'); A.setJerk('squat'); A.seekPhase(0); out.rest = w(); A.seekPhase(ix('^Recepción')); out.squat = w(); A.seekPhase(A.state.tl.nPhases - 1); out.up = w(); A.setJerk('split'); return out; });
    const need = ['Body', 'Eyes', 'Hair', 'Lashes'].filter(n => !st.names.includes(n));
    if (need.length || !st.skinned || st.meshes < 6) problems.push(`${who}: faltan materiales o mallas del GLB nuevo (${JSON.stringify({ need, meshes: st.meshes, names: st.names })})`);
    if (!st.hair?.blend || st.hair.depthWrite || !st.hair.pre || !st.lash?.blend || st.lash.depthWrite) problems.push(`${who}: pelo o pestañas sin alfa BLEND correcto (${JSON.stringify([st.hair, st.lash])})`);
    if (!st.mask || st.mode !== 1 || !st.detail) problems.push(`${who}: máscara o normales de detalle sin usar (${JSON.stringify({ mask: st.mask, mode: st.mode, detail: st.detail })})`);
    const mk = ['corr_armUp_L', 'corr_armUp_R', 'corr_knee_L', 'corr_knee_R'], bad = mk.filter(k => !st.keys.includes(k));
    if (bad.length || mk.some(k => st.rest[k] > .05) || st.up.corr_armUp_L < .6 || st.up.corr_armUp_R < .6 || st.squat.corr_knee_L < .6 || st.squat.corr_knee_R < .6) problems.push(`${who}: morphs correctivos: faltan ${bad}, reposo ${JSON.stringify(st.rest)}, recepción ${JSON.stringify(st.squat)}, final ${JSON.stringify(st.up)}`);
    else console.log(`ok ${who} personaje: ${st.meshes} mallas (${st.names.join(', ')}), pelo y pestañas con mezcla y pasada de profundidad, máscara y detalle (${st.mpu.toFixed(2)} m por unidad de UV: ${st.tile[0]} mosaicos de piel, ${st.tile[1]} de tela), morphs en ${st.morphMeshes} malla(s): brazos arriba ${st.up.corr_armUp_L.toFixed(2)}/${st.up.corr_armUp_R.toFixed(2)} al final, rodilla ${st.squat.corr_knee_L.toFixed(2)}/${st.squat.corr_knee_R.toFixed(2)} en la recepción, ${Math.max(...mk.map(k => st.rest[k])).toFixed(2)} parado`);
    await T(() => { TARIMA.shot(); TARIMA.cam(0); });
  }
  // contrato 3: `tt` (tiempo real por muestra) manda en la reproducción; sin él se cae a las duraciones por defecto
  const tt = await T(() => { const A = TARIMA, d = A.state.data[A.state.who], out = {}, keep = {};
    A.setLift('c'); A.setJerk('split'); let tl = A.state.tl; out.real = tl.hasRealTiming; out.dur = tl.duration; const c = d.segs.clean.tt, j = d.segs.split.tt; out.want = c[c.length - 1] - c[0] + (tl.rackT1 - tl.rackT0) + j[j.length - 1] - j[0];
    // cada muestra del clip cae en su instante de tt
    out.err = 0; for (let i = 0; i < c.length; i += 3) out.err = Math.max(out.err, Math.abs(tl.timeAt(i) - (c[i] - c[0])));
    let prev = 0, mono = true, jump = 0; for (let t = 0; t <= tl.duration; t += 1 / 240) { const s = tl.sampleAt(t); if (s < prev - 1e-9) mono = false; jump = Math.max(jump, s - prev); prev = s; }
    out.mono = mono; out.jump = jump;
    for (const [k, seg] of Object.entries(d.segs)) { keep[k] = seg.tt; delete seg.tt; } A.setLift('c'); out.fallback = !A.state.tl.hasRealTiming;
    for (const [k, seg] of Object.entries(d.segs)) seg.tt = keep[k]; A.setLift('c'); out.back = A.state.tl.hasRealTiming; return out; });
  if (!tt.real || !tt.mono || !tt.fallback || !tt.back || Math.abs(tt.dur - tt.want) > 1e-6 || tt.err > .004 || tt.jump > 1.2) problems.push(`tt: ${JSON.stringify(tt)}`); else console.log(`ok tt real: ${tt.dur.toFixed(2)} s = cargada + pausa + envión de poses.json, cada muestra en su instante (error máx ${(tt.err * 1000).toFixed(1)} ms), monótono, salto máx ${tt.jump.toFixed(3)} muestras por 1/240 s; sin tt cae a duraciones por defecto`);
  // desenfoque de movimiento de barra y discos: se activa en la parte rápida del levantamiento y se apaga al terminar
  if (SOFT) notes.push('VISOR: desenfoque de movimiento sin probar: depende del tiempo real entre cuadros y con WebGL por software no se activa');
  else if (QUALITY !== 'baja') {
    await T(() => { TARIMA.setLift('s'); TARIMA.cam(1); }); await page.click('#play');
    const mb = await page.waitForFunction(() => TARIMA.post.mbActive && TARIMA.post.mbPx > 4 ? TARIMA.post.mbPx : false, null, { timeout: 15000, polling: 'raf' }).then(h => h.jsonValue(), () => 0);
    if (mb) { await page.screenshot({ path: path.join(OUT, 'desenfoque-movimiento.png'), timeout: 120000 }); shots.push('out/viewer/desenfoque-movimiento.png'); }
    await page.waitForFunction(() => !TARIMA.state.playing, null, { timeout: 60000 }); await page.waitForTimeout(1200);
    const off = await T(() => TARIMA.post.mbActive);
    if (!mb || off) problems.push(`desenfoque de movimiento: ${mb ? 'quedó activo con la barra quieta' : 'no se activó en la reproducción'}`); else console.log(`ok desenfoque de movimiento: activo en el tirón (${mb.toFixed(0)} px de barrido), apagado con la barra quieta`);
    await T(() => { TARIMA.setLift('c'); TARIMA.cam(0); });
  }
  // repetición lenta con traza
  await page.click('#replay-btn'); await page.waitForTimeout(2500); await shot('repeticion-lenta');
  const rp = await T(() => ({ replay: TARIMA.state.replay, label: !document.getElementById('replay').hidden })); if (!rp.replay || !rp.label) problems.push('la repetición no quedó activa');
  // cambio de calidad detenido: la barra sigue en las manos
  await T(() => { TARIMA.cam(0); TARIMA.seekPhase(TARIMA.state.tl.nPhases - 1); });
  for (const q of ['media', 'baja']) {
    await page.selectOption('#quality', q); await page.waitForTimeout(700);
    const st = await T(() => { const A = TARIMA, v = A.state.athletes[A.state.who].barBone.getWorldPosition(A.barbell.group.position.clone()); return { q: A.state.qName, bar: A.barbell.group.position.y, bone: v.y, kg: A.barbell.totalKg, playing: A.state.playing, scrub: A.state.scrubbing }; });
    if (st.q !== q || Math.abs(st.bar - st.bone) > 1e-3 || st.bar < 1) problems.push(`cambio de calidad detenido (${q}): barra en y=${st.bar.toFixed(3)}, manos en ${st.bone.toFixed(3)}`);
    await shot(`calidad-${q}`);
  }
  // cambio de calidad en plena reproducción (lo mismo que hace el gobernador): termina, llega la decisión y no queda en repetición
  await page.click('#play'); await page.waitForTimeout(700); await page.selectOption('#quality', 'media'); await page.waitForTimeout(300);
  const mid = await T(() => ({ playing: TARIMA.state.playing, scrub: TARIMA.state.scrubbing })); if (!mid.playing || mid.scrub) problems.push(`cambio de calidad en reproducción: estado ${JSON.stringify(mid)}`);
  await page.waitForFunction(() => !TARIMA.state.playing, null, { timeout: TO(60000) });
  await page.waitForFunction(() => !!TARIMA.arena.decision, null, { timeout: TO(8000) }).catch(() => problems.push('cambio de calidad en reproducción: no llegó la decisión'));
  const fin = await T(() => ({ endT: TARIMA.state.endT, verdict: !document.getElementById('verdict').hidden, replay: TARIMA.state.replay })); if (!(fin.endT > 0) || !fin.verdict || fin.replay) problems.push(`cambio de calidad en reproducción: final ${JSON.stringify(fin)}`);
  // el cambio de calidad no reconstruye entorno ni barra: mismos objetos, y tarda poco
  const sw = await T(() => { const A = TARIMA, ar = A.arena, bb = A.barbell, ms = []; for (const q of ['baja', 'alta', 'media', 'baja', 'media', 'alta']) { A.setQuality(q); ms.push(Math.round(A.state.qSwitchMs)); } return { ms, same: ar === A.arena && bb === A.barbell, imp: !!A.arena.impostors, crowd: A.arena.crowd.visible }; });
  if (!sw.same || !sw.imp || !sw.crowd) problems.push(`cambio de calidad: reconstruyó el entorno o no alternó público/tribuna horneada (${JSON.stringify(sw)})`);
  if (Math.max(...sw.ms.slice(1)) > 1200) (SOFT ? notes : problems).push(`cambio de calidad lento: ${sw.ms} ms${SOFT ? ' (render por software: no concluyente)' : ''}`);
  console.log(`ok cambio de calidad: detenido (barra en las manos) y en reproducción (llega la decisión); sin reconstruir entorno, ${sw.ms.join(' / ')} ms por cambio (carga del sistema ${loadNow().toFixed(1)} por núcleo)`);
  // gobernador: lógica pura con fps simulados
  const gv = await T(() => { const A = TARIMA, g = A.gov, S = A.state, keep = { step: S.step, refresh: g.refresh }, out = {}, key = i => i === null ? null : A.stepKey(i), at = k => A.STEPS.findIndex((_, i) => A.stepKey(i) === k);
    const run = (from, hz, seq, playing = false, coarse = false) => { S.step = at(from); g.refresh = hz; g.fails = {}; g.retryAt = {}; g.slow = g.fast = 0; let r = null, now = 1e6; for (const f of seq) { const d = g.decide(f, now, playing, coarse); if (d !== null) { r = d; S.step = d; } now += 1000; } return key(r); };
    out.cap30 = run('media', 30, [30, 30, 29, 30]);                           // pantalla a 30 Hz: 30 fps es holgura (sube un escalón), no lentitud
    out.slowMedia = run('media', 60, [38, 37]);                               // lento: primero baja resolución, no calidad
    out.slowMore = run('media', 60, [38, 37, 38, 37]);                        // sigue lento: recién ahí cambia de calidad
    out.upFromBaja = run('baja', 60, [60, 59, 60, 60]);                       // hay camino de subida desde baja
    out.playHold = run('alta', 60, [40, 41, 40, 39], true);                   // en reproducción no cambia por una caída moderada
    out.playBad = run('alta', 60, [20, 21], true);                            // salvo que sea inusable
    out.noUpPlaying = run('media', 60, [60, 60, 60, 60, 60], true);
    out.coarse = run('media', 60, [60, 60, 60, 60, 60], false, true);         // en táctil no sube a alta
    S.step = at('media'); g.refresh = 60; g.fails = {}; g.retryAt = {}; g.slow = g.fast = 0; g.decide(30, 1e6, false, false); const dn = g.decide(30, 1e6 + 1000, false, false); S.step = dn; let up = null; for (let i = 0; i < 6; i++) up = g.decide(60, 1e6 + 2000 + i * 1000, false, false) ?? up; let later = null; g.fast = 0; for (let i = 0; i < 5; i++) later = g.decide(60, 1e6 + 40000 + i * 1000, false, false) ?? later;
    out.backoff = [key(dn), key(up), key(later)];                             // tras fallar un escalón no lo reintenta enseguida, pero sí a los 30 s
    S.step = keep.step; g.refresh = keep.refresh; g.reset(); out.refresh = keep.refresh; return out; });
  const gvOk = gv.cap30 === 'alta@0.8' && gv.slowMedia === 'media@0.8' && gv.slowMore === 'baja' && gv.upFromBaja === 'media@0.8' && gv.playHold === null && gv.playBad === 'alta@0.8' && gv.noUpPlaying === null && gv.coarse === null && gv.backoff[0] === 'media@0.8' && gv.backoff[1] === null && gv.backoff[2] === 'media';
  if (!gvOk) problems.push(`gobernador: ${JSON.stringify(gv)}`); else console.log(`ok gobernador: mide contra el refresco (${gv.refresh} Hz detectados), baja primero resolución y después calidad, sube con espera tras un fallo, no cambia en reproducción salvo cuadro inusable, no pasa a alta en táctil`);
  await page.close();
  // ---- rendimiento: en un navegador recién abierto, con un solo atleta y en los primeros segundos. Medido el 11/11/2026 en
  // esta máquina: cualquier página que dibuja sin parar (también una de control con seis pases triviales, sin three.js)
  // pasa a los 6 a 9 segundos de ~10 ms a ~90 ms de GPU por cuadro y no vuelve. No depende del visor. Por eso los fps se
  // toman apenas carga la página y el costo por etapa se mide con el bucle de dibujo detenido (mínimo de varias tandas). ----
  const pb = await chromium.launch(LAUNCH); extra.push(pb);
  const perf = await pb.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: SDPR }); watch(perf);
  await perf.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window), held = []; window.__paused = false; window.requestAnimationFrame = cb => window.__paused ? (held.push(cb), 0) : raf(cb); window.__pause = on => { window.__paused = on; if (!on) held.splice(0).forEach(cb => raf(cb)); }; });
  await perf.goto(`${base}?q=${QUALITY}&auto=0`, { waitUntil: 'load' }); await perf.evaluate(() => window.TARIMA.ready);
  if (!fps0) throw new Error('no se pudieron medir los fps al comienzo');
  const { f1p, f1 } = fps0; await perf.evaluate(() => { TARIMA.seekPhase(1); window.__pause(true); });
  const mem = await perf.evaluate(() => TARIMA.gpuMemory?.());
  const prof = {};
  // costo por pase (ms por cuadro, mejor de 3 tandas con la GPU forzada): cada columna apaga una cosa más
  if (SOFT) notes.push('VISOR: costo por pase y por etapa sin perfilar (WebGL por software)');
  for (const q of SOFT ? [] : [...new Set([QUALITY, 'media', 'baja'])]) { const pf = await perf.evaluate(async q => { TARIMA.setQuality(q); TARIMA.cam(0); TARIMA.seekPhase(Math.max(1, TARIMA.phaseIndex('^Primer tirón'))); TARIMA.step(0); await TARIMA.profile(2); return TARIMA.profile(8); }, q); prof[q] = pf;
    console.log(`perfil ${q} ${pf.gpu ? '(tiempo de GPU)' : '(reloj de pared)'} ${pf.w}x${pf.h} (${pf.calls} draw calls, ${Math.round(pf.tris / 1000)} mil triángulos): ` + Object.entries(pf).filter(([k]) => /^(completo|sin_)/.test(k)).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' → ') + ' ms'); 
    // tiempo de GPU por etapa: mínimo de 3 tandas de 24 cuadros (el mínimo es lo que menos depende de la carga de la máquina)
    const pp = await perf.evaluate(async () => { const A = TARIMA, m = {}; let frame = Infinity; if (!A.profilePasses) return null;
      for (let r = 0; r < 3; r++) { const o = await A.profilePasses(24, true); if (!o) return null; for (const k in o.min) m[k] = Math.min(m[k] ?? Infinity, o.min[k]); const w = await A.profilePasses(24, true, true); frame = Math.min(frame, w.min.escena); }
      return { m, frame }; });
    if (pp) { prof[q].frame = pp.frame; console.log(`etapas ${q} (ms de GPU, mínimo por etapa): ` + Object.entries(pp.m).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ') + ` · cuadro entero ${pp.frame.toFixed(1)}`); } }
  const ld = fps0.ld, floor = MIN_FPS || FPS_FLOOR[QUALITY] || 45, busy = !MIN_FPS && ld > 1.0, soft = !MIN_FPS && SOFT;      // carga al momento de medir (antes de que la prueba la suba); por software los fps no hablan del visor
  console.log(`fps (${QUALITY}, DPR 1, ${f1.w}x${f1.h}, navegador nuevo, antes del resto de la prueba): ${f1p.fps.toFixed(0)} reproduciendo 4 s, ${f1.fps.toFixed(0)} en pausa (piso ${floor}; carga del sistema ${ld.toFixed(1)} por núcleo${soft ? ': RENDER POR SOFTWARE, medición no concluyente, el piso no se exige' : busy ? ': MÁQUINA SATURADA, medición no concluyente, el piso no se exige' : ''})`);
  if (mem) console.log(`memoria de GPU estimada (${QUALITY}, un atleta): ${mem.total} MB (atleta ${mem.atletas}, entorno y barra ${mem.texturas}, post ${mem.post}, sombras ${mem.sombras})`);
  if (Math.min(f1.fps, f1p.fps) < floor) { if (soft) notes.push(`VISOR: fps sin medir: ${f1.fps.toFixed(0)} en pausa y ${f1p.fps.toFixed(0)} reproduciendo en ${QUALITY} con WebGL por software (sin GPU). Los fps se miden en una máquina con GPU: node tools/check_viewer.mjs --min-fps=${floor}`); else if (busy) notes.push(`VISOR: fps sin demostrar: ${f1.fps.toFixed(0)} en pausa y ${f1p.fps.toFixed(0)} reproduciendo en ${QUALITY} con la máquina saturada (carga ${ld.toFixed(1)} por núcleo; el cuadro cuesta ${prof[QUALITY]?.frame?.toFixed(1) ?? '?'} ms de GPU como mínimo, ${prof[QUALITY]?.frame ? Math.round(1000 / prof[QUALITY].frame) : '?'} cuadros por segundo de techo). Repetir con la máquina libre: node tools/check_viewer.mjs --min-fps=${floor}, o medir solo el costo con node tools/check_viewer_perf.mjs`); else problems.push(`fps ${Math.min(f1.fps, f1p.fps).toFixed(0)} < ${floor} en ${QUALITY}`); }

  await pb.close();

  // ---- DPR 2 (pantalla retina): tope de píxeles y fps ----
  const hb = await chromium.launch(LAUNCH); extra.push(hb);
  const hi = await hb.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 * SDPR }); watch(hi);
  await hi.goto(`${base}?q=${QUALITY}&auto=0`, { waitUntil: 'load' }); await hi.evaluate(() => window.TARIMA.ready);
  const f2 = await fpsOf(hi, 2500); console.log(`fps (${QUALITY}, DPR 2, ${f2.w}x${f2.h}, desenfoque máx ${f2.blur?.toFixed(0) ?? '-'} px): ${f2.fps.toFixed(0)}`);
  await hi.evaluate(() => { TARIMA.cam(0); TARIMA.seekPhase(TARIMA.state.tl.nPhases - 1); }); await hi.waitForTimeout(400);
  await hi.screenshot({ path: path.join(OUT, 'dpr2-final-34.png'), timeout: 120000 }); shots.push('out/viewer/dpr2-final-34.png');
  // modo auto real (sin auto=0): arranca en la calidad detectada y el gobernador puede reconstruir la escena en plena
  // reproducción; el levantamiento tiene que terminar igual, con decisión y la barra en las manos
  await hi.goto(base, { waitUntil: 'load' }); await hi.evaluate(() => window.TARIMA.ready);
  const q0 = await hi.evaluate(() => TARIMA.state.qName); await hi.click('#play');
  await hi.waitForFunction(() => !TARIMA.state.playing, null, { timeout: TO(90000) });
  await hi.waitForFunction(() => !!TARIMA.arena.decision, null, { timeout: TO(8000) }).catch(() => problems.push('modo auto: no llegó la decisión'));
  const au = await hi.evaluate(() => { const A = TARIMA; return { q: A.state.qName, sel: A.state.qSel, fps: A.state.fps, hz: A.gov.refresh, log: A.gov.log, bar: A.barbell.group.position.y, bone: A.state.athletes[A.state.who].barBone.getWorldPosition(A.barbell.group.position.clone()).y }; });
  if (au.sel !== 'auto' || Math.abs(au.bar - au.bone) > 1e-3) problems.push(`modo auto: ${JSON.stringify(au)}`); else console.log(`ok modo auto: arrancó en ${q0}, terminó en ${au.q} (${au.fps ? au.fps.toFixed(0) + ' fps en la última ventana' : 'sin medición'}; refresco ${au.hz} Hz; cambios: ${au.log.length ? au.log.map(l => `${l.from}→${l.to} a ${l.fps} fps${l.playing ? ' en reproducción' : ''}`).join(', ') : 'ninguno'})`);
  await hb.close();

  // ---- clics durante la carga: con el GLB demorado, la consola está bloqueada y ningún manejador revienta ----
  const slow = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SDPR }); watch(slow);
  await slow.route('**/models/*.glb', async r => { await new Promise(x => setTimeout(x, 2500)); await r.continue(); });
  await slow.goto(`${base}?q=baja&auto=0`, { waitUntil: 'load' }); await slow.waitForFunction(() => !!TARIMA.arena, null, { timeout: TO(60000) });
  const early = await slow.evaluate(() => { const A = TARIMA, inert = document.getElementById('panel').inert, loaded = !!A.state.tl;
    for (const id of ['jk-power', 'jk-squat', 'lift-s', 'lift-c', 'jk-split', 'play', 'replay-btn', 'slow', 'trace', 'cam-2']) document.getElementById(id).click();      // click() programático: llega al manejador aunque el panel esté inerte
    const sc = document.getElementById('scrub'); sc.value = 3; sc.dispatchEvent(new Event('input')); const ld = document.getElementById('load'); ld.value = 120; ld.dispatchEvent(new Event('change'));
    A.setJerk('power'); A.setLift('c'); A.play(false); A.seekPhase(2); A.seekTime(1); A.setKg(140); dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    return { inert, loaded, jerk: A.state.jerk }; });
  if (early.loaded) notes.push('clics durante la carga: el GLB llegó antes de poder probar (no concluyente)'); else if (!early.inert || early.jerk !== 'power') problems.push(`clics durante la carga: ${JSON.stringify(early)}`);
  const okSlow = await slow.evaluate(() => window.TARIMA.ready); const after = await slow.evaluate(() => ({ jerk: TARIMA.state.jerk, seg: TARIMA.state.tl?.jerk, inert: document.getElementById('panel').inert, pressed: document.getElementById('jk-power').getAttribute('aria-pressed') }));
  if (!okSlow || after.inert || after.seg !== 'power' || after.pressed !== 'true') problems.push(`tras la carga lenta: ${JSON.stringify(after)}`); else if (!early.loaded) console.log('ok clics durante la carga: consola inerte, sin excepciones, y el envión elegido (power) queda aplicado al terminar');
  await slow.click('#play'); await slow.waitForTimeout(300); await slow.close();

  // ---- móvil (GLB, máscara y morphs reales) ----
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); watch(mob);
  await mob.goto(`${base}?auto=0`, { waitUntil: 'load' }); if (!await mob.evaluate(() => window.TARIMA.ready)) throw new Error('móvil: el visor no inició');
  const M = fn => mob.evaluate(fn);
  // carrera de carga: dos pedidos del mismo personaje y un cambio antes de que termine; gana el último clic y no quedan huérfanos
  const race = await M(async () => { const A = TARIMA; const ps = [A.setWho('brenner'), A.setWho('brenner'), A.setWho('ventura')]; await Promise.all(ps);
    let roots = 0, vis = 0; A.scene.traverse(o => { if (o.isBone && o.name === 'Bar') { roots++; let p = o, v = true; while (p) { v = v && p.visible; p = p.parent; } if (v) vis++; } });
    return { who: A.state.who, roots, vis, loaded: Object.keys(A.state.athletes).length, msg: document.getElementById('msg').hidden }; });
  if (race.who !== 'ventura' || race.roots !== 2 || race.vis !== 1 || race.loaded !== 2 || !race.msg) problems.push(`carrera de setWho: ${JSON.stringify(race)}`); else console.log('ok carga concurrente: gana el último pedido, 2 atletas cargados, 1 visible');
  const mm = await M(() => { const A = TARIMA, a = A.state.athletes.ventura; A.setLift('c');
    return { mask: a.hasMask, q: A.state.qName, cw: A.renderer.domElement.width, css: A.renderer.domElement.clientWidth, msaa: A.post.sceneRT.samples }; });
  if (!mm.mask) problems.push(`móvil: máscara sin usar (${JSON.stringify(mm)})`);
  if (mm.q === 'baja' && (mm.cw < mm.css * 1.4 || mm.msaa < 2)) problems.push(`móvil: baja sin antialias (buffer ${mm.cw} px para ${mm.css} px CSS, MSAA ${mm.msaa})`);
  for (const [w, h] of [[390, 844], [844, 390], [320, 568]]) {
    await mob.setViewportSize({ width: w, height: h }); await mob.waitForTimeout(500);
    const lay = await M(() => { const A = TARIMA; A.cam(0); A.seekPhase(A.state.tl.nPhases - 1); A.measureInsets(); A.rig.settle(); A.step(0); const f = A.framing(), c = document.getElementById('gl').getBoundingClientRect(), p = document.getElementById('panel').getBoundingClientRect();
      const small = [...document.querySelectorAll('.chip,#scrub')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height).filter(x => x < 39.5).length;
      return { f, canvas: Math.round(c.height), panel: Math.round(p.height), small, coarse: matchMedia('(pointer:coarse)').matches, q: A.state.qName }; });
    const f = lay.f; if (f.maxY > f.free.maxY + .01 || f.minY < f.free.minY - .01 || f.maxX > f.free.maxX + .01 || f.minX < f.free.minX - .01) problems.push(`móvil ${w}x${h}: la gráfica tapa al atleta o la barra (${JSON.stringify(f)})`);
    if (lay.panel >= lay.canvas) problems.push(`móvil ${w}x${h}: la consola (${lay.panel} px) es más alta que el lienzo (${lay.canvas} px)`);
    if (lay.coarse && lay.small) problems.push(`móvil ${w}x${h}: ${lay.small} controles por debajo de 40 px`);
    await mob.waitForTimeout(500); await mob.screenshot({ path: path.join(OUT, `movil-${w}x${h}.png`), timeout: 120000 }); shots.push(`out/viewer/movil-${w}x${h}.png`);
    console.log(`ok móvil ${w}x${h}: lienzo ${lay.canvas} px, consola ${lay.panel} px, calidad ${lay.q}, táctil ${lay.coarse}`);
  }
  await mob.close();
} catch (e) { problems.push(`excepción de la prueba: ${e.message}`); }
finally { for (const b of extra) await b.close().catch(() => null); await browser.close(); server.close(); }

if (notes.length) { console.log(`\navisos para otras pistas (${notes.length}):`); [...new Set(notes)].forEach(n => console.log('  ' + n)); }
if (warnings.length) { console.log(`\nadvertencias de consola (${warnings.length}):`); [...new Set(warnings)].forEach(w => console.log('  ' + w)); problems.push(`${warnings.length} advertencias de consola`); }
console.log(`\n${shots.length} capturas en out/viewer/`);
if (problems.length) { console.error(`\nFALLÓ (${problems.length}):`); [...new Set(problems)].forEach(p => console.error('  ' + p)); process.exit(1); }
console.log('visor OK: sin errores de consola, sin 404, sin pedidos externos');
