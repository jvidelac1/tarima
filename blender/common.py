import bpy, sys, os, shutil, importlib, math
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
MPFB_SRC=os.environ.get('MPFB_SRC',os.path.join(ROOT,'vendor','mpfb2','src','mpfb'))
def out_dir(name):
    d=os.path.join(ROOT,'out',name)+os.sep; os.makedirs(d,exist_ok=True); return d
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
def render(path, cam_loc=(1.6,-3.6,1.15), target=(0,0,0.9), res=(560,860), samples=24, lens=70):
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=samples; sc.cycles.device='CPU'
    try: sc.cycles.use_denoising=True
    except Exception: pass
    sc.render.resolution_x,sc.render.resolution_y=res; sc.render.filepath=path
    from mathutils import Vector
    for n in ('PV_cam','PV_k','PV_r','PV_f'):
        o=bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o)
    cam=bpy.data.objects.new('PV_cam',bpy.data.cameras.new('PV_cam')); sc.collection.objects.link(cam); cam.data.lens=lens
    cam.location=cam_loc; d=Vector(target)-Vector(cam_loc); cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler(); sc.camera=cam
    def light(n,loc,e,col,size):
        l=bpy.data.lights.new(n,'AREA'); l.energy=e; l.color=col; l.size=size; o=bpy.data.objects.new(n,l); sc.collection.objects.link(o); o.location=loc
        o.rotation_euler=(Vector(target)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    light('PV_k',(2.5,-3,3.5),900,(1,.95,.88),2); light('PV_r',(-3,3,2.5),700,(.3,.8,1),1.5); light('PV_f',(-2.5,-3,1.5),150,(.7,.75,1),3)
    if not sc.world: sc.world=bpy.data.worlds.new('w')
    sc.world.use_nodes=True; sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.01,.012,.03,1)
    bpy.ops.render.render(write_still=True)
