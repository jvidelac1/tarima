// Juego Tarima: final de tres pesistas (docs/JUEGO.md). Entrada de juego.html: carga, flujo de la partida y bucle.
// El resultado lo calcula el núcleo (web/js/sim/), que es una función pura de lo que el jugador tocó; acá se dibuja.
// Etapa 1: sin animaciones ni modelos nuevos. Lo que no está animado se resuelve con cortes y con texto (sección 11.2).
import { reloj, Boton, toques, principal, claveDe, enfocar, navegar, enCampo } from './input.js';
import { Escena, PLANOS } from './stage.js';
import { poseDe, poseParado, marcas, tramo } from './sequence.js';
import { armarCaida, poseCaida } from './caida.js';
import { sugerencia, chanceDe } from '../sim/entrenador.js';
import { PLANTEL, JUGADOR, FICHA, nivelFicha, ENVIONES, LEV, ETIQUETAS, GUIONES, CUERPO, BARRA, vestir, ternaDe, PLANTEL_DEFECTO, fijarBase, basePlantel, aspectosDe, vestirJugador } from './roster.js';
import { Registrador, Gobernador, calidadInicial, medirRefresco, decidirCalidad, pasoDe, metaDe, nombreDe, escalones, pisoDe, PRESET, PISO_MP, MARGEN, TECHO_MP } from './perf.js';
import { sonido } from './audio.js';
import { detalleError, analitica, appNavegador } from './analitica.js';
import { EVENT } from '../config.js';
import { Ayudas } from './ui/ayudas.js';
import { Senal } from './ui/senal.js';
import { Depura } from './ui/depura.js';
import { Margen } from './ui/margen.js';
import { Barrita } from './ui/barrita.js';
import { Aprende, varsGlosario } from './ui/aprende.js';
import { explicar, pasos, PALABRAS, GUIA, discos, puntos, tramoTxt, deDiez, fuerteDebil, nivelTramo, cuartos, dificultadDe } from './ui/mensajes.js';
import { alDia, tocar, senal as senalDe, GUIADO, EN_HOMBROS, QUE_U, QUE_B, proximoCentro } from './controles.js';
import { tableroHTML, datosTablero, tableroVivoHTML } from './ui/tablero.js';
import { opcionesPedido, pedidoHTML, TECLA_PEDIDO } from './ui/pedido.js';
import { etiquetasRival } from './ui/marcador.js';
import { leerDatos } from '../sim/data.js';
import { Partida } from '../sim/match.js';
import { HUELLA_IA } from '../sim/ai.js';
import { simular } from '../sim/attempt.js';
import { recalcular, resumen } from '../sim/replay.js';
import { EVENTO, KG_MAX, RELOJ, PLAN, exigenciaTabla, previsto, cuerpoDe, chanceUno, chanceBarra, cuerpoBarra, zonasBarra, reglasB, DIFICULTADES } from '../sim/rules.js';
import { RITMO, FASES_RAPIDAS, esDecisivo, tramoResumen, veredictoPropio, desdeRival, TECLA_SALTAR } from './ritmo.js';
import { t, esc, fijarIdioma, detectarIdioma, idiomaActual, fijarTactil, alCambiarIdioma, IDIOMAS } from './i18n/t.js';
import { ganchos } from './ganchos.js';
import { telefono } from './telefono.js';
import { conexion } from './conexion.js';
import { cargaUI } from './ui/carga.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const guardado = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
const tactil = () => matchMedia('(pointer:coarse)').matches;
const DIBUJA = params.get('dibujo') !== '0';
/** Versión del juego para las métricas (súper propiedad `version`). */
const VERSION_JUEGO = 'mvp-2026-11-12';
/** Solo para la prueba del gobernador (tools/check_fluidez.mjs --lastre): ms de espera por megapíxel dibujado, como si la placa fuera lenta. */
let LASTRE = +params.get('lastre') || 0;
const IDS = ['ventura', 'brenner', 'marangi'];
/** Contextura de cada pesista para las métricas (sección 6.3): el nombre del modelo no dice nada. */
const TIPO = { ventura: 'compacto', brenner: 'largo', marangi: 'potente' };
const GLOSARIO = ['arranque', 'dos_tiempos', 'intento', 'vale', 'total', 'energia', 'kilos'];
/** En 'u' la energía es la del levantamiento (no la de toda la final), y se suman la garra y la suerte. */
/** LIF-52: las luces, el nulo, «Cambiar» y el estilo de envión son también las explicaciones de primera vez (ui/aprende.js). */
const GLOSARIO_U = ['arranque', 'dos_tiempos', 'intento', 'luces', 'nulo', 'total', 'u_energia', 'garra', 'suerte', 'kilos', 'cambiar', 'estilo'];
/** En 'b' (la barrita), lo mismo más la barrita, el RM y la dificultad. */
const GLOSARIO_B = ['barrita', 'cansancio', 'rm', 'dificultad', ...GLOSARIO_U];
/** 'u' y 'b' comparten la energía, los cuerpos, el entrenador, el panel y el ritmo; 'b' suma la barrita (Gameplay 3). */
const esU = c => c === 'u' || c === 'b';
/**
 * Corrección de atraso con el dedo (ms): el núcleo mide el toque contra el objetivo + CAL_TACTIL, y el círculo se cierra en
 * el objetivo sin corregir (controles.js, `visto`). Medido con tools/dedo_test.mjs (atraso de 60 ms del dedo y la pantalla).
 */
const CAL_TACTIL = 60;

// ---------- idioma, nombre y eventos (docs/MVP.md, secciones 3, 4.1 y 6.3) ----------
// El idioma se fija antes de pintar nada: ?lang= primero, después lo elegido a mano en este dispositivo; si no, inglés.
fijarTactil(tactil());
fijarIdioma(detectarIdioma({ lang: params.get('lang'), guardado: guardado.get('tarima.idioma'), navegador: navigator.languages?.length ? navigator.languages : [navigator.language] }));
/**
 * Eventos de la sección 6.3: los recibe ganchos.ev (PostHog, web/js/game/analitica.js) y quedan en window.JUEGO.eventos
 * ({ev, props, t}) para las pruebas. Si el gancho sigue siendo el de fábrica, el registro lo lleva main.js; si lo
 * reemplazó la analítica, lo lleva ella (en el mismo arreglo), para no anotar dos veces.
 */
const EVENTOS = Array.isArray(window.JUEGO?.eventos) ? window.JUEGO.eventos : (window.JUEGO = { ...(window.JUEGO || {}), eventos: [] }).eventos;
function ev(nombre, props = {}) {
  if (!ganchos.registra) EVENTOS.push({ ev: nombre, props: { dificultad: E.dificultad, ...props }, t: Math.round(performance.now()) });
  try { ganchos.ev(nombre, props); } catch (e) { console.warn('ganchos.ev:', e); }
}
/** Nombre de 2 a 14 caracteres: letras (de cualquier idioma), espacios, guion y apóstrofo. Lo demás se quita. '' si no alcanza. */
function limpiarNombre(s) {
  const x = [...String(s || '').normalize('NFC')].filter(c => /[\p{L}\p{M} '’-]/u.test(c)).join('').replace(/\s+/g, ' ').trim(), n = [...x].length;
  return n >= 2 && n <= 14 ? x : '';
}
/** El nombre del jugador, o el de siempre («Debutante», «Rookie») si no puso ninguno. Va siempre escapado o con textContent. */
const nombreJugador = () => limpiarNombre(guardado.get('tarima.nombre')) || t('bienvenida.nombre_defecto');
/** Quién es un pesista para el jugador: su propio nombre si es el suyo; los rivales conservan el de siempre. */
const quien = a => (a && a.i === E.yo ? nombreJugador() : PLANTEL[a?.id]?.nombre || a?.f?.nombre || '');      // con vestuario (?plantel=), el rival lleva el nombre del modelo que lo dibuja
/** Si esta visita graba el lienzo 3D (LIF-45, bandera `grabacion_lienzo`). */
const grabaLienzo = () => { try { return !!analitica?.grabandoLienzo?.(); } catch { return false; } };
const corto = a => (a && a.i === E.yo ? nombreJugador() : PLANTEL[a.id].corto);
/** Color y bandera de un pesista: los del jugador son siempre los suyos (JUGADOR), nunca los del modelo que eligió. */
const ident = a => (a && a.i === E.yo ? JUGADOR : PLANTEL[a.id]);
/** Cada concepto se explica una sola vez, la primera vez que aparece (tarima.visto.<clave>). Devuelve true esa primera vez. */
function primeraVez(clave) { if (guardado.get('tarima.visto.' + clave)) return false; guardado.set('tarima.visto.' + clave, '1'); return true; }
/**
 * LIF-52: la explicación de primera vez que toca en este momento ('llamado', 'rival', 'decision'; ui/aprende.js). Solo en
 * 'b' y 'u' (en Clásico el zócalo ocupa la esquina y quien juega ya sabe). No frena nada: el juego sigue igual.
 */
function aprender(momento, c = {}) { if (!aprendeUI || !esU(E.cfg?.ctl)) return null; try { return aprendeUI.momento(momento, c); } catch (e) { console.warn('aprende:', e); return null; } }
/** Un campo donde se escribe: ahí las teclas son del campo, no del juego. */
const campo = el => !!el && el.nodeType === 1 && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(el.type || 'text')));

const E = { pantalla: 'carga', visitados: [], intento: null, p: null, yo: 0, cfg: null, ctl: 'b', sobre: null, monitor: { barraMin: 9, manosMax: 0, cuadros: 0, alto: {} }, errores: [], modo: 'panel', ultDibujo: 0, cortes: [], fundidos: [] };
const perf = new Registrador();
/**
 * Calidad en uso. `auto`: la decide la calibración y la cuida el gobernador. `clave`/`Q`: calidad (movil, baja, media, alta).
 * `sombras`: siguen prendidas. `hz`: refresco medido de la pantalla; `paso`: se dibuja uno de cada `paso` refrescos.
 * `cambios`: cada vez que bajó, con lo medido. `calibracion`: lo que midió la calibración (para mirar desde la consola).
 */
const C = { auto: false, clave: '', Q: null, sombras: true, nombre: '', hz: 60, paso: 1, pasoMin: 1, piso: 0, cambios: [], calibrado: false, medido: null, calibracion: null };
let gov = null, nRaf = 0;
let escena = null, datos = null, ayudas = null, boton = null, enCuadro = null, senalUI = null, depura = null, margenUI = null, barritaUI = null, aprendeUI = null;
const visita = n => { if (n !== E.pantalla) E.previa = E.pantalla; E.pantalla = n; document.documentElement.dataset.pantalla = n; if (!E.visitados.includes(n)) E.visitados.push(n); perf.marcar(n); aprendeUI?.alVisitar(n); try { ganchos.visita?.(n); } catch { /* métricas */ } };

// ---------- tiempo del juego: esperas sobre el reloj inyectable ----------
const pend = [];
const espera = ms => new Promise(res => pend.push({ t: reloj.ahora() + ms, res }));
/**
 * Espera que se puede saltear con Espacio, Enter o un toque. Para que un toque de más no saltee nada por accidente:
 * - antes de `minimo` ms no saltea;
 * - un toque de una ráfaga (toques a menos de 300 ms uno de otro) que empezó antes de `desde` ms tampoco: el que venía
 *   machacando en el levantamiento tiene que parar un momento, o tocar de nuevo después de lo que hay que leer.
 * Los toques que no saltean quedan anotados y con acuse («ESPERÁ»).
 */
function saltable(ms, minimo = 400, desde = 0) {
  return new Promise(res => {
    const t0 = reloj.ahora(), fin = (salto = false) => { if (boton.oye === oye) boton.oye = null; res(salto); };
    const oye = (t, v) => { if (!v) return; if (t - t0 >= minimo && toques.rafaga(t) >= t0 + desde) { toques.resolver(true, 'sigue'); fin(true); } else toques.resolver(false, 'espera'); };
    boton.oye = oye; pend.push({ t: t0 + ms, res: () => fin(false) });
  });
}
let ultimo = 0;
function tic(pintar, tRaf = null) {
  const c0 = performance.now(), now = reloj.ahora(), dt = Math.min(.25, Math.max(0, (now - ultimo) / 1000)); ultimo = now;
  for (let i = pend.length - 1; i >= 0; i--) if (pend[i].t <= now) pend.splice(i, 1)[0].res();
  aprendeUI?.tic(now);
  if (now - margenT > 250 || now < margenT) { margenT = now; margenVertical(); }
  // el botón de pausa (para el dedo; con teclado es Esc) no se muestra encima de un panel grande: taparía su título
  { const ver = puedePausar() && !E.sobre && !$('capa').querySelector('.panel:not(.abajo)'); for (const b of [$('pausa'), $('ayudab'), $('sonidob'), $('camb')]) if (b && b.hidden === ver) b.hidden = !ver; pintarCamb(); }
  try { enCuadro?.(now, dt); } catch (e) { E.errores.push(String(e.stack || e)); console.error(e); enCuadro = null; }
  if (!escena) return;
  // se dibuja en cada cuadro que ofrece el navegador; detrás de un panel la imagen queda congelada (un cuadro al abrirlo o repintarlo)
  const dib = pintar && DIBUJA && !E.sinDibujo && !telefono.vertical && (E.modo !== 'panel' || E.forzar || !!escena.rig.mezcla),      // detrás de un panel, también mientras la cámara termina un movimiento suave      // en vertical se ve «Gira el teléfono»: no se dibuja
    seguido = E.seguido; E.seguido = dib && E.modo !== 'panel';
  escena.cuadro(dt, dib); if (!dib) return;
  // LIF-33: el primer cuadro dibujado con el pesista a la vista (ya sin la pantalla de carga). Sin este evento no se
  // podía contar a quienes nunca vieron al levantador.
  if (E.verPesista && !E.escenaVista && escena.activo) { E.escenaVista = true; ev('escena_visible', { ms: Math.round(performance.now()), ms_jugar: E.tJugar ? Math.round(performance.now() - E.tJugar) : null, calidad: C.nombre, pantalla: E.pantalla }); }
  // el intervalo entre cuadros sale de la marca del navegador (el refresco en que cae el cuadro), no de cuándo corrió este código
  const marca = tRaf ?? now, ms = marca - E.ultDibujo; perf.cuadro(ms, seguido && E.seguido, E.intento?.m?.fase || ''); E.ultDibujo = marca; E.forzar = false;
  if (LASTRE) { const fin = performance.now() + LASTRE * escena.megapixeles; while (performance.now() < fin); }
  // el gobernador mira solo el dibujo continuo, y la calidad no cambia con un intento en curso (propio o de un rival) ni en la repetición
  if (gov && seguido && E.seguido && gov.cuadro(ms, now, performance.now() - c0) && !E.intento && E.pantalla !== 'repeticion') gov.resultado((gov.sube ? subir : bajar)(gov.pasos, 1000 / gov.fps), reloj.ahora());
  if (gov && gov.hz !== C.hz) fijarHz(gov.hz);      // el gobernador vio que la pantalla es más rápida de lo medido
}
// En pantallas de más de 90 Hz se dibuja en uno de cada dos refrescos (C.paso), para que los cuadros salgan parejos.
function bucle(t) { requestAnimationFrame(bucle); toques.cuadro(); if (C.paso > 1 && ++nRaf % C.paso) return; perf.ofrecido(t); E.muestra?.(t); if (reloj.manual === null) tic(true, t + reloj.desfase); depura?.cuadro(t); }

// ---------- calidad ----------
function fijarHz(hz) { C.hz = hz; C.paso = pasoDe(hz, C.pasoMin); perf.periodo = 1000 / metaDe(hz, C.pasoMin); if (gov && (gov.hz !== hz || gov.pasoMin !== C.pasoMin)) gov.fijar(hz, C.pasoMin); }
const nombrar = () => { C.nombre = nombreDe(C.Q, escena.megapixeles, C.sombras); };
/** Cambia de calidad (programas y pases nuevos): solo en la carga, y deja todo compilado antes de seguir. */
async function ponerCalidad(clave) { C.clave = clave; C.Q = C.auto ? { ...PRESET[clave], dpr: 2 } : PRESET[clave]; escena.setCalidad(C.Q); await escena.precalentar(); }
/** Aplica lo que devolvió escalones(): sombras (programas ya compilados en la carga) y tope de píxeles. */
function aplicarEscalon(r) {
  if (r.sombras !== C.sombras) { C.sombras = r.sombras; escena.setSombras(r.sombras); }
  if (Math.abs(r.mp - escena.megapixeles) > 1e-3) escena.setTope(r.mp * 1e6);
}
/** Piso de resolución vigente: el que dejó la calibración, o el que corresponde a la pantalla de ahora. */
const pisoAhora = () => C.piso || (escena ? pisoDe({ telefono: tactil(), techo: escena.nativoMP, cssMP: cssMP() }) : PISO_MP);
const cssMP = () => { const c = escena?.canvas || $('gl'); return c ? c.clientWidth * c.clientHeight / 1e6 : 0; };
/**
 * Baja `pasos` escalones sin compilar nada (perf.js, escalones): 15 % menos de píxeles por escalón hasta el piso de la
 * pantalla (70 % en una computadora, densidad 1 en un teléfono); en el piso apaga las sombras. Por debajo del piso solo
 * si el gobernador pide una bajada urgente (muchos cuadros perdidos seguidos). Devuelve false si no quedaba nada por bajar.
 */
function bajar(pasos, ms, donde = '') {
  const de = C.nombre, urgente = !!gov?.urgente;      // se lee antes de gov.resultado()
  const r = escalones({ mp: escena.megapixeles, sombras: C.sombras }, { pasos, piso: pisoAhora(), urgente });
  if (!r.hecho) return false; aplicarEscalon(r);
  nombrar(); C.cambios.push({ de, a: C.nombre, ms: Math.round(ms * 10) / 10, pantalla: donde || (E.pantalla === 'intento' ? 'fin del intento' : E.pantalla), enIntento: !!E.intento, urgente, t: Math.round(performance.now()) });
  E.forzar = true; return true;      // el gobernador empieza a calentar en resultado()
}
/**
 * Sube `pasos` escalones sin compilar nada (el gobernador vio la máquina libre, o deshace una bajada que no sirvió):
 * primero vuelve al piso si estaba debajo, después las sombras, después 15 % más de píxeles por escalón, hasta lo que
 * dejó la calibración (`C.mpCal`).
 */
function subir(pasos, ms) {
  const de = C.nombre, tope = Math.min(escena.nativoMP, TECHO_MP, C.mpCal || Infinity);
  const r = escalones({ mp: escena.megapixeles, sombras: C.sombras }, { sube: true, pasos, piso: pisoAhora(), tope });
  if (!r.hecho) return false; aplicarEscalon(r);
  nombrar(); C.cambios.push({ de, a: C.nombre, ms: Math.round(ms * 10) / 10, pantalla: E.pantalla, enIntento: !!E.intento, t: Math.round(performance.now()), sube: true, motivo: gov?.motivo || '' });
  E.forzar = true; return true;
}
/**
 * Antes de un intento propio: una subida del gobernador que todavía no se confirmó con dibujo continuo se deshace, para
 * que no se estrene dentro del levantamiento (se aplica con el panel del llamado cerrándose; es solo cambiar el tope de
 * píxeles o las sombras, sin compilar).
 */
function asegurarCalidad() {
  const n = gov ? gov.sinConfirmar() : 0; if (!n) return;
  if (bajar(n, gov.fps ? 1000 / gov.fps : 0, 'antes del intento')) C.cambios[C.cambios.length - 1].motivo = 'subida sin confirmar';
  gov.subidaDeshecha(reloj.ahora());
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
      periodo: gov.periodo, refresco: 1000 / C.hz, clave: C.clave, techo: () => escena.nativoMP, poner: ponerCalidad,
      telefono: tactil(), cssMP: cssMP(), mitad: () => { C.pasoMin = 2; fijarHz(C.hz); return gov.periodo; },
      medir: mp => { escena.setTope(mp * 1e6, true); const c = escena.costo({ extra: lastre }); return { mp: escena.megapixeles, ms: c.ms, p90: Math.round(c.p90 * 100) / 100, n: c.n }; },
      fijar: mp => { escena.setTope(mp * 1e6); return escena.megapixeles; },
      cuadros: (n, calienta) => { enCuadro = (now, dt) => { t += dt; escena.bucle(t, dt); }; return cadencia(n, calienta).finally(() => { enCuadro = null; }); },
    });
    Object.assign(K, { pruebas: R.pruebas, verificacion: R.verificacion, piso: R.piso, mitad: R.mitad }); C.medido = R.p80; C.piso = R.piso || 0; nombrar();
    const mp0 = Math.min(R.primera.techo, PRESET[clave0].maxPixels / 1e6);      // lo que se dibujaba sin calibrar
    if (ORDEN.indexOf(C.clave) < ORDEN.indexOf(clave0) || (C.clave === clave0 && escena.megapixeles < mp0 * .97)) C.cambios.push({ de: nombre0, a: C.nombre, ms: Math.round((R.primera.fijo + R.primera.porMP * mp0) * 10) / 10, pantalla: 'calibración', enIntento: false, t: Math.round(performance.now()) });
  } catch (e) { console.warn('calibración de calidad:', e); K.error = String(e.stack || e); escena.setTope(C.Q.maxPixels); }
  finally { E.sinDibujo = false; enCuadro = null; if (escena.P) escena.posar(poseParado(escena.P, 's'), 's'); nombrar(); K.gl = escena.renderer.getContext().getError(); K.ms = Math.round(performance.now() - ini); C.mpCal = escena.megapixeles; gov.calibrado(reloj.ahora()); E.forzar = true; }
}

// ---------- gráfica ----------
/**
 * Paneles. Al abrir, el foco va al botón principal; al repintar el mismo panel (un kilo más, otro pesista) el foco vuelve
 * al botón que lo tenía. El foco se ve siempre (borde dorado) y los botones no se deshabilitan mientras dura el bloqueo.
 */
const capa = {
  poner(html, clase = '', { foco = true } = {}) {
    // el desplazamiento se conserva al repintar, también el de la parte de arriba de la bienvenida (.bv-cuerpo)
    const c = $('capa'), prev = c.firstElementChild, act = document.activeElement, clave = prev && prev.contains(act) ? claveDe(act) : null, sc = prev ? prev.scrollTop : 0, sc2 = prev?.querySelector('.bv-cuerpo')?.scrollTop || 0;
    c.innerHTML = `<div class="panel ${clase}">${html}</div>`; E.modo = 'panel'; E.forzar = true;
    const pn = c.firstElementChild; pn.t0 = prev ? prev.t0 : -1e9;
    // un panel que es otro (no el mismo repintado) entra con una disolvencia corta (juego.css, .panel.entra)
    pn.dataset.clase = clase; if (!reduceMotion && (!prev || prev.dataset.clase !== clase)) pn.classList.add('entra'); if (prev) { pn.scrollTop = sc; const bc = pn.querySelector('.bv-cuerpo'); if (bc) bc.scrollTop = sc2; }
    // `foco: false`: panel donde Espacio es del juego (el metrónomo): nadie queda con foco, y a los botones se llega con Tab
    if (!foco) { pn.dataset.libre = '1'; document.activeElement?.blur?.(); } else if (!E.sobre) enfocar(pn, clave); else E.sobre.foco = null;
    return pn;
  },
  quitar() { $('capa').innerHTML = ''; E.repintar = null; if (E.modo === 'panel') E.modo = 'tv'; },
};
/** Un panel recién abierto ignora las activaciones durante 400 ms: el toque que venía de la pantalla anterior no elige nada. */
function bloquear(panel, rafaga = false) { panel.t0 = reloj.ahora(); panel.rafaga = rafaga; }
/**
 * `rafaga` (la segunda confirmación de un peso arriesgado): además, una ráfaga de toques que empezó antes de que apareciera
 * el panel no lo activa (quien venía machacando Espacio para saltear rivales tiene que soltar y volver a tocar).
 */
const vale = panel => {
  const ahora = reloj.ahora(); if (ahora - (panel.t0 ?? -1e9) < 400) return false;
  if (!panel.rafaga) return true;
  const u = toques.ultimos.at(-1); return !u || ahora - u.t > 300 || toques.rafaga(u.t) >= panel.t0;
};
/** Activación de un botón del panel. Dentro del bloqueo no elige nada, pero el toque queda anotado como descartado («ESPERÁ»). */
const activa = panel => { const ok = vale(panel); toques.resolver(ok, ok ? 'boton' : 'espera'); return ok; };
const clic = (panel, sel) => new Promise(res => panel.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { if (!activa(panel)) return; sonido.activar(); res(b); })));
const teclas = (n, T, extra = '') => `<kbd class="tecla ${extra}">${t(T ? 'tecla.toca' : 'tecla.espacio')}</kbd>`.repeat(n);
const pasosHTML = (ctl, T) => `<ol class="pasos">${pasos(ctl, T).map(([n, txt], i) => `<li><b>${i + 1}</b><span class="tk">${teclas(n, T, n > 1 ? 'ch' : '')}</span><span>${txt}</span></li>`).join('')}</ol>`;
const menus = () => `<p class="chica">${t('menus.teclado')}</p>`;
/**
 * Selector de kilos: −5 −1 [kg] +1 +5, sin salirse de [lo, hi] (los botones que se pasarían quedan deshabilitados; uno de 5
 * que se pasaría lleva al borde). Con teclado: ← → de a 1, ↑ ↓ o Mayúscula de a 5 (alTeclado).
 */
const kilosHTML = (kg, lo, hi, fijo = false, extra = '') => {
  const b = (id, d, txt, clave, dis) => `<button id="${id}" class="kg" data-d="${d}" ${dis ? 'disabled' : ''} aria-label="${esc(t(clave))}">${txt}</button>`;
  return `<div class="fila kgsel">${b('kg-menos5', -5, '−5', 'kilos.menos5', fijo || kg <= lo)}${b('kg-menos', -1, '−1', 'kilos.menos1', fijo || kg <= lo)}<output id="kg-val">${kg}</output><span>kg</span>${b('kg-mas', 1, '+1', 'kilos.mas1', fijo || kg >= hi)}${b('kg-mas5', 5, '+5', 'kilos.mas5', fijo || kg >= hi)}${extra}</div>`;
};
/** Candado del estilo de envión fijo (LIF-43): dibujo chico, sin emoji (el texto «fijo» va al lado). */
const CANDADO = '<svg class="candado" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const masKilos = (kg, d, lo, hi) => Math.max(lo, Math.min(hi, kg + d));
/** Selector ES · EN (bienvenida y pausa). Cambia sin recargar: la pantalla actual se vuelve a pintar. */
const idiomasHTML = (flota = false) => `<div class="idiomas${flota ? ' flota' : ''}" role="group" aria-label="${esc(t('app.idioma'))}">${IDIOMAS.map(l => `<button class="idi" data-lang="${l}" lang="${l}" aria-pressed="${l === idiomaActual()}">${l.toUpperCase()}</button>`).join('')}</div>`;
function cambiarIdioma(l) {
  const de = idiomaActual(); if (!IDIOMAS.includes(l) || l === de) return;
  guardado.set('tarima.idioma', l); fijarIdioma(l); ev('idioma_cambiado', { de, a: l, pantalla: E.pantalla });
}
/** Textos que viven en juego.html: se pintan al cargar y cada vez que cambia el idioma. */
function pintarFijos() {
  const pon = (id, txt) => { const el = $(id); if (el && el.textContent !== txt) el.textContent = txt; };
  pon('ev-titulo', t('app.evento')); pon('ev-sub', t('app.sesion')); pon('sinfoco', t('foco.perdido'));
  if (!E.intento?.propio) pon('zona-txt', t('zona.toca'));
  const sal = $('saltar'); if (sal) sal.innerHTML = `${esc(t('practica.saltar'))} <kbd class="tecla ch">${t('tecla.esc')}</kbd>`;
  const pa = $('pausa'); if (pa) { pa.setAttribute('aria-label', t('boton.pausa')); pa.title = `${t('boton.pausa')} (Esc)`; }
  const ay = $('ayudab'); if (ay) { ay.setAttribute('aria-label', t('boton.ayuda')); ay.title = `${t('boton.ayuda')} (H)`; }
  $('gl')?.setAttribute('aria-label', t('app.lienzo')); $('zona')?.setAttribute('aria-label', t('app.zona')); $('luces')?.setAttribute('aria-label', t('app.luces'));
  document.title = t('app.titulo');
}

