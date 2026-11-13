// Pantalla de carga (#msg en juego.html): fondo con una luz de tarima que respira (css/carga.css), la barra con los bytes
// reales de los modelos, y frases cortas que rotan cada 4 s (cómo se juega y datos de halterofilia). juego.html carga este módulo aparte y con async: corre apenas bajan los textos,
// antes de three.js y del resto del juego. main.js lo importa (es el mismo módulo) y lo maneja:
//   cargaUI.titulo(clave)         la línea de arriba de la barra, por clave de texto (null la saca)
//   cargaUI.esperar(claves)       qué archivos se esperan ('ventura:glb', 'ventura:mask'...), para el porcentaje
//   cargaUI.progreso(clave, bajado, total)   lo llama Athlete.load (por stage.js) a medida que llegan los bytes
//   cargaUI.mostrar(clave) / cargaUI.ocultar()   aparece / se va con un fundido (sin fundido con movimiento reducido)
//   cargaUI.error(clave)          el juego se detuvo: solo el texto
// Mientras la pantalla está oculta y los modelos siguen bajando (detrás de la bienvenida), una barrita fina arriba de todo
// (#carga-mini) muestra el avance.
import { t, fijarIdioma, detectarIdioma, fijarTactil, alCambiarIdioma, idiomaActual } from '../i18n/t.js';

const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
// el idioma se fija igual que en main.js (que vuelve a hacerlo con el mismo resultado): ?lang=, lo elegido, el navegador
try {
  const guardado = (() => { try { return localStorage.getItem('tarima.idioma'); } catch { return null; } })();
  fijarTactil(matchMedia('(pointer:coarse)').matches);
  fijarIdioma(detectarIdioma({ lang: new URLSearchParams(location.search).get('lang'), guardado, navegador: navigator.languages?.length ? navigator.languages : [navigator.language] }));
} catch { /* sin idioma detectado queda el de fábrica */ }

/** Frases que rotan: primero cómo se juega, después los datos en un orden al azar (distinto en cada visita). */
const DATOS = 11, CADA = 4200;
const orden = ['carga.como', ...Array.from({ length: DATOS }, (_, i) => `carga.dato_${i + 1}`).sort(() => Math.random() - .5)];
/** Peso estimado (bytes) mientras un archivo no dijo su tamaño: lo justo para que la barra no salte al principio. */
const ESTIMADO = { glb: 3.3e6, mask: 2.5e5 };

const S = { claves: new Map(), esperadas: [], visible: true, i: 0, reloj: null, fin: null, titulo: null, error: false, mini: true };
const el = {};
function nodos() {
  for (const k of ['msg', 'msg-txt', 'carga-prog', 'carga-barra-i', 'carga-pct', 'carga-det', 'carga-dato', 'carga-mini']) el[k] = $(k);
  return !!el.msg;
}

