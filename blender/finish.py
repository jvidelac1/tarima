import bpy, os, sys, bmesh, json, math, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFont, ImageFilter
NAME=sys.argv[1]; OUT=out_dir(NAME)
from style import STYLES
STY=STYLES[NAME]
FONT=next((p for p in [os.environ.get('TARIMA_FONT',''),'/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf','/System/Library/Fonts/Supplemental/Arial Bold.ttf','/Library/Fonts/Arial Bold.ttf','C:/Windows/Fonts/arialbd.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if p and os.path.exists(p)),None)
if FONT is None: raise SystemExit('Definí TARIMA_FONT con la ruta a una tipografía .ttf en negrita')
K=STY['H']/1.687
bpy.ops.wm.open_mainfile(filepath=OUT+'s3.blend')
b=bpy.data.objects['Human']; rig=bpy.data.objects['Human.rig']; me=b.data
LM={k:np.array(v) for k,v in json.load(open(OUT+'lm.json')).items()}; BJ=json.load(open(OUT+'bones.json'))
hexc=lambda h:np.array([int(h[i:i+2],16)/255 for i in (1,3,5)])
# ---------- texturas (blender/tex.py: albedo, ORM, normal y máscara; ojo, zapatilla y cinturón) ----------
# TARIMA_TEXR: resolución del cuerpo (por defecto la del horneado de make.py, 4096). TARIMA_KEEPTEX=1 reutiliza las ya generadas.
import tex
tex.ANAT.update(STY.get('anat',{}))   # relieve muscular del pesista: lo usan tex.body y geo.anatomy
json.dump({x.name[10:]:[list(x.head_local),list(x.tail_local)] for x in rig.data.bones if x.name.startswith('mixamorig:')},open(OUT+'bones_all.json','w'))
TEXS=(['bun.png','bun_normal.png'] if STY.get('bun') else [])+['body_color.png','body_orm.png','body_normal.png','body_mask.png','hair_len.png','hair.png','lash.png','eye.png','shoe_color.png','shoe_orm.png','shoe_normal.png']+(['belt_color.png','belt_orm.png','belt_normal.png'] if STY.get('belt') else [])
if not (os.environ.get('TARIMA_KEEPTEX') and all(os.path.exists(OUT+f) for f in TEXS)):
    tex.body(NAME,OUT,STY,K,FONT,int(os.environ.get('TARIMA_TEXR','0')) or None); tex.eye(OUT,STY); tex.shoe(OUT,STY); tex.belt(OUT,STY); tex.hair(OUT,STY); tex.lash(OUT,STY); tex.bun(OUT,STY); tex.pelo(OUT,STY)
else: print('TEX reutilizadas (TARIMA_KEEPTEX)')

# ---------- materiales ----------
_img={}
def img(path,data=False):
    if path not in _img:
        _img[path]=bpy.data.images.load(path)
        if data: _img[path].colorspace_settings.name='Non-Color'
    return _img[path]
def gltf_out():
    """Grupo 'glTF Material Output': el exportador toma de su entrada Occlusion el canal R del ORM."""
    ng=bpy.data.node_groups.get('glTF Material Output')
    if ng is None: ng=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree'); ng.interface.new_socket('Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    return ng
def texmat(name,cpath,ormpath=None,nrmpath=None,rough=.5,nstrength=1.0):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; bs=nt.nodes['Principled BSDF']
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=img(cpath); nt.links.new(t.outputs['Color'],bs.inputs['Base Color'])
    if ormpath:
        o=nt.nodes.new('ShaderNodeTexImage'); o.image=img(ormpath,True); sp=nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'],sp.inputs[0]); nt.links.new(sp.outputs[1],bs.inputs['Roughness']); nt.links.new(sp.outputs[2],bs.inputs['Metallic'])
        g=nt.nodes.new('ShaderNodeGroup'); g.node_tree=gltf_out(); nt.links.new(sp.outputs[0],g.inputs['Occlusion'])
    else: bs.inputs['Roughness'].default_value=rough
    if nrmpath:
        n=nt.nodes.new('ShaderNodeTexImage'); n.image=img(nrmpath,True); nm=nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=nstrength
        nt.links.new(n.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    return m
def alphamat(name,cpath,rough,double=False):
    """Material con alfa de la textura (glTF alphaMode BLEND): pelo en capas y pestañas."""
    m=texmat(name,cpath,rough=rough); nt=m.node_tree; t=next(n for n in nt.nodes if n.type=='TEX_IMAGE'); nt.links.new(t.outputs['Alpha'],nt.nodes['Principled BSDF'].inputs['Alpha'])
    for k,v in (('surface_render_method','BLENDED'),('blend_method','BLEND')):
        try: setattr(m,k,v)
        except Exception: pass
    m.use_backface_culling=not double; return m
def flat(name,h,rough):
    m=bpy.data.materials.new(name); m.use_nodes=True; bs=m.node_tree.nodes['Principled BSDF']; c=hexc(h); lin=[((u/12.92) if u<=.04045 else ((u+.055)/1.055)**2.4) for u in c]
    bs.inputs['Base Color'].default_value=(*lin,1); bs.inputs['Roughness'].default_value=rough; return m
me.materials.append(texmat('Body',OUT+'body_color.png',OUT+'body_orm.png',OUT+'body_normal.png'))
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
import geo, shoes
def _antro():
    """Antropometría del esqueleto como fracción de la estatura (línea ANTRO): húmero, antebrazo, mano, ancho entre hombros y envergadura. Avisa si algo se sale de lo humano."""
    B=lambda n:rig.data.bones['mixamorig:'+n]; H_=float(STY['H']); hum=(B('LeftForeArm').head_local-B('LeftArm').head_local).length; fa=(B('LeftHand').head_local-B('LeftForeArm').head_local).length
    tip=B('LeftHandMiddle3').tail_local if 'mixamorig:LeftHandMiddle3' in rig.data.bones else B('LeftHand').tail_local; mano=(tip-B('LeftHand').head_local).length; sw=(B('LeftArm').head_local-B('RightArm').head_local).length
    cue=(B('Head').head_local-B('Neck').head_local).length; r=dict(humero=hum/H_,antebrazo=fa/H_,mano=mano/H_,hombros=sw/H_,envergadura=(sw+2*(hum+fa+mano))/H_,cuello=cue/H_)
    lim=dict(humero=(.155,.19),antebrazo=(.135,.16),mano=(.095,.125),envergadura=(.99,1.08),cuello=(.038,.06)); fuera=[k for k,(a,c) in lim.items() if not a<=r[k]<=c]
    print('ANTRO '+NAME+': '+' · '.join(f'{k} {v:.3f} H' for k,v in r.items())+(' · FUERA DE RANGO: '+', '.join(fuera) if fuera else ' · en rango'))
try: _antro()
except Exception as e: print('ANTRO error',e)
parts=[]; lash_o=geo.lashes(b,alphamat('Lashes',OUT+'lash.png',.5,True))
if lash_o: parts.append(lash_o)
if not os.environ.get('TARIMA_NOSKIN'): geo.smooth_weights(b,rig,K)
geo.subdivide(b)
if not os.environ.get('TARIMA_NOANAT'): geo.anatomy(b,rig,K,STY.get('cut',1.))
if 'escote' in STY: geo.chest_smooth(b,rig,K)     # plantel nuevo: frente del pecho sin puntas bajo la malla
geo.garments(b,rig,BJ,K,K if 'escote' in STY else 1.); geo.simplify(b,rig,BJ,K,OUT,float(os.environ['TARIMA_SIMP']) if os.environ.get('TARIMA_SIMP') else None); me=b.data
if not os.environ.get('TARIMA_NOHAIR'):
    if 'escote' in STY and not os.environ.get('TARIMA_CAPAS'):     # plantel nuevo: pelo y barba como malla opaca con volumen (el material se sigue llamando Hair: el visor lo reconoce por ser opaco)
        cap=geo.hair_cap(b,OUT,texmat('Hair',OUT+'pelo.png',None,OUT+'pelo_normal.png',rough=.82,nstrength=.7),LM,K)
        if cap: parts.append(cap)
    else: parts.append(geo.hair_shells(b,OUT,alphamat('Hair',OUT+'hair.png',.42),STY.get('capas')))
if STY.get('bun') and not os.environ.get('TARIMA_NOHAIR'): parts.append(geo.bun(b,K,STY,LM,texmat('Bun',OUT+'bun.png',None,OUT+'bun_normal.png',rough=.46)))   # pelo atado: moño
def newobj(name,bm_,mats,group):
    m=bpy.data.meshes.new(name); bm_.to_mesh(m); bm_.free(); o=bpy.data.objects.new(name,m); bpy.context.scene.collection.objects.link(o)
    for mt in mats: m.materials.append(mt)
    vg=o.vertex_groups.new(name=group); vg.add(list(range(len(m.vertices))),1.0,'REPLACE')
    for p in m.polygons: p.use_smooth=True
    parts.append(o); return o
eyem=texmat('Eyes',OUT+'eye.png',rough=.12)
for k in ('eyeL','eyeR'): newobj(k,geo.eyeball(float(LM['eyeR_r'][0]),LM[k]),[eyem],'mixamorig:Head')
# ---------- zapatillas de halterofilia (blender/shoes.py) ----------
SM=[texmat(n_,OUT+'shoe_color.png',OUT+'shoe_orm.png',OUT+'shoe_normal.png') for n_ in shoes.MATS]   # un solo atlas para los cinco materiales (el color va en la textura)
for sgn,side in ((1,'Left'),(-1,'Right')): parts.append(shoes.build(sgn,side,footpts[sgn],rig,SM))
if STY.get('belt'):
    BM=[texmat('Belt',OUT+'belt_color.png',OUT+'belt_orm.png',OUT+'belt_normal.png'),flat('BeltMetal','#c9ccd2',.28)]; BM[1].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=1.0
    parts.append(geo.belt(b,rig,K,BM))
# unir
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
b.select_set(True); bpy.context.view_layer.objects.active=b; bpy.ops.object.join()
me=b.data; print('final verts',len(me.vertices),'tris',sum(len(p.vertices)-2 for p in me.polygons),'mats',[m.name for m in me.materials])
def _antro_malla():
    """Medidas sobre la MALLA final en reposo, como fracción de la estatura (línea ANTROM), contra metas de pesista (docs/PLANTEL.md).
    Perímetros: casco convexo del corte de la malla del cuerpo con un plano perpendicular al hueso. Solo mide y avisa: no cambia nada."""
    co=geo.coords(b); me_=b.data; names,W=geo.wget(b); dom=np.array([n[10:] if n.startswith('mixamorig:') else '' for n in names])[W.argmax(1)]
    mi=[i for i,m in enumerate(me_.materials) if m.name=='Body']; cuerpo=np.zeros(len(co),bool)
    for p in me_.polygons:
        if p.material_index in mi: cuerpo[list(p.vertices)]=True
    Bh=lambda n:np.array(rig.data.bones['mixamorig:'+n].head_local); H_=float(STY['H']); F_=STY.get('genero')=='F'
    def perim(P2):
        P2=sorted(map(tuple,np.round(P2,5)))
        if len(P2)<6: return float('nan')
        def half(pts):
            h=[]
            for q in pts:
                while len(h)>=2 and (h[-1][0]-h[-2][0])*(q[1]-h[-2][1])-(h[-1][1]-h[-2][1])*(q[0]-h[-2][0])<=0: h.pop()
                h.append(q)
            return h
        hull=half(P2)[:-1]+half(P2[::-1])[:-1]; hull=np.array(hull); return float(np.linalg.norm(np.roll(hull,-1,0)-hull,axis=1).sum())
    def corte(mask,p0,eje,tol=.007,rmax=None):
        eje=eje/np.linalg.norm(eje); d=(co-p0)@eje; sel=mask&cuerpo&(np.abs(d)<tol)
        e1=np.cross(eje,[0,1,0]); e1=e1 if np.linalg.norm(e1)>.1 else np.cross(eje,[1,0,0]); e1/=np.linalg.norm(e1); e2=np.cross(eje,e1); q=co[sel]-p0
        if rmax is not None: q=q[np.linalg.norm(q-np.outer(q@eje,eje),axis=1)<rmax]
        return perim(np.stack([q@e1,q@e2],1))
    es=lambda *n:np.isin(dom,n); r={}
    cab=cuerpo&es('Head'); r['cabeza (H/alto)']=H_/max(float(co[cab][:,2].max()-LM['chin'][2]),1e-3)
    nk,hd_=Bh('Neck'),Bh('Head'); r['cuello perim']=corte(es('Neck','Head'),(nk+hd_)/2,hd_-nk,rmax=.12)/H_
    a,f,w=Bh('LeftArm'),Bh('LeftForeArm'),Bh('LeftHand')
    r['biceps perim']=corte(es('LeftArm'),a+(f-a)*.5,f-a,rmax=.13)/H_; r['antebrazo perim']=corte(es('LeftForeArm'),f+(w-f)*.25,w-f,rmax=.10)/H_; r['muñeca perim']=corte(es('LeftForeArm','LeftHand'),f+(w-f)*.93,w-f,rmax=.07)/H_
    da=np.linalg.norm(np.cross(co-a,(f-a)/np.linalg.norm(f-a)),axis=1); sl=cuerpo&es('LeftArm','LeftShoulder')&(np.abs((co-a)@((f-a)/np.linalg.norm(f-a))-.04)<.02)
    rdel=float(np.percentile(da[sl],90)) if sl.sum()>5 else float('nan'); r['hombros malla']=(2*a[0]+2*rdel)/H_
    tr=es('Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder'); hz=float(Bh('LeftUpLeg')[2]); sz=float(a[2]); up=np.array([0,0,1.])
    r['pecho perim']=corte(tr,np.array([0,0,sz-.115*K]),up,rmax=.30)/H_
    cz=[(corte(tr,np.array([0,0,zz]),up,rmax=.30),zz) for zz in np.linspace(hz+.07*K,hz+.24*K,9)]; cmin,zc=min(cz); r['cintura perim']=cmin/H_
    anc=co[cuerpo&tr&(np.abs(co[:,2]-zc)<.008)]; r['hombros/cintura']=r['hombros malla']*H_/max(float(2*np.abs(anc[:,0]).max()),1e-3) if len(anc) else float('nan')
    u,k,t_=Bh('LeftUpLeg'),Bh('LeftLeg'),Bh('LeftFoot')
    r['muslo perim']=corte(es('LeftUpLeg'),u+(k-u)*.28,k-u,rmax=.20)/H_; r['pantorrilla perim']=max(corte(es('LeftLeg'),k+(t_-k)*q_,t_-k,rmax=.13) for q_ in (.25,.32,.4))/H_
    gl=cuerpo&es('Hips','LeftUpLeg','RightUpLeg')&(co[:,2]>hz-.07*K)&(co[:,2]<hz+.08*K); r['gluteo proyeccion']=float(co[gl][:,1].max()-u[1])/H_
    en=cuerpo&(np.abs(co[:,0])<.012)&es('Hips','LeftUpLeg','RightUpLeg')&(co[:,2]>float(k[2])); r['entrepierna']=float(co[en][:,2].min())/H_ if en.any() else float('nan')
    g_=float(STY.get('grasa_',0)); pes=g_>.5
    meta={'cabeza (H/alto)':(7.2,7.9),'cuello perim':(.225,.275),'hombros malla':(.26,.31),'biceps perim':(.19,.25) if not F_ else (.16,.21),'antebrazo perim':(.165,.20) if not F_ else (.145,.18),'muñeca perim':(.095,.115),
          'pecho perim':(.60,.72) if not pes else (.66,.84),'cintura perim':(.46,.56) if not pes else (.55,.72),'hombros/cintura':(1.2 if pes else 1.3,9),'muslo perim':(.35,.43) if not pes else (.38,.50),'pantorrilla perim':(.225,.265) if not pes else (.24,.30),
          'gluteo proyeccion':(.10,.16),'entrepierna':(.44,.475)}
    fuera=[k_ for k_,(lo,hi) in meta.items() if not (lo<=r[k_]<=hi)]
    print('ANTROM '+NAME+': '+' · '.join(f'{k_} {v:.3f}'+('' if k_ not in fuera else f' [meta {meta[k_][0]}-{meta[k_][1]}]') for k_,v in r.items())+(' · FUERA: '+str(len(fuera)) if fuera else ' · todo en meta'))
try: _antro_malla()
except Exception as e:
    import traceback; print('ANTROM error',e); traceback.print_exc()
if not os.environ.get('TARIMA_NOCORR'): geo.correctives(b,rig,K,STY.get('genero')=='F')
bpy.ops.wm.save_as_mainfile(filepath=OUT+'s3b.blend')  # punto de partida de pose_only.py
if os.environ.get('TARIMA_NOPOSES'): sys.exit(0)   # solo malla (renders de control con blender/ctl.py)
exec(open(os.path.join(HERE,'poses.py'),encoding='utf-8').read())
