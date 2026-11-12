// Prueba sin navegador de la lógica de fluidez del juego (web/js/game/perf.js y banco.js):
//  1. medición del refresco (cualquier frecuencia, no una lista), meta y refrescos perdidos;
//  2. gobernador: cuándo pide bajar, cuántos pasos, y que se queda quieto si bajar no cambia nada;
//  3. decisión de calidad de antes del primer intento (decidirCalidad) con máquinas simuladas;
//  4. el banco de medición (juego.html?banco=1) entero, contra una escena simulada que se va cargando (deriva) y con ruido:
//     tres vueltas intercaladas, ahorros contra las completas de al lado, programas liberados, ruidosas marcadas, límite
//     de tiempo y un JSON válido.
// NO mide nada real: los costos son inventados. Lo que cuesta la escena en una máquina se mide con el banco en esa máquina.
// Uso: node tools/perf_test.mjs [--sin-banco]
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web'), url = p => pathToFileURL(path.join(WEB, p)).href;
// `three` es el vendorizado de web/vendor, igual que en el navegador (ahí lo resuelve el importmap de juego.html)
register('data:text/javascript,' + encodeURIComponent(`const V = ${JSON.stringify(url('vendor/three/'))};
export async function resolve(s, c, n) { if (s === 'three') return { url: V + 'build/three.module.js', shortCircuit: true }; if (s.startsWith('three/addons/')) return { url: V + 'addons/' + s.slice(13), shortCircuit: true }; return n(s, c); }`));
const { hzDe, pasoDe, metaDe, ajustar, mpSostenible, perdidos, decidirCalidad, Gobernador, Registrador, PRESET, MARGEN, calidadInicial, nombreDe } = await import(url('js/game/perf.js'));

let fallas = 0, hechas = 0;
const ok = (c, m) => { hechas++; if (!c) { fallas++; console.log('FALLA: ' + m); } };

// ---------- 1. pantalla ----------
const iv = (p, n) => Array.from({ length: n }, (_, i) => p + Math.sin(i * 7.3) * .2);
for (const hz of [50, 60, 67, 75, 90, 120, 144, 165]) ok(Math.abs(hzDe(iv(1000 / hz, 40)) - hz) < hz * .006, `refresco de ${hz} Hz medido como ${hzDe(iv(1000 / hz, 40))}`);
ok(Math.abs(hzDe([...iv(1000 / 75, 36), 26.6, 40, 26.7, 13.2]) - 75) < .5, 'refresco de 75 Hz con cuadros perdidos en la muestra');
ok(hzDe([]) === 60, 'sin datos: 60');
ok(pasoDe(75) === 1 && metaDe(75) === 75 && pasoDe(120) === 2 && metaDe(120) === 60 && metaDe(144) === 72, 'meta: el refresco, o la mitad por encima de 90 Hz');
const recta = ajustar({ mp: .5, ms: 6 }, { mp: 1.5, ms: 14 });
ok(Math.abs(recta.fijo - 2) < 1e-9 && Math.abs(recta.porMP - 8) < 1e-9, 'recta de costo');
ok(Math.abs(mpSostenible(recta, 1000 / 75) - (1000 / 75 * MARGEN - 2) / 8) < 1e-9, 'megapíxeles que entran en el margen');
ok(mpSostenible({ fijo: 2, porMP: 0 }, 13) === Infinity && mpSostenible({ fijo: 20, porMP: 0 }, 13) === 0, 'costo que no depende de los píxeles');
ok(perdidos([13.3, 13.3, 26.6, 13.3, 40], 13.33) === 3, 'refrescos perdidos');
ok(PRESET.baja.shadow === 512 && PRESET.baja.directo && PRESET.movil.directo && !PRESET.media.directo && !PRESET.media.mblur && !PRESET.alta.mblur && !calidadInicial('baja').auto && calidadInicial(null).clave === 'baja' && calidadInicial(null, true).clave === 'movil' && nombreDe(PRESET.baja, 1.234) === 'Baja 1,23 MP', 'calidades del juego');

