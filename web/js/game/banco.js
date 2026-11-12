// Banco de medición de fluidez: `juego.html?banco=1`. Corre solo, sin tocar nada, y dice qué cuesta cada cosa de la escena
// en ESTA máquina. Escena fija: un pesista haciendo el arranque en bucle con la cámara del juego. Para cada variante mide
// (A) el costo de un cuadro sin esperar a la pantalla, a dos o tres resoluciones (escena.costo), y de esa recta saca el
// costo fijo, el costo por megapíxel y cuántos megapíxeles entran en el 85 % del período de la pantalla; y (B), en las
// escenas completas y en las variantes que más ahorran mientras quede tiempo, una búsqueda sobre la resolución con cuadros
// de verdad (requestAnimationFrame, con la pantalla): la mayor resolución que no pierde ningún refresco.
// Variantes: la escena completa en cada calidad, y sobre «Baja» quitando de a una cosa por vez. Cada variante se compila
// antes de medir y se descartan los primeros cuadros. Al terminar muestra una tabla y deja todo en `window.BANCO` (JSON,
// con `listo: true`). Termina antes de los 90 s contados desde que se abrió la página (`?limite=segundos` lo acorta).
// Otros parámetros: `?pesista=ventura|brenner`, `?solo=baja,media` (calidades), `?variantes=sombras,luces` (solo esas).
// Cómo leer las columnas: HANDOFF.md, «Banco de medición».
import * as THREE from 'three';
import { PRESET, MARGEN, ajustar, mpSostenible, perdidos, medirRefresco, metaDe, pasoDe } from './perf.js';
import { PLANTEL } from './roster.js';

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const COPIA_FS = /* glsl */`uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = vec4( texture2D( tDiffuse, vUv ).rgb, 1.0 ); }`;
/** Píxeles por metro con que el banco fija el detalle del pesista: malla simplificada y normales de detalle, como en el plano general del juego. */
const LOD_PLANO = 300;
/** Megapíxeles de las medidas sin pantalla (el del medio solo en las escenas completas, para ver si la recta es recta). */
const MP_A = [.5, 1, 1.6];
/** Límites de la búsqueda con cuadros de verdad. */
const MP_MIN = .15, MP_MAX = 4.5;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const unCuadro = () => Promise.race([new Promise(r => requestAnimationFrame(r)), dormir(120)]);      // con la pestaña oculta no hay cuadros: no se espera para siempre
const num = (x, d = 3) => (Number.isFinite(x) ? +x.toFixed(d) : null);
export const COLUMNAS = {
  nombre: 'Qué se midió. «completa» es la escena del juego en esa calidad; las demás son esa escena con una sola cosa menos.',
  fijoMs: 'Costo del cuadro que no depende de la resolución (ms): geometría, esqueletos, pasada de sombra, hilo principal.',
  porMPms: 'Costo por cada megapíxel dibujado (ms/MP): sombreado de materiales y luces, MSAA y pases de pantalla.',
  ms1MP: 'Costo de un cuadro a 1 megapíxel (fijo + porMP), en ms. Es procesador más placa en serie: en el juego corren en paralelo y el número real es algo menor.',
  msNativo: 'Lo mismo a la resolución de la pantalla (los megapíxeles de «nativoMP»).',
  mpModelo: 'Megapíxeles que entran en el 85 % del período de la pantalla según esa recta. Es una cuenta, no una medición con pantalla.',
  mpReal: 'Búsqueda con cuadros de verdad: la mayor resolución (MP) probada que no perdió ningún refresco en unos 50 cuadros seguidos. Vacío: no se buscó (faltó tiempo) o ninguna sonda salió limpia.',
  mpFalla: 'La menor resolución (MP) probada que sí perdió refrescos. El límite real está entre mpReal y mpFalla.',
  sondas: 'Cada prueba de la búsqueda: megapíxeles, cuadros medidos, refrescos perdidos, mediana, percentil 99 y máximo del intervalo entre cuadros, y ms de hilo principal.',
  ahorroMs: 'Cuánto baja el costo a 1 MP respecto de la escena completa de la misma calidad (ms). Negativo: esa variante cuesta más.',
  ahorroPct: 'El mismo ahorro en porcentaje del costo de la escena completa a 1 MP.',
  ahorroFijoMs: 'Parte del ahorro que es costo fijo (ms).',
  ahorroPorMPms: 'Parte del ahorro que es costo por megapíxel (ms/MP).',
  desvio1MP: 'Solo en las completas: costo medido a 1 MP menos el que predice la recta trazada entre 0,5 y 1,6 MP (ms). Cerca de cero: el costo es lineal en los píxeles.',
  llamadas: 'Llamadas de dibujo de un cuadro (incluye la pasada de sombra y los pases de pantalla).',
  triangulos: 'Triángulos de un cuadro (incluye la pasada de sombra).',
  mallasEsqueleto: 'Mallas con esqueleto que de verdad se dibujan (las de un modelo oculto no cuentan).',
  programas: 'Programas de sombreado compilados en ese momento.',
  msaa: 'Muestras de MSAA del destino de la escena durante la medida (el banco no las baja a 2 con densidad alta, como sí hace el juego).',
};

