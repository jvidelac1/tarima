// Cliente del Worker de Tarima (docs/MVP.md 2, 5.5 y 7): estado, pase de cada final, lista de espera, encuesta y baja.
// La cuenta de las finales vive en el servidor; acá solo hay una copia para pintar el muro al instante.
//
// Uso (lo conecta main.js):
//   import { servidor } from './servidor.js';
//   const e = await servidor.estado({ idioma });         // P0: nunca tira; si el Worker no contesta en 4 s, vale la copia
//   const r = await servidor.pedirPase({ idioma });      // P4: ok | muro | sin_servidor | error
//   servidor.paseParaReanudar()                          // al cargar, antes de mirar el muro: ¿hay una final a medias?
//   await servidor.envion({ idioma })                    // permiso del dos tiempos de una final con etapa 'arranque'
//   servidor.finalTerminada()                            // en el podio (o cuando la final se corta en el intervalo)
//   await servidor.anotar({ email, nombre, idioma, novedades, sesion })
//   await servidor.encuesta({ r, idioma, sesion })
//   await servidor.baja({ email })
//
// Sin servidor de verdad:
// - En localhost con el servidor estático de Python (POST da 501, 404 o 405 sin JSON) el juego anda sin límite
//   (modo 'sin_api'): es lo que usan las pruebas del flujo «Pruebas del juego».
// - `?muro=firme` en localhost simula el Worker en el navegador con la regla de producción (GRATIS_ETAPA='arranque': el
//   arranque de 1 final gratis, muro en el intervalo, la encuesta termina esa final y suma 1, anotarse da juego libre), con
//   la cuenta en localStorage (`tarima.sim`) para que sobreviva a una recarga. `&etapa=final` simula la regla vieja (2
//   finales enteras y la encuesta +2); `?gratis=N` cambia cuántas.
// Fuera de localhost esos dos modos no existen.

export const CONSENTIMIENTO = '2026-11-c';     // versión de web/privacidad.html; el Worker acepta también la «a» y la «b»

const CLAVES = {
  dispositivo: 'tarima.dispositivo',
  muro: 'tarima.muro',
  quedan: 'tarima.quedan',
  lista: 'tarima.lista',
  motivo: 'tarima.motivo',
  pase: 'tarima.pase',      // sessionStorage: la final en curso, para reanudarla una vez si se recarga
  vivo: 'tarima.pase_vivo', // localStorage (lo ven todas las pestañas): qué pases tienen una final en juego y en qué carga
  sim: 'tarima.sim',
};

const ESPERA_ESTADO = 4000;          // P0: si no contesta en 4 s, vale la copia local
const ESPERA_PEDIDO = 3500;          // cada intento de /api/partida y de /api/envion
const REINTENTOS_PASE = [1000, 2000]; // «se reintenta 2 veces en 3 s» (P4)
const ESPERA_FORM = 10000;           // anotar, encuesta y baja
// Pase vivo: la pestaña que juega una final lo marca cada LATIDO ms y lo suelta al irse (pagehide). Otra pestaña solo
// puede reanudar esa final si la marca está suelta o lleva VIVO_MS sin latir (la pestaña que jugaba murió sin avisar).
// Así «Duplicar pestaña» (que copia el sessionStorage) no reanuda una final que sigue en juego en la original.
const LATIDO = 5000;
const VIVO_MS = 120000;              // holgado: Chrome espacia los temporizadores de una pestaña oculta

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esLocal = host => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';

// Almacenamiento que nunca tira (ventana privada de Safari, almacenamiento bloqueado, pruebas en node).
function almacen(s) {
  return {
    get(k) { try { return s ? s.getItem(k) : null; } catch { return null; } },
    set(k, v) { try { if (s) s.setItem(k, String(v)); } catch { /* sin almacenamiento */ } },
    del(k) { try { if (s) s.removeItem(k); } catch { /* sin almacenamiento */ } },
  };
}
const leerJson = (a, k) => { try { return JSON.parse(a.get(k) || 'null'); } catch { return null; } };
// La firma del pase (el tramo final): alcanza para reconocerlo sin guardar el pase entero en localStorage.
const firmaDelPase = pase => (typeof pase === 'string' && pase.includes('.') ? pase.slice(pase.lastIndexOf('.') + 1) : null);

