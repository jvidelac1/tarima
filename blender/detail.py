"""Detalle generado (etapa 2, E7 y E8): alinea una malla hecha por imagen a 3D con el personaje, mide su relieve y lo pasa al build.
Uso (en el pod, cada comando con `flock /root/blender.lock` adelante; rutas relativas a la raíz del repo):
  .venv/bin/python blender/detail.py align  <nombre> <malla.glb> [--pose fin] [--decimate 300000] [--out webv/B/models/prop_fin.glb]
                                            [--json out/arte/gen/align_fin.json] [--ejes] [--espejo] [--tex] [--verdad sint.json]
  .venv/bin/python blender/detail.py relief <nombre> <malla.glb> [--out out/arte/detail_<nombre>.npz] [--limite 0.012] [--tope 0.006] [--suave 0.02]
  .venv/bin/python blender/detail.py heat   <nombre> <malla.glb> [--pose fin] [--out out/arte/gen/armup_error.png] [--rango 0.010] [--zona busto]
  .venv/bin/python blender/detail.py sint   <nombre> --out out/arte/seco/sint_fin.glb [--pose fin] [--escala 0.37] [--giro 25]
                                            [--tras 0.4,-0.25,0.15] [--ruido 0.001] [--ruido-en atleta] [--inflar 0.003]
  .venv/bin/python blender/detail.py cmp    <nombre> <a/s3b.blend> <b/s3b.blend>
  TARIMA_DETAIL=out/arte/detail_ventura.npz ./build.sh ventura      # aplica el relieve en geo.anatomy; sin la variable no cambia nada

align   Importa el GLB, lleva al personaje a la pose pedida con out/<nombre>/s4.blend (cuadro de la fase según poses.json, igual que ctl3.py;
        'rest' es el reposo), busca la similitud (escala, rotación, traslación) que lleva la malla generada sobre la nuestra, la decima y la
        exporta en el marco del GLB del atleta (coordenadas de mundo de Blender, Y arriba al exportar). Escribe un JSON con escala, rotación,
        traslación, matriz, error mediano y cobertura. Líneas a mirar: `ALIGN ...`.
relief  Alinea igual, pero contra el reposo, y mide por vértice del cuerpo cuánto hay que moverlo sobre su normal para llegar a la malla
        generada: rayo en los dos sentidos con límite, máscara por hueso dominante (brazo, antebrazo, hombro, Spine1, Spine2, cuello; fuera
        cabeza, manos y zona del cinturón), promedio izquierda-derecha, suavizado y recorte. Guarda posición, normal, desplazamiento y máscara
        en un .npz. Líneas a mirar: `RELIEF ...`.
heat    Mapa de distancia con signo entre nuestra malla deformada en la pose y la malla generada (rojo: la generada queda por fuera, nos
        falta volumen; azul: queda por dentro, nos sobra). Hoja de cuatro vistas, JSON por hueso y .npz por vértice.
sint    Prueba en seco: exporta nuestra propia malla posada con una similitud conocida, ruido y, si se pide, los brazos inflados.
cmp     Diferencia por vértice del cuerpo entre dos s3b.blend, por hueso dominante (para probar el enganche TARIMA_DETAIL).

Sin scipy: correspondencias con mathutils.bvhtree (punto más cercano de la superficie, no del vértice) y álgebra con numpy.
Marco: X lateral (+X es la izquierda del personaje), -Y el frente, Z arriba, metros.
SUPUESTO (a verificar con la primera malla real): el importador de glTF deja la malla generada con Z arriba. Si no, `--ejes` prueba las seis
orientaciones. La inversión izquierda-derecha no se puede decidir por geometría en un cuerpo casi simétrico: `error_espejado_mm` la informa
y `--espejo` la fuerza."""
import os, sys, json, math, time
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
from common import out_dir, ROOT      # antes que numpy: common fija el tope de hilos de BLAS
import bpy, numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
PRE='mixamorig:'
MASK_BONES=('LeftArm','RightArm','LeftForeArm','RightForeArm','LeftShoulder','RightShoulder','Spine1','Spine2','Neck')   # zona del relieve (E8)
ARM_BONES=('LeftArm','RightArm','LeftForeArm','RightForeArm')
GRUPOS=(('Arm',('LeftArm','RightArm')),('ForeArm',('LeftForeArm','RightForeArm')),('Shoulder',('LeftShoulder','RightShoulder')),('Spine2',('Spine2',)),('Spine1',('Spine1',)),('Neck',('Neck',)),
        ('Spine',('Spine',)),('Hips',('Hips',)),('Head',('Head',)))

# ---------- álgebra ----------
def rz(deg):
    c,s=math.cos(math.radians(deg)),math.sin(math.radians(deg)); return np.array([[c,-s,0],[s,c,0],[0,0,1.]])
def M4(s,R,t):
    M=np.eye(4); M[:3,:3]=s*np.asarray(R); M[:3,3]=t; return M
def ap(M,P): return P@M[:3,:3].T+M[:3,3]
def escala(M): return abs(np.linalg.det(M[:3,:3]))**(1/3)
def rodrigues(w):
    th=np.linalg.norm(w)
    if th<1e-12: return np.eye(3)
    k=w/th; Kx=np.array([[0,-k[2],k[1]],[k[2],0,-k[0]],[-k[1],k[0],0]]); return np.eye(3)+math.sin(th)*Kx+(1-math.cos(th))*Kx@Kx
def umeyama(P,Q):
    """Similitud de mínimos cuadrados (s, R, t) con s·R·p + t ≈ q."""
    mp,mq=P.mean(0),Q.mean(0); X,Y=P-mp,Q-mq; U,D,Vt=np.linalg.svd(Y.T@X/len(P)); e=np.array([1,1,np.sign(np.linalg.det(U@Vt))])
    R=U@np.diag(e)@Vt; s=(D*e).sum()/((X**2).sum()/len(P)); return s,R,mq-s*R@mp
