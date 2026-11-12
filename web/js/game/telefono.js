// Teléfono y tableta: el juego se juega de costado, con un botón grande bajo el pulgar (el #zona de juego.html) y sin
// teclado. Este módulo no sabe nada del juego: lo carga juego.html por su cuenta (y main.js lo importa: es el mismo).
// - De costado: html.horiz (y html.bajo si el alto que queda es de teléfono, 600 px o menos). Las reglas de juego.css y
//   bienvenida.css cuelgan de esas clases y no de (orientation:landscape), porque…
// - …en vertical (teléfono con la rotación trabada, o que todavía no giró) el contenido se gira 90° (html.rotado): #app
//   toma como ancho el alto de la pantalla y se rota, así se juega con el teléfono acostado igual. Si el teléfono rota de
//   verdad, se usa la orientación real. El lienzo mide su tamaño sin transformar (clientWidth/Height) y los toques no
//   usan coordenadas, así que el 3D y la entrada no cambian. Antes se bloqueaba con «Gira el teléfono».
// - El botón se hunde con cada dedo (varios dedos cuentan como toques: cada puntero es un contacto en input.js).
// - Pantalla completa y orientación horizontal al tocar un botón con `data-completa` (o con telefono.pantallaCompleta()
//   desde el manejador de un toque): Android sí. El iPhone no deja (ningún navegador: todos usan WebKit); ahí el juego se
//   ve igual con las barras, y un aviso de una vez explica cómo instalarlo en la pantalla de inicio (manifest.webmanifest),
//   que sí abre a pantalla completa.
// - Campos (nombre, correo, encuesta) en un teléfono: no se escribe en el panel (el teclado lo tapa y, con el contenido
//   girado, el texto quedaría de costado). Al tocar el campo se abre un editor arriba de lo visible, derecho, grande, con
//   «Listo»; al cerrarlo el texto vuelve al campo. input.js no toma Espacio ni Enter mientras el foco está en un campo.
// - Sin zoom, sin desplazar la página, sin selección de texto ni menú contextual, salvo en los campos.
import { esCampo } from './input.js';

const TXT = {
  es: { listo: 'Listo', instalar: 'Para jugar a pantalla completa: toca Compartir y después «Agregar a inicio».', ok: 'Entendido' },
  en: { listo: 'Done', instalar: 'To play full screen: tap Share, then “Add to Home Screen”.', ok: 'Got it' },
};
const CLAVES = { listo: 'campo.listo', instalar: 'instalar.ios', ok: 'instalar.cerrar' };
const MQ = { tactil: '(pointer:coarse)', retrato: '(orientation:portrait)' };
const mq = k => (typeof matchMedia === 'function' ? matchMedia(MQ[k]) : { matches: false, addEventListener() {} });
const guardado = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

