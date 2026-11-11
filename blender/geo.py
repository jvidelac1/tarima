"""Geometría y skinning del personaje (pista PERSONAJE). Lo llama finish.py.
- smooth_weights: suavizado dirigido de pesos alrededor de hombro/axila, codo, muñeca, cadera y rodilla (sin huesos nuevos).
- subdivide: un nivel de Catmull-Clark aplicado al cuerpo (los pesos y el UV se interpolan).
- garments: volumen real de rodilleras, vendas de muñeca y medias, con borde neto.
- eyeball: globo ocular con abultamiento de córnea.
- correctives: morphs 'corr_*' = (malla posada con Corrective Smooth) - (skinning lineal), llevados a reposo, con driver.
"""
import bpy, bmesh, math, numpy as np
from mathutils import Vector, Matrix, Quaternion
PRE='mixamorig:'
def sm(e0,e1,v):
    t=np.clip((np.asarray(v,float)-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def coords(ob):
    n=len(ob.data.vertices); a=np.empty(n*3); ob.data.vertices.foreach_get('co',a); return a.reshape(n,3)
def wget(ob):
    names=[g.name for g in ob.vertex_groups if g.name.startswith(PRE)]; idx={g.index:names.index(g.name) for g in ob.vertex_groups if g.name.startswith(PRE)}
    W=np.zeros((len(ob.data.vertices),len(names)))
    for v in ob.data.vertices:
        for g in v.groups:
            j=idx.get(g.group)
            if j is not None: W[v.index,j]=g.weight
    return names,W
def wset(ob,names,W,rows,keep=4):
    """Escribe los pesos de las filas indicadas: máximo 'keep' influencias, normalizados."""
    gs=[ob.vertex_groups[n] for n in names]
    for i in rows:
        w=W[i].copy(); o=np.argsort(w)[::-1][:keep]; s=w[o].sum()
        if s<=0: continue
        for j in np.nonzero(W[i]>0)[0]: gs[j].remove([int(i)])
        for j in o:
            if w[j]/s>.004: gs[j].add([int(i)],float(w[j]/s),'REPLACE')
def head(rig,n): return np.array(rig.data.bones[PRE+n].head_local)
# (hueso de la articulación, radio en m para 1,69 m, iteraciones, lambda)
REGIONS=(('Arm',.185,10,.6),('ForeArm',.085,3,.5),('Hand',.05,2,.5),('UpLeg',.17,5,.5),('Leg',.10,3,.5))
def smooth_weights(b,rig,K):
    names,W=wget(b); co=coords(b); N=len(co); W0=W.copy()
    E=np.empty(len(b.data.edges)*2,int); b.data.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.bincount(E.ravel(),minlength=N).astype(float); deg[deg==0]=1
    touched=np.zeros(N,bool)
    for side in ('Left','Right'):
        for bone,r,it,lam in REGIONS:
            c=head(rig,side+bone); d=np.linalg.norm(co-c,axis=1); m=sm(r*K,r*K*.5,d)
            if bone=='Arm':   # la axila y el dorsal quedan más abajo que la articulación: región alargada hacia la costilla
                c2=c+np.array([-.04*K*(1 if side=='Left' else -1),0,-.09*K]); m=np.maximum(m,sm(r*K*.9,r*K*.45,np.linalg.norm(co-c2,axis=1)))
            m*=(co[:,0]*(1 if side=='Left' else -1)>-.02)
            k=m>0; touched|=k
            for _ in range(it):
                A=np.zeros_like(W); np.add.at(A,E[:,0],W[E[:,1]]); np.add.at(A,E[:,1],W[E[:,0]]); A/=deg[:,None]
                W=W*(1-lam*m[:,None])+A*(lam*m[:,None])
    # hombro: el deltoides no se hunde si la clavícula (Shoulder) acompaña un poco más y el tórax suelta el brazo
    for sgn,side in ((1,'Left'),(-1,'Right')):
        a=head(rig,side+'Arm'); e=head(rig,side+'ForeArm'); ax=(e-a)/np.linalg.norm(e-a); t=(co-a)@ax; rad=np.linalg.norm(co-a-np.outer(t,ax),axis=1)
        ia,ish=names.index(PRE+side+'Arm'),names.index(PRE+side+'Shoulder')
        cap=sm(.075*K,.0,np.abs(t))*sm(.10*K,.05*K,rad)*(co[:,2]>a[2]-.02*K)*sm(-.02*K,.03*K,(co[:,0]-a[0])*sgn+.03*K)   # casquete superior del hombro
        mv=W[:,ia]*cap*.35; W[:,ia]-=mv; W[:,ish]+=mv
    W/=np.maximum(W.sum(1,keepdims=True),1e-9)
    rows=np.nonzero(touched&(np.abs(W-W0).max(1)>1e-4))[0]; wset(b,names,W,rows); print('SKIN pesos suavizados en',len(rows),'vértices de',N)
def subdivide(b,levels=1):
    bpy.context.view_layer.objects.active=b; bpy.ops.object.select_all(action='DESELECT'); b.select_set(True)
    m=b.modifiers.new('sub','SUBSURF'); m.levels=levels; m.subdivision_type='CATMULL_CLARK'; m.uv_smooth='NONE'; m.boundary_smooth='PRESERVE_CORNERS'
    bpy.ops.object.modifier_move_to_index(modifier='sub',index=0); bpy.ops.object.modifier_apply(modifier='sub')
    for p in b.data.polygons: p.use_smooth=True
def garments(b,rig,BJ,K):
    """Volumen de prendas sobre la malla ya subdividida. Mismos límites que la textura de finish.py."""
    names,W=wget(b); dom=np.array([n[len(PRE):] for n in names])[W.argmax(1)]; co=coords(b); me=b.data; N=len(co)
    no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3); z=co[:,2]; knee=BJ['knee'][2]; ank=BJ['ank'][2]; E=.0035
    leg=np.isin(dom,['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']); low=np.isin(dom,['LeftLeg','RightLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase'])
    slv=leg*sm(knee-.112-E,knee-.112+E,z)*sm(knee+.102+E,knee+.102-E,z)
    slv=slv*(1+.35*sm(knee-.10,knee-.112,z)+.35*sm(knee+.09,knee+.102,z))      # ribete más grueso en los bordes
    sock=low*sm(ank+.132+E,ank+.132-E,z)*(1+.6*sm(ank+.115,ank+.13,z))
    wrap=np.zeros(N)
    for side in ('Left','Right'):
        a,w,_=[np.array(p) for p in BJ['arms'][side]]; d=w-a; L=np.linalg.norm(d); d/=L; t=((co-a)@d)/L
        wrap=np.maximum(wrap,np.isin(dom,[side+'ForeArm',side+'Hand'])*sm(.75-.012,.75+.012,t)*sm(1.05,1.02,t))   # la venda termina en el pliegue de la muñeca: sobre el talón de la mano el borde se rompía
    disp=np.maximum.reduce([slv*.0042,sock*.0016,wrap*.0032])
    me.vertices.foreach_set('co',(co+no*disp[:,None]).ravel()); me.update(); print('GARM vértices desplazados',int((disp>1e-5).sum()))
def eyeball(R,center,useg=28,vseg=18):
    e=bmesh.new(); e.loops.layers.uv.new('UVMap'); bmesh.ops.create_uvsphere(e,u_segments=useg,v_segments=vseg,radius=R,calc_uvs=True)
    lim=math.radians(31)
    for v in e.verts:
        ph=math.acos(max(-1,min(1,v.co.z/R)))
        if ph<lim: v.co.z+=R*.085*math.cos(ph/lim*math.pi/2)**1.3     # córnea
    bmesh.ops.rotate(e,verts=e.verts,cent=(0,0,0),matrix=Matrix.Rotation(math.radians(90),3,'X'))  # polo +Z -> -Y (frente)
    bmesh.ops.translate(e,verts=e.verts,vec=Vector(center)); return e
# ---------- morphs correctivos ----------
def _posed(b,normals=False):
    dg=bpy.context.evaluated_depsgraph_get(); dg.update(); ev=b.evaluated_get(dg); m=ev.to_mesh(); a=np.empty(len(m.vertices)*3); m.vertices.foreach_get('co',a); n=np.empty(len(m.vertices)*3)
    if normals: m.vertices.foreach_get('normal',n)
    ev.to_mesh_clear(); return (a.reshape(-1,3),n.reshape(-1,3)) if normals else a.reshape(-1,3)
def _delta(b,rig,basis,mask,iters,factor,sculpt=None,gain=1.0):
    """Delta en espacio de reposo que lleva el skinning lineal a la versión con Corrective Smooth en la pose 'basis'."""
    pb=rig.pose.bones
    for p in pb: p.matrix_basis=Matrix()
    for n,q in basis.items(): pb[PRE+n].matrix_basis=Quaternion(q).to_matrix().to_4x4()
    bpy.context.view_layer.update(); lbs,nrm=_posed(b,True)
    vg=b.vertex_groups.new(name='_corr'); idx=np.nonzero(mask>0)[0]
    for i in idx: vg.add([int(i)],float(mask[i]),'REPLACE')
    m=b.modifiers.new('_cs','CORRECTIVE_SMOOTH'); m.factor=factor; m.iterations=iters; m.smooth_type='LENGTH_WEIGHTED'; m.rest_source='ORCO'; m.vertex_group='_corr'; m.use_pin_boundary=True
    dm=lbs+(_posed(b)-lbs)*gain; b.modifiers.remove(m); b.vertex_groups.remove(vg)
    if sculpt is not None: dm=dm+sculpt(lbs,nrm)*mask[:,None]
    names,W=wget(b); S=np.stack([np.array((pb[n].matrix@rig.data.bones[n].matrix_local.inverted()).to_3x3()) for n in names])
    M=np.einsum('vg,gij->vij',W[idx],S); d=np.zeros_like(lbs); d[idx]=np.linalg.solve(M,(dm-lbs)[idx][:,:,None])[:,:,0]
    for p in pb: p.matrix_basis=Matrix()
    bpy.context.view_layer.update(); return d
def _driver(b,rig,key,vars_,expr):
    fc=b.data.shape_keys.key_blocks[key].driver_add('value'); d=fc.driver; d.type='SCRIPTED'
    for nm,(bone,ax) in vars_.items():
        v=d.variables.new(); v.name=nm; v.type='TRANSFORMS'; t=v.targets[0]; t.id=rig; t.bone_target=PRE+bone; t.transform_type='LOC_'+ax; t.transform_space='WORLD_SPACE'
    d.expression=expr
    if len(expr)>255: print('DRIVER demasiado largo',key,len(expr))
ARMUP={'Shoulder':(0.9703,-0.2139,0.0334,0.1079),'Arm':(0.541,-0.0486,-0.3339,0.7704)}   # brazos bloqueados arriba (Envión · Final), lado izquierdo
KNEE={'UpLeg':(0.5402,0.8049,-0.1136,0.2179),'Leg':(0.3495,-0.9343,0,0.0699)}             # sentadilla profunda (Recepción de la cargada)
ELBOW={'ForeArm':(0.6265,0.2046,0.2702,0.7019)}                                           # codo cerrado del rack
WRIST={'Left':{'Hand':(0.7034,-0.2786,0.0745,0.6496)},'Right':{'Hand':(0.7038,-0.1294,-0.1042,-0.6906)}}   # muñeca extendida ~90° del rack (el reposo de las manos no es simétrico)
GAIN={'knee':.5}   # bisagras con morph y fracción del Corrective Smooth que se conserva. Codo (máx 6 mm) y muñeca (rompía el borde de la venda) quedan sin morph: el skinning lineal se ve mejor
mir=lambda q:(q[0],q[1],-q[2],-q[3])
HINGE={'knee':(('UpLeg','Leg','Foot'),(60,140)),'elbow':(('Arm','ForeArm','Hand'),(60,140)),'wrist':(('ForeArm','Hand','HandMiddle1'),(35,85))}   # huesos y rango de flexión (grados)
# Escultura por reglas del hombro con el brazo arriba (se suma al Corrective Smooth en la pose de referencia, en espacio posado).
# Cada término: (nombre, centro o segmento en el marco del brazo [a lo largo del brazo, lateral, frente] en m para 1,69 m, radio, empuje sobre la normal)
ARMUP_SCULPT=dict(delt=((.030,-.035,.0),None,.062,.014),trap=((-.005,-.085,-.015),None,.055,.014),pit=((-.075,.030,.005),None,.040,-.014),
                  lat=((-.035,.030,-.050),(-.200,.015,-.050),.028,.008),pec=((-.035,.010,.050),(-.130,-.045,.070),.028,.007))
def armup_sculpt(rig,K,co):
    pb=rig.pose.bones; J=lambda n:np.array(pb[PRE+n].matrix.translation)
    def f(P,Nn):
        D=np.zeros_like(P)
        for sgn,side in ((1,'Left'),(-1,'Right')):
            A=J(side+'Arm'); u=J(side+'ForeArm')-A; u/=np.linalg.norm(u); l=np.array([sgn,0,0.]); l-=u*(l@u); l/=np.linalg.norm(l); fr=np.cross(l,u); fr*=(-1 if fr[1]>0 else 1)
            pt=lambda c:A+K*(u*c[0]+l*c[1]+fr*c[2]); sd=(co[:,0]*sgn>0)
            for nm,(c0,c1,r,amp) in ARMUP_SCULPT.items():
                a=pt(c0)
                if c1 is None: w=np.exp(-(np.linalg.norm(P-a,axis=1)/(r*K))**2)
                else:
                    d=pt(c1)-a; t=np.clip(((P-a)@d)/(d@d),0,1); w=np.exp(-(np.linalg.norm(P-a-np.outer(t,d),axis=1)/(r*K))**2)*(1-.6*t)
                D+=Nn*(w*sd*amp*K)[:,None]
        return D
    return f
def armup_weight(rig,side):
    """Contrato 6: smoothstep(60°,150°) del ángulo entre la dirección del brazo y su reposo, en el marco de Spine2."""
    pb=rig.pose.bones; s2=pb[PRE+'Spine2']; d=s2.matrix.to_3x3().inverted()@(pb[PRE+side+'ForeArm'].matrix.translation-pb[PRE+side+'Arm'].matrix.translation)
    r=s2.bone.matrix_local.to_3x3().inverted()@(rig.data.bones[PRE+side+'ForeArm'].head_local-rig.data.bones[PRE+side+'Arm'].head_local)
    return float(sm(math.radians(60),math.radians(150),d.angle(r)))
def correctives(b,rig,K):
    co=coords(b); pb=rig.pose.bones; H=lambda n:head(rig,n); sides=((1,'Left'),(-1,'Right')); keys={}
    def region(c,r,sgn,c2=None):
        m=sm(r,r*.55,np.linalg.norm(co-c,axis=1))
        if c2 is not None: m=np.maximum(m,sm(r,r*.55,np.linalg.norm(co-c2,axis=1)))
        return m*(co[:,0]*sgn>.005)
    # brazos arriba: los dos lados a la vez (todavía no hay shape keys que contaminen la medición)
    basis={}; mask=np.zeros(len(co))
    for sgn,side in sides:
        for bn,q in ARMUP.items(): basis[side+bn]=q if sgn>0 else mir(q)
        a=H(side+'Arm'); mask=np.maximum(mask,region(a,.21*K,sgn,a+np.array([-.05*K*sgn,0,-.10*K])))
    for p in pb: p.matrix_basis=Matrix()
    for n,q in basis.items(): pb[PRE+n].matrix_basis=Quaternion(q).to_matrix().to_4x4()
    bpy.context.view_layer.update(); w0={side:armup_weight(rig,side) for _,side in sides}
    d=_delta(b,rig,basis,mask,24,.55,sculpt=armup_sculpt(rig,K,co))
    for sgn,side in sides: keys['corr_armUp_'+side[0]]=d*((co[:,0]*sgn>0)[:,None])/max(w0[side],.5)
    # rodilla en flexión profunda y codo cerrado: peso = smoothstep(lo,hi, flexión), flexión = ángulo entre los dos segmentos
    for nm,ref,(p0,p1,p2),r in (('knee',KNEE,HINGE['knee'][0],.15),('elbow',ELBOW,HINGE['elbow'][0],.10),('wrist',WRIST,HINGE['wrist'][0],.075)):
        if nm not in GAIN: continue
        basis={}; mask=np.zeros(len(co))
        for sgn,side in sides:
            for bn,q in ref.get(side,ref).items(): basis[side+bn]=q if (sgn>0 or side in ref) else mir(q)
            mask=np.maximum(mask,region(H(side+p1),r*K,sgn))
        for p in pb: p.matrix_basis=Matrix()
        for n,q in basis.items(): pb[PRE+n].matrix_basis=Quaternion(q).to_matrix().to_4x4()
        bpy.context.view_layer.update(); P=lambda n:pb[PRE+n].matrix.translation
        wr={side:float(sm(*[math.radians(x) for x in HINGE[nm][1]],(P(side+p1)-P(side+p0)).angle(P(side+p2)-P(side+p1)))) for _,side in sides}
        d=_delta(b,rig,basis,mask,16,.5,gain=GAIN[nm]); print(f'CORR {nm}: peso en la pose de referencia {wr}')
        for sgn,side in sides: keys[f'corr_{nm}_{side[0]}']=d*((co[:,0]*sgn>0)[:,None])/max(wr[side],.5)
    # solo el cuerpo lleva morphs: pelo, pestañas, zapatillas, ojos y cinturón quedan en cero (export_web.py los pasa a una malla sin targets)
    mi=[i for i,m in enumerate(b.data.materials) if m.name=='Body']; body=np.zeros(len(co),bool)
    for p in b.data.polygons:
        if p.material_index in mi: body[list(p.vertices)]=True
    for k in keys: keys[k]=keys[k]*body[:,None]
    b.shape_key_add(name='Basis')
    for k,dv in keys.items():
        sk=b.shape_key_add(name=k); sk.data.foreach_set('co',(co+dv).ravel()); sk.value=0
        print(f'CORR {k}: {int((np.linalg.norm(dv,axis=1)>2e-4).sum())} vértices, máx {np.linalg.norm(dv,axis=1).max()*1000:.1f} mm')
    # drivers (expresiones simples, sin Python): todo sale de posiciones de huesos en espacio de mundo
    S,Nk,L,Rr=H('Spine2'),H('Neck'),H('LeftShoulder'),H('RightShoulder'); X=L-Rr; Z=Nk-S
    for sgn,side in sides:
        a,f=H(side+'Arm'),H(side+'ForeArm'); r=(f-a); ua=np.linalg.norm(r); r/=ua
        Q=L-S; al,be,ga=np.linalg.solve(np.stack([X,Z,Q],1),r)/ua     # eje de reposo exacto en la base rígida de Spine2 (X=L-R, Z=N-S, Q=L-S)
        print(f'CORR driver armUp {side}: w0={w0[side]:.2f} coef {al:.3f} {be:.3f} {ga:.3f}')
        vars_={}
        for nm,bone in (('f',side+'ForeArm'),('a',side+'Arm'),('l','LeftShoulder'),('r','RightShoulder'),('n','Neck'),('s','Spine2')):
            for ax in 'XYZ': vars_[nm+ax.lower()]=(bone,ax)
        dot=lambda c1,p,q:f'{c1:.3f}*('+'+'.join(f'(f{c}-a{c})*({p}{c}-{q}{c})' for c in 'xyz')+')'
        _driver(b,rig,'corr_armUp_'+side[0],vars_,f'smoothstep(1.0472,2.618,acos(clamp({dot(al,"l","r")}+{dot(be,"n","s")}+{dot(ga,"l","s")},-1,1)))')
        for nm,((p0,p1,p2),(lo,hi)) in HINGE.items():
            if nm not in GAIN: continue
            l1=np.linalg.norm(H(side+p1)-H(side+p0)); l2=np.linalg.norm(H(side+p2)-H(side+p1)); vars_={}
            for q,bone in (('p',side+p0),('q',side+p1),('r',side+p2)):
                for ax in 'XYZ': vars_[q+ax.lower()]=(bone,ax)
            dt='+'.join(f'(q{c}-p{c})*(r{c}-q{c})' for c in 'xyz')
            _driver(b,rig,f'corr_{nm}_{side[0]}',vars_,f'smoothstep({math.radians(lo):.4f},{math.radians(hi):.4f},acos(clamp(({dt})/{l1*l2:.5f},-1,1)))')
    bpy.context.view_layer.update()
# ---------- pelo con volumen (capas) y pestañas (tarjetas) ----------
def hair_shells(b,OUT,mat,layers=6,size=.024):
    """Capas concéntricas sobre cuero cabelludo, barba y cejas. El largo por vértice sale de hair_len.png (tex.py, 255 = 20 mm);
    el UV es una proyección por caja que repite el mosaico hair.png cada 'size' m. Las capas van de adentro hacia afuera (orden de dibujo con alfa)."""
    from PIL import Image
    L=np.asarray(Image.open(OUT+'hair_len.png').convert('L')).astype(float)/255*.02; Rr=L.shape[0]; me=b.data; N=len(me.vertices); uvl=me.uv_layers.active.data
    lu=np.empty(len(me.loops)*2); uvl.foreach_get('uv',lu); lu=lu.reshape(-1,2); lv=np.empty(len(me.loops),int); me.loops.foreach_get('vertex_index',lv); vu=np.zeros((N,2)); vu[lv]=lu
    ln=L[np.clip(((1-vu[:,1])*Rr).astype(int),0,Rr-1),np.clip((vu[:,0]*Rr).astype(int),0,Rr-1)]; co=coords(b); no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3)
    ln*=(co[:,2]>head(rig_of(b),'Neck')[2]-.02)
    E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.maximum(np.bincount(E.ravel(),minlength=N),1)
    for _ in range(3):      # el largo decae suave hacia el borde: sin escalón en el nacimiento
        A=np.zeros(N); np.add.at(A,E[:,0],ln[E[:,1]]); np.add.at(A,E[:,1],ln[E[:,0]]); ln=np.minimum(ln,.5*ln+.5*A/deg)
    sel=[p for p in me.polygons if min(ln[v] for v in p.vertices)>.0004]; ln=np.maximum(ln,.0009)   # sin caras apoyadas sobre la piel (el borde ralo lo da la textura)
    used=sorted({v for p in sel for v in p.vertices}); ix={v:i for i,v in enumerate(used)}
    comb=np.array([0,.3,-1.]); comb/=np.linalg.norm(comb); bm=bmesh.new(); uv=bm.loops.layers.uv.new('UVMap'); U=np.array(used)
    for k in range(1,layers+1):
        f=k/layers; pos=co[U]+no[U]*(ln[U]*f)[:,None]+comb[None,:]*(ln[U]*f*f*.45)[:,None]; vs=[bm.verts.new(q) for q in pos]
        for p in sel:
            fc=bm.faces.new([vs[ix[v]] for v in p.vertices]); fc.smooth=True; ax=int(np.argmax(np.abs(p.normal))); a,c=[i for i in range(3) if i!=ax]
            for lp,v in zip(fc.loops,p.vertices): lp[uv].uv=(co[v][a]/size,co[v][c]/size)
    m=bpy.data.meshes.new('Hair'); bm.to_mesh(m); bm.free(); o=bpy.data.objects.new('Hair',m); bpy.context.scene.collection.objects.link(o); m.materials.append(mat)
    names,W=wget(b); nu=len(used)
    for j,n in enumerate(names):
        w=W[U,j]; nz=np.nonzero(w>.004)[0]
        if len(nz)==0: continue
        vg=o.vertex_groups.new(name=n)
        for i in nz:
            for k in range(layers): vg.add([int(k*nu+i)],float(w[i]),'REPLACE')
    print(f'HAIR capas {layers}, caras por capa {len(sel)}, largo máx {ln[U].max()*1000:.1f} mm'); return o
