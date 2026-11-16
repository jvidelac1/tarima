"""Sonda de cuerpos: arma solo el cuerpo de cada pesista (body.build: MPFB, proporciones y ajuste de masa) y deja una lámina
de frente, de costado y en tres cuartos, todas a la misma escala (ortográfica), más las líneas MEASURE y MASA.
Sirve para ajustar los parámetros de blender/plantel.py en minutos, antes de gastar un build completo.
  python blender/sonda.py [nombres...]      (sin nombres: el plantel nuevo)   ->  <TARIMA_OUT>/sonda/<nombre>.png y plantel.png
Corre en GitHub Actions (modo 'sonda' de .github/workflows/pesistas.yml)."""
import bpy, os, sys, math
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import *
import body, plantel
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont
names=sys.argv[1:] or plantel.NUEVOS; OUT=out_dir('sonda'); W,Hh=340,560; SPAN=2.1; ZC=1.0
def font(sz):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/System/Library/Fonts/Helvetica.ttc'):
        try: return ImageFont.truetype(f,sz)
        except Exception: pass
    return ImageFont.load_default()
filas=[]
for n in names:
    boot(); b,rig=body.build(n); sc=bpy.context.scene; P=plantel.PESISTAS[n]; S=plantel.STYLES[n]
    m=bpy.data.materials.new('piel'); m.use_nodes=True; bs=m.node_tree.nodes['Principled BSDF']; c=[int(S['skin'][i:i+2],16)/255 for i in (1,3,5)]
    bs.inputs['Base Color'].default_value=(*[u**2.2 for u in c],1); bs.inputs['Roughness'].default_value=.55; b.data.materials.clear(); b.data.materials.append(m)
    for p in b.data.polygons: p.use_smooth=True; p.material_index=0
    sc.render.engine='CYCLES'; sc.cycles.samples=16; cycles_device(sc)
    try: sc.cycles.use_denoising=True
    except Exception: pass
    sc.render.resolution_x,sc.render.resolution_y=W,Hh; sc.render.resolution_percentage=100
    w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(.05,.055,.07,1); sc.world=w
    def light(nm,loc,e,size):
        l=bpy.data.lights.new(nm,'AREA'); l.energy=e; l.size=size; o=bpy.data.objects.new(nm,l); sc.collection.objects.link(o); o.location=loc; o.rotation_euler=(Vector((0,0,1))-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    light('k',(3,-3.5,3.4),900,2.5); light('f',(-3.5,-2.5,1.5),350,3.5); light('r',(-2.5,3.5,2.8),500,2); light('r2',(3.5,2.5,2.2),300,2)
    cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); cam.data.type='ORTHO'; cam.data.ortho_scale=SPAN*max(W,Hh)/Hh; sc.camera=cam
    ims=[]
    for vw,loc in (('frente',(0,-9,ZC)),('costado',(9,0,ZC)),('tres4',(6,-6.7,ZC)),('espalda',(0,9,ZC))):
        cam.location=loc; cam.rotation_euler=(Vector((0,0,ZC))-Vector(loc)).to_track_quat('-Z','Y').to_euler(); sc.render.filepath=OUT+f'{n}_{vw}.png'; bpy.ops.render.render(write_still=True); ims.append(Image.open(sc.render.filepath).convert('RGB'))
    fila=Image.new('RGB',(W*len(ims),Hh+26),(14,16,26))
    for i,im in enumerate(ims): fila.paste(im,(i*W,0))
    d=ImageDraw.Draw(fila); d.text((8,Hh+4),f"{n} · {P['nombre']} · {P['genero']} {P['categoria']} kg · {P['estatura']:.2f} m",fill=(235,235,240),font=font(15))
    # regla de estatura: una marca cada 10 cm y la línea de la estatura declarada
    py=lambda z:Hh/2-(z-ZC)/(SPAN/Hh)
    for k in range(0,21): d.line([(0,py(k*.1)),(6 if k%5 else 14,py(k*.1))],fill=(150,160,180),width=1)
    d.line([(0,py(P['estatura'])),(W,py(P['estatura']))],fill=(255,210,60),width=1)
    fila.save(OUT+n+'.png'); filas.append(fila); print('SONDA',n,OUT+n+'.png',flush=True)
    for f in ('frente','costado','tres4','espalda'): os.remove(OUT+f'{n}_{f}.png')
if filas:
    sh=Image.new('RGB',(filas[0].width,sum(f.height for f in filas)),(14,16,26)); y=0
    for f in filas: sh.paste(f,(0,y)); y+=f.height
    sh.save(OUT+'plantel.png'); print('SONDA lámina',OUT+'plantel.png')
