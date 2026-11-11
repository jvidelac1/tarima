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
HF={}
for sgn,side in SIDES:
    f0=(hd(side+'HandMiddle1')-hd(side+'Hand')).normalized(); w0=(hd(side+'HandPinky1')-hd(side+'HandIndex1')); w0=(w0-f0*w0.dot(f0)).normalized(); n0=w0.cross(f0)
    HF[side]=Matrix((w0,f0,n0)).transposed()   # columnas: ancho (índice→meñique), dedos, palma
PALM=(hd('LeftHandMiddle1')-hd('LeftHand')).length
GA=PALM*.92; GB=.022*K     # centro de la barra respecto de la muñeca: a lo largo de los dedos y hacia la palma
def hand_matrix(side,wT,fT):
    wT=(wT-fT*wT.dot(fT)).normalized(); BT=Matrix((wT,fT,wT.cross(fT))).transposed()
    return BT@HF[side].transposed()@REST['mixamorig:'+side+'Hand'].to_3x3()
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
FING={'grip':finger_set((84,95,55),((22,0),(24,0),(24,0))),'relax':finger_set((14,24,18),((0,10),(4,0),(4,0)))}

# ---------- torso y pies ----------
def torso(C,lean,arch,shrug,headp,prot=0):
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
        q=PB(n); h=q.matrix.translation.copy(); wp=(lean-arch)*(1-k)+headp*k
        q.matrix=Tm(h)@(Matrix.Rotation(D(wp),3,'X')@REST[q.name].to_3x3()).to_4x4(); upd()
    return PB('LeftArm').matrix.translation.copy()
BALL=hd('LeftToeBase'); FD=ANK.y-BALL.y; FH=ANK.z-BALL.z
def ankle_of(x,f,th,yaw,sgn):
    yw=D(yaw-12)*sgn; Rm=Matrix.Rotation(yw,3,'Z')@Matrix.Rotation(th,3,'X'); Rz=Matrix.Rotation(yw,3,'Z')
    ball=Vector((sgn*x,-f,AZ))+Rz@Vector((0,-FD,-FH))
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
        J=PB(side+'UpLeg').matrix.translation.copy(); A=ankle_of(f['x'],f['f'],f['th'],f['yaw'],sgn)
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
def declip(T):
    """Cuadros intermedios: si la barra quedó dentro del cuerpo, se la lleva hacia adelante hasta el contacto."""
    if T['mode'] not in ('floor','hang','rel') or T['grip']<.5: return T
    torso(T['C'],T['lean'],T['arch'],T['shrug'],T['head'],T['prot']); legs=leg_geo(T['feet'],T['ko']); n=0
    while bar_clear(T['bar'].y,T['bar'].z,legs)<0 and n<60:
        T['bar'].y-=.003; n+=1
        for h in T['hands']: h['W'].y-=.003
    return T

# ---------- rack frontal: la barra se apoya de verdad en la malla (garganta + hombros) ----------
def hand_off(fT,ga,gb):
    w=Vector((1,0,0)); w=(w-fT*w.dot(fT)).normalized(); return -fT*ga-w.cross(fT)*gb
def rack_arms(S,bar,g,elb=-.06):
    """Busca muñeca y codo del rack: codo a la altura del hombro y hacia adelante, dentro de los límites de codo y muñeca."""
    best=None
    for phi in range(80,131,5):
        for yaw in (0,12,24,36):
            f0=Vector((0,math.sin(D(phi)),-math.cos(D(phi)))); fT=(Matrix.Rotation(D(yaw),3,'Z')@f0).normalized()
            W=Vector((g,bar.y,bar.z))+hand_off(fT,GA*1.1,GB); d=(W-S); L=d.length
            if L<abs(UA-FA)+.004 or L>UA+FA: continue
            dn=d/L; u=dn.cross(Vector((0,0,1))).normalized(); v=dn.cross(u)
            for th in range(0,360,6):
                pole=u*math.cos(D(th))+v*math.sin(D(th)); E,W2,_=ik(S,W,UA,FA,pole)
                wext=math.degrees((W2-E).normalized().angle(fT)); flex=180-math.degrees((S-E).angle(W2-E)); dz=E.z-S.z
                cost=1.2*abs(dz-elb*K)+.004*max(0,wext-92)+.006*max(0,flex-150)+3*max(0,(SHX-.04*K)-E.x)+3*max(0,E.x-(SHX+.05*K))+2*max(0,E.y-(S.y-.17*K))+.0005*yaw
                if best is None or cost<best[0]: best=(cost,W.copy(),(E-S),fT.copy(),wext,flex,dz,phi,yaw,E.x-SHX)
    return best
