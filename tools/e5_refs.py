#!/usr/bin/env python3
"""E5 de la etapa 2 (dirección de arte): referencias repintadas con Qwen-Image-Edit-2511 y control de silueta.

Repinta las vistas de blender/refs.py (out/arte/refs) con mejor anatomía de levantador y mide que la silueta no se mueva:
IoU de la máscara contra el render crudo (objetivo 0,92 o más, hasta 2 reintentos con otra semilla) y fondo negro limpio.
Primero el frente de cada juego; después izquierda, atrás y derecha con dos imágenes de entrada (el frente repintado y el
render crudo de esa vista). Corre los trabajos con tools/comfy_run.mjs contra el ComfyUI del pod.

Uso (en el pod, desde la raíz del repo, con ComfyUI en 127.0.0.1:8188 y sin Blender corriendo):
  .venv/bin/python tools/e5_refs.py frente [--juegos rest_bust,fin_bust,fin_full] [--intentos 3]
  .venv/bin/python tools/e5_refs.py vistas [--juegos ...] [--vistas left,back,right] [--orden plan|inverso] [--intentos 3]
  .venv/bin/python tools/e5_refs.py vistas --una [...]   una sola imagen de entrada por vista (el render crudo), como el frente
  .venv/bin/python tools/e5_refs.py cerrar          arma out/arte/refs_gen/<nombre>.png (RGBA) y resumen.json; lo que no
                                                    llegó al objetivo queda con el render crudo y así se anota
  .venv/bin/python tools/e5_refs.py fichas          un JSON al lado de cada referencia final (origen, semilla, indicación, modelos,
                                                    sha256); `cerrar` ya lo hace, esto lo rehace sin tocar los PNG
  .venv/bin/python tools/e5_refs.py medir <repintada.png> <cruda.png>      mide un par suelto
  .venv/bin/python tools/e5_refs.py descartar <nombre> <semilla> <motivo>   marca un intento como descartado a ojo (no se elige más)
  .venv/bin/python tools/e5_refs.py alternativa <nombre> <semilla> <motivo> deja ese intento en refs_gen/bajo_umbral/<nombre>.png (RGBA) y lo
                                                    anota en el resumen: una repintada que vale la pena probar aunque no sea la elegida
  .venv/bin/python tools/e5_refs.py hoja [<nombre> ...]                     hoja de control por imagen en refs_gen/hojas: cruda,
                                                    repintada y diferencia de silueta (rojo = sobra, azul = falta) por intento
  .venv/bin/python tools/e5_refs.py objetivo T_A_s1 T_B_s2 T_C_s1          copia las candidatas elegidas a out/arte/target
                                                    a 1600x900 (las seis quedan en out/arte/target/candidatas)
Opciones: --umbral 16 (canal mayor a partir del cual un píxel es del atleta)  --iou 0.92  --personaje ventura

Carpetas (todas bajo out/arte/refs_gen):
  entrada/   los renders crudos compuestos sobre negro (lo que se le da a Qwen)
  qwen/      salida directa de Qwen por intento, <nombre>_s<semilla>.png, con su JSON (indicación, semilla, modelos, sha256)
  <nombre>.png   la referencia final con alfa = máscara de la repintada (o copia del render crudo si no se repintó)
  resumen.json   por imagen: origen (qwen o cruda), semilla, IoU, fondo e intentos

Medida. Máscara cruda = alfa del render >= 128. Máscara repintada = canal mayor >= umbral. A las dos se les rellenan los
huecos interiores (silueta exterior): el pelo, la barba y las rodilleras son casi negros y sin relleno contarían como fondo.
También se informa el IoU sin rellenar. Fondo = lo que queda a más de 24 px de la silueta cruda: se informa el percentil 99
y el máximo del canal mayor y la fracción de píxeles por encima de 24; «limpio» es p99 <= 10 y fracción <= 0,05 %.

El número no alcanza: la indicación v1 del frente (lista de músculos de frente y de espalda juntos) dio IoU 0,918 con la
espalda pintada sobre el pecho. Por eso la indicación v2 nombra la vista y solo los músculos que se ven desde ahí, pide no
ensanchar nada, y cada intento se mira en la hoja de control antes de darlo por bueno (`descartar` saca los que no sirven).
Con dos imágenes de entrada (frente repintado y render crudo de la vista) la silueta se conserva (IoU 0,97 a 0,99) pero Qwen
casi copia el render crudo: en orden `plan` no se ve cambio de musculatura. `vistas --una` repinta la vista sola, como el frente.

MEDIDO el 12-nov-2026 en la RTX 4090 (ComfyUI 0.45.0, 40 pasos, CFG 4, 1024x1024), con 29 intentos:
  - una imagen de entrada: 65 a 97 s (hasta 120 s con otro proceso usando la placa); dos imágenes: 157 a 169 s. VRAM pico 21,4 a 22,0 GB.
  - con denoise 1 (10 intentos) Qwen cambia la silueta cuando «corrige» la anatomía (frente con brazos arriba: IoU 0,87 y
    0,90), 2 intentos cambiaron la pose y el encuadre (IoU 0,37 y 0,48) y uno pintó la espalda sobre el pecho. Con --denoise 0.8
    (18 intentos) ninguno cambió el encuadre: 16 midieron 0,94 a 0,99, uno 0,918 y uno 0,895 (movió el brazo).
  - 12 de los 29 intentos se descartaron mirando, 9 de ellos con IoU de 0,92 o más: el IoU no ve un texto, un tatuaje de más
    o una prenda cambiada.
  - lo que conserva la silueta repinta poco: quita los textos, marca pectoral y abdomen bajo la malla y algo el deltoides. La
    receta que quedó: frente y vistas con una imagen, --denoise 0.8 (0.6 en el frente de fin_bust), indicación v5.
  - nombrar algo para prohibirlo lo hace aparecer («no belt» dio una banda en la cintura; el tatuaje nombrado en la vista
    derecha apareció en el brazo derecho): lo prohibido va en la negativa.
"""
import argparse, json, os, shutil, subprocess, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFS, GEN = 'out/arte/refs', 'out/arte/refs_gen'
PUENTES = {'@Switch (Model)': 'on_false', '@Switch (CFG)': 'on_false', '@Switch (Steps)': 'on_false'}
SEM = {'rest_bust': 2100, 'fin_bust': 2200, 'fin_full': 2300}
NVISTA = {'front': 1, 'left': 2, 'back': 3, 'right': 4}
DENOISE = 1.0     # --denoise: menos de 1 parte del render crudo con ruido (conserva más la silueta y cambia menos la forma)

