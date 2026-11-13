// Máquina del intento (docs/JUEGO.md, secciones 3, 4, 5 y 9.3). Función pura de la lista de eventos: salta de evento en
// evento y solo integra paso a paso (120 por segundo) dentro de la pelea y de la traba. Todo en enteros (ver rules.js).
//
// Uso: new Intento(ctx) → confirmar(t) → entrada(t, 1|0)… → avanzar(t). `res` deja de ser null cuando el intento terminó.
// Los instantes son ms desde el llamado. Un contacto que se apoya es 1 y uno que se levanta es 0; fuera de la pelea el
// botón está apretado mientras haya al menos un contacto, y en la pelea cada contacto nuevo es un toque.
import { idiv, lerpi, mezclar, Azar } from './fixed.js';
import {
  ventanas, calidad, palabra, alturaExplosion, desvioExplosion, velTiron, exigenciaTabla, alturaTabla, periodoAnillo, errorAnillo, gradoTension,
  anchoFacil, asistFacil, segunHolgura, TENSION, FACIL, ACOMODO_MS, ALTURA_MIN, TOPE_DESVIO, ALTURA_ENVION, NO_DOMINA, EXI_ARRANQUE, EXI_ERROR, PELEA, TRABA, FIJA, HOMBROS, JUEZ, esfuerzoPropio,
  UNO, CUERPO_NEUTRO, gastoTramo, diaDe,
} from './rules.js';

const INF = 2147483647;
const PASO = k => idiv(k * 25, 3);           // ms del paso k de la pelea (120 por segundo)

/**
 * @typedef {object} Ctx
 * @property {'s'|'c'} lev           arranque o dos tiempos
 * @property {'split'|'power'|'squat'} [env]
 * @property {number} I              intensidad (diezmilésimas)
 * @property {number} tec  @property {number} temple  0 si el intento no lleva etiqueta  @property {number} garra
 * @property {object} anclas         tiempos del modelo (sim.json)
 * @property {number} semilla  @property {number} cal  @property {boolean} primera  @property {boolean} domina
 * @property {number[]} jueces       umbral de cada juez en milésimas (900 a 1100)
 * @property {number} reloj          ms; 0 = sin reloj (calentamiento)
 * @property {number} [exiFija]      exigencia guionada (calentamiento)
 * @property {'c'|'f'|'u'} [ctl]     nivel de control: 'f' (Fácil de círculos) ensancha las ventanas, vuelve amague el tirón anticipado y da siempre buena tensión.
 *                                   'u' (un toque, un tramo): ningún toque tiene momento justo; decide el margen (ver `_u…` abajo).
 * @property {boolean} [tactil]      con el dedo: en 'f', ventanas FACIL.tactil más anchas y señal que abre y cierra más tarde; en 'u',
 *                                   dos contactos a menos de UNO.dobleDedo ms son uno (con teclado, UNO.dobleTecla).
 *                                   Ausente o 'c': Clásico, las reglas de siempre (docs/CONTROLES.md, sección 4)
 * @property {object} [cuerpo]       ('u') factores de gasto por tramo del pesista (rules.js, cuerpoDe); sin él, CUERPO_NEUTRO
 * @property {boolean} [garraUno]    ('u') la garra de este levantamiento sigue disponible (false: ya se usó en otro intento)
 */
export class Intento {
  /** @param {Ctx} c */
  constructor(c) {
    this.c = c; this.t = 0; this.fase = 'llamado'; this.n = 0; this.res = null;
    const r = new Azar(mezclar(c.semilla, 2));
    this.varDesvio = [idiv(r.entre(-10, 10) * c.I, 10000), idiv(r.entre(-10, 10) * c.I, 10000)];
    this.chicharra = r.entre(FIJA.chMin, FIJA.chMax);
    this.per = periodoAnillo(c.I); this.vel = velTiron(c.I);
    this.gestos = []; this.toques = 0; this.fuera = 0; this.amagues = 0;
    this.temblor = 0; this.trabaMs = -1; this.rodilla = false;
    this.movs = []; this.M = null; this.fij = null;
    this.U = c.ctl === 'u' ? this._uIni() : null;
  }
  get fin() { return this.res !== null; }

  // ---------- entradas ----------
  /** Confirmar en el panel del llamado: el pesista se agacha a la barra. */
  confirmar(t) { this.avanzar(t); if (this.fase !== 'llamado') return; this.tConf = t; this.tSet = t + ACOMODO_MS; this.fase = 'acomodo'; }
  /** Un contacto se apoya (v = 1) o se levanta (v = 0) en el instante t. */
  entrada(t, v) {
    this.avanzar(t); if (this.res) return;
    if (this.U) return this._uEntrada(t, v);
    if (v) { this.n++; this._toque(t); if (this.n === 1) this._aprieta(t); }
    else if (this.n > 0) { this.n--; if (this.n === 0) this._suelta(t); }
  }
  /** Deja pasar el tiempo hasta t. */
  avanzar(t) {
    while (!this.res) { const d = this.proximo(); if (d > t) break; this._vence(d); }
    if (t > this.t) this.t = t;
    if (this.U && !this.res) this._uAvance(this.t);
  }

