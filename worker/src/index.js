// Worker de Tarima (docs/MVP.md 5.5): lleva la cuenta de las finales gratis, la lista de espera, el desbloqueo por
// encuesta y el proxy de PostHog. El sitio (web/) lo sirve Cloudflare Pages, que le pasa /api/*, /qx/*, /baja y
// /confirmar por una service binding (../functions/). Ningún registro incluye correo, IP ni dispositivo.
import * as R from './reglas.js';
import * as D from './datos.js';
import { DESCARTABLES } from './descartables.js';
import { codigoDispositivo, codigoIp, idAzar, igualSeguro, leerToken, pase, token } from './cripto.js';
import { PREFIJO, capturar, evaluarBanderas, proxy } from './posthog.js';
import { armarMail, idiomaPagina, pagina, t } from './textos.js';

const MAX_CUERPO = 4096;
const COOKIE = 'tdv';
const COOKIE_DURA = 180 * 86400;
const SECRETOS = ['SECRETO_IP', 'SECRETO_DISPOSITIVO', 'SECRETO_PASE', 'SECRETO_BAJA'];

// Límites por código de IP: [máximo, período en segundos] (docs/MVP.md 5.5).
const LIMITES = {
  estado: [60, 600], partida: [20, 600], anotar: [5, 3600], encuesta: [3, 3600], baja_api: [3, 3600],
  baja: [10, 3600], confirmar: [10, 3600], exportar: [10, 3600],
};

class ErrorHttp extends Error {
  constructor(status, error) { super(error); this.status = status; this.error = error; }
}

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
});

const log = (nivel, datos) => (nivel === 'error' ? console.error : console.log)(JSON.stringify(datos));
const ahoraS = () => Math.floor(Date.now() / 1000);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === PREFIJO || p.startsWith(PREFIJO + '/')) return await proxy(request, env, ctx);
      if (p.startsWith('/api/')) return await api(request, env, ctx, url);
      if (p === '/baja') return await paginaBaja(request, env, ctx, url);
      if (p === '/confirmar') return await paginaConfirmar(request, env, ctx, url);
      // El sitio lo sirve Pages. Si alguna vez se le da al Worker una carpeta de assets (por ejemplo para probar solo
      // con `wrangler dev`), la sirve; si no, todo lo demás no existe acá.
      if (env.ASSETS) {
        const pedido = p === '/' && (request.method === 'GET' || request.method === 'HEAD') ? new Request(new URL('/juego.html', url), request) : request;
        return env.ASSETS.fetch(pedido);
      }
      return new Response('No encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    } catch (e) {
      if (e instanceof ErrorHttp) return p.startsWith('/api/') ? json({ error: e.error }, e.status) : paginaError(request, e.status, e.error);
      log('error', { msg: 'error_interno', ruta: p, tipo: e?.name || 'Error' });
      return p.startsWith('/api/') ? json({ error: 'servidor' }, 503) : paginaError(request, 503, 'servidor');
    }
  },

  async scheduled(controller, env, ctx) {
    const r = await D.limpiar(env.DB, ahoraS());
    log('info', { msg: 'limpieza', ...r });
  },
};

// ---------- utilidades de pedido ----------

function verificarSecretos(env) {
  for (const k of SECRETOS) if (!env[k] || String(env[k]).length < 16) throw new ErrorHttp(503, 'servidor');
}

async function leerCuerpo(request, max = MAX_CUERPO) {
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > max) throw new ErrorHttp(413, 'formato');
  if (!request.body) return '';
  const lector = request.body.getReader();
  const partes = []; let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { lector.cancel(); throw new ErrorHttp(413, 'formato'); }
    partes.push(value);
  }
  const todo = new Uint8Array(total); let o = 0;
  for (const v of partes) { todo.set(v, o); o += v.byteLength; }
  return new TextDecoder().decode(todo);
}

