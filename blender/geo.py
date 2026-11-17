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
        # trapecio: la franja superior entre cuello y acromion sube con la clavícula (Shoulder) en vez de quedarse con el tórax (Spine2)
        i2=names.index(PRE+'Spine2'); n_=head(rig,'Neck'); xr=(co[:,0]*sgn-.045*K)/max(a[0]*sgn-.045*K,1e-6)
        tr=sm(.0,.35,xr)*sm(1.15,.85,xr)*sm(a[2]-.005*K,a[2]+.045*K,co[:,2])*sm(n_[2]+.06*K,n_[2]+.02*K,co[:,2]); touched|=tr>.02
        mv=W[:,i2]*tr*.45; W[:,i2]-=mv; W[:,ish]+=mv
    W/=np.maximum(W.sum(1,keepdims=True),1e-9)
    rows=np.nonzero(touched&(np.abs(W-W0).max(1)>1e-4))[0]; wset(b,names,W,rows); print('SKIN pesos suavizados en',len(rows),'vértices de',N)
def subdivide(b,levels=1):
    bpy.context.view_layer.objects.active=b; bpy.ops.object.select_all(action='DESELECT'); b.select_set(True)
    m=b.modifiers.new('sub','SUBSURF'); m.levels=levels; m.subdivision_type='CATMULL_CLARK'; m.uv_smooth='NONE'; m.boundary_smooth='PRESERVE_CORNERS'
    bpy.ops.object.modifier_move_to_index(modifier='sub',index=0); bpy.ops.object.modifier_apply(modifier='sub')
    for p in b.data.polygons: p.use_smooth=True
ANAT_GEO=(1.15,.5)   # fracción del relieve muscular de tex.anatomy que va a la malla: (masas anchas, surcos). El resto del surco lo pone el normal map
def anatomy(b,rig,K,cut=1.):
    """Desplaza la malla subdividida sobre la normal con el relieve muscular por reglas (deltoides, bíceps, tríceps, antebrazo, pectoral, trapecio, dorsal, cuádriceps, gemelos).
    Misma definición que el normal map (tex.anatomy). No toca cabeza, manos ni pies. cut: definición del pesista (apaga los surcos con la grasa)."""
    import tex
    co=coords(b); N=len(co); me=b.data; no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3)
    J={x.name[len(PRE):]:np.array(x.head_local) for x in rig.data.bones if x.name.startswith(PRE)}
    B,F,_=tex.anatomy(co,no,J,K); names,W=wget(b); keep=1-sum(W[:,j] for j,n in enumerate(names) if any(k in n for k in ('Head','Hand','Foot','Toe')))
    if tex.ANAT.get('fisico')=='anatomico':
        # desplazamiento grande: sobre la normal alisada. Con la normal de cada vértice, lo que ya sobresale (la punta del pecho de la malla base, pliegues) se abre en abanico y crece
        E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2)
        for _ in range(14):
            A=np.zeros_like(no); np.add.at(A,E[:,0],no[E[:,1]]); np.add.at(A,E[:,1],no[E[:,0]]); no=no+A; no/=np.maximum(np.linalg.norm(no,axis=1,keepdims=True),1e-9)
    gg=tex.ANAT.get('geo',ANAT_GEO); d=(B*gg[0]+F*gg[1]*cut)*np.clip(keep,0,1); me.vertices.foreach_set('co',(co+no*d[:,None]).ravel()); me.update()
    print(f'ANAT desplazamiento de malla: máx +{d.max()*1000:.1f} / {d.min()*1000:.1f} mm, {int((np.abs(d)>5e-4).sum())} vértices')
