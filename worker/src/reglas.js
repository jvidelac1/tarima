// Reglas puras del Worker de Tarima (docs/MVP.md, sección 5.5). Sin fetch, sin D1, sin reloj ni azar:
// todo lo que depende del tiempo o de la base entra como argumento. Se prueban en Node con tools/worker_test.mjs.

// Versión del texto de privacidad que acepta quien se anota. 2026-11-b: sin borrado por no confirmar mientras no haya
// correos, contacto pendiente y el HMAC de la IP explicado (web/privacidad.html). 2026-11-c: grabación de sesión de la
// página en una parte de las visitas. 2026-11-d: la encuesta opcional después de anotarse (dos preguntas, sin premio) y
// las novedades sin frecuencia. Las anteriores se siguen aceptando (páginas del juego viejas en caché).
export const CONSENTIMIENTO = '2026-11-d';
export const VERSIONES_CONSENTIMIENTO = new Set(['2026-11-a', '2026-11-b', '2026-11-c', CONSENTIMIENTO]);
export const DIA = 86400;            // segundos
export const VENTANA_IP = 30 * DIA;  // cuenta por IP y retención del código de IP
export const RETENCION = 180 * DIA;  // partidas y dispositivos sin lista
export const SIN_CONFIRMAR = 30 * DIA; // desde que salió el correo de confirmación
export const PASE_DURA = 3 * 3600;
export const REFRESCO_FLAGS = DIA;

/**
 * Configuración a partir de las variables del Worker y de las banderas del dispositivo.
 * - GRATIS_ETAPA: hasta dónde llega una final gratis. 'arranque' (decisión del dueño del 12 de noviembre): solo el
 *   arranque; el dos tiempos necesita la lista o el bono de la encuesta (decidirEnvion). 'final' (la regla vieja, y el
 *   valor si la variable falta o no se entiende): la final entera.
 * - GRATIS: cuántas finales gratis. En 'final' la bandera `muro-partidas-gratis` lo pisa; en 'arranque' la bandera no se
 *   usa (queda guardada para cuando se vuelva a 'final').
 * - BONO_ENCUESTA: finales que suma la encuesta (en 'arranque', finales completas, además de terminar la que está en
 *   curso si se contesta en el intervalo). Desde el 13 de noviembre es 0 (decisión del dueño: el correo es obligatorio
 *   y la encuesta no desbloquea nada); también si la variable falta. Con 0 la encuesta no cuenta para nada de la regla.
 */
