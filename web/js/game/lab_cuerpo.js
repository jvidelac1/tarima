// Laboratorio del cuerpo por código: juego.html?banco=1&lab=cuerpo&plantel=kordan
// El pesista generado por código (game/cuerpo/) sobre la tarima, con la luz de la sala, en el esqueleto y las poses del
// pesista actual. Se gira arrastrando (ratón o dedo), zoom con rueda o pellizco; botones de vista y de pose, y «Comparar»
// pone al lado el modelo actual (el GLB de Blender). `&calidad=alta|media|movil` (la del juego), `&malla=alta|media|movil`
// (triángulos del cuerpo). Deja `window.BANCO_FOTOS` para `node tools/banco.mjs --fotos=dir --lab=cuerpo --plantel=kordan`.
import * as THREE from 'three';
import { PRESET } from './perf.js';
import { tramo } from './sequence.js';
import { CAPA_SOMBRA, conBorde } from './stage.js';
import { crearCuerpo } from './cuerpo/tres.js';

const POSES = [['De pie', 'clean', 'Parado'], ['Salida', 'clean', 'Salida'], ['Tirón', 'clean', 'Segundo tirón'], ['Sentadilla', 'snatch', 'Recepción'], ['Rack', 'clean', 'Recuperación'], ['Tijera', 'split', 'Envión · Tijera'], ['Sentadilla envión', 'squat', 'Squat jerk · Fondo'], ['Barra arriba', 'split', 'Envión · Final']];
const VISTAS = [['Frente', 0], ['3/4', 35], ['Perfil', 90], ['Espalda', 180]];

