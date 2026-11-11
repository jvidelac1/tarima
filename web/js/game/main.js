// Juego Tarima: final de tres pesistas (docs/JUEGO.md). Entrada de juego.html: carga, flujo de la partida y bucle.
// El resultado lo calcula el núcleo (web/js/sim/), que es una función pura de lo que el jugador tocó; acá se dibuja.
// Etapa 1: sin animaciones ni modelos nuevos. Lo que no está animado se resuelve con cortes y con texto (sección 11.2).
import { reloj, Boton } from './input.js';
import { Escena } from './stage.js';
import { poseDe, poseParado, marcas } from './sequence.js';
import { PLANTEL, ENVIONES, LEV, ETIQUETAS, GUIONES } from './roster.js';
import { Registrador, calidadInicial } from './perf.js';
import { sonido } from './audio.js';
import { Ayudas } from './ui/ayudas.js';
import { tableroHTML } from './ui/tablero.js';
import { leerDatos } from '../sim/data.js';
import { Partida } from '../sim/match.js';
import { simular } from '../sim/attempt.js';
import { recalcular, resumen } from '../sim/replay.js';
import { CAUSAS, EVENTO, KG_MAX, RELOJ, PLAN, exigenciaTabla } from '../sim/rules.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const guardado = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
const tactil = () => matchMedia('(pointer:coarse)').matches;
const DIBUJA = params.get('dibujo') !== '0';
const IDS = ['ventura', 'brenner', 'marangi'];

const E = { pantalla: 'carga', visitados: [], intento: null, p: null, yo: 0, cfg: null, monitor: { barraMin: 9, manosMax: 0, cuadros: 0 }, errores: [], modo: 'panel', ultDibujo: 0 };
const perf = new Registrador();
let escena = null, datos = null, ayudas = null, boton = null, enCuadro = null;
const visita = n => { E.pantalla = n; if (!E.visitados.includes(n)) E.visitados.push(n); perf.marcar(n); };

// ---------- tiempo del juego: esperas sobre el reloj inyectable ----------
const pend = [];
const espera = ms => new Promise(res => pend.push({ t: reloj.ahora() + ms, res }));
/** Espera que se puede saltear con un toque (después de 400 ms, para que el toque de saltear no elija nada por accidente). */
function saltable(ms) {
  return new Promise(res => {
    const t0 = reloj.ahora(), fin = () => { if (boton.oye === oye) boton.oye = null; res(); }, oye = (t, v) => { if (v && t - t0 >= 400) fin(); };
    boton.oye = oye; pend.push({ t: t0 + ms, res: fin });
  });
}
let ultimo = 0;
function tic(pintar) {
  const now = reloj.ahora(), dt = Math.min(.25, Math.max(0, (now - ultimo) / 1000)); ultimo = now;
  for (let i = pend.length - 1; i >= 0; i--) if (pend[i].t <= now) pend.splice(i, 1)[0].res();
  try { enCuadro?.(now, dt); } catch (e) { E.errores.push(String(e.stack || e)); console.error(e); enCuadro = null; }
  if (!escena) return;
  // durante el intento propio se dibuja cada cuadro; detrás de un panel la imagen queda congelada; en el resto, tope de 30
  const dib = pintar && DIBUJA && (E.modo === 'intento' || (E.modo !== 'panel' && now - E.ultDibujo >= 30) || E.forzar);
  escena.cuadro(dt, dib); if (dib) { perf.cuadro(now - E.ultDibujo); E.ultDibujo = now; E.forzar = false; }
}
function bucle() { requestAnimationFrame(bucle); if (reloj.manual === null) tic(true); }

// ---------- gráfica ----------
const capa = { poner(html, clase = '') { $('capa').innerHTML = `<div class="panel ${clase}">${html}</div>`; E.modo = 'panel'; E.forzar = true; document.activeElement?.blur?.(); return $('capa').firstChild; }, quitar() { $('capa').innerHTML = ''; if (E.modo === 'panel') E.modo = 'tv'; } };
/** Los botones de un panel quedan bloqueados 400 ms. */
function bloquear(panel) { const bs = [...panel.querySelectorAll('button')].filter(b => !b.disabled); bs.forEach(b => { b.disabled = true; }); espera(400).then(() => bs.forEach(b => { if (b.isConnected) b.disabled = false; })); }
const clic = (panel, sel) => new Promise(res => panel.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { sonido.activar(); res(b); })));
function setReloj(ms) { const s = Math.max(0, Math.ceil(ms / 1000)), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if ($('reloj').textContent !== txt) { $('reloj').textContent = txt; $('reloj').classList.toggle('aviso', s <= 10); escena?.arena.setClock(s); } }
function setLuces(d) { [...$('luces').children].forEach((el, i) => { el.className = d && d[i] !== null && d[i] !== undefined ? (d[i] ? 'b' : 'r') : ''; }); escena?.arena.setDecision(d ? [0, 1, 2].map(i => d[i] ?? null) : null); }
function zocalo(a, L) {
  if (!a) { $('zocalo').hidden = true; return; } const P = PLANTEL[a.id];
  $('zocalo').hidden = false; $('z-bandera').style.background = P.bandera; $('z-codigo').textContent = a.f.codigo; $('z-dorsal').textContent = 'Dorsal ' + a.f.dorsal; $('z-nombre').textContent = a.f.nombre;
  $('z-lev').textContent = LEV[L.lev]; $('z-intento').textContent = L.n ? `Intento ${L.n}` : 'Práctica'; $('z-kg').textContent = L.kg;
  escena.arena.setBoard({ name: a.f.nombre, country: a.f.codigo, kg: L.kg, attempt: L.n || 1, lift: LEV[L.lev] });
}
const cartel = (txt, clase = '') => { $('cartel').hidden = !txt; $('cartel').textContent = txt || ''; $('cartel').className = 'cartel ' + clase; };
const veredicto = (txt, sub, mal) => { $('veredicto').hidden = !txt; $('veredicto').innerHTML = txt ? `${txt}${sub ? `<small>${sub}</small>` : ''}` : ''; $('veredicto').className = 'veredicto' + (mal ? ' mal' : ''); };
const etiqueta = et => { $('etiqueta').hidden = !et?.length; $('etiqueta').textContent = (et || []).map(e => ETIQUETAS[e]).join(' · '); };
function recuadro(txt, id) { $('rival').hidden = !txt; if (txt) $('rival').innerHTML = `<i style="background:${PLANTEL[id].bandera}"></i><span>${txt}</span>`; }
const camPrincipal = () => (escena.vertical ? 'lado' : '3/4');
const PALABRAS = { perfecto: 'PERFECTO', bien: 'BIEN', temprano: 'TEMPRANO', tarde: 'TARDE' };
const TENS = { perfecta: 'TENSIÓN PERFECTA', buena: 'BUENA TENSIÓN', floja: 'TENSIÓN FLOJA' };

