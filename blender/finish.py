import bpy, os, sys, bmesh, json, math, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFont, ImageFilter
NAME=sys.argv[1]; OUT=out_dir(NAME)
from style import STYLES
STY=STYLES[NAME]
FONT=next((p for p in [os.environ.get('TARIMA_FONT',''),'/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf','/System/Library/Fonts/Supplemental/Arial Bold.ttf','/Library/Fonts/Arial Bold.ttf','C:/Windows/Fonts/arialbd.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if p and os.path.exists(p)),None)
if FONT is None: raise SystemExit('Definí TARIMA_FONT con la ruta a una tipografía .ttf en negrita')
K=STY['H']/1.687
bpy.ops.wm.open_mainfile(filepath=OUT+'s3.blend')
b=bpy.data.objects['Human']; rig=bpy.data.objects['Human.rig']; me=b.data
LM={k:np.array(v) for k,v in json.load(open(OUT+'lm.json')).items()}; BJ=json.load(open(OUT+'bones.json'))
hexc=lambda h:np.array([int(h[i:i+2],16)/255 for i in (1,3,5)])
# ---------- texturas (blender/tex.py: albedo, ORM, normal y máscara; ojo, zapatilla y cinturón) ----------
# TARIMA_TEXR: resolución del cuerpo (por defecto la del horneado de make.py, 4096). TARIMA_KEEPTEX=1 reutiliza las ya generadas.
import tex
json.dump({x.name[10:]:[list(x.head_local),list(x.tail_local)] for x in rig.data.bones if x.name.startswith('mixamorig:')},open(OUT+'bones_all.json','w'))
TEXS=['body_color.png','body_orm.png','body_normal.png','body_mask.png','hair_len.png','hair.png','lash.png','eye.png','shoe_color.png','shoe_orm.png','shoe_normal.png']+(['belt_color.png','belt_orm.png','belt_normal.png'] if STY.get('belt') else [])
if not (os.environ.get('TARIMA_KEEPTEX') and all(os.path.exists(OUT+f) for f in TEXS)):
    tex.body(NAME,OUT,STY,K,FONT,int(os.environ.get('TARIMA_TEXR','0')) or None); tex.eye(OUT,STY); tex.shoe(OUT,STY); tex.belt(OUT,STY); tex.hair(OUT,STY); tex.lash(OUT,STY)
else: print('TEX reutilizadas (TARIMA_KEEPTEX)')

# ---------- materiales ----------
_img={}
def img(path,data=False):
    if path not in _img:
        _img[path]=bpy.data.images.load(path)
        if data: _img[path].colorspace_settings.name='Non-Color'
    return _img[path]
def gltf_out():
    """Grupo 'glTF Material Output': el exportador toma de su entrada Occlusion el canal R del ORM."""
    ng=bpy.data.node_groups.get('glTF Material Output')
    if ng is None: ng=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree'); ng.interface.new_socket('Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    return ng
def texmat(name,cpath,ormpath=None,nrmpath=None,rough=.5,nstrength=1.0):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; bs=nt.nodes['Principled BSDF']
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=img(cpath); nt.links.new(t.outputs['Color'],bs.inputs['Base Color'])
    if ormpath:
        o=nt.nodes.new('ShaderNodeTexImage'); o.image=img(ormpath,True); sp=nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'],sp.inputs[0]); nt.links.new(sp.outputs[1],bs.inputs['Roughness']); nt.links.new(sp.outputs[2],bs.inputs['Metallic'])
        g=nt.nodes.new('ShaderNodeGroup'); g.node_tree=gltf_out(); nt.links.new(sp.outputs[0],g.inputs['Occlusion'])
    else: bs.inputs['Roughness'].default_value=rough
    if nrmpath:
        n=nt.nodes.new('ShaderNodeTexImage'); n.image=img(nrmpath,True); nm=nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=nstrength
        nt.links.new(n.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    return m
def alphamat(name,cpath,rough,double=False):
    """Material con alfa de la textura (glTF alphaMode BLEND): pelo en capas y pestañas."""
    m=texmat(name,cpath,rough=rough); nt=m.node_tree; t=next(n for n in nt.nodes if n.type=='TEX_IMAGE'); nt.links.new(t.outputs['Alpha'],nt.nodes['Principled BSDF'].inputs['Alpha'])
    for k,v in (('surface_render_method','BLENDED'),('blend_method','BLEND')):
        try: setattr(m,k,v)
        except Exception: pass
    m.use_backface_culling=not double; return m
def flat(name,h,rough):
    m=bpy.data.materials.new(name); m.use_nodes=True; bs=m.node_tree.nodes['Principled BSDF']; c=hexc(h); lin=[((u/12.92) if u<=.04045 else ((u+.055)/1.055)**2.4) for u in c]
    bs.inputs['Base Color'].default_value=(*lin,1); bs.inputs['Roughness'].default_value=rough; return m
me.materials.append(texmat('Body',OUT+'body_color.png',OUT+'body_orm.png',OUT+'body_normal.png'))
gi={g.name:g.index for g in b.vertex_groups}
# ---------- ojos: reemplazar helper por esferas ----------
bm=bmesh.new(); bm.from_mesh(me); dl=bm.verts.layers.deform.verify()
eg={gi['helper-l-eye'],gi['helper-r-eye']}
bmesh.ops.delete(bm,geom=[v for v in bm.verts if any(g in eg for g in v[dl].keys())],context='VERTS')
# ---------- pies: borrar bajo el zapato ----------
footg={gi['mixamorig:LeftFoot'],gi['mixamorig:RightFoot'],gi['mixamorig:LeftToeBase'],gi['mixamorig:RightToeBase']}
def domfoot(v):
    d=v[dl]; best=max(d.keys(),key=lambda k:d[k] if b.vertex_groups[k].name.startswith('mixamorig:') else -1) if len(d.keys()) else -1; return best in footg
footpts={1:[],-1:[]}
for v in bm.verts:
    if v.co.z<.125 and abs(v.co.x)>.02 and (domfoot(v) or v.co.z<.06 or v.co.z<.125): footpts[1 if v.co.x>0 else -1].append((v.co.copy(),v.normal.copy()))
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<.07 and (domfoot(v) or v.co.z<.05)],context='VERTS')
bm.to_mesh(me); bm.free(); me.update()
print('foot pts',len(footpts[1]),len(footpts[-1]))
import geo, shoes
parts=[]; lash_o=geo.lashes(b,alphamat('Lashes',OUT+'lash.png',.5,True))
if lash_o: parts.append(lash_o)
if not os.environ.get('TARIMA_NOSKIN'): geo.smooth_weights(b,rig,K)
geo.subdivide(b); geo.garments(b,rig,BJ,K); me=b.data
if not os.environ.get('TARIMA_NOHAIR'): parts.append(geo.hair_shells(b,OUT,alphamat('Hair',OUT+'hair.png',.42)))
def newobj(name,bm_,mats,group):
    m=bpy.data.meshes.new(name); bm_.to_mesh(m); bm_.free(); o=bpy.data.objects.new(name,m); bpy.context.scene.collection.objects.link(o)
    for mt in mats: m.materials.append(mt)
    vg=o.vertex_groups.new(name=group); vg.add(list(range(len(m.vertices))),1.0,'REPLACE')
    for p in m.polygons: p.use_smooth=True
    parts.append(o); return o
eyem=texmat('Eyes',OUT+'eye.png',rough=.12)
for k in ('eyeL','eyeR'): newobj(k,geo.eyeball(float(LM['eyeR_r'][0]),LM[k]),[eyem],'mixamorig:Head')
# ---------- zapatillas de halterofilia (blender/shoes.py) ----------
SM=[texmat(n_,OUT+'shoe_color.png',OUT+'shoe_orm.png',OUT+'shoe_normal.png') for n_ in shoes.MATS]   # un solo atlas para los cinco materiales (el color va en la textura)
for sgn,side in ((1,'Left'),(-1,'Right')): parts.append(shoes.build(sgn,side,footpts[sgn],rig,SM))
if STY.get('belt'):
    BM=[texmat('Belt',OUT+'belt_color.png',OUT+'belt_orm.png',OUT+'belt_normal.png'),flat('BeltMetal','#c9ccd2',.28)]; BM[1].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=1.0
    parts.append(geo.belt(b,rig,K,BM))
# unir
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
b.select_set(True); bpy.context.view_layer.objects.active=b; bpy.ops.object.join()
me=b.data; print('final verts',len(me.vertices),'tris',sum(len(p.vertices)-2 for p in me.polygons),'mats',[m.name for m in me.materials])
if not os.environ.get('TARIMA_NOCORR'): geo.correctives(b,rig,K)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'s3b.blend')  # punto de partida de pose_only.py
if os.environ.get('TARIMA_NOPOSES'): sys.exit(0)   # solo malla (renders de control con blender/ctl.py)
exec(open(os.path.join(HERE,'poses.py'),encoding='utf-8').read())