// ---------- 2. gobernador ----------
const corre = (g, seg, f, hilo = 2, t0 = 10000) => { let now = t0, r = false, k = 0; const fin = t0 + seg * 1000; while (now < fin) { const ms = f(k++); now += ms; r = g.cuadro(ms, now, hilo); } return r; };
let g = new Gobernador(75);
ok(Math.abs(g.periodo - 13.333) < .01 && corre(g, 10, () => 13.33) === false, '75 Hz parejo: no pide');
g = new Gobernador(75); ok(corre(g, 6, k => (k === 100 ? 26.67 : 13.33)) === false, 'un solo refresco perdido: no pide');
g = new Gobernador(75); ok(corre(g, 4, k => (k % 40 === 0 ? 26.67 : 13.33)) === true && g.pasos === 1, 'dos refrescos perdidos por segundo en dos ventanas: pide un paso');
g = new Gobernador(75); ok(corre(g, 3, k => (k % 3 === 0 ? 26.67 : 13.33)) === true && g.pasos === 2, 'pierde uno de cada cuatro refrescos: pide dos pasos');
g = new Gobernador(60); ok(corre(g, 3, () => 33.3) === true && g.pasos === 3, 'a mitad de cuadros: pide tres pasos');
g = new Gobernador(60); ok(corre(g, 4, () => 16.67, 16) === true, 'el hilo principal se lleva el 96 % del período: pide');
g = new Gobernador(60); ok(corre(g, 4, () => 16.67, 12) === false, 'el hilo principal al 72 %: no pide');
g = new Gobernador(60); corre(g, 3, () => 13.33); ok(Math.abs(g.hz - 75) < .5, `pantalla de 75 medida como 60: se corrige sola (${g.hz})`);
g = new Gobernador(120); ok(g.paso === 2 && Math.abs(g.periodo - 16.667) < .01 && corre(g, 5, () => 16.67) === false, '120 Hz: uno de cada dos refrescos, parejo');
g = new Gobernador(75); corre(g, 5, () => 13.33); ok(corre(g, .9, () => 400, 2, 20000) === false, 'una pausa no es lentitud');
{ g = new Gobernador(75); let n = 0, now = 10000; for (let i = 0; i < 12; i++) { let r = false, k = 0; const fin = now + 4000; while (now < fin) { const ms = k++ % 4 === 0 ? 26.67 : 13.33; now += ms; r = g.cuadro(ms, now, 2); } if (r) { n++; g.calentar(now, 0); } } ok(n === 2 && g.quieto, `si bajar no cambia lo que se pierde, baja dos veces y se queda quieto (bajó ${n})`); }
const R = new Registrador(); R.periodo = 13.33; R.cuadro(13.3, true); R.cuadro(27, true, 'vuelo'); R.cuadro(300, false);
ok(R.largos.length === 1 && R.largos[0].nota === 'vuelo' && R.resumen().inicio.n === 3, 'el registrador anota el cuadro largo con su fase');

