# Sistema de poses v3. Se ejecuta dentro de finish.py (b, rig, K, NAME, STY, OUT, render ya definidos).
# Cada fase se describe como una tarea (cadera, torso, manos, pies) y se resuelve sobre el esqueleto real.
# Reglas duras: pies sobre la tarima, barra en contacto con el cuerpo sin atravesarlo, brazos por fuera de las rodillas,
# codos y rodillas con su eje de bisagra alineado al plano de flexión.
from mathutils import Quaternion
from mathutils.bvhtree import BVHTree
D=math.radians
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT'); eb=rig.data.edit_bones.new('Bar'); eb.head=(0,0,0); eb.tail=(0,0,.1); bpy.ops.object.mode_set(mode='OBJECT')
pb=rig.pose.bones
for p in pb: p.rotation_mode='QUATERNION'
PB=lambda n:pb['mixamorig:'+n]
RB=lambda n:rig.data.bones['mixamorig:'+n]
upd=lambda:bpy.context.view_layer.update()
REST={p.name:p.bone.matrix_local.copy() for p in pb}
SIDES=((1,'Left'),(-1,'Right'))
hd=lambda n:RB(n).head_local.copy()
TH=(hd('LeftLeg')-hd('LeftUpLeg')).length; SHN=(hd('LeftFoot')-hd('LeftLeg')).length
UA=(hd('LeftForeArm')-hd('LeftArm')).length; FA=(hd('LeftHand')-hd('LeftForeArm')).length
C0=(hd('LeftUpLeg')+hd('RightUpLeg'))/2; V0=hd('LeftArm')-C0; HW=hd('LeftUpLeg').x; SHX=hd('LeftArm').x; SHZ0=hd('LeftArm').z
ANK=hd('LeftFoot'); FA_F=-ANK.y; AZ=ANK.z; MID=FA_F+.07*K
SOLE=.016; BARZ=.225-SOLE; RBAR=.014; LW=(UA+FA)*.996
Tm=Matrix.Translation

# ---------- radios del cuerpo medidos sobre la malla (para contactos y chequeo de superposición) ----------
_me=b.data; _gn=[g.name for g in b.vertex_groups]
_co=np.array([v.co[:] for v in _me.vertices]); _dom=[]
for v in _me.vertices:
    bw=0; bn=''
    for g in v.groups:
        n=_gn[g.group]
        if n.startswith('mixamorig:') and g.weight>bw: bw=g.weight; bn=n[10:]
    _dom.append(bn)
_dom=np.array(_dom)
# caras que cuentan como apoyo de la barra en el rack: todo menos antebrazos, manos y el brazo más allá del deltoides
_skip=np.zeros(len(_dom),bool)
for sgn_,side_ in ((1,'Left'),(-1,'Right')):
    a_=np.array(hd(side_+'Arm')); ax_=np.array(hd(side_+'ForeArm'))-a_; L_=np.linalg.norm(ax_); t_=((_co-a_)@(ax_/L_))/L_
    _skip|=(_dom==side_+'Arm')&(t_>.38)
_skip|=np.array([('ForeArm' in n) or ('Hand' in n) for n in _dom])
_polys=[tuple(pl.vertices) for pl in _me.polygons if not any(_skip[v] for v in pl.vertices)]
def brad(bones,a,c,pct=80,front=False,tr=(0,1)):
    a=np.array(a); c=np.array(c); m=np.isin(_dom,bones); p=_co[m]; ax=c-a; L=np.linalg.norm(ax); ax/=L
    t=(p-a)@ax; k=(t>=tr[0]*L)&(t<=tr[1]*L); p=p[k]; t=t[k]; perp=p-a-np.outer(t,ax); dist=np.linalg.norm(perp,axis=1)
    if front:
        f=np.array((0,-1,0))-ax*(-ax[1]); f/=np.linalg.norm(f); k=(perp@f)>.75*dist; dist=dist[k]
    return float(np.percentile(dist,pct)) if len(dist) else .05
R=dict(thigh=brad(['LeftUpLeg'],hd('LeftUpLeg'),hd('LeftLeg'),75,tr=(.25,1)),thighF=brad(['LeftUpLeg'],hd('LeftUpLeg'),hd('LeftLeg'),85,True,(.2,.9)),
       shin=brad(['LeftLeg'],hd('LeftLeg'),hd('LeftFoot'),75),shinF=brad(['LeftLeg'],hd('LeftLeg'),hd('LeftFoot'),85,True,(.15,.9)),
       knee=brad(['LeftLeg','LeftUpLeg'],hd('LeftLeg')-(hd('LeftLeg')-hd('LeftUpLeg'))*.12,hd('LeftLeg')+(hd('LeftFoot')-hd('LeftLeg'))*.12,90,True),
       uarm=brad(['LeftArm'],hd('LeftArm'),hd('LeftForeArm'),70,tr=(.3,1)),fore=brad(['LeftForeArm'],hd('LeftForeArm'),hd('LeftHand'),70),
       hipF=float(np.percentile((C0.y-_co[:,1])[(np.abs(_co[:,2]-C0.z)<.07*K)&(np.abs(_co[:,0])<.12*K)&(_co[:,1]<C0.y)],70)),chestF=brad(['Spine1','Spine2'],hd('Spine1'),hd('Neck'),75,True,(0,.75)))
print('RADII',NAME,{k:round(v,3) for k,v in R.items()})
print(f'SKEL {NAME}: TH={TH:.3f} SHN={SHN:.3f} UA={UA:.3f} FA={FA:.3f} hipZ={C0.z:.3f} shZ={SHZ0:.3f} shX={SHX:.3f} ankle=({ANK.x:.3f},{ANK.y:.3f},{ANK.z:.3f})')

# ---------- utilidades ----------
def rot_about(p,h,R4): p.matrix=Tm(h)@R4@Tm(-h)@p.matrix
def aim(name,target):
    p=PB(name); h=p.matrix.translation.copy(); cur=(p.matrix.to_3x3()@Vector((0,1,0))).normalized(); new=(target-h).normalized()
    rot_about(p,h,cur.rotation_difference(new).to_matrix().to_4x4()); upd()
def ik(A,B,l1,l2,pole):
    d=B-A; L=d.length; Lc=min(max(L,abs(l1-l2)+.002),l1+l2-.001); d=d/L
    a=(l1*l1-l2*l2+Lc*Lc)/(2*Lc); h=math.sqrt(max(l1*l1-a*a,0)); pp=pole-d*pole.dot(d)
    if pp.length<1e-5: pp=Vector((0,-1,0))-d*(-d.y)
    pp.normalize(); return A+d*a+pp*h, A+d*Lc, pp.cross(d).normalized()
def hinge_rest(a,m,e,bend):
    u=(hd(m)-hd(a)).normalized(); w=(hd(e)-hd(m)).normalized(); c=u.cross(w)
    return (c.normalized() if c.length>.035 else u.cross(bend).normalized())
HR={}
for sgn,side in SIDES:
    HR[side+'Arm']=hinge_rest(side+'Arm',side+'ForeArm',side+'Hand',Vector((0,-1,0)))
    HR[side+'UpLeg']=hinge_rest(side+'UpLeg',side+'Leg',side+'Foot',Vector((0,1,0)))
def twist_to(name,hrest,hnow):
    """Gira el hueso sobre su eje hasta que su eje de bisagra coincida con el plano real de flexión."""
    p=pb[name]; M=p.matrix.to_3x3(); ax=(M@Vector((0,1,0))).normalized(); cur=M@(REST[p.name].to_3x3().inverted()@hrest)
    cu=cur-ax*cur.dot(ax); tg=hnow-ax*hnow.dot(ax)
    if cu.length<1e-4 or tg.length<1e-4: return
    cu.normalize(); tg.normalize(); ang=math.atan2(ax.dot(cu.cross(tg)),cu.dot(tg))
    rot_about(p,p.matrix.translation.copy(),Matrix.Rotation(ang,4,ax)); upd()
def d2(y,z,a,c):
    ay,az_,cy,cz=a.y,a.z,c.y,c.z; vy,vz=cy-ay,cz-az_; L2=vy*vy+vz*vz; t=0 if L2<1e-9 else max(0,min(1,((y-ay)*vy+(z-az_)*vz)/L2))
    return math.hypot(y-ay-t*vy,z-az_-t*vz)
def segseg(p1,q1,p2,q2):
    d1=q1-p1; d2_=q2-p2; r=p1-p2; a=d1.dot(d1); e=d2_.dot(d2_); f=d2_.dot(r); c=d1.dot(r); bb=d1.dot(d2_); den=a*e-bb*bb
    s=max(0,min(1,(bb*f-c*e)/den)) if den>1e-9 else 0; t=(bb*s+f)/e if e>1e-9 else 0
    if t<0: t=0; s=max(0,min(1,-c/a))
    elif t>1: t=1; s=max(0,min(1,(bb-c)/a))
    return ((p1+d1*s)-(p2+d2_*t)).length

# ---------- manos ----------
# Marco de la mano en reposo: ancho (índice→meñique), dedos, y n0. El lado palmar es n0*sgn.
HF={}
for sgn,side in SIDES:
    f0=(hd(side+'HandMiddle1')-hd(side+'Hand')).normalized(); w0=(hd(side+'HandPinky1')-hd(side+'HandIndex1')); w0=(w0-f0*w0.dot(f0)).normalized(); n0=w0.cross(f0)
    HF[side]=Matrix((w0,f0,n0)).transposed()   # columnas: ancho (índice→meñique), dedos, palma
PALM=(hd('LeftHandMiddle1')-hd('LeftHand')).length
def hand_matrix(side,wT,fT):
    wT=(wT-fT*wT.dot(fT)).normalized(); BT=Matrix((wT,fT,wT.cross(fT))).transposed()
    return BT@HF[side].transposed()@REST['mixamorig:'+side+'Hand'].to_3x3()
FNG=('Index','Middle','Ring','Pinky')
def _perp(n,t0=.2,t1=.9):
    a=np.array(hd(n)); ax=np.array(RB(n).tail_local)-a; L=np.linalg.norm(ax); ax/=L; p=_co[_dom==n]; t=(p-a)@ax; k=(t>t0*L)&(t<t1*L)
    return (p-a-np.outer(t,ax))[k]
# grosor de cada falange medido sobre la malla: del hueso a la piel del lado palmar (tp) y del lado dorsal (td)
HS={}
for sgn,side in SIDES:
    Pn=np.array(HF[side].col[2])*sgn; st={}
    for fn in FNG:
        for j in (1,2,3):
            q=_perp(f'{side}Hand{fn}{j}')@Pn; st[f'{fn}{j}']=(float(np.percentile(q,85)),float(-np.percentile(q,10))) if len(q) else (.01,.004)
    # pulgar: la yema mira hacia donde la carne es más gruesa respecto del hueso
    pp=np.vstack([_perp(f'{side}HandThumb{j}') for j in (2,3)]); pad=Vector(pp.mean(axis=0)); d=(hd(side+'HandThumb3')-hd(side+'HandThumb2')).normalized(); pad=(pad-d*pad.dot(d)).normalized()
    for j in (1,2,3):
        q=_perp(f'{side}HandThumb{j}')@np.array(pad); st[f'Thumb{j}']=(float(np.percentile(q,85)),float(-np.percentile(q,10))) if len(q) else (.012,.008)
    HS[side]=dict(st=st,pad=pad,Pn=Vector(Pn))
_HSL=HS['Left']['st']
print('GRIPDIM',NAME,'palma',round(PALM,3),{k:(round(v[0]*1000,1),round(v[1]*1000,1)) for k,v in _HSL.items() if k[-1] in '12' or k[0]=='T'},'yema·palma',round(HS['Left']['pad'].dot(HS['Left']['Pn']),2),'yema·ancho',round(HS['Left']['pad'].dot(HF['Left'].col[0]),2))
def _segline(a,c,p,dr):
    """Distancia de un segmento a una recta infinita (la barra)."""
    return segseg(a,c,p-dr*.4,p+dr*.4)
def _clear(a,c,r,obst):
    m=1e9
    for o in obst:
        m=min(m,segseg(a,c,o[0],o[1])-r-o[2])
    return m
def _curl(pts,axis,lims,radii,obst,th0=-14,pre=()):
    """Envoltura: cada articulación flexiona hasta que su falange queda tangente a los obstáculos (barra, pulgar) o llega a su tope."""
    pts=[p.copy() for p in pts]; cum=Matrix.Identity(3); out=[]; worst=1e9; n=len(pts)-1
    for j in range(n):
        def after(th):
            Rm=Matrix.Rotation(D(th),3,axis); return pts[j]+Rm@(pts[j+1]-pts[j])
        lo=th0 if j==0 else 0; hi=lims[j]; r=radii[j]
        if j<len(pre): th=pre[j]
        elif _clear(pts[j],after(lo),r,obst)<0:
            cand=[(lo+(hi-lo)*k/24) for k in range(25)]; ok=[t for t in cand if _clear(pts[j],after(t),r,obst)>-.004]; th=min(ok,key=abs) if ok else max(cand,key=lambda t:_clear(pts[j],after(t),r,obst))
        else:
            th=lo; stp=3.0
            while th+stp<=hi and _clear(pts[j],after(th+stp),r,obst)>=0: th+=stp
            if th+stp<=hi:
                a_,c_=th,th+stp
                for _ in range(8):
                    m_=(a_+c_)/2
                    if _clear(pts[j],after(m_),r,obst)>=0: a_=m_
                    else: c_=m_
                th=a_
            else: th=hi if _clear(pts[j],after(hi),r,obst)>=0 else th
        Rm=Matrix.Rotation(D(th),3,axis)
        for k in range(j+1,n+1): pts[k]=pts[j]+Rm@(pts[k]-pts[j])
        cum=Rm@cum; out.append((cum.copy(),th)); worst=min(worst,_clear(pts[j],pts[j+1],r,obst))
    return pts,out,worst
# topes por tipo de agarre: (MCP, IFP, IFD) de los dedos y (MCF, IF) del pulgar
# por tipo de agarre: topes (MCF, IFP, IFD) de los dedos y (MCF, IF) del pulgar, margen y deriva lateral del pulgar, extensión permitida de la primera falange
# hook: primero el pulgar y encima índice y medio. over: primero los dedos y el pulgar cierra por fuera. rack: mano floja, pulgar acostado junto a la barra
FKIND=dict(hook=dict(lim=((92,112,80),(55,80)),extra=0.0,lean=.85,th0=-14,thumb_first=True),
           over=dict(lim=((92,112,80),(55,80)),extra=None,lean=.22,th0=-14,thumb_first=False),
           rack=dict(lim=((28,50,34),(16,22)),extra=.004,lean=.55,th0=-36,thumb_first=True))
