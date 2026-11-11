"""Texturas procedurales del personaje (pista PERSONAJE, etapa 2). Solo numpy + PIL: corre sin Blender.
  TARIMA_OUT=... python blender/tex.py <nombre> [resolución]      (requiere maps.npz, lm.json, bones.json, bones_all.json)
Salidas en <OUT>/<nombre>/:
  body_color.png   albedo sRGB
  body_orm.png     R=oclusión (AO horneado + cavidad), G=rugosidad, B=metal (0)
  body_normal.png  normal en espacio tangente (+Y arriba, convención glTF/Blender), derivado de un mapa de alturas en metros
  body_mask.png    R=piel, G=tela, B=pelo (contrato 5; mismo UV que Body)
  eye.png, shoe_{color,orm,normal}.png, belt_{color,orm,normal}.png
Todo sale de los mapas que hornea make.py (posición de reposo, normal de objeto, máscaras por hueso, AO) y de reglas.
Sin fotos, sin caras ni marcas reales: los textos son el código de país y el apellido ficticios de style.py."""
import os
for _k in ('OMP_NUM_THREADS','VECLIB_MAXIMUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS'): os.environ.setdefault(_k,os.environ.get('TARIMA_THREADS') or str(min(6,os.cpu_count() or 6)))   # tope de hilos de BLAS (antes de importar numpy)
import sys, json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
f32=np.float32
def sm(e0,e1,v):
    t=np.clip((v-e0)/(e1-e0),0,1); return (t*t*(3-2*t)).astype(f32)
hexc=lambda h:np.array([int(h[i:i+2],16)/255 for i in (1,3,5)],f32)
def _box(a,r,ax):
    if r<1: return a
    p=np.pad(a,[(r+1,r) if i==ax else (0,0) for i in range(a.ndim)],mode='edge'); c=np.cumsum(p,axis=ax,dtype=np.float64); n=a.shape[ax]
    sl=lambda s:tuple(s if i==ax else slice(None) for i in range(a.ndim))
    return ((c[sl(slice(2*r+1,2*r+1+n))]-c[sl(slice(0,n))])/(2*r+1)).astype(f32)
