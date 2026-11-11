// Entorno de competencia: tarima de 4x4 m, escenario con fondo vestido (pantalla LED, telón, torres de luz, mesa técnica,
// cargadores), truss con focos y haces, tribunas con público instanciado (o tribuna horneada sin DoF), fuentes puntuales
// que dan discos de bokeh, mesas de jueces, luces de arbitraje, temporizador y magnesiera. Todo procedural y ficticio.
import * as THREE from 'three';
import { rng, makeCanvas, canvasTexture, normalFromHeight, noiseCanvas, disposeObject } from './util.js';
import { EVENT } from './config.js';
import { BOKEH, BOKEH_LAYER } from './post.js';

const DISPLAY = "'Saira Condensed','Arial Narrow',sans-serif";
const STAGE_Y = -.1, FLOOR_Y = -1.0;
const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// ---------- tarima de madera ----------
function woodMaps(size, aniso) {
  const r = rng(11), planks = 20, pw = size / planks, boards = [];
  for (let i = 0; i < planks; i++) { let y = -r() * size * .5; while (y < size) { const len = size * (.35 + r() * .45); boards.push([i * pw, y, pw, len, r(), r()]); y += len; } }
  const color = makeCanvas(size, size, g => {
    g.fillStyle = '#b98f58'; g.fillRect(0, 0, size, size);
    for (const [x, y, w, len, a, b] of boards) {
      g.fillStyle = `hsl(${32 + a * 6},${30 + b * 12}%,${50 + a * 10 - b * 5}%)`; g.fillRect(x, y, w, len);
      // veta: trazos largos con leve ondulación
      for (let k = 0; k < 46; k++) {
        const gx = x + r() * w, amp = r() * 3, ph = r() * 7, dark = r() < .7;
        g.strokeStyle = dark ? `rgba(84,52,22,${.04 + r() * .11})` : `rgba(255,232,190,${.03 + r() * .06})`; g.lineWidth = .6 + r() * 1.6; g.beginPath();
        for (let yy = y; yy <= y + len; yy += 24) { const xx = gx + Math.sin(yy * .006 + ph) * amp; yy === y ? g.moveTo(xx, yy) : g.lineTo(xx, yy); } g.stroke();
      }
      if (a > .78) { const kx = x + w * (.25 + b * .5), ky = y + len * (.2 + a * .5), rg = g.createRadialGradient(kx, ky, 1, kx, ky, pw * .16); rg.addColorStop(0, 'rgba(60,34,14,.75)'); rg.addColorStop(1, 'rgba(60,34,14,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(kx, ky, pw * .1, pw * .2, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(38,22,8,.55)'; g.fillRect(x, y, w, 1.5); g.fillRect(x, y, 1.5, len);
    }
    // línea perimetral pintada de 10 cm
    const bw = size * .025; g.strokeStyle = 'rgba(20,48,120,.93)'; g.lineWidth = bw; g.strokeRect(bw / 2, bw / 2, size - bw, size - bw);
    g.strokeStyle = 'rgba(240,240,235,.5)'; g.lineWidth = 2; g.strokeRect(bw + 2, bw + 2, size - 2 * bw - 4, size - 2 * bw - 4);
    const P = (x, z) => [size * (x / 4 + .5), size * (z / 4 + .5)];
    // marcas de caucho donde caen los discos y polvo de magnesio donde pisa el atleta
    for (let k = 0; k < 90; k++) { const [cx, cy] = P((r() < .5 ? -1 : 1) * (.72 + r() * .34), .1 + (r() - .5) * .5); g.fillStyle = `rgba(18,16,14,${.03 + r() * .07})`; g.beginPath(); g.ellipse(cx, cy, 4 + r() * 16, 10 + r() * 60, (r() - .5) * .2, 0, 7); g.fill(); }
    for (let k = 0; k < 70; k++) { const [cx, cy] = P((r() - .5) * 1.1, .05 + (r() - .5) * .9), rad = 12 + r() * 70, rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad); rg.addColorStop(0, `rgba(255,255,250,${.03 + r() * .07})`); rg.addColorStop(1, 'rgba(255,255,250,0)'); g.fillStyle = rg; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
  });
  const hs = Math.min(size, 1024), k = hs / size;
  const height = makeCanvas(hs, hs, g => {
    g.fillStyle = '#888'; g.fillRect(0, 0, hs, hs);
    const rr = rng(5);
    for (let i = 0; i < 5200; i++) { const x = rr() * hs, y = rr() * hs, v = rr() < .5 ? 60 : 190; g.strokeStyle = `rgba(${v},${v},${v},${.08 + rr() * .14})`; g.lineWidth = .6 + rr(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - .5) * 3, y + 30 + rr() * 160); g.stroke(); }
    g.fillStyle = '#000'; for (const [x, y, w, len] of boards) { g.fillRect(x * k - 1, y * k, 2, len * k); g.fillRect(x * k, y * k - 1, w * k, 2); }
  });
  const rough = makeCanvas(512, 512, g => {
    g.drawImage(noiseCanvas(512, 6, 21, 4), 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, 512, 512); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgb(62,62,62)'; g.fillRect(0, 0, 512, 512);
  });
  return { map: canvasTexture(color, { aniso }), normalMap: normalFromHeight(height, 1.6, { wrap: false, aniso }), roughnessMap: canvasTexture(rough, { srgb: false, aniso: 4 }) };
}

// ---------- gráfica ficticia del torneo ----------
function drawLogo(g, x, y, s, col = '#fff') {   // pictograma de barra
  g.save(); g.translate(x, y); g.fillStyle = col; g.fillRect(-s, -s * .05, s * 2, s * .1);
  for (const sx of [-1, 1]) { g.fillRect(sx * s * .72 - s * .06, -s * .34, s * .12, s * .68); g.fillRect(sx * s * .9 - s * .05, -s * .24, s * .1, s * .48); }
  g.restore();
}
function ledWallCanvas(w, h) {
  return makeCanvas(w, h, g => {
    // gráfica con contraste: paneles claros y cálidos a los costados, centro oscuro para que el atleta se despegue
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2a3f8c'); gr.addColorStop(.3, '#26346c'); gr.addColorStop(.5, '#3a3f72'); gr.addColorStop(.7, '#55305a'); gr.addColorStop(1, '#8a3a26'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = -1; i < 9; i++) { const x = i * w / 8, warm = i >= 4; g.fillStyle = warm ? `rgba(255,${150 + (i & 1) * 40},70,${.13 + .07 * (i & 1)})` : `rgba(${90 + (i & 1) * 50},${170 + (i & 1) * 30},255,${.12 + .06 * (i & 1)})`; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * .05, 0); g.lineTo(x + w * .11, h / 2); g.lineTo(x + w * .05, h); g.lineTo(x, h); g.lineTo(x + w * .06, h / 2); g.closePath(); g.fill(); }
    const cg = g.createRadialGradient(w / 2, h * .6, h * .1, w / 2, h * .6, w * .26); cg.addColorStop(0, 'rgba(8,10,22,.32)'); cg.addColorStop(1, 'rgba(6,7,14,0)'); g.fillStyle = cg; g.fillRect(0, 0, w, h);
    // una marca grande a cada lado, lejos del eje donde está el atleta
    g.textBaseline = 'middle';
    for (const sx of [0, 1]) {
      const x = sx ? w * .975 : w * .025; g.textAlign = sx ? 'right' : 'left';
      g.fillStyle = sx ? 'rgba(20,10,8,.55)' : 'rgba(6,10,30,.55)'; g.fillRect(sx ? w * .71 : 0, h * .07, w * .29, h * .38);
      g.font = `800 ${h * .2}px ${DISPLAY}`; g.fillStyle = '#f6f3ea'; g.fillText(EVENT.title, x, h * .2);
      g.font = `700 ${h * .075}px ${DISPLAY}`; g.fillStyle = sx ? '#ffd23f' : '#6ff0e2'; g.fillText(sx ? `${EVENT.session.toUpperCase()} · ${EVENT.year}` : 'HALTEROFILIA', x, h * .37);
      drawLogo(g, sx ? w * .87 : w * .13, h * .68, h * .15, sx ? 'rgba(255,214,120,.85)' : 'rgba(150,235,255,.85)');
    }
    g.fillStyle = 'rgba(255,210,63,.9)'; g.fillRect(0, h * .925, w, h * .012); g.fillStyle = 'rgba(246,243,234,.75)'; g.fillRect(0, h * .95, w, h * .006);
    g.fillStyle = 'rgba(0,0,0,.24)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);   // rejilla de píxeles LED
  });
}
function bannerCanvas(w, h) {
  return makeCanvas(w, h, g => {
    g.fillStyle = '#161a2c'; g.fillRect(0, 0, w, h); g.textBaseline = 'middle'; g.textAlign = 'center';
    for (let i = 0; i < 4; i++) { const cx = w * (i + .5) / 4; drawLogo(g, cx - w * .085, h / 2, h * .26, '#35e6d6'); g.font = `800 ${h * .56}px ${DISPLAY}`; g.fillStyle = '#fff'; g.fillText(`${EVENT.title} ${EVENT.year}`, cx + w * .02, h * .54); }
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h * .06); g.fillRect(0, h * .94, w, h * .06);
  });
}
// Atlas de espectadores (4 variantes): R = sombreado, G = piel, B = pelo, A = recorte. El color de ropa, piel y pelo
// lo pone cada instancia en el shader, así la tribuna tiene variedad sin más texturas.
const CW = 96, CH = 128;
function crowdAtlas() {
  return makeCanvas(CW * 4, CH, g => {
    for (let v = 0; v < 4; v++) {
      const hw = [14, 12.5, 15, 13][v], sh = [38, 33, 42, 36][v], hy = [40, 46, 37, 44][v], cx = v * CW + CW / 2, up = v === 3;
      g.save(); g.beginPath(); g.rect(v * CW, 0, CW, CH); g.clip();
      const torso = () => { g.beginPath(); g.moveTo(cx - sh, CH + 8); g.bezierCurveTo(cx - sh, hy + hw + 18, cx - sh * .7, hy + hw + 7, cx - 8, hy + hw + 5); g.lineTo(cx + 8, hy + hw + 5); g.bezierCurveTo(cx + sh * .7, hy + hw + 7, cx + sh, hy + hw + 18, cx + sh, CH + 8); g.closePath(); };
      const head = () => { g.beginPath(); g.ellipse(cx, hy, hw, hw * 1.22, 0, 0, 7); g.rect(cx - 6, hy + hw - 2, 12, 12); };
      const arms = () => { g.beginPath(); for (const s of [-1, 1]) { g.moveTo(cx + s * sh * .8, hy + hw + 22); g.lineTo(cx + s * (sh * .8 + 3), hy - hw * .4); } };
      const hands = () => { g.beginPath(); for (const s of [-1, 1]) g.ellipse(cx + s * (sh * .8 + 3), hy - hw * .7, 5.5, 7, 0, 0, 7); };
      g.filter = 'blur(1.1px)';
      // sombreado: más luz arriba (la luz de sala cae desde el techo)
      const lg = g.createLinearGradient(0, hy - hw * 1.3, 0, CH); lg.addColorStop(0, 'rgb(255,0,0)'); lg.addColorStop(.35, 'rgb(205,0,0)'); lg.addColorStop(1, 'rgb(110,0,0)');
      g.fillStyle = lg; torso(); g.fill(); if (up) { g.strokeStyle = lg; g.lineWidth = 10; g.lineCap = 'round'; arms(); g.stroke(); hands(); g.fill(); }
      head(); g.fill();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgb(0,255,0)'; head(); g.fill(); if (up) { hands(); g.fill(); }
      g.save(); g.beginPath(); g.rect(v * CW, 0, CW, hy - hw * [.3, .1, .45, .2][v]); g.clip(); g.fillStyle = 'rgb(0,0,255)'; g.beginPath(); g.ellipse(cx, hy, hw + 1, hw * 1.22 + 1, 0, 0, 7); g.fill(); g.restore();
      g.restore();
    }
  });
}
const SKIN_TONES = ['#f0c8a4', '#e2ad82', '#c98c5a', '#a56a3f', '#7a4a2a', '#f5d3b3', '#d59c6c'];
const HAIR_TONES = ['#16110d', '#2a1a10', '#4a2f1a', '#8a6a3a', '#9a9a98', '#1c1c1e', '#c9a25a'];
const CLOTH_TONES = ['#1d2a4a', '#2b2d33', '#e9e6df', '#8f1f24', '#e2622b', '#18a58f', '#5a2a82', '#d8b23a', '#3d6ea8', '#6d7078', '#a84a6a', '#2f5d3c', '#c9c2b2', '#101216'];
/** Colores de un espectador (lineales), con la ropa ponderada hacia tonos apagados. */
function crowdColors(r, out) {
  const pick = a => a[Math.floor(r() * a.length)];
  out.cloth.set(r() < .45 ? pick(CLOTH_TONES.slice(0, 3).concat(CLOTH_TONES.slice(9))) : pick(CLOTH_TONES)).multiplyScalar(.75 + r() * .5);
  out.skin.set(pick(SKIN_TONES)); out.hair.set(pick(HAIR_TONES));
  return out;
}
function shellCanvas() {   // interior del pabellón: hormigón gris cálido, costillas de estructura, dos niveles de palcos y bocas de acceso iluminadas
  return makeCanvas(2048, 512, (g, w, h) => {
    const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, '#0d0e13'); lg.addColorStop(.4, '#1d1f29'); lg.addColorStop(.8, '#2a2b33'); lg.addColorStop(1, '#17181d'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = i * w / 40; g.fillStyle = 'rgba(190,195,215,.07)'; g.fillRect(x, 0, 5, h * .62); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 5, 0, 3, h * .62); }
    g.fillStyle = 'rgba(200,205,225,.09)'; g.fillRect(0, h * .18, w, 4); g.fillRect(0, h * .36, w, 5);
    const r = rng(41);
    for (const [y, hh, p] of [[.5, .05, .3], [.4, .035, .55]]) for (let i = 0; i < 80; i++) { if (r() < p) continue; const x = i * w / 80 + 4, lit = r(); g.fillStyle = lit > .55 ? `rgba(255,${200 + r() * 30},${140 + r() * 40},${.3 + r() * .3})` : 'rgba(150,180,255,.22)'; g.fillRect(x, h * y, w / 80 - 8, h * hh); }
    for (let i = 0; i < 16; i++) { const x = (i + .5) * w / 16, rg = g.createRadialGradient(x, h * .68, 2, x, h * .68, 46); rg.addColorStop(0, 'rgba(255,205,140,.75)'); rg.addColorStop(1, 'rgba(255,205,140,0)'); g.fillStyle = rg; g.fillRect(x - 46, h * .6, 92, h * .16); g.fillStyle = 'rgba(255,224,170,.8)'; g.fillRect(x - 14, h * .65, 28, h * .06); }
    g.fillStyle = 'rgba(210,215,235,.12)'; g.fillRect(0, h * .56, w, 3);
  });
}
function hazeCanvas() {
  return makeCanvas(64, 256, (g, w, h) => { const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.3, 'rgba(255,255,255,.9)'); lg.addColorStop(.62, 'rgba(255,255,255,.45)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(0, 0, w, h); });
}
function softDisc() {
  return makeCanvas(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 31); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
}
function drapeCanvas() {   // telón con pliegues verticales
  return makeCanvas(512, 64, (g, w, h) => { const r = rng(9); g.fillStyle = '#20222c'; g.fillRect(0, 0, w, h); for (let x = 0; x < w;) { const fw = 10 + r() * 22, lg = g.createLinearGradient(x, 0, x + fw, 0); lg.addColorStop(0, 'rgba(0,0,0,.55)'); lg.addColorStop(.5, 'rgba(120,125,150,.22)'); lg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = lg; g.fillRect(x, 0, fw, h); x += fw; } });
}

const CROWD_VS = /* glsl */`
attribute vec3 aCloth; attribute vec3 aSkin; attribute vec3 aHair; attribute float aVar;
varying vec2 vUv; varying vec3 vCloth; varying vec3 vSkin; varying vec3 vHair;
#include <fog_pars_vertex>
void main(){
  vUv = vec2( ( uv.x + aVar ) * 0.25, uv.y ); vCloth = aCloth; vSkin = aSkin; vHair = aHair;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const CROWD_FS = /* glsl */`
uniform sampler2D map; uniform float uGain;
varying vec2 vUv; varying vec3 vCloth; varying vec3 vSkin; varying vec3 vHair;
#include <fog_pars_fragment>
void main(){
  vec4 t = texture2D( map, vUv ); if ( t.a < 0.42 ) discard;
  vec3 col = mix( vCloth, vSkin, smoothstep( 0.3, 0.7, t.g ) ); col = mix( col, vHair, smoothstep( 0.3, 0.7, t.b ) );
  gl_FragColor = vec4( col * t.r * uGain, 1.0 );
  #include <fog_fragment>
}`;
// Fuentes puntuales (teléfonos, luces de escalón, carteles de salida, luminarias): cada una se dibuja como su propio
// disco de bokeh, con el mismo círculo de confusión que usa la profundidad de campo. En foco es un punto con halo; fuera
// de foco, un disco circular traslúcido. Con DoF se dibujan después del desenfoque (probando contra la profundidad de la
// escena por fragmento) para que el disco quede de borde limpio; sin DoF van en la escena con la prueba normal.
const BOKEH_VS = /* glsl */`
attribute vec3 aColor; attribute float aSize;
uniform float uFocus, uRange, uScale, uNearScale, uMaxBlur, uPx;
varying vec3 vCol; varying float vDisc; varying float vZ; varying float vD;
void main(){
  vec4 mv = modelViewMatrix * vec4( position, 1.0 ); float d = max( - mv.z, 0.01 );
  float coc = clamp( ( abs( d - uFocus ) - uRange ) * ( d < uFocus ? uNearScale : uScale ) / d, 0.0, 1.0 ) * uMaxBlur;
  float base = max( aSize * uPx / d, 1.6 ), size = max( base, 2.0 * coc );
  vCol = aColor * pow( base / size, 1.5 ); vDisc = smoothstep( 1.5, 5.0, coc );
  vD = d; gl_PointSize = size + 1.0; gl_Position = projectionMatrix * mv; vZ = gl_Position.z / gl_Position.w * 0.5 + 0.5;
}`;
const BOKEH_FS = /* glsl */`
#include <packing>
uniform sampler2D tDepth; uniform vec2 uRes; uniform float uUseDepth, uNear, uFar, uFocus, uRange;
varying vec3 vCol; varying float vDisc; varying float vZ; varying float vD;
void main(){
  if ( uUseDepth > 0.5 ) {
    // tapa lo que está en foco o más cerca (atleta, barra, tarima) y lo que queda claramente delante (pantalla, telón);
    // un espectador desenfocado una o dos filas delante de la luz no la recorta
    float sd = texture2D( tDepth, gl_FragCoord.xy / uRes ).x, lin = - perspectiveDepthToViewZ( sd, uNear, uFar );
    if ( sd < vZ - 2e-5 && ( lin < uFocus + uRange * 2.5 || lin < vD - 2.5 ) ) discard;
  }
  float r = length( gl_PointCoord * 2.0 - 1.0 );
  float glow = 1.0 - smoothstep( 0.0, 1.0, r ); glow *= glow;
  float disc = ( 1.0 - smoothstep( 0.84, 1.0, r ) ) * ( 0.4 + 0.28 * smoothstep( 0.5, 0.9, r ) );   // disco traslúcido, borde apenas más claro
  gl_FragColor = vec4( vCol * mix( glow, disc, vDisc ), 1.0 );
}`;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qq = new THREE.Quaternion(), _s = new THREE.Vector3(), _mm = new THREE.Matrix4();
function tubeMatrix(a, b, radius) { _b.subVectors(b, a); const len = _b.length(); _qq.setFromUnitVectors(_up, _b.normalize()); _a.addVectors(a, b).multiplyScalar(.5); return _mm.compose(_a, _qq, _s.set(radius, len, radius)).clone(); }

const BEAM_VS = /* glsl */`varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = /* glsl */`uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV; varying float vT;
void main(){ float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 2.2 ); float fall = pow( clamp( vT, 0.0, 1.0 ), 1.6 ); gl_FragColor = vec4( uColor * uStrength * edge * fall, 1.0 ); }`;

export class Arena {
  /**
   * Se construye una sola vez: nada de la geometría ni de las texturas depende de la calidad. Lo que sí depende
   * (densidad y tipo de público, haces, modo de los discos de bokeh) se cambia con setQuality() en milisegundos.
   * @param {{tex:number, aniso:number, reduceMotion:boolean}} opt
   */
  constructor({ tex = 2048, aniso, reduceMotion }) {
    this.group = new THREE.Group(); this.group.name = 'Arena';
    this.reduceMotion = reduceMotion; this.time = 0; this._bokeh = [];
    const add = (mesh, shadow = 'r') => { mesh.receiveShadow = shadow.includes('r'); mesh.castShadow = shadow.includes('c'); this.group.add(mesh); return mesh; };
    const glint = (x, y, z, color, power, size) => { const c = hdr(color, power); this._bokeh.push(x, y, z, c.r, c.g, c.b, size); };

    // tarima reglamentaria 4 x 4 m, 10 cm de alto
    const wood = woodMaps(tex, aniso);
    const top = new THREE.MeshStandardMaterial({ ...wood, color: new THREE.Color(.74, .74, .74), roughness: 1, metalness: 0, envMapIntensity: .5 }); top.normalScale.set(.7, .7);
    const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color('#12285f'), roughness: .5, envMapIntensity: .4 });
    add(new THREE.Mesh(new THREE.BoxGeometry(4, .1, 4), [edge, edge, top, edge, edge, edge]), 'rc').position.y = -.05;

    // escenario elevado y piso de la arena
    const carpetN = normalFromHeight(noiseCanvas(256, 64, 3, 2), 2.5, { aniso: 4 }); carpetN.repeat.set(26, 22);
    const carpet = new THREE.MeshStandardMaterial({ color: new THREE.Color('#262933'), roughness: .93, normalMap: carpetN, envMapIntensity: .3 });
    const skirt = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0c0d12'), roughness: .9 });
    const stage = add(new THREE.Mesh(new THREE.BoxGeometry(13, STAGE_Y - FLOOR_Y, 11), [skirt, skirt, carpet, skirt, skirt, skirt]), 'rc'); stage.position.set(0, (STAGE_Y + FLOOR_Y) / 2, 0);
    const floorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#17181d') });   // piso de sala: gris, nunca negro
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat)); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y;
    // canto iluminado del escenario (escalón)
    const lip = new THREE.MeshBasicMaterial({ color: hdr('#ffe2b8', .55) });
    for (const [w, x, z, ry] of [[13, 0, 5.5, 0], [13, 0, -5.5, 0], [11, 6.5, 0, Math.PI / 2], [11, -6.5, 0, Math.PI / 2]]) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, .025, .03), lip), ''); m.position.set(x, STAGE_Y - .012, z); m.rotation.y = ry; }

    // banda LED al frente y a los lados del escenario
    const banner = canvasTexture(bannerCanvas(2048, 128), { aniso }); banner.wrapS = THREE.RepeatWrapping;
    const bannerMat = new THREE.MeshBasicMaterial({ map: banner, color: hdr('#ffffff', .6) });
    const bandH = .62;
    const bf = add(new THREE.Mesh(new THREE.PlaneGeometry(13, bandH), bannerMat), ''); bf.position.set(0, STAGE_Y - .08 - bandH / 2, 5.52);
    for (const s of [-1, 1]) { const b = add(new THREE.Mesh(new THREE.PlaneGeometry(11, bandH), bannerMat), ''); b.position.set(s * 6.52, STAGE_Y - .08 - bandH / 2, 0); b.rotation.y = s * Math.PI / 2; }

    // fondo de escenario: pantalla LED con marco, telón con pliegues, torres de luz a los costados y línea de piso
    const wallTex = canvasTexture(ledWallCanvas(2048, 720), { aniso });
    const wall = add(new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), new THREE.MeshBasicMaterial({ map: wallTex, color: hdr('#ffffff', .36) })), ''); wall.position.set(0, STAGE_Y + .35 + 1.75, -5.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#15161b'), roughness: .5, metalness: .4 });
    const frame = add(new THREE.Mesh(new THREE.BoxGeometry(10.3, 3.8, .25), frameMat), 'r'); frame.position.set(0, wall.position.y, -5.34);
    const drapeTex = canvasTexture(drapeCanvas(), { aniso: 4 }); drapeTex.wrapS = THREE.RepeatWrapping; drapeTex.repeat.set(3, 1);
    const drape = add(new THREE.Mesh(new THREE.PlaneGeometry(17, 6.4), new THREE.MeshBasicMaterial({ map: drapeTex, color: hdr('#ffffff', .5) })), ''); drape.position.set(0, 2.3, -5.9);
    const wallBase = add(new THREE.Mesh(new THREE.BoxGeometry(10.3, .35, .5), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3d48'), roughness: .7 })), 'rc'); wallBase.position.set(0, STAGE_Y + .175, -5.25);
    for (let i = 0; i < 8; i++) { const x = -4.55 + i * 1.3; if (Math.abs(x) > 2) glint(x, STAGE_Y + .42, -4.92, '#ffcf9a', .9, .05); }

    // tablero y reloj a los costados de la pantalla (texturas dinámicas)
    this.boardCanvas = makeCanvas(512, 640); this.boardTex = canvasTexture(this.boardCanvas, { aniso: 4 });
    const board = add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.1), new THREE.MeshBasicMaterial({ map: this.boardTex, color: hdr('#ffffff', .8) })), ''); board.position.set(-6.25, 1.45, -4.9); board.rotation.y = .32;
    const bfm = add(new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.25, .12), frameMat), 'r'); bfm.position.set(-6.27, 1.45, -4.97); bfm.rotation.y = .32;
    this.clockCanvas = makeCanvas(512, 400); this.clockTex = canvasTexture(this.clockCanvas, { aniso: 4 });
    const clock = add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.33), new THREE.MeshBasicMaterial({ map: this.clockTex, color: hdr('#ffffff', .9) })), ''); clock.position.set(6.25, 1.75, -4.9); clock.rotation.y = -.32;
    const cf = add(new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.48, .12), frameMat), 'r'); cf.position.set(6.27, 1.75, -4.97); cf.rotation.y = -.32;
    for (const x of [-6.27, 6.27]) add(new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 1.2, 10), frameMat), 'rc').position.set(x, STAGE_Y + .45, -4.99);
    this.board = {}; this.decision = null; this.clock = 60; this._drawBoard(); this._drawClock();

    // truss perimetral con torres, focos y haces
    const tubes = [];
    const truss = (a, b, h = .2) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length(); dir.normalize();
      const side = Math.abs(dir.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(dir, _up).normalize(), upv = new THREE.Vector3().crossVectors(side, dir).normalize();
      const corner = (i, t) => A.clone().addScaledVector(dir, t).addScaledVector(side, (i & 1 ? h : -h)).addScaledVector(upv, (i & 2 ? h : -h));
      for (let i = 0; i < 4; i++) tubes.push(tubeMatrix(corner(i, 0), corner(i, len), h * .13));
      const n = Math.round(len / (h * 2.5));
      for (let k = 0; k < n; k++) for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0]]) tubes.push(tubeMatrix(corner(k % 2 ? i : j, k * len / n), corner(k % 2 ? j : i, (k + 1) * len / n), h * .055));
    };
    const TY = 7.1, TB = 6.3;
    truss([-7.4, TY, 6.8], [7.4, TY, 6.8]); truss([-7.4, TB, -4.6], [7.4, TB, -4.6]); truss([-7.4, TY, 6.8], [-7.4, TB, -4.6]); truss([7.4, TY, 6.8], [7.4, TB, -4.6]);
    for (const [x, z, y] of [[-7.4, 6.8, TY], [7.4, 6.8, TY], [-7.4, -4.6, TB], [7.4, -4.6, TB]]) truss([x, FLOOR_Y, z], [x, y, z]);
    for (const s of [-1, 1]) truss([s * 5.75, STAGE_Y, -4.55], [s * 5.75, 3.7, -4.55], .12);    // torres de luz junto a la pantalla

    const canGeo = new THREE.CylinderGeometry(.13, .16, .36, 14), lensGeo = new THREE.CircleGeometry(.12, 16), canMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#16171b'), roughness: .5, metalness: .5 });
    const beamGeo = new THREE.CylinderGeometry(.09, 1, 1, 28, 1, true); beamGeo.translate(0, -.5, 0);   // vértice en el foco, se abre hacia abajo
    this.beams = []; this.beamMeshes = [];
    // Piezas repetidas (focos, lentes, mesas, oficiales): una malla instanciada por geometría en vez de un draw call por pieza.
    const batches = [];
    const batch = (geo, mat) => { const b = { geo, mat, m: [], c: [], add(obj, color) { obj.updateWorldMatrix(true, false); this.m.push(obj.matrixWorld.clone()); this.c.push(color ? color.clone() : null); } }; batches.push(b); return b; };
    const white = new THREE.Color(1, 1, 1);
    const cans = batch(canGeo, canMat), lenses = batch(lensGeo, new THREE.MeshBasicMaterial({ color: white }));
    const fixture = (pos, target, color, power, beam, scale = 1) => {
      const g = new THREE.Group(); g.position.set(...pos); g.lookAt(new THREE.Vector3(...target)); g.rotateX(-Math.PI / 2); g.scale.setScalar(scale);   // -Y local apunta al objetivo
      const can = new THREE.Object3D(); can.position.y = .1; g.add(can); cans.add(can);
      const lens = new THREE.Object3D(); lens.rotation.x = Math.PI / 2; lens.position.y = -.085; g.add(lens); lenses.add(lens, hdr(color, power)); g.remove(can, lens);
      if (beam) {
        const len = new THREE.Vector3(...pos).distanceTo(new THREE.Vector3(...target)) * 1.02;
        const mat = new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: beam } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
        const cone = new THREE.Mesh(beamGeo, mat); cone.scale.set(len * .11, len, len * .11); cone.position.y = -.1; cone.renderOrder = 5; g.add(cone); this.beams.push({ mat, base: beam, phase: this.beams.length * 1.7 }); this.beamMeshes.push(cone);
      }
      this.group.add(g);
    };
    const cols = ['#8fdcff', '#ffb08a', '#f2ecff', '#8fdcff', '#ff8a9c', '#f2ecff', '#ffd9a0', '#ff8a9c'];
    cols.forEach((c, i) => { const x = -6.3 + i * 1.8; fixture([x, TB - .3, -4.6], [x * .25, .4, -.2], c, 14, .05); });
    for (let i = 0; i < 6; i++) { const x = -5 + i * 2; fixture([x, TY - .3, 6.8], [x * .2, 1, 0], '#ffe6c4', 18, 0); }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) fixture([s * 7.4, TY - .35 - i * .05, 3.6 - i * 2.8], [0, 1, 0], i === 1 ? '#fff0d8' : (s < 0 ? '#8fdcff' : '#ffb08a'), 12, i === 1 ? 0 : .035);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) fixture([s * 5.75, 1.5 + i * .95, -4.38], [s * 1.2, 1.2, 0], i === 1 ? '#ffd9a0' : '#f4f0ff', i === 1 ? 7 : 4.5, 0, .62);

    // luces de arbitraje físicas sobre la pantalla
    const lampBox = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, .46, .16), frameMat), 'r'); lampBox.position.set(0, wall.position.y + 2.18, -5.1);
    this.lamps = [-1, 0, 1].map(i => { const m = new THREE.Mesh(new THREE.CircleGeometry(.15, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#15171c') })); m.position.set(i * .46, lampBox.position.y, -5.015); this.group.add(m); return m; });

    // mesas con oficiales sentados (árbitros al frente, jurado al costado, mesa técnica sobre el escenario) y cargadores de pie
    const cloth = new THREE.MeshStandardMaterial({ color: white, roughness: .8 }), matte = new THREE.MeshStandardMaterial({ color: white, roughness: .6 });
    const suits = ['#252b40', '#3a3d46', '#1f3a5a', '#4a2f36'].map(c => new THREE.Color(c)), polo = new THREE.Color('#34467a'), dark = new THREE.Color('#14151a'), skin = new THREE.Color('#b9835f'), deskCol = new THREE.Color('#1c2236');
    const torsoGeo = new THREE.CapsuleGeometry(.19, .34, 4, 10), headGeo = new THREE.SphereGeometry(.105, 14, 10), deskGeo = new THREE.BoxGeometry(1.1, .74, .55), legGeo = new THREE.CapsuleGeometry(.085, .7, 4, 8), armGeo = new THREE.CapsuleGeometry(.055, .5, 4, 8);
    const desks = batch(deskGeo, matte), torsos = batch(torsoGeo, cloth), heads = batch(headGeo, matte), legs = batch(legGeo, cloth), arms = batch(armGeo, cloth);
    const part = (g, b, color, px, py, pz, sx = 1, sy = 1, sz = 1, rz = 0) => { const o = new THREE.Object3D(); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); o.rotation.z = rz; g.add(o); b.add(o, color); g.remove(o); };
    let nSeat = 0;
    const seat = (x, z, ry, y0 = FLOOR_Y, lamp = true) => {
      const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = ry;
      part(g, desks, deskCol, 0, .37, 0); part(g, torsos, suits[nSeat++ % suits.length], 0, .82, -.5, 1.15, 1, .75); part(g, heads, skin, 0, 1.27, -.48);
      if (!lamp) return; g.updateMatrixWorld(); const p = new THREE.Vector3(.3, .8, .29).applyMatrix4(g.matrixWorld); glint(p.x, p.y, p.z, '#ffd9a0', 1.1, .035);   // lamparita de mesa: punto chico y cálido
    };
    const loader = (x, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, STAGE_Y, z); g.rotation.y = ry;
      for (const s of [-1, 1]) { part(g, legs, dark, s * .1, .44, 0); part(g, arms, polo, s * .25, 1.12, 0, 1, 1, 1, s * .12); }
      part(g, torsos, polo, 0, 1.18, 0, 1.05, 1.05, .7); part(g, heads, skin, 0, 1.66, 0);
    };
    seat(0, 6.9, Math.PI); seat(-3.6, 6.7, Math.PI - .25); seat(3.6, 6.7, Math.PI + .25);
    for (let i = 0; i < 5; i++) seat(-8.3, -2.4 + i * 1.25, Math.PI / 2, FLOOR_Y, false);   // jurado lateral sin lamparita: en la cámara lateral caía como una fila de discos a la altura de las rodillas del atleta
    seat(5.0, -4.3, -.86, STAGE_Y); seat(5.75, -3.3, -1.05, STAGE_Y);      // mesa técnica al fondo, fuera del eje de las cámaras del costado
    loader(-5.9, 4.9, 2.2); loader(-5.5, 4.2, 2.0);      // cargadores esperando en la esquina delantera, fuera del eje de las cámaras

    // magnesiera a un costado del escenario
    const chalk = new THREE.Group(); chalk.position.set(-3.15, STAGE_Y, -1.9);
    const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa0a8'), metalness: 1, roughness: .32 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .82, 12), steel); post.position.y = .41; chalk.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .025, 28), steel); foot.position.y = .012; chalk.add(foot);
    const bowlPts = [[.02, 0], [.14, .02], [.2, .08], [.225, .16], [.232, .165], [.208, .085], [.15, .035], [.02, .02]].map(p => new THREE.Vector2(p[0], p[1]));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c2e66'), roughness: .35, metalness: .3, side: THREE.DoubleSide })); bowl.position.y = .82; chalk.add(bowl);
    const chalkN = normalFromHeight(noiseCanvas(128, 10, 9, 3), 5, { aniso: 2 });
    const pile = new THREE.Mesh(new THREE.SphereGeometry(.2, 24, 10, 0, Math.PI * 2, 0, Math.PI * .32), new THREE.MeshStandardMaterial({ color: new THREE.Color('#f1f0ea'), roughness: 1, normalMap: chalkN })); pile.scale.y = .55; pile.position.y = .82 - .02; chalk.add(pile);
    chalk.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); this.group.add(chalk);

    // (quedan fuera del frustum de sombra de la clave, ajustado al atleta: reciben sombra pero no la proyectan)
    for (const b of batches) {
      if (!b.m.length) continue;
      const im = new THREE.InstancedMesh(b.geo, b.mat, b.m.length); b.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, b.c[i] || white); });
      im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.receiveShadow = b.mat.isMeshStandardMaterial === true; this.group.add(im);
    }
    const tubeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshStandardMaterial({ color: new THREE.Color('#8f949c'), metalness: .85, roughness: .42, envMapIntensity: .8 }), tubes.length);
    tubes.forEach((m, i) => tubeMesh.setMatrixAt(i, m)); tubeMesh.frustumCulled = false; this.group.add(tubeMesh);

    // interior del pabellón, techo y bruma de sala (velos aditivos entre el escenario y las tribunas: dispersión)
    const shellTex = canvasTexture(shellCanvas(), { aniso: 2 }); shellTex.wrapS = THREE.RepeatWrapping;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 26, 48, 1, true), new THREE.MeshBasicMaterial({ map: shellTex, side: THREE.BackSide, color: hdr('#ffffff', .33) })); shell.position.y = 8; this.group.add(shell);
    const roof = new THREE.Mesh(new THREE.CircleGeometry(42, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0d0e13') })); roof.rotation.x = Math.PI / 2; roof.position.y = 21; this.group.add(roof);
    this.hazeTex = canvasTexture(hazeCanvas(), { aniso: 1 });
    const hazeMat = new THREE.MeshBasicMaterial({ map: this.hazeTex, color: hdr('#b9ad9c', .05), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (const [x, z, ry, wdt] of [[-10.4, 0, Math.PI / 2, 34], [10.4, 0, Math.PI / 2, 34], [0, -8.4, 0, 44], [0, 10.9, 0, 44]]) {
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(wdt, 13), hazeMat); hz.position.set(x, 4.6, z); hz.rotation.y = ry; hz.renderOrder = 4; this.group.add(hz);
    }
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, .22, 64, 1, true), new THREE.MeshBasicMaterial({ color: hdr('#ffc98a', .9), side: THREE.BackSide })); ribbon.position.y = 9.2; this.group.add(ribbon);
    // luminarias de techo y pasarelas, por encima de las tribunas
    const r = rng(77), pal = ['#ffffff', '#ffd9a0', '#ffe9c9', '#bcd0ff', '#ffb070'];
    for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, d = 30 + r() * 10; glint(Math.cos(a) * d, 9.5 + r() * 9, Math.sin(a) * d, pal[i % pal.length], .3 + r() * 1.1, .1 + r() * .12); }

    this.discTex = canvasTexture(softDisc(), { aniso: 1 });
    this._buildCrowd(banner, glint);
    this._buildBokeh();
  }

  _buildCrowd(banner, glint) {
    const r = rng(2026), seats = [], steps = [], rails = [], o = new THREE.Object3D(), c = new THREE.Color();
    // tribuna: origen del primer escalón, dirección hacia atrás, ancho, filas
    const stands = this.stands = [
      { o: [-11.2, -.55, 0], back: [-1, 0], w: 24, rows: 16 }, { o: [11.2, -.55, 0], back: [1, 0], w: 24, rows: 16 },
      { o: [0, .1, -9.2], back: [0, -1], w: 42, rows: 20 }, { o: [0, -.6, 11.8], back: [0, 1], w: 42, rows: 16 },
    ];
    const rise = this._rise = .44, depth = this._depth = .84, pitch = this._pitch = .5, AISLE = 6.4;
    stands.forEach((st, si) => {
      const bx = st.back[0], bz = st.back[1], sx = -bz, sz = bx, ry = Math.atan2(-bx, -bz);
      for (let row = 0; row < st.rows; row++) {
        const y = st.o[1] + row * rise, cx = st.o[0] + bx * row * depth, cz = st.o[2] + bz * row * depth, count = Math.floor(st.w / pitch);
        steps.push({ x: cx + bx * depth * .5, y: y - rise / 2, z: cz + bz * depth * .5, ry, w: st.w + .6 });
        for (let k = 0; k < count; k++) {
          const t0 = (k - count / 2 + .5) * pitch, am = Math.abs(((t0 + AISLE / 2) % AISLE + AISLE) % AISLE - AISLE / 2);
          if (am < .5) { if (am < .26 && row % 3 === 2 && r() < .5) glint(cx + sx * t0 - bx * .1, y + .05, cz + sz * t0 - bz * .1, '#ffb45e', .3 + r() * .5, .035); continue; }   // pasillo con luz de escalón
          if (r() > .96) continue;                                                                  // butaca vacía
          const t = t0 + (r() - .5) * .12;
          seats.push({ x: cx + sx * t, y: y + .08 + r() * .14, z: cz + sz * t, ry, s: .88 + r() * .3, row: row / st.rows, bx, bz, si, ri: row, k, rnd: r(), col: crowdColors(r, { cloth: new THREE.Color(), skin: new THREE.Color(), hair: new THREE.Color() }), v: r() < .09 ? 3 : Math.floor(r() * 3) });
        }
      }
      // baranda al frente de la tribuna y carteles de salida arriba
      rails.push({ x: st.o[0] - bx * .55, y: st.o[1] + .62, z: st.o[2] - bz * .55, ry, sx: st.w + .6, sy: .05 });
      for (let k = -Math.floor(st.w / 4); k <= Math.floor(st.w / 4); k++) rails.push({ x: st.o[0] - bx * .55 + sx * k * 2, y: st.o[1] + .2, z: st.o[2] - bz * .55 + sz * k * 2, ry, sx: .05, sy: .9 });
      for (let t = -st.w / 2 + AISLE / 2; t < st.w / 2; t += AISLE) glint(st.o[0] + bx * (st.rows * depth - .2) + sx * t, st.o[1] + st.rows * rise + 1.3, st.o[2] + bz * (st.rows * depth - .2) + sz * t, '#59ff9a', 2.6, .16);
    });
    for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[seats[i], seats[j]] = [seats[j], seats[i]]; }   // orden al azar: bajar la densidad es recortar la cuenta
    // luz propia de tribuna: cae desde el techo, algo cálida; las filas altas reciben menos rebote del escenario
    for (const s of seats) { const L = (.6 + s.rnd * .45) * (1.12 - s.row * .38); s.col.cloth.multiplyScalar(L); s.col.skin.multiplyScalar(L * 1.05); s.col.hair.multiplyScalar(L); }
    this.seats = seats;
    const geo = new THREE.PlaneGeometry(.66, .88); geo.translate(0, .44, 0);
    const n = seats.length, aC = new Float32Array(n * 3), aS = new Float32Array(n * 3), aH = new Float32Array(n * 3), aV = new Float32Array(n);
    this.crowdTex = canvasTexture(crowdAtlas(), { srgb: false, aniso: 1, mip: false });      // sin mipmaps: el recorte alfa no se come las siluetas lejanas
    const mat = new THREE.ShaderMaterial({ vertexShader: CROWD_VS, fragmentShader: CROWD_FS, fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uGain: { value: .1 } }]) }); mat.uniforms.map.value = this.crowdTex;
    const mesh = this.crowd = new THREE.InstancedMesh(geo, mat, n);
    seats.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z); o.rotation.set(0, s.ry + (r() - .5) * .3, 0); o.scale.set(s.s, s.s * (.92 + r() * .2), s.s); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      s.col.cloth.toArray(aC, i * 3); s.col.skin.toArray(aS, i * 3); s.col.hair.toArray(aH, i * 3); aV[i] = s.v;
      // teléfonos en alto: fuentes chicas y brillantes, de color y brillo variados
      if (s.rnd < .015) glint(s.x - s.bx * .22, s.y + .5 * s.s, s.z - s.bz * .22, ['#dfe9ff', '#bfe0ff', '#fff1d6', '#ffffff'][i & 3], 1.2 + r() * r() * 7, .045);
    });
    geo.setAttribute('aCloth', new THREE.InstancedBufferAttribute(aC, 3)); geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(aS, 3)); geo.setAttribute('aHair', new THREE.InstancedBufferAttribute(aH, 3)); geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(aV, 1));
    mesh.frustumCulled = false; this.group.add(mesh);
    // estructura de las gradas: escalones y barandas iluminados por la luz de sala
    const box = new THREE.BoxGeometry(1, 1, 1);
    const stepMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff') }), steps.length);
    steps.forEach((s, i) => { o.position.set(s.x, s.y, s.z); o.rotation.set(0, s.ry, 0); o.scale.set(s.w, rise, depth); o.updateMatrix(); stepMesh.setMatrixAt(i, o.matrix); stepMesh.setColorAt(i, c.set(i % 2 ? '#1e1f27' : '#191a21')); });
    stepMesh.instanceColor.needsUpdate = true; stepMesh.frustumCulled = false; this.group.add(stepMesh);
    const railMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color('#3c3f49') }), rails.length);
    rails.forEach((s, i) => { o.position.set(s.x, s.y + (s.sy > .5 ? 0 : .45), s.z); o.rotation.set(0, s.ry, 0); o.scale.set(s.sx, s.sy, .05); o.updateMatrix(); railMesh.setMatrixAt(i, o.matrix); });
    railMesh.frustumCulled = false; this.group.add(railMesh);
    // cinta LED en el frente de cada tribuna (da estructura al fondo desenfocado)
    const fasciaTex = banner.clone(); fasciaTex.repeat.set(3, 1); fasciaTex.needsUpdate = true;
    const fasciaMat = new THREE.MeshBasicMaterial({ map: fasciaTex, color: hdr('#ffffff', .25) });
    for (const st of stands) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(st.w, .5), fasciaMat); f.position.set(st.o[0] - st.back[0] * .62, st.o[1] - .12, st.o[2] - st.back[1] * .62); f.rotation.y = Math.atan2(-st.back[0], -st.back[1]); this.group.add(f);
    }
    // flashes de cámaras: salen de la mano de un espectador, no del aire
    this.flashes = []; const fm = new THREE.MeshBasicMaterial({ map: this.discTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flashMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fm, 10); this.flashMesh.frustumCulled = false; this.flashMesh.renderOrder = 6;
    o.position.set(0, -50, 0); o.rotation.set(0, 0, 0); o.scale.setScalar(.01); o.updateMatrix();
    for (let i = 0; i < 10; i++) { this.flashes.push({ t: 1, p: new THREE.Vector3(0, -50, 0) }); this.flashMesh.setColorAt(i, c.setScalar(0)); this.flashMesh.setMatrixAt(i, o.matrix); }
    this.group.add(this.flashMesh); this._rf = rng(5150);
  }

  /**
   * Tribuna horneada para calidades sin profundidad de campo: una textura por tribuna, dibujada a baja resolución (cada
   * espectador son unos pocos píxeles) y ampliada con filtro lineal, que ya llega desenfocada. Cuatro planos en vez de
   * miles de siluetas nítidas.
   */
  _buildImpostors() {
    const PX = 7, RH = 11, g3 = this.impostors = new THREE.Group(), css = c => `rgb(${[c.r, c.g, c.b].map(v => Math.round(Math.min(1, Math.max(0, v)) ** (1 / 2.2) * 255)).join(',')})`;
    this.stands.forEach((st, si) => {
      const count = Math.floor(st.w / this._pitch), W = count * PX, H = st.rows * RH + 8, list = this.seats.filter(s => s.si === si).sort((a, b) => b.ri - a.ri);
      const raw = makeCanvas(W, H, g => {
        g.fillStyle = '#4a4b55'; g.fillRect(0, 0, W, H);
        for (let row = 0; row < st.rows; row++) { g.fillStyle = row % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.12)'; g.fillRect(0, H - (row + 1) * RH, W, RH); }
        for (const s of list) {
          const x = (s.k + .5) * PX, y = H - s.ri * RH;
          g.fillStyle = css(s.col.cloth); g.beginPath(); g.ellipse(x, y - 3.5, 3.1, 4.6, 0, 0, 7); g.fill();
          g.fillStyle = css(s.col.skin); g.beginPath(); g.arc(x, y - 8.6, 1.9, 0, 7); g.fill();
          g.fillStyle = css(s.col.hair); g.fillRect(x - 1.9, y - 10.8, 3.8, 1.5);
        }
      });
      const cv = makeCanvas(W, H, g => { g.filter = 'blur(1.4px)'; g.drawImage(raw, 0, 0); g.filter = 'none'; g.globalAlpha = .35; g.drawImage(raw, 0, 0); });
      const tex = canvasTexture(cv, { aniso: 4 });
      const bx = st.back[0], bz = st.back[1], L = Math.hypot(this._rise, this._depth), len = st.rows * L + 8 / RH * L;
      const X = new THREE.Vector3(-bz, 0, bx), Y = new THREE.Vector3(bx * this._depth, this._rise, bz * this._depth).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(st.w, len), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, color: hdr('#ffffff', .08) }));
      m.matrixAutoUpdate = false; m.matrix.makeBasis(X, Y, Z).setPosition(new THREE.Vector3(st.o[0], st.o[1] + .3, st.o[2]).addScaledVector(Y, len / 2 - .3)); m.frustumCulled = false; g3.add(m);
    });
    this.group.add(g3);
  }

  _buildBokeh() {
    const b = this._bokeh, n = b.length / 7, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set(b.slice(i * 7, i * 7 + 3), i * 3); col.set(b.slice(i * 7 + 3, i * 7 + 6), i * 3); size[i] = b[i * 7 + 6]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.bokehMat = new THREE.ShaderMaterial({ vertexShader: BOKEH_VS, fragmentShader: BOKEH_FS, uniforms: BOKEH, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false });
    this.bokeh = new THREE.Points(g, this.bokehMat); this.bokeh.frustumCulled = false; this.bokeh.renderOrder = 7; this.bokehCount = n; this.group.add(this.bokeh);
  }

  /** Ajusta lo que depende de la calidad sin reconstruir nada pesado. */
  setQuality(q) {
    const dof = !!q.dof;
    this.crowd.visible = dof; this.crowd.count = Math.max(1, Math.floor(this.seats.length * q.crowd));
    if (!dof && !this.impostors) this._buildImpostors();
    if (this.impostors) this.impostors.visible = !dof;
    for (const m of this.beamMeshes) m.visible = !!q.beams;
    // con DoF los discos se componen después del desenfoque (capa 1, prueba de profundidad en el shader)
    this.bokeh.layers.set(dof ? BOKEH_LAYER : 0); this.bokehMat.depthTest = !dof; this.bokehMat.needsUpdate = true;
  }

  _drawBoard() {
    const cv = this.boardCanvas, g = cv.getContext('2d'), w = cv.width, h = cv.height, b = this.board;
    g.fillStyle = '#0b0d16'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c2a5c'; g.fillRect(0, 0, w, 96);
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `800 58px ${DISPLAY}`; g.fillText(EVENT.title, w / 2, 50);
    g.textAlign = 'left'; g.font = `700 44px ${DISPLAY}`; g.fillStyle = '#35e6d6'; g.fillText(b.country || '', 34, 160);
    g.fillStyle = '#fff'; g.font = `800 64px ${DISPLAY}`; g.fillText((b.name || '').toUpperCase().split(' ').pop(), 34, 228);
    g.font = `500 34px ${DISPLAY}`; g.fillStyle = '#c3c9dc'; g.fillText(`${b.lift || ''} · INTENTO ${b.attempt || 1}`.toUpperCase(), 34, 296);
    g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.font = `800 230px ${DISPLAY}`; g.fillText(b.kg ? String(b.kg) : '', w / 2, 452); g.font = `700 54px ${DISPLAY}`; g.fillText('KG', w / 2, 590);
    this.boardTex.needsUpdate = true;
  }
  _drawClock() {
    const cv = this.clockCanvas, g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.fillStyle = '#0b0d16'; g.fillRect(0, 0, w, h); g.textBaseline = 'middle'; g.textAlign = 'center';
    const s = Math.max(0, Math.ceil(this.clock)); g.fillStyle = s <= 30 ? '#ffd23f' : '#fff'; g.font = `800 210px ${DISPLAY}`; g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, w / 2, 150);
    for (let i = 0; i < 3; i++) { const d = this.decision ? this.decision[i] : null; g.fillStyle = d === null ? '#262a3a' : (d ? '#f5f5f0' : '#e2231a'); g.beginPath(); g.arc(w / 2 + (i - 1) * 120, 318, 44, 0, 7); g.fill(); }
    this.clockTex.needsUpdate = true; this._clockShown = s;
  }
  /** Datos del tablero del escenario. */
  setBoard(b) { this.board = b; this._drawBoard(); }
  /** Decisión de los tres árbitros: null apaga; [true,true,true] tres blancas. */
  setDecision(d) {
    this.decision = d;
    this.lamps.forEach((l, i) => l.material.color.copy(d ? (d[i] ? hdr('#f6f4ea', 7) : hdr('#ff2618', 7)) : new THREE.Color('#15171c')));
    this._drawClock();
  }
  setClock(seconds) { this.clock = seconds; if (Math.max(0, Math.ceil(seconds)) !== this._clockShown) this._drawClock(); }

  update(dt, camera) {
    this.time += dt;
    if (this.reduceMotion) return;
    for (const b of this.beams) b.mat.uniforms.uStrength.value = b.base * (.85 + .15 * Math.sin(this.time * .6 + b.phase));
    // flashes ocasionales en las tribunas
    const c = this._c || (this._c = new THREE.Color()), o = this._o || (this._o = new THREE.Object3D());
    if (this._rf() < dt * 2.2 && this.seats.length) { const f = this.flashes.find(x => x.t >= 1); if (f) { const s = this.seats[Math.floor(this._rf() * this.seats.length)]; f.p.set(s.x - s.bx * .25, s.y + .5 * s.s, s.z - s.bz * .25); f.t = 0; } }
    this.flashes.forEach((f, i) => {
      if (f.t < 1) f.t += dt / .11;
      const k = f.t < 1 ? Math.pow(1 - f.t, 2) : 0;
      o.position.copy(f.p); o.quaternion.copy(camera.quaternion); o.scale.setScalar(.1 + k * .32); o.updateMatrix();
      this.flashMesh.setMatrixAt(i, o.matrix); this.flashMesh.setColorAt(i, c.setRGB(k * 40, k * 42, k * 48));
    });
    this.flashMesh.instanceMatrix.needsUpdate = true; this.flashMesh.instanceColor.needsUpdate = true;
  }

  dispose() { this.group.removeFromParent(); this.bokehMat.uniforms = {}; disposeObject(this.group); this.boardTex.dispose(); this.clockTex.dispose(); this.discTex.dispose(); }
}
