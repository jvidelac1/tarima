// Marcador de la final: un solo mensaje coherente según el estado (verificación independiente del 12-nov: decía «Para pasar
// al frente» arriba de «Vas ganando · 159 kg de ventaja» mientras el rival iba a levantar 161 y todavía no tenía marca).
// Puro, sin DOM: lo prueba tools/sim_test.mjs. main.js pone los nombres (el del jugador va escapado).
//
// - Vas primero: «Vas ganando», con la ventaja solo contra quien ya tiene marca. Si el rival que está en la tarima te pasa
//   con los kilos que pidió: «Brenner intenta 161 kg: si lo levanta, te pasa».
// - Va primero otro: «Va ganando X» y cuántos kilos te faltan para pasarlo (o que sin arranque válido no hay total).
// - Empatados: «Empatados en N kg».

/** Lo que vale en lo que se compite ahora: el arranque o el total. */
const valor = (f, lev) => (lev === 's' ? f.s : f.total) || 0;

/** true si el intento `L` (todavía sin resolver) es de un rival y, válido con sus kilos, lo deja primero. */
export const amenaza = (p, yo, L) => !!L && L.a !== yo && L.lev === p.lev && p.puestoSi(L.a, L.lev, L.kg) === 1;

/**
 * @param {object} p Partida  @param {number} yo índice del jugador  @param {object|null} L intento en la tarima, sin resolver
 * @returns {null | {propio:boolean, lider:number, clave:string, kg?:number, sub:null|{clave:string, kg?:number, rival?:number}}}
 *   `lider` y `sub.rival` son índices de pesista (main.js los pasa a nombre).
 */
export function marcadorDe(p, yo, L = null) {
  if (!p || p.fase === 'fin') return null;
  const tab = p.tabla(), lev = p.lev, P = tab[0], mio = tab.find(f => f.a === yo);
  if (!P || !valor(P, lev)) return null;
  if (P.a === yo) {
    const seg = tab.find(f => f.a !== yo && valor(f, lev) > 0);
    const dif = seg ? valor(P, lev) - valor(seg, lev) : 0;
    const sub = amenaza(p, yo, L) ? { clave: 'marcador.te_pasa', rival: L.a, kg: L.kg } : null;
    if (seg && !dif) return { propio: true, lider: yo, clave: 'marcador.empate', kg: valor(P, lev), sub };   // primero por desempate
    return { propio: true, lider: yo, clave: seg ? 'marcador.ganas' : 'marcador.ganas_solo', ...(seg ? { kg: dif } : {}), sub };
  }
  if (mio && valor(mio, lev) === valor(P, lev)) return { propio: false, lider: P.a, clave: 'marcador.empate', kg: valor(P, lev), sub: null };
  const C = p.cuenta(yo);
  const sub = lev === 'c' && !p.at[yo].mejor.s ? { clave: 'marcador.sin_total' } : C.oro ? { clave: 'marcador.falta', kg: C.oro } : null;
  return { propio: false, lider: P.a, clave: 'marcador.gana', sub };
}

/**
 * Etiquetas que se muestran en el intento de un rival: si el jugador va primero, «Para pasar al frente» no va suelta (no
 * dice de quién habla y choca con «Vas ganando»); el marcador lo dice con el nombre del rival.
 */
export const etiquetasRival = (et, yoPrimero) => (yoPrimero ? (et || []).filter(e => e !== 'frente') : (et || []));
