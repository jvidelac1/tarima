import bpy, os, sys, bmesh, json, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from common import *
from mathutils import Vector
import plantel
CFG=plantel.CFGS   # parámetros de cuerpo por pesista: salen de blender/plantel.py (ventura y brenner quedan como estaban)
# peso de los targets de grupos musculares de MPFB cuando el pesista no trae 'musc' (los dos originales)
MUSC0=dict(pierna=1.0,gemelo=.6,hombro=1.0,brazo=.85,antebrazo=.8,pectoral=.85,dorsal=.8,abdomen=.5,cuello=.7)
def _mix(b):
    """Posiciones con los targets aplicados según su valor actual (antes de hornearlos son shape keys relativas a la base)."""
    me=b.data; n=len(me.vertices); sk=me.shape_keys
    if sk is None:
        a=np.empty(n*3); me.vertices.foreach_get('co',a); return a.reshape(n,3)
    kb=sk.key_blocks; base=np.empty(n*3); kb[0].data.foreach_get('co',base); co=base.copy(); a=np.empty(n*3)
    for k in kb[1:]:
        if abs(k.value)>1e-6 and not k.mute: k.data.foreach_get('co',a); co+=(a-base)*k.value
    return co.reshape(n,3)
def _tris(b):
    """Triángulos de la piel (grupo 'body' del mallado base: sin ojos, dientes ni geometría auxiliar) y sus vértices."""
    me=b.data; gi=b.vertex_groups['body'].index; inb=np.zeros(len(me.vertices),bool)
    for v in me.vertices: inb[v.index]=any(g.group==gi for g in v.groups)
    T=[]
    for p in me.polygons:
        vs=list(p.vertices)
        if all(inb[i] for i in vs): T+=[(vs[0],vs[i],vs[i+1]) for i in range(1,len(vs)-1)]
    return np.array(T),inb
def masa_estimada(b,H,rho,cache={}):
    """Masa (kg) del cuerpo actual llevado a la estatura H: volumen encerrado por la piel x densidad media (kg/l)."""
    key=b.name_full+str(b.as_pointer())
    if key not in cache: cache.clear(); cache[key]=_tris(b)
    T,inb=cache[key]; co=_mix(b); z=co[inb,2]; k=H/(z.max()-z.min()); P=co*k
    v=abs(float(np.einsum('ij,ij->i',P[T[:,0]],np.cross(P[T[:,1]],P[T[:,2]])).sum())/6.)
    return v*1000*rho,v*1000
# Proporciones como metas (fracción de la estatura entre articulaciones del esqueleto). Cada una tiene su target de MPFB:
# femur -> legs/*-upperleg-scale-vert, tibia -> legs/*-lowerleg-scale-vert, brazo -> arms/measure-upperarm-length y -lowerarm-length,
# hombros -> torso/measure-shoulder-dist, antebrazo (parte del brazo que es antebrazo) -> diferencia entre los dos largos del brazo. Están acopladas (alargar el fémur a estatura fija achica todo lo demás), así que se resuelven juntas.
def build(name,probe=False):
    """Cuerpo y esqueleto del pesista. Si trae 'metas' de proporciones, rearma el cuerpo unas 8 veces (segundos cada una): mide cuánto
    mueve cada target (jacobiano por diferencias) y corrige (Newton con actualización de Broyden) hasta que el esqueleto las cumple.
    Si un target llega a su tope, queda lo más cerca que se puede y la línea PROP lo dice."""
    cfg=CFG[name]; metas=cfg.get('metas')
    if not metas:
        b,rig,_,lines=_build(name,cfg,{}); print('\n'.join(lines)); return b,rig
    ks=list(metas); goal=np.array([metas[k] for k in ks]); n=len(ks); cnt=[0]
    def run(x):
        if cnt[0]: boot()
        cnt[0]+=1; b,rig,med,lines=_build(name,cfg,dict(zip(ks,[float(v) for v in x]))); return b,rig,np.array([med[k] for k in ks]),lines
    x=np.zeros(n); b,rig,r,lines=run(x); en=x.copy(); J=np.zeros((n,n))
    for i in range(n):
        xi=x.copy(); xi[i]=.35 if goal[i]>=r[i] else -.35; _,_,ri,_=run(xi); J[:,i]=(ri-r)/xi[i]; en=xi
    libre=np.ones(n,bool)     # una meta cuyo target llegó al tope se suelta: no se compensa deformando las otras
    for it in range(6):
        err=goal-r
        if not libre.any() or np.abs(err[libre]).max()<.0015: break
        dx=np.zeros(n); dx[libre]=np.linalg.solve(J[np.ix_(libre,libre)]+1e-9*np.eye(int(libre.sum())),err[libre]); xn=x+dx; tope=(np.abs(xn)>1)&libre; xn=np.clip(xn,-1,1)
        b,rig,rn,lines=run(xn); en=xn; s_=xn-x
        if s_@s_>1e-6: J+=np.outer((rn-r)-J@s_,s_)/(s_@s_)
        x,r=xn,rn; libre&=~tope
    if not np.array_equal(en,x): b,rig,r,lines=run(x)
    err=goal-r; print('\n'.join(lines))
    print(f"PROP {name}: "+' · '.join(f"{k} {r[i]:.3f} (meta {goal[i]:.3f}, target {x[i]:+.2f})" for i,k in enumerate(ks))+f" · {cnt[0]} armados"+(''.join(f" · {k} NO ALCANZA la meta (queda a {err[i]*100:+.1f} % de la estatura)" for i,k in enumerate(ks) if abs(err[i])>=.004)),flush=True)
    return b,rig
