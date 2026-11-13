// Reglamento y balance (docs/JUEGO.md, secciones 3 a 7). Todo en enteros:
//   tiempo en ms · intensidad en diezmilésimas (10000 = 100 %) · esfuerzo, exigencia y calidad en milésimas ·
//   altura y desvío de la barra en mm · Resto en décimas de punto · kilos enteros · techos en gramos.
// Los valores son los iniciales del documento de diseño; el informe de balance (tools/balance.mjs) es la herramienta para ajustarlos.
import { idiv, rdiv, lerpi, clampi, mezclar, Azar, huella, canonico } from './fixed.js';

export const VERSION = '1.0';

/** Tabla de la sección 3.2: intensidad → ventana perfecta, velocidad del tirón, exigencia de la subida y altura sobrante. */
const T_I = [8000, 9000, 9500, 10000, 10300, 10600];
const T_PERF = [70, 52, 44, 35, 30, 30], T_VEL = [1000, 930, 890, 850, 830, 800], T_EXI = [200, 420, 540, 660, 750, 840], T_ALT = [100, 55, 33, 10, -4, -17];
function tabla(I, col, extrapola) {
  const n = T_I.length;
  if (I <= T_I[0]) return col[0];
  if (I >= T_I[n - 1]) return extrapola ? lerpi(I, T_I[n - 2], T_I[n - 1], col[n - 2], col[n - 1]) : col[n - 1];
  let k = 0; while (I > T_I[k + 1]) k++;
  return lerpi(I, T_I[k], T_I[k + 1], col[k], col[k + 1]);
}
export const velTiron = I => tabla(I, T_VEL, false);
export const exigenciaTabla = I => clampi(tabla(I, T_EXI, true), 0, 1400);
export const alturaTabla = I => tabla(I, T_ALT, true);

/** Piso de ventanas: la fila del 103 %. */
export const PISO = { p: 30, g: 66, l: 146 };
/** Multiplicador por gesto (milésimas): recepción del arranque 15 % más angosta; todo el envión 20 % más angosto. */
export const MULT_MOV = { s_exp: 1000, s_rec: 850, c_exp: 1000, c_rec: 1000, j_exp: 900, j_rec: 900 };
export const multTecnica = tec => 1000 + 100 * (tec - 7);
export const multTemple = tem => 1000 + 80 * (tem - 7);

/**
 * Ventanas de un gesto. Devuelve {p, g, l} en ms y `recorte`: los mm de altura que cuesta lo que el piso no dejó achicar
 * (1 cm por cada 10 % de ventana).
 * @param {number} I intensidad  @param {string} mov clave de MULT_MOV  @param {{tec:number, temple?:number, primera?:boolean, ancho?:number}} o
 *   `ancho` (milésimas) estira las tres ventanas; `k` lo devuelve para que el desvío use la misma curva estirada.
 */
export function ventanas(I, mov, o) {
  let m = MULT_MOV[mov] * multTecnica(o.tec);                       // millonésimas
  if (o.temple) m = idiv(m * multTemple(o.temple), 1000);
  const base = tabla(I, T_PERF, false), pr = idiv(base * m, 1000000);
  const p = pr < PISO.p ? PISO.p : pr, recorte = pr < PISO.p ? idiv((PISO.p - pr) * 100, PISO.p) : 0;
  const g = Math.max(PISO.g, rdiv(p * 22, 10));
  let l = Math.max(PISO.l, g + 80);
  if (o.primera) l = idiv(l * 13, 10);
  // nivel de control: el ancho se aplica al final, sobre las tres ventanas a la vez (docs/CONTROLES.md, sección 4)
  const k = o.ancho || 1000;
  return k === 1000 ? { p, g, l, recorte, k } : { p: idiv(p * k, 1000), g: idiv(g * k, 1000), l: idiv(l * k, 1000), recorte, k };
}
/** Calidad de un gesto (milésimas): 1000 dentro de la ventana perfecta, 0 en el límite. */
export const calidad = (e, w) => { const a = Math.abs(e); return a <= w.p ? 1000 : a >= w.l ? 0 : lerpi(a, w.p, w.l, 1000, 0); };
/** Palabra del gesto para la gráfica. */
export const palabra = (e, w) => { const a = Math.abs(e); return a <= w.p ? 'perfecto' : a <= w.g ? 'bien' : e < 0 ? 'temprano' : 'tarde'; };
/** Altura (mm) que da la explosión: perfecta +30, borde de buena −40, límite −100. */
export function alturaExplosion(e, w) { const a = Math.abs(e); return a <= w.p ? 30 : a <= w.g ? lerpi(a, w.p, w.g, 30, -40) : lerpi(Math.min(a, w.l), w.g, w.l, -40, -100); }
/** Desvío (mm, positivo adelante): soltar temprano 0,6 mm por ms fuera de la perfecta; tarde 0,4 mm por ms hacia atrás. */
export function desvioExplosion(e, w) { const a = idiv((Math.abs(e) - w.p) * 1000, w.k || 1000); return a <= 0 ? 0 : e < 0 ? idiv(a * 6, 10) : -idiv(a * 4, 10); }

