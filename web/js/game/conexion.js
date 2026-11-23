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
//  - P9 a P11: el cartel (LIF-53, decisión del dueño del 15 de noviembre): al terminar la primera final, para seguir
//    jugando, el correo O las dos preguntas de la encuesta (cualquiera da el juego libre, ENCUESTA_LIBRE). Si deja el
//    correo, después las preguntas como paso optativo con «Saltar». Eventos de LIF-46: un `muro_resultado` por cartel y un
//    `siguio_jugando` después.
// Todo lo que se ve sale del diccionario (i18n/) y lo escrito por la persona entra escapado. El correo nunca va a las
// métricas (analitica.js descarta cualquier propiedad con «@»).
import { ganchos } from './ganchos.js';
import { servidor, sugerirCorreo, pareceCorreo } from './servidor.js';
import { nombreReal } from './nombre.js';
import { analitica } from './analitica.js';
import { t, esc, idiomaActual, alCambiarIdioma, IDIOMAS } from './i18n/t.js';

const guardado = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
// regla: la que manda el Worker (etapa 'arranque' | 'final', gratis, bono). etapa: la de la final en curso. proxima: con qué
// etapa saldría la próxima final ('arranque' = el arranque gratis: la bienvenida no promete «te queda 1 final»).
const REGLA_VIEJA = { etapa: 'final', gratis: 2, bono: 2, libre: false };
// lista: anotado. libre: juega sin límite (anotado, o con la encuesta del cartel). encuestaDisponible: el servidor ofrece
// las preguntas como camino del cartel.
const S = { estado: null, quedan: null, lista: false, libre: false, encuestaDisponible: false, reanudar: null, previas: 0, gratis: 2, regla: REGLA_VIEJA, etapa: 'completa', proxima: 'completa', pantalla: () => '', cambiarIdioma: null };
const leerRegla = r => (r && typeof r === 'object' ? { etapa: r.etapa === 'arranque' ? 'arranque' : 'final', gratis: Number.isFinite(r.gratis) ? r.gratis : 2, bono: Number.isFinite(r.bono) ? r.bono : 2, libre: r.libre === true } : null);
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
 * Formulario del correo: campo, casilla de aviso (obligatoria), novedades (opcional, destildada), línea legal y botón.
 * Devuelve el HTML; `atar(raiz, {pantalla, alAnotar})` lo hace andar. `alAnotar(r)` recibe la respuesta de servidor.anotar
 * si salió bien. El nombre viene completado si el que puso en la bienvenida ya es un nombre real (LIF-32).
 */
