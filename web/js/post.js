// Cadena de post-proceso tipo transmisión: escena HDR con MSAA + profundidad -> GTAO y profundidad de campo a media
// resolución -> un compuesto a resolución completa (oclusión + desenfoque) con los discos de bokeh encima -> pirámide de
// bloom -> pase final (halo + tone mapping AgX + corrección de color + viñeta + aberración cromática + grano) -> SMAA.
// Pases a resolución completa después de la escena: compuesto y final (más los tres de SMAA en alta).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const _col = new THREE.Color(), NOP = () => {};
/** Intensidad con que la oclusión oscurece la imagen (0 = nada). */
const AO_INTENSITY = .85;
/** Capa de los discos de bokeh que se componen después del desenfoque. */
export const BOKEH_LAYER = 1;
/** Uniforms compartidos con arena.js: el mismo círculo de confusión que usa la profundidad de campo. */
export const BOKEH = { uFocus: { value: 9 }, uRange: { value: 1.35 }, uScale: { value: 3.0 }, uNearScale: { value: .35 }, uMaxBlur: { value: 12 }, uPx: { value: 1500 }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uUseDepth: { value: 0 }, uNear: { value: .25 }, uFar: { value: 120 } };

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// Oclusión ambiental: el GTAO de three a media resolución escribe oclusión (R) y distancia lineal (G) en el mismo texel, y
// se alisa con un desenfoque separable de 7 muestras que respeta los saltos de profundidad (14 lecturas por píxel en vez
// de las ~140 del Poisson de GTAOPass, que reconstruía la normal de cada muestra con 9 lecturas de profundidad).
const AO_BLUR_FS = /* glsl */`
uniform sampler2D tAO; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec2 c = texture2D( tAO, vUv ).rg; float sum = c.r * 0.26, wt = 0.26;
  for ( int i = 1; i <= 3; i ++ ) {
    float fi = float( i ), g = i == 1 ? 0.21 : ( i == 2 ? 0.115 : 0.045 ), tol = c.g * 0.03 * fi + 0.012;
    vec2 a = texture2D( tAO, vUv + uDir * fi ).rg, b = texture2D( tAO, vUv - uDir * fi ).rg;
    float wa = g * max( 0.0, 1.0 - abs( a.g - c.g ) / tol ), wb = g * max( 0.0, 1.0 - abs( b.g - c.g ) / tol );
    sum += a.r * wa + b.r * wb; wt += wa + wb;
  }
  gl_FragColor = vec4( sum / wt, c.g, 0.0, 1.0 );
}`;