def rack_bar():
    dg=bpy.context.evaluated_depsgraph_get(); dg.update(); ev=b.evaluated_get(dg); em=ev.to_mesh()
    bvh=BVHTree.FromPolygons([v.co.copy() for v in em.vertices],_polys); ev.to_mesh_clear()
    S=PB('LeftArm').matrix.translation; zb=S.z+.07*K; yb=S.y
    xs=[s*(.095*K+i*.012) for s in (1,-1) for i in range(int((SHX-.095*K)/.012)+1)]
    for _ in range(4):
        hit=bvh.ray_cast(Vector((0,-1.0,zb)),Vector((0,1,0))); yt=hit[0].y if hit[0] is not None else S.y
        yb=yt-RBAR-.003; top=None
        for x in xs:
            h=bvh.ray_cast(Vector((x,yb,S.z+.22*K)),Vector((0,0,-1)))
            if h[0] is not None: top=h[0].z if top is None else max(top,h[0].z)
        zb=(top if top is not None else S.z+.05)+RBAR+.002
    return Vector((0,yb,zb))

# ---------- fase -> tarea ----------
def solve(P):
    g=P['grip']; st=P.get('stance',1.0)*ANK.x; th=D(P.get('heel',0)); ko=P.get('ko',12); toe=P.get('toe',12)
    feet=P.get('feet',((0,P.get('heel',0)),(0,P.get('heel',0))))
    ft=[dict(x=st,f=FA_F+feet[i][0]*K,th=D(feet[i][1]),yaw=toe) for i in range(2)]
    A=ankle_of(st,FA_F,th,toe,1); az=A.z; fa=-A.y; kr=D(ko)
    bar=P['bar']; mode=bar['mode']; shin=D(P.get('shin',0)); thigh=D(P.get('thigh',0))
    fk=fa+SHN*math.sin(shin)*math.cos(kr*.6); zk=az+SHN*math.cos(shin)
    arch=P.get('arch',4); shrug=P.get('shrug',0); headp=P.get('head',0); prot=P.get('prot',0); dx=g-SHX
    def sh(C,lean): s=torso(C,lean,arch,shrug,headp,prot); return -s.y,s.z
    phi=D(P.get('phi',0)); fT=Vector((0,math.sin(phi),-math.cos(phi))); ga=bar.get('a',GA); gb=bar.get('b',GB)
    pole=Vector(P.get('epole',(.3,1,0))); grip=P.get('fing',1.0); straight=1.0 if mode in ('floor','hang','over') else 0.0
    for it in range(3 if mode in ('floor','hang') else 1):
        off=hand_off(fT,ga,gb)
        def zsolve(sf,sz,fb,sign):
            dy=(-fb+off.y)-(-sf); return sz+sign*math.sqrt(max(LW*LW-dx*dx-dy*dy,1e-4))-off.z
        if mode=='floor':
            # barra pegada a la tibia/rodilla, hombros por delante de la barra, brazos rectos; la cadera sale de la anatomía
            zb=bar['z']; Aa=Vector((0,-fa,az)); Kk=Vector((0,-fk,zk)); fb=fk+.4
            while fb>fa-.1 and min(d2(-(fb-.002),zb,Kk,Aa)-R['shinF'],math.hypot(fk-(fb-.002),zk-zb)-R['knee'])-RBAR>bar.get('gap',.004): fb-=.002
            ah=P['ahead']*K; sf_=fb+ah; dyw=(-fb+off.y)+sf_; sz_=zb+off.z+math.sqrt(max(LW*LW-dx*dx-dyw*dyw,1e-4))
            Tl=math.hypot(V0.y,V0.z); THe=TH*math.cos(kr*.7); ddf=sf_-fk; ddz=sz_-zk; d_=math.hypot(ddf,ddz); d_c=min(d_,THe+Tl-.001)
            aa=(THe*THe-Tl*Tl+d_c*d_c)/(2*d_c); hh=math.sqrt(max(THe*THe-aa*aa,0)); uf,uz=ddf/d_,ddz/d_
            c1=(fk+uf*aa+uz*hh,zk+uz*aa-uf*hh); c2=(fk+uf*aa-uz*hh,zk+uz*aa+uf*hh); fh,zh=c1 if c1[0]<c2[0] else c2
            C=Vector((0,-fh,zh))
            lean=bisect(lambda l:(lambda s:math.sqrt(dx*dx+((-fb+off.y)+s[0])**2+(zb+off.z-s[1])**2)-LW)(sh(C,l)),-5,100); sf,sz=sh(C,lean)
        else:
            if 'hipabs' in P: fh=FA_F+P['hipabs'][0]*K; zh=AZ+(TH+SHN)*.985-P['hipabs'][1]*K
            else:
                fh=fk-TH*math.sin(thigh)*math.cos(kr); zh=zk+TH*math.cos(thigh)
                dxl=st-HW; zh=min(zh,az+math.sqrt(max(((TH+SHN)*.997)**2-dxl*dxl-(fh-fa)**2,0)))
            C=Vector((0,-fh,zh))
            if mode=='hang':
                lean=P['lean']; sf,sz=sh(C,lean); legs=leg_geo(ft,ko); fb=sf+.30; gap=bar.get('gap',.0)
                while fb>sf-.25 and bar_clear(-(fb-.003),zsolve(sf,sz,fb-.003,-1),legs)>gap: fb-=.003
                zb=zsolve(sf,sz,fb,-1)
            elif mode=='over':
                back=bar.get('back',.03)*K; fb0=MID+bar.get('f',0)*K
                lean=bisect(lambda l:sh(C,l)[0]-(fb0+back),-20,70) if P.get('lean') is None else P['lean']
                sf,sz=sh(C,lean); fb=sf-back; zb=zsolve(sf,sz,fb,1)
            elif mode=='rel':
                lean=P['lean']; sf,sz=sh(C,lean); fb=sf+bar['d'][0]*K; zb=sz+bar['d'][1]*K
            elif mode=='rack':
                o=Vector((0,-.02*K,.07*K)); lean=P.get('lean'); lg=8 if lean is None else lean
                for k in range(3):
                    if P.get('lean') is None and k>0: lg=bisect(lambda l:sh(C,l)[0]-o.y-MID,-20,70)
                    S=torso(C,lg,arch,shrug,headp,prot); r=rack_arms(S,S+o,g,bar.get('elb',-.06))
                    apply(dict(C=C,lean=lg,arch=arch,shrug=shrug,head=headp,prot=prot,hands=[dict(W=Vector((s*r[1].x,r[1].y,r[1].z)),wT=Vector((s,0,0)),fT=Vector((s*r[3].x,r[3].y,r[3].z))) for s in (1,-1)],
                               epole=r[2],grip=.85,bar=S+o,feet=ft,ko=ko,twist=.5,straight=0))
                    o=rack_bar()-PB('LeftArm').matrix.translation; o.x=0
                lean=lg; S=torso(C,lean,arch,shrug,headp,prot); sf,sz=-S.y,S.z; fb=sf-o.y; zb=sz+o.z; r=rack_arms(S,S+o,g,bar.get('elb',-.06))
                fT=r[3]; pole=r[2]; grip=.85; ga=GA*1.1
                print(f'   rack {NAME}: barra vs hombro fwd={-o.y:.3f} up={o.z:.3f} · codo {r[6]*100:+.1f} cm alto, {r[9]*100:+.1f} cm lateral · flexión {r[5]:.0f}° · muñeca {r[4]:.0f}° · phi {r[7]} yaw {r[8]}')
            else:
                lean=P['lean']; sf,sz=sh(C,lean); fb=MID; zb=BARZ
        if mode in ('floor','hang'):
            v=Vector((0,(-fb+off.y)+sf,(zb+off.z)-sz)); fT=v.normalized()
    off=hand_off(fT,ga,gb); hands=[]
    for sgn,side in SIDES:
        if mode=='none':
            wT=Vector((sgn*math.sin(D(25)),math.cos(D(25)),0)); f_=Vector((sgn*.05,-.12,-1)).normalized(); W=Vector((sgn*(SHX+.045*K),-sf-.02*K,sz-(UA+FA)*.985))
        else: wT=Vector((sgn,0,0)); f_=Vector((sgn*fT.x,fT.y,fT.z)); W=Vector((sgn*(g+off.x),-fb+off.y,zb+off.z))
        hands.append(dict(W=W,wT=wT,fT=f_))
    return dict(C=C,lean=lean,arch=arch,shrug=shrug,head=headp,prot=prot,hands=hands,epole=pole,grip=0.0 if mode=='none' else grip,
                bar=Vector((0,-fb,zb)),feet=ft,ko=ko,twist=P.get('twist',.5),straight=straight,mode=mode)

