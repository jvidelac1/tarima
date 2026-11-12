// Planos fijos de la dirección de arte (etapa 2): la misma lista P01 a P16 para cada versión del personaje, capturada en el
// visor con reloj manual, cámara sin deriva y azar sembrado, así dos corridas del mismo build dan la misma imagen y la
// diferencia entre versiones es del personaje y no del plano.
// Uso: node tools/shots.mjs --web=web --tag=A --out=out/arte/shots [--clay] [--prop=<glb>] [--only=P01,P03] [--list]
//   --web=<carpeta>   raíz del visor a capturar (web, webv/B/..., con su models/ y data/poses.json)
//   --tag=<A|B|C|A2>  versión; los archivos salen como <tag>_P01.png (con --clay, <tag>_clay_P01.png)
//   --out=<carpeta>   destino de las capturas y de shots.json (lista de planos + datos de cada corrida)
//   --clay            material de arcilla gris en las mallas del atleta; oculta pelo, barba, cejas y pestañas. Solo P01 a P12.
//                     (gris oscuro 0x303030: con las luces de la sala un gris medio se quema y aplana el relieve)
//                     Baja los contraluces: de espaldas (P03, P04) los dos contraluces y la luz de pelo quedan del lado de la
//                     cámara, casi parejos, y lavaban el relieve. Queda el contraluz frío como clave de la espalda; el cálido
//                     baja a 0,25 y la luz de pelo a 0,15 (LUCES_ARCILLA). Vale para todos los planos de la corrida de arcilla.
//   --mask            máscaras para medir, sin post: el atleta solo, sobre negro, con color plano por segmento según el hueso que
//                     más pesa en cada vértice (rojo = brazo, verde = antebrazo y mano, azul = resto); oculta el pelo como la
//                     arcilla. Tres imágenes por plano: <tag>_mask_P01.png (lo que se ve), <tag>_maskb_P01.png (los brazos solos,
//                     sin que nada los tape) y <tag>_maskt_P01.png (el cuerpo sin antebrazos ni manos). Guarda en shots.json la
//                     posición en píxeles de hombros, codos y muñecas (huesos_px), para que tools/widths.py mida en el mismo
//                     punto anatómico. Solo P01 a P12.
//   --prop=<glb>      malla estática (ya alineada al rig, en metros): se cuelga de la raíz de ventura y se ocultan sus mallas
//   --only=P01,P03    solo esos planos (los datos de los demás planos de la corrida se conservan en shots.json)
//   --list            escribe la lista de planos y termina, sin abrir el navegador
//   --no-gfx          oculta la gráfica de TV (reloj, zócalo, telemetría); por defecto queda, como en el juego
//   CHROME_PATH y TARIMA_ANGLE eligen navegador y backend de WebGL (tools/browser.mjs). En el pod: TARIMA_ANGLE=vulkan.
// Sale con 1 si hubo errores de consola, pedidos fallidos, fases que no existen o el render salió por software.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = k => process.argv.includes(`--${k}`);
const WEB = path.resolve(arg('web', path.join(ROOT, 'web'))), OUT = path.resolve(arg('out', path.join(ROOT, 'out', 'arte', 'shots')));
const TAG = arg('tag', 'A'), CLAY = has('clay'), MASK = has('mask'), PROP = arg('prop') ? path.resolve(arg('prop')) : null, ONLY = arg('only') ? arg('only').split(',').map(s => s.trim()).filter(Boolean) : null, GFX = !has('no-gfx');
const W = 1600, H = 900, QUERY = 'q=alta&auto=0&ui=0';

