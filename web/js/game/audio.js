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
function ruido(dur, vol = .25, corte = 900) {
  if (!listo()) return; const b = bufer(dur);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = corte; g.gain.value = vol; s.connect(f).connect(g).connect(ctx.destination); s.start();
}
const vibra = ms => { try { navigator.vibrate?.(ms); } catch { /* sin vibración */ } };
export const sonido = {
  activar() { const ok = listo(); if (ok && !ruidos.size) for (const d of [.08, .1, .12, .3, .6, 1.2]) bufer(d); return ok; },
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
};
