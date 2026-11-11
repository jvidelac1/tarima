#!/usr/bin/env node
// Lotes de ComfyUI por su API HTTP (etapa 2, E5 y E6): POST /prompt, GET /history/<id> y GET /view, con semilla fija.
// Por cada salida guarda el archivo y un JSON al lado con indicación, semilla, archivos de modelo con su sha256, imágenes de
// entrada, versión de ComfyUI, segundos, VRAM pico y el flujo exacto que se mandó.
//
// Uso (en el pod, con ComfyUI escuchando en 127.0.0.1:8188; las corridas con modelos van con `flock /root/blender.lock`
// adelante para no compartir la GPU con un render de Blender):
//   node tools/comfy_run.mjs --sonda                                              versión, GPU, nodos y plantillas que usa el plan
//   node tools/comfy_run.mjs --plantilla=image_qwen_image_edit_2511_int8 --listar tabla de nodos del flujo en formato API
//   node tools/comfy_run.mjs --plantilla=3d_pixal3d_multi_views --exportar=out/arte/comfy/pixal3d_mv.api.json
//   node tools/comfy_run.mjs --trabajos=out/arte/comfy/e5_objetivo.json [--solo=T_A_s1,T_A_s2] [--semilla=7] [--seco] [--liberar]
// Opciones: --servidor=http://127.0.0.1:8188  --modelos=/opt/comfy/ComfyUI/models  --dir=out/arte/comfy (caché y registro)
//           --espera=3600 (segundos por trabajo)  --todo (baja también las vistas previas)  --reconvertir (no usar el .api.json guardado)
//           --seco arma y muestra el flujo final sin mandarlo (con --api no necesita servidor)  --liberar descarga los modelos al terminar
//
// Archivo de trabajos (JSON). El flujo sale de "plantilla" (nombre de una plantilla instalada), de "flujo" (archivo en formato
// de la interfaz) o de "api" (archivo ya en formato API, sin navegador):
//   { "plantilla": "image_qwen_image_edit_2511_int8",
//     "quitar":  ["LoraLoaderModelOnly"],                        nodos que se sacan (y los enlaces que salían de ellos)
//     "puentes": { "@Switch (Model)": "on_false" },              nodo que se reemplaza por lo que entra en esa entrada suya
//     "agregar": { "ref2": { "class_type": "LoadImage", "inputs": { "image": "" } } },      nodos nuevos, con el id que se quiera
//     "fijos":   { "KSampler.steps": 40, "KSampler.cfg": 4 },    valores para todos los trabajos
//     "trabajos": [ { "salida": "out/arte/target/T_A_s1.png", "semilla": 1101, "indicacion": "...", "negativa": "...",
//                     "imagenes": ["out/arte/shots/A_P01.png"], "set": { "TextEncodeQwenImageEditPlus.image2": ["ref2", 0] } } ] }
// Selectores (en fijos, set, quitar, puentes e imagenes): "Clase.entrada" (todos los nodos de esa clase), "Clase#2.entrada" (el
// segundo por id), "<id>.entrada" (p. ej. "170:169.seed"), "@Título.entrada" (título del nodo en la plantilla). Con "?" al final
// no es error que no exista. Un valor puede ser un enlace ["id", salida]. "imagenes" es una lista (va a los LoadImage en orden
// de id) o un mapa selector -> archivo; cada imagen se sube a input/ con su sha256 en el nombre.
// "indicacion" y "negativa" van al nodo de texto que alimenta las entradas positive y negative del muestreador (se busca hacia
// atrás por los enlaces); si no se encuentra, hay que ponerlas con "set". "semilla" va a toda entrada seed o noise_seed.
//
// VERIFICADO el 11-nov-2026 leyendo /opt/comfy/object_info.json y las plantillas instaladas (ComfyUI 0.45.0, frontend 1.58.5,
// plantillas 0.11.105), sin generar nada:
//   - Plantillas: image_qwen_image_edit_2511_int8 (la del peso int8 que está bajado; image_qwen_image_edit_2511 pide el fp8mixed),
//     3d_pixal3d_multi_views (la multivista; el plan no la nombraba) y 3d_pixal3d_trellis2_image_to_model. Se sirven en /templates/<nombre>.json.
//   - Qwen: TextEncodeQwenImageEditPlus(clip, prompt; vae, image1..3), título "TextEncodeQwenImageEditPlus (Positive)" en el positivo;
//     KSampler dentro de un subgrafo; pasos y CFG entran por ComfySwitchNode(switch; on_false, on_true) titulados "Switch (Model)",
//     "Switch (CFG)" y "Switch (Steps)". El LoraLoaderModelOnly apunta a un LoRA Lightning que no está bajado: hay que quitarlo.
//   - 3D: Pixal3DMultiViewConditioning(clip_vision_model, fov; front, left, back, right), Pixal3DConditioning(clip_vision_model, image,
//     camera_angle_x), cuatro KSampler con semilla fija, PrimitiveBoolean "Boolean (Switch to Trellis2)", salida por Save3DAdvanced.
//     La plantilla multivista parte de UNA lámina de cuatro vistas (LoadImage -> ImageCropV2 -> RemoveBackground -> ImageCropToMask);
//     para darle cuatro renders sueltos hay que agregar cuatro LoadImage, enlazarlos a front/left/back/right y quitar la lámina.
// SUPUESTO (sin verificar: falta correr un flujo con modelos):
//   - que `app.graphToPrompt()` aplane los subgrafos con ids "170:169" y conserve `_meta.title` (de eso dependen los selectores con @);
//   - en qué clave de /history deja Save3DAdvanced el GLB (se toma cualquier lista con `filename`; si no aparece, se busca el archivo
//     por su prefijo en la carpeta output/ del servidor, que está en esta misma máquina);
//   - que las entradas front/left/back/right acepten la IMAGE de LoadImage tal cual (fondo negro, sin pasar por ImageCropToMask);
//   - qué lado del personaje es `left` (el plan lo controla con la corrida G0);
//   - que sacar un nodo con "quitar" deje válido el flujo cuando la entrada que lo usaba es opcional (on_true lo es).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARG = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)(?:=([\s\S]*))?$/.exec(a); if (!m) fallar(`Argumento no reconocido: ${a} (el uso está en la cabecera de tools/comfy_run.mjs)`); ARG[m[1]] = m[2] ?? true; }
const BASE = String(ARG.servidor || process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const MODELOS = path.resolve(String(ARG.modelos || process.env.COMFY_MODELOS || '/opt/comfy/ComfyUI/models'));
const SALIDAS = path.resolve(String(ARG.salidas || path.join(MODELOS, '..', 'output')));     // carpeta output/ del servidor (misma máquina)
const DIR = path.resolve(ROOT, String(ARG.dir || 'out/arte/comfy'));
const SECO = !!ARG.seco, CLIENTE = 'tarima-' + crypto.randomUUID();
let sinServidor = false;

function fallar(msg) { console.error('ERROR ' + msg); process.exit(1); }
const abs = p => path.resolve(ROOT, p);
const leerJson = f => { try { return JSON.parse(fs.readFileSync(abs(f), 'utf8')); } catch (e) { fallar(`No pude leer ${f}: ${e.message}`); } };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const hashArchivo = f => new Promise((ok, mal) => { const h = crypto.createHash('sha256'); fs.createReadStream(f, { highWaterMark: 1 << 24 }).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal); });
const dormir = ms => new Promise(r => setTimeout(r, ms));

