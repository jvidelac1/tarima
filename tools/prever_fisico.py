"""Vista previa del relieve muscular (tex.anatomy) sin Blender: toma los mapas horneados de un build (maps_1024.npz y
bones_all.json del artefacto de pesistas.yml), desplaza cada texel sobre su normal y dibuja el cuerpo de frente, de costado,
de espalda y en tres cuartos con numpy (nube de puntos con z-buffer y sombreado por el gradiente de profundidad).
Sirve para ajustar las reglas de blender/tex.py en segundos antes de gastar un build. No reemplaza las fotos del juego.
  python3 tools/prever_fisico.py <carpeta out/<nombre>> <salida.jpg> [pesista del plantel para tomar 'anat'] [0 = sin relieve]"""
import sys, os, json, numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'blender'))
if not hasattr(os, 'sched_getaffinity'): os.sched_getaffinity = lambda _: range(os.cpu_count() or 4)
import tex, plantel
src = sys.argv[1].rstrip('/') + '/'; dst = sys.argv[2]; quien = sys.argv[3] if len(sys.argv) > 3 else 'kordan'; on = (sys.argv[4] if len(sys.argv) > 4 else '1') != '0'
M = np.load(src + 'maps_1024.npz'); PO = M['PO'].astype(np.float32); cov = PO[:, :, 0] > .01; PO[:, :, 0] -= 1; PO[:, :, 1] -= 1; NO = M['NO'].astype(np.float32) / 127.5 - 1
# texeles válidos (sin el margen del horneado) y sobremuestreo x2 dentro de cada isla: la nube queda densa donde el UV es chico
ok = cov.copy(); pts = []; nrs = []
for ax in (0, 1):
    dd = np.linalg.norm(PO - np.roll(PO, 1, ax), axis=2); ok &= (dd < .012) & np.roll(cov, 1, ax)
for dy, dx in ((0, 0), (0, 1), (1, 0), (1, 1)):
    o2 = ok & np.roll(ok, (-dy, -dx), (0, 1)); pts.append(((PO + np.roll(PO, (-dy, -dx), (0, 1))) / 2)[o2]); nrs.append((NO + np.roll(NO, (-dy, -dx), (0, 1)))[o2])
P = np.concatenate(pts); N = np.concatenate(nrs); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
J = {k: np.array(v[0], np.float32) for k, v in json.load(open(src + 'bones_all.json')).items()}
STY = plantel.STYLES[quien]; K = STY['H'] / 1.69; tex.ANAT.update(STY.get('anat', {}))
B, F, _ = tex.anatomy(P, N, J, K); g = tex.ANAT.get('geo', (1.15, .5)); cut = STY.get('cut', 1.)
# como geo.anatomy: masas a la malla y parte de los surcos; acá se suma el resto del surco (lo que en el juego pone el normal map)
keep = (P[:, 2] < J['Head'][2] - .0 * K) & (P[:, 2] > .1)
d = (B * g[0] + F * (g[1] + (.6 if len(sys.argv) < 6 else float(sys.argv[5]))) * cut) * keep if on else np.zeros(len(P), np.float32)
print(f'desplazamiento máx +{d.max()*1000:.1f} / {d.min()*1000:.1f} mm · volumen agregado {float((d).mean())*1000:.2f} mm medios')
Q = P + N * d[:, None]
S = 330.; Wd, Hd = int(1.25 * S), int(1.80 * S)     # px por metro
def vista(ang):
    c, s = np.cos(ang), np.sin(ang); x = Q[:, 0] * c + Q[:, 1] * s; y = -Q[:, 0] * s + Q[:, 1] * c; z = Q[:, 2]     # cámara mirando hacia +y
    px = np.clip((x * S + Wd / 2).astype(int), 0, Wd - 1); py = np.clip((Hd - 8 - z * S).astype(int), 0, Hd - 1)
    D = np.full((Hd, Wd), 9., np.float32); o = np.argsort(-y); D[py[o], px[o]] = y[o]     # el más cercano (y menor) queda último
    for _ in range(2):     # tapa agujeros de la nube
        m = D > 8; Dn = np.minimum.reduce([np.roll(D, 1, 0), np.roll(D, -1, 0), np.roll(D, 1, 1), np.roll(D, -1, 1)]); D = np.where(m, Dn, D)
    bg = D > 8
    for _ in range(2): D = np.where(bg, D, (D + np.where(np.roll(bg, 1, 0), D, np.roll(D, 1, 0)) + np.where(np.roll(bg, -1, 0), D, np.roll(D, -1, 0)) + np.where(np.roll(bg, 1, 1), D, np.roll(D, 1, 1)) + np.where(np.roll(bg, -1, 1), D, np.roll(D, -1, 1))) / 5)
    gx = (np.roll(D, -1, 1) - np.roll(D, 1, 1)) * S / 2; gz = (np.roll(D, 1, 0) - np.roll(D, -1, 0)) * S / 2
    n = np.stack([-gx, -np.ones_like(gx), -gz], 2); n /= np.linalg.norm(n, axis=2, keepdims=True)
    L1 = np.array([.55, -.6, .58]); L2 = np.array([-.75, -.3, .2]); sh = .16 + .78 * np.clip(n @ L1, 0, 1) + .22 * np.clip(n @ L2, 0, 1)
    edge = (np.abs(gx) > 3) | (np.abs(gz) > 3); sh = np.where(edge, sh * .55, sh)
    im = np.stack([sh * 1.0, sh * .8, sh * .68], 2); im[bg] = (.07, .08, .1); return (np.clip(im, 0, 1) * 255).astype(np.uint8)
ims = [vista(a) for a in (0., np.pi / 2, np.pi, -np.pi / 4)]
Image.fromarray(np.concatenate(ims, 1)).save(dst, quality=90); print(dst)
