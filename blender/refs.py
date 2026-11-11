"""Renders de referencia para imagen a 3D y para repintado (etapa 2, E3): vistas del propio personaje, con Cycles en la GPU.
  python blender/refs.py <nombre>
Abre <TARIMA_OUT>/<nombre>/s3b.blend (la malla final de finish.py) y toma las poses reales de la acción de s4.blend, con la tabla de
fases de ctl3.py (PH). Por cada pose (rest = reposo; fin = Envión · Final, brazos arriba) y cada encuadre (full = cuerpo entero;
bust = sin lo que queda por debajo de la cadera y sin el cinturón, para que brazos y torso ocupen el cuadro) saca 4 vistas cada 90°
en el orden frente, izquierda, atrás, derecha. Las cuatro de un juego comparten punto de mira y distancia: es una calesita, no un
encuadre por vista. 1024x1024, FOV horizontal 20°, el sujeto ocupa 1/1,1 del cuadro en la vista más ajustada, fondo negro con alfa.
Luz de estudio suave: entorno uniforme más una clave grande desde arriba y adelante, que gira con la cámara (cada vista queda
iluminada igual; no hay sombras duras ni piso).
Salida: out/arte/refs/<nombre>_<pose>_<encuadre>_<vista>.png y cams.json (cámaras, encuadres y medidas de control).
Líneas a mirar:
  REF   una por imagen: caja de la silueta medida en el PNG (alfa >= 0,5), caja prevista proyectando los vértices, margen al borde
        y % de píxeles opacos con algún canal quemado.
  REFS  una por juego: alto de la silueta en las cuatro vistas, diferencia máxima, margen mínimo y simetría de la máscara de frente.
Variables: REFS_OUT (carpeta de salida), REFS_POSES=rest,fin (claves de ctl3.PH o rest), REFS_FRAMES=full,bust, REFS_RES=1024,
REFS_SAMPLES=32, REFS_BELT=1 (deja el cinturón en bust), REFS_WORLD y REFS_KEY (intensidad del entorno y vatios de la clave),
CTL_SRC (otra carpeta de build de donde leer s3b.blend, s4.blend y poses.json), TARIMA_GPU=0 (CPU)."""
import bpy, os, sys, json, math, time, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import cycles_device, out_dir, ROOT
from mathutils import Vector, Matrix
import ctl3, geo
PRE='mixamorig:'
# vista -> azimut de la cámara alrededor de Z (grados): 0 = delante del personaje (-Y), 90 = a su izquierda (+X), 180 = atrás, 270 = a su derecha
VIEWS=(('front',0),('left',90),('back',180),('right',270))
FOV=20.0       # grados, horizontal (cuadro cuadrado: el vertical es el mismo)
FILL=1/1.1     # fracción del cuadro que ocupa el sujeto en su lado más ancho, en la vista más ajustada del juego
WORLD=float(os.environ.get('REFS_WORLD','.35')); KEY=float(os.environ.get('REFS_KEY','130'))   # entorno uniforme y clave (W). Medido en ventura: 0 % de píxeles quemados (con .45 y 400 se quemaba el 26 %)
KEY_AT=(3.2,2.6); KEY_SIZE=4.0   # la clave va a 3,2 m hacia la cámara y 2,6 m por encima del punto de mira; 4 m de lado (sombra muy blanda)

def real_poses(src,keys):
    """matrix_basis de todos los huesos en las fases pedidas, leído de la acción 'Poses' de s4.blend (igual que 'ctl3.py dump')."""
    keys=[k for k in keys if k!='rest']; D={}
    if keys:
        bpy.ops.wm.open_mainfile(filepath=src+'s4.blend'); rig=bpy.data.objects['Human.rig']; sc=bpy.context.scene; F=ctl3.frames(src)
        for k in keys:
            sc.frame_set(F[k]); bpy.context.view_layer.update(); D[k]={p.name:[list(r) for r in p.matrix_basis] for p in rig.pose.bones}
    return D
def set_pose(rig,b,D,pose):
    pb=rig.pose.bones; sc=bpy.context.scene
    for p in pb: p.matrix_basis=Matrix()
    if pose!='rest':
        for n,m in D[pose].items():
            if n in pb: pb[n].matrix_basis=Matrix(m)
    bpy.context.view_layer.update(); sc.frame_set(sc.frame_current)   # el segundo paso evalúa los drivers de los correctivos
