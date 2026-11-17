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
import { PLANTEL, JUGADOR } from './roster.js';
import { aplicarEsfuerzo } from './effort.js';
import { tramo } from './sequence.js';
import { CamaraViva } from './camara_viva.js';
import { Ambiente } from './ambiente.js';
import { Jueces } from './jueces.js';
import { Reflejo } from './reflejo.js';
import { Look, GRADO_LOOK, SALA } from './look.js';
import { Publico } from './publico.js';
import { GESTO } from './caida.js';

/**
 * Lo que el pase final de post.js hace después del AgX (saturación, contraste, gamma de sombras y tinte frío/cálido), como
 * tono «a medida» de three: en el camino directo cada material lo aplica a su color antes de pasarlo a sRGB. Los valores
 * son los de los uniforms del pase final (uSat 1,04, uContrast 1,03, uShadowGamma 0,86). La exposición (1,12) la pone
 * renderer.toneMappingExposure, que AgXToneMapping ya usa. Solo cambia CustomToneMapping, que el visor no usa.
 */
const GL = GRADO_LOOK;      // la gradación del juego (look.js): la misma en el pase final, acá y en tonoJS
const GRADO = `vec3 CustomToneMapping( vec3 color ) {
	color = AgXToneMapping( color );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = mix( vec3( l ), color, ${GL.sat.toFixed(3)} );
	color = max( ( color - 0.5 ) * ${GL.con.toFixed(3)} + 0.5, 0.0 );
	color = mix( pow( color, vec3( ${GL.gam.toFixed(3)} ) ), color, smoothstep( 0.0, 0.5, l ) );
	color *= mix( vec3( ${GL.frio.map(x => x.toFixed(3)).join(', ')} ), vec3( ${GL.calido.map(x => x.toFixed(3)).join(', ')} ), smoothstep( 0.05, 0.85, l ) );
	return color;
}`;
const VACIA = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
if (THREE.ShaderChunk.tonemapping_pars_fragment.includes(VACIA)) THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(VACIA, GRADO);
export const EXPOSICION = GL.exp;

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
  const l = .2126 * v[0] + .7152 * v[1] + .0722 * v[2], ti = s(.05, .85, l), T = GL.frio.map((f, i) => f + (GL.calido[i] - f) * ti);
  v = v.map(x => Math.max(0, (l + (x - l) * GL.sat - .5) * GL.con + .5)).map((x, i) => (Math.pow(x, GL.gam) + (x - Math.pow(x, GL.gam)) * s(0, .5, l)) * T[i]);
  return new THREE.Color().setRGB(...v.map(x => new THREE.Color().setRGB(x, x, x).convertLinearToSRGB().r));
}
/**
 * Viñeta y negros levantados del pase final, como gradiente CSS encima del lienzo: el pase hacía col·(1−v) en lineal y
 * después col·0,98 + 0,02 en sRGB; una capa de alfa a y color C da col·(1−a) + C·a, así que a = 1 − 0,98·(1−v)^(1/2,2)
 * y C·a = 0,02 (constante: el navegador interpola el gradiente premultiplicado). La elipse es la de la imagen, como en el pase.
 */