// ---------- acuse de cada toque ----------
/** Lo que dice la tecla dibujada del acuse, en el idioma elegido (input.js anota ESPACIO, ENTER, TOQUE o CLIC). */
const nombreTecla = k => (k === 'ESPACIO' ? t('tecla.espacio') : k === 'TOQUE' ? t('tecla.toca') : k);
const MOTIVOS = ['espera', 'temprano', 'rebote', 'sobra', 'tarde', 'termino', 'pausa', 'mouse'];
/**
 * La tecla dibujada (abajo a la derecha, y la de la señal) se hunde con cada pulsación, sea o no el momento; si el toque
 * no sirvió, al lado sale el motivo en una palabra. Si la ventana pierde el teclado, un cartel lo dice.
 */
function ponerAcuse() {
  const el = $('acuse'), kbd = el.firstElementChild, txt = el.lastElementChild; let tOn = 0, tTxt = 0, abajo = 0;
  toques.contexto = () => { const I = E.intento; return E.pantalla + (I && I.m ? `/${I.m.fase}${I.senal ? ' ' + I.senal.clave : ''}` : E.modo === 'panel' ? '/panel' : ''); };
  const suelta = () => { el.classList.remove('on'); $('senal').classList.remove('pulsa'); };
  toques.alCambiar = (T, que) => {
    if (que === 'baja') { abajo = performance.now(); clearTimeout(tOn); clearTimeout(tTxt); kbd.textContent = nombreTecla(T.tecla); txt.textContent = ''; el.hidden = false; el.className = 'acuse on'; $('senal').classList.add('pulsa'); if (E.intento?.propio && E.intento.ctl === 'u' && T.via !== 'mouse') sonido.tic(); }
    else if (que === 'sube') { clearTimeout(tOn); tOn = setTimeout(suelta, Math.max(0, 110 - (performance.now() - abajo))); }      // un toque corto igual se llega a ver
    else { el.classList.toggle('no', !T.ok); txt.textContent = T.ok ? '' : t('acuse.' + (MOTIVOS.includes(T.motivo) ? T.motivo : 'espera')); clearTimeout(tTxt); tTxt = setTimeout(() => { txt.textContent = ''; el.classList.remove('no'); }, 900); }
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
  const glosario = `<h2>${t('glosario.titulo')}</h2><dl class="glosario">${(ctl === 'b' ? GLOSARIO_B : ctl === 'u' ? GLOSARIO_U : GLOSARIO).map(k => `<div><dt>${t(`glosario.${k}.t`)}</dt><dd>${t(`glosario.${k}.d`, varsGlosario())}</dd></div>`).join('')}</dl>`;
  el.innerHTML = `<div class="panel chico sobre-${tipo}">${tipo === 'ayuda'
    ? `${idiomasHTML()}<h2>${t('ayuda.titulo', { controles: t(ctl !== 'c' ? 'opciones.un_toque' : 'opciones.pro') })}</h2>${pasosHTML(ctl, T)}<p>${t(ctl === 'b' ? 'ayuda.barra' : ctl === 'u' ? 'ayuda.uno' : ctl === 'f' ? 'ayuda.un_toque' : 'ayuda.pro')}</p>${glosario}${T ? '' : menus()}<div class="fila"><button class="ir" id="so-seguir">${t('pausa.seguir')}</button></div>`
    : `${idiomasHTML()}<h1>${t('pausa.titulo')}</h1><p>${t('pausa.texto')}</p><div class="fila"><button class="ir" id="so-seguir">${t('pausa.seguir')}</button><button id="so-ayuda">${t('pausa.ayuda')}</button><button id="so-salir">${t('pausa.salir')}</button></div>`}</div>`;
  el.hidden = false; enfocar(el.firstElementChild);
  el.querySelector('#so-seguir').onclick = cerrarSobre; const ay = el.querySelector('#so-ayuda'), sa = el.querySelector('#so-salir');
  if (ay) ay.onclick = () => pintarSobre('ayuda'); if (sa) sa.onclick = () => location.reload();
  el.querySelectorAll('.idi').forEach(b => { b.onclick = () => { cambiarIdioma(b.dataset.lang); el.querySelector(`.idi[data-lang="${idiomaActual()}"]`)?.focus(); }; });
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
  if (e.ctrlKey || e.metaKey || e.altKey || !boton || e.target?.closest?.('#editor')) return; const k = e.key;      // el editor de campos del teléfono atiende sus teclas
  if (boton.intento && (k === ' ' || k === 'Enter') && !enCampo(e)) return;      // durante el levantamiento propio, Espacio y Enter son del levantamiento (input.js)
  // escribiendo en un campo (nombre, correo, encuesta) las letras, Espacio y las flechas ← → son del campo. Enter elige el
  // botón principal de su formulario (o del panel), Esc sale del campo, y ↑ ↓ y Tab mueven el foco como siempre
  if (campo(e.target) || enCampo(e)) {
    const raiz = E.sobre ? $('sobre').firstElementChild : $('capa').firstElementChild;
    if (k === 'Enter' && !e.repeat && !e.isComposing && e.target.tagName !== 'TEXTAREA') { const b = principal(e.target.closest?.('.formulario') || raiz || document.body); if (b) { e.preventDefault(); b.click(); } }
    else if (k === 'Escape') { e.preventDefault(); e.target.blur(); }
    else if ((k === 'Tab' || k === 'ArrowUp' || k === 'ArrowDown') && raiz && navegar(raiz, e)) e.preventDefault();
    return;
  }
  // «Saltar» del turno de un rival: la tecla S (Espacio no saltea nada de los rivales)
  if ((k === TECLA_SALTAR || k === TECLA_SALTAR.toUpperCase()) && E.saltarRival && !E.sobre && !e.repeat) { e.preventDefault(); E.saltarRival('tecla'); return; }
  // «Cambiar» el pedido en el turno de un rival (LIF-4): C abre y cierra; abierto, las flechas cambian los kilos, Enter pide y Esc cierra
  if (!E.sobre && opPedido()) {
    const q = k === TECLA_PEDIDO || k === TECLA_PEDIDO.toUpperCase() ? (PD.abierto ? 'no' : 'abrir') : !PD.abierto ? '' : k === 'ArrowLeft' || k === 'ArrowDown' ? 'menos' : k === 'ArrowRight' || k === 'ArrowUp' ? 'mas' : k === 'Enter' ? 'ok' : k === 'Escape' ? 'no' : '';
    if (q) { e.preventDefault(); if (!e.repeat || q === 'menos' || q === 'mas') pedidoAccion(q, 'tecla'); return; }
  }
  if (k === 'Escape') { e.preventDefault(); if (E.saltar) E.saltar(); else if (E.sobre) cerrarSobre(); else abrirSobre('pausa'); return; }      // en el tutorial, Esc lo saltea
  if ((k === 'v' || k === 'V') && !E.sobre && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); cambiarCamara(); return; }
  if (k === 'h' || k === 'H' || k === '?') { if (!E.sobre) { if (abrirSobre('ayuda')) e.preventDefault(); } else { e.preventDefault(); if (E.sobre.tipo === 'ayuda') cerrarSobre(); else pintarSobre('ayuda'); } return; }
  const raiz = E.sobre ? $('sobre').firstElementChild : $('capa').firstElementChild;
  if (!raiz) { if (k === 'Tab') e.preventDefault(); return; }      // sin panel, Espacio es del levantamiento, y Tab no saca el foco de la página
  // kilos: ← → de a 1, ↑ ↓ (o Mayúscula con ← →) de a 5, sin salirse del rango (los botones deshabilitados no hacen nada)
  if (raiz.querySelector('#kg-mas') && !E.sobre && (k === 'ArrowUp' || k === 'ArrowDown' || (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')))) {
    e.preventDefault(); const b = raiz.querySelector(k === 'ArrowUp' || k === 'ArrowRight' ? '#kg-mas5' : '#kg-menos5'); if (b && !b.disabled) b.click(); return;
  }
  if (navegar(raiz, e)) { e.preventDefault(); return; }
  if (k === 'Enter' || k === ' ') {
    if (e.repeat) { e.preventDefault(); return; }      // dejar la tecla apretada no activa nada, ni acá ni en el panel que sigue
    const act = document.activeElement; if (act && (act.tagName === 'BUTTON' || act.tagName === 'A' || (act.tagName === 'INPUT' && raiz.contains(act))) && raiz.contains(act)) return;      // el botón, el enlace o la casilla con foco se activan solos
    if (raiz.dataset.libre) return;      // en el metrónomo, Espacio es el toque
    const b = principal(raiz); if (b) { e.preventDefault(); b.focus({ preventScroll: true }); b.click(); }
  }
}
const relojLibre = () => { $('reloj').textContent = '–:––'; $('reloj').classList.remove('aviso'); };
function setReloj(ms) { const s = Math.max(0, Math.ceil(ms / 1000)), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if ($('reloj').textContent !== txt) { $('reloj').textContent = txt; $('reloj').classList.toggle('aviso', s <= 10); escena?.arena.setClock(s); } }
function setLuces(d) { [...$('luces').children].forEach((el, i) => { el.className = d && d[i] !== null && d[i] !== undefined ? (d[i] ? 'b' : 'r') : ''; }); escena?.arena.setDecision(d ? [0, 1, 2].map(i => d[i] ?? null) : null); }
function zocalo(a, L) {
  if (!a) { $('zocalo').hidden = true; return; } const P = ident(a), pais = a.i === E.yo ? '' : PLANTEL[a.id].codigo || a.f.codigo;
  // el nombre del jugador reemplaza al del pesista (textContent: no hace falta escapar), con su bandera y sin el país del
  // modelo; sin dorsal, que es jerga
  $('zocalo').hidden = false; $('z-bandera').style.background = P.bandera; $('z-codigo').textContent = pais; $('z-codigo').hidden = !pais; $('z-dorsal').textContent = ''; $('z-nombre').textContent = quien(a);
  $('z-lev').textContent = t('lev.' + L.lev); $('z-intento').textContent = L.n ? t('zocalo.intento', { n: L.n }) : t('zocalo.practica'); $('z-kg').textContent = L.kg;
  // LIF-45: en las visitas que graban el lienzo, los carteles del 3D (pantalla LED y tablero del costado) dicen «LIFTING GAME»
  // en vez del nombre del jugador; `jugador` y `entero` le dicen a regionesLienzo (analitica.js) que ya no hay nada que tapar
  const yo = a.i === E.yo, sinNombre = yo && grabaLienzo();
  escena.arena.setBoard({ name: sinNombre ? EVENT.marca : quien(a), entero: sinNombre, jugador: yo, country: pais, kg: L.kg, attempt: L.n || 1, lift: t('lev.' + L.lev), intento: t('tablero.intento', { n: L.n || 1 }) });
}
let cartelAhora = '';
/** El pisotón de ¡PÁRATE!: la imagen se sacude 4 px durante 120 ms (nada con movimiento reducido). */
function sacudir() { const gl = $('gl'); if (reduceMotion || !gl) return; gl.classList.remove('sacude'); void gl.offsetWidth; gl.classList.add('sacude'); }
const cartel = (txt, clase = '') => { const k = (txt || '') + '|' + clase; if (k === cartelAhora) return; cartelAhora = k; $('cartel').hidden = !txt; $('cartel').textContent = txt || ''; $('cartel').className = 'cartel ' + clase; };
/**
 * Cartel del veredicto. Con `luces` (las tres de los jueces: el resultado de un intento) sale GRANDE y centrado arriba, con
 * las tres luces al lado, durante 1,5 s (se ve desde cualquier cámara); después queda chico donde va siempre (juego.css: `.grande`).
 */
let veredictoReloj = 0;
const veredicto = (txt, sub, mal, luces = null) => {
  const v = $('veredicto'); clearTimeout(veredictoReloj); v.hidden = !txt;
  v.innerHTML = txt ? `${esc(txt)}${luces ? `<span class="luces" aria-hidden="true">${luces.map(x => `<i class="${x ? 'b' : 'r'}"></i>`).join('')}</span>` : ''}${sub ? `<small>${esc(sub)}</small>` : ''}` : '';
  v.className = 'veredicto' + (mal ? ' mal' : '') + (txt && luces ? ' grande' : '');
  if (txt && luces) veredictoReloj = setTimeout(() => { v.classList.remove('grande'); }, 1500);
};
const guiaTxt = txt => { const g = $('guia'); if (g.textContent !== txt) g.textContent = txt; g.hidden = !txt; };
const etiqueta = et => { $('etiqueta').hidden = !et?.length; $('etiqueta').textContent = (et || []).map(e => ETIQUETAS[e]).join(' · '); };
/**
 * Cámara del levantamiento (LIF-38): la general de siempre, o la elegida en Opciones, con la tecla V o con `?camara=`
 * (jurado: por encima de los hombros de los tres árbitros; lado: lateral; baja: frontal; pov: primera persona, desde los
 * ojos del pesista del jugador). Se recuerda en este navegador y deja el evento `camara_elegida`. Una ventana más alta que
 * ancha usa la lateral. La primera persona es solo de los levantamientos propios: a un rival se lo mira desde la general
 * (`camVista`), y mientras dura no hay planos de afuera (ni el de los brazos, ni el jurado, ni la barra que cae, ni el giro
 * al público): todo se ve desde los ojos, hasta el fundido que sigue.
 */
const CAMARAS_ELEGIBLES = ['3/4', 'jurado', 'lado', 'baja', 'pov'], CAMARA_NOMBRE = { '3/4': 'general', jurado: 'jurado', lado: 'lateral', baja: 'baja', pov: 'pov' };
const camElegida = () => { const q = params.get('camara'), g = guardado.get('tarima.camara'); return CAMARAS_ELEGIBLES.includes(q) ? q : CAMARAS_ELEGIBLES.includes(g) ? g : 'pov'; };      // 17-nov, pedido del dueño: por defecto, primera persona
/** Recuadro de la primera persona (la vista general en una pantalla chica): prendido salvo que se apague en Opciones o con `?recuadro=no`. */
// 17-nov, pedido del dueño («falta la cámara del pesista haciendo el movimiento»): el recuadro va siempre que esté prendido, también en «Móvil» y «Baja» (antes ahí había que pedirlo a mano)
const recuadroPedido = () => recuadroOn();
const recuadroOn = () => (params.get('recuadro') || guardado.get('tarima.recuadro') || 'si') !== 'no';
const camPrincipal = () => { const c = (E.camara ||= camElegida()); return escena.vertical && c !== 'pov' ? 'lado' : c; };
/** La cámara con que se mira un levantamiento: la elegida si es del jugador; la de un rival nunca es la primera persona. */
const camVista = propio => { const c = camPrincipal(); return c === 'pov' && !propio ? '3/4' : c; };
function elegirCamara(a, via) {
  if (!CAMARAS_ELEGIBLES.includes(a)) return; E.camara = a; guardado.set('tarima.camara', a); ev('camara_elegida', { vista: CAMARA_NOMBRE[a], via, pantalla: E.pantalla });
  // si se está viendo la cámara del levantamiento, cambia ya (con un movimiento suave); en un primer plano, la próxima vez
  if (escena && (!escena.plano || escena.plano.key === 'jurado') && (E.modo === 'intento' || E.intento)) { escena.camara(camVista(E.intento ? !!E.intento.propio : true), .8); E.forzar = true; }
}
/** Botón de cámara de la partida (17-nov, pedido del dueño: «que sea fácil en la partida cambiar la cámara»): un toque alterna la primera persona y la vista de afuera. */
const alternarCamara = () => { const c = E.camara || camElegida(); if (c !== 'pov') guardado.set('tarima.camara_afuera', c); const af = guardado.get('tarima.camara_afuera'); elegirCamara(c === 'pov' ? (CAMARAS_ELEGIBLES.includes(af) && af !== 'pov' ? af : '3/4') : 'pov', 'boton'); pintarCamb(); };
const ICONO_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h9A1.5 1.5 0 0 1 15 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 15.5z"/><path d="M15 10.5l6-3v9l-6-3z"/></svg>';
const ICONO_OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
function pintarCamb() { const b = $('camb'); if (!b) return; const pov = (E.camara || camElegida()) === 'pov', k = pov ? 'pov' : 'afuera'; if (b.dataset.k === k + idiomaActual()) return; b.dataset.k = k + idiomaActual(); b.innerHTML = pov ? ICONO_OJO : ICONO_CAM; b.setAttribute('aria-pressed', String(pov)); const txt = `${t('opciones.camara')}: ${t(pov ? 'opciones.cam.pov' : 'camara.afuera')} (V)`; b.setAttribute('aria-label', txt); b.title = txt; }
const cambiarCamara = () => elegirCamara(CAMARAS_ELEGIBLES[(CAMARAS_ELEGIBLES.indexOf(E.camara || camElegida()) + 1) % CAMARAS_ELEGIBLES.length], 'tecla');
/** Recuadro fijo «ESPACIO: seguir» / «Toca: seguir» de las pantallas pasivas (turno de un rival, veredicto, repetición). */
function seguir(on) {
  let el = $('seguir'); if (!el) { el = document.createElement('div'); el.id = 'seguir'; el.className = 'seguir'; el.hidden = true; el.setAttribute('aria-hidden', 'true'); $('tv').appendChild(el); }
  const txt = t(tactil() ? 'seguir.tactil' : 'seguir.teclado'); if (el.textContent !== txt) el.textContent = txt; el.hidden = !on || !esU(E.cfg?.ctl || E.ctl);
}

// ---------- transiciones: fundido corto y veredicto que se va con él ----------
/**
 * Fundido corto a negro (RITMO.fundido): tapa un cambio de pesista o de plano que no puede ser un movimiento de cámara. Lo
 * que hace `cambio` pasa con la imagen tapada (escena.velado: no cuenta como corte). Los carteles de #tv (tablero, veredicto)
 * quedan encima del negro. Con movimiento reducido o sin dibujo, sin fundido.
 */
async function fundido(cambio) {
  const v = $('fundido'), F = RITMO.fundido;
  if (!v || reduceMotion) { await cambio(); return; }
  v.style.transitionDuration = F.fuera + 'ms'; v.classList.add('on'); await espera(F.fuera);
  escena.velado = true; E.fundidos.push(Math.round(reloj.ahora()));
  try { await cambio(); E.forzar = true; await espera(20); } finally { escena.velado = false; v.style.transitionDuration = F.dentro + 'ms'; v.classList.remove('on'); }
}
/** Lo que dejó a la vista el veredicto anterior (texto, luces, «seguir»): se va con el fundido al pesista siguiente. */
function limpiarVeredicto() { const f = E.limpiar; E.limpiar = null; f?.(); }
/**
 * Paso al turno del pesista `id`: si es otro (o el mismo rival que repite), fundido corto y, con la imagen tapada, lo que
 * haga `preparar` (pesista, carga, pose y cámara); si sigue el jugador con su propio pesista, sin fundido.
 */
async function pasarA(id, preparar, sinFundido = false) {
  if ((sinFundido && !E.limpiar) || !escena.activo) { limpiarVeredicto(); await escena.mostrar(id); await preparar?.(); return; }
  await fundido(async () => { limpiarVeredicto(); await escena.mostrar(id); await preparar?.(); });
}

// ---------- tablero de la final (ui/tablero.js) ----------
/**
 * El tablero siempre a la vista durante la final: los tres en el orden en que levantan, lo que lleva cada uno, lo que pidió
 * para su próximo intento (y si lo cambió), y al pie la cuenta y la estrategia del rival que importa. `L`: el llamado en
 * curso (undefined: el último que se pintó; null: entre dos turnos). Durante un turno queda quieto (`congelar`): el
 * resultado de un rival ya está calculado antes de mostrarlo y el tablero no lo puede adelantar.
 */
const TB = { el: null, cuerpo: null, ped: null, p: null, L: null, cambios: {}, avisos: [], html: '', congelado: false };
function tablero(p, L = undefined) {
  if (!TB.el) {
    const el = TB.el = document.createElement('div'); el.id = 'tablero'; el.className = 'tablero'; el.hidden = true; el.setAttribute('aria-live', 'polite');
    TB.cuerpo = document.createElement('div'); TB.ped = document.createElement('div'); TB.ped.className = 'tb-pedido'; TB.ped.hidden = true; TB.ped.setAttribute('aria-live', 'off');
    TB.ped.addEventListener('click', e => { const b = e.target.closest('[data-pedido]'); if (b && !b.disabled) { e.preventDefault(); pedidoAccion(b.dataset.pedido, 'boton'); } });
    el.append(TB.cuerpo, TB.ped); $('tv').appendChild(el);
  }
  const el = TB.el; el.setAttribute('aria-label', t('tablero.aria'));
  if (!p) { el.hidden = true; TB.p = null; TB.cambios = {}; TB.avisos = []; TB.html = ''; pintarPedido(); return; }
  if (TB.p !== p || TB.lev !== p.lev) { TB.cambios = {}; TB.avisos = []; TB.lev = p.lev; } TB.p = p; if (L !== undefined) TB.L = L;
  const d = datosTablero(p, E.yo, TB.L, TB.cambios, TB.avisos); if (!d) { el.hidden = true; pintarPedido(); return; }
  // un pedido propio que todavía no entró en la partida (le toca a la persona y en pantalla sigue el rival): se ve igual
  const yoF = E.pedidoPend != null && d.filas.find(f => f.yo && f.estado !== 'ahora'); if (yoF) { yoF.pide = E.pedidoPend; yoF.cambio = TB.cambios[E.yo] ?? null; }
  const html = tableroVivoHTML(d, { nombre: i => quien(p.at[i]), corto: i => corto(p.at[i]), ident: i => ident(p.at[i]), rm: p.at[E.yo].f.techo[d.lev], compacto: document.documentElement.classList.contains('bajo') });
  if (html !== TB.html) { TB.cuerpo.innerHTML = html; TB.html = html; }
  el.classList.toggle('dt', d.lev === 'c'); el.hidden = false; pintarPedido();
}

// ---------- «Cambiar» el pedido mientras no le toca (LIF-4; ui/pedido.js) ----------
const PD = { abierto: false, kg: 0, html: '' };
/** Lo que se puede pedir ahora (null: sin botón). Solo en el turno de un rival, con el tablero a la vista. */
function opPedido() {
  const p = TB.p; if (!p || !TB.el || TB.el.hidden) return null;
  const rival = TB.L ? TB.L.a !== E.yo : E.turnoDe != null && E.turnoDe !== E.yo; if (!rival) return null;
  return opcionesPedido(p, E.yo, E.pedidoPend ?? null);
}
function pintarPedido() {
  if (!TB.ped) return; const op = opPedido();
  if (!op) PD.abierto = false; else PD.kg = Math.max(op.min, Math.min(op.max, PD.kg || op.min));
  const html = pedidoHTML(op, PD, { tecla: !tactil(), chance: op && TB.p && esU(TB.p.cfg.ctl) ? kg => deDiez(chanceDe(TB.p, E.yo, op.lev, kg)) : null });
  if (html !== PD.html) { const foco = TB.ped.contains(document.activeElement) ? document.activeElement.dataset.pedido : null; TB.ped.innerHTML = html; PD.html = html; if (foco) TB.ped.querySelector(`[data-pedido="${foco}"]`)?.focus({ preventScroll: true }); }
  TB.ped.hidden = !op; TB.el?.classList.toggle('pidiendo', !!op && PD.abierto);
}
/** Botones y teclas del control: abrir, menos, mas, ok, no. `via`: 'boton' o 'tecla'. */
function pedidoAccion(q, via) {
  const op = opPedido(); if (!op) return;
  if (q === 'abrir') { PD.abierto = true; PD.kg = op.min; }
  else if (q === 'menos') PD.kg = Math.max(op.min, PD.kg - 1);
  else if (q === 'mas') PD.kg = Math.min(op.max, PD.kg + 1);
  else if (q === 'no') PD.abierto = false;
  else if (q === 'ok') pedirYa(op, PD.kg, via);
  pintarPedido();
}
/**
 * Pide `kg`. Si en la partida ya le toca a la persona (el rival que se ve ya está resuelto), queda pendiente y entra como un
 * cambio de su llamado al abrirlo (`E.pedidoPend`, en jugarFinal); si no, entra ya (Partida.pedir). Con el tablero quieto
 * (turno de un rival en curso) solo se pone al día la fila propia: lo demás adelantaría el resultado del rival.
 */
function pedirYa(op, kg, via) {
  const p = TB.p, L = p.llamado, de = op.decl;
  if (L && L.a === E.yo) { if (p.cambioValido(0, kg)) return; E.pedidoPend = kg; }
  else { if (p.pedidoValido(E.yo, kg)) return; p.pedir(E.yo, kg); }
  if (TB.cambios[E.yo] === undefined) TB.cambios[E.yo] = de;
  PD.abierto = false; sonido.aviso();
  ev('pedido_cambiado', { lev: op.lev, intento: op.n, de, kg, via, pendiente: E.pedidoPend != null, orden: p.cfg.turnos });
  if (TB.congelado) { const c = TB.cuerpo.querySelector('tr.yo .tb-pide'); if (c) { c.innerHTML = `<b>${kg}</b><small class="tb-cambio">${esc(t('tablero.antes', { kg: TB.cambios[E.yo] }))}</small>`; c.parentElement.classList.add('cambio'); } TB.html = ''; pintarPedido(); }
  else tablero(p);
}
/**
 * Al aparecer el veredicto de un intento: el tablero se pone al día (su marca) y los rivales que cambiaron de kilos quedan
 * marcados («antes 163») hasta su próximo intento. `avisos`: los cambios que devolvió la partida ({a, de, a_kg}).
 */
function alVeredicto(p, L, avisos = []) {
  delete TB.cambios[L.a]; for (const c of avisos) if (TB.cambios[c.a] === undefined) TB.cambios[c.a] = c.de;
  TB.avisos = avisos.map(c => ({ a: c.a, a_kg: c.a_kg }));      // «Brenner cambia a 167» al pie, hasta el próximo cierre
  TB.congelado = false; tablero(p, null); if (avisos.length) sonido.aviso();
}

// ---------- botón «Saltar» del turno de un rival ----------
/**
 * Pedido del dueño (13-nov): «quiero ver el levantamiento completo de mi rival, aunque lo pueda saltar, y no con Espacio:
 * con un botón». El botón dice «Saltar» y, con teclado, su tecla (S). Espacio, Enter y los toques en la escena no saltean
 * nada de un rival (Espacio queda para levantar y confirmar). `on`: a la vista o no.
 */
function botonSaltar(on) {
  let b = $('saltar-rival');
  if (!b) { b = document.createElement('button'); b.id = 'saltar-rival'; b.type = 'button'; b.className = 'saltar-rival'; b.hidden = true; b.tabIndex = -1; b.addEventListener('click', e => { e.preventDefault(); E.saltarRival?.('boton'); }); $('saltar').after(b); }
  const html = `<span>${esc(t('saltar.boton'))}</span>${tactil() ? '' : `<kbd class="tecla">${TECLA_SALTAR.toUpperCase()}</kbd>`}`;
  if (b.dataset.html !== html) { b.innerHTML = html; b.dataset.html = html; } b.setAttribute('aria-label', t('saltar.aria'));
  b.hidden = !on;
}
/** Un toque o Espacio en el turno de un rival no saltea: queda anotado («ESPERA») y el botón late para mostrar dónde está. */
function oyeTurnoRival(tt, v) { if (!v) return; toques.resolver(false, 'espera'); const b = $('saltar-rival'); if (b && !b.hidden) { b.classList.remove('late'); void b.offsetWidth; b.classList.add('late'); } }
/** Espera `ms` del turno de un rival; el botón «Saltar» (o su tecla) la corta. Devuelve cómo se saltó, o '' si terminó sola. */
function esperaRival(ms) {
  return new Promise(res => {
    let listo = false; const fin = via => { if (listo) return; listo = true; if (E.saltarRival === corta) E.saltarRival = null; res(via); }, corta = via => fin(via || 'boton');
    E.saltarRival = corta; pend.push({ t: reloj.ahora() + ms, res: () => fin('') });
  });
}

// ---------- el intento en vivo ----------
/** Fases de un rival que se muestran RIVAL_RAPIDO veces más rápido: la pelea de 5 a 12 s del juego, de pie esperando la chicharra y la barra en los hombros. */
const RIVAL_FASES = FASES_RAPIDAS, RIVAL_RAPIDO = RITMO.rapido;
/**
 * Corre un intento en pantalla. Con `gestos` ({conf, ent}) reproduce el de un rival; sin ellos, lee el teclado (o el dedo)
 * y lo pasa por la capa de traducción del nivel de control (`ctx.ctl`). El mouse no hace gestos.
 * El estado que se dibuja sale de recalcular la lista de entradas hasta ahora: lo mostrado nunca contradice al núcleo.
 * `guia`: reloj del intento llevado por la presentación (tutorial); sin ella, el reloj es el del juego.
 * @returns {Promise<{conf:number|null, ent:number[][], res:object, grab:object[]}>}
 */
/**
 * El vistazo a la barra de la primera persona (17-nov, decidido con el dueño): en un intento propio visto desde los ojos, antes
 * de que aparezca la barrita, el pesista baja a la barra y la toma (el mismo clip, hasta «Salida»), la vista baja a las dos
 * manos en la barra, se queda un momento y vuelve al jurado (stage.js, POV.vistazo). Recién entonces empieza el intento (la
 * barrita aparece con la mirada ya en el jurado) y el pesista sigue agachado (`yaAbajo` en correrIntento). Nada con movimiento
 * reducido, en otra cámara ni con el teléfono parado. Deja en E.vistazo lo medido (ms con las dos manos en la imagen, la
 * inclinación más baja y la del final). Devuelve true si lo hizo.
 */
function vistazo(lev) {
  if (reduceMotion || camVista(true) !== 'pov' || !escena.activo) return Promise.resolve(false);
  return new Promise(res => {
    const G = tramo(escena.P, lev === 's' ? 'snatch' : 'clean'), tS = G.t('Salida'), t0 = reloj.ahora(), M = E.vistazo = { ms: 0, incMin: 0, incFin: 0, dura: 0 };
    escena.camara('pov', .3); E.modo = 'intento';
    enCuadro = (ahora, dt) => {
      const tau = Math.min(tS, (ahora - t0) / 1000);
      escena.posar({ seg: G.nombre, s: G.inv(tau), tau, base: G.base, primero: true }, lev, dt, 0, ahora / 1000);
      const inc = escena.pov?.inc ?? 0, v = escena.manosEnVista(); M.incMin = Math.min(M.incMin, inc); M.incFin = inc; M.dura = Math.round(ahora - t0);
      if (v?.dentro && inc < -.96) M.ms += dt * 1000;
      // termina cuando ya la tomó y la vista volvió al jurado (o, por las dudas, a los 7 s)
      if ((tau >= tS && ahora - t0 > tS * 1000 + 400 && !escena.vistazo) || ahora - t0 > 7000) { enCuadro = null; M.ms = Math.round(M.ms); res(true); }
    };
  });
}
function correrIntento(ctx, { a, lev, env, gestos = null, conf0 = null, t0 = reloj.ahora(), panelAbierto = null, guia = null, resumen = false, decisivo = false, yaAbajo = false }) {
  return new Promise(resolver => {
    const P = escena.P, ent = gestos ? gestos.ent : [], propio = !gestos, grab = [], mk = marcas(P, lev, env), ctl = propio ? ctx.ctl || 'c' : 'c', facil = propio && ctl === 'f', uno = propio && esU(ctl), barra = propio && ctl === 'b', T = tactil();
    // 'u': ayudas de primera vez (una vez cada una en este dispositivo) y la presentación en una línea en el primer intento (G2.8)
    // Medio y Difícil: la primera vez de cada levantamiento en ese nivel, una línea dice qué barritas hay
    const claveP = barra ? (ctx.dif === 'medio' || ctx.dif === 'dificil' ? `b_presenta_${ctx.dif}_${lev}` : 'b_presenta') : 'u_presenta';
    const AY = {}, presenta = uno && !guardado.get('tarima.visto.' + claveP) ? { hasta: Infinity } : null; if (presenta) { primeraVez(claveP); if (!barra) primeraVez('u_tira'); }      // la presentación ya dice cómo se tira
    // 'b': la práctica del primer arranque de la primera final, con el aro sobre el verde (una vez por dispositivo); la subida
    // que suena mientras corre el puntero y el acercamiento de la cámara
    const fantasma = barra && lev === 's' && !!ctx.primera && !guardado.get('tarima.visto.b_fantasma'); if (fantasma) primeraVez('b_fantasma');
    let cortaSubida = null, barritaViva = -1, acerca = false; const frame = { ms: 16 };
    if (barra) { barritaUI.setTactil(T); barritaUI.R = reglasB(ctx.dif); barritaUI.empezar(); }
    // 'u': los discos de margen a la vista (ui/margen.js) y lo que el cuerpo del pesista hace fácil o difícil (una vez cada uno)
    const FD = uno ? fuerteDebil(cuerpoDe(a.id)) : null, tipoTxt = uno ? t(`pesista.${a.id}.tipo`) : '';
    if (uno) { margenUI.empezar({ garra: ctx.garraUno !== false, m: 3000 - (barra ? ctx.fatiga || 0 : 0) }); if (barra && ctx.fatiga) margenUI.decir(t('margen.cansancio', { d: cuartos(ctx.fatiga) }), 'mal', reloj.ahora()); }
    let conf = gestos ? gestos.conf : conf0, pal = null, palT = 0, fin = false, chic = false, camFija = false, sAhora = null, parado = false, ultTecla = -1e9, tRes = null;
    // Un toque de ¡TIRA! que llega antes de tiempo (con PREPÁRATE en pantalla) no se pierde: queda guardado y levanta
    // apenas aparece ¡TIRA! (si fue hace menos de GUARDA_MS). Antes se descartaba con «ESPERA» y quien tocaba una vez y esperaba
    // no veía levantar nada («a veces toco Espacio y no se levanta»).
    let guardadoT = null; const GUARDA_MS = 1500;
    const visto = { gestos: 0, fase: '', toques: 0, tens: null, amagues: 0, rec: null, tic: null };
    // un rival se muestra desde poco antes de agarrar la barra para tirar (no desde que se agacha), y su reloj corre más
    // rápido en las fases lentas (pelea, traba, de pie y con la barra en los hombros): ver RIVAL_RAPIDO. Se saltea al final.
    const todo = gestos ? simular(ctx, gestos.conf, gestos.ent) : null;
    // resumen (G2.7): desde 1 s antes de su última explosión hasta poco después de la recepción; después, corte al final
    const corte = gestos && resumen ? tramoResumen(todo) : null;
    // entero (desde el 13-nov, siempre): desde poco antes de que agarre la barra, y las fases de espera a RITMO.rival.rapido
    const tv0 = gestos ? (corte ? corte.de : desdeRival(todo, gestos.conf)) : 0, rapidez = gestos && !corte ? RITMO.rival.rapido : RIVAL_RAPIDO;
    let vr = null, aPrev = 0, saltar = false;
    // reloj guiado: lineal a tramos; `tope` es el instante del intento donde se detiene
    const R = guia ? { tb: reloj.ahora(), vb: conf ?? 0, vel: 1, tope: Infinity, clave: null } : null;
    const vt = t => Math.min(R.vb + Math.max(0, t - R.tb) * R.vel, R.tope);
    const decir = (txt, clase = {}) => { pal = { txt, ...clase }; palT = reloj.ahora(); };
    /** Cierra el intento en pantalla: deja de escuchar el botón y saca la señal, la leyenda y las ayudas. */
    const cerrar = () => { fin = true; enCuadro = null; $('escena').classList.remove('freno'); if (barra) { cortaSubida?.(); cortaSubida = null; escena.acercar(1); barritaUI.ocultar(); } if (propio) { boton.oye = null; boton.intento = false; boton.tolerante = false; boton.sinRepeticion = false; senalUI.ocultar(); guiaTxt(''); $('zona-txt').textContent = t('zona.toca'); } $('zona').classList.remove('on'); cartel(''); ayudas.limpiar(); E.intento = null; };
    E.intento = { ctx, t0, propio, ctl, m: null, now: 0, senal: null, parado: false, guiado: !!guia, ent, confirmar: t => { if (conf === null) conf = Math.round(t - t0); }, cancelar: () => { if (!fin) { cerrar(); if (uno) margenUI.ocultar(); resolver(null); } }, alFinal: () => { if (gestos) saltar = true; } };
    if (propio) {
      senalUI.setTactil(T); boton.intento = true; boton.tolerante = uno; boton.sinRepeticion = barra;
      boton.oye = (tEv, v, via) => {
        // todo toque se resuelve: aceptado, o descartado con su motivo (se ve en el acuse y en ?depura=1)
        const no = motivo => { if (v) toques.resolver(false, motivo); };
        if (via === 'mouse') return no('mouse');      // el clic no hace gestos del levantamiento
        if (fin) return no('termino'); if (conf === null) return no('espera');
        $('zona').classList.toggle('on', boton.apretado);
        const mAhora = E.intento?.m;
        // 'u': todo contacto va al núcleo, que decide qué cumple; la palabra sale enseguida (en la placa del pulgar)
        if (uno) {
          const r = tocar(ctx, conf, ent, Math.round(tEv - t0), v, ctl); if (!v) return;
          if (!r.n) return no(r.motivo);
          if (barra) {
            // 'b': el toque juzgado en el instante del evento; respuesta inmediata (golpe y marca) y el pesista tira ya
            const Q = QUE_B[r.que] || QUE_B.listo;
            if (Q.zona) { const mB = alDia(ctx, conf, ent, r.t, ctl), b = mB.U.barras.find(x => x.t === r.t && x.zona); sonido.pega(Q.zona); cortaSubida?.(); cortaSubida = null; if (b) barritaUI.pega(b.i, b.zona, b.pos, reloj.ahora()); if (Q.zona === 'verde') $('escena').classList.add('verde'), setTimeout(() => $('escena').classList.remove('verde'), 450); }
            else { decir(t(Q.clave), { nota: true, gris: !!Q.gris }); if (r.que === 'de_pie') { sonido.pisoton(); sacudir(); } else if (r.que === 'esfuerzo') sonido.tic(); }
            if (presenta) presenta.hasta = Math.min(presenta.hasta, reloj.ahora());
            if (toques.abierto) toques.abierto.nota = r.que; toques.resolver(true, r.que || 'gesto'); return;
          }
          const Q = QUE_U[r.que] || QUE_U.listo; decir(t(Q.clave), { nota: true, gris: !!Q.gris }); if (presenta) presenta.hasta = Math.min(presenta.hasta, reloj.ahora());
          if (toques.abierto) toques.abierto.nota = r.que; toques.resolver(true, r.que || 'gesto'); return;
        }
        if (facil && !guia && v && mAhora && !mAhora.res && (mAhora.fase === 'acomodo' || (mAhora.fase === 'tension' && Math.round(tEv - t0) < mAhora.M.ign))) { guardadoT = tEv; toques.resolver(true, 'guardado'); return; }
        let x;
        if (guia) {
          if (!v) return;
          const det = R.tope < Infinity && vt(tEv) >= R.tope;
          if (guia.estricto && !det && sAhora && (sAhora.tipo === 'cierre' || sAhora.tipo === 'espera')) { decir(t('palabra.todavia'), { floja: true }); E.todavias = (E.todavias || 0) + 1; return no('espera'); }
          x = Math.round(vt(tEv)); ultTecla = tEv;
        } else x = Math.round(tEv - t0);
        const r = tocar(ctx, conf, ent, x, v, ctl);
        if (guia && r.n) { R.vb = r.t; R.tb = tEv; R.tope = Infinity; R.clave = null; }      // el toque suelta el reloj
        // «todavía no»: la ventana de la señal no abrió (no gasta la señal). No tapa la palabra del toque anterior recién salida
        if (facil && v && (r.aviso === 'espera' || r.aviso === 'temprano') && !(pal && pal.nota && reloj.ahora() - palT < 900)) { decir(t('palabra.todavia'), { floja: true }); E.todavias = (E.todavias || 0) + 1; }
        if (!v) return;
        if (!r.n) return no(r.motivo);
        if (toques.abierto && sAhora && sAhora.tipo === 'cierre') { const e = r.t - sAhora.objetivo; toques.abierto.nota = `${sAhora.verbo} ${e >= 0 ? '+' : '−'}${Math.abs(e)} ms`; } else if (toques.abierto && sAhora) toques.abierto.nota = sAhora.verbo;
        toques.resolver(true, 'gesto');
      };
    }
    E.modo = propio ? 'intento' : 'tv'; if (panelAbierto) E.modo = 'panel';
    enCuadro = (ahora, dt) => {
      if (gestos) { vr = vr === null ? tv0 : vr + (ahora - aPrev) * (RIVAL_FASES.has(visto.fase) ? rapidez : 1); aPrev = ahora; if (corte && vr >= corte.a && vr < todo.res.t - 30) saltar = true; if (saltar && todo.res) { saltar = false; vr = Math.max(vr, todo.res.t - 30); } }
      const now = guia ? Math.round(vt(ahora)) : gestos ? Math.round(vr) : Math.round(ahora - t0), m = propio ? alDia(ctx, conf, ent, now, ctl) : simular(ctx, conf, ent, now), M = m.M;
      const s = propio ? senalDe(m, now, ctl) : null; sAhora = s; let leyenda = '';
      if (guardadoT !== null && s && s.tipo === 'libre' && s.clave === 'tira') {
        const viejo = ahora - guardadoT > GUARDA_MS; guardadoT = null;
        if (!viejo) { const r = tocar(ctx, conf, ent, now, 1, ctl); if (r.n) { E.guardados = (E.guardados || 0) + 1; ultTecla = ahora; } }
      }
      if (guia) {
        let vel = guia.vel, tope = Infinity, clave = null;
        if (s && guia.para.has(s.clave)) { clave = s.clave; tope = s.tipo === 'cierre' ? s.objetivo : R.clave === clave ? R.tope : now; }
        else if (s && s.tipo === 'empuja') { vel = guia.empuje && now >= s.desde && ahora - ultTecla > guia.porToque ? 0 : 1; if (guia.empuje) leyenda = t(GUIA.empuja, { tactil: T }); }
        else { vel = 1; if (guia.empuje && s && s.clave === 'aguanta') leyenda = t(GUIA.aguanta); }
        if (vel !== R.vel || tope !== R.tope) { const v = vt(ahora); R.vb = v; R.tb = ahora; R.vel = vel; R.tope = Math.max(tope, v); }
        R.clave = clave; parado = R.tope < Infinity && vt(ahora) >= R.tope;
        if (clave) leyenda = parado ? `${t('practica.paso', { n: s.paso, de: s.de })} · ${t(GUIA[clave], { tactil: T })}` : guia.estricto ? t('practica.mira') : '';
      }
      if (barra) {
        // la barrita: el puntero se dibuja donde va a estar cuando el cuadro se vea; la subida suena mientras corre; la cámara
        // se acerca un poco y vuelve con el toque
        frame.ms = frame.ms * .8 + Math.min(50, Math.max(4, dt * 1000)) * .2;
        const corre = s && s.tipo === 'barra' && !m.U.barras.find(b => b.i === s.i)?.zona;
        if (corre && barritaViva !== s.i) { barritaViva = s.i; cortaSubida?.(); cortaSubida = sonido.subida(); }
        if (!corre && cortaSubida && (!s || s.tipo !== 'barra')) { cortaSubida(); cortaSubida = null; }
        if (corre !== acerca) { acerca = corre; escena.acercar(corre && !reduceMotion ? .93 : 1); }
        barritaUI.pintar(E.modo === 'panel' ? null : s, now, Math.round(Math.min(40, frame.ms * 1.5)), m.U, lev, ahora, fantasma);
      }
      E.intento.m = m; E.intento.now = now; E.intento.senal = s; E.intento.parado = parado; if (guia) { E.intento.vel = R.vel; E.intento.seDetiene = !!R.clave; }
      if (ctx.reloj && !uno) setReloj(m.rodilla ? Math.max(0, ctx.reloj - (m.movs[0]?.tk ?? now)) : ctx.reloj - now);
      if (E.modo === 'panel' && conf !== null) E.modo = propio ? 'intento' : 'tv';
      // pose y barra
      const pose = m.res && m.res.res === 'fallo' ? null : poseDe(m, yaAbajo && !m.res && !m.movs.length ? now + 6e4 : Math.min(now, m.res ? m.res.t : now), P), p = M?.pelea,  Tm = p ? p.T / 1e6 : m.temblor / 1e6;
      if (pose) { escena.posar(pose, lev, dt, m.fase === 'freno' ? .55 : m.fase === 'pelea' || m.fase === 'traba' || m.fase === 'fijacion' ? Tm : 0, ahora / 1000); grab.push({ t: now, pose, y: escena.barY, z: escena.barZ }); }
      if (pose && m.tConf !== undefined && !m.res) { const mon = E.monitor; mon.cuadros++; mon.barraMin = Math.min(mon.barraMin, escena.barY); mon.alto[E.pantalla] = Math.max(mon.alto[E.pantalla] || 0, escena.barY); if (escena.barY > .26) mon.manosMax = Math.max(mon.manosMax, escena.manosBarra()); }
      // cámara: nunca hay corte con una ventana abierta
      if (m.fase !== visto.fase) {
        // sin cortes (pedido del dueño): la cámara general llega con un movimiento suave; un rival que no decide nada se ve
        // entero desde la misma cámara general
        if (m.fase === 'acomodo') { const cv = camVista(propio); escena.camara(cv, cv === 'pov' ? .3 : .6); }      // a los ojos entra rápido: la barrita ya está a la vista y la imagen tiene que estar quieta
        // (el primer plano de los brazos en la fijación se sacó: el veredicto se ve desde el mismo plano, quieto, y un primer
        // plano dejaba al pesista cortado y sin la barra cuando la soltaba; pedido del dueño del 16-nov: sin movimientos al terminar)
        if (m.fase === 'tiron' || m.fase === 'flexion') sonido.despegue();
        visto.fase = m.fase;
      }
      // palabra de cada toque y sonidos
      if (!facil && M && M.grado && visto.tens !== M.tp) { visto.tens = M.tp; decir(t('tension.' + M.grado), { mal: M.grado === 'floja' }); }
      if (m.gestos.length > visto.gestos) {
        const g = m.gestos[m.gestos.length - 1], W = PALABRAS[g.pal]; visto.gestos = m.gestos.length;
        // en Fácil, TEMPRANO y TARDE van en ámbar si el levantamiento sigue; el rojo queda para el fallo
        // en Fácil la palabra lleva el verbo del toque que califica: cuando ya se ve la señal siguiente no se confunde con ella
        decir((facil ? t(g.g === 'recepcion' ? 'senal.recibi' : g.mov === 'j' ? 'senal.arriba' : 'senal.explota') + ' ' : '') + t(W.clave) + (!facil && g.pal === 'bien' ? ` ${g.e > 0 ? '+' : '−'}${Math.abs(g.e)} ms` : ''), { nota: true, ...(facil ? { floja: !!W.floja && !g.fuera, mal: !!g.fuera } : { mal: !!W.floja }) });
        if (g.g === 'explosion') sonido.explosion(g.pal === 'perfecto');
        if (propio && T && (g.pal === 'perfecto' || g.pal === 'bien') && !g.fuera) { try { navigator.vibrate?.(g.pal === 'perfecto' ? 35 : 20); } catch { /* sin vibración */ } }
      }
      if (m.amagues > visto.amagues) { visto.amagues = m.amagues; if (propio) decir(t('palabra.muy_temprano'), { floja: true }); }
      if (M && M.tc && now >= M.tc && visto.rec !== M.tc) { visto.rec = M.tc; sonido.recepcion(); }
      if (facil && s && s.tipo === 'cierre' && (s.clave === 'explota' || s.clave === 'arriba') && now >= s.objetivo && visto.tic !== s.desde) { visto.tic = s.desde; sonido.tic(); }
      if (m.toques > visto.toques) { visto.toques = m.toques; if (propio) sonido.toque(); }
      if (uno) {
        const U = m.U;
        // la explosión y el pisotón suenan (el pisotón sacude la imagen 4 px); un tirón sin ¡SALTA! dice «salto flojo»
        if (M && M.tr && visto.exp !== M.tr) { visto.exp = M.tr; sonido.explosion(true); }
        if (U.pisoton !== null && visto.pis !== U.pisoton) { visto.pis = U.pisoton; sonido.pisoton(); sacudir(); }
        // cada tramo que cierra apaga lo que gastó en los discos, con su palabra; la primera vez que el pesista pasa por su punto
        // fuerte o débil, lo dice (una vez por pesista en este dispositivo). Gancho: E.alTramo(entrada, máquina)
        for (visto.log ||= 0; visto.log < U.log.length; visto.log++) {
          const x = U.log[visto.log];
          margenUI.tramo(x, ahora);
          if (x.garra) sonido.garra();
          else if (FD && x.m >= 0 && (x.tramo === FD.fuerte || x.tramo === FD.debil)) {
            const cual = x.tramo === FD.fuerte ? 'fuerte' : 'debil';
            if (primeraVez(`u_${cual}_${a.id}`)) margenUI.luego(t('margen.' + cual, { tipo: tipoTxt, tramo: t('margen.tramo.' + x.tramo) }), cual === 'fuerte' ? 'oro' : 'mal', ahora + 900);
          }
          try { E.alTramo?.(x, m); } catch (e) { console.warn('alTramo:', e); }
        }
        // FRENO: silencio, latido cada 0,62 s, la garra que late y la escena oscura por los bordes
        if (m.fase === 'freno') {
          if (visto.freno !== U.freno?.t0) { visto.freno = U.freno?.t0; visto.latido = -1e9; margenUI.freno(true); $('escena').classList.add('freno'); }
          if (ahora - visto.latido >= 620) { visto.latido = ahora; sonido.latido(); }
        } else if (visto.freno !== undefined && visto.freno !== null) { visto.freno = null; margenUI.freno(false); $('escena').classList.remove('freno'); }
        margenUI.cuadro(ahora);
      }
      const f = m.fij, abajo = !!f && f.firme && now >= f.tb; if (abajo && !chic) { chic = true; sonido.chicharra(); }
      const envTxt = m.fase === 'hombros' && propio && !facil ? `${t('envion.titulo')} ${ENVIONES[env]}`.toUpperCase() : '';      // en Fácil lo dice la señal, sin tapar al pesista
      if (uno) {
        // presentación (4 s o hasta el primer contacto) y, después, la ayuda de primera vez de cada señal
        const CL = { tira: 'uno.ayuda_tira', salta: 'uno.ayuda_salta', parate: 'uno.ayuda_parate', datodo: 'uno.ayuda_datodo', arriba: 'uno.ayuda_arriba' };
        if (barra) { if (presenta && ahora < presenta.hasta) leyenda = t(ctx.dif === 'medio' || ctx.dif === 'dificil' ? `barra.presenta_${ctx.dif}_${lev}` : lev === 'c' ? 'barra.presenta_c' : 'barra.presenta'); }
        else if (presenta && now < 4000 && ahora < presenta.hasta) leyenda = t(lev === 'c' ? 'uno.presenta_c' : 'uno.presenta');
        else if (s && CL[s.clave]) { if (!(s.clave in AY)) AY[s.clave] = primeraVez('u_' + s.clave); if (AY[s.clave]) leyenda = t(CL[s.clave]); }
      }
      cartel(m.res || leyenda ? '' : uno ? '' : facil ? envTxt : f ? t(abajo ? 'senal.abajo' : 'senal.aguanta') : envTxt, abajo ? 'abajo' : '');
      // la señal fija (jugador) y las ayudas pegadas a la barra (Clásico y rivales)
      const edad = (ahora - palT) / 1000;
      if (propio) { senalUI.pintar(E.modo === 'panel' || (barra && s && (s.tipo === 'barra' || s.tipo === 'espera')) ? null : s, now, pal ? { ...pal, edad } : null, { parado }); guiaTxt(leyenda); const z = s && s.tipo === 'barra' ? t('tecla.toca') : s && s.tipo !== 'espera' && s.tipo !== 'auto' ? s.verbo : s ? '···' : t('zona.toca'); if ($('zona-txt').textContent !== z) $('zona-txt').textContent = z; }
      // las ayudas pegadas a la barra (anillo, línea, palabra) son solo del jugador en Clásico: sobre un rival se leerían como
      // una señal de toque sobre otro pesista (pedido del dueño del 12-nov: «¿puedo controlar otro pesista?»)
      if (facil || uno || !propio) ayudas.limpiar();
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
 * Reglas del cuerpo en el final (game/caida.js, poseCaida), en muestras globales del clip y por nombre de fase: desde dónde
 * el cuerpo se para siguiendo el clip (`rec`, la recepción) y hasta dónde (`fin`, el final del segmento); y el tramo que
 * desandan los brazos: de la recepción (después ya no se mueven) a la barra colgando con los brazos estirados (arranque y
 * cargada: la triple extensión). En el envión los brazos no desandan nada: las poses anteriores a la recepción (empuje,
 * impulso) tienen las manos delante de la cara, justo por donde cae la barra (check_escenas daba BAD de antebrazos contra la
 * barra a los 0,3 s de soltar, con cualquier espera); bajan directo a «Parado», por los costados, apenas se va la barra.
 */
const FASES_FINAL = { snatch: ['Recepción', 'Triple extensión'], clean: ['Recepción', 'Triple extensión'], split: ['Envión · Tijera', 'Envión · Tijera'], power: ['Power jerk · Recepción', 'Power jerk · Recepción'], squat: ['Squat jerk · Recepción', 'Squat jerk · Recepción'] };
function reglasFinal(P, seg) {
  const F = FASES_FINAL[seg]; if (!F) return null; const G = tramo(P, seg), rec = G.base + G.i(F[0]);
  return { sub: P.sub, rec, fin: G.base + G.n - 1, brazosDe: rec, brazosA: G.base + G.i(F[1]) };
}
/**
 * Escena del final de un intento (game/caida.js): con qué pose terminó, cómo se suelta la barra y adónde va el pesista.
 * null si no hay nada que mostrar (no se levantó la barra).
 */
function armarFinal(r, lev) {
  if (!r || !r.grab || !r.grab.length || !escena.P) return null;
  const M = r.m?.movs?.[r.m.movs.length - 1], g = r.grab[r.grab.length - 1];
  const g0 = g.pose.base + g.pose.s, V3 = escena.barbell.group.position.constructor, sh = escena.activo?.midWorld(['LeftArm', 'RightArm'], new V3()), cad = escena.activo?.boneWorld('Hips', new V3()), c = armarCaida(r.res, M?.mov, { y: g.y, z: g.z }, escena.pisoBarra, g0, reglasFinal(escena.P, g.pose.seg), sh ? { hombros: { y: sh.y, z: sh.z }, cadera: { y: cad.y }, kg: escena.kg || 0 } : null); if (!c) return null;
  return Object.assign(c, { g0, pose: g.pose, destino: PARADO(escena.P), lev, golpes: 0 });
}
/**
 * Dibuja el final en el instante t (s desde que terminó el intento). Antes de soltar, la pose del final con la barra en las
 * manos; después, la barra suelta (física simple) y el pesista que se mezcla hacia «Parado». `vivo`: con sonido.
 */
function dibujarFinal(c, t, dt, vivo) {
  const tb = t - c.pl.suelta;
  if (tb < 0) { escena.posar(c.pose, c.lev); return; }
  escena.posarMezcla(poseCaida(c.pl, c.g0, c.destino, t, c.R)); const b = c.barra.en(tb); escena.barraSuelta(b, dt);
  if (vivo) for (; c.golpes < b.golpes.length; c.golpes++) { const v = b.golpes[c.golpes].v; sonido.golpe(v); if (c.golpes === 0 && c.tipo !== 'bajada') sonido.lamento(); }
}
const textoDe = k => t(k);
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
  const fin = o.fin || null, ok = res.res === 'valido', pov = !!escena.pov;      // en primera persona no hay planos de afuera
  if (!fin) { if (res.res === 'fallo') sonido.fallo(); escena.posar(poseParado(escena.P, lev), lev); }
  // un toque que llegó cuando la barra ya estaba perdida (o recién terminado el intento) no pasa por «no tocaste»: la línea dice
  // que fue tarde. Uno descartado más de 400 ms después del final ya es otra cosa (por ejemplo, saltear el veredicto)
  const tarde = propio && o.tRes ? toques.ultimos.find(T => T.via !== 'mouse' && T.ok === false && T.t > o.tRes - 400 && T.t < o.tRes + 900 && (T.motivo === 'tarde' || T.motivo === 'termino' || (T.t >= o.tRes && T.t < o.tRes + 400))) : null;
  const uno = propio && esU(o.ctl), limite = uno && ok && !!res.uno?.al_limite, b = res.luces.filter(Boolean).length, luces = t('veredicto.luces', { b }), linea = propio ? explicar(res, o.ctl || 'c', tactil(), { ...o, tardio: tarde ? Math.max(0, Math.round(tarde.t - o.tRes)) : undefined }) : '';
  // el primer NO VALE propio explica una vez cuándo vale un levantamiento (tarima.visto.no_vale)
  const primerNoVale = propio && !o.practica && res.res === 'nulo' && primeraVez('no_vale') ? ` · ${t('veredicto.primer_no_vale')}` : '';
  // un rival en 'b' y 'u': solo la causa si falló (las luces ya se ven arriba): menos texto a la vez
  const rivalU = !propio && esU(E.cfg?.ctl), sub = (propio ? (linea ? linea + (res.res === 'fallo' ? '' : ` · ${luces}`) : o.sub ? `${o.sub} · ${luces}` : luces) : rivalU ? (res.causa ? t('causa.' + res.causa) : '') : (res.causa ? t('causa.' + res.causa) + ' · ' : '') + luces) + primerNoVale;
  const titulo = t(ok ? 'veredicto.vale' : res.res === 'nulo' ? 'veredicto.no_vale' : 'veredicto.cayo');
  if (propio) (E.propios ||= []).push({ pantalla: E.previa || '', res: res.res, causa: res.causa, linea, ctl: o.ctl || 'c', ...(res.uno ? { uno: res.uno } : {}) });
  // momentos (s desde el final del intento)
  // un rival resumido (G2.7): luces de golpe y la línea enseguida
  // 'u' al límite: las luces se prenden de a una con suspenso (más espaciadas) y el veredicto dura lo mismo (≤ 3 s)
  if (uno) margenUI.fin(res, reloj.ahora());
  const R0 = o.resumen ? (o.rival ? { ...RITMO.resumen, total: RITMO.rival.saltado } : RITMO.resumen) : null, paso = R0 ? 0 : limite ? veredictoPropio(true, !!fin, true).paso : lento ? .55 : .3, tLuz = R0 ? R0.luz : fin && !ok ? .45 : fin ? .2 : .25, tVer = R0 ? R0.ver : tLuz + 2 * paso + .25;
  const tCaida = fin ? fin.pl.suelta : 0, tRev = ok && fin ? tCaida + 1.1 : Infinity;
  // la línea se lee 4,2 s; si después viene la repetición (`o.rep`), que la vuelve a mostrar, acá solo 1,6 s. En un válido
  // propio no se espera a que la barra termine de rebotar (fin.dur llega a 4,3 s): luces, ovación, la cámara gira y sigue.
  // El primer NO VALE suma 1,5 s para leer cuándo vale un levantamiento.
  // 'u' (G2.7): el válido propio no llega a 3 s y el fallo dura tVer + 2,4 s (la barra termina de caer detrás del panel siguiente)
  const total0 = R0 ? R0.total : o.corto ? tVer + .9 : uno ? veredictoPropio(ok, !!fin, limite).total : Math.max(tVer + (propio ? (linea ? (o.rep ? 1.6 : 4.2) : 1.9) + (primerNoVale ? 1.5 : 0) : 1.3), fin && !(propio && ok) ? fin.dur : 0);
  // un rival (sin saltar): el veredicto se lee al menos 1,2 s aunque la barra que rebota se corte (nada aparece y se va en < 1 s)
  const total = o.max ? Math.min(total0, Math.max(o.max, tVer + (o.rival && !R0 ? 1.2 : .4))) : total0;      // el decisivo con «Rápida»: la barra que rebota se corta
  // sin cortes: la cámara sigue a la barra que cae y gira hacia el público con movimientos suaves; un rival que no decide nada
  // (`o.fija`) queda en la cámara general
  // un válido o un nulo propio: mientras se prenden las luces, la vista del jurado (los árbitros levantan la paleta, el pesista
  // de frente y las tres luces arriba). Se queda ahí hasta el fundido que sigue; la barra que se cae (fallo) no pasa por acá
  // (antes, en el válido, la cámara salía hacia el jurado, a los 0,7 s la interrumpía el plano de la barra que cae y 1,1 s
  // después giraba al público: tres movimientos encadenados en menos de 3 s. Ahora, uno solo: al jurado, y se queda)
  // Pedido del dueño (16-nov): al terminar NO hay movimiento de cámara (ni al jurado, ni a la barra que cae, ni giro al
  // público): el plano del intento queda quieto, con el pesista, las tres luces y el resultado en pantalla. Vale para
  // cualquier vista; en primera persona tampoco hay corte a otra.
  const t0 = reloj.ahora(), d = [null, null, null], hito = { luz: 0, ver: false, caida: true, rev: true };
  escena.fijarCamara(true);      // desde acá la cámara no se mueve: ni el lente que volvía de la barrita
  const avanzar = (t, dt, vivo, conFinal = true) => {
    if (fin && conFinal) dibujarFinal(fin, t, dt, vivo);
    while (hito.luz < 3 && t >= tLuz + hito.luz * paso) { const i = hito.luz++; d[i] = res.luces[i]; setLuces(d); if (vivo) { sonido.luz(d[i]); if (limite && i < 2) sonido.latido(); if (ok && i === 1) sonido.festejo(lento || limite ? 1 : .6); } }
    if (!hito.caida && t >= tCaida) { hito.caida = true; escena.primerPlano('caida', null, .6); }
    if (!hito.rev && t >= tRev) { hito.rev = true; escena.camara('rev', 1.1); }
    if (!hito.ver && t >= tVer) { hito.ver = true; veredicto(titulo, sub, !ok, vivo ? res.luces : null); try { o.alVer?.(); } catch (e) { console.warn('alVer:', e); } if (!propio && vivo) aprender('decision', { nulo: res.res === 'nulo', lev }); if (vivo && !ok && (!fin || fin.tipo === 'bajada')) sonido.ovacion(false); }
  };
  enCuadro = (ahora, dt) => { avanzar((ahora - t0) / 1000, dt, true); if (uno) margenUI.cuadro(ahora); };
  // un intento propio: el veredicto (y su línea) queda al menos 1 s a la vista antes de poder saltearlo, y una ráfaga que
  // venía del levantamiento no lo saltea (tiene que empezar después de que aparece)
  // un rival (`o.rival`) se saltea solo con el botón «Saltar» o su tecla; lo propio, con Espacio o un toque, como siempre
  seguir(!o.rival); const tS = reloj.ahora();
  const salteado = o.rival ? !!(o.salto = await esperaRival(total * 1000)) : await saltable(total * 1000, propio ? Math.round((tVer + (linea ? 1 : .4)) * 1000) : R0 ? 200 : 400, propio ? Math.round(tVer * 1000) : 0);
  if (salteado && uno) ev('veredicto_salteado', { ms: Math.round(reloj.ahora() - tS), resultado: res.res });
  const limpiar = () => { veredicto(''); setLuces(null); seguir(false); escena.fijarCamara(false); };
  if (o.mantener) {
    // el veredicto y el paso al siguiente son un solo momento: el texto y las luces quedan, la barra termina de caer y el
    // pesista vuelve, y todo eso se va con el fundido al pesista siguiente (pasarA → limpiarVeredicto)
    hito.caida = hito.rev = true; avanzar(Math.max(tVer, tLuz + 3 * paso) + .01, 0, false, false); seguir(false);
    enCuadro = (ahora, dt) => { if (fin) dibujarFinal(fin, (ahora - t0) / 1000, dt, true); if (uno) margenUI.cuadro(ahora); };
    E.limpiar = () => { enCuadro = null; terminarFinal(fin); limpiar(); };
  } else { enCuadro = null; avanzar(Math.max(total, tVer, tRev, tLuz + 3 * paso) + .01, 0, false); terminarFinal(fin); limpiar(); }
  return linea;
}

/** Lo que dura la repetición de un fallo, como mucho (ms), sin contar el corte final. */
const REP_MS = 2300;
/** Tramo que muestra la repetición: de poco antes de la explosión a poco después de la recepción. null si no hay. */
function tramoRepeticion(r, valido = false) {
  if (!r || !r.res || (r.res.res === 'valido' && !valido) || !r.m || !r.grab || !r.grab.length) return null;
  const M = r.m.movs[r.m.movs.length - 1]; if (!M || !M.tr) return null;
  const de = M.tr - 300, a = Math.min(r.res.t, (M.tc || M.tr) + 450), cuadros = r.grab.filter(g => g.t >= de && g.t <= a);
  return cuadros.length < 4 ? null : { de, a, cuadros };
}
/**
 * Repetición de un fallo: lateral, de lo que se dibujó (no del clip fijo), con la traza de la barra, en cámara lenta (hasta
 * 3 veces) y en REP_MS como mucho; la caída ya se vio en vivo en el veredicto. Abajo, el motivo en una línea. Se saltea
 * con Espacio. El válido no tiene repetición: luces, ovación y seguir.
 */
async function repeticion(lev, r, linea = '', o = {}) {
  const T = tramoRepeticion(r, !!o.rival); if (!T) return '';
  const { de, a, cuadros } = T, LENTO = Math.max(1, Math.min(3, (o.rival ? RITMO.rival.rep * 1000 : REP_MS) / (a - de))), tLev = (a - de) * LENTO;
  if (o.rival) visita('repeticion_rival'); else { visita('repeticion'); const yo = E.propios?.at(-1); if (yo) yo.rep = true; }
  // la repetición entra con un fundido (el veredicto que quedaba se va con él) y sale con el fundido al pesista siguiente
  await fundido(() => {
    limpiarVeredicto(); E.modo = 'intento'; escena.camara('lado'); escena.trace.buildPoints(cuadros.map(g => ({ y: g.y, z: g.z })), 1.16); escena.trace.group.visible = true; escena.posar(cuadros[0].pose, lev);
    veredicto(o.titulo || t('veredicto.repeticion'), linea || (r.res.causa ? t('causa.' + r.res.causa) : t('veredicto.camara_lenta')), r.res.res !== 'valido'); $('veredicto').classList.add('arriba');
  });
  const t0 = reloj.ahora();
  enCuadro = ahora => { const t = de + Math.min(ahora - t0, tLev) / LENTO; let k = 0; while (k + 1 < cuadros.length && cuadros[k + 1].t <= t) k++; escena.posar(cuadros[k].pose, lev); escena.trace.setCount(k); };
  // la de un rival se saltea solo con el botón «Saltar» (o su tecla); la propia (Clásico), con Espacio o un toque
  const via = o.rival ? await esperaRival(tLev + 300) : ((await saltable(tLev + 300, 300)) ? 'espacio' : '');
  E.limpiar = () => { enCuadro = null; escena.trace.group.visible = false; veredicto(''); escena.posar(poseParado(escena.P, lev), lev); E.modo = 'tv'; };
  return via;
}

// ---------- pantallas ----------
/**
 * Nivel de control al abrir: 'u' (Fácil, «un toque, un tramo») por defecto; 'c' (Clásico) si se eligió. Un 'f' guardado
 * (el Fácil de círculos, que salió de Opciones) se lee como 'u'. ?ctl=f lo deja para las pruebas de registros viejos.
 */
/** Dificultad de la barrita al abrir (rules.js → NIVELES_B): ?dif= primero, después la elegida en Opciones; Fácil por defecto. */
function difInicial() { const q = params.get('dif'), g = guardado.get('tarima.dificultad'); return DIFICULTADES.includes(q) ? q : DIFICULTADES.includes(g) ? g : 'facil'; }
/** La dificultad como súper propiedad de la analítica (`dificultad` en cada evento): Clásico es 'clasico'. */
/**
 * LIF-50: cómo se juega, parado ('vertical') o acostado ('horizontal'). Va como súper propiedad `orientacion` en cada evento
 * (para comparar retención y finales entre las dos) y, si cambia en medio del juego, el evento `orientacion_cambio`.
 * En vertical, además, la cámara encuadra al pesista arriba de la barrita y el botón (margenVertical).
 */
function orientacion() {
  const o = telefono.orientacion; margenVertical();
  if (o === E.orientacion) return; const antes = E.orientacion; E.orientacion = o;
  try { analitica?.propiedades({ orientacion: o }); } catch { /* métricas */ }
  if (antes) ev('orientacion_cambio', { orientacion: o, antes, pantalla: E.pantalla });
}
/**
 * El techo y el pie de la cámara: el encuadre automático (cameras.js, setInsets) pone al pesista y la barra en el rectángulo
 * que queda libre, así ningún cartel les pisa la cabeza ni la barra cuando sube (17-nov: «hay casos donde los carteles le
 * tapan la cabeza al pesista»).
 *  - Teléfono parado (html.vert): abajo van la barrita y el botón (--pie-v) y arriba los botones chicos (--techo-v); las
 *    medidas salen de juego.css, así un cambio de diseño no se desfasa.
 *  - En cualquier pantalla: lo que cuelga del borde de arriba y entra en la franja central (FRANJA: del 38 % al 62 % del
 *    ancho, donde van el pesista y la barra) baja el techo hasta su borde de abajo: el tablero parado (ocupa más de medio
 *    ancho) y la energía. Acostado y en la computadora arriba al centro no va nada (juego.css: sonido, pausa y ayuda van
 *    arriba a la derecha, debajo del reloj): con la cámara general la punta de la barra queda más cerca y no alcanza con el techo.
 * Se llama al girar y cuatro veces por segundo (tic): los carteles aparecen y se van con cada pantalla. Con la cámara
 * congelada tras el intento (rig.fijo) los márgenes no cambian: el techo ya viene puesto desde antes del levantamiento.
 */
const TECHO = ['tablero', 'pausa', 'sonidob', 'camb', 'ayudab', 'margen', 'saltar'], FRANJA = [.38, .62];
let margenT = 0;
function margenVertical() {
  if (!escena?.rig) return; const gl = $('gl'), H = gl?.clientHeight || 0, W = gl?.clientWidth || 0, h = document.documentElement.classList;
  if (!H || !W || h.contains('rotado')) { escena.rig.setInsets({ t: 0, b: 0, l: 0, r: 0 }); return; }
  let t = 0, b = 0;
  if (h.contains('vert')) { const cs = getComputedStyle(document.documentElement), px = k => parseFloat(cs.getPropertyValue(k)) || 0; t = px('--techo-v') / H; b = Math.min(.4, px('--pie-v') / H); }
  const R = gl.getBoundingClientRect();
  for (const id of TECHO) {
    const el = $(id); if (!el || el.hidden) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.top - R.top > H * .2 || r.right < R.left + W * FRANJA[0] || r.left > R.left + W * FRANJA[1]) continue;      // no cuelga de arriba, o está a un costado
    t = Math.max(t, (r.bottom - R.top + 6) / H + .035);      // con aire: el disco de la punta de la barra queda más cerca de la cámara y se ve más grande
  }
  escena.rig.setInsets({ t: Math.min(.36, t), b, l: 0, r: 0 });
}
function fijarDificultad(cfg) { E.dificultad = cfg.ctl === 'c' ? 'clasico' : cfg.ctl === 'b' ? cfg.dif : cfg.ctl; try { analitica?.propiedades({ dificultad: E.dificultad }); } catch { /* métricas */ } }
function ctlInicial() { const q = params.get('ctl'); if (q === 'c' || q === 'f' || q === 'u' || q === 'b') return q; return guardado.get('tarima.ctl') === 'c' ? 'c' : 'b'; }
/**
 * P1 · Bienvenida (docs/MVP.md, secciones 2 y 3): nombre (opcional, con foco en una computadora), las tres contexturas,
 * «Jugar» grande y «Opciones» plegado. Quien vuelve ve «Hola de nuevo» con «No soy yo». El nombre se guarda al salir.
 * Primera vez (LIF-53, decisión del dueño del 15 de noviembre): se entra directo a jugar con el pesista por defecto
 * (Compacto), sin elegir: las tarjetas de los pesistas aparecen recién después de la primera final (jugada o cortada).
 */
async function inicio() {
  visita('inicio'); zocalo(null); relojLibre(); const primera = !guardado.get('tarima.jugadas');
  const cfg = { id: guardado.get('tarima.pesista') || 'ventura', nivel: guardado.get('tarima.nivel') || 'amistoso', ritmo: params.get('ritmo') === 'completa' ? 'completa' : 'expres', ctl: ctlInicial(), dif: difInicial(), orden: guardado.get('tarima.orden') === 'oficial' ? 'oficial' : 'rondas' };
  if (!IDS.includes(cfg.id)) cfg.id = 'ventura';
  // Difícil juega con rivales parejos, salvo que la persona haya elegido los rivales a mano
  if (cfg.ctl === 'b' && cfg.dif === 'dificil' && cfg.nivel === 'amistoso' && !guardado.get('tarima.nivel_elegido')) cfg.nivel = 'normal';
  fijarDificultad(cfg);
  const guardadoNombre = limpiarNombre(guardado.get('tarima.nombre')), vuelve = !!guardadoNombre;
  const S = { nombre: guardadoNombre, editar: !vuelve, opciones: false, tocoPesista: false, cambio: false, focoNombre: !vuelve };
  const mostrado = () => (S.editar ? limpiarNombre(S.nombre) : guardadoNombre) || t('bienvenida.nombre_defecto');
  // `?elegir=1` (para probar): abre directo la selección de pesista y deja las tarjetas a la vista aunque sea la primera vez
  const forzarElegir = params.get('elegir') === '1'; let abrirElegir = forzarElegir && !E.elegirVisto;
  const verPesista = async () => { E.elegirVisto = true; const r = await elegirPesista(cfg, mostrado()); cfg.id = r.id; E.aspecto = r.aspecto ? { plaza: r.id, modelo: r.aspecto } : null; S.tocoPesista = true; visita('inicio'); };
  for (;;) {
    if (abrirElegir) { abrirElegir = false; await verPesista(); }
    const T = tactil(), facil = cfg.ctl !== 'c', uno = esU(cfg.ctl), falta = !guardado.get('tarima.tutorial'); E.ctl = cfg.ctl;
    let est = null; try { est = ganchos.estado?.() || null; } catch { /* sin estado */ }
    const q = est && est.anotado ? t('bienvenida.anotado') : est && Number.isFinite(est.quedan) ? (est.quedan === 1 ? t('bienvenida.quedan_1') : t('bienvenida.quedan', { n: est.quedan })) : '';
    const nombreHTML = S.editar
      ? `<label class="nombre" for="nombre"><span>${t('bienvenida.nombre')}</span><input id="nombre" type="text" value="${esc(S.nombre)}" maxlength="20" placeholder="${esc(t('bienvenida.nombre_ph'))}" title="${esc(t('bienvenida.nombre_nota'))}" autocomplete="nickname" autocapitalize="words" spellcheck="false" enterkeyhint="go"></label>`
      : `<p class="vuelve">${t('bienvenida.vuelve', { nombre: `<b>${esc(guardadoNombre)}</b>` })} <button class="link" id="btn-nosoy">${t('bienvenida.no_soy')}</button></p>`;
    const opt = (cls, dato, v, actual, clave) => `<button class="${cls}" data-${dato}="${v}" aria-pressed="${v === actual}">${t(clave)}</button>`;
    // El nivel va A LA VISTA donde se entra a jugar (17-nov, pedido del dueño: «es poco intuitivo elegir el estilo de jerk y
    // el nivel»): Fácil · Medio · Difícil como segmentos encima de «Jugar», con el elegido marcado (Fácil, si nunca se eligió
    // otro) y su línea de siempre debajo. Lo marcado es lo que se juega: sale de cfg.dif, lo mismo que va a la partida.
    // Clásico (otro control) sigue en Opciones; con Clásico puesto no queda ninguno de los tres marcado y la línea lo dice.
    const conNivel = cfg.ctl === 'b' || cfg.ctl === 'c';
    const nivelHTML = conNivel ? `<div class="fila bv-nivel" role="group" aria-label="${esc(t('opciones.dificultad'))}"><span>${t('opciones.dificultad')}</span>${DIFICULTADES.map(d => opt('dif', 'd', d, cfg.ctl === 'c' ? null : cfg.dif, 'opciones.dif.' + d)).join('')}<small class="nota">${t('opciones.dif_nota.' + (cfg.ctl === 'c' ? 'clasico' : cfg.dif))}</small></div>` : '';
    const opciones = S.opciones ? `<div class="opciones">
        <div class="fila"><span>${t('opciones.dificultad')}</span>${conNivel ? '' : DIFICULTADES.map(d => opt('dif', 'd', d, cfg.ctl === 'c' ? null : cfg.dif, 'opciones.dif.' + d)).join('')}${opt('ctl', 'c', 'c', cfg.ctl, 'opciones.pro')}${conNivel ? '' : `<small class="nota">${t('opciones.dif_nota.' + (cfg.ctl === 'c' ? 'clasico' : cfg.dif))}</small>`}</div>
        <div class="fila"><span>${t('opciones.rivales')}</span>${opt('nivel', 'n', 'amistoso', cfg.nivel, 'opciones.tranquilos')}${opt('nivel', 'n', 'normal', cfg.nivel, 'opciones.parejos')}${opt('nivel', 'n', 'dificil', cfg.nivel, 'opciones.duros')}</div>
        <div class="fila"><span>${t('opciones.orden')}</span>${opt('orden', 'o', 'rondas', cfg.orden, 'opciones.orden_rondas')}${opt('orden', 'o', 'oficial', cfg.orden, 'opciones.orden_oficial')}<small class="nota">${t('opciones.orden_nota.' + cfg.orden)}</small></div>
        <div class="fila"><span>${t('opciones.final')}</span>${opt('ritmo', 'r', 'expres', cfg.ritmo, 'opciones.rapida')}${opt('ritmo', 'r', 'completa', cfg.ritmo, 'opciones.completa')}</div>
        <div class="fila"><span>${t('opciones.camara')}</span>${CAMARAS_ELEGIBLES.map(c => opt('cam', 'cam', c, E.camara || camElegida(), 'opciones.cam.' + CAMARA_NOMBRE[c])).join('')}${(E.camara || camElegida()) === 'pov' ? ['si', 'no'].map(v => opt('rec', 'rec', v, recuadroOn() ? 'si' : 'no', 'opciones.recuadro_' + v)).join('') : ''}</div>
        <div class="fila"><span>${t('opciones.sonido')}</span>${['si', 'no'].map(v => `<button data-sonido="${v}" aria-pressed="${(v === 'si') === sonido.encendido}">${sonido.icono(v === 'si')}${t('opciones.sonido_' + v)}</button>`).join('')}</div>
        ${telefono.instalable ? `<div class="fila"><span>${t('opciones.pantalla')}</span><button data-instalar="1">${t('opciones.como_instalar')}</button></div>` : ''}</div>` : '';
    const abrio = S.verOpciones; S.verOpciones = false;
    // la fila de botones (.pie) va fuera de la parte que se desplaza (.bv-cuerpo): nunca tapa las tarjetas
    const tarjetas = !primera || forzarElegir;      // la elección de pesista se ofrece después de la primera final
    const pn = capa.poner(`<div class="bv-cuerpo"><div class="cabeza">${idiomasHTML()}<h1>Lifting Game</h1><p class="bajada">${t('bienvenida.bajada')}</p></div>
      ${params.has('c') ? `<p class="desafio">${t('bienvenida.desafio')}</p>` : ''}${q ? `<p class="quedan">${q}</p>` : ''}
      ${nombreHTML}
      ${tarjetas ? `<h2 id="pesista-t">${esc(t('pesista.titulo', { nombre: mostrado() }))}</h2>
      <div class="pesistas">${IDS.map(id => `<button class="pesista" data-id="${id}" aria-pressed="${id === cfg.id}"><div class="b" style="background:${PLANTEL[id].bandera}"></div><b>${t(`pesista.${id}.tipo`)}</b>${cfg.ctl === 'b' ? `<small class="conviene">${t(`pesista.${id}.b`)}</small><small class="rm">${t('rm.tarjeta', { s: datos.atletas[id].techo.s, c: datos.atletas[id].techo.c })}</small>` : `${cuerpoHTML(id, uno)}<small class="conviene">${t(uno ? `pesista.${id}.u` : `pesista.${id}.conviene`)}</small>`}</button>`).join('')}</div>` : ''}
      ${nivelHTML}${opciones}</div><div class="fila pie"><button class="ir grande" id="btn-empezar" data-completa>${t('bienvenida.jugar')}</button>${uno ? '' : `<button id="btn-otro" data-completa>${t(facil ? (falta ? 'opciones.saltar_practica' : 'opciones.repetir_practica') : 'opciones.sin_calentar')}</button>`}<span class="secundarios"><button id="btn-opciones" aria-expanded="${S.opciones}"><span aria-hidden="true">⚙</span> ${t('bienvenida.opciones')} ${S.opciones ? '▴' : '▾'}</button><button class="link" id="btn-ayuda">${t('boton.ayuda')}</button><a class="legal" href="privacidad.html?lang=${idiomaActual()}" target="_blank" rel="noopener">${t('app.privacidad')}</a></span></div>
      `, 'bienvenida');
    pn.querySelector('a.legal')?.addEventListener('click', () => ev('privacidad_abierta', { pantalla: E.pantalla }));
    if (abrio) { const bc = pn.querySelector('.bv-cuerpo') || pn; bc.scrollTop = bc.scrollHeight; }      // Opciones se abre arriba de la fila de botones: se lleva a la vista
    const inp = pn.querySelector('#nombre');
    if (inp) {
      // el título de las tarjetas sigue al nombre mientras se escribe (textContent: no hace falta escapar)
      inp.addEventListener('input', () => { S.nombre = inp.value; const h = pn.querySelector('#pesista-t'); if (h) h.textContent = t('pesista.titulo', { nombre: mostrado() }); });
      // con teclado, el foco arranca en el nombre; en el teléfono no (abriría el teclado de pantalla sin que lo pida)
      if (S.focoNombre && !T) { inp.focus({ preventScroll: true }); S.focoNombre = false; }
    }
    E.repintar = null;
    const b = await Promise.race([clic(pn, 'button'), new Promise(res => { E.repintar = () => res(null); })]);
    if (inp) S.nombre = inp.value;
    if (!b) continue;      // cambió el idioma desde la pausa: se vuelve a pintar
    if (b.dataset.lang) { cambiarIdioma(b.dataset.lang); continue; }
    if (b.dataset.id) { cfg.id = b.dataset.id; await verPesista(); }      // la tarjeta abre la selección con el pesista en 3D
    else if (b.dataset.n) { cfg.nivel = b.dataset.n; guardado.set('tarima.nivel_elegido', '1'); } else if (b.dataset.r) cfg.ritmo = b.dataset.r; else if (b.dataset.c) cfg.ctl = b.dataset.c; else if (b.dataset.o) cfg.orden = b.dataset.o;
    // dificultad: Fácil, Medio y Difícil son la barrita; Difícil trae rivales parejos si estaban los tranquilos
    else if (b.dataset.d) { cfg.dif = b.dataset.d; if (cfg.ctl === 'c') cfg.ctl = 'b'; if (cfg.dif === 'dificil' && cfg.nivel === 'amistoso') cfg.nivel = 'normal'; fijarDificultad(cfg); }
    else if (b.id === 'btn-opciones') { S.opciones = !S.opciones; S.verOpciones = S.opciones; if (S.opciones) ev('opciones_abiertas'); }
    else if (b.dataset.cam) elegirCamara(b.dataset.cam, 'opciones');
    else if (b.dataset.rec) { guardado.set('tarima.recuadro', b.dataset.rec); escena?.setRecuadro(recuadroOn(), recuadroPedido()); }
    else if (b.dataset.sonido) sonido.encender(b.dataset.sonido === 'si');      // dentro del toque: en el iPhone así se desbloquea
    else if (b.dataset.instalar) telefono.avisoInstalar(true);
    else if (b.id === 'btn-ayuda') abrirSobre('ayuda');
    else if (b.id === 'btn-nosoy') { S.editar = true; S.nombre = ''; S.cambio = true; S.focoNombre = true; }
    // el tutorial se ofrece una sola vez: queda anotado al salir del inicio (se haga o se saltee), así que recargar no lo repite
    else {
      const principalBtn = b.id === 'btn-empezar'; cfg.calentar = uno ? false : facil ? principalBtn === falta : principalBtn; cfg.primera = primera; if (facil) guardado.set('tarima.tutorial', '1');
      if (S.editar) guardado.set('tarima.nombre', limpiarNombre(S.nombre));
      ev('nombre_puesto', { vacio: !limpiarNombre(guardado.get('tarima.nombre')), vuelve, cambio: S.cambio });
      ev('pesista_elegido', { pesista: TIPO[cfg.id], por_defecto: !S.tocoPesista, ofrecido: !primera, modelo: PLANTEL[cfg.id].modelo });
      E.tJugar = performance.now();
      break;
    }
  }
  guardado.set('tarima.pesista', cfg.id); guardado.set('tarima.aspecto', E.aspecto?.plaza === cfg.id ? E.aspecto.modelo : ''); guardado.set('tarima.nivel', cfg.nivel); guardado.set('tarima.ctl', cfg.ctl); guardado.set('tarima.dificultad', cfg.dif); guardado.set('tarima.orden', cfg.orden); fijarDificultad(cfg); capa.quitar(); return cfg;
}

/** Dibujos de los botones de la selección de pesista (sin texto): girar un cuarto de vuelta y barra arriba. */
const EL_SVG = {
  giro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 3.5v4.6h4.6"/></svg>',
  arriba: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h20M4.5 2.5v5M19.5 2.5v5"/><circle cx="12" cy="9.2" r="2"/><path d="M7.5 5l4.5 7.5L16.5 5M12 12.5v4.5l-3 5M12 17l3 5"/></svg>',
};
/**
 * Selección de pesista «tipo selección de personaje» (pedido del dueño, 17-nov: «quiero evaluar bien el físico; cuando
 * seleccione el pesista quiero ver al pesista»). El panel va a un costado (teléfono parado: abajo) con las tres tarjetas y
 * la ficha del elegido (nombre, país, categoría, estatura y kilos, de plantel.json); en lo que queda libre, el pesista de
 * pie, a cuerpo entero, de frente y con lente normal (stage.js, PLANOS.elegir). Gira solo sobre su eje (una vuelta en 12 s:
 * gira él con la barra, no la cámara, así el lado que se mira es el iluminado), se gira arrastrando sobre la escena, y dos
 * botones lo llevan de a cuarto de vuelta (frente, perfil, espalda). Otro botón alterna «de pie» y «barra arriba» (la pose
 * final del arranque, con el clip pasado rápido). De pie no se dibuja la barra. Entra por una tarjeta de la bienvenida o
 * con `?elegir=1`. No se dibuja ni calcula nada cuando la pantalla no está abierta.
 * @returns {Promise<string>} el pesista elegido
 */
async function elegirPesista(cfg, nombre = '') {
  visita('elegir'); const uno = esU(cfg.ctl), yo0 = escena.yo, kg0 = escena.kg, VUELTA = 12, T_POSE = 1.7, html = document.documentElement;
  const G = E.elegir = { id: cfg.id, asp: {}, visto: null, ang: 0, meta: null, pausa: 0, drag: null, arriba: false, u: 0, n: 0, cola: Promise.resolve(), fin: false, W: 0, H: 0, pn: null, bajando: false };
  escena.yo = null;      // cada pesista con su propia malla: la del jugador (JUGADOR) vuelve al salir
  // Aspectos (roster.js, ASPECTOS): en cada plaza, el modelo de siempre y los nuevos, con la marca «(nuevo)». Las fichas de
  // los nuevos (plantel.json) y sus modelos se bajan recién acá: quien no abre la selección no baja nada de más.
  const fichas = (await plantelJSON().catch(e => { console.warn('plantel:', e); return null; }))?.pesistas || null, poses = escena.poses;
  const opciones = id => [basePlantel(id).modelo, ...aspectosDe(id, fichas, poses)], nuevo = (id, m) => m !== basePlantel(id).modelo;
  for (const id of IDS) G.asp[id] = id === cfg.id && E.aspecto?.plaza === id && opciones(id).includes(E.aspecto.modelo) ? E.aspecto.modelo : basePlantel(id).modelo;
  const clave = () => G.id + ':' + G.asp[G.id];
  /** Lo que se muestra de un pesista: el modelo nuevo con su ficha de plantel.json; el de siempre, con la suya. */
  const cara = (id, m = G.asp[id]) => { const b = basePlantel(id), x = nuevo(id, m) ? fichas[m] : { ...(b.modelo === id ? fichas?.[id] : null), ...b }; return { ...x, nuevo: nuevo(id, m), alto: nuevo(id, m) || b.vestido ? dec(poses[m].h) + ' m' : t(`pesista.${id}.alto`) }; };
  const marca = f => (f.nuevo ? ` <span class="el-nuevo">${t('pesista.nuevo')}</span>` : '');
  const dec = (n, d = 2) => n.toFixed(d).replace('.', idiomaActual() === 'es' ? ',' : '.');
  const ficha = id => {
    const f = cara(id), at = datos.atletas[id];
    return `<b class="el-nombre">${esc(f.nombre || f.corto)}${marca(f)}</b>
      ${f.pais ? `<span class="el-pais"><i style="background:${f.bandera}"></i>${esc(f.codigo || '')} · ${esc(f.pais)}</span>` : ''}
      <span class="el-datos">${f.categoria ? `<em>${esc(f.categoria)} kg</em>` : ''}<span>${f.alto}${f.masa ? ` · ${dec(f.masa, f.masa % 1 ? 1 : 0)} kg` : ''}</span></span>
      <small class="conviene">${t(cfg.ctl === 'b' ? `pesista.${id}.b` : uno ? `pesista.${id}.u` : `pesista.${id}.conviene`)}</small><small class="rm">${t('rm.tarjeta', { s: at.techo.s, c: at.techo.c })}</small>`;
  };
  /** La pose del arranque en `u` (0 = de pie, 1 = barra arriba): el clip entero, con arranque y frenado suaves. */
  const pose = u => { const S = tramo(escena.P, 'snatch'), k = u * u * (3 - 2 * u), tau = k * (S.fin - .05); return u <= 0 ? poseParado(escena.P, 's') : { seg: S.nombre, s: S.inv(tau), tau, base: S.base, primero: true }; };
  const posar = () => { escena.barbell.group.visible = G.u > 0; escena.posarGirado(pose(G.u), 's', G.ang); };
  /** El pesista entero (con la barra, si está arriba) en la parte del lienzo que deja libre el panel. */
  const encuadrar = (suave = 0) => {
    const gl = $('gl'), W = gl.clientWidth, H = gl.clientHeight, pn = G.pn; G.W = W; G.H = H; if (!W || !H || !escena.P || !escena.activo || !pn) return;
    let x0 = .02, x1 = .98, y1 = .97; const y0 = .03 + (parseFloat(getComputedStyle(html).getPropertyValue('--st')) || 0) / H;
    const izq = pn.offsetLeft / W, arr = pn.offsetTop / H; if (izq > .28) x1 = izq - .01; else if (arr > .25) y1 = arr - .03;
    const h = escena.P.h, S = tramo(escena.P, 'snatch'), barra = escena.alturaMuestra(S.base + S.n - 1) || 1.2 * h;
    const tope = G.arriba ? Math.max(1.08 * h, barra + .3) : 1.08 * h, piso = -.07, alto = (tope - piso) * 1.07, ancho = G.arriba ? 2.6 : Math.max(1.05, .68 * h);
    // lente normal (38°); si así la cámara quedara más lejos que la mesa del jurado (teléfono parado con la barra arriba, que
    // pide 2,6 m de ancho), se queda a 6,2 m y abre el lente lo necesario (hasta 56°)
    const asp = W / H, X = Math.max(alto / (y1 - y0), ancho / (asp * (x1 - x0))), LEJOS = 6.2, tg0 = 2 * Math.tan(19 * Math.PI / 180), tg = Math.min(2 * Math.tan(28 * Math.PI / 180), Math.max(tg0, X / LEJOS));
    PLANOS.elegir.fov = 2 * Math.atan(tg / 2) * 180 / Math.PI; escena.elegirY = (tope + piso) / 2;
    escena.primerPlano('elegir', { x: (x0 + x1) / 2, y: (y0 + y1) / 2, dAbs: X / tg }, suave);
  };
  /** Pone en escena al pesista de la tarjeta `id` (con un fundido corto si ya había otro a la vista). */
  const bajando = on => { G.bajando = on; G.pn?.classList.toggle('bajando', on); };
  const ver = () => (G.cola = G.cola.then(async () => {
    const id = G.id, k = clave(); if (G.fin || k === G.visto) return;
    vestirJugador(id, G.asp[id], fichas, poses);      // la plaza elegida con ese modelo; las otras dos, como siempre
    if (!escena.atletas[PLANTEL[id].modelo]) { bajando(true); E.reprecal = true; }      // un modelo que no estaba: se baja ahora, y antes de jugar se precalienta de nuevo
    try { await escena.cargar(id); } catch (e) { console.warn('elegir:', e); return; } finally { bajando(false); }
    if (G.fin || k !== clave()) return;
    const cambio = async () => { escena.girar(0); await escena.mostrar(id); escena.setCarga(Math.round(datos.atletas[id].techo.s), 's'); G.u = G.arriba ? 1 : 0; posar(); encuadrar(0); G.visto = k; };
    // también al entrar (17-nov): de la bienvenida a la selección la cámara cambia de plano, y eso va detrás de un fundido
    if (G.visto || escena.activo) await fundido(cambio); else await cambio();
  }).catch(e => { console.warn('elegir:', e); }));
  const marcar = () => { const pn = G.pn; if (!pn) return; pn.querySelectorAll('.pesista').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.id === G.id)); const f = cara(b.dataset.id); b.querySelector('small').innerHTML = esc(f.corto) + marca(f); b.querySelector('.b').style.background = f.bandera; });
    const ops = opciones(G.id), A = pn.querySelector('#el-aspectos'); A.hidden = ops.length < 2;
    A.innerHTML = ops.map(m => { const f = cara(G.id, m); return `<button data-m="${m}" aria-pressed="${m === G.asp[G.id]}">${esc(f.corto)}${marca(f)}</button>`; }).join('');
    pn.classList.toggle('bajando', G.bajando); pn.querySelector('#el-ficha').innerHTML = ficha(G.id); pn.querySelector('#el-pose').setAttribute('aria-pressed', String(G.arriba)); };
  const elegir = id => { if (!IDS.includes(id) || id === G.id) return; G.id = id; marcar(); ver(); };
  const aspecto = m => { if (!opciones(G.id).includes(m) || m === G.asp[G.id]) return; G.asp[G.id] = m; marcar(); G.pn?.querySelector(`#el-aspectos [data-m="${m}"]`)?.focus({ preventScroll: true }); ver(); };
  let listo = null; const fin = new Promise(res => { listo = res; });
  const montar = () => {
    const pn = G.pn = capa.poner(`<h2>${esc(t('pesista.titulo', { nombre: nombre || t('bienvenida.nombre_defecto') }))}</h2>
      <div class="pesistas">${IDS.map(id => `<button class="pesista" data-id="${id}"><div class="b" style="background:${PLANTEL[id].bandera}"></div><b>${t(`pesista.${id}.tipo`)}</b><small></small></button>`).join('')}</div>
      <div class="el-aspectos" id="el-aspectos"></div><p class="el-bajando">${t('carga.bajando')}…</p>
      <div class="el-ficha" id="el-ficha"></div>
      <div class="el-ver"><button id="el-izq" data-g="-1">${EL_SVG.giro}</button><button id="el-der" data-g="1">${EL_SVG.giro}</button><button id="el-pose" aria-label="${esc(t('cuerpo.tramo.arriba'))}">${EL_SVG.arriba}</button><button class="ir" id="el-listo">${t('campo.listo')}</button></div>`, 'elegir');
    marcar(); if (!tactil() && !E.sobre) pn.querySelector('.pesista[aria-pressed=true]')?.focus({ preventScroll: true });      // con teclado el foco arranca en la tarjeta elegida
    // la escena libre es para girar al pesista con el dedo o el ratón: no cuenta como toque del juego (input.js)
    const z = document.createElement('div'); z.id = 'el-zona'; $('capa').append(z);
    z.addEventListener('pointerdown', e => { e.stopPropagation(); if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); G.drag = { id: e.pointerId, x: e.clientX, ang: G.ang }; G.meta = null; try { z.setPointerCapture(e.pointerId); } catch { /* sin captura */ } });
    z.addEventListener('pointermove', e => { const d = G.drag; if (d && d.id === e.pointerId) G.ang = d.ang + (e.clientX - d.x) * .012; });
    const suelta = e => { if (G.drag && G.drag.id === e.pointerId) { G.drag = null; G.pausa = 3; } };
    z.addEventListener('pointerup', suelta); z.addEventListener('pointercancel', suelta);
    pn.querySelector('#el-aspectos').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b && activa(pn)) { sonido.activar(); aspecto(b.dataset.m); } });
    pn.querySelectorAll('button:not([data-m])').forEach(b => {
      b.addEventListener('click', e => {
        if (!activa(pn)) return; sonido.activar();
        if (b.dataset.id) { if (b.dataset.id === G.id && e.detail === 0) listo(); else elegir(b.dataset.id); }      // con teclado: flechas para cambiar y Enter sobre la tarjeta elegida para quedarse con ella
        else if (b.dataset.g) { const q = Math.PI / 2, d = +b.dataset.g, base = G.meta ?? G.ang; G.meta = d > 0 ? Math.floor(base / q + 1.001) * q : Math.ceil(base / q - 1.001) * q; G.pausa = 6; }
        else if (b.id === 'el-pose') { G.arriba = !G.arriba; marcar(); if (reduceMotion) { G.u = G.arriba ? 1 : 0; if (G.visto) posar(); } encuadrar(.6); }
        else if (b.id === 'el-listo') listo();
      });
      if (b.dataset.id) b.addEventListener('focus', () => elegir(b.dataset.id));      // las flechas mueven el foco entre los botones (teclado de los paneles): la tarjeta con foco es la elegida
    });
    return pn;
  };
  bloquear(montar()); E.repintar = () => { montar(); encuadrar(0); };
  enCuadro = (ahora, dt) => {
    E.forzar = true;      // detrás de un panel la imagen queda quieta: acá se dibuja siempre
    if (!G.visto || !escena.activo) return;
    if ($('gl').clientWidth !== G.W || $('gl').clientHeight !== G.H) encuadrar(0);      // giró el teléfono o cambió la ventana
    if (G.meta !== null) { G.ang += (G.meta - G.ang) * (1 - Math.exp(-9 * dt)); if (Math.abs(G.meta - G.ang) < .004 || reduceMotion) { G.ang = G.meta; G.meta = null; } }
    else if (!G.drag) { if (G.pausa > 0) G.pausa -= dt; else if (!reduceMotion) G.ang += dt * 2 * Math.PI / VUELTA; }
    const uT = G.arriba ? 1 : 0;
    if (G.u !== uT) { G.u = uT > G.u ? Math.min(1, G.u + dt / T_POSE) : Math.max(0, G.u - dt / T_POSE); posar(); } else escena.girar(G.ang);
  };
  ver();
  await fin;
  G.fin = true; enCuadro = null; E.repintar = null;
  // todo como estaba: sin giro, de pie, con la barra a la vista y su carga, y la malla del jugador en su pesista. Si un
  // cambio de pesista quedó a medias (un fundido en curso), se vuelve a dejar todo en su lugar cuando termina
  const dejar = () => { escena.barbell.group.visible = true; escena.girar(0); if (kg0) escena.setCarga(kg0); if (escena.activo) escena.posar(poseParado(escena.P, 's'), 's'); E.forzar = true; };
  // al salir (17-nov), lo mismo: el giro y la pose vuelven a su lugar detrás de un fundido corto, no de golpe
  if (escena.activo && G.visto) await fundido(async () => dejar()); else dejar();
  G.cola.then(() => { if (E.pantalla === 'inicio' || E.pantalla === 'elegir') dejar(); });
  // lo elegido queda puesto en el plantel (la plaza del jugador con su modelo, los rivales con los de siempre)
  const m = G.asp[G.id], es = vestirJugador(G.id, m, fichas, poses);
  escena.yo = yo0; E.elegir = null; capa.quitar();
  return { id: G.id, aspecto: es ? m : '' };
}

