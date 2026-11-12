// Integración del servidor y de las métricas con el flujo del juego (docs/MVP.md 2, 5, 6 y 7). Reemplaza los ganchos de
// fábrica (ganchos.js): main.js no sabe qué hay detrás.
//  - P0: estado al cargar (servidor.estado, 4 s como mucho, si no la copia local) y arranque de PostHog (analitica.iniciar).
//  - P4: pase de cada final (servidor.pedirPase), con reanudación de una final cortada por una recarga, y un panel de
//    «No pudimos conectar» cuando el servidor no contesta y no corresponde regalar una final.
//  - P8: invitación suave en el podio 1 (bandera invitacion-podio1) y muro en el podio de la última final gratis.
//  - P9 a P11: el muro con sus dos caminos (correo o encuesta), la encuesta y el alta en la lista.
// Todo lo que se ve sale del diccionario (i18n/) y lo escrito por la persona entra escapado. El correo nunca va a las
// métricas (analitica.js descarta cualquier propiedad con «@»).
import { ganchos } from './ganchos.js';
import { servidor, sugerirCorreo, pareceCorreo } from './servidor.js';
import { analitica } from './analitica.js';
import { t, esc, idiomaActual, alCambiarIdioma, IDIOMAS } from './i18n/t.js';

const guardado = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const S = { estado: null, quedan: null, lista: false, reanudar: null, previas: 0, gratis: 2, encuesta: false, pantalla: () => '', cambiarIdioma: null };
const encuestaHecha = () => guardado.get('tarima.encuesta') === '1';

/** Selector ES · EN dentro de un panel (el clic lo atiende main.js para todas las pantallas). */
const idiomasHTML = () => `<div class="idiomas flota" role="group" aria-label="${esc(t('app.idioma'))}">${IDIOMAS.map(l => `<button class="idi" data-lang="${l}" lang="${l}" aria-pressed="${l === idiomaActual()}">${l.toUpperCase()}</button>`).join('')}</div>`;
const privacidad = () => `<a href="privacidad.html?lang=${idiomaActual()}" target="_blank" rel="noopener" class="privacidad">${t('app.privacidad')}</a>`;

/** Pinta un panel en #capa con el foco en su botón principal (o en `foco`). */
function panel(capa, html, clase = 'chico', foco = null) {
  capa.innerHTML = `<div class="panel ${clase}">${html}</div>`;
  const pn = capa.firstElementChild;
  pn.querySelectorAll('a.privacidad').forEach(a => a.addEventListener('click', () => analitica.ev('privacidad_abierta', { pantalla: S.pantalla() })));
  const f = foco ? pn.querySelector(foco) : pn.querySelector('button.ir:not(:disabled)');
  if (f && !matchMedia('(pointer:coarse)').matches) f.focus({ preventScroll: true });
  return pn;
}
/** Repinta lo que haga falta cuando cambia el idioma, hasta que se llama a la función devuelta. */
const alIdioma = f => alCambiarIdioma(() => f());

// ---------- formulario de la lista (muro e invitación) ----------
/**
 * Formulario del correo: campo, casilla de aviso (obligatoria), novedades (opcional), línea legal y botón. Devuelve el
 * HTML; `atar(raiz, {pantalla, alAnotar})` lo hace andar. `alAnotar(r)` recibe la respuesta de servidor.anotar si salió bien.
 */
const formularioHTML = (o = {}) => `<div class="formulario">
  ${o.camino ? `<p class="camino">${o.camino}</p>` : ''}
  <label class="campo" for="correo"><span>${t('lista.mail')}</span><input id="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" enterkeyhint="send" maxlength="254" placeholder="${esc(t('lista.mail_ph'))}" value="${esc(o.correo || '')}"></label>
  <p class="sugerencia" hidden><button class="link" type="button" id="sug"></button></p>
  <label class="casilla"><input type="checkbox" id="aviso"${o.aviso ? ' checked' : ''}><span>${t('lista.aviso')}</span></label>
  <label class="casilla"><input type="checkbox" id="novedades"${o.novedades ? ' checked' : ''}><span>${t('lista.novedades')}</span></label>
  <p class="chica legal">${t('lista.legal')} ${privacidad()}</p>
  <p class="error" id="err" role="alert" hidden></p>
  <div class="fila"><button class="ir grande" id="btn-anotar">${t('lista.boton')}</button></div>
  ${o.otro ? `<p class="chica">${t('muro.otro_dispositivo')}</p>` : ''}
</div>`;
const leerFormulario = raiz => ({ correo: raiz.querySelector('#correo')?.value || '', aviso: !!raiz.querySelector('#aviso')?.checked, novedades: !!raiz.querySelector('#novedades')?.checked });

