// Juego Tarima: final de tres pesistas (docs/JUEGO.md). Entrada de juego.html: carga, flujo de la partida y bucle.
// El resultado lo calcula el núcleo (web/js/sim/), que es una función pura de lo que el jugador tocó; acá se dibuja.
// Etapa 1: sin animaciones ni modelos nuevos. Lo que no está animado se resuelve con cortes y con texto (sección 11.2).
import { reloj, Boton, toques, principal, claveDe, enfocar, navegar } from './input.js';
import { Escena } from './stage.js';
import { poseDe, poseParado, marcas, tramo } from './sequence.js';
import { armarCaida, poseCaida } from './caida.js';
import { PLANTEL, ENVIONES, LEV, ETIQUETAS, GUIONES } from './roster.js';
import { Registrador, Gobernador, calidadInicial, medirRefresco, decidirCalidad, pasoDe, metaDe, nombreDe, PRESET, PASO, PISO_MP, MARGEN, TECHO_MP } from './perf.js';
import { sonido } from './audio.js';
import { Ayudas } from './ui/ayudas.js';
import { Senal } from './ui/senal.js';
import { Depura } from './ui/depura.js';
import { explicar, pasos, PALABRAS, GUIA, conTecla } from './ui/mensajes.js';
import { alDia, tocar, senal as senalDe, GUIADO, EN_HOMBROS } from './controles.js';
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
/** Solo para la prueba del gobernador (tools/check_fluidez.mjs --lastre): ms de espera por megapíxel dibujado, como si la placa fuera lenta. */
let LASTRE = +params.get('lastre') || 0;
const IDS = ['ventura', 'brenner', 'marangi'];

const E = { pantalla: 'carga', visitados: [], intento: null, p: null, yo: 0, cfg: null, ctl: 'f', sobre: null, monitor: { barraMin: 9, manosMax: 0, cuadros: 0, alto: {} }, errores: [], modo: 'panel', ultDibujo: 0 };
const perf = new Registrador();
/**
 * Calidad en uso. `auto`: la decide la calibración y la cuida el gobernador. `clave`/`Q`: calidad (movil, baja, media, alta).
 * `sombras`: siguen prendidas. `hz`: refresco medido de la pantalla; `paso`: se dibuja uno de cada `paso` refrescos.
 * `cambios`: cada vez que bajó, con lo medido. `calibracion`: lo que midió la calibración (para mirar desde la consola).
 */
const C = { auto: false, clave: '', Q: null, sombras: true, nombre: '', hz: 60, paso: 1, cambios: [], calibrado: false, medido: null, calibracion: null };
let gov = null, nRaf = 0;
let escena = null, datos = null, ayudas = null, boton = null, enCuadro = null, senalUI = null, depura = null;
const visita = n => { if (n !== E.pantalla) E.previa = E.pantalla; E.pantalla = n; if (!E.visitados.includes(n)) E.visitados.push(n); perf.marcar(n); };

// ---------- tiempo del juego: esperas sobre el reloj inyectable ----------
const pend = [];
const espera = ms => new Promise(res => pend.push({ t: reloj.ahora() + ms, res }));
/** Espera que se puede saltear con Espacio, Enter o un toque (después de `minimo` ms, para que un toque de más no saltee nada por accidente). */
function saltable(ms, minimo = 400) {
  return new Promise(res => {
    const t0 = reloj.ahora(), fin = () => { if (boton.oye === oye) boton.oye = null; res(); };
    // antes del mínimo el toque no saltea nada, pero queda anotado y con acuse («ESPERÁ»)
    const oye = (t, v) => { if (!v) return; if (t - t0 >= minimo) { toques.resolver(true, 'sigue'); fin(); } else toques.resolver(false, 'espera'); };
    boton.oye = oye; pend.push({ t: t0 + ms, res: fin });
  });
}
let ultimo = 0;
function tic(pintar, tRaf = null) {
  const c0 = performance.now(), now = reloj.ahora(), dt = Math.min(.25, Math.max(0, (now - ultimo) / 1000)); ultimo = now;
  for (let i = pend.length - 1; i >= 0; i--) if (pend[i].t <= now) pend.splice(i, 1)[0].res();
  // el botón de pausa (para el dedo; con teclado es Esc) no se muestra encima de un panel grande: taparía su título
  { const ver = puedePausar() && !E.sobre && !$('capa').querySelector('.panel:not(.abajo)'), b = $('pausa'); if (b.hidden === ver) b.hidden = !ver; }
  try { enCuadro?.(now, dt); } catch (e) { E.errores.push(String(e.stack || e)); console.error(e); enCuadro = null; }
  if (!escena) return;
  // se dibuja en cada cuadro que ofrece el navegador; detrás de un panel la imagen queda congelada (un cuadro al abrirlo o repintarlo)
  const dib = pintar && DIBUJA && !E.sinDibujo && (E.modo !== 'panel' || E.forzar), seguido = E.seguido; E.seguido = dib && E.modo !== 'panel';
  escena.cuadro(dt, dib); if (!dib) return;
  // el intervalo entre cuadros sale de la marca del navegador (el refresco en que cae el cuadro), no de cuándo corrió este código
  const marca = tRaf ?? now, ms = marca - E.ultDibujo; perf.cuadro(ms, seguido && E.seguido, E.intento?.m?.fase || ''); E.ultDibujo = marca; E.forzar = false;
  if (LASTRE) { const fin = performance.now() + LASTRE * escena.megapixeles; while (performance.now() < fin); }
  // el gobernador mira solo el dibujo continuo, y la calidad no cambia con un intento en curso (propio o de un rival) ni en la repetición
  if (gov && seguido && E.seguido && gov.cuadro(ms, now, performance.now() - c0) && !E.intento && E.pantalla !== 'repeticion') gov.resultado((gov.sube ? subir : bajar)(gov.pasos, 1000 / gov.fps), reloj.ahora());
  if (gov && gov.hz !== C.hz) fijarHz(gov.hz);      // el gobernador vio que la pantalla es más rápida de lo medido
}
// En pantallas de más de 90 Hz se dibuja en uno de cada dos refrescos (C.paso), para que los cuadros salgan parejos.
function bucle(t) { requestAnimationFrame(bucle); if (C.paso > 1 && ++nRaf % C.paso) return; perf.ofrecido(t); E.muestra?.(t); if (reloj.manual === null) tic(true, t + reloj.desfase); depura?.cuadro(t); }

// ---------- calidad ----------
function fijarHz(hz) { C.hz = hz; C.paso = pasoDe(hz); perf.periodo = 1000 / metaDe(hz); if (gov && gov.hz !== hz) gov.fijar(hz); }
const nombrar = () => { C.nombre = nombreDe(C.Q, escena.megapixeles, C.sombras); };
/** Cambia de calidad (programas y pases nuevos): solo en la carga, y deja todo compilado antes de seguir. */
async function ponerCalidad(clave) { C.clave = clave; C.Q = C.auto ? { ...PRESET[clave], dpr: 2 } : PRESET[clave]; escena.setCalidad(C.Q); await escena.precalentar(); }
/**
 * Baja `pasos` escalones sin compilar nada: cada uno deja el 85 % de los píxeles; en el piso de resolución apaga las
 * sombras (programas ya compilados en la carga) y ahí se queda. Devuelve false si no quedaba nada por bajar.
 */
function bajar(pasos, ms, donde = '') {
  const de = C.nombre; let hecho = false;
  for (let k = 0; k < pasos; k++) {
    const mp = escena.megapixeles; if (!(mp > 0)) break;
    if (mp * PASO >= PISO_MP) { escena.setTope(mp * PASO * 1e6); hecho = true; } else { if (C.sombras && !hecho) { C.sombras = false; escena.setSombras(false); hecho = true; } break; }
  }
  if (!hecho) return false;
  nombrar(); C.cambios.push({ de, a: C.nombre, ms: Math.round(ms * 10) / 10, pantalla: donde || (E.pantalla === 'intento' ? 'fin del intento' : E.pantalla), enIntento: !!E.intento, t: Math.round(performance.now()) });
  E.forzar = true; return true;      // el gobernador empieza a calentar en resultado()
}
/**
 * Sube `pasos` escalones sin compilar nada (el gobernador vio la máquina libre, o deshace una bajada que no sirvió):
 * primero vuelven las sombras, después 15 % más de píxeles por escalón, hasta la resolución de la pantalla.
 */
function subir(pasos, ms) {
  const de = C.nombre, tope = Math.min(escena.nativoMP, TECHO_MP); let hecho = false;
  for (let k = 0; k < pasos; k++) {
    if (!C.sombras) { C.sombras = true; escena.setSombras(true); hecho = true; continue; }
    const mp = escena.megapixeles; if (!(mp > 0) || mp >= tope * .985) break;
    escena.setTope(Math.min(tope, mp / PASO) * 1e6); hecho = true;
  }
  if (!hecho) return false;
  nombrar(); C.cambios.push({ de, a: C.nombre, ms: Math.round(ms * 10) / 10, pantalla: E.pantalla, enIntento: !!E.intento, t: Math.round(performance.now()), sube: true, motivo: gov?.motivo || '' });
  E.forzar = true; return true;
}
/** Intervalos (ms) entre `n` cuadros seguidos del navegador mientras se dibuja, sin contar los primeros `calienta`. null si no hay cuadros. */
function cadencia(n, calienta = 10) {
  return new Promise(res => {
    const ts = [], corte = setTimeout(() => { E.muestra = null; res(null); }, 4000);
    E.muestra = t => { escena.sombra = 3; ts.push(t); if (ts.length < n + calienta + 1) return; E.muestra = null; clearTimeout(corte); res(ts.slice(calienta + 1).map((x, k) => x - ts[calienta + k])); };
  });
}
/**
 * La calidad se decide acá, antes del primer intento y detrás de «Cargando…», con el pesista haciendo un arranque en bucle
 * (un pesista quieto no rehace sombras ni mueve la cámara, y cuesta menos que un intento). Primero se vuelve a medir el
 * refresco de la pantalla, sin dibujar; después decide perf.js (decidirCalidad): costo del cuadro a dos resoluciones,
 * megapíxeles que entran en el 85 % del período, la calidad más alta que los sostiene y una verificación con cuadros de
 * verdad. Tarda entre uno y dos segundos. Si algo falla, queda la calidad con la que se cargó.
 */