export function vineta() {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const paradas = [0, .35, .5, .6, .7, .8, .9, 1].map(t => { const v = GL.vin * s(.14, .66, .5 * t * t), a = 1 - (1 - GL.negro) * Math.pow(1 - v, 1 / 2.2), c = Math.round(255 * Math.min(1, GL.negro / a)); return `rgba(${c},${c},${c},${a.toFixed(4)}) ${Math.round(t * 100)}%`; });
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
export const CAPA_SOMBRA = 2; const SOMBRA_MAT = new THREE.MeshBasicMaterial(), sinGrupos = new WeakMap();
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
export const CURVA_HAZ = { A: 1.06, X0: .019, P: .44 };      // ajustada a la gradación de look.js (GRADO_LOOK)
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
export function conBorde(m) {
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
const _m4 = new THREE.Matrix4(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3(), _pd = new THREE.Vector3(), _pe = new THREE.Vector3(), _pf = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
/** Interpolación esférica entre dos direcciones unitarias (devuelve un vector nuevo). */
function slerpDir(a, b, t) { const c = Math.min(1, Math.max(-1, a.dot(b))), th = Math.acos(c); if (th < 1e-4) return a.clone(); const s = Math.sin(th); return a.clone().multiplyScalar(Math.sin((1 - t) * th) / s).addScaledVector(b, Math.sin(t * th) / s); }
/** Respiración del pesista de pie después del intento (posarMezcla): grados de cabeceo por hueso del tronco y ciclos por segundo. */
export const RESPIRA = { grados: 2.1, hz: .6, hombros: .05, peso: .022, sacude: [.9, .55] };
/** Escala del hueso del cuello con la cabeza propia oculta: cuello, cabeza, pelo y ojos quedan en un punto entre las clavículas. */
const SIN_CABEZA = 1e-3;
export const CAM = Object.fromEntries(CAMERAS.map((c, i) => [c.key, i]));
/**
 * Planos propios del juego (el visor no los ve). `medio`: plano americano del pesista que se prepara en el llamado (de las
 * rodillas para arriba). `caida`: sigue el punto medio entre la cadera y la barra suelta. `manga`: la manga derecha de la
 * barra de cerca, para el cambio de carga. `punto` (función) reemplaza a los huesos; `dAbs` es la distancia en metros.
 */
export const PLANOS = {
  medio: { key: 'medio', at: ['Neck', 'Hips'], up: -.05, d: 2.05, az: .5, el: .05, fov: 22 },
  cara: { key: 'cara', at: ['Head'], up: .0, d: .62, az: .42, el: .04, fov: 22 },      // primer plano de control (fotos del banco): cara, cuello y hombros
  torso: { key: 'torso', at: ['Neck', 'Spine'], up: 0, d: 1.25, az: .55, el: .06, fov: 22 },
  caida: { key: 'caida', at: [], up: 0, dAbs: 4.6, az: .72, el: .14, fov: 30, punto: 'caida' },
  manga: { key: 'manga', at: [], up: 0, dAbs: 1.45, az: 1.05, el: .2, fov: 30, punto: 'manga' },
  // el jurado (LIF-38): desde atrás de la mesa de los tres árbitros, por encima de sus hombros. Abajo, sus cabezas y las
  // paletas que levantan; en el medio, el pesista de frente; arriba de la pantalla, las tres luces. La cámara queda en
  // (0; 0,7; 10,6), delante de la primera fila de la tribuna, mirando a (0; 0,41; 0)
  // (17-nov: más cerca y más alta, (0; 1,53; 9,2) mirando a (0; 0,75; 0): la valla de LED que quedó detrás de la mesa ocupaba el tercio de abajo)
  jurado: { key: 'jurado', at: [], up: 0, dAbs: 9.2, az: 0, el: .085, fov: 30, punto: 'jurado' },
  // los tres árbitros de frente, desde el borde del escenario (para las fotos de control de banco.js)
  jueces: { key: 'jueces', at: [], up: 0, dAbs: 3.7, az: Math.PI, el: .12, fov: 34, punto: 'jueces' },
};
/**
 * Primera persona (pedido del dueño, 17-nov: «generalmente uno mira para adelante, no se ve los brazos… debería ver más al
 * jurado»; «movimientos de cabeza leves»; «el momento de tensión antes»). LA CÁMARA SON LOS OJOS DE VERDAD y lo que se ve es
 * lo que vería el pesista: el jurado, la mesa, el público. El cuerpo propio y la barra se dibujan DONDE ESTÁN (sin tronco ni
 * cabeza propios): entran en la imagen solo cuando la mirada y la geometría lo permiten. Reglas, iguales para todo biotipo:
 * - posición: los ojos salen de los huesos (cabeza + `arriba` m a lo largo del cuello + `adelante` m al frente), con un
 *   filtro corto (`sigue`). No se copia el giro del hueso de la cabeza: la mirada es una intención, por fases.
 * - AL FRENTE quiere decir AL JURADO: la mirada apunta a la mesa de los árbitros (`mira`: [alto, z] en m; inclinación entre
 *   `frente[0]` y `frente[1]` rad), así el punto que se mira no cambia mientras el cuerpo baja y sube. Lente de `fov`° de alto.
 * - PREPARACIÓN, EL VISTAZO A LA BARRA (17-nov, decidido con el dueño; `vistazo`): cuando las manos van a la barra del piso
 *   (del `baja[0]` al `baja[1]` del recorrido) la vista baja hacia el punto medio entre las dos manos, `sobre` rad por encima
 *   (las manos quedan en la mitad de abajo de la imagen, con los antebrazos y la barra), entre `min` y `max` rad (pasa de la vertical: la barra queda debajo y detrás de los ojos); con la barra
 *   tomada se queda `dura` s (se ve el agarre y el magnesio; como mucho `tope` s en total) y vuelve al jurado. Mientras mira
 *   abajo el lente se abre lo que haga falta para que entren las dos manos a `aire` del borde (hasta `fovMax`° de alto: el
 *   agarre del arranque es ancho y queda a medio metro de los ojos). Solo con la barra abajo de `bajo` × estatura/1,70 m y sin la barrita en pantalla: el
 *   juego (main.js, `vistazo`) hace el gesto ANTES de que aparezca la barrita. Con movimiento reducido, sin vistazo.
 *   CON LA BARRITA EN PANTALLA Y DURANTE TODO EL LEVANTAMIENTO LA MIRADA ESTÁ EN EL JURADO (nunca el piso en picado): la
 *   barrita se juega con respiración honda, el lente que late y los bordes oscuros.
 * - LEVANTAMIENTO: el mundo baja y sube con el cuerpo; la barra cruza la vista de verdad, de abajo hacia arriba (con una
 *   estela corta: `estela` del desplazamiento en pantalla), y queda arriba, fuera de la imagen. Lo que pasa se sigue en el recuadro.
 * - BARRA SUELTA: la barra cae por delante cruzando la vista; la mirada baja `suelta[0]` rad detrás del golpe durante
 *   `suelta[1]` s y vuelve al jurado; si la barra se fue atrás, además mira `suelta[2]` rad al costado ese instante.
 * - la mirada va con un resorte con amortiguamiento crítico (`muelle` por segundo) y nunca a más de `vMax` rad/s: sin
 *   rebotes ni latigazos. Con movimiento reducido: fija al frente, sin respiración ni sacudones.
 * - lente de `fov`° de alto (en una pantalla muy ancha se cierra para no pasar de `fovAncho`° de ancho); plano cercano a `cerca` m.
 * - respiración (`resp`) y temblor del esfuerzo (`temblor` rad con esfuerzo 1), y el dip y el temblor de CamaraViva al recibir
 *   y con cada golpe de la barra.
 * - del cuerpo propio no se dibujan la cabeza ni el tronco (athlete.js: aCabeza, aTorso) ni lo que quede a menos de `cercaOjo`
 *   m de la cámara (el hombro propio: sin trama, se corta por distancia). La cabeza tampoco mientras la cámara esté a menos de
 *   `sinCabeza` m de los ojos (entrando o saliendo de la vista).
 * - RECUADRO («doble visión», `RECUADRO`): mientras tanto, una pantalla chica muestra el levantamiento desde afuera (ver _recuadro).
 */
export const POV = { fov: 62, fovAncho: 104, cerca: .06, arriba: .1, adelante: .085, sigue: 30, mira: [1.15, 7.4], frente: [-.2, .12], abajo: -.96,
  baja: [.08, .35, .6, .92], toma: [.14, .3], vistazo: { sobre: .3, max: -1.66, min: -1.05, dura: .9, llego: .09, tope: 3.6, fovMax: 92, aire: .8, bajo: .5 }, suelta: [-.2, .9, .35], muelle: 7, vMax: 1, sinCabeza: .6, cercaOjo: .09, foco: 6,
  resp: { hz: .27, y: .004, cabeceo: .005, balanceo: .003, tension: 2.4 }, temblor: .006, latido: { hz: 1.15, fov: .22 }, estela: .6 };
/**
 * Recuadro de la primera persona: `ancho` del lienzo (`angosto` si mide menos de 900 px), alto = ancho × `alto`, pegado al
 * borde derecho (`x` del ancho de margen) a `y` del alto desde arriba y nunca a menos de `yMin` px (debajo del reloj, las
 * luces y la fila de sonido, pausa y ayuda; no tapa la barrita ni el tablero). La cámara es la general de siempre, fija: mira a `mira` (× estatura/1,70) desde `d` m, con `fov`°. Se vuelve a
 * dibujar un cuadro de cada `cada` (con post; el recuadro guarda su imagen) para que cueste poco.
 */
export const RECUADRO = { ancho: .24, angosto: .27, alto: .62, x: .014, y: .13, yMin: 84, mira: [0, 1.22, .06], d: 6.6, fov: 30, cada: 2 };
/** Fases en que el pesista recibe la barra (la cámara hace un dip chico): la primera que exista en el segmento. */
const RECEPCIONES = ['Recepción', 'Envión · Tijera', 'Power jerk · Recepción', 'Squat jerk · Recepción'];

export class Escena {
  constructor(canvas, Q, { reduceMotion = false, alShader = null } = {}) {
    this.canvas = canvas; this.Q = Q; this.reduceMotion = reduceMotion;
    // tope: píxeles que se dibujan como máximo; libre: sin el límite de la densidad de la pantalla (calibración y banco).
    // sombras: la clave proyecta sombra. lodFijo: píxeles por metro forzados (banco). directo: una pasada al lienzo (Q.directo).
    this.tope = Q.maxPixels; this.libre = false; this.sombras = true; this.lodFijo = null; this.directo = !!Q.directo;
    // MSAA del propio lienzo: lo usa el camino directo. En una placa por mosaicos (Apple, teléfonos) se resuelve dentro del
    // mosaico y casi no cuesta; en el camino con post (Media y Alta) el pase final lo pisa entero y no agrega nada visible.
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap; r.shadowMap.autoUpdate = false;
    if (alShader) r.debug.onShaderError = alShader;      // desde el primer dibujo (el constructor ya compila programas)
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(SALA.fondo); this.scene.fog = new THREE.FogExp2(SALA.niebla, SALA.densidad);
    this._niebla = { hdr: this.scene.fog.color.clone(), directo: tonoJS(new THREE.Color(SALA.nieblaDirecto)) };      // en el camino directo la niebla se mezcla ya en colores de pantalla
    if (canvas.parentElement && typeof document !== 'undefined') { const d = this.velo = document.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.style.cssText = `position:absolute;inset:0;pointer-events:none;background:${vineta()}`; canvas.after(d); }
    this.rig = new CameraRig(canvas, { reduceMotion, interactive: false }); this.viva = new CamaraViva({ reduceMotion });
    this.recuadro = { on: true, cam: new THREE.PerspectiveCamera(RECUADRO.fov, 1.6, .25, 120), rt: null, n: 0, cada: RECUADRO.cada, el: null };
    if (canvas.parentElement && typeof document !== 'undefined') { const d = this.recuadro.el = document.createElement('div'); d.id = 'recuadro'; d.setAttribute('aria-hidden', 'true'); d.hidden = true; canvas.after(d); }
    this.pov = null; this._povFn = (cam, dt) => this._povCam(cam, dt); this._ojo = new THREE.Vector3(); this._sinCabeza = null; this._temblor = 0;
    this.trace = new BarTrace(); this.scene.add(this.trace.group);
    const coarse = matchMedia('(pointer:coarse)').matches, aniso = Math.min(Q.aniso || 4, r.capabilities.getMaxAnisotropy());
    this.arena = new Arena({ tex: 64, aniso, reduceMotion, oficiales: false }); this.scene.add(this.arena.group);      // tex 64: la madera de la tarima la pone look.js (acá, una de relleno)
    // jueces y oficiales sentados (jueces.js): los árbitros levantan la paleta con cada luz
    const jueces = this.jueces = new Jueces({ reduceMotion }); this.scene.add(jueces.group);
    // ambiente del juego (ambiente.js): retoca texturas y sombreadores de la arena antes de que se dibuje nada, y recibe lo
    // mismo que el tablero y las luces de la arena (main.js no cambia: sigue llamando a arena.setBoard y arena.setDecision)
    const amb = this.ambiente = new Ambiente(this.arena, { tex: coarse || Q.tex <= 1024 ? 1024 : 2048, aniso, reduceMotion, look: true }); this.scene.add(amb.group);
    { const A = this.arena, tablero = A.setBoard.bind(A), decision = A.setDecision.bind(A); A.setBoard = b => { tablero(b); amb.setCartel(b); }; A.setDecision = d => { decision(d); amb.setDecision(d); jueces.setDecision(d); }; }
    this.reflejo = new Reflejo(0); this.reflejo.parchar(this.arena.madera);
    this.lighting = new Lighting(this.scene);
    // el look de competencia (look.js): luces, texturas de la tarima y del piso, pantalla con grano, utilería y rayos de luz.
    // Texturas grandes en una computadora (aunque arranque en «Baja»: la calibración sube sin rehacer texturas); chicas en un teléfono
    this.look = new Look({ arena: this.arena, ambiente: amb, lighting: this.lighting, aniso, grande: !coarse, reduceMotion }); this.scene.add(this.look.group);
    amb.setLuces(this.lighting);
    // público de personas (publico.js): atlas dibujado una vez y tribunas horneadas para las calidades sin desenfoque
    try { this.publico = new Publico(this.arena, r, { animo: amb.publico?.uAnimo, chico: coarse }); } catch (e) { console.warn('publico', e); }
    this.barbell = new Barbell({ aniso, texSize: coarse ? 512 : 1024, goma: this.look.goma }); this.scene.add(this.barbell.group);
    this.arena.setQuality(Q); this.lighting.setQuality(Q); this._ambiente(Q);
    this.arena.group.traverse(o => { o.castShadow = false; if (o.material) [].concat(o.material).forEach(conTono); });      // en la sombra, solo el pesista y la barra
    this._capaSombra();
    this._post(Q); this._modo();
    this.atletas = {}; this.cargas = {}; this.tls = {}; this.activo = null; this.id = null; this.yo = null; this.poses = null; this.plano = null; this.sombra = 4;
    this.barY = PLATE_R; this._py = [PLATE_R, PLATE_R]; this.kg = 0;
    // vigía de cortes (tools/cortes.mjs): un salto de la imagen de un cuadro al siguiente. `alCorte(razones)` lo recibe main.js;
    // `velado`: la imagen está tapada por un fundido (lo que cambia detrás no es un corte a la vista)
    this.vigia = { p: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Vector3(), cad: new THREE.Vector3(), fov: 0, bar: [0, 0], listo: false, id: null };
    this.alCorte = null; this.velado = false;
    this.barbell.setLoad(100); this._sombraBarra(); this.barbell.setPosition(v.set(0, PLATE_R, 0)); this.barbell.settle(PLATE_R);
    this.resize(); this.lighting.bake(r, [this.barbell.group, this.trace.group, this.ambiente.group, this.look.group]);
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
  /** Ambiente de la calidad (Q.amb): polvo, conos, público y reflejo de la tarima (solo con post: necesita color lineal). */
  _ambiente(Q) {
    const A = Q.amb || {}; this.ambiente.setNivel(A, !!Q.dof);
    const esc = !Q.directo && A.reflejo > 0 ? A.reflejo : 0; if (esc) this.reflejo.escala = esc; this.reflejo.setActivo(esc > 0);
    this.look?.setNivel(Q);
  }
  _post(Q) {
    const p = this.post = new Post(this.renderer, this.scene, this.rig.camera, Q); p.reduceMotion = this.reduceMotion; p.motionObject = this.barbell.group;
    // después del desenfoque van los discos de luz de la arena y el polvo de magnesio (un contenedor suelto: no cambia de quién son hijos)
    const tras = this._tras ||= Object.assign(new THREE.Object3D(), { matrixAutoUpdate: false }); tras.children = [this.arena.bokeh, this.ambiente.polvo]; p.bokehObject = tras;
    this.look?.post(p);
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
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.rig.setAspect(w / h); this.post.setSize(w, h, pr); this.reflejo.setSize(w * pr, h * pr); this.vertical = h > w; this.sombra = 4;
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
    if (Q !== this.Q) { this.Q = Q; this.arena.setQuality(Q); this.lighting.setQuality(Q); this._ambiente(Q); this.post.dispose(); this._post(Q); this._sombras(); this.directo = !!Q.directo; this._modo(); this.setBarato(Q.barato); }
    this.tope = Q.maxPixels; this.libre = false; this.resize();
  }
  _sombras() { const L = this.lighting, Q = this.Q; L.key.castShadow = this.sombras && Q.shadow > 0; L.key2.castShadow = this.sombras && Q.shadow2 > 0; }
  /**
   * Prende o apaga las sombras: sin luces que proyecten, three saltea la pasada de sombra y usa los programas sin sombra
   * de cada material. Después de precalentar() los dos juegos de programas ya existen y el cambio no compila nada.
   */
  setSombras(on) { this.sombras = !!on; this._sombras(); this.sombra = 4; }
  /**
   * Suelta los programas de todos los materiales de la escena: el próximo dibujo los compila de nuevo. Lo usa main.js cuando
   * un programa no compiló, antes de probar con la calidad Móvil: three avisa de un programa roto una sola vez, y si Móvil
   * reusaba los mismos programas el fallo no volvía a aparecer y se daba por recuperado sin estarlo.
   */
  soltarProgramas() { this.scene.traverse(o => { for (const m of [].concat(o.material || [], o.customDepthMaterial || [], o.customDistanceMaterial || [])) m.dispose(); }); }
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
  /**
   * Carga (una sola vez) el modelo que usa un pesista. Los dos modelos quedan en memoria. Si la carga falla, no queda
   * guardada: el próximo pedido la intenta de nuevo (main.js reintenta con espera y, si no, avisa; LIF-33).
   */
  cargar(id) {
    const mod = PLANTEL[id].modelo;
    return this.cargas[mod] ||= Athlete.load(mod, this.poses[mod], { aniso: Math.min(this.Q.aniso || 4, this.renderer.capabilities.getMaxAnisotropy()), maxTex: this.Q.tex, progreso: this.alProgreso })
      .then(a => { a.root.visible = false; a.root.traverse(o => { if (o.isMesh && o.castShadow) o.layers.enable(CAPA_SOMBRA); if (o.isMesh) [].concat(o.material).forEach(conBorde); }); this.scene.add(a.root); this.atletas[mod] = a; return a; })
      .catch(e => { delete this.cargas[mod]; throw e; });
  }
  /** Pone en escena a un pesista (o a nadie, con null). Marangi comparte la instancia de Brenner con la tela de color plano. */
  async mostrar(id) {
    if (id === null) { for (const a of Object.values(this.atletas)) a.root.visible = false; this.activo = null; this.id = null; this.sombra = 4; return; }
    const a = await this.cargar(id), f = PLANTEL[id];
    for (const b of Object.values(this.atletas)) b.root.visible = b === a;
    // el pesista del jugador (this.yo, lo fija main.js) lleva siempre su malla lisa, nunca la del modelo con otro nombre
    const tela = id === this.yo ? JUGADOR.tela : f.tela;
    { const asp = (id === this.yo ? JUGADOR.aspecto : null) || f.aspecto || {}; a.setAspecto({ ...asp, tela: { ...(asp.tela || {}), plano: tela || null } }); }      // aspecto por parámetros (athlete.js, ASPECTO)
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
    this._temblor = temblor;
    const g = pose.base + pose.s, i = Math.floor(g); a.setPair(i, i + 1, g - i); this._suelta = false; if (!this._fija) this.rig.fijo = false;
    // el pesista recibe la barra (la muestra cruza la fase de recepción en reproducción continua): dip de la cámara
    if (dt > 0 && dt < .1 && this._rec?.seg === pose.seg && this._rec.s < pose.s && pose.s - this._rec.s < 8) { const r = this._recepcion(pose.seg); if (r >= 0 && this._rec.s < r && pose.s >= r) { this.viva.dip(1); if (this.pov) this.viva.golpe(.55); } }
    (this._rec ||= {}).seg = pose.seg; this._rec.s = pose.s;
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
    this._temblor = 0;
    aplicarEsfuerzo(a, 0, 0, true); a.root.position.z += p.dz || 0; a.root.position.y += p.dy || 0;
    if (p.brazos) a.setParts(p, p.brazos); else a.setMix(p.i, p.j, p.u, p.k, p.w);
    // de pie después del intento no queda de estatua: respira agitado (el pecho cabecea alrededor del eje lateral del mundo,
    // RESPIRA.grados en cada hueso del tronco, a RESPIRA.hz), tanto más cuanto más cerca de «Parado». Nada con movimiento reducido.
    if (p.w > 0 && p.t !== undefined && !this.reduceMotion) {
      // nunca de estatua: respira agitado (tórax que cabecea y hombros que suben y bajan), carga el peso un poco hacia un lado y
      // el otro (solo el tronco: los pies no se mueven) y, al rato de llegar, se sacude el magnesio de las manos
      const f = Math.sin(p.t * Math.PI * 2 * RESPIRA.hz), ang = THREE.MathUtils.degToRad(RESPIRA.grados) * p.w * f;
      for (const k of ['Spine1', 'Spine2']) this._girarHueso(a, k, _pa.set(1, 0, 0), ang);
      for (const [k, sg] of [['LeftShoulder', 1], ['RightShoulder', -1]]) this._girarHueso(a, k, _pa.set(0, 0, 1), sg * RESPIRA.hombros * p.w * Math.max(0, -f));
      const lado = Math.sin(p.t * Math.PI * 2 * .21) * p.w; for (const k of ['Spine', 'Spine1']) this._girarHueso(a, k, _pa.set(0, 0, 1), RESPIRA.peso * lado);
      a.root.updateMatrixWorld(true);
    }
    if (p.pies && ((p.pies.u > 0 && p.pies.u < 1) || p.pies.dy)) this._pies(a, p.pies);
    if (p.empuje?.w > 0) for (const [L, sx] of [['Left', 1], ['Right', -1]]) { this._apuntarHueso(a, L + 'Arm', L + 'ForeArm', _pe.set(sx * .2, .85, .5).normalize(), p.empuje.w); this._apuntarHueso(a, L + 'ForeArm', L + 'Hand', _pf.set(sx * .12, .8, .6).normalize(), p.empuje.w); }
    if (p.mano?.w > 0) this._manosEnBarra(a, p.mano);
    if (p.barrido?.w > 0 || p.gesto) this._gesto(a, p);
    this.rig.headY = a.boneWorld('Head', v2).y + .14; this.sombra = 3;
  }
  /** Gira el hueso `h` (en el mundo, con peso `w`) para que apunte de él a su hijo `hijo` en la dirección `dir` (unitaria, mundo). */
  _apuntarHueso(a, h, hijo, dir, w) {
    const b = a._byName.get(h), c = a._byName.get(hijo); if (!b || !c || w <= 0) return;
    b.updateWorldMatrix(true, true); const p0 = b.getWorldPosition(_pa), d = c.getWorldPosition(_pb).sub(p0).normalize();
    _qa.setFromUnitVectors(d, dir); if (w < 1) _qa.slerp(_qb.identity(), 1 - w);
    b.parent.getWorldQuaternion(_qb); b.quaternion.premultiply(_qc.copy(_qb).invert().multiply(_qa).multiply(_qb));
  }
  /**
   * Las manos acompañan la barra que baja (caida.js, GUIA): cada brazo se resuelve con dos huesos para que la muñeca quede
   * junto a la barra en {y, z} (a un puño de distancia, del lado del hombro), con el codo hacia afuera y abajo; `m.w` lo mezcla
   * con la pose de abajo y `m.dedos` abre la mano al soltar. Regla sobre los huesos: vale para cualquier biotipo.
   */
  _manosEnBarra(a, m) {
    for (const [L, sx] of [['Left', 1], ['Right', -1]]) {
      const hA = a._byName.get(L + 'Arm'), hM = a._byName.get(L + 'Hand'); if (!hA || !hM) continue; hA.updateWorldMatrix(true, true);
      const S = hA.getWorldPosition(new THREE.Vector3()), M0 = hM.getWorldPosition(new THREE.Vector3());
      // la muñeca, a 7 cm del eje de la barra hacia el hombro, en el ancho de agarre que traía; el codo, hacia afuera y abajo
      const T = new THREE.Vector3(M0.x, m.y, m.z), haciaS = new THREE.Vector3(0, S.y - m.y, S.z - m.z).normalize(); T.addScaledVector(haciaS, .07);
      this._dosHuesos(a, L + 'Arm', L + 'ForeArm', L + 'Hand', T, new THREE.Vector3(sx * .75, -.45, -.5), m.w);
    }
    a.root.updateMatrixWorld(true);
  }
  /** Dos huesos (`h1` → `h2` → `h3`) para que `h3` quede en `T` (mundo), con el codo o la rodilla hacia `polo`; `w` mezcla con la pose de abajo. */
  _dosHuesos(a, h1, h2, h3, T, polo, w = 1, tope = .985) {
    const A = a._byName.get(h1), B = a._byName.get(h2), C = a._byName.get(h3); if (!A || !B || !C || w <= 0) return;
    A.updateWorldMatrix(true, true);
    const S = A.getWorldPosition(new THREE.Vector3()), E0 = B.getWorldPosition(new THREE.Vector3()), M0 = C.getWorldPosition(new THREE.Vector3()), L1 = S.distanceTo(E0), L2 = E0.distanceTo(M0);
    const dv = T.clone().sub(S), d = Math.min(dv.length(), (L1 + L2) * tope), dir = dv.normalize(), x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    const perp = (polo ? polo.clone() : E0.clone().sub(S)); perp.addScaledVector(dir, -perp.dot(dir)); if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1); perp.normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(perp, h);
    this._apuntarHueso(a, h1, h2, E.clone().sub(S).normalize(), w); this._apuntarHueso(a, h2, h3, S.clone().addScaledVector(dir, d).sub(E).normalize(), w);
  }
  /**
   * Pies plantados y paso atrás (caida.js, GUIA): la raíz ya se movió (`m.dy` m: las rodillas que ceden; `m.dz`·suave(`m.u`): el
   * paso). Cada pierna se resuelve con dos huesos para que su tobillo quede donde corresponde: plantado donde estaba, o, en el
   * paso, el pie izquierdo se levanta y se apoya atrás en la primera mitad y el derecho en la segunda. Los pies no patinan.
   */
  _pies(a, m) {
    const su = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); }, raiz = m.dz * su(m.u);
    ['Left', 'Right'].forEach((L, i) => {
      const hF = a._byName.get(L + 'Foot'); if (!hF) return; hF.updateWorldMatrix(true, false);
      const F0 = hF.getWorldPosition(new THREE.Vector3()), qF = hF.getWorldQuaternion(new THREE.Quaternion()), v = Math.min(1, Math.max(0, m.u * 2 - i)), T = F0.clone();
      T.z += -raiz + m.dz * su(v); T.y += -(m.dy || 0) + .05 * Math.sin(Math.PI * v) * (m.dz ? 1 : 0);
      this._dosHuesos(a, L + 'UpLeg', L + 'Leg', L + 'Foot', T, new THREE.Vector3(i ? -.12 : .12, 0, 1), 1, .995);      // la rodilla, siempre hacia adelante (con la pierna casi recta, tomarla de la pose la hacía saltar de lado)
      hF.parent.updateWorldMatrix(true, false); hF.quaternion.copy(hF.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qF));      // el pie no cambia de orientación
    });
    a.root.updateMatrixWorld(true);
  }
  /** Gira el hueso `h` `ang` rad alrededor del eje `eje` del mundo. */
  _girarHueso(a, h, eje, ang) {
    const b = a._byName.get(h); if (!b || !ang) return; b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_qb);
    b.quaternion.premultiply(_qc.copy(_qb).invert().multiply(_qa.setFromAxisAngle(eje, ang)).multiply(_qb));
  }
  /**
   * Barrido de los brazos y gesto después de soltar la barra (reglas en caida.js: BARRIDO y GESTO). Direcciones en el mundo
   * (+x la izquierda del pesista, +y arriba, +z su frente): valen para cualquier biotipo, no hay nada por personaje.
   */
  _gesto(a, p) {
    const B = p.barrido, g = p.gesto, quieto = this.reduceMotion;
    for (const [L, sx] of [['Left', 1], ['Right', -1]]) {
      if (B?.w > 0) {
        // del brazo como está (arriba) al frente y de ahí a colgar; el antebrazo va un poco atrasado (el codo guía)
        a._byName.get(L + 'Arm')?.updateWorldMatrix(true, true);
        const d0 = a.boneWorld(L + 'ForeArm', _pc).sub(a.boneWorld(L + 'Arm', _pd)).normalize().clone(), fr = _pe.set(sx * .22, .0, .975).normalize().clone(), ab = _pf.set(sx * .13, -.985, .1).normalize().clone();
        const en = x => { const y = Math.min(1, Math.max(0, x)); return y < .5 ? slerpDir(d0, fr, y * 2) : slerpDir(fr, ab, y * 2 - 1); };
        this._apuntarHueso(a, L + 'Arm', L + 'ForeArm', en(B.x), B.w); this._apuntarHueso(a, L + 'ForeArm', L + 'Hand', en(B.x - .22), B.w);      // codo doblado en el medio del barrido: la mano pasa más cerca del cuerpo, lejos de la barra que quedó adelante
      }
      if (g?.tipo === 'festejo' && g.w > 0) {
        const F = GESTO.festejo, golpe = quieto ? 0 : Math.max(0, Math.sin((g.t - F.sube) * Math.PI * 2 * 2.2)) * (g.t > F.sube && g.t < F.sube + .95 ? 1 : 0);
        if (g.v === 0) {      // dos puños al frente, a la altura de la cara, que marcan dos veces
          this._apuntarHueso(a, L + 'Arm', L + 'ForeArm', _pe.set(sx * .42, -.4 + .12 * golpe, .6).normalize(), g.w);
          this._apuntarHueso(a, L + 'ForeArm', L + 'Hand', _pf.set(-sx * .1, .93 - .45 * golpe, .25 + .35 * golpe).normalize(), g.w); a.dedosDe?.(L, g.dedos, g.w);
        } else if (g.v === 1) {      // un puño arriba (el derecho), que marca; el hombro acompaña la elevación (no gira solo el brazo)
          if (sx < 0) { this._girarHueso(a, 'RightShoulder', _pa.set(0, 0, 1), -.3 * g.w); this._apuntarHueso(a, 'RightArm', 'RightForeArm', _pe.set(-.3, .82 - .2 * golpe, .32).normalize(), g.w); this._apuntarHueso(a, 'RightForeArm', 'RightHand', _pf.set(-.05, 1 - .25 * golpe, .12 + .3 * golpe).normalize(), g.w); a.dedosDe?.('Right', g.dedos, g.w); }
        } else {      // palmada de magnesio: las dos manos se encuentran delante del pecho, dos veces
          const junta = quieto ? 1 : .55 + .45 * Math.abs(Math.sin((g.t - F.sube) * Math.PI * 2.4));
          this._apuntarHueso(a, L + 'Arm', L + 'ForeArm', _pe.set(sx * .3, -.62, .72).normalize(), g.w); this._apuntarHueso(a, L + 'ForeArm', L + 'Hand', _pf.set(-sx * (.2 + .7 * junta), .42, .55).normalize(), g.w);
        }
      }
      if (g?.tipo === 'bronca' && g.v === 1 && g.w > 0) {
        // manos a la cintura: la muñeca al costado de la cadera (por fuera del ancho de la cadera y de los hombros), codo hacia afuera y atrás
        const hip = a.boneWorld(L + 'UpLeg', new THREE.Vector3()), sh = a.boneWorld(L + 'Arm', new THREE.Vector3()), k = (this.P?.h || 1.7) / 1.7;
        const T = new THREE.Vector3(sx * Math.max(Math.abs(hip.x) + .1 * k, Math.abs(sh.x) * .86), hip.y + .1 * k, hip.z + .03);
        this._dosHuesos(a, L + 'Arm', L + 'ForeArm', L + 'Hand', T, new THREE.Vector3(sx * .8, -.1, -.6), g.w);
      }
    }
    // un rato después de llegar se sacude el magnesio: los antebrazos giran rápido y corto (las dos manos)
    if (g && !quieto) { const t0 = g.tipo === 'festejo' ? g.despues - .6 : g.t - 3.2; if (t0 > 0 && t0 < RESPIRA.sacude[1]) { const k = Math.sin(t0 / RESPIRA.sacude[1] * Math.PI), q = .22 * k * Math.sin(t0 * Math.PI * 2 * 7);
      for (const L of ['Left', 'Right']) { this._girarHueso(a, L + 'ForeArm', _pa.set(1, 0, 0), -.25 * k); this._girarHueso(a, L + 'Hand', _pa.set(0, 0, 1), q); } } }
    const lento = (t, hz, n) => (quieto ? 0 : Math.sin(Math.max(0, t) * Math.PI * 2 * hz) * Math.max(0, Math.min(1, t / .3)) * Math.max(0, 1 - t / n));
    if (g?.tipo === 'festejo') {
      if (g.w > 0) { for (const k of ['Spine1', 'Spine2']) this._girarHueso(a, k, _pa.set(1, 0, 0), -.035 * g.w); this._girarHueso(a, 'Head', _pa.set(1, 0, 0), -.1 * g.w); }
      // después del festejo no queda de estatua: mira al público a un lado y al otro, despacio (y sigue respirando agitado)
      if (g.despues > 0) { const m = lento(g.despues, .22, 9); this._girarHueso(a, 'Neck', _pa.set(0, 1, 0), .22 * m); this._girarHueso(a, 'Head', _pa.set(0, 1, 0), .3 * m); this._girarHueso(a, 'Spine2', _pa.set(0, 1, 0), .1 * m); }
    }
    if (g?.tipo === 'bronca' && g.w > 0) {
      // v 0: la cabeza cae, los hombros se vencen y niega; v 1: manos a la cintura, mira la barra y niega; v 2: mira arriba, suelta el aire, y baja la cabeza.
      // Ninguna queda fija: la cabeza vuelve a medias, mira la barra, se mueve
      const sube = quieto ? 0 : .5 * Math.max(0, Math.min(1, (g.t - 1.6) / 1.2)), arriba = g.v === 2 ? Math.max(0, 1 - Math.abs(g.t - .7) / .7) : 0, baja = (g.v === 1 ? .6 : 1) * (1 - sube) * (1 - arriba) - .9 * arriba;
      for (const k of ['Spine1', 'Spine2']) this._girarHueso(a, k, _pa.set(1, 0, 0), .1 * g.w * (g.v === 1 ? .4 : 1) * (1 - arriba));
      this._girarHueso(a, 'Neck', _pa.set(1, 0, 0), .28 * g.w * baja); this._girarHueso(a, 'Head', _pa.set(1, 0, 0), .32 * g.w * baja);
      this._girarHueso(a, 'Head', _pa.set(0, 1, 0), .2 * g.w * lento(g.t - .5, .9, 2.2) + .18 * g.w * lento(g.t - 2.6, .2, 8));
    }
    a.root.updateMatrixWorld(true);
  }
  /**
   * Barra suelta en {y, z, ang} (m y radianes: rueda sobre su eje). Con `dt` la flexión de la barra sigue la aceleración
   * del centro (en el aire, los extremos se enderezan; contra la tarima, el golpe la hace vibrar); sin `dt`, quieta.
   */
  barraSuelta(b, dt = 0) {
    // la barra contra la tarima (venía bajando y frenó de golpe cerca del piso): temblor según la velocidad del golpe
    if (dt > 0 && dt < .1) { const v0 = (this._py[0] - this._py[1]) / dt, v1 = (b.y - this._py[0]) / dt; if (v0 < -1.2 && v1 - v0 > 1.2 && b.y < this.pisoBarra + .08) { const k = Math.min(.85, .18 - v0 * .11); this.viva.golpe(k); this.ambiente.golpe(b.z, k); } }
    v.set(0, b.y, b.z); this.barbell.setPosition(v); this.barbell.group.rotation.x = b.ang || 0; this._suelta = !b.guiada; this.rig.fijo = true; this.rig.zoom = this.rig.zoomT;      // `guiada`: todavía va en las manos (bajada controlada);      // pedido del dueño: al terminar el intento la cámara no se mueve (ni el reencuadre que seguía a la barra que cae)
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
  /** Muestra local de la fase de recepción de un segmento (−1 si no tiene). */
  _recepcion(seg) {
    const c = this._recs ||= new WeakMap(); let m = c.get(this.P); if (!m) c.set(this.P, m = {});
    if (m[seg] === undefined) { m[seg] = -1; const G = tramo(this.P, seg); for (const n of RECEPCIONES) { try { m[seg] = G.i(n); break; } catch { /* este segmento no tiene esa fase */ } } }
    return m[seg];
  }
  /** Altura del centro de la barra apoyada en la tarima con la carga de ahora. */
  get pisoBarra() { return Math.max(.05, this.barbell.plateR); }
  /** Distancia (m) entre el centro de la barra dibujada y el punto medio de las manos: para la prueba automática. */
  manosBarra() { const a = this.activo; if (!a) return 0; a.midWorld(['LeftHand', 'RightHand'], v2); const b = this.barbell.group.position; return Math.hypot(v2.y - b.y, v2.z - b.z); }
  /** Altura (m) de la barra en una muestra global del clip (para las líneas de ayuda). */
  alturaMuestra(g) { return this.activo?.barPos[g]?.y ?? 0; }
  /** Acercamiento sutil de la cámara (1 = el plano tal cual; 0,92 = un poco más cerca), amortiguado por el rig. */
  acercar(z = 1) { if (this.rig) this.rig.zoomT = z; }
  /** Cámara fija por clave. `suave` (s): en lugar de cortar, va desde la cámara de ahora (cameras.js, suave). */
  camara(clave, suave = 0) {
    if (PLANOS[clave]) { this.primerPlano(clave, null, suave); return; }
    if (suave) this.rig.suave(suave); else this.rig.mezcla = null;
    this.plano = null; this.encuadre = null; this.rig.setShot(null);
    if (clave === 'pov') { this._pov(true); return; }
    this._pov(false); this.rig.cut(CAM[clave] ?? 0);
  }
  /** Prende o apaga la primera persona (ver POV). Al prenderla, la cámara arranca ya en los ojos, sin retardo. */
  _pov(on) {
    if (!!this.pov === on) return; const cam = this.rig.camera;
    this.pov = on ? { p: new THREE.Vector3(), inc: 0, vInc: 0, rum: 0, vRum: 0, t: 0, nueva: true } : null; this.rig.propia = on ? this._povFn : null;
    if (!on) { cam.near = .25; cam.updateProjectionMatrix(); const x = this._sinTorso; this._torso(x, 0); if (x?.skin?.uCercaOjo) x.skin.uCercaOjo.value = 0; if (this.velo) { this.velo.style.boxShadow = ''; this._veloT = 0; } if (this.recuadro.el) this.recuadro.el.hidden = true; }
  }
  /** El vistazo a la barra de la preparación está en curso (la vista baja, mira el agarre o todavía no volvió al jurado). */
  get vistazo() { const S = this.pov; return !!S && !this.reduceMotion && (S.vz > 0 || S.inc < -.26); }
  /** Las dos manos en la imagen de este cuadro: posición en la pantalla (-1 a 1) y si entran las dos (con 4 % de aire). */
  manosEnVista() {
    const a = this.activo, cam = this.rig.camera; if (!a) return null;
    const m = ['LeftHand', 'RightHand'].map(k => { const p = a.boneWorld(k, new THREE.Vector3()).project(cam); return [Math.round(p.x * 1e3) / 1e3, Math.round(p.y * 1e3) / 1e3, p.z < 1 && p.z > -1]; });
    return { manos: m, dentro: m.every(p => p[2] && Math.abs(p[0]) < .96 && Math.abs(p[1]) < .96) };
  }
  /** Punto de los ojos del pesista (m, mundo), de los huesos: no usa los ejes del hueso de la cabeza. */
  ojos(out) {
    const a = this.activo; if (!a) return out.set(0, 1.6, .1);
    // con la cabeza oculta el cuello está achicado (ver _cabeza) y el hueso de la cabeza cae sobre el del cuello: se deshace la escala
    const k = (this.P?.h || 1.7) / 1.7, n = a.boneWorld('Neck', _pa), c = a.boneWorld('Head', out); if (a === this._sinCabeza) c.sub(n).multiplyScalar(1 / SIN_CABEZA).add(n);
    const arr = n.sub(c).negate().normalize();
    const ad = a.boneWorld('LeftArm', _pb).sub(a.boneWorld('RightArm', _pc)).cross(arr).normalize();
    return c.addScaledVector(arr, POV.arriba * k).addScaledVector(ad, POV.adelante * k);
  }
  /** Cuánto del cuerpo propio (todo menos antebrazos y manos) se deja sin dibujar (0 a 1; athlete.js: aTorso). Cinturón y zapatillas salen con él. */
  _torso(a, k) {
    if (this._sinTorso && this._sinTorso !== a) { const x = this._sinTorso; this._sinTorso = null; this._torso(x, 0); }
    if (!a?.skin?.uSinTorso) return; a.skin.uSinTorso.value = k; this._sinTorso = k > 0 || this.pov ? a : null;
    for (const m of a.meshes) {
      const nm = m.material?.name || ''; if (/^Belt/.test(nm)) m.visible = k < .5;
      // con el tronco oculto el cuerpo se dibuja de los dos lados: por el corte del hombro y de la cintura no se ve a través de la malla;
      // y siempre en primera persona: el cuello achicado deja un embudo que, visto desde atrás, mostraba el piso a través del pecho
      if (nm === 'Body') { const lado = k > 0 || this.pov ? THREE.DoubleSide : THREE.FrontSide; if (m.material.side !== lado) { m.material.shadowSide = THREE.BackSide; m.material.side = lado; m.material.needsUpdate = true; } }
    }
  }
  /** La cámara en primera persona de este cuadro (la llama el rig en lugar de su encuadre). */
  _povCam(cam, dt) {
    const S = this.pov, R = this.rig, o = this.ojos(_pd), quieto = this.reduceMotion, a = this.activo; S.t += dt;
    const b = this.barbell.group.position, paso = (x, a, c) => { const t = Math.min(1, Math.max(0, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
    if (S.nueva) S.p.copy(o); else S.p.lerp(o, 1 - Math.exp(-POV.sigue * dt));
    // adónde quiere mirar (ver POV): inclinación `incT` y rumbo `rumT` (rad). Al frente = a la mesa de los árbitros
    const alJurado = Math.max(POV.frente[0], Math.min(POV.frente[1], Math.atan2(POV.mira[0] - S.p.y, Math.max(1, POV.mira[1] - S.p.z))));
    let incT = alJurado, rumT = 0;
    const bq = this._barritaEl ??= (typeof document !== 'undefined' ? document.getElementById('barrita') : null), conBarrita = !!bq && !bq.hidden && bq.offsetParent !== null; S.conBarrita = conBarrita;
    if (a && !quieto) {
      const hm = a.midWorld(['LeftHand', 'RightHand'], _pe), dist = Math.hypot(hm.y - b.y, hm.z - b.z), aBarra = Math.max(POV.abajo, Math.min(0, Math.atan2(b.y - S.p.y, Math.max(.05, b.z - S.p.z))));
      if (this._suelta) {
        S.tS = (S.tS || 0) + dt; S.lejos = 0;
        const k = paso(S.tS, .05, .4) * (1 - paso(S.tS, POV.suelta[1] * .6, POV.suelta[1] * 1.5));
        incT = alJurado + POV.suelta[0] * k; if (b.z < S.p.z - .15) rumT = POV.suelta[2] * k;
      } else {
        // cuánto del camino de las manos a la barra va hecho (desde lo más lejos que estuvieron): baja la vista a mitad de camino y la levanta antes de llegar
        S.tS = 0; S.lejos = Math.max(S.lejos || 0, dist); const p = S.lejos > .25 ? 1 - dist / S.lejos : 1, V = POV.vistazo, tomada = dist < POV.toma[0];
        if (tomada) S.lejos = 0;      // ya la tiene: el próximo recorrido empieza de cero
        // el vistazo (ver POV): 1 = las manos van a la barra del piso; 2 = la tiene y la mira `dura` s; 0 = al jurado
        if (conBarrita || b.y > V.bajo * (this.P?.h || 1.7) / 1.7) S.vz = 0;
        else if (!tomada && S.lejos > .25 && p > POV.baja[0]) { S.vz = 1; S.vzT = 0; S.vzE = 0; }
        else if (tomada && S.vz === 1) S.vz = 2;
        if (S.vz === 2) { S.vzE += dt; if (S.llego) S.vzT += dt; if (S.vzT >= V.dura || S.vzE >= V.tope) S.vz = 0; }
        const kv = S.vz === 1 ? paso(p, POV.baja[0], POV.baja[1]) : S.vz === 2 ? 1 : 0; S.llego = false;
        if (kv > 0) { const obj = Math.max(V.max, Math.min(V.min, ((x => (x > 0 ? x - 2 * Math.PI : x))(Math.atan2(hm.y - S.p.y, hm.z - S.p.z))) + V.sobre)); /* las manos pueden quedar detrás de los ojos: el ángulo sigue de largo (-90° a -180°) */ incT += (obj - incT) * kv; S.llego = kv === 1 && Math.abs((S.inc || 0) - obj) < V.llego; }
        void aBarra;
      }
    }
    // resorte con amortiguamiento crítico y tope de velocidad: la cabeza se mueve leve, sin rebotes
    const muelle = (x, v, obj) => { if (S.nueva || quieto) return [obj, 0]; const w = POV.muelle, h = Math.min(dt, .05), n = Math.max(1, Math.ceil(dt / .05)); for (let k = 0; k < n; k++) { v += (w * w * (obj - x) - 2 * w * v) * h; v = Math.max(-POV.vMax, Math.min(POV.vMax, v)); x += v * h; } return [x, v]; };
    [S.inc, S.vInc] = muelle(S.inc || 0, S.vInc || 0, incT); [S.rum, S.vRum] = muelle(S.rum || 0, S.vRum || 0, rumT); S.nueva = false;
    // tensión de la preparación: mientras corre la barrita (el rig cierra el lente) la respiración es más honda y la imagen late
    const tension = quieto ? 0 : Math.min(1, Math.max(0, (1 - R.zoom) / .07)); S.tension = tension;
    let inc = S.inc, bal = 0, y = 0, fovK = 0;
    if (!quieto) {
      const w = S.t * Math.PI * 2 * POV.resp.hz, T = Math.min(1, Math.max(0, this._temblor)) * POV.temblor, kR = 1 + POV.resp.tension * tension;
      y = POV.resp.y * kR * Math.sin(w); inc += POV.resp.cabeceo * kR * Math.sin(w - .9) + T * (Math.sin(S.t * 47) * .6 + Math.sin(S.t * 83 + 1.3) * .4);
      bal = POV.resp.balanceo * Math.sin(w * .5 + 1) + T * .6 * (Math.sin(S.t * 39 + .7) * .6 + Math.sin(S.t * 71) * .4);
      const lat = (S.t * POV.latido.hz) % 1; fovK = tension * POV.latido.fov * (Math.exp(-lat * 9) + .6 * Math.exp(-Math.abs(lat - .28) * 14));      // dos golpes por latido
    }
    cam.position.copy(S.p); cam.position.y += y; cam.rotation.set(inc, Math.PI + S.rum, bal, 'YXZ');
    // del cuerpo propio: ni cabeza ni tronco, ni lo que queda pegado a la cámara (el hombro); brazos, piernas y barra, donde están
    S.torso = 1; this._torso(a, S.torso);
    if (a?.skin?.uCorte) a.skin.uCorte.value = .8; if (a?.skin?.uCercaOjo) a.skin.uCercaOjo.value = POV.cercaOjo;
    if (this.velo && Math.abs((this._veloT || 0) - tension) > .02) { this._veloT = tension; this.velo.style.boxShadow = tension > .02 ? `inset 0 0 ${(tension * 22).toFixed(1)}vmin ${(tension * 6).toFixed(1)}vmin rgba(0,0,0,${(.5 * tension).toFixed(2)})` : ''; }
    const fov = Math.min(POV.fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(POV.fovAncho / 2)) / Math.max(.5, cam.aspect)))) * (1 - (1 - R.zoom) * .5) - fovK;
    // el vistazo: mientras la vista está abajo el lente se abre lo que haga falta para que entren las dos manos (con aire)
    let abre = 0; const kA = quieto || !a ? 0 : paso(alJurado - S.inc, .35, .9);
    if (kA > 0) {
      cam.updateMatrixWorld(); _m4.copy(cam.matrixWorld).invert(); let tg = 0;
      for (const k of ['LeftHand', 'RightHand']) { const q = a.boneWorld(k, _pf).applyMatrix4(_m4), d = Math.max(.05, -q.z); tg = Math.max(tg, Math.abs(q.y) / d, Math.abs(q.x) / d / Math.max(.5, cam.aspect)); }
      abre = kA * Math.max(0, Math.min(POV.vistazo.fovMax, THREE.MathUtils.radToDeg(2 * Math.atan(tg / POV.vistazo.aire))) - fov);
    }
    cam.fov = fov + abre; cam.near = POV.cerca; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // en el vistazo el foco va a las manos (con el foco en el jurado, la barra y las manos salían borrosas)
    R.focusDistance = POV.foco + (Math.max(.4, a ? a.midWorld(['LeftHand', 'RightHand'], _pe).distanceTo(S.p) : POV.foco) - POV.foco) * kA; R.target.set(S.p.x, S.p.y, S.p.z + POV.foco); R.subject.copy(R.target);
  }
  /** El cuerpo propio entero (true) u oculto como en la vista de los ojos (false): para dibujar el recuadro entre un estado y el otro. */
  _propio(entero) {
    const a = this._sinCabeza || this._sinTorso; if (!a) return;
    const u = a.skin, G = this._propioG ||= {}, h = a._byName.get('Neck');
    if (entero) {
      Object.assign(G, { t: u?.uSinTorso?.value, c: u?.uSinCabeza?.value, o: u?.uCercaOjo?.value, e: h ? h.scale.x : 1, vis: a.meshes.concat(a.hairDepth || []).map(m => m.visible) });
      if (u?.uSinTorso) u.uSinTorso.value = 0; if (u?.uSinCabeza) u.uSinCabeza.value = 0; if (u?.uCercaOjo) u.uCercaOjo.value = 0;
      if (h && G.e !== 1) { h.scale.setScalar(1); h.updateMatrixWorld(true); } for (const m of a.meshes.concat(a.hairDepth || [])) m.visible = true;
    } else {
      if (u?.uSinTorso) u.uSinTorso.value = G.t; if (u?.uSinCabeza) u.uSinCabeza.value = G.c; if (u?.uCercaOjo) u.uCercaOjo.value = G.o;
      if (h && G.e !== 1) { h.scale.setScalar(G.e); h.updateMatrixWorld(true); } a.meshes.concat(a.hairDepth || []).forEach((m, i) => { m.visible = G.vis[i]; });
    }
  }
  /**
   * Recuadro de la primera persona («doble visión», pedido del dueño): el levantamiento desde afuera, con la cámara general
   * fija, en una pantalla chica (RECUADRO), con el pesista entero. Con post: se dibuja a una textura propia un cuadro de cada
   * `cada` y se copia a la pantalla con el mismo pase final (tono y gradación). En el camino directo («Baja», «Móvil»): se
   * dibuja directo en su rincón del lienzo (mismos programas: no compila nada). Las sombras no se vuelven a calcular.
   */
  _recuadro() {
    const X = this.recuadro, r = this.renderer, a = this.activo, on = this._recuadroOn();
    if (!on) return;
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1, fw = W < 900 ? RECUADRO.angosto : RECUADRO.ancho, fh = Math.min(.42, fw * W / H * RECUADRO.alto), fx = 1 - RECUADRO.x - fw, fyT = Math.max(RECUADRO.y, RECUADRO.yMin / H);
    if (X.el && (X.fw !== fw || X.fh !== fh)) { X.fw = fw; X.fh = fh; X.el.style.cssText = `position:absolute;left:${(fx * 100).toFixed(2)}%;top:${(fyT * 100).toFixed(2)}%;width:${(fw * 100).toFixed(2)}%;height:${(fh * 100).toFixed(2)}%;box-sizing:border-box;border:1px solid rgba(232,236,248,.55);box-shadow:0 0 0 1px rgba(3,5,12,.6),0 6px 18px rgba(0,0,0,.45);pointer-events:none`; }
    const cam = X.cam, kE = (this.P?.h || 1.7) / 1.7, c = CAMERAS[CAM['3/4']] || CAMERAS[0], ce = Math.cos(c.el);
    cam.fov = RECUADRO.fov; cam.aspect = (fw * W) / (fh * H); cam.near = .25; cam.far = 120; cam.updateProjectionMatrix();
    _pa.set(RECUADRO.mira[0], RECUADRO.mira[1] * kE, RECUADRO.mira[2]); cam.position.set(Math.sin(c.az) * ce, Math.sin(c.el), Math.cos(c.az) * ce).multiplyScalar(RECUADRO.d * kE).add(_pa); cam.lookAt(_pa); cam.updateMatrixWorld(); cam.layers.mask = this.rig.camera.layers.mask;
    const vp = r.getViewport(X.vp ||= new THREE.Vector4()), x = vp.x + fx * vp.z, y = vp.y + (1 - fyT - fh) * vp.w, w = fw * vp.z, h = fh * vp.w, su = r.shadowMap.needsUpdate; r.shadowMap.needsUpdate = false;
    if (this.directo) {
      this._propio(true); r.setRenderTarget(null); r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.setScissorTest(true);
      r.clear(); r.render(this.scene, cam); r.setScissorTest(false); r.setViewport(vp); this._propio(false);
    } else {
      const pr = r.getPixelRatio(), pw = Math.max(8, Math.round(w * pr)), ph = Math.max(8, Math.round(h * pr));
      if (!X.rt || X.rt.width !== pw || X.rt.height !== ph) { X.rt?.dispose(); X.rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, depthBuffer: true }); X.n = 0; }
      if (X.n++ % Math.max(1, X.cada) === 0) { const ac = r.autoClear; r.autoClear = true; this._propio(true); r.setRenderTarget(X.rt); r.render(this.scene, cam); this._propio(false); r.autoClear = ac; }
      const f = this.post.finalMat.uniforms, t0 = f.tDiffuse.value, b0 = f.uBloom.value; f.tDiffuse.value = X.rt.texture; f.uBloom.value = 0;
      // sin limpiar: con autoClear el pase borraba TODA la pantalla (el recorte del viewport no vale para el borrado) y la vista de los ojos quedaba negra
      const ac = r.autoClear; r.autoClear = false; r.setRenderTarget(null); r.setViewport(x, y, w, h); this.post._pass(this.post.finalMat, null); r.setViewport(vp); r.autoClear = ac; f.tDiffuse.value = t0; f.uBloom.value = b0;
    }
    r.shadowMap.needsUpdate = su;
  }
  /** Si corresponde el recuadro en este cuadro (primera persona, prendido, con pesista y sin transición de cámara); muestra u oculta su marco. */
  _recuadroOn() { const X = this.recuadro, a = this.activo, on = !!this.pov && X.on && (X.pedido || !this.directo) && !!a && a.root.visible && !this.rig.mezcla; if (X.el && X.el.hidden === on) X.el.hidden = !on; return on; }
  /**
   * Cámara general congelada (el juego, desde que termina el intento hasta que se va el veredicto): ni deriva, ni reencuadre,
   * ni el lente que volvía a abrirse después de la barrita (eso se veía como un reencuadre leve antes de soltar la barra).
   */
  fijarCamara(on) { this._fija = !!on; this.rig.fijo = !!on; if (on) { this.rig.zoom = this.rig.zoomT; this.rig.az = this.rig.azT; this.rig.el = this.rig.elT; } }
  /** Prende o apaga el recuadro de la primera persona (Opciones). */
  /**
   * `pedido`: el jugador lo eligió a mano. En el camino directo («Baja» y «Móvil») el recuadro es un segundo dibujo entero de la
   * escena en cada cuadro (por software, +170 % y +180 % del cuadro): ahí va apagado salvo que se lo pida.
   */
  setRecuadro(on, pedido = false) { this.recuadro.on = !!on; this.recuadro.pedido = !!pedido; }
  /** La cabeza propia no se dibuja con la cámara pegada a los ojos (ver POV): entrando o saliendo de la primera persona, tampoco. */
  _cabeza() {
    const a = this.activo, cerca = !!a && a.root.visible && (!!this.pov || this.rig.camera.position.distanceTo(this.ojos(_pd)) < POV.sinCabeza), quien = cerca ? a : null;
    if (quien === this._sinCabeza) return;
    for (const [x, e] of [[this._sinCabeza, 1], [quien, SIN_CABEZA]]) { const h = x?._byName.get('Neck'); if (h) { h.scale.setScalar(e); h.updateMatrixWorld(true); }
      // pelo, barba, ojos y pestañas no se dibujan: achicados al punto del cuello quedaban como un pozo oscuro entre las clavículas al mirar hacia abajo
      if (x) for (const m of [...x.meshes, x.hairDepth]) if (m && (m === x.hairDepth || /^(Hair|Eyes|Lashes)$/.test(m.material?.name))) m.visible = e === 1;
      if (x?.skin?.uSinCabeza) x.skin.uSinCabeza.value = e === 1 ? 0 : 1; }      // y lo que queda del cuello se pinta de piel lisa (athlete.js: pesoCabeza)
    this._sinCabeza = quien; this.sombra = Math.max(this.sombra, 2);
  }
  /**
   * Primer plano por clave (SHOTS del visor o PLANOS del juego). `encuadre`: {x, y} fracción del lienzo (desde arriba a la
   * izquierda) donde tiene que quedar el sujeto, para dejarlo en la parte libre cuando un panel tapa un costado o el pie.
   */
  primerPlano(clave, encuadre = null, suave = 0) {
    if (suave) this.rig.suave(suave); else this.rig.mezcla = null;
    this._pov(false);
    const base = PLANOS[clave] || SHOTS.find(s => s.key === clave) || null, h = this.P?.h || 1.75;
    // LIF-50, teléfono parado: con márgenes de la gráfica arriba y abajo (main.js, margenVertical), el sujeto del primer plano
    // va al centro de lo que queda libre y no detrás de la barrita y el botón
    // Los planos cerrados del visor (torso, cara, brazos y barra) se piensan apaisados: parado, con un tercio del ancho, cortaban
    // la cara; van 1,7 veces más lejos (del pecho a la cabeza entera en la ceremonia)
    const I = this.rig.inset; if (!encuadre && base && !['jurado', 'jueces'].includes(base.punto) && (I.t || I.b)) encuadre = { x: .5, y: (I.t + 1 - I.b) / 2, ...(!base.dAbs && this.vertical ? { dAbs: base.d * h * 1.7 } : {}) };
    const dAbs = encuadre?.dAbs || base?.dAbs, sh = base && dAbs ? { ...base, d: dAbs / h } : base;
    this.plano = sh; this.encuadre = encuadre; this.rig.setShot(sh); if (sh) this._apuntar();      // setShot primero: el corrimiento usa el ángulo del plano
  }
  _apuntar() {
    const a = this.activo, sh = this.plano; if (!sh) return;
    if (sh.punto === 'manga') v2.copy(this.barbell.group.position).add(v.set(.92, .02, 0));
    else if (sh.punto === 'jurado') v2.set(0, .75, 0);
    else if (sh.punto === 'jueces') v2.set(0, -.02, 7.3);
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
    if (v.z > 1 || v.z < -1) return { x: -9999, y: -9999 };      // detrás de la cámara (primera persona): fuera de la pantalla
    return { x: (v.x + 1) / 2 * this.canvas.clientWidth, y: (1 - v.y) / 2 * this.canvas.clientHeight };
  }
  /**
   * Cajas del pesista y de la barra en la página (px CSS), proyectadas con la cámara de este cuadro. Para las pruebas que
   * miden cuánto tapa la interfaz (check_barra, check_telefono; tools/tapa.mjs). Cuerpo: todos los huesos menos `Bar`, con 6 %
   * de la estatura de más a cada lado (la carne alrededor del hueso); `torso`: de la cabeza a la cadera; `cabeza`: un cuadrado
   * centrado entre la base del cráneo (hueso Head) y la coronilla (21 cm más arriba a lo largo del hueso, por estatura), 1,24
   * veces esa distancia de lado (cara, pelo y orejas). Barra: las
   * puntas y los discos; `alta`: la barra está arriba de la cabeza. Desde los ojos (primera persona: la cámara a menos de
   * 60 cm de la cabeza) no hay cabeza que tapar: `ojos` y, si está prendido, la caja del `recuadro` (la vista de afuera).
   * Lo que queda detrás de la cámara va en null.
   * null sin pesista, o con el contenido girado (las cajas no se pueden comparar con las de la página).
   */
  cajas() {
    const a = this.activo; if (!a || document.documentElement.classList.contains('rotado')) return null;
    const cam = this.rig.camera, R = this.canvas.getBoundingClientRect(), W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const px = p => { p.project(cam); return { x: R.left + (p.x + 1) / 2 * W, y: R.top + (1 - p.y) / 2 * H, z: p.z }; };
    const caja = ps => (ps.some(p => !(p.z > -1 && p.z < 1)) ? null : { l: Math.min(...ps.map(p => p.x)), r: Math.max(...ps.map(p => p.x)), t: Math.min(...ps.map(p => p.y)), b: Math.max(...ps.map(p => p.y)) });
    a.root.updateMatrixWorld(true); cam.updateMatrixWorld();
    const nombre = b => b.name.replace(/^mixamorig:?/, ''), huesos = a.bones.filter(b => b !== a.barBone && !/_end$/i.test(nombre(b)) || nombre(b) === 'HeadTop_End');
    const hueso = n => huesos.find(b => nombre(b) === n), yBar = this.barY ?? 1, zBar = this.barZ ?? 0;
    const hC = hueso('Head'), yC = hC ? hC.getWorldPosition(v).y : 9, ojos = !!hC && cam.getWorldPosition(v2).distanceTo(hC.getWorldPosition(v)) < .6;
    const cuerpo = caja(huesos.map(b => px(b.getWorldPosition(v)))), m = cuerpo ? (cuerpo.b - cuerpo.t) * .06 : 0;
    const T = new Set(['Head', 'HeadTop_End', 'Neck', 'Spine', 'Spine1', 'Spine2', 'Hips', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm']);
    const torso = caja(huesos.filter(b => T.has(nombre(b))).map(b => px(b.getWorldPosition(v))));
    let cabeza = null;
    if (hC && !ojos) { const k = (this.P?.h || 1.7) / 1.7, p0 = px(hC.getWorldPosition(v)), p1 = px(v.setFromMatrixColumn(hC.matrixWorld, 1).normalize().multiplyScalar(.21 * k).add(hC.getWorldPosition(v2))); if (caja([p0, p1])) { const h = Math.max(3, Math.hypot(p1.x - p0.x, p1.y - p0.y) * .62), cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2; cabeza = { l: cx - h, r: cx + h, t: cy - h, b: cy + h }; } }
    const barra = caja([-1.1, 1.1].flatMap(x => [-.225, .225].map(d => px(v.set(x, yBar + d, zBar)))));
    let recuadro = null;
    if (ojos && this._recuadroOn?.()) { const fw = W < 900 ? RECUADRO.angosto : RECUADRO.ancho, fh = Math.min(.42, fw * W / H * RECUADRO.alto), fx = 1 - RECUADRO.x - fw, fy = Math.max(RECUADRO.y, RECUADRO.yMin / H); recuadro = { l: R.left + fx * W, r: R.left + (fx + fw) * W, t: R.top + fy * H, b: R.top + (fy + fh) * H }; }
    return { cuerpo: cuerpo && !ojos ? { l: cuerpo.l - m, r: cuerpo.r + m, t: cuerpo.t - m, b: cuerpo.b + m * .3 } : null, torso: torso && !ojos ? { l: torso.l - m, r: torso.r + m, t: torso.t - m, b: torso.b } : null, cabeza, barra, alta: yBar > yC, ojos, recuadro };
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
    this._apuntar(); this.rig.update(dt); this._cabeza(); this._recuadroOn(); this._vigilar(dt); this.viva.aplicar(this.rig.camera, dt, this.rig.focusDistance); this.trace.face(this.rig.camera); this.post.focus = this.pov ? 6 : this.rig.focusDistance; this.post.cerca = this.pov || this.plano?.key === 'jurado' ? .1 : .35; this.arena.update(dt, this.rig.camera); this.ambiente.update(dt); this.jueces.update(dt); this._detalle();
    if (!pintar) return;
    const r = this.renderer, girado = false;      // con el cuerpo propio dibujado girado (primera persona) la sombra no se actualiza: saldría la del cuerpo girado
    r.shadowMap.needsUpdate = this.sombra > 0 && !girado; if (this.sombra > 0 && !girado) this.sombra--;
    this._dibujar(dt);
  }
  /**
   * Cortes a la vista: entre este cuadro y el anterior la cámara saltó (más de 0,5 m, 10° o 4° de lente), cambió el pesista,
   * o la barra o la cadera del pesista saltaron (más de 0,35 m y 0,25 m: nada se mueve tan rápido en 50 ms). Con la imagen
   * tapada por un fundido no cuenta. Un cuadro es un corte aunque tenga varias razones.
   */
  _vigilar(dt) {
    const W = this.vigia, cam = this.rig.camera, a = this.activo, d = cam.getWorldDirection(W.q), r = [];
    const cad = a ? a.boneWorld('Hips', v2) : null;
    if (W.listo && dt > 0 && dt <= .05 && !this.velado) {
      if (cam.position.distanceTo(W.p) > .5 || d.angleTo(W.d) > .17 || Math.abs(cam.fov - W.fov) > 4) r.push('camara');
      if ((this.id ?? null) !== W.id) r.push('pesista');
      else if (cad && cad.distanceTo(W.cad) > .25) r.push('pose');
      if (Math.hypot(this.barY - W.bar[0], (this.barZ ?? 0) - W.bar[1]) > .35 && !r.includes('pesista')) r.push('barra');
      if (r.length) try { this.alCorte?.(r); } catch { /* solo medición */ }
    }
    W.p.copy(cam.position); W.d.copy(d); W.fov = cam.fov; W.bar[0] = this.barY; W.bar[1] = this.barZ ?? 0; W.id = this.id ?? null; if (cad) W.cad.copy(cad); W.listo = true;
  }
  _dibujar(dt) {
    if (this.directo) { const r = this.renderer; r.setRenderTarget(null); r.render(this.scene, this.rig.camera); this._recuadro(); return; }
    // reflejo de la tarima (calidades altas): la escena desde la cámara espejada, sin la tarima, el escenario ni lo que no se refleja
    if (this.reflejo.activo) { const A = this.arena; this.reflejo.render(this.renderer, this.scene, this.rig.camera, [A.tarima, A.escenario, this.trace.group, this.ambiente.polvo, A.bokeh, A.flashMesh].filter(Boolean)); }
    // primera persona: la barra que cruza la vista deja una estela corta (el desenfoque de movimiento que ya tiene el post, solo sobre la barra)
    this.post.motion.set(0, 0);
    if (this.pov && !this.reduceMotion) { const q = _pb.copy(this.barbell.group.position).project(this.rig.camera), ok = q.z > -1 && q.z < 1, u = this._mbUV ||= new THREE.Vector3(9, 9, 0);
      if (ok && u.z === 1 && dt > 0 && dt < .1) this.post.motion.set((q.x - u.x) * .5 * POV.estela, (q.y - u.y) * .5 * POV.estela); u.set(q.x, q.y, ok ? 1 : 0); }
    this.post.render(dt); this._recuadro();
  }
}
