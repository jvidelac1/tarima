"""Copia los GLB a web/models y arma web/data/poses.json con los datos que usa el visor."""
import json, os, shutil, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
names=sys.argv[1:] or ['ventura','brenner']; data={}
os.makedirs(os.path.join(ROOT,'web','models'),exist_ok=True); os.makedirs(os.path.join(ROOT,'web','data'),exist_ok=True)
dst=os.path.join(ROOT,'web','data','poses.json')
if os.path.exists(dst): data=json.load(open(dst,encoding='utf-8'))
for n in names:
    j=json.load(open(os.path.join(ROOT,'out',n,'poses.json'),encoding='utf-8'))
    data[n]=dict(h=j['h'],seg=j['seg'],sub=j['sub'],segs=j['segs'],grip=j['grip'])
    shutil.copy(os.path.join(ROOT,'out',n,n+'.glb'),os.path.join(ROOT,'web','models',n+'.glb'))
json.dump(data,open(dst,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('ok',list(data))
