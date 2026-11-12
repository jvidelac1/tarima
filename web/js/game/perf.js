// Calidad y medición de cuadros del juego (docs/JUEGO.md, sección 8.7). El juego prioriza cuadros sobre efectos.
// - La frecuencia de la pantalla se mide y se usa tal cual (no se ajusta a una lista): 75 Hz son 13,3 ms por cuadro.
// - La calidad se decide antes del primer intento (main.js, calibrar): cuánto cuesta un cuadro con el pesista moviéndose,
//   a dos resoluciones, y de ahí cuántos megapíxeles entran en el 85 % del período de la pantalla.
// - Dentro de la partida no se recompila nada: bajar un escalón es dibujar menos píxeles y, al final, apagar las sombras
//   (sus programas quedan compilados desde la carga). Nunca cambia con un intento en curso.
// - El gobernador no baja por carga ajena: si bajar no cambia lo que se pierde, deshace esa bajada y espera; cuando la
//   máquina está libre un rato, vuelve a subir de a un escalón.
import { QUALITY } from '../config.js';

/** Debajo de «baja»: pensado para un teléfono. Valores iniciales sin medir en un teléfono real. */
/**
 * Escena barata por píxel (stage.js, setBarato): piso con la luz horneada, sin haces (en el camino directo no se veían) y
 * los tres contraluces como término del material del pesista y la barra. Solo con el camino directo.
 */
export const BARATO = Object.freeze({ piso: true, haces: 'no', bordes: 'material' });
export const MOVIL = { label: 'Móvil', dpr: 1.5, maxPixels: 1280 * 720, msaa: 2, shadow: 512, shadowR: 4.5, shadow2: 0, ao: 0, aoScale: .5, dof: 0, dofSamples: 0, bloom: false, smaa: false, crowd: .3, beams: false, aniso: 2, tex: 1024, directo: true, barato: BARATO };
/**
 * Calidades del juego: las del visor (config.js, que no se toca) con estas diferencias.
 * - «Baja» y «Móvil» van por el camino directo (stage.js): una sola pasada al lienzo con el MSAA del lienzo y el tono y el
 *   color dentro de los materiales. Es lo que más bajó el costo fijo en el banco del usuario (de 9,3 a 4,3 ms en la M1 Pro).
 *   `msaa` queda para la variante «con post» del banco (la Baja de antes).
 * - En «Baja» la sombra va en un mapa de 512 con la misma penumbra en centímetros (lighting.js la pasa a texeles), y en
 *   todas solo proyectan sombra el pesista y la barra (stage.js).
 * - El juego nunca usa el desenfoque de movimiento de la barra (no reserva sus destinos).
 */
export const PRESET = { movil: MOVIL, baja: { ...QUALITY.baja, shadow: 512, directo: true, barato: BARATO }, media: { ...QUALITY.media, mblur: 0 }, alta: { ...QUALITY.alta, mblur: 0 } };
/** Fracción del período de la pantalla que puede costar un cuadro: el resto es margen para no perder un refresco. */
export const MARGEN = .85;
/** Cada escalón que baja el gobernador deja esta fracción de los píxeles. */
export const PASO = .85;
/** Megapíxeles mínimos absolutos: por debajo no se baja nunca la resolución. */
export const PISO_MP = .3;
/**
 * Piso de resolución en una computadora: esta fracción de los megapíxeles de la pantalla (hasta TECHO_MP). El dueño prefiere
 * buena imagen: ni la calibración ni el gobernador bajan de acá, salvo que se pierdan muchos cuadros de forma sostenida
 * (Gobernador.urgente). Con 0,7 en la ventana de la Mac del dueño (1745 × 845 a densidad 1,1: 1,78 MP) son 1,25 MP.
 */
export const PISO_ESCRITORIO = .7;
/** Piso en un teléfono o tableta: la pantalla a densidad 1 (por debajo, la imagen queda borrosa). */
export const PISO_TELEFONO = 1;
/** Ventanas de un segundo seguidas que pierden URGENTE_FRAC de los refrescos o más para bajar del piso. */
export const URGENTE_VENTANAS = 5, URGENTE_FRAC = .1;
/** Tope de megapíxeles del modo automático (2560 × 1440). */
export const TECHO_MP = 3.7;
/**
 * Piso de resolución (MP) para la calibración y el gobernador.
 * @param {{telefono?:boolean, techo:number, cssMP?:number}} o  `techo`: MP de la pantalla a la densidad en uso;
 *   `cssMP`: MP de la pantalla en píxeles CSS (densidad 1)
 */
