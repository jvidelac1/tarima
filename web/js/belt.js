import * as T from 'three';

// Keep only waist triangles for the radial fitting pass. The belt and suit
// use the same mesh space, even when the animated rig has already been posed.
export function waistSurface(geometry, centerY) {
  const points = geometry.attributes.position, faces = geometry.index;
  const count = geometry.userData.lod?.full[1] ?? faces.count;
  const triangles = [];
  for (let i = 0; i < count; i += 3) {
    const ids = [faces.getX(i), faces.getX(i + 1), faces.getX(i + 2)];
    if (ids.every(id => points.getY(id) < centerY - .09) ||
        ids.every(id => points.getY(id) > centerY + .09)) continue;
    triangles.push({ ids, vertices: ids.map(id => new T.Vector3().fromBufferAttribute(points, id)) });
  }
  // El rayo es horizontal y sale del eje (0, y, .02): solo puede tocar los triángulos cuyo abanico de ángulos alrededor de ese
  // eje contiene el suyo. Se reparten en sectores para no probar todos con cada vértice del cinturón (da el mismo contacto).
  const SECTORES = 256, sector = (a) => Math.min(SECTORES - 1, Math.max(0, Math.floor((a + Math.PI) / (2 * Math.PI) * SECTORES)));
  const porSector = Array.from({ length: SECTORES }, () => []);
  for (const tri of triangles) {
    const A = tri.vertices.map(v => Math.atan2(v.x, v.z - .02)), lo = Math.min(...A), hi = Math.max(...A);
    const pone = (a, b) => { for (let k = Math.max(0, sector(a) - 1); k <= Math.min(SECTORES - 1, sector(b) + 1); k++) porSector[k].push(tri); };
    if (hi - lo > Math.PI) { pone(hi, Math.PI); pone(-Math.PI, lo); } else pone(lo, hi);      // el abanico cruza por detrás (±π)
  }
  const ray = new T.Ray(), hit = new T.Vector3();
  return (position) => {
    ray.origin.set(0, position.y, .02);
    ray.direction.copy(position).sub(ray.origin).normalize();
    let distance = Infinity, contact;
    for (const { ids, vertices } of porSector[sector(Math.atan2(position.x, position.z - .02))]) {
      if (!ray.intersectTriangle(...vertices, false, hit)) continue;
      const d = ray.origin.distanceTo(hit);
      if (d >= distance) continue;
      distance = d;
      contact = { distance, ids, weights: T.Triangle.getBarycoord(hit, ...vertices, new T.Vector3()).toArray() };
    }
    return contact;
  };
}

// Transfer the change from bare waist to finished suit onto the original
// leather profile. Each contact inherits the suit's joint and breathing weights.
// The buckle uses one contact for its whole frame so the metal stays rigid.
export function fitBelt(mesh, bareWaist, clothedWaist, suit) {
  const geometry = mesh.geometry, pos = geometry.attributes.position;
  const garment = suit.geometry, joints = garment.attributes.skinIndex, weights = garment.attributes.skinWeight;
  const rigid = mesh.material.name === 'BeltMetal';
  geometry.computeBoundingBox();
  const buckleCenter = geometry.boundingBox.getCenter(new T.Vector3());
  const targets = ['breath', 'drape', 'pump', 'compression', 'settle'];
  const shapes = targets.map(name => {
    const attr = new T.Float32BufferAttribute(new Float32Array(pos.count * 3), 3);
    attr.name = name;
    return attr;
  });
  const point = new T.Vector3(), displacement = new T.Vector3(), delta = new T.Vector3();
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    const anchor = rigid ? buckleCenter : point;
    const angle = Math.atan2(anchor.x, anchor.z - .02);
    const key = Math.round(angle * 10000) + '/' + Math.round(anchor.y * 20000);
    if (!cache.has(key)) {
      const bare = bareWaist(anchor), cloth = clothedWaist(anchor);
      if (!bare || !cloth) throw new Error('No se pudo ajustar el cinturón al maillot');
      const skin = new Map();
      cloth.ids.forEach((id, j) => {
        for (let k = 0; k < 4; k++) {
          const joint = joints.getComponent(id, k);
          skin.set(joint, (skin.get(joint) || 0) + weights.getComponent(id, k) * cloth.weights[j]);
        }
      });
      const binding = [...skin].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = binding.reduce((sum, pair) => sum + pair[1], 0);
      const morphs = targets.map(name => {
        const attr = garment.morphAttributes.position[suit.morphTargetDictionary[name]];
        const value = new T.Vector3();
        cloth.ids.forEach((id, j) => value.addScaledVector(delta.fromBufferAttribute(attr, id), cloth.weights[j]));
        return value;
      });
      cache.set(key, { gap: cloth.distance - bare.distance + .002, binding, total, morphs });
    }
    const { gap, binding, total, morphs } = cache.get(key);
    displacement.set(Math.sin(angle) * gap, 0, Math.cos(angle) * gap);
    point.add(displacement);
    pos.setXYZ(i, point.x, point.y, point.z);
    for (let k = 0; k < 4; k++) {
      geometry.attributes.skinIndex.setComponent(i, k, binding[k]?.[0] ?? 0);
      geometry.attributes.skinWeight.setComponent(i, k, (binding[k]?.[1] ?? 0) / total);
    }
    morphs.forEach((v, j) => shapes[j].setXYZ(i, v.x, v.y, v.z));
  }
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = shapes;
  mesh.updateMorphTargets();
  geometry.computeBoundingSphere();
}