// ---------- el intento en vivo ----------
/**
 * Corre un intento en pantalla. Con `gestos` ({conf, ent}) reproduce el de un rival; sin ellos, lee el botón.
 * El estado que se dibuja sale de recalcular la lista de entradas hasta ahora: lo mostrado nunca contradice al núcleo.
 * @returns {Promise<{conf:number|null, ent:number[][], res:object, grab:object[]}>}
 */
function correrIntento(ctx, { a, lev, env, gestos = null, conf0 = null, t0 = reloj.ahora(), panelAbierto = null }) {
  return new Promise(resolver => {
    const P = escena.P, ent = gestos ? gestos.ent : [], propio = !gestos, grab = [], mk = marcas(P, lev, env);
    let conf = gestos ? gestos.conf : conf0, visto = { gestos: 0, fase: '', toques: 0, mov: 0, tens: null }, pal = null, palT = 0, fin = false, chic = false, camFija = false;
    const tv0 = gestos ? Math.max(0, gestos.conf - 500) : 0;
    E.intento = { ctx, t0, propio, m: null, confirmar: t => { if (conf === null) conf = Math.round(t - t0); } };
    if (propio) boton.oye = (t, v) => { const x = Math.round(t - t0), u = ent.length ? ent[ent.length - 1][0] : 0; ent.push([Math.max(x, u, 0), v]); $('zona').classList.toggle('on', boton.apretado); };
    E.modo = propio ? 'intento' : 'tv'; if (panelAbierto) E.modo = 'panel';
    enCuadro = (ahora, dt) => {
      const now = Math.round(ahora - t0) + tv0, m = simular(ctx, conf, ent, now), M = m.M; E.intento.m = m; E.intento.now = now;
      if (ctx.reloj) setReloj(m.rodilla ? Math.max(0, ctx.reloj - (m.movs[0]?.tk ?? now)) : ctx.reloj - now);
      if (E.modo === 'panel' && conf !== null) E.modo = propio ? 'intento' : 'tv';
      // pose y barra
      const pose = m.res && m.res.res === 'fallo' ? null : poseDe(m, Math.min(now, m.res ? m.res.t : now), P), p = M?.pelea, T = p ? p.T / 1e6 : m.temblor / 1e6;
      if (pose) { escena.posar(pose, lev, dt, m.fase === 'pelea' || m.fase === 'traba' || m.fase === 'fijacion' ? T : 0, ahora / 1000); grab.push({ t: now, pose, y: escena.barY, z: escena.barZ }); }
      if (pose && m.tConf && !m.res) { const mon = E.monitor; mon.cuadros++; mon.barraMin = Math.min(mon.barraMin, escena.barY); if (escena.barY > .26) mon.manosMax = Math.max(mon.manosMax, escena.manosBarra()); }
      // cámara: nunca hay corte con una ventana abierta
      if (m.fase !== visto.fase) {
        if (m.fase === 'acomodo') escena.camara(camPrincipal());
        if (m.fase === 'fijacion' && m.trabaMs < 0 && !camFija) { escena.primerPlano('arriba'); camFija = true; }
        if (m.fase === 'tiron' || m.fase === 'flexion') sonido.despegue();
        visto.fase = m.fase;
      }
      // palabra del gesto y sonidos
      if (M && M.grado && visto.tens !== M.tp) { visto.tens = M.tp; pal = { txt: TENS[M.grado], mal: M.grado === 'floja' }; palT = ahora; }
      if (m.gestos.length > visto.gestos) {
        const g = m.gestos[m.gestos.length - 1]; visto.gestos = m.gestos.length;
        pal = { txt: PALABRAS[g.pal] + (g.pal === 'bien' ? ` ${g.e > 0 ? '+' : '−'}${Math.abs(g.e)} ms` : ''), mal: g.pal === 'temprano' || g.pal === 'tarde' }; palT = ahora;
        if (g.g === 'explosion') sonido.explosion(g.pal === 'perfecto');
      }
      if (M && M.tc && now >= M.tc && visto.rec !== M.tc) { visto.rec = M.tc; sonido.recepcion(); }
      if (m.toques > visto.toques) { visto.toques = m.toques; if (propio) sonido.toque(); }
      const f = m.fij; if (f && f.firme && now >= f.tb && !chic) { chic = true; sonido.chicharra(); }
      cartel(m.res ? '' : f ? (f.firme && now >= f.tb ? '¡ABAJO!' : '¡AGUANTÁ!') : m.fase === 'hombros' && propio ? 'ENVIÓN: ' + ENVIONES[env].toUpperCase() : '', f && f.firme && now >= f.tb ? 'abajo' : '');
      // ayudas pegadas a la barra
      if (DIBUJA && E.modo !== 'panel') {
        const A = { bar: escena.pantalla() };
        if ((m.fase === 'tension' || m.fase === 'hombros') && now >= M.ign) A.anillo = (((now - ctx.cal - M.t0) % m.per) + m.per) % m.per / m.per;
        if (m.fase === 'tiron' || m.fase === 'tension') { A.linea = escena.pantalla(escena.alturaMuestra(mk.potencia)); if (M.tp && m.fase === 'tiron') A.lineaLejos = Math.abs(M.tx - now) / Math.max(1, M.tx - M.tp); }
        if (m.fase === 'flexion' || m.fase === 'hombros') { A.linea = escena.pantalla(escena.alturaMuestra(mk.flexion)); if (m.fase === 'flexion') A.lineaLejos = Math.abs(M.tx - now) / Math.max(1, M.tx - M.tp); }
        if ((m.fase === 'vuelo' || m.fase === 'empuje') && !M.tq) A.rec = (M.tc - now) / (M.tc - M.tr);
        if (pal) A.palabra = { ...pal, edad: (ahora - palT) / 1000 };
        if (p && (m.fase === 'pelea' || m.fase === 'traba')) A.pelea = { modo: p.modo, aguja: p.aguja, exi: p.exiAhora, franja: 100, P: p.P / 1e6, T: p.T / 1e6, L: p.L === null ? null : p.L / 1e6 };
        ayudas.dibujar(A);
      }
      // el cierre se demora un cuadro largo: una entrada con fecha anterior todavía puede llegar
      if (m.res && !fin && now >= m.res.t + (propio ? 80 : 0)) {
        fin = true; enCuadro = null; if (propio) boton.oye = null; $('zona').classList.remove('on'); cartel(''); ayudas.limpiar(); E.intento = null;
        resolver({ conf, ent, res: m.res, grab, m });
      }
    };
  });
}

