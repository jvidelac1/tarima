// Visor Tarima: arma la escena, carga personajes y poses, y corre el bucle de transmisión.
import * as THREE from 'three';
import { ATHLETES, QUALITY, detectQuality, MIN_KG, MAX_KG } from './config.js';
import { clamp } from './util.js';
import { Timeline } from './timeline.js';
import { Athlete } from './athlete.js';
import { Barbell } from './barbell.js';
import { Arena } from './arena.js';
import { Lighting } from './lighting.js';
import { Post } from './post.js';
import { CameraRig, CAMERAS, SHOTS } from './cameras.js';
import { BarTrace } from './trace.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
const canvas = document.getElementById('gl');
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };

// Escalones del modo auto, de menor a mayor costo: calidad y fracción de resolución.
const STEPS = [{ q: 'baja', s: 1 }, { q: 'media', s: .8 }, { q: 'media', s: 1 }, { q: 'alta', s: .8 }, { q: 'alta', s: 1 }];
const stepKey = i => STEPS[i].q + (STEPS[i].s < 1 ? '@' + STEPS[i].s : '');

const S = {
  data: null, who: null, lift: params.get('lift') === 's' ? 's' : 'c', jerk: ['split', 'power', 'squat'].includes(params.get('jerk')) ? params.get('jerk') : 'split',
  t: 0, playing: false, slow: false, replay: false, scrubbing: true, trace: params.has('trace'), endT: -1,
  qSel: QUALITY[params.get('q')] ? params.get('q') : (store.get('tarima.q') && QUALITY[store.get('tarima.q')] ? store.get('tarima.q') : 'auto'), qName: null,
  kg: {}, clock: 60, athletes: {}, loading: {}, tl: null, scale: 1, step: -1, shadowDirty: 4, shadowAlways: false, shot: null,
};
if (params.get('ui') === '0') document.body.classList.add('clean');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.NoToneMapping;            // el tone mapping se hace en el pase final
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;   // penumbra blanda (ver lighting.js)
renderer.info.autoReset = true;
renderer.shadowMap.autoUpdate = false;                // las sombras se rehacen solo cuando cambió la pose o la barra (ver draw)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#070b16');
scene.fog = new THREE.FogExp2('#0b1226', .015);       // bruma de sala: el fondo lejano nunca llega a negro
const rig = new CameraRig(canvas, { reduceMotion });
const trace = new BarTrace(); scene.add(trace.group);
let Q = null, arena = null, lighting = null, post = null, barbell = null;
const v = new THREE.Vector3(), v2 = new THREE.Vector3(), barPrev = new THREE.Vector3();
/** Obturación del desenfoque de movimiento (s): 180° a 25 cuadros por segundo, como una cámara de estudio. */
const SHUTTER = 1 / 50;

const hud = new Hud({
  who: k => setWho(k), lift: k => setLift(k), jerk: k => setJerk(k), play: () => play(false), replay: () => play(true),
  slow: () => { S.slow = !S.slow; hud.setToggle('slow', S.slow); }, trace: () => { S.trace = !S.trace; trace.group.visible = S.trace; hud.setToggle('trace', S.trace); },
  cam: i => { setShot(null); rig.cut(i); hud.setCam(i); }, quality: q => { S.qSel = q; gov.reset(); store.set('tarima.q', q); applyQuality(q === 'auto' ? detectQuality() : q); },
  shot: k => setShot(k),
  load: kg => setKg(kg), scrub: p => { if (!S.tl) return; S.playing = false; S.scrubbing = true; S.replay = false; hud.setReplay(false); decide(null); S.t = S.tl.timeAtPhase(p); apply(0); },
});

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h || !Q) return;
  const pr = Math.min(window.devicePixelRatio || 1, Q.dpr, Math.sqrt(Q.maxPixels / (w * h))) * S.scale;      // S.scale: escalón de resolución del modo auto
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); rig.setAspect(w / h); post.setSize(w, h, pr); measureInsets();
}
/**
 * Márgenes seguros: cada pieza visible de la gráfica reserva el borde del lienzo que menos le cuesta (arriba, abajo o
 * un costado). El encuadre se calcula contra el rectángulo que queda libre, así la UI nunca tapa barra ni cabeza.
 */