export function pisoDe({ telefono = false, techo, cssMP = 0 }) {
  const t = Math.min(techo, TECHO_MP);
  return Math.min(t, Math.max(PISO_MP, telefono ? cssMP * PISO_TELEFONO : t * PISO_ESCRITORIO));
}
/**
 * Aplica `pasos` escalones a la calidad en uso, sin compilar nada (main.js, bajar y subir).
 * - Bajar: 15 % menos de píxeles por escalón hasta el piso (el último escalón deja justo el piso); en el piso apaga las
 *   sombras; por debajo del piso solo con `urgente` (se pierden muchos cuadros seguidos), hasta PISO_MP.
 * - Subir: si está debajo del piso, primero vuelve al piso; después las sombras, y después 15 % más de píxeles por
 *   escalón hasta `tope`.
 * @param {{mp:number, sombras:boolean}} q
 * @param {{sube?:boolean, pasos?:number, piso?:number, tope?:number, urgente?:boolean}} o
 * @returns {{mp:number, sombras:boolean, hecho:boolean}}
 */
export function escalones(q, { sube = false, pasos = 1, piso = PISO_MP, tope = TECHO_MP, urgente = false } = {}) {
  let { mp, sombras } = q, hecho = false; piso = Math.max(PISO_MP, piso);
  if (!(mp > 0)) return { mp, sombras, hecho };
  for (let k = 0; k < pasos; k++) {
    if (sube) {
      if (mp < piso * .99) { mp = Math.min(piso, mp / PASO); hecho = true; continue; }      // debajo del piso vuelve primero la resolución
      if (!sombras) { sombras = true; hecho = true; continue; }
      if (mp >= tope * .985) break;
      mp = Math.min(tope, mp / PASO); hecho = true; continue;
    }
    if (mp > piso * 1.01) { mp = Math.max(piso, mp * PASO); hecho = true; continue; }
    if (sombras) { if (hecho && !urgente) break; sombras = false; hecho = true; if (!urgente) break; continue; }
    if (urgente && mp * PASO >= PISO_MP) { mp *= PASO; hecho = true; continue; }
    break;
  }
  return { mp, sombras, hecho };
}
export const nombreDe = (Q, mp, sombras = true) => `${Q.label} ${mp.toFixed(2).replace('.', ',')} MP${sombras ? '' : ' sin sombras'}`;
/**
 * Calidad de arranque. Con `?q=alta|media|baja|movil` queda fija (sin calibración ni gobernador); sin el parámetro es
 * automática: arranca en «Baja» («Móvil» con puntero grueso) y la calibración decide calidad y resolución.
 * @returns {{auto:boolean, clave:string, Q:object}}
 */
export function calidadInicial(pedida, grueso = false) {
  if (PRESET[pedida]) return { auto: false, clave: pedida, Q: PRESET[pedida] };
  const clave = grueso ? 'movil' : 'baja';
  return { auto: true, clave, Q: PRESET[clave] };
}

const mediana = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
/** Frecuencia (Hz, dos decimales) a partir de intervalos entre cuadros en ms. 60 si no hay datos que sirvan. */
export function hzDe(intervalos) {
  const d = intervalos.filter(x => x > 1 && x < 100); if (d.length < 4) return 60;
  const m = mediana(d), cerca = d.filter(x => Math.abs(x - m) < m * .06), p = cerca.reduce((a, b) => a + b, 0) / cerca.length;
  return Math.round(100000 / p) / 100;
}
/**
 * Refresco de la pantalla (Hz), medido: mediana de los intervalos de requestAnimationFrame sin dibujar nada, afinada con
 * el promedio de los intervalos que caen a menos del 6 % de esa mediana. No se ajusta a ninguna lista de frecuencias.
 * Devuelve `sinMedir` (60) si el navegador no da cuadros (pestaña oculta).
 * @returns {Promise<number>}
 */
