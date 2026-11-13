// Entrada del levantamiento sin navegador (docs/JUEGO.md G2.2, G2.3 y meta H): un DOM mínimo de mentira alrededor de la
// clase Boton de verdad (web/js/game/input.js), conectada al núcleo como lo hace main.js en 'u' (tocar() y QUE_U). Lo usan
// tools/teclado_test.mjs y tools/dedo_test.mjs para mandar miles de secuencias de teclas y dedos sin abrir Chrome.
//
// Eventos: se despachan como en el navegador, primero los oyentes de captura de window (en orden de registro, cortados por
// stopImmediatePropagation) y después los de burbuja. Los punteros entran por la zona (pointerdown) y salen por window.
import { setTimeout as esperaReal } from 'node:timers';

/** Instala el DOM de mentira en globalThis. Devuelve el control del reloj de los temporizadores (gracia del dedo). */
export function instalarDOM({ ancho = 844, alto = 390 } = {}) {
  const oyentes = { window: [], document: [] };
  const timers = []; let ahora = 0, nTimer = 0;
  const reg = lista => (tipo, fn, cap = false) => { lista.push({ tipo, fn, cap: cap === true || !!cap?.capture }); };
  globalThis.addEventListener = reg(oyentes.window);
  globalThis.removeEventListener = (tipo, fn) => { const i = oyentes.window.findIndex(o => o.tipo === tipo && o.fn === fn); if (i >= 0) oyentes.window.splice(i, 1); };
  globalThis.innerWidth = ancho; globalThis.innerHeight = alto;
  globalThis.document = { visibilityState: 'visible', activeElement: null, addEventListener: reg(oyentes.document), hasFocus: () => true };
  try { Object.defineProperty(globalThis, 'navigator', { value: { vibraciones: 0, vibrate() { this.vibraciones++; return true; } }, configurable: true, writable: true }); } catch { globalThis.navigator.vibrate = () => true; }
  // temporizadores en el reloj de la prueba (la gracia de 400 ms del dedo cancelado)
  globalThis.setTimeout = (fn, ms) => { const id = ++nTimer; timers.push({ id, t: ahora + (ms || 0), fn }); return id; };
  globalThis.clearTimeout = id => { const i = timers.findIndex(x => x.id === id); if (i >= 0) timers.splice(i, 1); };
  const el = (tag = 'DIV', extra = {}) => ({ nodeType: 1, tagName: tag, isContentEditable: false, type: extra.type, oyentes: [], addEventListener(tipo, fn) { this.oyentes.push({ tipo, fn }); }, closest(sel) { return sel.split(',').some(s => s.trim().toUpperCase() === this.tagName) ? this : null; }, ...extra });
  const despachar = (e, destino = null) => {
    e.defaultPrevented = false; e.parado = false;
    e.preventDefault = () => { e.defaultPrevented = true; }; e.stopImmediatePropagation = () => { e.parado = true; }; e.stopPropagation = () => { e.parado = true; };
    for (const o of oyentes.window.filter(o => o.cap && o.tipo === e.type)) { o.fn(e); if (e.parado) return e; }
    if (destino) for (const o of destino.oyentes.filter(o => o.tipo === e.type)) { o.fn(e); if (e.parado) return e; }
    for (const o of oyentes.window.filter(o => !o.cap && o.tipo === e.type)) { o.fn(e); if (e.parado) return e; }
    if (e.type === 'visibilitychange') for (const o of oyentes.document.filter(o => o.tipo === e.type)) o.fn(e);
    return e;
  };
  return {
    el, despachar,
    /** Lleva el reloj de los temporizadores a t (ms) y corre los que vencieron. */
    hasta(t) { ahora = t; for (;;) { timers.sort((a, b) => a.t - b.t); const x = timers[0]; if (!x || x.t > t) break; timers.shift(); x.fn(); } },
    get ahora() { return ahora; },
    restaurar() { globalThis.setTimeout = esperaReal; },
  };
}