  // ---------- movimientos ----------
  _mov(mov, t0) {
    const c = this.c, k = mov === 'j' ? c.env : mov;
    this.M = { mov, k, t0, ign: t0, an: c.anclas[k], tDev: INF, tp: 0, tr: 0, tc: 0, tq: 0, tFallo: INF, causaFallo: null, pelea: null, grado: null, amagues: [] };
    this.movs.push(this.M);
  }
  /**
   * Ventanas del gesto. La ventana de la señal va de −`A` a +`L` ms del objetivo: fuera de ella un toque no cuenta. En
   * Clásico las dos son el límite `l`. En Fácil son fijas (FACIL.abreMs y FACIL.limMin, o `l` si es más ancho del lado tarde):
   * no se achican con los kilos, aunque PERFECTO y BIEN sí.
   */
  _w(g) {
    const c = this.c, f = c.ctl === 'f', tt = f && c.tactil, w = ventanas(c.I, `${this.M.mov}_${g}`, { tec: c.tec, temple: c.temple, primera: c.primera, ancho: f ? (tt ? idiv(anchoFacil(c.I) * FACIL.tactil, 1000) : anchoFacil(c.I)) : 1000 });
    w.A = f ? FACIL.abreMs + (tt ? FACIL.tactilAbre : 0) : w.l; w.L = f ? Math.max(w.l, FACIL.limMin + (tt ? FACIL.tactilLim : 0)) : w.l; return w;
  }