V_IND = 5      # versión de las indicaciones (queda anotada en cada intento); v3 = v2 sin nombrar el cinturón en el busto; v4 = tatuaje por vista y sin estrías; v5 = la malla de cuerpo entero con piernas (salía como slip)
QUIEN = ('the same fictional adult male weightlifter with accurate, clearly readable muscle anatomy of an elite 81 kg class '
         'weightlifter, lean and athletic, not a bodybuilder')
NO_ENSANCHAR = 'Do not make the arms, shoulders, neck, torso or legs wider or thicker than they are, and do not move the hands.'
ROPA = {'bust': 'the same red sleeveless one-piece weightlifting singlet with off-white trim, with the same cut as now, completely '
                'plain: no text, no lettering',       # sin nombrar el cinturón: «no belt» en la indicación hizo aparecer una banda en la cintura (va en la negativa)
        'full': 'the same red sleeveless one-piece weightlifting singlet with off-white trim, with the same cut as now and with its '
                'legs covering the thighs down to just above the knee sleeves, completely plain: no text, no lettering; keep the brown leather belt, the dark blue knee sleeves, the white socks and the white '
                'shoes exactly as they are'}
# Solo lo que se ve desde cada vista y en cada pose (rest = brazos abiertos hacia abajo, fin = brazos arriba).
ANAT = {
    ('front', 'rest'): 'anterior and lateral deltoid heads clearly separated, defined biceps, the outer edge of the triceps, dense '
                       'forearms with brachioradialis, collarbones, the upper trapezius slope beside the neck, pectorals and abdominals '
                       'reading through the tight fabric',
    ('front', 'fin'): 'deltoids wrapping over the shoulders of the raised arms, defined biceps and triceps along the upper arms, dense '
                      'forearms, modeled armpits with the edge of the latissimus dorsi and the serratus anterior below them, pectorals '
                      'pulled upward and abdominals reading through the tight fabric',
    ('side', 'rest'): 'lateral and posterior deltoid heads, the horseshoe of the triceps, biceps and brachialis, dense forearm, the '
                      'chest and the shoulder blade reading through the tight fabric',
    ('side', 'fin'): 'deltoid, triceps and biceps of the raised arm, dense forearm, modeled armpit, the latissimus dorsi sweeping down '
                     'from the armpit, serratus anterior, the chest and the upper back reading through the tight fabric',
    ('back', 'rest'): 'posterior deltoid heads, thick trapezius, rhomboids and shoulder blades, wide latissimus dorsi, the horseshoe of '
                      'the triceps, spinal erectors reading through the tight fabric',
    ('back', 'fin'): 'posterior deltoids, triceps of the raised arms, thick trapezius, shoulder blades rotated upward, wide latissimus '
                     'dorsi sweeping down from the armpits, spinal erectors reading through the tight fabric'}
