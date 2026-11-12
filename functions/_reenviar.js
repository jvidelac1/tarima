// Lo común de las Functions de Pages: pasar el pedido al Worker «tarima» por la service binding TARIMA
// (wrangler.jsonc de la raíz). Este archivo no exporta onRequest, así que no es una ruta.
//
// El Worker cuenta las finales por IP y guarda el país aproximado. Como no se sabe con certeza si CF-Connecting-IP y
// request.cf llegan intactos al otro lado de la binding, la Function los copia en x-tarima-ip y x-tarima-pais, después
// de borrar lo que haya mandado el navegador con esos nombres. El Worker les cree solo con CONFIAR_PAGES=1, y el proxy
// de PostHog los saca antes de salir.
export async function reenviar({ request, env }) {
  if (!env.TARIMA) {
    return new Response('{"error":"servidor"}', {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const h = new Headers(request.headers);
  h.delete('x-tarima-ip');
  h.delete('x-tarima-pais');
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) h.set('x-tarima-ip', ip);
  const pais = request.cf?.country;
  if (typeof pais === 'string' && pais) h.set('x-tarima-pais', pais);
  return env.TARIMA.fetch(new Request(request, { headers: h }));
}