async function calibrar() {
  if (!C.auto || C.calibrado || !DIBUJA || reloj.manual !== null) return; C.calibrado = true;
  const K = C.calibracion = { hz: C.hz, margen: MARGEN, ms: 0 }, ini = performance.now(), clave0 = C.clave, nombre0 = C.nombre, ORDEN = Object.keys(PRESET);
  const lastre = () => { if (LASTRE) { const fin = performance.now() + LASTRE * escena.megapixeles; while (performance.now() < fin); } };
  gov.calentar(reloj.ahora(), 120000);      // mientras se calibra, el gobernador no opina
  try {
    E.sinDibujo = true; const hz = await medirRefresco(30, null); E.sinDibujo = false;
    if (hz) { fijarHz(hz); K.hz = hz; }
    escena.setCarga(escena.kg || 100, 's'); let t = 1.3;
    const R = await decidirCalidad({
      periodo: gov.periodo, clave: C.clave, techo: () => escena.nativoMP, poner: ponerCalidad,
      medir: mp => { escena.setTope(mp * 1e6, true); const c = escena.costo({ extra: lastre }); return { mp: escena.megapixeles, ms: c.ms, p90: Math.round(c.p90 * 100) / 100, n: c.n }; },
      fijar: mp => { escena.setTope(mp * 1e6); return escena.megapixeles; },
      cuadros: (n, calienta) => { enCuadro = (now, dt) => { t += dt; escena.bucle(t, dt); }; return cadencia(n, calienta).finally(() => { enCuadro = null; }); },
    });
    Object.assign(K, { pruebas: R.pruebas, verificacion: R.verificacion }); C.medido = R.p80; nombrar();
    const mp0 = Math.min(R.primera.techo, PRESET[clave0].maxPixels / 1e6);      // lo que se dibujaba sin calibrar
    if (ORDEN.indexOf(C.clave) < ORDEN.indexOf(clave0) || (C.clave === clave0 && escena.megapixeles < mp0 * .97)) C.cambios.push({ de: nombre0, a: C.nombre, ms: Math.round((R.primera.fijo + R.primera.porMP * mp0) * 10) / 10, pantalla: 'calibración', enIntento: false, t: Math.round(performance.now()) });
  } catch (e) { console.warn('calibración de calidad:', e); K.error = String(e.stack || e); escena.setTope(C.Q.maxPixels); }
  finally { E.sinDibujo = false; enCuadro = null; if (escena.P) escena.posar(poseParado(escena.P, 's'), 's'); nombrar(); K.gl = escena.renderer.getContext().getError(); K.ms = Math.round(performance.now() - ini); gov.calibrado(reloj.ahora()); E.forzar = true; }
}

// ---------- gráfica ----------
/**
 * Paneles. Al abrir, el foco va al botón principal; al repintar el mismo panel (un kilo más, otro pesista) el foco vuelve
 * al botón que lo tenía. El foco se ve siempre (borde dorado) y los botones no se deshabilitan mientras dura el bloqueo.
 */
const capa = {
  poner(html, clase = '', { foco = true } = {}) {
    const c = $('capa'), prev = c.firstElementChild, act = document.activeElement, clave = prev && prev.contains(act) ? claveDe(act) : null, sc = prev ? prev.scrollTop : 0;
    c.innerHTML = `<div class="panel ${clase}">${html}</div>`; E.modo = 'panel'; E.forzar = true;
    const pn = c.firstElementChild; pn.t0 = prev ? prev.t0 : -1e9; if (prev) pn.scrollTop = sc;
    // `foco: false`: panel donde Espacio es del juego (el metrónomo): nadie queda con foco, y a los botones se llega con Tab
    if (!foco) { pn.dataset.libre = '1'; document.activeElement?.blur?.(); } else if (!E.sobre) enfocar(pn, clave); else E.sobre.foco = null;
    return pn;
  },
  quitar() { $('capa').innerHTML = ''; if (E.modo === 'panel') E.modo = 'tv'; },
};
/** Un panel recién abierto ignora las activaciones durante 400 ms: el toque que venía de la pantalla anterior no elige nada. */
function bloquear(panel) { panel.t0 = reloj.ahora(); }
const vale = panel => reloj.ahora() - (panel.t0 ?? -1e9) >= 400;
/** Activación de un botón del panel. Dentro del bloqueo no elige nada, pero el toque queda anotado como descartado («ESPERÁ»). */
const activa = panel => { const ok = vale(panel); toques.resolver(ok, ok ? 'boton' : 'espera'); return ok; };
const clic = (panel, sel) => new Promise(res => panel.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { if (!activa(panel)) return; sonido.activar(); res(b); })));
const teclas = (n, T, extra = '') => `<kbd class="tecla ${extra}">${T ? 'TOCÁ' : 'ESPACIO'}</kbd>`.repeat(n);
const pasosHTML = (ctl, T) => `<ol class="pasos">${pasos(ctl, T).map(([n, txt], i) => `<li><b>${i + 1}</b><span class="tk">${teclas(n, T, n > 1 ? 'ch' : '')}</span><span>${txt}</span></li>`).join('')}</ol>`;
const MENUS = '<p class="chica">Menús: flechas y ENTER · H ayuda · ESC pausa</p>';

// ---------- acuse de cada toque ----------
const MOTIVOS = { espera: 'ESPERÁ', temprano: 'TODAVÍA NO', rebote: 'REBOTE', sobra: 'SOBRA', tarde: 'TARDE', termino: 'TERMINÓ', pausa: 'PAUSA', mouse: 'TECLADO' };
/**
 * La tecla dibujada (abajo a la derecha, y la de la señal) se hunde con cada pulsación, sea o no el momento; si el toque
 * no sirvió, al lado sale el motivo en una palabra. Si la ventana pierde el teclado, un cartel lo dice.
 */
function ponerAcuse() {
  const el = $('acuse'), kbd = el.firstElementChild, txt = el.lastElementChild; let tOn = 0, tTxt = 0, abajo = 0;
  toques.contexto = () => { const I = E.intento; return E.pantalla + (I && I.m ? `/${I.m.fase}${I.senal ? ' ' + I.senal.clave : ''}` : E.modo === 'panel' ? '/panel' : ''); };
  const suelta = () => { el.classList.remove('on'); $('senal').classList.remove('pulsa'); };
  toques.alCambiar = (T, que) => {
    if (que === 'baja') { abajo = performance.now(); clearTimeout(tOn); clearTimeout(tTxt); kbd.textContent = T.tecla; txt.textContent = ''; el.hidden = false; el.className = 'acuse on'; $('senal').classList.add('pulsa'); }
    else if (que === 'sube') { clearTimeout(tOn); tOn = setTimeout(suelta, Math.max(0, 110 - (performance.now() - abajo))); }      // un toque corto igual se llega a ver
    else { el.classList.toggle('no', !T.ok); txt.textContent = T.ok ? '' : MOTIVOS[T.motivo] || 'ESPERÁ'; clearTimeout(tTxt); tTxt = setTimeout(() => { txt.textContent = ''; el.classList.remove('no'); }, 900); }
    depura?.pintar();
  };
  const foco = () => { $('sinfoco').hidden = document.hasFocus() || tactil(); if (!document.hasFocus()) suelta(); };
  addEventListener('blur', foco); addEventListener('focus', foco); foco();
}

// ---------- pausa y «Cómo se juega» ----------
/** Fuera del intento propio se puede pausar: adentro, pausar sería elegir el instante de cada toque. */
function puedePausar() { return E.pantalla !== 'carga' && !(E.intento && E.intento.propio); }
function pintarSobre(tipo) {
  const el = $('sobre'), T = tactil(), ctl = E.cfg?.ctl || E.ctl; E.sobre.tipo = tipo;
  el.innerHTML = `<div class="panel chico">${tipo === 'ayuda'
    ? `<h2>Cómo se juega · controles ${ctl === 'f' ? 'Fácil' : 'Clásico'}</h2>${pasosHTML(ctl, T)}<p>${ctl === 'f' ? 'Un toque por señal: no hay que mantener ni soltar. Después de cada toque sale PERFECTO, BIEN, TEMPRANO o TARDE.' : 'Mantener y soltar: apretar es agarrar la barra, soltar es explotar.'}</p><p class="chica"><b>Tope:</b> lo máximo que levanta tu pesista en un buen día. <b>Resto:</b> la energía que le queda; cada intento gasta un poco. <b>Jueces 2 a 1:</b> luces blancas contra rojas; con dos blancas el levantamiento vale. <b>Apertura:</b> los kilos de tu primer intento.</p>${T ? '' : MENUS}<div class="fila"><button class="ir" id="so-seguir">Seguir</button></div>`
    : `<h1>Pausa</h1><p>El reloj está detenido.</p><div class="fila"><button class="ir" id="so-seguir">Seguir</button><button id="so-ayuda">Cómo se juega</button><button id="so-salir">Volver al inicio</button></div>`}</div>`;
  el.hidden = false; enfocar(el.firstElementChild);
  el.querySelector('#so-seguir').onclick = cerrarSobre; const ay = el.querySelector('#so-ayuda'), sa = el.querySelector('#so-salir');
  if (ay) ay.onclick = () => pintarSobre('ayuda'); if (sa) sa.onclick = () => location.reload();
}
/** Abre la pausa o la ayuda: congela el reloj del juego (el del llamado no corre) hasta volver. */
function abrirSobre(tipo) {
  if (E.sobre || !puedePausar()) return false;
  const act = document.activeElement; E.sobre = { tipo, foco: act && $('capa').contains(act) ? act : null, solto: reloj.manual === null }; if (E.sobre.solto) reloj.manual = reloj.ahora();
  boton.activo = false; pintarSobre(tipo); return true;
}
function cerrarSobre() {
  const S = E.sobre; if (!S) return; $('sobre').hidden = true; $('sobre').innerHTML = ''; E.sobre = null; boton.activo = true;
  if (S.solto) { reloj.soltar(); ultimo = reloj.ahora(); }
  const pn = $('capa').firstElementChild; if (S.foco && S.foco.isConnected) S.foco.focus({ preventScroll: true }); else if (pn && !pn.dataset.libre) enfocar(pn); else document.activeElement?.blur?.();
}
/** Teclado de los paneles (se atiende antes que la entrada del levantamiento). */
function alTeclado(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || !boton) return; const k = e.key;
  if (k === 'Escape') { e.preventDefault(); if (E.saltar) E.saltar(); else if (E.sobre) cerrarSobre(); else abrirSobre('pausa'); return; }      // en el tutorial, Esc lo saltea
  if (k === 'h' || k === 'H' || k === '?') { if (!E.sobre) { if (abrirSobre('ayuda')) e.preventDefault(); } else { e.preventDefault(); if (E.sobre.tipo === 'ayuda') cerrarSobre(); else pintarSobre('ayuda'); } return; }
  const raiz = E.sobre ? $('sobre').firstElementChild : $('capa').firstElementChild;
  if (!raiz) { if (k === 'Tab') e.preventDefault(); return; }      // sin panel, Espacio es del levantamiento, y Tab no saca el foco de la página
  if (navegar(raiz, e)) { e.preventDefault(); return; }
  if (k === 'Enter' || k === ' ') {
    if (e.repeat) { e.preventDefault(); return; }      // dejar la tecla apretada no activa nada, ni acá ni en el panel que sigue
    const act = document.activeElement; if (act && act.tagName === 'BUTTON' && raiz.contains(act)) return;      // el botón con foco se activa solo
    if (raiz.dataset.libre) return;      // en el metrónomo, Espacio es el toque
    const b = principal(raiz); if (b) { e.preventDefault(); b.focus({ preventScroll: true }); b.click(); }
  }
}
const relojLibre = () => { $('reloj').textContent = '–:––'; $('reloj').classList.remove('aviso'); };
function setReloj(ms) { const s = Math.max(0, Math.ceil(ms / 1000)), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if ($('reloj').textContent !== txt) { $('reloj').textContent = txt; $('reloj').classList.toggle('aviso', s <= 10); escena?.arena.setClock(s); } }
function setLuces(d) { [...$('luces').children].forEach((el, i) => { el.className = d && d[i] !== null && d[i] !== undefined ? (d[i] ? 'b' : 'r') : ''; }); escena?.arena.setDecision(d ? [0, 1, 2].map(i => d[i] ?? null) : null); }
function zocalo(a, L) {
  if (!a) { $('zocalo').hidden = true; return; } const P = PLANTEL[a.id];
  $('zocalo').hidden = false; $('z-bandera').style.background = P.bandera; $('z-codigo').textContent = a.f.codigo; $('z-dorsal').textContent = 'Dorsal ' + a.f.dorsal; $('z-nombre').textContent = a.f.nombre;
  $('z-lev').textContent = LEV[L.lev]; $('z-intento').textContent = L.n ? `Intento ${L.n}` : 'Práctica'; $('z-kg').textContent = L.kg;
  escena.arena.setBoard({ name: a.f.nombre, country: a.f.codigo, kg: L.kg, attempt: L.n || 1, lift: LEV[L.lev] });
}
let cartelAhora = '';
const cartel = (txt, clase = '') => { const k = (txt || '') + '|' + clase; if (k === cartelAhora) return; cartelAhora = k; $('cartel').hidden = !txt; $('cartel').textContent = txt || ''; $('cartel').className = 'cartel ' + clase; };
const veredicto = (txt, sub, mal) => { $('veredicto').hidden = !txt; $('veredicto').innerHTML = txt ? `${txt}${sub ? `<small>${sub}</small>` : ''}` : ''; $('veredicto').className = 'veredicto' + (mal ? ' mal' : ''); };
const guiaTxt = txt => { const g = $('guia'); if (g.textContent !== txt) g.textContent = txt; g.hidden = !txt; };
const etiqueta = et => { $('etiqueta').hidden = !et?.length; $('etiqueta').textContent = (et || []).map(e => ETIQUETAS[e]).join(' · '); };
function recuadro(txt, id) { $('rival').hidden = !txt; if (txt) $('rival').innerHTML = `<i style="background:${PLANTEL[id].bandera}"></i><span>${txt}</span>`; }
const camPrincipal = () => (escena.vertical ? 'lado' : '3/4');
const TENS = { perfecta: 'TENSIÓN PERFECTA', buena: 'BUENA TENSIÓN', floja: 'TENSIÓN FLOJA' };

