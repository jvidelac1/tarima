// Escenario del juego: mismo render, arena, luces, barra y personajes que el visor, con la cámara sin arrastre (en el
// juego el lienzo es el botón). No reemplaza a web/js/main.js: el visor sigue armando el suyo y no cambia nada de esto.
// Fluidez (docs/JUEGO.md 8.7):
// - Camino directo (calidades con `directo`, «Baja» y «Móvil»): la escena se dibuja en una sola pasada al lienzo, con el
//   MSAA del propio lienzo, y el tono (AgX) y la corrección de color del pase final se aplican dentro de cada material. Sin
//   destino HDR, sin resolver MSAA a una textura y sin pase de pantalla completa. La viñeta y los negros levantados van en
//   una capa CSS encima del lienzo (la compone el navegador, no la placa del juego).
// - Sombra barata: solo proyectan el pesista y la barra; la arena, el público y los cartelones no entran en la pasada de sombra.
// - La geometría fija de la arena se junta en una malla por material (menos llamadas de dibujo, en la escena y en la sombra).
// - La resolución es un presupuesto de píxeles (`tope`) que se cambia sin recompilar nada; las sombras se prenden y apagan
//   entre dos juegos de programas que precalentar() deja compilados; el pesista usa el nivel de detalle del visor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Arena } from '../arena.js';
import { Lighting } from '../lighting.js';
import { Post, BOKEH } from '../post.js';
import { Barbell } from '../barbell.js';
import { CameraRig, CAMERAS, SHOTS } from '../cameras.js';
import { BarTrace } from '../trace.js';
import { Athlete } from '../athlete.js';
import { Timeline } from '../timeline.js';
import { PLATE_R, PLATES, loadout, COLLAR_KG } from '../config.js';
import { PLANTEL } from './roster.js';
import { aplicarEsfuerzo } from './effort.js';
import { tramo } from './sequence.js';

/**
 * Lo que el pase final de post.js hace después del AgX (saturación, contraste, gamma de sombras y tinte frío/cálido), como
 * tono «a medida» de three: en el camino directo cada material lo aplica a su color antes de pasarlo a sRGB. Los valores
 * son los de los uniforms del pase final (uSat 1,04, uContrast 1,03, uShadowGamma 0,86). La exposición (1,12) la pone
 * renderer.toneMappingExposure, que AgXToneMapping ya usa. Solo cambia CustomToneMapping, que el visor no usa.
 */
const GRADO = `vec3 CustomToneMapping( vec3 color ) {
	color = AgXToneMapping( color );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = mix( vec3( l ), color, 1.04 );
	color = max( ( color - 0.5 ) * 1.03 + 0.5, 0.0 );
	color = mix( pow( color, vec3( 0.86 ) ), color, smoothstep( 0.0, 0.5, l ) );
	color *= mix( vec3( 0.985, 0.995, 1.025 ), vec3( 1.03, 1.0, 0.965 ), smoothstep( 0.05, 0.85, l ) );
	return color;
}`;
const VACIA = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
if (THREE.ShaderChunk.tonemapping_pars_fragment.includes(VACIA)) THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(VACIA, GRADO);
export const EXPOSICION = 1.12;

/** El mismo tono en JavaScript (AgX de three y GRADO), para pasar a la pantalla colores que se mezclan después del tono (la niebla). */
export function tonoJS(c) {
  const mul = (m, v) => [0, 1, 2].map(i => m[0][i] * v[0] + m[1][i] * v[1] + m[2][i] * v[2]);      // mat3 de GLSL: columnas
  const A = [[.6274, .0691, .0164], [.3293, .9195, .0880], [.0433, .0113, .8956]], B = [[1.6605, -.1246, -.0182], [-.5876, 1.1329, -.1006], [-.0728, -.0083, 1.1187]];
  const IN = [[.856627153315983, .137318972929847, .11189821299995], [.0951212405381588, .761241990602591, .0767994186031903], [.0482516061458583, .101439036467562, .811302368396859]];
  const OUT = [[1.1271005818144368, -.1413297634984383, -.14132976349843826], [-.11060664309660323, 1.157823702216272, -.11060664309660294], [-.016493938717834573, -.016493938717834257, 1.2519364065950405]];
  const ap = x => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; };
  let v = mul(IN, mul(A, [c.r * EXPOSICION, c.g * EXPOSICION, c.b * EXPOSICION]));
  v = v.map(x => ap(Math.min(1, Math.max(0, (Math.log2(Math.max(x, 1e-10)) + 12.47393) / (4.026069 + 12.47393)))));
  v = mul(B, mul(OUT, v).map(x => Math.pow(Math.max(0, x), 2.2))).map(x => Math.min(1, Math.max(0, x)));
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const l = .2126 * v[0] + .7152 * v[1] + .0722 * v[2], ti = s(.05, .85, l), T = [.985 + (1.03 - .985) * ti, .995 + (1 - .995) * ti, 1.025 + (.965 - 1.025) * ti];
  v = v.map(x => Math.max(0, (l + (x - l) * 1.04 - .5) * 1.03 + .5)).map((x, i) => (Math.pow(x, .86) + (x - Math.pow(x, .86)) * s(0, .5, l)) * T[i]);
  return new THREE.Color().setRGB(...v.map(x => new THREE.Color().setRGB(x, x, x).convertLinearToSRGB().r));
}
/**
 * Viñeta y negros levantados del pase final, como gradiente CSS encima del lienzo: el pase hacía col·(1−v) en lineal y
 * después col·0,98 + 0,02 en sRGB; una capa de alfa a y color C da col·(1−a) + C·a, así que a = 1 − 0,98·(1−v)^(1/2,2)
 * y C·a = 0,02 (constante: el navegador interpola el gradiente premultiplicado). La elipse es la de la imagen, como en el pase.
 */
