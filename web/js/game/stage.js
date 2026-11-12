// Escenario del juego: mismo render, arena, luces, barra y personajes que el visor, con la cámara sin arrastre (en el
// juego el lienzo es el botón). No reemplaza a web/js/main.js: el visor sigue armando el suyo.
// Fluidez (docs/JUEGO.md 8.7): la resolución es un presupuesto de píxeles (`tope`) que se cambia sin recompilar nada; las
// sombras se prenden y apagan entre dos juegos de programas que precalentar() deja compilados; el pesista usa el nivel de
// detalle del visor según los píxeles por metro; sin oclusión ni profundidad de campo la profundidad del MSAA no se guarda.
import * as THREE from 'three';
import { Arena } from '../arena.js';
import { Lighting } from '../lighting.js';
import { Post } from '../post.js';
import { Barbell } from '../barbell.js';
import { CameraRig, CAMERAS, SHOTS } from '../cameras.js';
import { BarTrace } from '../trace.js';
import { Athlete } from '../athlete.js';
import { Timeline } from '../timeline.js';
import { PLATE_R } from '../config.js';
import { PLANTEL } from './roster.js';
import { aplicarEsfuerzo } from './effort.js';
import { tramo } from './sequence.js';

const v = new THREE.Vector3(), v2 = new THREE.Vector3();
export const CAM = Object.fromEntries(CAMERAS.map((c, i) => [c.key, i]));