// ---------- el intento en vivo ----------
/**
 * Corre un intento en pantalla. Con `gestos` ({conf, ent}) reproduce el de un rival; sin ellos, lee el teclado (o el dedo)
 * y lo pasa por la capa de traducción del nivel de control (`ctx.ctl`). El mouse no hace gestos.
 * El estado que se dibuja sale de recalcular la lista de entradas hasta ahora: lo mostrado nunca contradice al núcleo.
 * `guia`: reloj del intento llevado por la presentación (tutorial); sin ella, el reloj es el del juego.
 * @returns {Promise<{conf:number|null, ent:number[][], res:object, grab:object[]}>}
 */
function correrIntento(ctx, { a, lev, env, gestos = null, conf0 = null, t0 = reloj.ahora(), panelAbierto = null, guia = null }) {
  return new Promise(resolver => {
    const P = escena.P, ent = gestos ? gestos.ent : [], propio = !gestos, grab = [], mk = marcas(P, lev, env), ctl = propio ? ctx.ctl || 'c' : 'c', facil = propio && ctl === 'f', T = tactil();
    let conf = gestos ? gestos.conf : conf0, pal = null, palT = 0, fin = false, chic = false, camFija = false, sAhora = null, parado = false, ultTecla = -1e9, tRes = null;
    const visto = { gestos: 0, fase: '', toques: 0, tens: null, amagues: 0, rec: null, tic: null };
    const tv0 = gestos ? Math.max(0, gestos.conf - 500) : 0;
    // reloj guiado: lineal a tramos; `tope` es el instante del intento donde se detiene
    const R = guia ? { tb: reloj.ahora(), vb: conf ?? 0, vel: 1, tope: Infinity, clave: null } : null;
    const vt = t => Math.min(R.vb + Math.max(0, t - R.tb) * R.vel, R.tope);
    const decir = (txt, clase = {}) => { pal = { txt, ...clase }; palT = reloj.ahora(); };
    /** Cierra el intento en pantalla: deja de escuchar el botón y saca la señal, la leyenda y las ayudas. */
    const cerrar = () => { fin = true; enCuadro = null; if (propio) { boton.oye = null; senalUI.ocultar(); guiaTxt(''); $('zona-txt').textContent = 'Tocá acá'; } $('zona').classList.remove('on'); cartel(''); ayudas.limpiar(); E.intento = null; };
    E.intento = { ctx, t0, propio, ctl, m: null, now: 0, senal: null, parado: false, guiado: !!guia, ent, confirmar: t => { if (conf === null) conf = Math.round(t - t0); }, cancelar: () => { if (!fin) { cerrar(); resolver(null); } } };
    if (propio) {
      senalUI.setTactil(T);
      boton.oye = (tEv, v, via) => {
        // todo toque se resuelve: aceptado, o descartado con su motivo (se ve en el acuse y en ?depura=1)
        const no = motivo => { if (v) toques.resolver(false, motivo); };
        if (via === 'mouse') return no('mouse');      // el clic no hace gestos del levantamiento
        if (fin) return no('termino'); if (conf === null) return no('espera');
        $('zona').classList.toggle('on', boton.apretado);
        let x;
        if (guia) {
          if (!v) return;
          const det = R.tope < Infinity && vt(tEv) >= R.tope;
          if (guia.estricto && !det && sAhora && (sAhora.tipo === 'cierre' || sAhora.tipo === 'espera')) { decir('TODAVÍA NO', { floja: true }); return no('espera'); }
          x = Math.round(vt(tEv)); ultTecla = tEv;
        } else x = Math.round(tEv - t0);
        const r = tocar(ctx, conf, ent, x, v, ctl);
        if (guia && r.n) { R.vb = r.t; R.tb = tEv; R.tope = Infinity; R.clave = null; }      // el toque suelta el reloj
        // «todavía no»: la ventana de la señal no abrió (no gasta la señal). No tapa la palabra del toque anterior recién salida
        if (facil && v && (r.aviso === 'espera' || r.aviso === 'temprano') && !(pal && pal.nota && reloj.ahora() - palT < 900)) decir('TODAVÍA NO', { floja: true });
        if (!v) return;
        if (!r.n) return no(r.motivo);
        if (toques.abierto && sAhora && sAhora.tipo === 'cierre') { const e = r.t - sAhora.objetivo; toques.abierto.nota = `${sAhora.verbo} ${e >= 0 ? '+' : '−'}${Math.abs(e)} ms`; } else if (toques.abierto && sAhora) toques.abierto.nota = sAhora.verbo;
        toques.resolver(true, 'gesto');
      };
    }
    E.modo = propio ? 'intento' : 'tv'; if (panelAbierto) E.modo = 'panel';
    enCuadro = (ahora, dt) => {
      const now = guia ? Math.round(vt(ahora)) : Math.round(ahora - t0) + tv0, m = propio ? alDia(ctx, conf, ent, now, ctl) : simular(ctx, conf, ent, now), M = m.M;
      const s = propio ? senalDe(m, now, ctl) : null; sAhora = s; let leyenda = '';
      if (guia) {
        let vel = guia.vel, tope = Infinity, clave = null;
        if (s && guia.para.has(s.clave)) { clave = s.clave; tope = s.tipo === 'cierre' ? s.objetivo : R.clave === clave ? R.tope : now; }
        else if (s && s.tipo === 'empuja') { vel = guia.empuje && now >= s.desde && ahora - ultTecla > guia.porToque ? 0 : 1; if (guia.empuje) leyenda = conTecla(GUIA.empuja, T); }
        else { vel = 1; if (guia.empuje && s && s.clave === 'aguanta') leyenda = GUIA.aguanta; }
        if (vel !== R.vel || tope !== R.tope) { const v = vt(ahora); R.vb = v; R.tb = ahora; R.vel = vel; R.tope = Math.max(tope, v); }
        R.clave = clave; parado = R.tope < Infinity && vt(ahora) >= R.tope;
        if (clave) leyenda = parado ? `${s.paso} de ${s.de} · ${conTecla(GUIA[clave], T)}` : guia.estricto ? 'Mirá el círculo: cuando se cierra sobre el aro, tocás.' : '';
      }
      E.intento.m = m; E.intento.now = now; E.intento.senal = s; E.intento.parado = parado; if (guia) { E.intento.vel = R.vel; E.intento.seDetiene = !!R.clave; }
      if (ctx.reloj) setReloj(m.rodilla ? Math.max(0, ctx.reloj - (m.movs[0]?.tk ?? now)) : ctx.reloj - now);
      if (E.modo === 'panel' && conf !== null) E.modo = propio ? 'intento' : 'tv';
      // pose y barra
      const pose = m.res && m.res.res === 'fallo' ? null : poseDe(m, Math.min(now, m.res ? m.res.t : now), P), p = M?.pelea, Tm = p ? p.T / 1e6 : m.temblor / 1e6;
      if (pose) { escena.posar(pose, lev, dt, m.fase === 'pelea' || m.fase === 'traba' || m.fase === 'fijacion' ? Tm : 0, ahora / 1000); grab.push({ t: now, pose, y: escena.barY, z: escena.barZ }); }
      if (pose && m.tConf !== undefined && !m.res) { const mon = E.monitor; mon.cuadros++; mon.barraMin = Math.min(mon.barraMin, escena.barY); mon.alto[E.pantalla] = Math.max(mon.alto[E.pantalla] || 0, escena.barY); if (escena.barY > .26) mon.manosMax = Math.max(mon.manosMax, escena.manosBarra()); }
      // cámara: nunca hay corte con una ventana abierta
      if (m.fase !== visto.fase) {
        if (m.fase === 'acomodo') escena.camara(camPrincipal());
        if (m.fase === 'fijacion' && m.trabaMs < 0 && !camFija) { escena.primerPlano('arriba'); camFija = true; }
        if (m.fase === 'tiron' || m.fase === 'flexion') sonido.despegue();
        visto.fase = m.fase;
      }
      // palabra de cada toque y sonidos
      if (!facil && M && M.grado && visto.tens !== M.tp) { visto.tens = M.tp; decir(TENS[M.grado], { mal: M.grado === 'floja' }); }
      if (m.gestos.length > visto.gestos) {
        const g = m.gestos[m.gestos.length - 1], W = PALABRAS[g.pal]; visto.gestos = m.gestos.length;
        // en Fácil, TEMPRANO y TARDE van en ámbar si el levantamiento sigue; el rojo queda para el fallo
        // en Fácil la palabra lleva el verbo del toque que califica: cuando ya se ve la señal siguiente no se confunde con ella
        decir((facil ? (g.g === 'recepcion' ? '¡RECIBÍ! ' : g.mov === 'j' ? '¡ARRIBA! ' : '¡EXPLOTÁ! ') : '') + W.txt + (!facil && g.pal === 'bien' ? ` ${g.e > 0 ? '+' : '−'}${Math.abs(g.e)} ms` : ''), { nota: true, ...(facil ? { floja: !!W.floja && !g.fuera, mal: !!g.fuera } : { mal: !!W.floja }) });
        if (g.g === 'explosion') sonido.explosion(g.pal === 'perfecto');
      }
      if (m.amagues > visto.amagues) { visto.amagues = m.amagues; if (propio) decir('MUY TEMPRANO', { floja: true }); }
      if (M && M.tc && now >= M.tc && visto.rec !== M.tc) { visto.rec = M.tc; sonido.recepcion(); }
      if (facil && s && s.tipo === 'cierre' && (s.clave === 'explota' || s.clave === 'arriba') && now >= s.objetivo && visto.tic !== s.desde) { visto.tic = s.desde; sonido.tic(); }
      if (m.toques > visto.toques) { visto.toques = m.toques; if (propio) sonido.toque(); }
      const f = m.fij, abajo = !!f && f.firme && now >= f.tb; if (abajo && !chic) { chic = true; sonido.chicharra(); }
      const envTxt = m.fase === 'hombros' && propio && !facil ? 'ENVIÓN: ' + ENVIONES[env].toUpperCase() : '';      // en Fácil lo dice la señal, sin tapar al pesista
      cartel(m.res || leyenda ? '' : facil ? envTxt : f ? (abajo ? '¡ABAJO!' : '¡AGUANTÁ!') : envTxt, abajo ? 'abajo' : '');
      // la señal fija (jugador) y las ayudas pegadas a la barra (Clásico y rivales)
      const edad = (ahora - palT) / 1000;
      if (propio) { senalUI.pintar(E.modo === 'panel' ? null : s, now, pal ? { ...pal, edad } : null, { parado }); guiaTxt(leyenda); const z = s && s.tipo !== 'espera' && s.tipo !== 'auto' ? s.verbo : s ? '···' : 'Tocá acá'; if ($('zona-txt').textContent !== z) $('zona-txt').textContent = z; }
      if (facil) ayudas.limpiar();
      else if (DIBUJA && E.modo !== 'panel') {
        const A = { bar: escena.pantalla() };
        if ((m.fase === 'tension' || m.fase === 'hombros') && now >= M.ign) A.anillo = (((now - ctx.cal - M.t0) % m.per) + m.per) % m.per / m.per;
        if (m.fase === 'tiron' || m.fase === 'tension') { A.linea = escena.pantalla(escena.alturaMuestra(mk.potencia)); if (M.tp && m.fase === 'tiron') A.lineaLejos = Math.abs(M.tx - now) / Math.max(1, M.tx - M.tp); }
        if (m.fase === 'flexion' || m.fase === 'hombros') { A.linea = escena.pantalla(escena.alturaMuestra(mk.flexion)); if (m.fase === 'flexion') A.lineaLejos = Math.abs(M.tx - now) / Math.max(1, M.tx - M.tp); }
        if ((m.fase === 'vuelo' || m.fase === 'empuje') && !M.tq) A.rec = (M.tc - now) / (M.tc - M.tr);
        if (pal && !propio) A.palabra = { ...pal, edad };
        if (p && (m.fase === 'pelea' || m.fase === 'traba')) A.pelea = { modo: p.modo, aguja: p.aguja, exi: p.exiAhora, franja: 100, P: p.P / 1e6, T: p.T / 1e6, L: p.L === null ? null : p.L / 1e6 };
        ayudas.dibujar(A);
      }
      // el cierre se demora un cuadro largo: una entrada con fecha anterior todavía puede llegar
      if (m.res && tRes === null) tRes = ahora - (now - m.res.t) / (guia ? R.vel || 1 : 1);      // instante del reloj del juego en que terminó
      if (m.res && !fin && now >= m.res.t + (propio ? 80 : 0)) {
        cerrar(); resolver({ conf, ent, res: m.res, grab, m, tRes });
      }
    };
  });
}