  _aprieta(t) {
    const M = this.M, c = this.c;
    if (this.fase === 'tension' || this.fase === 'hombros') {
      if (t < M.ign) return;
      const d = errorAnillo(Math.max(0, t - c.cal - M.t0), this.per);
      M.grado = c.ctl === 'f' ? 'buena' : gradoTension(d); M.dTension = d; M.tp = t; M.w = this._w('exp');
      if (M.mov === 'j') { const dip = idiv(M.an.dip * 1000, this.vel); M.tx = t + (c.ctl === 'f' ? Math.max(dip, FACIL.cierreMs) : dip); this.fase = 'flexion'; }
      else { M.tk = t + idiv(M.an.knee * 1000, this.vel); M.tx = t + idiv(M.an.power * 1000, this.vel); this.fase = 'tiron'; }
      M.tTarde = M.tx + c.cal + M.w.L;
    } else if (this.fase === 'vuelo' || this.fase === 'empuje') {
      if (M.tFallo < INF || M.tq) return;
      const e = t - c.cal - M.tc;
      if (e < -M.wr.A) { M.tFallo = M.tc; M.causaFallo = 'fondo'; M.e2 = e; this.gestos.push({ g: 'recepcion', mov: M.mov, e, pal: 'temprano', fuera: true }); return; }
      this._recibe(t, e);
    } else if (this.fase === 'fijacion') {
      const f = this.fij;
      if (f.upPend !== null) f.upPend = null; else if (!f.abajo) { f.abajo = true; f.desde = t; }
    }
  }
  _suelta(t) {
    const M = this.M, c = this.c;
    if (this.fase === 'tiron') {
      const e = t - c.cal - M.tx;
      // amague: antes de la rodilla; en Fácil, también antes de que abra la ventana de la señal (la capa no deja pasar esos toques)
      if (t < M.tk || (c.ctl === 'f' && e < -M.w.A)) {
        // Fácil: dos amagues por levantamiento; el tercero es fallo (tocar a ciegas no puede tirar los dados sin fin)
        if (c.ctl === 'f' && M.amagues.length >= FACIL.amagues) { this.gestos.push({ g: 'explosion', mov: M.mov, e, pal: 'temprano', fuera: true }); return this._fallo(t, 'anticipado'); }
        this.amagues++; M.amagues.push({ tp: M.tp, t }); const v = Math.min(t - M.tp, 600); M.t0 = M.ign = t + v; this.fase = 'tension'; return;
      }
      this.rodilla = true;
      if (e < -M.w.A) { this.gestos.push({ g: 'explosion', mov: M.mov, e, pal: 'temprano', fuera: true }); return this._fallo(t, 'anticipado'); }
      this._explota(t, e);
    } else if (this.fase === 'flexion') {
      const e = t - c.cal - M.tx;
      if (e < -M.w.A) {
        if (c.ctl === 'f' && M.amagues.length >= FACIL.amagues) { this.gestos.push({ g: 'explosion', mov: 'j', e, pal: 'temprano', fuera: true }); return this._fallo(t, 'anticipado'); }
        this.amagues++; M.amagues.push({ tp: M.tp, t }); M.t0 = M.ign = t + HOMBROS.amagueMs; this.fase = 'hombros'; return;
      }
      this._explota(t, e);
    } else if (this.fase === 'fijacion') {
      const f = this.fij; if (!f.abajo) return;
      if (f.firme && t >= f.tb) return this._juzga(t);
      f.upPend = t;
    }
  }
  /** Soltar dentro del límite: fija el calendario de la recepción y las dos medidas de la barra. */
  _explota(t, e) {
    const M = this.M, c = this.c, w = M.w, j = M.mov === 'j';
    const ae = alturaExplosion(e, w), at = TENSION.mm[M.grado];
    M.e = e; M.tr = t; M.tc = t + M.an.rec; M.wr = this._w('rec'); M.tTardeRec = M.tc + c.cal + M.wr.L;
    M.alt = alturaTabla(c.I) + ae + at - w.recorte + (j ? ALTURA_ENVION[c.env] + (c.domina ? 0 : NO_DOMINA.altura) : 0);
    M.des = desvioExplosion(e, w) + this.varDesvio[j ? 1 : 0];
    M.perdida = (30 - ae) + (TENSION.mm.perfecta - at);
    // en Fácil, un toque que salió PERFECTO o BIEN no pierde la barra en el vuelo: lo que falte se paga en la subida; y en
    // los pesos livianos TEMPRANO y TARDE tienen `vueloMm` de margen (la barra no se cae por poco)
    const f = c.ctl === 'f', libre = f ? segunHolgura(c.I, FACIL.vueloMm, 0) : 0;
    const tope = TOPE_DESVIO[M.k] + (j && !c.domina ? NO_DOMINA.desvio : 0) + libre;
    if (f && Math.abs(e) <= w.g) { /* sigue */ }
    else if (M.alt < ALTURA_MIN - libre) { M.tFallo = t + 150; M.causaFallo = 'sin_altura'; }
    else if (M.des > tope) { M.tFallo = M.tc; M.causaFallo = 'adelante'; }
    else if (M.des < -tope && M.mov !== 'c') { M.tFallo = M.tc; M.causaFallo = 'atras'; }
    this.gestos.push({ g: 'explosion', mov: M.mov, e, pal: palabra(e, w) });
    this.fase = j ? 'empuje' : 'vuelo';
  }
  /** Apretar dentro del límite de la recepción: arma la pelea, la traba o el paso directo a quedar de pie. */
  _recibe(t, e) {
    const M = this.M, c = this.c, wr = M.wr, a = Math.abs(e), q = calidad(e, wr);
    M.tq = t; M.e2 = e; M.q2 = q; this.gestos.push({ g: 'recepcion', mov: M.mov, e, pal: palabra(e, wr) });
    const base = c.exiFija ?? exigenciaTabla(c.I), ad = Math.abs(M.des), f = c.ctl === 'f';
    // en Fácil, lo que cuesta empuje empieza donde termina BIEN: la palabra que se mostró no contradice a la subida
    const porAltura = f ? Math.max(0, M.perdida - FACIL.perdidaLibre) * FACIL.porMm : M.perdida * EXI_ERROR.porMm, w0 = f ? wr.g : wr.p;
    M.exi = base + (M.mov === 's' ? EXI_ARRANQUE : 0) + Math.min(EXI_ERROR.tope, porAltura) + (ad > 20 ? (ad - 20) * EXI_ERROR.porDesvio : 0) + (a <= w0 ? 0 : lerpi(Math.min(a, wr.l), w0, wr.l, 0, EXI_ERROR.recepcion));
    if (M.exi < 0) M.exi = 0;
    const blando = M.mov !== 'c' && a > wr.g, L = blando ? lerpi(Math.min(a, wr.l), wr.g, wr.l, TRABA.ini, TRABA.iniLimite) : null;
    const squat = M.mov === 'j' && c.env === 'squat';
    if (M.mov === 'j' && !squat) {
      if (!blando) { M.tPost = Math.max(t, M.tc) + M.an.post; this.fase = 'post'; return; }
      this._pelea(t, { modo: 'traba', L, base });
    } else this._pelea(Math.max(t, M.tc + (M.mov === 'c' ? M.an.amort : squat ? M.an.fondo : 0)), { modo: 'pelea', L, base, rebote: squat ? 0 : idiv(PELEA.rebote * q, 1000) * 1000 });
  }

