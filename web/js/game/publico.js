// Público de personas (Gráficos fase 4). Reemplaza las siluetas de «bolo» de arena.js sin tocar el visor:
// - Las 16 variantes de publico_gente.js (personas modeladas por código) se dibujan UNA vez a un atlas: R = luz de sala
//   (cenital), G = luz que llega del escenario (de frente y desde abajo), B = material (0 ropa, ½ piel, 1 pelo), A = recorte.
//   El color de ropa, piel y pelo sigue saliendo de cada instancia, así no hay dos espectadores iguales.
// - Con el ánimo del público (ovación) una parte creciente levanta los brazos: cambia de variante en el sombreador.
// - Sin profundidad de campo («Baja», «Móvil») no se dibujan miles de siluetas: cada tribuna se hornea una vez, con las
//   mismas personas, a una textura con una banda por fila, y se dibuja como una tira vertical por fila.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VARIANTES, QUIETAS, armar } from './publico_gente.js';
import { azar } from './gente.js';

const COLS = 8, FILAS = 2, CW = .9, CH = 1.25, Y0 = .4, PX = 144, PY = 200;
const MAT = { piel: .5, pelo: 1, esclera: .5, iris: 1, marco: 1 }, TONO = { pantalon: .34, zapato: .2, silla: .3, camisa: 1.5, corbata: .6, esclera: .9, iris: .5 };
const ATLAS_VS = /* glsl */`attribute float aMat; attribute float aTono; varying vec3 vN; varying float vMat; varying float vTono;
void main(){ vN = normal; vMat = aMat; vTono = aTono; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const ATLAS_FS = /* glsl */`varying vec3 vN; varying float vMat; varying float vTono;
void main(){
  vec3 n = normalize( vN ); if ( ! gl_FrontFacing ) n = - n;
  float sala = ( 0.22 + 0.78 * clamp( n.y * 0.75 + 0.3, 0.0, 1.0 ) ) * vTono;
  float esc = pow( clamp( dot( n, normalize( vec3( 0.18, -0.28, 0.94 ) ) ), 0.0, 1.0 ), 1.2 ) * vTono;
  gl_FragColor = vec4( sala, esc, vMat, 1.0 );
}`;
/** Una malla por variante con el material (aMat) y el tono propio de la pieza (aTono: pantalón oscuro, sombras de la cara). */
function mallaVariante(v, i) {
  const gs = armar(v, i).map(({ g, parte }) => {
    const n = g.attributes.position.count, m = new Float32Array(n).fill(MAT[parte] ?? 0), t = new Float32Array(n).fill(TONO[parte] ?? 1), s = g.attributes.sombra;
    if (s) for (let k = 0; k < n; k++) t[k] *= s.getX(k);
    g.deleteAttribute('sombra'); g.deleteAttribute('tinte'); g.setAttribute('aMat', new THREE.BufferAttribute(m, 1)); g.setAttribute('aTono', new THREE.BufferAttribute(t, 1)); return g;
  });
  const g = mergeGeometries(gs); gs.forEach(x => x.dispose()); return g;
}

const CROWD_FS = /* glsl */`
uniform sampler2D map; uniform float uGain; uniform vec3 uRebote; uniform vec3 uSala; uniform float uHorneo; uniform float uSuave;
varying vec2 vUv; varying vec3 vCloth; varying vec3 vSkin; varying vec3 vHair;
#include <fog_pars_fragment>
void main(){
  // uSuave: sesgo de mipmap. La tribuna de una foto de competencia está fuera de foco: siluetas blandas, no recortes nítidos
  vec4 t = texture2D( map, vUv, uSuave ); if ( t.a < 0.38 ) discard;
  // ropa: en la penumbra nadie viste de blanco; lo claro se comprime y todo pierde color (la sala la pinta la luz, no la ropa)
  vec3 ropa = vCloth; float lr = dot( ropa, vec3( 0.3, 0.6, 0.1 ) ); ropa *= mix( 1.0, 0.36, smoothstep( 0.1, 0.55, lr ) );
  vec3 col = mix( ropa, vSkin * 0.82, smoothstep( 0.2, 0.42, t.b ) ); col = mix( col, vHair * 0.7, smoothstep( 0.68, 0.9, t.b ) );
  col = mix( vec3( dot( col, vec3( 0.3, 0.6, 0.1 ) ) ), col, uHorneo > 0.0 ? 0.3 : 0.5 );      // horneada (sin gradación encima): menos color todavía
  // luz: la de sala cae pareja y fría; la del escenario llega de frente, cálida, y solo levanta lo que la mira (cara, pecho, rodillas)
  float esc = t.g * t.g * ( 3.0 - 2.0 * t.g );
  gl_FragColor = vec4( col * ( uSala * ( t.r * uGain ) + uRebote * esc ), 1.0 );
  #include <fog_fragment>
  if ( uHorneo > 0.0 ) gl_FragColor.rgb = pow( clamp( gl_FragColor.rgb * uHorneo, 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
}`;
/** Ganancia con la que se guarda la tribuna horneada (8 bits: el público es oscuro y sin esto se escalona). */
const HORNEO = 6;
/** En el camino directo (sin gradación ni viñeta del pase final) el mismo público queda más claro: se baja acá. */
const DIRECTO = .3;

export class Publico {
  /** `animo`: el uniform {value} del ánimo del público (ambiente.publico.uAnimo). `chico`: texturas a la mitad (teléfono). */
  constructor(arena, renderer, { animo = { value: 0 }, chico = false } = {}) {
    this.arena = arena; this.renderer = renderer; this.chico = chico; this.listo = false;
    const crowd = arena.crowd; if (!crowd || !crowd.material?.vertexShader?.includes('( uv.x + aVar ) * 0.25')) return;
    this._atlas();
    // --- las siluetas instanciadas pasan a usar el atlas: plano más grande (entran los brazos en alto), 16 variantes
    const m = crowd.material, g = crowd.geometry, P = g.attributes.position;
    const nuevo = new THREE.PlaneGeometry(CW, CH); nuevo.translate(0, CH / 2 - (.45 - Y0), 0); P.array.set(nuevo.attributes.position.array); P.needsUpdate = true; nuevo.dispose();
    const r = azar(4242), aV = g.attributes.aVar;
    for (let i = 0; i < aV.count; i++) { const x = r(); aV.setX(i, x < .975 ? Math.floor(r() * QUIETAS) : 10 + Math.floor(r() * 2)); /* quietos: los brazos en alto son de la ovación (uFiesta) */ }
    aV.needsUpdate = true;
    m.vertexShader = m.vertexShader.replace('varying vec2 vUv;', 'uniform float uFiesta; varying vec2 vUv;')
      .replace('vUv = vec2( ( uv.x + aVar ) * 0.25, uv.y );', `float var = aVar; float h = fract( dot( instanceMatrix[ 3 ].xyz, vec3( 0.731, 1.37, 0.413 ) ) );
  if ( uFiesta * 0.75 > h && var < ${QUIETAS}.0 ) var = 10.0 + floor( fract( h * 7.3 ) * 6.0 );      // con la ovación, más gente aplaude o festeja
  vUv = vec2( ( uv.x + mod( var, ${COLS}.0 ) ) / ${COLS}.0, ( uv.y + floor( var / ${COLS}.0 ) ) / ${FILAS}.0 );`);
    m.fragmentShader = CROWD_FS; m.userData.conTono = false;
    Object.assign(m.uniforms, { uFiesta: animo, uSala: { value: new THREE.Color(.5, .62, .95) }, uHorneo: { value: 0 }, uSuave: { value: 1.7 } });
    m.uniforms.map.value = this.atlas.texture; m.uniforms.uGain.value = .075; m.uniforms.uRebote.value.set(.05, .035, .024); m.needsUpdate = true;
    arena.crowdTex?.dispose(); arena.crowdTex = this.atlas.texture;
    // --- tribunas horneadas: se arman la primera vez que una calidad sin profundidad de campo las pide
    if (arena.impostors) { arena.impostors.removeFromParent(); arena.impostors.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }); arena.impostors = null; }
    const sq = arena.setQuality.bind(arena);
    arena.setQuality = q => { if (!q.dof && !arena.impostors) { try { this._hornear(); } catch (e) { console.warn('publico: horneado', e); } } sq(q); };
    this.listo = true;
  }
  /** Dibuja las variantes al atlas (una vez). */
  _atlas() {
    const r = this.renderer, rt = this.atlas = new THREE.WebGLRenderTarget(COLS * PX, FILAS * PY, { samples: 4, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
    rt.texture.name = 'público (atlas)';
    const sc = new THREE.Scene(), mat = new THREE.ShaderMaterial({ vertexShader: ATLAS_VS, fragmentShader: ATLAS_FS, side: THREE.DoubleSide });
    const cam = new THREE.OrthographicCamera(0, COLS * CW, FILAS * CH, 0, .1, 20); cam.position.set(0, 0, 8); cam.updateMatrixWorld();
    const gs = [];
    VARIANTES.forEach((v, i) => { const g = mallaVariante(v, i); gs.push(g); const o = new THREE.Mesh(g, mat); o.position.set((i % COLS + .5) * CW, Math.floor(i / COLS) * CH - Y0, 0); o.frustumCulled = false; sc.add(o); });
    this._dibujar(sc, cam, rt, new THREE.Color(0, 0, 0), 0);
    gs.forEach(g => g.dispose()); mat.dispose();
  }
  _dibujar(sc, cam, rt, fondo, alfa) {
    const r = this.renderer, prev = r.getRenderTarget(), col = r.getClearColor(new THREE.Color()), a = r.getClearAlpha(), auto = r.autoClear, sm = r.shadowMap.autoUpdate, need = r.shadowMap.needsUpdate;
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; r.setRenderTarget(rt); r.setClearColor(fondo, alfa); r.autoClear = true; r.clear(); r.render(sc, cam);
    r.setRenderTarget(prev); r.setClearColor(col, a); r.autoClear = auto; r.shadowMap.autoUpdate = sm; r.shadowMap.needsUpdate = need;
  }
  /**
   * Tribunas horneadas: una textura por tribuna con una banda por fila (cada fila se dibuja sola, recortada en profundidad)
   * y una tira vertical por fila en su lugar. Se ve como el público de verdad desde cualquier cámara (las filas se tapan
   * entre sí) con cuatro llamadas de dibujo en total.
   */
  _hornear() {
    const A = this.arena, crowd = A.crowd, mat = crowd.material, g0 = crowd.geometry, grupo = new THREE.Group(); grupo.name = 'tribunas horneadas';
    const BH = 1.5, M = new THREE.Matrix4(), r = this.renderer, fondo = new THREE.Color(.03, .032, .04); mat.uniforms.uHorneo.value = HORNEO;
    A.stands.forEach((st, si) => {
      const ids = []; A.seats.forEach((s, i) => { if (s.si === si) ids.push(i); });
      const g = new THREE.InstancedBufferGeometry(); g.index = g0.index; for (const k of ['position', 'uv']) g.setAttribute(k, g0.attributes[k]);
      for (const k of ['aCloth', 'aSkin', 'aHair', 'aVar']) { const src = g0.attributes[k], n = src.itemSize, a = new Float32Array(ids.length * n); ids.forEach((id, j) => { for (let c = 0; c < n; c++) a[j * n + c] = src.array[id * n + c]; }); g.setAttribute(k, new THREE.InstancedBufferAttribute(a, n)); }
      const im = new THREE.InstancedMesh(g, mat, ids.length); ids.forEach((id, j) => { crowd.getMatrixAt(id, M); im.setMatrixAt(j, M); }); im.frustumCulled = false;
      const sc = new THREE.Scene(); sc.add(im);
      const W = 1024 >> (st.w < 30 ? 1 : 0),      /* chica a propósito: ampliada queda fuera de foco, como la tribuna de una foto, y pesa un cuarto */
       ancho = st.w + .6, banda = Math.max(16, Math.round(W * BH / ancho)), rt = new THREE.WebGLRenderTarget(W, banda * st.rows, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace });
      rt.texture.anisotropy = 4; rt.texture.name = 'tribuna horneada ' + si; rt.scissorTest = true;
      const bx = st.back[0], bz = st.back[1], atras = new THREE.Vector3(bx, 0, bz), cam = new THREE.OrthographicCamera(-ancho / 2, ancho / 2, BH / 2, -BH / 2, 9.6, 10.4), pos = [], uv = [], idx = [], der = new THREE.Vector3(), c = new THREE.Vector3();
      const prev = r.getRenderTarget(), col = r.getClearColor(new THREE.Color()), al = r.getClearAlpha(), auto = r.autoClear, sm = r.shadowMap.autoUpdate, need = r.shadowMap.needsUpdate;
      r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; r.autoClear = false; r.setClearColor(fondo, 0);
      for (let k = 0; k < st.rows; k++) {
        c.set(st.o[0] + bx * k * A._depth, st.o[1] + k * A._rise, st.o[2] + bz * k * A._depth);      // centro del escalón de la fila k
        cam.position.copy(c).addScaledVector(atras, -10); cam.position.y += BH / 2; cam.up.set(0, 1, 0); cam.lookAt(c.x, c.y + BH / 2, c.z); cam.updateMatrixWorld();
        rt.viewport.set(0, k * banda, W, banda); rt.scissor.set(0, k * banda, W, banda); r.setRenderTarget(rt); r.clear(); r.render(sc, cam);
        der.setFromMatrixColumn(cam.matrixWorld, 0); const o = pos.length / 3;
        for (const [sx, sy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) { pos.push(c.x + der.x * sx * ancho / 2, c.y + sy * BH, c.z + der.z * sx * ancho / 2); uv.push((sx + 1) / 2, (k + sy) / st.rows); }
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      r.setRenderTarget(prev); r.setClearColor(col, al); r.autoClear = auto; r.shadowMap.autoUpdate = sm; r.shadowMap.needsUpdate = need;
      rt.viewport.set(0, 0, W, banda * st.rows); rt.scissorTest = false; g.dispose(); im.dispose();
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); pg.setIndex(idx);
      const q = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: .5, side: THREE.DoubleSide, color: new THREE.Color(.82 / HORNEO, .92 / HORNEO, 1.18 / HORNEO).multiplyScalar(DIRECTO) }));
      q.matrixAutoUpdate = false; q.frustumCulled = false; q.userData.rt = rt; grupo.add(q);
    });
    mat.uniforms.uHorneo.value = 0;
    A.impostors = grupo; A.group.add(grupo); this.horneado = grupo;
  }
  dispose() { this.atlas?.dispose(); this.horneado?.traverse(o => { o.userData.rt?.dispose(); o.geometry?.dispose(); o.material?.dispose(); }); }
}
