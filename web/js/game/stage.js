// Escenario del juego: mismo render, arena, luces, barra y personajes que el visor, con la cámara sin arrastre (en el
// juego el lienzo es el botón). No reemplaza a web/js/main.js: el visor sigue armando el suyo.
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

const v = new THREE.Vector3(), v2 = new THREE.Vector3();
export const CAM = Object.fromEntries(CAMERAS.map((c, i) => [c.key, i]));

export class Escena {
  constructor(canvas, Q, { reduceMotion = false } = {}) {
    this.canvas = canvas; this.Q = Q; this.reduceMotion = reduceMotion;
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
    this.post = new Post(r, this.scene, this.rig.camera, Q); this.post.reduceMotion = reduceMotion; this.post.motionObject = this.barbell.group; this.post.bokehObject = this.arena.bokeh;
    this.atletas = {}; this.cargas = {}; this.tls = {}; this.activo = null; this.id = null; this.poses = null; this.plano = null; this.sombra = 4;
    this.barY = PLATE_R; this._py = [PLATE_R, PLATE_R]; this.kg = 0;
    this.barbell.setLoad(100); this.barbell.setPosition(v.set(0, PLATE_R, 0)); this.barbell.settle(PLATE_R);
    this.resize(); this.lighting.bake(r, [this.barbell.group, this.trace.group]);
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, Q = this.Q; if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, Q.dpr, Math.sqrt(Q.maxPixels / (w * h)));
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.rig.setAspect(w / h); this.post.setSize(w, h, pr); this.vertical = h > w; this.sombra = 4;
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
  /** Avanza cámara y entorno; dibuja si `pintar`. */
  cuadro(dt, pintar = true) {
    this._apuntar(); this.rig.update(dt); this.trace.face(this.rig.camera); this.post.focus = this.rig.focusDistance; this.arena.update(dt, this.rig.camera);
    if (!pintar) return;
    this.renderer.shadowMap.needsUpdate = this.sombra > 0; if (this.sombra > 0) this.sombra--;
    this.post.motion.set(0, 0); this.post.render(dt);
  }
}
