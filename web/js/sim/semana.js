// Campeonato semanal (LIF-8): la misma final (semilla y condiciones) para todos durante una semana ISO en UTC. Función pura
// de la hora: la usan el juego (para jugarla) y el Worker (para validar que una final del campeonato es la de esa semana).
import { mezclar } from './fixed.js';

/** Condiciones fijas del campeonato: barrita en Fácil contra rivales «normal». El pesista lo elige cada uno. */
export const CAMPEONATO = { ctl: 'b', dif: 'facil', nivel: 'normal', orden: 'rondas' };

const DIA = 86400;
// calendario civil con enteros (sin Date: el núcleo es puro), algoritmo de días desde la era de H. Hinnant
function diasDesde1970(y, m, d) { y -= m <= 2 ? 1 : 0; const era = Math.floor(y / 400), yoe = y - era * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1, doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; return era * 146097 + doe - 719468; }
function anioDe(dias) { const z = dias + 719468, era = Math.floor(z / 146097), doe = z - era * 146097, yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365), doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153), m = mp + (mp < 10 ? 3 : -9); return yoe + era * 400 + (m <= 2 ? 1 : 0); }
/** Semana ISO (lunes a domingo, UTC) del instante `s` (segundos): { clave: '2026-W48', anio, n, inicio, fin } (inicio y fin en segundos). */
export function semanaDe(s) {
  const dia = Math.floor(s / DIA), dow = (dia + 3) % 7;      // 1970-01-01 fue jueves: lunes = 0
  const lunes = dia - dow, jueves = lunes + 3;               // la semana es del año de su jueves
  const anio = anioDe(jueves);
  const ene4 = diasDesde1970(anio, 1, 4), lunes1 = ene4 - ((ene4 + 3) % 7);
  const n = (lunes - lunes1) / 7 + 1;
  return { clave: `${anio}-W${String(n).padStart(2, '0')}`, anio, n, inicio: lunes * DIA, fin: (lunes + 7) * DIA };
}
/** La semilla de la final de esa semana (entero de 32 bits sin signo). */
export const semillaSemana = clave => { const m = /^(\d{4})-W(\d{2})$/.exec(clave); if (!m) throw new Error('semana mal formada'); return mezclar(+m[1], +m[2], 48271) >>> 0; };