let instalado = false, traducir = null;
const oyentes = new Set();
function idioma() { return (document.documentElement.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'; }
function texto(k) {
  if (traducir) { try { const v = traducir(CLAVES[k]); if (v && v !== CLAVES[k] && !String(v).includes('{')) return v; } catch { /* sin la clave */ } }
  return TXT[idioma()][k];
}
function pantallaActiva() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instaladaComoApp = () => navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);

/** Medidas de lo visible (sin las barras del navegador ni el teclado), en píxeles CSS. */
function visible() { const v = window.visualViewport; return { w: v ? v.width : innerWidth, h: v ? v.height : innerHeight, y: v ? v.offsetTop : 0 }; }

export const telefono = {
  /** Puntero grueso (teléfono o tableta). */
  get tactil() { return mq('tactil').matches; },
  /** Teléfono en vertical (pantalla de 600 px o menos de ancho): el contenido va girado. */
  get rotado() { return this.tactil && mq('retrato').matches && Math.min(innerWidth, innerHeight) <= 600; },
  /** Ya no hay pantalla que bloquee el juego en vertical (se gira el contenido): queda en false para quien lo pregunte. */
  get vertical() { return false; },
  /** Está en pantalla completa. */
  get completa() { return !!pantallaActiva(); },
  /** Mano del botón: 'der' (por defecto) o 'izq'. Con argumento la cambia y la recuerda en este dispositivo. */
  mano(lado) {
    if (lado === 'izq' || lado === 'der') { guardado.set('tarima.mano', lado); document.documentElement.classList.toggle('zurdo', lado === 'izq'); }
    return document.documentElement.classList.contains('zurdo') ? 'izq' : 'der';
  },
  /** Se resuelve cuando se puede jugar (ahora siempre: en vertical se gira el contenido). */
  horizontal() { return Promise.resolve(); },
  /** Llama a `cb(rotado)` cada vez que el teléfono gira o cambia lo visible. Devuelve cómo dejar de escuchar. */
  alGirar(cb) { const f = () => cb(this.rotado); oyentes.add(f); return () => oyentes.delete(f); },
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
        if (!pide) { this.avisoInstalar(); return false; }      // iPhone: ningún navegador deja; se explica cómo instalarlo
        await pide.call(el, { navigationUI: 'hide' });
      }
    } catch { this.avisoInstalar(); return false; }
    try { await screen.orientation?.lock?.('landscape'); } catch { /* no todos dejan fijar la orientación */ }
    this.medir(); return !!pantallaActiva();
  },
  /** En el iPhone, una vez: cómo jugar a pantalla completa (Compartir → Agregar a inicio). Cerrable, en los dos idiomas. */
  avisoInstalar(forzar = false) {
    const el = document.getElementById('instalar');
    if (!el || (!forzar && (!esIOS() || instaladaComoApp() || guardado.get('tarima.instalar') === '1'))) return false;
    el.querySelector('#instalar-t').textContent = texto('instalar'); el.querySelector('#instalar-ok').textContent = texto('ok');
    el.hidden = false; return true;
  },
  /** Recalcula giro, medidas y clases (lo hace solo con cada cambio de tamaño u orientación). */
  medir() {
    const html = document.documentElement, v = visible(), rot = this.rotado, tac = this.tactil;
    html.classList.toggle('tactil', tac); html.classList.toggle('rotado', rot);
    // con el contenido girado, el ancho del juego es el alto de la pantalla
    const w = rot ? v.h : v.w, h = rot ? v.w : v.h;
    html.style.setProperty('--app-w', w + 'px'); html.style.setProperty('--app-h', h + 'px'); html.style.setProperty('--app-tx', v.w + 'px');
    html.style.setProperty('--vvh', v.h + 'px'); html.style.setProperty('--vvy', v.y + 'px');
    html.classList.toggle('horiz', tac && w > h); html.classList.toggle('bajo', tac && w > h && h <= 600);
    for (const f of [...oyentes]) f();
  },
  /**
   * Instala todo (lo hace solo al cargar el módulo). `t`: la función de textos del juego (clave → texto), para el editor y
   * el aviso de instalar. Se puede llamar de nuevo para pasarla.
   */
  instalar({ t } = {}) {
    if (t) traducir = t;
    if (instalado) return this;
    instalado = true;
    const html = document.documentElement, $ = id => document.getElementById(id);
    const p = new URLSearchParams(location.search).get('mano');
    this.mano(p === 'izq' || p === 'der' ? p : guardado.get('tarima.mano') || 'der');

    // giro y medidas: con cada cambio de tamaño, de orientación o de lo visible (barras de Safari, teclado)
    let tm = 0; const pide = () => { cancelAnimationFrame(tm); tm = requestAnimationFrame(() => this.medir()); };
    for (const k of ['tactil', 'retrato']) mq(k).addEventListener?.('change', pide);
    addEventListener('resize', pide); addEventListener('orientationchange', () => { pide(); setTimeout(pide, 300); });
    window.visualViewport?.addEventListener('resize', pide); window.visualViewport?.addEventListener('scroll', pide);
    this.medir();

    // el botón se hunde mientras haya un dedo encima (el toque en sí lo toma input.js)
    const zona = $('zona'), dedos = new Set();
    const suelta = e => { if (dedos.delete(e.pointerId) && !dedos.size) zona?.classList.remove('hunde'); };
    zona?.addEventListener('pointerdown', e => { dedos.add(e.pointerId); zona.classList.add('hunde'); });
    addEventListener('pointerup', suelta); addEventListener('pointercancel', suelta);
    addEventListener('blur', () => { dedos.clear(); zona?.classList.remove('hunde'); });

    // pantalla completa al tocar un botón marcado (Jugar, Saltar la práctica, Jugar otra vez)
    document.addEventListener('click', e => { if (e.target.closest?.('[data-completa]')) this.pantallaCompleta(); }, true);
    const marca = () => { html.classList.toggle('completa', !!pantallaActiva()); pide(); };
    document.addEventListener('fullscreenchange', marca); document.addEventListener('webkitfullscreenchange', marca);
    $('instalar-ok')?.addEventListener('click', () => { guardado.set('tarima.instalar', '1'); $('instalar').hidden = true; });

    // nada de zoom, desplazamiento, selección ni menú contextual fuera de los campos y del contenido de un panel
    const libre = el => esCampo(el) || !!el?.closest?.('.panel,#editor');
    document.addEventListener('gesturestart', e => e.preventDefault());                       // pellizco en Safari
    document.addEventListener('dblclick', e => { if (!esCampo(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !libre(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', e => { if (!esCampo(e.target)) e.preventDefault(); });
    document.addEventListener('selectstart', e => { if (!esCampo(e.target)) e.preventDefault(); });

    this._editor();
    return this;
  },

  /**
   * Editor de campos en el teléfono: el campo del panel queda de solo lectura (no abre el teclado); al tocarlo se abre
   * #editor arriba de lo visible, derecho aunque el contenido esté girado, con su etiqueta, el texto y «Listo». Enter o
   * «Listo» devuelven el texto al campo (con los eventos input y change) y lo cierran.
   */
  _editor() {
    const ed = document.getElementById('editor'), campo = document.getElementById('editor-campo'), listo = document.getElementById('editor-listo'), titulo = document.getElementById('editor-t');
    if (!ed || !campo) return;
    let origen = null;
    const enApp = el => esCampo(el) && !!el.closest?.('#app') && el.type !== 'hidden';
    // los campos del juego, de solo lectura con el dedo (el editor escribe por ellos)
    const marcar = raiz => { if (!this.tactil) return; for (const el of raiz.querySelectorAll?.('input,textarea') || []) if (enApp(el) && !el.dataset.editor) { el.dataset.editor = '1'; el.readOnly = true; } };
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) marcar(n); }).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
    const abrir = el => {
      origen = el;
      titulo.textContent = el.closest('label')?.querySelector('span')?.textContent || el.getAttribute('aria-label') || el.placeholder || '';
      listo.textContent = texto('listo');
      campo.type = el.tagName === 'TEXTAREA' ? 'text' : el.type || 'text';
      for (const a of ['inputmode', 'autocomplete', 'autocapitalize', 'maxlength', 'placeholder', 'spellcheck', 'enterkeyhint']) { const v = el.getAttribute(a); if (v === null) campo.removeAttribute(a); else campo.setAttribute(a, v); }
      campo.value = el.value; ed.hidden = false; document.documentElement.classList.add('escribiendo', 'editando');
      campo.focus(); try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch { /* type=email no deja */ }
      el.dispatchEvent(new Event('focus'));      // quien mide el primer foco (mail_foco) se entera
    };
    const cerrar = () => {
      if (!origen) return; const el = origen; origen = null;
      if (el.value !== campo.value) { el.value = campo.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      ed.hidden = true; campo.blur(); document.documentElement.classList.remove('escribiendo', 'editando');
      el.dispatchEvent(new Event('blur'));
    };
    document.addEventListener('click', e => { const el = e.target; if (this.tactil && enApp(el) && el.dataset.editor) { e.preventDefault(); abrir(el); } }, true);
    listo.addEventListener('click', cerrar);
    campo.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); cerrar(); } else if (e.key === 'Escape') { e.preventDefault(); cerrar(); } });
    campo.addEventListener('blur', () => setTimeout(() => { if (origen && document.activeElement !== campo && document.activeElement !== listo) cerrar(); }, 150));
    marcar(document);
  },
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => telefono.instalar(), { once: true });
  else telefono.instalar();
}
