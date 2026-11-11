"""Renders de control de deformación (pista PERSONAJE, ronda de corrección): hombros, axila, rodilla, muñeca, cinturón, cara.
  python blender/ctl3.py dump <nombre>                       guarda en ctl3poses.json las poses de fases reales (acción 'Poses' de s4.blend)
  python blender/ctl3.py <nombre> <tag> <fase:vista,vista;fase:vista...> [recorr]
Fases (ver PH): over (arranque arriba, de pie), ohs (recepción del arranque), giro, split (tijera), fin, push, rack (cargada de pie), rsq (fondo de la cargada), pull, start (salida), stand, rest.
CTL_SRC=<carpeta de build> lee s3b.blend/s4.blend/poses.json de otro build (p. ej. out/) y escribe igual en TARIMA_OUT.
'recorr' recalcula los morphs correctivos con el geo.py actual antes de renderizar (iteración rápida sin correr finish.py).
  python blender/ctl3.py nconv                               prueba la convención del normal map (+Y) con un bulto sintético
TARIMA_NOCORR=1 renderiza con los morphs en 0 (antes/después). Salida: <TARIMA_OUT>/<nombre>/ctl/<tag>_<fase>_<vista>.png"""
import bpy, os, sys, json, math
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix
PRE='mixamorig:'
# fase -> (secuencia, nombre de la pose). El cuadro sale de poses.json (1 + 30·(inicio de la secuencia + índice de la pose)): no se desfasa si poses.py suma fases.
PH=dict(over=('snatch','Recuperación'),ohs=('snatch','Recepción'),giro=('snatch','Giro'),split=('split','Envión · Tijera'),fin=('split','Envión · Final'),push=('split','Envión · Empuje'),
        rack=('clean','Recuperación'),rsq=('clean','Amortiguación'),pull=('clean','Tirón de brazos'),start=('clean','Salida'),stand=('clean','Parado'))
def frames(src):
    J=json.load(open(src+'poses.json',encoding='utf-8'))['segs']; F={}
    for k,(seg,nm) in PH.items():
        i=[q['n'] for q in J[seg]['poses']].index(nm); F[k]=1+30*(int(J[seg]['start'])+i)
    return F
V=dict(shF=('LeftArm',(0,0,.0),(.35,-.93,.1),1.0,85,(640,640)),shB=('LeftArm',(0,0,.0),(.3,.93,.2),1.0,85,(640,640)),axi=('LeftArm',(0,0,-.03),(.75,-.55,-.35),.9,85,(640,640)),
       upF=('Spine2',(0,0,.12),(.0,-1,.05),1.9,85,(760,760)),upB=('Spine2',(0,0,.12),(.0,1,.1),1.9,85,(760,760)),upQ=('Spine2',(0,0,.12),(.6,-.8,.1),1.9,85,(760,760)),
       gro=('Hips',(0,-.1,-.02),(.25,-.95,.15),1.5,85,(760,640)),kneS=('LeftLeg',(0,0,.05),(1,-.25,.1),1.3,85,(640,640)),kneF=('LeftLeg',(0,0,.05),(.15,-1,.1),1.3,85,(640,640)),
       sqB=('Hips',(0,0,.1),(-.35,.9,.25),2.2,85,(640,720)),full=('Hips',(0,0,.2),(.45,-.88,.1),4.8,85,(620,900)),side=('Hips',(0,0,.2),(1,-.05,.05),4.8,85,(620,900)),
       hand=('LeftHand',(0,0,0),(.5,-.8,.3),.5,100,(640,640)),handB=('LeftHand',(0,0,0),(-.5,.8,.3),.5,100,(640,640)),handP=('LeftHand',(.03,-.04,-.05),(-.75,-.35,-.5),.52,100,(640,640)),
       face=('Head',(0,-.05,.09),(.3,-.95,.02),.80,100,(640,760)),faceS=('Head',(0,-.04,.08),(1,-.25,.0),.85,100,(640,760)),faceF=('Head',(0,-.05,.09),(0,-1,.0),.80,100,(640,760)),
       eye=('Head',(.03,-.1,.085),(.1,-1,.0),.22,110,(640,420)),torso=('Spine2',(0,0,.0),(.25,-.95,.05),1.45,85,(680,760)),back=('Spine2',(0,0,.0),(-.3,.95,.1),1.5,85,(680,760)),
       waist=('Spine',(0,0,.03),(.2,-.97,.05),.9,90,(680,560)),thigh=('LeftUpLeg',(0,0,-.15),(.3,-.95,.1),.8,90,(640,640)),elbow=('LeftForeArm',(0,0,0),(.4,.9,.1),.6,90,(640,640)),
       armU=('LeftForeArm',(0,0,-.06),(.35,-.93,.05),1.25,85,(640,860)),armB=('LeftForeArm',(0,0,-.06),(.45,.88,.1),1.25,85,(640,860)),armS=('LeftForeArm',(0,0,-.06),(1,-.1,.0),1.25,85,(640,860)),
       armR=('LeftArm',(.05,0,-.14),(.55,-.83,.05),1.15,85,(640,860)),legF=('LeftLeg',(0,0,.18),(.3,-.95,.1),1.6,85,(640,860)),shoeL=('LeftToeBase',(0,.08,.02),(1,-.12,.12),.62,90,(760,520)),shoeM=('LeftToeBase',(0,.08,.02),(-1,-.12,.12),.62,90,(760,520)),
       knee=('LeftLeg',(0,0,.0),(.45,-.88,.08),.80,90,(640,720)),shoe=('LeftToeBase',(0,.06,.03),(.7,-.68,.30),.62,90,(720,560)))
