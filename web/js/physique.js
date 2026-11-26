import * as T from 'three';

const bell = (x, center, width) => Math.exp(-((x - center) ** 2) / (width * width));
const sat = (x) => Math.max(0, Math.min(1, x));

// Derive normal deltas from the change in triangle area vectors. Unaffected
// faces keep their exported normal, including the normals across UV seams.
function shapeNormals(geometry, delta, reference) {
  const position = geometry.attributes.position.array,
    normal = geometry.attributes.normal.array;
  const ix = geometry.index.array,
    limit = geometry.userData.lod?.full[1] ?? ix.length;
  const sums = new Float32Array(position.length);
  // Cada forma mueve una zona chica del cuerpo: se marca qué vértices mueve y los triángulos que no tocan ninguno se saltean
  // con tres lecturas, antes de calcular nada (da lo mismo: esos triángulos no cambiaban su normal).
  let moved = null;
  if (delta) {
    moved = new Uint8Array(position.length / 3);
    for (let j = 0, k = 0; j < delta.length; j += 3, k++) if (delta[j] || delta[j + 1] || delta[j + 2]) moved[k] = 1;
  }
  for (let i = 0; i < limit; i += 3) {
    if (moved && !(moved[ix[i]] | moved[ix[i + 1]] | moved[ix[i + 2]])) continue;
    const a = ix[i] * 3,
      b = ix[i + 1] * 3,
      c = ix[i + 2] * 3;
    const ux = position[b] - position[a],
      uy = position[b + 1] - position[a + 1],
      uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a],
      vy = position[c + 1] - position[a + 1],
      vz = position[c + 2] - position[a + 2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    if (delta) {
      const dx = delta[b] - delta[a],
        dy = delta[b + 1] - delta[a + 1],
        dz = delta[b + 2] - delta[a + 2];
      const ex = delta[c] - delta[a],
        ey = delta[c + 1] - delta[a + 1],
        ez = delta[c + 2] - delta[a + 2];
      if (!(dx || dy || dz || ex || ey || ez)) continue;
      nx = (uy + dy) * (vz + ez) - (uz + dz) * (vy + ey) - nx;
      ny = (uz + dz) * (vx + ex) - (ux + dx) * (vz + ez) - ny;
      nz = (ux + dx) * (vy + ey) - (uy + dy) * (vx + ex) - nz;
    }
    // sin armar un arreglo por triángulo (corre una vez por forma sobre toda la malla)
    sums[a] += nx; sums[a + 1] += ny; sums[a + 2] += nz;
    sums[b] += nx; sums[b + 1] += ny; sums[b + 2] += nz;
    sums[c] += nx; sums[c + 1] += ny; sums[c + 2] += nz;
  }
  if (!delta) return sums;
  for (let j = 0; j < sums.length; j += 3) {
    // un vértice al que ningún triángulo le cambió el área conserva su normal (la diferencia es cero): no se calcula nada
    if (!(sums[j] || sums[j + 1] || sums[j + 2])) continue;
    const rx = reference[j], ry = reference[j + 1], rz = reference[j + 2], area = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (area < 1e-9) continue;
    const x = normal[j] + sums[j] / area,
      y = normal[j + 1] + sums[j + 1] / area,
      z = normal[j + 2] + sums[j + 2] / area;
    const scale = 1 / Math.max(0.001, Math.sqrt(x * x + y * y + z * z));
    sums[j] = x * scale - normal[j];
    sums[j + 1] = y * scale - normal[j + 1];
    sums[j + 2] = z * scale - normal[j + 2];
  }
  return sums;
}

