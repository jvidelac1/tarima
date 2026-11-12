// Banco de medición de fluidez: `juego.html?banco=1`. Corre solo, sin tocar nada, y dice qué cuesta cada cosa de la escena
// en ESTA máquina, aunque la máquina esté ocupada con otras cosas. Escena fija: un pesista haciendo el arranque en bucle
// con la cámara del juego.
//
// Una «medida» es el costo de un cuadro sin esperar a la pantalla (escena.costo: posa, dibuja y espera a la placa) a dos
// resoluciones; de esa recta salen el costo fijo, el costo por megapíxel y el costo a 1 MP.
// Para que el ruido de la máquina no se confunda con lo que cuesta cada cosa:
// - Las variantes se intercalan con la escena completa (A, B, A, C, A…) y cada variante se compara con el promedio de las
//   dos medidas de la escena completa que la rodean, no con una medida de hace un minuto.
// - Todo se mide en vueltas: cada vuelta recorre todas las variantes una vez. Con al menos tres vueltas se informa la
//   mediana y el rango (mínimo y máximo); si se acaba el tiempo, cada variante tiene las mismas vueltas que las demás.
// - Lo que una variante compiló se libera al deshacerla: «programas» vuelve al valor del principio (se informa si no).
// - Una medida con mucha dispersión se marca «ruidosa»: ese número no sirve para decidir nada.
// Al final, con cuadros de verdad (requestAnimationFrame, con la pantalla), una búsqueda sobre la resolución dice cuántos
// megapíxeles sostiene la escena completa sin perder ningún refresco.
// Al terminar muestra una tabla y deja todo en `window.BANCO` (JSON, con `listo: true`). Termina antes de los 115 s contados
// desde que se abrió la página (`?limite=segundos` lo cambia). Otros parámetros: `?pesista=ventura|brenner`,
// `?solo=baja,media` (calidades), `?variantes=sombras,luces` (solo esas), `?vueltas=3`, `?mp=0.5,1.5` y `?n=10` (resoluciones
// y cuadros de cada medida; tools/banco.mjs los achica con dibujo por software, donde un cuadro tarda segundos).
// Cómo leer las columnas: HANDOFF.md, «Banco de medición».
import * as THREE from 'three';
import { PRESET, MARGEN, ajustar, mpSostenible, perdidos, medirRefresco, metaDe, pasoDe } from './perf.js';
import { PLANTEL } from './roster.js';

/** Píxeles por metro con que el banco fija el detalle del pesista: malla simplificada y normales de detalle, como en el plano general del juego. */
const LOD_PLANO = 300;
/** Megapíxeles de cada medida sin pantalla (`?mp=0.06,0.18` los cambia: dibujo por software). */
let MP_A = [.5, 1.5];
/** Cuadros por resolución en cada medida (más los que se descartan). `?n=4` lo cambia. */
let N = 10;
const CALIENTA = 2;
/** Límites de la búsqueda con cuadros de verdad. */
const MP_MIN = .15, MP_MAX = 4.5;
/** Dispersión (rango sobre mediana) desde la que una medida se marca ruidosa. */
const RUIDO = .15;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const unCuadro = () => Promise.race([new Promise(r => requestAnimationFrame(r)), dormir(120)]);      // con la pestaña oculta no hay cuadros: no se espera para siempre
const num = (x, d = 3) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const rango = a => { const s = a.filter(Number.isFinite); return s.length ? [Math.min(...s), Math.max(...s)] : [null, null]; };
export const COLUMNAS = {
  nombre: 'Qué se midió. «completa» es la escena del juego en esa calidad; las demás son «Baja» con una sola cosa menos (o distinta).',
  vueltas: 'Cuántas veces se midió (una por vuelta). Los números son la mediana de esas medidas.',
  fijoMs: 'Costo del cuadro que no depende de la resolución (ms): geometría, esqueletos, pasada de sombra, llamadas de dibujo.',
  porMPms: 'Costo por cada megapíxel dibujado (ms/MP): sombreado de materiales y luces, MSAA y pases de pantalla.',
  ms1MP: 'Costo de un cuadro a 1 megapíxel (fijo + porMP), en ms. Es procesador más placa en serie: en el juego corren en paralelo y el número real es algo menor.',
  ms1MPmin: 'La menor de las medidas de ms1MP (la que menos ruido de la máquina tuvo).',
  ms1MPmax: 'La mayor de las medidas de ms1MP.',
  dispersion: 'Rango de ms1MP (máximo menos mínimo) sobre la mediana. Desde 0,15 la medida se marca ruidosa.',
  msNativo: 'Costo a la resolución de la pantalla (los megapíxeles de «nativoMP»).',
  mpModelo: 'Megapíxeles que entran en el 85 % del período de la pantalla según la recta. Es una cuenta, no una medición con pantalla.',
  vsBajaMs: 'Solo en las calidades: costo a 1 MP menos el de «Baja completa» medida justo antes, mediana de las vueltas (ms).',
  ahorroMs: 'Cuánto baja el costo a 1 MP respecto de la escena completa medida antes y después en la misma vuelta (ms), mediana de las vueltas. Negativo: esa variante cuesta más.',
  ahorroMin: 'El menor de los ahorros de las vueltas.',
  ahorroMax: 'El mayor de los ahorros de las vueltas.',
  ahorroPct: 'El ahorro en porcentaje del costo de la escena completa a 1 MP.',
  ahorroFijoMs: 'Parte del ahorro que es costo fijo (ms).',
  ahorroPorMPms: 'Parte del ahorro que es costo por megapíxel (ms/MP).',
  ruidosa: 'La medida no sirve para decidir. Variantes: las dos completas de alrededor difieren en 15 % o más, el rango de los ahorros de las vueltas es 15 % o más del costo de la completa, o los ahorros cambian de signo con una mediana chica frente al rango. «Baja completa»: su dispersión es de 0,15 o más (la máquina cambió de carga; las comparaciones siguen valiendo). Otras calidades: el rango de su diferencia con Baja es 15 % o más del costo de Baja.',
  mpReal: 'Búsqueda con cuadros de verdad: la mayor resolución (MP) probada que no perdió ningún refresco en unos 50 cuadros seguidos. Vacío: no se buscó o ninguna sonda salió limpia.',
  mpFalla: 'La menor resolución (MP) probada que sí perdió refrescos. El límite real está entre mpReal y mpFalla.',
  sondas: 'Cada prueba de la búsqueda: megapíxeles, cuadros medidos, refrescos perdidos, mediana, percentil 99 y máximo del intervalo entre cuadros, y ms de hilo principal.',
  llamadas: 'Llamadas de dibujo de un cuadro (incluye la pasada de sombra).',
  triangulos: 'Triángulos de un cuadro (incluye la pasada de sombra).',
  mallasEsqueleto: 'Mallas con esqueleto que de verdad se dibujan.',
  programas: 'Programas de sombreado compilados mientras se medía la variante.',
  programasSobrantes: 'Programas que quedaron compilados después de deshacer la variante y liberar lo suyo. Tiene que ser 0.',
  errorGL: 'Si aparece: WebGL dio un error mientras se medía esa variante (código en hexadecimal). Ese número no vale.',
};

