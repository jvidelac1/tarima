// Desde el 23-nov (pedido del dueño: «que no se pueda saltear a los pesistas») no hay botón «Saltar» en el turno de un rival:
// el turno dura ~5 s (RITMO.rival). Las pruebas que salteaban siguen llamando a esto y esperan, como cualquier jugador.

/** Ya no hay nada que saltar: siempre false (la prueba sigue con lo suyo). */
export async function saltarRival() { return false; }