def rig_of(b): return next(m.object for m in b.modifiers if m.type=='ARMATURE')
def lashes(b,mat):
    """Convierte las tiras 'helper-*-eyelashes-*' del mallado base en un objeto aparte con UV propio (u a lo largo del párpado, v raíz→punta)."""
    from mathutils.kdtree import KDTree
    me=b.data; gid={g.index:g.name for g in b.vertex_groups if 'eyelashes' in g.name}; strip={}
    for v in me.vertices:
        for g in v.groups:
            if g.group in gid and g.weight>0: strip[v.index]=gid[g.group]
    if not strip: print('LASH sin tiras de pestañas (s3.blend viejo: correr make.py)'); return None
    co=coords(b); li=np.array(sorted(strip)); lo_,hi_=co[li].min(0)-.03,co[li].max(0)+.03
    near=[i for i in np.nonzero(((co>lo_)&(co<hi_)).all(1))[0] if i not in strip]; kd=KDTree(len(near))
    for k,i in enumerate(near): kd.insert(Vector(co[i]),k)
    kd.balance(); d={i:kd.find(Vector(co[i]))[2] for i in li}; uvv={}
    for nm in set(strip.values()):
        ids=[i for i in li if strip[i]==nm]; ax=np.abs(co[ids,0]); dm=max(d[i] for i in ids) or 1.
        for i in ids: uvv[i]=((abs(co[i,0])-ax.min())/max(ax.max()-ax.min(),1e-6),min(1.,d[i]/dm))
    bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); nb=bmesh.new(); uv=nb.loops.layers.uv.new('UVMap'); nv={}
    for f in bm.faces:
        if all(v.index in strip for v in f.verts):
            for v in f.verts:
                if v.index not in nv: nv[v.index]=nb.verts.new(v.co)
            nf=nb.faces.new([nv[v.index] for v in f.verts]); nf.smooth=True
            for lp,v in zip(nf.loops,f.verts): lp[uv].uv=uvv[v.index]
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in strip],context='VERTS'); bm.to_mesh(me); bm.free(); me.update()
    m=bpy.data.meshes.new('Lashes'); nb.to_mesh(m); nb.free(); o=bpy.data.objects.new('Lashes',m); bpy.context.scene.collection.objects.link(o); m.materials.append(mat)
    o.vertex_groups.new(name=PRE+'Head').add(list(range(len(m.vertices))),1.0,'REPLACE'); print('LASH tarjetas',len(m.polygons),'caras'); return o