function atarFormulario(raiz, { pantalla, nombre, alAnotar }) {
  const inp = raiz.querySelector('#correo'), err = raiz.querySelector('#err'), sug = raiz.querySelector('.sugerencia'), btn = raiz.querySelector('#btn-anotar');
  let usoSugerencia = false, foco = false;
  const error = k => { err.hidden = !k; err.textContent = k ? t(k) : ''; };
  const sugerir = () => { const s = sugerirCorreo(inp.value); sug.hidden = !s; if (s) { sug.firstElementChild.textContent = t('lista.sugerencia', { sugerido: s }); sug.firstElementChild.dataset.v = s; } };
  inp.addEventListener('focus', () => { if (!foco) { foco = true; analitica.ev('mail_foco', { pantalla }); } });
  inp.addEventListener('change', sugerir); inp.addEventListener('blur', sugerir);
  sug.firstElementChild.addEventListener('click', () => { inp.value = sug.firstElementChild.dataset.v; usoSugerencia = true; sug.hidden = true; });
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const f = leerFormulario(raiz);
    if (!pareceCorreo(f.correo)) { error('lista.error_formato'); analitica.ev('anotar_error', { motivo: 'formato' }); return; }
    if (!f.aviso) { error('lista.error_aviso'); analitica.ev('anotar_error', { motivo: 'aviso' }); return; }
    error(null); analitica.ev('anotar_envio', { novedades: f.novedades, sugerencia_usada: usoSugerencia, pantalla });
    btn.disabled = true; btn.textContent = t('lista.enviando');
    const r = await servidor.anotar({ email: f.correo, nombre, idioma: idiomaActual(), novedades: f.novedades, sesion: analitica.idSesion() });
    btn.disabled = false; btn.textContent = t('lista.boton');
    if (!r.ok) {
      const k = { formato: 'lista.error_formato', dominio: 'lista.error_dominio', descartable: 'lista.error_descartable', aviso: 'lista.error_aviso', limite: 'lista.error_limite' }[r.error] || 'lista.error_red';
      error(k); analitica.ev('anotar_error', { motivo: ['formato', 'dominio', 'descartable', 'aviso', 'limite'].includes(r.error) ? r.error : 'red' }); return;
    }
    analitica.identificar(r.lista_id);
    analitica.ev('anotar_ok', { estado: r.estado, pantalla, finales_previas: S.previas });
    S.lista = true; S.quedan = null;
    alAnotar(r);
  });
}