def chest_smooth(b,rig,K,iters=30):
    """Frente del pecho liso en la malla final (ya subdividida y con el relieve muscular): bajo la malla se marcaban dos puntas (hombres y
    mujeres), que el alisado de make.py sobre la malla gruesa no sacaba. Laplaciano sobre el frente del tronco entre la clavícula y el
    esternón bajo, con bordes en degradé: borra lo angosto (puntas, surcos finos) y deja la forma ancha. Informa la punta más alta antes y después."""
    co=coords(b); me=b.data; N=len(co); no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3); sh=head(rig,'LeftArm')
    E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.maximum(np.bincount(E.ravel(),minlength=N),1)[:,None]
    z=co[:,2]; ax=np.abs(co[:,0]); w=(no[:,1]<-.15)*sm(sh[2]-.76*K,sh[2]-.66*K,z)*sm(sh[2]-.05*K,sh[2]-.10*K,z)*sm(.27*K,.22*K,ax)
    import tex
    if tex.ANAT.get('fisico')=='anatomico':
        # El alisado llegaba hasta la cadera y el frente del muslo (zona hasta 0,76 por debajo del hombro) y 30 pasadas de laplaciano encogen lo convexo: se comía el pectoral,
        # el abdomen y el cuádriceps alto del físico anatómico (muslo 0,41 H en la sonda y 0,33 H en el GLB). Acá va solo sobre el pecho y con pocas pasadas: la punta la saca el parche.
        w=(no[:,1]<-.15)*sm(sh[2]-.36*K,sh[2]-.28*K,z)*sm(sh[2]-.05*K,sh[2]-.10*K,z)*sm(.27*K,.22*K,ax); iters=6 if tex.ANAT.get('grupos',{}).get('pectoral',1)>0 else 30     # la mujer (sin pectoral en los grupos) conserva las pasadas: busto liso de top deportivo
    def prom(c):
        A=np.zeros_like(c); np.add.at(A,E[:,0],c[E[:,1]]); np.add.at(A,E[:,1],c[E[:,0]]); return A/deg
    punta=lambda c:float((((c-prom(c))*no).sum(1)*(w>.5)).max())
    p0=punta(co); c=co.copy()
    for _ in range(iters): c=c+(prom(c)-c)*(.6*w)[:,None]
    # La punta (areola y pezón de la malla base) es un racimo de polígonos diminutos: cientos de vértices en 3 cm, decenas en 2 mm. El laplaciano
    # difunde por aristas, no por milímetros, y ahí casi no avanza: por eso el bulto sobrevivía a todas las pasadas (medido en el GLB). Se ubica por
    # densidad (el vértice del frente del pecho con las aristas más cortas, de cada lado) y en 3,2 cm la altura sobre el plano local se reemplaza por
    # la cuádrica ajustada al anillo que la rodea.
    el=np.linalg.norm(c[E[:,0]]-c[E[:,1]],axis=1); ml=np.zeros(N); np.add.at(ml,E[:,0],el); np.add.at(ml,E[:,1],el); ml/=deg[:,0]; RN=.032*K
    for sgn,lado in ((1,'L'),(-1,'R')):
        cand=(w>.3)&(c[:,0]*sgn>.03*K)
        if not cand.any(): continue
        i=int(np.argmin(np.where(cand,ml,9.))); cn=c[i].copy(); q=c-cn; cerca=np.linalg.norm(q,axis=1)<2.2*RN
        n0=no[cerca&(no[:,1]<0)].mean(0); n0/=np.linalg.norm(n0); e1=np.cross(n0,[0,0,1.]); e1/=np.linalg.norm(e1); e2=np.cross(n0,e1)
        h=q@n0; x=q@e1; y=q@e2; r=np.hypot(x,y); fr=(no@n0>.3)&(np.abs(h)<.06*K)
        an=fr&(r>RN)&(r<1.8*RN); den=fr&(r<RN)
        if an.sum()<12 or den.sum()<3: print(f'PUNTA {lado}: sin anillo para ajustar ({int(an.sum())} vértices)'); continue
        Aq=np.stack([np.ones(an.sum()),x[an],y[an],x[an]**2,x[an]*y[an],y[an]**2],1); cf=np.linalg.lstsq(Aq,h[an],rcond=None)[0]
        hf=cf[0]+cf[1]*x+cf[2]*y+cf[3]*x*x+cf[4]*x*y+cf[5]*y*y; wt=sm(RN,RN*.7,r)*den; dz=(hf-h)*wt
        import tex
        if tex.ANAT.get('fisico')=='anatomico':
            # Con el pectoral más curvo, la cuádrica única dejaba un plato chato de 3 cm, 2 mm hundido, con el borde marcado (se veía un aro bajo la malla con los brazos arriba).
            # Mínimos cuadrados móviles: cada vértice del disco toma la cuádrica ajustada al anillo con pesos gaussianos centrados en él, así empalma con la pendiente de su borde.
            R1=1.3*RN; an2=np.nonzero(fr&(r>R1)&(r<2.4*R1))[0]; dn2=np.nonzero(fr&(r<=R1))[0]
            if len(an2)>=20:
                Aq2=np.stack([np.ones(len(an2)),x[an2],y[an2],x[an2]**2,x[an2]*y[an2],y[an2]**2],1); hf2=np.empty(len(dn2))
                for jj,j in enumerate(dn2):
                    wg=np.sqrt(np.exp(-((x[an2]-x[j])**2+(y[an2]-y[j])**2)/(.9*RN)**2)+1e-4); c2=np.linalg.lstsq(Aq2*wg[:,None],h[an2]*wg,rcond=None)[0]
                    hf2[jj]=c2[0]+c2[1]*x[j]+c2[2]*y[j]+c2[3]*x[j]**2+c2[4]*x[j]*y[j]+c2[5]*y[j]**2
                dz=np.zeros(N); dz[dn2]=(hf2-h[dn2])*sm(R1,R1*.7,r[dn2])
        c=c+n0[None,:]*dz[:,None]
        print(f'PUNTA {lado}: racimo en ({cn[0]:+.3f},{cn[1]:+.3f},{cn[2]:.3f}), arista media {ml[i]*1000:.2f} mm, {int(den.sum())} vértices en {RN*1000:.0f} mm; sobresalía {(h-hf)[den].max()*1000:.1f} mm, corrección máx {np.abs(dz).max()*1000:.1f} mm')
    me.vertices.foreach_set('co',c.ravel()); me.update()
    # los pesos de piel también: el suavizado de pesos del hombro (smooth_weights) termina en medio del pecho y ese borde deja un vértice «atrasado» que con los brazos arriba se levanta como una carpa (la punta)
    names,W=wget(b); W0=W.copy()
    for _ in range(14):
        A=np.zeros_like(W); np.add.at(A,E[:,0],W[E[:,1]]); np.add.at(A,E[:,1],W[E[:,0]]); W=W+(A/deg-W)*(.6*w)[:,None]
    import tex
    if tex.ANAT.get('fisico')=='anatomico':     # y dentro del racimo de la punta, los pesos del anillo que lo rodea (el laplaciano por aristas no lo cruza)
        for den,an,M,mz in punta_interp(b,rig,K): W[den]=W[den]*(1-mz)[:,None]+(M@W[an])*mz[:,None]
    W/=np.maximum(W.sum(1,keepdims=True),1e-9); rows=np.nonzero((w>.02)&(np.abs(W-W0).max(1)>1e-4))[0]; wset(b,names,W,rows)
    print(f'PECHO pesos suavizados en {len(rows)} vértices (cambio máx {np.abs(W-W0).max():.3f})')
    print(f'PECHO liso: {int((w>.05).sum())} vértices, punta más alta {p0*1000:.2f} mm -> {punta(c)*1000:.2f} mm, desplazamiento máx {np.linalg.norm(c-co,axis=1).max()*1000:.1f} mm')
