"""Ancho del brazo y de los hombros en píxeles, medido sobre las máscaras de tools/shots.mjs --mask.

Compara dos o más versiones del personaje en los mismos planos. Las máscaras traen el atleta solo, sobre negro, sin post ni
suavizado de bordes, con un color plano por segmento (rojo = brazo, verde = antebrazo y mano, azul = resto), y shots.json
trae la posición en píxeles de hombros y codos (huesos_px) de la misma cámara. Con eso la medida cae en el mismo punto
anatómico en cada versión aunque la silueta cambie. Son tres por plano: _mask_ (lo que se ve), _maskb_ (los brazos solos,
sin que el torso o el antebrazo los tapen) y _maskt_ (el cuerpo sin antebrazos ni manos).

Qué mide, por plano:
  brazo (izq. y der.)   largo de la corrida de píxeles del brazo sobre la recta perpendicular al húmero proyectado (hombro a
                        codo), en 7 cortes entre el 40 % y el 70 % del largo; se informa la mediana de los 7. Se mide sobre
                        _maskb_ (ancho propio del brazo). Aparte va el ancho visible, medido igual sobre los píxeles rojos de
                        _mask_: si es menor que el propio, algo tapa el brazo en ese plano y se marca.
  hombros               ancho de la silueta de _maskt_ sobre la recta que pasa por las dos articulaciones del hombro: distancia
                        entre articulaciones más, de cada lado, el tramo desde la articulación hasta el borde de la silueta
                        (ese tramo es el «casquete» del deltoides). Sin antebrazos ni manos, una mano que pasa por delante
                        no alarga ni corta la medida.
Umbral de la máscara: un píxel es del atleta si su canal mayor vale 128 o más; su clase es el canal mayor. Las rectas se
recorren de a 0,25 px con el píxel más cercano. Con el húmero en escorzo (menos de --escorzo px proyectados) la perpendicular
no es estable y el plano se marca.

Uso:
  .venv/bin/python tools/widths.py --shots out/arte/shots --tags A,C --planos P01,P04,P08,P11 --out out/arte/medidas_AC.json
      [--debug out/arte/medidas]   una imagen por versión y plano con las rectas medidas sobre la captura de arcilla (o la máscara)
      [--escorzo 60]

Necesita numpy y Pillow (ya están en el .venv).
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

STEP, CORTES = .25, (.40, .45, .50, .55, .60, .65, .70)


def clases(path):
    """(brazo, atleta) booleanos de una máscara: píxeles cuyo canal mayor es el rojo, y todos los del atleta."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    on, k = im.max(axis=2) >= 128, im.argmax(axis=2)
    return on & (k == 0), on


def at(m, x, y):
    xi, yi = int(round(x)), int(round(y))
    return 0 <= yi < m.shape[0] and 0 <= xi < m.shape[1] and bool(m[yi, xi])


def avance(m, p, d, tope=900.):
    """Distancia en px que se puede avanzar desde p en la dirección d sin salir de la máscara."""
    n = 0
    while n * STEP < tope and at(m, p[0] + d[0] * (n + 1) * STEP, p[1] + d[1] * (n + 1) * STEP):
        n += 1
    return n * STEP


def corrida(m, c, n, busca=12.):
    """Corrida de la máscara sobre la recta por c con dirección n: (largo, extremo a, extremo b). Si c cae fuera (otro
    segmento lo tapa), busca el punto de máscara más cercano sobre la misma recta hasta `busca` px."""
    p = c
    if not at(m, *c):
        for k in range(1, int(busca / STEP) + 1):
            for s in (1, -1):
                q = (c[0] + n[0] * s * k * STEP, c[1] + n[1] * s * k * STEP)
                if at(m, *q):
                    p = q
                    break
            else:
                continue
            break
        else:
            return 0., c, c
    a, b = avance(m, p, n), avance(m, p, (-n[0], -n[1]))
    return a + b + STEP, (p[0] + n[0] * a, p[1] + n[1] * a), (p[0] - n[0] * b, p[1] - n[1] * b)


