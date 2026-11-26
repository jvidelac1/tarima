"""Export the original feet and shins preceding the shoe cut in finish.py."""
import json
import sys
from pathlib import Path
import bpy
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
for name in sys.argv[1:] or ('ventura', 'brenner', 'solis'):
    source = root / 'out' / name
    bpy.ops.wm.open_mainfile(filepath=str(source / 's3.blend'))
    actor = bpy.data.objects['Human']
    for modifier in list(actor.modifiers):
        actor.modifiers.remove(modifier)
    sub = actor.modifiers.new('Superficie', 'SUBSURF')
    sub.levels = 1
    mesh = actor.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    mesh.calc_loop_triangles()
    knee = json.loads((source/'bones.json').read_text())['knee'][2]
    uv_layer=mesh.uv_layers.active.data
    faces=[]
    for face in mesh.loop_triangles:
        if all(mesh.vertices[i].co.z < knee - .052 for i in face.vertices):
            faces.append([(mesh.loops[j].vertex_index, *[round(v,6) for v in uv_layer[j].uv]) for j in face.loops])
    ids=sorted({key for face in faces for key in face})
    remap={key:i for i,key in enumerate(ids)}
    data=dict(position=[],normal=[],uv=[],nail=[],weight=[],joint=[],names=[],
              index=[remap[key] for face in faces for key in face])
    for i,u,v in ids:
        vert=mesh.vertices[i]
        data['uv'].extend((u,v))
        data['nail'].append(round(sum(g.weight for g in vert.groups if actor.vertex_groups[g.group].name=='toenails'),3))
        for field, value in [('position', vert.co), ('normal', vert.normal)]:
            data[field].extend(round(v,6) for v in (value.x,value.z,-value.y))
        entries = [(actor.vertex_groups[g.group].name.split(':')[-1],g.weight) for g in vert.groups
                   if actor.vertex_groups[g.group].name.startswith('mixamorig:') and g.weight > 0]
        entries = sorted(entries,key=lambda pair:-pair[1])[:4]
        if not entries: entries=[('LeftFoot' if vert.co.x>0 else 'RightFoot',1)]
        total = sum(w for _,w in entries)
        entries += [(entries[0][0],0)]*(4-len(entries))
        for bone,w in entries:
            if bone not in data['names']: data['names'].append(bone)
            data['joint'].append(data['names'].index(bone))
            data['weight'].append(round(w/total,6))
    (root/'web/models/barefoot'/f'{name}.json').write_text(json.dumps(data,separators=(',',':')))
    import sys
    sys.path.insert(0,str(root/'blender'))
    import tex
    from style import STYLES
    # Bake only the UV islands used by bare lower limbs. Sample the original
    # rest position and AO so pigment and follicles follow the leg continuously.
    with np.load(source/'maps.npz') as maps:
        xyz=maps['PO'][::2,::2].astype(np.float32)
        ao=maps['AO'][::2,::2].astype(np.float32)/255
    visible=(xyz[:,:,0]>.01) & (xyz[:,:,2]<knee)
    surface=xyz[visible].copy()
    surface[:,:2]-=1
    skin=tex.hexc(STYLES[name]['skin'])
    pigment=tex.vnoise(surface*35,12)
    grain=tex.vnoise(surface*630,13)
    follicles=np.maximum(0,tex.vnoise(surface*np.array([1250,1250,175],np.float32),60)-.20)
    fade=np.clip((surface[:,2]-.07)/.10,0,1)
    color=skin[None,:]*(.91+.07*pigment[:,None]+.05*grain[:,None])
    color*=1-.46*follicles[:,None]*fade[:,None]
    color*=.74+.26*ao[visible,None]
    image=np.empty_like(xyz);image[:]=skin*.91;image[visible]=color
    Image.fromarray(np.uint8(np.clip(image[::-1],0,1)*255)).save(
        root/'web/models/barefoot'/f'{name}-skin.jpg',quality=94)
    print(name,len(ids),len(faces),min(data['position'][1::3]),flush=True)
