// Ambiente del estadio, solo en el juego (Gráficos fase 1: LIF-36, LIF-25). Todo generado por código, sin imágenes nuevas:
// - desgaste y magnesio pintados sobre la madera de la tarima, y piso de goma en baldosas alrededor (texturas de lienzo 2D);
// - pantalla LED del fondo como textura viva: marca, pesista, kilos e intento, y las tres luces cuando deciden los árbitros;
// - cinta LED del escenario que corre;
// - halo en las tres luces de arbitraje (se ven desde la mesa del jurado aunque la calidad no tenga brillo de post);
// - polvo de magnesio en el aire: partículas instanciadas que se mueven enteras en el sombreador de vértices (cero trabajo
//   por partícula en JavaScript) y solo brillan dentro de los conos de las luces; un soplo de polvo cuando la barra golpea;
// - conos de luz visibles en los focos (los haces de la arena con más fuerza y vetas de bruma), en las calidades con post;
// - público con vida: las siluetas instanciadas respiran y saltan con una ovación; más flashes cuando un levantamiento vale.
// Qué entra en cada calidad lo dice `Q.amb` (perf.js, AMBIENTE). Nada de esto decide nada del juego.
import * as THREE from 'three';
import { rng, makeCanvas, canvasTexture, normalFromHeight, noiseCanvas } from '../util.js';
import { EVENT } from '../config.js';
import { BOKEH, BOKEH_LAYER } from '../post.js';

const DISPLAY = "'Saira Condensed','Arial Narrow',sans-serif";
/** Partículas del soplo de polvo (las primeras del búfer: están en todas las calidades). */
const N_SOPLO = 48;
/** Tope de partículas de polvo (calidad más alta). */
export const POLVO_MAX = 3000;

