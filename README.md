# Tarima

Prototipo de un juego web de halterofilia: dos levantadores ficticios generados por script en Blender, con arranque y dos tiempos resueltos fase por fase sobre cada esqueleto.

El estado del trabajo, lo que está verificado y lo que falta está en [HANDOFF.md](HANDOFF.md).

## Ver el visor

Los modelos ya están exportados en `web/models/`, no hace falta Blender para mirar.

```bash
cd web
python3 -m http.server 8000
# abrir http://localhost:8000
```

Tiene que ser por servidor local: abriendo `index.html` directo, el navegador bloquea la carga de los GLB.

## Reconstruir los personajes

En una máquina nueva, `tools/setup.sh` hace los pasos 1 y 2 y verifica que estén Chrome y la tipografía.

1. Dependencias de Python (3.13, que es la versión del módulo `bpy` 5.2):

   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. MPFB, el generador de humanos de MakeHuman:

   ```bash
   git clone --depth 1 https://github.com/makehumancommunity/mpfb2.git vendor/mpfb2
   ```

   Si lo tenés en otro lado, apuntá `MPFB_SRC` a la carpeta `src/mpfb`.

3. Build:

   ```bash
   ./build.sh                 # los dos personajes
   ./build.sh ventura         # uno solo
   FAST=1 ./build.sh ventura  # sin la hoja de poses de costado
   ```

   Cada personaje tarda unos 20 minutos con la máquina libre. Corré un solo build a la vez. Deja todo en `out/<nombre>/` y copia el GLB y los datos a `web/`.

Si el script de texturas no encuentra una tipografía en negrita, definí `TARIMA_FONT` con la ruta a un `.ttf`.

### Linux

El mismo build corre en Ubuntu 22.04 x86_64 sin pantalla (pod alquilado o contenedor, como root). `tools/setup.sh` instala ahí las bibliotecas que necesita `bpy`, las tipografías, Node, uv y Chrome.

```bash
git clone --branch linux https://github.com/jvidelac1/tarima.git && cd tarima
tools/setup.sh
TARIMA_THREADS=12 ./build.sh     # los hilos según los núcleos que tenga la máquina
node tools/check_viewer.mjs
```

Medido el 11 de noviembre de 2026. Con GPU, 0 cuadros con superposición en los dos personajes; sin GPU se corrió solo ventura, también en 0:

| Máquina | Cycles | Build completo (dos personajes, con hojas) | Prueba del visor |
|---|---|---|---|
| Pod con RTX 4090, 12 hilos | OptiX | 29 min (unos 14 por personaje) | Chrome con Vulkan sobre la placa, los dos personajes: pasa en 5 min, 59 fps en alta |
| Pod de 4 vCPU sin GPU | CPU | 33 min solo ventura con `FAST=1` | por software (SwiftShader), solo ventura: pasa en 44 min; verifica lógica, consola, 404 y capturas, no mide fps |

- **Mismas poses que en macOS.** `python3 tools/compare_poses.py <poses.json de macOS> <poses.json de Linux>` da estructura igual y diferencia máxima de 0,0001 s en `tt`; entre el build en CPU y el build con GPU no hay ninguna diferencia. Los GLB no son idénticos byte a byte (el tamaño cambia en menos de 2 KB).
- **Horneados en CPU a propósito.** Los mapas se hornean en CPU aunque haya GPU, para que den lo mismo en todas las máquinas; la GPU se usa en los renders de control y en las hojas de poses.
- **Chrome y la placa.** Sin pantalla y con una NVIDIA, Chrome no elige la placa solo y cae a dibujo por software. `tools/browser.mjs` pide `--use-angle=vulkan` cuando existe `/dev/nvidiactl`; `TARIMA_ANGLE` lo cambia (`gl-egl` también funciona, `swiftshader` fuerza software).
- **Núcleos en contenedores.** Algunos pods limitan la CPU por cuota y `nproc` muestra todos los núcleos del anfitrión. El build lee la cuota de `/sys/fs/cgroup/cpu.max`; igual conviene fijar `TARIMA_THREADS`.
- **Prueba del visor por software.** Tarda mucho más y no exige fps, tiempos ni desenfoque de movimiento. Por defecto captura las páginas de escritorio a media densidad de píxeles; `TARIMA_SOFT_DPR=1` las deja a tamaño completo y tarda más del doble.

### Modelos comprimidos

`tools/export_web.py` deja `web/models` sin comprimir; **después hay que correr `tools/comprimir_modelos.sh`** (build.sh lo
hace solo al final, salvo con `TARIMA_SIN_COMPRIMIR=1`). Instala una vez `sharp` y `meshoptimizer` (versiones fijas) en
`~/.cache/tarima-comprimir` y, por personaje:

- `<nombre>.glb`: geometría, morphs y animación con `EXT_meshopt_compression` (filtro exponencial sobre float32, sin
  cuantizar posiciones ni tocar las matrices de enlace; índices, JOINTS y tiempos sin pérdida); texturas sin tocar.
- `<nombre>_1024.glb`: lo mismo con las texturas a 1024 px (color y pelo en WebP, normal y ORM en JPEG 4:4:4). Es el que
  baja el juego con calidad Baja o Móvil, que ya achicaba las texturas a 1024 al cargar.
- `<nombre>_mask.webp`: la máscara a 1024 px sin pérdida; `poses.json` apunta a ella y al GLB liviano (`glb1024`).

Al decodificar mide el error contra el original y falla si algo pasa su tope (líneas `ERR`). El visor y el juego decodifican
con `web/vendor/three/addons/libs/meshopt_decoder.module.js`. Comparación antes/después en Actions:
`gh workflow run carga.yml -R jvidelac1/tarima --ref <rama>` (medición de la carga con la red limitada y el visor con los
modelos de antes y de después).

