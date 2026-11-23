// Métricas de Tarima con PostHog (docs/MVP.md 6). posthog-js va vendorizado en web/vendor/posthog/ y se carga solo si
// /api/estado devuelve la clave pública (`metricas.clave`). Todo pasa por el proxy del mismo sitio (/qx).
//
// Reglas:
// - Sin cookies ni almacenamiento de medición: persistence 'memory'. El id de PostHog cambia en cada carga de página.
//   `consentir()` existe para el día que haya un aviso de consentimiento; hoy nadie lo llama.
// - UTM (utm_source, utm_medium, utm_campaign, utm_content) limpios como súper propiedades, y al identificar, `$initial_*` con `$set_once`.
// - person_profiles 'identified_only': solo los anotados tienen perfil (identify con su lista_id, nunca el correo).
// - No-op sin clave, con `?metricas=0` o con la medición desactivada en la página de privacidad (`tarima.medicion` = 0).
//   Igual, cada evento queda en `window.JUEGO.eventos` para que las pruebas puedan afirmar el embudo.
// - Ningún evento lleva nombre, correo, IP ni dispositivo: las propiedades con esos nombres o con una «@» se descartan.
// - Las banderas (6.5) las evalúa el Worker: llegan en /api/estado y se pasan como bootstrap y como `$feature/<bandera>`.
// - La encuesta (opcional, después de anotarse, 5.4): el juego manda `encuesta_vista`, `encuesta_enviada` y
//   `encuesta_salteada`; las respuestas las manda el Worker como `encuesta_respuesta` (sin el correo).
// - Grabación de sesión (6.6): solo en una parte de las cargas, según la bandera `grabacion` (off · tercio · todas),
//   decidido una vez por carga, que con la persistencia en memoria es una sesión de PostHog. Graba la página (paneles,
//   botones, textos, toques); los campos van tapados y el texto que tenga el nombre del jugador o una «@» también. Los
//   nodos que cambian en cada cuadro (la señal del intento) quedan fuera (BLOQUEO_GRABACION).
//   El lienzo 3D (LIF-45), según la bandera `grabacion_lienzo` (off · compu · todas): a LIENZO.fps cuadros por segundo,
//   chicos y en WebP de baja calidad, con negro encima de los carteles del 3D que pueden mostrar el nombre del jugador (la
//   pantalla LED y el tablero del costado, regionesLienzo). Si no se pueden ubicar, el cuadro no se graba.
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
  'anotar_envio', 'anotar_ok', 'anotar_error', 'encuesta_vista', 'encuesta_enviada', 'encuesta_salteada', 'privacidad_abierta',
  'medicion_desactivada', 'error_juego',
  // Gameplay 2 (docs/JUEGO.md G2.7): un toque saltea el turno de un rival o el veredicto propio
  'rival_salteado', 'veredicto_salteado',
  // muro en el medio de la final (12-nov)
  'muro_cerrado', 'final_cortada', 'envion_ok', 'envion_negado',
  // LIF-46 y LIF-53: el cartel con dos caminos y lo que pasó después
  'muro_camino', 'muro_resultado', 'siguio_jugando', 'anotar_respuesta', 'encuesta_error',
  // LIF-33: si se vio el pesista y por qué no
  'escena_visible', 'carga_fallida',
  // orden de turnos (LIF-4): «Cambiar» el pedido en el turno de un rival
  'pedido_cambiado',
  // LIF-38: la cámara elegida en Opciones o con la tecla V
  'camara_elegida',
  // LIF-52: las explicaciones de primera vez (ui/aprende.js): cuándo salen y cómo se cierran
  'explicacion_vista', 'explicacion_cerrada',
  // LIF-8, LIF-9, LIF-10, LIF-11, LIF-12, LIF-68: finales validadas, ranking, perfil y desafíos
  'final_validada', 'ranking_visto', 'ranking_publico', 'perfil_visto', 'desafio_abierto', 'desafio_dejado',
  // LIF-5: el plan de competencia
  'plan_elegido',
  // LIF-15: categoría de peso
  'categoria_elegida',
  // LIF-62: entrenamiento entre competencias
  'entreno_abierto', 'entreno_hecho', 'escuela_elegida',
  // LIF-19: control antidoping
  'antidoping',
  // LIF-29: apoyo voluntario
  'apoyo_click',
]);