// ---------- encuesta (P10) ----------
const PREGUNTAS = [
  { q: 'q1', ops: ['pesista_propio', 'carrera', 'sedes', 'mujeres_categorias', 'amigos_online', 'realismo'], max: 2 },
  { q: 'q2', ops: ['no_entendi', 'largo', 'dificil', 'facil', 'tecnico', 'nada'], max: 2, sola: 'nada' },
  { q: 'q3', ops: ['telefono', 'compu', 'tablet', 'consola'], max: 1 },
  { q: 'q4', ops: ['unico', 'cosmeticos', 'publicidad', 'suscripcion', 'no'], max: 1 },
];
/** La encuesta en #capa. Resuelve 'ok' (mandada; `bono` en S), 'ya' (ya se había contestado) o 'volver'. */
function encuesta(capa, { conPremio }) {
  analitica.encuestaVista({ con_premio: conPremio });
  const R = { q1: [], q2: [], q3: '', q4: '', q5: '' };
  return new Promise(res => {
    let fin = false, nota = null;
    const pinta = () => {
      const q5 = capa.querySelector('#q5'); if (q5) R.q5 = q5.value;
      const pn = panel(capa, `${idiomasHTML()}<h2>${t('encuesta.titulo')}</h2>${conPremio ? `<p class="cuenta">${t('encuesta.premio')}</p>` : ''}
        ${PREGUNTAS.map(P => `<fieldset class="pregunta"><legend>${t('encuesta.' + P.q)}</legend><div class="opciones-q">${P.ops.map(o => `<button type="button" class="op" data-q="${P.q}" data-o="${o}" aria-pressed="${P.max === 1 ? R[P.q] === o : R[P.q].includes(o)}">${t(`encuesta.${P.q}.${o}`)}</button>`).join('')}</div></fieldset>`).join('')}
        <label class="campo" for="q5"><span>${t('encuesta.q5')}</span><textarea id="q5" rows="2" maxlength="280" enterkeyhint="done" placeholder="${esc(t('encuesta.q5_ph'))}">${esc(R.q5)}</textarea></label>
        <p class="error" id="err" role="alert"${nota ? '' : ' hidden'}>${nota ? t(nota) : ''}</p>
        <div class="fila"><button class="ir grande" id="btn-enviar">${t(conPremio ? 'encuesta.enviar' : 'encuesta.enviar_anotado')}</button><button id="btn-volver">${t('encuesta.volver')}</button></div>`, 'encuesta');
      pn.querySelectorAll('.op').forEach(b => b.addEventListener('click', () => {
        const P = PREGUNTAS.find(x => x.q === b.dataset.q), o = b.dataset.o;
        if (P.max === 1) R[P.q] = o;
        else {
          let v = R[P.q].includes(o) ? R[P.q].filter(x => x !== o) : [...R[P.q], o];
          if (P.sola && o === P.sola && v.includes(o)) v = [o]; else if (P.sola) v = v.filter(x => x !== P.sola);
          R[P.q] = v.slice(-P.max);
        }
        for (const x of pn.querySelectorAll(`.op[data-q="${P.q}"]`)) x.setAttribute('aria-pressed', P.max === 1 ? String(R[P.q] === x.dataset.o) : String(R[P.q].includes(x.dataset.o)));
      }));
      pn.querySelector('#btn-volver').addEventListener('click', () => { if (fin) return; fin = true; quitar(); analitica.encuestaCerrada(); res('volver'); });
      pn.querySelector('#btn-enviar').addEventListener('click', async e => {
        const btn = e.currentTarget; if (fin || btn.disabled) return;
        R.q5 = pn.querySelector('#q5').value;
        const err = pn.querySelector('#err'), decir = k => { nota = k; err.hidden = false; err.textContent = t(k); };
        if (!R.q1.length || !R.q2.length || !R.q3 || !R.q4) return decir('encuesta.falta');
        btn.disabled = true;
        const r = await servidor.encuesta({ r: { q1: R.q1, q2: R.q2, q3: R.q3, q4: R.q4, ...(R.q5.trim() ? { q5: R.q5.trim().slice(0, 280) } : {}) }, idioma: idiomaActual(), sesion: analitica.idSesion() });
        btn.disabled = false;
        if (r.ok) {
          fin = true; quitar(); guardado.set('tarima.encuesta', '1'); S.encuesta = false;
          analitica.ev('encuesta_enviada', { con_premio: r.bono > 0 });
          if (r.bono > 0) S.quedan = (S.quedan || 0) + r.bono;
          panel(capa, `<h2>${t(r.bono > 0 ? 'encuesta.ok' : 'encuesta.ok_anotado')}</h2>`, 'chico');
          setTimeout(() => res('ok'), 1600); return;
        }
        if (r.error === 'ya_respondida') { fin = true; quitar(); guardado.set('tarima.encuesta', '1'); panel(capa, `<h2>${t('encuesta.ya')}</h2>`, 'chico'); setTimeout(() => res('ya'), 1800); return; }
        decir(r.error === 'limite' ? 'lista.error_limite' : r.error === 'incompleta' ? 'encuesta.falta' : 'lista.error_red');
      });
    };
    const quitar = alIdioma(() => { if (!fin) pinta(); });
    pinta();
  });
}

// ---------- muro (P9) y anotado (P11) ----------
/**
 * El muro. Resuelve true si la persona puede jugar otra final (se anotó, o contestó la encuesta con premio) y false si
 * vuelve al inicio («Ahora no» y después «Volver al inicio»).
 */
