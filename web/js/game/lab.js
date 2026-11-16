// Laboratorio de materiales (Gráficos fase 3): juego.html?banco=1&lab=materiales. Una fila de esferas y paneles, uno por
// material, bajo la misma luz del juego (la escena de siempre, calidad «Alta»), con un deslizador de USO (de sala recién
// armada a final de jornada: magnesio, polvo y óxido; materiales.js). La piel y la tela se miran sobre el pesista, que
// queda detrás. Deja `window.BANCO_FOTOS` como las fotos del banco: `node tools/banco.mjs --fotos=dir --lab=materiales`.
import * as THREE from 'three';
import { PRESET } from './perf.js';
import { USO, chapa, conSuperficie } from './materiales.js';

export async function laboratorio(B, { escena, cargas, params, msg, decir }) {
  decir('cargando los modelos'); await Promise.all(cargas);
  await escena.mostrar('brenner'); escena.setCarga(140, 's'); msg.hidden = true;
  const clave = PRESET[params.get('calidad')] ? params.get('calidad') : 'alta';
  decir('compilando ' + clave); escena.setCalidad(PRESET[clave]); await escena.precalentar();
  const A = escena.arena, bar = escena.barbell, lk = escena.look, g = new THREE.Group(); g.name = 'Laboratorio'; escena.scene.add(g);
  const copia = (m, extra = {}) => { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; Object.assign(c, extra); return c; };
  const pintado = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c41f1b'), roughness: .62 }); conSuperficie(pintado, 'disco');
  // [nombre, material, metros de superficie por unidad de UV de su textura (x, y)]
  const lista = [
    ['madera', A.madera, 4, 4], ['goma', A.alfombra, 13, 11], ['moleteado', copia(bar.mat.knurl), 1, 1], ['cromo', bar.mat.chrome, 1, 1],
    ['disco', pintado, 1, 1], ['chapa', lk?.chapaMat || chapa(), 1, 1], ['chapa roja', chapa('#6e2a22', '#ffd9a8', .5), 1, 1], ['metal pintado', lk?.metalMat || bar.mat.dark, 1, 1],
  ];
  if (lista[2][1].normalMap) { lista[2][1].normalMap = lista[2][1].normalMap.clone(); lista[2][1].normalMap.repeat.set(40, 40); }
  const escalar = (geo, mx, my, lado) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, .4 + (uv.getX(i) - .5) * lado / mx, .55 + (uv.getY(i) - .5) * lado / my); return geo; };
  lista.forEach(([nombre, mat, mx, my], i) => {
    const x = (i - (lista.length - 1) / 2) * .5;
    const esfera = new THREE.Mesh(escalar(new THREE.SphereGeometry(.17, 48, 32), mx, my, .9), mat); esfera.position.set(x, .2, 1.45); esfera.castShadow = esfera.receiveShadow = true; esfera.layers.enable(2); g.add(esfera);
    const panel = new THREE.Mesh(escalar(new THREE.PlaneGeometry(.4, .4), mx, my, .4), mat); panel.position.set(x, .68, 1.2); panel.rotation.x = -.35; panel.receiveShadow = true; g.add(panel);
  });
  // deslizador de uso
  const caja = document.createElement('label'); caja.style.cssText = 'position:fixed;left:12px;top:12px;z-index:50;background:rgba(3,5,12,.82);color:#e8ecf8;font:13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:6px';
  caja.innerHTML = 'Uso (magnesio, polvo, óxido) <input type="range" min="0" max="1" step="0.01" style="vertical-align:middle;width:180px"> <span></span><br><small>' + lista.map(l => l[0]).join(' · ') + ' · detrás: piel y tela</small>';
  const rango = caja.querySelector('input'), valor = caja.querySelector('span'); document.body.append(caja);
  const cam = escena.rig.camera, mira = new THREE.Vector3();
  const VISTAS = { fila: [[0, 1.25, 4.3], [0, .5, 1.2], 30], cerca: [[-.6, .75, 2.5], [-.75, .4, 1.3], 30], cercaB: [[.9, .75, 2.5], [.75, .4, 1.3], 30], piel: [[.55, 1.25, 1.35], [0, 1.2, .05], 26], tela: [[.5, .8, 1.25], [0, .72, 0], 24] };
  let vista = 'fila';
  const dibujar = () => {
    const [p, t, fov] = VISTAS[vista]; cam.position.set(...p); mira.set(...t); cam.fov = fov; cam.updateProjectionMatrix(); cam.lookAt(mira); cam.updateMatrixWorld();
    escena.post.focus = cam.position.distanceTo(mira); escena.renderer.shadowMap.needsUpdate = true; escena.post.render(.016);
  };
  const poner = u => { USO.value = u; rango.value = u; valor.textContent = Math.round(u * 100) + ' %'; };
  rango.addEventListener('input', () => { poner(+rango.value); dibujar(); });
  escena.bucle(1.3, 0); for (let k = 0; k < 3; k++) escena.cuadro(k ? .016 : 5, true);
  const tomas = [['lab_fila-nuevo', 'fila', 0], ['lab_fila-usado', 'fila', 1], ['lab_cerca-nuevo', 'cerca', .1], ['lab_cerca-usado', 'cerca', 1], ['lab_chapa-nuevo', 'cercaB', 0], ['lab_chapa-usado', 'cercaB', 1], ['lab_piel', 'piel', .5], ['lab_tela', 'tela', .5]];
  window.BANCO_FOTOS = { lista: tomas.map(t => ({ nombre: t[0] })), listo: true, opacidadSombra: null, opacidadCruda: null,
    async poner(i) { const t = tomas[i]; vista = t[1]; g.visible = !/piel|tela/.test(vista); poner(t[2]); dibujar(); dibujar(); return t[0]; } };
  poner(.45); dibujar();
  if (!params.get('fotos')) { const lazo = () => { dibujar(); requestAnimationFrame(lazo); }; requestAnimationFrame(lazo); addEventListener('keydown', e => { const k = Object.keys(VISTAS)[+e.key - 1]; if (k) { vista = k; g.visible = !/piel|tela/.test(k); } }); }
  B.etapa = 'laboratorio'; decir('laboratorio de materiales (teclas 1 a 5: vistas)');
}