def lerp_task(a,c,u):
    L=lambda x,y:x+(y-x)*u
    return dict(C=a['C'].lerp(c['C'],u),lean=L(a['lean'],c['lean']),arch=L(a['arch'],c['arch']),shrug=L(a['shrug'],c['shrug']),head=L(a['head'],c['head']),prot=L(a['prot'],c['prot']),
        hands=[dict(W=h1['W'].lerp(h2['W'],u),wT=h1['wT'].lerp(h2['wT'],u).normalized(),fT=h1['fT'].lerp(h2['fT'],u).normalized()) for h1,h2 in zip(a['hands'],c['hands'])],
        epole=a['epole'].lerp(c['epole'],u),grip=L(a['grip'],c['grip']),bar=a['bar'].lerp(c['bar'],u),
        feet=[dict(x=L(f1['x'],f2['x']),f=L(f1['f'],f2['f']),th=L(f1['th'],f2['th']),yaw=L(f1['yaw'],f2['yaw'])) for f1,f2 in zip(a['feet'],c['feet'])],
        ko=L(a['ko'],c['ko']),twist=L(a['twist'],c['twist']),straight=min(a['straight'],c['straight']),mode=(c['mode'] if a['mode']=='none' else a['mode'] if c['mode'] in ('over','rack','none') or u<.5 else c['mode']))