def medir(path, huesos, escorzo):
    """path: la máscara _mask_; las otras dos se buscan al lado."""
    vis, on = clases(path)
    arm, sil = clases(path.replace('_mask_', '_maskb_'))[1], clases(path.replace('_mask_', '_maskt_'))[1]
    out, lineas = {'alto': int(arm.shape[0]), 'ancho': int(arm.shape[1]), 'px_brazo': int(arm.sum()), 'px_brazo_visible': int(vis.sum()), 'px_atleta': int(on.sum())}, []
    for lado, L in (('izq', 'Left'), ('der', 'Right')):
        S, E = huesos[L + 'Arm'][:2], huesos[L + 'ForeArm'][:2]
        d = (E[0] - S[0], E[1] - S[1])
        largo = math.hypot(*d)
        u = (d[0] / largo, d[1] / largo) if largo > 1e-6 else (0., 1.)
        n = (-u[1], u[0])
        ws, vs = [], []
        for f in CORTES:
            c = (S[0] + d[0] * f, S[1] + d[1] * f)
            w, a, b = corrida(arm, c, n)
            ws.append(round(w, 2))
            vs.append(round(corrida(vis, c, n)[0], 2))
            lineas.append((a, b, (255, 230, 0)))
        mw, mv = float(np.median(ws)), float(np.median(vs))
        out['brazo_' + lado] = {'px': round(mw, 2), 'cortes': ws, 'visible_px': round(mv, 2), 'cortes_visibles': vs, 'tapado': mv < mw - 1.5, 'humero_px': round(largo, 1), 'escorzo': largo < escorzo}
    SL, SR = huesos['LeftArm'][:2], huesos['RightArm'][:2]
    d = (SL[0] - SR[0], SL[1] - SR[1])
    sep = math.hypot(*d)
    u = (d[0] / sep, d[1] / sep)
    cl = avance(sil, SL, u) if at(sil, *SL) else float('nan')
    cr = avance(sil, SR, (-u[0], -u[1])) if at(sil, *SR) else float('nan')
    out['hombros'] = {'px': round(sep + cl + cr, 2), 'entre_articulaciones': round(sep, 2), 'casquete_izq': round(cl, 2), 'casquete_der': round(cr, 2)}
    if cl == cl and cr == cr:
        lineas.append(((SL[0] + u[0] * cl, SL[1] + u[1] * cl), (SR[0] - u[0] * cr, SR[1] - u[1] * cr), (0, 255, 255)))
    return out, lineas, (arm, sil)


def dibujar(dst, fondo, mask_path, lineas, huesos, arm, on):
    base = Image.open(fondo if fondo and os.path.exists(fondo) else mask_path).convert('RGB')
    if base.size != (on.shape[1], on.shape[0]):
        base = base.resize((on.shape[1], on.shape[0]))
    px = np.asarray(base).copy()
    # borde del cuerpo sin antebrazos en blanco y de los brazos solos en rojo: muestra si las máscaras calzan con la captura
    for m, colr in ((on, (255, 255, 255)), (arm, (255, 60, 60))):
        e = np.zeros_like(m)
        e[1:, :] |= m[1:, :] != m[:-1, :]
        e[:, 1:] |= m[:, 1:] != m[:, :-1]
        px[e] = colr
    im = Image.fromarray(px)
    dr = ImageDraw.Draw(im)
    for a, b, colr in lineas:
        dr.line([a, b], fill=colr, width=2)
    for k in ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'):
        x, y = huesos[k][:2]
        dr.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 0, 255), width=2)
    im.save(dst)


