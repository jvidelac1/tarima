// Sitio de Tarima en local, como en Cloudflare pero sin cuenta: sirve web/ (lo que hace Pages) y pasa /api/*, /qx/*,
// /baja y /confirmar por functions/_reenviar.js al Worker de verdad (worker/src/index.js), que corre en Node con:
//  - una base D1 falsa sobre node:sqlite (en memoria, o en un archivo con --db=...), con las migraciones de worker/migraciones;
//  - las variables de worker/wrangler.jsonc (GRATIS, TOPE_IP…) y secretos al azar de esta corrida;
//  - el DNS de los correos respondido acá (todo dominio recibe correo salvo los que contienen «noexiste»), sin red;
//  - sin PostHog (sin POSTHOG_KEY: el Worker no manda nada y el juego no carga posthog-js).
// Sirve para jugar el flujo completo (finales gratis, muro, encuesta, lista) en la máquina y para las pruebas de punta a
// punta en GitHub Actions (tools/check_muro.mjs). No es el runtime de Workers: eso lo prueba `cd worker && npm test`.
//
// Uso: node tools/servidor_local.mjs [--puerto=8000] [--db=out/tarima_local.sqlite] [--var=GRATIS=1] [--ip-de-cabecera]
//   --ip-de-cabecera: la IP del visitante sale de la cabecera x-prueba-ip (las pruebas simulan otra red); si no, del socket.
// Necesita Node 22.13 o más nuevo (node:sqlite).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), WEB = path.join(ROOT, 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

/** D1 falsa: lo que usa worker/src/datos.js (prepare, bind, first, all, run, batch) sobre node:sqlite. */
export function d1Falsa(archivo = ':memory:') {
  const { DatabaseSync } = globalThis.process.getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(archivo);
  const nuevo = archivo === ':memory:' || !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dispositivos'").get();
  if (nuevo) for (const f of fs.readdirSync(path.join(ROOT, 'worker/migraciones')).filter(x => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(ROOT, 'worker/migraciones', f), 'utf8'));
  const norm = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const fila = r => (r ? { ...r } : null);
  class Sentencia {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...a) { return new Sentencia(this.sql, a.map(norm)); }
    _st() { return db.prepare(this.sql); }
    async first(col) { const r = fila(this._st().get(...this.params)); return col ? (r ? r[col] : null) : r; }
    async all() { const st = this._st(); const lee = /^\s*(SELECT|WITH)|\bRETURNING\b/i.test(this.sql); if (lee) return { success: true, results: st.all(...this.params).map(fila), meta: { changes: 0 } }; const r = st.run(...this.params); return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    async run() { return this.all(); }
    async raw() { return this._st().all(...this.params).map(r => Object.values(r)); }
  }
  return {
    prepare: sql => new Sentencia(sql),
    async batch(sts) { db.exec('BEGIN'); try { const out = []; for (const s of sts) out.push(await s.all()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
    cerrar: () => db.close(),
  };
}

/** Variables de worker/wrangler.jsonc (sin comentarios). */
function varsDelWorker() {
  const txt = fs.readFileSync(path.join(ROOT, 'worker/wrangler.jsonc'), 'utf8').replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s || '').replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(txt).vars || {};
}

/** DNS de los correos sin red: todo dominio recibe correo, salvo los que contienen «noexiste». */
function instalarDnsFalso() {
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    const u = new URL(typeof url === 'string' ? url : url.url);
    if (u.hostname === 'cloudflare-dns.com') {
      const nombre = u.searchParams.get('name') || '', no = /noexiste/.test(nombre);
      return new Response(JSON.stringify(no ? { Status: 3 } : { Status: 0, Answer: [{ type: 15, data: `10 mx.${nombre}.` }] }), { headers: { 'content-type': 'application/dns-json' } });
    }
    if (/posthog\.com$/.test(u.hostname)) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });      // nunca sale nada
    return fetchReal(url, o);
  };
}