_FQ={}
def finger_pose(kind,ga=0,gb=0,s=0,info=None,mix=None):
    """Pose de dedos por regla: cada falange se envuelve sobre la barra donde esté dentro de la mano. s = componente lateral de los dedos
    (la barra cruza la mano en diagonal). mix=(otro tipo, u) resuelve una sola envoltura con los parámetros interpolados, así las transiciones tampoco atraviesan la barra."""
    kc,u=mix if mix and mix[0]!=kind and mix[1]>0 else (kind,0.0)
    key=(kind,kc,round(u,3),round(ga,3),round(gb,3),round(s,2))
    if key in _FQ:
        if info is not None: info.update(_FQ[key][1])
        return _FQ[key][0]
    A,C=FKIND[kind],FKIND[kc]; Lr=lambda x,y:x+(y-x)*u; out={}; inf={}
    lim=tuple(tuple(Lr(x,y) for x,y in zip(la,lc)) for la,lc in zip(A['lim'],C['lim'])); first=(A if u<.5 else C)['thumb_first']
    for sgn,side in SIDES:
        Wd,F=HF[side].col[0].copy(),HF[side].col[1].copy(); Pn=HS[side]['Pn']; st=HS[side]['st']; W0=hd(side+'Hand')
        c=W0+F*ga+Pn*gb; bd=(Wd*math.sqrt(max(1-s*s,0))+F*s).normalized(); bar=(c-bd*.4,c+bd*.4,RBAR)
        xo=st['Index2'][0]+st['Index2'][1]+.002; ex=Lr(xo if A['extra'] is None else A['extra'],xo if C['extra'] is None else C['extra']); lean=Lr(A['lean'],C['lean']); th0=Lr(A['th0'],C['th0'])
        def put(name,Rw,Rpar):
            Rr=REST['mixamorig:'+name].to_3x3(); out['mixamorig:'+name]=(Rr.transposed()@Rpar.transposed()@Rw@Rr).to_quaternion()
        def thumb(obst):
            tn=[f'{side}HandThumb{j}' for j in (1,2,3)]; pts=[hd(n) for n in tn]+[RB(tn[2]).tail_local.copy()]; d0=(pts[1]-pts[0]).normalized(); pad=HS[side]['pad']; rT=st['Thumb2'][0]
            # tangente desde la base del pulgar a la barra, por el lado libre (el opuesto a la palma), con deriva hacia el dedo medio
            q=c-pts[0]; q=q-bd*q.dot(bd); Dq=q.length; rr=min(RBAR+rT+.003+ex,Dq*.98); be=math.asin(rr/Dq)
            cands=[Matrix.Rotation(sg*be,3,bd)@(q/Dq) for sg in (1,-1)]; tdir=max(cands,key=lambda v:v.dot(Pn)); bw=bd if bd.dot(Wd)>0 else -bd
            tdir=(tdir+bw*lean).normalized()
            Ra=d0.rotation_difference(tdir).to_matrix(); pts=[pts[0]]+[pts[0]+Ra@(p-pts[0]) for p in pts[1:]]; pad1=Ra@pad
            mid=(pts[1]+pts[2])/2; tg=c+bd*(mid-c).dot(bd)-mid; tg=tg-tdir*tg.dot(tdir); pu=pad1-tdir*pad1.dot(tdir)
            if tg.length>1e-4 and pu.length>1e-4:
                tg.normalize(); pu.normalize(); ang=max(-D(100),min(D(100),math.atan2(tdir.dot(pu.cross(tg)),pu.dot(tg))))
                Rr_=Matrix.Rotation(ang,3,tdir); Ra=Rr_@Ra; pts=[pts[0]]+[pts[0]+Rr_@(p-pts[0]) for p in pts[1:]]; pad1=Rr_@pad1
            ax=(pts[2]-pts[1]).normalized().cross(pad1).normalized()
            p2,rs,w=_curl(pts[1:],ax,lim[1],(st['Thumb2'][0],st['Thumb3'][0]),obst,th0=0)
            put(tn[0],Ra,Matrix.Identity(3)); put(tn[1],rs[0][0]@Ra,Ra); put(tn[2],rs[1][0]@Ra,rs[0][0]@Ra)
            return [pts[0]]+p2,w,(rs[0][1],rs[1][1])
        def fingers(obst_of):
            res={}
            for fn in FNG:
                bn=[f'{side}Hand{fn}{j}' for j in (1,2,3)]; pts=[hd(n) for n in bn]+[RB(bn[2]).tail_local.copy()]
                ax=(pts[1]-pts[0]).normalized().cross(Pn).normalized()
                p2,rs,w=_curl(pts,ax,lim[0],[st[f'{fn}{j}'][0] for j in (1,2,3)],obst_of(fn),th0=th0); par=Matrix.Identity(3)
                for n,(Rw,th) in zip(bn,rs): put(n,Rw,par); par=Rw
                res[fn]=(p2,w,[r[1] for r in rs])
            return res
        trap=None
        if first:
            tp,tw,ta=thumb([bar]); tr=(st['Thumb3'][0]+st['Thumb3'][1])/2
            tob=[(tp[1],tp[2],(st['Thumb2'][0]+st['Thumb2'][1])/2),(tp[2],tp[3],tr)]
            fr=fingers(lambda fn:[bar]+(tob if fn in ('Index','Middle') else []))
            # atrapado: la última falange del pulgar queda entre la barra y las puntas de índice y medio
            trap=min(segseg(fr[fn][0][k],fr[fn][0][k+1],tp[2],tp[3])-st[f'{fn}{k+1}'][0]-tr for fn in ('Index','Middle') for k in (1,2))
            over_=max((fr[fn][0][3]-c).length for fn in ('Index','Middle'))-((tp[2]+tp[3])/2-c).length
            bw_=bd if bd.dot(Wd)>0 else -bd; cov=(tp[3]-hd(side+'HandIndex1')).dot(bw_)     # cuánto pasa la punta del pulgar del eje del índice hacia el medio (a lo largo de la barra): >0 = el índice lo cubre
        else:
            fr=fingers(lambda fn:[bar]); fob=[(fr[fn][0][k],fr[fn][0][k+1],st[f'{fn}{k+1}'][1]+.002) for fn in ('Index','Middle') for k in (1,2)]
            tp,tw,ta=thumb([bar]+fob)
        if side=='Left':
            inf=dict(dedos={fn[0]:[round(a) for a in fr[fn][2]] for fn in FNG},pulgar=[round(a) for a in ta],holg=round(min([tw]+[fr[fn][1] for fn in FNG])*1000,1))
            if trap is not None and kind=='hook' and u==0: inf['atrapado']=(round(trap*1000,1),round(over_*1000,1)); inf['cubre']=round(cov*1000,1)
    _FQ[key]=(out,inf)
    if info is not None: info.update(inf)
    return out
def finger_set(angles,thumb):
    for p in pb: p.matrix_basis=Matrix()
    upd(); out={}
    for sgn,side in SIDES:
        for fn in ('Index','Middle','Ring','Pinky'):
            for j,a in zip((1,2,3),angles):
                p=PB(f'{side}Hand{fn}{j}'); fi=(p.matrix.to_3x3()@Vector((0,1,0))).normalized(); ax=fi.cross(HF[side].col[2]).normalized()
                rot_about(p,p.matrix.translation.copy(),Matrix.Rotation(D(a)*sgn,4,ax)); upd(); out[p.name]=p.rotation_quaternion.copy()
        f=HF[side].col[1].copy(); n=HF[side].col[2].copy()
        for j,(a,o) in zip((1,2,3),thumb):
            p=PB(f'{side}HandThumb{j}'); h=p.matrix.translation.copy()
            if o: rot_about(p,h,Matrix.Rotation(D(o)*sgn,4,f)); upd()
            ti=(p.matrix.to_3x3()@Vector((0,1,0))).normalized(); ax=ti.cross(n)
            if a and ax.length>1e-4: rot_about(p,h,Matrix.Rotation(D(a)*sgn,4,ax.normalized())); upd()
            out[p.name]=p.rotation_quaternion.copy()
    for p in pb: p.matrix_basis=Matrix()
    upd(); return out
FQ_RELAX=finger_set((14,24,18),((0,10),(4,0),(4,0)))
def eval_co():
    dg=bpy.context.evaluated_depsgraph_get(); dg.update(); ev=b.evaluated_get(dg); em=ev.to_mesh(); a=np.empty(len(em.vertices)*3); em.vertices.foreach_get('co',a); ev.to_mesh_clear(); return a.reshape(-1,3)
_HANDV=np.array([n=='LeftHand' or n=='LeftHandThumb1' for n in _dom]); _FINGV=np.array([n.startswith('LeftHand') and n not in ('LeftHand','LeftHandThumb1') for n in _dom])
def bar_in_hand(co,p,dr):
    """Cuánto entra la barra (recta por p con dirección dr) en la malla de la mano izquierda: (palma, dedos) en metros; positivo = atraviesa."""
    dr=np.array(dr); p=np.array(p); out=[]
    for m in (_HANDV,_FINGV):
        v=co[m]-p; d=np.linalg.norm(v-np.outer(v@dr,dr),axis=1); k=np.abs(v@dr)<.08; d=np.sort(d[k])[:6]
        out.append(RBAR-float(d.mean()) if len(d) else -1)
    return out
GINF={}
def grip_fit(kind,ga,gb,s=0,squeeze=.003):
    """Ajusta la distancia barra-palma sobre la malla real: la barra aprieta la palma `squeeze` y no más."""
    Wd,F=HF['Left'].col[0],HF['Left'].col[1]; Pn=HS['Left']['Pn']; W0=hd('LeftHand'); bd=(Wd*math.sqrt(1-s*s)+F*s).normalized()
    for it in range(5):
        for p in pb: p.matrix_basis=Matrix()
        for n,q in finger_pose(kind,ga,gb,s).items(): pb[n].rotation_quaternion=q
        upd(); pen=bar_in_hand(eval_co(),W0+F*ga+Pn*gb,bd)
        if abs(pen[0]-squeeze)<.0007: break
        gb+=(pen[0]-squeeze)*.9
    for p in pb: p.matrix_basis=Matrix()
    upd(); inf={}; finger_pose(kind,ga,gb,s,inf)
    GINF[kind]=inf
    print(f'GRIPFIT {NAME} {kind}: barra a {ga*100:.1f} cm de la muñeca y {gb*100:.1f} cm del hueso · entra en palma {pen[0]*1000:+.1f} mm, en dedos {pen[1]*1000:+.1f} mm · {inf}')
    return ga,gb
# centro de la barra respecto de la muñeca (a lo largo de los dedos, hacia la palma) para cada agarre
_rw=RBAR+_HSL['Middle1'][0]      # radio de envoltura: barra más la carne de la primera falange
HK={'hook':grip_fit('hook',PALM-.55*_rw,RBAR+.02*K),'over':grip_fit('over',PALM-.85*_rw,RBAR+.022*K)}
HK['relax']=HK['hook']
# rack: la barra apoya sobre las primeras falanges, que ceden en hiperextensión (hx grados) respecto de la palma; (ga, gb, hx) por cada opción
def _rgrip(hx,t):
    r=RBAR+_HSL['Middle1'][0]-.002; m=HF['Left'].transposed()@(hd('LeftHandMiddle1')-hd('LeftHand')); c,s_=math.cos(D(hx)),math.sin(D(hx))
    return (m.y+t*c+r*s_, m.z*HS['Left']['Pn'].dot(HF['Left'].col[2])-t*s_+r*c, hx)
RGRIP=[_rgrip(hx,t*K) for hx in (0,10,20,30) for t in (.008,.022)]+[_rgrip(hx,t*K) for hx in (0,15,30) for t in (.036,.050)]; HK['rack']=RGRIP[0][:2]     # las últimas: mano abierta, barra sobre las falanges medias (rack de punta de dedos)
GA,GB=HK['hook']

# ---------- torso y pies ----------
def torso(C,lean,arch,shrug,headp,prot=0,retr=0):
    """retr: retracción del cuello (grados): el cuello se inclina hacia atrás y la cabeza queda con su inclinación, o sea la cara se corre hacia atrás sin mirar al techo."""
    for n in ('Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','RightShoulder'): PB(n).matrix_basis=Matrix()
    p=PB('Hips'); p.matrix=Tm(C)@Matrix.Rotation(D(lean),4,'X')@Tm(-C0)@REST[p.name]; upd()
    for n,k in (('Spine1',.4),('Spine2',.6)):
        q=PB(n); rot_about(q,q.matrix.translation.copy(),Matrix.Rotation(D(-arch*k),4,'X')); upd()
    up=(PB('Spine2').matrix.to_3x3()@Vector((0,1,0))).normalized(); fw=Vector((1,0,0)).cross(up).normalized()
    for sgn,side in SIDES:
        q=PB(side+'Shoulder'); h=q.matrix.translation.copy()
        rot_about(q,h,Matrix.Rotation(D(-sgn*prot),4,up)@Matrix.Rotation(D(sgn*shrug),4,fw))
    upd()
    for n,k in (('Neck',.5),('Head',1.0)):
        q=PB(n); h=q.matrix.translation.copy(); wp=(lean-arch)*(1-k)+headp*k-(retr if n=='Neck' else 0)
        q.matrix=Tm(h)@(Matrix.Rotation(D(wp),3,'X')@REST[q.name].to_3x3()).to_4x4(); upd()
    return PB('LeftArm').matrix.translation.copy()
def tor(T): return torso(T['C'],T['lean'],T['arch'],T['shrug'],T['head'],T['prot'],T.get('retr',0))
BALL=hd('LeftToeBase'); FD=ANK.y-BALL.y; FH=ANK.z-BALL.z
def ankle_of(x,f,th,yaw,sgn,lift=0.0):
    yw=D(yaw-12)*sgn; Rm=Matrix.Rotation(yw,3,'Z')@Matrix.Rotation(th,3,'X'); Rz=Matrix.Rotation(yw,3,'Z')
    ball=Vector((sgn*x,-f,AZ+lift))+Rz@Vector((0,-FD,-FH))
    return ball+Rm@Vector((0,FD,FH))
def bisect(f,lo,hi,n=18):
    flo=f(lo)
    for _ in range(n):
        m=(lo+hi)/2; fm=f(m)
        if (fm>0)==(flo>0): lo,flo=m,fm
        else: hi=m
    return (lo+hi)/2
def leg_geo(ft,ko):
    out=[]
    for (sgn,side),f in zip(SIDES,ft):
        J=PB(side+'UpLeg').matrix.translation.copy(); A=ankle_of(f['x'],f['f'],f['th'],f['yaw'],sgn,f.get('lift',0.0))
        kn,A2,h=ik(J,A,TH,SHN,Vector((sgn*math.sin(D(ko)),-math.cos(D(ko)),0))); out.append((J,kn,A2,h))
    return out
def bar_clear(y,z,legs,tors=True):
    c=1e9
    for J,kn,A,_ in legs:
        for k in range(9):
            u=k/8; q=J.lerp(kn,u); c=min(c,math.hypot(q.y-y,q.z-z)-(R['thighF']+(R['knee']-R['thighF'])*u))
        c=min(c,d2(y,z,kn,A)-R['shinF'],math.hypot(kn.y-y,kn.z-z)-R['knee'])
    if tors:
        Cc=(PB('LeftUpLeg').matrix.translation+PB('RightUpLeg').matrix.translation)/2; s1=PB('Spine1').matrix.translation; nk=PB('Neck').matrix.translation; hb=PB('Head').matrix
        s2=s1.lerp(nk,.7); hc=hb.translation+(hb.to_3x3()@Vector((0,1,0))).normalized()*.105*K
        c=min(c,d2(y,z,Cc,s1)-R['hipF'],d2(y,z,s1,s2)-R['chestF'],d2(y,z,nk,hb.translation)-.062*K,math.hypot(hc.y-y,hc.z-z)-.10*K)
    return c-RBAR
def contact(fn,hi,lo,step=.003):
    """Primer contacto viniendo desde adelante: baja de a pasos mientras fn>0 (libre) y afina por bisección, para que el resultado sea continuo entre cuadros."""
    x=hi
    while x>lo and fn(x-step)>0: x-=step
    if x<=lo: return x
    a,c=x-step,x
    for _ in range(10):
        m=(a+c)/2
        if fn(m)>0: c=m
        else: a=m
    return c
def declip(T):
    """Cuadros intermedios: si la barra quedó dentro del cuerpo, se la lleva hacia adelante hasta el contacto."""
    if T['mode'] not in ('floor','hang','rel') or T['grip']<.5: return T
    tor(T); legs=leg_geo(T['feet'],T['ko']); n=0
    y0=T['bar'].y; z0=T['bar'].z
    if bar_clear(y0,z0,legs)<0:
        while bar_clear(y0-n*.003,z0,legs)<0 and n<60: n+=1
        a,c=(n-1)*.003,n*.003
        for _ in range(10):
            m=(a+c)/2
            if bar_clear(y0-m,z0,legs)<0: a=m
            else: c=m
        T['bar'].y-=c
        for h in T['hands']: h['W'].y-=c
    return T

# ---------- rack frontal: la barra se apoya de verdad en la malla (garganta + hombros) ----------
def hand_off(fT,ga,gb):
    w=Vector((1,0,0)); w=(w-fT*w.dot(fT)).normalized(); return -fT*ga-w.cross(fT)*gb
def fclear(bv,y,z):
    """Holgura de la barra contra el frente de la malla: rayos desde adelante a lo ancho del cuerpo y a tres alturas de la sección de la barra. Negativo = la barra está dentro."""
    m=9.0
    for k in range(-20,21):
        x=k*.015*K
        for dz,r in ((0.0,RBAR),(-.7*RBAR,.714*RBAR),(.7*RBAR,.714*RBAR)):
            h=bv.ray_cast(Vector((x,-1.5,z+dz)),Vector((0,1,0)))
            if h[0] is not None: m=min(m,h[0].y-y-r)
    return m
def body_bvh():
    """Malla posada sin antebrazos, manos ni la mitad distal del brazo: contra esto se mide que la mano y el antebrazo no atraviesen el torso."""
    co=eval_co(); return BVHTree.FromPolygons([Vector(c) for c in co],_polys)