export function medirRefresco(n = 40, sinMedir = 60) {
  return new Promise(res => {
    const ts = []; let listo = false; const fin = hz => { if (!listo) { listo = true; res(hz); } };
    setTimeout(() => fin(sinMedir), 2000);
    const f = t => { if (listo) return; ts.push(t); if (ts.length <= n) { requestAnimationFrame(f); return; } fin(hzDe(ts.slice(1).map((x, i) => x - ts[i]))); };
    requestAnimationFrame(f);
  });
}
/**
 * Cada cuántos refrescos dibuja el juego: en todos, o en uno de cada dos en pantallas de más de 90 Hz (120 o 144 Hz dan 60
 * o 72 cuadros parejos; dibujar «lo que salga» a 120 alterna cuadros de 8 y de 17 ms).
 */
export const pasoDe = (hz, minimo = 1) => Math.max(minimo, hz > 90 ? 2 : 1);
/** Cuadros por segundo que se le piden al juego. `minimo`: 2 para dibujar a media frecuencia (teléfono flojo: 30 parejos). */
export const metaDe = (hz, minimo = 1) => hz / pasoDe(hz, minimo);

/** Recta costo = fijo + porMP · megapíxeles, por dos medidas {mp, ms}. */
export function ajustar(a, b) {
  const porMP = b.mp - a.mp > 1e-6 ? Math.max(0, (b.ms - a.ms) / (b.mp - a.mp)) : 0, fijo = Math.max(0, a.ms - porMP * a.mp);
  return { fijo, porMP };
}
/** Megapíxeles que entran en `margen` del período con ese modelo de costo (Infinity si el costo no depende de los píxeles). */
export const mpSostenible = (modelo, periodo, margen = MARGEN) => (modelo.porMP > 1e-6 ? Math.max(0, (periodo * margen - modelo.fijo) / modelo.porMP) : (modelo.fijo <= periodo * margen ? Infinity : 0));
/** Refrescos perdidos en una lista de intervalos entre cuadros (ms): un intervalo de dos períodos es un refresco perdido. */
export function perdidos(intervalos, periodo) { let n = 0; for (const x of intervalos) if (x > periodo * 1.5) n += Math.round(x / periodo) - 1; return n; }

/** Resolución (MP) que tiene que sostener «Media» o «Alta» para elegirla en vez de la calidad de abajo: la de la pantalla o 1080p. */
const MP_1080 = 2.07;
/**
 * La decisión de calidad de antes del primer intento, separada de la escena para poder probarla sola. Prefiere buena
 * imagen (decisión del dueño): la medición de la carga es corta y ruidosa, así que nunca baja de un piso alto por ella.
 * 1. Mide el costo de un cuadro a dos resoluciones y traza la recta costo = fijo + porMP · MP. De ahí, cuántos megapíxeles
 *    entran en el 85 % del período (`sostiene`).
 * 2. Computadora (`telefono` falso): desde «Baja», si entra con más del doble de margen prueba «Media», y con margen sobre
 *    «Media», «Alta»; se queda con la más alta que sostenga la resolución de la pantalla (o 1080p si es más grande). NUNCA
 *    pasa a «Móvil», y la resolución no baja del piso (PISO_ESCRITORIO de la pantalla) aunque la medida diga menos: si de
 *    verdad no da, lo corrige el gobernador después de varios segundos seguidos perdiendo cuadros.
 * 3. Teléfono o tableta (`telefono`): desde «Móvil», si sobra margen prueba «Baja» (no más: «Media» lleva pases de pantalla
 *    que un teléfono caliente no sostiene). Si ni así entra la pantalla a densidad 1 (el piso), y hay `mitad`, pasa a
 *    dibujar a media frecuencia (30 cuadros parejos a 60 Hz, 45 a 90 Hz) y vuelve a decidir: 30 parejos con buena imagen
 *    antes que 60 a los tirones o borrosos. A más de 65 Hz también pasa a la mitad si a la frecuencia entera no entra la
 *    resolución de la pantalla.
 * 4. Aplica esos megapíxeles (nunca más que los de la pantalla) y verifica con cuadros de verdad: si se pierde un refresco,
 *    15 % menos de píxeles y otra vez (un solo refresco perdido se mira dos veces antes de bajar), sin bajar del piso.
 * @param {object} io
 * @param {number} io.periodo  ms por cuadro de la meta
 * @param {string} io.clave    calidad de partida
 * @param {boolean} [io.telefono]  puntero grueso (teléfono o tableta); falso: computadora
 * @param {number} [io.cssMP]  megapíxeles del lienzo en píxeles CSS (densidad 1): el piso del teléfono
 * @param {() => number} io.techo             megapíxeles del lienzo a la densidad de la pantalla, con la calidad en uso
 * @param {(mp:number) => {mp:number, ms:number}} io.medir  dibuja a esa resolución (aunque pase la de la pantalla) y devuelve los MP reales y el costo
 * @param {(clave:string) => Promise} io.poner  cambia de calidad y deja todo compilado
 * @param {(mp:number) => number} io.fijar     aplica el presupuesto de píxeles del juego y devuelve los MP que quedaron
 * @param {(n:number, calienta:number) => Promise<number[]|null>} io.cuadros  intervalos (ms) de n cuadros de verdad con el pesista moviéndose
 * @param {() => (number|Promise<number>)} [io.mitad]  pasa a dibujar en uno de cada dos refrescos y devuelve el período nuevo (ms)
 * @returns {Promise<{clave:string, mp:number, piso:number, mitad:boolean, periodo:number, p80:number|null, primera:object, elegida:object, pruebas:object[], verificacion:object[]}>}
 */
