// Traza de la trayectoria de la barra: cinta en el plano sagital, a la altura del extremo de la barra que mira a cámara.
// Es una gráfica de TV: se dibuja siempre encima (sin prueba de profundidad), con contorno oscuro, y suavizada.
import * as THREE from 'three';

export class BarTrace {
  constructor() {
    this.group = new THREE.Group(); this.group.visible = false; this.meshes = [];
    const base = { side: THREE.DoubleSide, fog: false, depthFunc: THREE.AlwaysDepth, transparent: true };   // escribe profundidad: el desenfoque no la borra
    this.outline = new THREE.MeshBasicMaterial({ ...base, color: new THREE.Color('#020810'), opacity: .7 });
    this.ghost = new THREE.MeshBasicMaterial({ ...base, color: new THREE.Color('#35e6d6').multiplyScalar(.45), opacity: .55 });
    this.live = new THREE.MeshBasicMaterial({ ...base, color: new THREE.Color('#35e6d6').multiplyScalar(2.2), transparent: false });
    this.steps = 0; this.x = 1.16;
  }
  /** Reconstruye la cinta a partir de la línea de tiempo (muestreo denso en tiempo real + pasa-bajos). */
  build(tl, x = 1.16) {
    for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); } this.meshes = [];
    const n = this.steps = Math.max(2, Math.round(tl.duration * 120)), Y = new Float64Array(n + 1), Z = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) { const t = tl.duration * i / n; Y[i] = tl.barY(t); Z[i] = tl.barZ(t); }
    // pasa-bajos (binomial repetido, ~45 ms): las muestras resueltas traen quiebres que en TV se leen como error
    const smooth = A => { const B = Float64Array.from(A); for (let p = 0; p < 14; p++) { for (let i = 1; i < n; i++) B[i] = (A[i - 1] + 2 * A[i] + A[i + 1]) / 4; A.set(B); } };
    smooth(Y); smooth(Z);
    const ribbon = w => {
      const pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.max(0, i - 2), b = Math.min(n, i + 2); let ty = Y[b] - Y[a], tz = Z[b] - Z[a]; const l = Math.hypot(ty, tz);
        if (l < 1e-5) { ty = 1; tz = 0; } else { ty /= l; tz /= l; }
        pos.push(0, Y[i] - tz * w, Z[i] + ty * w, 0, Y[i] + tz * w, Z[i] - ty * w);
        if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
    };
    this.tl = tl; this.x = x;
    [[this.outline, .0125, 20], [this.ghost, .0045, 21], [this.live, .0065, 22]].forEach(([mat, w, order]) => {
      const m = new THREE.Mesh(ribbon(w), mat); m.frustumCulled = false; m.renderOrder = order; m.userData.live = mat === this.live; this.group.add(m); this.meshes.push(m);
    });
    this.group.position.x = x; this.setTime(0);
  }
  /** Cinta a partir de una lista de puntos {y, z} ya dibujados (la repetición del juego), sin línea de tiempo. */
  buildPoints(pts, x = 1.16) {
    for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); } this.meshes = []; this.tl = null; this.x = x;
    const n = this.steps = Math.max(1, pts.length - 1), pos = (w) => {
      const p = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n, i + 2)], c = pts[Math.min(n, i)]; let ty = b.y - a.y, tz = b.z - a.z; const l = Math.hypot(ty, tz);
        if (l < 1e-5) { ty = 1; tz = 0; } else { ty /= l; tz /= l; }
        p.push(0, c.y - tz * w, c.z + ty * w, 0, c.y + tz * w, c.z - ty * w); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); return g;
    };
    [[this.outline, .0125, 20], [this.ghost, .0045, 21], [this.live, .0065, 22]].forEach(([mat, w, order]) => {
      const m = new THREE.Mesh(pos(w), mat); m.frustumCulled = false; m.renderOrder = order; m.userData.live = mat === this.live; this.group.add(m); this.meshes.push(m);
    });
    this.group.position.x = x; this.setCount(0);
  }
  /** Cuántos puntos de la cinta viva se muestran (con buildPoints). */
  setCount(k) { for (const m of this.meshes) if (m.userData.live) m.geometry.setDrawRange(0, Math.max(0, Math.min(this.steps, k)) * 6); }
  /** La traza se muestra del lado de la barra que mira a la cámara. */
  face(camera) { this.group.position.x = camera.position.x >= 0 ? this.x : -this.x; }
  setTime(t) { if (!this.tl) return; const k = Math.round(this.steps * Math.min(1, t / this.tl.duration)) * 6; for (const m of this.meshes) if (m.userData.live) m.geometry.setDrawRange(0, k); }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.outline.dispose(); this.ghost.dispose(); this.live.dispose(); this.group.removeFromParent(); }
}