const INSET_IDS = ['.bug', '.clockbox', '#telemetry', '#cams', '#lower'];
function measureInsets() {
  const c = canvas.getBoundingClientRect(), ins = { t: 0, b: 0, l: 0, r: 0 }; if (!c.width || !c.height) return;
  for (const sel of INSET_IDS) {
    const el = document.querySelector(sel); if (!el || !el.offsetParent) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cost = { t: (r.bottom - c.top) / c.height, b: (c.bottom - r.top) / c.height, l: (r.right - c.left) / c.width, r: (c.right - r.left) / c.width };
    const k = Object.keys(cost).reduce((a, b) => cost[b] < cost[a] ? b : a);
    ins[k] = Math.max(ins[k], clamp(cost[k] + .012, 0, .3));
  }
  rig.setInsets(ins);
}

/** Lo que no depende de la calidad se arma una sola vez: entorno, luces y barra (geometría y texturas). */
function buildStatic() {
  const coarse = matchMedia('(pointer:coarse)').matches, aniso = Math.min(coarse ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
  arena = new Arena({ tex: coarse ? 1024 : 2048, aniso, reduceMotion }); scene.add(arena.group);
  lighting = new Lighting(scene);
  barbell = new Barbell({ aniso, texSize: coarse ? 512 : 1024 }); scene.add(barbell.group);
}
/**
 * Cambia de calidad: render targets y pases de post, tamaño de sombras, DPR, densidad y tipo de público. No reconstruye
 * geometría ni texturas y no toca el estado de reproducción (la barra, el reloj y la decisión son los mismos objetos).
 */
function applyQuality(name, scale = 1) {
  const t0 = performance.now(), first = !arena; S.qName = name; Q = QUALITY[name]; S.scale = scale; S.step = STEPS.findIndex(s => s.q === name && s.s === scale); S.shadowDirty = 4;
  if (first) buildStatic();
  arena.setQuality(Q); lighting.setQuality(Q);
  post?.dispose(); post = new Post(renderer, scene, rig.camera, Q); post.reduceMotion = reduceMotion; post.motionObject = barbell.group; post.bokehObject = arena.bokeh;
  hud.setQuality(S.qSel, Q.label.toLowerCase() + (scale < 1 ? ` ${Math.round(scale * 100)}%` : ''));
  resize();
  if (first) { refreshBoard(); bakeEnv(); }
  S.qSwitchMs = performance.now() - t0; gov.warm();
}
function bakeEnv() { lighting.bake(renderer, [barbell.group, trace.group, ...Object.values(S.athletes).map(a => a.root)]); }

const kgKey = () => `${S.who}.${S.lift}`;
const currentKg = () => S.kg[kgKey()] ?? ATHLETES[S.who].kg[S.lift];
function setKg(kg) {
  if (!S.who || !Number.isFinite(kg)) return;
  S.kg[kgKey()] = barbell.setLoad(clamp(kg, MIN_KG, MAX_KG)); hud.setLoad(barbell.totalKg); refreshBoard(); S.scrubbing = !S.playing; S.shadowDirty = 4;
}
function refreshBoard() {
  if (!S.who || !arena) return; const a = ATHLETES[S.who];
  arena.setBoard({ name: a.name, country: a.country, kg: barbell?.totalKg, attempt: 1, lift: S.lift === 's' ? 'Arranque' : 'Dos tiempos' });
}
function decide(d) { S.decision = d; arena?.setDecision(d); hud.setDecision(d); }

function rebuildTimeline() {
  const a = S.athletes[S.who]; if (!a) return;
  S.tl = new Timeline(S.data[S.who], S.lift, S.jerk, a.barPos);
  hud.setPhases(S.tl.phases); hud.setLift(S.lift, S.jerk); barbell.setLoad(currentKg()); barbell.setGrip(S.tl.grip); hud.setLoad(barbell.totalKg);
  trace.build(S.tl, 1.1 + .06); refreshBoard();
}
/** Primer plano por clave de SHOTS ('' o null = cámara fija). */
function setShot(key) { const sh = SHOTS.find(s => s.key === key) || null; S.shot = sh; if (sh) aimShot(); rig.setShot(sh); hud.setShot(sh?.key, rig.index); }
/** Blanco del primer plano: punto medio de sus huesos en la pose actual ('Bar' es la barra tal como se dibuja). */
function aimShot() {
  const a = S.athletes[S.who], sh = S.shot; if (!a || !sh) return;
  const bones = sh.at.filter(k => k !== 'Bar'), nb = sh.at.length - bones.length; a.midWorld(bones, v2).multiplyScalar(bones.length);
  if (nb) v2.add(barbell.group.position); rig.shotAt.copy(v2.multiplyScalar(1 / sh.at.length)); rig.shotAt.y += sh.up * S.data[S.who].h;
}
function stopAt(t) { S.playing = false; S.replay = false; S.scrubbing = true; S.t = t; S.clock = 60; S.endT = -1; hud.setReplay(false); decide(null); rig.settle(); }

let whoToken = 0;
async function setWho(name) {
  if (!ATHLETES[name] || !S.data?.[name]) return;
  const token = ++whoToken;      // gana el último pedido, no la carga que termina última
  try {
    if (!S.athletes[name]) {
      hud.message('Cargando atleta…');
      // una sola carga por personaje aunque se pida dos veces mientras baja el GLB
      await (S.loading[name] ??= Athlete.load(name, S.data[name], { aniso: Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()), maxTex: Q.tex })
        .then(a => { a.root.visible = false; scene.add(a.root); S.athletes[name] = a; }));
    }
  } catch (err) { delete S.loading[name]; if (token === whoToken) hud.message('No se pudo cargar el modelo'); throw err; }
  if (token !== whoToken) return;
  gov.warm();                    // compilar shaders y subir texturas del personaje no cuenta como lentitud
  // el que deja de verse suelta su memoria de GPU antes de que el nuevo suba la suya
  for (const [k, a] of Object.entries(S.athletes)) if (k !== name && a.root.visible) { a.root.visible = false; a.releaseGpu(); }
  await S.athletes[name].restoreGpu(); if (token !== whoToken) return;
  S.athletes[name].root.visible = true;
  S.shadowDirty = 4;
  S.who = name; hud.setAthlete(name); rig.setAthleteHeight(S.data[name].h);
  rebuildTimeline(); stopAt(0); apply(0); hud.message('');
}
function setLift(k) { S.lift = k === 's' ? 's' : 'c'; if (!S.tl) { hud.setLift(S.lift, S.jerk); return; } rebuildTimeline(); stopAt(0); apply(0); }
function setJerk(k) {
  if (!['split', 'power', 'squat'].includes(k)) return;
  if (!S.tl) { S.jerk = k; hud.setLift(S.lift, S.jerk); return; }      // todavía no hay atleta: se recuerda la elección
  const keepRack = S.tl.rackSample !== undefined && S.tl.sampleAt(S.t) <= S.tl.rackSample;
  const t = keepRack ? S.t : 0; S.jerk = k; rebuildTimeline(); stopAt(Math.min(t, S.tl.duration)); apply(0);
}
function play(replay) {
  if (!S.tl) return;
  S.t = 0; S.playing = true; S.scrubbing = false; S.replay = replay; S.endT = -1; decide(null); hud.setReplay(replay);
  if (replay) { setShot(null); rig.cut(1); hud.setCam(1); if (!S.trace) { trace.group.visible = true; } } else trace.group.visible = S.trace;
  barbell.settle(S.tl.barY(0));
}