def sdist(bvh,p):
    loc,nrm,_,dist=bvh.find_nearest(p)
    if loc is None: return 9.0
    if (p-loc).dot(nrm)>=0: return dist
    # la malla de control está abierta donde se le quitaron antebrazos y manos: cerca de ese borde el signo de la normal no vale.
    # Un punto de verdad dentro del cuerpo tiene piel por delante; si un rayo hacia el frente no encuentra nada, está afuera.
    return -dist if bvh.ray_cast(p,Vector((0,-1,0)))[0] is not None else dist
def arm_pts(E,W,fT,nv):
    """Puntos de control de antebrazo y mano con su radio (el dorso de la mano mira al hombro en el rack)."""
    return [(E.lerp(W,.55),R['fore']*.85),(E.lerp(W,.8),R['fore']*.7),(W,R['fore']*.6),(W+fT*PALM*.5-nv*.004,.014),(W+fT*PALM-nv*.002,.010)]
def wrist_angles(E,W,fT):
    """Extensión y desviación radial(+)/cubital(-) de la muñeca izquierda, en grados."""
    wv=Vector((1,0,0)); wv=(wv-fT*wv.dot(fT)).normalized(); nv=wv.cross(fT); a=(W-E).normalized()
    return math.degrees(math.atan2(a.dot(nv),a.dot(fT))),math.degrees(math.asin(max(-1,min(1,a.dot(wv))))),nv
_TH=np.radians(np.arange(0,360,4)); _CT,_ST=np.cos(_TH),np.sin(_TH)
# topes duros de la búsqueda del rack (grados): extensión y desviación radial/cubital de muñeca, flexión de codo (con compresión de tejido blando),
# y caída máxima de los dedos bajo la horizontal (si cuelgan más, la mano queda por delante de la barra en vez de por debajo)
RLIM=dict(ext=95,flex=154,rad=22,uln=30,pitch=40)     # topes duros de la búsqueda del rack (grados)
RACKREF={}
def rack_arms(S,bar,g,elb=-.03,bvh=None,ref=None):
    """Rack de cargada: busca agarre (barra rodada hacia los dedos), muñeca y codo con el húmero cerca de la horizontal,
    dentro de los topes de flexión de codo, extensión y desviación de muñeca, y sin meter antebrazo ni mano en el torso."""
    best=None; pool=[]; Sn=np.array(S); Zv=Vector((0,0,1)); et=elb*K
    for ga,gb,hx in RGRIP:
        for phi in range(42,127,4):
            if 90-phi+hx>RLIM['pitch']: continue     # los dedos pasan por debajo de la barra: no pueden colgar por delante
            for yaw in (-50,-40,-30,-20,-10,0,10,20,30,40,50,60):     # yaw negativo: los dedos apuntan atrás y afuera, siguiendo al antebrazo cuando el codo queda por dentro de la mano (la barra cruza la palma en diagonal)
                f0=Vector((0,math.sin(D(phi)),-math.cos(D(phi)))); fT=(Matrix.Rotation(D(yaw),3,'Z')@f0).normalized()
                W=Vector((g,bar.y,bar.z))+hand_off(fT,ga,gb); d=(W-S); L=d.length
                if L<abs(UA-FA)+.004 or L>UA+FA-.001: continue
                flex=180-math.degrees(math.acos(max(-1,min(1,(UA*UA+FA*FA-L*L)/(2*UA*FA)))))
                if flex>RLIM['flex']: continue
                dn=d/L; u=dn.cross(Zv).normalized(); v=dn.cross(u); a_=(UA*UA-FA*FA+L*L)/(2*L); h_=math.sqrt(max(UA*UA-a_*a_,0))
                wv=Vector((1,0,0)); wv=(wv-fT*wv.dot(fT)).normalized(); nv=wv.cross(fT)
                E=Sn+np.array(dn)*a_+(np.outer(_CT,u)+np.outer(_ST,v))*h_; av=(np.array(W)-E)/FA      # todo el giro del codo alrededor del eje hombro-muñeca
                ext=np.degrees(np.arctan2(av@np.array(nv),av@np.array(fT))); dev=np.degrees(np.arcsin(np.clip(av@np.array(wv),-1,1))); dz=E[:,2]-S.z
                ok=(E[:,1]<=S.y-.06*K)&(ext<=RLIM['ext'])&(ext>=-20)&(dev<=RLIM['rad'])&(dev>=-RLIM['uln'])
                if not ok.any(): continue
                cost=(3.0*np.maximum(0,et-dz)+.3*np.abs(dz-et)+.0012*np.maximum(0,ext-75)+.003*max(0,flex-146)+.0012*np.maximum(0,dev-12)+.001*np.maximum(0,-dev-20)
                      +2*np.maximum(0,(S.x-.09*K)-E[:,0])+1.2*np.maximum(0,E[:,0]-(S.x+.06*K))+.0012*hx+.0002*abs(yaw)+.0006*max(0,66-phi)+1.0*max(0,ga-RGRIP[0][0])
                      +(.004*abs(phi-ref[0])+.003*abs(yaw-ref[1])+2.0*abs(ga-ref[2]) if ref else 0))     # ref: la mano no cambia de forma de un rack al siguiente (así los cuadros intermedios también son un rack válido)
                cost[~ok]=9
                for i in np.argsort(cost)[:5]:
                    if cost[i]<9: pool.append((float(cost[i]),W.copy(),Vector(E[i])-S,fT.copy(),float(ext[i]),flex,float(dz[i]),phi,yaw,float(E[i,0])-S.x,ga,float(dev[i]),0.0,gb,hx))
    pool.sort(key=lambda r:r[0])
    if bvh is None: return pool[0] if pool else None
    for r in pool[:4000]:
        if best is not None and r[0]>=best[0]: break
        E=S+r[2]; nv=wrist_angles(E,r[1],r[3])[2]; cl=min(sdist(bvh,p)-rad for p,rad in arm_pts(E,r[1],r[3],nv)); c=r[0]+3*max(0,-(cl+.008))
        if best is None or c<best[0]: best=(c,)+r[1:12]+(cl,)+r[13:]
    return best
def rack_bar(bvh,thr=0.0):
    S=PB('LeftArm').matrix.translation; zb=S.z+.07*K; yb=S.y
    xs=[s*(.095*K+i*.012) for s in (1,-1) for i in range(int((SHX-.095*K)/.012)+1)]
    for _ in range(4):
        hit=bvh.ray_cast(Vector((0,-1.0,zb)),Vector((0,1,0))); yt=hit[0].y if hit[0] is not None else S.y
        yb=min(yt-RBAR-.003-thr,S.y+.02*K); top=None     # apoya en la garganta, pero nunca más de 2 cm detrás de la articulación del hombro: si el cuello se retrae, la barra queda en los deltoides
        for x in xs:
            h=bvh.ray_cast(Vector((x,yb,S.z+.22*K)),Vector((0,0,-1)))
            if h[0] is not None: top=h[0].z if top is None else max(top,h[0].z)
        zb=(top if top is not None else S.z+.05)+RBAR+.002
    return Vector((0,yb,zb))

# ---------- fase -> tarea ----------
_SOLVED={}
def solve(P):
    if id(P) not in _SOLVED:
        Q=P
        for it in range(4 if P.get('ballean') is not None else 1):
            T=_solve(Q)
            if P['bar']['mode']=='hang' or (P['bar']['mode']=='rel' and P['bar']['d'][0] is None):
                # segunda pasada: el contacto de la barra se busca también contra la malla real posada (muslo, pubis, pecho, cara), no sólo contra las cápsulas
                apply(T); T=_solve(Q,body_bvh())
            if P.get('ballean') is None: break
            # equilibrio por inclinación del torso: la barra queda sobre el medio pie (más ballean), como en la recepción; cada biotipo inclina lo que necesita
            err=(MID+(P.get('base',0)+P['ballean'])*K)-(-T['bar'].y)
            if abs(err)<.004: break
            Q=dict(Q,lean=Q['lean']+math.degrees(err/(SHZ0-C0.z)))
        _SOLVED[id(P)]=(P,T)
    T=_SOLVED[id(P)][1]; return dict(T,hands=[{k:v.copy() for k,v in h.items()} for h in T['hands']],bar=T['bar'].copy(),C=T['C'].copy(),epole=Vector(T['epole']),feet=[dict(f) for f in T['feet']])
def _solve(P,bv=None):
    g=P['grip']; st=P.get('stance',1.0)*ANK.x; th=D(P.get('heel',0)); ko=P.get('ko',12); toe=P.get('toe',12)
    feet=P.get('feet',((0,P.get('heel',0)),(0,P.get('heel',0))))
    bs=P.get('base',0)*K; MIDb=MID+bs     # base: toda la base de apoyo corrida hacia adelante (+) o atrás (-)
    ft=[dict(x=st,f=FA_F+bs+(0 if isinstance(feet[i][0],str) else feet[i][0])*K,th=D(feet[i][1]),yaw=toe,lift=0.0) for i in range(2)]
    for i in range(2):
        if feet[i][0]=='as': ft[i]['f']=solve(feet[i][2])['feet'][i]['f']; ft[i]['x']=solve(feet[i][2])['feet'][i]['x']; ft[i]['yaw']=solve(feet[i][2])['feet'][i]['yaw']     # el pie sigue apoyado donde quedó en esa otra fase
        if P.get('step'): ft[i]['win']=P['step'][i]     # paso: cada pie viaja sólo dentro de su ventana del tramo (primero uno, después el otro)
    A=ankle_of(st,FA_F+bs,th,toe,1); az=A.z; fa=-A.y; kr=D(ko)
    bar=P['bar']; mode=bar['mode']; shin=D(P.get('shin',0)); thigh=D(P.get('thigh',0))
    def floor_fb(sh_,zb_,gap_):
        # barra apoyada en la tibia/rodilla a la altura zb_ para un ángulo de tibia dado
        fk_=fa+SHN*math.sin(sh_)*math.cos(kr*.6); zk_=az+SHN*math.cos(sh_); Aa=Vector((0,-fa,az)); Kk=Vector((0,-fk_,zk_))
        return contact(lambda f:min(d2(-f,zb_,Kk,Aa)-R['shinF'],math.hypot(fk_-f,zk_-zb_)-R['knee'])-RBAR-gap_,fk_+.4,fa-.1,.002)
    if 'bx' in P:
        # la tibia se inclina lo justo para que la barra, apoyada en ella, quede a bx[1] de la vertical de la salida (tibia a bx[0] grados)
        tg_=floor_fb(D(P['bx'][0]),BARZ,.004)+P['bx'][1]*K; shin=bisect(lambda s_:floor_fb(s_,bar['z'],bar.get('gap',.004))-tg_,0.0,D(45))
    fk=fa+SHN*math.sin(shin)*math.cos(kr*.6); zk=az+SHN*math.cos(shin)
    arch=P.get('arch',4); shrug=P.get('shrug',0); headp=P.get('head',0); prot=P.get('prot',0); retr=P.get('retr',0); dx=g-SHX
    def sh(C,lean): s=torso(C,lean,arch,shrug,headp,prot,retr); return -s.y,s.z
    kind=P.get('hand') or dict(floor='hook',hang='hook',rel='hook',over='over',rack='rack',none='relax')[mode]
    phi=D(P.get('phi',0)); fT=Vector((0,math.sin(phi),-math.cos(phi))); ga=bar.get('a',HK[kind][0]); gb=bar.get('b',HK[kind][1])
    pole=Vector(P.get('epole',(.3,1,0))); grip=P.get('fing',1.0); straight=1.0 if mode in ('floor','hang','over') else 0.0
    for it in range(3 if mode in ('floor','hang') else 1):
        off=hand_off(fT,ga,gb)
        def zsolve(sf,sz,fb,sign):
            dy=(-fb+off.y)-(-sf); return sz+sign*math.sqrt(max(LW*LW-dx*dx-dy*dy,1e-4))-off.z
        if mode=='floor':
            # barra pegada a la tibia/rodilla, hombros por delante de la barra, brazos rectos; la cadera sale de la anatomía
            zb=bar['z']; fb=floor_fb(shin,zb,bar.get('gap',.004))
            def fpose(ah):
                sf_=fb+ah; dyw=(-fb+off.y)+sf_; sz_=zb+off.z+math.sqrt(max(LW*LW-dx*dx-dyw*dyw,1e-4))
                Tl=math.hypot(V0.y,V0.z); THe=TH*math.cos(kr*.7); ddf=sf_-fk; ddz=sz_-zk; d_=math.hypot(ddf,ddz); d_c=min(d_,THe+Tl-.001)
                aa=(THe*THe-Tl*Tl+d_c*d_c)/(2*d_c); hh=math.sqrt(max(THe*THe-aa*aa,0)); uf,uz=ddf/d_,ddz/d_
                c1=(fk+uf*aa+uz*hh,zk+uz*aa-uf*hh); c2=(fk+uf*aa-uz*hh,zk+uz*aa+uf*hh); fh,zh=c1 if c1[0]<c2[0] else c2
                C_=Vector((0,-fh,zh))
                return C_,bisect(lambda l:(lambda s:math.sqrt(dx*dx+((-fb+off.y)+s[0])**2+(zb+off.z-s[1])**2)-LW)(sh(C_,l)),-5,100)
            ah=P['ahead']*K
            if 'leanas' in P:
                # el ángulo de espalda no se abre respecto de la fase de referencia (la cadera no sube antes que los hombros): se resuelve cuánto van los hombros por delante de la barra
                tl_=solve(P['leanas'][0])['lean']+P['leanas'][1]
                if fpose(ah)[1]>tl_: ah=bisect(lambda a_:fpose(a_)[1]-tl_,-.06*K,ah,12)
            C,lean=fpose(ah); sf,sz=sh(C,lean); fh,zh=-C.y,C.z
        else:
            if 'hipabs' in P:
                fh=FA_F+bs+P['hipabs'][0]*K; zh=AZ+(TH+SHN)*.985-P['hipabs'][1]*K
                # tijera: el pie delantero se apoya donde la tibia queda vertical (rodilla sobre el tobillo)
                if feet[0][0]=='v': ft[0]['f']=fh+math.sqrt(max(TH*TH-(zh-AZ-SHN)**2,0))
                if feet[1][0]=='k':
                    # tijera: el pie trasero apoya donde la rodilla de atrás queda al ángulo pedido (casi extendida); la cadera baja por largo de paso, no por flexión
                    Jr=Vector((-HW,-fh,zh)); tg_=math.sqrt(TH*TH+SHN*SHN-2*TH*SHN*math.cos(D(feet[1][2])))
                    ft[1]['f']=bisect(lambda f_:(ankle_of(st,f_,D(feet[1][1]),toe,-1)-Jr).length-tg_,fh-.15,fh-1.2)
            else:
                if P.get('bal') is not None and mode in ('rack','rel') and it==0:
                    # equilibrio: se corrige el ángulo del muslo para que la barra quede sobre el medio pie (más bal)
                    fh=fk-TH*math.sin(thigh)*math.cos(kr); sf_e,_=sh(Vector((0,-fh,zk+TH*math.cos(thigh))),P['lean'])
                    est=sf_e+(.015*K if mode=='rack' else (bar['d'][0] or .1)*K)
                    thigh=math.asin(max(-1,min(1,(fk-(fh+(MIDb+P['bal']*K)-est))/(TH*math.cos(kr)))))
                fh=fk-TH*math.sin(thigh)*math.cos(kr); zh=zk+TH*math.cos(thigh)
                dxl=st-HW; zh=min(zh,az+math.sqrt(max(((TH+SHN)*.997)**2-dxl*dxl-(fh-fa)**2,0)))
            C=Vector((0,-fh,zh))
            if mode=='hang':
                lean=P['lean']; sf,sz=sh(C,lean); legs=leg_geo(ft,ko); gap=bar.get('gap',.0)
                fb=contact(lambda f:min(bar_clear(-f,zsolve(sf,sz,f,-1),legs),fclear(bv,-f,zsolve(sf,sz,f,-1)) if bv else 9)-gap,sf+.30,sf-.25)
                zb=zsolve(sf,sz,fb,-1)
            elif mode=='over':
                back=bar.get('back',.03)*K; fb0=MIDb+bar.get('f',0)*K
                lean=bisect(lambda l:sh(C,l)[0]-(fb0+back),-20,70) if P.get('lean') is None else P['lean']
                sf,sz=sh(C,lean); fb=sf-back; zb=zsolve(sf,sz,fb,1)
            elif mode=='rel':
                zr_=solve(bar['zref'][0])['bar'].z+bar['zref'][1]*K if 'zref' in bar else None; lean=P['lean']; sf,sz=sh(C,lean); zb=sz+bar['d'][1]*K if zr_ is None else zr_     # zref: altura atada a la barra de otra fase (ápice = triple extensión + subida balística)
                if bar['d'][0] is None:
                    # barra pegada: a esa altura respecto del hombro, se la acerca hasta tocar el cuerpo (piernas, torso o cabeza)
                    legs=leg_geo(ft,ko); gap=bar.get('gap',.006); fb=contact(lambda f:min(bar_clear(-f,zb,legs),fclear(bv,-f,zb) if bv else 9)-gap,sf+.45,sf-.25)
                    if 'yref' in bar: fb=max(fb,-solve(bar['yref'][0])['bar'].y+bar['yref'][1]*K)     # yref: la barra sigue en la vertical de otra fase (sube a plomo desde los hombros) salvo que el cuerpo la obligue a ir más adelante
                else: fb=sf+bar['d'][0]*K
            elif mode=='rack':
                o=Vector((0,.0,.06*K)); lean=P.get('lean'); lg=8 if lean is None else lean; elb=bar.get('elb',-.03); bv=None; rref=RACKREF.get(round(g,3)); thr=bar.get('thr',0)*K
                for k in range(4):
                    if P.get('lean') is None and k>0: lg=bisect(lambda l:sh(C,l)[0]-o.y-MIDb,-20,70)
                    S=torso(C,lg,arch,shrug,headp,prot,retr); r=rack_arms(S,S+o,g,elb,bv,rref)
                    apply(dict(C=C,lean=lg,arch=arch,shrug=shrug,head=headp,prot=prot,retr=retr,hands=[dict(W=Vector((s*r[1].x,r[1].y,r[1].z)),wT=Vector((s,0,0)),fT=Vector((s*r[3].x,r[3].y,r[3].z))) for s in (1,-1)],
                               epole=r[2],grip=.85,bar=S+o,feet=ft,ko=ko,twist=.5,straight=0,kinds=('rack','rack',0.0)))
                    bv=body_bvh(); o=rack_bar(bv,thr)-PB('LeftArm').matrix.translation; o.x=0
                lean=lg; S=torso(C,lean,arch,shrug,headp,prot,retr); sf,sz=-S.y,S.z; fb=sf-o.y; zb=sz+o.z; r=rack_arms(S,S+o,g,elb,bv,rref); RACKREF.setdefault(round(g,3),(float(r[7]),float(r[8]),r[10]))
                fT=r[3]; pole=r[2]; grip=.85; ga=r[10]; gb=r[13]; rph=(float(r[7]),float(r[8]))
                print(f'   rack {NAME}: barra vs hombro fwd={-o.y:.3f} up={o.z:.3f} · codo {r[6]*100:+.1f} cm alto, {r[9]*100:+.1f} cm lateral · flexión {r[5]:.0f}° · muñeca ext {r[4]:.0f}° desv {r[11]:+.0f}° · dedos en hiperextensión {r[14]:.0f}° · phi {r[7]} yaw {r[8]} · holgura mano/antebrazo-torso {r[12]*100:+.1f} cm')
            else:
                lean=P['lean']; sf,sz=sh(C,lean); fb=MIDb; zb=BARZ
        if mode in ('floor','hang'):
            v=Vector((0,(-fb+off.y)+sf,(zb+off.z)-sz)); fT=v.normalized()
    off=hand_off(fT,ga,gb); hands=[]
    for sgn,side in SIDES:
        if mode=='none':
            wT=Vector((sgn*math.sin(D(25)),math.cos(D(25)),0)); f_=Vector((sgn*.05,-.12,-1)).normalized(); W=Vector((sgn*(SHX+.045*K),-sf-.02*K,sz-(UA+FA)*.985))
        else: wT=Vector((sgn,0,0)); f_=Vector((sgn*fT.x,fT.y,fT.z)); W=Vector((sgn*(g+off.x),-fb+off.y,zb+off.z))
        hands.append(dict(W=W,wT=wT,fT=f_))
    # orientación de la mano como ángulos (giro alrededor de la barra, guiñada): se interpolan como escalares para que el giro vaya por el lado correcto
    ph=None if mode=='none' else rph if mode=='rack' else (math.degrees(math.atan2(fT.y,-fT.z)),0.0) if mode in ('floor','hang') else (float(P.get('phi',0)),0.0)
    return dict(ph=ph,turn=P.get('turn',0),C=C,lean=lean,arch=arch,shrug=shrug,head=headp,prot=prot,retr=retr,elb=bar.get('elb',-.03) if mode=='rack' else 0.0,thr=bar.get('thr',0)*K if mode=='rack' else 0.0,hands=hands,epole=pole,grip=0.0 if mode=='none' else grip,kinds=(kind,kind,0.0),gg=(g,ga,gb),
                bar=Vector((0,-fb,zb)),feet=ft,ko=ko,twist=P.get('twist',.5),straight=straight,mode=mode)

