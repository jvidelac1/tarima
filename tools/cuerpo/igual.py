#!/usr/bin/env python3
"""Compara el pesista por código con la lámina «realismo simplificado» del dueño, figura contra figura:
   python3 tools/cuerpo/igual.py <lámina.webp> <render.png (dos vistas lado a lado: 3/4 y espalda, fondo liso)> <salida.jpg> [tabla.txt]
Recorta de la lámina las dos figuras de pie, separa figura y fondo en ambas imágenes, las lleva a la misma altura (de la suela
a la coronilla con pelo) y mide, fila por fila, cuántos píxeles ocupa la figura (ancho ocupado, como fracción de la altura).
Escribe la hoja (lámina arriba, render abajo, y al costado el render con el contorno de la lámina encima) y la tabla con la
diferencia en % de cada franja."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
lam, ren, out = sys.argv[1], sys.argv[2], sys.argv[3]; tabla = sys.argv[4] if len(sys.argv) > 4 else None
L = Image.open(lam).convert('RGB'); R = Image.open(ren).convert('RGB')
# figuras de pie de la fila de arriba de la lámina: [caja de recorte]
CAJAS = [(150, 118, 400, 492), (630, 118, 870, 492)]
# coronilla (con pelo) y suela de cada figura, en píxeles de la lámina: medidos a mano (la sombra del piso y las zapatillas blancas no se separan bien del fondo)
ALTOS = [(129.5, 479.5), (128.5, 481)]
def mascara(im, fondo=None, tol=26):
    a = np.asarray(im).astype(np.int32)
    if fondo is None:      # fondo de la lámina: gris claro con degradé; se estima por fila con los bordes del recorte
        izq = a[:, :6].mean(axis=1); der = a[:, -6:].mean(axis=1); f = ((izq + der) / 2)[:, None, :]
    else: f = np.array(fondo)[None, None, :]
    d = np.abs(a - f).sum(axis=2)
    m = d > tol
    # limpieza: quita columnas/filas sueltas (ruido de compresión)
    return m
def recorte(m):
    ys = np.where(m.sum(axis=1) > 2)[0]; xs = np.where(m.sum(axis=0) > 2)[0]; return ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
def perfil(m, n=400, yy=None):
    """Ancho ocupado y extremos por fila, remuestreado a n filas de la suela (0) a la coronilla (1), en fracción de la altura."""
    y0, y1, x0, x1 = recorte(m)
    if yy: y0, y1 = yy; xs_ = np.where(m[int(y0):int(y0 + (y1 - y0) * .93)].sum(axis=0) > 1)[0]; x0, x1 = xs_[0], xs_[-1] + 1
    H = y1 - y0; filas = []
    for k in range(n):
        y = min(m.shape[0] - 1, int(round(y1 - 1 - (k + .5) / n * H))); r = m[y]; xs = np.where(r)[0]
        filas.append((r.sum() / H, (xs[-1] - xs[0] + 1) / H if len(xs) else 0))
    return np.array(filas), (int(round(y0)), int(round(y1)), x0, x1)
FRANJAS = [('cabeza (con pelo)', .90, .985), ('cuello', .835, .855), ('hombros', .765, .80), ('pecho y brazos', .70, .74), ('cintura y brazos', .59, .63), ('cinturón', .55, .58), ('cadera', .46, .52), ('muslos', .375, .41), ('rodillas', .27, .31), ('pantorrillas', .17, .22), ('tobillos', .095, .115)]
fig_l = [L.crop(c) for c in CAJAS]
w2 = R.width // 2; fig_r = [R.crop((0, 0, w2, R.height)), R.crop((w2, 0, R.width, R.height))]
fondo_r = np.asarray(R)[2, 2].astype(np.int32)
filas_txt = []; hojas = []
ALTO = 760
try: F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
except Exception: F = ImageFont.load_default()
for i, nombre in enumerate(['tres cuartos', 'espalda']):
    ml = mascara(fig_l[i]); mr = mascara(fig_r[i], fondo_r, 18)
    # la sombra del piso de la lámina se cuenta como figura cerca de los pies: se corta por debajo de la suela (última fila con blanco de zapatilla)
    t_, b_ = ALTOS[i][0] - CAJAS[i][1], ALTOS[i][1] - CAJAS[i][1]; ml[int(round(b_)):] = False; ml[:int(t_)] = False
    pl, bl = perfil(ml, yy=(t_, b_)); pr, br = perfil(mr)
    filas_txt.append(f'— {nombre} —   (fracción de la altura de la figura, de la suela a la coronilla con pelo)')
    filas_txt.append(f"{'franja':22s}{'lámina':>9s}{'código':>9s}{'dif %':>8s}   {'extremos lám':>13s}{'extremos cód':>13s}{'dif %':>8s}")
    for n, f0, f1 in FRANJAS:
        k0, k1 = int(f0 * 400), int(f1 * 400); a_, b_ = pl[k0:k1, 0].mean(), pr[k0:k1, 0].mean(); c_, d_ = pl[k0:k1, 1].mean(), pr[k0:k1, 1].mean()
        filas_txt.append(f'{n:22s}{a_:9.3f}{b_:9.3f}{(b_ / a_ - 1) * 100:8.1f}   {c_:13.3f}{d_:13.3f}{(d_ / c_ - 1) * 100:8.1f}')
    # imágenes a la misma altura de figura
    def norm(im, b):
        y0, y1, x0, x1 = b; m = int((y1 - y0) * .04); c = im.crop((max(0, x0 - m * 3), max(0, y0 - m), min(im.width, x1 + m * 3), min(im.height, y1 + m))); k = ALTO / c.height; return c.resize((int(c.width * k), ALTO), Image.LANCZOS)
    il, ir = norm(fig_l[i], bl), norm(fig_r[i], br)
    # contorno de la lámina sobre el render (alineado por el centro de la caja de la figura)
    def borde(m, b):
        y0, y1, x0, x1 = b; mm = m[y0:y1, x0:x1]; im = Image.fromarray((mm * 255).astype(np.uint8)); k = (ALTO / 1.08) / (y1 - y0); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        a2 = np.asarray(im) > 127; e = a2 ^ (np.roll(a2, 1, 0) & np.roll(a2, -1, 0) & np.roll(a2, 1, 1) & np.roll(a2, -1, 1) & a2); return e
    eb = borde(ml, bl); sup = ir.copy().convert('RGB'); pix = np.asarray(sup).copy(); oy = int(ALTO * .04 / 1.08); ox = (sup.width - eb.shape[1]) // 2
    ys, xs = np.where(eb); ok = (ys + oy < pix.shape[0]) & (xs + ox >= 0) & (xs + ox < pix.shape[1]); pix[ys[ok] + oy, xs[ok] + ox] = (0, 60, 255); sup = Image.fromarray(pix)
    hojas.append((il, ir, sup))
W = sum(max(a.width, b.width) + c.width for a, b, c in hojas) + 40; o = Image.new('RGB', (W, ALTO * 2 + 34), (214, 212, 218)); d = ImageDraw.Draw(o); x = 0
for a, b, c in hojas:
    w = max(a.width, b.width); o.paste(a, (x + (w - a.width) // 2, 30)); o.paste(b, (x + (w - b.width) // 2, 34 + ALTO)); o.paste(c, (x + w + 10, 34 + ALTO))
    d.text((x + 8, 6), 'LÁMINA', fill=(20, 20, 20), font=F); d.text((x + 8, 34 + ALTO + 4), 'POR CÓDIGO', fill=(20, 20, 20), font=F); d.text((x + w + 18, 34 + ALTO + 4), 'código + contorno de la lámina', fill=(0, 40, 200), font=F); x += w + c.width + 20
o.save(out, quality=90); print(out, o.size); txt = '\n'.join(filas_txt); print(txt)
if tabla: open(tabla, 'w').write(txt + '\n')
