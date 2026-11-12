// Sonido mínimo generado por código, sin archivos (docs/JUEGO.md, sección 8.3). Todo aviso sonoro tiene un gemelo visual:
// si el audio no está disponible o el usuario juega sin sonido, no se pierde nada.
let ctx = null;
const listo = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx.state === 'running'; } catch { return false; } };
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
export const sonido = {
  activar() { const ok = listo(); if (ok && !ruidos.size) for (const d of [.03, .05, .08, .1, .12, .18, .3, .6, 1.2, 1.6, 3]) bufer(d); return ok; },
  tic() { tono(1200, 900, .05, 'square', .08); },
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
  /** «¡Ohhh!» de la tribuna cuando se cae la barra. */
  lamento() { masa(1.6, .16, 520, 260, .18); },
  /** Ovación: la tribuna que sube y aplausos sueltos. `fuerza` 0 a 1 (más en los intentos que deciden medallas). */
  festejo(fuerza = .7) {
    if (!listo()) return; masa(3, .1 + .1 * fuerza, 900, 700, .3);
    const n = Math.round(30 + 50 * fuerza);
    for (let i = 0; i < n; i++) ruido(.03, .05 + .05 * azar(), 1500 + 2000 * azar(), { tipo: 'bandpass', q: 1.2, en: .1 + 2.6 * Math.pow(azar(), 1.6) });
  },
};