  // ---------- pelea y traba ----------
  _pelea(t0, o) {
    const M = this.M, c = this.c, A = PELEA.precarga + PELEA.precargaCal * M.q2, propio = esfuerzoPropio(c.garra), E = Math.min(1000, propio + idiv(A, 1000));
    // Fácil: en los pesos livianos la barra sube sola, más lenta que tocando (avance por paso; 0 si la exigencia no lo deja)
    const sola = c.ctl === 'f' ? idiv(Math.min(FACIL.solaMax, Math.max(0, PELEA.subir * (propio + asistFacil(c.I) - M.exi) * 1000)), PELEA.hz) : 0;
    M.pelea = {
      modo: o.modo, t0, k: 0, P: 0, A, propio, E, sola, aguja: E, exi: M.exi, exiAhora: M.exi, exiTraba: Math.max(0, o.base - TRABA.menos), rebote: o.rebote || 0,
      L: o.L, trabado: o.L === null, T: 0, buf: new Array(PELEA.agujaPasos).fill(E), suma: E * PELEA.agujaPasos, ultToque: M.tq, ultEmpuje: -INF, cero: 0, toques: 0, fuera: 0, enFranja: false,
    };
    this.fase = o.modo;
  }
  _toque(t) {
    if (this.fase !== 'pelea' && this.fase !== 'traba') return;
    const p = this.M.pelea, d = t - p.ultToque;
    if (d < PELEA.nadaMs) return;
    p.A += d < PELEA.mitadMs ? PELEA.toque / 2 : PELEA.toque; p.ultToque = p.ultEmpuje = t; p.toques++; this.toques++;
  }
  _paso(t) {
    const M = this.M, p = M.pelea, hz = PELEA.hz, f = this.c.ctl === 'f'; p.k++;
    const ms = t - p.t0, cae = ms > PELEA.aguanteMs ? idiv((ms - PELEA.aguanteMs) * PELEA.aguanteCae, 1000) : 0;
    p.A -= idiv(p.A, hz);
    const E = p.E = Math.min(1000, Math.max(0, p.propio - cae) + idiv(p.A, 1000));
    const i = p.k % PELEA.agujaPasos; p.suma += E - p.buf[i]; p.buf[i] = E; p.aguja = idiv(p.suma, PELEA.agujaPasos);
    if (p.modo === 'pelea') {
      const X = p.exiAhora = p.exi + (p.P >= PELEA.estancaDe && p.P <= PELEA.estancaA && p.P < 1000000 ? (f ? 0 : PELEA.estanca) : 0);
      if (p.P < 1000000) {
        if (p.P < p.rebote) p.P += idiv(PELEA.topeSubir, hz);
        else {
          const d = E - X; let dP = d > 0 ? Math.min(idiv(PELEA.subir * d * 1000, hz), idiv(PELEA.topeSubir, hz)) : idiv(PELEA.hundir * d * 100, hz);
          if (dP < 0 && ms < PELEA.graciaReboteMs) dP = 0;
          // Fácil: sin un toque reciente sube a lo sumo a la velocidad de la subida sola (que puede ser 0: cerca del techo hay
          // que tocar); tocar solo suma si empuja más rápido que eso
          if (f) { if (dP > p.sola && t - p.ultEmpuje > PELEA.recienteMs) dP = p.sola; if (p.sola > 0 && dP < p.sola) dP = p.sola; }
          p.P += dP; if (p.P < 0) p.P = 0;
        }
        if (p.P > 1000000) p.P = 1000000;
      }
      // temblor: empujar de más solo tiembla si hubo un toque reciente
      const reciente = t - p.ultEmpuje <= PELEA.recienteMs, sobre = p.aguja - (X + PELEA.franja);
      // en Fácil empujar de más no hace temblar: «tocá rápido» es toda la regla
      if (f) { if (!reciente) p.T -= idiv(PELEA.temblorBaja, hz); }
      else if (reciente) { if (sobre > 0) p.T += idiv(PELEA.temblorExceso * sobre * 1000, hz); if (p.aguja > PELEA.roja) p.T += idiv(PELEA.temblorRoja, hz); }
      else p.T -= idiv(PELEA.temblorBaja, hz);
      const ad = Math.abs(M.des) - PELEA.desvioLibre; if (ad > 0) p.T += idiv(ad * PELEA.temblorDesvio, hz);
      if (p.T < 0) p.T = 0;
      p.enFranja = p.aguja >= X && sobre <= 0;
      if (p.P < 1000000 && (p.aguja < X || (sobre > 0 && reciente && !f))) { p.fuera++; this.fuera++; }
      if (p.T >= 1000000) return this._fallo(t, 'temblor');
      // Fácil: la subida se corta apenas el avance se queda atrás del piso (no hay 12 s de toques para nada)
      if (f) { if (p.P < 1000000 && ms > FACIL.plazoMs && p.P < (ms - FACIL.plazoMs) * FACIL.ritmo) return this._fallo(t, M.mov === 'c' ? 'aplastado' : 'codos'); }
      else if (p.P === 0 && ms >= PELEA.graciaMs) { p.cero++; if (p.cero * 1000 >= PELEA.hundidoMs * hz) return this._fallo(t, M.mov === 'c' ? 'aplastado' : 'codos'); } else p.cero = 0;
    }
    if (!p.trabado) {
      const d = E - p.exiTraba;
      p.L += d > 0 ? Math.min(idiv(PELEA.subir * d * 1000, hz), idiv(PELEA.topeSubir, hz)) : idiv(PELEA.hundir * d * 100, hz);
      if (p.L < TRABA.pierde) return this._fallo(t, 'codos');
      // en Fácil la traba se cuenta desde que la barra llega (con un toque temprano, el vuelo que falta no es codo blando)
      if (p.L >= 1000000) { p.L = 1000000; p.trabado = true; this.trabaMs = t - (f ? p.t0 : M.tq); }
    }
    if (ms >= (f ? FACIL.maxMs : PELEA.maxMs)) return this._fallo(t, p.modo === 'traba' || M.mov !== 'c' ? 'codos' : 'aplastado');
    if (p.trabado && (p.modo === 'traba' || p.P >= 1000000)) this._enPie(t);
  }
  _enPie(t) {
    const M = this.M, p = M.pelea; M.tEnPie = t;
    // el temblor de la cargada se arrastra al envión: machacar la subida se paga con las luces aunque el envión salga limpio
    if (M.mov === 'c') { this.temblor = p.T; this._mov('j', t + HOMBROS.ignoraMs); this.M.tDev = t + HOMBROS.maxMs; this.fase = 'hombros'; return; }
    if (p.T > this.temblor) this.temblor = p.T;
    if (M.mov === 'j') { M.tPost = Math.max(t, M.tc) + M.an.post; this.fase = 'post'; } else this._fija(t);
  }
  _fija(t) { this.fij = { ts: t, abajo: this.n > 0, desde: t, upPend: null, firme: false, tFirme: 0, tb: INF }; this.fase = 'fijacion'; }

