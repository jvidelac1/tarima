// Cadena de post-proceso tipo transmisión: escena HDR con MSAA + profundidad -> GTAO -> profundidad de campo (media resolución)
// (+ discos de bokeh de las fuentes puntuales) -> bloom -> tone mapping AgX + corrección de color + viñeta + aberración cromática + grano -> SMAA.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const _col = new THREE.Color();
/** Capa de los discos de bokeh que se componen después del desenfoque. */
export const BOKEH_LAYER = 1;
/** Uniforms compartidos con arena.js: el mismo círculo de confusión que usa la profundidad de campo. */
export const BOKEH = { uFocus: { value: 9 }, uRange: { value: 1.35 }, uScale: { value: 3.0 }, uNearScale: { value: .35 }, uMaxBlur: { value: 12 }, uPx: { value: 1500 }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uUseDepth: { value: 0 }, uNear: { value: .25 }, uFar: { value: 120 } };

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// Profundidad de campo en dos pasos. El costo no depende de la resolución ni del radio: el desenfoque se junta a media
// resolución con un número fijo de muestras (disco de Vogel), se alisa con una carpa de 3x3 y se compone a resolución
// completa según el círculo de confusión de cada píxel, así el borde foco/fondo no queda punteado.
const DOF_COMMON = /* glsl */`
#include <packing>
uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uFocus, uRange, uScale, uNearScale, uMaxBlur, uClamp;
varying vec2 vUv;
float dist( vec2 uv ){ return - perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar ); }
float coc( float d ){ float k = d < uFocus ? uNearScale : uScale; return clamp( ( abs( d - uFocus ) - uRange ) * k / d, 0.0, 1.0 ) * uMaxBlur; }
vec3 hdr( vec2 uv ){ vec3 c = texture2D( tDiffuse, uv ).rgb; return c * min( 1.0, uClamp / max( max( c.r, c.g ), max( c.b, 1e-4 ) ) ); }
`;
// Distancia más cercana en un entorno de ±1,5 px, a media resolución. En el borde de un objeto en foco el MSAA deja
// píxeles con color del objeto y profundidad del fondo; si el desenfoque los toma por fondo, el color del objeto (un
// disco rojo contra un telón oscuro) se derrama en llamas ruidosas. Con la distancia dilatada esas muestras se descartan.
const DOF_NEAR_FS = DOF_COMMON + /* glsl */`
void main(){
  vec4 o = uTexel.xyxy * vec4( 1.5, 1.5, -1.5, 0.0 );
  float d = min( min( dist( vUv ), dist( vUv + o.xy ) ), min( min( dist( vUv - o.xy ), dist( vUv + o.zy ) ), dist( vUv - o.zy ) ) );
  d = min( d, min( min( dist( vUv + o.xw ), dist( vUv - o.xw ) ), min( dist( vUv + o.wy ), dist( vUv - o.wy ) ) ) );
  gl_FragColor = vec4( d, 0.0, 0.0, 1.0 );
}`;
const DOF_BLUR_FS = DOF_COMMON + /* glsl */`
uniform sampler2D tNear;
const float GOLDEN = 2.39996323;
float ign( vec2 p ){ return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main(){
  float cd = texture2D( tNear, vUv ).x, cs = coc( cd );
  // un texel en foco casi no pesa: se rellena con el fondo desenfocado que lo rodea (dilatación), y el compuesto
  // decide por píxel si usa la imagen nítida. Así el contorno del atleta no arrastra ruido ni halo.
  float w0 = mix( 0.03, 1.0, smoothstep( 0.5, 2.0, cs ) );
  vec3 color = hdr( vUv ) * w0; float tot = w0;
  float rot = ign( gl_FragCoord.xy ) * 6.2831853;
  for ( int i = 0; i < DOF_SAMPLES; i ++ ) {
    float radius = sqrt( ( float( i ) + 0.5 ) / float( DOF_SAMPLES ) ) * uMaxBlur, ang = float( i ) * GOLDEN + rot;
    vec2 tc = vUv + vec2( cos( ang ), sin( ang ) ) * uTexel * radius;
    float sd = texture2D( tNear, tc ).x, ss = coc( sd );
    if ( sd > cd && cs > 1.0 ) ss = min( ss, cs * 2.0 );      // el fondo no sangra sobre lo que está apenas fuera de foco
    float m = smoothstep( radius - 1.0, radius + 1.0, ss );
    vec3 sc = hdr( tc );
    float w = ( 1.0 + 0.7 * dot( sc, vec3( 0.3333 ) ) ) * m;  // los brillos fuera de foco forman discos
    color += sc * w; tot += w;
  }
  gl_FragColor = vec4( color / tot, 1.0 );
}`;
const TENT_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec4 o = uTexel.xyxy * vec4( 1.0, 1.0, -1.0, 0.0 );
  vec3 c = texture2D( tDiffuse, vUv ).rgb * 4.0;
  c += ( texture2D( tDiffuse, vUv + o.xw ).rgb + texture2D( tDiffuse, vUv - o.xw ).rgb + texture2D( tDiffuse, vUv + o.wy ).rgb + texture2D( tDiffuse, vUv - o.wy ).rgb ) * 2.0;
  c += texture2D( tDiffuse, vUv + o.xy ).rgb + texture2D( tDiffuse, vUv - o.xy ).rgb + texture2D( tDiffuse, vUv + o.zy ).rgb + texture2D( tDiffuse, vUv - o.zy ).rgb;
  gl_FragColor = vec4( c / 16.0, 1.0 );
}`;
const DOF_MIX_FS = DOF_COMMON + /* glsl */`
uniform sampler2D tBlur; uniform float uBloomClamp;
void main(){
  float cs = coc( dist( vUv ) );
  vec3 col = mix( hdr( vUv ), texture2D( tBlur, vUv ).rgb, smoothstep( 0.6, 2.6, cs ) );
  // tope de luminancia antes del bloom: el cromo y los focos no saturan el halo
  col *= min( 1.0, uBloomClamp / max( max( col.r, col.g ), max( col.b, 1e-4 ) ) );
  gl_FragColor = vec4( col, 1.0 );
}`;

// Desenfoque de movimiento de la barra y los discos. Solo ellos se mueven rápido (hasta ~2 m/s) y lo hacen como un cuerpo
// rígido, así que alcanza con un vector de velocidad en pantalla y una máscara: cada píxel junta, a lo largo del vector, el
// color de las muestras que caen sobre la barra (lo que la barra "pinta" durante la obturación) sobre lo que ya había.
const MB_MASK_VS = /* glsl */`void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const MB_MASK_FS = /* glsl */`
uniform sampler2D tDepth; uniform vec2 uRes;
void main(){
  // tapado por el atleta (manos, cabeza, muslos) según la profundidad de la escena
  if ( texture2D( tDepth, gl_FragCoord.xy / uRes ).x < gl_FragCoord.z - 6e-5 ) discard;
  gl_FragColor = vec4( 1.0 );
}`;
const MB_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform sampler2D tMask; uniform vec2 uVel; varying vec2 vUv;
float ign( vec2 p ){ return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main(){
  vec3 base = texture2D( tDiffuse, vUv ).rgb, acc = vec3( 0.0 ); float cov = 0.0, j = ign( gl_FragCoord.xy ) - 0.5;
  for ( int i = 0; i < MB_TAPS; i ++ ) {
    vec2 uv = vUv + uVel * ( ( float( i ) + 0.5 + j ) / float( MB_TAPS ) - 0.5 );
    float m = texture2D( tMask, uv ).r; acc += texture2D( tDiffuse, uv ).rgb * m; cov += m;
  }
  gl_FragColor = vec4( base * ( 1.0 - cov / float( MB_TAPS ) ) + acc / float( MB_TAPS ), 1.0 );
}`;

const FINAL_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uVignette, uGrain, uCA, uSat, uContrast, uShadowGamma;
varying vec2 vUv;
#include <tonemapping_pars_fragment>
float hash( vec2 p ){ vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
void main(){
  vec2 d = vUv - 0.5; float r2 = dot( d, d );
  vec3 col = texture2D( tDiffuse, vUv ).rgb;
  #ifdef USE_CA
    vec2 off = d * r2 * uCA;
    col.r = texture2D( tDiffuse, vUv + off ).r; col.b = texture2D( tDiffuse, vUv - off ).b;
  #endif
  col = AgXToneMapping( col );
  // corrección tipo broadcast: sombras abiertas (gamma de sombras, no contraste que las hunda), sombras apenas frías,
  // altas cálidas, saturación controlada
  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( l ), col, uSat );
  col = max( ( col - 0.5 ) * uContrast + 0.5, 0.0 );
  col = mix( pow( col, vec3( uShadowGamma ) ), col, smoothstep( 0.0, 0.5, l ) );
  col *= mix( vec3( 0.985, 0.995, 1.025 ), vec3( 1.03, 1.0, 0.965 ), smoothstep( 0.05, 0.85, l ) );
  col *= 1.0 - uVignette * smoothstep( 0.14, 0.66, r2 );
  col = sRGBTransferOETF( vec4( max( col, 0.0 ), 1.0 ) ).rgb;
  col = col * 0.98 + vec3( 0.02, 0.02, 0.023 );   // negros levantados, como señal de TV
  col += ( hash( vUv * uRes + fract( uTime ) * 311.7 ) - 0.5 ) * uGrain;
  gl_FragColor = vec4( col, 1.0 );
}`;

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.q = quality;
    this.focus = 9; this.time = 0; this.reduceMotion = false; this.skip = {};   // skip: {ao,dof,bloom,smaa} para perfilar por pase
    this.depth = null;
    const depth = new THREE.DepthTexture(1, 1); depth.type = THREE.UnsignedIntType; depth.format = THREE.DepthFormat; this.depth = depth;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality.msaa, depthTexture: depth });
    const plain = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtA = plain(); this.rtB = plain(); this.rtC = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.quad = new FullScreenQuad();
    if (quality.ao) {
      this.gtao = new GTAOPass(scene, camera, 1, 1, { depthTexture: depth });
      this.gtao.blendIntensity = .85;
      this.gtao.updateGtaoMaterial({ radius: .38, distanceExponent: 1.2, thickness: 1.2, scale: 1.15, samples: quality.aoSamples || 8, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: quality.aoSamples || 8 });
    }
    if (quality.dof) {
      const half = () => { const t = plain(); t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; return t; };
      this.rtH1 = half(); this.rtH2 = half(); this.rtHN = plain(); this.rtHN.texture.minFilter = this.rtHN.texture.magFilter = THREE.NearestFilter;
      const common = () => ({ tDiffuse: { value: null }, tDepth: { value: depth }, uTexel: { value: new THREE.Vector2() }, uNear: { value: .1 }, uFar: { value: 100 },
        uFocus: { value: 9 }, uRange: { value: 1.35 }, uScale: { value: 3.0 }, uNearScale: { value: .35 }, uMaxBlur: { value: 12 }, uClamp: { value: 24 } });
      const mk = (fs, extra = {}, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, defines, uniforms: { ...common(), ...extra } });
      this.dofNear = mk(DOF_NEAR_FS);
      this.dofBlur = mk(DOF_BLUR_FS, { tNear: { value: null } }, { DOF_SAMPLES: quality.dofSamples || 32 });
      this.dofMix = mk(DOF_MIX_FS, { tBlur: { value: null }, uBloomClamp: { value: 3.6 } });
      this.tentMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: TENT_FS, depthTest: false, depthWrite: false, uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } } });
    }
    // umbral alto y radio corto: solo florecen focos, luces de arbitraje y brillos del acero (no las zapatillas blancas)
    if (quality.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .11, .14, 2.2);
    // desenfoque de movimiento de barra y discos (opcional por calidad): máscara a media resolución + un pase que solo corre
    // cuando la barra se mueve más de un par de píxeles por obturación
    this.motion = new THREE.Vector2(); this.motionObject = null; this.mbPx = 0;
    if (quality.mblur) {
      this.rtMask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }); this.rtMask.texture.minFilter = this.rtMask.texture.magFilter = THREE.LinearFilter;
      this.mbMaskMat = new THREE.ShaderMaterial({ vertexShader: MB_MASK_VS, fragmentShader: MB_MASK_FS, depthTest: false, depthWrite: false, uniforms: { tDepth: { value: depth }, uRes: { value: new THREE.Vector2(1, 1) } } });
      this.mbMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: MB_FS, depthTest: false, depthWrite: false, defines: { MB_TAPS: quality.mblur }, uniforms: { tDiffuse: { value: null }, tMask: { value: this.rtMask.texture }, uVel: { value: new THREE.Vector2() } } });
      this.mbScene = new THREE.Scene(); this.mbScene.overrideMaterial = this.mbMaskMat; this.mbScene.matrixWorldAutoUpdate = false;
    }
    this.finalMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false, defines: quality.dof ? { USE_CA: 1 } : {}, uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, toneMappingExposure: { value: 1.12 },
      uVignette: { value: .26 }, uGrain: { value: .02 }, uCA: { value: .0045 }, uSat: { value: 1.04 }, uContrast: { value: 1.03 }, uShadowGamma: { value: .86 },
    } });
    if (quality.smaa) this.smaa = new SMAAPass();
  }

  setSize(w, h, pr) {
    const W = Math.max(2, Math.round(w * pr)), H = Math.max(2, Math.round(h * pr)); this.W = W; this.H = H;
    this.sceneRT.setSize(W, H); this.rtA.setSize(W, H); this.rtB.setSize(W, H); this.rtC.setSize(W, H);
    // la oclusión va a media resolución en todas las calidades (el costo del GTAO crece con los píxeles); alta usa más muestras
    const ao = pr > 1.01 ? Math.min(this.q.aoScale, .5) : this.q.aoScale;
    if (this.gtao) this.gtao.setSize(Math.round(W * ao), Math.round(H * ao));
    if (this.bloom) this.bloom.setSize(W >> 1, H >> 1);      // el halo es de baja frecuencia: la pirámide arranca a un cuarto de resolución
    if (this.rtMask) { this.rtMask.setSize(Math.max(2, W >> 1), Math.max(2, H >> 1)); this.mbMaskMat.uniforms.uRes.value.set(Math.max(2, W >> 1), Math.max(2, H >> 1)); }
    if (this.smaa) this.smaa.setSize(W, H);
    if (this.dofBlur) {
      const hw = Math.max(2, W >> 1), hh = Math.max(2, H >> 1); this.rtH1.setSize(hw, hh); this.rtH2.setSize(hw, hh); this.rtHN.setSize(hw, hh); this.dofNear.uniforms.uTexel.value.set(1 / W, 1 / H);
      this.dofBlur.uniforms.uTexel.value.set(1 / W, 1 / H); this.dofMix.uniforms.uTexel.value.set(1 / W, 1 / H); this.tentMat.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    }
    this.finalMat.uniforms.uRes.value.set(W, H);
  }

  _pass(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.quad.render(this.renderer); }

  render(dt) {
    const r = this.renderer, cam = this.camera; this.time += this.reduceMotion ? 0 : dt;
    r.setRenderTarget(this.sceneRT); r.render(this.scene, cam);
    let read = this.sceneRT; const skip = this.skip;
    // teleobjetivo = menos profundidad de campo: el desenfoque máximo crece con la focal, con tope en píxeles
    const tanF = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), maxBlur = Math.min(32, this.H / 34, Math.max(6, this.H / 46 * .2217 / tanF));
    BOKEH.uNear.value = cam.near; BOKEH.uFar.value = cam.far; BOKEH.uFocus.value = this.focus; BOKEH.uMaxBlur.value = maxBlur; BOKEH.uPx.value = this.H / (2 * tanF); BOKEH.uRes.value.set(this.W, this.H); BOKEH.tDepth.value = this.depth; BOKEH.uUseDepth.value = this.dofBlur ? 1 : 0;
    if (this.gtao && !skip.ao) { this.gtao.render(r, this.rtA, read, dt, false); read = this.rtA; }
    if (this.dofBlur && !skip.dof) {
      for (const m of [this.dofNear, this.dofBlur, this.dofMix]) { const u = m.uniforms; u.tDiffuse.value = read.texture; u.uNear.value = cam.near; u.uFar.value = cam.far; u.uFocus.value = this.focus; u.uMaxBlur.value = maxBlur; }
      this.maxBlur = maxBlur;
      this._pass(this.dofNear, this.rtHN); this.dofBlur.uniforms.tNear.value = this.rtHN.texture;
      this._pass(this.dofBlur, this.rtH1);
      this.tentMat.uniforms.tDiffuse.value = this.rtH1.texture; this._pass(this.tentMat, this.rtH2);
      this.dofMix.uniforms.tBlur.value = this.rtH2.texture; this._pass(this.dofMix, this.rtB); read = this.rtB;
      // discos de bokeh de las fuentes puntuales, encima del desenfoque (capa aparte, sin limpiar ni rehacer sombras)
      // (con un color de fondo three limpia siempre: se quita durante este dibujo)
      const ac = r.autoClear, su = r.shadowMap.autoUpdate, bg = this.scene.background; r.autoClear = false; r.shadowMap.autoUpdate = false; this.scene.background = null; cam.layers.set(BOKEH_LAYER);
      r.setRenderTarget(this.rtB); r.render(this.scene, cam); cam.layers.set(0); r.autoClear = ac; r.shadowMap.autoUpdate = su; this.scene.background = bg;
    }
    // desenfoque de movimiento: `motion` es el desplazamiento de la barra en pantalla durante la obturación (en UV)
    this.mbPx = Math.hypot(this.motion.x * this.W, this.motion.y * this.H);
    if (this.mbMat && !skip.mblur && this.motionObject && this.mbPx > 1.5 && !this.reduceMotion) {
      const ac = r.autoClear, su = r.shadowMap.autoUpdate, cc = r.getClearColor(_col).getHex(), ca = r.getClearAlpha(); r.shadowMap.autoUpdate = false; r.autoClear = true; r.setClearColor(0x000000, 0);
      this.mbScene.children.length = 0; this.mbScene.children.push(this.motionObject);      // se dibuja solo la barra, sin sacarla de la escena
      r.setRenderTarget(this.rtMask); r.render(this.mbScene, cam); this.mbScene.children.length = 0;
      r.setClearColor(cc, ca); r.autoClear = ac; r.shadowMap.autoUpdate = su;
      const to = read === this.rtA ? this.rtB : this.rtA; this.mbMat.uniforms.tDiffuse.value = read.texture; this.mbMat.uniforms.uVel.value.copy(this.motion);
      this._pass(this.mbMat, to); read = to; this.mbActive = true;
    } else this.mbActive = false;
    if (this.bloom && !skip.bloom) this.bloom.render(r, null, read, dt, false);
    const f = this.finalMat.uniforms; f.tDiffuse.value = read.texture; f.uTime.value = this.time;
    if (this.smaa && !skip.smaa) { this._pass(this.finalMat, this.rtC); this.smaa.renderToScreen = true; this.smaa.render(r, null, this.rtC, dt, false); }
    else this._pass(this.finalMat, null);
    r.setRenderTarget(null);
  }

  dispose() {
    for (const t of [this.sceneRT, this.rtA, this.rtB, this.rtC, this.rtH1, this.rtH2, this.rtHN, this.rtMask]) t?.dispose();
    this.mbMaskMat?.dispose(); this.mbMat?.dispose();
    this.sceneRT.depthTexture?.dispose(); this.gtao?.dispose(); this.bloom?.dispose(); this.smaa?.dispose();
    this.dofNear?.dispose(); this.dofBlur?.dispose(); this.dofMix?.dispose(); this.tentMat?.dispose(); this.finalMat.dispose(); this.quad.dispose();
  }
}
