// Métricas de Tarima con PostHog (docs/MVP.md 6). posthog-js va vendorizado en web/vendor/posthog/ y se carga solo si
// /api/estado devuelve la clave pública (`metricas.clave`). Todo pasa por el proxy del mismo sitio (/qx).
//
// Reglas:
// - Sin cookies ni almacenamiento de medición: persistence 'memory'. El id de PostHog cambia en cada carga de página.
//   `consentir()` existe para el día que haya un aviso de consentimiento; hoy nadie lo llama.
// - person_profiles 'identified_only': solo los anotados tienen perfil (identify con su lista_id, nunca el correo).
// - No-op sin clave, con `?metricas=0` o con la medición desactivada en la página de privacidad (`tarima.medicion` = 0).
//   Igual, cada evento queda en `window.JUEGO.eventos` para que las pruebas puedan afirmar el embudo.
// - Ningún evento lleva nombre, correo, IP ni dispositivo: las propiedades con esos nombres o con una «@» se descartan.
// - Las banderas (6.5) las evalúa el Worker: llegan en /api/estado y se pasan como bootstrap y como `$feature/<bandera>`.
// - La encuesta va por la API de Surveys: el juego manda `survey shown` y `survey dismissed`; `survey sent` lo manda el
//   Worker con las respuestas (5.4).
// - Grabación de sesión (6.6): solo en una parte de las cargas, según la bandera `grabacion` (off · tercio · todas),
//   decidido una vez por carga, que con la persistencia en memoria es una sesión de PostHog. Graba la página (paneles,
//   botones, textos, toques), nunca el lienzo 3D; los campos van tapados y el texto que tenga el nombre del jugador o
//   una «@» también. Los nodos que cambian en cada cuadro (la señal del intento) quedan fuera (BLOQUEO_GRABACION).
//   Sin medición no hay grabación. El grabador (web/vendor/posthog/lazy-recorder.js) se descarga solo si se graba.
//
// Uso (lo conecta main.js):
//   import { analitica } from './analitica.js';
//   analitica.ev('juego_abierto', { carga_ms, pantalla_inicial });     // se puede llamar antes de iniciar(): queda en cola
//   await analitica.iniciar({ estado, idioma, idioma_origen, version });  // con la respuesta de servidor.estado()
//   analitica.visita('muro');  analitica.identificar(lista_id);  analitica.bandera('muro-texto')
//   analitica.idSesion()   // para el campo `sesion` de /api/anotar y /api/encuesta

export const EVENTOS = new Set([
  'juego_abierto', 'carga_lista', 'idioma_cambiado', 'nombre_puesto', 'pesista_elegido', 'opciones_abiertas',
  'tutorial_inicio', 'tutorial_fin', 'tutorial_salteado', 'partida_pedida', 'final_inicio', 'intento_propio', 'final_fin',
  'compartir', 'invitacion_vista', 'invitacion_abierta', 'invitacion_cerrada', 'muro_visto', 'muro_ahora_no', 'mail_foco',
  'anotar_envio', 'anotar_ok', 'anotar_error', 'survey shown', 'encuesta_enviada', 'survey dismissed', 'privacidad_abierta',
  'medicion_desactivada', 'error_juego',
]);

export const BANDERAS = { 'muro-partidas-gratis': '2', 'muro-texto': 'a', 'invitacion-podio1': 'on', grabacion: 'tercio' };

/** Qué parte de las cargas se graba según la bandera `grabacion` (worker/src/reglas.js). Un valor desconocido no graba. */
export const GRABACION = { off: 0, tercio: 1 / 3, todas: 1 };
export const proporcionGrabacion = v => (typeof v === 'string' && Object.hasOwn(GRABACION, v) ? GRABACION[v] : 0);

/**
 * Lo que la grabación no mira (se ve como una caja vacía del mismo tamaño): los lienzos (el 3D y las ayudas) y los nodos
 * que cambian en cada cuadro durante el intento (#senal: escala, opacidad y anillos por cuadro; #acuse y #depura).
 * Así el grabador no procesa una mutación por cuadro mientras se levanta.
 */
export const BLOQUEO_GRABACION = 'canvas, #senal, #acuse, #depura';

/** Campos de la página cuyo valor es el nombre del jugador mientras lo escribe (bienvenida y editor del teléfono). */
const CAMPOS_NOMBRE = ['nombre', 'editor-campo'];