export function config(env = {}, flags = {}) {
  const num = (v, def, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
  const etapa = env.GRATIS_ETAPA === 'arranque' ? 'arranque' : 'final';
  const gratisVar = num(env.GRATIS, 2, 0, 50);
  const gratisFlag = etapa === 'final' && flags['muro-partidas-gratis'] != null ? num(flags['muro-partidas-gratis'], null, 1, 50) : null;
  return {
    etapa,
    gratis: gratisFlag ?? gratisVar,
    tope_ip: num(env.TOPE_IP, 6, 0, 500),
    bono: num(env.BONO_ENCUESTA, 0, 0, 50),
    encuestas_por_ip: num(env.ENCUESTAS_POR_IP, 3, 0, 100),
  };
}

/**
 * La regla de la cuenta.
 * @param {object} a
 * @param {boolean} a.anotado     el dispositivo tiene lista_id
 * @param {boolean} a.encuesta    el dispositivo ya respondió la encuesta (encuesta_en); con cfg.bono 0 no cuenta
 * @param {number}  a.usadas_d    partidas del dispositivo con fuente distinta de 'lista'
 * @param {number}  a.usadas_i    partidas con este código de IP en 30 días, de dispositivos sin lista
 * @param {number}  a.encuestas_i encuestas con premio desde este código de IP en 30 días
 * @param {object}  a.cfg         salida de config()
 * @returns {{puede:boolean, fuente?:string, etapa?:'arranque'|'completa', motivo?:string, quedan:number|null, encuesta_disponible:boolean}}
 *   `encuesta_disponible`: la encuesta como camino del muro (da finales). Siempre false con cfg.bono 0 y para los anotados.
 *   `etapa`: con qué permiso sale la final que se pida ahora. 'arranque' solo para una final gratis con
 *   GRATIS_ETAPA='arranque' en un dispositivo sin lista ni encuesta.
 */
export function decidir({ anotado, encuesta, usadas_d, usadas_i, encuestas_i, cfg }) {
  if (anotado) return { puede: true, fuente: 'lista', etapa: 'completa', quedan: null, encuesta_disponible: false };
  const premio = cfg.bono > 0;
  encuesta = !!encuesta && premio;      // sin bono, haber contestado no cambia nada
  const cupo_d = cfg.gratis + (encuesta ? cfg.bono : 0);
  const cupo_i = cfg.tope_ip + cfg.bono * encuestas_i;
  const encuesta_disponible = premio && !encuesta && encuestas_i < cfg.encuestas_por_ip;
  const quedan = Math.max(0, Math.min(cupo_d - usadas_d, cupo_i - usadas_i));
  const etapa = cfg.etapa === 'arranque' && !encuesta ? 'arranque' : 'completa';
  if (usadas_d < cupo_d && usadas_i < cupo_i) {
    return { puede: true, fuente: usadas_d < cfg.gratis ? 'gratis' : 'encuesta', etapa, quedan, encuesta_disponible };
  }
  return { puede: false, motivo: usadas_d >= cupo_d ? 'dispositivo' : 'ip', etapa, quedan: 0, encuesta_disponible };
}

/**
 * ¿Se puede jugar el dos tiempos de esta final? (POST /api/envion)
 * @param {object} a
 * @param {'arranque'|'completa'} a.etapa  la de la partida en la base
 * @param {boolean} a.anotado              el dispositivo tiene lista_id
 * @param {boolean} a.encuesta             el dispositivo ya respondió la encuesta
 * @param {boolean} a.encuesta_usada       otra final de este dispositivo ya pasó al dos tiempos por la encuesta
 * @param {boolean} a.encuesta_disponible  la que dice decidir() (para el muro)
 * @param {'arranque'|'final'} [a.regla]   GRATIS_ETAPA vigente (config().etapa). Con 'final' (se volvió a la regla
 *                                         vieja) las finales que salieron como 'arranque' y siguen en juego terminan gratis.
 * @param {number} [a.bono]                BONO_ENCUESTA vigente (config().bono). Con 0 la encuesta no da el dos tiempos.
 * @returns {{puede:true, via:'ya'|'lista'|'encuesta'} | {puede:false, motivo:'envion', encuesta_disponible:boolean}}
 */
export function decidirEnvion({ etapa, anotado, encuesta, encuesta_usada, encuesta_disponible, regla = 'arranque', bono = 0 }) {
  if (etapa !== 'arranque' || regla === 'final') return { puede: true, via: 'ya' };
  if (anotado) return { puede: true, via: 'lista' };
  if (bono > 0 && encuesta && !encuesta_usada) return { puede: true, via: 'encuesta' };
  return { puede: false, motivo: 'envion', encuesta_disponible: bono > 0 && !!encuesta_disponible };
}

// Antigüedad del dispositivo para la propiedad `dias` de PostHog.
export function diasDesde(creado, ahora) {
  const d = Math.floor(Math.max(0, ahora - creado) / DIA);
  return d === 0 ? '0' : d === 1 ? '1' : d <= 7 ? '2-7' : '8+';
}

// ---------- identificadores ----------

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const esUuid = v => typeof v === 'string' && UUID4.test(v.toLowerCase());

// Lo que se pasa por HMAC de una IP: la dirección entera en IPv4, el prefijo /64 en IPv6.
export function prefijoIp(ip) {
  if (typeof ip !== 'string' || !ip) return 'sin-ip';
  ip = ip.trim().toLowerCase();
  if (!ip.includes(':')) return ip;
  const mapeada = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeada) return mapeada[1];
  ip = ip.split('%')[0];
  let [cab, cola] = ip.split('::');
  const a = cab ? cab.split(':') : [];
  const b = cola != null && cola !== '' ? cola.split(':') : [];
  // Una IPv4 al final ocupa dos grupos.
  const ult = (cola != null ? b : a);
  if (ult.length && ult[ult.length - 1].includes('.')) ult.splice(ult.length - 1, 1, '0', '0');
  const faltan = cola != null ? 8 - a.length - b.length : 0;
  const grupos = [...a, ...Array(Math.max(0, faltan)).fill('0'), ...b].map(g => (g || '0').replace(/^0+(?=.)/, ''));
  return grupos.slice(0, 4).join(':') + '::/64';
}