// ---------- HTTP ----------
async function http(ruta, opciones, suave = false) {
  try { return await fetch(BASE + ruta, opciones); }
  catch (e) { sinServidor = true; if (suave) return null; fallar(`No hay ComfyUI en ${BASE} (${e.cause?.code || e.message}). Se levanta con tools/arte_instalar.sh servidor.`); }
}
async function getJson(ruta) { const r = await http(ruta); if (!r.ok) fallar(`GET ${ruta} -> HTTP ${r.status}`); return r.json(); }

// ---------- flujo en formato API: { "<id>": { class_type, inputs, _meta: { title } } } ----------
const esEnlace = v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1]);
const ordenId = (a, b) => { const x = a.split(':').map(Number), y = b.split(':').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return a.localeCompare(b); };
const ids = flujo => Object.keys(flujo).sort(ordenId);
const clases = flujo => [...new Set(ids(flujo).map(i => flujo[i].class_type))].sort().join(', ');
function elegir(flujo, sel) {
  if (Object.hasOwn(flujo, sel)) return [sel];
  if (sel.startsWith('@')) return ids(flujo).filter(i => flujo[i]._meta?.title === sel.slice(1));
  const m = /^(.*?)(?:#(\d+))?$/.exec(sel), todos = ids(flujo).filter(i => flujo[i].class_type === m[1]);
  return m[2] ? todos.slice(+m[2] - 1, +m[2]) : todos;
}
function fijar(flujo, clave, valor) {
  const opc = clave.endsWith('?'); if (opc) clave = clave.slice(0, -1);
  const k = clave.lastIndexOf('.'); if (k < 1) fallar(`Selector sin entrada: "${clave}" (formato "<nodo>.<entrada>")`);
  const sel = clave.slice(0, k), ent = clave.slice(k + 1), ns = elegir(flujo, sel);
  if (!ns.length) { if (opc) return []; fallar(`Ningún nodo coincide con "${sel}". Clases del flujo: ${clases(flujo)}`); }
  for (const i of ns) {
    if (!Object.hasOwn(flujo[i].inputs, ent)) console.log(`AVISO ${i} (${flujo[i].class_type}) no tenía la entrada "${ent}"; tiene: ${Object.keys(flujo[i].inputs).join(', ')}. Se agrega igual.`);
    flujo[i].inputs[ent] = valor;
  }
  return ns;
}
function quitar(flujo, sel) {
  const opc = sel.endsWith('?'); if (opc) sel = sel.slice(0, -1);
  const ns = elegir(flujo, sel); if (!ns.length && !opc) fallar(`quitar: ningún nodo coincide con "${sel}". Clases del flujo: ${clases(flujo)}`);
  for (const n of ns) delete flujo[n];
  for (const i of ids(flujo)) for (const [e, v] of Object.entries(flujo[i].inputs)) if (esEnlace(v) && ns.includes(v[0])) delete flujo[i].inputs[e];
  return ns;
}
function puentear(flujo, sel, ent) {
  const opc = sel.endsWith('?'); if (opc) sel = sel.slice(0, -1);
  const ns = elegir(flujo, sel); if (!ns.length && !opc) fallar(`puentes: ningún nodo coincide con "${sel}". Clases del flujo: ${clases(flujo)}`);
  for (const n of ns) {
    const origen = flujo[n].inputs[ent]; if (origen === undefined) fallar(`puentes: ${n} (${flujo[n].class_type}) no tiene la entrada "${ent}"; tiene: ${Object.keys(flujo[n].inputs).join(', ')}`);
    for (const i of ids(flujo)) for (const [e, v] of Object.entries(flujo[i].inputs)) if (esEnlace(v) && v[0] === n) flujo[i].inputs[e] = origen;     // un literal también vale
    delete flujo[n];
  }
  return ns;
}
// Nodos de salida: lo dice el servidor (output_node de /object_info/<clase>); sin servidor, por el nombre de la clase.
const _salida = new Map();
async function esSalida(clase) {
  if (!_salida.has(clase)) {
    let v = /^(Save|Preview|MaskPreview)/.test(clase);
    if (!sinServidor) { const r = await http('/object_info/' + encodeURIComponent(clase), undefined, true); if (r?.ok) { const j = await r.json(); if (j[clase]) v = !!j[clase].output_node; } }
    _salida.set(clase, v);
  }
  return _salida.get(clase);
}
// Deja solo lo que alimenta a algún nodo de salida: lo demás ni se valida ni se ejecuta, y así no figura entre los modelos usados.
async function podar(flujo) {
  const vivos = new Set(), cola = [];
  for (const i of ids(flujo)) if (await esSalida(flujo[i].class_type)) cola.push(i);
  if (!cola.length) fallar('El flujo no tiene ningún nodo de salida (SaveImage, SaveGLB, Save3DAdvanced...).');
  while (cola.length) { const i = cola.pop(); if (vivos.has(i) || !flujo[i]) continue; vivos.add(i); for (const v of Object.values(flujo[i].inputs)) if (esEnlace(v)) cola.push(v[0]); }
  const fuera = ids(flujo).filter(i => !vivos.has(i)); for (const i of fuera) delete flujo[i];
  for (const i of ids(flujo)) for (const [e, v] of Object.entries(flujo[i].inputs)) if (esEnlace(v) && !flujo[v[0]]) fallar(`El nodo ${i} (${flujo[i].class_type}) quedó con la entrada "${e}" enlazada a ${v[0]}, que no existe.`);
  return fuera;
}
// Dónde se escribe la indicación: desde cada nodo con entradas positive y negative enlazadas, hacia atrás por los enlaces de
// condicionamiento hasta un nodo con entrada de texto (prompt o text). Si ese texto viene de un Primitive, se escribe ahí.
function nodosDeTexto(flujo, rama) {
  const hallados = new Map();
  for (const s of ids(flujo)) {
    const inp = flujo[s].inputs; if (!esEnlace(inp.positive) || !esEnlace(inp.negative)) continue;
    const cola = [inp[rama][0]], visto = new Set();
    while (cola.length) {
      const i = cola.shift(); if (visto.has(i) || !flujo[i]) continue; visto.add(i);
      const e = flujo[i].inputs, campo = ['prompt', 'text'].find(c => Object.hasOwn(e, c));
      if (campo) { const d = esEnlace(e[campo]) ? [e[campo][0], 'value'] : [i, campo]; if (flujo[d[0]] && (d[1] !== 'value' || Object.hasOwn(flujo[d[0]].inputs, 'value'))) hallados.set(d.join('.'), d); continue; }
      for (const [n, v] of Object.entries(e)) if (esEnlace(v) && /cond|positive|negative/i.test(n)) cola.push(v[0]);
    }
  }
  return [...hallados.values()];
}
function fijarTexto(flujo, rama, texto) {
  const d = nodosDeTexto(flujo, rama);
  if (!d.length) fallar(`No encontré el nodo de texto de la rama ${rama} (ningún muestreador con positive y negative lleva a una entrada prompt o text). Ponerlo con "set".`);
  for (const [i, campo] of d) flujo[i].inputs[campo] = texto;
  return d.map(x => x.join('.'));
}
function fijarSemilla(flujo, semilla) {
  const hechos = [];
  for (const i of ids(flujo)) for (const ent of ['seed', 'noise_seed']) {
    if (!Object.hasOwn(flujo[i].inputs, ent)) continue; const v = flujo[i].inputs[ent];
    if (!esEnlace(v)) { flujo[i].inputs[ent] = semilla; hechos.push(`${i}.${ent}`); continue; }
    const o = flujo[v[0]];
    if (o && Object.hasOwn(o.inputs, 'value') && !esEnlace(o.inputs.value)) { o.inputs.value = semilla; hechos.push(`${v[0]}.value`); }
    else fallar(`La semilla de ${i} (${flujo[i].class_type}) viene del nodo ${v[0]} (${o?.class_type}) y no sé fijarla: usar "set".`);
  }
  return hechos;
}
const semillasDe = flujo => Object.fromEntries(ids(flujo).flatMap(i => ['seed', 'noise_seed'].filter(e => Object.hasOwn(flujo[i].inputs, e) && !esEnlace(flujo[i].inputs[e])).map(e => [`${i}.${e}`, flujo[i].inputs[e]])));
function listar(flujo) {
  for (const i of ids(flujo)) {
    const n = flujo[i], lit = [], enl = [];
    for (const [e, v] of Object.entries(n.inputs)) (esEnlace(v) ? enl : lit).push(esEnlace(v) ? `${e}<-${v[0]}[${v[1]}]` : `${e}=${JSON.stringify(v)?.slice(0, 70)}`);
    console.log(`${i.padEnd(9)} ${n.class_type.padEnd(34)} ${n._meta?.title && n._meta.title !== n.class_type ? '@' + n._meta.title + '  ' : ''}${lit.join('  ')}${enl.length ? '  |  ' + enl.join(' ') : ''}`);
  }
  console.log(`${ids(flujo).length} nodos · texto positivo en ${nodosDeTexto(flujo, 'positive').map(x => x.join('.')).join(', ') || '(no hay)'} · negativo en ${nodosDeTexto(flujo, 'negative').map(x => x.join('.')).join(', ') || '(no hay)'} · semillas ${JSON.stringify(semillasDe(flujo))}`);
}

// ---------- de plantilla o flujo de la interfaz a formato API (con el frontend de ComfyUI en un Chrome sin pantalla) ----------
async function convertir({ plantilla, flujo }) {
  const { chromium } = await import('playwright-core'), { launchOptions } = await import('./browser.mjs');
  const wf = flujo ? leerJson(flujo) : null, browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', e => console.log('[pageerror] ' + e.message.slice(0, 300)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // SUPUESTO: el frontend deja la aplicación en window.app (o window.comfyAPI.app.app) con graph, loadGraphData y graphToPrompt.
    await page.waitForFunction(() => { const a = window.app || window.comfyAPI?.app?.app; return !!(a && a.graph && a.loadGraphData && a.graphToPrompt); }, null, { timeout: 180000 });
    const r = await page.evaluate(async ({ plantilla, wf }) => {
      const app = window.app || window.comfyAPI.app.app;
      if (!wf) { const res = await fetch(`/templates/${plantilla}.json`); if (!res.ok) return { error: `GET /templates/${plantilla}.json -> HTTP ${res.status}` }; wf = await res.json(); }
      // SUPUESTO: firma loadGraphData(flujo, limpiar, restaurarVista, workflow, opciones); los avisos de nodos o modelos faltantes no tienen que bloquear.
      await app.loadGraphData(wf, true, false, null, { showMissingNodesDialog: false, showMissingModelsDialog: false });
      await new Promise(ok => setTimeout(ok, 1500));
      const p = await app.graphToPrompt(), tipos = window.LiteGraph?.registered_node_types;
      const faltan = tipos ? [...new Set(Object.values(p.output).map(n => n.class_type).filter(t => !tipos[t]))] : [];
      return { output: p.output, faltan };
    }, { plantilla, wf });
    if (r.error) fallar(r.error);
    if (!r.output || !Object.keys(r.output).length) fallar('graphToPrompt devolvió un flujo vacío (¿la plantilla usa nodos que esta instalación no tiene?).');
    if (r.faltan.length) console.log('AVISO clases que el frontend no conoce: ' + r.faltan.join(', '));
    return r.output;
  } finally { await browser.close(); }
}
async function cargarFlujo(plan) {
  if (plan.api) return leerJson(plan.api);
  if (!plan.plantilla && !plan.flujo) fallar('Falta de dónde sale el flujo: "plantilla", "flujo" o "api".');
  const nombre = plan.plantilla || path.basename(plan.flujo, '.json'), cache = path.join(DIR, nombre + '.api.json');
  if (fs.existsSync(cache) && !ARG.reconvertir) { console.log(`flujo ${nombre}: uso ${path.relative(ROOT, cache)} (--reconvertir lo vuelve a sacar del servidor)`); return JSON.parse(fs.readFileSync(cache, 'utf8')); }
  const out = await convertir(plan); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(out, null, 1));
  console.log(`flujo ${nombre}: ${Object.keys(out).length} nodos en formato API -> ${path.relative(ROOT, cache)}`); return out;
}