export const BANDERAS = { 'muro-partidas-gratis': '2', 'muro-texto': 'a', 'invitacion-podio1': 'on', grabacion: 'tercio', grabacion_lienzo: 'compu' };

/** Qué parte de las cargas se graba según la bandera `grabacion` (worker/src/reglas.js). Un valor desconocido no graba. */
export const GRABACION = { off: 0, tercio: 1 / 3, todas: 1 };
export const proporcionGrabacion = v => (typeof v === 'string' && Object.hasOwn(GRABACION, v) ? GRABACION[v] : 0);

/**
 * Lo que la grabación no mira (se ve como una caja vacía del mismo tamaño): los lienzos (el 3D y las ayudas) y los nodos
 * que cambian en cada cuadro durante el intento (#senal: escala, opacidad y anillos por cuadro; #acuse y #depura).
 * Así el grabador no procesa una mutación por cuadro mientras se levanta.
 */
export const BLOQUEO_GRABACION = 'canvas, #senal, #acuse, #depura';
/** Lo mismo cuando se graba el lienzo: el 3D (#gl) y las ayudas que van encima (#ayudas, transparente) se graban. */
export const BLOQUEO_GRABACION_LIENZO = '#senal, #acuse, #depura';

/**
 * Bandera `grabacion_lienzo` (solo en las cargas que se graban): `off` nunca, `compu` solo sin pantalla táctil
 * (`pointer: coarse`, la misma regla que la propiedad `tactil`), `todas` también en teléfonos. Un valor desconocido no graba.
 */
export const GRABACION_LIENZO = ['off', 'compu', 'todas'];
export const grabaLienzo = (v, tactil) => v === 'todas' || (v === 'compu' && !tactil);

/**
 * Cuadros del lienzo: `fps` por segundo, WebP con `calidad`, y `ancho` px CSS como mucho (escala de la captura sobre el
 * tamaño del lienzo en la página; el grabador la acota entre 0,1 y 1). Medido en docs/MVP.md 6.6.
 */
export const LIENZO = { fps: 3, calidad: 0.4, ancho: 640 };
export const escalaLienzo = anchoCss => (Number.isFinite(anchoCss) && anchoCss > 0 ? Math.max(0.1, Math.min(1, LIENZO.ancho / anchoCss)) : 0.5);

/**
 * Dónde se escribe el nombre de quien levanta en los carteles del 3D, como rectángulos de su textura (u de izquierda a
 * derecha, v de arriba abajo, con un margen): en la pantalla LED, la línea del nombre de la caja derecha (ambiente.js,
 * _led: centro en 0,18 del alto, letra de 0,15, alineado a la derecha desde 0,978 del ancho y hasta 0,25 de ancho) y en
 * el tablero del costado, la línea del nombre (arena.js, _drawBoard: centro en 228 de 640 px, letra de 64, desde x 34).
 * Solo la línea: los kilos, el país y el pesista quedan a la vista (un rectángulo grande taparía al levantador). Si
 * cambian esos dibujos, cambia esto.
 */
export const ZONAS_NOMBRE = { led: [0.70, 1, 0.07, 0.29], tablero: [0, 1, 0.28, 0.44] };
const tableros = new WeakMap();
function mallasConNombre(A) {
  if (!A?.pantalla?.geometry) throw new Error('sin pantalla LED');
  const out = [[A.pantalla, ZONAS_NOMBRE.led]];
  if (A.boardTex) {
    let t = tableros.get(A);
    if (!t) { A.group?.traverse?.(o => { if (!t && o.isMesh && o.material?.map === A.boardTex) t = o; }); if (t) tableros.set(A, t); }
    if (!t) throw new Error('sin tablero');
    out.push([t, ZONAS_NOMBRE.tablero]);
  }
  return out;
}

/**
 * Rectángulo de la pantalla (px CSS del lienzo, el sistema de canvasCapture.maskRegionsFn) que cubre una zona de un plano
 * de three (PlaneGeometry, z = 0 en su espacio). Matrices de three (columnas). `espejoY`: la zona reflejada en el plano
 * y = espejoY (el reflejo de la tarima). null si queda toda detrás de la cámara; todo el lienzo si queda en parte.
 */
