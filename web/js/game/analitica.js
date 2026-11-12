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

export const BANDERAS = { 'muro-partidas-gratis': '2', 'muro-texto': 'a', 'invitacion-podio1': 'on', grabacion: 'off' };

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

/** `fuente_trafico`: utm_source si viene, «compartido» con ?c=, si no «directo». */
export function fuenteTrafico(buscar) {
  const p = new URLSearchParams(buscar || '');
  const utm = (p.get('utm_source') || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
  if (utm) return utm;
  return p.has('c') ? 'compartido' : 'directo';
}

export function crearAnalitica(o = {}) {
  const g = globalThis;
  const ventana = o.ventana !== undefined ? o.ventana : (typeof window !== 'undefined' ? window : null);
  const cargar = o.cargar || (() => import('../../vendor/posthog/module.js').then(m => m.default || m.posthog));
  const local = almacen(o.local !== undefined ? o.local : (() => { try { return g.localStorage; } catch { return null; } })());
  const sesion = almacen(o.sesion !== undefined ? o.sesion : (() => { try { return g.sessionStorage; } catch { return null; } })());
  const buscar = o.buscar ?? ventana?.location?.search ?? '';
  const origen = o.origen ?? ventana?.location?.origin ?? '';
  const ahora = o.ahora || (() => Date.now());

  let estado = 'esperando';   // esperando | activa | apagada
  let ph = null;
  let flags = { ...BANDERAS };
  let anonimo = null;
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
    try {
      ph = await cargar();
      const banderasProps = Object.fromEntries(Object.entries(flags).map(([k, v]) => [`$feature/${k}`, String(v)]));
      ph.init(clave, {
        api_host: origen + (m.host || '/qx'),
        ui_host: m.ui || 'https://us.posthog.com',
        persistence: 'memory',                  // nada en cookies ni en almacenamiento: no hace falta aviso de cookies
        person_profiles: 'identified_only',
        autocapture: false, capture_pageview: false, capture_pageleave: true,
        rageclick: false, capture_dead_clicks: false, capture_heatmaps: false, capture_performance: false,
        capture_exceptions: false, disable_session_recording: true, disable_surveys: true,
        disable_surveys_automatic_display: true, disable_web_experiments: true, disable_product_tours: true,
        disable_conversations: true, disable_external_dependency_loading: true,
        advanced_disable_flags: true, advanced_disable_decide: true, advanced_disable_feature_flags: true,
        bootstrap: { featureFlags: flags },
        mask_all_text: true, mask_all_element_attributes: true, save_referrer: false,
      });
      ph.register(limpiarProps({
        idioma, idioma_origen, version,
        tactil: !!(ventana.matchMedia && ventana.matchMedia('(pointer: coarse)').matches),
        pais: est?.contexto?.pais ?? null, previas: est?.contexto?.previas ?? null, dias: est?.contexto?.dias ?? null,
        fuente_trafico: fuenteTrafico(buscar), pantalla, ...banderasProps,
      }));
      estado = 'activa';
    } catch {
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

  /** Sin medición en esta carga (los eventos siguen yendo a window.JUEGO.eventos). */
  function apagar() {
    estado = 'apagada';
    cola.length = 0;
  }

  const activa = () => estado === 'activa';
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

  /** `error_juego` desde window.onerror y promesas sin atrapar, con un tipo corto y sin texto libre. Hasta 5 por carga. */
  function instalarErrores(pantallaActual = () => null) {
    if (!ventana?.addEventListener) return;
    let n = 0;
    const tipoDe = e => {
      const nombre = e && typeof e.name === 'string' ? e.name : '';
      return /^[A-Za-z]{1,40}$/.test(nombre) ? nombre : 'Error';
    };
    const mandar = tipo => { if (n++ < 5) ev('error_juego', { tipo, pantalla: pantallaActual() }); };
    ventana.addEventListener('error', e => mandar(tipoDe(e?.error)));
    ventana.addEventListener('unhandledrejection', e => mandar('promesa_' + tipoDe(e?.reason)));
  }

  return {
    get estado() { return estado; },
    ev, identificar, visita, iniciar, apagar, activa, bandera, idSesion, encuestaVista, encuestaCerrada, consentir,
    desactivarMedicion, activarMedicion, medicionActivada, instalarErrores,
  };
}

// La instancia del juego (en el navegador). En node, `analitica` es null y las pruebas usan crearAnalitica().
export const analitica = typeof window !== 'undefined' ? crearAnalitica() : null;
// Atajos con los nombres de docs/MVP.md 6.1.
export const ev = (...a) => analitica?.ev(...a);
export const identificar = (...a) => analitica?.identificar(...a);
export const apagar = (...a) => analitica?.apagar(...a);
