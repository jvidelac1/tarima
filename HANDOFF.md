# Relevo — Tarima

Estado al 11 de noviembre de 2026. Este documento es para retomar el trabajo, con o sin agente.

## Qué es

Juego web de halterofilia. La prioridad es el equilibrio entre calidad visual y veracidad del movimiento. Hoy existen el visor (reproduce un arranque y un dos tiempos con tres enviones, para dos levantadores ficticios) y, en la rama `gameplay`, **la etapa 1 del juego: una final de tres pesistas jugable de punta a punta** (`web/juego.html`; ver «Juego (etapa 1)» más abajo).

Repo: https://github.com/jvidelac1/tarima (rama de trabajo `pasada-visual`).

## Cómo correrlo

```bash
./build.sh                      # los dos personajes, de punta a punta (unos 40 min con la máquina libre)
FAST=1 ./build.sh ventura       # sin hojas de poses
.venv/bin/python blender/pose_only.py ventura   # solo poses sobre out/ventura/s3b.blend (iteración rápida)
node tools/check_viewer.mjs     # prueba automática del visor (consola, 404, fps, capturas en out/viewer/)
node tools/sim_test.mjs && node tools/check_game.mjs   # pruebas del juego (núcleo y partida completa por script)
gh run list -R jvidelac1/tarima --branch demo --limit 3   # las mismas pruebas corren en GitHub Actions en cada push a demo (ver «Pruebas en GitHub Actions»)
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

## Juego (etapa 1, rama `gameplay`)

Hecho en la sesión cloud, sin GPU: se probó lógica, determinismo y consola con partidas completas jugadas por script. El diseño está en [docs/JUEGO.md](docs/JUEGO.md); acá va lo que existe y en qué se aparta.

**El usuario lo jugó el 11-nov y no pudo hacer un levantamiento** («no entiendo los controles», «prefiero jugarlo con el teclado, reglas claras, fácil de usar, no mouse para los levantamientos»). Los controles se rehicieron ese día en la rama `demo`: ver «Controles» más abajo y [docs/CONTROLES.md](docs/CONTROLES.md). **El rediseño todavía no lo jugó ninguna persona y no se probó en ningún teléfono real**: está medido con bots y mirado en capturas.

```bash
cd web && python3 -m http.server 8000      # el juego: http://localhost:8000/juego.html · el visor: /index.html
node tools/sim_test.mjs                    # núcleo, sin navegador (5 s): pureza, referencias (Clásico y Fácil), vivo contra recalculado, 1000 partidas, adulterados
node tools/play_human.mjs [--info]         # jugabilidad de Fácil con bots de error humano (5 s); sale con error si no cumple el criterio
node tools/balance.mjs --rivales           # informe de balance (Clásico): válidos por intensidad y perfil, y rivales por nivel
node tools/check_game.mjs                  # con navegador: partida completa en Fácil por teclado sin mouse y por toques, tutorial, pausa, ayuda y un intento en Clásico
node tools/primera.mjs                     # con navegador: capturas de lo que ve un jugador nuevo, en out/primera/ (para mirarlas)
node tools/build_sim_data.mjs [--check]    # reescribe web/data/sim.json desde poses.json (o compara contra el publicado)
```

Parámetros de `juego.html`: `?semilla=N` (primera partida reproducible), `?q=movil|baja|media|alta`, `?ritmo=completa`, `?ctl=c` (arranca en Clásico), `?dibujo=0` (no dibuja el 3D; lo usa la prueba), `?depura=1` (recuadro con cuadros, calidad y toques), `?banco=1` (banco de medición de fluidez: no abre el juego, mide y deja `window.BANCO`). Lo que guarda el navegador: `tarima.ctl`, `tarima.tutorial`, `tarima.pesista`, `tarima.nivel`, `tarima.jugadas`, `tarima.env.<ctl>.<pesista>`.

| Pieza | Dónde | Estado |
|---|---|---|
| Núcleo (función pura de los eventos, solo enteros) | `web/js/sim/`: `fixed`, `rules`, `data`, `attempt`, `ai`, `match`, `replay` | Completo para la etapa 1. Botón único entero: tensión, tirón, explosión, recepción, pelea, traba, apoyo firme, chicharra y amague; tres enviones; todos los fallos y nulos de la sección 5 |
| Datos | `web/data/sim.json` (temporada 1) | Anclas en ms leídas de `tt` por segmento y nombre de fase; fichas de los tres. Coinciden con los tiempos de JUEGO.md |
| Competencia | `match.js`, `ai.js` | Orden por kilos, declaración automática, cambios (dos por intento, llamado desplazado), reloj 0:30 y 0:45, jueces con umbral propio, total, desempate, sin marca, Resto, forma del día, guion, La cuenta, etiquetas, tres niveles |
| Controles | `web/js/game/controles.js`, `input.js`, `ui/senal.js`, `ui/mensajes.js` | Niveles Fácil (un toque por señal, por defecto) y Clásico; capa de traducción; señal fija; palabra por toque y línea de fallo; menús por teclado, pausa y ayuda. Ver «Controles» |
| Presentación | `web/juego.html`, `web/css/juego.css`, `web/js/game/` | Inicio con los tres pasos, tutorial guiado (Fácil) o metrónomo y tres prácticas (Clásico), presentación, panel único del llamado, señal fija, ayudas pegadas a la barra (Clásico y rivales), luces de a una, repetición de lo dibujado con traza, tablero, intervalo, podio 2D, revancha. Final exprés y completa |
| Pruebas | `tools/sim_test.mjs`, `tools/play_human.mjs`, `tools/balance.mjs`, `tools/check_game.mjs`, `tools/primera.mjs` | En verde el 11-nov en el pod (Chrome con la RTX 4090, por `tools/browser.mjs`); las dos primeras también en la Mac |

**Archivos compartidos con el visor**: cada cambio es una opción que el visor no usa. `cameras.js` (`interactive: false`), `arena.js` (una luz en `null` queda apagada), `athlete.js` (`setClothFlat`: tela de color plano sobre la máscara; cambia la clave de caché del shader de piel) y `trace.js` (`buildPoints` y `setCount`). No se tocaron `blender/`, `web/models/`, `web/data/poses.json`, `web/js/config.js`, `web/js/main.js` ni `tools/check_viewer.mjs`.

**La prueba del visor en la sesión cloud no llega a verde, ni antes ni después de estos cambios**: pide una GPU (ANGLE Metal) y pisos de fps. Con `CHROME_PATH` apuntando al Chromium de la sesión corre por software y se corta igual en la rama base (`pasada-visual`) que en `gameplay`; ver el detalle en el pull request. **Hay que correrla en el Mac** antes de fusionar.

### Controles (11-nov, rama `demo`)

Especificación: [docs/CONTROLES.md](docs/CONTROLES.md). Lo que quedó hecho (la entrada y la subida de Fácil cambiaron el 12-nov a la tarde: ver «Jugabilidad y entrada en Fácil» más abajo; lo de amagues y piso de exigencia de esta sección ya no rige):

- **Teclado en el levantamiento.** Espacio (Enter hace lo mismo). El clic del mouse no hace gestos en ningún nivel (la prueba verifica que un clic en el escenario no agrega entradas). En teléfono, el dedo sobre la zona táctil.
- **Fácil, por defecto: una señal, un toque.** Arranque: ¡TIRÁ! (cuando quieras), ¡EXPLOTÁ!, ¡RECIBÍ!; ¡EMPUJÁ! tocando rápido si la subida se traba; fijación y bajada automáticas. Dos tiempos: además ¡FLEXIONÁ!, ¡ARRIBA!, ¡RECIBÍ!. No hay que mantener ni soltar.
- **Capa de traducción** (`web/js/game/controles.js`, pura): mira la fase del núcleo en el instante del toque y lo convierte en apretar o soltar. El núcleo sigue recibiendo lo mismo de siempre. En Fácil, detrás de `ctx.ctl === 'f'`: ventanas por 2 (`FACIL.ancho` en `rules.js`), el tirón anticipado es amague (dos por movimiento), la tensión es siempre buena y la subida tiene reglas propias (ver «Corrección» más abajo y `docs/CONTROLES.md`, sección 4). `ctl` va en la cabecera del registro y entra solo en el contexto de la persona: **los rivales juegan con las reglas de Clásico y `tools/sim_ref.json` no cambió**. Las referencias de Fácil están en `tools/sim_ref_facil.json`.
- **Señal fija** (`#senal`, `ui/senal.js`): verbo en imperativo, aro fijo con un círculo que se cierra, la tecla dibujada (ESPACIO, o TOCÁ en teléfono) y el paso («2 de 3»). A la derecha del pesista en horizontal; al pie del escenario en vertical. Después de cada toque, PERFECTO, BIEN, TEMPRANO o TARDE en el mismo lugar. Clásico usa la misma señal con sus verbos y conserva anillo, línea y medidor.
- **Línea de fallo** (`ui/mensajes.js`, `explicar()`): debajo de «Intento fallado», qué pasó y qué hacer («No tocaste ¡EXPLOTÁ! Tocá ESPACIO cuando el círculo se cierra.»). También en la repetición y en el panel de reintento del tutorial.
- **Tutorial guiado** (Fácil, la primera vez; después el inicio ofrece «Repetir tutorial»): desde el 12-nov es **un solo arranque en cámara lenta** que se detiene en cada toque, no se puede fallar y se saltea con Esc (ver «Fluidez, entrada y tutorial» más abajo; antes eran un panel, el guiado y dos prácticas). En Clásico quedan el metrónomo y las tres prácticas de antes.
- **Menús sin mouse**: todo panel abre con foco visible (borde dorado) en su botón principal; ↑ ↓ y Tab mueven el foco, ← → cambian los kilos, Enter o Espacio activan. Esc pausa fuera del intento (congela el reloj; hay un botón «II» para el dedo); H o ? abre «Cómo se juega».
- **Pantalla de inicio**: tres pasos con la tecla dibujada en lugar de la oración, y el selector «Controles: Fácil · Clásico».
- **Error corregido**: en el calentamiento el pesista no se movía (`poseDe()` tomaba el instante 0 de confirmación como «sin confirmar»). La prueba ahora mide que la barra suba también en el tutorial.

**Corrección después de la verificación independiente (11-nov).** La verificación jugó el rediseño y encontró tres problemas graves; los tres se reprodujeron con sus propios scripts antes de tocar nada, y se corrigieron:

- **El reloj corría sobre el panel del llamado y anulaba el intento.** En Fácil el panel ya no gasta reloj: arranca cuando el jugador confirma, el panel lo dice y la señal cuenta los últimos 10 s («¡Quedan 7 s! Apretá ESPACIO»). La práctica 2 del tutorial lleva ese mismo reloj. La línea del nulo dice qué tecla faltó. En Clásico el reloj sigue corriendo sobre el panel, y el panel ahora lo avisa.
- **La subida perdida pedía 12 s de toques, muchas veces después de BIEN.** Cambió la subida de Fácil en el núcleo (todo detrás de `ctx.ctl === 'f'`, constantes en `FACIL` de `rules.js`): PERFECTO y BIEN piden el mismo empuje; la subida siempre pide toques (unos 3 por segundo) y **se corta sola** cuando el avance queda atrás de un piso rojo que sube 25 % por segundo (se ve en la barra de avance); empujar de más no hace temblar; un toque en PERFECTO o BIEN no pierde la barra en el vuelo. La línea de fallo nombra el toque y los milisegundos («Tocaste ¡EXPLOTÁ! 260 ms tarde…») y, si las palabras fueron buenas, dice que faltó ritmo en ¡EMPUJÁ!.
- **El arranque guiado se podía fallar con Brenner tocando lento.** El reloj guiado corre 250 ms por toque en vez de 400 (`GUIADO.porToque`, en `controles.js`). `sim_test` lo verifica con los tres pesistas y toques de 100 ms a 3 s; `check_game` lo juega con Brenner y un toque cada 600 ms.
- **Tocar a ciegas con ritmo acertaba 25 a 74 %.** Ahora hay dos amagues por movimiento (el tercero es fallo) y la subida pide ritmo: la peor de catorce maneras de tocar sin mirar da menos de 4 %, y entró al criterio de `play_human`.
- **¡ARRIBA! se cerraba en 0,36 a 0,42 s.** En Fácil la flexión dura 0,6 s (`FACIL.cierreMs`).
- `tools/sim_ref_facil.json` se regeneró porque cambiaron las reglas de Fácil. `tools/sim_ref.json` no cambió: Clásico y los rivales juegan igual que antes.

Medido (`node tools/play_human.mjs --info`, 2000 intentos por casilla, aperturas al 88 a 92 %, los tres pesistas, Fácil con tijera). Los bots miran solo la señal y tocan a `objetivo + 40 ms + error` con error de campana:

| Bot | Arranque | Dos tiempos | Meta |
|---|---|---|---|
| Casual (desvío 80 ms) | 100,0 % | 100,0 % | 85 % o más |
| Flojo (desvío 160 ms) | 87,6 % | 91,2 % | 50 % o más |
| A ciegas: el peor de catorce (Poisson con cinco ritmos, uniformes, metrónomos, campana, machacar) | 3,6 % | 3,8 % | Menos de 10 % |
| Todo en el borde de BIEN y un toque cada 250 ms en ¡EMPUJÁ!, 88 a 100 % | 360 de 360 | | Todos |
| Los mismos bots en Clásico, casual y flojo (informativo, sin cambios) | 22,6 % y 26,4 % | 14,8 % y 11,9 % | — |

- **Subidas falladas** del casual y del flojo, 88 a 103 %: mediana 2,0 s, percentil 90 5,0 s, máxima 5,5 s (antes: 12,0 s de mediana y unos 65 toques). Sin tocar, la subida se corta entre 1,5 y 2,7 s.
- **Más kilos** (fuera del criterio): casual 100 % al 95 %, 95 % y 94 % al 100 %, 81 % y 73 % al 103 %; flojo 81 % y 80 % al 95 %, 55 % y 43 % al 100 %, 27 % y 15 % al 103 %.
- **La final entera** con las opciones que vienen puestas y rivales amistosos (250 partidas por pesista, con el medidor de la verificación): el casual gana el oro 28 a 42 % de las veces; el flojo levanta 86 a 93 % de sus intentos (antes 54 a 69 %), oro 24 a 28 %, sin marca 0 a 0,4 % (antes 3,6 a 9,6 %).
- `tools/sim_test.mjs` pasa entero sin tocar `tools/sim_ref.json`.
- `tools/check_game.mjs` en el pod (RTX 4090 por `launchOptions()`): partida completa en Fácil por teclado sin mouse (tutorial incluido, con un fallo a propósito para ver su línea) y otra por toques en 390 × 844; arranque guiado y práctica con el reloj verdadero; pausa y ayuda; metrónomo y una práctica en Clásico; y la corrida «lento» (guiado con Brenner y un toque cada 600 ms, panel del llamado 40 s abierto sin gastar reloj, nulo por reloj con su línea). Sin errores de consola.
- `tools/primera.mjs`: capturas de jugador nuevo en escritorio, teléfono emulado y Clásico, miradas el 11-nov después de la corrección (en escritorio siguen hasta el nulo por reloj, una subida perdida por tocar lento y el primer dos tiempos de la final). El círculo de ¡EXPLOTÁ! se cierra en 0,73 a 0,82 s, el de ¡RECIBÍ! en 0,74 s, el de ¡ARRIBA! en 0,6 s y el de ¡RECIBÍ! de arriba en 0,55 a 0,62 s.

**Lo que no está medido o es estimación:**

- **Ninguna persona jugó el rediseño.** Los bots son un modelo (error de campana, ritmo de toques elegido a mano: uno cada 180 ± 35 ms el casual, 230 ± 60 ms el flojo). La prueba real es que el usuario complete el tutorial y una final.
- **El ritmo que pide ¡EMPUJÁ! está elegido con bots.** Pasa el que toca cada 350 ms (99,9 %), a medias el de 400 ms (79 %) y no pasa el de 450 ms (17 %). No se midió a qué ritmo toca una persona cuando lee «tocá rápido»; si es más lento, se baja `FACIL.minEmpuje` (con 150 el de 450 ms pasa 88 %, y el que toca a ciegas con intervalos de 150 a 900 ms sube a 12 a 17 %). El que toca demasiado lento tarda unos 5 s en perder la subida, porque venía avanzando.
- **Por encima del techo BIEN no alcanza.** Al 103 %, con todo en BIEN hace falta tocar cada 180 ms, y Marangi ni así. La línea dice «tocá más rápido; si no alcanza, pedí menos kilos».
- **En las aperturas TEMPRANO y TARDE casi no cuestan** (se levanta igual tocando rápido); cuestan del 95 % para arriba.
- **Teléfono real**: solo emulación táctil en Chrome. En vertical la señal va sobre el pie del escenario y tapa en parte las piernas del pesista en la recepción; no se probó si con el pulgar apoyado se lee.
- **El que sigue tocando rápido después de ¡EMPUJÁ!** en la cargada: hasta 0,7 s de más no cambia nada; con 0,5 a 1 s de más el casual baja a 95 % en dos tiempos (el toque de más arranca la flexión, y ahora hay 0,6 s para el siguiente).
- **En Fácil el jugador tiene ventanas más anchas y una subida más simple que los rivales**, que juegan con las reglas de Clásico. Con rivales amistosos el oro sale 24 a 42 % de las veces con las opciones que vienen puestas; con rivales normales y difíciles no se midió.
- **Dibujo con errores grandes**: con los límites anchos de Fácil el tirón puede seguir hasta 0,28 s de clip más allá de `Segundo tirón` antes del toque, y la flexión del envión dura 0,6 s (más lenta que en Clásico). Se miró en capturas con toques justos y uno tarde; no un toque en el borde del límite.
- **El registro guarda la salida de la capa, no las teclas**, y no se subió la versión de reglas (está atada a `sim.json`). Con servidor: subir versión y separar la tabla por `ctl`.
- Cuadros por segundo del juego: medidos el 12-nov en el pod, no en la Mac (ver la sección que sigue).

### Emoción: caídas, festejo, carga animada y plano del llamado (12-nov, noche, rama `demo`)

El usuario pidió «emoción (ayudantes cambiándole peso), ver cómo un pesista falla (se cae, se queda, no sube el clean, o el jerk falla, el snatch)». Sin modelos ni animaciones nuevas de Blender: todo con las poses de `poses.json`, la barra procedural y sonido por código. **Nada de esto corre durante el intento**: empieza cuando el núcleo ya dio el resultado. El núcleo, el registro y `tools/sim_ref*.json` no cambiaron.

- **El final del intento** (`web/js/game/caida.js`, `armarFinal()` y `dibujarFinal()` en `main.js`). Según la causa del núcleo y el movimiento, cinco escenas:
  - `bajo`: tirón sin altura o anticipado, con la barra entre la rodilla y el pecho.
  - `hombros`: «devuelve la barra», o la flexión del envión que no sale.
  - `sentado`: cargada perdida (aplastado, la pierde en el fondo, barra adelante). Se queda sentado 0,8 s y suelta la barra adelante.
  - `arriba`: arranque o envión perdido con la barra por encima de la cabeza. En «barra adelante» la barra sale adelante y la raíz salta 14 cm atrás; en «barra atrás», la barra sale hacia atrás y la raíz da 20 cm adelante.
  - `bajada`: válido o nulo de jueces. Sostiene la barra arriba (0,7 s en el válido y 0,35 en el nulo) y la deja caer adelante.

  La barra se suelta **antes** de que el cuerpo se mueva. Cae con gravedad, rebota con un coeficiente de 0,32, pierde velocidad horizontal en cada golpe, rueda con resistencia y no sale de la tarima. Usa paso fijo de 1/240 s, así que la repetición la vuelve a calcular igual. El pesista sostiene la pose del final y después se mezcla en línea recta hacia `Parado` con `athlete.setMix()`, una opción nueva de `athlete.js` que el visor no usa. **Estas secuencias son una aproximación hecha en el visor y no pasaron por `check()` de Blender.** No se inventaron rotaciones de huesos: solo hay mezclas entre muestras del clip y un corrimiento de la raíz de hasta 20 cm.
- **Decisión** (`decision()`): todo va en una sola línea de tiempo que se saltea entera con Espacio, después de 0,6 s (1,2 s si hay línea de fallo).
  - En un fallo, la cámara sigue la barra con el plano `caida` (`PLANOS` en `stage.js`). Suenan el golpe de goma con el traqueteo de las mangas y el «¡ohhh!» de la tribuna. Las luces rojas se prenden de a una.
  - En un válido, se prenden las luces blancas de a una mientras sostiene la barra. En la segunda suena la ovación, con aplausos sueltos (más fuerte en los intentos de medalla). Después la deja caer, la cámara la sigue y gira hacia el público.
- **Repetición**: el levantamiento va a un tercio de la velocidad (antes, un cuarto). Si se perdió, después viene la caída a media velocidad, con el motivo en una línea.
- **Cambio de carga** (`carga()` y `escena.cambioDeCarga()`): primer plano de la manga con la tarima vacía.
  - Las piezas que cambian salen deslizando, de afuera hacia adentro. El collarín también sale si hay que tocar un disco de adentro. Después entran las nuevas y el collarín cierra con un golpe metálico.
  - Los kilos del cartel cambian a medida que salen y entran las piezas.
  - `precalentar()` deja hecho y dibujado un disco de cada clase, así que la animación no crea texturas ni compila sombreadores en la partida.
  - **Los ayudantes humanos necesitan modelo y animación propios y quedan para la etapa de arte.** No se simularon con el modelo de un pesista.
- **Plano del llamado**: el primerísimo plano de la cara se reemplazó por un plano americano (`PLANOS.medio`). La cámara se corre para que el pesista quede en la parte del lienzo que deja libre el panel: a la izquierda en escritorio, arriba en vertical (`encuadreLibre()`).
- **Ritmo**: el veredicto sale a 1 s del final (antes, más de 2 s después de las luces). El resumen de un rival dura 2,6 s (antes 3,4 s), los avisos de cambio 1,1 s (antes 1,3 s) y «desplazado» 1,8 s (antes 2,2 s). Todo se saltea con Espacio.
- **Pruebas**:
  - `tools/caida_test.mjs` (sin navegador): cada causa tiene escena; la barra nunca pasa debajo de la tarima ni sale de ella, queda quieta en menos de 3 s, cada rebote es menor que el anterior y da lo mismo al repetir.
  - `tools/check_escenas.mjs` (con navegador): arma las 23 escenas en los dos modelos, mide cuadro a cuadro la holgura entre la barra y el cuerpo, prueba la carga animada y el plano del llamado, y deja capturas en `out/escenas/`.
  - Las dos corren en Actions.

**Medido** (Actions, dibujo por software: run 43265823178 sobre a17032d, y run 43267950535 sobre 3e48a23 con los encuadres más abiertos, los dos en verde):

- `check_escenas`: 46 finales (23 escenas por 2 modelos), cero cuadros BAD.
  - **Criterio**: el cuerpo se aproxima con cápsulas gruesas (tronco 13 cm, muslo 7,5 cm…). En la pose del final, que es una fase de `poses.json` validada en Blender, la barra apoyada en los hombros o rozando la cadera ya da holgura negativa contra esas cápsulas: hasta −2,4 cm en el rack de la cargada. Por eso un cuadro es BAD si la barra atraviesa un segmento **más** de lo que lo atravesaba en esa pose, con 5 mm de margen.
  - La primera corrida, con el criterio de «holgura negativa a secas», marcó 13 cuadros: todos en el primer o segundo cuadro después de soltar, con la barra todavía en la pose validada.
  - Después de soltar, la holgura mínima es de 4,3 cm (los antebrazos en la bajada del válido, 0,25 s después de soltar). En las caídas desde arriba va de 6 a 40 cm.
- Capturas miradas: arranque con barra adelante, barra atrás en tijera, cargada aplastado, envión devuelto, tirón sin altura, válidos, carga 140 → 151 y plano del llamado a 1745 × 845 y a 390 × 844. La barra cae adelante y lejos de las rodillas, y el pesista queda de pie detrás.
- Carga: 140 → 143 entra un disco por lado (0,5 s). 140 → 151 salen 3 piezas y entran 4 (2,2 s). 151 → 146 salen 2 y entra 1 (1,0 s). Los kilos terminan en el número pedido.
- `check_game`, `check_fluidez --tutorial` y las capturas de partida: en verde con las esperas nuevas.

**Lo que no está hecho o no se midió:**

- **No se miró en movimiento ni en una placa**: solo cuadros sueltos por software y números. Falta ver en la Mac si la mezcla lineal hacia `Parado` se ve como pararse o como un «morph» (las piernas pasan en línea recta de la sentadilla a de pie), si el salto de la raíz se lee como salto o como patinar, y cómo suena todo. No se midió ningún cuadro por segundo de estas escenas. Son posteriores al intento, pero dibujan con la sombra al día en cada cuadro.
- **No hay reacción del pesista** (festejo, lamento, «se cae» de espaldas): no hay poses para eso en `poses.json`. Después de soltar, siempre vuelve a `Parado`. Va con la pista de arte (JUEGO.md, sección 10), igual que los ayudantes.
- La mezcla toma la pose del último cuadro dibujado. En un fallo en medio de la pelea, la repetición pasa de un salto del final del levantamiento a la caída.
- Las holguras se miden con cápsulas sobre los huesos, no con las mallas. Una mano o un antebrazo puede rozar la barra en el primer cuarto de segundo después de soltar sin que la prueba lo vea (los brazos se miden desde 0,25 s).

### Jugabilidad y entrada en Fácil: entrada tolerante (12-nov, tarde, rama `demo`)

El usuario jugó tres veces y dijo: «difícil de acertar el momento donde tocar», «a veces no agarra bien el space, entonces toco mucho space y no levanta, es raro». El orquestador midió en su Mac que, tras ¡RECIBÍ!, 12 toques seguidos se descartaron por «espera» antes de que apareciera ¡EMPUJÁ! y el levantamiento se perdió. El objetivo de esta vuelta: que el que juega por primera vez, toca con poca precisión o machaca Espacio levante las aperturas, y que tocar bien se premie con más kilos posibles. Especificación al día en [docs/CONTROLES.md](docs/CONTROLES.md) (secciones 1.1, 2, 3, 4, 5 y 9).

**Qué cambió (solo Fácil y solo la persona; Clásico y los rivales igual, `tools/sim_ref.json` sin tocar):**

- **Entrada tolerante** (`controles.js`, `abre()`): cada señal con círculo vale de 300 ms antes del cierre (`FACIL.abreMs`; en el tirón, además, no antes de la rodilla) a 330 ms después (`FACIL.limMin`, o el límite si es más ancho), a cualquier peso. Un toque antes no llega al núcleo: motivo `temprano`, acuse TODAVÍA NO, la señal sigue esperando y vale el primer toque de adentro. Ya no hay amagues ni «tirón anticipado» ni «la pierde en el fondo» por tocar antes de tiempo (el núcleo conserva esas reglas para registros armados a mano).
- **La subida**: desde la recepción todo toque empuja (antes, los que llegaban antes de que arrancara la subida se descartaban por `espera`: es el caso que midió el orquestador), y vale mientras la barra no está arriba (antes se descartaban como `sobra` los que «ya alcanzaban»). En los pesos livianos **la barra sube sola** (hasta 0,3 por segundo: unos 2,3 s sin tocar contra 1,3 s tocando); la ayuda se apaga entre el 92 y el 96 % del techo. Se quitó el piso de exigencia que obligaba a tocar 3 por segundo.
- **Curva de dificultad** (`rules.js`, `holgura(I)`): ventanas de PERFECTO y BIEN al doble hasta el 92 %, bajan en línea recta hasta 1,15 en el 100 %. Con holgura, TEMPRANO y TARDE tienen 40 mm más de margen en el vuelo (`vueloMm`), y la traba de codos se cuenta desde que llega la barra (no desde el toque temprano).
- **Señal** (`ui/senal.js`, `juego.css`): el círculo se cierra a ritmo parejo; va gris hasta que abre la ventana; la franja dorada marca BIEN (y una más clara, PERFECTO) en la escala del círculo; cuenta 3-2-1 en tercios parejos arriba de la tecla. El acuse dice TODAVÍA NO (`main.js`), sin tapar la palabra del toque recién calificado.
- **Pruebas**: `tools/play_human.mjs` con bots nuevos y criterio nuevo (abajo); `tools/sim_test.mjs` prueba la entrada tolerante, que los toques entre la recepción y el arranque de la subida cuentan, la subida sola en aperturas (más lenta que tocando) y la cortada cerca del techo. `tools/sim_ref_facil.json` regenerado (cambian 2 de 9 partidas de referencia).

**Medido** (`node tools/play_human.mjs --info`, 2000 intentos por casilla, los tres pesistas; tabla completa en CONTROLES.md, sección 9). Columnas: arranque · dos tiempos con tijera · power · squat.

| Bot | Aperturas (88 a 92 %) | Meta | Al 100 % | Meta |
|---|---|---|---|---|
| Machacador (6 a 8 toques por s, sin mirar) | 96,7 · 99,8 · 97,5 · 98,1 % | ≥ 80 % | 2,0 · 0 · 0 · 0 % | ≤ 25 % |
| Casual (desvío 80 ms) | 100 · 100 · 100 · 100 % | ≥ 95 % | 64,3 · 52,3 · 41,5 · 53,4 % | 35 a 70 % |
| Flojo (desvío 160 ms) | 94,0 · 91,5 · 91,5 · 91,1 % | ≥ 80 % | | |
| Distraído (un toque por señal, 250 ms tarde, uno solo en ¡EMPUJÁ!) | 89,2 · 94,3 · 94,3 · 83,0 % | ≥ 70 % | | |
| No toca | 0 % | 0 % | | |
| Casual con 3 toques por s en ¡EMPUJÁ! | 100 % | ≥ 95 % | | |

- En el medio: machacador 37 a 95 % al 95 % y 1 a 51 % al 97 %; casual 98 a 100 % y 84 a 96 %. El distraído con un solo toque en ¡EMPUJÁ! cae a 0 % desde el 95 % (si toca 3 por segundo, 86 a 95 % en aperturas).
- `sim_test` y `play_human` en verde en la Mac (sin navegador). Clásico, casual y flojo: 22,6 y 26,4 % en arranque, iguales que antes.
- **Actions**: la primera corrida (run 43255069855) falló en `check_game`: la línea del arranque sin explosión decía «Tocaste ¡EXPLOTÁ! tarde» porque el toque con que la prueba saltea el veredicto (a más de 500 ms del final) contaba como toque tardío. Ahora solo cuenta como tardío un toque descartado en los 400 ms después del final (`decision()` en `main.js`). Con eso, run 43257731276 en verde: `check_game` (teclado 152✓ 157✓ 160✗ a propósito con «No tocaste ¡EXPLOTÁ!», 190✓ 195✓ 198✓; táctil 6 de 6; «lento» válido), `check_fluidez --tutorial` (80 Espacio enviados y recibidos, 42 aceptados y 12 descartados con motivo dentro del intento: 4 espera, 4 rebote, 4 sobra) y el banco (run 43257731004). En las capturas por software la franja se ve como un anillo dorado alrededor del aro; la cuenta no salió en ninguna (las fotos se sacan cerca del cierre).

**Lo que no está medido o no cumple:**

- **Ninguna persona lo jugó y la señal nueva no se vio en una placa**: solo en las capturas por software de Actions (ver la corrida abajo, si existe). La franja y la cuenta son DOM y CSS; no se midió si se leen a 75 Hz ni si la cuenta de 3 tiempos en 0,6 a 0,8 s es demasiado rápida para leer.
- **Machacar ahora levanta las aperturas**, que era lo pedido. El criterio viejo («a ciegas menos de 10 %») se quitó. Entre el 92 y el 95 % el machacador todavía levanta casi tanto como el casual: la diferencia aparece al 97 %.
- **El caso exacto de los 12 toques en «espera» no se reprodujo con su registro**: con la capa de antes, después de la recepción se descartaban por `espera` los toques hasta el arranque de la subida (lo que faltaba del vuelo si la recepción fue temprana, más 126 a 141 ms de amortiguación en la cargada o 538 a 595 ms de fondo en el squat: cerca de 1 s en el peor caso, unos 10 toques a ritmo de machacar). Ese descarte ya no existe; no se midió en su máquina.
- **La final entera contra rivales con estas reglas no se midió** (antes: oro 24 a 42 % de las veces). Con más pesos levantables es probable que suba.
- **Lo que pasa después de un toque TODAVÍA NO de la persona no queda en el registro** (el registro guarda la salida de la capa). Los bots de la prueba sí vuelven a tocar.

### Fluidez, entrada y tutorial (12-nov, rama `demo`)

El usuario jugó el rediseño en su Mac (M1 Pro, Chrome, pantalla de 75 Hz) y dijo: «sigue siendo complejo jugar sobre todo porque tuve que hacer el tutorial 3 veces, además tiene pocos fps por el timing de tocar los botones para completar el levantamiento, necesito que se vea más fluido, y no me detecta bien a veces la barra espaciadora». En su Chrome el registrador del juego daba 22 cuadros dibujados por segundo de mediana durante el intento (mínimo 4) y 25 en el inicio, con calidad «Media» a 1919 × 929.

**Qué se encontró** (`tools/check_fluidez.mjs` sobre el commit 6e23160, en el pod con RTX 4090, Chrome sin pantalla a 60 Hz, ventana de 1920 × 930, juego en tiempo real con teclado real, sin estrangular y con el procesador a 1/4 y 1/6):

- **Durante el intento propio el juego no salteaba cuadros.** Dibujó 407 de 407, 388 de 388, 382 de 382 y 608 de 608 cuadros ofrecidos (tres arranques y un dos tiempos), y lo mismo a 1/4 y a 1/6. La idea de que «el navegador ofrece 75 y el juego dibuja uno de cada tres» no se reproduce en el intento: en `tic()` el modo `intento` dibujaba siempre.
- **Fuera del intento sí:** había un tope de 30 ms entre dibujos (veredicto, carga, intento de un rival, espera de la carga). A 60 Hz eso da 30 por segundo (el registrador marcó `decision 30/30`); a 75 Hz, donde un cuadro dura 13,3 ms, el tope cae en el tercer cuadro: 25 por segundo. Es el «25» que se midió en la Mac fuera del intento.
- **Los 22 por segundo durante el intento en la Mac no salen del bucle: son el costo de «Media» en esa placa.** No se pudo medir desde acá (la 4090 dibuja Media a 60 sin perder un cuadro). El dato que hay es de la prueba del visor en esa misma máquina (sección «Pendientes», Rendimiento): alta y media caen a 20 a 45 fps tras 60 a 80 s de dibujo continuo, y solo baja sostiene 60. El juego elegía Media y no tenía gobernador.
- **Hilo principal:** 4,6 a 6,3 ms por cuadro con el perfilador puesto (3,4 ms de mediana en una traza), casi todo recorrido de escena y llamadas de dibujo de three.js; la lógica del juego no aparece entre las primeras 28 funciones, y cuesta lo mismo en Media, Baja y Móvil. Recolección de basura en un arranque de 7,7 s: 13 menores, la más larga de 1,7 ms; ninguna mayor.
- **Trabajo pesado en medio del intento que sí había:** el segundo modelo (10 MB) se cargaba «durante el calentamiento», o sea encima del primer levantamiento; el lienzo 2D de las ayudas se realojaba entero (`width = width`) cada vez que las ayudas aparecían o se iban (Clásico e intentos de rivales); cada sonido generaba su búfer de ruido en el momento. A 1/6 hubo una tarea larga de 65 ms dentro de un intento.
- **Toques: todos llegaban a la página** (82 a 86 enviados, los mismos recibidos, `target` BODY). De los 56 a 59 que caían dentro del intento, **13 a 17 se descartaban sin dejar rastro** (en PREPARATE, en AGUANTÁ, por rebote, o en ¡EMPUJÁ! cuando ya alcanzaba), y fuera del intento otros 26 (16 de ellos en el veredicto, antes de los 0,4 a 1,2 s en que se puede saltear). Además, un `keyup` perdido dejaba la tecla «apoyada» y el toque siguiente se tiraba; un toque que llegaba después del límite recibía «No tocaste ¡EXPLOTÁ!»; y Tab en medio del intento podía sacar el foco de la página.
- **Tutorial:** eran tres levantamientos (guiado y dos prácticas); el guiado se repetía hasta tres veces si fallaba; y `tarima.tutorial` se guardaba recién al final, así que recargar a mitad lo empezaba de nuevo.

**Qué cambió:**

- **Bucle** (`main.js`, `tic`): se dibuja en cada cuadro que ofrece el navegador, salvo detrás de un panel (imagen congelada).
- **Calidad** (`perf.js`, `stage.js`): por defecto Baja en vez de Media; calibración antes de jugar y gobernador que solo baja y nunca con un intento en curso. Detalle en `docs/JUEGO.md`, sección 8.7. `?q=media` o `?q=alta` devuelven los efectos, sin gobernador.
- **Sin trabajo pesado en el intento:** los dos modelos se terminan de cargar antes de jugar (empiezan a bajar con el inicio) y se muestra cada pesista un cuadro (shaders y texturas); el lienzo de las ayudas se oculta en vez de realojarse; los búferes de ruido se generan una vez.
- **Entrada** (`input.js`, `controles.js`, `main.js`): registro `toques` y acuse de cada pulsación con motivo en una palabra; el `keyup` perdido ya no descarta; Tab no sale de la página; cartel si la ventana pierde el teclado; `?depura=1`. Tabla de descartes en `docs/CONTROLES.md`, sección 1.1. Los que quedaron tienen motivo: repetición del sistema, rebote de 60 ms, RESPIRÁ, AGUANTÁ, 400 ms de panel recién abierto y el mínimo del veredicto.
- **Tutorial**: un arranque guiado, sin panel ni prácticas; Esc o el botón «Saltear tutorial ESC» lo cortan; se anota al salir del inicio. El dos tiempos se explica en su primer llamado de la final, con una parada en los hombros (`docs/CONTROLES.md`, sección 6).
- **Pendientes de la verificación anterior que se cerraron:** la línea de fallo dice temprano o tarde y cuánto (`codos_blandos`, `temblor`) y distingue «tocaste tarde» de «no tocaste»; la palabra de cada toque lleva su verbo («¡EXPLOTÁ! PERFECTO»); «ENVIÓN: TIJERA» ya no va sobre el pesista en Fácil; el panel del llamado en Fácil deja a la vista kilos, entrenador, cuenta y reloj (atajos de kilos, envión y cambios en «Más opciones») y va al costado derecho, sin tapar al pesista; «Techo» pasó a «Tope» y la ayuda (H) explica Tope, Resto, «jueces 2 a 1» y apertura; el inicio entra en 1280 × 720 (Rivales y Final en una fila).

**Medido después** (mismo script, commits 7c98bb9 y 4957963, mismo pod; dos corridas completas):

| | Antes (6e23160, Media) | Después (Baja, automática) |
|---|---|---|
| Cuadros dibujados sobre ofrecidos, en el intento, 1x · 1/4 · 1/6 | 100 % · 100 % · 100 % | 100 % · 100 % · 100 % (entre 356 y 621 cuadros por intento) |
| Cuadros por segundo fuera del intento (registrador, `decision`) | 30 (tope) | 60 |
| Tareas de más de 50 ms dentro de un intento, 1x · 1/4 · 1/6 | 0 · 0 · 1 (65 ms); otra corrida a 1x con `?q=baja`, 1 de 82 ms | 0 · 0 · 1 (52 ms) en una corrida; 0 · 0 · 8 (la peor, 124 ms) en la otra |
| Cuadros de más de 33 ms por intento, 1x y 1/4 | 0 a 4 a 1x; 0 a 28 a 1/4 | 0 en los ocho intentos de la última corrida; 0 a 31 en la anterior (ruido del pod, ver abajo) |
| Toques del intento descartados sin motivo | 13 a 17 de 56 a 59 | 0 (13 a 16 descartados, todos con motivo y acuse: espera 4, rebote 0 a 4, sobra 8 a 10) |
| Toques fuera del intento sin registro | 26 | 0 (26: 14 aceptados, que saltean el resumen, el veredicto o la repetición, y 12 «esperá» en el veredicto) |
| Levantamientos antes de jugar la primera vez | 3 | 1 (14 s de «Empezar» a la presentación con un jugador que toca a los 450 ms; 11,2 s en `check_game`) |
| Recargar la página repite el tutorial | Sí, si no se había terminado | No |
| Círculo desde que aparece hasta que cierra | — | ¡EXPLOTÁ! 0,78 a 0,84 s · ¡RECIBÍ! 0,68 a 0,75 s · ¡ARRIBA! 0,58 a 0,60 s · ¡RECIBÍ! de arriba 0,60 a 0,62 s |

- **Gobernador** (`--gobernador`, con una espera artificial por megapíxel dibujado): con 18 ms/MP la calibración bajó de Baja a Baja 80 % antes del primer intento (midió 33,3 ms por cuadro); con 40 ms/MP desde la mitad del primer intento la calidad no se tocó hasta que terminó, y después bajó tres escalones (al final del intento, en la carga y al final del siguiente). En la corrida a 1/6, sin lastre, bajó solo una vez, al terminar el dos tiempos (21,6 ms por cuadro).
- **A 1/6 de procesador el juego no sostiene 60:** el cuadro cuesta unos 3,4 ms de hilo principal, que por seis son 20 ms. Se dibuja el 100 % de lo que se ofrece, pero se ofrecen menos: en la última corrida el primer intento fue a 33 ms de mediana de punta a punta (241 cuadros en 7 s, ocho tareas largas), el gobernador bajó a Baja 80 % al terminarlo y a Móvil en la carga siguiente, y los dos intentos de después dieron 0 y 11 cuadros largos. A 1/4 no pasa. El costo es de three.js (recorrido y llamadas de dibujo), no de la lógica; no se tocó.
- **Lo que no se movió:** en el pod la cuenta de cuadros del intento ya daba 100 % antes; lo que cambia ahí es el dibujo fuera del intento, las tareas largas y los toques. La mejora que le importa al usuario (Media a Baja en su placa) no se ve en una 4090.
- **Ruido del pod.** Entre cuadros hay rachas de 33 ms (un refresco perdido) que no dependen del juego: una página con un solo `clear` de WebGL perdió 1 cuadro en 20 s en una corrida y 38 en otra (36 en 6 s seguidos); el juego en Media sin estrangular perdió 0, 0, 0 y 1, y en Baja 4, 0, 31 y 20 en otra corrida de la misma noche. Había otro equipo usando la máquina (carga media 4 a 14). Por eso la prueba tiene como umbral los cuadros dibujados sobre ofrecidos y las tareas largas, y no el percentil 99.
- `tools/sim_test.mjs` y `tools/play_human.mjs` en verde sin tocar `tools/sim_ref.json`; `tools/check_game.mjs` en verde con el tutorial nuevo (ahora juega en tiempo real el guiado y el primer intento de la final).

**Lo que no está medido o no cumple:**

- *(Lo de calidad de esta lista quedó superado por la segunda vuelta, en la sección que sigue: el orquestador midió en la Mac, y la resolución ya no tiene el tope de 1280 × 800.)*
- **Nada de esto se midió en la Mac del usuario.** Que Baja llegue a 75 cuadros en la M1 Pro es una inferencia de la medición vieja del visor (60 sostenidos en Baja); si no llega, la calibración baja a Baja 80 % antes del primer intento. Para verlo: `juego.html?depura=1` (ofrece y dibuja por segundo, ms por cuadro, calidad y cuántas veces bajó) o `JUEGO.calidad` y `JUEGO.perf.resumen()` en la consola.
- **Baja se ve más blanda:** dibuja hasta 1280 × 800 píxeles (1453 × 704 en la ventana del usuario, reescalado) y no tiene oclusión, desenfoque ni resplandor. No hay selector en pantalla para volver a Media: solo `?q=media`. El gobernador no vuelve a subir.
- **El estrangulamiento de procesador no imita una placa lenta.** El costo de GPU de otra máquina solo se probó con el lastre artificial, que es una espera en el hilo principal.
- **Los 22 por segundo de la Mac se explican por inferencia**, no por una medición propia. Si con Baja siguiera habiendo diferencia entre «ofrece» y «dibuja» en el recuadro de depuración, la causa es otra y hay que mirarla ahí.
- **Qué toque «no detectaba» el usuario no se sabe.** Lo medido es que todos llegan y que 13 a 17 por partida se descartaban sin aviso; ahora cada descarte dice por qué. Si vuelve a pasar, el recuadro de depuración muestra los últimos siete toques.
- En una corrida de control hubo un cuadro de 100 ms justo al aparecer ¡TIRÁ! en el primer intento, sin tarea larga en el hilo principal (o sea, fuera de JavaScript: composición o placa). Una vez en siete corridas; no se encontró la causa ni se sabe si es del pod.
- El doble toque accidental en ¡EXPLOTÁ! o ¡ARRIBA! a más de 60 ms sigue contando como ¡RECIBÍ! temprano (regla documentada en `docs/CONTROLES.md`); no se cambió.
- `tools/primera.mjs` quedó atrás del tutorial nuevo (sale con un aviso); las capturas se sacan con `check_fluidez --capturas`.
- Teléfono: el acuse y el botón de saltear solo pasaron por la emulación táctil de `check_game`; no se miraron en capturas de teléfono. El inicio en teléfono vertical sigue apretado (hallazgo de la verificación anterior, sin tocar).
- En el inicio las flechas siguen moviendo el foco sin elegir (hallazgo anterior, sin tocar).

### Fluidez, segunda vuelta: pantalla de 75 Hz, calibración y banco de medición (12-nov, rama `demo`)

El usuario volvió a jugar y dijo «fps… le falta laburo para que ande fluido». **Lo que midió el orquestador en su Mac** (M1 Pro, Chrome, pantalla de 75 Hz, ventana de 1745 × 845, densidad 1,1) antes de esta vuelta:

- En reposo, en «Baja»: 13,3 ms por cuadro (75 por segundo) con 1,9 ms de hilo principal. El hilo principal no es el problema.
- El primer levantamiento en «Baja» (1,02 MP) tuvo cuadros duplicados (percentil 90 de 26,5 ms, uno de 148 ms). El gobernador bajó a «Baja 80 %» (0,65 MP) y el siguiente salió limpio (294 cuadros, máximo 14,3 ms). O sea: lo limita la placa, y 0,65 MP en esa ventana se ve blando.
- `JUEGO.calidad` decía 60 Hz y meta 60 en una pantalla de 75: `medirRefresco` ajustaba lo medido a una lista y, si no caía a menos del 8 % de un valor, devolvía 60. Con meta de 16,7 ms el gobernador daba por buenos cuadros que a 75 Hz ya pierden el refresco.
- Apagar las sombras en caliente dio un cuadro de 934 ms (recompilación de todos los materiales).

**Qué cambió** (`web/js/game/perf.js`, `stage.js`, `main.js`, `banco.js`; el visor no se tocó):

- **Pantalla.** `medirRefresco` devuelve la frecuencia medida (mediana de los intervalos del navegador, sin lista): 75, 67 o la que sea. Se mide al cargar y otra vez, sin dibujar, justo antes de calibrar. Si durante la partida casi todos los cuadros llegan antes del período supuesto (la ventana pasó a un monitor más rápido), el gobernador corrige la frecuencia solo. Por encima de 90 Hz se dibuja uno de cada dos refrescos, para que 120 Hz den 60 cuadros parejos y no una mezcla de 8 y 17 ms. El intervalo entre cuadros sale de la marca de tiempo del navegador, no de cuándo corrió el código.
- **La calidad se decide antes del primer intento** (`calibrar()` en `main.js`, `decidirCalidad()` en `perf.js`), detrás de «Cargando pesistas…» y con el pesista haciendo un arranque en bucle, no en reposo. Mide cuánto cuesta un cuadro a dos resoluciones (`escena.costo()`: dibuja y lee un píxel, que obliga a la placa a terminar), traza la recta costo = fijo + por megapíxel y calcula cuántos megapíxeles entran en el **85 % del período**. Después verifica con cuadros de verdad: si se pierde un refresco, 15 % menos de píxeles y de nuevo. El tope ya no son 1,02 MP fijos: es lo que dé la cuenta, hasta la resolución de la pantalla (máximo 3,7 MP). Si «Baja» entra con más del doble de margen prueba «Media» y después «Alta», y se queda con la más alta que sostenga la pantalla (o 1080p); si no llega a 0,5 MP pasa a «Móvil». Tarda entre uno y dos segundos. Lo que midió queda en `JUEGO.calidad.calibracion`.
- **Nada se recompila en la partida.** `escena.precalentar()` corre apenas bajan los modelos (detrás del panel del inicio): compila en paralelo (`compileAsync`, con el destino de la escena puesto, porque el programa depende del destino) los materiales de los dos modelos **con sombras y sin sombras**, y después dibuja un cuadro de cada variante con todo a la vista, que es donde suben las texturas y se compilan la pasada de sombra, los pases de pantalla y la traza de la repetición. three guarda los dos juegos de programas por material, así que prender o apagar sombras después no compila nada. Dentro de la partida, bajar un escalón es **solo dibujar menos píxeles** (15 % menos por escalón, hasta 0,3 MP) y el último escalón apaga las sombras. Cambiar de calidad (Baja a Media, por ejemplo) solo pasa en la calibración.
- **Gobernador.** La meta es no perder ningún refresco: cuenta los refrescos perdidos en ventanas de 1 s (un intervalo de dos períodos es uno perdido). Dos ventanas con dos o más perdidos entre las últimas cuatro, o una sola que pierda la quinta parte, piden bajar (uno a tres escalones según cuánto se pierde). Sigue sin tocar nada con un intento en curso ni en la repetición. Si después de bajar se pierde casi lo mismo dos veces seguidas, deja de pedir (`JUEGO.calidad.quieto`): cuando lo que molesta es otra cosa de la máquina, la imagen no se sigue ablandando en vano. El costo de la placa no se ve desde el bucle (los intervalos llegan en múltiplos del período), por eso el margen del 85 % lo pone la calibración.
- **Costo de la escena del juego**, lo que se podía deducir sin medir:
  - El juego nunca elegía nivel de detalle: dibujaba siempre la malla completa del pesista (unos 90 mil triángulos de cuerpo y hasta 46 mil de pelo, dos veces por cuadro con la sombra) aunque en plano general cada triángulo mide menos de un píxel. Ahora usa el mismo criterio que el visor (`Athlete.setScreenScale`, por píxeles por metro): índice simplificado al 30 % y 45 % en plano general, completo en los primeros planos; y apaga las normales de detalle de piel y tela cuando no se resuelven.
  - En «Baja» y «Móvil» ningún pase lee la profundidad de la escena: ya no se resuelve (una pasada de pantalla completa menos) ni se guarda la del MSAA.
  - Sombra de «Baja» en un mapa de 768 en vez de 1024, con la misma penumbra en centímetros (44 % menos de píxeles en la pasada de sombra y su desenfoque).
  - «Media» y «Alta» del juego no reservan los destinos del desenfoque de movimiento de la barra, que el juego nunca usó.
  - **No se tocaron las luces ni los materiales**: seis focos, una direccional y la de sala entran en cada material iluminado, y la tarima y la alfombra son materiales físicos. Sacar luces o abaratar el piso cambia la imagen y acá no hubo cómo mirarla; el banco mide cuánto ahorra cada cosa para decidirlo con el dato.
- `JUEGO.perf.largos`: los últimos 200 cuadros que perdieron un refresco, con la pantalla y la fase del intento en que cayeron. Sirve para ver si los tirones caen siempre en el mismo lugar.

**Banco de medición**: el de esta vuelta medía las variantes en tira y derivaba con la máquina cargada; se rehízo en la tercera vuelta (abajo).

**Cómo se probó.** No hubo máquina con placa ni navegador en esta vuelta. Lo que corrió:

- `node tools/perf_test.mjs` (nuevo, sin navegador, 50 comprobaciones): medición de refresco de 50 a 165 Hz, gobernador (cuándo pide, cuántos pasos, cuándo se queda quieto), `decidirCalidad` contra doce máquinas simuladas (entre ellas la de la prueba `--gobernador`: 18 ms por megapíxel) y el banco entero contra una escena simulada (recorre las 29 variantes, deshace cada una, respeta el límite de tiempo, recupera el costo que se le inventó).
- `tools/sim_test.mjs` y `tools/play_human.mjs`: en verde, sin tocar reglas ni referencias.
- Actions (dibujo por software): ver el resultado de la corrida más abajo.

**Lo que no está medido o no cumple:**

- **Ni la calibración, ni el precalentado, ni el banco corrieron nunca en un navegador.** En Actions el juego se abre con `?dibujo=0` y esos caminos no se ejecutan; lo único que dibuja ahí es el cuadro forzado de las capturas, por software. La primera corrida de verdad es la del orquestador en la Mac. Si la calibración falla, queda anotado en `JUEGO.calidad.calibracion.error` y el juego sigue con «Baja» a 1,02 MP; si falla el banco, `BANCO.errores`.
- **Fluidez en la Mac del usuario: sin medir.** No se sabe cuántos megapíxeles sostiene «Baja» a 75 Hz después de estos cambios ni si el primer levantamiento sale sin cuadros duplicados.
- **El cuadro de 148 ms del primer levantamiento no tiene causa encontrada.** El precalentado ahora cubre los dos modelos, las dos variantes de sombra, la pasada de sombra y la traza; si vuelve a aparecer, `JUEGO.perf.largos` dice en qué fase.
- **Cuánto ahorra el nivel de detalle, la profundidad sin resolver y la sombra de 768: sin medir.** Son deducciones del código. La sombra de 768 no se pudo mirar en una placa real.
- **Las luces y los materiales del piso siguen como estaban.** Es probablemente donde está el costo por píxel, y es lo primero que hay que decidir con el banco.
- **Si la calibración sube a «Media» o «Alta»**, las texturas del pesista y de la tarima quedan en 1024 (se eligen al construir la escena, en «Baja»). Y la regla para subir (más del doble de margen) no se probó en ninguna placa.
- **Pantallas de más de 90 Hz**: dibujar uno de cada dos refrescos no se probó en ninguna.
- **Teléfono**: la calibración arranca en «Móvil» y no sube. Sin medir.
- `tools/check_fluidez.mjs --gobernador` (necesita placa) no se volvió a correr. Con el lastre de 18 ms por megapíxel la cuenta da unos 0,56 MP a 60 Hz, por debajo de los 1,02 de antes, así que la calibración tiene que anotar una bajada antes del primer intento; está probado solo con la máquina simulada.

### Fluidez, tercera vuelta: camino directo, sombra barata y banco que aguanta ruido (12-nov, rama `demo`)

**Punto de partida: el banco que corrió el usuario en su Mac** (M1 Pro, 74,96 Hz, período 13,34 ms, ventana 1745 × 845, densidad 1,1, 1,78 MP a su resolución), con la máquina muy cargada (carga media 38 en 8 núcleos):

- «Baja completa» (destino HDR con MSAA 4 y pase final): 9,3 ms fijos + 5,3 ms por MP: 14,5 ms a 1 MP y 18,7 a la resolución de la pantalla. No entra en 13,3 ms; la búsqueda con cuadros de verdad perdió refrescos aun a 0,15 MP.
- «Directo al lienzo» (sin destino HDR, MSAA ni pase final): costo fijo 4,3 ms. La pasada de sombra eran 96 de 243 llamadas y 84 mil de 188 mil triángulos.
- Lo que no valía: todas las variantes medidas después de la primera costaron más que la escena completa (ahorros de −5 % a −340 %) y los programas compilados crecieron de 82 a 197 durante la corrida. El banco medía en tira y la máquina cambió de carga en el medio.

**Qué cambió** (`web/js/game/stage.js`, `perf.js`, `banco.js`; `tools/banco.mjs` y `tools/perf_test.mjs`; el visor no se tocó: nada de esto corre en `index.html`):

- **Camino directo en «Baja» y «Móvil»** (`PRESET.baja.directo`, `Escena._modo()`): la escena se dibuja en una sola pasada al lienzo, con MSAA del propio lienzo (`antialias: true`; en una placa por mosaicos como la M1 se resuelve dentro del mosaico). El tono AgX con exposición 1,12 y la corrección del pase final (saturación 1,04, contraste 1,03, gamma de sombras 0,86 y el tinte frío/cálido) van dentro de cada material como `CustomToneMapping` (el visor no lo usa). Los `ShaderMaterial` de la arena (haces, discos de luz, público) se completan con el tono y el paso a sRGB. La viñeta y los negros levantados son un gradiente CSS encima del lienzo (lo compone el navegador), con la cuenta hecha para que dé lo mismo que el pase final; la niebla se pasa a colores de pantalla porque three la mezcla después del tono. Se pierde el grano (0,02) y la mezcla de lo aditivo (haces, bruma, flashes) se hace después del tono y no antes: puede verse algo distinta. **No se miró en una placa**: hay que compararlo a ojo con `?q=media` o con la variante «post» del banco.
- **Sombra barata**: la arena entera deja de proyectar (tarima, escenario, magnesiera, cartelones). Ojo: con sombras VSM three dibuja en el mapa de sombra también todo lo que *recibe* sombra, así que apagar `castShadow` no alcanzaba (la primera corrida en Actions seguía dando 95 llamadas en la pasada de sombra). Ahora la cámara de sombra ve solo una capa propia (`CAPA_SOMBRA`, 2) donde están el pesista, una copia sin grupos de material de cada pieza de la barra (una llamada por pieza en vez de una por grupo: el eje sólo tenía nueve) y lo de la arena que recibe sombra dentro del cono de la clave (tarima y alfombra; `JUEGO.escena.recibenSombra` dice cuántas). Fuera de ese cono la sombra no llega, así que no cambia nada visible. Mapa de 512 en «Baja» (antes 768), con la misma penumbra en centímetros. La cámara de sombra ya estaba cerrada sobre el pesista y la barra (`focus` 0,64 del cono de la clave: 3,8 m en la tarima; cerrarla más corta la sombra de la barra arriba de la cabeza). Con el pesista quieto la sombra no se recalcula (ya era así: solo se rehace cuando se posa).
- **Arena fija junta** (`juntarFijos` en `stage.js`): al construir la escena, la geometría de la arena que no se mueve se junta en una malla por material, después de hornear el entorno. Quedan afuera lo transparente, lo instanciado, los `ShaderMaterial`, lo espejado, el público, los haces, las luces de los jueces, el tablero y el reloj. Cuántas mallas había y cuántas quedaron: `JUEGO.escena.fijos` y `BANCO.mallasFijas`.
- **0x506 del banco**: venía de enlazar la profundidad del destino de post (`BOKEH.tDepth`) dibujando directo: three la creaba con un tamaño viejo y el destino quedaba con piezas de distinto tamaño. En el camino directo ya no se enlaza.

**Banco de medición: `juego.html?banco=1`.** Corre solo, sin tocar nada, y termina en menos de 2 minutos (115 s contados desde que se abre la página; `?limite=` lo cambia). Escena fija: Brenner haciendo el arranque en bucle con 140 kg y la cámara del juego, con el detalle del pesista del plano general. Al terminar muestra dos tablas y deja todo en `window.BANCO` (JSON, `listo: true`, `version: 2`; `BANCO.progreso` dice por dónde va, `BANCO.errores` lo que falló). **Hay que dejar la pestaña a la vista** (oculta, el navegador no da cuadros). Parámetros: `?pesista=ventura`, `?solo=baja,media`, `?variantes=sombras,luces`, `?vueltas=3`, `?mp=0.5,1.5`, `?n=10`.

Cómo mide, para que sirva con la máquina en uso:

1. Una **medida** es el costo de un cuadro sin esperar a la pantalla (dibuja y lee un píxel, que obliga a la placa a terminar), mediana de 10 cuadros, a 0,5 y a 1,5 MP; con los dos puntos traza la recta costo = fijo + por MP.
2. **Calidades**, en tres vueltas: Baja, Móvil, Baja, Media, Baja, Alta… Cada calidad se compara con la Baja medida justo antes (`vsBajaMs`).
3. **Variantes de Baja**, en tres vueltas, intercaladas con la escena completa: A, B, A, C, A… Cada variante se compara con el promedio de las dos completas que la rodean, no con una de hace un minuto. Se informa la mediana de las vueltas y el rango.
4. Lo que una variante compila **se libera al deshacerla**: por cada material de la escena con programas nuevos, se le deja a three solo esos en su mapa y se le avisa que el material se descartó; three los suelta por su camino de siempre y el material vuelve a tomar los suyos, ya compilados (`programasSobrantes` tiene que dar 0). Lo que no se puede soltar desde afuera son los programas de los materiales internos de la pasada de sombra de three, cuya clave incluye cuántas luces hay: quedan después de «contraluces», «luces» y «post» (unos 6, 6 y 2 por software) y se informan en `programasInternos`; no se usan después de deshacer la variante. Destruir los programas a mano no sirve: three los sigue teniendo en su caché por clave y la vuelta siguiente usa uno destruido (0x502; pasó en la segunda corrida). Y a un `ShaderMaterial` el aviso le borra los ids de su código, así que al volver compilaba otra vez lo mismo con otra clave (13 programas de más por variante de luces): durante el aviso deja de parecer `ShaderMaterial`.
5. **Cuadros de verdad**: búsqueda sobre la resolución con `requestAnimationFrame` para «Baja completa» (cada prueba descarta 10 cuadros y mide hasta 50): cuántos MP sostiene sin perder ningún refresco.
6. Si se acaba el tiempo, se cortan vueltas enteras (todas las variantes con las mismas vueltas) y lo dice una nota.

Variantes de «Baja»: sin sombras, sombra de 1024 (más cara: para saber si se puede pagar), sin público, sin haces, sin bruma ni puntos de luz, sin los tres contraluces, solo la clave y la luz de sala, **post** (la Baja de antes: destino HDR, MSAA 4 y pase final; su «ahorro» negativo es lo que ahorra el camino directo), sin arena, sin el segundo modelo (tiene que dar 0), sin pesista, pesista con malla completa, sin normales de detalle, sin pelo, sin barra, piso con material difuso simple, anisotropía 1.

Columnas (los nombres largos están en `BANCO.columnas`):

| Columna | Campo | Qué es |
|---|---|---|
| Calidad / Variante | `nombre` | «Baja completa» es la escena del juego por defecto; «Baja sin sombras» es esa escena con una sola cosa menos |
| Vueltas | `vueltas` | Cuántas medidas hay; los números son la mediana |
| Fijo ms | `fijoMs` | Lo que cuesta el cuadro aunque no se dibuje ningún píxel: geometría, esqueletos, pasada de sombra, llamadas |
| Por MP ms | `porMPms` | Lo que agrega cada megapíxel: materiales, luces, MSAA |
| A 1 MP ms | `ms1MP` | Fijo más por MP |
| Rango a 1 MP | `ms1MPmin`, `ms1MPmax` | La menor y la mayor de las vueltas (`dispersion`: rango sobre mediana) |
| A la de la pantalla ms | `msNativo` | El costo a la resolución de la pantalla (`BANCO.nativoMP`) |
| MP que entran (cuenta) | `mpModelo` | Megapíxeles que caben en el 85 % del período según la recta |
| MP sin perder refrescos | `mpReal` | Lo medido con la pantalla: la mayor resolución probada sin perder un refresco |
| Pierde desde MP | `mpFalla` | La menor probada que sí perdió. El límite real está entre las dos |
| Contra Baja ms | `vsBajaMs` | Solo calidades: costo a 1 MP menos el de la Baja de justo antes |
| Ahorro ms | `ahorroMs` | Cuánto baja el costo a 1 MP contra las completas de al lado. Negativo: cuesta más |
| Rango del ahorro | `ahorroMin`, `ahorroMax` | El menor y el mayor ahorro de las vueltas |
| Ahorro % | `ahorroPct` | El ahorro sobre el costo de la completa a 1 MP |
| Del fijo, Por MP | `ahorroFijoMs`, `ahorroPorMPms` | El ahorro separado en costo fijo y por megapíxel |
| Llamadas, Triángulos | `llamadas`, `triangulos` | De un cuadro entero, con la pasada de sombra |
| Programas sobrantes | `programasSobrantes` | Programas de materiales de la escena que quedaron después de deshacer la variante. Tiene que ser 0. Los internos de three van en `programasInternos` |
| ruidosa | `ruidosa` | El número no sirve para decidir: las completas de alrededor difieren 15 % o más, el rango de los ahorros es 15 % o más del costo de la completa, o los ahorros cambian de signo con mediana chica. En «Baja completa» marca que la máquina cambió de carga (las comparaciones siguen valiendo) |

Además: `BANCO.deriva` (costo de la completa al principio y al final de las variantes; si cambia mucho, la máquina cambió de carga), `medidas` (cada medida con sus puntos), `sondas` (cada prueba con pantalla: MP, cuadros, refrescos perdidos, mediana, percentil 99, máximo, ms de hilo principal), `dispersionBases`, `mallasEsqueleto`, `programas`.

**Qué tiene que mirar el orquestador en el Chrome del usuario** (con la pestaña a la vista, sin recargar durante 2 minutos, y con la máquina como la usa siempre):

1. `juego.html?banco=1` y, al terminar, «Copiar el JSON». Lo primero: `BANCO.errores` vacío, `programasSobrantes` en 0 en todas las variantes, `BANCO.deriva` (cuánto cambió la máquina durante la corrida) y cuántas variantes salieron «ruidosas».
2. «Baja completa»: `ms1MP`, `fijoMs`, `porMPms`, `mpModelo` y sobre todo **`mpReal`**. **Objetivo de esta vuelta: `mpReal` de 1,3 MP o más**, o, si las sondas salieron sucias por la carga, `fijoMs + 1,3 × porMPms` ≤ 11,3 ms (el 85 % de 13,34).
3. «Baja post» (la Baja de antes): su `ahorroMs` negativo dice cuánto ahorró el camino directo. Si no es claramente negativo (y no es ruidosa), el camino directo no sirvió en esa placa.
4. Las variantes con más ahorro y sin «ruidosa»: es lo próximo que hay que abaratar (luces, haces, piso…). «sin el segundo modelo» tiene que dar cerca de 0.
5. Después, una partida en `juego.html?depura=1`: `JUEGO.calidad` (qué eligió la calibración, cuántos MP, si bajó y por qué) y `JUEGO.perf.largos` (dónde cayeron los cuadros que perdieron un refresco). Y **mirar la imagen**: el camino directo tiene que verse como antes (tono, viñeta, niebla del fondo, haces).

**Cómo se probó.** Sin navegador en esta máquina. `node tools/perf_test.mjs` (58 comprobaciones): el tono en JavaScript coincide con el del sombreador, la arena se junta sin moverse, y el banco entero contra una escena simulada que se va cargando hasta 30 % y con medidas que salen el doble de caras: recupera los ahorros con la deriva, marca ruidosas, libera los programas de cada variante y termina en el tiempo. `tools/sim_test.mjs`: verde.

Actions, por software (SwiftShader; los tiempos no valen, cuentan las llamadas y que corra entero):

- «Banco y calibración», run 43249216685 sobre c05160d: **verde**. La calibración corre de punta a punta sin errores de WebGL; el banco, con `?mp=0.06,0.18&n=4&vueltas=2` (lo pone `tools/banco.mjs` con dibujo por software), mide las 4 calidades y las 17 variantes en dos vueltas, sin errores, con `programasSobrantes` en 0 en todas. Quedan 28 programas internos de three más que al empezar (pasada de sombra de las otras calidades y de las variantes de luces).
- «Pruebas del juego»: verde desde 8d8bd91 (la primera corrida, sobre 8c0fa1c, cayó por el `#include` de los haces a mitad de línea).
- Llamadas de dibujo de un cuadro de «Baja completa» en el banco: **182** (antes 243). Sin sombras, 136: la pasada de sombra pasó de 96 a 46 llamadas (pesista, copias de la barra y 13 piezas de tarima y alfombra). Sin barra, 110: la barra se lleva unas 60 llamadas en la pasada principal (cada disco es cuerpo, cubo y dos caras; el eje, nueve tramos). Sin arena, 96. Triángulos: 178 mil (antes 188 mil).
- Corridas que fallaron en el camino, por si vuelve a pasar algo parecido: 43241143449 (`#include` a mitad de línea: los haces no compilaban), 43243020395 y 43244595018 (programas destruidos a mano que three seguía usando: 0x502; programas de más que no se soltaban).

**Lo que no está medido o no cumple:**

- **Fluidez en la Mac del usuario: sin medir.** No se sabe si «Baja» directa entra en 11,3 ms a 1,3 MP. Lo dice el banco del punto anterior.
- **El aspecto del camino directo no se miró en ninguna placa.** Las capturas de Actions son por software y con `?dibujo=0` no dibujan el 3D.
- **El MSAA del lienzo** cuesta en placas que no son por mosaicos (Intel, NVIDIA de escritorio) y no se puede apagar sin recrear el contexto. En «Media» y «Alta» (post) no agrega nada visible y se paga igual.
- **Luces y materiales del piso** siguen iguales: seis focos, una direccional y la de sala en cada material iluminado. Esperan al banco.
- **La barra son unas 60 llamadas de dibujo** en la pasada principal (cada disco: cuerpo con dos grupos de material, y dos caras). Juntar por material todo lo de cada lado (manga, discos y traba se mueven juntos) las bajaría a unas 16; no se hizo: hay que rehacerlo en cada cambio de carga y no se pudo mirar.
- **«Programas» no vuelve exactamente al valor del principio**: los de los materiales de la escena sí, pero quedan los internos de la pasada de sombra de three (unos 28 por software). No se usan.
- **El primerísimo plano de la cara** en el panel del llamado propio (`escena.primerPlano('cara')` en `main.js`) no se tocó: no es de esta parte.

### Fluidez, cuarta vuelta: control de la máquina, gobernador que sube y escena barata por píxel (12-nov, rama `fluidez2`)

**Punto de partida: la segunda corrida del banco en la Mac del usuario** (M1 Pro, 75,08 Hz, 13,32 ms, ventana 1745 × 845, densidad 1,1, 1,78 MP; iCloud Drive subiendo 1,3 GB durante la corrida):

- «Baja completa» a 1 MP: mediana 10,6 ms, mínimo 6,2 ms (antes 14,5): el camino directo sirvió. Fijo 5,95 ms, 4,3 ms por MP.
- El costo de la misma escena se duplicó durante la corrida (12,6 → 25,2 ms a 1 MP).
- La búsqueda con pantalla, hecha al final, perdió medio cuadro (26,7 ms) casi igual a 1,7, 1,0, 0,6 y 0,37 MP con 1 ms de hilo principal; recién a 0,22 MP dio 13,9. No escala con la resolución: no es costo por píxel del juego.
- Ahorros a 1 MP: sin arena 38 % (casi todo por píxel), sin haces 25 % (3,55 ms/MP), sin pesista 20 %, solo clave y sala 18 %, barra 13 %, piso difuso 12 %, contraluces 12 % (estable), sombras 11 %; público, bruma, normales de detalle y pelo cerca de 0. Malla completa del pesista: 12 % más cara. Anisotropía 1: 7 % **más** cara (raro, ver abajo).

**1. Banco v3** (`web/js/game/banco.js`, `tools/banco.mjs`; `BANCO.version` 3, límite 125 s):

- **Control de la máquina**: el mismo lienzo, a la resolución de la pantalla, con cuadros de verdad y sin dibujar nada (solo se limpia), 40 cuadros. Si pierde dos refrescos o más, la máquina o el compositor no dan. Va en `BANCO.tandas[i].controlAntes` y `controlDespues`.
- **Tandas con la pantalla al principio, en el medio y al final** (antes era una sola búsqueda, al final): control, búsqueda de «Baja completa» (hasta 4 sondas, empezando por lo que sostuvo la tanda anterior) y control otra vez. La del medio va entre dos vueltas de variantes. En la fila de «Baja completa», `mpReal` y `mpFalla` son la mediana de las tres; cada una está en `BANCO.tandas`.
- **Arriba de la tabla, en lenguaje llano** (`BANCO.resultado`): «Calidad que elegiría el juego en esta máquina: Baja a X MP, con Z % de margen (un cuadro de A ms en 13,32)», con la misma `decidirCalidad` de la calibración sobre las rectas medidas (mediana de las vueltas, y otra vez con la medida más limpia). Debajo, lo que sostuvo cada tanda con la pantalla. Si algún control perdió refrescos, primero, en rojo: «Esta máquina pierde cuadros aun sin dibujar nada: cerrá otras apps…».
- **Variantes**: nuevas `antes` (la Baja de antes de esta vuelta: piso con luces, haces y contraluces como luces), `antesPiso`, `antesHaces`, `antesBordes` (cada parte por separado; su «ahorro» negativo es lo que ahorra esa parte) y `anisoIgual` (control de `aniso`). Ya no corren por defecto las que dieron cerca de cero o eran comprobación (`sombra1024`, `publico`, `velos`, `segundo`, `detalle`, `pelo`): `?variantes=todas` las agrega. `contraluces` y `luces` apagan también el término de borde del material. `piso` ahora es «lo que queda de la arena con luces, con material difuso».
- **Fotos**: `juego.html?banco=1&fotos=1` y `node tools/banco.mjs --fotos=dir`: Baja como era antes de esta vuelta, como es ahora y ahora con los haces de antes, con seis cámaras del juego (`3/4`, `lado`, `rev`, `baja`, `jib` y el primer plano `arriba`), el mismo cuadro del arranque con 140 kg. El flujo «Banco y calibración» las sube en `banco-out` (`banco/fotos/*.png`).

**2. Gobernador que no baja por carga ajena y vuelve a subir** (`Gobernador` en `perf.js`; en `main.js` solo `subir()` y la línea que aplica el pedido):

- Baja como antes (dos ventanas malas de cuatro, o una que pierde la quinta parte). Si después de bajar se pierde más de dos tercios de lo de antes, baja otro escalón hasta que la racha sume tres (`ESCALAR`, 39 % menos de píxeles); si con eso tampoco cambia, **los píxeles no eran el problema**: pide deshacer la racha entera y no baja más (`ajena`) hasta que pasen 60 s o haya 3 s limpios seguidos. (Revisión: con un solo escalón, un costo propio que necesitaba dos escalones y perdía poco se tomaba por carga ajena para siempre: bajaba y deshacía cada 65 s sin arreglar nada. Lo reprodujo `perf_test` y ahora lo cubre.)
- Una subida pendiente (esperando que termine un intento) se cancela si mientras tanto se pierden refrescos. Al terminar la calibración el gobernador vuelve al nivel 0 (`calibrado()`): lo que haya hecho en el menú no cuenta.
- **Sube** de a un escalón después de 5 s sin perder un solo refresco (hilo principal bajo el 80 %) mientras esté por debajo de lo que dejó la calibración, y después de 20 s por encima (hasta la resolución de la pantalla). **(Corregido después de la revisión: ya no sube por encima de la calibración; ver «Revisión independiente» más abajo.)** Primero vuelven las sombras si se habían apagado. Si una subida pierde refrescos en los 15 s siguientes, se deshace y la espera se duplica (hasta 120 s).
- Igual que antes: nada cambia con un intento en curso ni en la repetición, y nada se recompila. `JUEGO.calidad.gobernador` dice el nivel (escalones debajo de la calibración), si sospecha carga ajena, las esperas y los últimos cambios con su motivo; cada subida queda en `JUEGO.calidad.cambios` con `sube: true` y `motivo`.
- `perf_test` lo prueba en partidas simuladas: carga ajena de 40 s que pierde lo mismo a cualquier resolución (baja una racha de tres escalones como mucho, la deshace entera y termina en la resolución de la calibración o más), costo propio de dos y tres escalones que pierde poco (llega abajo y no lo toma por carga ajena), subida pendiente cancelada, costo propio (baja hasta donde entra y las subidas que no aguantan se espacian 5, 10, 20, 40 s), y una escena que se alivia a los 30 s (vuelve a subir hasta la calibración).

**3. Escena barata por píxel en Baja y Móvil** (`Q.barato` en `PRESET`, `Escena.setBarato()` en `stage.js`; el visor no cambia: `arena.js` solo expone `tarima` y `escenario`):

- **Piso con la luz horneada**: al construir la escena, la tarima (1024 × 1024) y la alfombra del escenario (512 × 433) se dibujan solas desde arriba, con una cámara ortográfica que cubre su cara de arriba, a un destino lineal de media precisión: el color de salida del material físico con las ocho luces y el entorno, sin tono, sin niebla y sin sombras. En el juego esas caras usan un `MeshBasicMaterial` con esa textura (sin ninguna luz). La sombra del pesista y la barra va en una lámina `ShadowMaterial` apenas arriba de la tarima; su opacidad sale de hornear el centro con y sin la clave y pasarlo por el tono, con un mínimo de 0,1. En Actions la cuenta dio 0,019 (la clave cambia poco el color de pantalla de una tarima tan iluminada, por la compresión del AgX), menos de lo que se ve en la foto de antes; quedó el mínimo, 0,1, y recortadas lado a lado (cenital y 3/4) la sombra de antes y la de ahora se ven igual. Pendiente: medirla contra una foto sin pesista en vez de a ojo. Lo que cambia: el brillo especular que depende de la vista (la alfombra de rugosidad 0,93 tenía un reflejo de color hacia el fondo en las cámaras rasantes) y el relieve fino de la alfombra. Si la placa no puede dibujar en media precisión queda el piso de siempre.
- **Sin haces**: en el camino directo el tono se aplica a cada capa que se suma, y el tono del juego deja en **negro** todo lo que vale menos de 0,0158 (tonoJS); los haces valen 0,035 a 0,05 en el foco y menos hacia abajo. En las fotos del banco en Actions (run 43264193551), la imagen con los haces de antes y sin ellos dio una diferencia media de 0,00 en las seis cámaras (como mucho 6 niveles sobre 255 en unos pocos píxeles de la cámara 3/4). O sea: desde el camino directo (tercera vuelta) los haces ya no se veían en Baja, y costaban un cuarto del cuadro en la Mac. `haces: 'cortos'` queda armado (una cara con el brillo de las dos, cortados al 56 % donde dejan de verse, en colores de pantalla con `CURVA_HAZ`, que sigue a tonoJS con error menor a 0,03) por si se los quiere volver a ver con otra curva.
- **Contraluces como término del material**: los tres contraluces salen de la escena (todos los materiales con luces dejan de evaluarlos) y en el pesista y la barra se suman con la misma cuenta de un foco de three sin sombra (posición, cono y penumbra, `RE_Direct`), encadenado al `onBeforeCompile` que ya tuvieran. En el pesista y la barra la imagen no cambia (diferencia cero en las fotos); los jueces, la magnesiera, el truss y los bordes de la tarima pierden el contraluz (más oscuros, se nota en el juez de la izquierda en la cámara lateral). (Revisión, al rebasar sobre el cambio de carga animado de `demo`: los discos de muestra que `precalentar()` compila llevan el parche antes de compilarse; three no recompila un material ya compilado si después cambia su `customProgramCacheKey`, y los discos nuevos de clases que no estaban en la carga inicial habrían salido sin contraluz.)
- Comparación en Actions (por software, run 43262317209; `banco/fotos`): diferencia media entre antes y ahora de 1 a 4 niveles sobre 255 según la cámara (3/4: 2,4; lateral: 2,7; reversa: 2,9; frontal: 1,0; cenital: 4,0; primer plano: 1,2), ahora apenas más oscuro (1 a 2 niveles de luminancia). Las capturas de la partida (`pruebas-out`, `capturas/`) se ven igual que las de la corrida 43250745124.

**4. El caso raro de la anisotropía.** No encontré un error en la variante: la textura se cambia en la placa y se restituye igual, y three no pierde la cuenta de lo que tiene enlazado. Ahora la variante restituye a mano la textura enlazada en la unidad activa y dice cuántas texturas tocó. Hay dos sospechas que el banco nuevo separa: (a) la posición: `aniso` era la última de la vuelta, justo después de `piso`, que compila y suelta materiales (ANGLE en Metal libera programas de forma diferida y eso puede caer en la medida de al lado); ahora va tercera, después de dos variantes que no compilan; (b) el mecanismo: `anisoIgual` hace exactamente lo mismo (texParameter sobre las mismas texturas) sin cambiar el valor. Si `anisoIgual` también sale más cara, el costo es del cambio de estado en ANGLE y no del filtrado; si `aniso` sale cerca de cero, era la posición; si `aniso` sigue 7 % más cara y `anisoIgual` en cero, el filtro isotrópico de verdad cuesta más en la M1 (y la anisotropía 4 queda).

**Qué tiene que mirar el orquestador en el Chrome del usuario** (pestaña a la vista, unos 2 minutos sin tocar nada, la máquina como la usa siempre, con la app de Claude abierta):

1. `juego.html?banco=1`, y al terminar «Copiar el JSON». Arriba de todo: si aparece la franja roja del control, la máquina pierde cuadros sin dibujar nada; anotar en cuál tanda (`BANCO.tandas[i].controlAntes.perdidos`). Después, la línea verde: la calidad, los MP y el margen que elegiría el juego.
2. «Baja completa»: `ms1MPmin` (la medida más limpia). **Meta de esta vuelta: 6 ms o menos a 1 MP** (antes 6,2 de mínimo y 10,6 de mediana), para que la resolución nativa (1,78 MP) entre en el 85 % de 13,3 ms con margen aun con algo de carga.
3. Variantes `antes`, `antesPiso`, `antesHaces`, `antesBordes`: su «ahorro» negativo es lo que ahorra cada parte en la M1. `aniso` y `anisoIgual` para cerrar el caso raro.
4. Las tres tandas (`BANCO.tandas`): `mpReal` de cada una y si el control perdió al lado. Si la búsqueda pierde a todas las resoluciones y el control también, es la máquina.
5. Una partida en `juego.html?depura=1`, mirando `JUEGO.calidad.gobernador` y `JUEGO.calidad.cambios`: con otra app cargando la placa tiene que bajar una racha de tres escalones como mucho (unos segundos), deshacerla («carga ajena») y volver a subir cuando la máquina se libera. **Mirar la imagen**: el piso, la sombra en la tarima y los contraluces del pesista tienen que verse como antes.

**Cómo se probó.** Sin navegador en esta máquina: `node tools/perf_test.mjs` (71 comprobaciones; gobernador en partidas simuladas, banco v3 simulado con deriva, ruido y una máquina que pierde cuadros sin dibujar: el control lo detecta y la tabla lo pone primero; la curva de los haces contra tonoJS; el cono corto) y `node tools/sim_test.mjs`: verdes. Actions, por software (los tiempos no valen; cuentan que corra entero, las llamadas y las fotos): «Banco y calibración» en verde (runs 43260047059, 43262317209 y 43264193551: 4 calidades, 16 variantes en dos vueltas, tres tandas con los controles en 0 de 40, fotos). Llamadas de dibujo de «Baja completa»: 171 (antes 182: doce haces menos y una lámina de sombra más). Programas: 101 al empezar y 134 al terminar, todos internos de la pasada de sombra de three; `programasSobrantes` en 0 en las 16 variantes. «Pruebas del juego»: la primera corrida de la rama (43260054351) cayó en `check_game` por la línea del toque tardío, que venía de la base (`demo` también estaba en rojo ahí); con `demo` mezclada, 43262310275 y 43265558237 (último commit) en verde; «Banco y calibración» sobre el último commit: 43265565087, verde.

**Lo que no está medido o no cumple:**

- **Nada de esto se midió en una placa.** La meta de 6 ms a 1 MP es para el banco del punto anterior. Por software, el costo de las variantes no dice nada.
- **Las sondas con pantalla por software no dan cuadros** (cada cuadro tarda más de un segundo): en Actions las tandas solo prueban que el código corre; el control sí (0 perdidos de 40).
- **El especular del piso** queda fijo (horneado desde arriba): con cámaras rasantes, la alfombra pierde un reflejo de color hacia el fondo. A simple vista no se nota en las cámaras del juego; en la cenital sí, apenas.
- **Los haces no se ven en Baja desde la tercera vuelta** (camino directo). En Media y Alta, con post, sí. Si se los quiere de vuelta en Baja hace falta otra curva para lo que se suma (que tenga en cuenta el fondo), y entonces vuelven a costar.
- **La opacidad de la sombra en la tarima** se calcula al cargar con una lectura de un destino de 8 × 8 en coma flotante, pero hoy manda el mínimo (0,1; ver arriba). Sin `EXT_color_buffer_float` queda 0,45 (no se probó en una placa así: ahí la sombra saldría más marcada que antes).
- ~~**El gobernador puede probar subir** por encima de la calibración~~: la revisión mostró que esas pérdidas caían dentro de los intentos; ya no sube por encima (ver «Revisión independiente»).

### Pruebas en GitHub Actions (12-nov, rama `demo`)

Ya no hay pod ni máquina con navegador para las pruebas: corren en GitHub Actions (`.github/workflows/pruebas.yml`, repo público, `ubuntu-latest`, Node 22, Chrome 156 del runner) en cada push a `demo`. Pasos: `sim_test`, `play_human`, `check_game` y `check_fluidez --tutorial`; cada uno corre aunque falle el anterior. Unos 12 minutos.

```bash
gh run list -R jvidelac1/tarima --branch demo --limit 3              # últimas corridas: estado, commit e id
gh run watch <id> -R jvidelac1/tarima --exit-status                  # esperar (en tramos de menos de 9 minutos si hay límite de tiempo)
gh run view <id> -R jvidelac1/tarima --log-failed                    # la salida del paso que falló
gh run download <id> -R jvidelac1/tarima -n pruebas-out -D out_ci    # logs/, game/*.png, fluidez/fluidez.json, capturas/*.jpg
gh workflow run pruebas.yml -R jvidelac1/tarima --ref demo           # a pedido
```

- **El runner dibuja por software (SwiftShader) y no mide fluidez.** `check_fluidez` detecta el renderizador y entra en modo lógica: juego con `?dibujo=0`, procesador sin estrangular, y los cuadros dibujados ni se exigen ni se informan. Verifica toques (enviados, recibidos, registro, motivo y acuse), consola y tutorial. La calibración y el gobernador de calidad **no se prueban ahí** (sin dibujo no actúan); `--gobernador` sale con aviso. Con placa la prueba se comporta como antes.
- **El dibujo sí se ejerce una vez por página**: `check_game` fuerza un cuadro del 3D antes de cada captura. Un sombreador que no compila o una excepción en `escena.cuadro()` sale como error de consola y pone el run en rojo. No detecta nada que dependa del tiempo entre cuadros.
- **Para mirar el juego sin navegador**: el paso «Capturas con el 3D dibujado» deja en el artefacto una captura por panel, por señal y por toque (`capturas/*.jpg`, 1920 × 930, calidad Baja). No decide el resultado: sacar la captura atrasa el toque.
- **Primera corrida** (commit c87bd02, run 43226037618): verde. `check_game` en 3 min 50 s (partida por teclado 152✓ 157✓ 160✗ a propósito, 190✓ 195✓ 198✓; por toques 6 de 6; Clásico y «lento» bien; el primer intento a velocidad real salió válido en las dos vías). `check_fluidez` en 3 min 25 s: 85 Espacio enviados y 85 recibidos, 42 aceptados y 17 descartados con motivo dentro del intento (4 espera, 4 rebote, 9 sobra), tres arranques y un dos tiempos válidos, tutorial de 13 s con un solo levantamiento.
- **Segunda corrida y corrida a pedido** (commit 79519e0, runs 43228276473 y 43228330433): verdes, con los mismos números (85 Espacio enviados y recibidos, cuatro levantamientos válidos, tutorial de 13 s). `gh workflow run pruebas.yml --ref demo` funciona aunque el flujo no esté en `main`.
- **Corrida sobre c3a9fee** (run 43237685694, 10 min 42 s): verde, los cuatro pasos y las capturas. `check_fluidez`: cuatro levantamientos propios válidos, tutorial de 13 s con el guiado válido. `play_human` y `sim_test` sin cambios de referencias.
- **(Resuelto en la tercera vuelta de fluidez: run 43249216685 en verde.)** **El flujo aparte «Banco y calibración» está en rojo** (runs 43235024461 sobre 928f42a y 43237685661 sobre c3a9fee), siempre por lo mismo: `banco: baja-segundo: error de WebGL 0x506` (`glBlitFramebuffer: Attachments are not all the same size`). Causa probable en `web/js/game/banco.js`: la variante `directo` se deshace con `escena.directo = false`, pero «Baja» ya es camino directo (`PRESET.baja.directo`), así que desde ahí la escena queda en el camino con post, sin `_modo()`, y la variante siguiente (`segundo`) es la primera que lo dibuja. Además, todas las variantes de «Baja» que vienen después (`segundo` a `aniso`) se miden en el camino equivocado, y la variante `directo` no cambia nada. Arreglo sugerido: guardar el valor anterior y restaurarlo con `escena.setDirecto(previo)`. No se tocó desde el flujo de pruebas: es código del juego.
- **Visto en las dos corridas, sin investigar:** en el paso de capturas el arranque guiado del tutorial terminó en fallo (dos luces rojas en la captura `capturas/tut_*_decision_.jpg`). Ahí la prueba deja Espacio apretado mientras saca la foto (unos 0,3 s o más) y atrasa los toques; `sim_test` da el guiado por imposible de fallar con toques de 100 ms a 3 s, así que hay un caso (tecla sostenida o pausa larga en ¡EMPUJÁ!) que no cubre.
- **Recorrido de un jugador nuevo** (`tools/check_recorrido.mjs`, desde 04c5e3a; bloquea desde la revisión independiente, ver más abajo): final exprés en Fácil con tutorial, a 1745 × 845, por teclado y con el reloj inyectado, **sin tocar entre levantamientos**. Mide en segundos del juego la espera desde el final de cada levantamiento propio hasta el próximo panel que pide algo, y en qué pantallas se va; pierde tres levantamientos a propósito (sin ¡RECIBÍ!, sin ¡EXPLOTÁ!, sin el ¡RECIBÍ! del envión) y en uno sigue machacando Espacio después del final para ver si el motivo del fallo llega a leerse. Deja unas 85 capturas en `out/recorrido/`. Primera corrida (run 43271339849): esperas de 13,0 a 15,7 s cuando el jugador se sigue a sí mismo (repetición de 6 a 10 s cada vez) y 32,9 s con un intento entero de un rival en el medio (16,8 s, no se saltea); machacando, el veredicto se saltea a los 1,2 s y el motivo («No tocaste ¡EXPLOTÁ!…») no llega a verse (aparece a 1,3 s y el tirón sin altura no tiene repetición). `check_escenas` ahora saca las capturas de la carga a mitad de la animación (antes las tres salían en el estado final).
- **Límites.** Nada de esto dice cuántos cuadros por segundo da el juego: eso se mide en la Mac del usuario. Chrome del runner sin pantalla entrega cuadros a 60 Hz, no a 75. No se prueba ningún teléfono real.

### Revisión independiente: gobernador, saltear y esperas (12-nov, rama `demo`)

Tres hallazgos graves de la verificación independiente, corregidos y medidos otra vez (sin navegador acá; las pruebas con navegador en Actions).

**1. El gobernador subía de calidad solo y metía cuadros duplicados dentro de los levantamientos** (`Gobernador` en `perf.js`, `asegurarCalidad()` en `main.js`).

- Ya **no sube por encima de lo que dejó la calibración** (nivel > 0 solamente; `SUBIR_ARRIBA_MS` no existe más). Los intervalos llegan en múltiplos del período y «no se perdió nada» no dice cuánto margen queda: en el modelo de la revisión subía a 1,18 MP (95 % del período) y probaba 1,38. El tope de `subir()` es `C.mpCal`.
- Cada subida (hacia la calibración) queda **a prueba 15 s de dibujo continuo** (`PRUEBA_MS`; antes, de reloj: un panel de más de 15 s la vencía y la pérdida se tomaba como «pierde refrescos», bajaba dos escalones y la espera no se duplicaba). Se confirma con 3 s limpios seguidos (`CONFIRMA_MS`); **la que no se confirmó se deshace antes de `correrIntento`** (queda en `JUEGO.calidad.cambios` con `pantalla: 'antes del intento'`).
- A 120 y 144 Hz (se dibuja uno de cada dos refrescos) perder uno da 1,5 períodos y se contaba la mitad de las veces: ahora `perdidosEn(ms, periodo, refresco)` cuenta en refrescos de la pantalla (gobernador y verificación de la calibración).
- `hzDe` toma el grupo de intervalos más corto que junta la cuarta parte de la muestra, no la mediana: con más de la mitad de los cuadros dobles al medir (página cargando) daba 37,5 Hz en una pantalla de 75 y el gobernador nunca veía pérdidas.
- `perf_test` (ahora corre en Actions): el modelo de la revisión (`partidaConPaneles`: placa de 4,3 + 7 ms/MP a 75 Hz, ciclos de rival 12 s, panel de 5 o 20 s, intento 8 s) da **0 refrescos perdidos en 18 015 cuadros de intentos** calibrado a 1,0 MP (antes 300, el 1,7 %, y 601, el 3,5 %, con paneles de 20 s) y nunca pasa de 1,0 MP; con la calibración pasada (1,3 MP no entran) también 0 en los intentos, con 1 o 2 subidas deshechas antes del intento. Cuadros sintéticos a 60, 75, 120 y 144 Hz: sin pérdidas no pide; perdiendo 1 de cada 10, pide y cuenta todas (antes, a 120/144, la mitad).
- **Es un modelo, no una medida en la Mac.** Lo que queda en la Mac: una calibración que se pasa todavía prueba volver a ella fuera de los intentos (en el modelo `gob_mundo` de la revisión, sin intentos, 2,6 % de cuadros perdidos con 1,3 MP que no entran, con las esperas duplicándose hasta 120 s).

**2. Machacando Espacio después de un fallo el motivo no se veía** (`saltable()`, `decision()`, `toques.rafaga()` en `input.js`).

- El veredicto propio se puede saltear recién **1 s después de que aparece** (0,4 s si no tiene línea), y solo con una **ráfaga que empezó después de que apareció** (toques a menos de 300 ms uno de otro son una ráfaga). En todas las esperas salteables, una ráfaga que venía de antes no saltea: hay que parar 300 ms o tocar de nuevo. Esos toques salen con acuse «ESPERÁ».
- El motivo del último fallo queda en el panel del llamado siguiente, en dorado: «Intento anterior: …».
- Medido en `check_recorrido` (run 43276056293, arranque 3 sin ¡EXPLOTÁ!, un toque cada 120 ms): el veredicto con el motivo aparece a 1,32 s y queda **1,68 s** a la vista mientras se machaca, y sigue después (antes se salteaba a 1,2 s sin verse).

**3. Esperas largas entre levantamientos propios** (`decision()`, `repeticion()`, `llamadoRival()`, `carga()`, `correrIntento()` para rivales).

- **Repetición solo en los fallos con explosión**, de 0,3 s antes de la explosión a 0,45 s después de la recepción, en cámara lenta de hasta 3 veces y **2,3 s como mucho**; la caída ya se vio en vivo. Si hay repetición, el veredicto dura tVer + 1,6 s (la línea sigue en la repetición: unos 4 s a la vista en total); si no, tVer + 4,2 s. El válido no tiene repetición ni espera a que la barra termine de rebotar: luces, ovación, giro de cámara (unos 3 s) y sigue.
- Los cambios de kilos de los rivales salen en el recuadro durante el veredicto, sin espera aparte (antes 1,1 s cada uno).
- Cambio de carga: discos que salen en 0,2 s y entran en 0,25 s, 0,35 s de cola (de 2,8 a unos 2 s).
- **Intento entero de un rival** (decisivos en exprés, todos en completa): arranca 1,2 s antes de que agarre la barra para tirar, la pelea, la barra en los hombros y la espera de la chicharra van 2,5 veces más rápido, y **Espacio lo lleva al final** (una ráfaga nueva, pasados 400 ms). El de la revisión pasó de 16,8 s a 7,5 s.
- `check_recorrido` ahora **decide y bloquea** en Actions: espera sin tocar, cuando entre un levantamiento propio y el próximo panel no hay nada de los rivales, menor a 6 s; machacando, el motivo a la vista al menos 1 s. `check_game`: un dos tiempos sin ¡RECIBÍ! a propósito (tiene que tener repetición) y ningún válido con repetición.

**Medido** (Actions, por software, reloj del juego inyectado; no dice nada de cuadros por segundo):

Run 43278229297 sobre fea8488 (último commit de código), «Pruebas del juego» en verde, con `check_recorrido` bloqueando:

| Después de | Antes (run 43271339849) | Ahora | Meta |
|---|---|---|---|
| Arranque 1 válido, se sigue a sí mismo | 13,5 s (decisión 3,0 + repetición 7,8 + carga 2,8) | **5,0 s** (decisión 3,0 + carga 2,0) | < 6 s, cumple |
| Arranque 2 fallado (sin ¡RECIBÍ!) | 15,7 s (decisión 5,5 + repetición 10,2) | **5,5 s** (decisión 2,9 + repetición 2,6) | < 6 s, cumple |
| Dos tiempos 2 fallado | 13,0 s | **5,5 s** (decisión 2,9 + repetición 2,6) | < 6 s, cumple |
| Tutorial | 3,0 s | 3,0 s | < 6 s, cumple |
| Dos tiempos 1 válido, con un rival «Para el oro» en el medio | 32,9 s (intento del rival 16,8) | **17,1 s** (decisión 3,0 + resumen 2,6 + intento del rival 7,5 + su decisión 3,1 + carga 0,9), salteable | sin meta |
| Arranque 3 fallado, con seis intentos de rivales resumidos en el medio | (21 s) | 21,1 s (decisión 5,5 + resúmenes 15,6) | sin meta |
| Machacando después del fallo: motivo a la vista | no se vio | **1,68 s** mientras se machaca, y sigue | ≥ 1 s, cumple |

`check_game`: con teclado 152✓ 157✓ 160✗sin_altura 190✓ 195✓ 198✗fondo, repetición solo en el fallo con explosión; con el dedo, seis válidos y ninguna repetición. `sim_test`, `play_human` (criterio cumplido, sin cambios de referencias: no se tocaron reglas), `perf_test` (93 comprobaciones), `caida_test`, `check_escenas` y `check_fluidez`: verdes.

**Lo que no está hecho o no se midió:**

- La repetición «a pedido» de un válido (con una tecla) no está: el válido no tiene repetición.
- El cambio de carga no se superpone con el resumen de un rival (siguen en serie: resumen 2,6 s y carga unos 2 s).
- Con un rival decisivo en el medio la espera sigue siendo larga sin tocar (resumen + intento del rival + su veredicto + carga); ahora se saltea con Espacio.
- Nada de esto se midió en la Mac del usuario ni con una placa: las pruebas con navegador son por software.

### En qué se aparta de docs/JUEGO.md

- **`web/js/stage.js` no se extrajo de `main.js`.** El juego arma su escenario en `web/js/game/stage.js` con los mismos módulos; el visor queda intacto. Motivo: sin GPU no se puede verificar un refactor del visor. Tampoco se tocaron `timeline.js`, `barbell.js` ni `hud.js` (la secuencia, la aceleración desde la posición dibujada y la gráfica del juego viven en `game/`).
- **Registro de partida**: cada llamado de una persona lleva además `conf` (ms del Confirmar), porque de ahí sale cuándo empieza la tensión. `int` viaja siempre en 0.
- **El temblor de la cargada se arrastra al envión.** Sin eso, machacar la subida de la cargada no costaba nada y daba 96 % de válidos al 100 %.
- **Balance retocado con el informe** (las metas mandan): se quitó la rebaja de 0,08 de exigencia del arranque; cada cm de altura perdida suma 0,03 de exigencia (era 0,06) con tope 0,25 (era 0,40); la recepción a destiempo suma hasta 0,15 (era 0,25); el envión es 10 % más angosto (era 20 %). Los valores están en `rules.js`.
- **«Fuera de la franja» para el Resto** cuenta la aguja por debajo, o por encima solo si hubo un toque reciente: si no, un intento liviano que sale solo pagaba pelea.
- **La pelea tiene un máximo de 12 s** (después se pierde): garantiza que todo intento termina.
- **Nivel Amistoso**: además de errores de 55 ms, los rivales abren y declaran 3,5 % más abajo. Con las aperturas normales quedaban sin marca en más de la mitad de las finales.
- **Los rivales no usan el squat**: con el balance de hoy no tiene premio (ver abajo).
- **Cambios de kilos del jugador**: confirmar el panel con otro peso cuenta como cambio. No hay botón aparte para cambiar sin confirmar.
- **Interrupciones** (pestaña oculta, toque cancelado): los contactos se levantan y nada más. No está la política de repetir el intento. La pausa (Esc o el botón «II») existe solo fuera del intento propio.
- **Calentamiento**: en Fácil, el tutorial guiado (sin reloj; reemplaza al metrónomo, con corrección de atraso de 0 ms en teclado y 40 ms en táctil). En Clásico, metrónomo y tres prácticas (dos livianas y una pesada con exigencia de 98 %); la práctica pesada no fuerza la traba de codos y las prácticas llevan un reloj de 25 s para que nadie quede trabado.
- **Envión que viene elegido**: en Fácil, la tijera para los tres (con el squat de Ventura el bot flojo baja de 74 % a 62 %); en Clásico, el primero de la ficha.
- **Sin retratos en el podio**: el podio 2D usa bandera y nombre para los tres. El llamado ya no usa el primer plano de cara (desde el 12-nov, plano americano para los tres).
- **Cambio de carga**: desde el 12-nov, primer plano de la manga con los discos deslizándose y la tarima vacía; sin ayudantes (etapa de arte).
- **Tope de 30 cuadros fuera del intento propio e imagen congelada detrás de los paneles**: hechos. El escalón «móvil» existe (`game/perf.js`) y es el que se elige con puntero táctil; **sin medir**.
- El tablero 3D de la arena sigue diciendo «TARIMA OPEN» (sale de `config.js`, que no se toca); la gráfica del juego dice «Mundial Tarima 2026».

### Informe de balance (11-nov, 200 intentos por casilla; `node tools/balance.mjs --rivales`)

Porcentaje de válidos · meta. Jugadores simulados con error típico de 25, 40 y 60 ms.

| Intensidad | Arranque: experto / hábil / casual | Dos tiempos con tijera | Dos tiempos con squat |
|---|---|---|---|
| 90 % | 100·99 / 99·97 / 72·85 | 100·99 / 99·97 / 75·85 | 100·99 / 94·97 / 44·85 |
| 95 % | 100·97 / 91·90 / 45·60 | 100·97 / 91·90 / 45·60 | 100·97 / 76·90 / 16·60 |
| 100 % | 97·85 / 59·60 / 15·25 | 99·85 / 63·60 / 16·25 | 92·85 / 24·60 / 2·25 |
| 103 % | 63·50 / 11·30 / 3·5 | 69·50 / 14·30 / 1·5 | 22·50 / 2·30 / 0·5 |
| 106 % | 0·10 / 0·3 / 0·1 | 0·10 / 0·3 / 0·1 | 0·10 / 0·3 / 0·1 |

- Machacador (7 toques por segundo): 0 a 3 % hasta el 100 % y 10 a 13 % al 103 % (meta: menos de 30 %). Metrónomo con el mejor ritmo fijo: 35 % de promedio (meta: menos de 50 %).
- Rivales, 200 finales por nivel: Amistoso 56 % de válidos y 14 % sin marca; Normal 76 % (meta 55 a 70 %) y 3 % sin marca; Difícil 97 %. Los totales varían más de 20 kg entre finales.
- **Lo que no cumple**: el casual queda 10 a 15 puntos debajo de la meta al 90 y 95 %; el 106 % es imposible para todos; **el squat es peor que la tijera a toda intensidad** (su premio de 6 cm de altura nunca es el factor limitante); los rivales fallan menos que la meta en Normal y casi nunca en Difícil; Ventura manejado por el juego saca 2 a 5 kg menos de total que los otros dos; el Resto termina cerca de 40 en Normal, más bajo de lo que sugiere JUEGO.md.
- El jugador «casual» del informe pelea con un control tosco (error de 0,09 de esfuerzo): una persona real puede pelear mejor o peor. Estos números ordenan el ajuste; no reemplazan jugarlo.

### Pendientes del juego

- **Correr `juego.html?banco=1` en la Mac del usuario** (el banco nuevo de la tercera vuelta, que aguanta la máquina cargada) y, con la tabla, decidir qué se abarata de la escena (luces secundarias, haces, materiales del piso): es lo que falta para que «Baja» llegue a la resolución de la pantalla a 75 Hz. Qué mirar: «Fluidez, tercera vuelta». Después, jugar una partida y mirar `JUEGO.calidad` (qué eligió la calibración y si bajó) y `JUEGO.perf.largos` (dónde cayeron los cuadros largos). Después, un teléfono real (`JUEGO.perf.resumen()` da mínimo y mediana de cuadros por tramo).
- Decidir si hace falta un selector de gráficos en pantalla (hoy `?q=media`) y si el gobernador tiene que poder volver a subir (hoy solo baja; la calibración sí puede elegir una calidad más alta al cargar).
- Rehacer `tools/primera.mjs` sobre el tutorial nuevo, o borrarlo y dejar `check_fluidez --capturas`.
- Pruebas en Actions: `workflow_dispatch` y el flujo viven solo en `demo`; al fusionar a `main` revisar el filtro de ramas. Falta una prueba del gobernador que corra sin placa (hoy `--gobernador` necesita dibujar de verdad).
- Jugabilidad de Fácil (entrada tolerante, 12-nov): que el usuario lo juegue y mirar si la cuenta 3-2-1 y la franja se leen; medir la final contra rivales con las reglas nuevas; decidir si entre el 92 y el 95 % el machacador tiene que levantar menos (`FACIL.abreMs` más grande lo baja, a costa de más TEMPRANO en aperturas).
- Segunda vuelta de balance de Clásico: squat, 106 %, casual al 90 y 95 %, Ventura rival y gasto de Resto.
- Extraer `stage.js` del visor y verificarlo con GPU; política de interrupciones; simular el resto de la final cuando el jugador queda sin marca.
- Códigos de país: ARX y NVK siguen en la gráfica y en las mallas hasta la etapa 3; Pelagia usa PEL. Búsqueda uno por uno antes de publicar (JUEGO.md, sección 6.1).
- Marangi es el modelo de Brenner con la tela de color plano (dorado `#b8900f`; antes `#7a1626`, que con el rojo de Ventura parecía el mismo equipo). **No se revisó en captura si el relieve de «BRENNER» se lee**: mirarlo con GPU; si se lee, limitarlo a planos laterales. Lo mismo vale para el pesista del jugador cuando elige Largo o Potente.
- **Identidad del jugador** (verificación independiente del 12-nov: «controlo a otro pesista»). El pesista del jugador ya no lleva la malla, el nombre en la espalda, la bandera ni el país del modelo que eligió: malla lisa turquesa (`JUGADOR` en `roster.js`, `escena.yo` en `stage.js`), bandera propia en el zócalo, la tabla y el podio, sin código de país, y su color en el marcador. Los rivales no usan el turquesa (Brenner pasó a violeta en la interfaz). Prueba: `sim_test` 11 (colores, tabla). En captura con GPU falta mirar que la malla lisa se lea como tela y no como plástico.
- Etapa 4: fallos y bajadas tienen desde el 12-nov una aproximación en el visor (barra que cae, pesista que vuelve a `Parado`; ver «Emoción»). Siguen faltando las reacciones del pesista (festejo, lamento) y los ayudantes, que necesitan animaciones y modelo nuevos. Mirar en la Mac si la mezcla lineal hacia `Parado` se ve bien.

## Publicación del MVP: Pages, Worker y métricas (12-nov, rama `mvp`)

**No se publicó nada todavía.** Todo está listo y validado sin tocar la cuenta; la publicación la corre el orquestador con el OK del dueño: `tools/desplegar.sh --seco` y después `tools/desplegar.sh`. El detalle está en `worker/README.md`, «Publicar».

- **Cómo queda.** Cloudflare Pages, proyecto «tarimagame» (https://tarimagame.pages.dev), sirve `web/`. Las Functions de `functions/` pasan `/api/*`, `/qx/*`, `/baja` y `/confirmar` al Worker «tarima» por una service binding (`TARIMA`, en `wrangler.jsonc` de la raíz, con `pages_build_output_dir: ./web`), y `/` muestra `juego.html` (Pages redirige `/juego.html` a `/juego`). El Worker no tiene dirección pública (`workers_dev` y `preview_urls` en false, sin rutas) y usa la D1 «tarima» (`9e2c28f3-…`).
- **Orden del script.** Comprobaciones y pruebas, Worker `--dry-run`, build de las Functions, después (con la cuenta) migraciones de D1, `wrangler deploy`, secretos con `openssl rand` solo si faltan (los cuatro `SECRETO_*` y `EXPORTAR_CLAVE`, con copia en `~/tarima-datos/exportar.clave`), `POSTHOG_KEY` desde `~/tarima-datos/posthog.json`, rama de producción de Pages por la API y `wrangler pages deploy web`. Ningún secreto se imprime.
- **Probado.** `cd worker && npm test` 39 bien; `node tools/worker_test.mjs` 127 bien; `node tools/servidor_test.mjs` 105 bien (cliente, métricas y Functions, sin red); `tools/desplegar.sh --seco` bien. Con `wrangler dev` y `wrangler pages dev` en la máquina, por curl: la binding conecta, `/` da el juego, `/api/estado` responde con la cookie `tdv` y el país, la tercera `/api/partida` da muro. En GitHub Actions, el flujo «Servidor y publicación» (`.github/workflows/servidor.yml`) corre todo eso más `tools/check_analitica.mjs` en Chrome.
- **Sin verificar hasta publicar:** que `CF-Connecting-IP` y el país lleguen bien en producción (por las dudas la Function los copia en `x-tarima-ip` y `x-tarima-pais`), la rama de producción del proyecto de Pages (el script la lee de la API; si no puede, usa `main` y avisa), y que los eventos lleguen al proyecto 606461 por `/qx`.
- **Cliente del servidor** (`web/js/game/servidor.js`). Estado con 4 s de espera y copia local; pase con 2 reintentos en 3 s; «sin servidor» una final por carga solo si el navegador no tenía dispositivo al cargar (endurecimiento 1 de `docs/MVP.md` 7), y nunca por un 429 o un 503 a quien ya jugó; la final se reanuda una vez con el pase de `sessionStorage`, y solo si ninguna otra pestaña la está jugando (marca compartida `tarima.pase_vivo` en `localStorage` con latido y `pagehide`: «Duplicar pestaña» ya no da finales); lista, encuesta y baja. En `localhost` con el servidor de Python juega sin límite, y `?muro=firme` simula el Worker (2 finales, muro, encuesta, anotarse).
- **Métricas** (`web/js/game/analitica.js`). posthog-js 1.441.2 vendorizado en `web/vendor/posthog/` (se descarga solo si hay clave), `persistence: 'memory'`, `person_profiles: 'identified_only'`, sin autocaptura, encuestas automáticas ni scripts de PostHog; grabación de sesión solo en las cargas sorteadas (ver «Grabación de sesión»); banderas del Worker como bootstrap y `$feature/…`; cola de eventos antes de iniciar; nombre, correo e IP nunca salen. posthog-js descarta los eventos de navegadores sin pantalla («HeadlessChrome»): por eso `check_analitica` usa el agente de un Chrome común.
- **Decisiones del dueño aplicadas en el servidor.** Sin borrado de altas por no confirmar mientras no haya correos (columna `confirmar_mandado_en`, migración 0002); sin la frase de «nunca pagar» en páginas y correos; español neutro con «correo» y «enlace»; lista para mayores de 16; consentimiento `2026-11-b`. La baja desde la privacidad borra al momento si la pide el mismo dispositivo que anotó ese correo; si no, hay que hacerlo desde ese dispositivo o escribir al contacto.
- **Pendiente del dueño.** Contacto, responsable y país en `web/privacidad.html` (buscar `data-completar`; hoy se ven marcadores amarillos); en PostHog, «Discard client IP data», el DPA y las cuatro banderas (la encuesta de tipo API ya no hace falta: desde el 13-nov las respuestas llegan como el evento `encuesta_respuesta`); dominio y correos cuando los haya.
- **Integración:** hecha (ver «Integración del MVP y pedidos del dueño», abajo).

### Textos, idiomas y jugador nuevo (12-nov, rama `mvp`)

- **Dónde viven.** `web/js/game/i18n/es.js` (español neutro, tuteo) y `en.js`, con las mismas claves; `t(clave, datos)` en `i18n/t.js`. `{A}`, `{T}` y `{t}` cambian solas con o sin teclado («Pulsa ESPACIO» / «Toca la pantalla»). El idioma sale de `?lang=`, después de `tarima.idioma` (lo elegido a mano) y por último del navegador; el selector ES · EN está en la bienvenida y en la pausa y cambia sin recargar. Las tablas de `docs/MVP.md` 4.5 siguen en voseo: manda `es.js`. La señal (`controles.js`), `explicar()` y `pasos()` (`ui/mensajes.js`, con plantillas enteras por idioma), la tabla, las ayudas, el roster y las causas de los rivales pasan por ahí; `CAUSAS` de `rules.js` queda para registros. En Un toque los fallos dicen «un poco / bastante / muy tarde», sin ms.
- **Recorrido.** Bienvenida (nombre opcional con foco en la computadora, «Hola de nuevo» con «No soy yo», Compacto · Largo · Potente, «Jugar» con `data-completa`, una sola fila al pie con la práctica, «Opciones» plegado, «Cómo se juega» y «Privacidad») → tarjeta del arranque (solo la primera vez) → práctica guiada → `ganchos.pedirPase` → «Cómo se gana» (tres líneas solo en la primera final, y los rivales) → «Empezar con N kg» → final → podio (2,5 s solo el resultado, después «Jugar otra vez», «Cambiar de pesista», «Compartir resultado»). El nombre va en el zócalo, el tablero 3D, la tabla, los títulos de llamado y el podio, siempre escapado. Primer NO VALE, primera llamada («la barra nunca baja») y primer dos tiempos se explican una vez (`tarima.visto.*`). Glosario de siete palabras en «Cómo se juega» (H, o «?» junto a la pausa). En Actions, de «Jugar» a la presentación: 11 a 12 s; al primer intento de la final, 23 s.
- **Ganchos para integrar** (`web/js/game/ganchos.js`, sin tocar `main.js`): `ev(nombre, props)` recibe todos los eventos de 6.3 que dispara el juego (juego_abierto, carga_lista, idioma_cambiado, nombre_puesto, pesista_elegido, opciones_abiertas, tutorial_*, partida_pedida, final_inicio, intento_propio, final_fin, compartir, privacidad_abierta, error_juego); `estado()` y `quedan()` para la bienvenida y el botón del podio; `pedirPase(info)` antes de cada final (si devuelve `{estado:'muro'}`, main.js llama a `muro()`); `muro(info)` resuelve true si puede jugar otra; `podio(info)` a los 2,5 s, con `info.lugar` para la invitación y 'muro' para el podio 2. Si `ganchos.ev` deja de ser el de fábrica, el registro de `window.JUEGO.eventos` lo lleva la analítica (no se duplica).
- **Pruebas.** `sim_test` sección 9 (claves iguales, sin voseo ni jerga, nada sin resolver, `explicar()` de 20 a 130 caracteres en los dos idiomas); `check_game` con `?lang=es` y comparación contra `es.js`, más la corrida «idioma»; `check_recorrido --lang=en` deja capturas en `out/recorrido_en`.
- **Pendiente.** «HALTEROFILIA» y «TARIMA OPEN» de los carteles 3D (`config.js`, compartido con el visor) no se traducen; el año ya no sale. La frase «Nunca vas a pagar» no está en el juego.

### Integración del MVP y pedidos del dueño (12-nov, noche, rama `mvp`)

**Flujo conectado** (`web/js/game/conexion.js`, que reemplaza los ganchos de fábrica de `ganchos.js`; `main.js` no sabe qué hay detrás):
- **P0.** Al cargar, `servidor.estado()` (4 s como mucho; si no, la copia local) en paralelo con los datos, y `analitica.iniciar()`. Si el servidor dice que no puede jugar y ya jugó desde este dispositivo, la primera pantalla es el muro (`juego_abierto` con `pantalla_inicial=muro`); si nunca jugó (red compartida que gastó su tope), primero la bienvenida y la práctica.
- **P4.** Antes de cada final, `servidor.pedirPase()`. `muro` → muro; `sin_servidor` → se juega (una vez por carga, solo con historia limpia); `error` → panel «No pudimos conectar» con «Probar de nuevo» y «Volver al inicio» (no se regala ninguna final). Una final cortada por una recarga se reanuda una vez con el pase de la pestaña.
- **P8.** Podio 1: invitación suave a la lista (bandera `invitacion-podio1`), cerrable, y «Jugar otra vez · te queda 1 final gratis». Podio de la última final gratis: a los 2,5 s sube el muro.
- **P9 a P11.** Muro con el correo (casilla de aviso obligatoria, novedades opcional, línea legal con «16+» y enlace a privacidad con `?lang=`) y, si el servidor lo ofrece, la encuesta (4 preguntas de toque y una abierta, +2 finales una vez). Gastadas esas dos, el muro vuelve solo con el correo. Anotado: «¡Adentro, {nombre}!» y juego libre; si todavía no la contestó, la encuesta sin premio. Nada dice «Revisa tu correo» mientras no haya envío.
- **Métricas.** Todos los eventos de `docs/MVP.md` 6.3 pasan por `analitica.ev` (y quedan una sola vez en `window.JUEGO.eventos`; `ganchos.registra`). `intento_propio` suma `toques`, `aceptados`, `descartados`, `desc_<motivo>`, `guardados` y `tactil`. Ninguno lleva nombre ni correo (lo verifica `check_muro`). No hace falta aviso de cookies: PostHog va en memoria y lo guardado es funcional.
- **Compartir** el resultado como texto (✅/❌ por intento, sin nombre), con `navigator.share` en el teléfono y el portapapeles en la computadora.

**Probar sin cuenta de Cloudflare.** `node tools/servidor_local.mjs` sirve `web/` como Pages y pasa `/api/*`, `/qx/*`, `/baja` y `/confirmar` por `functions/_reenviar.js` al Worker de verdad, en Node, sobre una D1 falsa (`node:sqlite`, Node 22.13 o más; en memoria o `--db=archivo`), con DNS falso y sin PostHog. Con `--red` se abre desde un teléfono en la misma red. Los servidores estáticos de las demás pruebas contestan `/api` con «juego sin límite» (`tools/sin_api.mjs`) para no ensuciar la consola.

**Pedidos del dueño de las 16:30 y de la prueba en su iPhone:**
1. **Idioma.** ~~Español si el español aparece en cualquier lugar de `navigator.languages`~~ Desde el 13-nov, inglés por defecto (ver «Correo obligatorio…» más abajo). El selector ES · EN está en todos los paneles (bienvenida, tarjeta, cómo se gana, primer peso, llamado, intervalo, podio, muro, encuesta, anotado, error de conexión) y en la pausa y la ayuda; se recuerda y repinta al instante.
2. **Kilos.** −5 −1 [kg] +1 +5 en el primer peso y en el llamado, sin salirse del rango (un +5 que se pasaría queda deshabilitado en el borde); con teclado ←/→ de a 1 y ↑/↓ o Mayúscula de a 5; botones de 52 a 58 px con el dedo.
3. **Competencia.** Cada intento de un rival se ve entero (antes, en la final rápida, era un panel de resumen), con su veredicto y una repetición corta cuando falla o pasa adelante («{rival} pasa adelante»). Todo se saltea con un toque o Espacio. Marcador fijo arriba a la izquierda, con un solo mensaje coherente (`ui/marcador.js`, probado en `sim_test` 11): «Vas ganando · 3 kg de ventaja» (la ventaja solo contra quien ya tiene marca; si nadie más levantó, «Vas ganando» a secas), «Va ganando X · Para pasarlo: N kg» o «Empatados». Si vas primero y el rival en la tarima te pasa con lo que pidió: «Si Brenner levanta 161 kg, te pasa» (en el turno del rival el marcador baja debajo del cartel «Turno de…»), y entonces la etiqueta «Para pasar al frente» de ese intento no sale suelta (antes salía arriba de «Vas ganando · 159 kg de ventaja», contra un rival que todavía no había levantado).
4. **«¿Puedo controlar otro pesista?»** No: el jugador solo controla al suyo. **La causa de la confusión:** en la final completa y en los intentos decisivos el rival se mostraba entero con las ayudas de Clásico (anillo, línea y palabra) dibujadas sobre su barra, y el botón táctil seguía a la vista diciendo «Toca»: parecía una señal para tocar sobre el rival. Ahora las ayudas son solo del intento propio, y en el turno del rival hay un cartel con su bandera y su nombre («Turno de Teo Marangi (rival) · mira o toca para saltar») y no hay señal, botón ni acuse (`html.turno-rival`).
5. **Entrada.** Lo que se perdía: un toque de ¡TIRA! que llegaba con PREPÁRATE todavía en pantalla se descartaba («ESPERA») y el pesista no levantaba. Ahora queda guardado 1,5 s y levanta apenas aparece ¡TIRA! (`guardado`). Un panel sin botones («Toca para seguir») ahora sí recibe el toque. `tools/check_toques.mjs` (Actions, tiempo real y teclado real) manda un toque en PREPÁRATE, uno al cambiar de señal, uno doble, uno largo de 700 ms, ráfagas de 8 en ¡EMPUJA! y uno después de una pausa, y exige que cada pulsación quede anotada y resuelta, y cada descartada con motivo y palabra en el acuse. Medido en Actions: 74 pulsaciones mandadas, 74 anotadas y resueltas (64 aceptadas; descartadas: 4 «sobra», 3 «espera», 2 «rebote», 1 «temprano», todas con su palabra en el acuse); con PREPÁRATE, levantó solo al aparecer ¡TIRA!; toque largo = 1 toque; un toque a menos de 60 ms del anterior sale «DOBLE TOQUE» (rebote del dedo, a propósito); en el turno del rival, «Turno de Ilya Brenner (rival) · mira o pulsa ESPACIO para saltar» sin señal.
6. **Pesistas distintos.** La tarjeta muestra estatura, fémur, brazos y movilidad con barras, y una línea de qué le conviene, en los dos idiomas. Las medidas salen de la tabla «Los dos biotipos» (`roster.js`, `CUERPO`); la movilidad es una estimación (alta para quien domina el envión en sentadilla). **Marangi usa el cuerpo de Brenner: sus medidas son las mismas. El tercer cuerpo queda pendiente (necesita Blender).** Por eso su estatura pasó de «1,76 m» a «1,83 m» en la tarjeta. Para que Largo y Potente no se vean iguales, la tarjeta suma dos barras de la ficha de juego: **energía** (`fon`: Largo mucha, Potente poca) y **margen** (`tec`, cuánto perdona un toque a destiempo: Largo medio, Potente justo). **Pendiente: el tercer cuerpo para Marangi** (modelo propio en Blender); hasta entonces las cuatro medidas del cuerpo son las de Brenner.
7. **Pantalla completa.** En Android, `requestFullscreen` y `orientation.lock('landscape')` al tocar Jugar, Saltar la práctica y Jugar otra vez. En el iPhone ningún navegador lo deja (todos son WebKit): `web/manifest.webmanifest` (fullscreen, landscape, íconos en `web/iconos/`), `apple-mobile-web-app-capable` y un aviso de una vez, cerrable, en los dos idiomas, con los pasos del navegador en uso (ver «Segunda prueba en el iPhone» más abajo). En el navegador, `100dvh` y `visualViewport` para el alto real.
8. **Girar.** Ya no existe «Gira el teléfono»: con el teléfono en vertical (o con la rotación trabada) todo el juego (`#app`) se gira 90° con CSS (`html.rotado`, medidas de `telefono.js`) y se juega con el teléfono acostado; si el teléfono rota de verdad, se usa la orientación real. El lienzo mide sin transformar y los toques no usan coordenadas. Probado en Actions a 390 × 844: dos intentos válidos con toques y, al girar el visor a 844 × 390, el contenido vuelve a derecho.
9. **Teclado.** En el teléfono los campos (nombre, correo, respuesta libre) quedan de solo lectura; al tocarlos se abre un editor arriba de lo visible, derecho, grande, con «Listo», y el resto se esconde. Enter o «Listo» devuelven el texto al campo.
10. **Timing con el dedo.** El círculo se cerraba en el objetivo ya corregido, así que la corrección de atraso no corregía nada; ahora se cierra donde hay que tocar y el núcleo mide contra el objetivo corregido (60 ms con el dedo). Con `tactil` en la cabecera del registro (solo en Fácil) las ventanas de PERFECTO, BIEN y límite se estiran un 30 %, la señal abre 80 ms antes y cierra 110 ms después. Vibración corta al acertar (Android). Señal más grande en el teléfono. `tools/dedo_test.mjs` (bot con 60 ms de atraso y ±120 ms): aperturas del 98,3 al 100 % de válidos y del 92 al 97 % de toques en BIEN; con ±180 ms, del 88,8 al 97,5 %.
11. **Menos texto en el teléfono durante la partida.** Sin el subtítulo de la señal (salvo con apuro), sin la bajada del cartel del evento, sin la frase del entrenador ni la línea del reloj en el llamado, y un solo mensaje a la vez: con el veredicto se esconden el recuadro del rival, las etiquetas, la guía y el marcador.

**Segunda prueba en el iPhone del dueño (Chrome de iOS, 12-nov a la noche), rama `telefono-pulido`:**
1. **«No tiene sonido y no se lo puede poner».** Causas, con el código de antes: (a) `audio.js` creaba el AudioContext en el clic de un botón de panel y solo lo reanudaba si estaba `suspended`; en iOS queda `interrupted` tras una llamada, el bloqueo o el cambio de app, y nada lo reanudaba dentro de un gesto. (b) WebKit trata Web Audio como sonido «ambiente»: con el interruptor de silencio (o el botón de acción en silencio) no sale nada, y no había nada que pidiera la sesión de reproducción. (c) No había botón de sonido. Ahora: `desbloquear()` corre en la fase de captura de cada `touchend`, `click` y `keydown`, crea o reanuda el contexto ahí mismo (sincrónico, sin await), pone `navigator.audioSession.type = 'playback'` y en iOS reproduce en bucle un WAV silencioso de 0,1 s armado en memoria (a la frecuencia del contexto); con eso el iPhone en silencio igual suena. Parlante en la barra de la partida (`#sonidob`, a la izquierda de la pausa; tachado y rojo si está apagado) y fila «Sonido» en Opciones; se recuerda en `tarima.sonido`; apagado no se crea audio y la sesión vuelve a `ambient`. Al prenderlo suena un aviso corto.
2. **Opciones acostado, el desplazamiento.** Causa: `telefono.js` tenía un `touchmove` con `passive: false` en `document`. En WebKit eso obliga a cada arrastre (también dentro de un panel, aunque el manejador no lo frenara) a esperar al hilo principal antes de desplazar, y detrás de la bienvenida ese hilo está bajando y compilando los modelos (`escena.precalentar`): el panel se trababa o no arrancaba. Ahora el `touchmove` que frena va solo en el lienzo y en el botón (que no contienen paneles) y los paneles se desplazan por el compositor: `touch-action: pan-x pan-y` (también con el contenido girado), `overscroll-behavior: contain` (el arrastre no pasa a la página al llegar al borde) y `scroll-padding-bottom` para la fila de abajo. Al abrir Opciones el panel se lleva hasta las opciones (antes quedaban debajo de la fila de botones, fuera de la vista).
3. **Pantalla completa en Chrome del iPhone.** Ninguna página puede ponerse a pantalla completa en el iPhone (ni Safari ni Chrome: los dos son WebKit, y ahí la API no existe o se rechaza); la salida es instalarla. El manifiesto y las meta ya estaban bien (`display: fullscreen`, `orientation: landscape`, íconos de 180, 192 y 512, `apple-mobile-web-app-capable`, `black-translucent`, `theme_color`). Lo que faltaba: el aviso daba los pasos de Safari a quien usa Chrome. Ahora detecta el navegador (`CriOS` = Chrome; Firefox, Edge y otros = genérico) y da sus pasos en los dos idiomas, sale una vez sola, se cierra, y se vuelve a pedir desde Opciones («Cómo verlo a pantalla completa»). En el iPhone ya no se llama a `requestFullscreen`. En el navegador, de costado, el cuerpo mide el alto de `visualViewport` (`--vvh`).
4. **Prueba:** `tools/check_iphone.mjs` (en «Teléfono» y en «Pruebas del juego»): agente de usuario de Safari y de Chrome de iOS, de 340 a 430 px de alto, en los dos idiomas; toques y arrastres reales por CDP. **No reproduce WebKit**: no mide el hilo principal ni el interruptor de silencio; verifica que el audio corre después del primer toque, que se pide `playback` y suena el `<audio>` silencioso, el botón, el guardado, el desplazamiento con el dedo y los botones sin cortar. **Falta confirmarlo en el iPhone del dueño** (con el interruptor en silencio).

**Pruebas nuevas en Actions:** `muro.yml` (`tools/check_muro.mjs`: en inglés con teclado y en español en un teléfono de costado con toques; 2 finales, muro en el podio, recarga y sigue el muro, encuesta, 2 finales más, muro solo con correo, correo y juego libre, base y eventos revisados), `check_toques` y `dedo_test` en «Pruebas del juego», y `check_telefono` con el contenido girado y el editor de campos.

**Costo en tiempo.** Ver a los rivales enteros alarga la final si no se saltea nada: en `check_recorrido` (sin saltear) una tanda de cinco intentos de rivales con sus repeticiones tarda 65 s, y entre dos intentos propios con dos rivales en el medio, de 25 a 29 s. Con un toque cada turno se reduce a lo justo. Si la final 1 la terminan pocos, mostrar entero solo el rival que pelea con el jugador y resumir al otro es la palanca.

**Sin verificar:** nada de esto se probó en un teléfono de verdad (solo emulado en Actions, por software): falta ver en el iPhone del dueño el contenido girado con la rotación trabada, el editor con el teclado de iOS, la instalación en la pantalla de inicio, y en Android la vibración y la orientación fija. Las ventanas del dedo y los 60 ms son estimaciones medidas con un bot, no con personas.

### Grabación de sesión (12-nov, noche, rama `grabacion`)

Decisión del dueño: grabar solo la página, en una parte de las sesiones, sin el 3D. Detalle en `docs/MVP.md` 6.6.

- **Qué hace.** `web/js/game/analitica.js` sortea una vez por carga según la bandera `grabacion` (`off`, `tercio` por defecto, `todas`; `worker/src/reglas.js`). Si sale, carga el grabador vendorizado (`web/vendor/posthog/lazy-recorder.js`, de posthog-js 1.441.2) antes de `posthog.init`, pone la configuración de la grabación a mano (`window._POSTHOG_REMOTE_CONFIG`: el SDK sigue sin pedirle nada a PostHog) y graba por `/qx/s/`. La súper propiedad `grabada` dice si la carga se grabó.
- **Privacidad.** Campos tapados (`maskAllInputs`); texto tapado si tiene una «@» o el nombre del jugador (guardado o el que se está escribiendo); atributos (`maskAttributeFn`, `taparAtributo`): `value` siempre tapado, porque con el campo vacío rrweb guarda el atributo del HTML (la bienvenida pone `value="<nombre>"`), y `data-v` de la sugerencia de correo, `title`, `aria-*` y demás con la misma regla que el texto (clase, estilo y CSS quedan en claro); `canvas`, `#senal`, `#acuse` y `#depura` bloqueados (cajas vacías); sin consola ni red. Sin medición (sin clave, `?metricas=0`, interruptor de la privacidad) no se carga ni PostHog ni el grabador. La privacidad se abre en otra pestaña: el juego escucha el evento `storage` y, si ahí se desactiva la medición, deja de medir y corta la grabación; si se apaga mientras se descargan PostHog y el grabador, no se llama a `init`. `web/privacidad.html` pasa a la versión **2026-11-c** con la grabación en los dos idiomas; el Worker acepta a, b y c, y el juego manda c (`servidor.js`). **Publicar primero el Worker** (si la página nueva sale antes, las altas con «c» darían `aviso`).
- **Costo medido** en Actions (`check_analitica`, sección 6, juego con `?dibujo=0`, primer intento propio de 5,7 s): el DOM tiene ~133 mutaciones por segundo y al grabador llegan 9,4 (`#zona` clase y texto, `#reloj`, `#rival`); cuadros iguales con y sin grabación (p95 16,8 ms, ninguna tarea larga); una instantánea completa de la página cuesta 2 a 5 ms (posthog-js vuelve a tomar una cada 5 minutos). Del grabador: 215 KB (67 KB con gzip), solo en las cargas sorteadas, en paralelo con posthog-js. Con dibujo por software los cuadros no dicen mucho: falta mirarlo en un teléfono de verdad.
- **Pruebas.** `node tools/servidor_test.mjs` (sorteo, una tirada por carga, ~1/3 sobre 3000 cargas, opciones, `maskTextFn`, sin medición, grabador que no carga), `node tools/worker_test.mjs` y `cd worker && npm test` (valores y por defecto de la bandera, versión c), y `tools/check_analitica.mjs` con navegador en el flujo «Servidor y publicación» (corrida verde 43325309689 en la rama `grabacion`): grabación por `/qx/s/` sin pedidos a PostHog, nombre, correo y respuesta libre ausentes de la grabación, interfaz legible, lienzo y señal como cajas vacías, `off`/`tercio`/`todas` y sin grabación con la medición desactivada.
- **Para la rama `mvp` (no es de esta rama):** `guiaTxt` en `main.js` pone `#guia.hidden` en cada cuadro aunque no cambie (~58 mutaciones por segundo durante el intento). El grabador las descarta porque el valor es el mismo, pero un `if (g.hidden !== !txt)` le ahorra trabajo al navegador.

**Paso del dueño en PostHog** (proyecto nuevo, US Cloud): Settings → Project → **Replay** → prender **«Record user sessions»** (Session replay). Dejar apagado «Capture canvas» (el juego lo fuerza apagado igual); el enmascarado, el muestreo y la duración mínima del panel no hacen falta: los decide el juego. Si el panel pide dominios autorizados para grabar, agregar `https://liftinggame.pages.dev`. Revisar la cuota mensual de grabaciones del plan y, si hace falta, un tope de gasto en Billing. Para cambiar la proporción sin publicar: crear la bandera `grabacion` multivariante con las variantes `off`, `tercio` y `todas` y la que se quiera al 100 % (una bandera booleana apagada también da `off`). Ojo: los dispositivos que ya pidieron banderas en el día ven el cambio cuando el Worker las refresca (hasta 24 h); los nuevos, enseguida.

**Pendiente:**
- **Consentimiento en la UE.** La grabación va con la medición, que es de salida (interruptor en la privacidad), sin pregunta previa. Para visitantes de la UE una grabación de sesión suele pedir consentimiento antes de empezar; si el dueño quiere cubrirlo, lo más barato es no sortear la grabación cuando `contexto.pais` es de la UE o del EEE (el Worker ya manda el país).
- **Retención de las grabaciones** en PostHog: revisar cuántos días las guarda el plan y, si se quiere, decirlo en la privacidad.
- **Si se pasa a `todas`** por un tiempo, la privacidad sigue siendo cierta («por defecto, una de cada tres»), pero conviene volver a `tercio`.

### Muro en el medio de la final (12-nov, noche, rama `muro-medio`)

**Decisión del dueño** con las dos primeras horas publicadas (~59 personas: 1 de cada 3 termina la final que empieza, 9 llegaron al muro de las 2 finales, 1 mail): «ponela en el medio de la competencia, apenas terminás el snatch pum mail para seguir jugando gratis indefinido». Detalle, tabla de qué pasa en cada caso, eventos y embudo en `docs/MVP.md`, «Cambio del 12 de noviembre (noche)».

- **Regla.** Gratis: el arranque de una final por dispositivo (misma cuenta por dispositivo y HMAC de IP; `TOPE_IP` sigue). Al terminar el arranque, en el intervalo, sube el muro: correo → juego libre y la misma final sigue con el dos tiempos sin recargar; encuesta (una vez) → termina esa final y suma 1 completa; «Ahora no» → la tabla del arranque, «La final termina aquí» y al inicio. Las finales siguientes sin correo ni bono empiezan con el muro antes del primer intento. Ya no hay muro en el podio.
- **Servidor.** Variables `GRATIS_ETAPA=arranque`, `GRATIS=1`, `BONO_ENCUESTA=1` (`worker/wrangler.jsonc`). Migración `0003_etapa.sql` (`partidas.etapa`, `partidas.envion_por`; la aplica `tools/desplegar.sh` con las demás). Endpoint nuevo `POST /api/envion {dispositivo, pase}`: el dos tiempos de una partida `arranque` solo con `lista_id` o con la encuesta una vez por dispositivo (`UPDATE` condicional). El pase lleva el id de la partida y la etapa. `regla: {etapa, gratis, bono}` en estado, partida y envion. La bandera `muro-partidas-gratis` no se usa con el arranque gratis (se reporta `GRATIS`; lo asignado sigue guardado).
- **Volver a la regla vieja sin código:** `GRATIS_ETAPA "final"`, `GRATIS "2"`, `BONO_ENCUESTA "2"` en `worker/wrangler.jsonc` y publicar el Worker. La prueba `check_muro.mjs` corre con esas variables.
- **Cliente.** `servidor.envion()`, la etapa en el pase de la pestaña, y la final del arranque gratis no se reanuda al recargar (reanudar empieza de cero y regalaría otro arranque). Gancho nuevo `ganchos.intervalo` (en `main.js`, antes de elegir el primer peso del dos tiempos); el muro, el corte con la tabla y el permiso viven en `conexion.js`. `?muro=firme` en localhost simula la regla nueva (`&etapa=final`, la vieja). Sin API (servidor de Python) y «sin servidor» juegan la final entera.
- **Eventos.** `muro_visto` con `momento` (`tras_arranque`, `inicio`, `podio`) y `gratis_etapa`; `muro_ahora_no`, `muro_cerrado`, `anotar_ok` y `encuesta_enviada` con `momento`; nuevos `final_cortada`, `envion_ok` (`via`) y `envion_negado`. Súper propiedad `gratis_etapa`.
- **Pruebas.** `servidor_test` corre el Worker de verdad en Node sobre la D1 falsa con el cliente del juego (arranque gratis una vez, dos tiempos negado, permitido tras anotarse y tras la encuesta, recarga en el intervalo, otra pestaña, otro dispositivo en la misma IP, API a mano, dos pedidos a la vez, regla vieja); `worker_test` la regla pura; `npm test` del Worker en Miniflare; con navegador en «Muro y lista», `check_muro_medio.mjs` (inglés con teclado: arranque, muro, correo, dos tiempos hasta el podio; español en el teléfono acostado con toques: arranque, muro, «Ahora no», tabla y fin, muro al empezar, recarga, encuesta y final completa) y `check_muro.mjs` con la regla vieja. Capturas en el artefacto `muro-medio-out` (`out/muro_medio/<idioma>/`).
- **Estimación, sin datos todavía:** que el muro en el intervalo convierta más que el del podio. Se mira con el embudo `muro_visto (momento=tras_arranque)` → `anotar_ok`/`encuesta_enviada` → `envion_ok` → `final_fin`, contra `muro_cerrado`.
- **Pendiente.** Publicar (lo corre el orquestador con `tools/desplegar.sh`: migración remota 0003 y Worker antes que Pages). Las páginas viejas en caché del navegador no saben pedir `/api/envion`: con la regla nueva, juegan la final gratis entera una vez (la partida queda `arranque` en la base) hasta que recarguen.

### Correo obligatorio, encuesta opcional tras anotarse e inglés por defecto (13-nov, rama `mvp`)

**Decisión del dueño** (molesto porque la encuesta como alternativa al correo, la pregunta de pago y la frecuencia de las novedades no las había pedido): «Mail sí o sí», preguntas tipo pedido de funciones con 3 propuestas y un campo opcional, app de tienda o juego web sin hablar de precios, inglés por defecto, sin frecuencia de novedades. Detalle y textos exactos en `docs/MVP.md`, «Cambio del 13 de noviembre».

- **Muro.** Solo el correo, en todos los muros (tras el arranque, al inicio y, con la regla vieja, en el podio). Se borraron el recuadro «No email? Answer 4 questions…», el premio de finales por encuesta y `muro.solo_mail`. «Ahora no» igual que antes. `muro_visto.caminos` vale siempre `mail`.
- **Servidor.** `BONO_ENCUESTA "0"` en `worker/wrangler.jsonc` (y 0 si falta): `encuesta_disponible` siempre `false`, `decidirEnvion` no da la vía `encuesta` con bono 0, la encuesta no cambia etapa ni cupo y su fila queda con `i = NULL`. `ENCUESTA_ID` y `ENCUESTA_PREGUNTAS` borradas; `metricas` ya no lleva `encuesta`. La maquinaria del bono sigue probada con bono 1 y 2 (`worker_test`, `npm test`, `servidor_test`).
- **Encuesta nueva** (`conexion.js`, `anotado()`): en el panel «¡Adentro!», si el dispositivo no la contestó (`tarima.encuesta`). Plataforma (app o web, una), qué le gustaría que tenga (3 propuestas, varias) y texto libre opcional. «Enviar y seguir…» manda sin esperar (si no marcó nada, solo sigue) y «Saltar» sigue. Respuestas: `POST /api/encuesta {r:{plataforma, features, otra}}` → el Worker manda a PostHog el evento **`encuesta_respuesta`** (`plataforma`, `features`, `otra`, `idioma`, `pais`), sin correo, con el `distinct_id` de la sesión. El texto libre sale limpio del cliente y el Worker lo vuelve a limpiar (sin «@» ni direcciones web, 280 caracteres). Eventos del juego: `encuesta_vista`, `encuesta_enviada`, `encuesta_salteada` (antes `survey shown/dismissed`).
- **Idioma.** `detectarIdioma`: `?lang=`, después `tarima.idioma`; si no, inglés (el navegador ya no cuenta). `juego.html` y `privacidad.html` arrancan en inglés; `/confirmar` y `/baja` también (salvo `?lang=es` o anotado en español), con enlace al otro idioma. `idioma_origen` vale `defecto` en lugar de `navegador`.
- **Novedades y privacidad.** «Also send me game news.» / «También quiero recibir novedades del juego.»; la privacidad pasa a **2026-11-d** (encuesta nueva, sin frecuencia); el juego manda `d` y el Worker acepta a–d. **Publicar primero el Worker.**
- **Pruebas.** Sin navegador: `worker_test` (172), `npm test` del Worker (46), `servidor_test` (260, con los textos exactos y la privacidad), `sim_test`. Con navegador en Actions: `check_muro_medio` (navegador en español, juego en inglés; en la computadora encuesta salteada con teclado; en el teléfono acostado contestada con toques, en inglés y después en español, y lo que viaja a `/api/encuesta` sin «@»), `check_muro` (regla vieja: muro solo con correo, encuesta contestada y salteada), `check_analitica` y `check_game` (idioma). Capturas en `muro-medio-out` (`out/muro_medio/en|es/*anotado_encuesta*`).

### Gameplay 2: control «un toque, un tramo», aprendizaje y ritmo (13-nov, rama `gameplay`)

Diseño: `docs/JUEGO.md`, sección Gameplay 2. Gesto exacto y pruebas: `docs/CONTROLES.md`, sección `'u'`. El nivel `'u'` es el Fácil por defecto; `'c'` (Clásico) no cambió y `'f'` (círculos) quedó solo para recalcular registros viejos (`?ctl=f`). Nada publicado en Cloudflare.

**Qué se hizo.**
- **Núcleo** (`attempt.js`, métodos `_u…`; `rules.js`, `UNO`): margen en milésimas de disco (3 discos + «el día» ±0,9), gasto por tramo `base × r(I) × cuerpo`, contactos guardados y apoyados, doble de 120/80 ms, confirmación de 300 ms, ¡TIRA! sola a los ~25 s, ¡ARRIBA! sola a los 6 s, FRENO de 2,5 s con la garra (una por levantamiento, `match.js` la apaga), sin nulos. `res.uno` lleva margen, día, gastos, garra, `tramo_caida` y `tramo_mayor`. En `'u'` tocar no gasta Resto.
- **Capa y señal** (`controles.js`): identidad para el núcleo; `senal(m, t, 'u')` con tipos `libre`, `luz`, `uno`, `decide`, `espera` y `auto`; `QUE_U` da la palabra de cada contacto.
- **Entrada** (`input.js`): Espacio y Enter del levantamiento en captura con `preventDefault`, primer evento repetido cuenta como apretar, gracia de 400 ms del dedo cancelado, bordes que no cuentan (`BORDES`), `vibrate(12)`, foco al escenario al cerrar el llamado, tic de audio en el mismo manejador.
- **Juego** (`main.js`): `'u'` por defecto (un `'f'` guardado se lee como `'u'`); Opciones «Fácil» y «Clásico (exigente)»; sin tarjeta ni tutorial aparte; panel del llamado con «Llegas con ●●○», lo más duro, la garra, «ESPACIO: levantar N kg» y, en la primera final, confirmar dos veces un peso con el que no llega; el envión en «Más opciones» con sus discos; presentación en una línea y ayudas de primera vez dentro del primer intento; «el día» al agarrar la barra; línea de caída con tramo y gasto (`mensajes.js`, `explicar(res, 'u', …)`); sin repetición propia; analítica nueva (MVP.md, 6.3).
- **Ritmo** (`ritmo.js`, compartido con la prueba): rival resumido (1 s antes de su última explosión hasta la recepción, veredicto de 1 s), en fila de 1,2 s desde el tercero seguido, entero solo el que se juega el oro o una medalla (uno por tramo, desde 1 s antes de la explosión, fases lentas ×5, veredicto cortado a 2,6 s, repetición solo si cae); veredicto propio de 2,95 s si vale y tVer + 2,4 s si cae; carga de la barra sin espera; recuadro «ESPACIO: seguir» / «Toca: seguir»; eventos `rival_salteado` y `veredicto_salteado`.

**Medido** (sin navegador en la Mac, y en Actions; números del 13-nov):
- **A** (play_human, 600 por casilla, 3 pesistas × teclado y dedo × 88 a 103 %, arranque y dos tiempos: 43 200 casos × 6 bots): 0 resultados distintos entre reactivo, tardío, fantasma, mantiene y machacador; 0 caídas por entrada; el ausente solo pierde ¼ + ½ disco y saca 100 % al 90 %.
- **B**: el novato con el dedo y la apertura sugerida, 100 % en arranque y dos tiempos con los tres.
- **C** (con `CUERPO_NEUTRO`): 100 % hasta el 95 %, ~95 % al 97 %, ~50 % al 100 %, ~5 % al 103 %. Se cumple, pero lo recalibra quien defina los pesistas.
- **H** (teclado_test y dedo_test, 10 000 secuencias cada una): 0 sin resolver, 0 contados dos veces, 0 sin palabra, bordes que no cuentan, ráfaga de confirmación que nunca arranca el tirón.
- **J** (ritmo_test, 360 finales): final mediana ~111 s (meta ≤ 150), espera mediana 5,8 s, p90 13,5 s, máxima 19,3 s (meta ≤ 10 · 15 · 20), rival no decisivo ≤ 2,9 s, decisivo ≤ 7,5 s, intento propio p90 6,4 s (arranque) y 9,6 s (dos tiempos). Con paneles de 2,5 s por decisión: el tiempo real de una persona en el panel no está medido.
- **G y L** (sim_test): 1000 finales `'u'` recalculadas iguales, `sim_ref.json` y `sim_ref_facil.json` idénticos, `sim_ref_uno.json` nuevo, toda caída con tramo y sin tiempos.
- Con navegador (Actions, run 43369376557 y teléfono 43369376591, todo en verde): check_game (teclado, dedo y «sin tocar»), check_recorrido (final de 98,6 s del primer llamado al podio, espera máxima 12,7 s), check_telefono (dos dedos = un contacto, borde que no cuenta), check_iphone, check_toques, check_fluidez (primera vez sin tutorial), check_muro y check_muro_medio (muro.yml), servidor.yml. Capturas del llamado, ¡TIRA!, ¡SALTA!, ¡PÁRATE! en el iPhone acostado y el turno del rival, miradas.
- **I** (check_toques): la tecla dibujada se hunde dentro del manejador en el 100 % de las pulsaciones, y el manejador entero (acuse, núcleo y palabra) tarda 2,7 ms (p95). Del timeStamp al cuadro siguiente da 72 ms por software (SwiftShader, hilo principal ocupado): queda como nota; con placa se exige ≤ 17 ms. **Sin medir con placa ni en un teléfono de verdad.**

**Ganchos para quien sigue (pesistas y emoción).**
- **Pesistas:** `rules.js` → `cuerpoDe(f)` lee `sim.json → atletas.<id>.cuerpoJuego` `{tiron, arriba, pararse, movil}` (milésimas) y, sin él, `CUERPO_NEUTRO` (el promedio de la tabla de G2.5). `match.js` lo pasa en `ctx.cuerpo` y el panel usa el mismo `previsto()`. Agregar `cuerpoJuego` cambia la huella de sim.json (`tools/build_sim_data.mjs`) y hay que regenerar `sim_ref_uno.json` (`node tools/sim_test.mjs --update` reescribe las tres referencias: revisar que `sim_ref.json` y `sim_ref_facil.json` no cambien). Faltan `tools/margen_cal.mjs` y `tools/chance_test.mjs` (metas C, D y F), las tarjetas de roster.js sin Energía y los textos `pesista.*.conviene`, que todavía hablan de «toques a destiempo» y «tocas preciso» (contradicen `'u'`).
- **Emoción:** `E.alTramo(entrada, m)` en `main.js` se llama cada vez que cierra un tramo (`{t, tramo, gasto, m}` o `{t, tramo, garra, m}`; está en `m.U.log`) para los discos que se apagan; el FRENO es la fase `'freno'` (la barra tiembla con 0,55 y suena `aviso`); el pisotón suena `recepcion`; «al límite» está en `res.uno.al_limite`. Cámara lenta, luces de a una con suspenso, apuesta de los rivales en el resumen y Clásico ofrecido tras dos victorias: sin hacer.

**Apartamientos del diseño.**
- ¡SALTA! cierra en la recepción y no en la explosión (con medio segundo, el que reacciona tarde perdía el ¼; meta A).
- «Bajar a X kg» después de una caída no existe: la barra nunca baja (`p.minimo`). El panel dice lo que da el mismo peso.
- En el ritmo, «decisivo» es solo oro o medalla (con «pasa adelante» eran el 45 % de los turnos) y se ve entero uno por tramo entre dos levantamientos propios.
- El tutorial guiado de `'f'` y el metrónomo de Clásico siguen en el código; en `'u'` no se usan.

### Gameplay 2, segunda parte: pesistas y emoción (13-nov, rama `gameplay`)

Lo que cambia entre pesistas son los kilos y el cuerpo, nunca la precisión de los dedos (la meta A sigue en 0 diferencias entre maneras de tocar).

**Pesistas.**
- `sim.json → atletas.<id>.cuerpoJuego` (lo escribe `tools/build_sim_data.mjs`), con los factores del diseño **fijos**: Compacto 1,1 / 0,7 / 0,85 (tirón / arriba / pararse) y movilidad alta; Largo 0,5 / 0,9 / 1,2; Potente 1,0 / 1,35 / 0,6. El envión de la casa es la tijera para los tres: el squat de Compacto rinde igual hasta el 97 % y peor desde el 100 % (meta D), así que queda como opción en «Más opciones».
- La base de cada tramo se recalibró con los cuerpos reales: `UNO.base` 1000 / 1700 / 1800 (antes 900 / 1500 / 2000). Herramienta: `tools/margen_cal.mjs` (exacta, sin bots; `--buscar` recorre la grilla).
- `rules.js → chanceUno()`: chance exacta de que suba un peso (suma los días con los que llega, con la garra si queda). El panel la muestra como «7 de 10» (`deDiez`, en `ui/mensajes.js`: «10 de 10» solo desde 99,5 %).
- Huella de sim.json nueva (`83f90ed0`): `sim_ref.json` y `sim_ref_facil.json` cambian solo esa línea (las 21 tablas de Clásico y Fácil de círculos son las mismas); `sim_ref_uno.json` regenerada. Ningún servidor recalcula registros (el Worker no importa `web/js/sim`).
- Tarjeta en `'u'`: una línea por pesista (`pesista.<id>.u`) y tres barras, tirón / arriba / pararse (fácil en dorado, difícil en rojo), en lugar de Energía y Margen. Clásico conserva su tarjeta.
- En el levantamiento, la primera vez que un pesista pasa por su punto fuerte o débil, se dice debajo de los discos (una vez por pesista y dispositivo: `tarima.visto.u_fuerte_<id>` y `u_debil_<id>`).

**Emoción** (solo presentación; el núcleo y el registro no cambian).
- `ui/margen.js` (nuevo): los discos de margen arriba al centro. Al agarrar la barra suben o bajan con «el día» y lo dicen. Cada tramo que cierra apaga lo que gastó, con su palabra («tirón −½»). La garra se ve como una ficha. Al caer, el disco que faltó se pone en rojo y dice «Faltó ¾»; si vale, los discos quedan en verde, o en dorado si fue al límite.
- FRENO: la escena se oscurece por los bordes, la ficha de la garra late, suena un latido cada 0,62 s y no suena nada más. Si la persona toca, se oye un golpe y la tribuna estalla (`sonido.garra`).
- ¡PÁRATE!: golpe de bajo y un grito corto (`sonido.pisoton`), y la imagen se sacude 4 px durante 120 ms. Sin sacudida si la persona pidió movimiento reducido.
- Válido al límite: las luces salen más espaciadas (0,45 s), con un latido en cada una, y el veredicto sigue en 2,95 s (`veredictoPropio(ok, fin, limite)`).
- Panel: «Te falta ½ disco: depende del día · 5 de 10». La Cuenta muestra la chance del peso del oro, de la plata o de pasar al frente. En la primera final, un peso de menos de 5 de 10 pide confirmar dos veces («¿Seguro? 169 kg sube 4 de 10»).
- Rivales: «191 kg, cómodo / justo / al límite» en el cartel de su turno, según la intensidad (95 % y 99 %).

**Medido** (sin navegador en la Mac, una prueba a la vez; las cuatro corren también en Actions, grupo `nucleo`):
- **C** (play_human y margen_cal): con el novato del dedo, 100 % hasta el 95 %, 97,6 % al 97 %, 53,7 % al 100 % y 6,1 % al 103 %. Al 100 %, en arranque y en dos tiempos: Compacto 73 y 86, Largo 30 y 59, Potente 17 y 59. Al 97 % ningún pesista queda más de 10 puntos abajo del promedio. Las curvas de margen_cal (exactas) y las de play_human (núcleo y bots) coinciden.
- **D**: tramo que más gastó en las caídas del 100 al 103 %: Largo, pararse en el 100 %; Potente, arriba en el 100 %; Compacto, repartido (tirón 7, arriba 58 y pararse 36 %). Al 100 %, entre pesistas hay hasta 56 puntos de diferencia.
- **E** (`tools/pesistas_test.mjs`, nuevo; 200 finales por pesista, estrategia y nivel): con rivales normales, el lector (lee la chance y La Cuenta) gana el oro 55 a 83 puntos más seguido que el prudente (+2 kg) y que el codicioso (+5 kg), que no ganan nunca contra rivales normales; el lector gana el 83 % con Compacto, el 55 % con Largo y el 58 % con Potente. Con rivales amistosos, el lector gana el oro en el 97 al 98 % de las finales con los tres. Con el plan del entrenador (lo que el panel trae puesto: +4 y +3 kg) se caen 0 % de las barras (meta ≤ 12 %), pero gana el oro solo en el 20 al 43 % contra amistosos y nunca contra normales: **para decidir** si el panel debería proponer el peso de La Cuenta cuando la chance es buena.
- **F** (`tools/chance_test.mjs`, nuevo; 30 000 intentos con el núcleo): en cada «X de 10», el error entre lo medido y lo prometido es de 2,7 puntos como mucho.
- **J** (ritmo_test): sin cambios. Final mediana de 111 s, espera máxima de 19,3 s, veredicto propio de 2,95 s si vale y de 3,7 s si cae.
- A, B, G, H, L: siguen en verde (play_human, sim_test, dedo_test, teclado_test, caida_test, perf_test, servidor_test).

**Apartamientos del diseño.**
- Compacto: la tarjeta dice «Su arranque máximo es el más bajo», no «Levanta menos kilos». Los techos de los tres suman 380 a 382 kg y Compacto tiene el dos tiempos más alto, así que la frase del diseño no era cierta. A igual intensidad, Compacto es el más fácil: es el que viene marcado para quien empieza.
- Envión de la casa de Compacto: tijera (el diseño ya lo preveía si la meta D no confirmaba el squat).
- La fase fuerte y la débil se avisan con «Largo: tirón, su punto fuerte» o «Potente: arriba, su punto débil», no con «salto fácil».
- La apuesta de los rivales sale de la intensidad que pidieron (≤ 95 % cómodo, ≤ 99 % justo, después al límite), no de la tabla de `'u'`: ellos juegan en Clásico.
- Sin hacer: la cámara lenta (meta K, necesita perf_test con placa), el magnesio del pisotón y Clásico ofrecido después de dos finales ganadas.

### Gameplay 2.1: lo que encontraron los verificadores, corregido (13-nov, rama `gameplay`)

**Qué cambió** (diseño: `docs/JUEGO.md`, G2.R; gesto: `docs/CONTROLES.md`, sección `'u'`). Todo en el nivel `'u'`; Clásico y los rivales no cambian.
- **Ningún toque cambia el resultado.** ¡TIRA! y ¡ARRIBA! salen solas a los 2 s (con una barra que muestra cuánto falta); ¡SALTA! y ¡PÁRATE! ya no dan ni quitan energía (el ¼ y el ½ quedaron dentro de la base). El FRENO es una pausa de 1 s sin nada que tocar: la garra se usa sola, y solo si con ella el resto del levantamiento llega; si no alcanzaría, no se gasta.
- **Suerte por tramo** (`rules.js → ruidoDe`) en lugar de «el día» revelado al agarrar: cada tramo gasta lo suyo ± una suerte que se ve recién cuando cierra («pararse −1½ · pesó más»). La línea de caída nombra un solo tramo, lo que gastó y, si tocó, la mala suerte o que la garra no alcanzaba.
- **Energía** en lugar de «discos» (en inglés eran «plates», como los de la barra). Glosario de `'u'` con energía, garra y suerte; la presentación de `'u'` ya no habla de la energía de Clásico.
- **Pesistas** en `rules.js → CUERPOS_U` (sim.json vuelve a la huella de mvp, `09c9b907`; los registros de `'u'` llevan `uno: HUELLA_U` y `replay.js` la exige). Recalibrados para que ninguno domine y cada uno pida otra estrategia: Compacto fiable, Potente irregular.
- **El entrenador declara el peso** (`web/js/sim/entrenador.js`, nuevo): al cerrar cada levantamiento propio, `match.js` declara en `'u'` lo que propone (lee la chance, La cuenta, y el cansancio y la garra del intento siguiente), así que el orden ya cuenta con ese peso y casi nunca hay «desplazado». Al abrir el llamado el panel lo vuelve a mirar (con lo que hicieron los rivales en el medio); si la persona ya cambió los kilos, respeta su peso. Se cambia con ← →.
- **Entrada:** los toques cerca de los bordes cuentan (con acuse); la gracia de 400 ms del dedo cancelado es solo de `'u'`; la tecla del acuse sale en el idioma; el acuse se mide en cada aparato (`toques.pinta`, en `?depura=1` y en `intento_propio` como `acuse_p95_ms`).
- **Teléfono y pantalla:** «TOCA: SEGUIR» encima del botón redondo; el cartel de los rivales baja cuando se ve la energía; el turno del rival con la instrucción en su línea; tarjetas de `'u'` en 667×375 solo con lo que cambia el juego; panel del llamado más bajo; `#capa` y `#msg` encima de `#tv`; AGUANTA y ¡DA TODO! sin tecla dibujada; «Te sobra / te falta» sin «—»; el segundo «¿Seguro?» espera 400 ms y no lo activa una ráfaga vieja; «Después vas tú» en lugar de «tu reloj vuelve a empezar».
- **Actions:** muro.yml y servidor.yml también corren en cada push a `gameplay`.

**Medido** (sin navegador en la Mac, una prueba a la vez):
- **A** (play_human, 600 por casilla): 43 200 casos × 6 bots, **0** resultados distintos entre reactivo, tardío, fantasma, mantiene, machacador y **ausente**; 0 caídas por entrada. Con el bot humano de los verificadores (lognormal, distracciones, toques largos), **0 %** de sus caídas entre el 95 y el 102 % se deben al dedo (antes 17,5 % el novato y 29 % el lento), y la chance del panel coincide con lo real a ±3 puntos (antes 10 a 17 de más).
- **B:** 100 % en el primer arranque y el primer dos tiempos con los tres. **C:** 100 % hasta el 95 %, 98 % al 97 %, 57 % al 100 %, 7 % al 103 %. **D:** Largo cae al pararse (93 %), Potente arriba (98 %), Compacto repartido; entre el 97 y el 103 % los pesistas difieren hasta 34 puntos.
- Kilos que suben 9 / 5 / 2 de cada 10 veces (total): Compacto 376 / 380 / 383, Largo 377 / 382 / 385, Potente 371 / 383 / 391.
- **E** (pesistas_test, 200 finales): con rivales normales, lo que trae el panel gana el oro 55 / 58 / 64 % (Compacto / Largo / Potente), 24 a 39 puntos más que el prudente (+2 kg) y 27 a 41 más que un codicioso de verdad (pide lo que sube 3 de 10); con amistosos, 99 a 100 %. Barras caídas con el panel: 6 a 13 % (meta M ≤ 15).
- **F** (chance_test, 30 000 intentos): error ≤ 1 punto en cada «X de 10».
- **J** (ritmo_test, 360 finales por jugador): el novato que a veces no toca, final mediana 113 s, espera mediana 5,8 s, p90 13,3 s y máxima 19,9 s, intento propio p90 6,8 s (arranque) y 10,3 s (dos tiempos); el ausente, que no toca nunca, final mediana 130 s e intento p90 8,9 y 13,8 s (antes: 309 s y 45,8 s). Barras caídas con el panel: 8,9 %. Veredicto de una caída propia: tVer + 2,4 s, ahora medido.
- **H** (teclado_test y dedo_test, 10 000 secuencias): 0 sin resolver, 0 dobles, 0 sin palabra, los toques del borde anotados; Clásico suelta en el acto un dedo cancelado y `'u'` espera la gracia.
- **L** (sim_test): `sim_ref.json` y `sim_ref_facil.json` **idénticos a mvp, huella incluida**; `sim_ref_uno.json` regenerada; 1000 finales `'u'` recalculadas iguales. servidor_test: 244 controles bien.
- **Actions** (sin cambios de juego después de estos commits): pruebas.yml 43394719554 sobre `f113362`, los cuatro grupos en verde; telefono.yml 43393312835, muro.yml 43393281641 y servidor.yml 43393281668 sobre `c4fa8f8`, en verde. Capturas miradas: llamado y ¡TIRA! en Android 667×375 (el panel ya no queda debajo de los botones de arriba), «TOCA: SEGUIR» encima del botón y el cartel de los rivales debajo de la energía (Android 667×375 y Safari 844×340), tarjetas de inicio en el iPhone 667×375 en inglés (sin cortes), glosario de `'u'` en inglés, FRENO («pararse −1¼ · pesó más», «¡DA TODO! la garra te salva»), panel en inglés y línea de caída («Ran out of energy in the pull (used 3½)…»).
- check_toques (Actions, por software): 34 pulsaciones anotadas y resueltas, manejador p95 2,7 ms, acuse medido por el juego p95 77 ms (SwiftShader: nota, como antes).

**Cómo probarlo.** `cd web && python3 -m http.server 8000` y abrir `http://localhost:8000/juego.html` (con `?depura=1` se ve el acuse medido de cada toque). Elegir un pesista, confirmar con Espacio lo que trae el panel y no tocar nada: el levantamiento sale solo. Después probar machacar, mantener o tocar con calma: el resultado es el mismo. En el celular, lo mismo con el pulgar en cualquier parte de la pantalla. Lo que cambia la final es el peso que se pide y el pesista.

**Lo que queda estimado o sin medir.**
- El acuse en aparatos de verdad: Actions dibuja por software (~80 ms del evento al cuadro). Desde ahora cada `intento_propio` trae `acuse_p95_ms` del aparato de la persona; la meta I (≤ 17 ms) se confirma con esos datos.
- Las amplitudes de suerte y los cuerpos son de diseño, calibrados con bots; el tiempo real de una persona en el panel sigue estimado (2,5 s en ritmo_test).
- Sigue sin hacer: cámara lenta (meta K), magnesio del pisotón, Clásico ofrecido después de dos victorias.
- La segunda parte decía que el squat de Compacto «rinde peor desde el 100 %»: no era así (margen_cal daba +1 al 100 %). Hoy da 0 a +6 puntos y la casa sigue en tijera.
- Lo que no se tocó a propósito: los textos `pesista.*.conviene` hablan de precisión, pero solo se ven en Clásico, donde la precisión sí cuenta. Clásico también recibe el ritmo nuevo de los rivales (resumen y fila); en el navegador solo lo cubre la práctica de Clásico de check_game.
- En check_telefono aparecen notas de descargas de modelos cortadas (`requestfailed … .glb net::ERR_ABORTED`): la prueba recarga la página antes de que terminen de bajar (sin tutorial se llega antes a la recarga). No es un error del juego.

### Barrita (13-nov, noche, rama `gameplay`): el Fácil por defecto es `'b'`

Pedido del dueño: «un puntero que se mueve en la barrita; si tocás muy lejos falla, más o menos cerca regular, en el verde
perfecto. Al usuario le gusta tirar él». Diseño: `docs/JUEGO.md`, «Gameplay 3». `'u'` sigue en el núcleo (`?ctl=u`, sus
registros se recalculan igual) y Clásico no cambió. Nada publicado en Cloudflare ni fusionado a mvp.

**Cómo se juega.** El panel trae el peso del entrenador, la chance «X de 10» y el verde que vas a tener con esos kilos (una
barrita chica por barrita). Al confirmar, el pesista se agacha (PREPÁRATE, la barrita quieta) y arranca el puntero. Tocas
(Espacio/Enter o el dedo en cualquier parte de la escena) y el pesista tira **en ese instante**. Verde: ¡PERFECTO! (campanazo,
tribuna, la escena se ilumina de verde); amarillo: REGULAR (−600 de energía, la barrita tiembla); rojo: LEJOS (−1500). Queda la
marca de dónde pegaste. Arranque: una barrita (tirón). Dos tiempos: la cargada y, con la barra en los hombros (RESPIRA), el
envión. Pararse, quedar firme y la garra salen solos. Sin tocar, el puntero va más lento desde los 8 s y al minuto el pesista
tira solo como REGULAR (nunca se cae por no tocar; con mucho peso, el regular puede no alcanzar). Primera final: la
presentación en una línea y un aro punteado sobre el verde que se llena cuando el puntero pasa (una vez por dispositivo).

**Dónde está.**
- Núcleo: `rules.js → BARRA` (pasada 1,4 s, lenta 1,7 s desde 8 s, gracia 250 ms, doble 120 ms, zonas por intensidad y
  pesista, costo de cada zona, gasto ×0,9, persona típica), `posBarra`, `zonasBarra`, `zonaBarra`, `cuerpoBarra`,
  `repartoBarra` y `chanceBarra` (exacta por programación dinámica, enteros), `HUELLA_B` (registros `ctl: 'b'` con `barra:`;
  `replay.js` la exige). `attempt.js`: `this.B` y `_bContacto`/`_bPega` sobre la máquina de `'u'`; `res.uno.barras` dice zona,
  posición y si salió sola. `match.js` y `entrenador.js`: `'b'` usa `cuerpoBarra` y `chanceBarra`.
- Juego: `ui/barrita.js` (nuevo; `#barrita`, CSS al final de `juego.css`), `controles.js` (`senalB`, `QUE_B`,
  `proximoCentro`), `main.js` (`esU()` para lo que comparten `'u'` y `'b'`; la barrita en `correrIntento`, el verde del panel,
  la tarjeta con «Verde tirón / Verde envión»), `input.js` (`sinRepeticion`), `audio.js` (`subida`, `pega`),
  `stage.js` (`acercar`: la cámara se acerca a 0,93 mientras corre el puntero), textos `barra.*` en `es.js` y `en.js`.
- Pesistas (ancho del verde, `BARRA.pesistas`): Compacto parejo (1 / 1), Largo 1,25 en el tirón y 0,8 en el envión, Potente
  al revés (0,75 / 1,3). Medio ancho del verde: 170 ms con la apertura, 75 ms al 100 % (por el factor del pesista; 1,4 el primer intento
  de la primera final).

**Segunda vuelta (pedidos del dueño del mediodía).**
- **Cansancio** (`rules.js → BARRA.fatiga`, `fatigaDe`, `sumarFatiga`; `match.js` lo lleva por pesista en `a.fatiga`): cada
  intento cansa un cuarto de lo que costaron sus toques (amarillo +150, rojo +375), +250 si usó la garra y un cuarto de lo que
  quedó por debajo de ½ de energía; en pasos de 50, tope ¾ por levantamiento; del arranque pasa la mitad al dos tiempos. El
  intento siguiente empieza con esa energía de menos (`ctx.fatiga`). Se ve en el panel («Cansancio −¼» junto al verde, y la
  chance y «Te sobra» ya lo cuentan), en la energía al empezar y en la línea de caída si sin él se paraba («Venía cansado
  (−¼)»). Abrir pesado, pegar lejos o salvarse con la garra te deja más cansado.
- **Esfuerzo al pararse** (`BARRA.esfuerzo`, `pideEsfuerzo`): solo desde el 95 % y si al empezar a pararse la energía que
  quedaría sin suerte baja de 0,1, la señal ¡PÁRATE! pide 3 toques en 3 s (sin apuro: 2 por segundo alcanzan), con la barra
  que se llena y «¡VAMOS!» en cada uno y «¡DE PIE!» (pisotón) al terminar. Hecho: pararse cuesta 300 menos. No hecho: cuesta
  lo de siempre (cae solo si no alcanzaba). `chanceBarra` lo cuenta (la persona típica lo hace 95 de cada 100).
- **Enviones**: split (tijera) el más fácil, power intermedio, squat el más difícil para todos (`BARRA.envion` y
  `verdeEnvion`: gasto 0,7 / 0,85 + ¼ / 0,95 + ½, verde ×1 / ×0,9 / ×0,8; la movilidad alta solo achica la diferencia del
  squat). En «Más opciones» dice «más fácil / intermedio / más difícil»; el panel propone split.
- **Bienvenida**: la parte de arriba (`.bv-cuerpo`) se desplaza y la fila Jugar / Opciones / Cómo se juega queda fuera de ella:
  ya no tapa las tarjetas (al repintar se conserva su desplazamiento). Las tarjetas en `'b'` llevan la frase en su propio
  bloque y debajo el verde de cada barrita (en el teléfono acostado, solo la frase); en pantallas de menos de 820 px de alto,
  sin la franja de colores ni la nota del nombre. Medido en `check_barra` a 1280×720, 1280×600, 1440×700, 1800×560, 667×375 y
  844×390: las tarjetas se ven enteras sin desplazar y nada se pisa.
- El entrenador es un poco más prudente en `'b'` (9,3 de 10 en el segundo intento, 8 de 10 en el tercero). Gasto ×0,925.

**Medido** (sin navegador, `node tools/barra_bots.mjs --n=600`; perfiles: novato ±120 ms y 40 ms tarde, 5 % de despistes,
esfuerzo a 2 toques por segundo; medio ±70; bueno ±35; típico ±105, el que supone el panel). Válidos % (verde % de los toques),
dos tiempos con split:

| perfil · pesista | arr. 90 % | arr. 97 % | arr. 100 % | arr. 103 % | dt 90 % | dt 97 % | dt 100 % | dt 103 % |
|---|---|---|---|---|---|---|---|---|
| novato · Compacto | 100 (82) | 93 (56) | 64 (45) | 6 | 100 (81) | 86 (59) | 37 (42) | 4 |
| novato · Largo | 100 (87) | 97 (69) | 65 (52) | 9 | 100 (78) | 84 (57) | 37 (43) | 6 |
| novato · Potente | 100 (67) | 78 (45) | 37 (33) | 7 | 99 (77) | 79 (57) | 51 (44) | 20 |
| medio · Compacto | 100 (97) | 99 (82) | 82 (69) | 11 | 100 (96) | 97 (85) | 68 (69) | 13 |
| medio · Largo | 100 (99) | 99 (91) | 83 (78) | 15 | 100 (94) | 96 (82) | 64 (67) | 15 |
| medio · Potente | 100 (90) | 91 (72) | 52 (57) | 11 | 100 (94) | 95 (80) | 72 (67) | 37 |
| bueno · Compacto | 100 (100) | 100 (99) | 98 (97) | 18 | 100 (100) | 100 (100) | 95 (96) | 31 |
| bueno · Largo | 100 (100) | 100 (100) | 96 (99) | 21 | 100 (99) | 100 (99) | 92 (94) | 32 |
| bueno · Potente | 100 (100) | 97 (97) | 69 (89) | 18 | 100 (100) | 100 (98) | 89 (93) | 58 |

- Metas: novato con la apertura (90 %) ≥ 99 % válidos y 67 a 88 % verde; al 100 % el novato entre 37 y 65 % y el bueno
  siempre más (69 a 98 %). Verde del novato al 97 %: tirón Largo 69 / Compacto 56 / Potente 45 %; envión Potente 71 /
  Compacto 59 / Largo 46 %. Mantener, no tocar y el doble toque: 100 % al 90 %; el machacador pega en el rojo.
- Esfuerzo (novato): nunca hasta el 92 %; arranque 6 % de los intentos al 95 %, 27 % al 97 %, 66 % al 100 %; dos tiempos 0 a
  11 % hasta el 100 %. Lo hace el 93 a 97 %; con 2 toques por segundo, el 100 % (602 de 602).
- Envión al 97 % (novato, válidos): split 84 a 87 %, power 64 a 67 %, squat 38 a 55 %; el bueno, 98-99 / 88-99 / 78-98: el
  orden se cumple con los tres pesistas.
- Finales enteras con cansancio (apertura 90 %, después lo que trae el panel; rivales normales): el novato termina con total el
  100 % de las finales con los tres pesistas; válidos por intento arranque 100 / 91-97 / 77-82 % y dos tiempos 99-100 /
  88-92 / 63-75 %; cansancio medio al tercer intento ¼ (novato), ⅛ (medio), casi nada (bueno).
- `chance_test` (30 000 intentos, con cansancio de 0 a ¾ y esfuerzo): error ≤ 3,7 puntos con la persona típica (meta ≤ 5).
- `ritmo_test` (360 finales): novato, final mediana 131 s (≤ 150), espera máxima 19,9 s (≤ 20), intento propio p90 9,1 s
  arranque y 13,7 s dos tiempos (metas de `'b'` ≤ 10 y ≤ 15: la barrita y el esfuerzo), barras caídas con el panel 13,3 %
  (≤ 15). El «lento» (espera siempre al puntero lento) es informativo: final de 201 s.
- `teclado_test` y `dedo_test` (10 000 secuencias, `'b'` y `'u'`): 0 sin resolver, 0 dobles, 0 sin palabra, 0 barritas
  disparadas dos veces. `sim_test`: `sim_ref.json`, `sim_ref_facil.json` y `sim_ref_uno.json` idénticos; `sim_ref_barra.json`
  regenerada. `play_human` (`'u'`), `perf_test` y `servidor_test` en verde.
- Navegador (`check_barra`, Actions): con el reloj verdadero, entre dónde se veía el puntero al apretar y dónde lo juzgó el
  núcleo hubo 21 y 25 ms (por software); dos Espacios a 60 ms cuentan uno; cada barrita sale donde se tocó en computadora y
  teléfono, en español y en inglés.

**Actions** (13-nov, sobre `c987907` de la rama `gameplay`): pruebas.yml 43463056525 (núcleo con check_game,
teléfono, iPhone y recorrido, toques con check_fluidez, check_barra y check_toques), muro.yml 43463057206, telefono.yml
43463056930; servidor.yml 43457300744. Capturas de la barrita en el artefacto `pruebas-out-toques` (`out/barra/`): miradas en
computadora y teléfono acostado, español e inglés.

**Cómo probarlo.** `cd web && python3 -m http.server 8000` → `http://localhost:8000/juego.html` (un `tarima.ctl` guardado que
no sea Clásico abre en la barrita; `?ctl=u` vuelve a `'u'`). Sin navegador: `node tools/barra_bots.mjs`,
`node tools/chance_test.mjs`, `node tools/ritmo_test.mjs`. Con navegador (Actions, grupo «toques»): `tools/check_barra.mjs`
(computadora en español e inglés, teléfono 667×375 y 844×390; capturas en `out/barra/`).

**Apartamientos y pendientes.**
- «Los kilos que elijas deciden el resto» dice «lo demás»: `sim_test` no deja «resto» (es la palabra vieja del Resto).
- «Te sobra ¾ de energía» del panel es sin el costo del toque (si pegas en el verde) pero con el cansancio; la chance cuenta todo.
- Esperar al puntero lento es más fácil (más ms de verde): cuesta tiempo de la final, no se castiga.
- Sin medir con personas ni en un teléfono de verdad: la persona típica (±105 ms) es una estimación; cada `intento_propio`
  manda `barra_1`, `barra_2`, `barra_pos_1/2` y `barra_sola` para calibrarla con datos.
- La diferencia entre dónde se ve el puntero y dónde lo juzga el núcleo se mide en `check_barra` con el reloj verdadero; por
  software (Actions) los cuadros son largos.
- Pendiente: una chance por persona (con su propia puntería), cámara lenta en el toque, vibración distinta por zona en iPhone
  (no tiene vibrate).

### Rivales con su propia estrategia de kilos (13-nov, rama `rivales`)

Pedido del dueño: «que los otros levantadores tengan su propia estrategia de pesos, no que siempre usen lo mismo que yo».

**Diagnóstico** (`tools/rivales_test.mjs`, 500 finales por estrategia y nivel en `'b'`, el novato de `barra_bots.mjs`; y una contrafáctica: antes de cada llamado, qué pediría cada rival si el jugador hubiera declarado ±3 kg).
- No copiaban el NIVEL de kilos: la correlación entre los kilos del jugador y los de cada rival en el mismo intento es −0,19 a 0,14 con todas las estrategias (con la que pide kilos al azar, −0,15 a 0,07), y los intentos a ±1 kg del jugador (6 a 21 %; codicioso 1 a 3 %) son los mismos que con el rival de otra final. Se parecen porque los tres pesistas tienen techos a 2 kg y abren entre el 91 y el 96 %.
- Lo que se ve como espejo son los **cambios**: `decidir` con estilo «pasa» (Brenner) y «orgullo» (Marangi) declaraba un kilo más que lo que tuviera declarado otro pesista a 2 kg o menos. El 21 % de las decisiones de los rivales cambiaba si el jugador declaraba otra cosa (35 % las de Brenner, 31 % las de Marangi, 0 % Ventura), 41 a 54 % de los cambios caían justo en lo declarado por el jugador o un kilo más, y eso son 0,8 a 1,4 avisos «X pide N kg» por final. El tercer dos tiempos salía de los kilos del puntero (33 % depende de la marca del jugador). La apertura no salía de la del jugador ni el entrenador compartía plan: el amistoso solo baja 3,5 %.

**Qué cambió** (`web/js/sim/ai.js` → `PERSONALIDADES`, `planRival`, `decidirPlan`; tabla en docs/JUEGO.md 7.3). Cada rival tiene la personalidad de su ficha y un plan sembrado por final (apertura, adónde quiere llegar en el segundo y el tercero, si se guarda, si sube tras un nulo) que sale de su techo visible, su forma y su Resto. Ventura «va a lo seguro», Brenner «hace cuentas» (se guarda en el tercer arranque cuatro finales de cada diez; en el dos tiempos asegura si va primero y pide lo justo para pasar en el último si va atrás), Marangi «arriesga» (abre alto, el tercero por encima del 100 %, «va por todo»). La tabla solo cuenta en el dos tiempos y en totales; nunca miran lo declarado por otro. La palabra sale en el cartel del turno del rival («191 kg, justo · va a lo seguro») y en «Tus rivales hoy» de la presentación (claves `rival.estilo.*` en `es.js` y `en.js`).
- **Compatibilidad.** `new Partida(..., { ia: HUELLA_IA })` usa los rivales nuevos y el registro lleva `ia`; sin `ia`, los de siempre. `replay.js` rechaza otra huella (`'huella de las reglas de los rivales'`). `tools/sim_ref*.json` no cambiaron y siguen pasando; `tools/sim_ref_rivales.json` es la referencia nueva (`sim_test` 14). La lógica de `planRival`/`decidirPlan` no entra en la huella: si cambia, subir `IA.version` y borrar `sim_ref_rivales.json` para regenerarlo. `main.js` solo cambió en tres líneas (la huella al crear la Partida, el cartel del turno y la presentación). El muro no se tocó.
- `pesistas_test` y `ritmo_test` ahora juegan contra los rivales nuevos; `balance.mjs --rivales` sigue con los viejos.

**Mediciones antes → después** (novato, 500 finales por estrategia y nivel; oro del jugador):

| | Amistoso | Normal |
|---|---|---|
| Panel (entrenador) | 92 → 93 % | 24 → 29 % |
| Prudente (+2) | 90 → 91 % | 8 → 13 % |
| Fijo (93 %, +4 +3) | 94 → 92 % | 10 → 12 % |
| Codicioso | 81 → 84 % | 28 → 27 % |
| Azar | 91 → 91 % | 9 → 13 % |

- Jugador «medio» (300 finales): panel 99 → 97 % y 36 → 37 %; prudente 96 → 96 % y 10 → 17 %.
- Decisiones de rivales que cambian si el jugador declara ±3 kg: **21 % → 0 %**; con 3 kg más de marca: 5 → 4 % (la tabla del último dos tiempos). Cambios espejo por final: 0,8–1,4 → 0,02–0,12. Correlación de kilos: −0,06 a 0,17 (antes −0,19 a 0,14): baja antes y después, no era ahí el espejo. Distancia media al jugador en el mismo intento: 4 a 7 kg (codicioso 9 a 13).
- Rivales en Normal (total medio ± desvío · válidos): Ventura 372 ±3,8 · 88 %, Brenner 371 ±4,2 · 81 %, Marangi 376 ±7,1 · 77 % (antes 371 · 86 %, 372 · 66 %, 374 · 76 %). En Amistoso, sin marca: Ventura 3 %, Brenner 5 %, Marangi 12 % (antes 4, 20 y 6 %).
- Variedad: 8 a 11 aperturas de arranque distintas por rival y 305 a 322 planes distintos cada 333 finales.
- `pesistas_test` ('u', rivales normales, panel): Compacto 46 %, Largo 50 %, Potente 67 % (antes 55 / 58 / 64); parejos 22 puntos (meta ≤ 25), E en verde. Quien elige Potente enfrenta a Ventura y Brenner, los dos más previsibles: es el par más fácil.

**Pruebas.** Sin navegador, de a una en la Mac: `sim_test` (14 secciones; las referencias viejas sin cambios), `rivales_test`, `pesistas_test`, `ritmo_test`, `chance_test`, `play_human`, en verde. Actions, pruebas.yml sobre `rivales` (run 43462071474): núcleo (con `rivales_test`, nuevo paso), teléfono, iPhone y recorrido en verde; falla `check_barra` (tarjetas que «tapan» y barrita angosta en 1280×720), igual que en `gameplay` en 026e385 (run 43452015428), sin relación con los rivales. La primera corrida (43459362229) encontró que la línea nueva de la presentación no entraba en Safari 844×340: la palabra va en la misma línea que la apertura y en el teléfono acostado se oculta. Capturas miradas: «Tus rivales hoy» con «hace cuentas» y «arriesga», y el cartel «Turno de Ilya Brenner (rival) · 154 kg, cómodo · hace cuentas».

**Pendientes.** Las personalidades van atadas al pesista: quien juega con Ventura nunca enfrenta al conservador. Marangi casi nunca queda sin marca en Normal (1 %): «a veces se queda sin marca» se ve en Amistoso. El tercer dos tiempos que reacciona a la tabla todavía cae algunas veces en un kilo más que el jugador (0,1 por final con el plan fijo): es la cuenta del total, no una copia. Jugarlo y mirar si las palabras se leen en el cartel del turno del teléfono.

### Carteles en el teléfono (13-nov, tarde, rama `gameplay`)

Pedido del dueño: «en mobile los carteles me tapan mucho al pesista» y «menos ruido visual: el user entra, juega con el setup
mínimo y ya». Todo en CSS al final de `web/css/juego.css` (bajo `html.juego-u`, que main.js pone en 'b' y 'u'; Clásico no
cambia) y `html[data-pantalla]` (lo pone `visita`). Vale para teléfono y computadora.
- **Durante el intento propio**: sin título del evento, reloj, marcador, cambios de los rivales ni zócalo; la energía, chica
  arriba a la izquierda; la barrita pegada abajo (en el teléfono, del borde al botón redondo, sin verbo: el botón dice TOCA;
  el nombre de la barrita y ¡PERFECTO! encima, a la izquierda); la ayuda de primera vez arriba a la derecha; AGUANTA y ¡ABAJO!
  no se muestran; el esfuerzo de pararse a la izquierda, a media altura.
- **Veredicto** a la izquierda, a media altura y semitransparente; con él no hay marcador ni cambios de rivales. Un rival en
  'b' muestra solo la causa si falla (las luces ya están arriba).
- **Turno del rival** en una línea arriba a la izquierda, sin «mira o toca para saltar» (lo dice «Toca: seguir») y sin
  llegar a los botones de sonido, pausa y ayuda; el marcador debajo.
- **Llamado**: sin selector de idioma, sin zócalo, sin la línea de la garra, «sin apuro» ni «lo más duro» en 'b'.
- **Bienvenida**: Jugar grande; Opciones, Cómo se juega y Privacidad como enlaces chicos; sin título del evento ni reloj;
  tarjetas solo con una frase corta. Nombre opcional y pesista elegido: un toque y se juega.
- **Medición** (`tools/tapa.mjs`, nuevo, en `check_barra` y `check_telefono`): caja del pesista proyectada desde three
  (`stage.js → cajas()`: cuerpo, torso y barra) contra las cajas de la interfaz visible (opacidad > 0,5) y los textos a la
  vista. Falla si tapa más del 15 % del cuerpo con la barrita (quieta, corriendo, recién tocada) o en el levantamiento, o más
  del 20 % del torso en el llamado. `TAPA_INFORMA=1`: solo informa.

| Cuerpo tapado (textos a la vista) | antes | después |
|---|---|---|
| Teléfono 667×375 · barrita corriendo | 64–77 % (13) | 0 % (5) |
| Teléfono 844×340 (Safari con barra) · corriendo | 65 % (13) | 15 % (5) |
| Teléfonos 740×360, 844×390, 932×430 · corriendo | 40–71 % (12–13) | 0–13 % (4–5) |
| Teléfonos · barrita quieta | 27–50 % (12–13) | 0–8 % (4–5) |
| Teléfonos · levantamiento | 35–43 % (11–12) | 0–15 % (4–5) |
| Teléfonos · veredicto propio | 35–37 %, torso 69 % (16) | 3–4 %, torso 0 % (13–15) |
| Teléfonos · turno del rival | 6–22 %, torso 21–54 % (17) | 0–3 %, torso 0 % (15) |
| Teléfonos · llamado | 6–13 %, torso 0 % (25) | 0 %, torso 0 % (18) |
| Computadora · llamado | 1–2 %, torso 0 % (33) | 0 %, torso 0 % (22) |
| Computadora 1280×720 · corriendo / levantamiento | 27 % / 23 % (14 / 12) | 0 % / 0 % (6 / 4) |
| Computadora · veredicto propio | 22–24 %, torso 52 % (16) | 1–2 %, torso 0 % (14) |
| Bienvenida en el teléfono | 18 textos, 3 botones grandes | 16 textos, 1 botón grande (Jugar) |

La barra (con los discos) queda tapada 15–17 % en el teléfono durante la barrita (la pista pasa por debajo de los discos) y
0–8 % en la computadora. Presentación y apertura (antes de la primera barra) siguen tapando al pesista: son paneles.

### Dificultad (13-nov, tarde, rama `gameplay`)

Pedido del dueño: «si es fácil así está bien; si es un poco más difícil, que requiera un poco más de interacción a nivel tocar
espacio». Diseño y tabla de parámetros: `docs/JUEGO.md`, G3.D. Se elige solo en Opciones (fila «Dificultad: Fácil · Medio ·
Difícil · Clásico»; no en la bienvenida, por pedido de menos ruido), queda en `tarima.dificultad` (`?dif=` para pruebas), Fácil
por defecto. Difícil trae rivales parejos salvo que se hayan elegido a mano. `dificultad` es súper propiedad de la analítica
(`analitica.propiedades`) y va en `final_inicio` e `intento_propio` (más `barra_3`).
- **Fácil** = lo de antes, bit a bit (`sim_ref*.json` idénticos, `HUELLA_B` igual).
- **Medio**: barrita de atrapar arriba en el arranque y de pararse en el dos tiempos, puntero de 1,2 s, verde 80 %, esfuerzo
  desde el 92 % con 5 toques en 3 s. **Difícil**: barrita en cada fase (tirón, atrapar, pararse; cargada, pararse, envión),
  puntero de 1,0 s sin ponerse lento, verde 65 %, esfuerzo desde el 88 % con 6 toques en 3 s.
- Núcleo: `rules.js → NIVELES_B`, `reglasB`, `HUELLAS_B` (registro con `dif` y su huella; `replay.js` rechaza otro nivel o
  huella), fase `'barra'` en `attempt.js` para atrapar y pararse (el pesista quieto en el fondo; sin tocar, al minuto sale
  regular). Referencia nueva `tools/sim_ref_dificultad.json` (sim_test 15).

**Medido** (sin navegador; `barra_bots --n=400`, válidos % con la apertura sugerida / al 97 % / al 100 %; arranque · dos tiempos):

| perfil | Fácil (90 %) | Medio (89 %) | Difícil (88 %) |
|---|---|---|---|
| novato Compacto | 100/94/61 · 100/85/35 | 100/86/33 · 100/69/11 | 100/61/11 · 100/62/8 |
| novato Largo | 100/98/65 · 100/85/36 | 100/92/34 · 100/57/11 | 100/59/9 · 100/50/6 |
| novato Potente | 100/78/36 · 99/80/50 | 100/53/16 · 100/66/30 | 100/45/11 · 100/59/23 |
| medio Compacto | 100/99/82 · 100/98/67 | 100/98/59 · 100/91/40 | 100/96/40 · 100/90/31 |
| medio Largo | 100/99/84 · 100/96/62 | 100/99/66 · 100/88/31 | 100/95/38 · 100/86/28 |
| medio Potente | 100/89/50 · 100/95/72 | 100/77/35 · 100/88/52 | 100/71/26 · 100/85/47 |
| bueno Compacto | 100/100/97 · 100/100/95 | 100/100/89 · 100/100/79 | 100/100/81 · 100/100/70 |
| bueno Largo | 100/100/96 · 100/100/93 | 100/100/93 · 100/99/79 | 100/100/78 · 100/99/65 |
| bueno Potente | 100/96/68 · 100/99/89 | 100/92/54 · 100/99/82 | 100/89/45 · 100/97/76 |

- Metas: con la apertura, Medio novato 100 % (≥ 90) y medio 100 % (≥ 95); Difícil novato 100 % (≥ 75) y bueno 100 % (≥ 95);
  en los tres el bueno le gana al novato por 15 puntos o más al 100 % (y 25 sumando 97 y 100).
- Oro en finales enteras (lo que trae el panel; «lee» = el entrenador con la puntería propia, cambiando kilos con ← →):
  Fácil contra tranquilos novato 87 %, contra parejos bueno 25 % (lee 76 %); Medio contra tranquilos novato 59 %, medio 80 %,
  bueno 88 %; Difícil (parejos) bueno 4 % con el panel y **44 % si pide lo que su puntería permite**, novato 0 %.
- Esfuerzo a ritmo cómodo: 2, 2,5 y 3 toques por segundo alcanzan siempre (Fácil, Medio, Difícil).
- `chance_test` (30 000 intentos por nivel): error máximo por grupo 1,9 / 2,2 / 4,2 puntos (meta ≤ 5). La persona típica del
  panel: ±105 / ±100 / ±90 ms.
- `ritmo_test` (novato, 360 finales por nivel): final mediana 131 / 140 / 141 s (metas ≤ 150 / 165 / 180), intento propio p90
  8,8 · 13,7 / 11,3 · 15,3 / 13,1 · 14,6 s, barras caídas con el panel 14,8 / 16,7 / 23,5 % (metas ≤ 15 / 18 / 25), espera
  máxima 19,4 / 20,0 / 20,2 s (metas ≤ 20 / 21 / 21: en Medio y Difícil hay más turnos de rivales seguidos).
- `teclado_test` y `dedo_test` (10 000 secuencias por nivel): 0 sin resolver, 0 dobles, 0 barritas con dos contactos.
- `sim_test` (15 secciones), `pesistas_test`, `rivales_test`, `play_human`, `servidor_test`: en verde.

**Actions** (sobre `35da06a`, todo en verde): pruebas.yml 43485459305 (núcleo, toques con check_barra en los tres niveles,
teléfono, iPhone y recorrido), telefono.yml 43485459388, muro.yml 43485459235; servidor.yml 43478579221 (sobre `e4f8ac8`). El
antes de la tabla de carteles se midió en una rama temporal (`medir-antes`, ya borrada) con el juego de `483b3d7` y la misma
herramienta (corridas 43476794242, 43476802773 y 43479846657). Capturas miradas: teléfono acostado y computadora, en español e
inglés, Fácil, Medio y Difícil (atrapar con la barra arriba, pararse desde el fondo, Opciones, turno del rival, veredicto).

**Pendiente.** En Difícil el panel propone kilos para la persona típica y quien apunta bien tiene que subirlos a mano para
ganar (una chance por persona sigue pendiente). Medio y Difícil se midieron con bots, no con personas. Los metas de ritmo de
Medio y Difícil (espera ≤ 21 s, caídas ≤ 18 y ≤ 25 %) son nuevas y propias de esos niveles.

### Carga: pantalla de carga y modelos comprimidos (13-nov, rama `carga`)

Pedido del dueño: tarda en cargar (2/3 de los jugadores en el celular, muchos con datos móviles) y mientras carga se ve feo.

- **Modelos** (`tools/comprimir_modelos.sh`, hay que correrlo después de `export_web.py`; `build.sh` lo hace solo). Antes
  `web/models` pesaba 23,7 MB y el juego bajaba todo. Ahora:

  | archivo | antes | después |
  |---|---|---|
  | `ventura.glb` (visor, Alta/Media) | 11,12 MB | 6,19 MB |
  | `brenner.glb` | 10,02 MB | 5,58 MB |
  | `ventura_1024.glb` (juego en Baja/Móvil) | — | 3,43 MB |
  | `brenner_1024.glb` | — | 3,03 MB |
  | `ventura_mask` PNG → WebP 1024 sin pérdida | 1,31 MB | 0,25 MB |
  | `brenner_mask` | 1,22 MB | 0,24 MB |

  Qué pesaba: geometría y animación ~6,8 MB por GLB (posición/normal/UV/pesos en float32, morphs correctivos dispersos,
  1,4 MB de claves) y ~4,3 MB de texturas JPEG (normal y ORM del cuerpo a 2048). Geometría: meshopt con filtro exponencial
  sobre float32 (posiciones a <0,05 mm, normales a 0,03°, rotaciones a 0,002°), sin cuantizar posiciones (athlete.js usa
  las matrices de enlace y mide metros por UV), índices/JOINTS/tiempos sin pérdida, pelo y pestañas sin reordenar. Texturas
  del liviano a 1024: el juego en automático arranca en Baja o Móvil (`tex: 1024`) y ya las achicaba al cargar; color y
  pelo en WebP, normal y ORM en JPEG 4:4:4. Verificado además con el lector de gltf-transform: mismos 56 nodos, 53
  articulaciones, morphs `corr_*`, acción `Poses` con 160 canales (diferencia máxima 1,5e-5, tiempos idénticos).
- **Lo que baja el juego** (`tools/check_carga.mjs`, teléfono 844 × 390, sin caché): 24,63 MB → 7,94 MB. Modelos bajados,
  antes → después: con 4G (9 Mbps, 85 ms) 33,2 → 21,6 s (run 43455353457) y 39,4 → 27,7 s (run 43459886954); con red
  lenta (1,6 Mbps, 150 ms) 133,7 → 51,3 s y 138,0 → 55,6 s; última corrida (run 43461772198): 34,5 → 21,0 s y
  135,0 → 52,1 s. La bienvenida sale a los 12–21 s en el runner en los dos
  casos: ahí manda el dibujo por software, no la red. El primer cuadro salió 0,1–0,4 s más tarde que antes (más CSS y el
  SVG animado dibujados por software; el SVG ya no está).
- **Pantalla de carga** (`#msg`, `web/js/game/ui/carga.js`, `web/css/carga.css`): ~~un pesista de costado que hace un arranque
  en bucle~~ (sacado el 13-nov a la noche a pedido del dueño: «le sacaría el pesista ese que hiciste que no me gustó»; se
  borró `tools/carga_svg.py` y la marca TARIMA quedó más grande en su lugar), luz de tarima que respira, barra con
  los bytes reales de los GLB y máscaras (porcentaje y «0,4 / 7,0 MB»), y una frase cada 4,2 s: cómo se juega y 11 datos de
  halterofilia (claves `carga.como` y `carga.dato_1..11`). `carga.js` se carga aparte con `async`, antes que three.js; el HTML
  ya muestra la pantalla antes de cualquier JavaScript. La bienvenida ya salía antes de que bajaran los modelos: ahora,
  detrás de ella, una barrita de 3 px arriba muestra el avance, y si se toca «Jugar» antes de tiempo vuelve la pantalla con
  la barra y las frases. Movimiento reducido: sin fundidos. Capturas en el artefacto
  `carga-medir` (667 × 375, 844 × 390, escritorio en inglés, movimiento reducido).
- **Visor antes y después** (`carga.yml`, run 43455353457, `check_viewer` en los dos lados, 141 capturas cada uno): verdes;
  caras, pelo, barba, piel, manos, zapatillas y discos iguales a la vista (diferencia media por píxel 1,2 de 255; lo más
  distinto son cuadros tomados en plena reproducción). Dos diferencias medidas: (1) los metros por unidad de UV del cuerpo
  (escala del mosaico de poros y trama) pasan de 1,81 a 1,78 en Ventura y de 1,88 a 1,84 en Brenner: `metersPerUv` toma la
  mediana de una muestra de triángulos y el reordenado cambia cuáles; es un 2 % en un mosaico de 12 mm, invisible.
  (2) `check_viewer` avisaba «el índice 0 del envión no duplica el último de la cargada (huesos 1,0°)»: no era una pose
  distinta sino cuaterniones a 4e-5 de la unidad (`angleTo` de un cuaternión consigo mismo da 1° si no es unitario);
  athlete.js ahora normaliza al muestrear; en la segunda corrida (run 43464414582) el aviso ya no sale y los avisos son
  los mismos 5 de antes. Esa corrida quedó en rojo en los DOS lados (también con los modelos viejos) por pedidos de GLB
  abortados (`requestfailed ... net::ERR_ABORTED`, páginas que se cierran mientras baja un modelo): falla intermitente de
  `check_viewer` en el runner, no de la compresión. Juego (`pruebas.yml`, runs 43456941473 y 43459952561): núcleo, teléfono,
  iPhone/recorrido, check_fluidez, check_toques y capturas en verde; las capturas con el 3D salen iguales a las de
  `gameplay` (diferencia media 0,15 de 255 en las escenas quietas). `check_barra` falla igual que en `gameplay` 026e385
  (tarjetas y barrita en 1280 × 720: trabajo en curso de la barrita, no de esta rama).
- **Pendiente / sin medir**: Pages manda los GLB y WebP con `max-age=0, must-revalidate` (cada visita revalida; un
  `_headers` con caché más larga obligaría a cambiar el nombre de los archivos en cada exportación). KTX2 no se probó (pide
  el transcodificador de Basis, ~0,5 MB, y athlete.js achica y suelta las texturas en un lienzo). Nada de esto se probó en
  un teléfono real: los tiempos son del runner con la red emulada.

### Todo verde, la barra sube; carga sin pesista (13-nov, noche, rama `gameplay`)

Dos pedidos del dueño después de probar todo («está todo perfecto» salvo esto), antes de publicar:

1. **Pantalla de carga sin el pesista**: «le dejaría la pantalla de carga, le sacaría el pesista ese que hiciste que no me
   gustó». Fuera el SVG de `juego.html`, sus animaciones de `carga.css` y `tools/carga_svg.py`. Quedan el fondo, la luz que
   respira, la marca TARIMA (más grande: es lo único arriba), la barra con los bytes y las frases. `check_carga` revisa que
   la pantalla no tenga ningún dibujo (`svg`, `img`, `canvas`) y que nada se pise ni se salga en 667×375, 844×390 y 1280×720.
2. **La incongruencia**: «tocás espacio, llega perfecto y capaz se le cae la barra». Regla nueva (`rules.js → BARRA.verdeSalva`,
   `BARRA.version` 1.1; en los tres niveles):
   - **Si todas las barritas de un levantamiento salen en verde, la barra sube siempre.** Ni la energía, ni la suerte del tramo,
     ni el cansancio la tiran.
   - Mientras todo lo jugado va en verde, un tramo que se queda sin energía se completa igual: la energía queda en 0, la garra
     no se gasta y la energía dice «tirón −1 · ¡lo salva el verde!». Lo que faltó cansa igual (`res.uno.protegido`; `fatigaDe`
     lo cuenta como si hubiera faltado).
   - El esfuerzo de pararse **no aparece** mientras todo va en verde (no podría hacerla caer): el pesista se para solo y ese
     tramo cuesta lo mismo que con el esfuerzo hecho (`res.uno.esfuerzo_solo`; la energía dice «pararse −½ · ¡de pie!»). Se eligió
     esto y no el «¡DE PIE!» automático porque no toca la interfaz del esfuerzo y deja la energía igual de justa que si se
     hubiera hecho.
   - Con una barrita amarilla o roja (o una que salió sola, que es regular) vuelven las reglas de siempre desde ese tramo
     (garra incluida). Las caídas siempre tienen un toque que falló y la línea lo nombra con su barrita: «173 kg es el 99 % y
     pegaste en el amarillo en el envión (−½): se quedó sin energía en el envión» (con dos: «el amarillo en la cargada y en el
     rojo en el envión»). Claves `explica.b.toque`, `explica.b.y`, `barra.en.*`; se borraron `explica.b.verde*` (ya no puede pasar).
   - Por encima del techo el verde se cierra (antes se quedaba en ±60 ms al 103 % y seguía así; con la regla, cualquiera que
     pegue bien levantaría cualquier peso): `BARRA.tI/tVerde` = ±75 ms al 100 %, ±30 al 103 %, nada al 106 %. Hasta el 100 % no
     cambió nada.
   - `chanceBarra` lleva en la programación dinámica «todo verde hasta acá» (incluye la probabilidad de todo verde); el panel
     «X de 10» y el entrenador la usan. Panel sin llegar en 'b': «Te falta ½: con todo en verde sube igual». Ayuda y «Cómo se
     juega» lo dicen («Todo en verde: la barra sube siempre»).
   - Huellas nuevas: `HUELLA_B` (Fácil) y las de Medio y Difícil (`HUELLAS_B`) cambian con la versión. `sim_ref_barra.json` y
     `sim_ref_dificultad.json` regeneradas; `sim_ref_rivales.json` regenerada porque 3 de sus 9 partidas son de 'b' (cambió una, la
     semilla 28000012; las de 'c' y 'u' iguales). `sim_ref.json`, `sim_ref_facil.json` y `sim_ref_uno.json` idénticas.

**Medido** (`barra_bots --n=400`; válidos % con la apertura sugerida / al 97 % / al 100 %; arranque · dos tiempos). Hasta el
100 % casi igual que antes (la regla solo salva intentos todo verde que se quedaban sin energía, y muchos de esos ya los salvaba
la garra):

| perfil | Fácil (90 %) | Medio (89 %) | Difícil (88 %) |
|---|---|---|---|
| novato Compacto | 100/94/62 · 100/85/35 | 100/86/33 · 100/69/11 | 100/61/11 · 100/62/8 |
| novato Largo | 100/98/67 · 100/85/36 | 100/92/34 · 100/57/11 | 100/59/9 · 100/50/6 |
| novato Potente | 100/79/46 · 99/80/52 | 100/54/18 · 100/66/30 | 100/45/11 · 100/59/23 |
| medio Compacto | 100/99/82 · 100/98/67 | 100/98/59 · 100/91/40 | 100/96/40 · 100/90/31 |
| medio Largo | 100/99/86 · 100/96/63 | 100/99/66 · 100/88/31 | 100/95/39 · 100/86/28 |
| medio Potente | 100/92/65 · 100/95/74 | 100/77/40 · 100/88/52 | 100/72/28 · 100/85/48 |
| bueno Compacto | 100/100/97 · 100/100/95 | 100/100/89 · 100/100/79 | 100/100/81 · 100/100/70 |
| bueno Largo | 100/100/99 · 100/100/94 | 100/100/94 · 100/99/80 | 100/100/78 · 100/99/65 |
| bueno Potente | 100/99/93 · 100/100/96 | 100/94/69 · 100/99/87 | 100/89/53 · 100/97/77 |

Al 103 %: Fácil bueno 44–67 % arranque y 35–48 % dos tiempos (antes 18–21 y 31–58), novato 15–22 y 4–12; Medio y Difícil, el
bueno 2–24 %, el novato 0–4 %.

**Todo verde** (% de los intentos con todas sus barritas en verde, los tres pesistas juntos; apertura / 97 / 100 / 103 %):

| perfil | Fácil arr. · dt | Medio arr. · dt | Difícil arr. · dt |
|---|---|---|---|
| novato | 77/57/42/19 · 62/32/16/4 | 39/18/9/1 · 23/7/2/0 | 9/3/1/0 · 9/2/1/0 |
| típico (panel) | 84/64/49/22 · 70/40/22/6 | 51/25/13/2 · 36/12/4/0 | 19/6/2/0 · 19/6/1/0 |
| medio | 95/82/68/31 · 90/67/42/11 | 74/43/28/4 · 68/29/11/2 | 36/12/4/0 · 34/12/4/0 |
| bueno | 100/99/95/57 · 99/98/89/35 | 99/89/71/18 · 98/84/57/8 | 88/55/30/2 · 88/52/27/3 |

Intentos todo verde que se quedaban sin energía (los salva el verde): 0–6 % hasta el 97 %; al 100 %, Fácil novato 20 % del
arranque y 5 % del dos tiempos, bueno 44 y 28 %. Ninguna caída con todo verde en ninguna casilla (`barra_bots` lo exige).

- Metas: la de Fácil «novato al 100 % entre 30 y 65 %» pasa a **30 a 70** (Largo en el arranque da 67 %). Las demás, iguales y
  en verde. Oro en finales: Fácil amistoso novato con el panel 89 % (antes 87), normales bueno que lee su puntería 87 % (76);
  Medio amistoso novato 60 % (59); Difícil bueno que lee 48 % (44), novato 0 %.
- `chance_test` (30 000 intentos por nivel): error máximo por grupo 2,0 / 2,9 / 3,7 puntos (meta ≤ 5). `ritmo_test` (novato):
  final mediana 131 / 140 / 141 s, barras caídas con el panel 14,1 / 16,4 / 23,7 % (metas ≤ 15 / 18 / 25). `pesistas_test`,
  `rivales_test`, `dedo_test`, `teclado_test`, `play_human`, `servidor_test`: en verde, de a una en la Mac.
- `sim_test` (nuevo: 270 intentos al 99–103 % con el puntero en el centro, cansancio de 0 a ¾ y
  los tres niveles: todos válidos, 242 salvados por el verde; la chance de quien siempre pega en el verde es 10 de 10; toda
  caída de 'b' nombra zona y barrita de cada toque que falló en los dos idiomas), `check_game` (el tercer arranque, 25 kg de
  más pegando en el amarillo, cae con «pegaste en el amarillo en el tirón»; captura `caida_amarillo`).

### Tablero y menos cortes (13-nov, noche, rama `tablero`)

Pedidos del dueño: «hay muchos cortes cuando un pesista termina de tirar», «un mini tablero que me diga cuánto peso eligen los
otros pesistas, más enfoque de competencia y estrategia», «quiero ver el levantamiento completo de mi rival, aunque lo pueda
saltar, con un botón» y «tener el RM del pesista a mano al elegir el peso». Nada fusionado a mvp ni publicado.

- **Medición** (`tools/cortes.mjs`, en `check_recorrido`): el juego anota cada corte a la vista en `JUEGO.E.cortes`
  (`stage.js → _vigilar`: la cámara salta más de 0,5 m, 10° o 4° de lente entre dos cuadros, cambia el pesista sin fundido, o la
  barra o la cadera saltan) y cada fundido en `JUEGO.E.fundidos`; un observador en la página anota cada cartel o panel que
  aparece (visible de verdad) y cuánto dura. Informe por final y en las ventanas entre levantamientos; `out/recorrido/cortes.json`.
- **Cámara sin cortes**: `CameraRig.suave(seg)` (cameras.js) va de la cámara de este cuadro a la nueva con aceleración y frenado;
  `escena.camara(clave, suave)` y `primerPlano(clave, encuadre, suave)`. El acomodo del intento, la caída, el giro al público y
  el plano del llamado son movimientos suaves; un rival que no decide nada se ve entero desde la cámara general, sin moverla.
  Detrás de un panel se dibuja mientras dura el movimiento. Movimiento reducido: cortes como antes.
- **Fundidos** (`fundido`, `pasarA` en main.js; `RITMO.fundido` 120 + 200 ms): el cambio de un pesista a otro (y la entrada a la
  repetición) pasa con la imagen tapada. El veredicto queda a la vista hasta ese fundido (`mantener`, `limpiarVeredicto`): la
  barra termina de caer y el texto se va con el negro; veredicto y paso al siguiente son un solo momento. Sin «X aprieta los
  dientes», sin avisos sueltos de cambios, sin cartel «Turno de…», sin zócalo ni etiqueta en 'b'/'u'.
- **Rival entero y «Saltar»** (`RITMO.rival`): siempre desde poco antes de que agarre la barra, las fases de espera ×4, veredicto
  ≤ 2,2 s y repetición de 1,8 s solo si cae un decisivo. Botón «Saltar» (abajo a la derecha; en el teléfono acostado donde está
  el botón redondo, del mismo tamaño) con la tecla **S** (`TECLA_SALTAR`; no choca con Espacio/Enter, Esc = pausa, H = ayuda,
  flechas = kilos). Saltar: fundido corto al final del intento y veredicto de 0,8 s. Espacio y los toques en la escena ya no
  saltean nada de un rival (quedan anotados «espera» y el botón late). `rival_salteado` lleva `via` (`boton`/`tecla`), `momento`
  (`intento`/`veredicto`/`repeticion`), `ms` y `decisivo`.
- **Tablero** (`ui/tablero.js → datosTablero` puro, `tableroVivoHTML`; `tablero()` en main.js): reemplaza al marcador, al cartel
  del turno y a los avisos de cambios. Una fila por pesista en el orden en que levantan (`ordenSalida`, la misma regla que
  `match.js`), con puesto, bandera y nombre (el jugador resaltado en dorado y «(tú)»), su mejor marca (arranque; en el dos
  tiempos arranque, dos tiempos y total), lo que pidió para su próximo intento («antes 163» en dorado si lo cambió), los
  intentos hechos (blanco, rojo, el que va) y «Ahora» / «Sigue» / «Terminó». Al pie: quién va ganando (lo de `ui/marcador.js`)
  y la estrategia del rival que importa: «Brenner pidió 165 · sale después de ti · para pasarte necesita 167» o «Brenner va
  por 154 · si lo levanta, te pasa» (`Partida.paraPasar`). En la computadora: arriba a la izquierda, con «tu RM» en tu fila y la
  personalidad de cada rival («hace cuentas») o su apuesta («justo») en la suya; durante el levantamiento propio y con la
  energía a la vista, chico, atenuado y abajo a la izquierda (nombre, marca, pedido). Teléfono acostado: versión compacta
  (nombre, marca, pedido, estado y una línea de estrategia); en el levantamiento propio no va. Queda quieto durante un turno
  (el resultado del rival se calcula antes de mostrarlo) y se pone al día con el veredicto. En el llamado, el plano del pesista
  se encuadra debajo del tablero (`encuadreLibre`). En el intervalo y el podio no va (la tabla completa está en el panel).
- **RM** en el panel del llamado ('b'): una línea «Medio · 92 % de tu RM (163 kg) · 8 de 10» en lugar de la energía que sobra
  (el verde de cada barrita y el cansancio siguen debajo). RM = el techo de la ficha en ese levantamiento (`f.techo`, el que ve
  la tarjeta); la dificultad sale de la chance del panel (`dificultadDe`, ui/mensajes.js): **9-10 de 10 Fácil, 7-8 Medio, 4-6
  Difícil, 0-3 Muy difícil**, así nunca contradice al «X de 10» (que ya cuenta cansancio, energía y verde). Con el cuerpo de cada
  pesista y sin cansancio, el 90 % del RM es Fácil y el 103 % Muy difícil (sim_test 16). En la tarjeta de la bienvenida:
  «RM: arranque 120 · dos tiempos 150»; en el glosario, «RM».

**Medido** — check_recorrido (Actions, misma semilla, 1745×845, Fácil, sin tocar entre levantamientos):

| por final (del primer llamado al podio) | antes (`af1f5e7`) | después, mirando todo | después, saltando cada rival |
|---|---|---|---|
| duración de la final | 117 s (rivales resumidos solos) | 172 s | 108 s |
| cortes bruscos de imagen | 58 (cámara 56, pesista 14, barra 6, pose 5) · 29,7/min | **0** | **0** |
| fundidos | 0 | 20 | 32 |
| carteles y paneles que aparecen | 132 · 67,6/min | 68 · 23,8/min | 59 · 32,8/min |
| entre levantamientos: cortes / carteles por ventana | 2,4 / 5,9 | 0 / 2,4 | 0 / 2,9 |
| entre levantamientos: carteles de menos de 1 s | 28 | 4 | 25 (el veredicto de 0,8 s del rival saltado) |

Lo que queda de menos de 1 s mirando todo son el panel del llamado cuando el bot confirma en 0,9 s y «Desplazado»; los
«AGUANTA» / «¡ABAJO!» del levantamiento propio (no son entre levantamientos) siguen apareciendo en el cartel. Antes, por ventana:
marcador, etiqueta «Para pasar al frente», turno, zócalo, «X aprieta los dientes», veredicto de 0,5 s del resumen y «seguir».
El antes se midió en una rama temporal (`tablero-antes`, ya borrada) con el juego de `af1f5e7` y el mismo `cortes.mjs`
(corrida 43526994604).

`ritmo_test` (360 finales por nivel, novato; en Actions): **saltando cada rival al segundo**, final mediana 126 / 136 / 138 s,
espera p90 12,2 / 12,7 / 14,2 s y máxima 17,1 s en los tres (Fácil / Medio / Difícil; antes 131 / 140 / 141 s y máxima 19,4 /
20,0 / 20,2 s). **Mirando todo** (informativo): final mediana 195 / 205 / 206 s, espera máxima ~60 s; cada turno de rival, con
su fundido, 8,2 s de mediana y 11,6 s como mucho (meta ≤ 12 s). `sim_test` 16 (tablero: la fila «Ahora», «si lo levanta, te pasa» que se cumple, `paraPasar` mínimo, sin llaves en
los dos idiomas; dificultad monótona con la chance), `rivales_test`, `servidor_test`: en verde.

**Actions** (sobre `721ae7f`, todo en verde): pruebas.yml 43526986388 (núcleo, toques con check_barra y check_toques,
teléfono, iPhone y recorrido, con `check_recorrido --salta` nuevo), telefono.yml 43526986355, muro.yml 43527022537,
servidor.yml 43527027056. Capturas miradas: computadora 1280×720 (es/en) y 1745×845, teléfono 667×375 y 844×390: el tablero en
el llamado, en el turno del rival y en el veredicto, chico durante la barrita, «Saltar» / «Skip S», la línea del RM y las
tarjetas con el RM. tapa.mjs: turno del rival 0–1,5 % del cuerpo tapado (meta nueva ≤ 15 %), llamado 0 %; los textos a la vista
suben (llamado 32–39, veredicto 10–30) por el tablero.

**Pendiente.** Verlo en un teléfono de verdad (la compacta del tablero en 667×375 y el botón «Saltar» con el pulgar). Mirar con
datos (`rival_salteado`) cuántos miran a los rivales enteros. El RM es el de la ficha: la «forma del día» y el cansancio no lo
cambian (sí la chance y la dificultad). Clásico también usa el tablero y el botón (no tiene el «Toca: seguir» de los rivales).

### Regla del muro que se publica el 17-nov: la de producción (rama `v-integra`)

Decisión del dueño del 17-nov: «Que por ahora siga así como está el muro, después del snatch.» `worker/wrangler.jsonc`
trae por defecto `GRATIS_ETAPA "arranque"`, `GRATIS "1"`, `TOPE_IP "6"`, `BONO_ENCUESTA "0"`, `ENCUESTA_LIBRE "0"`: el
arranque gratis, el muro al terminarlo, correo obligatorio, encuesta opcional después de anotarse. La regla de LIF-53 (la
primera final entera y el cartel con correo o 2 preguntas, sección siguiente) queda en el código y probada, apagada: se
prende con `GRATIS_ETAPA "final"` y `ENCUESTA_LIBRE "1"` y publicando el Worker; el cliente no cambia. Las pruebas tienen la
de producción como valor por defecto y la de LIF-53 con variables explícitas (`tools/check_muro_medio.mjs` y
`tools/check_muro.mjs`; lo mismo en `worker_test`, `servidor_test` y `worker/test/worker.test.js`). Detalle, lo que cambia
igual para el jugador (bienvenida sin tarjetas la primera vez, nombre de 4 letras, textos «Lifting Game», eventos) y lo
pendiente (`web/privacidad.html` 2026-11-g describe la encuesta como camino del cartel, que hoy no es cierto) en
`docs/MVP.md`, «Regla del muro que se publica el 17 de noviembre». Publicar primero el Worker y después el sitio.

### Primera vez, el cartel con dos caminos y la carga que no se cuelga (15-nov, rama `primera-vez`; LIF-53, LIF-46, LIF-33)

Detalle completo (regla, textos, eventos y el embudo de PostHog) en `docs/MVP.md`, «Cambio del 15 de noviembre».

**Decisiones del 15-nov.** Del dueño (LIF-53): entrar directo a jugar con el pesista por defecto; elegir o cambiar pesista
recién después de la primera final; el cartel al terminar la primera final completa, obligatorio para seguir, que se
desbloquea con el correo O con las 2 preguntas (cualquiera alcanza); con el correo, las preguntas como paso optativo con
«Skip»; novedades en un tilde aparte, destildado. Del orquestador (el dueño pidió que se resuelva sin él): **las 2 preguntas
desbloquean el juego libre igual que el correo, una vez por dispositivo**, y **el nombre al anotarse pide 4 letras como
mínimo** (antes 5; «Mila», «Erin», «Joon» pasan, «Joe» no; sigue rechazando «AAAA», símbolos, números, tecleo al azar y
relleno). El tilde «Email me when early access opens» sigue obligatorio en el camino del correo.

**Qué cambió.**
- Worker: `GRATIS_ETAPA "final"`, `GRATIS "1"`, `ENCUESTA_LIBRE "1"` (variable nueva). La encuesta con premio exige las dos
  preguntas, una por dispositivo y 3 por red en 30 días (409 `ip`); los dispositivos desbloqueados juegan con fuente
  `encuesta` y no pesan sobre la red. `anotar_ok` (solo altas nuevas) y `anotar_repetido` los manda el Worker con la persona
  de la lista. Privacidad y consentimiento `2026-11-e` (publicar primero el Worker).
- Juego: bienvenida de primera vez sin tarjetas de pesista (Compacto); después de la primera final, las tarjetas en el
  inicio. El cartel con «Leave your email» / «Answer 2 quick questions». Eventos `muro_resultado` (una vez por cartel) y
  `siguio_jugando`, `anotar_respuesta` en el navegador, `encuesta_enviada` con `paso` y `desbloquea`.
- LIF-33: `arranque.js` trae `main.js` y recarga sola 2 veces si el módulo no baja; datos y modelos con 3 intentos y corte
  si la descarga se cuelga; aviso de descarga y aviso del 3D (sin WebGL, shader que no compila aunque se pruebe la calidad
  Móvil, contexto perdido) que tapan todo; `escena_visible` y `carga_fallida`. «Script error.» sin archivo viene de scripts
  de otro origen (apps de Facebook/Instagram, extensiones): todos los módulos del juego son del mismo origen; `error_juego`
  lo marca `ajeno: true`, y las promesas rechazadas con un evento (imagen que no bajó) ya traen mensaje.
- Pruebas: `worker_test`, `servidor_test`, vitest, `check_muro` reescrita a la regla de producción, `check_muro_medio` con
  la regla del arranque por variables, `check_game` (primera bienvenida), `check_analitica` (2026-11-e) y
  `check_carga_fallas` nueva (grupo «telefono» de pruebas.yml).

**Volver atrás por variable.** Correo obligatorio: `ENCUESTA_LIBRE "0"`. Arranque gratis con el muro en el intervalo:
`GRATIS_ETAPA "arranque"` y `ENCUESTA_LIBRE "0"`. Dos finales enteras: `GRATIS "2"`.

**Pendiente / estimación.** La práctica no cambió: con la barrita no hay tutorial ni tarjeta; la primera final sigue con
«Cómo se gana» y el primer peso (dos paneles). Juntar esos dos en uno en el teléfono acostado necesita revisar el alto: queda
para otra vuelta si los datos muestran caída ahí. Si PostHog todavía tiene la bandera `muro-partidas-gratis` asignando «2»,
esos dispositivos tienen 2 finales gratis: apagarla. Medir 48 h después de publicar con el embudo de MVP.md
(`muro_visto` → `muro_resultado` por `via` → `siguio_jugando`). Ramas en paralelo que tocan los mismos archivos:
`analitica.js` (rama `utm`: acá se agregó `app_navegador` junto a `fuente_trafico`) y `stage.js` (rama `graficos`: acá solo
`cargar()` deja de guardar la carga que falló).

### Gráficos fase 1: el ambiente (15-nov, rama `graficos`; LIF-36, LIF-25, LIF-38)

Pedido: que se vea «AAA» sin perder cuadros en el celular (2 de cada 3 jugadores), y más cámaras, en especial una desde el
jurado. Los pesistas no se tocaron. Nada fusionado a `main` ni publicado. Técnicas aprendidas de Saltline (texturas generadas
al cargar, materiales físicos parchados, reflejo planar, partículas por GPU, cámara con «trauma»); ni una línea copiada.

**Archivos nuevos** (todo lo del juego; el visor solo ve los carteles con la marca nueva):
- `web/js/game/ambiente.js` — `Ambiente`: se arma apenas existe la arena y antes del primer dibujo.
  - *Tarima*: sobre la madera que ya dibujaba `arena.js` (vetas, nudos, línea pintada) pinta desgaste en el mismo lienzo:
    mugre de baja frecuencia (ruido de valor en octavas), la zona gastada donde se paran, las dos franjas machucadas donde
    caen los discos, pisadas y nubes de magnesio y salpicado fino debajo de la barra.
  - *Piso de goma*: la alfombra del escenario pasa a baldosas de goma de 1 m (negra con motas, junta, normales por
    diferencias finitas). En «Baja»/«Móvil» queda horneada con la luz, como antes (512 px: se ven las motas grandes, no la junta).
  - *Pantalla LED viva* (`CanvasTexture`, 2048×720; 1024×360 en teléfonos): «LIFTING GAME», el levantamiento y el intento a la
    izquierda; apellido, kilos y país a la derecha; cuando deciden los árbitros, las tres luces en cada panel y un marco blanco
    o rojo. Recibe lo mismo que el tablero (`arena.setBoard`, `arena.setDecision`: stage.js los envuelve; main.js no cambió).
    La cinta LED del escenario corre despacio. Carteles de la arena: `EVENT.marca = 'LIFTING GAME'` (config.js).
  - *Halos* en las tres luces de arbitraje físicas (se ven aunque la calidad no tenga brillo de post).
  - *Polvo de magnesio*: un solo dibujo instanciado (`InstancedBufferGeometry`); posición, deriva, titilar y luz se calculan
    en el sombreador de vértices (solo brilla dentro de los conos de la clave y los contraluces); las primeras 48 partículas
    son el soplo que sale de los discos cuando la barra golpea la tarima. Con profundidad de campo se dibuja después del
    desenfoque, con los discos de luz de la arena (si no, cada mota era un disco de bokeh: se veía como nieve).
  - *Conos de luz*: los haces de la arena con otro sombreador (vetas de bruma que bajan) y más fuerza, en las calidades con
    post. *Público*: las siluetas instanciadas respiran y saltan con la ovación; con un válido, muchos más flashes.
- `web/js/game/reflejo.js` — `Reflejo`: reflejo planar de la tarima. La escena se dibuja otra vez desde la cámara espejada
  (plano cercano oblicuo, destino de media precisión con mipmaps) y la cara de arriba de la tarima lo suma con Fresnel y según
  la rugosidad de cada zona (el magnesio y el desgaste lo apagan y lo desenfocan). Solo con post (color lineal).
- `web/js/game/camara_viva.js` — `CamaraViva`: temblor por trauma (cuadrado del trauma, se gasta en medio segundo, senos sin
  azar) cuando la barra golpea la tarima (stage.js lo detecta en `barraSuelta` por el frenazo) y dip con resorte cuando la pose
  cruza la fase de recepción (`posar`). En fracción del alto de la imagen: máximo 1,4 % y 1,2 %. Se suma después del vigía de
  cortes: no cuenta como corte ni lo tapa. Con movimiento reducido no hace nada.
- `stage.js`: plano `jurado` en `PLANOS` (cámara en (0; 0,5; 7,0), sobre la mesa del árbitro central, lente de 26°: del pesista
  de frente a las tres luces sobre la pantalla); `escena.camara()` acepta también claves de `PLANOS`.
- `main.js` (lo mínimo): `?calidad=` además de `?q=`; `camPrincipal()` usa la cámara elegida (tecla **V** desde la fusión con `rondas`, antes C: general → jurado →
  frontal → lateral; `?camara=jurado|baja|lado|3/4`; se recuerda en `tarima.camara`); en un válido propio, mientras se prenden
  las luces, la cámara va al jurado con un movimiento suave de 1,3 s y después gira al público como antes.

**Calidades** (`perf.js`: `AMBIENTE`, `PRESET.ultra`, `ALIAS_CALIDAD`). `?calidad=ultra|alta|media|baja|movil` (o
low/medium/high) fija la calidad; sin parámetro, automático como antes (calibración y gobernador sin cambios; «Ultra» nunca
se elige sola). Para comparar en la Mac: `juego.html?calidad=ultra` contra `?calidad=baja`.

| | Móvil | Baja | Media | Alta | Ultra |
|---|---|---|---|---|---|
| texturas nuevas, LED viva, halos, cámara viva, jurado | sí | sí | sí | sí | sí |
| polvo (partículas) | 90 | 220 | 500 | 900 | 1600 |
| conos de luz | no | no | ×3,4 | ×3,8 | ×4 |
| público que se mueve | — (horneado) | — | sí | sí | sí |
| reflejo de la tarima | no | no | no | ½ resolución | completa |
| post (ya existía): brillo, viñeta, grano, gradación, DoF | viñeta CSS, gradación en el material | igual | sí | + SMAA | + MSAA 4, sombras 2048, densidad 2 |

**Medición.** En Actions todo se dibuja por software (SwiftShader): sirve para ver que compila y cómo se ve, y para una
relación de costos en la misma máquina; los milisegundos no dicen nada de una placa.
- **Contra `main` en la misma máquina** (`graficos.yml` con `comparar`, run 43773716868: banco alternado main, rama, main,
  rama, main, rama; 960×540; costo de un cuadro a 1 MP, mediana de 4 y 2 vueltas):

  | | main (3 corridas) | graficos (3 corridas) |
  |---|---|---|
  | Baja | 987 · 984 · 1023 ms (media 998) | 940 · 995 · 942 ms (media 959) |
  | Móvil | 974 · 1034 · 1009 ms (media 1006) | 940 · 1008 · 930 ms (media 959) |

  «Baja» y «Móvil» cuestan lo mismo que antes dentro del ruido (−4 % y −5 %). «Sin el ambiente nuevo» (polvo y halos
  ocultos) ahorra 0,7 · 229 · −108 ms en las tres corridas: no se distingue del ruido.
- **Entre corridas distintas no se puede comparar**: el banco de base (run 43769800891, main) dio Baja 1163 ms a 1 MP y el
  de después (run 43772443706) 2027 ms en otra máquina; el alternado de arriba muestra que era el runner. Con esa salvedad,
  lo medido en esas dos corridas (ms a 1 MP, antes → después): Móvil 812 → 845, Media 1300 → 1322, Alta 1461 → 1737 (el
  reflejo dibuja la escena otra vez), Ultra — → 3320 (nueva). Media, Alta y Ultra con una o dos vueltas: orientativo.
- **Cuadros por segundo reales: sin medir.** Ni la calibración ni el gobernador cambiaron (pisos de 70 % en computadora y
  densidad 1 en el teléfono, intactos); «Alta» con reflejo solo se elige sola si la calibración mide que entra.
- **Cortes** (`check_recorrido`, run 43772428833, con la cámara del jurado en el válido propio): 0 cortes bruscos y 20
  fundidos mirando todo, 0 y 32 saltando rivales: igual que la base (run 43769795605). Pruebas del juego y del teléfono en verde.

**Capturas miradas** (artefacto `graficos-out`, `tools/banco.mjs --fotos=dir --niveles`: 6 tomas por calidad): 3/4, frontal,
lateral, jurado con válido y con nulo, reversa. El jurado en «Móvil» ya muestra al pesista de frente, la pantalla con su
nombre y kilos, las tres luces en la pantalla y las tres físicas arriba.

**Pendiente / sin medir.**
- **Nada se midió en una placa real.** Falta correr `juego.html?banco=1` en la Mac del dueño y en un teléfono, antes y después.
  Si el polvo de «Móvil»/«Baja» costara algo medible, se apaga con `AMBIENTE.movil.polvo = 0` (una línea).
- (Resuelto en `graficos2`: fila «Cámara» en Opciones, tecla V y evento `camara_elegida`.)
- (Resuelto en `graficos2`: el cambio de cámara deja `camara_elegida`.)
- Conos y reflejo solo se ven de Media/Alta para arriba; en el celular no hay conos (en el camino directo cada capa aditiva
  paga el tono por píxel). Postproceso: no se agregó nada (brillo, viñeta, grano y gradación ya estaban en Media y Alta).
- Los árbitros siguen siendo muñecos de cápsulas: por eso el jurado es lo que ve el árbitro y no un plano de ellos.

### Panel del llamado liviano y estilo de envión fijo (15-nov, rama `panel`; LIF-31 y LIF-43)

Pedido del dueño (iPhone acostado): el panel ocupaba media pantalla y el envión eran tres botones grandes apilados. Nada
fusionado a main ni publicado.

- **Panel compacto** ('b' y 'u'; `panelLlamado → uPintar` y `estiloHTML` en main.js, CSS «panel del llamado compacto» al final
  de `juego.css`, textos `panel.*` y `jerk.*`, aprobados): a la vista solo el título corto («Dos tiempos · intento 1 de 3», sin
  el nombre: el tablero dice quién levanta) con **Detalles ▾**, los kilos ± con LEVANTAR, la dificultad y «X de 10», y en el dos
  tiempos **«Estilo de envión: Tijera ▾»** (un botón; al tocarlo, una fila de tres con la dificultad en una palabra: fácil /
  medio / difícil, y «Queda fijo para los 3 intentos»; al elegir, el foco vuelve a LEVANTAR). En el detalle: % del RM, el verde
  de cada barrita, el cansancio, cómo ganar, los avisos y el pedido. «Detalles» se recuerda (`tarima.panel.detalle`). En el
  teléfono acostado no se ven los ±5 (↑ ↓ siguen sumando 5 con teclado) ni «kg» (lo dice el botón), y todo lo que se toca mide
  40 px de alto o más. El entrenador sigue proponiendo split (`casa`); el último estilo elegido se recuerda para la final
  siguiente. Ya no hay «Más opciones» en 'b'.
- **Estilo fijo** (LIF-43; `match.js → estiloFijo`, `cfg.envFijo`, cabecera `envFijo: true`): se elige en el primer intento del
  dos tiempos y es el de los tres. `resolver` rechaza otro estilo y `recalcular` también; sin `envFijo` (registros viejos) las
  reglas de antes. Los rivales, con la regla, usan el estilo de su personalidad toda la competencia (`ai.js → envionRival`:
  Marangi «arriesga» power; Ventura y Brenner tijera), en lugar de power en la apertura y tijera después (antes, en 109 de cada
  200 finales un rival cambiaba a mitad). `entrenador.js → chanceDe` cuenta el estilo fijo aunque le pasen otro. El panel lo
  muestra con candado y «fijo»; Clásico deja deshabilitados los otros estilos.
- **Medido** (check_telefono mide el alto del panel del llamado y el botón más bajo; `out/telefono/panel.json`; exige ≤ 38 % del
  alto con el detalle plegado en 667×375 y 844×390 y botones de 40 px o más):

| alto del panel del llamado | antes (`3516bfd`) | después (corrida 43774081868) |
|---|---|---|
| 667×375 · arranque | 65–75 % | 32 % |
| 667×375 · primer dos tiempos / con el estilo fijo | 77 % | 37 % / 32 % |
| 844×390 · arranque | 61–66 % | 31 % |
| 844×390 · primer dos tiempos / con el estilo fijo | 73 % | 35 % / 31 % |
| 740×360 · 844×340 (Safari) · 932×430, arranque | 63–74 % · 65–71 % · 57–61 % | 33 % · 35 % · 28 % |

  Con «Detalles» abierto 62–68 %; eligiendo el estilo 59–61 % (momentáneo).
- **Rivales** (`rivales_test`, `ENV_FIJO=0` juega con las reglas de antes para comparar): los totales medios de cada rival
  cambian 1 kg o menos y los válidos 1 punto o menos en todas las casillas.
- **Pruebas**: sim_test 17 (300 finales con la regla contra recalculadas, nadie cambia de estilo, cada rival con el de su
  personalidad, registros con el estilo cambiado a mitad rechazados, el entrenador cuenta el fijo); ritmo_test, barra_bots y
  rivales_test juegan con `envFijo`; chance_test y servidor_test en verde. check_game elige power con teclado y tijera con el
  dedo y verifica el candado y el registro (power ×3, split ×3); check_telefono abre y cierra «Detalles» y elige el estilo con el
  dedo. Actions sobre `b6a9da1`: pruebas.yml 43774081917 y telefono.yml 43774081868 en verde. Capturas miradas: teléfono
  667×375 (primer dos tiempos, estilo abierto, fijo con candado, detalle) y computadora 1280×720 (fijo con candado).
- **Pendiente**: verlo en un teléfono de verdad (los botones de 40 px con el pulgar). El estilo se elige recién en el primer dos
  tiempos (no en el intervalo), como acordado.

### Orden por rondas y «Cambiar» el pedido (15-nov, rama `rondas`, LIF-3 y LIF-4)

Pedidos del dueño: LIF-3 «ordenar por rondas los intentos de los 3 pesistas» (con el orden oficial el jugador espera muchos
turnos seguidos y se entiende mal) y LIF-4 «permitir 1 o 2 cambios de kilos por intento» para responder a los rivales.
Nada fusionado ni publicado.

- **Núcleo** (`match.js → TURNOS`, `HUELLA_TURNOS`). `new Partida(..., { turnos: 'rondas' | 'oficial' })`; el registro lleva
  `orden` y `turnos` (la huella) y `replay.js` rechaza otra huella u otro orden. Sin `turnos` (registros viejos) todo es como
  antes: orden oficial y sin pedidos antes del turno. Por rondas: en cada ronda los tres levantan una vez; dentro de la ronda
  abre quien pidió menos, a igual peso quien lo pidió primero (`a.pidio`) y después el dorsal. `ordenSalida()` y `ronda()`
  son de la partida (el tablero ya no copia la regla).
- **Decisión: la barra nunca baja dentro de la ronda** porque el mínimo de quien todavía no levantó en esa ronda incluye lo
  cargado (`minimo`, con `rondaBarra`) y se sale de menor a mayor: nadie puede quedar por debajo, así que no hace falta «subir
  el pedido» ni reordenar a nadie. Entre rondas sí baja (la ronda 2 la abre el pedido más bajo): lo que pide quien ya levantó
  es para la ronda siguiente y no lo limita la barra de esta. En 600 finales de `sim_test` 17 pasó 827 veces.
- **Pedidos antes del turno** (`Partida.pedidoValido`/`pedir`): con `turnos`, mientras levanta otro, la persona sube su pedido;
  solo hacia arriba, nunca bajo su mínimo, y dos por intento contando los cambios del panel de su llamado. En el registro va
  entre los llamados como `{a, lev, pide}` (límite de llamados 40 → 52 con turnos).
- **Decisión: el panel del llamado propio sigue como estaba** (puede bajar hasta el mínimo; es la declaración final y es zona
  del agente de `panel`). Lo nuevo es lo de antes del turno, que solo sube como pide el ticket.
- **Rivales.** Con `turnos` sus cambios al cierre de un intento ajeno son los mismos de antes (la tabla del dos tiempos, por
  personalidad) pero solo hacia arriba y como mucho dos. Se probó que Brenner y Marangi cambiaran también en el tercer arranque
  al ir atrás (con «lo justo para pasar» y con su propio número): sus cambios caían en la marca o el pedido del jugador ±1 entre
  0,16 y 0,29 veces por final (meta de `rivales_test` ≤ 0,15) y **se descartó**. `ai.js` no cambió de huella.
- **Juego.** Opciones → «Orden»: «Por rondas» (por defecto) u «Oficial», con una nota de una línea (`tarima.orden`). El tablero
  dice «Arranque · Ronda 2» (computadora), el cambio de un rival al pie («Brenner cambia a 167», en dorado; en el teléfono esa
  línea reemplaza a la de la estrategia) y, en el turno de un rival, un botón chico **«Cambiar»** debajo del tablero (tecla C; la cámara pasó a la V al fusionar con `graficos`).
  Abierto: «− 167 +» con «X de 10» (en 'b' y 'u'), «Pedir 167», ✕ y «Te quedan 2 cambios»; flechas, Enter y Esc con teclado.
  En el teléfono acostado el botón va debajo del tablero compacto y se oculta mientras está el veredicto (abajo a la izquierda:
  se tapaban en check_telefono; al costado del tablero chocaba con los botones de arriba).
  Con el tablero quieto (el resultado del rival ya está calculado) solo se pone al día la fila propia («antes 165»). Si en la
  partida ya le toca a la persona (el rival que se ve ya se resolvió), el pedido queda pendiente y entra como cambio de su
  llamado al abrirlo (`E.pedidoPend`; si la desplaza, sale otro). Evento `pedido_cambiado` (docs/MVP.md). `ui/pedido.js` es
  lo puro (qué se puede pedir) y lo prueba `sim_test` 17.
- **Compatibilidad.** `tools/sim_ref*.json` existentes sin cambios y en verde; `tools/sim_ref_turnos.json` es nuevo (12
  partidas, rondas y oficial, con pedidos). `ritmo_test`, `rivales_test` y `pesistas_test` aceptan `--orden=rondas|oficial|viejo`
  y por defecto miden lo que juega el juego (rondas). El muro (conexion.js, servidor.js, worker/) no se tocó; el servidor no
  recalcula registros.

**Medido** (sin navegador, en la Mac, de a una prueba; antes = `--orden=viejo`, idéntico a `main`):

| ritmo_test, 360 finales por fila | antes | por rondas |
|---|---|---|
| turnos de rivales seguidos entre dos propios: mediana · p90 · máximo | 1 · 4 · 6 | 2 · 3 · **4** |
| Fácil, mirando cada rival: espera mediana · p90 · máxima | 12,2 · 35,8 · 61,3 s | 17,4 · 27,2 · **40,5 s** |
| Fácil, saltando cada rival: espera mediana · p90 · máxima | 5,5 · 12,2 · 17,1 s | 7,7 · 10,0 · **12,2 s** |
| Medio / Difícil saltando: espera máxima | 17,1 / 17,1 s | 12,2 / 12,2 s |
| final mediana, Fácil mirando / saltando | 194,5 / 126,0 s | 195,8 / 126,9 s |
| final mediana saltando, Medio / Difícil | 136,0 / 137,5 s | 136,1 / 137,6 s |

La mediana de la espera sube porque ya no hay dos levantamientos propios seguidos (antes, muchos «0 rivales en el medio»);
lo que baja es la espera larga, que era la queja. El orden «Oficial» nuevo da lo mismo que antes (máxima 61,4 s).
`ritmo_test` ahora juzga las barras caídas con 250 semillas: con 60, Medio daba 19,3 % por rondas y 16,4 % antes según en qué
orden salían los llamados (la semilla de cada intento depende de su número); con 250, 17,3 % y 16,7 % (meta ≤ 18 %).

| oro del novato con el panel (rivales_test, 'b', 500 finales) | antes | por rondas |
|---|---|---|
| rivales amistosos | 88 % | 87 % |
| rivales normales | 15 % | 19 % |

| pesistas_test ('u', 600 finales, rivales normales, panel) | antes | por rondas |
|---|---|---|
| Compacto / Largo / Potente | 51 / 48 / 69 % | 44 / 50 / 62 % |
| diferencia entre pesistas (meta ≤ 25) | 20 | 18 |
| panel contra prudente, peor pesista (meta ≥ 15) | 18 | 31 |
| panel contra codicioso, peor pesista (meta ≥ 15) | 28 | 18 |

El «prudente» (+2 kg siempre) se hunde por rondas (Compacto 31 → 3 %): antes la barra lo obligaba a subir; ahora puede
pedir poco entre rondas y lo hace. `pesistas_test` pasa a 600 finales por defecto: con 200 el criterio E de Compacto caía a 13
puntos por ruido (con 600, 18). Rivales: cambios espejo 0,01 a 0,10 por final (antes 0,01 a 0,14), contrafáctica 0 %
(declarar ±3 kg no cambia ninguna decisión de un rival), variedad igual. Cambios de rivales que ve el jugador tras sus
intentos: 0,6 por final en amistoso (antes 0,4).

**Pendiente / para el dueño.** Mirarlo jugando: si «Cambiar» se usa (evento `pedido_cambiado`) y si el «Ronda 2» del tablero
alcanza para entender el orden. Decidir si el panel del llamado propio también debe ser «solo hacia arriba» (hoy deja bajar
hasta el mínimo). Los rivales siguen sin cambiar en el arranque (con ellos cambiando, espejaban al jugador).

### Rondas y estilo fijo juntos (15-nov, rama `prueba`: fusión de `rondas` sobre `panel`)

Las dos reglas conviven en la misma partida y en el mismo registro: `envFijo: true` (LIF-43) y `orden` + `turnos`
(`HUELLA_TURNOS`, LIF-3/4). `replay.js` valida cada marca por separado (`envFijo` solo puede ser `true`; `orden` y `turnos`
van juntos y con la huella de hoy); un registro sin ninguna de las dos se recalcula como antes, y uno con una sola, con esa
regla sola. El juego crea la partida con las dos (`envFijo: true` y `turnos` según Opciones → Orden).
- **Teclas** (decisión del orquestador): **C** es «Cambiar» el pedido en el turno de un rival; **la cámara pasa a la V**
  (general → jurado → frontal → lateral).
- El panel del llamado propio sigue pudiendo bajar hasta el mínimo; los cambios antes del turno («Cambiar») solo suben.
- `sim_test`: 17 es el estilo fijo, 18 los turnos y **19 nuevo, las dos juntas** (300 finales, rondas y oficial, con pedidos,
  contra recalculadas; estilo cambiado a mitad, huella de turnos u `envFijo` adulterados: rechazados). Ninguna `sim_ref*.json`
  cambió: `sim_ref_turnos.json` juega sin `envFijo` y sigue en verde.
- `ritmo_test` y `rivales_test` juegan con las dos reglas (`--orden=` y `ENV_FIJO=0` siguen sirviendo para comparar).

### Gráficos fase 2: jueces de verdad, jurado en los nulos y selector de cámara (15-nov, rama `graficos2`; LIF-38, LIF-36)

Rama `graficos2`, desde `prueba` (primera-vez + utm + graficos). Nada fusionado ni publicado.

**Qué cambió.**
- `web/js/game/jueces.js` (nuevo) — `Jueces`: personas ficticias modeladas por código (sin imágenes ni caras de nadie):
  silla, piernas, saco por secciones (superelipses), camisa en V, corbata, cuello, cabeza con pelo (corto, melena o calvo),
  brazos apoyados en la mesa. Los tres árbitros además tienen nariz, ojos y orejas, una consola con dos botones y **una
  paleta**: cuando se prende su luz la levantan (blanca o roja, 0,35 s) y la bajan cuando las luces se apagan (0,55 s; con
  movimiento reducido, sin animación). Reciben lo mismo que `arena.setDecision` (stage.js lo envuelve). También son personas
  el jurado lateral (cinco, mesa larga: es lo que se ve desde la cámara general) y los dos de la mesa técnica, con menos detalle.
  - *Costo*: cada grupo es una malla con color por vértice (13 600 triángulos en total; se descartan por grupo fuera de
    cuadro) y un solo material Lambert sin texturas; la luz va pintada en el color (lo que mira abajo más oscuro, lo que mira a
    la tarima más claro) más un relleno fijo en el sombreador (`RELLENO`: las luces del escenario apuntan a la tarima y las
    mesas quedaban en negro). Los tres brazos de las paletas son una malla cuyas posiciones se recalculan en JavaScript solo
    mientras se mueven (594 vértices); las tres paletas, un dibujo instanciado sin luces. Nada por cuadro en reposo.
  - `arena.js` acepta `oficiales: false` (el juego): no arma los muñecos de cápsulas sentados ni sus mesas. El visor no cambia.
    Los dos cargadores de pie siguen siendo cápsulas.
- **Decisiones de diseño (del agente).** Los tres árbitros comparten **una mesa** al frente (x = −0,95; 0; 0,95; antes el
  central estaba solo y los otros dos a 3,6 m: no entraban en ningún plano juntos). La **vista del jurado** dejó de ser «lo
  que ve el árbitro»: ahora es por encima de los hombros de los tres (cámara en (0; 0,7; 10,6), lente de 30°): abajo sus
  cabezas y las paletas, en el medio el pesista de frente, arriba las tres luces. El pesista ocupa un 36 % del alto (antes
  62 %). Con profundidad de campo, lo cercano se desenfoca menos en ese plano (`post.cerca` 0,1 en lugar de 0,35). Uniforme:
  saco azul grisáceo, camisa clara, corbata gris, azul o bordó. Plano `jueces` (los tres de frente) solo para las fotos de control.
- **Jurado en los nulos propios** (`decision()` en main.js): igual que en el válido, movimiento suave de 1,3 s; el nulo se
  queda ahí hasta el fundido que sigue. Rivales, resúmenes y la barra que se cae (fallo) siguen como antes.
- **Selector de cámara**: fila «Camera / Cámara» en Opciones (Main · Judges · Side · Low / General · Jurado · Lateral · Baja),
  recordada en `tarima.camara`; evento `camara_elegida` (`vista`, `via`: `opciones` o `tecla`, `pantalla`; docs/MVP.md 6.3).
  **La tecla pasó de C a V** (C es «Cambiar» el pedido de kilos, LIF-4); `?camara=` sigue. El orden de la tecla es el de la fila.
- Banco: tomas `jueces-vale` y `jueces-nulo`, variante `jueces` (los oculta). `graficos.yml`: `comparar` acepta `base` (rama).

**Medido** (Actions, por software: vale la relación, no los ms).
- Costo contra `prueba` en la misma máquina (run 43776898919, alternado, 960×540, ms de un cuadro a 1 MP):

  | | prueba (3 corridas) | graficos2 (3 corridas) |
  |---|---|---|
  | Baja | 1159 · 1157 · 1188 (media 1168) | 1167 · 1165 · 1171 (media 1168) |
  | Móvil | 503* · 843 · 838 | 829 · 842 · 841 |

  (*una sola vuelta: no vale.) Lo mismo dentro del ruido. Repetido sobre el último código (run 43781091245): Baja 1187 · 1204 ·
  1179 (media 1190) contra 1181 · 1202 · 1177 (media 1187). La variante «sin los jueces» dice que ahorra 141 a 159 ms, pero «sin
  el ambiente» en `prueba` dice 149 a 176 con el mismo rango (−16 a 300): es el sesgo de la medición de variantes, no un costo.
- Cortes (`check_recorrido`, run 43776253714): 0 cortes bruscos y 20 fundidos mirando todo, 0 y 32 saltando rivales: igual
  que la base. **En ese recorrido no salió ningún nulo propio**: la vista del jurado en el nulo usa la misma llamada que el
  válido (que sí se midió), pero no quedó ejercitada en el navegador.
- `check_game` controla la fila de cámara (4 botones, guardado, evento) por teclado y por toques.
- Capturas miradas (artefacto `graficos-out`): jueces de frente, jurado con válido y con nulo, general (jurado lateral) y
  reversa (los tres árbitros con las paletas arriba), en Móvil, Baja, Media y Alta.

- **Banco en el teléfono** (`juego.html?banco=1`; bug del dueño: «Copiar el JSON» no respondía al toque): los botones
  atienden `click` y `pointerup` táctil, la copia va con `navigator.clipboard.writeText` dentro del gesto y, si no hay
  portapapeles o falla, el JSON queda seleccionado en un cuadro de texto visible para copiarlo a mano; la tabla se desplaza
  con el dedo (`touch-action: pan-x pan-y`; el cuerpo tiene `none`) y arriba hay un resumen grande («Elige: Alta · 2,94 MP ·
  15 % de margen» y la línea de `resultado.texto`) con los botones al lado: alcanza una captura. **Sin probar en un teléfono
  real** (la causa exacta no se pudo reproducir: se cubrieron las tres posibles).
- **Primera medida en una placa real** (Mac del dueño, M1 Pro, 120 Hz, Chrome, rama graficos): el banco eligió **Alta a
  2,94 MP con 15 % de margen**; Ultra cuesta 16 % más que Alta; el ambiente nuevo no se distingue del ruido.

**Pendiente / estimación.** Falta medir en un teléfono real y, con los jueces, otra vez en la Mac. Las caras son un maniquí con nariz y ojos (sin boca ni cejas). El
selector no muestra la vista elegida detrás del panel hasta que empieza el levantamiento. En una ventana más alta que ancha
la cámara es siempre la lateral, se elija lo que se elija. (La prueba de navegador que fuerza un nulo propio está desde la
fusión en `prueba`: `check_game`, corrida «clasico».)

### graficos2 y lienzo juntos en `prueba` (15-nov; LIF-38, LIF-45)

`prueba` = main + primera-vez + utm + graficos + nombre + panel + rondas + **graficos2** + **lienzo**. Nada fusionado a main
ni publicado.

**Conflictos y cómo quedaron.**
- `main.js`: C abre «Cambiar» (rondas, LIF-4) y V cambia la cámara (graficos2); en Opciones van las filas «Orden» y
  «Cámara». Solo chocaba el comentario de la cámara (quedó el de graficos2).
- `analitica.js`: los eventos `pedido_cambiado` y `camara_elegida`; lienzo entró sin conflicto (bandera
  `grabacion_lienzo`, súper propiedad `grabada_lienzo`). i18n sin conflicto: 751 claves en es y en, las mismas.
- Privacidad: la versión final es `2026-11-g` (el juego la manda; el Worker acepta de la a a la g).
- `check_game`: la fila «Cámara» de Opciones (graficos2) con el estilo de envión fijo de rondas (el de graficos2 cambiaba de
  estilo en cada dos tiempos, que ahora no se puede).
- Workflows: unión de las ramas de cada lado.

**LIF-45, el nombre en el 3D grabado (decisión del orquestador).** En las visitas que graban el lienzo
(`analitica.grabandoLienzo()`), cuando levanta el jugador la pantalla LED (`ambiente.js`, `_led`) y el tablero del costado
(`arena.js`, `_drawBoard`) dicen «LIFTING GAME» (`EVENT.marca`) en vez de su nombre (`main.js`, `zocalo`: el cartel lleva
`entero` y `jugador`). Con eso `regionesLienzo` no tapa nada (los rectángulos negros tapaban al pesista cuando pasaba por
delante del cartel, por ejemplo desde el jurado) y queda **solo como respaldo**: tapa la línea del nombre si el cartel puede
estar mostrando el nombre del jugador (cartel sin datos, o dibujado con el nombre antes de que se prendiera la grabación).
Los rivales son ficticios: con un rival en el cartel tampoco se tapa. Sigue la falla cerrada (sin escena o cuadro sin dibujar:
el grabador saltea el cuadro). Pruebas: `servidor_test` (cinco casos nuevos de `regionesLienzo`) y `check_analitica`
(sección 7: con lienzo los carteles del jugador dicen LIFTING GAME y no se tapa nada; sin lienzo, su nombre).

**Nulo propio y jurado.** `check_game`, corrida «clasico»: en la segunda práctica suelta la barra arriba antes de la señal de
bajar (NULO «antes») y verifica que la cámara va al jurado al empezar el veredicto y sigue ahí 1,8 s después, con luces rojas.

**Corridas en verde** (sobre `dee23df`, por software): pruebas 43788512947 (el nulo: «nulo:antes · cámara jurado → jurado ·
luces r,r,r»; `check_carga_fallas` sin vencer), teléfono 43788516583, muro 43788520026, servidor 43788523303 (con el lienzo
los carteles del jugador dicen LIFTING GAME y se tapan 0 rectángulos; sin el lienzo, su nombre) y gráficos 43788526622.
Sin navegador, en la Mac: sim, servidor, worker, perf, ritmo, barra_bots, chance y rivales en verde. Capturas miradas: jueces
y jurado con nulo (paletas rojas y blanca), tablero con «Change C», panel con el estilo de envión fijo y candado, y los cuadros
grabados del lienzo con «LIFTING GAME» en el tablero del costado y el pesista sin tapar. La primera corrida de servidor
(43787765416) falló porque `main.js` no importaba `EVENT`; arreglado en `dee23df`.

### Aprender jugando: explicaciones de una línea en su momento (16-nov, rama `aprender`; LIF-52)

Pedido del dueño: que un jugador nuevo aprenda halterofilia jugando, sin pantallas extra ni tutorial: una línea, una vez, en el
momento justo, que se pueda cerrar. Rama `aprender` desde `prueba`. Nada fusionado ni publicado.

- **`web/js/game/ui/aprende.js`** (nuevo): `APRENDE` (claves, momentos y condición), `elegir()` (puro, lo prueba sim_test 20) y
  la clase `Aprende` (el cartelito `#aprende` dentro de `#tv`). **Cada explicación es la línea del glosario** de «Cómo se
  juega» (`glosario.<clave>.t` y `.d`): un solo texto para las dos cosas. Solo en 'b' y 'u'.
- **Cuándo sale cada una** (en orden de prioridad; una por momento; si hay otra a la vista hace menos de 3,5 s, espera):

  | clave | momento | condición |
  |---|---|---|
  | `estilo` | panel del llamado | primer dos tiempos (estilo sin fijar) |
  | `dificultad` | panel del llamado | 'b'; el título es el del panel («Fácil · 10 de 10») |
  | `kilos` | panel del llamado | ya hizo un intento en ese levantamiento |
  | `cambiar` | turno de un rival | hay botón «Cambiar» |
  | `nulo` | veredicto de un rival | no vale |
  | `luces` | veredicto de un rival | — |
  | `total` | panel del llamado o turno de un rival | dos tiempos |

- **Dónde**: con el panel del llamado, encima del panel, de su mismo ancho (el pesista está del otro lado; si con «Detalles»
  abierto no entra, se oculta mientras tanto); en lo demás, abajo a la izquierda (en 'b' y 'u' ahí no hay zócalo); con mano
  izquierda, encima del botón redondo. La del panel se va al cerrarse el panel; la de la esquina sigue en el turno y el veredicto
  de los rivales y en la carga, y se va al llegar el llamado propio. Tope 15 s. Nunca durante el levantamiento propio.
- **Una vez**: `tarima.visto.a_<clave>` si la persona la cerró (✕), si estuvo 3,5 s a la vista o si es la segunda vez que sale
  (la primera la cortó un momento corto, por ejemplo un rival salteado). `tarima.aprende.n_<clave>` cuenta las veces.
- **No frena nada**: no hay esperas nuevas ni toques que la cierren; la ✕ es un botón (input.js no lo cuenta como toque) sin
  foco (Espacio sigue siendo del juego).
- **Eventos** (docs/MVP.md 6.3): `explicacion_vista` (`clave`, `momento`, `pantalla`, `vez`) y `explicacion_cerrada` (`clave`,
  `via` `boton`/`sola`, `ms`, `leida`). Embudo para medir: vista → cerrada con `boton` o `leida`.
- **Decisiones del agente**: en 'b' y 'u' la presentación de la primera final ya no lleva las tres reglas de «Cómo se gana» (las
  luces y el total se explican en su momento; quedan los rivales); el aviso «la barra nunca baja» que iba dentro del detalle
  plegado del panel (se gastaba sin verse) pasa a ser la explicación `kilos`; el glosario de 'b' y 'u' suma las luces, el no vale,
  la dificultad, «Cambiar» y el estilo de envión (16 palabras en 'b'), y corrige kilos («dentro de la ronda») y total («necesitas
  un válido en cada uno»).
- **Textos que coinciden con el juego** (sim_test 20, contra el núcleo): 2 o 3 blancas = vale (1740 veredictos de rivales, 2 no
  vale); sin un válido en cada levantamiento, total 0; «Cambiar» = 2 cambios por intento y solo hacia arriba (`TURNOS`); la barra
  que no baja dentro de la ronda y la progresión (+1 tras un válido, lo mismo tras un fallo) ya las verifica `jugar()`. En 'b' y
  'u' el jugador no puede hacer un no vale (la fijación siempre vale): la explicación `nulo` sale con el de un rival, y son raros.

**Medido.** Ritmo: las explicaciones no agregan esperas; `check_recorrido` (computadora, es y en, mirando y saltando rivales)
da las mismas esperas que `prueba` (27,6 s máx. mirando; 9,1 s saltando; 3,5 s tras el fallo); `ritmo_test` en verde (no
cambia: es del núcleo). Tapado (`check_telefono`, `tools/tapa.mjs` cuenta solo el cartelito; tope 5 % del cuerpo): **0 %
del pesista en todas las explicaciones y todos los tamaños** (844×390, 667×375, zurdo 740×360, Safari 844×340, 932×430 en
inglés; en vertical no se mide el pesista); el panel del llamado sigue en 31 % del alto. Con mano izquierda la primera versión
tapaba 17 % del rival y en vertical se encimaba con el panel: corregido. Toque en la ✕: cierra, `leida: true`, 0 toques del
juego. Corridas en verde sobre `61a373d`: pruebas 43796645404 (los 4 grupos) y teléfono 43796645436. Capturas miradas:
computadora es y en (llamado, rival, veredicto), teléfono 667×375 y 844×390 (es), 932×430 (en), zurdo y vertical.

**Pendiente / estimación.** Verlo en un teléfono de verdad. Medir en PostHog cuántas se cierran con la ✕ y cuántas se cortan
(`leida: false`): si muchas se cortan, subir la prioridad de la de la esquina o alargarla. La del nulo depende de que un rival
haga un no vale (≈ 1 de cada 900 intentos de rivales): casi nadie la va a ver; si se quiere enseñar, hace falta otro momento.

### Gráficos fase 3: el look (16-nov, rama `look`, desde `prueba`)

Pedido del dueño: «temas gráficos, sigue igual… me refiero a las TEXTURAS»; quiere el nivel de Saltline y pesistas «semi
humanos reales». Nada fusionado ni publicado. La cámara en primera persona y lo de después del levantamiento van en otra rama.

**Qué cambió (archivos).**
- `web/js/game/look.js` (nuevo) — `Look`, se arma en `stage.js` después de la arena, el ambiente y las luces:
  - *Luz de competencia* (`_luces`): sala a oscuras; clave alta y lateral (4,4; 9,3; 3,9), contraluz **cálido** ancho desde
    atrás a la izquierda (`rimA`, el que mira a la cámara general) y frío del otro lado; relleno y luz de sala mínimos.
    `GRADO_LOOK`: una sola gradación (saturación 0,88, sombras frías, altas cálidas, viñeta 0,36, negros firmes) para el pase
    final de `post.js` (uniforms nuevos `uFrio`, `uCalido`, `uNegro`), el tono del camino directo y `tonoJS` de `stage.js`.
    Casi sin desenfoque de fondo (`uScale` 0,18: el marcador y la sala se leen), bloom con umbral alto, bruma de sala a un tercio.
  - *Texturas por campo* (color + altura→normales + rugosidad de la misma cuenta, ruido de valor en octavas): madera de la
    tarima (tablas, veta, barniz gastado donde se paran, marcas y abolladuras donde caen los discos, magnesio, línea y marca
    estarcidas y gastadas; 2048 px en computadora aunque arranque en «Baja», 1024 en teléfono), goma del escenario (motas,
    juntas, polvo, roces brillantes), metal pintado con saltaduras y óxido, fenólico de baúl, terciado, goma de disco.
    La madera se calcula a media resolución y la veta fina, las juntas y los rayones se componen a resolución final con el
    lienzo 2D (por píxel a 2048 eran varios segundos de JavaScript; quedó en ~1,2 s con la Mac ocupada, 0,3 s a 1024).
  - *Pantalla LED* con fondo oscuro y grano de píxel en el sombreador (un punto por LED, se funde con la distancia).
  - *Utilería* (fija, se junta por material en `juntarFijos`; los discos son un dibujo instanciado): dos cajones de discos,
    tres pilas, portabarras con tres barras, tres bancos con toalla y botella, cuatro baúles de gira, dos monitores de piso,
    cámara de TV con trípode, caja de magnesio de madera, cuatro tendidos de cable y canaleta, calcomanías de cinta y de
    magnesio derramado, ocho banderines ficticios, y dos paños de **pared de chapa** con columnas, caño y tablero.
  - *Rayos de luz*: conos de bruma de la clave y de los contraluces (solo con post). Público en penumbra con luz de rebote
    en cabeza y hombros (`uRebote` en `arena.js`).
- `web/js/game/materiales.js` (nuevo) — **materiales como funciones GLSL por píxel** (método de Saltline): `conSuperficie(m, tipo)`
  inyecta `superficie(P, col, rug, met)` en un material físico; de la altura que devuelve sale la normal. Tipos: `madera` y
  `goma` (encima de sus mapas: veta fina, gránulo, magnesio y polvo por capas), `disco`, y `chapa` (toda por función: costillas
  con un coseno, pintura en capas → base anticorrosiva → acero → óxido y chorreaduras, vetas lavadas, mugre abajo, tornillos,
  bañadores de pared). **`USO`** (0 a 1) es el valor compartido: gradúa magnesio, polvo y óxido en todas; sube 0,03 con cada
  barra que cae. Solo con post (`setSuperficies`); en el camino directo quedan los mapas.
- `web/js/game/lab.js` (nuevo) — **laboratorio de materiales**: `juego.html?banco=1&lab=materiales` (esferas y paneles de
  madera, goma, moleteado, cromo, disco, chapa, chapa roja y metal pintado bajo la luz del juego, deslizador de uso, teclas
  1 a 5 para las vistas; piel y tela sobre el pesista). Fotos: `node tools/banco.mjs --fotos=dir --lab=materiales` (paso nuevo de `graficos.yml`).
- **Pesistas por parámetros** (`athlete.js`): `ASPECTO` y `Athlete.setAspecto({ piel: {tono, saturacion, variacion, rugosidad,
  sudor, brillo, dispersion}, pelo: {color}, tela: {tinte, plano, arrugas, brillo} })`: son uniforms, no compila nada, y lo que
  no se pasa vuelve al valor por defecto (un modelo compartido no arrastra el aspecto del anterior). En el sombreador: tono de
  piel con parches rojizos y pálidos, segundo lóbulo de transpiración en parches, menos especular de base (F0 a la mitad),
  más dispersión en el borde de sombra, arrugas de tela en las normales visibles desde el plano general, tinte de tela y de
  pelo. `PLANTEL[id].aspecto` en `roster.js` (Ventura y Marangi ya tienen el suyo; `JUGADOR.aspecto` si se quiere). `FINO`
  apaga el detalle fino en «Baja» y «Móvil».
- `barbell.js`: goma de los discos con mapa de rugosidad y relieve, y caras con roces en arco, golpes y magnesio.
- `graficos.yml`: rama `look`, entradas `niveles` y `con_alta`, fotos del laboratorio.

**Calidades.** Móvil y Baja: luz, gradación, texturas (1024/512 en teléfono), utilería sin normales y LED sin grano por
píxel; sin superficies por función, rayos, pared de chapa ni detalle fino del pesista. Media: más el detalle fino del pesista,
LED con grano y normales. Alta: más los rayos y el reflejo. Ultra: más las superficies por función y la pared de chapa.

**Rondas del director de arte** (un agente que solo ve capturas y las referencias de Saltline; puntaje contra Saltline = 10):

| ronda | capturas | Alta | Móvil | lo peor que marcó |
|---|---|---|---|---|
| 1 | `scratchpad/look/r2` | 5 | 3,5 | velo lechoso y halo, desenfoque excesivo, discos grises flotando, piel plástica, luz sin dirección, polvo como nieve |
| 2 | `scratchpad/look/r3` | 5 | 3,5 | piel de cera, cara y pelo de muñeco, marcador ilegible, fondo vacío, jueces y público maniquíes, tela lisa |
| 3 | `scratchpad/look/r4` | 5 | 3,5 | cara de muñeco (ojos fijos, pelo casquete), público de bolos, jueces sin cara, halo en el contorno, tiza al 100 % lava todo, Móvil sin ambiente |
| 4 | `scratchpad/look/r5` | 5 | 3,5 | **1 y 2: el pesista** (cara y cuello, pelo casquete, espalda plana, antebrazos finos: «rehacer modelo»); después público y ayudantes de bolo, jurado sin cara, halo y grano sobre la piel, Móvil sin atmósfera |

En las tres dijo que **mejoró claramente contra el antes** («de juego de celular caricaturesco a casi realista con muñeco
adentro») y que lo mejor es la tarima, los discos y la barra, y la composición del jurado y de la reversa. **El puntaje no
subió de 5 en cuatro rondas** (meta del coordinador: 6,5 y 5; no se alcanzó). Entre la 3 y la 4 se atacó lo repetido: piel
(rugosidad por zonas, sin halo de contraluz, menos especular), desenfoque casi apagado (`uScale` 0,18) y sala con más
presencia (tribunas, pabellón y LED más luminosos). La ronda 4 ya pone primero al **modelo del pesista** (para el frente
`plantel`, ver límites abajo) y dice que la tarima es «el único material que ya está a nivel Saltline». Lo que queda de
sala y post: público y cargadores (cápsulas azules fuera de escala), jueces sin cara, y ambiente de «Móvil» (fondo negro).
Después de la ronda 4 solo se bajó el grano a la mitad (sin ronda nueva).

**Antes y después** (rutas en el scratchpad de la sesión, `/private/tmp/claude-501/-Users-juancavidela-Desktop-tarima/65496069-74a9-4729-8e58-e719d10cf3c8/scratchpad/`):
antes `saltline_ref/tarima_hoy.jpg`; después `look/r5/graficos-out/graficos/fotos/alta_3-4.png`, `alta_frontal.png`,
`alta_jurado-vale.png`, `movil_3-4.png`, `movil_frontal.png`; laboratorio `look/r4/graficos-out/graficos/lab/lab_chapa-usado.png`. Las mismas
fotos salen de cada corrida de `graficos.yml` (artefacto `graficos-out`).

**Costo: NO quedó dentro de lo pedido; falta medir en una placa.** Todo por software en Actions (`graficos.yml` con
`comparar` y `con_alta`, banco alternado contra `prueba` en la misma máquina, ms de un cuadro a 1 MP, media de tres corridas):

| corrida (commit) | Baja prueba → look | Móvil prueba → look | Alta prueba → look |
|---|---|---|---|
| 43794611899 (96c3745, primera versión completa) | 2022 → 2522 (**+25 %**) | 830 → 979 (+18 %, una vuelta) | — |
| 43795590519 (a90d1cf) | 2011 → 2484 (+24 %) | 1343 → 1899 (ruidosa) | 2582 → 3346 (**+30 %**) |
| 43797739944 (9648418: sin detalle fino del pesista ni chapa en el camino directo, discos sin relieve) | 1619 → 1939 (**+20 %**) | 706 → 793 (**+12 %**) | — |
| 43820928256 (94587d7: superficies más baratas, dos rayos, LED sin grano y utilería sin normales en directo) | 997 → 1188 (**+19 %**) | 974 → 954 (ruidosa: 823 a 1179) | 1141 → 1620 (**+42 %**) |

Después de esa última medición, «Alta» quedó **sin superficies por función ni pared de chapa** (`AMBIENTE.alta.superficies =
false`: solo «Ultra» las lleva) y eso **no se volvió a medir**. Lectura: por software cada lectura de textura y cada cuenta por
píxel pesa mucho más que en una placa, así que estos porcentajes son un techo pesimista, pero el pedido era no empeorar el
piso y **en «Baja» sigue 19 % arriba sin causa aislada** (candidatos: la utilería con materiales físicos, los discos
instanciados, el mapa de rugosidad de los discos de la barra, el sombreador del pesista). Próximo paso concreto: agregar al
banco las variantes «sin utilería» y «pesista de antes» para aislarlo, y correr `juego.html?banco=1` en la Mac del dueño
(antes elegía Alta a 2,94 MP con 15 % de margen) y en un teléfono. Si en la placa «Baja» o «Móvil» pierden margen, lo
primero a apagar ahí es `look.props` (una línea en `setNivel`). Generar las texturas suma ~1,2 s de carga en computadora
(madera 2048) y ~0,3 s a 1024, medido en Node con la Mac ocupada; en un teléfono real, sin medir.

**Límites del modelo actual que solo se resuelven en Blender** (no se tocaron mallas, poses ni esqueleto):
- *Cara*: ojos muy abiertos y fijos, sin párpados que cierren ni ceño de esfuerzo (no hay morphs de expresión); cejas pintadas.
- *Pelo*: capas concéntricas con alfa que se leen como casquete; hace falta pelo en tarjetas o mechones con su normal.
- *Máscara*: `*_mask.webp` trae piel, tela y pelo (RGB, sin alfa). Zapatillas y muñequeras caen en «tela»: no se les puede
  dar cuero, suela o toalla por separado sin un cuarto canal o un ID de material. Tampoco hay zonas (codos, rodillas, manos)
  para enrojecer donde corresponde: la variación de tono es por ruido.
- *Malla*: brazos y torso finos para la categoría, mancha oscura en la axila (deformación), manos con poco detalle; costuras
  y pliegues reales de la malla van en el mapa de normales horneado, no en un mosaico.
- Jueces y público siguen siendo modelos por código sin cara (`jueces.js`) y siluetas; los dos cargadores son cápsulas.

**Pendiente / sin medir.** Cuadros por segundo reales en una placa (Mac del dueño y un teléfono): `juego.html?banco=1` antes
y después. El tiempo de generación de texturas en un teléfono real. `USO` todavía no se guarda entre finales ni lo usa el
juego para nada más que el aspecto. Los discos de la barra no llevan superficie por función (se mueven: haría falta espacio
de objeto). La chapa elige su eje por derivadas: en una esfera se estira (en la pared no).

### Jugar en vertical (16-nov, rama `vertical`; LIF-50)

Pedido: la mayoría abre el enlace con el teléfono parado (Instagram, TikTok, WhatsApp) y hasta ahora se le giraba el contenido
90° para jugar acostado. Ahora **se juega parado sin girar nada**; acostado sigue igual. Rama `vertical` desde `prueba`. Nada
fusionado ni publicado.

- **`telefono.js`**: `html.vert` (táctil y más alto que ancho; también tabletas paradas) y `html.angosto` (≤ 380 px).
  `telefono.parado` y `telefono.orientacion` ('vertical'/'horizontal'). Mide y pone en px `--boton-v` (botón redondo, 12,5 %
  del alto entre 84 y 124 px), `--pie-v` (botón + barrita + área segura de abajo) y `--techo-v` (botones chicos + área segura de
  arriba). El contenido girado (`html.rotado`) queda solo con `?vertical=girado`. Pantalla completa ya no fija la orientación.
- **Diseño parado** (`juego.css`, sección «teléfono parado»), una cosa por zona: arriba a la derecha sonido, pausa y ayuda en
  fila; arriba a la izquierda el tablero (sin la columna AHORA/SIGUE ni la personalidad del rival) o la energía; **abajo al
  centro el botón redondo** (igual para las dos manos); **justo encima, LA indicación del momento**: la barrita (sin verbo: el
  botón dice TOCA), la señal o el veredicto (con el veredicto se va el botón y abajo queda «Toca: seguir»); «Saltar» del turno
  de un rival en el lugar del botón. El acuse va sin la tecla dibujada (solo el motivo de un toque que no sirvió). Los paneles
  suben desde abajo, a lo ancho; títulos, tabla (sin la columna de energía) y selector de kilos ajustados al ancho.
- **Cámara** (sin tocar `cameras.js`): `main.js → margenVertical()` le pasa a la cámara `setInsets({t: --techo-v, b: --pie-v})`
  (lo que ya existía para la gráfica), así el encuadre automático pone al pesista y la barra entre el techo y el pie. En
  `stage.js → primerPlano` (3 líneas): con esos márgenes, los primeros planos sin encuadre propio van al centro de lo libre y
  los cerrados del visor (torso, cara…) 1,7 veces más lejos. En el llamado (`encuadreLibre`), parado va **el pesista entero**
  entre el tablero y la explicación de primera vez (o el panel), en lugar del plano americano que el panel cortaba. La cámara
  del levantamiento parado es la lateral (ya era así: `camPrincipal`). **Para la fusión con `pov`**: si `pov` cambia
  `CameraRig.update` o los planos, mantener `inset` (lo usa el juego parado) y que `primerPlano` acepte `encuadre.dAbs`.
- **Explicación de primera vez** (`aprende.js`): parada, la de la esquina va a lo ancho, apilada encima de lo que haya abajo
  (veredicto, «Saltar», botón), recolocada en cada cuadro.
- **Analítica**: súper propiedad `orientacion` en todos los eventos, `orientacion` en `juego_abierto` y evento
  `orientacion_cambio` (`orientacion`, `antes`, `pantalla`) si se gira el teléfono en medio del juego. Para comparar: finales
  terminadas, `siguio_jugando` y el cartel por `orientacion`.
- **Pruebas**: `check_telefono` suma `vertical_390x844` (iPhone con muesca: final entera solo con toques, dos dedos, toque en el
  borde), `vertical_375x667` en inglés hasta el cartel de anotarse (`?muro=firme&etapa=arranque`) y `vertical_430x932`; mide el
  tapado, el alto del panel del llamado (tope 40 %), que el botón principal de cada panel quede en la mitad de abajo (pulgar),
  y que al girar a horizontal y volver cada orientación use su diseño y salgan los eventos. `telefono.yml` tiene la entrada
  `solo` (p. ej. `-f solo=vertical`) para correr solo esos casos.

**Medido** (Actions, por software): tapado del pesista (`tools/tapa.mjs`) en 390×844 (es), 375×667 (en) y 430×932 (es): **0 % del cuerpo en el
llamado (con la explicación de primera vez encima del panel), con la barrita quieta y corriendo, en el levantamiento y en el
turno de un rival** (antes de corregir: 35 % en el llamado, 13 % con la barrita, 15–17 % la explicación); veredicto 14 % (el
cartel tapa los pies un momento; sin tope); explicación «luces» 7–15 % (lo tapa el tablero, no el cartelito: 0 %). Panel del
llamado 141 px = 15–21 % del alto (tope 40 %); botón principal de cada panel entre 0,80 y 0,93 del alto (pulgar). Final entera en
390×844 solo con toques: 6 válidos, 17 toques (todos aceptados), podio. Cartel de anotarse parado en inglés (375×667) entra sin
desplazar. Girar a horizontal y volver: diseño correcto y eventos `orientacion_cambio`. Acostado sin cambios (844×390: llamado
0 %, barrita ≤ 13 %, como antes). Corridas: teléfono `solo=vertical` 43826541641 en verde. Capturas miradas: 390×844 de punta a
punta (inicio, presentación, apertura, llamado con la explicación, barrita, levantamiento con la barra arriba, veredicto, turno
de un rival con «Cambiar», intervalo, ceremonia), 375×667 en inglés (inicio, presentación, cartel), 430×932 y 667×375 acostado
después de girar.

**Pendiente / estimación.** Verlo en un teléfono de verdad (Safari con la barra de abajo, teclado del editor parado). El reloj y
las luces quedan arriba a la derecha, chicos: en el veredicto las luces quedan cerca de la barra arriba de la cabeza. La
ceremonia y los planos cerrados se alejaron a ojo (×1,7): revisar con el arte nuevo de `look`. Medir en PostHog la retención por
`orientacion` antes de decidir si vale una cámara propia para vertical más cerca.

### Plantel paramétrico (16-nov, rama `plantel`): A MEDIAS, no cumple la meta visual del dueño

**Estado: sin terminar.** El dueño fijó la meta «tienen que parecer personas reales» (nota de 7 o más en el conjunto y
ninguna parte bajo 6, con director de arte a ciegas puntuando cara, piel, pelo, cuerpo, manos y ropa). **Nunca se midió con
esa escala** y la única crítica a ciegas hecha (ronda 1, sin nota) dice que ninguno de los cuatro pasa por atleta de
transmisión. Todo lo visual pasa a otro agente; esto queda como punto de partida. Cómo se usa el sistema: `docs/PLANTEL.md`.

**Qué funciona.**
- `blender/plantel.py` (género, categoría IWF, estatura, masa, proporciones, piel, pelo, uniforme), masa por volumen
  (`MASA`), proporciones como metas del esqueleto (`PROP`), cuerpo femenino, pelo atado, barra por género, segunda máscara.
- `pesistas.yml` construye en Actions (un trabajo por pesista, 16 a 22 min en modo completo). `tools/sumar_pesista.py` y
  `tools/plantel_web.py` los suman al juego; `?plantel=` y las fichas del visor ya están.
- Corrida **43827465589** (sobre `fe37d99`): solanet, halvard, ilarraz y jastrev con **0 BAD** en `check()`. Peores valores:
  barra-malla -0,6 cm en los cuatro, cápsula-rack +0,0 a +0,1 cm, codo-rack 0,0 a -1,6 cm. Ilarraz no alcanza dos metas
  (tibia y antebrazo, targets al tope).

**Qué NO está hecho.**
- **Los cuatro modelos nuevos no están en `web/models` ni en `web/data/poses.json`**; `plantel.json` los sigue marcando
  `listo: false`. No se corrieron `pruebas.yml` ni `graficos.yml` con el plantel.
- Hubo **una sola** ronda de director de arte (sobre 43827465589). La segunda no se llegó a mirar.
- Corrida **43875357534** (sobre `b05f1af`, correcciones de la ronda 1), leída del log después del cierre: **0 BAD en los
  cuatro**, masas en objetivo (48,0 / 111,9 / 65,0 / 145,8 kg), hombros de jastrev de 0,258 a 0,243. **Las imágenes no se
  miraron**: no se sabe si las correcciones se ven bien. Sus artefactos (retención 14 días) son los que hay que mirar y sumar.

**Ronda 1 del director de arte (a ciegas, sin nota; dos agentes: retratos y hojas).**
- Bloqueantes de retratos: ojos cerrados o caídos en los cuatro; pezones marcados bajo la malla en las dos mujeres; el brazo
  se infla al flexionar el codo en el rack (peor en jastrev); los glúteos se inflan como globos en sentadilla y salida (peor
  en halvard). Propios: barba de jastrev sin bigote y con borde pixelado, y su biotipo en V de culturista en vez de tronco en
  barril; halvard con cara de bebé, cuero cabelludo visible y masa sedentaria.
- Importantes: línea del pelo a serrucho y frente enorme, pelo de casco, cejas de bloque, la misma boca en los cuatro,
  postura de pie abatida, malla que lee como piel pintada, dedos en abanico en el rack, rodilleras de bola, piel uniforme.
- Hojas de poses (valen también para las reglas, no solo para estos cuerpos; son estimaciones a ojo del revisor, sin medir):
  la barra del rack queda a la altura del mentón y no sobre deltoides y clavículas; codos del rack convergen al centro;
  en el Tirón de brazos de la cargada los codos pasan la altura del hombro; agarre de envión angosto para los pesados;
  recepción del power y del squat jerk con el tronco inclinado; valgo de rodillas en el fondo del squat jerk; las poses
  son casi iguales entre biotipos. La guía punteada de snatch y clean no coincide con la marca del medio pie: sin verificar.
- Lo que dijo que está bien: ilarraz es el más creíble; cinturón, paletas, letras, vendas y zapatillas.

**Lo que se cambió por la ronda 1 (`b05f1af`, sin verificar en imágenes).** Ojos: `eye-*-slit` de 0,75 a 0,22 y sin
`closure`. Busto: alisado con zona más baja y 45 pasadas (8 en el hombre). Glúteos: de 0,65/0,50 a 0,30/0,25 y menos en el
paquete de volumen (más tronco y panza, menos brazo). El pesado con grasa no ensancha hombros, sin torso en V, más cintura
y panza. Mujer: más hombro y cuello. Frente más baja (`forehead-scale-vert-decr`), labios más finos, comisuras arriba.
Bigote: la franja labio-nariz se achica con esa distancia. Sisa del hombre más alta con grasa. No se tocó: piel, pelo y
línea del pelo, cejas, deformación en flexión (codo, rodilla), manos, postura, ni ninguna regla de poses.

**Cápsula del pecho (`chestU`): PENDIENTE DE APROBACIÓN DEL DUEÑO.** Está aislada en el commit `95bf4fd` (solo
`blender/poses.py`; `dc5edcc` saca la versión que venía mezclada en `5cf10f8`). Se saca con `git revert 95bf4fd`.
- Qué toca: `bar_clear()`, el proxy de cápsulas que usan `check()` (barra-cuerpo y cápsula-rack) y el desvío de la barra.
  La cápsula del pecho pasa de un radio único (`chestF`) a bajar hacia un radio medido en el pecho alto en el 65 % superior.
  La columna barra-malla de `check()` (malla real) no cambia.
- Por qué: sin ella, halvard daba 10 BAD barra-cuerpo (corrida 43823507357: Giro de codos 5 a 8 y Envión · Impulso 3 y 4)
  con la barra a 1,0 a 7,0 cm de la malla real en esos mismos cuadros. Con ella, 0 BAD.
- Alcance real: no es solo halvard. `chestU` es menor que `chestF` en los cuatro (solanet 11,7 contra 16,0 cm; halvard
  17,6 contra 23,5; ilarraz 15,0 contra 16,2; jastrev 19,4 contra 21,9). **En ventura y brenner no se midió**: no se
  reconstruyeron con este commit, y si su `chestU` sale menor, su `check()` también cambia.
- Alternativa que no toca `check()`: rama `plantel-alt-capsula` (commit «EXPERIMENTO», no fusionar): cápsula vieja
  (`TARIMA_CHESTU=0`) y la barra desviada hacia adelante por regla en la entrada y la salida del rack (`TARIMA_ALTPUSH=1`).
  Corrida **43874816087** (halvard, completo), leída del log después del cierre: **no sirve tal como está, 9 BAD** (contra 10
  sin nada y 0 con `chestU`). Para esquivar la cápsula vieja la barra tiene que irse adelante hasta 8,6 cm al entrar al rack
  (Giro de codos→Recepción) y 6,1 a 8,2 cm al salir (Impulso→Empuje), y aun así quedan 8 cuadros barra-cuerpo (en ellos la
  malla real está a 3,2 a 8,3 cm) y aparece un zigzag de barra de 1,09 m/s en el squat jerk. No se miraron sus hojas. Es un
  solo intento de alternativa, no prueba que no exista otra.

**Límite conocido.** Con el antebrazo más largo que el brazo (más de 0,51) el codo no llega al rack y `check()` lo marca.

### Gráficos fase 4: personas, no muñecos (16-nov, rama `visual`, desde `prueba` + `plantel`)

Meta del dueño: nivel Saltline («detalle fino») y su sensación de respuesta. Meta medible: director de arte a ciegas (solo
capturas, junto a las de Saltline) con 7/10 o más en el conjunto de Alta y en el pesista, ninguna parte bajo 6 y Móvil 6 o
más. No se acepta una tanda que puntúe peor que la anterior. Nada fusionado a `main` ni publicado.

**Plan (escrito antes de tocar código).** Diagnóstico mirando las capturas de `prueba` (Alta y Móvil), los retratos del
plantel (corrida 43875357534) y las de Saltline: la sala, la tarima, la barra y los discos ya tienen material y luz; lo que
delata «juego de muñecos» son **las personas**, todas:

| Qué se ve hoy | Por qué se lee a muñeco o plástico | Qué cambia |
|---|---|---|
| Pesista: cara | línea del pelo recta como un casco pintado, sin patillas ni entradas redondeadas; cejas de bloque; labios pintados y saturados; piel pareja; ojos chicos y fijos | `tex.py`: nacimiento del pelo como curva (pico, entradas, sien, patilla) con borde por densidad; cejas por pelos; labios del tono de la piel con borde difuso; zonas de color (frente, nariz, mejillas, orejas, nudillos, codos, rodillas), lunares y poro por zona |
| Pesista: pelo | capas con alfa pegadas al cráneo: no hay volumen ni silueta | más largo y capas arriba que a los costados, mechones con largo desparejo; brillo anisótropo en el visor |
| Pesista: piel en el juego | normales de detalle en ronchas (se lee arcilla mojada), sombra roja saturada bajo el mentón, costura dura en el cuello | sombreador: detalle fino solo como rugosidad y poro, dispersión acotada (sin rojo en sombra propia), especular de dos lóbulos más bajo |
| Pesista: cuerpo | brazos que se inflan al flexionar, glúteos de globo (corregido en `b05f1af`, sin mirar) | mirar la corrida 43875357534 y corregir por regla lo que quede |
| Público | bolos: una elipse de cabeza sobre un trapecio, todos iguales y nítidos | personas modeladas por código (hombros, brazos, regazo, pelo, cabeza con cuello), dibujadas una vez a un atlas con luz de sala y contraluz del escenario; variantes y gestos; más oscuras y fuera de foco |
| Jueces y mesas | maniquíes de cápsulas y esferas | el mismo constructor de personas con más detalle (nuca, orejas, pelo con volumen, cuello de camisa, hombros de saco, manos) |
| Cargadores | cápsulas azules | personas de pie del mismo constructor |
| Móvil | fondo negro con manchas (tribuna horneada de elipses), sin atmósfera | tribuna horneada desde el atlas de personas, degradé de bruma y luz de sala horneados en lo que ya se dibuja (sin capas nuevas por píxel) |
| Movimiento | (a medir) saltos entre fases, pies que deslizan, barra rígida | medir con las hojas cuadro a cuadro y `check_fluidez`; después interpolación, anclaje de pies y flexión de barra |

Orden: (1) personas por código en three.js (público, jueces, cargadores, Móvil) mientras corren los builds de Blender;
(2) cara, pelo y piel del pesista en Blender (builds en Actions: `pesistas.yml`) y su sombreador en el visor; (3) plantel
nuevo dentro del juego; (4) fluidez. Después de cada tanda, ronda del director a ciegas con las mismas tomas.

**Iterar texturas del pesista sin Blender.** `pesistas.yml` sube `maps_1024.npz` (los mapas de horneado a un cuarto) en el
artefacto de cada pesista. Con eso `blender/tex.py` corre con numpy en segundos:
`TARIMA_OUT=<carpeta>/ python3 blender/tex.py <nombre> 1024` (la carpeta tiene `<nombre>/maps.npz`, `lm.json`, `bones.json`,
`bones_all.json`). Sirve para la línea del pelo, cejas, labios y zonas de color; el detalle fino se mira en el build.
**Sesión 2 (16-nov a la tarde, otro agente Fable): `pov` fusionada acá y plan de lo que sigue.** `visual` ya trae `pov`
(`abc1a39`: primera persona con la cámara que acompaña a la barra y final sin movimientos de cámara). Meta medida (DoD):
director a ciegas con conjunto Alta ≥ 7, pesista ≥ 7, primera persona ≥ 7, final ≥ 7, Móvil ≥ 6 y ninguna parte bajo 6.

Diagnóstico al empezar (fotos de la tanda 3, corrida 43922579093, y retratos de Blender de la 43918976509):
- El **mismo pesista se ve mejor en el retrato de Blender que en el juego**: la piel del juego tiene un relieve de escamas
  con vetas blancas de brillo (normales de detalle en mosaico), la ceja y el nacimiento del pelo salen duros, y la malla
  no tiene espesor ni costura (lee a piel pintada). El problema principal está en el sombreador del visor, no en la malla.
- **Público**: maniquíes claros, nítidos y parejos; en una transmisión real la tribuna es penumbra con bultos, algún brillo
  y fuera de foco. **Jueces**: caras lisas. **Focos**: discos blancos sin halo. **Móvil**: fondo plano.
- **Primera persona**: 5/10 en la última ronda puntuada; la versión rehecha (`abc1a39`) no tiene nota.

Tres frentes en paralelo, cada uno en su rama desde `visual` (se fusionan acá y la ronda del director es sobre `visual`):

| Rama | Archivos | Qué busca |
|---|---|---|
| `v-pesista` | `web/js/athlete.js` (sombreadores de piel, pelo, tela, ojos), `blender/tex.py`, `pesistas.yml`, `lab.js` (piel y tela) | Piel sin escamas (poro solo en rugosidad, brillo roto y bajo, dispersión en el terminador), pelo corto con borde difuso y brillo anisótropo, cejas y pestañas por pelos, malla con espesor en el borde, costuras y trama, rodilleras y vendas de tela, manos; que el juego se vea como el retrato de Blender o mejor |
| `v-sala` | `gente.js`, `publico*.js`, `jueces.js`, `arena.js`, `look.js`, `ambiente.js`, `post.js`, `lighting.js`, `barbell.js`, `materiales.js` | Tribuna en penumbra y fuera de foco con contraluces, jueces y oficiales con cara, focos con halo y destello, fondo con profundidad (estructura, banderas, pantallas), discos y barra con uso y moleteado, y un «Móvil» con ambiente (todo horneado, sin costo por píxel) |
| `v-pov` | `stage.js`, `cameras.js`, `main.js`, `caida.js`, `check_pov.mjs` (y solo lo de primera persona en `athlete.js`) | La foto del joystick: horizonte derecho, manos y antebrazos grandes y nítidos en el tercio inferior, barra cruzando el cuadro, jueces y público al frente, nunca el piso en picado ni el torso; respiración, temblor y dip sin marear; barrita usable. Final: plano quieto con pesista, luces y puntuación; gesto de festejo o bronca por regla. Fluidez: transiciones, pies y barra que flexiona |

Iteración rápida de fotos: `gh workflow run graficos.yml --ref <rama> -f solo=fotos -f niveles=alta -f tomas=3-4,medio,cara`
(entradas nuevas `tomas` y `solo`). `PESISTAS_RUN` pasa a la corrida 43918976509 (texturas de `0068995`).

**Dirección de arte decidida (16-nov, el dueño delegó):** semirrealista heroico, con la imagen del dueño
(`~/Desktop/tarima/referencias-codex/03-referencia-original/referencia-usuario.png`) como vara del pesista y de la sala, junto
a Saltline. Los pesistas siguen ficticios. Pedidos del dueño de esa tarde: brazos, hombro y cuello naturales («como un
humano»), y la barra que se suelta hacia adelante como una caída real.

**Rondas del director a ciegas de la sesión 2** (carpetas y notas completas en `~/tarima-datos/ver_visual/ronda*/NOTAS.md`).
Desde la ronda 2 el director tiene la imagen objetivo; la base se repuntuó con ese criterio (1b). Ruido del método: ±0,5.

| ronda | commit | pesista | sala | materiales | luz | público y jueces | conjunto Alta | Móvil | 1.ª persona | final |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 (criterio viejo) | 38086eb | 5 | 5 | 6,5 | 5 | 3,5 | 5,5 | 4,5 | 4 | 4,5 |
| 1b (base, criterio nuevo) | 38086eb | 4 | 5 | 6 | 5 | 3 | 5 | 4,5 | — | — |
| 2 (sala 1.ª pasada) | e51f4c0 | 4,5 | 5 | 6 | 5 | 3 | 5 | 4 | — | — |
| 3 (sala 2.ª + pesista 1.ª) | c6bb768 | 4,5 | 5,5 | 6,5 | 5,5 | 3,5 | 5,5 | 4,5 | — | — |
| 4 (sala 3.ª + pesista 2.ª + final nuevo) | 6ee2ad5 | 5,5 | 6 | 6,5 | 6 | 4,5 | 6 | 5 | — (se rehace) | 5 |
| 5 (sala 4.ª + pesista 3.ª + final 2.ª) | 5373038 | 5 | 6,5 | 6,5 | 6 | 4 | 6 | 5 | — (se rehace) | 6,5 |

Partes del pesista en la ronda 4: cara 4,5, piel 6, pelo y barba 4, anatomía 5, manos 4, ropa 6,5 (ronda 3: 4 / 5 / 3,5 / 4,5 / 3,5 / 6).
La primera persona se rehace por pedido del dueño (16-nov a la noche): vista realista desde los ojos (se ve el jurado; los
brazos solo cuando mira abajo o cuando la barra cruza la vista), cabeza leve, tensión previa y un recuadro chico con el
levantamiento desde afuera. `pruebas.yml` en verde en `6ee2ad5` (los cuatro grupos).
Meta: conjunto, pesista, primera persona y final ≥ 7; Móvil ≥ 6; nada bajo 6. **No se llegó; sigue en curso.**

**Actions por software contra la Mac del dueño (M1 Pro, Metal):** misma imagen (diferencia media de 0,4 a 2,1 sobre 255 por
canal en 12 tomas de `38086eb`); las rondas se siguen puntuando con fotos de Actions. **Costo:** Alta, Ultra y Media sin tope
(decisión con el dueño: mejor imagen); Móvil y Baja ≤ +10 % contra `prueba`. Medido en la 2.ª pasada de sala: Baja +7 %;
Móvil sin lectura comparable (hay que repetirla con los mismos MP en las dos ramas).

**Cápsula del pecho (`chestU`, `95bf4fd`): sigue PENDIENTE DE APROBACIÓN DEL DUEÑO.** La alternativa por regla
(`plantel-alt-capsula`) dio 9 BAD en halvard, así que no reemplaza a `chestU`. Los cuatro del plantel dan 0 BAD con `95bf4fd`
(corridas 43875357534 y 43918976509); queda aislado en ese commit y se saca con `git revert 95bf4fd`.

### Primera persona y el final del levantamiento (16-nov, rama `pov`, desde `prueba`)

Pedido del dueño después de probar `prueba`: «cuando terminás el levantamiento hacen movimientos medio raros. Yo quiero poder
cambiar la vista y ser un point of view y hacer el levantamiento como si lo estuviera haciendo yo realmente». Nada fusionado ni
publicado. El look (luces, materiales, texturas) lo lleva otro agente: acá no se tocó `arena.js`, `ambiente.js` ni `post.js`.

**1. Vista «Primera persona / First person»** (`stage.js`: `POV`, `_povCam`, `ojos`, `_cabeza`; `cameras.js`: `rig.propia`).
Quinta cámara de la fila de Opciones, de la tecla V y `?camara=pov`; se recuerda en `tarima.camara` y deja `camara_elegida`
con `vista: 'pov'`. Reglas (todas en `POV`, iguales para los dos biotipos y cualquier fase; nada por personaje):
- *Posición*: los ojos salen de los huesos (cabeza + 10 cm a lo largo del cuello + 8,5 cm hacia el frente del tronco, por
  estatura), con un filtro corto. No se copia el giro de la cabeza: la mirada es sintética, siempre al frente, sin guiñada.
- *La barra y las manos se ven siempre* (pedido del dueño). La mirada apunta a la barra con un corrimiento, con retardo y
  tope de velocidad (`giroMax`, 150 °/s). Tres casos, por dónde está la barra y cómo está el cuerpo (nada por fase ni personaje):
  · *De pie con la barra abajo* (parado, segundo tirón): mirada adelante y abajo (hasta −58°), lente abierto a 88° (como una
    cámara de casco), cuerpo entero; la cámara va 7 cm por delante de los ojos para que el pecho no tape la barra.
  · *Agachado* (salida y primer tirón: los ojos a más de 30 cm por delante de la cadera, `kT`): la barra queda debajo y detrás
    de los ojos, así que la mirada baja a −80° y el tronco propio no se dibuja (era el pecho y la entrepierna llenando la
    imagen). Se ven los antebrazos enteros, las manos en la barra, las rodillas y los pies. No se ven los jueces.
  · *Barra en los hombros o arriba*: barra y manos abajo o arriba, jueces y público al frente (sin cambios de fondo).
- *Licencia de la vista*: con la barra en los hombros la cámara retrocede 12 cm y con la barra arriba 38 cm; con el agarre
  ancho del arranque, lo que haga falta para que entren las dos manos (`agarre`, hasta 75 cm). Desde los ojos de verdad la
  barra en los hombros queda bajo el mentón y la de arriba detrás de la frente.
- *Cuerpo propio* (`_cabeza`, `_torso`; `athlete.js`: `pesoCabeza`, atributos `aCabeza` y `aTorso`): la cabeza no se dibuja
  (el cuello se achica a un punto; pelo, ojos y pestañas se apagan y lo que queda se pinta de piel lisa, `uPiel`) mientras
  la cámara esté en esta vista o a menos de 60 cm de los ojos. Agachado, tampoco el tronco (columna, clavículas y cuello: el
  sombreador descarta esos fragmentos, `uSinTorso`, con una trama de 0,1 s al entrar y salir) ni el cinturón. En primera
  persona el cuerpo se dibuja de los dos lados. La sombra sale entera salvo la cabeza.
- *Barra suelta*: la mirada la sigue mientras cae y, cuando lleva 0,45 s quieta, sube a los jueces (`jueces`). Si cae
  detrás no se la ve: la mirada queda al frente (girar la cabeza a buscarla, `vuelta`, se probó y quedó apagado: el hombro
  propio tapaba media imagen).
- *Sensación*: lente de 76° de alto (112° de ancho como mucho en pantallas muy anchas), respiración (4 mm y décimas de
  grado), temblor del esfuerzo, el dip y el temblor de `CamaraViva` al recibir, y la barrita de timing cierra el lente un
  poco. Con movimiento reducido, nada de eso.
- *En el juego* (`main.js`): es solo de los levantamientos propios; a un rival se lo mira desde la general (`camVista`).
  Mientras dura no hay planos de afuera (ni el de los brazos en la fijación, ni jurado, ni caída, ni giro al público): el
  veredicto se ve desde los ojos. A los ojos se entra en 0,3 s, girando por rumbo e inclinación (horizonte nivelado). Llamado, paneles y repetición siguen en tercera persona.
  La barrita de timing no cambia (es HTML encima del lienzo): `check_barra --camara=pov` juega tres arranques y pega en
  el verde, el amarillo y el rojo donde se toca.

**2. Lo raro después del levantamiento: qué era y cómo quedó.** Diagnóstico con `tools/check_pov.mjs` (hojas de fotos cada
0,15 s y medidas a 60 c/s) y con tres arranques jugados (`check_barra --final`: 32 fotos desde que termina cada intento).
| Qué se veía | Causa | Arreglo (regla) |
|---|---|---|
| Brazos arriba medio segundo sin la barra, después en cruz (pose en T) y hacia adelante | `poseCaida` mezclaba en línea recta de la pose del final a «Parado», empezando 0,5 s después de soltar | Los brazos desandan el clip por fases desde que se suelta la barra (recepción → giro → tirón de brazos → triple extensión) y enseguida bajan; en el envión bajan directo por los costados (las poses del empuje tienen las manos por donde cae la barra). Salen 0,2 s después que la barra: van detrás (`caida.js`: `clavesBrazos`, `DESANDAR`, `MANOS`; `athlete.js`: `setParts`) |
| Pies que se arrastran (26 a 31 cm en un válido, 100 a 150 cm sumando los dos pies al salir de la sentadilla o la tijera) | La misma mezcla en línea recta desde la tijera o la sentadilla | El cuerpo sigue el clip hasta el final del segmento (la recuperación validada, 0,5 s por fase) y pasa a «Parado» con un saltito de 4 cm y 0,3 s. Medido: 0,3 a 0,6 cm en los válidos |
| En el válido propio, tres movimientos de cámara encadenados en menos de 3 s; en el giro al público la cámara le pasaba al pesista por al lado | `decision()`: jurado (1,3 s), interrumpido a los 0,7 s por el plano de la caída, y a los 1,8 s el giro; y `_mezclar` iba por la cuerda | Válido propio: un solo movimiento, al jurado, y se queda (como el nulo). `_mezclar` rodea al sujeto en arco |
| De pie como una estatua mientras se lee el veredicto | No había nada | Respiración agitada del tronco (`RESPIRA`: 0,9° por hueso a 0,55 Hz), nada con movimiento reducido |
Sin regenerar nada en Blender: todo es reproducción (`caida.js`, `athlete.js`, `stage.js`, `cameras.js`, `main.js`).
**Un defecto del clip que quedó a la vista**: entre «Giro de codos» y «Recepción» de la cargada el brazo gira 58° entre dos
muestras vecinas (3500 a 3900 °/s al desandarlo muestra por muestra). En el levantamiento normal es el latigazo de codos y
no molesta; por eso los brazos del final van de fase en fase y no muestra por muestra.

**Herramientas nuevas.** `tools/check_pov.mjs` (A: finales con medidas; B: primera persona, hojas y reglas: imagen no vacía,
cabeza oculta, giro de la mirada ≤ 160 °/s, cámara a ≤ 80 cm de la cabeza; la velocidad se mide con el reloj del juego detenido), `tools/hojas.mjs` (hojas de contactos),
`check_barra --camara= --final --out=`, y en `JUEGO.test`: `posa()` y `medir()`. Job `pov` en `graficos.yml` (artefacto `pov-out`).

**Dirección de arte a ciegas (16-nov, cinco rondas; un agente nuevo por ronda, solo imágenes, sin telemetría ni código).**
78 imágenes por ronda, sacadas en esta máquina con `check_pov` y `check_barra --final` (armadas con el guion de
`scratchpad/herr/pov_armar.sh`). Meta del coordinador: 7/10 en primera persona y 6/10 en el final. **No se llegó en primera persona.**
| Ronda | Commit | Primera persona | Final | Qué se cambió después |
|---|---|---|---|---|
| 1 | 2be6076 | no aprobado (sin nota) | aprobado con observaciones | Pelo, ojos y barba propios apagados y cuello pintado de piel (pozo oscuro entre las clavículas); entrada a los ojos con el horizonte nivelado; mirada adelante y abajo |
| 2 | f7f9b85 | 5,5 | 6 | Fuera la trama de puntos del cuerpo propio; la mirada sube a los jueces después de soltar |
| 3 | 3f362d5 | 5 | 6 | Fuera los antebrazos cortados: agachado la cámara queda en los ojos, mira casi a plomo y no dibuja el tronco |
| 4 | d16fc16 | 6 | 6 | Giro de cabeza hacia la barra caída atrás; barra en los hombros más abajo; pararse de la sentadilla en 0,8 s por fase |
| 5 | ae1259e | 5 | 6 | Se deshicieron los dos cambios que la ronda 5 marcó como graves (giro de cabeza y encuadre de los hombros). El estado final es el de la ronda 4 con la mirada agachado a −80° (era −87°), la cámara 7 cm adelante de pie y el pararse más lento. **Ese estado final no pasó por otra ronda.** |
| 6 | abc1a39 | 4 (ronda 1 de la sesión 2, director del conjunto) | 4,5 | Primera persona rehecha como un juego en primera persona (abajo) |

**Sesión 2 (rama `v-pov`, 16-nov a la noche): primera persona como un juego en primera persona.** La ronda sobre `abc1a39`
(4 y 4,5) marcó: brazos que entran desde arriba y se deshacen en punteado, torso propio a la vista, la cámara que sube 35° en
el envión y pierde a los jueces, picado al piso al soltar, cámara general que se reencuadra después de soltar, hojas sin
luces ni veredicto, brazos en T y «soldado» igual en válido y nulo. Lo que cambió (reglas, iguales para todo biotipo):
- **La cámara está siempre en los ojos y la mirada no se inclina nunca** (`POV.barra[2]`, −9°): ni con la barra arriba ni al
  soltarla. Sube y baja con el cuerpo (agachado en la salida, de pie al final). `check_pov` falla si se inclina más de 3°.
- **Brazos de primera persona** (`POV.vm`, `_povCam` y `_vm` en `stage.js`): el cuerpo propio y la barra se DIBUJAN girados
  alrededor de la línea de los hombros hasta que el brazo apunta al frente (`vm.at` con la barra tomada, `vm.libre` con las
  manos sueltas) o, con la barra arriba, hasta `vm.alto` (35° sobre el horizonte), y corridos al frente (`vm.dz`). Los brazos
  entran por el borde de abajo, las manos y la barra quedan en el tercio inferior (o la barra en el cuarto de arriba) y al
  frente siempre están los jueces. Es solo dibujo: se aplica antes del pase de imagen y se deshace después; huesos, barra,
  física, reflejo y medidas no cambian. Con el cuerpo girado la sombra no se actualiza (saldría la del cuerpo girado).
- Del cuerpo propio se dibujan **solo los brazos, enteros y sin trama** (`uSinTorso` 1, `uCorte` 0,8; se sacó el punteado
  contra el borde): el corte del hombro queda fuera de la imagen por regla.
- La barra acompaña a las manos con `kA` (1 tomada; al soltarla pasa a su lugar real a 4 por segundo: se la ve caer).
- **Final**: `rig.fijo` congela el encuadre de la cámara general desde que se suelta la barra (antes el borde de arriba seguía
  a la barra que caía: reencuadre de 0,6 s); `check_pov` mide cuánto se corre y gira la cámara tras soltar y falla con más de
  2 cm o 0,2°. Brazos: con la barra soltada desde arriba **barren por delante** (`BARRIDO`, `_gesto`), ya no desandan el clip
  (codos altos y cruz). **Gesto por regla** (`GESTO`): válido = dos puños que marcan dos veces y vuelven a colgar; nulo o
  fallo = cabeza que cae, hombros vencidos y negación.
- **Soltar la barra como en una tarima de verdad** (pedido del dueño, 16-nov a la noche; `caida.js`: `GUIA`, `BarraGuiada`;
  `stage.js`: `_manosEnBarra`). Levantamiento terminado (válido o nulo de los jueces): la barra **baja en las manos** por
  delante, de arriba de la cabeza al pecho (0,5 s, cada vez más rápido; 30 cm delante de los hombros y 14 cm debajo), los
  brazos se resuelven con dos huesos para que la muñeca vaya junto a la barra (codo hacia afuera y abajo); ahí se suelta
  hacia adelante con la velocidad que traía, las manos quedan abiertas al frente 0,16 s y cuelgan en 0,45 s; **paso corto
  hacia atrás** (11 cm, con un saltito) mientras cae. La barra rebota (coeficiente 0,32: ~10 % de la altura), rueda y
  flexiona con el golpe (`barbell.step`, ya estaba), con sonido y temblor. Después, el gesto. Fallo con la barra arriba:
  como antes, sale lejos y el pesista salta atrás (adelante) o sale adelante (atrás); los brazos esperan 0,42 s y barren por
  delante con el codo doblado (`BARRIDO`). `check_escenas` (holgura barra-cuerpo) en verde: los brazos se miden desde 0,25 s
  después de que las manos sueltan.
- Hojas: `finalEn` prende las luces y el veredicto como el juego; `check_pov --solo=claves --q=alta --plantel=…` saca las
  fases clave con calidad alta y el plantel nuevo (`out/pov_alta`); `check_barra --solo=tel_en --camara=pov` el teléfono.
Medido en la última corrida (43949153444, `check_pov` en verde): mirada fija en −9° en los cinco segmentos y los dos modelos
(giro ≤ 1 °/s), cámara a ≤ 19 cm del hueso de la cabeza, cámara general tras soltar ≤ 3,7 cm (el temblor del golpe) y 0,00°.
Hojas en `~/tarima-datos/ver_visual/pov/` (`claves_alta/`: fases clave con calidad alta y el plantel nuevo; `hojas/`; `final/`;
`jugado/`: arranques jugados con la barrita, en computadora y en teléfono acostado; `antes/`: lo que miró la ronda 1).
**Sin nota de director a ciegas todavía** (la pone el coordinador sobre `visual`). Lo que queda a la vista:
- manos en los hombros con los dedos abiertos (es la pose del clip: se arregla en `poses.py`, no acá);
- en el giro de codos y el empuje (una o dos décimas) asoma el corte del brazo contra el borde de abajo;
- en el arranque el agarre es ancho y las manos quedan contra los bordes de la imagen;
- la barra dibujada con las manos no proyecta sombra propia (la sombra se congela mientras el cuerpo se dibuja movido);
- en una ventana más alta que ancha la cámara sigue siendo la lateral; sin probar en una placa real ni en un teléfono.
**Cambio de rumbo del dueño (17-nov), que REEMPLAZA a los «brazos de primera persona» de arriba** (`POV.vm`, `_vm`: se
sacaron). Sus palabras: «generalmente uno mira para adelante, no se ve los brazos… debería ver más al jurado»; «movimientos de
cabeza… un poco más leves»; «el momento de tensión antes»; «una pantalla tipo chiquitita de cómo se hace el movimiento».
- **La cámara son los ojos de verdad** (`_povCam`, reglas en `POV`): el cuerpo propio y la barra se dibujan donde están (sin
  cabeza ni tronco; lo que queda a menos de 24 cm de la cámara se corta por distancia, sin trama: `uCercaOjo`; las piernas y
  las zapatillas sí se dibujan). La **mirada es una intención, por fases**, con un resorte con amortiguamiento crítico y tope
  de 0,9 rad/s (52 °/s): al frente (un punto fijo apenas sobre el jurado); baja a la barra cuando las manos van a tomarla,
  la sigue mirando 0,55 s y levanta la vista; fija durante el levantamiento (la barra cruza la vista de verdad y queda
  arriba, fuera de la imagen); al soltar baja 11° detrás del golpe y vuelve al jurado (y mira al costado si la barra se fue
  atrás). Con movimiento reducido, fija al frente.
- **Tensión**: mientras corre la barrita (el lente ya se cerraba) la respiración es 3,4 veces más honda, la imagen late (dos
  golpes por latido en el lente) y se oscurece en los bordes (`velo`).
- **Recuadro «doble visión»** (`RECUADRO`, `_recuadro`, `_propio`): la vista general fija en una pantalla chica arriba a la
  derecha (24 % del ancho; 27 % en pantallas angostas), con el pesista entero. Con post: a una textura propia, un cuadro de
  cada dos, y a la pantalla con el pase final. En el camino directo («Baja», «Móvil»): se dibuja en su rincón en cada cuadro.
  Sin sombras nuevas. Opciones: «Con recuadro / Sin recuadro» al lado de la cámara (o `?recuadro=no`); se recuerda en
  `tarima.recuadro`. **Costo sin medir en una placa.**
- **Paso atrás con los pies** al soltar (`_pasoAtras`: cada pierna se resuelve con dos huesos; un pie y después el otro), el
  codo ya no pega un latigazo al aflojar (brazo nunca del todo recto y entrada en 0,22 s), cámara del jurado más cerca y más
  alta, y `renderer.debug.onShaderError` puesto desde antes de armar la escena (el constructor ya compila programas: es la
  causa probable de que `check_carga_fallas [shader compu]` fallara a veces).
- `check_pov`: tiras a tiempo real desde los ojos (`tira_*`: preparación completa, levantamiento y final cada 0,1 s, con el
  recuadro); reglas: mirada ≤ 60 °/s, cámara a ≤ 15 cm de los ojos, cabeza y tronco propios sin dibujar, recuadro presente.

**Final, después de la ronda 4 del director (5/10; meta 7).** Lo que cambió (`caida.js`: `GUIA`, `guiaEn`, `gestoDe`;
`stage.js`: `_dosHuesos`, `_pies`, `_gesto`; `main.js`: `veredicto`, `fijarCamara`):
- **Bajada en dos tramos**: de arriba a los hombros pegada al cuerpo (0,44 s, codos que flexionan, rodillas que ceden 4 cm
  con los pies plantados) y de los hombros a la cadera con los brazos casi estirados (0,27 s); ahí se suelta. Las manos se
  abren hacia abajo y vuelven al costado en 0,3 s. La barra cae adelante de los pies y rebota más de una vez (rebote 0,42).
- **Paso atrás con los pies** (16 cm en 0,5 s, un pie y después el otro) mientras cae.
- **Variación por semilla del intento** (`pl.var`, `pl.ritmo`): ritmo de 0,88 a 1,15 y uno de tres festejos (dos puños que
  marcan; un puño arriba con el hombro acompañando; palmada de magnesio) o de tres reacciones (cabeza gacha y negación; manos
  a la cintura; mira arriba y suelta el aire). Ninguno queda fijo: después mira al público despacio, la cabeza vuelve a medias.
- **Fallos con la barra arriba**: los brazos reaccionan enseguida (atrás: bajan por delante a los 0,04 s; adelante: la
  empujan lejos 0,3 s y bajan cuando la barra ya pasó).
- **Veredicto grande** y centrado arriba con las tres luces durante 1,5 s (pantallas de 900 px o más; en teléfono queda
  como estaba para no tapar nada), después chico en su lugar.
- **Cámara congelada desde que termina el intento** (`fijarCamara`): el lente que volvía de la barrita (0,93 → 1) era el
  reencuadre leve que se veía antes de soltar la barra.
- **Después de la ronda 5 (6,5)**: respiración agitada con hombros, peso que va de un lado al otro (solo el tronco) y manos
  que se sacuden el magnesio (`RESPIRA`); pararse a 1,05 s por fase con aceleración suave; rebote 0,52 en la bajada (≈ 15 cm
  desde la cadera); la barra se suelta 32 cm delante de los hombros a 1,1 m/s y el paso atrás es de 24 cm; en el fallo
  adelante los brazos bajan a los 0,3 s; el veredicto grande va a la izquierda a media altura (no tapa cabeza ni barra).
  Sin hacer: pasos con despegue al juntar los pies desde la tijera, la pose inicial de `arranque_sin_altura`, y el panel
  «Terminó el arranque» que tapa al pesista.
- Sin hacer de esa lista: desfase entre los extremos de la barra al rebotar, juntar los pies desde la tijera por regla (lo
  hace el clip), darse vuelta medio paso, y medir el reencuadre en lo jugado con una prueba.

**Correcciones después de la revisión del coordinador (17-nov a la noche).**
- **Cuadro negro en Alta**: con post, el recuadro se copiaba a la pantalla con `autoClear` prendido y el borrado no respeta
  el viewport: borraba toda la pantalla y dejaba solo el recuadro. Ahora se copia sin borrar. `check_pov` y `check_barra
  --camara=pov` leen la imagen (`JUEGO.test.luz()`: luminancia media y desvío fuera del recuadro) y fallan con un cuadro negro.
- **Nunca el piso durante la barrita**: la vista baja a la barra solo mientras las manos van hacia ella (entre el 8 % y el
  92 % del recorrido, no más de −55°) y con la barrita en pantalla la mirada va al jurado sí o sí. Reglas duras: mirada entre
  −15° y +10° y horizonte en el tercio central, en lo jugado («quieta», «corre», «levanta») y en la tira.
- **Al frente = al jurado**: la mirada apunta a la mesa de los árbitros (`POV.mira`), lente de 62° de alto.
- **Lo que NO entra en la imagen y por qué** (geometría, no un error): con la mirada en el jurado y 62° de lente, el borde
  de abajo queda a unos −34°; la barra colgando está a −75°/−85° de los ojos y en los hombros a −60°/−65°; arriba de la
  cabeza, a +85°/+95°. Solo cruza la vista durante el tirón y el empuje (con estela). Para que se sienta: el mundo que baja y
  sube, el golpe de cámara al recibir, la estela, y el recuadro.
- `check_carga_fallas [shader compu]`: la espera pasó de 180 a 420 s. **Es una hipótesis de lentitud por software sin
  confirmar**: falló dos veces con 180 s y pasó dos veces con 420 s; no se vio el aviso tardío en ninguna captura.
- **Costo del recuadro, medido por software** (`check_pov`, sección C; corrida 43987308856): «Baja» 300 → 810 ms por cuadro
  (+170 %), «Móvil» 299 → 838 ms (+180 %). Es un segundo dibujo entero de la escena. Por eso en el camino directo va
  **apagado por defecto** y se prende solo si el jugador elige «Con recuadro» (o `?recuadro=si`, que usan las pruebas); con
  post («Media» para arriba) va a una textura propia a media frecuencia. **Con post y en una placa real, sin medir.**
- Tira jugada en Alta: `check_barra --tira` (una foto cada 0,1 s del primer intento propio, de la barrita al veredicto).

Lo de abajo («no tocar» y «sigue mal») es de las cinco rondas anteriores, con la cámara vieja.

Lo que las cinco rondas dejaron bien («no tocar»): barra arriba (recepción y recuperación del arranque, empuje, tijera y
final del envión), tirón de brazos, horizonte nivelado, la barrita de timing en escritorio, caída y rebote de la barra,
«devuelve la barra» y el corte a los jueces con las tres luces.
Lo que sigue mal, repetido en las rondas 4 y 5:
- *Primera persona*: (1) manos en los hombros (cargada y arranque del envión) enormes, pálidas y con los dedos cortados por
  los bordes; entre la barra y el pecho se ve el piso (el cuello achicado tira de los vértices del pecho que pesan con él).
  Arreglarlo de verdad pide un modelo de primera persona (manos y antebrazos aparte) o repesar el cuello en Blender.
  (2) Salida y primer tirón: mirada casi a plomo, dos tercios de piso, sin jueces, y la barra queda a 90 px de la barrita
  de timing. Geométricamente la barra está debajo y detrás de los ojos: con la mirada a −60° solo entra retrocediendo la
  cámara, y entonces se ve el corte del tronco (rondas 2 y 3). (3) Fallo con la barra atrás: no se ve ni barra ni manos.
  (4) En «PREPÁRATE» no se ven las manos y el pecho asoma abajo. (5) La mirada rebota al recibir (18° → 9° → 16°).
  (6) Muslos con trama durante 0,1 s al pasar de agachado a de pie. (7) Sin captura de teléfono con interfaz.
- *Final*: (1) en el válido la barra se suelta desde arriba y los brazos pasan por codos altos («doble bíceps») y por la
  cruz; en el fallo con barra atrás eso se lee como festejo. (2) Estatua de 1 a 2,4 s igual en válido y nulo, sin paso ni
  gesto. (3) Barra atrás pegada al pie de atrás en la tijera. Los tres piden animación nueva (manos que acompañan la barra,
  festejo, bronca, paso): con poses de `poses.json` desandadas no sale.

**Estimaciones y pendientes.**
- Nada de esto pasó por `check()` de Blender ni se comparó con video: son reglas de reproducción (como ya lo era `caida.js`).
- Sin probar en una placa real ni en un teléfono: en Actions se dibuja por software. Falta que el dueño lo juegue.
- En una ventana más alta que ancha la cámara sigue siendo la lateral, se elija lo que se elija (también la primera persona).
- En Clásico las ayudas pegadas a la barra (anillo, línea) no se ven en primera persona cuando la barra queda fuera de cuadro.
- Después del válido el pesista queda de pie respirando: no hay festejo (haría falta una animación nueva).

### Carteles fuera de la cabeza y de la barra, y el vistazo a la barra (17-nov, rama `v-pov`)

Pedido del dueño después de jugar parado en el teléfono: «hay casos donde los carteles le tapan la cabeza al pesista, ojo ahí».

**Medición** (`tools/tapa.mjs`, `stage.js → cajas()`): además del cuerpo y el torso, la caja de la **cabeza** (del hueso `Head`
a 21 cm más arriba, por estatura; los modelos no traen `HeadTop_End`), la **barra** con `alta` (arriba de la cabeza) y, en
primera persona, el **recuadro**. Se mide contra todo lo que se ve (opacidad > 0,2) en todos los momentos de un intento
(`seguidor`): preparación, barrita quieta y corriendo, levantamiento, `arriba` y `fija` (barra arriba), veredicto grande y
chico (válido, caída, de un rival), repetición, carga, «otro sale antes», fin del arranque, explicaciones; con «@c» en dos
tiempos. **Regla** (`revisar`): cabeza ≤ 5 %; barra ≤ 10 % cuando está arriba; recuadro ≤ 5 %. No se exige en los paneles de
antes y después de la final (inicio, presentación, cartel, podio) ni al elegir kilos con el teléfono acostado.
`check_telefono` juega además un intento que no sale (6 kg de más, tocado en el rojo) en 430×932 y 932×430; `check_barra`
suma la primera persona (`pc_pov_es`, `tel_pov_en`, `vert_pov_es`) y sigue hasta el fin del arranque en la computadora.

| Qué tapaba (antes, corridas 44012336826 y 44012340333) | Cuánto | Cómo quedó |
|---|---|---|
| Parado: el tablero sobre la barra y las manos del rival (turno, veredicto, explicación «luces») | barra 75–100 %, cuerpo 19–24 % | 0 % (430×932: 0 %) |
| Acostado: sonido, pausa y ayuda (arriba al centro) sobre la barra del rival arriba | barra 24–31 % (37–40 % con la explicación) | 0 % |
| Acostado y computadora: esos botones sobre la cabeza en el plano de la caída (intento que no sale) | cabeza 23–30 % (6 % en la computadora) | 0 % |
| Acostado: el aviso «otro sale antes» sobre la cabeza y el torso | cabeza 73 %, torso 35–50 % | 0 % |
| Computadora: «Terminó el arranque» (y elegir la apertura) sobre el pesista | cuerpo 71 % (50 %) | 0 % |
| Parado: «Terminó el arranque» cortaba al pesista por el pecho | cuerpo 71 % | 0 % (entero, arriba del panel) |
| Mano izquierda: el veredicto de un rival encima de la explicación de primera vez | se encimaban | separados |

**Reglas de diseño** (no hay casos por pantalla):
- **El techo de la cámara** (`main.js → margenVertical`, 4 veces por segundo): lo que cuelga del borde de arriba dentro de la
  franja central (38–62 % del ancho) baja el techo del encuadre automático (`setInsets`) hasta su borde, más 3,5 % de aire.
  Parado es el tablero (ocupa más de medio ancho): el rival se ve ~25 % más chico durante su turno, entero y con la barra libre.
- **Arriba al centro no va nada** (acostado y computadora): sonido, pausa y ayuda van arriba a la derecha, en fila debajo del
  reloj y las luces. Bajar el techo no alcanzaba: con la cámara general la punta de la barra queda más cerca y se ve más grande.
  El recuadro de la primera persona no sube de 84 px (`RECUADRO.yMin`).
- **Elegir kilos** (apertura y fin del arranque): el panel va a un costado (computadora, `.lado`) o abajo (parado) y el pesista
  se encuadra en lo libre (`encuadrarLibre`, lo mismo que el llamado).
- **Un aviso sobre el plano del llamado** («otro sale antes») va del lado donde estaba el panel (`.veredicto.der`).
- El veredicto propio ya estaba en una franja libre (a la izquierda a media altura; parado, debajo de los pies): 0 %.

**Sin resolver.** Con el teléfono acostado (340 a 390 px de alto) los paneles de elegir kilos siguen a lo ancho y tapan al
pesista (la tabla y el selector no entran a un costado): la regla no los exige. Presentación, cartel y podio tampoco.
Acostado, con el rival de pie y la barra arriba, el borde de la pantalla corta la punta de los discos (es el encuadre de la
cámara general, no un cartel). Falta verlo en un teléfono de verdad.

**Primera persona: el vistazo a la barra** (decidido con el dueño el 17-nov). En un intento propio desde los ojos, antes de que
aparezca la barrita, el pesista baja y toma la barra (el clip hasta «Salida»), la vista baja a las dos manos (hasta −95°: la
barra queda debajo y detrás de los ojos), se queda 0,9 s con el foco en las manos y el lente abierto lo necesario (hasta 92°),
y vuelve al jurado; recién entonces empieza el reloj del intento y aparece la barrita, con el pesista ya agachado
(`main.js → vistazo`, `yaAbajo`; `stage.js → POV.vistazo`). Mismo resorte, tope 57 °/s. Nada con movimiento reducido, con la
barrita en pantalla, con reloj corriendo (Clásico) ni con el teléfono parado. **Agrega unos 4 a 5 s a cada intento propio en
primera persona.** Pruebas: `check_pov` (tira: ≥ 0,6 s con las dos manos en la imagen y la mirada de vuelta en el jurado
0,3 s antes de levantar) y `check_barra` con `--camara=pov` (`E.vistazo`: ≥ 600 ms con las manos, termina en el jurado, ≤ 6 s);
la regla dura de la barrita (mirada entre −15° y +10°) no cambió.

Medido en lo jugado (Alta, por software): 1,7 a 1,9 s con las dos manos en la imagen, mirada más baja −95°, de vuelta en −15°
al aparecer la barrita, 4,3 s en total. **A la vista:** la barra y las manos salen algo fuera de foco, y con el teléfono
acostado el botón redondo tapa la mano derecha y el recuadro queda pegado al disco derecho. Sin nota de director ni del dueño.

**Corridas en verde sobre `3835cba`:** teléfono 44035762059, pruebas 44035756974 (los 4 grupos), gráficos `solo=pov`
44035751517. En `tapa.json` de la última medición de carteles (195 momentos en `check_telefono`, 247 en `check_barra`): cabeza
0 % y barra arriba 0 % en todos los momentos exigidos; recuadro 1,5 % como mucho. El «~25 % más chico» del rival parado es
una estimación por las medidas de los márgenes, no una medición.

Capturas de antes y después: `~/tarima-datos/ver_visual/carteles/` (`antes/`, `despues/`, `pov_vistazo/`).
## Físico anatómico (17-nov, rama `v-pesista`)

Detalle en `docs/PLANTEL.md`, «Físico anatómico». Estado: kordan, ilarraz, jastrev y solanet con `fisico='anatomico'`; corrida de
pesistas 44038971821 (0 BAD en los cuatro), fotos 44042349451 y 44042364993, `PESISTAS_RUN` de `graficos.yml` = `44004922615 44038971821`
(halvard sale de la primera). Hojas de antes y después y de posiciones: `~/tarima-datos/ver_visual/pesista/prueba_fisico/`.

Lo que costó encontrar (no repetir):
- El alisado del pecho (`make.py` sobre la malla base y `geo.chest_smooth` sobre la final) llegaba hasta la cadera y el muslo alto y
  encogía todo lo convexo: la sonda mostraba el cuerpo nuevo y el GLB no (muslo 0,41 H contra 0,35 H). En el físico anatómico va solo sobre el pecho.
- Los «bultitos» del pecho con los brazos arriba eran tres cosas: el plato chato del parche (ahora mínimos cuadrados móviles), un disco de
  oclusión fija en la textura y la normal mal escalada en el racimo de UV deformado. La «punta» que `make.py` buscaba estaba en la ingle.
- `measure-thigh-circ`, `measure-calf-circ` y `upperleg-scale-*` de MPFB dan un globo arriba del muslo.
- `ANTROM` medía mal muslo, hombros y cuello (cortes solo con los vértices que dominaba un hueso). `tools/prever_fisico.py` y un corte
  del GLB con numpy sirven para verificar sin Blender.

Estimaciones y pendientes: las metas de perímetros son estimadas (no hay medición de referencia); el ancho de hombros medido (0,35 H)
queda sobre la meta porque el marco de MPFB no baja de 0,24 H entre articulaciones; la proyección del glúteo queda en 0,07 H; el
superpesado no tiene panza en barril (cintura 0,56 H) y su entrepierna mide 0,375 H; queda un bulto bajo la malla en la extensión
(los targets `genitals/*-decr` no alcanzan); pieles de MakeHuman sin integrar; el sombreador de piel solo cambió `uNormBias` (1,7 a 1,1).

## Plantel nuevo dentro del juego (17-nov, rama `v-integra`, desde `visual`)

Sin fusionar a `main` ni a `prueba` y sin publicar: lo decide el dueño.

- **Modelos en el repo** (`web/models/`, corrida de pesistas 44038971821, `check()` 0 BAD en los cuatro, meshopt como los
  actuales; el `_1024` lleva además texturas WebP): ilarraz 5,27 / 2,92 MB, kordan 5,48 / 3,01, jastrev 5,38 / 2,96,
  solanet 5,29 / 2,95 (`.glb` / `_1024.glb`); máscaras 0,19 a 0,24 MB y `_mask2` de 0,02 MB (el juego todavía no la baja).
  `poses.json` y `plantel.json` regenerados con `tools/sumar_pesista.py` y `tools/plantel_web.py`. Halvard sigue sin modelo
  en el repo (las ternas `mujeres`, `pesados` y `mixto` no existen hasta que lo tenga).
- **Plantel por defecto**: sin `?plantel=` el juego viste la terna `hombres` (`PLANTEL_DEFECTO` en `roster.js`; en
  `tools/plantel_web.py` pasó a ser ilarraz, kordan, jastrev): Ilarraz en la plaza Compacto, Kordan en Largo, Jastrev en
  Potente. Es lo mismo que daba `?plantel=ilarraz,kordan,jastrev`. `?plantel=clasico` deja a Ventura, Brenner y Marangi.
  Si `plantel.json` no llega (tres intentos), el juego sigue con los clásicos, que siguen en el repo.
- **Lo que NO cambió**: los ids de las plazas (`ventura`, `brenner`, `marangi`), `web/data/sim.json` y su huella, los
  `sim_ref*.json`, las personalidades de los rivales, los textos (ninguno nuevo), la propiedad `pesista` de los eventos
  (`compacto`, `largo`, `potente`) y `tarima.pesista` guardado en el navegador. El Worker no valida ids de pesista.
  Los tiempos del núcleo siguen saliendo de `sim.json` (`modelos.ventura` y `modelos.brenner`): la presentación acomoda el
  clip del modelo nuevo a esos tiempos. Kilos y fichas propias por categoría siguen pendientes (temporada nueva).
- **Arreglo**: el zócalo del rival mostraba el código de país de la ficha vieja (NVK con Kordan); ahora el del modelo.
- **Visor** (`config.js`): ficha de Kordan, y categoría, estatura y bandera de Ilarraz al día. Con los modelos en el repo
  el visor publicado muestra también a Solanet, Ilarraz, Jastrev y Kordan.
- **Carga medida** (`carga.yml`, corrida 44050710000, teléfono 844 × 390 con los `_1024`; «antes» = `origin/main`):
  total 7,97 → 10,71 MB (modelos 6,46 → 8,89 MB, máscaras y detalle 0,62 → 0,79, JS 0,77 → 0,91 por lo que ya traía `visual`).
  Modelos bajados en 4G (9 Mbps) a los 19,1 → 24,6 s; en red lenta (1,6 Mbps) a los 51,0 → 65,6 s. En computadora con calidad
  alta (cuenta sobre los archivos, sin medir): modelos y máscaras 12,26 → 16,79 MB. La causa es que antes eran dos modelos
  (Marangi usaba el de Brenner) y ahora son tres distintos; los clásicos no se bajan. **Pendiente** si pesa: bajar primero el
  modelo del jugador y los rivales después, o que la tercera plaza repita modelo.
- **Pruebas**: `check_game` y `check_carga_fallas` esperan `ilarraz,jastrev,kordan` en memoria; `check_carga` espera todos
  los modelos pedidos (cortaba en cuatro archivos); `carga.yml` acepta `-f antes=<ref>` y `-f visor=false`;
  `check_analitica` da 120 s al primer clic: con el 3D por software, compilar tres modelos distintos al abrir pasó de 30 s
  (en `visual` la misma prueba pasa con 30 s, corrida 44051486379). Es costo real de arranque; no se midió en una placa.
- **Shader que no compila** (`revisarShaders`): antes de probar con Móvil se sueltan los programas de la escena
  (`Escena.soltarProgramas`). three avisa de un programa roto una sola vez; con tres modelos todo llegaba compilado y, si
  Móvil no creaba un programa nuevo, se anotaba «recuperada» sin estarlo (`check_carga_fallas [shader]` falló dos veces
  seguidas en la corrida 44050689975). La causa exacta de por qué con dos modelos sí aparecía no se confirmó (estimación:
  dependía de los tiempos). Solo cambia el camino de falla: quien hoy carga bien no pasa por ahí.
- **Corridas en verde** (rama `v-integra`): `pruebas.yml` 44060877374 (commit d6d8ce2), `servidor.yml` 44052753896 (eb4bc6d),
  `telefono.yml` 44050695156, `muro.yml` 44050700519 y `carga.yml` 44050710000 (9b128bc; `carga.yml` sin el trabajo del visor,
  `-f visor=false`). Acá: `sim_test`, `servidor_test` (364 controles), `rivales_test` y `pesistas_test` bien.
- **Estimaciones y riesgos**: memoria de video con tres modelos en un teléfono de gama baja, sin medir en un aparato real.
  El color de interfaz de Kordan (`#2fb3c4`) queda cerca del turquesa del jugador (`#35e6d6`) cuando Kordan es rival.
  Solanet casi no se probó jugando; Jastrev es el menos logrado.

### Selección de pesista con el pesista en 3D (17-nov, rama `v-pov`)

Pedido del dueño: «quiero evaluar bien el físico; cuando seleccione el pesista quiero ver al pesista, tipo selección de personaje».

- **Cómo se entra.** Tocando una tarjeta de pesista en la bienvenida (las tarjetas siguen saliendo recién después de la primera
  final) o con **`?elegir=1`**, que abre directo la selección y deja las tarjetas a la vista aunque sea la primera vez (para
  probar). «Listo» vuelve a la bienvenida con ese pesista marcado. En Opciones no hay entrada: no había un lugar natural.
- **Qué se ve** (`main.js → elegirPesista`, pantalla `elegir`). Panel a un costado (computadora y teléfono acostado) o abajo a lo
  ancho (parado) con las tres tarjetas (plaza y apellido) y la ficha del elegido: nombre, bandera, código y país, categoría
  (recuadro), estatura y kilos del cuerpo (de `plantel.json`; `vestir` ahora copia `masa`), la frase de la tarjeta y el RM. En lo
  libre, el pesista de pie a cuerpo entero, de frente, lente de 38° (`stage.js → PLANOS.elegir`, encuadre calculado con el
  rectángulo libre). **Gira el pesista con la barra, no la cámara** (`Escena.girar` / `posarGirado`): así el lado que se mira es
  siempre el iluminado y la cámara no se mete detrás de la pantalla del fondo. Una vuelta en 12 s; arrastrando sobre la escena
  (`#el-zona`, no cuenta como toque del juego) gira con el dedo o el ratón y a los 3 s de soltar sigue solo; dos botones lo
  llevan de a cuarto de vuelta (frente, perfil, espalda; queda quieto 6 s); otro alterna «de pie» y «barra arriba» (la pose
  final del arranque, con el clip pasado en 1,7 s). De pie no se dibuja la barra. Teclado: las flechas mueven el foco y la
  tarjeta con foco es la elegida; Enter sobre la elegida confirma. Cada pesista se ve con SU malla (en la final el del jugador
  lleva la turquesa de `JUGADOR`, como siempre). Al cambiar de tarjeta, fundido corto; se conservan el ángulo y la pose.
- **Hoy se ofrecen solo Ilarraz y Kordan como «(nuevo)»** (segunda decisión del dueño, 17-nov): `roster.js →
  ASPECTOS_OFRECIDOS`. Jastrev (+110 kg) y Solanet (mujer, 48 kg) no se ofrecen hasta que existan las categorías; sumarlos a
  ese arreglo los vuelve a prender. Potente queda solo con Marangi (sin fila de aspectos). Un `tarima.aspecto` guardado que ya
  no se ofrece cae al de siempre de su plaza. Lo que sigue describe el mecanismo completo (con los cuatro en `ASPECTOS`).
- **Entran todos los modelos, los nuevos con «(nuevo)»** (decisión del dueño del 17-nov para el lanzamiento: «que entren
  todos, para que los users vayan viendo la evolución; ponelos como (new)»). Debajo de las tres tarjetas, la plaza elegida
  ofrece sus **aspectos** (`roster.js → ASPECTOS`): Compacto: Ventura · Ilarraz (nuevo) · Solanet (nuevo); Largo: Brenner ·
  Kordan (nuevo); Potente: Marangi · Jastrev (nuevo). Elegir un aspecto cambia **quién dibuja** al pesista del jugador
  (`vestirJugador`: la plaza del jugador con ese modelo y las otras dos como siempre), no la plaza deportiva: kilos, fases y
  cuerpo de la simulación siguen saliendo de `sim.json` (por eso la frase y el RM de la ficha no cambian con el aspecto). Los
  rivales quedan con los modelos de siempre, así nunca hay dos iguales. `plantel.json` y el modelo nuevo se bajan recién al
  abrir la selección y al tocar el aspecto (aviso «Bajando a los pesistas…»; en el teléfono, los `_1024` como siempre); quien
  no entra a la selección no baja nada de más. Se recuerda en `tarima.aspecto` (junto a `tarima.pesista`): al volver, baja ese
  modelo en lugar del de siempre de su plaza. `pesista_elegido` lleva la propiedad nueva `modelo`. Texto nuevo, pedido por el
  dueño: `pesista.nuevo` («(nuevo)» / «(new)»). Si se cargó un modelo en la selección, la final vuelve a precalentar
  (`E.reprecal`). Con `?plantel=` la base es esa terna y se ofrecen los nuevos que no estén ya en otra plaza.
- **Sin textos nuevos** (salvo «(nuevo)»): título `pesista.titulo`, «Listo» `campo.listo`, frases y RM de las tarjetas; los botones de girar y de
  barra arriba son dibujos. **Propuesta pendiente de OK del dueño**: etiquetas «Categoría» y «Peso» (hoy la categoría va en un
  recuadro y el peso al lado de la estatura, sin rótulo) y «frente / perfil / espalda» con texto.
- **Costo**: nada cuando la pantalla no está abierta (un `enCuadro` que se quita al salir). Abierta, dibuja en cada cuadro.
- **Pruebas**: `check_telefono` suma `seleccion_pc_1280x720` (ratón y teclado; además Móvil y Baja con un pesista),
  `seleccion_acostado_844x390` y `seleccion_vertical_390x844` (`telefono.yml -f solo=seleccion`; en las corridas completas va en un paso aparte, capturas en `out/seleccion`): el panel no tapa al pesista
  (caja del cuerpo de `cajas()`), nada se sale, gira solo un cuarto de vuelta en 3 s, el arrastre gira y no cuenta como toque,
  los cuartos de vuelta y «barra arriba» llegan, los 5 pesistas (3 de siempre y 2 nuevos, estos con la marca) se ven en las 6 vistas, y «Listo» deja la escena como estaba y el aspecto elegido. `check_muro` pasa por la selección al
  elegir Largo. Capturas: `~/tarima-datos/ver_visual/seleccion/`.
- **Sin resolver / a la vista.** Parado, el pesista ocupa 31–34 % del alto de pie (el panel, con la fila de aspectos, se lleva el 42 %) y con la barra arriba el
  lente se abre (hasta 56°) para que entre la barra. La ficha de juego (RM 169/211 para un 71 kg) sale de `sim.json`, no de
  `plantel.json`: los números no cierran con la categoría. Al salir, detrás de la bienvenida queda el plano de la selección
  (la final pone su cámara). No se probó en un teléfono de verdad. Sin nota del dueño.

## Pulido del 17 de noviembre (rama `v-polish`, desde `visual` f26ca50)

Pedido del dueño: «mejoraría un poco el gameplay para que sea más fácil, más amigable, con algunas transiciones suaves entre
cambio de pesistas», jugando en vertical; y, mientras jugaba la candidata, «nivel fácil preseleccionado pero no por defecto;
es poco intuitivo elegir el estilo de jerk y el nivel». Diseño en `docs/JUEGO.md`, G3.F.

- **Fácil más amigable** (`rules.js → FACIL_17`, solo Fácil; huellas de Medio y Difícil iguales). Tres palancas: verde ±200 /
  ±150 ms al 90 / 95 % (antes ±170 / ±125), amarillo +±260 / +±210 ms (antes ±220 / ±180) y puntero lento a los 4 s sin tocar a
  1,9 s por pasada (antes a los 8 s, 1,7 s). Desde el 100 %, todo igual. `barra_bots --dif=facil`, novato (±120 ms), válidos
  (y % de toques en el verde), Compacto / Largo / Potente:
  - arranque 90 %: 100 (79) / 100 (89) / 100 (65) → 100 (88) / 100 (94) / 100 (72)
  - arranque 95 %: 98 (67) / 99 (76) / 92 (52) → 99 (75) / 99 (82) / 94 (58) · 97 %: 94 / 98 / 79 → 96 / 98 / 83
  - dos tiempos 90 %: 100 (81) / 100 (78) / 99 (77) → 100 (86) / 100 (84) / 100 (82)
  - dos tiempos 95 %: 97 (65) / 96 (66) / 93 (63) → 100 (73) / 98 (74) / 97 (72) · 97 %: 85 / 85 / 80 → 89 / 88 / 84
  - al 100 % (sin cambio, a propósito): arranque 62 / 67 / 46, dos tiempos 35 / 36 / 52
  - todo verde (los tres juntos): arranque 90 % 77 → 85, 95 % 65 → 71; dos tiempos 90 % 62 → 70, 95 % 40 → 52
  - «LEJOS» en el arranque con Potente: 90 % 7 → 4 % de los toques, 95 % 12 → 7 %
  - finales enteras con lo que trae el panel, rivales amistosos: oro 91 / 89 / 84 → 93 / 92 / 90 % (media 88,0 → 91,7);
    con rivales normales 10,0 → 14,7 %; cansancio al tercer intento 272 / 280 / 295 → 263 / 244 / 245
  - `chance_test`: el «X de 10» del panel sigue honesto (error máximo por casilla 4,5 puntos con el bot típico).
  - Descartado: amarillo a 500 de energía (novato al 100 %: 70,3 y 71,5 % de válidos, fuera de la meta 30 a 70).
  - Referencias regeneradas (`sim_test --update`): `sim_ref_barra`, `sim_ref_rivales` y `sim_ref_turnos`, que son finales
    jugadas en Fácil `'b'` (cambian las zonas de los toques guionados y lo que sugiere el entrenador, que lee la chance);
    `sim_ref`, `sim_ref_facil`, `sim_ref_uno` y `sim_ref_dificultad` quedaron idénticas. La huella de Fácil cambia: un
    registro de una final de Fácil jugada con la versión anterior ya no se recalcula igual (el Worker no recalcula partidas).
- **El nivel a la vista** en la bienvenida y **los tres estilos de envión a la vista** en el panel del primer dos tiempos
  (acostado sigue el botón compacto: abierto ocupa 59 a 61 % del alto). Revisado el camino del nivel: `difInicial()` →
  `cfg.dif` → `Partida` y `fijarDificultad`; no había desajuste entre lo marcado y lo aplicado, lo que pasaba es que el nivel
  solo se veía abriendo Opciones. `check_barra` ahora lo controla en cada pantalla (marcado = `E.dificultad` = `p.cfg.dif`).
- **Transiciones**: fundido 150 + 280 ms (antes 120 + 200), también al entrar y salir de la selección; disolvencia de 0,2 s
  para tablero, zócalo, «Saltar», barrita, etiqueta y paneles nuevos. `ritmo_test` (Fácil, novato): la final salteando a
  los rivales pasa de 126,9 a 128,2 s de mediana (+1,3 s, +1 %; meta ≤ 150) y mirándolos enteros de 195,8 a 197,3 s; el
  turno de rival más largo, de 11,6 a 11,9 s (tope 12; con 180 + 300 ms daba 12,0 y se acortó); el turno saltado, de 2,2 a
  2,4 s; el intento propio p90 queda en 8,7 y 13,6 s (antes 8,8 y 13,6); barras caídas con lo que trae el panel, 14,8 → 14,2 %.
- **Vertical**: en el dos tiempos el tablero cortaba la columna «PIDE»; ahora parado se van la del arranque y los cuadraditos.
- **Sin resolver / a la vista.** El bot «lento» de `ritmo_test` (toca siempre a los 9 s) no espera menos con el puntero que
  frena antes: su final dura unos segundos más; una persona que espera al puntero lento sí toca antes (a los 4 a 6 s). No se
  probó en un teléfono de verdad. Sin nota del dueño.

## Contratos entre Blender y el visor

1. Esqueleto único: 52 huesos con nombres Mixamo más `Bar`. Una sola acción, `Poses`.
2. Tiempo del clip = índice de fase (1 s de clip por fase), con `sub` muestras resueltas por fase (hoy 10). Las claves empiezan en el cuadro 1 (t = 1/30 s). El índice 0 de cada envión duplica el último de la cargada.
3. `web/data/poses.json` por personaje: `h`, `seg`, `sub`, `grip`, `corr`, y por segmento `start`, `poses` (nombre, torso, altura de barra, cadera) y `tt` (segundos reales por muestra, creciente).
4. La barra y los discos los dibuja el visor por código, centrados en el hueso `Bar`.
5. GLB con dos nodos de malla (`Human` con los morphs, `Human_parts`) y materiales `Body`, `Eyes`, `Hair`, `Lashes` (mezcla alfa, sin reordenar capas), zapatillas y cinturón. `web/models/<nombre>_mask.png`: R piel, G tela, B pelo. En `web/` todo eso pasa por `tools/comprimir_modelos.sh` (meshopt, `<nombre>_1024.glb`, máscara en WebP; `poses.json` lleva `mask` y `glb1024`).
6. Morphs correctivos `corr_armUp_L/R` (45° a 130°) y `corr_knee_L/R` (60° a 140°); los rangos viajan en `poses.json` (`corr`).

## Próximos pasos

El plan por etapas, con el criterio de terminado de cada una, dónde corre cada cosa y los mensajes para arrancar sesiones nuevas, está en [docs/PLAN.md](docs/PLAN.md).

Resumen: (0) preparar el Mac alquilado y la sesión cloud, (1) juego mínimo jugable en cloud, (2) prueba de dirección de arte con decisión del usuario, (3) atletas definitivos, (4) movimiento contra video y fallos animados, (5) online, (6) pulido.

## Decisiones tomadas en el camino

- Se descartó el personaje hecho con primitivas por código, el pre-renderizado y el video generado por IA como base del juego (sin interacción ni consistencia de técnica).
- Mocap desde video sigue pendiente.
- Esqueleto único con nombres Mixamo más un hueso `Bar`, así la barra nunca se desfasa de las manos.
- three.js vendorizado en `web/vendor/` para que el visor funcione sin red.

### Pelo gris en el teléfono (17-nov, rama `v-pesista`)

- No era del camino de «Móvil»/«Baja»: el casco de pelo y la barba de malla opaca salían grises igual en «Alta» (fotos de antes y después de los tres en `~/tarima-datos/ver_visual/pelo/`, corridas 44067370084/44067386678/44067401923 y 44068336109/44068349915/44068366545).
- Causa 1 (la mayor): el reflejo. `capMaterial` dejaba el lóbulo ancho de GGX (rugosidad 0,82, F0 × 0,45, F90 0,5) frente a los tres contraluces de `look.js` (15 + 14 + 5, sin sombra). Vistos a contraluz daban 0,13 a 0,37 lineal en coronilla y sienes contra 0,03 a 0,07 de la difusa (cuenta de un foco de three con las posiciones de `_luces`; 0,2 lineal ≈ gris 140 después del tono). Ahora F0 × 0,2 (como el pelo en capas) y F90 = 0.
- Causa 2: el color. `blender/tex.py: pelo` escribe color × (1,7 + 1,2 s) + 0,04 a 0,07: la media de la textura es ~3,8 veces más clara en lineal que el color de la ficha (Ilarraz `#0f0c0a`, textura media 37,32,28). El visor lleva la media al color de la ficha (`ASPECTO.pelo.base`, lo pasa `stage.mostrar` desde `plantel.json`) y usa ese color en el pelo pintado sobre la piel. No se tocó `tex.py` ni los GLB: si se corrige el generador, `pelo.base` sigue valiendo (nunca aclara).
- Sin resolver: el pelo y la barba quedan casi negros lisos (se pierde la veta entre mechones: con el color de la ficha y esos contraluces no hay rango); el rapado pintado de Jastrev se sigue aclarando de espaldas (va por el material de la piel, 70 % de color de pelo) y tiene una costura clara en la nuca; el borde de la barba sigue en serrucho.