def pct(a, b):
    return None if not a or a != a or b != b else round((b / a - 1) * 100, 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--shots', default='out/arte/shots')
    ap.add_argument('--tags', default='A,C')
    ap.add_argument('--planos', default='P01,P04,P08,P11')
    ap.add_argument('--out', default='out/arte/medidas.json')
    ap.add_argument('--debug')
    ap.add_argument('--escorzo', type=float, default=60.)
    o = ap.parse_args()
    tags, planos = o.tags.split(','), o.planos.split(',')
    idx = json.load(open(os.path.join(o.shots, 'shots.json')))['corridas']
    res, falta = {}, []
    if o.debug:
        os.makedirs(o.debug, exist_ok=True)
    for p in planos:
        res[p] = {}
        for t in tags:
            run = idx.get(t + '_mask', {})
            q, f = run.get('planos', {}).get(p), os.path.join(o.shots, f'{t}_mask_{p}.png')
            if not q or 'huesos_px' not in q or not all(os.path.exists(f.replace('_mask_', k)) for k in ('_mask_', '_maskb_', '_maskt_')):
                falta.append(f'{t}_mask_{p}')
                continue
            m, lineas, (arm, on) = medir(f, q['huesos_px'], o.escorzo)
            m.update(commit=run.get('commit'), web=run.get('web'), px_por_metro=q.get('pxPorMetro'), lod=q.get('lod'), pos=q.get('pos'), blanco=q.get('blanco'), fov=q.get('fov'), fase=q.get('fase'), t=q.get('t'))
            res[p][t] = m
            if o.debug:
                dibujar(os.path.join(o.debug, f'{t}_{p}.png'), os.path.join(o.shots, f'{t}_clay_{p}.png'), f, lineas, q['huesos_px'], arm, on)
    base, cambios = tags[0], {}
    print(f"{'plano':5} {'medida':22} " + ' '.join(f'{t:>9}' for t in tags) + ' ' + ' '.join(f'{t + " %":>9}' for t in tags[1:]))
    for p in planos:
        if base not in res[p]:
            continue
        cambios[p] = {}
        filas = [('brazo izq', lambda m: m['brazo_izq']['px']), ('brazo der', lambda m: m['brazo_der']['px']),
                 ('brazo (media)', lambda m: (m['brazo_izq']['px'] + m['brazo_der']['px']) / 2),
                 ('brazo izq visible', lambda m: m['brazo_izq']['visible_px']), ('brazo der visible', lambda m: m['brazo_der']['visible_px']),
                 ('hombros', lambda m: m['hombros']['px']),
                 ('entre articulaciones', lambda m: m['hombros']['entre_articulaciones']), ('casquete izq', lambda m: m['hombros']['casquete_izq']),
                 ('casquete der', lambda m: m['hombros']['casquete_der']), ('casquete (media)', lambda m: (m['hombros']['casquete_izq'] + m['hombros']['casquete_der']) / 2),
                 ('área brazos solos (px²)', lambda m: m['px_brazo']), ('área atleta (px²)', lambda m: m['px_atleta'])]
        for nombre, g in filas:
            vals = [g(res[p][t]) if t in res[p] else float('nan') for t in tags]
            ps = [pct(vals[0], v) for v in vals[1:]]
            cambios[p][nombre] = {t: (None if v != v else round(v, 2)) for t, v in zip(tags, vals)} | {f'{t}_pct': x for t, x in zip(tags[1:], ps)}
            print(f'{p:5} {nombre:22} ' + ' '.join(f'{v:9.1f}' for v in vals) + ' ' + ' '.join(f'{x:+9.2f}' if x is not None else f"{'-':>9}" for x in ps))
        esc = [f"{t} {l}" for t in tags if t in res[p] for l in ('izq', 'der') if res[p][t]['brazo_' + l]['escorzo']]
        if esc:
            print(f"{p:5} AVISO húmero en escorzo (menos de {o.escorzo:g} px): {', '.join(esc)}")
        tap = [f"{t} {l}" for t in tags if t in res[p] for l in ('izq', 'der') if res[p][t]['brazo_' + l]['tapado']]
        if tap:
            print(f"{p:5} AVISO brazo tapado en parte (el ancho visible es menor que el propio): {', '.join(tap)}")
    doc = {'metodo': {'mascara': 'tools/shots.mjs --mask: atleta solo sobre negro, sin post ni suavizado; clase = canal mayor (rojo brazo, verde antebrazo y mano, azul resto); _maskb_ brazos solos, _maskt_ cuerpo sin antebrazos ni manos',
                      'umbral': 'píxel del atleta si el canal mayor >= 128', 'brazo': f'mediana de {len(CORTES)} corridas de píxeles de _maskb_ perpendiculares al húmero proyectado, entre el 40 % y el 70 % de su largo; visible = lo mismo sobre los píxeles rojos de _mask_',
                      'hombros': 'ancho de la silueta de _maskt_ sobre la recta por las dos articulaciones del hombro; casquete = de la articulación al borde', 'paso_px': STEP},
           'versiones': tags, 'medidas': res, 'resumen': cambios, 'faltan': falta}
    os.makedirs(os.path.dirname(os.path.abspath(o.out)), exist_ok=True)
    with open(o.out, 'w') as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    print(o.out)
    if falta:
        print('FALTAN: ' + ', '.join(falta))
        sys.exit(1)


if __name__ == '__main__':
    main()
