// Pruebas del Worker de Tarima en el runtime de Workers (docs/MVP.md 5.5, 6.2 y 7). Las salidas a la red (DNS sobre
// HTTPS, PostHog, Turnstile) se reemplazan por respuestas fijas: estas pruebas no salen a internet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index.js';
import { codigoDispositivo, leerPase } from '../src/cripto.js';

const ORIGEN = 'https://tarima.test';
let nIp = 0;
const nuevaIp = () => `198.51.${100 + Math.floor(nIp / 250)}.${(nIp++ % 250) + 1}`;
const uuid = () => crypto.randomUUID();
const E = (extra = {}) => Object.assign({}, env, extra);

let salidas; // pedidos que el Worker hizo hacia afuera
let flagsRespuesta; // lo que contesta el /flags falso de PostHog
let logs;

beforeEach(() => {
  salidas = [];
  flagsRespuesta = null;
  logs = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, init = {}) => {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? null : await req.text();
    salidas.push({ url: u, metodo: req.method, headers: req.headers, cuerpo });
    if (u.hostname === 'cloudflare-dns.com') {
      const nombre = u.searchParams.get('name'), tipo = u.searchParams.get('type');
      if (nombre.startsWith('noexiste')) return Response.json({ Status: 3 });
      if (nombre.startsWith('mxnulo')) return Response.json({ Status: 0, Answer: [{ type: 15, data: '0 .' }] });
      if (nombre.startsWith('solo-a')) return Response.json(tipo === 'MX' ? { Status: 0 } : { Status: 0, Answer: [{ type: 1, data: '192.0.2.1' }] });
      return Response.json({ Status: 0, Answer: [{ type: 15, data: `10 mx.${nombre}.` }] });
    }
    if (u.hostname === 'us.i.posthog.com' && u.pathname === '/flags') {
      return flagsRespuesta ? Response.json(flagsRespuesta) : new Response('no', { status: 500 });
    }
    if (u.hostname === 'us.i.posthog.com') return new Response('{"status":1}', { headers: { 'set-cookie': 'x=1' } });
    if (u.hostname === 'us-assets.i.posthog.com') return new Response('/* array.js */', { headers: { 'content-type': 'application/javascript' } });
    throw new Error('salida no esperada: ' + u.hostname);
  });
  const guardar = (...a) => logs.push(a.join(' '));
  vi.spyOn(console, 'log').mockImplementation(guardar);
  vi.spyOn(console, 'error').mockImplementation(guardar);
});
afterEach(() => vi.restoreAllMocks());

async function llamar(ruta, cuerpo, o = {}) {
  const { ip = '192.0.2.10', cookie, origin = ORIGEN, ct = 'application/json', e = env, metodo = 'POST', headers = {} } = o;
  const h = { 'cf-connecting-ip': ip, ...headers };
  if (origin) h.origin = origin;
  if (ct) h['content-type'] = ct;
  if (cookie) h.cookie = cookie;
  const body = metodo === 'GET' || metodo === 'HEAD' ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo ?? {});
  const req = new Request(ORIGEN + ruta, { method: metodo, headers: h, body });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, e, ctx);
  await waitOnExecutionContext(ctx);
  let j = null;
  try { j = await res.clone().json(); } catch { /* no es JSON */ }
  return { res, j, status: res.status };
}

const pedirPartida = (dispositivo, ip, o = {}) => llamar('/api/partida', { dispositivo, idioma: 'es' }, { ip, ...o });
const RESP_OK = { q1: ['sedes', 'pesista_propio'], q2: ['nada'], q3: 'telefono', q4: 'cosmeticos', q5: 'Más rivales <b>y</b> sedes' };

describe('sitio', () => {
  it('el sitio lo sirve Pages: el Worker no tiene assets y lo que no es suyo da 404', async () => {
    expect(env.ASSETS).toBeUndefined();
    for (const ruta of ['/', '/juego.html', '/privacidad.html']) expect((await llamar(ruta, null, { metodo: 'GET', ct: null })).status).toBe(404);
  });
  it('detrás de Pages cuenta la IP de x-tarima-ip, y sin CONFIAR_PAGES la ignora', async () => {
    const real = nuevaIp(), falsa = nuevaIp();
    const a = uuid(), b = uuid(), c = uuid();
    // Tres dispositivos desde la misma IP real, cada uno con otra cf-connecting-ip (la de Pages): la IP real llega al tope.
    for (const x of [a, b, c]) { for (let k = 0; k < 2; k++) await pedirPartida(x, nuevaIp(), { headers: { 'x-tarima-ip': real } }); }
    expect((await pedirPartida(uuid(), nuevaIp(), { headers: { 'x-tarima-ip': real } })).j.motivo).toBe('ip');
    // Sin confianza, la cabecera no cuenta: vale cf-connecting-ip.
    expect((await pedirPartida(uuid(), falsa, { headers: { 'x-tarima-ip': real }, e: E({ CONFIAR_PAGES: '0' }) })).j.estado).toBe('ok');
    const r = await llamar('/api/estado', {}, { ip: nuevaIp(), headers: { 'x-tarima-pais': 'UY' } });
    expect(r.j.contexto.pais).toBe('UY');
  });
  it('una ruta de la API que no existe da 404 en JSON', async () => {
    const r = await llamar('/api/nada', {});
    expect(r.status).toBe(404);
    expect(r.j).toEqual({ error: 'no_existe' });
  });
});

