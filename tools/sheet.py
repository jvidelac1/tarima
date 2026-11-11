"""Hoja comparativa de la dirección de arte: una fila por plano y una columna por versión, con las capturas de tools/shots.mjs.

Cada celda lleva rotulados la versión y el plano; el encabezado de cada columna dice de qué build y qué flujo salió (lo lee
de shots.json). Arriba, si existen, van las imágenes objetivo. Si hay capturas en arcilla escribe una segunda hoja con el
sufijo _arcilla. Las versiones o planos que no existen quedan como celda vacía rotulada: no se inventa nada.

Uso:
  .venv/bin/python tools/sheet.py --shots out/arte/shots --target out/arte/target --out out/arte/comparacion_ventura.png
      [--tags A,B,C]        columnas y su orden (por defecto: todas las versiones con capturas, menos las de --skip)
      [--skip A2]           versiones que no van a la hoja (repeticiones para medir determinismo)
      [--planos P01-P16]    rango o lista (P01,P03,P07-P09)
      [--cell 800]          ancho de celda en píxeles
      [--label B="malla generada, estática"]   texto extra del encabezado de una columna (se puede repetir)
  .venv/bin/python tools/sheet.py --shots out/arte/shots --diff A A2 [--max 1.0]
      porcentaje de píxeles distintos entre dos versiones, por plano y en total (determinismo de la captura); sale con 1
      si el total pasa de --max. Escribe <shots>/diff_A_A2.json.

Solo necesita Pillow (ya está en el .venv).
"""
import argparse
import json
import os
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

BG, INK, DIM, EMPTY, BAR = (16, 18, 24), (236, 236, 230), (150, 154, 164), (34, 37, 46), (9, 10, 14)
EXT = ('.png', '.jpg', '.jpeg', '.webp')


def font(size):
    for f in ('DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Helvetica.ttc'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size)      # Pillow 10.1 o más nuevo
    except TypeError:
        return ImageFont.load_default()


def planos_de(spec):
    """'P01-P12' o 'P01,P03,P07-P09' -> lista de claves."""
    out = []
    for part in spec.split(','):
        m = re.fullmatch(r'P(\d+)(?:-P?(\d+))?', part.strip())
        if not m:
            sys.exit(f'plano mal escrito: {part}')
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        out += [f'P{i:02d}' for i in range(a, b + 1)]
    return out


def capturas(folder):
    """{versión: {plano: archivo}} para materiales del juego y para arcilla, leyendo <versión>[_clay]_Pnn.png."""
    game, clay = {}, {}
    for f in sorted(os.listdir(folder)):
        m = re.fullmatch(r'(.+?)(_clay)?_(P\d\d)\.png', f)
        if m:
            (clay if m.group(2) else game).setdefault(m.group(1), {})[m.group(3)] = os.path.join(folder, f)
    return game, clay