/**
 * Medidas del cuerpo en la tarjeta del pesista: estatura, fémur, brazos y movilidad, con una barra cada una. En 'u' (`uno`),
 * debajo, lo que a ese cuerpo le cuesta cada tramo (sim.json → cuerpoJuego: barra llena = fácil); en Clásico, energía y margen.
 */
function cuerpoHTML(id, uno = false, barra = false) {
  const C = CUERPO[id], fr = (k, v) => { const r = BARRA[k]; return r ? Math.max(.08, Math.min(1, (v - r[0]) / (r[1] - r[0]))) : v === 'alta' ? .9 : .55; };
  const largo = (k, v) => (k === 'estatura' ? (PLANTEL[id].vestido ? v.toFixed(2).replace('.', idiomaActual() === 'es' ? ',' : '.') + ' m' : t(`pesista.${id}.alto`)) : k === 'movilidad' ? t('cuerpo.' + v) : t(fr(k, v) > .5 ? (k === 'brazos' ? 'cuerpo.largos' : 'cuerpo.largo') : (k === 'brazos' ? 'cuerpo.cortos' : 'cuerpo.corto')));
  const med = (k, v, txt) => `<span class="med"><i>${t('cuerpo.' + k)}</i><span class="barra" style="--v:${Math.round(v * 100)}%"></span><em>${txt}</em></span>`;
  // energía y margen (de la ficha de juego): lo que distingue a Largo de Potente mientras comparten cuerpo
  const at = datos?.atletas?.[id]?.attrs, cj = datos?.atletas?.[id] ? cuerpoDe(id) : null;
  const tramoMed = k => `<span class="med tramo ${nivelTramo(cj[k])}"><i>${t('cuerpo.tramo.' + k)}</i><span class="barra" style="--v:${Math.round(Math.max(.1, Math.min(1, (1600 - cj[k]) / 1200)) * 100)}%"></span><em>${t('cuerpo.' + nivelTramo(cj[k]))}</em></span>`;
  // 'b': el verde de cada barrita (ancho = fácil), con el mismo dibujo que los tramos
  const cb = barra && cj ? cuerpoBarra(id).barra : null, verdeMed = k => { const x = cb[k], n = x >= 1150 ? 'facil' : x <= 850 ? 'cuesta' : 'normal'; return `<span class="med tramo verde ${n}"><i>${t('cuerpo.barra.' + k)}</i><span class="barra" style="--v:${Math.round(Math.max(.15, Math.min(1, (x - 500) / 900)) * 100)}%"></span><em>${t('barra.verde.' + (n === 'facil' ? 'ancho' : n === 'cuesta' ? 'angosto' : 'medio'))}</em></span>`; };
  // 'b': la tarjeta dice solo lo que cambia el juego (la frase va antes, en su propio bloque): el verde de cada barrita
  if (cb) return `<span class="cuerpo u vb">${['tiron', 'envion'].map(verdeMed).join('')}</span>`;
  const ficha = uno && cj ? ['tiron', 'arriba', 'pararse'].map(tramoMed).join('') : at ? Object.entries(FICHA).map(([k, c]) => med(k, Math.max(.08, at[c] / 10), t(`ficha.${k}.${nivelFicha(at[c])}`))).join('') : '';
  return `<span class="cuerpo${uno ? ' u' : ''}">${['estatura', 'femur', 'brazos', 'movilidad'].map(k => med(k, fr(k, C[k]), largo(k, C[k]))).join('')}${ficha}</span>`;
}

