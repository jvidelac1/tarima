# Relevo — Tarima

Estado al 11 de noviembre de 2026. Este documento es para retomar el trabajo, con o sin agente.

## Qué es

Juego web de halterofilia. La prioridad es el equilibrio entre calidad visual y veracidad del movimiento. Hoy existe el visor (reproduce un arranque y un dos tiempos con tres enviones, para dos levantadores ficticios); **todavía no hay gameplay**.

Repo: https://github.com/jvidelac1/tarima (rama de trabajo `pasada-visual`).

## Cómo correrlo

```bash
./build.sh                      # los dos personajes, de punta a punta (unos 40 min con la máquina libre)
FAST=1 ./build.sh ventura       # sin hojas de poses
.venv/bin/python blender/pose_only.py ventura   # solo poses sobre out/ventura/s3b.blend (iteración rápida)
node tools/check_viewer.mjs     # prueba automática del visor (consola, 404, fps, capturas en out/viewer/)
cd web && python3 -m http.server 8000
```

- Entorno: `.venv` con Python 3.13 y `bpy` 5.2.3, MPFB clonado en `vendor/mpfb2` (ver README).
- **Un solo Blender a la vez.** En una M1 Pro de 16 GB, tres builds en paralelo llevaron el load average a más de 300 y cada paso pasó de 3 a 40 minutos. `build.sh` espera si detecta otro proceso.
- `TARIMA_OUT=dir` cambia la carpeta de salida; `TARIMA_THREADS`, `TARIMA_GPU=0` y `EXPORT_BAD=1` están documentados en `build.sh`.

## Linux y máquinas alquiladas (11-nov)

El build y la prueba del visor corren también en Ubuntu 22.04 sin pantalla; el detalle y los tiempos medidos están en la sección «Linux» del README. Verificado en un pod con RTX 4090 (build completo en 29 min con Cycles por OptiX, 0 cuadros con superposición en los dos, prueba del visor en 59 fps sobre la placa) y en un pod de 4 vCPU sin GPU (ventura con `FAST=1` en 33 min, 0 cuadros; prueba del visor por software). Las poses coinciden con las de macOS: `tools/compare_poses.py` da estructura igual y 0,0001 s de diferencia máxima en `tt`.

No verificado en Linux: brenner en el pod sin GPU (se probó solo ventura ahí) y la medición de fps por software, que no es concluyente por diseño.

## Salida del último build completo (11-nov, 03:25 a 04:03)

```
== ventura: cuerpo, rig y mapas ==
   (blender/make.py ventura: 5 min 5 s, código 0)
== ventura: texturas, zapatillas, poses y GLB ==
CHK ventura cuadros con superposición: 0 · columnas BAD: motivo, brazo-pierna, barra-cuerpo, pie, mano-barra, rack mano/antebrazo-torso, codo vs hombr
GLB MB 16.882444
   (blender/finish.py ventura: 14 min 11 s, código 0)
== brenner: cuerpo, rig y mapas ==
   (blender/make.py brenner: 5 min 32 s, código 0)
== brenner: texturas, zapatillas, poses y GLB ==
CHK brenner cuadros con superposición: 0 · columnas BAD: motivo, brazo-pierna, barra-cuerpo, pie, mano-barra, rack mano/antebrazo-torso, codo vs hombr
GLB MB 15.363276
   (blender/finish.py brenner: 13 min 20 s, código 0)
== resumen ==
CHK ventura cuadros con superposición: 0
CHK brenner cuadros con superposición: 0
== export a web/ ==
GLB ventura: 11.12 MB; texturas body_normal 2048px 1.04MB, body_orm 2048px 0.83MB, body_color 2048px 0.54MB, eye 1024px 0.09MB, shoe_normal 1024px 0.3
GLB brenner: 10.02 MB; texturas body_normal 2048px 0.96MB, body_orm 2048px 0.82MB, body_color 2048px 0.52MB, eye 1024px 0.09MB, shoe_normal 1024px 0.3
ok ['ventura', 'brenner']
```