// Primeros planos que el visor no trae: se agregan a TARIMA.SHOTS solo en la página de captura (no cambian el visor).
// Mismo formato que cameras.js: `at` huesos cuyo punto medio es el blanco, `up` corrimiento vertical y `d` distancia, los dos
// por metro de estatura; `az` 0 = de frente, π/2 = costado izquierdo del atleta, π = de espaldas.
// axila-atras: el plan la apuntaba al punto medio de LeftArm y Spine2 a distancia 0,75 y el pliegue quedaba en un borde, con media
// espalda en cuadro. Apunta a la articulación del hombro izquierdo, 10 cm más abajo (up -.06 por metro de estatura), más cerca
// y algo más de costado: el pliegue entre el brazo y el dorsal queda en el centro, con la axila a la izquierda.
const EXTRA_SHOTS = [
  { key: 'axila-atras', label: 'Axila trasera', at: ['LeftArm'], up: -.06, d: .6, az: 2.45, el: .08, fov: 24 },
  { key: 'espalda', label: 'Espalda', at: ['Spine2', 'Neck'], up: 0, d: 1.25, az: 3.14, el: .06, fov: 24 },
];
// La lista fija. `fase`: expresión que se busca en los nombres de fase de poses.json (TARIMA.phaseIndex); `shot`: clave de
// primer plano; `cam`: índice de cámara fija. `arcilla`: el plano también se captura con --clay (P01 a P12).
const FINAL = '^Envión · Final';
const PLANOS = [
  { id: 'P01', who: 'ventura', lift: 'c', jerk: 'split', fase: FINAL, shot: 'arriba', arcilla: true, nota: 'Brazos y barra arriba. Plano principal de la comparación.' },
  { id: 'P02', who: 'ventura', lift: 'c', jerk: 'split', fase: FINAL, shot: 'torso', arcilla: true, nota: 'Torso con los brazos arriba.' },
  { id: 'P03', who: 'ventura', lift: 'c', jerk: 'split', fase: FINAL, shot: 'axila-atras', arcilla: true, nota: 'Pliegue de la axila trasera.' },
  { id: 'P04', who: 'ventura', lift: 'c', jerk: 'split', fase: FINAL, shot: 'espalda', arcilla: true, nota: 'Dorsales, trapecio y tríceps.' },
  { id: 'P05', who: 'ventura', lift: 's', fase: '^Recepción', shot: 'arriba', arcilla: true, nota: 'Hombro en rango máximo en sentadilla.' },
  { id: 'P06', who: 'ventura', lift: 's', fase: '^Recuperación', cam: 2, arcilla: true, nota: 'Figura entera con agarre ancho arriba.' },
  { id: 'P07', who: 'ventura', lift: 'c', jerk: 'split', fase: FINAL, cam: 0, arcilla: true, nota: 'Tamaño de plano de juego.' },
  { id: 'P08', who: 'ventura', lift: 'c', jerk: 'split', fase: '^Recuperación', shot: 'rack', arcilla: true, nota: 'Rack de pie: deltoides y bíceps con el codo cerrado.' },
  { id: 'P09', who: 'ventura', lift: 'c', jerk: 'split', fase: '^Recuperación', shot: 'rack-lado', arcilla: true, nota: 'Rack de pie, de costado.' },
  { id: 'P10', who: 'ventura', lift: 'c', jerk: 'split', fase: '^Tirón de brazos', shot: 'arriba', arcilla: true, nota: 'Codos altos: trapecio y deltoides.' },
  { id: 'P11', who: 'ventura', lift: 'c', jerk: 'split', fase: '^Parado', shot: 'torso', arcilla: true, nota: 'Brazos colgando, referencia de reposo.' },
  { id: 'P12', who: 'ventura', lift: 'c', jerk: 'split', fase: '^Recepción', shot: 'piernas', arcilla: true, nota: 'Rodillera en sentadilla profunda.' },
  { id: 'P13', who: 'ventura', lift: 'c', jerk: 'split', fase: FINAL, shot: 'cara', arcilla: false, nota: 'Borde de barba y ojos.' },
  { id: 'P14', who: 'ventura', lift: 'c', jerk: 'split', fase: '^Primer tirón', shot: 'manos', arcilla: false, nota: 'Halo blanco alrededor de barra y manos.' },
  { id: 'P15', who: 'brenner', lift: 'c', jerk: 'split', fase: FINAL, shot: 'arriba', arcilla: false, nota: 'Control del otro biotipo.' },
  { id: 'P16', who: 'brenner', lift: 's', fase: '^Recuperación', cam: 2, arcilla: false, nota: 'Control del otro biotipo, figura entera.' },
];
// Factor de intensidad en arcilla de las luces que quedan detrás del atleta (z < 0 en lighting.js), por signo de x.
const LUCES_ARCILLA = { izquierda: 1, derecha: .25, centro: .15 };
const LIFT = { c: 'dos tiempos', s: 'arranque' }, JERK = { split: 'con tijera', power: 'power jerk', squat: 'squat jerk' };
const CONDICIONES = { ancho: W, alto: H, dpr: 1, query: `?${QUERY}&who=<atleta>`, kilos: 'por defecto', reloj: 'manual (TARIMA.manualClock)', camara: 'sin deriva (prefers-reduced-motion y rig.reduceMotion)', azar: 'Math.random sembrado en la página de captura', grafica: 'visible salvo --no-gfx' };

