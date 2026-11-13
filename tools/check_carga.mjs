// Carga del juego con la red limitada: cuánto baja, cuánto tarda y cómo se ve la pantalla de carga.
//  - Mediciones (teléfono acostado 844 × 390, táctil, calidad automática Móvil): con la red de un 4G (9 Mbps, 85 ms) y de
//    una red lenta (1,6 Mbps, 150 ms), en una página nueva sin caché: primer cuadro con contenido, bienvenida a la vista,
//    modelos bajados (GLB y máscaras), y los bytes por tipo. El servidor comprime con brotli lo que Cloudflare comprime
//    (HTML, JS, CSS, JSON) y no los modelos, como Pages.
//  - Pantalla de carga (si la versión la tiene, #carga-prog): capturas al abrir, en la bienvenida (barrita de arriba), al
//    tocar «Jugar» con los modelos bajando (barra, porcentaje, frase) y 4,5 s después (otra frase), en 667 × 375, 844 × 390,
//    escritorio en inglés y con movimiento reducido; el pesista en siete instantes del arranque. Revisa que nada se salga
//    de la pantalla ni se pise, que el porcentaje suba, que la frase cambie y que la pantalla se vaya al terminar.
// Uso: node tools/check_carga.mjs [--web=web] [--etiqueta=despues] [--perfiles=4g,lenta] [--sin-capturas]
//   Escribe out/carga/<etiqueta>/: carga.json y las capturas. Con --web se mide otra copia de web/ (la versión anterior,
//   para comparar). Sale con error si hay errores de consola o si falla una revisión de la pantalla de carga.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchOptions } from './browser.mjs';
import { sinApi } from './sin_api.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const WEB = path.resolve(ROOT, arg('web') || 'web'), ETQ = arg('etiqueta') || 'despues', OUT = path.join(ROOT, 'out', 'carga', ETQ);
const PERFILES = { '4g': { mbps: 9, rtt: 85 }, lenta: { mbps: 1.6, rtt: 150 } };
const USAR = (arg('perfiles') || '4g,lenta').split(',').filter(p => PERFILES[p]), CAPTURAS = !process.argv.includes('--sin-capturas');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const COMPRIME = /\.(html|js|css|json|webmanifest|svg)$/;
const br = new Map();
const server = http.createServer((req, res) => {
  if (sinApi(req, res)) return;
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  const h = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
  if (COMPRIME.test(file) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
    if (!br.has(file)) br.set(file, zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }));
    const b = br.get(file); res.writeHead(200, { ...h, 'Content-Encoding': 'br', 'Content-Length': b.length }); res.end(b); return;
  }
  res.writeHead(200, { ...h, 'Content-Length': fs.statSync(file).size }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launchOptions());