export function vineta() {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const paradas = [0, .35, .5, .6, .7, .8, .9, 1].map(t => { const v = .26 * s(.14, .66, .5 * t * t), a = 1 - .98 * Math.pow(1 - v, 1 / 2.2), c = Math.round(255 * Math.min(1, .02 / a)); return `rgba(${c},${c},${c},${a.toFixed(4)}) ${Math.round(t * 100)}%`; });
  return `radial-gradient(ellipse farthest-corner at 50% 50%, ${paradas.join(', ')})`;
}
/** Los ShaderMaterial de la arena (haces, discos de luz, público) no aplican tono ni sRGB solos: en el camino directo hace falta. */
function conTono(m) {
  if (!m.isShaderMaterial || m.userData.conTono || !/\}\s*$/.test(m.fragmentShader)) return;
  // cada #include en su propia línea: los haces tienen todo el main() en una sola, y un #include a mitad de línea no se resuelve
  m.fragmentShader = m.fragmentShader.replace(/\}\s*$/, '\n\t#include <tonemapping_fragment>\n\t#include <colorspace_fragment>\n}'); m.userData.conTono = true; m.needsUpdate = true;
}
/**
 * Pasada de sombra: la cámara de sombra de las luces ve solo esta capa (three usa la capa de la cámara de sombra si tiene
 * alguna además de la 0). Entran el pesista, una copia sin grupos de material de cada pieza de la barra (una llamada por
 * pieza en vez de una por grupo) y lo de la arena que recibe sombra dentro del cono de la clave (la tarima y la alfombra:
 * con VSM three dibuja también lo que recibe, y sin ellos el borde de la sombra se aclara). Nada más.
 */
const CAPA_SOMBRA = 2, SOMBRA_MAT = new THREE.MeshBasicMaterial(), sinGrupos = new WeakMap();
function copiaDeSombra(g) {
  let p = sinGrupos.get(g);
  if (!p) { p = new THREE.BufferGeometry(); if (g.index) p.setIndex(g.index); p.setAttribute('position', g.attributes.position); sinGrupos.set(g, p); }      // comparte los búferes: la barra que se curva se curva también acá
  return p;
}
/**
 * Junta en una malla por material la geometría fija de `raiz` (lo que no se mueve, no cambia de material y no está en
 * `fuera`): mismas posiciones, una llamada de dibujo en vez de varias. Deja afuera lo transparente, lo instanciado, los
 * ShaderMaterial y las mallas espejadas. Devuelve cuántas mallas había y cuántas quedaron.
 */
export function juntarFijos(raiz, fuera) {
  raiz.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(raiz.matrixWorld).invert(), m = new THREE.Matrix4(), grupos = new Map();
  const libre = o => { for (let p = o; p && p !== raiz; p = p.parent) if (fuera.has(p) || !p.visible) return false; return true; };
  raiz.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !libre(o)) return;
    const mat = o.material, g = o.geometry;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.isShaderMaterial || Object.keys(g.morphAttributes).length || o.matrixWorld.determinant() <= 0) return;
    const at = Object.entries(g.attributes); if (at.some(([, a]) => a.isInterleavedBufferAttribute)) return;
    const k = [mat.uuid, +o.castShadow, +o.receiveShadow, o.renderOrder, o.layers.mask, g.index ? 'i' : 'n', ...at.map(([n, a]) => `${n}:${a.itemSize}:${a.array.constructor.name}:${+a.normalized}`).sort()].join('|');
    (grupos.get(k) || grupos.set(k, []).get(k)).push(o);
  });
  let antes = 0, despues = 0;
  for (const lista of grupos.values()) {
    antes += lista.length; if (lista.length < 2) { despues += lista.length; continue; }
    const gs = lista.map(o => { const g = o.geometry.clone(); g.clearGroups(); return g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); });
    const junta = mergeGeometries(gs); gs.forEach(g => g.dispose());
    if (!junta) { despues += lista.length; continue; }
    const o0 = lista[0], malla = new THREE.Mesh(junta, o0.material); malla.name = 'fijos:' + (o0.material.name || o0.material.type);
    malla.castShadow = o0.castShadow; malla.receiveShadow = o0.receiveShadow; malla.renderOrder = o0.renderOrder; malla.layers.mask = o0.layers.mask; malla.matrixAutoUpdate = false;
    for (const o of lista) o.removeFromParent();
    raiz.add(malla); despues++;
  }
  return { antes, despues };
}

// ---------- escena barata por píxel («Baja» y «Móvil»: Q.barato) ----------
// El banco del usuario (M1 Pro) decía que a 1 MP lo caro era por píxel: la arena (casi todo el piso con material físico y
// ocho luces), los haces de luz y los tres contraluces. Q.barato = { piso, haces, bordes } cambia eso solo en el juego:
// - piso: la tarima y la alfombra del escenario con su luz horneada en una textura (todas las luces, vistas desde arriba,
//   al construir la escena) y un material sin luces; la sombra del pesista y la barra va en una capa que solo oscurece.
// - haces: 'no' no los dibuja. En el camino directo el tono se aplica a cada capa que se suma, y el tono del juego deja en
//   negro todo lo que valga menos de 0,0158: los haces (0,035 a 0,05 en el foco, menos hacia abajo) no movían ni un píxel en
//   las seis cámaras del juego (fotos del banco en Actions), pero se pagaban enteros. 'cortos': una cara con el brillo de
//   las dos, cortados donde dejan de verse y en colores de pantalla (por si se los quiere volver a ver con otra curva).
// - bordes: 'material' saca de la escena los tres contraluces y los pone como término del material del pesista y de la barra
//   (la misma cuenta de un foco, sin sombra); 'luces' es como el visor; 'no' los apaga (variante del banco).

/** Tono de los haces en colores de pantalla: d(x) = A · max(x − X0, 0)^P imita a tonoJS por canal (error menor a 0,03). */
export const CURVA_HAZ = { A: 1.0467, X0: .0158, P: .36 };
const HAZ_FS = /* glsl */`uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV; varying float vT;
void main(){
	float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 2.2 ); float fall = pow( clamp( vT, 0.0, 1.0 ), 1.6 );
	vec3 c = uColor * uStrength * edge * fall;
	#if defined( TONE_MAPPING )
	gl_FragColor = vec4( 2.0 * ${CURVA_HAZ.A.toFixed(4)} * pow( max( c - ${CURVA_HAZ.X0.toFixed(4)}, 0.0 ), vec3( ${CURVA_HAZ.P.toFixed(3)} ) ), 1.0 );
	#else
	gl_FragColor = vec4( 2.0 * c, 1.0 );
	#endif
}`;
/**
 * Cono de haz corto: el mismo cono que el de la arena (vértice en el foco, radio 0,09 → 1 a lo largo de 1), cortado en
 * `corte` del largo. En `uv.y` va el brillo del cono entero (vT^1,6) por un desvanecido que llega a cero en el corte, ya
 * pasado por la raíz 1,6 (el sombreador vuelve a elevar). La parte de abajo, la más ancha, no se veía: con el tono del
 * camino directo todo lo que suma menos de CURVA_HAZ.X0 sale negro, y pasada la mitad del largo el haz más fuerte (0,05)
 * ya no llega (vT^1,6 · 0,05 < 0,0158 desde t ≈ 0,51). Cortado en 0,56, con el desvanecido recién desde 0,5, queda el
 * 31 % del área y la misma imagen.
 */
