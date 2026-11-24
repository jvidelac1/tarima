// Prueba sin navegador de las poses de referencia T y A (web/js/pose_ref.js; docs/GRAFICOS_PLAN.md, G1) sobre el esqueleto
// de cada GLB de web/models: brazos en su ángulo, piernas verticales, simetría y pies a la altura del reposo.
// Uso: node tools/pose_ref_test.mjs [--tabla]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url)), WEB = join(AQUI, '..', 'web');
const T3 = await import(pathToFileURL(join(WEB, 'vendor/three/build/three.module.js')).href);
const { poseReferencia, medirReferencia, REF } = await import(pathToFileURL(join(WEB, 'js/pose_ref.js')).href);

/** Esqueleto de un GLB armado a mano desde su JSON (sin GLTFLoader: no hace falta la malla). */
export function esqueleto(ruta) {
  const b = readFileSync(ruta), n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
  const objs = json.nodes.map(d => { const o = new T3.Object3D(); o.name = d.name || ''; if (d.translation) o.position.fromArray(d.translation); if (d.rotation) o.quaternion.fromArray(d.rotation); if (d.scale) o.scale.fromArray(d.scale); if (d.matrix) { o.matrix.fromArray(d.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); } return o; });
  json.nodes.forEach((d, i) => (d.children || []).forEach(c => objs[i].add(objs[c])));
  const raiz = new T3.Object3D(); for (const i of json.scenes[json.scene || 0].nodes) raiz.add(objs[i]);
  const huesos = new Set(json.skins.flatMap(s => s.joints)), H = new Map(), reposo = [];
  for (const i of huesos) { const o = objs[i]; H.set(o.name.replace(/^mixamorig:?/, ''), o); reposo.push([o, o.quaternion.clone(), o.position.clone()]); }
  raiz.updateMatrixWorld(true);
  return { raiz, H, reposo };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mal = [], ok = (c, txt) => { if (!c) mal.push(txt); }, filas = [];
  const ids = readdirSync(join(WEB, 'models')).filter(f => f.endsWith('_1024.glb')).map(f => f.replace('_1024.glb', '')).sort();
  for (const id of ids) {
    const { raiz, H, reposo } = esqueleto(join(WEB, 'models', id + '_1024.glb'));
    const r0 = medirReferencia(T3, H, raiz);      // el reposo del GLB, como vino
    filas.push(`${id.padEnd(9)} reposo  brazo ${r0.izq.brazo.toFixed(1).padStart(5)}° / ${r0.der.brazo.toFixed(1).padStart(5)}°  codo ${r0.izq.codo.toFixed(1).padStart(4)}°  pierna ${r0.izq.pierna.toFixed(1).padStart(4)}°  envergadura ${r0.envergadura.toFixed(3)} m`);
    for (const tipo of Object.keys(REF)) {
      poseReferencia(T3, H, reposo, raiz, tipo); const m = medirReferencia(T3, H, raiz), e = `${id} ${tipo}: `;
      for (const [k, s] of [['izq', m.izq], ['der', m.der]]) {
        ok(Math.abs(s.brazo - REF[tipo].brazo) < 2, `${e}brazo ${k} a ${s.brazo.toFixed(1)}° (va a ${REF[tipo].brazo}°)`);
        ok(Math.abs(s.adelante) < 2, `${e}brazo ${k} ${s.adelante.toFixed(1)}° fuera del plano del frente`);
        ok(s.codo < 2, `${e}codo ${k} doblado ${s.codo.toFixed(1)}°`);
        ok(s.pierna < 2, `${e}pierna ${k} a ${s.pierna.toFixed(1)}° de la vertical`);
      }
      ok(m.asimetria < .01, `${e}asimetría de ${(m.asimetria * 1000).toFixed(1)} mm`);
      ok(Math.abs(m.pies - r0.pies) < .001, `${e}los pies quedaron a ${((m.pies - r0.pies) * 1000).toFixed(1)} mm del piso`);
      ok(m.cabeza > r0.cabeza - .03, `${e}la cabeza bajó ${((r0.cabeza - m.cabeza) * 100).toFixed(1)} cm`);
      // repetir da lo mismo (la pose no depende de la anterior)
      poseReferencia(T3, H, reposo, raiz, tipo === 'T' ? 'A' : 'T'); poseReferencia(T3, H, reposo, raiz, tipo); const m2 = medirReferencia(T3, H, raiz);
      ok(Math.abs(m2.envergadura - m.envergadura) < 1e-6 && Math.abs(m2.izq.brazo - m.izq.brazo) < 1e-4, `${e}no da lo mismo al repetir`);
      // palmas hacia abajo: la normal de la palma (índice × meñique por el lado) mira hacia abajo
      for (const [L, sx] of [['Left', 1], ['Right', -1]]) {
        const P = n => H.get(n).getWorldPosition(new T3.Vector3()), h = P(L + 'Hand'), nrm = P(L + 'HandIndex1').sub(h).cross(P(L + 'HandPinky1').sub(h)).multiplyScalar(sx).normalize();
        ok(nrm.y < -Math.cos((REF[tipo].brazo + 12) * Math.PI / 180) + .05, `${e}la palma ${L} no mira hacia abajo (normal y = ${nrm.y.toFixed(2)})`);
      }
      filas.push(`${id.padEnd(9)} ${tipo.padEnd(6)}  brazo ${m.izq.brazo.toFixed(1).padStart(5)}° / ${m.der.brazo.toFixed(1).padStart(5)}°  codo ${m.izq.codo.toFixed(1).padStart(4)}°  pierna ${m.izq.pierna.toFixed(1).padStart(4)}°  envergadura ${m.envergadura.toFixed(3)} m  asimetría ${(m.asimetria * 1000).toFixed(1)} mm`);
    }
  }
  if (process.argv.includes('--tabla') || mal.length) console.log(filas.join('\n'));
  if (mal.length) { console.error('\nFALLÓ pose_ref_test:\n  ' + mal.join('\n  ')); process.exit(1); }
  console.log(`OK pose_ref_test: ${ids.length} pesistas en T y en A`);
}
