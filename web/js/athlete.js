// Personaje: carga del GLB, muestreo de la acción 'Poses', materiales de piel/tela/ojos y morphs correctivos.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { smoothstep, disposeObject } from './util.js';
import { CORR } from './config.js';
import { poseReferencia } from './pose_ref.js';

/** Nombre de hueso sin el prefijo de Mixamo (el GLB trae 'mixamorig:Spine2'; three lo deja en 'mixamorigSpine2'). */
const boneKey = n => n.replace(/^mixamorig:?/, '');
const SOLE = .016;   // la suela baja 16 mm del origen del rig
/** Por debajo de estos píxeles por metro las normales de detalle (mosaicos de 8 y 12 mm, y sus versiones gruesas) pesan cero. */
const DETAIL_MIN_PX = 210;
/** Lado máximo de la máscara de piel/tela/pelo (px). */
const MASK_MAX = 1024;
// los GLB vienen con la geometría y la animación comprimidas (EXT_meshopt_compression, tools/comprimir_modelos.sh)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

const SKIN_PARS = /* glsl */`
#define PIEL_SOMBRA 0.7
uniform sampler2D tMask; uniform sampler2D tDetailSkin; uniform sampler2D tDetailCloth; uniform vec2 uTile; uniform float uMaskMode; uniform vec3 uScatter; uniform float uSweat; uniform float uDetail; uniform float uSkinSat; uniform float uSkinRough; uniform vec3 uHairColor; uniform vec4 uClothFlat; uniform vec3 uSkinTint; uniform vec3 uClothTint; uniform float uTone; uniform float uWrinkle; uniform float uGloss; uniform float uFino; uniform float uClothGain; uniform float uNormBias; uniform float uHairMix; uniform vec3 uPiel; uniform float uSinCabeza; varying float vCab; uniform float uSinTorso; uniform float uCercaOjo; uniform float uCorte; varying float vTor; varying float vNdcY; uniform sampler2D tPielTex; uniform float uPielTex; uniform vec3 uPielK; uniform vec3 uPielBase;
vec3 gMask = vec3( 0.0 ); float gGrain = 0.0; float gPatch = 0.5;
// ruido de valor suave (manchas redondeadas, sin textura): antes la variación de tono y los parches húmedos salían del mosaico de
// poros y se leían como una red de vetas claras sobre la piel
float pielHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float pielRuido( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( pielHash( i ), pielHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( pielHash( i + vec2( 0.0, 1.0 ) ), pielHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
// Subsuperficie barata: difuso envuelto teñido de rojo en el terminador (la luz "dobla" la esquina dentro de la piel),
// transmisión en contraluz por los bordes finos (orejas, dedos) y nada de eso sobre la tela.
void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float ndl = dot( geometryNormal, directLight.direction );
  float wrap = saturate( ( ndl + 0.3 ) / 1.3 );
  float extra = max( 0.0, wrap - saturate( ndl ) ) * 0.55;      // solo la franja del terminador: sin rojo en la sombra propia
  float rim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.0 );
  float back = pow( saturate( dot( geometryViewDir, - normalize( directLight.direction + geometryNormal * 0.4 ) ) ), 3.0 ) * rim;
  reflectedLight.directDiffuse += gMask.r * directLight.color * uScatter * ( extra + back * 0.04 ) * BRDF_Lambert( material.diffuseContribution );
  // transpiración: una película fina y lisa encima de la piel, en parches (segundo lóbulo angosto; uGloss lo gradúa)
  if ( uFino > 0.5 ) {
  float nh = saturate( dot( geometryNormal, normalize( directLight.direction + geometryViewDir ) ) );
  reflectedLight.directSpecular += gMask.r * uGloss * uSweat * gPatch * directLight.color * saturate( ndl ) * ( pow( nh, 48.0 ) * 0.07 + pow( nh, 14.0 ) * 0.035 );
  }
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin
`;
const SKIN_MASK = /* glsl */`
#ifdef USE_MAP
  if ( uMaskMode > 0.5 ) gMask = texture2D( tMask, vMapUv ).rgb;
  else {
    // sin máscara exportada: se estima la piel por el tono del color base
    vec3 c = diffuseColor.rgb; float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    float gr = c.g / max( c.r, 1e-3 ), br = c.b / max( c.r, 1e-3 );
    float sk = smoothstep( 0.2, 0.32, gr ) * ( 1.0 - smoothstep( 0.72, 0.88, gr ) ) * ( 1.0 - smoothstep( 0.55, 0.75, br ) ) * smoothstep( 0.04, 0.1, lum );
    gMask = vec3( sk, 1.0 - sk, 0.0 );
  }
  // textura de piel de un skin (game/skins.js, pielTex; mismo UV): reemplaza el albedo de la piel y conserva el sombreado
  // pintado en el horneado (pliegues, relieve) como la razón entre lo horneado y el tono base de la ficha
  if ( uPielTex > 0.0 && uMaskMode > 0.5 ) { float l0 = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( 1e-3, dot( uPielBase, vec3( 0.2126, 0.7152, 0.0722 ) ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, texture2D( tPielTex, vMapUv ).rgb * uPielK * mix( 1.0, clamp( l0, 0.55, 1.2 ), PIEL_SOMBRA ), uPielTex * smoothstep( 0.5, 0.9, gMask.r ) ); }
  // el albedo de piel llega saturado del horneado: se baja un poco para que la luz cálida no lo vuelva naranja
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, uSkinSat ), gMask.r );
  // tono de piel (parámetro del personaje) y su variación: parches grandes más rojizos o más pálidos (uTone), como la piel de verdad
  if ( uFino > 0.5 ) { float tono = clamp( ( pielRuido( vMapUv * 31.0 + 3.7 ) * 0.65 + pielRuido( vMapUv * 73.0 + 9.1 ) * 0.35 - 0.5 ) * 2.6, -1.0, 1.0 );
    vec3 piel = diffuseColor.rgb * uSkinTint * ( 1.0 + uTone * tono * vec3( 0.10, -0.03, -0.08 ) ) * ( 1.0 - 0.12 * uTone * abs( tono ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, piel, gMask.r ); }
  else diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * uSkinTint, gMask.r );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * uClothTint, gMask.g * step( 0.5, uMaskMode ) );      // tinte de la tela (conserva el diseño horneado)
  { float mx = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ), mn = min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) );
    vec3 tl = diffuseColor.rgb * mix( 0.62, uClothGain, smoothstep( 0.15, 0.6, ( mx - mn ) / max( mx, 1e-3 ) ) ); float lt = dot( tl, vec3( 0.2126, 0.7152, 0.0722 ) ); tl = max( vec3( 0.0 ), mix( vec3( lt ), tl, 1.25 ) );      // la tela bajo los focos: el tono AgX lava lo muy claro (la malla salía del color de la piel)
    diffuseColor.rgb = mix( diffuseColor.rgb, tl, gMask.g * step( 0.5, uMaskMode ) ); }
  // tela de color plano (el juego la usa para un pesista que comparte modelo): tapa lo que la textura trae horneado
  diffuseColor.rgb = mix( diffuseColor.rgb, uClothFlat.rgb, uClothFlat.a * smoothstep( 0.3, 0.6, gMask.g ) * step( 0.5, uMaskMode ) );
  // bajo el pelo en capas (canal B) la piel toma el color del pelo: entre hebra y hebra no se ve cuero cabelludo claro
  diffuseColor.rgb = mix( diffuseColor.rgb, uHairColor, uHairMix * smoothstep( 0.25, 0.8, gMask.b ) * step( 0.5, uMaskMode ) );
#endif
  // cuerpo propio sin dibujar salvo antebrazos y manos (primera persona con la cámara de la barra), con trama para que entre y salga de a poco
  // y lo que queda (los brazos, que entran por abajo) se deshace contra el borde de abajo de la imagen: el corte del hombro nunca queda a la vista
  // (sin trama contra el borde: el corte del hombro queda fuera de la imagen por regla, stage.js POV.vm)
  // y lo que queda pegado a la cámara (el hombro propio) se corta por distancia, sin trama
  if ( uCercaOjo > 0.0 && length( vViewPosition ) < uCercaOjo ) discard;
  if ( uSinTorso > 0.0 && vTor > uCorte && fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) < uSinTorso ) discard;
  // cabeza propia oculta (primera persona): lo que queda del cuello y la cabeza, achicado a un punto, se pinta de piel lisa
  diffuseColor.rgb = mix( diffuseColor.rgb, uPiel, uSinCabeza * smoothstep( 0.55, 0.85, vCab ) );
`;
const SKIN_DETAIL = /* glsl */`
#ifdef USE_MAP
{
  // Normales de detalle en mosaico (models/detail_skin.png: 1 mosaico = 12 mm; detail_cloth.png: 1 mosaico = 8 mm), repartidas
  // con la máscara (R piel, G tela). uTile = mosaicos por unidad de UV, medido sobre la malla al cargar. Cada una va en dos
  // escalas: la real (poros, trama de punto: solo se ve en primer plano) y una más gruesa que sobrevive a distancia de torso.
  // Se apagan cuando un mosaico ocupa pocos píxeles, para no centellear en plano general.
  if ( uFino > 0.5 ) gPatch = mix( 0.5, smoothstep( 0.3, 0.7, pielRuido( vMapUv * 47.0 + 1.3 ) * 0.7 + pielRuido( vMapUv * 113.0 ) * 0.3 ), 0.3 );      // solo con detalle fino: en el camino directo (Baja y Móvil) no se hace la cuenta      // zonas más y menos húmedas, apenas (con contraste se leía arcilla mojada)
  // arrugas de la tela: pliegues alargados de baja frecuencia (el mosaico de piel estirado), se ven desde el plano general
  vec2 d = vec2( 0.0 ); if ( uFino > 0.5 ) d = ( texture2D( tDetailSkin, vMapUv * vec2( 3.1, 10.0 ) + 0.27 ).xy * 2.0 - 1.0 ) * uWrinkle * gMask.g;
  if ( uDetail > 0.0 ) {      // en plano general ningún mosaico se resuelve (athlete.js lo apaga): se ahorran las cuatro lecturas
  vec2 uvS = vMapUv * uTile.x, uvC = vMapUv * uTile.y;
  float fS = max( fwidth( uvS.x ), fwidth( uvS.y ) ), fC = max( fwidth( uvC.x ), fwidth( uvC.y ) );   // mosaicos por píxel
  vec3 s1 = texture2D( tDetailSkin, uvS ).xyz * 2.0 - 1.0;
  vec3 c1 = texture2D( tDetailCloth, uvC ).xyz * 2.0 - 1.0, c2 = texture2D( tDetailCloth, uvC * 0.3 ).xyz * 2.0 - 1.0;
  vec2 weave = c1.xy * ( 1.0 - smoothstep( 0.03, 0.09, fC ) ) + c2.xy * 0.6 * ( 1.0 - smoothstep( 0.1, 0.32, fC ) );
  gGrain = ( s1.x + s1.y ) * ( 1.0 - smoothstep( 0.02, 0.07, fS ) );      // el poro no mueve la normal (en mosaico se leía escamas): solo rompe el brillo, y solo de cerca
  d += weave * 0.8 * gMask.g * uDetail;
  }
  d.y = - d.y;   // textura +Y con UV de glTF (v hacia abajo)
  if ( uDetail > 0.0 || uFino > 0.5 ) {
  vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition ); vec2 st0 = dFdx( vMapUv ), st1 = dFdy( vMapUv );
  vec3 q1p = cross( q1, normal ), q0p = cross( normal, q0 ); vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float det = max( dot( T, T ), dot( B, B ) ); float sc = det == 0.0 ? 0.0 : inversesqrt( det );
  normal = normalize( normal + ( T * d.x + B * d.y ) * sc );
  }
}
#endif
`;
// Piel mate con brillo roto: rugosidad base alta, grano de alta frecuencia y sudor en parches (no un lóbulo liso de plástico).
const SKIN_MATERIAL = /* glsl */`
{
  float skinRough = clamp( max( material.roughness, uSkinRough ) + gGrain * 0.09 + ( 0.5 - gPatch ) * 0.3 - uSweat * 0.1 * gPatch, 0.42, 1.0 );      // zonas mates y zonas húmedas, no un brillo parejo
  material.roughness = mix( material.roughness, skinRough, gMask.r );
  float f0k = mix( 1.0, 0.5, gMask.r ); material.specularColor *= f0k; material.specularColorBlended *= f0k;     // F0 de piel (~0,028) por debajo del 0,04 genérico
  material.specularF90 *= mix( 1.0, 0.42, gMask.r );
  { float hb = smoothstep( 0.25, 0.8, gMask.b ) * step( 0.5, uMaskMode ); material.roughness = mix( material.roughness, 0.95, hb ); float hk = 1.0 - 0.85 * hb; material.specularColor *= hk; material.specularColorBlended *= hk; material.specularF90 *= hk; }      // pelo pintado (rapado, degradé, cejas): mate; con el brillo de la piel se leía una franja gris en el nacimiento      // el brillo rasante de la piel bajo los contraluces era un borde blanco de goma
}
#ifdef USE_SHEEN
  material.sheenColor *= gMask.g * mix( vec3( 1.0 ), diffuseColor.rgb * 2.5, 0.75 );      // brillo satinado del color de la tela, no un velo blanco
#endif
`;

