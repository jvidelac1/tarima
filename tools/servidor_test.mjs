// Prueba del cliente del servidor y de las métricas, en Node y SIN red. Uso: node tools/servidor_test.mjs
//  1. web/js/game/servidor.js contra un Worker falso: estado, copia local, pase con reintentos, «sin servidor» solo con
//     historia limpia (docs/MVP.md 7, endurecimiento 1), 429 y 503, reanudar una final una sola vez, lista, encuesta,
//     baja, modo sin API en localhost y `?muro=firme`.
//  2. web/js/game/analitica.js con un PostHog falso: no-op sin clave, cola antes de iniciar, configuración sin cookies,
//     identify con lista_id, banderas, propiedades sin datos personales, interruptor de la privacidad.
//  3. Las Functions de Pages (functions/): pasan /api/* al Worker con la IP y el país en cabeceras propias, y «/» muestra
//     el juego.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor, expDelPase, pareceCorreo, sugerirCorreo, CONSENTIMIENTO } from '../web/js/game/servidor.js';
import { crearAnalitica, limpiarProps, fuenteTrafico } from '../web/js/game/analitica.js';
import { reenviar } from '../functions/_reenviar.js';
import { onRequest as raiz } from '../functions/index.js';
import { VERSIONES_CONSENTIMIENTO } from '../worker/src/reglas.js';

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
const base = o => crearServidor({ host: 'tarimagame.pages.dev', buscar: '', esperar: sinEspera, local: new Mem(), sesion: new Mem(), ...o });

// ---------- 1. servidor.js ----------

igual(CONSENTIMIENTO, '2026-11-b', 'versión del consentimiento');
ok(VERSIONES_CONSENTIMIENTO.has(CONSENTIMIENTO), 'el Worker acepta la versión que manda el juego');
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
  // Recargar en medio: se reanuda una vez; la segunda, no.
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
  const s = base({ host: 'localhost', buscar: '?muro=firme', local, fetch: async () => { throw new Error('no debería salir'); } });
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
  const fuera = base({ host: 'tarimagame.pages.dev', buscar: '?muro=firme', fetch: workerFalso({}).fetch });
  igual(fuera.modo, 'servidor', '?muro=firme no vale fuera de localhost');
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
  igual([c.email, c.aviso, c.novedades, c.consentimiento, c.nombre, c.web, c.sesion], ['Ana@Ejemplo.com', true, true, '2026-11-b', undefined, '', 'ph_abc'], 'cuerpo del alta (sin el nombre por defecto)');
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
    get_distinct_id() { return 'ph_distinto'; }, set_config(c) { this.llamadas.push(['set_config', c]); } };
  return ph;
}
const ventanaFalsa = (o = {}) => ({ location: { search: o.search ?? '', origin: 'https://tarimagame.pages.dev' }, matchMedia: () => ({ matches: true }), navigator: o.navigator, addEventListener() {} });
const ESTADO = { metricas: { clave: 'phc_PRUEBA123', host: '/qx', ui: 'https://us.posthog.com', encuesta: 'enc-1' }, flags: { 'muro-texto': 'b' }, contexto: { pais: 'AR', previas: 1, dias: '0' } };

