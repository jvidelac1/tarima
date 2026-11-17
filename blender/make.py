import bpy, os, sys, bmesh, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from common import *
from mathutils import Vector
R=int(os.environ.get('TARIMA_TEX','4096'))   # resolución de horneado (posición, máscaras, AO, normal de objeto)
import body
from style import STYLES
NAME=sys.argv[1]; OUT=out_dir(NAME)
# corte de la malla (escote y sisa): los pesistas del plantel paramétrico lo traen en su estilo, en m para 1,69 m; los dos originales usan el de siempre
STY=STYLES[NAME]; KM=STY['H']/1.687 if 'escote' in STY else 1.; ESC=STY.get('escote',(.085,.19)); SIS=STY.get('sisa',(.118,.2))
boot()
b,rig=body.build(NAME)
me=b.data
gi={g.name:g.index for g in b.vertex_groups}
LASH=[f'helper-{s}-eyelashes-{k}' for s in 'lr' for k in (1,2)]   # las tiras de pestañas del mallado base se conservan: finish.py las convierte en tarjetas con alfa
keep={gi['helper-l-eye'],gi['helper-r-eye']}|{gi[n] for n in LASH}; kill={gi['HelperGeometry'],gi['JointCubes']}
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
dom=np.empty(N,dtype=object); W={k:np.zeros(N) for k in ['scalp','lips','helper-l-eye','helper-r-eye','ears']+LASH}
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
eyeV=(W['helper-l-eye']+W['helper-r-eye']>0); lashV=sum(W[n] for n in LASH)>0
F=dict(torso=isin(['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder','Neck']),thigh=isin(['LeftUpLeg','RightUpLeg']),leg=isin(['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']),
  low=isin(['LeftLeg','RightLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase']),scalp=W['scalp'],lips=np.clip(W['lips'],0,1),
  head=isin(['Head','Neck'])*(~eyeV)*(~lashV),farmL=isin(['LeftForeArm','LeftHand']),farmR=isin(['RightForeArm','RightHand']),uarmL=isin(['LeftArm']),eye=eyeV.astype(float),ears=W['ears'])
x,y,z=co.T; axo=np.abs(x)
LM=dict(lips=co[W['lips']>.5].mean(0),eyeL=co[W['helper-l-eye']>0].mean(0),eyeR=co[W['helper-r-eye']>0].mean(0),ears=co[(W['ears']>.5)&(x>0)].mean(0))
hm=(F['head']>0)&(W['scalp']<.5); LM['nose']=co[hm][np.argmin(y[hm])]; cm=hm&(axo<.015)&(y<LM['lips'][1]+.03); LM['chin']=co[cm][np.argmin(z[cm])]
LM['eyeR_r']=float(np.linalg.norm(co[W['helper-l-eye']>0]-LM['eyeL'],axis=1).mean())
print({k:np.round(v,4) for k,v in LM.items()})
# volumen de prendas (por vértice)
hemz=knee.z+.42*(hip.z-knee.z)
def masks(x,y,z,F,soft):
    axo=np.abs(x); E=soft
    front=y<neck.y
    scoop=np.where(front,np.sqrt((x/(ESC[0]*KM))**2+((z-(neck.z+.03*KM))/(ESC[1]*KM))**2),np.sqrt((x/(.075*KM))**2+((z-(neck.z+.03*KM))/(.1*KM))**2))
    arm=np.sqrt(((axo-(sh.x+.03*KM))/(sh.x+.03*KM-SIS[0]*KM))**2+((z-(sh.z+.04*KM))/(SIS[1]*KM))**2)
    suit=np.maximum(F['torso']*sm(1-E,1+E,scoop)*sm(1-E,1+E,arm)*sm(neck.z+.03,neck.z+.02,z),F['thigh']*sm(hemz-E*.1,hemz+E*.1,z))
    zq=knee.z+(z-knee.z)/KM; zs=ank.z+(z-ank.z)/KM     # rodilleras y medias a la escala del pesista
    slv=F['leg']*sm(knee.z-.112-E*.1,knee.z-.112+E*.1,zq)*sm(knee.z+.102+E*.1,knee.z+.102-E*.1,zq)
    sock=F['low']*sm(ank.z+.132+E*.1,ank.z+.132-E*.1,zs)
    wrap=np.zeros_like(x)
    for side,fl in (('Left',F['farmL']),('Right',F['farmR'])):
        a=np.array(P(side+'ForeArm')); w=np.array(P(side+'Hand')); d=w-a; L=np.linalg.norm(d); d/=L
        t=((x-a[0])*d[0]+(y-a[1])*d[1]+(z-a[2])*d[2])/L
        wrap=np.maximum(wrap,fl*sm(.75-E*.3,.75+E*.3,t)*sm(1.1,1.08,t))
    return suit,slv,sock,wrap