/**
 * Nivel de detalle para plano general. El cuerpo trae ~90 mil triángulos y el pelo hasta ~46 mil: a distancia de transmisión
 * cada triángulo mide menos de un píxel y el costo del sombreado crece con los triángulos, no con los píxeles. Al cargar se
 * arma un segundo índice simplificado (meshoptimizer: colapsa aristas sobre los vértices que ya existen, así pesos de
 * piel, morphs y UV quedan intactos) y se guarda a continuación del original en el mismo buffer; elegir nivel es cambiar
 * el rango de dibujo, y la sombra y la pasada de profundidad del pelo usan el mismo. El error máximo es una fracción del
 * tamaño de la malla (LOD.error): por debajo de LOD.pxPerM píxeles por metro queda por debajo del píxel.
 */
export const LOD = { minTris: 6000, ratio: .3, error: .0012, hairRatio: .45, hairError: .0015, pxLow: 430, pxHigh: 520 };
export function buildLod(mesh, hair = false, borde = false) {      // `borde`: no mueve los bordes abiertos (una prenda: el escote y la sisa)
  const geo = mesh.geometry, ix = geo.index, pos = geo.attributes.position; if (!ix || !pos || ix.count / 3 < LOD.minTris || geo.userData.lod) return geo.userData.lod || null;
  let P = pos.array;
  if (pos.isInterleavedBufferAttribute || !(P instanceof Float32Array) || pos.itemSize !== 3 || pos.normalized) { P = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); } }
  const full = ix.array instanceof Uint32Array ? ix.array : new Uint32Array(ix.array), target = Math.floor(full.length * (hair ? LOD.hairRatio : LOD.ratio) / 3) * 3;
  let low; try { [low] = MeshoptSimplifier.simplify(full, P, 3, target, hair ? LOD.hairError : LOD.error, borde ? ['LockBorder'] : undefined); } catch { return null; }
  if (!low || low.length < 3 || low.length > full.length * .8) return null;      // no vale la pena un segundo nivel
  const both = new Uint32Array(full.length + low.length); both.set(full, 0); both.set(low, full.length);
  geo.setIndex(new THREE.BufferAttribute(both, 1)); geo.setDrawRange(0, full.length);
  return geo.userData.lod = { full: [0, full.length], low: [full.length, low.length] };
}

