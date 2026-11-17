// Prueba del cliente del servidor y de las métricas, en Node y SIN red. Uso: node tools/servidor_test.mjs
//  1. web/js/game/servidor.js contra un Worker falso: estado, copia local, pase con reintentos, «sin servidor» solo con
//     historia limpia (docs/MVP.md 7, endurecimiento 1), 429 y 503, reanudar una final una sola vez, lista, encuesta,
//     baja, modo sin API en localhost y `?muro=firme`.
//  2. web/js/game/analitica.js con un PostHog falso: no-op sin clave, cola antes de iniciar, configuración sin cookies,
//     identify con lista_id, banderas, propiedades sin datos personales, interruptor de la privacidad, y la grabación de
//     sesión (6.6): sorteo por la bandera `grabacion`, sin lienzo, campos y nombre tapados, nada sin medición.
//  3. Las Functions de Pages (functions/): pasan /api/* al Worker con la IP y el país en cabeceras propias, y «/» muestra
//     el juego.
//  1b. La regla de producción (worker/wrangler.jsonc por defecto: GRATIS_ETAPA='arranque' y ENCUESTA_LIBRE='0', el arranque
//     gratis y el correo obligatorio; decisión del dueño del 17 de noviembre: el muro sigue como está)
//     con el Worker de verdad (worker/src/index.js) en Node sobre la D1 falsa de tools/servidor_local.mjs, y con este
//     cliente hablándole: arranque gratis una vez, dos tiempos negado sin correo, permitido tras anotarse, recarga en el
//     intervalo, otra pestaña, otro dispositivo en la misma IP, la API a mano y la regla vieja por variable.
//  1c. La regla de LIF-53, pedida con variables explícitas (GRATIS_ETAPA='final' y ENCUESTA_LIBRE='1'; no es el valor por
//     defecto, queda lista para cuando el dueño la quiera): la primera final entera gratis y el cartel, que se
//     desbloquea con el correo o con las dos preguntas (una vez por dispositivo, 3 por red), y los eventos que manda el
//     Worker a PostHog (anotar_ok solo para altas nuevas, anotar_repetido, encuesta_respuesta con `desbloquea`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor, expDelPase, etapaDelPase, pareceCorreo, sugerirCorreo, CONSENTIMIENTO } from '../web/js/game/servidor.js';
import { crearAnalitica, nombreVisible, limpiarProps, fuenteTrafico, dominioReferente, campania, campaniaInicial, UTM, detalleError, proporcionGrabacion, taparTexto, taparAtributo, BLOQUEO_GRABACION, BANDERAS,
  BLOQUEO_GRABACION_LIENZO, grabaLienzo, LIENZO, escalaLienzo, rectanguloDeZona, regionesLienzo, vigiaCuadros, opcionesGrabacion, ZONAS_NOMBRE } from '../web/js/game/analitica.js';
import { reenviar } from '../functions/_reenviar.js';
import { onRequest as raiz } from '../functions/index.js';
import { VERSIONES_CONSENTIMIENTO } from '../worker/src/reglas.js';
import worker from '../worker/src/index.js';
import ES from '../web/js/game/i18n/es.js';
import EN from '../web/js/game/i18n/en.js';
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

igual(CONSENTIMIENTO, '2026-11-g', 'versión del consentimiento');
ok(VERSIONES_CONSENTIMIENTO.has(CONSENTIMIENTO), 'el Worker acepta la versión que manda el juego');
ok(['2026-11-a', '2026-11-b', '2026-11-c', '2026-11-d', '2026-11-e'].every(v => VERSIONES_CONSENTIMIENTO.has(v)), 'el Worker sigue aceptando las versiones anteriores');
{
  const priv = fs.readFileSync(path.join(ROOT, 'web/privacidad.html'), 'utf8');
  ok((priv.match(new RegExp(`class="version">(Versión|Version) ${CONSENTIMIENTO} `, 'g')) || []).length === 2, 'la privacidad muestra la misma versión en los dos idiomas');
  // Decisión del dueño del 13 de noviembre: inglés por defecto (sin mirar el navegador), novedades sin frecuencia, la
  // encuesta opcional después de anotarse y sin finales de premio.
  ok(/<html lang="en">/.test(priv) && /<article lang="en" data-idioma="en">/.test(priv) && /<article lang="es" data-idioma="es" hidden>/.test(priv), 'la privacidad abre en inglés');
  ok(!/navigator\.language/.test(priv), 'la privacidad no elige el idioma por el navegador');
  ok(!/once a month|a month|monthly|una por mes|al mes|por mes|mensual/i.test(priv), 'la privacidad no dice la frecuencia de las novedades');
  ok(/dos preguntas/.test(priv) && /two-question survey/.test(priv), 'la privacidad describe la encuesta de dos preguntas');
  // LIF-53: la encuesta ahora es un camino del cartel (desbloquea el juego libre) y lo dice
  // el texto de la encuesta tiene que decir lo que hace la regla que se publica (worker/wrangler.jsonc): con ENCUESTA_LIBRE "1"
  // (LIF-53) la encuesta desbloquea el juego libre; con "0" (producción al 17-nov) es opcional y no da ni quita nada
  if (varsDelWorker().ENCUESTA_LIBRE === '1') {
    ok(/Cualquiera de las dos te deja jugar sin límite/.test(priv) && /Either one lets you play with no limit/.test(priv), 'la privacidad dice que la encuesta desbloquea el juego libre');
    ok(!/no da ni quita nada|doesn't unlock or change anything/.test(priv), 'la privacidad ya no dice que la encuesta no da nada');
  } else {
    ok(/no da ni quita nada/.test(priv) && /doesn't unlock or change anything/.test(priv), 'la privacidad dice que la encuesta es opcional y no da ni quita nada');
    ok(!/Cualquiera de las dos te deja jugar sin límite|Either one lets you play with no limit/.test(priv), 'la privacidad no promete que la encuesta desbloquea el juego libre');
  }
}
{
  // Textos del muro y de la encuesta (docs/MVP.md 4.5): el muro solo pide el correo; la encuesta nueva, exacta.
  for (const [L, D] of [['es', ES], ['en', EN]]) {
    const claves = Object.keys(D);
    igual(claves.filter(k => /^muro\./.test(k) && /encuesta/.test(k) || /^encuesta\.(q\d|premio|titulo|falta|ya|volver|ok_)/.test(k) || k === 'lista.ok_encuesta'), [], `${L}: sin las claves de la encuesta vieja ni del camino de la encuesta en el muro`);
    ok(!Object.values(D).some(v => /once a month|monthly|una vez por mes|1 por mes|al mes\b|mensual|suscrip|subscription|\bpay\b|\bpagar\b|pagaría|consola|console/i.test(v)), `${L}: sin frecuencia de novedades, pagos ni consolas`);
  }
  igual([EN['lista.novedades'], ES['lista.novedades']], ['Also send me game news.', 'También quiero recibir novedades del juego.'], 'novedades sin frecuencia');
  igual([EN['encuesta.plataforma'], EN['encuesta.plataforma.app'], EN['encuesta.plataforma.web'], EN['encuesta.features'], EN['encuesta.features.pesista_propio'], EN['encuesta.features.mujeres_categorias'], EN['encuesta.features.sedes_campeonatos'], EN['encuesta.otra']],
    ['How would you rather play Lifting Game?', 'Mobile app (App Store / Google Play)', 'In the browser (web game)', 'What would you like the game to have?', 'Create and train your own lifter', 'Women lifters and weight classes', 'New venues and championships', 'Anything else? (optional)'], 'encuesta en inglés');
  igual([ES['encuesta.plataforma'], ES['encuesta.plataforma.app'], ES['encuesta.plataforma.web'], ES['encuesta.features'], ES['encuesta.features.pesista_propio'], ES['encuesta.features.mujeres_categorias'], ES['encuesta.features.sedes_campeonatos'], ES['encuesta.otra']],
    ['¿Cómo prefieres jugar Lifting Game?', 'App para el celular (App Store / Google Play)', 'En el navegador (juego web)', '¿Qué te gustaría que tenga el juego?', 'Crear y entrenar a tu propio pesista', 'Pesistas mujeres y categorías de peso', 'Nuevas sedes y campeonatos', '¿Algo más? (opcional)'], 'encuesta en español');
  // LIF-53: el cartel tiene los dos caminos, con los textos que pidió el dueño
  const cx = fs.readFileSync(path.join(ROOT, 'web/js/game/conexion.js'), 'utf8');
  ok(/btn-via-mail/.test(cx) && /btn-via-preguntas/.test(cx), 'el cartel tiene los dos caminos');
  igual([EN['muro.via.mail'], EN['muro.via.preguntas'], EN['encuesta.saltar'], ES['muro.via.mail'], ES['muro.via.preguntas']], ['Leave your email', 'Answer 2 quick questions', 'Skip', 'Deja tu correo', 'Responde 2 preguntas rápidas'], 'los dos caminos del cartel');
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
  igual(s.copia(), { muro: false, quedan: 2, lista: false, libre: false, motivo: null }, 'copia local después del estado');
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
  igual(s.copia(), { muro: true, quedan: 0, lista: false, libre: false, motivo: 'ip' }, 'copia en muro');
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

// ?muro=firme en localhost: Worker simulado, con 2 finales y el correo obligatorio (libre=0)
{
  const local = new Mem();
  const s = base({ host: 'localhost', buscar: '?muro=firme&gratis=2&libre=0', local, fetch: async () => { throw new Error('no debería salir'); } });
  igual(s.modo, 'simulado', 'modo simulado');
  igual((await s.estado({})).quedan, 2, 'simulado: 2 finales');
  const a = await s.pedirPase({}), b = await s.pedirPase({}), c = await s.pedirPase({});
  igual([a.estado, a.quedan, b.quedan, c.estado, c.encuesta_disponible], ['ok', 1, 0, 'muro', false], 'simulado: muro a la tercera, sin encuesta');
  igual((await s.encuesta({ r: {} })).bono, 0, 'simulado: la encuesta no da finales (correo obligatorio)');
  igual((await s.encuesta({ r: {} })).error, 'ya_respondida', 'simulado: encuesta una vez');
  igual((await s.pedirPase({})).estado, 'muro', 'simulado: después de la encuesta sigue el muro');
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'x@noexiste.com' })).error, 'dominio', 'simulado: error de dominio');
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'ana@ejemplo.com' })).estado, 'nuevo', 'simulado: anotarse');
  igual((await s.pedirPase({})).fuente, 'lista', 'simulado: juego libre');
  const fuera = base({ host: 'liftinggame.pages.dev', buscar: '?muro=firme', fetch: workerFalso({}).fetch });
  igual(fuera.modo, 'servidor', '?muro=firme no vale fuera de localhost');
}