/** Metrónomo de 8 toques: la mediana del atraso propone la corrección (0 a 100 ms), que queda fija para toda la partida. */
async function metronomo() {
  visita('metronomo'); const defecto = tactil() ? 40 : 0, PULSO = 700, N = 8;
  const pn = capa.poner(`<h2>${t('cal.titulo')}</h2><p>${t('cal.texto', { n: N, tactil: tactil() })}</p><div class="pulso" id="pulso">${N}</div><div class="fila"><button id="btn-saltear">${t('cal.saltear')}</button></div>`, 'chico', { foco: false });
  bloquear(pn); const t0 = E.metro = reloj.ahora() + 1200, errs = []; let salto = false, k = -1;
  clic(pn, '#btn-saltear').then(() => { salto = true; });
  boton.oye = (tt, v, via) => { if (!v) return; if (via === 'mouse') return toques.resolver(false, 'mouse'); const x = tt - t0, i = Math.round(x / PULSO), ok = i >= 0 && i < N; if (ok) errs[i] = x - i * PULSO; toques.resolver(ok, ok ? 'gesto' : 'espera'); };
  await new Promise(res => { enCuadro = ahora => { const x = ahora - t0, i = Math.floor(x / PULSO); if (i > k && i >= 0 && i < N) { k = i; sonido.tic(); $('pulso').textContent = N - i - 1 || '✓'; } $('pulso')?.classList.toggle('on', x >= 0 && x % PULSO < 140); if (salto || x > N * PULSO + 300) { enCuadro = null; res(); } }; });
  boton.oye = null; const e = errs.filter(x => x !== undefined).sort((a, b) => a - b);
  if (salto || e.length < 5) { capa.quitar(); return defecto; }
  const med = Math.round(Math.max(0, Math.min(100, e[e.length >> 1])));
  const p2 = capa.poner(`<h2>${t('cal.medido', { ms: med })}</h2><p>${t('cal.medido_texto')}</p><div class="fila"><button class="ir" id="cal-si" data-v="${med}">${t('cal.usar', { ms: med })}</button><button id="cal-no" data-v="${defecto}">${t('cal.dejar', { ms: defecto })}</button></div>`, 'chico');
  bloquear(p2); const b = await clic(p2, 'button'); capa.quitar(); return +b.dataset.v;
}

