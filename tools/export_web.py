"""Copia los GLB a web/models y arma web/data/poses.json con los datos que usa el visor.
- Reempaqueta las texturas del GLB desde los PNG fuente de <TARIMA_OUT>/<nombre>/ con calidad propia por mapa
  (el normal va en JPEG 4:4:4 de alta calidad; el exportador de Blender usa una sola calidad para todo).
- Copia body_mask.png a web/models/<nombre>_mask.png (R=piel, G=tela, B=pelo) y lo avisa en poses.json con 'mask'.
- Saca los morph targets de las primitivas que no los usan (zapatillas, ojos, cinturón, pelo, pestañas): pasan a una malla y un nodo
  aparte ('<nodo>_parts') con el mismo skin, y se descartan sus accesores en cero.
- Escribe web/models/detail_cloth.png y detail_skin.png: normales de detalle en mosaico (opcionales para el visor, con la máscara G y R).
Variables: TARIMA_OUT (carpeta de salida del build), TARIMA_WEB (destino, por defecto web/),
TARIMA_WEBTEX (tope de resolución de color y normal del cuerpo: 2048 por defecto para la web; 4096 para primeros planos, ~4x memoria de GPU)."""
import io, json, os, shutil, struct, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTR=os.environ.get('TARIMA_OUT') or os.path.join(ROOT,'out')
WEB=os.environ.get('TARIMA_WEB') or os.path.join(ROOT,'web')
CAP=int(os.environ.get('TARIMA_WEBTEX','2048'))
# nombre de imagen -> (calidad JPEG, submuestreo de croma: 0 = 4:4:4, 2 = 4:2:0, tope de lado)
SPEC={'body_color':(90,2,CAP),'body_orm':(86,0,min(CAP,2048)),'body_normal':(90,0,CAP),'shoe_color':(88,2,2048),'shoe_orm':(84,0,1024),'shoe_normal':(90,0,1024),
      'belt_color':(88,2,2048),'belt_orm':(84,0,2048),'belt_normal':(90,0,2048),'eye':(92,0,1024)}
ALPHA={'hair':'Hair','lash':'Lashes'}   # imagen -> material con alfa
def repack(src,dst,imgdir):
    """Reescribe las imágenes embebidas del GLB desde los PNG fuente. Si falta PIL o algún PNG, deja esa imagen como vino."""
    d=open(src,'rb').read(); jl=struct.unpack('<I',d[12:16])[0]; J=json.loads(d[20:20+jl]); o=20+jl; bl=struct.unpack('<I',d[o:o+4])[0]; BIN=d[o+8:o+8+bl]
    try: from PIL import Image
    except ImportError: shutil.copy(src,dst); return {}
    views=J['bufferViews']; chunks=[BIN[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in views]; done={}
    for im in J.get('images',[]):
        nm=os.path.splitext(im.get('name',''))[0]; p=os.path.join(imgdir,nm+'.png')
        if nm in SPEC and 'bufferView' in im and os.path.exists(p):
            q,sub,cap=SPEC[nm]; I=Image.open(p).convert('RGB')
            if max(I.size)>cap: I=I.resize((cap*I.width//max(I.size),cap*I.height//max(I.size)),Image.LANCZOS)
            b=io.BytesIO(); I.save(b,'JPEG',quality=q,subsampling=sub,optimize=True); chunks[im['bufferView']]=b.getvalue(); im['mimeType']='image/jpeg'; done[nm]=(I.size[0],len(b.getvalue()))
    split=strip_morphs(J); chunks=gc(J,chunks); views=J['bufferViews']; done['_split']=split
    # pelo y pestañas: el exportador de Blender los pasa a JPEG y pierden el alfa; van de nuevo como PNG y el material queda en BLEND
    for im in J.get('images',[]):
        nm=os.path.splitext(im.get('name',''))[0]; p=os.path.join(imgdir,nm+'.png')
        if nm in ALPHA and 'bufferView' in im and os.path.exists(p):
            b=io.BytesIO(); Image.open(p).convert('RGBA').save(b,'PNG',optimize=True); chunks[im['bufferView']]=b.getvalue(); im['mimeType']='image/png'; done[nm]=(Image.open(p).size[0],len(b.getvalue()))
    for m in J.get('materials',[]):
        if m.get('name') in ALPHA.values(): m['alphaMode']='BLEND'; m.pop('alphaCutoff',None); m['doubleSided']=m['name']=='Lashes'
    out=bytearray()
    for v,c in zip(views,chunks):
        out+=b'\0'*(-len(out)%4); v['byteOffset']=len(out); v['byteLength']=len(c); out+=c
    out+=b'\0'*(-len(out)%4); J['buffers'][0]['byteLength']=len(out); js=json.dumps(J,separators=(',',':')).encode(); js+=b' '*(-len(js)%4)
    with open(dst,'wb') as f:
        f.write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(out))); f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js); f.write(struct.pack('<II',len(out),0x004E4942)); f.write(out)
    return done