async function leerJson(request, url) {
  if (request.method !== 'POST') throw new ErrorHttp(405, 'metodo');
  if (request.headers.get('origin') !== url.origin) throw new ErrorHttp(403, 'origen');
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) throw new ErrorHttp(415, 'formato');
  const texto = await leerCuerpo(request);
  let b;
  try { b = JSON.parse(texto); } catch { throw new ErrorHttp(400, 'formato'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ErrorHttp(400, 'formato');
  return b;
}

// IP y país del visitante. Detrás de la service binding de Pages llegan en x-tarima-ip y x-tarima-pais, que pone la
// Function (../functions/_reenviar.js) pisando lo que mande el navegador; solo se les cree con CONFIAR_PAGES=1, que es
// seguro porque este Worker no tiene dirección pública (wrangler.jsonc).
const confiaPages = env => env?.CONFIAR_PAGES === '1';
const ipDe = (request, env) => (confiaPages(env) && request.headers.get('x-tarima-ip')) || request.headers.get('cf-connecting-ip') || '';
const paisDe = (request, env) => {
  const c = (confiaPages(env) && request.headers.get('x-tarima-pais')) || request.cf?.country;
  return typeof c === 'string' && /^[A-Z0-9]{2}$/.test(c) ? c : null;
};

function cookieTdv(request) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(/(?:^|;\s*)tdv=([^;]+)/);
  return m && R.esUuid(m[1]) ? m[1].toLowerCase() : null;
}

// El id del navegador: gana la cookie; si no, el del cuerpo; si no, uno nuevo.
function dispositivoDe(request, b) {
  return cookieTdv(request) || (R.esUuid(b.dispositivo) ? b.dispositivo.toLowerCase() : crypto.randomUUID());
}
const setCookie = uuid => ({ 'set-cookie': `${COOKIE}=${uuid}; Max-Age=${COOKIE_DURA}; Path=/api; HttpOnly; Secure; SameSite=Strict` });

async function limitar(env, regla, i, ahora) {
  // Primera barrera, barata: el límite de pedidos de Workers (ráfagas de 10 s). Después, la ventana larga en D1.
  if (env.LIMITE?.limit) {
    const { success } = await env.LIMITE.limit({ key: i });
    if (!success) throw new ErrorHttp(429, 'limite');
  }
  const [max, periodo] = LIMITES[regla];
  if (!(await D.dentroDelLimite(env.DB, { regla, i, max, periodo, ahora }))) throw new ErrorHttp(429, 'limite');
}

const metricas = env => env.POSTHOG_KEY
  ? { clave: env.POSTHOG_KEY, host: PREFIJO, ui: 'https://' + String(env.POSTHOG_HOST || 'us.i.posthog.com').replace('.i.', '.'), encuesta: env.ENCUESTA_ID || null }
  : null;

// Banderas del dispositivo: se refrescan cada 24 h; las de experimento quedan fijas una vez asignadas.
// Devuelve `flags` (lo que ve el juego, con los valores por defecto) y `asignadas` (solo lo que vino de PostHog:
// es lo que se guarda y lo único que pisa la configuración del Worker).
async function banderas(env, ctx, dev, ahora) {
  let guardadas = null;
  try { guardadas = dev.flags ? JSON.parse(dev.flags) : null; } catch { guardadas = null; }
  const defectos = { 'muro-partidas-gratis': String(R.config(env, {}).gratis) };
  const armar = asignadas => ({ asignadas, flags: R.combinarBanderas(asignadas, null, defectos) });
  if (guardadas && dev.flags_en > ahora - R.REFRESCO_FLAGS) return armar(R.banderasAsignadas(guardadas, null));
  const resp = await evaluarBanderas(env, 'd_' + dev.d.slice(0, 16));
  const asignadas = R.banderasAsignadas(guardadas, resp);
  if (resp) ctx.waitUntil(D.guardarBanderas(env.DB, dev.d, asignadas, ahora).catch(e => log('error', { msg: 'banderas_guardar', tipo: e?.name })));
  return armar(asignadas);
}

// ---------- API ----------