// ---------- modelos, imágenes y medición ----------
const ES_MODELO = /\.(safetensors|sft|ckpt|pt|pth|bin|gguf|onnx)$/i;
let _indice = null;
function indiceModelos() {
  if (_indice) return _indice; _indice = new Map();
  const andar = d => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) andar(f); else if (ES_MODELO.test(e.name)) _indice.set(e.name, f); } };
  andar(MODELOS); return _indice;
}
async function modelosDe(flujo) {
  const cacheF = path.join(DIR, 'sha256_modelos.json'); let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheF, 'utf8')); } catch {}
  const out = [];
  for (const i of ids(flujo)) for (const [e, v] of Object.entries(flujo[i].inputs)) {
    if (typeof v !== 'string' || !ES_MODELO.test(v)) continue;
    const m = { nodo: i, clase: flujo[i].class_type, entrada: e, archivo: v }, f = indiceModelos().get(path.basename(v));
    if (f) { const st = fs.statSync(f), k = `${f}|${st.size}|${Math.round(st.mtimeMs)}`; if (!cache[k]) { console.log(`   sha256 de ${path.basename(f)} (${(st.size / 1e9).toFixed(2)} GB)...`); cache[k] = await hashArchivo(f); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(cacheF, JSON.stringify(cache, null, 1)); } Object.assign(m, { ruta: f, bytes: st.size, sha256: cache[k] }); }
    else m.sha256 = null;      // el archivo no está en --modelos: queda anotado sin hash
    out.push(m);
  }
  return out;
}
async function subir(archivo) {
  if (!fs.existsSync(abs(archivo))) fallar(`No encuentro la imagen de entrada ${archivo}`);
  const buf = fs.readFileSync(abs(archivo)), h = sha256(buf), nombre = `arte_${h.slice(0, 12)}_${path.basename(archivo)}`, info = { ruta: archivo, sha256: h, bytes: buf.length, subida: nombre };
  if (SECO) return info;
  const fd = new FormData(); fd.append('image', new Blob([buf]), nombre); fd.append('type', 'input'); fd.append('overwrite', 'true');
  const r = await http('/upload/image', { method: 'POST', body: fd }); if (!r.ok) fallar(`POST /upload/image (${archivo}) -> HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json(); info.subida = j.subfolder ? `${j.subfolder}/${j.name}` : j.name; return info;
}
// VRAM pico de la placa mientras corre el trabajo (toda la placa: si hay un render de Blender a la vez, lo cuenta).
function medirVram() {
  let pico = null, p = null;
  try { p = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-l', '1'], { stdio: ['ignore', 'pipe', 'ignore'] }); p.on('error', () => {}); p.stdout.on('data', d => { for (const l of String(d).split('\n')) { const v = parseInt(l, 10); if (Number.isFinite(v)) pico = Math.max(pico ?? 0, v); } }); } catch {}
  return () => { try { p?.kill(); } catch {} return pico; };
}

// ---------- un trabajo ----------
async function armar(base, plan, t) {
  const flujo = structuredClone(base), nota = { imagenes: [] };
  for (const [id, nodo] of Object.entries({ ...plan.agregar, ...t.agregar })) { if (flujo[id]) fallar(`agregar: ya existe un nodo con id "${id}"`); flujo[id] = structuredClone(nodo); flujo[id].inputs ??= {}; }
  for (const sel of [...(plan.quitar || []), ...(t.quitar || [])]) quitar(flujo, sel);
  for (const [sel, ent] of Object.entries({ ...plan.puentes, ...t.puentes })) puentear(flujo, sel, ent);
  for (const [k, v] of Object.entries(plan.fijos || {})) fijar(flujo, k, v);
  const im = t.imagenes ?? plan.imagenes;
  if (Array.isArray(im)) {
    const cargas = elegir(flujo, 'LoadImage');
    if (cargas.length !== im.length) fallar(`"imagenes" trae ${im.length} y el flujo tiene ${cargas.length} LoadImage (${cargas.join(', ')}): sacar los que sobran con "quitar" o usar un mapa selector -> archivo.`);
    for (let k = 0; k < im.length; k++) { const s = await subir(im[k]); flujo[cargas[k]].inputs.image = s.subida; nota.imagenes.push({ nodo: cargas[k], ...s }); }
  } else if (im) for (const [sel, archivo] of Object.entries(im)) { const ns = elegir(flujo, sel); if (!ns.length) fallar(`imagenes: ningún nodo coincide con "${sel}"`); const s = await subir(archivo); for (const n of ns) { flujo[n].inputs.image = s.subida; nota.imagenes.push({ nodo: n, ...s }); } }
  if (t.indicacion !== undefined) nota.texto_positivo = fijarTexto(flujo, 'positive', t.indicacion);
  if (t.negativa !== undefined) nota.texto_negativo = fijarTexto(flujo, 'negative', t.negativa);
  for (const [k, v] of Object.entries(t.set || {})) fijar(flujo, k, v);
  const semilla = ARG.semilla !== undefined ? Number(ARG.semilla) : t.semilla;
  if (semilla !== undefined) { if (!Number.isSafeInteger(semilla) || semilla < 0) fallar(`Semilla inválida: ${semilla}`); nota.semillas_fijadas = fijarSemilla(flujo, semilla); if (!nota.semillas_fijadas.length) fallar('El flujo no tiene ninguna entrada seed ni noise_seed.'); }
  nota.semilla = semilla ?? null; nota.podados = await podar(flujo);
  // Prefijo propio por corrida: identifica los archivos y evita que la caché de ComfyUI devuelva una corrida sin salidas.
  nota.prefijo = `arte/${path.basename(t.salida, path.extname(t.salida))}_${Date.now()}`;
  for (const i of ids(flujo)) if (Object.hasOwn(flujo[i].inputs, 'filename_prefix') && !esEnlace(flujo[i].inputs.filename_prefix)) flujo[i].inputs.filename_prefix = nota.prefijo;
  return { flujo, nota };
}
async function correr(base, plan, t) {
  if (!t.salida || !path.extname(t.salida)) fallar('Cada trabajo necesita "salida" con extensión (.png, .glb...).');
  const t0 = Date.now(), { flujo, nota } = await armar(base, plan, t), salida = abs(t.salida), ext = path.extname(salida).toLowerCase();
  if (SECO) { console.log(`--- ${t.salida} (en seco: no se manda) · semillas ${JSON.stringify(semillasDe(flujo))} · podados ${nota.podados.length}`); listar(flujo); return true; }
  const modelos = await modelosDe(flujo), sistema = await getJson('/system_stats'), fin = medirVram();
  const r = await http('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: flujo, client_id: CLIENTE }) }), j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.prompt_id) { fin(); console.log(`FALLA ${t.salida}: POST /prompt -> HTTP ${r.status} ${JSON.stringify(j.error || j).slice(0, 600)}`); for (const [n, e] of Object.entries(j.node_errors || {})) console.log(`   nodo ${n} (${e.class_type}): ${JSON.stringify(e.errors).slice(0, 500)}`); return false; }
  const tope = Number(ARG.espera || 3600) * 1000; let h = null;
  for (;;) { await dormir(1000); h = (await getJson('/history/' + j.prompt_id))[j.prompt_id]; if (h?.status?.completed || h?.status?.status_str === 'error') break; if (Date.now() - t0 > tope) { fin(); await http('/interrupt', { method: 'POST' }, true); console.log(`FALLA ${t.salida}: pasaron ${tope / 1000} s sin terminar; se interrumpió`); return false; } }
  const vram = fin(), seg = (Date.now() - t0) / 1000;
  if (h.status?.status_str === 'error') { const m = (h.status.messages || []).filter(x => /error|interrupt/i.test(x[0])).map(x => `${x[0]}: nodo ${x[1]?.node_id} (${x[1]?.node_type}) ${String(x[1]?.exception_message || '').slice(0, 400)}`); console.log(`FALLA ${t.salida}: ${m.join(' | ') || JSON.stringify(h.status).slice(0, 600)}`); return false; }
  // archivos: toda lista con `filename` de las salidas del historial; si no hay ninguno de tipo output, se busca por el prefijo en output/
  let arch = []; for (const [nodo, o] of Object.entries(h.outputs || {})) for (const [clave, lista] of Object.entries(o || {})) if (Array.isArray(lista)) for (const x of lista) if (x && typeof x === 'object' && x.filename) arch.push({ nodo, clave, filename: x.filename, subfolder: x.subfolder || '', type: x.type || 'output' });
  if (!arch.some(a => a.type === 'output')) { const d = path.join(SALIDAS, path.dirname(nota.prefijo)), p = path.basename(nota.prefijo); let fs_ = []; try { fs_ = fs.readdirSync(d).filter(f => f.startsWith(p)); } catch {} arch.push(...fs_.map(f => ({ nodo: null, clave: 'carpeta', filename: f, subfolder: path.dirname(nota.prefijo), type: 'output', local: path.join(d, f) }))); }
  if (!ARG.todo) arch = arch.filter(a => a.type === 'output');
  if (!arch.length) { console.log(`FALLA ${t.salida}: el flujo terminó sin dejar archivos (claves del historial: ${JSON.stringify(Object.fromEntries(Object.entries(h.outputs || {}).map(([n, o]) => [n, Object.keys(o || {})])))})`); return false; }
  arch.sort((a, b) => (path.extname(b.filename).toLowerCase() === ext) - (path.extname(a.filename).toLowerCase() === ext));
  fs.mkdirSync(path.dirname(salida), { recursive: true }); const guardados = [];
  for (let k = 0; k < arch.length; k++) {
    const a = arch[k]; let buf;
    if (a.local) buf = fs.readFileSync(a.local); else { const v = await http(`/view?filename=${encodeURIComponent(a.filename)}&subfolder=${encodeURIComponent(a.subfolder)}&type=${a.type}`); if (!v.ok) fallar(`GET /view ${a.filename} -> HTTP ${v.status}`); buf = Buffer.from(await v.arrayBuffer()); }
    const dest = k === 0 ? salida : `${salida.slice(0, -ext.length)}__${a.nodo ?? 'x'}_${k}${path.extname(a.filename)}`; fs.writeFileSync(dest, buf);
    guardados.push({ archivo: path.relative(ROOT, dest), sha256: sha256(buf), bytes: buf.length, nodo: a.nodo, clave: a.clave, en_comfy: `${a.type}/${a.subfolder ? a.subfolder + '/' : ''}${a.filename}` });
  }
  if (path.extname(guardados[0].en_comfy).toLowerCase() !== ext) console.log(`AVISO ${t.salida}: la salida principal del flujo es ${path.extname(guardados[0].en_comfy)}, no ${ext}`);
  const meta = { salida: t.salida, sha256: guardados[0].sha256, bytes: guardados[0].bytes, fecha: new Date().toISOString(), indicacion: t.indicacion ?? null, negativa: t.negativa ?? null, semilla: nota.semilla, semillas: semillasDe(flujo),
    origen: plan.api ? { api: plan.api } : plan.flujo ? { flujo: plan.flujo } : { plantilla: plan.plantilla }, parametros: { quitar: [...(plan.quitar || []), ...(t.quitar || [])], puentes: { ...plan.puentes, ...t.puentes }, fijos: plan.fijos || {}, set: t.set || {} },
    imagenes: nota.imagenes, modelos, texto_positivo_en: nota.texto_positivo || [], texto_negativo_en: nota.texto_negativo || [], archivos: guardados, segundos: +seg.toFixed(1), vram_pico_mib: vram, prompt_id: j.prompt_id,
    comfyui: { version: sistema.system?.comfyui_version, python: sistema.system?.python_version, pytorch: sistema.system?.pytorch_version, dispositivo: sistema.devices?.[0]?.name, paquetes: sistema.system?.comfy_package_versions }, flujo_api: flujo };
  fs.writeFileSync(salida + '.json', JSON.stringify(meta, null, 1));
  const csv = path.join(DIR, 'corridas.csv'); fs.mkdirSync(DIR, { recursive: true }); if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'fecha,salida,origen,semilla,segundos,vram_pico_mib,bytes,sha256\n');
  fs.appendFileSync(csv, [meta.fecha, t.salida, plan.api || plan.flujo || plan.plantilla, nota.semilla ?? '', meta.segundos, vram ?? '', meta.bytes, meta.sha256].join(',') + '\n');
  console.log(`OK ${t.salida} · ${meta.segundos} s · VRAM pico ${vram ?? '?'} MiB · semilla ${nota.semilla ?? '(la de la plantilla)'} · ${guardados.length} archivo(s) · ${modelos.length} modelo(s) con sha256`); return true;
}

// ---------- sonda: lo que el plan da por existente ----------
async function sonda() {
  const s = await getJson('/system_stats'), d = s.devices?.[0];
  console.log(`ComfyUI ${s.system?.comfyui_version} · Python ${String(s.system?.python_version).split(' ')[0]} · PyTorch ${s.system?.pytorch_version} · ${d?.name} · VRAM libre ${d ? (d.vram_free / 2 ** 30).toFixed(1) : '?'} de ${d ? (d.vram_total / 2 ** 30).toFixed(1) : '?'} GiB`);
  const q = await getJson('/queue'); console.log(`cola: ${q.queue_running?.length ?? '?'} corriendo, ${q.queue_pending?.length ?? '?'} esperando`);
  let falta = 0;
  for (const c of ['LoadImage', 'SaveImage', 'KSampler', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'TextEncodeQwenImageEditPlus', 'FluxKontextImageScale', 'ComfySwitchNode', 'CLIPVisionLoader', 'Pixal3DConditioning', 'Pixal3DMultiViewConditioning', 'Trellis2Conditioning', 'Trellis2ShapeStage', 'VaeDecodeShapeTrellis', 'MeshToFile3D', 'Save3DAdvanced', 'SaveGLB', 'DecimateMesh']) {
    const r = await http('/object_info/' + c), j = r.ok ? await r.json() : {}, i = j[c]?.input;
    if (i) console.log(`nodo OK    ${c}(${Object.keys(i.required || {}).join(', ')}${i.optional && Object.keys(i.optional).length ? '; ' + Object.keys(i.optional).join(', ') : ''})${j[c].output_node ? '  [salida]' : ''}`); else { falta++; console.log(`nodo FALTA ${c}`); }
  }
  for (const p of ['image_qwen_image_edit_2511_int8', '3d_pixal3d_multi_views', '3d_pixal3d_trellis2_image_to_model']) { const r = await http(`/templates/${p}.json`); if (!r.ok) falta++; console.log(`plantilla ${r.ok ? 'OK   ' : 'FALTA'} ${p}`); }
  for (const [c, ent] of [['UNETLoader', 'unet_name'], ['CLIPLoader', 'clip_name'], ['VAELoader', 'vae_name'], ['CLIPVisionLoader', 'clip_name'], ['LoraLoaderModelOnly', 'lora_name']]) {
    const r = await http('/object_info/' + c), j = r.ok ? await r.json() : {}, v = j[c]?.input?.required?.[ent]?.[0]; console.log(`archivos ${c}.${ent}: ${Array.isArray(v) ? v.join(', ') || '(ninguno)' : JSON.stringify(j[c]?.input?.required?.[ent])?.slice(0, 200)}`);
  }
  if (falta) fallar(`faltan ${falta} cosas que el plan da por existentes`);
}

// ---------- principal ----------
if (ARG.sonda) await sonda();
else if (ARG.listar || ARG.exportar) {
  const f = await cargarFlujo({ plantilla: ARG.plantilla, flujo: ARG.flujo, api: ARG.api });
  if (ARG.exportar) { fs.mkdirSync(path.dirname(abs(ARG.exportar)), { recursive: true }); fs.writeFileSync(abs(ARG.exportar), JSON.stringify(f, null, 1)); console.log('flujo en formato API -> ' + ARG.exportar); }
  if (ARG.listar) listar(f);
} else if (ARG.trabajos) {
  const plan = leerJson(ARG.trabajos); if (!Array.isArray(plan.trabajos) || !plan.trabajos.length) fallar(`${ARG.trabajos} no trae "trabajos"`);
  const solo = ARG.solo ? String(ARG.solo).split(',') : null, lista = plan.trabajos.filter(t => !solo || solo.includes(path.basename(String(t.salida), path.extname(String(t.salida)))));
  if (!lista.length) fallar(`--solo=${ARG.solo} no coincide con ninguna salida de ${ARG.trabajos}`);
  const base = await cargarFlujo(plan); let mal = 0;
  for (const t of lista) if (!(await correr(base, plan, t))) mal++;
  if (ARG.liberar && !SECO) await http('/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }, true);
  console.log(`${lista.length - mal} de ${lista.length} trabajos bien`); if (mal) process.exit(1);
} else fallar('Falta qué hacer: --sonda, --listar, --exportar=<archivo> o --trabajos=<archivo>. El uso está en la cabecera de tools/comfy_run.mjs.');