export async function decidirCalidad(io) {
  const pruebas = [], verificacion = [], r2 = x => Math.round(x * 100) / 100, tel = !!io.telefono; let clave = io.clave, p80 = null, periodo = io.periodo, mitad = false;
  const medir = () => {
    const techo = Math.min(io.techo(), TECHO_MP), a = Math.max(.2, Math.min(.5, techo * .3)), b = Math.max(a * 2, Math.min(techo, 1.6)), m = [io.medir(a), io.medir(b)], mod = ajustar(m[0], m[1]), sost = mpSostenible(mod, periodo);
    const r = { calidad: clave, periodo: r2(periodo), techo: r2(techo), medidas: m.map(x => ({ ...x, mp: r2(x.mp), ms: r2(x.ms) })), fijo: r2(mod.fijo), porMP: r2(mod.porMP), sostiene: Number.isFinite(sost) ? r2(sost) : 99, modelo: mod };
    pruebas.push(r); return r;
  };
  // con la misma recta, a otro período (no hace falta volver a dibujar)
  const aPeriodo = r => { const sost = mpSostenible(r.modelo, periodo), x = { ...r, periodo: r2(periodo), sostiene: Number.isFinite(sost) ? r2(sost) : 99 }; pruebas.push(x); return x; };
  const probar = async c => { await io.poner(c); clave = c; return medir(); }, meta = r => Math.min(r.techo, MP_1080), alcanza = r => r.sostiene >= meta(r);
  const primera = medir(); let r = primera;
  const subirTel = async () => { if (clave === 'movil' && r.sostiene >= meta(r) * 1.6) { const b = await probar('baja'); if (alcanza(b)) r = b; else { await io.poner('movil'); clave = 'movil'; } } };
  if (!tel && clave === 'baja') {
    if (r.sostiene >= meta(r) * 2.2) {
      const m = await probar('media');
      if (alcanza(m)) { r = m; if (m.sostiene >= meta(m) * 1.8) { const al = await probar('alta'); if (alcanza(al)) r = al; else { await io.poner('media'); clave = 'media'; } } }
      else { await io.poner('baja'); clave = 'baja'; }
    }
  } else if (tel) {
    if (clave === 'baja' && r.sostiene < .5) r = await probar('movil');
    await subirTel();
  }
  const piso = () => pisoDe({ telefono: tel, techo: r.techo, cssMP: io.cssMP || 0 });
  if (tel && io.mitad && periodo < 25 && (r.sostiene < piso() || (1000 / periodo > 65 && r.sostiene < r.techo * .8))) {
    periodo = await io.mitad(); mitad = true; r = aPeriodo(r); await subirTel();
  }
  const P = piso();
  let mp = io.fijar(Math.max(P, Math.min(r.techo, r.sostiene))), repetida = false;
  for (let k = 0; k < 5; k++) {
    const d = await io.cuadros(45, 12); if (!d || !d.length) break;
    const dup = perdidos(d, periodo), o = d.slice().sort((x, y) => x - y); p80 = Math.round(o[Math.floor(o.length * .8)] * 10) / 10;
    verificacion.push({ mp: r2(mp), cuadros: d.length, perdidos: dup, p50: Math.round(o[o.length >> 1] * 10) / 10, max: Math.round(o[o.length - 1] * 10) / 10 });
    if (!dup) break;
    if (dup === 1 && !repetida) { repetida = true; continue; }      // uno solo puede ser de otra cosa: se mira de nuevo antes de bajar
    if (mp <= P * 1.01) break;                                         // en el piso: lo que siga lo decide el gobernador
    mp = io.fijar(Math.max(P, mp * PASO)); repetida = false;
  }
  const limpia = x => { const { modelo, ...resto } = x; return resto; };
  return { clave, mp, piso: P, mitad, periodo, p80, primera: limpia(primera), elegida: limpia(r), pruebas: pruebas.map(limpia), verificacion };
}