export class Escena {
  constructor(canvas, Q, { reduceMotion = false } = {}) {
    this.canvas = canvas; this.Q = Q; this.reduceMotion = reduceMotion;
    // tope: píxeles que se dibujan como máximo; libre: sin el límite de la densidad de la pantalla (calibración y banco).
    // sombras: la clave proyecta sombra. lodFijo: píxeles por metro forzados (banco). directo: sin destino ni pase final (banco).
    this.tope = Q.maxPixels; this.libre = false; this.sombras = true; this.lodFijo = null; this.directo = false;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.NoToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap; r.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#070b16'); this.scene.fog = new THREE.FogExp2('#0b1226', .015);
    this.rig = new CameraRig(canvas, { reduceMotion, interactive: false });
    this.trace = new BarTrace(); this.scene.add(this.trace.group);
    const coarse = matchMedia('(pointer:coarse)').matches, aniso = Math.min(Q.aniso || 4, r.capabilities.getMaxAnisotropy());
    this.arena = new Arena({ tex: coarse || Q.tex <= 1024 ? 1024 : 2048, aniso, reduceMotion }); this.scene.add(this.arena.group);
    this.lighting = new Lighting(this.scene);
    this.barbell = new Barbell({ aniso, texSize: coarse ? 512 : 1024 }); this.scene.add(this.barbell.group);
    this.arena.setQuality(Q); this.lighting.setQuality(Q);
    this._post(Q);
    this.atletas = {}; this.cargas = {}; this.tls = {}; this.activo = null; this.id = null; this.poses = null; this.plano = null; this.sombra = 4;
    this.barY = PLATE_R; this._py = [PLATE_R, PLATE_R]; this.kg = 0;
    this.barbell.setLoad(100); this.barbell.setPosition(v.set(0, PLATE_R, 0)); this.barbell.settle(PLATE_R);
    this.resize(); this.lighting.bake(r, [this.barbell.group, this.trace.group]);
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  _post(Q) {
    const p = this.post = new Post(this.renderer, this.scene, this.rig.camera, Q); p.reduceMotion = this.reduceMotion; p.motionObject = this.barbell.group; p.bokehObject = this.arena.bokeh;
    // Sin oclusión ni profundidad de campo ningún pase lee la profundidad de la escena: no se resuelve (una pasada de pantalla
    // completa menos por cuadro) ni se guarda la del MSAA (cuatro muestras por píxel que no salen de la memoria de la placa).
    const lee = !!(Q.ao || Q.dof || Q.mblur); p.sceneRT.resolveDepthBuffer = lee; p.sceneRT.storeMultisampledDepthBuffer = lee;
  }
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
    if (Q !== this.Q) { this.Q = Q; this.arena.setQuality(Q); this.lighting.setQuality(Q); this.post.dispose(); this._post(Q); this._sombras(); }
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
   * destino de la escena puesto, porque el programa de cada material depende del destino; después dibuja un cuadro de cada
   * variante con todo a la vista: ahí suben texturas y buffers y se compilan los materiales de la pasada de sombra y los
   * pases de pantalla, que compile() no ve. Se llama en la carga, con la imagen tapada o detrás de un panel.
   */
  async precalentar() {
    const r = this.renderer, cam = this.rig.camera, haySombra = this.Q.shadow > 0, antes = this.sombras;
    const compilar = con => {
      this.sombras = con; this._sombras(); r.setRenderTarget(this.post.sceneRT);
      try { return r.compileAsync(this.scene, cam); } finally { r.setRenderTarget(null); this.sombras = antes; this._sombras(); }
    };
    // si un programa no termina nunca (controlador roto), no se cuelga la carga: se sigue y se compilará al usarlo
    for (const con of haySombra ? [true, false] : [false]) await Promise.race([compilar(con), new Promise(res => setTimeout(res, 8000))]);
    const at = Object.values(this.atletas), vis = at.map(a => a.root.visible), traza = this.trace.group.visible;
    try {
      for (const a of at) a.root.visible = true;
      if (!this.trace.meshes.length) this.trace.buildPoints([{ y: 1, z: 0 }, { y: 1.2, z: .05 }, { y: 1.4, z: 0 }]);
      this.trace.setCount(2); this.trace.group.visible = true;
      for (const con of [!antes, antes]) { if (con && !haySombra) continue; this.sombras = con; this._sombras(); r.shadowMap.needsUpdate = true; this.post.render(0); }
    } finally {
      at.forEach((a, i) => { a.root.visible = vis[i]; }); this.trace.setCount(0); this.trace.group.visible = traza; this.sombras = antes; this._sombras();
    }
    this.sombra = 4; this.cuadro(0, true);      // el último cuadro dibujado es el de verdad
  }
  /** Carga (una sola vez) el modelo que usa un pesista. Los dos modelos quedan en memoria. */
  cargar(id) {
    const mod = PLANTEL[id].modelo;
    return this.cargas[mod] ||= Athlete.load(mod, this.poses[mod], { aniso: Math.min(this.Q.aniso || 4, this.renderer.capabilities.getMaxAnisotropy()), maxTex: this.Q.tex })
      .then(a => { a.root.visible = false; this.scene.add(a.root); this.atletas[mod] = a; return a; });
  }
  /** Pone en escena a un pesista (o a nadie, con null). Marangi comparte la instancia de Brenner con la tela de color plano. */
  async mostrar(id) {
    if (id === null) { for (const a of Object.values(this.atletas)) a.root.visible = false; this.activo = null; this.id = null; this.sombra = 4; return; }
    const a = await this.cargar(id), f = PLANTEL[id];
    for (const b of Object.values(this.atletas)) b.root.visible = b === a;
    a.setClothFlat(f.tela ? new THREE.Color(f.tela) : null);
    this.activo = a; this.id = id; this.P = this.poses[f.modelo]; this.rig.setAthleteHeight(this.P.h); this.sombra = 4;
  }
  setCarga(kg, lev) { if (kg !== this.kg) { this.kg = this.barbell.setLoad(kg); this.sombra = 4; } if (lev && this.P) this.barbell.setGrip(lev === 's' ? this.P.grip?.snatch : this.P.grip?.clean); }
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
    this.barbell.setPosition(v); this.barY = v.y; this.barZ = v.z; this.rig.barY = v.y; this.rig.barAhead = v.y; this.rig.headY = a.boneWorld('Head', v2).y + .14;
    if (dt > 0 && dt < .1) { const acc = (v.y - 2 * this._py[0] + this._py[1]) / (dt * dt); this.barbell.step(dt, v.y, acc); } else this.barbell.settle(v.y);
    this._py[1] = dt > 0 ? this._py[0] : v.y; this._py[0] = v.y; this.sombra = 3;
  }
  /** Distancia (m) entre el centro de la barra dibujada y el punto medio de las manos: para la prueba automática. */
  manosBarra() { const a = this.activo; if (!a) return 0; a.midWorld(['LeftHand', 'RightHand'], v2); const b = this.barbell.group.position; return Math.hypot(v2.y - b.y, v2.z - b.z); }
  /** Altura (m) de la barra en una muestra global del clip (para las líneas de ayuda). */
  alturaMuestra(g) { return this.activo?.barPos[g]?.y ?? 0; }
  camara(clave) { this.plano = null; this.rig.setShot(null); this.rig.cut(CAM[clave] ?? 0); }
  primerPlano(clave) { const sh = SHOTS.find(s => s.key === clave) || null; this.plano = sh; if (sh) this._apuntar(); this.rig.setShot(sh); }
  _apuntar() {
    const a = this.activo, sh = this.plano; if (!a || !sh) return;
    const huesos = sh.at.filter(k => k !== 'Bar'), nb = sh.at.length - huesos.length; a.midWorld(huesos, v2).multiplyScalar(huesos.length);
    if (nb) v2.add(this.barbell.group.position); this.rig.shotAt.copy(v2.multiplyScalar(1 / sh.at.length)); this.rig.shotAt.y += sh.up * this.P.h;
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
    if (this.directo) { r.setRenderTarget(null); r.render(this.scene, this.rig.camera); return; }
    this.post.motion.set(0, 0); this.post.render(dt);
  }
}
