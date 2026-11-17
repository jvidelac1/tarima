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
| `uniforme` | `malla`, `panel` (color de los paneles laterales en diagonal, con el `vivo` en la costura; `None` = malla lisa), `vivo`, `rodillera`, `rodillera2`, `cinturon` (o `None`), `zapatillas` (capellada, suela, acento, taco). |
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
4. **Sumarlo al juego** (sin Blender; los `.glb`, `_1024.glb` y máscaras que quedan en `web/models/` se suben al repo):

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
- **Juego** (`web/juego.html`): desde el 17-nov el plantel nuevo es el del juego. Sin parámetros se viste la terna `hombres`
  (`PLANTEL_DEFECTO` en `roster.js`): Ilarraz en la plaza Compacto, Kordan en Largo y Jastrev en Potente. Sus modelos están en
  el repo (`web/models/`, de la corrida 44038971821), igual que el de Solanet. `?plantel=` elige otra terna, en el orden
  Compacto, Largo, Potente: una de `data/plantel.json` (`hombres`, `livianos`; `mujeres`, `pesados` y `mixto` aparecen cuando
  Halvard tenga modelo en el repo) o tres ids separados por coma (`?plantel=solanet,kordan,jastrev`). `?plantel=clasico` deja a
  Ventura, Brenner y Marangi con sus modelos de siempre. Solo se bajan los modelos de la terna que se juega. Si `plantel.json`
  no llega, el juego sigue con los clásicos. El pesista del jugador es el del tipo que eligió; los otros dos son los rivales y llevan el nombre, el
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

## Dirección de arte (16-nov): semirrealista heroico

La vara es la imagen de referencia del dueño (tres pesistas macizos, piel mate con magnesio, equipo completo). Reglas que
salen de ahí, todas en `plantel.cfg()`/`sty()` y `tex.py` (nada por personaje):
- **Físico heroico**: cuello, brazo y muslo más gruesos por regla (`measure-neck/upperarm/thigh-circ-incr`); la masa de la
  categoría sigue mandando, así que el volumen sale de la cintura.
- **Mirada**: párpados pesados (`eye-*-slit`) y ceño (`eyebrows-*-down`); las cejas son pelos pintados (sin capas).
- **Pelo y barba**: las capas llevan un segundo UV (`UVCuero`, el UV del cuerpo) y el visor las recorta con el canal B de la
  máscara: el nacimiento es el pintado (curvo y ralo), no el borde de los polígonos.
- **Equipo**: cinturón en todos, malla con paneles, magnesio en manos, muslos, pecho de la malla y rodilleras.
- **Piel**: mate. El visor no suma relieve de poro; lee el mapa de normales de la piel un nivel más borroso (`uNormBias`).
- Terna de las fotos (`TERNA` en `graficos.yml`): ilarraz (71, compacto definido), jastrev (+110), kordan (94, compacto atlético).

## Físico anatómico (17-nov): `fisico='anatomico'` en la ficha

Pedido del dueño: «los pesistas son cubos mal hechos»; la vara es el cuerpo de su imagen (`ref_dueno/fisico-objetivo.webp`). Lo llevan
kordan, ilarraz, jastrev y solanet; halvard y los dos originales se construyen como antes (todo está detrás del parámetro).

- **Masas por grupo muscular** (`tex._masas`, ganancias en `plantel._GRUPOS_M` / `_GRUPOS_F` y `grupos` de la ficha): deltoides en tres
  cabezas, bíceps, tríceps (cabeza larga y lateral), antebrazo (supinador y flexores), pectoral cuadrado, trapecio superior, dorsal,
  romboides, erectores, glúteo, recto femoral, vasto lateral, vasto medial, aductores, isquios y gemelos. Cada una es un vientre
  (`_vientre`: cero en las inserciones, máximo en el centro) por un lóbulo angular alrededor del hueso: entre vientres quedan surcos.
  El grosor del muslo (`muslo`) va por el mismo campo con perfil a lo largo del fémur. La malla lleva las masas (`geo.anatomy`, sobre la
  normal alisada) y el normal map los surcos finos; el hueco entre vientres oscurece la oclusión y el color.
- **Targets de MPFB**: con `muscle` alto MPFB da un culturista (hombros enormes, cintura fina, piernas flacas). Con el físico anatómico
  bajan hombro, brazo, cuello y la V del torso, y suben cintura, cadera, glúteo y profundidad del tronco. `measure-thigh-circ`,
  `measure-calf-circ` y `upperleg-scale-horiz/depth` NO sirven para el muslo: dan un globo arriba y la rodilla fina.
- **La masa sigue mandando**: `body.py` mide el volumen que suma el relieve (`geo.anat_vol`) y lo descuenta del objetivo del macro
  `weight`. La línea `MASA` lo informa («del cuerpo base + del relieve muscular»). Con los perímetros «de pesista» en todos los
  segmentos a la vez el volumen no alcanza: lo que se le da al muslo sale del tronco.
- **Cabeza a escala**: se mide (coronilla a mentón) y se escala pareja alrededor de la articulación hasta estatura / 7,55 (línea `CABEZA`).
- **Sin puntas ni bultos bajo la malla**: el racimo de polígonos de la punta del pecho se reemplaza por mínimos cuadrados móviles
  (`geo.chest_smooth`), sus pesos y el delta del correctivo se interpolan desde el anillo (`geo.punta_interp`), su centro va a
  `lm.json` (`nipL`, `nipR`) para que la textura apague ahí relieve y oclusión, y los targets `genitals/*` van al mínimo.
- **Piel por zonas** (`piel2` del estilo): sol, sangre en hombros y escote, moteado ancho, lunares escasos; el surco pintado baja
  (ya está en la malla). En el visor, el normal map de la piel se lee 1,1 niveles más borroso (antes 1,7).
- **Medidas** (`ANTROM`, ahora en `geo.antro_malla`): los cortes toman todos los vértices del miembro (antes solo los que dominaba un
  hueso: el muslo salía incompleto y el hombro tomaba el trapecio). La sonda (`modo=sonda`) también aplica el relieve y mide.
- **Vista previa sin Blender**: `python3 tools/prever_fisico.py <out/<id> del artefacto> salida.jpg <id>` dibuja el cuerpo con el
  relieve desde `maps_1024.npz` y `bones_all.json` (con `PREV_COLOR=1`, con el color de `tex.py`). Sirve para ajustar `tex._masas` en segundos.
- **Pieles de MakeHuman (CC0)**: no se integraron. El paquete `makehuman_system_assets` pesa 280 MB por trabajo de CI y sus difusos
  traen areola, cejas y vello pintados; queda como estimación pendiente comparar su detalle de poro contra la piel por reglas.
