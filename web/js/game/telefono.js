// Teléfono y tableta: el juego se juega de costado, con un botón grande bajo el pulgar (el #zona de juego.html) y sin
// teclado. Este módulo no sabe nada del juego: lo carga juego.html por su cuenta (y main.js lo puede importar: es el mismo).
// - En vertical (teléfono) se ve «Gira el teléfono» con un dibujo (#girar); `telefono.vertical` y `telefono.horizontal()`
//   le dicen a main.js que no dibuje ni calibre mientras tanto.
// - El botón se hunde con cada dedo (varios dedos cuentan como toques: cada puntero es un contacto en input.js).
// - Pantalla completa y orientación horizontal al tocar un botón con `data-completa` (o con telefono.pantallaCompleta()
//   desde el manejador de un toque): Android sí; el iPhone no deja y el juego se ve igual con las barras de Safari.
// - Sin zoom, sin desplazar la página, sin selección de texto ni menú contextual, salvo en los campos.
// - Campos (nombre, mail, encuesta): con el teclado de pantalla abierto el panel se acomoda al espacio visible y el campo
//   queda a la vista; input.js no toma Espacio ni Enter mientras el foco está en un campo.
import { esCampo } from './input.js';

/** Textos propios (si el módulo de textos tiene las claves `girar.titulo` y `girar.sub`, mandan esas). */
const TXT = {
  es: { titulo: 'Gira el teléfono', sub: 'Tarima se juega de costado.' },
  en: { titulo: 'Turn your phone sideways', sub: 'Tarima is played in landscape.' },
};
const MQ = {
  tactil: '(pointer:coarse)',
  // el mismo criterio que juego.css: un teléfono en vertical (una tableta en vertical se juega igual, con el botón abajo)
  vertical: '(pointer:coarse) and (orientation:portrait) and (max-width:600px)',
};
const mq = k => (typeof matchMedia === 'function' ? matchMedia(MQ[k]) : { matches: false, addEventListener() {} });
const guardado = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

let instalado = false, traducir = null;
const oyentes = new Set();