/** Punto de entrada (main.js). `cargas`: promesas de los modelos. `hz`: refresco medido al cargar. */
export async function correrBanco({ escena, cargas, hz, params, msg }) {
  const B = window.BANCO = { listo: false, version: 1, etapa: 'carga', progreso: '', columnas: COLUMNAS, variantes: [], notas: [], errores: [] };
  const cartel = document.createElement('div'); cartel.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:40;background:rgba(3,5,12,.82);color:#e8ecf8;font:12px/1.3 ui-monospace,Menlo,monospace;padding:6px 10px;pointer-events:none'; document.body.appendChild(cartel);
  const decir = txt => { B.progreso = txt; cartel.textContent = 'Banco de medición · ' + txt; };
  try { await correr(B, { escena, cargas, hz, params, msg, decir }); } catch (e) { B.errores.push(String(e.stack || e)); console.error(e); }
  B.duracionS = num(performance.now() / 1000, 1); B.etapa = 'listo'; cartel.remove();
  try { tabla(B); } catch (e) { B.errores.push('tabla: ' + String(e.stack || e)); console.error(e); }
  B.listo = true;
  try { console.log('BANCO ' + JSON.stringify(B)); } catch { /* sin consola */ }
}

async function correr(B, { escena, cargas, hz: hzCarga, params, msg, decir }) {
  const LIMITE = Math.max(10, Math.min(88, +params.get('limite') || 84)) * 1000, queda = ms => performance.now() + ms < LIMITE;
  const lista = k => (params.get(k) || '').split(',').map(x => x.trim()).filter(Boolean), SOLO = lista('solo'), CUALES = lista('variantes');
  decir('cargando los modelos'); await Promise.all(cargas);
  const id = PLANTEL[params.get('pesista')] ? params.get('pesista') : 'brenner';
  await escena.mostrar(id); escena.setCarga(140, 's'); escena.lodFijo = LOD_PLANO; msg.hidden = true;
  const camara = escena.vertical ? 'lado' : '3/4'; escena.camara(camara);
  const r = escena.renderer, gl = r.getContext(), A = escena.arena, L = escena.lighting, canvas = escena.canvas;
  // la pantalla, sin dibujar nada
  decir('midiendo la pantalla');
  const hz = await medirRefresco(45, null) || hzCarga || 60, paso = pasoDe(hz), periodo = 1000 / metaDe(hz), DT = periodo / 1000, T0 = 1.3;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'), dpr = window.devicePixelRatio || 1, nativoMP = canvas.clientWidth * canvas.clientHeight * dpr * dpr / 1e6;
  Object.assign(B, { fecha: new Date().toISOString(), navegador: navigator.userAgent, gl: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', ventana: [window.innerWidth, window.innerHeight], lienzo: [canvas.clientWidth, canvas.clientHeight],
    dpr: num(dpr, 2), nativoMP: num(nativoMP), hz, hzAlCargar: hzCarga, paso, periodoMs: num(periodo, 2), margen: MARGEN, limiteS: LIMITE / 1000, pesista: id, camara, lodPxPorMetro: LOD_PLANO });
  if (paso > 1) B.notas.push(`Pantalla de ${hz} Hz: el juego dibuja uno de cada ${paso} refrescos, y el banco mide contra ese período (${num(periodo, 2)} ms).`);
  if (document.hidden) B.notas.push('La pestaña estaba oculta al empezar: las búsquedas con cuadros de verdad no valen.');

  // ---------- herramientas ----------
  let msaa = null;      // muestras forzadas por una variante (null: las de la calidad)
  const ponerMP = mp => { escena.setTope(mp * 1e6, true); const rt = escena.post.sceneRT, n = msaa ?? escena.Q.msaa; if (rt.samples !== n) { rt.samples = n; rt.dispose(); } return escena.megapixeles; };
  /** Compila en paralelo los programas de lo que hay en escena con las luces y el destino de este momento. */
  const compilar = async () => { let p; r.setRenderTarget(escena.directo ? null : escena.post.sceneRT); try { p = r.compileAsync(escena.scene, escena.rig.camera); } finally { r.setRenderTarget(null); } await Promise.race([p, dormir(8000)]); };
  const contar = () => {
    const inf = r.info, auto = inf.autoReset; inf.autoReset = false; inf.reset(); escena.bucle(T0, 0); escena.sombra = 3; escena.cuadro(0, true);
    const o = { llamadas: inf.render.calls, triangulos: inf.render.triangles, mallasEsqueleto: 0, programas: inf.programs ? inf.programs.length : null }; inf.autoReset = auto;
    escena.scene.traverseVisible(x => { if (x.isSkinnedMesh) o.mallasEsqueleto++; }); return o;
  };
  /** (A) Costo sin pantalla en cada resolución de `puntos`. */
  const medirA = puntos => puntos.map(mp => { const real = ponerMP(mp), c = escena.costo({ n: 14, calienta: 4, tope: 700, t0: T0, dt: DT }); return { mp: num(real), ms: num(c.ms, 2), min: num(c.min, 2), p90: num(c.p90, 2), n: c.n }; });
  /** (B) Una sonda con cuadros de verdad a `mp` megapíxeles: descarta 10 cuadros y mide hasta 50 (o 1,4 s). */
  const sonda = mp => new Promise(res => {
    const real = ponerMP(mp), ts = [], cb = [], DESC = 10, N = 50; let t = T0, n = 0, hecho = false;
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
      if (k >= N || (k >= 20 && now - ts[DESC] > 1400) || now - ts[0] > 3500) fin(false); else requestAnimationFrame(f);
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
    return { mpReal: lo, mpFalla: hi, sondas };
  };
  const ocultar = objs => { const o = objs.filter(Boolean), antes = o.map(x => x.visible); o.forEach(x => { x.visible = false; }); return () => o.forEach((x, i) => { x.visible = antes[i]; }); };

  // ---------- variantes ----------
  const velos = []; A.group.traverse(o => { if (o.isMesh && o.material && o.material.map === A.hazeTex) velos.push(o); });
  const copia = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COPIA_FS, depthTest: false, depthWrite: false, uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uBloom: { value: 0 }, uRes: { value: new THREE.Vector2() } } });
  const lambert = new Map();
  /** Tarima, alfombra y arena con un material difuso simple en vez del físico (sin brillo especular ni reflejo del entorno). */
  const baratos = () => {
    const hechos = [];
    A.group.traverse(o => {
      if (!o.isMesh) return; const lista = [].concat(o.material); if (!lista.some(m => m.isMeshStandardMaterial)) return;
      const nueva = lista.map(m => { if (!m.isMeshStandardMaterial) return m; let x = lambert.get(m); if (!x) { x = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, normalMap: m.normalMap, side: m.side }); if (m.normalMap) x.normalScale.copy(m.normalScale); lambert.set(m, x); } return x; });
      hechos.push([o, o.material]); o.material = Array.isArray(o.material) ? nueva : nueva[0];
    });
    return () => hechos.forEach(([o, m]) => { o.material = m; });
  };
  /** Anisotropía de todas las texturas de la escena, cambiada en la placa sin volver a subir ninguna imagen. */
  const anisotropia = valor => {
    const ext = r.extensions.get('EXT_texture_filter_anisotropic'); if (!ext) return () => {};
    const tex = new Set(), mirar = bolsa => { for (const k in bolsa) { const t = bolsa[k] && bolsa[k].isTexture ? bolsa[k] : bolsa[k] && bolsa[k].value && bolsa[k].value.isTexture ? bolsa[k].value : null; if (t) tex.add(t); } };
    escena.scene.traverse(o => { for (const m of [].concat(o.material || [])) { mirar(m); mirar(m.uniforms || {}); mirar((m.userData && m.userData.skin) || {}); } });
    const poner = v => { for (const t of tex) { if (t.isCubeTexture || t.isDepthTexture || t.isDataArrayTexture || t.isData3DTexture || !(t.anisotropy > 1)) continue; const g = r.properties.get(t).__webglTexture; if (!g) continue; r.state.bindTexture(gl.TEXTURE_2D, g); gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, v === null ? Math.min(t.anisotropy, r.capabilities.getMaxAnisotropy()) : v); } };
    poner(valor); return () => poner(null);
  };
  const pase = k => () => { escena.post.skip = { [k]: true }; return () => { escena.post.skip = {}; }; };
  const pelo = () => { const a = escena.activo; return ocultar([...a.meshes.filter(m => [].concat(m.material).some(x => x.name === 'Hair')), a.hairDepth]); };
  const MENOS = {
    baja: [
      { id: 'sombras', nombre: 'sin sombras', poner: () => { escena.setSombras(false); return () => escena.setSombras(true); } },
      { id: 'sombra512', nombre: 'sombra en un mapa de 512', poner: () => { L.setQuality({ ...escena.Q, shadow: 512 }); escena._sombras(); return () => { L.setQuality(escena.Q); escena._sombras(); }; } },
      { id: 'publico', nombre: 'sin público', poner: () => ocultar([A.impostors, A.crowd]) },
      { id: 'haces', nombre: 'sin haces de luz', poner: () => ocultar(A.beamMeshes) },
      { id: 'velos', nombre: 'sin bruma, puntos de luz ni flashes', poner: () => ocultar([...velos, A.bokeh, A.flashMesh]) },
      { id: 'contraluces', nombre: 'sin los tres contraluces', compila: true, poner: () => ocultar([L.rimA, L.rimB, L.hair]) },
      { id: 'luces', nombre: 'solo la clave y la luz de sala (seis luces menos)', compila: true, poner: () => ocultar([L.key2, L.stage, L.wash, L.rimA, L.rimB, L.hair]) },
      { id: 'final', nombre: 'pase final sin tono ni corrección de color (copia)', poner: () => { const p = escena.post, o = p.finalMat; p.finalMat = copia; return () => { p.finalMat = o; }; } },
      { id: 'msaa2', nombre: 'MSAA de 2 muestras', poner: () => { msaa = 2; return () => { msaa = null; }; } },
      { id: 'msaa0', nombre: 'sin MSAA', poner: () => { msaa = 0; return () => { msaa = null; }; } },
      { id: 'directo', nombre: 'directo al lienzo (sin destino HDR, MSAA ni pase final)', compila: true, poner: () => { escena.directo = true; return () => { escena.directo = false; }; } },
      { id: 'segundo', nombre: 'sin el segundo modelo en la escena (ya está oculto)', poner: () => { const otros = Object.values(escena.atletas).filter(a => a !== escena.activo); otros.forEach(a => escena.scene.remove(a.root)); return () => otros.forEach(a => escena.scene.add(a.root)); } },
      { id: 'pesista', nombre: 'sin pesista', poner: () => ocultar([escena.activo.root]) },
      { id: 'lod', nombre: 'pesista con la malla completa (sin nivel de detalle)', poner: () => { escena.lodFijo = 9999; return () => { escena.lodFijo = LOD_PLANO; }; } },
      { id: 'detalle', nombre: 'sin normales de detalle en piel y tela', poner: () => { escena.lodFijo = 150; return () => { escena.lodFijo = LOD_PLANO; }; } },
      { id: 'pelo', nombre: 'sin pelo', poner: pelo },
      { id: 'barra', nombre: 'sin barra ni discos', poner: () => ocultar([escena.barbell.group]) },
      { id: 'piso', nombre: 'tarima, alfombra y arena con material difuso simple', compila: true, poner: baratos },
      { id: 'aniso', nombre: 'anisotropía 1 en todas las texturas', poner: () => anisotropia(1) },
    ],
    movil: [],
    media: [
      { id: 'ao', nombre: 'sin oclusión ambiental', poner: pase('ao') },
      { id: 'dof', nombre: 'sin profundidad de campo', poner: pase('dof') },
      { id: 'bloom', nombre: 'sin resplandor', poner: pase('bloom') },
      { id: 'publico', nombre: 'sin público', poner: () => ocultar([A.impostors, A.crowd]) },
    ],
    alta: [
      { id: 'smaa', nombre: 'sin SMAA', poner: pase('smaa') },
      { id: 'sombra2', nombre: 'sin la segunda sombra', poner: () => { L.key2.castShadow = false; escena.sombra = 4; return () => { escena._sombras(); escena.sombra = 4; }; } },
    ],
  };

  /** Mide una variante. `def.poner()` la arma y devuelve cómo deshacerla. `base`: la escena completa de la misma calidad. */
  const medir = async (def, clave, base) => {
    const v = { id: base ? `${clave}-${def.id}` : clave, nombre: base ? `${PRESET[clave].label} ${def.nombre}` : `${PRESET[clave].label} completa`, calidad: clave, quita: base ? def.id : null };
    decir(`${B.variantes.length + 1} · ${v.nombre}`); await unCuadro();
    let deshacer = null;
    try {
      deshacer = def.poner ? def.poner() : null;
      if (def.compila) await compilar();
      const puntos = base ? [MP_A[0], MP_A[2]] : MP_A; ponerMP(puntos[0]); escena.costo({ n: 1, calienta: 2, tope: 400, t0: T0, dt: DT });      // primer uso de lo recién compilado
      Object.assign(v, contar(), { msaa: msaa ?? escena.Q.msaa });
      const m = medirA(puntos), mod = ajustar(m[0], m[m.length - 1]);
      Object.assign(v, { medidas: m, fijoMs: num(mod.fijo, 2), porMPms: num(mod.porMP, 2), ms1MP: num(mod.fijo + mod.porMP, 2), msNativo: num(mod.fijo + mod.porMP * nativoMP, 2), mpModelo: num(mpSostenible(mod, periodo)), mpModelo100: num(mpSostenible(mod, periodo, 1)) });
      if (m.length === 3) v.desvio1MP = num(m[1].ms - (mod.fijo + mod.porMP * m[1].mp), 2);
      if (base && base.ms1MP) Object.assign(v, { ahorroMs: num(base.ms1MP - v.ms1MP, 2), ahorroPct: num((base.ms1MP - v.ms1MP) / base.ms1MP * 100, 1), ahorroFijoMs: num(base.fijoMs - v.fijoMs, 2), ahorroPorMPms: num(base.porMPms - v.porMPms, 2) });
      if (!base && queda(8000)) Object.assign(v, await buscar(mpSostenible(mod, periodo, 1)));
    } catch (e) { v.error = String(e.stack || e); B.errores.push(`${v.id}: ${e}`); console.error(e); }
    finally { try { if (deshacer) deshacer(); } catch (e) { B.errores.push(`${v.id} (deshacer): ${e}`); } }
    B.variantes.push(v); return v;
  };

  // ---------- recorrido ----------
  B.etapa = 'midiendo'; const bases = {};
  for (const clave of ['baja', 'movil', 'media', 'alta']) {
    if (SOLO.length && !SOLO.includes(clave)) continue;
    if (!queda(12000)) { B.notas.push(`Sin tiempo para «${PRESET[clave].label}» y lo que sigue.`); break; }
    decir(`compilando ${PRESET[clave].label}`); await unCuadro();
    escena.setCalidad(PRESET[clave]); await escena.precalentar();
    const base = bases[clave] = await medir({}, clave, null);
    for (const def of MENOS[clave]) {
      if (CUALES.length && !CUALES.includes(def.id)) continue;
      if (!queda(6000)) { B.notas.push(`Sin tiempo para «${PRESET[clave].label} ${def.nombre}» y lo que sigue de esa calidad.`); break; }
      await medir(def, clave, base);
    }
  }
  // con el tiempo que quede: búsqueda con cuadros de verdad en las variantes de «Baja» que más ahorran
  B.etapa = 'búsquedas'; const cand = B.variantes.filter(v => v.calidad === 'baja' && v.quita && !v.error && v.ahorroPct >= 3).sort((a, b) => b.ahorroPct - a.ahorroPct);
  if (cand.length && queda(9000)) {
    escena.setCalidad(PRESET.baja); await escena.precalentar();
    for (const v of cand) {
      if (!queda(7000)) break;
      const def = MENOS.baja.find(d => d.id === v.quita); let deshacer = null; decir(`búsqueda con pantalla · ${v.nombre}`);
      try { deshacer = def.poner(); if (def.compila) await compilar(); ponerMP(MP_A[0]); escena.costo({ n: 1, calienta: 2, tope: 400, t0: T0, dt: DT }); Object.assign(v, await buscar(v.mpModelo100 ?? 1)); }
      catch (e) { B.errores.push(`${v.id} (búsqueda): ${e}`); console.error(e); }
      finally { try { if (deshacer) deshacer(); } catch (e) { B.errores.push(`${v.id} (deshacer): ${e}`); } }
    }
  }
  for (const v of B.variantes) { if (v.mpReal !== undefined) { v.mpReal = num(v.mpReal); v.mpFalla = num(v.mpFalla); } }
  // la imagen queda como en el juego
  for (const m of lambert.values()) m.dispose(); copia.dispose();
  escena.lodFijo = null; escena.setCalidad(PRESET.baja); escena.setTope(Math.min(nativoMP, 2) * 1e6); escena.bucle(T0, 0); escena.cuadro(0, true);
}

