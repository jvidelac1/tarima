// Máquina de la partida (docs/JUEGO.md, secciones 6, 7 y 9.2): orden de salida, llamados, declaraciones, cambios, Resto,
// clasificación, La cuenta y etiquetas. Carga, reacción y ceremonia no tienen lógica: las muestra la presentación.
// La partida se maneja igual en vivo y al recalcular: abrir() → empezar() → [cambio()] → resolver() o resolverIA() → …
import { idiv, rdiv, clampi, mezclar, Azar } from './fixed.js';
import { simular } from './attempt.js';
import { gestos, decidir, elegirEnvion } from './ai.js';
import { VERSION, RELOJ, RESTO, APERTURA, PLAN, NIVELES, KG_MAX, EVENTO, CONTROLES, multFondo, techoMomento, intensidad } from './rules.js';

const LEVS = ['s', 'c'];

export class Partida {
  /**
   * @param {object} datos  sim.json ya verificado (data.js)
   * @param {{semilla:number, nivel:string, cal:number, primera:boolean, ctl?:'c'|'f', atletas:Array<{id:string, ctrl:'persona'|'juego'}>}} cfg
   *   `ctl`: nivel de control de la persona (ausente = 'c', Clásico). Los rivales juegan siempre con las reglas de Clásico.
   */
  constructor(datos, cfg) {
    if (!NIVELES[cfg.nivel]) throw new Error('nivel desconocido');
    if (!Array.isArray(cfg.atletas) || cfg.atletas.length !== 3 || new Set(cfg.atletas.map(x => x.id)).size !== 3) throw new Error('la final es de tres pesistas distintos');
    const ctl = cfg.ctl ?? 'c'; if (!CONTROLES.includes(ctl)) throw new Error('nivel de control desconocido');
    this.d = datos; this.cfg = { semilla: cfg.semilla >>> 0, nivel: cfg.nivel, cal: clampi(cfg.cal | 0, 0, 100), primera: !!cfg.primera, ctl, tactil: ctl === 'f' && !!cfg.tactil };
    const r = new Azar(mezclar(this.cfg.semilla, 7)), N = NIVELES[cfg.nivel];
    this.jueces = [0, 1, 2].map(() => r.entre(900, 1100));
    const tipo = r.ent(3), quien = r.ent(3);
    this.guion = { tipo: ['nada', 'tocado', 'forma'][tipo], a: tipo ? quien : -1 };
    this.at = cfg.atletas.map((x, i) => {
      const f = datos.atletas[x.id]; if (!f) throw new Error('pesista desconocido: ' + x.id);
      const forma = { s: r.entre(-2, 2), c: r.entre(-2, 2) }, pct = clampi(f.ia.apertura + r.entre(-25, 25), 910, 960) + N.abre;
      const saltos = { s: f.ia.saltos.s.map(k => k + r.entre(-1, 1)), c: f.ia.saltos.c.map(k => k + r.entre(-1, 1)) }, sube1 = [r.ent(3) === 0, r.ent(3) === 0, r.ent(3) === 0, r.ent(3) === 0];
      const a = { i, id: x.id, ctrl: x.ctrl === 'persona' ? 'persona' : 'juego', f, modelo: datos.modelos[f.modelo], resto: RESTO.ini, forma, saltos, sube1, s: [], c: [], decl: { s: 0, c: 0 }, mejor: { s: 0, c: 0 }, seqMejor: { s: -1, c: -1 }, ult: { s: -1, c: -1 }, cambios: 0, bono: '' };
      if (a.ctrl === 'juego') { if (N.forma) { forma.s += N.forma; forma.c += N.forma; } a.decl.s = rdiv(f.techo.s * pct, 1000); a.decl.c = rdiv(f.techo.c * pct, 1000); }
      return a;
    });
    if (this.guion.tipo === 'tocado') this.at[quien].resto = RESTO.tocado;
    if (this.guion.tipo === 'forma') this.at[quien].forma = { s: 2, c: 2 };
    this.fase = 'presentacion'; this.lev = 's'; this.seq = 0; this.barra = 0; this.ultimo = -1; this.llamado = null; this.nLlamado = 0;
    this.reg = { v: 2, sim: VERSION, datos: datos.huella, temporada: datos.temporada, semilla: this.cfg.semilla, cal: this.cfg.cal, nivel: this.cfg.nivel, primera: this.cfg.primera, ctl, ...(this.cfg.tactil ? { tactil: true } : {}),
      atletas: cfg.atletas.map(x => ({ id: x.id, ctrl: x.ctrl === 'persona' ? 'persona' : 'juego' })), aperturas: this.at.map(a => ({ s: a.decl.s, c: a.decl.c })), llamados: [] };
  }

