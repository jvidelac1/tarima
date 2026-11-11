// Barra olímpica de 20 kg y discos reglamentarios generados por código, con flexión (whip) de viga elástica.
// Eje local X a lo largo de la barra; el origen es el centro de la barra a la altura de las manos (hueso Bar).
import * as THREE from 'three';
import { makeCanvas, canvasTexture, normalFromHeight, clamp, disposeObject } from './util.js';
import { loadout, BAR_KG, COLLAR_KG, MIN_KG } from './config.js';

const SHAFT_HALF = .655, SHAFT_R = .014, SLEEVE_R = .025, SLEEVE_LEN = .415, FLANGE = .03, BORE = .0256;
const EI = 200e9 * Math.PI * Math.pow(2 * SHAFT_R, 4) / 64;   // acero, eje de 28 mm
const G = 9.81, ZETA = .075, ACC_TAU = .035, ACC_MIN = -12, ACC_MAX = 22, Q_SOFT = .085, FONT = "'Saira Condensed','Arial Narrow',sans-serif";

/** Sólido de revolución alrededor de X. profile: [[x, r, material?], ...] recorrido con el sólido a la derecha. Aristas vivas. */
function revolve(profile, segs = 48) {
  const pos = [], nor = [], uv = [], idx = [], groups = [];
  let arc = 0, start = 0, mat = profile[0][2] || 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, r0] = profile[i], [x1, r1, m1] = profile[i + 1], dx = x1 - x0, dr = r1 - r0, len = Math.hypot(dx, dr);
    if (len < 1e-9) continue;
    const m = m1 === undefined ? mat : m1;
    if (m !== mat) { groups.push([start, idx.length - start, mat]); start = idx.length; mat = m; }
    const nx = -dr / len, nr = dx / len, base = pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const th = j / segs * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(x0, r0 * c, r0 * s, x1, r1 * c, r1 * s); nor.push(nx, nr * c, nr * s, nx, nr * c, nr * s);
      uv.push(j / segs, arc, j / segs, arc + len);
    }
    for (let j = 0; j < segs; j++) { const a = base + j * 2, b = a + 1, a2 = a + 2, b2 = a + 3; idx.push(a, a2, b, a2, b2, b); }
    arc += len;
  }
  groups.push([start, idx.length - start, mat]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  return g;
}

function arcText(g, text, cx, cy, radius, mid, px, weight = 800, flip = false) {
  g.font = `${weight} ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const widths = [...text].map(ch => g.measureText(ch).width + px * .06), total = widths.reduce((a, b) => a + b, 0);
  let ang = mid - (flip ? -1 : 1) * total / radius / 2;
  [...text].forEach((ch, i) => {
    const half = widths[i] / radius / 2 * (flip ? -1 : 1); ang += half;
    g.save(); g.translate(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius); g.rotate(ang + (flip ? -Math.PI / 2 : Math.PI / 2)); g.fillText(ch, 0, 0); g.restore();
    ang += half;
  });
}

/** Cara de un bumper: color + letras en relieve (marca ficticia TARIMA). Devuelve {map, normalMap, roughnessMap}. */
function plateFace(spec, size, aniso) {
  const label = String(spec.kg).replace('.', ',');
  const draw = (g, s, relief) => {
    const c = s / 2, R = s / 2;                       // el canvas cubre el anillo de letras completo
    g.fillStyle = relief ? '#000' : spec.color; g.fillRect(0, 0, s, s);
    if (!relief) {   // desgaste: vetas radiales y polvo de magnesio
      for (let i = 0; i < 900; i++) { const a = Math.random() * 7, r = R * (.5 + Math.random() * .5); g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .035})`; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + Math.random() * 5, 0, 7); g.fill(); }
    }
    const ink = relief ? '#fff' : spec.ink;
    g.fillStyle = ink; g.strokeStyle = ink;
    g.lineWidth = s * .008; for (const rr of [.985, .56]) { g.beginPath(); g.arc(c, c, R * rr, 0, 7); g.stroke(); }
    arcText(g, label, c, c, R * .78, -Math.PI / 2, s * .2, 800);
    arcText(g, label, c, c, R * .78, Math.PI / 2, s * .2, 800);
    arcText(g, 'TARIMA', c, c, R * .785, Math.PI, s * .088, 700);
    arcText(g, 'KG · LB ' + String(Math.round(spec.kg * 2.2046)), c, c, R * .785, 0, s * .062, 700);
    if (relief) {  // ranuras concéntricas finas del caucho
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5;
      for (let rr = .58; rr < .98; rr += .022) { g.beginPath(); g.arc(c, c, R * rr, 0, 7); g.stroke(); }
    }
  };
  const col = makeCanvas(size, size, g => draw(g, size, false));
  const hgt = makeCanvas(size, size, g => { g.filter = 'blur(1.2px)'; draw(g, size, true); });
  const map = canvasTexture(col, { aniso }), normalMap = normalFromHeight(hgt, 2.4, { wrap: false, aniso });
  return { map, normalMap };
}

