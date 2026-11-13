// Sonido mínimo generado por código, sin archivos (docs/JUEGO.md, sección 8.3). Todo aviso sonoro tiene un gemelo visual:
// si el audio no está disponible o el usuario juega sin sonido, no se pierde nada.
//
// iPhone (Safari y Chrome de iOS: los dos son WebKit). Tres cosas hacían que no sonara nada:
// - El AudioContext solo arranca dentro del manejador de un gesto (touchend, click, keydown; touchstart y pointerdown no
//   cuentan, y tampoco lo que corre después de un await). Si queda 'suspended' o 'interrupted' (llamada, pantalla
//   bloqueada, otra app), hay que reanudarlo dentro de otro gesto. Antes solo se creaba en el clic de un botón de panel y
//   solo se reanudaba si estaba 'suspended'. Ahora `desbloquear()` corre en la fase de captura de cada gesto, antes que
//   cualquier otro manejador, y es sincrónico.
// - Con el interruptor de silencio (o el botón de acción en silencio) WebKit calla Web Audio: lo trata como sonido
//   «ambiente». Se pide la sesión de reproducción: navigator.audioSession.type = 'playback' (WebKit 16.4 en adelante) y,
//   además, un <audio> silencioso en bucle (mientras suena un elemento multimedia la sesión es de reproducción y Web Audio
//   sale aunque el teléfono esté en silencio). Solo en iOS; 4,8 KB de silencio armados acá, sin descargas.
// - No había forma de prender o apagar el sonido. Ahora hay un botón (#sonidob en la barra y «Sonido» en Opciones) que se
//   recuerda en este dispositivo (tarima.sonido). Apagado: no se crea ni se reanuda nada de audio.
import { t, alCambiarIdioma } from './i18n/t.js';

const guardado = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const nav = typeof navigator !== 'undefined' ? navigator : {};
const esIOS = () => /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);

let ctx = null, encendido = guardado.get('tarima.sonido') !== '0', silencio = null, silencioSono = false;
/** Tipo de sesión de audio de WebKit: 'playback' suena con el teléfono en silencio; 'ambient' se mezcla con otra música. */
function sesion(tipo) { try { if (nav.audioSession && nav.audioSession.type !== tipo) nav.audioSession.type = tipo; } catch { /* sin la API */ } }
/** WAV mono de 8 bits con 0,1 s de silencio, a la frecuencia del contexto (si no coincide, iOS cambia la del equipo y Web Audio suena mal). */
function wavSilencio(fm) {
  const n = Math.round(fm / 10), b = new ArrayBuffer(44 + n), v = new DataView(b), s = (o, x) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, fm, true); v.setUint32(28, fm, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(b, 44).fill(128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
/**
 * Dentro de un gesto: sesión de reproducción, contexto creado y reanudado, un búfer vacío que lo destraba en los WebKit
 * viejos y, en iOS, el <audio> silencioso. Sincrónico a propósito: después de un await ya no hay gesto. Con el sonido
 * apagado no hace nada, salvo que el gesto sea el que lo prende (el botón tachado o «Con sonido» de Opciones): main.js
 * cambia el estado después de un await, y el desbloqueo tiene que pasar acá, todavía dentro del toque.
 */
const PRENDE = '#sonidob.apagado,[data-sonido="si"]';
function desbloquear(e) {
  if (!encendido && !(e && e.type === 'click' && e.target?.closest?.(PRENDE))) return;
  sesion('playback');
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    if (ctx.state !== 'running') {
      ctx.resume?.()?.catch?.(() => null);
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0);
    }
  } catch { return; }
  if (esIOS()) {
    try {
      if (!silencio) { silencio = document.createElement('audio'); silencio.setAttribute('x-webkit-airplay', 'deny'); silencio.preload = 'auto'; silencio.loop = true; silencio.src = wavSilencio(ctx.sampleRate); }
      if (silencio.paused) silencio.play()?.then(() => { silencioSono = true; }, () => null);
    } catch { /* sin <audio> */ }
  }
}
const listo = () => {
  if (!encendido || !ctx) return false;
  if (ctx.state !== 'running') { try { ctx.resume?.()?.catch?.(() => null); } catch { /* el próximo gesto */ } }
  return ctx.state === 'running';
};