  // ---------- aperturas y sesiones ----------
  /** Rango de apertura libre (kg) de un pesista: 88 % a 97 % del techo de ficha. */
  rangoApertura(i, lev) { const t = this.at[i].f.techo[lev]; return [-idiv(-t * APERTURA.min, 1000), idiv(t * APERTURA.max, 1000)]; }
  /** Apertura de un pesista manejado por una persona. */
  abrir(i, lev, kg) {
    const a = this.at[i], [lo, hi] = this.rangoApertura(i, lev);
    if (a.ctrl !== 'persona' || !Number.isInteger(kg) || kg < lo || kg > hi) throw new Error('apertura inválida');
    if (!((lev === 's' && this.fase === 'presentacion') || (lev === 'c' && (this.fase === 'presentacion' || this.fase === 'intervalo')))) throw new Error('la apertura ya está cerrada');
    a.decl[lev] = kg; this.reg.aperturas[i][lev] = kg;
  }
  /** Empieza el arranque (desde la presentación) o el dos tiempos (desde el intervalo). */
  empezar() {
    const lev = this.fase === 'presentacion' ? 's' : this.fase === 'intervalo' ? 'c' : null; if (!lev) throw new Error('no hay sesión por empezar');
    if (this.at.some(a => !a.decl[lev])) throw new Error('falta una apertura');
    this.fase = this.lev = lev; this.barra = 0; this.ultimo = -1; this._siguiente();
  }

  // ---------- consultas ----------
  techoDia(i, lev) { const a = this.at[i]; return (a.f.techo[lev] + a.forma[lev]) * 1000; }
  /** Techo visible (g): el de ficha corregido por el Resto. Con `signo`, suma 1 kg por el signo de la forma del día (lo que usan los rivales). */
  techoVisible(i, lev, signo = true) { const a = this.at[i], s = a.forma[lev]; return techoMomento(a.f.techo[lev] * 1000, a.resto) + (signo ? (s > 0 ? 1000 : s < 0 ? -1000 : 0) : 0); }
  /** Mínimo que puede pedir: 1 kg más tras un válido, lo mismo tras un nulo, y nunca menos de lo que ya está en la barra. */
  minimo(i, lev = this.lev) {
    const a = this.at[i], u = a[lev][a[lev].length - 1], m = u ? (u.res === 'valido' ? u.kg + 1 : u.kg) : this.rangoApertura(i, lev)[0];
    return Math.max(m, lev === this.lev ? this.barra : 0);
  }
  _filas(i = -1, lev = 's', kg = 0) {
    return this.at.map(a => {
      let s = a.mejor.s, c = a.mejor.c, qs = a.seqMejor.s, qc = a.seqMejor.c;
      if (a.i === i && kg > a.mejor[lev]) { if (lev === 's') { s = kg; qs = this.seq; } else { c = kg; qc = this.seq; } }
      const total = s && c ? s + c : 0;
      return { a: a.i, id: a.id, s, c, total, seq: total ? Math.max(qs, qc) : -1, qs };
    });
  }
  _orden(filas, lev) {
    return lev === 's'
      ? filas.slice().sort((x, y) => (y.s - x.s) || ((x.s ? x.qs : 0) - (y.s ? y.qs : 0)) || x.a - y.a)
      : filas.slice().sort((x, y) => (y.total - x.total) || (x.seq - y.seq) || (y.s - x.s) || x.a - y.a);
  }
  /** Clasificación: por total (a igual total, quien lo completó primero); durante el arranque, por mejor arranque. `puesto` es null sin marca. */
  tabla() {
    const lev = this.fase === 'c' || this.fase === 'fin' ? 'c' : 's', o = this._orden(this._filas(), lev);
    return o.map((f, k) => { const a = this.at[f.a]; return { ...f, puesto: (lev === 's' ? f.s : f.total) ? k + 1 : null, sinMarca: (a.s.length === 3 && !f.s) || (a.c.length === 3 && !f.c) }; });
  }
  /** Puesto (1 a 3) que tendría el pesista i si ahora hiciera `kg` válidos en `lev` (kg = 0: el que tiene). 4 si queda sin marca. */
  puestoSi(i, lev, kg) {
    const o = this._orden(this._filas(i, lev, kg), lev), k = o.findIndex(f => f.a === i), f = o[k];
    return (lev === 's' ? f.s : f.total) ? k + 1 : 4;
  }
  /** La cuenta: los kilos que hacen falta ahora para quedar primero y para quedar segundo (null si no alcanza ningún peso razonable). */
  cuenta(i) {
    const lev = this.lev, min = this.minimo(i), out = { oro: null, plata: null, lev, min };
    if (lev === 'c' && !this.at[i].mejor.s) return out;
    for (let k = min; k <= KG_MAX && (out.oro === null || out.plata === null); k++) { const p = this.puestoSi(i, lev, k); if (p <= 2 && out.plata === null) out.plata = k; if (p === 1 && out.oro === null) out.oro = k; }
    return out;
  }
  /** Etiquetas del intento (sección 6.5). Con alguna etiqueta, el Temple entra en las ventanas. */
  etiquetas(i, lev, n, kg) {
    const a = this.at[i], et = [], R = EVENTO.records;
    if (kg > R[lev] || (lev === 'c' && a.mejor.s && a.mejor.s + kg > R.t)) et.push('record');
    if (n === 3 && !a.mejor[lev]) et.push('todo_o_nada');
    const antes = this.puestoSi(i, lev, 0), con = this.puestoSi(i, lev, kg);
    if (lev === 'c' && n === 3 && con < antes && con <= 3) et.push(con === 1 ? 'oro' : 'medalla');
    else if (con === 1 && antes !== 1 && this.puestoSi((i + 1) % 3, lev, 0) + this.puestoSi((i + 2) % 3, lev, 0) < 8) et.push('frente');
    return et;
  }