/**
 * Achica una textura al lado máximo pedido (la imagen original se suelta). La máscara de piel/tela/pelo solo reparte el
 * sombreado y no necesita más de 1024 px; en calidad baja todo el personaje va a 1024.
 */
export function fitTexture(tex, max) {
  const im = tex?.image; if (!im || !(Math.max(im.width, im.height) > max)) return tex;
  const k = max / Math.max(im.width, im.height), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
  // la escala de un ImageBitmap decodificado sin voltear coincide con flipY = false, igual que la carga de GLTFLoader
  g.drawImage(im, 0, 0, cv.width, cv.height); im.close?.(); tex.image = cv; tex.needsUpdate = true; return tex;
}
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap'];
const BITMAP = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };      // lo mismo que usa GLTFLoader
/**
 * Las imágenes decodificadas del personaje (unos 95 MB) no se conservan: cada textura guarda el JPEG o PNG original (un
 * Blob, 3 MB entre todas) y suelta su mapa de bits apenas sube a la GPU. Si después se libera la GPU (personaje oculto),
 * restoreGpu() las vuelve a decodificar desde el Blob.
 */
function keepSource(tex, blob, max) {
  tex.userData.blob = blob; tex.userData.max = max;
  tex.onUpdate = () => { const im = tex.image; if (!im?.close) return; tex.userData.w = im.width; tex.userData.h = im.height; im.close(); tex.userData.closed = true; };
}

/**
 * Baja un archivo como Blob avisando los bytes que van llegando (fetch no da progreso por sí solo). Si pasan `estancado`
 * ms sin que llegue nada (la conexión se quedó colgada), corta y falla: así la carga se reintenta en lugar de quedar
 * esperando para siempre en «Armando la tarima…» (LIF-33).
 */
async function bajar(url, avisa, { estancado = 20000 } = {}) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let reloj = null; const vivo = () => { if (!ctl) return; clearTimeout(reloj); reloj = setTimeout(() => ctl.abort(), estancado); };
  vivo();
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined); if (!res.ok) throw new Error(url + ': ' + res.status);
    vivo();
    const total = +res.headers.get('content-length') || 0, tipo = res.headers.get('content-type') || '';
    if (!avisa || !res.body?.getReader) { const b = await res.blob(); avisa?.({ loaded: b.size, total: b.size, lengthComputable: true }); return b; }
    const rd = res.body.getReader(), partes = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; vivo(); partes.push(value); n += value.length; avisa({ loaded: n, total, lengthComputable: total > 0 }); }
    avisa({ loaded: n, total: n, lengthComputable: true });
    return new Blob(partes, { type: tipo });
  } catch (e) {
    if (ctl?.signal.aborted) throw new Error(`${url}: sin datos en ${Math.round(estancado / 1000)} s`);
    throw e;
  } finally { clearTimeout(reloj); }
}

/** Texturas de piel de los skins (game/skins.js, `pielTex`), una por ruta; solo se bajan si un skin las pide. */
const pielTex = new Map();
function loadPielTex(url, aniso) {
  if (!pielTex.has(url)) pielTex.set(url, new THREE.TextureLoader().loadAsync(url).then(t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.needsUpdate = true; return t; }).catch(e => { pielTex.delete(url); throw new Error(`${url}: no bajó (${e?.type || e?.message || 'error'})`); }));
  return pielTex.get(url);
}

/** Normales de detalle compartidas por todos los personajes (las escribe tools/export_web.py). */
let detailPromise = null;
function loadDetail(aniso) {
  const one = url => new THREE.TextureLoader().loadAsync(url).then(t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.needsUpdate = true; return t; });
  // si no bajan, la próxima carga los vuelve a pedir (sin esto, un fallo quedaba guardado para siempre)
  return detailPromise ??= Promise.all([one('models/detail_skin.png'), one('models/detail_cloth.png')]).then(([skin, cloth]) => ({ skin, cloth }))
    .catch(e => { detailPromise = null; throw e instanceof Error ? e : new Error(`detail: ${e?.type || 'error'} ${String(e?.target?.src || '').split('/').pop()}`); });
}
/** Metros de superficie por unidad de UV (mediana sobre triángulos de la malla en reposo): fija la escala real del mosaico. */
function metersPerUv(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv, ix = geo.index, n = ix ? ix.count / 3 : p.count / 3, r = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), step = Math.max(1, Math.floor(n / 3000));
  for (let t = 0; t < n; t += step) {
    const i = ix ? ix.getX(t * 3) : t * 3, j = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, k = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, j).sub(a); c.fromBufferAttribute(p, k).sub(a);
    const A3 = b.cross(c).length() / 2, A2 = Math.abs((uv.getX(j) - uv.getX(i)) * (uv.getY(k) - uv.getY(i)) - (uv.getX(k) - uv.getX(i)) * (uv.getY(j) - uv.getY(i))) / 2;
    if (A2 > 1e-10 && A3 > 1e-10) r.push(Math.sqrt(A3 / A2));
  }
  r.sort((x, y) => x - y); return r.length ? r[r.length >> 1] : 1.5;
}

/**
 * Aspecto por defecto de un personaje: lo que `Athlete.setAspecto()` deja cuando no se le pasa un valor. Son parámetros de
 * los materiales (no tocan la malla ni las texturas), así el mismo modelo sirve para otros pesistas y para «skins».
 * - piel.tono: multiplica el color de la piel (hex o [r, g, b] lineal; '#ffffff' = como viene); saturacion: 1 = como viene
 *   (0,78 baja el naranja del horneado); variacion: parches rojizos y pálidos; rugosidad: piso de la rugosidad;
 *   sudor: 0 seco a 1 empapado (el esfuerzo lo sube solo, effort.js); brillo: fuerza del brillo de la transpiración;
 *   dispersion: color de la luz que atraviesa la piel (subsuperficie aproximada).
 * - pelo.color: tinte del pelo, barba y cejas (multiplica su textura); null = como viene.
 *   pelo.base: color del pelo en la ficha del pesista (`pelo` de plantel.json). En el pelo de malla opaca la textura solo
 *   aporta la variación entre mechones: su color medio se lleva a este (blender/tex.py `pelo` la genera ~3,8 veces más
 *   clara en lineal: ×1,7 + 0,04), y el pelo pintado en la piel (cejas, degradé, barba) usa el mismo. null = como viene.
 * - tela.tinte: multiplica la tela conservando el diseño; tela.plano: color que reemplaza la tela entera (null = textura);
 *   arrugas: pliegues en las normales; brillo: reflejo satinado de la lycra (sheen).
 */