suit,slv,sock,wrap=masks(x,y,z,F,.06)
if True:
    FEM=STY.get('genero')=='F'; LEG=not STY.get('genero') or 'esclera' not in STY     # los dos originales (estilo legado) no se tocan
    # Busto bajo la malla: el top deportivo lo contiene y lo alisa. Suavizado laplaciano del frente del pecho cubierto por la tela (quita la punta, baja algo el volumen).
    E_=np.empty(len(me.edges)*2,dtype=np.int64); me.edges.foreach_get('vertices',E_); E_=E_.reshape(-1,2); dg_=np.maximum(np.bincount(E_.ravel(),minlength=N),1)[:,None]
    # Ronda 1 del director de arte: seguían las puntas. La zona baja más (el busto de la pesada queda bajo), más pasadas; en el hombre, pocas pasadas (solo la punta del pectoral).
    wb=(suit*sm(sh.z-.72*KM,sh.z-.62*KM,z)*sm(sh.z-.03*KM,sh.z-.09*KM,z)*(y<neck.y)*(0 if LEG else 1))[:,None]; c2=co.copy()
    for _ in range(45 if FEM else 36):     # PENDIENTE (bloqueante de la ronda 2): con 45 y con 140 pasadas (corrida 43944903931, 47 mm de desplazamiento) sigue un bulto en punta bajo la malla de solanet, que con la luz dura echa una sombra negra redonda; no es textura (la oclusión bajo la malla ya va suavizada en tex.py). Mirar el borde de la zona `wb` y lo que viene después (subdivide, garments)
        A_=np.zeros_like(c2); np.add.at(A_,E_[:,0],c2[E_[:,1]]); np.add.at(A_,E_[:,1],c2[E_[:,0]]); c2=c2*(1-.65*wb)+A_/dg_*(.65*wb)
    # Puntas del pecho (areola y pezón de la malla base): bajo la malla se leían como dos puntos marcados, en hombres y mujeres (bloqueante de contenido).
    # Se ubican por geometría (el bulto más angosto del frente del pecho de cada lado: lo que sobresale de una copia muy alisada) y en un radio de
    # 4,5 cm la superficie se reemplaza por la membrana que interpola el borde (laplaciano con el borde fijo, hasta converger).
    if not LEG:
        no_=np.empty(N*3); me.vertices.foreach_get('normal',no_); no_=no_.reshape(N,3); s_=c2.copy()
        zona=(suit>.5)&(no_[:,1]<-.25)&(z<sh.z-.05*KM)&(z>sh.z-.74*KM)&(axo>.035*KM)&(axo<.26*KM)
        for _ in range(40):
            A_=np.zeros_like(s_); np.add.at(A_,E_[:,0],s_[E_[:,1]]); np.add.at(A_,E_[:,1],s_[E_[:,0]]); s_=np.where(zona[:,None],A_/dg_,s_)
        sale=((c2-s_)*no_).sum(1)*zona; RN=.045*KM
        for sgn,lado in ((1,'L'),(-1,'R')):
            m_=zona&(c2[:,0]*sgn>0)
            if not m_.any(): continue
            i_=int(np.argmax(np.where(m_,sale,-1))); cn=c2[i_].copy(); LM['nip'+lado]=cn; d_=np.linalg.norm(c2-cn,axis=1); w_=sm(RN,RN*.72,d_)[:,None]; antes_=c2.copy()
            for _ in range(500):
                A_=np.zeros_like(c2); np.add.at(A_,E_[:,0],c2[E_[:,1]]); np.add.at(A_,E_[:,1],c2[E_[:,0]]); c2=c2*(1-w_)+A_/dg_*w_
            print(f'PUNTA {NAME} {lado}: en ({cn[0]:+.3f},{cn[1]:+.3f},{cn[2]:.3f}), sobresalía {sale[i_]*1000:.1f} mm; membrana de {int((w_[:,0]>0).sum())} vértices, desplazamiento máx {np.linalg.norm(c2-antes_,axis=1).max()*1000:.1f} mm')
    print(f'BUSTO {NAME}: alisado bajo la malla, {int((wb[:,0]>.05).sum())} vértices, desplazamiento máx {np.linalg.norm(c2-co,axis=1).max()*1000:.1f} mm'); co=c2; x,y,z=co.T; axo=np.abs(x)
disp=np.maximum.reduce([suit*.0015,slv*.0045,sock*.003,wrap*.0025,F['scalp']*.003])
me.vertices.foreach_set('co',(co+no*disp[:,None]).ravel()); me.update()
for p in me.polygons: p.use_smooth=True
# atributos para hornear
def attr(name,r,g,bb):
    a=me.color_attributes.new(name,'FLOAT_COLOR','POINT'); a.data.foreach_set('color',np.stack([r,g,bb,np.ones(N)],1).ravel())