/** Calentamiento de Pro: tres levantamientos de práctica, sin costo: dos livianos y uno pesado guionado que enseña la pelea y el pitido. */
async function practica(cfg) {
  const f = datos.atletas[cfg.id], a = { id: cfg.id, f, i: E.yo }, errs = []; escena.yo = cfg.id;
  const casos = [{ lev: 's', I: 8000, txt: () => t('cal.s_liviano') },
    { lev: 'c', env: f.enviones[0], I: 8000, txt: () => t('cal.c_liviano', { envion: ENVIONES[f.enviones[0]] }) },
    { lev: 's', I: 8600, exiFija: exigenciaTabla(9800), txt: () => t('cal.s_pesado') }];
  await escena.mostrar(cfg.id);
  for (let k = 0; k < casos.length; k++) {
    const c = casos[k]; visita('practica'); escena.setCarga(k === 2 ? Math.round(f.techo.s * .98) : Math.round(f.techo[c.lev] * .6), c.lev); escena.posar(poseParado(escena.P, c.lev), c.lev); escena.camara(camPrincipal());
    zocalo(a, { lev: c.lev, n: 0, kg: escena.kg }); setReloj(25000);
    const pn = capa.poner(`<h2>${t('cal.n', { k: k + 1, n: casos.length })}</h2><p>${c.txt()}</p><div class="fila"><button class="ir" id="btn-practicar">${t('cal.probar')}</button><button id="btn-saltear">${t('cal.saltear_todo')}</button></div>`, 'chico abajo');
    bloquear(pn); const b = await clic(pn, 'button'); capa.quitar(); if (b.id === 'btn-saltear') break;
    const ctx = { lev: c.lev, env: c.env, I: c.I, exiFija: c.exiFija, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: 77 + k, cal: cfg.cal, primera: true, domina: true, jueces: [1000, 1000, 1000], reloj: 25000, ctl: 'c' };
    const r = await correrIntento(ctx, { a, lev: c.lev, env: c.env, conf0: 0 });
    for (const g of r.res.gestos) if (!g.fuera) errs.push(Math.abs(g.e));
    await decision(a, c.lev, r.res, null, true, { ctl: 'c', practica: true, fin: armarFinal(r, c.lev) });
  }
  zocalo(null); return errs.length ? errs.reduce((x, y) => x + y, 0) / errs.length : null;
}

/** P2 · Tarjeta del arranque: una línea y «Probar», solo antes de la primera práctica. Menos de 5 s. */
async function tarjeta() {
  if (guardado.get('tarima.visto.tarjeta')) return;
  visita('tarjeta');
  const html = () => `${idiomasHTML(true)}<h2>${t('practica.tarjeta_titulo')}</h2><p class="que">${t('practica.tarjeta')}</p><div class="fila"><button class="ir grande" id="btn-probar">${t('practica.probar')}</button></div>`;
  let pn = capa.poner(html(), 'chico'); bloquear(pn);
  for (;;) { const b = await Promise.race([clic(pn, '#btn-probar'), new Promise(res => { E.repintar = () => res(null); })]); if (b) break; pn = capa.poner(html(), 'chico'); }
  E.repintar = null; capa.quitar(); guardado.set('tarima.visto.tarjeta', '1');
}

/**
 * P3 · Práctica de Un toque (docs/CONTROLES.md, sección 6): UN arranque guiado en cámara lenta, que no se puede fallar (el
 * reloj se detiene y espera cada toque). Dura menos de un minuto, se ofrece una sola vez y se saltea en cualquier momento
 * con Esc o con el botón «Saltar práctica». El dos tiempos se explica la primera vez que toca, en la final.
 */
async function tutorial(cfg) {
  const f = datos.atletas[cfg.id], a = { id: cfg.id, f, i: E.yo }; escena.yo = cfg.id;
  const ctx = { lev: 's', I: 8000, exiFija: exigenciaTabla(9300), tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: 71, cal: cfg.cal, primera: true, domina: true, jueces: [1000, 1000, 1000], reloj: 0, ctl: 'f', ...(tactil() ? { tactil: true } : {}) };
  await escena.mostrar(cfg.id); visita('tutorial');
  escena.setCarga(Math.round(f.techo.s * .8), 's'); escena.posar(poseParado(escena.P, 's'), 's'); escena.camara(camPrincipal()); zocalo(a, { lev: 's', n: 0, kg: escena.kg }); relojLibre(); setLuces(null);
  visita('guiado'); $('etiqueta').hidden = false; $('etiqueta').textContent = t('practica.etiqueta'); $('saltar').hidden = false; ev('tutorial_inicio'); const tIni = performance.now();
  const r = await Promise.race([correrIntento(ctx, { a, lev: 's', conf0: 0, guia: GUIADO }), new Promise(res => { E.saltar = () => res(null); })]);
  E.saltar = null; $('saltar').hidden = true; etiqueta(null);
  if (r) {
    ev('tutorial_fin', { valido: r.res.res === 'valido', s: Math.round((performance.now() - tIni) / 1000) });
    await decision(a, 's', r.res, null, true, { ctl: 'f', sub: t('practica.fin'), practica: true, fin: armarFinal(r, 's') });
  } else { const paso = E.intento?.senal?.paso ?? null; E.intento?.cancelar(); ev('tutorial_salteado', { paso, s: Math.round((performance.now() - tIni) / 1000) }); }
  zocalo(null); return null;
}

