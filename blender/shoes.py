"""Zapatillas de halterofilia genéricas (sin marca), modeladas por script sobre el pie real de cada personaje.
Taco rígido en cuña (~23 mm atrás, ~9 mm adelante: caída visible de ~14 mm), suela plana, capellada con puntera,
contrafuerte, lengüeta, cordones, correa de velcro con pasador y cuello acolchado. UV propio en un solo atlas.
El piso está en z=-SOLE (la planta del pie queda en z=0, igual que en poses.py)."""
import bpy, bmesh, math, numpy as np
from mathutils import Vector
FLOOR=-.016
MATS=('ShoeUpper','ShoeSole','ShoeHeel','ShoeStrap','ShoeLace')
# rectángulos del atlas UV (u0,v0,u1,v1)
UVR=dict(upper=(0,.55,1,1),side=(0,.45,1,.53),bottom=(0,0,.45,.43),strap=(.47,.30,1,.43),counter=(.47,.16,1,.28),toecap=(.47,0,.73,.14),tongue=(.75,0,.88,.14),misc=(.9,0,1,.065),lace=(.9,.075,1,.12),metal=(.9,.125,.945,.14),tab=(.955,.125,1,.14))
def sstep(e0,e1,v):
    t=np.clip((np.asarray(v,float)-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def _sm(a,n=2):
    for _ in range(n): a=np.convolve(np.pad(a,1,mode='edge'),[.25,.5,.25],mode='valid')
    return a
class Last:
    """Horma: superficie paramétrica S(t,a) de la capellada. t: 0 talón → 1 punta; a: 0 borde lateral → 1 borde medial."""
    def __init__(s,sgn,pts):
        P=np.array([tuple(p) for p,_ in pts]); low=P[P[:,2]<.045]; xy=low[:,:2]; c=xy.mean(0)
        w,v=np.linalg.eigh(np.cov((xy-c).T)); f=v[:,1]; f=-f if f[1]>0 else f
        lat=np.array([-f[1],f[0]]); lat=-lat if lat[0]*sgn<0 else lat
        s.f,s.lat,s.sgn=f,lat,sgn; u=P[:,:2]@f; vv=P[:,:2]@lat; z=P[:,2]
        ul=low[:,:2]@f; s.u0f,s.u1f=ul.min(),ul.max(); Lf=s.u1f-s.u0f; s.u0=s.u0f-.008; s.u1=s.u1f+.011; s.L=s.u1-s.u0
        nb=30; s.tb=np.linspace(0,1,nb); vmn=np.zeros(nb); vmx=np.zeros(nb); zt=np.zeros(nb)
        for i,t in enumerate(s.tb):
            k=(np.abs(u-(s.u0f+Lf*t))<Lf*.05)&(z<.10)
            vmn[i],vmx[i],zt[i]=vv[k].min(),vv[k].max(),P[(np.abs(u-(s.u0f+Lf*t))<Lf*.05)][:,2].max()
        s.vmn,s.vmx,s.zt=_sm(vmn),_sm(vmx),_sm(zt,1)
        k=(z>.078)&(z<.105); s.leg_c=np.array([u[k].mean(),vv[k].mean()]); s.leg_r=np.array([(u[k].max()-u[k].min())/2,(vv[k].max()-vv[k].min())/2])
        s.leg_c=np.array([(u[k].max()+u[k].min())/2,(vv[k].max()+vv[k].min())/2])
    def prof(s,t):
        t=np.asarray(t,float); tf=np.clip((s.u0+s.L*t-s.u0f)/(s.u1f-s.u0f),0,1)
        el=np.interp(np.clip(tf,.1,.76),s.tb,s.vmx)+.007; em=np.interp(np.clip(tf,.1,.76),s.tb,s.vmn)-.007
        vc=(np.interp(np.clip(tf,.1,.9),s.tb,s.vmx)+np.interp(np.clip(tf,.1,.9),s.tb,s.vmn))/2; hw=(el-em)/2
        r0,r1=.11,.25
        e=np.where(t<r0,(1-np.clip((r0-t)/r0,0,1)**2.3)**(1/2.3),1)*np.where(t>1-r1,(1-np.clip((t-(1-r1))/r1,0,1)**2.4)**(1/2.4),1)
        zf=FLOOR+np.interp(t,[0,.6,.9,1],[.023,.009,.009,.013])
        cap=np.interp(t,[0,.07,.14,1],[.066,.078,.082,.082]); ztop=np.minimum(np.interp(tf,s.tb,s.zt)+.007,cap)
        ztop=np.maximum(ztop,np.interp(t,[0,.8,.93,1],[.05,.034,.03,.016])); ztop=np.where(t>.9,np.minimum(ztop,np.interp(t,[.9,1],[.06,.018])),ztop)
        return vc,hw*e,zf,ztop-zf
    def loc(s,t,a):
        t,a=np.broadcast_arrays(np.asarray(t,float),np.asarray(a,float)); vc,hw,zf,H=s.prof(t)
        pw=np.interp(t,[0,.45,.7,1],[.42,.42,.5,.55]); ph=np.interp(t,[0,.45,.7,1],[.62,.62,.8,.9])
        c=np.cos(np.pi*a); sn=np.sin(np.pi*a)
        return np.stack([s.u0+s.L*t,vc+hw*np.sign(c)*np.abs(c)**pw,zf+H*np.maximum(sn,0)**ph],-1)
    def world(s,q):
        q=np.asarray(q); return np.concatenate([q[...,0:1]*s.f+q[...,1:2]*s.lat,q[...,2:3]],-1)
    def S(s,t,a,off=0.):
        t,a=np.broadcast_arrays(np.asarray(t,float),np.asarray(a,float)); p=s.loc(t,a)
        if np.ndim(off)==0 and off==0: return s.world(p)
        h=1e-3; ac=np.clip(a,.02,.98); dt=s.loc(np.clip(t+h,0,1),ac)-s.loc(np.clip(t-h,0,1),ac); da=s.loc(t,ac+h)-s.loc(t,ac-h)
        n=np.cross(dt,da); n/=np.linalg.norm(n,axis=-1,keepdims=True)+1e-12
        vc,hw,zf,H=s.prof(t); ctr=np.stack([s.u0+s.L*t,vc,zf+.3*H],-1); n*=np.sign(np.sum(n*(p-ctr),-1,keepdims=True)+1e-9)
        # en los extremos (talón y punta) la normal analítica degenera: se mezcla con la dirección radial
        vh,_,zh,Hh=s.prof(np.maximum(t,.1)); rh=np.stack([p[...,0]-(s.u0+s.L*np.maximum(t,.1)),p[...,1]-vh,p[...,2]-(zh+.4*Hh)],-1)
        tt_=np.minimum(t,.88); vt,_,zt_,Ht=s.prof(tt_); rt=p-np.stack([s.u0+s.L*tt_,vt,zt_+.25*Ht],-1)
        for r_,w_ in ((rh,1-sstep(.03,.10,t)),(rt,sstep(.93,.985,t))):
            r_=r_/(np.linalg.norm(r_,axis=-1,keepdims=True)+1e-12); n=n*(1-w_[...,None])+r_*w_[...,None]
        n/=np.linalg.norm(n,axis=-1,keepdims=True)+1e-12
        return s.world(p+n*np.asarray(off)[...,None] if np.ndim(off) else p+n*off)
class Builder:
    def __init__(s,last): s.bm=bmesh.new(); s.uv=s.bm.loops.layers.uv.new('UVMap'); s.last=last
    def grid(s,P,mat,rect,out=None,matf=None,uvs=None):
        """P: (n,m,3) en mundo. out: (n,m,3) dirección exterior aproximada para orientar las caras."""
        n,m=P.shape[:2]; vs=[[s.bm.verts.new(P[i,j]) for j in range(m)] for i in range(n)]; u0,v0,u1,v1=rect; fs=[]
        for i in range(n-1):
            for j in range(m-1):
                q=(vs[i][j],vs[i+1][j],vs[i+1][j+1],vs[i][j+1])
                if len({tuple(np.round(v.co,6)) for v in q})<3: continue
                try: f=s.bm.faces.new(q)
                except ValueError: continue
                f.material_index=matf(i,j) if matf else mat; f.smooth=True; fs.append((f,i,j))
                for lp,(a,b_) in zip(f.loops,((i,j),(i+1,j),(i+1,j+1),(i,j+1))):
                    lp[s.uv].uv=(uvs[a,b_] if uvs is not None else (u0+(u1-u0)*a/(n-1),v0+(v1-v0)*b_/(m-1)))
        if out is not None and fs:
            s.bm.normal_update(); d=sum(float(np.dot(f.normal,out[i,j])) for f,i,j in fs)
            if d<0:
                for f,_,_ in fs: f.normal_flip()
        return vs
    def shell(s,ts,as_,off,mat,rect,warp=None):
        """Parche sobre la horma, levantado 'off', con faldón que vuelve a la superficie."""
        T,A=np.meshgrid(ts,as_,indexing='ij'); T=warp(T,A) if warp else T; O=np.full(T.shape,off); T2=np.pad(T,1,mode='edge'); A2=np.pad(A,1,mode='edge'); O2=np.pad(O,1,constant_values=-.0006)
        P=s.last.S(T2,A2,O2); out=s.last.S(T2,A2,.01)-s.last.S(T2,A2,0.); return s.grid(P,mat,rect,out)
    def tube(s,pts,r,mat,rect,nseg=6):
        pts=np.asarray(pts); n=len(pts); tg=np.gradient(pts,axis=0); tg/=np.linalg.norm(tg,axis=1,keepdims=True)
        ref=np.array([0,0,1.]); P=np.zeros((n,nseg+1,3)); O=np.zeros_like(P)
        for i in range(n):
            x=np.cross(tg[i],ref); x=x/(np.linalg.norm(x)+1e-9) if np.linalg.norm(x)>1e-4 else np.array([1,0,0.]); y=np.cross(tg[i],x)
            for j in range(nseg+1):
                an=2*np.pi*j/nseg; O[i,j]=x*np.cos(an)+y*np.sin(an); P[i,j]=pts[i]+O[i,j]*r
        s.grid(P,mat,rect,O)
    def box(s,c,ax,ay,az,mat,rect):
        c=np.asarray(c); cs=[c+sx*ax+sy*ay+sz*az for sx in (-1,1) for sy in (-1,1) for sz in (-1,1)]; vs=[s.bm.verts.new(p) for p in cs]
        for q in ((0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)):
            f=s.bm.faces.new([vs[k] for k in q]); f.material_index=mat; f.normal_update()
            if np.dot(f.normal,np.array(f.calc_center_median())-c)<0: f.normal_flip()
            for lp in f.loops: lp[s.uv].uv=((rect[0]+rect[2])/2,(rect[1]+rect[3])/2)
def build(sgn,side,pts,rig,mats,name='Shoe'):
    la=Last(sgn,pts); B=Builder(la); S=la.S
    NT,NA=46,22; ts=(1-np.cos(np.pi*np.linspace(0,1,NT)))/2; ts=.5*ts+.5*np.linspace(0,1,NT); as_=np.linspace(0,1,NA)
    T,A=np.meshgrid(ts,as_,indexing='ij')
    # capellada
    B.grid(S(T,A),0,UVR['upper'],S(T,A,.01)-S(T,A))
    # suela: perímetro lateral (t 0→1) y medial (t 1→0)
    tp=np.concatenate([ts,ts[::-1][1:-1]]); ap=np.concatenate([np.zeros(NT),np.ones(NT-2)]); n=len(tp)
    vc,hw,zf,H=la.prof(tp); rim=la.loc(tp,ap); rim[:,2]=zf
    tg=np.roll(rim,-1,0)-np.roll(rim,1,0); nrm=np.stack([tg[:,1],-tg[:,0],np.zeros(n)],1); nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-12
    cen=np.stack([la.u0+la.L*tp,vc,zf],1); nrm*=np.sign(np.sum(nrm*(rim-cen),1,keepdims=True)+1e-9)
    nrm[0]=[-1,0,0]; nrm[NT-1]=[1,0,0]
    def ring(out,z): q=rim+nrm*out; q[:,2]=z; return la.world(q)
    zo=np.full(n,FLOOR+.0065); rows=[ring(-.001,zf+.004),ring(.0028,zf+.0015),ring(.0028,zo+.0005),ring(.0034,zo),ring(.0034,FLOOR+.0015),ring(.0018,FLOOR)]
    P=np.stack([np.concatenate([r,r[:1]]) for r in rows],1); O=np.stack([np.concatenate([la.world(nrm),la.world(nrm)[:1]])]*len(rows),1)
    tpp=np.concatenate([tp,tp[:1]])
    B.grid(P,1,UVR['side'],O,matf=lambda i,j:(2 if tpp[i]<.56 and tpp[min(i+1,n)]<.56 else 1) if j<=1 else 1)
    bot=np.stack([rows[-1][:NT],np.concatenate([rows[-1][:1],rows[-1][NT:][::-1],rows[-1][NT-1:NT]])],1)
    q=np.stack([bot[...,:2]@la.f,bot[...,:2]@la.lat],-1); r=UVR['bottom']
    uvb=np.stack([r[0]+(r[2]-r[0])*(q[...,1]-q[...,1].min())/(np.ptp(q[...,1])+1e-9),r[1]+(r[3]-r[1])*(q[...,0]-q[...,0].min())/np.ptp(q[...,0])],-1)
    B.grid(bot,1,r,np.tile([0,0,-1.],(NT,2,1)),uvs=uvb,matf=lambda i,j:2 if ts[i]<.36 else 1)
    # puntera, contrafuerte, refuerzo de ojales
    aw=np.concatenate([[.02],as_[1:-1],[.98]])   # mismas líneas que la capellada: el parche nunca la corta
    B.shell(np.concatenate([[.80],ts[(ts>.80)&(ts<.994)]]),aw,.0012,0,UVR['toecap'])
    # contrafuerte: envuelve el talón y su borde delantero baja en diagonal hacia la suela
    B.shell(np.concatenate([[.0015],ts[(ts>.0015)&(ts<.30)],[.30]]),aw,.0014,3,UVR['counter'],warp=lambda T,A:np.where(T<.12,T,.12+(T-.12)/.18*(.20-.13*np.sin(np.pi*A)**.7)))
    for a0,a1 in ((.27,.375),(.625,.73)): B.shell(np.linspace(.50,.75,12),np.linspace(a0,a1,4),.0011,0,UVR['misc'])
    # lengüeta: sobre el empeine y solapa que sube hacia la tibia
    tt=np.linspace(.44,.76,12); ta=np.linspace(.385,.615,7); B.shell(tt,ta,.0016,0,UVR['tongue'])
    base=S(np.full(7,.445),ta,.0035); sgrid=np.linspace(0,1,6)[:,None,None]; up=la.world(np.array([-.010,0,.030]))
    flap=base[None]+up[None,None,:]*sgrid+la.world(np.array([.006,0,0]))[None,None,:]*np.sin(np.pi*sgrid)
    flap=np.concatenate([flap,(flap+la.world(np.array([-.004,0,-.001])))[::-1]]); B.grid(flap,0,UVR['tongue'],np.concatenate([np.tile(la.world(np.array([1,0,.5])),(6,7,1)),np.tile(la.world(np.array([-1,0,-.5])),(6,7,1))]))
    # cordones cruzados
    ey=np.linspace(.535,.735,5); aL,aR=.345,.655
    def lace(t0,a0,t1,a1):
        k=np.linspace(0,1,7); B.tube(S(t0+(t1-t0)*k,a0+(a1-a0)*k,.0030+.0012*np.sin(np.pi*k)),.0016,4,UVR['lace'],5)
    for i in range(4): lace(ey[i],aL,ey[i+1],aR); lace(ey[i],aR,ey[i+1],aL)
    lace(ey[4],aL,ey[4],aR)
    # correa de velcro sobre el empeine con pasador del lado lateral
    B.shell(np.linspace(.405,.495,5),np.linspace(.10,.93,18),.0036,3,UVR['strap'])
    B.shell(np.linspace(.412,.488,4),np.linspace(.12,.42,8),.0052,3,UVR['strap'])
    pc=S(.45,.085,.004); ax=(S(.50,.085)-S(.40,.085)); ax/=np.linalg.norm(ax); nn=S(.45,.085,.01)-S(.45,.085); nn/=np.linalg.norm(nn); ay=np.cross(ax,nn)
    for d in (-1,1): B.box(pc+ay*d*.0055,ax*.0155,ay*.0011,nn*.0016,4,UVR['metal'])
    for d in (-1,1): B.box(pc+ax*d*.0155,ax*.0011,ay*.0066,nn*.0016,4,UVR['metal'])
    # cuello acolchado alrededor del tobillo
    c=la.leg_c; rr=la.leg_r+np.array([.0035,.0035]); ang=np.linspace(0,2*np.pi,29); ring_=[]
    for an in ang:
        q=np.array([c[0]+rr[0]*np.cos(an),c[1]+rr[1]*np.sin(an),.0]); tq=np.clip((q[0]-la.u0)/la.L,0,1); vc_,hw_,zf_,H_=la.prof(tq)
        q[2]=min(float(zf_+H_)-.002,.079)+.006*max(0,-np.cos(an)); ring_.append(q)
    ring_=np.array(ring_); P=np.zeros((29,9,3)); O=np.zeros_like(P)
    for i,an in enumerate(ang):
        rad=np.array([np.cos(an),np.sin(an),0.])
        for j in range(9):
            b_=2*np.pi*j/8; o=rad*np.cos(b_)+np.array([0,0,1.])*np.sin(b_); O[i,j]=la.world(o); P[i,j]=la.world(ring_[i]+rad*np.cos(b_)*.006+np.array([0,0,1.])*np.sin(b_)*.0075)
    B.grid(P,0,UVR['misc'],O)
    # tirador del talón
    hb=S(.0,.5,.0); B.box(la.world(np.array([la.u0-.0005,la.prof(.03)[0],.062])),la.world(np.array([.0012,0,0])),la.world(np.array([0,.006,0])),np.array([0,0,.016]),3,UVR['tab'])
    me=bpy.data.meshes.new(name+side); B.bm.normal_update(); B.bm.to_mesh(me); B.bm.free()
    o=bpy.data.objects.new(name+side,me); bpy.context.scene.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    try: me.set_sharp_from_angle(angle=math.radians(42))
    except Exception as e: print('sharp',e)
    vg=o.vertex_groups.new(name='mixamorig:'+side+'Foot'); vt=o.vertex_groups.new(name='mixamorig:'+side+'ToeBase')
    ub=float(np.array(rig.data.bones['mixamorig:'+side+'ToeBase'].head_local)[:2]@la.f)
    for v in me.vertices:
        w=float(sstep(ub-.014,ub+.020,float(np.array(v.co)[:2]@la.f))); vg.add([v.index],1-w,'REPLACE')
        if w>0: vt.add([v.index],w,'REPLACE')
    zs=[v.co.z for v in me.vertices]
    print(f'SHOE {side}: verts {len(me.vertices)} tris {sum(len(p.vertices)-2 for p in me.polygons)} largo {la.L:.3f} zmin {min(zs):.4f} zmax {max(zs):.3f} taco {.023*1000:.0f} mm / antepié {.009*1000:.0f} mm')
    return o
