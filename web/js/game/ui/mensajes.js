// Textos del control (docs/CONTROLES.md, secciones 5 a 7, y docs/MVP.md, sección 4.5): la palabra de cada toque, la línea
// que explica un fallo y los pasos de «Cómo se juega». Puro, sin DOM: lo prueba tools/sim_test.mjs. Las frases salen de los
// diccionarios (i18n/es.js y en.js) con plantillas enteras por idioma, porque el orden de las palabras cambia.
import { tr, idiomaActual, teclasDe } from '../i18n/t.js';

/** Palabra después de cada toque (`clave` en el diccionario). `floja`: ámbar (el levantamiento sigue). */
export const PALABRAS = { perfecto: { clave: 'palabra.perfecto' }, bien: { clave: 'palabra.bien' }, temprano: { clave: 'palabra.temprano', floja: true }, tarde: { clave: 'palabra.tarde', floja: true } };

/** Verbo de la señal de un gesto en Un toque: la clave del diccionario. */
const VERBO = { 's|explosion': 'senal.explota', 'c|explosion': 'senal.explota', 'j|explosion': 'senal.arriba', 's|recepcion': 'senal.recibi', 'c|recepcion': 'senal.recibi', 'j|recepcion': 'senal.recibi' };
export const verboDe = (mov, g, l = idiomaActual()) => tr(l, VERBO[mov + '|' + g] || 'senal.explota');
/**
 * Cuánto se desvió un toque. Un toque: «un poco», «bastante» o «muy» (cortes en 60 y 150 ms) más temprano o tarde; a quien
 * empieza un número no le dice nada. Pro: «180 ms tarde», redondeado a 10 ms.
 */
export function cuanto(e, l = idiomaActual(), pro = false) {
  const lado = tr(l, e < 0 ? 'cuanto.temprano' : 'cuanto.tarde'), a = Math.abs(e);
  if (pro) return tr(l, 'cuanto.ms', { ms: Math.max(10, Math.round(a / 10) * 10), lado });
  return tr(l, 'cuanto.frase', { grado: tr(l, a < 60 ? 'cuanto.poco' : a < 150 ? 'cuanto.bastante' : 'cuanto.muy'), lado });
}
/**
 * Qué pasó y qué hacer distinto, en una línea. `res` es el resultado del núcleo (causa, gestos, toques).
 * @param {object} res  @param {'c'|'f'} ctl  @param {boolean} tactil  sin teclado: no nombra la tecla
 * @param {{sinConfirmar?:boolean, practica?:boolean, tardio?:number}} [o]  sinConfirmar: el reloj se acabó con el panel abierto; practica: no hay
 *   kilos que elegir; tardio: ms después del final en que llegó un toque que ya no servía (para no decir «no tocaste»)
 * @param {'es'|'en'} [l]  idioma (por defecto, el actual)
 * @returns {string} '' si no hay nada que explicar (válido con tres blancas)
 */
