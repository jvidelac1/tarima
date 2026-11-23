// «/» muestra el juego (docs/MVP.md 5.5: el visor no se enlaza). Se pide /juego y no /juego.html porque Pages
// redirige las direcciones con .html a la versión sin extensión. La dirección del navegador queda en «/», con su
// ?lang= o ?c=, y las rutas relativas de juego.html (js/, css/, models/) resuelven igual desde «/».
//
// Viralidad: un link de desafío (?desafio=id) llega con su propia vista previa (título, descripción e imagen de la tarjeta
// en WhatsApp, X, Discord…): «Nasar lifted 378 kg in this final. Can you beat it?». Los datos salen del Worker (/api/desafio,
// sin nada del dispositivo); si no responde, la vista previa de siempre.
import { reenviar } from './_reenviar.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function desafio(request, env, id) {
  const u = new URL(request.url), cuerpo = JSON.stringify({ id });
  const pedido = new Request(new URL('/api/desafio', u.origin), { method: 'POST', body: cuerpo, headers: { origin: u.origin, 'content-type': 'application/json', 'cf-connecting-ip': request.headers.get('cf-connecting-ip') || '' } });
  try { const r = await reenviar({ request: pedido, env }); if (!r.ok) return null; const j = await r.json(); return j && j.estado === 'ok' ? j : null; } catch { return null; }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const pagina = await env.ASSETS.fetch(new Request(new URL('/juego', request.url), request));
  const id = Number(new URL(request.url).searchParams.get('desafio'));
  if (!Number.isSafeInteger(id) || id < 1 || typeof HTMLRewriter === 'undefined') return pagina;
  const d = await desafio(request, env, id); if (!d) return pagina;
  const es = /^es\b/i.test(request.headers.get('accept-language') || '');
  const quien = d.apodo || (es ? 'Alguien' : 'Someone');
  const titulo = es ? `${quien} hizo ${d.total} kg en esta final. ¿Lo superas?` : `${quien} lifted ${d.total} kg in this final. Can you beat it?`;
  const desc = es ? 'Lifting Game: halterofilia a un botón, gratis en el navegador. La misma final, los mismos rivales: a ver quién levanta más.' : 'Lifting Game: one-button weightlifting, free in your browser. Same final, same rivals: see who lifts more.';
  const url = `${new URL(request.url).origin}/?desafio=${id}`;
  const pon = (sel, attr, v) => [sel, { element: e => e.setAttribute(attr, v) }];
  let rw = new HTMLRewriter().on('title', { element: e => e.setInnerContent(titulo) });
  for (const [sel, h] of [pon('meta[property="og:title"]', 'content', titulo), pon('meta[name="twitter:title"]', 'content', titulo), pon('meta[property="og:description"]', 'content', desc), pon('meta[name="twitter:description"]', 'content', desc), pon('meta[name="description"]', 'content', desc), pon('meta[property="og:url"]', 'content', url)]) rw = rw.on(sel, h);
  const res = rw.transform(pagina), h = new Headers(res.headers); h.set('cache-control', 'public, max-age=300'); h.delete('etag');
  void esc;
  return new Response(res.body, { status: res.status, headers: h });
}