export function conoCorto(corte = .56, desde = .5, anillos = 8) {
  const g = new THREE.CylinderGeometry(.09, .09 + (1 - .09) * corte, corte, 28, anillos, true); g.translate(0, -corte / 2, 0);
  const uv = g.attributes.uv, s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < uv.count; i++) { const t = (1 - uv.getY(i)) * corte, f = Math.pow(1 - t, 1.6) * (1 - s(desde, corte, t)); uv.setY(i, Math.pow(f, 1 / 1.6)); }
  return g;
}
/** Los contraluces como término del material: los materiales con este parche y el estado (prendido o no). */
const BORDE = { on: false, u: null, mats: new Set() };
const BORDE_PARS = 'uniform vec3 uBordePos[ 3 ]; uniform vec3 uBordeDir[ 3 ]; uniform vec3 uBordeCol[ 3 ]; uniform vec2 uBordeCono[ 3 ];';
// la misma cuenta que un SpotLight de three sin sombra (getSpotLightInfo con decaimiento 0), en espacio de vista
const BORDE_FS = `
	for ( int i = 0; i < 3; i ++ ) {
		directLight.direction = normalize( ( viewMatrix * vec4( uBordePos[ i ], 1.0 ) ).xyz - geometryPosition );
		float bordeAt = smoothstep( uBordeCono[ i ].x, uBordeCono[ i ].y, dot( directLight.direction, normalize( ( viewMatrix * vec4( uBordeDir[ i ], 0.0 ) ).xyz ) ) );
		directLight.color = uBordeCol[ i ] * bordeAt; directLight.visible = bordeAt > 0.0;
		if ( bordeAt > 0.0 ) RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}`;
/** Pone el parche de bordes en un material con luces (encadenado al onBeforeCompile que ya tenga). Sin efecto mientras BORDE.on sea false. */
function conBorde(m) {
  if (!m || !m.isMeshStandardMaterial || BORDE.mats.has(m)) return; BORDE.mats.add(m);
  const antes = m.onBeforeCompile, propia = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey, clave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    antes.call(this, sh, r); if (!BORDE.on) return;
    Object.assign(sh.uniforms, BORDE.u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_pars_begin>', '#include <lights_pars_begin>\n' + BORDE_PARS).replace('#include <lights_fragment_maps>', BORDE_FS + '\n#include <lights_fragment_maps>');
  };
  m.customProgramCacheKey = function () { return (propia ? clave.call(this) : antes.toString()) + (BORDE.on ? '|borde' : ''); };
}

const v = new THREE.Vector3(), v2 = new THREE.Vector3();
export const CAM = Object.fromEntries(CAMERAS.map((c, i) => [c.key, i]));
/**
 * Planos propios del juego (el visor no los ve). `medio`: plano americano del pesista que se prepara en el llamado (de las
 * rodillas para arriba). `caida`: sigue el punto medio entre la cadera y la barra suelta. `manga`: la manga derecha de la
 * barra de cerca, para el cambio de carga. `punto` (función) reemplaza a los huesos; `dAbs` es la distancia en metros.
 */
export const PLANOS = {
  medio: { key: 'medio', at: ['Neck', 'Hips'], up: -.05, d: 2.05, az: .5, el: .05, fov: 22 },
  caida: { key: 'caida', at: [], up: 0, dAbs: 4.6, az: .72, el: .14, fov: 30, punto: 'caida' },
  manga: { key: 'manga', at: [], up: 0, dAbs: 1.45, az: 1.05, el: .2, fov: 30, punto: 'manga' },
};