  // ---------- orden y llamados ----------
  _siguiente() {
    const lev = this.lev, cand = this.at.filter(a => a[lev].length < 3);
    if (!cand.length) {
      this.llamado = null;
      if (lev === 's') { this.fase = 'intervalo'; for (const a of this.at) a.resto = Math.min(RESTO.ini, a.resto + RESTO.intervalo); } else this.fase = 'fin';
      return;
    }
    cand.sort((x, y) => (x.decl[lev] - y.decl[lev]) || (x[lev].length - y[lev].length) || (x.ult[lev] - y.ult[lev]) || (x.f.dorsal - y.f.dorsal));
    const a = cand[0], n = a[lev].length + 1, seguido = this.ultimo === a.i, clave = lev + n;
    if (seguido && a.bono !== clave) { a.bono = clave; a.resto = Math.min(RESTO.ini, a.resto + RESTO.seguido); }
    const idx = this.nLlamado++;
    this.llamado = { idx, a: a.i, lev, n, kg: a.decl[lev], kg0: a.decl[lev], reloj: seguido ? RELOJ.seguido : RELOJ.normal, sem: mezclar(this.cfg.semilla, 100 + idx), cambios: [], et: this.etiquetas(a.i, lev, n, a.decl[lev]) };
  }
  /** Contexto del intento del llamado en curso (lo que necesita la máquina del intento). */
  contexto(env) {
    const L = this.llamado, a = this.at[L.a], f = a.f, I = intensidad(L.kg, techoMomento(this.techoDia(L.a, L.lev), a.resto)), persona = a.ctrl === 'persona';
    if (L.lev === 'c' && !['split', 'power', 'squat'].includes(env)) throw new Error('envión inválido');
    return { lev: L.lev, env: L.lev === 'c' ? env : undefined, I, tec: f.attrs.tec, temple: L.et.length ? f.attrs.tem : 0, garra: f.attrs.gar, anclas: a.modelo, semilla: L.sem,
      cal: persona ? this.cfg.cal : 0, primera: persona && this.cfg.primera && L.n === 1, domina: L.lev === 's' || f.enviones.includes(env), jueces: this.jueces, reloj: L.reloj, ctl: persona ? this.cfg.ctl : 'c', ...(persona && this.cfg.tactil ? { tactil: true } : {}) };
  }
  /** ¿Puede el pesista del llamado pedir `kg` en el instante `ms`? Devuelve el motivo si no. */
  cambioValido(ms, kg) {
    const L = this.llamado, a = L && this.at[L.a]; if (!L) return 'no hay llamado';
    if (a.cambios >= 2) return 'ya hizo sus dos cambios';
    if (!Number.isInteger(ms) || ms < 0 || ms > L.reloj - RELOJ.cambiosHasta) return 'los cambios cierran a los 0:15';
    if (L.cambios.length && ms < L.cambios[L.cambios.length - 1][0]) return 'instante fuera de orden';
    if (!Number.isInteger(kg) || kg === L.kg) return 'no cambia nada';
    if (kg < this.minimo(L.a) || kg > KG_MAX) return 'peso fuera de rango';
    return null;
  }
  /** Cambio de kilos del pesista llamado (persona). Si altera el orden, el llamado se cierra como desplazado y sale otro. */
  cambio(ms, kg) {
    const mal = this.cambioValido(ms, kg); if (mal) throw new Error('cambio inválido: ' + mal);
    const L = this.llamado, a = this.at[L.a];
    a.decl[L.lev] = kg; a.cambios++; L.cambios.push([ms, kg]);
    const idx = L.idx; this.nLlamado = idx; this._siguiente();
    if (this.llamado.a !== L.a) { this.reg.llamados.push({ a: L.a, lev: L.lev, n: L.n, kg: L.kg0, cambios: L.cambios, fin: 'desplazado', int: 0 }); this.nLlamado = idx + 2; this.llamado.idx = idx + 1; this.llamado.sem = mezclar(this.cfg.semilla, 100 + idx + 1); return { desplazado: true }; }
    this.llamado.kg0 = L.kg0; this.llamado.cambios = L.cambios; this.llamado.reloj = L.reloj;
    return { desplazado: false };
  }
  /** Cierra el llamado de una persona con lo que tocó: {conf, env, ent}. El resultado se recalcula acá, nunca se recibe. */
  resolver(rec) {
    const L = this.llamado; if (!L || this.at[L.a].ctrl !== 'persona') throw new Error('no es el llamado de una persona');
    const ctx = this.contexto(rec.env), m = simular(ctx, rec.conf ?? null, rec.ent);
    if (!m.res) throw new Error('el intento no terminó');
    this.reg.llamados.push({ a: L.a, lev: L.lev, n: L.n, kg: L.kg0, cambios: L.cambios, fin: 'intento', ...(L.lev === 'c' ? { env: rec.env } : {}), conf: rec.conf ?? null, ent: rec.ent, int: 0 });
    return this._aplicar(ctx, m.res);
  }
  /** Juega el llamado de un rival: genera sus gestos y los pasa por la misma máquina. Devuelve {ctx, conf, ent, res} para mostrarlo. */
  resolverIA() {
    const L = this.llamado; if (!L || this.at[L.a].ctrl !== 'juego') throw new Error('no es el llamado de un rival');
    const a = this.at[L.a]; let env; if (L.lev === 'c') env = elegirEnvion(a.f, this.contexto(a.f.enviones[0]).I);
    const ctx = this.contexto(env), g = gestos(ctx, this.cfg.nivel, L.sem);
    this.reg.llamados.push({ a: L.a, lev: L.lev, n: L.n });
    const llamado = { ...L }; this._aplicar(ctx, g.res);
    return { ctx, conf: g.conf, ent: g.ent, res: g.res, llamado, env };
  }
  _aplicar(ctx, res) {
    const L = this.llamado, a = this.at[L.a], lev = L.lev, valido = res.res === 'valido';
    const costo = RESTO.base[lev] + Math.max(0, idiv(ctx.I - 9500, 100)) * RESTO.sobre95 + Math.min(RESTO.topePelea, res.toques * RESTO.toque + idiv(res.fuera * RESTO.fueraSeg, 120)) + (valido ? 0 : RESTO.nulo) + (lev === 'c' ? RESTO.envion[ctx.env] : 0);
    const gasto = Math.max(0, idiv(costo * multFondo(a.f.attrs.fon), 1000)), seq = this.seq++;
    a.resto = Math.max(0, a.resto - gasto);
    a[lev].push({ kg: L.kg, res: res.res, causa: res.causa, luces: res.luces, seq, env: ctx.env, et: L.et, I: ctx.I, gasto });
    if (valido && L.kg > a.mejor[lev]) { a.mejor[lev] = L.kg; a.seqMejor[lev] = seq; }
    for (const b of this.at) if (b !== a) b.resto = Math.min(RESTO.ini, b.resto + RESTO.ajeno);
    a.ult[lev] = seq; a.cambios = 0; this.ultimo = a.i; this.barra = L.kg;
    // declaración automática: el plan del entrenador
    const n = a[lev].length;
    if (n < 3) {
      const salto = a.ctrl === 'persona' ? PLAN[n - 1] : Math.max(1, a.saltos[lev][n - 1]);
      a.decl[lev] = valido ? L.kg + salto : L.kg + (a.f.ia.estilo === 'orgullo' && a.ctrl === 'juego' && a.sube1[(lev === 'c' ? 2 : 0) + n - 1] ? 1 : 0);
      if (a.ctrl === 'juego') { const k = decidir(this, a.i); if (k !== null) a.decl[lev] = k; }
    }
    // cambios de los rivales, al cierre de cada intento ajeno
    const avisos = [];
    for (const b of this.at) if (b !== a && b.ctrl === 'juego' && b[lev].length < 3 && b.cambios < 2) {
      const k = decidir(this, b.i); if (k !== null && k >= this.minimo(b.i)) { avisos.push({ a: b.i, de: b.decl[lev], a_kg: k }); b.decl[lev] = k; b.cambios++; }
    }
    this._siguiente();
    return { res, gasto, avisos, intento: a[lev][n - 1] };
  }
}