function uuid4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Cuerpo del pase, sin verificar la firma: el pase es del servidor y acá solo se usa para saber hasta cuándo se puede
// reanudar la final y con qué etapa salió.
function cuerpoDelPase(pase) {
  const m = typeof pase === 'string' && pase.match(/^v1\.([A-Za-z0-9_-]+)\./);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const txt = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const j = JSON.parse(txt);      // el cuerpo del pase es JSON en ASCII
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}
// exp del pase (segundos).
export function expDelPase(pase) {
  const j = cuerpoDelPase(pase);
  return j && Number.isFinite(j.exp) ? j.exp : null;
}
// Etapa con la que el Worker entregó la final ('arranque' | 'completa'), o null si el pase no la dice (pases viejos).
export function etapaDelPase(pase) {
  const e = cuerpoDelPase(pase)?.e;
  return e === 'arranque' || e === 'completa' ? e : null;
}

// Revisión liviana del correo antes de mandarlo (la de verdad la hace el Worker).
export const pareceCorreo = e => typeof e === 'string' && e.trim().length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e.trim()) && /\.[a-z]{2,}$/i.test(e.trim());

// «¿Quisiste decir gmail.com?» (lista.sugerencia): un dominio común a 1 o 2 letras de distancia.
const DOMINIOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
  'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'hotmail.es', 'outlook.es', 'yahoo.es', 'live.com.mx',
  'hotmail.com.ar', 'yahoo.com.ar', 'live.com.ar', 'yahoo.com.mx', 'outlook.com.br', 'hotmail.co.uk', 'yahoo.co.uk'];
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export function sugerirCorreo(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return null;
  const dom = e.slice(at + 1);
  if (!dom || DOMINIOS.includes(dom)) return null;
  let mejor = null, dMin = 3;
  for (const d of DOMINIOS) { const x = distancia(dom, d); if (x < dMin) { dMin = x; mejor = d; } }
  return mejor && dMin <= 2 ? `${e.slice(0, at)}@${mejor}` : null;
}

class ErrorRed extends Error {
  constructor(tipo, status = 0, cuerpo = null) { super(tipo); this.tipo = tipo; this.status = status; this.cuerpo = cuerpo; }
}

/**
 * @param {object} o
 * @param {Function} [o.fetch]   fetch (en las pruebas, uno falso)
 * @param {Storage}  [o.local]   localStorage
 * @param {Storage}  [o.sesion]  sessionStorage
 * @param {string}   [o.base]    prefijo de las rutas ('' = el mismo sitio)
 * @param {string}   [o.host]    location.hostname
 * @param {string}   [o.buscar]  location.search
 */
