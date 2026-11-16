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
import { persona as personaGente, brazo as brazoGente, mesa as mesaGente, limpiar } from './gente.js';

const FLOOR_Y = -1, STAGE_Y = -.1;      // los de arena.js
/** Dónde se sientan (lo mismo que arena.js: la mesa en el origen del asiento, la persona medio metro detrás). */
export const MESA_ARBITROS = { x: 0, y: FLOOR_Y, z: 6.9, ry: Math.PI, sep: .95 };
const V = (x, y, z) => new THREE.Vector3(x, y, z), col = hex => new THREE.Color(hex);
const UP = V(0, 1, 0), UNO = V(1, 1, 1), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = V(0, 0, 0), _b = V(0, 0, 0);
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- geometría: las personas salen de gente.js; acá se les pinta el color y la luz ----------
/** Geometría con color por vértice y la luz pintada en el color (oclusión y rebote, sin luces de más). */
function pintar(g, color) {
  limpiar(g);
  const N = g.attributes.normal, P = g.attributes.position, n = N.count, c = new Float32Array(n * 3), so = g.attributes.sombra, ti = g.attributes.tinte;
  // lo que mira hacia abajo, más oscuro; lo que mira a la tarima (+z), más claro: el rebote de la luz del escenario
  for (let i = 0; i < n; i++) { const nz = N.getZ(i), ny = N.getY(i), k = (.5 + .62 * Math.max(0, nz * .9 + ny * .42) + .16 * Math.max(0, ny) + .2 * Math.min(0, ny)) * (so ? so.getX(i) : 1); const w = Math.max(0, nz * .9 + ny * .42); c[i * 3] = color.r * k * (1 + .1 * w) * (ti ? ti.getX(i) : 1); c[i * 3 + 1] = color.g * k * (ti ? ti.getY(i) : 1); c[i * 3 + 2] = color.b * k * (1 - .13 * w) * (ti ? ti.getZ(i) : 1); }      /* la luz que les llega de frente es cálida (lámpara de mesa y rebote de la tarima) */
  g.deleteAttribute('sombra'); g.deleteAttribute('tinte'); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const pieza = (g, color, pos = [0, 0, 0], rot = null, esc = null) => pintar(g.applyMatrix4(_m.compose(V(...pos), rot || _q.identity(), esc ? V(...esc) : UNO)), color);
/** Cápsula entre dos puntos (el mango de la paleta). */
function tramo(a, b, r, color, radial = 8) {
  const A = V(...a), B = V(...b), d = B.clone().sub(A), len = d.length();
  return pieza(new THREE.CapsuleGeometry(r, len, 2, radial), color, A.add(B).multiplyScalar(.5).toArray(), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
}
const de = (piezas, C) => piezas.map(({ g, parte }) => pintar(g, C[parte] || C.traje));
// brazo de la paleta (lado s = -1): hombro, codo y muñeca apoyado en la mesa, y levantado
const HOMBRO = s => V(s * .212, 1.008, -.004), MANO_MESA = s => V(s * .15, .8, .41), POLO = s => V(s * .6, -.6, -.5);
const CODO_ARRIBA = s => V(s * .345, .9, .14), ANTEBRAZO_ARRIBA = s => V(s * .02, .97, .2).normalize();
/** Brazo de la paleta como piezas [geometría, junta]: 0 gira en el hombro, 1 en el codo; con el mango (el disco va instanciado aparte). */
function brazoPaleta(C, radial) {
  const b = brazoGente(HOMBRO(-1), MANO_MESA(-1), { lado: -1, polo: POLO(-1), n: radial }), p = b.piezas.map(x => [pintar(x.g, C[x.parte] || C.traje), x.tramo]);
  const mano = b.W.clone().addScaledVector(b.f, .045);
  p.push([tramo(mano.toArray(), b.W.clone().addScaledVector(b.f, .2).toArray(), .011, C.mango, 6), 1]);
  return { p, ...b };
}
/**
 * Una persona sentada mirando a +z, con el piso en y = 0 y la silla debajo. `det` 1: árbitro (más segmentos); 0: de lejos.
 * `paleta`: sin el brazo derecho (va aparte, animado). Devuelve las piezas fijas, ya pintadas.
 */
function persona(C, { det = 1, paleta = false, pelo = 'corto', corbata = true, k = 0, gesto = 'mesa', ropa = 'saco', dePie = false, giro = null, inc = .03 } = {}) {
  const P = de(personaGente({ cuerpo: .45 + .12 * ((k * 3) % 4), pelo: pelo === 'calvo' ? 'entradas' : pelo, ropa, gesto, det, silla: !dePie, dePie, sinBrazo: paleta ? -1 : 0, corbata, semilla: 31 + k * 5, anteojos: k % 3 === 1,
    cabezaGiro: giro ?? ((k * 7) % 5 - 2) * .06, cabezaInc: inc, forma: { ancho: .97 + .03 * ((k * 5) % 3), mandibula: .95 + .06 * (k % 3), barba: [.5, .15, .8, 0, .35][k % 5] } }).piezas, C);
  // de la cintura para abajo, debajo de la mesa, llega menos luz
  if (!dePie) for (const g of P) { const p = g.attributes.position, c = g.attributes.color; for (let i = 0; i < p.count; i++) { const q = .5 + .5 * suave(.3, .95, p.getY(i)); c.setXYZ(i, c.getX(i) * q, c.getY(i) * q, c.getZ(i) * q); } }
  return P;
}
const mesa = (L, C) => de(mesaGente(L), C);
const asiento = (x, y, z, ry) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), UNO);
const correr = (x, z) => new THREE.Matrix4().makeTranslation(x, 0, z);

