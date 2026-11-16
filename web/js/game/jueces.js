// Jueces y oficiales sentados, solo en el juego (LIF-38). Reemplazan a los muñecos de cápsulas de arena.js (que el visor
// sigue usando): personas ficticias modeladas por código, sin imágenes ni caras de nadie real.
// - Tres árbitros en una sola mesa al frente de la tarima, de saco azul, camisa y corbata. Cada uno tiene una paleta: cuando
//   se prende su luz la levanta (blanca si vale, roja si no) y la baja cuando las luces se apagan.
// - El jurado lateral (cinco, en una mesa larga) y los dos de la mesa técnica, con menos detalle: se ven de lejos.
// Costo: cada grupo es UNA malla con color por vértice (un material Lambert sin texturas para todos), los tres brazos de las
// paletas son una malla cuyas posiciones se recalculan en JavaScript solo mientras un brazo se mueve (unos 600 vértices,
// 0,35 s por luz) y las tres paletas un dibujo instanciado. Sin sombras propias, sin huesos, sin trabajo por cuadro en reposo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FLOOR_Y = -1, STAGE_Y = -.1;      // los de arena.js
/** Dónde se sientan (lo mismo que arena.js: la mesa en el origen del asiento, la persona medio metro detrás). */
export const MESA_ARBITROS = { x: 0, y: FLOOR_Y, z: 6.9, ry: Math.PI, sep: .95 };
const V = (x, y, z) => new THREE.Vector3(x, y, z), col = hex => new THREE.Color(hex);
const UP = V(0, 1, 0), UNO = V(1, 1, 1), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = V(0, 0, 0), _b = V(0, 0, 0);
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- geometría ----------
/** Una pieza con color por vértice, ya en su lugar, con la luz pintada en el color (oclusión y rebote, sin luces de más). */
function pieza(g, color, pos = [0, 0, 0], rot = null, esc = null) {
  g.deleteAttribute('uv');
  g.applyMatrix4(_m.compose(V(...pos), rot || _q.identity(), esc ? V(...esc) : UNO));
  if (!g.attributes.normal) g.computeVertexNormals();
  const N = g.attributes.normal, n = N.count, c = new Float32Array(n * 3);
  // lo que mira hacia abajo, más oscuro; lo que mira a la tarima (+z), más claro: el rebote de la luz del escenario
  for (let i = 0; i < n; i++) { const k = 1 + .34 * Math.min(0, N.getY(i)) + .28 * Math.max(0, N.getZ(i)); c[i * 3] = color.r * k; c[i * 3 + 1] = color.g * k; c[i * 3 + 2] = color.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const rotX = a => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
/** Cápsula entre dos puntos (brazos y piernas). */
function tramo(a, b, r, color, radial = 8) {
  const A = V(...a), B = V(...b), d = B.clone().sub(A), len = d.length();
  return pieza(new THREE.CapsuleGeometry(r, len, 2, radial), color, A.add(B).multiplyScalar(.5).toArray(), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
}
/** Cuerpo por secciones [y, radio en x, radio en z, corrimiento en z]: superelipses unidas, cerrado arriba. Para el saco. */
function cuerpo(sec, n, e = 2.6) {
  const pos = [], idx = [], p = 2 / e;
  for (const [y, rx, rz, z0 = 0] of sec) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(rx * Math.sign(c) * Math.abs(c) ** p, y, z0 + rz * Math.sign(s) * Math.abs(s) ** p); }
  for (let j = 0; j < sec.length - 1; j++) for (let k = 0; k < n; k++) { const a = j * n + k, b = j * n + (k + 1) % n, c = a + n, d = b + n; idx.push(a, c, b, b, c, d); }
  const [yT, , , zT = 0] = sec[sec.length - 1], t = pos.length / 3, base = (sec.length - 1) * n; pos.push(0, yT + .008, zT);
  for (let k = 0; k < n; k++) idx.push(base + k, t, base + (k + 1) % n);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Tira plana que mira a +z, por filas [y, medio ancho, z]: la camisa en V y la corbata, apoyadas sobre el pecho. */
function tira(filas) {
  const pos = [], idx = [];
  for (const [y, hw, z] of filas) pos.push(-hw, y, z, hw, y, z);
  for (let j = 0; j < filas.length - 1; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const TORSO = [[.47, .185, .125, 0], [.62, .18, .12, 0], [.8, .195, .125, .005], [.95, .215, .125, .01], [1.035, .21, .105, .005], [1.075, .12, .085, 0], [1.092, .06, .06, 0]];
// brazo: hombro, codo y muñeca (lado s = ±1) con el antebrazo apoyado en la mesa; y el brazo de la paleta levantado
const HOMBRO = s => V(s * .228, 1.0, 0), CODO = s => V(s * .268, .825, .15), MUNECA = s => V(s * .15, .805, .41);
const CODO_ARRIBA = s => V(s * .345, .9, .14), ANTEBRAZO_ARRIBA = s => V(s * .02, .97, .2).normalize();
/** Brazo como piezas [geometría, junta]: 0 gira en el hombro, 1 en el codo. `paleta`: con el mango (el disco va instanciado aparte). */
function brazo(s, C, radial, paleta = false) {
  const S = HOMBRO(s), E = CODO(s), W = MUNECA(s), f = W.clone().sub(E).normalize(), mano = W.clone().addScaledVector(f, .045);
  const p = [[tramo(S.toArray(), E.toArray(), .052, C.traje, radial), 0], [tramo(E.toArray(), W.toArray(), .043, C.traje, radial), 1],
    [pieza(new THREE.SphereGeometry(.04, 7, 5), C.piel, mano.toArray(), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), f), [.95, .62, 1.3]), 1]];
  if (paleta) p.push([tramo(mano.toArray(), W.clone().addScaledVector(f, .2).toArray(), .011, C.mango, 6), 1]);
  return p;
}
/**
 * Una persona sentada mirando a +z, con el piso en y = 0 y la silla debajo. `det` 1: árbitro (cara con nariz, ojos y orejas,
 * más segmentos); 0: de lejos. `paleta`: sin el brazo derecho (va aparte, animado). Devuelve las piezas fijas.
 */
function persona(C, { det = 1, paleta = false, pelo = 'corto', corbata = true } = {}) {
  const P = [], rs = det ? 8 : 6, add = g => { P.push(g); };
  // silla
  add(pieza(new THREE.BoxGeometry(.44, .04, .42), C.silla, [0, .45, -.02])); add(pieza(new THREE.BoxGeometry(.4, .34, .035), C.silla, [0, .7, -.235]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(pieza(new THREE.BoxGeometry(.03, .45, .03), C.silla, [sx * .19, .225, -.02 + sz * .18]));
  // piernas y zapatos
  for (const s of [-1, 1]) { add(tramo([s * .1, .555, -.04], [s * .1, .555, .36], .08, C.pantalon, rs)); add(tramo([s * .1, .5, .41], [s * .1, .1, .43], .058, C.pantalon, rs)); add(pieza(new THREE.BoxGeometry(.09, .07, .24), C.zapato, [s * .1, .035, .48])); }
  // saco, camisa en V, corbata, cuello
  add(pieza(cuerpo(TORSO, det ? 14 : 10), C.traje));
  add(pieza(tira([[1.066, .056, .106], [.95, .034, .143], [.8, 0, .138]]), C.camisa));
  if (corbata) { add(pieza(tira([[1.058, .02, .113], [.95, .026, .149], [.84, .03, .146], [.8, 0, .144]]), C.corbata)); add(pieza(new THREE.BoxGeometry(.042, .034, .022), C.corbata, [0, 1.06, .108])); }
  add(pieza(new THREE.CylinderGeometry(.057, .062, .036, 10), C.camisa, [0, 1.092, .004])); add(pieza(new THREE.CylinderGeometry(.045, .05, .1, 10), C.piel, [0, 1.125, .006]));
  // cabeza
  const cy = 1.25, cz = .02;
  add(pieza(new THREE.SphereGeometry(.098, det ? 14 : 10, det ? 10 : 7), C.piel, [0, cy, cz], null, [.92, 1.14, 1.02]));
  if (det) {
    for (const s of [-1, 1]) { add(pieza(new THREE.SphereGeometry(.02, 6, 4), C.piel, [s * .09, cy - .008, cz - .006], null, [.5, 1, .8])); add(pieza(new THREE.SphereGeometry(.011, 6, 4), C.ojo, [s * .034, cy + .016, cz + .087])); }
    add(pieza(new THREE.SphereGeometry(.016, 6, 4), C.piel, [0, cy - .014, cz + .098], null, [.8, 1.35, 1]));
  }
  const sp = det ? 14 : 10;
  if (pelo === 'calvo') add(pieza(new THREE.SphereGeometry(.102, sp, 6, 0, Math.PI * 2, 0, Math.PI * .46), C.pelo, [0, cy - .012, cz - .008], rotX(-1.25), [.95, 1.02, 1.1]));
  else add(pieza(new THREE.SphereGeometry(.103, sp, 7, 0, Math.PI * 2, 0, Math.PI * .52), C.pelo, [0, cy + .01, cz - .006], rotX(-.62), [.95, 1.13, 1.06]));
  if (pelo === 'melena') add(pieza(new THREE.SphereGeometry(.1, sp, 7), C.pelo, [0, cy - .06, cz - .05], null, [1.02, 1.2, .7]));
  // brazos apoyados en la mesa (el de la paleta, s = -1, va aparte)
  for (const s of paleta ? [1] : [-1, 1]) for (const [g] of brazo(s, C, rs)) add(g);
  // de la cintura para abajo, debajo de la mesa, llega menos luz
  for (const g of P) { const p = g.attributes.position, c = g.attributes.color; for (let i = 0; i < p.count; i++) { const k = .5 + .5 * suave(.3, .95, p.getY(i)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); } }
  return P;
}
/** Mesa de largo L con mantel hasta el piso y una banda clara; el frente (+z) mira a la tarima. */
function mesa(L, C) {
  return [pieza(new THREE.BoxGeometry(L, .035, .62), C.tapa, [0, .7425, 0]), pieza(new THREE.BoxGeometry(L, .725, .025), C.mantel, [0, .3625, .297]),
    pieza(new THREE.BoxGeometry(.025, .725, .6), C.mantel, [-L / 2 + .0125, .3625, 0]), pieza(new THREE.BoxGeometry(.025, .725, .6), C.mantel, [L / 2 - .0125, .3625, 0]),
    pieza(new THREE.BoxGeometry(L, .05, .012), C.banda, [0, .64, .312])];
}
const asiento = (x, y, z, ry) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), UNO);
const correr = (x, z) => new THREE.Matrix4().makeTranslation(x, 0, z);

const PIEL = ['#c99672', '#8d5a3c', '#e2b490', '#b07a54', '#6f4630', '#d6a37c'].map(col), PELO = ['#2a1d14', '#0e0e10', '#77777c', '#4a3020', '#b9b3a8', '#3a2a1c'].map(col);
const CORBATA = ['#6e1f2a', '#27406e', '#4a4e58'].map(col), ESTILO = ['corto', 'melena', 'calvo', 'corto', 'melena', 'corto'];
const BASE = { camisa: col('#d9dce2'), zapato: col('#0d0d10'), silla: col('#3a3d49'), ojo: col('#17120f'), mango: col('#3a2c20'), tapa: col('#2b3248'), mantel: col('#222a42'), banda: col('#aab0c2') };
/** Colores de la persona k de un grupo con su uniforme (saco y pantalón). */
const gente = (k, traje, pantalon) => ({ ...BASE, traje: col(traje), pantalon: col(pantalon), piel: PIEL[(k * 5 + 1) % PIEL.length], pelo: PELO[(k * 7 + 2) % PELO.length], corbata: CORBATA[k % CORBATA.length] });

const BLANCA = new THREE.Color(1.12, 1.1, 1.02), ROJA = new THREE.Color(.5, .012, .008), GUARDADA = new THREE.Color(.05, .05, .06);
/** Luz de sala propia de las mesas (fracción del color de cada superficie): las luces del escenario apuntan a la tarima y sin esto quedan en negro. */
const RELLENO = .26;
/** Segundos que tarda en subir y en bajar la paleta. */
const SUBE = .35, BAJA = .55;

export class Jueces {
  constructor({ reduceMotion = false } = {}) {
    this.group = new THREE.Group(); this.group.name = 'Jueces'; this.reduce = reduceMotion;
    const mat = this.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); mat.name = 'jueces';
    mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse += diffuseColor.rgb * ${RELLENO.toFixed(3)};`); };
    const malla = (lista, nombre) => { const g = mergeGeometries(lista); lista.forEach(x => x.dispose()); const m = new THREE.Mesh(g, mat); m.name = nombre; m.matrixAutoUpdate = false; this.group.add(m); return m; };
    const en = (lista, M) => lista.map(g => g.applyMatrix4(M));

    // árbitros: una mesa, tres personas; la luz i (de izquierda a derecha mirando a la pantalla) es el árbitro en x = (i − 1)·sep
    const A = MESA_ARBITROS, MA = asiento(A.x, A.y, A.z, A.ry), fijos = en(mesa(A.sep * 2 + 1, BASE), MA), brazos = [];
    this.arb = [];
    for (let i = 0; i < 3; i++) {
      const C = gente(i, '#313a52', '#2a2e38'), M = MA.clone().multiply(correr(-(i - 1) * A.sep, -.5));
      fijos.push(...en(persona(C, { det: 1, paleta: true, pelo: ESTILO[i] }), M));
      // consola con sus dos botones delante de cada uno
      fijos.push(...en([pieza(new THREE.BoxGeometry(.2, .04, .12), BASE.silla, [.22, .78, .62]), pieza(new THREE.SphereGeometry(.014, 6, 4), col('#e8e6dc'), [.18, .803, .62]), pieza(new THREE.SphereGeometry(.014, 6, 4), col('#c8261c'), [.26, .803, .62])], M));
      const p = brazo(-1, C, 8, true), g = mergeGeometries(p.map(x => x[0])), junta = new Uint8Array(g.attributes.position.count); let o = 0;
      for (const [x, j] of p) { junta.fill(j, o, o + x.attributes.position.count); o += x.attributes.position.count; x.dispose(); }
      brazos.push(g); this.arb.push({ M, junta, k: 0, a: 0, hecho: -1 });
    }
    this.fijos = [malla(fijos, 'árbitros')];
    // los tres brazos de las paletas: una malla; posiciones y normales en reposo aparte, para recalcularlas al moverse
    const gb = mergeGeometries(brazos); brazos.forEach(g => g.dispose());
    this.P0 = gb.attributes.position.array.slice(); this.N0 = gb.attributes.normal.array.slice(); this.nBrazo = this.P0.length / 9;
    gb.boundingSphere = new THREE.Sphere(V(A.x, A.y + 1, A.z + .4), A.sep + 1.2);
    this.brazos = new THREE.Mesh(gb, mat); this.brazos.name = 'brazos de las paletas'; this.brazos.matrixAutoUpdate = false; this.group.add(this.brazos);
    // las paletas: un disco instanciado, sin luces (se lee igual en cualquier calidad)
    const S = HOMBRO(-1), E = CODO(-1), W = MUNECA(-1), f = W.clone().sub(E).normalize(), lado = f.clone().cross(UP).normalize(), nrm = lado.clone().cross(f).normalize();
    const disco = new THREE.CylinderGeometry(.098, .098, .014, 20); disco.applyMatrix4(_m.compose(W.clone().addScaledVector(f, .045 + .25), new THREE.Quaternion().setFromUnitVectors(UP, nrm), UNO));
    this.paletas = new THREE.InstancedMesh(disco, new THREE.MeshBasicMaterial({ color: 0xffffff }), 3); this.paletas.name = 'paletas'; this.paletas.matrixAutoUpdate = false;
    this.paletas.boundingSphere = gb.boundingSphere.clone(); this.paletas.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.paletas);
    this._r = { S, u0: E.clone().sub(S), f0: f, u1: CODO_ARRIBA(-1).sub(S).normalize(), f1: ANTEBRAZO_ARRIBA(-1) }; this._r.Lu = this._r.u0.length(); this._r.u0.normalize(); this._r.E0 = E;
    for (let i = 0; i < 3; i++) { this.paletas.setColorAt(i, GUARDADA); this._posar(i); }
    this.paletas.instanceColor.needsUpdate = true;

    // jurado lateral (cinco, mesa larga) y mesa técnica (dos mesas sobre el escenario): de lejos, sin gesto
    const ML = asiento(-8.3, FLOOR_Y, .1, Math.PI / 2), lat = en(mesa(6.2, BASE), ML);
    for (let i = 0; i < 5; i++) lat.push(...en(persona(gente(i + 3, '#454955', '#2c2f37'), { det: 0, pelo: ESTILO[(i + 3) % ESTILO.length], corbata: i % 2 === 0 }), ML.clone().multiply(correr((i - 2) * 1.25, -.5))));
    this.fijos.push(malla(lat, 'jurado lateral'));
    const tec = [];
    [[5.0, -4.3, -.86], [5.75, -3.3, -1.05]].forEach(([x, z, ry], i) => { const M = asiento(x, STAGE_Y, z, ry); tec.push(...en(mesa(1.1, BASE), M), ...en(persona(gente(i + 8, '#30384e', '#2a2e38'), { det: 0, pelo: ESTILO[(i + 2) % ESTILO.length] }), M.clone().multiply(correr(0, -.5)))); });
    this.fijos.push(malla(tec, 'mesa técnica'));
    this.group.traverse(o => { o.castShadow = false; o.receiveShadow = false; o.updateMatrix?.(); });
  }
  /** Lleva el brazo y la paleta del árbitro i a su posición (a.a: 0 apoyado en la mesa, 1 levantado). */
  _posar(i) {
    const a = this.arb[i], R = this._r, e = a.a * a.a * (3 - 2 * a.a);
    const u = _a.copy(R.u0).lerp(R.u1, e).normalize(), q0 = new THREE.Quaternion().setFromUnitVectors(R.u0, u), E = u.clone().multiplyScalar(R.Lu).add(R.S);
    const q1 = new THREE.Quaternion().setFromUnitVectors(R.f0, _b.copy(R.f0).lerp(R.f1, e).normalize());
    // junta 0: gira en el hombro; junta 1: lleva el codo de reposo al codo de ahora, girado
    const J0 = new THREE.Matrix4().makeTranslation(R.S.x, R.S.y, R.S.z).multiply(_m.makeRotationFromQuaternion(q0)).multiply(_m.makeTranslation(-R.S.x, -R.S.y, -R.S.z)).premultiply(a.M);
    const J1 = new THREE.Matrix4().makeTranslation(E.x, E.y, E.z).multiply(_m.makeRotationFromQuaternion(q1)).multiply(_m.makeTranslation(-R.E0.x, -R.E0.y, -R.E0.z)).premultiply(a.M);
    const P = this.brazos.geometry.attributes.position, N = this.brazos.geometry.attributes.normal, n = this.nBrazo, o = i * n, v = _a;
    for (let k = 0; k < n; k++) {
      const J = a.junta[k] ? J1 : J0, x = (o + k) * 3;
      v.set(this.P0[x], this.P0[x + 1], this.P0[x + 2]).applyMatrix4(J); P.setXYZ(o + k, v.x, v.y, v.z);
      v.set(this.N0[x], this.N0[x + 1], this.N0[x + 2]).transformDirection(J); N.setXYZ(o + k, v.x, v.y, v.z);
    }
    P.needsUpdate = true; N.needsUpdate = true;
    this.paletas.setMatrixAt(i, J1); this.paletas.instanceMatrix.needsUpdate = true; a.hecho = a.a;
  }
  /** Decisión de los árbitros (lo mismo que arena.setDecision): cada luz prendida levanta la paleta de su árbitro. */
  setDecision(d) {
    for (let i = 0; i < 3; i++) {
      const x = d ? d[i] : null, a = this.arb[i]; a.k = x === null || x === undefined ? 0 : 1;
      if (a.k) { this.paletas.setColorAt(i, x ? BLANCA : ROJA); this.paletas.instanceColor.needsUpdate = true; }
    }
  }
  update(dt) {
    for (let i = 0; i < 3; i++) {
      const a = this.arb[i]; if (a.a === a.k && a.hecho === a.a) continue;
      a.a = this.reduce ? a.k : a.k > a.a ? Math.min(1, a.a + dt / SUBE) : Math.max(0, a.a - dt / BAJA);
      if (a.a === 0) { this.paletas.setColorAt(i, GUARDADA); this.paletas.instanceColor.needsUpdate = true; }
      this._posar(i);
    }
  }
  dispose() { this.group.removeFromParent(); for (const m of [...this.fijos, this.brazos, this.paletas]) m.geometry.dispose(); this.mat.dispose(); this.paletas.material.dispose(); }
}
