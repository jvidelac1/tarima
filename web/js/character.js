import { fitFeet } from './feet.js';
import * as T from 'three';
import { applyPortrait } from './portrait.js';
import { fitBelt, waistSurface } from './belt.js';
import { sculptAthlete } from './physique.js';
import { tailorSinglet, cullCoveredSkin } from './singlet.js';
import { landmarks } from './landmarks.js';
import { Athlete, fitTexture, buildLod } from './athlete.js';

async function loadColor(file, options, flipY) {
  const url = new URL('../models/appearance/' + file, import.meta.url);
  const texture = await new T.TextureLoader().loadAsync(url.href);
  texture.colorSpace = T.SRGBColorSpace;
  texture.flipY = flipY;
  texture.anisotropy = options.aniso;
  return fitTexture(texture, options.maxTex);
}

let textilePromise;
function textileMaps(options) {
  if (!textilePromise) {
    const files = ['color', 'normal', 'roughness'];
    textilePromise = Promise.all(
      files.map(async (key) => {
        const texture = await loadColor('stretch-' + key + '.jpg', options, false);
        if (key !== 'color') texture.colorSpace = T.NoColorSpace;
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.repeat.set(7.1, 7.1);
        return texture;
      })
    )
      .then(([color, normal, rough]) => ({ color, normal, rough }))
      .catch((err) => {
        textilePromise = null;
        throw err;
      });
  }
  return textilePromise;
}
export async function createDigitalHuman(name, meta, options) {
  const [face, textile, feet, footSkin] = await Promise.all([
    loadColor(name + '-face.jpg', options, true),
    textileMaps(options),
    fetch(new URL('../models/barefoot/'+name+'.json',import.meta.url)).then(r=>{
      if(!r.ok) throw Error('No se pudieron cargar los pies de '+name);
      return r.json();
    }),
    new T.TextureLoader().loadAsync(new URL('../models/barefoot/'+name+'-skin.jpg',import.meta.url).href),
  ]);
  const athlete = await Athlete.load(name, meta, options);
  const beltCenter = landmarks[name].hip[2] + 0.195 * meta.h / 1.69;
  let body, bareWaist;
  athlete.belt = [];
  athlete.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const m = mesh.material;
    if (m.name === 'Body') {
      body = mesh;
      bareWaist = waistSurface(mesh.geometry, beltCenter);
      sculptAthlete(mesh, landmarks[name]);
      applyPortrait(m, face, name === 'brenner');
      m.userData.skin.portrait = { value: face };
      m.roughness = 0.77;
      m.metalness = 0;
      m.sheen = 0.22;
      m.sheenRoughness = 0.78;
      m.aoMapIntensity = 0.67;
      m.userData.skin.uSkinSat.value = 0.96;
      m.userData.skin.uSkinRough.value = 0.64;
      m.userData.skin.uSweat.value = 0.12;
      m.normalScale.multiplyScalar(0.64);
      m.envMapIntensity = 0.83;
      m.needsUpdate = true;
    }
    if (m.name === 'Eyes') {
      applyPortrait(m, face, name === 'brenner', true);
      m.roughness = 0.39;
      m.clearcoat = 0.21;
      m.envMapIntensity = 1.1;
    }
    if (m.name === 'Belt' || m.name === 'BeltMetal') athlete.belt.push(mesh);
    if (m.name === 'Belt') {
      m.roughness = 0.64;
      m.metalness = 0;
    }
    if (m.name === 'Hair') {
      const hook = m.onBeforeCompile;
      m.onBeforeCompile = (shader) => {
        hook(shader);
        shader.vertexShader =
          'varying vec3 hairAnchor;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n hairAnchor=position;'
          );
        shader.fragmentShader =
          'varying vec3 hairAnchor;\n' +
          shader.fragmentShader.replace(
            '#include <alphatest_fragment>',
            `float fadeLine=${name === 'brenner' ? '1.708' : '1.58'}+.085*smoothstep(-.014,.14,hairAnchor.z);
          diffuseColor.a*=.53*smoothstep(fadeLine,fadeLine+.012,hairAnchor.y);
          #include <alphatest_fragment>`
          );
      };
      m.customProgramCacheKey = () => 'buzzcut-' + name;
      m.needsUpdate = true;
    }
    if (['HairDepth', 'Lashes'].includes(m.name)) mesh.visible = false;
    if (m.name === 'BeltMetal') {
      m.metalness = 0.92;
      m.roughness = 0.33;
    }
  });
  athlete.body = body;
  athlete.suit = tailorSinglet(body, landmarks[name], name === 'brenner', textile);
  athlete.sleeves = tailorSinglet(body, landmarks[name], name === 'brenner', textile, true);
  const clothedWaist = waistSurface(athlete.suit.geometry, beltCenter);
  for (const mesh of athlete.belt) fitBelt(mesh, bareWaist, clothedWaist, athlete.suit);
  for (const garment of [athlete.suit, athlete.sleeves]) {
    athlete.meshes.push(garment);
    const lod = buildLod(garment, false, true);
    if (lod) athlete.lods.push({ geo: garment.geometry, name: garment.material.name, ...lod });
    // el índice trae el nivel completo y el simplificado seguidos: se dibuja solo el que corresponde (si no, los dos a la vez)
    if (lod) { const r = athlete.lod ? lod.low : lod.full; garment.geometry.setDrawRange(r[0], r[1]); }
  }
  /** Color del equipo en la malla (hex o color de three); null vuelve al del modelo. Lo usa el juego (stage.js, mostrar). */
  const kit0 = athlete.suit.material.userData.skin.kit.value.clone();
  athlete.setKit = (color) => { const k = athlete.suit.material.userData.skin.kit.value; if (color) k.set(color); else k.copy(kit0); };
  cullCoveredSkin(athlete);
  footSkin.colorSpace=T.SRGBColorSpace;
  footSkin.wrapS=footSkin.wrapT=T.RepeatWrapping;
  fitFeet(athlete,feet,landmarks[name],footSkin);
  Object.values(textile).forEach((map) => athlete.shared.add(map));
  athlete.root.updateMatrixWorld(true);
  const bones = athlete._byName;
  athlete.standingHipY = bones.get('Hips').getWorldPosition(new T.Vector3()).y;
  athlete.idleFeet = {};
  athlete.idleAnkleY = {};
  athlete.idleWrists = {};
  athlete.restHand = new Map();
  athlete.studyRest = new Map();
  athlete.idlePelvis = bones.get('Hips').getWorldQuaternion(new T.Quaternion());
  athlete.relaxedTrunk = new Map(
    ['Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder'].map((k) => [
      k,
      bones.get(k).quaternion.clone(),
    ])
  );
  athlete.idleHead = bones.get('Head').getWorldQuaternion(new T.Quaternion());
  for (const side of ['Left', 'Right']) {
    athlete.idleAnkleY[side] = bones.get(side + 'Foot').getWorldPosition(new T.Vector3()).y;
    athlete.idleFeet[side] = bones.get(side + 'Foot').getWorldQuaternion(new T.Quaternion());
    athlete.idleWrists[side] = bones.get(side + 'Hand').getWorldQuaternion(new T.Quaternion());
  }
  const sk = body.skeleton;
  const eye = landmarks[name].eye,
    head = bones.get('Head');
  athlete.faceLocal = new T.Vector3(0, eye[2] - 0.012, -eye[1] * 0.73).applyMatrix4(
    sk.boneInverses[sk.bones.indexOf(head)]
  );
  sk.bones.forEach((bone, i) => {
    const label = bone.name.replace(/^mixamorig:?/, '');
    if (!/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.test(label)) return;
    const parent = sk.bones.indexOf(bone.parent);
    const local = sk.boneInverses[parent].clone().multiply(sk.boneInverses[i].clone().invert());
    const q = new T.Quaternion().setFromRotationMatrix(local);
    athlete.studyRest.set(label, q);
    if (/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(label)) athlete.restHand.set(bone, q);
  });
  const position = body.geometry.attributes.position;
  const joints = body.geometry.attributes.skinIndex;
  const weight = body.geometry.attributes.skinWeight;
  const candidates = { seat: [], Left: [], Right: [] };
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i),
      z = position.getZ(i),
      x = position.getX(i);
    const hip = landmarks[name].hip[2];
    if (y > hip - 0.16 && y < hip + 0.07 && Math.abs(x) < 0.18) candidates.seat.push(i);
    for (let k = 0; k < 4; k++) {
      if (weight.getComponent(i, k) < 0.55) continue;
      const match = /^mixamorig:?(Left|Right)Hand/.exec(sk.bones[joints.getComponent(i, k)].name);
      if (match) candidates[match[1]].push(i);
    }
  }
  athlete.contacts = {};
  for (const [region, list] of Object.entries(candidates)) {
    const stride = Math.max(1, Math.floor(list.length / (region === 'seat' ? 550 : 420)));
    athlete.contacts[region] = list.filter((_, i) => i % stride === 0);
  }
  return athlete;
}