const PIEL = ['#b98562', '#85543a', '#cc9a78', '#a36f4c', '#6a4330', '#c08f6c'].map(col), PELO = ['#2a1d14', '#0e0e10', '#77777c', '#4a3020', '#b9b3a8', '#3a2a1c'].map(col);
const CORBATA = ['#6e1f2a', '#27406e', '#4a4e58'].map(col), ESTILO = ['corto', 'melena', 'calvo', 'corto', 'melena', 'corto'];
const BASE = { canto: col('#7c828f'), zocalo: col('#0c0e14'), esclera: col('#8f8983'), iris: col('#1b130d'), marco: col('#0c0c0e'), camisa: col('#d9dce2'), zapato: col('#0d0d10'), silla: col('#3a3d49'), ojo: col('#17120f'), mango: col('#3a2c20'), tapa: col('#2a3044'), mantel: col('#1b2032'), banda: col('#aab0c2') };
/** Colores de la persona k de un grupo con su uniforme (saco y pantalón). */
const gente = (k, traje, pantalon) => ({ ...BASE, traje: col(traje), ropa: col(traje), solapa: col(traje).multiplyScalar(1.35), pantalon: col(pantalon), piel: PIEL[(k * 5 + 1) % PIEL.length], pelo: PELO[(k * 7 + 2) % PELO.length], corbata: CORBATA[k % CORBATA.length] });

const APAGADA = new THREE.Color(.03, .03, .035), NEGRO = new THREE.Color(0, 0, 0), LUZ_B = new THREE.Color(1.6, 1.55, 1.4), LUZ_R = new THREE.Color(1.7, .1, .06), BR_B = new THREE.Color(.5, .48, .42), BR_R = new THREE.Color(.6, .04, .02);
const BLANCA = new THREE.Color(1.12, 1.1, 1.02), ROJA = new THREE.Color(.5, .012, .008), GUARDADA = new THREE.Color(.05, .05, .06);
/** Luz de sala propia de las mesas (fracción del color de cada superficie): las luces del escenario apuntan a la tarima y sin esto quedan en negro. */
const RELLENO = .5;
/** Segundos que tarda en subir y en bajar la paleta. */
const SUBE = .35, BAJA = .55;

/** Mallas de la gente lejana en sus dos versiones: look.js muestra `fino` con post y `liviano` en el camino directo. */
export const LEJOS = { fino: [], liviano: [] };

