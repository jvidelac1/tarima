// Iluminación de arena: key cálida alta con sombras de alta resolución, fills fríos, contraluces de color
// y entorno PMREM horneado desde la propia escena (reflejos coherentes en acero y discos).
import * as THREE from 'three';

export class Lighting {
  /** Se construye una vez; setQuality() cambia solo el tamaño de los mapas de sombra y la segunda sombra. */
  constructor(scene) {
    this.scene = scene; this.lights = [];
    const add = l => { scene.add(l); if (l.target) scene.add(l.target); this.lights.push(l); return l; };
    const spot = (color, intensity, pos, angle, pen) => { const l = new THREE.SpotLight(color, intensity, 0, angle, pen, 0); l.position.set(...pos); l.target.position.set(0, 1.0, .05); return add(l); };
    // clave cálida, alta y lateral (unos 45° de azimut y 50° de elevación): modela cara y torso en vez de aplanarlos
    this.key = spot('#ffe2c0', 4.6, [5.6, 8.6, 5.4], .27, .55);
    // relleno frontal del otro lado, frío y mucho más bajo: relación clave/relleno cercana a 3:1 (doble sombra de TV)
    this.key2 = spot('#dfe6ff', 1.25, [-5.2, 6.8, 6.4], .32, .7);
    // baño general del escenario: alfombra, mesas, oficiales y truss no quedan en negro fuera del cono de la clave
    this.stage = spot('#f0e6d8', 1.0, [0, 9.5, 5.5], .9, 1); this.stage.target.position.set(0, 0, 0);
    // luz de sala: ambiente neutro (no azul) con rebote cálido de la madera
    this.hemi = add(new THREE.HemisphereLight('#a4a8b8', '#5a4634', .26));
    this.wash = add(new THREE.DirectionalLight('#b4bad0', .32)); this.wash.position.set(0, 10, 2);
    // contraluces fuertes y fríos para despegar al atleta del fondo, más luz de pelo
    this.rimA = spot('#8fdcff', 3.6, [-6.3, 6, -4.6], .3, .9); this.rimA.target.position.set(0, 1.5, 0);
    this.rimB = spot('#ffb08a', 2.4, [6.3, 6, -4.6], .3, .9); this.rimB.target.position.set(0, 1.5, 0);
    this.hair = spot('#eef4ff', 2.0, [0, 7.4, -4.2], .3, .9); this.hair.target.position.set(0, 1.6, 0);
  }

  /**
   * VSM: penumbra real de un par de centímetros (radius y blurSamples valen acá). En la cámara frontal baja el piso se
   * ve rasante y una sombra dura se escalona por píxel; con borde blando no. `focus` cierra el cono sobre la tarima.
   */
  setQuality(q) {
    const set = (l, size, radius, focus) => {
      const on = size > 0; if (l.castShadow !== on) l.castShadow = on;
      if (!on) { l.shadow.map?.dispose(); l.shadow.map = null; return; }
      const sh = l.shadow; sh.camera.near = 6; sh.camera.far = 17; sh.focus = focus; sh.bias = -.0004; sh.normalBias = .004; sh.radius = radius; sh.blurSamples = 8;
      if (sh.mapSize.x !== size) { sh.mapSize.set(size, size); sh.map?.dispose(); sh.map = null; sh.mapPass?.dispose(); sh.mapPass = null; }
    };
    // El frustum de sombra se cierra sobre lo único que proyecta sombras que importan (atleta y barra: unos 1,9 m alrededor
    // del blanco), no sobre todo el cono de luz: la misma densidad de texel con un mapa de menos de la mitad de píxeles.
    set(this.key, q.shadow, q.shadow >= 1536 ? 4 : 3, .64); set(this.key2, q.shadow2, 3, .62);
  }

  /** Hornea el entorno PMREM desde la escena real, a la altura de la barra, ocultando lo que no debe reflejarse. */
  bake(renderer, hide = []) {
    const vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
    const prevEnv = this.scene.environment; this.scene.environment = null;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(this.scene, .015, .2, 80, { size: 256, position: new THREE.Vector3(0, 1.25, .2) });
    pmrem.dispose();
    hide.forEach((o, i) => { o.visible = vis[i]; });
    if (this.envRT) this.envRT.dispose(); if (prevEnv && prevEnv !== this.envRT?.texture) prevEnv.dispose?.();
    this.envRT = rt; this.scene.environment = rt.texture; this.scene.environmentIntensity = .6;
  }

  dispose() {
    for (const l of this.lights) { l.removeFromParent(); l.target?.removeFromParent(); l.shadow?.map?.dispose(); l.shadow?.mapPass?.dispose(); l.dispose?.(); }
    if (this.envRT) { this.envRT.dispose(); if (this.scene.environment === this.envRT.texture) this.scene.environment = null; }
  }
}