// ?muro=firme en localhost, sin más parámetros: el Worker simulado con la regla de LIF-53 (1 final entera, el cartel, el correo o las preguntas)
{
  const local = new Mem(), sesion = new Mem();
  const s = base({ host: 'localhost', buscar: '?muro=firme', local, sesion, fetch: async () => { throw new Error('no debería salir'); } });
  const e = await s.estado({});
  igual([e.quedan, e.etapa, e.encuesta_disponible, e.regla], [1, 'completa', true, { etapa: 'final', gratis: 1, bono: 0, libre: true }], 'simulado: una final entera gratis');
  const a = await s.pedirPase({});
  igual([a.estado, a.etapa, a.quedan, (await s.envion({})).via], ['ok', 'completa', 0, 'ya'], 'simulado: la final entera, el dos tiempos sin pedir nada');
  const m = await s.pedirPase({});
  igual([m.estado, m.encuesta_disponible], ['muro', true], 'simulado: después, el cartel con las preguntas');
  igual((await s.encuesta({ r: { plataforma: 'web' } })).error, 'incompleta', 'simulado: una sola pregunta no desbloquea');
  igual(await s.encuesta({ r: { plataforma: 'web', features: ['pesista_propio'] } }), { ok: true, bono: 0, libre: true }, 'simulado: las dos preguntas desbloquean');
  const l = await s.pedirPase({});
  igual([l.estado, l.fuente, l.quedan, s.copia().libre], ['ok', 'encuesta', null, true], 'simulado: juego libre por la encuesta');
}

