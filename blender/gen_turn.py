"""Turno en arcilla de una malla generada (etapa 2, E6): 4 vistas cada 90° con luz propia rasante, más las mismas 4 con su textura.
Uso (en el pod, con `flock /root/blender.lock` adelante y los modelos de ComfyUI descargados):
  .venv/bin/python blender/gen_turn.py <malla.glb> [<otra.glb> ...] [--res 1000] [--muestras 48] [--sin-tex] [--plano] [--giro 0] [--lado 55] [--alto 35]
  .venv/bin/python blender/gen_turn.py --hoja back G0 G1 G4 G5 [--dir out/arte/gen] [--fila clay]      # una vista de varias mallas, lado a lado
Por cada GLB escribe al lado:
  <nombre>_turn.png   contacto de 2 x 2 en arcilla (frente, izquierda, atrás, derecha), sin textura ni mapa de normales: solo geometría
  <nombre>_tex.png    contacto de 4 x 1 con la textura del GLB e iluminación plana (para ver de qué lado quedó el tatuaje)
  <nombre>_turn.json  triángulos, vértices, caja, piezas sueltas, aristas de borde (agujeros) y aristas no variedad
  vistas/<nombre>_<clay|tex>_<vista>.png   cada vista suelta
Luz: una clave chica y lateral (55° al costado y 35° arriba de la cámara, del lado izquierdo de la imagen) que gira con la cámara, un
relleno débil del otro lado y entorno casi negro. Es rasante a propósito: con la luz de estudio de refs.py (entorno uniforme y clave
grande de frente) el relieve de la espalda no se ve. La exposición se fija una vez por malla con la vista de frente (mediana de la
arcilla a 0,42 en sRGB) para que mallas de distinto tamaño se puedan comparar.
Convención de vistas: la de blender/refs.py (front = cámara en -Y; left = cámara en +X, ve el lado izquierdo del personaje). Si el
frente de la malla generada no queda en -Y después de importar, `--giro` la gira sobre Z antes de renderizar. `--plano` sombrea por cara
(sin normales suavizadas): muestra los polígonos reales de una malla de pocos polígonos, como la nuestra exportada con `detail.py sint`.
Líneas a mirar: `TURN ...`."""
import os, sys, json, math, time
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
from common import cycles_device, ROOT      # antes que numpy: common fija el tope de hilos de BLAS
import numpy as np
VIEWS=(('front',0),('left',90),('back',180),('right',270)); ES=dict(front='frente',left='izquierda',back='atrás',right='derecha')

