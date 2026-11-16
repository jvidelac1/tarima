"""Vista previa de la cara con la textura de tex.py, sin Blender: proyecta los texeles (posición de reposo de maps.npz) como
puntos con z-buffer, de frente, a tres cuartos y de costado. Para mirar línea del pelo, cejas, labios y zonas de color.
  python3 tools/tex_vista.py <carpeta del pesista con maps.npz y body_color.png> salida.png"""
import sys, json, numpy as np
from PIL import Image
OUT, dst = sys.argv[1].rstrip('/') + '/', sys.argv[2]
M = np.load(OUT + 'maps.npz'); PO = M['PO'].astype(np.float32); R = PO.shape[0]
col = np.asarray(Image.open(OUT + 'body_color.png').convert('RGB').resize((R, R)), np.float32)[::-1] / 255
NO = M['NO'].astype(np.float32) / 127.5 - 1
lm = json.load(open(OUT + 'lm.json')); eye = np.array(lm['eyeL'], np.float32); chin = np.array(lm['chin'], np.float32)
cov = PO[:, :, 0] > .01; P = np.stack([PO[:, :, 0] - 1, PO[:, :, 1] - 1, PO[:, :, 2]], 2)
sel = cov & (P[:, :, 2] > chin[2] - .07); p = P[sel]; c = col[sel]; n = NO[sel]
ctr = np.array([0, eye[1] + .09, eye[2] - .01], np.float32); S = 420; sc = S / .30
def vista(yaw):
    ca, sa = np.cos(yaw), np.sin(yaw); q = p - ctr
    x = q[:, 0] * ca + q[:, 1] * sa; d = -q[:, 0] * sa + q[:, 1] * ca; z = q[:, 2]       # d: profundidad (menor = más cerca; el frente es -Y)
    nx = n[:, 0] * ca + n[:, 1] * sa; nd = -n[:, 0] * sa + n[:, 1] * ca
    L = np.array([.45, -.75, .5]); L /= np.linalg.norm(L); lam = np.clip(nx * L[0] + nd * L[1] + n[:, 2] * L[2], 0, 1) * .75 + .3
    vis = nd < .15; u = (x * sc + S / 2).astype(int); v = (S * .52 - z * sc).astype(int)
    img = np.full((S, S, 3), .16, np.float32); zb = np.full((S, S), 9., np.float32)
    o = np.argsort(-d[vis]); uu, vv, cc, dd = u[vis][o], v[vis][o], (c[vis] * lam[vis, None])[o], d[vis][o]
    for du in (-1, 0, 1):
        for dv in (-1, 0, 1):
            a = uu + du; b = vv + dv; ok = (a >= 0) & (a < S) & (b >= 0) & (b < S); img[b[ok], a[ok]] = cc[ok]
    return img
out = np.concatenate([vista(0), vista(.7), vista(1.45)], 1)
Image.fromarray((np.clip(out, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8)).save(dst); print(dst)