// ?muro=firme&etapa=arranque&libre=0 en localhost: la regla de producción (el arranque gratis, correo obligatorio)
{
  const local = new Mem(), sesion = new Mem();
  const s = base({ host: 'localhost', buscar: '?muro=firme&etapa=arranque&libre=0', local, sesion, fetch: async () => { throw new Error('no debería salir'); } });
  const e = await s.estado({});
  igual([e.quedan, e.etapa, e.regla], [1, 'arranque', { etapa: 'arranque', gratis: 1, bono: 0, libre: false }], 'simulado: un arranque gratis');
  const a = await s.pedirPase({});
  igual([a.estado, a.etapa, a.quedan], ['ok', 'arranque', 0], 'simulado: final con etapa arranque');
  igual((await s.envion({})).estado, 'muro', 'simulado: dos tiempos sin correo, muro');
  igual((await s.encuesta({ r: {} })).bono, 0, 'simulado: la encuesta no suma');
  igual([(await s.envion({})).estado, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['muro', 'arranque'], 'simulado: la encuesta no da el dos tiempos');
  igual((await s.pedirPase({})).estado, 'muro', 'simulado: ni otra final');
  await s.anotar({ nombre: 'Lucía Romero', email: 'ana@ejemplo.com' });
  igual([(await s.envion({})).via, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['lista', 'completa'], 'simulado: con el correo, el dos tiempos y el pase nuevo en la pestaña');
}

// ---------- 1b. la regla de producción (el arranque gratis, correo obligatorio) con el Worker de verdad (en Node, D1 falsa) ----------
{
  const ORIGEN = 'https://liftinggame.pages.dev';
  const logReal = console.log;
  console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('{"')) return; logReal(...a); };      // registros del Worker
  const SECRETOS = { SECRETO_IP: 'ip'.repeat(16), SECRETO_DISPOSITIVO: 'dv'.repeat(16), SECRETO_PASE: 'pa'.repeat(16), SECRETO_BAJA: 'ba'.repeat(16) };
  const vars = varsDelWorker();
  igual([vars.GRATIS_ETAPA, vars.GRATIS, vars.TOPE_IP, vars.BONO_ENCUESTA, vars.ENCUESTA_LIBRE, vars.ENCUESTAS_POR_IP], ['arranque', '1', '6', '0', '0', '3'], 'worker/wrangler.jsonc: la regla de producción es el arranque gratis con el correo obligatorio (la encuesta no desbloquea)');
  // 1b prueba la regla de producción con las variables del archivo, sin pisar ninguna. 1c prueba la de LIF-53, que se
  // pide con estas variables (`workerLocal(extra, true)`)
  const LIF53 = { GRATIS_ETAPA: 'final', GRATIS: '1', TOPE_IP: '6', BONO_ENCUESTA: '0', ENCUESTA_LIBRE: '1', ENCUESTAS_POR_IP: '3' };
  /** Un Worker con su base. `api(ruta, cuerpo, ip)` lo llama como la Function de Pages; `fetchDe(ip)` es el fetch de un navegador. */
  function workerLocal(extra = {}, lif53 = false) {
    const db = d1Falsa(), env = { ...vars, ...(lif53 ? LIF53 : {}), ...SECRETOS, ...extra, DB: db };
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
  const ENC = { plataforma: 'app', features: ['pesista_propio'], otra: 'Más rivales' };

  {
    // Jugador nuevo: el arranque de una final, gratis; el dos tiempos, negado; la próxima final, muro antes de empezar.
    const w = workerLocal(), { s, sesion } = cliente(w, '203.0.113.10');
    const e = await s.estado({ idioma: 'es' });
    igual([e.puede, e.quedan, e.etapa, e.regla, e.encuesta_disponible], [true, 1, 'arranque', { etapa: 'arranque', gratis: 1, bono: 0, libre: false }, false], 'Worker: un dispositivo nuevo tiene un arranque gratis (sin encuesta en el muro)');
    igual(e.flags['muro-partidas-gratis'], '1', 'Worker: la bandera de cuántas finales reporta lo que vale con el arranque gratis');
    const p = await s.pedirPase({ idioma: 'es' });
    igual([p.estado, p.fuente, p.etapa, p.quedan, p.encuesta_disponible, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['ok', 'gratis', 'arranque', 0, false, 'arranque'], 'Worker: el pase sale con etapa arranque');
    const v = await s.envion({ idioma: 'es' });
    igual([v.estado, v.motivo, v.encuesta_disponible], ['muro', 'envion', false], 'Worker: dos tiempos sin correo: muro, sin encuesta');
    igual((await w.filas()).map(f => f.etapa), ['arranque'], 'Worker: la partida queda en arranque');
    igual([(await s.estado({})).puede, (await s.pedirPase({})).estado], [false, 'muro'], 'Worker: la final siguiente empieza con el muro');
    igual((await w.filas()).length, 1, 'Worker: el muro no gasta nada');
    // Se anota en el intervalo: la misma final sigue con el dos tiempos, sin recargar.
    igual((await s.anotar({ nombre: 'Lucía Romero', email: 'ana@pruebas-tarima.com', idioma: 'es' })).ok, true, 'Worker: se anota');
    const v2 = await s.envion({ idioma: 'es' });
    igual([v2.estado, v2.via, v2.lista, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['ok', 'lista', true, 'completa'], 'Worker: anotado, permiso del dos tiempos de esa final');
    igual((await w.filas()).map(f => [f.etapa, f.envion_por]), [['completa', 'lista']], 'Worker: la partida pasa a completa por la lista');
    igual((await s.envion({})).via, 'ya', 'Worker: pedir el permiso otra vez no cambia nada');
    const l = await s.pedirPase({});
    igual([l.fuente, l.etapa, l.quedan], ['lista', 'completa', null], 'Worker: anotado, finales completas sin límite');
  }
  {
    // Correo obligatorio: la encuesta (aunque alguien la mande a mano sin anotarse) no da el dos tiempos ni finales.
    const w = workerLocal(), { s } = cliente(w, '203.0.113.11');
    await s.pedirPase({});
    igual(await s.encuesta({ r: ENC, idioma: 'es' }), { ok: true, bono: 0, libre: false }, 'Worker: la encuesta no suma');
    igual((await s.encuesta({ r: ENC })).error, 'ya_respondida', 'Worker: una encuesta por dispositivo');
    const v = await s.envion({});
    igual([v.estado, v.motivo, v.encuesta_disponible], ['muro', 'envion', false], 'Worker: la encuesta no da el dos tiempos');
    igual((await s.pedirPase({})).estado, 'muro', 'Worker: ni otra final');
    igual((await w.filas()).map(f => [f.fuente, f.etapa, f.envion_por]), [['gratis', 'arranque', null]], 'Worker: lo que quedó en la base');
    igual((await w.db.prepare('SELECT i FROM encuestas').all()).results, [{ i: null }], 'Worker: la encuesta sin bono no gasta los lugares de la IP');
    await s.anotar({ nombre: 'Lucía Romero', email: 'enc@pruebas-tarima.com' });
    igual((await s.envion({})).via, 'lista', 'Worker: con el correo, el dos tiempos');
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
    await b.anotar({ nombre: 'Lucía Romero', email: 'beto@pruebas-tarima.com' });
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
    // Con bono (no es producción): dos pedidos a la vez con la encuesta, uno solo pasa (la encuesta da el dos tiempos una vez).
    const w2 = workerLocal({ GRATIS: '2', BONO_ENCUESTA: '1' }), d2 = crypto.randomUUID();
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
    // La regla vieja por variable: 2 finales enteras, el dos tiempos sin pedir nada; con BONO_ENCUESTA 2, la encuesta +2.
    const w = workerLocal({ GRATIS_ETAPA: 'final', GRATIS: '2', BONO_ENCUESTA: '2' }), { s } = cliente(w, '203.0.113.15');
    const e = await s.estado({});
    igual([e.quedan, e.etapa, e.regla.etapa], [2, 'completa', 'final'], 'regla vieja: 2 finales completas');
    const a = await s.pedirPase({});
    igual([a.etapa, (await s.envion({})).via], ['completa', 'ya'], 'regla vieja: el dos tiempos no pide nada');
    await s.pedirPase({});
    igual((await s.pedirPase({})).estado, 'muro', 'regla vieja: muro a la tercera');
    igual((await s.encuesta({ r: ENC })).bono, 2, 'regla vieja: la encuesta suma 2');
  }
  {
    // Volver a la regla vieja con una final del arranque gratis en juego: esa final termina gratis, sin muro.
    const w = workerLocal(), { s } = cliente(w, '203.0.113.16');
    igual((await s.pedirPase({})).etapa, 'arranque', 'cambio de regla: la final salió con el arranque gratis');
    igual((await s.envion({})).estado, 'muro', 'cambio de regla: con la regla nueva el dos tiempos pide el correo');
    w.env.GRATIS_ETAPA = 'final'; w.env.GRATIS = '2'; w.env.BONO_ENCUESTA = '2';
    igual((await s.envion({})).via, 'ya', 'cambio de regla: con GRATIS_ETAPA=final la final en juego termina gratis');
    igual((await s.pedirPase({})).etapa, 'completa', 'cambio de regla: y la siguiente sale completa');
  }

  {
    // Quien ya dejó el correo con la versión anterior del juego (en el navegador, `tarima.lista` y nada de `tarima.libre`;
    // en la base, el dispositivo ligado a la lista) no pierde el juego libre: ni con el servidor ni sin él.
    const w = workerLocal(), { s, local } = cliente(w, '203.0.113.17');
    await s.pedirPase({}); await s.anotar({ nombre: 'Lucía Romero', email: 'antes@pruebas-tarima.com', idioma: 'es' }); await s.envion({}); s.finalTerminada();
    local.removeItem('tarima.libre');
    const { s: s2 } = cliente(w, '203.0.113.17', local);
    const e = await s2.estado({});
    igual([e.puede, e.lista, e.libre, e.quedan, e.etapa, e.encuesta_disponible], [true, true, true, null, 'completa', false], 'anotado de antes: juego libre con la regla de producción');
    local.removeItem('tarima.libre');
    const s3 = base({ fetch: async () => { throw new TypeError('sin red'); }, local });
    const c = await s3.estado({});
    igual([c.fuente, c.puede, c.lista, c.libre, (await s3.pedirPase({})).estado], ['copia', true, true, true, 'sin_servidor'], 'anotado de antes, sin servidor: la copia vieja (sin tarima.libre) se lee como juego libre');
    // Quien gastó su arranque gratis y no dejó el correo: el muro, solo con el correo; la encuesta a mano no da nada.
    const { s: s4 } = cliente(w, '203.0.113.18');
    await s4.pedirPase({}); s4.finalTerminada();
    const m = await s4.pedirPase({});
    igual([m.estado, m.motivo, m.encuesta_disponible, await s4.encuesta({ r: ENC }), (await s4.pedirPase({})).estado], ['muro', 'dispositivo', false, { ok: true, bono: 0, libre: false }, 'muro'], 'producción: gastado el arranque, el muro pide el correo y la encuesta no desbloquea');
  }

  // ---------- 1c. LIF-53 por variables explícitas (no es el valor por defecto) con el Worker de verdad ----------
  // PostHog falso: lo que el Worker manda a /i/v0/e/ queda en `capturas`; las banderas, vacías.
  const fetchReal = globalThis.fetch, capturas = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url?.url || url);
    if (/posthog\.com\/i\/v0\/e\//.test(u)) { capturas.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    if (/posthog\.com\/flags/.test(u)) return new Response(JSON.stringify({ flags: {} }), { status: 200 });
    if (/cloudflare-dns\.com/.test(u)) return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: '10 mx.prueba.' }] }), { headers: { 'content-type': 'application/dns-json' } });
    return fetchReal(url, init);
  };
  const PH = { POSTHOG_KEY: 'phc_prueba', POSTHOG_HOST: 'us.i.posthog.com' };
  try {
    {
      // Jugador nuevo que contesta las preguntas: la final entera gratis, el cartel, las preguntas y juego libre.
      const w = workerLocal(PH, true), { s, sesion } = cliente(w, '203.0.113.30');
      const e = await s.estado({ idioma: 'en' });
      igual([e.puede, e.quedan, e.etapa, e.libre, e.encuesta_disponible, e.regla], [true, 1, 'completa', false, true, { etapa: 'final', gratis: 1, bono: 0, libre: true }], 'LIF-53: un dispositivo nuevo tiene una final entera gratis');
      const p = await s.pedirPase({});
      igual([p.estado, p.fuente, p.etapa, p.quedan, JSON.parse(sesion.getItem('tarima.pase')).etapa], ['ok', 'gratis', 'completa', 0, 'completa'], 'LIF-53: el pase sale completo');
      igual((await s.envion({})).via, 'ya', 'LIF-53: el dos tiempos de la final gratis no pide nada');
      s.finalTerminada();
      const m = await s.pedirPase({});
      igual([m.estado, m.motivo, m.encuesta_disponible], ['muro', 'dispositivo', true], 'LIF-53: la segunda final: el cartel, con las preguntas como camino');
      igual((await s.encuesta({ r: { plataforma: 'app', otra: 'Más rivales' } })).error, 'incompleta', 'LIF-53: sin las dos preguntas no desbloquea');
      igual(await s.encuesta({ r: ENC, idioma: 'en', sesion: 'ph_sesion', momento: 'podio' }), { ok: true, bono: 0, libre: true }, 'LIF-53: las dos preguntas desbloquean');
      igual([s.copia().libre, s.copia().muro], [true, false], 'LIF-53: juego libre en la copia');
      const l = await s.pedirPase({});
      igual([l.estado, l.fuente, l.libre, l.quedan], ['ok', 'encuesta', true, null], 'LIF-53: juego libre por la encuesta');
      igual((await s.encuesta({ r: ENC })).error, 'ya_respondida', 'LIF-53: una encuesta por dispositivo');
      const enc = capturas.filter(c => c.event === 'encuesta_respuesta');
      igual(enc.map(c => [c.distinct_id, c.properties.desbloquea, c.properties.momento, c.properties.plataforma]), [['ph_sesion', true, 'podio', 'app']], 'LIF-53: encuesta_respuesta dice que desbloqueó');
      igual((await w.db.prepare('SELECT COUNT(*) n, SUM(i IS NOT NULL) con_ip FROM encuestas').first()), { n: 1, con_ip: 1 }, 'LIF-53: la encuesta con desbloqueo guarda el código de la IP (para el tope de la red)');
    }
    {
      // La red: tres encuestas con desbloqueo en 30 días; la cuarta, error 'ip' (queda el correo). Por la API a mano, igual.
      const w = workerLocal(PH, true), ip = '203.0.113.31', res = [];
      for (let k = 0; k < 4; k++) {
        const { s } = cliente(w, ip);
        await s.pedirPase({}); s.finalTerminada();
        const m = await s.pedirPase({});
        await w.db.prepare('DELETE FROM limites').run();      // el límite de pedidos (3 por hora) es otra cosa: acá se mira el tope de la red
        const r = await s.encuesta({ r: ENC });
        res.push([m.encuesta_disponible, r.ok ? 'libre' : r.error]);
      }
      await w.db.prepare('DELETE FROM limites').run();
      igual(res, [[true, 'libre'], [true, 'libre'], [true, 'libre'], [false, 'ip']], 'LIF-53: 3 encuestas con desbloqueo por red; la cuarta, no (y el cartel ya no la ofrece)');
      const a = await w.api('/api/encuesta', { dispositivo: crypto.randomUUID(), r: ENC }, ip);
      igual([a.status, a.j.error], [409, 'ip'], 'LIF-53: por la API a mano, desde la misma red, tampoco');
      const b = await w.api('/api/encuesta', { dispositivo: crypto.randomUUID(), r: { plataforma: 'web' } }, '203.0.113.32');
      igual([b.status, b.j.error], [400, 'incompleta'], 'LIF-53: por la API a mano, sin las dos preguntas, no desbloquea');
    }
    {
      // El correo: juego libre; las preguntas después, optativas (no desbloquean nada ni gastan la red). anotar_ok lo
      // manda el Worker solo para altas nuevas; un correo que ya estaba, anotar_repetido.
      capturas.length = 0;
      const w = workerLocal(PH, true), { s } = cliente(w, '203.0.113.33');
      await s.pedirPase({}); s.finalTerminada();
      igual((await s.pedirPase({})).estado, 'muro', 'LIF-53: el cartel');
      const a = await s.anotar({ nombre: 'Lucía Romero', email: 'lucia@pruebas-tarima.com', idioma: 'es', novedades: false, momento: 'podio', pantalla: 'muro', metricas: true });
      igual([a.ok, a.estado], [true, 'nuevo'], 'LIF-53: se anota');
      const l = await s.pedirPase({});
      igual([l.fuente, l.libre, l.quedan], ['lista', true, null], 'LIF-53: con el correo, juego libre');
      igual(await s.encuesta({ r: { plataforma: 'web' }, momento: 'podio' }), { ok: true, bono: 0, libre: false }, 'LIF-53: después del correo las preguntas son optativas (y alcanza con una)');
      igual((await w.db.prepare('SELECT i FROM encuestas').all()).results, [{ i: null }], 'LIF-53: la optativa no gasta la red');
      // el mismo correo desde otro dispositivo, y otra vez desde el mismo: anotar_repetido (y nada más en D1)
      const otro = cliente(w, '203.0.113.34').s;
      igual((await otro.anotar({ nombre: 'Lucía Romero', email: 'lucia@pruebas-tarima.com', metricas: true, momento: 'inicio', pantalla: 'muro' })).estado, 'nuevo', 'el correo repetido desde otro dispositivo: misma respuesta (no revela quién está)');
      igual((await s.anotar({ nombre: 'Lucía Romero', email: 'lucia@pruebas-tarima.com', metricas: true })).estado, 'ya_estaba', 'desde el mismo: ya_estaba');
      // sin medición (metricas false), nada
      await cliente(w, '203.0.113.35').s.anotar({ nombre: 'Beto Gómez', email: 'beto@pruebas-tarima.com', novedades: true, metricas: false });
      const ev = capturas.filter(c => /^anotar_/.test(c.event)).map(c => [c.event, c.properties.novedades, c.properties.momento, c.properties.pantalla, c.properties.mismo_dispositivo ?? null, /^[0-9a-f]{32}$/.test(c.distinct_id)]);
      igual(ev, [['anotar_ok', false, 'podio', 'muro', null, true], ['anotar_repetido', null, 'inicio', 'muro', false, true], ['anotar_repetido', null, null, null, true, true]], 'Worker: anotar_ok solo para el alta nueva; anotar_repetido para el correo que ya estaba; nada sin medición');
      ok(!JSON.stringify(capturas).includes('@'), 'Worker: ningún evento lleva el correo');
      igual(await w.db.prepare('SELECT COUNT(*) n FROM lista').first('n'), 2, 'en la lista quedaron 2 altas');
    }
    {
      // Volver atrás por variable: ENCUESTA_LIBRE "0" (correo obligatorio): el cartel sin las preguntas.
      const w = workerLocal({ ...PH, ENCUESTA_LIBRE: '0' }, true), { s } = cliente(w, '203.0.113.36');
      await s.pedirPase({}); s.finalTerminada();
      const m = await s.pedirPase({});
      igual([m.estado, m.encuesta_disponible], ['muro', false], 'ENCUESTA_LIBRE 0: el cartel solo con el correo');
      igual(await s.encuesta({ r: ENC }), { ok: true, bono: 0, libre: false }, 'ENCUESTA_LIBRE 0: la encuesta no desbloquea');
      igual((await s.pedirPase({})).estado, 'muro', 'ENCUESTA_LIBRE 0: sigue el cartel');
    }
  } finally { globalThis.fetch = fetchReal; }
  console.log = logReal;
}