async function api(request, env, ctx, url) {
  const ruta = url.pathname.slice(5);
  const manejadores = { estado, partida, anotar, encuesta, baja: bajaApi };
  if (ruta === 'exportar') return exportar(request, env, url);
  const m = manejadores[ruta];
  if (!m) return json({ error: 'no_existe' }, 404);
  const b = await leerJson(request, url);
  verificarSecretos(env);
  const ahora = ahoraS();
  const i = await codigoIp(env, R.prefijoIp(ipDe(request, env)));
  await limitar(env, ruta === 'baja' ? 'baja_api' : ruta, i, ahora);
  return m({ request, env, ctx, url, b, i, ahora });
}

// Lo común de estado y partida: dispositivo, banderas, cuentas y la regla.
async function situacion({ request, env, ctx, b, i, ahora }) {
  const uuid = dispositivoDe(request, b);
  const d = await codigoDispositivo(env, uuid);
  const dev = await D.asegurarDispositivo(env.DB, d, ahora);
  const { flags, asignadas } = await banderas(env, ctx, dev, ahora);
  const cfg = R.config(env, asignadas);
  const c = await D.contar(env.DB, d, i, ahora);
  const dec = R.decidir({ anotado: !!dev.lista_id, encuesta: !!dev.encuesta_en, usadas_d: c.usadas_d, usadas_i: c.usadas_i, encuestas_i: c.encuestas_i, cfg });
  const contexto = { pais: paisDe(request, env), previas: c.usadas_d, dias: R.diasDesde(dev.creado, ahora) };
  return { uuid, d, dev, flags, cfg, c, dec, contexto };
}

async function estado(a) {
  const s = await situacion(a);
  const r = {
    dispositivo: s.uuid, puede: s.dec.puede, quedan: s.dec.quedan, lista: !!s.dev.lista_id,
    encuesta_disponible: s.dec.encuesta_disponible, flags: s.flags, contexto: s.contexto, metricas: metricas(a.env),
  };
  if (s.dev.lista_id) r.lista_id = s.dev.lista_id;
  if (!s.dec.puede) r.motivo = s.dec.motivo;
  return json(r, 200, setCookie(s.uuid));
}

async function partida(a) {
  const { env, i, ahora } = a;
  for (let intento = 0; intento < 3; intento++) {
    const s = await situacion(a);
    if (!s.dec.puede) {
      return json({ estado: 'muro', motivo: s.dec.motivo, encuesta_disponible: s.dec.encuesta_disponible, dispositivo: s.uuid, flags: s.flags, contexto: s.contexto }, 200, setCookie(s.uuid));
    }
    const ok = await D.insertarPartida(env.DB, { d: s.d, i, ahora, fuente: s.dec.fuente, usadas_d: s.c.usadas_d, usadas_i: s.c.usadas_i });
    if (!ok) continue; // otro pedido cambió la cuenta en el medio: se vuelve a decidir
    const n = s.c.total_d + 1;
    return json({
      estado: 'ok', pase: await pase(env, { d: s.d, n, f: s.dec.fuente, ahora }), fuente: s.dec.fuente,
      quedan: s.dec.quedan == null ? null : s.dec.quedan - 1, n, dispositivo: s.uuid, flags: s.flags, contexto: s.contexto,
    }, 200, setCookie(s.uuid));
  }
  throw new ErrorHttp(503, 'servidor');
}