const formularioHTML = (o = {}) => `<div class="formulario">
  ${o.camino ? `<p class="camino">${o.camino}</p>` : ''}
  <label class="campo" for="nombre-lista"><span>${t('lista.nombre')}</span><input id="nombre-lista" type="text" autocomplete="name" autocapitalize="words" spellcheck="false" enterkeyhint="next" maxlength="40" placeholder="${esc(t('lista.nombre_ph'))}" value="${esc(o.nombreLista || '')}"></label>
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
const leerFormulario = raiz => ({ nombreLista: raiz.querySelector('#nombre-lista')?.value || '', correo: raiz.querySelector('#correo')?.value || '', aviso: !!raiz.querySelector('#aviso')?.checked, novedades: !!raiz.querySelector('#novedades')?.checked });
/** El nombre del jugador para completar el campo de la lista: solo si ya es un nombre real (LIF-32). */
const nombreParaLista = n => (nombreReal(n).ok ? nombreReal(n).nombre : '');

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
    const nr = nombreReal(f.nombreLista);
    if (!nr.ok) { error('lista.error_nombre'); analitica.ev('anotar_error', { motivo: 'nombre', causa: nr.motivo }); raiz.querySelector('#nombre-lista')?.focus(); return; }
    if (!pareceCorreo(f.correo)) { error('lista.error_formato'); analitica.ev('anotar_error', { motivo: 'formato' }); return; }
    if (!f.aviso) { error('lista.error_aviso'); analitica.ev('anotar_error', { motivo: 'aviso' }); return; }
    error(null); analitica.ev('anotar_envio', { novedades: f.novedades, sugerencia_usada: usoSugerencia, pantalla, momento });
    btn.disabled = true; btn.textContent = t('lista.enviando');
    const r = await servidor.anotar({ email: f.correo, nombre: nr.nombre, idioma: idiomaActual(), novedades: f.novedades, sesion: analitica.idSesion(), momento, pantalla, metricas: analitica.activa() });
    btn.disabled = false; btn.textContent = boton || t('lista.boton');
    if (!r.ok) {
      const k = { nombre: 'lista.error_nombre', formato: 'lista.error_formato', dominio: 'lista.error_dominio', descartable: 'lista.error_descartable', aviso: 'lista.error_aviso', limite: 'lista.error_limite' }[r.error] || 'lista.error_red';
      error(k); analitica.ev('anotar_error', { motivo: ['nombre', 'formato', 'dominio', 'descartable', 'aviso', 'limite'].includes(r.error) ? r.error : 'red' }); return;
    }
    analitica.identificar(r.lista_id);
    // LIF-46: `anotar_ok` (solo altas nuevas) y `anotar_repetido` los manda el Worker, que sabe si el correo ya estaba. Acá,
    // la respuesta del alta tal como la ve el navegador ('nuevo' también para un correo que ya estaba desde otro dispositivo)
    analitica.ev('anotar_respuesta', { estado: r.estado, pantalla, momento, novedades: f.novedades, finales_previas: S.previas });
    S.lista = true; S.libre = true; S.quedan = null; S.encuestaDisponible = false;
    alAnotar({ ...r, novedades: f.novedades });
  });
}

// ---------- después del cartel: ¿siguió jugando? (LIF-46) ----------
/**
 * Cada vez que se muestra el cartel deja UN `muro_resultado` (mail, preguntas o cerro) y, después, UN `siguio_jugando`:
 * true al empezar otra final (o al seguir al dos tiempos en el intervalo), false al irse de la página o si vuelve a ver el
 * cartel sin haber jugado. Los toques repetidos no suman nada: cada cosa sale una sola vez por cartel.
 */
const SIG = { pendiente: null, abierto: null, vistos: 0 };
function resolverSiguio(siguio, motivo, beacon = false) {
  const p = SIG.pendiente; if (!p) return; SIG.pendiente = null;
  analitica.ev('siguio_jugando', { siguio, motivo, via: p.via, momento: p.momento, s: Math.round((Date.now() - p.t) / 1000) }, beacon ? { beacon: true } : undefined);
}
function resultadoMuro(vez, via, extra = {}, beacon = false) {
  if (vez.resultado) return; vez.resultado = via;
  if (SIG.abierto === vez) SIG.abierto = null;
  analitica.ev('muro_resultado', { via, momento: vez.momento, caminos: vez.caminos, s: Math.round((Date.now() - vez.t0) / 1000), vez: vez.n, ...extra }, beacon ? { beacon: true } : undefined);
  SIG.pendiente = { via, momento: vez.momento, t: Date.now() };
}
if (typeof addEventListener === 'function') addEventListener('pagehide', () => {
  if (SIG.abierto) resultadoMuro(SIG.abierto, 'cerro', { salida: 'pagina' }, true);
  resolverSiguio(false, 'salio', true);
});

// ---------- muro (P9): el cartel con dos caminos ----------
const PLATAFORMAS = ['app', 'web'];
const FEATURES = ['pesista_propio', 'mujeres_categorias', 'sedes_campeonatos'];
/** Texto libre sin direcciones ni «@» (el Worker lo vuelve a limpiar): no viaja nada que parezca un dato de contacto. */
const limpiarOtra = v => String(v || '').replace(/\S*[@＠]\S*/g, '…').replace(/\b(?:https?:\/\/|www\.)\S*/gi, '…').replace(/\s+/g, ' ').trim().slice(0, 280);
/** Las dos preguntas de la encuesta (docs/MVP.md 5.4) y el texto libre, con lo marcado en `R`. */
const preguntasHTML = R => {
  const op = (q, o, on) => `<button type="button" class="op" data-q="${q}" data-o="${o}" aria-pressed="${on}">${t(`encuesta.${q}.${o}`)}</button>`;
  return `<fieldset class="pregunta"><legend>${t('encuesta.plataforma')}</legend><div class="opciones-q">${PLATAFORMAS.map(o => op('plataforma', o, R.plataforma === o)).join('')}</div></fieldset>
    <fieldset class="pregunta"><legend>${t('encuesta.features')}</legend><div class="opciones-q">${FEATURES.map(o => op('features', o, R.features.includes(o))).join('')}</div></fieldset>
    <label class="campo" for="otra"><span>${t('encuesta.otra')}</span><textarea id="otra" rows="2" maxlength="280" enterkeyhint="done" placeholder="${esc(t('encuesta.otra_ph'))}">${esc(R.otra)}</textarea></label>`;
};
/** Los botones de las preguntas marcan y desmarcan sobre `R` (plataforma: una; propuestas: varias). */
function atarPreguntas(pn, R) {
  pn.querySelectorAll('.op').forEach(b => b.addEventListener('click', () => {
    const o = b.dataset.o;
    if (b.dataset.q === 'plataforma') R.plataforma = R.plataforma === o ? '' : o;
    else R.features = R.features.includes(o) ? R.features.filter(x => x !== o) : FEATURES.filter(x => x === o || R.features.includes(x));
    for (const x of pn.querySelectorAll(`.op[data-q="${b.dataset.q}"]`)) x.setAttribute('aria-pressed', String(b.dataset.q === 'plataforma' ? R.plataforma === x.dataset.o : R.features.includes(x.dataset.o)));
  }));
}
/** Lo marcado, como lo pide /api/encuesta (sin claves vacías). */
const respuestas = R => { const otra = limpiarOtra(R.otra); return { ...(R.plataforma ? { plataforma: R.plataforma } : {}), ...(R.features.length ? { features: [...R.features] } : {}), ...(/[\p{L}\p{N}]/u.test(otra.replace(/…/g, '')) ? { otra } : {}) }; };

/**
 * El cartel (LIF-53, decisión del dueño del 15 de noviembre): para seguir jugando, uno de dos caminos, cualquiera alcanza:
 * «Deja tu correo» (la lista: juego libre; después, las preguntas como paso optativo con «Saltar») o «Responde 2 preguntas
 * rápidas» (la encuesta: con ENCUESTA_LIBRE el Worker da el juego libre en este dispositivo). Si el servidor no ofrece la
 * encuesta (ya la contestó, la red usó sus lugares o ENCUESTA_LIBRE 0), solo el correo, como antes.
 * Resuelve true si desbloqueó y false si vuelve al inicio («Ahora no» y después «Volver al inicio»; en el intervalo, «Ahora
 * no» resuelve false enseguida y quien llama muestra la tabla del arranque).
 * `info.momento`: 'podio' (al terminar la final gratis), 'inicio' (antes del primer intento de una final: al cargar o al
 * pedir el pase) o 'tras_arranque' (en el intervalo, con GRATIS_ETAPA='arranque'). Si no viene, sale de `info.origen`.
 */
async function muro(info) {
  const capa = info.capa, motivo = info.motivo || 'dispositivo';
  const momento = info.momento || (info.origen === 'podio' ? 'podio' : 'inicio');
  const envion = momento === 'tras_arranque', nuevo = conArranque() && momento !== 'podio' && motivo !== 'ip';
  const variante = analitica.bandera('muro-texto') === 'b' ? 'b' : 'a';
  const conPreguntas = !!S.encuestaDisponible && !encuestaHecha() && !S.libre;
  const vez = { n: ++SIG.vistos, momento, caminos: conPreguntas ? 'mail+preguntas' : 'mail', t0: Date.now(), resultado: null, ahoraNo: false, cerrado: false, elegidos: new Set() };
  resolverSiguio(false, 'muro');      // vuelve a ver el cartel sin haber jugado otra final
  SIG.abierto = vez;
  analitica.ev('muro_visto', { motivo, momento, caminos: vez.caminos, origen: info.origen || 'podio', variante_texto: variante, previas: S.previas, gratis_etapa: S.regla.etapa, vez: vez.n });
  const r = await new Promise(res => {
    let datos = { aviso: false, novedades: false, correo: '', nombreLista: nombreParaLista(info.nombre) }, despues = false, cerrado = false, enviando = false, errPreg = null;
    let via = conPreguntas ? null : 'mail';
    const R = { plataforma: '', features: [], otra: '' };
    const fin = x => { cerrado = true; quitar(); res(x); };
    const pinta = () => {
      const prev = capa.querySelector('.formulario'); if (prev) datos = leerFormulario(prev);
      const q = capa.querySelector('#otra'); if (q) R.otra = q.value;
      const n = S.previas || S.gratis, nombre = esc(info.nombre);
      const titulo = motivo === 'ip' ? t('muro.titulo_ip') : envion ? t('muro.arranque.titulo', { nombre }) : nuevo ? t('muro.inicio.titulo', { nombre })
        : n === 1 ? t('muro.titulo_1', { nombre }) : t('muro.titulo', { nombre, n });
      const bajada = envion ? t('muro.arranque.bajada') : nuevo ? t('muro.inicio.bajada') : t(variante === 'b' ? 'muro.promesa_b' : 'muro.promesa');
      const camino = envion ? t('muro.arranque.camino_mail') : nuevo ? t('muro.inicio.camino_mail') : t(variante === 'b' ? 'muro.camino_mail_b' : 'muro.camino_mail');
      const boton = envion ? t('muro.arranque.boton') : null;
      const pie = envion ? `<button id="btn-ahora-no">${t('muro.arranque.ahora_no')}</button>`
        : despues ? `<p class="chica">${t('muro.despues')}</p><button id="btn-volver">${t('muro.volver')}</button>` : `<button id="btn-ahora-no">${t('muro.ahora_no')}</button>`;
      // los dos caminos, con el mismo peso; elegido uno, quedan arriba como pestañas para cambiar
      const caminos = conPreguntas ? `<div class="caminos${via ? ' elegido' : ''}" role="group">
          <button type="button" class="camino${via ? '' : ' ir grande'}" id="btn-via-mail" aria-pressed="${via === 'mail'}">${t('muro.via.mail')}</button>
          <button type="button" class="camino${via ? '' : ' ir grande'}" id="btn-via-preguntas" aria-pressed="${via === 'preguntas'}">${t('muro.via.preguntas')}</button></div>
        ${via ? '' : `<p class="chica nota-caminos">${t('muro.via.nota')}</p>`}` : '';
      const cuerpo = via === 'mail' ? formularioHTML({ ...datos, camino: conPreguntas ? '' : `<b>${camino}</b>`, otro: true, boton })
        : via === 'preguntas' ? `<div class="encuesta-anotado preguntas-muro">${preguntasHTML(R)}<p class="error" id="err-preg" role="alert"${errPreg ? '' : ' hidden'}>${errPreg ? t(errPreg) : ''}</p>
          <div class="fila"><button class="ir grande" id="btn-preguntas"${enviando ? ' disabled' : ''}>${t(enviando ? 'lista.enviando' : envion ? 'encuesta.enviar_envion' : 'encuesta.enviar')}</button></div>
          <p class="chica">${t('muro.via.nota')}</p></div>` : '';
      const pn = panel(capa, `${idiomasHTML()}<h1>${titulo}</h1><p class="bajada">${bajada}</p>
        <div class="muro-cuerpo">${caminos}${cuerpo}</div>
        <div class="fila">${pie}</div>`, envion ? 'muro tras-arranque' : 'muro', null);
      const elegir = v => {
        if (v === via) return;
        const f = capa.querySelector('.formulario'); if (f) datos = leerFormulario(f);
        via = v; errPreg = null;
        if (!vez.elegidos.has(v)) { vez.elegidos.add(v); analitica.ev('muro_camino', { via: v, momento, vez: vez.n }); if (v === 'preguntas') analitica.encuestaVista({ momento, paso: 'cartel' }); }
        pinta();
        const foco = capa.querySelector(v === 'mail' ? '#nombre-lista' : '.op'); if (foco && !matchMedia('(pointer:coarse)').matches) foco.focus({ preventScroll: true });
      };
      pn.querySelector('#btn-via-mail')?.addEventListener('click', () => elegir('mail'));
      pn.querySelector('#btn-via-preguntas')?.addEventListener('click', () => elegir('preguntas'));
      if (via === 'mail') atarFormulario(pn.querySelector('.formulario'), { pantalla: 'muro', momento, boton, nombre: info.nombre, alAnotar: x => { resultadoMuro(vez, 'mail', { novedades: !!x.novedades }); fin({ anotado: x }); } });
      if (via === 'preguntas') {
        atarPreguntas(pn, R);
        pn.querySelector('#btn-preguntas').addEventListener('click', async () => {
          if (enviando || cerrado) return;
          R.otra = pn.querySelector('#otra').value;
          if (!R.plataforma || !R.features.length) { errPreg = 'muro.preguntas.falta'; analitica.ev('encuesta_error', { motivo: 'incompleta', momento }); pinta(); return; }
          const resp = respuestas(R);
          enviando = true; errPreg = null; pinta();
          const x = await servidor.encuesta({ r: resp, idioma: idiomaActual(), sesion: analitica.idSesion(), momento });
          enviando = false;
          if (cerrado) return;
          if (x.ok && x.libre) {
            guardado.set('tarima.encuesta', '1'); S.libre = true; S.quedan = null; S.encuestaDisponible = false;
            analitica.ev('encuesta_enviada', { momento, paso: 'cartel', desbloquea: true, plataforma: resp.plataforma || null, features: resp.features?.length || 0, otra: !!resp.otra });
            resultadoMuro(vez, 'preguntas');
            fin({ preguntas: true });
            return;
          }
          // sin desbloqueo: la red ya usó sus lugares, o ya estaba contestada (otra pestaña): queda el correo
          const motivoErr = x.ok ? 'sin_desbloqueo' : x.error;
          analitica.ev('encuesta_error', { motivo: ['ip', 'ya_respondida', 'incompleta', 'limite', 'sin_desbloqueo'].includes(motivoErr) ? motivoErr : 'red', momento });
          if (x.ok || x.error === 'ip' || x.error === 'ya_respondida') { S.encuestaDisponible = false; errPreg = 'muro.preguntas.error_ip'; if (x.ok || x.error === 'ya_respondida') guardado.set('tarima.encuesta', '1'); via = 'mail'; vez.caminos = 'mail'; }
          else errPreg = x.error === 'incompleta' ? 'muro.preguntas.falta' : x.error === 'limite' ? 'lista.error_limite' : 'muro.preguntas.error_red';
          pinta();
          if (via === 'mail') { const e = capa.querySelector('#err'); if (e) { e.hidden = false; e.textContent = t(errPreg); } }
        });
      }
      pn.querySelector('#btn-ahora-no')?.addEventListener('click', () => {
        if (cerrado) return;
        if (!vez.ahoraNo) { vez.ahoraNo = true; analitica.ev('muro_ahora_no', { momento, vez: vez.n }); }
        if (envion) { resultadoMuro(vez, 'cerro', { salida: 'ahora_no' }); fin({ volver: true }); return; }
        despues = true; pinta();
      });
      pn.querySelector('#btn-volver')?.addEventListener('click', () => {
        if (cerrado) return;
        if (!vez.cerrado) { vez.cerrado = true; analitica.ev('muro_cerrado', { momento, vez: vez.n }); }
        resultadoMuro(vez, 'cerro', { salida: 'volver' }); fin({ volver: true });
      });
    };
    const quitar = alIdioma(() => { if (!cerrado) pinta(); });
    pinta();
  });
  if (r.volver) return false;
  if (r.preguntas) await desbloqueado(capa, envion);
  else await anotado(capa, r.anotado, info.nombre, momento);
  return true;
}

/** Después de contestar las preguntas del cartel: «¡Gracias!», juego libre en este dispositivo y «Seguir jugando». */
function desbloqueado(capa, envion) {
  return new Promise(res => {
    let fin = false;
    const pinta = () => {
      const pn = panel(capa, `${idiomasHTML()}<h2>${t('encuesta.ok')}</h2><p>${t('lista.ok_libre')}</p><div class="fila"><button class="ir grande" id="btn-seguir">${t(envion ? 'lista.seguir_envion' : 'lista.seguir')}</button></div>`, 'chico anotado');
      pn.querySelector('#btn-seguir').addEventListener('click', () => { if (fin) return; fin = true; quitar(); res(); });
    };
    const quitar = alIdioma(() => { if (!fin) pinta(); });
    pinta();
  });
}

// ---------- encuesta opcional en el panel de anotado (P11, docs/MVP.md 5.4) ----------
/**
 * P11: «¡Adentro!» y, si todavía no la contestó en este dispositivo, las mismas dos preguntas como paso optativo: cómo
 * prefiere jugar (una opción), qué le gustaría que tenga el juego (varias) y un texto libre opcional. No frena: «Enviar y
 * seguir» manda lo que haya marcado (si no marcó nada, solo sigue) y «Saltar» sigue sin mandar. En el intervalo el botón
 * sigue al dos tiempos. Las respuestas van al Worker (/api/encuesta), que las manda a PostHog como `encuesta_respuesta`,
 * sin el correo; acá no desbloquean nada (ya tiene el juego libre).
 */
function anotado(capa, r, nombre, momento = null) {
  const envion = momento === 'tras_arranque', ofrecer = !encuestaHecha();
  if (ofrecer) analitica.encuestaVista({ momento, paso: 'anotado' });
  const R = { plataforma: '', features: [], otra: '' };
  return new Promise(res => {
    let fin = false;
    const seguir = () => { fin = true; quitar(); res(); };
    const pinta = () => {
      const q = capa.querySelector('#otra'); if (q) R.otra = q.value;
      const cab = `${idiomasHTML()}<h2>${t(r.estado === 'ya_estaba' ? 'lista.ok_ya' : 'lista.ok', { nombre: esc(nombre) })}</h2><p>${t('lista.ok_libre')}</p>`;
      if (!ofrecer) {
        const pn = panel(capa, `${cab}<div class="fila"><button class="ir grande" id="btn-seguir">${t(envion ? 'lista.seguir_envion' : 'lista.seguir')}</button></div>`, 'chico anotado');
        pn.querySelector('#btn-seguir').addEventListener('click', () => { if (!fin) seguir(); });
        return;
      }
      const pn = panel(capa, `${cab}<div class="encuesta-anotado">${preguntasHTML(R)}</div>
        <div class="fila"><button class="ir grande" id="btn-enviar">${t(envion ? 'encuesta.enviar_envion' : 'encuesta.enviar')}</button><button id="btn-saltar">${t('encuesta.saltar')}</button></div>`, 'anotado encuesta');
      atarPreguntas(pn, R);
      pn.querySelector('#btn-saltar').addEventListener('click', () => { if (fin) return; analitica.encuestaCerrada({ momento, paso: 'anotado' }); seguir(); });
      pn.querySelector('#btn-enviar').addEventListener('click', () => {
        if (fin) return;
        R.otra = pn.querySelector('#otra').value;
        const resp = respuestas(R);
        if (!Object.keys(resp).length) { analitica.encuestaCerrada({ momento, paso: 'anotado' }); seguir(); return; }      // nada marcado: solo sigue
        fin = true; quitar(); guardado.set('tarima.encuesta', '1');
        // Sin esperar la respuesta: el pedido sigue solo (10 s de espera) y la persona no queda frenada.
        servidor.encuesta({ r: resp, idioma: idiomaActual(), sesion: analitica.idSesion(), momento }).then(x => { if (!x.ok && x.error !== 'ya_respondida') console.warn('encuesta:', x.error); }).catch(() => null);
        analitica.ev('encuesta_enviada', { momento, paso: 'anotado', desbloquea: false, plataforma: resp.plataforma || null, features: resp.features?.length || 0, otra: !!resp.otra });
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
        S.etapa = 'completa'; if (r.lista || r.libre) { S.lista = !!r.lista || S.lista; S.libre = true; S.quedan = null; } else if (Number.isFinite(r.quedan)) S.quedan = r.quedan;
        analitica.ev('envion_ok', { via: r.via });
        resolverSiguio(true, 'envion');      // sigue al dos tiempos de la misma final
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
    if (typeof r.encuesta_disponible === 'boolean') S.encuestaDisponible = r.encuesta_disponible;
    if (r.estado === 'ok') {
      S.lista = r.fuente === 'lista'; S.libre = S.lista || !!r.libre; S.quedan = S.libre ? null : r.quedan ?? null; if (Number.isFinite(r.n)) S.previas = r.n;
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
  if (S.lista || S.libre) return null;
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
    lugar.innerHTML = `<div class="invitacion abierta">${formularioHTML({ nombreLista: nombreReal(info.nombre).ok ? info.nombre : '' })}</div>`;
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
    S.lista = !!e.lista; S.libre = S.lista || !!e.libre; S.quedan = S.libre ? null : e.quedan ?? null; S.previas = e.contexto?.previas ?? 0;
    S.encuestaDisponible = !!e.encuesta_disponible;
    const g = Number(e.flags?.['muro-partidas-gratis']); if (g > 0) S.gratis = g;
    S.regla = leerRegla(e.regla) || S.regla; S.proxima = e.etapa === 'arranque' ? 'arranque' : 'completa';
  }
  try { await analitica.iniciar({ estado: e || {}, idioma: o.idioma, idioma_origen: o.idioma_origen, version: o.version, pantalla: S.pantalla() }); } catch { /* la medición nunca frena el juego */ }
  // muro al cargar: el servidor dice que no puede jugar (recargar, otra pestaña, ventana privada en la misma red…). Si
  // nunca jugó desde este dispositivo (red compartida que gastó su tope), primero la bienvenida y la práctica (P0).
  const muroAhora = !!e && e.puede === false && !S.reanudar && (e.contexto ? e.contexto.previas > 0 : true);
  return { muro: muroAhora, motivo: e?.motivo || 'dispositivo', fuente: e?.fuente || null };
}

// Empezar otra final después del cartel cuenta como «siguió jugando» (LIF-46)
ganchos.ev = (nombre, props) => { if (nombre === 'final_inicio') resolverSiguio(true, 'final'); analitica.ev(nombre, props); };
ganchos.registra = true;      // analitica.ev ya anota cada evento en window.JUEGO.eventos: main.js no lo repite
ganchos.visita = n => analitica.visita(n);
// Con el arranque gratis por delante, la bienvenida no dice «te queda 1 final gratis»: esa final es solo el arranque.
const quedanVisibles = () => (S.lista || S.libre ? Infinity : S.proxima === 'arranque' ? null : S.quedan);
ganchos.estado = () => (S.estado || S.lista || S.quedan !== null ? { quedan: quedanVisibles(), anotado: S.lista, libre: S.libre } : null);
ganchos.quedan = quedanVisibles;
ganchos.pedirPase = pedirPase;
ganchos.muro = muro;
ganchos.intervalo = intervalo;
ganchos.podio = podio;
ganchos.mandarFinal = info => servidor.mandarFinal(info);
ganchos.ranking = info => servidor.ranking(info);
ganchos.perfil = () => servidor.perfil();
ganchos.desafio = id => servidor.desafio(id);
ganchos.perfilGuardado = () => servidor.perfilGuardado();

export const conexion = { arranque, muro, intervalo, get anotado() { return S.lista; }, get libre() { return S.libre; }, get quedan() { return S.quedan; }, S };