LADO = {'left': ('his left side', 'left side'), 'back': ('behind', 'back'), 'right': ('his right side', 'right side')}


def anat(vista, juego):
    return ANAT[('side' if vista in ('left', 'right') else vista, juego.split('_')[0])]


def p_frente(juego):
    return ('This is a front view: the face and the chest face the camera. Keep the exact outline, pose, framing and camera of the '
            f'figure, and keep the background pure solid black. Repaint only the surface of the body so that it reads as {QUIEN}: '
            f'{anat("front", juego)}. {NO_ENSANCHAR} He wears {ROPA[juego.split("_")[1]]}. Same face, beard, hair, skin tone, white '
            'wrist wraps and black armband tattoo on the same arm. Realistic skin. Soft even studio lighting, no cast shadows, no rim light.')


NEG = ('text, letters, numbers, logo, brand name, watermark, belt, flag, national emblem, celebrity, famous athlete, '
       'real person likeness, extra fingers, fused fingers, deformed hands, extra limbs, waxy skin, plastic skin, cartoon, anime, '
       'illustration, blurry, low resolution, gray background, gradient background, floor, cast shadow, rim light')


MIRA = {'left': 'This is a side view of the figure, seen from his left side: the face points to the left of the image.',
        'right': 'This is a side view of the figure, seen from his right side: the face points to the right of the image.',
        'back': 'This is a back view: the figure is seen from behind, the back of the head and the back face the camera.'}


def p_una(vista, juego):
    """Una sola imagen (el render crudo de la vista), como el frente: con dos imágenes Qwen casi copia el render."""
    return (f'{MIRA[vista]} Keep the exact outline, pose, framing and camera of the figure, and keep the background pure solid black. '
            f'Repaint only the surface of the body so that it reads as {QUIEN}: {anat(vista, juego)}. {NO_ENSANCHAR} '
            f'He wears {ROPA[juego.split("_")[1]]}. Same head, beard, hair, skin tone and white wrist wraps. {TATUAJE[vista]}'
            'Realistic smooth skin, muscles defined without striations or veins. Soft even studio lighting, no cast shadows, no rim light.')


# El tatuaje está solo en el brazo izquierdo. Nombrarlo en la vista derecha hizo aparecer una banda negra en el brazo derecho,
# y «only where it is now» lo borró en la izquierda: se pide conservarlo donde se ve y en la derecha va a la negativa.
TATUAJE = {'left': 'Keep the black armband tattoo on the upper arm exactly as it is. ',
           'back': 'Keep the black armband tattoo exactly as it is, on that arm only. ', 'right': ''}


def neg_de(vista):
    return NEG + ', muscle striations, veins' + (', tattoo, armband, black band on the arm' if vista == 'right' else '')


def p_vista(vista, orden, juego):
    desde, nombre = LADO[vista]; musc, ropa = anat(vista, juego), ROPA[juego.split('_')[1]]
    cara = 'The face is not visible from behind. ' if vista == 'back' else ''
    if orden == 'plan':      # imagen 1 = frente repintado, imagen 2 = render crudo de la vista
        return ('Picture 1 is the character reference, seen from the front. Picture 2 is a render of the same character seen from '
                f'{desde}. Repaint only the surface of the body in Picture 2 so that it reads as the character of Picture 1, {QUIEN}: '
                f'{musc}. Same skin and same soft even studio lighting as Picture 1. {NO_ENSANCHAR} He wears {ropa}. {cara}'
                'Keep the exact outline, pose, framing and camera of Picture 2 and its pure solid black background. Keep the armband '
                f'tattoo only where Picture 2 shows it. The result is the {nombre} view of Picture 2, not the front view.')
    return (f'Picture 1 is a render of a character seen from {desde}. Picture 2 shows the same character from the front, repainted '
            f'in the final look. Repaint only the surface of the body in Picture 1 so that it reads as the character of Picture 2, {QUIEN}: '
            f'{musc}. Same skin and same soft even studio lighting as Picture 2. {NO_ENSANCHAR} He wears {ropa}. {cara}'
            'Keep the exact outline, pose, framing and camera of Picture 1 and its pure solid black background. Keep the armband '
            f'tattoo only where Picture 1 shows it. The result is the {nombre} view.')


