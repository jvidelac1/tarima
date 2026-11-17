"""Hoja de posiciones de un pesista: las viñetas del banco (`tools/banco.mjs --tomas=posiciones`: pos-s1..s6 del arranque y
pos-c1..c6 más c5p y c5q del dos tiempos) en dos hojas de 2x3, cada una junto a la lámina de referencia del biotipo.
  python3 tools/hoja_posiciones.py <carpeta con <nivel>_pos-*.png> <salida.jpg> [lámina del arranque] [lámina del dos tiempos] [nivel=alta] [título]"""
import sys, os
from PIL import Image, ImageDraw
src, dst = sys.argv[1].rstrip('/') + '/', sys.argv[2]; refs = [a for a in sys.argv[3:5] if a and os.path.exists(a)]; nivel = sys.argv[5] if len(sys.argv) > 5 else 'alta'; titulo = sys.argv[6] if len(sys.argv) > 6 else ''
ROT = {'s1': '01 inicio · perfil', 's2': '02 tirón · tres cuartos', 's3': '03 extensión · tres cuartos', 's4': '04 recepción · frente', 's5': '05 recepción · perfil', 's6': '06 fijación · espalda 3/4',
       'c1': '01 inicio · tres cuartos', 'c2': '02 cargada · perfil', 'c3': '03 rack · espalda 3/4', 'c4': '04 dip · tres cuartos', 'c5': '05 tijera · perfil', 'c6': '06 fijación · espalda 3/4', 'c5p': '05 power jerk · perfil', 'c5q': '05 squat jerk · perfil'}
W = 560
def celda(k):
    f = f'{src}{nivel}_pos-{k}.png'
    if not os.path.exists(f): im = Image.new('RGB', (W, int(W * 620 / 1280)), (40, 40, 40))
    else:
        im = Image.open(f).convert('RGB'); w, h = im.size; c = int(h * 1.02); x0 = max(0, (w - c) // 2); im = im.crop((x0, 0, x0 + min(c, w), h)); im = im.resize((W, int(W * im.height / im.width)), Image.LANCZOS)      # recorte central: el pesista entero
    d = ImageDraw.Draw(im); d.rectangle((0, im.height - 18, im.width, im.height), fill=(0, 0, 0)); d.text((6, im.height - 15), ROT[k], fill=(255, 230, 120)); return im
def hoja(keys, cols=3):
    ims = [celda(k) for k in keys]; h = max(i.height for i in ims); rows = (len(ims) + cols - 1) // cols; S = Image.new('RGB', (cols * W, rows * h), (18, 18, 18))
    for i, im in enumerate(ims): S.paste(im, ((i % cols) * W, (i // cols) * h))
    return S
partes = []
for keys, k in ((['s1', 's2', 's3', 's4', 's5', 's6'], 0), (['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c5p', 'c5q'], 1)):
    h = hoja(keys)
    if k < len(refs):
        r = Image.open(refs[k]).convert('RGB'); r = r.resize((int(r.width * h.height / r.height), h.height), Image.LANCZOS); j = Image.new('RGB', (h.width + r.width + 8, h.height), (18, 18, 18)); j.paste(h, (0, 0)); j.paste(r, (h.width + 8, 0)); h = j
    partes.append(h)
Wt = max(p.width for p in partes); T = Image.new('RGB', (Wt, sum(p.height for p in partes) + 30 + 8), (18, 18, 18)); ImageDraw.Draw(T).text((8, 8), titulo or src, fill=(255, 255, 255)); y = 30
for p in partes: T.paste(p, (0, y)); y += p.height + 8
T.save(dst, quality=88); print(dst, T.size)