// anotar
{
  const local = new Mem({ 'tarima.muro': '1', 'tarima.quedan': '0' });
  const w = workerFalso({ '/api/anotar': [[200, { estado: 'nuevo', lista_id: 'f'.repeat(32), confirmar: false }], [400, { error: 'descartable' }], [429, { error: 'limite' }], 'red'] });
  const s = base({ fetch: w.fetch, local });
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'mal' })).error, 'formato', 'formato sin pedir nada');
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'ana@ejemplo.com', aviso: false })).error, 'aviso', 'aviso obligatorio');
  igual(w.pedidos.length, 0, 'los errores locales no salen');
  // LIF-32: nombre real obligatorio (mínimo 5, sin números ni símbolos, sin «AAAA» ni tecleo al azar); no sale nada si falla
  for (const malo of [undefined, '', '   ', 'Rookie', 'Joe', 'AAAA', 'Test', 'Ab1d', 'AAAAA', '*****', '2394932fjdksAAA', 'fjdks', 'asdfgh', 'Test User', 'Nasar1', 'N@sar'])
    igual((await s.anotar({ nombre: malo, email: 'ana@ejemplo.com' })).error, 'nombre', `nombre rechazado: ${JSON.stringify(malo)}`);
  igual(w.pedidos.length, 0, 'un nombre inválido no sale al servidor');
  // decisión del 15 de noviembre: el mínimo baja a 4 letras (sin cambiar lo demás)
  { const { nombreReal } = await import('../web/js/game/nombre.js'); igual(['Mila', 'Erin', 'Joon', 'Joe'].map(n => nombreReal(n).ok), [true, true, true, false], 'nombre: «Mila», «Erin» y «Joon» pasan; «Joe», no'); }
  const r = await s.anotar({ email: ' Ana@Ejemplo.com ', nombre: '  Ana   Belén ', idioma: 'es', novedades: true, sesion: 'ph_abc' });
  igual([r.ok, r.estado, r.confirmar], [true, 'nuevo', false], 'alta');
  const c = w.pedidos[0].cuerpo;
  igual([c.email, c.aviso, c.novedades, c.consentimiento, c.nombre, c.web, c.sesion], ['Ana@Ejemplo.com', true, true, CONSENTIMIENTO, 'Ana Belén', '', 'ph_abc'], 'cuerpo del alta (nombre limpio)');
  igual(s.copia(), { muro: false, quedan: null, lista: true, libre: true, motivo: null }, 'anotado: juego libre en la copia');
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'ana@ejemplo.com' })).error, 'descartable', 'error del Worker');
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'ana@ejemplo.com' })).error, 'limite', '429');
  igual((await s.anotar({ nombre: 'Lucía Romero', email: 'ana@ejemplo.com' })).error, 'red', 'sin red');
}

