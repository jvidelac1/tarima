// El cuerpo por código como malla de three.js sobre el esqueleto de un pesista ya cargado (Athlete): mismos huesos, mismas
// poses. El material es una función por píxel: color de base por vértice y capas (malla, panel, medias, pelo, cejas) que se
// cortan nítidas porque viajan como distancias con signo interpoladas; el diseño del pecho y la espalda es un canvas 2D
// (emblema, sigla, nombre y dorsal) proyectado de frente y de espalda. Nada de imágenes ni modelos.
import * as THREE from 'three';
import { generar, firma } from './generar.js';

const boneKey = n => n.replace(/^mixamorig:?/, '');
const lin = c => (c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));

/** Esqueleto de un Athlete en el formato del generador. */
export function esqueletoDe(atleta) {
  const m = atleta.meshes.find(o => o.isSkinnedMesh), sk = m.skeleton, B = sk.bones;
  return { sk, malla: m, nombres: B.map(b => boneKey(b.name)), padre: B.map(b => B.indexOf(b.parent)), reposo: sk.boneInverses.map(i => i.clone().invert().toArray()) };
}

/**
 * Diseño de la malla dibujado con canvas 2D: mitad izquierda, el pecho; mitad derecha, la espalda. Cada mitad cubre 50 cm
 * de ancho por 50 cm de alto (1024 px por metro). Cambiar el emblema, la sigla o el dorsal es tocar estas líneas.
 */
export function disenoMalla(F) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d'), c = F.color, D = F.diseno || {};
  g.clearRect(0, 0, 1024, 512); g.textAlign = 'center'; g.textBaseline = 'middle';
  // pecho: emblema ficticio (un sol naciente sobre una barra, en un rectángulo) y, si la ficha la trae, la sigla del país
  const em = (F.ropa && F.ropa.emblema) || [.062, -.075, .033, .023], yA0 = .38, px = 1024;      // la mitad del canvas cubre x ±0,25 m; y desde yA − 0,38 hasta yA + 0,12
  const ex = 256 + em[0] * px, ey = 512 - (yA0 + em[1]) * px, ew = em[2] * px, eh = em[3] * px;
  g.fillStyle = c.panel; g.beginPath(); g.roundRect(ex - ew, ey - eh, ew * 2, eh * 2, 4); g.fill();
  g.fillStyle = c.malla; g.beginPath(); g.arc(ex, ey + eh * .3, eh * .62, Math.PI, 0); g.fill(); g.fillRect(ex - ew * .7, ey + eh * .42, ew * 1.4, eh * .2);
  g.fillStyle = c.vivo; g.font = '800 46px "Saira Condensed", "Arial Narrow", system-ui, sans-serif'; if (D.sigla ?? 'DRV') g.fillText(D.sigla ?? 'DRV', 256, 236);
  // espalda: nombre y dorsal
  g.font = '800 40px "Saira Condensed", "Arial Narrow", system-ui, sans-serif'; if (D.nombre ?? 'KORDAN') g.fillText((D.nombre ?? 'KORDAN').toUpperCase(), 768, 205);
  g.font = '800 104px "Saira Condensed", "Arial Narrow", system-ui, sans-serif'; g.fillStyle = c.panel; if (D.dorsal ?? 9) g.fillText(String(D.dorsal ?? 9), 768, 285);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}