// ---------- texturas ----------
/** Desgaste sobre la madera que ya dibujó la arena (mismo lienzo, antes de que suba a la placa). `size`: lado en px; 4 m de lado. */
function desgastar(cv) {
  const g = cv.getContext('2d'), size = cv.width, r = rng(404), P = (x, z) => [size * (x / 4 + .5), size * (z / 4 + .5)], m = size / 4;
  // mugre y decoloración de baja frecuencia (ruido de valor en varias octavas, multiplicado)
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = .34; g.drawImage(noiseCanvas(256, 3, 91, 4), 0, 0, size, size); g.restore();
  g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .3; g.drawImage(noiseCanvas(256, 12, 17, 3), 0, 0, size, size); g.restore();
  // zona gastada donde se paran los pesistas: barniz comido, madera más clara y pareja
  { const [cx, cy] = P(0, .12), rg = g.createRadialGradient(cx, cy, m * .1, cx, cy, m * .95); rg.addColorStop(0, 'rgba(226,205,170,.3)'); rg.addColorStop(1, 'rgba(226,205,170,0)'); g.fillStyle = rg; g.save(); g.translate(cx, cy); g.scale(1.25, .8); g.translate(-cx, -cy); g.fillRect(cx - m, cy - m, m * 2, m * 2); g.restore(); }
  // golpes de los discos: dos franjas oscuras y machucadas a cada lado, con rayones a lo largo de la veta
  for (const s of [-1, 1]) {
    const [cx, cy] = P(s * .93, .12), rg = g.createRadialGradient(cx, cy, 0, cx, cy, m * .34); rg.addColorStop(0, 'rgba(24,18,12,.34)'); rg.addColorStop(.6, 'rgba(24,18,12,.14)'); rg.addColorStop(1, 'rgba(24,18,12,0)');
    g.save(); g.translate(cx, cy); g.scale(.62, 1.5); g.translate(-cx, -cy); g.fillStyle = rg; g.fillRect(cx - m * .4, cy - m * .4, m * .8, m * .8); g.restore();
    for (let k = 0; k < 46; k++) { const [x, y] = P(s * (.93 + (r() - .5) * .3), .12 + (r() - .5) * .8); g.strokeStyle = `rgba(${r() < .5 ? '12,10,8' : '235,222,200'},${.06 + r() * .12})`; g.lineWidth = .5 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * m * .02, y + (r() - .5) * m * .16); g.stroke(); }
  }
  // magnesio: pisadas (dos suelas por pisada), nubes donde cae de las manos y salpicado fino debajo de la barra
  const suela = (x, y, ang, a) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = `rgba(250,249,244,${a})`; g.beginPath(); g.ellipse(0, -m * .045, m * .042, m * .075, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0, m * .085, m * .034, m * .04, 0, 0, 7); g.fill(); g.restore(); };
  for (let k = 0; k < 26; k++) { const z = -.2 + r() * 1.5, x = (r() - .5) * .5, [px, py] = P(x, z), ang = (r() - .5) * .5, a = .035 + r() * .07; g.filter = `blur(${(m * .006).toFixed(1)}px)`; suela(px - m * .09, py, ang - .12, a); suela(px + m * .09, py + (r() - .5) * m * .1, ang + .12, a); }
  g.filter = 'none';
  for (let k = 0; k < 40; k++) { const [cx, cy] = P((r() - .5) * 1.7, .12 + (r() - .5) * .36), rad = m * (.03 + r() * .12), rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad); rg.addColorStop(0, `rgba(252,251,246,${.05 + r() * .12})`); rg.addColorStop(1, 'rgba(252,251,246,0)'); g.fillStyle = rg; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
  g.fillStyle = 'rgba(255,255,250,.5)';
  for (let k = 0; k < 2600; k++) { const [x, y] = P((r() + r() - 1) * 1.2, .12 + (r() + r() + r() - 1.5) * .5); g.globalAlpha = .12 + r() * .4; g.fillRect(x, y, 1 + r() * 1.6, 1 + r() * 1.6); }
  g.globalAlpha = 1;
}
/** Baldosa de goma de 1 m (enlosable): negra con motas de color, junta en el borde. Devuelve los mapas para un material físico. */
function goma(aniso) {
  const S = 512, r = rng(808);
  const color = makeCanvas(S, S, g => {
    g.fillStyle = '#1d1e23'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .22; g.drawImage(noiseCanvas(S, 6, 33, 4), 0, 0); g.globalCompositeOperation = 'source-over';
    const motas = ['#5d6f8c', '#8a8f98', '#3f5f8f', '#b9bcc2', '#4a4d55'];
    for (let k = 0; k < 5200; k++) { g.globalAlpha = .25 + r() * .5; g.fillStyle = motas[Math.floor(r() * motas.length)]; const x = r() * S, y = r() * S, s = .8 + r() * 1.8; g.fillRect(x, y, s, s * (.6 + r() * .8)); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, S, 4); g.fillRect(0, 0, 4, S); g.fillStyle = 'rgba(160,165,180,.1)'; g.fillRect(0, 4, S, 2); g.fillRect(4, 0, 2, S);
  });
  const alto = makeCanvas(S, S, g => {
    g.drawImage(noiseCanvas(S, 64, 3, 2), 0, 0); const rr = rng(809);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 2600; k++) g.fillRect(rr() * S, rr() * S, 2, 2);
    g.fillStyle = '#000'; g.fillRect(0, 0, S, 5); g.fillRect(0, 0, 5, S);
  });
  const map = canvasTexture(color, { aniso, repeat: true }), normalMap = normalFromHeight(alto, 2.2, { aniso: 4 });
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(13, 11); }
  return { map, normalMap };
}