const normal = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/**
 * El nombre tal como lo muestra el juego: solo letras (de cualquier idioma), espacios, guion y apóstrofo, la misma regla
 * que `limpiarNombre` de main.js (sin el tope de largo: si se pasa, el juego muestra el nombre de siempre). Lo que se
 * escribe en el campo («Juan.», «Lucía 🙂») y lo que aparece en el título («Juan», «Lucía») pueden ser distintos.
 */
export const LETRA_DE_NOMBRE = /[\p{L}\p{M} '’-]/u;
export const nombreVisible = s => [...String(s ?? '').normalize('NFC')].filter(c => LETRA_DE_NOMBRE.test(c)).join('').replace(/\s+/g, ' ').trim();

/**
 * Texto de la página tal como va a la grabación: tapado con «*» si tiene una «@» (un correo) o alguno de los nombres
 * (el guardado o el que se está escribiendo, de 2 letras o más); si no, igual. Los campos los tapa maskAllInputs.
 */
export function taparTexto(texto, nombres = []) {
  const t = String(texto ?? '');
  const n = normal(t);
  if (n.includes('@') || nombres.some(x => x && n.includes(x))) return t.replace(/\S/g, '*');
  return t;
}

/** Atributos que hacen a la forma de la página y no llevan texto del jugador (el CSS tiene «@media», por eso va aparte). */
const ATRIBUTOS_DE_FORMA = new Set(['class', 'style', '_cssText', 'id', 'src', 'srcset', 'href', 'rel', 'type', 'for', 'role', 'hidden', 'disabled', 'lang', 'dir', 'tabindex', 'width', 'height', 'viewBox', 'd', 'fill', 'stroke', 'transform']);

/**
 * Atributo tal como va a la grabación. `value` siempre tapado: maskAllInputs tapa el valor actual del campo, pero si el
 * campo está vacío rrweb deja el atributo del HTML (`value="<nombre guardado>"`, `value="<correo>"`). El resto (data-*,
 * title, aria-*, placeholder…) con la misma regla que el texto: tapado si tiene una «@» o el nombre del jugador.
 */
export function taparAtributo(atributo, valor, nombres = []) {
  if (typeof valor !== 'string' || !valor) return valor;
  if (atributo === 'value') return valor.replace(/\S/g, '*');
  if (ATRIBUTOS_DE_FORMA.has(atributo) || atributo.startsWith('rr_')) return valor;
  return taparTexto(valor, nombres);
}

const PROHIBIDAS = /^(nombre|name|email|mail|correo|ip|\$ip|dispositivo|device|lista_id|telefono|phone)$/i;
const CLAVE_PUBLICA = 'tarima.clave_publica';   // sessionStorage: solo para mandar `medicion_desactivada` desde la privacidad
const MAX_COLA = 200;

function almacen(s) {
  return {
    get(k) { try { return s ? s.getItem(k) : null; } catch { return null; } },
    set(k, v) { try { if (s) s.setItem(k, String(v)); } catch { /* sin almacenamiento */ } },
    del(k) { try { if (s) s.removeItem(k); } catch { /* sin almacenamiento */ } },
  };
}

/** Propiedades limpias: solo valores simples, sin datos personales. */
export function limpiarProps(props) {
  const out = {};
  if (!props || typeof props !== 'object') return out;
  for (const [k, v] of Object.entries(props)) {
    if (PROHIBIDAS.test(k)) continue;
    if (v === undefined || typeof v === 'function') continue;
    if (v !== null && typeof v === 'object') continue;
    if (typeof v === 'string') { if (v.includes('@')) continue; out[k] = v.slice(0, 200); continue; }
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out;
}

/** Click-ids que ponen las redes y los avisos en el link: dicen de dónde vino aunque el navegador no mande el referente. */
const CLICK_IDS = [['fbclid', 'facebook'], ['igshid', 'instagram'], ['ttclid', 'tiktok'], ['twclid', 'x'], ['gclid', 'google_ads'],
  ['gbraid', 'google_ads'], ['wbraid', 'google_ads'], ['msclkid', 'bing_ads'], ['li_fat_id', 'linkedin'], ['rdt_cid', 'reddit'], ['sccid', 'snapchat']];
/** Dominio del referente → fuente. Solo el nombre del sitio, nunca la dirección completa. */
const REFERENTES = [[/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'], [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'], [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'], [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'telegram'], [/(^|\.)discord(app)?\.com$/, 'discord'], [/^(www\.)?google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo']];

/** Nombre del sitio del referente («l.instagram.com»), o '' si no hay o es el propio juego. */
export function dominioReferente(referente, origen = '') {
  try {
    const u = new URL(referente);
    if (!/^https?:$/.test(u.protocol)) return '';
    if (origen && u.origin === new URL(origen).origin) return '';
    return u.hostname.toLowerCase().slice(0, 80);
  } catch { return ''; }
}

/**
 * `fuente_trafico`: utm_source si viene; «compartido» con ?c=; si no, la red según el click-id del link (fbclid → facebook)
 * o según el sitio del que vino; «directo» si no hay nada.
 */
export function fuenteTrafico(buscar, referente = '', origen = '') {
  const p = new URLSearchParams(buscar || '');
  const utm = (p.get('utm_source') || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
  if (utm) return utm;
  if (p.has('c')) return 'compartido';
  for (const [k, f] of CLICK_IDS) if (p.has(k)) return f;
  const d = dominioReferente(referente, origen);
  if (d) { for (const [re, f] of REFERENTES) if (re.test(d)) return f; return 'otro_sitio'; }
  return 'directo';
}

/**
 * Lo mínimo para encontrar un error sin mandar texto libre largo: mensaje recortado (sin direcciones de mail ni
 * parámetros de URL), archivo (solo el nombre), línea y columna.
 */
export function detalleError(e, ev = null) {
  const msgCrudo = String((e && (e.message ?? (typeof e === 'string' ? e : ''))) || ev?.message || '');
  const mensaje = msgCrudo.replace(/[^\s@]+@[^\s@]+/g, '[mail]').replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 160);
  let archivo = ev?.filename || '', linea = ev?.lineno || null, col = ev?.colno || null;
  if (!archivo && typeof e?.stack === 'string') {
    const m = e.stack.match(/(?:https?:\/\/[^\s)]*\/)?([^\s/()]+\.m?js)(?:\?[^\s:)]*)?:(\d+):(\d+)/);
    if (m) { archivo = m[1]; linea = +m[2]; col = +m[3]; }
  }
  archivo = String(archivo).split(/[?#]/)[0].split('/').pop().slice(0, 60);
  const out = { mensaje: mensaje || null, archivo: archivo || null, linea: Number.isFinite(linea) ? linea : null, col: Number.isFinite(col) ? col : null };
  return out;
}

export function crearAnalitica(o = {}) {
  const g = globalThis;
  const ventana = o.ventana !== undefined ? o.ventana : (typeof window !== 'undefined' ? window : null);
  const cargar = o.cargar || (() => import('../../vendor/posthog/module.js').then(m => m.default || m.posthog));
  const local = almacen(o.local !== undefined ? o.local : (() => { try { return g.localStorage; } catch { return null; } })());
  const sesion = almacen(o.sesion !== undefined ? o.sesion : (() => { try { return g.sessionStorage; } catch { return null; } })());
  const buscar = o.buscar ?? ventana?.location?.search ?? '';
  const origen = o.origen ?? ventana?.location?.origin ?? '';
  const referente = o.referente ?? (() => { try { return ventana?.document?.referrer || ''; } catch { return ''; } })();
  const ahora = o.ahora || (() => Date.now());
  const azar = o.azar || Math.random;
  const cargarGrabador = o.cargarGrabador || (() => scriptGrabador(ventana));

  let estado = 'esperando';   // esperando | activa | apagada
  let ph = null;
  let flags = { ...BANDERAS };
  let anonimo = null;
  let grabar = false;
  const cola = [];
  const avisados = new Set();

  const registro = () => {
    if (!ventana) return null;
    ventana.JUEGO = ventana.JUEGO || {};
    ventana.JUEGO.eventos = ventana.JUEGO.eventos || [];
    return ventana.JUEGO.eventos;
  };

  const apagadaPorUsuario = () => local.get('tarima.medicion') === '0' || new URLSearchParams(buscar).get('metricas') === '0';

  function ev(nombre, props = {}) {
    if (typeof nombre !== 'string' || !nombre) return;
    if (!EVENTOS.has(nombre) && !avisados.has(nombre)) { avisados.add(nombre); g.console?.warn?.(`analitica: evento fuera de la lista de docs/MVP.md 6.3: ${nombre}`); }
    const p = limpiarProps(props);
    const t = ahora();
    const reg = registro();
    if (reg) reg.push({ ev: nombre, props: p, t });
    if (estado === 'apagada') return;
    if (estado === 'esperando') { if (cola.length < MAX_COLA) cola.push(['ev', nombre, p, t]); return; }
    try { ph.capture(nombre, p); } catch { /* la medición nunca rompe el juego */ }
  }

  /** Liga la sesión al número interno de la lista (nunca el correo). Llamar antes de `anotar_ok`. */
  function identificar(lista_id) {
    if (typeof lista_id !== 'string' || !/^[0-9a-f]{8,64}$/i.test(lista_id)) return;
    if (estado === 'esperando') { cola.push(['id', lista_id]); return; }
    if (estado === 'activa') { try { ph.identify(lista_id); } catch { /* nada */ } }
  }

  /** Pantalla actual como súper propiedad: así `$pageleave` dice dónde se fue la gente. */
  function visita(pantalla) {
    if (typeof pantalla !== 'string') return;
    if (estado === 'esperando') { cola.push(['reg', { pantalla }]); return; }
    if (estado === 'activa') { try { ph.register({ pantalla }); } catch { /* nada */ } }
  }

  /**
   * Decide si hay medición y la arranca. `estado` es la respuesta de servidor.estado().
   * Devuelve true si PostHog quedó activo.
   */
  async function iniciar({ estado: est = {}, idioma, idioma_origen, version, pantalla } = {}) {
    if (est && est.flags && typeof est.flags === 'object') flags = { ...BANDERAS, ...est.flags };
    const m = est?.metricas;
    const clave = m && typeof m.clave === 'string' && /^phc_[A-Za-z0-9]+$/.test(m.clave) ? m.clave : null;
    if (m && typeof m.encuesta === 'string' && m.encuesta) encuestaId = m.encuesta;
    if (estado !== 'esperando') return estado === 'activa';
    if (!clave || apagadaPorUsuario() || !ventana) { apagar(); return false; }
    sesion.set(CLAVE_PUBLICA, clave);
    // Grabación: se sortea una vez por carga. El grabador va antes de init (si no, posthog-js lo pediría a /static/).
    const p = proporcionGrabacion(flags.grabacion);
    grabar = p > 0 && azar() < p;
    try {
      [ph] = await Promise.all([cargar(), grabar ? cargarGrabador().catch(() => { grabar = false; }) : null]);
      // Si mientras se descargaba se apagó la medición (apagar() o el interruptor en otra pestaña), no se arranca.
      if (estado !== 'esperando' || apagadaPorUsuario()) { grabar = false; if (estado === 'esperando') apagar(); return false; }
      if (grabar) configGrabacionRemota(ventana, clave);
      const banderasProps = Object.fromEntries(Object.entries(flags).map(([k, v]) => [`$feature/${k}`, String(v)]));
      ph.init(clave, {
        api_host: origen + (m.host || '/qx'),
        ui_host: m.ui || 'https://us.posthog.com',
        persistence: 'memory',                  // nada en cookies ni en almacenamiento: no hace falta aviso de cookies
        person_profiles: 'identified_only',
        autocapture: false, capture_pageview: true, capture_pageleave: true,   // $pageview: lo necesitan Web analytics y los embudos por página
        rageclick: false, capture_dead_clicks: false, capture_heatmaps: false, capture_performance: false,
        capture_exceptions: false, disable_session_recording: !grabar, disable_surveys: true,
        disable_surveys_automatic_display: true, disable_web_experiments: true, disable_product_tours: true,
        disable_conversations: true, disable_external_dependency_loading: true,
        advanced_disable_flags: true, advanced_disable_decide: true, advanced_disable_feature_flags: true,
        bootstrap: { featureFlags: flags },
        mask_all_text: true, mask_all_element_attributes: true, save_referrer: false,
        enable_recording_console_log: false,
        session_recording: opcionesGrabacion(() => nombresDelJugador()),
      });
      ph.register(limpiarProps({
        idioma, idioma_origen, version,
        tactil: !!(ventana.matchMedia && ventana.matchMedia('(pointer: coarse)').matches),
        pais: est?.contexto?.pais ?? null, previas: est?.contexto?.previas ?? null, dias: est?.contexto?.dias ?? null,
        fuente_trafico: fuenteTrafico(buscar, referente, origen), referente: dominioReferente(referente, origen) || null,
        pantalla, grabada: grabar, gratis_etapa: est?.regla?.etapa ?? null, ...banderasProps,
        // Sin IP del jugador (el proxy no la manda), PostHog ubicaría a todos en el país del servidor de Cloudflare: el país real va en `pais`.
        $geoip_disable: true,
      }));
      estado = 'activa';
      // La privacidad se abre en otra pestaña: si ahí se desactiva la medición, esta carga deja de medir y de grabar.
      try { ventana.addEventListener?.('storage', e => { if (e?.key === 'tarima.medicion' && e.newValue === '0') apagar(); }); } catch { /* nada */ }
    } catch {
      grabar = false;
      apagar();
      return false;
    }
    if (est?.lista_id) cola.unshift(['id', est.lista_id]);
    for (const op of cola.splice(0)) {
      try {
        if (op[0] === 'ev') ph.capture(op[1], op[2], { timestamp: new Date(op[3]) });
        else if (op[0] === 'id') identificar(op[1]);
        else if (op[0] === 'reg') ph.register(op[1]);
      } catch { /* nada */ }
    }
    return true;
  }

  /** Sin medición en esta carga (los eventos siguen yendo a window.JUEGO.eventos). Corta la grabación si había. */
  function apagar() {
    if (grabar && ph) { try { ph.stopSessionRecording(); } catch { /* nada */ } }
    grabar = false;
    estado = 'apagada';
    cola.length = 0;
  }

  /** Nombres que no pueden quedar en claro en la grabación: el guardado y el que se está escribiendo. */
  function nombresDelJugador() {
    const doc = ventana?.document;
    const out = [local.get('tarima.nombre'), ...CAMPOS_NOMBRE.map(id => { try { return doc?.getElementById(id)?.value; } catch { return null; } })];
    return [...new Set(out.flatMap(x => [normal(x), normal(nombreVisible(x))]))].filter(x => [...x].length >= 2);
  }

  const activa = () => estado === 'activa';
  /** true si esta carga se graba (sorteada, con medición y con el grabador cargado). */
  const grabando = () => estado === 'activa' && grabar;
  const bandera = nombre => flags[nombre] ?? BANDERAS[nombre] ?? null;

  /** Id para el campo `sesion` del Worker: el de PostHog si hay medición, si no uno al azar de esta carga. */
  function idSesion() {
    if (estado === 'activa') { try { const d = ph.get_distinct_id(); if (d) return String(d); } catch { /* nada */ } }
    if (!anonimo) anonimo = 'anon_' + (g.crypto?.randomUUID ? g.crypto.randomUUID() : String(Math.random()).slice(2));
    return anonimo;
  }

  // Encuesta por la API de Surveys de PostHog (5.4): el id viene de /api/estado (metricas.encuesta).
  let encuestaId = null;
  const encuestaVista = ({ id, con_premio } = {}) => { encuestaId = id || encuestaId; ev('survey shown', { $survey_id: encuestaId, con_premio: !!con_premio }); };
  const encuestaCerrada = () => ev('survey dismissed', { $survey_id: encuestaId });

  /** El día que haya un aviso de consentimiento: con un sí, PostHog puede guardar su id y unir visitas. */
  function consentir() {
    if (estado === 'activa') { try { ph.set_config({ persistence: 'localStorage+cookie' }); } catch { /* nada */ } }
  }

  /**
   * Interruptor de la página de privacidad. Antes de apagar manda `medicion_desactivada` (si hay PostHog en la página, por
   * PostHog; si no, con la clave que dejó el juego en esta pestaña, por sendBeacon al proxy). No llama a
   * opt_out_capturing(), que guarda su propia marca en el navegador: con `tarima.medicion` = 0 PostHog no se inicia.
   */
  function desactivarMedicion() {
    if (local.get('tarima.medicion') !== '0') {
      if (estado === 'activa') {
        try { ph.capture('medicion_desactivada', {}, { send_instantly: true, transport: 'sendBeacon' }); } catch { /* nada */ }
      } else {
        const clave = sesion.get(CLAVE_PUBLICA);
        const nav = ventana?.navigator;
        if (clave && /^phc_/.test(clave) && nav?.sendBeacon) {
          try {
            nav.sendBeacon(origen + '/qx/i/v0/e/', JSON.stringify({
              api_key: clave, event: 'medicion_desactivada', distinct_id: idSesion(),
              properties: { $process_person_profile: false, $lib: 'tarima-web' },
            }));
          } catch { /* nada */ }
        }
      }
      const reg = registro();
      if (reg) reg.push({ ev: 'medicion_desactivada', props: {}, t: ahora() });
    }
    local.set('tarima.medicion', '0');
    sesion.del(CLAVE_PUBLICA);
    apagar();
  }
  const activarMedicion = () => local.del('tarima.medicion');
  const medicionActivada = () => local.get('tarima.medicion') !== '0';

  /** `error_juego` desde window.onerror y promesas sin atrapar: tipo corto y `detalleError` (mensaje recortado, archivo, línea). Hasta 5 por carga. */
  function instalarErrores(pantallaActual = () => null) {
    if (!ventana?.addEventListener) return;
    let n = 0;
    const tipoDe = e => {
      const nombre = e && typeof e.name === 'string' ? e.name : '';
      return /^[A-Za-z]{1,40}$/.test(nombre) ? nombre : 'Error';
    };
    const mandar = (tipo, det) => { if (n++ < 5) ev('error_juego', { tipo, pantalla: pantallaActual(), ...det }); };
    ventana.addEventListener('error', e => mandar(tipoDe(e?.error), detalleError(e?.error, e)));
    ventana.addEventListener('unhandledrejection', e => mandar('promesa_' + tipoDe(e?.reason), detalleError(e?.reason)));
  }

  return {
    get estado() { return estado; },
    ev, identificar, visita, iniciar, apagar, activa, grabando, bandera, idSesion, encuestaVista, encuestaCerrada, consentir,
    desactivarMedicion, activarMedicion, medicionActivada, instalarErrores,
  };
}

/**
 * Opciones de `session_recording` de posthog-js. Lo del cliente gana sobre lo que diga el proyecto de PostHog, así que
 * aunque alguien prenda ahí el lienzo o afloje el enmascarado, acá sigue apagado y tapado.
 */
export function opcionesGrabacion(nombres = () => []) {
  return {
    maskAllInputs: true,                          // mail, nombre, respuesta libre: siempre «***»
    maskTextSelector: '*',                        // todo texto pasa por maskTextFn…
    maskTextFn: texto => taparTexto(texto, nombres()),   // …que tapa solo lo del jugador
    maskAttributeFn: (atributo, valor) => taparAtributo(atributo, valor, nombres()),   // value, data-v del correo sugerido…
    blockSelector: BLOQUEO_GRABACION,
    captureCanvas: { recordCanvas: false },       // nunca el 3D: le quitaría fluidez al juego
    recordHeaders: false, recordBody: false,      // nada de la red
    recordCrossOriginIframes: false,
    collectFonts: false,
  };
}

/**
 * Configuración «remota» de la grabación puesta a mano antes de init. Con advanced_disable_flags posthog-js no pide la
 * configuración del proyecto; la toma de window._POSTHOG_REMOTE_CONFIG (como el array.js de cada proyecto). Sin flags
 * ni compresión extra, sin consola, sin red y sin lienzo. Las grabaciones van a /qx/s/.
 */
export function configGrabacionRemota(ventana, clave) {
  if (!ventana) return;
  const previo = ventana._POSTHOG_REMOTE_CONFIG && typeof ventana._POSTHOG_REMOTE_CONFIG === 'object' ? ventana._POSTHOG_REMOTE_CONFIG : {};
  ventana._POSTHOG_REMOTE_CONFIG = {
    ...previo,
    [clave]: { config: {
      hasFeatureFlags: false, capturePerformance: false, autocapture_opt_out: true, heatmaps: false, surveys: false,
      sessionRecording: { endpoint: '/s/', recordCanvas: false, consoleLogRecordingEnabled: false, networkPayloadCapture: { recordHeaders: false, recordBody: false } },
    } },
  };
}

/** Carga web/vendor/posthog/lazy-recorder.js con una etiqueta <script> (define rrweb e initSessionRecording). */
function scriptGrabador(ventana) {
  return new Promise((ok, mal) => {
    const ext = ventana?.__PosthogExtensions__;
    if (ext?.rrweb?.record && ext?.initSessionRecording) { ok(); return; }
    const doc = ventana?.document;
    if (!doc) { mal(new Error('sin documento')); return; }
    const s = doc.createElement('script');
    s.src = new URL('../../vendor/posthog/lazy-recorder.js', import.meta.url).href;
    s.async = true;
    s.onload = () => (ventana.__PosthogExtensions__?.initSessionRecording ? ok() : mal(new Error('grabador incompleto')));
    s.onerror = () => mal(new Error('grabador'));
    (doc.head || doc.documentElement).appendChild(s);
  });
}

// La instancia del juego (en el navegador). En node, `analitica` es null y las pruebas usan crearAnalitica().
export const analitica = typeof window !== 'undefined' ? crearAnalitica() : null;
// Atajos con los nombres de docs/MVP.md 6.1.
export const ev = (...a) => analitica?.ev(...a);
export const identificar = (...a) => analitica?.identificar(...a);
export const apagar = (...a) => analitica?.apagar(...a);