# orientaciones que llevan cada eje de la malla generada a +Z (la primera es 'ya viene con Z arriba')
UPS=[np.eye(3),np.array([[1,0,0],[0,0,-1],[0,1,0.]]),np.array([[1,0,0],[0,0,1],[0,-1,0.]]),np.array([[1,0,0],[0,-1,0],[0,0,-1.]]),np.array([[0,0,-1],[0,1,0],[1,0,0.]]),np.array([[0,0,1],[0,1,0],[-1,0,0.]])]

# ---------- mallas ----------
def malla_eval(ob):
    """Vértices y normales en mundo y triángulos de la malla evaluada (pose, morphs correctivos con sus drivers y modificadores)."""
    dg=bpy.context.evaluated_depsgraph_get(); dg.update(); ev=ob.evaluated_get(dg); m=ev.to_mesh(); n=len(m.vertices)
    co=np.empty(n*3); m.vertices.foreach_get('co',co); no=np.empty(n*3); m.vertices.foreach_get('normal',no)
    m.calc_loop_triangles(); t=np.empty(len(m.loop_triangles)*3,np.int32); m.loop_triangles.foreach_get('vertices',t); ev.to_mesh_clear()
    W=np.array(ob.matrix_world); co=co.reshape(-1,3)@W[:3,:3].T+W[:3,3]; no=no.reshape(-1,3)@np.linalg.inv(W[:3,:3]); no/=np.maximum(np.linalg.norm(no,axis=1,keepdims=True),1e-12)
    return co,no,t.reshape(-1,3)
def malla_obj(ob):
    """Vértices y triángulos de un objeto sin deformar (la malla generada, ya con su transformación aplicada)."""
    me=ob.data; n=len(me.vertices); co=np.empty(n*3); me.vertices.foreach_get('co',co); me.calc_loop_triangles()
    t=np.empty(len(me.loop_triangles)*3,np.int32); me.loop_triangles.foreach_get('vertices',t); return co.reshape(-1,3),t.reshape(-1,3)
def ntris(ob): ob.data.calc_loop_triangles(); return len(ob.data.loop_triangles)
def arbol(co,tri): return BVHTree.FromPolygons(co.tolist(),tri.tolist(),all_triangles=True)
def muestreo(co,tri,n,rng):
    """n puntos repartidos por área (no por vértice: nuestra malla tiene dos tercios de los vértices en cabeza y manos) y la normal de su triángulo."""
    a,b,c=co[tri[:,0]],co[tri[:,1]],co[tri[:,2]]; cr=np.cross(b-a,c-a); ar=np.linalg.norm(cr,axis=1); i=rng.choice(len(tri),n,p=ar/ar.sum())
    u,v=rng.random(n),rng.random(n); f=u+v>1; u[f]=1-u[f]; v[f]=1-v[f]
    return a[i]+(b[i]-a[i])*u[:,None]+(c[i]-a[i])*v[:,None],cr[i]/np.maximum(ar[i],1e-20)[:,None]
def cercanos(bvh,P,dmax=None):
    """Punto más cercano de la superficie, normal de su cara y distancia. Con dmax, lo que queda más lejos devuelve distancia infinita."""
    f=bvh.find_nearest; R=[f(p) for p in P.tolist()] if dmax is None else [f(p,dmax) for p in P.tolist()]; z=(0.,0.,0.)
    Q=np.array([tuple(r[0]) if r[0] is not None else z for r in R]); N=np.array([tuple(r[1]) if r[0] is not None else z for r in R])
    return Q,N,np.array([r[3] if r[0] is not None else np.inf for r in R])
def importar(path,espejo=False):
    """Importa un GLB y lo deja como un solo objeto de malla con la transformación aplicada (marco de mundo de Blender)."""
    if not os.path.exists(path): raise SystemExit('No encuentro '+path)
    antes={o.name for o in bpy.data.objects}; bpy.ops.import_scene.gltf(filepath=os.path.abspath(path)); bpy.context.view_layer.update()
    nuevos=[o for o in bpy.data.objects if o.name not in antes]; ms=[o for o in nuevos if o.type=='MESH' and len(o.data.polygons)]
    if not ms: raise SystemExit('El GLB no trae mallas: '+path)
    mw={o.name:o.matrix_world.copy() for o in ms}
    for o in ms:
        if o.data.users>1: o.data=o.data.copy()
        o.parent=None; o.data.transform(mw[o.name]); o.matrix_world=Matrix()
        if mw[o.name].determinant()<0: o.data.flip_normals()
    bpy.ops.object.select_all(action='DESELECT')
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active=ms[0]
    if len(ms)>1: bpy.ops.object.join()
    g=ms[0]; g.name='gen'
    for o in nuevos:
        if o.name in bpy.data.objects and o is not g and o.type!='MESH': bpy.data.objects.remove(o)
    if espejo: g.data.transform(Matrix.Diagonal((-1,1,1,1))); g.data.flip_normals()
    g.data.update(); return g
def decimar(ob,n):
    """Baja la malla a n triángulos por colapso de aristas (si tiene más). Devuelve los triángulos que quedan."""
    n0=ntris(ob)
    if not n or n0<=n: return n0
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
    m=ob.modifiers.new('dec','DECIMATE'); m.decimate_type='COLLAPSE'; m.ratio=n/n0; m.use_collapse_triangulate=True; bpy.ops.object.modifier_apply(modifier='dec'); return ntris(ob)
def exportar(ob,path,tex=False):
    """GLB con Y arriba, igual que el del atleta (poses.py): los vértices ya están en mundo, así que colgado de la raíz del atleta coincide con él."""
    os.makedirs(os.path.dirname(os.path.abspath(path)),exist_ok=True)
    if not tex: ob.data.materials.clear()
    for p in ob.data.polygons: p.use_smooth=True
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_skins=False,export_morph=False,export_materials='EXPORT' if tex else 'NONE')