export async function laboratorioCuerpo(B, { escena, params, msg, decir }) {
  const tel = Math.min(innerWidth, innerHeight) < 600, clave = PRESET[params.get('calidad')] ? params.get('calidad') : (tel ? 'media' : 'alta');
  decir('cargando el esqueleto'); await escena.mostrar('ventura'); escena.setCarga(140, 'c'); msg.hidden = true;
  decir('compilando ' + clave); escena.setCalidad(PRESET[clave]); await escena.precalentar();
  const a = escena.activo, t0 = performance.now(); decir('generando el cuerpo');
  await new Promise(r => setTimeout(r, 30));
  const cuerpo = crearCuerpo(a, escena.scene, { calidad: params.get('malla') || (tel ? 'media' : 'alta') }), ms = Math.round(performance.now() - t0);
  cuerpo.malla.layers.enable(CAPA_SOMBRA); conBorde(cuerpo.malla.material);
  B.cuerpo = { ms, ...cuerpo.info }; console.log('cuerpo por código:', JSON.stringify(B.cuerpo));
  const actuales = [...a.meshes, a.hairDepth].filter(Boolean);
  if (escena.reflejo?.activo && params.get('fotos')) escena.reflejo.setActivo(false);
  for (const id of ['tv', 'capa', 'ayudas']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  // estado: pose, vista (órbita) y comparación
  const cam = escena.rig.camera, E = { pose: 0, giro: 35, alto: 8, dist: 5.2, comparar: false, solo: 'codigo', y: 1.0 }, mira = new THREE.Vector3();
  const posar = () => { const [, seg, fase] = POSES[E.pose], G = tramo(escena.P, seg), lev = seg === 'snatch' ? 's' : 'c'; escena.setCarga(140, lev); escena.posar({ seg: G.nombre, s: G.i(fase), tau: G.t(fase), base: G.base, primero: false }, lev, 0); escena.barbell.settle?.(escena.barY);
    const top = Math.max(1.8, escena.barY + .3); E.y = top / 2; E.distBase = Math.max(4.6, top * 2.45) * (innerHeight > innerWidth ? 1.25 : 1); };
  const modo = () => {
    const c = E.comparar, ver = c || E.solo === 'actual'; for (const o of actuales) o.visible = ver; cuerpo.malla.visible = c || E.solo === 'codigo';
    a.root.position.x = c ? .62 : 0; cuerpo.malla.position.x = c ? -1.24 : 0; a.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(); a.barWorld(v); escena.barbell.setPosition(v); escena.barbell.group.visible = !(c && false);
  };
  let sucio = 3;
  const dibujar = () => {
    const g = E.giro * Math.PI / 180, al = E.alto * Math.PI / 180, d = (E.distBase || 5) * E.dist / 5.2 * (E.comparar ? 1.25 : 1);
    mira.set(0, E.y, 0); cam.position.set(mira.x + Math.sin(g) * Math.cos(al) * d, mira.y + Math.sin(al) * d, mira.z + Math.cos(g) * Math.cos(al) * d); cam.fov = 26; cam.updateProjectionMatrix(); cam.lookAt(mira); cam.updateMatrixWorld();
    if (escena.post) { escena.post.focus = d; escena.post.cerca = .35; }
    escena.arena.update?.(.016, cam); escena.renderer.shadowMap.needsUpdate = true; escena._dibujar(.016);
  };
  const pedir = (n = 2) => { sucio = Math.max(sucio, n); };

  // interfaz: botones grandes abajo, sin tapar al pesista
  const ui = document.createElement('div'); ui.id = 'labcuerpo';
  ui.innerHTML = `<style>
#labcuerpo{position:fixed;left:0;right:0;bottom:0;z-index:60;padding:8px 8px calc(8px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;font:600 14px/1 system-ui,sans-serif;pointer-events:none}
#labcuerpo .f{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;pointer-events:none}
#labcuerpo button{pointer-events:auto;min-height:40px;padding:0 13px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(8,12,24,.72);color:#eef1fb;font:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#labcuerpo button.on{background:#e8ecf8;color:#0a0e1a;border-color:#e8ecf8}
#labcuerpo .nota{position:fixed;left:10px;top:calc(8px + env(safe-area-inset-top));color:#cfd5e8;font:500 12px/1.35 system-ui,sans-serif;background:rgba(8,12,24,.6);padding:6px 9px;border-radius:8px;pointer-events:none;max-width:70vw}
</style><div class="nota"></div><div class="f" data-g="pose"></div><div class="f" data-g="vista"></div>`;
  document.body.append(ui);
  const nota = ui.querySelector('.nota'), fp = ui.querySelector('[data-g=pose]'), fv = ui.querySelector('[data-g=vista]');
  const boton = (fila, txt, al) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.addEventListener('click', e => { e.stopPropagation(); al(); pintar(); pedir(3); }); fila.append(b); return b; };
  const bp = POSES.map(([n], i) => boton(fp, n, () => { E.pose = i; posar(); modo(); })), bv = VISTAS.map(([n, g]) => boton(fv, n, () => { E.giro = g; E.alto = 8; E.dist = 5.2; }));
  const bc = boton(fv, 'Comparar', () => { E.comparar = !E.comparar; modo(); }), bs = boton(fv, 'Ver el actual', () => { E.comparar = false; E.solo = E.solo === 'codigo' ? 'actual' : 'codigo'; modo(); });
  const pintar = () => { bp.forEach((b, i) => b.classList.toggle('on', i === E.pose)); bc.classList.toggle('on', E.comparar); bs.textContent = E.solo === 'codigo' ? 'Ver el actual' : 'Ver el nuevo'; bs.style.display = E.comparar ? 'none' : '';
    nota.textContent = (E.comparar ? 'Izquierda: por código · derecha: actual (Blender)' : E.solo === 'codigo' ? 'Cuerpo por código' : 'Modelo actual (Blender)') + ` · ${Math.round(cuerpo.info.triangulos / 1000)} mil triángulos, generado en ${ms} ms · arrastrar: girar · rueda o pellizco: zoom`; };

  // órbita con ratón o dedo; pellizco y rueda para el zoom
  const pts = new Map(); let pin = 0;
  const esUi = e => e.target && e.target.closest && e.target.closest('#labcuerpo button');
  addEventListener('pointerdown', e => { if (esUi(e)) return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [p, q] = [...pts.values()]; pin = Math.hypot(p[0] - q[0], p[1] - q[1]); } });
  addEventListener('pointermove', e => { const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { E.giro -= dx * .45; E.alto = Math.min(70, Math.max(-8, E.alto + dy * .3)); } else if (pts.size === 2) { const [a2, b2] = [...pts.values()], d = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]); if (pin > 0) E.dist = Math.min(9, Math.max(1.2, E.dist * pin / d)); pin = d; }
    pedir(); e.preventDefault(); }, { passive: false });
  const soltar = e => { pts.delete(e.pointerId); pin = 0; }; addEventListener('pointerup', soltar); addEventListener('pointercancel', soltar);
  addEventListener('wheel', e => { E.dist = Math.min(9, Math.max(1.2, E.dist * Math.exp(e.deltaY * .0012))); pedir(); e.preventDefault(); }, { passive: false });
  addEventListener('resize', () => { escena.resize?.(); posar(); pedir(3); });
  document.documentElement.style.touchAction = 'none'; document.body.style.touchAction = 'none';

  posar(); modo(); pintar();
  // fotos del banco: de pie en cuatro vistas y las posiciones clave, cada una con el cuerpo por código y con el actual
  const T = (n, pose, giro, extra = {}) => ['codigo', 'actual'].map(q => ({ nombre: `${n}_${q}`, pose, giro, solo: q, ...extra }));
  const tomas = [...T('pie-frente', 0, 0), ...T('pie-34', 0, 35), ...T('pie-perfil', 0, 90), ...T('pie-espalda', 0, 180),
    ...T('pos-salida', 1, 50), ...T('pos-tiron', 2, 90), ...T('pos-sentadilla-frente', 3, 0), ...T('pos-sentadilla-perfil', 3, 90), ...T('pos-rack', 4, 35), ...T('pos-tijera', 5, 90), ...T('pos-envion-fondo', 6, 0), ...T('pos-arriba-frente', 7, 0), ...T('pos-arriba-espalda', 7, 180),
    ...T('cerca-cabeza', 0, 25, { dist: 1.25, y: 1.56, alto: 4 }), ...T('cerca-torso', 0, 20, { dist: 2.6, y: 1.25, alto: 6 }), ...T('cerca-manos', 7, 15, { dist: 1.7, y: 2.0, alto: 0 }), ...T('cerca-piernas', 3, 30, { dist: 2.6, y: .5, alto: 10 }),
    { nombre: 'comparar_pie', pose: 0, giro: 25, comparar: true }, { nombre: 'comparar_arriba', pose: 7, giro: 25, comparar: true }];
  const fin = () => { try { escena.renderer.getContext().finish(); } catch { /* sin contexto */ } };
  window.BANCO_FOTOS = { lista: tomas.map(t => ({ nombre: t.nombre })), listo: true, opacidadSombra: null, opacidadCruda: null,
    async poner(i) { const t = tomas[i]; ui.style.display = 'none'; E.pose = t.pose; E.comparar = !!t.comparar; E.solo = t.solo || 'codigo'; E.giro = t.giro; E.alto = t.alto ?? 8; E.dist = t.dist ?? 5.2; posar(); if (t.y) E.y = t.y; if (t.dist) E.distBase = 5.2; modo(); dibujar(); dibujar(); fin(); return t.nombre; } };
  if (!params.get('fotos')) { const lazo = () => { if (sucio > 0) { sucio--; dibujar(); } requestAnimationFrame(lazo); }; requestAnimationFrame(lazo); }
  else { dibujar(); fin(); }
  B.etapa = 'laboratorio'; decir(''); document.querySelectorAll('body > div').forEach(d => { if (d.textContent.startsWith('Banco de medición')) d.style.display = 'none'; });
}