// ---------- 3. decisión de calidad ----------
/** Máquina simulada. costos[calidad] = [fijo, porMP] en ms; `factor`: cuánto más cuesta de verdad que lo que dice la medida. */
async function caso({ hz = 75, nativo = 1.78, costos, clave = 'baja', factor = 1, suelto = false }) {
  const periodo = 1000 / hz, puestas = []; let q = clave, mp = 1, k = 0; const c = m => costos[q][0] + costos[q][1] * m;
  const r = await decidirCalidad({ periodo, clave, techo: () => nativo, medir: m => ({ mp: m, ms: c(m) }), poner: async x => { q = x; puestas.push(x); }, fijar: m => (mp = Math.min(m, nativo)),
    cuadros: async n => Array.from({ length: n }, () => { let d = Math.max(1, Math.ceil(c(mp) * factor / periodo)) * periodo; if (suelto && k++ === 7) d = 2 * periodo; return d; }) });
  return { ...r, puestas: puestas.join('>') };
}
let r = await caso({ costos: { baja: [3, 9], movil: [2.5, 8] } });
ok(r.clave === 'baja' && Math.abs(r.mp - (1000 / 75 * MARGEN - 3) / 9) < .01 && r.verificacion.length === 1, `75 Hz, 3 ms + 9 ms/MP: Baja a ${r.mp.toFixed(2)} MP`);
r = await caso({ hz: 60, costos: { baja: [3, 9] } }); ok(r.clave === 'baja' && Math.abs(r.mp - (1000 / 60 * MARGEN - 3) / 9) < .01, 'la misma máquina a 60 Hz sostiene más píxeles');
r = await caso({ hz: 60, costos: { baja: [1.5, 1], media: [2.5, 2.5], alta: [3, 4] } }); ok(r.clave === 'alta' && Math.abs(r.mp - 1.78) < .01, 'placa fuerte: Alta a la resolución de la pantalla');
r = await caso({ hz: 60, costos: { baja: [1.5, 1], media: [2.5, 2.5], alta: [4, 8] } }); ok(r.clave === 'media' && r.puestas === 'media>alta>media', 'Alta no alcanza: vuelve a Media');
r = await caso({ hz: 60, costos: { baja: [1.5, 2.5], media: [4, 8] } }); ok(r.clave === 'baja' && Math.abs(r.mp - 1.78) < .01 && r.puestas === 'media>baja', 'Media no alcanza: vuelve a Baja');
r = await caso({ hz: 60, costos: { baja: [8, 20], movil: [6, 14] } }); ok(r.clave === 'movil' && r.mp > .3, 'máquina floja: Móvil');
r = await caso({ hz: 60, costos: { baja: [20, 30], movil: [18, 25] } }); ok(r.clave === 'movil' && Math.abs(r.mp - .3) < .01, 'máquina muy floja: Móvil en el piso de resolución');
r = await caso({ costos: { baja: [3, 9] }, factor: 1.3 }); ok(r.mp < .9 && r.verificacion.length === 2 && r.verificacion[1].perdidos === 0, 'la pantalla cuesta más que la cuenta: la verificación baja 15 %');
r = await caso({ costos: { baja: [3, 9] }, suelto: true }); ok(Math.abs(r.mp - .93) < .01 && r.verificacion.length === 2, 'un refresco perdido suelto no baja la resolución');
r = await caso({ hz: 60, nativo: 1.79, costos: { baja: [3, 20] } }); ok(r.clave === 'baja' && r.mp < 1.02 * .97, 'placa lenta simulada (18 ms/MP): queda por debajo de lo que se dibujaba antes');
r = await caso({ hz: 60, nativo: .5, costos: { baja: [3, 9], media: [6, 30] } }); ok(r.clave === 'baja' && Math.abs(r.mp - .5) < .01, 'ventana chica: nunca más píxeles que los de la pantalla');
r = await caso({ hz: 60, nativo: .74, clave: 'movil', costos: { movil: [6, 14] } }); ok(r.clave === 'movil', 'teléfono: se queda en Móvil');

// ---------- 3b. camino directo y arena junta (stage.js), sin placa ----------
{
  const THREE = await import('three'), S = await import(url('js/game/stage.js'));
  ok(THREE.ShaderChunk.tonemapping_pars_fragment.includes('color = AgXToneMapping( color );') && !THREE.ShaderChunk.tonemapping_pars_fragment.includes('vec3 CustomToneMapping( vec3 color ) { return color; }'), 'el tono a medida (AgX y la corrección del pase final) está en el sombreador');
  const gris = v => Math.round(S.tonoJS(new THREE.Color(v, v, v)).r * 255);
  ok(gris(0) === 0 && gris(.1) > 90 && gris(.1) < 140 && gris(1) > gris(.5) && gris(4) > gris(1) && gris(4) <= 255, `el tono en JavaScript es el del pase final (gris 0,1 → ${gris(.1)}, 1 → ${gris(1)}, 4 → ${gris(4)})`);
  ok(/radial-gradient\(ellipse farthest-corner/.test(S.vineta()), 'viñeta como gradiente CSS');
  const g = new THREE.Group(), m1 = new THREE.MeshStandardMaterial(), m2 = new THREE.MeshBasicMaterial({ transparent: true }), fuera = new THREE.Mesh(new THREE.BoxGeometry(), m1);
  for (let i = 0; i < 5; i++) { const o = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), m1); o.position.set(i, i * .5, -i); o.rotation.y = i; g.add(o); }
  const sub = new THREE.Group(); sub.position.set(10, 0, 0); sub.scale.setScalar(2); g.add(sub, fuera); sub.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m1), new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m2), new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m2));
  const esp = new THREE.Mesh(new THREE.BoxGeometry(), m1); esp.scale.x = -1; g.add(esp);
  const caja = new THREE.Box3().setFromObject(g, true), r = S.juntarFijos(g, new Set([fuera])), caja2 = new THREE.Box3().setFromObject(g, true); let n = 0; g.traverse(o => { if (o.isMesh) n++; });
  ok(r.antes === 6 && r.despues === 1 && n === 5 && fuera.parent === g && caja.min.distanceTo(caja2.min) + caja.max.distanceTo(caja2.max) < 1e-6, `la arena fija se junta por material sin moverse (${r.antes} → ${r.despues}; quedan afuera lo transparente, lo espejado y lo excluido)`);
}

