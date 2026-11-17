"""Plantel paramétrico: un pesista = un conjunto de parámetros. Python puro (sin bpy): lo leen body.py (cuerpo),
style.py (indumentaria y texturas), el workflow de GitHub Actions y tools/plantel_web.py (ficha para el juego).

Todos los pesistas son FICTICIOS: nombres, caras, países y códigos inventados. Nada remite a un atleta real.

Cómo se agrega uno: una entrada nueva en PESISTAS (abajo) y un build en Actions. El paso a paso está en docs/PLANTEL.md.

Parámetros de una entrada (los que no se ponen salen de reglas según género, categoría y estatura):
  nombre, pais, codigo      identidad ficticia (el código va en el pecho de la malla; el apellido, en la espalda)
  genero                    'M' o 'F'
  categoria                 categoría de peso corporal de la IWF vigente (ver IWF): '65', '+110', '48', '+86'...
  estatura                  metros
  masa                      kg. Por defecto el tope de la categoría; obligatorio en las categorías abiertas ('+110', '+86').
                            body.py ajusta el volumen del cuerpo hasta que la masa estimada (volumen x densidad) da este valor.
  musculo                   0..1 masa muscular (macro 'muscle' de MPFB y peso de los grupos musculares)
  grasa                     0..1 adiposidad: panza, definición muscular, venas, cara más llena, densidad corporal
  prop                      proporciones. Como fracción de la estatura, medidas entre articulaciones del esqueleto (body.py
                            ajusta el cuerpo hasta que el esqueleto las cumple): femur (cadera a rodilla), tibia (rodilla a
                            tobillo), brazo (hombro a muñeca), hombros (ancho entre articulaciones); antebrazo es la parte
                            del brazo que es antebrazo (0,495 por defecto). Sin poner, salen de la
                            regla proporciones(): el más alto de su género tiene palancas más largas; el más pesado, hombros
                            más anchos. Como desvío -1..1 de MPFB: torso (largo), cadera (ancho), gluteos, cintura.
  rasgos                    mezcla (africano, asiático, caucásico) de los rasgos base de MPFB; suma 1
  cara                      lista de (target de MPFB, peso) que define la cara; ver vendor/mpfb2/src/mpfb/data/targets
  piel                      tono: nombre de PIEL o '#rrggbb'. Es un parámetro: va también a la ficha del juego (plantel.json)
  pelo                      dict(color, peinado, largo, barba, entradas, degrade). Peinados: 'corto', 'rapado', 'rodete' (bajo,
                            en la nuca) y 'rodete_alto' (en la coronilla). El rodete es pelo atado tirante con un moño de malla.
  uniforme                  dict(malla, vivo, rodillera, rodillera2, cinturon o None, zapatillas=(capellada, suela, acento, taco))
  ojos                      color del iris
  tatuaje                   True/False (bandas geométricas inventadas en el brazo izquierdo)
  juego                     lo que usa la interfaz del juego y del visor: dict(color, bandera (degradé CSS de un país inventado),
                            dorsal, kg=dict(s, c) intentos de referencia del visor)
"""
import math

# Categorías de peso corporal de la IWF para mayores y juveniles, vigentes desde el 1 de junio de 2025 (8 por género).
# Verificadas en la web el 15-nov-2026: anuncio de la IWF del 20-dic-2024 («New bodyweight categories from June 1, 2025»)
# y actualización del 8-may-2025, que cambió la de 98 kg de hombres por 94 kg; las de mujeres quedaron como se anunciaron.
IWF = dict(M=('60', '65', '71', '79', '88', '94', '110', '+110'), F=('48', '53', '58', '63', '69', '77', '86', '+86'))

# Tonos de piel de referencia (albedo sRGB antes del sombreado). Se puede poner cualquier '#rrggbb'.
PIEL = dict(muy_clara='#ecc4a6', clara='#dcae8c', media='#c68b63', trigueña='#b07a55', morena='#93603f', oscura='#74482f', muy_oscura='#56331f')

