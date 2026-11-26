import * as T from 'three';

// Swap the lower legs below a seam hidden inside the knee sleeves. Keep both
// index ranges so changing camera distance cannot bring the socks back.
export function fitFeet(a, data, lm, skin) {
  const body = a.body, g = body.geometry;
  const names = data.names.map(n => body.skeleton.bones.indexOf(a._byName.get(n)));
  const foot = new T.BufferGeometry();
  const p = new T.Float32BufferAttribute(data.position,3), normal = new T.Float32BufferAttribute(data.normal,3);
  const colors = [];
  const tone = new T.Color();
  for (let i=0;i<p.count;i++) {
    const y=p.getY(i);
    // The authored clip stands on the shoe outsole. At the calf, blend
    // to the bare sole contact while retaining foot length and toe geometry.
    p.setY(i,y-.014*(1-T.MathUtils.smoothstep(y,.085,lm.knee[2]-.14)));

    const sole=(1-T.MathUtils.smoothstep(y,.012,.043))*Math.max(0,-normal.getY(i));
    const nail=data.nail[i];
    tone.setRGB(1+.05*sole+.14*nail,1-.026*sole+.28*nail,1-.02*sole+.40*nail);
    colors.push(tone.r,tone.g,tone.b);
  }
  foot.setAttribute('position',p); foot.setAttribute('normal',normal);
  foot.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));foot.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  foot.setAttribute('skinIndex',new T.Uint16BufferAttribute(data.joint.map(j=>names[j]),4));
  foot.setAttribute('skinWeight',new T.Float32BufferAttribute(data.weight,4));foot.setIndex(data.index);
  const mesh=new T.SkinnedMesh(foot,new T.MeshStandardMaterial({name:'Pies descalzos',map:skin,vertexColors:true,roughness:.79}));
  mesh.bind(body.skeleton,body.bindMatrix);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
  body.parent.add(mesh);mesh.visible=false;a.meshes.push(mesh);
  const boots=a.meshes.filter(m=>m.material.name.startsWith('Shoe'));
  const original=g.index, lod=g.userData.lod, entry=a.lods.find(l=>l.geo===g);
  const shod=lod?[lod.full,lod.low]:[[0,original.count]];
  const indices=[], boundary=lm.knee[2]-.091;
  const bare=shod.map(([start,count])=>{
    const offset=indices.length;
    for(let i=start;i<start+count;i+=3){
      const ids=[original.getX(i),original.getX(i+1),original.getX(i+2)];
      if(ids.some(id=>g.attributes.position.getY(id)>=boundary))indices.push(...ids);
    }
    return [offset,indices.length-offset];
  });
  const cropped=new (original.array instanceof Uint32Array?T.Uint32BufferAttribute:T.Uint16BufferAttribute)(indices,1);
  a.setBarefoot=on=>{
    if(mesh.visible===on)return;
    mesh.visible=on;boots.forEach(m=>m.visible=!on);
    const ranges=on?bare:shod;
    g.setIndex(on?cropped:original);g.setDrawRange(...ranges[lod?a.lod:0]);
    if(lod){[lod.full,lod.low]=ranges;[entry.full,entry.low]=ranges;}
  };
}