# ---------- personaje ----------
class Esc: pass
def abrir(nombre,pose):
    """Abre out/<nombre>/s4.blend y deja al personaje en la pose: 'rest' (reposo) o una fase de ctl3.PH (fin, over, rack...)."""
    from style import STYLES
    from ctl3 import PH, frames
    S=Esc(); S.nombre=nombre; S.OUT=out_dir(nombre); S.STY=STYLES[nombre]; S.K=S.STY['H']/1.687; S.pose=pose; S.blend=S.OUT+'s4.blend'
    if not os.path.exists(S.blend): raise SystemExit('No encuentro '+S.blend+' (correr ./build.sh '+nombre+')')
    if pose!='rest' and pose not in PH: raise SystemExit('Pose desconocida: '+pose+'. Opciones: rest, '+', '.join(PH))
    bpy.ops.wm.open_mainfile(filepath=S.blend); S.b=bpy.data.objects['Human']; S.rig=bpy.data.objects['Human.rig']; S.sc=bpy.context.scene; S.cuadro=None
    if pose=='rest':
        if S.rig.animation_data: S.rig.animation_data.action=None
        for p in S.rig.pose.bones: p.matrix_basis=Matrix()
    else: S.cuadro=frames(S.OUT)[pose]; S.sc.frame_set(S.cuadro)
    bpy.context.view_layer.update()
    S.hipz=float((S.rig.matrix_world@S.rig.pose.bones[PRE+'LeftUpLeg'].head).z); return S
def piel(b):
    """Pesos del cuerpo: nombres cortos de hueso, matriz de pesos, hueso dominante por vértice y qué vértices son del material Body."""
    import geo
    names,W=geo.wget(b); short=[n[len(PRE):] for n in names]; dom=np.array(short)[W.argmax(1)]; me=b.data
    mi=[i for i,m in enumerate(me.materials) if m is not None and m.name=='Body']; body=np.zeros(len(me.vertices),bool)
    for p in me.polygons:
        if p.material_index in mi: body[list(p.vertices)]=True
    return short,W,dom,body
def mascara(S,short,W,body,co_rest):
    """Peso 0..1 de la zona del relieve: suma de pesos de los huesos de MASK_BONES (borde suave donde otro hueso pasa a dominar), solo piel
    y tela del cuerpo, y fuera de la franja del cinturón."""
    import geo
    j=[i for i,n in enumerate(short) if n in MASK_BONES]; w=geo.sm(.3,.7,W[:,j].sum(1)/np.maximum(W.sum(1),1e-9))*body
    if S.STY.get('belt'):
        zc=geo.head(S.rig,'LeftUpLeg')[2]+geo.BELT_Z*S.K; hw=(.051+.012)*S.K; w=w*geo.sm(hw,hw+.03*S.K,np.abs(co_rest[:,2]-zc))
    return w
def por_grupo(dom,val,sel=None):
    """Mediana y percentiles (mm) de 'val' por hueso dominante, izquierda y derecha juntas."""
    out={}
    for g,bs in GRUPOS:
        k=np.isin(dom,bs)&np.isfinite(val)
        if sel is not None: k&=sel
        if k.sum()>=20: v=val[k]*1000; out[g]=dict(n=int(k.sum()),mediana=round(float(np.median(v)),2),p5=round(float(np.percentile(v,5)),2),p95=round(float(np.percentile(v,95)),2),abs_media=round(float(np.abs(v).mean()),2))
    return out

# ---------- alineación ----------
def icp_sim(bvh,P0,M,its,trim=.8):
    """ICP con escala contra el punto más cercano de la superficie (Umeyama), sin contar la peor fracción (1 - trim). Devuelve la matriz y la mediana de distancia."""
    for _ in range(its):
        P=ap(M,P0); Q,_,D=cercanos(bvh,P); k=D<=np.quantile(D,trim)
        if k.sum()<10: break
        s,R,t=umeyama(P[k],Q[k]); M=M4(s,R,t)@M
    return M,float(np.median(cercanos(bvh,ap(M,P0))[2]))
def icp_plano(bvh,P0,M,its=40):
    """Refinado punto a plano con escala (Gauss-Newton de 7 incógnitas) y pesos de Tukey: manda la mayoría que coincide; lo que difiere de
    verdad (relieve nuevo, tapas del corte del busto, pelo) casi no pesa y no arrastra la escala."""
    for _ in range(its):
        P=ap(M,P0); Q,N,D=cercanos(bvh,P); r=((P-Q)*N).sum(1); c=4.685*max(1.4826*float(np.median(np.abs(r))),5e-4)
        w=np.where(np.abs(r)<c,(1-(r/c)**2)**2,0.)*(D<max(5*float(np.median(D)),.004))
        if w.sum()<10: break
        cen=(P*w[:,None]).sum(0)/w.sum(); X=P-cen; A=np.concatenate([np.cross(X,N),N,(X*N).sum(1)[:,None]],1); Aw=A*w[:,None]
        x=np.linalg.solve(A.T@Aw+1e-12*np.eye(7),-Aw.T@r); R=rodrigues(x[:3]); s=1+x[6]; Mi=M4(s,R,cen+x[3:6]-s*R@cen); M=Mi@M
        if np.linalg.norm(x[:3])<2e-6 and np.linalg.norm(x[3:6])<2e-6 and abs(x[6])<2e-6: break
    return M