/** Luces de a una, veredicto con la causa y corte. Tras un fallo el pesista vuelve en `Parado` con la barra en la tarima. */
async function decision(a, lev, res, et, propio) {
  visita('decision'); E.modo = 'tv'; const lento = et?.some(e => e === 'oro' || e === 'medalla' || e === 'todo_o_nada');
  if (res.res === 'fallo') { sonido.fallo(); escena.posar(poseParado(escena.P, lev), lev); }
  else await espera(propio ? 900 : 400);
  escena.camara('rev'); const d = [null, null, null];
  for (let i = 0; i < 3; i++) { await espera(lento ? 800 : 400); d[i] = res.luces[i]; setLuces(d); sonido.luz(d[i]); }
  const b = res.luces.filter(Boolean).length, ok = res.res === 'valido';
  veredicto(ok ? 'Levantamiento válido' : res.res === 'nulo' ? 'Levantamiento nulo' : 'Intento fallado', (res.causa ? CAUSAS[res.causa] + ' · ' : '') + `${b} a ${3 - b}`, !ok);
  sonido.ovacion(ok);
  if (res.res !== 'fallo') escena.posar(poseParado(escena.P, lev), lev);
  await saltable(propio ? 2200 : 1400); veredicto(''); setLuces(null);
}

/** Repetición lateral a un cuarto de velocidad de lo que se dibujó (no del clip fijo), con la traza de la barra. */
async function repeticion(lev, r) {
  const M = r.m.movs[r.m.movs.length - 1]; if (!M || !M.tr || !r.grab.length) return;
  const de = M.tr - 500, a = Math.min(r.res.t, (M.tc || M.tr) + 700), cuadros = r.grab.filter(g => g.t >= de && g.t <= a); if (cuadros.length < 4) return;
  visita('repeticion'); E.modo = 'intento'; escena.camara('lado'); escena.trace.buildPoints(cuadros.map(g => ({ y: g.y, z: g.z })), 1.16); escena.trace.group.visible = true;
  veredicto('Repetición', r.res.causa ? CAUSAS[r.res.causa] : 'cámara lenta', r.res.res !== 'valido'); $('veredicto').classList.add('arriba');
  const t0 = reloj.ahora(); let listo = false; const corte = saltable((a - de) * 4 + 300).then(() => { listo = true; });
  enCuadro = ahora => { const t = de + (ahora - t0) / 4; let k = 0; while (k + 1 < cuadros.length && cuadros[k + 1].t <= t) k++; escena.posar(cuadros[k].pose, lev); escena.trace.setCount(k); };
  await corte; enCuadro = null; if (!listo) return; escena.trace.group.visible = false; veredicto(''); escena.posar(poseParado(escena.P, lev), lev); E.modo = 'tv';
}