igual(limpiarProps({ nombre: 'Ana', email: 'a@b.com', ip: '1.2.3.4', dispositivo: 'x', n: 1, ok: true, txt: 'ana@b.com', obj: {}, pantalla: 'muro' }), { n: 1, ok: true, pantalla: 'muro' }, 'propiedades sin datos personales');
igual([fuenteTrafico('?utm_source=Amigos'), fuenteTrafico('?c=abc'), fuenteTrafico('')], ['amigos', 'compartido', 'directo'], 'fuente_trafico');

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
  const a = crearAnalitica({ ventana: v, local: new Mem(), sesion, cargar: async () => ph });
  a.ev('juego_abierto', { carga_ms: 12, pantalla_inicial: 'bienvenida' });
  a.visita('bienvenida');
  igual(await a.iniciar({ estado: { ...ESTADO, lista_id: 'a'.repeat(32) }, idioma: 'es', idioma_origen: 'navegador', version: 'mvp-1' }), true, 'con clave arranca');
  const [, clave, cfg] = ph.llamadas.find(l => l[0] === 'init');
  igual(clave, 'phc_PRUEBA123', 'clave pública');
  igual([cfg.persistence, cfg.person_profiles, cfg.api_host, cfg.autocapture, cfg.capture_pageview, cfg.capture_pageleave, cfg.disable_session_recording, cfg.disable_surveys, cfg.advanced_disable_flags, cfg.disable_external_dependency_loading],
    ['memory', 'identified_only', 'https://tarimagame.pages.dev/qx', false, false, true, true, true, true, true], 'configuración de posthog.init');
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
    ['0', false, 1, 'https://tarimagame.pages.dev/qx/i/v0/e/', 'medicion_desactivada', false], 'desactivar manda el aviso y apaga');
  a.desactivarMedicion();
  igual(beacons.length, 1, 'desactivar dos veces avisa una');
  a.activarMedicion();
  igual(a.medicionActivada(), true, 'activar otra vez');
  ok(!sesion.keys().some(k => /ph_/.test(k)) && !local.keys().some(k => /ph_/.test(k)), 'ninguna clave con ph_ en el almacenamiento');
}

// ---------- 3. Functions de Pages ----------
{
  let recibido = null;
  const env = { TARIMA: { fetch: async req => { recibido = req; return new Response('{"ok":1}', { headers: { 'content-type': 'application/json' } }); } } };
  const req = new Request('https://tarimagame.pages.dev/api/estado', {
    method: 'POST', body: '{"dispositivo":"x"}',
    headers: { 'content-type': 'application/json', origin: 'https://tarimagame.pages.dev', 'cf-connecting-ip': '203.0.113.5', 'x-tarima-ip': '1.1.1.1', 'x-tarima-pais': 'ZZ' },
  });
  Object.defineProperty(req, 'cf', { value: { country: 'UY' } });
  const r = await reenviar({ request: req, env });
  igual(await r.json(), { ok: 1 }, 'la Function devuelve lo del Worker');
  igual([recibido.url, recibido.method, recibido.headers.get('origin'), recibido.headers.get('x-tarima-ip'), recibido.headers.get('x-tarima-pais'), await recibido.text()],
    ['https://tarimagame.pages.dev/api/estado', 'POST', 'https://tarimagame.pages.dev', '203.0.113.5', 'UY', '{"dispositivo":"x"}'], 'la Function pasa el pedido con la IP y el país propios, no los del navegador');
  const sinPais = new Request('https://tarimagame.pages.dev/api/estado', { method: 'POST', body: '{}', headers: { 'x-tarima-pais': 'ZZ' } });
  await reenviar({ request: sinPais, env });
  igual([recibido.headers.get('x-tarima-pais'), recibido.headers.get('x-tarima-ip')], [null, null], 'sin datos de Cloudflare no pasa lo que inventó el navegador');
  const r503 = await reenviar({ request: sinPais, env: {} });
  igual([r503.status, await r503.json()], [503, { error: 'servidor' }], 'sin binding responde 503 en JSON (el juego lo trata como falta de red)');
  let pedido = null;
  const r2 = await raiz({ request: new Request('https://tarimagame.pages.dev/?lang=en'), env: { ASSETS: { fetch: async q => { pedido = q; return new Response('<html>'); } } } });
  igual([new URL(pedido.url).pathname, await r2.text()], ['/juego', '<html>'], '«/» muestra el juego');
  igual((await raiz({ request: new Request('https://tarimagame.pages.dev/', { method: 'POST' }), env: {} })).status, 405, '«/» solo GET');
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