def ruta(*p): return os.path.join(ROOT, *p)


# ---------- máscaras y medida ----------
def rellenar(m):
    """Silueta exterior: todo lo que no es fondo conectado al borde."""
    h, w = m.shape
    pad = Image.new('L', (w + 2, h + 2), 0); pad.paste(Image.fromarray((m * 255).astype('uint8')), (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return np.asarray(pad)[1:-1, 1:-1] != 128


def sin_motas(m):
    im = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(im) > 127


def iou(a, b):
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 0.0


def caja(m):
    ys, xs = np.where(m)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None


def medir(gen_png, crudo_png, umbral=16):
    crudo = Image.open(crudo_png).convert('RGBA'); gen = Image.open(gen_png).convert('RGB')
    escalada = gen.size != crudo.size
    if escalada: gen = gen.resize(crudo.size, Image.LANCZOS)
    a = np.asarray(crudo)[..., 3] >= 128
    g = np.asarray(gen).astype(np.int32); mx = g.max(axis=2)
    m0 = sin_motas(mx >= umbral); m = rellenar(m0); ar = rellenar(a)
    lejos = ~(np.asarray(Image.fromarray((a * 255).astype('uint8')).filter(ImageFilter.MaxFilter(49))) > 127)
    f = mx[lejos]
    # techo de la medida: el propio render crudo sobre negro pasado por el mismo umbral
    c = np.asarray(crudo).astype(np.float32); cn = (c[..., :3] * (c[..., 3:4] / 255)).max(axis=2)
    techo = iou(rellenar(sin_motas(cn >= umbral)), ar)
    d = {'iou': round(iou(m, ar), 4), 'iou_sin_rellenar': round(iou(m0, a), 4), 'iou_techo_del_metodo': round(techo, 4),
         'area_cruda_px': int(ar.sum()), 'area_repintada_px': int(m.sum()), 'area_relativa': round(float(m.sum() / max(1, ar.sum())), 4),
         'caja_cruda': caja(ar), 'caja_repintada': caja(m), 'umbral': umbral, 'reescalada': escalada, 'tam': list(gen.size),
         'fondo_p50': float(np.percentile(f, 50)), 'fondo_p99': float(np.percentile(f, 99)), 'fondo_max': int(f.max()),
         'fondo_sobre_24_pct': round(float((f > 24).mean() * 100), 4)}
    d['fondo_limpio'] = bool(d['fondo_p99'] <= 10 and d['fondo_sobre_24_pct'] <= 0.05)
    return d, m


def con_alfa(gen_png, m, destino):
    """RGBA: color de la repintada, alfa = su máscara con el borde suavizado; fuera de la máscara, negro exacto."""
    g = np.asarray(Image.open(gen_png).convert('RGB')).copy()
    al = np.asarray(Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8)))
    g[al == 0] = 0
    Image.fromarray(np.dstack([g, al])).save(destino)


# ---------- corrida ----------
def entrada(nombre):
    """El render crudo compuesto sobre negro (RGB), que es lo que ve Qwen."""
    dst = ruta(GEN, 'entrada', nombre + '.png')
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        c = np.asarray(Image.open(ruta(REFS, nombre + '.png')).convert('RGBA')).astype(np.float32)
        Image.fromarray((c[..., :3] * (c[..., 3:4] / 255) + 0.5).astype('uint8')).save(dst)
    return os.path.relpath(dst, ROOT)


def correr(nombre, semilla, plan):
    sal = f'{GEN}/qwen/{nombre}_s{semilla}.png'
    if os.path.exists(ruta(sal)) and os.path.exists(ruta(sal + '.json')): return sal
    plan['trabajos'][0].update(salida=sal, semilla=semilla)
    if DENOISE < 1: plan.setdefault('fijos', {})['KSampler.denoise'] = DENOISE
    tj = ruta('out/arte/comfy', f'e5_{nombre}_s{semilla}.json'); os.makedirs(os.path.dirname(tj), exist_ok=True)
    json.dump(plan, open(tj, 'w'), ensure_ascii=False, indent=1)
    r = subprocess.run(['node', 'tools/comfy_run.mjs', '--trabajos=' + os.path.relpath(tj, ROOT)], cwd=ROOT)
    if r.returncode: sys.exit(f'comfy_run falló con {nombre} semilla {semilla}')
    return sal


