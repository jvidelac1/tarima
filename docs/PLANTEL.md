# Plantel: pesistas por parámetros

Un pesista es una entrada en `blender/plantel.py`. De ahí salen el cuerpo, el esqueleto, las texturas, las animaciones y la
ficha que usa el juego. Todos son **ficticios**: nombres, caras, países y códigos inventados (regla de `AGENTS.md`).

Blender **no se corre en la Mac del dueño**: los personajes se construyen en GitHub Actions
(`.github/workflows/pesistas.yml`, Ubuntu, sin placa).

## Los parámetros

| Parámetro | Qué es |
|---|---|
| `nombre`, `pais`, `codigo` | Identidad ficticia. El código va en el pecho de la malla y el apellido en la espalda. |
| `genero` | `'M'` o `'F'`. |
| `categoria` | Categoría de peso corporal de la IWF vigente. Hombres: 60, 65, 71, 79, 88, 94, 110, +110. Mujeres: 48, 53, 58, 63, 69, 77, 86, +86. |
| `estatura` | Metros. |
| `masa` | Kilos. Por defecto, el tope de la categoría; obligatoria en las abiertas (`+110`, `+86`). |
| `musculo` | 0 a 1: masa muscular. |
| `grasa` | 0 a 1: panza, cara más llena, menos definición y menos venas. |
| `prop` | Proporciones. `femur`, `tibia`, `brazo` y `hombros` como **fracción de la estatura** medida en el esqueleto; `antebrazo` como parte del brazo que es antebrazo (0,495 por defecto); `torso`, `cadera`, `gluteos` y `cintura` como desvío de -1 a 1. |
| `rasgos` | Mezcla (africano, asiático, caucásico) de los rasgos base. |
| `cara` | Lista de (target de MPFB, peso): forma de cabeza, mentón, nariz, pómulos, cejas, boca, orejas. |
| `piel` | Tono: un nombre de `PIEL` (`muy_clara` … `muy_oscura`) o `'#rrggbb'`. |
| `pelo` | `color`, `peinado` (`corto`, `rapado`, `rodete`, `rodete_alto`), `largo`, `barba`, `entradas`, `degrade`. |
| `ojos` | Color del iris. |
| `uniforme` | `malla`, `vivo`, `rodillera`, `rodillera2`, `cinturon` (o `None`), `zapatillas` (capellada, suela, acento, taco). |
| `tatuaje` | Bandas geométricas inventadas en el brazo izquierdo. |
| `juego` | Lo que usa la interfaz: `color`, `bandera` (degradé CSS de un país inventado), `dorsal`, `kg` (intentos de referencia del visor). |

Las categorías se verificaron en la web el 15 de noviembre de 2026: la IWF anunció el 20 de diciembre de 2024 ocho categorías
por género desde el 1 de junio de 2025, y el 8 de mayo de 2025 cambió la de 98 kg de hombres por 94 kg.
`plantel.validar()` rechaza una categoría que no esté en la lista o una masa que no entre en la categoría.

### Lo que el build resuelve solo

- **La masa manda sobre el volumen.** `body.py` estima la masa del cuerpo (volumen encerrado por la piel por una densidad
  que baja con la grasa) y busca el macro `weight` de MPFB que da la masa pedida. Si con el máximo no alcanza, suma un
  paquete de volumen (tronco, cadera, muslos y brazos). Línea `MASA` del log.
- **Las proporciones son metas del esqueleto.** `femur`, `tibia`, `brazo`, `hombros` y `antebrazo` se miden entre
  articulaciones del esqueleto ya armado. El build rearma el cuerpo unas ocho veces (segundos cada una) hasta cumplirlas.
  Línea `PROP`; si un target de MPFB llega a su tope, lo dice y deja esa meta lo más cerca que puede.
- **Límite conocido de las palancas:** con el antebrazo más largo que el brazo (más de 0,51 del brazo) el codo no llega a
  la altura del rack con el agarre de cargada, y `check()` lo marca (`codo-rack`). No se resuelve aflojando el chequeo.
