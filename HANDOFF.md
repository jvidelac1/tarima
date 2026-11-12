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

- Baja como antes (dos ventanas malas de cuatro, o una que pierde la quinta parte). Si después de bajar se pierde más de dos tercios de lo de antes, **los píxeles no eran el problema**: pide deshacer esa bajada y no baja más (`ajena`) hasta que pasen 60 s o haya 3 s limpios seguidos.
- **Sube** de a un escalón después de 5 s sin perder un solo refresco (hilo principal bajo el 80 %) mientras esté por debajo de lo que dejó la calibración, y después de 20 s por encima (hasta la resolución de la pantalla). Primero vuelven las sombras si se habían apagado. Si una subida pierde refrescos en los 15 s siguientes, se deshace y la espera se duplica (hasta 120 s).
- Igual que antes: nada cambia con un intento en curso ni en la repetición, y nada se recompila. `JUEGO.calidad.gobernador` dice el nivel (escalones debajo de la calibración), si sospecha carga ajena, las esperas y los últimos cambios con su motivo; cada subida queda en `JUEGO.calidad.cambios` con `sube: true` y `motivo`.
- `perf_test` lo prueba en partidas simuladas: carga ajena de 40 s que pierde lo mismo a cualquier resolución (baja una vez, lo deshace y termina en la resolución de la calibración o más), costo propio (baja hasta donde entra y las subidas que no aguantan se espacian 5, 10, 20, 40 s), y una escena que se alivia a los 30 s (vuelve a subir hasta la calibración).

**3. Escena barata por píxel en Baja y Móvil** (`Q.barato` en `PRESET`, `Escena.setBarato()` en `stage.js`; el visor no cambia: `arena.js` solo expone `tarima` y `escenario`):

- **Piso con la luz horneada**: al construir la escena, la tarima (1024 × 1024) y la alfombra del escenario (512 × 433) se dibujan solas desde arriba, con una cámara ortográfica que cubre su cara de arriba, a un destino lineal de media precisión: el color de salida del material físico con las ocho luces y el entorno, sin tono, sin niebla y sin sombras. En el juego esas caras usan un `MeshBasicMaterial` con esa textura (sin ninguna luz). La sombra del pesista y la barra va en una lámina `ShadowMaterial` apenas arriba de la tarima; su opacidad sale de hornear el centro con y sin la clave y pasarlo por el tono (en Actions dio el mínimo, 0,1: con el tono AgX la sombra de la clave ya era suave). Lo que cambia: el brillo especular que depende de la vista (la alfombra de rugosidad 0,93 tenía un reflejo de color hacia el fondo en las cámaras rasantes) y el relieve fino de la alfombra. Si la placa no puede dibujar en media precisión queda el piso de siempre.
- **Sin haces**: en el camino directo el tono se aplica a cada capa que se suma, y el tono del juego deja en **negro** todo lo que vale menos de 0,0158 (tonoJS); los haces valen 0,035 a 0,05 en el foco y menos hacia abajo. En las fotos del banco en Actions (run 43264193551), la imagen con los haces de antes y sin ellos dio una diferencia media de 0,00 en las seis cámaras (como mucho 6 niveles sobre 255 en unos pocos píxeles de la cámara 3/4). O sea: desde el camino directo (tercera vuelta) los haces ya no se veían en Baja, y costaban un cuarto del cuadro en la Mac. `haces: 'cortos'` queda armado (una cara con el brillo de las dos, cortados al 56 % donde dejan de verse, en colores de pantalla con `CURVA_HAZ`, que sigue a tonoJS con error menor a 0,03) por si se los quiere volver a ver con otra curva.
- **Contraluces como término del material**: los tres contraluces salen de la escena (todos los materiales con luces dejan de evaluarlos) y en el pesista y la barra se suman con la misma cuenta de un foco de three sin sombra (posición, cono y penumbra, `RE_Direct`), encadenado al `onBeforeCompile` que ya tuvieran. En el pesista y la barra la imagen no cambia (diferencia cero en las fotos); los jueces, la magnesiera, el truss y los bordes de la tarima pierden el contraluz (más oscuros, se nota en el juez de la izquierda en la cámara lateral).
- Comparación en Actions (por software, run 43262317209; `banco/fotos`): diferencia media entre antes y ahora de 1 a 4 niveles sobre 255 según la cámara (3/4: 2,4; lateral: 2,7; reversa: 2,9; frontal: 1,0; cenital: 4,0; primer plano: 1,2), ahora apenas más oscuro (1 a 2 niveles de luminancia). Las capturas de la partida (`pruebas-out`, `capturas/`) se ven igual que las de la corrida 43250745124.

**4. El caso raro de la anisotropía.** No encontré un error en la variante: la textura se cambia en la placa y se restituye igual, y three no pierde la cuenta de lo que tiene enlazado. Ahora la variante restituye a mano la textura enlazada en la unidad activa y dice cuántas texturas tocó. Hay dos sospechas que el banco nuevo separa: (a) la posición: `aniso` era la última de la vuelta, justo después de `piso`, que compila y suelta materiales (ANGLE en Metal libera programas de forma diferida y eso puede caer en la medida de al lado); ahora va tercera, después de dos variantes que no compilan; (b) el mecanismo: `anisoIgual` hace exactamente lo mismo (texParameter sobre las mismas texturas) sin cambiar el valor. Si `anisoIgual` también sale más cara, el costo es del cambio de estado en ANGLE y no del filtrado; si `aniso` sale cerca de cero, era la posición; si `aniso` sigue 7 % más cara y `anisoIgual` en cero, el filtro isotrópico de verdad cuesta más en la M1 (y la anisotropía 4 queda).

