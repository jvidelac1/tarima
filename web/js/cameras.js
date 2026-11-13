// Cámaras de transmisión: cuatro posiciones fijas con corte, travelling suave y arrastre orbital manual.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

// az: 0 = frente al atleta, π/2 = costado. H/lowY: alto de encuadre en metros y borde inferior; W: ancho extra lateral.
export const CAMERAS = [
  { key: '3/4', label: '3/4', az: .86, el: .075, fov: 25, drift: .04 },      // abierta hacia el costado: tribuna detrás del atleta
  { key: 'lado', label: 'Lateral', az: Math.PI / 2, el: .03, fov: 19, drift: 0 },
  { key: 'baja', label: 'Frontal', az: 0, el: -.085, fov: 28, drift: .03 },
  { key: 'jib', label: 'Cenital', az: 2.72, el: .68, fov: 50, drift: .06 },
  { key: 'rev', label: 'Reversa', az: 2.5, el: .1, fov: 36, drift: .03 },      // desde atrás del atleta, con el público de frente
];

/**
 * Primeros planos. Cada uno sigue un blanco que se calcula en cada cuadro con los huesos del atleta y la barra (no con
 * alturas fijas ni con números de fase), así sirven en cualquier fase y en cualquier biotipo. `at`: huesos cuyo punto medio
 * es el blanco ('Bar' es el centro de la barra); `up`: corrimiento vertical; `d`: distancia por metro de estatura.
 */