def apply(T):
    for p in pb: p.matrix_basis=Matrix()
    upd(); torso(T['C'],T['lean'],T['arch'],T['shrug'],T['head'],T['prot'])
    slip=Vector((0,0,0)); gq=T['grip']
    for (sgn,side),h in zip(SIDES,T['hands']):
        S=PB(side+'Arm').matrix.translation.copy(); e=T['epole']; W=h['W']
        if T['straight']>.99 and gq>.5: W=S+(W-S).normalized()*LW
        el,W2,hn=ik(S,W,UA,FA,Vector((sgn*e.x,e.y,e.z))); slip+=(W2-h['W'])/2
        aim(side+'Arm',el); twist_to('mixamorig:'+side+'Arm',HR[side+'Arm'],hn); aim(side+'ForeArm',W2)
        fa_=PB(side+'ForeArm'); Rt=hand_matrix(side,h['wT'],h['fT']); ax=(fa_.matrix.to_3x3()@Vector((0,1,0))).normalized()
        cur=fa_.matrix.to_3x3()@(REST[fa_.name].to_3x3().inverted()@HF[side].col[0]); tgt=Rt@(REST['mixamorig:'+side+'Hand'].to_3x3().inverted()@HF[side].col[0])
        cu=cur-ax*cur.dot(ax); tg=tgt-ax*tgt.dot(ax)
        if cu.length>1e-4 and tg.length>1e-4:
            cu.normalize(); tg.normalize(); ang=math.atan2(ax.dot(cu.cross(tg)),cu.dot(tg))
            rot_about(fa_,fa_.matrix.translation.copy(),Matrix.Rotation(ang*T['twist'],4,ax)); upd()
        hb=PB(side+'Hand'); hb.matrix=Tm(hb.matrix.translation.copy())@Rt.to_4x4()
    upd()
    for name,qr in FING['relax'].items(): pb[name].rotation_quaternion=qr.slerp(FING['grip'][name],gq)
    ko=D(T['ko'])
    for (sgn,side),f in zip(SIDES,T['feet']):
        J=PB(side+'UpLeg').matrix.translation.copy(); A=ankle_of(f['x'],f['f'],f['th'],f['yaw'],sgn)
        kn,A2,hn=ik(J,A,TH,SHN,Vector((sgn*math.sin(ko),-math.cos(ko),0)))
        aim(side+'UpLeg',kn); twist_to('mixamorig:'+side+'UpLeg',HR[side+'UpLeg'],hn); aim(side+'Leg',A2)
        yw=D(f['yaw']-12)*sgn; fb_=PB(side+'Foot')
        fb_.matrix=Tm(fb_.matrix.translation.copy())@(Matrix.Rotation(yw,3,'Z')@Matrix.Rotation(f['th'],3,'X')@REST[fb_.name].to_3x3()).to_4x4(); upd()
        t=PB(side+'ToeBase'); t.matrix=Tm(t.matrix.translation.copy())@(Matrix.Rotation(yw,3,'Z')@REST[t.name].to_3x3()).to_4x4()
    upd()
    bp=T['bar']+(slip if gq>.5 else Vector((0,0,0))); pb['Bar'].matrix=Tm(bp); upd()
    return bp