export function explicar(res, ctl = 'c', tactil = false, o = {}, l = idiomaActual()) {
  if (ctl === 'u') return lineaU(res, o || {}, l);
  const r = linea(res, ctl, tactil, o || {}, l); if (!r) return '';
  return tr(l, r[0], { tactil, ...r[1] }).replace(/!\./g, '!');
}
function linea(res, ctl, tactil, o, l) {
  if (!res || !res.causa) return null;
  const f = ctl === 'f', g = res.gestos || [], ex = [...g].reverse().find(x => x.g === 'explosion'), rc = [...g].reverse().find(x => x.g === 'recepcion'), j = (ex || rc)?.mov === 'j';
  const verbo = tr(l, j ? 'senal.arriba' : 'senal.explota'), cuando = tr(l, f ? 'cuando.facil' : j ? 'cuando.pro_j' : 'cuando.pro');
  const lado = e => tr(l, e > 0 ? 'cuanto.tarde' : 'cuanto.temprano'), ajuste = e => tr(l, e > 0 ? 'ajuste.antes' : 'ajuste.despues');
  const v = { verbo, cuando };
  if (f) switch (res.causa) {
    case 'sin_altura':
      if (ex && ex.fuera && ex.e > 0) return [o.tardio !== undefined ? 'explica.sin_altura.tardio' : 'explica.sin_altura.no_toco', v];
      return ex ? ['explica.sin_altura', { ...v, cuanto: cuanto(ex.e, l) }] : ['explica.sin_altura.no_toco', v];
    case 'anticipado': return ['explica.anticipado', v];
    case 'adelante': return ex ? ['explica.adelante', { ...v, cuanto: cuanto(ex.e, l) }] : ['explica.adelante.gen', v];
    case 'atras': return ex ? ['explica.atras', { ...v, cuanto: cuanto(ex.e, l) }] : ['explica.atras.gen', v];
    case 'fondo':
      if (rc && rc.e < 0) return ['explica.fondo.temprano', v];
      return [o.tardio !== undefined ? 'explica.fondo.tardio' : 'explica.fondo', v];
    case 'aplastado': case 'codos': {
      if ((res.toques || 0) < 3) return ['explica.empuje.sin_toques', v];
      // la línea no contradice a las palabras: si todos los toques salieron PERFECTO o BIEN, lo que faltó fue ritmo en la subida
      const malo = g.filter(x => !x.fuera && (x.pal === 'temprano' || x.pal === 'tarde')).sort((a, b) => Math.abs(b.e) - Math.abs(a.e))[0];
      if (malo) return ['explica.empuje.destiempo', { ...v, verbo: verboDe(malo.mov, malo.g, l), cuanto: cuanto(malo.e, l) }];
      return [o.practica ? 'explica.empuje.ritmo' : 'explica.empuje.ritmo_kilos', v];
    }
    // a destiempo: se dice para qué lado y cuánto, que es lo que el jugador puede corregir
    case 'codos_blandos': return rc ? ['explica.codos_blandos', { ...v, cuanto: cuanto(rc.e, l), ajuste: ajuste(rc.e) }] : ['explica.codos_blandos.gen', v];
    case 'temblor': case 'tiembla': return ex ? ['explica.temblor', { ...v, cuanto: cuanto(ex.e, l), ajuste: ajuste(ex.e) }] : ['explica.temblor.gen', v];
    case 'devuelve': return ['explica.devuelve', v];
    case 'reloj': return [o.sinConfirmar ? 'explica.reloj.sin_confirmar' : 'explica.reloj', v];
    case 'antes': return ['explica.pro.antes', v];
    case 'sin_apoyo': return ['explica.pro.sin_apoyo', v];
    default: return null;
  }
  switch (res.causa) {
    case 'sin_altura':
      if (ex && ex.fuera && ex.e > 0) return ['explica.pro.sin_altura.no_solto', v];
      return ['explica.pro.sin_altura', { ...v, lado: lado(ex ? ex.e : -1) }];
    case 'anticipado': return ['explica.pro.anticipado', v];
    case 'adelante': return ['explica.pro.adelante', v];
    case 'atras': return ['explica.pro.atras', v];
    case 'fondo': return [rc && rc.e < 0 ? 'explica.pro.fondo.temprano' : 'explica.pro.fondo', v];
    case 'aplastado': case 'codos': return [(res.toques || 0) < 3 ? 'explica.pro.empuje.sin_toques' : 'explica.pro.empuje', v];
    case 'codos_blandos': return ['explica.pro.codos_blandos', { ...v, lado: rc ? lado(rc.e) : tr(l, 'lado.destiempo') }];
    case 'temblor': case 'tiembla': return ['explica.pro.temblor', v];
    case 'devuelve': return ['explica.pro.devuelve', v];
    case 'reloj': return [o.sinConfirmar ? (tactil ? 'explica.reloj.sin_confirmar' : 'explica.pro.reloj.sin_confirmar') : 'explica.pro.reloj', v];
    case 'antes': return ['explica.pro.antes', v];
    case 'sin_apoyo': return ['explica.pro.sin_apoyo', v];
    default: return null;
  }
}