  // ---------- vencimientos ----------
  /** Próximo instante en que la máquina cambia sola (INF si espera una entrada). */
  proximo() {
    if (this.U) return this._uProximo();
    const M = this.M, c = this.c, R = c.reloj || INF;
    switch (this.fase) {
      case 'llamado': return R;
      case 'acomodo': return Math.min(this.tSet, R);
      case 'tension': return R;
      case 'tiron': return Math.min(M.tTarde, R < M.tk ? R : INF);
      case 'hombros': return M.tDev;
      case 'flexion': return Math.min(M.tTarde, M.tDev);
      case 'vuelo': case 'empuje': return Math.min(M.tFallo, M.tTardeRec);
      case 'pelea': case 'traba': return M.pelea.t0 + PASO(M.pelea.k + 1);
      case 'post': return M.tPost;
      case 'fijacion': {
        const f = this.fij; let d = INF;
        if (f.upPend !== null) d = f.upPend + FIJA.sueltaChicaMs;
        else if (f.abajo && !f.firme) d = f.desde + FIJA.firmeMs;
        if (!f.firme) d = Math.min(d, f.ts + FIJA.plazoMs); else d = Math.min(d, f.tb + FIJA.bajaSolaMs);
        return d;
      }
      default: return INF;
    }
  }
  _vence(d) {
    const M = this.M; if (d > this.t) this.t = d;
    if (this.U) return this._uVence(d);
    switch (this.fase) {
      case 'llamado': case 'tension': return this._nulo(d, 'reloj');
      case 'acomodo': if (d === this.tSet) { this._mov(this.c.lev, d); this.fase = 'tension'; return; } return this._nulo(d, 'reloj');
      case 'tiron': if (d === M.tTarde) { this.rodilla = true; this.gestos.push({ g: 'explosion', mov: M.mov, e: M.w.L + 1, pal: 'tarde', fuera: true }); return this._fallo(d, 'sin_altura'); } return this._nulo(d, 'reloj');
      case 'hombros': return this._fallo(d, 'devuelve');
      case 'flexion': if (d === M.tTarde && d <= M.tDev) { this.gestos.push({ g: 'explosion', mov: 'j', e: M.w.L + 1, pal: 'tarde', fuera: true }); return this._fallo(d, 'sin_altura'); } return this._fallo(d, 'devuelve');
      case 'vuelo': case 'empuje':
        if (M.tFallo <= d) return this._fallo(d, M.causaFallo);
        this.gestos.push({ g: 'recepcion', mov: M.mov, e: M.wr.L + 1, pal: 'tarde', fuera: true }); return this._fallo(d, 'fondo');
      case 'pelea': case 'traba': return this._paso(d);
      case 'post': return this._fija(d);
      case 'fijacion': {
        const f = this.fij;
        if (f.upPend !== null && d === f.upPend + FIJA.sueltaChicaMs) { if (f.firme) return this._nulo(f.upPend, 'antes'); f.abajo = false; f.upPend = null; return; }
        if (!f.firme && f.abajo && f.upPend === null && d === f.desde + FIJA.firmeMs) { f.firme = true; f.tFirme = d; f.tb = d + this.chicharra + idiv(this.temblor, 2000); return; }
        if (!f.firme) return this._nulo(d, 'sin_apoyo');
        return this._juzga(d);
      }
    }
  }