function tono(f0, f1, dur, tipo = 'sine', vol = .2) {
  if (!listo()) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + .02);
}
// Los búferes de ruido se generan una vez por duración (al activar el sonido, con un panel abierto), no en medio del intento.
const ruidos = new Map();
function bufer(dur) {
  let b = ruidos.get(dur); if (b) return b;
  const n = Math.floor(ctx.sampleRate * dur), d = (b = ctx.createBuffer(1, n, ctx.sampleRate)).getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  ruidos.set(dur, b); return b;
}
function ruido(dur, vol = .25, corte = 900, { tipo = 'lowpass', q = 1, en = 0 } = {}) {
  if (!listo()) return; const b = bufer(dur);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = tipo; f.frequency.value = corte; f.Q.value = q; g.gain.value = vol; s.connect(f).connect(g).connect(ctx.destination); s.start(ctx.currentTime + en);
}
/** Ruido con envolvente propia (sube en `ataque` s, dura `dur`), filtrado en banda: la voz de la tribuna. */
function masa(dur, vol, f0, f1, ataque = .25) {
  if (!listo()) return; const t = ctx.currentTime, b = bufer(dur);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = 'bandpass'; f.Q.value = .8;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + ataque); g.gain.setValueAtTime(vol, t + ataque); s.connect(f).connect(g).connect(ctx.destination); s.start(t);
}
// generador propio para los aplausos (que no cambie el orden de nada del juego)
let semilla = 7; const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const vibra = ms => { try { navigator.vibrate?.(ms); } catch { /* sin vibración */ } };

