#!/usr/bin/env python3
"""Arma out/arte/gen/gen_log.csv (etapa 2, E6) con lo que dejaron las corridas: de <G>.glb.json (tools/comfy_run.mjs) salen fecha, modelo,
entradas, resolución, segundos y VRAM pico; de <G>_turn.json (blender/gen_turn.py) triángulos, piezas y aristas de borde; de
<G>_align.json (blender/detail.py align), si existe, el error mediano contra nuestra malla.
  python3 tools/e6_log.py [out/arte/gen]
La VRAM pico es la de toda la placa mientras corría el trabajo (incluye lo que usen otros procesos). Los segundos de la primera corrida de
cada modelo incluyen el sha256 de los pesos y su carga desde el disco."""
import csv, glob, json, os, sys
d=sys.argv[1] if len(sys.argv)>1 else 'out/arte/gen'; rows=[]
for f in sorted(glob.glob(os.path.join(d,'G*.glb.json'))):
    m=json.load(open(f,encoding='utf-8')); g=os.path.basename(f)[:-9]; fl=m['flujo_api']; base=os.path.join(d,g)
    res=[n['inputs']['target_resolution'] for n in fl.values() if n['class_type']=='Trellis2UpsampleStage']; cond=sorted({n['class_type'] for n in fl.values() if 'Conditioning' in n['class_type']})
    unet=[x['archivo'] for x in m['modelos'] if x['clase']=='UNETLoader']
    t=json.load(open(base+'_turn.json',encoding='utf-8')) if os.path.exists(base+'_turn.json') else {}; a=json.load(open(base+'_align.json',encoding='utf-8')) if os.path.exists(base+'_align.json') else {}
    rows.append(dict(id=g,fecha=m['fecha'],condicionamiento='+'.join(cond),modelo='+'.join(unet),entradas=' '.join(os.path.relpath(i['ruta'],'out/arte') for i in m['imagenes']),resolucion=res[0] if res else '',
        segundos=m['segundos'],vram_pico_mib=m['vram_pico_mib'],triangulos=t.get('triangulos',''),vertices=t.get('vertices_soldados',''),piezas=t.get('piezas',''),aristas_de_borde=t.get('aristas_de_borde',''),
        mb=round(m['bytes']/1e6,1),semillas=' '.join(str(v) for v in m['semillas'].values()),align_pose=a.get('pose',''),align_mediana_mm=round(a['error_mediano_mm'],2) if a else '',align_p90_mm=round(a['error_p90_mm'],2) if a else '',
        align_espejada_mm=round(a['error_espejado_mm'],2) if a else '',align_escala=round(a['escala'],5) if a else '',sha256=m['sha256']))
if not rows: raise SystemExit('No hay G*.glb.json en '+d)
out=os.path.join(d,'gen_log.csv'); w=csv.DictWriter(open(out,'w',newline='',encoding='utf-8'),fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
for r in rows: print(f"GEN {r['id']}: {r['modelo']} · {r['resolucion']} · {r['segundos']} s · VRAM pico {r['vram_pico_mib']} MiB · {r['triangulos']} triángulos · {r['piezas']} piezas · {r['aristas_de_borde']} aristas de borde · alineación {r['align_mediana_mm']} mm")
print('GEN', out)