const PARS_V = /* glsl */`attribute vec4 aSup; attribute vec4 aSup2; attribute vec3 aGen; varying vec4 vSup; varying vec4 vSup2; varying vec3 vGen;`;
const PARS_F = /* glsl */`
varying vec4 vSup; varying vec4 vSup2; varying vec3 vGen;
uniform vec3 uMalla; uniform vec3 uPanel; uniform vec3 uVivo; uniform vec3 uMedia; uniform vec3 uPelo; uniform vec3 uCorrea; uniform vec3 uVenda2; uniform vec3 uRod2; uniform sampler2D tDiseno; uniform vec3 uCaja; uniform float uBarba;
float gRug = 0.6; float gMet = 0.0; float gEsp = 1.0; uniform vec4 uGan;
float capa( float d ) { float w = fwidth( d ) * 0.75 + 1e-6; return smoothstep( -w, w, d ); }
float cHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float cRuido( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( cHash( i ), cHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cHash( i + vec2( 0.0, 1.0 ) ), cHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
`;
// después de color_fragment: diffuseColor trae el color de base del vértice
const CAPAS_F = /* glsl */`
{
  float tipo = vSup2.z;
  if ( tipo < 0.5 ) {
    // piel mate de un tono, con una variación apenas (manchas grandes y suaves)
    float var = cRuido( vGen.xy * 9.0 + vGen.z * 7.0 ) - 0.5; diffuseColor.rgb *= ( 1.0 + var * 0.06 ) * ( vSup.x < -2.0 ? uGan.z : uGan.x ); gRug = 0.62; gEsp = 0.5;
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uPelo, 0.6 ), capa( vSup.w ) );
    if ( vSup.x < -2.0 ) { diffuseColor.rgb = mix( diffuseColor.rgb, uCorrea, capa( vSup2.w ) ); gRug = 0.6; }      // zapatilla: la correa
    else { float med = capa( vSup.y ); diffuseColor.rgb = mix( diffuseColor.rgb, uMedia * uGan.z, med ); gRug = mix( gRug, 0.9, med ); }
    float tl = capa( vSup.x );
    if ( tl > 0.0 ) {
      vec3 tela = mix( uMalla, uPanel, capa( vSup2.x ) );
      // diseño de canvas: pecho (z adelante) y espalda (espejado para que se lea)
      float fr = step( uCaja.z, vGen.z ); vec2 uv = vec2( ( fr > 0.5 ? vGen.x : - vGen.x ) / 0.5 + 0.5, ( vGen.y - uCaja.y ) / 0.5 );
      if ( uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0 ) { vec4 d = texture2D( tDiseno, vec2( uv.x * 0.5 + ( fr > 0.5 ? 0.0 : 0.5 ), uv.y ) ); tela = mix( tela, d.rgb, d.a ); }
      tela = mix( tela, uVivo, ( 1.0 - capa( abs( vSup.x - 0.004 ) - 0.004 ) ) );      // vivo en el borde (escote, sisas, botamanga)
      diffuseColor.rgb = mix( diffuseColor.rgb, tela * uGan.y, tl ); gRug = mix( gRug, 0.8, tl ); gEsp = mix( gEsp, 0.6, tl );
    }
    float pelo = max( capa( vSup.z ), capa( vSup2.y ) ); diffuseColor.rgb = mix( diffuseColor.rgb, uPelo, pelo ); gRug = mix( gRug, 0.9, pelo ); gEsp = mix( gEsp, 0.12, pelo );
  } else if ( tipo < 2.5 ) { gRug = 0.55; float l = vSup2.x * 6.2832; diffuseColor.rgb *= 0.92 + 0.08 * cRuido( vec2( vSup2.x * 90.0, vGen.y * 60.0 ) ); }      // cuero
  else if ( tipo < 3.5 ) { gRug = 0.92; gEsp = 0.4; float a = vSup2.x, t = vSup2.y; diffuseColor.rgb = mix( diffuseColor.rgb, uRod2, ( 1.0 - capa( abs( a - ( 0.1 + 0.1 * sin( t * 3.1416 ) ) ) - 0.012 ) ) * step( 0.12, t ) * step( t, 0.88 ) ); }      // neopreno
  else if ( tipo < 4.5 ) gRug = 0.85;      // goma
  else if ( tipo < 5.5 ) gRug = 0.6;       // zapatilla
  else if ( tipo < 6.5 ) gRug = 0.25;      // ojo
  else if ( tipo < 7.5 ) { gRug = 0.42; gMet = 0.7; }      // metal
  else if ( tipo < 8.5 ) { gRug = 0.9; gEsp = 0.4; float t = vSup2.y; diffuseColor.rgb = mix( diffuseColor.rgb, uVenda2, max( 1.0 - capa( abs( t - 0.33 ) - 0.07 ), 1.0 - capa( abs( t - 0.63 ) - 0.07 ) ) ); }       // venda
  else gRug = 0.5;                         // madera del taco
}
`;

