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
export const CONTROLES = ['c', 'f', 'u', 'b'];

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
  if (tramo === 'arriba' && lev === 'c') {
    // 'b' trae su propia tabla de enviones en el cuerpo (cuerpoBarra): split < power < squat para todos; 'u' usa la de UNO
    const T = cuerpo.envion || UNO.envion, E = T[env] || T.split, mov = cuerpo.envion ? cuerpo.squatMov : null;
    g = idiv(g * E.k, 1000) + E.mas + (env === 'squat' ? (mov ? (cuerpo.movil ? mov.alta : mov.baja) : cuerpo.movil ? UNO.squatMovil : UNO.squatRigido) : 0);
  }
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
 * llega); `justo`: el tramo donde queda más baja; `mayor`: el que más gasta; `gastos`; `conGarra`: no llega, pero con la
 * garra (si la tiene) sí.
 */
export function previsto(I, lev, env, cuerpo, m0 = UNO.margen) {
  let m = m0, min = Infinity, justo = null, mayor = null; const gastos = {};
  for (const tr of TRAMOS[lev]) {
    const g = gastos[tr] = gastoTramo(tr, I, lev, env, cuerpo); m -= g;
    if (m < min) { min = m; justo = tr; } if (mayor === null || g > gastos[mayor]) mayor = tr;
  }
  // sin suerte y con la garra: ¿la salva? (mismas reglas que _uCierra)
  let x = m0, conGarra = false; const G = TRAMOS[lev].map(tr => gastos[tr]);
  for (let i = 0; i < G.length; i++) { x -= G[i]; if (x >= 0) continue; if (!conGarra && x >= UNO.frenoMin && garraAlcanza(x, G.slice(i + 1))) { x += UNO.garra; conGarra = true; continue; } conGarra = false; break; }
  return { fin: m, min, justo, mayor, gastos, conGarra: conGarra && m < 0 };
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

/**
 * Nivel de control «la barrita» (`'b'`, docs/JUEGO.md, sección Gameplay 3): el Fácil por defecto desde el 13-nov (noche).
 * Usa la misma energía, los mismos cuerpos (CUERPOS_U), la suerte por tramo y la garra de `'u'`, pero el jugador tira él:
 * UNA barrita en el arranque (el tirón) y DOS en el dos tiempos (la cargada y el envión). Un puntero va y vuelve sobre la
 * barrita sin reloj que tire la barra; el toque dispara el tramo en ese instante y su posición decide cuánto cuesta:
 * verde (perfecto) nada de más, amarillo (regular) `costo.amarillo`, rojo (lejos) `costo.rojo`. Pararse y quedar firme
 * salen solos según la energía que queda. Todo en enteros; la posición del puntero va en milésimas de la barrita (0 a 1000,
 * el centro del verde en 500).
 *   pasada       ms que tarda el puntero de una punta a la otra; desde `lentoDesde` ms sin tocar, `pasadaLenta` (más lento)
 *   soloMs       sin ningún toque, el pesista tira solo a estos ms, como un toque REGULAR (amarillo): no se cae por no tocar,
 *                pero tampoco conviene esperar. Es el minuto del reloj de la competencia
 *   respiraMs    con la barra en los hombros, antes de que arranque la barrita del envión
 *   doble        dos contactos a menos de esto son uno (teclado y dedo)
 *   graciaMs     un contacto en los primeros ms de una barrita no la dispara (el puntero recién sale de la punta roja: es la
 *                cola de un toque anterior, no una decisión)
 *   tI, tVerde, tAmarillo  medio ancho del verde (ms de puntero) según la intensidad, y lo que el amarillo suma a cada lado:
 *                ancho con la apertura, angosto cerca del techo. Los multiplica el pesista (`pesistas`, milésimas: fuerte en
 *                esa barrita = más ancho) y el primer intento de la primera final (`primera`)
 *   costo        energía de más que gasta el tramo según la zona (se suma al gasto del tramo de esa barrita)
 *   escala       el gasto de cada tramo en 'b' sobre el de 'u' (milésimas)
 *   envion       el tramo «arriba» del dos tiempos en 'b' por estilo: split (tijera) el más fácil, power intermedio, squat el más
 *                difícil, para todos (`squatMov`: la movilidad alta achica la diferencia del squat sin invertir el orden), y
 *                `verdeEnvion`: el verde de la barrita del envión por estilo (milésimas)
 *   fatiga       cansancio: lo que un levantamiento exigió (un cuarto de lo que costaron sus toques, `garra` si la usó y un cuarto
 *                de lo que quedó por debajo de `bajo`), en pasos de `paso`, se resta a la energía inicial de los intentos
 *                siguientes del mismo levantamiento; del arranque pasa la mitad al dos tiempos. Tope `tope` por levantamiento
 *   esfuerzo     en un intento exigente (desde la intensidad `desdeI`, si al empezar a pararse la energía que quedaría sin
 *                suerte baja de `umbral`), pararse pide `toques` toques en `ms` (sin apuro: 2 por segundo alcanzan). Si los
 *                hace, el tramo cuesta `premio` menos; si no, cuesta lo de siempre (cae solo si no alcanzaba)
 *   tipico       la persona que supone el panel («X de 10»): error de tiempo de campana (`sd` ms, corrida `sesgo` ms) y
 *                `despiste` milésimas de toques en cualquier lado. La miden tools/barra_bots.mjs y tools/chance_test.mjs
 */
export const BARRA = {
  version: '1.0',
  pasada: 1400, lentoDesde: 8000, pasadaLenta: 1700, soloMs: 60000, respiraMs: 800, doble: 120, graciaMs: 250,
  tI: [9000, 9500, 10000, 10300], tVerde: [170, 125, 75, 60], tAmarillo: [220, 180, 140, 130], primera: 1400, topeVerde: 380, topeAmarillo: 470,
  costo: { verde: 0, amarillo: 600, rojo: 1500 },
  escala: { tiron: 925, arriba: 925, pararse: 925 },
  pesistas: { ventura: { tiron: 1000, envion: 1000 }, brenner: { tiron: 1250, envion: 800 }, marangi: { tiron: 750, envion: 1300 } },
  neutro: { tiron: 1000, envion: 1000 },
  envion: { split: { k: 700, mas: 0 }, power: { k: 850, mas: 300 }, squat: { k: 950, mas: 600 } }, squatMov: { alta: -200, baja: 0 },
  verdeEnvion: { split: 1000, power: 900, squat: 800 },
  fatiga: { bajo: 500, garra: 250, paso: 50, tope: 750 },
  esfuerzo: { desdeI: 9500, umbral: 100, toques: 3, ms: 3000, premio: 300 },
  tipico: { sesgo: 30, sd: 105, despiste: 40, esfuerzo: 950 },
};
/** Huella de las reglas de 'b' (BARRA, UNO y los cuerpos): va en la cabecera de los registros de 'b' y replay.js la exige. */
export const HUELLA_B = huella(canonico({ BARRA, UNO, CUERPOS_U, CUERPO_NEUTRO }));
/**
 * Niveles de dificultad de la barrita (pedido del dueño del 13-nov: «si es un poco más difícil, que requiera un poco más de
 * interacción»). Fácil es BARRA tal cual (sus registros y su huella no cambian). Medio y Difícil cambian solo esto:
 *   barritas     qué barritas tiene cada levantamiento, en orden (0 tirón, 1 envión, 2 atrapar la barra arriba en el arranque,
 *                3 pararse del fondo). Atrapar y pararse corren con el pesista quieto en el fondo: nada de coordinar con el
 *                movimiento; el toque cierra ese tramo (atrapar) o lo arranca (pararse)
 *   pasada, pasadaLenta, lentoDesde  el puntero (más rápido; en Difícil nunca se pone lento: lentoDesde = soloMs)
 *   verde, amarillo  milésimas del ancho (en la barrita) del verde y del amarillo de Fácil a la misma intensidad
 *   costo, costoExtra  lo que cuestan las zonas de tirón y envión (si falta, BARRA.costo) y las de atrapar y pararse: con más
 *                barritas, cada toque regular cuesta menos (el total que se puede perder sigue parecido)
 *   esfuerzo, tipico  el esfuerzo de pararse (desde qué intensidad y cuántos toques) y la persona típica del panel: quien
 *                elige Medio o Difícil suele apuntar mejor (±100 y ±90 ms en lugar de ±105); chance_test la mide en cada nivel
 * PESISTAS_B2: ancho del verde de atrapar y pararse por pesista (como BARRA.pesistas): Compacto fuerte arriba, Largo débil
 *                al pararse, Potente fuerte al pararse y débil arriba (los mismos puntos fuertes de CUERPOS_U)
 *   apertura     milésimas del techo de la apertura que sugiere la presentación
 */
export const DIFICULTADES = ['facil', 'medio', 'dificil'];
const PESISTAS_B2 = { ventura: { atrapa: 1150, pararse: 1000 }, brenner: { atrapa: 1000, pararse: 850 }, marangi: { atrapa: 850, pararse: 1150 } };
export const NIVELES_B = {
  medio: {
    version: '1.0', barritas: { s: [0, 2], c: [0, 3, 1] }, pasada: 1200, pasadaLenta: 1500, lentoDesde: 8000, verde: 800, amarillo: 1000,
    costoExtra: { verde: 0, amarillo: 350, rojo: 900 }, esfuerzo: { desdeI: 9200, umbral: 100, toques: 5, ms: 3000, premio: 350 },
    tipico: { sesgo: 28, sd: 100, despiste: 38, esfuerzo: 930 }, apertura: 890,
  },
  dificil: {
    version: '1.0', barritas: { s: [0, 2, 3], c: [0, 3, 1] }, pasada: 1000, pasadaLenta: 1000, lentoDesde: 60000, verde: 650, amarillo: 900,
    costo: { verde: 0, amarillo: 450, rojo: 1200 }, costoExtra: { verde: 0, amarillo: 300, rojo: 800 }, esfuerzo: { desdeI: 8800, umbral: 100, toques: 6, ms: 3000, premio: 400 },
    tipico: { sesgo: 25, sd: 90, despiste: 35, esfuerzo: 900 }, apertura: 880,
  },
};
const FACIL_B = { barritas: { s: [0], c: [0, 1] }, verde: 1000, amarillo: 1000, costoExtra: BARRA.costo, apertura: 900 };
const CACHE_B = {};
/** Reglas de la barrita del nivel `dif` ('facil' si falta): BARRA con lo que cambia el nivel. */
export function reglasB(dif) {
  const d = NIVELES_B[dif] ? dif : 'facil';
  return CACHE_B[d] ||= Object.freeze({ ...BARRA, ...FACIL_B, ...(NIVELES_B[d] || {}), dif: d });
}
/** Huella de las reglas de 'b' de cada nivel: Fácil, la de siempre; Medio y Difícil, con lo que cambian. */
export const HUELLAS_B = { facil: HUELLA_B, medio: huella(canonico({ BARRA, UNO, CUERPOS_U, CUERPO_NEUTRO, nivel: NIVELES_B.medio, extra: PESISTAS_B2 })), dificil: huella(canonico({ BARRA, UNO, CUERPOS_U, CUERPO_NEUTRO, nivel: NIVELES_B.dificil, extra: PESISTAS_B2 })) };
/** Tramo de cada barrita: 0 el tirón (arranque y cargada), 1 el envión y 2 atrapar (tramo «arriba»), 3 pararse. */
export const TRAMO_BARRA = ['tiron', 'arriba', 'arriba', 'pararse'];
/** La barrita de `lev` que cierra (o arranca) el tramo `tramo` en las reglas `R`, o -1. */
export const barritaDeTramo = (R, lev, tramo) => { for (const i of R.barritas[lev]) if (TRAMO_BARRA[i] === tramo) return i; return -1; };
/**
 * Cuerpo de juego en 'b': el de 'u' con el gasto escalado (BARRA.escala) y el ancho de cada barrita (`barra`).
 * Acepta el id del pesista o un cuerpo ya armado (para pruebas).
 */
export function cuerpoBarra(x) {
  const c = typeof x === 'string' || !x || x.cuerpoJuego ? cuerpoDe(x) : { ...CUERPO_NEUTRO, ...x }, E = BARRA.escala;
  return { ...c, tiron: idiv(c.tiron * E.tiron, 1000), arriba: idiv(c.arriba * E.arriba, 1000), pararse: idiv(c.pararse * E.pararse, 1000),
    barra: { ...BARRA.neutro, atrapa: 1000, pararse: 1000, ...(typeof x === 'string' ? { ...BARRA.pesistas[x], ...PESISTAS_B2[x] } : x && x.barra) }, envion: BARRA.envion, squatMov: BARRA.squatMov };
}
/** Cansancio (energía, milésimas) que deja un levantamiento en 'b' (`uno`: res.uno del núcleo). */
export function fatigaDe(uno) {
  if (!uno) return 0; const F = BARRA.fatiga, toques = (uno.barras || []).reduce((a, b) => a + b.extra, 0);
  const f = idiv(toques, 4) + (uno.garra === 'usada' ? F.garra : 0) + (uno.margen_fin < F.bajo ? idiv(F.bajo - Math.max(uno.margen_fin, -F.bajo), 4) : 0);
  return idiv(f, F.paso) * F.paso;
}
/** ¿Pide el esfuerzo de pararse? `m`: energía al empezar a pararse; `gPararse`: lo que cuesta pararse sin suerte (con su barrita). */
export const pideEsfuerzo = (I, m, gPararse, R = BARRA) => I >= R.esfuerzo.desdeI && gPararse > 0 && m - gPararse < R.esfuerzo.umbral;
/** Agrega el cansancio `f` de un intento del levantamiento `lev` a `fat` ({s, c}): todo en el mismo, la mitad del arranque al dos tiempos. */
export function sumarFatiga(fat, lev, f) {
  const T = BARRA.fatiga.tope, P = BARRA.fatiga.paso;
  fat[lev] = Math.min(T, fat[lev] + f); if (lev === 's') fat.c = Math.min(T, fat.c + idiv(idiv(f, 2), P) * P);
  return fat;
}
/** Posición del puntero (milésimas de la barrita, 0 a 1000) a `e` ms de que arrancó: va y vuelve, empieza a la izquierda. */
export function posBarra(e, R = BARRA) {
  if (e <= 0) return 0;
  const L = R.lentoDesde, x = e <= L ? idiv(e * 1000, R.pasada) : idiv(L * 1000, R.pasada) + idiv((e - L) * 1000, R.pasadaLenta), u = x % 2000;
  return u <= 1000 ? u : 2000 - u;
}
/** Medio ancho del verde y del amarillo en ms de puntero de Fácil (antes de pasarlo a la barrita). */
function anchosMs(I, k, primera) {
  const T = BARRA.tI, n = T.length, tab = col => (I <= T[0] ? col[0] : I >= T[n - 1] ? col[n - 1] : (() => { let j = 0; while (I > T[j + 1]) j++; return lerpi(I, T[j], T[j + 1], col[j], col[j + 1]); })());
  let v = idiv(tab(BARRA.tVerde) * k, 1000), a = v + idiv(tab(BARRA.tAmarillo) * k, 1000);
  if (primera) { v = idiv(v * BARRA.primera, 1000); a = idiv(a * BARRA.primera, 1000); }
  return { v, a };
}
/** Factor del pesista (milésimas) para el ancho de la barrita `i` (0 tirón, 1 envión, 2 atrapar, 3 pararse). */
function factorBarra(b, i, env) { return i === 0 ? b.tiron : i === 1 ? idiv(b.envion * (BARRA.verdeEnvion[env] || 1000), 1000) : i === 2 ? b.atrapa ?? 1000 : b.pararse ?? 1000; }
/**
 * Zonas de la barrita `i` a la intensidad I para el cuerpo `cuerpo` (cuerpoBarra): `v` y `a`, medio ancho del verde y del
 * amarillo en milésimas de la barrita alrededor del centro (500); `vMs` y `aMs`, lo mismo en ms del puntero de las reglas `R`.
 * El ancho en la barrita es el de Fácil por R.verde y R.amarillo: con un puntero más rápido, el mismo ancho dura menos.
 */
export function zonasBarra(I, cuerpo, i, primera = false, env = 'split', R = BARRA) {
  const b = (cuerpo && cuerpo.barra) || BARRA.neutro, { v: vMs, a: aMs } = anchosMs(I, factorBarra(b, i, env), primera);
  let v = Math.min(BARRA.topeVerde, idiv(vMs * 1000, BARRA.pasada)), a = Math.min(BARRA.topeAmarillo, Math.max(v + 10, idiv(aMs * 1000, BARRA.pasada)));
  if (R.verde !== undefined && R.verde !== 1000) v = idiv(v * R.verde, 1000);
  if (R.amarillo !== undefined && R.amarillo !== 1000) a = Math.max(v + 10, idiv(a * R.amarillo, 1000));
  return { v, a, vMs: idiv(v * R.pasada, 1000), aMs: idiv(a * R.pasada, 1000) };
}
/** Zona de una posición del puntero: 'verde', 'amarillo' o 'rojo'. */
export function zonaBarra(pos, z) { const d = Math.abs(pos - 500); return d <= z.v ? 'verde' : d <= z.a ? 'amarillo' : 'rojo'; }
/** Lo que cuesta de más la zona `zona` de la barrita `i` en las reglas `R`. */
export const costoBarra = (R, i, zona) => (i >= 2 ? R.costoExtra : R.costo)[zona];

/** Φ de la normal en millonésimas, de 0 a 4 desvíos en décimos (se interpola). */
const PHI = [500000, 539828, 579260, 617911, 655422, 691462, 725747, 758036, 788145, 815940, 841345, 864334, 884930, 903199, 919243, 933193, 945201, 955435, 964070, 971284, 977250, 982136, 986097, 989276, 991802, 993790, 995339, 996533, 997445, 998134, 998650, 999032, 999313, 999517, 999663, 999767, 999841, 999892, 999928, 999952, 999968];
/** Φ(x / den) en millonésimas, en enteros. */
export function phi(x, den) {
  const z = idiv(Math.abs(x) * 100, den), k = idiv(z, 10);
  const p = k >= 40 ? 1000000 : PHI[k] + idiv((PHI[k + 1] - PHI[k]) * (z - 10 * k), 10);
  return x < 0 ? 1000000 - p : p;
}
/**
 * Cuántos toques de cada 1000 caen en verde, amarillo y rojo para una persona `perfil` ({sesgo, sd, despiste}, en ms y
 * milésimas) con las zonas `z` (zonasBarra). Enteros que suman 1000.
 */
export function repartoBarra(z, perfil = BARRA.tipico) {
  const { sesgo: s, sd, despiste: d } = perfil, dentro = h => phi(h - s, sd) - phi(-h - s, sd);
  const gv = dentro(z.vMs), ga = dentro(z.aMs);
  const uv = idiv((2 * z.v + 1) * 1000000, 1001), ua = idiv((2 * z.a + 1) * 1000000, 1001);
  const pv = idiv(gv * (1000 - d) + uv * d, 1000000), pva = idiv(ga * (1000 - d) + ua * d, 1000000);
  return { verde: pv, amarillo: Math.max(0, pva - pv), rojo: Math.max(0, 1000 - pva) };
}
/**
 * Chance (milésimas) de que suba un peso en 'b' para la persona `o.perfil` (por defecto la típica del nivel): como chanceUno,
 * con la suerte de cada tramo y la garra, más lo que cuesta cada barrita según dónde suele pegar esa persona. Exacta para ese
 * perfil (programación dinámica sobre la energía, mismas reglas que attempt.js); enteros.
 *   o.garra (false: ya se usó) · o.primera (verde más ancho) · o.zonas (forzar zonas, para pruebas) · o.dif (nivel)
 */
export function chanceBarra(I, lev, env, cuerpo, o = {}) {
  const Rg = reglasB(o.dif), T = TRAMOS[lev], G = T.map(tr => gastoTramo(tr, I, lev, env, cuerpo)), k = cuerpo.ruido || 0, n = 2 * k + 1, perfil = o.perfil || Rg.tipico;
  // reparto de zonas de la barrita de cada tramo (null: el tramo no tiene barrita)
  const R = T.map(tr => { const i = barritaDeTramo(Rg, lev, tr); if (i < 0) return null; const r = repartoBarra(zonasBarra(I, cuerpo, i, !!o.primera, env, Rg), perfil); return [[r.verde, costoBarra(Rg, i, 'verde')], [r.amarillo, costoBarra(Rg, i, 'amarillo')], [r.rojo, costoBarra(Rg, i, 'rojo')]]; });
  const memo = new Map(), E = Rg.esfuerzo, pe = perfil.esfuerzo ?? 1000;
  const f = (i, m, garra) => {
    if (i === G.length) return 1;
    const key = i * 4 + (garra ? 1 : 0) + ':' + m; let v = memo.get(key); if (v !== undefined) return v;
    v = 0; let Z = R[i] || [[1000, 0]];
    // pararse con esfuerzo (intento exigente): lo hace la persona típica `perfil.esfuerzo` de cada 1000 veces. Con barrita de
    // pararse, el esfuerzo se decide con lo que costó esa barrita (cada zona se parte en «lo hace» y «no lo hace»)
    if (T[i] === 'pararse') {
      const Z2 = [];
      for (const [w, ex] of Z) { if (pideEsfuerzo(I, m, G[i] + ex, Rg)) { const si = idiv(w * pe, 1000); Z2.push([si, ex - E.premio], [w - si, ex]); } else Z2.push([w, ex]); }
      Z = Z2;
    }
    for (let j = 0; j < n; j++) {
      const g = conSuerte(G[i], (j - k) * UNO.ruidoPaso);
      for (const [w, extra] of Z) {
        if (!w) continue;
        let x = m - (extra < 0 ? Math.max(0, g + extra) : g + extra), gg = garra;
        if (x < 0) { if (gg && x >= UNO.frenoMin && garraAlcanza(x, G.slice(i + 1))) { x += UNO.garra; gg = false; } else continue; }
        v += w * f(i + 1, x, gg);
      }
    }
    memo.set(key, v); return v;
  };
  // cada tramo reparte 1000 (zonas, esfuerzo o nada): el total es n^tramos · 1000^tramos, y se divide sin perder enteros
  const total = n ** G.length * 1000 ** (G.length - 1);
  return idiv(f(0, UNO.margen - (o.fatiga || 0), o.garra !== false), total);
}

/** Causas con su texto. Las de fallo y las de nulo (secciones 5.2 y 5.3). */
export const CAUSAS = {
  anticipado: 'Tirón anticipado', sin_altura: 'Tirón sin altura', adelante: 'Barra adelante', atras: 'Barra atrás', fondo: 'La pierde en el fondo',
  aplastado: 'Aplastado', codos: 'Ceden los codos', temblor: 'Pierde la barra arriba', devuelve: 'Devuelve la barra',
  codos_blandos: 'Codos blandos', tiembla: 'Llega temblando', antes: 'Suelta antes de la chicharra', sin_apoyo: 'No fija la barra', reloj: 'Se acabó el reloj',
};
