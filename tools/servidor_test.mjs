// Prueba del cliente del servidor y de las métricas, en Node y SIN red. Uso: node tools/servidor_test.mjs
//  1. web/js/game/servidor.js contra un Worker falso: estado, copia local, pase con reintentos, «sin servidor» solo con
//     historia limpia (docs/MVP.md 7, endurecimiento 1), 429 y 503, reanudar una final una sola vez, lista, encuesta,
//     baja, modo sin API en localhost y `?muro=firme`.
//  2. web/js/game/analitica.js con un PostHog falso: no-op sin clave, cola antes de iniciar, configuración sin cookies,
//     identify con lista_id, banderas, propiedades sin datos personales, interruptor de la privacidad, y la grabación de
//     sesión (6.6): sorteo por la bandera `grabacion`, sin lienzo, campos y nombre tapados, nada sin medición.
//  3. Las Functions de Pages (functions/): pasan /api/* al Worker con la IP y el país en cabeceras propias, y «/» muestra
//     el juego.
//  1b. La regla del arranque gratis (GRATIS_ETAPA='arranque', docs/MVP.md 5.5) con el Worker de verdad (worker/src/index.js)
//     en Node sobre la D1 falsa de tools/servidor_local.mjs, y con este cliente hablándole: arranque gratis una vez, dos
//     tiempos negado sin correo, permitido tras anotarse y tras la encuesta, recarga en el intervalo, otra pestaña, otro
//     dispositivo en la misma IP, la API a mano y la regla vieja por variable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor, expDelPase, etapaDelPase, pareceCorreo, sugerirCorreo, CONSENTIMIENTO } from '../web/js/game/servidor.js';
import { crearAnalitica, nombreVisible, limpiarProps, fuenteTrafico, dominioReferente, detalleError, proporcionGrabacion, taparTexto, taparAtributo, BLOQUEO_GRABACION, BANDERAS } from '../web/js/game/analitica.js';
import { reenviar } from '../functions/_reenviar.js';
import { onRequest as raiz } from '../functions/index.js';
import { VERSIONES_CONSENTIMIENTO } from '../worker/src/reglas.js';
import worker from '../worker/src/index.js';
import { d1Falsa, varsDelWorker } from './servidor_local.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fallas = []; let n = 0;
const ok = (c, msg) => { n++; if (!c) { fallas.push(msg); console.log('  MAL: ' + msg); } };
const igual = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// Ninguna salida a la red en todo el archivo.
globalThis.fetch = async u => { throw new Error('salida a la red no esperada: ' + u); };