/** Anillo de tensión: período de respiración (ms) y calidad del apretar. */
export const periodoAnillo = I => lerpi(clampi(I, 8000, 10000), 8000, 10000, 1600, 1300);
export const TENSION = { perfecta: 90, buena: 220, mm: { perfecta: 10, buena: 0, floja: -20 } };
/** Distancia (ms) de x (desde que arrancó el anillo) al lleno más cercano. Los llenos caen en per, 2·per, 3·per… */
export function errorAnillo(x, per) { if (x < per) return per - x; const r = x % per; return r < per - r ? r : per - r; }
export const gradoTension = d => (d < TENSION.perfecta ? 'perfecta' : d < TENSION.buena ? 'buena' : 'floja');

export const ACOMODO_MS = 1200;
export const ALTURA_MIN = -60;           // por debajo: tirón sin altura
/** Topes de desvío (mm) por movimiento. */
export const TOPE_DESVIO = { s: 60, c: 80, split: 80, power: 60, squat: 40 };
/** Ajustes de altura (mm) por envión: el power necesita 4 cm más; el squat, 6 menos. */
export const ALTURA_ENVION = { split: 0, power: -40, squat: 60 };
export const NO_DOMINA = { altura: -20, desvio: -10 };
export const EXI_ARRANQUE = 0;
/** Lo que los errores suman a la exigencia de la subida (milésimas): por mm de altura perdida (con tope), por mm de desvío sobre 20 y por recepción a destiempo. */
export const EXI_ERROR = { porMm: 3, tope: 250, porDesvio: 2, recepcion: 150 };

/** Pelea (sección 4). Pasos de 1/120 s; avance, aporte y temblor en millonésimas. */
export const PELEA = {
  hz: 120, propio: 450, porGarra: 20, toque: 100000, mitadMs: 140, nadaMs: 90, precarga: 80000, precargaCal: 120,
  rebote: 200, graciaReboteMs: 300, subir: 4, topeSubir: 800000, hundir: 12, estancaDe: 300000, estancaA: 550000, estanca: 100,
  franja: 100, roja: 920, temblorExceso: 6, temblorRoja: 300000, recienteMs: 400, temblorBaja: 250000, desvioLibre: 20, temblorDesvio: 3000,
  aguanteMs: 4000, aguanteCae: 100, graciaMs: 500, hundidoMs: 400, maxMs: 12000, agujaPasos: 24,
};
export const esfuerzoPropio = garra => PELEA.propio + PELEA.porGarra * (garra - 6);
/** Traba de codos (sección 4.1). */
export const TRABA = { ini: 900000, iniLimite: 700000, menos: 200, pierde: 300000 };
/** Fijación y chicharra. */
export const FIJA = { firmeMs: 300, plazoMs: 2000, sueltaChicaMs: 120, chMin: 700, chMax: 1500, bajaSolaMs: 3000 };
export const HOMBROS = { ignoraMs: 450, maxMs: 8000, amagueMs: 300 };
/** Jueces: umbrales de la sección 5.3. */
export const JUEZ = { traba1: 350, traba2: 700, temblor1: 500000, temblor2: 750000 };

/** Reloj del llamado (ms) y cierre de cambios. */
export const RELOJ = { normal: 30000, seguido: 45000, cambiosHasta: 15000 };

/** Resto (décimas de punto). */
export const RESTO = { ini: 1000, base: { s: 60, c: 80 }, sobre95: 10, toque: 5, fueraSeg: 30, topePelea: 150, nulo: 80, envion: { split: 0, power: -60, squat: 40 }, ajeno: 50, seguido: 10, intervalo: 150, tocado: 850 };
export const multFondo = fondo => 1400 - 50 * fondo;     // milésimas
/** Techo del momento (g): el del día menos 1 % por cada 20 puntos de Resto perdidos. */
export const techoMomento = (techoG, resto) => idiv(techoG * (20000 - (RESTO.ini - resto)), 20000);
export const intensidad = (kg, techoG) => idiv(kg * 1000 * 10000, techoG);