def fuente(sz):
    from PIL import ImageFont
    fp=next((p for p in (os.environ.get('TARIMA_FONT',''),'/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf','/System/Library/Fonts/Supplemental/Arial Bold.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if p and os.path.exists(p)),None)
    return ImageFont.truetype(fp,sz) if fp else ImageFont.load_default()
def contacto(tiles,cols,out,titulo=None):
    """tiles: lista de (rótulo, imagen PIL). Pega en una grilla de `cols` columnas con el rótulo arriba a la izquierda."""
    from PIL import Image, ImageDraw
    R=tiles[0][1].size[0]; rows=(len(tiles)+cols-1)//cols; top=44 if titulo else 0; sh=Image.new('RGB',(cols*R,rows*R+top),(10,10,12)); dr=ImageDraw.Draw(sh)
    if titulo: dr.text((14,8),titulo,fill=(225,225,225),font=fuente(24))
    for k,(nm,im) in enumerate(tiles): x,y=(k%cols)*R,(k//cols)*R+top; sh.paste(im.convert('RGB').resize((R,R)),(x,y)); dr.text((x+14,y+10),nm,fill=(240,240,240),font=fuente(max(18,R//32)))
    sh.save(out); return out

def estadisticas(g):
    """Triángulos, vértices soldados, piezas sueltas y aristas de borde. El GLB trae los vértices partidos en las costuras de UV: se
    sueldan antes de contar (si no, cada costura parece un agujero)."""
    import bmesh
    me=g.data; me.calc_loop_triangles(); nt=len(me.loop_triangles); n=len(me.vertices); co=np.empty(n*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3); lo,hi=co.min(0),co.max(0); S=float((hi-lo).max())
    bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6*S); bm.verts.index_update()
    pad=list(range(len(bm.verts)))
    def raiz(i):
        while pad[i]!=i: pad[i]=pad[pad[i]]; i=pad[i]
        return i
    borde=[]; nomani=0
    for e in bm.edges:
        a,b=raiz(e.verts[0].index),raiz(e.verts[1].index)
        if a!=b: pad[a]=b
        k=len(e.link_faces)
        if k==1: borde.append((e.verts[0].index,e.verts[1].index))
        elif k>2: nomani+=1
    r=np.array([raiz(i) for i in range(len(pad))]); _,cnt=np.unique(r,return_counts=True); cnt=np.sort(cnt)[::-1]
    # lazos de borde: grupos conexos de aristas de borde (cada uno es un agujero o el borde de una pieza abierta)
    pb={}
    def rb(i):
        while pb.setdefault(i,i)!=i: pb[i]=pb[pb[i]]; i=pb[i]
        return i
    for a,b in borde:
        x,y=rb(a),rb(b)
        if x!=y: pb[x]=y
    lazos=len({rb(i) for i in pb}); st=dict(triangulos=nt,vertices_glb=n,vertices_soldados=len(bm.verts),caja=[[float(x) for x in lo],[float(x) for x in hi]],lado_mayor=S,
        piezas=int(len(cnt)),vertices_pieza_mayor_pct=round(float(cnt[0])/len(pad)*100,3),piezas_de_mas_de_100_vertices=int((cnt>100).sum()),aristas_de_borde=len(borde),lazos_de_borde=lazos,aristas_no_variedad=nomani)
    bm.free(); return st,lo,hi

def turno(path,a):
    import bpy
    from mathutils import Vector, Matrix
    from PIL import Image
    from detail import importar
    t0=time.time(); bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene; g=importar(path)
    if a.giro: g.data.transform(Matrix.Rotation(math.radians(a.giro),4,'Z')); g.data.update()
    st,lo,hi=estadisticas(g); c=(lo+hi)/2; S=st['lado_mayor']; base=os.path.splitext(path)[0]; nombre=os.path.basename(base); vd=os.path.join(os.path.dirname(base),'vistas'); os.makedirs(vd,exist_ok=True)
    mats=[m for m in g.data.materials]; st['materiales']=[m.name for m in mats if m]; st['giro_z']=a.giro
    print(f"TURN {nombre}: {st['triangulos']} triángulos · {st['vertices_soldados']} vértices soldados ({st['vertices_glb']} en el GLB) · caja {hi[0]-lo[0]:.3f} x {hi[1]-lo[1]:.3f} x {hi[2]-lo[2]:.3f} · "
          f"{st['piezas']} piezas (la mayor {st['vertices_pieza_mayor_pct']} % de los vértices; {st['piezas_de_mas_de_100_vertices']} de más de 100) · {st['aristas_de_borde']} aristas de borde en {st['lazos_de_borde']} lazos · {st['aristas_no_variedad']} no variedad",flush=True)
    sc.render.engine='CYCLES'; cycles_device(sc); sc.cycles.samples=a.muestras
    try: sc.cycles.use_denoising=True; sc.view_settings.view_transform='Standard'; sc.view_settings.look='None'; sc.view_settings.exposure=0; sc.view_settings.gamma=1
    except Exception: pass
    sc.render.film_transparent=True; sc.render.resolution_x=sc.render.resolution_y=a.res; sc.render.resolution_percentage=100; sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'
    wd=bpy.data.worlds.new('turn'); wd.use_nodes=True; bg=next(n for n in wd.node_tree.nodes if n.type=='BACKGROUND'); sc.world=wd
    cam=bpy.data.objects.new('turn_cam',bpy.data.cameras.new('turn_cam')); sc.collection.objects.link(cam); cam.data.type='ORTHO'; cam.data.ortho_scale=1.08*S; cam.data.clip_start=.01*S; cam.data.clip_end=20*S; sc.camera=cam
    def luz(nm,lado,w):
        d=bpy.data.lights.new(nm,'AREA'); d.shape='SQUARE'; d.size=lado*S; d.energy=w*S*S; o=bpy.data.objects.new(nm,d); sc.collection.objects.link(o); o.visible_camera=False; return o
    key=luz('turn_key',.5,900); fill=luz('turn_fill',2.,90)
    clay=bpy.data.materials.new('clay'); clay.use_nodes=True; bs=next(n for n in clay.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); bs.inputs['Base Color'].default_value=(.55,.52,.48,1); bs.inputs['Roughness'].default_value=.6
    def dir3(az,el):
        az,el=math.radians(az),math.radians(el); return Vector((math.sin(az)*math.cos(el),-math.cos(az)*math.cos(el),math.sin(el)))
    def poner(az):
        f=dir3(az,0); cam.location=Vector(c)+f*5*S; cam.rotation_euler=(-f).to_track_quat('-Z','Y').to_euler()
        for o,daz,el,dist in ((key,-a.lado,a.alto,3.),(fill,70,10,4.)):      # daz negativo: del lado izquierdo de la imagen
            o.location=Vector(c)+dir3(az+daz,el)*dist*S; o.rotation_euler=(Vector(c)-o.location).to_track_quat('-Z','Y').to_euler()
    def render(fn,fondo=(26,26,30)):
        """Renderiza con película transparente y pega sobre un fondo liso (el fondo no entra en la exposición). Devuelve la imagen y su alfa."""
        sc.render.filepath=fn; bpy.ops.render.render(write_still=True); im=Image.open(fn).convert('RGBA'); al=np.asarray(im)[:,:,3]/255.
        out=Image.new('RGB',im.size,fondo); out.paste(im,(0,0),im); out.save(fn); return out,al
    # ---- arcilla: solo geometría ----
    if a.plano:
        for pl in g.data.polygons: pl.use_smooth=False
        g.data.update()
    g.data.materials.clear(); g.data.materials.append(clay); bg.inputs['Color'].default_value=(1,1,1,1); bg.inputs['Strength'].default_value=.02
    poner(0); sc.cycles.samples=8; im,al=render(os.path.join(vd,f'{nombre}_cal.png')); os.remove(os.path.join(vd,f'{nombre}_cal.png'))
    lum=(np.asarray(im,float)/255).mean(2); op=al>.99; med=float(np.median(lum[op])) if op.any() else .2; lin=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    sc.view_settings.exposure=float(np.clip(math.log2(lin(.42)/max(lin(med),1e-4)),-4,4)); st['exposicion']=round(sc.view_settings.exposure,2); sc.cycles.samples=a.muestras; tiles=[]
    quemado=[]
    for vw,az in VIEWS:
        poner(az); im,al=render(os.path.join(vd,f'{nombre}_clay_{vw}.png')); tiles.append((ES[vw],im)); quemado.append(round(float((np.asarray(im)[al>.99].max(1)>=254).mean()*100),2))
    st['quemado_pct']=quemado; contacto(tiles,2,base+'_turn.png',f"{nombre} · arcilla · {st['triangulos']} triángulos · {st['piezas']} piezas · {st['aristas_de_borde']} aristas de borde"); st['turn']=base+'_turn.png'
    # ---- textura con luz plana ----
    if not a.sin_tex and any(mats):
        g.data.materials.clear()
        for m in mats: g.data.materials.append(m)
        key.hide_render=fill.hide_render=True; bg.inputs['Strength'].default_value=1.; sc.view_settings.exposure=0; sc.cycles.samples=16; tiles=[]
        for vw,az in VIEWS: poner(az); tiles.append((ES[vw],render(os.path.join(vd,f'{nombre}_tex_{vw}.png'),(250,250,250))[0]))
        contacto(tiles,4,base+'_tex.png'); st['tex']=base+'_tex.png'
    st['segundos']=round(time.time()-t0,1); json.dump(st,open(base+'_turn.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(f"TURN {nombre}: exposición {st['exposicion']:+.2f} · quemado {st['quemado_pct']} % · {base}_turn.png · {st['segundos']} s",flush=True)

def hoja(a):
    """Una misma vista de varias mallas, lado a lado, con las vistas sueltas que ya dejó el turno."""
    from PIL import Image
    d=os.path.join(ROOT,a.dir); tiles=[(n,Image.open(os.path.join(d,'vistas',f'{n}_{a.fila}_{a.hoja}.png'))) for n in a.glb]
    out=os.path.join(d,f"cmp_{a.fila}_{a.hoja}_{'_'.join(a.glb)}.png"); contacto(tiles,len(tiles),out); print('TURN hoja',out)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(prog='gen_turn.py'); p.add_argument('glb',nargs='+'); p.add_argument('--res',type=int,default=1000); p.add_argument('--muestras',type=int,default=48); p.add_argument('--sin-tex',dest='sin_tex',action='store_true'); p.add_argument('--plano',action='store_true',help='sombreado por cara')
    p.add_argument('--giro',type=float,default=0.,help='giro sobre Z (grados) antes de renderizar'); p.add_argument('--lado',type=float,default=55.,help='azimut de la clave respecto de la cámara'); p.add_argument('--alto',type=float,default=35.,help='elevación de la clave')
    p.add_argument('--hoja',choices=[v for v,_ in VIEWS],help='arma una hoja con esa vista de las mallas nombradas (sin renderizar)'); p.add_argument('--dir',default='out/arte/gen'); p.add_argument('--fila',choices=('clay','tex'),default='clay')
    a=p.parse_args()
    if a.hoja: hoja(a)
    else:
        for f in a.glb: turno(f,a)
