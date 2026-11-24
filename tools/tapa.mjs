// Cuánto tapa la interfaz al pesista (pedido del dueño del 13-nov: «en mobile los carteles me tapan mucho al pesista»).
// Se mide en la página, con la caja del pesista proyectada desde three (stage.js → cajas(): huesos de la cabeza a los pies,
// el torso, y la barra con sus discos) y las cajas de la interfaz visible (getBoundingClientRect de los carteles de #tv, el
// panel abierto, el botón redondo, la pausa y el sonido, con opacidad efectiva > 0,5). Devuelve qué parte de cada caja queda
// debajo de alguna (muestreo de 48 × 48 puntos), qué elementos tapan y cuántos textos se ven en la pantalla.
// Carteles que tapan la cabeza (17-nov, el dueño jugando parado: «hay casos donde los carteles le tapan la cabeza al pesista»):
// además se miden la caja de la CABEZA y la BARRA contra todo lo que se ve (opacidad efectiva > 0,2: un cartel a medio
// aparecer también tapa), en todos los momentos de un intento (`seguidor`), y `revisar` falla si la cabeza queda tapada más
// de 5 % o la barra, cuando está arriba de la cabeza, más de 10 %. En primera persona no hay cabeza que tapar: se mide el
// recuadro con la vista de afuera.
// Lo usan tools/check_barra.mjs y tools/check_telefono.mjs.