SIMPLIFY=1.0   # fracción de caras que se conserva en las zonas simplificables. 1 = no simplificar (por defecto; TARIMA_SIMP=0.32 lo activa).
# Queda apagado: esas zonas son solo el 9 % de las caras del cuerpo (la cabeza es el 37 % y las manos el 28 %), se ahorran ~6 mil triángulos,
# y al cambiar la densidad de vértices del muslo cambia el radio por percentil que mide poses.py (muslo 10,2 -> 8,9 cm en brenner): afloja check() sin querer.
def _hairlen(b,OUT):
    """Largo de pelo por vértice (m), leído de hair_len.png con el UV del cuerpo (255 = 20 mm)."""
    from PIL import Image
    L=np.asarray(Image.open(OUT+'hair_len.png').convert('L')).astype(float)/255*.02; Rr=L.shape[0]; me=b.data; N=len(me.vertices); uvl=me.uv_layers.active.data
    lu=np.empty(len(me.loops)*2); uvl.foreach_get('uv',lu); lu=lu.reshape(-1,2); lv=np.empty(len(me.loops),int); me.loops.foreach_get('vertex_index',lv); vu=np.zeros((N,2)); vu[lv]=lu
    return L[np.clip(((1-vu[:,1])*Rr).astype(int),0,Rr-1),np.clip((vu[:,0]*Rr).astype(int),0,Rr-1)]
def simplify(b,rig,BJ,K,OUT,keep=None):
    """Presupuesto de triángulos: la subdivisión se deshace (Decimate por colapso, con UV y pesos interpolados) solo donde no aporta silueta:
    cuero cabelludo tapado por el pelo (las capas de pelo salen después de esta malla, así que también bajan) y tronco, muslo y pierna
    lejos de las articulaciones y de los bordes de prenda. Cara, orejas, manos, hombros, brazos, cadera y rodillas quedan con la subdivisión completa."""
    keep=SIMPLIFY if keep is None else keep
    if keep>=1: return
    names,W=wget(b); co=coords(b); N=len(co); dom=np.array([n[len(PRE):] for n in names])[W.argmax(1)]; z=co[:,2]
    ok=np.isin(dom,['Hips','Spine','Spine1','Spine2','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'])&(z<head(rig,'LeftArm')[2]-.11*K)
    for side in ('Left','Right'):
        for bone,r in (('Arm',.26),('Leg',.14),('UpLeg',.11),('Foot',.10)): ok&=np.linalg.norm(co-head(rig,side+bone),axis=1)>r*K
    for ze in (BJ['ank'][2]+.132,BJ['hemz']): ok&=np.abs(z-ze)>.02
    sg=b.vertex_groups.get('scalp')
    if sg is not None:
        ln=_hairlen(b,OUT); sw=np.zeros(N)
        for v in b.data.vertices:
            for g in v.groups:
                if g.group==sg.index: sw[v.index]=g.weight
        sc=(sw>.5)&(z>head(rig,'Head')[2]+.09*K)
        if sc.any(): ok|=sc&(ln>.62*np.percentile(ln[sc],95))
    vg=b.vertex_groups.new(name='_simp'); vg.add([int(i) for i in np.nonzero(ok)[0]],1.0,'REPLACE')
    nf=len(b.data.polygons); inr=sum(1 for p in b.data.polygons if all(ok[v] for v in p.vertices)); t0=sum(len(p.vertices)-2 for p in b.data.polygons)
    bpy.context.view_layer.objects.active=b; bpy.ops.object.select_all(action='DESELECT'); b.select_set(True)
    m=b.modifiers.new('_dec','DECIMATE'); m.decimate_type='COLLAPSE'; m.ratio=1-(inr/nf)*(1-keep); m.vertex_group='_simp'; m.vertex_group_factor=1000; m.use_symmetry=True; m.symmetry_axis='X'; m.use_collapse_triangulate=False
    bpy.ops.object.modifier_move_to_index(modifier='_dec',index=0); bpy.ops.object.modifier_apply(modifier='_dec')
    vg=b.vertex_groups['_simp']; gi=vg.index; out=sum(1 for v in b.data.vertices if not any(g.group==gi and g.weight>.5 for g in v.groups)); b.vertex_groups.remove(vg)
    for p in b.data.polygons: p.use_smooth=True
    print(f'SIMP zonas simplificadas: {inr} de {nf} caras; triángulos {t0} -> {sum(len(p.vertices)-2 for p in b.data.polygons)}; vértices fuera de zona {N-int(ok.sum())} -> {out}')
def garments(b,rig,BJ,K,ks=1.):
    """Volumen de prendas sobre la malla ya subdividida. Mismos límites que la textura de finish.py."""
    names,W=wget(b); dom=np.array([n[len(PRE):] for n in names])[W.argmax(1)]; co=coords(b); me=b.data; N=len(co)
    no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3); z=co[:,2]; knee=BJ['knee'][2]; ank=BJ['ank'][2]; E=.0035
    leg=np.isin(dom,['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']); low=np.isin(dom,['LeftLeg','RightLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase'])
    zq=knee+(z-knee)/ks; zs=ank+(z-ank)/ks     # ks: rodilleras y medias a la escala del pesista (1 = medida fija de los dos originales)
    slv=leg*sm(knee-.112-E,knee-.112+E,zq)*sm(knee+.102+E,knee+.102-E,zq)
    slv=slv*(1+.35*sm(knee-.10,knee-.112,zq)+.35*sm(knee+.09,knee+.102,zq))      # ribete más grueso en los bordes
    sock=low*sm(ank+.132+E,ank+.132-E,zs)*(1+.6*sm(ank+.115,ank+.13,zs))
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
ARMUP_SCULPT=dict(delt=((.030,-.035,.0),None,.062,.018),deltA=((.050,-.005,.040),None,.040,.007),trap=((-.005,-.085,-.015),None,.058,.007),pit=((-.075,.030,.005),None,.058,-.011),
                  lat=((-.035,.034,-.050),(-.210,.015,-.050),.027,.018),pec=((-.035,.014,.050),(-.135,-.045,.072),.024,.016),tri=((.085,.040,-.020),(.200,.036,-.022),.028,.006))