async function anotar({ request, env, ctx, url, b, ahora }) {
  // Trampa para bots: el formulario lleva un campo `web` escondido que una persona nunca completa.
  if (b.web != null && b.web !== '') {
    log('info', { msg: 'trampa_bots', ruta: 'anotar' });
    return json({ estado: 'nuevo', lista_id: idAzar(16), confirmar: true });
  }
  const email = R.normalizarEmail(b.email);
  if (!email) throw new ErrorHttp(400, 'formato');
  if (b.aviso !== true || !R.VERSIONES_CONSENTIMIENTO.has(b.consentimiento)) throw new ErrorHttp(400, 'aviso');
  if (env.TURNSTILE === '1' && !(await turnstile(env, b.turnstile))) throw new ErrorHttp(400, 'turnstile');
  if (R.esDescartable(email, DESCARTABLES)) throw new ErrorHttp(400, 'descartable');
  const dominio = email.slice(email.indexOf('@') + 1);
  if ((await recibeMail(dominio, ctx)) === false) throw new ErrorHttp(400, 'dominio');

  const uuid = dispositivoDe(request, b);
  const d = await codigoDispositivo(env, uuid);
  const dev = await D.asegurarDispositivo(env.DB, d, ahora);
  const idi = R.idioma(b.idioma);

  let fila = await D.buscarEmail(env.DB, email);
  let nuevo = false;
  if (!fila) {
    const id = idAzar(16);
    nuevo = await D.altaLista(env.DB, {
      id, email, nombre: R.normalizarNombre(b.nombre), idioma: idi, pais: paisDe(request, env),
      novedades: b.novedades === true, consentimiento: b.consentimiento, ahora,
    });
    fila = nuevo ? { id, idioma: idi, nombre: R.normalizarNombre(b.nombre), confirmado_en: null } : await D.buscarEmail(env.DB, email);
    if (!fila) throw new ErrorHttp(503, 'servidor');
  }
  // Un mail que ya está en la lista no cambia nada de lo guardado: ni el consentimiento ni las novedades. En el MVP
  // no se verifica que el mail sea de quien lo escribe, así que un tercero no puede sumar a nadie a las novedades.
  const yaLigado = dev.lista_id === fila.id;
  await D.ligarDispositivo(env.DB, d, fila.id, ahora);

  // Para no revelar quién está en la lista, un dispositivo nuevo recibe la misma respuesta con un mail nuevo o con
  // uno que ya estaba, y en los dos casos sale un mail: la confirmación (alta nueva o todavía sin confirmar) o el
  // aviso de «ya estabas», como mucho uno por día para el mismo mail. 'ya_estaba' solo vuelve si este mismo
  // dispositivo ya estaba ligado a ese mail, que no le cuenta nada nuevo.
  const confirmar = !yaLigado && puedeMandarMail(env);
  if (confirmar) {
    if (nuevo) ctx.waitUntil(mailConfirmar(env, url.origin, email, fila));
    else if (await D.dentroDelLimite(env.DB, { regla: 'mail', i: fila.id, max: 1, periodo: R.DIA, ahora })) {
      ctx.waitUntil(fila.confirmado_en ? mailYaEstaba(env, url.origin, email, fila) : mailConfirmar(env, url.origin, email, fila));
    }
  }
  const estado = yaLigado ? 'ya_estaba' : 'nuevo';
  log('info', { msg: 'anotar', estado, alta: nuevo, confirmar });
  return json({ estado, lista_id: fila.id, confirmar }, 200, setCookie(uuid));
}

async function encuesta({ request, env, ctx, b, i, ahora }) {
  if (env.TURNSTILE === '1' && !(await turnstile(env, b.turnstile))) throw new ErrorHttp(400, 'turnstile');
  const v = R.validarEncuesta(b.r);
  if (!v.ok) throw new ErrorHttp(400, v.error);
  const uuid = dispositivoDe(request, b);
  const d = await codigoDispositivo(env, uuid);
  const dev = await D.asegurarDispositivo(env.DB, d, ahora);
  if (dev.encuesta_en) throw new ErrorHttp(409, 'ya_respondida');
  const anotado = !!dev.lista_id;
  const cfg = R.config(env, {});
  if (!anotado && (await D.encuestasDeIp(env.DB, i, ahora)) >= cfg.encuestas_por_ip) throw new ErrorHttp(409, 'ya_respondida');
  if (!(await D.registrarEncuesta(env.DB, { d, i: anotado ? null : i, ahora }))) throw new ErrorHttp(409, 'ya_respondida');

  const sesion = typeof b.sesion === 'string' && /^[\w.:-]{1,200}$/.test(b.sesion) ? b.sesion : 'enc_' + crypto.randomUUID();
  ctx.waitUntil(mandarEncuesta(env, { r: v.r, sesion, idioma: R.idioma(b.idioma), pais: paisDe(request, env) }));
  return json({ estado: 'ok', bono: anotado ? 0 : cfg.bono }, 200, setCookie(uuid));
}

