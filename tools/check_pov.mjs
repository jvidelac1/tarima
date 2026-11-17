// Primera persona y final del levantamiento, con navegador (corre en GitHub Actions, dibujo por software):
//  A. El final de un levantamiento cuadro a cuadro (válido, nulo y caída, game/caida.js), en los dos modelos: a 60 cuadros
//     por segundo mide cuánto resbalan los pies apoyados, cuánto gira el hueso que más gira (°/s), cuánto se meten las manos
//     en el tronco y la holgura de la barra; y saca una hoja de fotos cada 0,15 s desde la general y desde el costado.
//  B. La primera persona (stage.js, POV): hojas de fotos a lo largo del arranque, la cargada y los tres enviones, fotos
//     grandes de las fases clave y, reproduciendo cada segmento seguido, cuánto se mueve y gira la cámara (m/s, °/s) y que
//     la cabeza propia no se dibuje. También el final de un válido visto desde los ojos.
// Hojas y fotos en out/pov/. Falla con errores de consola o si la primera persona no cumple sus reglas (ver abajo).
// Uso: node tools/check_pov.mjs [--headed] [--solo=finales|pov|claves]   (claves: solo las fotos grandes de las fases clave en primera persona)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const OUT = path.resolve(ROOT, arg('out') || path.join('out', 'pov')), Q = arg('q') || 'baja', PLANTEL = arg('plantel') || process.env.TARIMA_PLANTEL || '';      // --q=alta: fotos con la calidad alta (lento por software); --plantel=id,id,id: vestuario
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
await page.goto(`${base}juego.html?q=${Q}&dibujo=0${PLANTEL ? '&plantel=' + PLANTEL : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.JUEGO && window.JUEGO.listo, null, { timeout: 240000 }).catch(() => {});
if (!await page.evaluate(() => window.JUEGO.listo)) throw new Error('el juego no terminó de iniciar');
await page.evaluate(() => { document.documentElement.classList.add('juego-u');      // el veredicto a la izquierda, como en el juego (no encima del pesista)
  for (const id of ['capa', 'zocalo', 'senal', 'acuse', 'tablero']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
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
  let camRef = null, piso = 9; const M = { resbala: 0, vPie: 0, tPie: 0, giro: 0, cual: '', tGiro: 0, manoTronco: 9, tMano: 0, vMano: 0, tVMano: 0, holgura: 9, sube: 0 }, lista = []; let ant = null, prox = 0;
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
    // la cámara queda quieta desde que se suelta la barra (pedido del dueño): cuánto se corre y cuánto gira desde ese cuadro
    if (t >= info.suelta + 1 / 60 && m.cam) { camRef ||= m.cam; M.camMov = Math.max(M.camMov || 0, Math.hypot(...m.cam.p.map((x, i) => x - camRef.p[i]))); M.camGiro = Math.max(M.camGiro || 0, Math.abs(m.cam.inc - camRef.inc), Math.abs(m.cam.fov - camRef.fov) * Math.PI / 180); }
    ant = m;
  }
  return { info, M, lista };
}
if (!SOLO || SOLO === 'finales') {
  console.log('A. FINALES (60 c/s): pies apoyados que resbalan, hueso que más gira, manos contra el tronco, holgura de la barra');
  for (const id of ['ventura', 'brenner']) for (const caso of FINALES) {
    const r = await recorrer(id, caso, '3/4', true); if (!r) continue; const { M, info } = r;
    console.log(`${id.padEnd(8)} ${caso[0].padEnd(26)} ${info.tipo.padEnd(8)} ${info.dur.toFixed(2)} s · pies resbalan ${(M.resbala * 100).toFixed(1)} cm (máx ${(M.vPie * 100).toFixed(0)} cm/s a ${M.tPie.toFixed(2)} s; punta hasta ${(M.sube * 100).toFixed(0)} cm) · giro máx ${G(M.giro).toFixed(0)} °/s (${M.cual}, a ${M.tGiro.toFixed(2)} s) · mano hasta ${M.vMano.toFixed(1)} m/s (a ${M.tVMano.toFixed(2)} s) · mano–tronco mín ${(M.manoTronco * 100).toFixed(1)} cm a ${M.tMano.toFixed(2)} s · holgura barra ${(M.holgura * 100).toFixed(1)} cm`);
    // (hasta 5 cm: el temblor de la barra contra la tarima, que dura dos décimas, no es un reencuadre)
    if (M.camMov > .05 || M.camGiro > .004) problemas.push(`${id} · ${caso[0]}: la cámara general se mueve después de soltar la barra (${(M.camMov * 100).toFixed(1)} cm, ${G(M.camGiro).toFixed(2)}°)`);
    console.log(`${''.padEnd(36)}cámara tras soltar: ${(M.camMov * 100).toFixed(1)} cm, ${G(M.camGiro).toFixed(2)}°`);
    await hoja(`final_${id}_${slug(caso[0])}_general`, r.lista);
    if (id === 'ventura') { const l = await recorrer(id, caso, 'lado', true); if (l) await hoja(`final_${id}_${slug(caso[0])}_lado`, l.lista); }
  }
}

// ---------- B. primera persona ----------
if (!SOLO || SOLO === 'pov' || SOLO === 'claves') {
  console.log('\nB. PRIMERA PERSONA');
  const SEGS = [['snatch', 's', 100], ['clean', 'c', 120], ['split', 'c', 60], ['power', 'c', 50], ['squat', 'c', 70]];
  for (const id of SOLO === 'claves' ? [] : ['ventura', 'brenner']) {
    for (const [seg, lev, n] of SEGS) {
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
          lejos = Math.max(lejos, Math.hypot(m.cam.p[0] - m.ojos[0], m.cam.p[1] - m.ojos[1], m.cam.p[2] - m.ojos[2]));
        }
        ant = m;
      }
      await J(() => window.JUEGO.test.real());
      console.log(`${id.padEnd(8)} ${seg.padEnd(7)} cámara: hasta ${vMax.toFixed(2)} m/s y ${aMax.toFixed(0)} m/s² · mirada entre ${G(incMin).toFixed(0)}° y ${G(incMax).toFixed(0)}°, gira hasta ${G(wMax).toFixed(0)} °/s · a lo sumo a ${(lejos * 100).toFixed(0)} cm de los ojos`);
      // reglas: la mirada no gira más de 160 °/s (sigue a la barra, con tope de 150) y la cámara no se aleja más de 1,4 m de la cabeza (acompaña a la barra: con la barra en el piso queda a la altura de las rodillas)
      if (G(wMax) > 60) problemas.push(`${id} ${seg}: la mirada gira a ${G(wMax).toFixed(0)} °/s (tope 60: la cabeza se mueve leve)`);
      if (!ant.sinCabeza || !ant.sinTorso) problemas.push(`${id} ${seg}: la cabeza o el tronco propios se dibujan en la vista de los ojos`);
      if (!ant.recuadro) problemas.push(`${id} ${seg}: falta el recuadro con la vista general`);
      if (lejos > .15) problemas.push(`${id} ${seg}: la cámara queda a ${(lejos * 100).toFixed(0)} cm de los ojos (tope 15)`);
    }
  }
  // TIRAS a tiempo real desde los ojos, con el recuadro: una foto cada 0,1 s de la preparación completa (de pie mirando al
  // frente, baja a la barra, agarra, ajusta, levanta la vista y espera: ahí corre la barrita), del levantamiento y del final
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(200);
  await J(() => { window.JUEGO.test.manual(); const v = document.getElementById('veredicto'); if (v) v.hidden = true; });
  const tira = async (id, nombre, tramos) => {
    const lista = []; let reloj = 0;
    for (const [seg, lev, espera] of tramos) {
      await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s: 0, camara: 'pov', dt: 1 / 30, dibujar: false });
      const T = await J(sg => window.JUEGO.test.tiempos(sg), seg), iS = Math.max(0, T.fases.indexOf('Salida')) * T.sub, tS = T.tt[Math.min(T.n - 1, iS)] || 0, fin = T.tt[T.n - 1];
      const enS = tau => { let i = 0; while (i < T.n - 2 && T.tt[i + 1] < tau) i++; const d = T.tt[i + 1] - T.tt[i]; return i + (d > 1e-6 ? Math.min(1, Math.max(0, (tau - T.tt[i]) / d)) : 0); };
      // reloj propio del tramo: quieto de pie, hasta la salida, espera en la salida, y el levantamiento
      const pasos = []; for (let t = 0; t < (espera ? .8 : 0); t += 1 / 30) pasos.push(0);
      for (let t = 0; t < tS; t += 1 / 30) pasos.push(enS(t)); for (let t = 0; t < espera; t += 1 / 30) pasos.push(enS(tS)); for (let t = tS; t <= fin + .4; t += 1 / 30) pasos.push(enS(Math.min(fin, t)));
      const enLev = Math.round(((espera ? .8 : 0) + tS + Math.min(espera, 1.2)) * 30); let malMirada = false;
      for (let k = 0; k < pasos.length; k++) {
        const foto = k % 3 === 0, m = await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s: pasos[k], camara: 'pov', dt: 1 / 30, dibujar: foto });
        if (foto) { const z = await J(() => window.JUEGO.test.luz()); if (z.media < 6 || z.desvio < 3) problemas.push(`${nombre} ${seg} ${reloj.toFixed(1)} s: la vista de los ojos sale negra o casi (luminancia ${z.media}, desvío ${z.desvio})`); }
        // tomada la barra (pasada la espera en la salida) la mirada está en el jurado: entre -15° y +10°
        if (k > enLev && (G(m.cam.inc) < -15 || G(m.cam.inc) > 10) && !malMirada) { malMirada = true; problemas.push(`${nombre} ${seg} ${reloj.toFixed(1)} s: durante el levantamiento la mirada está a ${G(m.cam.inc).toFixed(0)}° (tiene que estar entre -15° y +10°)`); }
        if (foto) lista.push({ t: `${seg} ${reloj.toFixed(1)} s · ${G(m.cam.inc).toFixed(0)}°`, b: await toma() }); reloj += 1 / 30;
      }
    }
    await hoja(nombre, lista, 5, 480);
  };
  for (const id of SOLO === 'claves' ? [] : ['ventura']) { await tira(id, `tira_${id}_arranque`, [['snatch', 's', 2.2]]); await tira(id, `tira_${id}_dos_tiempos`, [['clean', 'c', 2.2], ['split', 'c', 0]]); }
  await J(() => window.JUEGO.test.real());
  // fotos grandes de las fases clave (Ventura y Brenner) y en un teléfono acostado
  const CLAVE = [['snatch', 's', 'Parado', 0], ['snatch', 's', 'Salida', 0], ['snatch', 's', 'Primer tirón', 5], ['snatch', 's', 'Segundo tirón', 5], ['snatch', 's', 'Tirón de brazos', 0], ['snatch', 's', 'Giro', 5], ['snatch', 's', 'Recepción', 0], ['snatch', 's', 'Recuperación', 0],
    ['clean', 'c', 'Salida', 0], ['clean', 'c', 'Tirón de brazos', 5], ['clean', 'c', 'Amortiguación', 0], ['clean', 'c', 'Recuperación', 0], ['split', 'c', 'Envión · Dip', 0], ['split', 'c', 'Envión · Empuje', 0], ['split', 'c', 'Envión · Empuje', 5], ['split', 'c', 'Envión · Tijera', 0], ['split', 'c', 'Envión · Final', 0]];
  for (const [w, h, sufijo, ids] of [[1280, 720, '', ['ventura', 'brenner']], [844, 390, '_tel', ['ventura']]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200);
    for (const id of ids) for (const [seg, lev, fase, mas] of CLAVE) {
      // el pesista tiene que estar puesto para leer sus fases: primero se posa en 0
      const s = await J(async ([id, lev, seg, fase]) => { await window.JUEGO.test.posa({ id, lev, seg, s: 0, camara: 'pov', dibujar: false }); const P = window.JUEGO.escena.P; return P.sub * P.segs[seg].poses.findIndex(p => p.n === fase || (fase === 'Giro' && p.n === 'Giro de codos')); }, [id, lev, seg, fase]) + mas;
      await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: .5, dibujar: false }); await J(o => window.JUEGO.test.posa(o), { id, lev, seg, s, camara: 'pov', dt: .5 });
      { const z = await J(() => window.JUEGO.test.luz()); if (z.media < 6 || z.desvio < 3) problemas.push(`${id} ${seg} ${fase}${sufijo}: la vista de los ojos sale negra o casi (luminancia ${z.media}, desvío ${z.desvio})`);
        if (z.horizonte < .33 || z.horizonte > .67) problemas.push(`${id} ${seg} ${fase}${sufijo}: el horizonte queda a ${(z.horizonte * 100).toFixed(0)} % del alto (tiene que estar en el tercio central)`); }
      await page.screenshot({ path: path.join(OUT, `clave${sufijo}_${id}_${slug(seg + '_' + fase)}${mas ? '_' + mas : ''}.jpg`), type: 'jpeg', quality: 82 });
    }
  }
  await page.setViewportSize({ width: 960, height: 540 }); await page.waitForTimeout(200);
  // el final desde los ojos: válido de arranque y de envión, y una caída
  for (const caso of SOLO === 'claves' ? [] : [FINALES[0], FINALES[1], FINALES[4], FINALES[7], FINALES[8]]) { const r = await recorrer('ventura', caso, 'pov', true, .1); if (r) await hoja(`pov_final_${slug(caso[0])}`, r.lista, 6, 426); }
}

// ---------- C. costo del recuadro (por software: vale la relación, no los ms) ----------
if (SOLO === 'costo' || !SOLO) {
  await J(o => window.JUEGO.test.posa(o), { id: 'ventura', lev: 's', seg: 'snatch', s: 0, camara: 'pov', dt: .5, dibujar: false });
  const c = await J(() => { const e = window.JUEGO.escena, R = {}; for (const on of [true, false, true, false]) { e.setRecuadro(on); const x = e.costo({ n: 10, tope: 20000 }); (R[on ? 'con' : 'sin'] ||= []).push(Math.round(x.ms)); } e.setRecuadro(true); return R; });
  const med = a => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`\nC. COSTO DEL RECUADRO (calidad ${Q}, por software): con ${c.con.join(' y ')} ms · sin ${c.sin.join(' y ')} ms por cuadro → +${((med(c.con) / med(c.sin) - 1) * 100).toFixed(0)} %`);
}
await browser.close(); server.close();
if (problemas.length) { console.log('\nPROBLEMAS:\n' + problemas.slice(0, 40).join('\n')); process.exit(1); }
console.log('\ncheck_pov: bien · hojas en out/pov');