def armup_sculpt(rig,K,co,sin=()):
    pb=rig.pose.bones; J=lambda n:np.array(pb[PRE+n].matrix.translation)
    def f(P,Nn):
        D=np.zeros_like(P)
        for sgn,side in ((1,'Left'),(-1,'Right')):
            A=J(side+'Arm'); u=J(side+'ForeArm')-A; u/=np.linalg.norm(u); l=np.array([sgn,0,0.]); l-=u*(l@u); l/=np.linalg.norm(l); fr=np.cross(l,u); fr*=(-1 if fr[1]>0 else 1)
            pt=lambda c:A+K*(u*c[0]+l*c[1]+fr*c[2]); sd=(co[:,0]*sgn>0)
            for nm,(c0,c1,r,amp) in ARMUP_SCULPT.items():
                if nm in sin: continue
                a=pt(c0)
                if c1 is None: w=np.exp(-(np.linalg.norm(P-a,axis=1)/(r*K))**2)
                else:
                    d=pt(c1)-a; t=np.clip(((P-a)@d)/(d@d),0,1); w=np.exp(-(np.linalg.norm(P-a-np.outer(t,d),axis=1)/(r*K))**2)*(1-.6*t)
                D+=Nn*(w*sd*amp*K)[:,None]
        return D
    return f
ARMUP_RANGE=(45,130)   # grados. Contrato 6 (cambio propuesto: antes 60–150; el arranque quedaba con peso 0,37). El visor tiene que usar el mismo par
def armup_weight(rig,side):
    """Contrato 6: smoothstep(ARMUP_RANGE) del ángulo entre la dirección del brazo y su reposo, en el marco de Spine2."""
    pb=rig.pose.bones; s2=pb[PRE+'Spine2']; d=s2.matrix.to_3x3().inverted()@(pb[PRE+side+'ForeArm'].matrix.translation-pb[PRE+side+'Arm'].matrix.translation)
    r=s2.bone.matrix_local.to_3x3().inverted()@(rig.data.bones[PRE+side+'ForeArm'].head_local-rig.data.bones[PRE+side+'Arm'].head_local)
    return float(sm(math.radians(ARMUP_RANGE[0]),math.radians(ARMUP_RANGE[1]),d.angle(r)))
def correctives(b,rig,K,fem=False):
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
    d=_delta(b,rig,basis,mask,36,.6,sculpt=armup_sculpt(rig,K,co,('pec',)))     # la mujer no lleva el empuje del pectoral (bajo la malla era un bulto en punta)
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
    import tex
    if tex.ANAT.get('fisico')=='anatomico':     # el delta del correctivo en el racimo de la punta del pecho: lo que vale alrededor (ver punta_interp)
        for den,an,M,mz in punta_interp(b,rig,K):
            for k in keys: keys[k][den]=keys[k][den]*(1-mz)[:,None]+(M@keys[k][an])*mz[:,None]
        print('CORR punta del pecho: delta interpolado desde el anillo')
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
        _driver(b,rig,'corr_armUp_'+side[0],vars_,f'smoothstep({math.radians(ARMUP_RANGE[0]):.4f},{math.radians(ARMUP_RANGE[1]):.4f},acos(clamp({dot(al,"l","r")}+{dot(be,"n","s")}+{dot(ga,"l","s")},-1,1)))')
        for nm,((p0,p1,p2),(lo,hi)) in HINGE.items():
            if nm not in GAIN: continue
            l1=np.linalg.norm(H(side+p1)-H(side+p0)); l2=np.linalg.norm(H(side+p2)-H(side+p1)); vars_={}
            for q,bone in (('p',side+p0),('q',side+p1),('r',side+p2)):
                for ax in 'XYZ': vars_[q+ax.lower()]=(bone,ax)
            dt='+'.join(f'(q{c}-p{c})*(r{c}-q{c})' for c in 'xyz')
            _driver(b,rig,f'corr_{nm}_{side[0]}',vars_,f'smoothstep({math.radians(lo):.4f},{math.radians(hi):.4f},acos(clamp(({dt})/{l1*l2:.5f},-1,1)))')
    bpy.context.view_layer.update()
# ---------- pelo con volumen (capas) y pestañas (tarjetas) ----------
HAIR_LAYERS=4   # capas de pelo (antes 6): cada capa es una pasada con alfa sobre toda la cabeza; con 4 el volumen se mantiene y baja un tercio el costo
def hair_shells(b,OUT,mat,layers=None,size=.024):
    """Capas concéntricas sobre cuero cabelludo, barba y cejas. El largo por vértice sale de hair_len.png (tex.py, 255 = 20 mm);
    el UV es una proyección por caja que repite el mosaico hair.png cada 'size' m. Las capas van de adentro hacia afuera (orden de dibujo con alfa)."""
    from PIL import Image
    layers=layers or HAIR_LAYERS
    me=b.data; N=len(me.vertices); ln=_hairlen(b,OUT); co=coords(b); no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3)
    ln*=(co[:,2]>head(rig_of(b),'Neck')[2]-.02)
    E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.maximum(np.bincount(E.ravel(),minlength=N),1)
    for _ in range(3):      # el largo decae suave hacia el borde: sin escalón en el nacimiento
        A=np.zeros(N); np.add.at(A,E[:,0],ln[E[:,1]]); np.add.at(A,E[:,1],ln[E[:,0]]); ln=np.minimum(ln,.5*ln+.5*A/deg)
    sel=[p for p in me.polygons if min(ln[v] for v in p.vertices)>.0004]; ln=np.maximum(ln,.0009)   # sin caras apoyadas sobre la piel (el borde ralo lo da la textura)
    used=sorted({v for p in sel for v in p.vertices}); ix={v:i for i,v in enumerate(used)}
    comb=np.array([0,.3,-1.]); comb/=np.linalg.norm(comb); bm=bmesh.new(); uv=bm.loops.layers.uv.new('UVMap'); uv2=bm.loops.layers.uv.new('UVCuero'); U=np.array(used)
    LU=np.empty(len(me.loops)*2); me.uv_layers.active.data.foreach_get('uv',LU); LU=LU.reshape(-1,2)     # UV del cuerpo por esquina: va como segundo UV de cada capa
    for k in range(1,layers+1):
        f=k/layers; pos=co[U]+no[U]*(ln[U]*f)[:,None]+comb[None,:]*(ln[U]*f*f*.45)[:,None]; vs=[bm.verts.new(q) for q in pos]
        for p in sel:
            fc=bm.faces.new([vs[ix[v]] for v in p.vertices]); fc.smooth=True; ax=int(np.argmax(np.abs(p.normal))); a,c=[i for i in range(3) if i!=ax]
            for lp,v,li in zip(fc.loops,p.vertices,p.loop_indices): lp[uv].uv=(co[v][a]/size,co[v][c]/size); lp[uv2].uv=(float(LU[li][0]),float(LU[li][1]))
    m=bpy.data.meshes.new('Hair'); bm.to_mesh(m); bm.free(); o=bpy.data.objects.new('Hair',m); bpy.context.scene.collection.objects.link(o); m.materials.append(mat)
    names,W=wget(b); nu=len(used)
    for j,n in enumerate(names):
        w=W[U,j]; nz=np.nonzero(w>.004)[0]
        if len(nz)==0: continue
        vg=o.vertex_groups.new(name=n)
        for i in nz:
            for k in range(layers): vg.add([int(k*nu+i)],float(w[i]),'REPLACE')
    print(f'HAIR capas {layers}, caras por capa {len(sel)}, largo máx {ln[U].max()*1000:.1f} mm'); return o