/** Corre en la página. `JUEGO.escena.cajas()` tiene que existir (stage.js). */
export function medirEnPagina() {
  const cajas = window.JUEGO?.escena?.cajas?.();
  const vw = innerWidth, vh = innerHeight;
  const opacidad = e => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return 0; o *= +c.opacity; } return o; };
  const visible = e => e && !e.hidden && opacidad(e) > .5;
  const SEL = ['#tv > *', '#capa > .panel', '#zona', '#pausa', '#sonidob', '#ayudab', '#saltar', '#prono', '#sobre', '#instalar', '#sinfoco'];
  const ui = [], tenue = [];      // `tenue`: lo que se ve aunque sea a medias (para la cabeza y la barra)
  for (const e of document.querySelectorAll(SEL.join(','))) {
    if (!e || e.hidden) continue; const o = opacidad(e); if (!(o > .2)) continue; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const q = { id: e.id || e.className.split(' ')[0] || e.tagName.toLowerCase(), l: r.left, t: r.top, r: r.right, b: r.bottom };
    tenue.push(q); if (o > .5) ui.push(q);
  }
  const dentro = (x, y, r) => x >= r.l && x <= r.r && y >= r.t && y <= r.b;
  const parte = (c, ui) => {
    if (!c) return { pct: 0, quien: [], nada: true };
    const l = Math.max(0, c.l), r = Math.min(vw, c.r), t = Math.max(0, c.t), b = Math.min(vh, c.b), N = 48; if (r <= l || b <= t) return { pct: 0, quien: [] };
    let n = 0, tapados = 0; const quien = {};
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = l + (i + .5) * (r - l) / N, y = t + (j + .5) * (b - t) / N; n++;
      const u = ui.filter(q => dentro(x, y, q)); if (u.length) { tapados++; for (const q of u) quien[q.id] = (quien[q.id] || 0) + 1; }
    }
    return { pct: Math.round(tapados * 1000 / n) / 10, quien: Object.entries(quien).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v * 100 / n)}%`) };
  };
  // textos a la vista: elementos con texto propio, dentro de la pantalla y con opacidad efectiva > 0,5
  let textos = 0;
  const w = document.createTreeWalker(document.getElementById('app') || document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const e = n.parentElement; if (!e || vistos.has(e) || !n.textContent.trim()) continue; vistos.add(e);
    if (e.closest('[hidden]') || !visible(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    textos++;
  }
  if (!cajas) return { sinPesista: true, textos };
  const C = cajas.cuerpo || cajas.barra || { l: 0, t: 0, r: 0, b: 0 }, enPantalla = C.r > 0 && C.l < vw && C.b > 0 && C.t < vh, red = c => (c ? { l: Math.round(c.l), t: Math.round(c.t), r: Math.round(c.r), b: Math.round(c.b) } : null);
  const v = document.getElementById('veredicto');
  return { cuerpo: parte(cajas.cuerpo, ui), torso: parte(cajas.torso, ui), barra: parte(cajas.barra, ui), cabeza: parte(cajas.cabeza, tenue), barraT: parte(cajas.barra, tenue), recuadro: cajas.recuadro ? parte(cajas.recuadro, tenue) : null,
    alta: !!cajas.alta, ojos: !!cajas.ojos, bajo: document.documentElement.matches('.horiz.bajo'), textos, enPantalla, caja: red(C), cajaCabeza: red(cajas.cabeza), cajaBarra: red(cajas.barra), veredicto: v && !v.hidden ? v.className : null };
}

/** Fila de la tabla: «momento: cuerpo 12 % (barrita 9%, zona 3%) · torso 0 % · cabeza 0 % · barra 4 % (arriba) · 7 textos». */
const quien = q => (q && q.quien.length ? ` (${q.quien.join(', ')})` : '');
export const fila = (m, x) => (x && x.sinPesista ? `${m.padEnd(22)} sin pesista · ${x.textos} textos` : x ? `${m.padEnd(22)} ${x.ojos ? 'desde los ojos' : `cuerpo ${String(x.cuerpo.pct).padStart(5)} %${quien(x.cuerpo)} · torso ${x.torso.pct} %`} · cabeza ${x.cabeza && !x.cabeza.nada ? `${x.cabeza.pct} %${quien(x.cabeza)}` : '—'} · barra ${(x.barraT || x.barra).nada ? '—' : `${(x.barraT || x.barra).pct} %${quien(x.barraT || x.barra)}`}${x.alta ? ' (arriba)' : ''}${x.recuadro ? ` · recuadro ${x.recuadro.pct} %${quien(x.recuadro)}` : ''} · ${x.textos} textos` : `${m.padEnd(22)} sin pesista`);

/** Topes de la regla del 17-nov: cabeza ≤ 5 %; barra ≤ 10 % cuando está arriba de la cabeza; recuadro de la primera persona ≤ 5 %. */
export const TOPE_CABEZA = 5, TOPE_BARRA = 10;
// Paneles a pantalla completa de antes y después de la final (el pesista es fondo): se informan, no se exigen.
const FONDO = new Set(['inicio', 'presentacion', 'muro', 'fin']);
/**
 * Umbrales. Porcentaje del cuerpo tapado: durante la barrita, el levantamiento y el turno de un rival ≤ 15 %; en el llamado, el
 * torso ≤ 20 % (el panel puede ocupar más, pero del lado opuesto a la cara y el torso). En TODOS los momentos de un intento
 * (llamado, preparación, barrita, levantamiento, barra arriba, veredictos, fin del arranque, rivales, explicaciones): cabeza
 * ≤ 5 % y, con la barra arriba, barra ≤ 10 %. El momento puede llevar «@c» (dos tiempos). Devuelve el problema o null.
 * CABEZA_INFORMA=1: la regla de la cabeza y la barra solo informa (para medir un antes).
 */
export function revisar(momento, x) {
  if (!x || x.sinPesista) return null;
  const base = momento.replace(/@.*$/, ''), P = [];
  if (!x.ojos) {
    if (['quieta', 'corre', 'pega', 'levanta', 'arriba', 'fija'].includes(base) && x.cuerpo.pct > 15) P.push(`${momento}: la interfaz tapa el ${x.cuerpo.pct} % del pesista (meta ≤ 15 %): ${x.cuerpo.quien.join(', ')}`);
    // turno de un rival (13-nov): el tablero y el botón «Saltar» no tapan al rival que levanta
    if (base === 'rival' && x.cuerpo.pct > 15) P.push(`rival: la interfaz tapa el ${x.cuerpo.pct} % del rival (meta ≤ 15 %): ${x.cuerpo.quien.join(', ')}`);
    // LIF-52: la explicación de primera vez no tapa al pesista (meta: nada; tope 5 % del cuerpo, contando solo ese cartel)
    if (base.startsWith('aprende')) { const q = x.cuerpo.quien.find(z => z.startsWith('aprende ')), n = q ? +q.split(' ')[1].replace('%', '') : 0; if (n > 5) P.push(`${momento}: la explicación de primera vez tapa el ${n} % del pesista (tope 5 %)`); }
    if (base === 'llamado' && x.torso.pct > 20) P.push(`llamado: el panel tapa el ${x.torso.pct} % del torso y la cara del pesista (meta ≤ 20 %): ${x.torso.quien.join(', ')}`);
  }
  // elegir kilos con el teléfono acostado (340 a 390 px de alto): el panel va a lo ancho, no hay dónde dejar al pesista
  const sinLugar = x.bajo && ['apertura', 'intervalo'].includes(base);
  if (!FONDO.has(base) && !sinLugar && process.env.CABEZA_INFORMA !== '1') {
    if (x.cabeza && x.cabeza.pct > TOPE_CABEZA) P.push(`${momento}: un cartel tapa el ${x.cabeza.pct} % de la CABEZA del pesista (tope ${TOPE_CABEZA} %): ${x.cabeza.quien.join(', ')}`);
    if (x.alta && !x.ojos && x.barraT && x.barraT.pct > TOPE_BARRA) P.push(`${momento}: un cartel tapa el ${x.barraT.pct} % de la BARRA arriba (tope ${TOPE_BARRA} %): ${x.barraT.quien.join(', ')}`);
    if (x.recuadro && x.recuadro.pct > TOPE_CABEZA) P.push(`${momento}: un cartel tapa el ${x.recuadro.pct} % del recuadro de la primera persona (tope ${TOPE_CABEZA} %): ${x.recuadro.quien.join(', ')}`);
  }
  return P.length ? P.join(' | ') : null;
}

/** Corre en la página: el estado del juego más lo que hace falta para saber en qué momento del intento se está. */
export function estadoEnPagina() {
  const e = window.JUEGO.estado(), v = document.getElementById('veredicto'); let c = null; try { c = window.JUEGO.escena?.cajas?.(); } catch { /* sin escena */ }
  e.lev = window.JUEGO.E.p?.lev ?? null; e.propios = (window.JUEGO.E.propios || []).length; e.alta = !!c?.alta;
  e.ver = v && !v.hidden ? { grande: v.classList.contains('grande'), mal: v.classList.contains('mal') } : null;
  return e;
}

const SUBIENDO = ['tiron', 'vuelo', 'pelea', 'traba', 'empuje', 'flexion', 'fijacion'];
/**
 * Los momentos de un intento que las pruebas no medían (17-nov). Devuelve una función para llamar en cada vuelta con el
 * estado (`estadoEnPagina`); mide cada momento una vez (`tapa(momento)` anota en `medidos` y revisa) y saca una captura:
 *  - `prepara`: intento propio antes de la barrita (sin señal) · `arriba`: intento propio con la barra arriba de la cabeza
 *    (la primera vez: en la sentadilla) · `fija`: de pie con la barra arriba (la fijación);
 *  - `veredicto` (el cartel grande del resultado), `veredicto_chico` (cuando vuelve a su lugar), con `_mal` si no vale o
 *    cayó y `_rival` si es de un rival · `rival_arriba`: un rival con la barra arriba;
 *  - `repeticion`, `repeticion_rival`, `carga`, `desplazado`: los otros carteles que usan el veredicto.
 * En dos tiempos los momentos propios llevan «@c».
 */
export function seguidor({ page, tapa, foto, medidos }) {
  let propio = false;
  const una = async m => { if (medidos.has(m)) return false; await tapa(m); await foto('tapa_' + m); return true; };
  return async s => {
    const I = s.intento, suf = s.lev === 'c' ? '@c' : '';
    if (I) propio = !!I.propio; else if (s.pantalla === 'rival') propio = false;
    if (I && I.propio && s.modo !== 'panel') {
      if (!I.senal && !s.alta && !SUBIENDO.includes(I.fase) && s.pantalla !== 'decision') await una('prepara' + suf);
      if (s.alta) await una('arriba' + suf);
      if (s.alta && (I.fase === 'fijacion' || I.senal?.clave === 'aguanta')) await una('fija' + suf);      // de pie con la barra arriba
    }
    if (s.pantalla === 'rival' && s.alta) await una('rival_arriba');
    if (s.ver && s.pantalla === 'decision') {
      const m = (propio ? 'veredicto' : 'veredicto_rival') + (s.ver.mal ? '_mal' : ''), sf = propio ? suf : '';
      if (!medidos.has(m + '_chico' + sf)) {
        if (s.ver.grande) await una(m + sf);
        // el cartel grande dura 1,5 s de reloj verdadero: se espera a que vuelva a su lugar
        await page.waitForFunction(() => { const v = document.getElementById('veredicto'); return !v || v.hidden || !v.classList.contains('grande'); }, null, { timeout: 2500 }).catch(() => null);
        if (await page.evaluate(() => !document.getElementById('veredicto').hidden)) await una(m + '_chico' + sf);
      }
    } else if (s.ver && ['repeticion', 'repeticion_rival', 'carga', 'desplazado'].includes(s.pantalla)) await una(s.pantalla);
  };
}
