"""Renders de control de la pista PERSONAJE (deformación de malla, no técnica).
  python blender/ctl.py dump <nombre>            guarda poses reales de out/<nombre>/s4.blend en ctlposes.json
  python blender/ctl.py <nombre> <tag> [blend] [poses,separadas,por,coma]
Abre s3b.blend (o el .blend indicado), aplica cada pose guardada y renderiza las vistas de SHOTS.
Salida: <TARIMA_OUT>/<nombre>/ctl/<tag>_<pose>_<vista>.png y <tag>_sheet.png"""
import bpy, os, sys, json, math
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix
PICK={'overhead':('split','Envión · Final'),'rack':('clean','Recuperación'),'squat':('clean','Recepción'),'ohs':('snatch','Recepción'),'start':('clean','Salida'),'drive':('split','Envión · Empuje')}
# vista: (dirección de cámara desde el objetivo, distancia, lente, hueso objetivo, dz)
V=dict(front=((0,-1,.05),3.3,85,'Spine2',.12),back=((0,1,.08),3.3,85,'Spine2',.12),q=((.7,-.7,.12),3.3,85,'Spine2',.12),qb=((-.65,.75,.15),3.3,85,'Spine2',.12),
       side=((1,0,.05),3.6,70,'Hips',.25),ffull=((0,-1,.05),3.9,70,'Hips',.3),qfull=((.7,-.7,.1),3.9,70,'Hips',.3),bfull=((-.5,.85,.12),3.9,70,'Hips',.3),
       arm=((.9,-.45,.1),1.9,85,'LeftForeArm',0),knee=((.75,-.65,.1),2.2,85,'LeftLeg',.05),
       wrist=((.3,-.9,.25),1.1,85,'LeftHand',-.03),shoe=((.75,-.65,.28),1.25,85,'LeftToeBase',.03),shoeb=((-.6,.75,.3),1.25,85,'LeftFoot',-.03),shoes=((1,0,.06),1.1,85,'LeftFoot',-.02),face=((.35,-.93,.03),.95,85,'Head',.09))
SHOTS=dict(overhead=['front','back','q','qb'],start=['qfull','side'],rack=['front','q','arm','wrist'],squat=['ffull','side','bfull','knee'],ohs=['bfull','qfull'],rest=['shoe','shoeb','shoes','face','ffull'])
if sys.argv[1]=='dump':
    NAME=sys.argv[2]; OUT=out_dir(NAME)
    bpy.ops.wm.open_mainfile(filepath=OUT+'s4.blend'); rig=bpy.data.objects['Human.rig']; meta=json.load(open(OUT+'poses.json',encoding='utf-8')); res={}
    for k,(seg,pn) in PICK.items():
        s=meta['segs'][seg]; i=[p['n'] for p in s['poses']].index(pn); fr=1+int(round(s['start']*30))+i*30
        bpy.context.scene.frame_set(fr); bpy.context.view_layer.update()
        res[k]={p.name:[list(r) for r in p.matrix_basis] for p in rig.pose.bones if p.name!='Bar'}
    json.dump(res,open(OUT+'ctlposes.json','w')); print('dump',list(res)); sys.exit()
NAME,TAG=sys.argv[1],sys.argv[2]; OUT=out_dir(NAME); CT=OUT+'ctl'+os.sep; os.makedirs(CT,exist_ok=True)
blend=sys.argv[3] if len(sys.argv)>3 and sys.argv[3]!='-' else OUT+'s3b.blend'
only=sys.argv[4].split(',') if len(sys.argv)>4 else list(SHOTS)
bpy.ops.wm.open_mainfile(filepath=blend); rig=bpy.data.objects['Human.rig']; POSES=json.load(open(OUT+'ctlposes.json'))
fl=bpy.data.meshes.new('fl'); fl.from_pydata([(-3,-3,-.016),(3,-3,-.016),(3,3,-.016),(-3,3,-.016)],[],[(0,1,2,3)]); fo=bpy.data.objects.new('fl',fl); bpy.context.scene.collection.objects.link(fo)
fm=bpy.data.materials.new('fl'); fm.use_nodes=True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.32,.3,.28,1); fl.materials.append(fm)
files=[]
for pose in only:
    for p in rig.pose.bones: p.matrix_basis=Matrix()
    if pose!='rest':
        for n,m in POSES[pose].items():
            if n in rig.pose.bones: rig.pose.bones[n].matrix_basis=Matrix(m)
    bpy.context.view_layer.update()
    foot=rig.pose.bones['mixamorig:LeftFoot'].matrix.translation.z; rest=rig.data.bones['mixamorig:LeftFoot'].head_local.z
    for vw in SHOTS[pose]:
        d,dist,lens,bone,dz=V[vw]; t=rig.pose.bones['mixamorig:'+bone].matrix.translation+Vector((0,0,dz))
        if bone in ('Hips','Spine2'): t.x=0
        fn=CT+f'{TAG}_{pose}_{vw}.png'; render(fn,cam_loc=tuple(t+Vector(d).normalized()*dist),target=tuple(t),res=(440,640),samples=20,lens=lens); files.append(fn)
from PIL import Image
ims=[Image.open(f) for f in files]; cols=min(4,len(ims)); rows=(len(ims)+cols-1)//cols; sh=Image.new('RGB',(440*cols,640*rows))
for k,im in enumerate(ims): sh.paste(im,((k%cols)*440,(k//cols)*640))
sh.save(CT+f'{TAG}_sheet.png'); print('CTL',CT+f'{TAG}_sheet.png')