// ---------- después del intento: la barra que cae, las luces y la repetición ----------
/** Muestra global de «Parado» (de pie detrás de la barra): adonde vuelve el pesista después de soltar. */
const PARADO = P => { const G = tramo(P, 'clean'); return G.base + G.i('Parado'); };
/**
 * Escena del final de un intento (game/caida.js): con qué pose terminó, cómo se suelta la barra y adónde va el pesista.
 * null si no hay nada que mostrar (no se levantó la barra).
 */
function armarFinal(r, lev) {
  if (!r || !r.grab || !r.grab.length || !escena.P) return null;
  const M = r.m?.movs?.[r.m.movs.length - 1], g = r.grab[r.grab.length - 1];
  const c = armarCaida(r.res, M?.mov, { y: g.y, z: g.z }, escena.pisoBarra); if (!c) return null;
  return Object.assign(c, { g0: g.pose.base + g.pose.s, pose: g.pose, destino: PARADO(escena.P), lev, golpes: 0 });
}
/**
 * Dibuja el final en el instante t (s desde que terminó el intento). Antes de soltar, la pose del final con la barra en las
 * manos; después, la barra suelta (física simple) y el pesista que se mezcla hacia «Parado». `vivo`: con sonido.
 */
function dibujarFinal(c, t, dt, vivo) {
  const tb = t - c.pl.suelta;
  if (tb < 0) { escena.posar(c.pose, c.lev); return; }
  escena.posarMezcla(poseCaida(c.pl, c.g0, c.destino, t)); const b = c.barra.en(tb); escena.barraSuelta(b, dt);
  if (vivo) for (; c.golpes < b.golpes.length; c.golpes++) { const v = b.golpes[c.golpes].v; sonido.golpe(v); if (c.golpes === 0 && c.tipo !== 'bajada') sonido.lamento(); }
}
/** El final quieto, en su último cuadro (cuando se saltea). */
const terminarFinal = c => { if (c) { c.golpes = 1e9; dibujarFinal(c, c.dur + 5, 0, false); } };

/**
 * Lo que sigue al intento, en una sola línea de tiempo que se saltea entera con Espacio (pasado un mínimo, para que el
 * toque que venía de la subida no saltee nada): la barra que cae o se deja caer (`o.fin`, de armarFinal), las luces de a
 * una, el veredicto y su línea. En un intento propio, debajo del veredicto va qué pasó y qué hacer distinto (`o.ctl`).
 * Válido: sostiene la barra arriba mientras se prenden las luces blancas, la tribuna ovaciona, la deja caer y la cámara
 * gira hacia el público. Fallo: la cámara sigue la barra que cae y la tribuna se lamenta.
 */
async function decision(a, lev, res, et, propio, o = {}) {
  visita('decision'); E.modo = 'tv'; const lento = et?.some(e => e === 'oro' || e === 'medalla' || e === 'todo_o_nada');
  const fin = o.fin || null, ok = res.res === 'valido';
  if (!fin) { if (res.res === 'fallo') sonido.fallo(); escena.posar(poseParado(escena.P, lev), lev); escena.camara('rev'); }
  // un toque que llegó cuando la barra ya estaba perdida (o recién terminado el intento) no pasa por «no tocaste»: la línea dice
  // que fue tarde. Uno descartado más de 400 ms después del final ya es otra cosa (por ejemplo, saltear el veredicto)
  const tarde = propio && o.tRes ? toques.ultimos.find(T => T.via !== 'mouse' && T.ok === false && T.t > o.tRes - 400 && T.t < o.tRes + 900 && (T.motivo === 'tarde' || T.motivo === 'termino' || (T.t >= o.tRes && T.t < o.tRes + 400))) : null;
  const b = res.luces.filter(Boolean).length, luces = `jueces ${b} a ${3 - b}`, linea = propio ? explicar(res, o.ctl || 'c', tactil(), { ...o, tardio: tarde ? Math.max(0, Math.round(tarde.t - o.tRes)) : undefined }) : '';
  const sub = propio ? (linea ? linea + (res.res === 'fallo' ? '' : ` · ${luces}`) : o.sub ? `${o.sub} · ${luces}` : luces) : (res.causa ? CAUSAS[res.causa] + ' · ' : '') + luces;
  if (propio) (E.propios ||= []).push({ pantalla: E.previa || '', res: res.res, causa: res.causa, linea, ctl: o.ctl || 'c' });
  // momentos (s desde el final del intento)
  const paso = lento ? .55 : .3, tLuz = fin && !ok ? .45 : fin ? .2 : .25, tVer = tLuz + 2 * paso + .25;
  const tCaida = fin ? fin.pl.suelta : 0, tRev = ok && fin ? tCaida + 1.1 : Infinity;
  const total = Math.max(tVer + (propio ? (linea ? 4.2 : 1.9) : 1.3), fin ? fin.dur : 0);
  if (fin && !ok) escena.primerPlano('caida');
  const t0 = reloj.ahora(), d = [null, null, null], hito = { luz: 0, ver: false, caida: !fin || !ok, rev: false };
  const avanzar = (t, dt, vivo) => {
    if (fin) dibujarFinal(fin, t, dt, vivo);
    while (hito.luz < 3 && t >= tLuz + hito.luz * paso) { const i = hito.luz++; d[i] = res.luces[i]; setLuces(d); if (vivo) { sonido.luz(d[i]); if (ok && i === 1) sonido.festejo(lento ? 1 : .6); } }
    if (!hito.caida && t >= tCaida) { hito.caida = true; escena.primerPlano('caida'); }
    if (!hito.rev && t >= tRev) { hito.rev = true; escena.camara('rev'); }
    if (!hito.ver && t >= tVer) { hito.ver = true; veredicto(ok ? 'Levantamiento válido' : res.res === 'nulo' ? 'Levantamiento nulo' : 'Intento fallado', sub, !ok); if (vivo && !ok && (!fin || fin.tipo === 'bajada')) sonido.ovacion(false); }
  };
  enCuadro = (ahora, dt) => avanzar((ahora - t0) / 1000, dt, true);
  await saltable(total * 1000, propio ? (linea ? 1200 : 600) : 400);
  enCuadro = null; avanzar(Math.max(total, tVer, tRev, tLuz + 3 * paso) + .01, 0, false); terminarFinal(fin);
  veredicto(''); setLuces(null);
  return linea;
}

/**
 * Repetición lateral de lo que se dibujó (no del clip fijo), con la traza de la barra, a un tercio de la velocidad; si el
 * intento se perdió, sigue la caída de la barra a media velocidad. Se saltea con Espacio. Abajo, el motivo en una línea.
 */
