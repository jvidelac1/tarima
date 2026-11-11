"""Colores, nombre e indumentaria de cada personaje (ficticios)."""
import os
STYLES={'ventura':dict(H=1.70,skin='#c68b63',suit='#c4161c',trim='#f4f2ec',sleeve='#1b2a44',sleeve2='#111a2c',code='ARX',name='VENTURA',hair='#17120f',hairlen=.009,beard=.6,tattoo=True,shoe=('#f2f1ec','#d8d4c8','#c4161c','#9a6b3c'),belt='#3a2416'),
     'brenner':dict(H=1.83,skin='#dcae8c',suit='#16264a',trim='#ffd23f',sleeve='#131316',sleeve2='#2a2a30',code='NVK',name='BRENNER',hair='#5b3f24',hairlen=.012,beard=.22,tattoo=False,shoe=('#1c1c20','#e8e6df','#ffd23f','#2a2a2e'),belt='#15151a')}
# Variantes de dirección de arte (etapa 2). TARIMA_VARIANT=C: más músculo en ventura con targets de MPFB (body.VAR_C), más relieve en el
# normal map ('cut', acá abajo) y más relieve en la malla (geo.ANAT_GEO). No toca largos de segmentos. Sin la variable no cambia nada.
# TARIMA_VARIANT_MIX=0.5 deja cada valor a mitad de camino entre la versión A (la de siempre) y C; por defecto 1 (C entera).
VARIANT=os.environ.get('TARIMA_VARIANT','')
if VARIANT not in ('','C'): raise SystemExit('TARIMA_VARIANT desconocida: '+VARIANT+' (solo existe C)')
VMIX=float(os.environ.get('TARIMA_VARIANT_MIX') or 1)
def var(a,c):
    """Valor de la versión A sin variante; con TARIMA_VARIANT=C, el de C (o la mezcla A→C que diga TARIMA_VARIANT_MIX)."""
    return a+(c-a)*VMIX if VARIANT=='C' else a
if VARIANT=='C': STYLES['ventura']['cut']=var(1.0,1.35)   # relieve muscular del normal map (tex.body); sin la clave vale 1