**Qué tiene que mirar el orquestador en el Chrome del usuario** (pestaña a la vista, unos 2 minutos sin tocar nada, la máquina como la usa siempre, con la app de Claude abierta):

1. `juego.html?banco=1`, y al terminar «Copiar el JSON». Arriba de todo: si aparece la franja roja del control, la máquina pierde cuadros sin dibujar nada; anotar en cuál tanda (`BANCO.tandas[i].controlAntes.perdidos`). Después, la línea verde: la calidad, los MP y el margen que elegiría el juego.
2. «Baja completa»: `ms1MPmin` (la medida más limpia). **Meta de esta vuelta: 6 ms o menos a 1 MP** (antes 6,2 de mínimo y 10,6 de mediana), para que la resolución nativa (1,78 MP) entre en el 85 % de 13,3 ms con margen aun con algo de carga.
3. Variantes `antes`, `antesPiso`, `antesHaces`, `antesBordes`: su «ahorro» negativo es lo que ahorra cada parte en la M1. `aniso` y `anisoIgual` para cerrar el caso raro.
4. Las tres tandas (`BANCO.tandas`): `mpReal` de cada una y si el control perdió al lado. Si la búsqueda pierde a todas las resoluciones y el control también, es la máquina.
5. Una partida en `juego.html?depura=1`, mirando `JUEGO.calidad.gobernador` y `JUEGO.calidad.cambios`: con otra app cargando la placa tiene que bajar una vez como mucho, deshacerlo («carga ajena») y volver a subir cuando la máquina se libera. **Mirar la imagen**: el piso, la sombra en la tarima y los contraluces del pesista tienen que verse como antes.

**Cómo se probó.** Sin navegador en esta máquina: `node tools/perf_test.mjs` (71 comprobaciones; gobernador en partidas simuladas, banco v3 simulado con deriva, ruido y una máquina que pierde cuadros sin dibujar: el control lo detecta y la tabla lo pone primero; la curva de los haces contra tonoJS; el cono corto) y `node tools/sim_test.mjs`: verdes. Actions, por software (los tiempos no valen; cuentan que corra entero, las llamadas y las fotos): «Banco y calibración» en verde (runs 43260047059, 43262317209 y 43264193551: 4 calidades, 16 variantes en dos vueltas, tres tandas con los controles en 0 de 40, fotos). Llamadas de dibujo de «Baja completa»: 171 (antes 182: doce haces menos y una lámina de sombra más). Programas: 101 al empezar y 134 al terminar, todos internos de la pasada de sombra de three; `programasSobrantes` en 0 en las 16 variantes. «Pruebas del juego»: la primera corrida de la rama (43260054351) cayó en `check_game` por la línea del toque tardío, que venía de la base (`demo` también estaba en rojo ahí); con `demo` mezclada, 43262310275 en verde.

**Lo que no está medido o no cumple:**

- **Nada de esto se midió en una placa.** La meta de 6 ms a 1 MP es para el banco del punto anterior. Por software, el costo de las variantes no dice nada.
- **Las sondas con pantalla por software no dan cuadros** (cada cuadro tarda más de un segundo): en Actions las tandas solo prueban que el código corre; el control sí (0 perdidos de 40).
- **El especular del piso** queda fijo (horneado desde arriba): con cámaras rasantes, la alfombra pierde un reflejo de color hacia el fondo. A simple vista no se nota en las cámaras del juego; en la cenital sí, apenas.
- **Los haces no se ven en Baja desde la tercera vuelta** (camino directo). En Media y Alta, con post, sí. Si se los quiere de vuelta en Baja hace falta otra curva para lo que se suma (que tenga en cuenta el fondo), y entonces vuelven a costar.
- **La opacidad de la sombra en la tarima** se calcula al cargar con una lectura de un destino de 8 × 8 en coma flotante; sin `EXT_color_buffer_float` queda 0,45 (no se probó en una placa así).
- **El gobernador puede probar subir** por encima de la calibración: en una máquina justa eso son unos segundos de cuadros perdidos cada vez más espaciados (20, 40, 80, 120 s). Si molesta, `SUBIR_ARRIBA_MS` más alto.

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
- **Límites.** Nada de esto dice cuántos cuadros por segundo da el juego: eso se mide en la Mac del usuario. Chrome del runner sin pantalla entrega cuadros a 60 Hz, no a 75. No se prueba ningún teléfono real.

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
- **Sin retratos en el podio**: el podio 2D usa bandera y nombre para los tres. El primer plano de cara del llamado se usa con Ventura y Brenner, no con Marangi (comparte la cara de Brenner).
- **Cambio de carga**: corte a la cenital con cartel; los discos no se deslizan.
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
- Marangi es el modelo de Brenner con la tela de color plano (`#7a1626`). **No se revisó en captura si el relieve de «BRENNER» se lee**: mirarlo con GPU; si se lee, limitarlo a planos laterales.
- Todo lo de la etapa 4 (fallos, festejos, ayudantes y bajadas animados) hoy es corte y texto, como define la sección 11.2.

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