# ---------- los dos originales, tal como estaban en body.py y style.py (no se recalculan: sus builds no cambian) ----------
_LEGADO_CFG = {
 'ventura':dict(height=1.70,macro=dict(gender=1.0,age=.5,muscle=1.0,weight=.62,height=.4,proportions=.8,african=.15,asian=.15,caucasian=.7),
   legs=dict(up=-.05,low=-.3),arms=dict(up=.15,low=.12),torso=.4,extra=[('torso/torso-vshape-incr',.3),('buttocks/buttocks-volume-incr',.6),('torso/measure-shoulder-dist-incr',.35)],
   # estructura de la cara (ficticia): cabeza cuadrada, mandíbula ancha, pómulos marcados, nariz corta y ancha
   face=[('head/head-square',.55),('chin/chin-width-incr',.5),('chin/chin-bones-incr',.4),('nose/nose-width2-incr',.4),('nose/nose-scale-vert-decr',.3),('cheek/l-cheek-bones-incr',.5),('cheek/r-cheek-bones-incr',.5),('forehead/forehead-nubian-incr',.3),('eyebrows/eyebrows-trans-down',.4)]),
 'brenner':dict(height=1.83,macro=dict(gender=1.0,age=.5,muscle=1.0,weight=.5,height=.6,proportions=.75,african=.0,asian=.0,caucasian=1.0),
   legs=dict(up=.4,low=.25),arms=dict(up=.6,low=.45),torso=0,extra=[('torso/torso-vshape-incr',.45),('buttocks/buttocks-volume-incr',.4),('torso/measure-shoulder-dist-incr',.6)],
   # cara larga y angulosa: mentón prominente con hoyuelo, nariz larga con caballete, mejillas hundidas
   face=[('head/head-rectangular',.5),('chin/chin-prominent-incr',.45),('chin/chin-cleft-incr',.5),('chin/chin-height-incr',.3),('nose/nose-hump-incr',.45),('nose/nose-scale-vert-incr',.35),('nose/nose-width2-decr',.3),('cheek/l-cheek-volume-decr',.4),('cheek/r-cheek-volume-decr',.4),('forehead/forehead-temple-decr',.3),('eyebrows/eyebrows-angle-down',.3)]),
}
_LEGADO_STY = {
 'ventura':dict(H=1.70,skin='#c68b63',suit='#c4161c',trim='#f4f2ec',sleeve='#1b2a44',sleeve2='#111a2c',code='ARX',name='VENTURA',hair='#17120f',hairlen=.009,beard=.6,tattoo=True,shoe=('#f2f1ec','#d8d4c8','#c4161c','#9a6b3c'),belt='#3a2416'),
 'brenner':dict(H=1.83,skin='#dcae8c',suit='#16264a',trim='#ffd23f',sleeve='#131316',sleeve2='#2a2a30',code='NVK',name='BRENNER',hair='#5b3f24',hairlen=.012,beard=.22,tattoo=False,shoe=('#1c1c20','#e8e6df','#ffd23f','#2a2a2e'),belt='#15151a'),
}

