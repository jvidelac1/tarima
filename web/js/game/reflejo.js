// Reflejo planar de la tarima (Gráficos fase 1), solo en las calidades altas y con el camino con post (color lineal HDR).
// Cada cuadro se dibuja la escena una vez más desde la cámara espejada respecto del plano de la tarima (y = 0), a una
// fracción de la resolución, con el plano cercano oblicuo (lo que queda debajo de la tarima no entra). La cara de arriba de
// la tarima suma esa imagen según el ángulo (Fresnel: casi nada mirando desde arriba, mucho de refilón) y según lo pulida
// que esté cada zona (el mapa de rugosidad de la madera): donde hay magnesio o desgaste, el reflejo se apaga y se desenfoca
// (se lee un nivel más chico de la imagen).
import * as THREE from 'three';

const N = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _c = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _rot = new THREE.Matrix4(), _plano = new THREE.Plane(), _cp = new THREE.Vector4(), _q = new THREE.Vector4();

export class Reflejo {
  /** @param {number} y altura del plano que refleja (la cara de arriba de la tarima) */
  constructor(y = 0) {
    this.y = y; this.escala = .5; this.activo = false; this.cam = new THREE.PerspectiveCamera();
    this.rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.rt.texture.name = 'reflejo de la tarima';
    this.u = { tReflejo: { value: this.rt.texture }, uReflejoMat: { value: new THREE.Matrix4() }, uReflejo: { value: 2 } };
    this.mats = new Set();
  }
  /** Tamaño del lienzo en píxeles reales; el reflejo usa `escala` de cada lado. */
  setSize(w, h) { this.rt.setSize(Math.max(8, Math.round(w * this.escala)), Math.max(8, Math.round(h * this.escala))); }
  /**
   * Parche de un MeshStandardMaterial para que sume el reflejo. Se enciende y se apaga con `activo` (cambia el programa:
   * solo en la carga). Se encadena con el onBeforeCompile que el material ya tenga.
   */
  parchar(m) {
    if (!m || !m.isMeshStandardMaterial || this.mats.has(m)) return; this.mats.add(m);
    const antes = m.onBeforeCompile, clave = m.customProgramCacheKey, yo = this;
    m.onBeforeCompile = function (sh, r) {
      antes.call(this, sh, r); if (!yo.activo) return;
      Object.assign(sh.uniforms, yo.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uReflejoMat; varying vec4 vReflejo;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvReflejo = uReflejoMat * modelMatrix * vec4( transformed, 1.0 );');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tReflejo; uniform float uReflejo; varying vec4 vReflejo;')
        .replace('#include <opaque_fragment>', `{
		float rCos = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
		float rFres = 0.05 + 0.95 * pow( 1.0 - rCos, 5.0 );
		float rLisa = 1.0 - clamp( roughnessFactor, 0.0, 1.0 );
		vec2 rUv = vReflejo.xy / max( vReflejo.w, 1e-4 );
		vec3 rCol = texture2D( tReflejo, rUv, roughnessFactor * 4.5 ).rgb;
		outgoingLight += min( rCol, vec3( 6.0 ) ) * rFres * rLisa * rLisa * uReflejo;
	}
	#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = function () { return clave.call(this) + (yo.activo ? '|reflejo' : ''); };
  }
  /** Prende o apaga (recompila los materiales parchados: solo en la carga). */
  setActivo(on) { on = !!on; if (on === this.activo) return; this.activo = on; for (const m of this.mats) m.needsUpdate = true; }
  /**
   * Dibuja el reflejo. `ocultar`: objetos que no entran (la propia tarima, el escenario, lo que no vale la pena reflejar).
   * Devuelve false si la cámara está por debajo del plano (no hay nada que reflejar).
   */
  render(renderer, scene, camera, ocultar = []) {
    if (!this.activo) return false;
    _p.set(0, this.y, 0); _c.setFromMatrixPosition(camera.matrixWorld);
    _v.subVectors(_p, _c); if (_v.dot(N) > 0) return false;
    _v.reflect(N).negate().add(_p);
    _rot.extractRotation(camera.matrixWorld);
    _t.set(0, 0, -1).applyMatrix4(_rot).add(_c); _t.subVectors(_p, _t).reflect(N).negate().add(_p);
    const vc = this.cam; vc.position.copy(_v); vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(N); vc.lookAt(_t);
    vc.near = camera.near; vc.far = camera.far; vc.updateMatrixWorld(); vc.matrixWorldInverse.copy(vc.matrixWorld).invert(); vc.projectionMatrix.copy(camera.projectionMatrix);
    const M = this.u.uReflejoMat.value; M.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1); M.multiply(vc.projectionMatrix); M.multiply(vc.matrixWorldInverse);
    // plano cercano oblicuo: recorta todo lo que queda debajo de la tarima
    _plano.setFromNormalAndCoplanarPoint(N, _p).applyMatrix4(vc.matrixWorldInverse);
    _cp.set(_plano.normal.x, _plano.normal.y, _plano.normal.z, _plano.constant);
    const e = vc.projectionMatrix.elements;
    _q.set((Math.sign(_cp.x) + e[8]) / e[0], (Math.sign(_cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _cp.multiplyScalar(2 / _cp.dot(_q)); e[2] = _cp.x; e[6] = _cp.y; e[10] = _cp.z + 1 - .003; e[14] = _cp.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    const vis = ocultar.map(o => o.visible); for (const o of ocultar) o.visible = false;
    const rt0 = renderer.getRenderTarget();
    try { renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, vc); }
    finally { renderer.setRenderTarget(rt0); ocultar.forEach((o, i) => { o.visible = vis[i]; }); }
    return true;
  }
  dispose() { this.rt.dispose(); }
}