DVOL={}   # por pesista: volumen (m3) del relieve muscular medido en el armado anterior
def _build(name,cfg,x):
    lines=[]; say=lambda t:lines.append(t)
    HS=di('mpfb.services.humanservice','HumanService'); TS=di('mpfb.services.targetservice','TargetService'); HP=di('mpfb.entities.objectproperties','HumanObjectProperties'); LS=di('mpfb.services.locationservice','LocationService')
    b=HS.create_human()
    for k,v in cfg['macro'].items(): HP.set_value(k,v,entity_reference=b)
    TS.reapply_macro_details(b)
    T=LS.get_mpfb_data('targets'); KEYS={}; KB=lambda p:b.data.shape_keys.key_blocks[KEYS[p]]
    def tg(p,w):
        """Carga un target (o suma al que ya estaba) y recuerda el nombre de su shape key."""
        if abs(w)<1e-6: return
        if p in KEYS: KB(p).value=min(1.,KB(p).value+w); return
        antes={k.name for k in b.data.shape_keys.key_blocks} if b.data.shape_keys else set()
        if not os.path.exists(os.path.join(T,p+'.target.gz')): print('TARGET no existe (se saltea):',p); return
        TS.load_target(b,os.path.join(T,p+'.target.gz'),weight=w)
        nuevos=[k.name for k in b.data.shape_keys.key_blocks if k.name not in antes]
        if nuevos: KEYS[p]=nuevos[0]
    def pm(base,w): tg(base+('-incr' if w>0 else '-decr'),abs(w))
    M=cfg.get('musc',MUSC0)
    for s in 'lr':
        tg(f'legs/{s}-upperleg-muscle-incr',M['pierna']); tg(f'legs/{s}-lowerleg-muscle-incr',M['gemelo'])
        tg(f'arms/{s}-upperarm-shoulder-muscle-incr',M['hombro']); tg(f'arms/{s}-upperarm-muscle-incr',M['brazo']); tg(f'arms/{s}-lowerarm-muscle-incr',M['antebrazo'])   # físico de levantador: volumen de deltoides, brazo y antebrazo (no cambia largos)
        pm(f'legs/{s}-upperleg-scale-vert',cfg['legs']['up']+x.get('femur',0)); pm(f'legs/{s}-lowerleg-scale-vert',cfg['legs']['low']+x.get('tibia',0))
    pm('arms/measure-upperarm-length',max(-1.,min(1.,cfg['arms']['up']+x.get('brazo',0)-x.get('antebrazo',0)))); pm('arms/measure-lowerarm-length',max(-1.,min(1.,cfg['arms']['low']+x.get('brazo',0)+x.get('antebrazo',0)))); pm('torso/torso-scale-vert',cfg['torso'])
    if x.get('hombros'): pm('torso/measure-shoulder-dist',x['hombros'])
    tg('torso/torso-muscle-pectoral-incr',M['pectoral']); tg('torso/torso-muscle-dorsi-incr',M['dorsal']); tg('stomach/stomach-tone-incr',M['abdomen']); tg('neck/measure-neck-circ-incr',M['cuello'])
    for p,w in cfg['extra']+cfg.get('face',[]): tg(p,w)
    H=cfg['height']; rho=cfg.get('rho',1.05)
    if cfg.get('masa'):
        # La categoría manda: se busca el macro 'weight' de MPFB con el que la masa estimada da la del pesista. Si con el máximo no
        # alcanza (categorías abiertas), se suma de a poco el paquete 'volumen' (tronco, cadera, muslos y brazos más gruesos).
        dv=DVOL.get(name,0.)*1000*rho; goal=cfg['masa']-dv; ms=lambda:masa_estimada(b,H,rho)[0]     # dv: masa que después suma el relieve muscular (físico anatómico)
        def setw(w): HP.set_value('weight',float(w),entity_reference=b); TS.reapply_macro_details(b)
        def bis(f,lo,hi,n=7):
            for _ in range(n):
                mid=(lo+hi)/2
                if f(mid)<goal: lo=mid
                else: hi=mid
            return (lo+hi)/2
        w=1.; g=0.; setw(1.); mmax=ms()
        if mmax>goal:
            setw(0.); mmin=ms()
            w=0. if mmin>=goal else bis(lambda x:(setw(x),ms())[1],0.,1.)
            setw(w)
        else:
            base={}
            for p,wt in cfg.get('volumen',[]):
                if p not in KEYS: tg(p,1e-4)
                if p in KEYS: base[p]=KB(p).value
            def setg(x):
                for p,wt in cfg.get('volumen',[]):
                    if p in base: KB(p).value=min(1.,base[p]+x*wt)
            GMAX=1.8; setg(GMAX)     # cada target del paquete topa en 1
            g=bis(lambda x:(setg(x),ms())[1],0.,GMAX) if ms()>goal else GMAX
            setg(g)
        m,v=masa_estimada(b,H,rho)
        say(f"MASA {name}: {m+dv:.1f} kg estimados"+(f" ({m:.1f} del cuerpo base + {dv:.1f} del relieve muscular)" if dv else '')+f" (objetivo {cfg['masa']:.1f} kg, categoría {cfg.get('categoria')} {cfg.get('genero')}) · volumen {v:.1f} l x {rho:.3f} kg/l · IMC {m/H**2:.1f} · macro weight={w:.3f} (rango {mmax:.0f} kg con 1) · paquete de volumen={g:.2f}"+('' if abs(m-goal)<.03*goal else ' · NO ALCANZA el objetivo'))
    else:
        try: m,v=masa_estimada(b,H,rho); say(f"MASA {name}: {m:.1f} kg estimados (sin objetivo: cuerpo fijado a mano) · volumen {v:.1f} l x {rho:.3f} kg/l · IMC {m/H**2:.1f}")
        except Exception as e: say(f'MASA {name} sin dato: {e}')
    TS.bake_targets(b)
    me=b.data
    zs=[v.co.z for v in me.vertices]; gi={g.name:g.index for g in b.vertex_groups}; body=gi['body']
    zb=[v.co.z for v in me.vertices if any(g.group==body for g in v.groups)]
    z0=min(zb); k=cfg['height']/(max(zb)-z0)
    for v in me.vertices: v.co=Vector((v.co.x*k,v.co.y*k,(v.co.z-z0)*k))
    me.update()
    rig=HS.add_builtin_rig(b,'mixamo')
    BN={x.name[10:]:x for x in rig.data.bones}; P=lambda n:BN[n].head_local
    H=cfg['height']; fem=(P('LeftLeg')-P('LeftUpLeg')).length; tib=(P('LeftFoot')-P('LeftLeg')).length; ua=(P('LeftForeArm')-P('LeftArm')).length; fa=(P('LeftHand')-P('LeftForeArm')).length; tor=P('LeftArm').z-P('LeftUpLeg').z
    say(f'MEASURE {name}: H={H:.2f} femur={fem:.3f} ({fem/H:.3f}) tibia={tib:.3f} ({tib/H:.3f}) torso={tor:.3f} ({tor/H:.3f}) arm={ua+fa:.3f} ({(ua+fa)/H:.3f}) fem/tor={fem/tor:.2f} shW={P("LeftArm").x*2:.3f} ankle_x={P("LeftFoot").x:.3f}')
    cm_=cfg.get('cabeza_meta')
    if cm_:
        # cabeza a escala del cuerpo: se mide (coronilla a mentón) y se escala pareja alrededor de la articulación de la cabeza hasta estatura / cabeza_meta,
        # con el peso del hueso Head (el cuello acompaña en degradé). Los targets head-scale-* de MPFB la deforman (aplastan la coronilla); así conserva la cara de la ficha.
        gh=b.vertex_groups['mixamorig:Head'].index; gb_=b.vertex_groups['body'].index; pv=BN['Head'].head_local.copy(); wh={}
        for v in me.vertices:
            w=0.; inb=False
            for g in v.groups:
                if g.group==gh: w=g.weight
                elif g.group==gb_: inb=True
            if w>0: wh[v.index]=(w,inb)
        hv=[me.vertices[i].co for i,(w,inb) in wh.items() if inb and w>.6]; top=max(c.z for c in hv); yn=min(c.y for c in hv); chin=min(c.z for c in hv if abs(c.x)<.015 and c.y<yn+.045)
        kc=max(.88,min(1.10,(cfg['height']/cm_)/(top-chin)))
        for i,(w,inb) in wh.items(): v=me.vertices[i]; v.co=pv+(v.co-pv)*(1+(kc-1)*w)
        me.update(); say(f"CABEZA {name}: alto {(top-chin)*100:.1f} cm (estatura / {cfg['height']/(top-chin):.2f}) -> escala {kc:.3f} alrededor de la articulación (meta estatura / {cm_})")
    if cfg.get('fisico')=='anatomico':
        import geo,tex; S_=plantel.STYLES[name]; tex.ANAT.update(S_.get('anat',{})); me.update(); DVOL[name]=1.09*geo.anat_vol(b,rig,H/1.687,S_.get('cut',1.))     # 1,09: en la malla subdividida y con la normal alisada el relieve suma algo más que en la malla base (medido en la sonda: MASA2)
    return b,rig,dict(femur=fem/H,tibia=tib/H,brazo=(ua+fa)/H,hombros=P('LeftArm').x*2/H,antebrazo=fa/(ua+fa)),lines
if __name__=='__main__':
    boot()
    for n in CFG: build(n,True)