/**
 * Meta H (G2.9): `n` secuencias al azar de teclado (`via: 'teclado'`) o de dedos (`via: 'dedo'`) sobre intentos de 'u'
 * enteros, por la clase Boton de verdad. Casos que se mezclan: repetición del teclado, keyup perdido, primer evento que ya
 * es repetición (el foco llegó con la tecla apretada), foco en un botón, blur de la ventana, Enter, dos dedos a menos de
 * 80 ms, pointercancel (con y sin dedo que vuelve), doble toque a 100 ms, mantener 10 s, toques en los bordes y la ráfaga
 * de la confirmación. Devuelve los conteos y ejemplos de lo que salió mal.
 */
export async function probarEntrada({ via = 'teclado', n = 10000, semilla = 1 } = {}) {
  const dedo = via === 'dedo', W = dedo ? 844 : 1280, Hh = dedo ? 390 : 720;
  const H = instalarDOM({ ancho: W, alto: Hh }); globalThis.document.documentElement = {}; globalThis.document.title = '';
  const { Boton, toques, reloj, BORDES, GRACIA_MS } = await import('../web/js/game/input.js');
  const { tocar, QUE_U } = await import('../web/js/game/controles.js');
  const { simular } = await import('../web/js/sim/attempt.js');
  const { Azar, mezclar } = await import('../web/js/sim/fixed.js');
  const { ctxUno, ATL } = await import('./uno_bots.mjs');
  const zona = H.el('DIV'), boton = H.el('BUTTON'), cuerpo = H.el('DIV');
  const b = new Boton([zona]); b.intento = true; b.tolerante = true;
  const tomados = []; toques.alCambiar = (T, que) => { if (que === 'baja' && T) tomados.push(T); };
  const MOTIVOS_NO = new Set(['termino', 'pausa', 'mouse', 'sobra', 'espera']);
  const R = { secuencias: 0, pulsaciones: 0, sinResolver: 0, dobles: 0, sinPalabra: 0, bordesQueCuentan: 0, rafagaTira: 0, malFormadas: 0, sinTerminar: 0, casos: {}, ejemplos: [] };
  const anota = (k, txt) => { R[k]++; if (R.ejemplos.length < 6) R.ejemplos.push(`${k}: ${txt}`); };
  let base = 1000;
  for (let k = 0; k < n; k++) {
    const r = new Azar(mezclar(semilla, k, dedo ? 2 : 1)), id = ATL[k % 3], lev = k % 2 ? 'c' : 's';
    const ctx = ctxUno(id, lev, lev === 'c' ? 'split' : undefined, 8800 + r.ent(1500), mezclar(k, 3), dedo ? { tactil: true } : {});
    const ent = [], conf = 0, t0 = base; base += 200000;
    b.contactos.clear(); for (const g of b.gracia.values()) clearTimeout(g); b.gracia.clear(); b.activo = true; tomados.length = 0;
    b.oye = (t, v, v2) => {
      if (v2 === 'mouse') { if (v) toques.resolver(false, 'mouse'); return; }
      const x = tocar(ctx, conf, ent, Math.max(0, Math.round(t - t0)), v, 'u'); if (!v) return;
      if (!x.n) toques.resolver(false, x.motivo); else toques.resolver(true, x.que || 'gesto');
    };
    // ---- la secuencia: eventos [t, tipo, datos] en ms desde la confirmación
    // una tecla (o un dedo) no se puede apretar dos veces a la vez: cada pulsación empieza después de que se soltó la anterior
    const evs = [], fisicas = { presiones: 0, bordes: 0 }, usados = new Set(), suelta = {};
    const caso = c => { usados.add(c); };
    const tecla = (t, dur, o = {}) => {
      const code = o.enter ? 'Enter' : 'Space'; fisicas.presiones++; t = Math.max(t, (suelta[code] ?? -1e9) + 20); suelta[code] = o.pierdeKeyup ? -1e9 : t + dur;
      evs.push([t, 'keydown', { code, key: o.enter ? 'Enter' : ' ', repeat: !!o.repite, target: o.target || cuerpo }]);
      for (let x = t + 500; x < t + dur; x += 33) evs.push([x, 'keydown', { code, key: o.enter ? 'Enter' : ' ', repeat: true, target: o.target || cuerpo }]);
      if (!o.pierdeKeyup) evs.push([t + dur, 'keyup', { code, key: o.enter ? 'Enter' : ' ', target: o.target || cuerpo }]);
    };
    const toqueDedo = (t, dur, o = {}) => {
      const pid = o.id ?? 1 + r.ent(5), borde = !!o.borde; t = Math.max(t, (suelta[pid] ?? -1e9) + 20); suelta[pid] = t + dur + (o.cancela ? GRACIA_MS + 600 : 0);
      const x = borde ? (r.ent(2) ? r.ent(BORDES.lado) : W - 1 - r.ent(BORDES.lado)) : BORDES.lado + 10 + r.ent(W - 2 * BORDES.lado - 20);
      const y = borde && r.ent(2) ? r.ent(BORDES.arriba) : borde ? Hh - 1 - r.ent(BORDES.abajo) : BORDES.arriba + 10 + r.ent(Hh - BORDES.arriba - BORDES.abajo - 20);
      if (borde) fisicas.bordes++; else fisicas.presiones++;
      evs.push([t, 'pointerdown', { pointerId: pid, pointerType: 'touch', clientX: x, clientY: y, target: zona, button: 0 }]);
      if (o.cancela) { evs.push([t + dur, 'pointercancel', { pointerId: pid, pointerType: 'touch' }]); if (o.vuelve) evs.push([t + dur + 100 + r.ent(GRACIA_MS), 'pointerup', { pointerId: pid, pointerType: 'touch' }]); }
      else evs.push([t + dur, 'pointerup', { pointerId: pid, pointerType: 'touch' }]);
    };
    const pulsa = dedo ? toqueDedo : tecla;
    // la ráfaga de la confirmación (el toque que confirmó y uno pegado) a veces sigue
    if (r.ent(3) === 0) { caso('rafaga'); pulsa(10 + r.ent(120), 40); pulsa(150 + r.ent(140), 40); }
    let t = 400 + r.ent(1500);
    for (let i = 0; i < 6 + r.ent(14) && t < 40000; i++) {
      const q = r.ent(dedo ? 9 : 10);
      if (q === 0) { caso('mantener'); pulsa(t, 10000); t += 10000 + r.ent(500); }
      else if (q === 1) { caso('doble'); pulsa(t, 50); pulsa(t + 100, 50); t += 300; }
      else if (!dedo && q === 2) { caso('keyup_perdido'); tecla(t, 60, { pierdeKeyup: true }); t += 200 + r.ent(900); }
      else if (!dedo && q === 3) { caso('primer_repeat'); tecla(t, 300, { repite: true }); t += 400 + r.ent(600); }
      else if (!dedo && q === 4) { caso('foco_en_boton'); tecla(t, 60, { target: boton }); t += 200 + r.ent(700); }
      else if (!dedo && q === 5) { caso('blur'); tecla(t, 450); evs.push([t + 300, 'blur', {}]); t += 700; }      // sin foco no llegan teclas: el keyup después del blur no encuentra nada
      else if (!dedo && q === 6) { caso('enter'); tecla(t, 70, { enter: true }); t += 250 + r.ent(800); }
      else if (dedo && q === 2) { caso('dos_dedos'); toqueDedo(t, 60, { id: 1 }); toqueDedo(t + r.ent(80), 60, { id: 2 }); t += 300 + r.ent(600); }
      else if (dedo && q === 3) { caso('cancel'); toqueDedo(t, 60 + r.ent(200), { cancela: true, vuelve: r.ent(2) === 0, id: 3 }); t += 900 + r.ent(600); }
      else if (dedo && q === 4) { caso('borde'); toqueDedo(t, 60, { borde: true, id: 4 }); t += 150 + r.ent(500); }
      else if (dedo && q === 5) { caso('machaca'); for (let j = 0; j < 8; j++) toqueDedo(t + j * 125, 40, { id: 1 }); t += 1200; }
      else { caso('toque'); pulsa(t, 40 + r.ent(120)); t += 150 + r.ent(1600); }
    }
    for (const c of usados) R.casos[c] = (R.casos[c] || 0) + 1;
    evs.sort((a, b2) => a[0] - b2[0]);
    for (const [te, tipo, d] of evs) {
      reloj.manual = t0 + te; H.hasta(te); reloj.manual = null;
      const e = { type: tipo, timeStamp: t0 + te, ctrlKey: false, metaKey: false, altKey: false, ...d };
      H.despachar(e, tipo === 'pointerdown' ? d.target : null);
    }
    reloj.manual = t0 + t + 1000; H.hasta(t + 1000); reloj.manual = null;
    // ---- verificaciones
    R.secuencias++; R.pulsaciones += fisicas.presiones + fisicas.bordes;
    const m = simular(ctx, conf, ent);
    if (!m.res) anota('sinTerminar', `secuencia ${k}: el intento no terminó`);
    { let nn = 0, prev = 0; for (const e of ent) { if (e[0] < prev) { anota('malFormadas', `secuencia ${k}: fuera de orden`); break; } prev = e[0]; nn += e[1] ? 1 : -1; if (nn < 0) { anota('malFormadas', `secuencia ${k}: se levanta un contacto que no estaba apoyado`); break; } } }
    const sinRes = tomados.filter(T => T.ok === null); if (sinRes.length) anota('sinResolver', `secuencia ${k}: ${sinRes.length} sin resolver (${sinRes[0].via})`);
    // una pulsación física, un registro y como mucho un contacto para el núcleo
    const bajas = ent.filter(e => e[1]).length, aceptadas = tomados.filter(T => T.ok).length;
    if (tomados.length > fisicas.presiones + fisicas.bordes || bajas !== aceptadas) anota('dobles', `secuencia ${k}: ${fisicas.presiones} pulsaciones, ${tomados.length} anotadas, ${aceptadas} aceptadas, ${bajas} contactos al núcleo`);
    for (const T of tomados) if (T.ok !== null && !(T.ok ? QUE_U[T.motivo] : MOTIVOS_NO.has(T.motivo))) anota('sinPalabra', `secuencia ${k}: «${T.motivo}» (${T.ok ? 'aceptado' : 'descartado'}) sin palabra`);
    // los toques en el borde también se anotan y se resuelven (Gameplay 2.1): ninguno se pierde sin acuse
    if (dedo && tomados.length !== fisicas.presiones + fisicas.bordes) anota('bordesQueCuentan', `secuencia ${k}: ${fisicas.bordes} toques en el borde y ${fisicas.presiones} fuera, ${tomados.length} anotados`);
    if (m.U && m.U.contactos.some(c => c.que === 'tira' && c.t < 300)) anota('rafagaTira', `secuencia ${k}: la ráfaga de la confirmación arrancó el tirón`);
  }
  H.restaurar();
  return R;
}