def strip_morphs(J):
    """Las primitivas cuyos targets son todos cero pasan, sin targets, a una malla y un nodo nuevos con el mismo skin."""
    acc=J['accessors']; n=0
    zero=lambda a:all(abs(x)<1e-6 for x in acc[a].get('min',[1])+acc[a].get('max',[1]))
    for ni,node in enumerate(list(J['nodes'])):
        if 'mesh' not in node or 'skin' not in node: continue
        me=J['meshes'][node['mesh']]; keep=[]; move=[]
        for p in me['primitives']:
            ts=p.get('targets')
            if ts and all(zero(t['POSITION']) for t in ts if 'POSITION' in t): q=dict(p); q.pop('targets'); move.append(q)
            else: keep.append(p)
        if not move or not keep: continue
        me['primitives']=keep; J['meshes'].append({'name':me.get('name','mesh')+'_parts','primitives':move}); J['nodes'].append({'name':node.get('name','node')+'_parts','mesh':len(J['meshes'])-1,'skin':node['skin']}); new=len(J['nodes'])-1; n+=len(move)
        par=[x for x in J['nodes'] if ni in x.get('children',[])]
        if par: par[0]['children'].append(new)
        else:
            for sc in J.get('scenes',[]):
                if ni in sc.get('nodes',[]): sc['nodes'].append(new)
    return n
def gc(J,chunks):
    """Descarta accesores y bufferViews que ya nadie referencia y renumera."""
    used=set()
    for m in J['meshes']:
        for p in m['primitives']:
            used.update(p['attributes'].values()); used.update([p['indices']] if 'indices' in p else [])
            for t in p.get('targets',[]): used.update(t.values())
    for k in J.get('skins',[]): used.update([k['inverseBindMatrices']] if 'inverseBindMatrices' in k else [])
    for a in J.get('animations',[]):
        for sm in a['samplers']: used.update((sm['input'],sm['output']))
    am={o:i for i,o in enumerate(sorted(used))}; J['accessors']=[J['accessors'][o] for o in sorted(used)]
    for m in J['meshes']:
        for p in m['primitives']:
            p['attributes']={k:am[v] for k,v in p['attributes'].items()}
            if 'indices' in p: p['indices']=am[p['indices']]
            if 'targets' in p: p['targets']=[{k:am[v] for k,v in t.items()} for t in p['targets']]
    for k in J.get('skins',[]):
        if 'inverseBindMatrices' in k: k['inverseBindMatrices']=am[k['inverseBindMatrices']]
    for a in J.get('animations',[]):
        for sm in a['samplers']: sm['input']=am[sm['input']]; sm['output']=am[sm['output']]
    bu=set()
    for a in J['accessors']:
        if 'bufferView' in a: bu.add(a['bufferView'])
        for k in ('indices','values'):
            if 'sparse' in a: bu.add(a['sparse'][k]['bufferView'])
    for im in J.get('images',[]):
        if 'bufferView' in im: bu.add(im['bufferView'])
    bm={o:i for i,o in enumerate(sorted(bu))}
    for a in J['accessors']:
        if 'bufferView' in a: a['bufferView']=bm[a['bufferView']]
        for k in ('indices','values'):
            if 'sparse' in a: a['sparse'][k]['bufferView']=bm[a['sparse'][k]['bufferView']]
    for im in J.get('images',[]):
        if 'bufferView' in im: im['bufferView']=bm[im['bufferView']]
    J['bufferViews']=[J['bufferViews'][o] for o in sorted(bu)]; return [chunks[o] for o in sorted(bu)]