PESISTAS = {
 # Los dos originales (81 y 96 kg eran categorías del ciclo anterior; con las vigentes les tocan 88 y 94).
 'ventura': dict(nombre='Dario Ventura', pais='Arxenia', codigo='ARX', genero='M', categoria='88', estatura=1.70, legado=True,
   juego=dict(color='#e2622b', bandera='linear-gradient(115deg,#e2622b 0 38%,#0e1b3d 38% 62%,#e2622b 62%)', dorsal=7, kg=dict(s=158, c=194))),
 'brenner': dict(nombre='Ilya Brenner', pais='Novakia', codigo='NVK', genero='M', categoria='94', estatura=1.83, legado=True,
   juego=dict(color='#9a6fe0', bandera='linear-gradient(90deg,#5a2a82 0 34%,#f4f1ea 34% 66%,#18a58f 66%)', dorsal=12, kg=dict(s=176, c=213))),

 # ---- plantel de prueba: dos mujeres y dos hombres, liviano y pesado ----
 'solanet': dict(nombre='Naira Solanet', pais='Coralia', codigo='CRL', genero='F', categoria='48', estatura=1.50,
   musculo=.82, grasa=.12, fisico='anatomico', prop=dict(femur=.224, brazo=.302, antebrazo=.482),     # compacta: fémur y brazos cortos; antebrazo algo más corto que la regla (con .495 el codo no llega al rack: codo-rack; con .47 la mano no llega a la barra)
   rasgos=(.15, .35, .50), piel='trigueña', ojos='#3d2a1c',
   # cara ovalada y fina: pómulos altos, nariz corta y angosta, mentón angosto, cejas arqueadas
   cara=[('head/head-oval',.5),('cheek/l-cheek-bones-incr',.4),('cheek/r-cheek-bones-incr',.4),('nose/nose-scale-vert-decr',.25),('nose/nose-width2-decr',.2),('chin/chin-width-decr',.3),('eyebrows/eyebrows-angle-up',.25),('mouth/mouth-scale-horiz-decr',.15)],
   pelo=dict(color='#15100d', peinado='rodete_alto'),
   uniforme=dict(malla='#0f7a4a', panel='#12202b', vivo='#f4f2ec', rodillera='#141418', rodillera2='#2c2c33', cinturon='#241a14', zapatillas=('#f4f3ee','#d9d5ca','#0f7a4a','#8a5f36')),
   juego=dict(color='#35c487', bandera='linear-gradient(180deg,#0f7a4a 0 33%,#f4f2ec 33% 67%,#e8a33d 67%)', dorsal=21, kg=dict(s=84, c=106))),
 'halvard': dict(nombre='Greta Halvard', pais='Karsund', codigo='KSD', genero='F', categoria='+86', estatura=1.74, masa=112,
   musculo=.9, grasa=.62,
   rasgos=(.0, .0, 1.0), piel='clara', ojos='#4f6470',
   # cara redonda y llena: mandíbula ancha, nariz respingada, mejillas con volumen, boca ancha
   cara=[('head/head-round',.6),('chin/chin-width-incr',.3),('nose/nose-point-up',.3),('nose/nose-width2-incr',.15),('cheek/l-cheek-volume-incr',.45),('cheek/r-cheek-volume-incr',.45)],
   pelo=dict(color='#a8865a', peinado='rodete'),
   uniforme=dict(malla='#6e1423', vivo='#f0c36a', rodillera='#1a1a1f', rodillera2='#6e1423', cinturon='#2a1c14', zapatillas=('#1b1b20','#e6e3da','#f0c36a','#2a2a2e')),
   juego=dict(color='#e0607a', bandera='linear-gradient(90deg,#6e1423 0 28%,#f0c36a 28% 40%,#6e1423 40%)', dorsal=34, kg=dict(s=128, c=166))),
 'ilarraz': dict(nombre='Tadeo Ilarraz', pais='Montelar', codigo='MTL', genero='M', categoria='71', estatura=1.61,
   musculo=1.0, grasa=.08, fisico='anatomico', prop=dict(femur=.222, tibia=.250),     # compacto: fémur corto y torso largo; la tibia larga viene con sus rasgos base
   rasgos=(.75, .05, .20), piel='oscura', ojos='#2e1d12',
   # cara de triángulo invertido: pómulos marcados, nariz recta y ancha, orejas algo abiertas, cejas bajas
   cara=[('head/head-invertedtriangular',.8),('head/head-oval',.3),('cheek/l-cheek-bones-incr',.8),('cheek/r-cheek-bones-incr',.8),('nose/nose-width2-incr',.6),('nose/nose-width3-incr',.5),('nose/nose-scale-vert-decr',.3),('eyebrows/eyebrows-trans-down',.4),('chin/chin-width-decr',.4),('chin/chin-jaw-drop-incr',.3),('mouth/mouth-scale-horiz-incr',.3),('ears/l-ear-wing-incr',.4),('ears/r-ear-wing-incr',.4)],
   pelo=dict(color='#0f0c0a', peinado='corto', largo=.019, barba=0.),
   uniforme=dict(malla='#1d4f9c', panel='#0d1a30', vivo='#f2c230', rodillera='#15151a', rodillera2='#f2c230', cinturon='#2b1d14', zapatillas=('#efeee9','#d9d5ca','#1d4f9c','#8a5f36')),     # azul con vivo amarillo: la malla naranja se confundía con su piel
   juego=dict(color='#4d8fe0', bandera='linear-gradient(135deg,#0d1a30 0 50%,#1d4f9c 50% 82%,#f2c230 82%)', dorsal=16, kg=dict(s=138, c=170))),
 'jastrev': dict(nombre='Borko Jastrev', pais='Veldania', codigo='VLD', genero='M', categoria='+110', estatura=1.86, masa=146,
   musculo=1.0, grasa=.72, fisico='anatomico',
   rasgos=(.0, .15, .85), piel='#d3a17e', ojos='#4a3a28',
   # cabeza redonda y cuadrada: mandíbula muy ancha, nariz ancha y corta, mejillas llenas, cejas caídas
   cara=[('head/head-round',.8),('head/head-square',.5),('chin/chin-width-incr',.9),('chin/chin-bones-incr',.5),('nose/nose-width2-incr',.8),('nose/nose-scale-vert-decr',.5),('nose/nose-point-up',.3),('cheek/l-cheek-volume-incr',.8),('cheek/r-cheek-volume-incr',.8),('eyebrows/eyebrows-angle-down',.4),('mouth/mouth-scale-horiz-incr',.4)],
   pelo=dict(color='#1f1711', peinado='rapado', barba=.9),
   uniforme=dict(malla='#17171c', panel='#a81d2f', vivo='#efece4', rodillera='#d7263d', rodillera2='#17171c', cinturon='#1a1a1e', zapatillas=('#eeede8','#d6d2c6','#d7263d','#7a5a3a')),
   juego=dict(color='#e5565f', bandera='linear-gradient(180deg,#17171c 0 40%,#d7263d 40% 60%,#f1efe9 60%)', dorsal=45, kg=dict(s=196, c=240))),
 # compacto atlético de categoría media: hombros y trapecio anchos, cintura firme, pelo más largo arriba y costados cortos, barba corta
 'kordan': dict(nombre='Stevan Kordan', pais='Dravenia', codigo='DRV', genero='M', categoria='94', estatura=1.71,
   musculo=1.0, grasa=.14, prop=dict(femur=.228), fisico='anatomico',
   rasgos=(.0, .4, .6), piel='trigueña', ojos='#33261a',
   # cara larga de mentón marcado y pómulos altos, nariz angosta con caballete, mejillas secas, cejas bajas (distinta de la del pesado)
   cara=[('head/head-rectangular',.9),('chin/chin-prominent-incr',.7),('chin/chin-height-incr',.5),('chin/chin-bones-incr',.5),('cheek/l-cheek-bones-incr',.6),('cheek/r-cheek-bones-incr',.6),('cheek/l-cheek-volume-decr',.6),('cheek/r-cheek-volume-decr',.6),('nose/nose-hump-incr',.7),('nose/nose-scale-vert-incr',.5),('nose/nose-width2-decr',.4),('eyebrows/eyebrows-trans-down',.5),('mouth/mouth-scale-horiz-decr',.3)],
   pelo=dict(color='#14100d', peinado='corto', largo=.022, barba=.62),
   uniforme=dict(malla='#ece8dd', panel='#0f5a66', vivo='#12181c', rodillera='#14171a', rodillera2='#0f5a66', cinturon='#2a1d15', zapatillas=('#efeee9','#d9d5ca','#0f5a66','#8a5f36')),
   juego=dict(color='#2fb3c4', bandera='linear-gradient(90deg,#0f5a66 0 30%,#ece8dd 30% 70%,#12181c 70%)', dorsal=9, kg=dict(s=178, c=216))),
}
NUEVOS = [k for k, v in PESISTAS.items() if not v.get('legado')]