/** Tiempo limpio (sin perder ningún refresco) antes de subir un escalón, en ms: hasta lo que dejó la calibración, y por encima. */
export const SUBIR_MS = 5000, SUBIR_ARRIBA_MS = 20000, SUBIR_MAX_MS = 120000;
/** Cuánto dura la sospecha de carga ajena (ms): pasado eso, se vuelve a probar si bajar sirve. */
export const AJENA_MS = 60000;
/**
 * Escalones que tiene que bajar una racha antes de concluir que el problema es ajeno (0,85³: 39 % menos de píxeles). Con
 * uno solo no alcanza: si el costo propio necesita dos escalones y se pierde poco (se pide un escalón por vez), bajar uno
 * no cambia lo que se pierde y el gobernador lo tomaba por carga ajena para siempre (bajaba y deshacía cada 65 s).
 */
export const ESCALAR = 3;
/**
 * Gobernador. La meta es no perder ningún refresco: mira los cuadros dibujados en ventanas de 1 s y cuenta los refrescos
 * perdidos (intervalos de dos períodos o más) y el tiempo de hilo principal por cuadro. Una ventana es mala si pierde dos
 * refrescos o más, o si el hilo principal solo ya se lleva el 92 % del período.
 * Solo pide (`pide`, con `sube` y `pasos`); main.js aplica el pedido cuando no hay un intento en curso y avisa con
 * resultado(hecho, now).
 * - Baja con dos ventanas malas entre las últimas cuatro, o con una sola que pierda la quinta parte de los refrescos
 *   (1 a 3 escalones según cuánto se pierde).
 * - Carga ajena: si después de bajar se pierde casi lo mismo (más de dos tercios de lo de antes), baja otro escalón hasta
 *   que la racha sume ESCALAR; si con eso tampoco cambia, los píxeles no eran el problema (otra app o el compositor ocupan
 *   la placa): pide deshacer la racha entera y no baja más mientras siga así (`ajena`, hasta AJENA_MS o hasta tres
 *   ventanas limpias seguidas).
 * - Una subida pendiente (esperando que termine un intento) se cancela si mientras tanto se pierden refrescos.
 * - Sube de a un escalón después de SUBIR_MS sin perder un solo refresco (y con el hilo principal por debajo del 80 %),
 *   mientras esté por debajo de lo que dejó la calibración; por encima, después de SUBIR_ARRIBA_MS. Si una subida pierde
 *   refrescos en los 15 s siguientes, se deshace y la espera para volver a probar se duplica (hasta SUBIR_MAX_MS).
 * El costo de la placa no se ve desde acá (los intervalos llegan en múltiplos del período): el margen del 85 % sobre el
 * costo del cuadro lo pone la calibración, que lo mide antes de jugar.
 */