def detail_tiles(dst):
    """Normales de detalle en mosaico (256 px, +Y): trama de punto para la tela (1 mosaico = 8 mm) y poros para la piel (1 mosaico = 12 mm)."""
    try:
        import numpy as np; from PIL import Image
    except ImportError: return
    S=256; v,u=np.mgrid[0:S,0:S]/S
    def save(h,name,k):
        gu=(np.roll(h,-1,1)-np.roll(h,1,1))*k; gv=(np.roll(h,1,0)-np.roll(h,-1,0))*k; n=np.stack([-gu,-gv,np.ones_like(h)],2); n/=np.linalg.norm(n,axis=2,keepdims=True)
        Image.fromarray(((n*.5+.5)*255+.5).astype(np.uint8)).save(os.path.join(dst,name),optimize=True)
    wale=np.abs(np.sin(np.pi*16*u))**.6*(.75+.25*np.sin(2*np.pi*(24*v+.5*np.floor(16*u)))); save(wale,'detail_cloth.png',5.)
    rng=np.random.default_rng(3); f=np.fft.fft2(rng.random((S,S))-.5); fy=np.fft.fftfreq(S)[:,None]; fx=np.fft.fftfreq(S)[None,:]; r=np.hypot(fx,fy)*S
    p=np.real(np.fft.ifft2(f*np.exp(-((r-22)/9.)**2))); p/=np.abs(p).max(); save(-np.clip(p,0,1)**1.5+.3*p,'detail_skin.png',3.5)
def summary(path):
    """Qué mapas trae cada material del GLB (C=baseColor, N=normal, MR=metallicRoughness, AO=occlusion) y los morph targets."""
    d=open(path,'rb').read(); jl=struct.unpack('<I',d[12:16])[0]; J=json.loads(d[20:20+jl]); out=[]
    for m in J.get('materials',[]):
        pbr=m.get('pbrMetallicRoughness',{}); out.append(m.get('name','?')+':'+'+'.join(k for k,v in (('C','baseColorTexture' in pbr),('N','normalTexture' in m),('MR','metallicRoughnessTexture' in pbr),('AO','occlusionTexture' in m),(m.get('alphaMode',''),m.get('alphaMode','OPAQUE')!='OPAQUE')) if v))
    tn=[n for me in J.get('meshes',[]) for n in me.get('extras',{}).get('targetNames',[])]
    np_=[sum(1 for p in me['primitives'] if 'targets' in p) for me in J.get('meshes',[])]
    return ' '.join(out)+(' | morphs '+','.join(dict.fromkeys(tn))+f' en {sum(np_)} primitiva(s)' if tn else '')+f' | mallas {[len(me["primitives"]) for me in J.get("meshes",[])]}'
if __name__=='__main__':
    names=sys.argv[1:] or ['ventura','brenner']; data={}
    os.makedirs(os.path.join(WEB,'models'),exist_ok=True); os.makedirs(os.path.join(WEB,'data'),exist_ok=True)
    dst=os.path.join(WEB,'data','poses.json')
    if os.path.exists(dst): data=json.load(open(dst,encoding='utf-8'))
    for n in names:
        j=json.load(open(os.path.join(OUTR,n,'poses.json'),encoding='utf-8'))
        data[n]=dict(h=j['h'],seg=j['seg'],sub=j['sub'],segs=j['segs'],grip=j['grip'])
        g=os.path.join(WEB,'models',n+'.glb'); done=repack(os.path.join(OUTR,n,n+'.glb'),g,os.path.join(OUTR,n))
        sp=done.pop('_split',0); print(f'GLB {n}: {os.path.getsize(g)/1e6:.2f} MB; texturas '+', '.join(f'{k} {s}px {b/1e6:.2f}MB' for k,(s,b) in done.items())+f'; {sp} primitivas sin morphs')
        print(f'MAT {n}: '+summary(g))
        for mk in (os.path.join(OUTR,n,'body_mask.png'),os.path.join(OUTR,n,n+'_mask.png')):   # R=piel, G=tela, B=pelo, mismo UV que Body
            if os.path.exists(mk): shutil.copy(mk,os.path.join(WEB,'models',n+'_mask.png')); data[n]['mask']=f'models/{n}_mask.png'; break
    detail_tiles(os.path.join(WEB,'models'))
    json.dump(data,open(dst,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print('ok',list(data))