/** Fracción bajada (0..1), bytes bajados y totales; null si todavía no se sabe qué se espera. */
function avance() {
  const claves = new Set([...S.esperadas, ...S.claves.keys()]); if (!claves.size) return null;
  let b = 0, tot = 0, listos = 0;
  for (const k of claves) {
    const c = S.claves.get(k), est = ESTIMADO[k.split(':')[1]] || ESTIMADO.glb;
    const total = c && c.total > 0 ? c.total : Math.max(est, c ? c.bajado : 0);
    b += c ? Math.min(c.bajado, total) : 0; tot += total; if (c && c.total > 0 && c.bajado >= c.total) listos++;
  }
  return { f: tot ? b / tot : 0, b, tot, listo: listos === claves.size };
}
const mb = n => (n / 1e6).toLocaleString(idiomaActual() === 'es' ? 'es' : 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function pintar() {
  if (!el.msg && !nodos()) return;
  const a = avance();
  if (el['msg-txt']) el['msg-txt'].textContent = S.titulo ? t(S.titulo) : '';
  if (el['carga-prog']) {
    el['carga-prog'].classList.toggle('indet', !a || a.listo);      // sin datos todavía, o ya bajado y armando la escena
    if (a) {
      const pct = Math.min(100, Math.floor(a.f * 100));
      el['carga-barra-i'].style.width = (a.listo ? 100 : pct) + '%';
      el['carga-pct'].textContent = a.listo ? '' : pct + ' %';
      el['carga-det'].textContent = a.listo ? t('carga.listos') : `${t('carga.bajando')} · ${mb(a.b)} / ${mb(a.tot)} MB`;
      el['carga-prog'].setAttribute('aria-valuenow', String(a.listo ? 100 : pct));
    } else { el['carga-pct'].textContent = ''; el['carga-det'].textContent = t('carga.bajando'); }
  }
  // la barrita de arriba: solo detrás de la bienvenida (hasta que la pantalla vuelve al tocar «Jugar») y mientras falte bajar algo
  if (el['carga-mini']) {
    const ver = S.mini && !S.visible && !S.error && a && !a.listo;
    if (ver) { el['carga-mini'].hidden = false; el['carga-mini'].firstElementChild.style.width = Math.floor(a.f * 100) + '%'; el['carga-mini'].classList.remove('fuera'); }
    else if (!el['carga-mini'].hidden && !el['carga-mini'].classList.contains('fuera')) {
      el['carga-mini'].firstElementChild.style.width = '100%'; el['carga-mini'].classList.add('fuera');
      setTimeout(() => { if (el['carga-mini'].classList.contains('fuera')) el['carga-mini'].hidden = true; }, reduce ? 0 : 700);
    }
  }
}

function dato(avanzar) {
  if (!el['carga-dato']) return;
  const poner = () => { el['carga-dato'].textContent = t(orden[S.i % orden.length]); el['carga-dato'].classList.remove('cambia'); };
  if (!avanzar) { poner(); return; }
  S.i++;
  if (reduce) { poner(); return; }
  el['carga-dato'].classList.add('cambia'); setTimeout(poner, 350);
}
function rotar(on) {
  clearInterval(S.reloj); S.reloj = null;
  if (on) S.reloj = setInterval(() => { if (!document.hidden) dato(true); }, CADA);
}

export const cargaUI = {
  titulo(clave) { S.titulo = clave || null; pintar(); },
  esperar(claves) { S.esperadas = [...claves]; pintar(); },
  progreso(clave, bajado, total) {
    const c = S.claves.get(clave) || { bajado: 0, total: 0 }; c.bajado = Math.max(c.bajado, bajado || 0); if (total > 0) c.total = total;
    S.claves.set(clave, c);
    // a lo sumo un repintado por cuadro: los eventos de progreso llegan muy seguido
    if (!S.pinta) S.pinta = requestAnimationFrame(() => { S.pinta = 0; pintar(); });
  },
  /** ¿Terminaron de bajar todos los archivos esperados? */
  get bajado() { const a = avance(); return !!(a && a.listo); },
  mostrar(clave) {
    if (!el.msg && !nodos()) return;
    clearTimeout(S.fin); S.visible = true; S.error = false; S.mini = false;
    if (clave !== undefined) S.titulo = clave;
    el.msg.classList.remove('saliendo', 'error'); el.msg.hidden = false; pintar(); dato(false); rotar(true);
  },
  ocultar() {
    if (!el.msg && !nodos()) return;
    S.visible = false; rotar(false); pintar();
    if (el.msg.hidden) return;
    if (reduce) { el.msg.hidden = true; return; }
    el.msg.classList.add('saliendo'); clearTimeout(S.fin);
    S.fin = setTimeout(() => { if (!S.visible) { el.msg.hidden = true; el.msg.classList.remove('saliendo'); } }, 420);
  },
  error(clave) {
    if (!el.msg && !nodos()) return;
    clearTimeout(S.fin); S.visible = true; S.error = true; S.titulo = clave; rotar(false);
    el.msg.classList.remove('saliendo'); el.msg.classList.add('error'); el.msg.hidden = false; pintar();
  },
};

// arranca solo: la pantalla ya está a la vista desde el HTML
if (nodos()) { el.msg.classList.add('activa'); pintar(); dato(false); rotar(true); }
alCambiarIdioma(() => { pintar(); dato(false); });