def alinear(co_t,tri_t,co_s,tri_s,hipz,ejes=False,semilla=7):
    """Similitud que lleva la malla generada (s) sobre la nuestra (t), y un resumen con el error.
    1. Candidatos: giros de 30° sobre la vertical (y las seis orientaciones con ejes=True) por cuatro recortes de nuestra malla para el
       arranque (entera, o de la cadera hacia arriba: las mallas de busto no tienen piernas). Cada uno arranca igualando cajas envolventes
       y hace 8 vueltas de ICP con escala sobre 2000 puntos.
    2. Los 4 mejores se refinan con 25 vueltas sobre 6000 puntos; el mejor pasa al refinado punto a plano robusto con 30000.
    3. El error se mide con 50000 puntos nuevos: distancia de la malla generada a nuestra superficie, en nuestras unidades."""
    rng=np.random.default_rng(semilla); t0=time.time(); bvh=arbol(co_t,tri_t)
    Pa,_=muestreo(co_s,tri_s,2000,rng); Pb,_=muestreo(co_s,tri_s,6000,rng); Pc,_=muestreo(co_s,tri_s,30000,rng); Pe,Ne=muestreo(co_s,tri_s,50000,rng)
    cortes=[None]+[hipz+dz for dz in (-.10,0.,.10)]; cands=[]
    for iu,U in enumerate(UPS if ejes else UPS[:1]):
        for giro in range(0,360,30):
            R=rz(giro)@U; Pr=Pa@R.T; lo,hi=Pr.min(0),Pr.max(0)
            for zc in cortes:
                T=co_t if zc is None else co_t[co_t[:,2]>=zc]; tlo,thi=T.min(0),T.max(0); s=(thi[2]-tlo[2])/max(hi[2]-lo[2],1e-9)
                M,e=icp_sim(bvh,Pa,M4(s,R,(tlo+thi)/2-s*(lo+hi)/2),8)
                if .5<escala(M)/s<2: cands.append((e,len(cands),M,dict(eje=iu,giro=giro,corte=None if zc is None else round(zc,3))))     # una escala que se dispara es un mínimo degenerado
    if not cands: raise SystemExit('ALIGN sin candidatos: la malla generada no se parece a la nuestra en ninguna orientación (probar --ejes)')
    cands.sort(key=lambda c:c[:2]); best=None
    for e,_,M,tag in cands[:4]:
        M,e=icp_sim(bvh,Pb,M,25,.85)
        if best is None or e<best[0]: best=(e,M,tag)
    M=icp_plano(bvh,Pc,best[1]); Q,N,D=cercanos(bvh,ap(M,Pe)); A=M[:3,:3]
    ns=Ne@np.linalg.inv(A)*np.sign(np.linalg.det(A)); ns/=np.maximum(np.linalg.norm(ns,axis=1,keepdims=True),1e-12); cerca=D<max(3*float(np.median(D)),.003)
    orient=1. if float(((ns*N).sum(1))[cerca].mean())>=0 else -1.      # -1: la malla generada trae las caras al revés
    # hipótesis de inversión izquierda-derecha: la misma malla espejada sobre nuestro plano sagital, refinada igual
    Mm,_=icp_sim(bvh,Pb,np.diag([-1.,1,1,1])@M,15,.85); Mm=icp_plano(bvh,Pc,Mm,20); Dm=cercanos(bvh,ap(Mm,Pe))[2]
    # cobertura: qué fracción de nuestra superficie tiene malla generada a menos de 15 mm (un busto cubre la mitad)
    Pt,_=muestreo(co_t,tri_t,20000,rng); kd=KDTree(len(Pe))
    for i,p in enumerate(ap(M,Pe).tolist()): kd.insert(p,i)
    kd.balance(); cob=float(np.mean([kd.find(p)[2]<.015 for p in Pt.tolist()]))
    info=dict(escala=float(escala(M)),error_mediano_mm=float(np.median(D)*1000),error_p90_mm=float(np.percentile(D,90)*1000),error_medio_mm=float(D.mean()*1000),
              error_espejado_mm=float(np.median(Dm)*1000),cobertura=round(cob,3),caras_invertidas=bool(orient<0),candidato=best[2],candidatos=len(cands),puntos=len(Pe),segundos=round(time.time()-t0,1))
    info['espejo_sospechoso']=bool(info['error_espejado_mm']<.8*info['error_mediano_mm'])
    return M,info,orient
def resumen(M,info):
    """Agrega al resumen la descomposición de la matriz (escala, rotación, traslación)."""
    A=M[:3,:3]; s=escala(M); R=A/s; info=dict(info); info['matriz']=[[float(x) for x in r] for r in M]; info['traslacion']=[float(x) for x in M[:3,3]]; info['rotacion']=[[float(x) for x in r] for r in R]
    if np.linalg.det(R)>0:
        q=Matrix(R.tolist()).to_quaternion(); e=Matrix(R.tolist()).to_euler('XYZ'); info['cuaternion_wxyz']=[float(x) for x in q]; info['euler_xyz_grados']=[math.degrees(x) for x in e]
    return info
def contra_verdad(M,path,co):
    """Con la malla sintética de `sint`: cuánto se aparta la similitud recuperada de la inversa de la que se aplicó."""
    V=json.load(open(path,encoding='utf-8')); T=np.array(V['T']); Dm=M@T; d=np.linalg.norm(ap(Dm,co)-co,axis=1)*1000; R=Dm[:3,:3]/escala(Dm)
    return dict(escala_esperada=1/V['escala'],escala_error_relativo=float(escala(M)*V['escala']-1),rotacion_error_grados=float(math.degrees(math.acos(max(-1.,min(1.,(np.trace(R)-1)/2))))),
                desvio_vertices_mm=dict(mediana=float(np.median(d)),max=float(d.max())))
def linea(info): return f"escala {info['escala']:.5f} · error mediano {info['error_mediano_mm']:.2f} mm (p90 {info['error_p90_mm']:.2f}) · espejada {info['error_espejado_mm']:.2f} mm · cobertura {info['cobertura']:.2f} · candidato {info['candidato']} · {info['segundos']} s"