/** Detalle fino de los materiales del pesista (variación de tono, arrugas de tela, brillo de transpiración): 1 con post, 0 en el camino directo («Baja» y «Móvil»: ahí cada lectura de textura cuenta). Compartido por todos los personajes. */
export const FINO = { value: 1 };
export const ASPECTO = Object.freeze({
  piel: Object.freeze({ tono: '#f0dfd2', saturacion: .8, variacion: 1, rugosidad: .68, sudor: .55, brillo: .3, dispersion: [.5, .15, .08] }),
  pelo: Object.freeze({ color: null, base: null }),
  tela: Object.freeze({ tinte: '#ffffff', plano: null, arrugas: .12, brillo: .14 }),
});
const _color = (c, out) => (Array.isArray(c) ? out.setRGB(c[0], c[1], c[2]) : out.set(c ?? '#ffffff'));
function bodyMaterial(src, mask, aniso, detail, mpu) {
  const m = new THREE.MeshPhysicalMaterial({
    name: src.name, map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap, aoMap: src.aoMap,
    color: src.color, roughness: src.roughness, metalness: src.metalness, side: src.side,
    sheen: .14, sheenRoughness: .6, sheenColor: new THREE.Color(.32, .32, .36), envMapIntensity: .35, specularIntensity: 1,
  });
  if (src.normalMap) m.normalScale.copy(src.normalScale);
  for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) if (t) t.anisotropy = aniso;
  const uniforms = { tDetailSkin: { value: detail.skin }, tDetailCloth: { value: detail.cloth }, uTile: { value: new THREE.Vector2(mpu / .012, mpu / .008) }, uDetail: { value: 1 }, tMask: { value: mask }, uMaskMode: { value: mask ? 1 : 0 },
    uScatter: { value: new THREE.Color(...ASPECTO.piel.dispersion) }, uSweat: { value: ASPECTO.piel.sudor }, uSkinSat: { value: ASPECTO.piel.saturacion }, uSkinRough: { value: ASPECTO.piel.rugosidad }, uHairColor: { value: new THREE.Color(.03, .025, .02) }, uClothFlat: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSkinTint: { value: new THREE.Color(ASPECTO.piel.tono) }, uClothTint: { value: new THREE.Color(1, 1, 1) }, uTone: { value: ASPECTO.piel.variacion }, uWrinkle: { value: ASPECTO.tela.arrugas }, uGloss: { value: ASPECTO.piel.brillo }, uFino: FINO, uClothGain: { value: .46 }, uNormBias: { value: 1.1 },
    uHairMix: { value: .7 }, uPiel: { value: new THREE.Color(.6, .42, .33) }, uSinCabeza: { value: 0 }, uSinTorso: { value: 0 }, uCercaOjo: { value: 0 }, uCorte: { value: .5 },
    tPielTex: { value: null }, uPielTex: { value: 0 }, uPielK: { value: new THREE.Color(1, 1, 1) }, uPielBase: { value: new THREE.Color(.6, .42, .33) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCabeza; varying float vCab; attribute float aTorso; varying float vTor; varying float vNdcY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCab = aCabeza; vTor = aTorso;').replace('#include <project_vertex>', '#include <project_vertex>\nvNdcY = gl_Position.y / max( 1e-4, gl_Position.w );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + SKIN_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_MASK)
      // el mapa de normales trae estrías y grano fino que con luz dura se leen escamas: sobre la piel se lee un nivel más borroso (queda la anatomía)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )', 'texture2D( normalMap, vNormalMapUv, uNormBias * gMask.r )') + '\n' + SKIN_DETAIL)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + SKIN_MATERIAL);
  };
  m.customProgramCacheKey = () => 'tarima-skin-28';
  m.userData.skin = uniforms;
  return m;
}

// Brillo del pelo (Kajiya-Kay): la hebra refleja en una banda perpendicular a su dirección, no en un punto. La dirección de
// la hebra se toma como «hacia abajo sobre la cabeza» (tangente a la superficie en el plano vertical), corrida un poco hacia la
// normal; dos bandas, una angosta del color de la luz y otra ancha teñida. Bajo y suave: pelo corto, no una peluca de vinilo.
const HAIR_PARS = /* glsl */`
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  vec3 arriba = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  vec3 t = cross( geometryNormal, cross( arriba, geometryNormal ) ); float lt = length( t ); if ( lt < 1e-3 ) return; t /= lt;
  vec3 h = normalize( directLight.direction + geometryViewDir );
  float ndl = saturate( dot( geometryNormal, directLight.direction ) * 0.6 + 0.4 );
  float a1 = dot( normalize( t + geometryNormal * 0.12 ), h ), a2 = dot( normalize( t - geometryNormal * 0.2 ), h );
  float banda = pow( sqrt( max( 0.0, 1.0 - a1 * a1 ) ), 90.0 ) * 0.0035 + pow( sqrt( max( 0.0, 1.0 - a2 * a2 ) ), 22.0 ) * 0.002;      // muy bajo: las capas se suman y los focos son fuertes
  reflectedLight.directSpecular += directLight.color * ndl * banda * ( 0.3 + material.diffuseContribution * 5.0 );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair
`;
/**
 * Pelo, barba y cejas en capas concéntricas con alfa (una sola primitiva; el índice va de la capa de adentro a la de afuera
 * y no se reordena). Se dibuja con mezcla y sin escribir profundidad; `hairDepth` es una pasada previa del mismo mallado que
 * solo escribe profundidad donde la hebra es opaca: así la profundidad de campo y la oclusión ven pelo (sin halo borroso
 * alrededor de la cabeza) y una hebra opaca tapa las capas de abajo. El desplazamiento de polígono evita el z-fighting de
 * la capa interior contra el cuero cabelludo.
 */
/**
 * Nacimiento del pelo y borde de la barba: las capas traen como segundo UV el del cuerpo (blender/geo.py, `UVCuero`) y se
 * recortan con el canal B de la máscara, que es el nacimiento pintado (curvo, ralo, con entradas). Sin eso el borde de las
 * capas es el de sus polígonos: un serrucho. Los modelos sin segundo UV quedan como antes (`uCuero` en 0).
 */
function conCuero(sh, U, lo = '0.5', hi = '0.92') {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec2 vCuero;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCuero = uv1;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tCuero; uniform float uCuero; varying vec2 vCuero;')
    .replace('#include <alphatest_fragment>', 'if ( uCuero > 0.5 ) diffuseColor.a = min( 1.0, diffuseColor.a * 1.5 ) * smoothstep( ' + lo + ', ' + hi + ', texture2D( tCuero, vCuero, 2.5 ).b );\n#include <alphatest_fragment>');
}
function hairMaterial(src, mask, uv1) {
  const U = { tCuero: { value: mask || null }, uCuero: { value: mask && uv1 ? 1 : 0 } }; src.userData.cuero = U;
  src.transparent = true; src.depthWrite = false; src.alphaTest = .03; src.roughness = .85; src.metalness = 0; src.envMapIntensity = .12; src.side = THREE.FrontSide;
  src.polygonOffset = true; src.polygonOffsetFactor = -1; src.polygonOffsetUnits = -2;
  // Una capa vista de canto (en la silueta de la cabeza) es una película pareja del alfa medio de la textura: con brillo
  // especular se lee como un halo a 1–2 cm de la cabeza. Se desvanece con el ángulo de vista y el pelo queda casi sin brillo.
  src.onBeforeCompile = sh => {
    conCuero(sh, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep( 0.2, 0.62, abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ) );\n#include <alphatest_fragment>')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor *= 0.2; material.specularColorBlended *= 0.2;')
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + HAIR_PARS);
  };
  src.customProgramCacheKey = () => 'tarima-hair-7';
  return src;
}
/** Color medio (lineal) de las hebras opacas de la textura de pelo. */
/**
 * Atributo `aCabeza` de la malla del cuerpo: cuánto pesa en cada vértice el cuello y lo que cuelga de él (cabeza, ojos). El
 * juego oculta la cabeza propia en primera persona achicando el cuello a un punto; con esto el sombreador pinta ese resto
 * de piel lisa (`uPiel`: el promedio del albedo en la base del cuello, donde el peso va de 0,3 a 0,6) en vez de dejar la
 * cara y la barba estiradas.
 */
