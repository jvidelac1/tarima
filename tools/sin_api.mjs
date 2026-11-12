// Respuesta de «juego sin límite» para los servidores estáticos de las pruebas del juego (check_game, check_telefono…).
// Desde que el juego le pregunta al Worker (web/js/game/conexion.js), al cargar pide /api/estado y antes de cada final
// /api/partida. Un 404 ensuciaría la consola y las pruebas lo cuentan como error; acá se contesta como un Worker que deja
// jugar siempre (sin cuenta de finales, sin muro y sin métricas), que es lo que esas pruebas necesitan. El flujo con la
// cuenta de verdad, el muro, la encuesta y la lista lo prueba tools/check_muro.mjs con tools/servidor_local.mjs.
// Uso, primera línea del manejador: `if (sinApi(req, res)) return;`
export function sinApi(req, res) {
  const p = new URL(req.url, 'http://x').pathname;
  if (!p.startsWith('/api/') && !p.startsWith('/qx/')) return false;
  req.resume();
  const json = (codigo, o) => { res.writeHead(codigo, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (p === '/api/estado') json(200, { puede: true, quedan: null, lista: false, encuesta_disponible: false, flags: null, contexto: null, metricas: null });
  else if (p === '/api/partida') json(200, { estado: 'ok', fuente: 'local', pase: null, quedan: null });
  else json(200, {});
  return true;
}