  // ---------- 'u': un toque, un tramo (docs/JUEGO.md, Gameplay 2) ----------
  // Cada tramo con toque (¡TIRA!, ¡SALTA!, ¡PÁRATE!, ¡ARRIBA!, y ¡DA TODO! en el FRENO) se cumple con su primer contacto, en
  // cualquier punto del tramo. Un contacto que llega antes queda guardado (uno solo) para el tramo siguiente; uno apoyado
  // cumple cada tramo que abre. Ningún contacto tira la barra: lo único que decide es el margen al cerrar cada tramo.
  // Fases (las mismas de siempre, para que sequence.js dibuje igual): acomodo → tension (¡TIRA!) → tiron (¡SALTA! abre a
  // los UNO.saltaDesde ms) → vuelo (explosión en el ancla; ¡SALTA! cierra en la recepción) → pelea (¡PÁRATE!) → fijacion
  // (arranque) o hombros (¡ARRIBA!) → flexion → empuje → post → fijacion. 'freno': un tramo dejó el margen apenas debajo de
  // cero y queda la garra: UNO.frenoMs para usarla con un contacto.
  _uIni() {
    const c = this.c, dia = diaDe(c.semilla), m0 = UNO.margen + dia;
    return { cuerpo: c.cuerpo || CUERPO_NEUTRO, dia, m0, m: m0, gastos: {}, log: [], garra: c.garraUno === false ? 'gastada' : 'disponible',
      guarda: 0, ign: 0, ultBaja: -INF, contactos: [], salto: null, pisoton: null, caida: null, freno: null, tiraSola: false, arribaSola: false };
  }
  _uEntrada(t, v) {
    const U = this.U;
    if (!v) { if (this.n > 0) this.n--; else if (U.ign > 0) U.ign--; return; }
    // la confirmación y el doble toque son un solo contacto: no cuentan, ni tampoco su soltar
    if ((this.tConf !== undefined && t < this.tConf + UNO.confMs) || t - U.ultBaja < (this.c.tactil ? UNO.dobleDedo : UNO.dobleTecla)) { U.ign++; U.contactos.push({ t, que: 'doble' }); return; }
    U.ultBaja = t; this.n++; this.toques++;
    U.contactos.push({ t, que: this._uContacto(t) });
  }
  /** Qué hace un contacto nuevo en t: 'tira', 'salta', 'pisoton', 'garra', 'arriba', 'guardado', 'listo' o 'espera'. */
  _uContacto(t) {
    const M = this.M, U = this.U;
    switch (this.fase) {
      case 'llamado': return 'espera';
      case 'tension': this._uTira(t); return 'tira';
      case 'tiron': case 'vuelo': if (U.salto === null && t >= M.tp + UNO.saltaDesde) { U.salto = t; return 'salta'; } return this._uGuarda();
      case 'pelea': if (M.mov !== 'j' && !M.pelea.cerrado && U.pisoton === null) { this._uPisa(t); return 'pisoton'; } return this._uGuarda();
      case 'freno': this._uGarra(t); return 'garra';
      case 'hombros': if (M.abierto) { this._uArriba(t); return 'arriba'; } return this._uGuarda();
      default: return this._uGuarda();
    }
  }
  /** ¿Queda algún tramo con toque por delante? (el contacto guardado sirve para ese). */
  _uQueda() {
    const M = this.M, U = this.U, f = this.fase, dos = this.c.lev === 'c';
    if (f === 'acomodo' || f === 'tension') return true;
    if (!M) return false;
    if (M.mov === 'j') return f === 'hombros';
    if (f === 'tiron' || f === 'vuelo') return true;      // ¡SALTA! (si falta) o ¡PÁRATE!
    if (f === 'pelea' && !M.pelea.cerrado && U.pisoton === null) return true;
    return dos;      // en el dos tiempos queda ¡ARRIBA!
  }
  _uGuarda() { const U = this.U; if (U.guarda || !this._uQueda()) return 'listo'; U.guarda = 1; return 'guardado'; }
  /** Abre un tramo con toque: lo cumple un contacto guardado o uno apoyado. */
  _uAbre() { const U = this.U; if (U.guarda || this.n > 0) { U.guarda = 0; return true; } return false; }
  _uTira(t) {
    const M = this.M;
    M.tp = t; M.tk = t + idiv(M.an.knee * 1000, this.vel); M.tx = t + idiv(M.an.power * 1000, this.vel); M.tSalta = t + UNO.saltaDesde; M.saltaAbierta = false;
    this.rodilla = true; this.fase = 'tiron';
  }
  _uExplota(t) {
    const M = this.M; M.e = 0; M.des = 0; M.tr = t; M.tc = t + M.an.rec; this.fase = M.mov === 'j' ? 'empuje' : 'vuelo';
  }
  _uSube(t0) {
    const M = this.M, U = this.U;
    M.pelea = { modo: 'pelea', t0, P: 0, T: 0, k: 0, aguja: 0, exi: 0, exiAhora: 0, cerrado: false, tCierre: t0 + UNO.pararseMs, tP0: t0, P0: 0, Pc: 0, tSube: INF, tPie: INF };
    this.fase = 'pelea';
    if (U.pisoton === null && this._uAbre()) this._uPisa(t0);
  }
  _uPisa(t) {
    const p = this.M.pelea; this.U.pisoton = t; p.P0 = this._uP(t); p.tP0 = t;
    p.tCierre = Math.min(p.tCierre, Math.max(p.t0 + UNO.pararseMin, t + UNO.pisotonCierre));
  }
  /** Avance de la subida (millonésimas) en t: hasta UNO.pDuda al cierre del tramo; después, a quedar de pie. */
  _uP(t) {
    const p = this.M.pelea; if (!p) return 0;
    if (t >= p.tPie) return 1000000;
    if (p.cerrado) return t <= p.tSube ? p.Pc : p.Pc + idiv((1000000 - p.Pc) * (t - p.tSube), p.tPie - p.tSube);
    const fin = UNO.pDuda, d = p.tCierre - p.tP0;
    return t <= p.tP0 ? p.P0 : d <= 0 ? fin : Math.min(fin, p.P0 + idiv((fin - p.P0) * (t - p.tP0), d));
  }
  _uAvance(t) { const M = this.M; if (M && M.pelea) M.pelea.P = this._uP(t); }
  _uDePie(t) { const p = this.M.pelea; p.tSube = t; p.tPie = t + (this.U.pisoton !== null ? UNO.subeMs.con : UNO.subeMs.sin); this.fase = 'pelea'; }
  _uEnPie(t) {
    const M = this.M; M.tEnPie = t; M.pelea.P = 1000000;
    if (M.mov === 's') return this._uFija(t);
    if (M.mov === 'c') {
      this._mov('j', t); const J = this.M; J.ign = t + UNO.respiraMs; J.tDev = J.ign + UNO.arribaSolo; J.abierto = false; this.fase = 'hombros'; return;
    }
    M.tPost = t + M.an.post; this.fase = 'post';
  }
  _uArriba(t) { const M = this.M; M.tp = t; M.tx = t + idiv(M.an.dip * 1000, this.vel); this.fase = 'flexion'; }
  _uFija(t) { this.fij = { ts: t, abajo: true, desde: t, upPend: null, firme: true, tFirme: t, tb: t + FIJA.firmeMs + this.chicharra }; this.fase = 'fijacion'; }
  /**
   * Cierra un tramo: gasta su margen y sigue, ofrece la garra (FRENO) o deja caer la barra ahí. `sigue(t)` es lo que viene
   * después si el tramo se salva.
   */
  _uCierra(t, tramo, sigue) {
    const U = this.U, c = this.c;
    const g = gastoTramo(tramo, c.I, c.lev, c.env, U.cuerpo, { salto: U.salto !== null, pisoton: U.pisoton !== null });
    U.gastos[tramo] = g; U.m -= g; U.log.push({ t, tramo, gasto: g, m: U.m });
    if (U.m >= 0) return sigue(t);
    if (U.m >= UNO.frenoMin && U.garra === 'disponible') {
      U.freno = { t0: t, hasta: t + UNO.frenoMs, tramo, sigue }; this.fase = 'freno';
      if (this.n > 0) this._uGarra(t);      // la tecla o el dedo apoyado la usan
      return;
    }
    return this._uCae(t, tramo);
  }
  _uGarra(t) { const U = this.U, f = U.freno; U.freno = null; U.garra = 'usada'; U.m += UNO.garra; U.log.push({ t, tramo: f.tramo, garra: UNO.garra, m: U.m }); f.sigue(t); }
  _uCae(t, tramo) {
    const U = this.U, j = this.M.mov === 'j'; U.caida = tramo;
    this._fallo(t, tramo === 'tiron' ? 'sin_altura' : tramo === 'arriba' ? (j ? 'codos' : 'atras') : this.c.lev === 's' ? 'fondo' : 'aplastado');
  }
  /** En la recepción: cierra ¡SALTA! (el tirón) y, en el arranque, el tramo de arriba; después empieza la subida. */
  _uRecibe(t) {
    const M = this.M, c = this.c;
    const subir = t2 => this._uSube(Math.max(t2, M.tc + (M.mov === 'c' ? M.an.amort : 0)));
    this._uCierra(t, 'tiron', t1 => (c.lev === 's' ? this._uCierra(t1, 'arriba', subir) : subir(t1)));
  }
  /** En la recepción del envión: cierra el tramo de arriba; el squat se para solo, la tijera y el power van a quedar firmes. */
  _uRecibeEnvion(t) {
    const M = this.M, squat = this.c.env === 'squat';
    this._uCierra(t, 'arriba', t1 => {
      if (!squat) { M.tPost = Math.max(t1, M.tc) + M.an.post; this.fase = 'post'; return; }
      const t0 = Math.max(t1, M.tc + M.an.fondo);
      M.pelea = { modo: 'pelea', mov: 'j', t0, P: 0, T: 0, k: 0, aguja: 0, exi: 0, exiAhora: 0, cerrado: true, tCierre: t0, tP0: t0, P0: 0, Pc: 0, tSube: t0, tPie: t0 + UNO.squatMs };
      this.fase = 'pelea';
    });
  }
  _uProximo() {
    const M = this.M, U = this.U;
    switch (this.fase) {
      case 'acomodo': return this.tSet;
      case 'tension': return Math.max(this.tSet, this.tConf + (this.c.reloj || UNO.relojSin) - UNO.tiraSolo);
      case 'tiron': return M.saltaAbierta ? M.tx : Math.min(M.tSalta, M.tx);
      case 'vuelo': case 'empuje': return M.tc;
      case 'flexion': return M.tx;
      case 'pelea': return M.pelea.cerrado ? M.pelea.tPie : M.pelea.tCierre;
      case 'freno': return U.freno.hasta;
      case 'hombros': return M.abierto ? M.tDev : M.ign;
      case 'post': return M.tPost;
      case 'fijacion': return this.fij.tb + 150;
      default: return INF;
    }
  }
  _uVence(d) {
    const M = this.M, U = this.U;
    switch (this.fase) {
      case 'acomodo': this._mov(this.c.lev, d); this.fase = 'tension'; if (this._uAbre()) this._uTira(d); return;
      case 'tension': U.tiraSola = true; return this._uTira(d);
      case 'tiron':
        if (!M.saltaAbierta && d === M.tSalta) { M.saltaAbierta = true; if (U.salto === null && this._uAbre()) U.salto = d; return; }
        return this._uExplota(d);
      case 'flexion': return this._uExplota(d);
      case 'vuelo': return this._uRecibe(d);
      case 'empuje': return this._uRecibeEnvion(d);
      case 'pelea': {
        const p = M.pelea;
        if (!p.cerrado) { p.Pc = this._uP(d); p.P = p.Pc; p.cerrado = true; return this._uCierra(d, 'pararse', t => this._uDePie(t)); }
        return this._uEnPie(d);
      }
      case 'freno': { const f = U.freno; U.freno = null; U.garra = 'guardada'; return this._uCae(d, f.tramo); }
      case 'hombros':
        if (!M.abierto) { M.abierto = true; if (this._uAbre()) this._uArriba(d); return; }
        U.arribaSola = true; return this._uArriba(d);
      case 'post': return this._uFija(d);
      case 'fijacion': return this._cierra(d, 'valido', null, [true, true, true]);
    }
  }
  /** Lo que el intento deja en el resultado (y en la analítica): el margen y cómo se jugó. */
  _uRes() {
    const U = this.U, g = U.gastos; let mayor = null; for (const k of Object.keys(g)) if (mayor === null || g[k] > g[mayor]) mayor = k;
    const cuenta = {}; for (const x of U.contactos) cuenta[x.que] = (cuenta[x.que] || 0) + 1;
    return { margen_ini: U.m0, dia: U.dia, gastos: { ...g }, margen_fin: U.m, garra: U.garra, tramo_caida: U.caida, tramo_mayor: mayor, salto: U.salto !== null, pisoton: U.pisoton !== null,
      tira_sola: U.tiraSola, arriba_sola: U.arribaSola, al_limite: !U.caida && U.m < UNO.alLimite, contactos: cuenta };
  }