/**
 * P6 · Primer peso: «¿Con cuántos kilos empiezas…?», con el sugerido ya elegido y un botón grande «Empezar con N kg».
 * Los −/+ quedan al costado. Rango del 88 % al 97 % del máximo del pesista.
 */
async function elegirApertura(p, lev, sugerida, html) {
  const [lo, hi] = p.rangoApertura(E.yo, lev); let kg = Math.max(lo, Math.min(hi, sugerida)), abierto = false;
  for (;;) {
    const arriba = html();
    const pn = capa.poner(`${idiomasHTML(true)}${arriba}<h2>${t(lev === 's' ? 'peso.titulo_s' : 'peso.titulo_c')}</h2>
      ${kilosHTML(kg, lo, hi, false, `<button class="ir grande" id="btn-confirmar">${t('peso.boton', { kg })}</button>`)}
      <p>${t('peso.rango', { lo, hi })}${lev === 's' ? ' ' + t('peso.ayuda') : ''}</p>${tactil() ? '' : `<p class="chica">${t('peso.teclas5')}</p>`}`, arriba ? 'peso con-tabla lado' : 'peso lado');
    if (!abierto) { bloquear(pn); abierto = true; encuadrarLibre(); }      // el bloqueo es al abrir, no en cada kilo; el pesista, a la parte libre
    const b = await Promise.race([clic(pn, '.kg,#btn-confirmar'), new Promise(res => { E.repintar = () => res(null); })]);
    if (!b) continue;
    if (b.dataset.d) kg = masKilos(kg, +b.dataset.d, lo, hi); else break;
  }
  capa.quitar(); p.abrir(E.yo, lev, kg);
}

/**
 * P5 · Cómo se gana (en la primera final, tres líneas numeradas; desde la segunda, solo los rivales) y después P6. En 'b' y
 * 'u' sin las tres líneas (LIF-52): las luces y el total se explican en su momento, una vez (ui/aprende.js).
 * `primera`: es la primera final de este dispositivo.
 */
async function presentacion(p, cfg, errMedio, primera) {
  visita('presentacion'); const f = p.at[E.yo].f, G = p.guion, yo = p.at[E.yo];
  // apertura sugerida según el error medido en el calentamiento: 93,5 % para un jugador preciso, hasta 88 % para uno que todavía no agarró el ritmo
  // en Un toque las ventanas son el doble de anchas y la sugerencia sin medir es más prudente (90 %)
  const facil = cfg.ctl !== 'c', pct = facil ? (errMedio === null ? (cfg.ctl === 'b' ? reglasB(cfg.dif).apertura / 1000 : .90) : Math.max(.88, Math.min(.93, .93 - (errMedio - 50) / 150 * .05))) : errMedio === null ? .935 : Math.max(.88, Math.min(.935, .935 - (errMedio - 30) / 60 * .055)), sug = Math.round(f.techo.s * pct);
  const forma = s => t(s > 0 ? 'forma.liviano' : s < 0 ? 'forma.pesado' : 'forma.normal');
  const rivales = p.at.filter(a => a.i !== E.yo);
  const html = () => `${idiomasHTML(true)}${primera && !esU(cfg.ctl) ? `<h2>${t('gana.titulo')}</h2><ol class="reglas"><li>${t('gana.l1')}</li><li>${t('gana.l2')}</li><li>${t('gana.l3')}</li></ol>` : ''}
    <h2>${t('gana.rivales')}</h2><div class="pesistas rivales">${rivales.map(a => `<div class="pesista"><div class="b" style="background:${PLANTEL[a.id].bandera}"></div><b>${esc(quien(a))}</b><small>${t('gana.abre', { s: a.decl.s, c: a.decl.c })}${a.plan ? `<span class="estilo"> · ${t('rival.estilo.' + a.plan.estilo)}</span>` : ''}</small></div>`).join('')}</div>
    ${G.tipo !== 'nada' ? `<p>${esc(G.tipo === 'tocado' && esU(cfg.ctl) ? t('guion.tocado_u', { rival: quien(p.at[G.a]) }) : GUIONES[G.tipo](G.a >= 0 ? quien(p.at[G.a]) : ''))}</p>` : ''}<p>${t('gana.forma', { s: forma(yo.forma.s), c: forma(yo.forma.c) })}</p>`;
  let pn = capa.poner(`${html()}<div class="fila"><button class="ir grande" id="btn-gana">${t('gana.seguir')}</button></div>`, 'gana');
  bloquear(pn);
  for (;;) {
    const b = await Promise.race([clic(pn, '#btn-gana'), new Promise(res => { E.repintar = () => res(null); })]);
    if (b) break; pn = capa.poner(`${html()}<div class="fila"><button class="ir grande" id="btn-gana">${t('gana.seguir')}</button></div>`, 'gana');
  }
  visita('apertura'); await elegirApertura(p, 's', sug, () => ''); E.pctApertura = pct;
}

/**
 * Dónde queda libre el lienzo con el panel abierto: a la izquierda si el panel va al costado, arriba si va al pie. Devuelve el
 * centro de esa parte ({x, y} en fracción del lienzo) y la distancia del plano americano para que entre de las rodillas
 * para arriba (1,6 m de alto y 1 m de ancho) en esa parte.
 */
/**
 * El pesista a la parte del lienzo que dejan libre el panel y los carteles (encuadreLibre), con un movimiento suave. Lo usan
 * el llamado y los paneles de elegir kilos (apertura y fin del arranque).
 */