# ---------- cinturón de halterofilia ----------
BELT_Z=.195   # altura del centro del cinturón sobre la articulación de la cadera (m para 1,69 m): sobre el ombligo, entre costillas y cresta ilíaca
def belt(b,rig,K,mats):
    """Cinturón rígido (10 cm atrás, 7 cm adelante) ajustado a la cintura real por raycast; pesos tomados del torso."""
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    co=coords(b); bvh=BVHTree.FromPolygons([Vector(c) for c in co],[tuple(p.vertices) for p in b.data.polygons])
    zc=head(rig,'LeftUpLeg')[2]+BELT_Z*K; yc=float(head(rig,'Spine')[1]); NA=96; NZ=7; th=.0065*K; ang=2*np.pi*np.arange(NA)/NA
    wd=(.080-.022*np.cos(ang))*K; d=np.stack([np.sin(ang),-np.cos(ang),np.zeros(NA)],1); R=np.zeros((NZ,NA))
    for i in range(NZ):
        for j in range(NA):
            o=Vector((0,yc,zc+(i/(NZ-1)-.5)*wd[j])); h=bvh.ray_cast(o,Vector(d[j])); R[i,j]=h[3] if h[0] is not None else .14*K
    R=.55*R.max(0)[None]+.45*R
    for _ in range(4): R=(np.roll(R,1,1)+2*R+np.roll(R,-1,1))/4
    prof=((.0008,-.5),(th-.0018,-.5),(th,-.5+.02),(th,.5-.02),(th-.0018,.5),(.0008,.5)); P=np.zeros((NA+1,len(prof),3)); O=np.zeros_like(P); base=np.zeros((NA+1,len(prof),3))
    for jj in range(NA+1):
        j=jj%NA
        for k,(off,v) in enumerate(prof):
            i=(v+.5)*(NZ-1); i0=int(min(NZ-2,math.floor(i))); r=R[i0,j]*(1-(i-i0))+R[i0+1,j]*(i-i0); c=np.array([0,yc,zc+v*wd[j]])
            base[jj,k]=c+d[j]*r; P[jj,k]=c+d[j]*(r+off); O[jj,k]=d[j] if 1<k<4 else (np.array([0,0,-1.]) if k<2 else np.array([0,0,1.]))
    bm=bmesh.new(); uv=bm.loops.layers.uv.new('UVMap'); vsrc=[]
    VV={6:(0,.03,.06,.94,.97,1),4:(.07,.09,.91,.93)}   # la cara exterior ocupa casi todo el alto de la textura
    def grid(P,base,mat,out,us=None):
        n,m=P.shape[:2]; us=np.linspace(0,1,n) if us is None else us; vs=[[bm.verts.new(P[i,j]) for j in range(m)] for i in range(n)]; fs=[]
        for i in range(n):
            for j in range(m): vsrc.append(base[i,j])
        for i in range(n-1):
            for j in range(m-1):
                f=bm.faces.new((vs[i][j],vs[i+1][j],vs[i+1][j+1],vs[i][j+1])); f.material_index=mat; f.smooth=True; fs.append((f,i,j))
                for lp,(a,c_) in zip(f.loops,((i,j),(i+1,j),(i+1,j+1),(i,j+1))): lp[uv].uv=(us[a],VV[m][c_])
        bm.normal_update()
        if sum(float(np.dot(f.normal,out[i,j])) for f,i,j in fs)<0:
            for f,_,_ in fs: f.normal_flip()
    grid(P,base,0,O)
    # punta del cinturón solapada y hebilla al frente
    js=np.arange(2,15); tail=np.zeros((len(js),4,3)); tb=np.zeros_like(tail); to=np.zeros_like(tail)
    for a,j in enumerate(js):
        for k,(off,v) in enumerate(((th-.001,-.36),(th+.004*K,-.34),(th+.004*K,.34),(th-.001,.36))):
            r=R[NZ//2,j]; c=np.array([0,yc,zc+v*wd[j]]); tail[a,k]=c+d[j]*(r+off); tb[a,k]=c+d[j]*r; to[a,k]=d[j]
    grid(tail,tb,0,to,js/NA)
    r0=R[NZ//2,0]+th+.003*K; c0=np.array([0,yc-r0,zc]); hx,hz,t_=.026*K,.030*K,.0028*K
    def box(c,sx,sy,sz):
        cs=[c+np.array([a*sx,b_*sy,g*sz]) for a in (-1,1) for b_ in (-1,1) for g in (-1,1)]; vs=[bm.verts.new(p) for p in cs]
        for p in cs: vsrc.append(np.array([0,yc-R[NZ//2,0],zc]))
        for q in ((0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)):
            f=bm.faces.new([vs[k] for k in q]); f.material_index=1; f.normal_update()
            if np.dot(f.normal,np.array(f.calc_center_median())-c)<0: f.normal_flip()
            for lp in f.loops: lp[uv].uv=(.5,.5)
    for sx in (-1,1): box(c0+np.array([sx*hx,0,0]),t_,t_,hz+t_)
    for sz in (-1,1): box(c0+np.array([0,0,sz*hz]),hx,t_,t_)
    box(c0+np.array([.2*hx,-.002*K,0]),hx*.85,t_*.7,t_*.7)
    me=bpy.data.meshes.new('Belt'); bm.to_mesh(me); bm.free(); o=bpy.data.objects.new('Belt',me); bpy.context.scene.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    try: me.set_sharp_from_angle(angle=math.radians(40))
    except Exception: pass
    names,W=wget(b); keep=[i for i,n in enumerate(names) if n[len(PRE):] in ('Hips','Spine','Spine1','Spine2')]; kd=KDTree(len(co))
    for i,c in enumerate(co): kd.insert(Vector(c),i)
    kd.balance(); gs={i:o.vertex_groups.new(name=names[i]) for i in keep}
    for vi,src in enumerate(vsrc):
        near=kd.find_n(Vector(src),12); w=np.zeros(len(names))
        for _,i,dist in near: w+=W[i]/(dist+.004)
        w=w[keep]*np.array([.45 if names[i].endswith('Hips') else 1. for i in keep]); w/=max(w.sum(),1e-9)   # la cintura acompaña a la columna más que a la pelvis
        for i,x in zip(keep,w):
            if x>.01: gs[i].add([vi],float(x),'REPLACE')
    print(f'BELT verts {len(me.vertices)} z={zc:.3f} radio medio {R.mean():.3f}'); return o
