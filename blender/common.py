import os
# Tope de hilos de CPU (la máquina de trabajo se satura fácil): TARIMA_THREADS, 6 por defecto. Vale para Cycles (render y horneado) y para BLAS de numpy.
THREADS=max(1,int(os.environ.get('TARIMA_THREADS') or min(6,os.cpu_count() or 6)))   # sin la variable: 6, o los núcleos que haya si son menos
for _k in ('OMP_NUM_THREADS','VECLIB_MAXIMUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS'): os.environ.setdefault(_k,str(THREADS))
import bpy, sys, shutil, importlib, math
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
MPFB_SRC=os.environ.get('MPFB_SRC',os.path.join(ROOT,'vendor','mpfb2','src','mpfb'))
def out_dir(name):
    d=os.path.join(os.environ.get('TARIMA_OUT') or os.path.join(ROOT,'out'),name)+os.sep; os.makedirs(d,exist_ok=True); return d
def boot():
    ext = bpy.utils.user_resource('EXTENSIONS', path='user_default', create=True)
    dst = os.path.join(ext, 'mpfb')
    if not os.path.exists(dst):
        if not os.path.isdir(MPFB_SRC): raise SystemExit('No encuentro MPFB en '+MPFB_SRC+' (ver README, paso 2)')
        shutil.copytree(MPFB_SRC, dst)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
def di(p,k):
    for a in list(sys.modules):
        if a.endswith(p): return getattr(importlib.import_module(a),k)
    raise ValueError(p)
_DEV={}
def cycles_device(sc=None, gpu=True):
    """Deja Cycles en GPU (Metal en Mac; OptiX/CUDA/HIP/oneAPI si existen) con caída a CPU, y limita los hilos de CPU a THREADS.
    TARIMA_GPU=0 fuerza CPU. gpu=False pide CPU para ese uso (horneados que tienen que dar el mismo mapa bit a bit). Devuelve 'GPU' o 'CPU'."""
    sc=sc or bpy.context.scene
    sc.render.threads_mode='FIXED'; sc.render.threads=THREADS
    dev='CPU'
    if gpu and os.environ.get('TARIMA_GPU','1')!='0':
        if 'type' not in _DEV:
            _DEV['type']=None
            try:
                cp=bpy.context.preferences.addons['cycles'].preferences
                for t in ('METAL','OPTIX','CUDA','HIP','ONEAPI'):
                    try: cp.compute_device_type=t
                    except Exception: continue
                    try: cp.refresh_devices()
                    except Exception: cp.get_devices()
                    g=[d for d in cp.devices if d.type==t]
                    if g:
                        for d in cp.devices: d.use=(d.type==t)     # solo la GPU: la CPU queda libre para el resto
                        _DEV['type']=t; print('CYCLES dispositivo',t,[d.name for d in g],'· hilos de CPU',THREADS); break
                if _DEV['type'] is None:
                    try: cp.compute_device_type='NONE'
                    except Exception: pass
                    print('CYCLES sin GPU disponible: CPU con',THREADS,'hilos')
            except Exception as e: print('CYCLES sin GPU (',e,'): CPU con',THREADS,'hilos')
        else:
            try:     # boot() repone las preferencias de fábrica: se vuelve a marcar el dispositivo
                cp=bpy.context.preferences.addons['cycles'].preferences
                if _DEV['type'] and cp.compute_device_type!=_DEV['type']: del _DEV['type']; return cycles_device(sc,gpu)
            except Exception: pass
        if _DEV.get('type'): dev='GPU'
    try: sc.cycles.device=dev
    except Exception: sc.cycles.device=dev='CPU'
    return dev
def _world(sc):
    """Entorno procedural barato: degradé de arena (piso oscuro, horizonte tibio, techo azul) para que haya reflejos y relleno."""
    w=bpy.data.worlds.get('PV_world')
    if w is None:
        w=bpy.data.worlds.new('PV_world'); w.use_nodes=True; nt=w.node_tree
        for n in list(nt.nodes): nt.nodes.remove(n)
        out=nt.nodes.new('ShaderNodeOutputWorld'); bg=nt.nodes.new('ShaderNodeBackground'); tc=nt.nodes.new('ShaderNodeTexCoord'); sp=nt.nodes.new('ShaderNodeSeparateXYZ'); mp=nt.nodes.new('ShaderNodeMapRange'); cr=nt.nodes.new('ShaderNodeValToRGB')
        mp.inputs['From Min'].default_value=-1; mp.inputs['From Max'].default_value=1
        e=cr.color_ramp.elements; e[0].position=0; e[0].color=(.012,.010,.009,1); e[1].position=1; e[1].color=(.006,.008,.018,1)
        for pos,c in ((.47,(.030,.024,.020,1)),(.56,(.085,.090,.120,1)),(.72,(.020,.026,.050,1))): k=e.new(pos); k.color=c
        nt.links.new(tc.outputs['Generated'],sp.inputs[0]); nt.links.new(sp.outputs['Z'],mp.inputs['Value']); nt.links.new(mp.outputs[0],cr.inputs['Fac']); nt.links.new(cr.outputs['Color'],bg.inputs['Color']); nt.links.new(bg.outputs[0],out.inputs['Surface'])
        bg.inputs['Strength'].default_value=1.0
    sc.world=w
def render(path, cam_loc=(1.6,-3.6,1.15), target=(0,0,0.9), res=(560,860), samples=24, lens=70):
    """Render de control con luz de arena: principal cálida alta, dos contraluces, relleno frío y cenital suave, sobre un entorno en degradé."""
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=samples; cycles_device(sc)
    try: sc.cycles.use_denoising=True; sc.cycles.use_adaptive_sampling=True; sc.cycles.transparent_max_bounces=32   # capas de pelo con alfa
    except Exception: pass
    sc.render.resolution_x,sc.render.resolution_y=res; sc.render.filepath=path
    from mathutils import Vector
    for o in [o for o in bpy.data.objects if o.name.startswith('PV_')]: bpy.data.objects.remove(o)
    cam=bpy.data.objects.new('PV_cam',bpy.data.cameras.new('PV_cam')); sc.collection.objects.link(cam); cam.data.lens=lens
    cam.location=cam_loc; d=Vector(target)-Vector(cam_loc); cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler(); sc.camera=cam
    def light(n,loc,e,col,size):
        l=bpy.data.lights.new(n,'AREA'); l.energy=e; l.color=col; l.size=size; o=bpy.data.objects.new(n,l); sc.collection.objects.link(o); o.location=loc
        o.rotation_euler=(Vector(target)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    EX=float(os.environ.get('TARIMA_EXPO','.42'))   # las luces están a distancia fija: la exposición no depende del encuadre
    light('PV_k',(2.3,-3.2,3.6),1000*EX,(1,.94,.86),1.6); light('PV_r',(-3,3,2.6),750*EX,(.45,.78,1),1.3); light('PV_r2',(3.2,2.6,3.0),420*EX,(1,.88,.74),1.3)
    light('PV_f',(-2.7,-2.8,1.4),170*EX,(.72,.78,1),3.5); light('PV_t',(0,-.6,5.5),380*EX,(1,.98,.95),2.5)
    try: sc.view_settings.view_transform='AgX'; sc.view_settings.look='AgX - Medium High Contrast'
    except Exception: pass
    _world(sc)
    bpy.ops.render.render(write_still=True)
