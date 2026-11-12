// Reglas puras del Worker de Tarima (docs/MVP.md, sección 5.5). Sin fetch, sin D1, sin reloj ni azar:
// todo lo que depende del tiempo o de la base entra como argumento. Se prueban en Node con tools/worker_test.mjs.

// Versión del texto de privacidad que acepta quien se anota. 2026-11-b: sin borrado por no confirmar mientras no haya
// correos, contacto pendiente y el HMAC de la IP explicado (web/privacidad.html). La «a» se sigue aceptando.
export const CONSENTIMIENTO = '2026-11-b';
export const VERSIONES_CONSENTIMIENTO = new Set(['2026-11-a', CONSENTIMIENTO]);
export const DIA = 86400;            // segundos
export const VENTANA_IP = 30 * DIA;  // cuenta por IP y retención del código de IP
export const RETENCION = 180 * DIA;  // partidas y dispositivos sin lista
export const SIN_CONFIRMAR = 30 * DIA; // desde que salió el correo de confirmación
export const PASE_DURA = 3 * 3600;
export const REFRESCO_FLAGS = DIA;

// Configuración numérica a partir de las variables del Worker y de las banderas del dispositivo.
export function config(env = {}, flags = {}) {
  const num = (v, def, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
  const gratisVar = num(env.GRATIS, 2, 0, 50);
  const gratisFlag = flags['muro-partidas-gratis'] != null ? num(flags['muro-partidas-gratis'], null, 1, 50) : null;
  return {
    gratis: gratisFlag ?? gratisVar,
    tope_ip: num(env.TOPE_IP, 6, 0, 500),
    bono: num(env.BONO_ENCUESTA, 2, 0, 50),
    encuestas_por_ip: num(env.ENCUESTAS_POR_IP, 3, 0, 100),
  };
}

/**
 * La regla de la cuenta.
 * @param {object} a
 * @param {boolean} a.anotado     el dispositivo tiene lista_id
 * @param {boolean} a.encuesta    el dispositivo ya respondió la encuesta (encuesta_en)
 * @param {number}  a.usadas_d    partidas del dispositivo con fuente distinta de 'lista'
 * @param {number}  a.usadas_i    partidas con este código de IP en 30 días, de dispositivos sin lista
 * @param {number}  a.encuestas_i encuestas con premio desde este código de IP en 30 días
 * @param {object}  a.cfg         salida de config()
 * @returns {{puede:boolean, fuente?:string, motivo?:string, quedan:number|null, encuesta_disponible:boolean}}
 */
export function decidir({ anotado, encuesta, usadas_d, usadas_i, encuestas_i, cfg }) {
  if (anotado) return { puede: true, fuente: 'lista', quedan: null, encuesta_disponible: !encuesta };
  const cupo_d = cfg.gratis + (encuesta ? cfg.bono : 0);
  const cupo_i = cfg.tope_ip + cfg.bono * encuestas_i;
  const encuesta_disponible = !encuesta && encuestas_i < cfg.encuestas_por_ip;
  const quedan = Math.max(0, Math.min(cupo_d - usadas_d, cupo_i - usadas_i));
  if (usadas_d < cupo_d && usadas_i < cupo_i) {
    return { puede: true, fuente: usadas_d < cfg.gratis ? 'gratis' : 'encuesta', quedan, encuesta_disponible };
  }
  return { puede: false, motivo: usadas_d >= cupo_d ? 'dispositivo' : 'ip', quedan: 0, encuesta_disponible };
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

// ---------- encuesta (docs/MVP.md 4.5 y 5.4) ----------
// Etiquetas canónicas en español: son las opciones que se cargan en la encuesta de PostHog.

export const ENCUESTA = {
  q1: { pregunta: '¿Qué te gustaría que agreguemos primero?', multiple: true, opciones: {
    pesista_propio: 'Crear mi propio pesista',
    carrera: 'Carrera y entrenamiento para mejorar a mi pesista',
    sedes: 'Finales en sedes distintas',
    mujeres_categorias: 'Pesistas mujeres y categorías de peso',
    amigos_online: 'Jugar contra amigos u online',
    realismo: 'Más realismo (técnica, jueces, control antidoping)',
  } },
  q2: { pregunta: '¿Qué fue lo que menos te gustó?', multiple: true, exclusiva: 'nada', opciones: {
    no_entendi: 'No entendí qué tenía que hacer',
    largo: 'Las finales son largas',
    dificil: 'Es difícil',
    facil: 'Es fácil o repetitivo',
    tecnico: 'Se veía o andaba mal',
    nada: 'Nada, me gustó',
  } },
  q3: { pregunta: '¿Dónde jugarías más a Tarima?', opciones: {
    telefono: 'En el teléfono',
    compu: 'En la computadora',
    tablet: 'En una tablet',
    consola: 'En una consola o la tele',
  } },
  q4: { pregunta: 'Si el juego completo tuviera un costo, ¿qué preferirías?', opciones: {
    unico: 'Pagar una vez y tenerlo entero',
    cosmeticos: 'Gratis, con cosas opcionales para tu pesista (ropa, cinturones)',
    publicidad: 'Gratis con publicidad',
    suscripcion: 'Una suscripción mensual',
    no: 'No pagaría',
  } },
  q5: { pregunta: '¿Qué te haría volver mañana?', abierta: true, max: 280 },
};

/** Valida las respuestas. Devuelve {ok:true, r} con la forma limpia, o {ok:false, error:'incompleta'|'formato'}. */
export function validarEncuesta(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, error: 'incompleta' };
  for (const k of Object.keys(r)) if (!(k in ENCUESTA)) return { ok: false, error: 'formato' };
  const limpio = {};
  for (const k of ['q1', 'q2']) {
    const q = ENCUESTA[k], v = r[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) return { ok: false, error: 'incompleta' };
    if (!Array.isArray(v) || v.length > 2 || new Set(v).size !== v.length) return { ok: false, error: 'formato' };
    if (!v.every(c => typeof c === 'string' && Object.hasOwn(q.opciones, c))) return { ok: false, error: 'formato' };
    if (q.exclusiva && v.includes(q.exclusiva) && v.length > 1) return { ok: false, error: 'formato' };
    limpio[k] = v;
  }
  for (const k of ['q3', 'q4']) {
    const v = r[k];
    if (v == null || v === '') return { ok: false, error: 'incompleta' };
    if (typeof v !== 'string' || !Object.hasOwn(ENCUESTA[k].opciones, v)) return { ok: false, error: 'formato' };
    limpio[k] = v;
  }
  if (r.q5 != null) {
    if (typeof r.q5 !== 'string') return { ok: false, error: 'formato' };
    // Sin caracteres de control ni HTML: se sacan; lo que queda tiene que entrar en 280.
    const t = r.q5.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/<[^>]*>?/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if ([...t].length > ENCUESTA.q5.max) return { ok: false, error: 'formato' };
    if (t) limpio.q5 = t;
  }
  return { ok: true, r: limpio };
}

/**
 * Propiedades del evento 'survey sent' de PostHog (encuesta de tipo API).
 * @param ids  {q1:'<uuid de la pregunta>', ...} desde ENCUESTA_PREGUNTAS
 */
export function propsEncuesta({ r, ids, encuestaId, envio, idioma: idi, pais }) {
  const props = {
    $survey_id: encuestaId,
    $survey_completed: true,
    $survey_submission_id: envio,
    $survey_questions: [],
    idioma: idi,
    pais: pais ?? null,
    $process_person_profile: false,
  };
  for (const k of Object.keys(ENCUESTA)) {
    const id = ids?.[k];
    if (!id) continue;
    const q = ENCUESTA[k];
    props.$survey_questions.push({ id, question: q.pregunta });
    if (r[k] == null) continue;
    props[`$survey_response_${id}`] = q.abierta ? r[k] : q.multiple ? r[k].map(c => q.opciones[c]) : q.opciones[r[k]];
  }
  return props;
}

// ---------- banderas (docs/MVP.md 6.5) ----------

export const BANDERAS = {
  'muro-partidas-gratis': { valores: ['1', '2'], defecto: '2', pegajosa: true },
  'muro-texto': { valores: ['a', 'b'], defecto: 'a', pegajosa: true },
  'invitacion-podio1': { valores: ['on', 'off'], defecto: 'on' },
  'grabacion': { valores: ['off', 'muestra'], defecto: 'off' },
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