def _clip(v, a, b): return max(a, min(b, v))
def _hex(c): return PIEL.get(c, c)

def _labio(piel, F):
    r, g_, b = [int(piel[i:i + 2], 16) / 255 for i in (1, 3, 5)]; k = .84 if F else .9
    return '#%02x%02x%02x' % tuple(int(255 * _clip(v, 0, 1)) for v in (r * k + .03, g_ * k * .84, b * k * .87))

def masa(p):
    """Masa corporal objetivo (kg): la que se pone, o el tope de la categoría."""
    if p.get('masa'): return float(p['masa'])
    if p['categoria'].startswith('+'): raise ValueError(f"{p['nombre']}: la categoría {p['categoria']} es abierta, hay que poner 'masa'")
    return float(p['categoria'])

def validar(k, p):
    if p['genero'] not in IWF: raise ValueError(f'{k}: genero tiene que ser M o F')
    if p['categoria'] not in IWF[p['genero']]: raise ValueError(f"{k}: {p['categoria']} no es una categoría IWF vigente de {p['genero']}: {IWF[p['genero']]}")
    cat = p['categoria']; m = masa(p); i = IWF[p['genero']].index(cat)
    if cat.startswith('+'):
        if m <= float(cat[1:]): raise ValueError(f'{k}: masa {m} no entra en {cat}')
    elif m > float(cat) or (i > 0 and m <= float(IWF[p['genero']][i-1])): raise ValueError(f'{k}: masa {m} no entra en la categoría {cat}')
    if not 1.35 <= p['estatura'] <= 2.05: raise ValueError(f'{k}: estatura fuera de rango')

def proporciones(genero, H, m):
    """Proporciones por defecto de un pesista (fracción de la estatura, entre articulaciones). Referencia: los dos originales
    (compacto 0,231 / 0,244 / 0,305 y largo 0,262 / 0,249 / 0,333, con hombros 0,25) y la antropometría de segmentos habitual
    (muslo y pierna cerca de 0,245 de la estatura; brazo sin mano 0,33), corrida hacia palancas cortas, que es lo que selecciona
    la halterofilia. Son una estimación, no una medición de ninguna persona."""
    F = genero == 'F'; z = (H - (1.60 if F else 1.72)) / .10; t = _clip((m - (48 if F else 60)) / 60., 0, 1.3)
    return dict(femur=_clip(.236 + .007 * z, .215, .262), tibia=_clip(.242 + .003 * z, .23, .255), brazo=_clip(.305 + .004 * z, .29, .325),     # hombro a muñeca. Antes .312 + .006 z: con hombros anchos la envergadura pasaba de 1,08 de la estatura («brazos largos», dueño, 16-nov)
                hombros=(.215 if F else .232) + .012 * t,     # entre articulaciones del hombro (el ancho heroico va en el deltoide, no en separar las articulaciones)
                # antebrazo: parte del brazo (hombro a muñeca) que es antebrazo. Con antebrazo más largo que el brazo (más de 0,51) el codo no llega
                # a la altura del rack con el agarre de cargada: es un límite real de esa palanca, y check() lo marca (codo-rack).
                antebrazo=.495 if F else .47)     # húmero algo más largo que el antebrazo, como en una persona (antes .495)