def hair_cap(b,OUT,mat,LM,K):
    """Pelo y barba como UNA malla opaca con volumen (dirección de arte del 16-nov: «pelo agrupado en formas»). Sale del cuero
    cabelludo y de la zona de barba del cuerpo (donde hair_len.png da largo), desplazada por la normal: el largo viene de la
    textura (arriba más alto, costados cortos) y encima van los gajos (mechones con cresta, surco y ondas, peinados desde la
    coronilla; en la barba, mechones cortos y finos). El largo decae hacia el borde, así el casco muere sobre la piel, donde
    la textura trae el degradé pintado. Mismos pesos que la piel de abajo (sigue a la cabeza y a la mandíbula). UV: u a lo
    largo del mechón, v a lo ancho (tex.pelo). Devuelve None si no hay nada con largo (rapado sin barba)."""
    me=b.data; N=len(me.vertices); ln=_hairlen(b,OUT); co=coords(b); no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3)
    ln*=(co[:,2]>head(rig_of(b),'Neck')[2]-.02)
    E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.maximum(np.bincount(E.ravel(),minlength=N),1)
    for _ in range(5):      # el largo decae suave hacia el borde
        A=np.zeros(N); np.add.at(A,E[:,0],ln[E[:,1]]); np.add.at(A,E[:,1],ln[E[:,0]]); ln=np.minimum(ln,.5*ln+.5*A/deg)
    sel=[p for p in me.polygons if min(ln[v] for v in p.vertices)>.0005]
    if len(sel)<20: print('PELO sin malla (rapado y sin barba)'); return None
    used=sorted({v for p in sel for v in p.vertices}); ix={v:i for i,v in enumerate(used)}; U=np.array(used)
    ear=np.asarray(LM['ears'],float); hc=np.array([0,ear[1]+.005,ear[2]+.03]); v=co[U]-hc
    az=np.arctan2(v[:,0],-v[:,1]); el=np.arctan2(v[:,2],np.hypot(v[:,0],v[:,1]))
    barba=sm(ear[2]-.012*K,ear[2]-.03*K,co[U,2])*(co[U,1]<ear[1]+.01)       # 1 en la barba (debajo de la oreja y al frente), 0 en el pelo
    # gajos: carriles alrededor de la cabeza, torcidos con la altura para que no sean meridianos de compás
    NG=17; lane=az*NG/(2*np.pi)+.45*np.sin(el*3.1+1.7)+.18*np.sin(el*7.3+az*2.1); g=np.abs((lane%1)-.5)*2; idl=np.floor(lane)
    cresta=1-.40*sm(.50,1.,g); onda=1+.13*np.sin(el*10.+idl*2.4)+.10*np.sin(idl*12.9898)        # surco entre mechones, ondas a lo largo y mechones más altos que otros
    laneb=az*46/(2*np.pi)+.6*np.sin(co[U,2]*190)+.3*np.sin(co[U,2]*410+az*5); gb=np.abs((laneb%1)-.5)*2
    crestab=1-.30*sm(.45,1.,gb)+.12*np.sin(np.floor(laneb)*7.31)
    h=ln[U]*(cresta*onda*(1-barba)+crestab*barba)+.0008
    atras=np.array([0,1.,-.15]); pos=co[U]+no[U]*h[:,None]+atras[None,:]*(h*.22*(1-barba))[:,None]
    bm=bmesh.new(); uv=bm.loops.layers.uv.new('UVMap'); uv2=bm.loops.layers.uv.new('UVCuero'); vs=[bm.verts.new(q) for q in pos]
    LU=np.empty(len(me.loops)*2); me.uv_layers.active.data.foreach_get('uv',LU); LU=LU.reshape(-1,2)     # UV del cuerpo: el visor recorta el borde del casco con el nacimiento pintado (curva suave, no el serrucho de los polígonos)
    uu=np.where(barba>.5,-co[U,2]*26.,(.5*np.pi-el)*.55+.07*np.sin(idl*5.1)); vv=np.where(barba>.5,az*9.,lane/NG*5)     # barba: hebras hacia abajo, sin torcer (torcidas se leían veta de madera)
    for p in sel:
        fc=bm.faces.new([vs[ix[v_]] for v_ in p.vertices]); fc.smooth=True
        ii=[ix[v_] for v_ in p.vertices]; v0=vv[ii[0]]
        for lp,i,li in zip(fc.loops,ii,p.loop_indices):
            lp[uv2].uv=(float(LU[li][0]),float(LU[li][1])); vvi=vv[i]
            if abs(vvi-v0)>2.5: vvi=v0      # la costura del ángulo (±pi) no estira la textura a lo ancho de una cara
            lp[uv].uv=(float(uu[i]),float(vvi))
    m=bpy.data.meshes.new('Pelo'); bm.to_mesh(m); bm.free(); o=bpy.data.objects.new('Pelo',m); bpy.context.scene.collection.objects.link(o); m.materials.append(mat)
    names,W=wget(b)
    for j,n in enumerate(names):
        w=W[U,j]; nz=np.nonzero(w>.004)[0]
        if len(nz)==0: continue
        vg=o.vertex_groups.new(name=n)
        for i in nz: vg.add([int(i)],float(w[i]),'REPLACE')
    print(f'PELO malla: {len(sel)} caras, alto máx {h.max()*1000:.1f} mm, barba {int((barba>.5).sum())} vértices'); return o
