"""Suma al juego los pesistas que construyó GitHub Actions (.github/workflows/pesistas.yml). No usa Blender.
  gh run download <corrida> -R jvidelac1/tarima -D <carpeta>
  python3 tools/sumar_pesista.py <carpeta> [ids...]     (sin ids: todos los que haya en la carpeta)
De cada artefacto `pesista-<id>` copia web/models/<id>.glb, <id>_1024.glb y <id>_mask.webp a web/models/ y suma (o
reemplaza) su entrada en web/data/poses.json. No toca a los demás pesistas. Se niega si el build dejó cuadros BAD en
check() (lineas.txt), salvo con --con-bad. Después: python3 tools/plantel_web.py (ficha del juego)."""
import json, os, re, shutil, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WEB=os.environ.get('TARIMA_WEB') or os.path.join(ROOT,'web')
args=[a for a in sys.argv[1:] if not a.startswith('--')]; CON_BAD='--con-bad' in sys.argv
if not args: raise SystemExit(__doc__)
src=args[0]; solo=set(args[1:]); dst=os.path.join(WEB,'data','poses.json'); data=json.load(open(dst,encoding='utf-8')); hechos=[]
for d in sorted(os.listdir(src)):
    w=os.path.join(src,d,'web'); pj=os.path.join(w,'data','poses.json')
    if not d.startswith('pesista-') or not os.path.exists(pj): continue
    for k,v in json.load(open(pj,encoding='utf-8')).items():
        if solo and k not in solo: continue
        ln=os.path.join(src,d,'out',k,'lineas.txt'); chk=re.findall(r'^CHK %s cuadros con superposición: (\d+)'%re.escape(k),open(ln,encoding='utf-8',errors='replace').read(),re.M) if os.path.exists(ln) else []
        if (not chk or int(chk[-1])!=0) and not CON_BAD: print(f'NO se suma {k}: check() dio {chk[-1] if chk else "sin dato"} cuadros BAD (--con-bad para sumarlo igual)'); continue
        fs=[f for f in os.listdir(os.path.join(w,'models')) if re.fullmatch(re.escape(k)+r'(_1024)?\.glb|'+re.escape(k)+r'_mask2?\.(webp|png)',f)]
        if k+'.glb' not in fs: print(f'NO se suma {k}: falta {k}.glb en el artefacto'); continue
        for f in fs: shutil.copy(os.path.join(w,'models',f),os.path.join(WEB,'models',f))
        data[k]=v; hechos.append(k); print(f'{k}: '+', '.join(f'{f} {os.path.getsize(os.path.join(WEB,"models",f))/1e6:.2f} MB' for f in sorted(fs))+f' · check() {chk[-1] if chk else "?"} BAD')
json.dump(data,open(dst,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('poses.json:',list(data),'· sumados',hechos)