def intentos_de(nombre):
    f = ruta(GEN, 'qwen', nombre + '.intentos.json')
    return json.load(open(f)) if os.path.exists(f) else []


def lote(nombre, plan_de, a):
    """Hasta a.intentos semillas; se queda con el mejor IoU entre los de fondo limpio (o el mejor a secas)."""
    juego, vista = nombre.split('_', 1)[1].rsplit('_', 1)
    base = SEM[juego] + NVISTA[vista]; hechos = intentos_de(nombre)
    k0 = max([0] + [h['ronda'] + 1 for h in hechos])
    for k in range(k0, k0 + a.intentos):
        semilla = base + 10 * k; t0 = time.time()
        sal = correr(nombre, semilla, plan_de())
        d, _ = medir(ruta(sal), ruta(REFS, nombre + '.png'), a.umbral)
        d.update(ronda=k, semilla=semilla, archivo=sal, orden=getattr(a, 'orden', None), indicacion_v=V_IND, denoise=DENOISE, segundos=round(time.time() - t0, 1))
        hechos.append(d); json.dump(hechos, open(ruta(GEN, 'qwen', nombre + '.intentos.json'), 'w'), indent=1)
        print(f"MED {nombre} s{semilla} IoU {d['iou']:.4f} (sin rellenar {d['iou_sin_rellenar']:.4f}, techo {d['iou_techo_del_metodo']:.4f}) "
              f"área x{d['area_relativa']:.3f} fondo p99 {d['fondo_p99']:.0f} máx {d['fondo_max']} >24: {d['fondo_sobre_24_pct']} % "
              f"{'limpio' if d['fondo_limpio'] else 'SUCIO'} · {d['segundos']} s", flush=True)
        hoja(nombre)
        if d['iou'] >= a.iou and d['fondo_limpio']: break
    return mejor(hechos)


def mejor(hechos):
    hechos = [h for h in hechos if not h.get('descartada')]
    if not hechos: return None
    limpios = [h for h in hechos if h['fondo_limpio']] or hechos
    return max(limpios, key=lambda h: h['iou'])


def frente_elegido(juego, a):
    nombre = f'{a.personaje}_{juego}_front'; m = mejor(intentos_de(nombre))
    return m['archivo'] if m else None


def cmd_frente(a):
    for juego in a.juegos:
        nombre = f'{a.personaje}_{juego}_front'
        m = lote(nombre, lambda: {'plantilla': 'image_qwen_image_edit_2511_int8', 'puentes': PUENTES,
                                  'trabajos': [{'indicacion': p_frente(juego), 'negativa': NEG, 'imagenes': [entrada(nombre)]}]}, a)
        print(f"FRENTE {nombre}: queda s{m['semilla']} con IoU {m['iou']:.4f}" if m else f"FRENTE {nombre}: sin intentos válidos", flush=True)


def cmd_vistas(a):
    for juego in a.juegos:
        fr = frente_elegido(juego, a)
        if not fr and not a.una: sys.exit(f'Falta el frente repintado de {juego}: correr primero `frente`.')
        for vista in a.vistas:
            nombre = f'{a.personaje}_{juego}_{vista}'; cr = entrada(nombre)
            if a.una:
                a.orden = 'una'
                plan_de = lambda: {'plantilla': 'image_qwen_image_edit_2511_int8', 'puentes': PUENTES,
                                   'trabajos': [{'indicacion': p_una(vista, juego), 'negativa': neg_de(vista), 'imagenes': [cr]}]}
            else:
                im = {'41': fr, 'ref2': cr} if a.orden == 'plan' else {'41': cr, 'ref2': fr}
                plan_de = lambda: {'plantilla': 'image_qwen_image_edit_2511_int8', 'puentes': PUENTES,
                                   'agregar': {'ref2': {'class_type': 'LoadImage', 'inputs': {'image': ''}},
                                               'ref2s': {'class_type': 'FluxKontextImageScale', 'inputs': {'image': ['ref2', 0]}}},
                                   'fijos': {'TextEncodeQwenImageEditPlus.image2': ['ref2s', 0], **({'VAEEncode.pixels': ['ref2s', 0]} if a.orden == 'plan' else {})},
                                   'trabajos': [{'indicacion': p_vista(vista, a.orden, juego), 'negativa': NEG, 'imagenes': im}]}
            m = lote(nombre, plan_de, a)
            print(f"VISTA {nombre}: queda s{m['semilla']} con IoU {m['iou']:.4f}" if m else f"VISTA {nombre}: sin intentos válidos", flush=True)