/** Marco ficticio (sección 6.1). */
export const EVENTO = { titulo: 'Mundial Tarima 2026', sesion: 'Final · 90 kg', records: { s: 179, c: 214, t: 388 } };
export const APERTURA = { min: 880, max: 970 };            // milésimas del techo de ficha
export const PLAN = [4, 3];                                  // saltos del plan del entrenador para el jugador
/** Niveles: error típico de tiempo (ms) y de pelea (milésimas) de los rivales, kilos de forma y cuánto más abajo abren y declaran (milésimas del techo). */
export const NIVELES = { amistoso: { sd: 55, pelea: 90, forma: 0, abre: -35 }, normal: { sd: 36, pelea: 60, forma: 0, abre: 0 }, dificil: { sd: 27, pelea: 40, forma: 1, abre: 0 } };
export const KG_MAX = 260;

/**
 * Nivel de control «Fácil» (docs/CONTROLES.md, sección 4). Lo que es de teclas vive en game/controles.js.
 * La dificultad aparece al pedir kilos, no en la apertura: varias reglas se aflojan según la «holgura» de la intensidad
 * (`holgura(I)`, milésimas): 1000 hasta `holgadoHasta`, baja en línea recta y llega a 0 en el 100 % del techo.
 *   ancho        de las ventanas de PERFECTO, BIEN y límite, en milésimas: `ancho` con holgura entera, `anchoTecho` sin holgura
 *   abreMs, limMin  la ventana de la señal: un toque cuenta desde `abreMs` antes del objetivo (en el tirón, además, no antes
 *                de la rodilla) hasta `limMin` después (o el límite, si es más ancho). Fijas a cualquier peso: con más kilos
 *                se achican PERFECTO y BIEN, no lo que se acepta. Un toque antes de que abra no llega al núcleo (la capa
 *                responde «todavía no» y la señal sigue esperando); uno más allá del límite de calidad cuenta como el peor
 *                TEMPRANO o TARDE
 *   vueloMm      con holgura entera, mm de altura y de desvío que la barra puede perder de más en el vuelo con un toque en
 *                TEMPRANO o TARDE sin caerse (un toque en PERFECTO o BIEN no la pierde nunca)
 *   amagues      amagues permitidos por movimiento; el siguiente toque anticipado es fallo (desde el 12-nov, tarde la capa no
 *                deja pasar toques anticipados: queda para registros armados a mano)
 *   perdidaLibre mm de altura perdida que no suman exigencia (el borde de BIEN): PERFECTO y BIEN piden el mismo empuje
 *   porMm        de ahí al límite, milésimas de exigencia por mm (TEMPRANO y TARDE sí cuestan)
 *   asist, asistTecho, asistHasta, solaMax  la barra sube sola en los pesos livianos, más lenta que tocando: con
 *                esfuerzo propio + asist por encima de la exigencia, avanza a la velocidad que daría ese esfuerzo, con
 *                tope `solaMax` (millonésimas por s: 300 000, unos 3,3 s de subida). `asist` (milésimas) vale con holgura
 *                entera y baja en línea recta hasta `asistTecho` en la intensidad `asistHasta`: desde el 96 % hay que tocar.
 *                Tocar suma solo si empuja más rápido que eso
 *   plazoMs, ritmo  la subida se corta sola: pasado el plazo, el avance tiene que ir por delante de un piso que sube a
 *                `ritmo` millonésimas por ms; si el piso lo alcanza, se cae. Reemplaza al «hundido»; no hay zona de estancamiento
 *   maxMs        tope de la pelea y de la traba de codos
 *   cierreMs     tiempo mínimo entre ¡FLEXIONÁ! y ¡ARRIBA! (el círculo tiene que poder verse cerrar)
 */