function idioma() { return (document.documentElement.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'; }
function texto(clave) {
  if (traducir) { try { const v = traducir('girar.' + clave); if (v && v !== 'girar.' + clave && !String(v).includes('{')) return v; } catch { /* sin la clave */ } }
  return TXT[idioma()][clave];
}
function pintarTextos() {
  const t = document.getElementById('girar-t'), s = document.getElementById('girar-s');
  if (t) t.textContent = texto('titulo'); if (s) s.textContent = texto('sub');
}

function pantallaActiva() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

export const telefono = {
  /** Puntero grueso (teléfono o tableta). */
  get tactil() { return mq('tactil').matches; },
  /** Teléfono en vertical: se ve «Gira el teléfono» y no hace falta dibujar el 3D. */
  get vertical() { return mq('vertical').matches; },
  /** Está en pantalla completa. */
  get completa() { return !!pantallaActiva(); },
  /** Mano del botón: 'der' (por defecto) o 'izq'. Con argumento la cambia y la recuerda en este dispositivo. */
  mano(lado) {
    if (lado === 'izq' || lado === 'der') { guardado.set('tarima.mano', lado); document.documentElement.classList.toggle('zurdo', lado === 'izq'); }
    return document.documentElement.classList.contains('zurdo') ? 'izq' : 'der';
  },
  /** Se resuelve cuando el teléfono está de costado (al toque si ya lo está, o si no es un teléfono). */
  horizontal() {
    if (!this.vertical) return Promise.resolve();
    return new Promise(res => { const f = () => { if (!this.vertical) { oyentes.delete(f); res(); } }; oyentes.add(f); });
  },
  /** Llama a `cb(vertical)` cada vez que el teléfono gira. Devuelve cómo dejar de escuchar. */
  alGirar(cb) { const f = () => cb(this.vertical); oyentes.add(f); return () => oyentes.delete(f); },
  /**
   * Pantalla completa y horizontal fija, donde el navegador deja. Tiene que llamarse dentro del manejador de un toque o un
   * clic (el navegador lo exige). En una computadora no hace nada. Devuelve true si quedó en pantalla completa.
   */
  async pantallaCompleta() {
    if (!this.tactil) return false;
    const el = document.documentElement;
    try {
      if (!pantallaActiva()) {
        const pide = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!pide) return false;      // iPhone: Safari no tiene pantalla completa para la página
        await pide.call(el, { navigationUI: 'hide' });
      }
    } catch { return false; }
    try { await screen.orientation?.lock?.('landscape'); } catch { /* no todos dejan fijar la orientación */ }
    return !!pantallaActiva();
  },
  /**
   * Instala todo (lo hace solo al cargar el módulo). `t`: la función de textos del juego (clave → texto), para que el
   * aviso de girar use las claves `girar.titulo` y `girar.sub` si existen. Se puede llamar de nuevo para pasarla.
   */
  instalar({ t } = {}) {
    if (t) traducir = t;
    pintarTextos();
    if (instalado) return this;
    instalado = true;
    const html = document.documentElement, $ = id => document.getElementById(id);
    html.classList.toggle('tactil', this.tactil);
    const p = new URLSearchParams(location.search).get('mano');
    this.mano(p === 'izq' || p === 'der' ? p : guardado.get('tarima.mano') || 'der');

    // el idioma cambia sin recargar: el texto del aviso lo sigue
    new MutationObserver(pintarTextos).observe(html, { attributes: true, attributeFilter: ['lang'] });

    // girar: aviso por CSS; acá se avisa a quien escucha
    const avisar = () => { html.classList.toggle('vertical', this.vertical); for (const f of [...oyentes]) f(); };
    for (const k of ['vertical', 'tactil']) mq(k).addEventListener?.('change', () => { html.classList.toggle('tactil', this.tactil); avisar(); });
    addEventListener('orientationchange', avisar); avisar();

    // el botón se hunde mientras haya un dedo encima (el toque en sí lo toma input.js)
    const zona = $('zona'), dedos = new Set();
    const suelta = e => { if (dedos.delete(e.pointerId) && !dedos.size) zona?.classList.remove('hunde'); };
    zona?.addEventListener('pointerdown', e => { dedos.add(e.pointerId); zona.classList.add('hunde'); });
    addEventListener('pointerup', suelta); addEventListener('pointercancel', suelta);
    addEventListener('blur', () => { dedos.clear(); zona?.classList.remove('hunde'); });

    // pantalla completa al tocar un botón marcado (el de Jugar)
    document.addEventListener('click', e => { if (e.target.closest?.('[data-completa]')) this.pantallaCompleta(); }, true);
    const marca = () => html.classList.toggle('completa', !!pantallaActiva());
    document.addEventListener('fullscreenchange', marca); document.addEventListener('webkitfullscreenchange', marca);

    // nada de zoom, desplazamiento, selección ni menú contextual fuera de los campos y del contenido de un panel
    const libre = el => esCampo(el) || !!el?.closest?.('.panel');
    document.addEventListener('gesturestart', e => e.preventDefault());                       // pellizco en Safari
    document.addEventListener('dblclick', e => { if (!esCampo(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !libre(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', e => { if (!esCampo(e.target)) e.preventDefault(); });
    document.addEventListener('selectstart', e => { if (!esCampo(e.target)) e.preventDefault(); });

    // campos con el teclado de pantalla: el panel se acomoda a lo visible y el campo queda a la vista
    const vv = window.visualViewport;
    const medir = () => { if (!vv) return; html.style.setProperty('--vvh', vv.height + 'px'); html.style.setProperty('--vvy', vv.offsetTop + 'px'); };
    vv?.addEventListener('resize', medir); vv?.addEventListener('scroll', medir); medir();
    let tCampo = 0;
    document.addEventListener('focusin', e => {
      if (!esCampo(e.target)) return;
      html.classList.add('escribiendo'); clearTimeout(tCampo);
      // el teclado tarda en abrir: se espera a que cambie el espacio visible y se centra el campo en su panel
      tCampo = setTimeout(() => { medir(); try { e.target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* navegador viejo */ } }, 320);
    });
    document.addEventListener('focusout', () => { setTimeout(() => { if (!esCampo(document.activeElement)) { html.classList.remove('escribiendo'); medir(); } }, 0); });
    return this;
  },
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => telefono.instalar(), { once: true });
  else telefono.instalar();
}