def fit(im, w, h):
    """Escala la imagen para que entre en w x h sin deformarla, centrada sobre el fondo."""
    im = im.convert('RGB')
    k = min(w / im.width, h / im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGB', (w, h), EMPTY)
    out.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return out


def rotulo(d, xy, text, f, pad=6):
    """Texto sobre una pastilla oscura, para que se lea encima de cualquier captura."""
    x, y = xy
    box = d.textbbox((x + pad, y + pad), text, font=f)
    d.rectangle((x, y, box[2] + pad, box[3] + pad), fill=BAR)
    d.text((x + pad, y + pad), text, font=f, fill=INK)


def hoja(sets, tags, planos, meta, runs, targets, out, cell, labels, clay):
    planos = [p for p in planos if any(p in sets.get(t, {}) for t in tags)]
    if not planos or not tags:
        return None
    cw, ch, gap, left = cell, round(cell * 9 / 16), 10, round(cell * .34)
    f1, f2, f3 = font(max(14, cell // 30)), font(max(12, cell // 44)), font(max(20, cell // 20))
    head = round(f3.size * 1.9 + f2.size * 3.6)
    width = left + len(tags) * (cw + gap) + gap
    # banda de imágenes objetivo: todas a la misma altura, repartidas en el ancho de la hoja
    th = 0
    if targets:
        tw = (width - gap * (len(targets) + 1)) // len(targets)
        th = min(round(tw * 9 / 16), round(ch * 1.6))
    top = (th + f2.size * 2 + gap * 3) if targets else 0
    height = top + head + len(planos) * (ch + gap) + gap
    im = Image.new('RGB', (width, height), BG)
    d = ImageDraw.Draw(im)
    if targets:
        d.text((gap, gap), 'IMÁGENES OBJETIVO', font=f2, fill=DIM)
        for i, t in enumerate(targets):
            x, y = gap + i * (tw + gap), gap * 2 + f2.size
            im.paste(fit(Image.open(t), tw, th), (x, y))
            rotulo(d, (x, y), f'objetivo {i + 1} · {os.path.basename(t)}', f2)
    for j, t in enumerate(tags):
        x = left + j * (cw + gap)
        r = runs.get(t + ('_clay' if clay else ''), {})
        d.text((x, top + gap), f'Versión {t}' + (' · arcilla' if clay else ''), font=f3, fill=INK)
        l1 = ' · '.join(s for s in (labels.get(t), 'malla estática ' + r['prop'] if r.get('prop') else None) if s)
        l2 = ' · '.join(s for s in (f"build {r['web']}" if r.get('web') else None, f"commit {r['commit']}" if r.get('commit') else None, (r.get('fecha') or '')[:16].replace('T', ' ')) if s)
        d.text((x, top + gap + round(f3.size * 1.35)), l1 or ('material de arcilla' if clay else 'materiales del juego'), font=f2, fill=DIM)
        d.text((x, top + gap + round(f3.size * 1.35 + f2.size * 1.45)), l2 or 'sin datos de la corrida en shots.json', font=f2, fill=DIM)
    for i, p in enumerate(planos):
        y = top + head + i * (ch + gap)
        m = meta.get(p, {})
        d.text((gap, y + 4), p, font=f3, fill=INK)
        lines = [m.get('who', ''), m.get('levantamiento', ''), re.sub(r'^\^', '', m.get('fase', '')), m.get('camara', '')]
        # la nota se parte en renglones que entren en la columna de la izquierda
        words, line = (m.get('nota') or '').split(), ''
        for w in words:
            if d.textlength(line + ' ' + w, font=f2) > left - gap * 3 and line:
                lines.append(line)
                line = w
            else:
                line = (line + ' ' + w).strip()
        lines.append(line)
        for k, s in enumerate(x for x in lines if x):
            d.text((gap, y + 4 + round(f3.size * 1.4) + k * round(f2.size * 1.4)), s, font=f2, fill=DIM)
        for j, t in enumerate(tags):
            x = left + j * (cw + gap)
            src = sets.get(t, {}).get(p)
            if src:
                im.paste(fit(Image.open(src), cw, ch), (x, y))
            else:
                d.rectangle((x, y, x + cw - 1, y + ch - 1), fill=EMPTY)
                d.text((x + cw // 2, y + ch // 2), 'sin captura', font=f2, fill=DIM, anchor='mm')
            rotulo(d, (x, y), f"{t}{' arcilla' if clay else ''} · {p}", f1)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out, optimize=True)
    return im.size


def diferencia(a, b):
    """Fracción de píxeles con algún canal distinto, fracción con diferencia mayor que 8/255 y diferencia máxima."""
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    if A.size != B.size:
        return None
    r, g, bl = ImageChops.difference(A, B).split()
    h = ImageChops.lighter(ImageChops.lighter(r, g), bl).histogram()
    n = A.width * A.height
    return (n - h[0]) / n, sum(h[9:]) / n, max(i for i, c in enumerate(h) if c)


def main():
    ap = argparse.ArgumentParser(description='Hoja comparativa de planos por versión')
    ap.add_argument('--shots', required=True)
    ap.add_argument('--target')
    ap.add_argument('--out')
    ap.add_argument('--tags')
    ap.add_argument('--skip', default='A2')
    ap.add_argument('--planos', default='P01-P16')
    ap.add_argument('--cell', type=int, default=800)
    ap.add_argument('--label', action='append', default=[])
    ap.add_argument('--diff', nargs=2, metavar=('A', 'B'))
    ap.add_argument('--max', type=float, default=1.0)
    a = ap.parse_args()
    game, clay = capturas(a.shots)
    index = {}
    try:
        with open(os.path.join(a.shots, 'shots.json'), encoding='utf-8') as fh:
            index = json.load(fh)
    except (OSError, ValueError):
        print('aviso: no hay shots.json; la hoja sale sin descripción de planos ni datos de corrida')
    meta = {p['id']: p for p in index.get('planos', [])}
    runs = index.get('corridas', {})

    if a.diff:
        t1, t2 = a.diff
        rows, tot, big, n, worst = {}, 0.0, 0.0, 0, 0
        for src in (game, clay):
            for p in sorted(set(src.get(t1, {})) & set(src.get(t2, {}))):
                r = diferencia(src[t1][p], src[t2][p])
                key = p + ('_clay' if src is clay else '')
                if r is None:
                    print(f'{key}: tamaños distintos')
                    rows[key] = None
                    continue
                rows[key] = {'pct': round(r[0] * 100, 4), 'pct_mas_de_8': round(r[1] * 100, 4), 'max': r[2]}
                tot, big, n, worst = tot + r[0], big + r[1], n + 1, max(worst, r[2])
                print(f'{key}: {r[0] * 100:.3f} % de píxeles distintos ({r[1] * 100:.3f} % con más de 8/255; diferencia máxima {r[2]}/255)')
        if not n:
            sys.exit(f'no hay planos en común entre {t1} y {t2}')
        total = tot / n * 100
        peor = max((v['pct'] for v in rows.values() if v), default=0)
        print(f'{t1} contra {t2}: {n} planos · {total:.3f} % de píxeles distintos en promedio · peor plano {peor:.3f} % · {big / n * 100:.3f} % con más de 8/255 · máximo {worst}/255')
        with open(os.path.join(a.shots, f'diff_{t1}_{t2}.json'), 'w', encoding='utf-8') as fh:
            json.dump({'a': t1, 'b': t2, 'planos': rows, 'pct_promedio': round(total, 4), 'pct_peor_plano': peor, 'max': worst}, fh, indent=1)
        sys.exit(1 if peor > a.max or any(v is None for v in rows.values()) else 0)

    if not a.out:
        sys.exit('falta --out (o --diff A B)')
    skip = set(filter(None, a.skip.split(',')))
    tags = a.tags.split(',') if a.tags else [t for t in sorted(set(game) | set(clay)) if t not in skip]
    labels = dict(x.split('=', 1) for x in a.label if '=' in x)
    targets = []
    if a.target and os.path.isdir(a.target):
        targets = [os.path.join(a.target, f) for f in sorted(os.listdir(a.target)) if f.lower().endswith(EXT)]
    planos = planos_de(a.planos)
    # si el encuadre de un plano se corrigió entre una corrida y otra, las columnas no son comparables: se avisa
    for clay_s in ('', '_clay'):
        for p in planos:
            cams = {t: json.dumps(runs[t + clay_s]['planos'][p].get('camara'), sort_keys=True) for t in tags if p in runs.get(t + clay_s, {}).get('planos', {})}
            if len(set(cams.values())) > 1:
                print(f"AVISO {p}{clay_s}: las versiones no tienen la misma cámara ({', '.join(f'{t}: {c}' for t, c in cams.items())}); hay que volver a capturar")
    done = 0
    for sets, name, is_clay in ((game, a.out, False), (clay, re.sub(r'(\.\w+)$', r'_arcilla\1', a.out), True)):
        cols = [t for t in tags if t in sets] if not a.tags else tags
        size = hoja(sets, cols, planos, meta, runs, targets, name, a.cell, labels, is_clay)
        if size:
            done += 1
            print(f"{name}: {size[0]}x{size[1]} · columnas {', '.join(cols)} · {len([p for p in planos if any(p in sets.get(t, {}) for t in cols)])} planos · {len(targets)} imágenes objetivo")
        else:
            print(f"{'arcilla' if is_clay else 'materiales del juego'}: no hay capturas, no se escribe {name}")
    sys.exit(0 if done else 1)


if __name__ == '__main__':
    main()
