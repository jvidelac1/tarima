"""Genera el pesista de la pantalla de carga (web/juego.html, #msg): un arranque en bucle, de costado, en SVG + CSS.
Las poses se dan como cadera, inclinación del tronco y posición de la barra; rodilla y codo salen por cinemática inversa en
cada cuadro, así el pie no se desliza y la barra va en las manos. Escribe web/css/carga_lev.css y el SVG por pantalla.
Uso: python3 tools/carga_svg.py      (después pegar el SVG en juego.html si cambió la geometría)"""
import math, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANK = (96.0, 168.0)                     # tobillo, fijo
SHIN, THIGH, TORSO, UP, FORE = 36, 38, 48, 31, 29
# (tiempo 0..1, cadera, inclinación del tronco en grados hacia adelante, barra)
K = [(0.00, (78, 128), 60, (106, 158)),      # en posición, la barra en el piso
     (0.14, (78, 127), 58, (106, 157)),
     (0.30, (82, 114), 48, (104, 134)),      # la barra pasa las rodillas
     (0.40, (90, 108), 15, (100, 110)),      # en la cadera
     (0.46, (95, 101), -8, (102, 96)),       # extensión
     (0.56, (84, 146), 28, (94, 46)),        # recibe abajo, brazos estirados
     (0.66, (84, 146), 28, (94, 46)),
     (0.82, (94, 104), 3, (92, -3)),         # de pie, la barra arriba
     (0.90, (94, 104), 3, (92, -3)),
     (0.95, (92, 108), 12, (101, 108)),      # la baja
     (1.00, (78, 128), 60, (106, 158))]
ease = lambda u: u * u * (3 - 2 * u)

def pose(t):
    for a, b in zip(K, K[1:]):
        if a[0] <= t <= b[0]:
            u = ease((t - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0)
            L = lambda x, y: x + (y - x) * u
            return (L(a[1][0], b[1][0]), L(a[1][1], b[1][1])), L(a[2], b[2]), (L(a[3][0], b[3][0]), L(a[3][1], b[3][1]))
    return K[0][1], K[0][2], K[0][3]

def ik(p, q, l1, l2, side):
    """Punto medio (rodilla o codo) entre p y q con largos l1, l2; side +1/-1 elige hacia qué lado se dobla."""
    dx, dy = q[0] - p[0], q[1] - p[1]; d = math.hypot(dx, dy); d = min(max(d, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0, l1 * l1 - a * a)); ux, uy = dx / math.hypot(dx, dy), dy / math.hypot(dx, dy)
    return (p[0] + ux * a - side * uy * h, p[1] + uy * a + side * ux * h)

def ang_down(p, q):   # rotación que lleva (0,1) a la dirección p→q (SVG, y hacia abajo)
    return math.degrees(math.atan2(-(q[0] - p[0]), q[1] - p[1]))

frames = []
N = 40
for i in range(N + 1):
    t = i / N; H, th, B = pose(t)
    knee = ik(H, ANK, THIGH, SHIN, -1)                  # la rodilla va hacia adelante (+x)
    psi = th; S = (H[0] + TORSO * math.sin(math.radians(psi)), H[1] - TORSO * math.cos(math.radians(psi)))
    elbow = ik(S, B, UP, FORE, 1)                       # el codo hacia atrás
    fm, fp = ang_down(H, knee), ang_down(knee, ANK); fb, fa = ang_down(S, elbow), ang_down(elbow, B)
    frames.append((t, H, fm, fp - fm, psi, fb - psi, fa - fb))

def kf(name, f):
    lines = [f'{t * 100:g}%{{transform:{f(x)}}}' for t, *x in frames]
    return f'@keyframes lev-{name}{{' + ''.join(lines) + '}'
r = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
css = ['/* Pesista de la pantalla de carga: lo genera tools/carga_svg.py (no editar a mano). Un arranque cada 3,6 s. */',
       kf('r', lambda x: f'translate({r(x[0][0])}px,{r(x[0][1])}px)'),
       kf('m', lambda x: f'rotate({r(x[1])}deg)'), kf('p', lambda x: f'rotate({r(x[2])}deg)'), kf('t', lambda x: f'rotate({r(x[3])}deg)'),
       kf('b', lambda x: f'rotate({r(x[4])}deg)'), kf('a', lambda x: f'rotate({r(x[5])}deg)')]
# pose quieta (con movimiento reducido): de pie con la barra arriba
_, H, fm, fp, psi, fb, fa = frames[int(0.86 * N)]
quieta = {'r': f'translate({r(H[0])}px,{r(H[1])}px)', 'm': f'rotate({r(fm)}deg)', 'p': f'rotate({r(fp)}deg)', 't': f'rotate({r(psi)}deg)', 'b': f'rotate({r(fb)}deg)', 'a': f'rotate({r(fa)}deg)'}
css.append('.lev g{transform-box:view-box;transform-origin:0 0}')
css.append(''.join(f'.lev .l{k}{{transform:{v};animation:lev-{k} 3.6s linear infinite}}' for k, v in quieta.items()))
css.append('@media (prefers-reduced-motion:reduce){.lev g{animation:none!important}}')
open(os.path.join(ROOT, 'web', 'css', 'carga_lev.css'), 'w').write('\n'.join(css) + '\n')
svg = f'''<svg class="lev" viewBox="0 -26 200 210" aria-hidden="true" focusable="false"><defs><radialGradient id="lev-luz" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#35e6d6" stop-opacity=".22"/><stop offset="1" stop-color="#35e6d6" stop-opacity="0"/></radialGradient></defs><ellipse cx="100" cy="178" rx="92" ry="9" fill="url(#lev-luz)"/><path d="M14 177H186" stroke="#1b2548" stroke-width="3"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M90 175L{ANK[0]:g} {ANK[1]:g}L114 175Z" stroke-width="6" fill="currentColor"/><g class="lr"><g class="lm"><path d="M0 0V{THIGH}" stroke-width="14"/><g transform="translate(0 {THIGH})"><g class="lp"><path d="M0 0V{SHIN}" stroke-width="10"/></g></g></g><g class="lt"><path d="M0 0V-{TORSO}" stroke-width="17"/><circle cx="7" cy="-{TORSO + 14}" r="9" fill="currentColor" stroke="none"/><g transform="translate(0 -{TORSO})"><g class="lb"><path d="M0 0V{UP}" stroke-width="9"/><g transform="translate(0 {UP})"><g class="la"><path d="M0 0V{FORE}" stroke-width="8"/><g transform="translate(0 {FORE})"><circle r="18" stroke="#ffd23f" stroke-width="6"/><circle r="4" fill="#ffd23f" stroke="none"/></g></g></g></g></g></g></g></g></svg>'''
open(os.path.join(ROOT, 'out', 'carga_lev.svg') if os.path.isdir(os.path.join(ROOT, 'out')) else os.devnull, 'w').write(svg)
print(svg)
print(f'css {sum(map(len, css))} bytes, svg {len(svg)} bytes')