export function rectanguloDeZona({ mundo, vista, proyeccion, w, h, zona: [u0, u1, v0, v1], ancho, alto, espejoY = null, margen = 0.08 }) {
  const M = mundo, V = vista, P = proyeccion;
  const xs = [], ys = [];
  let detras = 0;
  for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) {
    const lx = (u - 0.5) * w, ly = (0.5 - v) * h;
    let x = M[0] * lx + M[4] * ly + M[12], y = M[1] * lx + M[5] * ly + M[13];
    const z = M[2] * lx + M[6] * ly + M[14];
    if (espejoY !== null) y = 2 * espejoY - y;
    const cx = V[0] * x + V[4] * y + V[8] * z + V[12], cy = V[1] * x + V[5] * y + V[9] * z + V[13], cz = V[2] * x + V[6] * y + V[10] * z + V[14], cw = V[3] * x + V[7] * y + V[11] * z + V[15];
    const px = P[0] * cx + P[4] * cy + P[8] * cz + P[12] * cw, py = P[1] * cx + P[5] * cy + P[9] * cz + P[13] * cw, pw = P[3] * cx + P[7] * cy + P[11] * cz + P[15] * cw;
    if (!(pw > 1e-6)) { detras++; continue; }
    xs.push((px / pw + 1) / 2 * ancho); ys.push((1 - py / pw) / 2 * alto);
  }
  if (detras === 4) return null;
  if (detras) return { x: 0, y: 0, width: ancho, height: alto };
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mx = (x1 - x0) * margen + 2, my = (y1 - y0) * margen + 2;
  const a = Math.max(0, Math.floor(x0 - mx)), b = Math.min(ancho, Math.ceil(x1 + mx)), c = Math.max(0, Math.floor(y0 - my)), d = Math.min(alto, Math.ceil(y1 + my));
  if (!(b > a && d > c)) return null;
  return { x: a, y: c, width: b - a, height: d - c };
}

/** Si el cartel (arena.board, lo que main.js pasa a setBoard) puede estar mostrando el nombre del jugador. Ante la duda, sí. */
export const muestraNombreJugador = b => !b || typeof b !== 'object' || (b.jugador !== false && !b.entero);

/**
 * canvasCapture.maskRegionsFn: lo que se tapa en cada cuadro del lienzo. Para #gl, los carteles con el nombre (y su
 * reflejo en la tarima cuando está prendido), proyectados con la cámara del último cuadro dibujado; los otros lienzos
 * (las ayudas) no tienen nombres. Tira si no encuentra la escena o los carteles: el grabador entonces saltea el cuadro.
 * `fresco()` (vigiaCuadros) dice si en este cuadro se dibujó: sin preserveDrawingBuffer, un cuadro sin dibujar se
 * leería negro, así que también se saltea.
 */
export function regionesLienzo(canvas, escena, fresco = () => true) {
  if (!canvas || canvas.id !== 'gl') return [];
  const cam = escena?.rig?.camera;
  if (!cam?.projectionMatrix?.elements || !cam.matrixWorldInverse?.elements) throw new Error('sin cámara');
  const attrs = escena.renderer?.getContext?.()?.getContextAttributes?.();
  if (attrs && attrs.preserveDrawingBuffer === false && !fresco()) throw new Error('cuadro sin dibujar');
  const ancho = canvas.clientWidth || canvas.width, alto = canvas.clientHeight || canvas.height;
  // LIF-45: si los carteles no muestran el nombre del jugador (dicen «LIFTING GAME» porque esta visita graba el lienzo, o
  // levanta un rival, que es ficticio), no se tapa nada: el rectángulo negro taparía al pesista cuando pasa por delante. Sin
  // datos del cartel (o con el nombre del jugador ya dibujado, por ejemplo si la grabación se prendió con el cartel puesto)
  // se tapa como antes: es el respaldo.
  if (!muestraNombreJugador(escena.arena?.board)) return [];
  const espejos = [null];
  if (escena.reflejo?.activo) espejos.push(Number.isFinite(escena.reflejo.y) ? escena.reflejo.y : 0);
  const out = [];
  for (const [malla, zona] of mallasConNombre(escena.arena)) {
    const p = malla.geometry.parameters;
    if (!p || !(p.width > 0) || !(p.height > 0) || !malla.matrixWorld?.elements) throw new Error('cartel sin medidas');
    if (malla.visible === false) continue;
    for (const espejoY of espejos) {
      const r = rectanguloDeZona({ mundo: malla.matrixWorld.elements, vista: cam.matrixWorldInverse.elements, proyeccion: cam.projectionMatrix.elements, w: p.width, h: p.height, zona, ancho, alto, espejoY });
      if (r) out.push(r);
    }
  }
  return out;
}