// encuesta y baja
{
  const local = new Mem({ 'tarima.muro': '1', 'tarima.quedan': '0' });
  const w = workerFalso({ '/api/encuesta': [[200, { estado: 'ok', bono: 2 }], [409, { error: 'ya_respondida' }], [400, { error: 'incompleta' }]], '/api/baja': [[202, {}], [429, { error: 'limite' }]] });
  const s = base({ fetch: w.fetch, local });
  igual(await s.encuesta({ r: { plataforma: 'web' }, idioma: 'es', sesion: 's' }), { ok: true, bono: 2, libre: false }, 'encuesta con premio (si el Worker lo diera)');
  igual(w.pedidos.at(-1).cuerpo.r, { plataforma: 'web' }, 'la encuesta manda las respuestas tal cual');
  igual(s.copia(), { muro: false, quedan: 2, lista: false, libre: false, motivo: null }, 'la encuesta saca el muro y suma 2');
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
    capture(e, p, o) { this.llamadas.push(['capture', e, p, o]); }, identify(id, set, setOnce) { this.llamadas.push(['identify', id, set, setOnce]); },
    get_distinct_id() { return 'ph_distinto'; }, set_config(c) { this.llamadas.push(['set_config', c]); },
    stopSessionRecording() { this.llamadas.push(['stopSessionRecording']); } };
  return ph;
}
const ventanaFalsa = (o = {}) => ({ location: { search: o.search ?? '', origin: 'https://liftinggame.pages.dev' }, matchMedia: () => ({ matches: true }), navigator: o.navigator, addEventListener() {} });
const ESTADO = { metricas: { clave: 'phc_PRUEBA123', host: '/qx', ui: 'https://us.posthog.com' }, flags: { 'muro-texto': 'b' }, contexto: { pais: 'AR', previas: 1, dias: '0' } };