### Pruebas en GitHub Actions

`.github/workflows/pruebas.yml` corre en cada push a `demo` (y a pedido) en `ubuntu-latest`, con Node 22 y el Chrome del runner. No usa Blender ni build: los modelos y three están en el repo. Pasos: `tools/sim_test.mjs`, `tools/play_human.mjs`, `tools/check_game.mjs` y `tools/check_fluidez.mjs --tutorial`. Tarda unos 12 minutos.

**El runner no tiene placa: Chrome dibuja por software (SwiftShader) y ahí no se miden cuadros por segundo.** Verifica núcleo, partida completa por teclado y por toques, registro y acuse de cada toque, paneles, consola y tutorial. La fluidez se mide solo en una máquina con placa.

```bash
gh run list -R jvidelac1/tarima --branch demo --limit 3              # últimas corridas: estado, commit e id
gh run watch <id> -R jvidelac1/tarima --exit-status                  # esperar a que termine (sale con error si falló)
gh run view <id> -R jvidelac1/tarima                                 # los pasos, y cuál falló
gh run view <id> -R jvidelac1/tarima --log-failed                    # la salida del paso que falló
gh run download <id> -R jvidelac1/tarima -D out_ci    # capturas, JSON y registros: una carpeta por grupo (pruebas-out-nucleo, -toques, -telefono, -recorrido)
gh workflow run pruebas.yml -R jvidelac1/tarima --ref demo           # a pedido, sobre la punta de demo
gh run rerun <id> -R jvidelac1/tarima                                # repetir una corrida sobre el mismo commit
```

Lo que traen los artefactos `pruebas-out-<grupo>` de «Pruebas del juego» (14 días; las pruebas corren en cuatro máquinas en paralelo):

- `logs/*.log`: la salida completa de cada prueba (lo mismo que el log del run). La última línea dice `OK`; si no, hay un bloque `FALLÓ` o `FALLA` con la lista de problemas.
- `game/*.png`: capturas de `check_game` (fin de la partida, ayuda, presentación, primer intento a velocidad real, Clásico, reloj).
- `fluidez/fluidez.json`: toques enviados, recibidos, aceptados y descartados con su motivo, y el tutorial. En este modo los cuadros figuran como «sin medir».
- `capturas/*.jpg`: una captura por panel, por señal y por toque, con el 3D dibujado. Es para mirar el juego sin abrir un navegador. Ese paso no decide el resultado, porque sacar la captura atrasa el toque y los levantamientos pueden fallar.

Cómo cambian las pruebas cuando el dibujo es por software (lo detectan solas por el nombre del renderizador):

- `check_fluidez` entra en **modo lógica**: abre el juego con `?dibujo=0`, corre sin estrangular el procesador y no exige ni informa cuadros dibujados. El gobernador de calidad no actúa sin dibujo, así que tampoco se prueba (`--gobernador` pide una placa). `--logica` fuerza el modo en una máquina con placa y `--dibujar` lo impide.
- `check_game` ya corría sin dibujar. Antes de cada captura fuerza un cuadro del 3D: la imagen muestra la escena y un sombreador roto sale como error de consola y hace fallar la prueba.

## Estructura

```
blender/
  common.py     arranque de Blender + MPFB, dispositivo de Cycles, render de control
  body.py       proporciones, físico y cara de cada personaje (CFG)
  style.py      colores, nombre e indumentaria (STYLES)
  make.py       cuerpo, rig y horneado de mapas de apoyo
  tex.py        texturas: color, relieve, rugosidad/oclusión, máscara
  geo.py        pesos, subdivisión, morphs correctivos, pelo, pestañas, cinturón
  shoes.py      zapatillas de halterofilia
  finish.py     arma todo lo anterior, llama a poses.py y exporta el GLB
  poses.py      sistema de poses por reglas, trayectoria, tiempos y chequeo de superposiciones
  pose_only.py  corre solo poses.py sobre un s3b.blend ya generado
  ctl3.py       renders de control de la malla en fases reales
tools/
  export_web.py     GLB reempaquetado, máscaras y web/data/poses.json (sin comprimir)
  comprimir_modelos.sh  comprime web/models: hay que correrlo después de cada export_web.py (build.sh lo hace solo)
  check_carga.mjs   carga del juego con la red limitada: bytes, tiempos y capturas de la pantalla de carga
  carga_svg.py      genera el pesista animado de la pantalla de carga (web/css/carga_lev.css)
  verify_build.py   verifica que web/ corresponde al último build
  check_viewer.mjs  prueba automática del visor (npm install; usa el Chrome del sistema)
  check_game.mjs, check_fluidez.mjs   pruebas del juego con navegador (corren también en GitHub Actions)
.github/workflows/
  pruebas.yml       pruebas del juego en cada push a demo, con dibujo por software
web/
  index.html, css/, js/   visor (three.js r187, módulos ES)
  vendor/three/           three.js vendorizado
  models/                 GLB comprimidos (<nombre>.glb para el visor y calidad Alta/Media, <nombre>_1024.glb para el
                          juego en Baja/Móvil), máscaras en WebP y normales de detalle
  data/poses.json         fases, tiempos y medidas que usa el visor
docs/img/         renders de control del primer prototipo
```

## Licencias de terceros

- MPFB: código GPL-3.0, assets CC0. No está incluido en el repo, se clona aparte.
- Los personajes generados con los assets CC0 de MakeHuman no arrastran restricciones.