/**
 * Arranca el sitio. Devuelve {url, cerrar, env, db}.
 * @param {{puerto?:number, db?:string, vars?:object, ipDeCabecera?:boolean, silencio?:boolean}} o
 */
export async function iniciarServidorLocal(o = {}) {
  instalarDnsFalso();
  const worker = (await import(pathToFileURL(path.join(ROOT, 'worker/src/index.js')).href)).default;
  const { reenviar } = await import(pathToFileURL(path.join(ROOT, 'functions/_reenviar.js')).href);
  const db = d1Falsa(o.db || ':memory:');
  const azar = () => crypto.randomBytes(32).toString('hex');
  const env = { ...varsDelWorker(), SECRETO_IP: azar(), SECRETO_DISPOSITIVO: azar(), SECRETO_PASE: azar(), SECRETO_BAJA: azar(), ...(o.vars || {}), DB: db };
  delete env.POSTHOG_KEY;
  const pendientes = new Set();
  const ctx = { waitUntil: p => { const x = Promise.resolve(p).catch(() => null).finally(() => pendientes.delete(x)); pendientes.add(x); }, passThroughOnException() {} };
  const TARIMA = { fetch: req => worker.fetch(req, env, ctx) };
  const silencio = o.silencio ?? false;
  if (silencio) { const log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('{"')) return; log(...a); }; }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`), p = url.pathname;
      if (p.startsWith('/api/') || p.startsWith('/qx/') || p === '/qx' || p === '/baja' || p === '/confirmar') {
        const partes = []; for await (const c of req) partes.push(c);
        const h = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !/^(host|connection|transfer-encoding|keep-alive)$/i.test(k)) h.set(k, Array.isArray(v) ? v.join(', ') : v);
        const ip = (o.ipDeCabecera && req.headers['x-prueba-ip']) || req.socket.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1';
        h.set('cf-connecting-ip', ip); h.delete('x-prueba-ip');
        const cuerpo = partes.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(partes) : undefined;
        const request = new Request(url, { method: req.method, headers: h, body: cuerpo });
        Object.defineProperty(request, 'cf', { value: { country: 'AR' } });
        const r = await reenviar({ request, env: { TARIMA } });
        const hs = {}; r.headers.forEach((v, k) => { hs[k] = v; });
        const sc = r.headers.getSetCookie?.(); if (sc && sc.length) hs['set-cookie'] = sc;
        res.writeHead(r.status, hs); res.end(Buffer.from(await r.arrayBuffer())); return;
      }
      // Pages: «/» muestra el juego; lo demás, los archivos de web/
      const rel = decodeURIComponent(p === '/' ? '/juego.html' : p), file = path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
      if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error('servidor_local:', e); if (!res.headersSent) res.writeHead(500); res.end('error');
    }
  });
  await new Promise(r => server.listen(o.puerto ?? 0, o.host || '127.0.0.1', r));
  const url = `http://${o.host === '0.0.0.0' ? 'localhost' : '127.0.0.1'}:${server.address().port}/`;
  return { url, env, db, cerrar: async () => { await Promise.all([...pendientes]); await new Promise(r => server.close(r)); db.cerrar(); } };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
  const vars = {}; for (const a of process.argv.filter(x => x.startsWith('--var='))) { const [k, ...v] = a.slice(6).split('='); vars[k] = v.join('='); }
  const s = await iniciarServidorLocal({ puerto: +arg('puerto') || 8000, db: arg('db') || undefined, vars, ipDeCabecera: process.argv.includes('--ip-de-cabecera'), host: process.argv.includes('--red') ? '0.0.0.0' : '127.0.0.1' });
  console.log(`Tarima en ${s.url} (Worker de verdad sobre una D1 falsa${arg('db') ? ' en ' + arg('db') : ' en memoria'}; GRATIS=${s.env.GRATIS}, TOPE_IP=${s.env.TOPE_IP}). Con --red se ve desde el teléfono en la misma red.`);
}