/** Posa atleta y barra en el instante S.t. simDt: tiempo de simulación para el whip (0 = estático). */
function apply(simDt) {
  const a = S.athletes[S.who], tl = S.tl; if (!a || !tl) return;
  const s = tl.sampleAt(S.t), cp = tl.clipPose(S.t);
  a.setPair(cp.from, cp.to, cp.u);
  tl.barFix(S.t, a.barWorld(v)); barbell.setPosition(v); rig.barY = v.y; rig.barAhead = S.playing ? tl.barTopAhead(S.t) : v.y;
  rig.headY = a.boneWorld('Head', v2).y + .14; aimShot(); S.shadowDirty = 3;
  if (S.scrubbing || simDt <= 0) barbell.settle(v.y); else barbell.step(simDt, v.y, S.playing ? tl.barAcc(S.t) : 0);
  trace.setTime(S.t);
  const p = s / tl.sub;
  hud.update(tl.readout(p), v.y * 100, S.playing ? tl.barVel(S.t) : 0, p, tl.peakVel().v, S.t, S.playing);
}

// ---------- bucle ----------
let last = performance.now(), frameN = 0;
/** Avanza el estado dt segundos de reloj (reproducción, whip, reloj, decisión). */
function tick(dt) {
  if (S.who && S.tl) {
    const rate = (S.slow || S.replay) ? .25 : 1;
    if (S.playing) {
      S.t += dt * rate;
      if (S.t >= S.tl.duration) { S.t = S.tl.duration; S.playing = false; S.endT = 0; }
      apply(dt * rate);
    } else if (!S.scrubbing) {
      apply(dt);                                   // la barra sigue oscilando al bloquear arriba
      if (S.endT >= 0) { S.endT += dt; if (S.endT > .9 && !arena.decision) { decide([true, true, true]); if (S.replay) { S.replay = false; hud.setReplay(false); } } }
    } else if (S.clock > 31) { S.clock -= dt; }
    arena.setClock(S.clock); hud.setClock(S.clock);
  }
}
/** Píxeles por metro con que se ve al atleta: elige su nivel de detalle (athlete.js). */
function screenScale() {
  const a = S.athletes[S.who]; if (!a || !post) return;
  S.pxPerM = post.H / (2 * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov) / 2)) / Math.max(.3, rig.camera.position.distanceTo(a.boneWorld('Spine1', v2)));
  if (a.setScreenScale(S.pxPerM)) S.shadowDirty = Math.max(S.shadowDirty, 2);
}
/** Dibuja un cuadro. Los mapas de sombra solo se rehacen si algo que proyecta sombra cambió desde el cuadro anterior. */
function draw(dt) { renderer.shadowMap.needsUpdate = S.shadowAlways || S.shadowDirty > 0; if (S.shadowDirty > 0) S.shadowDirty--; post.render(dt); }
function frame(now) {
  raf = requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(raw, .05); last = now;
  if (!S.manualClock) tick(dt);
  if (++frameN % 20 === 0) measureInsets();
  rig.update(dt); trace.face(rig.camera); post.focus = rig.focusDistance; arena.update(dt, rig.camera);
  screenScale();
  // desenfoque de movimiento: desplazamiento de la barra en pantalla durante la obturación (en cámara lenta se mueve menos por cuadro)
  const bp = barbell.group.position;
  if (S.testMotion) post.motion.copy(S.testMotion);
  else if (S.playing && !S.manualClock && raw > 1e-4 && bp.distanceTo(barPrev) < .2) {
    v.copy(bp).project(rig.camera); v2.copy(bp).sub(barPrev).multiplyScalar(SHUTTER / raw).negate().add(bp).project(rig.camera); post.motion.set((v.x - v2.x) / 2, (v.y - v2.y) / 2);
  } else post.motion.set(0, 0);
  barPrev.copy(bp);
  draw(dt);
  governor(raw);
}
/**
 * Gobernador de calidad en modo auto. Mide contra el refresco real de la pantalla (no contra 60 fijos: un tope de 30 Hz
 * por bajo consumo no es lentitud), descarta el calentamiento tras cargar o cambiar de calidad, no cambia en plena
 * reproducción salvo que el cuadro sea inusable, y puede volver a subir: prueba el escalón de arriba tras 4 s holgados
 * en reposo, con espera creciente (30 s, 60 s, 120 s…) si ese escalón ya falló.
 * Entre calidad y calidad hay un escalón de resolución (80 %): bajar píxeles no cambia el look ni reconstruye pases, así
 * que el modo auto se acomoda sin saltar de calidad por una diferencia chica de rendimiento.
 */