  // ---------- resultados ----------
  _cierra(t, res, causa, luces) {
    this.fase = 'fin';
    this.res = { res, causa, luces, t, toques: this.toques, fuera: this.fuera, gestos: this.gestos, temblor: this.temblor, trabaMs: this.trabaMs, rodilla: this.rodilla, amagues: this.amagues };
    if (this.U) this.res.uno = this._uRes();
  }
  _fallo(t, causa) { this._cierra(t, 'fallo', causa, [false, false, false]); }
  _nulo(t, causa) { this._cierra(t, 'nulo', causa, [false, false, false]); }
  /** Completó el levantamiento: deciden los tres jueces, cada uno con su umbral. */
  _juzga(t) {
    const J = this.c.jueces, sev = J.map(f => {
      let s = 0;
      if (this.trabaMs >= 0) { const tl = idiv(this.trabaMs * f, 1000); s += tl < JUEZ.traba1 ? 1 : tl < JUEZ.traba2 ? 2 : 3; }
      const tr = idiv(this.temblor * f, 1000); s += tr > JUEZ.temblor2 ? 2 : tr > JUEZ.temblor1 ? 1 : 0;
      return s;
    });
    // el más estricto da roja con una falta; el segundo necesita dos; el más permisivo, tres
    const orden = [0, 1, 2].sort((a, b) => J[b] - J[a] || a - b), luces = [true, true, true];
    orden.forEach((j, r) => { if (sev[j] >= r + 1) luces[j] = false; });
    const blancas = luces.filter(Boolean).length;
    this._cierra(t, blancas >= 2 ? 'valido' : 'nulo', blancas === 3 ? null : this.trabaMs >= 0 ? 'codos_blandos' : 'tiembla', luces);
  }
}

/** Recalcula un intento entero desde su lista de entradas. `hasta`: instante final (por defecto, hasta que termine). */
export function simular(ctx, conf, ent, hasta = INF - 1) {
  const m = new Intento(ctx);
  if (conf !== null && conf !== undefined && conf <= hasta) m.confirmar(conf);
  for (const [t, v] of ent) { if (t > hasta || m.res) break; m.entrada(t, v); }
  m.avanzar(hasta);
  return m;
}