`node tools/check_viewer.mjs` sobre ese build: sin errores de consola, sin 404 y sin pedidos externos, con los dos personajes, el arranque y los tres enviones. Última corrida (11-nov, 07:45, máquina libre): termina en `exit 0`, con 60 fps en calidad alta a 1600x817 y DPR 1, y 33 fps a DPR 2. Una corrida anterior del mismo día dio 44 fps, así que el margen en alta es chico.

## Qué hay hoy

| Pieza | Dónde | Estado |
|---|---|---|
| Cuerpo y rig | `blender/body.py`, `blender/make.py` | Estable. Musculatura por targets de MPFB; caras distintas por personaje |
| Malla, pesos, correctivos, pelo, cinturón | `blender/geo.py`, `blender/finish.py` | Funciona; hombros y rodillas siguen flojos (ver pendientes) |
| Texturas (color, normal, ORM, máscara) | `blender/tex.py` | 4096 en origen, 2048 en el GLB web |
| Zapatillas de halterofilia | `blender/shoes.py` | Genéricas, sin marcas |
| Sistema de poses por reglas | `blender/poses.py` | 0 cuadros con superposición en los dos; ritmo con reservas |
| Export al visor | `tools/export_web.py`, `tools/verify_build.py` | Reempaqueta el GLB, máscaras, `poses.json` |
| Visor | `web/index.html`, `web/js/*`, three.js r187 en `web/vendor/` | Funciona; rendimiento en alta al límite |
| Prueba del visor | `tools/check_viewer.mjs` | Chrome del sistema vía playwright-core |

### Los dos biotipos

| | Ventura (compacto) | Brenner (largo) |
|---|---|---|
| Estatura | 1,70 m | 1,83 m |
| Fémur / estatura | 23% | 26% |
| Tibia / estatura | 24% | 25% |
| Brazo (hombro a muñeca) / estatura | 31% | 33% |
| Agarre de cargada | 0,57 m | 0,60 m |
| Agarre de arranque | 1,05 m | 1,13 m |

Los dos biotipos son arquetipos de la halterofilia: Ventura es el levantador compacto (fémur corto, brazos cortos) y Brenner el largo (fémur largo, brazos algo más largos). Las proporciones de segmentos son una estimación, no una medición de ninguna persona.

## Fases revisadas contra su render de control

**No existe `docs/ref/`: ninguna fase se comparó contra video real.** «ok» significa «coherente con la técnica según el render y los números», no «validado contra video». La revisión la hizo un revisor independiente por personaje sobre el build final, mirando las hojas de costado y de frente de cada segmento (`out/<nombre>/sheet_<seg>_side.png` y `sheet_<seg>_front.png`), las trayectorias (`traj_<seg>.png`) y recalculando velocidad y aceleración desde `traj_<seg>.json`. No se revisó el movimiento continuo en el visor: los pasos de pies y la continuidad entre fases se infieren de los cuadros clave.

Resumen: Ventura 18 ok, 26 ok con reservas, 1 mal. Brenner 22 ok, 23 ok con reservas.