async function repeticion(lev, r, linea = '', fin = null) {
  const M = r.m.movs[r.m.movs.length - 1]; if (!M || !M.tr || !r.grab.length) return;
  const de = M.tr - 400, a = Math.min(r.res.t, (M.tc || M.tr) + 600), cuadros = r.grab.filter(g => g.t >= de && g.t <= a); if (cuadros.length < 4) return;
  const caida = fin && r.res.res === 'fallo' ? fin : null, LENTO = 3, tLev = (a - de) * LENTO, tCaida = caida ? Math.min(caida.dur, 2) * 2000 : 0;
  visita('repeticion'); E.modo = 'intento'; escena.camara('lado'); escena.trace.buildPoints(cuadros.map(g => ({ y: g.y, z: g.z })), 1.16); escena.trace.group.visible = true;
  veredicto('Repetición', linea || (r.res.causa ? CAUSAS[r.res.causa] : 'cámara lenta'), r.res.res !== 'valido'); $('veredicto').classList.add('arriba');
  const t0 = reloj.ahora(); let listo = false, enCaida = false; const corte = saltable(tLev + tCaida + 300, 300).then(() => { listo = true; });
  enCuadro = (ahora, dt) => {
    const x = ahora - t0;
    if (x <= tLev || !caida) { const t = de + Math.min(x, tLev) / LENTO; let k = 0; while (k + 1 < cuadros.length && cuadros[k + 1].t <= t) k++; escena.posar(cuadros[k].pose, lev); escena.trace.setCount(k); return; }
    if (!enCaida) { enCaida = true; escena.trace.group.visible = false; escena.primerPlano('caida'); caida.barra.reset(); }
    dibujarFinal(caida, Math.min(caida.dur, (x - tLev) / 2000), dt / 2, false);
  };
  await corte; enCuadro = null; if (!listo) return; escena.trace.group.visible = false; veredicto(''); escena.posar(poseParado(escena.P, lev), lev); E.modo = 'tv';
}

// ---------- pantallas ----------
async function inicio() {
  visita('inicio'); zocalo(null); relojLibre(); const primera = !guardado.get('tarima.jugadas');
  const cfg = { id: guardado.get('tarima.pesista') || 'ventura', nivel: guardado.get('tarima.nivel') || 'amistoso', ritmo: params.get('ritmo') === 'completa' ? 'completa' : 'expres', ctl: (params.get('ctl') || guardado.get('tarima.ctl')) === 'c' ? 'c' : 'f' };
  if (!IDS.includes(cfg.id)) cfg.id = 'ventura';
  for (;;) {
    const T = tactil(), facil = cfg.ctl === 'f', falta = !guardado.get('tarima.tutorial'); E.ctl = cfg.ctl;
    const pn = capa.poner(`<h1>${EVENTO.titulo}</h1><p>${EVENTO.sesion} · tres pesistas, tres intentos de arranque y tres de dos tiempos. Gana el mejor total.</p>
      <div class="como"><h2>Cómo se juega</h2>${pasosHTML(cfg.ctl, T)}${T ? '' : MENUS}</div>
      <div class="fila"><span>Controles:</span><button class="ctl" data-c="f" aria-pressed="${facil}">Fácil</button><button class="ctl" data-c="c" aria-pressed="${!facil}">Clásico</button><small class="nota">${facil ? 'Un toque por señal.' : 'Mantener y soltar, con ventanas más justas.'}</small></div>
      <h2>Elegí tu pesista</h2><div class="pesistas">${IDS.map(id => { const f = datos.atletas[id], P = PLANTEL[id]; return `<button class="pesista" data-id="${id}" aria-pressed="${id === cfg.id}"><div class="b" style="background:${P.bandera}"></div><b>${f.nombre}</b><small>${f.pais} · dorsal ${f.dorsal}<br>${P.bio} · ${P.lema}<br>Tope: ${f.techo.s} arranque · ${f.techo.c} dos tiempos${facil ? '' : ` · ${f.enviones.map(e => ENVIONES[e]).join(' y ')}`}<br>${P.juego}</small></button>`; }).join('')}</div>
      <div class="fila"><span>Rivales:</span>${['amistoso', 'normal', 'dificil'].map(n => `<button class="nivel" data-n="${n}" aria-pressed="${n === cfg.nivel}">${n === 'dificil' ? 'Difícil' : n[0].toUpperCase() + n.slice(1)}</button>`).join('')}
        <span class="sep">Final:</span><button class="ritmo" data-r="expres" aria-pressed="${cfg.ritmo === 'expres'}">Exprés</button><button class="ritmo" data-r="completa" aria-pressed="${cfg.ritmo === 'completa'}">Completa</button></div>
      <div class="fila pie"><button class="ir" id="btn-empezar">Empezar</button><button id="btn-otro">${facil ? (falta ? 'Saltear tutorial' : 'Repetir tutorial') : 'Empezar sin calentamiento'}</button>${facil && falta ? '<small class="nota">La primera vez: un levantamiento guiado, menos de un minuto. No se vuelve a mostrar.</small>' : ''}</div>`);
    const b = await clic(pn, 'button');
    if (b.dataset.id) cfg.id = b.dataset.id; else if (b.dataset.n) cfg.nivel = b.dataset.n; else if (b.dataset.r) cfg.ritmo = b.dataset.r; else if (b.dataset.c) cfg.ctl = b.dataset.c;
    // el tutorial se ofrece una sola vez: queda anotado al salir del inicio (se haga o se saltee), así que recargar no lo repite
    else { const principalBtn = b.id === 'btn-empezar'; cfg.calentar = facil ? principalBtn === falta : principalBtn; cfg.primera = primera; if (facil) guardado.set('tarima.tutorial', '1'); break; }
  }
  guardado.set('tarima.pesista', cfg.id); guardado.set('tarima.nivel', cfg.nivel); guardado.set('tarima.ctl', cfg.ctl); capa.quitar(); return cfg;
}

/** Metrónomo de 8 toques: la mediana del atraso propone la corrección (0 a 100 ms), que queda fija para toda la partida. */
async function metronomo() {
  visita('metronomo'); const defecto = tactil() ? 40 : 0, PULSO = 700, N = 8;
  const pn = capa.poner(`<h2>Calentamiento · ritmo</h2><p>${tactil() ? 'Tocá la pantalla' : 'Tocá ESPACIO'} junto con cada pulso (${N} toques). Sirve para medir el atraso de tu dispositivo.</p><div class="pulso" id="pulso">${N}</div><div class="fila"><button id="btn-saltear">Saltear</button></div>`, 'chico', { foco: false });
  bloquear(pn); const t0 = E.metro = reloj.ahora() + 1200, errs = []; let salto = false, k = -1;
  clic(pn, '#btn-saltear').then(() => { salto = true; });
  boton.oye = (t, v, via) => { if (!v) return; if (via === 'mouse') return toques.resolver(false, 'mouse'); const x = t - t0, i = Math.round(x / PULSO), ok = i >= 0 && i < N; if (ok) errs[i] = x - i * PULSO; toques.resolver(ok, ok ? 'gesto' : 'espera'); };
  await new Promise(res => { enCuadro = ahora => { const x = ahora - t0, i = Math.floor(x / PULSO); if (i > k && i >= 0 && i < N) { k = i; sonido.tic(); $('pulso').textContent = N - i - 1 || '✓'; } $('pulso')?.classList.toggle('on', x >= 0 && x % PULSO < 140); if (salto || x > N * PULSO + 300) { enCuadro = null; res(); } }; });
  boton.oye = null; const e = errs.filter(x => x !== undefined).sort((a, b) => a - b);
  if (salto || e.length < 5) { capa.quitar(); return defecto; }
  const med = Math.round(Math.max(0, Math.min(100, e[e.length >> 1])));
  const p2 = capa.poner(`<h2>Atraso medido: ${med} ms</h2><p>La corrección queda fija para toda la partida. Solo se usa al medir tus gestos con ventana.</p><div class="fila"><button class="ir" id="cal-si" data-v="${med}">Usar ${med} ms</button><button id="cal-no" data-v="${defecto}">Dejar ${defecto} ms</button></div>`, 'chico');
  bloquear(p2); const b = await clic(p2, 'button'); capa.quitar(); return +b.dataset.v;
}

/** Calentamiento de Clásico: tres levantamientos de práctica, sin costo: dos livianos y uno pesado guionado que enseña la pelea y la chicharra. */
async function practica(cfg) {
  const f = datos.atletas[cfg.id], a = { id: cfg.id, f }, errs = [];
  const casos = [{ lev: 's', I: 8000, txt: 'Arranque liviano: apretá con el anillo lleno y mantené, soltá cuando la barra llega a la línea, apretá cuando el círculo se cierra y dejá apretado hasta ¡ABAJO!' },
    { lev: 'c', env: f.enviones[0], I: 8000, txt: `Dos tiempos liviano: lo mismo, y con la barra en los hombros otra vez apretar, soltar en el fondo de la flexión y apretar al recibir (${ENVIONES[f.enviones[0]]}).` },
    { lev: 's', I: 8600, exiFija: exigenciaTabla(9800), txt: 'Arranque pesado: la subida se traba. Tocá repetido para llevar la flecha a la franja verde, sin pasarte: empujar de más hace temblar.' }];
  await escena.mostrar(cfg.id);
  for (let k = 0; k < casos.length; k++) {
    const c = casos[k]; visita('practica'); escena.setCarga(k === 2 ? Math.round(f.techo.s * .98) : Math.round(f.techo[c.lev] * .6), c.lev); escena.posar(poseParado(escena.P, c.lev), c.lev); escena.camara(camPrincipal());
    zocalo(a, { lev: c.lev, n: 0, kg: escena.kg }); setReloj(25000);
    const pn = capa.poner(`<h2>Calentamiento ${k + 1} de ${casos.length}</h2><p>${c.txt}</p><div class="fila"><button class="ir" id="btn-practicar">Probar</button><button id="btn-saltear">Saltear calentamiento</button></div>`, 'chico abajo');
    bloquear(pn); const b = await clic(pn, 'button'); capa.quitar(); if (b.id === 'btn-saltear') break;
    const ctx = { lev: c.lev, env: c.env, I: c.I, exiFija: c.exiFija, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: 77 + k, cal: cfg.cal, primera: true, domina: true, jueces: [1000, 1000, 1000], reloj: 25000, ctl: 'c' };
    const r = await correrIntento(ctx, { a, lev: c.lev, env: c.env, conf0: 0 });
    for (const g of r.res.gestos) if (!g.fuera) errs.push(Math.abs(g.e));
    await decision(a, c.lev, r.res, null, true, { ctl: 'c', fin: armarFinal(r, c.lev) });
  }
  zocalo(null); return errs.length ? errs.reduce((x, y) => x + y, 0) / errs.length : null;
}

/**
 * Tutorial de Fácil (docs/CONTROLES.md, sección 6): UN arranque guiado en cámara lenta, que no se puede fallar (el reloj
 * se detiene y espera cada toque). Dura menos de un minuto, se ofrece una sola vez y se saltea en cualquier momento con Esc
 * o con el botón «Saltear tutorial». No hay prácticas: el dos tiempos se explica la primera vez que toca, en la final.
 */
async function tutorial(cfg) {
  const f = datos.atletas[cfg.id], a = { id: cfg.id, f };
  const ctx = { lev: 's', I: 8000, exiFija: exigenciaTabla(9300), tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: 71, cal: cfg.cal, primera: true, domina: true, jueces: [1000, 1000, 1000], reloj: 0, ctl: 'f' };
  await escena.mostrar(cfg.id); visita('tutorial');
  escena.setCarga(Math.round(f.techo.s * .8), 's'); escena.posar(poseParado(escena.P, 's'), 's'); escena.camara(camPrincipal()); zocalo(a, { lev: 's', n: 0, kg: escena.kg }); relojLibre(); setLuces(null);
  visita('guiado'); $('etiqueta').hidden = false; $('etiqueta').textContent = 'Tutorial · el juego espera cada toque'; $('saltar').hidden = false;
  const r = await Promise.race([correrIntento(ctx, { a, lev: 's', conf0: 0, guia: GUIADO }), new Promise(res => { E.saltar = () => res(null); })]);
  E.saltar = null; $('saltar').hidden = true; etiqueta(null);
  if (r) await decision(a, 's', r.res, null, true, { ctl: 'f', sub: 'Así se hace. Ahora, la final', practica: true, fin: armarFinal(r, 's') }); else E.intento?.cancelar();
  zocalo(null); return null;
}

