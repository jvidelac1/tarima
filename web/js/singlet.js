import * as T from 'three';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const gauss = (v, w) => Math.exp((-v * v) / (w * w));

// Fit stretch fabric to the coarse torso envelope before adding creases.
// Average radii by angular and vertical band so dense nipple and navel loops
// do not dominate the fit. This bridges small anatomical recesses.
function torsoEnvelope(position, hip, neck, scale) {
  const angles = 48,
    rows = 48,
    minY = hip - 0.045 * scale,
    maxY = neck - 0.065 * scale;
  const bins = new Float32Array(rows * angles),
    counts = new Uint16Array(rows * angles);
  const at = (row, col) => row * angles + (((col % angles) + angles) % angles);
  const coord = (x, y, z) => [
    clamp((y - minY) / (maxY - minY), 0, 0.999) * rows,
    (Math.atan2(x, z - 0.024 * scale) / (2 * Math.PI) + 0.5) * angles,
  ];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    if (y < minY || y > maxY || Math.abs(x) > 0.194 * scale) continue;
    const [r, c] = coord(x, y, z),
      k = at(Math.floor(r), Math.floor(c));
    bins[k] += Math.hypot(x, z - 0.024 * scale);
    counts[k]++;
  }
  const smoothed = new Float32Array(bins.length);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < angles; c++) {
      let sum = 0,
        w = 0;
      for (let dr = -4; dr <= 4; dr++)
        for (let dc = -3; dc <= 3; dc++) {
          if (r + dr < 0 || r + dr >= rows) continue;
          const i = at(r + dr, c + dc);
          if (!counts[i]) continue;
          const k = Math.exp(-0.13 * dr * dr - 0.27 * dc * dc);
          sum += (k * bins[i]) / counts[i];
          w += k;
        }
      smoothed[at(r, c)] = w ? sum / w : 0;
    }
  return (x, y, z) => {
    if (y < minY || y > maxY || Math.abs(x) > 0.193 * scale) return 0;
    const [r, c] = coord(x, y, z),
      i = Math.min(rows - 2, Math.floor(r)),
      j = Math.floor(c);
    const lo = T.MathUtils.lerp(smoothed[at(i, j)], smoothed[at(i, j + 1)], c - j);
    const hi = T.MathUtils.lerp(smoothed[at(i + 1, j)], smoothed[at(i + 1, j + 1)], c - j);
    const radius = T.MathUtils.lerp(lo, hi, clamp(r - i));
    if (radius < 0.044) return 0;
    const fade =
      clamp((y - minY) / 0.055) *
      clamp((maxY - y) / 0.055) *
      clamp((0.194 * scale - Math.abs(x)) / 0.034);
    return clamp(radius - Math.hypot(x, z - 0.024 * scale), -0.012, 0.018) * fade;
  };
}

export function cutShader(lm) {
  const k = lm.sh[0] / 0.213,
    sh = lm.sh,
    top = lm.neck[2] + 0.029 * k,
    hem = lm.hemz - 0.012;
  const f = (n) => n.toFixed(7);
  return `float fabricCut(vec3 v){
    float depth=mix(.105,.188,clamp((v.z+.015)/.065,0.,1.))*${f(k)};
    float collar=(length(vec2(abs(v.x)/${f(0.083 * k)},(v.y-${f(top)})/depth))-1.)*${f(0.09 * k)};
    float arm=(length(vec2((abs(v.x)-${f(sh[0] + 0.031 * k)})/${f(sh[0] - 0.09 * k)},(v.y-${f(sh[2] + 0.04 * k)})/${f(0.202 * k)}))-1.)*${f(0.11 * k)};
    return min(min(v.y-${f(hem)},${f(top)}-v.y),min(min(collar,arm),${f(0.238 * k)}-abs(v.x)));
  }`;
}