def blur(a,sigma):
    """Gaussiano aproximado (tres pasadas de caja). Para sigmas grandes trabaja a menor resolución."""
    if sigma<.6: return a
    if sigma>10:
        k=int(sigma//4); h,w=a.shape; s=Image.fromarray(a.astype(f32)).resize((max(1,w//k),max(1,h//k)),Image.BOX)
        return np.asarray(Image.fromarray(blur(np.asarray(s),sigma/k)).resize((w,h),Image.BICUBIC))
    r=max(1,int(round((math.sqrt(4*sigma*sigma+1)-1)/2)))
    for _ in range(3): a=_box(_box(a,r,0),r,1)
    return a
def vnoise(q,seed,N=32):
    """Ruido de valor trilineal periódico. q: (n,3) → (n,) en [-.5,.5]."""
    vol=np.random.default_rng(seed).random((N,N,N),dtype=f32); out=np.empty(len(q),f32); C=1<<20
    for a in range(0,len(q),C):
        p=q[a:a+C]; i=np.floor(p).astype(np.int32); f=(p-i).astype(f32); f=f*f*(3-2*f); i&=N-1; j=(i+1)&(N-1)
        x0,y0,z0=i[:,0],i[:,1],i[:,2]; x1,y1,z1=j[:,0],j[:,1],j[:,2]; fx,fy,fz=f[:,0],f[:,1],f[:,2]
        c0=(vol[x0,y0,z0]*(1-fx)+vol[x1,y0,z0]*fx)*(1-fy)+(vol[x0,y1,z0]*(1-fx)+vol[x1,y1,z0]*fx)*fy
        c1=(vol[x0,y0,z1]*(1-fx)+vol[x1,y0,z1]*fx)*(1-fy)+(vol[x0,y1,z1]*(1-fx)+vol[x1,y1,z1]*fx)*fy
        out[a:a+C]=c0*(1-fz)+c1*fz-.5
    return out
def text_mask(FONT,txt,size=220):
    f=ImageFont.truetype(FONT,size); bb=f.getbbox(txt); im=Image.new('L',(bb[2]-bb[0]+20,bb[3]-bb[1]+20),0); ImageDraw.Draw(im).text((10-bb[0],10-bb[1]),txt,font=f,fill=255); return np.asarray(im).astype(f32)/255
def save(a,path,**kw): Image.fromarray((np.clip(a,0,1)*255+.5).astype(np.uint8)).save(path,**kw)
def normal_from_height(h,su,sv,ok=None,clampv=1.6):
    """Altura en metros → normal tangente. su, sv: metros por texel en u y v (escalares o mapas). Sobel 3x3."""
    def d(a,ax):
        o=np.zeros_like(a)
        if ax==1: o[:,1:-1]=(a[:,2:]-a[:,:-2])*.5; s=o.copy(); s[1:-1]=(o[:-2]+2*o[1:-1]+o[2:])*.25
        else: o[1:-1]=(a[2:]-a[:-2])*.5; s=o.copy(); s[:,1:-1]=(o[:,:-2]+2*o[:,1:-1]+o[:,2:])*.25
        return s
    gu=d(h,1)/su; gv=d(h,0)/sv
    if ok is not None: gu*=ok; gv*=ok
    gu=np.clip(gu,-clampv,clampv); gv=np.clip(gv,-clampv,clampv); n=np.stack([-gu,-gv,np.ones_like(gu)],2); n/=np.linalg.norm(n,axis=2,keepdims=True); return n*.5+.5

class Geo:
    """Geometría del cuerpo en espacio de textura (fila 0 = v 0, como la hornea Blender)."""
    def __init__(s,OUT,R=None):
        M=np.load(OUT+'maps.npz')
        if 'NO' not in M.files: raise SystemExit('maps.npz viejo: volvé a correr blender/make.py (falta el normal de objeto)')
        R0=M['PO'].shape[0]; R=R or R0; st=max(1,R0//R); s.st=st; s.M=M
        PO=M['PO'][::st,::st].astype(f32); s.R=PO.shape[0]; s.cov=PO[:,:,0]>.01
        s.x=PO[:,:,0]-1; s.y=PO[:,:,1]-1; s.z=PO[:,:,2].copy(); s.x[~s.cov]=0; s.y[~s.cov]=0; s.z[~s.cov]=-1
        du=np.zeros_like(PO); dv=np.zeros_like(PO); du[:,1:-1]=(PO[:,2:]-PO[:,:-2])*.5; dv[1:-1]=(PO[2:]-PO[:-2])*.5
        s.su=np.sqrt((du**2).sum(2)); s.sv=np.sqrt((dv**2).sum(2)); del du,dv,PO
        c=s.cov; ok=c.copy(); ok[:,1:]&=c[:,:-1]; ok[:,:-1]&=c[:,1:]; ok[1:]&=c[:-1]; ok[:-1]&=c[1:]
        med=float(np.median(s.su[ok][::97])); s.texel=med; ok&=(s.su<8*med)&(s.sv<8*med)&(s.su>med*.05)&(s.sv>med*.05); s.ok=ok
        s.su=np.where(ok,s.su,med).astype(f32); s.sv=np.where(ok,s.sv,med).astype(f32)
        s.idx=np.nonzero(s.cov); s.P=np.stack([s.x[s.idx],s.y[s.idx],s.z[s.idx]],1)
        s._ch=dict(torso=('A',0),thigh=('A',1),leg=('A',2),low=('B',0),scalp=('B',1),lips=('B',2),head=('C',0),farmL=('C',1),farmR=('C',2),uarmL=('D',0),ears=('D',2))
        ao=M['AO'][::st,::st].astype(f32)/255; s.ao=blur(ao,2.5*s.R/2048)
    def F(s,k):
        m,c=s._ch[k]; return s.M[m][::s.st,::s.st,c].astype(f32)/255
    def N(s,c): return s.M['NO'][::s.st,::s.st,c].astype(f32)/127.5-1
    def img(s,v):
        a=np.zeros((s.R,s.R),f32); a[s.idx]=v; return a
    def n3(s,freq,seed,octaves=1,stretch=(1,1,1),gain=.5):
        """Ruido 3D sobre la posición de reposo (continuo a través de las costuras del UV). freq en ciclos/m."""
        out=np.zeros(len(s.P),f32); amp=1.; tot=0.; f=np.array(stretch,f32)*freq
        for o in range(octaves): out+=amp*vnoise(s.P*f+7.3*o,seed+31*o); tot+=amp; amp*=gain; f=f*2
        return s.img(out/tot)
    def nq(s,q,seed):
        """Ruido sobre coordenadas arbitrarias (lista de mapas)."""
        q=[np.broadcast_to(np.asarray(a,f32),(s.R,s.R))[s.idx] for a in q]
        while len(q)<3: q.append(np.zeros(len(s.P),f32))
        return s.img(vnoise(np.stack(q,1),seed))
    def n2(s,cell,seed):
        """Ruido en espacio de textura; cell en texeles de un mapa de 4096."""
        cell=cell*s.R/4096.; rng=np.random.default_rng(seed)
        if cell<=1.01: return rng.random((s.R,s.R),dtype=f32)-.5
        k=max(2,int(s.R/cell)); return np.asarray(Image.fromarray(rng.random((k,k),dtype=f32)).resize((s.R,s.R),Image.BICUBIC))-.5
    def grad(s,f):
        gu=np.zeros_like(f); gv=np.zeros_like(f); gu[:,1:-1]=(f[:,2:]-f[:,:-2])*.5; gv[1:-1]=(f[2:]-f[:-2])*.5
        return np.sqrt((gu/s.su)**2+(gv/s.sv)**2)*s.ok
    def sd(s,f,level=0.):
        """Distancia aproximada (m) sobre la superficie al nivel 'level' del campo f."""
        return (f-level)/np.maximum(s.grad(f),1e-3)
    def g(s,c,r,mirror=False):
        ax=np.abs(s.x) if mirror else s.x; return np.exp(-((ax-c[0])**2+(s.y-c[1])**2+(s.z-c[2])**2)/(r*r)).astype(f32)
    def seg(s,a,b,front=(0,-1,0)):
        """Coordenadas de miembro: t (0 en a, 1 en b), radio y ángulo alrededor del eje (0 = lado 'front')."""
        a=np.asarray(a,f32); b=np.asarray(b,f32); d=b-a; L=float(np.linalg.norm(d)); d/=L; f=np.asarray(front,f32); e1=f-d*float(f@d); e1/=np.linalg.norm(e1); e2=np.cross(d,e1)
        px,py,pz=s.x-a[0],s.y-a[1],s.z-a[2]; t=(px*d[0]+py*d[1]+pz*d[2]); qx,qy,qz=px-t*d[0],py-t*d[1],pz-t*d[2]
        return t/L,np.sqrt(qx*qx+qy*qy+qz*qz),np.arctan2(qx*e2[0]+qy*e2[1]+qz*e2[2],qx*e1[0]+qy*e1[1]+qz*e1[2]).astype(f32),L

# ================= ANATOMÍA: relieve muscular por reglas =================
# Lo usan tex.body (normal, oclusión) y geo.anatomy (desplazamiento real de la malla): una sola definición para los dos.
# Todo sale de la posición de reposo y de las articulaciones del esqueleto; el lado derecho es el espejo del izquierdo. Sin valores por personaje.
ANAT_NORMAL=.85   # fracción del relieve ancho (el que también va a la malla) que se repite en el normal map para reforzar el sombreado
ANAT_FINE=1.35    # ganancia de los surcos entre grupos musculares en el normal map
def _wrap(a): return (a+np.pi)%(2*np.pi)-np.pi
def _limb(P,a,b,front=(0,-1,0)):
    """t (0 en a, 1 en b), radio y ángulo alrededor del eje: 0 = frente (-Y); +90° = cara interna (hacia el cuerpo), -90° = cara externa."""
    a=np.asarray(a,f32); b=np.asarray(b,f32); d=b-a; L=float(np.linalg.norm(d)); d/=L; f=np.asarray(front,f32); e1=f-d*float(f@d); e1/=np.linalg.norm(e1); e2=np.cross(d,e1)
    q=P-a; t=q@d; q-=np.outer(t,d); return (t/L).astype(f32),np.linalg.norm(q,axis=1).astype(f32),np.arctan2(q@e2,q@e1).astype(f32)
def _dseg(u,v,a,b):
    du,dv=b[0]-a[0],b[1]-a[1]; t=np.clip(((u-a[0])*du+(v-a[1])*dv)/(du*du+dv*dv),0,1); return np.hypot(u-a[0]-t*du,v-a[1]-t*dv),t
def anatomy(P,N,J,K):
    """P, N: (n,3) posición y normal de reposo. J: nombre de hueso -> cabeza (lado izquierdo y eje). Devuelve (ancho, fino, fibra) en metros:
    'ancho' son las masas musculares (>= 2 cm: sirven como geometría), 'fino' los surcos entre grupos, 'fibra' una máscara 0..1 de deltoides y pectoral para estrías."""
    P=np.asarray(P,f32); N=np.asarray(N,f32); sg=np.where(P[:,0]<0,-1,1).astype(f32); Q=P.copy(); Q[:,0]*=sg; nx=N[:,0]*sg; ny=N[:,1]; nz=N[:,2]
    S,E,W,H,Kn,An,Nk=[np.asarray(J[k],f32) for k in ('LeftArm','LeftForeArm','LeftHand','LeftUpLeg','LeftLeg','LeftFoot','Neck')]
    G=lambda x,s_:np.exp(-(x/s_)**2); rg=lambda lo,hi,x,e=.03:sm(lo-e,lo+e,x)*sm(hi+e,hi-e,x); D=np.pi/180
    B=np.zeros(len(P),f32); F=np.zeros(len(P),f32); fib=np.zeros(len(P),f32)
    # ---- brazo ----
    t,r,th=_limb(Q,S,E); aw=rg(-.30,1.06,t,.04)*sm(.090*K,.074*K,r); dO=_wrap(th+90*D)       # dO: ángulo desde la cara externa
    delt=G(t-.16,.24)*G(dO,1.25)*sm(-.34,-.1,t); B+=aw*K*(.0065*delt+.0060*G(t-.56,.19)*G(_wrap(th-12*D),.72)+.0050*G(t-.40,.20)*G(_wrap(th-172*D),.80)-.0020*G(t-.93,.10)*(1-G(_wrap(th-180*D),.5)))
    te=.50-.20*(dO/1.5)**2; F+=aw*K*(-.0024*G(t-te,.040)*sm(1.75,1.35,np.abs(dO))                       # borde inferior del deltoides (la V de la inserción)
        -.0010*(G(dO-.72,.11)+G(dO+.72,.11))*rg(.0,.36,t,.05)                                          # separación de las tres cabezas
        -.0021*G(_wrap(th+100*D),.15)*rg(.50,.97,t,.05)-.0024*G(_wrap(th-88*D),.15)*rg(.28,.94,t,.05)   # surcos bicipitales lateral y medial
        -.0016*G(_wrap(th-178*D),.26)*rg(.62,.98,t,.05)                                                # tendón del tríceps (herradura)
        -.0010*G(_wrap(th-150*D),.10)*rg(.22,.60,t,.05))                                               # entre cabeza larga y lateral
    fib=np.maximum(fib,aw*delt*sm(1.6,1.1,np.abs(dO))*sm(te+.02,te-.06,t))
    # ---- antebrazo ----
    t,r,th=_limb(Q,E,W); fw=rg(-.06,1.0,t,.04)*sm(.072*K,.058*K,r)
    B+=fw*K*(.0042*G(t-.20,.20)*G(_wrap(th+75*D),.80)+.0036*G(t-.24,.22)*G(_wrap(th-110*D),.85))
    F+=fw*K*(-.0013*G(_wrap(th-15*D),.16)*rg(.06,.62,t,.05)-.0012*G(_wrap(th+165*D),.16)*rg(.06,.55,t,.05)-.0007*G(_wrap(th+75*D),.10)*rg(.25,.70,t,.05))
    ta,ra,_=_limb(Q,S,E); wT=(1-sm(.04,.28,ta)*sm(.090*K,.074*K,ra))*(1-fw)*sm(H[2]-.06*K,H[2]+.02*K,Q[:,2]); del ta,ra
    # ---- torso: u, v en metros de un cuerpo de referencia (ancho de hombros 0,213 m; hombro-cadera 0,483 m) ----
    u=Q[:,0]/(S[0]/.213); v=(Q[:,2]-S[2])/((S[2]-H[2])/.483); fr=sm(.05,.55,-ny)*wT; bk=sm(.05,.55,ny)*wT; sd=sm(.45,.8,nx)*wT; top=sm(.25,.7,nz)
    pec=G(np.hypot((u-.098)/.080,(v+.100)/.068),1.); B+=fr*K*.0060*pec
    vp=-.168+.52*np.clip(u-.105,0,1)
    d1,_=_dseg(u,v,(.128,.020),(.186,-.082)); d2,t2=_dseg(u,v,(.022,.036),(.170,.058)); d3,t3=_dseg(u,v,(.060,.178),(.013,.040))
    F+=fr*K*(-.0026*G(u,.012)*rg(-.175,.025,v,.02)-.0034*G(v-vp,.013)*rg(.018,.20,u,.012)-.0021*G(d1,.010)
        -.0019*G(u,.010)*rg(-.43,-.19,v,.015)-.0014*(G(v+.215,.009)+G(v+.268,.009)+G(v+.325,.009))*sm(.080,.058,u)-.0016*G(u-.079,.012)*rg(-.44,-.20,v,.02))   # línea alba, intersecciones y línea semilunar
    ft=np.maximum(fr,top*wT*(Q[:,1]<S[1]+.02*K))
    F+=ft*K*(.0030*G(d2,.0085)-.0022*G(np.hypot(u-.075,v-.078),.030))+fr*K*.0020*G(d3,.010)*rg(.045,.17,v,.012)*(1-.5*t3)      # clavícula, hueco supraclavicular, esternocleidomastoideo
    B+=wT*K*.0055*G(np.sqrt((u-.090)**2+((Q[:,1]-Nk[1])/K-.030)**2+(v-.085)**2),.062)                                         # trapecio
    F+=sd*K*.0013*np.sin(2*np.pi*(v-.55*(Q[:,1]-S[1])/K)/.040)*rg(-.30,-.155,v,.02)*(Q[:,1]<S[1]+.05*K)                          # serrato
    B+=sd*K*.0030*G(v+.37,.06)*rg(-.02,.2,-(Q[:,1]-S[1])/K,.03)                                                                # oblicuo sobre la cresta ilíaca
    d4,_=_dseg(u,v,(.0,-.235),(.125,-.035)); B+=bk*K*(.0050*G(np.hypot((u-.105)/.060,(v+.085)/.060),1.)+.0050*G(u-.150,.045)*rg(-.30,-.13,v,.04)+.0034*G(u-.036,.020)*rg(-.46,-.20,v,.04))
    F+=bk*K*(-.0040*G(u,.014)*rg(-.46,.03,v,.02)-.0018*G(d4,.010)-.0020*G(v+.012-.10*(u-.10),.011)*rg(.06,.19,u,.015)-.0016*G(u-.062-.10*(v+.085),.010)*rg(-.155,-.02,v,.015))   # + borde medial de la escápula             # canal de la columna, borde del trapecio inferior, espina de la escápula
    fib=np.maximum(fib,fr*pec*.8)
    # ---- muslo ----
    t,r,th=_limb(Q,H,Kn); lw=rg(.10,1.04,t,.05)*sm(.17*K,.14*K,r)*(Q[:,2]<H[2]+.02*K)
    B+=lw*K*(.0034*G(t-.42,.28)*G(th,.42)+.0042*G(t-.55,.25)*G(_wrap(th+62*D),.50)+.0050*G(t-.80,.12)*G(_wrap(th-48*D),.42)+.0028*G(t-.50,.25)*G(_wrap(th-180*D),.75))
    F+=lw*K*(-.0023*G(_wrap(th+29*D),.085)*rg(.25,.86,t,.05)-.0023*G(_wrap(th-26*D),.085)*rg(.48,.90,t,.05)-.0012*G(_wrap(th-178*D),.09)*rg(.50,.97,t,.05)-.0009*G(_wrap(th+105*D),.10)*rg(.30,.90,t,.05))
    # ---- pantorrilla ----
    t,r,th=_limb(Q,Kn,An); cw=rg(.02,.95,t,.04)*sm(.105*K,.085*K,r)
    B+=cw*K*(.0045*G(t-.26,.15)*G(_wrap(th-146*D),.50)+.0036*G(t-.23,.14)*G(_wrap(th+150*D),.50)+.0018*G(t-.30,.2)*G(_wrap(th+35*D),.4))
    F+=cw*K*(-.0011*G(_wrap(th-178*D),.10)*rg(.08,.46,t,.04)-.0009*G(_wrap(th+8*D),.07)*rg(.15,.8,t,.05))
    return B,F,fib
MEL=np.array([.70,.60,.52],f32); HEM=np.array([1.06,.78,.75],f32); VEIN=np.array([.80,.93,.99],f32)
def body(NAME,OUT,STY,K,FONT,R=None,log=print):
    T=Geo(OUT,R); R=T.R; x,y,z,cov=T.x,T.y,T.z,T.cov; axo=np.abs(x); F=T.F; S=R/4096.
    LM={k:np.array(v,f32) for k,v in json.load(open(OUT+'lm.json')).items()}; BJ=json.load(open(OUT+'bones.json')); BA={k:np.array(v,f32) for k,v in json.load(open(OUT+'bones_all.json')).items()}
    hip,knee,ank,sh,neck=[np.array(BJ[k],f32) for k in ('hip','knee','ank','sh','neck')]; hemz=BJ['hemz']
    log(f'TEX {NAME}: {R}px, texel medio {T.texel*1000:.2f} mm, cobertura {cov.mean()*100:.0f}%')
    SKIN=hexc(STY['skin']); dark=float(1-SKIN.mean())   # 0 claro … 1 oscuro
    col=np.empty((R,R,3),f32); col[:]=SKIN; rough=np.full((R,R),.58,f32); H=np.zeros((R,R),f32)
    def tint(m,t):
        nonlocal col; col*=1+np.clip(m,0,1)[:,:,None]*(np.asarray(t,f32)-1)
    def mix(m,c,r=None):
        nonlocal col,rough; m=np.clip(m,0,1); c=np.asarray(c,f32); c=c[None,None,:] if c.ndim==1 else c; col+=(c-col)*m[:,:,None]
        if r is not None: rough+=(r-rough)*m
    nz=T.N(2); ny=T.N(1); nxo=T.N(0)
    # ================= PIEL =================
    lo=T.n3(7,11,3); mid=T.n3(42,12,2); fine=T.n3(380,13,2); blot=np.clip(.5+T.n3(18,14,2)*2.2,0,1)
    tint(np.clip(.5+lo*1.8,0,1)*.20,MEL); tint(np.clip(mid*2.4,0,1)*.13,HEM); tint(np.clip(-mid*2.4,0,1)*.08,MEL); col*=1+fine[:,:,None]*.06
    pore=T.n2(2.4,4)+T.n3(950,15)*.8; H+=mid*.00012+fine*.00008+T.n2(1,3)*.000015        # relieve medio, grano fino y poro a escala de texel (el poro por zona se suma más abajo)
    rough+=fine*.12+lo*.08+pore*.05
    head=F('head'); ears=F('ears'); eL,nose,lips,chin,ear=LM['eyeL'],LM['nose'],LM['lips'],LM['chin'],LM['ears']; er=float(LM['eyeR_r'][0]); hs=float(eL[0]/.0288)
    cheek=T.g((.048*hs,eL[1]+.012,(nose[2]+lips[2])/2+.008),.030*hs,True)
    tint(head*(cheek*.42+T.g(nose+(0,.012,.004),.022*hs)*.45+T.g(chin+(0,-.012,.012),.022*hs)*.18)+ears*.5+head*.10*blot,HEM)
    tint(head*T.g((eL[0],eL[1]+.004,eL[2]-.013*hs),.011*hs,True)*.42,(.84,.80,.86)); tint(head*T.g(eL,.024*hs,True)*.2,MEL)
    de=np.sqrt((axo-eL[0])**2+(y-eL[1])**2+(z-eL[2])**2); mix(head*sm(er*1.13,er*1.0,de)*.6,(.16,.10,.09))      # borde del párpado / línea de pestañas
    fore=head*sm(eL[2]+.022*hs,eL[2]+.034*hs,z)*sm(.062*hs,.04*hs,axo)*(y<eL[1]+.05)
    for k in range(3): H-=fore*.00007*np.exp(-((z-(eL[2]+.036*hs+k*.0085*hs+.0018*np.sin(x*70+k)+lo*.004))/.0011)**2)   # arrugas de la frente
    tzone=head*np.maximum(fore,T.g(nose+(0,.014,.008),.026*hs))                     # zona T
    H+=pore*(.000035+.00004*tzone+.00003*sm(sh[2]-.12,sh[2]+.02,z)*(1-head))     # poros: más marcados en frente, nariz y hombros
    # pliegues de la cara en el normal: surco nasolabial, pliegue del párpado superior y ojera
    na=np.array([.017*hs,nose[1]+.020,nose[2]-.002],f32); nb=np.array([.031*hs,lips[1]+.014,lips[2]-.008],f32); dn_=nb-na; Ln=float(np.linalg.norm(dn_)); dn_/=Ln
    qx,qy,qz=axo-na[0],y-na[1],z-na[2]; tn_=np.clip(qx*dn_[0]+qy*dn_[1]+qz*dn_[2],0,Ln); dl=np.sqrt((qx-tn_*dn_[0])**2+(qy-tn_*dn_[1])**2+(qz-tn_*dn_[2])**2)
    H-=head*STY.get('folds',1.)*(.00045*np.exp(-(dl/.0022)**2)*(.5+.5*tn_/Ln)+.0004*np.exp(-((de-er*1.32)/.0011)**2)*sm(eL[2]+.001,eL[2]+.005,z)+.00007*np.exp(-((de-er*1.6)/.004)**2)*sm(eL[2]-.002,eL[2]-.008,z))
    chest=sm(sh[2]-.16,sh[2]-.04,z)*sm(neck[2]+.07,neck[2]+.02,z)*(1-F('farmL'))*(1-F('farmR'))
    tint(chest*blot*.16*(ny<.2),HEM)
    clav=chest*sm(.02,.05,axo)*sm(.2,.15,axo)*sm(sh[2]-.03,sh[2]+.0,z)*sm(sh[2]+.075,sh[2]+.045,z)*sm(.1,-.3,ny); tint(clav*(.4+.6*blot)*.3,HEM)   # marca de la barra en clavículas
    hair=hexc(STY['hair']); bh=STY.get('bodyhair',.5)
    def strands(m,q,seed,th=.22,a=.3):     # vello fino: vetas oscuras alargadas
        s_=T.nq(q,seed); k=sm(th,th+.12,s_)*m; mix(k*a*bh,hair*.8)
    hands={}
    for sgn,side in ((1,'Left'),(-1,'Right')):
        a,w,s0=[np.array(p,f32) for p in BJ['arms'][side]]; fl=F('farm'+side[0]); t,r,th,L=T.seg(a,w); sd_=(x*sgn>.05)
        ua=sd_*sm(.085*K,.07*K,T.seg(s0,a)[1])
        # codo: piel más oscura, áspera y con pliegues
        d=(w-a)/np.linalg.norm(w-a); post=np.array([0,1,0],f32); post-=d*float(post@d); post/=np.linalg.norm(post)
        elb=T.g(a+post*.03*K-d*.005,.036*K)*sd_; tint(elb*.42,MEL); tint(elb*.22,HEM); rough+=elb*.16+fl*sm(1.0,.8,t)*.05          # antebrazo más seco
        H-=elb*.0003*(1-np.abs(2*T.nq((th*r*230+mid*9,t*L*480+lo*6),46+sgn)))**2.5+elb*.00012*(1-np.abs(2*T.nq((th*r*90,t*L*110),47+sgn)))**2   # arrugas irregulares, cortas y transversales
        # venas del antebrazo y cefálica del brazo
        ven=np.zeros((R,R),f32)
        for k,(t0,amp,fr,ph,sl) in enumerate(((-.7,.25,1.3,.2,.0),(.55,.3,1.7,1.1,.35),(2.3,.2,1.1,2.,-.3),(.1,.2,2.3,.5,.9))):
            dth=np.angle(np.exp(1j*(th-(t0+amp*np.sin(2*np.pi*(t*fr+ph))+sl*(t-.4))))).astype(f32)
            ven=np.maximum(ven,np.exp(-((dth*r)/(.0017*K))**2)*sm(.04,.22,t)*sm(.74,.55,t)*(.6+.4*(k<2)))
        t2,r2,th2,L2=T.seg(s0,a); dth=np.angle(np.exp(1j*(th2-(.35*sgn+.2*np.sin(2*np.pi*(t2*1.2+.3)))))).astype(f32)
        ven2=np.exp(-((dth*r2)/(.0020*K))**2)*sm(.3,.5,t2)*sm(1.02,.9,t2)*ua
        ven=np.maximum(ven*fl,ven2*.8)*STY.get('veins',.8); H+=ven*.00055; tint(ven*.20,VEIN)
        strands(fl*sm(.74,.7,t)*sm(.0,.15,t),(th*75,t*38+th*2.5),40+sgn,a=.32)
        # axila
        pit=T.g((sgn*(sh[0]-.035*K),sh[1]+.005,sh[2]-.085*K),.042*K)*sm(.8,.45,T.ao)*sd_; mix(pit*np.clip(.55+T.n3(900,45,1,(1,1,.15))*2,0,1)*.7*min(1,bh*1.6),hair*.75,.62)
        # mano
        hand=fl*sm(1.03,1.05,t); W_=BA[side+'Hand'][0]; i1=BA[side+'HandIndex1'][0]; p1=BA[side+'HandPinky1'][0]; m1=BA[side+'HandMiddle1'][0]
        pn=np.cross(i1-W_,p1-W_); pn/=np.linalg.norm(pn); pn*=(-1 if sgn>0 else 1)          # normal de la palma
        pdot=nxo*pn[0]+ny*pn[1]+nz*pn[2]; pf=sm(-.15,.35,pdot)*hand; dors=sm(.0,.4,-pdot)*hand
        tint(pf*.9,(1.10,1.0,.96)); tint(pf*.25*blot,HEM)
        hd=(m1-W_)/np.linalg.norm(m1-W_); al=(x-W_[0])*hd[0]+(y-W_[1])*hd[1]+(z-W_[2])*hd[2]; lat=np.cross(hd,pn)
        ac=(x-W_[0])*lat[0]+(y-W_[1])*lat[1]+(z-W_[2])*lat[2]
        rid=1-np.abs(2*T.nq((ac*150+T.n3(60,50)*1.2,al*22),51+sgn)); hv=sm(.80,.95,rid)*dors*sm(.0,.02,al)*sm(float(np.linalg.norm(m1-W_))*1.05,float(np.linalg.norm(m1-W_))*.8,al)
        hv=np.clip(blur(hv,3.2*S)*1.7,0,1)*dors     # vena ancha y blanda, no una grieta
        H+=hv*.0007*STY.get('veins',.8); tint(hv*.10,VEIN)
        H-=pf*.00055*sm(.86,.97,1-np.abs(2*T.nq((ac*60+al*25,al*45-ac*20),53)))*sm(.0,.02,al)       # líneas de la palma
        H-=pf*.00010*(1-np.abs(2*T.nq((ac*900+al*200,al*700),54)))**2                                  # dermatoglifos finos
        for fn in ('Thumb','Index','Middle','Ring','Pinky'):
            for j in (1,2,3):
                J,Tl=BA[f'{side}Hand{fn}{j}']; d_=(Tl-J)/np.linalg.norm(Tl-J); px,py,pz=x-J[0],y-J[1],z-J[2]; s_=px*d_[0]+py*d_[1]+pz*d_[2]; rr=np.sqrt(px*px+py*py+pz*pz); rk=(.013 if j==1 else .010)*K
                dk=dors if fn!='Thumb' else hand
                k=np.exp(-(rr/rk)**2)*dk; tint(k*.34,HEM); tint(k*.30*(.5+dark),MEL); H+=k*(.00025-.00034*np.cos(2*np.pi*s_/.0019+mid*6)); rough+=k*.10
                if j>1 or fn=='Thumb':
                    kp=np.exp(-(rr/(.010*K))**2)*pf; cr=np.exp(-(s_/.0008)**2)+.6*np.exp(-((s_-.0022)/.0006)**2); H-=kp*.00045*cr; tint(kp*cr*.3,(.80,.68,.66))
            J,Tl=BA[f'{side}Hand{fn}3']; d_=(Tl-J)/np.linalg.norm(Tl-J); c=J+(Tl-J)*.60
            dn=-pn if fn!='Thumb' else np.cross(d_,pn)
            if fn=='Thumb':
                dn/=np.linalg.norm(dn); dn*=np.sign(float(dn@(J-BA[side+'HandIndex1'][0]))) or 1
            px,py,pz=x-c[0],y-c[1],z-c[2]; s_=px*d_[0]+py*d_[1]+pz*d_[2]; dd=px*dn[0]+py*dn[1]+pz*dn[2]; q_=np.sqrt(np.maximum(px*px+py*py+pz*pz-s_*s_-dd*dd,0))
            wn=(.0062 if fn!='Pinky' else .0052)*K*(1.25 if fn=='Thumb' else 1)
            rho_=np.sqrt((s_/(wn*1.15))**2+(q_/wn)**2); fc_=sm(.15,.5,nxo*dn[0]+ny*dn[1]+nz*dn[2])*hand; nail=sm(1.05,.85,rho_)*fc_
            rim=np.exp(-((rho_-1.0)/.14)**2)*fc_*sm(wn*.9,wn*.3,s_); H-=rim*.00028; tint(rim*.35,(.74,.60,.58))            # surco de la cutícula y los bordes
            mix(nail*.45,(.90,.66,.62))
            tint(nail,(1.13,1.02,1.0)); mix(nail*sm(wn*.75,wn*.95,s_)*.55,(.93,.90,.84)); mix(nail*sm(-wn*.5,-wn*.9,s_)*.25,(.95,.88,.86)); rough+=(.20-rough)*nail; H+=nail*.0003
        for fn in ('Index','Middle','Ring','Pinky'):       # callos en la base de los dedos
            J=BA[f'{side}Hand{fn}1'][0]; c_=T.g(J-hd*.004,.011*K)*pf; tint(c_*.55,(1.03,.93,.74)); rough+=c_*.2; H+=c_*.0004*(.7+mid*3)
        hands[side]=(hand,pf,fl,t,th,L,r)
    # piernas: vello (franja visible entre media y rodillera, y entre rodillera y malla)
    strands(F('leg')*sm(.03,.06,axo),(x*1500,y*1500,z*170),60,a=.30); strands(F('low'),(x*1500,y*1500,z*170),61,a=.30)
    strands(chest*sm(.3,-.2,ny)*sm(.11,.05,axo),(x*1300,y*400,z*260),62,th=.2,a=.28)
    # tatuaje: bandas geométricas en el brazo izquierdo
    if STY.get('tattoo'):
        a,w,s0=[np.array(p,f32) for p in BJ['arms']['Left']]; t,r,th,L=T.seg(s0,a); tri=np.abs(((th*7/(2*np.pi))%1)-.5)*2
        band=np.maximum.reduce([sm(.50,.505,t)*sm(.585,.58,t),sm(.665,.67,t)*sm(.69,.685,t),sm(.016,.011,np.abs(t-(.625+.03*(tri-.5))))])
        mix(sm(.5,.6,F('uarmL'))*band*(.78+fine*.5),hexc('#1c2629')*(1,1,1.08))
    # anatomía: masas y surcos musculares (anatomy), más estrías finas en deltoides y pectoral. Se compone al final: la lycra la deja ver, el neopreno casi no.
    Jh={k:v[0] for k,v in BA.items()}; Nn=np.stack([nxo[T.idx],ny[T.idx],nz[T.idx]],1); aB=np.empty(len(T.P),f32); aF=np.empty_like(aB); aS=np.empty_like(aB); C_=1<<21
    for i in range(0,len(T.P),C_): aB[i:i+C_],aF[i:i+C_],aS[i:i+C_]=anatomy(T.P[i:i+C_],Nn[i:i+C_],Jh,K)
    aB,aF,aS=T.img(aB),T.img(aF),T.img(aS); del Nn
    aF-=aS*(1-np.abs(2*T.nq(((axo*.67-z*.74)*45,(axo*.74+z*.67)*650,y*650),48)))**2*.00016*STY.get('cut',1.)
    aZ=sm(chin[2],chin[2]-.02,z); anatH=(aB*ANAT_NORMAL+aF*ANAT_FINE)*aZ*STY.get('cut',1.); anatC=aF*aZ; del aB,aS
    skinH=H; H=np.zeros((R,R),f32)                     # a partir de acá, H es el relieve propio de cada prenda
    # ================= MALLA (lycra) =================
    E=.012; front=y<neck[1]
    scF=np.sqrt((x/(.085*K))**2+((z-(neck[2]+.03*K))/(.19*K))**2); scB=np.sqrt((x/(.075*K))**2+((z-(neck[2]+.03*K))/(.1*K))**2)
    scoop=np.where(front,scF,scB); dsc=np.where(front,T.sd(scF,1),T.sd(scB,1)); del scF,scB
    arm=np.sqrt(((axo-(sh[0]+.03*K))/(sh[0]+.03*K-.118*K))**2+((z-(sh[2]+.04*K))/(.2*K))**2); dar=T.sd(arm,1)
    farm=np.maximum(F('farmL'),F('farmR'))
    TF=np.where(z>sh[2]-.2,(1-head*(z>neck[2]+.02))*(axo<sh[0]+.03*K)*(1-farm),sm(.35,.65,F('torso')))
    suit=np.maximum(TF*sm(1-E,1+E,scoop)*sm(1-E,1+E,arm)*sm(neck[2]+.03,neck[2]+.02,z),sm(.45,.55,F('thigh'))*sm(hemz-.001,hemz+.001,z))
    SUIT=hexc(STY['suit']); TRIM=hexc(STY['trim']); cl=T.n3(30,70,3)
    mix(suit,SUIT*(1+cl[:,:,None]*.07+T.n2(1,71)[:,:,None]*.03),.74)
    p=max(3.,5.0*S); vv,uu=np.mgrid[0:R,0:R].astype(f32); knit=np.sin(uu*(2*np.pi/p))*np.sin(vv*(2*np.pi/p)); del uu,vv   # punto de ~2 mm: sobrevive a 2048; el visor puede sumar detail_cloth.png
    H+=suit*(knit*.00006+T.n2(1,75)*.00002+cl*.00015); rough+=suit*(cl*.30+knit*.04+T.n2(6,76)*.10)
    # ribete del escote y las sisas, con pespunte
    dash=lambda s_,per=.0032:(((s_/per)%1)>.38).astype(f32)
    sco=x*.55+y*.85+z
    dtr=np.minimum(dsc,dar); trim=suit*TF*sm(.0105,.0095,dtr); mix(trim,TRIM*(1+cl[:,:,None]*.05),.58)
    stt=np.exp(-((dtr-.0082)/.00045)**2)*dash(sco)*trim; H+=trim*.00045-stt*.0003; tint(stt*.35,(.8,.8,.8))
    hem=suit*sm(hemz+.019,hemz+.018,z)*F('thigh'); mix(hem,TRIM*(1+cl[:,:,None]*.05),.58)
    cxz=knee[0]+(hip[0]-knee[0])*np.clip((z-knee[2])/(hip[2]-knee[2]),0,1); tht=np.arctan2(y-knee[1],axo-cxz).astype(f32)
    for o in (.005,.0135): st_=np.exp(-((z-hemz-o)/.00045)**2)*dash(tht*.085)*hem; H-=st_*.0003; tint(st_*.35,(.8,.8,.8))
    H+=hem*.0004
    side=suit*sm(.125,.13,axo)*sm(sh[2]-.2,sh[2]-.21,z); stripe=side*sm(.022,.018,np.abs(y-.005)); mix(stripe,TRIM,.55)
    ds=np.abs(np.abs(y-.005)-.02); H-=side*(.0003*np.exp(-(ds/.0009)**2)); st_=side*np.exp(-((ds-.0024)/.00045)**2)*dash(z); H-=st_*.00025; tint(st_*.3,(.75,.75,.75))
    ins=suit*sm(hip[2]-.01,hip[2]-.04,z)*np.exp(-(x/.0009)**2); H-=ins*.0003                         # costura de entrepierna
    # arrugas de tensión: pliegue inguinal, entrepierna y cintura
    din=z-(hip[2]+.035+.30*(axo-.10)); w1=sm(.05,.0,np.abs(din))*(ny<.1)*sm(.02,.06,axo)
    w2=np.exp(-((x/.09)**2+((z-(hip[2]-.05))/.07)**2)); ang=np.arctan2(z-(hip[2]-.06),x).astype(f32)
    wr=w1*(1-np.abs(2*T.nq((x*18,y*18,din*150),72)))**2*.0007+w2*(1-np.abs(2*T.nq((ang*5,np.hypot(x,z-(hip[2]-.06))*14),73)))**2*.0006
    wa=sm(.6,.9,sm(sh[2]-.25,sh[2]-.12,z)*sm(.10,.16,axo))*(1-np.abs(2*T.nq((x*30,y*30,z*110+axo*60),74)))**2*.0005   # bajo la axila
    wz=hip[2]+.19*K; wc=sm(.10,.03,np.abs(z-wz))*(1-np.abs(2*T.nq((np.arctan2(x,-y)*2.2,z*95+np.arctan2(x,-y)*1.5),77)))**2.5*.0006                # cintura
    H+=suit*(wr+wa+wc)
    def decal(txt,cx,cz,width,u,mask,c,r=.36,hh=.00012):
        nonlocal H
        t_=text_mask(FONT,txt); h=width*t_.shape[0]/t_.shape[1]; uu=(u-(cx-width/2))/width; vv=((cz+h/2)-z)/h; ok=(uu>=0)&(uu<1)&(vv>=0)&(vv<1)
        s_=np.zeros_like(z); s_[ok]=t_[(vv[ok]*t_.shape[0]).astype(int),(uu[ok]*t_.shape[1]).astype(int)]; s_=blur(s_,.8*S)*mask; mix(s_,c,r); H+=s_*hh
    decal(STY['code'],0,sh[2]-.165*K,.13*K,x,suit*(y<-.04),TRIM); decal(STY['name'],0,sh[2]-.13*K,.21*K,-x,suit*(y>.03),TRIM)
    sweatc=suit*np.maximum(np.exp(-((x/.07)**2+((z-(sh[2]-.17))/.10)**2))*(ny<0),np.exp(-((x/.06)**2+((z-(sh[2]-.22))/.16)**2))*(ny>0))*np.clip(.6+cl*2,0,1)
    col*=1-.16*sweatc[:,:,None]; rough-=.10*sweatc
    cloth=suit.copy(); thick=suit*.0006
    # ================= RODILLERAS (neopreno) =================
    slv=sm(.45,.55,F('leg'))*sm(knee[2]-.112-.001,knee[2]-.112+.001,z)*sm(knee[2]+.102+.001,knee[2]+.102-.001,z)
    SLV=hexc(STY['sleeve']); thk=np.arctan2(y-knee[1],axo-knee[0]).astype(f32); jn=T.n2(1,80)
    mix(slv,SLV*(1+jn[:,:,None]*.16+cl[:,:,None]*.10),.80)
    cap=T.g((knee[0],knee[1]-.06,knee[2]+.01),.05,True)*slv; col*=1+.22*cap[:,:,None]                 # desgaste claro en la rótula
    band=np.maximum(sm(knee[2]+.092,knee[2]+.094,z),sm(knee[2]-.102,knee[2]-.104,z))*slv; mix(band,hexc(STY['sleeve2']),.7)
    Hs=knit*.00003+jn*.00004+band*.0005
    for zz in (knee[2]+.0935,knee[2]-.1035): Hs-=np.exp(-((z-zz)/.0005)**2)*dash(thk*.06,.0028)*.0003
    back=sm(.2,.7,np.sin(thk)); db=np.abs(np.angle(np.exp(1j*(thk-np.pi/2)))).astype(f32)*.06
    zig=np.abs(((z/.0045)%1)-.5)*2; Hs+=-.0004*np.exp(-(db/.0011)**2)+.00025*np.exp(-((db-.0012-.0028*zig)/.0006)**2)
    mix(slv*np.exp(-((db-.0012-.0028*zig)/.0006)**2)*.8,hexc(STY['sleeve2'])*1.5)
    Hs-=back*sm(.045,.0,np.abs(z-knee[2]))*(1-np.abs(2*T.nq((thk*3,z*210),81)))**2*.0008              # pliegues detrás de la rodilla
    H=H*(1-slv)+Hs*slv; thick=np.maximum(thick*(1-slv),slv*.0012); cloth=np.maximum(cloth,slv)
    for sg in (): decal('7MM',sg*(knee[0]+.004),knee[2]-.066,.034*K,x,slv*(y<knee[1]-.035),hexc(STY['sleeve2'])*1.9+.12,r=.5,hh=.00015)
    # ================= MEDIAS (canalé) =================
    top=ank[2]+.132; sock=sm(.45,.55,F('low'))*sm(top+.001,top-.001,z)
    czx=ank[0]+(knee[0]-ank[0])*np.clip((z-ank[2])/(knee[2]-ank[2]),0,1); czy=ank[1]+(knee[1]-ank[1])*np.clip((z-ank[2])/(knee[2]-ank[2]),0,1); ths=np.arctan2(y-czy,axo-czx).astype(f32)
    cuff=sm(top-.03,top-.028,z); ribs=np.where(cuff>.5,np.sin(ths*84),np.sin(ths*44)).astype(f32)
    mix(sock,hexc('#eeede7')*(1-.07*sm(.1,-.3,ribs)[:,:,None]+jn[:,:,None]*.05),.88)
    mix(sock*sm(top-.024,top-.023,z)*sm(top-.011,top-.012,z),SUIT,.85)
    H=H*(1-sock)+sock*(ribs*.00032+jn*.00003+cuff*.0003); thick=np.maximum(thick*(1-sock),sock*.0008); cloth=np.maximum(cloth,sock)
    # ================= VENDAS DE MUÑECA =================
    wrapm=np.zeros((R,R),f32)
    for side,(hand,pf,fl,t,th,L,r) in hands.items():
        wr_=sm(.45,.55,fl)*sm(.748,.752,t)*sm(1.042,1.036,t); sp=t*L/.021+th/(2*np.pi); fr=(sp%1).astype(f32)
        base=hexc('#e9e5d8')*(1+jn[:,:,None]*.07); mix(wr_,base,.9)
        mix(wr_*np.maximum(sm(.26,.28,fr)*sm(.36,.34,fr),sm(.62,.64,fr)*sm(.72,.70,fr)),SUIT*.92,.86)
        tint(wr_*sm(.08,.0,fr)*.5,(.6,.58,.55))
        Hw=fr*.0011+np.sin(th*r/.0011)*.00010+np.sin(fr*2*np.pi*14)*.00005+jn*.00003
        H=H*(1-wr_)+Hw*wr_; thick=np.maximum(thick*(1-wr_),wr_*.0006); cloth=np.maximum(cloth,wr_); wrapm=np.maximum(wrapm,wr_)
    skinm=np.clip(1-cloth,0,1)
    # ================= PELO, BARBA, CEJAS, LABIOS =================
    HAIR=hair; hc_=np.array([0,ear[1]+.005,ear[2]+.03],f32); vx,vy,vz=x-hc_[0],y-hc_[1],z-hc_[2]; az=np.arctan2(vx,-vy).astype(f32); el=np.arctan2(vz,np.hypot(vx,vy)).astype(f32)
    s1=T.nq((az*60,el*7+az*.5),90); s2=T.nq((az*170,el*16),91); s3=T.n2(1,92)
    scalp=F('scalp')
    # nacimiento del pelo: al frente no sigue el borde recto del grupo 'scalp' sino una línea con entradas en las sienes, difusa e irregular
    fr_=(scalp>.5)&(np.abs(az)<.2)&(vy<0)&cov; e_c=float(np.percentile(el[fr_],1)) if fr_.any() else .5
    e0=e_c+STY.get('hairline',.025)+.09*np.exp(-((np.abs(az)-.85)/.32)**2); frontw=sm(1.5,1.05,np.abs(az))*(vy<.02)
    hl=sm(-.04,.08,el-e0+s1*.05+s2*.04+s3*.025)*sm(.0,.25,scalp+.25*(el>e0))
    sidefade=sm(ear[2]-.015,ear[2]+.05*hs,z)
    hm=(frontw*hl+(1-frontw)*sm(.22,.75,scalp+s1*.55+s2*.25))*(.62+.38*sidefade)        # degradé en los costados
    al_=np.clip(hm*(1.0+s2*.45+s3*.2)+sm(.02,.30,scalp)*(1-hm)*(1-frontw)*np.clip(.42+s3*1.3+s2*.6,0,1)*.55,0,1); mix(al_,HAIR[None,None,:]*(1+(s1*.9+s2*.7)[:,:,None]),.62)
    hairH=al_*(.0005+s2*.0005+s1*.0003+s3*.00012); hairm=al_.copy(); rough+=hm*s2*.25
    st=1+T.n2(1,93)*1.1+T.nq((az*420,z*900),94)*1.0+s1*.5        # barba: grano fino, sin vetas
    upper=lips[2]+.004+.3*np.clip(y-lips[1],0,.2)
    jaw=sm(upper+.014+s1*.012,upper-.012+s1*.012,z)*np.maximum(sm(.024,.034,axo),sm(lips[2]-.006,lips[2]-.014,z))
    must=sm(lips[2]+.005,lips[2]+.009,z)*sm(nose[2]-.003,nose[2]-.008,z)*sm(.034,.024,axo)*sm(lips[1]+.03,lips[1]+.02,y)
    burn=sm(ear[1]-.034,ear[1]-.028,y)*sm(ear[1]-.008,ear[1]-.014,y)*sm(eL[2]+.012,eL[2]+.002,z)*sm(lips[2],lips[2]+.01,z)
    fade=sm(chin[2]-.045+s1*.01,chin[2]-.004+s1*.01,z)*sm(ear[1]-.006,ear[1]-.02,y)
    bz=head*np.maximum.reduce([jaw*fade,must,burn])*(1-np.clip(F('lips')*4,0,1))
    tint(bz*(1-STY['beard'])*.5,(.80,.82,.86))                                            # sombra de barba afeitada
    beard=np.clip(bz*STY['beard']*st,0,1); mix(beard,HAIR*(1+s3[:,:,None]*.5),.68); hairH+=beard*(.0004+s3*.0004); hairm=np.maximum(hairm,beard)
    zc=eL[2]+.0235*hs-9*(axo-.032*hs)**2; thb=.0042*sm(.056,.03,axo)+.001
    brow=head*sm(thb*1.3,thb*.3,np.abs(z-zc))*sm(.007,.014,axo)*sm(.058,.048,axo)*(y<eL[1]+.02)
    brow=np.clip(brow*(.9+T.nq((z*2600+axo*1100,axo*520),95)*1.5+s3*.7),0,1); mix(brow*.94,HAIR*.9,.6); hairH+=brow*.0004; hairm=np.maximum(hairm,brow)
    lp=sm(.3,.8,F('lips')); mix(lp*.78,hexc('#a4605a')*(1+T.nq((x*700,z*90),96)[:,:,None]*.25),.34)
    rough+=lp*.10; lipH=-lp*.00016*(1-np.abs(2*T.nq((x*520,z*60),97)))**2
    skinm=np.clip(skinm-hairm,0,1)
    # largo del pelo para las capas de volumen de finish.py (geo.hair_shells): 255 = 20 mm
    hlen=np.maximum.reduce([np.clip(al_,0,1)*sm(.15,.6,hm)*STY.get('hairlen',.010)*(.30+.70*sidefade)*(1+s1*.5),beard*(.0015+.006*STY['beard'])*(STY['beard']>.35),brow*.0022])
    Image.fromarray((np.clip(hlen/.02,0,1)*cov*255+.5).astype(np.uint8)[::-1]).resize((2048,2048),Image.BILINEAR).save(OUT+'hair_len.png')   # con barba rala (<0,35) la barba queda solo en la textura
    # ================= TIZA (magnesio) =================
    cn=np.clip(.5+T.n3(55,100,3)*2.6,0,1); cf=np.clip(.5+T.n3(700,101,2)*3,0,1); chalk=np.zeros((R,R),f32)
    for side,(hand,pf,fl,t,th,L,r) in hands.items():
        chalk=np.maximum(chalk,hand*(.30+.70*pf/np.maximum(hand,1e-3))*(.35+.65*cn)*(.55+.45*cf))
        chalk=np.maximum(chalk,fl*sm(.70,.80,t)*sm(1.1,1.0,t)*cn*cf*.35)
    smear=sm(.0,.38,T.n3(26,102,3,(1,1,.22))+.08)*np.clip(.3+cn,0,1)
    thf=sm(.45,.55,F('thigh'))*sm(.1,-.4,ny)*sm(knee[2]+.11,knee[2]+.17,z)*sm(hip[2]+.02,hip[2]-.06,z)
    thf*=np.exp(-(((axo-knee[0])/.06)**2)); soft=blur(thf*smear,7*S)*(.45+.55*cf)*.42
    smh=sm(.0,.36,T.n3(30,103,3,(.25,.25,1))+.06)*cn
    soft=np.maximum(soft,blur(sm(sh[2]-.035,sh[2]+.0,z)*sm(sh[2]+.085,sh[2]+.05,z)*sm(.2,-.3,ny)*sm(.22,.17,axo)*(1-head)*(1-farm)*smh,7*S)*(.45+.55*cf)*.42*skinm)
    chalk=np.maximum(chalk,soft*cov)
    chalk=np.clip(chalk*STY.get('chalk',1.),0,.93)*cov
    mix(chalk,np.array([.93,.93,.91],f32)*(1+cf[:,:,None]*.05-.03),.93)
    chalkH=chalk*(.00012+cf*.00018)
    # ================= SUDOR =================
    sw=skinm*np.clip(tzone*1.0+head*.35+chest*.8+sm(.3,.8,nz)*sm(sh[2]-.06,sh[2]+.02,z)*(1-head)*.9+sm(sh[2]-.3,sh[2]-.05,z)*(ny>.2)*(axo<.2)*.6+.18,0,1)*(1-chalk)
    sw*=STY.get('sweat',1.); rough-=sw*.14
    rng=np.random.default_rng(5); dp=np.zeros((R,R),f32)
    for dens,sig,wt in ((.00030,1.5,1.),(.0010,.9,.6)):
        pts=(rng.random((R,R),dtype=f32)<dens/(S*S)*np.clip(sw-.25,0,1)).astype(f32); b_=blur(pts,sig*S); dp=np.maximum(dp,np.clip(b_/(b_.max()*.55+1e-9),0,1)*wt)
    dp=sm(.25,.8,dp)*skinm*(1-.7*head); rough+=(.07-rough)*dp      # gotas: solo brillo y relieve, sin oscurecer
    # ================= COMPOSICIÓN =================
    rough=np.where(cloth>.5,np.clip(rough,.3,.95),np.clip(rough,.16,.92))
    edge=blur(cloth,1.2*S)                                                            # borde de prenda apenas biselado
    am=np.clip((1-cloth)+suit*.75+slv*.30+sock*.5-wrapm,0,1)*(1-hairm)                  # cuánto del relieve muscular deja ver cada prenda
    H=skinH*(1-cloth)+lipH+(thick+H)*edge+hairH+chalkH+dp*.00013+anatH*am
    del skinH,lipH,hairH,chalkH
    nrm=normal_from_height(H,T.su,T.sv,T.ok)
    cavA=np.clip(1+anatC*am*(115/K),.70,1.05); del anatC                              # los surcos entre grupos musculares oscurecen (son anchos: el pasa-altos de 3 px no los ve)
    cav=np.clip(1+(H-blur(H,3*S))*900,0.55,1.1); ao=np.clip((.12+.88*T.ao)*cav*cavA,0,1)
    tn=np.array([.50,.34,.31],f32); aoc=.45+.55*T.ao*np.clip(cav,0,1)*cavA; col=col*(tn[None,None,:]+(1-tn[None,None,:])*aoc[:,:,None])
    col=np.clip(col,0,1); col[~cov]=SKIN; nrm[~cov]=(.5,.5,1); rough[~cov]=.5; ao[~cov]=1
    save(col[::-1],OUT+'body_color.png',compress_level=3); save(nrm[::-1],OUT+'body_normal.png',compress_level=3)
    save(np.stack([ao,rough,np.zeros_like(rough)],2)[::-1],OUT+'body_orm.png',compress_level=3)
    MR=min(R,2048); mk=np.stack([skinm*cov,cloth*cov,hairm*cov],2)[::-1]
    Image.fromarray((np.clip(mk,0,1)*255+.5).astype(np.uint8)).resize((MR,MR),Image.BILINEAR).save(OUT+'body_mask.png',optimize=True)
    pv=np.concatenate([np.asarray(Image.open(OUT+n).convert('RGB').resize((640,640),Image.BILINEAR)) for n in ('body_color.png','body_normal.png','body_orm.png','body_mask.png')],1); Image.fromarray(pv).save(OUT+'tex_preview.png')
    log(f'TEX {NAME}: body_color/orm/normal {R}px, máscara {MR}px, tiza {chalk.mean()/cov.mean()*100:.1f}% sudor {dp.mean()/cov.mean()*100:.2f}%')

# ---------- atlas chicos: ojo, zapatilla, cinturón ----------
def _rect(Sz,r,Sy=None):
    Sy=Sy or Sz; u0,v0,u1,v1=r; j0,j1=int(round(u0*Sz)),int(round(u1*Sz)); i0,i1=int(round(v0*Sy)),int(round(v1*Sy))
    b,a=np.mgrid[0:i1-i0,0:j1-j0].astype(f32); return (slice(i0,i1),slice(j0,j1)),(a+.5)/(j1-j0),(b+.5)/(i1-i0)
def tn(shape,cell,seed,aspect=1.):
    """Ruido 2D; cell = tamaño de celda en píxeles (aspect estira en u)."""
    h,w=shape; rng=np.random.default_rng(seed); k=(max(2,int(h/cell)),max(2,int(w/(cell*aspect))))
    return np.asarray(Image.fromarray(rng.random(k,dtype=f32)).resize((w,h),Image.BICUBIC))-.5
_dash=lambda s_,per=.004:(((s_/per)%1)>.4).astype(f32)
def eye(OUT,STY,S=1024):
    yy,xx=np.mgrid[0:S,0:S].astype(f32); v=1-(yy+.5)/S; u=(xx+.5)/S; rho=(1-v)/.155            # 0 centro de la pupila, 1 limbo
    def pn(fu,fr,seed):     # ruido periódico en u
        k=np.random.default_rng(seed).random((max(2,int(fr)),int(fu)),dtype=f32); k=np.concatenate([k,k[:,:1]],1)
        return np.asarray(Image.fromarray(k).resize((S+S//int(fu),S),Image.BICUBIC))[:,:S]-.5
    sc=np.array([.93,.915,.885],f32)*(1-.10*sm(.75,.3,v))[:,:,None]*np.ones((S,S,3),f32)
    pink=sm(1.4,3.2,rho); sc*=1-pink[:,:,None]*np.array([.02,.10,.10],f32)
    vz=1-np.abs(2*pn(22,9,1)+pn(60,20,2)*.6); vein=sm(.86,.97,vz)*sm(1.15,2.0,rho)*(.35+.65*np.clip(pn(6,3,3)+.5,0,1)); sc+=(np.array([.72,.30,.27],f32)-sc)*(vein*.33)[:,:,None]
    ic=hexc(STY.get('iris','#5a3d24')); fib=pn(110,3,4)*.9+pn(260,6,5)*.6+pn(40,2,6)*.5
    ir=ic[None,None,:]*(1.0+fib*.9)[:,:,None]; ir*=(.62+.50*np.exp(-((rho-.42)/.16)**2))[:,:,None]                 # collarete más claro
    ir+=(np.array([.95,.62,.25],f32)*ic.max()*1.3-ir)*(np.exp(-((rho-.36)/.07)**2)*.35*np.clip(.5+pn(30,2,7)*2,0,1))[:,:,None]
    ir*=(1-.72*sm(.72,.98,rho))[:,:,None]                                                                     # anillo limbal oscuro
    ir*=(1-.5*np.clip(pn(14,4,8)*3-.6,0,1)*sm(.5,.8,rho))[:,:,None]                                           # criptas
    m=sm(1.04,.94,rho); e=sc*(1-m[:,:,None])+ir*m[:,:,None]; e*=(1-sm(.33+pn(40,1,9)*.02,.28,rho))[:,:,None]   # pupila
    e*=(1-.25*np.exp(-((rho-1.02)/.06)**2))[:,:,None]
    save(e,OUT+'eye.png')
def hair(OUT,STY,S=512,size=.024):
    """Mosaico RGBA de pelos vistos de punta (S px = 'size' m, se repite): lo usan las capas de volumen de pelo, barba y cejas."""
    rng=np.random.default_rng(7); n=int(420*(size*100)**2); a=np.zeros((S,S),f32); w=np.zeros((S,S),f32)
    i=rng.integers(0,S,n); j=rng.integers(0,S,n); np.add.at(a,(i,j),1.); np.add.at(w,(i,j),rng.random(n).astype(f32))
    fy=np.fft.fftfreq(S)[:,None]; fx=np.fft.fftfreq(S)[None,:]
    def pblur(q,sig): return np.real(np.fft.ifft2(np.fft.fft2(q)*np.exp(-2*(np.pi*sig)**2*(fx*fx+fy*fy)))).astype(f32)
    r=.00020/size*S; b=pblur(a,r*.55); al=sm(.30,.75,b/(1/(2*np.pi*(r*.55)**2))); tone=pblur(w,r*1.2)/np.maximum(pblur(a,r*1.2),1e-6)
    lo=pblur(rng.random((S,S)).astype(f32)-.5,S/12.); lo/=np.abs(lo).max()+1e-9
    c=hexc(STY['hair'])[None,None,:]*(.75+.7*tone+.25*lo)[:,:,None]+.05*al[:,:,None]
    Image.fromarray((np.clip(np.dstack([c,al]),0,1)*255+.5).astype(np.uint8),'RGBA').save(OUT+'hair.png')
def lash(OUT,STY,Sx=256,Sy=64):
    """Pestañas: u = a lo largo del párpado, v = 0 raíz … 1 punta."""
    rng=np.random.default_rng(9); v,u=np.mgrid[0:Sy,0:Sx].astype(f32); u=(u+.5)/Sx; v=(v+.5)/Sy; al=np.zeros((Sy,Sx),f32)
    for k in range(34):
        ui=(k+.5+rng.uniform(-.35,.35))/34; L=rng.uniform(.6,1.); tilt=rng.uniform(-.03,.03)+.05*(ui-.5)
        al=np.maximum(al,np.exp(-((u-ui-tilt*v*v)/(.0085*(1.15-.8*v/L)))**2)*sm(L,L-.3,v))
    al=np.maximum(al,sm(.10,.0,v)*.9); c=np.clip(hexc(STY['hair'])*.30,0,1)[None,None,:]*np.ones((Sy,Sx,3),f32)
    Image.fromarray((np.clip(np.dstack([c,al]),0,1)*255+.5).astype(np.uint8)[::-1],'RGBA').save(OUT+'lash.png')
def shoe(OUT,STY,Sz=2048):
    import shoes; UVR=shoes.UVR
    UP,SOLE,ACC,HEEL=[hexc(c) for c in STY['shoe']]; OUTS=SOLE*np.array([.50,.47,.42],f32); CH=np.array([.92,.92,.90],f32)
    col=np.zeros((Sz,Sz,3),f32); col[:]=UP; rough=np.full((Sz,Sz),.5,f32); met=np.zeros((Sz,Sz),f32); ao=np.ones((Sz,Sz),f32); nrm=np.zeros((Sz,Sz,3),f32); nrm[:]=(.5,.5,1)
    def put(sl,c,r,h,wu,wv,m=0.):
        col[sl]=np.clip(c,0,1); rough[sl]=np.clip(r,.05,1); met[sl]=m; nrm[sl]=normal_from_height(h.astype(f32),wu/h.shape[1],wv/h.shape[0]); ao[sl]=np.clip(1+(h-blur(h.astype(f32),3))*700,.5,1)
    L3=lambda a:a[:,:,None]
    # capellada: u = talón→punta (0,30 m), v = borde lateral→medial (0,26 m)
    sl,a,b=_rect(Sz,UVR['upper']); sh_=a.shape; g1=tn(sh_,2,1); g2=tn(sh_,10,2); g3=tn(sh_,40,3); s_=np.abs(b-.5)*2
    c=UP*(1+L3(g2)*.06+L3(g1)*.05+L3(g3)*.05)*np.ones(sh_+(3,),f32); r=.40+g1*.12+g3*.1; h=g1*.00005+g2*.00007
    f1=a-(.60-.06*s_**2); q=sm(.004,-.004,f1); h+=q*.0006
    for o in (-.012,-.026):
        st=np.exp(-((f1-o)/.0035)**2)*_dash(b*.26); h-=st*.0004; c*=1-.4*L3(st)
    # diseño genérico, sin marca: nada de franjas diagonales ni curvas en el lateral (se leían como un logo). Solo un refuerzo recto, paralelo a la suela, del color de la capellada, con pespunte
    bd=sm(.775,.79,s_)*sm(.94,.925,s_)*sm(.215,.225,a)*sm(.585,.575,a)*q; h+=bd*.00035; c*=1-.06*L3(bd)
    st=(np.exp(-((s_-.80)/.006)**2)*_dash(a*.30)+(np.exp(-((a-.232)/.004)**2)+np.exp(-((a-.568)/.004)**2))*_dash(b*.26))*bd; h-=st*.0003; c*=1-.3*L3(st)
    X=a*.30; Y=b*.26; gy=Y/.0052; row=np.floor(gy); fx=((X/.006+.5*(row%2))%1)-.5; fy=(gy%1)-.5
    pm=sm(.0011,.0007,np.hypot(fx*.006,fy*.0052))*sm(.63,.65,a)*sm(.79,.77,a)*sm(.48,.52,s_)*sm(.9,.84,s_); h-=pm*.0006; c*=1-.75*L3(pm); r+=pm*.3
    cz=(1-np.abs(2*tn(sh_,6,4,aspect=.25)))**2*sm(.58,.66,a)*sm(.84,.76,a); h-=cz*.00035
    st=np.exp(-((s_-.955)/.007)**2)*_dash(a*.30); h-=st*.0004; c*=1-.35*L3(st)
    dk=.25+.75*float(UP.mean()); dirt=(sm(.6,1.,s_)*np.clip(g3*3+.4,0,1)*.22+np.clip(tn(sh_,60,5)*3-.5,0,1)*.25)*dk;   # sobre cuero oscuro la tiza se nota menos
    c+=(CH-c)*L3(dirt); r+=dirt*.3
    put(sl,c,r,h,.30,.26)
    # canto de la suela: u = perímetro (0,78 m), v = 0 arriba … 1 piso
    sl,a,b=_rect(Sz,UVR['side']); sh_=a.shape; NT=46; s0=np.linspace(0,1,NT); ts=.5*(1-np.cos(np.pi*s0))/2+.5*s0; tp=np.concatenate([ts,ts[::-1][1:-1]]); n=len(tp)
    heel=sm(.58,.54,np.interp(a*n,np.arange(n+1),np.concatenate([tp,tp[:1]])).astype(f32)); wall=sm(.18,.21,b)*sm(.42,.39,b); g1=tn(sh_,2,6); gw=tn(sh_,3,7,aspect=30)
    lam=sm(.10,.02,np.abs((((b-.2)/.2*5)%1)-.5)-.38)*wall*heel
    c=SOLE*(1+L3(g1)*.05)*np.ones(sh_+(3,),f32); c+=(HEEL*(1+L3(gw)*.35)-c)*L3(wall*heel); c*=1-.45*L3(lam)
    out_=sm(.42,.45,b); c+=(OUTS*(1+L3(g1)*.08)-c)*L3(out_); r=.55+g1*.1+out_*.25-wall*heel*.12
    h=-lam*.0004+out_*sm(.55,.6,b)*np.sin(a*2*np.pi*200)*.00025+g1*.00003; dirt=np.clip(tn(sh_,30,8)*3-.3,0,1)*.3; c+=(CH-c)*L3(dirt)
    put(sl,c,r,h,.78,.03)
    # planta: dibujo en espiga; taco liso
    sl,a,b=_rect(Sz,UVR['bottom']); sh_=a.shape; g1=tn(sh_,2,9); zig=np.abs(((a*7)%1)-.5)*2; ln=sm(.45,.55,np.abs((((b*46+zig*1.3)%1)-.5)*2)); hl=sm(.38,.34,b)
    c=OUTS*(1+L3(g1)*.1)*np.ones(sh_+(3,),f32); c+=(HEEL*.8-c)*L3(hl); h=-ln*(1-hl)*.0012+g1*.00004; c*=1-.3*L3(ln*(1-hl)); dirt=np.clip(tn(sh_,25,10)*3,0,1)*.35; c+=(CH-c)*L3(dirt)
    put(sl,c,.8+g1*.1,h,.10,.30)
    # correa: u = ancho (27 mm), v = largo (0,2 m); cinta tejida con vivos
    sl,a,b=_rect(Sz,UVR['strap']); sh_=a.shape; g1=tn(sh_,2,11); rib=np.sin(a*2*np.pi*26); ed=np.maximum(sm(.10,.07,a),sm(.90,.93,a))
    c=ACC*(1+L3(rib)*.06+L3(g1)*.05)*np.ones(sh_+(3,),f32); c*=1-.3*L3(ed); h=rib*.00010+ed*.0003-np.exp(-((np.abs(a-.5)-.38)/.012)**2)*.0002+np.sin(b*2*np.pi*60)*.00004
    put(sl,c,.68+g1*.08,h,.027,.20)
    # contrafuerte: u = talón→adelante (9 cm), v = alrededor (0,25 m)
    sl,a,b=_rect(Sz,UVR['counter']); sh_=a.shape; g1=tn(sh_,2,12); g2=tn(sh_,14,13); c=HEEL*(1+L3(g1)*.04+L3(g2)*.05)*np.ones(sh_+(3,),f32); h=g1*.00002+g2*.00005   # talonera recta en el color del taco (el acento queda solo en la correa)
    for o in (.90,.95):
        st=np.exp(-((a-o)/.012)**2)*_dash(b*.25); h-=st*.0004; c*=1-.35*L3(st)
    dirt=np.clip(g2*3-.6,0,1)*.2; c+=(CH-c)*L3(dirt)
    put(sl,c,.34+g1*.08+dirt,h,.09,.25)
    # puntera
    sl,a,b=_rect(Sz,UVR['toecap']); sh_=a.shape; g1=tn(sh_,2,14); g2=tn(sh_,12,15); c=UP*(1+L3(g1)*.05+L3(g2)*.06)*np.ones(sh_+(3,),f32); h=g1*.00005+g2*.00006
    for o in (.05,.11):
        st=np.exp(-((a-o)/.012)**2)*_dash(b*.20); h-=st*.0004; c*=1-.4*L3(st)
    sc_=np.clip(tn(sh_,5,16,aspect=6)*3-.7,0,1)*sm(.5,.9,a); c+=(CH*.8-c)*L3(sc_*.5*dk)
    put(sl,c,.34+g1*.1+sc_*.3,h,.06,.20)
    # lengüeta: malla
    sl,a,b=_rect(Sz,UVR['tongue']); sh_=a.shape; g1=tn(sh_,2,17); X=a*.10; Y=b*.06; gy=Y/.0026; row=np.floor(gy); fx=((X/.003+.5*(row%2))%1)-.5; fy=(gy%1)-.5
    ho=sm(.0010,.0006,np.hypot(fx*.003,fy*.0026)); c=UP*.9*(1+L3(g1)*.06)*np.ones(sh_+(3,),f32); c*=1-.5*L3(ho); put(sl,c,.85+g1*.05,-ho*.0004,.10,.06)
    # ojalera y cuello
    sl,a,b=_rect(Sz,UVR['misc']); sh_=a.shape; g1=tn(sh_,2,18); g2=tn(sh_,8,19); put(sl,UP*.94*(1+L3(g1)*.06+L3(g2)*.06)*np.ones(sh_+(3,),f32),.5+g1*.12,g1*.00005+g2*.00008,.08,.04)
    # cordones trenzados
    sl,a,b=_rect(Sz,UVR['lace']); sh_=a.shape; br=np.sin(2*np.pi*(a*26+b*2))*np.sin(2*np.pi*(a*26-b*2)); put(sl,SOLE*(1+L3(br)*.10)*np.ones(sh_+(3,),f32),.8+br*.05,br*.00012,.07,.010)
    sl,a,b=_rect(Sz,UVR['metal']); put(sl,np.array([.78,.79,.81],f32)*np.ones(a.shape+(3,),f32),.32+tn(a.shape,2,20)*.1,np.zeros(a.shape,f32),.01,.01,1.)
    sl,a,b=_rect(Sz,UVR['tab']); rib=np.sin(a*2*np.pi*12); put(sl,ACC*(1+L3(rib)*.08)*np.ones(a.shape+(3,),f32),.7+rib*.05,rib*.0001,.012,.03)
    save(col[::-1],OUT+'shoe_color.png'); save(nrm[::-1],OUT+'shoe_normal.png'); save(np.stack([ao,rough,met],2)[::-1],OUT+'shoe_orm.png')
def belt(OUT,STY,Sx=2048,Sy=256):
    if not STY.get('belt'): return
    BC=hexc(STY['belt']); b,a=np.mgrid[0:Sy,0:Sx].astype(f32); a=(a+.5)/Sx; b=(b+.5)/Sy; sh_=a.shape; g1=tn(sh_,2,30); g2=tn(sh_,7,31); g3=tn(sh_,50,32,aspect=3); L3=lambda q:q[:,:,None]
    fv=(b-.06)/.88; face=sm(-.01,.02,fv)*sm(1.01,.98,fv)                                   # cara exterior: 8,5 cm de alto; u = 0,9 m de vuelta
    c=BC*(1+L3(g1)*.10+L3(g2)*.12+L3(g3)*.14)*np.ones(sh_+(3,),f32); h=g1*.00006+g2*.00012; r=.56+g1*.1+g3*.12
    burn=np.maximum(sm(.10,.0,fv),sm(.90,1.,fv)); c*=1-.35*L3(burn); r-=burn*.15
    for o in (.085,.915):
        st=np.exp(-((fv-o)/.012)**2)*_dash(a*.9,.0055)*face; h-=st*.0005; c+=(np.array([.78,.72,.6],f32)-c)*L3(st*.75)
        gr=np.exp(-((fv-o)/.02)**2)*face; h-=gr*.00015
    for k in range(5):
        ho=sm(.0032,.0024,np.hypot((a-(.045+.026*k))*.9,(fv-.5)*.085)); h-=ho*.0012; c*=1-.8*L3(ho)
    wear=np.clip(g3*3-.5,0,1)*face; c*=1+.25*L3(wear); r+=wear*.12
    cr=(1-np.abs(2*tn(sh_,5,33,aspect=.2)))**3*np.clip(tn(sh_,80,34)*3,0,1); h-=cr*.0002
    c=np.clip(c,0,1); n=normal_from_height(h,.9/Sx,.085/(.88*Sy)); ao=np.clip(1+(h-blur(h,3))*600,.5,1)
    save(c[::-1],OUT+'belt_color.png'); save(n[::-1],OUT+'belt_normal.png'); save(np.stack([ao,np.clip(r,.2,1),np.zeros_like(r)],2)[::-1],OUT+'belt_orm.png')

if __name__=='__main__':
    HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from style import STYLES
    NAME=sys.argv[1]; OUT=os.path.join(os.environ.get('TARIMA_OUT') or os.path.join(os.path.dirname(HERE),'out'),NAME)+os.sep; STY=STYLES[NAME]
    FONT=next(p for p in [os.environ.get('TARIMA_FONT',''),'/System/Library/Fonts/Supplemental/Arial Bold.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if p and os.path.exists(p))
    R=int(sys.argv[2]) if len(sys.argv)>2 else None; what=sys.argv[3].split(',') if len(sys.argv)>3 else ['body','eye','shoe','belt','hair','lash']
    if 'body' in what: body(NAME,OUT,STY,STY['H']/1.687,FONT,R)
    for k in ('eye','shoe','belt','hair','lash'):
        if k in what and k in globals(): globals()[k](OUT,STY)