/** Selector de apertura (88 % a 97 % del techo), con el valor sugerido. */
async function elegirApertura(p, lev, sugerida, html) {
  const [lo, hi] = p.rangoApertura(E.yo, lev); let kg = Math.max(lo, Math.min(hi, sugerida)), abierto = false;
  for (;;) {
    const pn = capa.poner(`${html}<h2>Tu apertura (primer intento) de ${LEV[lev].toLowerCase()}</h2><div class="fila kgsel"><button id="kg-menos" ${kg <= lo ? 'disabled' : ''}>−1</button><output id="kg-val">${kg}</output><span>kg</span><button id="kg-mas" ${kg >= hi ? 'disabled' : ''}>+1</button><button class="ir" id="btn-confirmar">Confirmar</button></div><p>Entre ${lo} y ${hi} kg. Sugerida: ${sugerida} kg. Una apertura alta ahorra un intento; tres nulos te dejan sin marca.${tactil() ? '' : ' <b>← →</b> cambian los kilos, <b>ENTER</b> confirma.'}</p>`);
    if (!abierto) { bloquear(pn); abierto = true; }      // el bloqueo es al abrir, no en cada kilo
    const b = await clic(pn, '#kg-menos,#kg-mas,#btn-confirmar');
    if (b.id === 'kg-menos') kg--; else if (b.id === 'kg-mas') kg++; else break;
  }
  capa.quitar(); p.abrir(E.yo, lev, kg);
}

async function presentacion(p, cfg, errMedio) {
  visita('presentacion'); const f = p.at[E.yo].f, G = p.guion;
  // apertura sugerida según el error medido en el calentamiento: 93,5 % para un jugador preciso, hasta 88 % para uno que todavía no agarró el ritmo
  // en Fácil las ventanas son el doble de anchas y la sugerencia sin medir es más prudente (90 %)
  const facil = cfg.ctl === 'f', pct = facil ? (errMedio === null ? .90 : Math.max(.88, Math.min(.93, .93 - (errMedio - 50) / 150 * .05))) : errMedio === null ? .935 : Math.max(.88, Math.min(.935, .935 - (errMedio - 30) / 60 * .055)), sug = Math.round(f.techo.s * pct);
  const forma = s => (s > 0 ? 'sale liviano' : s < 0 ? 'viene pesado' : 'normal'), yo = p.at[E.yo];
  const html = `<h1>Presentación</h1><div class="pesistas">${p.at.map(a => `<div class="pesista" style="border:1px solid var(--line);padding:.5em"><div class="b" style="background:${PLANTEL[a.id].bandera}"></div><b>${a.f.nombre}${a.i === E.yo ? ' · vos' : ''}</b><small>${a.f.pais} · dorsal ${a.f.dorsal}<br>${a.ctrl === 'juego' ? `Abre con ${a.decl.s} y ${a.decl.c}` : `Tope ${a.f.techo.s} / ${a.f.techo.c} kg`}</small></div>`).join('')}</div>
    <p><b>Guion de la final:</b> ${GUIONES[G.tipo](G.a >= 0 ? p.at[G.a].f.nombre : '')}</p><p><b>Tu forma del día:</b> arranque ${forma(yo.forma.s)}, dos tiempos ${forma(yo.forma.c)}. Rivales en nivel ${cfg.nivel} · controles ${facil ? 'Fácil' : 'Clásico'}.</p>`;
  await elegirApertura(p, 's', sug, html); E.pctApertura = pct;
}

/**
 * Dónde queda libre el lienzo con el panel abierto: a la izquierda si el panel va al costado, arriba si va al pie. Devuelve el
 * centro de esa parte ({x, y} en fracción del lienzo) y la distancia del plano americano para que entre de las rodillas
 * para arriba (1,6 m de alto y 1 m de ancho) en esa parte.
 */
function encuadreLibre() {
  const pn = $('capa').querySelector('.panel'), c = $('gl').getBoundingClientRect(); if (!c.width || !c.height) return null;
  let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
  if (pn) {
    const r = pn.getBoundingClientRect(), izq = (r.left - c.left) / c.width, arr = (r.top - c.top) / c.height;
    if (izq > .4) x1 = izq; else if (arr > .25) y1 = arr;
  }
  const fov = 22, tg = 2 * Math.tan(fov / 2 * Math.PI / 180), asp = c.width / c.height;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, dAbs: Math.max(1.6 / (tg * (y1 - y0)), 1 / (tg * asp * (x1 - x0))) };
}

/** Panel único del llamado propio: kilos (fichas y ajuste fino), envión, La cuenta, frase del entrenador y Confirmar. */
function panelLlamado(p, L, t0, alConfirmar, corre = true) {
  const a = p.at[L.a], min = p.minimo(L.a), tv = p.techoVisible(L.a, L.lev, false), facil = p.cfg.ctl === 'f', S = { kg: L.kg, env: guardado.get(`tarima.env.${p.cfg.ctl}.${a.id}`) || (facil ? 'split' : a.f.enviones[0]), mas: false, dt: facil && L.lev === 'c' && !guardado.get('tarima.dostiempos') };
  const fichas = { seguro: Math.max(min, Math.floor(tv * .95 / 1000)), justo: Math.max(min, Math.floor(tv * .99 / 1000)), jugado: Math.max(min, Math.ceil(tv * 1.02 / 1000)) };
  const frase = kg => { const x = kg * 1000 / tv; return x <= .95 ? '«Sale caminando.»' : x <= 1 ? '«Es para pelearla.»' : '«Es un tiro.»'; };
  const C = p.cuenta(L.a), cuenta = L.lev === 'c' ? (C.oro ? `Para el oro: ${C.oro}` : 'El oro no depende de vos') + (C.plata ? ` · Plata asegurada con ${C.plata}` : '') : (C.oro ? `Para liderar el arranque: ${C.oro}` : '');
  const FICHA = { seguro: 'Seguro', justo: 'Justo', jugado: 'Arriesgado' };
  const pinta = () => {
    const ms = corre ? reloj.ahora() - t0 : 0, fijo = a.cambios >= 2 || ms > L.reloj - RELOJ.cambiosHasta, seg = `0:${String(L.reloj / 1000).padStart(2, '0')}`, T = tactil();
    const kilos = `<div class="fila kgsel"><button id="kg-menos" ${fijo || S.kg <= min ? 'disabled' : ''}>−1</button><output id="kg-val">${S.kg}</output><span>kg</span><button id="kg-mas" ${fijo || S.kg >= KG_MAX ? 'disabled' : ''}>+1</button><button class="ir" id="btn-confirmar">Confirmar</button></div>`;
    const atajos = `<div class="fila">${facil ? '<span>Kilos:</span>' : ''}${Object.entries(fichas).map(([k, v]) => `<button class="ficha" data-kg="${v}" ${fijo ? 'disabled' : ''} aria-pressed="${v === S.kg}">${FICHA[k]} ${v}</button>`).join('')}</div>`;
    const envion = L.lev === 'c' ? `<div class="fila"><span>Envión:</span>${Object.keys(ENVIONES).map(e => `<button class="envion" data-env="${e}" aria-pressed="${e === S.env}">${ENVIONES[e]}${a.f.enviones.includes(e) ? '' : ' *'}</button>`).join('')}</div>` : '';
    const noDomina = L.lev === 'c' && !a.f.enviones.includes(S.env) ? ' · * envión que no domina: menos altura y menos desvío tolerado' : '';
    const reloj0 = corre ? `<b>El reloj ya corre.</b> ${T ? 'Confirmá' : '<b>ENTER</b> confirma'} y el pesista se prepara.` : `<b>Sin apuro: el reloj (${seg}) arranca cuando confirmás.</b> ${T ? 'Después, tocá la pantalla en ¡TIRÁ!' : '<b>ENTER</b> confirma; después, <b>ESPACIO</b> en ¡TIRÁ!'}`;
    // Fácil: a la vista quedan los kilos, qué dice el entrenador, la cuenta y qué tecla va; el resto, en «Más opciones»
    const cuerpo = facil
      ? `${kilos}<p class="frase">Entrenador: ${frase(S.kg)} Más kilos, más difícil${T ? '' : ' (<b>← →</b> cambian los kilos)'}.</p>${cuenta ? `<p class="cuenta">${cuenta}</p>` : ''}
        ${S.dt ? `<p class="que"><b>Dos tiempos:</b> empieza igual que el arranque. Con la barra en los hombros el juego te espera: son tres toques más, <b>¡FLEXIONÁ!</b>, <b>¡ARRIBA!</b> y <b>¡RECIBÍ!</b></p>` : ''}<p class="que">${reloj0}</p>
        ${S.kg !== L.kg ? `<p class="chica"><b>Cambiaste los kilos</b> (pedido: ${L.kg}). Se puede dos veces por intento; si otro pesista pidió menos, sale antes que vos.</p>` : ''}${fijo ? '<p class="chica">Los kilos ya no se pueden cambiar.</p>' : ''}
        ${S.mas ? `${atajos}${envion}<p class="chica">Pedido: ${L.kg} kg · mínimo ${min} · cambios ${a.cambios} de 2${noDomina}</p>` : ''}<div class="fila"><button id="btn-mas" aria-expanded="${!!S.mas}">${S.mas ? 'Menos opciones' : 'Más opciones'}</button></div>`
      : `${kilos}${atajos}${envion}<p class="frase">Entrenador: ${frase(S.kg)}</p><p class="cuenta">${cuenta}</p><p class="que">${reloj0}</p>
        <p class="chica">Declarado: ${L.kg} kg · mínimo ${min} · cambios ${a.cambios} de 2${fijo ? ' (cerrados)' : ''}${S.kg !== L.kg ? ' · <b>confirmar cuenta como cambio; si otro pidió menos, sale antes</b>' : ''}${noDomina}</p>`;
    const pn = capa.poner(`<h2>${a.f.nombre} · ${LEV[L.lev]} · intento ${L.n}</h2>${cuerpo}`, 'chico abajo lado');      // al costado: no tapa al pesista
    const al = (b, fn) => { b.onclick = () => { if (activa(pn)) fn(); }; };
    al(pn.querySelector('#kg-menos'), () => { S.kg--; pinta(); }); al(pn.querySelector('#kg-mas'), () => { S.kg++; pinta(); });
    pn.querySelectorAll('.ficha').forEach(b => al(b, () => { S.kg = +b.dataset.kg; pinta(); }));
    pn.querySelectorAll('.envion').forEach(b => al(b, () => { S.env = b.dataset.env; pinta(); }));
    const mas = pn.querySelector('#btn-mas'); if (mas) al(mas, () => { S.mas = !S.mas; pinta(); });
    al(pn.querySelector('#btn-confirmar'), () => { sonido.activar(); guardado.set(`tarima.env.${p.cfg.ctl}.${a.id}`, S.env); alConfirmar(S); });
    return pn;
  };
  bloquear(pinta());      // el foco queda en Confirmar: Enter o Espacio confirman; ← → cambian los kilos
}

