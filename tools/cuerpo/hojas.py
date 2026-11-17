#!/usr/bin/env python3
"""Hojas del cuerpo por código a partir de las fotos del laboratorio (tools/banco.mjs --fotos=dir --lab=cuerpo):
   python3 tools/cuerpo/hojas.py <dir de fotos> <dir de salida> [lámina de referencia]
Escribe comparacion.jpg (de pie: frente, 3/4, perfil, espalda; arriba el cuerpo por código, abajo el actual, y la lámina)
y posiciones.jpg (las posiciones clave, por código arriba y el actual abajo)."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]; ref = sys.argv[3] if len(sys.argv) > 3 else None
W = 380
def foto(n):
    im = Image.open(os.path.join(src, n + '.png')).convert('RGB'); return im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
try: F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
except Exception: F = ImageFont.load_default()
def hoja(filas, archivo, lado=None):
    ims = [[foto(n) for _, n in f] for f in filas]; h = ims[0][0].height; cols = max(len(f) for f in filas)
    ancho = cols * W + (lado.width if lado else 0); o = Image.new('RGB', (ancho, len(filas) * h), (16, 18, 26)); d = ImageDraw.Draw(o)
    for j, f in enumerate(filas):
        for i, (txt, _) in enumerate(f):
            o.paste(ims[j][i], (i * W, j * h)); d.rectangle([i * W, j * h, i * W + 9 + d.textlength(txt, font=F), j * h + 28], fill=(0, 0, 0)); d.text((i * W + 5, j * h + 4), txt, fill=(255, 240, 180), font=F)
    if lado: o.paste(lado, (cols * W, 0))
    o.save(archivo, quality=88); print(archivo, o.size)
os.makedirs(out, exist_ok=True)
V = [('frente', 'pie-frente'), ('3/4', 'pie-34'), ('perfil', 'pie-perfil'), ('espalda', 'pie-espalda')]
lado = None
if ref:
    r = Image.open(ref).convert('RGB'); r = r.crop((120, 90, 880, 530)); h2 = 2 * foto('pie-frente_codigo').height; r = r.resize((round(r.width * (h2 // 2) / r.height), h2 // 2), Image.LANCZOS)
    lado = Image.new('RGB', (r.width, h2), (214, 212, 218)); lado.paste(r, (0, h2 // 4))
hoja([[('POR CÓDIGO · ' + t, n + '_codigo') for t, n in V], [('ACTUAL · ' + t, n + '_actual') for t, n in V]], os.path.join(out, 'comparacion.jpg'), lado)
P = [('salida', 'pos-salida'), ('tirón', 'pos-tiron'), ('sentadilla frente', 'pos-sentadilla-frente'), ('sentadilla perfil', 'pos-sentadilla-perfil'), ('rack', 'pos-rack'), ('tijera', 'pos-tijera'), ('sentadilla envión', 'pos-envion-fondo'), ('arriba frente', 'pos-arriba-frente'), ('arriba espalda', 'pos-arriba-espalda')]
filas = []
for k in (P[:5], P[5:]):
    filas.append([('CÓDIGO · ' + t, n + '_codigo') for t, n in k]); filas.append([('ACTUAL · ' + t, n + '_actual') for t, n in k])
hoja(filas, os.path.join(out, 'posiciones.jpg'))
C = [('cabeza', 'cerca-cabeza'), ('torso', 'cerca-torso'), ('manos', 'cerca-manos'), ('piernas', 'cerca-piernas')]
hoja([[('CÓDIGO · ' + t, n + '_codigo') for t, n in C], [('ACTUAL · ' + t, n + '_actual') for t, n in C]], os.path.join(out, 'detalles.jpg'))