def check(T,bp):
    """Superposiciones medidas con cápsulas: brazo contra pierna y barra contra el cuerpo. Negativo = se atraviesan (m)."""
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
    return arm,bar,foot

# ---------- secuencias ----------
FLOOR=dict(mode='floor',z=BARZ); RACK=dict(mode='rack'); OVER=dict(mode='over',back=.035)
PULL=dict(stance=.66,toe=14); OH=dict(phi=118,shrug=28,epole=(1,.15,0))
RK=dict(bar=RACK,shrug=10,prot=18,arch=8)
def clean_pull(g):
    kz=AZ+SHN
    return [('Salida',dict(PULL,grip=g,shin=27,ahead=.055,shrug=-8,ko=7,bar=FLOOR,head=-14,arch=8,epole=(1,.3,0))),
            ('Primer tirón',dict(PULL,grip=g,shin=8,ahead=.10,shrug=-6,ko=5,bar=dict(mode='floor',z=kz+.015*K,gap=.006),head=-10,arch=7,epole=(1,.3,0))),
            ('Segundo tirón',dict(PULL,grip=g,shin=13,thigh=27,ko=6,lean=6,bar=dict(mode='hang',gap=.0),head=0,arch=5,epole=(1,.3,0))),
            ('Triple extensión',dict(PULL,grip=g,shin=-2,thigh=-6,ko=5,heel=22,lean=-8,shrug=24,bar=dict(mode='hang',gap=.008),head=4,arch=6,epole=(1,.3,0)))]
