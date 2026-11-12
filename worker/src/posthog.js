// PostHog: proxy inverso en /qx/, envío de eventos desde el Worker y evaluación de banderas (docs/MVP.md 6.2, 5.4 y 6.5).
// Sin POSTHOG_KEY todo lo que manda el Worker es no-op; el proxy igual responde (el juego no lo usa sin clave).

export const PREFIJO = '/qx';

// Encabezados que pueden llevar la IP del visitante o credenciales: no salen hacia PostHog.
const QUITAR = ['cookie', 'x-tarima-ip', 'x-tarima-pais', 'x-forwarded-for', 'x-real-ip', 'true-client-ip', 'cf-connecting-ip', 'cf-connecting-ipv6', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'cdn-loop'];

// Proxy según https://posthog.com/docs/advanced/proxy/cloudflare, con una diferencia a propósito: no se agrega
// X-Forwarded-For, para que PostHog no reciba la IP (el país llega como propiedad `pais`).
export async function proxy(request, env, ctx) {
  const url = new URL(request.url);
  const resto = url.pathname.slice(PREFIJO.length) || '/';
  const camino = resto + url.search;
  if (resto.startsWith('/static/') || resto.startsWith('/array/')) return activo(request, env, ctx, camino);

  const h = new Headers(request.headers);
  for (const k of QUITAR) h.delete(k);
  // Solo la clave pública del proyecto (docs/MVP.md 6.2): el proxy no es un pasaje a la API privada de PostHog.
  if (!/^Bearer phc_/.test(h.get('authorization') ?? '')) h.delete('authorization');
  const tieneCuerpo = request.method !== 'GET' && request.method !== 'HEAD';
  const r = await fetch(`https://${env.POSTHOG_HOST || 'us.i.posthog.com'}${camino}`, {
    method: request.method,
    headers: h,
    body: tieneCuerpo ? await request.arrayBuffer() : null,
    redirect: 'manual',
  });
  return limpiarRespuesta(r);
}

async function activo(request, env, ctx, camino) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const cache = globalThis.caches?.default;
  const clave = new Request(new URL(request.url).toString(), { method: 'GET' });
  let r = cache ? await cache.match(clave) : undefined;
  if (!r) {
    r = await fetch(`https://${env.POSTHOG_ASSETS || 'us-assets.i.posthog.com'}${camino}`, { headers: { accept: request.headers.get('accept') || '*/*', 'accept-encoding': request.headers.get('accept-encoding') || 'gzip' } });
    r = limpiarRespuesta(r);
    if (cache && r.ok) ctx.waitUntil(cache.put(clave, r.clone()));
  }
  return r;
}

function limpiarRespuesta(r) {
  const h = new Headers(r.headers);
  h.delete('set-cookie');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

/** Manda un evento a /i/v0/e/. Reintenta una vez. Nunca tira: devuelve true si PostHog lo aceptó. */
export async function capturar(env, { event, distinct_id, properties = {}, intentos = 2 }) {
  if (!env.POSTHOG_KEY) return false;
  const cuerpo = JSON.stringify({ api_key: env.POSTHOG_KEY, event, distinct_id, properties: { $lib: 'tarima-worker', ...properties }, timestamp: new Date().toISOString() });
  for (let k = 0; k < intentos; k++) {
    try {
      const r = await fetch(`https://${env.POSTHOG_HOST || 'us.i.posthog.com'}/i/v0/e/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo, signal: AbortSignal.timeout(5000) });
      if (r.ok) return true;
      if (r.status < 500 && r.status !== 429) return false;
    } catch { /* red: se reintenta */ }
  }
  console.error(JSON.stringify({ msg: 'posthog_captura_fallo', event }));
  return false;
}

/** Evalúa las banderas en /flags?v=2. Devuelve el objeto `flags` de la respuesta, o null si no hay clave o falla. */
export async function evaluarBanderas(env, distinct_id) {
  if (!env.POSTHOG_KEY) return null;
  try {
    const r = await fetch(`https://${env.POSTHOG_HOST || 'us.i.posthog.com'}/flags?v=2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: env.POSTHOG_KEY, distinct_id }),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Con errores, mejor nada: una bandera pegajosa no puede quedar fija en un valor que no se calculó.
    if (!j || typeof j.flags !== 'object' || j.flags === null || j.errorsWhileComputingFlags) return null;
    return j.flags;
  } catch {
    return null;
  }
}