function applyStep(i) {
  const st = STEPS[i];
  if (st.q !== S.qName) { applyQuality(st.q, st.s); return; }
  S.step = i; S.scale = st.s; resize(); hud.setQuality(S.qSel, Q.label.toLowerCase() + (st.s < 1 ? ` ${Math.round(st.s * 100)}%` : '')); gov.warm(1500);
}
const gov = {
  refresh: 60, t: 0, n: 0, slow: 0, fast: 0, warmUntil: 0, fails: {}, retryAt: {}, log: [],
  warm(ms = 2500) { this.warmUntil = performance.now() + ms; this.t = this.n = this.slow = this.fast = 0; },
  reset() { this.fails = {}; this.retryAt = {}; this.warm(); },
  /** Decide con los fps de una ventana de 1 s. Devuelve el escalón (índice de STEPS) al que hay que pasar, o null. */
  decide(fps, now, playing, coarse) {
    const i = S.step, ratio = fps / this.refresh; if (i < 0) return null;
    this.slow = ratio < .75 ? this.slow + 1 : 0; this.fast = ratio >= .93 ? this.fast + 1 : 0;
    if (this.slow >= 2 && i > 0 && (!playing || ratio < .45)) {
      const from = stepKey(i); this.fails[from] = (this.fails[from] || 0) + 1; this.retryAt[from] = now + 30000 * 2 ** (this.fails[from] - 1); this.slow = 0;
      return i - 1;
    }
    const up = i + 1;
    if (this.fast >= 4 && up < STEPS.length && !playing && !(coarse && STEPS[up].q === 'alta') && now >= (this.retryAt[stepKey(up)] || 0)) { this.fast = 0; return up; }
    return null;
  },
  frame(raw) {
    const now = performance.now();
    if (S.qSel !== 'auto' || params.get('auto') === '0' || document.visibilityState !== 'visible' || raw > 1 || now < this.warmUntil) { this.t = this.n = 0; return; }
    this.t += raw; this.n++;
    if (this.t < 1) return;
    const fps = this.n / this.t; this.t = this.n = 0; S.fps = fps;
    const to = this.decide(fps, now, S.playing, matchMedia('(pointer:coarse)').matches);
    if (to !== null) { this.log.push({ from: stepKey(S.step), to: stepKey(to), fps: +fps.toFixed(1), playing: S.playing }); applyStep(to); }
  },
};
function governor(raw) { gov.frame(raw); }
/** Refresco de la pantalla: mediana de 24 intervalos de rAF sin dibujar nada (antes de armar la escena). */
function measureRefresh() {
  const rates = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  const run = new Promise(res => { const ts = []; const f = t => { ts.push(t); ts.length < 25 ? requestAnimationFrame(f) : res(ts); }; requestAnimationFrame(f); });
  return Promise.race([run, new Promise(res => setTimeout(() => res(null), 1500))]).then(ts => {
    if (!ts) return 60;
    const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b), hz = 1000 / d[d.length >> 1];
    return rates.reduce((a, b) => Math.abs(b - hz) < Math.abs(a - hz) ? b : a);
  });
}
let raf = 0;