def seqs(g,gs):
    kz=AZ+SHN; SQ=dict(stance=1.12,toe=26)
    rec=('Recuperación',dict(SQ,**dict(RK,bar=dict(mode='rack',elb=-.10)),grip=g,shin=1,thigh=1,ko=9,lean=-2,head=-4))
    dip=('Envión · Dip',dict(SQ,**dict(RK,bar=dict(mode='rack',elb=-.13)),grip=g,shin=20,thigh=20,ko=14,lean=-1,head=-4))
    drv=('Envión · Empuje',dict(SQ,grip=g,shin=-2,thigh=-5,ko=8,heel=20,lean=-4,shrug=16,bar=dict(mode='rel',d=(.035,.25)),phi=112,head=-14,arch=7,epole=(1,-.35,-.25)))
    fin=lambda **k:('Envión · Final',{**dict(grip=g,stance=.9,toe=18,shin=1,thigh=1,ko=8,lean=1,bar=OVER,head=0,arch=5),**OH,**k})
    clean=[IDLE]+clean_pull(g)+[
        ('Bajada',dict(SQ,grip=g,stance=1.05,shin=30,thigh=76,ko=22,lean=9,shrug=14,bar=dict(mode='rel',d=(.15,-.06)),phi=35,head=-4,arch=6,epole=(1,-.1,.3))),
        ('Recepción',dict(SQ,**dict(RK,arch=9),grip=g,shin=36,thigh=112,ko=26,head=-6)),rec]
    split=[rec,dip,drv,
        ('Envión · Tijera',{**dict(grip=g,stance=.95,toe=14,ko=4,hipabs=(.02,.2),feet=((.3,0),(-.44,38)),lean=0,bar=OVER,head=-4,arch=5),**OH}),
        ('Envión · Recuperación',{**dict(grip=g,stance=.95,toe=14,ko=6,hipabs=(-.03,.07),feet=((.1,0),(-.3,24)),lean=1,bar=OVER,head=0,arch=5),**OH}),fin()]
    power=[rec,dip,drv,
        ('Power jerk · Recepción',{**dict(grip=g,stance=1.3,toe=26,shin=28,thigh=31,ko=16,bar=OVER,head=-4,arch=9),**OH}),
        fin(stance=1.3,toe=26)]
    squat=[rec,dip,drv,
        ('Squat jerk · Recepción',{**dict(grip=g,stance=1.2,toe=28,shin=42,thigh=116,ko=28,bar=OVER,head=-6,arch=14),**OH}),
        ('Squat jerk · Recuperación',{**dict(grip=g,stance=1.2,toe=28,shin=26,thigh=40,ko=16,bar=OVER,head=-2,arch=9),**OH}),
        fin(stance=1.2,toe=28)]
    sn=[IDLE,('Salida',dict(PULL,grip=gs,shin=29,ahead=.075,shrug=-8,ko=9,bar=FLOOR,head=-14,arch=8,epole=(1,.3,0))),
        ('Primer tirón',dict(PULL,grip=gs,shin=8,ahead=.11,shrug=-6,ko=6,bar=dict(mode='floor',z=kz+.015*K,gap=.006),head=-10,arch=7,epole=(1,.3,0))),
        ('Segundo tirón',dict(PULL,grip=gs,shin=13,thigh=27,ko=6,lean=6,bar=dict(mode='hang',gap=.0),head=0,arch=5,epole=(1,.3,0))),
        ('Triple extensión',dict(PULL,grip=gs,shin=-2,thigh=-6,ko=5,heel=22,lean=-8,shrug=24,bar=dict(mode='hang',gap=.008),head=4,arch=6,epole=(1,.3,0))),
        ('Bajada',dict(grip=gs,stance=1.05,toe=26,shin=30,thigh=78,ko=22,lean=9,shrug=18,bar=dict(mode='rel',d=(.16,.03)),phi=30,head=-4,arch=6,epole=(1,0,.3))),
        ('Recepción',{**dict(grip=gs,stance=1.15,toe=28,shin=37,thigh=114,ko=27,bar=OVER,head=-6,arch=9),**OH}),
        ('Recuperación',{**dict(grip=gs,stance=1.15,toe=28,shin=1,thigh=1,ko=10,lean=1,bar=OVER,head=0,arch=5),**OH})]
    return dict(clean=clean,split=split,power=power,squat=squat,snatch=sn)
IDLE=('Parado',dict(grip=SHX,stance=.62,shin=3,thigh=5,ko=6,toe=16,lean=1,bar=dict(mode='none'),head=0,arch=2,epole=(.25,1,0)))

# agarre de cargada: se ensancha lo mínimo para que el brazo pase por fuera de la rodilla
G_CLEAN=SHX+.05*K
for it in range(8):
    worst=1e9
    for name,P in clean_pull(G_CLEAN)[:2]:
        T=solve(P); bp=apply(T); worst=min(worst,check(T,bp)[0])
    if worst>=.004 or G_CLEAN>SHX+.13*K: break
    G_CLEAN+=min(.02,.006-worst)
_dz=SHZ0-(C0.z+.035*K); G_SNATCH=min(SHX+math.sqrt(max((UA+FA+GA)**2-_dz*_dz,.02)),.31*STY['H'])
print(f'GRIP {NAME}: clean={2*G_CLEAN:.2f} (holgura brazo-rodilla {worst*100:+.1f} cm) snatch={2*G_SNATCH:.2f}')
SEQ=seqs(G_CLEAN,G_SNATCH)

# ---------- barra de control para renders (no se exporta) ----------
bm_=bmesh.new(); bmesh.ops.create_cone(bm_,cap_ends=True,segments=12,radius1=RBAR,radius2=RBAR,depth=2.0)
for xx in (-.9,.9):
    r=bmesh.ops.create_cone(bm_,cap_ends=True,segments=32,radius1=.225,radius2=.225,depth=.04); bmesh.ops.translate(bm_,verts=r['verts'],vec=(0,0,xx))
bmesh.ops.rotate(bm_,verts=bm_.verts,cent=(0,0,0),matrix=Matrix.Rotation(D(90),3,'Y'))
bme=bpy.data.meshes.new('barprev'); bm_.to_mesh(bme); bm_.free(); barprev=bpy.data.objects.new('barprev',bme); bpy.context.scene.collection.objects.link(barprev)
pr=bpy.data.materials.new('pl'); pr.use_nodes=True; pr.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.75,.75,.8,1); pr.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.6; bme.materials.append(pr)