def cmd_cerrar(a):
    res = {'objetivo_iou': a.iou, 'umbral': a.umbral, 'imagenes': {}}
    for juego in a.juegos:
        for vista in ['front', 'left', 'back', 'right']:
            nombre = f'{a.personaje}_{juego}_{vista}'; hechos = intentos_de(nombre); m = mejor(hechos)
            crudo, dst = ruta(REFS, nombre + '.png'), ruta(GEN, nombre + '.png')
            fuerza = nombre in a.crudas
            if m and m['iou'] >= a.iou and m['fondo_limpio'] and not fuerza:
                d, mk = medir(ruta(m['archivo']), crudo, a.umbral); con_alfa(ruta(m['archivo']), mk, dst)
                e = {'origen': 'qwen', 'semilla': m['semilla'], 'de': m['archivo'], 'iou': d['iou'], 'fondo_p99': d['fondo_p99'], 'fondo_max': d['fondo_max']}
            else:
                shutil.copyfile(crudo, dst)
                if m and not fuerza and not any(h.get('alternativa') for h in hechos):      # la mejor repintada que no llegó al objetivo queda aparte, por si sirve igual
                    alt = ruta(GEN, 'bajo_umbral', nombre + '.png'); os.makedirs(os.path.dirname(alt), exist_ok=True)
                    d, mk = medir(ruta(m['archivo']), crudo, a.umbral); con_alfa(ruta(m['archivo']), mk, alt)
                e = {'origen': 'cruda', 'motivo': 'descartada a ojo' if fuerza and m else ('sin intentos' if not hechos else 'todos los intentos descartados a ojo' if not m else f"mejor IoU {m['iou']:.4f}, fondo {'limpio' if m['fondo_limpio'] else 'sucio'}")}
                if m and not fuerza: e.update(mejor_bajo_umbral=f'{GEN}/bajo_umbral/{nombre}.png', semilla=m['semilla'], de=m['archivo'], iou=m['iou'])
            alt = next((h for h in hechos if h.get('alternativa')), None)
            if alt:
                dalt = ruta(GEN, 'bajo_umbral', nombre + '.png'); os.makedirs(os.path.dirname(dalt), exist_ok=True)
                d, mk = medir(ruta(alt['archivo']), crudo, a.umbral); con_alfa(ruta(alt['archivo']), mk, dalt)
                e['alternativa'] = {'archivo': f'{GEN}/bajo_umbral/{nombre}.png', 'semilla': alt['semilla'], 'de': alt['archivo'], 'iou': alt['iou'], 'motivo': alt['alternativa']}
                e.pop('mejor_bajo_umbral', None)
            e['intentos'] = [{k: h.get(k) for k in ('semilla', 'iou', 'iou_sin_rellenar', 'area_relativa', 'fondo_p99', 'fondo_max', 'fondo_limpio', 'orden', 'indicacion_v', 'denoise', 'segundos', 'descartada', 'alternativa')} for h in hechos]
            res['imagenes'][nombre] = e
            print(f"{nombre}: {e['origen']}" + (f" s{e['semilla']} IoU {e['iou']:.4f}" if e['origen'] == 'qwen' else f" ({e['motivo']})"))
    json.dump(res, open(ruta(GEN, 'resumen.json'), 'w'), ensure_ascii=False, indent=1)
    # hoja final: por juego, una fila con los renders crudos y otra con lo que quedó (sobre negro)
    lado = 400; hf = Image.new('RGB', (lado * 4, (lado * 2 + 20) * len(a.juegos)), (20, 20, 20)); dr = ImageDraw.Draw(hf)
    for j, juego in enumerate(a.juegos):
        y = j * (lado * 2 + 20)
        for k, vista in enumerate(['front', 'left', 'back', 'right']):
            nombre = f'{a.personaje}_{juego}_{vista}'; e = res['imagenes'][nombre]
            for fila, f in enumerate([ruta(REFS, nombre + '.png'), ruta(GEN, nombre + '.png')]):
                im = Image.open(f).convert('RGBA'); neg = Image.new('RGBA', im.size, (0, 0, 0, 255)); neg.alpha_composite(im)
                hf.paste(neg.convert('RGB').resize((lado, lado), Image.LANCZOS), (k * lado, y + 20 + fila * lado))
            dr.text((k * lado + 6, y + 4), f"{juego} {vista}: " + (f"qwen s{e['semilla']} IoU {e['iou']:.3f}" if e['origen'] == 'qwen' else 'CRUDA'), fill=(255, 255, 255))
    hf.save(ruta(GEN, 'hoja_final.jpg'), quality=90); print(f'{GEN}/hoja_final.jpg (arriba el render crudo, abajo lo que quedó)')
    cmd_fichas(a)