CH=('lean','arch','shrug','head','prot','ko','retr')
def chan(T): return [T['C'].y,T['C'].z,T['bar'].y,T['bar'].z]+[T[k] for k in CH]
def pchip_m(v):
    """Pendientes monótonas (PCHIP, nudos uniformes): sin sobrepaso y con velocidad continua al pasar por cada fase."""
    m=[0.0]*len(v)
    for k in range(1,len(v)-1):
        d0=v[k]-v[k-1]; d1=v[k+1]-v[k]; m[k]=0.0 if d0*d1<=0 else 2*d0*d1/(d0+d1)
    return m
def herm(v0,v1,m0,m1,u):
    u2=u*u; u3=u2*u; return (2*u3-3*u2+1)*v0+(u3-2*u2+u)*m0+(-2*u3+3*u2)*v1+(u3-u2)*m1
def foot_lerp(f1,f2,u):
    """Un pie que cambia de lugar se despega, viaja por el aire y vuelve a apoyar; uno que no cambia queda clavado (sólo pivotea el talón)."""
    w=f2.get('win')
    if w: u=min(1.0,max(0.0,(u-w[0])/(w[1]-w[0])))
    L=lambda x,y:x+(y-x)*u; dx=f2['x']-f1['x']; df=f2['f']-f1['f']; lift=0.0
    if abs(dx)>1e-4 or abs(df)>1e-4 or abs(f2['yaw']-f1['yaw'])>.01: lift=max(.028*K,.10*math.hypot(dx,df))*math.sin(math.pi*u)
    return dict(x=L(f1['x'],f2['x']),f=L(f1['f'],f2['f']),th=L(f1['th'],f2['th']),yaw=L(f1['yaw'],f2['yaw']),lift=lift)
def lerp_task(a,c,u,ma=None,mc=None):
    L=lambda x,y:x+(y-x)*u
    T=_lerp_task(a,c,u)
    if ma is not None:
        v=[herm(x,y,p,q,u) for x,y,p,q in zip(chan(a),chan(c),ma,mc)]
        T['C']=Vector((T['C'].x,v[0],v[1])); T['bar']=Vector((T['bar'].x,v[2],v[3]))
        for k,x in zip(CH,v[4:]): T[k]=x
    if a.get('ph') and c.get('ph'):
        pa,ya=a['ph']; pc,yc=c['ph']
        while pc-pa>180: pc-=360
        while pc-pa<-180: pc+=360
        if c.get('turn')==-1 and pc>pa+1: pc-=360     # giro de la mano bajo la barra: siempre por delante (dedos abajo → adelante → arriba → atrás)
        ph=L(pa,pc); yw=L(ya,yc)
        if a.get('phu') and c.get('phu'): ph=herm(a['phu'][0],c['phu'][0],a['mph'][0],c['mph'][0],u); yw=herm(a['phu'][1],c['phu'][1],a['mph'][1],c['mph'][1],u)     # mismo giro, con velocidad continua entre fases
        f=Matrix.Rotation(D(yw),3,'Z')@Vector((0,math.sin(D(ph)),-math.cos(D(ph))))
        T['hands'][0]['fT']=f; T['hands'][1]['fT']=Vector((-f.x,f.y,f.z)); T['ph']=(ph,yw)
    if a['grip']>.5 and c['grip']>.5:
        # la mano no suelta la barra entre fases: se interpolan el agarre y la orientación de la mano, y la muñeca sale de la barra
        g_,ga_,gb_=[L(x,y) for x,y in zip(a['gg'],c['gg'])]; off=hand_off(T['hands'][0]['fT'],ga_,gb_)
        for sgn,h in zip((1,-1),T['hands']): h['W']=Vector((sgn*(g_+off.x),T['bar'].y+off.y,T['bar'].z+off.z))
    return T
def _lerp_task(a,c,u):
    L=lambda x,y:x+(y-x)*u
    return dict(ph=None,turn=0,gg=tuple(L(x,y) for x,y in zip(a['gg'],c['gg'])),C=a['C'].lerp(c['C'],u),lean=L(a['lean'],c['lean']),arch=L(a['arch'],c['arch']),shrug=L(a['shrug'],c['shrug']),head=L(a['head'],c['head']),prot=L(a['prot'],c['prot']),retr=L(a['retr'],c['retr']),elb=L(a['elb'],c['elb']),thr=L(a['thr'],c['thr']),
        hands=[dict(W=h1['W'].lerp(h2['W'],u),wT=h1['wT'].lerp(h2['wT'],u).normalized(),fT=h1['fT'].lerp(h2['fT'],u).normalized()) for h1,h2 in zip(a['hands'],c['hands'])],
        epole=a['epole'].lerp(c['epole'],1-(1-u)**2 if (c['mode']=='rack' or c.get('turn')==-1) else u),     # en el giro bajo la barra los codos van primero: el polo del codo se adelanta al resto del cuerpo
        grip=L(a['grip'],c['grip']),bar=a['bar'].lerp(c['bar'],u),kinds=(a['kinds'][0],c['kinds'][0],u),
        feet=[foot_lerp(f1,f2,u) for f1,f2 in zip(a['feet'],c['feet'])],
        ko=L(a['ko'],c['ko']),twist=L(a['twist'],c['twist']),straight=min(a['straight'],c['straight']),mode=(c['mode'] if a['mode']=='none' else ('rack' if u>=.5 else a['mode']) if c['mode']=='rack' else a['mode'] if c['mode'] in ('over','none') or u<.5 else c['mode']))

DLIM=(-33.0,24.9)     # desviación cubital(-)/radial(+) de muñeca que la pose no pasa (el chequeo marca BAD fuera de -35/+25)
def dev_fix(S,el,W,hn,fT,sgn):
    """Si la muñeca queda fuera de su rango de desviación, primero cede el codo (gira alrededor del eje hombro-muñeca) y, si no alcanza
    (brazo recto con agarre ancho), la mano gira en el plano de la palma: la barra la cruza en diagonal."""
    m=lambda v:Vector((sgn*v.x,v.y,v.z)); S_,E_,W_,f_=m(S),m(el),m(W),m(fT); dv=lambda E,f:wrist_angles(E,W_,f)[1]; viol=lambda d:max(d-DLIM[1],DLIM[0]-d,0.0)
    v0=viol(dv(E_,f_))
    if v0<=0: return el,hn,fT
    ax=(W_-S_).normalized(); Er=lambda th:S_+Matrix.Rotation(D(th),3,ax)@(E_-S_); th=0.0
    if (E_-S_).angle(W_-E_)>D(25):
        sol=[]; alt=(v0,0.0)
        for sg in (1,-1):
            prev=0.0
            for k in range(1,14):
                t_=sg*k*4.0; v=viol(dv(Er(t_),f_))
                if v<=0:
                    a_,c_=prev,t_
                    for _ in range(8):
                        mm=(a_+c_)/2
                        if viol(dv(Er(mm),f_))<=0: c_=mm
                        else: a_=mm
                    sol.append(c_); break
                if v<alt[0]-1.0: alt=(v,t_)
                prev=t_
        th=min(sol,key=abs) if sol else alt[1]
    E2=Er(th); f2=f_
    if viol(dv(E2,f2))>0:
        a=(W_-E2).normalized(); wv=Vector((1,0,0)); wv=(wv-f_*wv.dot(f_)).normalized()
        if a.dot(f_)>.25:
            fr_=lambda dl:(f_*math.cos(D(dl))+wv*math.sin(D(dl))).normalized(); sg=1 if dv(E2,f_)>DLIM[1] else -1; prev=0.0
            for k in range(1,16):
                dl=sg*k*3.0
                if viol(dv(E2,fr_(dl)))<=0:
                    a_,c_=prev,dl
                    for _ in range(8):
                        mm=(a_+c_)/2
                        if viol(dv(E2,fr_(mm)))<=0: c_=mm
                        else: a_=mm
                    f2=fr_(c_); break
                prev=dl
            else: f2=fr_(prev)
    E=m(E2); d=(W-S).normalized(); pp=(E-S); pp=pp-d*pp.dot(d)
    return E,(pp.normalized().cross(d) if pp.length>1e-5 else hn),m(f2)
def apply(T):
    for p in pb: p.matrix_basis=Matrix()
    upd(); tor(T)
    slip=Vector((0,0,0)); gq=T['grip']
    for (sgn,side),h in zip(SIDES,T['hands']):
        S=PB(side+'Arm').matrix.translation.copy(); e=T['epole']; W=h['W']
        if T['straight']>.99 and gq>.5: W=S+(W-S).normalized()*LW
        el,W2,hn=ik(S,W,UA,FA,Vector((sgn*e.x,e.y,e.z))); slip+=(W2-h['W'])/2; fT_=h['fT']
        if gq>.5: el,hn,fT_=dev_fix(S,el,W2,hn,fT_,sgn)
        aim(side+'Arm',el); twist_to('mixamorig:'+side+'Arm',HR[side+'Arm'],hn); aim(side+'ForeArm',W2)
        fa_=PB(side+'ForeArm'); Rt=hand_matrix(side,h['wT'],fT_); ax=(fa_.matrix.to_3x3()@Vector((0,1,0))).normalized()
        cur=fa_.matrix.to_3x3()@(REST[fa_.name].to_3x3().inverted()@HF[side].col[0]); tgt=Rt@(REST['mixamorig:'+side+'Hand'].to_3x3().inverted()@HF[side].col[0])
        cu=cur-ax*cur.dot(ax); tg=tgt-ax*tgt.dot(ax)
        if cu.length>1e-4 and tg.length>1e-4:
            cu.normalize(); tg.normalize(); ang=math.atan2(ax.dot(cu.cross(tg)),cu.dot(tg))
            rot_about(fa_,fa_.matrix.translation.copy(),Matrix.Rotation(ang*T['twist'],4,ax)); upd()
        hb=PB(side+'Hand'); hb.matrix=Tm(hb.matrix.translation.copy())@Rt.to_4x4()
    upd()
    bp=T['bar']+(slip if gq>.5 and not T.get('barfix') else Vector((0,0,0)))     # barfix: la barra está en el piso y todavía no la mueve nadie (bajando a tomarla)
    # dedos: se envuelven en cada cuadro sobre la posición real de la barra dentro de la mano (así nunca la atraviesan entre fases)
    ka,kc,ku=T.get('kinds',('relax','relax',0.0)); hm=PB('LeftHand').matrix; Rh=hm.to_3x3()@REST['mixamorig:LeftHand'].to_3x3().inverted()
    wv,fv,nv=[(Rh@HF['Left'].col[i]).normalized() for i in range(3)]; r0=Vector((hm.translation.x,bp.y,bp.z))-hm.translation
    cw=wv.x if abs(wv.x)>.2 else .2; t_=-r0.dot(wv)/cw; ga_=r0.dot(fv)+t_*fv.x; gb_=r0.dot(nv)+t_*nv.x; s_=max(-.95,min(.95,fv.x))
    if ka=='relax' and kc=='relax': fq=FQ_RELAX
    elif ka=='relax': fq={n:q.slerp(finger_pose(kc,ga_,gb_,s_)[n],ku) for n,q in FQ_RELAX.items()}
    elif kc=='relax': fq={n:q.slerp(FQ_RELAX[n],ku) for n,q in finger_pose(ka,ga_,gb_,s_).items()}
    else: fq=finger_pose(ka,ga_,gb_,s_,mix=(kc,ku))
    for name,q in fq.items(): pb[name].rotation_quaternion=q
    ko=D(T['ko'])
    for (sgn,side),f in zip(SIDES,T['feet']):
        J=PB(side+'UpLeg').matrix.translation.copy(); A=ankle_of(f['x'],f['f'],f['th'],f['yaw'],sgn,f.get('lift',0.0))
        kn,A2,hn=ik(J,A,TH,SHN,Vector((sgn*math.sin(ko),-math.cos(ko),0)))
        aim(side+'UpLeg',kn); twist_to('mixamorig:'+side+'UpLeg',HR[side+'UpLeg'],hn); aim(side+'Leg',A2)
        yw=D(f['yaw']-12)*sgn; fb_=PB(side+'Foot')
        fb_.matrix=Tm(fb_.matrix.translation.copy())@(Matrix.Rotation(yw,3,'Z')@Matrix.Rotation(f['th'],3,'X')@REST[fb_.name].to_3x3()).to_4x4(); upd()
        t=PB(side+'ToeBase'); t.matrix=Tm(t.matrix.translation.copy())@(Matrix.Rotation(yw,3,'Z')@REST[t.name].to_3x3()).to_4x4()
    upd()
    pb['Bar'].matrix=Tm(bp); upd()
    return bp