def bust_mask(b,rig):
    """Modificador Mask 'ref_bust': deja lo que en reposo está de la articulación de la cadera para arriba, más brazos y manos enteros
    (en reposo los dedos bajan de esa altura); saca el cinturón (accesorio rígido que taparía la cintura) salvo REFS_BELT=1."""
    me=b.data; co=geo.coords(b); names,W=geo.wget(b); zc=float(rig.data.bones[PRE+'LeftUpLeg'].head_local.z)
    arm=sum(W[:,j] for j,n in enumerate(names) if 'Arm' in n or 'Hand' in n)   # Arm, ForeArm, Hand y dedos de los dos lados
    keep=(co[:,2]>=zc)|(arm>.5)
    if not os.environ.get('REFS_BELT'):
        belt={i for i,m in enumerate(me.materials) if m and m.name.startswith('Belt')}
        for p in me.polygons:
            if p.material_index in belt: keep[list(p.vertices)]=False
    vg=b.vertex_groups.new(name='ref_bust'); vg.add([int(i) for i in np.nonzero(keep)[0]],1.0,'REPLACE')
    m=b.modifiers.new('ref_bust','MASK'); m.vertex_group='ref_bust'; m.show_viewport=m.show_render=False
    return m,zc,int(keep.sum())
def posed(b):
    """Vértices visibles de la malla posada (con modificadores), en mundo."""
    ev=b.evaluated_get(bpy.context.evaluated_depsgraph_get()); me=ev.data; n=len(me.vertices); a=np.empty(n*3); me.vertices.foreach_get('co',a)
    M=np.array(b.matrix_world); sk={k.name:round(k.value,2) for k in me.shape_keys.key_blocks[1:]} if me.shape_keys else {}
    return a.reshape(n,3)@M[:3,:3].T+M[:3,3],sk
def axes(az):
    """Para un azimut: dirección del punto de mira hacia la cámara y eje derecho de la imagen (los dos horizontales)."""
    a=math.radians(az); return np.array([math.sin(a),-math.cos(a),0.]),np.array([math.cos(a),math.sin(a),0.])
def fit(P):
    """Punto de mira (centro de la caja; x=0 si el sujeto está centrado en el plano de simetría) y la menor distancia con la que
    el sujeto entra en FILL del cuadro en las cuatro vistas."""
    lo,hi=P.min(0),P.max(0); c=(lo+hi)/2; t=math.tan(math.radians(FOV/2)); d=0.
    if abs(c[0])<.01: c[0]=0.
    for _,az in VIEWS:
        f,r=axes(az); q=P-c; d=max(d,float((q@f+np.maximum(np.abs(q@r),np.abs(q[:,2]))/(t*FILL)).max()))
    return c,d,lo,hi
def project(P,c,d,az,res):
    """Caja en píxeles (x0,y0,x1,y1; y hacia abajo) de los vértices proyectados con la cámara de esa vista."""
    f,r=axes(az); q=P-c; z=d-q@f; k=res/2/math.tan(math.radians(FOV/2)); u=res/2+k*(q@r)/z; v=res/2-k*q[:,2]/z
    return [float(u.min()),float(v.min()),float(u.max()),float(v.max())]
def measure(path):
    """Máscara (alfa >= 0,5) del PNG: caja en píxeles (x0,y0,x1,y1, inclusive), margen mínimo al borde, la máscara y el % de píxeles
    opacos con algún canal quemado (>= 254 de 255)."""
    from PIL import Image
    I=np.asarray(Image.open(path).convert('RGBA')); M=I[:,:,3]>=128; ys=np.nonzero(M.any(1))[0]; xs=np.nonzero(M.any(0))[0]; h,w=M.shape; op=I[:,:,3]==255
    box=[int(xs[0]),int(ys[0]),int(xs[-1]),int(ys[-1])]; return box,int(min(box[0],box[1],w-1-box[2],h-1-box[3])),M,float((I[:,:,:3][op].max(1)>=254).mean()*100)
