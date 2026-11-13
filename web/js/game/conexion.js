// Integración del servidor y de las métricas con el flujo del juego (docs/MVP.md 2, 5, 6 y 7). Reemplaza los ganchos de
// fábrica (ganchos.js): main.js no sabe qué hay detrás.
//  - P0: estado al cargar (servidor.estado, 4 s como mucho, si no la copia local) y arranque de PostHog (analitica.iniciar).
//  - P4: pase de cada final (servidor.pedirPase), con reanudación de una final cortada por una recarga, y un panel de
//    «No pudimos conectar» cuando el servidor no contesta y no corresponde regalar una final.
//  - P8: invitación suave en el podio 1 (bandera invitacion-podio1) y, con la regla vieja (GRATIS_ETAPA='final'), muro en
//    el podio de la última final gratis.
//  - Intervalo (regla de producción, GRATIS_ETAPA='arranque'): la final gratis da solo el arranque; al terminarlo sube el
//    muro (momento 'tras_arranque'). Correo → el Worker da permiso para el dos tiempos (servidor.envion) y la final sigue
//    ahí mismo; «Ahora no» → la tabla del arranque, la final termina ahí y vuelve al inicio.
//  - P9 a P11: el muro (solo el correo: decisión del dueño del 13 de noviembre, el correo es obligatorio), el alta en la
//    lista y, en el panel de «anotado», la encuesta opcional de dos preguntas (no da nada; se puede saltear).
// Todo lo que se ve sale del diccionario (i18n/) y lo escrito por la persona entra escapado. El correo nunca va a las
// métricas (analitica.js descarta cualquier propiedad con «@»).
import { ganchos } from './ganchos.js';
import { servidor, sugerirCorreo, pareceCorreo } from './servidor.js';
import { analitica } from './analitica.js';
import { t, esc, idiomaActual, alCambiarIdioma, IDIOMAS } from './i18n/t.js';

const guardado = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
// regla: la que manda el Worker (etapa 'arranque' | 'final', gratis, bono). etapa: la de la final en curso. proxima: con qué
// etapa saldría la próxima final ('arranque' = el arranque gratis: la bienvenida no promete «te queda 1 final»).
const REGLA_VIEJA = { etapa: 'final', gratis: 2, bono: 2 };
const S = { estado: null, quedan: null, lista: false, reanudar: null, previas: 0, gratis: 2, regla: REGLA_VIEJA, etapa: 'completa', proxima: 'completa', pantalla: () => '', cambiarIdioma: null };
const leerRegla = r => (r && typeof r === 'object' ? { etapa: r.etapa === 'arranque' ? 'arranque' : 'final', gratis: Number.isFinite(r.gratis) ? r.gratis : 2, bono: Number.isFinite(r.bono) ? r.bono : 2 } : null);
const conArranque = () => S.regla.etapa === 'arranque';
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
  <div class="fila"><button class="ir grande" id="btn-anotar">${o.boton || t('lista.boton')}</button></div>
  <p class="chica">${t('muro.privado')}</p>
  ${o.otro ? `<p class="chica">${t('muro.otro_dispositivo')}</p>` : ''}