// ---------- 4. banco con una escena simulada ----------
if (!process.argv.includes('--sin-banco')) {
  const THREE = await import('three');
  const HZ = 75, P = 1000 / HZ, nodo = () => ({ style: {}, appendChild() {}, remove() {}, querySelector: () => ({}), textContent: '', innerHTML: '' });
  let tabla = null, mp = 1, dibujo = false, ultimo = performance.now(), deriva = 0, llamadas = 0;
  globalThis.document = { createElement: () => (tabla = nodo()), body: { appendChild() {} }, hidden: false };
  globalThis.window = globalThis; globalThis.devicePixelRatio = 1.1; globalThis.innerWidth = 1745; globalThis.innerHeight = 845;
  const luz = () => ({ visible: true, castShadow: false }), L = { key: luz(), key2: luz(), stage: luz(), wash: luz(), rimA: luz(), rimB: luz(), hair: luz(), setQuality() {} };
  const est = { sombras: true, directo: true };
  // Escena simulada: «Baja» directa cuesta 4 ms fijos + 4,5 ms/MP; las sombras son 1,5 ms fijos, los contraluces 1,5 ms/MP,
  // y el camino con post (la variante «post») suma 2 ms fijos y 3 ms/MP. `deriva`: la máquina se va cargando (hasta +30 %).
  const costo = () => (2.5 + (est.sombras ? 1.5 : 0) + (E.Q && E.Q.ao ? 4 : 0) + (est.directo ? 0 : 2) + mp * ((est.directo ? 3 : 6) + (L.rimA.visible ? 1.5 : 0))) * (1 + deriva);
  // Pantalla simulada con reloj propio: un cuadro por período, y un cuadro que cuesta más que el período pierde refrescos.
  globalThis.requestAnimationFrame = cb => { const c = dibujo ? costo() : 0; dibujo = false; ultimo += Math.max(1, Math.ceil(c / P)) * P; const t = ultimo; setImmediate(() => cb(t)); };
  const grupo = new THREE.Group(), hazeTex = new THREE.Texture(), scene = new THREE.Scene(); scene.add(grupo);
  grupo.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()]), new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })), new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: hazeTex })));
  const pelo = new THREE.Mesh(new THREE.BoxGeometry(), Object.assign(new THREE.MeshStandardMaterial(), { name: 'Hair' }));
  const uno = { root: new THREE.Group(), meshes: [pelo], hairDepth: new THREE.Mesh() }, otro = { root: new THREE.Group(), meshes: [] }; uno.root.add(pelo); scene.add(uno.root, otro.root);
  const gl = { getExtension: () => null, getParameter: () => 'simulada', getError: () => 0, TEXTURE_2D: 1, texParameterf() {} };
  // Programas simulados como los de three: por material, un mapa clave → programa; la clave depende del camino, las luces y las sombras.
  const props = new WeakMap(), programas = [], prop = m => { let p = props.get(m); if (!p) props.set(m, p = { programs: new Map(), currentProgram: null }); return p; };
  const clave = () => `${est.directo}|${L.rimA.visible}|${L.key2.visible}|${est.sombras}`;
  const soltar = m => { const p = prop(m); for (const g of p.programs.values()) if (--g.usedTimes <= 0) { programas.splice(programas.indexOf(g), 1); g.destroy(); } p.programs.clear(); };      // como three al descartar un material
  const usarProg = m => { const p = prop(m), k = clave(); if (!p.programs.size) m.addEventListener('dispose', () => soltar(m)); let g = p.programs.get(k); if (!g) { g = { usedTimes: 1, destroy() { this.muerto = true; } }; programas.push(g); p.programs.set(k, g); } if (g.muerto) throw new Error('programa liberado en uso'); p.currentProgram = g; };
  const recorrer = f => scene.traverseVisible(o => { for (const m of [].concat(o.material || [])) f(m); });
  const final0 = new THREE.ShaderMaterial();
  const E = {
    Q: null, canvas: { clientWidth: 1745, clientHeight: 845 }, vertical: false, lodFijo: null, directo: true, sombra: 0, scene, lighting: L, barbell: { group: new THREE.Group() }, rig: { camera: new THREE.PerspectiveCamera() }, atletas: { uno, otro }, activo: null, fijos: { antes: 60, despues: 20 },
    arena: { group: grupo, hazeTex, impostors: new THREE.Group(), crowd: new THREE.Group(), beamMeshes: [new THREE.Mesh()], bokeh: new THREE.Group(), flashMesh: new THREE.Group() },
    post: { sceneRT: {}, finalMat: final0 },
    renderer: { getContext: () => gl, info: { autoReset: true, reset() {}, render: { calls: 140, triangles: 200000 }, programs: programas }, setRenderTarget() {}, compileAsync: async () => { recorrer(usarProg); if (!est.directo) usarProg(final0); }, extensions: { get: () => ({ TEXTURE_MAX_ANISOTROPY_EXT: 2 }) }, properties: { get: prop }, state: { bindTexture() {} }, capabilities: { getMaxAnisotropy: () => 16 } },
    async mostrar() { this.activo = uno; }, setCarga() {}, camara() {}, bucle() {}, _sombras() {}, async precalentar() { const s = est.sombras; for (const x of [true, false]) { est.sombras = x; recorrer(usarProg); } est.sombras = s; },
    cuadro() { dibujo = true; est.directo = this.directo; recorrer(usarProg); if (!this.directo) usarProg(final0); }, setTope(px) { mp = px / 1e6; }, get megapixeles() { return mp; }, setSombras(on) { est.sombras = on; }, setCalidad(Q) { this.Q = Q; this.directo = !!Q.directo; est.directo = this.directo; }, setDirecto(on) { this.directo = !!on; est.directo = this.directo; },
    costo({ n }) { this.cuadro(); dibujo = false; if (derivando) deriva = Math.min(.3, ++llamadas / 300 * .3); const c = costo(); return { ms: c, min: c * .97, p90: c * 1.1, n }; },
  };
  const registro = console.log; console.log = () => {};      // el banco imprime su JSON entero
  const { correrBanco } = await import(url('js/game/banco.js')), t0 = performance.now(); let derivando = false;
  // la deriva crece con las medidas hechas: hasta +30 % hacia el final de la corrida
  derivando = true; await correrBanco({ escena: E, cargas: [Promise.resolve()], hz: 60, params: new URLSearchParams('limite=45'), msg: { hidden: false } });
  derivando = false; deriva = 0; console.log = registro;
  const B = globalThis.BANCO, seg = (performance.now() - t0) / 1000, de = id => B.variantes.find(v => v.id === id) || B.calidades.find(v => v.id === id) || {};
  ok(B.listo && !B.errores.length, 'el banco simulado termina sin errores: ' + B.errores.join(' | '));
  ok(Math.abs(B.hz - 75) < 1 && B.hzAlCargar === 60, `el banco mide su propia pantalla (${B.hz} Hz)`);
  ok(B.calidades.length === 4 && B.calidades.every(c => c.vueltas >= 3) && B.variantes.length >= 15 && B.variantes.every(v => v.vueltas >= 3), `cuatro calidades y todas las variantes, con tres vueltas o más (${B.calidades.map(c => c.vueltas).join(',')} · ${B.variantes.map(v => v.vueltas).join(',')})`);
  const b = de('baja'), cerca = (x, y, t) => Math.abs(x - y) <= t;
  ok(cerca(b.fijoMs, 4 * 1.15, 4 * .2) && cerca(b.porMPms, 4.5 * 1.15, 4.5 * .2), `recupera el costo fijo y por megapíxel de la escena simulada con deriva (${b.fijoMs} + ${b.porMPms}/MP; sin deriva 4 + 4,5)`);
  ok(b.mpReal > .5 && b.mpFalla > b.mpReal, `la búsqueda con cuadros encierra el límite real (${b.mpReal} a ${b.mpFalla} MP)`);
  // el ahorro contra las completas de alrededor no se lo come la deriva: tolerancia del 10 % + lo que cambia la deriva entre dos medidas
  const s = de('baja-sombras'), c = de('baja-contraluces'), p = de('baja-post');
  ok(cerca(s.ahorroMs, 1.5 * 1.15, .35) && cerca(s.ahorroFijoMs, 1.5 * 1.15, .35) && cerca(c.ahorroPorMPms, 1.5 * 1.15, .35) && cerca(p.ahorroMs, -5 * 1.15, 1), `el ahorro sale separado en fijo y por megapíxel, con deriva (sombras ${s.ahorroMs}, contraluces ${c.ahorroPorMPms}/MP, post ${p.ahorroMs})`);
  ok(!s.ruidosa && Number.isFinite(s.ahorroMin) && s.ahorroMin <= s.ahorroMs && s.ahorroMax >= s.ahorroMs && typeof s.dispersion === 'number', 'informa mediana, rango y dispersión, y la medida limpia no es ruidosa');
  ok(B.variantes.every(v => v.programasSobrantes === 0) && B.programasAlTerminar === B.programasAlEmpezar, `lo que compila cada variante se libera al deshacerla (programas ${B.programasAlEmpezar} → ${B.programasAlTerminar}; sobrantes: ${B.variantes.filter(v => v.programasSobrantes).map(v => v.id + ' ' + v.programasSobrantes).join(', ') || 'ninguno'})`);
  ok(B.deriva && B.deriva.cambioPct > 5, `anota la deriva de la escena completa (${B.deriva && B.deriva.cambioPct} %)`);
  ok(seg < 45, `termina dentro del límite pedido (45 s; con la pantalla simulada tardó ${seg.toFixed(1)} s)`);
  ok(L.rimA.visible && L.key2.visible && E.directo && E.Q.directo && E.lodFijo === null && uno.root.visible && pelo.visible && otro.root.parent === scene && grupo.children[0].material[0].isMeshStandardMaterial && est.sombras, 'cada variante se deshace: la escena queda como estaba');
  ok(JSON.stringify(B).length > 2000 && !!tabla && tabla.innerHTML.includes('Banco de medición'), 'deja el JSON y la tabla');
  // con ruido: una medida de cada tanto sale el doble de cara; las afectadas se marcan ruidosas
  { let k = 0; const c0 = E.costo; E.costo = function (o) { const r = c0.call(this, o); return ++k % 7 === 0 ? { ...r, ms: r.ms * 2 } : r; };
    console.log = () => {}; await correrBanco({ escena: E, cargas: [Promise.resolve()], hz: 60, params: new URLSearchParams('limite=200&solo=baja&variantes=sombras,pelo,aniso'), msg: { hidden: false } }); console.log = registro; E.costo = c0;
    const R = globalThis.BANCO; ok(R.listo && R.variantes.some(v => v.ruidosa), `con ruido, marca ruidosas (${R.variantes.map(v => `${v.quita} ${v.ruidosa ? 'ruidosa' : 'limpia'}`).join(', ')})`); }
  // sin tiempo (el límite se cuenta desde que arrancó el proceso): mide menos, lo dice en una nota y termina igual
  console.log = () => {}; await correrBanco({ escena: E, cargas: [Promise.resolve()], hz: 60, params: new URLSearchParams('limite=10'), msg: { hidden: false } }); console.log = registro;
  const C = globalThis.BANCO; ok(C.listo && !C.errores.length && C.notas.some(x => x.includes('faltó tiempo') || x.includes('Sin tiempo')), `sin tiempo: corta, lo anota y termina (${C.notas[0] || ''})`);
}
console.log(fallas ? `\n${fallas} de ${hechas} comprobaciones fallaron` : `OK: ${hechas} comprobaciones de la lógica de fluidez${process.argv.includes('--sin-banco') ? ' (sin el banco simulado)' : ' y del banco simulado'}`);
process.exit(fallas ? 1 : 0);
