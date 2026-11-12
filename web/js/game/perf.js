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
/** Megapíxeles mínimos: por debajo no se baja más la resolución (se apagan las sombras y ahí queda). */
export const PISO_MP = .3;
/** Tope de megapíxeles del modo automático (2560 × 1440). */
export const TECHO_MP = 3.7;
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
/**
 * Frecuencia (Hz, dos decimales) a partir de intervalos entre cuadros en ms. 60 si no hay datos que sirvan.
 * El período es el grupo de intervalos MÁS CORTO que junta al menos la cuarta parte de la muestra (no la mediana): si al
 * medir se pierden refrescos (la página todavía está cargando), más de la mitad de los intervalos pueden ser dobles y la
 * mediana daría la mitad de la frecuencia; con eso el gobernador nunca vería un refresco perdido.
 */
export function hzDe(intervalos) {
  const d = intervalos.filter(x => x > 1 && x < 100).sort((a, b) => a - b); if (d.length < 4) return 60;
  const minimo = Math.max(3, Math.ceil(d.length * .25));
  for (const x of d) {
    const cerca = d.filter(y => Math.abs(y - x) < x * .06); if (cerca.length < minimo) continue;
    const c = cerca.reduce((a, b) => a + b, 0) / cerca.length, fino = d.filter(y => Math.abs(y - c) < c * .06);
    return Math.round(100000 / (fino.reduce((a, b) => a + b, 0) / fino.length)) / 100;
  }
  const m = mediana(d), cerca = d.filter(x => Math.abs(x - m) < m * .06);
  return Math.round(100000 / (cerca.reduce((a, b) => a + b, 0) / cerca.length)) / 100;
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
export const pasoDe = hz => (hz > 90 ? 2 : 1);
/** Cuadros por segundo que se le piden al juego. */
export const metaDe = hz => hz / pasoDe(hz);

/** Recta costo = fijo + porMP · megapíxeles, por dos medidas {mp, ms}. */
export function ajustar(a, b) {
  const porMP = b.mp - a.mp > 1e-6 ? Math.max(0, (b.ms - a.ms) / (b.mp - a.mp)) : 0, fijo = Math.max(0, a.ms - porMP * a.mp);
  return { fijo, porMP };
}
/** Megapíxeles que entran en `margen` del período con ese modelo de costo (Infinity si el costo no depende de los píxeles). */
export const mpSostenible = (modelo, periodo, margen = MARGEN) => (modelo.porMP > 1e-6 ? Math.max(0, (periodo * margen - modelo.fijo) / modelo.porMP) : (modelo.fijo <= periodo * margen ? Infinity : 0));
/**
 * Refrescos de la pantalla perdidos en un intervalo entre cuadros dibujados (ms). `periodo`: lo que tiene que durar un
 * cuadro (la meta); `refresco`: un refresco de la pantalla. Son iguales salvo en pantallas de más de 90 Hz, donde se
 * dibuja uno de cada dos refrescos: ahí perder uno da un intervalo de 1,5 períodos (25 ms a 120 Hz), que con el umbral de
 * 1,5 períodos se contaba la mitad de las veces.
 */
export const perdidosEn = (ms, periodo, refresco = periodo) => (ms > periodo + refresco * .5 ? Math.round((ms - periodo) / refresco) : 0);
/** Refrescos perdidos en una lista de intervalos entre cuadros (ms): un intervalo de dos períodos es un refresco perdido. */
export function perdidos(intervalos, periodo, refresco = periodo) { let n = 0; for (const x of intervalos) n += perdidosEn(x, periodo, refresco); return n; }

/** Resolución (MP) que tiene que sostener «Media» o «Alta» para elegirla en vez de la calidad de abajo: la de la pantalla o 1080p. */
const MP_1080 = 2.07;
/**
 * La decisión de calidad de antes del primer intento, separada de la escena para poder probarla sola.
 * 1. Mide el costo de un cuadro a dos resoluciones y traza la recta costo = fijo + porMP · MP. De ahí, cuántos megapíxeles
 *    entran en el 85 % del período (`sostiene`).
 * 2. Desde «Baja»: si entra con más del doble de margen prueba «Media», y con margen sobre «Media», «Alta»; se queda con la
 *    más alta que sostenga la resolución de la pantalla (o 1080p si la pantalla es más grande). Si «Baja» no llega a medio
 *    megapíxel, pasa a «Móvil».
 * 3. Aplica esos megapíxeles (nunca más que los de la pantalla) y verifica con cuadros de verdad: si se pierde un refresco,
 *    15 % menos de píxeles y otra vez (un solo refresco perdido se mira dos veces antes de bajar).
 * @param {object} io
 * @param {number} io.periodo  ms por cuadro de la meta
 * @param {number} [io.refresco]  ms de un refresco de la pantalla (menos que el período en pantallas de más de 90 Hz)
 * @param {string} io.clave   calidad de partida
 * @param {() => number} io.techo             megapíxeles del lienzo a la densidad de la pantalla, con la calidad en uso
 * @param {(mp:number) => {mp:number, ms:number}} io.medir  dibuja a esa resolución (aunque pase la de la pantalla) y devuelve los MP reales y el costo
 * @param {(clave:string) => Promise} io.poner  cambia de calidad y deja todo compilado
 * @param {(mp:number) => number} io.fijar     aplica el presupuesto de píxeles del juego y devuelve los MP que quedaron
 * @param {(n:number, calienta:number) => Promise<number[]|null>} io.cuadros  intervalos (ms) de n cuadros de verdad con el pesista moviéndose
 * @returns {Promise<{clave:string, mp:number, p80:number|null, primera:object, elegida:object, pruebas:object[], verificacion:object[]}>}
 */
export async function decidirCalidad(io) {
  const pruebas = [], verificacion = [], r2 = x => Math.round(x * 100) / 100; let clave = io.clave, p80 = null;
  const medir = () => {
    const techo = Math.min(io.techo(), TECHO_MP), a = Math.max(.2, Math.min(.5, techo * .3)), b = Math.max(a * 2, Math.min(techo, 1.6)), m = [io.medir(a), io.medir(b)], mod = ajustar(m[0], m[1]), sost = mpSostenible(mod, io.periodo);
    const r = { calidad: clave, techo: r2(techo), medidas: m.map(x => ({ ...x, mp: r2(x.mp), ms: r2(x.ms) })), fijo: r2(mod.fijo), porMP: r2(mod.porMP), sostiene: Number.isFinite(sost) ? r2(sost) : 99 };
    pruebas.push(r); return r;
  };
  const probar = async c => { await io.poner(c); clave = c; return medir(); }, alcanza = r => r.sostiene >= Math.min(r.techo, MP_1080);
  const primera = medir(); let r = primera;
  if (clave === 'baja') {
    if (r.sostiene >= Math.min(r.techo, MP_1080) * 2.2) {
      const m = await probar('media');
      if (alcanza(m)) { r = m; if (m.sostiene >= Math.min(m.techo, MP_1080) * 1.8) { const al = await probar('alta'); if (alcanza(al)) r = al; else { await io.poner('media'); clave = 'media'; } } }
      else { await io.poner('baja'); clave = 'baja'; }
    } else if (r.sostiene < .5) r = await probar('movil');
  }
  let mp = io.fijar(Math.max(PISO_MP, Math.min(r.techo, r.sostiene))), repetida = false;
  for (let k = 0; k < 5; k++) {
    const d = await io.cuadros(45, 12); if (!d || !d.length) break;
    const dup = perdidos(d, io.periodo, io.refresco || io.periodo), o = d.slice().sort((x, y) => x - y); p80 = Math.round(o[Math.floor(o.length * .8)] * 10) / 10;
    verificacion.push({ mp: r2(mp), cuadros: d.length, perdidos: dup, p50: Math.round(o[o.length >> 1] * 10) / 10, max: Math.round(o[o.length - 1] * 10) / 10 });
    if (!dup) break;
    if (dup === 1 && !repetida) { repetida = true; continue; }      // uno solo puede ser de otra cosa: se mira de nuevo antes de bajar
    if (mp * PASO < PISO_MP) break;
    mp = io.fijar(mp * PASO); repetida = false;
  }
  return { clave, mp, p80, primera, elegida: r, pruebas, verificacion };
}

/** Tiempo limpio (sin perder ningún refresco) antes de subir un escalón hacia la calibración, en ms, y su tope al duplicarse. */
export const SUBIR_MS = 5000, SUBIR_MAX_MS = 120000;
/**
 * Una subida queda a prueba durante PRUEBA_MS de dibujo continuo (no de reloj: detrás de un panel no se dibuja y no se
 * prueba nada): si en ese tramo pierde refrescos, se deshace y la próxima espera el doble. Queda confirmada con
 * CONFIRMA_MS de dibujo continuo sin perder ni un refresco; una subida sin confirmar se deshace antes de un intento propio.
 */
export const PRUEBA_MS = 15000, CONFIRMA_MS = 3000;
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
 * perdidos (perdidosEn) y el tiempo de hilo principal por cuadro. Una ventana es mala si pierde dos refrescos o más, o si
 * el hilo principal solo ya se lleva el 92 % del período.
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
 *   solo mientras esté por debajo de lo que dejó la calibración (nivel > 0). **Nunca sube por encima de la calibración**:
 *   los intervalos llegan en múltiplos del período y «no se perdió nada» no dice cuánto margen queda; a 75 Hz, una subida
 *   que deja el cuadro en el 95 % del período no pierde nada en reposo y pierde en cuanto la escena se mueve. El margen lo
 *   mide la calibración, con el costo de la placa.
 * - Cada subida queda a prueba (PRUEBA_MS de dibujo continuo); si pierde, se deshace y la espera se duplica. Hasta que
 *   junta CONFIRMA_MS limpios no está confirmada, y main.js la deshace antes de un intento propio (sinConfirmar()).
 */
export class Gobernador {
  constructor(hz) {
    this.fijar(hz); this.v = { t: 0, n: 0, dup: 0, cb: 0, d: [] }; this.malas = []; this.hasta = 0; this.pide = false; this.sube = false; this.pasos = 1; this.fps = 0; this.ult = null;
    this.nivel = 0;            // escalones por debajo de lo que dejó la calibración (nunca negativo: no sube por encima)
    this.limpioMs = 0;         // tiempo seguido sin perder refrescos
    this.espera = SUBIR_MS;
    this.ajena = false; this.tAjena = 0; this.ignoradas = 0; this.tope = false; this.piso = false; this.ultimo = null; this.motivo = ''; this._frac = 0; this.historia = [];
  }
  /** Compatibilidad: «quieto» era dejar de bajar porque bajar no servía. */
  get quieto() { return this.ajena; }
  /** Cambia la frecuencia de pantalla con la que se juzga. */
  fijar(hz) { this.hz = hz; this.paso = pasoDe(hz); this.meta = metaDe(hz); this.periodo = 1000 / this.meta; this.refresco = 1000 / hz; }
  _vaciar() { const v = this.v; v.t = v.n = v.dup = v.cb = 0; v.d.length = 0; }
  /** Descarta lo medido hasta dentro de `ms`: después de cargar o de cambiar de calidad los primeros cuadros no cuentan. */
  calentar(now, ms = 2500) { this.hasta = now + ms; this._vaciar(); this.malas = []; this.pide = false; this.sube = false; this.pasos = 1; this.limpioMs = 0; }
  /** Estado para mirar desde la consola (JUEGO.calidad.gobernador). */
  get estado() { const u = this.ultimo; return { nivel: this.nivel, ajena: this.ajena, ignoradas: this.ignoradas, tope: this.tope, piso: this.piso, limpioS: Math.round(this.limpioMs / 100) / 10, esperaS: this.espera / 1000, aPrueba: !!(u && u.sube && !u.deshace && u.dibujo < PRUEBA_MS), sinConfirmar: this.sinConfirmar(), motivo: this.motivo, historia: this.historia.slice(-8) }; }
  /**
   * Escalones de la última subida si todavía no se confirmó (CONFIRMA_MS de dibujo continuo sin perder nada); 0 si no hay
   * nada que deshacer. main.js la deshace antes de un intento propio: una subida que no se probó no se estrena en el
   * levantamiento. No cuenta la que deshace una bajada por carga ajena (esa vuelve a donde estaba).
   */
  sinConfirmar() { const u = this.ultimo; return u && u.sube && !u.deshace && !u.confirmada ? u.pasos : 0; }
  /** main.js deshizo la subida sin confirmar (bajar(sinConfirmar())). No es una subida fallida: la espera no se duplica. */
  subidaDeshecha(now) {
    const n = this.sinConfirmar(); if (!n) return; this.nivel += n;
    this.ultimo = { sube: false, t: now, frac: 0, pasos: n, nivel: this.nivel - n, deshace: true, acum: 0, frac0: 0 };
    this.motivo = 'subida sin confirmar: se deshace antes del intento'; this.historia.push({ t: Math.round(now), sube: false, pasos: n, nivel: this.nivel, motivo: this.motivo }); if (this.historia.length > 40) this.historia.shift();
    this.calentar(now);
  }
  /**
   * @param {number} ms tiempo desde el cuadro dibujado anterior  @param {number} now  @param {number} cb ms de hilo principal de este cuadro
   * @returns {boolean} hay un pedido (bajar o, con `sube`, subir)
   */
  cuadro(ms, now, cb = 0) {
    const v = this.v;
    if (ms > 250 || now < this.hasta) { this._vaciar(); return this.pide; }      // una pausa o un panel no son lentitud
    v.t += ms; v.n++; v.cb += cb; v.d.push(ms); v.dup += perdidosEn(ms, this.periodo, this.refresco);
    if (v.t < 1000) return this.pide;
    const fps = v.n * 1000 / v.t, frac = v.dup / (v.n + v.dup), hilo = v.cb / v.n, med = mediana(v.d), rapidos = v.d.filter(x => x < this.periodo * .93).length;
    this.fps = fps; this.ult = { fps: Math.round(fps * 10) / 10, perdidos: v.dup, cuadros: v.n, hilo: Math.round(hilo * 10) / 10 };
    // casi todos los cuadros llegan antes del período: la pantalla es más rápida de lo que se midió (la ventana cambió de monitor)
    if (med < this.periodo * .9 && rapidos > v.n * .8) { this.fijar(Math.round(100000 * this.paso / med) / 100); this._vaciar(); this.malas = []; return this.pide; }
    const mala = v.dup >= 2 || hilo > this.periodo * .92, limpia = v.dup === 0 && hilo < this.periodo * .8;
    this.malas.push(mala); if (this.malas.length > 4) this.malas.shift();
    this.limpioMs = limpia ? this.limpioMs + v.t : 0;
    // la última subida, a prueba: cuánto dibujo continuo lleva y si ya juntó CONFIRMA_MS limpios seguidos
    const u = this.ultimo;
    if (u && u.sube && !u.deshace) { u.dibujo += v.t; u.limpio = limpia ? u.limpio + v.t : 0; if (u.limpio >= CONFIRMA_MS) u.confirmada = true; }
    if (this.ajena && (now - this.tAjena > AJENA_MS || (limpia && this.limpioMs >= 2900))) { this.ajena = false; this.motivo = now - this.tAjena > AJENA_MS ? 'se vuelve a probar si bajar sirve' : 'la máquina se liberó'; }
    const pasos = frac > .45 ? 3 : frac > .2 ? 2 : 1;
    // ya pidió y todavía no se pudo aplicar (hay un intento en curso): una bajada pendiente crece; una subida pendiente
    // (salvo la que deshace una bajada por carga ajena) se cancela si mientras tanto se pierden refrescos
    if (this.pide) { if (!this.sube) this.pasos = Math.max(this.pasos, pasos); else if (mala && !this._deshace) { this.pide = this.sube = false; this.pasos = 1; this.motivo = 'subida pendiente cancelada: perdió refrescos'; } }
    else if (frac >= .2 || this.malas.filter(Boolean).length >= 2) this._mal(frac, pasos, now);
    else if (!this.ajena && !this.tope && limpia && this.nivel > 0 && this.limpioMs >= this.espera) this._pedir(true, 1, 'la máquina está libre: vuelve hacia la calibración', frac);
    this._vaciar();
    return this.pide;
  }
  _mal(frac, pasos, now) {
    const u = this.ultimo; this.malas = [];
    // una subida que no aguantó (pierde dentro de su prueba, contada en dibujo continuo): se deshace y la próxima espera el doble
    if (u && u.sube && !u.deshace && u.dibujo < PRUEBA_MS) {
      this.espera = Math.min(SUBIR_MAX_MS, this.espera * 2);
      this._pedir(false, u.pasos, 'la subida no aguantó', frac); this._deshace = true; return;
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
  _pedir(sube, pasos, motivo, frac) { this.pide = true; this.sube = sube; this.pasos = pasos; this.motivo = motivo; this._frac = frac; this._deshace = false; this._sigue = false; }
  /**
   * La calibración dejó una resolución nueva (main.js, al terminar calibrar): esa es la referencia del nivel 0. Lo que el
   * gobernador haya hecho antes (en el menú) no cuenta.
   */
  calibrado(now, ms = 1500) { this.nivel = 0; this.ultimo = null; this.tope = this.piso = this.ajena = false; this.espera = SUBIR_MS; this.calentar(now, ms); }
  /**
   * main.js avisa qué pasó con el pedido: `hecho` si cambió algo (false: no había más para bajar o para subir).
   * Empieza el calentamiento: los cuadros de los próximos 2,5 s no cuentan.
   */
  resultado(hecho, now) {
    if (!this.pide) return; const sube = this.sube, pasos = this.pasos;
    if (hecho) {
      const nivel = this.nivel; this.nivel = Math.max(0, this.nivel + (sube ? -pasos : pasos));
      // racha de bajadas: `acum` escalones desde la primera, que perdía `frac0`
      const u = this.ultimo, sigue = !sube && this._sigue && u && !u.sube;
      this.ultimo = { sube, t: now, frac: this._frac, pasos, nivel, deshace: !!this._deshace, acum: sigue ? u.acum + pasos : pasos, frac0: sigue ? u.frac0 : this._frac, dibujo: 0, limpio: 0, confirmada: false };
      if (sube) this.piso = false; else this.tope = false;
      this.historia.push({ t: Math.round(now), sube, pasos, nivel: this.nivel, motivo: this.motivo }); if (this.historia.length > 40) this.historia.shift();
    } else if (sube) this.tope = true;            // ya está a la resolución de la pantalla y con sombras
    else this.piso = true;                        // ya está en el piso de resolución y sin sombras
    this.calentar(now);
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
