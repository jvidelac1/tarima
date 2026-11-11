import bpy, os, sys, bmesh, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from common import *
from mathutils import Vector
R=2048
import body
NAME=sys.argv[1]; OUT=out_dir(NAME)
boot()
b,rig=body.build(NAME)
me=b.data
gi={g.name:g.index for g in b.vertex_groups}
keep={gi['helper-l-eye'],gi['helper-r-eye']}; kill={gi['HelperGeometry'],gi['JointCubes']}
bm=bmesh.new(); bm.from_mesh(me); dl=bm.verts.layers.deform.verify()
bmesh.ops.delete(bm,geom=[v for v in bm.verts if any(g in kill for g in v[dl].keys()) and not any(g in keep for g in v[dl].keys())],context='VERTS'); bm.to_mesh(me); bm.free()
for m in list(b.modifiers):
    if m.type=='MASK': b.modifiers.remove(m)
me=b.data; N=len(me.vertices); print('verts',N,'polys',len(me.polygons))
BN={x.name[10:]:x for x in rig.data.bones}
P=lambda n:BN[n].head_local.copy()
gname=[g.name for g in b.vertex_groups]
co=np.empty(N*3); me.vertices.foreach_get('co',co); co=co.reshape(N,3)
no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3)
dom=np.empty(N,dtype=object); W={k:np.zeros(N) for k in ('scalp','lips','helper-l-eye','helper-r-eye','ears')}
for v in me.vertices:
    bw=0;best=''
    for g in v.groups:
        n=gname[g.group]
        if n.startswith('mixamorig:'):
            if g.weight>bw: bw=g.weight;best=n[10:]
        elif n in W: W[n][v.index]=g.weight
    dom[v.index]=best
dom=dom.astype(str); isin=lambda names:np.isin(dom,names).astype(float)
sm=lambda e0,e1,v:(lambda t:t*t*(3-2*t))(np.clip((v-e0)/(e1-e0),0,1))
hip=P('LeftUpLeg'); knee=P('LeftLeg'); ank=P('LeftFoot'); sh=P('LeftArm'); neck=P('Neck')
eyeV=(W['helper-l-eye']+W['helper-r-eye']>0)
F=dict(torso=isin(['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder','Neck']),thigh=isin(['LeftUpLeg','RightUpLeg']),leg=isin(['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']),
  low=isin(['LeftLeg','RightLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase']),scalp=W['scalp'],lips=np.clip(W['lips'],0,1),
  head=isin(['Head','Neck'])*(~eyeV),farmL=isin(['LeftForeArm','LeftHand']),farmR=isin(['RightForeArm','RightHand']),uarmL=isin(['LeftArm']),eye=eyeV.astype(float),ears=W['ears'])
x,y,z=co.T; axo=np.abs(x)
LM=dict(lips=co[W['lips']>.5].mean(0),eyeL=co[W['helper-l-eye']>0].mean(0),eyeR=co[W['helper-r-eye']>0].mean(0),ears=co[(W['ears']>.5)&(x>0)].mean(0))
hm=F['head']>0; LM['nose']=co[hm][np.argmin(y[hm])]; cm=hm&(axo<.015)&(y<LM['lips'][1]+.03); LM['chin']=co[cm][np.argmin(z[cm])]
LM['eyeR_r']=float(np.linalg.norm(co[W['helper-l-eye']>0]-LM['eyeL'],axis=1).mean())
print({k:np.round(v,4) for k,v in LM.items()})
# volumen de prendas (por vértice)
hemz=knee.z+.42*(hip.z-knee.z)
def masks(x,y,z,F,soft):
    axo=np.abs(x); E=soft
    front=y<neck.y
    scoop=np.where(front,np.sqrt((x/.085)**2+((z-(neck.z+.03))/.19)**2),np.sqrt((x/.075)**2+((z-(neck.z+.03))/.1)**2))
    arm=np.sqrt(((axo-(sh.x+.03))/(sh.x+.03-.118))**2+((z-(sh.z+.04))/.2)**2)
    suit=np.maximum(F['torso']*sm(1-E,1+E,scoop)*sm(1-E,1+E,arm)*sm(neck.z+.03,neck.z+.02,z),F['thigh']*sm(hemz-E*.1,hemz+E*.1,z))
    slv=F['leg']*sm(knee.z-.112-E*.1,knee.z-.112+E*.1,z)*sm(knee.z+.102+E*.1,knee.z+.102-E*.1,z)
    sock=F['low']*sm(ank.z+.132+E*.1,ank.z+.132-E*.1,z)
    wrap=np.zeros_like(x)
    for side,fl in (('Left',F['farmL']),('Right',F['farmR'])):
        a=np.array(P(side+'ForeArm')); w=np.array(P(side+'Hand')); d=w-a; L=np.linalg.norm(d); d/=L
        t=((x-a[0])*d[0]+(y-a[1])*d[1]+(z-a[2])*d[2])/L
        wrap=np.maximum(wrap,fl*sm(.75-E*.3,.75+E*.3,t)*sm(1.1,1.08,t))
    return suit,slv,sock,wrap