| Levantamiento | Fase | Render de control | Ventura | Brenner | Reserva principal |
|---|---|---|---|---|---|
| Dos tiempos · cargada | Parado | `sheet_clean_side.png` y `sheet_clean_front.png` | ok | ok |  |
| Dos tiempos · cargada | Salida | `sheet_clean_side.png` y `sheet_clean_front.png` | ok | ok |  |
| Dos tiempos · cargada | Despegue | `sheet_clean_side.png` y `sheet_clean_front.png` | ok | ok |  |
| Dos tiempos · cargada | Primer tirón | `sheet_clean_side.png` y `sheet_clean_front.png` | ok con reservas | ok | Espalda constante (53,5 grados) y barra rozando la rodilla (+0,6 cm), bien. Pero la barra se abre 1,4 cm hacia adelante antes de volver, y la cadera… |
| Dos tiempos · cargada | Transición | `sheet_clean_side.png` y `sheet_clean_front.png` | ok | ok con reservas | Doble flexión de rodillas visible, barra al muslo bajo. Pero es el punto MÁS cercano al cuerpo de la trayectoria (+2,7 cm) y el pico de velocidad de… |
| Dos tiempos · cargada | Segundo tirón | `sheet_clean_side.png` y `sheet_clean_front.png` | ok con reservas | ok con reservas | Posición de potencia correcta: torso 9 grados, barra en muslo alto, 11 cm bajo la cadera, pies planos. La fase dura 0,064 s y la barra casi no… |
| Dos tiempos · cargada | Triple extensión | `sheet_clean_side.png` y `sheet_clean_front.png` | ok | ok con reservas | En puntas, torso -14°, brazos rectos, barra al muslo alto (0,94 m). Reserva: es el punto más adelantado (3,9 cm delante de la vertical de salida) y… |
| Dos tiempos · cargada | Tirón de brazos | `sheet_clean_side.png` y `sheet_clean_front.png` | ok con reservas | ok con reservas | Codos altos y afuera, barra pegada (+3 cm), altura máxima 1,01 m (60% de la estatura). La cadera pasa de +0,5 a -2,0 m/s en unos 60 ms (pico -47… |
| Dos tiempos · cargada | Giro de codos | `sheet_clean_side.png` y `sheet_clean_front.png` | ok con reservas | ok con reservas | Barra a la altura del mentón bajando a -0,5 m/s, codos pasando, pies ya abiertos. La muñeca pasa de -21 a +58 grados en 0,25 s. El paso de pies entre… |
| Dos tiempos · cargada | Recepción | `sheet_clean_side.png` y `sheet_clean_front.png` | ok con reservas | ok con reservas | Barra sobre deltoides y sobre el medio pie (0,0), torso 10,6 grados, cadera 0,33 m, rodillas afuera. Codo 5,4 cm bajo el hombro (húmero unos 11… |
| Dos tiempos · cargada | Amortiguación | `sheet_clean_side.png` y `sheet_clean_front.png` | ok | ok |  |
| Dos tiempos · cargada | Subida | `sheet_clean_side.png` y `sheet_clean_front.png` | mal | ok con reservas | La pose final está bien, pero el ritmo no: 63 cm en 1,0 s con pico de 1,38 m/s, más rápido que el tirón (1,29). Una cargada pesada sube a 0,5-0,9 m/s… |
| Dos tiempos · cargada | Recuperación | `sheet_clean_side.png` y `sheet_clean_front.png` | ok con reservas | ok con reservas | De pie, pies cerrados al ancho de envión en 0,7 s, barra 1,3 cm detrás del medio pie. Rack con codo 6,6 cm bajo el hombro, muñeca en 90 grados,… |
| Arranque | Parado | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok | ok |  |
| Arranque | Salida | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok | ok |  |
| Arranque | Despegue | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok | ok |  |
| Arranque | Primer tirón | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok con reservas | ok | El torso se acuesta de 58 a 65 grados: la cadera sube 25 cm y la barra 21, leve cadera adelantada. La barra se abre 0,7 cm adelante al pasar la… |
| Arranque | Transición | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok | ok con reservas | Barra a medio muslo, torso 36°. Reserva: es el punto más cercano al cuerpo (+3,6 cm) y de ahí la barra se va 3,6 cm ADELANTE en 0,066 s (hasta -0,82… |
| Arranque | Segundo tirón | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok | ok con reservas | Posición de potencia con brazos rectos y pies planos; acá sí acelera (1,69 a 2,01 m/s). Reserva: la barra está en el muslo alto (0,855 m, 11 cm bajo… |
| Arranque | Triple extensión | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok | ok |  |
| Arranque | Tirón de brazos | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok con reservas | ok | Codos altos y afuera, barra pegada (+4 cm). Solo dura 0,063 s y la cadera pasa de +1,2 a -1,3 m/s (pico -49 m/s2). La barra queda 1,6 cm delante de… |
| Arranque | Giro | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok con reservas | ok con reservas | Barra pasando frente a la cara a +1,9 cm de la malla, altura máxima 1,33 m (78% de la estatura, alto frente al 68-72% habitual). Tarda 0,31 s… |
| Arranque | Recepción | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok con reservas | ok | Sentadilla profunda (cadera 0,26 m), barra sobre el medio pie (0,0), brazos trabados, torso 18,5 grados. La barra cae solo 5,5 cm desde el pico.… |
| Arranque | Recuperación | `sheet_snatch_side.png` y `sheet_snatch_front.png` | ok con reservas | ok | Final firme, barra sobre el medio pie, brazos trabados (d_snatch_10_handF/U: la barra apoya en la base de los dedos, muñeca 60 grados). La subida de… |
| Envión tijera | Recuperación | `sheet_split_side.png` y `sheet_split_front.png` | ok con reservas | ok con reservas | Rack de envión: barra sobre deltoides y clavícula, 1,3 cm detrás del medio pie, codos 6,6 cm bajo el hombro (correcto para envión). Muñeca en 90… |
| Envión tijera | Envión · Dip | `sheet_split_side.png` y `sheet_split_front.png` | ok con reservas | ok con reservas | Torso vertical (-1 grado), talones apoyados, dip de 14,4 cm (8,5% de la estatura) en 0,36 s. La barra baja a 0,8 g, casi flotando sobre los hombros;… |
| Envión tijera | Envión · Impulso | `sheet_split_side.png` y `sheet_split_front.png` | ok | ok con reservas | Extensión en 0,20 s, pico 1,7-1,8 m/s al final del empuje, +9,9 m/s² (2 veces el peso): creíble. Reserva: muñeca hasta 95,8° de extensión en el… |
| Envión tijera | Envión · Empuje | `sheet_split_side.png` y `sheet_split_front.png` | ok con reservas | ok | En puntas, barra a la altura de la frente a +3,6 cm de la cara, codo 125 grados. La cabeza va muy echada atrás mirando arriba; lo usual es retraer el… |
| Envión tijera | Envión · Tijera | `sheet_split_side.png` y `sheet_split_front.png` | ok | ok |  |
| Envión tijera | Envión · Recuperación | `sheet_split_side.png` y `sheet_split_front.png` | ok con reservas | ok | El pie de adelante vuelve primero en 0,6 s (orden correcto), barra estable. El torso queda 8,4 grados adelante y la cadera tiene un pico de +19 m/s2… |
| Envión tijera | Envión · Final | `sheet_split_side.png` y `sheet_split_front.png` | ok | ok |  |
| Envión power | Recuperación | `sheet_power_side.png` y `sheet_power_front.png` | ok con reservas | ok con reservas | Misma pose de rack que en tijera: correcta para envión, con muñeca en 90 grados y pulgar parado. |
| Envión power | Envión · Dip | `sheet_power_side.png` y `sheet_power_front.png` | ok con reservas | ok con reservas | Igual que en tijera: 14,4 cm en 0,36 s, vertical, con la barra bajando a 0,8 g. |
| Envión power | Envión · Impulso | `sheet_power_side.png` y `sheet_power_front.png` | ok | ok con reservas | Pico 1,7-1,8 m/s, +9,9 m/s². Salto de velocidad horizontal 0,54 m/s y muñeca muy extendida en los intermedios. |
| Envión power | Envión · Empuje | `sheet_power_side.png` y `sheet_power_front.png` | ok con reservas | ok | Igual que en tijera: barra a la frente, cabeza muy echada atrás. |
| Envión power | Power jerk · Recepción | `sheet_power_side.png` y `sheet_power_front.png` | ok con reservas | ok con reservas | Pies abiertos, rodillas afuera, brazos trabados, barra sobre el medio pie. La cadera baja 19 cm (mucho para power) con el torso 16,6 grados adelante,… |
| Envión power | Envión · Final | `sheet_power_side.png` y `sheet_power_front.png` | ok | ok |  |
| Envión squat | Recuperación | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok con reservas | Misma pose de rack que en tijera y power. |
| Envión squat | Envión · Dip | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok con reservas | Igual que en tijera: dip correcto en forma, con la barra bajando a 0,8 g. |
| Envión squat | Envión · Impulso | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok con reservas | Pico de 1,71 m/s. La cadera tiene -23 m/s2 al final del impulso, un corte brusco al empezar a meterse. |
| Envión squat | Envión · Empuje | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok con reservas | Barra a la frente (+5,3 cm), cabeza echada atrás. La barra frena a 0,95 g, con la cadera a -31 m/s2 y hasta 9 m/s2 de aceleración horizontal. |
| Envión squat | Squat jerk · Recepción | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok con reservas | Brazos trabados a media sentadilla (cadera 0,47 m), barra sobre el medio pie. Torso 25 grados adelante con agarre angosto: exige una movilidad de… |
| Envión squat | Squat jerk · Fondo | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok | Fondo completo (cadera 0,22 m), talones apoyados, rodillas afuera, torso 17 grados, brazos trabados. Posible para un compacto muy móvil; sin… |
| Envión squat | Squat jerk · Recuperación | `sheet_squat_side.png` y `sheet_squat_front.png` | ok con reservas | ok | Sube 53 cm en 0,9 s con pico de 1,10 m/s desde el fondo, con peso de envión y agarre angosto: demasiado rápido. Torso 17 grados adelante con la barra… |
| Envión squat | Envión · Final | `sheet_squat_side.png` y `sheet_squat_front.png` | ok | ok |  |

## Problemas conocidos del relevo anterior: cómo quedaron

1. **Rack con codos bajos:** mejorado, no resuelto. De 13 a 15 cm bajo el hombro pasó a entre 4,7 y 7,6 cm según la fase y el personaje. El objetivo de 3 a 5 cm no se cumple en todas las fases; la muñeca queda en 77 a 92° de extensión, por encima del rango pasivo habitual.
2. **Pulgar parado:** resuelto mientras la barra cuelga (hook grip). Sigue separado de la barra en el rack y con la barra sobre la cabeza.
3. **Hombros y axilas con brazos arriba:** mejorado con reparto de pesos y el morph `corr_armUp_*` (rango del driver 45° a 130°). Queda un pliegue duro en la axila trasera y poca anatomía de primer plano. Las rodilleras en sentadilla profunda siguen deformándose: es el límite del skinning lineal sin huesos auxiliares.
4. **Calidad visual:** mapas de relieve, rugosidad y oclusión en cuerpo, zapatillas y cinturón; pelo, barba y pestañas con volumen; arena, público desenfocado, profundidad de campo, bloom, corrección de color y gráfica de TV. **No es fotorrealista:** se lee como un juego estilizado con buen empaque de transmisión. El humano es el eslabón débil (piel plástica, ojos, manos en el rack).
5. **Hook grip:** hecho (pulgar atrapado bajo índice y medio).
6. **Trayectoria en S y velocidades:** hecho. S de 8,5 cm en la cargada y 8,6 cm en el arranque de Ventura; `poses.json` trae `tt` con el tiempo real de cada muestra. El ritmo tiene reservas (ver pendientes).
7. **Bajada de una sola pose:** reemplazada por Tirón de brazos, Giro (o Giro de codos), Recepción y Amortiguación. El giro sigue apoyado en una sola pose clave.
8. **Barra que flexiona:** hecho en el visor (viga con oscilación amortiguada según carga y aceleración del hueso `Bar`), con discos de colores reglamentarios.

## Pendientes

**Movimiento**
- Las subidas desde la sentadilla son demasiado rápidas: la de la cargada llega a 1,38 m/s (Ventura) y 1,64 m/s (Brenner), más que el propio tirón. Es la única fase marcada «mal».
- En la cargada la barra casi no acelera en el segundo tirón (meseta de 1,2 a 1,36 m/s).
- La cadera invierte su movimiento de golpe al meterse bajo la barra (picos de −47 a −49 m/s²).
- El dip del envión baja a 0,8 a 0,9 g; lo real es 0,3 a 0,6 g.
- Power jerk y squat jerk reciben con el torso muy inclinado (17° a 32°).
- En el empuje del envión la cabeza va demasiado echada atrás.
- El codo «recto» queda en 10° de flexión, también en el bloqueo.
- La barra se abre 0,7 a 1,4 cm hacia adelante al rodear la rodilla.

**Chequeo de superposiciones**
- Umbrales idénticos al original (−1,2 / −1,2 / −0,4 cm), con 10 muestras por fase en vez de 6 y chequeos nuevos (barra-malla por BVH, mano-barra, rack, muñeca, codo, pie que patina, límites físicos de la barra).
- Única relajación: el descuento `CAPR` de la cápsula de torso cerca del apoyo de hombros en modo rack (hasta 4 cm). Un revisor lo midió en Ventura: sin descuento serían BAD 9 muestras en las que la barra-malla real va de +1,3 a −0,3 cm; el peor valor barra-malla de esas muestras es −0,6 cm. Está justificado, pero en Brenner no se midió muestra por muestra.
- El umbral de extensión de muñeca (100°) es más permisivo que la anatomía (70° a 85°).

**Personaje**
- Cara, ojos y piel lejos de fotorreal; borde de barba dentado en Ventura; reborde frontal del pelo de Brenner.
- Manos abiertas y tiesas en el rack.
- Cabeza (33 mil triángulos) y manos (25 mil) concentran el 65 % del costo del cuerpo.
- La pose de reposo cambió respecto del primer commit: hasta 4,2 mm en Ventura y 1,6 mm en Brenner (los morphs de cara y la musculatura mueven el ajuste del rig de MPFB). Los nombres y el orden de los 52 huesos más `Bar` no cambiaron y las animaciones se regeneran con el mismo build, pero **la regla de AGENTS.md de no tocar la pose de reposo no se cumplió al milímetro**.
- El texto «ARX» y «NVK» de las mallas son códigos de equipo ficticios; conviene verificar que no coincidan con marcas registradas antes de publicar.

**Visor**
- Rendimiento: en una M1 Pro alta da entre 44 y 60 fps a DPR 1 según la corrida y 33 fps a DPR 2; tras 60 a 80 s de dibujo continuo alta y media pueden caer a 20 a 45 fps. Solo baja sostiene 60.
- La prueba avisa que el hueso `Bar` se mueve 1,1 a 1,2 mm entre «Parado» y «Salida» del arranque y queda 6 mm por encima del apoyo real de los discos; el visor fija la barra a la tarima mientras tanto.
- Halo de puntos blancos alrededor de la barra, las manos y el borde de los discos (ruido de profundidad de campo u oclusión).
- El visor muestreaba la animación un cuadro antes de cada clave; corregido el 11-nov en `web/js/athlete.js` (muestrea desde el primer tiempo de clave).
- Archivos de trabajo para limpiar: `blender/ctl.py`, `blender/ctl2.py` (superados por `ctl3.py`), `tools/check_viewer_shot.mjs`, `tools/check_viewer_vendor.mjs`, `tools/check_viewer_perf.mjs`.

## Contratos entre Blender y el visor

1. Esqueleto único: 52 huesos con nombres Mixamo más `Bar`. Una sola acción, `Poses`.
2. Tiempo del clip = índice de fase (1 s de clip por fase), con `sub` muestras resueltas por fase (hoy 10). Las claves empiezan en el cuadro 1 (t = 1/30 s). El índice 0 de cada envión duplica el último de la cargada.
3. `web/data/poses.json` por personaje: `h`, `seg`, `sub`, `grip`, `corr`, y por segmento `start`, `poses` (nombre, torso, altura de barra, cadera) y `tt` (segundos reales por muestra, creciente).
4. La barra y los discos los dibuja el visor por código, centrados en el hueso `Bar`.
5. GLB con dos nodos de malla (`Human` con los morphs, `Human_parts`) y materiales `Body`, `Eyes`, `Hair`, `Lashes` (mezcla alfa, sin reordenar capas), zapatillas y cinturón. `web/models/<nombre>_mask.png`: R piel, G tela, B pelo.
6. Morphs correctivos `corr_armUp_L/R` (45° a 130°) y `corr_knee_L/R` (60° a 140°); los rangos viajan en `poses.json` (`corr`).

## Próximos pasos

El plan por etapas, con el criterio de terminado de cada una, dónde corre cada cosa y los mensajes para arrancar sesiones nuevas, está en [docs/PLAN.md](docs/PLAN.md).

Resumen: (0) preparar el Mac alquilado y la sesión cloud, (1) juego mínimo jugable en cloud, (2) prueba de dirección de arte con decisión del usuario, (3) atletas definitivos, (4) movimiento contra video y fallos animados, (5) online, (6) pulido.

## Decisiones tomadas en el camino

- Se descartó el personaje hecho con primitivas por código, el pre-renderizado y el video generado por IA como base del juego (sin interacción ni consistencia de técnica).
- Mocap desde video sigue pendiente.
- Esqueleto único con nombres Mixamo más un hueso `Bar`, así la barra nunca se desfasa de las manos.
- three.js vendorizado en `web/vendor/` para que el visor funcione sin red.
