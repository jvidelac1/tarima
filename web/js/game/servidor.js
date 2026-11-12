// Cliente del Worker de Tarima (docs/MVP.md 2, 5.5 y 7): estado, pase de cada final, lista de espera, encuesta y baja.
// La cuenta de las finales vive en el servidor; acá solo hay una copia para pintar el muro al instante.
//
// Uso (lo conecta main.js):
//   import { servidor } from './servidor.js';
//   const e = await servidor.estado({ idioma });         // P0: nunca tira; si el Worker no contesta en 4 s, vale la copia
//   const r = await servidor.pedirPase({ idioma });      // P4: ok | muro | sin_servidor | error
//   servidor.paseParaReanudar()                          // al cargar, antes de mirar el muro: ¿hay una final a medias?
//   servidor.finalTerminada()                            // en el podio
//   await servidor.anotar({ email, nombre, idioma, novedades, sesion })
//   await servidor.encuesta({ r, idioma, sesion })
//   await servidor.baja({ email })
//
// Sin servidor de verdad:
// - En localhost con el servidor estático de Python (POST da 501, 404 o 405 sin JSON) el juego anda sin límite
//   (modo 'sin_api'): es lo que usan las pruebas del flujo «Pruebas del juego».
// - `?muro=firme` en localhost simula el Worker en el navegador (2 finales, muro, encuesta +2, anotarse da juego libre),
//   con la cuenta en localStorage (`tarima.sim`) para que sobreviva a una recarga. `?gratis=1` cambia las 2 por 1.
// Fuera de localhost esos dos modos no existen.

export const CONSENTIMIENTO = '2026-11-c';     // versión de web/privacidad.html; el Worker acepta también la «a» y la «b»

const CLAVES = {
  dispositivo: 'tarima.dispositivo',
  muro: 'tarima.muro',
  quedan: 'tarima.quedan',
  lista: 'tarima.lista',
  motivo: 'tarima.motivo',
  pase: 'tarima.pase',      // sessionStorage: la final en curso, para reanudarla una vez si se recarga
  sim: 'tarima.sim',
};

const ESPERA_ESTADO = 4000;          // P0: si no contesta en 4 s, vale la copia local
const ESPERA_PEDIDO = 3500;          // cada intento de /api/partida
const REINTENTOS_PASE = [1000, 2000]; // «se reintenta 2 veces en 3 s» (P4)
const ESPERA_FORM = 10000;           // anotar, encuesta y baja

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

function uuid4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// exp del pase (segundos), sin verificar la firma: el pase es del servidor y acá solo se usa para saber hasta cuándo
// se puede reanudar la final.
export function expDelPase(pase) {
  const m = typeof pase === 'string' && pase.match(/^v1\.([A-Za-z0-9_-]+)\./);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const txt = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const j = JSON.parse(txt);      // el cuerpo del pase es JSON en ASCII
    return Number.isFinite(j.exp) ? j.exp : null;
  } catch { return null; }
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
          if (j.pase) sesion.set(CLAVES.pase, JSON.stringify({ pase: j.pase, n: j.n, fuente: j.fuente, exp: expDelPase(j.pase), reanudado: false }));
          return { ...j, estado: 'ok' };
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

  // Al cargar: si en esta pestaña quedó una final a medias con su pase vigente, se reanuda UNA vez sin pedir otro.
  // La segunda recarga la da por gastada (devuelve null y la borra).
  function paseParaReanudar() {
    const p = leerJson(sesion, CLAVES.pase);
    if (!p || !p.pase) return null;
    const vigente = Number.isFinite(p.exp) && p.exp * 1000 > ahora();
    if (p.reanudado || !vigente) { sesion.del(CLAVES.pase); return null; }
    p.reanudado = true;
    sesion.set(CLAVES.pase, JSON.stringify(p));
    return { pase: p.pase, n: p.n, fuente: p.fuente };
  }
  const finalTerminada = () => sesion.del(CLAVES.pase);

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
    const gratis = Math.max(1, Math.min(9, Number(params.get('gratis')) || 2));
    const s = leerJson(local, CLAVES.sim) || { usadas: 0, encuesta: false, lista: false };
    const cupo = gratis + (s.encuesta ? 2 : 0);
    const quedan = s.lista ? null : Math.max(0, cupo - s.usadas);
    const guardar = () => local.set(CLAVES.sim, JSON.stringify(s));
    const flags = { 'muro-partidas-gratis': String(gratis), 'muro-texto': params.get('texto') === 'b' ? 'b' : 'a', 'invitacion-podio1': 'on', grabacion: 'tercio' };
    const contexto = { pais: null, previas: s.usadas, dias: '0' };
    const ok = j => Promise.resolve({ status: 200, j });
    if (ruta === '/api/estado') {
      const r = { dispositivo: b.dispositivo, puede: s.lista || quedan > 0, quedan, lista: s.lista, encuesta_disponible: !s.encuesta, flags, contexto, metricas: null };
      if (s.lista) r.lista_id = 'simulado';
      if (!r.puede) r.motivo = 'dispositivo';
      return ok(r);
    }
    if (ruta === '/api/partida') {
      if (!s.lista && quedan <= 0) return ok({ estado: 'muro', motivo: 'dispositivo', encuesta_disponible: !s.encuesta, dispositivo: b.dispositivo, flags, contexto });
      const fuente = s.lista ? 'lista' : s.usadas < gratis ? 'gratis' : 'encuesta';
      if (!s.lista) s.usadas++;
      guardar();
      const exp = Math.floor(ahora() / 1000) + 3 * 3600;
      const cuerpo = btoa(JSON.stringify({ d: 'simulado', n: s.usadas, f: fuente, exp })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return ok({ estado: 'ok', pase: `v1.${cuerpo}.simulado`, fuente, quedan: s.lista ? null : quedan - 1, n: s.usadas, dispositivo: b.dispositivo, flags, contexto });
    }
    if (ruta === '/api/anotar') {
      if (/@(noexiste|mailinator)\./.test(b.email)) return Promise.reject(new ErrorRed('http', 400, { error: /noexiste/.test(b.email) ? 'dominio' : 'descartable' }));
      const ya = s.lista; s.lista = true; guardar();
      return ok({ estado: ya ? 'ya_estaba' : 'nuevo', lista_id: 'simulado', confirmar: false });
    }
    if (ruta === '/api/encuesta') {
      if (s.encuesta) return Promise.reject(new ErrorRed('http', 409, { error: 'ya_respondida' }));
      s.encuesta = true; guardar();
      return ok({ estado: 'ok', bono: s.lista ? 0 : 2 });
    }
    if (ruta === '/api/baja') return Promise.resolve({ status: 202, j: {} });
    return Promise.reject(new ErrorRed('http', 404, { error: 'no_existe' }));
  }

  return {
    get modo() { return modo; },
    dispositivo, copia, estado, pedirPase, paseParaReanudar, finalTerminada, anotar, encuesta, baja,
  };
}

// La instancia del juego (en el navegador). En node, `servidor` es null y las pruebas usan crearServidor().
export const servidor = typeof window !== 'undefined' ? crearServidor() : null;