function pesoCabeza(mesh, skin) {
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, uv = g.attributes.uv; if (!si || !sw || g.attributes.aCabeza) return;
  const es = mesh.skeleton.bones.map(b => { for (let x = b; x; x = x.parent) if (x.isBone && boneKey(x.name) === 'Neck') return true; return false; });
  // `aTorso`: todo el cuerpo menos los antebrazos y las manos (1 = se descarta con `uSinTorso`): en primera persona la cámara
  // acompaña a la barra y queda dentro del cuerpo; el juego dibuja las dos caras mientras tanto (el corte del codo no se ve hueco)
  const mano = mesh.skeleton.bones.map(b => { for (let x = b; x; x = x.parent) if (x.isBone && /^(Left|Right)ForeArm$/.test(boneKey(x.name))) return true; return false; });
  // el brazo (del hombro al codo) vale 0,65: con `uCorte` en 0,8 se dibuja (brazos colgando: salen de la imagen por arriba) y en 0,5 no
  // las piernas y los pies también valen 0,65 (se dibujan con `uCorte` en 0,8: al mirar la barra se ven rodillas y zapatillas; el corte de la cadera queda detrás de la cámara)
  const tr = mesh.skeleton.bones.map((b, i) => (mano[i] ? 0 : /^(Left|Right)(Arm|UpLeg|Leg|Foot|ToeBase)/.test(boneKey(b.name)) ? .65 : 1));
  const w = new Float32Array(si.count), wt = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) { let t = 0, c = 0, d = 0; for (let k = 0; k < 4; k++) { const p = sw.getComponent(i, k), h = si.getComponent(i, k); t += p; if (es[h]) c += p; d += p * tr[h]; } w[i] = t > 0 ? c / t : 0; wt[i] = t > 0 ? d / t : 0; }
  g.setAttribute('aCabeza', new THREE.BufferAttribute(w, 1)); g.setAttribute('aTorso', new THREE.BufferAttribute(wt, 1));
  try {
    const im = mesh.material.map?.image; if (!im || !uv || !skin?.uPiel) return;
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const c2 = cv.getContext('2d', { willReadFrequently: true }); c2.drawImage(im, 0, 0, N, N);
    const d = c2.getImageData(0, 0, N, N).data; let r = 0, gr = 0, b = 0, n = 0;
    for (let i = 0; i < si.count; i++) if (w[i] > .3 && w[i] < .6) { const x = Math.min(N - 1, Math.max(0, Math.floor((uv.getX(i) % 1 + 1) % 1 * N))), y = Math.min(N - 1, Math.max(0, Math.floor((uv.getY(i) % 1 + 1) % 1 * N))), j = (y * N + x) * 4; r += d[j]; gr += d[j + 1]; b += d[j + 2]; n++; }
    if (n > 8) skin.uPiel.value.setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch { /* se queda el color por defecto */ }
}
function hairColor(tex, out) {
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.image, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data; let r = 0, gr = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += d[i] * a; gr += d[i + 1] * a; b += d[i + 2] * a; n += a * 255; }
    if (n > 0) out.setRGB(r / n, gr / n, b / n, THREE.SRGBColorSpace);
  } catch { /* se queda el color por defecto */ }
  return out;
}
/**
 * Pelo y barba como malla opaca con volumen (plantel nuevo, blender/geo.py `hair_cap`): mate, casi sin reflejo del ambiente; la
 * forma la dan los gajos de la malla y la luz de contorno.
 * Reflejo: una mata de pelo no es una superficie lisa. Con el lóbulo ancho de GGX (rugosidad 0,82) y Fresnel, los tres
 * contraluces (15 + 14 + 5, sin sombra, detrás del pesista) vistos a contraluz daban de 2 a 6 veces más luz que la difusa:
 * 0,13 a 0,37 lineal en coronilla y sienes contra 0,03 a 0,07, o sea un casco gris claro sobre un pelo negro. Va con el
 * mismo 0,2 que el pelo en capas y sin la subida de Fresnel al ras (F90 = 0).
 */