class Mem {
  constructor(o = {}) { this.m = new Map(Object.entries(o)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

const b64url = s => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const paseFalso = (exp, n = 1) => `v1.${b64url(JSON.stringify({ d: 'abc', n, f: 'gratis', exp }))}.firma`;
const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// Worker falso: `respuestas[ruta]` es una lista de respuestas (o funciones) que se van consumiendo.
function workerFalso(respuestas) {
  const pedidos = [];
  const fetch = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    pedidos.push({ url, cuerpo, init });
    const cola = respuestas[url];
    let r = Array.isArray(cola) ? cola.shift() : cola;
    if (typeof r === 'function') r = r(cuerpo);
    if (r === 'red') throw new TypeError('Failed to fetch');
    if (r == null) throw new Error('pedido no esperado: ' + url);
    const [status, j] = r;
    return new Response(j === null ? 'no es json' : JSON.stringify(j), { status, headers: { 'content-type': j === null ? 'text/html' : 'application/json' } });
  };
  return { fetch, pedidos };
}
const sinEspera = async () => {};
const base = o => crearServidor({ host: 'liftinggame.pages.dev', buscar: '', esperar: sinEspera, local: new Mem(), sesion: new Mem(), ...o });

// ---------- 1. servidor.js ----------

igual(CONSENTIMIENTO, '2026-11-c', 'versión del consentimiento');
ok(VERSIONES_CONSENTIMIENTO.has(CONSENTIMIENTO), 'el Worker acepta la versión que manda el juego');
ok(['2026-11-a', '2026-11-b'].every(v => VERSIONES_CONSENTIMIENTO.has(v)), 'el Worker sigue aceptando las versiones anteriores');
{
  const priv = fs.readFileSync(path.join(ROOT, 'web/privacidad.html'), 'utf8');
  ok((priv.match(new RegExp(`class="version">(Versión|Version) ${CONSENTIMIENTO} `, 'g')) || []).length === 2, 'la privacidad muestra la misma versión en los dos idiomas');
}
ok(pareceCorreo('ana@ejemplo.com') && !pareceCorreo('ana@ejemplo') && !pareceCorreo('ana ejemplo.com') && !pareceCorreo('a@b.c'), 'pareceCorreo');
igual(sugerirCorreo('ana@gmial.com'), 'ana@gmail.com', 'sugerencia gmial');
igual(sugerirCorreo('ana@hotmail.con'), 'ana@hotmail.com', 'sugerencia .con');
igual(sugerirCorreo('ana@gmail.com'), null, 'sin sugerencia para un dominio bien escrito');
igual(sugerirCorreo('ana@empresa-propia.com'), null, 'sin sugerencia para un dominio lejano');
igual(expDelPase(paseFalso(1234)), 1234, 'exp del pase');
igual(expDelPase('basura'), null, 'pase inválido');

// estado: guarda el dispositivo, la copia y devuelve lo del Worker
{
  const local = new Mem();
  const w = workerFalso({ '/api/estado': [[200, { dispositivo: UUID, puede: true, quedan: 2, lista: false, encuesta_disponible: true, flags: { 'muro-texto': 'b' }, contexto: { pais: 'AR', previas: 0, dias: '0' }, metricas: null }]] });
  const s = base({ fetch: w.fetch, local });
  const e = await s.estado({ idioma: 'es' });
  igual([e.fuente, e.puede, e.quedan], ['servidor', true, 2], 'estado del servidor');
  igual(local.getItem('tarima.dispositivo'), UUID, 'guarda el dispositivo que devuelve el Worker (gana la cookie)');
  igual(s.copia(), { muro: false, quedan: 2, lista: false, motivo: null }, 'copia local después del estado');
  igual(w.pedidos[0].init.method, 'POST', 'estado es POST');
  igual(w.pedidos[0].init.headers['content-type'], 'application/json', 'estado manda JSON');
  ok(/^[0-9a-f-]{36}$/.test(w.pedidos[0].cuerpo.dispositivo), 'manda un UUID generado por el navegador');
}

// estado sin respuesta: vale la copia (muro incluido)
{
  const local = new Mem({ 'tarima.dispositivo': UUID, 'tarima.muro': '1', 'tarima.quedan': '0', 'tarima.motivo': 'ip' });
  const s = base({ fetch: workerFalso({ '/api/estado': ['red'] }).fetch, local });
  const e = await s.estado({ idioma: 'es' });
  igual([e.fuente, e.puede, e.motivo, e.error], ['copia', false, 'ip', 'red'], 'sin servidor, la copia dice muro');
}

// pase: ok guarda el pase en la pestaña y la copia; la última final deja la copia en muro
{
  const local = new Mem(), sesion = new Mem();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const w = workerFalso({ '/api/partida': [[200, { estado: 'ok', pase: paseFalso(exp, 2), fuente: 'gratis', quedan: 0, n: 2, dispositivo: UUID, flags: {}, contexto: {} }]] });
  const s = base({ fetch: w.fetch, local, sesion });
  const r = await s.pedirPase({ idioma: 'es' });
  igual([r.estado, r.n, r.quedan], ['ok', 2, 0], 'pase ok');
  igual(s.copia().muro, true, 'después de la última final gratis la copia ya dice muro');
  const p = JSON.parse(sesion.getItem('tarima.pase'));
  igual([p.n, p.exp, p.reanudado], [2, exp, false], 'pase guardado en sessionStorage');
  // Recargar en medio: se reanuda una vez; la segunda, no. Al recargar, la página vieja suelta el pase (pagehide).
  s.soltarPase();
  const s2 = base({ fetch: w.fetch, local, sesion });
  igual(s2.paseParaReanudar()?.n, 2, 'primera recarga: reanuda la misma final');
  igual(s2.paseParaReanudar(), null, 'segunda recarga: la final ya se dio por gastada');
  igual(sesion.getItem('tarima.pase'), null, 'y el pase se borra');
  // Pase vencido no se reanuda; el podio lo borra.
  sesion.setItem('tarima.pase', JSON.stringify({ pase: 'x', n: 1, exp: 10, reanudado: false }));
  igual(s2.paseParaReanudar(), null, 'pase vencido no se reanuda');
  sesion.setItem('tarima.pase', JSON.stringify({ pase: 'x', n: 1, exp: exp, reanudado: false }));
  s2.finalTerminada();
  igual(s2.paseParaReanudar(), null, 'después del podio no hay nada que reanudar');
}

// Duplicar pestaña copia el sessionStorage: mientras la original juega la final, ninguna copia la reanuda (el pase
// vivo está en localStorage y lo comparten todas las pestañas). Con un solo pase, una sola final.
{
  class Copiable extends Mem { copiar() { return new Copiable(Object.fromEntries(this.m)); } }
  const local = new Mem(), sesion = new Copiable();
  let t = Date.now();
  const exp = Math.floor(t / 1000) + 3 * 3600;
  const w = workerFalso({ '/api/partida': [[200, { estado: 'ok', pase: paseFalso(exp, 2), fuente: 'gratis', quedan: 0, n: 2, dispositivo: UUID }]] });
  const orig = base({ fetch: w.fetch, local, sesion, ahora: () => t });
  igual((await orig.pedirPase({ idioma: 'es' })).estado, 'ok', 'duplicar: la original pide su pase');
  let reanudadas = 0;
  for (let k = 0; k < 5; k++) if (base({ fetch: w.fetch, local, sesion: sesion.copiar(), ahora: () => t }).paseParaReanudar()) reanudadas++;
  igual([reanudadas, w.pedidos.length], [0, 1], 'duplicar: 5 copias de la pestaña mientras la original juega no reanudan nada');
  // La copia hecha mientras la original jugaba guarda el pase; ni cuando la original termina sirve.
  const copia = sesion.copiar();
  orig.finalTerminada();
  igual(local.getItem('tarima.pase_vivo'), null, 'duplicar: el podio borra el pase vivo');
  igual(base({ fetch: w.fetch, local, sesion: copia, ahora: () => t }).paseParaReanudar(), null, 'duplicar: después del podio, la copia no reanuda');
}
{
  // La original murió sin avisar (sin pagehide): pasados 2 minutos sin latido, la recarga de esa pestaña reanuda; antes, no.
  class Copiable extends Mem { copiar() { return new Copiable(Object.fromEntries(this.m)); } }
  const local = new Mem(), sesion = new Copiable();
  let t = Date.now();
  const exp = Math.floor(t / 1000) + 3 * 3600;
  const w = workerFalso({ '/api/partida': [[200, { estado: 'ok', pase: paseFalso(exp, 1), fuente: 'gratis', quedan: 1, n: 1, dispositivo: UUID }]] });
  const orig = base({ fetch: w.fetch, local, sesion, ahora: () => t });
  await orig.pedirPase({ idioma: 'es' });
  const dup = sesion.copiar();
  t += 30000;
  igual(base({ fetch: w.fetch, local, sesion: dup, ahora: () => t }).paseParaReanudar(), null, 'duplicar: con latido de hace 30 s no se reanuda');
  t += 120000;
  const s3 = base({ fetch: w.fetch, local, sesion, ahora: () => t });
  igual(s3.paseParaReanudar()?.n, 1, 'sin latido hace más de 2 min, la recarga reanuda');
  igual(base({ fetch: w.fetch, local, sesion: sesion.copiar(), ahora: () => t }).paseParaReanudar(), null, 'y duplicar la pestaña reanudada no da otra');
  // Dos finales en dos pestañas (dos pases): cada una se reanuda en la suya.
  const w2 = workerFalso({ '/api/partida': [[200, { estado: 'ok', pase: paseFalso(exp, 2).replace(/firma$/, 'otra'), fuente: 'gratis', quedan: 0, n: 2, dispositivo: UUID }]] });
  const sesB = new Mem(), b = base({ fetch: w2.fetch, local, sesion: sesB, ahora: () => t });
  await b.pedirPase({ idioma: 'es' });
  s3.soltarPase(); b.soltarPase();
  igual(Object.keys(JSON.parse(local.getItem('tarima.pase_vivo'))).sort(), ['firma', 'otra'], 'dos pases vivos a la vez');
  igual(base({ fetch: w2.fetch, local, sesion: sesB, ahora: () => t }).paseParaReanudar()?.n, 2, 'la segunda pestaña reanuda la suya');
}


// envion: permiso del dos tiempos, con reintentos; el pase nuevo queda en la pestaña
{
  const local = new Mem(), sesion = new Mem();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const paseA = `v1.${b64url(JSON.stringify({ d: 'abc', n: 1, f: 'gratis', e: 'arranque', p: 1, exp }))}.firmaA`;
  const paseC = `v1.${b64url(JSON.stringify({ d: 'abc', n: 1, f: 'gratis', e: 'completa', p: 1, exp }))}.firmaC`;
  const w = workerFalso({
    '/api/partida': [[200, { estado: 'ok', pase: paseA, fuente: 'gratis', etapa: 'arranque', quedan: 0, n: 1, dispositivo: UUID }]],
    '/api/envion': [[200, { estado: 'muro', motivo: 'envion', encuesta_disponible: true }], 'red', [503, { error: 'servidor' }], [200, { estado: 'ok', via: 'lista', pase: paseC, lista: true, quedan: null }], [400, { error: 'pase' }]],
  });
  const esperas = [];
  const s = base({ fetch: w.fetch, local, sesion, esperar: async ms => { esperas.push(ms); } });
  igual((await s.envion({})).error, 'pase', 'envion sin pase en la pestaña: error sin pedir nada');
  const p = await s.pedirPase({});
  igual([p.etapa, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['arranque', 'arranque'], 'el pase guarda la etapa');
  const m = await s.envion({ idioma: 'es' });
  igual([m.estado, m.motivo, m.encuesta_disponible, w.pedidos.at(-1).cuerpo.pase], ['muro', 'envion', true, paseA], 'envion: muro, mandando el pase de la pestaña');
  const o = await s.envion({});
  igual([o.estado, o.via, esperas], ['ok', 'lista', [1000, 2000]], 'envion: reintenta la red y los 5xx');
  igual([JSON.parse(sesion.getItem('tarima.pase')).pase, JSON.parse(sesion.getItem('tarima.pase')).etapa, s.copia().lista], [paseC, 'completa', true], 'envion: el pase nuevo queda en la pestaña');
  igual(Object.keys(JSON.parse(local.getItem('tarima.pase_vivo'))), ['firmaC'], 'envion: el pase vivo pasa al nuevo');
  igual((await s.envion({})).error, 'pase', 'envion: 400 pase');
  // Sin API en localhost no hay muro ni permiso que pedir.
  const sa = base({ fetch: workerFalso({ '/api/estado': [[501, null]] }).fetch, host: 'localhost' });
  await sa.estado({});
  igual((await sa.envion({})).estado, 'ok', 'sin API: el dos tiempos se juega');
}
{
  // Recargar con el pase del arranque gratis: no se reanuda (reanudar empieza la final de cero y regalaría otro arranque).
  const local = new Mem(), sesion = new Mem();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  sesion.setItem('tarima.pase', JSON.stringify({ pase: 'v1.x.f1', n: 1, fuente: 'gratis', etapa: 'arranque', exp, reanudado: false }));
  local.setItem('tarima.pase_vivo', JSON.stringify({ f1: { c: 'otra', t: Date.now() - 1000, suelto: true, exp } }));
  igual(base({ local, sesion }).paseParaReanudar(), null, 'el arranque gratis no se reanuda');
  igual([sesion.getItem('tarima.pase'), local.getItem('tarima.pase_vivo')], [null, null], 'y su pase se borra');
}
{
  // Pestaña que pidió el pase con el juego anterior (sin `etapa` guardada) y recarga con el nuevo: manda la del pase.
  const local = new Mem(), sesion = new Mem();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const paseA = `v1.${b64url(JSON.stringify({ d: 'abc', n: 1, f: 'gratis', e: 'arranque', p: 7, exp }))}.fA`;
  igual([etapaDelPase(paseA), etapaDelPase(paseFalso(exp)), etapaDelPase('basura')], ['arranque', null, null], 'etapa del pase');
  sesion.setItem('tarima.pase', JSON.stringify({ pase: paseA, n: 1, fuente: 'gratis', exp, reanudado: false }));
  local.setItem('tarima.pase_vivo', JSON.stringify({ fA: { c: 'otra', t: Date.now() - 1000, suelto: true, exp } }));
  igual(base({ local, sesion }).paseParaReanudar(), null, 'pase del arranque guardado por el juego anterior: no se reanuda');
  const paseC = `v1.${b64url(JSON.stringify({ d: 'abc', n: 2, f: 'gratis', e: 'completa', p: 8, exp }))}.fC`;
  sesion.setItem('tarima.pase', JSON.stringify({ pase: paseC, n: 2, fuente: 'gratis', exp, reanudado: false }));
  local.setItem('tarima.pase_vivo', JSON.stringify({ fC: { c: 'otra', t: Date.now() - 1000, suelto: true, exp } }));
  igual(base({ local, sesion }).paseParaReanudar()?.etapa, 'completa', 'y uno completo sin etapa guardada sí se reanuda');
}

// pase: muro
{
  const local = new Mem();
  const s = base({ fetch: workerFalso({ '/api/partida': [[200, { estado: 'muro', motivo: 'ip', encuesta_disponible: true, dispositivo: UUID }]] }).fetch, local });
  const r = await s.pedirPase({ idioma: 'en' });
  igual([r.estado, r.motivo, r.encuesta_disponible], ['muro', 'ip', true], 'muro del servidor');
  igual(s.copia(), { muro: true, quedan: 0, lista: false, motivo: 'ip' }, 'copia en muro');
}

// pase: reintentos (2 en 3 s) y después «sin servidor» UNA vez, solo con historia limpia
{
  const w = workerFalso({ '/api/partida': ['red', [503, { error: 'servidor' }], [200, { estado: 'ok', pase: paseFalso(9e9), fuente: 'gratis', quedan: 1, n: 1 }]] });
  const esperas = [];
  const s = base({ fetch: w.fetch, esperar: async ms => { esperas.push(ms); } });
  igual((await s.pedirPase({})).estado, 'ok', 'tercer intento sale bien');
  igual(esperas, [1000, 2000], 'dos reintentos en 3 s');
}
{
  // Dispositivo nuevo (no había nada al cargar): una final sin servidor por carga, la segunda no.
  const w = workerFalso({ '/api/partida': () => 'red' });
  const s = base({ fetch: w.fetch });
  const a = await s.pedirPase({}), b = await s.pedirPase({});
  igual([a.estado, a.fuente, b.estado, b.error], ['sin_servidor', 'sin_servidor', 'error', 'red'], 'historia limpia: una sola final sin servidor por carga');
  igual(w.pedidos.length, 6, 'cada pedido se intentó 3 veces');
}
{
  // Ya había dispositivo al cargar: sin servidor se niega (docs/MVP.md 7, endurecimiento 1).
  const s = base({ fetch: workerFalso({ '/api/partida': () => [503, { error: 'servidor' }] }).fetch, local: new Mem({ 'tarima.dispositivo': UUID }) });
  const r = await s.pedirPase({});
  igual([r.estado, r.error], ['error', 'servidor'], 'con historia, un 503 no regala una final');
}
{
  // 429: no se reintenta y tampoco regala finales a quien ya jugó.
  const w = workerFalso({ '/api/partida': () => [429, { error: 'limite' }] });
  const s = base({ fetch: w.fetch, local: new Mem({ 'tarima.dispositivo': UUID }) });
  const r = await s.pedirPase({});
  igual([r.estado, r.error, w.pedidos.length], ['error', 'limite', 1], '429 sin reintento y sin final gratis');
}
{
  // Anotado según la copia: juega igual aunque el servidor no conteste.
  const s = base({ fetch: workerFalso({ '/api/partida': () => 'red' }).fetch, local: new Mem({ 'tarima.dispositivo': UUID, 'tarima.lista': '1' }) });
  const r = await s.pedirPase({});
  igual([r.estado, r.fuente], ['sin_servidor', 'lista'], 'anotado juega sin servidor');
}
{
  // La copia dice muro: muro, sin encuesta (no se podría mandar).
  const s = base({ fetch: workerFalso({ '/api/partida': () => 'red' }).fetch, local: new Mem({ 'tarima.muro': '1', 'tarima.motivo': 'dispositivo' }) });
  const r = await s.pedirPase({});
  igual([r.estado, r.encuesta_disponible], ['muro', false], 'copia en muro y sin red: muro sin encuesta');
}
{
  // Una página que no es el Worker (HTML) fuera de localhost cuenta como falla del servidor, no como «sin API».
  const s = base({ fetch: workerFalso({ '/api/partida': () => [404, null] }).fetch, local: new Mem({ 'tarima.dispositivo': UUID }) });
  igual((await s.pedirPase({})).estado, 'error', 'un 404 en producción no abre el modo sin API');
}

// localhost con el servidor estático de Python: sin límite (las pruebas del juego)
{
  const w = workerFalso({ '/api/estado': [[501, null]], '/api/partida': [] });
  const s = base({ fetch: w.fetch, host: 'localhost' });
  const e = await s.estado({});
  igual([e.fuente, e.puede, s.modo], ['sin_api', true, 'sin_api'], 'localhost sin API');
  const r1 = await s.pedirPase({}), r2 = await s.pedirPase({}), r3 = await s.pedirPase({});
  igual([r1.estado, r2.estado, r3.estado, r3.n, w.pedidos.length], ['ok', 'ok', 'ok', 3, 1], 'sin API: finales sin límite y sin pedir nada más');
}

// ?muro=firme en localhost: Worker simulado
{
  const local = new Mem();
  const s = base({ host: 'localhost', buscar: '?muro=firme&etapa=final', local, fetch: async () => { throw new Error('no debería salir'); } });
  igual(s.modo, 'simulado', 'modo simulado');
  igual((await s.estado({})).quedan, 2, 'simulado: 2 finales');
  const a = await s.pedirPase({}), b = await s.pedirPase({}), c = await s.pedirPase({});
  igual([a.estado, a.quedan, b.quedan, c.estado, c.encuesta_disponible], ['ok', 1, 0, 'muro', true], 'simulado: muro a la tercera');
  igual((await s.encuesta({ r: {} })).bono, 2, 'simulado: encuesta +2');
  igual((await s.encuesta({ r: {} })).error, 'ya_respondida', 'simulado: encuesta una vez');
  igual((await s.pedirPase({})).fuente, 'encuesta', 'simulado: final de la encuesta');
  igual((await s.anotar({ email: 'x@noexiste.com' })).error, 'dominio', 'simulado: error de dominio');
  igual((await s.anotar({ email: 'ana@ejemplo.com' })).estado, 'nuevo', 'simulado: anotarse');
  igual((await s.pedirPase({})).fuente, 'lista', 'simulado: juego libre');
  const fuera = base({ host: 'liftinggame.pages.dev', buscar: '?muro=firme', fetch: workerFalso({}).fetch });
  igual(fuera.modo, 'servidor', '?muro=firme no vale fuera de localhost');
}


// ?muro=firme en localhost, con la regla de producción (el arranque gratis)
{
  const local = new Mem(), sesion = new Mem();
  const s = base({ host: 'localhost', buscar: '?muro=firme', local, sesion, fetch: async () => { throw new Error('no debería salir'); } });
  const e = await s.estado({});
  igual([e.quedan, e.etapa, e.regla], [1, 'arranque', { etapa: 'arranque', gratis: 1, bono: 1 }], 'simulado: un arranque gratis');
  const a = await s.pedirPase({});
  igual([a.estado, a.etapa, a.quedan], ['ok', 'arranque', 0], 'simulado: final con etapa arranque');
  igual((await s.envion({})).estado, 'muro', 'simulado: dos tiempos sin correo, muro');
  igual((await s.encuesta({ r: {} })).bono, 1, 'simulado: la encuesta suma 1');
  igual([(await s.envion({})).via, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['encuesta', 'completa'], 'simulado: dos tiempos por la encuesta, y el pase nuevo en la pestaña');
  const b = await s.pedirPase({});
  igual([b.estado, b.etapa, b.fuente], ['ok', 'completa', 'encuesta'], 'simulado: una final completa más');
  igual((await s.pedirPase({})).estado, 'muro', 'simulado: después, muro');
}

// ---------- 1b. la regla del arranque gratis con el Worker de verdad (en Node, D1 falsa) ----------
{
  const ORIGEN = 'https://liftinggame.pages.dev';
  const logReal = console.log;
  console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('{"')) return; logReal(...a); };      // registros del Worker
  const SECRETOS = { SECRETO_IP: 'ip'.repeat(16), SECRETO_DISPOSITIVO: 'dv'.repeat(16), SECRETO_PASE: 'pa'.repeat(16), SECRETO_BAJA: 'ba'.repeat(16) };
  const vars = varsDelWorker();
  igual([vars.GRATIS_ETAPA, vars.GRATIS, vars.BONO_ENCUESTA], ['arranque', '1', '1'], 'worker/wrangler.jsonc: la regla de producción es el arranque gratis');
  /** Un Worker con su base. `api(ruta, cuerpo, ip)` lo llama como la Function de Pages; `fetchDe(ip)` es el fetch de un navegador. */
  function workerLocal(extra = {}) {
    const db = d1Falsa(), env = { ...vars, ...SECRETOS, ...extra, DB: db };
    const llamar = async (ruta, init, ip) => {
      const pend = [], ctx = { waitUntil: p => pend.push(Promise.resolve(p).catch(() => null)), passThroughOnException() {} };
      const r = await worker.fetch(new Request(ORIGEN + ruta, { ...init, headers: { ...(init.headers || {}), origin: ORIGEN, 'cf-connecting-ip': ip } }), env, ctx);
      await Promise.all(pend);
      return r;
    };
    const api = async (ruta, cuerpo, ip = '203.0.113.7') => {
      const r = await llamar(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }, ip);
      return { status: r.status, j: await r.json() };
    };
    const fetchDe = ip => (url, init) => llamar(url, init, ip);
    const filas = async () => (await db.prepare('SELECT id, fuente, etapa, envion_por FROM partidas ORDER BY id').all()).results;
    return { db, env, api, fetchDe, filas };
  }
  const cliente = (w, ip, local = new Mem(), sesion = new Mem()) => ({ s: base({ fetch: w.fetchDe(ip), local, sesion }), local, sesion });
  const ENC = { q1: ['sedes'], q2: ['nada'], q3: 'compu', q4: 'no' };

  {
    // Jugador nuevo: el arranque de una final, gratis; el dos tiempos, negado; la próxima final, muro antes de empezar.
    const w = workerLocal(), { s, sesion } = cliente(w, '203.0.113.10');
    const e = await s.estado({ idioma: 'es' });
    igual([e.puede, e.quedan, e.etapa, e.regla], [true, 1, 'arranque', { etapa: 'arranque', gratis: 1, bono: 1 }], 'Worker: un dispositivo nuevo tiene un arranque gratis');
    igual(e.flags['muro-partidas-gratis'], '1', 'Worker: la bandera de cuántas finales reporta lo que vale con el arranque gratis');
    const p = await s.pedirPase({ idioma: 'es' });
    igual([p.estado, p.fuente, p.etapa, p.quedan, p.encuesta_disponible, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['ok', 'gratis', 'arranque', 0, true, 'arranque'], 'Worker: el pase sale con etapa arranque');
    const v = await s.envion({ idioma: 'es' });
    igual([v.estado, v.motivo, v.encuesta_disponible], ['muro', 'envion', true], 'Worker: dos tiempos sin correo ni encuesta: muro');
    igual((await w.filas()).map(f => f.etapa), ['arranque'], 'Worker: la partida queda en arranque');
    igual([(await s.estado({})).puede, (await s.pedirPase({})).estado], [false, 'muro'], 'Worker: la final siguiente empieza con el muro');
    igual((await w.filas()).length, 1, 'Worker: el muro no gasta nada');
    // Se anota en el intervalo: la misma final sigue con el dos tiempos, sin recargar.
    igual((await s.anotar({ email: 'ana@pruebas-tarima.com', idioma: 'es' })).ok, true, 'Worker: se anota');
    const v2 = await s.envion({ idioma: 'es' });
    igual([v2.estado, v2.via, v2.lista, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['ok', 'lista', true, 'completa'], 'Worker: anotado, permiso del dos tiempos de esa final');
    igual((await w.filas()).map(f => [f.etapa, f.envion_por]), [['completa', 'lista']], 'Worker: la partida pasa a completa por la lista');
    igual((await s.envion({})).via, 'ya', 'Worker: pedir el permiso otra vez no cambia nada');
    const l = await s.pedirPase({});
    igual([l.fuente, l.etapa, l.quedan], ['lista', 'completa', null], 'Worker: anotado, finales completas sin límite');
  }
  {
    // La encuesta en el intervalo: termina esa final y suma una completa; una sola vez.
    const w = workerLocal(), { s } = cliente(w, '203.0.113.11');
    await s.pedirPase({});
    igual(await s.encuesta({ r: ENC, idioma: 'es' }), { ok: true, bono: 1 }, 'Worker: la encuesta suma 1');
    const v = await s.envion({});
    igual([v.estado, v.via, v.quedan], ['ok', 'encuesta', 1], 'Worker: encuesta, permiso del dos tiempos y queda 1');
    const x = await s.pedirPase({});
    igual([x.estado, x.fuente, x.etapa], ['ok', 'encuesta', 'completa'], 'Worker: después de la encuesta, una final completa');
    const y = await s.pedirPase({});
    igual([y.estado, y.encuesta_disponible], ['muro', false], 'Worker: y después muro sin encuesta');
    igual((await w.filas()).map(f => [f.fuente, f.etapa, f.envion_por]), [['gratis', 'completa', 'encuesta'], ['encuesta', 'completa', null]], 'Worker: lo que quedó en la base');
  }
  {
    // Recargar en el intervalo (o en medio del arranque): no se reanuda la final (regalaría otro arranque); muro al cargar.
    const w = workerLocal(), local = new Mem(), sesion = new Mem();
    const a = base({ fetch: w.fetchDe('203.0.113.12'), local, sesion });
    await a.estado({}); await a.pedirPase({});
    a.soltarPase();      // pagehide
    const b = base({ fetch: w.fetchDe('203.0.113.12'), local, sesion });
    igual(b.paseParaReanudar(), null, 'recarga en el intervalo: la final del arranque gratis no se reanuda');
    igual(sesion.getItem('tarima.pase'), null, 'y el pase se borra de la pestaña');
    const e = await b.estado({});
    igual([e.puede, e.motivo, e.contexto.previas], [false, 'dispositivo', 1], 'Worker: al recargar, muro (el que ya jugó lo ve al cargar)');
    igual([(await b.pedirPase({})).estado, (await b.envion({})).estado], ['muro', 'error'], 'recargada, sin pase en la pestaña no hay dos tiempos');
    // Una final completa (anotado) sí se reanuda una vez, como siempre.
    await b.anotar({ email: 'beto@pruebas-tarima.com' });
    await b.pedirPase({}); b.soltarPase();
    const c = base({ fetch: w.fetchDe('203.0.113.12'), local, sesion });
    igual(c.paseParaReanudar()?.etapa, 'completa', 'una final completa se reanuda una vez');
  }
  {
    // Otra pestaña (mismo dispositivo, sin el pase): muro, y sin pase no hay dos tiempos. La API a mano: pase de otro
    // dispositivo, pase adulterado o vencido, todo 400.
    const w = workerLocal(), local = new Mem();
    const a = base({ fetch: w.fetchDe('203.0.113.13'), local, sesion: new Mem() });
    const pa = await a.pedirPase({});
    const pase = pa.pase;
    const otra = base({ fetch: w.fetchDe('203.0.113.13'), local, sesion: new Mem() });
    igual([(await otra.estado({})).puede, (await otra.pedirPase({})).estado, (await otra.envion({})).error], [false, 'muro', 'pase'], 'otra pestaña: muro y sin dos tiempos');
    const dev = local.getItem('tarima.dispositivo');
    igual((await w.api('/api/envion', { dispositivo: dev, pase })).j.estado, 'muro', 'API a mano con el pase bueno: muro');
    igual((await w.api('/api/envion', { dispositivo: crypto.randomUUID(), pase })).j, { error: 'pase' }, 'API a mano: el pase de otro dispositivo no sirve');
    const [v1, cuerpo, firma] = pase.split('.');
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    const falso = `${v1}.${Buffer.from(JSON.stringify({ ...datos, e: 'completa' })).toString('base64url')}.${firma}`;
    igual((await w.api('/api/envion', { dispositivo: dev, pase: falso })).j, { error: 'pase' }, 'API a mano: el pase adulterado no sirve');
    igual((await w.api('/api/envion', { dispositivo: dev })).status, 400, 'API a mano: sin pase, 400');
    // Una partida de la regla vieja (completa) responde ok sin tocar nada; un pase de una partida que no es suya, 400.
    await w.db.prepare("UPDATE partidas SET etapa = 'completa' WHERE id = ?1").bind(datos.p).run();
    igual((await w.api('/api/envion', { dispositivo: dev, pase })).j.via, 'ya', 'una final completa no necesita permiso');
    // Dos pedidos a la vez con la encuesta: uno solo pasa (la encuesta da el dos tiempos una vez).
    const w2 = workerLocal({ GRATIS: '2' }), d2 = crypto.randomUUID();
    const p1 = (await w2.api('/api/partida', { dispositivo: d2 })).j.pase, p2 = (await w2.api('/api/partida', { dispositivo: d2 })).j.pase;
    await w2.api('/api/encuesta', { dispositivo: d2, r: ENC });
    const rs = await Promise.all([w2.api('/api/envion', { dispositivo: d2, pase: p1 }), w2.api('/api/envion', { dispositivo: d2, pase: p2 })]);
    igual(rs.map(r => r.j.estado).sort(), ['muro', 'ok'], 'GRATIS=2: la encuesta da el dos tiempos a una sola de las dos finales');
  }
  {
    // Otro dispositivo en la misma IP (borrar los datos): otro arranque gratis, nunca el dos tiempos; la IP frena a los 6.
    const w = workerLocal(), ip = '203.0.113.14', res = [];
    for (let k = 0; k < 7; k++) {
      const { s } = cliente(w, ip);
      const p = await s.pedirPase({});
      res.push(p.estado === 'ok' ? p.etapa : p.motivo);
      if (p.estado === 'ok') ok((await s.envion({})).estado === 'muro', `misma IP, dispositivo ${k + 1}: sin dos tiempos`);
    }
    igual(res, ['arranque', 'arranque', 'arranque', 'arranque', 'arranque', 'arranque', 'ip'], 'misma IP: 6 arranques gratis y después muro por IP');
  }
  {
    // La regla vieja por variable: 2 finales enteras, el dos tiempos sin pedir nada, la encuesta +2.
    const w = workerLocal({ GRATIS_ETAPA: 'final', GRATIS: '2', BONO_ENCUESTA: '2' }), { s } = cliente(w, '203.0.113.15');
    const e = await s.estado({});
    igual([e.quedan, e.etapa, e.regla.etapa], [2, 'completa', 'final'], 'regla vieja: 2 finales completas');
    const a = await s.pedirPase({});
    igual([a.etapa, (await s.envion({})).via], ['completa', 'ya'], 'regla vieja: el dos tiempos no pide nada');
    await s.pedirPase({});
    igual((await s.pedirPase({})).estado, 'muro', 'regla vieja: muro a la tercera');
    igual((await s.encuesta({ r: ENC })).bono, 2, 'regla vieja: la encuesta suma 2');
  }
  console.log = logReal;
}

// anotar
{
  const local = new Mem({ 'tarima.muro': '1', 'tarima.quedan': '0' });
  const w = workerFalso({ '/api/anotar': [[200, { estado: 'nuevo', lista_id: 'f'.repeat(32), confirmar: false }], [400, { error: 'descartable' }], [429, { error: 'limite' }], 'red'] });
  const s = base({ fetch: w.fetch, local });
  igual((await s.anotar({ email: 'mal' })).error, 'formato', 'formato sin pedir nada');
  igual((await s.anotar({ email: 'ana@ejemplo.com', aviso: false })).error, 'aviso', 'aviso obligatorio');
  igual(w.pedidos.length, 0, 'los errores locales no salen');
  const r = await s.anotar({ email: ' Ana@Ejemplo.com ', nombre: 'Rookie', idioma: 'es', novedades: true, sesion: 'ph_abc' });
  igual([r.ok, r.estado, r.confirmar], [true, 'nuevo', false], 'alta');
  const c = w.pedidos[0].cuerpo;
  igual([c.email, c.aviso, c.novedades, c.consentimiento, c.nombre, c.web, c.sesion], ['Ana@Ejemplo.com', true, true, CONSENTIMIENTO, undefined, '', 'ph_abc'], 'cuerpo del alta (sin el nombre por defecto)');
  igual(s.copia(), { muro: false, quedan: null, lista: true, motivo: null }, 'anotado: juego libre en la copia');
  igual((await s.anotar({ email: 'ana@ejemplo.com' })).error, 'descartable', 'error del Worker');
  igual((await s.anotar({ email: 'ana@ejemplo.com' })).error, 'limite', '429');
  igual((await s.anotar({ email: 'ana@ejemplo.com' })).error, 'red', 'sin red');
}

// encuesta y baja
{
  const local = new Mem({ 'tarima.muro': '1', 'tarima.quedan': '0' });
  const w = workerFalso({ '/api/encuesta': [[200, { estado: 'ok', bono: 2 }], [409, { error: 'ya_respondida' }], [400, { error: 'incompleta' }]], '/api/baja': [[202, {}], [429, { error: 'limite' }]] });
  const s = base({ fetch: w.fetch, local });
  igual(await s.encuesta({ r: { q1: ['sedes'] }, idioma: 'es', sesion: 's' }), { ok: true, bono: 2 }, 'encuesta con premio');
  igual(s.copia(), { muro: false, quedan: 2, lista: false, motivo: null }, 'la encuesta saca el muro y suma 2');
  igual((await s.encuesta({ r: {} })).error, 'ya_respondida', '409');
  igual((await s.encuesta({ r: {} })).error, 'incompleta', '400 incompleta');
  igual(await s.baja({ email: 'ana@ejemplo.com' }), { ok: true }, 'baja 202');
  ok(w.pedidos.at(-1).cuerpo.dispositivo === undefined || /^[0-9a-f-]{36}$/.test(w.pedidos.at(-1).cuerpo.dispositivo), 'la baja manda el dispositivo si lo hay');
  igual((await s.baja({ email: 'ana@ejemplo.com' })).error, 'limite', 'baja con límite');
  igual((await s.baja({ email: 'x' })).error, 'formato', 'baja con correo mal escrito');
}

// sin almacenamiento (Safari privado viejo, almacenamiento bloqueado): no tira
{
  const roto = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  const s = base({ fetch: workerFalso({ '/api/estado': [[200, { dispositivo: UUID, puede: true, quedan: 2, lista: false }]] }).fetch, local: roto, sesion: roto });
  igual((await s.estado({})).puede, true, 'sin almacenamiento igual pregunta al servidor');
  igual(s.paseParaReanudar(), null, 'sin almacenamiento no hay nada que reanudar');
}

// ---------- 2. analitica.js ----------

function posthogFalso() {
  const ph = { llamadas: [], init(k, c) { this.llamadas.push(['init', k, c]); }, register(p) { this.llamadas.push(['register', p]); },
    capture(e, p, o) { this.llamadas.push(['capture', e, p, o]); }, identify(id) { this.llamadas.push(['identify', id]); },
    get_distinct_id() { return 'ph_distinto'; }, set_config(c) { this.llamadas.push(['set_config', c]); },
    stopSessionRecording() { this.llamadas.push(['stopSessionRecording']); } };
  return ph;
}
const ventanaFalsa = (o = {}) => ({ location: { search: o.search ?? '', origin: 'https://liftinggame.pages.dev' }, matchMedia: () => ({ matches: true }), navigator: o.navigator, addEventListener() {} });
const ESTADO = { metricas: { clave: 'phc_PRUEBA123', host: '/qx', ui: 'https://us.posthog.com', encuesta: 'enc-1' }, flags: { 'muro-texto': 'b' }, contexto: { pais: 'AR', previas: 1, dias: '0' } };

igual(limpiarProps({ nombre: 'Ana', email: 'a@b.com', ip: '1.2.3.4', dispositivo: 'x', n: 1, ok: true, txt: 'ana@b.com', obj: {}, pantalla: 'muro' }), { n: 1, ok: true, pantalla: 'muro' }, 'propiedades sin datos personales');
igual([fuenteTrafico('?utm_source=Amigos'), fuenteTrafico('?c=abc'), fuenteTrafico('')], ['amigos', 'compartido', 'directo'], 'fuente_trafico');
igual([fuenteTrafico('?fbclid=PAZ'), fuenteTrafico('?ttclid=1'), fuenteTrafico('', 'https://l.instagram.com/?u=x'), fuenteTrafico('', 'https://t.co/abc'),
  fuenteTrafico('', 'https://www.google.com/'), fuenteTrafico('', 'https://foro.ejemplo.org/hilo/3'), fuenteTrafico('', 'https://liftinggame.pages.dev/x', 'https://liftinggame.pages.dev'),
  fuenteTrafico('?utm_source=ig&fbclid=1', 'https://l.facebook.com/')],
  ['facebook', 'tiktok', 'instagram', 'x', 'google', 'otro_sitio', 'directo', 'ig'], 'fuente_trafico con click-id y referente');
igual([dominioReferente('https://l.instagram.com/?u=secreto'), dominioReferente(''), dominioReferente('android-app://com.x'), dominioReferente('https://a.dev/p', 'https://a.dev')],
  ['l.instagram.com', '', '', ''], 'referente: solo el sitio, nunca el propio juego');
{
  const err = new TypeError('Cannot read properties of undefined (reading \'x\') de juan@mail.com en https://a.dev/p?token=1');
  err.stack = 'TypeError: …\n    at f (https://liftinggame.pages.dev/js/game/stage.js?v=3:812:17)\n    at g (https://liftinggame.pages.dev/js/game/main.js:1:1)';
  const d = detalleError(err);
  igual([d.archivo, d.linea, d.col, d.mensaje.includes('@'), d.mensaje.includes('token')], ['stage.js', 812, 17, false, false], 'detalleError: archivo, línea, sin mail ni parámetros');
  const d2 = detalleError(null, { message: 'Script error.', filename: 'https://x.dev/vendor/three/three.module.js', lineno: 5, colno: 9 });
  igual([d2.mensaje, d2.archivo, d2.linea], ['Script error.', 'three.module.js', 5], 'detalleError desde ErrorEvent');
  igual(detalleError(undefined), { mensaje: null, archivo: null, linea: null, col: null }, 'detalleError sin nada');
}

{
  // Sin clave: no-op, pero los eventos quedan en window.JUEGO.eventos y PostHog ni se carga.
  const v = ventanaFalsa(); let cargado = false;
  const a = crearAnalitica({ ventana: v, local: new Mem(), sesion: new Mem(), cargar: async () => { cargado = true; return posthogFalso(); } });
  a.ev('juego_abierto', { carga_ms: 10 });
  igual(await a.iniciar({ estado: { metricas: null, flags: null } }), false, 'sin clave no arranca');
  a.ev('final_inicio', { n: 1 });
  igual([cargado, a.estado, v.JUEGO.eventos.map(e => e.ev)], [false, 'apagada', ['juego_abierto', 'final_inicio']], 'sin clave: no-op con registro de eventos');
  igual(a.bandera('muro-texto'), 'a', 'bandera por defecto');
}
{
  // Con clave: configuración sin cookies, súper propiedades, cola en orden, identify antes del evento.
  const ph = posthogFalso(), v = ventanaFalsa({ search: '?c=xyz' }), sesion = new Mem();
  const a = crearAnalitica({ ventana: v, local: new Mem(), sesion, cargar: async () => ph, azar: () => 0.99 });
  a.ev('juego_abierto', { carga_ms: 12, pantalla_inicial: 'bienvenida' });
  a.visita('bienvenida');
  igual(await a.iniciar({ estado: { ...ESTADO, lista_id: 'a'.repeat(32) }, idioma: 'es', idioma_origen: 'navegador', version: 'mvp-1' }), true, 'con clave arranca');
  const [, clave, cfg] = ph.llamadas.find(l => l[0] === 'init');
  igual(clave, 'phc_PRUEBA123', 'clave pública');
  igual([cfg.persistence, cfg.person_profiles, cfg.api_host, cfg.autocapture, cfg.capture_pageview, cfg.capture_pageleave, cfg.disable_session_recording, cfg.disable_surveys, cfg.advanced_disable_flags, cfg.disable_external_dependency_loading],
    ['memory', 'identified_only', 'https://liftinggame.pages.dev/qx', false, true, true, true, true, true, true], 'configuración de posthog.init');
  igual(cfg.bootstrap.featureFlags['muro-texto'], 'b', 'banderas del Worker como bootstrap');
  const reg = ph.llamadas.find(l => l[0] === 'register')[1];
  igual([reg.idioma, reg.tactil, reg.pais, reg.previas, reg.fuente_trafico, reg['$feature/muro-texto'], reg['$feature/muro-partidas-gratis']], ['es', true, 'AR', 1, 'compartido', 'b', '2'], 'súper propiedades');
  const orden = ph.llamadas.filter(l => l[0] !== 'init' && l[0] !== 'register' || l[1]?.pantalla).map(l => l[0] === 'capture' ? l[1] : l[0] === 'register' ? 'pantalla' : l[0]);
  igual(orden, ['identify', 'juego_abierto', 'pantalla'], 'la cola sale en orden, con identify primero');
  ok(ph.llamadas.find(l => l[1] === 'juego_abierto')[3]?.timestamp instanceof Date, 'los eventos de la cola llevan su hora');
  a.ev('anotar_ok', { estado: 'nuevo', email: 'no@va.com' });
  igual(ph.llamadas.at(-1), ['capture', 'anotar_ok', { estado: 'nuevo' }, undefined], 'evento directo y sin correo');
  igual(a.idSesion(), 'ph_distinto', 'idSesion es el de PostHog');
  a.encuestaVista({ con_premio: true });
  igual(ph.llamadas.at(-1).slice(1, 3), ['survey shown', { $survey_id: 'enc-1', con_premio: true }], 'survey shown con el id de la encuesta');
  igual(sesion.getItem('tarima.clave_publica'), 'phc_PRUEBA123', 'la clave pública queda en la pestaña para la privacidad');
  a.consentir();
  igual(ph.llamadas.at(-1), ['set_config', { persistence: 'localStorage+cookie' }], 'consentir cambia la persistencia');
}
{
  // ?metricas=0 y la medición desactivada: no se carga PostHog.
  for (const [o, msg] of [[{ search: '?metricas=0' }, '?metricas=0'], [{}, 'tarima.medicion=0']]) {
    let cargado = false;
    const local = new Mem(msg === 'tarima.medicion=0' ? { 'tarima.medicion': '0' } : {});
    const a = crearAnalitica({ ventana: ventanaFalsa(o), local, sesion: new Mem(), cargar: async () => { cargado = true; return posthogFalso(); } });
    igual([await a.iniciar({ estado: ESTADO }), cargado], [false, false], `${msg}: sin PostHog`);
  }
}
{
  // Interruptor de la privacidad sin PostHog en la página: manda el aviso por sendBeacon con la clave de la pestaña.
  const beacons = [];
  const v = ventanaFalsa({ navigator: { sendBeacon: (u, b) => { beacons.push([u, JSON.parse(b)]); return true; } } });
  const local = new Mem(), sesion = new Mem({ 'tarima.clave_publica': 'phc_PRUEBA123' });
  const a = crearAnalitica({ ventana: v, local, sesion, cargar: async () => posthogFalso() });
  igual(a.medicionActivada(), true, 'medición activada por defecto');
  a.desactivarMedicion();
  igual([local.getItem('tarima.medicion'), a.medicionActivada(), beacons.length, beacons[0]?.[0], beacons[0]?.[1].event, beacons[0]?.[1].properties.$process_person_profile],
    ['0', false, 1, 'https://liftinggame.pages.dev/qx/i/v0/e/', 'medicion_desactivada', false], 'desactivar manda el aviso y apaga');
  a.desactivarMedicion();
  igual(beacons.length, 1, 'desactivar dos veces avisa una');
  a.activarMedicion();
  igual(a.medicionActivada(), true, 'activar otra vez');
  ok(!sesion.keys().some(k => /ph_/.test(k)) && !local.keys().some(k => /ph_/.test(k)), 'ninguna clave con ph_ en el almacenamiento');
}

// ---------- 2b. grabación de sesión (docs/MVP.md 6.6) ----------
{
  igual([proporcionGrabacion('off'), proporcionGrabacion('tercio'), proporcionGrabacion('todas'), proporcionGrabacion('muestra'), proporcionGrabacion(undefined)], [0, 1 / 3, 1, 0, 0], 'proporción por bandera');
  igual(BANDERAS.grabacion, 'tercio', 'un tercio por defecto en el cliente');
  const tapado = t => t.replace(/\S/g, '*');
  igual([taparTexto('Elige tu pesista, Ana', ['ana']), taparTexto('Jugar', ['ana']), taparTexto('Escribe a ana@x.com', []), taparTexto('ANA PÉREZ gana', ['ana pérez'])],
    [tapado('Elige tu pesista, Ana'), 'Jugar', tapado('Escribe a ana@x.com'), tapado('ANA PÉREZ gana')], 'taparTexto: nombre y correos tapados, lo demás en claro');
  ok(/\bcanvas\b/.test(BLOQUEO_GRABACION) && /#senal\b/.test(BLOQUEO_GRABACION), 'bloqueo: los lienzos y la señal del intento');

  // Arma una analítica con PostHog y grabador falsos. `orden` anota qué se cargó y cuándo se llamó init.
  const armar = ({ grabacion, azar = () => 0, local = new Mem(), falla = false, documento = null, search = '' } = {}) => {
    const ph = posthogFalso(), orden = [];
    const ini = ph.init; ph.init = function (k, c) { orden.push('init'); return ini.call(this, k, c); };
    const v = { ...ventanaFalsa({ search }), document: documento };
    let tiradas = 0;
    const a = crearAnalitica({ ventana: v, local, sesion: new Mem(), cargar: async () => { orden.push('posthog'); return ph; },
      cargarGrabador: async () => { orden.push('grabador'); if (falla) throw new Error('no'); }, azar: () => { tiradas++; return azar(); } });
    const est = { ...ESTADO, flags: grabacion === undefined ? { 'muro-texto': 'b' } : { 'muro-texto': 'b', grabacion } };
    return { a, ph, v, orden, est, tiradas: () => tiradas, cfg: () => ph.llamadas.find(l => l[0] === 'init')?.[2], reg: () => ph.llamadas.find(l => l[0] === 'register')?.[1] };
  };
  {
    const x = armar({ grabacion: 'off' });
    igual(await x.a.iniciar({ estado: x.est }), true, 'off: la medición arranca igual');
    igual([x.orden, x.cfg().disable_session_recording, x.a.grabando(), x.reg().grabada, x.v._POSTHOG_REMOTE_CONFIG], [['posthog', 'init'], true, false, false, undefined], 'off: sin grabador ni grabación');
  }
  {
    const x = armar({ grabacion: 'todas', azar: () => 0.999 });
    await x.a.iniciar({ estado: x.est });
    const c = x.cfg();
    igual([x.orden.at(-1), x.orden.includes('grabador'), c.disable_session_recording, x.a.grabando(), x.reg().grabada, x.reg()['$feature/grabacion']], ['init', true, false, true, true, 'todas'], 'todas: el grabador se carga antes de init y se graba');
    const sr = c.session_recording;
    igual([sr.maskAllInputs, sr.captureCanvas.recordCanvas, sr.blockSelector, sr.maskTextSelector, sr.recordHeaders, sr.recordBody, c.enable_recording_console_log, c.advanced_disable_flags, c.disable_external_dependency_loading],
      [true, false, BLOQUEO_GRABACION, '*', false, false, false, true, true], 'todas: campos tapados, sin lienzo, sin red ni consola, sin pedidos extra a PostHog');
    const rc = x.v._POSTHOG_REMOTE_CONFIG?.phc_PRUEBA123?.config;
    igual([rc?.sessionRecording?.endpoint, rc?.sessionRecording?.recordCanvas, rc?.hasFeatureFlags], ['/s/', false, false], 'todas: configuración de la grabación puesta a mano (sin pedirla a PostHog)');
    x.a.desactivarMedicion();
    igual([x.ph.llamadas.some(l => l[0] === 'stopSessionRecording'), x.a.grabando()], [true, false], 'desactivar la medición corta la grabación');
  }
  {
    // El nombre: el guardado y el que se está escribiendo en la bienvenida o en el editor del teléfono.
    const campos = { nombre: { value: '  Ana  ' }, 'editor-campo': { value: 'Lucía' } };
    const x = armar({ grabacion: 'todas', local: new Mem({ 'tarima.nombre': 'Brenda' }), documento: { getElementById: id => campos[id] || null } });
    await x.a.iniciar({ estado: x.est });
    const f = x.cfg().session_recording.maskTextFn;
    const textos = ['Elige tu pesista, Ana', 'BRENDA · 120 kg', 'Hola de nuevo, Lucía', 'Arranque · 2.º intento', 'te anotaste: a@b.com'];
    igual(textos.map(t => f(t)), textos.map((t, i) => (i === 3 ? t : tapado(t))), 'maskTextFn tapa el nombre guardado, el que se escribe y los correos');
  }
  {
    // Lo que se escribe puede llevar signos que el título no muestra (limpiarNombre los quita): «Juan.» → «Juan».
    const limpiarDeMain = (() => {
      const src = fs.readFileSync(path.join(ROOT, 'web/js/game/main.js'), 'utf8');
      const m = src.match(/function limpiarNombre\(s\) \{[\s\S]*?\n\}/);
      return m ? new Function(`${m[0]}; return limpiarNombre;`)() : null;
    })();
    ok(!!limpiarDeMain, 'se encontró limpiarNombre en main.js');
    for (const escrito of ['Juan.', 'Juan5', 'Ana_', 'María!', 'Lucía 🙂', 'Ñandú—', 'O’Neil 9']) {
      const visto = limpiarDeMain(escrito);
      igual(nombreVisible(escrito), visto, `nombreVisible sigue la regla de limpiarNombre de main.js («${escrito}»)`);
      for (const campo of ['nombre', 'editor-campo']) {
        const campos = { [campo]: { value: escrito } };
        const x = armar({ grabacion: 'todas', documento: { getElementById: id => campos[id] || null } });
        await x.a.iniciar({ estado: x.est });
        const f = x.cfg().session_recording.maskTextFn;
        for (const t of [`Elige tu pesista, ${visto}`, `${visto.toUpperCase()} · 120 kg`]) igual(f(t), tapado(t), `«${escrito}» en #${campo}: «${t}» tapado`);
      }
    }
  }
  {
    // tercio: una tirada por carga; < 1/3 graba.
    const si = armar({ grabacion: 'tercio', azar: () => 0.2 }), no = armar({ grabacion: 'tercio', azar: () => 0.5 }), def = armar({ azar: () => 0.1 });
    for (const x of [si, no, def]) await x.a.iniciar({ estado: x.est });
    await si.a.iniciar({ estado: si.est });
    igual([si.a.grabando(), no.a.grabando(), no.orden.includes('grabador'), def.a.grabando(), si.tiradas()], [true, false, false, true, 1], 'tercio: se sortea una vez por carga');
    let grabadas = 0; const N = 3000;
    for (let i = 0; i < N; i++) {
      const a = crearAnalitica({ ventana: ventanaFalsa(), local: new Mem(), sesion: new Mem(), cargar: async () => posthogFalso(), cargarGrabador: async () => {} });
      await a.iniciar({ estado: { ...ESTADO, flags: { grabacion: 'tercio' } } });
      if (a.grabando()) grabadas++;
    }
    ok(grabadas / N > 0.3 && grabadas / N < 0.367, `tercio: con Math.random se graban ${grabadas} de ${N}`);
  }
  {
    // Sin medición no hay grabación (ni se descarga el grabador), aunque la bandera diga todas.
    for (const [o, msg] of [[{ local: new Mem({ 'tarima.medicion': '0' }) }, 'medición desactivada'], [{ search: '?metricas=0' }, '?metricas=0']]) {
      const x = armar({ grabacion: 'todas', ...o });
      igual([await x.a.iniciar({ estado: x.est }), x.orden, x.a.grabando()], [false, [], false], `${msg}: ni PostHog ni grabador`);
    }
    const x = armar({ grabacion: 'todas' });
    await x.a.iniciar({ estado: { ...x.est, metricas: null } });
    igual([x.orden, x.a.grabando()], [[], false], 'sin clave: ni PostHog ni grabador');
  }
  {
    // Si el grabador no carga, la medición sigue sin grabación.
    const x = armar({ grabacion: 'todas', falla: true });
    igual([await x.a.iniciar({ estado: x.est }), x.cfg().disable_session_recording, x.a.grabando(), x.reg().grabada, x.v._POSTHOG_REMOTE_CONFIG], [true, true, false, false, undefined], 'grabador que no carga: medición sin grabación');
  }
  {
    // Atributos: `value` siempre tapado (un campo vacío deja ver el atributo del HTML), data-v del correo sugerido y
    // cualquier atributo con el nombre tapados; la forma de la página (clase, estilo, CSS con «@media») en claro.
    const tapado = t => t.replace(/\S/g, '*');
    igual([taparAtributo('value', 'Brenda', []), taparAtributo('data-v', 'ana@gmail.com', []), taparAtributo('aria-label', 'Perfil de Brenda', ['brenda']),
      taparAtributo('title', 'Jugar', ['brenda']), taparAtributo('class', 'brenda', ['brenda']), taparAtributo('_cssText', '@media (max-width:600px){a{b:c}}', []),
      taparAtributo('hidden', '', ['x']), taparAtributo('rr_width', '128px', [])],
    [tapado('Brenda'), tapado('ana@gmail.com'), tapado('Perfil de Brenda'), 'Jugar', 'brenda', '@media (max-width:600px){a{b:c}}', '', '128px'], 'taparAtributo');
    const x = armar({ grabacion: 'todas', local: new Mem({ 'tarima.nombre': 'Brenda' }) });
    await x.a.iniciar({ estado: x.est });
    const f = x.cfg().session_recording.maskAttributeFn;
    igual([f('value', 'Brenda'), f('placeholder', 'Hola Brenda'), f('data-k', 'arranque')], [tapado('Brenda'), tapado('Hola Brenda'), 'arranque'], 'maskAttributeFn en la configuración de la grabación');
  }
  {
    // La privacidad se abre en otra pestaña: si ahí se desactiva la medición, el evento `storage` corta la grabación.
    const x = armar({ grabacion: 'todas' });
    const oyentes = [];
    x.v.addEventListener = (tipo, fn) => { if (tipo === 'storage') oyentes.push(fn); };
    await x.a.iniciar({ estado: x.est });
    for (const fn of oyentes) fn({ key: 'muro-texto', newValue: '0' });
    const antes = x.a.grabando();
    for (const fn of oyentes) fn({ key: 'tarima.medicion', newValue: '0' });
    igual([oyentes.length, antes, x.a.grabando(), x.a.activa(), x.ph.llamadas.some(l => l[0] === 'stopSessionRecording')], [1, true, false, false, true], 'medición desactivada en otra pestaña: se corta la grabación');
  }
  {
    // Si la medición se apaga mientras se descargan PostHog y el grabador, no se llama a init.
    const local = new Mem();
    const x = armar({ grabacion: 'todas', local });
    const p = x.a.iniciar({ estado: x.est });
    local.setItem('tarima.medicion', '0');
    igual([await p, x.orden.includes('init'), x.a.grabando(), x.a.estado], [false, false, false, 'apagada'], 'medición apagada durante la descarga: ni init ni grabación');
    const y = armar({ grabacion: 'todas' });
    const q = y.a.iniciar({ estado: y.est });
    y.a.apagar();
    igual([await q, y.orden.includes('init'), y.a.grabando(), y.a.estado], [false, false, false, 'apagada'], 'apagar() durante la descarga: ni init ni grabación');
  }
}

// ---------- 3. Functions de Pages ----------
{
  let recibido = null;
  const env = { TARIMA: { fetch: async req => { recibido = req; return new Response('{"ok":1}', { headers: { 'content-type': 'application/json' } }); } } };
  const req = new Request('https://liftinggame.pages.dev/api/estado', {
    method: 'POST', body: '{"dispositivo":"x"}',
    headers: { 'content-type': 'application/json', origin: 'https://liftinggame.pages.dev', 'cf-connecting-ip': '203.0.113.5', 'x-tarima-ip': '1.1.1.1', 'x-tarima-pais': 'ZZ' },
  });
  Object.defineProperty(req, 'cf', { value: { country: 'UY' } });
  const r = await reenviar({ request: req, env });
  igual(await r.json(), { ok: 1 }, 'la Function devuelve lo del Worker');
  igual([recibido.url, recibido.method, recibido.headers.get('origin'), recibido.headers.get('x-tarima-ip'), recibido.headers.get('x-tarima-pais'), await recibido.text()],
    ['https://liftinggame.pages.dev/api/estado', 'POST', 'https://liftinggame.pages.dev', '203.0.113.5', 'UY', '{"dispositivo":"x"}'], 'la Function pasa el pedido con la IP y el país propios, no los del navegador');
  const sinPais = new Request('https://liftinggame.pages.dev/api/estado', { method: 'POST', body: '{}', headers: { 'x-tarima-pais': 'ZZ' } });
  await reenviar({ request: sinPais, env });
  igual([recibido.headers.get('x-tarima-pais'), recibido.headers.get('x-tarima-ip')], [null, null], 'sin datos de Cloudflare no pasa lo que inventó el navegador');
  const r503 = await reenviar({ request: sinPais, env: {} });
  igual([r503.status, await r503.json()], [503, { error: 'servidor' }], 'sin binding responde 503 en JSON (el juego lo trata como falta de red)');
  let pedido = null;
  const r2 = await raiz({ request: new Request('https://liftinggame.pages.dev/?lang=en'), env: { ASSETS: { fetch: async q => { pedido = q; return new Response('<html>'); } } } });
  igual([new URL(pedido.url).pathname, await r2.text()], ['/juego', '<html>'], '«/» muestra el juego');
  igual((await raiz({ request: new Request('https://liftinggame.pages.dev/', { method: 'POST' }), env: {} })).status, 405, '«/» solo GET');
  // Rutas: cada Function de la binding exporta onRequest; el ayudante no es una ruta.
  for (const f of ['api/[[ruta]].js', 'qx/[[ruta]].js', 'baja.js', 'confirmar.js']) {
    const m = await import(path.join(ROOT, 'functions', f));
    ok(m.onRequest === reenviar, `functions/${f} reenvía al Worker`);
  }
  ok(!Object.keys(await import('../functions/_reenviar.js')).some(k => /^onRequest/.test(k)), '_reenviar.js no es una ruta');
}

// ---------- 4. textos sin la promesa de «nunca vas a pagar» ----------
{
  const archivos = ['worker/src/textos.js', 'web/privacidad.html', 'web/js/game/servidor.js', 'web/js/game/analitica.js'];
  for (const f of archivos) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) ok(!/nunca vas a pagar|never pay to lift/i.test(fs.readFileSync(p, 'utf8')), `${f} sin la promesa de pago`);
  }
}

console.log(`servidor_test: ${n} controles, ${fallas.length ? fallas.length + ' MAL' : 'todos bien'}`);
process.exit(fallas.length ? 1 : 0);