suit,slv,sock,wrap=masks(x,y,z,F,.06)
disp=np.maximum.reduce([suit*.0015,slv*.0045,sock*.003,wrap*.0025,F['scalp']*.003])
me.vertices.foreach_set('co',(co+no*disp[:,None]).ravel()); me.update()
for p in me.polygons: p.use_smooth=True
# atributos para hornear
def attr(name,r,g,bb):
    a=me.color_attributes.new(name,'FLOAT_COLOR','POINT'); a.data.foreach_set('color',np.stack([r,g,bb,np.ones(N)],1).ravel())
attr('A',F['torso'],F['thigh'],F['leg']); attr('B',F['low'],F['scalp'],F['lips']); attr('C',F['head'],F['farmL'],F['farmR']); attr('D',F['uarmL'],F['eye'],F['ears'])
attr('PO',co[:,0]+1,co[:,1]+1,co[:,2])
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'
bimg=bpy.data.images.new('bake',R,R,alpha=False,float_buffer=True); bimg.colorspace_settings.name='Non-Color'
bm_=bpy.data.materials.new('BakeMat'); bm_.use_nodes=True; nt=bm_.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out=nt.nodes.new('ShaderNodeOutputMaterial'); em=nt.nodes.new('ShaderNodeEmission'); at=nt.nodes.new('ShaderNodeVertexColor'); it=nt.nodes.new('ShaderNodeTexImage'); it.image=bimg
df=nt.nodes.new('ShaderNodeBsdfDiffuse')
nt.links.new(at.outputs['Color'],em.inputs['Color']); nt.links.new(em.outputs[0],out.inputs['Surface']); nt.nodes.active=it; it.select=True
me.materials.append(bm_)
bpy.context.view_layer.objects.active=b; bpy.ops.object.select_all(action="DESELECT"); b.select_set(True)
sc.render.bake.margin=10
def bake(name=None,kind='EMIT',samples=1):
    sc.cycles.samples=samples
    if name: at.layer_name=name
    if kind=='AO': nt.links.new(df.outputs[0],out.inputs['Surface'])
    bpy.ops.object.bake(type=kind)
    a=np.empty(R*R*4,dtype=np.float32); bimg.pixels.foreach_get(a); return a.reshape(R,R,4)[:,:,:3].copy()
maps={n:bake(n) for n in ('A','B','C','D','PO')}
maps['AO']=bake(kind='AO',samples=48)
np.savez_compressed(OUT+'maps.npz',**maps)
import json; json.dump({k:[float(u) for u in np.ravel(v)] for k,v in LM.items()},open(OUT+'lm.json','w'))
json.dump(dict(hip=list(hip),knee=list(knee),ank=list(ank),sh=list(sh),neck=list(neck),hemz=hemz,arms={s:[list(P(s+'ForeArm')),list(P(s+'Hand')),list(P(s+'Arm'))] for s in ('Left','Right')}),open(OUT+'bones.json','w'))
me.materials.clear()
for n in ('A','B','C','D','PO'): me.color_attributes.remove(me.color_attributes[n])
bpy.data.images.remove(bimg)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'s3.blend')
# cobertura UV para revisar
from PIL import Image
cov=(maps['PO'][:,:,2]>0.001)
Image.fromarray((np.clip(maps['PO'][::-1]/[2,2,1.8],0,1)*255).astype(np.uint8)).resize((768,768)).save(OUT+'uv_pos.png')
Image.fromarray((np.clip(maps['AO'][::-1],0,1)*255).astype(np.uint8)).resize((768,768)).save(OUT+'uv_ao.png')
