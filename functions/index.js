// «/» muestra el juego (docs/MVP.md 5.5: el visor no se enlaza). Se pide /juego y no /juego.html porque Pages
// redirige las direcciones con .html a la versión sin extensión. La dirección del navegador queda en «/», con su
// ?lang= o ?c=, y las rutas relativas de juego.html (js/, css/, models/) resuelven igual desde «/».
export function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  return env.ASSETS.fetch(new Request(new URL('/juego', request.url), request));
}