function capMaterial(src, mask, uv1) {
  const U = { tCuero: { value: mask || null }, uCuero: { value: mask && uv1 ? 1 : 0 } }; if (U.uCuero.value) src.alphaTest = .5;      // el borde del casco lo corta el nacimiento pintado (máscara, canal B)
  src.roughness = Math.max(src.roughness ?? .8, .78); src.metalness = 0; src.envMapIntensity = .1; src.side = THREE.FrontSide;
  src.normalMap = null;      // sin mapa de normales: en el borde fino del casco el UV de las hebras degenera y las normales salían disparadas (púas gris claro en el nacimiento); la forma la dan los gajos de la malla
  src.onBeforeCompile = sh => { conCuero(sh, U, '0.1', '0.62');
    // nacimiento en degradé: el borde del casco no es un corte sino una trama que se va raleando (abajo queda el degradé pintado en la piel)
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'if ( uCuero > 0.5 ) { float rn = fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); diffuseColor.a = diffuseColor.a > rn * 0.85 + 0.08 ? 1.0 : 0.0; }\n#include <alphatest_fragment>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor *= 0.2; material.specularColorBlended *= 0.2; material.specularF90 = 0.0;'); };
  src.customProgramCacheKey = () => 'tarima-pelo-6';
  return src;
}
function hairDepthMaterial(src) {
  const m = new THREE.MeshBasicMaterial({ name: 'HairDepth', map: src.map, alphaTest: .45, colorWrite: false, depthWrite: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  if (src.userData.cuero) { m.onBeforeCompile = sh => conCuero(sh, src.userData.cuero); m.customProgramCacheKey = () => 'tarima-hairdepth-4'; }
  return m;
}
function lashMaterial(src) {
  src.transparent = true; src.depthWrite = false; src.alphaTest = .03; src.side = THREE.DoubleSide; src.opacity = .85; src.roughness = .7; src.envMapIntensity = .2;
  return src;
}

function eyeMaterial(src) {
  // Ojo húmedo pero no de vidrio: una capa lisa fina (reflejo chico de la luz, no el ambiente entero), esclerótica que no llega
  // al blanco y la sombra que el párpado y las pestañas de arriba echan sobre el globo (lo que más lo saca de «ojo de muñeco»).
  const m = new THREE.MeshPhysicalMaterial({ name: src.name, map: src.map, color: src.color, roughness: .38, metalness: 0, clearcoat: .7, clearcoatRoughness: .08, envMapIntensity: .45, side: src.side });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{ float arriba = normalize( vNormal ).y; diffuseColor.rgb *= 0.86 * mix( 0.5, 1.0, smoothstep( 0.6, 0.1, arriba ) ) * mix( 0.8, 1.0, smoothstep( -0.75, -0.2, arriba ) ); }');
  };
  m.customProgramCacheKey = () => 'tarima-eye-5';
  return m;
}

export class Athlete {
  /**
   * @param {string} name      ventura | brenner
   * @param {object} data      entrada de poses.json (usa sub y, si vienen, mask y glb1024)
   * @param {{aniso:number, maxTex:number, progreso:(clave:string, bajado:number, total:number)=>void}} opt
   *   progreso: bytes bajados del GLB y de la máscara, a medida que llegan (total 0 si el servidor no lo dice)
   */
  static async load(name, data, { aniso = 8, maxTex = 4096, progreso = null } = {}) {
    // con texturas de 1024 como tope se baja el GLB que ya las trae a 1024 (el mismo modelo, un tercio del peso)
    const url = maxTex <= 1024 && data.glb1024 ? data.glb1024 : `models/${name}.glb`;
    const bajado = {}, avisa = clave => progreso ? e => { bajado[clave] = e.loaded; try { progreso(clave, e.loaded, e.lengthComputable ? e.total : 0); } catch { /* el aviso no frena la carga */ } } : undefined;
    // la máscara es opcional; solo se pide si el build avisa que existe (evita un 404 en consola). Baja a la par del GLB.
    const maskBlob = data.mask ? bajar(typeof data.mask === 'string' ? data.mask : `models/${name}_mask.png`, avisa(name + ':mask')).catch(() => null) : null;
    // el GLB se baja con bajar() (con progreso y con corte si la conexión se cuelga) y después se lee
    const glb = bajar(url, avisa(name + ':glb') || null).then(b => b.arrayBuffer()).then(buf => loader.parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1)));
    const [gltf, detail] = await Promise.all([glb, loadDetail(aniso), MeshoptSimplifier.ready.catch(() => null)]);
    // sin Content-Length (servidor que comprime o manda por partes) el total no se sabe hasta el final: se avisa que terminó
    if (progreso) { const n = bajado[name + ':glb'] || 1; avisa(name + ':glb')({ loaded: n, total: n, lengthComputable: true }); }
    let mask = null;
    if (maskBlob) {
      try {
        const blob = await maskBlob; if (!blob) throw new Error('sin máscara');
        mask = new THREE.Texture(await createImageBitmap(blob, BITMAP)); mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; mask.anisotropy = aniso;
        mask.generateMipmaps = true; mask.minFilter = THREE.LinearMipmapLinearFilter; mask.needsUpdate = true;
        const max = Math.min(MASK_MAX, maxTex); fitTexture(mask, max); keepSource(mask, blob, max);
      } catch { mask = null; }
    }
    // texturas del GLB: se achican si la calidad lo pide y se anota de dónde volver a decodificarlas
    const seen = new Set(), uses = new Map(), json = gltf.parser.json, jobs = [];
    gltf.scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of TEX_KEYS) { const t = m[k]; if (t && !seen.has(t)) { seen.add(t); uses.set(t.source, (uses.get(t.source) || 0) + 1); } } });
    for (const t of seen) {
      const tx = json.textures?.[gltf.parser.associations.get(t)?.textures], im = json.images?.[tx?.source ?? tx?.extensions?.EXT_texture_webp?.source];
      // (si dos texturas comparten imagen no se suelta: la segunda todavía puede necesitarla para subir)
      if (im?.bufferView !== undefined && uses.get(t.source) === 1) jobs.push(gltf.parser.getDependency('bufferView', im.bufferView).then(ab => keepSource(t, new Blob([ab], { type: im.mimeType || 'image/png' }), maxTex)).catch(() => null));
      fitTexture(t, maxTex);
    }
    await Promise.all(jobs);
    return new Athlete(name, data, gltf, mask, aniso, detail);
  }

  constructor(name, data, gltf, mask, aniso, detail) {
    this._aniso = aniso;
    this.name = name; this.root = gltf.scene; this.root.position.y = SOLE; this.root.visible = false;
    this.bones = []; this.meshes = []; this.morphs = []; this.lods = []; this.lod = 0; this.shared = new Set([detail.skin, detail.cloth]); this._lost = new Set();
    const done = new Map(), all = [], extra = [];
    this.root.traverse(o => { if (o.isBone) this.bones.push(o); if (o.isMesh) all.push(o); });
    // El GLB trae dos nodos de malla ('Human' con morphs y 'Human_parts' sin ellos); three abre cada primitiva en su propia
    // SkinnedMesh. Los materiales se reconocen por nombre, no por el nodo ni por el orden.
    for (const o of all) {
      o.castShadow = o.receiveShadow = true; o.frustumCulled = false; this.meshes.push(o);
      const conv = src => {
        if (done.has(src)) return done.get(src);
        let m = src;
        if (src.name === 'Body') m = bodyMaterial(src, mask, aniso, detail, this.metersPerUv = metersPerUv(o.geometry));
        else if (src.name === 'Eyes') m = eyeMaterial(src);
        else if (src.name === 'Hair') m = src.transparent ? hairMaterial(src, mask, !!o.geometry.attributes.uv1) : capMaterial(src, mask, !!o.geometry.attributes.uv1);
        else if (src.name === 'Lashes') m = lashMaterial(src);
        else { m.envMapIntensity = .8; if (m.normalMap) m.normalMap.anisotropy = aniso; }
        if (m !== src) src.dispose();
        done.set(src, m); return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      const nm = o.material.name;
      if (nm === 'Hair' && o.material.transparent) {
        o.castShadow = false; o.renderOrder = 2;      // la sombra la da la cabeza; las capas no se sombrean entre sí
        const dm = new THREE.SkinnedMesh(o.geometry, hairDepthMaterial(o.material)); dm.name = o.name + '_depth'; dm.bind(o.skeleton, o.bindMatrix);
        dm.frustumCulled = false; dm.castShadow = dm.receiveShadow = false;
        if (o.morphTargetInfluences) { dm.morphTargetInfluences = o.morphTargetInfluences; dm.morphTargetDictionary = o.morphTargetDictionary; }
        extra.push([o, dm]); this.hairDepth = dm;
      } else if (nm === 'Lashes') { o.castShadow = o.receiveShadow = false; o.renderOrder = 1; }
      if (MeshoptSimplifier.supported) { const l = buildLod(o, nm === 'Hair'); if (l) this.lods.push({ geo: o.geometry, ...l, name: nm }); }
      const d = o.morphTargetDictionary;
      if (d && Object.keys(d).some(k => k.startsWith('corr_'))) this.morphs.push({ mesh: o, dict: d });
    }
    for (const [o, dm] of extra) o.parent.add(dm);
    const body = [...done.values()].find(m => m.name === 'Body'), hair = [...done.values()].find(m => m.name === 'Hair');
    if (body && hair?.map) hairColor(hair.map, body.userData.skin.uHairColor.value);
    // color medio de la textura del pelo de malla opaca (para llevarlo al de la ficha, `pelo.base`); null si no se pudo leer
    { const c = hair?.map && !hair.transparent ? hairColor(hair.map, new THREE.Color(0, 0, 0)) : null; this._peloMedia = c && c.r + c.g + c.b > 0 ? c : null; }
    this.skin = body?.userData.skin || null; this.cuerpo = body || null; this.pelo = hair || null; this._peloBase = this.skin ? this.skin.uHairColor.value.clone() : null;
    for (const o of this.meshes) if (o.material?.name === 'Body') pesoCabeza(o, this.skin);
    this.hasMask = !!mask; this.hasNormalMap = [...done.values()].some(m => m.name === 'Body' && m.normalMap);
    this.materialNames = [...done.values()].map(m => m.name);
    this.barBone = this.bones.find(b => boneKey(b.name) === 'Bar');
    if (!this.barBone) throw new Error(`${name}.glb no trae el hueso Bar`);
    this._byName = new Map(this.bones.map(x => [boneKey(x.name), x]));

    // reposo del GLB (antes de tocar ninguna animación): de ahí salen las poses de referencia T y A (pose_ref.js)
    this.reposo = this.bones.map(x => [x, x.quaternion.clone(), x.position.clone()]);
    // muestreo de la acción a `sub` muestras por fase (1 s de clip por fase)
    const clip = gltf.animations.find(a => a.name === 'Poses') || gltf.animations[0];
    const mixer = new THREE.AnimationMixer(this.root), act = mixer.clipAction(clip); act.play();
    // Las claves del GLB empiezan en el cuadro 1 de Blender (t0 = 1/30 s), no en 0: se muestrea desde t0 para caer
    // exacto en las claves que midió check() y no en un cuadro interpolado anterior.
    const t0 = clip.tracks.reduce((m, t) => Math.min(m, t.times[0]), Infinity) || 0;
    const sub = data.sub, n = Math.round((clip.duration - t0) * sub) + 1;
    this.snap = []; this.barPos = [];
    for (let i = 0; i < n; i++) {
      mixer.setTime(Math.min(t0 + i / sub, clip.duration - 1e-4));
      // normalizado: las claves de rotación del GLB comprimido salen a 1e-5 de la unidad (filtro exponencial de meshopt)
      this.snap.push(this.bones.map(b => [b.quaternion.clone().normalize(), b.position.clone()]));
      this.root.updateMatrixWorld(true);
      this.barPos.push(this.barBone.getWorldPosition(new THREE.Vector3()));
    }
    act.stop(); mixer.uncacheRoot(this.root);
    this.sampleCount = n;

    // correctivos (contrato 6). Brazo arriba: ángulo entre el brazo y su dirección de reposo, en el marco de Spine2.
    // Rodilla: ángulo entre (Leg − UpLeg) y (Foot − Leg) con posiciones de hueso en mundo; 0° es la pierna recta.
    this.arms = []; this.knees = []; this.corr = {};
    // rango (grados) en que cada correctivo va de 0 a 1: el de poses.json (campo opcional `corr`) manda sobre config.js
    const rng = (v, d) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[1] > v[0] ? [v[0], v[1]] : d;
    this.corrRange = { armUp: rng(data.corr?.armUp, CORR.armUp), knee: rng(data.corr?.knee, CORR.knee) };
    const sk = all.find(o => o.isSkinnedMesh)?.skeleton;
    if (sk && this.morphs.length) {
      const by = k => sk.bones.findIndex(b => boneKey(b.name) === k), s2 = by('Spine2');
      const restDir = i => {
        const bind = _m.copy(sk.boneInverses[i]).invert(), dir = new THREE.Vector3().setFromMatrixColumn(bind, 1).normalize();
        const rs = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().copy(sk.boneInverses[s2]).invert());
        return dir.applyQuaternion(rs.invert());
      };
      for (const [key, bone] of [['L', 'LeftArm'], ['R', 'RightArm']]) {
        const i = by(bone); if (i < 0 || s2 < 0) continue;
        this.arms.push({ key: 'corr_armUp_' + key, bone: sk.bones[i], spine: sk.bones[s2], rest: restDir(i) });
      }
      for (const [key, side] of [['L', 'Left'], ['R', 'Right']]) {
        const up = this._byName.get(side + 'UpLeg'), leg = this._byName.get(side + 'Leg'), foot = this._byName.get(side + 'Foot');
        if (up && leg && foot) this.knees.push({ key: 'corr_knee_' + key, up, leg, foot });
      }
    }
    this.setSample(0);
  }

  /**
   * Elige el nivel de detalle según los píxeles por metro con que se ve al atleta (con histéresis). Devuelve true si cambió.
   * También apaga las normales de detalle de piel y tela cuando ya no se resuelven (su peso en el shader es cero).
   */
  setScreenScale(pxPerM) {
    const lod = pxPerM < LOD.pxLow ? 1 : (pxPerM > LOD.pxHigh ? 0 : this.lod);
    if (this.skin) this.skin.uDetail.value = pxPerM < DETAIL_MIN_PX ? 0 : 1;
    if (lod === this.lod) return false;
    this.lod = lod; for (const l of this.lods) { const r = lod ? l.low : l.full; l.geo.setDrawRange(r[0], r[1]); }
    return true;
  }
  /**
   * Suelta la memoria de GPU del personaje (texturas, buffers y texturas de morphs y huesos) sin tocar los datos: three la
   * vuelve a subir sola la próxima vez que se dibuje. Se llama al ocultarlo, así dos personajes cargados ocupan en la GPU
   * lo mismo que uno (unos 140 MB cada uno).
   */
  releaseGpu() {
    const seen = new Set(), drop = t => { if (t?.isTexture && !seen.has(t) && !this.shared.has(t)) { seen.add(t); t.dispose(); if (t.userData.closed) this._lost.add(t); } };
    for (const o of [...this.meshes, this.hairDepth].filter(Boolean)) {
      for (const m of [].concat(o.material)) { for (const k of TEX_KEYS) drop(m[k]); if (m.userData.skin) for (const k in m.userData.skin) drop(m.userData.skin[k].value); }
      o.geometry.dispose(); o.skeleton?.boneTexture?.dispose(); if (o.skeleton) o.skeleton.boneTexture = null;
    }
  }
  /** Vuelve a decodificar las texturas que releaseGpu() soltó. Hay que esperarla antes de mostrar al personaje. */
  restoreGpu() {
    if (this._restoring) return this._restoring;      // dos pedidos seguidos esperan la misma decodificación
    const list = [...this._lost]; if (!list.length) return Promise.resolve();
    this._lost.clear();
    return this._restoring = Promise.all(list.map(async t => {
      try { t.image = await createImageBitmap(t.userData.blob, BITMAP); t.userData.closed = false; fitTexture(t, t.userData.max); t.needsUpdate = true; }
      catch { this._lost.add(t); }
    })).finally(() => { this._restoring = null; });
  }
  /** Aplica la muestra fraccionaria f del clip (interpolación entre muestras resueltas). */
  setSample(f) {
    const n = this.snap.length, a = Math.min(n - 2, Math.max(0, Math.floor(f)));
    this._blend(this.snap[a], this.snap[a + 1], Math.min(1, Math.max(0, f - a)));
  }
  /** Mezcla dos muestras cualesquiera del clip (unión cargada → envión durante la pausa del rack). */
  setPair(i, j, u) { const n = this.snap.length - 1, k = x => Math.min(n, Math.max(0, x | 0)); this._blend(this.snap[k(i)], this.snap[k(j)], Math.min(1, Math.max(0, u))); }
  /** Como setPair, y el resultado se mezcla en `w` con la muestra `k` (el juego: de la pose del fallo a otra fase validada). El visor no lo usa. */
  setMix(i, j, u, k, w) { const n = this.snap.length - 1, c = x => Math.min(n, Math.max(0, x | 0)); this._blend(this.snap[c(i)], this.snap[c(j)], Math.min(1, Math.max(0, u)), this.snap[c(k)], Math.min(1, Math.max(0, w))); }
  /**
   * Como setMix, por partes (el juego: el final del intento, game/caida.js): los huesos de los brazos (clavícula, brazo,
   * antebrazo, mano y dedos) salen de `br` y el resto del cuerpo de `cu`; cada uno es {i, j, u, k, w}: la mezcla en `u` de las
   * muestras `i` y `j` (sin `j`, la siguiente), mezclada en `w` con la muestra `k`. Así los brazos pueden desandar el clip mientras las piernas lo siguen.
   */
  setParts(cu, br) {
    const n = this.snap.length - 1, c = x => Math.min(n, Math.max(0, x | 0)), S = this.snap, u01 = x => Math.min(1, Math.max(0, x));
    this._arm ||= this.bones.map(b => /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.test(boneKey(b.name)));
    this._blend(S[c(cu.i)], S[c(cu.j ?? cu.i + 1)], u01(cu.u), S[c(cu.k)], u01(cu.w), { A: S[c(br.i)], B: S[c(br.j ?? br.i + 1)], u: u01(br.u), C: S[c(br.k)], uc: u01(br.w) });
  }
  /** Los dedos de un lado (`L`: 'Left' o 'Right') toman la pose de la muestra `i` (cerrados sobre la barra: un puño) con peso `w`. */
  dedosDe(L, i, w) {
    const S = this.snap[Math.min(this.snap.length - 1, Math.max(0, i | 0))]; if (!S || w <= 0) return;
    this._dedos ||= this.bones.map(b => { const m = /^(Left|Right)Hand(.+)$/.exec(boneKey(b.name)); return m ? m[1] : null; });
    for (let k = 0; k < this.bones.length; k++) if (this._dedos[k] === L) this.bones[k].quaternion.slerp(S[k][0], Math.min(1, w));
  }
  _blend(A0, B0, u0, C0 = null, uc0 = 0, arm = null) {
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i], P = arm && this._arm[i] ? arm : null, A = P ? P.A : A0, B = P ? P.B : B0, u = P ? P.u : u0, C = P ? P.C : C0, uc = P ? P.uc : uc0;
      b.quaternion.copy(A[i][0]).slerp(B[i][0], u); b.position.copy(A[i][1]).lerp(B[i][1], u); if (C && uc > 0) { b.quaternion.slerp(C[i][0], uc); b.position.lerp(C[i][1], uc); }
    }
    this.root.updateMatrixWorld(true);
    const w = this.corr;
    for (const arm of this.arms) {
      _v.setFromMatrixColumn(arm.bone.matrixWorld, 1).normalize();
      _q.setFromRotationMatrix(_m.extractRotation(arm.spine.matrixWorld)).invert();
      w[arm.key] = smoothstep(this.corrRange.armUp[0], this.corrRange.armUp[1], THREE.MathUtils.radToDeg(_v.applyQuaternion(_q).angleTo(arm.rest)));
    }
    for (const k of this.knees) {
      _v.setFromMatrixPosition(k.leg.matrixWorld); _a.setFromMatrixPosition(k.up.matrixWorld); _b.setFromMatrixPosition(k.foot.matrixWorld).sub(_v); _v.sub(_a);
      w[k.key] = smoothstep(this.corrRange.knee[0], this.corrRange.knee[1], THREE.MathUtils.radToDeg(_v.angleTo(_b)));
    }
    for (const mo of this.morphs) for (const key in w) { const idx = mo.dict[key]; if (idx !== undefined) mo.mesh.morphTargetInfluences[idx] = w[key]; }
  }
  /**
   * Pose de referencia 'T' (brazos horizontales) o 'A' (a 45°), calculada sobre el esqueleto desde el reposo del GLB, sin
   * correctivos (pose_ref.js; docs/GRAFICOS_PLAN.md, G1). La barra no acompaña: quien la llama la oculta. `setSample` vuelve al clip.
   */
  poseReferencia(tipo = 'T') {
    const r = poseReferencia(THREE, this._byName, this.reposo, this.root, tipo);
    for (const mo of this.morphs) for (const key in mo.dict) if (key.startsWith('corr_')) mo.mesh.morphTargetInfluences[mo.dict[key]] = 0;
    return r;
  }
  /** Mayor diferencia entre dos muestras: [mm de barra, grados de hueso]. Sirve para verificar el contrato 2. */
  sampleDiff(i, j) {
    let deg = 0; const A = this.snap[i], B = this.snap[j];
    for (let k = 0; k < A.length; k++) deg = Math.max(deg, THREE.MathUtils.radToDeg(A[k][0].angleTo(B[k][0])));
    return [this.barPos[i].distanceTo(this.barPos[j]) * 1000, deg];
  }
  /**
   * Aspecto del personaje por parámetros (ver ASPECTO): `a` puede traer solo lo que cambia; lo demás vuelve al valor por
   * defecto, así un modelo compartido no arrastra el aspecto del pesista anterior. No compila nada (son uniforms).
   */
  setAspecto(a = {}) {
    if (!this._enSkin) { this._aspecto0 = a; this.skinPuesto = null; }      // un aspecto nuevo saca el tinte del skin de piel y tela; quien viste (stage.js) llama a setSkin después
    const u = this.skin, P = { ...ASPECTO.piel, ...(a.piel || {}) }, H = { ...ASPECTO.pelo, ...(a.pelo || {}) }, T = { ...ASPECTO.tela, ...(a.tela || {}) };
    const M = this._peloMedia, base = H.base && M ? _color(H.base, new THREE.Color()) : null;      // solo con pelo de malla opaca y textura leída
    if (u) {
      _color(P.tono, u.uSkinTint.value); u.uSkinSat.value = P.saturacion; u.uTone.value = P.variacion; u.uSkinRough.value = P.rugosidad; u.uSweat.value = P.sudor; u.uGloss.value = P.brillo; _color(P.dispersion, u.uScatter.value);
      _color(T.tinte, u.uClothTint.value); u.uWrinkle.value = T.arrugas;
      if (T.plano) { const c = _color(T.plano, new THREE.Color()); u.uClothFlat.value.set(c.r, c.g, c.b, 1); } else u.uClothFlat.value.w = 0;
      if (this._peloBase) { u.uHairColor.value.copy(base || this._peloBase); if (H.color) u.uHairColor.value.multiply(_color(H.color, new THREE.Color())); }
    }
    if (this.cuerpo) this.cuerpo.sheen = T.brillo;
    if (this.pelo) { _color(H.color, this.pelo.color); if (base) this.pelo.color.multiply(new THREE.Color(Math.min(1, base.r / Math.max(M.r, 1e-4)), Math.min(1, base.g / Math.max(M.g, 1e-4)), Math.min(1, base.b / Math.max(M.b, 1e-4)))); }      // nunca aclara
    this.aspecto = { piel: P, pelo: H, tela: T };
  }
  /**
   * Skin (game/skins.js, `resolverSkin`): multiplicadores de color sobre lo que ya está cargado. `r.piel` y `r.malla` multiplican
   * el tono de la piel y el tinte de la tela; `r.pelo` es el color del pelo; `r.materiales[nombre]`, el color de las zapatillas
   * y el cinturón (materiales aparte). null vuelve al aspecto sin skin. No baja ni compila nada: son uniforms y colores.
   * Se puede llamar las veces que haga falta (parte siempre del último `setAspecto` que no vino de un skin).
   */
  setSkin(r = null) {
    const a0 = this._aspecto0 || {}; this._enSkin = true;
    try { this.setAspecto(r?.pelo ? { ...a0, pelo: { ...(a0.pelo || {}), base: r.pelo } } : a0); } finally { this._enSkin = false; }
    const u = this.skin, c = new THREE.Color();
    if (u && r?.piel) u.uSkinTint.value.multiply(c.setRGB(r.piel[0], r.piel[1], r.piel[2]));
    if (u && r?.malla) u.uClothTint.value.multiply(c.setRGB(r.malla[0], r.malla[1], r.malla[2]));
    this._color0 ||= new Map();
    for (const o of this.meshes) for (const m of [].concat(o.material || [])) {
      const k = r?.materiales?.[m.name]; if (!k && !this._color0.has(m)) continue;
      if (!this._color0.has(m)) this._color0.set(m, m.color.clone());
      m.color.copy(this._color0.get(m)); if (k) m.color.multiply(c.setRGB(k[0], k[1], k[2]));
    }
    this.skinPuesto = r || null;
    // textura de piel del skin: baja una vez (compartida) y se enciende si el skin sigue puesto cuando llega
    if (u?.uPielTex) { u.uPielTex.value = 0; const p = r?.pielTex;
      if (p) { u.uPielK.value.setRGB(p.k[0], p.k[1], p.k[2]); u.uPielBase.value.setRGB(p.base[0], p.base[1], p.base[2]);
        this.pielLista = loadPielTex(p.url, this._aniso || 8).then(t => { if (this.skinPuesto === r) { u.tPielTex.value = t; u.uPielTex.value = 1; } }).catch(e => console.warn('skin:', e.message)); } }
  }
  /** Tela de color plano sobre la máscara de tela (color de three o null para volver a la textura). Por defecto, apagada. */
  setClothFlat(color) { for (const m of this.meshes) for (const mat of [].concat(m.material || [])) { const u = mat.userData?.skin?.uClothFlat; if (u) { if (color) u.value.set(color.r, color.g, color.b, 1); else u.value.w = 0; } } }
  /** Posición del centro de la barra (hueso Bar) en mundo. */
  barWorld(out) { return this.barBone.getWorldPosition(out); }
  boneWorld(name, out) { const b = this._byName.get(name); return b ? b.getWorldPosition(out) : out.set(0, 1, 0); }
  /** Punto medio de varios huesos, en mundo (blancos de los primeros planos). */
  midWorld(names, out) { out.set(0, 0, 0); let n = 0; for (const k of names) { const b = this._byName.get(k); if (b) { out.add(_a.setFromMatrixPosition(b.matrixWorld)); n++; } } return n ? out.multiplyScalar(1 / n) : out.set(0, 1, 0); }
  dispose() { this.root.removeFromParent(); this.hairDepth?.material.dispose(); disposeObject(this.root); const s = this.meshes[0]?.skeleton; if (s) s.dispose(); }
}