/** shots.json: la lista de planos (se reescribe siempre con la del script) y una entrada por corrida, que se conserva. */
function writeIndex(run) {
  const file = path.join(OUT, 'shots.json'); let old = {};
  try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primera corrida */ }
  const corridas = old.corridas || {};
  if (run) { const prev = corridas[run.tag]; corridas[run.tag] = { ...run, glb: { ...(ONLY && prev ? prev.glb : {}), ...run.glb }, planos: { ...(ONLY && prev ? prev.planos : {}), ...run.planos } }; }
  const doc = { condiciones: CONDICIONES, primeros_planos_nuevos: EXTRA_SHOTS, planos: PLANOS.map(p => ({ ...p, levantamiento: LIFT[p.lift] + (p.lift === 'c' ? ' ' + JERK[p.jerk] : ''), camara: p.shot ? `primer plano «${p.shot}»` : `cámara fija ${p.cam}` })), corridas };
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n'); return file;
}

const unknown = (ONLY || []).filter(id => !PLANOS.some(p => p.id === id));
if (unknown.length) { console.error(`planos que no existen: ${unknown.join(', ')}`); process.exit(1); }
if (MASK && (CLAY || PROP)) { console.error('--mask no va con --clay ni con --prop (la malla estática no trae pesos de piel)'); process.exit(1); }
const SUF = CLAY ? '_clay' : MASK ? '_mask' : '';
const todo = PLANOS.filter(p => (!ONLY || ONLY.includes(p.id)) && (!(CLAY || MASK) || p.arcilla));
if (has('list')) { for (const p of PLANOS) console.log(`${p.id} · ${p.who} · ${LIFT[p.lift]}${p.lift === 'c' ? ' ' + JERK[p.jerk] : ''} · ${p.fase} · ${p.shot ? `primer plano «${p.shot}»` : `cámara ${p.cam}`}${p.arcilla ? ' · arcilla' : ''} · ${p.nota}`); console.log(writeIndex(null)); process.exit(0); }
if (!fs.existsSync(path.join(WEB, 'index.html'))) { console.error(`no hay visor en ${WEB}`); process.exit(1); }
if (PROP && !fs.existsSync(PROP)) { console.error(`no existe ${PROP}`); process.exit(1); }

