// Personaje: carga del GLB, muestreo de la acción 'Poses', materiales de piel/tela/ojos y morphs correctivos.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { smoothstep, disposeObject } from './util.js';
import { CORR } from './config.js';

/** Nombre de hueso sin el prefijo de Mixamo (el GLB trae 'mixamorig:Spine2'; three lo deja en 'mixamorigSpine2'). */
const boneKey = n => n.replace(/^mixamorig:?/, '');
const SOLE = .016;   // la suela baja 16 mm del origen del rig
/** Por debajo de estos píxeles por metro las normales de detalle (mosaicos de 8 y 12 mm, y sus versiones gruesas) pesan cero. */
const DETAIL_MIN_PX = 210;
/** Lado máximo de la máscara de piel/tela/pelo (px). */
const MASK_MAX = 1024;
const loader = new GLTFLoader();
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

const SKIN_PARS = /* glsl */`
uniform sampler2D tMask; uniform sampler2D tDetailSkin; uniform sampler2D tDetailCloth; uniform vec2 uTile; uniform float uMaskMode; uniform vec3 uScatter; uniform float uSweat; uniform float uDetail; uniform float uSkinSat; uniform float uSkinRough; uniform vec3 uHairColor;
vec3 gMask = vec3( 0.0 ); float gGrain = 0.0; float gPatch = 0.5;
// Subsuperficie barata: difuso envuelto teñido de rojo en el terminador (la luz "dobla" la esquina dentro de la piel),
// transmisión en contraluz por los bordes finos (orejas, dedos) y nada de eso sobre la tela.
void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float ndl = dot( geometryNormal, directLight.direction );
  float wrap = saturate( ( ndl + 0.5 ) / 1.5 );
  float extra = max( 0.0, wrap * wrap - saturate( ndl ) );
  float rim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.0 );
  float back = pow( saturate( dot( geometryViewDir, - normalize( directLight.direction + geometryNormal * 0.4 ) ) ), 3.0 ) * rim;
  reflectedLight.directDiffuse += gMask.r * directLight.color * uScatter * ( extra + back * 0.8 ) * BRDF_Lambert( material.diffuseContribution );
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
  // el albedo de piel llega saturado del horneado: se baja un poco para que la luz cálida no lo vuelva naranja
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, uSkinSat ), gMask.r );
  // bajo el pelo en capas (canal B) la piel toma el color del pelo: entre hebra y hebra no se ve cuero cabelludo claro
  diffuseColor.rgb = mix( diffuseColor.rgb, uHairColor, 0.7 * smoothstep( 0.25, 0.8, gMask.b ) * step( 0.5, uMaskMode ) );
#endif
`;
const SKIN_DETAIL = /* glsl */`
#ifdef USE_MAP
{
  // Normales de detalle en mosaico (models/detail_skin.png: 1 mosaico = 12 mm; detail_cloth.png: 1 mosaico = 8 mm), repartidas
  // con la máscara (R piel, G tela). uTile = mosaicos por unidad de UV, medido sobre la malla al cargar. Cada una va en dos
  // escalas: la real (poros, trama de punto: solo se ve en primer plano) y una más gruesa que sobrevive a distancia de torso.
  // Se apagan cuando un mosaico ocupa pocos píxeles, para no centellear en plano general.
  gPatch = smoothstep( -0.35, 0.45, dot( texture2D( tDetailSkin, vMapUv * 7.0 ).xy * 2.0 - 1.0, vec2( 1.0 ) ) * 3.0 );
  if ( uDetail > 0.0 ) {      // en plano general ningún mosaico se resuelve (athlete.js lo apaga): se ahorran las cuatro lecturas
  vec2 uvS = vMapUv * uTile.x, uvC = vMapUv * uTile.y;
  float fS = max( fwidth( uvS.x ), fwidth( uvS.y ) ), fC = max( fwidth( uvC.x ), fwidth( uvC.y ) );   // mosaicos por píxel
  vec3 s1 = texture2D( tDetailSkin, uvS ).xyz * 2.0 - 1.0, s2 = texture2D( tDetailSkin, uvS * 0.21 + 0.37 ).xyz * 2.0 - 1.0;
  vec3 c1 = texture2D( tDetailCloth, uvC ).xyz * 2.0 - 1.0, c2 = texture2D( tDetailCloth, uvC * 0.3 ).xyz * 2.0 - 1.0;
  vec2 pores = s1.xy * ( 1.0 - smoothstep( 0.02, 0.07, fS ) ) + s2.xy * 0.35 * ( 1.0 - smoothstep( 0.1, 0.4, fS ) );
  vec2 weave = c1.xy * ( 1.0 - smoothstep( 0.03, 0.09, fC ) ) + c2.xy * 0.6 * ( 1.0 - smoothstep( 0.1, 0.32, fC ) );
  gGrain = s1.x + s1.y;
  vec2 d = ( pores * 0.5 * gMask.r + weave * 0.8 * gMask.g ) * uDetail; d.y = - d.y;   // textura +Y con UV de glTF (v hacia abajo)
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
  float skinRough = clamp( max( material.roughness, uSkinRough ) + gGrain * 0.08 - uSweat * 0.2 * gPatch, 0.36, 1.0 );
  material.roughness = mix( material.roughness, skinRough, gMask.r );
  float f0k = mix( 1.0, 0.72, gMask.r ); material.specularColor *= f0k; material.specularColorBlended *= f0k;     // F0 de piel (~0,028) por debajo del 0,04 genérico
}
#ifdef USE_SHEEN
  material.sheenColor *= gMask.g;
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
function buildLod(mesh, hair) {
  const geo = mesh.geometry, ix = geo.index, pos = geo.attributes.position; if (!ix || !pos || ix.count / 3 < LOD.minTris || geo.userData.lod) return geo.userData.lod || null;
  let P = pos.array;
  if (pos.isInterleavedBufferAttribute || !(P instanceof Float32Array) || pos.itemSize !== 3 || pos.normalized) { P = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); } }
  const full = ix.array instanceof Uint32Array ? ix.array : new Uint32Array(ix.array), target = Math.floor(full.length * (hair ? LOD.hairRatio : LOD.ratio) / 3) * 3;
  let low; try { [low] = MeshoptSimplifier.simplify(full, P, 3, target, hair ? LOD.hairError : LOD.error); } catch { return null; }
  if (!low || low.length < 3 || low.length > full.length * .8) return null;      // no vale la pena un segundo nivel
  const both = new Uint32Array(full.length + low.length); both.set(full, 0); both.set(low, full.length);
  geo.setIndex(new THREE.BufferAttribute(both, 1)); geo.setDrawRange(0, full.length);
  return geo.userData.lod = { full: [0, full.length], low: [full.length, low.length] };
}

/**
 * Achica una textura al lado máximo pedido (la imagen original se suelta). La máscara de piel/tela/pelo solo reparte el
 * sombreado y no necesita más de 1024 px; en calidad baja todo el personaje va a 1024.
 */
function fitTexture(tex, max) {
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

/** Normales de detalle compartidas por todos los personajes (las escribe tools/export_web.py). */
let detailPromise = null;
function loadDetail(aniso) {
  const one = url => new THREE.TextureLoader().loadAsync(url).then(t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.needsUpdate = true; return t; });
  return detailPromise ??= Promise.all([one('models/detail_skin.png'), one('models/detail_cloth.png')]).then(([skin, cloth]) => ({ skin, cloth }));
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

function bodyMaterial(src, mask, aniso, detail, mpu) {
  const m = new THREE.MeshPhysicalMaterial({
    name: src.name, map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap, aoMap: src.aoMap,
    color: src.color, roughness: src.roughness, metalness: src.metalness, side: src.side,
    sheen: .5, sheenRoughness: .5, sheenColor: new THREE.Color(.5, .5, .56), envMapIntensity: .5, specularIntensity: 1,
  });
  if (src.normalMap) m.normalScale.copy(src.normalScale);
  for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) if (t) t.anisotropy = aniso;
  const uniforms = { tDetailSkin: { value: detail.skin }, tDetailCloth: { value: detail.cloth }, uTile: { value: new THREE.Vector2(mpu / .012, mpu / .008) }, uDetail: { value: 1 }, tMask: { value: mask }, uMaskMode: { value: mask ? 1 : 0 },
    uScatter: { value: new THREE.Color(.5, .17, .1) }, uSweat: { value: .55 }, uSkinSat: { value: .78 }, uSkinRough: { value: .56 }, uHairColor: { value: new THREE.Color(.03, .025, .02) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + SKIN_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_MASK)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SKIN_DETAIL)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + SKIN_MATERIAL);
  };
  m.customProgramCacheKey = () => 'tarima-skin-6';
  m.userData.skin = uniforms;
  return m;
}

/**
 * Pelo, barba y cejas en capas concéntricas con alfa (una sola primitiva; el índice va de la capa de adentro a la de afuera
 * y no se reordena). Se dibuja con mezcla y sin escribir profundidad; `hairDepth` es una pasada previa del mismo mallado que
 * solo escribe profundidad donde la hebra es opaca: así la profundidad de campo y la oclusión ven pelo (sin halo borroso
 * alrededor de la cabeza) y una hebra opaca tapa las capas de abajo. El desplazamiento de polígono evita el z-fighting de
 * la capa interior contra el cuero cabelludo.
 */
function hairMaterial(src) {
  src.transparent = true; src.depthWrite = false; src.alphaTest = .03; src.roughness = .85; src.metalness = 0; src.envMapIntensity = .12; src.side = THREE.FrontSide;
  src.polygonOffset = true; src.polygonOffsetFactor = -1; src.polygonOffsetUnits = -2;
  // Una capa vista de canto (en la silueta de la cabeza) es una película pareja del alfa medio de la textura: con brillo
  // especular se lee como un halo a 1–2 cm de la cabeza. Se desvanece con el ángulo de vista y el pelo queda casi sin brillo.
  src.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep( 0.2, 0.62, abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ) );\n#include <alphatest_fragment>')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor *= 0.35; material.specularColorBlended *= 0.35;');
  };
  src.customProgramCacheKey = () => 'tarima-hair-2';
  return src;
}
/** Color medio (lineal) de las hebras opacas de la textura de pelo. */
function hairColor(tex, out) {
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.image, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data; let r = 0, gr = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += d[i] * a; gr += d[i + 1] * a; b += d[i + 2] * a; n += a * 255; }
    if (n > 0) out.setRGB(r / n, gr / n, b / n, THREE.SRGBColorSpace);
  } catch { /* se queda el color por defecto */ }
  return out;
}
function hairDepthMaterial(src) {
  return new THREE.MeshBasicMaterial({ name: 'HairDepth', map: src.map, alphaTest: .45, colorWrite: false, depthWrite: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}
function lashMaterial(src) {
  src.transparent = true; src.depthWrite = false; src.alphaTest = .03; src.side = THREE.DoubleSide; src.opacity = .85; src.roughness = .7; src.envMapIntensity = .2;
  return src;
}

function eyeMaterial(src) {
  return new THREE.MeshPhysicalMaterial({ name: src.name, map: src.map, color: src.color, roughness: .32, metalness: 0, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.6, side: src.side });
}

export class Athlete {
  /**
   * @param {string} name      ventura | brenner
   * @param {object} data      entrada de poses.json (usa sub y, si viene, mask)
   * @param {{aniso:number}} opt
   */
  static async load(name, data, { aniso = 8, maxTex = 4096 } = {}) {
    const [gltf, detail] = await Promise.all([loader.loadAsync(`models/${name}.glb`), loadDetail(aniso), MeshoptSimplifier.ready.catch(() => null)]);
    // la máscara es opcional; solo se pide si el build avisa que existe (evita un 404 en consola)
    let mask = null;
    if (data.mask) {
      try {
        const res = await fetch(typeof data.mask === 'string' ? data.mask : `models/${name}_mask.png`); if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob(); mask = new THREE.Texture(await createImageBitmap(blob, BITMAP)); mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; mask.anisotropy = aniso;
        mask.generateMipmaps = true; mask.minFilter = THREE.LinearMipmapLinearFilter; mask.needsUpdate = true;
        const max = Math.min(MASK_MAX, maxTex); fitTexture(mask, max); keepSource(mask, blob, max);
      } catch { mask = null; }
    }
    // texturas del GLB: se achican si la calidad lo pide y se anota de dónde volver a decodificarlas
    const seen = new Set(), uses = new Map(), json = gltf.parser.json, jobs = [];
    gltf.scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of TEX_KEYS) { const t = m[k]; if (t && !seen.has(t)) { seen.add(t); uses.set(t.source, (uses.get(t.source) || 0) + 1); } } });
    for (const t of seen) {
      const im = json.images?.[json.textures?.[gltf.parser.associations.get(t)?.textures]?.source];
      // (si dos texturas comparten imagen no se suelta: la segunda todavía puede necesitarla para subir)
      if (im?.bufferView !== undefined && uses.get(t.source) === 1) jobs.push(gltf.parser.getDependency('bufferView', im.bufferView).then(ab => keepSource(t, new Blob([ab], { type: im.mimeType || 'image/png' }), maxTex)).catch(() => null));
      fitTexture(t, maxTex);
    }
    await Promise.all(jobs);
    return new Athlete(name, data, gltf, mask, aniso, detail);
  }

  constructor(name, data, gltf, mask, aniso, detail) {
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
        else if (src.name === 'Hair') m = hairMaterial(src);
        else if (src.name === 'Lashes') m = lashMaterial(src);
        else { m.envMapIntensity = .8; if (m.normalMap) m.normalMap.anisotropy = aniso; }
        if (m !== src) src.dispose();
        done.set(src, m); return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      const nm = o.material.name;
      if (nm === 'Hair') {
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
    this.skin = body?.userData.skin || null;
    this.hasMask = !!mask; this.hasNormalMap = [...done.values()].some(m => m.name === 'Body' && m.normalMap);
    this.materialNames = [...done.values()].map(m => m.name);
    this.barBone = this.bones.find(b => boneKey(b.name) === 'Bar');
    if (!this.barBone) throw new Error(`${name}.glb no trae el hueso Bar`);
    this._byName = new Map(this.bones.map(x => [boneKey(x.name), x]));

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
      this.snap.push(this.bones.map(b => [b.quaternion.clone(), b.position.clone()]));
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
  _blend(A, B, u) {
    for (let i = 0; i < this.bones.length; i++) { const b = this.bones[i]; b.quaternion.copy(A[i][0]).slerp(B[i][0], u); b.position.copy(A[i][1]).lerp(B[i][1], u); }
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
  /** Mayor diferencia entre dos muestras: [mm de barra, grados de hueso]. Sirve para verificar el contrato 2. */
  sampleDiff(i, j) {
    let deg = 0; const A = this.snap[i], B = this.snap[j];
    for (let k = 0; k < A.length; k++) deg = Math.max(deg, THREE.MathUtils.radToDeg(A[k][0].angleTo(B[k][0])));
    return [this.barPos[i].distanceTo(this.barPos[j]) * 1000, deg];
  }
  /** Posición del centro de la barra (hueso Bar) en mundo. */
  barWorld(out) { return this.barBone.getWorldPosition(out); }
  boneWorld(name, out) { const b = this._byName.get(name); return b ? b.getWorldPosition(out) : out.set(0, 1, 0); }
  /** Punto medio de varios huesos, en mundo (blancos de los primeros planos). */
  midWorld(names, out) { out.set(0, 0, 0); let n = 0; for (const k of names) { const b = this._byName.get(k); if (b) { out.add(_a.setFromMatrixPosition(b.matrixWorld)); n++; } } return n ? out.multiplyScalar(1 / n) : out.set(0, 1, 0); }
  dispose() { this.root.removeFromParent(); this.hairDepth?.material.dispose(); disposeObject(this.root); const s = this.meshes[0]?.skeleton; if (s) s.dispose(); }
}
