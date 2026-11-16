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
# Proporciones como metas (fracción de la estatura entre articulaciones del esqueleto): qué target de MPFB mueve cada una y cuánto
# cambia la medida por unidad de target (estimación inicial; se corrige con lo medido en cada vuelta).
PROP=dict(femur=('legs/{s}-upperleg-scale-vert',.105),tibia=('legs/{s}-lowerleg-scale-vert',.06),brazo=('arms/measure-{p}arm-length',.09),hombros=('torso/measure-shoulder-dist',.035))
def build(name,probe=False):
    """Cuerpo y esqueleto del pesista. Si trae 'metas' de proporciones, rearma el cuerpo (hasta 5 veces, unos segundos cada una)
    corrigiendo los targets de largo hasta que el esqueleto las cumple a menos de 2 milésimas de la estatura."""
    cfg=CFG[name]; metas=cfg.get('metas')
    if not metas: return _build(name,cfg,{})[:2]
    x={k:0. for k in metas}; sens={k:PROP[k][1] for k in metas}; xp=mp=None
    for it in range(5):
        if it: boot()
        b,rig,med=_build(name,cfg,x); err={k:metas[k]-med[k] for k in metas}; peor=max(abs(e) for e in err.values())
        print(f"PROP {name} vuelta {it+1}: "+' · '.join(f"{k} {med[k]:.3f} (meta {metas[k]:.3f}, target {x[k]:+.2f})" for k in metas),flush=True)
        if peor<.002 or it==4: break
        if xp:
            for k in metas:
                dx=x[k]-xp[k]; dm=med[k]-mp[k]
                if abs(dx)>.02 and dm/dx>0: sens[k]=min(max(dm/dx,PROP[k][1]*.3),PROP[k][1]*3)
        xp=dict(x); mp=dict(med); x={k:max(-1.,min(1.,x[k]+err[k]/sens[k])) for k in metas}
    fuera=[k for k in metas if abs(err[k])>=.004]
    if fuera: print(f"PROP {name}: NO ALCANZA la meta en {fuera} (el target de MPFB llegó a su tope o no converge)")
    return b,rig
def _build(name,cfg,x):
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
        TS.load_target(b,os.path.join(T,p+'.target.gz'),weight=w)
        nuevos=[k.name for k in b.data.shape_keys.key_blocks if k.name not in antes]
        if nuevos: KEYS[p]=nuevos[0]
    def pm(base,w): tg(base+('-incr' if w>0 else '-decr'),abs(w))
    M=cfg.get('musc',MUSC0)
    for s in 'lr':
        tg(f'legs/{s}-upperleg-muscle-incr',M['pierna']); tg(f'legs/{s}-lowerleg-muscle-incr',M['gemelo'])
        tg(f'arms/{s}-upperarm-shoulder-muscle-incr',M['hombro']); tg(f'arms/{s}-upperarm-muscle-incr',M['brazo']); tg(f'arms/{s}-lowerarm-muscle-incr',M['antebrazo'])   # físico de levantador: volumen de deltoides, brazo y antebrazo (no cambia largos)
        pm(f'legs/{s}-upperleg-scale-vert',cfg['legs']['up']+x.get('femur',0)); pm(f'legs/{s}-lowerleg-scale-vert',cfg['legs']['low']+x.get('tibia',0))
    pm('arms/measure-upperarm-length',cfg['arms']['up']+x.get('brazo',0)); pm('arms/measure-lowerarm-length',cfg['arms']['low']+x.get('brazo',0)); pm('torso/torso-scale-vert',cfg['torso'])
    if x.get('hombros'): pm('torso/measure-shoulder-dist',x['hombros'])
    tg('torso/torso-muscle-pectoral-incr',M['pectoral']); tg('torso/torso-muscle-dorsi-incr',M['dorsal']); tg('stomach/stomach-tone-incr',M['abdomen']); tg('neck/measure-neck-circ-incr',M['cuello'])
    for p,w in cfg['extra']+cfg.get('face',[]): tg(p,w)
    H=cfg['height']; rho=cfg.get('rho',1.05)
    if cfg.get('masa'):
        # La categoría manda: se busca el macro 'weight' de MPFB con el que la masa estimada da la del pesista. Si con el máximo no
        # alcanza (categorías abiertas), se suma de a poco el paquete 'volumen' (tronco, cadera, muslos y brazos más gruesos).
        goal=cfg['masa']; ms=lambda:masa_estimada(b,H,rho)[0]
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
            setg(1.)
            g=bis(lambda x:(setg(x),ms())[1],0.,1.) if ms()>goal else 1.
            setg(g)
        m,v=masa_estimada(b,H,rho)
        print(f"MASA {name}: {m:.1f} kg estimados (objetivo {goal:.1f} kg, categoría {cfg.get('categoria')} {cfg.get('genero')}) · volumen {v:.1f} l x {rho:.3f} kg/l · IMC {m/H**2:.1f} · macro weight={w:.3f} (rango {mmax:.0f} kg con 1) · paquete de volumen={g:.2f}"+('' if abs(m-goal)<.03*goal else ' · NO ALCANZA el objetivo'))
    else:
        try: m,v=masa_estimada(b,H,rho); print(f"MASA {name}: {m:.1f} kg estimados (sin objetivo: cuerpo fijado a mano) · volumen {v:.1f} l x {rho:.3f} kg/l · IMC {m/H**2:.1f}")
        except Exception as e: print('MASA',name,'sin dato:',e)
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
    print(f'MEASURE {name}: H={H:.2f} femur={fem:.3f} ({fem/H:.3f}) tibia={tib:.3f} ({tib/H:.3f}) torso={tor:.3f} ({tor/H:.3f}) arm={ua+fa:.3f} ({(ua+fa)/H:.3f}) fem/tor={fem/tor:.2f} shW={P("LeftArm").x*2:.3f} ankle_x={P("LeftFoot").x:.3f}')
    return b,rig,dict(femur=fem/H,tibia=tib/H,brazo=(ua+fa)/H,hombros=P('LeftArm').x*2/H)
if __name__=='__main__':
    boot()
    for n in CFG: build(n,True)