function encuadrarLibre(suave = .7) { if (!escena?.activo) return; escena.primerPlano('medio', encuadreLibre(), suave); E.forzar = true; }
function encuadreLibre() {
  const pn = $('capa').querySelector('.panel'), gl = $('gl'), c = { width: gl.clientWidth, height: gl.clientHeight }; if (!c.width || !c.height) return null;
  let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
  if (pn) {
    // con offsets y no con getBoundingClientRect: con el contenido girado (teléfono en vertical) las cajas salen rotadas
    const izq = pn.offsetLeft / c.width, arr = pn.offsetTop / c.height;
    if (izq > .28) x1 = izq; else if (arr > .25) y1 = arr;
  }
  // el tablero de la final (arriba a la izquierda): el pesista se encuadra debajo, no detrás
  const tb = $('tablero'); if (tb && !tb.hidden && tb.offsetHeight) { const b = (tb.offsetTop + tb.offsetHeight) / c.height + .015; if (b < .45 && tb.offsetLeft / c.width < (x0 + x1) / 2) y0 = Math.max(y0, b); }
  const fov = 22, tg = 2 * Math.tan(fov / 2 * Math.PI / 180), asp = c.width / c.height;
  if (document.documentElement.classList.contains('vert')) {
    // LIF-50, teléfono parado: el panel va abajo a lo ancho y la explicación de primera vez justo encima. Ahí el plano
    // americano quedaba cortado por las rodillas: va el pesista entero (de los pies a la cabeza, con aire) en lo que queda
    // libre entre el tablero y la explicación (o el panel). El sujeto del plano (entre el cuello y la cadera) va más arriba
    // del centro de esa parte, para que entren los pies.
    const ap = $('aprende'); if (ap && !ap.hidden && ap.dataset.donde === 'panel' && !ap.classList.contains('sin-lugar') && ap.offsetHeight) { const t = ap.offsetTop / c.height; if (t > .25) y1 = Math.min(y1, t - .01); }
    y0 = Math.max(y0, (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--techo-v')) || 0) / c.height);
    const h = escena.P?.h || 1.75, arriba = 1.12 * h, abajo = -.06 * h, sujeto = .66 * h, alto = arriba - abajo;
    return { x: .5, y: y0 + (y1 - y0) * (arriba - sujeto) / alto, dAbs: Math.max(alto / (tg * (y1 - y0)), .9 / (tg * asp)) };
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, dAbs: Math.max(1.6 / (tg * (y1 - y0)), 1 / (tg * asp * (x1 - x0))) };
}

/** Panel único del llamado propio: kilos (fichas y ajuste fino), envión, qué hace falta, frase del entrenador y Confirmar. */
function panelLlamado(p, L, t0, alConfirmar, corre = true) {
  const a = p.at[L.a], min = p.minimo(L.a), tv = p.techoVisible(L.a, L.lev, false), facil = p.cfg.ctl !== 'c', uno = esU(p.cfg.ctl), barra = p.cfg.ctl === 'b', envFijo = L.lev === 'c' ? p.estiloFijo(L.a) : null, envGuardado = guardado.get(`tarima.env.${p.cfg.ctl}.${a.id}`),
    // LIF-43: el estilo de envión queda fijo desde el primer dos tiempos; antes, el último que eligió o el que propone el entrenador (split)
    S = { kg: L.kg, env: envFijo || (['split', 'power', 'squat'].includes(envGuardado) ? envGuardado : null) || (uno ? cuerpoDe(a.id).casa : facil ? 'split' : a.f.enviones[0]), mas: false, elige: false, detalle: guardado.get('tarima.panel.detalle') === '1', dt: p.cfg.ctl === 'f' && L.lev === 'c' && !guardado.get('tarima.dostiempos'), seguro: false };
  // 'u': el panel trae puesto el peso del entrenador (entrenador.js: la chance de cada peso y La cuenta), no el plan fijo
  // si ya cambió los kilos en este intento (y quedó desplazado), el panel respeta su peso y no lo pisa el del entrenador
  const sug = uno && a.cambios === 0 ? sugerencia(p, L.a, L.lev, S.env) : null; if (sug !== null && sug >= min) S.kg = sug;
  // 'u': lo que el pesista llega a guardar con cada peso («llegas con», G2.4): mismo cálculo que el núcleo, día 0 y sin garra
  const cuerpoP = barra ? cuerpoBarra(a.id) : cuerpoDe(a.id), primeraB = barra && p.cfg.primera && L.n === 1;
  const fatiga = barra ? a.fatiga?.[L.lev] || 0 : 0;      // 'b': el cansancio de los intentos anteriores (rules.js, fatigaDe)
  const llegas = (kg, env) => previsto(p.intensidadDe(L.a, L.lev, kg), L.lev, env, cuerpoP, 3000 - fatiga);
  const discosHTML = pr => `<span class="pts${pr.fin < 0 ? ' no' : ''}">${puntos(Math.max(0, pr.fin))}</span>`;
  // 'u': de cada 10 intentos como este, cuántos suben (rules.js, chanceUno: el día, los toques y la garra que queda); honesta
  // por la meta F (tools/chance_test.mjs)
  // 'b': chanceBarra suma dónde suele pegar una persona típica en la barrita (rules.js, BARRA.tipico); honesta por chance_test
  const chance = (kg, env = S.env) => deDiez((barra ? chanceBarra : chanceUno)(p.intensidadDe(L.a, L.lev, kg), L.lev, L.lev === 'c' ? env : undefined, cuerpoP, { garra: a.garraUno[L.lev], primera: primeraB, fatiga, dif: p.cfg.dif }));
  // 'b': el verde que vas a tener con esos kilos, dibujado como la barrita (una por barrita) antes de confirmar
  const verdeHTML = kg => {
    if (!barra) return ''; const I = p.intensidadDe(L.a, L.lev, kg);
    const R = reglasB(p.cfg.dif), una = i => { const z = zonasBarra(I, cuerpoP, i, primeraB, S.env || 'split', R), n = z.vMs >= 150 ? 'ancho' : z.vMs >= 95 ? 'medio' : 'angosto'; return `<span class="mini-b" title="${esc(t('barra.nombre.' + L.lev + i) + ': ' + t('barra.ancho.' + n))}"><em>${esc(t('barra.nombre.' + L.lev + i))}</em><span class="mb-pista"><i class="mb-am" style="left:${(500 - z.a) / 10}%;width:${z.a / 5}%"></i><i class="mb-ve" style="left:${(500 - z.v) / 10}%;width:${z.v / 5}%"></i></span><b>${esc(t('barra.ancho.' + n))}</b></span>`; };
    return `<p class="verde-b"><span>${esc(t('llamado.b_verde'))}</span>${R.barritas[L.lev].map(una).join('')}${fatiga ? `<b class="cansancio" title="${esc(t('llamado.b_cansancio', { d: cuartos(fatiga) }))}">${esc(t('margen.cansancio', { d: cuartos(fatiga) }))}</b>` : ''}</p>`;
  };
  const conChance = (txt, kg) => `${txt.replace(/\.$/, '')} (${t('llamado.u_chance', { n: chance(kg) })}).`;
  const fichas = { seguro: Math.max(min, Math.floor(tv * .95 / 1000)), justo: Math.max(min, Math.floor(tv * .99 / 1000)), arriesgado: Math.max(min, Math.ceil(tv * 1.02 / 1000)) };
  const frase = kg => { const x = kg * 1000 / tv; return t(x <= .95 ? 'entrenador.facil' : x <= 1 ? 'entrenador.pelea' : 'entrenador.dificil'); };
  const C = p.cuenta(L.a), sinArranque = L.lev === 'c' && !a.mejor.s;
  const cuenta = L.lev === 'c' ? [C.oro ? t('cuenta.oro', { kg: C.oro }) : t(sinArranque ? 'cuenta.sin_arranque' : 'cuenta.oro_no'), C.plata ? t('cuenta.plata', { kg: C.plata }) : ''].filter(Boolean).join(' ') : (C.oro ? t('cuenta.liderar', { kg: C.oro }) : '');
  // una sola explicación nueva por pantalla, y una sola vez: el primer dos tiempos o, en el primer llamado, que la barra no baja
  // en 'b' y 'u' lo explica la línea de primera vez de los kilos (ui/aprende.js), encima del panel y no dentro del detalle plegado
  const explica = S.dt ? t('llamado.dt_primera') : facil && !uno && primeraVez('barra_no_baja') ? t('llamado.barra_no_baja') : '';
  const uPintar = (kilos, antes, fijo, T) => {
    const pr = llegas(S.kg, S.env), llega = pr.fin >= 0;
    // sin llegar con el día normal, todavía puede subir (el día o la garra): lo dice la chance, sin contradecirla
    // sin llegar sin suerte: la garra (si la tiene y alcanza), la suerte o nada; lo dice sin contradecir la chance
    // 'b': sin llegar, todo en verde sube igual (rules.js, BARRA.verdeSalva)
    const n10 = chance(S.kg), falta = llega ? t('llamado.u_llegas', { discos: discos(pr.fin) }) : t(barra ? 'llamado.b_falta' : pr.conGarra && a.garraUno[L.lev] ? 'llamado.u_con_garra' : n10 > 0 ? 'llamado.u_falta' : 'llamado.u_no_llegas', { discos: discos(-pr.fin) });
    // 'b': una sola línea con lo que hace falta para decidir (pedido del dueño: «tener el RM a mano»): la dificultad, el
    // porcentaje del RM del pesista en este levantamiento y la chance («Medio · 92 % de tu RM (163 kg) · 8 de 10»)
    const rm = a.f.techo[L.lev], dif = dificultadDe(n10);
    const linea = barra ? `<p class="rm-linea dif-${dif}" title="${esc(t('rm.nota'))}"><b class="dif">${esc(t('rm.dif.' + dif))}</b><span>${esc(t('rm.linea', { pct: Math.round(S.kg * 100 / rm), kg: rm }))}</span><b class="chance">${esc(t('llamado.u_chance', { n: n10 }))}</b></p>` : `<p class="discos${llega ? '' : ' no'}">${discosHTML(pr)} ${esc(falta)} · <b class="chance">${esc(t('llamado.u_chance', { n: n10 }))}</b>${barra ? '' : `<span class="justo"> · ${esc(t('llamado.u_justo', { tramo: tramoTxt(pr.mayor, L.lev) }))}</span>`}</p>`;
    // La cuenta con su apuesta: lo que hace falta para el oro (o la plata, o pasar al frente) y la chance de ese peso
    const cuentaU = L.lev === 'c' ? [C.oro ? conChance(t('cuenta.oro', { kg: C.oro }), C.oro) : t(sinArranque ? 'cuenta.sin_arranque' : 'cuenta.oro_no'), C.plata && C.plata !== C.oro ? conChance(t('cuenta.plata', { kg: C.plata }), C.plata) : ''].filter(Boolean).join(' ') : C.oro ? conChance(t('cuenta.liderar', { kg: C.oro }), C.oro) : '';
    // 'b': la garra la muestra la energía durante el intento (menos texto en el panel)
    const garra = barra ? '' : `<p class="chica garra">${t(a.garraUno[L.lev] ? 'llamado.u_garra_si' : 'llamado.u_garra_no')}</p>`;
    // después de una caída: la línea de por qué y lo que da el mismo peso (la barra no baja)
    const mismo = E.antes ? `<p class="chica antes">${esc(E.antes)} ${esc(t(llega ? 'llamado.u_mismo' : 'llamado.u_mismo_no', { kg: S.kg, discos: discos(Math.abs(pr.fin)) }))}</p>` : '';
    // LIF-31: a la vista solo lo esencial (kilos ±, levantar, la dificultad y «X de 10», y en el dos tiempos el estilo de envión
    // en un control compacto); el resto (el % del RM, el verde de cada barrita, el cansancio, cómo ganar, avisos) se despliega
    // con «Detalles». Lo esencial de 'b' es la dificultad y la chance; en 'u', la línea de lo que sobra o falta
    const esencial = barra ? `<b class="dif">${esc(t('rm.dif.' + dif))}</b><b class="chance">${esc(t('llamado.u_chance', { n: n10 }))}</b>` : linea;
    const rmPct = barra ? `<p class="rm-linea dif-${dif}" title="${esc(t('rm.nota'))}"><span>${esc(t('rm.linea', { pct: Math.round(S.kg * 100 / rm), kg: rm }))}</span></p>` : '';
    const detalle = `${rmPct}${verdeHTML(S.kg)}${mismo}${garra}${cuentaU ? `<p class="cuenta">${cuentaU}</p>` : ''}${explica ? `<p class="que">${explica}</p>` : ''}
      ${barra ? '' : `<p class="que reloj"><b>${t('llamado.u_sin_apuro')}</b></p>`}
      ${S.kg !== L.kg ? `<p class="chica${S.kg === sug ? ' sugiere' : ''}">${t(S.kg === sug ? 'llamado.u_sugiere' : 'llamado.cambio', { kg: L.kg })}</p>` : ''}${fijo ? `<p class="chica">${t('llamado.fijo')}</p>` : ''}
      ${L.lev === 'c' && !envFijo ? `<p class="chica">${esc(t('jerk.regla'))}</p>` : ''}<p class="chica">${t('llamado.pedido', { kg: L.kg, min, c: a.cambios })}</p>`;
    const teclas = T || !E.primeraFinal || L.n > 1 ? '' : `<p class="chica teclas">${t('llamado.u_teclas')}</p>`;
    return `${kilos}<div class="pn-esencial dif-${barra ? dif : 'u'}">${esencial}${estiloHTML(e => barra ? '' : ` ${discosHTML(llegas(S.kg, e))}`)}</div>${teclas}
      <div class="pn-detalle"${S.detalle ? '' : ' hidden'}>${detalle}</div>`;
  };
  // LIF-31 y LIF-43: el estilo de envión; desde el primer dos tiempos queda fijo, con candado. Desde el 17-nov (pedido del
  // dueño: «es poco intuitivo elegir el estilo de jerk y el nivel») los tres estilos van A LA VISTA como segmentos grandes
  // (el recomendado, split, primero y marcado; debajo de cada nombre, su dificultad), sin desplegable: tocar uno lo marca y
  // la chance «X de 10» cambia en el momento. Solo en el teléfono acostado (html.horiz.bajo), donde los tres no entran en el
  // alto del panel, sigue el control compacto («Estilo de envión: Split ▾») que se abre en una fila de tres.
  const estiloALaVista = () => !document.documentElement.matches('.horiz.bajo');
  const nomEstilo = e => `<b>${esc(ENVIONES[e])}</b><small class="pn-dif">${esc(t('jerk.dif.' + e))}</small>`;
  const estiloHTML = (extra = () => '') => {
    if (L.lev !== 'c') return '';
    const partes = e => `<span class="pn-et">${esc(t('jerk.titulo'))}</span> <b>${esc(ENVIONES[e])}</b><span class="pn-dif"> · ${esc(t('jerk.dif.' + e))}</span>`;
    if (envFijo) return `<span class="pn-estilo fijo" title="${esc(t('jerk.fijo_nota'))}">${CANDADO}${partes(envFijo)} <em>${esc(t('jerk.fijo'))}</em></span>`;
    if (S.elige || estiloALaVista()) return `<span class="pn-estilo abierto" role="group" aria-label="${esc(t('jerk.titulo'))}"><span class="pn-et">${esc(t('jerk.titulo'))}</span>${Object.keys(ENVIONES).map(e => `<button class="envion" data-env="${e}" aria-pressed="${e === S.env}">${nomEstilo(e)}${extra(e)}</button>`).join('')}<em class="pn-regla">${esc(t('jerk.regla'))}</em></span>`;
    return `<span class="pn-estilo"><button id="btn-estilo" aria-expanded="false" title="${esc(t('jerk.regla'))}">${partes(S.env)} <i aria-hidden="true">▾</i></button></span>`;
  };
  const pinta = () => {
    const ms = corre ? reloj.ahora() - t0 : 0, fijo = a.cambios >= 2 || ms > L.reloj - RELOJ.cambiosHasta, T = tactil();
    const bajo = S.kg <= min, menosTit = bajo && !fijo ? ` title="${esc(t('llamado.no_baja', { kg: min }))}"` : '';
    // 'u': «ESPACIO: levantar 92 kg» con el foco ya ahí; en la primera final, un peso con el que no llega pide confirmar dos veces
    // en la primera final, un peso que sube menos de 5 de cada 10 veces pide confirmar dos veces
    const noLlega = uno && chance(S.kg) < 5, txtConf = !uno ? t('llamado.confirmar') : S.seguro && noLlega ? t('llamado.u_seguro', { kg: S.kg, n: chance(S.kg) }) : t(T ? 'llamado.u_confirmar' : 'llamado.u_confirmar_tecla', { kg: S.kg });
    const kilos = kilosHTML(S.kg, min, KG_MAX, fijo, `<button class="ir" id="btn-confirmar">${esc(txtConf)}</button>`).replace('id="kg-menos"', `id="kg-menos"${menosTit}`);
    const atajos = `<div class="fila">${facil ? `<span>${t('ficha.titulo')}</span>` : ''}${Object.entries(fichas).map(([k, v]) => `<button class="ficha" data-kg="${v}" ${fijo ? 'disabled' : ''} aria-pressed="${v === S.kg}">${t('ficha.' + k)} ${v}</button>`).join('')}</div>`;
    const envion = L.lev === 'c' ? `<div class="fila"><span>${t('envion.titulo')}</span>${Object.keys(ENVIONES).map(e => `<button class="envion" data-env="${e}" aria-pressed="${e === S.env}"${envFijo && e !== envFijo ? ' disabled' : ''}>${ENVIONES[e]}${a.f.enviones.includes(e) ? '' : ' *'}</button>`).join('')}${envFijo ? `<span class="pn-estilo fijo" title="${esc(t('jerk.fijo_nota'))}">${CANDADO}<em>${esc(t('jerk.fijo'))}</em></span>` : ''}</div>` : '';
    const noDomina = L.lev === 'c' && !a.f.enviones.includes(S.env) ? ` · ${t('envion.no_domina')}` : '';
    const reloj0 = corre ? `<b>${t('llamado.corre')}</b>` : `<b>${t('llamado.sin_apuro', { tactil: T })}</b>`;
    const pedido = t('llamado.pedido', { kg: L.kg, min, c: a.cambios });
    // el motivo del fallo anterior queda escrito en el llamado siguiente (machacando se puede no haberlo leído)
    const antes = E.antes ? `<p class="chica antes">${esc(t('llamado.antes', { causa: E.antes }))}</p>` : '';
    // Un toque: a la vista quedan los kilos, qué dice el entrenador, qué hace falta y qué tecla va; el resto, en «Más opciones»
    const cuerpo = uno ? uPintar(kilos, antes, fijo, T) : facil
      ? `${kilos}${antes}<p class="frase">${frase(S.kg)} ${t('llamado.mas_dificil')}${T ? '' : ` <span class="chica">(${t('llamado.teclas')})</span>`}</p>${cuenta ? `<p class="cuenta">${cuenta}</p>` : ''}
        ${explica ? `<p class="que">${explica}</p>` : ''}<p class="que reloj">${reloj0}</p>
        ${S.kg !== L.kg ? `<p class="chica">${t('llamado.cambio', { kg: L.kg })}</p>` : ''}${fijo ? `<p class="chica">${t('llamado.fijo')}</p>` : ''}
        ${S.mas ? `${atajos}${envion}<p class="chica">${pedido}${noDomina}</p>` : ''}<div class="fila"><button id="btn-mas" aria-expanded="${!!S.mas}">${t(S.mas ? 'llamado.menos_opciones' : 'llamado.mas_opciones')}</button></div>`
      : `${kilos}${antes}${atajos}${envion}<p class="frase">${frase(S.kg)}</p><p class="cuenta">${cuenta}</p><p class="que">${reloj0}${T ? '' : ` <span class="chica">(${t('llamado.teclas')})</span>`}</p>
        <p class="chica">${pedido}${fijo ? ' ' + t('llamado.cerrados') : ''}${S.kg !== L.kg ? ` · <b>${t('llamado.cambio_pro')}</b>` : ''}${noDomina}</p>`;
    // 'u' y 'b': sin el selector de idioma (está en la pausa y en la bienvenida): un panel, una decisión
    // en el panel compacto el título va sin el nombre (el tablero ya dice quién levanta): entra en una línea con «Detalles»
    const titulo = `<h2>${esc(t(uno ? 'panel.titulo' : 'llamado.titulo', { quien: quien(a), lev: t('lev.' + L.lev), n: L.n }))}</h2>`;
    const cab = uno ? `<div class="pn-cab">${titulo}<button id="btn-detalle" class="pn-mas" aria-expanded="${S.detalle}">${esc(t(S.detalle ? 'panel.menos' : 'panel.mas'))} <i aria-hidden="true">${S.detalle ? '▴' : '▾'}</i></button></div>` : titulo;
    const pn = capa.poner(`${uno ? '' : idiomasHTML(true)}${cab}${cuerpo}`, `chico abajo lado llamado${uno ? ' compacto' : ''}`);      // al costado: no tapa al pesista
    const al = (b, fn) => { b.onclick = () => { if (activa(pn)) fn(); }; };
    pn.querySelectorAll('.kg').forEach(b => al(b, () => { S.kg = masKilos(S.kg, +b.dataset.d, min, KG_MAX); S.seguro = false; pinta(); }));
    pn.querySelectorAll('.ficha').forEach(b => al(b, () => { S.kg = +b.dataset.kg; pinta(); }));
    // al elegir un estilo, el foco vuelve a «levantar» (Espacio levanta)
    pn.querySelectorAll('.envion').forEach(b => al(b, () => { if (envFijo) return; S.env = b.dataset.env; S.elige = false; const q = pinta(); if (uno) q.querySelector('#btn-confirmar')?.focus({ preventScroll: true }); }));
    const est = pn.querySelector('#btn-estilo'); if (est) al(est, () => { S.elige = true; pinta().querySelector('.envion[aria-pressed=true]')?.focus({ preventScroll: true }); });
    const det = pn.querySelector('#btn-detalle'); if (det) al(det, () => { S.detalle = !S.detalle; guardado.set('tarima.panel.detalle', S.detalle ? '1' : '0'); pinta(); });
    const mas = pn.querySelector('#btn-mas'); if (mas) al(mas, () => { S.mas = !S.mas; pinta(); });
    al(pn.querySelector('#btn-confirmar'), () => {
      sonido.activar();
      if (uno && E.primeraFinal && !S.seguro && chance(S.kg) < 5) { S.seguro = true; bloquear(pinta(), true); return; }      // el segundo «¿Seguro?» también espera 400 ms
      if (L.lev === 'c' && !envFijo) guardado.set(`tarima.env.${p.cfg.ctl}.${a.id}`, S.env); E.repintar = null; alConfirmar(S);
    });
    E.repintar = () => pinta(); aprendeUI?.colocar();
    return pn;
  };
  bloquear(pinta());      // el foco queda en Confirmar: Enter o Espacio confirman; ← → cambian los kilos
  // LIF-52: una explicación de primera vez encima del panel (el estilo de envión, la dificultad, los kilos o el total)
  if (uno) { const n10 = chance(S.kg); aprender('llamado', { lev: L.lev, envFijo, barra, hechos: a[L.lev].length, titulos: { dificultad: `${t('rm.dif.' + dificultadDe(n10))} · ${t('llamado.u_chance', { n: n10 })}` } }); }
}

/**
 * Cómo tocó la persona en un intento de 'u' (para la analítica, G2.10): 'ausente' (ningún contacto), 'mantiene' (la tecla o
 * el dedo apoyado más de 1 s), 'machaca' (más de 5 contactos por segundo), 'de_mas' (más contactos que tramos) o 'uno_por_paso'.
 */
function patronEntrada(c, U) {
  const ent = c?.ent || [], bajas = ent.filter(e => e[1]).length; if (!bajas) return 'ausente';
  let largo = 0, abajo = null; for (const [t, v] of ent) { if (v && abajo === null) abajo = t; else if (!v && abajo !== null) { largo = Math.max(largo, t - abajo); abajo = null; } }
  if (abajo !== null || largo > 1000) return 'mantiene';
  const dur = Math.max(1, (ent[ent.length - 1][0] - ent[0][0]) / 1000); if (bajas / dur > 5 && bajas > 6) return 'machaca';
  const utiles = ['tira', 'salta', 'pisoton', 'arriba', 'garra', 'verde', 'amarillo', 'rojo'].reduce((n, k) => n + (U.contactos[k] || 0), 0);
  return bajas > utiles + 1 ? 'de_mas' : 'uno_por_paso';
}
/** Al cerrar un panel: ningún botón queda con el foco (Espacio es del levantamiento) y el escenario lo toma (G2.2). */
function soltarFoco() { document.activeElement?.blur?.(); $('escena')?.focus?.({ preventScroll: true }); }
/**
 * Llamado del jugador: panel, intento, luces y repetición. En Pro el reloj corre con el panel abierto (si llega a cero,
 * no vale). En Un toque el panel no gasta reloj: arranca al confirmar (el registro guarda `conf: 0`) y el jugador tiene el
 * minuto entero para tocar en ¡TIRA!, con cuenta regresiva en la señal en los últimos 10 s.
 */
async function llamadoPropio(p, L) {
  visita('llamado'); const a = p.at[L.a];
  if (!E.finalIniciada) { E.finalIniciada = true; ev('final_inicio', { n: E.finalN, fuente: E.pase?.fuente ?? null, pesista: TIPO[a.id], nivel: p.cfg.nivel, ritmo: E.cfg?.ritmo, ctl: p.cfg.ctl, dificultad: E.dificultad, orden: p.cfg.turnos }); }
  // del rival al jugador, fundido corto; si el jugador repite, sin fundido (su pesista ya está en la tarima)
  tablero(p, L); const repite = escena.id === a.id && E.turnoDe === E.yo; E.turnoDe = E.yo;
  await pasarA(a.id, () => { escena.setCarga(L.kg, L.lev); escena.posar(poseParado(escena.P, L.lev), L.lev); setLuces(null); zocalo(a, L); }, repite);
  etiqueta(L.et);
  const corre = p.cfg.ctl === 'c', uno = esU(p.cfg.ctl); let t0 = reloj.ahora(), ctx = null, env, kgFinal = L.kg, desplazado = false, corrida = null;
  E.rivalesSeguidos = 0; E.rivalesEnteros = 0;
  const elegido = new Promise(res => panelLlamado(p, L, t0, res, corre)); if (uno) relojLibre(); else setReloj(L.reloj);
  encuadrarLibre();      // plano americano del pesista en la parte que el panel deja libre, con un movimiento suave
  const vence = new Promise(res => { if (corre) enCuadro = ahora => { setReloj(L.reloj - (ahora - t0)); if (ahora - t0 >= L.reloj) { enCuadro = null; res(null); } }; });
  const S = await Promise.race([elegido, vence]); enCuadro = null; capa.quitar(); E.antes = null; soltarFoco();
  if (!corre) t0 = reloj.ahora();
  const ms = corre ? Math.min(L.reloj, Math.round(reloj.ahora() - t0)) : 0;
  if (S) {
    env = L.lev === 'c' ? S.env : undefined;
    if (S.kg !== L.kg && !p.cambioValido(ms, S.kg)) { desplazado = p.cambio(ms, S.kg).desplazado; if (!desplazado) kgFinal = S.kg; }
    if (desplazado) { visita('desplazado'); etiqueta(null); veredicto(t('desplazado.titulo', { quien: quien(a), kg: S.kg }), t(uno ? 'desplazado.texto_u' : 'desplazado.texto')); $('veredicto').classList.add('der'); /* el pesista quedó a la izquierda (el panel estaba a la derecha): el aviso va del lado del panel */ await saltable(1800); veredicto(''); return; }
    escena.setCarga(kgFinal, L.lev); zocalo(a, { ...L, kg: kgFinal }); etiqueta(p.llamado.et);
    ctx = p.contexto(env); asegurarCalidad(); visita('intento');
    // el primer dos tiempos en Un toque se explica sobre la marcha: con la barra en los hombros el reloj espera el toque de ¡FLEXIONA!
    const primerDT = ctx.ctl === 'f' && L.lev === 'c' && !guardado.get('tarima.dostiempos');
    E.todavias = 0; E.guardados = 0; E.fotoToques = toques.foto();
    // primera persona: antes de que aparezca la barrita, el pesista va a la barra y la mira (el vistazo); el reloj del intento empieza después
    const yaAbajo = !corre && !primerDT && await vistazo(L.lev); if (yaAbajo) t0 = reloj.ahora();
    corrida = await correrIntento(ctx, { a, lev: L.lev, env, conf0: ms, t0, guia: primerDT ? EN_HOMBROS : null, yaAbajo });
    if (primerDT && corrida.m.movs.length > 1) guardado.set('tarima.dostiempos', '1');
  } else { env = L.lev === 'c' ? p.estiloFijo(L.a) ?? a.f.enviones[0] : undefined; ctx = p.contexto(env); corrida = { conf: null, ent: [], res: simular(ctx, null, []).res, grab: [], m: { movs: [] } }; }
  TB.congelado = true; const et = p.llamado.et, x = p.resolver({ conf: corrida.conf, env, ent: corrida.ent });
  if (JSON.stringify(x.res) !== JSON.stringify(corrida.res)) E.errores.push('el resultado mostrado no coincide con el recalculado');
  const pal = k => (uno ? null : (x.res.gestos || []).filter(g => g.pal === k).length), U = x.res.uno;
  // en 'u' los campos de los círculos quedan en null (los paneles de PostHog no se rompen) y se suma el margen
  ev('intento_propio', { final_n: E.finalN, lev: L.lev, intento: L.n, kg: kgFinal, resultado: x.res.res === 'valido' ? 'vale' : x.res.res === 'nulo' ? 'no_vale' : 'cayo', causa: x.res.causa || null, perfecto: pal('perfecto'), bien: pal('bien'), temprano: pal('temprano'), tarde: pal('tarde'), todavia_no: uno ? null : E.todavias || 0, guardados: uno ? null : E.guardados || 0, tactil: tactil(), ctl: ctx.ctl, dificultad: E.dificultad,
    ...(U ? { margen_ini: U.margen_ini, dia: U.dia, gasto_tiron: U.gastos.tiron ?? null, gasto_arriba: U.gastos.arriba ?? null, gasto_pararse: U.gastos.pararse ?? null, margen_fin: U.margen_fin, garra: U.garra, tramo_caida: U.tramo_caida, tramo_mayor: U.tramo_mayor, intensidad: Math.round(ctx.I / 10) / 10, patron_entrada: patronEntrada(corrida, U),
      ...(U.barras ? { fatiga: U.fatiga ?? 0, esfuerzo: U.esfuerzo ? (U.esfuerzo.ok ? 'hecho' : 'no') : null, barra_1: U.barras[0]?.zona ?? null, barra_2: U.barras[1]?.zona ?? null, barra_3: U.barras[2]?.zona ?? null, barra_sola: U.barras.some(b => b.sola), barra_pos_1: U.barras[0]?.pos ?? null, barra_pos_2: U.barras[1]?.pos ?? null } : {}) } : {}),
    ...(E.fotoToques ? toques.desde(E.fotoToques) : {}) });
  E.fotoToques = null;
  // los cambios de kilos de los rivales los muestra el tablero desde el veredicto («antes 163»), sin cartel aparte
  // 'u': sin repetición propia (la línea ya dice dónde cayó y por qué; no hay un momento que mirar en cámara lenta)
  const fin = armarFinal(corrida, L.lev), rep = !uno && !!tramoRepeticion(corrida);
  const primerCierre = uno && x.res.res === 'valido' && primeraVez(ctx.ctl === 'b' ? 'b_cierre' : 'u_cierre') ? t(ctx.ctl === 'b' ? 'barra.primer_cierre' : 'uno.primer_cierre') : '';
  const linea = await decision(a, L.lev, x.res, et, true, { ctl: ctx.ctl, sinConfirmar: corrida.conf === null, tRes: corrida.tRes, fin, rep, lev: L.lev, quien: quien(a), kg: kgFinal, pct: Math.round(ctx.I / 100), sub: primerCierre, mantener: true, alVer: () => alVeredicto(p, L, x.avisos) });
  E.antes = x.res.res !== 'valido' && linea ? linea : null;
  if (!uno) await repeticion(L.lev, corrida, linea);
  margenUI.ocultar(); etiqueta(null); zocalo(null);
}

/** Quién va primero ahora (índice), o null si nadie tiene marca todavía en lo que se compite (arranque o total). */
function lider(p) { const f = p.tabla()[0]; return f && f.puesto === 1 ? f.a : null; }
/**
 * Turno de un rival (o null al terminar): sin botón de levantar ni señal (html.turno-rival). Quién levanta, con cuánto, cómo
 * se la juega y su personalidad lo dice la fila «Ahora» del tablero: ya no hay cartel aparte (una indicación por momento).
 */
function turno(a) { document.documentElement.classList.toggle('turno-rival', !!a); }
/**
 * Turno de un rival (pedido del dueño del 13-nov: «quiero ver el levantamiento completo de mi rival, aunque lo pueda saltar,
 * y no con Espacio, con un botón»). Siempre ENTERO (RITMO.rival): fundido desde el pesista anterior, la cámara general sin
 * cortes, desde poco antes de que agarre la barra, las fases de espera más rápidas, su veredicto y, si cae un decisivo, una
 * repetición corta. El botón «Saltar» (o la tecla S) lleva el intento al final y el veredicto dura lo justo; Espacio y los
 * toques en la escena no saltean nada. El tablero queda quieto hasta su veredicto (el resultado ya está calculado).
 */
async function llamadoRival(p, L, cfg) {
  void cfg; const a = p.at[L.a], decisivo = esDecisivo(L.et);
  E.rivalesSeguidos = (E.rivalesSeguidos || 0) + 1; E.turnoDe = L.a;
  tablero(p, L); TB.congelado = true; const yoPrimero = lider(p) === E.yo;
  const x = p.resolverIA();
  visita('rival');
  // con la imagen tapada, el rival ya queda en la pose con la que empieza a verse (sin salto al arrancar su intento)
  await pasarA(a.id, () => {
    setLuces(null); setReloj(L.reloj); escena.setCarga(L.kg, L.lev);
    const todo = simular(x.ctx, x.conf, x.ent), tv0 = desdeRival(todo, x.conf), m0 = simular(x.ctx, x.conf, x.ent, tv0), pose = m0.res && m0.res.res === 'fallo' ? null : poseDe(m0, tv0, escena.P);
    escena.posar(pose || poseParado(escena.P, L.lev), L.lev); escena.camara(camVista(false)); zocalo(a, L);
  });
  turno(a); etiqueta(etiquetasRival(L.et, yoPrimero)); botonSaltar(true);
  aprender('rival', { lev: L.lev, cambiar: !!opPedido() });
  let via = '', momento = ''; const ts = reloj.ahora();
  // saltar en el levantamiento: fundido corto y el intento al final
  E.saltarRival = v => { if (via || !E.intento || E.intento.propio) return; via = v || 'boton'; momento = 'intento'; fundido(async () => { E.intento?.alFinal(); await espera(40); }); };
  boton.oye = oyeTurnoRival;
  try {
    const r = await correrIntento(x.ctx, { a, lev: L.lev, env: x.env, gestos: { conf: x.conf, ent: x.ent }, decisivo });
    E.saltarRival = null;
    const o = { fin: armarFinal(r, L.lev), resumen: !!via, max: RITMO.rival.veredicto, rival: true, fija: !decisivo, mantener: true, alVer: () => alVeredicto(p, L, x.avisos || []) };
    await decision(a, L.lev, r.res, L.et, false, o);
    if (!via && o.salto) { via = o.salto; momento = 'veredicto'; }
    if (!via && decisivo && r.res.res !== 'valido') { const v = await repeticion(L.lev, r, '', { rival: true, titulo: t('rival.repeticion', { rival: quien(a) }) }); if (v) { via = v; momento = 'repeticion'; } }
  } finally { if (boton.oye === oyeTurnoRival) boton.oye = null; E.saltarRival = null; TB.congelado = false; }
  if (via) ev('rival_salteado', { modo: 'entero', via, momento, ms: Math.round(reloj.ahora() - ts), decisivo });
  botonSaltar(false); turno(null); etiqueta(null); zocalo(null);
}

/**
 * Cambio de carga entre intentos: la manga de la barra de cerca, con los discos que salen y entran deslizando, el collarín
 * y el golpe metálico de cada uno, y los kilos que cambian a medida que llegan. La tarima queda vacía (los ayudantes que
 * cargan necesitan modelo y animación propios: etapa de arte). Se saltea con Espacio.
 */
async function carga(kg, lev) {
  if (!escena.P || kg === escena.kg) return; limpiarVeredicto(); visita('carga'); E.modo = 'tv';
  if (escena.activo) { escena.posar(poseParado(escena.P, lev), lev); await escena.mostrar(null); }
  const z = escena.barZ ?? 0, apoya = () => escena.barraSuelta({ y: escena.pisoBarra, z, ang: 0 }); apoya();
  const kg0 = escena.kg, A = escena.cambioDeCarga(kg);
  if (!A) { escena.setCarga(kg, lev); return; }
  escena.primerPlano('manga'); let ult = null; const vistas = { s: 0, l: 0 };
  const pinta = k => { if (k !== ult) { ult = k; veredicto(t('carga.cambio', { kg: k }), t('carga.antes', { de: kg0 })); } };
  pinta(kg0); const t0 = reloj.ahora();
  enCuadro = ahora => {
    const x = A.en((ahora - t0) / 1000); apoya(); pinta(x.kg);
    if (x.salidas > vistas.s) { vistas.s = x.salidas; sonido.roce(); }
    if (x.llegadas > vistas.l) { vistas.l = x.llegadas; sonido.metal(x.llegadas === A.entra ? 1.3 : 1); }
  };
  await saltable(A.dur * 1000 + 350, 300); enCuadro = null; A.en(99); escena.setCarga(kg, lev); apoya(); veredicto('');
}

/**
 * Al terminar el arranque, antes del intervalo: el gancho decide si se juega el dos tiempos (con la regla del arranque
 * gratis, ahí sube el muro). false: la final termina acá (ya se vio la tabla del arranque).
 */
async function trasArranque(p) {
  E.modo = 'panel'; E.forzar = true; let r = 'sigue';
  try { r = await ganchos.intervalo?.({ n: E.finalN, nombre: nombreJugador(), capa: $('capa'), t, visita, tabla: () => tableroHTML(p, { yo: E.yo, nombre: nombreJugador() }) }) ?? 'sigue'; } catch (e) { console.warn('ganchos.intervalo:', e); }
  capa.quitar(); return r !== 'corta';
}
/** La final cortada en el intervalo: cuenta como jugada (la próxima no es la primera) y no hay podio. */
function cortarFinal(p) {
  void p; tablero(null); zocalo(null); etiqueta(null); turno(null);
  guardado.set('tarima.jugadas', String((+guardado.get('tarima.jugadas') || 0) + 1));
}

async function intervalo(p) {
  visita('intervalo'); const f = p.at[E.yo].f, sug = Math.round(f.techo.c * (E.pctApertura || .935));
  const html = () => { const yo = p.tabla().find(x => x.a === E.yo), n = yo && yo.puesto; return `<h1>${t('intervalo.titulo')}</h1>${tableroHTML(p, { yo: E.yo, nombre: nombreJugador() })}<p>${n ? t('intervalo.texto', { n, pos: t('pos.' + n) }) : t('intervalo.sin_puesto')}</p>`; };
  await elegirApertura(p, 'c', sug, html); p.empezar();
}

/** Texto para compartir (sección 4.5, `compartir.texto`): medalla, total y un ✅ o ❌ por intento. Sin nombre ni datos. */
async function compartir(p, medalla, total, pn) {
  const marcas = lev => p.at[E.yo][lev].map(x => (x.res === 'valido' ? '✅' : '❌')).join('') || '—';
  const codigo = [...crypto.getRandomValues(new Uint8Array(6))].map(x => (x % 36).toString(36)).join('');
  const link = `${location.origin}${location.pathname}?c=${codigo}`;
  const txt = t('compartir.texto', { medalla: t('medalla.' + medalla), total: total || 0, marcas_s: marcas('s'), marcas_c: marcas('c'), link });
  const nota = pn.querySelector('#compartido'), decir = k => { if (nota) { nota.hidden = false; nota.textContent = t(k); } };
  let via = 'copiar';
  try {
    if (navigator.share && tactil()) { via = 'nativo'; await navigator.share({ text: txt }); }
    else { await navigator.clipboard.writeText(txt); decir('compartir.copiado'); }
  } catch (e) { if (e?.name !== 'AbortError') decir('compartir.error'); }
  ev('compartir', { via, medalla, pantalla: E.pantalla });
}

/**
 * P8 · Podio: durante 2,5 s solo el resultado («¡Oro para {nombre}!»), después los botones («Jugar otra vez», «Cambiar de
 * pesista», «Compartir resultado») y el lugar para la invitación (ganchos.podio). Si el gancho dice 'muro' (P8b), sube el
 * muro en lugar de esperar los botones. Devuelve 'revancha', 'cambiar' o 'inicio'.
 */
async function cierre(p) {
  visita('clasificacion'); const tab = p.tabla(), yo = tab.find(f => f.a === E.yo), R = EVENTO.records, MED = ['oro', 'plata', 'bronce'];
  const mejor = lev => p.at.slice().sort((x, y) => y.mejor[lev] - x.mejor[lev] || x.seqMejor[lev] - y.seqMejor[lev])[0];
  const puesto = yo.total ? yo.puesto : null, medalla = puesto ? MED[puesto - 1] : 'ninguna';
  const gano = yo.total && yo.puesto;
  if (gano) guardado.set('tarima.nivel', guardado.get('tarima.nivel') === 'amistoso' ? 'normal' : guardado.get('tarima.nivel'));
  guardado.set('tarima.jugadas', String((+guardado.get('tarima.jugadas') || 0) + 1));
  ev('final_fin', { n: E.finalN, puesto, total: yo.total || 0, duracion_s: Math.round((performance.now() - (E.tFinal0 || performance.now())) / 1000) });
  // plano del ganador detrás del podio 2D
  const oro = tab[0]?.total ? p.at[tab[0].a] : null; if (oro) await fundido(async () => { await escena.mostrar(oro.id); escena.posar(poseParado(escena.P, 'c'), 'c'); if (ident(oro).cara) escena.primerPlano('torso'); else escena.camara('3/4'); });
  visita('ceremonia');
  const arriba = () => {
    const nombre = esc(nombreJugador());
    const bloque = k => { const f = tab[k]; return f && f.total ? `<div class="p${k + 1}"><i style="background:${ident(p.at[f.a]).bandera}"></i><b>${esc(corto(p.at[f.a]))}</b>${f.total} kg<br>${t('medalla.' + MED[k])}</div>` : `<div class="p${k + 1} vacio"><b>—</b>${t('podio.vacio')}</div>`; };
    const rec = []; for (const a of p.at) { const q = esc(quien(a)); if (a.mejor.s > R.s) rec.push(t('podio.record', { quien: q, lev: t('lev.s').toLowerCase(), kg: a.mejor.s })); if (a.mejor.c > R.c) rec.push(t('podio.record', { quien: q, lev: t('lev.c').toLowerCase(), kg: a.mejor.c })); if (a.mejor.s && a.mejor.c && a.mejor.s + a.mejor.c > R.t) rec.push(t('podio.record', { quien: q, lev: t('lev.t'), kg: a.mejor.s + a.mejor.c })); }
    const ms = mejor('s'), mc = mejor('c');
    return `${idiomasHTML(true)}<h1>${t(puesto === 1 ? 'podio.oro' : puesto === 2 ? 'podio.plata' : puesto === 3 ? 'podio.bronce' : 'podio.sin_total', { nombre })}</h1><div class="podio">${bloque(1)}${bloque(0)}${bloque(2)}</div>${tableroHTML(p, { yo: E.yo, nombre: nombreJugador() })}
      <p>${t('podio.mejores', { a: ms.mejor.s ? `<b>${esc(quien(ms))} (${ms.mejor.s})</b>` : '—', c: mc.mejor.c ? `<b>${esc(quien(mc))} (${mc.mejor.c})</b>` : '—' })}</p>${rec.length ? `<p class="cuenta">${rec.join(' · ')}</p>` : ''}`;
  };
  capa.poner(arriba(), 'podio-panel'); sonido.ovacion(!!gano);
  await saltable(2500, 900);      // durante 2,5 s, solo el resultado (un toque los adelanta)
  let quedan = null; try { quedan = ganchos.quedan?.() ?? null; } catch { /* sin dato */ }
  const otra = quedan === 1 ? t('podio.otra_quedan') : Number.isFinite(quedan) && quedan > 1 ? t('podio.otra_quedan_n', { n: quedan }) : t('podio.otra');
  const botones = () => `<div class="fila"><button class="ir grande" id="btn-revancha" data-completa>${otra}</button><button id="btn-cambiar">${t('podio.cambiar')}</button><button id="btn-compartir">${t('podio.compartir')}</button></div><p class="chica" id="compartido" hidden></p><div id="podio-extra"></div>`;
  let pn = capa.poner(arriba() + botones(), 'podio-panel');
  let extra = null; try { extra = await ganchos.podio({ n: E.finalN, puesto, total: yo.total || 0, medalla, lugar: pn.querySelector('#podio-extra'), nombre: nombreJugador(), t }); } catch (e) { console.warn('ganchos.podio:', e); }
  // el cartel al terminar la final gratis (LIF-53). Desbloquee o no, después va al inicio, que ya ofrece elegir o cambiar
  // de pesista (las tarjetas aparecen después de la primera final)
  if (extra === 'muro') { visita('muro'); await mostrarMuro('podio'); return 'inicio'; }
  bloquear(pn); visita('fin');
  for (;;) {
    const b = await Promise.race([clic(pn, '#btn-revancha,#btn-cambiar,#btn-compartir'), new Promise(res => { E.repintar = () => res(null); })]);
    if (!b) { pn = capa.poner(arriba() + botones(), 'podio-panel'); continue; }
    if (b.id === 'btn-compartir') { compartir(p, medalla, yo.total, pn); continue; }
    capa.quitar(); return b.id === 'btn-revancha' ? 'revancha' : 'cambiar';
  }
}

/** P9 · el muro, por el gancho. true: puede jugar otra final (se vuelve a pedir el pase). */
async function mostrarMuro(origen, r = {}) {
  E.forzar = true; let sigue = false;
  try { sigue = !!await ganchos.muro({ origen, motivo: r.motivo, nombre: nombreJugador(), capa: $('capa'), t }); } catch (e) { console.warn('ganchos.muro:', e); }
  capa.quitar(); return sigue;
}

/** P4 · pedido del pase (ganchos.pedirPase). Si dice muro, P9; si después de él no puede jugar, null (vuelve a la bienvenida). */
async function pedirPase(cfg, n, origen) {
  for (;;) {
    let r = null; try { r = await ganchos.pedirPase({ n, pesista: TIPO[cfg.id], ctl: cfg.ctl, nivel: cfg.nivel, ritmo: cfg.ritmo, capa: $('capa') }); } catch (e) { console.warn('ganchos.pedirPase:', e); r = { estado: 'ok', fuente: 'sin_servidor' }; }
    r = r || { estado: 'ok', fuente: 'local' };
    ev('partida_pedida', { resultado: r.estado === 'muro' ? 'muro' : r.estado === 'cancelado' ? 'error' : r.fuente === 'sin_servidor' ? 'sin_servidor' : 'ok', fuente: r.fuente ?? null, motivo: r.motivo ?? r.error ?? null });
    if (r.estado === 'cancelado') return null;      // no hubo conexión y eligió volver al inicio
    if (r.estado !== 'muro') return r;
    visita('muro'); if (!await mostrarMuro(origen, r)) return null;
  }
}

// ---------- la partida ----------
/** Una final entera, de la carga a la ceremonia. Devuelve 'revancha', 'cambiar' o 'inicio'. */
async function partida(cfg) {
  E.cfg = cfg; E.yo = IDS.indexOf(cfg.id); escena.yo = cfg.id; E.registro = null;
  document.documentElement.classList.toggle('juego-u', esU(cfg.ctl));      // menos carteles mientras se juega (juego.css, al final)
  const semilla = params.has('semilla') && !E.jugadas ? (+params.get('semilla') >>> 0) : (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);
  E.jugadas = (E.jugadas || 0) + 1;
  // en 'u' no hay ventanas: la corrección de atraso no se usa
  let errMedio = null; cfg.cal = cfg.cal ?? (tactil() && !esU(cfg.ctl) ? CAL_TACTIL : 0);
  // Los dos modelos se terminan de cargar antes de jugar (venían bajando desde el inicio): leer un GLB, compilar sus shaders o
  // subir sus texturas en medio de un levantamiento es un tirón. Todo eso lo hace escena.precalentar() (arrancó en el inicio,
  // detrás del panel) y recién después se calibra la calidad.
  cargaUI.mostrar('carga.modelos'); await cargarModelos();
  await escena.mostrar(cfg.id); escena.posar(poseParado(escena.P, 's'), 's'); escena.camara(camVista(false));
  if (DIBUJA) {
    if (E.reprecal) { E.reprecal = false; E.precal = escena.precalentar().catch(e => { console.warn('precalentar:', e); }); }      // los modelos llegaron recién con el reintento
    E.sinDibujo = true; await E.precal; E.sinDibujo = false; await telefono.horizontal(); const c0 = performance.now(), primera = !E.cargaLista; E.cargaLista = true; await calibrar(); if (primera) ev('carga_lista', { ms: Math.round(performance.now()), calibracion_ms: Math.round(performance.now() - c0), calidad: C.nombre });
    await revisarShaders();
  }
  cargaUI.ocultar(); E.forzar = true; E.verPesista = true;
  if (cfg.calentar && !esU(cfg.ctl)) { if (cfg.ctl === 'f') { await tarjeta(); errMedio = await tutorial(cfg); } else { cfg.cal = await metronomo(); errMedio = await practica(cfg); } }
  // P4: el pase se pide después de la práctica, que no gasta nada
  const n = (+guardado.get('tarima.jugadas') || 0) + 1, pase = await pedirPase(cfg, n, 'bienvenida');
  if (!pase) return 'inicio';
  E.turnoDe = null; E.pedidoPend = null; PD.abierto = false; E.pase = pase; E.finalN = pase.n ?? n; E.finalIniciada = false; E.tFinal0 = performance.now(); E.antes = null; E.primeraFinal = n === 1; E.rivalesSeguidos = 0; E.casi = null;
  const p = E.p = new Partida(datos, { semilla, ia: HUELLA_IA, envFijo: true, turnos: cfg.orden === 'oficial' ? 'oficial' : 'rondas', nivel: cfg.nivel, cal: cfg.cal, primera: cfg.primera, ctl: cfg.ctl, ...(cfg.ctl === 'b' && cfg.dif !== 'facil' ? { dif: cfg.dif } : {}), tactil: (cfg.ctl === 'f' || esU(cfg.ctl)) && tactil(), atletas: IDS.map((id, i) => ({ id, ctrl: i === E.yo ? 'persona' : 'juego' })) });
  await presentacion(p, cfg, errMedio, n === 1); p.empezar();
  while (p.fase !== 'fin') {
    if (p.fase === 'intervalo') {
      limpiarVeredicto(); tablero(p);      // en el intervalo el tablero se esconde: la tabla completa está en el panel
      if (!await trasArranque(p)) { cortarFinal(p); return 'inicio'; }      // sin correo: la final termina con el arranque
      await intervalo(p); continue;
    }
    // un pedido hecho con «Cambiar» cuando en la partida ya le tocaba a la persona: entra como cambio de su llamado (si la
    // desplaza, sale otro y el tablero lo muestra)
    if (E.pedidoPend != null) { const kg = E.pedidoPend; E.pedidoPend = null; if (p.at[p.llamado.a].ctrl === 'persona' && !p.cambioValido(0, kg) && p.cambio(0, kg).desplazado) continue; }
    const L = { ...p.llamado }, a = p.at[L.a];
    // en 'u' la carga de la barra no es una espera aparte: el panel ya muestra el peso final (G2.7)
    if (a.ctrl === 'persona') { if (!esU(cfg.ctl)) await carga(L.kg, L.lev); await llamadoPropio(p, L); } else await llamadoRival(p, L, cfg);
  }
  limpiarVeredicto(); tablero(null); E.registro = JSON.parse(JSON.stringify(p.reg));
  const rc = recalcular(E.registro, datos); if (!rc.ok || resumen(rc.tabla) !== resumen(p.tabla())) E.errores.push('el registro no recalcula a la misma tabla: ' + (rc.error || ''));
  return cierre(p);
}

/** Un error que detiene el juego: queda en E.errores, sale en pantalla y va a las métricas como clave corta. */
function fallar(e, tipo = 'excepcion') {
  E.errores.push(String(e?.stack || e)); console.error(e); ev('error_juego', { tipo, pantalla: E.pantalla, ...detalleError(e) });
  cargaUI.error(tipo === 'inicio' ? 'carga.no_inicia' : 'carga.error');
}

// ---------- LIF-33: lo que no bajó y el 3D que no arranca ----------
/** Espera de verdad (la carga corre con el reloj real, no con el del juego). */
const dormir = ms => new Promise(r => setTimeout(r, ms));
/** `fn` hasta 3 veces, con 1 s y 2,5 s de espera entre una y otra. Tira el último error. */
async function reintentar(fn, esperas = [1000, 2500]) {
  for (let k = 0; ; k++) { try { return await fn(k); } catch (e) { if (k >= esperas.length) throw e; console.warn(`reintento ${k + 1}:`, e?.message || e); await dormir(esperas[k]); } }
}
/** `carga_fallida` (una vez por etapa y carga): 'datos', 'modelo', 'webgl', 'shader' (y 'modulo', desde arranque.js). */
const FALLAS = new Set();
function cargaFallida(etapa, e, extra = {}) {
  if (FALLAS.has(etapa)) return; FALLAS.add(etapa);
  const d = detalleError(e); ev('carga_fallida', { etapa, mensaje: d.mensaje, archivo: d.archivo, app: appNavegador(navigator.userAgent), pantalla: E.pantalla, ...extra });
}
/** El aviso sobre la pantalla de carga: nada de la interfaz queda a la vista sin el pesista. Resuelve con «Probar de nuevo». */
async function avisoFalla(tipo) {
  visita('falla'); capa.quitar(); $('sobre').hidden = true; boton && (boton.activo = false);
  await cargaUI.aviso(tipo, { app: appNavegador(navigator.userAgent) });
  if (boton) boton.activo = true;
}
/** El 3D no arranca: el aviso, y «Probar de nuevo» recarga la página (no hay forma de rehacer el contexto ahí mismo). */
async function falloGrafico(etapa, e, extra = {}) {
  cargaFallida(etapa, e, extra); E.errores.length || console.warn(`3D (${etapa}):`, e?.message || e);
  await avisoFalla('webgl'); location.reload(); return new Promise(() => {});
}
/** Los modelos de los pesistas, con reintentos; si no bajan, el aviso y, con «Probar de nuevo», otra vez. */
async function cargarModelos() {
  for (;;) {
    try { await reintentar(() => Promise.all(IDS.map(id => escena.cargar(id)))); return; }
    catch (e) { cargaFallida('modelo', e, { intentos: 3 }); E.reprecal = true; await avisoFalla('descarga'); cargaUI.mostrar('carga.modelos'); }
  }
}
/** data/plantel.json (fichas de los modelos del plantel), una sola vez; si falla, el próximo pedido lo intenta de nuevo. */
let plantelP = null;
const plantelJSON = () => (plantelP ||= reintentar(() => fetch('data/plantel.json').then(r => { if (!r.ok) throw new Error('data/plantel.json: ' + r.status); return r.json(); })).catch(e => { plantelP = null; throw e; }));
/** Un JSON de data/, con reintentos y el aviso si no llega. */
async function bajarDatos(urls) {
  for (;;) {
    try { return await reintentar(() => Promise.all(urls.map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); })))); }
    catch (e) { cargaFallida('datos', e, { intentos: 3 }); await avisoFalla('descarga'); cargaUI.mostrar(); }
  }
}
/**
 * Un programa del 3D que no compila (three avisa por renderer.debug.onShaderError): se prueba una vez con la calidad
 * Móvil (sin post ni sombras caras); si igual falla, el aviso del 3D (sin el pesista no se juega).
 */
