"""Renders de control de materiales (pista PERSONAJE, etapa 2): primeros planos y cuerpo entero sobre s3b.blend.
  python blender/ctl2.py bones <nombre>                 vuelca bones_all.json desde s3.blend (lo usa tex.py suelto)
  python blender/ctl2.py <nombre> <tag> [vistas,por,coma] [pose]
Poses de prueba simples (rotando huesos): rest, up (brazos sobre la cabeza), rack (brazos al frente), squat.
OJO: 'up' rota mal el brazo (queda hacia atrás). Para hombros, axila, rodilla y muñeca usar blender/ctl3.py, que toma fases reales de la acción 'Poses'.
Salida: <TARIMA_OUT>/<nombre>/ctl/<tag>_<vista>.png y <tag>_sheet.png"""
import bpy, os, sys, json, math
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix, Quaternion
PRE='mixamorig:'
def dump_bones(rig,path): json.dump({b.name[len(PRE):]:[list(b.head_local),list(b.tail_local)] for b in rig.data.bones if b.name.startswith(PRE)},open(path,'w'))
if __name__=='__main__':
    if sys.argv[1]=='bones':
        OUT=out_dir(sys.argv[2]); bpy.ops.wm.open_mainfile(filepath=OUT+'s3.blend'); dump_bones(bpy.data.objects['Human.rig'],OUT+'bones_all.json'); print('ok'); sys.exit()
    NAME,TAG=sys.argv[1],sys.argv[2]; OUT=out_dir(NAME); CT=OUT+'ctl'+os.sep; os.makedirs(CT,exist_ok=True)
    # vista: (dirección de cámara desde el objetivo, distancia, lente, hueso objetivo, (dx,dy,dz), resolución)
    V=dict(face=((.3,-.95,.02),.80,100,'Head',(0,-.05,.09),(640,760)),faceS=((1,-.25,.0),.85,100,'Head',(0,-.04,.08),(640,760)),torso=((.25,-.95,.05),1.45,85,'Spine2',(0,0,.0),(680,760)),
           back=((-.3,.95,.1),1.5,85,'Spine2',(0,0,.0),(680,760)),hand=((.55,-.75,.35),.50,100,'LeftHand',(.03,-.04,-.05),(640,640)),handP=((-.75,-.35,-.5),.52,100,'LeftHand',(.03,-.04,-.05),(640,640)),
           arm=((.6,-.75,.15),.85,90,'LeftForeArm',(0,0,.02),(640,640)),knee=((.45,-.88,.08),.80,90,'LeftLeg',(0,0,.0),(640,720)),kneeB=((-.3,.95,.1),.85,90,'LeftLeg',(0,0,.0),(640,720)),
           shoe=((.7,-.68,.30),.62,90,'LeftToeBase',(0,.06,.03),(720,560)),shoeS=((1,-.05,.10),.62,90,'LeftFoot',(0,-.07,-.02),(720,560)),shoeB=((-.55,.8,.3),.62,90,'LeftFoot',(0,-.05,-.02),(720,560)),
           waist=((.2,-.97,.05),.9,90,'Spine',(0,0,.03),(680,560)),full=((.35,-.93,.06),4.6,85,'Hips',(0,0,.0),(620,1000)),fullB=((-.4,.9,.08),4.6,85,'Hips',(0,0,.0),(620,1000)),eye=((.1,-1,.0),.22,110,'Head',(.03,-.1,.085),(640,420)))
    views=sys.argv[3].split(',') if len(sys.argv)>3 and sys.argv[3]!='-' else ['face','torso','hand','knee','shoe','full']
    pose=sys.argv[4] if len(sys.argv)>4 else 'rest'
    bpy.ops.wm.open_mainfile(filepath=OUT+'s3b.blend'); rig=bpy.data.objects['Human.rig']; pb=rig.pose.bones
    def rot(n,ax,deg):
        for s in (('Left',1),('Right',-1)) if '*' in n else ((None,1),):
            p=pb[PRE+n.replace('*',s[0] or '')]; p.rotation_mode='QUATERNION'; a=Vector(ax); a=Vector((a.x,a.y*s[1],a.z*s[1])) if s[0] else a
            p.rotation_quaternion=Quaternion(a,math.radians(deg))@p.rotation_quaternion
    if pose=='up': rot('*Arm',(0,0,1),-95); rot('*Shoulder',(0,0,1),-22)
    if pose=='rack': rot('*Arm',(1,0,0),-60); rot('*ForeArm',(0,0,1),125)
    if pose=='squat':
        rot('*UpLeg',(1,0,0),-115); rot('*Leg',(1,0,0),125); rot('*Foot',(1,0,0),-10); pb[PRE+'Hips'].location=(0,-.45,0)
    bpy.context.view_layer.update()
    zf=min((rig.matrix_world@pb[PRE+s+'ToeBase'].head).z for s in ('Left','Right'))-rig.data.bones[PRE+'LeftToeBase'].head_local.z
    fl=bpy.data.meshes.new('fl'); fl.from_pydata([(-4,-4,zf-.016),(4,-4,zf-.016),(4,4,zf-.016),(-4,4,zf-.016)],[],[(0,1,2,3)]); fo=bpy.data.objects.new('fl',fl); bpy.context.scene.collection.objects.link(fo)
    fm=bpy.data.materials.new('fl'); fm.use_nodes=True; bs=fm.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=(.16,.11,.07,1); bs.inputs['Roughness'].default_value=.55; fl.materials.append(fm)
    files=[]
    for vw in views:
        d,dist,lens,bone,off,res=V[vw]; t=pb[PRE+bone].matrix.translation+Vector(off)
        if bone in ('Hips','Spine','Spine2','Head'): t.x=off[0]
        fn=CT+f'{TAG}_{vw}.png'; render(fn,cam_loc=tuple(t+Vector(d).normalized()*dist),target=tuple(t),res=res,samples=int(os.environ.get('CTL_SAMPLES','32')),lens=lens); files.append(fn)
    from PIL import Image
    ims=[Image.open(f) for f in files]; W=sum(i.width for i in ims); Hh=max(i.height for i in ims); sh=Image.new('RGB',(W,Hh)); xo=0
    for im in ims: sh.paste(im,(xo,0)); xo+=im.width
    sh.save(CT+f'{TAG}_sheet.png'); print('CTL',CT+f'{TAG}_sheet.png')