def cfg(k):
    """Parámetros de cuerpo para body.build()."""
    p = PESISTAS[k]
    if p.get('legado'): return dict(_LEGADO_CFG[k], genero=p['genero'], categoria=p['categoria'])
    validar(k, p)
    F = p['genero'] == 'F'; H = p['estatura']; m = masa(p); g = p.get('grasa', .2); mu = p.get('musculo', 1.0 if not F else .85)
    q = dict(proporciones(p['genero'], H, m), torso=0, cadera=None, gluteos=None, cintura=None)
    if not F: q['hombros'] -= .012 * _clip((m - 60) / 60., 0, 1.3) * _clip(1.2 * g, 0, 1)     # el pesado con grasa crece de tronco, no de hombros (si no, sale en V de culturista)
    q.update(p.get('prop', {}))
    # Reglas por categoría: a más masa, hombros y cintura más anchos; la mujer, hombros más angostos y más cadera y glúteo.
    t = _clip((m - (48 if F else 60)) / 60., 0, 1.3)
    cadera = q['cadera'] if q['cadera'] is not None else (.15 + .15 * t if F else .0 + .15 * t * g)
    if p.get('fisico') == 'anatomico' and q['cadera'] is None and not F: cadera += .25     # cadera de pesista: el cuerpo de MPFB con 'muscle' alto es de culturista (hombros enormes, cintura y cadera finas)
    gluteos = q['gluteos'] if q['gluteos'] is not None else (.30 if F else .25) + .10 * t
    an = p.get('fisico') == 'anatomico'     # físico anatómico: el volumen va a los grupos musculares (muslo, glúteo, gemelo, hombro) y sale de la cintura y del cuello
    cintura = q['cintura'] if q['cintura'] is not None else ((.40 if F else .60) if an else (.15 if F else .25)) + .65 * g
    if an and q['gluteos'] is None: gluteos += .25
    if F: extra_f = [('breast/breast-point-decr', 1.), ('breast/breast-volume-vert-up', .3), ('breast/nipple-size-decr', 1.), ('breast/nipple-point-decr', 1.)]     # busto contenido por el top deportivo: sin punta
    else: extra_f = []
    r = p.get('rasgos', (0, 0, 1)); s = sum(r) or 1
    bmi = m / H ** 2
    # 'height' de MPFB cambia las proporciones con la estatura (en los extremos da cuerpo de niño o de gigante): se usa poco, porque la estatura real
    # la fija body.py escalando y las palancas se ajustan aparte. La mujer con 'muscle' alto pierde la forma femenina: su músculo va por grupos.
    macro = dict(gender=0.0 if F else 1.0, age=.5, muscle=_clip(.35 + .35 * mu if F else mu, 0, 1), weight=_clip(.5 + (bmi - 26) * .035, .1, 1.), height=_clip(.5 + (H - 1.70) * .6, .3, .7),
                 proportions=.8, african=r[0] / s, asian=r[1] / s, caucasian=r[2] / s)
    if F: macro.update(cupsize=_clip(.35 + .40 * g, 0, 1), firmness=_clip(.9 - .2 * g, 0, 1))
    # grupos musculares (peso del target de MPFB). La mujer: piernas y glúteos de pesista, tren superior con menos volumen, sin pectoral ni cuello de toro.
    # Con grasa, el volumen del tren superior lo pone la grasa y no el músculo marcado (si no, el pesado sale con hombros y cuello de culturista).
    if F: musc = dict(pierna=.95 * mu, gemelo=.5 * mu, hombro=.70 * mu * (1 - .4 * g), brazo=.45 * mu, antebrazo=.65 * mu, pectoral=0, dorsal=.75 * mu * (1 - .4 * g), abdomen=.5 * (1 - g), cuello=.25 * mu)
    else: musc = dict(pierna=1.0 * mu, gemelo=.6 * mu, hombro=1.0 * mu * _clip(1 - 1.2 * g, 0, 1), brazo=.85 * mu * _clip(1 - 1.0 * g, 0, 1), antebrazo=1.0 * mu * (1 - .5 * g), pectoral=.6 * mu * (1 - .4 * g), dorsal=1.0 * mu * (1 - .35 * g), abdomen=.5 * (1 - g), cuello=.7 * mu * (1 - .5 * g))
    if an:
        if not F: musc.update(brazo=.62 * mu * _clip(1 - .5 * g, 0, 1), hombro=.30 * mu * _clip(1 - .6 * g, 0, 1), antebrazo=.7 * mu * (1 - .5 * g), gemelo=.3 * mu)     # la forma la ponen los vientres de tex._masas; el target de MPFB solo infla     # el pesado con físico anatómico no pierde el brazo (salía bíceps 0,185 H con antebrazo 0,222 H)
        musc.update(cuello=.2 * mu * (1 - .5 * g))
    extra = [('torso/torso-vshape-incr', (.10 if F else .45) * _clip(1 - 1.3 * g, 0, 1)), ('buttocks/buttocks-volume-incr', _clip(gluteos, 0, 1)),
             ('hip/hip-scale-horiz-' + ('incr' if cadera >= 0 else 'decr'), _clip(abs(cadera), 0, 1)),
             ('torso/measure-waist-circ-incr', _clip(cintura, 0, 1)), ('arms/measure-upperarm-circ-decr', _clip(1.4 * g, 0, .25 + .5 * g if an else 1)),
             # boca: los labios de MPFB salen muy gruesos con estos macros
             ('mouth/mouth-upperlip-volume-decr', .7), ('mouth/mouth-lowerlip-volume-decr', .65), ('mouth/mouth-angles-up', .35), ('forehead/forehead-scale-vert-decr', .6 if F else .65),
             # mirada: párpados apenas entornados y cejas apenas bajas (concentración). Con 'slit' en .75 y 'closure' los ojos salían cerrados (ronda 1 del director de arte)
             ('expression/units/caucasian/eye-left-slit', .26 if F else .30), ('expression/units/caucasian/eye-right-slit', .26 if F else .30),     # con .5 quedaban dos ranuras sin ojo (director, ronda 4); con .22 y sin ceño, ojos de susto
             ('expression/units/caucasian/eyebrows-left-down', .45 if F else .7), ('expression/units/caucasian/eyebrows-right-down', .45 if F else .7),
             # gesto de concentración en reposo: boca apretada y nariz tensa (si el target no existe en esta versión de MPFB, body.py lo saltea con aviso)
             ('expression/units/caucasian/mouth-compression', .45), ('expression/units/caucasian/nose-compression', .3), ('expression/units/caucasian/mouth-depression', .2),
             # físico heroico de pesista (dirección de arte del 16-nov): cuello, brazo y muslo gruesos. La masa manda: body.py compensa bajando el macro 'weight', así el volumen se va de la cintura a los grupos musculares
             ('neck/measure-neck-circ-incr', 0. if an else (.25 if F else .5) * mu * (1 - g)),
             # cuello con largo de persona: con 'muscle' y masa altos MPFB lo acorta (medido: 0,027-0,034 de la estatura entre Neck y Head en los hombres contra 0,044 en la mujer) y la cabeza quedaba hundida entre los hombros
             ('neck/neck-scale-vert-incr', 0. if F else _clip(.38 + .2 * g, 0, 1)),     # con .7 + .4 g el cuello salía largo (0,049-0,059 H): «cabeza de tortuga» (ronda 4)
             # cabeza a escala del cuerpo macizo (no se achica al engordar): algo más ancha y profunda
             ('head/head-scale-horiz-incr', 0. if F else .5 * g), ('head/head-scale-depth-incr', 0. if F else .5 * g), ('head/head-scale-vert-incr', 0. if F else .5 * g),     # la cabeza acompaña al cuerpo grande (con grasa): la del superpesado quedaba chica entre los hombros; línea ANTROM, meta estatura / 7,2-7,9     # se midió «cabezón» (ronda 5): sin agrandar; la meta es estatura / 7,4-7,7 (línea ANTROM)     # OJO: el ajuste de metas de body.py es frágil: con .6 + .2 g (corrida 43964929734) kordan salió con antebrazo 0,211 H (línea ANTRO) y falló ('arms/measure-upperarm-circ-incr', (.15 if F else .45) * mu * (1 - g)), ('legs/measure-thigh-circ-incr', (.3 if F else .45) * mu * (1 - .6 * g)),
             # antebrazo grueso de pesista
             ] + [(f'arms/{s_}-lowerarm-scale-{e_}-incr', (.22 if F else .3) * (1 - g) if an else (.22 if F else .4) * (1 - .7 * g)) for e_ in ('horiz', 'depth') for s_ in 'lr'] + [
             # la panza del pesado: alta, redonda y firme (no caída), y la cara más llena
             ('stomach/stomach-pregnant-incr', _clip(.45 * g * g, 0, 1)), ('torso/torso-scale-depth-incr', _clip(.5 * g, 0, 1)), ('head/head-fat-incr', _clip((.7 if F else .5) * g, 0, 1)), ('neck/neck-double-incr', _clip((.5 if F else .2) * g * g, 0, 1))]     # el cuello del pesado tiene que existir: con más papada y cabeza llena quedaba hundido entre los hombros
    if an:
        d = 1 - .6 * g
        # el grosor del muslo no va por targets de MPFB: 'measure-thigh-circ' (una franja) y 'upperleg-scale-horiz/depth' dan un globo arriba y la rodilla fina (sondas 44012134794 y 44012809046). Va en tex._masas ('muslo'), con perfil a lo largo del fémur
        # con grasa (el superpesado): tronco en barril y panza firme, cuello y brazos sin la grasa pareja del macro 'weight' (salían antebrazo 0,22 H y cuello 0,32 H)
        extra += [('torso/torso-scale-depth-incr', (0 if F else .25) + .45 * g), ('torso/torso-scale-horiz-incr', (0 if F else .12) + .35 * g), ('stomach/stomach-pregnant-incr', .5 * g * g), ('neck/measure-neck-circ-decr', .5 * g)]
        if not F: extra += [('genitals/penis-length-decr', 1.), ('genitals/penis-circ-decr', 1.), ('genitals/penis-testicles-decr', 1.)]     # bajo la malla se leía un bulto (hoja de posiciones, extensión)
        extra += [(f'arms/{s_}-lowerarm-fat-decr', .6 * g) for s_ in 'lr'] + [(f'arms/{s_}-upperarm-fat-decr', .3 * g) for s_ in 'lr'] + list(p.get('extra', []))
    # Si con el macro 'weight' al máximo la masa no alcanza (categorías abiertas), body.py suma este paquete de volumen de 0 a 1.
    volumen = [('torso/torso-scale-horiz-incr', .7), ('torso/torso-scale-depth-incr', .55), ('stomach/stomach-pregnant-incr', .15), ('hip/hip-scale-depth-incr', .3), ('buttocks/buttocks-volume-incr', .12), ('hip/hip-scale-horiz-incr', .35),
               ('torso/measure-waist-circ-incr', .5), ('neck/measure-neck-circ-incr', .12 if F else .22)] + [(f'{a}/{s_}-{b_}', w) for s_ in 'lr' for a, b_, w in (('legs', 'upperleg-fat-incr', .5 if an else .9), ('legs', 'lowerleg-fat-incr', .3 if an else .5))]     # sin brazos en el paquete: al superpesado le inflaba hombros y brazos como globos («deforme», dueño 16-nov); la masa va a tronco, panza, cadera y muslos
    return dict(height=H, macro=macro, legs=dict(up=0, low=0), arms=dict(up=0, low=0), torso=q['torso'], extra=extra + extra_f, face=list(p.get('cara', [])),
                metas=dict(femur=q['femur'], tibia=q['tibia'], brazo=q['brazo'], hombros=q['hombros'], antebrazo=q['antebrazo']),
                musc=musc, masa=m, rho=1.07 - .07 * g, volumen=volumen, fisico=p.get('fisico'), cabeza_meta=p.get('cabeza_meta', (7.5 if F else 7.55) if an else None), genero=p['genero'], categoria=p['categoria'])