async function muro(info) {
  const capa = info.capa, motivo = info.motivo || 'dispositivo';
  for (;;) {
    // en el podio no hay respuesta nueva del servidor: vale lo último que dijo (al cargar o en el último pase)
    const disponible = !!(info.encuesta_disponible ?? S.encuesta) && !encuestaHecha();
    const soloMail = !disponible && (encuestaHecha() || S.previas > S.gratis);
    const variante = analitica.bandera('muro-texto') === 'b' ? 'b' : 'a';
    analitica.ev('muro_visto', { motivo, caminos: disponible ? 'mail+encuesta' : 'mail', origen: info.origen || 'podio', variante_texto: variante, previas: S.previas });
    const r = await new Promise(res => {
      let datos = { aviso: false, novedades: false, correo: '' }, despues = false, cerrado = false;
      const pinta = () => {
        const prev = capa.querySelector('.formulario'); if (prev) datos = leerFormulario(prev);
        const n = S.previas || S.gratis;
        const titulo = motivo === 'ip' ? t('muro.titulo_ip') : n === 1 ? t('muro.titulo_1', { nombre: esc(info.nombre) }) : t('muro.titulo', { nombre: esc(info.nombre), n });
        const pn = panel(capa, `${idiomasHTML()}<h1>${titulo}</h1><p class="bajada">${t(variante === 'b' ? 'muro.promesa_b' : 'muro.promesa')}</p>
          <div class="muro-cuerpo">${formularioHTML({ ...datos, camino: `<b>${t(variante === 'b' ? 'muro.camino_mail_b' : 'muro.camino_mail')}</b>`, otro: true })}
          ${disponible ? `<div class="camino-encuesta"><p>${t('muro.camino_encuesta')}</p><button id="btn-encuesta">${t('muro.encuesta_boton')}</button></div>` : soloMail ? `<p class="chica">${t('muro.solo_mail')}</p>` : ''}</div>
          <div class="fila">${despues ? `<p class="chica">${t('muro.despues')}</p><button id="btn-volver">${t('muro.volver')}</button>` : `<button id="btn-ahora-no">${t('muro.ahora_no')}</button>`}</div>`, 'muro', null);
        atarFormulario(pn.querySelector('.formulario'), { pantalla: 'muro', nombre: info.nombre, alAnotar: x => { cerrado = true; quitar(); res({ anotado: x }); } });
        pn.querySelector('#btn-encuesta')?.addEventListener('click', () => { cerrado = true; quitar(); res({ encuesta: true }); });
        pn.querySelector('#btn-ahora-no')?.addEventListener('click', () => { analitica.ev('muro_ahora_no'); despues = true; pinta(); });
        pn.querySelector('#btn-volver')?.addEventListener('click', () => { cerrado = true; quitar(); res({ volver: true }); });
      };
      const quitar = alIdioma(() => { if (!cerrado) pinta(); });
      pinta();
    });
    if (r.volver) return false;
    if (r.encuesta) {
      const e = await encuesta(capa, { conPremio: true });
      if (e === 'ok') return true;
      if (e === 'ya') info = { ...info, encuesta_disponible: false };
      continue;
    }
    if (r.anotado) { await anotado(capa, r.anotado, info.nombre); return true; }
  }
}
/** P11: «¡Adentro!», con la encuesta sin premio si todavía no la contestó. */
function anotado(capa, r, nombre) {
  return new Promise(res => {
    let fin = false;
    const pinta = () => {
      const pn = panel(capa, `${idiomasHTML()}<h2>${t(r.estado === 'ya_estaba' ? 'lista.ok_ya' : 'lista.ok', { nombre: esc(nombre) })}</h2><p>${t('lista.ok_libre')}</p>
        ${encuestaHecha() ? '' : `<p>${t('lista.ok_encuesta')}</p>`}<div class="fila"><button class="ir grande" id="btn-seguir">${t('lista.seguir')}</button>${encuestaHecha() ? '' : `<button id="btn-encuesta">${t('muro.encuesta_boton')}</button>`}</div>`, 'chico anotado');
      pn.querySelector('#btn-seguir').addEventListener('click', () => { fin = true; quitar(); res(); });
      pn.querySelector('#btn-encuesta')?.addEventListener('click', async () => { fin = true; quitar(); await encuesta(capa, { conPremio: false }); res(); });
    };
    const quitar = alIdioma(() => { if (!fin) pinta(); });
    pinta();
  });
}

// ---------- P4: el pase, con el panel de error de conexión ----------
async function pedirPase(info) {
  if (S.reanudar) { const r = S.reanudar; S.reanudar = null; return { estado: 'ok', fuente: r.fuente, n: r.n, reanudada: true }; }
  const capa = info.capa || document.getElementById('capa');
  for (;;) {
    const r = await servidor.pedirPase({ idioma: idiomaActual() });
    if (r.estado === 'ok') { S.lista = r.fuente === 'lista'; S.quedan = S.lista ? null : r.quedan ?? null; if (Number.isFinite(r.n)) S.previas = r.n; return r; }
    if (r.estado === 'sin_servidor') return { estado: 'ok', fuente: r.fuente, sinServidor: true };
    if (r.estado === 'muro') { S.quedan = 0; S.encuesta = !!r.encuesta_disponible; return r; }
    // 'error': no se regala ninguna final (endurecimiento 1 de la sección 7): se dice y se ofrece probar de nuevo
    const otra = await new Promise(res => {
      let fin = false;
      const pinta = () => { const pn = panel(capa, `${idiomasHTML()}<h2>${t('conexion.error')}</h2><div class="fila"><button class="ir grande" id="btn-reintentar">${t('conexion.reintentar')}</button><button id="btn-volver">${t('muro.volver')}</button></div>`, 'chico');
        pn.querySelector('#btn-reintentar').addEventListener('click', () => { fin = true; quitar(); capa.innerHTML = ''; res(true); });
        pn.querySelector('#btn-volver').addEventListener('click', () => { fin = true; quitar(); capa.innerHTML = ''; res(false); }); };
      const quitar = alIdioma(() => { if (!fin) pinta(); }); pinta();
    });
    if (!otra) return { estado: 'cancelado', error: r.error };
  }
}