async function mandarEncuesta(env, { r, sesion, idioma, pais }) {
  let ids = null;
  try { ids = env.ENCUESTA_PREGUNTAS ? JSON.parse(env.ENCUESTA_PREGUNTAS) : null; } catch { ids = null; }
  if (!env.ENCUESTA_ID || !ids || !env.POSTHOG_KEY) { log('info', { msg: 'encuesta_sin_posthog' }); return; }
  await capturar(env, {
    event: 'survey sent', distinct_id: sesion,
    properties: R.propsEncuesta({ r, ids, encuestaId: env.ENCUESTA_ID, envio: crypto.randomUUID(), idioma, pais }),
  });
}

// Baja desde la página de privacidad. Responde siempre lo mismo, para no revelar quién está en la lista.
// - Si este dispositivo está ligado a ese correo (lo anotó desde acá), se borra ya: es la misma prueba de que el correo
//   es suyo que alcanzó para anotarlo, y sin envío de correos es la única baja posible sin escribir al contacto.
// - Si no, y hay envío de correos, le llega el enlace de baja.
async function bajaApi({ request, env, ctx, url, b }) {
  const email = R.normalizarEmail(b.email);
  if (email) {
    const fila = await D.buscarEmail(env.DB, email);
    if (fila) {
      const dev = await D.buscarDispositivo(env.DB, await codigoDispositivo(env, dispositivoDe(request, b)));
      if (dev?.lista_id === fila.id) {
        if (await D.borrarDeLista(env.DB, fila.id)) {
          log('info', { msg: 'baja', via: 'dispositivo' });
          ctx.waitUntil(capturar(env, { event: 'baja', distinct_id: 'baja_' + crypto.randomUUID(), properties: { via: 'formulario', $process_person_profile: false } }));
        }
      } else if (puedeMandarMail(env)) ctx.waitUntil(mailBaja(env, url.origin, email, fila));
    }
  }
  return json({}, 202);
}

async function exportar(request, env, url) {
  if (!env.EXPORTAR_CLAVE || String(env.EXPORTAR_CLAVE).length < 24) return json({ error: 'no_existe' }, 404);
  if (request.method !== 'GET') throw new ErrorHttp(405, 'metodo');
  verificarSecretos(env);
  const ahora = ahoraS();
  await limitar(env, 'exportar', await codigoIp(env, R.prefijoIp(ipDe(request, env))), ahora);
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m || !(await igualSeguro(m[1], env.EXPORTAR_CLAVE))) return json({ error: 'no_autorizado' }, 401);
  const filas = await D.exportarLista(env.DB);
  const cols = ['id', 'email', 'nombre', 'idioma', 'pais', 'novedades', 'consentimiento_version', 'consentimiento_en', 'creado', 'confirmado_en'];
  const soloConfirmados = url.searchParams.get('confirmados') === '1';
  const csv = [cols.join(','), ...filas.filter(f => !soloConfirmados || f.confirmado_en).map(f => cols.map(c => R.celdaCsv(f[c])).join(','))].join('\r\n') + '\r\n';
  log('info', { msg: 'exportar', filas: filas.length });
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tarima-lista.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

// ---------- páginas de la baja y la confirmación ----------

// Las páginas de /baja y /confirmar solo cuentan para el límite los tokens que no valen: adivinar uno es imposible
// (128 bits de id y 160 de firma), y un límite sobre los válidos frenaría la baja de un clic, que los proveedores de
// correo mandan desde pocas IP compartidas.
async function tokenDePagina(request, env, regla, tk, tipo) {
  verificarSecretos(env);
  const id = await leerToken(env, tk, tipo);
  if (!id) await limitar(env, regla, await codigoIp(env, R.prefijoIp(ipDe(request, env))), ahoraS());
  return id;
}