export class Jueces {
  constructor({ reduceMotion = false } = {}) {
    this.group = new THREE.Group(); this.group.name = 'Jueces'; this.reduce = reduceMotion;
    const mat = this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); mat.name = 'jueces';
    const parche = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse += diffuseColor.rgb * ${RELLENO.toFixed(3)};`); };
    mat.onBeforeCompile = parche;
    // los tres árbitros con su material: desde la cámara del jurado (detrás de ellos) bajan 66 cm (salen del cuadro) y quedan a contraluz
    const uAtras = this.uAtras = { value: 0 }, matArb = this.matArb = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); matArb.name = 'árbitros';
    matArb.onBeforeCompile = sh => { parche(sh); sh.uniforms.uAtras = uAtras;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAtras;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y -= 0.66 * uAtras;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAtras;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.rgb *= 1.0 - 0.72 * uAtras;'); };
    const malla = (lista, nombre) => { const g = mergeGeometries(lista); lista.forEach(x => x.dispose()); const m = new THREE.Mesh(g, mat); m.name = nombre; m.matrixAutoUpdate = false; this.group.add(m); return m; };
    const en = (lista, M) => lista.map(g => g.applyMatrix4(M));

    // árbitros: una mesa, tres personas; la luz i (de izquierda a derecha mirando a la pantalla) es el árbitro en x = (i − 1)·sep
    const A = MESA_ARBITROS, MA = asiento(A.x, A.y, A.z, A.ry), fijos = en(mesa(A.sep * 2 + 1, BASE), MA), brazos = [];
    this.arb = [];
    for (let i = 0; i < 3; i++) {
      const C = gente(i, ['#343b50', '#2b334a', '#3a3b45'][i], '#24272f'), M = MA.clone().multiply(correr(-(i - 1) * A.sep, -.5));
      fijos.push(...en(persona(C, { det: 1, paleta: false, pelo: ESTILO[i], k: i, gesto: ['escribe', 'mesa', 'menton'][i], giro: [.22, -.06, -.3][i], inc: [.2, .02, .07][i] }), M));
      fijos.push(...en([pieza(new THREE.BoxGeometry(.16, .14, .05), col('#101116'), [0, .845, .74])], M));      // caja de la luz de decisión
      // lo que hay en una mesa de árbitros: papeles, botella y micrófono de cuello
      fijos.push(...en([pieza(new THREE.BoxGeometry(.21, .003, .297), col('#cfcdc4'), [-.08 + .05 * i, .787, .5], new THREE.Quaternion().setFromAxisAngle(UP, .2 - .25 * i)), pieza(new THREE.BoxGeometry(.21, .003, .297), col('#b9b7ae'), [-.11, .784, .47], new THREE.Quaternion().setFromAxisAngle(UP, -.1)),
        pieza(new THREE.CylinderGeometry(.03, .032, .2, 10), col('#3d5a78'), [-.33, .885, .52]), pieza(new THREE.CylinderGeometry(.014, .014, .03, 8), col('#d8d8d8'), [-.33, 1.0, .52]),
        tramo([.38, .785, .56], [.36, .98, .5], .006, col('#15161a'), 6), pieza(new THREE.SphereGeometry(.022, 8, 6), col('#22242a'), [.36, .99, .49]), pieza(new THREE.CylinderGeometry(.045, .05, .012, 10), col('#15161a'), [.38, .786, .56])], M));      // las dos manos en la mesa: la decisión se ve en las luces y en la pantalla (la paleta en alto se leía como un chupetín con un brazo cortado)
      // consola con sus dos botones delante de cada uno
      fijos.push(...en([pieza(new THREE.BoxGeometry(.2, .04, .12), BASE.silla, [.22, .78, .62]), pieza(new THREE.SphereGeometry(.014, 6, 4), col('#e8e6dc'), [.18, .803, .62]), pieza(new THREE.SphereGeometry(.014, 6, 4), col('#c8261c'), [.26, .803, .62])], M));
      const bp = brazoPaleta(C, 10), p = bp.p, g = mergeGeometries(p.map(x => x[0])), junta = new Uint8Array(g.attributes.position.count); let o = 0;
      for (const [x, j] of p) { junta.fill(j, o, o + x.attributes.position.count); o += x.attributes.position.count; x.dispose(); }
      brazos.push(g); this.arb.push({ M, junta, k: 0, a: 0, hecho: -1 }); this._bp = bp;
    }
    this.fijos = [malla(fijos, 'árbitros')]; this.fijos[0].material = matArb; this.fijos[0].onBeforeRender = (r, e, cam) => { const atras = cam.position.z > 7.5; uAtras.value = atras ? 1 : 0; if (this.luces) this.luces.visible = this.brillos.visible = !atras; };
    // los tres brazos de las paletas: una malla; posiciones y normales en reposo aparte, para recalcularlas al moverse
    const gb = mergeGeometries(brazos); brazos.forEach(g => g.dispose());
    this.P0 = gb.attributes.position.array.slice(); this.N0 = gb.attributes.normal.array.slice(); this.nBrazo = this.P0.length / 9;
    gb.boundingSphere = new THREE.Sphere(V(A.x, A.y + 1, A.z + .4), A.sep + 1.2);
    this.brazos = new THREE.Mesh(gb, mat); this.brazos.name = 'brazos de las paletas'; this.brazos.matrixAutoUpdate = false; this.brazos.visible = false; this.group.add(this.brazos);
    // las paletas: un disco instanciado, sin luces (se lee igual en cualquier calidad)
    const { S, E, W, f } = this._bp, lado = f.clone().cross(UP).normalize(), nrm = lado.clone().cross(f).normalize();
    const disco = new THREE.CylinderGeometry(.098, .098, .014, 20); disco.applyMatrix4(_m.compose(W.clone().addScaledVector(f, .045 + .25), new THREE.Quaternion().setFromUnitVectors(UP, nrm), UNO));
    let txP = null;
    if (typeof document !== 'undefined') { const cvP = document.createElement('canvas'); cvP.width = cvP.height = 64; const g = cvP.getContext('2d'), rg = g.createRadialGradient(28, 26, 2, 32, 32, 32); rg.addColorStop(0, '#ffffff'); rg.addColorStop(.7, '#e9e7e0'); rg.addColorStop(.93, '#cfccc4'); rg.addColorStop(1, '#8f8c86'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); txP = new THREE.CanvasTexture(cvP); txP.colorSpace = THREE.SRGBColorSpace; }
    this.paletas = new THREE.InstancedMesh(disco, new THREE.MeshBasicMaterial({ color: 0xffffff, map: txP }), 3); this.paletas.name = 'paletas'; this.paletas.matrixAutoUpdate = false;
    this.paletas.visible = false; this.paletas.boundingSphere = gb.boundingSphere.clone(); this.paletas.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.paletas);
    // luz de decisión de cada árbitro: una caja en el borde de la mesa con su lámpara (blanca o roja) y un resplandor
    { const lamp = new THREE.CylinderGeometry(.05, .05, .018, 18); lamp.rotateX(Math.PI / 2);
      this.luces = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ color: 0xffffff }), 3); this.luces.name = 'luces de los árbitros'; this.luces.matrixAutoUpdate = false; this.luces.frustumCulled = false; this.group.add(this.luces);
      let tx = null; if (typeof document !== 'undefined') { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.3, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); tx = new THREE.CanvasTexture(cv); }
      this.brillos = new THREE.InstancedMesh(new THREE.PlaneGeometry(.5, .5), new THREE.MeshBasicMaterial({ map: tx, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 3); this.brillos.name = 'resplandor de las luces de los árbitros'; this.brillos.matrixAutoUpdate = false; this.brillos.frustumCulled = false; this.brillos.renderOrder = 6; this.group.add(this.brillos);
      this.arb.forEach((a, i) => { this.luces.setMatrixAt(i, a.M.clone().multiply(new THREE.Matrix4().makeTranslation(0, .845, .77))); this.brillos.setMatrixAt(i, a.M.clone().multiply(new THREE.Matrix4().makeTranslation(0, .845, .785))); this.luces.setColorAt(i, APAGADA); this.brillos.setColorAt(i, NEGRO); });
      this.luces.instanceColor.needsUpdate = this.brillos.instanceColor.needsUpdate = true; }
    this._r = { S, u0: E.clone().sub(S), f0: f, u1: CODO_ARRIBA(-1).sub(S).normalize(), f1: ANTEBRAZO_ARRIBA(-1) }; this._r.Lu = this._r.u0.length(); this._r.u0.normalize(); this._r.E0 = E;
    for (let i = 0; i < 3; i++) { this.paletas.setColorAt(i, GUARDADA); this._posar(i); }
    this.paletas.instanceColor.needsUpdate = true;

    // Lo que sigue (jurado lateral, mesa técnica y gente de pie) se arma dos veces: con malla fina (Media en adelante) y liviana
    // (Móvil y Baja: la cuenta de triángulos pesa en el teléfono). look.js elige cuál se ve (LEJOS).
    for (const det of [1, 0]) { const lejos = [];
    // jurado lateral (cinco, mesa larga) y mesa técnica (dos mesas sobre el escenario): de lejos, sin gesto
    const ML = asiento(-8.3, FLOOR_Y, .1, Math.PI / 2), lat = en(mesa(6.2, BASE), ML);
    for (let i = 0; i < 5; i++) lat.push(...en(persona(gente(i + 3, ['#40434d', '#2f4a45', '#5a2f33', '#343a4b', '#4a4436'][i], '#2a2c33'), { det, pelo: ['melena', 'corto', 'cola', 'entradas', 'rapado'][i], corbata: i === 0, k: i + 3, gesto: ['mesa', 'cruzados', 'menton', 'mesa', 'falda'][i], ropa: ['saco', 'buzo', 'remera', 'saco', 'buzo'][i] }), ML.clone().multiply(correr((i - 2) * 1.25 + [0, .08, -.06, .05, -.1][i], -.5))));      // cinco distintos: ropa, pelo y postura
    lejos.push(malla(lat, 'jurado lateral ' + det));
    const tec = [];
    [[5.0, -4.3, -.86], [5.75, -3.3, -1.05]].forEach(([x, z, ry], i) => { const M = asiento(x, STAGE_Y, z, ry); tec.push(...en(mesa(1.1, BASE), M), ...en(persona(gente(i + 8, i ? '#3c2f4a' : '#30384e', '#2a2e38'), { det, pelo: i ? 'cola' : 'entradas', k: i + 8, ropa: i ? 'buzo' : 'saco', gesto: i ? 'menton' : 'mesa' }), M.clone().multiply(correr(0, -.5)))); });
    lejos.push(malla(tec, 'mesa técnica ' + det));
      for (const m of lejos) { m.visible = det === 1; this.fijos.push(m); } LEJOS[det ? 'fino' : 'liviano'] = lejos;
    }
    // cartel iluminado en el frente de la mesa de los árbitros
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 176; const g = cv.getContext('2d'), lg = g.createLinearGradient(0, 0, 0, 176); lg.addColorStop(0, '#1d2740'); lg.addColorStop(1, '#0d1220'); g.fillStyle = lg; g.fillRect(0, 0, 1024, 176);
      g.fillStyle = '#e3b33a'; g.fillRect(0, 0, 1024, 7); g.fillRect(0, 169, 1024, 7); g.fillStyle = '#f2efe6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "800 92px 'Saira Condensed','Arial Narrow',sans-serif"; g.fillText('LIFTING GAME OPEN', 512, 82, 760); g.font = "700 30px 'Saira Condensed','Arial Narrow',sans-serif"; g.fillStyle = '#6ff0e2'; g.fillText('JURY · JURADO', 512, 142);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(A.sep * 2 + .96, .5), new THREE.MeshBasicMaterial({ name: 'cartel de la mesa', map: t, color: new THREE.Color(.62, .62, .62) })); c.applyMatrix4(MA.clone().multiply(new THREE.Matrix4().makeTranslation(0, .36, .312))); c.matrixAutoUpdate = false; this.group.add(c); this.cartel = c;
    }
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
      if (this.luces) { this.luces.setColorAt(i, a.k ? (x ? LUZ_B : LUZ_R) : APAGADA); this.brillos.setColorAt(i, a.k ? (x ? BR_B : BR_R) : NEGRO); this.luces.instanceColor.needsUpdate = this.brillos.instanceColor.needsUpdate = true; }
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
  dispose() { this.group.removeFromParent(); for (const m of [...this.fijos, this.brazos, this.paletas]) m.geometry.dispose(); this.mat.dispose(); this.paletas.material.map?.dispose(); this.paletas.material.dispose(); }
}