if __name__=='__main__':
    if sys.argv[1]=='dump':
        NAME=sys.argv[2]; OUT=out_dir(NAME); SRC=os.path.join(os.environ['CTL_SRC'],NAME)+os.sep if os.environ.get('CTL_SRC') else OUT   # CTL_SRC: carpeta de build de donde leer s4.blend y poses.json
        bpy.ops.wm.open_mainfile(filepath=SRC+'s4.blend'); rig=bpy.data.objects['Human.rig']; sc=bpy.context.scene; D={}
        for k,f in frames(SRC).items():
            sc.frame_set(f); bpy.context.view_layer.update(); D[k]={p.name:[list(r) for r in p.matrix_basis] for p in rig.pose.bones}
        json.dump(D,open(OUT+'ctl3poses.json','w')); print('ok',list(D)); sys.exit()
    if sys.argv[1]=='nconv':
        # Convención del normal map (+Y, glTF): un bulto gaussiano pasa por tex.normal_from_height y se guarda como lo guarda tex.body ([::-1]).
        # Plano con UV estándar y luz rasante desde +V y desde +U: el lado del bulto que mira a la luz tiene que salir más claro.
        import numpy as np, tex, tempfile
        S=tempfile.mkdtemp()+os.sep; R=256; v,u=np.mgrid[0:R,0:R]/R; h=(.02*np.exp(-(((u-.5)**2+(v-.5)**2)/.02))).astype(np.float32)
        tex.save(tex.normal_from_height(h,1./R,1./R)[::-1],S+'n.png'); bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
        bpy.ops.mesh.primitive_plane_add(size=1); pl=bpy.context.object; m=bpy.data.materials.new('m'); m.use_nodes=True; nt=m.node_tree; bs=nt.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value=1
        t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(S+'n.png'); t.image.colorspace_settings.name='Non-Color'; nm=nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],bs.inputs['Normal']); pl.data.materials.append(m)
        cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); cam.data.type='ORTHO'; cam.data.ortho_scale=1; cam.location=(0,0,2); sc.camera=cam
        sc.render.engine='CYCLES'; sc.cycles.samples=16; sc.cycles.device='CPU'; sc.render.resolution_x=sc.render.resolution_y=128; sc.view_settings.view_transform='Standard'
        ld=bpy.data.lights.new('s','SUN'); ld.energy=3; lo=bpy.data.objects.new('s',ld); sc.collection.objects.link(lo)
        for name,d in (('+V',(0,1,.35)),('+U',(1,0,.35))):
            lo.rotation_euler=Vector(d).to_track_quat('Z','Y').to_euler(); sc.render.filepath=S+'r.png'; bpy.ops.render.render(write_still=True)
            im=bpy.data.images.load(S+'r.png'); a=np.array(im.pixels[:]).reshape(128,128,4)[:,:,0]; bpy.data.images.remove(im)
            hi,lw=(a[72:88,56:72].mean(),a[40:56,56:72].mean()) if name=='+V' else (a[56:72,72:88].mean(),a[56:72,40:56].mean())
            print(f'NCONV luz desde {name}: lado hacia la luz {hi:.3f}, lado opuesto {lw:.3f} ->','relieve (correcto)' if hi>lw else 'hundido (INVERTIDO)')
        sys.exit()
    NAME,TAG,JOBS=sys.argv[1],sys.argv[2],sys.argv[3]; OUT=out_dir(NAME); CT=OUT+'ctl'+os.sep; os.makedirs(CT,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=(os.path.join(os.environ['CTL_SRC'],NAME)+os.sep if os.environ.get('CTL_SRC') else OUT)+'s3b.blend'); rig=bpy.data.objects['Human.rig']; b=bpy.data.objects['Human']; pb=rig.pose.bones; sc=bpy.context.scene
    D=json.load(open(OUT+'ctl3poses.json'))
    if 'recorr' in sys.argv[4:]:
        import geo; from style import STYLES
        if b.data.shape_keys:
            b.active_shape_key_index=0; b.shape_key_clear()
        geo.correctives(b,rig,STYLES[NAME]['H']/1.687)
    fl=bpy.data.meshes.new('fl'); fl.from_pydata([(-4,-4,0),(4,-4,0),(4,4,0),(-4,4,0)],[],[(0,1,2,3)]); fo=bpy.data.objects.new('fl',fl); sc.collection.objects.link(fo)
    fm=bpy.data.materials.new('fl'); fm.use_nodes=True; bs=fm.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=(.16,.11,.07,1); bs.inputs['Roughness'].default_value=.55; fl.materials.append(fm)
    files=[]
    for job in JOBS.split(';'):
        ph,views=job.split(':')
        for p in pb: p.matrix_basis=Matrix()
        if ph!='rest':
            for n,m in D[ph].items():
                if n in pb: pb[n].matrix_basis=Matrix(m)
        bpy.context.view_layer.update(); sc.frame_set(sc.frame_current)
        if os.environ.get('TARIMA_NOCORR') and b.data.shape_keys:
            for k in b.data.shape_keys.key_blocks[1:]: k.mute=True
        dg=bpy.context.evaluated_depsgraph_get(); ev=b.evaluated_get(dg)
        import numpy as np
        a=np.empty(len(ev.data.vertices)*3); ev.data.vertices.foreach_get('co',a); fo.location.z=float(a.reshape(-1,3)[:,2].min())-.001
        if ev.data.shape_keys: print('SKV',NAME,ph,{k.name:round(k.value,2) for k in ev.data.shape_keys.key_blocks[1:]},flush=True)
        for vw in views.split(','):
            bone,off,d,dist,lens,res=V[vw]; t=(rig.matrix_world@pb[PRE+bone].head)+Vector(off)
            if bone in ('Spine2','Hips','Spine','Head'): t.x=off[0]
            fn=CT+f'{TAG}_{ph}_{vw}.png'; render(fn,cam_loc=tuple(t+Vector(d).normalized()*dist),target=tuple(t),res=res,samples=int(os.environ.get('CTL_SAMPLES','24')),lens=lens); files.append(fn); print('DONE',fn,flush=True)
    from PIL import Image
    ims=[Image.open(f) for f in files]; W=sum(i.width for i in ims); Hh=max(i.height for i in ims); sh=Image.new('RGB',(W,Hh)); xo=0
    for im in ims: sh.paste(im,(xo,0)); xo+=im.width
    sh.save(CT+f'{TAG}_sheet.png'); print('CTL',CT+f'{TAG}_sheet.png')