igual(limpiarProps({ nombre: 'Ana', email: 'a@b.com', ip: '1.2.3.4', dispositivo: 'x', n: 1, ok: true, txt: 'ana@b.com', obj: {}, pantalla: 'muro' }), { n: 1, ok: true, pantalla: 'muro' }, 'propiedades sin datos personales');
igual([fuenteTrafico('?utm_source=Amigos'), fuenteTrafico('?c=abc'), fuenteTrafico('')], ['amigos', 'compartido', 'directo'], 'fuente_trafico');
igual([fuenteTrafico('?fbclid=PAZ'), fuenteTrafico('?ttclid=1'), fuenteTrafico('', 'https://l.instagram.com/?u=x'), fuenteTrafico('', 'https://t.co/abc'),
  fuenteTrafico('', 'https://www.google.com/'), fuenteTrafico('', 'https://foro.ejemplo.org/hilo/3'), fuenteTrafico('', 'https://liftinggame.pages.dev/x', 'https://liftinggame.pages.dev'),
  fuenteTrafico('?utm_source=ig&fbclid=1', 'https://l.facebook.com/')],
  ['facebook', 'tiktok', 'instagram', 'x', 'google', 'otro_sitio', 'directo', 'ig'], 'fuente_trafico con click-id y referente');
// UTM (LIF-55): limpios, nunca un correo ni un teléfono; fuente_trafico usa la misma limpieza.
igual(UTM, ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'], 'los cuatro UTM');
igual(campania('?utm_source=Reddit&utm_medium=social&utm_campaign=lanzamiento-2026-11&utm_content=Clip Arranque+1&utm_term=x'),
  { utm_source: 'reddit', utm_medium: 'social', utm_campaign: 'lanzamiento-2026-11', utm_content: 'clip_arranque_1' }, 'campania: minúscula, espacios a _');
igual(campania(''), { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null }, 'campania sin UTM: todo null');
igual(campania('?utm_source=juan%40mail.com&utm_medium=%2B54%209%2011%204567-8901&utm_campaign=Ñandú%20Rápido&utm_content=%3Cscript%3E' + 'x'.repeat(80)),
  { utm_source: null, utm_medium: null, utm_campaign: 'nandu_rapido', utm_content: ('scriptx' + 'x'.repeat(79)).slice(0, 60) }, 'campania: sin correo ni teléfono, sin acentos ni signos, 60 caracteres');
igual([fuenteTrafico('?utm_source=a%40b.com&c=1'), fuenteTrafico('?utm_source=Grupo WhatsApp')], ['compartido', 'grupo_whatsapp'], 'fuente_trafico descarta un utm_source con correo');
igual(campaniaInicial('?utm_source=x&utm_medium=social', 'https://t.co/a', 'https://liftinggame.pages.dev'),
  { $initial_fuente_trafico: 'x', $initial_utm_source: 'x', $initial_utm_medium: 'social', $initial_utm_campaign: null, $initial_utm_content: null }, 'campaniaInicial');
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
  igual([reg.utm_source, reg.utm_medium, reg.utm_campaign, reg.utm_content], [null, null, null, null], 'sin UTM en la URL: null');
  const orden = ph.llamadas.filter(l => l[0] !== 'init' && l[0] !== 'register' || l[1]?.pantalla).map(l => l[0] === 'capture' ? l[1] : l[0] === 'register' ? 'pantalla' : l[0]);
  igual(orden, ['identify', 'juego_abierto', 'pantalla'], 'la cola sale en orden, con identify primero');
  ok(ph.llamadas.find(l => l[1] === 'juego_abierto')[3]?.timestamp instanceof Date, 'los eventos de la cola llevan su hora');
  a.ev('anotar_ok', { estado: 'nuevo', email: 'no@va.com' });
  igual(ph.llamadas.at(-1), ['capture', 'anotar_ok', { estado: 'nuevo' }, undefined], 'evento directo y sin correo');
  igual(a.idSesion(), 'ph_distinto', 'idSesion es el de PostHog');
  a.encuestaVista({ momento: 'podio', paso: 'cartel' });
  igual(ph.llamadas.at(-1).slice(1, 3), ['encuesta_vista', { momento: 'podio', paso: 'cartel' }], 'encuesta_vista, sin id de encuesta de PostHog');
  a.encuestaCerrada({ momento: 'inicio', paso: 'anotado' });
  igual(ph.llamadas.at(-1).slice(1, 3), ['encuesta_salteada', { momento: 'inicio', paso: 'anotado' }], 'encuesta_salteada');
  // LIF-46: al irse de la página el evento sale ya, por sendBeacon
  a.ev('siguio_jugando', { siguio: false }, { beacon: true });
  igual(ph.llamadas.at(-1).slice(1), ['siguio_jugando', { siguio: false }, { send_instantly: true, transport: 'sendBeacon' }], 'evento por sendBeacon al irse');
  igual(sesion.getItem('tarima.clave_publica'), 'phc_PRUEBA123', 'la clave pública queda en la pestaña para la privacidad');
  a.consentir();
  igual(ph.llamadas.at(-1), ['set_config', { persistence: 'localStorage+cookie' }], 'consentir cambia la persistencia');
}
{
  // UTM en la URL: súper propiedades limpias, PostHog no guarda los crudos, y $initial_* con $set_once al identificar.
  const ph = posthogFalso();
  const v = ventanaFalsa({ search: '?utm_source=Reddit&utm_medium=social&utm_campaign=lanzamiento&utm_content=r_weightlifting&fbclid=ABC' });
  const a = crearAnalitica({ ventana: v, local: new Mem(), sesion: new Mem(), cargar: async () => ph, azar: () => 0.99 });
  await a.iniciar({ estado: { ...ESTADO, lista_id: 'b'.repeat(32) } });
  const cfg = ph.llamadas.find(l => l[0] === 'init')[2];
  igual([cfg.save_campaign_params, cfg.save_referrer, cfg.mask_personal_data_properties], [false, false, true], 'posthog-js no guarda UTM ni referente crudos y tapa los click-ids de la URL');
  const reg = ph.llamadas.find(l => l[0] === 'register')[1];
  igual([reg.fuente_trafico, reg.utm_source, reg.utm_medium, reg.utm_campaign, reg.utm_content, 'fbclid' in reg],
    ['reddit', 'reddit', 'social', 'lanzamiento', 'r_weightlifting', false], 'UTM como súper propiedades');
  igual(ph.llamadas.find(l => l[0] === 'identify'), ['identify', 'b'.repeat(32), undefined,
    { $initial_fuente_trafico: 'reddit', $initial_utm_source: 'reddit', $initial_utm_medium: 'social', $initial_utm_campaign: 'lanzamiento', $initial_utm_content: 'r_weightlifting' }],
    'identify con $set_once de la atribución inicial');
  ok(!JSON.stringify(ph.llamadas).includes('ABC'), 'el click-id no viaja');
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
  const armar = ({ grabacion, lienzo, extra = {}, azar = () => 0, local = new Mem(), falla = false, documento = null, search = '' } = {}) => {
    const ph = posthogFalso(), orden = [];
    const ini = ph.init; ph.init = function (k, c) { orden.push('init'); return ini.call(this, k, c); };
    const v = { ...ventanaFalsa({ search }), document: documento, ...extra };
    let tiradas = 0;
    const a = crearAnalitica({ ventana: v, local, sesion: new Mem(), cargar: async () => { orden.push('posthog'); return ph; },
      cargarGrabador: async () => { orden.push('grabador'); if (falla) throw new Error('no'); }, azar: () => { tiradas++; return azar(); } });
    const est = { ...ESTADO, flags: { 'muro-texto': 'b', ...(grabacion === undefined ? {} : { grabacion }), ...(lienzo === undefined ? {} : { grabacion_lienzo: lienzo }) } };
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
    igual([x.a.grabandoLienzo(), x.reg().grabada_lienzo, sr.canvasCapture], [false, false, undefined], 'todas en un teléfono (pointer: coarse): sin lienzo (grabacion_lienzo = compu)');
    x.a.desactivarMedicion();
    igual([x.ph.llamadas.some(l => l[0] === 'stopSessionRecording'), x.a.grabando()], [true, false], 'desactivar la medición corta la grabación');
  }
  // ---- el lienzo 3D (LIF-45): bandera grabacion_lienzo, opciones del grabador y los carteles con el nombre tapados ----
  {
    igual(BANDERAS.grabacion_lienzo, 'compu', 'grabacion_lienzo: solo en computadora por defecto');
    igual([grabaLienzo('off', false), grabaLienzo('compu', false), grabaLienzo('compu', true), grabaLienzo('todas', true), grabaLienzo('movil', false), grabaLienzo(undefined, false)],
      [false, true, false, true, false, false], 'grabaLienzo: off, compu (sin pantalla táctil), todas; un valor desconocido no graba');
    ok(!/\bcanvas\b/.test(BLOQUEO_GRABACION_LIENZO) && /#senal\b/.test(BLOQUEO_GRABACION_LIENZO), 'con lienzo: los lienzos se graban, la señal sigue bloqueada');
    ok(LIENZO.fps > 0 && LIENZO.fps <= 4 && LIENZO.calidad <= 0.5 && LIENZO.ancho <= 800, `pocos cuadros y baja calidad (${LIENZO.fps} por segundo, calidad ${LIENZO.calidad}, ${LIENZO.ancho} px)`);
    igual([escalaLienzo(1280), escalaLienzo(320), escalaLienzo(20000), escalaLienzo(undefined)], [0.5, 1, 0.1, 0.5], 'escala de la captura: hasta LIENZO.ancho px');
    const sin = opcionesGrabacion(() => []), con = opcionesGrabacion(() => [], { escala: 0.5, regiones: () => [] });
    igual([sin.captureCanvas.recordCanvas, sin.canvasCapture, sin.blockSelector], [false, undefined, BLOQUEO_GRABACION], 'opciones sin lienzo');
    igual([con.captureCanvas, con.canvasCapture.resolutionScale, typeof con.canvasCapture.maskRegionsFn, con.blockSelector, con.maskAllInputs],
      [{ recordCanvas: true, canvasFps: LIENZO.fps, canvasQuality: LIENZO.calidad }, 0.5, 'function', BLOQUEO_GRABACION_LIENZO, true], 'opciones con lienzo: pocos cuadros, baja calidad, carteles tapados');
  }
  {
    // Una computadora (sin pointer: coarse) con lo que necesita el grabador del lienzo.
    const compu = { matchMedia: () => ({ matches: false }), OffscreenCanvas: function () {}, createImageBitmap() {}, innerWidth: 1600, requestAnimationFrame() { return 1; } };
    const correr = async o => { const x = armar({ grabacion: 'todas', ...o }); await x.a.iniciar({ estado: x.est }); return x; };
    const def = await correr({ extra: compu });
    const sr = def.cfg().session_recording, rc = def.v._POSTHOG_REMOTE_CONFIG?.phc_PRUEBA123?.config?.sessionRecording;
    igual([def.a.grabandoLienzo(), def.reg().grabada_lienzo, def.reg()['$feature/grabacion_lienzo'], sr.captureCanvas.recordCanvas, sr.canvasCapture.resolutionScale, sr.blockSelector, rc?.recordCanvas, rc?.canvasFps],
      [true, true, 'compu', true, 0.4, BLOQUEO_GRABACION_LIENZO, true, LIENZO.fps], 'computadora con la bandera por defecto: se graba el lienzo');
    const off = await correr({ extra: compu, lienzo: 'off' });
    igual([off.a.grabando(), off.a.grabandoLienzo(), off.cfg().session_recording.captureCanvas.recordCanvas, off.reg().grabada_lienzo], [true, false, false, false], 'grabacion_lienzo = off: la página sí, el lienzo no');
    const tel = await correr({ extra: { ...compu, matchMedia: () => ({ matches: true }) }, lienzo: 'todas' });
    igual([tel.a.grabandoLienzo(), tel.reg().tactil], [true, true], 'grabacion_lienzo = todas: también en un teléfono');
    const viejo = await correr({ extra: { ...compu, OffscreenCanvas: undefined } });
    igual(viejo.a.grabandoLienzo(), false, 'sin OffscreenCanvas el grabador no puede: sin lienzo');
    const nada = armar({ grabacion: 'off', extra: compu, lienzo: 'todas' }); await nada.a.iniciar({ estado: nada.est });
    igual([nada.a.grabando(), nada.a.grabandoLienzo(), nada.reg().grabada_lienzo], [false, false, false], 'el lienzo solo va en las cargas que se graban');
    def.a.desactivarMedicion();
    igual(def.a.grabandoLienzo(), false, 'desactivar la medición corta también el lienzo');
  }
  {
    // Proyección: cámara en (0, 0, 5) mirando a -z, perspectiva de 90° y aspecto 1; plano de 2 × 2 en el origen.
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const vista = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
    const n = 0.1, f = 100, proyeccion = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -(f + n) / (f - n), -1, 0, 0, -2 * f * n / (f - n), 0];
    const base = { mundo: I, vista, proyeccion, w: 2, h: 2, ancho: 1000, alto: 1000, margen: 0 };
    const cerca = (r, e) => r && ['x', 'y', 'width', 'height'].every(k => Math.abs(r[k] - e[k]) <= 5);
    const todo = rectanguloDeZona({ ...base, zona: [0, 1, 0, 1] });
    ok(cerca(todo, { x: 400, y: 400, width: 200, height: 200 }), `el plano entero en el centro de la pantalla (${JSON.stringify(todo)})`);
    const der = rectanguloDeZona({ ...base, zona: [0.5, 1, 0, 0.5] });
    ok(cerca(der, { x: 500, y: 400, width: 100, height: 100 }), `la cuarta parte de arriba a la derecha (u a la derecha, v hacia abajo): ${JSON.stringify(der)}`);
    const esp = rectanguloDeZona({ ...base, zona: [0, 1, 0, 1], mundo: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1], espejoY: 0 });
    ok(cerca(esp, { x: 400, y: 600, width: 200, height: 200 }), `reflejado en y = 0 queda abajo (${JSON.stringify(esp)})`);
    igual(rectanguloDeZona({ ...base, zona: [0, 1, 0, 1], mundo: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 10, 1] }), null, 'detrás de la cámara: nada');
    igual(rectanguloDeZona({ ...base, zona: [0, 1, 0, 1], mundo: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 5, 1], w: 2, h: 40 }), { x: 0, y: 0, width: 1000, height: 1000 }, 'en parte detrás de la cámara: todo el lienzo');
    igual(rectanguloDeZona({ ...base, zona: [0, 1, 0, 1], mundo: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 0, 1] }), null, 'fuera del cuadro: nada');
    const conMargen = rectanguloDeZona({ ...base, zona: [0, 1, 0, 1], margen: 0.1 });
    ok(conMargen.width > todo.width + 30 && conMargen.x < todo.x, 'con margen el rectángulo crece');

    // regionesLienzo con una escena falsa: la pantalla LED, el tablero (hallado por su textura) y el reflejo.
    const boardTex = {}, tablero = { isMesh: true, visible: true, material: { map: boardTex }, geometry: { parameters: { width: 2, height: 2 } }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2, 0, 0, 1] } };
    const pantalla = { isMesh: true, visible: true, material: {}, geometry: { parameters: { width: 2, height: 2 } }, matrixWorld: { elements: I } };
    let preservar = false;
    const escena = (o = {}) => ({
      arena: { pantalla, boardTex, group: { traverse: fn => [pantalla, tablero].forEach(fn) } },
      rig: { camera: { projectionMatrix: { elements: proyeccion }, matrixWorldInverse: { elements: vista } } },
      renderer: { getContext: () => ({ getContextAttributes: () => ({ preserveDrawingBuffer: preservar }) }) },
      reflejo: { activo: false, y: 0 }, ...o,
    });
    const lienzo = { id: 'gl', clientWidth: 1000, clientHeight: 1000 };
    const r = regionesLienzo(lienzo, escena());
    const [u0, u1, v0, v1] = ZONAS_NOMBRE.led;
    ok(r.length === 2 && r[0].x < 500 + 100 * (u0 * 2 - 1) && r[0].x + r[0].width >= 500 + 100 * (u1 * 2 - 1) && r[0].y < 400 + 200 * v0 + 1 && r[0].y + r[0].height > 400 + 200 * v1,
      `LED: la línea del nombre de la caja derecha tapada (${JSON.stringify(r[0])})`);
    ok(r[1].x <= 300 && r[1].x + r[1].width >= 400, `tablero del costado: la línea del nombre tapada de lado a lado (${JSON.stringify(r[1])})`);
    igual(regionesLienzo(lienzo, escena({ reflejo: { activo: true, y: 0 } })).length, 4, 'con el reflejo de la tarima prendido: también los carteles reflejados');
    igual(regionesLienzo({ id: 'ayudas', clientWidth: 10, clientHeight: 10 }, null), [], 'las ayudas no tienen nombres');
    const tira = (fn, m) => { let t = false; try { fn(); } catch { t = true; } ok(t, m); };
    tira(() => regionesLienzo(lienzo, null), 'sin escena: tira (el grabador saltea el cuadro)');
    tira(() => regionesLienzo(lienzo, escena({ arena: { boardTex: {} } })), 'sin pantalla LED: tira');
    tira(() => regionesLienzo(lienzo, escena({ arena: { pantalla, boardTex: {}, group: { traverse: fn => [pantalla].forEach(fn) } } })), 'tablero que no se encuentra: tira');
    tira(() => regionesLienzo(lienzo, escena(), () => false), 'sin preserveDrawingBuffer y sin dibujar en este cuadro: tira (se leería negro)');
    preservar = true;
    igual(regionesLienzo(lienzo, escena(), () => false).length, 2, 'con preserveDrawingBuffer el cuadro sirve aunque no se haya dibujado');
    // LIF-45: con «LIFTING GAME» en los carteles (entero) o un rival levantando, nada que tapar; con el nombre del jugador, sí
    const conCartel = b => escena({ arena: { pantalla, boardTex, board: b, group: { traverse: fn => [pantalla, tablero].forEach(fn) } } });
    igual(regionesLienzo(lienzo, conCartel({ name: 'LIFTING GAME', entero: true, jugador: true })), [], 'carteles con LIFTING GAME: no se tapa nada (el pesista queda a la vista)');
    igual(regionesLienzo(lienzo, conCartel({ name: 'Ventura', jugador: false })), [], 'levanta un rival (nombre ficticio): no se tapa nada');
    igual(regionesLienzo(lienzo, conCartel({ name: 'Ana Pérez', jugador: true })).length, 2, 'el nombre del jugador ya dibujado: se tapa (respaldo)');
    igual(regionesLienzo(lienzo, conCartel({})).length, 2, 'cartel sin datos: se tapa');
    preservar = false; tira(() => regionesLienzo(lienzo, conCartel({ entero: true }), () => false), 'con LIFTING GAME igual se saltea un cuadro sin dibujar');
  }
  {
    // vigiaCuadros: fresco solo en el cuadro en que three dibujó (renderer.info.render.frame cambió).
    const cola = []; let t = 0;
    const info = { render: { frame: 0 } };
    const v = { requestAnimationFrame: fn => cola.push(fn), document: { timeline: { get currentTime() { return t; } } }, JUEGO: { escena: { renderer: { info } } } };
    const vg = vigiaCuadros(v);
    const cuadro = dibuja => { t += 16; if (dibuja) info.render.frame++; const fs = cola.splice(0); fs.forEach(f => f(t)); return vg.fresco(); };
    igual([cuadro(true), cuadro(true), cuadro(false), cuadro(true)], [true, true, false, true], 'vigía: fresco en los cuadros dibujados');
    t += 5; igual(vg.fresco(), false, 'vigía: fuera del cuadro mirado, no');
    vg.parar(); cuadro(true); igual(cola.length, 0, 'vigía: parar() corta su requestAnimationFrame');
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