def near_part(bp):
    """Diagnóstico: qué parte de la malla posada queda más cerca del eje de la barra (hueso dominante, distancia con signo en cm, x del punto)."""
    bv=body_bvh(); best=None
    for k in range(-20,21):
        p_=Vector((k*.015*K,bp.y,bp.z)); loc,nrm,idx,dist=bv.find_nearest(p_)
        if loc is None: continue
        d_=sdist(bv,p_)-RBAR
        if best is None or d_<best[0]: best=(d_,idx,p_.x,loc)
    if best is None: return 'nada'
    names=[_dom[v] for v in _polys[best[1]]]; return f"{max(set(names),key=names.count)} {best[0]*100:+.1f} x={best[2]*100:+.0f} dy={(best[3].y-bp.y)*100:+.1f} dz={(best[3].z-bp.z)*100:+.1f}"
def meshclear(bp):
    """Holgura de la barra contra la malla real posada (sin antebrazos ni manos): eje de la barra muestreado a lo ancho del cuerpo."""
    bv=body_bvh(); return min(sdist(bv,Vector((k*.015*K,bp.y,bp.z))) for k in range(-20,21))-RBAR
def settle(T):
    """Posa el cuadro y, si la barra quedó dentro de la malla (muslo, pubis, pecho, mentón), la lleva hacia adelante hasta el contacto."""
    bp=apply(wrist_fix(T))
    if T['mode'] in ('none','over') or T['grip']<.5: return bp
    for k in range(3):
        m=meshclear(bp) if T['mode']=='rack' else fclear(body_bvh(),bp.y,bp.z)
        if m>=-.0035: break
        d=-m-.003; T['bar'].y-=d
        for h in T['hands']: h['W'].y-=d
        bp=apply(wrist_fix(T))
    return bp
WLIM=(-70,96)     # tope de flexión y de extensión de muñeca (grados) en cualquier cuadro con los brazos flexionados
def wrist_fix(T):
    """La mano rueda alrededor de la barra lo necesario para que la muñeca no pase sus topes de flexión/extensión."""
    if not T.get('ph') or T['grip']<.5 or T['straight']>.99: return T
    tor(T); S=PB('LeftArm').matrix.translation.copy(); g_,ga_,gb_=T['gg']; ph,yw=T['ph']; e=T['epole']; bar=T['bar']
    def ev(p):
        f=Matrix.Rotation(D(yw),3,'Z')@Vector((0,math.sin(D(p)),-math.cos(D(p)))); off=hand_off(f,ga_,gb_); W=Vector((g_+off.x,bar.y+off.y,bar.z+off.z))
        el,W2,hn_=ik(S,W,UA,FA,Vector((e.x,e.y,e.z))); el,_,f2=dev_fix(S,el,W2,hn_,f,1); return wrist_angles(el,W2,f2)[0],f,off
    x,f,off=ev(ph); x0=x
    for it in range(14):
        if WLIM[0]<=x<=WLIM[1]: break
        err=(x-WLIM[1]) if x>WLIM[1] else (x-WLIM[0]); dd=(ev(ph+4)[0]-x)/4
        if abs(dd)<.05: break
        ph-=max(-18,min(18,err/dd)); x,f,off=ev(ph)
    if x!=x0:
        for sgn,h in zip((1,-1),T['hands']): h['fT']=Vector((sgn*f.x,f.y,f.z)); h['W']=Vector((sgn*(g_+off.x),bar.y+off.y,bar.z+off.z))
        T['ph']=(ph,yw)
    return T
WORST={}
def check(T,bp):
    """Superposiciones medidas con cápsulas (brazo contra pierna, barra contra el cuerpo) y contra la malla posada. Negativo = se atraviesan (m)."""
    P_=lambda n:PB(n).matrix.translation.copy(); arm=1e9
    for s1 in ('Left','Right'):
        S,E,W=P_(s1+'Arm'),P_(s1+'ForeArm'),P_(s1+'Hand')
        for s2 in ('Left','Right'):
            J,Kn,A=P_(s2+'UpLeg'),P_(s2+'Leg'),P_(s2+'Foot')
            for k in range(7):
                u=k/6; pt=J.lerp(Kn,u); rr=R['thigh']+(R['knee']-R['thigh'])*u; q=Kn.lerp(A,u); rs=R['knee']+(R['shin']*.8-R['knee'])*u
                arm=min(arm,segseg(E,W,pt,pt)-R['fore']-rr,segseg(S,E,pt,pt)-R['uarm']-rr,segseg(E,W,q,q)-R['fore']-rs,segseg(S,E,q,q)-R['uarm']-rs)
    legs=[(P_(s+'UpLeg'),P_(s+'Leg'),P_(s+'Foot'),None) for s in ('Left','Right')]
    bar=bar_clear(bp.y,bp.z,legs,T['mode'] in ('floor','hang','rel')) if T['mode']!='none' else 9
    foot=min(min(P_(s+'Foot').z-AZ,P_(s+'ToeBase').z-BALL.z) for s in ('Left','Right'))
    # mano: la barra no puede cortar los huesos de dedos y pulgar (holgura = distancia hueso-eje menos radio de barra y 3 mm de piel dorsal)
    hand=9.0; rk=9.0; elbow=0.0; mesh=9.0
    if T['mode']!='none' and T['grip']>.5:
        a_=Vector((-1.2,bp.y,bp.z)); c_=Vector((1.2,bp.y,bp.z))
        for fn in FNG+('Thumb',):
            for j in (1,2,3):
                q=PB(f'LeftHand{fn}{j}'); d_=segseg(q.head.copy(),q.tail.copy(),a_,c_)-RBAR-.003
                if d_<hand: hand=d_; WORST['hand']=f'{fn}{j}'
    S,E,W=P_('LeftArm'),P_('LeftForeArm'),P_('LeftHand'); hm=PB('LeftHand').matrix.to_3x3()@REST['mixamorig:LeftHand'].to_3x3().inverted()
    fTn=(hm@HF['Left'].col[1]).normalized(); flex=math.degrees((E-S).angle(W-E)); wext,wdev,_=wrist_angles(E,W,fTn)
    if T['mode']!='none':
        # barra contra la malla real posada (sin antebrazos ni manos): eje de la barra muestreado a lo ancho del cuerpo
        bv=body_bvh(); mesh=min(sdist(bv,Vector((k*.015*K,bp.y,bp.z))) for k in range(-20,21))-RBAR
        if T['mode'] in ('floor','hang','rel'): mesh=min(mesh,fclear(bv,bp.y,bp.z))
        # rack: antebrazo y mano contra la malla del torso (BVH) y altura real del codo respecto del hombro
        if T['mode']=='rack':
            rk=min(sdist(bv,p)-rad for p,rad in arm_pts(E,W,fTn,(hm@HF['Left'].col[2]).normalized())); elbow=E.z-S.z
    capT=bar_clear(bp.y,bp.z,legs,True) if T['mode']!='none' else 9.0     # cápsulas de torso, cuello y cabeza: se mide siempre, también en los cuadros en modo rack
    return dict(arm=arm,bar=bar,foot=foot,hand=hand,rack=rk,elbow=elbow,mesh=mesh,flex=flex,wext=wext,wdev=wdev,capT=capT,
                feet=[(P_(s+'ToeBase'),P_(s+'Foot')) for s in ('Left','Right')])

# ---------- secuencias ----------
FLOOR=dict(mode='floor',z=BARZ); RACK=dict(mode='rack',elb=-.05); OVER=dict(mode='over',back=.035)
PULL=dict(stance=.66,toe=14); OH=dict(phi=118,shrug=28,epole=(1,.15,0)); OHS=dict(OH,phi=-242,turn=-1)
RK=dict(bar=RACK,shrug=20,prot=34,arch=8)     # rack: escápulas elevadas y en protracción para armar el estante de deltoides
# Tiempos: 'vk' = velocidad de la barra (m/s) al pasar por la fase; entre dos fases con 'vk' la barra acelera de forma constante sobre su recorrido real.
# Donde no hay 'vk' en los dos extremos vale 't' (segundos hasta la fase siguiente). 'hold' = el cuerpo pasa por la fase con velocidad cero. Todo pensado para 1,69 m; se escala con raíz de K.
GRAV=9.81
def pull(g,sn):
    """Tirón (común a cargada y arranque): salida, despegue con el mismo ángulo de espalda, primer tirón hasta la rodilla, transición (doble flexión de rodilla), posición de potencia y triple extensión."""
    kz=AZ+SHN
    sal=dict(PULL,grip=g,shin=29 if sn else 27,ahead=.075 if sn else .055,shrug=-8,ko=9 if sn else 7,bar=FLOOR,head=-14,arch=8,epole=(1,.3,0),vk=0,hold=True)
    return [('Salida',sal),
            ('Despegue',dict(PULL,grip=g,bx=(29 if sn else 27,-.004),ahead=.085 if sn else .065,leanas=(sal,1.0),shrug=-8,ko=8 if sn else 6,bar=dict(mode='floor',z=BARZ+.08*K),head=-13,arch=8,epole=(1,.3,0),vk=.6)),
            ('Primer tirón',dict(PULL,grip=g,shin=4,ahead=.11 if sn else .10,shrug=-6,ko=5,bar=dict(mode='floor',z=kz+.015*K,gap=.006),head=-10,arch=7,epole=(1,.3,0),vk=1.2 if sn else 1.0)),
            ('Transición',dict(PULL,grip=g,shin=8 if sn else 7,thigh=26 if sn else 28,ko=6,lean=36 if sn else 32,shrug=-2,bar=dict(mode='hang',gap=.0),head=-4,arch=6,epole=(1,.3,0),vk=1.5 if sn else 1.15)),
            ('Segundo tirón',dict(PULL,grip=g,shin=17 if sn else 11,thigh=24 if sn else 30,ko=6,lean=6 if sn else 9,bar=dict(mode='hang',gap=.0),head=0,arch=5,epole=(1,.3,0),vk=1.7 if sn else 1.3)),
            ('Triple extensión',dict(PULL,grip=g,shin=-7,thigh=-4,ko=5,heel=24,lean=-14,shrug=15,bar=dict(mode='hang',gap=.008),head=2,arch=6,epole=(1,.3,0),vk=1.95 if sn else 1.3))]
def seqs(g,gs):
    SQ=dict(stance=1.12,toe=26); SNQ=dict(stance=1.15,toe=28); JB=dict(stance=.86,toe=16)     # JB: base del envión (ancho de cadera)
    # Envión: la barra sale de los hombros a plomo (yref). Para dejarle paso, el cuello se extiende desde su base: se retrae (retr) y la cabeza se inclina atrás con él (head negativo), como hace un levantador real;
    # con la cabeza derecha el mentón queda 2-3 cm dentro del recorrido y la barra tendría que rodearlo.
    # --- cargada: la barra llega a su ápice (triple extensión + subida balística), el cuerpo ya viene bajando; el rack la encuentra cerca de la paralela y se amortigua hasta el fondo
    pl=pull(g,False); te=pl[-1][1]; rise=te['vk']**2/(2*GRAV*.85)
    amo=dict(SQ,**dict(RK,arch=9),grip=g,shin=36,thigh=112,ko=26,head=-6,turn=-1,hold=True,vk=0,t=1.0)
    sub=('Subida',dict(SQ,**dict(RK,bar=dict(mode='rack',elb=-.05)),grip=g,shin=1,thigh=1,ko=9,lean=-2,head=-4,bal=0,t=.7,hold=True))
    rec=('Recuperación',dict(JB,**dict(RK,bar=dict(mode='rack',elb=-.07,thr=.016)),grip=g,shin=1,thigh=1,ko=7,lean=-2,head=-4,bal=0,step=((0,.5),(.5,1)),t=.28,hold=True))
    dip=('Envión · Dip',dict(JB,**dict(RK,bar=dict(mode='rack',elb=-.07,thr=.016)),grip=g,shin=31,thigh=36,ko=13,lean=-1,head=-6,retr=8,bal=0,vk=0,hold=True))
    imp=('Envión · Impulso',dict(JB,**dict(RK,bar=dict(mode='rack',elb=-.07,thr=.016),shrug=26),grip=g,shin=3,thigh=1,ko=8,heel=7,lean=-2,head=-14,retr=28,bal=0,vk=1.75))
    drv=('Envión · Empuje',dict(JB,grip=g,shin=-2,thigh=-5,ko=7,heel=20,lean=-4,shrug=16,bar=dict(mode='rel',d=(None,.25),gap=.012,yref=(imp[1],0)),hand='over',phi=112,head=-28,retr=30,arch=7,epole=(.5,-.4,-.7),bal=0,vk='auto'))
    fin=lambda **k:('Envión · Final',{**dict(grip=g,stance=.95,toe=14,shin=4,thigh=0,ko=8,bar=OVER,head=0,arch=5),**OH,**k})
    tdb=dict(PULL,grip=g,shin=30,thigh=55,ko=10,heel=22,lean=-4,shrug=16,bar=dict(mode='rel',d=(None,-.30),zref=(te,rise),gap=.03),phi=-8,head=0,arch=6,epole=(.8,.2,.6),vk=0)     # la cadera baja casi a plomo (rodillas adelante), no hacia atrás
    clean=[IDLE]+pl+[
        ('Tirón de brazos',tdb),
        ('Giro de codos',dict(SQ,grip=g,shin=33,thigh=94,ko=24,lean=8,shrug=20,prot=24,bar=dict(mode='rel',d=(None,.02),gap=.02),phi=-175,turn=-1,head=-5,arch=8,epole=(.5,.5,-1),ballean=0,vk=.7)),
        ('Recepción',dict(SQ,**dict(RK,arch=9),grip=g,shin=35,thigh=104,ko=26,head=-6,turn=-1,vk=.8)),
        ('Amortiguación',amo),sub,rec]
    tij={**dict(grip=g,stance=.95,toe=14,ko=4,hipabs=(.02,.2),feet=(('v',0),('k',36,152)),lean=0,bar=OVER,head=-4,arch=5,hold=True,vk=0,t=.6),**OH}
    split=[rec,dip,imp,drv,('Envión · Tijera',tij),
        ('Envión · Recuperación',{**dict(grip=g,stance=.95,toe=14,ko=6,base=-.05,hipabs=(0,.11),feet=((0,0),('as',40,tij)),bar=OVER,head=0,arch=5,t=.7),**OH}),fin(base=-.05)]
    power=[rec,dip,imp,drv,
        ('Power jerk · Recepción',{**dict(grip=g,stance=1.3,toe=26,shin=32,thigh=48,ko=18,bar=OVER,head=-4,arch=9,hold=True,vk=0,t=.8),**OH}),
        fin(stance=1.3,toe=26)]
    # squat jerk: empuje propio (la barra sólo sube lo balístico desde el impulso), bloqueo cerca de la paralela y bajada controlada al fondo con la barra ya bloqueada
    jrise=imp[1]['vk']**2/(2*GRAV*.9)
    squat=[rec,dip,imp,
        ('Envión · Empuje',dict(JB,grip=g,shin=16,thigh=36,ko=10,heel=14,lean=-2,shrug=16,bar=dict(mode='rel',d=(None,.25),zref=(imp[1],jrise),gap=.012,yref=(imp[1],0)),hand='over',phi=112,head=-28,retr=30,arch=7,epole=(.5,-.4,-.7),bal=0,vk=0)),
        ('Squat jerk · Recepción',{**dict(grip=g,stance=1.2,toe=28,shin=34,thigh=84,ko=24,bar=OVER,head=-6,arch=11,vk=.8),**OH}),
        ('Squat jerk · Fondo',{**dict(grip=g,stance=1.2,toe=28,shin=42,thigh=116,ko=28,bar=OVER,head=-6,arch=14,hold=True,vk=0,t=.9),**OH}),
        ('Squat jerk · Recuperación',{**dict(grip=g,stance=1.2,toe=28,shin=26,thigh=40,ko=16,bar=OVER,head=-2,arch=9,t=.5),**OH}),
        fin(stance=1.2,toe=28)]
    ps=pull(gs,True)
    rcs={**dict(SNQ,grip=gs,shin=37,thigh=114,ko=27,bar=OVER,head=-6,arch=9,hold=True,t=1.5),**OHS}
    sn=[IDLE]+ps+[
        ('Tirón de brazos',dict(PULL,grip=gs,shin=8,thigh=22,ko=8,heel=28,lean=-8,shrug=16,bar=dict(mode='rel',d=(None,-.32),gap=.04),phi=-8,head=0,arch=6,epole=(1,.2,.5),vk=1.45)),
        ('Giro',dict(SNQ,grip=gs,shin=30,thigh=70,ko=22,lean=4,shrug=20,bar=dict(mode='rel',d=(None,.2),zref=(rcs,.06),gap=.02),phi=-100,turn=-1,head=-4,arch=7,epole=(.6,1,.2),ballean=0,vk=0,t=.22)),
        ('Recepción',rcs),
        ('Recuperación',{**dict(SNQ,grip=gs,shin=4,thigh=0,ko=10,bar=OVER,head=0,arch=5),**OHS})]
    return dict(clean=clean,split=split,power=power,squat=squat,snatch=sn)