def cmd_fichas(a):
    """Un JSON al lado de cada referencia final (y de cada alternativa): de dónde sale, semilla, indicación, modelos y sha256.
    No toca los PNG: lee resumen.json y la ficha que comfy_run dejó junto a la salida directa de Qwen."""
    import hashlib
    sha = lambda f: hashlib.sha256(open(f, 'rb').read()).hexdigest()
    res = json.load(open(ruta(GEN, 'resumen.json')))
    def ficha(png, e, nombre):
        d = {'archivo': png, 'sha256': sha(ruta(png)), 'origen': e.get('origen', 'qwen'), 'render_crudo': f'{REFS}/{nombre}.png',
             'sha256_render_crudo': sha(ruta(REFS, nombre + '.png')), 'iou': e.get('iou'), 'objetivo_iou': res['objetivo_iou']}
        if d['origen'] == 'qwen':
            m = json.load(open(ruta(e['de'] + '.json')))
            d.update(de=e['de'], sha256_de=m.get('sha256'), semilla=m.get('semilla'), indicacion=m.get('indicacion'), negativa=m.get('negativa'),
                     plantilla=(m.get('origen') or {}).get('plantilla'), parametros=m.get('parametros'), imagenes=m.get('imagenes'),
                     modelos=m.get('modelos'), comfyui=(m.get('comfyui') or {}).get('version'), fecha=m.get('fecha'))
        else: d['motivo'] = e.get('motivo')
        json.dump(d, open(ruta(png + '.json'), 'w'), ensure_ascii=False, indent=1)
    n = 0
    for nombre, e in res['imagenes'].items():
        ficha(f'{GEN}/{nombre}.png', e, nombre); n += 1
        if e.get('alternativa'): ficha(e['alternativa']['archivo'], dict(e['alternativa'], origen='qwen'), nombre); n += 1
    print(f'{n} fichas .png.json en {GEN}')


def cmd_descartar(a):
    nombre, semilla, motivo = a.resto[0], int(a.resto[1]), ' '.join(a.resto[2:]) or 'descartada a ojo'
    hechos = intentos_de(nombre); n = 0
    for h in hechos:
        if h['semilla'] == semilla: h['descartada'] = motivo; n += 1
    if not n: sys.exit(f'{nombre} no tiene un intento con semilla {semilla}')
    json.dump(hechos, open(ruta(GEN, 'qwen', nombre + '.intentos.json'), 'w'), ensure_ascii=False, indent=1)
    m = mejor(hechos); print(f"{nombre} s{semilla} descartada ({motivo}); queda " + (f"s{m['semilla']} IoU {m['iou']:.4f}" if m else 'sin intentos válidos'))