export const SHOTS = [
  { key: 'cara', label: 'Cara', at: ['Head'], up: .07, d: .52, az: .5, el: .04, fov: 20 },
  { key: 'torso', label: 'Torso', at: ['Spine1', 'Spine2', 'Neck'], up: 0, d: 1.25, az: .55, el: .06, fov: 24 },
  { key: 'rack', label: 'Barra de frente', at: ['Bar', 'Neck'], up: 0, d: 1.35, az: 0, el: .03, fov: 26 },
  { key: 'rack-lado', label: 'Barra de costado', at: ['Bar', 'Neck'], up: 0, d: 1.2, az: 1.02, el: .1, fov: 24 },      // de costado puro los discos tapan al atleta: se entra por delante del disco
  { key: 'manos', label: 'Manos', at: ['LeftHand', 'LeftHandMiddle1'], up: 0, d: .42, az: -.5, el: .28, fov: 20 },      // desde el centro y adelante: con agarre de arranque los discos quedan pegados a la mano
  { key: 'manos-atras', label: 'Manos (desde arriba)', at: ['LeftHand', 'LeftHandMiddle1'], up: 0, d: .42, az: -.7, el: 1.05, fov: 20 },
  { key: 'arriba', label: 'Brazos y barra', at: ['Bar', 'Head', 'Spine2'], up: 0, d: 1.5, az: .4, el: -.06, fov: 28 },
  { key: 'pies', label: 'Zapatillas', at: ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'], up: .03, d: .62, az: .8, el: .2, fov: 22 },
  { key: 'piernas', label: 'Piernas', at: ['LeftLeg', 'RightLeg', 'Hips'], up: -.05, d: 1.1, az: .7, el: .08, fov: 26 },
];

export class CameraRig {
  /** `interactive: false` (el juego): no registra arrastre ni rueda; ahí el lienzo es el botón y mantener apretado no debe orbitar. */
  constructor(canvas, { reduceMotion = false, interactive = true } = {}) {
    this.camera = new THREE.PerspectiveCamera(25, 1, .25, 120);
    this.canvas = canvas; this.reduceMotion = reduceMotion; this.index = 0; this.time = 0;
    this.az = CAMERAS[0].az; this.el = CAMERAS[0].el; this.zoom = 1; this.azT = this.az; this.elT = this.el; this.zoomT = 1;
    this.height = 1.7; this.barY = .225; this.barAhead = .225; this.headY = 1.6; this.top = 2;
    this.inset = { t: 0, b: 0, l: 0, r: 0 }; this._in = { t: 0, b: 0, l: 0, r: 0 }; this.subject = new THREE.Vector3(0, 1, .06); this.target = new THREE.Vector3(0, 1.1, .05); this.focusDistance = 9; this.manual = false;
    this.shot = null; this.shotAt = new THREE.Vector3(0, 1, 0); this._shotAt = new THREE.Vector3(); this._shotNew = false;
    let drag = null;
    this._down = e => { drag = { x: e.clientX, y: e.clientY, az: this.azT, el: this.elT }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
    this._move = e => { if (!drag) return; this.manual = true; this.azT = drag.az - (e.clientX - drag.x) * .008; this.elT = clamp(drag.el + (e.clientY - drag.y) * .005, -.12, 1.15); };
    this._up = () => { drag = null; canvas.style.cursor = 'grab'; };
    this._wheel = e => { e.preventDefault(); this.zoomT = clamp(this.zoomT * Math.exp(e.deltaY * .001), .55, 1.35); };
    this.interactive = interactive; if (!interactive) return;
    canvas.addEventListener('pointerdown', this._down); canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up); canvas.addEventListener('pointercancel', this._up); canvas.addEventListener('wheel', this._wheel, { passive: false });
  }
  /**
   * Primer plano (entrada de SHOTS) o null para volver a la cámara fija. El blanco lo pone main.js en `shotAt` cada cuadro.
   * El arrastre orbita alrededor del blanco y la rueda acerca o aleja.
   */
  setShot(shot) {
    this.shot = shot || null; this._shotNew = true; this.manual = false; this.zoom = this.zoomT = 1;
    if (shot) { this.az = this.azT = shot.az; this.el = this.elT = shot.el; } else this.cut(this.index);
  }
  /** Corte a una cámara fija. */
  cut(i) {
    this.shot = null;
    this.index = clamp(i | 0, 0, CAMERAS.length - 1); const c = CAMERAS[this.index]; this.top = 99;
    this.az = this.azT = c.az; this.el = this.elT = c.el; this.zoom = this.zoomT = 1; this.manual = false; this.camera.fov = c.fov; this.time = 0; Object.assign(this._in, this.inset);
  }
  /**
   * Transición suave (juego, pedido del dueño: «menos cortes»): el próximo cambio de plano no salta, va desde la cámara de
   * este cuadro hasta la nueva en `seg` s, con aceleración y frenado (posición, orientación y lente). Se llama justo antes de
   * `cut` o `setShot`. Con movimiento reducido, corte como siempre.
   */
  suave(seg = .7) {
    if (this.reduceMotion || !(seg > 0)) { this.mezcla = null; return; }
    const c = this.camera; this.mezcla = { p: c.position.clone(), q: c.quaternion.clone(), fov: c.fov, t: 0, dur: seg };
  }
  _mezclar(dt) {
    const M = this.mezcla; if (!M) return;
    M.t += dt; const u = Math.min(1, M.t / M.dur), k = u * u * (3 - 2 * u), cam = this.camera;
    const p = (this._mp ||= new THREE.Vector3()).copy(cam.position), q = (this._mq ||= new THREE.Quaternion()).copy(cam.quaternion);
    cam.position.copy(M.p).lerp(p, k); cam.quaternion.copy(M.q).slerp(q, k); cam.fov = M.fov + (cam.fov - M.fov) * k;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    if (u >= 1) this.mezcla = null;
  }
  setAthleteHeight(h) { this.height = h; }
  /** Márgenes seguros (fracción del lienzo) ocupados por la gráfica: el encuadre se calcula contra el rectángulo libre. */
  setInsets(i) { Object.assign(this.inset, i); }
  /** Lleva el encuadre a su destino sin travelling (cortes y saltos de la línea de tiempo). */
  settle() { this.top = 99; Object.assign(this._in, this.inset); }
  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  update(dt) {
    const c = CAMERAS[this.index], cam = this.camera; this.time += dt;
    this.az = damp(this.az, this.azT, 7, dt); this.el = damp(this.el, this.elT, 7, dt); this.zoom = damp(this.zoom, this.zoomT, 7, dt);
    if (this.shot) {
      const sh = this.shot, d = sh.d * this.height * this.zoom, ce = Math.cos(this.el);
      if (this._shotNew) { this._shotAt.copy(this.shotAt); this._shotNew = false; } else this._shotAt.lerp(this.shotAt, 1 - Math.exp(-(this.reduceMotion ? 60 : 14) * dt));
      this.target.copy(this._shotAt); this.subject.copy(this._shotAt);
      cam.position.set(Math.sin(this.az) * ce, Math.sin(this.el), Math.cos(this.az) * ce).multiplyScalar(d).add(this.target);
      if (cam.position.y < .08) cam.position.y = .08;
      if (Math.abs(cam.fov - sh.fov) > 1e-4) cam.fov = sh.fov;
      cam.lookAt(this.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); this.focusDistance = cam.position.distanceTo(this.target); this.top = 99;
      this._mezclar(dt); return;
    }
    const drift = (this.reduceMotion || this.manual) ? 0 : Math.sin(this.time * .16) * c.drift;
    const az = this.az + drift, el = this.el, I = this._in, snap = this.top > 50;
    for (const k of ['t', 'b', 'l', 'r']) I[k] = snap ? this.inset[k] : damp(I[k], this.inset[k], 5, dt);
    // encuadre: atleta y barra completos dentro del rectángulo libre de gráfica. El borde superior se anticipa a la barra
    // (barAhead = altura máxima en el próximo segundo y medio), como un operador que conoce el levantamiento:
    // radio de disco + flecha del whip + aire.
    const topT = Math.max(this.height * 1.09, this.headY + .2, Math.max(this.barY, this.barAhead) + .225 + .06 + .09);
    this.top = snap || Math.abs(topT - this.top) > 1.5 ? topT : damp(this.top, topT, this.reduceMotion ? 50 : (topT > this.top ? 4.2 : 1.6), dt);
    const top = this.top, bottom = -.16, H = top - bottom, jib = c.key === 'jib';
    const W = 2.5 * Math.abs(Math.cos(az)) + 1.5 * Math.abs(Math.sin(az)) + .45;
    const fh = Math.max(.4, 1 - I.t - I.b), fw = Math.max(.4, 1 - I.l - I.r);
    const ce = Math.cos(el), dir = new THREE.Vector3(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce);
    // la cámara no atraviesa la pantalla del fondo ni se mete en las tribunas: si no entra, abre el lente
    let dMax = 10.2 / Math.max(.2, Math.hypot(dir.x, dir.z)); if (dir.z < 0) dMax = Math.min(dMax, (4.3 + .06) / -dir.z);
    let tan = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2), d;
    const need = t => jib ? Math.hypot(top / 2 + .1, 1.3) / Math.sin(Math.atan(t * Math.min(1, cam.aspect))) / Math.min(fh, fw) : Math.max(H / fh / 2 / t, W / fw / 2 / (t * cam.aspect)) * 1.02;
    d = need(tan);
    if (d > dMax) { for (let i = 0; i < 12 && need(tan) > dMax; i++) tan *= Math.min(1.25, need(tan) / dMax); d = Math.min(need(tan), dMax); }
    const fov = THREE.MathUtils.radToDeg(Math.atan(tan) * 2); if (Math.abs(fov - cam.fov) > 1e-4) cam.fov = fov;
    d *= this.zoom;
    const Vh = 2 * d * tan, Vw = Vh * cam.aspect;
    this.subject.set(0, jib ? top / 2 - .1 : (top + bottom) / 2, .06);
    // al acercar con zoom, el encuadre sigue al atleta en la pose actual: punto medio entre la barra y la cabeza
    if (this.zoom < 1 && !jib) this.subject.y += ((this.barY + this.headY) / 2 - this.subject.y) * clamp((1 - this.zoom) / .4, 0, 1);
    // el centro de la imagen se corre para que el sujeto quede centrado en el rectángulo libre
    this.target.copy(this.subject); this.target.y += (I.t - I.b) * Vh / 2;
    const rl = Math.hypot(dir.x, dir.z) || 1; this.target.x -= dir.z / rl * (I.l - I.r) * Vw / 2; this.target.z += dir.x / rl * (I.l - I.r) * Vw / 2;
    cam.position.copy(this.target).addScaledVector(dir, d);
    if (cam.position.y < .16) { const dy = .16 - cam.position.y; cam.position.y = .16; this.target.y += dy; }
    cam.lookAt(this.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.focusDistance = cam.position.distanceTo(this.subject);
    this._mezclar(dt);
  }
  dispose() {
    if (!this.interactive) return;
    const c = this.canvas; c.removeEventListener('pointerdown', this._down); c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up); c.removeEventListener('pointercancel', this._up); c.removeEventListener('wheel', this._wheel);
  }
}