# ganancia de cada grupo muscular del físico anatómico (tex.GRUPOS). La mujer: piernas, glúteo y espalda de pesista; tren superior más liviano y sin pectoral marcado
_GRUPOS_M = dict(deltoide=.9, biceps=1., triceps=1., antebrazo=.8, pectoral=1., trapecio=.8, dorsal=1.1, erectores=1., gluteo=1.5, cuadriceps=1.4, isquios=1.2, aductor=1., gemelos=.85, muslo=1.3, codo=1., rodilla=1., cintura=1.)
_GRUPOS_F = dict(deltoide=.45, biceps=.3, triceps=.35, antebrazo=.3, pectoral=0., trapecio=.35, dorsal=.45, erectores=.5, gluteo=.8, cuadriceps=.7, isquios=.6, aductor=.4, gemelos=.5, muslo=.7, codo=.5, rodilla=.6, cintura=.0)
def sty(k):
    """Parámetros de indumentaria, piel y pelo para tex.py, geo.py y finish.py (los mismos nombres de clave que usaban ventura y brenner)."""
    p = PESISTAS[k]
    if p.get('legado'): return dict(_LEGADO_STY[k], genero=p['genero'])
    F = p['genero'] == 'F'; g = p.get('grasa', .2); mu = p.get('musculo', 1.0 if not F else .85)
    h = dict(color='#17120f', peinado='rodete' if F else 'corto', largo=None, barba=0. if F else .2, entradas=None, degrade=None); h.update(p.get('pelo', {}))
    u = dict(malla='#444444', panel=None, vivo='#f0f0f0', rodillera='#151518', rodillera2='#2a2a30', cinturon=None, zapatillas=('#f2f1ec', '#d8d4c8', '#444444', '#9a6b3c')); u.update(p.get('uniforme', {}))
    rod = h['peinado'] in ('rodete', 'rodete_alto')
    largo = h['largo'] if h['largo'] is not None else dict(corto=.015, rapado=.0022, rodete=.0013, rodete_alto=.0013)[h['peinado']]
    S = dict(H=p['estatura'], genero=p['genero'], grasa_=g, skin=_hex(p.get('piel', 'media')), suit=u['malla'], trim=u['vivo'], sleeve=u['rodillera'], sleeve2=u['rodillera2'],
             code=p['codigo'], name=p['nombre'].split()[-1].upper(), hair=h['color'], hairlen=largo, beard=h['barba'], tattoo=bool(p.get('tatuaje')),
             shoe=tuple(u['zapatillas']), belt=u['cinturon'], panel=u['panel'], iris=p.get('ojos', '#5a3d24'), peinado=h['peinado'],
             # nacimiento del pelo: entradas en las sienes (hombre) y degradé de los costados (corte corto); el pelo atado no lleva ninguno de los dos
             entradas=h['entradas'] if h['entradas'] is not None else (.015 if F else .09), degrade=h['degrade'] if h['degrade'] is not None else (0. if rod else (.6 if h['peinado'] == 'rapado' else 1.)),
             hairline=-.16 if F else -.05,     # el nacimiento baja de donde termina el grupo 'scalp' de la malla base (dejaba la frente enorme)
              afeitado=0. if F else .45, bodyhair=.04 if F else .5 * (1 - .3 * g), cejas=.72 if F else 1.,
             # labios: el color sale del tono de piel (más oscuro y algo más rojo), no de un rosa fijo; borde de la pintura más adentro; párpado sin delineado fuerte; menos brillo de sudor
             esclera=.78, labio=_labio(_hex(p.get('piel', 'media')), F), labio_borde=(.5, .95), delineado=.3, sweat=.55,
             # definición: venas y surcos se apagan con la grasa; la mujer, relieve más suave
             veins=_clip((.25 if F else .8) * (1 - g), 0, 1), cut=_clip((.55 if F else 1.) * (1 - .85 * g) * (.5 + .5 * mu), .05, 1.2), folds=1. if not F else .6,
             anat=dict(masa=_clip((.6 if F else 1.) * (1 - .5 * g), 0, 1), pec=0. if F else _clip(.7 * (1 - .6 * g), 0, 1), abd=_clip((.5 if F else 1.) * (1 - 1.6 * g), 0, 1),
                       # físico de pesista: espalda (dorsal y erectores), trapecio y antebrazo con más masa que la media
                       espalda=1.9 * mu, trap=1.7 * mu, antebrazo=1.6 * mu),
             # pelo corto con volumen: mechones de largo desparejo y más capas; el pelo atado va liso
             mechones=1. if h['peinado'] == 'corto' else 0., capas=6 if h['peinado'] == 'corto' else None,
             # corte de la malla: escote (ancho, alto) y sisa (borde interno, alto), en m para 1,69 m. La malla femenina sube el escote y cierra la sisa.
             # barra reglamentaria: hombres 20 kg y 28 mm de diámetro; mujeres 15 kg y 25 mm (cambia el agarre: la mano chica cierra el hook)
             rbar=.0125 if F else .014, barkg=15 if F else 20,
             escote=(.078, .125) if F else (.082, .14), sisa=(.112, .15) if F else (.118, .2 - .06 * g))     # con grasa la sisa del hombre sube: baja dejaba el costado del pesado desnudo
    if p.get('fisico') == 'anatomico':
        # físico anatómico: masas por grupo muscular (tex._masas) en lugar del relieve suave. La malla lleva las masas enteras y parte del surco;
        # el normal map repite poco de la masa (ya está en la silueta) y carga los surcos finos. Las ventanas radiales se abren porque el miembro es más grueso.
        d = _clip(1 - 1.1 * g, .15, 1)     # definición: con grasa los vientres se funden
        S['fisico'] = 'anatomico'; S['piel2'] = .8 if F else 1.; S['anat'].update(fisico='anatomico', masa=1., geo=(1., .6), normal=.30, fino=1.6, surco=1.25 * d, radios=(1.32, 1.22, 1.22, 1.2),
                                                    grupos=dict({k_: v_ * (1 - .2 * g if k_ in ('muslo', 'gluteo') else 1 - g if k_ in ('cintura', 'rodilla', 'codo') else 1 - .55 * g) for k_, v_ in (_GRUPOS_F if F else _GRUPOS_M).items()}, **p.get('grupos', {})))     # con grasa: vientres más fundidos, más grosor de muslo y glúteo, sin cintura marcada
    if rod:
        # moño: dirección desde el centro de la cabeza (X lateral, +Y atrás, +Z arriba) y radio en m para 1,69 m
        a = math.radians(62 if h['peinado'] == 'rodete_alto' else 18); S['bun'] = dict(dir=(0., math.cos(a), math.sin(a)), r=.043 if h['peinado'] == 'rodete_alto' else .046)
    return S

