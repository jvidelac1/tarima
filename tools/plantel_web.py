"""Escribe web/data/plantel.json: la ficha de cada pesista del plantel (blender/plantel.py) para el juego y el visor.
Identidad ficticia, género, categoría IWF, estatura y los colores como PARÁMETROS (piel, pelo, malla...), que es lo que
necesitan los materiales por parámetro del juego. `listo` dice si el modelo ya está en web/models (entrada en poses.json).
`ternas`: combinaciones con nombre para `juego.html?plantel=<terna>` (los tres pesistas del juego, en el orden Compacto,
Largo, Potente). No usa Blender.   python3 tools/plantel_web.py"""
import json, os, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0,os.path.join(ROOT,'blender'))
import plantel
WEB=os.environ.get('TARIMA_WEB') or os.path.join(ROOT,'web')
poses=json.load(open(os.path.join(WEB,'data','poses.json'),encoding='utf-8'))
P={}
for k in plantel.PESISTAS:
    f=plantel.ficha(k); f['listo']=k in poses
    if f['listo']: f['medidas']=dict(estatura=poses[k]['h'],femur=round(poses[k]['seg']['femur']/poses[k]['h'],3),brazos=round(poses[k]['seg']['arm']/poses[k]['h'],3))
    P[k]=f
# Ternas de prueba. Con dos mujeres en el plantel, la tercera plaza repite modelo (el juego le pone la tela de otro color, como a Marangi).
TERNAS=dict(mujeres=['solanet','halvard','halvard'],hombres=['ilarraz','brenner','jastrev'],livianos=['solanet','ilarraz','ventura'],pesados=['halvard','jastrev','brenner'],mixto=['solanet','jastrev','halvard'])
out=dict(v=1,iwf=plantel.IWF,pesistas=P,ternas={k:v for k,v in TERNAS.items() if all(P.get(x,{}).get('listo') for x in v)})
json.dump(out,open(os.path.join(WEB,'data','plantel.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('plantel.json:',', '.join(f"{k}{'' if v['listo'] else ' (sin modelo)'}" for k,v in P.items()),'· ternas',list(out['ternas']))
