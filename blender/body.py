import bpy, os, sys, bmesh, json, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from common import *
from mathutils import Vector
CFG={
 'ventura':dict(height=1.70,macro=dict(gender=1.0,age=.5,muscle=1.0,weight=.62,height=.4,proportions=.8,african=.15,asian=.15,caucasian=.7),
   legs=dict(up=-.05,low=-.3),arms=dict(up=.15,low=.12),torso=.4,extra=[('torso/torso-vshape-incr',.3),('buttocks/buttocks-volume-incr',.6),('torso/measure-shoulder-dist-incr',.35)],
   # estructura de la cara (ficticia): cabeza cuadrada, mandíbula ancha, pómulos marcados, nariz corta y ancha
   face=[('head/head-square',.55),('chin/chin-width-incr',.5),('chin/chin-bones-incr',.4),('nose/nose-width2-incr',.4),('nose/nose-scale-vert-decr',.3),('cheek/l-cheek-bones-incr',.5),('cheek/r-cheek-bones-incr',.5),('forehead/forehead-nubian-incr',.3),('eyebrows/eyebrows-trans-down',.4)]),
 'brenner':dict(height=1.83,macro=dict(gender=1.0,age=.5,muscle=1.0,weight=.5,height=.6,proportions=.75,african=.0,asian=.0,caucasian=1.0),
   legs=dict(up=.4,low=.25),arms=dict(up=.6,low=.45),torso=0,extra=[('torso/torso-vshape-incr',.45),('buttocks/buttocks-volume-incr',.4),('torso/measure-shoulder-dist-incr',.6)],
   # cara larga y angulosa: mentón prominente con hoyuelo, nariz larga con caballete, mejillas hundidas
   face=[('head/head-rectangular',.5),('chin/chin-prominent-incr',.45),('chin/chin-cleft-incr',.5),('chin/chin-height-incr',.3),('nose/nose-hump-incr',.45),('nose/nose-scale-vert-incr',.35),('nose/nose-width2-decr',.3),('cheek/l-cheek-volume-decr',.4),('cheek/r-cheek-volume-decr',.4),('forehead/forehead-temple-decr',.3),('eyebrows/eyebrows-angle-down',.3)]),
}
def build(name,probe=False):
    cfg=CFG[name]
    HS=di('mpfb.services.humanservice','HumanService'); TS=di('mpfb.services.targetservice','TargetService'); HP=di('mpfb.entities.objectproperties','HumanObjectProperties'); LS=di('mpfb.services.locationservice','LocationService')
    b=HS.create_human()
    for k,v in cfg['macro'].items(): HP.set_value(k,v,entity_reference=b)
    TS.reapply_macro_details(b)
    T=LS.get_mpfb_data('targets')
    def tg(p,w):
        if abs(w)<1e-6: return
        TS.load_target(b,os.path.join(T,p+'.target.gz'),weight=w)
    def pm(base,w): tg(base+('-incr' if w>0 else '-decr'),abs(w))
    for s in 'lr':
        tg(f'legs/{s}-upperleg-muscle-incr',1.0); tg(f'legs/{s}-lowerleg-muscle-incr',.6)
        tg(f'arms/{s}-upperarm-shoulder-muscle-incr',1.0); tg(f'arms/{s}-upperarm-muscle-incr',.85); tg(f'arms/{s}-lowerarm-muscle-incr',.8)   # físico de levantador: volumen de deltoides, brazo y antebrazo (no cambia largos)
        pm(f'legs/{s}-upperleg-scale-vert',cfg['legs']['up']); pm(f'legs/{s}-lowerleg-scale-vert',cfg['legs']['low'])
    pm('arms/measure-upperarm-length',cfg['arms']['up']); pm('arms/measure-lowerarm-length',cfg['arms']['low']); pm('torso/torso-scale-vert',cfg['torso'])
    tg('torso/torso-muscle-pectoral-incr',.85); tg('torso/torso-muscle-dorsi-incr',.8); tg('stomach/stomach-tone-incr',.5); tg('neck/measure-neck-circ-incr',.7)
    for p,w in cfg['extra']+cfg.get('face',[]): tg(p,w)
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
    return b,rig
if __name__=='__main__':
    boot()
    for n in CFG: build(n,True)