// Each displacement is relative to the athlete's own skeleton. Muscle bellies
// expand across the bone, tapering to zero at the origins and insertions.
export function sculptAthlete(mesh, lm) {
  const g = mesh.geometry,
    pos = g.attributes.position,
    norm = g.attributes.normal;
  const skin = g.attributes.skinIndex,
    weight = g.attributes.skinWeight;
  const bones = mesh.skeleton.bones,
    joints = new Map();
  bones.forEach((bone, i) =>
    joints.set(bone.name.replace(/^mixamorig:?/, ''), {
      i,
      p: new T.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert()),
    })
  );
  const muscles = new Map();
  for (const side of ['Left', 'Right']) {
    for (const [from, to, amplitude, peak] of [
      ['Arm', 'ForeArm', 0.007, 0.48],
      ['ForeArm', 'Hand', 0.0036, 0.3],
      ['UpLeg', 'Leg', 0.003, 0.47],
      ['Leg', 'Foot', 0.0048, 0.34],
    ]) {
      const a = joints.get(side + from),
        b = joints.get(side + to);
      const axis = b.p.clone().sub(a.p),
        length = axis.length();
      axis.normalize();
      muscles.set(a.i, { a: a.p, axis, length, amplitude, peak, leg: from === 'UpLeg', segment: from });
    }
  }
  // Anchor the proximal upper-arm skin to the humerus as it leaves the
  // axillary fold. A long tail of clavicle/spine weights pulled this skin
  // sideways on elevation and left a hollow between the shoulder and biceps.
  const shoulderBones = new Set(['LeftShoulder', 'RightShoulder', 'Spine', 'Spine1', 'Spine2']
    .map(name => joints.get(name).i));
  const offset = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 4; k++) {
      const m = muscles.get(skin.getComponent(i, k));
      if (m?.segment !== 'Arm') continue;
      const original = weight.getComponent(i, k);
      offset.fromBufferAttribute(pos, i).sub(m.a);
      const u = offset.dot(m.axis) / m.length;
      const anchoring = T.MathUtils.smoothstep(u, .06, .36) *
        T.MathUtils.smoothstep(original, .10, .56);
      if (!anchoring) continue;
      let moved = 0;
      for (let j = 0; j < 4; j++) {
        if (!shoulderBones.has(skin.getComponent(i, j))) continue;
        const value = weight.getComponent(i, j), share = anchoring * value;
        weight.setComponent(i, j, value - share);
        moved += share;
      }
      weight.setComponent(i, k, original + moved);
    }
  }
  weight.needsUpdate = true;
  const originalAreas = shapeNormals(g);
  const surfaceDelta = new Float32Array(pos.count * 3);
  const trunkBones = new Set(['Hips', 'Spine', 'Spine1', 'Spine2'].map(name => joints.get(name).i));
  const channels = [
    'pump',
    'breath',
    'openJaw',
    'bladeTurnL',
    'bladeTurnR',
    'bladeSlideL',
    'bladeSlideR',
    'brace',
    'relief',
    'disappointment',
    'scapulaL',
    'scapulaR',
    'armLevelL',
    'armLevelR',
    'elbowL',
    'elbowR',
  ];
  const deltas = Object.fromEntries(channels.map((key) => [key, new Float32Array(pos.count * 3)]));
  const p = new T.Vector3(),
    n = new T.Vector3(),
    radial = new T.Vector3();
  const torso = lm.neck[2] - lm.hip[2],
    eye = lm.eye[2],
    lip = lm.lip[2];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(norm, i);
    const x = p.x,
      y = p.y,
      z = p.z,
      ax = Math.abs(x),
      j = i * 3;
    let pump = 0,
      contour = 0, lateral = 0, vertical = 0, depth = 0, trunkWeight = 0;
    for (let k = 0; k < 4; k++) {
      const index = skin.getComponent(i, k);
      if (trunkBones.has(index)) trunkWeight += weight.getComponent(i, k);
      const m = muscles.get(index);
      if (!m) continue;
      const w = weight.getComponent(i, k);
      if (w <= 0) continue;
      radial.copy(p).sub(m.a);
      const along = radial.dot(m.axis),
        u = along / m.length;
      if (u <= 0 || u >= 1) continue;
      radial.addScaledVector(m.axis, -along).normalize();
      const insert = Math.sin(Math.PI * u),
        facing = Math.max(0, radial.dot(n));
      const peak = m.peak + (m.leg ? 0.09 : -0.07) * radial.z;
      const belly = w * m.amplitude * bell(u, peak, 0.27) * insert * facing;
      // Separate deltoid, biceps and triceps lobes; quads peak at different
      // distances on the inner and outer thigh. Leave a narrow distal tendon.
      const medial = -Math.sign(p.x) * radial.x,
        posterior = -radial.z;
      if (m.segment === 'Arm') {
        contour -= w * (0.007 * bell(u, 0.32, 0.31) + 0.002 * bell(u, 0.63, 0.24)) * insert;
        contour +=
          w *
          insert *
          (-0.008 * bell(u, 0.22, 0.18) * Math.max(0, -medial) +
            -0.004 * bell(u, 0.55, 0.22) * Math.max(0, posterior));
        // Restore the mid-arm belly under the shorter shoulder cap. The
        // brachialis carries width towards the elbow, then narrows at the joint.
        const sagittal = radial.z * radial.z;
        contour += w * insert * (
          .007 * (1 - sagittal) * bell(u, .49, .24) +
          .011 * sagittal * bell(u, .29, .16) -
          .015 * sagittal * bell(u, .63, .205)
        );
        pump += w * insert * 0.004 * bell(u, 0.51, 0.19) * Math.max(0, radial.z);
      } else if (m.segment === 'ForeArm') {
        contour -= w * 0.0085 * bell(u, 0.38, 0.31) * insert;
      } else if (m.segment === 'UpLeg') {
        // Keep fullness high on the outer thigh. The medial head ends lower
        // and further forward, meeting the narrower quadriceps tendon.
        const taper = bell(u, 0.56, 0.32) * insert;
        lateral -= w * radial.x * (0.030 * taper - 0.009 * bell(u, 0.17, 0.15));
        depth -= w * radial.z * 0.012 * taper;
        contour += w * insert * (0.003 * bell(u, 0.74, 0.17) * Math.max(0, medial + radial.z)
          + 0.003 * bell(u, 0.28, 0.25) * Math.max(0, -medial));
        pump += w * insert * 0.002 * bell(u, 0.62, 0.23) * Math.max(0, radial.z);
      } else if (m.segment === 'Leg') {
        lateral += w * radial.x * insert *
          (0.006 * bell(u, 0.26, 0.17) - 0.008 * bell(u, 0.52, 0.19));
        contour +=
          w *
          insert *
          (0.007 * bell(u, 0.3 + 0.07 * medial, 0.2) * Math.max(0, posterior) -
            0.003 * bell(u, 0.8, 0.13));
      }
      pump += belly;
      contour += belly * (0.36 + 0.45 * radial.z) - 0.0015 * w * bell(u, 0.82, 0.14);
    }
    const h = (y - lm.hip[2]) / torso;
    const trunk = sat((0.235 - ax) / 0.065) * bell(h, 0.5, 0.37);
    // A soft abdominal wall and a broad rib cage under the pectoral insertions.
    contour += trunk * (0.005 * bell(h, 0.32, 0.24) + 0.008 * bell(h, 0.72, 0.19) * Math.max(0, n.z));
    const front = Math.max(0, n.z),
      rear = Math.max(0, -n.z);
    contour +=
      trunk *
      (0.006 * bell(h, 0.7, 0.14) * bell(ax, 0.082, 0.064) * front -
        0.003 * bell(ax, 0, 0.016) * bell(h, 0.67, 0.18) * front +
        0.006 * bell(h, 0.52, 0.28) * bell(ax, 0.14, 0.065) * rear);
    const softness = bell(h, 0.18, 0.22) * bell(ax, 0.07, 0.12) * front;
    contour += 0.007 * softness + trunk * 0.0018 * Math.sin(17 * x + 4 * y);
    // A continuous flank runs from the rib cage across the iliac crest to
    // the greater trochanter. Keep this change off the arms and belt line.
    const hip = bell(y, lm.hip[2] - 0.005, 0.103) * sat((ax - 0.075) / 0.073) * sat((0.30 - ax) / 0.07);
    const lat = trunkWeight * bell(h, 0.69, 0.24) * sat((ax - 0.083) / 0.083);
    lateral += Math.sign(x) * (0.025 * hip - 0.023 * lat);
    // Carry the rib cage into the anterior axillary fold. Flatten the
    // forward chest dome, keeping the lower border of each pectoral distinct.
    const ribs = trunkWeight * bell(h, .61, .25) * sat((ax - .045) / .105);
    const scale = lm.sh[0] / .213;
    // The pectorals span the anterior ribs from the sternum towards the
    // humerus. Fit the front to a broad rib ellipse across that whole span.
    const thorax = T.MathUtils.smoothstep(h, .38, .59) * (1 - T.MathUtils.smoothstep(h, .85, 1.02));
    const sternum = scale * (.134 + .012 * (h - .56));
    const ribFront = sternum - .038 * scale * (ax / (.16 * scale)) ** 2;
    const anterior = trunkWeight * thorax * sat((z - .034 * scale) / (.06 * scale));
    depth -= .95 * anterior * Math.max(0, z + n.z * contour - ribFront);
    // The latissimus narrows towards the posterior axillary fold and
    // spreads diagonally towards the lumbar spine.
    const backSide = sat((.022 - z) / .08);
    const latBand = bell(ax, scale * (.065 + .115 * h), .064 * scale) * bell(h, .61, .25);
    lateral += Math.sign(x) * (.021 * ribs - .014 * trunkWeight * backSide * latBand);
    depth += .011 * trunkWeight * backSide * latBand;
    // The acromion defines the shoulder tip. Blend the deltoid cap into
    // the upper arm without moving the shoulder pivot or the grip.
    const capHeight = y - lm.sh[2];
    const outerCap = bell(ax, lm.sh[0] + .037, .065) * bell(capHeight, .005, .081);
    lateral -= Math.sign(x) * .019 * outerCap;
    vertical -= .013 * outerCap * sat((n.y + .12) / .85);
    depth -= .008 * outerCap * front;
    // The exported body already includes a raised neoprene band. Remove
    // its baked thickness before cutting the fitted shell from this surface.
    const kneeY = y - lm.knee[2];
    const sleeve = T.MathUtils.smoothstep(kneeY, -.116, -.108) *
      (1 - T.MathUtils.smoothstep(kneeY, .098, .106));
    const cuff = bell(kneeY, -.106, .013) + bell(kneeY, .096, .013);
    contour -= sleeve * (.0042 + .0024 * cuff);
    surfaceDelta[j] = lateral + contour * n.x;
    surfaceDelta[j + 1] = vertical + contour * n.y;
    surfaceDelta[j + 2] = depth + contour * n.z;
    const beltCompression = bell(y, lm.hip[2] + .195 * lm.sh[0] / .213, .052);
    const chest = trunk * (0.007 + 0.006 * front) * (1 - .72 * beltCompression);
    for (let c = 0; c < 3; c++) {
      deltas.pump[j + c] = n.getComponent(c) * pump;
      deltas.breath[j + c] = n.getComponent(c) * chest;
    }
    const suffix = x > 0 ? 'L' : 'R';
    const scap = deltas['scapula' + suffix],
      elbow = deltas['elbow' + suffix];
    const back = bell(z, -0.073, 0.066),
      blade = bell(ax, 0.111, 0.06) * bell(y, lm.sh[2] - 0.092, 0.091) * back;
    const cap = bell(ax, lm.sh[0] - 0.006, 0.058) * bell(y, lm.sh[2] - 0.025, 0.067);
    const pit = bell(ax, 0.171, 0.037) * bell(y, lm.sh[2] - 0.097, 0.057);
    // For protraction the blade glides forward and around the outer rib
    // cage. A negative influence brings it back towards the spine.
    const turn=deltas['bladeTurn'+suffix];
    const lowerBlade=bell(y,lm.sh[2]-.135,.078)*bell(ax,.104,.062)*back;
    turn[j]=Math.sign(x)*(.017*lowerBlade-.003*blade);
    turn[j+1]=.009*blade+.004*lowerBlade;
    turn[j+2]=-.004*lowerBlade;
    deltas['bladeSlide' + suffix][j] = Math.sign(x) * (.014*blade + .004*pit);
    deltas['bladeSlide' + suffix][j+1] = .002*blade;
    deltas['bladeSlide' + suffix][j+2] = .009*blade + .005*pit;
    scap[j] = Math.sign(x) * (0.005 * blade + 0.003 * cap + 0.004 * pit);
    scap[j + 1] = 0.009 * blade + 0.0045 * cap + 0.004 * pit;
    scap[j + 2] = -0.003 * blade + 0.001 * cap;
    for (let k = 0; k < 4; k++) {
      const m = muscles.get(skin.getComponent(i, k));
      if (m?.segment !== 'Arm') continue;
      const w = weight.getComponent(i, k);
      radial.copy(p).sub(m.a);
      const along = radial.dot(m.axis),
        u = along / m.length;
      if (u <= 0 || u >= 1) continue;
      radial.addScaledVector(m.axis, -along).normalize();
      // Elevation already opens the axilla in the skinned mesh. Redistribute
      // the extra cap volume along the arm instead of swelling the deltoid.
      const capWeight = w * bell(u, .29, .18) * Math.sin(Math.PI * u);
      const level = deltas['armLevel' + suffix];
      for (let c = 0; c < 3; c++) {
        const normalOffset = radial.getComponent(c) * capWeight;
        scap[j + c] -= .009 * normalOffset;
        level[j + c] = -.0085 * normalOffset;
      }
      const anterior = Math.max(0, radial.z),
        posterior = Math.max(0, -radial.z);
      const shortened =
        0.009 * bell(u, 0.45, 0.2) * anterior -
        0.003 * bell(u, 0.72, 0.16) * anterior -
        0.002 * bell(u, 0.53, 0.23) * posterior;
      const shift = -0.004 * bell(u, 0.59, 0.19) * anterior;
      for (let c = 0; c < 3; c++)
        elbow[j + c] += w * (n.getComponent(c) * shortened + m.axis.getComponent(c) * shift);
    }
    if (y < lip - 0.07 || z < 0.075) continue;
    const faceFront = sat((z - 0.075) / 0.035);
    const brow = bell(ax, 0.027, 0.022) * bell(y, eye + 0.017, 0.011) * faceFront;
    const cheek = bell(ax, 0.044, 0.021) * bell(y, lip + 0.023, 0.025) * faceFront;
    const lipCorner = bell(ax, 0.023, 0.015) * bell(y, lip, 0.01) * faceFront;
    const jaw = bell(x, 0, 0.041) * bell(y, lip - 0.014, 0.018) * faceFront;
    const eyelid = bell(ax, lm.eye[0], 0.015) * bell(y, eye + 0.005, 0.005) * faceFront;
    const mandible = bell(ax, 0, .052) * bell(y, lip - .027, .035) *
      (1 - T.MathUtils.smoothstep(y, lip - .005, lip + .001)) * faceFront;
    deltas.openJaw[j + 1] = -.010 * mandible;
    deltas.openJaw[j + 2] = -.003 * mandible;
    deltas.brace[j] = -Math.sign(x) * brow * 0.004;
    deltas.brace[j + 1] = -0.0065 * brow - 0.003 * eyelid + 0.0045 * cheek - 0.0048 * jaw;
    deltas.brace[j + 2] = 0.002 * jaw + 0.0015 * cheek;
    deltas.relief[j] = Math.sign(x) * lipCorner * 0.004;
    deltas.relief[j + 1] = lipCorner * 0.007 + 0.003 * cheek + 0.0018 * brow;
    deltas.disappointment[j + 1] =
      -0.006 * lipCorner - 0.003 * cheek + 0.003 * brow * bell(ax, 0.012, 0.018);
  }
  // GLTFLoader gives the geometry relative corrective targets. Keep their
  // indices, including the joint corrections evaluated by Athlete._blend.
  const normalDelta = shapeNormals(g, surfaceDelta, originalAreas);
  for (let j = 0; j < surfaceDelta.length; j++) {
    pos.array[j] += surfaceDelta[j];
    norm.array[j] += normalDelta[j];
  }
  norm.needsUpdate = true;
  const reference = shapeNormals(g);
  for (const key of channels) {
    const attr = new T.Float32BufferAttribute(deltas[key], 3);
    attr.name = key;
    g.morphAttributes.position.push(attr);
    if (g.morphAttributes.normal) {
      const normals = new T.Float32BufferAttribute(shapeNormals(g, deltas[key], reference), 3);
      normals.name = key;
      g.morphAttributes.normal.push(normals);
    }
    mesh.morphTargetDictionary[key] = mesh.morphTargetInfluences.length;
    mesh.morphTargetInfluences.push(0);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
}