async function init() {
  hud.message('Cargando…'); hud.setEnabled(false);       // la consola no responde hasta que haya un atleta en escena
  gov.refresh = await measureRefresh();
  await Promise.all([`800 20px 'Saira Condensed'`, `700 20px 'Saira Condensed'`, `500 20px 'Saira Condensed'`].map(f => document.fonts.load(f).catch(() => null)));
  applyQuality(S.qSel === 'auto' ? detectQuality() : S.qSel);
  new ResizeObserver(resize).observe(canvas);
  const res = await fetch('data/poses.json'); if (!res.ok) throw new Error('poses.json: ' + res.status);
  S.data = await res.json();
  hud.setToggle('trace', S.trace); trace.group.visible = S.trace;
  const cam = clamp(parseInt(params.get('cam') || '0', 10) || 0, 0, CAMERAS.length - 1); rig.cut(cam); hud.setCam(cam);
  try { await setWho(ATHLETES[params.get('who')] ? params.get('who') : 'ventura'); } finally { hud.setEnabled(true); }
  last = performance.now(); raf = requestAnimationFrame(frame);
}

// API para pruebas automáticas y depuración
window.TARIMA = {
  state: S, renderer, scene, rig, get barbell() { return barbell; }, get post() { return post; }, get arena() { return arena; },
  setWho, setLift, setJerk, play, setKg,
  seekPhase(p) { if (!S.tl) return; stopAt(S.tl.timeAtPhase(p)); apply(0); }, seekTime(t) { if (!S.tl) return; stopAt(clamp(t, 0, S.tl.duration)); apply(0); },
  setQuality(q) { applyQuality(q); }, measureInsets, gov, STEPS, stepKey, applyStep, SHOTS,
  /** Primer plano por clave ('cara', 'torso', 'rack', 'manos', 'pies'…); sin argumento vuelve a la cámara fija. */
  shot(key) { setShot(key || null); },
  /** Índice de la primera fase cuyo nombre cumple la expresión (para pruebas: las fases se buscan por nombre en poses.json). */
  phaseIndex(re) { return S.tl ? S.tl.phases.findIndex(p => new RegExp(re).test(p.n)) : -1; },
  /** Para pruebas: estadística de luminancia (0..255, sRGB) del cuadro actual tal como sale a pantalla. */
  luma() {
    post.render(0); const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const hist = new Uint32Array(256); let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 12) { const R = px[i], G = px[i + 1], B = px[i + 2]; hist[Math.round(.2126 * R + .7152 * G + .0722 * B)]++; r += R; g += G; b += B; n++; }
    const pct = q => { let acc = 0; for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= q * n) return k; } return 255; };
    let dark = 0; for (let k = 0; k < 8; k++) dark += hist[k];
    return { median: pct(.5), p25: pct(.25), p75: pct(.75), dark: dark / n, rgb: [r / n, g / n, b / n].map(Math.round) };
  },
  /**
   * Para pruebas: costo por pase en ms. Cada fila apaga una cosa más que la anterior, así la diferencia entre filas es el
   * costo de ese pase. Con EXT_disjoint_timer_query_webgl2 mide tiempo de GPU (`gpu: true`: no depende de la carga de CPU
   * de la máquina); sin la extensión dibuja `reps` cuadros y fuerza la GPU con readPixels (reloj de pared, mejor de 3).
   */
  async profile(reps = 8) {
    const gl = renderer.getContext(), px = new Uint8Array(4), out = {}, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const wall = () => { const t0 = performance.now(); for (let i = 0; i < reps; i++) draw(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (performance.now() - t0) / reps; };
    // una consulta por cuadro y se queda con el mínimo: el tiempo de GPU incluye la espera cuando otro proceso usa la GPU,
    // y el mínimo de varias muestras es lo que más se acerca al costo propio del cuadro (la mediana va en `med`)
    const gpu = async () => {
      const qs = []; for (let i = 0; i < reps; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); draw(0); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.flush(); qs.push(q); }
      const last = qs[qs.length - 1]; for (let k = 0; k < 400 && !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise(r => setTimeout(r, 5));
      const dis = gl.getParameter(ext.GPU_DISJOINT_EXT), ms = [];
      for (const q of qs) { if (!dis && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
      ms.sort((a, b) => a - b); gpu.med = ms.length ? ms[ms.length >> 1] : NaN; return ms.length ? ms[0] : NaN;
    };
    let useGpu = !!ext; if (useGpu && !((await gpu()) > 0)) useGpu = false;
    const med = out.med = {};
    const best = async row => { if (!useGpu) return Math.min(wall(), wall(), wall()); const a = [], m = []; for (let i = 0; i < 3; i++) { const x = await gpu(); if (x > 0) { a.push(x); m.push(gpu.med); } } if (!a.length) return Math.min(wall(), wall()); med[row] = Math.min(...m); return Math.min(...a); };
    const a = S.athletes[S.who], cv = arena.crowd.visible, mc = S.manualClock; S.manualClock = true; S.shadowAlways = true;      // como en plena reproducción: sombras en cada cuadro
    try {
      out.completo = await best('completo');
      for (const k of ['smaa', 'bloom', 'dof', 'ao']) { post.skip[k] = true; out['sin_' + k] = await best('sin_' + k); }
      S.shadowAlways = false; S.shadowDirty = 0; out.sin_sombras = await best('sin_sombras');
      arena.crowd.visible = false; out.sin_publico = await best('sin_publico');
      if (a) { a.root.visible = false; out.sin_atleta = await best('sin_atleta'); a.root.visible = true; }
      arena.group.visible = false; out.sin_entorno = await best('sin_entorno');
    } finally { arena.group.visible = true; arena.crowd.visible = cv; S.shadowAlways = false; S.shadowDirty = 4; post.skip = {}; S.manualClock = mc; }
    renderer.info.autoReset = false; renderer.info.reset(); S.shadowAlways = true; draw(0); S.shadowAlways = false; out.calls = renderer.info.render.calls; out.tris = renderer.info.render.triangles; renderer.info.autoReset = true; out.w = post.W; out.h = post.H; out.gpu = useGpu;
    return out;
  },
  /**
   * Para pruebas: tiempo de GPU por etapa del cuadro (ms), con una consulta por etapa y por cuadro. Devuelve el mínimo y la
   * mediana de `reps` cuadros: con la GPU compartida con otros procesos, el mínimo es lo más cercano al costo propio.
   * `shadows`: rehacer los mapas de sombra en cada cuadro (como en reproducción) o no (pose quieta). `whole`: una sola
   * consulta por cuadro (clave 'escena' = cuadro entero), sin los cortes entre etapas.
   */
  async profilePasses(reps = 30, shadows = true, whole = false) {
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
    const list = []; let open = false;
    post.prof = name => { if (whole && name && name !== 'escena') return; if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); open = false; } if (name) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = true; list.push([name, q]); } };
    const mc = S.manualClock; S.manualClock = true; S.shadowAlways = shadows; if (!shadows) S.shadowDirty = 0;
    try { for (let i = 0; i < reps; i++) { draw(0); gl.flush(); if (i % 6 === 5) await new Promise(r => setTimeout(r, 0)); } } finally { post.prof = null; S.shadowAlways = false; S.manualClock = mc; }
    const last = list[list.length - 1][1]; for (let k = 0; k < 600 && !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise(r => setTimeout(r, 5));
    const dis = gl.getParameter(ext.GPU_DISJOINT_EXT), by = {};
    for (const [name, q] of list) { if (!dis && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) (by[name] ||= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
    const out = { min: {}, med: {}, w: post.W, h: post.H }; let tm = 0, td = 0;
    for (const k in by) { by[k].sort((a, b) => a - b); out.min[k] = by[k][0]; out.med[k] = by[k][by[k].length >> 1]; tm += out.min[k]; td += out.med[k]; }
    out.min.total = tm; out.med.total = td; S.shadowDirty = 4; return out;
  },
  /**
   * Para pruebas: memoria de GPU estimada (MB) de lo que está subido ahora: texturas de materiales (con mipmaps) y destinos
   * de render (post, sombras, entorno). No cuenta buffers de geometría ni el lienzo.
   */
  gpuMemory() {
    const P = renderer.properties, MB = 1 / 1048576, bpp = t => (t.type === THREE.HalfFloatType ? 2 : t.type === THREE.FloatType ? 4 : t.type === THREE.UnsignedInt101111Type ? 4 / 3 : 1) * (t.format === THREE.RGFormat ? 2 : t.format === THREE.RedFormat ? 1 : t.format === THREE.RGBFormat && t.type === THREE.UnsignedInt101111Type ? 3 : 4);
    const seen = new Set(), out = { texturas: 0, atletas: 0, post: 0, sombras: 0, entorno: 0 };
    const tex = (t, key) => { if (!t?.isTexture || t.isRenderTargetTexture || seen.has(t.source) || !P.get(t).__webglTexture) return; seen.add(t.source); const im = t.image, w = t.userData.w || im?.width, h = t.userData.h || im?.height; if (!w) return; out[key] += w * h * bpp(t) * (t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1) * MB; };
    const mats = (o, key) => { for (const m of [].concat(o.material || [])) { for (const k in m) if (m[k]?.isTexture) tex(m[k], key); for (const k in (m.uniforms || {})) tex(m.uniforms[k]?.value, key); for (const k in (m.userData?.skin || {})) tex(m.userData.skin[k].value, key); } };
    for (const a of Object.values(S.athletes)) a.root.traverse(o => mats(o, 'atletas'));
    scene.traverse(o => mats(o, 'texturas'));
    const rt = t => { if (!t || !P.get(t).__webglFramebuffer) return 0; const px = t.width * t.height, s = t.samples || 0, c = bpp(t.texture), d = t.depthTexture ? 4 : 0; return px * (c + d + (s > 1 ? s * (c + (t.depthBuffer ? 4 : 0)) : 0)) * MB; };
    for (const t of post.targets()) out.post += rt(t);
    for (const l of lighting.lights) if (l.shadow?.map) out.sombras += rt(l.shadow.map) + rt(l.shadow.mapPass);
    if (lighting.envRT) out.entorno += rt(lighting.envRT);
    out.total = 0; for (const k in out) if (k !== 'total') { out[k] = Math.round(out[k] * 10) / 10; out.total += out[k]; } out.total = Math.round(out.total);
    return out;
  },
  /** Para pruebas: avanza estado y cámara un paso fijo, sin dibujar. */
  step(dt) { tick(dt); rig.update(dt); screenScale(); },
  /**
   * Para pruebas: extremos en NDC de lo que tiene que entrar en cuadro (discos con flecha, puntas de la barra, cabeza
   * y pies) y el rectángulo libre de gráfica, también en NDC.
   */
  framing() {
    const a = S.athletes[S.who], b = barbell.group.position, pts = [], out = { minX: 9, maxX: -9, minY: 9, maxY: -9 }, I = rig.inset;
    const up = barbell.plateR + Math.max(0, barbell.tipDrop || 0), dn = barbell.plateR - Math.min(0, barbell.tipDrop || 0);
    for (const sx of [-1, 1]) pts.push([sx * 1.1, b.y, b.z], [sx * .95, b.y + up, b.z], [sx * .95, Math.max(-.1, b.y - dn), b.z]);
    a.boneWorld('Head', v2); pts.push([v2.x, v2.y + .14, v2.z], [0, 0, .25], [0, 0, -.15]);
    rig.camera.updateMatrixWorld();
    for (const p of pts) { v2.set(...p).project(rig.camera); out.minX = Math.min(out.minX, v2.x); out.maxX = Math.max(out.maxX, v2.x); out.minY = Math.min(out.minY, v2.y); out.maxY = Math.max(out.maxY, v2.y); }
    return { ...out, free: { minX: -1 + 2 * I.l, maxX: 1 - 2 * I.r, minY: -1 + 2 * I.b, maxY: 1 - 2 * I.t }, cam: rig.index };
  },
  cam(i) { setShot(null); rig.cut(i); hud.setCam(i); },
  /** Para pruebas: fuerza el barrido del desenfoque de movimiento (en UV por obturación) con la imagen detenida; sin argumentos lo suelta. */
  testMotion(x, y) { S.testMotion = x === undefined ? null : new THREE.Vector2(x, y); },
  /** Para pruebas: detiene el reloj propio y avanza a paso fijo. */
  manualClock(on) { S.manualClock = !!on; }, tick,
  ready: init().then(() => true, err => { hud.message('No se pudo iniciar el visor'); console.error(err); return false; }),
};

addEventListener('pagehide', () => {
  cancelAnimationFrame(raf); hud.dispose(); rig.dispose(); trace.dispose(); arena?.dispose(); lighting?.dispose(); post?.dispose(); barbell?.dispose();
  Object.values(S.athletes).forEach(a => a.dispose()); renderer.dispose();
});