def symmetry(M):
    """Simetría izquierda-derecha de la máscara respecto de la columna central, en % del área: píxeles que no coinciden con el
    espejo (cada diferencia se cuenta de los dos lados) y diferencia de área entre las dos mitades."""
    w=M.shape[1]; A=float(M.sum()); L=float(M[:,:w//2].sum()); R=float(M[:,w-w//2:].sum())
    return float((M^M[:,::-1]).sum())/A*100, abs(L-R)/A*100

if __name__=='__main__':
    NAME=sys.argv[1]; OUT=out_dir(NAME); SRC=os.path.join(os.environ['CTL_SRC'],NAME)+os.sep if os.environ.get('CTL_SRC') else OUT
    DST=os.path.join(os.environ.get('REFS_OUT') or os.path.join(ROOT,'out','arte','refs'),''); os.makedirs(DST,exist_ok=True)
    POSES=os.environ.get('REFS_POSES','rest,fin').split(','); FRAMES=os.environ.get('REFS_FRAMES','full,bust').split(',')
    RES=int(os.environ.get('REFS_RES','1024')); SAMPLES=int(os.environ.get('REFS_SAMPLES','32')); T0=time.time()
    bad=[p for p in POSES if p!='rest' and p not in ctl3.PH]+[f for f in FRAMES if f not in ('full','bust')]
    if bad: raise SystemExit('No conozco: '+', '.join(bad)+' (poses: rest, '+', '.join(ctl3.PH)+'; encuadres: full, bust)')
    D=real_poses(SRC,POSES)
    bpy.ops.wm.open_mainfile(filepath=SRC+'s3b.blend'); rig=bpy.data.objects['Human.rig']; b=bpy.data.objects['Human']; sc=bpy.context.scene
    for o in [o for o in bpy.data.objects if o.type in ('LIGHT','CAMERA')]: bpy.data.objects.remove(o)
    for o in bpy.data.objects:
        if o.type=='MESH' and o is not b: o.hide_render=True
    # ---- render: Cycles en la GPU, película transparente, sin 'look' (los colores salen como están en las texturas) ----
    sc.render.engine='CYCLES'; print('REFS dispositivo',cycles_device(sc),'·',SAMPLES,'muestras ·',RES,'px'); sc.cycles.samples=SAMPLES
    try: sc.cycles.use_denoising=True; sc.cycles.use_adaptive_sampling=True; sc.cycles.transparent_max_bounces=32   # capas de pelo con alfa
    except Exception: pass
    sc.render.film_transparent=True; sc.render.resolution_x=sc.render.resolution_y=RES; sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'; sc.render.image_settings.color_depth='8'
    try: sc.view_settings.view_transform='Standard'; sc.view_settings.look='None'; sc.view_settings.exposure=0; sc.view_settings.gamma=1
    except Exception: pass
    w=bpy.data.worlds.new('REF_world'); w.use_nodes=True; bg=next(n for n in w.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(1,1,1,1); bg.inputs['Strength'].default_value=WORLD; sc.world=w
    cam=bpy.data.objects.new('REF_cam',bpy.data.cameras.new('REF_cam')); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.sensor_fit='HORIZONTAL'; cam.data.angle=math.radians(FOV); cam.data.clip_start=.1; cam.data.clip_end=100
    kd=bpy.data.lights.new('REF_key','AREA'); kd.shape='SQUARE'; kd.size=KEY_SIZE; kd.energy=KEY; kd.color=(1,1,1)
    key=bpy.data.objects.new('REF_key',kd); sc.collection.objects.link(key); key.visible_camera=False
    mask,zc,nkeep=bust_mask(b,rig); print(f'REFS bust: corte en z={zc:.3f} m (reposo), quedan {nkeep} de {len(b.data.vertices)} vértices')
    cj=DST+'cams.json'; CAMS=json.load(open(cj,encoding='utf-8')) if os.path.exists(cj) else {}
    CAMS['convención']=('Mundo de Blender en metros: Z arriba, -Y es el frente del personaje, +X su izquierda. az_deg gira la cámara alrededor de Z desde el frente '
        'hacia la izquierda del personaje (front 0, left 90 = cámara en +X, ve su lado izquierdo; back 180; right 270). matrix_world es cámara a mundo con la '
        'convención de Blender (la cámara mira a -Z, +Y arriba). Cajas en píxeles x0,y0,x1,y1 con y hacia abajo. La clave gira con la cámara.')
    E=CAMS[NAME]=dict(fov_h_deg=FOV,res=RES,focal_px=RES/2/math.tan(math.radians(FOV/2)),centro_px=[RES/2,RES/2],muestras=SAMPLES,
                      luz=dict(entorno=WORLD,clave_w=KEY,clave_lado_m=KEY_SIZE,clave_adelante_arriba_m=list(KEY_AT)),fuente=os.path.abspath(SRC+'s3b.blend'),juegos={}); n=0
    for pose in POSES:
        set_pose(rig,b,D,pose)
        for fr in FRAMES:
            mask.show_viewport=mask.show_render=(fr=='bust'); bpy.context.view_layer.update()
            P,sk=posed(b); c,d,lo,hi=fit(P); tag=f'{pose}_{fr}'; V={}; Ms={}
            print(f'REFS {NAME} {tag}: mira ({c[0]:+.3f}, {c[1]:+.3f}, {c[2]:.3f}) · distancia {d:.3f} m · caja {hi[0]-lo[0]:.3f} x {hi[1]-lo[1]:.3f} x {hi[2]-lo[2]:.3f} m · {len(P)} vértices · correctivos {sk}',flush=True)
            for vw,az in VIEWS:
                f,_=axes(az); cam.location=Vector(c+f*d); cam.rotation_euler=Vector(-f).to_track_quat('-Z','Y').to_euler()
                kl=Vector(c+f*KEY_AT[0]+np.array([0,0,KEY_AT[1]])); key.location=kl; key.rotation_euler=(Vector(c)-kl).to_track_quat('-Z','Y').to_euler()
                fn=f'{NAME}_{tag}_{vw}.png'; sc.render.filepath=DST+fn; t1=time.time(); bpy.ops.render.render(write_still=True); n+=1
                bpy.context.view_layer.update(); box,mg,Ms[vw],clip=measure(DST+fn); pre=project(P,c,d,az,RES)
                V[vw]=dict(file=fn,az_deg=az,location=[float(x) for x in cam.location],matrix_world=[[float(x) for x in r] for r in cam.matrix_world],
                           caja_px=box,alto_px=box[3]-box[1]+1,ancho_px=box[2]-box[0]+1,margen_px=mg,caja_prevista_px=[round(x,2) for x in pre],quemado_pct=round(clip,2))
                print(f'REF {fn}: caja x {box[0]}..{box[2]} y {box[1]}..{box[3]} · {box[2]-box[0]+1} x {box[3]-box[1]+1} px · prevista x {pre[0]:.1f}..{pre[2]:.1f} y {pre[1]:.1f}..{pre[3]:.1f} · margen {mg} px · quemado {clip:.1f} % · {time.time()-t1:.1f} s',flush=True)
            hs=[V[v]['alto_px'] for v,_ in VIEWS]; sx,sa=symmetry(Ms['front']) if 'front' in Ms else (None,None)
            md=dict(alto_px=hs,dif_alto_px=max(hs)-min(hs),alto_previsto_px=[round(V[v]['caja_prevista_px'][3]-V[v]['caja_prevista_px'][1],2) for v,_ in VIEWS],
                    margen_min_px=min(V[v]['margen_px'] for v,_ in VIEWS),quemado_max_pct=max(V[v]['quemado_pct'] for v,_ in VIEWS),sim_frente_espejo_pct=sx,sim_frente_area_pct=sa)
            E['juegos'][tag]=dict(pose=pose,encuadre=fr,mira=[float(x) for x in c],distancia_m=d,caja_m=[[float(x) for x in lo],[float(x) for x in hi]],
                                  corte_z_m=zc if fr=='bust' else None,correctivos=sk,vistas=V,medidas=md)
            print(f'REFS {NAME} {tag}: alto de silueta {hs} px (frente, izquierda, atrás, derecha) · diferencia máxima {md["dif_alto_px"]} px · previsto {md["alto_previsto_px"]} · '
                  f'margen mínimo {md["margen_min_px"]} px · quemado máx {md["quemado_max_pct"]:.1f} % · simetría de frente: {sx:.2f} % fuera del espejo, {sa:.2f} % de diferencia de área entre mitades',flush=True)
    json.dump(CAMS,open(cj,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(f'REFS {NAME}: {n} imágenes en {time.time()-T0:.0f} s · {cj}')