// Cut the garment from the athlete's rest surface. Boundary intersections
// interpolate the original skin weights and corrective shapes at the cut.
export function tailorSinglet(body, lm, tall, textile, sleeves = false) {
  const src = body.geometry,
    p = src.attributes.position,
    normal = src.attributes.normal;
  const hem = lm.hemz - 0.012,
    neck = lm.neck[2],
    sh = lm.sh,
    hip = lm.hip[2];
  const scale = sh[0] / 0.213,
    top = neck + 0.029 * scale,
    band = 0.009 * scale;
  const envelope = sleeves ? null : torsoEnvelope(p, hip, neck, scale);
  const sd = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(p.getX(i)),
      y = p.getY(i),
      z = p.getZ(i);
    const neckDepth = (0.105 + 0.083 * clamp((z + 0.015) / 0.065)) * scale;
    const scoop = (Math.hypot(x / (0.083 * scale), (y - top) / neckDepth) - 1) * 0.09 * scale;
    const arm =
      (Math.hypot(
        (x - (sh[0] + 0.031 * scale)) / (sh[0] - 0.09 * scale),
        (y - sh[2] - 0.04 * scale) / (0.202 * scale)
      ) -
        1) *
      0.11 *
      scale;
    // A higher front panel covers the patella. Cut the rear lower to keep
    // the upper cuff out of the crease when the knee closes.
    const kneeFront = T.MathUtils.smoothstep(z + lm.knee[1], -.055, .08);
    const cuffTop = lm.knee[2] + .106 + .022 * scale * kneeFront;
    const cuffBottom = lm.knee[2] - .116 - .008 * scale * (1 - kneeFront);
    sd[i] = sleeves
      ? Math.min(y - cuffBottom, cuffTop - y)
      : Math.min(y - hem, top - y, scoop, arm, 0.238 * scale - x);
  }
  const vertices = [],
    index = [],
    byKey = new Map(),
    border = [];
  function vertex(a, b, t, edge = false) {
    if (a > b) {
      [a, b] = [b, a];
      t = 1 - t;
    }
    const key = a + ',' + b;
    if (byKey.has(key)) return byKey.get(key);
    const id = vertices.length;
    vertices.push({ a, b, t, edge, wall: false });
    byKey.set(key, id);
    return id;
  }
  const indices = src.index.array,
    limit = src.userData.lod?.full[1] ?? indices.length;
  for (let j = 0; j < limit; j += 3) {
    const tri = [indices[j], indices[j + 1], indices[j + 2]];
    if (tri.every((k) => sd[k] < 0)) continue;
    const poly = [],
      cut = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k],
        b = tri[(k + 1) % 3];
      if (sd[a] >= 0) poly.push(vertex(a, a, 0));
      if (sd[a] >= 0 !== sd[b] >= 0) {
        const v = vertex(a, b, sd[a] / (sd[a] - sd[b]), true);
        poly.push(v);
        cut.push(v);
      }
    }
    for (let k = 1; k < poly.length - 1; k++) index.push(poly[0], poly[k], poly[k + 1]);
    if (cut.length === 2) border.push(cut);
  }
  const back = new Map();
  function rim(i) {
    if (!back.has(i)) {
      back.set(i, vertices.length);
      vertices.push({ ...vertices[i], wall: true });
    }
    return back.get(i);
  }
  // La pared de grosor del borde va solo en las rodilleras (neopreno grueso). En la malla quedaba de canto bajo la sisa: con el
  // brazo arriba el cuerpo estira esa zona varias veces y la pared, del color oscuro del ribete, se veía como dientes de sierra.
  // La tela fina va de una sola capa (el material es de dos caras).
  if (sleeves) for (const [a, b] of border) index.push(a, b, rim(a), b, rim(b), rim(a));
  const g = new T.BufferGeometry();
  g.setIndex(index);
  function remap(attr) {
    const n = attr.itemSize,
      buf = new Float32Array(vertices.length * n);
    vertices.forEach(({ a, b, t }, i) => {
      for (let j = 0; j < n; j++)
        buf[n * i + j] = T.MathUtils.lerp(attr.getComponent(a, j), attr.getComponent(b, j), t);
    });
    return new T.BufferAttribute(buf, n);
  }
  const pos = remap(p),
    norm = remap(normal);
  g.setAttribute('cutPosition', pos.clone());
  g.setAttribute('position', pos);
  g.setAttribute('normal', norm);
  g.setAttribute('uv', remap(src.attributes.uv));
  const ids = new Uint16Array(vertices.length * 4),
    weights = new Float32Array(vertices.length * 4);
  const pattern = new Float32Array(vertices.length * 3),
    fold = new Float32Array(vertices.length * 3);
  const compression = new Float32Array(vertices.length * 3),
    settle = new Float32Array(vertices.length * 3);
  const posVec = new T.Vector3(),
    nv = new T.Vector3();
  vertices.forEach(({ a, b, t, edge, wall }, i) => {
    const influences = new Map();
    for (const [v, u] of [
      [a, 1 - t],
      [b, t],
    ])
      for (let k = 0; k < 4; k++) {
        const bone = src.attributes.skinIndex.getComponent(v, k),
          w = src.attributes.skinWeight.getComponent(v, k) * u;
        if (w > 0) influences.set(bone, (influences.get(bone) || 0) + w);
      }
    const sorted = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4),
      sum = sorted.reduce((s, x) => s + x[1], 0);
    sorted.forEach(([bone, w], k) => {
      ids[i * 4 + k] = bone;
      weights[i * 4 + k] = w / sum;
    });
    posVec.fromBufferAttribute(pos, i);
    nv.fromBufferAttribute(norm, i).normalize();
    const { x, y, z } = posVec,
      ax = Math.abs(x),
      h = (y - hip) / (neck - hip),
      d = edge ? 0 : sd[a];
    const flank = clamp((ax - 0.035) / 0.12);
    const bias = 0.36 * x + 0.12 * z + 0.009 * Math.sin(x * 27 + z * 36);
    const abdominal = gauss(h - 0.39, 0.23),
      leg = gauss(y - hem - 0.065, 0.054);
    const ridge = (v) => Math.exp(-v * v);
    // A small number of folds terminate at the side panels and at the belt.
    let pleat = 0;
    for (const [height, slope, amp] of [
      [0.22, 0.65, 0.004],
      [0.33, -0.38, 0.0045],
      [0.47, 0.5, 0.003],
    ]) {
      const dy = (h - height) * (neck - hip) + bias * slope;
      pleat += amp * ridge(dy / (0.008 * scale)) * (0.35 + 0.65 * flank);
    }
    // Short tension fold where the armhole pulls on the front panel.
    const axillary = gauss(ax - .13 * scale, .052 * scale) * clamp(z / (.089 * scale));
    pleat += .0033 * scale * axillary * gauss(h - .64 - .74 * ax / scale, .016);
    const binding = 0.0026 * ridge((d - band * 0.44) / (0.004 * scale));
    const kneeFold = 0.0017 * gauss(z + 0.042, 0.041) * Math.cos((y - lm.knee[2]) * 145);
    const fit = envelope ? envelope(x, y, z) * clamp(d / 0.025) : 0;
    const cuffTension = T.MathUtils.smoothstep(d, 0, .016 * scale);
    const clearance = sleeves
      ? 0.0012 + cuffTension * (0.0012 + 0.32 * kneeFold) + 0.16 * binding
      : 0.004 + fit * (1 - 0.65 * gauss(h - .73, .17)) + 0.005 * abdominal + 0.0021 * leg + binding + pleat;
    posVec.addScaledVector(nv, wall ? 0.0004 : clearance);
    if (!sleeves) {
      // Under tension the front panel spans the inguinal crease. Taper
      // towards the inseam so each leg can still move independently.
      const belowHip = (hip - y) / scale;
      const gusset = gauss(belowHip - 0.084, 0.072) * gauss(ax, 0.076 * scale);
      const facing = clamp((z / scale + 0.003) / 0.062);
      const bridge = clamp(0.113 * scale - z, 0, 0.047 * scale);
      posVec.z += gusset * facing * bridge;
      posVec.y -= gusset * facing * 0.008 * scale;
      const foldLine = belowHip - (0.092 - 0.48 * ax / scale);
      const hipCrease = gauss(ax - 0.085 * scale, 0.059 * scale) * facing;
      posVec.z += 0.0035 * scale * hipCrease * gauss(foldLine, 0.01);
    }
    pos.setXYZ(i, posVec.x, posVec.y, posVec.z);
    // The free portion settles into the hip crease; the binding stays fixed.
    const slack = sleeves ? 0 : (abdominal * flank + 0.6 * leg) * clamp(d / 0.022);
    fold[i * 3] = nv.x * (pleat + 0.0015) * slack;
    fold[i * 3 + 1] = nv.y * pleat * slack - 0.0055 * slack;
    fold[i * 3 + 2] = nv.z * (pleat + 0.003) * slack;
    const inset = clamp(d / 0.017),
      rear = clamp(-z / 0.065),
      front = clamp(z / 0.08);
    // Thin fabric concertinas at the hip flexor and bunches above the belt.
    // Neoprene folds behind the knee while its patella panel stays in tension.
    const hipFold = gauss(y - hip - 0.025 - 0.17 * ax, 0.075) * (0.4 + 0.6 * front);
    const waistFold = gauss(h - 0.33, 0.16) * (0.25 + 0.75 * flank);
    const crush = sleeves
      ? 0.0015 * rear * gauss(y - lm.knee[2], 0.064) * Math.sin((y - lm.knee[2]) * 192 + 0.4)
      : 0.0058 *
        (hipFold * Math.sin(168 * (y - 0.3 * ax)) +
          waistFold * Math.sin(158 * (y + 0.19 * x + 0.14 * z)));
    compression.set([nv.x * crush * inset, nv.y * crush * inset, nv.z * crush * inset], i * 3);
    const free = inset * (sleeves ? 0 : abdominal * (0.2 + 0.8 * flank));
    settle.set([nv.x * 0.002 * free, -0.004 * free, -0.006 * free], i * 3);
    pattern.set([x / scale, h, d / scale], i * 3);
  });
  // Original UV islands may duplicate a row of vertices down the sternum.
  // Stitch their physical positions while retaining independent UVs and rim faces.
  const seams = new Map(),
    seamGroups = [];
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i],
      base = g.attributes.cutPosition;
    const key =
      [base.getX(i), base.getY(i), base.getZ(i)].map((n) => Math.round(n * 15000)).join('/') +
      '/' +
      Number(v.wall);
    const first = seams.get(key);
    if (first === undefined) seams.set(key, i);
    else if (typeof first === 'number') {
      const group = [first, i];
      seams.set(key, group);
      seamGroups.push(group);
    } else first.push(i);
  }
  function stitch(attr) {
    for (const group of seamGroups) {
      let x = 0,
        y = 0,
        z = 0;
      for (const i of group) {
        x += attr.getX(i);
        y += attr.getY(i);
        z += attr.getZ(i);
      }
      for (const i of group) attr.setXYZ(i, x / group.length, y / group.length, z / group.length);
    }
  }
  stitch(pos);
  // Recompute the lighting normal from the sewn surface so the ridges cast
  // highlights. Preserve the original normals at UV seams and cut edges.
  g.computeVertexNormals();
  const adjusted = g.attributes.normal;
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (v.edge || v.wall) {
      // El borde cortado y su pared de grosor conservan la normal del cuerpo (la de `norm`). computeVertexNormals les dejaba
      // la de las caras de la pared, de canto: con el brazo arriba esos triángulos se estiran y se veían como dientes oscuros.
      nv.fromBufferAttribute(norm, i).normalize();
      adjusted.setXYZ(i, nv.x, nv.y, nv.z);
      continue;
    }
    nv.fromBufferAttribute(adjusted, i);
    const original = posVec.fromBufferAttribute(normal, v.a);
    if (nv.dot(original) < 0.8) nv.lerp(original, 0.75).normalize();
    adjusted.setXYZ(i, nv.x, nv.y, nv.z);
  }
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(ids, 4));
  g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  g.setAttribute('pattern', new T.Float32BufferAttribute(pattern, 3));
  g.morphTargetsRelative = true;
  // Only actual body deformations can reach the fabric.
  const channels = Object.entries(body.morphTargetDictionary).filter(
    ([k]) => !['openJaw', 'brace', 'relief', 'disappointment', 'elbowL', 'elbowR'].includes(k)
  );
  g.morphAttributes.position = channels.map(([name, i]) => {
    const a = remap(src.morphAttributes.position[i]);
    a.name = name;
    return a;
  });
  for (const [name, data] of [
    ['drape', fold],
    ['compression', compression],
    ['settle', settle],
  ]) {
    const shape = new T.Float32BufferAttribute(data, 3);
    shape.name = name;
    g.morphAttributes.position.push(shape);
  }
  g.morphAttributes.position.forEach(stitch);
  const mat = new T.MeshPhysicalMaterial({
    name: sleeves ? 'KneeSleeves' : 'Singlet',
    color: 0xffffff,
    roughness: sleeves ? 0.94 : 0.89,
    metalness: 0,
    map: textile.color,
    normalMap: textile.normal,
    roughnessMap: textile.rough,
    normalScale: new T.Vector2(sleeves ? 0.4 : 0.52, sleeves ? 0.4 : 0.52),
    sheen: sleeves ? 0.12 : 0.35,
    sheenColor: sleeves ? 0x39404b : 0x777b83,
    sheenRoughness: 0.86,
    side: T.DoubleSide,
  });
  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 256;
  badgeCanvas.height = 128;
  const ink = badgeCanvas.getContext('2d');
  ink.fillStyle = '#fff';
  ink.font = 'italic 800 85px sans-serif';
  ink.textAlign = 'center';
  ink.fillText(tall ? 'NVK' : 'ARX', 128, 94);
  const badge = new T.CanvasTexture(badgeCanvas);
  // `kit`: color del equipo (lo fija el juego con Athlete#setKit); las franjas salen de él, sin banderas de países reales
  mat.userData.skin = { clubBadge: { value: badge }, kit: { value: new T.Color(tall ? 0x4a3a8c : 0xb0331f) } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.clubBadge = mat.userData.skin.clubBadge;
    s.uniforms.kit = mat.userData.skin.kit;
    s.vertexShader =
      'attribute vec3 cutPosition; attribute vec3 pattern; varying vec3 sewing; varying vec3 clothP;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n sewing=pattern; clothP=cutPosition;'
      );
    s.fragmentShader =
      cutShader(lm) +
      '\n' +
      'uniform sampler2D clubBadge; uniform vec3 kit; varying vec3 sewing; varying vec3 clothP;\n' +
      s.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      float x=sewing.x,h=sewing.y,d=sewing.z,panel=abs(x);
      ${sleeves ? '' : `d=fabricCut(clothP)/${scale.toFixed(6)};`}
      vec3 navy=vec3(.013,.021,.029);
      vec3 fabric=navy;
      ${
        tall
          ? `vec3 claro=mix(kit,vec3(.59,.60,.57),.62);
      fabric=mix(navy,kit*.42,smoothstep(.14,.66,h));
      float tape=abs(panel-(.116+.030*clamp(h,0.,1.)));
      fabric=mix(fabric,claro,1.-smoothstep(.004,.0055,tape));`
          : `float cut=h-.48*x;
      vec3 claro=mix(kit,vec3(.59,.60,.57),.62);
      fabric=mix(navy,kit*.38,smoothstep(.27,.277,cut));
      fabric=mix(fabric,kit,smoothstep(.42,.427,cut));
      fabric=mix(fabric,claro,smoothstep(.56,.567,cut));
      fabric=mix(fabric,navy,smoothstep(.114,.153,panel));`
      }
      float flatlock=1.-smoothstep(.0009,.0024,abs(panel-(.118+.016*sin(h*3.))));
      float stitch=.55+.45*sin(clothP.y*2500.)*(1.-smoothstep(.5,2.4,fwidth(clothP.y)*2500.));
      fabric*=1.+.22*flatlock*stitch;
      fabric=mix(navy*.82,fabric,smoothstep(.005,.007,d));
      float hemStitch=1.-smoothstep(.0006,.0016,abs(d-.008));
      fabric+=vec3(.047)*hemStitch*stitch;
      vec2 yarn=vec2(x+clothP.z*.42,clothP.y)*vec2(3900.,3100.);
      vec2 gain=1.-smoothstep(vec2(.4),vec2(2.5),fwidth(yarn));
      fabric*=1.+.052*gain.x*sin(yarn.x)+.035*gain.y*sin(yarn.y);
      ${
        sleeves
          ? `
        float kneeLevel=(clothP.y-${lm.knee[2].toFixed(6)})/${scale.toFixed(6)};
        float offset=abs(abs(clothP.x)-${lm.knee[0].toFixed(6)})/${scale.toFixed(6)};
        float seam=offset-(.052+.018*exp(-kneeLevel*kneeLevel/.004356));
        float anterior=smoothstep(-.015,.052,clothP.z+${lm.knee[1].toFixed(6)});
        vec3 neoprene=mix(vec3(.016,.020,.026),vec3(.026,.032,.040),anterior*(1.-smoothstep(-.003,.003,seam)));
        float thread=1.-smoothstep(.0006,.0018,abs(seam));
        fabric=neoprene + vec3(.020,.019,.019)*anterior*thread*stitch;
        fabric*=.73+.27*smoothstep(.004,.008,d);
        fabric+=vec3(.024,.024,.024)*(1.-smoothstep(.0006,.0015,abs(d-.006)))*stitch;`
          : `
        vec2 uvBadge=vec2((x-.067)/.075+.5,(h-.76)/.071+.5);
        if(clothP.z>.068 && all(greaterThan(uvBadge,vec2(0.))) && all(lessThan(uvBadge,vec2(1.)))){
          float glyph=texture2D(clubBadge,uvBadge).a;
          fabric=mix(fabric,${tall ? 'claro' : 'vec3(.023,.040,.045)'},glyph*.86);
        }`
      }
      float yarnLight=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/.49,.57,1.35);
      diffuseColor.rgb=fabric*yarnLight;`
      );
  };
  mat.customProgramCacheKey = () => 'competition-kit-' + tall + '-' + sleeves;
  const suit = new T.SkinnedMesh(g, mat);
  suit.name = sleeves ? 'Rodilleras' : 'Maillot';
  suit.bind(body.skeleton, body.bindMatrix);
  suit.frustumCulled = false;
  suit.castShadow = true;
  suit.receiveShadow = true;
  suit.userData.cutDepth = sd;
  body.parent.add(suit);
  return suit;
}

// Keep the full surface for anatomy and contact measurements. Remove only
// index triples hidden well inside a garment, from both draw ranges.
export function cullCoveredSkin(athlete) {
  const g = athlete.body.geometry,
    idx = g.index.array;
  const layers = [athlete.suit, athlete.sleeves].map((m) => m.userData.cutDepth);
  const lod = g.userData.lod,
    ranges = lod ? [lod.full, lod.low] : [[0, idx.length]],
    kept = [];
  const compact = ranges.map(([start, count]) => {
    const from = kept.length;
    for (let j = start; j < start + count; j += 3) {
      if (layers.some((d) => Math.min(d[idx[j]], d[idx[j + 1]], d[idx[j + 2]]) > 0.013)) continue;
      kept.push(idx[j], idx[j + 1], idx[j + 2]);
    }
    return [from, kept.length - from];
  });
  g.setIndex(kept);
  g.setDrawRange(...compact[0]);
  if (lod) {
    [lod.full, lod.low] = compact;
    const entry = athlete.lods.find((l) => l.geo === g);
    if (entry) {
      entry.full = lod.full;
      entry.low = lod.low;
    }
  }
  for (const m of [athlete.suit, athlete.sleeves]) delete m.userData.cutDepth;
}