export class Escena {
  constructor(canvas, Q, { reduceMotion = false } = {}) {
    this.canvas = canvas; this.Q = Q; this.reduceMotion = reduceMotion;
    // tope: píxeles que se dibujan como máximo; libre: sin el límite de la densidad de la pantalla (calibración y banco).
    // sombras: la clave proyecta sombra. lodFijo: píxeles por metro forzados (banco). directo: una pasada al lienzo (Q.directo).
    this.tope = Q.maxPixels; this.libre = false; this.sombras = true; this.lodFijo = null; this.directo = !!Q.directo;
    // MSAA del propio lienzo: lo usa el camino directo. En una placa por mosaicos (Apple, teléfonos) se resuelve dentro del
    // mosaico y casi no cuesta; en el camino con post (Media y Alta) el pase final lo pisa entero y no agrega nada visible.
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap; r.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#070b16'); this.scene.fog = new THREE.FogExp2('#0b1226', .015);
    this._niebla = { hdr: this.scene.fog.color.clone(), directo: tonoJS(this.scene.fog.color) };      // en el camino directo la niebla se mezcla ya en colores de pantalla
    if (canvas.parentElement && typeof document !== 'undefined') { const d = this.velo = document.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.style.cssText = `position:absolute;inset:0;pointer-events:none;background:${vineta()}`; canvas.after(d); }
    this.rig = new CameraRig(canvas, { reduceMotion, interactive: false });
    this.trace = new BarTrace(); this.scene.add(this.trace.group);
    const coarse = matchMedia('(pointer:coarse)').matches, aniso = Math.min(Q.aniso || 4, r.capabilities.getMaxAnisotropy());
    this.arena = new Arena({ tex: coarse || Q.tex <= 1024 ? 1024 : 2048, aniso, reduceMotion }); this.scene.add(this.arena.group);
    this.lighting = new Lighting(this.scene);
    this.barbell = new Barbell({ aniso, texSize: coarse ? 512 : 1024 }); this.scene.add(this.barbell.group);
    this.arena.setQuality(Q); this.lighting.setQuality(Q);
    this.arena.group.traverse(o => { o.castShadow = false; if (o.material) [].concat(o.material).forEach(conTono); });      // en la sombra, solo el pesista y la barra
    this._capaSombra();
    this._post(Q); this._modo();
    this.atletas = {}; this.cargas = {}; this.tls = {}; this.activo = null; this.id = null; this.poses = null; this.plano = null; this.sombra = 4;
    this.barY = PLATE_R; this._py = [PLATE_R, PLATE_R]; this.kg = 0;
    this.barbell.setLoad(100); this._sombraBarra(); this.barbell.setPosition(v.set(0, PLATE_R, 0)); this.barbell.settle(PLATE_R);
    this.resize(); this.lighting.bake(r, [this.barbell.group, this.trace.group]);
    // después de hornear el entorno (que la ve igual): la arena fija en pocas mallas
    const A = this.arena; this.fijos = juntarFijos(A.group, new Set([A.impostors, A.crowd, A.bokeh, A.flashMesh, ...A.beamMeshes, ...(A.lamps || [])].filter(Boolean)));
    this.barato = null; this.setBarato(Q.barato);
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  /**
   * Escena barata por píxel (ver arriba, Q.barato). `B`: {piso, haces, bordes} o null (como el visor). Cambia programas:
   * solo en la carga (setCalidad) o en el banco, seguido de precalentar o compilar. Lo caro (hornear) se hace una vez.
   */
  setBarato(B) {
    this.barato = B || null; const P = this._barato ||= this._prepararBarato(), A = this.arena, L = this.lighting;
    const piso = !!(B && B.piso && P.piso), haces = (B && B.haces) || false, bordes = (B && B.bordes) || 'luces';
    if (P.piso) { const p = P.piso; p.tarima.material = piso ? p.matT : p.origT; p.esc.material = piso ? p.matE : p.origE; p.sombra.visible = piso; }
    const cortos = haces === 'cortos', ver = haces !== 'no' && !!this.Q.beams;
    A.beamMeshes.forEach((m, i) => { m.material = cortos ? P.haces[i] : P.hacesOrig[i]; m.geometry = cortos ? P.cono : P.conoOrig; m.visible = ver; });
    for (const l of [L.rimA, L.rimB, L.hair]) l.visible = bordes === 'luces';
    const on = bordes === 'material'; if (on !== BORDE.on) { BORDE.on = on; for (const m of BORDE.mats) m.needsUpdate = true; }
    this.sombra = 4;
  }
  /** Materiales que la escena tiene guardados para otro modo de setBarato (fuera de la escena ahora): para que el banco libere sus programas. */
  get materialesAparte() {
    const P = this._barato; if (!P) return []; const o = [...P.haces, ...P.hacesOrig];
    if (P.piso) o.push(...P.piso.origT, ...P.piso.origE, ...P.piso.matT, ...P.piso.matE, P.piso.sombra.material);
    return [...new Set(o)];
  }
  /** Una sola vez: hornea el piso, arma los haces cortos y los uniforms de los bordes. Con los contraluces prendidos. */
  _prepararBarato() {
    const A = this.arena, L = this.lighting, rims = [L.rimA, L.rimB, L.hair], vis = rims.map(l => l.visible);
    rims.forEach(l => { l.visible = true; });
    BORDE.u ||= {
      uBordePos: { value: rims.map(l => l.position.clone()) }, uBordeDir: { value: rims.map(l => l.position.clone().sub(l.target.position).normalize()) },
      uBordeCol: { value: rims.map(l => new THREE.Vector3(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity)) }, uBordeCono: { value: rims.map(l => new THREE.Vector2(Math.cos(l.angle), Math.cos(l.angle * (1 - l.penumbra)))) },
    };
    this.barbell.group.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(conBorde); });
    const hacesOrig = A.beamMeshes.map(m => m.material);
    const haces = hacesOrig.map(o => new THREE.ShaderMaterial({ name: 'haz barato', vertexShader: o.vertexShader, fragmentShader: HAZ_FS, uniforms: { uColor: o.uniforms.uColor, uStrength: o.uniforms.uStrength }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }));
    let piso = null; try { piso = this._hornearPiso(); } catch (e) { console.warn('piso horneado:', e); }
    rims.forEach((l, i) => { l.visible = vis[i]; });
    return { hacesOrig, haces, conoOrig: A.beamMeshes[0]?.geometry, cono: conoCorto(), piso };
  }
  /**
   * Luz horneada de la tarima (4 × 4 m) y de la alfombra del escenario (13 × 11 m): se dibuja cada una sola, desde arriba
   * con una cámara ortográfica que cubre justo su cara de arriba (las UV de esa cara de la caja van igual que la imagen), a
   * un destino lineal de media precisión: el color de salida del material físico con todas las luces y el entorno, sin
   * tono ni sombras. En el juego esa cara usa un material sin luces con esa textura. La sombra del pesista y la barra va en
   * una lámina con ShadowMaterial apenas arriba de la tarima, con la opacidad que sale de hornear el centro con y sin la
   * clave. Devuelve null si la placa no puede dibujar en media precisión (queda el piso de siempre).
   */
  _hornearPiso() {
    const r = this.renderer, A = this.arena, ext = r.extensions;
    if (!A.tarima || !A.escenario || !(ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'))) return null;
    const ocultos = []; this.scene.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; ocultos.push(o); } });
    const aniso = Math.min(this.Q.aniso || 4, r.capabilities.getMaxAnisotropy()), fondo = this.scene.background;
    const hornear = (malla, ancho, largo, px, y, tipo = THREE.HalfFloatType, x0 = 0, z0 = 0) => {
      const media = tipo === THREE.HalfFloatType, h = Math.max(1, Math.round(px * largo / ancho));
      const rt = new THREE.WebGLRenderTarget(px, h, { type: tipo, generateMipmaps: media, minFilter: media ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter, magFilter: media ? THREE.LinearFilter : THREE.NearestFilter, depthBuffer: true });
      rt.texture.anisotropy = aniso; rt.texture.name = 'luz horneada';
      const cam = new THREE.OrthographicCamera(-ancho / 2, ancho / 2, largo / 2, -largo / 2, .05, 2); cam.up.set(0, 0, -1); cam.position.set(x0, y + .5, z0); cam.lookAt(x0, y, z0); cam.updateMatrixWorld();
      malla.visible = true; r.shadowMap.needsUpdate = true;      // la sombra se rehace sin nadie que la proyecte: sale sin sombras
      r.setRenderTarget(rt); r.render(this.scene, cam); r.setRenderTarget(null); malla.visible = false;
      return rt;
    };
    let res;
    try {
      this.scene.background = null;
      const tT = hornear(A.tarima, 4, 4, this.Q.tex <= 1024 ? 1024 : 2048, 0), tE = hornear(A.escenario, 13, 11, 512, -.1);
      // opacidad de la sombra: cuánto baja el color de pantalla en el centro de la tarima sin la luz clave
      let op = .45;
      if (ext.has('EXT_color_buffer_float')) {
        const medio = () => { const rt = hornear(A.tarima, 1.2, 1.2, 8, 0, THREE.FloatType), b = new Float32Array(8 * 8 * 4); r.readRenderTargetPixels(rt, 0, 0, 8, 8, b); rt.dispose(); const c = new THREE.Color(); for (let i = 0; i < 64; i++) { c.r += b[i * 4] / 64; c.g += b[i * 4 + 1] / 64; c.b += b[i * 4 + 2] / 64; } return c; };
        const k = this.lighting.key, I = k.intensity, con = medio(); k.intensity = 0; const sin = medio(); k.intensity = I;
        const lum = c => .2126 * c.r + .7152 * c.g + .0722 * c.b, a = lum(tonoJS(con)), b = lum(tonoJS(sin));
        if (a > 1e-4 && Number.isFinite(b)) { this.opacidadCruda = +(1 - b / a).toFixed(3); op = Math.min(.9, Math.max(.1, 1 - b / a)); }
      }
      const tarima = A.tarima, esc = A.escenario, origT = tarima.material, origE = esc.material;
      const basico = (rt, nombre) => new THREE.MeshBasicMaterial({ name: nombre, map: rt.texture });
      const matT = origT.slice(), matE = origE.slice(); matT[2] = basico(tT, 'tarima horneada'); matE[2] = basico(tE, 'alfombra horneada');
      const sombra = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ name: 'sombra en la tarima', opacity: op, fog: false, depthWrite: false, toneMapped: false }));
      sombra.rotation.x = -Math.PI / 2; sombra.position.y = .0015; sombra.receiveShadow = true; sombra.renderOrder = -1; sombra.visible = false; sombra.name = 'sombra en la tarima'; this.scene.add(sombra);
      res = { tarima, esc, origT, origE, matT, matE, sombra, opacidad: +op.toFixed(3), texturas: [tT, tE] };
    } finally {
      this.scene.background = fondo; for (const o of ocultos) o.visible = true; r.shadowMap.needsUpdate = true; this.sombra = 4;
    }
    return res;
  }
  _post(Q) {
    const p = this.post = new Post(this.renderer, this.scene, this.rig.camera, Q); p.reduceMotion = this.reduceMotion; p.motionObject = this.barbell.group; p.bokehObject = this.arena.bokeh;
    // Sin oclusión ni profundidad de campo ningún pase lee la profundidad de la escena: no se resuelve (una pasada de pantalla
    // completa menos por cuadro) ni se guarda la del MSAA (cuatro muestras por píxel que no salen de la memoria de la placa).
    const lee = !!(Q.ao || Q.dof || Q.mblur); p.sceneRT.resolveDepthBuffer = lee; p.sceneRT.storeMultisampledDepthBuffer = lee;
  }
  /** Qué entra en la pasada de sombra (CAPA_SOMBRA): ver arriba. La arena se decide una vez, con el cono de la clave. */
  _capaSombra() {
    const L = this.lighting; for (const l of [L.key, L.key2]) l.shadow.camera.layers.set(CAPA_SOMBRA);
    this.scene.updateMatrixWorld(true); L.key.shadow.updateMatrices(L.key);
    const c = L.key.shadow.camera, cono = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    let n = 0; this.arena.group.traverse(o => { if (o.isMesh && o.receiveShadow && !o.isSkinnedMesh && !(o.material && o.material.transparent) && cono.intersectsObject(o)) { o.layers.enable(CAPA_SOMBRA); n++; } });
    this.recibenSombra = n; this._sombraBarra();
  }
  /** Copias de sombra de las piezas de la barra que no la tienen (setLoad arma discos nuevos). */
  _sombraBarra() {
    this.barbell.group.traverse(o => {
      if (o.isMesh) [].concat(o.material).forEach(conBorde);      // discos nuevos: con el parche de bordes antes de compilarse
      if (!o.isMesh || o.userData.sombra || o.layers.mask === 1 << CAPA_SOMBRA || !o.castShadow) return;
      const p = new THREE.Mesh(copiaDeSombra(o.geometry), SOMBRA_MAT); p.name = 'sombra'; p.layers.set(CAPA_SOMBRA); p.castShadow = true; p.receiveShadow = false; p.frustumCulled = o.frustumCulled;
      o.add(p); o.userData.sombra = p;
    });
  }
  /** Camino directo o con post: tono en los materiales (y niebla en colores de pantalla) o en el pase final. Cambia programas: solo en la carga. */
  _modo() {
    const r = this.renderer, d = this.directo; r.toneMapping = d ? THREE.CustomToneMapping : THREE.NoToneMapping; r.toneMappingExposure = EXPOSICION;
    this.scene.fog.color.copy(d ? this._niebla.directo : this._niebla.hdr); if (this.velo) this.velo.style.display = d ? '' : 'none';
    // los discos de luz no leen la profundidad sin desenfoque, pero el material la tiene enlazada: dibujando directo, enlazar la
    // del destino de post la crearía con un tamaño viejo, y después ese destino queda con piezas de distinto tamaño (0x506)
    if (d) BOKEH.tDepth.value = null;
  }
  /** Cambia de camino (banco). Como setCalidad, recompila: después hay que precalentar o compilar. */
  setDirecto(on) { this.directo = !!on; this._modo(); this.sombra = 4; }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, Q = this.Q; if (!w || !h) return;
    const porTope = Math.sqrt(this.tope / (w * h)), pr = this.libre ? porTope : Math.min(window.devicePixelRatio || 1, Q.dpr, porTope);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.rig.setAspect(w / h); this.post.setSize(w, h, pr); this.vertical = h > w; this.sombra = 4;
  }
  /**
   * Presupuesto de píxeles por cuadro. Solo cambia el tamaño de los destinos: no compila nada. `libre`: dibuja esos píxeles
   * aunque sean más que los de la pantalla (para medir); si no, nunca más que la densidad de la pantalla ni que la de la calidad.
   */
  setTope(px, libre = false) { this.tope = Math.max(1e4, px); this.libre = libre; this.resize(); }
  /** Megapíxeles que se dibujan por cuadro. */
  get megapixeles() { const g = this.renderer.getContext(); return g.drawingBufferWidth * g.drawingBufferHeight / 1e6; }
  /** Megapíxeles del lienzo a la densidad de la pantalla (con el tope de densidad de la calidad en uso). */
  get nativoMP() { const d = Math.min(window.devicePixelRatio || 1, this.Q.dpr); return this.canvas.clientWidth * this.canvas.clientHeight * d * d / 1e6; }
  /**
   * Cambia de calidad sin recargar: pases de post, sombras, público y resolución. No reconstruye geometría ni texturas.
   * Rehace los pases y puede cambiar los programas de todos los materiales: solo durante la carga, seguido de precalentar().
   */
  setCalidad(Q) {
    if (Q !== this.Q) { this.Q = Q; this.arena.setQuality(Q); this.lighting.setQuality(Q); this.post.dispose(); this._post(Q); this._sombras(); this.directo = !!Q.directo; this._modo(); this.setBarato(Q.barato); }
    this.tope = Q.maxPixels; this.libre = false; this.resize();
  }
  _sombras() { const L = this.lighting, Q = this.Q; L.key.castShadow = this.sombras && Q.shadow > 0; L.key2.castShadow = this.sombras && Q.shadow2 > 0; }
  /**
   * Prende o apaga las sombras: sin luces que proyecten, three saltea la pasada de sombra y usa los programas sin sombra
   * de cada material. Después de precalentar() los dos juegos de programas ya existen y el cambio no compila nada.
   */
  setSombras(on) { this.sombras = !!on; this._sombras(); this.sombra = 4; }
  /**
   * Deja compilado y usado una vez todo lo que la calidad en uso puede dibujar, con sombras y sin ellas, para los dos
   * modelos (estén a la vista o no). Primero compila en paralelo (KHR_parallel_shader_compile, sin trabar la página) con el
   * destino donde se va a dibujar (el lienzo en el camino directo, el de la escena con post), porque el programa de cada
   * material depende del destino; después dibuja un cuadro de cada
   * variante con todo a la vista: ahí suben texturas y buffers y se compilan los materiales de la pasada de sombra y los
   * pases de pantalla, que compile() no ve. Se llama en la carga, con la imagen tapada o detrás de un panel.
   */
  async precalentar() {
    const r = this.renderer, cam = this.rig.camera, haySombra = this.Q.shadow > 0, antes = this.sombras;
    // un disco de cada clase y un collarín, a la vista mientras se compila y se dibuja: el cambio de carga animado arma
    // discos nuevos en medio de la partida y así no crea texturas ni compila nada (las caras se dibujan en un lienzo 2D)
    const muestra = new THREE.Group(); PLATES.forEach((p, i) => { const d = this.barbell._plate(p); d.position.x = .7 + i * .03; muestra.add(d); }); muestra.add(this.barbell._collar());
    this.barbell.sides[1].inner.add(muestra);
    // con el parche de bordes antes de compilarse: three no recompila un material ya compilado si después cambia su
    // customProgramCacheKey, y los discos que el cambio de carga arme con estos materiales saldrían sin contraluz
    muestra.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(conBorde); });
    const compilar = con => {
      this.sombras = con; this._sombras(); r.setRenderTarget(this.directo ? null : this.post.sceneRT);
      try { return r.compileAsync(this.scene, cam); } finally { r.setRenderTarget(null); this.sombras = antes; this._sombras(); }
    };
    // si un programa no termina nunca (controlador roto), no se cuelga la carga: se sigue y se compilará al usarlo
    for (const con of haySombra ? [true, false] : [false]) await Promise.race([compilar(con), new Promise(res => setTimeout(res, 8000))]);
    const at = Object.values(this.atletas), vis = at.map(a => a.root.visible), traza = this.trace.group.visible;
    try {
      for (const a of at) a.root.visible = true;
      if (!this.trace.meshes.length) this.trace.buildPoints([{ y: 1, z: 0 }, { y: 1.2, z: .05 }, { y: 1.4, z: 0 }]);
      this.trace.setCount(2); this.trace.group.visible = true;
      for (const con of [!antes, antes]) { if (con && !haySombra) continue; this.sombras = con; this._sombras(); r.shadowMap.needsUpdate = true; this._dibujar(0); }
    } finally {
      at.forEach((a, i) => { a.root.visible = vis[i]; }); this.trace.setCount(0); this.trace.group.visible = traza; this.sombras = antes; this._sombras(); muestra.removeFromParent();
    }
    this.sombra = 4; this.cuadro(0, true);      // el último cuadro dibujado es el de verdad
  }
  /** Carga (una sola vez) el modelo que usa un pesista. Los dos modelos quedan en memoria. */
  cargar(id) {
    const mod = PLANTEL[id].modelo;
    return this.cargas[mod] ||= Athlete.load(mod, this.poses[mod], { aniso: Math.min(this.Q.aniso || 4, this.renderer.capabilities.getMaxAnisotropy()), maxTex: this.Q.tex })
      .then(a => { a.root.visible = false; a.root.traverse(o => { if (o.isMesh && o.castShadow) o.layers.enable(CAPA_SOMBRA); if (o.isMesh) [].concat(o.material).forEach(conBorde); }); this.scene.add(a.root); this.atletas[mod] = a; return a; });
  }
  /** Pone en escena a un pesista (o a nadie, con null). Marangi comparte la instancia de Brenner con la tela de color plano. */
  async mostrar(id) {
    if (id === null) { for (const a of Object.values(this.atletas)) a.root.visible = false; this.activo = null; this.id = null; this.sombra = 4; return; }
    const a = await this.cargar(id), f = PLANTEL[id];
    for (const b of Object.values(this.atletas)) b.root.visible = b === a;
    a.setClothFlat(f.tela ? new THREE.Color(f.tela) : null);
    this.activo = a; this.id = id; this.P = this.poses[f.modelo]; this.rig.setAthleteHeight(this.P.h); this.sombra = 4;
  }
  setCarga(kg, lev) { if (kg !== this.kg) { this.kg = this.barbell.setLoad(kg); this._sombraBarra(); this.sombra = 4; } if (lev && this.P) this.barbell.setGrip(lev === 's' ? this.P.grip?.snatch : this.P.grip?.clean); }
  /** Posa al pesista en el instante `t` (s) de un arranque que se repite sin parar (calibración y banco de medición). */
  bucle(t, dt = 0) {
    if (!this.activo) return; const G = tramo(this.P, 'snatch'), tau = ((t % G.fin) + G.fin) % G.fin, salto = tau < this._tau; this._tau = tau;
    this.posar({ seg: G.nombre, s: G.inv(tau), tau, base: G.base, primero: true }, 's', salto ? 0 : dt);      // al volver a empezar, la barra se apoya sin dinámica
  }
  /**
   * Costo de un cuadro (ms) sin esperar a la pantalla: posa, dibuja y lee un píxel del lienzo, que obliga a la placa a
   * terminar el cuadro antes de seguir. Es procesador más placa en serie (en el juego corren en paralelo: el número real
   * es algo menor). Con el pesista haciendo el arranque en bucle desde `t0`. `extra`: trabajo que se suma a cada cuadro.
   * @returns {{ms:number, min:number, p90:number, n:number}} mediana, mínimo y percentil 90 de `n` cuadros
   */
  costo({ n = 16, calienta = 3, tope = 500, t0 = 1.3, dt = 1 / 60, extra = null } = {}) {
    const g = this.renderer.getContext(), px = this._px ||= new Uint8Array(4), ms = [], ini = performance.now(); let t = t0;
    for (let k = 0; ms.length < n; k++) {
      const a = performance.now();
      this.bucle(t, dt); t += dt; this.cuadro(dt, true); extra?.();
      this.renderer.state.bindFramebuffer(g.READ_FRAMEBUFFER, null); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
      const b = performance.now(); if (k >= calienta || b - a > 150) ms.push(b - a);      // un cuadro de más de 150 ms no es de calentamiento: la máquina es lenta
      if (b - ini > tope && ms.length >= 2) break;      // se acabó el tiempo: alcanza con dos cuadros
    }
    ms.sort((x, y) => x - y); return { ms: ms[ms.length >> 1], min: ms[0], p90: ms[Math.min(ms.length - 1, Math.floor(ms.length * .9))], n: ms.length };
  }
  _tl(lev) { const k = PLANTEL[this.id].modelo + lev; return this.tls[k] ||= new Timeline(this.P, lev, 'split', this.activo.barPos); }
  /**
   * Posa al pesista y la barra. `pose`: {seg, s, tau, base, primero} de sequence.js. `dt` (s): 0 = sin dinámica de la barra.
   * La aceleración que flexiona la barra sale de la posición que realmente se dibuja, porque el ritmo es variable.
   */
  posar(pose, lev, dt = 0, temblor = 0, t = 0) {
    const a = this.activo; if (!a) return;
    aplicarEsfuerzo(a, temblor, t, this.reduceMotion);
    const g = pose.base + pose.s, i = Math.floor(g); a.setPair(i, i + 1, g - i);
    a.barWorld(v); if (pose.primero) this._tl(lev).barFix(pose.tau, v);
    if (v.y < PLATE_R) v.y = PLATE_R;
    if (this.barbell.group.rotation.x) this.barbell.group.rotation.x = 0;      // venía rodando (barra suelta)
    this.barbell.setPosition(v); this.barY = v.y; this.barZ = v.z; this.rig.barY = v.y; this.rig.barAhead = v.y; this.rig.headY = a.boneWorld('Head', v2).y + .14;
    if (dt > 0 && dt < .1) { const acc = (v.y - 2 * this._py[0] + this._py[1]) / (dt * dt); this.barbell.step(dt, v.y, acc); } else this.barbell.settle(v.y);
    this._py[1] = dt > 0 ? this._py[0] : v.y; this._py[0] = v.y; this.sombra = 3;
  }
  /**
   * El pesista en una mezcla de poses del clip (caídas y bajadas, game/caida.js): {i, j, u} la pose de partida, `k` la de
   * destino con peso `w`, y la raíz corrida `dz`, `dy` (m). No mueve la barra: después del fallo la barra va suelta.
   */
  posarMezcla(p) {
    const a = this.activo; if (!a) return;
    aplicarEsfuerzo(a, 0, 0, true); a.root.position.z += p.dz || 0; a.root.position.y += p.dy || 0;
    a.setMix(p.i, p.j, p.u, p.k, p.w); this.rig.headY = a.boneWorld('Head', v2).y + .14; this.sombra = 3;
  }
  /**
   * Barra suelta en {y, z, ang} (m y radianes: rueda sobre su eje). Con `dt` la flexión de la barra sigue la aceleración
   * del centro (en el aire, los extremos se enderezan; contra la tarima, el golpe la hace vibrar); sin `dt`, quieta.
   */
  barraSuelta(b, dt = 0) {
    v.set(0, b.y, b.z); this.barbell.setPosition(v); this.barbell.group.rotation.x = b.ang || 0;
    this.barY = b.y; this.barZ = b.z; this.rig.barY = b.y; this.rig.barAhead = b.y;
    if (dt > 0 && dt < .1) { const acc = (b.y - 2 * this._py[0] + this._py[1]) / (dt * dt); this.barbell.step(dt, b.y, acc); } else this.barbell.settle(b.y);
    this._py[1] = dt > 0 ? this._py[0] : b.y; this._py[0] = b.y; this.sombra = 3;
  }
  /**
   * Cambio de carga animado, con la barra en la tarima: salen por la manga las piezas que cambian, de la de afuera hacia
   * adentro (el collarín también, si hay que tocar un disco de adentro); después entran las nuevas, de adentro hacia afuera,
   * y el collarín cierra. Los dos lados a la vez. No crea geometría, materiales ni texturas: precalentar() dejó un disco de
   * cada clase hecho. Devuelve null si no cambia nada, o {dur, en(t)} donde en(t) acomoda las piezas y devuelve
   * {kg: lo que hay cargado en ese instante, llegadas: piezas que ya entraron, salidas: piezas que ya empezaron a salir}.
   */
  cambioDeCarga(kg1) {
    const L0 = loadout(this.kg), L1 = loadout(kg1);
    const piezas = L => [...L.inner.map(p => p.kg), 'c', ...L.outer.map(p => p.kg)], peso = x => (x === 'c' ? COLLAR_KG : x);
    const A = piezas(L0), B = piezas(L1); let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p++;
    const sale = A.length - p, entra = B.length - p; if (!sale && !entra) return null;
    const DS = .2, DE = .25, LEJOS = .55, T1 = sale * DS + .1, kg0 = this.kg, kg1r = L1.total;
    const suave = x => { const t = Math.min(1, Math.max(0, x)); return 1 - (1 - t) * (1 - t); };
    let viejas = this.barbell.sides.map(sd => sd.load.children.map(o => ({ o, x: o.position.x }))), nuevas = null, t = -1;
    const en = tt => {
      if (tt < t) tt = t; t = tt; let kg = kg0, llegadas = 0, salidas = 0;
      for (let k = 0; k < sale; k++) {
        const i = A.length - 1 - k, u = (tt - k * DS) / DS; if (u <= 0) continue; salidas++; kg -= 2 * peso(A[i]);
        if (viejas) for (const lado of viejas) { const q = lado[i]; if (!q) continue; q.o.position.x = q.x + LEJOS * suave(u); q.o.visible = u < 1; }
      }
      if (tt >= T1) {
        if (!nuevas) { this.setCarga(kg1); viejas = null; nuevas = this.barbell.sides.map(sd => sd.load.children.map(o => ({ o, x: o.position.x }))); }
        kg = kg0 - 2 * A.slice(p).reduce((s, x) => s + peso(x), 0);
        for (let k = 0; k < entra; k++) {
          const i = p + k, u = (tt - T1 - k * DE) / DE;
          for (const lado of nuevas) { const q = lado[i]; if (!q) continue; q.o.visible = u > 0; q.o.position.x = q.x + LEJOS * (1 - suave(u)); }
          if (u >= 1) { llegadas++; kg += 2 * peso(B[i]); }
        }
      }
      this.sombra = 3; return { kg: tt >= T1 + entra * DE ? kg1r : Math.round(kg), llegadas, salidas };
    };
    en(0); return { dur: T1 + entra * DE + .05, en, sale, entra };
  }
  /** Altura del centro de la barra apoyada en la tarima con la carga de ahora. */
  get pisoBarra() { return Math.max(.05, this.barbell.plateR); }
  /** Distancia (m) entre el centro de la barra dibujada y el punto medio de las manos: para la prueba automática. */
  manosBarra() { const a = this.activo; if (!a) return 0; a.midWorld(['LeftHand', 'RightHand'], v2); const b = this.barbell.group.position; return Math.hypot(v2.y - b.y, v2.z - b.z); }
  /** Altura (m) de la barra en una muestra global del clip (para las líneas de ayuda). */
  alturaMuestra(g) { return this.activo?.barPos[g]?.y ?? 0; }
  camara(clave) { this.plano = null; this.encuadre = null; this.rig.setShot(null); this.rig.cut(CAM[clave] ?? 0); }
  /**
   * Primer plano por clave (SHOTS del visor o PLANOS del juego). `encuadre`: {x, y} fracción del lienzo (desde arriba a la
   * izquierda) donde tiene que quedar el sujeto, para dejarlo en la parte libre cuando un panel tapa un costado o el pie.
   */
  primerPlano(clave, encuadre = null) {
    const base = PLANOS[clave] || SHOTS.find(s => s.key === clave) || null, h = this.P?.h || 1.75;
    const dAbs = encuadre?.dAbs || base?.dAbs, sh = base && dAbs ? { ...base, d: dAbs / h } : base;
    this.plano = sh; this.encuadre = encuadre; this.rig.setShot(sh); if (sh) this._apuntar();      // setShot primero: el corrimiento usa el ángulo del plano
  }
  _apuntar() {
    const a = this.activo, sh = this.plano; if (!sh) return;
    if (sh.punto === 'manga') v2.copy(this.barbell.group.position).add(v.set(.92, .02, 0));
    else if (sh.punto === 'caida') { if (a) a.boneWorld('Hips', v2); else v2.set(0, 1, 0); v2.lerp(this.barbell.group.position, .5); v2.x = 0; v2.y = Math.max(.85, v2.y); }
    else { if (!a) return; const huesos = sh.at.filter(k => k !== 'Bar'), nb = sh.at.length - huesos.length; a.midWorld(huesos, v2).multiplyScalar(huesos.length); if (nb) v2.add(this.barbell.group.position); v2.multiplyScalar(1 / sh.at.length); v2.y += sh.up * this.P.h; }
    const e = this.encuadre;
    if (e) {      // el blanco de la cámara se corre para que el sujeto quede en (x, y) del lienzo
      const R = this.rig, vh = 2 * sh.d * R.height * R.zoom * Math.tan(THREE.MathUtils.degToRad(sh.fov) / 2), vw = vh * R.camera.aspect;
      v2.x += Math.cos(R.az) * (.5 - e.x) * vw; v2.z -= Math.sin(R.az) * (.5 - e.x) * vw; v2.y += (e.y - .5) * vh;
    }
    this.rig.shotAt.copy(v2);
  }
  /** Punto de la barra en píxeles CSS del lienzo (para las ayudas pegadas a la barra). `y`: otra altura en metros. */
  pantalla(y = this.barY, x = 0) {
    v.set(x, y, this.barZ ?? 0).project(this.rig.camera);
    return { x: (v.x + 1) / 2 * this.canvas.clientWidth, y: (1 - v.y) / 2 * this.canvas.clientHeight };
  }
  /**
   * Nivel de detalle del pesista según los píxeles por metro con que se lo ve (lo mismo que hace el visor): en plano general
   * los triángulos del cuerpo y del pelo miden menos de un píxel y se dibuja el índice simplificado (30 % y 45 %); en los
   * primeros planos, el completo. También apaga las normales de detalle de piel y tela cuando no se resuelven.
   */
  _detalle() {
    const a = this.activo; if (!a) return; const cam = this.rig.camera;
    const px = this.lodFijo ?? this.post.H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(.3, cam.position.distanceTo(a.boneWorld('Spine1', v2)));
    if (a.setScreenScale(px)) this.sombra = Math.max(this.sombra, 2);
  }
  /** Avanza cámara y entorno; dibuja si `pintar`. */
  cuadro(dt, pintar = true) {
    this._apuntar(); this.rig.update(dt); this.trace.face(this.rig.camera); this.post.focus = this.rig.focusDistance; this.arena.update(dt, this.rig.camera); this._detalle();
    if (!pintar) return;
    const r = this.renderer; r.shadowMap.needsUpdate = this.sombra > 0; if (this.sombra > 0) this.sombra--;
    this._dibujar(dt);
  }
  _dibujar(dt) {
    if (this.directo) { const r = this.renderer; r.setRenderTarget(null); r.render(this.scene, this.rig.camera); return; }
    this.post.motion.set(0, 0); this.post.render(dt);
  }
}