/**
 * Si en el cuadro de ahora se dibujó el 3D (three cuenta los render en renderer.info.render.frame). Un requestAnimationFrame
 * propio, pedido antes de posthog.init: corre después del bucle del juego (pedido antes) y antes del grabador (pedido
 * después), así que ve el render de este cuadro. Solo importa si el lienzo no conserva su imagen (preserveDrawingBuffer).
 */
export function vigiaCuadros(ventana, escena = () => ventana?.JUEGO?.escena) {
  const raf = ventana?.requestAnimationFrame?.bind(ventana), ahora = () => ventana?.document?.timeline?.currentTime ?? null;
  if (!raf) return { fresco: () => true, parar() {} };
  let antes = null, dibujado = null, vivo = true;
  const mirar = () => {
    if (!vivo) return;
    raf(mirar);
    const n = escena()?.renderer?.info?.render?.frame;
    dibujado = n !== undefined && n !== antes ? ahora() : dibujado;
    antes = n;
  };
  raf(mirar);
  return { fresco: () => { const t = ahora(); return t === null || (dibujado !== null && dibujado === t); }, parar() { vivo = false; } };
}

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
  const utm = campania(buscar).utm_source;   // la misma limpieza que la propiedad utm_source
  if (utm) return utm;
  if (p.has('c')) return 'compartido';
  for (const [k, f] of CLICK_IDS) if (p.has(k)) return f;
  const d = dominioReferente(referente, origen);
  if (d) { for (const [re, f] of REFERENTES) if (re.test(d)) return f; return 'otro_sitio'; }
  return 'directo';
}

/** Navegador dentro de una app (por el agente de usuario): ahí el 3D y las descargas fallan más. null si no es ninguna. */
export function appNavegador(ua = '') {
  ua = String(ua || '');
  return /Instagram/i.test(ua) ? 'instagram' : /\bFBA[NV]\/|FB_IAB|FBIOS|\bFB4A\b/.test(ua) ? 'facebook' : /\bTikTok|musical_ly|BytedanceWebview/i.test(ua) ? 'tiktok' : /\bLine\//.test(ua) ? 'line' : /Snapchat/i.test(ua) ? 'snapchat' : null;
}

/** Parámetros de campaña que se registran (docs/MVP.md 6.1 y docs/DIFUSION.md). `utm_term` no: no hay avisos pagos. */
export const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

/**
 * Los UTM del link, limpios: minúscula, solo letras, números, «_», «.» y «-» (los espacios y «+» pasan a «_»), hasta 60
 * caracteres; null si falta. Un valor con «@» o con 7 dígitos seguidos, sin contar espacios, «+» ni paréntesis (un correo o
 * un teléfono pegado en el link), se descarta entero: nunca llega a PostHog. Una fecha con guiones (2026-11-15) pasa.
 */