function paginaError(request, status, error) {
  const idi = idiomaPagina(request);
  const clave = status === 429 ? 'pagina.limite' : 'pagina.error';
  return pagina(idi, l => ({ titulo: t(l, clave), html: '' }), { status: error === 'metodo' ? 405 : status });
}

const paginaTokenInvalido = request => pagina(idiomaPagina(request), l => ({ titulo: t(l, 'baja.token_invalido'), html: '' }), { status: 400 });

async function paginaBaja(request, env, ctx, url) {
  if (request.method !== 'GET' && request.method !== 'POST') throw new ErrorHttp(405, 'metodo');
  let tk = url.searchParams.get('t'), via = url.searchParams.get('v') === 'f' ? 'formulario' : 'mail';
  if (request.method === 'POST') {
    const form = new URLSearchParams(await leerCuerpo(request));
    tk = form.get('t') || tk;
    if (form.get('v') === 'f') via = 'formulario';
    if (form.get('List-Unsubscribe') === 'One-Click') via = 'mail';
  }
  const id = await tokenDePagina(request, env, 'baja', tk, 'baja');
  if (!id) return paginaTokenInvalido(request);
  const fila = await D.buscarLista(env.DB, id);
  const idi = idiomaPagina(request, fila?.idioma);

  if (request.method === 'GET') {
    if (!fila) return pagina(idi, l => ({ titulo: t(l, 'baja.ok'), html: '' }));
    const v = via === 'formulario' ? '<input type="hidden" name="v" value="f">' : '';
    return pagina(idi, l => ({
      titulo: t(l, 'baja.pregunta'),
      html: `<form method="post" action="/baja"><input type="hidden" name="t" value="${tk}">${v}<button type="submit">${t(l, 'baja.boton')}</button></form>`,
      extra: '',
    }));
  }
  if (await D.borrarDeLista(env.DB, id)) {
    log('info', { msg: 'baja', via });
    ctx.waitUntil(capturar(env, { event: 'baja', distinct_id: 'baja_' + crypto.randomUUID(), properties: { via, $process_person_profile: false } }));
  }
  return pagina(idi, l => ({ titulo: t(l, 'baja.ok'), html: '<p><a class="b" href="/">' + t(l, 'confirmado.volver') + '</a></p>' }));
}

// GET muestra un botón y POST confirma, como en la baja: los escáneres de links del correo (de empresas y de algunos
// proveedores) abren cada link con GET, y con eso confirmarían solos un mail que anotó un tercero.
async function paginaConfirmar(request, env, ctx, url) {
  if (request.method !== 'GET' && request.method !== 'POST') throw new ErrorHttp(405, 'metodo');
  let tk = url.searchParams.get('t');
  if (request.method === 'POST') tk = new URLSearchParams(await leerCuerpo(request)).get('t') || tk;
  const id = await tokenDePagina(request, env, 'confirmar', tk, 'confirmar');
  const fila = id && (await D.buscarLista(env.DB, id));
  if (!fila) return paginaTokenInvalido(request);
  const idi = idiomaPagina(request, fila.idioma);
  if (request.method === 'GET' && !fila.confirmado_en) {
    return pagina(idi, l => ({
      titulo: t(l, 'confirmar.pregunta'),
      html: `<form method="post" action="/confirmar"><input type="hidden" name="t" value="${tk}"><button type="submit">${t(l, 'confirmar.boton')}</button></form>`,
      extra: '',
    }));
  }
  const ahora = ahoraS();
  if (request.method === 'POST' && (await D.confirmar(env.DB, id, ahora))) {
    log('info', { msg: 'mail_confirmado' });
    ctx.waitUntil(capturar(env, { event: 'mail_confirmado', distinct_id: id, properties: {} }));
  }
  return pagina(idi, l => ({
    titulo: t(l, 'confirmado.texto'),
    html: '<p><a class="b" href="/">' + t(l, 'confirmado.volver') + '</a></p>',
  }));
}

// ---------- mails ----------

const puedeMandarMail = env => !!(env.EMAIL?.send && env.MAIL_DESDE);