export function crearServidor(o = {}) {
  const g = globalThis;
  const fetchFn = o.fetch || (g.fetch ? g.fetch.bind(g) : null);
  const local = almacen(o.local !== undefined ? o.local : (() => { try { return g.localStorage; } catch { return null; } })());
  const sesion = almacen(o.sesion !== undefined ? o.sesion : (() => { try { return g.sessionStorage; } catch { return null; } })());
  const base = o.base || '';
  const host = o.host ?? g.location?.hostname ?? '';
  const params = new URLSearchParams(o.buscar ?? g.location?.search ?? '');
  const ahora = o.ahora || (() => Date.now());
  const esperar = o.esperar || (ms => new Promise(r => setTimeout(r, ms)));
  // Ventana para el latido y pagehide/pageshow (en node no hay: las pruebas llaman a soltarPase()).
  const ventana = o.ventana !== undefined ? o.ventana : (typeof window !== 'undefined' ? window : null);
  const carga = uuid4();              // esta carga de la página (no se copia al duplicar la pestaña)

  // Endurecimiento 1 de docs/MVP.md 7: «sin servidor» solo con historia limpia. Si este navegador ya tenía
  // dispositivo al cargar la página, una falla del servidor no regala una final.
  const habiaDispositivo = UUID4.test(local.get(CLAVES.dispositivo) || '');
  let sinServidorUsado = false;
  let modo = esLocal(host) && params.get('muro') === 'firme' ? 'simulado' : 'servidor';
  let finalesSinApi = 0;

  function dispositivo() {
    let d = local.get(CLAVES.dispositivo);
    if (!UUID4.test(d || '')) { d = uuid4(); local.set(CLAVES.dispositivo, d); }
    return d.toLowerCase();
  }

  function copia() {
    const q = local.get(CLAVES.quedan);
    return {
      muro: local.get(CLAVES.muro) === '1',
      quedan: q == null || q === '' || q === 'null' ? null : Number(q),
      lista: local.get(CLAVES.lista) === '1',
      motivo: local.get(CLAVES.motivo) || null,
    };
  }
  function guardarCopia({ muro, quedan, lista, motivo }) {
    if (muro !== undefined) local.set(CLAVES.muro, muro ? '1' : '0');
    if (quedan !== undefined) quedan == null ? local.del(CLAVES.quedan) : local.set(CLAVES.quedan, quedan);
    if (lista !== undefined) local.set(CLAVES.lista, lista ? '1' : '0');
    if (motivo !== undefined) motivo ? local.set(CLAVES.motivo, motivo) : local.del(CLAVES.motivo);
  }

  // POST JSON con tiempo límite. Tira ErrorRed('red' | 'limite' | 'servidor' | 'sin_api' | 'http').
  async function post(ruta, cuerpo, espera) {
    if (modo === 'simulado') return simular(ruta, cuerpo);
    if (!fetchFn) throw new ErrorRed('red');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), espera) : null;
    let r;
    try {
      r = await fetchFn(base + ruta, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
        credentials: 'same-origin', cache: 'no-store', signal: ctl?.signal,
      });
    } catch {
      throw new ErrorRed('red');
    } finally {
      if (t) clearTimeout(t);
    }
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (r.ok && j && typeof j === 'object') return { status: r.status, j };
    if (r.status === 429) throw new ErrorRed('limite', 429, j);
    if (r.status >= 500 && !(r.status === 501 && !j)) throw new ErrorRed('servidor', r.status, j);
    // Servidor estático sin API (python -m http.server): 501, 404 o 405 sin JSON. Solo vale en localhost.
    if (!j && [404, 405, 501].includes(r.status) && esLocal(host)) throw new ErrorRed('sin_api', r.status);
    if (!j) throw new ErrorRed('servidor', r.status);
    throw new ErrorRed('http', r.status, j);
  }

  // ---------- estado (P0) ----------

  async function estado({ idioma } = {}) {
    const d = dispositivo();
    if (modo === 'sin_api') return estadoSinApi();
    try {
      const { j } = await post('/api/estado', { dispositivo: d, idioma }, ESPERA_ESTADO);
      if (UUID4.test(j.dispositivo || '')) local.set(CLAVES.dispositivo, j.dispositivo.toLowerCase());
      guardarCopia({ muro: !j.puede, quedan: j.lista ? null : j.quedan, lista: !!j.lista, motivo: j.puede ? null : j.motivo });
      return { ...j, fuente: 'servidor' };
    } catch (e) {
      if (e.tipo === 'sin_api') { modo = 'sin_api'; return estadoSinApi(); }
      const c = copia();
      return {
        fuente: 'copia', error: e.tipo, dispositivo: d, puede: !c.muro, quedan: c.lista ? null : c.quedan, lista: c.lista,
        motivo: c.muro ? c.motivo || 'dispositivo' : undefined, encuesta_disponible: false, flags: null, contexto: null, metricas: null,
      };
    }
  }
  const estadoSinApi = () => ({
    fuente: 'sin_api', dispositivo: dispositivo(), puede: true, quedan: null, lista: false, encuesta_disponible: false,
    flags: null, contexto: null, metricas: null,
  });

  // ---------- pase de cada final (P4) ----------

  async function pedirPase({ idioma } = {}) {
    const d = dispositivo();
    if (modo === 'sin_api') return { estado: 'ok', fuente: 'sin_api', pase: null, quedan: null, n: ++finalesSinApi };
    let ultimo = null;
    for (let k = 0; k <= REINTENTOS_PASE.length; k++) {
      try {
        const { j } = await post('/api/partida', { dispositivo: d, idioma }, ESPERA_PEDIDO);
        if (UUID4.test(j.dispositivo || '')) local.set(CLAVES.dispositivo, j.dispositivo.toLowerCase());
        if (j.estado === 'ok') {
          const libre = j.fuente === 'lista';
          guardarCopia({ quedan: libre ? null : j.quedan, lista: libre, muro: !libre && j.quedan === 0, motivo: !libre && j.quedan === 0 ? 'dispositivo' : null });
          const etapa = j.etapa === 'arranque' ? 'arranque' : 'completa';
          if (j.pase) {
            sesion.set(CLAVES.pase, JSON.stringify({ pase: j.pase, n: j.n, fuente: j.fuente, etapa, exp: expDelPase(j.pase), reanudado: false }));
            tomarPase(j.pase);
          }
          return { ...j, etapa, estado: 'ok' };
        }
        if (j.estado === 'muro') {
          guardarCopia({ muro: true, quedan: 0, lista: false, motivo: j.motivo || 'dispositivo' });
          return { ...j, estado: 'muro' };
        }
        ultimo = new ErrorRed('servidor');
        break;
      } catch (e) {
        if (e.tipo === 'sin_api') { modo = 'sin_api'; return pedirPase({ idioma }); }
        ultimo = e;
        // Se reintenta la falta de red y los 5xx; un 429 o un 4xx no cambian en 3 s.
        if ((e.tipo === 'red' || e.tipo === 'servidor') && k < REINTENTOS_PASE.length) { await esperar(REINTENTOS_PASE[k]); continue; }
        break;
      }
    }
    const error = ultimo?.tipo === 'limite' ? 'limite' : ultimo?.tipo === 'red' ? 'red' : 'servidor';
    const c = copia();
    // Anotado: juega igual (ya tiene juego libre).
    if (c.lista) return { estado: 'sin_servidor', fuente: 'lista', error };
    // La copia dice muro: muro, sin la encuesta (no se podría mandar).
    if (c.muro) return { estado: 'muro', motivo: c.motivo || 'dispositivo', encuesta_disponible: false, error };
    // Historia limpia (dispositivo creado en esta carga): una final por carga de página, como dice P4.
    if (!habiaDispositivo && !sinServidorUsado) {
      sinServidorUsado = true;
      return { estado: 'sin_servidor', fuente: 'sin_servidor', error };
    }
    return { estado: 'error', error };
  }

  // ---------- permiso del dos tiempos (POST /api/envion) ----------

  /**
   * Para una final que salió con etapa 'arranque': pide al Worker el permiso del dos tiempos con el pase de la pestaña.
   * Lo da con la lista o con el bono de la encuesta (una vez por dispositivo). Devuelve {estado:'ok', via} (y el pase
   * nuevo queda en la pestaña), {estado:'muro', motivo:'envion', encuesta_disponible} o {estado:'error', error}. Sin
   * servidor no hay dos tiempos gratis: un error se dice y se reintenta, no se juega igual.
   */
  async function envion({ idioma } = {}) {
    if (modo === 'sin_api') return { estado: 'ok', via: 'sin_api' };
    const p = leerJson(sesion, CLAVES.pase);
    if (!p || !p.pase) return { estado: 'error', error: 'pase' };
    let ultimo = null;
    for (let k = 0; k <= REINTENTOS_PASE.length; k++) {
      try {
        const { j } = await post('/api/envion', { dispositivo: dispositivo(), pase: p.pase, idioma }, ESPERA_PEDIDO);
        if (UUID4.test(j.dispositivo || '')) local.set(CLAVES.dispositivo, j.dispositivo.toLowerCase());
        if (j.estado === 'ok') {
          if (j.pase) {
            const viejo = firmaDelPase(p.pase);
            if (viejo) { const v = leerVivos(); delete v[viejo]; guardarVivos(v); }
            sesion.set(CLAVES.pase, JSON.stringify({ ...p, pase: j.pase, etapa: 'completa', exp: expDelPase(j.pase) }));
            tomarPase(j.pase);
          }
          if (j.lista) guardarCopia({ lista: true, muro: false, quedan: null, motivo: null });
          else if (Number.isFinite(j.quedan)) guardarCopia({ quedan: j.quedan, muro: j.quedan === 0, motivo: j.quedan === 0 ? 'dispositivo' : null });
          return { ...j, estado: 'ok' };
        }
        if (j.estado === 'muro') return { ...j, estado: 'muro', motivo: j.motivo || 'envion' };
        ultimo = new ErrorRed('servidor');
        break;
      } catch (e) {
        if (e.tipo === 'sin_api') { modo = 'sin_api'; return { estado: 'ok', via: 'sin_api' }; }
        ultimo = e;
        if ((e.tipo === 'red' || e.tipo === 'servidor') && k < REINTENTOS_PASE.length) { await esperar(REINTENTOS_PASE[k]); continue; }
        break;
      }
    }
    const error = ultimo?.tipo === 'http' && ultimo.cuerpo?.error === 'pase' ? 'pase' : ultimo?.tipo === 'limite' ? 'limite' : ultimo?.tipo === 'red' ? 'red' : 'servidor';
    return { estado: 'error', error };
  }

  // ---------- pase vivo (compartido entre pestañas) ----------

  let paseActual = null;              // firma del pase que juega esta carga
  let latido = null;
  const leerVivos = () => { const v = leerJson(local, CLAVES.vivo); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  function guardarVivos(v) {
    const t = ahora();
    for (const f of Object.keys(v)) if (!(Number.isFinite(v[f]?.exp) && v[f].exp * 1000 > t)) delete v[f];   // vencidos fuera
    Object.keys(v).length ? local.set(CLAVES.vivo, JSON.stringify(v)) : local.del(CLAVES.vivo);
  }
  function tomarPase(pase) {
    const f = firmaDelPase(pase);
    if (!f) return;
    paseActual = f;
    const v = leerVivos();
    v[f] = { c: carga, t: ahora(), suelto: false, exp: expDelPase(pase) };
    guardarVivos(v);
    if (ventana && !latido && typeof ventana.setInterval === 'function') latido = ventana.setInterval(latir, LATIDO);
  }
  function latir() {
    if (!paseActual) return;
    const v = leerVivos(), m = v[paseActual];
    if (!m || m.c !== carga) return;      // la final terminó en otra pestaña, o la tomó otra carga
    m.t = ahora(); m.suelto = false;
    guardarVivos(v);
  }
  // pagehide (recargar, cerrar o irse): la final queda para que la reanude la próxima carga de esta pestaña.
  function soltarPase() {
    if (!paseActual) return;
    const v = leerVivos(), m = v[paseActual];
    if (m && m.c === carga) { m.suelto = true; guardarVivos(v); }
  }
  if (ventana && typeof ventana.addEventListener === 'function') {
    ventana.addEventListener('pagehide', soltarPase);
    ventana.addEventListener('pageshow', e => { if (e?.persisted) latir(); });   // volvió desde la caché de atrás/adelante
  }

  // Al cargar: si en esta pestaña quedó una final a medias con su pase vigente, se reanuda UNA vez sin pedir otro.
  // La segunda recarga la da por gastada (devuelve null y la borra). Y solo si ninguna otra pestaña la está jugando: el
  // sessionStorage se copia al duplicar la pestaña, la marca en localStorage la comparten todas.
  // Una final con etapa 'arranque' (el arranque gratis, sin permiso del dos tiempos) no se reanuda nunca: la final se
  // reanuda desde el principio, y eso regalaría otro arranque. Se da por gastada y el servidor decide (muro).
  function paseParaReanudar() {
    const p = leerJson(sesion, CLAVES.pase);
    if (!p || !p.pase) return null;
    // La etapa es la de la pestaña o la del propio pase: una pestaña que pidió el pase con el juego anterior (sin `etapa`
    // guardada) y recarga con el nuevo tampoco reanuda el arranque gratis como si fuera una final completa.
    const etapa = p.etapa === 'arranque' || etapaDelPase(p.pase) === 'arranque' ? 'arranque' : 'completa';
    if (etapa === 'arranque') {
      sesion.del(CLAVES.pase);
      const f = firmaDelPase(p.pase), v = leerVivos();
      if (f && v[f] && (v[f].suelto || ahora() - v[f].t >= VIVO_MS)) { delete v[f]; guardarVivos(v); }
      return null;
    }
    const vigente = Number.isFinite(p.exp) && p.exp * 1000 > ahora();
    const m = leerVivos()[firmaDelPase(p.pase)];
    const enJuego = m && !m.suelto && ahora() - m.t < VIVO_MS;
    if (p.reanudado || !vigente || !m || enJuego) { sesion.del(CLAVES.pase); return null; }
    p.reanudado = true;
    sesion.set(CLAVES.pase, JSON.stringify(p));
    tomarPase(p.pase);
    return { pase: p.pase, n: p.n, fuente: p.fuente, etapa };
  }
  function finalTerminada() {
    sesion.del(CLAVES.pase);
    if (paseActual) { const v = leerVivos(); delete v[paseActual]; guardarVivos(v); }
    paseActual = null;
    if (latido && ventana) { ventana.clearInterval(latido); latido = null; }
  }

  // ---------- lista de espera ----------

  async function anotar({ email, nombre, idioma, novedades = false, aviso = true, sesion: idSesion, web = '' } = {}) {
    if (!pareceCorreo(email)) return { ok: false, error: 'formato' };
    if (aviso !== true) return { ok: false, error: 'aviso' };
    const cuerpo = {
      dispositivo: dispositivo(), sesion: idSesion || undefined, email: email.trim(), idioma, aviso: true,
      novedades: novedades === true, consentimiento: CONSENTIMIENTO, web,
    };
    if (typeof nombre === 'string' && nombre.trim() && !/^(debutante|rookie)$/i.test(nombre.trim())) cuerpo.nombre = nombre.trim();
    try {
      const { j } = await post('/api/anotar', cuerpo, ESPERA_FORM);
      guardarCopia({ lista: true, muro: false, quedan: null, motivo: null });
      return { ok: true, estado: j.estado, lista_id: j.lista_id, confirmar: !!j.confirmar };
    } catch (e) {
      return { ok: false, error: errorDeFormulario(e) };
    }
  }

  async function encuesta({ r, idioma, sesion: idSesion } = {}) {
    try {
      const { j } = await post('/api/encuesta', { dispositivo: dispositivo(), sesion: idSesion || undefined, idioma, r }, ESPERA_FORM);
      const bono = Number(j.bono) || 0;
      if (bono > 0) {
        const c = copia();
        guardarCopia({ muro: false, quedan: (c.muro ? 0 : c.quedan || 0) + bono, motivo: null });
      }
      return { ok: true, bono };
    } catch (e) {
      return { ok: false, error: errorDeFormulario(e) };
    }
  }

  async function baja({ email } = {}) {
    if (!pareceCorreo(email)) return { ok: false, error: 'formato' };
    try {
      await post('/api/baja', { email: email.trim(), dispositivo: local.get(CLAVES.dispositivo) || undefined }, ESPERA_FORM);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorDeFormulario(e) };
    }
  }

  // 400 {error} → el código del Worker (formato, dominio, descartable, aviso, incompleta…); 409 → ya_respondida;
  // 429 → limite; lo demás → red.
  function errorDeFormulario(e) {
    if (e.tipo === 'limite') return 'limite';
    if (e.tipo === 'http' && e.status === 409) return 'ya_respondida';
    if (e.tipo === 'http' && e.cuerpo && typeof e.cuerpo.error === 'string') return e.cuerpo.error;
    return 'red';
  }

  // ---------- Worker simulado (`?muro=firme`, solo localhost) ----------

  function simular(ruta, b) {
    const etapaGratis = params.get('etapa') === 'final' ? 'final' : 'arranque';
    const gratis = Math.max(1, Math.min(9, Number(params.get('gratis')) || (etapaGratis === 'final' ? 2 : 1)));
    const bono = etapaGratis === 'final' ? 2 : 1;
    const s = leerJson(local, CLAVES.sim) || { usadas: 0, encuesta: false, lista: false };
    s.finales = s.finales || {};      // etapa de cada final entregada, por número
    const cupo = gratis + (s.encuesta ? bono : 0);
    const quedan = s.lista ? null : Math.max(0, cupo - s.usadas);
    const etapa = etapaGratis === 'arranque' && !s.lista && !s.encuesta ? 'arranque' : 'completa';
    const guardar = () => local.set(CLAVES.sim, JSON.stringify(s));
    const flags = { 'muro-partidas-gratis': String(gratis), 'muro-texto': params.get('texto') === 'b' ? 'b' : 'a', 'invitacion-podio1': 'on', grabacion: 'tercio' };
    const contexto = { pais: null, previas: s.usadas, dias: '0' };
    const regla = { etapa: etapaGratis, gratis, bono };
    const ok = j => Promise.resolve({ status: 200, j });
    const armarPase = (n, fuente, e) => {
      const exp = Math.floor(ahora() / 1000) + 3 * 3600;
      const cuerpo = btoa(JSON.stringify({ d: 'simulado', n, f: fuente, e, p: n, exp })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `v1.${cuerpo}.simulado${n}${e}`;
    };
    if (ruta === '/api/estado') {
      const r = { dispositivo: b.dispositivo, puede: s.lista || quedan > 0, quedan, lista: s.lista, etapa, encuesta_disponible: !s.encuesta, flags, contexto, regla, metricas: null };
      if (s.lista) r.lista_id = 'simulado';
      if (!r.puede) r.motivo = 'dispositivo';
      return ok(r);
    }
    if (ruta === '/api/partida') {
      if (!s.lista && quedan <= 0) return ok({ estado: 'muro', motivo: 'dispositivo', encuesta_disponible: !s.encuesta, dispositivo: b.dispositivo, flags, contexto, regla });
      const fuente = s.lista ? 'lista' : s.usadas < gratis ? 'gratis' : 'encuesta';
      s.n = (s.n || 0) + 1;
      if (!s.lista) s.usadas++;
      s.finales[s.n] = etapa;
      guardar();
      return ok({ estado: 'ok', pase: armarPase(s.n, fuente, etapa), fuente, etapa, quedan: s.lista ? null : quedan - 1, n: s.n, dispositivo: b.dispositivo, flags, contexto, regla });
    }
    if (ruta === '/api/envion') {
      let n = null;
      try { n = JSON.parse(atob(String(b.pase).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).p; } catch { n = null; }
      if (!n || !s.finales[n]) return Promise.reject(new ErrorRed('http', 400, { error: 'pase' }));
      let via = 'ya';
      if (s.finales[n] === 'arranque') {
        if (s.lista) via = 'lista';
        else if (s.encuesta && !s.envionEncuesta) { via = 'encuesta'; s.envionEncuesta = true; }
        else return ok({ estado: 'muro', motivo: 'envion', encuesta_disponible: !s.encuesta, dispositivo: b.dispositivo, regla });
        s.finales[n] = 'completa'; guardar();
      }
      return ok({ estado: 'ok', via, pase: armarPase(n, 'gratis', 'completa'), quedan, lista: s.lista, dispositivo: b.dispositivo, regla });
    }
    if (ruta === '/api/anotar') {
      if (/@(noexiste|mailinator)\./.test(b.email)) return Promise.reject(new ErrorRed('http', 400, { error: /noexiste/.test(b.email) ? 'dominio' : 'descartable' }));
      const ya = s.lista; s.lista = true; guardar();
      return ok({ estado: ya ? 'ya_estaba' : 'nuevo', lista_id: 'simulado', confirmar: false });
    }
    if (ruta === '/api/encuesta') {
      if (s.encuesta) return Promise.reject(new ErrorRed('http', 409, { error: 'ya_respondida' }));
      s.encuesta = true; guardar();
      return ok({ estado: 'ok', bono: s.lista ? 0 : bono });
    }
    if (ruta === '/api/baja') return Promise.resolve({ status: 202, j: {} });
    return Promise.reject(new ErrorRed('http', 404, { error: 'no_existe' }));
  }

  return {
    get modo() { return modo; },
    dispositivo, copia, estado, pedirPase, envion, paseParaReanudar, finalTerminada, soltarPase, anotar, encuesta, baja,
  };
}

// La instancia del juego (en el navegador). En node, `servidor` es null y las pruebas usan crearServidor().
export const servidor = typeof window !== 'undefined' ? crearServidor() : null;