export class Gobernador {
  constructor(hz, pasoMin = 1) {
    this.pasoMin = pasoMin; this.fijar(hz); this.v = { t: 0, n: 0, dup: 0, cb: 0, d: [] }; this.malas = []; this.hasta = 0; this.pide = false; this.sube = false; this.pasos = 1; this.fps = 0; this.ult = null;
    this.nivel = 0;            // escalones por debajo de lo que dejó la calibración (negativo: por encima)
    this.limpioMs = 0;         // tiempo seguido sin perder refrescos
    this.espera = SUBIR_MS; this.esperaArriba = SUBIR_ARRIBA_MS;
    this.ajena = false; this.tAjena = 0; this.ignoradas = 0; this.tope = false; this.piso = false; this.ultimo = null; this.motivo = ''; this._frac = 0; this.historia = [];
    this.seguidas = 0;         // ventanas seguidas que pierden URGENTE_FRAC o más desde el último cambio
    this.pisoDuro = false;     // ya bajó del piso hasta PISO_MP: no hay nada más para bajar
    this._urgente = false;
  }
  /** El pedido en curso es bajar por debajo del piso (main.js lo pasa a escalones como `urgente`). */
  get urgente() { return this.pide && !this.sube && this._urgente; }
  /** Compatibilidad: «quieto» era dejar de bajar porque bajar no servía. */
  get quieto() { return this.ajena; }
  /** Cambia la frecuencia de pantalla con la que se juzga. */
  fijar(hz, pasoMin = this.pasoMin || 1) { this.pasoMin = pasoMin; this.hz = hz; this.paso = pasoDe(hz, pasoMin); this.meta = metaDe(hz, pasoMin); this.periodo = 1000 / this.meta; }
  _vaciar() { const v = this.v; v.t = v.n = v.dup = v.cb = 0; v.d.length = 0; }
  /** Descarta lo medido hasta dentro de `ms`: después de cargar o de cambiar de calidad los primeros cuadros no cuentan. */
  calentar(now, ms = 2500) { this.hasta = now + ms; this._vaciar(); this.malas = []; this.pide = false; this.sube = false; this.pasos = 1; this.limpioMs = 0; }
  /** Estado para mirar desde la consola (JUEGO.calidad.gobernador). */
  get estado() { return { nivel: this.nivel, seguidas: this.seguidas, pisoDuro: this.pisoDuro, pasoMin: this.pasoMin, ajena: this.ajena, ignoradas: this.ignoradas, tope: this.tope, piso: this.piso, limpioS: Math.round(this.limpioMs / 100) / 10, esperaS: this.espera / 1000, esperaArribaS: this.esperaArriba / 1000, motivo: this.motivo, historia: this.historia.slice(-8) }; }
  /**
   * @param {number} ms tiempo desde el cuadro dibujado anterior  @param {number} now  @param {number} cb ms de hilo principal de este cuadro
   * @returns {boolean} hay un pedido (bajar o, con `sube`, subir)
   */
  cuadro(ms, now, cb = 0) {
    const v = this.v;
    if (ms > 250 || now < this.hasta) { this._vaciar(); return this.pide; }      // una pausa o un panel no son lentitud
    v.t += ms; v.n++; v.cb += cb; v.d.push(ms); if (ms > this.periodo * 1.5) v.dup += Math.round(ms / this.periodo) - 1;
    if (v.t < 1000) return this.pide;
    const fps = v.n * 1000 / v.t, frac = v.dup / (v.n + v.dup), hilo = v.cb / v.n, med = mediana(v.d), rapidos = v.d.filter(x => x < this.periodo * .93).length;
    this.fps = fps; this.ult = { fps: Math.round(fps * 10) / 10, perdidos: v.dup, cuadros: v.n, hilo: Math.round(hilo * 10) / 10 };
    // casi todos los cuadros llegan antes del período: la pantalla es más rápida de lo que se midió (la ventana cambió de monitor)
    if (med < this.periodo * .9 && rapidos > v.n * .8) { this.fijar(Math.round(100000 * this.paso / med) / 100); this._vaciar(); this.malas = []; return this.pide; }
    const mala = v.dup >= 2 || hilo > this.periodo * .92, limpia = v.dup === 0 && hilo < this.periodo * .8;
    this.malas.push(mala); if (this.malas.length > 4) this.malas.shift();
    this.seguidas = frac >= URGENTE_FRAC ? this.seguidas + 1 : 0;
    this.limpioMs = limpia ? this.limpioMs + v.t : 0;
    if (this.ajena && (now - this.tAjena > AJENA_MS || (limpia && this.limpioMs >= 2900))) { this.ajena = false; this.motivo = now - this.tAjena > AJENA_MS ? 'se vuelve a probar si bajar sirve' : 'la máquina se liberó'; }
    const pasos = frac > .45 ? 3 : frac > .2 ? 2 : 1;
    // ya pidió y todavía no se pudo aplicar (hay un intento en curso): una bajada pendiente crece; una subida pendiente
    // (salvo la que deshace una bajada por carga ajena) se cancela si mientras tanto se pierden refrescos
    if (this.pide) { if (!this.sube) this.pasos = Math.max(this.pasos, pasos); else if (mala && !this._deshace) { this.pide = this.sube = false; this.pasos = 1; this.motivo = 'subida pendiente cancelada: perdió refrescos'; } }
    else if (frac >= .2 || this.malas.filter(Boolean).length >= 2) this._mal(frac, pasos, now);
    else if (!this.ajena && !this.tope && limpia && this.limpioMs >= (this.nivel > 0 ? this.espera : this.esperaArriba)) this._pedir(true, 1, this.nivel > 0 ? 'la máquina está libre: vuelve hacia la calibración' : 'la máquina está libre: prueba un escalón más', frac);
    this._vaciar();
    return this.pide;
  }
  _mal(frac, pasos, now) {
    const u = this.ultimo; this.malas = [];
    // una subida que no aguantó: se deshace y la próxima prueba espera el doble
    if (u && u.sube && !u.deshace && now - u.t < 15000) {
      if (u.nivel > 0) this.espera = Math.min(SUBIR_MAX_MS, this.espera * 2); else this.esperaArriba = Math.min(SUBIR_MAX_MS, this.esperaArriba * 2);
      this._pedir(false, 1, 'la subida no aguantó', frac); this._deshace = true; return;
    }
    // en el piso de resolución: solo se baja de ahí perdiendo muchos cuadros de forma sostenida (URGENTE_VENTANAS seguidas);
    // si la bajada anterior por debajo del piso no cambió lo que se pierde, es carga ajena y se deshace
    if (this.piso && !this.ajena && !this.pisoDuro && this.seguidas >= URGENTE_VENTANAS) {
      if (u && !u.sube && u.urgente && !u.deshace && now - u.t < AJENA_MS && frac > u.frac * .67) { this.ajena = true; this.tAjena = now; this._pedir(true, u.pasos, 'carga ajena: bajar del piso no cambió lo que se pierde', frac); this._deshace = true; return; }
      this._pedir(false, 1, 'pierde muchos cuadros seguidos: baja del piso', frac); this._urgente = true; return;
    }
    if (this.ajena || this.piso) { this.ignoradas++; return; }
    // bajar no cambió lo que se pierde: no es el costo del juego. Se deshace esa bajada y no se baja más por ahora.
    // Antes de concluirlo, la racha de bajadas llega a ESCALAR escalones (un escalón solo puede no alcanzar al costo
    // propio), y se deshace la racha entera.
    if (u && !u.sube && !u.deshace && now - u.t < AJENA_MS && frac > u.frac0 * .67) {
      if (u.acum < ESCALAR) { this._pedir(false, Math.min(pasos, ESCALAR - u.acum), 'bajar no alcanzó: baja otro escalón', frac); this._sigue = true; return; }
      this.ajena = true; this.tAjena = now; this._pedir(true, u.acum, 'carga ajena: bajar no cambió lo que se pierde', frac); this._deshace = true; return;
    }
    this._pedir(false, pasos, 'pierde refrescos', frac);
  }
  _pedir(sube, pasos, motivo, frac) { this.pide = true; this.sube = sube; this.pasos = pasos; this.motivo = motivo; this._frac = frac; this._deshace = false; this._sigue = false; this._urgente = false; }
  /**
   * La calibración dejó una resolución nueva (main.js, al terminar calibrar): esa es la referencia del nivel 0. Lo que el
   * gobernador haya hecho antes (en el menú) no cuenta.
   */
  calibrado(now, ms = 1500) { this.nivel = 0; this.ultimo = null; this.tope = this.piso = this.ajena = this.pisoDuro = false; this.seguidas = 0; this.espera = SUBIR_MS; this.esperaArriba = SUBIR_ARRIBA_MS; this.calentar(now, ms); }
  /**
   * main.js avisa qué pasó con el pedido: `hecho` si cambió algo (false: no había más para bajar o para subir).
   * Empieza el calentamiento: los cuadros de los próximos 2,5 s no cuentan.
   */
  resultado(hecho, now) {
    if (!this.pide) return; const sube = this.sube, pasos = this.pasos;
    if (hecho) {
      const nivel = this.nivel; this.nivel += sube ? -pasos : pasos;
      // racha de bajadas: `acum` escalones desde la primera, que perdía `frac0`
      const u = this.ultimo, sigue = !sube && this._sigue && u && !u.sube;
      this.ultimo = { sube, t: now, frac: this._frac, pasos, nivel, deshace: !!this._deshace, urgente: this._urgente, acum: sigue ? u.acum + pasos : pasos, frac0: sigue ? u.frac0 : this._frac };
      if (sube) this.piso = this.pisoDuro = false; else this.tope = false;
      this.seguidas = 0;
      this.historia.push({ t: Math.round(now), sube, pasos, nivel: this.nivel, motivo: this.motivo }); if (this.historia.length > 40) this.historia.shift();
    } else if (sube) this.tope = true;            // ya está a la resolución de la pantalla y con sombras
    else { if (this._urgente) this.pisoDuro = true; this.piso = true; }      // ya está en el piso de resolución y sin sombras
    this._urgente = false; this.calentar(now);
  }
}