function smallFace(spec, aniso) {
  const s = 256, label = String(spec.kg).replace('.', ',');
  return canvasTexture(makeCanvas(s, s, g => {
    g.fillStyle = spec.color; g.fillRect(0, 0, s, s); g.fillStyle = spec.ink; g.strokeStyle = spec.ink; g.lineWidth = 3;
    g.beginPath(); g.arc(s / 2, s / 2, s * .47, 0, 7); g.stroke();
    arcText(g, label + ' KG', s / 2, s / 2, s * .34, -Math.PI / 2, s * .17, 800); arcText(g, 'TARIMA', s / 2, s / 2, s * .34, Math.PI / 2, s * .12, 700);
  }), { aniso });
}

function knurlTextures(aniso) {
  const s = 128, N = 4, cv = makeCanvas(s, s), g = cv.getContext('2d'), img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s * N, v = y / s * N, a = (u + v) % 1, b = (u - v + N) % 1, h = 1 - Math.max(Math.abs(a - .5), Math.abs(b - .5)) * 2, i = (y * s + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.pow(h, .7) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const knurl = normalFromHeight(cv, 2.2, { aniso });
  const ridge = normalFromHeight(makeCanvas(8, 64, (c, w, h) => { for (let y = 0; y < h; y++) { const k = (Math.sin(y / h * Math.PI * 2 * 4) * .5 + .5) * 255 | 0; c.fillStyle = `rgb(${k},${k},${k})`; c.fillRect(0, y, w, 1); } }), 1.4, { aniso });
  return { knurl, ridge };
}

export class Barbell {
  constructor({ aniso = 8, texSize = 1024 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'Barbell';
    this.aniso = aniso; this.texSize = texSize;
    this.grip = .55; this.q = 0; this.v = 0; this.acc = 0; this.flexGain = 1; this.onFloor = false;
    this._faces = new Map(); this._plateGeo = new Map(); this._disposables = [];
    const { knurl, ridge } = knurlTextures(aniso); this._disposables.push(knurl, ridge);
    knurl.repeat.set(14, 1 / .0063); ridge.repeat.set(1, 1 / .012);
    const steel = { color: new THREE.Color('#c9ccd0'), metalness: 1, envMapIntensity: 1.25 };
    this.mat = {
      smooth: new THREE.MeshStandardMaterial({ ...steel, roughness: .2 }),
      knurl: new THREE.MeshStandardMaterial({ ...steel, color: new THREE.Color('#b4b7bc'), roughness: .46, normalMap: knurl, normalScale: new THREE.Vector2(1.1, 1.1) }),
      sleeve: new THREE.MeshStandardMaterial({ ...steel, roughness: .24, normalMap: ridge, normalScale: new THREE.Vector2(.35, .35) }),
      chrome: new THREE.MeshStandardMaterial({ ...steel, color: new THREE.Color('#d8dade'), roughness: .12 }),
      hub: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c4c7cc'), metalness: .92, roughness: .4, envMapIntensity: 1.6 }),
      dark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1d21'), metalness: .6, roughness: .45 }),
    };
    this._rubber = new Map();

    // eje: anillos densos para poder curvarlo en CPU; zonas lisas y moleteadas
    const zones = x => { const a = Math.abs(x); return (a < .06 || (a > .2 && !(Math.abs(a - .455) < .004) && a < .64)) ? 1 : 0; };
    const prof = [], N = 220;
    for (let i = 0; i <= N; i++) prof.push(-SHAFT_HALF + 2 * SHAFT_HALF * i / N);
    for (const e of [.06, .2, .451, .459, .64]) { prof.push(e, -e); }
    prof.sort((a, b) => a - b);
    // revolve agrupa tramos contiguos; se construye por zona para mantener pocos grupos
    const pts = prof.map((x, i) => [x, SHAFT_R, i ? zones((x + prof[i - 1]) / 2) : zones(x)]);
    this.shaftGeo = revolve(pts, 20);
    this.shaft = new THREE.Mesh(this.shaftGeo, [this.mat.smooth, this.mat.knurl]);
    this.shaft.castShadow = this.shaft.receiveShadow = true; this.shaft.frustumCulled = false;
    this._base = this.shaftGeo.attributes.position.array.slice();
    this.group.add(this.shaft);

    this.sides = [-1, 1].map(sign => {
      const tilt = new THREE.Group(), inner = new THREE.Group(); tilt.add(inner); if (sign < 0) inner.rotation.y = Math.PI;
      this.group.add(tilt);
      // casquillo, tope y manga
      const sleeve = new THREE.Mesh(revolve([
        [-.014, SHAFT_R, 1], [-.014, .021], [-.002, .021], [0, .0375], [.003, .0395], [FLANGE - .003, .0395], [FLANGE, .0375], [FLANGE, SLEEVE_R, 0],
        [FLANGE + SLEEVE_LEN - .002, SLEEVE_R], [FLANGE + SLEEVE_LEN, SLEEVE_R - .002, 1], [FLANGE + SLEEVE_LEN, .017], [FLANGE + SLEEVE_LEN - .006, .017], [FLANGE + SLEEVE_LEN - .006, 0],
      ], 40), [this.mat.sleeve, this.mat.chrome]);
      sleeve.castShadow = sleeve.receiveShadow = true; inner.add(sleeve);
      const load = new THREE.Group(); inner.add(load);
      return { sign, tilt, inner, load };
    });
    this.setLoad(100);
  }

  _rubberMat(color) {
    if (!this._rubber.has(color)) this._rubber.set(color, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: .62, metalness: 0, envMapIntensity: .55 }));
    return this._rubber.get(color);
  }

  _plate(spec) {
    const key = spec.kg;
    if (!this._plateGeo.has(key)) {
      const t = spec.t, r = spec.r; let body, ringIn = 0, ringOut = 0, face = null, inset = 0;
      if (!spec.change) {
        const hub = [[.003, BORE, 1], [.003, .045], [.0045, .047], [.0045, .072], [.003, .074], [.003, .1]];
        const back = hub.map(([x, rr]) => [t - x, rr]).reverse();
        body = revolve([...hub, [.007, .102, 0], [.007, .196], [0, .203], [0, r - .006], [.002, r - .0015], [.006, r], [t - .006, r], [t - .002, r - .0015], [t, r - .006], [t, .203], [t - .007, .196], [t - .007, .102], [back[0][0], back[0][1], 1], ...back.slice(1)], 72);
        ringIn = .1025; ringOut = .1955; inset = .0067; face = plateFace(spec, this.texSize, this.aniso);
      } else {
        body = revolve([[0, BORE, 0], [0, r - .003], [.003, r], [t - .003, r], [t, r - .003], [t, BORE]], 48);
        ringIn = BORE + .004; ringOut = r - .004; inset = -.0002; face = { map: smallFace(spec, this.aniso) };
      }
      const ring = new THREE.RingGeometry(ringIn, ringOut, 72, 1);
      // UV del anillo: el canvas cubre el cuadrado [-ringOut, ringOut]
      const p = ring.attributes.position, uv = ring.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / ringOut * .5 + .5, p.getY(i) / ringOut * .5 + .5);
      const faceMat = new THREE.MeshStandardMaterial({ map: face.map, normalMap: face.normalMap || null, roughness: .6, metalness: 0, envMapIntensity: .55 });
      if (face.normalMap) faceMat.normalScale.set(1.3, 1.3);
      this._plateGeo.set(key, { body, ring, faceMat, inset });
    }
    const { body, ring, faceMat, inset } = this._plateGeo.get(key), g = new THREE.Group();
    const m = new THREE.Mesh(body, [this._rubberMat(spec.color), this.mat.hub]); g.add(m);
    const a = new THREE.Mesh(ring, faceMat); a.rotation.y = -Math.PI / 2; a.position.x = inset; g.add(a);
    const b = new THREE.Mesh(ring, faceMat); b.rotation.y = Math.PI / 2; b.position.x = spec.t - inset; g.add(b);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); a.castShadow = b.castShadow = false;   // las caras impresas van pegadas al disco: no suman sombra
    return g;
  }

  _collar() {
    if (!this._collarGeo) {
      this._collarGeo = {
        body: revolve([[0, BORE, 0], [0, .048], [.002, .05], [.012, .05], [.014, .048], [.014, .04], [.046, .04], [.046, .045], [.048, .047], [.058, .047], [.06, .045], [.06, BORE]], 40),
        screw: new THREE.CylinderGeometry(.0065, .0065, .05, 12), handle: new THREE.CylinderGeometry(.0045, .0045, .085, 10), knob: new THREE.SphereGeometry(.0085, 12, 8),
      };
    }
    const c = this._collarGeo, g = new THREE.Group();
    g.add(new THREE.Mesh(c.body, [this.mat.chrome]));
    const screw = new THREE.Mesh(c.screw, this.mat.dark); screw.position.set(.03, .062, 0); g.add(screw);
    const handle = new THREE.Mesh(c.handle, this.mat.chrome); handle.rotation.z = Math.PI / 2; handle.position.set(.03, .087, 0); g.add(handle);
    for (const s of [-1, 1]) { const k = new THREE.Mesh(c.knob, this.mat.dark); k.position.set(.03 + s * .0425, .087, 0); g.add(k); }
    g.rotation.x = -.9;
    g.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = o.geometry === c.body; } });
    return g;
  }

  /** Arma la carga para un total en kg. Devuelve el total realmente cargado. */
  setLoad(totalKg) {
    const lo = loadout(totalKg); this.totalKg = lo.total; this.loadSpec = lo;
    let centroid = 0, mass = 0, rMax = .05;
    for (const side of this.sides) {
      side.load.clear(); let x = FLANGE + .0005; centroid = 0; mass = 0;
      const put = (obj, t, kg) => { obj.position.x = x; side.load.add(obj); centroid += (x + t / 2) * kg; mass += kg; x += t + .0006; };
      lo.inner.forEach((p, i) => { const pl = this._plate(p); pl.rotation.x = (i * 2.4 + (side.sign > 0 ? .7 : 0)) % 6.283; put(pl, p.t, p.kg); rMax = Math.max(rMax, p.r); });
      put(this._collar(), .06, COLLAR_KG);
      lo.outer.forEach(p => { put(this._plate(p), p.t, p.kg); rMax = Math.max(rMax, p.r); });
    }
    const sleeveKg = 4.2;   // cada manga con su rodamiento
    this.plateR = rMax;
    this.sideMass = mass + sleeveKg;
    this.centroidX = SHAFT_HALF + (centroid + sleeveKg * (FLANGE + SLEEVE_LEN / 2)) / this.sideMass;
    this._retune();
    return this.totalKg;
  }
  setGrip(width) { this.grip = clamp(width || .55, .3, 1.24); this._retune(); }
  _retune() {
    this.h = this.grip / 2; this.a = this.centroidX - this.h;
    this.c = -this._shape(this.centroidX, 1)[0];            // flecha en el centro de carga por newton
    this.w2 = 1 / (this.c * this.sideMass); this.w = Math.sqrt(this.w2);
    this.freqHz = this.w / (2 * Math.PI);
  }
  /** Elástica para una fuerza F hacia abajo en cada extremo, manos como apoyos en ±h. Devuelve [flecha, pendiente]. */
  _shape(x, F) {
    const h = this.h, M = F * this.a;
    if (x <= h) return [M * (h * h - x * x) / (2 * EI), -M * x / EI];
    const s = Math.min(x, SHAFT_HALF) - h, th = M * h / EI;
    let w = -(th * s + F * (this.a * s * s / 2 - s * s * s / 6) / EI); const slope = -(th + F * (this.a * s - s * s / 2) / EI);
    if (x > SHAFT_HALF) w += slope * (x - SHAFT_HALF);
    return [w, slope];
  }

  /** Posa la barra sin dinámica: flecha estática para la altura dada. */
  settle(handY) { this.v = 0; this.acc = 0; this.q = Math.max(-G / this.w2, this.plateR - handY); this._apply(handY); }

  /**
   * Avanza la oscilación de las mangas. handY: altura de las manos; acc: aceleración vertical de las manos (m/s²); dt en tiempo de simulación.
   */
  step(dt, handY, acc) {
    const n = Math.max(1, Math.ceil(dt * 600)), hstep = dt / n, floorQ = this.plateR - handY;
    // la aceleración muestreada trae picos: se acota a valores humanos y se filtra antes de excitar la viga
    this.acc += (clamp(acc, ACC_MIN, ACC_MAX) - this.acc) * (1 - Math.exp(-dt / ACC_TAU));
    for (let i = 0; i < n; i++) {
      this.v += (-(G + this.acc) - this.w2 * this.q - 2 * ZETA * this.w * this.v) * hstep;
      this.q += this.v * hstep;
      if (this.q < floorQ) { this.q = floorQ; if (this.v < 0) this.v *= -.12; }
    }
    this._apply(handY);
  }

  _apply(handY) {
    const qv = Q_SOFT * Math.tanh(this.q / Q_SOFT);   // límite blando de la flecha visible
    const F = -qv / this.c * this.flexGain;       // fuerza efectiva en el centro de carga
    this.force = F; this.onFloor = handY + this.q <= this.plateR + 1e-4;
    const p = this.shaftGeo.attributes.position, arr = p.array, base = this._base;
    for (let i = 0; i < arr.length; i += 3) arr[i + 1] = base[i + 1] + this._shape(Math.abs(base[i]), F)[0];
    p.needsUpdate = true;
    const [w, slope] = this._shape(SHAFT_HALF, F);
    for (const side of this.sides) { side.tilt.position.set(side.sign * SHAFT_HALF, w, 0); side.tilt.rotation.z = side.sign * Math.atan(slope); }
    this.tipDrop = this._shape(this.centroidX, F)[0];
  }

  setPosition(v) { this.group.position.copy(v); }

  dispose() {
    this.group.removeFromParent(); disposeObject(this.group);
    for (const { body, ring, faceMat } of this._plateGeo.values()) { body.dispose(); ring.dispose(); faceMat.map?.dispose(); faceMat.normalMap?.dispose(); faceMat.dispose(); }
    if (this._collarGeo) Object.values(this._collarGeo).forEach(g => g.dispose());
    Object.values(this.mat).forEach(m => m.dispose()); this._rubber.forEach(m => m.dispose()); this._disposables.forEach(t => t.dispose());
  }
}
export { MIN_KG, BAR_KG };