/** Material del cuerpo por código. */
export function materialCuerpo(M) {
  const F = M.ficha, C = k => new THREE.Color(F.color[k]);
  const U = { uMalla: { value: C('malla') }, uPanel: { value: C('panel') }, uVivo: { value: C('vivo') }, uMedia: { value: C('media') }, uPelo: { value: C('pelo') }, uCorrea: { value: C('correa') }, uVenda2: { value: C('venda2') }, uRod2: { value: C('rodillera2') }, tDiseno: { value: disenoMalla(F) },
    uCaja: { value: new THREE.Vector3(0, M.ref.yA - .38, .02) }, uBarba: { value: F.barba ? 1 : 0 }, uGan: { value: new THREE.Vector4(...(F.ganancia || [.7, .55, .62, 1])) } };      // uGan: ganancia de piel, tela y medias/zapatillas bajo los focos de la sala (el tono AgX lava lo claro)
  const m = new THREE.MeshStandardMaterial({ name: 'CuerpoCodigo', vertexColors: true, roughness: .6, metalness: 0, envMapIntensity: .35 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + PARS_V).replace('#include <begin_vertex>', '#include <begin_vertex>\nvSup = aSup; vSup2 = aSup2; vGen = aGen;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS_F).replace('#include <color_fragment>', '#include <color_fragment>\n' + CAPAS_F)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = gRug; metalnessFactor = gMet;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor *= gEsp; material.specularColorBlended *= gEsp; material.specularF90 *= gEsp;');
  };
  m.customProgramCacheKey = () => 'cuerpo-codigo-2'; m.userData.cuerpo = U; return m;
}

// La malla generada se guarda en IndexedDB con la firma de sus entradas: la segunda carga no la rehace (en un teléfono generar tarda varios segundos).
const BD = () => new Promise((ok, mal) => { const r = indexedDB.open('tarima-cuerpo', 1); r.onupgradeneeded = () => r.result.createObjectStore('mallas'); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
const guardado = async clave => { const bd = await BD(); return new Promise(ok => { const r = bd.transaction('mallas').objectStore('mallas').get(clave); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); };
const guardar = async (clave, M) => { const bd = await BD(), t = bd.transaction('mallas', 'readwrite'), s = t.objectStore('mallas'); s.clear(); s.put(M, clave); return new Promise((ok, mal) => { t.oncomplete = ok; t.onerror = () => mal(t.error); }); };

/**
 * Crea el cuerpo por código sobre los huesos de `atleta` y lo agrega a `escena` (un Object3D). Devuelve
 * { malla, info, M, quitar() }. La malla comparte los huesos del Athlete (más los auxiliares, que se mueven solos antes de
 * cada cuadro), así cualquier pose que se le ponga al pesista la sigue; va «suelta» (detached): `malla.position` la corre.
 */
export async function crearCuerpo(atleta, escena, { calidad = 'alta', ficha = {}, cache = true } = {}) {
  const E = esqueletoDe(atleta), esq = { nombres: E.nombres, padre: E.padre, reposo: E.reposo }; let M = null, clave = null, deCache = false;
  if (cache) { try { clave = firma(esq, ficha, calidad); M = await guardado(clave); deCache = !!M; } catch { M = null; } }
  if (!M) { M = generar(esq, ficha, calidad); if (cache && clave) guardar(clave, M).catch(() => null); }
  M.info.deCache = deCache;
  const B = E.sk.bones, n = M.pos.length / 3;
  const geo = new THREE.BufferGeometry(), col = new Float32Array(n * 3); for (let i = 0; i < col.length; i++) col[i] = lin(M.col[i]);
  geo.setAttribute('position', new THREE.BufferAttribute(M.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(M.nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(M.ji, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(M.jw, 4));
  geo.setAttribute('aSup', new THREE.BufferAttribute(M.sup, 4)); geo.setAttribute('aSup2', new THREE.BufferAttribute(M.sup2, 4)); geo.setAttribute('aGen', new THREE.BufferAttribute(M.gen, 3));
  geo.setIndex(new THREE.BufferAttribute(M.ind, 1)); geo.computeBoundingSphere();
  // huesos auxiliares: hijos del padre, en el lugar del hijo, con la mitad de su giro respecto del reposo
  const por = k => B.find(b => boneKey(b.name) === k), aux = M.aux.map(([nombre, padre, hijo]) => {
    const p = por(padre), h = por(hijo), ip = B.indexOf(p), ih = B.indexOf(h), b = new THREE.Bone(); b.name = nombre;
    const loc = new THREE.Matrix4().fromArray(E.reposo[ip]).invert().multiply(new THREE.Matrix4().fromArray(E.reposo[ih])), q0 = new THREE.Quaternion().setFromRotationMatrix(loc);
    p.add(b); return { b, h, q0, inv: E.sk.boneInverses[ih].clone() }; });
  const sk = new THREE.Skeleton([...B, ...aux.map(a => a.b)], [...E.sk.boneInverses.map(m => m.clone()), ...aux.map(a => a.inv)]), base = sk.update.bind(sk);
  const mover = () => { for (const a of aux) { a.b.position.copy(a.h.position); a.b.scale.copy(a.h.scale); a.b.quaternion.copy(a.q0).slerp(a.h.quaternion, .5); a.b.updateMatrix(); a.b.matrixWorld.multiplyMatrices(a.b.parent.matrixWorld, a.b.matrix); } };
  sk.update = () => { mover(); base(); };
  const malla = new THREE.SkinnedMesh(geo, materialCuerpo(M)); malla.name = 'CuerpoCodigo'; malla.bindMode = THREE.DetachedBindMode; malla.bind(sk, new THREE.Matrix4());
  malla.frustumCulled = false; malla.castShadow = malla.receiveShadow = true; escena.add(malla);
  return { malla, M, info: M.info, mover, quitar() { malla.removeFromParent(); geo.dispose(); malla.material.userData.cuerpo.tDiseno.value.dispose(); malla.material.dispose(); for (const a of aux) a.b.removeFromParent(); } };
}