export function campania(buscar) {
  const p = new URLSearchParams(buscar || '');
  return Object.fromEntries(UTM.map(k => {
    const crudo = String(p.get(k) ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (!crudo || crudo.includes('@') || /\d{7}/.test(crudo.replace(/[\s()+]/g, ''))) return [k, null];
    const v = crudo.replace(/[\s+]+/g, '_').replace(/[^a-z0-9_.-]/g, '').slice(0, 60);
    return [k, v || null];
  }));
}

/** Atribución inicial de la persona (`$set_once` en identify): la de la primera carga en la que se identifica. */
export const campaniaInicial = (buscar, referente = '', origen = '') => Object.fromEntries([
  ['$initial_fuente_trafico', fuenteTrafico(buscar, referente, origen)],
  ...Object.entries(campania(buscar)).map(([k, v]) => [`$initial_${k}`, v]),
]);

/**
 * Lo mínimo para encontrar un error sin mandar texto libre largo: mensaje recortado (sin direcciones de mail ni
 * parámetros de URL), archivo (solo el nombre), línea y columna.
 * - Una promesa rechazada con un Event (una imagen o textura que no bajó: three rechaza con el evento de error de la
 *   imagen) no tiene `message`: se describe con el tipo de evento, la etiqueta y el archivo (`error IMG detail_skin.png`).
 * - «Script error.» sin archivo es un error de un script de OTRO origen (los navegadores ocultan el detalle): con todos los
 *   módulos del juego en el mismo origen, sale de lo que inyectan las apps (Facebook, Instagram) o las extensiones.
 *   Se marca con `ajeno: true`.
 */
export function detalleError(e, ev = null) {
  if (e && typeof e === 'object' && !(e instanceof Error) && typeof e.type === 'string' && 'target' in e && e.message === undefined) {
    const tg = e.target, src = String(tg?.src || tg?.currentSrc || tg?.href || '').split(/[?#]/)[0].split('/').pop().slice(0, 60);
    return { mensaje: [e.type, tg?.tagName || tg?.constructor?.name || '', src].filter(Boolean).join(' ').slice(0, 160), archivo: src || null, linea: null, col: null, evento: true };
  }
  const msgCrudo = String((e && (e.message ?? (typeof e === 'string' ? e : ''))) || ev?.message || '');
  const mensaje = msgCrudo.replace(/[^\s@]+@[^\s@]+/g, '[mail]').replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 160);
  let archivo = ev?.filename || '', linea = ev?.lineno || null, col = ev?.colno || null;
  if (!archivo && typeof e?.stack === 'string') {
    const m = e.stack.match(/(?:https?:\/\/[^\s)]*\/)?([^\s/()]+\.m?js)(?:\?[^\s:)]*)?:(\d+):(\d+)/);
    if (m) { archivo = m[1]; linea = +m[2]; col = +m[3]; }
  }
  archivo = String(archivo).split(/[?#]/)[0].split('/').pop().slice(0, 60);
  const out = { mensaje: mensaje || null, archivo: archivo || null, linea: Number.isFinite(linea) ? linea : null, col: Number.isFinite(col) ? col : null };
  if (/^Script error\.?$/i.test(mensaje) && !archivo) out.ajeno = true;
  if (!mensaje && e !== null && e !== undefined && typeof e !== 'object') out.mensaje = String(e).slice(0, 160) || null;
  if (!out.mensaje && e && typeof e === 'object' && !(e instanceof Error)) out.mensaje = (Object.prototype.toString.call(e) + ' ' + (e.constructor?.name || '')).trim().slice(0, 160);
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
  let lienzo = false, vigia = null;
  const cola = [];
  const avisados = new Set();
  // súper propiedades del juego (hoy, `dificultad`): van en todos los eventos desde que se fijan, también en window.JUEGO.eventos
  const fijas = {};

  const registro = () => {
    if (!ventana) return null;
    ventana.JUEGO = ventana.JUEGO || {};
    ventana.JUEGO.eventos = ventana.JUEGO.eventos || [];
    return ventana.JUEGO.eventos;
  };

  const apagadaPorUsuario = () => local.get('tarima.medicion') === '0' || new URLSearchParams(buscar).get('metricas') === '0';

  /** `o.beacon`: al irse de la página (pagehide), sale ya por sendBeacon (si no, se perdería con la página). */
  function ev(nombre, props = {}, o = {}) {
    if (typeof nombre !== 'string' || !nombre) return;
    if (!EVENTOS.has(nombre) && !avisados.has(nombre)) { avisados.add(nombre); g.console?.warn?.(`analitica: evento fuera de la lista de docs/MVP.md 6.3: ${nombre}`); }
    const p = { ...fijas, ...limpiarProps(props) };
    const t = ahora();
    const reg = registro();
    if (reg) reg.push({ ev: nombre, props: p, t });
    if (estado === 'apagada') return;
    if (estado === 'esperando') { if (cola.length < MAX_COLA) cola.push(['ev', nombre, p, t]); return; }
    try { if (o && o.beacon) ph.capture(nombre, p, { send_instantly: true, transport: 'sendBeacon' }); else ph.capture(nombre, p); } catch { /* la medición nunca rompe el juego */ }
  }

  /**
   * Liga la sesión al número interno de la lista (nunca el correo). Llamar antes de `anotar_ok`. Con `$set_once` deja en la
   * persona `$initial_fuente_trafico` y `$initial_utm_*` de esta carga; PostHog no los pisa en las visitas siguientes.
   */
  function identificar(lista_id) {
    if (typeof lista_id !== 'string' || !/^[0-9a-f]{8,64}$/i.test(lista_id)) return;
    if (estado === 'esperando') { cola.push(['id', lista_id]); return; }
    if (estado === 'activa') { try { ph.identify(lista_id, undefined, campaniaInicial(buscar, referente, origen)); } catch { /* nada */ } }
  }

  /** Súper propiedades del juego (por ejemplo `{ dificultad: 'medio' }`): van en cada evento y en PostHog con register. */
  function propiedades(props) {
    const p = limpiarProps(props || {}); Object.assign(fijas, p);
    if (estado === 'esperando') { cola.push(['reg', p]); return; }
    if (estado === 'activa') { try { ph.register(p); } catch { /* nada */ } }
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
    if (estado !== 'esperando') return estado === 'activa';
    if (!clave || apagadaPorUsuario() || !ventana) { apagar(); return false; }
    sesion.set(CLAVE_PUBLICA, clave);
    // Grabación: se sortea una vez por carga. El grabador va antes de init (si no, posthog-js lo pediría a /static/).
    const p = proporcionGrabacion(flags.grabacion);
    grabar = p > 0 && azar() < p;
    const tactil = !!(ventana.matchMedia && ventana.matchMedia('(pointer: coarse)').matches);
    // El lienzo, en una parte de las cargas grabadas. El grabador lo necesita (si no, lo apaga solo): OffscreenCanvas y createImageBitmap.
    lienzo = grabar && grabaLienzo(flags.grabacion_lienzo, tactil) && typeof ventana.OffscreenCanvas === 'function' && typeof ventana.createImageBitmap === 'function';
    try {
      [ph] = await Promise.all([cargar(), grabar ? cargarGrabador().catch(() => { grabar = false; }) : null]);
      // Si mientras se descargaba se apagó la medición (apagar() o el interruptor en otra pestaña), no se arranca.
      if (estado !== 'esperando' || apagadaPorUsuario()) { grabar = false; lienzo = false; if (estado === 'esperando') apagar(); return false; }
      lienzo = lienzo && grabar;
      if (grabar) configGrabacionRemota(ventana, clave, lienzo);
      if (lienzo) vigia = vigiaCuadros(ventana);      // antes de init: su cuadro va antes que el del grabador
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
        // Los UTM los registra este archivo, limpios (campania): posthog-js mandaría el valor crudo y los click-ids (fbclid…).
        save_campaign_params: false,
        // Y en $current_url, los click-ids (fbclid, gclid, ttclid…) van como «<masked>».
        mask_personal_data_properties: true,
        enable_recording_console_log: false,
        session_recording: opcionesGrabacion(() => nombresDelJugador(), lienzo ? {
          escala: escalaLienzo(ventana.innerWidth),
          regiones: c => regionesLienzo(c, ventana.JUEGO?.escena, vigia.fresco),
        } : null),
      });
      ph.register(limpiarProps({
        idioma, idioma_origen, version,
        tactil,
        pais: est?.contexto?.pais ?? null, previas: est?.contexto?.previas ?? null, dias: est?.contexto?.dias ?? null,
        jugador: /^d_[0-9a-f]{16}$/.test(est?.contexto?.jugador ?? '') ? est.contexto.jugador : null,
        fuente_trafico: fuenteTrafico(buscar, referente, origen), referente: dominioReferente(referente, origen) || null,
        app_navegador: appNavegador(ventana.navigator?.userAgent),
        ...campania(buscar),
        pantalla, grabada: grabar, grabada_lienzo: lienzo, gratis_etapa: est?.regla?.etapa ?? null, ...banderasProps,
        // Sin IP del jugador (el proxy no la manda), PostHog ubicaría a todos en el país del servidor de Cloudflare: el país real va en `pais`.
        $geoip_disable: true,
      }));
      estado = 'activa';
      // La privacidad se abre en otra pestaña: si ahí se desactiva la medición, esta carga deja de medir y de grabar.
      try { ventana.addEventListener?.('storage', e => { if (e?.key === 'tarima.medicion' && e.newValue === '0') apagar(); }); } catch { /* nada */ }
    } catch {
      grabar = false;
      vigia?.parar(); vigia = null; lienzo = false;
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
    lienzo = false; vigia?.parar(); vigia = null;
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
  /** true si además se graba el lienzo 3D (bandera `grabacion_lienzo`). */
  const grabandoLienzo = () => grabando() && lienzo;
  const bandera = nombre => flags[nombre] ?? BANDERAS[nombre] ?? null;

  /** Id para el campo `sesion` del Worker: el de PostHog si hay medición, si no uno al azar de esta carga. */
  function idSesion() {
    if (estado === 'activa') { try { const d = ph.get_distinct_id(); if (d) return String(d); } catch { /* nada */ } }
    if (!anonimo) anonimo = 'anon_' + (g.crypto?.randomUUID ? g.crypto.randomUUID() : String(Math.random()).slice(2));
    return anonimo;
  }

  // La encuesta (5.4): en el cartel (paso 'cartel', desbloquea) o después del correo (paso 'anotado', optativa). Las
  // respuestas no van por acá (las manda el Worker).
  const encuestaVista = ({ momento = null, paso = null } = {}) => ev('encuesta_vista', { momento, paso });
  const encuestaCerrada = ({ momento = null, paso = null } = {}) => ev('encuesta_salteada', { momento, paso });

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
    ev, identificar, visita, propiedades, iniciar, apagar, activa, grabando, grabandoLienzo, bandera, idSesion, encuestaVista, encuestaCerrada, consentir,
    desactivarMedicion, activarMedicion, medicionActivada, instalarErrores,
  };
}

/**
 * Opciones de `session_recording` de posthog-js. Lo del cliente gana sobre lo que diga el proyecto de PostHog, así que
 * aunque alguien prenda ahí el lienzo o afloje el enmascarado, acá manda esto. `lienzo` (null: sin lienzo):
 * {escala, regiones(canvas)} para grabar el 3D a LIENZO.fps con los carteles del nombre tapados.
 */
export function opcionesGrabacion(nombres = () => [], lienzo = null) {
  const conLienzo = !!(lienzo && typeof lienzo.regiones === 'function');
  return {
    maskAllInputs: true,                          // mail, nombre, respuesta libre: siempre «***»
    maskTextSelector: '*',                        // todo texto pasa por maskTextFn…
    maskTextFn: texto => taparTexto(texto, nombres()),   // …que tapa solo lo del jugador
    maskAttributeFn: (atributo, valor) => taparAtributo(atributo, valor, nombres()),   // value, data-v del correo sugerido…
    blockSelector: conLienzo ? BLOQUEO_GRABACION_LIENZO : BLOQUEO_GRABACION,
    // el 3D: pocos cuadros, chicos y en baja calidad (sin él, recordCanvas false: aunque el proyecto lo prenda)
    captureCanvas: conLienzo ? { recordCanvas: true, canvasFps: LIENZO.fps, canvasQuality: LIENZO.calidad } : { recordCanvas: false },
    // con maskRegionsFn el grabador tampoco pone la imagen del lienzo sin tapar en las instantáneas completas
    ...(conLienzo ? { canvasCapture: { resolutionScale: lienzo.escala ?? 0.5, maskRegionsFn: lienzo.regiones } } : {}),
    recordHeaders: false, recordBody: false,      // nada de la red
    recordCrossOriginIframes: false,
    collectFonts: false,
  };
}

/**
 * Configuración «remota» de la grabación puesta a mano antes de init. Con advanced_disable_flags posthog-js no pide la
 * configuración del proyecto; la toma de window._POSTHOG_REMOTE_CONFIG (como el array.js de cada proyecto). Sin flags
 * ni compresión extra, sin consola y sin red; el lienzo solo con `lienzo` (lo mismo que dice opcionesGrabacion, que gana).
 * Las grabaciones van a /qx/s/.
 */
export function configGrabacionRemota(ventana, clave, lienzo = false) {
  if (!ventana) return;
  const previo = ventana._POSTHOG_REMOTE_CONFIG && typeof ventana._POSTHOG_REMOTE_CONFIG === 'object' ? ventana._POSTHOG_REMOTE_CONFIG : {};
  ventana._POSTHOG_REMOTE_CONFIG = {
    ...previo,
    [clave]: { config: {
      hasFeatureFlags: false, capturePerformance: false, autocapture_opt_out: true, heatmaps: false, surveys: false,
      sessionRecording: { endpoint: '/s/', recordCanvas: !!lienzo, ...(lienzo ? { canvasFps: LIENZO.fps, canvasQuality: String(LIENZO.calidad) } : {}), consoleLogRecordingEnabled: false, networkPayloadCapture: { recordHeaders: false, recordBody: false } },
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