const problemas = [], notas = [], R = { etiqueta: ETQ, web: path.relative(ROOT, WEB) || '.', perfiles: {}, capturas: [] };
const URL0 = 'juego.html?lang=es&dibujo=0&metricas=0';
// marca de tiempo del primer panel (la bienvenida) y del momento en que #msg queda oculto
const MARCAS = () => {
  window.__carga = { panel: null, oculto: [], pct: [] };
  new MutationObserver(() => {
    const c = window.__carga, p = document.querySelector('#capa .panel'), m = document.getElementById('msg');
    if (p && c.panel === null) c.panel = performance.now();
    if (m && m.hidden && (!c.oculto.length || c.oculto.at(-1).v === false)) c.oculto.push({ t: performance.now(), v: true }); else if (m && !m.hidden && c.oculto.length && c.oculto.at(-1).v) c.oculto.push({ t: performance.now(), v: false });
    const pct = document.getElementById('carga-pct')?.textContent; if (pct) c.pct.push(parseInt(pct, 10));
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
};

async function abrir({ w = 844, h = 390, dpr = 2, touch = true, perfil = null, reduced = false, url = URL0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(), tag = `[${w}x${h}${perfil ? ' ' + perfil : ''}${reduced ? ' reducido' : ''}]`;
  page.on('console', m => { if (m.type() === 'error') problemas.push(`${tag} console.error: ${m.text()}`); });
  page.on('pageerror', e => problemas.push(`${tag} pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) problemas.push(`${tag} HTTP ${r.status()}: ${r.url()}`); });
  if (perfil) {
    const P = PERFILES[perfil], cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.rtt, downloadThroughput: P.mbps * 1e6 / 8, uploadThroughput: 1e6 / 8 });
  }
  await page.addInitScript(MARCAS);
  await page.goto(base + url, { waitUntil: 'commit' });
  return { ctx, page, tag };
}
const espera = (page, fn, ms, arg) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const modelosBajados = () => { const r = performance.getEntriesByType('resource').filter(e => /\/models\/[^/?]+\.(glb|png|webp)$/.test(e.name) && !/detail_/.test(e.name)); return r.length >= 4 && r.every(e => e.responseEnd > 0) ? r : null; };

// ---------- mediciones ----------
for (const perfil of USAR) {
  const { ctx, page, tag } = await abrir({ perfil });
  const tope = perfil === 'lenta' ? 400000 : 120000;
  const okPanel = await espera(page, () => window.__carga?.panel !== null && window.__carga?.panel !== undefined, tope);
  const okMod = await espera(page, modelosBajados, tope);
  const m = await page.evaluate(() => {
    const rs = performance.getEntriesByType('resource'), cat = n => /\/models\/.*\.glb$/.test(n) ? 'modelos_glb' : /\/models\//.test(n) ? 'modelos_img' : /\.js$/.test(n) ? 'js' : /\.css$/.test(n) ? 'css' : /\.woff2$/.test(n) ? 'tipografias' : /\.json$/.test(n) ? 'datos' : 'otros';
    const bytes = {}, archivos = {};
    for (const e of rs) { const c = cat(new URL(e.name).pathname); bytes[c] = (bytes[c] || 0) + (e.transferSize || e.encodedBodySize || 0); }
    for (const e of rs.filter(e => /\/models\//.test(e.name))) archivos[new URL(e.name).pathname.slice(1)] = { bytes: e.encodedBodySize, fin_ms: Math.round(e.responseEnd) };
    const nav = performance.getEntriesByType('navigation')[0], fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const mod = rs.filter(e => /\/models\/[^/?]+\.(glb|png|webp)$/.test(e.name) && !/detail_/.test(e.name));
    return { fcp_ms: fcp ? Math.round(fcp.startTime) : null, html_ms: Math.round(nav?.responseEnd || 0), bienvenida_ms: window.__carga.panel === null ? null : Math.round(window.__carga.panel), modelos_ms: mod.length ? Math.round(Math.max(...mod.map(e => e.responseEnd))) : null, bytes, total_bytes: Object.values(bytes).reduce((a, b) => a + b, 0), archivos };
  });
  if (!okPanel) problemas.push(`${tag} la bienvenida no apareció`); if (!okMod) problemas.push(`${tag} los modelos no terminaron de bajar`);
  R.perfiles[perfil] = { ...PERFILES[perfil], ...m };
  const MB = n => (n / 1e6).toFixed(2);
  console.log(`CARGA ${ETQ} ${perfil} (${PERFILES[perfil].mbps} Mbps, ${PERFILES[perfil].rtt} ms): primer cuadro ${m.fcp_ms} ms · bienvenida ${m.bienvenida_ms} ms · modelos bajados ${m.modelos_ms} ms · ${MB(m.total_bytes)} MB en total (` + Object.entries(m.bytes).map(([k, v]) => `${k} ${MB(v)}`).join(', ') + ')');
  console.log('  ' + Object.entries(m.archivos).map(([k, v]) => `${k} ${MB(v.bytes)} MB a los ${v.fin_ms} ms`).join(' · '));
  await ctx.close();
}

// ---------- pantalla de carga ----------
async function revisar(page, donde) {
  const r = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, m = document.getElementById('msg'); if (!m || m.hidden) return { oculto: true };
    const sel = ['.lev', '.carga-marca', '#msg-txt', '.carga-fila', '#carga-det', '#carga-dato'], cajas = [];
    for (const s of sel) { const e = m.querySelector(s); if (!e) continue; const c = getComputedStyle(e); if (c.display === 'none' || (s === '#msg-txt' && !e.textContent)) continue; const b = e.getBoundingClientRect(); cajas.push({ s, x: b.x, y: b.y, w: b.width, h: b.height, txt: e.textContent.trim().slice(0, 80) }); }
    return { W, H, cajas, scroll: document.scrollingElement.scrollHeight > H + 1 };
  });
  if (r.oculto) return r;
  for (const c of r.cajas) if (c.x < -1 || c.y < -1 || c.x + c.w > r.W + 1 || c.y + c.h > r.H + 1) problemas.push(`${donde}: ${c.s} se sale de la pantalla (${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}x${Math.round(c.h)} en ${r.W}x${r.H})`);
  for (let i = 0; i < r.cajas.length; i++) for (let j = i + 1; j < r.cajas.length; j++) {
    const a = r.cajas[i], b = r.cajas[j], ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 1 && iy > 1) problemas.push(`${donde}: ${a.s} pisa a ${b.s}`);
  }
  if (r.scroll) problemas.push(`${donde}: la página se desplaza`);
  return r;
}
const nueva = await (async () => { const { ctx, page } = await abrir({ url: URL0 }); const s = await espera(page, () => !!document.getElementById('carga-prog'), 30000); await ctx.close(); return s; })();
if (!nueva) notas.push('esta versión no tiene la pantalla de carga nueva: solo mediciones');
let nCap = 0;
const foto = async (page, nombre, clip) => { const f = `${String(++nCap).padStart(2, '0')}_${nombre}.png`; await page.screenshot({ path: path.join(OUT, f), ...(clip ? { clip } : {}) }).catch(() => null); R.capturas.push(f); return f; };
if (nueva && CAPTURAS) {
  const CASOS = [{ nombre: '667x375', w: 667, h: 375, dpr: 2 }, { nombre: '844x390', w: 844, h: 390, dpr: 3 }, { nombre: 'escritorio_en', w: 1280, h: 720, dpr: 1, touch: false, url: URL0.replace('lang=es', 'lang=en') }, { nombre: '844x390_reducido', w: 844, h: 390, dpr: 3, reduced: true }];
  for (const C of CASOS) {
    const { ctx, page, tag } = await abrir({ ...C, perfil: 'lenta' });
    // al abrir: el HTML y su CSS ya muestran el pesista, antes de que baje el juego
    await espera(page, () => document.getElementById('msg') && document.fonts.status === 'loaded', 30000); await page.waitForTimeout(700);
    await foto(page, `${C.nombre}_abriendo`); await revisar(page, `${tag} al abrir`);
    if (!await espera(page, () => window.__carga.panel !== null, 120000)) { problemas.push(`${tag} no llegó a la bienvenida`); await ctx.close(); continue; }
    await page.waitForTimeout(600); await foto(page, `${C.nombre}_bienvenida`);
    const mini = await page.evaluate(() => { const e = document.getElementById('carga-mini'); return e && !e.hidden ? e.firstElementChild.style.width : null; });
    if (mini === null) notas.push(`${tag} la barrita de arriba no se vio en la bienvenida (¿ya había bajado todo?)`);
    // «Jugar» con los modelos todavía bajando (y lo que pida en el camino) hasta que aparece la pantalla de carga
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate(() => !document.getElementById('msg').hidden)) break;
      const b = page.locator('#capa #btn-empezar, #capa .panel button.ir').first(); if (!(await b.count())) { await page.waitForTimeout(300); continue; }
      if (C.touch === false) await b.click(); else await b.tap(); await page.waitForTimeout(500);
    }
    const vis = await espera(page, () => !document.getElementById('msg').hidden, 5000);
    if (!vis) { notas.push(`${tag} la pantalla de carga no volvió al tocar Jugar (¿ya estaban los modelos?)`); await ctx.close(); continue; }
    await page.waitForTimeout(900); const d0 = await page.textContent('#carga-dato'), p0 = await page.textContent('#carga-pct');
    await foto(page, `${C.nombre}_jugar_bajando`); await revisar(page, `${tag} bajando`);
    await page.waitForTimeout(4600); const d1 = await page.textContent('#carga-dato'), p1 = await page.textContent('#carga-pct');
    await foto(page, `${C.nombre}_jugar_4s`);
    if (d0 === d1) problemas.push(`${tag} la frase no cambió en 4,6 s («${d0}»)`);
    if (p0 && p1 && parseInt(p1, 10) < parseInt(p0, 10)) problemas.push(`${tag} el porcentaje bajó: ${p0} → ${p1}`);
    console.log(`${tag} bajando: ${p0} → ${p1} · «${d0}» → «${d1}»`);
    const fuera = await espera(page, () => document.getElementById('msg').hidden, 400000);
    if (!fuera) problemas.push(`${tag} la pantalla de carga no se fue al terminar de bajar`);
    const pcts = await page.evaluate(() => window.__carga.pct); if (pcts.some((x, i) => i && x < pcts[i - 1])) problemas.push(`${tag} el porcentaje no fue siempre para arriba: ${pcts.join(' ')}`);
    await page.waitForTimeout(500); await foto(page, `${C.nombre}_despues`);
    await ctx.close();
  }
  // el pesista: siete instantes del arranque, con la animación detenida
  {
    const { ctx, page } = await abrir({ w: 844, h: 390, dpr: 3 });
    await espera(page, () => document.querySelector('#msg .lev'), 20000);
    const caja = await page.evaluate(() => { const b = document.querySelector('#msg .lev').getBoundingClientRect(); return { x: b.x - 10, y: b.y - 6, width: b.width + 20, height: b.height + 12 }; });
    for (const f of [0, .3, .4, .46, .56, .82, .95]) {
      await page.evaluate(f => { for (const a of document.getAnimations()) if (/^lev-/.test(a.animationName || '')) { a.pause(); a.currentTime = f * 3600; } }, f);
      await page.waitForTimeout(80); await foto(page, `pesista_${String(Math.round(f * 100)).padStart(2, '0')}`, caja);
    }
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'carga.json'), JSON.stringify({ ...R, problemas, notas }, null, 1));
await browser.close(); server.close();
for (const n of notas) console.log('NOTA ' + n);
for (const p of problemas) console.log('MAL ' + p);
console.log(problemas.length ? `check_carga: ${problemas.length} problemas` : `check_carga ${ETQ}: OK (${R.capturas.length} capturas en out/carga/${ETQ})`);
process.exit(problemas.length ? 1 : 0);
