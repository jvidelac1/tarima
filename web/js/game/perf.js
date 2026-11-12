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
 * Escena barata por píxel (stage.js, setBarato): piso con la luz horneada, haces de una cara y cortos en colores de
 * pantalla, y los tres contraluces como término del material del pesista y la barra. Solo con el camino directo.
 */
export const BARATO = Object.freeze({ piso: true, haces: true, bordes: 'material' });
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
/** Refrescos perdidos en una lista de intervalos entre cuadros (ms): un intervalo de dos períodos es un refresco perdido. */
export function perdidos(intervalos, periodo) { let n = 0; for (const x of intervalos) if (x > periodo * 1.5) n += Math.round(x / periodo) - 1; return n; }

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
 * @param {string} io.clave    calidad de partida
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
    const dup = perdidos(d, io.periodo), o = d.slice().sort((x, y) => x - y); p80 = Math.round(o[Math.floor(o.length * .8)] * 10) / 10;
    verificacion.push({ mp: r2(mp), cuadros: d.length, perdidos: dup, p50: Math.round(o[o.length >> 1] * 10) / 10, max: Math.round(o[o.length - 1] * 10) / 10 });
    if (!dup) break;
    if (dup === 1 && !repetida) { repetida = true; continue; }      // uno solo puede ser de otra cosa: se mira de nuevo antes de bajar
    if (mp * PASO < PISO_MP) break;
    mp = io.fijar(mp * PASO); repetida = false;
  }
  return { clave, mp, p80, primera, elegida: r, pruebas, verificacion };
}

/** Tiempo limpio (sin perder ningún refresco) antes de subir un escalón, en ms: hasta lo que dejó la calibración, y por encima. */
export const SUBIR_MS = 5000, SUBIR_ARRIBA_MS = 20000, SUBIR_MAX_MS = 120000;
/** Cuánto dura la sospecha de carga ajena (ms): pasado eso, se vuelve a probar si bajar sirve. */
export const AJENA_MS = 60000;
/**
 * Gobernador. La meta es no perder ningún refresco: mira los cuadros dibujados en ventanas de 1 s y cuenta los refrescos
 * perdidos (intervalos de dos períodos o más) y el tiempo de hilo principal por cuadro. Una ventana es mala si pierde dos
 * refrescos o más, o si el hilo principal solo ya se lleva el 92 % del período.
 * Solo pide (`pide`, con `sube` y `pasos`); main.js aplica el pedido cuando no hay un intento en curso y avisa con
 * resultado(hecho, now).
 * - Baja con dos ventanas malas entre las últimas cuatro, o con una sola que pierda la quinta parte de los refrescos
 *   (1 a 3 escalones según cuánto se pierde).
 * - Carga ajena: si después de bajar se pierde casi lo mismo (más de dos tercios de lo de antes), los píxeles no eran el
 *   problema (otra app o el compositor ocupan la placa): pide deshacer esa bajada y no baja más mientras siga así
 *   (`ajena`, hasta AJENA_MS o hasta tres ventanas limpias seguidas).
 * - Sube de a un escalón después de SUBIR_MS sin perder un solo refresco (y con el hilo principal por debajo del 80 %),
 *   mientras esté por debajo de lo que dejó la calibración; por encima, después de SUBIR_ARRIBA_MS. Si una subida pierde
 *   refrescos en los 15 s siguientes, se deshace y la espera para volver a probar se duplica (hasta SUBIR_MAX_MS).
 * El costo de la placa no se ve desde acá (los intervalos llegan en múltiplos del período): el margen del 85 % sobre el
 * costo del cuadro lo pone la calibración, que lo mide antes de jugar.
 */
export class Gobernador {
  constructor(hz) {
    this.fijar(hz); this.v = { t: 0, n: 0, dup: 0, cb: 0, d: [] }; this.malas = []; this.hasta = 0; this.pide = false; this.sube = false; this.pasos = 1; this.fps = 0; this.ult = null;
    this.nivel = 0;            // escalones por debajo de lo que dejó la calibración (negativo: por encima)
    this.limpioMs = 0;         // tiempo seguido sin perder refrescos
    this.espera = SUBIR_MS; this.esperaArriba = SUBIR_ARRIBA_MS;
    this.ajena = false; this.tAjena = 0; this.ignoradas = 0; this.tope = false; this.piso = false; this.ultimo = null; this.motivo = ''; this._frac = 0; this.historia = [];
  }
  /** Compatibilidad: «quieto» era dejar de bajar porque bajar no servía. */
  get quieto() { return this.ajena; }
  /** Cambia la frecuencia de pantalla con la que se juzga. */
  fijar(hz) { this.hz = hz; this.paso = pasoDe(hz); this.meta = metaDe(hz); this.periodo = 1000 / this.meta; }
  _vaciar() { const v = this.v; v.t = v.n = v.dup = v.cb = 0; v.d.length = 0; }
  /** Descarta lo medido hasta dentro de `ms`: después de cargar o de cambiar de calidad los primeros cuadros no cuentan. */
  calentar(now, ms = 2500) { this.hasta = now + ms; this._vaciar(); this.malas = []; this.pide = false; this.sube = false; this.pasos = 1; this.limpioMs = 0; }
  /** Estado para mirar desde la consola (JUEGO.calidad.gobernador). */
  get estado() { return { nivel: this.nivel, ajena: this.ajena, ignoradas: this.ignoradas, tope: this.tope, piso: this.piso, limpioS: Math.round(this.limpioMs / 100) / 10, esperaS: this.espera / 1000, esperaArribaS: this.esperaArriba / 1000, motivo: this.motivo, historia: this.historia.slice(-8) }; }
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
    this.limpioMs = limpia ? this.limpioMs + v.t : 0;
    if (this.ajena && (now - this.tAjena > AJENA_MS || (limpia && this.limpioMs >= 2900))) { this.ajena = false; this.motivo = now - this.tAjena > AJENA_MS ? 'se vuelve a probar si bajar sirve' : 'la máquina se liberó'; }
    const pasos = frac > .45 ? 3 : frac > .2 ? 2 : 1;
    if (this.pide) { if (!this.sube) this.pasos = Math.max(this.pasos, pasos); }      // ya pidió y todavía no se pudo aplicar (hay un intento en curso)
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
    if (this.ajena || this.piso) { this.ignoradas++; return; }
    // bajar no cambió lo que se pierde: no es el costo del juego. Se deshace esa bajada y no se baja más por ahora.
    if (u && !u.sube && !u.deshace && now - u.t < AJENA_MS && frac > u.frac * .67) {
      this.ajena = true; this.tAjena = now; this._pedir(true, u.pasos, 'carga ajena: bajar no cambió lo que se pierde', frac); this._deshace = true; return;
    }
    this._pedir(false, pasos, 'pierde refrescos', frac);
  }
  _pedir(sube, pasos, motivo, frac) { this.pide = true; this.sube = sube; this.pasos = pasos; this.motivo = motivo; this._frac = frac; this._deshace = false; }
  /**
   * main.js avisa qué pasó con el pedido: `hecho` si cambió algo (false: no había más para bajar o para subir).
   * Empieza el calentamiento: los cuadros de los próximos 2,5 s no cuentan.
   */
  resultado(hecho, now) {
    if (!this.pide) return; const sube = this.sube, pasos = this.pasos;
    if (hecho) {
      const nivel = this.nivel; this.nivel += sube ? -pasos : pasos;
      this.ultimo = { sube, t: now, frac: this._frac, pasos, nivel, deshace: !!this._deshace };
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