export const FACIL = {
  holgadoHasta: 9200, ancho: 2000, anchoTecho: 1150, abreMs: 300, limMin: 330, vueloMm: 40, amagues: 2, perdidaLibre: 80, porMm: 4,
  asist: 250, asistTecho: 30, asistHasta: 9600, solaMax: 300000, plazoMs: 1500, ritmo: 250, maxMs: 6000, cierreMs: 600,
  // con el dedo (`tactil` en la cabecera del registro): el toque y la pantalla atrasan más y varían más que una tecla. Las
  // ventanas de PERFECTO, BIEN y límite se estiran `tactil` milésimas, y la de la señal abre `tactilAbre` ms antes y cierra
  // `tactilLim` ms después (decisión del dueño del 12-nov: «es medio complicada la dinámica de pegarle perfecto al tap»)
  tactil: 1300, tactilAbre: 80, tactilLim: 110,
};
/** Holgura de Fácil a la intensidad I (milésimas): 1000 en los pesos de apertura, 0 desde el 100 % del techo. */
export const holgura = I => (I <= FACIL.holgadoHasta ? 1000 : I >= 10000 ? 0 : lerpi(I, FACIL.holgadoHasta, 10000, 1000, 0));
/** De `sin` (holgura 0) a `con` (holgura entera). */
export const segunHolgura = (I, con, sin) => sin + idiv((con - sin) * holgura(I), 1000);
/** Esfuerzo que el pesista pone solo en la subida de Fácil a la intensidad I (milésimas). */
export const asistFacil = I => (I <= FACIL.holgadoHasta ? FACIL.asist : I >= FACIL.asistHasta ? FACIL.asistTecho : lerpi(I, FACIL.holgadoHasta, FACIL.asistHasta, FACIL.asist, FACIL.asistTecho));
/** Ancho de las ventanas de Fácil a la intensidad I (milésimas). */
export const anchoFacil = I => segunHolgura(I, FACIL.ancho, FACIL.anchoTecho);
export const CONTROLES = ['c', 'f', 'u'];

/**
 * Nivel de control «Un toque, un tramo» (`'u'`, docs/JUEGO.md, sección Gameplay 2 y su revisión 2.1). Ningún toque tiene un
 * momento justo y NINGÚN toque cambia el resultado: los contactos solo acompañan (arrancan antes, aceleran la subida) y
 * cada tramo con toque sale solo si no se toca. Si la barra sube o no lo deciden la ENERGÍA (milésimas: 1 punto = 1000),
 * los kilos y el cuerpo del pesista, y un poco de suerte en cada tramo que se ve recién cuando ese tramo termina.
 *   margen     energía inicial de todos (3 puntos)
 *   base       gasto de cada tramo al 100 % del techo del momento; `r(I)` lo escala (0 hasta `rDesde`, 1 en `rHasta`, y sigue).
 *              Calibrada con tools/margen_cal.mjs sobre los cuerpos de CUERPOS_U (13-nov, 2.1: 940/1600/1700)
 *   envion     el tramo «arriba» del dos tiempos: factor `k` (milésimas) y gasto fijo `mas`; el squat suma `squatMovil` si la
 *              movilidad es alta (negativo: devuelve energía) y `squatRigido` si no
 *   pararseMenos  lo que el tramo de pararse gasta de menos (antes era el premio del pisotón; ahora vale siempre)
 *   ruidoPaso  la suerte de cada tramo va en pasos de estos milésimos, entre −ruido y +ruido de cada cuerpo (uniforme)
 *   garra      lo que suma la garra (una por levantamiento). Se usa SOLA cuando un tramo deja la energía apenas debajo de
 *              cero (hasta `frenoMin`) y con ella el resto del levantamiento llega (sin suerte); si no alcanzaría, no se
 *              gasta y queda para otro intento. `frenoMs`: la pausa dramática del FRENO (solo presentación: no hay que tocar)
 *   alLimite   menos que esto al terminar: «al límite» (vale igual; la presentación pone suspenso)
 *   confMs     contactos después de confirmar que son parte de la confirmación · dobleTecla, dobleDedo  dos contactos más
 *              cerca que esto son uno solo
 *   saltaDesde ms después del contacto de ¡TIRA! en que un contacto cuenta como ¡SALTA! (antes, queda guardado)
 *   tiraSolo   ¡TIRA! sale solo a estos ms de aparecer · respiraMs  RESPIRA con la barra en los hombros · arribaSolo
 *              ¡ARRIBA! sale solo a estos ms de abrir. Sin tocar no se pierde nada: solo se espera un poco más
 *   pararseMs  el tramo de ¡PÁRATE! cierra a lo sumo a estos ms de empezar la subida (antes, si hubo pisotón, a los
 *              `pisotonCierre` ms del pisotón y no antes de `pararseMin`). `pDuda`: hasta dónde sube la barra antes del cierre
 *   subeMs     del cierre a quedar de pie, con pisotón y sin él · squatMs  la subida del squat jerk (automática)
 *   chicharraMax  AGUANTA dura a lo sumo esto antes de ¡ABAJO! (la chicharra de los jueces; en Clásico, hasta FIJA.chMax)
 */