const { chromium } = await import('playwright-core');
const { launchOptions, isSoftware } = await import('./browser.mjs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const PROP_URL = '/__prop/' + (PROP ? path.basename(PROP) : '');
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = PROP && rel === PROP_URL ? PROP : path.join(WEB, rel.endsWith('/') ? rel + 'index.html' : rel);
  if ((f !== PROP && !f.startsWith(WEB)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });

const problems = [], warnings = [];
const browser = await chromium.launch(launchOptions());
// reducedMotion: el visor nace con cámara sin deriva, haces de luz quietos, sin destellos de tribuna y grano fijo.
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
// Azar sembrado (mulberry32): el moteado de los discos se pinta con Math.random al cargar y cambiaba de corrida a corrida.
await ctx.addInitScript(() => { let s = 0x7a41a; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
const page = await ctx.newPage();
page.on('console', m => { const t = m.type(); if (t === 'error') problems.push(`console.error: ${m.text().slice(0, 400)}`); else if (t === 'warning') warnings.push(m.text().slice(0, 400)); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

const stem = id => `${TAG}${SUF}_${id}`;
const run = { tag: TAG + SUF, version: TAG, arcilla: CLAY, mascara: MASK, prop: PROP ? path.relative(ROOT, PROP) : null, web: path.relative(ROOT, WEB) || '.', fecha: new Date().toISOString(), planos: {} };
try { run.commit = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* sin git */ }
const t0 = Date.now();
try {
  await page.goto(`${base}?${QUERY}&who=${todo[0]?.who || 'ventura'}`, { waitUntil: 'load' });
  if (!await page.evaluate(() => window.TARIMA.ready)) throw new Error('el visor no terminó de iniciar');
  run.gpu = await page.evaluate(() => { const gl = TARIMA.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); });
  run.calidad = await page.evaluate(() => TARIMA.state.qName);
  console.log(`GPU: ${run.gpu} · calidad ${run.calidad} · ${run.tag} · ${todo.length} planos`);
  if (isSoftware(run.gpu)) problems.push(`render por software (${run.gpu}): las capturas no son comparables con las de GPU`);
  // Condiciones fijas. El visor ya nació con movimiento reducido; se repite acá por si la página lo ignora, y se deja el
  // tiempo de grano y de haces en cero.
  await page.evaluate(([extra, gfx]) => {
    const A = TARIMA; A.manualClock(true); A.rig.reduceMotion = true; A.post.reduceMotion = true; A.post.time = 0; A.arena.reduceMotion = true; A.arena.time = 0;
    for (const s of extra) if (!A.SHOTS.some(x => x.key === s.key)) A.SHOTS.push(s);
    if (!gfx) { const st = document.createElement('style'); st.textContent = '.gfx{display:none!important}'; document.head.appendChild(st); }
  }, [EXTRA_SHOTS, GFX]);
  if (CLAY) {
    run.luces_arcilla = await page.evaluate(k => {
      const out = [];
      TARIMA.scene.traverse(o => { if (!o.isSpotLight || o.position.z >= 0) return; const f = o.position.x < -.5 ? k.izquierda : o.position.x > .5 ? k.derecha : k.centro, i0 = o.intensity; o.intensity = i0 * f; out.push({ pos: o.position.toArray(), antes: i0, ahora: +o.intensity.toFixed(3) }); });
      return out;
    }, LUCES_ARCILLA);
    console.log(`luces de arcilla: ${run.luces_arcilla.map(l => `${l.antes} -> ${l.ahora}`).join(' · ')}`);
    if (run.luces_arcilla.length !== 3) problems.push(`arcilla: esperaba 3 luces traseras y hay ${run.luces_arcilla.length}`);
  }

  for (const p of todo) {
    const info = await page.evaluate(async ([p, clay, prop, mask]) => {
      const A = TARIMA, S = A.state;
      if (S.who !== p.who) await A.setWho(p.who);
      const a = S.athletes[p.who];
      // Aspecto de la corrida, una vez por atleta: arcilla o malla estática en lugar de la del build.
      if (!a.__arte && mask) {
        // Máscara por segmento: cada vértice toma el color de la clase de huesos que más pesa en su piel (0 brazo, 1 antebrazo
        // y mano, 2 resto) y la malla se dibuja con color plano, sin luces.
        a.__arte = true;
        // El color lleva alfa: 1 en todo para la máscara de lo que se ve; 1 solo en el brazo, o en todo menos antebrazo y mano,
        // para las otras dos, que se dibujan con corte por alfa y así dejan ver el segmento entero aunque otro lo tape.
        const THREE = await import('three'), mats = new Map(), GET = ['getX', 'getY', 'getZ', 'getW'];
        const cls = n => (/(Left|Right)Arm$/.test(n) ? 0 : /(Left|Right)(ForeArm|Hand)/.test(n) ? 1 : 2);
        const par = src => { const side = src?.side ?? THREE.FrontSide; if (!mats.has(side)) { const m = new THREE.MeshBasicMaterial({ name: 'Mascara', vertexColors: true, toneMapped: false, fog: false, side }), c = m.clone(); c.alphaTest = .5; mats.set(side, [m, c]); } return mats.get(side); };
        a.__mask = [];
        for (const o of a.meshes) {
          const n = [].concat(o.material)[0]?.name; if (n === 'Hair' || n === 'Lashes') { o.visible = false; continue; }
          const g = o.geometry;
          if (!g.userData.arteMask) {
            const N = g.attributes.position.count, cols = [0, 1, 2].map(() => new Float32Array(N * 4)), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton?.bones;
            for (let i = 0; i < N; i++) {
              const w = [0, 0, 0];
              if (si && sw && bones) for (let k = 0; k < 4; k++) { const wk = sw[GET[k]](i); if (wk > 0) w[cls(bones[si[GET[k]](i)]?.name || '')] += wk; } else w[2] = 1;
              const c = w[0] >= w[1] && w[0] >= w[2] ? 0 : (w[1] >= w[2] ? 1 : 2);
              for (const col of cols) col[i * 4 + c] = 1;
              cols[0][i * 4 + 3] = 1; cols[1][i * 4 + 3] = c === 0 ? 1 : 0; cols[2][i * 4 + 3] = c === 1 ? 0 : 1;
            }
            g.userData.arteMask = cols.map(col => new THREE.BufferAttribute(col, 4)); g.setAttribute('color', g.userData.arteMask[0]);
          }
          const ms = [].concat(o.material).map(par), arr = Array.isArray(o.material), pick = k => (arr ? ms.map(m => m[k]) : ms[0][k]);
          a.__mask.push({ o, plano: pick(0), corte: pick(1) }); o.material = pick(0);
        }
        a.root.traverse(o => { if (o.isMesh && o.material?.name === 'HairDepth') o.visible = false; });
      }
      if (!a.__arte && (clay || prop)) {
        a.__arte = true;
        const THREE = await import('three'), clays = new Map();
        const gris = src => { const side = src?.side ?? THREE.FrontSide; if (!clays.has(side)) clays.set(side, new THREE.MeshStandardMaterial({ name: 'Arcilla', color: 0x303030, roughness: .8, metalness: 0, side })); return clays.get(side); };
        const swap = o => { o.material = Array.isArray(o.material) ? o.material.map(gris) : gris(o.material); };
        if (prop && p.who === 'ventura') {
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), g = await new GLTFLoader().loadAsync(prop);
          g.scene.name = 'arte_prop'; g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; if (clay) swap(o); } });
          a.root.add(g.scene); for (const o of a.meshes) o.visible = false;
        } else if (clay) for (const o of a.meshes) { const n = [].concat(o.material)[0]?.name; if (n === 'Hair' || n === 'Lashes') o.visible = false; else swap(o); }
        // la pasada de profundidad del pelo se oculta por nombre de material (si quedara, la profundidad de campo recortaría la
        // silueta de un pelo que ya no se dibuja)
        a.root.traverse(o => { if (o.isMesh && o.material?.name === 'HairDepth') o.visible = false; });
      }
      A.setLift(p.lift); if (p.lift === 'c') A.setJerk(p.jerk);
      const i = A.phaseIndex(p.fase); if (i < 0) return { error: `no hay fase ${p.fase} en ${p.who} (${S.tl.phases.map(x => x.n).join(', ')})` };
      A.seekPhase(i);
      if (p.shot) { if (!A.SHOTS.some(s => s.key === p.shot)) return { error: `no hay primer plano «${p.shot}»` }; A.shot(p.shot); } else A.cam(p.cam);
      // márgenes de la gráfica medidos ahora y encuadre llevado a destino sin travelling: no depende de cuántos cuadros pasaron
      A.measureInsets(); A.rig.settle(); A.step(0); A.step(0); S.shadowDirty = 4;
      await new Promise(r => { let n = 0; const f = () => (++n < 12 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
      const c = A.rig.camera, r3 = v => [v.x, v.y, v.z].map(x => +x.toFixed(4)), sh = A.SHOTS.find(s => s.key === p.shot);
      let extra = {};
      if (mask) {
        // El atleta solo, directo al lienzo y sin la cadena de post (que desenfoca, tiñe y agrega grano); se copia en la misma
        // tarea, antes de que el visor vuelva a dibujar. Los huesos se proyectan con la misma cámara: [x, y, distancia en m].
        const THREE = await import('three'), r = A.renderer, col = new THREE.Color(), v = new THREE.Vector3(), huesos = {};
        const cc = r.getClearColor(col).getHex(), ca = r.getClearAlpha(), ac = r.autoClear, su = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate;
        r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.autoClear = true; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
        const toma = k => {
          for (const m of a.__mask) { m.o.geometry.setAttribute('color', m.o.geometry.userData.arteMask[k]); m.o.material = k ? m.corte : m.plano; }
          r.render(a.root, c);
          const cv = document.createElement('canvas'); cv.width = r.domElement.width; cv.height = r.domElement.height; cv.getContext('2d').drawImage(r.domElement, 0, 0); return cv;
        };
        const cv = toma(0), cvB = toma(1), cvT = toma(2); toma(0);
        r.setClearColor(cc, ca); r.autoClear = ac; r.shadowMap.autoUpdate = su; r.shadowMap.needsUpdate = nu;
        c.updateMatrixWorld();
        for (const n of ['Hips', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) {
          if (!a._byName.has(n)) continue;
          a.boneWorld(n, v); const d = v.distanceTo(c.position); v.project(c); huesos[n] = [+((v.x * .5 + .5) * cv.width).toFixed(2), +((.5 - v.y * .5) * cv.height).toFixed(2), +d.toFixed(4)];
        }
        extra = { png: cv.toDataURL('image/png'), png_b: cvB.toDataURL('image/png'), png_t: cvT.toDataURL('image/png'), mascara: { ancho: cv.width, alto: cv.height, clases: { rojo: 'brazo', verde: 'antebrazo y mano', azul: 'resto' }, archivos: { visible: '_mask_', brazos_solos: '_maskb_', sin_antebrazos: '_maskt_' } }, huesos_px: huesos };
      }
      return { ...extra, fase: S.tl.phases[i].n, indice: i, t: +S.t.toFixed(4), kg: A.barbell.totalKg, camara: p.shot ? { ...sh } : { indice: p.cam, az: +A.rig.az.toFixed(4), el: +A.rig.el.toFixed(4) },
        pos: r3(c.position), blanco: r3(A.rig.target), fov: +c.fov.toFixed(3), pxPorMetro: Math.round(S.pxPerM), lod: a.lod };
    }, [p, CLAY, PROP ? PROP_URL : null, MASK]);
    if (info.error) { problems.push(`${p.id}: ${info.error}`); continue; }
    await page.waitForTimeout(250);
    const file = path.join(OUT, stem(p.id) + '.png');
    if (MASK) {
      const b64 = u => Buffer.from(u.split(',')[1], 'base64');
      fs.writeFileSync(file, b64(info.png)); fs.writeFileSync(path.join(OUT, `${TAG}_maskb_${p.id}.png`), b64(info.png_b)); fs.writeFileSync(path.join(OUT, `${TAG}_maskt_${p.id}.png`), b64(info.png_t));
      delete info.png; delete info.png_b; delete info.png_t;
    } else await page.screenshot({ path: file, timeout: 120000 });
    info.archivo = path.basename(file); info.sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    run.planos[p.id] = info;
    console.log(`${stem(p.id)} · ${p.who} · ${info.fase} · ${p.shot ? '«' + p.shot + '»' : 'cámara ' + p.cam} · fov ${info.fov} · ${info.pxPorMetro} px/m · lod ${info.lod}`);
  }
} catch (e) { problems.push(`shots: ${e.message}`); }
await browser.close(); server.close();
// De qué GLB salió cada captura (sha256 y fecha del archivo): tools/sheet.py lo pone en el encabezado de la columna.
const glbInfo = f => { try { return { archivo: path.relative(ROOT, f), sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'), fecha: fs.statSync(f).mtime.toISOString() }; } catch { return null; } };
run.glb = Object.fromEntries([...new Set(todo.map(p => p.who))].map(w => [w, glbInfo(path.join(WEB, 'models', w + '.glb'))]).filter(x => x[1]));
if (PROP && glbInfo(PROP)) run.glb.prop = glbInfo(PROP);
run.segundos = Math.round((Date.now() - t0) / 1000); run.problemas = problems; run.avisos = [...new Set(warnings)];
const index = writeIndex(run);
console.log(`${Object.keys(run.planos).length}/${todo.length} capturas en ${path.relative(process.cwd(), OUT) || '.'} · ${run.segundos} s · ${path.relative(process.cwd(), index)}`);
if (run.avisos.length) { console.log(`avisos de consola (${run.avisos.length}):`); run.avisos.forEach(w => console.log('  ' + w)); }
if (problems.length) { console.log(`PROBLEMAS (${problems.length}):`); problems.forEach(p => console.log('  ' + p)); }
process.exit(problems.length ? 1 : 0);