def ficha(k):
    """Lo que necesita el juego de cada pesista (web/data/plantel.json): identidad, categoría y los colores como parámetros."""
    p = PESISTAS[k]; s = sty(k)
    return dict(id=k, nombre=p['nombre'], corto=p['nombre'].split()[-1], pais=p['pais'], codigo=p['codigo'], genero=p['genero'], categoria=p['categoria'], estatura=p['estatura'],
                masa=None if p.get('legado') else masa(p), piel=s['skin'], pelo=s['hair'], peinado=s.get('peinado', 'corto'), barba=s['beard'], iris=s.get('iris', '#5a3d24'),
                malla=s['suit'], vivo=s['trim'], rodillera=s['sleeve'], zapatilla=s['shoe'][0], cinturon=s['belt'], **p.get('juego', {}))

CFGS = {k: cfg(k) for k in PESISTAS}
STYLES = {k: sty(k) for k in PESISTAS}

if __name__ == '__main__':
    import json, sys
    if sys.argv[1:] == ['json']: print(json.dumps({k: ficha(k) for k in PESISTAS}, ensure_ascii=False, indent=1))
    else:
        for k, p in PESISTAS.items(): print(f"{k:10s} {p['genero']} {p['categoria']:>5s} kg  {p['estatura']:.2f} m  {p['nombre']} ({p['pais']}, {p['codigo']})")