export const UNO = {
  // versión de las reglas de 'u' y del entrenador (sim/entrenador.js), que declara el peso de la persona: entra en HUELLA_U
  version: '2.1',
  margen: 3000,
  base: { tiron: 940, arriba: 1600, pararse: 1700 }, rDesde: 8500, rHasta: 10000,
  envion: { split: { k: 800, mas: 0 }, power: { k: 1000, mas: 500 }, squat: { k: 1000, mas: 0 } }, squatMovil: -250, squatRigido: 500,
  pararseMenos: 500, ruidoPaso: 50, garra: 500, frenoMs: 1000, frenoMin: -500, alLimite: 250,
  confMs: 300, dobleTecla: 120, dobleDedo: 80,
  saltaDesde: 250, tiraSolo: 2000, respiraMs: 450, arribaSolo: 2000,
  pararseMs: 1000, pararseMin: 600, pisotonCierre: 300, pDuda: 550000, subeMs: { con: 550, sin: 750 }, squatMs: 900, chicharraMax: 800,
};
/**
 * Cuerpo de juego de cada pesista en `'u'` (milésimas por tramo sobre UNO.base; `ruido`: amplitud de la suerte de cada
 * tramo, en pasos de UNO.ruidoPaso; `movil`: movilidad alta, para el squat; `casa`: el envión que el panel propone).
 * Vive acá y no en sim.json: así la huella de sim.json no cambia y los registros viejos de 'c' y 'f' se siguen recalculando
 * (replay.js). Los registros de 'u' llevan su propia huella (HUELLA_U). Los rivales juegan en Clásico y no los leen.
 *   Compacto (ventura)  fuerte arriba de la cabeza, techo más bajo; FIABLE: poca suerte (±200 por tramo)
 *   Largo (brenner)     fuerte en el tirón, débil al pararse; suerte normal (±250)
 *   Potente (marangi)   fuerte al pararse, débil arriba de la cabeza; IRREGULAR: mucha suerte para los dos lados (±600)
 * Calibrados el 13-nov (Gameplay 2.1, scratchpad g21/kg50.mjs y tools/pesistas_test.mjs) para que ninguno domine: total que
 * sube 9 de 10 veces 376 / 377 / 371 kg, 5 de 10 380 / 382 / 383, 2 de 10 383 / 385 / 391. Compacto es el seguro; Potente,
 * el que puede dar la sorpresa cuando hace falta (y el que más se cae si se le pide de más).
 */