sc=bpy.context.scene; sc.render.fps=30; STEP=30; SUB=6
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
       'hand':dict(cam_loc=(1.1,-1.3,0),target=(0,0,0),res=(460,400),samples=16,lens=95,rel=True),
       'up':dict(cam_loc=(1.3,-2.2,1.5),target=(0,-.05,1.35),res=(460,520),samples=16,lens=70)}
WANT={('clean','Recepción'):['q'],('clean','Recuperación'):['up'],('clean','Segundo tirón'):['hand']}
VIEWS['side2']=dict(cam_loc=(3.4,-.6,1.2),target=(0,-.1,.9),res=(460,640),samples=16,lens=70)
for seg in ('clean','split','power','squat','snatch'):
    tasks=[]
    for name,P in SEQ[seg]:
        tasks.append(solve(P))
    if seg in ('clean','snatch'): tasks[0]['bar']=tasks[1]['bar'].copy()
    meta[seg]=dict(start=(frame0-1)/STEP,poses=[])
    for i,(name,P) in enumerate(SEQ[seg]):
        for j in ([0] if i==len(tasks)-1 else range(SUB)):
            T=declip(tasks[i] if j==0 else lerp_task(tasks[i],tasks[i+1],j/SUB))
            fr=frame0+i*STEP+j*(STEP//SUB); sc.frame_set(fr); bp=apply(T); key(fr); ca,cb,cf=check(T,bp)
            if ca<-.012 or cb<-.012 or cf<-.004: bad.append((seg,name,j,round(ca*100,1),round(cb*100,1),round(cf*100,1)))
            if j==0:
                meta[seg]['poses'].append(dict(n=name,lean=round(T['lean'],1),bz=round(bp.z+SOLE,3),hip=round(T['C'].z+SOLE,3)))
                print(f"POSE {NAME} {seg} {name}: torso={T['lean']:.1f} barra=({MID-(-bp.y)-0:+.3f},{bp.z+SOLE:.3f}) cadera={T['C'].z+SOLE:.3f} | brazo-pierna {ca*100:+.1f} barra-cuerpo {cb*100:+.1f} pie {cf*100:+.1f} cm")
                barprev.location=bp
                if not os.environ.get('FAST') and seg in ('clean','snatch','split'): render(OUT+f'pose_{seg}_{i:02d}.png',**VIEWS['side'])
                for vw in WANT.get((seg,name),[]):
                    V=dict(VIEWS[vw]); fn=OUT+f'd_{seg}_{i:02d}_{vw}.png'
                    if V.pop('rel',False):
                        h=PB('LeftHand').matrix.translation; V['cam_loc']=tuple(Vector(V['cam_loc'])*.75+h); V['target']=tuple(h)
                    render(fn,**V); shots.append(fn)
    frame0+=len(tasks)*STEP
print('CHK',NAME,'cuadros con superposición:',len(bad))
for x in bad[:40]: print('   BAD',x)
sc.frame_start=1; sc.frame_end=frame0-STEP
rig.animation_data.action.name='Poses'
bpy.data.objects.remove(barprev)
json.dump(dict(name=NAME,h=STY['H'],grip=dict(clean=2*G_CLEAN,snatch=2*G_SNATCH),sub=SUB,segs=meta,seg=dict(femur=TH,tibia=SHN,arm=UA+FA,torso=SHZ0-C0.z)),open(OUT+'poses.json','w'),ensure_ascii=False)
sc.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'s4.blend')
bpy.ops.object.select_all(action='DESELECT'); b.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT+NAME+'.glb',export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_image_format='JPEG',export_image_quality=88,export_yup=True,export_def_bones=False)
print('GLB MB',os.path.getsize(OUT+NAME+'.glb')/1e6)
from PIL import Image as _I
if shots:
    ims=[_I.open(f) for f in shots]; cols=5; rows=(len(ims)+cols-1)//cols; sheet=_I.new('RGB',(460*cols,640*rows),(10,12,30))
    for k,im in enumerate(ims): sheet.paste(im,((k%cols)*460,(k//cols)*640))
    sheet.save(OUT+'diag.png')