describe('validación de los POST', () => {
  it('pide Origin del sitio, JSON y hasta 4 KB', async () => {
    expect((await llamar('/api/estado', {}, { origin: null })).status).toBe(403);
    expect((await llamar('/api/estado', {}, { origin: 'https://otro.test' })).status).toBe(403);
    expect((await llamar('/api/estado', {}, { ct: 'text/plain' })).status).toBe(415);
    expect((await llamar('/api/estado', '{no es json')).j).toEqual({ error: 'formato' });
    expect((await llamar('/api/estado', { relleno: 'x'.repeat(5000) })).status).toBe(413);
    expect((await llamar('/api/estado', {}, { metodo: 'GET', ct: null })).status).toBe(405);
  });
  it('sin secretos responde 503 y no cuenta nada', async () => {
    const r = await llamar('/api/partida', { dispositivo: uuid() }, { e: E({ SECRETO_IP: '' }) });
    expect(r.status).toBe(503);
    expect(r.j).toEqual({ error: 'servidor' });
  });
});

describe('estado y cookie', () => {
  it('un dispositivo nuevo tiene 2 finales, cookie técnica y métricas apagadas sin clave', async () => {
    const r = await llamar('/api/estado', { idioma: 'es' }, { ip: nuevaIp() });
    expect(r.status).toBe(200);
    expect(r.res.headers.get('cache-control')).toBe('no-store');
    expect(r.j).toMatchObject({ puede: true, quedan: 2, lista: false, encuesta_disponible: true, metricas: null });
    expect(r.j.contexto).toMatchObject({ previas: 0, dias: '0' });
    expect(r.j.flags).toEqual({ 'muro-partidas-gratis': '2', 'muro-texto': 'a', 'invitacion-podio1': 'on', grabacion: 'tercio' });
    expect(r.j.dispositivo).toMatch(/^[0-9a-f-]{36}$/);
    const c = r.res.headers.get('set-cookie');
    expect(c).toContain(`tdv=${r.j.dispositivo}`);
    for (const p of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api', 'Max-Age=15552000']) expect(c).toContain(p);
  });
  it('con clave, devuelve la configuración pública de PostHog', async () => {
    const r = await llamar('/api/estado', {}, { ip: nuevaIp(), e: E({ POSTHOG_KEY: 'phc_prueba', ENCUESTA_ID: 'enc-1' }) });
    expect(r.j.metricas).toEqual({ clave: 'phc_prueba', host: '/qx', ui: 'https://us.posthog.com', encuesta: 'enc-1' });
  });
  it('si llega la cookie, gana la cookie', async () => {
    const ip = nuevaIp(), a = uuid(), b = uuid();
    await pedirPartida(a, ip);
    await pedirPartida(a, ip);
    const r = await llamar('/api/estado', { dispositivo: b }, { ip, cookie: `otra=1; tdv=${a}` });
    expect(r.j.dispositivo).toBe(a);
    expect(r.j).toMatchObject({ puede: false, motivo: 'dispositivo', quedan: 0 });
  });
  it('no cuenta nada', async () => {
    const ip = nuevaIp(), a = uuid();
    for (let k = 0; k < 5; k++) await llamar('/api/estado', { dispositivo: a }, { ip });
    expect((await llamar('/api/estado', { dispositivo: a }, { ip })).j.quedan).toBe(2);
  });
});

describe('finales gratis y muro', () => {
  it('2 finales por dispositivo, con pase firmado; la tercera es muro', async () => {
    const ip = nuevaIp(), a = uuid();
    const p1 = await pedirPartida(a, ip);
    expect(p1.j).toMatchObject({ estado: 'ok', fuente: 'gratis', quedan: 1, n: 1 });
    const pase = await leerPase(env, p1.j.pase, Math.floor(Date.now() / 1000));
    expect(pase).toMatchObject({ n: 1, f: 'gratis' });
    expect(pase.d).toHaveLength(12);
    expect(await leerPase(env, p1.j.pase.slice(0, -2) + 'xx', 0)).toBeNull();
    const p2 = await pedirPartida(a, ip);
    expect(p2.j).toMatchObject({ estado: 'ok', quedan: 0, n: 2 });
    const p3 = await pedirPartida(a, ip);
    expect(p3.j).toMatchObject({ estado: 'muro', motivo: 'dispositivo', encuesta_disponible: true });
    expect(p3.j.contexto.previas).toBe(2);
    // Recargar o borrar solo el almacenamiento local: la cookie lo reconoce.
    expect((await llamar('/api/estado', {}, { ip, cookie: `tdv=${a}` })).j).toMatchObject({ puede: false, motivo: 'dispositivo' });
  });
  it('borrar todos los datos: la IP frena a las 6 finales en 30 días; otra red, no', async () => {
    const ip = nuevaIp();
    for (let k = 0; k < 3; k++) {
      const a = uuid();
      expect((await pedirPartida(a, ip)).j.estado).toBe('ok');
      expect((await pedirPartida(a, ip)).j.estado).toBe('ok');
    }
    const nuevo = uuid();
    const r = await pedirPartida(nuevo, ip);
    expect(r.j).toMatchObject({ estado: 'muro', motivo: 'ip' });
    expect((await llamar('/api/estado', { dispositivo: nuevo }, { ip })).j).toMatchObject({ puede: false, motivo: 'ip', quedan: 0 });
    expect((await pedirPartida(uuid(), nuevaIp())).j.estado).toBe('ok');
  });
  it('IPv6: cuenta el prefijo /64', async () => {
    for (let k = 0; k < 3; k++) {
      const a = uuid();
      expect((await pedirPartida(a, `2001:db8:aa:1::${k + 1}`)).j.estado).toBe('ok');
      expect((await pedirPartida(a, `2001:db8:aa:1:0:0:0:${k + 10}`)).j.estado).toBe('ok');
    }
    expect((await pedirPartida(uuid(), '2001:0db8:00aa:0001:ffff::9')).j.motivo).toBe('ip');
    expect((await pedirPartida(uuid(), '2001:db8:aa:2::9')).j.estado).toBe('ok');
  });
  it('dos pedidos a la vez no pasan el tope', async () => {
    const ip = nuevaIp(), a = uuid();
    await pedirPartida(a, ip);
    const rs = await Promise.all([pedirPartida(a, ip), pedirPartida(a, ip), pedirPartida(a, ip)]);
    expect(rs.filter(r => r.j?.estado === 'ok')).toHaveLength(1);
  });
});

describe('encuesta', () => {
  it('desbloquea 2 finales una sola vez; después vuelve el muro sin encuesta', async () => {
    const ip = nuevaIp(), a = uuid();
    await pedirPartida(a, ip); await pedirPartida(a, ip);
    expect((await pedirPartida(a, ip)).j.estado).toBe('muro');
    const e = await llamar('/api/encuesta', { dispositivo: a, sesion: 'ses-1', idioma: 'es', r: RESP_OK }, { ip });
    expect(e.j).toEqual({ estado: 'ok', bono: 2 });
    expect((await llamar('/api/estado', { dispositivo: a }, { ip })).j).toMatchObject({ puede: true, quedan: 2, encuesta_disponible: false });
    expect((await pedirPartida(a, ip)).j).toMatchObject({ estado: 'ok', fuente: 'encuesta', quedan: 1, n: 3 });
    expect((await pedirPartida(a, ip)).j).toMatchObject({ estado: 'ok', fuente: 'encuesta', quedan: 0 });
    expect((await pedirPartida(a, ip)).j).toMatchObject({ estado: 'muro', motivo: 'dispositivo', encuesta_disponible: false });
    const otra = await llamar('/api/encuesta', { dispositivo: a, r: RESP_OK }, { ip });
    expect(otra.status).toBe(409);
    expect(otra.j).toEqual({ error: 'ya_respondida' });
  });
  it('cada encuesta suma 2 al cupo de la IP, y la IP admite 3 encuestas en 30 días', async () => {
    const ip = nuevaIp(), devs = [uuid(), uuid(), uuid(), uuid()];
    for (const a of devs.slice(0, 3)) { await pedirPartida(a, ip); await pedirPartida(a, ip); }
    expect((await pedirPartida(devs[3], ip)).j.motivo).toBe('ip');
    expect((await llamar('/api/encuesta', { dispositivo: devs[3], r: RESP_OK }, { ip })).j.bono).toBe(2);
    expect((await pedirPartida(devs[3], ip)).j.fuente).toBe('gratis');
    expect((await pedirPartida(devs[3], ip)).j.estado).toBe('ok');
    expect((await pedirPartida(devs[3], ip)).j.motivo).toBe('ip');
    await llamar('/api/encuesta', { dispositivo: devs[0], r: RESP_OK }, { ip });
    await llamar('/api/encuesta', { dispositivo: devs[1], r: RESP_OK }, { ip });
    // El límite de pedidos (3 por hora) frenaría antes; se vacía para probar la regla de 30 días.
    await env.DB.prepare('DELETE FROM limites').run();
    const cuarta = await llamar('/api/encuesta', { dispositivo: devs[2], r: RESP_OK }, { ip: ip, headers: {} });
    expect(cuarta.status).toBe(409);
    expect((await llamar('/api/estado', { dispositivo: devs[2] }, { ip })).j.encuesta_disponible).toBe(false);
  });
  it('valida las respuestas', async () => {
    const ip = nuevaIp(), a = uuid();
    const mal = async (r, error) => {
      const x = await llamar('/api/encuesta', { dispositivo: a, r }, { ip: nuevaIp() });
      expect([x.status, x.j]).toEqual([400, { error }]);
    };
    await mal({ q1: ['sedes'], q2: ['largo'], q3: 'telefono' }, 'incompleta');
    await mal({ ...RESP_OK, q1: [] }, 'incompleta');
    await mal({ ...RESP_OK, q2: ['nada', 'largo'] }, 'formato');
    await mal({ ...RESP_OK, q1: ['sedes', 'carrera', 'realismo'] }, 'formato');
    await mal({ ...RESP_OK, q3: 'heladera' }, 'formato');
    await mal({ ...RESP_OK, q5: 'x'.repeat(281) }, 'formato');
    await mal({ ...RESP_OK, q9: 'x' }, 'formato');
    expect((await llamar('/api/estado', { dispositivo: a }, { ip })).j.encuesta_disponible).toBe(true);
  });
  it('la manda a PostHog el Worker, con etiquetas canónicas y sin datos personales', async () => {
    const ip = nuevaIp(), a = uuid();
    const e = E({ POSTHOG_KEY: 'phc_prueba', ENCUESTA_ID: 'enc-1', ENCUESTA_PREGUNTAS: JSON.stringify({ q1: 'p1', q2: 'p2', q3: 'p3', q4: 'p4', q5: 'p5' }) });
    const r = await llamar('/api/encuesta', { dispositivo: a, sesion: 'ses-abc', idioma: 'en', r: RESP_OK }, { ip, e });
    expect(r.j.estado).toBe('ok');
    const s = salidas.find(x => x.url.pathname === '/i/v0/e/');
    expect(s.url.hostname).toBe('us.i.posthog.com');
    const ev = JSON.parse(s.cuerpo);
    expect(ev).toMatchObject({ api_key: 'phc_prueba', event: 'survey sent', distinct_id: 'ses-abc' });
    expect(ev.properties).toMatchObject({
      $survey_id: 'enc-1', $survey_completed: true, $process_person_profile: false, idioma: 'en',
      $survey_response_p1: ['Finales en sedes distintas', 'Crear mi propio pesista'],
      $survey_response_p2: ['Nada, me gustó'],
      $survey_response_p3: 'En el teléfono',
      $survey_response_p4: 'Gratis, con cosas opcionales para tu pesista (ropa, cinturones)',
      $survey_response_p5: 'Más rivales y sedes',
    });
    expect(ev.properties.$survey_questions).toHaveLength(5);
    expect(s.cuerpo).not.toContain(ip);
    expect(s.cuerpo).not.toContain(a);
  });
});

describe('lista de espera', () => {
  const alta = (email, o = {}) => llamar('/api/anotar', {
    dispositivo: o.dispositivo ?? uuid(), sesion: 's', email, nombre: o.nombre, idioma: o.idioma ?? 'es',
    aviso: o.aviso ?? true, novedades: o.novedades ?? false, consentimiento: o.consentimiento ?? '2026-11-c', web: o.web,
  }, { ip: o.ip ?? nuevaIp(), e: o.e, cookie: o.cookie });

  it('rechaza formato, aviso, descartables y dominios sin correo', async () => {
    expect((await alta('sin-arroba.com')).j).toEqual({ error: 'formato' });
    expect((await alta('a@b')).j).toEqual({ error: 'formato' });
    expect((await alta('hola@sitio.com/x')).j).toEqual({ error: 'formato' });
    expect((await alta('hola@buendominio.com', { aviso: false })).j).toEqual({ error: 'aviso' });
    expect((await alta('hola@buendominio.com', { consentimiento: '2020-01-a' })).j).toEqual({ error: 'aviso' });
    // La versión anterior del texto se sigue aceptando.
    expect((await alta('version-a@buendominio.com', { consentimiento: '2026-11-a' })).j.estado).toBe('nuevo');
    expect((await alta('hola@mailinator.com')).j).toEqual({ error: 'descartable' });
    expect((await alta('hola@sub.yopmail.com')).j).toEqual({ error: 'descartable' });
    expect((await alta('hola@noexiste-abc.com')).j).toEqual({ error: 'dominio' });
    expect((await alta('hola@mxnulo-abc.com')).j).toEqual({ error: 'dominio' });
    expect((await alta('hola@solo-a-abc.com')).j.estado).toBe('nuevo');
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM lista WHERE email LIKE 'hola@%'").first()).n;
    expect(n).toBe(1);
  });

  it('alta nueva: juego libre, sin contar para la IP; el mismo mail en otro dispositivo liga la misma fila', async () => {
    const ip = nuevaIp(), a = uuid();
    await pedirPartida(a, ip); await pedirPartida(a, ip);
    for (let k = 0; k < 2; k++) { const x = uuid(); await pedirPartida(x, ip); await pedirPartida(x, ip); }
    expect((await pedirPartida(uuid(), ip)).j.motivo).toBe('ip');

    const r = await alta('  Juana.Perez+tarima@BuenDominio.com ', { dispositivo: a, ip, nombre: '  Juana   Pérez ', novedades: true });
    expect(r.j).toMatchObject({ estado: 'nuevo', confirmar: false });
    expect(r.j.lista_id).toMatch(/^[0-9a-f]{32}$/);
    const fila = await env.DB.prepare('SELECT * FROM lista WHERE id = ?').bind(r.j.lista_id).first();
    expect(fila).toMatchObject({ email: 'juana.perez+tarima@buendominio.com', nombre: 'Juana Pérez', idioma: 'es', novedades: 1, consentimiento_version: '2026-11-c', confirmado_en: null, confirmar_mandado_en: null });

    expect((await llamar('/api/estado', { dispositivo: a }, { ip })).j).toMatchObject({ puede: true, lista: true, lista_id: r.j.lista_id, quedan: null });
    for (let k = 0; k < 4; k++) expect((await pedirPartida(a, ip)).j).toMatchObject({ estado: 'ok', fuente: 'lista', quedan: null });
    // Sus 2 finales gratis dejan de pesar sobre la red: hay lugar para 2 más.
    const b = uuid();
    expect((await pedirPartida(b, ip)).j.estado).toBe('ok');
    expect((await pedirPartida(b, ip)).j.estado).toBe('ok');
    expect((await pedirPartida(uuid(), ip)).j.motivo).toBe('ip');

    // Otro dispositivo con el mismo mail: liga la misma fila, pero la respuesta es la de un alta (no revela que ya
    // estaba) y no toca lo guardado: un tercero no puede activar las novedades de nadie.
    const otro = uuid();
    const r2 = await alta('juana.perez+tarima@buendominio.com', { dispositivo: otro, novedades: false });
    expect(r2.j).toMatchObject({ estado: 'nuevo', lista_id: r.j.lista_id, confirmar: false });
    expect((await pedirPartida(otro, nuevaIp())).j.fuente).toBe('lista');
    // Solo el mismo dispositivo, ya ligado, recibe 'ya_estaba'.
    expect((await alta('juana.perez+tarima@buendominio.com', { dispositivo: otro })).j.estado).toBe('ya_estaba');
  });

  it('un mail que ya estaba no cambia el consentimiento ni las novedades', async () => {
    const r = await alta('sin-novedades@buendominio.com', { novedades: false });
    const r2 = await alta('sin-novedades@buendominio.com', { novedades: true, consentimiento: '2026-11-a' });
    expect(r2.j).toMatchObject({ estado: 'nuevo', lista_id: r.j.lista_id });
    const fila = await env.DB.prepare('SELECT novedades, consentimiento_en, creado FROM lista WHERE id = ?').bind(r.j.lista_id).first();
    expect(fila.novedades).toBe(0);
  });

  it('el nombre inválido se descarta sin error y el de por defecto no se guarda', async () => {
    const r1 = await alta('uno@buendominio.com', { nombre: '<img onerror=x>' });
    const r2 = await alta('dos@buendominio.com', { nombre: 'Rookie' });
    for (const r of [r1, r2]) expect((await env.DB.prepare('SELECT nombre FROM lista WHERE id = ?').bind(r.j.lista_id).first()).nombre).toBeNull();
  });

  it('la trampa para bots responde como si nada y no guarda', async () => {
    const r = await alta('bot@buendominio.com', { web: 'http://spam' });
    expect(r.j.estado).toBe('nuevo');
    expect(await env.DB.prepare('SELECT id FROM lista WHERE email = ?').bind('bot@buendominio.com').first()).toBeNull();
  });

  it('baja desde la privacidad sin envío de correos: solo borra el dispositivo que anotó ese correo', async () => {
    const a = uuid(), ajeno = uuid();
    const r = await alta('mia@buendominio.com', { dispositivo: a });
    const fila = () => env.DB.prepare('SELECT id FROM lista WHERE id = ?').bind(r.j.lista_id).first();
    // Otro dispositivo (o nadie) no la borra, y la respuesta es la misma.
    const x = await llamar('/api/baja', { email: 'mia@buendominio.com', dispositivo: ajeno }, { ip: nuevaIp() });
    const y = await llamar('/api/baja', { email: 'mia@buendominio.com' }, { ip: nuevaIp() });
    expect([x.status, x.j, y.status, y.j]).toEqual([202, {}, 202, {}]);
    expect(await fila()).not.toBeNull();
    // El que la anotó, sí (por la cookie técnica o por el cuerpo), y sigue con juego libre.
    const z = await llamar('/api/baja', { email: 'MIA@buendominio.com' }, { ip: nuevaIp(), cookie: `tdv=${a}` });
    expect([z.status, z.j]).toEqual([202, {}]);
    expect(await fila()).toBeNull();
    expect((await pedirPartida(a, nuevaIp())).j.fuente).toBe('lista');
  });

  it('5 altas por hora por IP', async () => {
    const ip = nuevaIp();
    for (let k = 0; k < 5; k++) expect((await alta(`p${k}@buendominio.com`, { ip })).status).toBe(200);
    const r = await alta('p9@buendominio.com', { ip });
    expect([r.status, r.j]).toEqual([429, { error: 'limite' }]);
  });

  it('encuesta de un anotado: sin premio y sin tocar la IP', async () => {
    const ip = nuevaIp(), a = uuid();
    await alta('enc@buendominio.com', { dispositivo: a, ip });
    expect((await llamar('/api/encuesta', { dispositivo: a, r: RESP_OK }, { ip })).j).toEqual({ estado: 'ok', bono: 0 });
    const d = await codigoDispositivo(env, a);
    expect(await env.DB.prepare('SELECT i FROM encuestas WHERE d = ?').bind(d).first()).toEqual({ i: null });
  });

  describe('con Email Sending', () => {
    const enviados = [];
    const e = () => E({ MAIL_DESDE: 'hola@tarima.test', EMAIL: { send: async m => { enviados.push(m); return { messageId: 'x' }; } } });
    const linkDe = (m, ruta) => m.text.match(new RegExp(`https://tarima\\.test${ruta}\\?t=[0-9a-f.]+(?:&v=f)?`))[0];

    it('manda la confirmación con baja de un clic; GET muestra el botón y solo POST confirma', async () => {
      enviados.length = 0;
      const r = await alta('confirma@buendominio.com', { e: e(), nombre: 'Leo', idioma: 'en' });
      expect(r.j).toMatchObject({ estado: 'nuevo', confirmar: true });
      expect(enviados).toHaveLength(1);
      const m = enviados[0];
      expect(m).toMatchObject({ to: 'confirma@buendominio.com', subject: 'Confirm your spot in Tarima', from: { email: 'hola@tarima.test' } });
      expect(m.text).toContain('Hi Leo.');
      expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(m.headers['List-Unsubscribe']).toMatch(/^<https:\/\/tarima\.test\/baja\?t=[0-9a-f]{32}\.[0-9a-f]{40}>$/);
      const ruta = linkDe(m, '/confirmar').slice(ORIGEN.length);
      const confirmado = async () => (await env.DB.prepare('SELECT confirmado_en FROM lista WHERE id = ?').bind(r.j.lista_id).first()).confirmado_en;
      // Un escáner de links hace GET: no confirma.
      const g = await llamar(ruta, null, { metodo: 'GET', ct: null, origin: null, e: e() });
      expect(g.status).toBe(200);
      expect(g.res.headers.get('referrer-policy')).toBe('no-referrer');
      const html = await g.res.text();
      expect(html).toContain('method="post"');
      expect(html).toContain('Confirm your spot on the Tarima list?');
      expect(await confirmado()).toBeNull();
      // El correo salió: desde ahora corren los 30 días para confirmar.
      expect((await env.DB.prepare('SELECT confirmar_mandado_en FROM lista WHERE id = ?').bind(r.j.lista_id).first()).confirmar_mandado_en).toBeGreaterThan(0);
      const c = await llamar('/confirmar', 't=' + new URL(ORIGEN + ruta).searchParams.get('t'), { ct: 'application/x-www-form-urlencoded', e: e() });
      expect(c.status).toBe(200);
      expect(await c.res.text()).toContain('Done! Your spot is confirmed.');
      expect(await confirmado()).toBeGreaterThan(0);
      expect(await (await llamar(ruta, null, { metodo: 'GET', ct: null, origin: null, e: e() })).res.text()).toContain('Done! Your spot is confirmed.');
      const malo = await llamar('/confirmar?t=' + 'a'.repeat(32) + '.' + 'b'.repeat(40), null, { metodo: 'GET', ct: null, origin: null });
      expect(malo.status).toBe(400);
    });

    it('el mismo mail desde otro dispositivo: misma respuesta que un alta, un mail por día y sin revelar nada', async () => {
      enviados.length = 0;
      const r = await alta('repite@buendominio.com', { e: e(), idioma: 'es' });
      expect(enviados.map(m => m.subject)).toEqual(['Confirma tu lugar en Tarima']);
      // Sin confirmar: se vuelve a mandar la confirmación.
      const r2 = await alta('repite@buendominio.com', { e: e() });
      expect(r2.j).toEqual({ estado: 'nuevo', lista_id: r.j.lista_id, confirmar: true });
      expect(enviados.map(m => m.subject)).toEqual(['Confirma tu lugar en Tarima', 'Confirma tu lugar en Tarima']);
      // El mismo día no sale otro mail, pero la respuesta no cambia.
      expect((await alta('repite@buendominio.com', { e: e() })).j).toEqual({ estado: 'nuevo', lista_id: r.j.lista_id, confirmar: true });
      expect(enviados).toHaveLength(2);
      // Confirmado: otro día sale el aviso de «ya estabas», no otra confirmación.
      await env.DB.prepare('UPDATE lista SET confirmado_en = 1 WHERE id = ?').bind(r.j.lista_id).run();
      await env.DB.prepare('DELETE FROM limites').run();
      await alta('repite@buendominio.com', { e: e() });
      expect(enviados.at(-1).subject).toBe('Ya estás en la lista de Tarima');
      expect(enviados.at(-1).headers['List-Unsubscribe']).toMatch(/\/baja\?t=/);
    });

    it('la baja de un clic con token válido no tiene límite por IP; los tokens malos sí', async () => {
      enviados.length = 0;
      const ip = nuevaIp();
      const links = [];
      for (let k = 0; k < 12; k++) {
        await alta(`masiva${k}@buendominio.com`, { e: e() });
        links.push(enviados.at(-1).headers['List-Unsubscribe'].slice(1, -1).slice(ORIGEN.length));
      }
      for (const link of links) {
        const p = await llamar(link, 'List-Unsubscribe=One-Click', { metodo: 'POST', ct: 'application/x-www-form-urlencoded', origin: null, ip });
        expect(p.status).toBe(200);
      }
      expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM lista WHERE email LIKE 'masiva%'").first()).n).toBe(0);
      const malos = [];
      for (let k = 0; k < 11; k++) malos.push((await llamar('/baja?t=' + 'a'.repeat(32) + '.' + 'c'.repeat(40), null, { metodo: 'GET', ct: null, origin: null, ip })).status);
      expect(malos.slice(0, 10).every(s => s === 400)).toBe(true);
      expect(malos[10]).toBe(429);
    });

    it('baja: GET muestra el botón, POST de un clic borra la fila y el dispositivo sigue libre', async () => {
      enviados.length = 0;
      const a = uuid(), ip = nuevaIp();
      const r = await alta('baja@buendominio.com', { e: e(), dispositivo: a, ip });
      const link = enviados[0].headers['List-Unsubscribe'].slice(1, -1).slice(ORIGEN.length);
      const g = await llamar(link, null, { metodo: 'GET', ct: null, origin: null });
      const html = await g.res.text();
      expect(html).toContain('¿Te damos de baja de la lista de Tarima?');
      // Sin la promesa de «nunca vas a pagar»: queda fuera hasta que el dueño defina la monetización.
      expect(html).not.toMatch(/pagar|never pay/i);
      expect(html).toContain('method="post"');
      expect(await env.DB.prepare('SELECT id FROM lista WHERE id = ?').bind(r.j.lista_id).first()).not.toBeNull();
      const p = await llamar(link, 'List-Unsubscribe=One-Click', { metodo: 'POST', ct: 'application/x-www-form-urlencoded', origin: null });
      expect(p.status).toBe(200);
      expect(await env.DB.prepare('SELECT id FROM lista WHERE id = ?').bind(r.j.lista_id).first()).toBeNull();
      expect((await pedirPartida(a, ip)).j.fuente).toBe('lista');
      expect((await llamar(link, null, { metodo: 'GET', ct: null, origin: null })).status).toBe(200);
    });

    it('/api/baja siempre responde 202 y solo manda el link si el mail existe', async () => {
      enviados.length = 0;
      await alta('pide-baja@buendominio.com', { e: e(), idioma: 'es' });
      enviados.length = 0;
      const x = await llamar('/api/baja', { email: 'nadie@buendominio.com' }, { ip: nuevaIp(), e: e() });
      const y = await llamar('/api/baja', { email: 'PIDE-BAJA@buendominio.com' }, { ip: nuevaIp(), e: e() });
      expect([x.status, x.j, y.status, y.j]).toEqual([202, {}, 202, {}]);
      expect(enviados).toHaveLength(1);
      expect(enviados[0].subject).toBe('Tu enlace para darte de baja de Tarima');
      const link = linkDe(enviados[0], '/baja');
      expect(link).toContain('&v=f');
      const p = await llamar(link.slice(ORIGEN.length), 't=' + new URL(link).searchParams.get('t') + '&v=f', { ct: 'application/x-www-form-urlencoded', origin: ORIGEN, e: E({ POSTHOG_KEY: 'phc_x' }) });
      expect(await p.res.text()).toContain('te dimos de baja');
      const ev = JSON.parse(salidas.find(s => s.url.pathname === '/i/v0/e/').cuerpo);
      expect(ev).toMatchObject({ event: 'baja', properties: { via: 'formulario', $process_person_profile: false } });
    });

    it('el correo que no se pudo mandar no hace correr los 30 días', async () => {
      const malo = E({ MAIL_DESDE: 'hola@tarima.test', EMAIL: { send: async () => { throw new Error('rebote'); } } });
      const r = await alta('no-salio@buendominio.com', { e: malo });
      expect((await env.DB.prepare('SELECT confirmar_mandado_en FROM lista WHERE id = ?').bind(r.j.lista_id).first()).confirmar_mandado_en).toBeNull();
    });
  });

  it('exportación: apagada sin clave, 401 con clave mala, CSV sin inyección con la buena', async () => {
    const clave = 'clave-de-exportar-0123456789';
    const pedir = (e, auth) => llamar('/api/exportar', null, { metodo: 'GET', ct: null, origin: null, ip: nuevaIp(), e, headers: auth ? { authorization: auth } : {} });
    expect((await pedir(env)).status).toBe(404);
    expect((await pedir(E({ EXPORTAR_CLAVE: clave }), 'Bearer otra')).status).toBe(401);
    await alta('=cmd@buendominio.com');
    const r = await pedir(E({ EXPORTAR_CLAVE: clave }), 'Bearer ' + clave);
    expect(r.res.headers.get('content-type')).toContain('text/csv');
    const csv = await r.res.text();
    expect(csv.split('\r\n')[0]).toBe('id,email,nombre,idioma,pais,novedades,consentimiento_version,consentimiento_en,creado,confirmado_en');
    expect(csv).toContain(",'=cmd@buendominio.com,");
  });
});

describe('banderas de PostHog', () => {
  it('muro-partidas-gratis=1 deja una final; las de experimento quedan fijas', async () => {
    const e = E({ POSTHOG_KEY: 'phc_prueba' });
    const ip = nuevaIp(), a = uuid();
    flagsRespuesta = { flags: { 'muro-partidas-gratis': { key: 'muro-partidas-gratis', enabled: true, variant: '1' }, 'muro-texto': { enabled: true, variant: 'b' }, 'invitacion-podio1': { enabled: false } }, errorsWhileComputingFlags: false };
    const r = await llamar('/api/estado', { dispositivo: a }, { ip, e });
    expect(r.j.flags).toEqual({ 'muro-partidas-gratis': '1', 'muro-texto': 'b', 'invitacion-podio1': 'off', grabacion: 'tercio' });
    expect(r.j.quedan).toBe(1);
    const pedido = salidas.find(s => s.url.pathname === '/flags');
    expect(pedido.url.search).toBe('?v=2');
    expect(JSON.parse(pedido.cuerpo).distinct_id).toMatch(/^d_[0-9a-f]{16}$/);
    // Pasan 25 h: se vuelve a preguntar, pero las de experimento no cambian.
    await env.DB.prepare('UPDATE dispositivos SET flags_en = flags_en - 90000').run();
    flagsRespuesta = { flags: { 'muro-partidas-gratis': { enabled: true, variant: '2' }, 'muro-texto': { enabled: true, variant: 'a' }, 'invitacion-podio1': { enabled: true } } };
    const r2 = await llamar('/api/estado', { dispositivo: a }, { ip, e });
    expect(r2.j.flags).toMatchObject({ 'muro-partidas-gratis': '1', 'muro-texto': 'b', 'invitacion-podio1': 'on' });
  });
  it('GRATIS manda mientras PostHog no asigne la bandera, y el valor por defecto no queda pegado', async () => {
    const ip = nuevaIp(), a = uuid();
    // PostHog responde, pero la bandera todavía no existe en el proyecto.
    flagsRespuesta = { flags: { 'muro-texto': { enabled: true, variant: 'b' } } };
    const r = await llamar('/api/estado', { dispositivo: a }, { ip, e: E({ POSTHOG_KEY: 'phc_prueba', GRATIS: '1' }) });
    expect(r.j.quedan).toBe(1);
    expect(r.j.flags['muro-partidas-gratis']).toBe('1');
    const d = await codigoDispositivo(env, a);
    expect(JSON.parse((await env.DB.prepare('SELECT flags FROM dispositivos WHERE d = ?').bind(d).first()).flags)).toEqual({ 'muro-texto': 'b' });
    // El dueño cambia GRATIS: vale enseguida, también para este dispositivo.
    const r2 = await llamar('/api/estado', { dispositivo: a }, { ip, e: E({ POSTHOG_KEY: 'phc_prueba', GRATIS: '2' }) });
    expect(r2.j.quedan).toBe(2);
    expect(r2.j.flags['muro-texto']).toBe('b');
    // Sin clave de PostHog, GRATIS también vale.
    expect((await llamar('/api/estado', { dispositivo: uuid() }, { ip: nuevaIp(), e: E({ GRATIS: '1' }) })).j.quedan).toBe(1);
  });
  it('si PostHog falla, valen los valores por defecto', async () => {
    const r = await llamar('/api/estado', { dispositivo: uuid() }, { ip: nuevaIp(), e: E({ POSTHOG_KEY: 'phc_prueba' }) });
    expect(r.j.flags['muro-partidas-gratis']).toBe('2');
    expect(r.j.quedan).toBe(2);
  });
});

describe('proxy de PostHog en /qx', () => {
  it('reenvía a us.i.posthog.com sin cookies ni IP y sin credenciales ajenas', async () => {
    const r = await llamar('/qx/e/?ip=0&ver=1', '{"batch":[]}', {
      ip: '203.0.113.77', ct: 'text/plain',
      headers: { cookie: 'tdv=abc', 'x-forwarded-for': '203.0.113.77', 'x-real-ip': '203.0.113.77', authorization: 'Basic abc', 'x-tarima-ip': '203.0.113.77', 'x-tarima-pais': 'AR' },
    });
    expect(r.status).toBe(200);
    expect(r.res.headers.get('set-cookie')).toBeNull();
    const s = salidas.at(-1);
    expect(s.url.href).toBe('https://us.i.posthog.com/e/?ip=0&ver=1');
    expect(s.cuerpo).toBe('{"batch":[]}');
    for (const h of ['cookie', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'authorization', 'x-tarima-ip', 'x-tarima-pais']) expect(s.headers.get(h)).toBeNull();
  });
  it('deja pasar una clave phc_ y manda los estáticos a us-assets', async () => {
    await llamar('/qx/flags?v=2', '{}', { headers: { authorization: 'Bearer phc_abc' } });
    expect(salidas.at(-1).headers.get('authorization')).toBe('Bearer phc_abc');
    // Una clave personal (phx_) no pasa: el proxy no da acceso a la API privada.
    await llamar('/qx/api/projects/', null, { metodo: 'GET', ct: null, headers: { authorization: 'Bearer phx_secreta' } });
    expect(salidas.at(-1).headers.get('authorization')).toBeNull();
    const a = await llamar('/qx/static/array.js', null, { metodo: 'GET', ct: null });
    expect(await a.res.text()).toBe('/* array.js */');
    expect(salidas.at(-1).url.href).toBe('https://us-assets.i.posthog.com/static/array.js');
  });
});

describe('limpieza diaria y registros', () => {
  it('borra lo vencido según la retención', async () => {
    const ahora = Math.floor(Date.now() / 1000), dia = 86400;
    await env.DB.batch(['dispositivos', 'partidas', 'encuestas', 'lista', 'limites'].map(t => env.DB.prepare(`DELETE FROM ${t}`)));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO dispositivos (d, creado, ultimo) VALUES ('viejo', ?1, ?1), ('reciente', ?2, ?2)").bind(ahora - 200 * dia, ahora - 40 * dia),
      env.DB.prepare("INSERT INTO dispositivos (d, creado, ultimo, lista_id) VALUES ('anotado', ?1, ?3, 'L'), ('anotado-viejo', ?1, ?2, 'L')").bind(ahora - 400 * dia, ahora - 181 * dia, ahora - 10 * dia),
      env.DB.prepare("INSERT INTO partidas (d, i, en, fuente) VALUES ('viejo', 'iii', ?1, 'gratis'), ('reciente', 'iii', ?2, 'gratis'), ('reciente', 'jjj', ?3, 'gratis')").bind(ahora - 200 * dia, ahora - 40 * dia, ahora - dia),
      env.DB.prepare("INSERT INTO encuestas (d, i, en) VALUES ('reciente', 'iii', ?1)").bind(ahora - 31 * dia),
      // s1: le llegó la confirmación hace 31 días y no confirmó (se borra). s2: confirmó. s3: confirmación reciente.
      // s4: vieja y sin confirmar, pero nunca se le mandó el correo (sin dominio no hay correos): no se borra.
      env.DB.prepare(`INSERT INTO lista (id, email, idioma, consentimiento_version, consentimiento_en, creado, confirmado_en, confirmar_mandado_en) VALUES
        ('s1', 'a@x.com', 'es', 'v', ?1, ?1, NULL, ?1), ('s2', 'b@x.com', 'es', 'v', ?1, ?1, ?2, ?1), ('s3', 'c@x.com', 'es', 'v', ?2, ?2, NULL, ?2),
        ('s4', 'd@x.com', 'es', 'v', ?3, ?3, NULL, NULL)`).bind(ahora - 31 * dia, ahora - dia, ahora - 300 * dia),
      env.DB.prepare("INSERT INTO limites (k, n, hasta) VALUES ('x', 1, ?1)").bind(ahora - 10),
    ]);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '17 4 * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    const col = async q => (await env.DB.prepare(q).all()).results;
    expect((await col('SELECT d FROM dispositivos ORDER BY d')).map(x => x.d)).toEqual(['anotado', 'reciente']);
    expect(await col('SELECT d, i FROM partidas ORDER BY en')).toEqual([{ d: 'reciente', i: null }, { d: 'reciente', i: 'jjj' }]);
    expect(await col('SELECT i FROM encuestas')).toEqual([{ i: null }]);
    expect((await col('SELECT id FROM lista ORDER BY id')).map(x => x.id)).toEqual(['s2', 's3', 's4']);
    expect(await col('SELECT k FROM limites')).toEqual([]);
  });

  it('ningún registro lleva mail, IP ni dispositivo', async () => {
    const ip = '203.0.113.199', a = uuid(), email = 'registro@buendominio.com';
    const e = E({ MAIL_DESDE: 'hola@tarima.test', EMAIL: { send: async () => { throw Object.assign(new Error(`fallo para ${email}`), { code: 'E_X' }); } } });
    await llamar('/api/estado', { dispositivo: a }, { ip, e });
    await pedirPartida(a, ip, { e });
    await llamar('/api/anotar', { dispositivo: a, email, aviso: true, consentimiento: '2026-11-a', idioma: 'es' }, { ip, e });
    await llamar('/api/anotar', { dispositivo: a, email: 'x@y.com', aviso: true, consentimiento: '2026-11-a', web: 'bot' }, { ip, e });
    await llamar('/api/encuesta', { dispositivo: a, r: RESP_OK }, { ip, e });
    expect(logs.length).toBeGreaterThan(0);
    const todo = logs.join('\n');
    for (const x of [ip, a, email, 'x@y.com']) expect(todo).not.toContain(x);
  });
});