- **Barra por género:** hombres 20 kg y 28 mm; mujeres 15 kg y 25 mm (`rbar`, `barkg` en el estilo; `bar` en `poses.json`).
  Con la mano chica, la de 25 mm es la que deja cerrar el hook.
- **Prendas a escala:** rodilleras y medias se escalan con la estatura; el corte de la malla (escote y sisa) cambia con el género.
- **Reglas por género y categoría** (`plantel.cfg()` y `plantel.proporciones()`): el más alto de su género tiene palancas
  más largas; el más pesado, hombros y cintura más anchos. La mujer lleva hombros más angostos, más cadera y glúteo, busto,
  piernas de pesista y tren superior con menos volumen. Con grasa, el volumen del tren superior lo pone la grasa y no el
  músculo marcado.
- **Cuerpo femenino**: malla con el escote más alto y la sisa más cerrada, busto alisado bajo la tela (como lo deja un top
  deportivo), sin sombra de barba ni vello, cejas más finas, sin relieve de pectoral, y pelo atado (`rodete`, `rodete_alto`): hebras peinadas hacia el moño, sin entradas ni
  degradé, y un moño de malla pegado al hueso `Head`.
- **Mismo esqueleto y mismas animaciones.** Los 52 huesos Mixamo más `Bar` y las reglas de `poses.py` son los mismos para
  todos. Lo que se generalizó en las reglas para que valgan en todo el rango de cuerpos está en `HANDOFF.md`, «Plantel
  paramétrico»: la regla de tiempos (línea `TIMING`), la escala de la mano en el rack y la cápsula del pecho.

## Cómo se agrega un pesista

1. **Entrada nueva** en `PESISTAS` de `blender/plantel.py`. Alcanza con `nombre`, `pais`, `codigo`, `genero`, `categoria`
   y `estatura`; lo demás tiene valores por defecto. `python3 blender/plantel.py` lista el plantel y valida.
2. **Sonda** (2 a 6 minutos, solo cuerpos): medidas, masa y una lámina de frente, costado, tres cuartos y espalda.

   ```bash
   gh workflow run pesistas.yml -R jvidelac1/tarima --ref <rama> -f modo=sonda -f pesistas="<id>"
   ```
3. **Build** (15 a 25 minutos por pesista, uno por máquina en paralelo):

   ```bash
   gh workflow run pesistas.yml -R jvidelac1/tarima --ref <rama> -f modo=completo -f pesistas="<id>"
   gh run watch <corrida> -R jvidelac1/tarima --exit-status
   gh run download <corrida> -R jvidelac1/tarima -D <carpeta>
   ```

   El trabajo queda en rojo si `check()` da cuadros `BAD`. En `<carpeta>/pesista-<id>/out/<id>/` quedan `lineas.txt`
   (`MASA`, `PROP`, `POSE`, `CHK`, `BAD`, `TRAJ`), las hojas `sheet_<seg>_side.png` y `sheet_<seg>_front.png`, los renders de
   control `d_*.png` y los retratos `ctl/ret_*.png`. Hay que mirarlos.
4. **Sumarlo al juego** (sin Blender):

   ```bash
   python3 tools/sumar_pesista.py <carpeta>      # copia web/models/<id>* y suma su entrada a web/data/poses.json
   python3 tools/plantel_web.py                  # reescribe web/data/plantel.json
   ```
5. **Visor**: una línea en `ATHLETES` de `web/js/config.js` (nombre, país, categoría, bandera, kilos de referencia).
6. **Juego**: `juego.html?plantel=<id>,<id>,<id>` (ver abajo). Para una terna con nombre, sumarla a `TERNAS` en
   `tools/plantel_web.py`.

## En el juego y en el visor

- **Visor** (`web/index.html`): una ficha por pesista de `ATHLETES` que ya tenga modelo en `data/poses.json`.
  `index.html?who=solanet`.