// ---------- mail ----------

export function normalizarEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  const at = e.lastIndexOf('@');
  if (at < 1 || at !== e.indexOf('@')) return null;
  const local = e.slice(0, at), dominio = e.slice(at + 1);
  if (local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  const dom = dominioAscii(dominio);
  if (!dom) return null;
  return `${local}@${dom}`;
}

// Dominio en ASCII (los dominios con acentos pasan a punycode con URL, que es estándar en Workers y en Node).
export function dominioAscii(d) {
  if (typeof d !== 'string' || !d || d.length > 253) return null;
  if (/[\s/?#:@\\[\]%]/.test(d)) return null;
  let host;
  try { host = new URL('http://' + d.normalize('NFC')).hostname; } catch { return null; }
  if (!/[^\x00-\x7f]/.test(d) && host !== d) return null;
  const partes = host.split('.');
  if (partes.length < 2) return null;
  for (const p of partes) if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)) return null;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(partes[partes.length - 1])) return null;
  return host;
}

// El dominio o cualquiera de sus padres está en la lista de descartables.
export function esDescartable(email, lista) {
  const dom = email.slice(email.indexOf('@') + 1).split('.');
  for (let k = 0; k < dom.length - 1; k++) if (lista.has(dom.slice(k).join('.'))) return true;
  return false;
}

// ---------- nombre (igual que en el juego, docs/MVP.md 3) ----------

export const NOMBRES_DEFECTO = new Set(['debutante', 'rookie']);
export function normalizarNombre(v) {
  if (typeof v !== 'string') return null;
  const n = v.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const largo = [...n].length;
  if (largo < 2 || largo > 14) return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} '’-]*$/u.test(n)) return null;
  if (NOMBRES_DEFECTO.has(n.toLowerCase())) return null;
  return n;
}

export const idioma = v => (v === 'es' || v === 'en' ? v : 'en');

// ---------- encuesta (docs/MVP.md 5.4) ----------
// Opcional, en el panel de «anotado» (decisión del dueño del 13 de noviembre): no da finales ni desbloquea nada.
// Dos preguntas: cómo prefiere jugar (una opción) y qué le gustaría que tenga el juego (varias), más un texto libre
// opcional. Las respuestas van a PostHog como el evento `encuesta_respuesta` (propsRespuesta), sin el correo.

export const ENCUESTA = {
  plataforma: { pregunta: 'How would you rather play Tarima?', opciones: {
    app: 'Mobile app (App Store / Google Play)',
    web: 'In the browser (web game)',
  } },
  features: { pregunta: 'What would you like the game to have?', multiple: true, opciones: {
    pesista_propio: 'Create and train your own lifter',
    mujeres_categorias: 'Women lifters and weight classes',
    sedes_campeonatos: 'New venues and championships',
  } },
  otra: { pregunta: 'Anything else? (optional)', abierta: true, max: 280 },
};

/**
 * Texto libre sin datos de contacto: sin caracteres de control ni HTML, y sin palabras con «@» ni direcciones web (se
 * cambian por «…»). Espacios juntados y recortado a `max` caracteres; '' si no queda ninguna letra ni número.
 */
export function limpiarTextoLibre(v, max = ENCUESTA.otra.max) {
  if (typeof v !== 'string') return '';
  let t = v.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/<[^>]*>?/g, '').replace(/[<>]/g, '');
  t = t.replace(/\S*[@＠]\S*/g, '…')
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, '…')
    .replace(/\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[a-z]{2,}\b(?:\/\S*)?/giu, '…');
  t = t.replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(t.replace(/…/g, ''))) return '';      // no quedó nada para leer
  return [...t].slice(0, max).join('').trim();
}

/**
 * Valida las respuestas {plataforma?, features?, otra?}. Todo es opcional, pero tiene que venir algo. Devuelve
 * {ok:true, r} con la forma limpia, o {ok:false, error:'incompleta'|'formato'}.
 */
