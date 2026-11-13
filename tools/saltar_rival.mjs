// El botón «Saltar» del turno de un rival (pedido del dueño del 13-nov): Espacio y los toques en la escena ya no saltean nada
// de los rivales; solo el botón (o su tecla, S). Las pruebas que antes salteaban con Espacio o con un toque usan esto.

/** Si «Saltar» está a la vista, lo usa: con teclado, la tecla S; con el dedo, un toque en el botón. true si saltó. */
export async function saltarRival(page, tactil = false) {
  const r = await page.evaluate(() => { const b = document.getElementById('saltar-rival'); if (!b || b.hidden) return null; const q = b.getBoundingClientRect(); return q.width ? { x: q.left + q.width / 2, y: q.top + q.height / 2 } : null; }).catch(() => null);
  if (!r) return false;
  if (tactil) await page.touchscreen.tap(r.x, r.y); else await page.keyboard.press('KeyS');
  return true;
}