def chest_check(b,rig,K):
    """Mide la punta más alta del frente del pecho con los brazos arriba (pose de referencia del correctivo), ya con correctivos: línea PECHO posado."""
    co=coords(b); me=b.data; N=len(co); no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3); sh=head(rig,'LeftArm'); pb=rig.pose.bones
    E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.maximum(np.bincount(E.ravel(),minlength=N),1)[:,None]
    z=co[:,2]; ax=np.abs(co[:,0]); w=(no[:,1]<-.15)*sm(sh[2]-.76*K,sh[2]-.66*K,z)*sm(sh[2]-.05*K,sh[2]-.10*K,z)*sm(.27*K,.22*K,ax)
    for p in pb: p.matrix_basis=Matrix()
    for sgn,side in ((1,'Left'),(-1,'Right')):
        for bn,q in ARMUP.items(): pb[PRE+side+bn].matrix_basis=Quaternion(q if sgn>0 else mir(q)).to_matrix().to_4x4()
    bpy.context.view_layer.update(); P,Nn=_posed(b,True)
    A=np.zeros_like(P); np.add.at(A,E[:,0],P[E[:,1]]); np.add.at(A,E[:,1],P[E[:,0]]); s=((P-A/deg)*Nn).sum(1)*(w>.5)*(ax>.05*K); i=int(np.argmax(s))
    for p in pb: p.matrix_basis=Matrix()
    bpy.context.view_layer.update(); print(f'PECHO posado (brazos arriba): punta más alta {s[i]*1000:.2f} mm en reposo ({co[i][0]:+.3f},{co[i][1]:+.3f},{co[i][2]:.3f})')
def rig_of(b): return next(m.object for m in b.modifiers if m.type=='ARMATURE')
def bun(b,K,STY,LM,mat):
    """Moño del pelo atado: un ovillo achatado apoyado en el cráneo, en la dirección STY['bun']['dir'] desde el centro de la cabeza.
    Las hebras de la textura (tex.bun) dan vueltas alrededor de su eje. Va pegado al hueso Head; material opaco 'Bun'."""
    from mathutils.bvhtree import BVHTree
    B=STY['bun']; d=np.array(B['dir'],float); d/=np.linalg.norm(d); r=B['r']*K; ear=np.asarray(LM['ears'],float); hc=np.array([0,ear[1]+.005,ear[2]+.03])
    co=coords(b); bvh=BVHTree.FromPolygons([Vector(c) for c in co],[tuple(p.vertices) for p in b.data.polygons]); dist=0.; o=Vector(hc)
    for _ in range(8):     # la última cara que cruza el rayo desde adentro es el cuero cabelludo
        h=bvh.ray_cast(o,Vector(d))
        if h[0] is None: break
        dist=float((h[0]-Vector(hc)).length); o=h[0]+Vector(d)*.0005
    if dist<=0 or dist>.2*K: dist=.095*K
    c=hc+d*(dist+r*.42); e1=np.array([1.,0,0]); e2=np.cross(d,e1); NU,NV=40,20; bm=bmesh.new(); uv=bm.loops.layers.uv.new('UVMap'); V=[]
    for j in range(NV+1):
        ph=math.pi*j/NV; row=[]
        for i in range(NU):
            th=2*math.pi*i/NU; rr=r*(1+.045*math.sin(3*th+7*ph)+.03*math.sin(5*th-4*ph))     # vueltas del ovillo
            p=c+(e1*math.cos(th)+e2*math.sin(th))*(rr*math.sin(ph))+d*(rr*.80*math.cos(ph)); row.append(bm.verts.new(p))
        V.append(row)
    for j in range(NV):
        for i in range(NU):
            i2=(i+1)%NU; f=bm.faces.new((V[j][i],V[j][i2],V[j+1][i2],V[j+1][i])); f.smooth=True
            for lp,(a,k) in zip(f.loops,((i,j),(i+1,j),(i+1,j+1),(i,j+1))): lp[uv].uv=(a/NU*3+k/NV*.3,k/NV)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6); bm.normal_update()
    cc=Vector(c)
    if sum(f.normal.dot(f.calc_center_median()-cc) for f in bm.faces)<0:
        for f in bm.faces: f.normal_flip()
    m=bpy.data.meshes.new('Bun'); bm.to_mesh(m); bm.free(); o=bpy.data.objects.new('Bun',m); bpy.context.scene.collection.objects.link(o); m.materials.append(mat)
    o.vertex_groups.new(name=PRE+'Head').add(list(range(len(m.vertices))),1.0,'REPLACE'); print(f'BUN centro ({c[0]:.3f},{c[1]:.3f},{c[2]:.3f}) radio {r*1000:.0f} mm, cráneo a {dist*1000:.0f} mm del centro de la cabeza, {len(m.polygons)} caras'); return o
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

