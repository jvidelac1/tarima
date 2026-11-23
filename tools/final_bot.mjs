// Una final entera jugada por un bot de la barrita, con la misma configuración que arma el juego (main.js): sirve para
// probar el servidor (LIF-10: /api/final recalcula el registro) sin navegador.
import { Partida } from '../web/js/sim/match.js';
import { HUELLA_IA } from '../web/js/sim/ai.js';
import { mezclar } from '../web/js/sim/fixed.js';
import { reglasB } from '../web/js/sim/rules.js';
import { datos, ATL, PERFILES, jugarBarra } from './barra_bots.mjs';

/** Juega una final con la persona en `yo` y devuelve { reg, tabla, p }. */
export function finalBot(k, { yo = k % 3, perfil = 'medio', dif = 'facil', nivel = 'amistoso', semilla = mezclar(k, 4242) >>> 0, rm = null, plan = null, categoria = null } = {}) {
  const R = reglasB(dif);
  const p = new Partida(datos, { semilla, ia: HUELLA_IA, envFijo: true, turnos: 'rondas', nivel, cal: 0, primera: false, ctl: 'b', ...(dif !== 'facil' ? { dif } : {}), ...(categoria ? { categoria } : {}), tactil: true, atletas: ATL.map((id, i) => ({ id, ctrl: i === yo ? 'persona' : 'juego', ...(i === yo && rm ? { rm } : {}) })) });
  for (const lev of ['s', 'c']) { const [lo, hi] = p.rangoApertura(yo, lev); p.abrir(yo, lev, Math.max(lo, Math.min(hi, Math.round(p.at[yo].f.techo[lev] * R.apertura / 1000)))); }
  if (plan) p.elegirPlan(plan);
  p.empezar();
  for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
    if (p.fase === 'intervalo') { p.empezar(); continue; }
    const L = p.llamado; if (p.at[L.a].ctrl === 'juego') { p.resolverIA(); continue; }
    const env = L.lev === 'c' ? 'split' : undefined, ctx = p.contexto(env);
    const S = jugarBarra(ctx, PERFILES[perfil], mezclar(k, g, 99), { conf: 0, R }); p.resolver({ conf: S.conf, env, ent: S.ent });
  }
  return { reg: JSON.parse(JSON.stringify(p.reg)), tabla: p.tabla(), p };
}