/** Tabla en pantalla, encima del juego. */
function tabla(B) {
  const n = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ',')), e = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const el = document.createElement('div'); el.id = 'banco';
  el.style.cssText = 'position:fixed;inset:0;z-index:60;overflow:auto;background:rgba(3,5,12,.95);color:#e8ecf8;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:14px 18px;text-transform:none;letter-spacing:0';
  const fila = v => `<tr style="${v.quita ? '' : 'background:#16204a;font-weight:700'}"><td style="text-align:left">${e(v.nombre)}${v.error ? ' · ERROR' : ''}</td><td>${n(v.fijoMs)}</td><td>${n(v.porMPms)}</td><td>${n(v.ms1MP)}</td><td>${n(v.msNativo)}</td><td>${n(v.mpModelo)}</td><td>${n(v.mpReal)}</td><td>${n(v.mpFalla)}</td><td>${n(v.ahorroMs)}</td><td>${v.ahorroPct === undefined ? '—' : n(v.ahorroPct, 1) + ' %'}</td><td>${v.llamadas ?? '—'}</td><td>${v.triangulos ? Math.round(v.triangulos / 1000) + ' mil' : '—'}</td></tr>`;
  el.innerHTML = `<h1 style="font:700 16px/1.3 inherit;margin:0 0 6px">Banco de medición · Tarima</h1>
<p style="margin:0 0 4px">${e(B.gl || '?')} · ventana ${(B.ventana || []).join(' × ')} · densidad ${n(B.dpr)} · pantalla a su resolución: ${n(B.nativoMP)} MP</p>
<p style="margin:0 0 10px">Pantalla de <b>${n(B.hz)} Hz</b> (período ${n(B.periodoMs)} ms; un cuadro puede costar hasta ${n(B.periodoMs * B.margen)} ms) · ${B.variantes.length} variantes en ${n(B.duracionS, 1)} s${B.errores.length ? ` · <b style="color:#ff8a7a">${B.errores.length} errores (ver BANCO.errores)</b>` : ''}</p>
<table style="border-collapse:collapse;white-space:nowrap" cellpadding="3"><thead><tr style="color:#9fb0e0;text-align:right"><th style="text-align:left">Variante</th><th>Fijo<br>ms</th><th>Por MP<br>ms</th><th>A 1 MP<br>ms</th><th>A la de la<br>pantalla ms</th><th>MP que entran<br>(cuenta)</th><th>MP sin perder<br>refrescos</th><th>Pierde<br>desde MP</th><th>Ahorro<br>ms a 1 MP</th><th>Ahorro</th><th>Llamadas</th><th>Triángulos</th></tr></thead>
<tbody style="text-align:right">${B.variantes.map(fila).join('')}</tbody></table>
${B.notas.length ? `<p style="margin:10px 0 0;color:#ffd23f">${B.notas.map(e).join('<br>')}</p>` : ''}
<p style="margin:10px 0 0;max-width:110ch;color:#9fb0e0;white-space:normal">Fijo y Por MP: recta del costo de un cuadro (procesador más placa, sin esperar a la pantalla) medida a 0,5 y 1,6 megapíxeles. «MP que entran» es la cuenta con esa recta y el 85 % del período. «MP sin perder refrescos» y «Pierde desde» salen de dibujar de verdad unos 50 cuadros por prueba con la pantalla: el límite real está entre los dos. Ahorro: contra la escena completa de la misma calidad, a 1 MP. Todo el detalle, con cada prueba, está en <b>window.BANCO</b>.</p>
<p style="margin:10px 0 0"><button id="banco-copiar" style="font:inherit;padding:4px 10px">Copiar el JSON</button> <button id="banco-cerrar" style="font:inherit;padding:4px 10px">Cerrar la tabla</button> <span id="banco-aviso"></span></p>`;
  document.body.appendChild(el);
  el.querySelector('#banco-cerrar').onclick = () => el.remove();
  el.querySelector('#banco-copiar').onclick = () => { const aviso = el.querySelector('#banco-aviso'); navigator.clipboard.writeText(JSON.stringify(B)).then(() => { aviso.textContent = 'copiado'; }, () => { aviso.textContent = 'no se pudo copiar: está en window.BANCO'; }); };
}