async function enviar(env, { to, subject, text, html, baja }) {
  try {
    await env.EMAIL.send({
      to, from: { email: env.MAIL_DESDE, name: 'Tarima' }, subject, text, html,
      headers: { 'List-Unsubscribe': `<${baja}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    return true;
  } catch (e) {
    log('error', { msg: 'mail_fallo', codigo: e?.code || e?.name || 'Error' });
    return false;
  }
}

async function mailConfirmar(env, origen, email, fila) {
  const idi = fila.idioma === 'es' ? 'es' : 'en';
  const link = `${origen}/confirmar?t=${await token(env, fila.id, 'confirmar')}`;
  const baja = `${origen}/baja?t=${await token(env, fila.id, 'baja')}`;
  const nombre = fila.nombre || t(idi, 'nombre.defecto');
  const m = armarMail(idi, { cuerpo: t(idi, 'mail.confirmar.cuerpo', { nombre }), boton: t(idi, 'mail.confirmar.boton'), link, baja });
  // Los 30 días para confirmar corren desde el primer correo que salió de verdad.
  if (await enviar(env, { to: email, subject: t(idi, 'mail.confirmar.asunto'), ...m, baja })) await D.confirmacionMandada(env.DB, fila.id, ahoraS());
}

// Para un mail que ya estaba confirmado y se usó desde otro dispositivo (docs/MVP.md 5.5, «Revisión»).
async function mailYaEstaba(env, origen, email, fila) {
  const idi = fila.idioma === 'es' ? 'es' : 'en';
  const baja = `${origen}/baja?t=${await token(env, fila.id, 'baja')}`;
  const m = armarMail(idi, { cuerpo: t(idi, 'mail.ya.cuerpo'), boton: t(idi, 'mail.ya.boton'), link: `${origen}/`, baja });
  await enviar(env, { to: email, subject: t(idi, 'mail.ya.asunto'), ...m, baja });
}

async function mailBaja(env, origen, email, fila) {
  const idi = fila.idioma === 'es' ? 'es' : 'en';
  const baja = `${origen}/baja?t=${await token(env, fila.id, 'baja')}&v=f`;
  const m = armarMail(idi, { cuerpo: t(idi, 'mail.baja.cuerpo'), boton: t(idi, 'mail.baja.boton'), link: baja, baja });
  await enviar(env, { to: email, subject: t(idi, 'mail.baja.asunto'), ...m, baja });
}

// ---------- verificaciones externas ----------

// ¿El dominio recibe mails? MX (sin contar el MX nulo) o, si no hay, A. true, false, o null si no se pudo saber
// (en ese caso se acepta: una falla de DNS no frena a nadie). Caché de un día en la caché del Worker.
async function recibeMail(dominio, ctx) {
  const cache = globalThis.caches?.default;
  const clave = new Request(`https://dns.tarima.invalid/${encodeURIComponent(dominio)}`);
  const guardado = cache && (await cache.match(clave).catch(() => null));
  if (guardado) return (await guardado.text()) === '1';
  const consulta = async tipo => {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dominio)}&type=${tipo}`, {
      headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    return r.json();
  };
  let res = null;
  try {
    const mx = await consulta('MX');
    if (!mx) return null;
    if (mx.Status === 3) res = false;
    else if (mx.Status === 0) {
      const mxs = (mx.Answer || []).filter(a => a.type === 15);
      if (mxs.length) res = mxs.some(a => !/^\s*\d+\s+\.?\s*$/.test(a.data));
      else {
        const a = await consulta('A');
        if (!a) return null;
        res = a.Status === 0 && (a.Answer || []).some(x => x.type === 1);
      }
    } else return null;
  } catch {
    return null;
  }
  if (cache) ctx.waitUntil(cache.put(clave, new Response(res ? '1' : '0', { headers: { 'cache-control': 'max-age=86400' } })).catch(() => {}));
  return res;
}

async function turnstile(env, tk) {
  if (typeof tk !== 'string' || !tk || tk.length > 2048 || !env.TURNSTILE_SECRETO) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRETO, response: tk }), signal: AbortSignal.timeout(4000),
    });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
}