// Profundidad de campo. El costo no depende del radio: (1) un prefiltro a media resolución deja en un solo texel el color
// (ya con la oclusión aplicada y el tope de luminancia) y la distancia más cercana del entorno; (2) el desenfoque junta un
// número fijo de muestras (disco de Vogel) con una sola lectura por muestra; (3) el compuesto a resolución completa alisa
// el desenfoque con una carpa (4 lecturas bilineales = carpa de 3x3), aplica la oclusión a la imagen nítida y elige por
// píxel según su círculo de confusión, así el borde foco/fondo no queda punteado. Es el único pase de resolución completa
// entre la escena y el pase final.
const DOF_COMMON = /* glsl */`
#include <packing>
uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tAO; uniform vec2 uTexel; uniform float uNear, uFar, uFocus, uRange, uScale, uNearScale, uMaxBlur, uClamp, uAO;
varying vec2 vUv;
float dist( vec2 uv ){ return - perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar ); }
float coc( float d ){ float k = d < uFocus ? uNearScale : uScale; return clamp( ( abs( d - uFocus ) - uRange ) * k / d, 0.0, 1.0 ) * uMaxBlur; }
vec3 hdr( vec2 uv ){ vec3 c = texture2D( tDiffuse, uv ).rgb; return c * min( 1.0, uClamp / max( max( c.r, c.g ), max( c.b, 1e-4 ) ) ); }
float occ( vec2 uv ){
  #ifdef USE_AO
    return mix( 1.0, texture2D( tAO, uv ).r, uAO );
  #else
    return 1.0;
  #endif
}
`;
// Distancia más cercana en un entorno de ±1,5 px. En el borde de un objeto en foco el MSAA deja píxeles con color del
// objeto y profundidad del fondo; si el desenfoque los toma por fondo, el color del objeto (un disco rojo contra un telón
// oscuro) se derrama en llamas ruidosas. Con la distancia dilatada esas muestras se descartan.
const DOF_PRE_FS = DOF_COMMON + /* glsl */`
void main(){
  vec4 o = uTexel.xyxy * vec4( 1.5, 1.5, -1.5, 0.0 );
  float d = min( min( dist( vUv ), dist( vUv + o.xy ) ), min( min( dist( vUv - o.xy ), dist( vUv + o.zy ) ), dist( vUv - o.zy ) ) );
  d = min( d, min( min( dist( vUv + o.xw ), dist( vUv - o.xw ) ), min( dist( vUv + o.wy ), dist( vUv - o.wy ) ) ) );
  gl_FragColor = vec4( hdr( vUv ) * occ( vUv ), d );
}`;
const DOF_BLUR_FS = /* glsl */`
uniform sampler2D tPre; uniform vec2 uTexel; uniform float uFocus, uRange, uScale, uNearScale, uMaxBlur; varying vec2 vUv;
const float GOLDEN = 2.39996323;
float coc( float d ){ float k = d < uFocus ? uNearScale : uScale; return clamp( ( abs( d - uFocus ) - uRange ) * k / d, 0.0, 1.0 ) * uMaxBlur; }
float ign( vec2 p ){ return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main(){
  vec4 c0 = texture2D( tPre, vUv ); float cd = c0.a, cs = coc( cd );
  // un texel en foco casi no pesa: se rellena con el fondo desenfocado que lo rodea (dilatación), y el compuesto
  // decide por píxel si usa la imagen nítida. Así el contorno del atleta no arrastra ruido ni halo.
  float w0 = mix( 0.03, 1.0, smoothstep( 0.5, 2.0, cs ) );
  vec3 color = c0.rgb * w0; float tot = w0;
  float rot = ign( gl_FragCoord.xy ) * 6.2831853;
  for ( int i = 0; i < DOF_SAMPLES; i ++ ) {
    float radius = sqrt( ( float( i ) + 0.5 ) / float( DOF_SAMPLES ) ) * uMaxBlur, ang = float( i ) * GOLDEN + rot;
    vec4 sc = texture2D( tPre, vUv + vec2( cos( ang ), sin( ang ) ) * uTexel * radius );
    float sd = sc.a, ss = coc( sd );
    if ( sd > cd && cs > 1.0 ) ss = min( ss, cs * 2.0 );      // el fondo no sangra sobre lo que está apenas fuera de foco
    float m = smoothstep( radius - 1.0, radius + 1.0, ss );
    float w = ( 1.0 + 0.7 * dot( sc.rgb, vec3( 0.3333 ) ) ) * m;  // los brillos fuera de foco forman discos
    color += sc.rgb * w; tot += w;
  }
  gl_FragColor = vec4( color / tot, 1.0 );
}`;
const DOF_MIX_FS = DOF_COMMON + /* glsl */`
uniform sampler2D tBlur; uniform float uBloomClamp, uDof;
void main(){
  vec3 col = hdr( vUv ) * occ( vUv );
  #ifdef USE_DOF
    float k = smoothstep( 0.6, 2.6, coc( dist( vUv ) ) ) * uDof;
    if ( k > 0.0 ) {
      vec4 o = uTexel.xyxy * vec4( 1.0, 1.0, -1.0, 0.0 );
      vec3 b = texture2D( tBlur, vUv + o.xy ).rgb + texture2D( tBlur, vUv - o.xy ).rgb + texture2D( tBlur, vUv + o.zy ).rgb + texture2D( tBlur, vUv - o.zy ).rgb;
      col = mix( col, b * 0.25, k );
    }
  #endif
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
uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uTime, uVignette, uGrain, uCA, uSat, uContrast, uShadowGamma, uBloom;
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
  #ifdef USE_BLOOM
    col += texture2D( tBloom, vUv ).rgb * uBloom;      // el halo es de baja frecuencia: se suma acá, sin un pase de mezcla aparte
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
    this.focus = 9; this.time = 0; this.reduceMotion = false; this.skip = {}; this.prof = null;   // skip: {ao,dof,bloom,smaa} para perfilar por pase; prof: marca de etapa (main.js)
    const depth = new THREE.DepthTexture(1, 1); depth.type = THREE.UnsignedIntType; depth.format = THREE.DepthFormat; this.depth = depth;
    // El color de la escena va en R11F_G11F_B10F: HDR sin alfa a 4 bytes por muestra, la mitad que RGBA16F. Con MSAA 4x es el
    // destino más grande del cuadro; el desenfoque, el halo y el compuesto siguen en 16 bits por canal.
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedInt101111Type, format: THREE.RGBFormat, samples: quality.msaa, depthTexture: depth });
    const plain = (opt = {}) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opt });
    this.quad = new FullScreenQuad();
    const ao = !!quality.ao, dof = !!quality.dof;
    if (ao) {
      // de GTAOPass se usa solo el material (y su textura de ruido); los pases y los destinos son los de este archivo
      this.gtao = new GTAOPass(scene, camera, 1, 1, { depthTexture: depth });
      this.gtao.updateGtaoMaterial({ radius: .38, distanceExponent: 1.2, thickness: 1.2, scale: 1.15, samples: quality.aoSamples || 8, distanceFallOff: 1, screenSpaceRadius: false });
      this.aoMat = this.gtao.gtaoMaterial; this.aoMat.defines.FRAGMENT_OUTPUT = 'vec4( ao, - viewPos.z, 0., 1. )'; this.aoMat.needsUpdate = true;
      this.rtAO1 = plain({ format: THREE.RGFormat }); this.rtAO2 = plain({ format: THREE.RGFormat });
      this.aoBlur = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: AO_BLUR_FS, depthTest: false, depthWrite: false, uniforms: { tAO: { value: null }, uDir: { value: new THREE.Vector2() } } });
    }
    if (ao || dof) {
      this.rtB = plain();
      const common = () => ({ tDiffuse: { value: null }, tDepth: { value: depth }, tAO: { value: this.rtAO1?.texture || null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: .1 }, uFar: { value: 100 },
        uFocus: { value: 9 }, uRange: { value: 1.35 }, uScale: { value: 3.0 }, uNearScale: { value: .35 }, uMaxBlur: { value: 12 }, uClamp: { value: 24 }, uAO: { value: AO_INTENSITY } });
      const defines = { ...(ao ? { USE_AO: 1 } : {}), ...(dof ? { USE_DOF: 1 } : {}) };
      const mk = (fs, extra = {}, def = defines) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, defines: def, uniforms: { ...common(), ...extra } });
      this.mixMat = mk(DOF_MIX_FS, { tBlur: { value: null }, uBloomClamp: { value: 3.6 }, uDof: { value: 1 } });
      if (dof) {
        this.rtH1 = plain(); this.rtH2 = plain();
        this.dofPre = mk(DOF_PRE_FS);
        this.dofBlur = mk(DOF_BLUR_FS, { tPre: { value: this.rtH1.texture } }, { DOF_SAMPLES: quality.dofSamples || 32 });
        this.mixMat.uniforms.tBlur.value = this.rtH2.texture;
        // los discos de bokeh se dibujan solos sobre el compuesto, sin recorrer la escena (main.js pasa el objeto)
        this.bokehObject = null; this.bokehScene = new THREE.Scene(); this.bokehScene.matrixWorldAutoUpdate = false;
      }
    }
    // umbral alto y radio corto: solo florecen focos, luces de arbitraje y brillos del acero (no las zapatillas blancas).
    // De UnrealBloomPass se usan los materiales y la pirámide; la suma del halo la hace el pase final.
    if (quality.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .11, .14, 2.2);
    // desenfoque de movimiento de barra y discos (opcional por calidad): máscara a media resolución + un pase que solo corre
    // cuando la barra se mueve más de un par de píxeles por obturación
    this.motion = new THREE.Vector2(); this.motionObject = null; this.mbPx = 0;
    if (quality.mblur) {
      this.rtA = plain();
      this.rtMask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }); this.rtMask.texture.minFilter = this.rtMask.texture.magFilter = THREE.LinearFilter;
      this.mbMaskMat = new THREE.ShaderMaterial({ vertexShader: MB_MASK_VS, fragmentShader: MB_MASK_FS, depthTest: false, depthWrite: false, uniforms: { tDepth: { value: depth }, uRes: { value: new THREE.Vector2(1, 1) } } });
      this.mbMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: MB_FS, depthTest: false, depthWrite: false, defines: { MB_TAPS: quality.mblur }, uniforms: { tDiffuse: { value: null }, tMask: { value: this.rtMask.texture }, uVel: { value: new THREE.Vector2() } } });
      this.mbScene = new THREE.Scene(); this.mbScene.overrideMaterial = this.mbMaskMat; this.mbScene.matrixWorldAutoUpdate = false;
    }
    this.finalMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false, defines: { ...(dof ? { USE_CA: 1 } : {}), ...(this.bloom ? { USE_BLOOM: 1 } : {}) }, uniforms: {
      tDiffuse: { value: null }, tBloom: { value: this.bloom ? this.bloom.renderTargetsHorizontal[0].texture : null }, uBloom: { value: 1 }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, toneMappingExposure: { value: 1.12 },
      uVignette: { value: .26 }, uGrain: { value: .02 }, uCA: { value: .0045 }, uSat: { value: 1.04 }, uContrast: { value: 1.03 }, uShadowGamma: { value: .86 },
    } });
    if (quality.smaa) { this.smaa = new SMAAPass(); this.rtC = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }); }
  }

  setSize(w, h, pr) {
    const W = Math.max(2, Math.round(w * pr)), H = Math.max(2, Math.round(h * pr)); this.W = W; this.H = H;
    const hw = Math.max(2, W >> 1), hh = Math.max(2, H >> 1);
    // con DPR efectivo de 1,4 o más cada píxel de pantalla ya recibe varios del lienzo: MSAA 2x alcanza (y SMAA sigue en alta)
    const samples = pr >= 1.4 ? Math.min(this.q.msaa, 2) : this.q.msaa;
    if (this.sceneRT.samples !== samples) { this.sceneRT.samples = samples; this.sceneRT.dispose(); }
    this.sceneRT.setSize(W, H); this.rtA?.setSize(W, H); this.rtB?.setSize(W, H); this.rtC?.setSize(W, H);
    // la oclusión va a media resolución en todas las calidades (el costo del GTAO crece con los píxeles); alta usa más muestras
    if (this.aoMat) {
      const ao = pr > 1.01 ? Math.min(this.q.aoScale, .5) : this.q.aoScale, aw = Math.max(2, Math.round(W * ao)), ah = Math.max(2, Math.round(H * ao));
      this.rtAO1.setSize(aw, ah); this.rtAO2.setSize(aw, ah); this.aoMat.uniforms.resolution.value.set(aw, ah); this.aoTexel = [1 / aw, 1 / ah];
    }
    if (this.bloom) this.bloom.setSize(W >> 1, H >> 1);      // el halo es de baja frecuencia: la pirámide arranca a un cuarto de resolución
    if (this.rtMask) { this.rtMask.setSize(hw, hh); this.mbMaskMat.uniforms.uRes.value.set(hw, hh); }
    if (this.smaa) this.smaa.setSize(W, H);
    if (this.mixMat) this.mixMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    if (this.dofBlur) { this.rtH1.setSize(hw, hh); this.rtH2.setSize(hw, hh); this.dofPre.uniforms.uTexel.value.set(1 / W, 1 / H); this.dofBlur.uniforms.uTexel.value.set(1 / W, 1 / H); }
    this.finalMat.uniforms.uRes.value.set(W, H);
  }

  _pass(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.quad.render(this.renderer); }

  /** Pirámide del bloom (pasos 1 a 3 de UnrealBloomPass.render): el resultado queda en renderTargetsHorizontal[0]. */
  _bloom(src) {
    const b = this.bloom, r = this.renderer, q = this.quad;
    b.highPassUniforms.tDiffuse.value = src; b.highPassUniforms.luminosityThreshold.value = b.threshold; this._pass(b.materialHighPassFilter, b.renderTargetBright);
    let input = b.renderTargetBright;
    for (let i = 0; i < b.nMips; i++) {
      const m = b.separableBlurMaterials[i]; q.material = m;
      m.uniforms.colorTexture.value = input.texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX; r.setRenderTarget(b.renderTargetsHorizontal[i]); q.render(r);
      m.uniforms.colorTexture.value = b.renderTargetsHorizontal[i].texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY; r.setRenderTarget(b.renderTargetsVertical[i]); q.render(r);
      input = b.renderTargetsVertical[i];
    }
    const c = b.compositeMaterial.uniforms; c.bloomStrength.value = b.strength; c.bloomRadius.value = b.radius; c.bloomTintColors.value = b.bloomTintColors;
    this._pass(b.compositeMaterial, b.renderTargetsHorizontal[0]);
  }

  render(dt) {
    const r = this.renderer, cam = this.camera, P = this.prof || NOP, skip = this.skip; this.time += this.reduceMotion ? 0 : dt;
    P('escena');
    r.setRenderTarget(this.sceneRT); r.render(this.scene, cam);
    let read = this.sceneRT;
    // teleobjetivo = menos profundidad de campo: el desenfoque máximo crece con la focal, con tope en píxeles
    const tanF = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), maxBlur = Math.min(32, this.H / 34, Math.max(6, this.H / 46 * .2217 / tanF));
    BOKEH.uNear.value = cam.near; BOKEH.uFar.value = cam.far; BOKEH.uFocus.value = this.focus; BOKEH.uMaxBlur.value = maxBlur; BOKEH.uPx.value = this.H / (2 * tanF); BOKEH.uRes.value.set(this.W, this.H); BOKEH.tDepth.value = this.depth; BOKEH.uUseDepth.value = this.dofBlur ? 1 : 0;
    const ao = this.aoMat && !skip.ao, dof = this.dofBlur && !skip.dof;
    P('ao');
    if (ao) {
      const u = this.aoMat.uniforms, cc = r.getClearColor(_col).getHex(), ca = r.getClearAlpha();
      u.cameraNear.value = cam.near; u.cameraFar.value = cam.far; u.cameraProjectionMatrix.value.copy(cam.projectionMatrix); u.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse); u.cameraWorldMatrix.value.copy(cam.matrixWorld);
      r.setClearColor(0xffffff, 1); this._pass(this.aoMat, this.rtAO1); r.setClearColor(cc, ca);      // donde el GTAO descarta (sin geometría) queda sin oclusión
      const b = this.aoBlur.uniforms; b.tAO.value = this.rtAO1.texture; b.uDir.value.set(this.aoTexel[0], 0); this._pass(this.aoBlur, this.rtAO2);
      b.tAO.value = this.rtAO2.texture; b.uDir.value.set(0, this.aoTexel[1]); this._pass(this.aoBlur, this.rtAO1);
    }
    P('dof');
    if (this.mixMat && (ao || dof)) {
      for (const m of [this.dofPre, this.dofBlur, this.mixMat]) {
        if (!m) continue; const u = m.uniforms; u.uFocus.value = this.focus; u.uMaxBlur.value = maxBlur; if (!u.tDiffuse) continue;
        u.tDiffuse.value = read.texture; u.uNear.value = cam.near; u.uFar.value = cam.far; u.uAO.value = ao ? AO_INTENSITY : 0;
      }
      this.maxBlur = maxBlur; this.mixMat.uniforms.uDof.value = dof ? 1 : 0;
      if (dof) { this._pass(this.dofPre, this.rtH1); this._pass(this.dofBlur, this.rtH2); }
      this._pass(this.mixMat, this.rtB); read = this.rtB;
      P('bokeh');
      if (dof && this.bokehObject) {
        // discos de bokeh de las fuentes puntuales, encima del desenfoque y en el mismo destino (sin limpiar)
        const ac = r.autoClear, su = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate; r.autoClear = false; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; cam.layers.set(BOKEH_LAYER);
        this.bokehScene.children.length = 0; this.bokehScene.children.push(this.bokehObject);
        r.setRenderTarget(this.rtB); r.render(this.bokehScene, cam); this.bokehScene.children.length = 0;
        cam.layers.set(0); r.autoClear = ac; r.shadowMap.autoUpdate = su; r.shadowMap.needsUpdate = nu;
      }
    }
    // desenfoque de movimiento: `motion` es el desplazamiento de la barra en pantalla durante la obturación (en UV)
    P('mblur');
    this.mbPx = Math.hypot(this.motion.x * this.W, this.motion.y * this.H);
    if (this.mbMat && !skip.mblur && this.motionObject && this.mbPx > 1.5 && !this.reduceMotion) {
      const ac = r.autoClear, su = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate, cc = r.getClearColor(_col).getHex(), ca = r.getClearAlpha(); r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; r.autoClear = true; r.setClearColor(0x000000, 0);
      this.mbScene.children.length = 0; this.mbScene.children.push(this.motionObject);      // se dibuja solo la barra, sin sacarla de la escena
      r.setRenderTarget(this.rtMask); r.render(this.mbScene, cam); this.mbScene.children.length = 0;
      r.setClearColor(cc, ca); r.autoClear = ac; r.shadowMap.autoUpdate = su; r.shadowMap.needsUpdate = nu;
      this.mbMat.uniforms.tDiffuse.value = read.texture; this.mbMat.uniforms.uVel.value.copy(this.motion);
      this._pass(this.mbMat, this.rtA); read = this.rtA; this.mbActive = true;
    } else this.mbActive = false;
    P('bloom');
    const bloom = this.bloom && !skip.bloom;
    if (bloom) this._bloom(read.texture);
    P('final');
    const f = this.finalMat.uniforms; f.tDiffuse.value = read.texture; f.uTime.value = this.time; f.uBloom.value = bloom ? 1 : 0;
    if (this.smaa && !skip.smaa) { this._pass(this.finalMat, this.rtC); this.smaa.renderToScreen = true; this.smaa.render(r, null, this.rtC, dt, false); }
    else this._pass(this.finalMat, null);
    r.setRenderTarget(null); P(null);
  }

  /** Destinos de render propios y de los pases de three (para estimar memoria de GPU, main.js). */
  targets() {
    const b = this.bloom, list = [this.sceneRT, this.rtA, this.rtB, this.rtC, this.rtH1, this.rtH2, this.rtAO1, this.rtAO2, this.rtMask];
    if (b) list.push(b.renderTargetBright, ...b.renderTargetsHorizontal, ...b.renderTargetsVertical);
    if (this.smaa) for (const k in this.smaa) if (this.smaa[k]?.isWebGLRenderTarget) list.push(this.smaa[k]);
    return list.filter(Boolean);
  }

  dispose() {
    for (const t of [this.sceneRT, this.rtA, this.rtB, this.rtC, this.rtH1, this.rtH2, this.rtAO1, this.rtAO2, this.rtMask]) t?.dispose();
    this.mbMaskMat?.dispose(); this.mbMat?.dispose(); this.aoBlur?.dispose();
    this.sceneRT.depthTexture?.dispose(); this.gtao?.dispose(); this.bloom?.dispose(); this.smaa?.dispose();
    this.dofPre?.dispose(); this.dofBlur?.dispose(); this.mixMat?.dispose(); this.finalMat.dispose(); this.quad.dispose();
  }
}