/** Punto de entrada (main.js). `cargas`: promesas de los modelos. `hz`: refresco medido al cargar. */
export async function correrBanco({ escena, cargas, hz, params, msg }) {
  const B = window.BANCO = { listo: false, version: 2, etapa: 'carga', progreso: '', columnas: COLUMNAS, calidades: [], variantes: [], notas: [], errores: [] };
  const cartel = document.createElement('div'); cartel.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:40;background:rgba(3,5,12,.82);color:#e8ecf8;font:12px/1.3 ui-monospace,Menlo,monospace;padding:6px 10px;pointer-events:none'; document.body.appendChild(cartel);
  const decir = txt => { B.progreso = txt; cartel.textContent = 'Banco de medición · ' + txt; };
  try { await correr(B, { escena, cargas, hz, params, msg, decir }); } catch (e) { B.errores.push(String(e.stack || e)); console.error(e); }
  B.duracionS = num(performance.now() / 1000, 1); B.etapa = 'listo'; cartel.remove();
  try { tabla(B); } catch (e) { B.errores.push('tabla: ' + String(e.stack || e)); console.error(e); }
  B.listo = true;
  try { console.log('BANCO ' + JSON.stringify(B)); } catch { /* sin consola */ }
}

async function correr(B, { escena, cargas, hz: hzCarga, params, msg, decir }) {
  const LIMITE = Math.max(10, Math.min(600, +params.get('limite') || 115)) * 1000, queda = ms => performance.now() + ms < LIMITE;
  const lista = k => (params.get(k) || '').split(',').map(x => x.trim()).filter(Boolean), SOLO = lista('solo'), CUALES = lista('variantes'), VUELTAS = Math.max(1, Math.min(9, +params.get('vueltas') || 3));
  { const m = lista('mp').map(Number).filter(x => x > .01 && x < 10); MP_A = m.length === 2 && m[1] > m[0] ? m : [.5, 1.5]; N = Math.max(3, Math.min(30, +params.get('n') || 10)); }
  decir('cargando los modelos'); await Promise.all(cargas);
  const id = PLANTEL[params.get('pesista')] ? params.get('pesista') : 'brenner';
  await escena.mostrar(id); escena.setCarga(140, 's'); escena.lodFijo = LOD_PLANO; msg.hidden = true;
  const camara = escena.vertical ? 'lado' : '3/4'; escena.camara(camara);
  const r = escena.renderer, gl = r.getContext(), A = escena.arena, L = escena.lighting, canvas = escena.canvas;
  decir('midiendo la pantalla');
  const hz = await medirRefresco(45, null) || hzCarga || 60, paso = pasoDe(hz), periodo = 1000 / metaDe(hz), DT = periodo / 1000, T0 = 1.3;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'), dpr = window.devicePixelRatio || 1, nativoMP = canvas.clientWidth * canvas.clientHeight * dpr * dpr / 1e6;
  Object.assign(B, { fecha: new Date().toISOString(), navegador: navigator.userAgent, gl: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', ventana: [window.innerWidth, window.innerHeight], lienzo: [canvas.clientWidth, canvas.clientHeight],
    dpr: num(dpr, 2), nativoMP: num(nativoMP), hz, hzAlCargar: hzCarga, paso, periodoMs: num(periodo, 2), margen: MARGEN, limiteS: LIMITE / 1000, vueltasPedidas: VUELTAS, pesista: id, camara, lodPxPorMetro: LOD_PLANO, mpMedidas: MP_A, mallasFijas: escena.fijos || null });
  if (paso > 1) B.notas.push(`Pantalla de ${hz} Hz: el juego dibuja uno de cada ${paso} refrescos, y el banco mide contra ese período (${num(periodo, 2)} ms).`);
  if (document.hidden) B.notas.push('La pestaña estaba oculta al empezar: las búsquedas con cuadros de verdad no valen.');

  // ---------- herramientas ----------
  const ponerMP = mp => { escena.setTope(mp * 1e6, true); return escena.megapixeles; };
  const progs = () => (r.info.programs ? r.info.programs.length : 0);
  /** Vacía la cola de errores de WebGL y devuelve el último como texto (null si no había). */
  const errorGL = () => { let e, ult = 0, k = 0; while ((e = gl.getError()) && k++ < 16) ult = e; return ult ? '0x' + ult.toString(16) : null; };
  /** Una medida: costo a cada resolución de MP_A y la recta. `dur.medida`: cuánto tardó la última (para repartir el tiempo). */
  const dur = { medida: 700 };
  const medida = () => {
    const t0 = performance.now();
    const m = MP_A.map(mp => { const real = ponerMP(mp), c = escena.costo({ n: N, calienta: CALIENTA, tope: 700, t0: T0, dt: DT }); return { mp: real, ms: c.ms, min: c.min }; }), mod = ajustar(m[0], m[1]);
    dur.medida = performance.now() - t0;
    return { fijo: mod.fijo, porMP: mod.porMP, ms1MP: mod.fijo + mod.porMP, puntos: m.map(x => ({ mp: num(x.mp), ms: num(x.ms, 2), min: num(x.min, 2) })), t: Math.round(performance.now()) };
  };
  /** Compila en paralelo lo que hay en escena con las luces y el destino de este momento, y dibuja un cuadro (primer uso). */
  const compilar = async () => {
    let p; r.setRenderTarget(escena.directo ? null : escena.post.sceneRT);
    try { p = r.compileAsync(escena.scene, escena.rig.camera); } finally { r.setRenderTarget(null); }
    await Promise.race([p, dormir(8000)]);
  };
  const usar = () => { ponerMP(MP_A[0]); escena.costo({ n: 1, calienta: 1, tope: 400, t0: T0, dt: DT }); };
  const contar = () => {
    const inf = r.info, auto = inf.autoReset; inf.autoReset = false; inf.reset(); escena.bucle(T0, 0); escena.sombra = 3; escena.cuadro(0, true);
    const o = { llamadas: inf.render.calls, triangulos: inf.render.triangles, mallasEsqueleto: 0, programas: progs() }; inf.autoReset = auto;
    escena.scene.traverseVisible(x => { if (x.isSkinnedMesh) o.mallasEsqueleto++; }); return o;
  };
  // Programas: lo que una variante compiló se libera al deshacerla. Three guarda por material un mapa clave → programa y no
  // suelta los que dejó de usar; acá se sueltan los que no estaban en la foto de antes, después de un cuadro con la escena
  // ya restituida. Si el que se suelta es el que el material tenía puesto (un pase de post que ya no se dibuja), el material
  // queda marcado para elegir programa de nuevo la próxima vez que se use.
  const materiales = () => {
    const s = new Set(); escena.scene.traverse(o => { for (const m of [].concat(o.material || [])) s.add(m); });
    const P = escena.post; for (const m of [P.finalMat, P.mixMat, P.dofPre, P.dofBlur, P.aoBlur, P.aoMat]) if (m) s.add(m);
    return s;
  };
  const foto = () => { const f = new Map(); for (const m of materiales()) { const mp = r.properties.get(m).programs; f.set(m, new Set(mp ? mp.values() : [])); } return f; };
  const liberar = f => {
    const todos = r.info.programs; if (!todos) return 0; let n = 0;
    for (const m of materiales()) {
      const pr = r.properties.get(m), mapa = pr.programs; if (!mapa) continue; const antes = f.get(m) || new Set();
      for (const [k, p] of [...mapa]) {
        if (antes.has(p)) continue;
        mapa.delete(k); p.usedTimes--; if (p === pr.currentProgram) m.needsUpdate = true;
        if (p.usedTimes <= 0) { const i = todos.indexOf(p); if (i >= 0) todos.splice(i, 1); p.destroy(); n++; }
      }
    }
    return n;
  };
  const ocultar = objs => { const o = objs.filter(Boolean), antes = o.map(x => x.visible); o.forEach(x => { x.visible = false; }); return () => o.forEach((x, i) => { x.visible = antes[i]; }); };

  // ---------- variantes sobre «Baja» ----------
  const velos = []; A.group.traverse(o => { if (o.isMesh && o.material && o.material.map === A.hazeTex) velos.push(o); });
  /** Tarima, alfombra y arena con un material difuso simple en vez del físico. Los materiales nuevos se descartan al deshacer. */
  const baratos = () => {
    const hechos = [], nuevos = new Map();
    A.group.traverse(o => {
      if (!o.isMesh) return; const ls = [].concat(o.material); if (!ls.some(m => m.isMeshStandardMaterial)) return;
      const nueva = ls.map(m => { if (!m.isMeshStandardMaterial) return m; let x = nuevos.get(m); if (!x) { x = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, normalMap: m.normalMap, side: m.side }); if (m.normalMap) x.normalScale.copy(m.normalScale); nuevos.set(m, x); } return x; });
      hechos.push([o, o.material]); o.material = Array.isArray(o.material) ? nueva : nueva[0];
    });
    return () => { hechos.forEach(([o, m]) => { o.material = m; }); for (const x of nuevos.values()) x.dispose(); };
  };
  /** Anisotropía de todas las texturas de la escena, cambiada en la placa sin volver a subir ninguna imagen. */
  const anisotropia = valor => {
    const ext = r.extensions.get('EXT_texture_filter_anisotropic'); if (!ext) return () => {};
    const tex = new Set(), mirar = bolsa => { for (const k in bolsa) { const t = bolsa[k] && bolsa[k].isTexture ? bolsa[k] : bolsa[k] && bolsa[k].value && bolsa[k].value.isTexture ? bolsa[k].value : null; if (t) tex.add(t); } };
    escena.scene.traverse(o => { for (const m of [].concat(o.material || [])) { mirar(m); mirar(m.uniforms || {}); mirar((m.userData && m.userData.skin) || {}); } });
    const poner = v => { for (const t of tex) { if (t.isCubeTexture || t.isDepthTexture || t.isDataArrayTexture || t.isData3DTexture || !(t.anisotropy > 1)) continue; const g = r.properties.get(t).__webglTexture; if (!g) continue; r.state.bindTexture(gl.TEXTURE_2D, g); gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, v === null ? Math.min(t.anisotropy, r.capabilities.getMaxAnisotropy()) : v); } };
    poner(valor); return () => poner(null);
  };
  const pelo = () => { const a = escena.activo; return ocultar([...a.meshes.filter(m => [].concat(m.material).some(x => x.name === 'Hair')), a.hairDepth]); };
  const sombraDe = n => () => { L.setQuality({ ...escena.Q, shadow: n }); escena._sombras(); escena.sombra = 4; return () => { L.setQuality(escena.Q); escena._sombras(); escena.sombra = 4; }; };
  const MENOS = [
    { id: 'sombras', nombre: 'sin sombras', poner: () => { escena.setSombras(false); return () => escena.setSombras(true); } },
    { id: 'sombra1024', nombre: 'sombra en un mapa de 1024 (más cara)', poner: sombraDe(1024) },
    { id: 'publico', nombre: 'sin público', poner: () => ocultar([A.impostors, A.crowd]) },
    { id: 'haces', nombre: 'sin haces de luz', poner: () => ocultar(A.beamMeshes) },
    { id: 'velos', nombre: 'sin bruma, puntos de luz ni flashes', poner: () => ocultar([...velos, A.bokeh, A.flashMesh]) },
    { id: 'contraluces', nombre: 'sin los tres contraluces', compila: true, poner: () => ocultar([L.rimA, L.rimB, L.hair]) },
    { id: 'luces', nombre: 'solo la clave y la luz de sala (seis luces menos)', compila: true, poner: () => ocultar([L.key2, L.stage, L.wash, L.rimA, L.rimB, L.hair]) },
    { id: 'post', nombre: 'con destino HDR, MSAA 4 y pase final (la Baja de antes)', compila: true, poner: () => { escena.setDirecto(false); return () => escena.setDirecto(true); } },
    { id: 'arena', nombre: 'sin arena (solo pesista y barra)', poner: () => ocultar([A.group]) },
    { id: 'segundo', nombre: 'sin el segundo modelo en la escena (ya está oculto)', poner: () => { const otros = Object.values(escena.atletas).filter(a => a !== escena.activo); otros.forEach(a => escena.scene.remove(a.root)); return () => otros.forEach(a => escena.scene.add(a.root)); } },
    { id: 'pesista', nombre: 'sin pesista', poner: () => ocultar([escena.activo.root]) },
    { id: 'lod', nombre: 'pesista con la malla completa (sin nivel de detalle)', poner: () => { escena.lodFijo = 9999; return () => { escena.lodFijo = LOD_PLANO; }; } },
    { id: 'detalle', nombre: 'sin normales de detalle en piel y tela', poner: () => { escena.lodFijo = 150; return () => { escena.lodFijo = LOD_PLANO; }; } },
    { id: 'pelo', nombre: 'sin pelo', poner: pelo },
    { id: 'barra', nombre: 'sin barra ni discos', poner: () => ocultar([escena.barbell.group]) },
    { id: 'piso', nombre: 'tarima, alfombra y arena con material difuso simple', compila: true, poner: baratos },
    { id: 'aniso', nombre: 'anisotropía 1 en todas las texturas', poner: () => anisotropia(1) },
  ].filter(d => !CUALES.length || CUALES.includes(d.id));

  /** Una medida de la variante `def` (armada, medida y deshecha, con lo compilado liberado). Devuelve la medida o null. */
  const medirVariante = async (def, v) => {
    let deshacer = null; const f = foto(), p0 = progs(), previo = errorGL(); if (previo) B.errores.push(`antes de ${v.id}: error de WebGL ${previo}`);
    let m = null;
    try {
      deshacer = def.poner ? def.poner() : null;
      if (def.compila) await compilar(); usar();
      if (v.llamadas === undefined) Object.assign(v, contar());
      m = medida();
      const eg = errorGL(); if (eg) { v.errorGL = eg; B.errores.push(`${v.id}: error de WebGL ${eg}`); }
    } catch (e) { v.error = String(e.stack || e); B.errores.push(`${v.id}: ${e}`); console.error(e); }
    finally {
      try { if (deshacer) deshacer(); usar(); liberar(f); } catch (e) { B.errores.push(`${v.id} (deshacer): ${e}`); }
      const sobra = progs() - p0; v.programasSobrantes = Math.max(v.programasSobrantes || 0, sobra);
    }
    return m;
  };
  /** Resumen de una lista de medidas. */
  const resumir = ms => {
    const x = k => ms.map(m => m[k]), [lo, hi] = rango(x('ms1MP')), c = med(x('ms1MP')), mod = { fijo: med(x('fijo')), porMP: med(x('porMP')) };
    return { vueltas: ms.length, fijoMs: num(mod.fijo, 2), porMPms: num(mod.porMP, 2), ms1MP: num(c, 2), ms1MPmin: num(lo, 2), ms1MPmax: num(hi, 2), dispersion: c ? num((hi - lo) / c, 3) : null,
      msNativo: num(mod.fijo + mod.porMP * nativoMP, 2), mpModelo: num(mpSostenible(mod, periodo)), mpModelo100: num(mpSostenible(mod, periodo, 1)), medidas: ms };
  };
  const ruido = (...ds) => ds.some(d => d !== null && d >= RUIDO);

  /** (B) Una sonda con cuadros de verdad a `mp` megapíxeles: descarta 10 cuadros y mide hasta 50 (o 1,4 s). */
  const sonda = mp => new Promise(res => {
    const real = ponerMP(mp), ts = [], cb = [], DESC = 10, NS = 50; let t = T0, n = 0, hecho = false;
    const fin = cortada => {
      if (hecho) return; hecho = true; clearTimeout(corte);
      const d = ts.slice(DESC + 1).map((x, i) => x - ts[DESC + i]), o = d.slice().sort((a, b) => a - b), h = cb.slice(DESC).sort((a, b) => a - b);
      res({ mp: num(real), cuadros: d.length, perdidos: d.length ? perdidos(d, periodo) : null, p50: d.length ? num(o[o.length >> 1], 1) : null, p99: d.length ? num(o[Math.min(o.length - 1, Math.floor(o.length * .99))], 1) : null, max: d.length ? num(o[o.length - 1], 1) : null, hiloMs: h.length ? num(h[h.length >> 1], 1) : null, ...(cortada ? { cortada: true } : {}) });
    };
    const corte = setTimeout(() => fin(true), 5000);      // pestaña oculta: el navegador deja de dar cuadros
    const f = now => {
      if (hecho) return; if (paso > 1 && n++ % paso) { requestAnimationFrame(f); return; }
      const a = performance.now(); escena.bucle(t, DT); t += DT; escena.cuadro(DT, true); cb.push(performance.now() - a); ts.push(now);
      const k = ts.length - 1 - DESC;
      if (k >= NS || (k >= 20 && now - ts[DESC] > 1400) || now - ts[0] > 3500) fin(false); else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  /** Búsqueda sobre la resolución: sube mientras no se pierdan refrescos, baja si se pierden, y parte la diferencia. Hasta 5 sondas. */
  const buscar = async desde => {
    const sondas = []; let mp = Math.max(MP_MIN, Math.min(MP_MAX, Number.isFinite(desde) && desde > 0 ? desde : 1)), lo = null, hi = null;
    for (let k = 0; k < 5 && queda(1500); k++) {
      const s = await sonda(mp); sondas.push(s); if (s.perdidos === null) break;
      if (s.perdidos === 0) lo = Math.max(lo ?? 0, s.mp); else hi = Math.min(hi ?? Infinity, s.mp);
      if (lo !== null && hi !== null) { if (hi <= lo || hi / lo < 1.12) break; mp = Math.sqrt(lo * hi); }
      else if (lo !== null) { if (lo >= MP_MAX * .98) break; mp = Math.min(MP_MAX, lo * 1.25); }
      else { if (hi <= MP_MIN * 1.02) break; mp = Math.max(MP_MIN, hi * (s.perdidos > s.cuadros * .3 ? .6 : .8)); }
    }
    return { mpReal: num(lo), mpFalla: num(hi), sondas };
  };

  // ---------- 1. calidades: Baja, Móvil, Media, Alta, en vueltas, cada una después de una Baja ----------
  B.etapa = 'calidades';
  const claves = ['baja', 'movil', 'media', 'alta'].filter(k => k === 'baja' || !SOLO.length || SOLO.includes(k)), med1 = {}, pares = {};
  for (const k of claves) { med1[k] = []; pares[k] = []; }
  const poner = async (k, primera) => { escena.setCalidad(PRESET[k]); if (primera) await escena.precalentar(); else { await compilar(); } usar(); const eg = errorGL(); if (eg) B.errores.push(`al poner ${k}: error de WebGL ${eg}`); };
  decir('compilando Baja'); await unCuadro(); await poner('baja', true);
  const programas0 = progs(), fotoBaja = foto(); B.programasAlEmpezar = programas0;
  const vistas = new Set(['baja']), infoCal = {}, nVar = MENOS.length;
  // lo que hace falta dejar para las variantes (todas sus vueltas) y la búsqueda con pantalla
  const reservaVariantes = () => VUELTAS * nVar * (2 * dur.medida + 250) + 12000;
  let durCal = 0;
  for (let vuelta = 0; vuelta < VUELTAS && claves.length > 1; vuelta++) {
    if (vuelta && !queda(durCal * 1.1 + reservaVariantes())) { B.notas.push(`Calidades: ${vuelta} vueltas (faltó tiempo para más).`); break; }
    const tv = performance.now();
    for (const k of claves.slice(1)) {
      decir(`calidades · vuelta ${vuelta + 1} · Baja y ${PRESET[k].label}`); await unCuadro();
      if (escena.Q !== PRESET.baja) await poner('baja', false);
      const base = medida(); med1.baja.push(base);
      await poner(k, !vistas.has(k)); vistas.add(k);
      if (!infoCal[k]) infoCal[k] = contar();
      const m = medida(); med1[k].push(m); pares[k].push(m.ms1MP - base.ms1MP);
    }
    durCal = performance.now() - tv;
  }
  if (escena.Q !== PRESET.baja) await poner('baja', false);
  { const n = liberar(fotoBaja); if (n) B.notas.push(`Al volver a Baja se liberaron ${n} programas de las otras calidades.`); }
  med1.baja.push(medida()); infoCal.baja = contar();
  for (const k of claves) {
    if (!med1[k].length) continue;
    const c = { id: k, nombre: `${PRESET[k].label} completa`, calidad: k, ...infoCal[k], ...resumir(med1[k]) };
    // Baja: su propia dispersión (si la máquina cambió de carga, el número absoluto no vale). Las otras: la de la
    // diferencia con la Baja medida justo antes, que no la mueve la carga de la máquina si es pareja.
    if (k !== 'baja' && pares[k].length) { const [lo, hi] = rango(pares[k]), bb = med(med1.baja.map(m => m.ms1MP)); Object.assign(c, { vsBajaMs: num(med(pares[k]), 2), vsBajaMin: num(lo, 2), vsBajaMax: num(hi, 2) }); c.ruidosa = c.vueltas < 2 || ruido(bb ? (hi - lo) / bb : 1); }
    else c.ruidosa = ruido(c.dispersion);
    B.calidades.push(c);
  }

  // ---------- 2. variantes de «Baja», intercaladas con la escena completa ----------
  B.etapa = 'variantes';
  const vs = MENOS.map(def => ({ id: `baja-${def.id}`, nombre: `Baja ${def.nombre}`, quita: def.id, calidad: 'baja', def, ms: [], bases: [], ahorros: [] }));
  let base = medida(); const basesTodas = [base]; let durVar = vs.length * (2 * dur.medida + 250);
  for (let vuelta = 0; vuelta < VUELTAS && vs.length; vuelta++) {
    if (!queda(durVar * 1.1 + 7000)) { B.notas.push(`Variantes: ${vuelta} vueltas (faltó tiempo para más).`); break; }
    const tv = performance.now();
    for (const v of vs) {
      decir(`variantes · vuelta ${vuelta + 1} de ${VUELTAS} · ${v.nombre}`); await unCuadro();
      const m = await medirVariante(v.def, v); const despues = medida(); basesTodas.push(despues);
      if (m) { const b = (base.ms1MP + despues.ms1MP) / 2; v.ms.push(m); v.bases.push([base, despues]); v.ahorros.push({ ms: b - m.ms1MP, fijo: (base.fijo + despues.fijo) / 2 - m.fijo, porMP: (base.porMP + despues.porMP) / 2 - m.porMP, base: b }); }
      base = despues;
    }
    durVar = performance.now() - tv;
  }
  for (const v of vs) {
    const { def, ms, bases, ahorros, ...resto } = v; if (!ms.length) { B.variantes.push({ ...resto, vueltas: 0, ...(v.error ? { error: v.error } : {}) }); continue; }
    const R = resumir(ms), [lo, hi] = rango(ahorros.map(a => a.ms)), am = med(ahorros.map(a => a.ms)), bm = med(ahorros.map(a => a.base));
    const dispBases = Math.max(...bases.map(([a, b]) => Math.abs(a.ms1MP - b.ms1MP) / Math.max(1e-6, (a.ms1MP + b.ms1MP) / 2)));
    const signos = lo < 0 && hi > 0 && Math.abs(am) < (hi - lo) / 2;
    B.variantes.push({ ...resto, ...R, ahorroMs: num(am, 2), ahorroMin: num(lo, 2), ahorroMax: num(hi, 2), ahorroPct: bm ? num(am / bm * 100, 1) : null, ahorroFijoMs: num(med(ahorros.map(a => a.fijo)), 2), ahorroPorMPms: num(med(ahorros.map(a => a.porMP)), 2),
      dispersionBases: num(dispBases, 3), dispersionAhorro: bm ? num((hi - lo) / bm, 3) : null, ruidosa: ms.length < 2 || ruido(dispBases, bm ? (hi - lo) / bm : 1) || signos });
  }
  { const a = basesTodas[0].ms1MP, z = basesTodas[basesTodas.length - 1].ms1MP; B.deriva = { primeraMs: num(a, 2), ultimaMs: num(z, 2), cambioPct: num((z - a) / a * 100, 1), completas: basesTodas.length, nota: 'Costo a 1 MP de «Baja completa» al principio y al final de las variantes. Si cambia mucho, la máquina cambió de carga durante el banco; por eso cada variante se compara con las completas de al lado.' }; }

  // ---------- 3. cuadros de verdad: cuántos MP sostiene sin perder refrescos ----------
  // solo la calidad por defecto del juego («Baja»): es la que hace falta para decidir la resolución
  B.etapa = 'búsquedas'; const cb = B.calidades.find(c => c.id === 'baja');
  if (cb && queda(5000)) { decir('búsqueda con pantalla · Baja completa'); await unCuadro(); try { Object.assign(cb, await buscar(cb.mpModelo100 ?? 1)); } catch (e) { B.errores.push(`baja (búsqueda): ${e}`); console.error(e); } }
  else if (cb) B.notas.push('Sin tiempo para la búsqueda con cuadros de verdad.');
  liberar(fotoBaja); B.programasAlTerminar = progs();
  if (B.programasAlTerminar > programas0) B.notas.push(`Quedaron ${B.programasAlTerminar - programas0} programas más que al empezar.`);
  // la imagen queda como en el juego
  escena.lodFijo = null; escena.setTope(Math.min(nativoMP, 2) * 1e6); escena.bucle(T0, 0); escena.cuadro(0, true);
  const eg = errorGL(); if (eg) B.errores.push(`al terminar: error de WebGL ${eg}`);
}

/** Tabla en pantalla, encima del juego. */
function tabla(B) {
  const n = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ',')), e = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const el = document.createElement('div'); el.id = 'banco';
  el.style.cssText = 'position:fixed;inset:0;z-index:60;overflow:auto;background:rgba(3,5,12,.95);color:#e8ecf8;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:14px 18px;text-transform:none;letter-spacing:0';
  const marca = v => (v.ruidosa ? ' <b style="color:#ffb35c">ruidosa</b>' : '') + (v.error ? ' · ERROR' : '') + (v.errorGL ? ` · WebGL ${v.errorGL}` : '');
  const filaC = v => `<tr style="background:#16204a;font-weight:700"><td style="text-align:left">${e(v.nombre)}${marca(v)}</td><td>${v.vueltas}</td><td>${n(v.fijoMs)}</td><td>${n(v.porMPms)}</td><td>${n(v.ms1MP)}</td><td>${n(v.ms1MPmin)} a ${n(v.ms1MPmax)}</td><td>${n(v.msNativo)}</td><td>${n(v.mpModelo)}</td><td>${n(v.mpReal)}</td><td>${n(v.mpFalla)}</td><td>${v.vsBajaMs === undefined ? '—' : n(v.vsBajaMs)}</td><td>${v.llamadas ?? '—'}</td><td>${v.triangulos ? Math.round(v.triangulos / 1000) + ' mil' : '—'}</td></tr>`;
  const filaV = v => `<tr><td style="text-align:left">${e(v.nombre)}${marca(v)}</td><td>${v.vueltas}</td><td>${n(v.ms1MP)}</td><td>${n(v.ahorroMs)}</td><td>${n(v.ahorroMin)} a ${n(v.ahorroMax)}</td><td>${v.ahorroPct === undefined || v.ahorroPct === null ? '—' : n(v.ahorroPct, 1) + ' %'}</td><td>${n(v.ahorroFijoMs)}</td><td>${n(v.ahorroPorMPms)}</td><td>${v.llamadas ?? '—'}</td><td>${v.triangulos ? Math.round(v.triangulos / 1000) + ' mil' : '—'}</td><td>${v.programasSobrantes ?? '—'}</td></tr>`;
  const th = 'style="color:#9fb0e0;text-align:right"';
  el.innerHTML = `<h1 style="font:700 16px/1.3 inherit;margin:0 0 6px">Banco de medición · Tarima</h1>
<p style="margin:0 0 4px">${e(B.gl || '?')} · ventana ${(B.ventana || []).join(' × ')} · densidad ${n(B.dpr)} · pantalla a su resolución: ${n(B.nativoMP)} MP</p>
<p style="margin:0 0 10px">Pantalla de <b>${n(B.hz)} Hz</b> (período ${n(B.periodoMs)} ms; un cuadro puede costar hasta ${n(B.periodoMs * B.margen)} ms) · ${n(B.duracionS, 1)} s${B.deriva ? ` · deriva de la completa: ${n(B.deriva.cambioPct, 1)} %` : ''} · programas ${B.programasAlEmpezar ?? '—'} → ${B.programasAlTerminar ?? '—'}${B.errores.length ? ` · <b style="color:#ff8a7a">${B.errores.length} errores (ver BANCO.errores)</b>` : ''}</p>
<h2 style="font:700 13px/1.3 inherit;margin:8px 0 4px">Calidades (escena completa)</h2>
<table style="border-collapse:collapse;white-space:nowrap" cellpadding="3"><thead><tr ${th}><th style="text-align:left">Calidad</th><th>Vueltas</th><th>Fijo<br>ms</th><th>Por MP<br>ms</th><th>A 1 MP<br>ms</th><th>Rango a<br>1 MP</th><th>A la de la<br>pantalla ms</th><th>MP que entran<br>(cuenta)</th><th>MP sin perder<br>refrescos</th><th>Pierde<br>desde MP</th><th>Contra<br>Baja ms</th><th>Llamadas</th><th>Triángulos</th></tr></thead>
<tbody style="text-align:right">${B.calidades.map(filaC).join('')}</tbody></table>
<h2 style="font:700 13px/1.3 inherit;margin:12px 0 4px">Baja con una cosa menos (comparada con la completa de antes y de después, en cada vuelta)</h2>
<table style="border-collapse:collapse;white-space:nowrap" cellpadding="3"><thead><tr ${th}><th style="text-align:left">Variante</th><th>Vueltas</th><th>A 1 MP<br>ms</th><th>Ahorro<br>ms</th><th>Rango del<br>ahorro</th><th>Ahorro</th><th>Del fijo<br>ms</th><th>Por MP<br>ms</th><th>Llamadas</th><th>Triángulos</th><th>Programas<br>sobrantes</th></tr></thead>
<tbody style="text-align:right">${B.variantes.map(filaV).join('')}</tbody></table>
${B.notas.length ? `<p style="margin:10px 0 0;color:#ffd23f">${B.notas.map(e).join('<br>')}</p>` : ''}
<p style="margin:10px 0 0;max-width:110ch;color:#9fb0e0;white-space:normal">Costo de un cuadro (procesador más placa, sin esperar a la pantalla) medido a ${(B.mpMedidas || []).map(x => n(x)).join(' y ')} megapíxeles, mediana de las vueltas. Cada variante se mide entre dos medidas de la escena completa y el ahorro es contra el promedio de esas dos. «Ruidosa»: el número no sirve para decidir. «MP sin perder refrescos» sale de dibujar de verdad con la pantalla. Todo el detalle está en <b>window.BANCO</b>; las columnas, en HANDOFF.md.</p>
<p style="margin:10px 0 0"><button id="banco-copiar" style="font:inherit;padding:4px 10px">Copiar el JSON</button> <button id="banco-cerrar" style="font:inherit;padding:4px 10px">Cerrar la tabla</button> <span id="banco-aviso"></span></p>`;
  document.body.appendChild(el);
  el.querySelector('#banco-cerrar').onclick = () => el.remove();
  el.querySelector('#banco-copiar').onclick = () => { const aviso = el.querySelector('#banco-aviso'); navigator.clipboard.writeText(JSON.stringify(B)).then(() => { aviso.textContent = 'copiado'; }, () => { aviso.textContent = 'no se pudo copiar: está en window.BANCO'; }); };
}
