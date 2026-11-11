import bpy, os, sys, bmesh, json, math, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFont, ImageFilter
NAME=sys.argv[1]; OUT=out_dir(NAME)
STY={'ventura':dict(H=1.70,skin='#c68b63',suit='#c4161c',trim='#f4f2ec',sleeve='#1b2a44',sleeve2='#111a2c',code='ARX',name='VENTURA',hair='#17120f',beard=.6,tattoo=True,shoe=('#f2f1ec','#d8d4c8','#c4161c','#9a6b3c')),
     'brenner':dict(H=1.83,skin='#dcae8c',suit='#16264a',trim='#ffd23f',sleeve='#131316',sleeve2='#2a2a30',code='NVK',name='BRENNER',hair='#5b3f24',beard=.22,tattoo=False,shoe=('#1c1c20','#e8e6df','#ffd23f','#2a2a2e'))}[NAME]
FONT=next((p for p in [os.environ.get('TARIMA_FONT',''),'/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf','/System/Library/Fonts/Supplemental/Arial Bold.ttf','/Library/Fonts/Arial Bold.ttf','C:/Windows/Fonts/arialbd.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if p and os.path.exists(p)),None)
if FONT is None: raise SystemExit('Definí TARIMA_FONT con la ruta a una tipografía .ttf en negrita')
K=STY['H']/1.687
bpy.ops.wm.open_mainfile(filepath=OUT+'s3.blend')
b=bpy.data.objects['Human']; rig=bpy.data.objects['Human.rig']; me=b.data
M=np.load(OUT+'maps.npz'); LM={k:np.array(v) for k,v in json.load(open(OUT+'lm.json')).items()}; BJ=json.load(open(OUT+'bones.json'))
R=M['PO'].shape[0]
PO=M['PO']; x=PO[:,:,0]-1; y=PO[:,:,1]-1; z=PO[:,:,2]; cov=PO[:,:,0]>.01
A,B,C,D=M['A'],M['B'],M['C'],M['D']; AO=np.asarray(Image.fromarray((np.clip(M['AO'][:,:,0],0,1)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5)))/255.
F=dict(torso=A[:,:,0],thigh=A[:,:,1],leg=A[:,:,2],low=B[:,:,0],scalp=B[:,:,1],lips=B[:,:,2],head=C[:,:,0],farmL=C[:,:,1],farmR=C[:,:,2],uarmL=D[:,:,0],ears=D[:,:,2])
sm=lambda e0,e1,v:(lambda t:t*t*(3-2*t))(np.clip((v-e0)/(e1-e0),0,1))
hexc=lambda h:np.array([int(h[i:i+2],16)/255 for i in (1,3,5)])
hip,knee,ank,sh,neck=[np.array(BJ[k]) for k in ('hip','knee','ank','sh','neck')]; hemz=BJ['hemz']
axo=np.abs(x); rng=np.random.default_rng(7)
def noise(scale,blur):
    n=rng.random((R//scale,R//scale)).astype(np.float32); im=Image.fromarray((n*255).astype(np.uint8)).resize((R,R),Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur)); return np.asarray(im)/255-.5
col=np.tile(hexc(STY['skin']),(R,R,1)).astype(np.float32); rough=np.full((R,R),.5,np.float32)
def mix(m,c,r=None):
    global col,rough; m=np.clip(m,0,1); c=np.asarray(c); c=c[None,None,:] if c.ndim==1 else c; col=col*(1-m[:,:,None])+c*m[:,:,None]
    if r is not None: rough=rough*(1-m)+r*m
# piel: variación y rubor
col*=(1+noise(64,6)[:,:,None]*.10)*(1+noise(2,.6)[:,:,None]*.05)
nose=LM['nose']; dn=np.sqrt((x-nose[0])**2*0.5+(y-nose[1])**2+(z-(nose[2]+.005))**2)
mix(F['head']*.3*np.exp(-(dn/.05)**2),hexc('#c2695a')); mix(F['ears']*.3,hexc('#c2695a'))
# ropa
E=.012
front=y<neck[1]
scoop=np.where(front,np.sqrt((x/(.085*K))**2+((z-(neck[2]+.03*K))/(.19*K))**2),np.sqrt((x/(.075*K))**2+((z-(neck[2]+.03*K))/(.1*K))**2))
arm=np.sqrt(((axo-(sh[0]+.03*K))/(sh[0]+.03*K-.118*K))**2+((z-(sh[2]+.04*K))/(.2*K))**2)
TF=np.where(z>sh[2]-.2,(1-F['head']*(z>neck[2]+.02))*(axo<.3)*(1-np.maximum(F['farmL'],F['farmR'])),sm(.35,.65,F['torso']))
suit=np.maximum(TF*sm(1-E,1+E,scoop)*sm(1-E,1+E,arm)*sm(neck[2]+.03,neck[2]+.02,z),sm(.45,.55,F['thigh'])*sm(hemz-.001,hemz+.001,z))
SUIT=hexc(STY['suit'])
mix(suit,SUIT*(1+noise(4,1)[:,:,None]*.06),.62)
trim=suit*np.maximum(np.maximum(sm(1.12,1.09,scoop),sm(1.12,1.09,arm))*TF,sm(hemz+.02,hemz+.018,z)*F['thigh'])
mix(trim,hexc(STY['trim']))
stripe=suit*sm(.022,.018,np.abs(y-.005))*sm(.125,.13,axo)*sm(sh[2]-.2,sh[2]-.21,z); mix(stripe,hexc(STY['trim']))
def text_mask(txt,size=220):
    f=ImageFont.truetype(FONT,size); bb=f.getbbox(txt); im=Image.new('L',(bb[2]-bb[0]+20,bb[3]-bb[1]+20),0); ImageDraw.Draw(im).text((10-bb[0],10-bb[1]),txt,font=f,fill=255); return np.asarray(im)/255
def decal(txt,cx,cz,width,u,mask,c):
    t=text_mask(txt); h=width*t.shape[0]/t.shape[1]
    uu=(u-(cx-width/2))/width; vv=((cz+h/2)-z)/h; ok=(uu>=0)&(uu<1)&(vv>=0)&(vv<1)
    s=np.zeros_like(z); s[ok]=t[(vv[ok]*t.shape[0]).astype(int),(uu[ok]*t.shape[1]).astype(int)]; mix(s*mask,c)
decal(STY['code'],0,sh[2]-.165*K,.13*K,x,suit*(y<-.04),hexc(STY['trim']))
decal(STY['name'],0,sh[2]-.13*K,.21*K,-x,suit*(y>.03),hexc(STY['trim']))
slv=sm(.45,.55,F['leg'])*sm(knee[2]-.112-.001,knee[2]-.112+.001,z)*sm(knee[2]+.102+.001,knee[2]+.102-.001,z)
mix(slv,hexc(STY['sleeve'])*(1+noise(2,.5)[:,:,None]*.18),.82)
mix(slv*np.maximum(sm(knee[2]+.094,knee[2]+.096,z),sm(knee[2]-.104,knee[2]-.106,z)),hexc(STY['sleeve2']))
sock=sm(.45,.55,F['low'])*sm(ank[2]+.132+.001,ank[2]+.132-.001,z)
mix(sock,hexc('#edece6')*(1-.05*(np.sin(z*2*np.pi/.004)>0)[:,:,None]),.9)
for side,fl in (('Left',F['farmL']),('Right',F['farmR'])):
    a,w,_=[np.array(p) for p in BJ['arms'][side]]; d=w-a; L=np.linalg.norm(d); d/=L
    t=((x-a[0])*d[0]+(y-a[1])*d[1]+(z-a[2])*d[2])/L
    wr=sm(.45,.55,fl)*sm(.748,.752,t)*sm(1.1,1.09,t); mix(wr,hexc('#e6e2d6')*(1-.07*(np.sin(t*2*np.pi/.045+x*60)>0.6)[:,:,None]),.9)
# tatuaje: dos bandas en el brazo izquierdo
a,w,s0=[np.array(p) for p in BJ['arms']['Left']]; d=a-s0; L=np.linalg.norm(d); d/=L
t=((x-s0[0])*d[0]+(y-s0[1])*d[1]+(z-s0[2])*d[2])/L
band=np.maximum(sm(.50,.505,t)*sm(.60,.595,t),sm(.635,.64,t)*sm(.665,.66,t))
mix(sm(.5,.6,F['uarmL'])*band*.82*STY['tattoo'],hexc('#1f2a2b'))
# pelo, barba, cejas, labios
HAIR=hexc(STY['hair'])
mix(F['scalp']*(.9+noise(1,.4)*.25),HAIR,.75)
lips,chin,ear,eL=LM['lips'],LM['chin'],LM['ears'],LM['eyeL']
st=1+noise(1,.5)*.9
upper=lips[2]+.004+.3*np.clip(y-lips[1],0,.2)
jaw=sm(upper+.006,upper-.004,z)*np.maximum(sm(.024,.034,axo),sm(lips[2]-.006,lips[2]-.014,z))
must=sm(lips[2]+.005,lips[2]+.009,z)*sm(nose[2]-.003,nose[2]-.008,z)*sm(.034,.024,axo)*sm(lips[1]+.03,lips[1]+.02,y)
burn=sm(ear[1]-.034,ear[1]-.028,y)*sm(ear[1]-.008,ear[1]-.014,y)*sm(eL[2]+.012,eL[2]+.002,z)*sm(lips[2],lips[2]+.01,z)
fade=sm(chin[2]-.05,chin[2]-.015,z)*sm(ear[1]-.006,ear[1]-.02,y)
beard=F['head']*np.maximum.reduce([jaw*fade,must,burn])*(1-np.clip(F['lips']*4,0,1))
mix(beard*STY['beard']*st,HAIR,.7)
zc=eL[2]+.0235-9*(axo-.032)**2; th=.0042*sm(.056,.03,axo)+.001
brow=F['head']*sm(th,th*.5,np.abs(z-zc))*sm(.009,.013,axo)*sm(.056,.05,axo)*(y<eL[1]+.02); mix(brow*.92*st,HAIR)
mix(sm(.3,.8,F['lips'])*.75,hexc('#a4605a'),.38)
# oclusión
ao=AO**1.3; tint=np.array([.5,.33,.3]); col=col*(tint[None,None,:]+(1-tint[None,None,:])*ao[:,:,None])
col=np.clip(col,0,1); col[~cov]=hexc(STY['skin'])
Image.fromarray((col[::-1]*255).astype(np.uint8)).save(OUT+'body_color.png')
orm=np.stack([np.ones_like(rough),rough,np.zeros_like(rough)],2); Image.fromarray((orm[::-1]*255).astype(np.uint8)).save(OUT+'body_orm.png')
Image.fromarray((col[::-1]*255).astype(np.uint8)).resize((900,900)).save(OUT+'tex_preview.png')
# ojo
S=256; yy,xx=np.mgrid[0:S,0:S]; v=1-yy/S; u=xx/S
ey=np.tile(hexc('#f1ede6'),(S,S,1)); ey*=1-(.1*sm(.75,.3,v))[:,:,None]
ir=sm(.845,.86,v); irc=hexc('#5a3d24')[None,None,:]*(0.7+.5*sm(.86,.95,v)[:,:,None])*(1+.25*np.sin(u*2*np.pi*40)[:,:,None]*sm(.99,.9,v)[:,:,None])
ey=ey*(1-ir[:,:,None])+irc*ir[:,:,None]; lim=sm(.845,.86,v)*sm(.875,.86,v); ey*=1-.6*lim[:,:,None]
pu=sm(.945,.955,v); ey=ey*(1-pu[:,:,None])
Image.fromarray((np.clip(ey,0,1)*255).astype(np.uint8)).save(OUT+'eye.png')

# ---------- materiales ----------
def texmat(name,cpath,ormpath=None,rough=.5):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; bs=nt.nodes['Principled BSDF']
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(cpath); nt.links.new(t.outputs['Color'],bs.inputs['Base Color'])
    if ormpath:
        o=nt.nodes.new('ShaderNodeTexImage'); o.image=bpy.data.images.load(ormpath); o.image.colorspace_settings.name='Non-Color'; sp=nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'],sp.inputs[0]); nt.links.new(sp.outputs[1],bs.inputs['Roughness']); nt.links.new(sp.outputs[2],bs.inputs['Metallic'])
    else: bs.inputs['Roughness'].default_value=rough
    return m
def flat(name,h,rough):
    m=bpy.data.materials.new(name); m.use_nodes=True; bs=m.node_tree.nodes['Principled BSDF']; c=hexc(h); lin=[((u/12.92) if u<=.04045 else ((u+.055)/1.055)**2.4) for u in c]
    bs.inputs['Base Color'].default_value=(*lin,1); bs.inputs['Roughness'].default_value=rough; return m
me.materials.append(texmat('Body',OUT+'body_color.png',OUT+'body_orm.png'))
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
parts=[]
def newobj(name,bm_,mats,group):
    m=bpy.data.meshes.new(name); bm_.to_mesh(m); bm_.free(); o=bpy.data.objects.new(name,m); bpy.context.scene.collection.objects.link(o)
    for mt in mats: m.materials.append(mt)
    vg=o.vertex_groups.new(name=group); vg.add(list(range(len(m.vertices))),1.0,'REPLACE')
    for p in m.polygons: p.use_smooth=True
    parts.append(o); return o
eyem=texmat('Eyes',OUT+'eye.png',rough=.12)
for k in ('eyeL','eyeR'):
    e=bmesh.new(); e.loops.layers.uv.new('UVMap'); bmesh.ops.create_uvsphere(e,u_segments=20,v_segments=12,radius=float(LM['eyeR_r'][0]),calc_uvs=True)
    bmesh.ops.rotate(e,verts=e.verts,cent=(0,0,0),matrix=Matrix.Rotation(math.radians(90),3,'X'))  # polo +Z -> -Y (frente)
    bmesh.ops.translate(e,verts=e.verts,vec=Vector(LM[k])); newobj(k,e,[eyem],'mixamorig:Head')
# ---------- zapatillas ----------
SM=[flat('ShoeUpper',STY['shoe'][0],.42),flat('ShoeSole',STY['shoe'][1],.6),flat('ShoeAccent',STY['shoe'][2],.45),flat('ShoeHeel',STY['shoe'][3],.5)]
for sgn,side in ((1,'Left'),(-1,'Right')):
    s=bmesh.new()
    for c,n in footpts[sgn]:
        s.verts.new(c+n*.007)
    bmesh.ops.convex_hull(s,input=s.verts)
    o=newobj('Shoe'+side,s,SM,'mixamorig:'+side+'Foot')
    bpy.context.view_layer.objects.active=o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    r=o.modifiers.new('r','REMESH'); r.mode='VOXEL'; r.voxel_size=.007; bpy.ops.object.modifier_apply(modifier='r')
    sm_=o.modifiers.new('s','SMOOTH'); sm_.iterations=6; sm_.factor=.5; bpy.ops.object.modifier_apply(modifier='s')
    m=o.data; ys=[v.co.y for v in m.vertices]; y0,y1=min(ys),max(ys)  # y0 = punta (frente es -Y)
    for v in m.vertices:
        if v.co.z<.012: v.co.z=-.016
        if v.co.z>.118: v.co.z=.118
    for p in m.polygons:
        c=p.center; ty=(c.y-y0)/(y1-y0); p.use_smooth=True
        if c.z<.009: p.material_index=3 if ty>.6 else 1
        elif .40<ty<.53 and c.z>.03: p.material_index=2
        elif ty>.88 and c.z>.02: p.material_index=2
        else: p.material_index=0
    vg=o.vertex_groups.get('mixamorig:'+side+'Foot') or o.vertex_groups.new(name='mixamorig:'+side+'Foot'); vt=o.vertex_groups.new(name='mixamorig:'+side+'ToeBase')
    ty0=rig.data.bones['mixamorig:'+side+'ToeBase'].head_local.y
    for v in m.vertices:
        w=min(1,max(0,(ty0+.012-v.co.y)/.03)); vg.add([v.index],1-w,'REPLACE'); vt.add([v.index],w,'REPLACE')
    print(side,'shoe verts',len(m.vertices))
# unir
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
b.select_set(True); bpy.context.view_layer.objects.active=b; bpy.ops.object.join()
me=b.data; print('final verts',len(me.vertices),'tris',sum(len(p.vertices)-2 for p in me.polygons),'mats',[m.name for m in me.materials])
exec(open(os.path.join(HERE,'poses.py'),encoding='utf-8').read())