// ---------- sombreadores ----------
const POLVO_VS = /* glsl */`
attribute vec4 aSemilla; attribute float aTipo;
uniform float uTiempo; uniform float uTam; uniform float uMov; uniform vec3 uCaja0; uniform vec3 uCajaT; uniform vec4 uGolpe;
uniform vec3 uLuzPos[ 4 ]; uniform vec3 uLuzDir[ 4 ]; uniform vec3 uLuzCol[ 4 ]; uniform vec2 uLuzCono[ 4 ];
varying vec3 vCol; varying vec2 vUv; varying float vZ;
void main(){
  vec3 s = aSemilla.xyz; float f = aSemilla.w; float t = uTiempo * uMov;
  vec3 p; float peso; float tam = uTam * ( 0.55 + fract( f * 13.7 ) );
  if ( aTipo > 0.5 ) {
    // soplo: sale de donde golpearon los discos, se abre y se apaga
    float edad = uTiempo - uGolpe.z; float vida = 0.9 + s.y * 0.9; float u = clamp( edad / vida, 0.0, 1.0 );
    float lado = s.x < 0.5 ? -1.0 : 1.0;
    vec3 dir = normalize( vec3( ( fract( s.x * 2.0 ) - 0.5 ) * 1.2, 0.2 + s.y * 0.9, ( s.z - 0.5 ) * 2.0 ) );
    p = vec3( lado * 0.95, 0.03, uGolpe.y ) + dir * ( 1.0 - exp( - 3.0 * u ) ) * ( 0.2 + 0.5 * f ) * uGolpe.w;
    p.y = max( 0.02, p.y - 0.12 * u * u );
    peso = ( 1.0 - u ) * ( 1.0 - u ) * step( 0.0, edad ) * step( edad, vida ) * uGolpe.w * 1.6;
    tam *= 1.0 + 3.0 * u;
  } else {
    // polvo en suspensión: sube muy despacio y se arremolina; al salir de la caja entra por el otro lado
    vec3 q = fract( s + vec3( sin( t * 0.11 + f * 6.283 ) * 0.03, t * ( 0.004 + 0.008 * f ), cos( t * 0.09 + f * 4.1 ) * 0.03 ) );
    p = uCaja0 + q * uCajaT;
    peso = smoothstep( 0.0, 0.1, q.y ) * smoothstep( 1.0, 0.8, q.y ) * ( 0.55 + 0.45 * sin( t * ( 1.5 + 3.0 * f ) + f * 40.0 ) );
  }
  vec3 luz = vec3( 0.006, 0.0065, 0.008 );
  for ( int i = 0; i < 4; i ++ ) {
    float c = dot( normalize( uLuzPos[ i ] - p ), uLuzDir[ i ] );
    luz += uLuzCol[ i ] * smoothstep( uLuzCono[ i ].x, uLuzCono[ i ].y, c );
  }
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  vCol = luz * peso * smoothstep( 1.2, 3.2, - mv.z ); vUv = position.xy * 2.0;      // pegado a la cámara no se dibuja: sería un disco enorme
  mv.xy += position.xy * tam;
  gl_Position = projectionMatrix * mv; vZ = gl_Position.z / gl_Position.w * 0.5 + 0.5;
}`;
const POLVO_FS = /* glsl */`
uniform sampler2D tDepth; uniform vec2 uRes; uniform float uUseDepth;
varying vec3 vCol; varying vec2 vUv; varying float vZ;
void main(){
  float r = dot( vUv, vUv ); if ( r > 1.0 ) discard;
  // con profundidad de campo el polvo se dibuja después del desenfoque (si no, cada mota sería un disco): ahí la
  // profundidad de la escena se prueba a mano, como los discos de luz de la arena
  if ( uUseDepth > 0.5 ) { if ( texture2D( tDepth, gl_FragCoord.xy / uRes ).x < vZ - 2e-5 ) discard; }
  float a = 1.0 - r;
  gl_FragColor = vec4( vCol * a * a, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// Cono de luz: el mismo cono de la arena (uv.y = 1 en el foco), con el borde blando por el ángulo de la mirada y vetas de
// bruma que bajan despacio (ruido de valor en el sombreador, sin texturas).
const CONO_VS = /* glsl */`varying vec3 vN; varying vec3 vV; varying float vT; varying vec2 vA;
void main(){ vT = uv.y; vA = normalize( position.xz + vec2( 1e-4 ) ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`;
const CONO_FS = /* glsl */`uniform vec3 uColor; uniform float uStrength; uniform float uTiempo; varying vec3 vN; varying vec3 vV; varying float vT; varying vec2 vA;
float h21( vec2 p ){ p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float ruido( vec2 p ){ vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
void main(){
  float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 2.2 );
  float fall = pow( clamp( vT, 0.0, 1.0 ), 1.6 );
  vec2 q = vA * 2.4 + vec2( vT * 2.0 + uTiempo * 0.035, vT * 5.0 - uTiempo * 0.05 );
  float bruma = 0.62 + 0.55 * ruido( q ) * ruido( q * 2.3 + 7.1 );
  gl_FragColor = vec4( uColor * uStrength * edge * fall * bruma, 1.0 );
}`;

export class Ambiente {
  /**
   * Se arma una vez, apenas existe la arena y antes de que nada se dibuje (las texturas de la arena todavía no subieron a la
   * placa y sus materiales no se compilaron: acá se retocan).
   * @param {import('../arena.js').Arena} arena
   * @param {{aniso:number, tex:number, reduceMotion:boolean}} o  `tex`: 1024 en teléfonos y calidades livianas
   */
  constructor(arena, { aniso = 4, tex = 2048, reduceMotion = false } = {}) {
    this.arena = arena; this.reduce = reduceMotion; this.t = 0; this.animo = 0; this.nivel = null; this.cartel = {}; this.luces = null;
    this.group = new THREE.Group(); this.group.name = 'Ambiente';
    this.T = { value: 0 };
    // --- tarima y piso
    try { const cv = arena.madera?.map?.image; if (cv && cv.getContext && cv.width > 8) desgastar(cv); } catch (e) { console.warn('desgaste de la tarima:', e); }
    if (arena.alfombra) { const G = goma(aniso), m = arena.alfombra; m.normalMap?.dispose(); m.map = G.map; m.normalMap = G.normalMap; m.normalScale.set(.8, .8); m.color.setRGB(.9, .9, .94); m.roughness = .82; m.envMapIntensity = .35; m.needsUpdate = true; }
    // --- pantalla LED viva
    if (arena.pantalla) {
      const w = tex <= 1024 ? 1024 : 2048, h = Math.round(w * .3515);
      this.ledFondo = this._ledFondo(w, h); this.led = makeCanvas(w, h); this.ledTex = canvasTexture(this.led, { aniso, keep: true });
      const m = arena.pantalla.material; m.map?.dispose(); m.map = this.ledTex; m.needsUpdate = true; this._led();
    }
    // --- halos de las luces de arbitraje
    this.halos = (arena.lamps || []).map(l => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: arena.discTex, color: new THREE.Color(0, 0, 0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.position.copy(l.position); m.position.z += .02; m.renderOrder = 6; this.group.add(m); return m;      // siempre a la vista (apagado suma negro): su programa queda compilado desde la carga
    });
    // --- conos de luz: los haces de la arena, con otro sombreador
    for (const b of arena.beams || []) { const m = b.mat; m.vertexShader = CONO_VS; m.fragmentShader = CONO_FS; m.uniforms.uTiempo = this.T; b.base0 = b.base; m.needsUpdate = true; }
    // --- público con vida (siluetas instanciadas)
    this.publico = { uTiempo: this.T, uAnimo: { value: 0 }, uVida: { value: 0 } };
    const cm = arena.crowd?.material;
    if (cm && cm.vertexShader.includes('vec4( position, 1.0 )')) {
      cm.vertexShader = cm.vertexShader.replace('varying vec2 vUv;', 'uniform float uTiempo; uniform float uAnimo; uniform float uVida; varying vec2 vUv;')
        .replace('vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );', `float fase = dot( instanceMatrix[ 3 ].xyz, vec3( 1.7, 3.1, 2.3 ) );
  vec3 pp = position; pp.y *= 1.0 + uVida * ( 0.012 + 0.085 * uAnimo * fract( fase * 0.37 ) ) * sin( uTiempo * ( 1.6 + fract( fase ) * 2.4 + 7.0 * uAnimo ) + fase );
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( pp, 1.0 );`);
      Object.assign(cm.uniforms, this.publico); cm.needsUpdate = true;
    }
    // --- polvo de magnesio
    this._polvo();
  }
  _polvo() {
    const r = rng(1234), n = POLVO_MAX, sem = new Float32Array(n * 4), tipo = new Float32Array(n);
    for (let i = 0; i < n; i++) { sem[i * 4] = r(); sem[i * 4 + 1] = r(); sem[i * 4 + 2] = r(); sem[i * 4 + 3] = r(); tipo[i] = i < N_SOPLO ? 1 : 0; }
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position);
    g.setAttribute('aSemilla', new THREE.InstancedBufferAttribute(sem, 4)); g.setAttribute('aTipo', new THREE.InstancedBufferAttribute(tipo, 1)); g.instanceCount = 0;
    const v3 = k => Array.from({ length: k }, () => new THREE.Vector3()), v2 = k => Array.from({ length: k }, () => new THREE.Vector2(2, 3));
    this.uPolvo = {
      tDepth: BOKEH.tDepth, uRes: BOKEH.uRes, uUseDepth: BOKEH.uUseDepth, uTiempo: this.T, uTam: { value: .007 }, uMov: { value: this.reduce ? 0 : 1 }, uCaja0: { value: new THREE.Vector3(-2.7, .05, -2.3) }, uCajaT: { value: new THREE.Vector3(5.4, 3.7, 4.6) }, uGolpe: { value: new THREE.Vector4(0, 0, -100, 0) },
      uLuzPos: { value: v3(4) }, uLuzDir: { value: v3(4) }, uLuzCol: { value: v3(4) }, uLuzCono: { value: v2(4) },
    };
    const m = new THREE.ShaderMaterial({ name: 'polvo de magnesio', vertexShader: POLVO_VS, fragmentShader: POLVO_FS, uniforms: this.uPolvo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const p = this.polvo = new THREE.Mesh(g, m); p.frustumCulled = false; p.renderOrder = 8; p.visible = false; p.name = 'polvo'; this.group.add(p);
  }
  /** Las luces que iluminan el polvo (clave y los tres contraluces de lighting.js): posición, eje, color y cono. */
  setLuces(L) {
    const u = this.uPolvo, ls = [L.key, L.rimA, L.rimB, L.hair], k = [.13, .12, .12, .1];
    ls.forEach((l, i) => {
      u.uLuzPos.value[i].copy(l.position); u.uLuzDir.value[i].copy(l.position).sub(l.target.position).normalize();
      u.uLuzCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * k[i]); u.uLuzCono.value[i].set(Math.cos(l.angle * 1.25), Math.cos(l.angle * .55));
    });
  }
  /** Lo que entra con esta calidad: `A` = {polvo: partículas, conos: fuerza de los conos (0 = como estaban), publico: se mueve}. */
  setNivel(A = {}, dof = false) {
    this.nivel = A; this.polvo.layers.set(dof ? BOKEH_LAYER : 0);      // con profundidad de campo va con los discos de luz, después del desenfoque
    const n = Math.max(0, Math.min(POLVO_MAX, Math.round(A.polvo || 0)));
    this.polvo.geometry.instanceCount = n ? Math.max(n, N_SOPLO) : 0; this.polvo.visible = n > 0;
    for (const b of this.arena.beams || []) b.base = b.base0 * (A.conos || 1);
    this.publicoVivo = !!A.publico && !this.reduce;
  }
  // ---------- pantalla LED ----------
  _ledFondo(w, h) {
    return makeCanvas(w, h, g => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#22367e'); gr.addColorStop(.32, '#1d2a5c'); gr.addColorStop(.5, '#23264e'); gr.addColorStop(.68, '#43285a'); gr.addColorStop(1, '#84361f'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = -1; i < 11; i++) { const x = i * w / 10, calido = i >= 5, a = .1 + .07 * (i & 1); g.fillStyle = calido ? `rgba(255,${150 + (i & 1) * 40},70,${a})` : `rgba(${90 + (i & 1) * 50},${170 + (i & 1) * 30},255,${a})`; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * .04, 0); g.lineTo(x + w * .09, h / 2); g.lineTo(x + w * .04, h); g.lineTo(x, h); g.lineTo(x + w * .05, h / 2); g.closePath(); g.fill(); }
      // centro oscuro: el pesista se despega del fondo
      const cg = g.createRadialGradient(w / 2, h * .62, h * .1, w / 2, h * .62, w * .3); cg.addColorStop(0, 'rgba(6,8,18,.4)'); cg.addColorStop(1, 'rgba(6,7,14,0)'); g.fillStyle = cg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,210,63,.9)'; g.fillRect(0, h * .93, w, h * .012); g.fillStyle = 'rgba(246,243,234,.7)'; g.fillRect(0, h * .955, w, h * .006);
    });
  }
  /** Redibuja la pantalla: marca a la izquierda, el pesista y sus kilos a la derecha; con veredicto, las tres luces grandes. */
  _led() {
    const cv = this.led; if (!cv) return; const g = cv.getContext('2d'), w = cv.width, h = cv.height, b = this.cartel, d = this.luces;
    g.globalAlpha = 1; g.drawImage(this.ledFondo, 0, 0); g.textBaseline = 'middle';
    const caja = (x, cw, col) => { g.fillStyle = col; g.fillRect(x, h * .07, cw, h * .56); };
    // izquierda: la marca y el evento
    caja(0, w * .29, 'rgba(6,10,30,.6)'); g.textAlign = 'left';
    g.font = `800 ${h * .17}px ${DISPLAY}`; g.fillStyle = '#f6f3ea'; g.fillText(EVENT.marca, w * .022, h * .2, w * .25);
    g.font = `700 ${h * .07}px ${DISPLAY}`; g.fillStyle = '#6ff0e2'; g.fillText((b.lift || EVENT.session).toUpperCase(), w * .022, h * .35, w * .25);
    g.font = `600 ${h * .058}px ${DISPLAY}`; g.fillStyle = '#c3c9dc'; g.fillText((b.intento || '').toUpperCase(), w * .022, h * .45, w * .25);
    // derecha: quién levanta y cuánto
    caja(w * .71, w * .29, 'rgba(20,10,8,.6)'); g.textAlign = 'right';
    const nombre = (b.name || '').toUpperCase().split(' ').pop();
    g.font = `800 ${h * .15}px ${DISPLAY}`; g.fillStyle = '#f6f3ea'; g.fillText(nombre || EVENT.session.toUpperCase(), w * .978, h * .18, w * .25);
    if (b.kg) { g.font = `800 ${h * .3}px ${DISPLAY}`; g.fillStyle = '#ffd23f'; g.fillText(String(b.kg), w * .93, h * .43, w * .2); g.font = `700 ${h * .07}px ${DISPLAY}`; g.fillText('KG', w * .978, h * .49); }
    if (b.country) { g.font = `700 ${h * .06}px ${DISPLAY}`; g.fillStyle = '#35e6d6'; g.textAlign = 'left'; g.fillText(String(b.country).toUpperCase(), w * .725, h * .56, w * .1); }
    // veredicto: las tres luces en cada panel y un marco del color del resultado
    if (d && d.some(x => x !== null)) {
      const hechas = d.filter(x => x !== null), todas = hechas.length === 3, vale = d.filter(Boolean).length >= 2;
      for (const cx of [w * .145, w * .855]) for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * h * .2, y = h * .78, R = h * .075; g.beginPath(); g.arc(x, y, R * 1.25, 0, 7); g.fillStyle = 'rgba(4,5,10,.8)'; g.fill();
        g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = d[i] === null ? '#262a3a' : d[i] ? '#fbfaf2' : '#ff2a1c'; g.fill();
      }
      if (todas) { g.fillStyle = vale ? 'rgba(250,250,242,.9)' : 'rgba(255,42,28,.9)'; g.fillRect(0, 0, w, h * .035); g.fillRect(0, h * .965, w, h * .035); }
    }
    // rejilla de píxeles LED
    g.fillStyle = 'rgba(0,0,0,.22)'; const paso = w > 1024 ? 4 : 3; for (let x = 0; x < w; x += paso) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += paso) g.fillRect(0, y, w, 1);
    this.ledTex.needsUpdate = true;
  }
  /** Datos del tablero (los mismos que recibe arena.setBoard). */
  setCartel(b) { this.cartel = b || {}; this._led(); }
  /** Decisión de los árbitros (lo mismo que arena.setDecision): halos, pantalla y, si vale, ovación. */
  setDecision(d) {
    const antes = this.luces; this.luces = d ? d.slice(0, 3) : null;
    this.halos.forEach((m, i) => { const x = d ? d[i] : null; if (x === null || x === undefined) m.material.color.setRGB(0, 0, 0); else if (x) m.material.color.setRGB(1.5, 1.42, 1.2); else m.material.color.setRGB(2.4, .16, .1); });
    const igual = JSON.stringify(antes) === JSON.stringify(this.luces); if (!igual) this._led();
    if (d && d.every(x => x !== null && x !== undefined) && d.filter(Boolean).length >= 2 && !igual) this.animo = 1;
  }
  /** La barra golpeó la tarima en z (m) con fuerza 0 a 1: soplo de polvo de magnesio a cada lado. */
  golpe(z = 0, k = .6) { if (this.reduce || !this.polvo.visible) return; this.uPolvo.uGolpe.value.set(0, z, this.t, Math.min(1, Math.max(.25, k))); }
  update(dt) {
    this.t += dt; this.T.value = this.t;
    const A = this.arena;
    if (this.animo > 0) {
      this.animo = Math.max(0, this.animo - dt * .3);
      // flashes de la tribuna: muchos más mientras dura la ovación (los mismos diez destellos de la arena)
      if (!this.reduce && A.flashes && A.seats?.length && A._rf() < dt * 16 * this.animo) { const f = A.flashes.find(x => x.t >= 1); if (f) { const s = A.seats[Math.floor(A._rf() * A.seats.length)]; f.p.set(s.x - s.bx * .25, s.y + .5 * s.s, s.z - s.bz * .25); f.t = 0; } }
    }
    this.publico.uAnimo.value = this.animo; this.publico.uVida.value = this.publicoVivo ? 1 : 0;
    // la cinta LED del escenario corre despacio
    if (!this.reduce && A.cinta) A.cinta.offset.x = (this.t * .012) % 1;
  }
  dispose() { this.group.removeFromParent(); this.ledTex?.dispose(); this.polvo.geometry.dispose(); this.polvo.material.dispose(); for (const m of this.halos) { m.geometry.dispose(); m.material.dispose(); } }
}