/**
 * Margen en discos, con cuartos («1½ discos», «¾ de disco»). `m` en milésimas de disco; se redondea al cuarto más cercano
 * (nunca a «nada» si queda algo).
 */
export function discos(m, l = idiomaActual()) {
  const a = Math.abs(m); let q = Math.round(a / 250); if (!q && a > 0) q = 1;
  const n = Math.floor(q / 4), r = q % 4, fr = ['', '¼', '½', '¾'][r];
  if (!q) return tr(l, 'discos.nada');
  if (!n) return tr(l, r === 1 ? 'discos.cuarto' : r === 2 ? 'discos.medio' : 'discos.tres_cuartos');
  if (n === 1 && !r) return tr(l, 'discos.uno');
  return tr(l, 'discos.n', { n: n + fr });
}
/** Discos dibujados (●●○, ◑ para medio, en rojo cuando no alcanza: lo pinta quien llama) para el margen `m` sobre 3. */
export function puntos(m, de = 3) { const x = Math.max(0, Math.min(de, m / 1000)); let s = ''; for (let i = 0; i < de; i++) { const f = x - i; s += f >= .75 ? '●' : f >= .25 ? '◑' : '○'; } return s; }
/** Nombre del tramo en una frase («la subida de la cargada») y como sujeto («Pararse con la cargada»). */
export const tramoTxt = (tramo, lev, l = idiomaActual(), mayor = false) => tr(l, `tramo.${mayor ? 'mayor.' : ''}${tramo === 'tiron' ? 'tiron' : `${tramo}_${lev}`}`);
/**
 * Línea de 'u' (docs/JUEGO.md G2.4, «Línea de caída»): dónde cayó y qué tramo gastó más, nunca un tiempo. `o.quien`,
 * `o.kg`, `o.pct` (intensidad en %) completan la frase; sin ellos, la versión corta. Válido: solo si quedó al límite.
 */
function lineaU(res, o, l) {
  const u = res && res.uno; if (!u) return '';
  const lev = o.lev || (u.gastos.arriba !== undefined && Object.keys(u.gastos)[1] === 'pararse' ? 'c' : 's');
  if (res.res === 'valido') return u.al_limite ? tr(l, 'explica.u.limite', { discos: discos(u.margen_fin, l) }) : '';
  const mayor = u.tramo_mayor || u.tramo_caida, v = { donde: tramoTxt(u.tramo_caida, lev, l), mayor: tramoTxt(mayor, lev, l, true), discos: discos(u.gastos[mayor] || 0, l) };
  return o.quien && o.kg && o.pct ? tr(l, 'explica.u.cae', { ...v, quien: o.quien, kg: o.kg, pct: o.pct }) : tr(l, 'explica.u.cae_corta', v);
}

/** Los tres pasos de «Cómo se juega»: [cantidad de teclas dibujadas, texto]. */
export function pasos(ctl = 'f', tactil = false, l = idiomaActual()) {
  const k = ctl === 'u' ? ['u1', 'u2', 'u3'] : ctl === 'f' ? ['f1', 'f2', 'f3'] : ['c1', 'c2', 'c3'];
  if (ctl === 'u') return k.map(x => [1, tr(l, 'pasos.' + x, { tactil })]);
  return k.map((x, i) => [i === 2 ? 3 : 1, tr(l, 'pasos.' + x, { tactil })]);
}
/** Clave del texto del tutorial guiado en cada parada (Un toque). */
export const GUIA = { tira: 'guia.tira', explota: 'guia.explota', recibi: 'guia.recibi', empuja: 'guia.empuja', aguanta: 'guia.aguanta', flexiona: 'guia.flexiona' };
/** Reemplaza {A}, {T} y {t} según haya teclado o no (para textos que ya vienen armados, como el `sub` de la señal). */
export const conTecla = (txt, tactil, l = idiomaActual()) => { const k = teclasDe(l, tactil); return txt.replace('{A}', k.A).replace('{T}', k.T).replace('{t}', k.t); };
