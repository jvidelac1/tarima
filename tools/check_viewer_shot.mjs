// Captura suelta para iterar sobre el look: node tools/check_viewer_shot.mjs "<query>" "<js a evaluar>" salida.png [ancho alto]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright-core'; import { launchOptions } from './browser.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const [query = '', code = '', out = 'out/viewer/shot.png', W = '1600', H = '900'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() !== 'log') console.log(`[${m.type()}] ${m.text().slice(0, 1500)}`); else console.log(m.text().slice(0, 1500)); }); page.on('pageerror', e => console.log('[pageerror] ' + e.message));
page.on('response', r => { if (r.status() >= 400) console.log(`[HTTP ${r.status()}] ${r.url()}`); });
await page.goto(`http://127.0.0.1:${server.address().port}/?auto=0&${query}`); await page.evaluate(() => window.TARIMA.ready);
const outs = out.split(','), codes = code.split('@@');
for (let i = 0; i < outs.length; i++) {
  if (codes[i]) { const r = await page.evaluate(`(async()=>{${codes[i]}})()`); if (r !== undefined) console.log(JSON.stringify(r)); }
  await page.waitForTimeout(500); fs.mkdirSync(path.dirname(path.resolve(ROOT, outs[i])), { recursive: true }); await page.screenshot({ path: path.resolve(ROOT, outs[i]), timeout: 120000 });
}
await browser.close(); server.close();