async function revisarShaders() {
  if (!E.shaderMal) return;
  const primero = E.shaderMal; E.shaderMal = null;
  if (C.clave !== 'movil') {
    try { escena.soltarProgramas(); await ponerCalidad('movil'); nombrar(); escena.cuadro(0, true); } catch (e) { E.shaderMal = E.shaderMal || String(e?.message || e); }
    if (!E.shaderMal) { cargaFallida('shader', { message: primero }, { recuperada: true, calidad: C.nombre }); return; }
  }
  await falloGrafico('shader', { message: E.shaderMal || primero });
}
/** Contexto 3D perdido que no vuelve en 6 s con la página a la vista: el aviso del 3D. */
function vigilarContexto(canvas) {
  let perdido = 0, visto = 0, reloj = null;
  canvas.addEventListener('webglcontextlost', () => {
    perdido = performance.now(); visto = 0; clearInterval(reloj);
    reloj = setInterval(() => { if (!perdido) { clearInterval(reloj); return; } if (document.visibilityState === 'visible' && (visto += 1000) >= 6000) { clearInterval(reloj); falloGrafico('webgl', { message: 'contexto perdido' }, { perdido: true }); } }, 1000);
  });
  canvas.addEventListener('webglcontextrestored', () => { perdido = 0; clearInterval(reloj); E.forzar = true; });
}

async function iniciar() {
  const refresco = medirRefresco();
  pintarFijos(); telefono.instalar({ t }); telefono.avisoInstalar();      // en el iPhone, una vez: cómo jugar a pantalla completa
  cargaUI.titulo('carga.msg');
  alCambiarIdioma(() => { pintarFijos(); senalUI?.repintar(); barritaUI?.repintar(); if (E.sobre) pintarSobre(E.sobre.tipo); E.repintar?.(); if (TB.p && !TB.congelado) tablero(TB.p); else { PD.html = ''; pintarPedido(); } if ($('saltar-rival') && !$('saltar-rival').hidden) botonSaltar(true); });
  addEventListener('resize', () => { if (TB.p && !TB.congelado) tablero(TB.p); });      // teléfono acostado: el tablero compacto
  telefono.alGirar(orientacion); orientacion();
  // P0: el estado del servidor (y la medición) en paralelo con los datos; el muro al cargar si corresponde
  const origen = params.get('lang') ? 'url' : guardado.get('tarima.idioma') ? 'guardado' : 'defecto';
  const arranque = conexion.arranque({ idioma: idiomaActual(), idioma_origen: origen, version: VERSION_JUEGO, pantalla: () => E.pantalla });
  const [poses, sim] = await bajarDatos(['data/poses.json', 'data/sim.json']);
  datos = leerDatos(sim);
  // Vestuario: qué modelo del plantel dibuja a cada pesista del juego (el jugador y los rivales). Sin parámetro, la terna por
  // defecto (PLANTEL_DEFECTO: ilarraz, kordan, jastrev). `?plantel=livianos` (una terna de data/plantel.json) o
  // `?plantel=solanet,kordan,jastrev` elige otra; `?plantel=clasico` deja a Ventura, Brenner y Marangi con sus modelos de siempre
  // (y no baja plantel.json). Si plantel.json no llega o a la terna le falta un modelo, esa plaza queda con el modelo clásico.
  { const q = params.get('plantel') || PLANTEL_DEFECTO;
    if (q !== 'clasico') { try { const pl = await plantelJSON(); const v = vestir(ternaDe(q, pl), pl.pesistas, poses); console.info('plantel:', v.map(id => `${id} → ${PLANTEL[id].modelo}`).join(', ') || 'sin cambios'); } catch (e) { console.warn('plantel:', e); } } }
  // Aspecto elegido por el jugador para su plaza (selección de pesista; `tarima.aspecto`): solo entonces se baja plantel.json
  // y el modelo nuevo en lugar del de siempre. Sin elección, todo queda como siempre y no se baja nada de más.
  fijarBase();
  { const pz = IDS.includes(guardado.get('tarima.pesista')) ? guardado.get('tarima.pesista') : 'ventura', m = guardado.get('tarima.aspecto');
    if (m && poses[m]) { try { const pl = await plantelJSON(); if (aspectosDe(pz, pl.pesistas, poses).includes(m) && vestirJugador(pz, m, pl.pesistas, poses)) E.aspecto = { plaza: pz, modelo: m }; } catch (e) { console.warn('aspecto:', e); } } }
  await Promise.all([`800 20px 'Saira Condensed'`, `700 20px 'Saira Condensed'`, `500 20px 'Saira Condensed'`].map(f => document.fonts.load(f).catch(() => null)));
  Object.assign(C, calidadInicial(params.get('calidad') || params.get('q'), tactil())); fijarHz(await refresco);
  if (C.auto) C.Q = { ...C.Q, dpr: 2 };      // en automático el tope de píxeles lo pone la calibración, no la densidad de cada calidad
  // LIF-33: sin WebGL (contexto que no se crea) el aviso del 3D y nunca la interfaz sin el pesista
  // un programa que no compila: se anota (three no lo dice de otra forma) y revisarShaders() decide antes de jugar. Va puesto
  // ANTES de armar la escena: el constructor ya dibuja (luz horneada) y un programa que fallaba ahí no llegaba a anotarse
  // (check_carga_fallas [shader]: a veces no aparecía el aviso)
  const alShader = (gl, program, vs, fs) => {
    const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].map(x => String(x || '').trim()).filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 160);
    E.shaderMal = E.shaderMal || log || 'shader'; console.error('THREE: el programa no compila:', log);
  };
  try { escena = new Escena($('gl'), C.Q, { reduceMotion, alShader }); } catch (e) { cargaUI.ocultar(); return falloGrafico('webgl', e); }
  escena.setRecuadro(recuadroOn(), recuadroPedido());
  escena.poses = poses; nombrar(); orientacion();
  escena.renderer.debug.onShaderError = alShader;
  vigilarContexto($('gl'));
  // cortes a la vista (stage.js, _vigilar), con la hora del juego y la pantalla: los cuenta tools/cortes.mjs
  escena.alCorte = r => { if (E.cortes.length < 4000) E.cortes.push({ t: Math.round(reloj.ahora()), p: E.pantalla, r: r.join('+') }); };
  escena.alProgreso = cargaUI.progreso; cargaUI.esperar([...new Set(IDS.map(id => PLANTEL[id].modelo))].flatMap(m => [m + ':glb', ...(poses[m]?.mask ? [m + ':mask'] : [])]));      // bytes de los modelos para la pantalla de carga
  if (C.auto) { gov = new Gobernador(C.hz); gov.calentar(reloj.ahora(), 4000); }
  // los modelos bajan mientras se mira el inicio; apenas están, se compila y se usa una vez todo lo que se va a dibujar
  const cargas = IDS.map(id => escena.cargar(id).catch(() => null));
  if (params.get('banco') === '1') { $('msg').textContent = 'Banco de medición…'; const { correrBanco } = await import('./banco.js'); correrBanco({ escena, cargas, hz: C.hz, params, msg: $('msg') }); return; }
  E.precal = DIBUJA ? Promise.all(cargas).then(() => escena.precalentar()).catch(e => { console.warn('precalentar:', e); }) : Promise.resolve();
  ayudas = new Ayudas($('ayudas')); senalUI = new Senal($('senal'), tactil()); margenUI = new Margen($('margen'), { reduce: reduceMotion }); barritaUI = new Barrita($('barrita'), { reduce: reduceMotion }); boton = new Boton([$('escena'), $('zona')]);
  aprendeUI = new Aprende($('tv'), { ahora: () => reloj.ahora(), guardado, ev, pantalla: () => E.pantalla, panel: () => $('capa').querySelector('.panel.llamado') }); $('escena').tabIndex = -1;
  // «?» junto a la pausa: «Cómo se juega» con el dedo (con teclado es H)
  if (!$('ayudab')) { const ay = document.createElement('button'); ay.id = 'ayudab'; ay.hidden = true; ay.textContent = '?'; $('pausa').after(ay); ay.onclick = () => abrirSobre('ayuda'); pintarFijos(); }
  if (!$('camb')) { const cb = document.createElement('button'); cb.id = 'camb'; cb.type = 'button'; cb.hidden = true; $('sonidob').after(cb); cb.onclick = () => { alternarCamara(); cb.blur(); }; pintarCamb(); }
  // el selector ES · EN de cualquier panel (bienvenida, cómo se gana, kilos, llamado, intervalo, podio, muro, encuesta)
  $('capa').addEventListener('click', e => { const b = e.target.closest?.('.idi'); if (b && b.dataset.lang) { cambiarIdioma(b.dataset.lang); $('capa').querySelector(`.idi[data-lang="${idiomaActual()}"]`)?.focus({ preventScroll: true }); } });
  addEventListener('keydown', alTeclado, true); $('pausa').onclick = () => abrirSobre('pausa'); $('saltar').onclick = () => E.saltar?.();
  { const f = document.createElement('div'); f.id = 'fundido'; f.setAttribute('aria-hidden', 'true'); $('gl').after(f); }      // el negro de los fundidos (RITMO.fundido)
  botonSaltar(false);
  ponerAcuse(); if (params.get('depura') === '1') depura = new Depura($('depura'), () => ({ perf: perf.ult, calidad: window.JUEGO.calidad, toques, pantalla: E.pantalla }));
  cargaUI.ocultar();
  ultimo = reloj.ahora(); requestAnimationFrame(bucle);
  const A = await arranque;
  ev('juego_abierto', { carga_ms: Math.round(performance.now()), pantalla_inicial: A.muro ? 'muro' : 'bienvenida', reintentos_modulo: window.__tarimaReintentos || 0, orientacion: telefono.orientacion });
  (async () => {
    if (A.muro) { visita('muro'); await mostrarMuro('carga', A); }
    let cfg = null; for (;;) { if (!cfg) cfg = await inicio(); const r = await partida(cfg); cfg = r === 'revancha' ? { ...cfg, calentar: false, primera: false } : null; }
  })().catch(e => fallar(e));
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
function holgura(tb, enManos = 0) {
  const a = escena.activo; if (!a || tb < 0) return null;
  const V = escena.barbell.group.position.constructor, b = escena.barbell.group.position, R = escena.pisoBarra;
  const e0 = new V(-.62, b.y, b.z), e1 = new V(.62, b.y, b.z), todos = {}; let min = { h: 9, que: '' };
  for (const [x, y, r, brazo] of MIEMBROS) {
    if (brazo && tb < enManos + .25) continue;      // `enManos`: lo que la barra baja acompañada por las manos antes de soltarla (caida.js, GUIA)
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
  E, perf, reloj, toques, proximoCentro, eventos: EVENTOS, ganchos, t, idioma: l => (l ? cambiarIdioma(l) : idiomaActual()), get calidad() { return { nombre: C.nombre, auto: C.auto, clave: C.clave, sombras: C.sombras, hz: C.hz, meta: +metaDe(C.hz, C.pasoMin).toFixed(2), paso: C.paso, piso: +(C.piso || 0).toFixed(2), periodo: +(1000 / metaDe(C.hz, C.pasoMin)).toFixed(2), medido: C.medido, cambios: C.cambios, megapixeles: escena ? +escena.megapixeles.toFixed(2) : 0, nativo: escena ? +escena.nativoMP.toFixed(2) : 0, ventana: gov ? gov.ult : null, quieto: gov ? gov.quieto : false, gobernador: gov ? gov.estado : null, calibracion: C.calibracion }; }, pausa: abrirSobre, seguir: cerrarSobre, get escena() { return escena; }, get registro() { return E.registro; }, PLAN,
  /** Lo que la prueba necesita para jugar por la vía real de entrada: pantalla, y del intento en curso, fase y próximo objetivo. */
  estado() {
    const I = E.intento, pn = $('capa').firstElementChild, act = document.activeElement;
    const o = { pantalla: E.pantalla, visitados: E.visitados, modo: E.modo, errores: E.errores, ahora: reloj.ahora(), fase: E.p?.fase ?? null, metro: E.metro ?? null, intento: null,
      panel: !!pn, foco: act && act.tagName === 'BUTTON' ? claveDe(act) || 'button' : campo(act) ? '#' + (act.id || 'campo') : null, idioma: idiomaActual(), sobre: E.sobre ? E.sobre.tipo : null, ctl: E.cfg?.ctl || E.ctl, aprende: aprendeUI?.estado() ?? null };
    if (I && I.m) {
      const m = I.m, M = m.M, c = I.ctx, abs = t => (I.guiado ? o.ahora + (t - I.now) / (I.vel || 1) : I.t0 + t), x = { fase: m.fase, propio: I.propio, now: I.now, objetivo: null, accion: null, apretado: boton.apretado, ctl: I.ctl, guiado: I.guiado, seDetiene: !!I.seDetiene, entradas: I.ent.length, parado: I.parado, senal: null };
      // la señal visible: lo único que mira un jugador (y la prueba en Fácil). `objetivo` en tiempo del reloj del juego.
      if (I.senal) { const s = I.senal; x.senal = { clave: s.clave, verbo: s.verbo, tipo: s.tipo, paso: s.paso ?? null, gesto: s.gesto ?? null, objetivo: s.objetivo !== undefined ? abs(s.objetivo) : null, desde: s.desde !== undefined ? abs(s.desde) : null, hasta: s.hasta !== undefined ? abs(s.hasta) : null, guardado: !!s.guardado, visible: !$('senal').hidden, texto: $('senal').textContent.replace(/\s+/g, ' ').trim() };
        // 'b': la barrita reemplaza a la señal; `objetivo`: el próximo paso del puntero por el centro del verde (desde 300 ms)
        if (s.tipo === 'barra' || (s.z && I.ctl === 'b')) { const bb = $('barrita'); Object.assign(x.senal, { visible: !bb.hidden, texto: bb.textContent.replace(/\s+/g, ' ').trim(), barra: { i: s.i, v: s.z.v, a: s.z.a, vMs: s.z.vMs, aMs: s.z.aMs }, ...(s.tipo === 'barra' ? { objetivo: abs(proximoCentro(s.desde, I.now + 300, s.R)) } : {}) }); } }
      if (m.U) x.uno = { margen: m.U.m, guarda: m.U.guarda, salto: m.U.salto !== null, pisoton: m.U.pisoton !== null, garra: m.U.garra, contactos: m.U.contactos.length, ultimo: m.U.contactos.at(-1)?.que ?? null };
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
      E.camPrueba = null; if (!c) return null; c.resP = res; if (camara === 'caida') escena.primerPlano('caida'); else escena.camara(camara);
      return { tipo: c.tipo, dur: c.dur, suelta: c.pl.suelta, y: escena.barY, z: escena.barZ };
    },
    /**
     * Posa al pesista `id` en la muestra local `s` (fraccionaria) del segmento `seg`, con la cámara `camara` (clave de
     * cámara, de plano o 'pov'), avanza la cámara `dt` s y dibuja si `dibujar` (tools/check_pov.mjs). Devuelve medir().
     */
    async posa({ id, lev, seg, s = 0, kg = 140, camara = '3/4', dt = .5, dibujar = true, temblor = 0 }) {
      await escena.cargar(id); if (escena.id !== id) await escena.mostrar(id); escena.setCarga(kg, lev);
      const G = tramo(escena.P, seg), i = Math.min(G.n - 2, Math.max(0, Math.floor(s))), pose = { seg: G.nombre, s, tau: G.tt[i] + (G.tt[i + 1] - G.tt[i]) * (s - i), base: G.base, primero: seg === (lev === 's' ? 'snatch' : 'clean') };
      escena.posar(pose, lev, dt < .1 ? dt : 0, temblor, reloj.ahora() / 1000);
      if (E.camPrueba !== camara + id) { E.camPrueba = camara + id; escena.camara(camara); }
      escena.cuadro(dt, dibujar); return this.medir();
    },
    /**
     * Dibuja un cuadro y lee la imagen del lienzo en una grilla de 24 × 12 puntos, sin la franja derecha donde va el recuadro:
     * {media, desvio} de la luminancia (0 a 255) y `horizonte` (fracción del alto, desde arriba, de la línea piso/fondo que
     * la cámara tiene delante: la proyección de un punto lejano a la altura del piso). Para que las pruebas vean un cuadro negro.
     */
    luz() {
      escena.cuadro(0, true); const r = escena.renderer, g = r.getContext(), W = g.drawingBufferWidth, H = g.drawingBufferHeight, px = new Uint8Array(4), L = [];
      r.setRenderTarget(null); r.state.bindFramebuffer(g.READ_FRAMEBUFFER, null); r.state.bindFramebuffer(g.FRAMEBUFFER, null);
      for (let j = 0; j < 12; j++) for (let i = 0; i < 24; i++) { g.readPixels(Math.floor((i + .5) / 24 * W * .7), Math.floor((j + .5) / 12 * H), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); L.push(.2126 * px[0] + .7152 * px[1] + .0722 * px[2]); }
      const m = L.reduce((a, b) => a + b, 0) / L.length, d = Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length);
      const cam = escena.rig.camera, V = escena.barbell.group.position.constructor, h = new V(0, 0, 30).project(cam);
      return { media: Math.round(m * 10) / 10, desvio: Math.round(d * 10) / 10, horizonte: Math.round((1 - h.y) / 2 * 1000) / 1000 };
    },
    /** Tiempos (s) de las muestras del segmento `seg` del pesista puesto y el índice de cada fase (tools/check_pov.mjs: tiras a tiempo real). */
    tiempos(seg) { const G = tramo(escena.P, seg); return { tt: Array.from(G.tt), n: G.n, fases: escena.P.segs[seg].poses.map(p => p.n), sub: escena.P.sub }; },
    /** Dónde están pies, manos, cadera, cabeza, barra y cámara (m), y el hueso (sin contar los dedos) que más giró desde la llamada anterior (rad). */
    medir() {
      const a = escena.activo; if (!a) return null; const V = escena.barbell.group.position.constructor, r = x => Math.round(x * 1e4) / 1e4, o = {};
      for (const k of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'LeftArm', 'RightArm', 'Hips', 'Head']) { const p = a.boneWorld(k, new V()); o[k] = [r(p.x), r(p.y), r(p.z)]; }
      let giro = 0, cual = ''; const antes = E.medAntes, q = a.bones.map(b => b.quaternion.clone());
      if (antes && antes.a === a) a.bones.forEach((b, i) => { const g = q[i].angleTo(antes.q[i]); if (g > giro && !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(b.name)) { giro = g; cual = b.name.replace(/^mixamorig:?/, ''); } });
      E.medAntes = { a, q }; const cam = escena.rig.camera, d = cam.getWorldDirection(new V()), b = escena.barbell.group.position;
      return { ...o, giro: r(giro), cual, bar: [r(b.y), r(b.z)], cam: { p: [r(cam.position.x), r(cam.position.y), r(cam.position.z)], inc: r(Math.asin(d.y)), fov: r(cam.fov) }, pov: !!escena.pov, sinCabeza: !!escena._sinCabeza, sinTorso: !!(escena._sinTorso?.skin?.uSinTorso?.value > .5), recuadro: !!escena.recuadro?.el && !escena.recuadro.el.hidden, conBarrita: !!escena.pov?.conBarrita, vz: escena.pov?.vz || 0, manos: escena.manosEnVista(), ojos: (() => { const o = escena.ojos(new V()); return [r(o.x), r(o.y), r(o.z)]; })(), rum: r(Math.atan2(d.x, d.z)) };
    },
    /** Lleva la escena de final() al instante t (s), la dibuja si `dibujar`, y mide holguras entre la barra y el cuerpo. */
    finalEn(t, dibujar = false, dt = 1 / 60, dtCam = .5) { const c = E.prueba; dibujarFinal(c, t, dt, false);
      // las luces y el veredicto como en el juego (decision): de a una desde 0,2 s y el cartel a 1,05 s
      if (c.resP) { const ok = c.resP.res === 'valido', L = ok ? [true, true, true] : c.resP.res === 'nulo' ? [false, true, false] : [false, false, false], n = Math.max(0, Math.min(3, Math.floor((t - .2) / .3) + 1)); setLuces(t < .2 ? null : L.map((x, i) => (i < n ? x : null))); const ver = t >= 1.05 ? textoDe(ok ? 'veredicto.vale' : c.resP.res === 'nulo' ? 'veredicto.no_vale' : 'veredicto.cayo') : ''; if (ver !== c.verP) { c.verP = ver; veredicto(ver, '', !ok, ver ? L : null); clearTimeout(veredictoReloj); } $('veredicto').classList.toggle('grande', !!ver && t < 2.55); } escena.cuadro(dtCam, dibujar); return holgura(t - c.pl.suelta, c.pl.guia ? c.pl.guia.dur : 0); },
    /** Cambio de carga a mano: de `kg0` a `kg1`, con la manga en primer plano. Devuelve la duración (s). */
    async carga(kg0, kg1, id = 'ventura') { await escena.cargar(id); await escena.mostrar(id); escena.setCarga(kg0, 's'); escena.posar(poseParado(escena.P, 's'), 's'); await escena.mostrar(null); escena.barraSuelta({ y: escena.pisoBarra, z: escena.barZ, ang: 0 }); const A = E.pruebaCarga = escena.cambioDeCarga(kg1); escena.primerPlano('manga'); return A ? { dur: A.dur, sale: A.sale, entra: A.entra } : null; },
    cargaEn(t, dibujar = false) { const A = E.pruebaCarga, x = A.en(t); escena.barraSuelta({ y: escena.pisoBarra, z: escena.barZ, ang: 0 }); escena.cuadro(.5, dibujar); return x; },
    /** El plano del llamado con un panel de prueba al costado (o al pie en vertical). */
    async planoLlamado(id = 'ventura') { await escena.cargar(id); await escena.mostrar(id); escena.posar(poseParado(escena.P, 's'), 's'); const pn = capa.poner('<h2>Panel de prueba</h2><p>El pesista tiene que quedar a la vista.</p><div class="fila"><button class="ir">Confirmar</button></div>', 'chico abajo lado'); const e = encuadreLibre(); escena.primerPlano('medio', e); escena.cuadro(.5, true); return { encuadre: e, panel: pn.getBoundingClientRect().toJSON() }; },
  },
  listo: iniciar().then(() => true, err => { fallar(err, 'inicio'); return false; }),
};