// ---------- botón de sonido: parlante con ondas (prendido) o tachado (apagado) ----------
const ICONO = {
  si: '<svg class="parlante" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  no: '<svg class="parlante" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
/** Pinta el estado en el botón de la barra (#sonidob) y en los de Opciones ([data-sonido="si"|"no"]). */
function pintar() {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('sonidob');
  if (b) {
    if (b.dataset.estado !== String(encendido)) { b.innerHTML = ICONO[encendido ? 'si' : 'no']; b.dataset.estado = String(encendido); }
    b.classList.toggle('apagado', !encendido); b.setAttribute('aria-pressed', String(encendido));
    const txt = t(encendido ? 'sonido.apagar' : 'sonido.prender'); if (b.title !== txt) { b.setAttribute('aria-label', txt); b.title = txt; }
  }
  for (const o of document.querySelectorAll('[data-sonido]')) o.setAttribute('aria-pressed', String((o.dataset.sonido === 'si') === encendido));
}

export const sonido = {
  /** Prendido o apagado (se recuerda en este dispositivo). */
  get encendido() { return encendido; },
  /** Para las pruebas: prendido, estado del contexto, sesión de WebKit y si el <audio> silencioso está sonando. */
  get estado() { return { encendido, contexto: ctx ? ctx.state : 'sin contexto', sesion: nav.audioSession?.type ?? null, silencio: silencio ? !silencio.paused : null, silencioSono }; },
  /** Ícono del parlante para un botón (`si`: prendido). */
  icono: si => ICONO[si ? 'si' : 'no'],
  /**
   * Prende o apaga, y lo recuerda. Llamarlo dentro del manejador de un toque: al prender, ahí mismo se desbloquea el audio y
   * suena un aviso corto (así se oye que quedó prendido).
   */
  encender(si) {
    encendido = !!si; guardado.set('tarima.sonido', encendido ? '1' : '0');
    if (encendido) {
      desbloquear(); this.activar();      // (si ya no hay gesto, el desbloqueo lo hizo la captura del mismo clic)
      if (ctx) { if (ctx.state === 'running') this.aviso(); else ctx.resume?.()?.then?.(() => this.aviso(), () => null); }
    } else { try { silencio?.pause(); } catch { /* nada */ } sesion('ambient'); try { ctx?.suspend?.()?.catch?.(() => null); } catch { /* nada */ } }
    pintar(); return encendido;
  },
  alternar() { return this.encender(!encendido); },
  /** Repinta el botón de la barra (al cambiar el idioma lo hace solo). */
  pintar,
  activar() { desbloquear(); const ok = listo(); if (ok && !ruidos.size) for (const d of [.03, .05, .08, .1, .12, .18, .3, .6, 1.2, 1.6, 3]) bufer(d); return ok; },
  tic() { tono(1200, 900, .05, 'square', .08); },
  /**
   * La barrita ('b'): un zumbido grave que sube mientras corre el puntero (devuelve con qué cortarlo) y el golpe del toque
   * según la zona: verde, campanazo con la tribuna; amarillo, golpe seco; rojo, zumbido bajo.
   */
  subida() {
    if (!listo()) return () => {};
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); let fin = false;
    o.type = 'triangle'; o.frequency.setValueAtTime(150, t); o.frequency.linearRampToValueAtTime(330, t + 6);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.045, t + .5); o.connect(g).connect(ctx.destination); o.start(t);
    return () => { if (fin) return; fin = true; try { const t2 = ctx.currentTime; g.gain.cancelScheduledValues(t2); g.gain.setValueAtTime(.03, t2); g.gain.exponentialRampToValueAtTime(.0001, t2 + .06); o.stop(t2 + .08); } catch { /* ya cortado */ } };
  },
  pega(zona) {
    if (zona === 'verde') { tono(880, 880, .22, 'triangle', .16); tono(1320, 1320, .3, 'sine', .1); ruido(.6, .07, 2600); vibra(30); }
    else if (zona === 'amarillo') { tono(300, 240, .14, 'square', .09); ruido(.06, .2, 800); vibra(18); }
    else { tono(130, 80, .3, 'sawtooth', .12); vibra([20, 40, 20]); }
  },
  despegue() { ruido(.12, .15, 500); vibra(10); },
  explosion(perfecta) { ruido(.1, .2, 1400); if (perfecta) vibra(20); },
  recepcion() { tono(110, 50, .16, 'sine', .5); ruido(.08, .3, 700); vibra(30); },
  toque() { vibra(8); },
  chicharra() { tono(420, 400, .45, 'sawtooth', .16); vibra(40); },
  luz(blanca) { tono(blanca ? 880 : 220, blanca ? 860 : 200, .09, 'square', .1); },
  fallo() { tono(80, 35, .4, 'sine', .6); ruido(.3, .35, 400); vibra(60); },
  aviso() { tono(660, 990, .12, 'triangle', .12); },
  ovacion(ok) { ruido(ok ? 1.2 : .6, ok ? .12 : .06, ok ? 2600 : 500); },
  /** Discos de goma contra la tarima: golpe sordo y el traqueteo de las mangas. `v`: velocidad del golpe (m/s). */
  golpe(v) {
    const k = Math.min(1, v / 6); if (k < .08) return;
    tono(70, 38, .22 + .12 * k, 'sine', .65 * k); ruido(.12, .5 * k, 260); ruido(.05, .12 * k, 2600, { tipo: 'bandpass', q: 3, en: .01 }); vibra(Math.round(50 * k));
  },
  /** Disco o collarín que llega al tope de la manga: metal contra metal, corto. */
  metal(fuerte = 1) { tono(2350, 2200, .09, 'triangle', .07 * fuerte); tono(3400, 3300, .06, 'triangle', .04 * fuerte); ruido(.03, .2 * fuerte, 4200, { tipo: 'bandpass', q: 4 }); },
  /** Disco que sale de la manga: roce. */
  roce() { ruido(.18, .07, 1800, { tipo: 'bandpass', q: 1.5 }); },
  /** FRENO: un latido (dos golpes graves, el segundo más suave). */
  latido() { if (!listo()) return; const t = ctx.currentTime; for (const [en, v] of [[0, .55], [.17, .35]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(62, t + en); o.frequency.exponentialRampToValueAtTime(40, t + en + .14); g.gain.setValueAtTime(.0001, t + en); g.gain.exponentialRampToValueAtTime(v, t + en + .012); g.gain.exponentialRampToValueAtTime(.001, t + en + .16); o.connect(g).connect(ctx.destination); o.start(t + en); o.stop(t + en + .18); } vibra(15); },
  /** ¡PÁRATE!: el pisotón contra la tarima (golpe de bajo) y el grito corto del pesista. */
  pisoton() { tono(58, 34, .26, 'sine', .7); ruido(.08, .4, 320); masa(.3, .07, 760, 520, .03); vibra(25); },
  /** La garra traba la barra: golpe y la tribuna que estalla. */
  garra() { tono(90, 45, .2, 'sine', .55); ruido(.06, .3, 900); masa(1.2, .2, 1100, 800, .08); vibra(40); },
  /** «¡Ohhh!» de la tribuna cuando se cae la barra. */
  lamento() { masa(1.6, .16, 520, 260, .18); },
  /** Ovación: la tribuna que sube y aplausos sueltos. `fuerza` 0 a 1 (más en los intentos que deciden medallas). */
  festejo(fuerza = .7) {
    if (!listo()) return; masa(3, .1 + .1 * fuerza, 900, 700, .3);
    const n = Math.round(30 + 50 * fuerza);
    for (let i = 0; i < n; i++) ruido(.03, .05 + .05 * azar(), 1500 + 2000 * azar(), { tipo: 'bandpass', q: 1.2, en: .1 + 2.6 * Math.pow(azar(), 1.6) });
  },
};

// Cada gesto (en la fase de captura, antes que el juego) desbloquea o reanuda el audio; el botón de la barra lo alterna.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  for (const k of ['touchend', 'click', 'keydown', 'pointerup', 'mouseup']) addEventListener(k, desbloquear, { capture: true, passive: true });
  document.addEventListener('click', e => { if (e.target.closest?.('#sonidob')) sonido.alternar(); });
  // al volver a la pestaña se intenta reanudar sin gesto (iOS a veces deja); si no, lo hace el próximo toque
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { try { silencio?.pause(); } catch { /* nada */ } return; }
    if (!encendido) return;
    try { ctx?.resume?.()?.catch?.(() => null); if (silencio?.paused) silencio.play()?.catch?.(() => null); } catch { /* el próximo toque */ }
  });
  if (encendido) sesion('playback');
  alCambiarIdioma(pintar);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintar, { once: true }); else pintar();
}
