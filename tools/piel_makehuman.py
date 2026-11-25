# Textura de piel de prueba para el skin `mh_aksel` (docs/GRAFICOS_PLAN.md): parte del difuso de la piel «mindfront_aksel_skin»
# del paquete «Skins 02» de MakeHuman (CC0; static.makehumancommunity.org/assets/assetpacks/skins02.html). El original trae un ojo
# morado pintado: se tapa con el otro ojo espejado sobre el eje de simetría de la cara. Sale a 1024 px en WebP.
# Uso: python3 tools/piel_makehuman.py Aksel_Skin_diffuse.png web/models/piel_mh_aksel.webp [recorte_de_control.png]
import sys, os, numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1:3]; vista = sys.argv[3] if len(sys.argv) > 3 else None
a = np.asarray(Image.open(src).convert('RGB')).astype('f4')
best = None
for y2 in range(2080, 2140):
    lo = np.arange(1010, 1050); d = np.abs(a[lo, 1760:1950] - a[y2 - lo, 1760:1950]).mean()      # nariz y boca, pegado al eje
    if best is None or d < best[0]: best = (d, y2)
y2 = best[1]; print('eje', y2 / 2)
H, Wd = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:Wd]; cx, cy, rx, ry = 1722, 985, 85, 105
e = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2; w = np.clip((1 - e) / .45, 0, 1); w = w * w * (3 - 2 * w)
ys = np.clip(y2 - yy, 0, H - 1); esp = a[ys, xx]
b = a * (1 - w[..., None]) + esp * w[..., None]
im = Image.fromarray(b.astype('u1'))
if vista: im.crop((1500, 820, 1960, 1300)).save(vista)
im.resize((1024, 1024), Image.LANCZOS).save(out, 'WEBP', quality=88, method=6); print(os.path.getsize(out))