def antro_malla(b,rig,K,STY,NAME,chin=None):
    """Medidas sobre la MALLA en reposo, como fracción de la estatura (línea ANTROM), contra metas de pesista (docs/PLANTEL.md).
    Perímetros: casco convexo del corte de la piel con un plano perpendicular al hueso (todos los vértices del miembro cerca del eje, no solo
    los que domina un hueso: con el dominio el corte del muslo salía incompleto y el del hombro tomaba el trapecio). Solo mide y avisa.
    La llaman finish.py (malla final) y sonda.py (cuerpo con el relieve muscular, sin prendas)."""
    co=coords(b); me_=b.data; names,W=wget(b); dom=np.array([n[len(PRE):] if n.startswith(PRE) else '' for n in names])[W.argmax(1)]
    mi=[i for i,m in enumerate(me_.materials) if m.name=='Body']; cuerpo=np.zeros(len(co),bool)
    if mi:
        for p in me_.polygons:
            if p.material_index in mi: cuerpo[list(p.vertices)]=True
    else:
        gb=b.vertex_groups['body'].index
        for v in me_.vertices: cuerpo[v.index]=any(g.group==gb for g in v.groups)
    Bh=lambda n:np.array(rig.data.bones[PRE+n].head_local); H_=float(STY['H']); F_=STY.get('genero')=='F'; es=lambda *n:np.isin(dom,n); r={}
    def perim(P2):
        P2=sorted(set(map(tuple,np.round(P2,5))))
        if len(P2)<6: return float('nan')
        def half(pts):
            h=[]
            for q in pts:
                while len(h)>=2 and (h[-1][0]-h[-2][0])*(q[1]-h[-2][1])-(h[-1][1]-h[-2][1])*(q[0]-h[-2][0])<=0: h.pop()
                h.append(q)
            return h
        hull=np.array(half(P2)[:-1]+half(P2[::-1])[:-1]); return float(np.linalg.norm(np.roll(hull,-1,0)-hull,axis=1).sum())
    def corte(mask,p0,eje,rmax,tol=.007):
        eje=eje/np.linalg.norm(eje); d=(co-p0)@eje; q=co[mask&cuerpo&(np.abs(d)<tol)]-p0
        e1=np.cross(eje,[0,1,0]); e1=e1 if np.linalg.norm(e1)>.1 else np.cross(eje,[1,0,0]); e1/=np.linalg.norm(e1); e2=np.cross(eje,e1)
        q=q[np.linalg.norm(q-np.outer(q@eje,eje),axis=1)<rmax]; return perim(np.stack([q@e1,q@e2],1))
    izq=co[:,0]>.004
    if chin is None:     # mentón: lo más bajo de la cara (a menos de 4,5 cm de la punta de la nariz hacia atrás) en la línea media
        cab_=cuerpo&es('Head'); yn=float(co[cab_][:,1].min()); cm=cab_&(np.abs(co[:,0])<.015)&(co[:,1]<yn+.045); chin=float(co[cm][:,2].min())
    cab=cuerpo&es('Head'); r['cabeza (H/alto)']=H_/max(float(co[cab][:,2].max()-chin),1e-3)
    nk,hd_=Bh('Neck'),Bh('Head'); r['cuello perim']=np.nanmin([corte(es('Neck','Head','Spine2','LeftShoulder','RightShoulder'),nk+(hd_-nk)*q_,hd_-nk,.11*K) for q_ in (.3,.45,.6,.75,.9)])/H_
    a,f,w=Bh('LeftArm'),Bh('LeftForeArm'),Bh('LeftHand'); ax=(f-a)/np.linalg.norm(f-a); brazo=izq&es('LeftArm','LeftShoulder','LeftForeArm')
    r['biceps perim']=max(corte(brazo,a+(f-a)*q_,f-a,.105*K) for q_ in (.45,.55,.65))/H_
    r['antebrazo perim']=max(corte(izq&es('LeftForeArm','LeftArm'),f+(w-f)*q_,w-f,.085*K) for q_ in (.15,.22,.3))/H_; r['muñeca perim']=corte(es('LeftForeArm','LeftHand'),f+(w-f)*.93,w-f,.06*K)/H_
    # ancho biacromial con deltoides (brazos al costado): articulación más el radio del deltoides medido sobre el eje del húmero, del lado de afuera
    q=co-a; t_=q@ax; pr=q-np.outer(t_,ax); da=np.linalg.norm(pr,axis=1); lat=np.cross(ax,[0,1,0]); lat*=np.sign(lat[0]) or 1; sl=cuerpo&izq&(t_>-.01)&(t_<.30*np.linalg.norm(f-a))&((pr@lat)>.8*da)&(da<.12*K)
    rdel=float(np.percentile(da[sl],96)) if sl.sum()>5 else float('nan'); r['hombros malla']=(2*a[0]+2*rdel)/H_
    tr=es('Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder','LeftUpLeg','RightUpLeg'); hz=float(Bh('LeftUpLeg')[2]); sz=float(a[2]); up=np.array([0,0,1.])
    r['pecho perim']=max(corte(tr,np.array([0,0,sz-q_*K]),up,.30*K) for q_ in (.09,.115,.14))/H_
    cz=[(corte(tr,np.array([0,0,zz]),up,.30*K),zz) for zz in np.linspace(hz+.07*K,hz+.24*K,9)]; cmin,zc=min(cz); r['cintura perim']=cmin/H_
    anc=co[cuerpo&tr&(np.abs(co[:,2]-zc)<.008)]; r['hombros/cintura']=r['hombros malla']*H_/max(float(2*np.abs(anc[:,0]).max()),1e-3) if len(anc) else float('nan')
    r['cadera perim']=max(corte(tr,np.array([0,0,hz+q_*K]),up,.32*K) for q_ in (-.03,0.,.03))/H_
    u,k,t2=Bh('LeftUpLeg'),Bh('LeftLeg'),Bh('LeftFoot'); pierna=izq&es('LeftUpLeg','Hips','LeftLeg')
    r['muslo perim']=max(corte(pierna,u+(k-u)*q_,k-u,.22*K) for q_ in (.30,.36,.42))/H_; r['muslo bajo perim']=corte(pierna,u+(k-u)*.78,k-u,.16*K)/H_
    r['pantorrilla perim']=max(corte(izq&es('LeftLeg','LeftUpLeg'),k+(t2-k)*q_,t2-k,.13*K) for q_ in (.22,.28,.34,.4))/H_
    gl=cuerpo&es('Hips','LeftUpLeg','RightUpLeg')&(co[:,2]>hz-.07*K)&(co[:,2]<hz+.08*K); r['gluteo proyeccion']=float(co[gl][:,1].max()-u[1])/H_
    en=cuerpo&(np.abs(co[:,0])<.012)&es('Hips','LeftUpLeg','RightUpLeg')&(co[:,2]>float(k[2])); r['entrepierna']=float(co[en][:,2].min())/H_ if en.any() else float('nan')
    g_=float(STY.get('grasa_',0)); pes=g_>.5
    meta={'cabeza (H/alto)':(7.3,7.9),'cuello perim':(.225,.275) if not pes else (.25,.31),'hombros malla':(.275,.315) if not F_ else (.25,.29),'biceps perim':(.21,.25) if not F_ else (.16,.21),'antebrazo perim':(.17,.195) if not F_ else (.145,.18),'muñeca perim':(.095,.115),
          'pecho perim':(.62,.70) if not pes else (.68,.84),'cintura perim':(.46,.53) if not pes else (.58,.72),'hombros/cintura':(1.2 if pes else 1.35,9),'muslo perim':(.37,.42) if not pes else (.40,.50),'pantorrilla perim':(.235,.26) if not pes else (.25,.30),
          'gluteo proyeccion':(.08,.16),'entrepierna':(.43,.475)}
    fuera=[k_ for k_,(lo,hi) in meta.items() if not (lo<=r[k_]<=hi)]
    print('ANTROM '+NAME+': '+' · '.join(f'{k_} {v:.3f}'+('' if k_ not in fuera else f' [meta {meta[k_][0]}-{meta[k_][1]}]') for k_,v in r.items())+(' · FUERA: '+str(len(fuera)) if fuera else ' · todo en meta'),flush=True)
    return r