def cmd_alternativa(a):
    nombre, semilla, motivo = a.resto[0], int(a.resto[1]), ' '.join(a.resto[2:])
    hechos = intentos_de(nombre); h = next((x for x in hechos if x['semilla'] == semilla), None)
    if not h: sys.exit(f'{nombre} no tiene un intento con semilla {semilla}')
    for x in hechos: x.pop('alternativa', None)
    h['alternativa'] = motivo or 'alternativa'
    json.dump(hechos, open(ruta(GEN, 'qwen', nombre + '.intentos.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"{nombre} s{semilla}: alternativa (IoU {h['iou']:.4f}); `cerrar` la deja en {GEN}/bajo_umbral/{nombre}.png")


def hoja(nombre, lado=512):
    """Una fila por intento: render crudo, repintada y diferencia de silueta (rojo = la repintada sobra, azul = falta)."""
    hechos = intentos_de(nombre)
    if not hechos: return None
    crudo = ruta(REFS, nombre + '.png'); filas = []
    cr = Image.open(ruta(entrada(nombre))).convert('RGB').resize((lado, lado), Image.LANCZOS)
    ar = rellenar(np.asarray(Image.open(crudo).convert('RGBA'))[..., 3] >= 128)
    for h in hechos:
        d, m = medir(ruta(h['archivo']), crudo, h.get('umbral', 16))
        g = Image.open(ruta(h['archivo'])).convert('RGB')
        dif = np.zeros(ar.shape + (3,), 'uint8'); dif[ar & m] = 70; dif[m & ~ar] = (255, 40, 40); dif[ar & ~m] = (60, 120, 255)
        fila = Image.new('RGB', (lado * 3, lado + 22), (20, 20, 20))
        for k, im in enumerate([cr, g.resize((lado, lado), Image.LANCZOS), Image.fromarray(dif).resize((lado, lado), Image.LANCZOS)]): fila.paste(im, (k * lado, 22))
        ImageDraw.Draw(fila).text((6, 5), f"{nombre} s{h['semilla']} v{h.get('indicacion_v', 1)} d{h.get('denoise', 1.0)} {h.get('orden') or ''} IoU {h['iou']:.4f} area x{h['area_relativa']:.3f} fondo p99 {h['fondo_p99']:.0f}"
                                  + (' DESCARTADA: ' + h['descartada'] if h.get('descartada') else '') + (' ALTERNATIVA' if h.get('alternativa') else ''), fill=(255, 255, 255))
        filas.append(fila)
    out = Image.new('RGB', (lado * 3, sum(f.size[1] for f in filas))); y = 0
    for f in filas: out.paste(f, (0, y)); y += f.size[1]
    dst = ruta(GEN, 'hojas', nombre + '.jpg'); os.makedirs(os.path.dirname(dst), exist_ok=True); out.save(dst, quality=88)
    return dst


def cmd_hoja(a):
    nombres = a.resto or [f'{a.personaje}_{j}_{v}' for j in a.juegos for v in ['front', 'left', 'back', 'right']]
    for n in nombres:
        d = hoja(n); print(d or f'{n}: sin intentos')


def cmd_objetivo(a):
    os.makedirs(ruta('out/arte/target'), exist_ok=True)
    for n in a.resto:
        src = ruta('out/arte/target/candidatas', n + '.png'); im = Image.open(src).convert('RGB')
        im.resize((1600, 900), Image.LANCZOS).save(ruta('out/arte/target', n + '.png'))
        meta = json.load(open(src + '.json'))
        json.dump({'elegida': n, 'de': f'out/arte/target/candidatas/{n}.png', 'tam_original': list(im.size), 'tam': [1600, 900],
                   'sha256_original': meta.get('sha256'), 'semilla': meta.get('semilla'), 'indicacion': meta.get('indicacion'),
                   'negativa': meta.get('negativa'), 'modelos': meta.get('modelos')}, open(ruta('out/arte/target', n + '.png.json'), 'w'), ensure_ascii=False, indent=1)
        print(f'objetivo {n}: {im.size[0]}x{im.size[1]} -> 1600x900')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['frente', 'vistas', 'cerrar', 'fichas', 'medir', 'objetivo', 'descartar', 'alternativa', 'hoja']); ap.add_argument('resto', nargs='*')
    ap.add_argument('--juegos', default='rest_bust,fin_bust,fin_full'); ap.add_argument('--vistas', default='left,back,right')
    ap.add_argument('--orden', default='plan', choices=['plan', 'inverso']); ap.add_argument('--intentos', type=int, default=3)
    ap.add_argument('--umbral', type=int, default=16); ap.add_argument('--iou', type=float, default=0.92)
    ap.add_argument('--crudas', default='', help='nombres que quedan con el render crudo aunque midan bien (descartadas a ojo)')
    ap.add_argument('--personaje', default='ventura')
    ap.add_argument('--una', action='store_true', help='vistas: una sola imagen de entrada (el render crudo), sin el frente repintado')
    ap.add_argument('--denoise', type=float, default=1.0, help='denoise del muestreador; el lienzo es el render crudo de la vista (en orden plan, se cambia el lienzo a la imagen 2)')
    a = ap.parse_args(); DENOISE = a.denoise; a.juegos = a.juegos.split(','); a.vistas = a.vistas.split(','); a.crudas = [x for x in a.crudas.split(',') if x]
    if a.cmd == 'medir':
        d, _ = medir(a.resto[0], a.resto[1], a.umbral); print(json.dumps(d, indent=1))
    else: {'frente': cmd_frente, 'vistas': cmd_vistas, 'cerrar': cmd_cerrar, 'fichas': cmd_fichas, 'objetivo': cmd_objetivo, 'descartar': cmd_descartar, 'alternativa': cmd_alternativa, 'hoja': cmd_hoja}[a.cmd](a)