export function validarEncuesta(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, error: 'incompleta' };
  for (const k of Object.keys(r)) if (!(k in ENCUESTA)) return { ok: false, error: 'formato' };
  const limpio = {};
  if (r.plataforma != null && r.plataforma !== '') {
    if (typeof r.plataforma !== 'string' || !Object.hasOwn(ENCUESTA.plataforma.opciones, r.plataforma)) return { ok: false, error: 'formato' };
    limpio.plataforma = r.plataforma;
  }
  if (r.features != null) {
    const v = r.features, ops = ENCUESTA.features.opciones;
    if (!Array.isArray(v) || v.length > Object.keys(ops).length || new Set(v).size !== v.length) return { ok: false, error: 'formato' };
    if (!v.every(c => typeof c === 'string' && Object.hasOwn(ops, c))) return { ok: false, error: 'formato' };
    if (v.length) limpio.features = Object.keys(ops).filter(c => v.includes(c));      // orden fijo
  }
  if (r.otra != null) {
    if (typeof r.otra !== 'string' || [...r.otra].length > 2000) return { ok: false, error: 'formato' };
    const t = limpiarTextoLibre(r.otra);
    if (t) limpio.otra = t;
  }
  if (!Object.keys(limpio).length) return { ok: false, error: 'incompleta' };
  return { ok: true, r: limpio };
}

/** Propiedades del evento `encuesta_respuesta` de PostHog (sin el correo, el nombre ni el dispositivo). */
export function propsRespuesta({ r, idioma: idi, pais }) {
  return {
    plataforma: r.plataforma ?? null,
    features: r.features ?? [],
    otra: r.otra ?? null,
    idioma: idi,
    pais: pais ?? null,
    $process_person_profile: false,
  };
}

// ---------- banderas (docs/MVP.md 6.5) ----------

export const BANDERAS = {
  // Solo vale con GRATIS_ETAPA='final'. Con 'arranque' el Worker no la usa y reporta GRATIS (ver config()).
  'muro-partidas-gratis': { valores: ['1', '2'], defecto: '2', pegajosa: true },
  'muro-texto': { valores: ['a', 'b'], defecto: 'a', pegajosa: true },
  'invitacion-podio1': { valores: ['on', 'off'], defecto: 'on' },
  // Grabación de sesión (docs/MVP.md 6.6): qué parte de las cargas se graba. Se cambia en PostHog sin publicar.
  'grabacion': { valores: ['off', 'tercio', 'todas'], defecto: 'tercio' },
};

export const banderasPorDefecto = () => Object.fromEntries(Object.entries(BANDERAS).map(([k, b]) => [k, b.defecto]));

/**
 * Las banderas que PostHog asignó de verdad a este dispositivo (ahora o antes): es lo único que se guarda y lo único
 * que pisa la configuración del Worker. Las pegajosas guardadas no cambian. Un valor por defecto nunca se guarda: si
 * se guardara, quedaría pegado aunque después cambie la variable GRATIS o se cree la bandera en PostHog.
 */
export function banderasAsignadas(guardadas, respuesta) {
  const out = {};
  for (const [k, b] of Object.entries(BANDERAS)) {
    const g = guardadas && b.valores.includes(guardadas[k]) ? guardadas[k] : null;
    if (b.pegajosa && g) { out[k] = g; continue; }
    const f = respuesta?.[k];
    let v = null;
    if (f && typeof f === 'object') v = typeof f.variant === 'string' ? f.variant : f.enabled === true ? 'on' : f.enabled === false ? 'off' : null;
    if (b.valores.includes(v)) out[k] = v;
    else if (g) out[k] = g;
  }
  return out;
}

/**
 * Valor de cada bandera para el juego: lo asignado por PostHog y, si no hay, el valor por defecto
 * (`defectos` permite que el por defecto salga de la configuración del Worker, por ejemplo GRATIS).
 */
export function combinarBanderas(guardadas, respuesta, defectos = {}) {
  const asignadas = banderasAsignadas(guardadas, respuesta);
  const out = {};
  for (const [k, b] of Object.entries(BANDERAS)) out[k] = asignadas[k] ?? (typeof defectos[k] === 'string' ? defectos[k] : b.defecto);
  return out;
}

// ---------- varios ----------

// Celda de CSV sin inyección de fórmulas.
export function celdaCsv(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