/**
 * Registrador: cuadros por segundo por tramo de la partida, lo del último segundo (ofrecidos por el navegador y dibujados)
 * y los últimos cuadros largos (los que perdieron un refresco), con el tramo y la fase en que cayeron.
 */
export class Registrador {
  constructor() { this.tramos = {}; this.tramo = 'inicio'; this.periodo = 1000 / 60; this.largos = []; this.v = { t0: 0, of: 0, dib: 0, suma: 0, max: 0 }; this.ult = { ofrecidos: 0, dibujados: 0, ms: 0, max: 0 }; }
  marcar(nombre) { this.tramo = nombre; }
  /** Un cuadro de requestAnimationFrame (se haya dibujado o no). `now`: performance.now(). */
  ofrecido(now) {
    const v = this.v; if (!v.t0) v.t0 = now; v.of++; if (now - v.t0 < 1000) return;
    const seg = (now - v.t0) / 1000; this.ult = { ofrecidos: Math.round(v.of / seg), dibujados: Math.round(v.dib / seg), ms: v.dib ? v.suma / v.dib : 0, max: v.max };
    v.t0 = now; v.of = v.dib = v.suma = v.max = 0;
  }
  /** dt de un cuadro dibujado, en ms. `seguido`: el cuadro anterior también se dibujó (si no, el intervalo no dice nada). */
  cuadro(ms, seguido = false, nota = '') {
    if (ms <= 0 || ms > 1000) return; const v = this.v; v.dib++; v.suma += ms; if (ms > v.max) v.max = ms;
    (this.tramos[this.tramo] ||= []).push(ms); if (this.tramos[this.tramo].length > 20000) this.tramos[this.tramo].splice(0, 10000);
    if (seguido && ms > this.periodo * 1.5) { this.largos.push({ t: Math.round(performance.now()), ms: Math.round(ms * 10) / 10, tramo: this.tramo, nota }); if (this.largos.length > 200) this.largos.shift(); }
  }
  /** Por tramo: cuadros, mediana y mínimo de cuadros por segundo. */
  resumen() { const o = {}; for (const [k, v] of Object.entries(this.tramos)) { const s = v.slice().sort((a, b) => a - b); o[k] = { n: s.length, mediana: Math.round(1000 / s[s.length >> 1]), minimo: Math.round(1000 / s[s.length - 1]) }; } return o; }
}