// ---------- pantallas ----------
async function inicio() {
  visita('inicio'); zocalo(null); const primera = !guardado.get('tarima.jugadas'), cfg = { id: guardado.get('tarima.pesista') || 'ventura', nivel: guardado.get('tarima.nivel') || 'amistoso', ritmo: params.get('ritmo') === 'completa' ? 'completa' : 'expres' };
  if (!IDS.includes(cfg.id)) cfg.id = 'ventura';
  for (;;) {
    const pn = capa.poner(`<h1>${EVENTO.titulo}</h1><p>${EVENTO.sesion} · tres pesistas, tres intentos de arranque y tres de dos tiempos. Gana el mejor total.</p>
      <p><b>Un solo botón</b> (${tactil() ? 'tocá la parte de abajo de la pantalla' : 'barra espaciadora o clic'}): apretá para despegar, soltá para explotar, apretá para recibir, aguantá apretado y soltá cuando suene la chicharra. Si la barra se traba, peleala tocando repetido.</p>
      <h2>Elegí tu pesista</h2><div class="pesistas">${IDS.map(id => { const f = datos.atletas[id], P = PLANTEL[id]; return `<button class="pesista" data-id="${id}" aria-pressed="${id === cfg.id}"><div class="b" style="background:${P.bandera}"></div><b>${f.nombre}</b><small>${f.pais} · dorsal ${f.dorsal}<br>${P.bio} · ${P.lema}<br>Techo ${f.techo.s} / ${f.techo.c} · ${f.enviones.map(e => ENVIONES[e]).join(' y ')}<br>${P.juego}</small></button>`; }).join('')}</div>
      <div class="fila"><span>Rivales:</span>${['amistoso', 'normal', 'dificil'].map(n => `<button class="nivel" data-n="${n}" aria-pressed="${n === cfg.nivel}">${n === 'dificil' ? 'Difícil' : n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div>
      <div class="fila"><span>Final:</span><button class="ritmo" data-r="expres" aria-pressed="${cfg.ritmo === 'expres'}">Exprés</button><button class="ritmo" data-r="completa" aria-pressed="${cfg.ritmo === 'completa'}">Completa</button></div>
      <div class="fila"><button class="ir" id="btn-empezar">Empezar</button><button id="btn-sin-cal">Empezar sin calentamiento</button></div>`);
    const b = await clic(pn, 'button');
    if (b.dataset.id) cfg.id = b.dataset.id; else if (b.dataset.n) cfg.nivel = b.dataset.n; else if (b.dataset.r) cfg.ritmo = b.dataset.r;
    else { cfg.calentar = b.id === 'btn-empezar'; cfg.primera = primera; break; }
  }
  guardado.set('tarima.pesista', cfg.id); guardado.set('tarima.nivel', cfg.nivel); capa.quitar(); return cfg;
}

/** Metrónomo de 8 toques: la mediana del atraso propone la corrección (0 a 100 ms), que queda fija para toda la partida. */
async function metronomo() {
  visita('metronomo'); const defecto = tactil() ? 40 : 0, PULSO = 700, N = 8;
  const pn = capa.poner(`<h2>Calentamiento · ritmo</h2><p>Tocá el botón junto con cada pulso (${N} toques). Sirve para medir el atraso de tu dispositivo.</p><div class="pulso" id="pulso">${N}</div><div class="fila"><button id="btn-saltear">Saltear</button></div>`, 'chico');
  bloquear(pn); const t0 = E.metro = reloj.ahora() + 1200, errs = []; let salto = false, k = -1;
  clic(pn, '#btn-saltear').then(() => { salto = true; });
  boton.oye = (t, v) => { if (!v) return; const x = t - t0, i = Math.round(x / PULSO); if (i >= 0 && i < N) errs[i] = x - i * PULSO; };
  await new Promise(res => { enCuadro = ahora => { const x = ahora - t0, i = Math.floor(x / PULSO); if (i > k && i >= 0 && i < N) { k = i; sonido.tic(); $('pulso').textContent = N - i - 1 || '✓'; } $('pulso')?.classList.toggle('on', x >= 0 && x % PULSO < 140); if (salto || x > N * PULSO + 300) { enCuadro = null; res(); } }; });
  boton.oye = null; const e = errs.filter(x => x !== undefined).sort((a, b) => a - b);
  if (salto || e.length < 5) { capa.quitar(); return defecto; }
  const med = Math.round(Math.max(0, Math.min(100, e[e.length >> 1])));
  const p2 = capa.poner(`<h2>Atraso medido: ${med} ms</h2><p>La corrección queda fija para toda la partida. Solo se usa al medir tus gestos con ventana.</p><div class="fila"><button class="ir" id="cal-si" data-v="${med}">Usar ${med} ms</button><button id="cal-no" data-v="${defecto}">Dejar ${defecto} ms</button></div>`, 'chico');
  bloquear(p2); const b = await clic(p2, 'button'); capa.quitar(); return +b.dataset.v;
}

/** Tres levantamientos de práctica, sin costo: dos livianos y uno pesado guionado que enseña la pelea y la chicharra. */
async function practica(cfg) {
  const f = datos.atletas[cfg.id], a = { id: cfg.id, f }, errs = [];
  const casos = [{ lev: 's', I: 8000, txt: 'Arranque liviano: apretá con el anillo lleno, soltá cuando la barra llega a la línea, apretá cuando el anillo se cierra y aguantá hasta ¡ABAJO!' },
    { lev: 'c', env: f.enviones[0], I: 8000, txt: `Dos tiempos liviano: lo mismo, y con la barra en los hombros otra vez apretar, soltar en el fondo de la flexión y apretar al recibir (${ENVIONES[f.enviones[0]]}).` },
    { lev: 's', I: 8600, exiFija: exigenciaTabla(9800), txt: 'Arranque pesado: la subida se traba. Tocá repetido para llevar la flecha a la franja verde, sin pasarte: empujar de más hace temblar.' }];
  await escena.mostrar(cfg.id);
  for (let k = 0; k < casos.length; k++) {
    const c = casos[k]; visita('practica'); escena.setCarga(k === 2 ? Math.round(f.techo.s * .98) : Math.round(f.techo[c.lev] * .6), c.lev); escena.posar(poseParado(escena.P, c.lev), c.lev); escena.camara(camPrincipal());
    zocalo(a, { lev: c.lev, n: 0, kg: escena.kg }); setReloj(0);
    const pn = capa.poner(`<h2>Calentamiento ${k + 1} de ${casos.length}</h2><p>${c.txt}</p><div class="fila"><button class="ir" id="btn-practicar">Probar</button><button id="btn-saltear">Saltear calentamiento</button></div>`, 'chico abajo');
    bloquear(pn); const b = await clic(pn, 'button'); capa.quitar(); if (b.id === 'btn-saltear') break;
    const ctx = { lev: c.lev, env: c.env, I: c.I, exiFija: c.exiFija, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: 77 + k, cal: cfg.cal, primera: true, domina: true, jueces: [1000, 1000, 1000], reloj: 25000 };
    const r = await correrIntento(ctx, { a, lev: c.lev, env: c.env, conf0: 0 });
    for (const g of r.res.gestos) if (!g.fuera) errs.push(Math.abs(g.e));
    await decision(a, c.lev, r.res, null, true);
  }
  zocalo(null); return errs.length ? errs.reduce((x, y) => x + y, 0) / errs.length : null;
}

/** Selector de apertura (88 % a 97 % del techo), con el valor sugerido. */
async function elegirApertura(p, lev, sugerida, html) {
  const [lo, hi] = p.rangoApertura(E.yo, lev); let kg = Math.max(lo, Math.min(hi, sugerida));
  for (;;) {
    const pn = capa.poner(`${html}<h2>Tu apertura de ${LEV[lev].toLowerCase()}</h2><div class="fila kgsel"><button id="kg-menos" ${kg <= lo ? 'disabled' : ''}>−1</button><output id="kg-val">${kg}</output><span>kg</span><button id="kg-mas" ${kg >= hi ? 'disabled' : ''}>+1</button><button class="ir" id="btn-confirmar">Confirmar</button></div><p>Entre ${lo} y ${hi} kg. Sugerida: ${sugerida} kg. Una apertura alta ahorra un intento; tres nulos te dejan sin marca.</p>`);
    bloquear(pn); const b = await clic(pn, '#kg-menos,#kg-mas,#btn-confirmar');
    if (b.id === 'kg-menos') kg--; else if (b.id === 'kg-mas') kg++; else break;
  }
  capa.quitar(); p.abrir(E.yo, lev, kg);
}

async function presentacion(p, cfg, errMedio) {
  visita('presentacion'); const f = p.at[E.yo].f, G = p.guion;
  // apertura sugerida según el error medido en el calentamiento: 93,5 % para un jugador preciso, hasta 88 % para uno que todavía no agarró el ritmo
  const pct = errMedio === null ? .935 : Math.max(.88, Math.min(.935, .935 - (errMedio - 30) / 60 * .055)), sug = Math.round(f.techo.s * pct);
  const forma = s => (s > 0 ? 'sale liviano' : s < 0 ? 'viene pesado' : 'normal'), yo = p.at[E.yo];
  const html = `<h1>Presentación</h1><div class="pesistas">${p.at.map(a => `<div class="pesista" style="border:1px solid var(--line);padding:.5em"><div class="b" style="background:${PLANTEL[a.id].bandera}"></div><b>${a.f.nombre}${a.i === E.yo ? ' · vos' : ''}</b><small>${a.f.pais} · dorsal ${a.f.dorsal}<br>${a.ctrl === 'juego' ? `Abre con ${a.decl.s} y ${a.decl.c}` : `Techo ${a.f.techo.s} / ${a.f.techo.c}`}</small></div>`).join('')}</div>
    <p><b>Guion de la final:</b> ${GUIONES[G.tipo](G.a >= 0 ? p.at[G.a].f.nombre : '')}</p><p><b>Tu forma del día:</b> arranque ${forma(yo.forma.s)}, dos tiempos ${forma(yo.forma.c)}. Rivales en nivel ${cfg.nivel}.</p>`;
  await elegirApertura(p, 's', sug, html); E.pctApertura = pct;
}

/** Panel único del llamado propio: kilos (fichas y ajuste fino), envión, La cuenta, frase del entrenador y Confirmar. */
function panelLlamado(p, L, t0, alConfirmar) {
  const a = p.at[L.a], min = p.minimo(L.a), tv = p.techoVisible(L.a, L.lev, false), S = { kg: L.kg, env: guardado.get('tarima.env.' + a.id) || a.f.enviones[0] };
  const fichas = { seguro: Math.max(min, Math.floor(tv * .95 / 1000)), justo: Math.max(min, Math.floor(tv * .99 / 1000)), jugado: Math.max(min, Math.ceil(tv * 1.02 / 1000)) };
  const frase = kg => { const x = kg * 1000 / tv; return x <= .95 ? '«Sale caminando.»' : x <= 1 ? '«Es para pelearla.»' : '«Es un tiro.»'; };
  const C = p.cuenta(L.a), cuenta = L.lev === 'c' ? (C.oro ? `Para el oro: ${C.oro}` : 'El oro no depende de vos') + (C.plata ? ` · Plata asegurada con ${C.plata}` : '') : (C.oro ? `Para liderar el arranque: ${C.oro}` : '');
  const pinta = () => {
    const ms = reloj.ahora() - t0, fijo = a.cambios >= 2 || ms > L.reloj - RELOJ.cambiosHasta;
    const pn = capa.poner(`<h2>${a.f.nombre} · ${LEV[L.lev]} · intento ${L.n}</h2>
      <div class="fila kgsel"><button id="kg-menos" ${fijo || S.kg <= min ? 'disabled' : ''}>−1</button><output id="kg-val">${S.kg}</output><span>kg</span><button id="kg-mas" ${fijo || S.kg >= KG_MAX ? 'disabled' : ''}>+1</button><button class="ir" id="btn-confirmar">Confirmar</button></div>
      <div class="fila">${Object.entries(fichas).map(([k, v]) => `<button class="ficha" data-kg="${v}" ${fijo ? 'disabled' : ''} aria-pressed="${v === S.kg}">${k} ${v}</button>`).join('')}</div>
      ${L.lev === 'c' ? `<div class="fila"><span>Envión:</span>${Object.keys(ENVIONES).map(e => `<button class="envion" data-env="${e}" aria-pressed="${e === S.env}">${ENVIONES[e]}${a.f.enviones.includes(e) ? '' : ' *'}</button>`).join('')}</div>` : ''}
      <p class="frase">Entrenador: ${frase(S.kg)}</p><p class="cuenta">${cuenta}</p>
      <p>Declarado: ${L.kg} kg · mínimo ${min} · cambios ${a.cambios} de 2${fijo ? ' (cerrados)' : ''}${S.kg !== L.kg ? ' · <b>confirmar cuenta como cambio; si otro pidió menos, sale antes</b>' : ''}${L.lev === 'c' && !a.f.enviones.includes(S.env) ? ' · * envión que no domina: menos altura y menos desvío tolerado' : ''}</p>`, 'chico abajo');
    pn.querySelector('#kg-menos').onclick = () => { S.kg--; pinta(); }; pn.querySelector('#kg-mas').onclick = () => { S.kg++; pinta(); };
    pn.querySelectorAll('.ficha').forEach(b => { b.onclick = () => { S.kg = +b.dataset.kg; pinta(); }; });
    pn.querySelectorAll('.envion').forEach(b => { b.onclick = () => { S.env = b.dataset.env; pinta(); }; });
    pn.querySelector('#btn-confirmar').onclick = () => { boton.oye = null; guardado.set('tarima.env.' + a.id, S.env); alConfirmar(S); };
    return pn;
  };
  bloquear(pinta());
  // un toque de Espacio también confirma, pasado el bloqueo
  boton.oye = (t, v) => { if (v && t - t0 >= 400 && $('btn-confirmar')) $('btn-confirmar').click(); };
}

/** Llamado del jugador: panel con el reloj corriendo, intento, luces y repetición. */
async function llamadoPropio(p, L) {
  visita('llamado'); const a = p.at[L.a], P = PLANTEL[a.id];
  await escena.mostrar(a.id); escena.setCarga(L.kg, L.lev); escena.posar(poseParado(escena.P, L.lev), L.lev); zocalo(a, L); etiqueta(L.et); setLuces(null);
  if (P.cara) escena.primerPlano('cara'); else escena.camara(camPrincipal());
  const t0 = reloj.ahora(); let ctx = null, env, kgFinal = L.kg, desplazado = false, corrida = null;
  // mientras el panel está abierto corre el reloj: si llega a cero, es nulo
  const elegido = new Promise(res => panelLlamado(p, L, t0, res));
  const vence = new Promise(res => { enCuadro = ahora => { setReloj(L.reloj - (ahora - t0)); if (ahora - t0 >= L.reloj) { enCuadro = null; res(null); } }; });
  const S = await Promise.race([elegido, vence]); enCuadro = null; boton.oye = null; capa.quitar();
  const ms = Math.min(L.reloj, Math.round(reloj.ahora() - t0));
  if (S) {
    env = L.lev === 'c' ? S.env : undefined;
    if (S.kg !== L.kg && !p.cambioValido(ms, S.kg)) { desplazado = p.cambio(ms, S.kg).desplazado; if (!desplazado) kgFinal = S.kg; }
    if (desplazado) { visita('desplazado'); etiqueta(null); veredicto(`${a.f.nombre} pasa a ${S.kg} kg`, 'Otro pesista pidió menos: sale antes. Tu reloj vuelve a empezar.'); await saltable(2200); veredicto(''); return; }
    escena.setCarga(kgFinal, L.lev); zocalo(a, { ...L, kg: kgFinal }); etiqueta(p.llamado.et);
    ctx = p.contexto(env); visita('intento');
    corrida = await correrIntento(ctx, { a, lev: L.lev, env, conf0: ms, t0 });
  } else { env = L.lev === 'c' ? a.f.enviones[0] : undefined; ctx = p.contexto(env); corrida = { conf: null, ent: [], res: simular(ctx, null, []).res, grab: [], m: { movs: [] } }; }
  const et = p.llamado.et, x = p.resolver({ conf: corrida.conf, env, ent: corrida.ent });
  if (JSON.stringify(x.res) !== JSON.stringify(corrida.res)) E.errores.push('el resultado mostrado no coincide con el recalculado');
  await decision(a, L.lev, x.res, et, true);
  const rival = p.at.find(b => b.i !== L.a); recuadro(x.res.res === 'valido' ? `${PLANTEL[rival.id].corto} aprieta los dientes` : `${PLANTEL[rival.id].corto} respira`, rival.id);
  await repeticion(L.lev, corrida);
  for (const c of x.avisos) { sonido.aviso(); veredicto(`${p.at[c.a].f.pais} cambia a ${c.a_kg}`, `${p.at[c.a].f.nombre} · antes ${c.de} kg`); await saltable(1300); veredicto(''); }
  recuadro(null); etiqueta(null); zocalo(null);
}

/** Intento de un rival: resumido en el tablero (exprés) o entero desde la salida (completa y decisivos). */
async function llamadoRival(p, L, cfg) {
  const a = p.at[L.a], x = p.resolverIA(), decisivo = L.et.some(e => e === 'oro' || e === 'medalla'), entero = cfg.ritmo === 'completa' || decisivo;
  setReloj(L.reloj); setLuces(null);
  if (entero) {
    visita('rival'); await escena.mostrar(a.id); escena.setCarga(L.kg, L.lev); escena.posar(poseParado(escena.P, L.lev), L.lev); escena.camara(camPrincipal()); zocalo(a, L); etiqueta(L.et);
    const r = await correrIntento(x.ctx, { a, lev: L.lev, env: x.env, gestos: { conf: x.conf, ent: x.ent } });
    await decision(a, L.lev, r.res, L.et, false);
  } else {
    visita('resumen'); const ok = x.res.res === 'valido', b = x.res.luces.filter(Boolean).length;
    const pn = capa.poner(`<h2>${a.f.nombre} · ${LEV[L.lev]} · intento ${L.n}</h2><div class="fila kgsel"><output>${L.kg}</output><span>kg</span><div class="luces" id="luces-r"><i></i><i></i><i></i></div><b id="res-r"></b></div>${tableroHTML(p, { yo: E.yo, sale: L.a })}<p>Tocá para seguir.</p>`);
    const fin = saltable(3400); let corto = false; fin.then(() => { corto = true; });
    for (let i = 0; i < 3 && !corto; i++) { await Promise.race([espera(400), fin]); if (corto || !pn.isConnected) break; pn.querySelector('#luces-r').children[i].className = x.res.luces[i] ? 'b' : 'r'; sonido.luz(x.res.luces[i]); }
    if (pn.isConnected) { [...pn.querySelector('#luces-r').children].forEach((el, i) => { el.className = x.res.luces[i] ? 'b' : 'r'; }); pn.querySelector('#res-r').textContent = (ok ? 'Válido' : x.res.res === 'nulo' ? 'Nulo' : 'Fallado') + (x.res.causa ? ' · ' + CAUSAS[x.res.causa] : '') + ` · ${b} a ${3 - b}`; }
    await fin; capa.quitar();
  }
  etiqueta(null); zocalo(null);
}

async function carga(kg, lev) { if (!escena.activo || kg === escena.kg) return; visita('carga'); E.modo = 'tv'; escena.camara('jib'); escena.setCarga(kg, lev); escena.posar(poseParado(escena.P, lev), lev); veredicto(`Cambio de carga · ${kg} kg`); await saltable(1300); veredicto(''); }

async function intervalo(p) {
  visita('intervalo'); const f = p.at[E.yo].f, sug = Math.round(f.techo.c * (E.pctApertura || .935));
  await elegirApertura(p, 'c', sug, `<h1>Intervalo</h1>${tableroHTML(p, { yo: E.yo })}<p>Los tres recuperan 15 de Resto.</p>`); p.empezar();
}

async function cierre(p) {
  visita('clasificacion'); const t = p.tabla(), yo = t.find(f => f.a === E.yo), R = EVENTO.records, medallas = ['Oro', 'Plata', 'Bronce'];
  const mejor = lev => p.at.slice().sort((x, y) => y.mejor[lev] - x.mejor[lev] || x.seqMejor[lev] - y.seqMejor[lev])[0];
  const esc = k => { const f = t[k]; return f && f.total ? `<div class="p${k + 1}"><i style="background:${PLANTEL[f.id].bandera}"></i><b>${PLANTEL[f.id].corto}</b>${f.total} kg<br>${medallas[k]}</div>` : `<div class="p${k + 1} vacio"><b>—</b>vacío</div>`; };
  const rec = []; for (const a of p.at) { if (a.mejor.s > R.s) rec.push(`${a.f.nombre}: récord de arranque (${a.mejor.s})`); if (a.mejor.c > R.c) rec.push(`${a.f.nombre}: récord de dos tiempos (${a.mejor.c})`); if (a.mejor.s && a.mejor.c && a.mejor.s + a.mejor.c > R.t) rec.push(`${a.f.nombre}: récord de total (${a.mejor.s + a.mejor.c})`); }
  const gano = yo.total && yo.puesto;
  if (gano) guardado.set('tarima.nivel', guardado.get('tarima.nivel') === 'amistoso' ? 'normal' : guardado.get('tarima.nivel'));
  guardado.set('tarima.jugadas', String((+guardado.get('tarima.jugadas') || 0) + 1));
  // plano del ganador detrás del podio 2D
  const oro = t[0]?.total ? p.at[t[0].a] : null; if (oro) { await escena.mostrar(oro.id); escena.posar(poseParado(escena.P, 'c'), 'c'); if (PLANTEL[oro.id].cara) escena.primerPlano('torso'); else escena.camara('3/4'); }
  visita('ceremonia');
  const pn = capa.poner(`<h1>${yo.total ? (yo.puesto === 1 ? '¡Oro!' : yo.puesto === 2 ? 'Plata' : 'Bronce') : 'Sin marca'}</h1><div class="podio">${esc(1)}${esc(0)}${esc(2)}</div>${tableroHTML(p, { yo: E.yo })}
    <p>Mejor arranque: <b>${mejor('s').mejor.s ? `${mejor('s').f.nombre} (${mejor('s').mejor.s})` : '—'}</b> · Mejor dos tiempos: <b>${mejor('c').mejor.c ? `${mejor('c').f.nombre} (${mejor('c').mejor.c})` : '—'}</b></p>${rec.length ? `<p class="cuenta">${rec.join(' · ')}</p>` : ''}
    <div class="fila"><button class="ir" id="btn-revancha">Revancha</button><button id="btn-cambiar">Cambiar pesista</button></div>`);
  bloquear(pn); sonido.ovacion(!!gano); visita('fin');
  const b = await clic(pn, '#btn-revancha,#btn-cambiar'); capa.quitar(); return b.id === 'btn-revancha';
}

// ---------- la partida ----------
async function partida(cfg) {
  E.cfg = cfg; E.yo = IDS.indexOf(cfg.id); E.registro = null;
  const semilla = params.has('semilla') && !E.jugadas ? (+params.get('semilla') >>> 0) : (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);
  E.jugadas = (E.jugadas || 0) + 1;
  let errMedio = null; cfg.cal = cfg.cal ?? (tactil() ? 40 : 0);
  $('msg').hidden = false; $('msg').textContent = 'Cargando pesista…'; await escena.cargar(cfg.id); $('msg').hidden = true;
  for (const id of IDS) if (id !== cfg.id) escena.cargar(id).catch(() => null);      // el segundo modelo baja durante el calentamiento
  if (cfg.calentar) { cfg.cal = await metronomo(); errMedio = await practica(cfg); }
  const p = E.p = new Partida(datos, { semilla, nivel: cfg.nivel, cal: cfg.cal, primera: cfg.primera, atletas: IDS.map((id, i) => ({ id, ctrl: i === E.yo ? 'persona' : 'juego' })) });
  await presentacion(p, cfg, errMedio); p.empezar();
  while (p.fase !== 'fin') {
    if (p.fase === 'intervalo') { await intervalo(p); continue; }
    const L = { ...p.llamado }, a = p.at[L.a];
    if (a.ctrl === 'persona') { await carga(L.kg, L.lev); await llamadoPropio(p, L); } else await llamadoRival(p, L, cfg);
  }
  E.registro = JSON.parse(JSON.stringify(p.reg));
  const rc = recalcular(E.registro, datos); if (!rc.ok || resumen(rc.tabla) !== resumen(p.tabla())) E.errores.push('el registro no recalcula a la misma tabla: ' + (rc.error || ''));
  return cierre(p);
}

async function iniciar() {
  const [poses, sim] = await Promise.all(['data/poses.json', 'data/sim.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); })));
  datos = leerDatos(sim);
  await Promise.all([`800 20px 'Saira Condensed'`, `700 20px 'Saira Condensed'`, `500 20px 'Saira Condensed'`].map(f => document.fonts.load(f).catch(() => null)));
  escena = new Escena($('gl'), calidadInicial(params.get('q')), { reduceMotion }); escena.poses = poses;
  ayudas = new Ayudas($('ayudas')); boton = new Boton([$('escena'), $('zona')]);
  $('ev-titulo').textContent = EVENTO.titulo; $('ev-sub').textContent = EVENTO.sesion; $('msg').hidden = true;
  ultimo = reloj.ahora(); requestAnimationFrame(bucle);
  (async () => { let cfg = null; for (;;) { if (!cfg) cfg = await inicio(); const revancha = await partida(cfg); if (revancha) cfg = { ...cfg, calentar: false, primera: false }; else cfg = null; } })().catch(e => { E.errores.push(String(e.stack || e)); console.error(e); $('msg').hidden = false; $('msg').textContent = 'El juego se detuvo por un error'; });
}

// ---------- API para la prueba automática y la depuración ----------
const ceder = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
window.JUEGO = {
  E, perf, reloj, get escena() { return escena; }, get registro() { return E.registro; }, PLAN,
  /** Lo que la prueba necesita para jugar por la vía real de entrada: pantalla, y del intento en curso, fase y próximo objetivo. */
  estado() {
    const I = E.intento, o = { pantalla: E.pantalla, visitados: E.visitados, modo: E.modo, errores: E.errores, ahora: reloj.ahora(), fase: E.p?.fase ?? null, metro: E.metro ?? null, intento: null };
    if (I && I.m) {
      const m = I.m, M = m.M, c = I.ctx, abs = t => I.t0 + t, x = { fase: m.fase, propio: I.propio, now: I.now, objetivo: null, accion: null, apretado: boton.apretado };
      if ((m.fase === 'tension' || m.fase === 'hombros') && M) { const desde = Math.max(I.now, M.ign) + 120; let k = Math.floor((desde - c.cal - M.t0) / m.per) + 1; if (k < 1) k = 1; x.objetivo = abs(M.t0 + k * m.per + c.cal); x.accion = 'baja'; }
      else if (m.fase === 'tiron' || m.fase === 'flexion') { x.objetivo = abs(M.tx + c.cal); x.accion = 'sube'; }
      else if ((m.fase === 'vuelo' || m.fase === 'empuje') && !M.tq && M.tFallo > 2e9) { x.objetivo = abs(M.tc + c.cal); x.accion = 'baja'; }
      else if (m.fase === 'pelea' || m.fase === 'traba') { const p = M.pelea; x.pelea = { modo: p.modo, aguja: p.aguja, exi: p.exiAhora, E: p.E, exiTraba: p.exiTraba, P: p.P, trabado: p.trabado }; }
      else if (m.fase === 'fijacion') { const f = m.fij; x.fij = { firme: f.firme, abajo: f.abajo }; if (f.firme) { x.objetivo = abs(f.tb + 150); x.accion = 'sube'; } }
      o.intento = x;
    }
    return o;
  },
  test: {
    /** Detiene el reloj propio: desde acá el tiempo solo pasa con avanzar(). */
    manual() { if (reloj.manual === null) reloj.manual = reloj.ahora(); return reloj.manual; },
    real() { reloj.soltar(); ultimo = reloj.ahora(); },
    /** Adelanta el reloj `ms` en pasos de `paso` y deja correr el flujo entre paso y paso. Dibuja solo el último cuadro. */
    async avanzar(ms, paso = 16) { const fin = reloj.manual + ms; while (reloj.manual < fin) { reloj.manual = Math.min(fin, reloj.manual + paso); tic(false); await ceder(); } tic(true); await ceder(); return reloj.manual; },
    /** Lleva el reloj hasta el instante absoluto t (si ya pasó, no hace nada). */
    async hasta(t, paso = 16) { if (t > reloj.manual) await this.avanzar(t - reloj.manual, paso); return reloj.manual; },
  },
  listo: iniciar().then(() => true, err => { console.error(err); E.errores.push(String(err.stack || err)); $('msg').textContent = 'No se pudo iniciar el juego'; return false; }),
};