/**
 * Clásico no cambia con la gracia del dedo (revisión de Gameplay 2.1): en Clásico soltar es un gesto (¡SUELTA!), así que un
 * puntero que el sistema cancela se levanta en el acto; la gracia de 400 ms es solo de 'u' (`tolerante`). Devuelve
 * {clasico, uno}: a cuántos ms del cancel le llegó el «soltar» a quien escucha en cada nivel (null: no llegó).
 */
export async function probarCancelClasico() {
  const H = instalarDOM({}); globalThis.document.documentElement = {}; globalThis.document.title = '';
  const { Boton, reloj, GRACIA_MS } = await import('../web/js/game/input.js');
  const out = {};
  for (const [nivel, tolerante] of [['clasico', false], ['uno', true]]) {
    const zona = H.el('DIV'), b = new Boton([zona]); b.intento = true; b.tolerante = tolerante; let sube = null;
    b.oye = (t, v) => { if (!v && sube === null) sube = t; };
    const t0 = 5000 + (tolerante ? 10000 : 0);
    reloj.manual = t0; H.hasta(t0); H.despachar({ type: 'pointerdown', timeStamp: t0, pointerId: 9, pointerType: 'touch', clientX: 300, clientY: 200, target: zona, button: 0 }, zona);
    reloj.manual = t0 + 100; H.hasta(t0 + 100); H.despachar({ type: 'pointercancel', timeStamp: t0 + 100, pointerId: 9, pointerType: 'touch' });
    reloj.manual = t0 + 100 + GRACIA_MS + 50; H.hasta(t0 + 100 + GRACIA_MS + 50);
    out[nivel] = sube === null ? null : sube - (t0 + 100); reloj.manual = null;
  }
  H.restaurar(); return out;
}