/**
 * Llamado del jugador: panel, intento, luces y repetición. En Clásico el reloj corre con el panel abierto (si llega a cero,
 * es nulo). En Fácil el panel no gasta reloj: arranca al confirmar (el registro guarda `conf: 0`) y el jugador tiene el
 * minuto entero para tocar en ¡TIRÁ!, con cuenta regresiva en la señal en los últimos 10 s.
 */
async function llamadoPropio(p, L) {
  visita('llamado'); const a = p.at[L.a];
  await escena.mostrar(a.id); escena.setCarga(L.kg, L.lev); escena.posar(poseParado(escena.P, L.lev), L.lev); zocalo(a, L); etiqueta(L.et); setLuces(null);
  const corre = p.cfg.ctl !== 'f'; let t0 = reloj.ahora(), ctx = null, env, kgFinal = L.kg, desplazado = false, corrida = null;
  const elegido = new Promise(res => panelLlamado(p, L, t0, res, corre)); setReloj(L.reloj);
  escena.primerPlano('medio', encuadreLibre()); E.forzar = true;      // plano americano del pesista en la parte que el panel deja libre
  const vence = new Promise(res => { if (corre) enCuadro = ahora => { setReloj(L.reloj - (ahora - t0)); if (ahora - t0 >= L.reloj) { enCuadro = null; res(null); } }; });
  const S = await Promise.race([elegido, vence]); enCuadro = null; capa.quitar();
  if (!corre) t0 = reloj.ahora();
  const ms = corre ? Math.min(L.reloj, Math.round(reloj.ahora() - t0)) : 0;
  if (S) {
    env = L.lev === 'c' ? S.env : undefined;
    if (S.kg !== L.kg && !p.cambioValido(ms, S.kg)) { desplazado = p.cambio(ms, S.kg).desplazado; if (!desplazado) kgFinal = S.kg; }
    if (desplazado) { visita('desplazado'); etiqueta(null); veredicto(`${a.f.nombre} pasa a ${S.kg} kg`, 'Otro pesista pidió menos: sale antes. Tu reloj vuelve a empezar.'); await saltable(1800); veredicto(''); return; }
    escena.setCarga(kgFinal, L.lev); zocalo(a, { ...L, kg: kgFinal }); etiqueta(p.llamado.et);
    ctx = p.contexto(env); visita('intento');
    // el primer dos tiempos en Fácil se explica sobre la marcha: con la barra en los hombros el reloj espera el toque de ¡FLEXIONÁ!
    const primerDT = ctx.ctl === 'f' && L.lev === 'c' && !guardado.get('tarima.dostiempos');
    corrida = await correrIntento(ctx, { a, lev: L.lev, env, conf0: ms, t0, guia: primerDT ? EN_HOMBROS : null });
    if (primerDT && corrida.m.movs.length > 1) guardado.set('tarima.dostiempos', '1');
  } else { env = L.lev === 'c' ? a.f.enviones[0] : undefined; ctx = p.contexto(env); corrida = { conf: null, ent: [], res: simular(ctx, null, []).res, grab: [], m: { movs: [] } }; }
  const et = p.llamado.et, x = p.resolver({ conf: corrida.conf, env, ent: corrida.ent });
  if (JSON.stringify(x.res) !== JSON.stringify(corrida.res)) E.errores.push('el resultado mostrado no coincide con el recalculado');
  const fin = armarFinal(corrida, L.lev), linea = await decision(a, L.lev, x.res, et, true, { ctl: ctx.ctl, sinConfirmar: corrida.conf === null, tRes: corrida.tRes, fin });
  const rival = p.at.find(b => b.i !== L.a); recuadro(x.res.res === 'valido' ? `${PLANTEL[rival.id].corto} aprieta los dientes` : `${PLANTEL[rival.id].corto} respira`, rival.id);
  await repeticion(L.lev, corrida, linea, fin);
  for (const c of x.avisos) { sonido.aviso(); veredicto(`${p.at[c.a].f.pais} cambia a ${c.a_kg}`, `${p.at[c.a].f.nombre} · antes ${c.de} kg`); await saltable(1100); veredicto(''); }
  recuadro(null); etiqueta(null); zocalo(null);
}

/** Intento de un rival: resumido en el tablero (exprés) o entero desde la salida (completa y decisivos). */
async function llamadoRival(p, L, cfg) {
  const a = p.at[L.a], x = p.resolverIA(), decisivo = L.et.some(e => e === 'oro' || e === 'medalla'), entero = cfg.ritmo === 'completa' || decisivo;
  setReloj(L.reloj); setLuces(null);
  if (entero) {
    visita('rival'); await escena.mostrar(a.id); escena.setCarga(L.kg, L.lev); escena.posar(poseParado(escena.P, L.lev), L.lev); escena.camara(camPrincipal()); zocalo(a, L); etiqueta(L.et);
    const r = await correrIntento(x.ctx, { a, lev: L.lev, env: x.env, gestos: { conf: x.conf, ent: x.ent } });
    await decision(a, L.lev, r.res, L.et, false, { fin: armarFinal(r, L.lev) });
  } else {
    visita('resumen'); const ok = x.res.res === 'valido', b = x.res.luces.filter(Boolean).length;
    const pn = capa.poner(`<h2>${a.f.nombre} · ${LEV[L.lev]} · intento ${L.n}</h2><div class="fila kgsel"><output>${L.kg}</output><span>kg</span><div class="luces" id="luces-r"><i></i><i></i><i></i></div><b id="res-r"></b></div>${tableroHTML(p, { yo: E.yo, sale: L.a })}<p>${tactil() ? 'Tocá' : 'ESPACIO'} para seguir.</p>`);
    const fin = saltable(2600); let corto = false; fin.then(() => { corto = true; });
    for (let i = 0; i < 3 && !corto; i++) { await Promise.race([espera(300), fin]); if (corto || !pn.isConnected) break; pn.querySelector('#luces-r').children[i].className = x.res.luces[i] ? 'b' : 'r'; sonido.luz(x.res.luces[i]); }
    if (pn.isConnected) { [...pn.querySelector('#luces-r').children].forEach((el, i) => { el.className = x.res.luces[i] ? 'b' : 'r'; }); pn.querySelector('#res-r').textContent = (ok ? 'Válido' : x.res.res === 'nulo' ? 'Nulo' : 'Fallado') + (x.res.causa ? ' · ' + CAUSAS[x.res.causa] : '') + ` · ${b} a ${3 - b}`; }
    await fin; capa.quitar();
  }
  etiqueta(null); zocalo(null);
}

/**
 * Cambio de carga entre intentos: la manga de la barra de cerca, con los discos que salen y entran deslizando, el collarín
 * y el golpe metálico de cada uno, y los kilos que cambian a medida que llegan. La tarima queda vacía (los ayudantes que
 * cargan necesitan modelo y animación propios: etapa de arte). Se saltea con Espacio.
 */
async function carga(kg, lev) {
  if (!escena.P || kg === escena.kg) return; visita('carga'); E.modo = 'tv';
  if (escena.activo) { escena.posar(poseParado(escena.P, lev), lev); await escena.mostrar(null); }
  const z = escena.barZ ?? 0, apoya = () => escena.barraSuelta({ y: escena.pisoBarra, z, ang: 0 }); apoya();
  const kg0 = escena.kg, A = escena.cambioDeCarga(kg);
  if (!A) { escena.setCarga(kg, lev); return; }
  escena.primerPlano('manga'); let ult = null; const vistas = { s: 0, l: 0 };
  const pinta = k => { if (k !== ult) { ult = k; veredicto(`Cambio de carga · ${k} kg`, `antes ${kg0} kg`); } };
  pinta(kg0); const t0 = reloj.ahora();
  enCuadro = ahora => {
    const x = A.en((ahora - t0) / 1000); apoya(); pinta(x.kg);
    if (x.salidas > vistas.s) { vistas.s = x.salidas; sonido.roce(); }
    if (x.llegadas > vistas.l) { vistas.l = x.llegadas; sonido.metal(x.llegadas === A.entra ? 1.3 : 1); }
  };
  await saltable(A.dur * 1000 + 650, 300); enCuadro = null; A.en(99); escena.setCarga(kg, lev); apoya(); veredicto('');
}