export const CUERPOS_U = {
  ventura: { tiron: 1290, arriba: 740, pararse: 970, ruido: 4, movil: true, casa: 'split' },
  brenner: { tiron: 550, arriba: 900, pararse: 1260, ruido: 5, movil: false, casa: 'split' },
  marangi: { tiron: 950, arriba: 1300, pararse: 600, ruido: 12, movil: false, casa: 'split' },
};
export const CUERPO_NEUTRO = { tiron: 870, arriba: 980, pararse: 880, ruido: 5, movil: false, casa: 'split' };
/** Cuerpo de juego del pesista `id` (o de una ficha que traiga `cuerpoJuego`, para pruebas); sin datos, CUERPO_NEUTRO. */
export const cuerpoDe = x => ({ ...CUERPO_NEUTRO, ...(typeof x === 'string' ? CUERPOS_U[x] || {} : x && x.cuerpoJuego ? x.cuerpoJuego : {}) });
/** Huella de las reglas de 'u' (UNO y los cuerpos): va en la cabecera de los registros de 'u' y replay.js la exige. */
export const HUELLA_U = huella(canonico({ UNO, CUERPOS_U, CUERPO_NEUTRO }));
/** r(I) en milésimas: 0 hasta UNO.rDesde, 1000 en UNO.rHasta, y sigue en línea recta (1200 al 103 %). */
export const rUno = I => (I <= UNO.rDesde ? 0 : idiv((I - UNO.rDesde) * 1000, UNO.rHasta - UNO.rDesde));
/** Tramos de cada levantamiento, en orden. */
export const TRAMOS = { s: ['tiron', 'arriba', 'pararse'], c: ['tiron', 'pararse', 'arriba'] };
/** Gasto de un tramo sin suerte (milésimas). No depende de cómo se toque. */
export function gastoTramo(tramo, I, lev, env, cuerpo) {
  const r = rUno(I), k = cuerpo[tramo] ?? 1000;
  let g = idiv(UNO.base[tramo] * r * k, 1000000);
  if (tramo === 'arriba' && lev === 'c') { const E = UNO.envion[env] || UNO.envion.split; g = idiv(g * E.k, 1000) + E.mas + (env === 'squat' ? (cuerpo.movil ? UNO.squatMovil : UNO.squatRigido) : 0); }
  if (tramo === 'pararse') g = Math.max(0, g - UNO.pararseMenos);
  return g;
}
/** Gasto con la suerte `ruido` (milésimas): un tramo que no gasta nada no tiene suerte, y ninguno devuelve energía. */
export const conSuerte = (g, ruido) => (g > 0 ? Math.max(0, g + ruido) : 0);
/** Suerte del tramo `i` (0, 1, 2) de un intento: uniforme entre −ruido y +ruido pasos, de la semilla del intento. */
export function ruidoDe(semilla, i, pasos) { if (!pasos) return 0; const r = new Azar(mezclar(semilla, 31, i)); return (r.ent(2 * pasos + 1) - pasos) * UNO.ruidoPaso; }
/** La garra se usa si deja la energía en ≥ 0 en este tramo y, sin suerte, en todos los que faltan. */
export function garraAlcanza(m, restantes) { let x = m + UNO.garra; if (x < 0) return false; for (const g of restantes) { x -= g; if (x < 0) return false; } return true; }
/**
 * Lo que el panel muestra para un peso («llegas con»): sin suerte y sin garra. `fin`: energía al terminar (negativo: no
 * llega); `justo`: el tramo donde queda más baja; `mayor`: el que más gasta; `gastos`.
 */
export function previsto(I, lev, env, cuerpo) {
  let m = UNO.margen, min = Infinity, justo = null, mayor = null; const gastos = {};
  for (const tr of TRAMOS[lev]) {
    const g = gastos[tr] = gastoTramo(tr, I, lev, env, cuerpo); m -= g;
    if (m < min) { min = m; justo = tr; } if (mayor === null || g > gastos[mayor]) mayor = tr;
  }
  return { fin: m, min, justo, mayor, gastos };
}
/**
 * Chance de que la barra suba (milésimas, 0 a 1000), para cualquiera: como ningún toque cambia el resultado, depende solo de
 * la suerte de cada tramo (ruidoDe) y de si queda la garra (`o.garra`). Exacta: recorre todas las combinaciones de suerte con
 * las mismas reglas que attempt.js (_uCierra). La usan el panel del llamado («X de 10») y las pruebas. Enteros.
 */
export function chanceUno(I, lev, env, cuerpo, o = {}) {
  const garra0 = o.garra !== false, G = TRAMOS[lev].map(tr => gastoTramo(tr, I, lev, env, cuerpo)), k = cuerpo.ruido || 0, n = 2 * k + 1;
  let ok = 0;
  const paso = (i, m, garra) => {
    if (i === G.length) { ok++; return; }
    for (let j = 0; j < n; j++) {
      let x = m - conSuerte(G[i], (j - k) * UNO.ruidoPaso), g = garra;
      if (x < 0) { if (g && x >= UNO.frenoMin && garraAlcanza(x, G.slice(i + 1))) { x += UNO.garra; g = false; } else continue; }
      paso(i + 1, x, g);
    }
  };
  paso(0, UNO.margen, garra0);
  return idiv(ok * 1000, n * n * n);
}

/** Causas con su texto. Las de fallo y las de nulo (secciones 5.2 y 5.3). */
export const CAUSAS = {
  anticipado: 'Tirón anticipado', sin_altura: 'Tirón sin altura', adelante: 'Barra adelante', atras: 'Barra atrás', fondo: 'La pierde en el fondo',
  aplastado: 'Aplastado', codos: 'Ceden los codos', temblor: 'Pierde la barra arriba', devuelve: 'Devuelve la barra',
  codos_blandos: 'Codos blandos', tiembla: 'Llega temblando', antes: 'Suelta antes de la chicharra', sin_apoyo: 'No fija la barra', reloj: 'Se acabó el reloj',
};