IDLE=('Parado',dict(PULL,grip=SHX,shin=3,thigh=5,ko=6,lean=1,bar=dict(mode='none'),head=0,arch=2,epole=(.25,1,0),t=1.2,hold=True))

# agarre de cargada: se ensancha lo mínimo para que el brazo pase por fuera de la rodilla
G_CLEAN=SHX+.07*K     # algo por fuera de los hombros
for it in range(8):
    worst=1e9
    for name,P in pull(G_CLEAN,False)[:2]:
        T=solve(P); bp=apply(T); worst=min(worst,check(T,bp)['arm'])
    if worst>=.004 or G_CLEAN>SHX+.13*K: break
    G_CLEAN+=min(.02,.006-worst)
_dz=SHZ0-(C0.z+.035*K); G_SNATCH=min(SHX+math.sqrt(max((UA+FA+PALM*.92)**2-_dz*_dz,.02)),.31*STY['H'])
print(f'GRIP {NAME}: clean={2*G_CLEAN:.2f} (holgura brazo-rodilla {worst*100:+.1f} cm) snatch={2*G_SNATCH:.2f}')
SEQ=seqs(G_CLEAN,G_SNATCH)
if os.environ.get('TARIMA_OVR'):
    # depuración: TARIMA_OVR="Envión · Impulso:retr=30,lean=-3;Envión · Empuje:retr=32" prueba parámetros de fase sin editar las reglas (vale para los dos personajes; no usar para exportar)
    _done=set()
    for it_ in os.environ['TARIMA_OVR'].split(';'):
        nm_,kv_=it_.split(':')
        for sq_ in SEQ.values():
            for n_,P_ in sq_:
                if n_==nm_ and (id(P_),it_) not in _done:
                    _done.add((id(P_),it_)); P_.update({k_:float(v_) for k_,v_ in (x_.split('=') for x_ in kv_.split(','))})
    print('OVR',os.environ['TARIMA_OVR'])

# ---------- barra de control para renders (no se exporta) ----------
def _cyl(name,parts,seg):
    bm_=bmesh.new()
    for r_,dep,xx in parts:
        g_=bmesh.ops.create_cone(bm_,cap_ends=True,segments=seg,radius1=r_,radius2=r_,depth=dep); bmesh.ops.translate(bm_,verts=g_['verts'],vec=(0,0,xx))
    bmesh.ops.rotate(bm_,verts=bm_.verts,cent=(0,0,0),matrix=Matrix.Rotation(D(90),3,'Y'))
    m=bpy.data.meshes.new(name); bm_.to_mesh(m); bm_.free(); o=bpy.data.objects.new(name,m); bpy.context.scene.collection.objects.link(o); return o
barprev=_cyl('barprev',[(RBAR,2.0,0)],24); plateprev=_cyl('plateprev',[(.225,.04,-.9),(.225,.04,.9)],32); plateprev.parent=barprev
pr=bpy.data.materials.new('pl'); pr.use_nodes=True; pr.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.75,.75,.8,1); pr.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.6
barprev.data.materials.append(pr); plateprev.data.materials.append(pr)

sc=bpy.context.scene; sc.render.fps=30; STEP=30; SUB=10
prev={}; meta={}; frame0=1; shots=[]; bad=[]
def key(fr):
    for p in pb:
        q=p.rotation_quaternion.copy()
        if p.name in prev and q.dot(prev[p.name])<0: q.negate(); p.rotation_quaternion=q
        prev[p.name]=q.copy(); p.keyframe_insert('rotation_quaternion',frame=fr)
        if p.name in ('mixamorig:Hips','Bar'): p.keyframe_insert('location',frame=fr)