def anat_vol(b,rig,K,cut=1.):
    """Volumen (m3) que suma el relieve muscular a la malla (desplazamiento por el área de cada vértice): body.py lo descuenta de la masa objetivo."""
    import tex
    co=coords(b); N=len(co); me=b.data; no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3)
    J={x.name[len(PRE):]:np.array(x.head_local) for x in rig.data.bones if x.name.startswith(PRE)}
    B,F,_=tex.anatomy(co,no,J,K); names,W=wget(b); keep=1-sum(W[:,j] for j,n in enumerate(names) if any(k in n for k in ('Head','Hand','Foot','Toe')))
    gb=b.vertex_groups['body'].index; body=np.array([any(g.group==gb for g in v.groups) for v in me.vertices])
    gg=tex.ANAT.get('geo',ANAT_GEO); d=(B*gg[0]+F*gg[1]*cut)*np.clip(keep,0,1)*body; ar=np.zeros(N)
    for p in me.polygons:
        if all(body[i] for i in p.vertices):
            for i in p.vertices: ar[i]+=p.area/len(p.vertices)
    return float((d*ar).sum())

def punta_interp(b,rig,K):
    """Racimo de polígonos diminutos del frente del pecho (areola de la malla base), de cada lado: devuelve [(índices del racimo, índices del anillo que lo
    rodea, matriz de interpolación racimo x anillo, mezcla por vértice)]. Sirve para que una magnitud por vértice (pesos de piel, delta de un correctivo) valga
    adentro lo que vale alrededor: el suavizado por aristas no cruza el racimo, y con los brazos arriba quedaban dos puntas bajo la malla."""
    co=coords(b); me=b.data; N=len(co); no=np.empty(N*3); me.vertices.foreach_get('normal',no); no=no.reshape(N,3); sh=head(rig,'LeftArm')
    E=np.empty(len(me.edges)*2,int); me.edges.foreach_get('vertices',E); E=E.reshape(-1,2); deg=np.maximum(np.bincount(E.ravel(),minlength=N),1)
    z=co[:,2]; ax=np.abs(co[:,0]); w=(no[:,1]<-.15)*sm(sh[2]-.76*K,sh[2]-.66*K,z)*sm(sh[2]-.05*K,sh[2]-.10*K,z)*sm(.27*K,.22*K,ax)
    el=np.linalg.norm(co[E[:,0]]-co[E[:,1]],axis=1); ml=np.zeros(N); np.add.at(ml,E[:,0],el); np.add.at(ml,E[:,1],el); ml/=deg; RN=.036*K; out=[]
    mi=[i for i,m in enumerate(me.materials) if m.name=='Body']; cu=np.ones(N,bool)
    if mi and len(me.materials)>1:     # ya unido con pelo, zapatillas y cinturón: solo la piel
        cu[:]=False
        for p in me.polygons:
            if p.material_index in mi: cu[list(p.vertices)]=True
    w=w*cu
    for sgn in (1,-1):
        cand=(w>.3)&(co[:,0]*sgn>.03*K)
        if not cand.any(): continue
        i=int(np.argmin(np.where(cand,ml,9.))); d=np.linalg.norm(co-co[i],axis=1); fr=(no[:,1]<0)&cu
        den=np.nonzero(fr&(d<RN))[0]; an=np.nonzero(fr&(d>=RN)&(d<1.7*RN))[0]
        if len(den)<3 or len(an)<8: continue
        D=np.linalg.norm(co[den][:,None,:]-co[an][None,:,:],axis=2); M=1/(D**4+1e-12); M/=M.sum(1,keepdims=True); out.append((den,an,M,sm(RN,RN*.75,d[den])))
    return out