// ---------- P8: podio ----------
function podio(info) {
  servidor.finalTerminada();
  if (S.lista) return null;
  if (S.quedan === 0) return 'muro';
  const lugar = info.lugar;
  if (!lugar || info.n !== 1 || S.quedan === null || analitica.bandera('invitacion-podio1') === 'off') return null;
  analitica.ev('invitacion_vista');
  lugar.innerHTML = `<div class="invitacion"><button class="cerrar" type="button" aria-label="${esc(t('invitacion.cerrar'))}">✕</button><b>${t('invitacion.titulo')}</b><p>${t('invitacion.cuerpo')}</p><button id="btn-invitacion">${t('invitacion.boton')}</button></div>`;
  lugar.querySelector('.cerrar').addEventListener('click', () => { analitica.ev('invitacion_cerrada'); lugar.innerHTML = ''; });
  lugar.querySelector('#btn-invitacion').addEventListener('click', () => {
    analitica.ev('invitacion_abierta');
    lugar.innerHTML = `<div class="invitacion abierta">${formularioHTML({})}</div>`;
    atarFormulario(lugar, { pantalla: 'invitacion', nombre: info.nombre, alAnotar: r => {
      lugar.innerHTML = `<div class="invitacion"><b>${t(r.estado === 'ya_estaba' ? 'lista.ok_ya' : 'lista.ok', { nombre: esc(info.nombre) })}</b><p>${t('lista.ok_libre')}</p></div>`;
      const b = document.getElementById('btn-revancha'); if (b) b.textContent = t('podio.otra');
    } });
    lugar.querySelector('#correo')?.focus({ preventScroll: true });
  });
  return null;
}

/**
 * P0: estado del servidor (4 s como mucho; si no, la copia local) y arranque de la medición. Devuelve lo que necesita
 * main.js para decidir la primera pantalla: {muro, motivo, encuesta_disponible}. Nunca tira.
 * @param {{idioma:string, idioma_origen:string, version:string, pantalla:()=>string}} o
 */
async function arranque(o) {
  S.pantalla = o.pantalla || (() => '');
  analitica.instalarErrores(S.pantalla);
  try { S.reanudar = servidor.paseParaReanudar(); } catch { S.reanudar = null; }
  let e = null;
  try { e = await servidor.estado({ idioma: o.idioma }); } catch { e = null; }
  S.estado = e;
  if (e) {
    S.lista = !!e.lista; S.quedan = e.lista ? null : e.quedan ?? null; S.previas = e.contexto?.previas ?? 0; S.encuesta = !!e.encuesta_disponible;
    const g = Number(e.flags?.['muro-partidas-gratis']); if (g > 0) S.gratis = g;
  }
  try { await analitica.iniciar({ estado: e || {}, idioma: o.idioma, idioma_origen: o.idioma_origen, version: o.version, pantalla: S.pantalla() }); } catch { /* la medición nunca frena el juego */ }
  // muro al cargar: el servidor dice que no puede jugar (recargar, otra pestaña, ventana privada en la misma red…). Si
  // nunca jugó desde este dispositivo (red compartida que gastó su tope), primero la bienvenida y la práctica (P0).
  const muroAhora = !!e && e.puede === false && !S.reanudar && (e.contexto ? e.contexto.previas > 0 : true);
  return { muro: muroAhora, motivo: e?.motivo || 'dispositivo', encuesta_disponible: !!e?.encuesta_disponible, fuente: e?.fuente || null };
}

ganchos.ev = (nombre, props) => analitica.ev(nombre, props);
ganchos.registra = true;      // analitica.ev ya anota cada evento en window.JUEGO.eventos: main.js no lo repite
ganchos.visita = n => analitica.visita(n);
ganchos.estado = () => (S.estado || S.lista || S.quedan !== null ? { quedan: S.lista ? Infinity : S.quedan, anotado: S.lista } : null);
ganchos.quedan = () => (S.lista ? Infinity : S.quedan);
ganchos.pedirPase = pedirPase;
ganchos.muro = muro;
ganchos.podio = podio;

export const conexion = { arranque, muro, encuesta, get anotado() { return S.lista; }, get quedan() { return S.quedan; }, S };