async function intervalo(p) {
  visita('intervalo'); const f = p.at[E.yo].f, sug = Math.round(f.techo.c * (E.pctApertura || .935));
  await elegirApertura(p, 'c', sug, `<h1>Intervalo</h1>${tableroHTML(p, { yo: E.yo })}<p>Descanso: los tres recuperan energía (15 de Resto).</p>`); p.empezar();
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
  // Los dos modelos se terminan de cargar antes de jugar (venían bajando desde el inicio): leer un GLB, compilar sus shaders o
  // subir sus texturas en medio de un levantamiento es un tirón. Todo eso lo hace escena.precalentar() (arrancó en el inicio,
  // detrás del panel) y recién después se calibra la calidad.
  $('msg').hidden = false; $('msg').textContent = 'Cargando pesistas…'; await Promise.all(IDS.map(id => escena.cargar(id)));
  await escena.mostrar(cfg.id); escena.posar(poseParado(escena.P, 's'), 's'); escena.camara(camPrincipal());
  if (DIBUJA) { E.sinDibujo = true; await E.precal; E.sinDibujo = false; await calibrar(); }
  $('msg').hidden = true; E.forzar = true;
  if (cfg.calentar) { if (cfg.ctl === 'f') errMedio = await tutorial(cfg); else { cfg.cal = await metronomo(); errMedio = await practica(cfg); } }
  const p = E.p = new Partida(datos, { semilla, nivel: cfg.nivel, cal: cfg.cal, primera: cfg.primera, ctl: cfg.ctl, atletas: IDS.map((id, i) => ({ id, ctrl: i === E.yo ? 'persona' : 'juego' })) });
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
  const refresco = medirRefresco();
  const [poses, sim] = await Promise.all(['data/poses.json', 'data/sim.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); })));
  datos = leerDatos(sim);
  await Promise.all([`800 20px 'Saira Condensed'`, `700 20px 'Saira Condensed'`, `500 20px 'Saira Condensed'`].map(f => document.fonts.load(f).catch(() => null)));
  Object.assign(C, calidadInicial(params.get('q'), tactil())); fijarHz(await refresco);
  if (C.auto) C.Q = { ...C.Q, dpr: 2 };      // en automático el tope de píxeles lo pone la calibración, no la densidad de cada calidad
  escena = new Escena($('gl'), C.Q, { reduceMotion }); escena.poses = poses; nombrar();
  if (C.auto) { gov = new Gobernador(C.hz); gov.calentar(reloj.ahora(), 4000); }
  // los modelos bajan mientras se mira el inicio; apenas están, se compila y se usa una vez todo lo que se va a dibujar
  const cargas = IDS.map(id => escena.cargar(id).catch(() => null));
  if (params.get('banco') === '1') { $('msg').textContent = 'Banco de medición…'; const { correrBanco } = await import('./banco.js'); correrBanco({ escena, cargas, hz: C.hz, params, msg: $('msg') }); return; }
  E.precal = DIBUJA ? Promise.all(cargas).then(() => escena.precalentar()).catch(e => { console.warn('precalentar:', e); }) : Promise.resolve();
  ayudas = new Ayudas($('ayudas')); senalUI = new Senal($('senal'), tactil()); boton = new Boton([$('escena'), $('zona')]);
  addEventListener('keydown', alTeclado, true); $('pausa').onclick = () => abrirSobre('pausa'); $('saltar').onclick = () => E.saltar?.();
  ponerAcuse(); if (params.get('depura') === '1') depura = new Depura($('depura'), () => ({ perf: perf.ult, calidad: window.JUEGO.calidad, toques, pantalla: E.pantalla }));
  $('ev-titulo').textContent = EVENTO.titulo; $('ev-sub').textContent = EVENTO.sesion; $('msg').hidden = true;
  ultimo = reloj.ahora(); requestAnimationFrame(bucle);
  (async () => { let cfg = null; for (;;) { if (!cfg) cfg = await inicio(); const revancha = await partida(cfg); if (revancha) cfg = { ...cfg, calentar: false, primera: false }; else cfg = null; } })().catch(e => { E.errores.push(String(e.stack || e)); console.error(e); $('msg').hidden = false; $('msg').textContent = 'El juego se detuvo por un error'; });
}

// ---------- holguras de la escena del final (para la prueba) ----------
/** Distancia mínima entre los segmentos p0-p1 y q0-q1 (Ericson, «Real-Time Collision Detection», 5.1.9). */
function distSeg(p0, p1, q0, q1) {
  const d1 = p1.clone().sub(p0), d2 = q1.clone().sub(q0), r = p0.clone().sub(q0), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return r.length();
  if (a <= 1e-12) t = Math.min(1, Math.max(0, f / e));
  else { const c = d1.dot(r); if (e <= 1e-12) s = Math.min(1, Math.max(0, -c / a)); else { const b = d1.dot(d2), den = a * e - b * b; s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); } } }
  return p0.clone().addScaledVector(d1, s).distanceTo(q0.clone().addScaledVector(d2, t));
}
// segmentos del cuerpo con su radio (m): lo que la barra no puede atravesar
const MIEMBROS = [['Hips', 'Spine2', .13], ['Spine2', 'Neck', .11], ['Neck', 'Head', .06], ['Head', 'Head', .11],
  ...['Left', 'Right'].flatMap(L => [[L + 'UpLeg', L + 'Leg', .075], [L + 'Leg', L + 'Foot', .05], [L + 'Foot', L + 'ToeBase', .045], [L + 'Arm', L + 'ForeArm', .045, 1], [L + 'ForeArm', L + 'Hand', .04, 1], [L + 'Hand', L + 'HandMiddle1', .03, 1]])];
/**
 * Holgura (m) entre la barra suelta y el cuerpo: distancia del eje (y de los discos, para lo que queda a los costados) a
 * cada segmento, menos los radios. Negativa: la barra atraviesa el cuerpo. Los brazos se miden desde 0,25 s después de
 * soltar (antes la barra recién sale de las manos).
 */
function holgura(tb) {
  const a = escena.activo; if (!a || tb < 0) return null;
  const V = escena.barbell.group.position.constructor, b = escena.barbell.group.position, R = escena.pisoBarra;
  const e0 = new V(-.62, b.y, b.z), e1 = new V(.62, b.y, b.z), todos = {}; let min = { h: 9, que: '' };
  for (const [x, y, r, brazo] of MIEMBROS) {
    if (brazo && tb < .25) continue;
    const p = a.boneWorld(x, new V()), q = a.boneWorld(y, new V()), que = x + (x === y ? '' : '-' + y);
    let h = distSeg(e0, e1, p, q) - r - .014;
    for (const P of [p, q]) if (Math.abs(P.x) > .66 && Math.abs(P.x) < 1) h = Math.min(h, Math.hypot(P.y - b.y, P.z - b.z) - R - r);      // contra los discos
    todos[que] = Math.round(h * 1000) / 1000; if (h < min.h) min = { h, que };
  }
  return { h: Math.round(min.h * 1000) / 1000, que: min.que, y: Math.round(b.y * 1000) / 1000, z: Math.round(b.z * 1000) / 1000, todos };
}

// ---------- API para la prueba automática y la depuración ----------
const ceder = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
window.JUEGO = {
  E, perf, reloj, toques, get calidad() { return { nombre: C.nombre, auto: C.auto, clave: C.clave, sombras: C.sombras, hz: C.hz, meta: +metaDe(C.hz).toFixed(2), paso: C.paso, periodo: +(1000 / metaDe(C.hz)).toFixed(2), medido: C.medido, cambios: C.cambios, megapixeles: escena ? +escena.megapixeles.toFixed(2) : 0, nativo: escena ? +escena.nativoMP.toFixed(2) : 0, ventana: gov ? gov.ult : null, quieto: gov ? gov.quieto : false, gobernador: gov ? gov.estado : null, calibracion: C.calibracion }; }, pausa: abrirSobre, seguir: cerrarSobre, get escena() { return escena; }, get registro() { return E.registro; }, PLAN,
  /** Lo que la prueba necesita para jugar por la vía real de entrada: pantalla, y del intento en curso, fase y próximo objetivo. */
  estado() {
    const I = E.intento, pn = $('capa').firstElementChild, act = document.activeElement;
    const o = { pantalla: E.pantalla, visitados: E.visitados, modo: E.modo, errores: E.errores, ahora: reloj.ahora(), fase: E.p?.fase ?? null, metro: E.metro ?? null, intento: null,
      panel: !!pn, foco: act && act.tagName === 'BUTTON' ? claveDe(act) || 'button' : null, sobre: E.sobre ? E.sobre.tipo : null, ctl: E.cfg?.ctl || E.ctl };
    if (I && I.m) {
      const m = I.m, M = m.M, c = I.ctx, abs = t => (I.guiado ? o.ahora + (t - I.now) / (I.vel || 1) : I.t0 + t), x = { fase: m.fase, propio: I.propio, now: I.now, objetivo: null, accion: null, apretado: boton.apretado, ctl: I.ctl, guiado: I.guiado, seDetiene: !!I.seDetiene, entradas: I.ent.length, parado: I.parado, senal: null };
      // la señal visible: lo único que mira un jugador (y la prueba en Fácil). `objetivo` en tiempo del reloj del juego.
      if (I.senal) { const s = I.senal; x.senal = { clave: s.clave, verbo: s.verbo, tipo: s.tipo, paso: s.paso ?? null, gesto: s.gesto ?? null, objetivo: s.objetivo !== undefined ? abs(s.objetivo) : null, desde: s.desde !== undefined ? abs(s.desde) : null, visible: !$('senal').hidden, texto: $('senal').textContent.replace(/\s+/g, ' ').trim() }; }
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
    /** Cambia el lastre artificial (ms por megapíxel dibujado) con el juego andando: prueba del gobernador. */
    lastre(ms) { LASTRE = +ms || 0; },
    /** Adelanta el reloj `ms` en pasos de `paso` y deja correr el flujo entre paso y paso. Dibuja solo el último cuadro. */
    async avanzar(ms, paso = 16) { const fin = reloj.manual + ms; while (reloj.manual < fin) { reloj.manual = Math.min(fin, reloj.manual + paso); tic(false); await ceder(); } tic(true); await ceder(); return reloj.manual; },
    /** Lleva el reloj hasta el instante absoluto t (si ya pasó, no hace nada). */
    async hasta(t, paso = 16) { if (t > reloj.manual) await this.avanzar(t - reloj.manual, paso); return reloj.manual; },
    /**
     * Escena del final armada a mano (tools/check_escenas.mjs): pesista `id`, la pose de la fase `fase` del segmento `seg`
     * como la del final del intento, el movimiento `mov` ('s', 'c', 'j') y el resultado `res` ({res, causa}).
     */
    async final({ id, lev, seg, fase, mov, res, kg = 140, camara = 'caida' }) {
      await escena.cargar(id); await escena.mostrar(id); escena.setCarga(kg, lev);
      const P = escena.P, G = tramo(P, seg), k = G.i(fase), pose = { seg: G.nombre, s: k, tau: G.tt[k], base: G.base, primero: seg === (lev === 's' ? 'snatch' : 'clean') };
      escena.posar(pose, lev); escena.posar(pose, lev);
      const c = E.prueba = armarFinal({ res, grab: [{ t: 0, pose, y: escena.barY, z: escena.barZ }], m: { movs: [{ mov }] } }, lev);
      if (!c) return null; if (camara === 'caida') escena.primerPlano('caida'); else escena.camara(camara);
      return { tipo: c.tipo, dur: c.dur, suelta: c.pl.suelta, y: escena.barY, z: escena.barZ };
    },
    /** Lleva la escena de final() al instante t (s), la dibuja si `dibujar`, y mide holguras entre la barra y el cuerpo. */
    finalEn(t, dibujar = false, dt = 1 / 60) { const c = E.prueba; dibujarFinal(c, t, dt, false); escena.cuadro(.5, dibujar); return holgura(t - c.pl.suelta); },
    /** Cambio de carga a mano: de `kg0` a `kg1`, con la manga en primer plano. Devuelve la duración (s). */
    async carga(kg0, kg1, id = 'ventura') { await escena.cargar(id); await escena.mostrar(id); escena.setCarga(kg0, 's'); escena.posar(poseParado(escena.P, 's'), 's'); await escena.mostrar(null); escena.barraSuelta({ y: escena.pisoBarra, z: escena.barZ, ang: 0 }); const A = E.pruebaCarga = escena.cambioDeCarga(kg1); escena.primerPlano('manga'); return A ? { dur: A.dur, sale: A.sale, entra: A.entra } : null; },
    cargaEn(t, dibujar = false) { const A = E.pruebaCarga, x = A.en(t); escena.barraSuelta({ y: escena.pisoBarra, z: escena.barZ, ang: 0 }); escena.cuadro(.5, dibujar); return x; },
    /** El plano del llamado con un panel de prueba al costado (o al pie en vertical). */
    async planoLlamado(id = 'ventura') { await escena.cargar(id); await escena.mostrar(id); escena.posar(poseParado(escena.P, 's'), 's'); const pn = capa.poner('<h2>Panel de prueba</h2><p>El pesista tiene que quedar a la vista.</p><div class="fila"><button class="ir">Confirmar</button></div>', 'chico abajo lado'); const e = encuadreLibre(); escena.primerPlano('medio', e); escena.cuadro(.5, true); return { encuadre: e, panel: pn.getBoundingClientRect().toJSON() }; },
  },
  listo: iniciar().then(() => true, err => { console.error(err); E.errores.push(String(err.stack || err)); $('msg').textContent = 'No se pudo iniciar el juego'; return false; }),
};