VIEWS={'side':dict(cam_loc=(5.2,-.1,.95),target=(0,-.1,.95),res=(300,440),samples=10,lens=85),
       'q':dict(cam_loc=(2.0,-3.4,1.25),target=(0,-.05,.95),res=(460,640),samples=16,lens=70),
       'front':dict(cam_loc=(.15,-3.4,.75),target=(0,0,.6),res=(460,460),samples=16,lens=70),
       'up':dict(cam_loc=(1.3,-2.2,1.5),target=(0,-.05,1.35),res=(460,520),samples=16,lens=70),
       # primeros planos de la mano izquierda (relativos a la muñeca): de frente, de atrás/abajo (lado de la palma) y de costado
       'handF':dict(cam_loc=(.05,-.55,.10),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip'),
       'handB':dict(cam_loc=(.20,.42,-.26),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip'),
       'handS':dict(cam_loc=(.55,-.24,.14),target=(0,0,0),res=(460,400),samples=24,lens=85,rel='grip',noplate=True),
       'handU':dict(cam_loc=(.08,-.36,-.40),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip'),
       'handT':dict(cam_loc=(.28,-.34,.34),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip'),
       'handM':dict(cam_loc=(-.30,.34,-.26),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip'),
       'handK':dict(cam_loc=(-.50,-.22,-.16),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip',noplate=True),
       'handR':dict(cam_loc=(.05,-.50,.42),target=(0,0,0),res=(460,400),samples=24,lens=105,rel='grip'),
       # rack (relativos al hombro izquierdo): de costado, de frente y tres cuartos desde arriba
       'rackS':dict(cam_loc=(3.0,-.13,.03),target=(0,-.13,-.03),res=(460,460),samples=20,lens=120,rel='LeftArm',noplate=True),
       'rackF':dict(cam_loc=(-SHX+.2,-2.6,.2),target=(-SHX,0,-.04),res=(460,460),samples=20,lens=95,rel='LeftArm'),
       'rackT':dict(cam_loc=(.75,-1.3,.8),target=(-.06,-.06,0),res=(460,460),samples=20,lens=95,rel='LeftArm')}
VIEWS['side2']=dict(cam_loc=(3.4,-.6,1.2),target=(0,-.1,.9),res=(460,640),samples=16,lens=70)
WANT={} if os.environ.get("TARIMA_NOSHOT") else {('clean','Recepción'):['q','rackS','rackF'],('clean','Recuperación'):['up','rackS','rackF','rackT','handR','handS','handT'],('split','Envión · Dip'):['rackS','rackF'],('split','Envión · Impulso'):['rackS'],
      ('snatch','Segundo tirón'):['handF','handB','handS','handM','handK'],('clean','Primer tirón'):['handB','handK'],
      ('snatch','Recuperación'):['handF','handB','handS','handU'],('split','Envión · Final'):['handF','handU']}
THR=dict(arm=-.012,bar=-.012,foot=-.004,hand=-.006,rack=-.012,elbow=-.09,     # elbow: el codo del rack no puede quedar más de 9 cm (x K) bajo el hombro (húmero a más de ~20° de la horizontal)
         mesh=-.012,slip=.004,flex=12.0,wext=(-75.0,100.0),wdev=(-35.0,25.0),floor=-.003,
         gdown=1.2,gup=2.5,dvy=.7,hip=2.5,trap=.004,union=(.5,.2))     # barra: no cae a más de 1,2 g ni acelera hacia arriba a más de 2,5 g; su velocidad horizontal no cambia más de 0,7 m/s entre ventanas de 25 ms seguidas (unos 2,9 g); la cadera no baja a más de 2,5 m/s (x raíz de K); hook: índice/medio a menos de 4 mm del pulgar y cubriéndolo     # floor: la barra cargada no puede bajar del nivel en que los discos apoyan en la tarima     # mesh: barra contra la malla posada · slip: un pie apoyado no se desplaza entre muestras (m) · flex: codo recto (grados) hasta la triple extensión
STRAIGHT=('Salida','Despegue','Primer tirón','Transición','Segundo tirón')
_pf=[None]; STAT={}; SNAP={}
def snap(): return {p.name:p.matrix.copy() for p in pb}
def snapdiff(A,B):
    return max((A[n].translation-B[n].translation).length for n in A)*1000,max(math.degrees(2*math.acos(min(1.0,abs(A[n].to_quaternion().dot(B[n].to_quaternion()))))) for n in A)
def _stat(k,v,where,fn=min):
    if k not in STAT or fn(v,STAT[k][0])!=STAT[k][0]: STAT[k]=(v,where)
CAPR=.10     # radio (m, x K) alrededor del estante de hombros dentro del cual la cápsula de torso se sabe más gorda que el cuerpo (lo que marca en la pose de rack, verificada contra la malla)
def frame_check(seg,name,j,T,bp,P,mixed=False):
    r=check(T,bp); capbad=False
    if mixed and T['mode']=='rack':
        # entrada/salida del rack: la cápsula de torso, cuello y cabeza se mide en todas las muestras (como en la versión original). La cápsula no modela el estante de hombros:
        # en la pose de rack, donde la barra apoya sobre la malla, marca capEnd (negativo). Esa diferencia sólo se descuenta cerca del estante, en proporción a la cercanía.
        capEnd,rel=mixed; S_=PB('LeftArm').matrix.translation; dsh=math.hypot(bp.y-S_.y-rel.y,bp.z-S_.z-rel.z); allow=min(0.0,capEnd)*max(0.0,1-dsh/(CAPR*K)); capbad=r['capT']<THR['bar']+allow
        _stat('capsula-rack',(r['capT']-allow)*100,f'{seg} {name} {j}')
        if os.environ.get('TARIMA_CAPR'): print(f"CAPR {NAME} {seg} {name} {j}: cápsula {r['capT']*100:+.1f} cm · a {dsh*100:.1f} cm del estante · descuento {allow*100:+.1f} · malla {r['mesh']*100:+.1f}")
    ca,cb,cf,ch,cr,ce=r['arm'],r['bar'],r['foot'],r['hand'],r['rack'],r['elbow']; tgt=T.get('elb',0)*K     # objetivo de altura de codo de la fase (interpolado entre dos racks)
    # pie patinando: si la bola del pie (o el talón) está apoyada en dos muestras seguidas, no puede haberse movido
    slip=0.0
    if _pf[0] is not None:
        for (b0,a0),(b1,a1) in zip(_pf[0],r['feet']):
            if b0.z-BALL.z<.006 and b1.z-BALL.z<.006: slip=max(slip,math.hypot(b1.x-b0.x,b1.y-b0.y))
            if a0.z-AZ<.006 and a1.z-AZ<.006: slip=max(slip,math.hypot(a1.x-a0.x,a1.y-a0.y))
    _pf[0]=r['feet']
    # brazo recto mientras la barra cuelga: de la salida a la triple extensión
    st=seg in ('clean','snatch') and (name in STRAIGHT or (name=='Triple extensión' and j==0))
    tags=[k for k,f in (('brazo-pierna',ca<THR['arm']),('barra-cuerpo',cb<THR['bar'] or capbad),('pie',cf<THR['foot']),('mano-barra',ch<THR['hand']),('rack',cr<THR['rack']),
          ('codo-rack',T['mode']=='rack' and not mixed and ce<tgt-.025*K),('muñeca-desv',T['mode']!='none' and T['grip']>.5 and not THR['wdev'][0]<=r['wdev']<=THR['wdev'][1]),('barra-malla',r['mesh']<THR['mesh']),('pie-patina',slip>THR['slip']),('codo-flexionado',st and r['flex']>THR['flex']),('barra-piso',bp.z-BARZ<THR['floor']),('muñeca',T['mode']!='none' and T['grip']>.5 and not THR['wext'][0]<=r['wext']<=THR['wext'][1])) if f]
    if tags: bad.append((seg,name,j,'+'.join(tags),round(ca*100,1),round(cb*100,1),round(cf*100,1),round(ch*100,1),round(cr*100,1),round(ce*100,1),round(r['mesh']*100,1),round(slip*100,1),round(r['flex']),round(r['wext'])))
    w=f'{seg} {name} {j}'
    if T['mode']!='none':
        _stat('mesh',r['mesh'],w); _stat('slip',slip,w,max)
        if T['grip']>.5: _stat('wext+',r['wext'],w,max); _stat('wext-',r['wext'],w); _stat('wdev+',r['wdev'],w,max); _stat('wdev-',r['wdev'],w)
        if st: _stat('flex',r['flex'],w,max)
        if st: _stat('gap',r['mesh'],w,max)
        if T['mode']=='rack' and not mixed: _stat('codo-rack',(ce-tgt)*100,w)
    if j==0:
        ex=f" mano-barra {ch*100:+.1f}" if ch<8 else ''
        if r['mesh']<8: ex+=f" barra-malla {r['mesh']*100:+.1f}"
        if cr<8: ex+=f" · rack: codo {ce*100:+.1f} cm vs hombro, mano/antebrazo-torso {cr*100:+.1f}"
        if T['mode']!='none': ex+=f" cm · codo {r['flex']:.0f}° muñeca ext {r['wext']:.0f}° desv {r['wdev']:+.0f}°"
        print(f"POSE {NAME} {seg} {name}: torso={T['lean']:.1f} barra=({MID-(-bp.y)-0:+.3f},{bp.z+SOLE:.3f}) cadera={T['C'].z+SOLE:.3f} | brazo-pierna {ca*100:+.1f} barra-cuerpo {cb*100:+.1f} pie {cf*100:+.1f}{ex}")
    return r
def shoot(seg,i,name):
    for vw in WANT.get((seg,name),[]):
        V=dict(VIEWS[vw]); fn=OUT+f'd_{seg}_{i:02d}_{vw}.png'; rel=V.pop('rel',None); plateprev.hide_render=V.pop('noplate',False)
        if rel:
            h=Vector((PB('LeftHand').matrix.translation.x,barprev.location.y,barprev.location.z)) if rel=='grip' else PB(rel).matrix.translation
            V['cam_loc']=tuple(Vector(V['cam_loc'])+h); V['target']=tuple(Vector(V['target'])+h)
        render(fn,**V); shots.append(fn); plateprev.hide_render=False

# ---------- hojas de control: cada fase de costado y de frente, en proyección ortográfica ----------
from PIL import Image as _I, ImageDraw as _ID, ImageFont as _IF
def _font(sz):
    for f in ('/System/Library/Fonts/Helvetica.ttc','/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try: return _IF.truetype(f,sz)
        except Exception: pass
    return _IF.load_default()
FR=dict(span=2.6,zc=1.16); YC=-.06; TILE=dict(side=(330,440),front=(440,440))
def oshot(path,view,bp,y0,label):
    """Render ortográfico rápido (Cycles, pocas muestras) con guías: tarima, vertical de la barra en la salida, medio pie y contorno del disco."""
    W_,H_=TILE[view]; SPAN,ZC=FR['span'],FR['zc']; sc.render.engine='CYCLES'; sc.cycles.samples=6; __import__('common').cycles_device(sc)   # GPU (Metal) si hay, si no CPU; hilos de CPU limitados (common.THREADS)
    try: sc.cycles.use_denoising=True; sc.cycles.use_adaptive_sampling=True
    except Exception: pass
    sc.render.resolution_x,sc.render.resolution_y=W_,H_; sc.render.resolution_percentage=100; sc.render.filepath=path
    for o in [o for o in bpy.data.objects if o.name.startswith('PV_')]: bpy.data.objects.remove(o)
    cam=bpy.data.objects.new('PV_cam',bpy.data.cameras.new('PV_cam')); sc.collection.objects.link(cam); cam.data.type='ORTHO'; cam.data.ortho_scale=SPAN*max(W_,H_)/H_
    loc,tg=((9,YC,ZC),(0,YC,ZC)) if view=='side' else ((0,-9,ZC),(0,0,ZC)); cam.location=loc; cam.rotation_euler=(Vector(tg)-Vector(loc)).to_track_quat('-Z','Y').to_euler(); sc.camera=cam
    def light(n,lc,e,col,size):
        l=bpy.data.lights.new(n,'AREA'); l.energy=e; l.color=col; l.size=size; o=bpy.data.objects.new(n,l); sc.collection.objects.link(o); o.location=lc
        o.rotation_euler=(Vector((0,0,.9))-Vector(lc)).to_track_quat('-Z','Y').to_euler()
    light('PV_k',(3.2,-3.2,3.6),1300,(1,.96,.9),2.5); light('PV_r',(-3,3,2.6),600,(.6,.8,1),1.5); light('PV_f',(3.5,2.2,1.4),500,(.9,.9,1),3.5); light('PV_t',(0,-.6,5.5),500,(1,.98,.95),2.5); light('PV_g',(-2.5,-3.4,1.2),450,(.85,.9,1),3.5)
    if sc.world is None: sc.world=bpy.data.worlds.new('PV_world')
    plateprev.hide_render=(view=='side'); bpy.ops.render.render(write_still=True); plateprev.hide_render=False
    im=_I.open(path).convert('RGB'); dr=_ID.Draw(im); m=SPAN/H_; py=lambda z:H_/2-(z-ZC)/m
    dr.line([(0,py(-SOLE)),(W_,py(-SOLE))],fill=(120,130,150),width=1)
    if view=='side':
        px=lambda y:W_/2+(y-YC)/m
        for z_ in range(0,int(H_),8): dr.line([(px(y0),z_),(px(y0),z_+4)],fill=(255,210,60),width=1)     # vertical de la barra en la salida
        dr.line([(px(-MID),py(-SOLE)),(px(-MID),py(-SOLE)+8)],fill=(90,255,140),width=2)                     # medio pie
        r_=.225/m; dr.ellipse([px(bp.y)-r_,py(bp.z)-r_,px(bp.y)+r_,py(bp.z)+r_],outline=(255,90,90),width=1)
        dr.ellipse([px(bp.y)-3,py(bp.z)-3,px(bp.y)+3,py(bp.z)+3],fill=(255,60,60))
    im.save(path); return im
def sheet(seg,view,tiles):
    cols=min(6,len(tiles)); rows=(len(tiles)+cols-1)//cols; W_,H_=TILE[view]; LB=24; out=_I.new('RGB',(W_*cols,(H_+LB)*rows),(14,16,26)); dr=_ID.Draw(out); f=_font(15)
    for k,(nm,im) in enumerate(tiles):
        x,y=(k%cols)*W_,(k//cols)*(H_+LB); out.paste(im,(x,y)); dr.text((x+6,y+H_+3),f'{k:02d} · {nm}',fill=(235,235,240),font=f)
    out.save(OUT+f'sheet_{seg}_{view}.png')

# ---------- tiempos reales y trayectoria de la barra ----------
def timing(seg,seq,pts,hz):
    """Tiempo real (s) de cada muestra.
    'vk' = velocidad de la barra sobre su recorrido (m/s para 1,69 m, sin signo; en la práctica la vertical) al pasar por la fase; en un ápice o en una fase quieta vale 0, y 'auto' reparte la aceleración constante entre sus vecinas.
    Tramo con 'vk' en sus dos fases: aceleración constante de la barra sobre su recorrido (velocidad continua entre tramos). Si no, vale 't' (segundos) con avance de pose suavizado,
    velocidad cero en las fases con 'hold' y continua con el tramo vecino; ese tramo se alarga lo necesario para que la barra no caiga a más de 1 g ni la cadera baje más rápido que su tope."""
    n=len(seq); rk=math.sqrt(K); z=[p.z for p in pts]; vk=[seq[i][1].get('vk') for i in range(n)]; num=lambda x:isinstance(x,(int,float))
    Lz=[sum(max((pts[i*SUB+k+1]-pts[i*SUB+k]).length,1e-6) for k in range(SUB)) for i in range(n-1)]
    # el reparto del tiempo dentro del tramo usa sobre todo el avance vertical (un desvío horizontal de milímetros no debe comprimir el tiempo) y nunca se anula
    met=lambda k:math.sqrt((z[k+1]-z[k])**2+.09*(pts[k+1].y-pts[k].y)**2)+.0015; Lr=[sum(met(i*SUB+k) for k in range(SUB)) for i in range(n-1)]
    for i in range(n):
        if vk[i]=='auto':
            p_=max(k for k in range(i) if num(vk[k])); q_=min(k for k in range(i+1,n) if num(vk[k])); A=sum(Lz[p_:i]); B=sum(Lz[i:q_]); vk[i]=math.sqrt(max(vk[p_]**2+(vk[q_]**2-vk[p_]**2)*A/(A+B),0))
    for i in range(1,n-1):
        d0=z[i*SUB]-z[(i-1)*SUB]; d1=z[(i+1)*SUB]-z[i*SUB]
        if vk[i] and d0*d1<0 and min(abs(d0),abs(d1))>.01: bad.append((seg,seq[i][0],0,'vk-en-ápice: la barra invierte el sentido en una fase con velocidad vertical distinta de cero'))
    vm=[vk[i] is not None and vk[i+1] is not None and vk[i]+vk[i+1]>0 and Lz[i]>.02 for i in range(n-1)]; loc=[None]*(n-1)
    for i in range(n-1):
        if vm[i]:
            v0=vk[i]*rk; v1=vk[i+1]*rk; cum=0.0; l=[0.0]
            for k in range(SUB):
                cum+=met(i*SUB+k); v=math.sqrt(max(v0*v0+(v1*v1-v0*v0)*cum/Lr[i],0)); l.append(2*cum/(v0+v)*Lz[i]/Lr[i])
            loc[i]=l
    def rate(i):
        # avance de pose (fases por segundo) al pasar por la fase i
        if i in (0,n-1) or seq[i][1].get('hold'): return 0.0
        if vm[i-1]: return (1/SUB)/(loc[i-1][-1]-loc[i-1][-2])
        if vm[i]: return (1/SUB)/(loc[i][1]-loc[i][0])
        h0=seq[i-1][1].get('t',.5)*rk; h1=seq[i][1].get('t',.5)*rk; w1=2*h1+h0; w2=h1+2*h0; return (w1+w2)/(w1*h0+w2*h1)
    def warp(i,h):
        m0=min(rate(i)*h,2.9); m1=min(rate(i+1)*h,2.9); l=[0.0]
        for k in range(1,SUB):
            lo,hi=0.0,1.0
            for _ in range(40):
                md=(lo+hi)/2
                if herm(0,1,m0,m1,md)<k/SUB: lo=md
                else: hi=md
            l.append(h*lo)
        return l+[h]
    for i in range(n-1):
        if vm[i]: continue
        h=seq[i][1].get('t',.5)*rk; zs=z[i*SUB:(i+1)*SUB+1]; hs_=hz[i*SUB:(i+1)*SUB+1]
        for _ in range(40):
            l=warp(i,h); vz=[(zs[k+1]-zs[k])/(l[k+1]-l[k]) for k in range(SUB)]; amin=min((vz[k]-vz[k-1])/((l[k+1]-l[k-1])/2) for k in range(1,SUB))
            if rate(i)==0: amin=min(amin,vz[0]/(l[1]-l[0]))
            if rate(i+1)==0: amin=min(amin,-vz[-1]/(l[-1]-l[-2]))
            hmin=min((hs_[k+1]-hs_[k])/(l[k+1]-l[k]) for k in range(SUB))
            if amin>=-.95*GRAV and hmin>=-.92*THR['hip']*rk: break
            h*=1.05
        loc[i]=l
    tt=[0.0]
    for l in loc:
        t0=tt[-1]; tt+=[t0+x for x in l[1:]]
    return tt
def traj(seg,seq,pts,tt,hz):
    names=[n for n,_ in seq]; N=len(pts); ok=all(tt[k+1]>tt[k] for k in range(N-1)) and len(tt)==N; rk=math.sqrt(K)
    dt=[max(tt[k+1]-tt[k],1e-6) for k in range(N-1)]
    v=[(pts[k+1]-pts[k]).length/dt[k] for k in range(N-1)]; vz=[(pts[k+1].z-pts[k].z)/dt[k] for k in range(N-1)]; vy=[(pts[k+1].y-pts[k].y)/dt[k] for k in range(N-1)]; vh=[(hz[k+1]-hz[k])/dt[k] for k in range(N-1)]
    ph=lambda k:f"{names[min(k//SUB,len(names)-1)]}+{k%SUB}/{SUB}"
    # física de la barra y de la cadera, medida con ventanas de 25 ms a cada lado de cada muestra (las muestras van de 5 a 60 ms; así el umbral vale lo mismo en todas):
    # sin apoyo la barra no cae a más de 1,2 g, no acelera hacia arriba a más de 2,5 g, su velocidad horizontal no cambia más de 0,7 m/s entre ventanas seguidas, y la cadera no baja más rápido que su tope
    WN=.025; ta_=np.array(tt); ip=lambda arr,t:float(np.interp(t,ta_,arr)); zy=(np.array([p.z for p in pts]),np.array([p.y for p in pts]),np.array(hz))
    wk=lambda k:max(WN,dt[min(k,N-2)],dt[max(k-1,0)])     # donde las muestras están más separadas que 25 ms la ventana es el paso de muestreo (entre muestras la posición es lineal)
    ks=[k for k in range(1,N-1) if tt[k]-wk(k)>=tt[0]-1e-9 and tt[k]+wk(k)<=tt[-1]+1e-9]; va=lambda arr,k:(ip(arr,tt[k]+wk(k))-ip(arr,tt[k]))/wk(k); vb=lambda arr,k:(ip(arr,tt[k])-ip(arr,tt[k]-wk(k)))/wk(k)
    az=[(va(zy[0],k)-vb(zy[0],k))/wk(k) for k in ks]; jy=[abs(va(zy[1],k)-vb(zy[1],k))*WN/wk(k) for k in ks]; hw=[va(zy[2],k) for k in ks]
    for tag,src,idx,un in (('barra-cae',az,[q for q in range(len(ks)) if az[q]<-THR['gdown']*GRAV],'m/s²'),('barra-acelera',az,[q for q in range(len(ks)) if az[q]>THR['gup']*GRAV],'m/s²'),
                           ('barra-zigzag',jy,[q for q in range(len(ks)) if jy[q]>THR['dvy']],'m/s'),('cadera-cae',hw,[q for q in range(len(ks)) if hw[q]<-THR['hip']*rk],'m/s')):
        if idx:
            qw=max(idx,key=lambda q:abs(src[q])); kw=ks[qw]; bad.append((seg,names[min(kw//SUB,len(names)-1)],kw%SUB,f"{tag}: {len(idx)} muestras, peor {src[qw]:+.2f} {un}"))
    kj=ks[max(range(len(ks)),key=lambda q:jy[q])]; kh_=ks[min(range(len(ks)),key=lambda q:hw[q])]
    i0=names.index('Salida')*SUB if 'Salida' in names else 0; i1=max(k for k,n in enumerate(names) if 'Recepción' in n or 'Tijera' in n)*SUB
    y0=pts[i0].y; dx=[(p.y-y0) for p in pts[i0:i1+1]]     # + = hacia el levantador
    kp=max(range(i0,i1),key=lambda k:vz[k]); zmax=max(p.z for p in pts[i0:i1+1])+SOLE; kz=max(range(i0,i1+1),key=lambda k:pts[k].z); kv=max(range(N-1),key=lambda k:v[k]); kd=min(range(N-1),key=lambda k:vz[k]); kh=min(range(N-1),key=lambda k:vh[k])
    print(f"TRAJ {NAME} {seg}: S horizontal {max(dx)*100:+.1f} cm hacia el levantador / {min(dx)*100:+.1f} cm hacia adelante (amplitud {(max(dx)-min(dx))*100:.1f} cm; recepción a {dx[-1]*100:+.1f} cm de la vertical de salida) · "
          f"altura máx {zmax:.3f} m en {ph(kz)} (cae {(zmax-SOLE-pts[i1].z)*100:.1f} cm a la recepción) · velocidad vertical pico {vz[kp]:+.2f} m/s en {ph(kp)} (t={tt[kp]-tt[i0]:.2f} s desde la salida), mínima (bajando) {vz[kd]:+.2f} m/s en {ph(kd)} · |v| pico {v[kv]:.2f} m/s en {ph(kv)} · "
          f"aceleración vertical {min(az):+.1f}/{max(az):+.1f} m/s² · salto máx de velocidad horizontal {max(jy):.2f} m/s en {ph(kj)} · cadera: bajada más rápida {min(hw):+.2f} m/s en {ph(kh_)} (ventanas de 25 ms) · "
          f"duración total {tt[-1]:.2f} s (salida→recepción {tt[i1]-tt[i0]:.2f} s) · tt estrictamente creciente: {'sí' if ok else 'NO'} ({N} muestras)")
    print(f"TRAJV {NAME} {seg}: "+' | '.join(f"{names[i]}→ {tt[(i+1)*SUB]-tt[i*SUB]:.2f}s x={(pts[i*SUB].y-y0)*100:+.1f} z={pts[i*SUB].z+SOLE:.2f} cad={hz[i*SUB]+SOLE:.2f} v̄z={(pts[(i+1)*SUB].z-pts[i*SUB].z)/(tt[(i+1)*SUB]-tt[i*SUB]):+.2f}" for i in range(len(names)-1)))
    if not ok: bad.append((seg,'tt no creciente',0,'tiempos'))
    # gráfico: trayectoria a escala, trayectoria con el eje horizontal x4, y altura/velocidad en el tiempo
    Wd,Hd=1000,660; im=_I.new('RGB',(Wd,Hd),(14,16,26)); dr=_ID.Draw(im); f=_font(13); zt=max(p.z for p in pts)+SOLE+.12; sc_=(Hd-70)/zt; Y=lambda z:Hd-40-(z+SOLE)*sc_
    for ox,mag,ttl in ((150,1,'a escala'),(430,4,'horizontal ×4')):
        X=lambda y:ox+(y-y0)*sc_*mag
        dr.line([(ox-130,Y(-SOLE)),(ox+130,Y(-SOLE))],fill=(120,130,150)); dr.text((ox-120,8),f'{seg} · {ttl}  (frente ← · → levantador)',fill=(200,200,210),font=f)
        for z_ in range(40,Hd-40,10): dr.line([(ox,z_),(ox,z_+5)],fill=(255,210,60))
        for g_ in (-.10,-.05,.05,.10): dr.line([(X(y0+g_),Y(-SOLE)),(X(y0+g_),Y(-SOLE)+6)],fill=(120,130,150))
        dr.line([(X(p.y),Y(p.z)) for p in pts],fill=(255,90,90),width=2)
        for p in pts: dr.ellipse([X(p.y)-1.5,Y(p.z)-1.5,X(p.y)+1.5,Y(p.z)+1.5],fill=(255,170,170))
        for i,n in enumerate(names):
            p=pts[i*SUB]; dr.ellipse([X(p.y)-4,Y(p.z)-4,X(p.y)+4,Y(p.z)+4],outline=(255,255,255)); dr.text((X(p.y)+7,Y(p.z)-7),str(i),fill=(255,255,255),font=f)
    gx,gw=600,380; T_=tt[-1]; vm=max(max(v),.5); XT=lambda t:gx+t/T_*gw
    for (gy,gh,lab,series,top) in ((40,250,'altura de la barra (m)',[p.z+SOLE for p in pts],zt),(350,250,f'velocidad de la barra (m/s), pico {max(v):.2f}',v,vm*1.1)):
        dr.rectangle([gx,gy,gx+gw,gy+gh],outline=(70,76,96)); dr.text((gx+4,gy-16),lab,fill=(200,200,210),font=f)
        ts=tt if len(series)==N else [(tt[k]+tt[k+1])/2 for k in range(N-1)]
        dr.line([(XT(t),gy+gh-s_/top*gh) for t,s_ in zip(ts,series)],fill=(110,200,255),width=2)
        for i in range(len(names)): dr.line([(XT(tt[i*SUB]),gy),(XT(tt[i*SUB]),gy+gh)],fill=(70,76,96)); dr.text((XT(tt[i*SUB])+2,gy+2+(i%4)*12),str(i),fill=(255,255,255),font=f)
    dr.text((600,606),'  '.join(f'{i}:{n}' for i,n in enumerate(names))[:140],fill=(200,200,210),font=_font(10)); dr.text((600,620),'  '.join(f'{i}:{n}' for i,n in enumerate(names))[140:280],fill=(200,200,210),font=_font(10))
    im.save(OUT+f'traj_{seg}.png')
    json.dump(dict(seg=seg,sub=SUB,names=names,t=[round(x,4) for x in tt],y=[round(p.y,4) for p in pts],z=[round(p.z+SOLE,4) for p in pts],hip=[round(x+SOLE,4) for x in hz]),open(OUT+f'traj_{seg}.json','w'),ensure_ascii=False)

DBG=os.environ.get('TARIMA_DBG')
if DBG:
    # depuración: TARIMA_DBG="clean:Recepción,snatch:Segundo tirón" resuelve y renderiza sólo esas fases, sin exportar
    for item in DBG.split(','):
        seg,name=item.split(':')
        if name.endswith('~'):
            # transición completa desde esa fase: sólo chequeo, sin render
            name=name[:-1]; i=[n for n,_ in SEQ[seg]].index(name); ta,tc=solve(SEQ[seg][i][1]),solve(SEQ[seg][i+1][1])
            for j in range(1,SUB):
                T=declip(lerp_task(ta,tc,j/SUB)); bp=settle(T); n0=len(bad)
                r=frame_check(seg,name,j,T,bp,SEQ[seg][i][1])
                print(f"POSE~ {seg} {name} j={j}: mano-barra {r['hand']*100:+.1f} ({WORST.get('hand')}) rack {r['rack']*100:+.1f} codo {r['elbow']*100:+.1f} malla {r['mesh']*100:+.1f} flex {r['flex']:.0f} muñeca {r['wext']:.0f}/{r['wdev']:.0f} kinds {T['kinds'][:2]} gg {[round(x,3) for x in T['gg']]}")
            continue
        i=[n for n,_ in SEQ[seg]].index(name); P=SEQ[seg][i][1]; T=declip(solve(P)); bp=settle(T); frame_check(seg,name,0,T,bp,P); barprev.location=bp; shoot(seg,i,name)
        if os.environ.get('TARIMA_RACKDBG') and T['mode']=='rack':
            # qué tope limita la altura del codo: se repite la búsqueda aflojando un tope por vez (sólo diagnóstico, no cambia la pose)
            S_=tor(T); bv_=body_bvh(); base_=dict(RLIM)
            for lab,chg in (('base',{}),('flex 170',dict(flex=170)),('rad 45',dict(rad=45)),('ext 110',dict(ext=110)),('pitch 70',dict(pitch=70)),('rad45+flex170',dict(rad=45,flex=170)),('todo',dict(rad=45,flex=170,ext=110,pitch=70))):
                RLIM.update(base_); RLIM.update(chg)
                for nm_,bb in (('sin malla',None),('con malla',bv_)):
                    r=rack_arms(S_,T['bar'],T['gg'][0],T['elb'],bb)
                    if r: print(f"RACKDBG {seg} {name} [{lab} · {nm_}]: codo {r[6]*100:+.1f} cm, lateral {r[9]*100:+.1f} · flex {r[5]:.0f} ext {r[4]:.0f} desv {r[11]:+.0f} · phi {r[7]} yaw {r[8]} hx {r[14]:.0f} ga {r[10]*100:.1f} · holgura {r[12]*100:+.1f} · costo {r[0]:.3f}")
            RLIM.update(base_)
        oshot(OUT+f'dbg_{seg}_{i:02d}_side.png','side',bp,bp.y,name); oshot(OUT+f'dbg_{seg}_{i:02d}_front.png','front',bp,bp.y,name)
    print('CHK',NAME,'(depuración) cuadros con superposición:',len(bad),bad); sys.exit(0)
SH=os.environ.get('SHEETS'); FASTM=os.environ.get('FAST'); ONLY=os.environ.get('TARIMA_SEGS')
SEGS=tuple(ONLY.split(',')) if ONLY else ('clean','split','power','squat','snatch')
def hull(need):
    """Envolvente suave del desvío que necesita la barra en un tramo para no entrar en el cuerpo: una sola onda que vale cero en las dos fases y cubre lo necesario en cada muestra,
    en vez de corregir cuadro por cuadro (que serrucha la trayectoria)."""
    n=len(need)-1; best=None
    if max(need)<=1e-5: return [0.0]*(n+1)
    for q_ in (1.0,1.6,1/1.6,2.4,1/2.4,3.5,1/3.5):
        w=[math.sin(math.pi*(j/n)**q_)**2 for j in range(n+1)]; A=max(need[j]/max(w[j],.3) for j in range(1,n))     # pegado a una fase la onda puede quedar hasta unos milímetros corta: lo cubre la tolerancia de contacto (y, si no, el asentado de respaldo)
        if best is None or A<best[0]*.9: best=(A,w)
    return [best[0]*x for x in best[1]]
if GINF.get('hook',{}).get('atrapado') and (GINF['hook']['atrapado'][0]>THR['trap']*1000 or GINF['hook']['cubre']<0): bad.append(('agarre','hook',0,f"pulgar sin atrapar: índice/medio a {GINF['hook']['atrapado'][0]} mm del pulgar, punta del pulgar {GINF['hook']['cubre']} mm pasado el eje del índice"))
for seg in SEGS:
    seq=SEQ[seg]; tasks=[solve(P) for name,P in seq]; n_=len(tasks)
    if seg in ('clean','snatch'): tasks[0]['bar']=tasks[1]['bar'].copy()
    for T in tasks: declip(T); settle(T)     # las poses clave se asientan antes de calcular las pendientes: los dos tramos que comparten una fase usan la misma pose final
    if tasks[0]['mode']=='none': tasks[0]['bar']=apply(wrist_fix(tasks[1])).copy()     # la barra espera en el piso exactamente donde la toma la Salida
    ch_=[chan(T) for T in tasks]; ms=list(zip(*[pchip_m(list(c)) for c in zip(*ch_)])); pts=[]; hz=[]
    ms=[tuple(0.0 for _ in m_) if seq[k_][1].get('hold') else m_ for k_,m_ in enumerate(ms)]; tiles=dict(side=[],front=[]); _pf[0]=None     # en las fases con 'hold' el cuerpo entero está quieto
    for k_ in range(1,n_-1):
        # fase en que la barra se suelta del cuerpo con velocidad (brazos rectos → codos que flexionan, o rack → empuje): hasta ahí la barra va atada a los hombros,
        # así que la cadera pasa por la fase con la velocidad de la barra (el cuerpo sigue subiendo un instante: los pies se despegan). Sin esto la trayectoria tiene un quiebre en esa fase.
        P_=seq[k_][1]; rel_=(tasks[k_]['straight']>.99 and tasks[k_+1]['straight']<.99) or (tasks[k_]['mode']=='rack' and tasks[k_+1]['mode']!='rack')
        if rel_ and not P_.get('hold') and isinstance(P_.get('vk'),(int,float)) and P_['vk']>0: m_=list(ms[k_]); m_[0],m_[1]=m_[2],m_[3]; ms[k_]=tuple(m_)
    phu=[None]*n_
    for k_,T in enumerate(tasks):
        T.pop('phu',None)
        if T.get('ph'):
            pc_,yc_=T['ph']
            if k_ and phu[k_-1] is not None:
                pa_=phu[k_-1][0]
                while pc_-pa_>180: pc_-=360
                while pc_-pa_<-180: pc_+=360
                if T.get('turn')==-1 and pc_>pa_+1: pc_-=360
            phu[k_]=(pc_,yc_)
    k_=0
    while k_<n_:
        if phu[k_] is None: k_+=1; continue
        e_=k_
        while e_+1<n_ and phu[e_+1] is not None: e_+=1
        mp_=[pchip_m([phu[q][c_] for q in range(k_,e_+1)]) for c_ in (0,1)]
        for q in range(k_,e_+1): tasks[q]['phu']=phu[q]; tasks[q]['mph']=(0.0,0.0) if seq[q][1].get('hold') else (mp_[0][q-k_],mp_[1][q-k_])
        k_=e_+1
    FR['span']=max(2.02*K,max(T['bar'].z for T in tasks)+.62); FR['zc']=FR['span']/2-.14
    meta[seg]=dict(start=(frame0-1)/STEP,poses=[])
    rr=[tasks[i]['mode']=='rack' and tasks[i+1]['mode']=='rack' for i in range(n_-1)]; mix=[(not rr[i]) and 'rack' in (tasks[i]['mode'],tasks[i+1]['mode']) for i in range(n_-1)]; push=[]
    shelf={}
    for i in range(n_-1):
        if mix[i]:
            # pose de rack del tramo: cuánto marca ahí la cápsula de torso y dónde queda la barra respecto del hombro
            q=i if tasks[i]['mode']=='rack' else i+1; Tq=tasks[q]; bq=apply(wrist_fix(Tq)); shelf[i]=(check(Tq,bq)['capT'],bq-PB('LeftArm').matrix.translation)
    for i in range(n_-1):
        # primera pasada: cuánto hay que correr la barra hacia adelante en cada muestra del tramo (cápsulas y malla); después se aplica su envolvente suave
        need=[0.0]*(SUB+1)
        if not rr[i] and tasks[i+1]['mode']!='none' and tasks[i]['mode']!='none':
            for j in range(1,SUB):
                T=lerp_task(tasks[i],tasks[i+1],j/SUB,ms[i],ms[i+1]); y_=T['bar'].y
                if os.environ.get('TARIMA_CAPR') and 'rack' in (tasks[i]['mode'],tasks[i+1]['mode']): print(f"NEAR {NAME} {seg} {seq[i][0]} {j}: {near_part(apply(wrist_fix(T)))}")
                declip(T); bp_=settle(T)
                for _ in range(3):
                    # con el brazo recto la barra real queda donde llega la mano, no exactamente donde se la pidió: las cápsulas se miden sobre la posición real
                    if T['mode'] not in ('floor','hang','rel'): break
                    c_=bar_clear(bp_.y,bp_.z,leg_geo(T['feet'],T['ko']))
                    if c_>=-.002: break
                    T['bar'].y+=c_
                    for h_ in T['hands']: h_['W'].y+=c_
                    bp_=settle(T)
                need[j]=max(0.0,y_-T['bar'].y-.003)     # 3 mm de tolerancia: un roce de milímetros no justifica desviar la trayectoria
        push.append(hull(need))
        if max(need)>.004: print(f"PUSH {NAME} {seg} {seq[i][0]}→{seq[i+1][0]}: desvío necesario {' '.join(f'{x*100:.1f}' for x in need[1:-1])} cm · envolvente pico {max(push[-1])*100:.1f} cm")
    for i,(name,P) in enumerate(seq):
        for j in ([0] if i==n_-1 else range(SUB)):
            fr=frame0+i*STEP+j*(STEP//SUB); sc.frame_set(fr)
            if j==0: T=tasks[i]; T['barfix']=(T['mode']=='none'); bp=apply(wrist_fix(T))
            else:
                T=lerp_task(tasks[i],tasks[i+1],j/SUB,ms[i],ms[i+1])
                if rr[i]:
                    # entre dos racks la barra sigue apoyada en la malla (hombros y garganta) en cada cuadro
                    bp=settle(T); d_=rack_bar(body_bvh(),T['thr'])-T['bar']; d_.x=0; T['bar']+=d_
                    for h_ in T['hands']: h_['W']+=d_
                    bp=settle(T)
                elif tasks[i]['mode']=='none': T['barfix']=True; T['bar']=tasks[i]['bar'].copy(); bp=apply(T)     # bajando a tomar la barra: la barra queda quieta en el piso, donde la deja la Salida; las manos llegan a ella
                else:
                    d_=push[i][j]; T['bar'].y-=d_
                    for h_ in T['hands']: h_['W'].y-=d_
                    bp=apply(wrist_fix(T))
                    if T['grip']>.5 and (meshclear(bp) if T['mode']=='rack' else fclear(body_bvh(),bp.y,bp.z))<-.008:
                        # la envolvente no alcanzó en este cuadro (mover la barra cambió el contacto): se asienta el cuadro y se avisa
                        bp=settle(T); print(f"PUSH! {NAME} {seg} {name} {j}: la envolvente no alcanzó; cuadro asentado aparte")
            key(fr); frame_check(seg,name,j,T,bp,P,mixed=shelf[i] if (j and mix[i]) else False); pts.append(bp.copy()); hz.append(T['C'].z)
            if j==0:
                # unión cargada→envión: la primera pose de cada envión tiene que ser exactamente la última de la cargada (mismo esqueleto y misma barra)
                if seg=='clean' and i==n_-1: SNAP['clean']=snap()
                if i==0 and seg in ('split','power','squat') and 'clean' in SNAP:
                    dm_,dg_=snapdiff(SNAP['clean'],snap()); print(f"UNION {NAME} clean→{seg}: diferencia máxima {dm_:.2f} mm, {dg_:.2f}° (todos los huesos y Bar)")
                    if dm_>THR['union'][0] or dg_>THR['union'][1]: bad.append((seg,name,0,f"unión: la pose inicial difiere {dm_:.1f} mm / {dg_:.1f}° de la última de la cargada"))
                meta[seg]['poses'].append(dict(n=name,lean=round(T['lean'],1),bz=round(bp.z+SOLE,3),hip=round(T['C'].z+SOLE,3)))
                barprev.location=bp
                if SH or not FASTM:
                    for vw in ('side','front'): tiles[vw].append((name,oshot(OUT+f'pose_{seg}_{i:02d}_{vw}.png',vw,bp,pts[0].y,name)))
                shoot(seg,i,name)
    for vw in ('side','front'):
        if tiles[vw]: sheet(seg,vw,tiles[vw])
    if tasks[0]['mode']=='none':
        # mientras el levantador baja a tomarla, la barra no se mueve
        mv_=max((pts[k]-pts[0]).length for k in range(SUB+1))*1000; print(f"UNION {NAME} {seg}: la barra se mueve {mv_:.2f} mm entre {seq[0][0]} y {seq[1][0]}")
        if mv_>THR['union'][0]: bad.append((seg,seq[0][0],0,f"barra-quieta: la barra se mueve {mv_:.1f} mm antes de la {seq[1][0]}"))
    tt=timing(seg,seq,pts,hz); meta[seg]['tt']=[round(t,4) for t in tt]; traj(seg,seq,pts,tt,hz)
    frame0+=len(tasks)*STEP
print('CHK',NAME,'cuadros con superposición:',len(bad),'· columnas BAD: motivo, brazo-pierna, barra-cuerpo, pie, mano-barra, rack mano/antebrazo-torso, codo vs hombro, barra-malla, pie patina (cm), flexión de codo y extensión de muñeca (°)')
for x in bad[:240]: print('   BAD',x)
print('CHKX',NAME,'peores valores:',' · '.join(f"{k} {v[0]*(100 if k in ('mesh','slip','gap') else 1):+.1f} ({v[1]})" for k,v in STAT.items()),'· hook',GINF.get('hook',{}).get('atrapado'),GINF.get('hook',{}).get('cubre'))
if ONLY: sys.exit(0)
sc.frame_start=1; sc.frame_end=frame0-STEP
rig.animation_data.action.name='Poses'
bpy.data.objects.remove(plateprev); bpy.data.objects.remove(barprev)
json.dump(dict(name=NAME,h=STY['H'],grip=dict(clean=2*G_CLEAN,snatch=2*G_SNATCH),sub=SUB,seg=dict(femur=TH,tibia=SHN,arm=UA+FA,torso=SHZ0-C0.z),segs=meta),open(OUT+'poses.json','w'),ensure_ascii=False)
sc.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'s4.blend')
bpy.ops.object.select_all(action='DESELECT'); b.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT+NAME+'.glb',export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_image_format='JPEG',export_image_quality=88,export_yup=True,export_def_bones=False)
print('GLB MB',os.path.getsize(OUT+NAME+'.glb')/1e6)
if shots:
    ims=[_I.open(f) for f in shots]; cols=6; rows=(len(ims)+cols-1)//cols; sh_=_I.new('RGB',(460*cols,640*rows),(10,12,30))
    for k,im in enumerate(ims): sh_.paste(im,((k%cols)*460,(k//cols)*640))
    sh_.save(OUT+'diag.png')