# ---------- comandos ----------
def cmd_align(a):
    S=abrir(a.nombre,a.pose); co,no,tri=malla_eval(S.b); g=importar(a.glb,a.espejo); n0=ntris(g); cs,ts=malla_obj(g)
    M,info,_=alinear(co,tri,cs,ts,S.hipz,a.ejes,a.semilla); info=resumen(M,info); print('ALIGN',a.nombre,a.pose,linea(info),flush=True)
    if info['espejo_sospechoso']: print('ALIGN aviso: la malla espejada ajusta mejor (posible inversión izquierda-derecha; ver E6). --espejo la fuerza.')
    if info['caras_invertidas']: print('ALIGN aviso: la malla generada trae las normales hacia adentro; se dan vuelta al exportar.'); g.data.flip_normals()
    g.data.transform(Matrix(M.tolist())); g.data.update(); n1=decimar(g,a.decimate)
    out=a.out or os.path.splitext(a.glb)[0]+'_alineada.glb'; exportar(g,out,a.tex)
    info.update(nombre=a.nombre,pose=a.pose,cuadro=S.cuadro,blend=S.blend,entrada=a.glb,salida=out,triangulos_entrada=n0,triangulos_salida=n1,espejo_forzado=bool(a.espejo),mb=round(os.path.getsize(out)/1e6,2))
    if a.verdad: info['verdad']=contra_verdad(M,a.verdad,co); v=info['verdad']; print(f"ALIGN contra la similitud conocida: escala {v['escala_error_relativo']*100:+.4f} % · rotación {v['rotacion_error_grados']:.4f}° · desvío de vértices mediana {v['desvio_vertices_mm']['mediana']:.3f} mm, máx {v['desvio_vertices_mm']['max']:.3f} mm")
    js=a.json or os.path.join(os.path.dirname(os.path.abspath(a.glb)),f'align_{a.pose}.json'); json.dump(info,open(js,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(f"ALIGN salida {out} ({info['mb']} MB, {n0} -> {n1} triángulos) · {js}")

def _medir(S,a,co,tri):
    """Importa la malla generada, la alinea con nuestra malla (co, tri) y devuelve su BVH ya en nuestro marco."""
    g=importar(a.glb,a.espejo); decimar(g,a.trabajo); cs,ts=malla_obj(g); M,info,orient=alinear(co,tri,cs,ts,S.hipz,a.ejes,a.semilla); info=resumen(M,info)
    g.hide_render=True; return arbol(ap(M,cs),ts),info,orient      # orient ya es el sentido de las caras de la malla transformada respecto de las nuestras
def rayos(bvh,P,N,L,orient):
    """Por punto, distancia con signo sobre su normal hasta la malla generada (rayo hacia afuera y hacia adentro, hasta L). Solo vale la
    cara que mira para el mismo lado: en la axila el rayo del torso no tiene que engancharse con la cara interna del brazo."""
    d=np.zeros(len(P)); ok=np.zeros(len(P),bool); rc=bvh.ray_cast
    for i,(p,n) in enumerate(zip(P.tolist(),N.tolist())):
        best=None
        for sg in (1.,-1.):
            h=rc(p,(n[0]*sg,n[1]*sg,n[2]*sg),L)
            if h[0] is not None and (h[1][0]*n[0]+h[1][1]*n[1]+h[1][2]*n[2])*orient>.2 and (best is None or h[3]<abs(best)): best=sg*h[3]
        if best is not None: d[i]=best; ok[i]=True
    return d,ok
def cmd_relief(a):
    S=abrir(a.nombre,'rest'); K=S.K; co,no,tri=malla_eval(S.b); short,W,dom,body=piel(S.b); w=mascara(S,short,W,body,co)
    bvh,info,orient=_medir(S,a,co,tri); print('RELIEF',a.nombre,'alineación:',linea(info),flush=True)
    sop=np.nonzero(w>.02)[0]; P,Nn,ws=co[sop],no[sop],w[sop]; L,tope,sig=a.limite*K,a.tope*K,a.suave*K/2.355     # 'suave' es el ancho a media altura de la gaussiana
    d,ok=rayos(bvh,P,Nn,L,orient); crudo=np.where(ok,d,np.nan)
    kd=KDTree(len(P))
    for i,p in enumerate(P.tolist()): kd.insert(p,i)
    kd.balance()
    # simetría: cada vértice se promedia con su espejo (el más cercano a (-x, y, z), a menos de 4 mm)
    d2,ok2=d.copy(),ok.copy(); pares=0
    for i,p in enumerate(P.tolist()):
        _,j,dist=kd.find((-p[0],p[1],p[2]))
        if dist<.004*K and j!=i:
            pares+=1; v=[x for x,o in ((d[i],ok[i]),(d[j],ok[j])) if o]
            if v: d2[i]=sum(v)/len(v); ok2[i]=True
    # suavizado gaussiano sobre los vecinos que miran para el mismo lado, solo con los vértices medidos
    d3=np.zeros(len(P)); rad=2.5*sig; okf=ok2.astype(float)
    for i,p in enumerate(P.tolist()):
        nb=kd.find_range(p,rad); j=np.fromiter((x[1] for x in nb),int,len(nb)); r=np.fromiter((x[2] for x in nb),float,len(nb))
        g=np.exp(-.5*(r/sig)**2)*okf[j]*(Nn[j]@Nn[i]>0); sw=g.sum()
        if sw>1e-9: d3[i]=(g*d2[j]).sum()/sw
    df=np.clip(d3,-tope,tope)*ws
    out=a.out or os.path.join(ROOT,'out','arte',f'detail_{a.nombre}.npz'); os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
    meta=dict(nombre=a.nombre,entrada=a.glb,blend=S.blend,K=K,limite=L,tope=tope,suave=a.suave*K,vertices=int(len(sop)),medidos=int(ok.sum()),pares_simetricos=pares,alineacion=info,
              max_mm=float(df.max()*1000),min_mm=float(df.min()*1000),por_hueso=por_grupo(dom[sop],df),crudo_por_hueso=por_grupo(dom[sop],crudo),huesos=list(MASK_BONES))
    np.savez_compressed(out,co=P.astype(np.float32),no=Nn.astype(np.float32),d=df.astype(np.float32),w=ws.astype(np.float32),crudo=crudo.astype(np.float32),meta=np.array(json.dumps(meta,ensure_ascii=False)))
    json.dump(meta,open(os.path.splitext(out)[0]+'.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(f"RELIEF {a.nombre}: {len(sop)} vértices en la zona, {int(ok.sum())} con medida ({ok.mean()*100:.1f} %), {pares} con par simétrico · desplazamiento máx {df.max()*1000:+.2f} / {df.min()*1000:+.2f} mm (tope {tope*1000:.1f})")
    for g,v in meta['por_hueso'].items(): c=meta['crudo_por_hueso'].get(g,{}); print(f"RELIEF   {g:9s} n={v['n']:6d} final: mediana {v['mediana']:+.2f} mm (p5 {v['p5']:+.2f}, p95 {v['p95']:+.2f}) · crudo: mediana {c.get('mediana',float('nan')):+.2f} mm")
    print('RELIEF salida',out)

def _color(e,rango):
    """Distancia con signo -> color lineal: azul (la generada queda por dentro) · gris claro (coincide) · rojo (queda por fuera). Sin dato: gris oscuro."""
    lin=lambda c:np.where(np.asarray(c)<=.04045,np.asarray(c)/12.92,((np.asarray(c)+.055)/1.055)**2.4)
    az,bl,ro=np.array([33,102,172])/255,np.array([235,235,235])/255,np.array([178,24,43])/255; t=np.clip(np.nan_to_num(e)/rango,-1,1)[:,None]
    c=np.where(t<0,bl+(az-bl)*(-t),bl+(ro-bl)*t); c[~np.isfinite(e)]=(.27,.27,.27); return np.concatenate([lin(c),np.ones((len(e),1))],1)
def cmd_heat(a):
    from PIL import Image, ImageDraw, ImageFont
    from common import cycles_device
    S=abrir(a.nombre,a.pose); b=S.b; me=b.data; co,no,tri=malla_eval(b); short,W,dom,body=piel(b); N=len(co)
    rest=np.empty(N*3); me.vertices.foreach_get('co',rest); rest=rest.reshape(N,3)
    bvh,info,_=_medir(S,a,co,tri); print('HEAT',a.nombre,a.pose,'alineación:',linea(info),flush=True)
    idx=np.nonzero(body)[0]; Q,_,D=cercanos(bvh,co[idx],a.limite*S.K); e=np.where(np.isfinite(D),np.sign(((Q-co[idx])*no[idx]).sum(1))*D,np.nan)
    stats=por_grupo(dom[idx],e); out=a.out or os.path.join(ROOT,'out','arte','gen',f'error_{a.pose}.png'); base=os.path.splitext(out)[0]; os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
    np.savez_compressed(base+'.npz',idx=idx.astype(np.int32),co_pose=co[idx].astype(np.float32),co_rest=rest[idx].astype(np.float32),no_pose=no[idx].astype(np.float32),e=e.astype(np.float32))
    json.dump(dict(nombre=a.nombre,pose=a.pose,cuadro=S.cuadro,entrada=a.glb,rango_mm=a.rango*1000,limite_mm=a.limite*S.K*1000,con_dato=float(np.isfinite(e).mean()),por_hueso=stats,alineacion=info,
                   signo='positivo: la malla generada queda por fuera de la nuestra (nos falta volumen)'),open(base+'.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    for g,v in stats.items(): print(f"HEAT   {g:9s} n={v['n']:6d} mediana {v['mediana']:+.2f} mm (p5 {v['p5']:+.2f}, p95 {v['p95']:+.2f})")
    # render: emisión con el color por vértice, cámara ortográfica, cuatro vistas
    col=np.tile(np.array([.05,.05,.055,1.]),(N,1)); col[idx]=_color(e,a.rango); at=me.color_attributes.new('heat','FLOAT_COLOR','POINT'); at.data.foreach_set('color',col.ravel())
    mat=bpy.data.materials.new('heat'); mat.use_nodes=True; nt=mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    o=nt.nodes.new('ShaderNodeOutputMaterial'); em=nt.nodes.new('ShaderNodeEmission'); vc=nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name='heat'
    nt.links.new(vc.outputs['Color'],em.inputs['Color']); nt.links.new(em.outputs[0],o.inputs['Surface'])
    for i in range(len(me.materials)): me.materials[i]=mat
    sc=S.sc
    for ob in [x for x in bpy.data.objects if x.name.startswith('PV_')]: bpy.data.objects.remove(ob)
    wd=bpy.data.worlds.new('heat'); wd.use_nodes=True; wt=wd.node_tree
    for n in list(wt.nodes): wt.nodes.remove(n)
    wo=wt.nodes.new('ShaderNodeOutputWorld'); bg=wt.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value=(.012,.012,.015,1); wt.links.new(bg.outputs[0],wo.inputs['Surface']); sc.world=wd
    sc.render.engine='CYCLES'; sc.cycles.samples=4; cycles_device(sc); sc.render.film_transparent=False; sc.render.image_settings.file_format='PNG'
    try: sc.cycles.use_denoising=False; sc.view_settings.view_transform='Standard'; sc.view_settings.look='None'
    except Exception: pass
    z=co[idx]; z=z[z[:,2]>=S.hipz-.05] if a.zona=='busto' else z; lo,hi=z.min(0),z.max(0); c=(lo+hi)/2; R=a.res; sc.render.resolution_x=sc.render.resolution_y=R; sc.render.resolution_percentage=100
    cam=bpy.data.objects.new('heat_cam',bpy.data.cameras.new('heat_cam')); sc.collection.objects.link(cam); cam.data.type='ORTHO'; cam.data.ortho_scale=1.08*float((hi-lo).max()); sc.camera=cam; tiles=[]
    for nm,d in (('frente',(0,-1,0)),('izquierda',(1,0,0)),('atrás',(0,1,0)),('derecha',(-1,0,0))):
        cam.location=Vector(c)+Vector(d)*5; cam.rotation_euler=(-Vector(d)).to_track_quat('-Z','Y').to_euler(); sc.render.filepath=f'{base}_{nm}.png'; bpy.ops.render.render(write_still=True); tiles.append((nm,Image.open(sc.render.filepath).convert('RGB')))
    fp=next((p for p in (os.environ.get('TARIMA_FONT',''),'/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf','/System/Library/Fonts/Supplemental/Arial Bold.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if p and os.path.exists(p)),None)
    font=lambda sz:ImageFont.truetype(fp,sz) if fp else ImageFont.load_default()
    H=R+110; sh=Image.new('RGB',(4*R,H),(10,10,12)); dr=ImageDraw.Draw(sh)
    for k,(nm,im) in enumerate(tiles): sh.paste(im,(k*R,0)); dr.text((k*R+14,10),nm,fill=(235,235,235),font=font(26)); os.remove(f'{base}_{nm}.png')
    gw=min(900,2*R); x0=30; y0=R+18; grad=(np.clip(_color(np.linspace(-a.rango,a.rango,gw),a.rango)[:,:3],0,1)); srgb=np.where(grad<=.0031308,grad*12.92,1.055*grad**(1/2.4)-.055)
    sh.paste(Image.fromarray(np.tile((srgb*255+.5).astype(np.uint8)[None],(26,1,1))),(x0,y0))
    for t in (-1,-.5,0,.5,1): dr.text((x0+int((t+1)/2*(gw-1))-18,y0+32),f'{t*a.rango*1000:+.0f}',fill=(220,220,220),font=font(20))
    dr.text((x0+gw+30,y0-4),f'mm · {a.nombre} · pose {a.pose} · {os.path.basename(a.glb)}',fill=(220,220,220),font=font(22))
    dr.text((x0+gw+30,y0+28),'rojo: la malla generada queda por fuera (nos falta) · azul: por dentro (nos sobra) · gris oscuro: sin malla generada cerca',fill=(170,170,170),font=font(18))
    dr.text((x0+gw+30,y0+56),f"alineación: error mediano {info['error_mediano_mm']:.2f} mm, escala {info['escala']:.4f}, cobertura {info['cobertura']:.2f}",fill=(170,170,170),font=font(18))
    sh.save(out); print('HEAT salida',out,base+'.json',base+'.npz')

def cmd_sint(a):
    """Malla sintética para la prueba en seco: nuestra malla posada, con los brazos inflados si se pide, ruido gaussiano por vértice y una
    similitud conocida p' = s·Rz(giro)·p + t. El ruido va en metros del atleta (antes de la similitud) o de la malla generada (después)."""
    S=abrir(a.nombre,a.pose); co,no,tri=malla_eval(S.b); rng=np.random.default_rng(a.semilla); T=M4(a.escala,rz(a.giro),[float(x) for x in a.tras.split(',')]); infl=0
    if a.inflar:
        short,W,dom,body=piel(S.b); k=body&np.isin(dom,ARM_BONES); co=co+no*(a.inflar*k)[:,None]; infl=int(k.sum())
    if a.ruido_en=='atleta': P=ap(T,co+rng.normal(0,a.ruido,co.shape))
    else: P=ap(T,co)+rng.normal(0,a.ruido,co.shape)
    me=bpy.data.meshes.new('sint'); me.from_pydata(P.tolist(),[],tri.tolist()); me.update(); ob=bpy.data.objects.new('sint',me); S.sc.collection.objects.link(ob); exportar(ob,a.out)
    json.dump(dict(T=T.tolist(),escala=a.escala,giro_z=a.giro,tras=[float(x) for x in a.tras.split(',')],ruido=a.ruido,ruido_en=a.ruido_en,inflar=a.inflar,inflados=infl,pose=a.pose,cuadro=S.cuadro,vertices=len(P),triangulos=len(tri),semilla=a.semilla),
              open(os.path.splitext(a.out)[0]+'.json','w',encoding='utf-8'),indent=1)
    print(f"SINT {a.nombre} {a.pose}: {len(P)} vértices, {len(tri)} triángulos · escala {a.escala}, giro {a.giro}° en Z, traslación {a.tras} · ruido {a.ruido*1000:.2f} mm ({a.ruido_en}) · {infl} vértices de brazo inflados {a.inflar*1000:.1f} mm · {a.out}")

def cmd_cmp(a):
    """Diferencia entre el cuerpo de dos s3b.blend (misma cantidad de vértices), proyectada sobre la normal del primero y por hueso dominante."""
    def leer(p):
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(p)); b=bpy.data.objects['Human']; n=len(b.data.vertices); co=np.empty(n*3); b.data.vertices.foreach_get('co',co); no=np.empty(n*3); b.data.vertices.foreach_get('normal',no)
        return b,co.reshape(n,3),no.reshape(n,3)
    b,c1,n1=leer(a.a); short,W,dom,body=piel(b); _,c2,_=leer(a.b)
    if len(c1)!=len(c2): raise SystemExit(f'CMP las mallas no tienen los mismos vértices: {len(c1)} y {len(c2)}')
    dn=((c2-c1)*n1).sum(1); dd=np.linalg.norm(c2-c1,axis=1); print(f'CMP {a.nombre}: {len(c1)} vértices · diferencia máx {dd.max()*1000:.3f} mm · vértices que cambian más de 0,01 mm: {int((dd>1e-5).sum())} (cuerpo {int((dd[body]>1e-5).sum())}, resto {int((dd[~body]>1e-5).sum())})')
    for g,v in por_grupo(dom,dn,body).items(): print(f"CMP   {g:9s} n={v['n']:6d} sobre la normal: mediana {v['mediana']:+.3f} mm (p5 {v['p5']:+.3f}, p95 {v['p95']:+.3f})")

# ---------- enganche del build ----------
def aplicar(path,co,no,d,ancho=None):
    """Lo llama geo.anatomy cuando existe TARIMA_DETAIL=<npz de relief>: devuelve el desplazamiento por reglas `d` más el relieve medido.
    El relieve se midió sobre la malla final de reposo, que ya tiene el relieve por reglas completo: por eso se busca por posición con
    co + no·d (la posición después de las reglas) y por defecto las reglas no se tocan; sumar las dos cosas no cuenta nada dos veces.
    TARIMA_DETAIL_ANAT=0.3 baja a esa fracción la parte ancha de las reglas (`ancho`) en la zona cubierta, como proponía el plan; solo
    tiene sentido si el relieve se midió contra un build hecho con ese mismo valor (si no, se pierde volumen).
    Corta el build si el .npz se midió sobre otra malla (menos de la mitad de sus vértices coincide a 1 mm)."""
    if not os.path.exists(path): raise SystemExit('TARIMA_DETAIL: no encuentro '+path)
    Z=np.load(path,allow_pickle=False); C,Nn,D,Wm=(Z[k].astype(float) for k in ('co','no','d','w')); kd=KDTree(len(C))
    for i,c in enumerate(C.tolist()): kd.insert(c,i)
    kd.balance(); q=co+no*d[:,None]; lo,hi=C.min(0)-.01,C.max(0)+.01; cand=np.nonzero(((q>lo)&(q<hi)).all(1))[0]; dd=np.zeros(len(co)); cov=np.zeros(len(co)); visto=np.zeros(len(C),bool)
    for i,p in zip(cand.tolist(),q[cand].tolist()):
        nb=[x for x in kd.find_n(p,4) if x[2]<.006]
        if not nb: continue
        if nb[0][2]<.001: visto[nb[0][1]]=True
        j=np.array([x[1] for x in nb]); g=np.maximum(Nn[j]@no[i],0)/(np.array([x[2] for x in nb])+5e-4); sw=g.sum()
        if sw>1e-9: dd[i]=(g*D[j]).sum()/sw; cov[i]=(g*Wm[j]).sum()/sw
    frac=float(visto.mean())
    if frac<.5: raise SystemExit(f'TARIMA_DETAIL: {path} se midió sobre otra malla (solo coincide el {frac*100:.0f} % de sus vértices). Volver a correr detail.py relief.')
    f=float(os.environ.get('TARIMA_DETAIL_ANAT','1')); out=d+dd
    if ancho is not None and f!=1: out=out-(1-f)*ancho*cov
    print(f'DETAIL {path}: relieve máx {dd.max()*1000:+.2f} / {dd.min()*1000:+.2f} mm en {int((np.abs(dd)>5e-5).sum())} vértices · coincidencia con la malla medida {frac*100:.1f} % · parte ancha de las reglas en la zona x{f:g}'+(' (AVISO: coincidencia baja)' if frac<.9 else ''))
    return out

def main():
    import argparse
    p=argparse.ArgumentParser(prog='detail.py',description='Alineación, relieve y mapa de error de una malla generada contra el personaje.'); sub=p.add_subparsers(dest='cmd',required=True)
    def comun(q,glb=True):
        q.add_argument('nombre')
        if glb: q.add_argument('glb'); q.add_argument('--ejes',action='store_true',help='probar las seis orientaciones de la malla generada'); q.add_argument('--espejo',action='store_true',help='espejar la malla generada en X antes de alinear')
        q.add_argument('--semilla',type=int,default=7)
    q=sub.add_parser('align'); comun(q); q.add_argument('--pose',default='fin'); q.add_argument('--decimate',type=int,default=300000); q.add_argument('--out'); q.add_argument('--json'); q.add_argument('--tex',action='store_true',help='conservar materiales y texturas del GLB'); q.add_argument('--verdad',help='JSON de `sint` para comparar'); q.set_defaults(f=cmd_align)
    q=sub.add_parser('relief'); comun(q); q.add_argument('--out'); q.add_argument('--limite',type=float,default=.012,help='largo del rayo (m)'); q.add_argument('--tope',type=float,default=.006,help='recorte final (m)'); q.add_argument('--suave',type=float,default=.02,help='ancho a media altura del suavizado (m)'); q.add_argument('--trabajo',type=int,default=800000,help='tope de triángulos de la malla generada para medir'); q.set_defaults(f=cmd_relief)
    q=sub.add_parser('heat'); comun(q); q.add_argument('--pose',default='fin'); q.add_argument('--out'); q.add_argument('--rango',type=float,default=.010,help='distancia que satura el color (m)'); q.add_argument('--limite',type=float,default=.03,help='distancia máxima de búsqueda (m)'); q.add_argument('--zona',choices=('busto','cuerpo'),default='busto'); q.add_argument('--res',type=int,default=800); q.add_argument('--trabajo',type=int,default=800000); q.set_defaults(f=cmd_heat)
    q=sub.add_parser('sint'); comun(q,False); q.add_argument('--out',required=True); q.add_argument('--pose',default='fin'); q.add_argument('--escala',type=float,default=.37); q.add_argument('--giro',type=float,default=25.); q.add_argument('--tras',default='0.4,-0.25,0.15'); q.add_argument('--ruido',type=float,default=.001); q.add_argument('--ruido-en',dest='ruido_en',choices=('atleta','gen'),default='atleta'); q.add_argument('--inflar',type=float,default=0.); q.set_defaults(f=cmd_sint)
    q=sub.add_parser('cmp'); q.add_argument('nombre'); q.add_argument('a'); q.add_argument('b'); q.set_defaults(f=cmd_cmp)
    a=p.parse_args(); a.f(a)
if __name__=='__main__': main()