- **Juego** (`web/juego.html`): `?plantel=` cambia qué modelo dibuja a cada uno de los tres pesistas, en el orden Compacto,
  Largo, Potente. Vale una terna de `data/plantel.json` (`mujeres`, `hombres`, `livianos`, `pesados`, `mixto`) o tres ids
  separados por coma. El pesista del jugador es el del tipo que eligió; los otros dos son los rivales y llevan el nombre, el
  país y la bandera del modelo.
- Las fichas deportivas (`web/data/sim.json`: kilos, atributos, plan del rival) **no cambian** con el vestuario, así que la
  partida, su huella y la validación del servidor siguen igual. Categorías con kilos propios por género y peso son el paso
  siguiente y cambian `sim.json` (temporada nueva).
- Un modelo repetido en la terna lleva la tela de otro color y no tiene primer plano de cara (como Marangi con Brenner).
- Fotos del juego con un plantel: `node tools/banco.mjs --fotos=out/fotos --niveles --plantel=mujeres --pesista=ventura`.

## Lo que se exporta para los materiales del juego

Para los materiales por parámetro (piel, pelo y tela) no hace falta reconstruir nada:

| Qué | Dónde |
|---|---|
| Tono de piel, color de pelo, iris, malla, vivo, rodillera, zapatilla, cinturón (hex sRGB), peinado, barba, género | `web/data/plantel.json`, `pesistas.<id>` |
| Máscara por texel: R piel, G tela, B pelo | `web/models/<id>_mask.webp` (ruta en `poses.json`, `mask`), con el UV del material `Body` |
| Segunda máscara: R rodilleras, G medias, B vendas de muñeca | `web/models/<id>_mask2.webp` (`mask2` en `poses.json`), mismo UV. La tela de la malla sola es `mask.G × (1 − max(mask2.R, mask2.G, mask2.B))`. Solo la traen los pesistas del plantel nuevo |
| Materiales del GLB | `Body` (piel, malla, rodilleras, medias y vendas en un solo UV), `Eyes`, `Hair` (capas con alfa), `Lashes`, `Bun` (moño opaco, solo con pelo atado), `ShoeUpper`, `ShoeSole`, `ShoeHeel`, `ShoeStrap`, `ShoeLace`, `Belt`, `BeltMetal` |
| Nodos de malla | `Human` (lleva los morphs correctivos) y `Human_parts` (todo lo demás) |

Las zapatillas y el cinturón ya son materiales aparte (no están en el UV de `Body`). Con `Athlete.setAspecto()` de la rama
`look`, `PLANTEL[id].aspecto` se toma de `juego.aspecto` de la ficha si existe; el vestuario nunca arrastra el aspecto del
modelo anterior.

El UV de `Body` es el mismo mallado base para todos los pesistas (MPFB): una textura o una máscara pintada sobre ese UV
sirve para cualquiera. El color de la malla hoy está horneado en `body_color`; el juego ya lo puede tapar con un color plano
(`setClothFlat`, con el canal G de la máscara). El tono de piel también está horneado: para cambiarlo por parámetro en el
juego, el canal R de la máscara dice dónde hay piel y `plantel.json` cuál es el tono de partida.

## Archivos

| Archivo | Qué hace |
|---|---|
| `blender/plantel.py` | El plantel y las reglas que pasan de parámetros a cuerpo (`cfg`) y a estilo (`sty`). Python puro. |
| `blender/body.py` | Cuerpo con MPFB, ajuste de masa y de proporciones, esqueleto Mixamo. |
| `blender/style.py` | Reexporta `STYLES` de `plantel.py`. |
| `blender/sonda.py` | Lámina y medidas de los cuerpos, sin build. |
| `blender/geo.py`, `blender/tex.py` | Moño (`geo.bun`, `tex.bun`), pelo atado, corte de la malla y relieve muscular por parámetro. |
| `tools/ci_blender.sh` | Prepara el runner (bibliotecas, `bpy`, MPFB fijo en un commit). |
| `tools/sumar_pesista.py` | Suma al juego lo que baja de Actions. |
| `tools/plantel_web.py` | Escribe `web/data/plantel.json`. |
| `web/js/game/roster.js` | `vestir()` y `ternaDe()`: el vestuario del juego. |
