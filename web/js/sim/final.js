// Resumen de una final terminada para la persona (LIF-10 y LIF-2): lo que el servidor guarda después de recalcularla. Puro:
// sale de la Partida recalculada, nunca de lo que diga el cliente.

/** @param {import('./match.js').Partida} p  partida terminada (recalcular(...).partida) */
export function resumenFinal(p) {
  const yo = p.at.findIndex(a => a.ctrl === 'persona');
  if (yo < 0) throw new Error('la final no tiene persona');
  const a = p.at[yo], fila = p.tabla().find(f => f.a === yo), ints = [...a.s, ...a.c];
  const cuenta = k => ints.filter(x => x.res === k).length;
  const zonas = ints.flatMap(x => x.zonas || []);
  return {
    yo, pesista: a.id, s: fila.s, c: fila.c, total: fila.total, puesto: fila.puesto ?? null, sin_marca: !!fila.sinMarca,
    intentos: ints.length, validos: cuenta('valido'), nulos: cuenta('nulo'), caidas: cuenta('fallo'),
    barritas: zonas.length, verdes: zonas.filter(z => z === 'verde').length, rojas: zonas.filter(z => z === 'rojo').length,
    todo_verde: ints.filter(x => x.zonas && x.zonas.length && x.zonas.every(z => z === 'verde')).length,
  };
}