attr('A',F['torso'],F['thigh'],F['leg']); attr('B',F['low'],F['scalp'],F['lips']); attr('C',F['head'],F['farmL'],F['farmR']); attr('D',F['uarmL'],F['eye'],F['ears'])
attr('PO',co[:,0]+1,co[:,1]+1,co[:,2])
sc=bpy.context.scene; sc.render.engine='CYCLES'
# Horneado: CPU por defecto (resultado de referencia). TARIMA_BAKE_GPU=1 lo pasa a GPU; ver HANDOFF sobre la comparación de mapas. Los hilos de CPU quedan limitados en los dos casos.
print('BAKE dispositivo',cycles_device(sc,gpu=os.environ.get('TARIMA_BAKE_GPU')=='1'))
bimg=bpy.data.images.new('bake',R,R,alpha=False,float_buffer=True); bimg.colorspace_settings.name='Non-Color'
bm_=bpy.data.materials.new('BakeMat'); bm_.use_nodes=True; nt=bm_.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out=nt.nodes.new('ShaderNodeOutputMaterial'); em=nt.nodes.new('ShaderNodeEmission'); at=nt.nodes.new('ShaderNodeVertexColor'); it=nt.nodes.new('ShaderNodeTexImage'); it.image=bimg
df=nt.nodes.new('ShaderNodeBsdfDiffuse')
nt.links.new(at.outputs['Color'],em.inputs['Color']); nt.links.new(em.outputs[0],out.inputs['Surface']); nt.nodes.active=it; it.select=True
me.materials.append(bm_)
# Se hornea sobre una copia subdividida igual que en finish.py (geo.subdivide): así la posición horneada es la de la malla final
# y los bordes definidos en 3D (ribetes, letras) no ondulan con la subdivisión.
bk=b.copy(); bk.data=me.copy(); sc.collection.objects.link(bk); bpy.ops.object.select_all(action="DESELECT"); bk.select_set(True); bpy.context.view_layer.objects.active=bk
import geo; geo.subdivide(bk); mk=bk.data; NK=len(mk.vertices); ck=np.empty(NK*3); mk.vertices.foreach_get('co',ck); ck=ck.reshape(NK,3)
mk.color_attributes['PO'].data.foreach_set('color',np.stack([ck[:,0]+1,ck[:,1]+1,ck[:,2],np.ones(NK)],1).ravel()); mk.update(); print('BAKE malla subdividida',NK)
b.hide_render=True   # si no, la malla original (coincidente) tapa a la copia en el AO
sc.render.bake.margin=10
def bake(name=None,kind='EMIT',samples=1):
    sc.cycles.samples=samples
    if name: at.layer_name=name
    if kind=='AO': nt.links.new(df.outputs[0],out.inputs['Surface'])
    bpy.ops.object.bake(type=kind)
    a=np.empty(R*R*4,dtype=np.float32); bimg.pixels.foreach_get(a); return a.reshape(R,R,4)[:,:,:3].copy()
u8=lambda a:(np.clip(a,0,1)*255+.5).astype(np.uint8)
maps={n:u8(bake(n)) for n in ('A','B','C','D')}; maps['PO']=bake('PO')
maps['AO']=u8(bake(kind='AO',samples=int(os.environ.get('TARIMA_AO','64')))[:,:,0])
nt.links.new(df.outputs[0],out.inputs['Surface']); sc.cycles.samples=1; sc.render.bake.normal_space='OBJECT'; bpy.ops.object.bake(type='NORMAL')   # normal de objeto (para tex.py: palma/dorso, caras hacia arriba)
a=np.empty(R*R*4,dtype=np.float32); bimg.pixels.foreach_get(a); maps['NO']=u8(a.reshape(R,R,4)[:,:,:3])
np.savez(OUT+'maps.npz',**maps); print('MAPS',R,{k:(v.dtype.name,v.shape) for k,v in maps.items()})
import json; json.dump({k:[float(u) for u in np.ravel(v)] for k,v in LM.items()},open(OUT+'lm.json','w'))
json.dump(dict(hip=list(hip),knee=list(knee),ank=list(ank),sh=list(sh),neck=list(neck),hemz=hemz,arms={s:[list(P(s+'ForeArm')),list(P(s+'Hand')),list(P(s+'Arm'))] for s in ('Left','Right')}),open(OUT+'bones.json','w'))
bpy.data.objects.remove(bk); b.hide_render=False; me.materials.clear()
for n in ('A','B','C','D','PO'): me.color_attributes.remove(me.color_attributes[n])
bpy.data.images.remove(bimg)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'s3.blend')
# cobertura UV para revisar
from PIL import Image
cov=(maps['PO'][:,:,2]>0.001)
Image.fromarray((np.clip(maps['PO'][::-1]/[2,2,1.8],0,1)*255).astype(np.uint8)).resize((768,768)).save(OUT+'uv_pos.png')
Image.fromarray(maps['AO'][::-1]).resize((768,768)).save(OUT+'uv_ao.png'); Image.fromarray(maps['NO'][::-1]).resize((768,768)).save(OUT+'uv_no.png')