</div>`;
const leerFormulario = raiz => ({ correo: raiz.querySelector('#correo')?.value || '', aviso: !!raiz.querySelector('#aviso')?.checked, novedades: !!raiz.querySelector('#novedades')?.checked });

function atarFormulario(raiz, { pantalla, nombre, alAnotar, momento = null, boton = null }) {
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
    btn.disabled = false; btn.textContent = boton || t('lista.boton');
    if (!r.ok) {
      const k = { formato: 'lista.error_formato', dominio: 'lista.error_dominio', descartable: 'lista.error_descartable', aviso: 'lista.error_aviso', limite: 'lista.error_limite' }[r.error] || 'lista.error_red';
      error(k); analitica.ev('anotar_error', { motivo: ['formato', 'dominio', 'descartable', 'aviso', 'limite'].includes(r.error) ? r.error : 'red' }); return;
    }
    analitica.identificar(r.lista_id);
    analitica.ev('anotar_ok', { estado: r.estado, pantalla, momento, finales_previas: S.previas });
    S.lista = true; S.quedan = null;
    alAnotar(r);
  });
}

// ---------- muro (P9) y anotado (P11) ----------
/**
 * El muro: solo el correo (decisión del dueño del 13 de noviembre: el correo es obligatorio; la encuesta ya no es un
 * camino del muro). Resuelve true si la persona se anotó y false si vuelve al inicio («Ahora no» y después «Volver al
 * inicio»; en el intervalo, «Ahora no» resuelve false enseguida y quien llama muestra la tabla del arranque).
 * `info.momento`: 'tras_arranque' (en el intervalo, con la regla del arranque gratis), 'inicio' (antes del primer intento
 * de una final: al cargar o al pedir el pase) o 'podio' (regla vieja). Si no viene, sale de `info.origen`.
 */
async function muro(info) {
  const capa = info.capa, motivo = info.motivo || 'dispositivo';
  const momento = info.momento || (info.origen === 'podio' ? 'podio' : 'inicio');
  const envion = momento === 'tras_arranque', nuevo = conArranque() && momento !== 'podio' && motivo !== 'ip';
  const variante = analitica.bandera('muro-texto') === 'b' ? 'b' : 'a';
  analitica.ev('muro_visto', { motivo, momento, caminos: 'mail', origen: info.origen || 'podio', variante_texto: variante, previas: S.previas, gratis_etapa: S.regla.etapa });
  const r = await new Promise(res => {
    let datos = { aviso: false, novedades: false, correo: '' }, despues = false, cerrado = false;
    const pinta = () => {
      const prev = capa.querySelector('.formulario'); if (prev) datos = leerFormulario(prev);
      const n = S.previas || S.gratis, nombre = esc(info.nombre);
      const titulo = motivo === 'ip' ? t('muro.titulo_ip') : envion ? t('muro.arranque.titulo', { nombre }) : nuevo ? t('muro.inicio.titulo', { nombre })
        : n === 1 ? t('muro.titulo_1', { nombre }) : t('muro.titulo', { nombre, n });
      const bajada = envion ? t('muro.arranque.bajada') : nuevo ? t('muro.inicio.bajada') : t(variante === 'b' ? 'muro.promesa_b' : 'muro.promesa');
      const camino = envion ? t('muro.arranque.camino_mail') : nuevo ? t('muro.inicio.camino_mail') : t(variante === 'b' ? 'muro.camino_mail_b' : 'muro.camino_mail');
      const boton = envion ? t('muro.arranque.boton') : null;
      const pie = envion ? `<button id="btn-ahora-no">${t('muro.arranque.ahora_no')}</button>`
        : despues ? `<p class="chica">${t('muro.despues')}</p><button id="btn-volver">${t('muro.volver')}</button>` : `<button id="btn-ahora-no">${t('muro.ahora_no')}</button>`;
      const pn = panel(capa, `${idiomasHTML()}<h1>${titulo}</h1><p class="bajada">${bajada}</p>
        <div class="muro-cuerpo">${formularioHTML({ ...datos, camino: `<b>${camino}</b>`, otro: true, boton })}</div>
        <div class="fila">${pie}</div>`, envion ? 'muro tras-arranque' : 'muro', null);
      atarFormulario(pn.querySelector('.formulario'), { pantalla: 'muro', momento, boton, nombre: info.nombre, alAnotar: x => { cerrado = true; quitar(); res({ anotado: x }); } });
      pn.querySelector('#btn-ahora-no')?.addEventListener('click', () => {
        analitica.ev('muro_ahora_no', { momento });
        if (envion) { cerrado = true; quitar(); res({ volver: true }); return; }
        despues = true; pinta();
      });
      pn.querySelector('#btn-volver')?.addEventListener('click', () => { cerrado = true; quitar(); analitica.ev('muro_cerrado', { momento }); res({ volver: true }); });
    };
    const quitar = alIdioma(() => { if (!cerrado) pinta(); });
    pinta();
  });
  if (r.volver) return false;
  await anotado(capa, r.anotado, info.nombre, momento);
  return true;
}

// ---------- encuesta opcional en el panel de anotado (P11, docs/MVP.md 5.4) ----------
const PLATAFORMAS = ['app', 'web'];
const FEATURES = ['pesista_propio', 'mujeres_categorias', 'sedes_campeonatos'];
/** Texto libre sin direcciones ni «@» (el Worker lo vuelve a limpiar): no viaja nada que parezca un dato de contacto. */
const limpiarOtra = v => String(v || '').replace(/\S*[@＠]\S*/g, '…').replace(/\b(?:https?:\/\/|www\.)\S*/gi, '…').replace(/\s+/g, ' ').trim().slice(0, 280);
/**
 * P11: «¡Adentro!» y, si todavía no la contestó en este dispositivo, la encuesta opcional: cómo prefiere jugar (una
 * opción), qué le gustaría que tenga el juego (varias) y un texto libre opcional. No frena: «Enviar y seguir» manda lo
 * que haya marcado (si no marcó nada, solo sigue) y «Saltar» sigue sin mandar. En el intervalo el botón sigue al dos
 * tiempos. Las respuestas van al Worker (/api/encuesta), que las manda a PostHog como `encuesta_respuesta`, sin el correo.
 */
function anotado(capa, r, nombre, momento = null) {
  const envion = momento === 'tras_arranque', ofrecer = !encuestaHecha();
  if (ofrecer) analitica.encuestaVista({ momento });
  const R = { plataforma: '', features: [], otra: '' };
  return new Promise(res => {
    let fin = false;
    const seguir = () => { fin = true; quitar(); res(); };
    const pinta = () => {
      const q = capa.querySelector('#otra'); if (q) R.otra = q.value;
      const cab = `${idiomasHTML()}<h2>${t(r.estado === 'ya_estaba' ? 'lista.ok_ya' : 'lista.ok', { nombre: esc(nombre) })}</h2><p>${t('lista.ok_libre')}</p>`;
      if (!ofrecer) {
        const pn = panel(capa, `${cab}<div class="fila"><button class="ir grande" id="btn-seguir">${t(envion ? 'lista.seguir_envion' : 'lista.seguir')}</button></div>`, 'chico anotado');
        pn.querySelector('#btn-seguir').addEventListener('click', seguir);
        return;
      }
      const op = (q, o, on) => `<button type="button" class="op" data-q="${q}" data-o="${o}" aria-pressed="${on}">${t(`encuesta.${q}.${o}`)}</button>`;
      const pn = panel(capa, `${cab}<div class="encuesta-anotado">
        <fieldset class="pregunta"><legend>${t('encuesta.plataforma')}</legend><div class="opciones-q">${PLATAFORMAS.map(o => op('plataforma', o, R.plataforma === o)).join('')}</div></fieldset>
        <fieldset class="pregunta"><legend>${t('encuesta.features')}</legend><div class="opciones-q">${FEATURES.map(o => op('features', o, R.features.includes(o))).join('')}</div></fieldset>
        <label class="campo" for="otra"><span>${t('encuesta.otra')}</span><textarea id="otra" rows="2" maxlength="280" enterkeyhint="done" placeholder="${esc(t('encuesta.otra_ph'))}">${esc(R.otra)}</textarea></label></div>
        <div class="fila"><button class="ir grande" id="btn-enviar">${t(envion ? 'encuesta.enviar_envion' : 'encuesta.enviar')}</button><button id="btn-saltar">${t('encuesta.saltar')}</button></div>`, 'anotado encuesta');
      pn.querySelectorAll('.op').forEach(b => b.addEventListener('click', () => {
        const o = b.dataset.o;
        if (b.dataset.q === 'plataforma') R.plataforma = R.plataforma === o ? '' : o;
        else R.features = R.features.includes(o) ? R.features.filter(x => x !== o) : FEATURES.filter(x => x === o || R.features.includes(x));
        for (const x of pn.querySelectorAll(`.op[data-q="${b.dataset.q}"]`)) x.setAttribute('aria-pressed', String(b.dataset.q === 'plataforma' ? R.plataforma === x.dataset.o : R.features.includes(x.dataset.o)));
      }));
      pn.querySelector('#btn-saltar').addEventListener('click', () => { if (fin) return; analitica.encuestaCerrada({ momento }); seguir(); });
      pn.querySelector('#btn-enviar').addEventListener('click', () => {
        if (fin) return;
        R.otra = pn.querySelector('#otra').value;
        const otra = limpiarOtra(R.otra);
        const resp = { ...(R.plataforma ? { plataforma: R.plataforma } : {}), ...(R.features.length ? { features: [...R.features] } : {}), ...(/[\p{L}\p{N}]/u.test(otra.replace(/…/g, '')) ? { otra } : {}) };
        if (!Object.keys(resp).length) { analitica.encuestaCerrada({ momento }); seguir(); return; }      // nada marcado: solo sigue
        fin = true; quitar(); guardado.set('tarima.encuesta', '1');
        // Sin esperar la respuesta: el pedido sigue solo (10 s de espera) y la persona no queda frenada.
        servidor.encuesta({ r: resp, idioma: idiomaActual(), sesion: analitica.idSesion() }).then(x => { if (!x.ok && x.error !== 'ya_respondida') console.warn('encuesta:', x.error); }).catch(() => null);
        analitica.ev('encuesta_enviada', { momento, plataforma: resp.plataforma || null, features: resp.features?.length || 0, otra: !!resp.otra });
        panel(capa, `<h2>${t('encuesta.ok')}</h2>`, 'chico anotado');
        setTimeout(res, 700);
      });
    };
    const quitar = alIdioma(() => { if (!fin) pinta(); });
    pinta();
  });
}

// ---------- intervalo: el muro tras el arranque gratis ----------
/** Panel de «No pudimos conectar». Resuelve true (probar de nuevo) o false (volver). */
function errorConexion(capa) {
  return new Promise(res => {
    let fin = false;
    const pinta = () => { const pn = panel(capa, `${idiomasHTML()}<h2>${t('conexion.error')}</h2><div class="fila"><button class="ir grande" id="btn-reintentar">${t('conexion.reintentar')}</button><button id="btn-volver">${t('muro.volver')}</button></div>`, 'chico');
      pn.querySelector('#btn-reintentar').addEventListener('click', () => { fin = true; quitar(); capa.innerHTML = ''; res(true); });
      pn.querySelector('#btn-volver').addEventListener('click', () => { fin = true; quitar(); capa.innerHTML = ''; res(false); }); };
    const quitar = alIdioma(() => { if (!fin) pinta(); }); pinta();
  });
}
/** La final se corta en el intervalo: la tabla del arranque y «Volver al inicio» (o volver al muro). true: volver al muro. */
function corte(info) {
  const capa = info.capa;
  info.visita?.('final_cortada');
  return new Promise(res => {
    let fin = false;
    const pinta = () => {
      const pn = panel(capa, `${idiomasHTML()}<h1>${t('corte.titulo')}</h1>${info.tabla ? info.tabla() : ''}<p>${t('corte.texto')}</p>
        <div class="fila"><button class="ir grande" id="btn-volver">${t('muro.volver')}</button><button id="btn-seguir">${t('corte.seguir')}</button></div>`, 'muro corte');
      pn.querySelector('#btn-volver').addEventListener('click', () => { fin = true; quitar(); res(false); });
      pn.querySelector('#btn-seguir').addEventListener('click', () => { fin = true; quitar(); res(true); });
    };
    const quitar = alIdioma(() => { if (!fin) pinta(); });
    pinta();
  });
}
/**
 * Gancho del intervalo (main.js lo llama al terminar el arranque). Si la final en curso salió con etapa 'arranque', sube
 * el muro; con el correo pide al Worker el permiso del dos tiempos y la final sigue ('sigue'). Si la persona
 * no deja nada, se ve la tabla del arranque y la final termina ahí ('corta': main.js vuelve al inicio).
 * @param {{n:number, nombre:string, capa:HTMLElement, tabla:()=>string, visita:(n:string)=>void}} info
 * @returns {Promise<'sigue'|'corta'>}
 */
async function intervalo(info) {
  if (S.etapa !== 'arranque') return 'sigue';
  const capa = info.capa || document.getElementById('capa');
  for (;;) {
    info.visita?.('muro');
    if (await muro({ ...info, capa, origen: 'intervalo', momento: 'tras_arranque', motivo: 'envion' })) {
      let r;
      for (;;) {
        r = await servidor.envion({ idioma: idiomaActual() });
        if (r.estado !== 'error' || !(await errorConexion(capa))) break;
      }
      if (r.estado === 'ok') {
        S.etapa = 'completa'; if (r.lista) { S.lista = true; S.quedan = null; } else if (Number.isFinite(r.quedan)) S.quedan = r.quedan;
        analitica.ev('envion_ok', { via: r.via });
        capa.innerHTML = '';
        return 'sigue';
      }
      analitica.ev('envion_negado', { motivo: r.estado === 'muro' ? 'muro' : r.error || 'error' });
      if (r.estado === 'muro') continue;
    }
    if (await corte(info)) continue;
    analitica.ev('muro_cerrado', { momento: 'tras_arranque' });
    analitica.ev('final_cortada', { n: info.n ?? null, momento: 'tras_arranque' });
    servidor.finalTerminada();
    capa.innerHTML = '';
    return 'corta';
  }
}

// ---------- P4: el pase, con el panel de error de conexión ----------
async function pedirPase(info) {
  if (S.reanudar) { const r = S.reanudar; S.reanudar = null; S.etapa = r.etapa === 'arranque' ? 'arranque' : 'completa'; return { estado: 'ok', fuente: r.fuente, n: r.n, etapa: S.etapa, reanudada: true }; }
  const capa = info.capa || document.getElementById('capa');
  for (;;) {
    const r = await servidor.pedirPase({ idioma: idiomaActual() });
    if (r.regla) S.regla = leerRegla(r.regla) || S.regla;
    if (r.estado === 'ok') {
      S.lista = r.fuente === 'lista'; S.quedan = S.lista ? null : r.quedan ?? null; if (Number.isFinite(r.n)) S.previas = r.n;
      S.etapa = r.etapa === 'arranque' ? 'arranque' : 'completa';
      return r;
    }
    // sin servidor (historia limpia, una vez por carga): la final entera, como en la regla vieja (sin Worker no hay muro)
    if (r.estado === 'sin_servidor') { S.etapa = 'completa'; return { estado: 'ok', fuente: r.fuente, sinServidor: true }; }
    if (r.estado === 'muro') { S.quedan = 0; return { ...r, momento: 'inicio' }; }
    // 'error': no se regala ninguna final (endurecimiento 1 de la sección 7): se dice y se ofrece probar de nuevo
    if (!(await errorConexion(capa))) return { estado: 'cancelado', error: r.error };
  }
}

// ---------- P8: podio ----------
function podio(info) {
  servidor.finalTerminada();
  if (S.lista) return null;
  // Con el arranque gratis no hay muro en el podio: la próxima final que se pida sin correo empieza con el
  // muro antes del primer intento (P4).
  if (S.quedan === 0) return conArranque() ? null : 'muro';
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
 * main.js para decidir la primera pantalla: {muro, motivo}. Nunca tira.
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
    S.lista = !!e.lista; S.quedan = e.lista ? null : e.quedan ?? null; S.previas = e.contexto?.previas ?? 0;
    const g = Number(e.flags?.['muro-partidas-gratis']); if (g > 0) S.gratis = g;
    S.regla = leerRegla(e.regla) || S.regla; S.proxima = e.etapa === 'arranque' ? 'arranque' : 'completa';
  }
  try { await analitica.iniciar({ estado: e || {}, idioma: o.idioma, idioma_origen: o.idioma_origen, version: o.version, pantalla: S.pantalla() }); } catch { /* la medición nunca frena el juego */ }
  // muro al cargar: el servidor dice que no puede jugar (recargar, otra pestaña, ventana privada en la misma red…). Si
  // nunca jugó desde este dispositivo (red compartida que gastó su tope), primero la bienvenida y la práctica (P0).
  const muroAhora = !!e && e.puede === false && !S.reanudar && (e.contexto ? e.contexto.previas > 0 : true);
  return { muro: muroAhora, motivo: e?.motivo || 'dispositivo', fuente: e?.fuente || null };
}

ganchos.ev = (nombre, props) => analitica.ev(nombre, props);
ganchos.registra = true;      // analitica.ev ya anota cada evento en window.JUEGO.eventos: main.js no lo repite
ganchos.visita = n => analitica.visita(n);
// Con el arranque gratis por delante, la bienvenida no dice «te queda 1 final gratis»: esa final es solo el arranque.
const quedanVisibles = () => (S.lista ? Infinity : S.proxima === 'arranque' ? null : S.quedan);
ganchos.estado = () => (S.estado || S.lista || S.quedan !== null ? { quedan: quedanVisibles(), anotado: S.lista } : null);
ganchos.quedan = quedanVisibles;
ganchos.pedirPase = pedirPase;
ganchos.muro = muro;
ganchos.intervalo = intervalo;
ganchos.podio = podio;

export const conexion = { arranque, muro, anotado, intervalo, get anotado() { return S.lista; }, get quedan() { return S.quedan; }, S };
