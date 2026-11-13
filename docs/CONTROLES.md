# Controles: Fácil y Clásico

## Nivel `'u'` («un toque, un tramo»): el Fácil por defecto desde el 13-nov

**Esto manda sobre el resto del documento.** El diseño está en `docs/JUEGO.md`, sección Gameplay 2. Lo de abajo describe lo implementado en la rama `gameplay` y cómo se mide. El Fácil de círculos (`'f'`) salió de Opciones y queda en el núcleo solo para recalcular registros viejos (`?ctl=f` lo abre para las pruebas). Clásico (`'c'`) no cambió.

### El gesto exacto

Un levantamiento son 3 toques en el arranque y 4 en el dos tiempos. **Ningún toque tiene un momento justo:** cada uno cumple un tramo entero y vale en cualquier punto de él.

| Paso | Señal (tipo) | Cuándo vale el toque | Si no tocas |
|---|---|---|---|
| — | PREPÁRATE (`espera`, 1,2 s) | el toque queda **guardado** para ¡TIRA! | sigue |
| 1 | ¡TIRA! (`libre`) «toca cuando quieras» | cualquier momento | sale sola con 5 s de reloj por delante (a los ~25 s); no hay nulo |
| 2 | ¡SALTA! (`luz`) «toca otra vez» | desde 250 ms después de ¡TIRA! hasta la **recepción** (un toque antes queda guardado) | salto flojo: ¼ de disco más de gasto |
| 3 | ¡PÁRATE! (`uno`) «toca una vez» | desde la recepción hasta que el tramo cierra (1,5 s de subida; con el pisotón, antes) | se para más lento y sin la devolución de ½ disco |
| — | RESPIRA (`espera`, 0,45 s), solo dos tiempos | el toque queda guardado para ¡ARRIBA! | sigue |
| 4 | ¡ARRIBA! (`libre`) «toca cuando estés listo», solo dos tiempos | cualquier momento | sale solo a los 6 s |
| — | ¡DA TODO! (`decide`), solo en el FRENO | 2,5 s para usar la garra | la barra cae y la garra queda para otro intento |
| — | AGUANTA y ¡ABAJO! (`auto`) | — | automáticos |

¡SALTA! cierra en la recepción y no en la explosión (el diseño decía la explosión): con el tirón de 0,73 a 0,85 s, el tramo quedaba en medio segundo y un jugador que reacciona tarde (+600 ms, meta A) perdía el ¼ de disco. Así dura de 1,2 a 1,6 s.

**Regla del contacto** (`attempt.js`, `_uEntrada`): un contacto es un keydown de Espacio o Enter, un pointerdown en la zona, o la tecla o el dedo que ya están apoyados cuando abre un tramo. El primero cumple el tramo; uno de más queda guardado (uno solo) para el tramo siguiente, y si no queda ninguno sale «listo» en gris. Dos contactos a menos de 120 ms (teclado) o de 80 ms (dedo) son uno («doble»), y los de los 300 ms después de confirmar son parte de la confirmación. Mantener cumple cada tramo que abre (también la garra). El núcleo hace todo esto, así que el registro lo recalcula igual en cualquier lado.

**Qué decide.** El margen (`rules.js`, `UNO`): 3 discos más «el día» (±0,9, se revela al agarrar la barra), menos lo que se come cada tramo según la intensidad y el cuerpo del pesista. La capa (`controles.js`) es la identidad en `'u'`; la palabra de cada contacto (`QUE_U`) sale en la placa del pulgar: ¡VAMOS!, ¡BIEN!, ¡PISOTÓN!, ¡ESO!, ¡GARRA! o, en gris, «guardado», «listo», «doble».

### Espacio en la computadora (`input.js`, `Boton`)

- Durante un levantamiento propio (`boton.intento`), Espacio y Enter se atienden en **captura sobre window**, con `preventDefault` y `stopImmediatePropagation`: no desplazan la página ni activan un botón aunque tenga el foco (lo prueba `check_toques`).
- Si el primer evento de una tecla es una repetición (el foco llegó con la tecla apretada), cuenta como apretar. Las repeticiones de una tecla apoyada no cuentan.
- Al cerrar el panel del llamado se suelta el foco (`soltarFoco`) y el escenario lo toma (`tabindex=-1`).
- Acuse en el mismo manejador: la tecla dibujada se hunde y suena el tic; después, la palabra del núcleo.

### El dedo en el celular

- Toda la pantalla cuenta, menos 56 px arriba, 24 px a cada costado y 20 px abajo (`BORDES`, `enBorde`): ahí están los gestos del sistema, y un toque ahí no es un contacto.
- El contacto cuenta en `pointerdown` (con `preventDefault`); `navigator.vibrate(12)` donde exista.
- Un `pointercancel` no anula lo contado: el dedo sigue apoyado 400 ms (`GRACIA_MS`) por si vuelve.
- Sin corrección de atraso: no hay ventanas.

### Cómo se mide (sin navegador, en la Mac o en Actions)

| Prueba | Qué mide |
|---|---|
| `node tools/play_human.mjs` | metas A (cinco maneras de tocar dan el mismo resultado; el ausente solo pierde ¼ + ½ disco) y B (primer intento del novato); informa C (curva), D (dónde caen los pesistas) y novato · medio · bueno por tramo |
| `node tools/teclado_test.mjs`, `node tools/dedo_test.mjs` | meta H: 10 000 secuencias cada una por la clase `Boton` de verdad en un DOM de mentira (`tools/entrada_sim.mjs`) |
| `node tools/ritmo_test.mjs` | meta J: duración de la final, esperas, turnos de rival, veredicto e intento propio |
| `node tools/sim_test.mjs` | `'c'` y `'f'` idénticos (`sim_ref.json`, `sim_ref_facil.json`), `sim_ref_uno.json`, 1000 finales `'u'` recalculadas, líneas de caída sin tiempos (meta G) |

`play_human.mjs --f` y `dedo_test.mjs --f` siguen midiendo el Fácil de círculos (línea de base).

---

**12-nov, tarde: entrada tolerante y dificultad que crece con los kilos.** El usuario jugó tres veces y dijo que es «difícil de acertar el momento donde tocar» y que «a veces no agarra bien el space, entonces toco mucho space y no levanta». Cambió Fácil: un toque antes de tiempo ya no gasta la señal ni es amague (la capa responde TODAVÍA NO y vale el primer toque que cae en la ventana); desde la recepción todo toque empuja; en los pesos livianos la barra sube sola; las ventanas de PERFECTO y BIEN se achican recién cerca del techo; y la señal muestra la franja de BIEN y una cuenta 3-2-1. Las secciones 1.1, 2, 3, 4, 5 y 9 ya lo describen. Clásico y los rivales no cambiaron.

Especificación del rediseño de controles de la etapa 1. Reemplaza la sección 3.1 de `docs/JUEGO.md` en teclas y gestos; el resto del diseño sigue igual. **Implementado el 11-nov en la rama `demo`**; el estado, lo medido y lo que falta medir están en `HANDOFF.md`, «Controles». Una verificación independiente encontró tres problemas graves (el reloj corría sobre el panel del llamado, la subida perdida pedía 12 s de toques y el arranque guiado se podía fallar); la corrección cambió las reglas de la subida en Fácil, y este documento ya las describe. Los números de la sección 9 son de `tools/play_human.mjs --info` sobre el código final. La pantalla se probó por script y se miró en capturas (`tools/primera.mjs`); ninguna persona lo jugó todavía.

**Qué falló.** Un botón con seis gestos de mantener y soltar, ventanas de ±35 a ±70 ms y ninguna palabra en pantalla durante el intento. Además hay un error de dibujo: **en el calentamiento el pesista no se mueve nunca**. `practica()` confirma en el instante 0 y `poseDe()` (`sequence.js`) pregunta `!m.tConf`, que con 0 da verdadero: la pose queda en `Parado` todo el intento (verificado en node: con `conf = 0`, `tau` vale 0 en tensión y en tirón; con `conf = 1` vale 1,2 y 1,8). Las pruebas no lo ven porque el monitor de la barra usa la misma condición. Se corrige con `m.tConf === undefined` en los dos lugares.

## 1. Teclas

| Dónde | Tecla | Qué hace |
|---|---|---|
| Levantamiento | **Espacio** (Enter hace lo mismo) | Fácil: un toque por señal; soltar la tecla no significa nada. Clásico: apretar, mantener y soltar |
| Levantamiento, teléfono | Dedo sobre la zona táctil | Lo mismo que Espacio |
| Levantamiento, mouse | Ninguna | El clic no hace gestos en ningún nivel. Solo aprieta botones de paneles |
| Paneles | ↑ ↓ o Tab | Mueven el foco. Al abrir un panel el foco va al botón principal y se ve siempre (borde dorado) |
| Paneles | ← → | Con selector de kilos: −1 y +1 kg. Sin selector: mueven el foco dentro de la fila |
| Paneles | Enter (o Espacio) | Activa el botón con foco |
| Fuera del intento | Esc | Pausa: congela el reloj inyectable (`reloj.manual`) y lo suelta al volver; el reloj del llamado no corre |
| Tutorial | Esc (o el botón «Saltear tutorial ESC», siempre a la vista) | Saltea el tutorial en cualquier momento del levantamiento guiado |
| Levantamiento | Tab | No hace nada: no saca el foco de la página |
| Fuera del intento | H o ? | «Cómo se juega», tres viñetas |
| Esperas (luces, repetición, resumen) | Espacio o Enter | Saltea |

El nivel se elige en la pantalla de inicio («Controles: FÁCIL · CLÁSICO»), se guarda en `tarima.ctl` y queda fijo para toda la partida. Por defecto, Fácil.

### 1.1 Ningún toque se pierde en silencio

Toda pulsación de Espacio o Enter (y todo dedo o clic sobre el escenario) queda anotada en `toques` (`input.js`) como aceptada o descartada con su motivo, y tiene **acuse inmediato**: la tecla dibujada abajo a la derecha (`#acuse`) y la de la señal se hunden, sea o no el momento. Si el toque no sirvió, al lado de la tecla sale el motivo en una palabra. El instante del toque sigue saliendo del evento (`reloj.deEvento`), no del cuadro.

| Dónde se descarta | Motivo (palabra en pantalla) | Por qué queda |
|---|---|---|
| PREPARATE, los 450 ms de RESPIRÁ, tutorial con el reloj andando | `espera` (ESPERÁ) | Todavía no hay nada que tocar. En PREPARATE y en el tutorial la señal dice además «TODAVÍA NO» |
| Fácil: ¡EXPLOTÁ!, ¡RECIBÍ!, ¡ARRIBA! antes de que abra la ventana de la señal (300 ms antes del cierre; en el tirón, además, antes de la rodilla) | `temprano` (TODAVÍA NO) | No gasta la señal ni arruina el intento: no llega al núcleo y vale el primer toque que cae adentro (desde el 12-nov, tarde; antes era amague o fallo). La señal dice «TODAVÍA NO» si no acaba de salir la palabra del toque anterior |
| Menos de 60 ms después del toque anterior (`CAPA.reboteMs`) | `rebote` (REBOTE) | Rebote de tecla: sin esto, un doble contacto gastaría el toque siguiente |
| ¡EMPUJÁ! con la barra ya arriba, AGUANTÁ, ¡ABAJO!, ¡RECIBÍ! ya tocado | `sobra` (SOBRA) | No hace falta. Desde el 12-nov, tarde, en Fácil, todo toque de la subida cuenta desde la recepción (antes, los que llegaban antes de que arrancara ¡EMPUJÁ! se descartaban por `espera`, y los que «ya alcanzaban», por `sobra`) |
| ¡RECIBÍ! cuando la barra ya se perdió | `tarde` (TARDE) | El intento ya está decidido; la línea de fallo dice «tocaste tarde», no «no tocaste» |
| Entre el final del intento y el veredicto | `termino` (TERMINÓ) | Idem |
| Veredicto: los primeros 400 ms (1,2 s si trae línea de fallo) | `espera` | Que el toque que venía de la subida no saltee la explicación |
| Panel recién abierto: 400 ms | `espera` | Que un toque de la pantalla anterior no elija nada |
| Momentos de TV sin nada que tocar (carga, intento de un rival) | `espera` | No hay quien lo tome |
| Clic del mouse sobre el escenario durante el intento | `mouse` (TECLADO) | El clic no es un gesto |
| Pausa abierta | `pausa` | |

Lo que **ya no se descarta**: la pulsación de una tecla que figuraba apoyada porque se perdió su `keyup` (antes se ignoraba; ahora se levanta y se vuelve a apoyar). La repetición automática del sistema no es un toque nuevo: la tecla sigue hundida. Si la ventana pierde el teclado (clic en la barra de direcciones, otra ventana), un cartel lo dice: «El juego no está recibiendo el teclado · hacé clic acá».

`juego.html?depura=1` muestra un recuadro con el refresco de la pantalla y la meta, cuadros por segundo ofrecidos por el navegador y dibujados, milisegundos por cuadro (media y peor del último segundo), calidad en uso y cuántas veces bajó, y los últimos siete toques (aceptado con su señal y su error en ms, o descartado y por qué). Lo mismo está en `JUEGO.toques` y `JUEGO.calidad`.

## 2. Secuencia de toques

La señal está siempre en el mismo lugar (sección 5). Cada toque recibe su palabra: PERFECTO, BIEN, TEMPRANO o TARDE.

**Fácil, arranque**

Cada señal con círculo tiene una **ventana**: vale desde 300 ms antes del cierre (`FACIL.abreMs`; en el tirón, además, no antes de que la barra pase la rodilla) hasta 330 ms después (`FACIL.limMin`, o el límite si es más ancho). Fija a cualquier peso. Un toque antes de que abra no cuenta («TODAVÍA NO») y no gasta la señal; vale el primero que cae adentro. Qué tan bien sale depende de cuánto se aleja del cierre: PERFECTO y BIEN son la franja dorada de la señal, y se achican recién cerca del techo (sección 4).

| Paso | Señal | El círculo se cierra | El toque |
|---|---|---|---|
| — | PREPARATE | No hay círculo (1,2 s) | No se toca |
| 1 de 3 | **¡TIRÁ!** · «Apretá ESPACIO para empezar el levantamiento» | No hay círculo: cuando quieras, con el reloj corriendo | Arranca el tirón |
| 2 de 3 | **¡EXPLOTÁ!** | 0,72 a 0,88 s después del toque 1 (más tarde con más kilos) | Explosión |
| 3 de 3 | **¡RECIBÍ!** | 0,63 a 0,75 s después del toque 2 | Recepción |
| — | **¡EMPUJÁ!** · «tocá rápido: que no te alcance el rojo» | Barra de avance en lugar del círculo; un piso rojo la persigue | Cada toque empuja, desde la recepción hasta quedar de pie. En los pesos de apertura la barra sube sola si no tocás (unos 2,3 s en vez de 1,3); desde el 96 % del techo hay que tocar. Aparece siempre |
| — | AGUANTÁ, y con la chicharra ¡ABAJO! | — | Nada: fija y baja solo |

**Fácil, dos tiempos.** Pasos 1 a 3 iguales (dicen «de 6») y ¡EMPUJÁ! en la subida de la cargada. Con la barra en los hombros:

| Paso | Señal | El círculo se cierra | El toque |
|---|---|---|---|
| — | RESPIRÁ | No hay círculo (0,45 s) | No se toca |
| 4 de 6 | **¡FLEXIONÁ!** · «Apretá ESPACIO para el envión» | No hay círculo; hay 8 s | Empieza la flexión |
| 5 de 6 | **¡ARRIBA!** | 0,6 s después del toque 4 (`FACIL.cierreMs`; en Clásico, 0,36 a 0,42 s) | Envión |
| 6 de 6 | **¡RECIBÍ!** | 0,55 a 0,81 s después del toque 5 | Recepción arriba |
| — | ¡EMPUJÁ! (solo en squat o con codos blandos), AGUANTÁ, ¡ABAJO! | | |

En Fácil el envión que viene elegido es la tijera (los tres la dominan); el panel deja cambiarlo.

**Clásico.** El esquema no cambia; usa la misma señal con otros verbos, y conserva el anillo, la línea y el medidor con franja verde.

| Momento | Señal | Gesto |
|---|---|---|
| Tensión | APRETÁ Y MANTENÉ (con el anillo lleno) | Apretar y no soltar |
| Explosión | ¡SOLTÁ! | Soltar |
| Recepción | ¡APRETÁ! | Apretar |
| Subida | ¡EMPUJÁ! · «sin pasarte de la franja» | Tocar repetido |
| De pie | DEJÁ APRETADO | Mantener hasta la chicharra |
| Chicharra | ¡SOLTÁ! | Soltar |

En el envión: apretar y mantener, soltar en el fondo de la flexión, apretar al recibir.

## 3. Capa de traducción

`web/js/game/controles.js`: funciones puras, sin DOM, que usan el juego y los bots. `traducir(m, t, ctl)` devuelve los eventos para el núcleo. `m` es la máquina recalculada hasta `t` con lo ya registrado (`simular(ctx, conf, ent, t)`): la fase se lee en el instante del toque, no en el último cuadro dibujado. `t` es el instante del `keydown` o del `pointerdown`, nunca menor que el último evento registrado. En Clásico es la identidad (tecla abajo `[t,1]`, tecla arriba `[t,0]`). En Fácil:

| Fase del núcleo | El toque se convierte en | Qué hace el núcleo |
|---|---|---|
| `tension` | `[t,1]` (el contacto queda apoyado) | Empieza el tirón |
| `tiron` | `[t,0]` si la ventana abrió (`abre(m)`); si no, nada (`temprano`) | Explosión |
| `vuelo`, `empuje` | `[t,1]` (queda apoyado hasta la bajada) si la ventana abrió; si no, nada (`temprano`) | Recepción |
| `pelea`, `traba` | `[t,1],[t,0]` sobre el contacto apoyado, mientras la barra no está arriba o los codos sin trabar | Un toque de pelea (también antes de que arranque la subida) |
| `hombros` | `[t,0],[t,1]` | Levanta el contacto de la cargada (sin efecto) y empieza la flexión |
| `flexion` | `[t,0]` si la ventana abrió; si no, nada (`temprano`) | Envión |
| `llamado`, `acomodo`, `post`, `fijacion` | Nada | — |

- **Pelea y traba de codos.** El toque sirve mientras la barra no está arriba (`P < 1`) o los codos no trabaron, desde la recepción (antes de que arranque la subida también: no se descarta por `espera`). Los de después no llegan al núcleo y no gastan Resto. En Fácil el núcleo no hace temblar por empujar de más (sección 4): «tocá rápido» es verdad sin letra chica.
- **Fijación automática.** El contacto de la recepción sigue apoyado, así que el núcleo ve apoyo firme a los 300 ms de quedar de pie. `automaticos(m)` corre en cada cuadro y agrega `[tb + 150, 0]` cuando pasó la chicharra: instante fijo, no depende del cuadro. «Suelta antes» y «no fija» no pueden ocurrir.
- **Toque antes de tiempo (desde el 12-nov, tarde).** Un toque antes de que abra la ventana de la señal (`abre(m)` en `controles.js`: 300 ms antes del cierre, y en el tirón no antes de la rodilla) no llega al núcleo: motivo `temprano`, TODAVÍA NO en el acuse y en la señal. La señal sigue esperando y vale el primer toque de adentro: tocar de más no castiga. Antes era amague (dos por movimiento; el tercero, fallo) o fallo en el vuelo; el núcleo conserva esas reglas para registros armados a mano, pero la capa ya no deja pasar esos toques.
- **Toque fuera de turno.** A menos de 60 ms del toque anterior aceptado: se descarta (rebote de tecla). En `acomodo`, en los 450 ms de RESPIRÁ, en `post` y en `fijacion`: se descarta sin castigo (en `acomodo` sale «TODAVÍA NO»; en RESPIRÁ no se dice nada, porque suele ser la cola de ¡EMPUJÁ!).
- **Soltar la tecla** y la repetición automática no generan nada.

## 4. Núcleo: qué cambia en Fácil

El contexto del intento lleva `ctl: 'f' | 'c'`. Sin el campo vale `'c'` y todo da exactamente lo de hoy.

| Parámetro | Clásico | Fácil | Dónde |
|---|---|---|---|
| Ventanas (perfecta, buena y límite) | Tabla de hoy | × `anchoFacil(I)`: 2 hasta el 92 % (`FACIL.holgadoHasta`), baja en línea recta hasta 1,15 en el 100 % (`anchoTecho`) y queda ahí. Al 90 %: ±104, ±228 y ±388 ms; al 95 % (1,68): ±73, ±163, ±297; al 100 %: ±40, ±88, ±180. Se aplica al final, después de técnica, temple, piso y primera partida | `rules.js`: `ventanas()` acepta `o.ancho` y devuelve `k` |
| Ventana de la señal (desde cuándo y hasta cuándo un toque cuenta) | El límite `l` de los dos lados | De −300 ms (`abreMs`; en el tirón, no antes de la rodilla) a +330 ms (`limMin`, o `l` si es más ancho), a cualquier peso. Un toque más allá del límite de calidad cuenta como el peor TEMPRANO o TARDE. La capa no deja pasar los de antes | `attempt.js`: `_w()` agrega `A` y `L`; `controles.js`: `abre()` |
| Desvío por error de explosión | 0,6 y 0,4 mm por ms fuera de la perfecta | El exceso se divide por `k`: la misma curva, estirada | `rules.js`: `desvioExplosion()` |
| Tirón anticipado (entre la rodilla y el límite) | Fallo | No llega: la capa lo descarta como `temprano`. En el núcleo queda la regla de antes (amague; el tercero, fallo) para registros armados a mano | `attempt.js`: `_suelta()` |
| Exigencia de la subida por errores | 3 por mm de altura perdida desde la perfecta; recepción desde el borde de la perfecta | **PERFECTO y BIEN piden el mismo empuje**: la altura perdida cuesta desde 80 mm (el borde de BIEN) a 4 por mm, y la recepción desde el borde de BIEN. TEMPRANO y TARDE sí cuestan | `attempt.js`: `_recibe()` · `FACIL.perdidaLibre`, `porMm` |
| Subida sin tocar | Según esfuerzo propio y exigencia | **Sube sola en los pesos livianos**, más lenta que tocando: si esfuerzo propio + `asist` supera la exigencia, avanza a lo que daría esa diferencia, con tope `solaMax` (0,3 por segundo). `asist` vale 250 hasta el 92 % y baja hasta 30 en el 96 % (`asistHasta`): desde ahí hay que tocar. Sin un toque en los últimos 400 ms el avance no pasa de esa velocidad; tocar solo suma si empuja más rápido. Reemplaza al piso de exigencia (`minEmpuje`, que obligaba a tocar unos 3 por segundo) | `_pelea()`, `_paso()` |
| Fin de la subida perdida | Hundido 0,4 s en el fondo, o 12 s | **Se corta sola**: pasados 1,5 s, el avance tiene que ir por delante de un piso que sube 25 % por segundo; si lo alcanza, fallo. Tope de 5,5 s (la traba, 6 s) | `_paso()` · `FACIL.plazoMs`, `ritmo`, `maxMs` |
| Temblor por empujar de más y zona de estancamiento | Sí | No | `_paso()` |
| Barra sin altura, adelante o atrás | Según altura y desvío | Solo con TEMPRANO o TARDE: un toque en PERFECTO o BIEN no pierde la barra en el vuelo. Con holgura (pesos de apertura), 40 mm más de margen de altura y de desvío (`vueloMm`), que se van a 0 en el 100 % | `_explota()` |
| Traba de codos (cuánto tardan en trabar) | Desde el toque de recepción | Desde que llega la barra: con un toque temprano, el vuelo que falta no cuenta como codo blando | `_paso()` |
| Flexión del envión | Dura lo que la animación (0,36 a 0,42 s) | 0,6 s como mínimo (`FACIL.cierreMs`): el círculo de ¡ARRIBA! se llega a ver | `_aprieta()`; `sequence.js` reparte la flexión en ese tiempo |
| Tensión | Perfecta, buena o floja según el anillo | Siempre buena (0 mm): el toque 1 es libre | `attempt.js`: `_aprieta()` |
| Fijación, chicharra, pelea, jueces, Resto | — | Sin cambios: lo resuelve la capa | — |

Todo detrás de `c.ctl === 'f'`. No cambian `VERSION`, `sim.json`, `ai.js` ni `tools/sim_ref.json`: `tools/sim_test.mjs` pasa las referencias de Clásico sin `--update`. `tools/sim_ref_facil.json` se regeneró cuando cambiaron las reglas de la subida (11-nov) y con la entrada tolerante (12-nov, tarde: cambian dos de las nueve partidas de referencia).

**Reloj del llamado.** En Clásico corre desde que aparece el panel (30 s, o 45 si el pesista sale dos veces seguidas) y si llega a cero con el panel abierto es nulo. **En Fácil el panel no gasta reloj**: arranca cuando el jugador confirma (el registro guarda `conf: 0` y los cambios de kilos van con instante 0), el panel lo dice («Sin apuro: el reloj (0:30) arranca cuando confirmás. ENTER confirma; después, ESPACIO en ¡TIRÁ!») y en los últimos 10 s la señal cuenta («¡Quedan 7 s! Apretá ESPACIO»). Es una regla de presentación (`llamadoPropio()` en `main.js`): el núcleo recibe un instante de confirmación como siempre.

**Registro.** La cabecera suma `"ctl": "f"`. `Partida` lo recibe en `cfg.ctl`, lo guarda en `reg.ctl` y `contexto()` lo pasa **solo a la persona**: `ctl: persona ? cfg.ctl : 'c'`. `replay.js` acepta `'f'`, `'c'` o ausente (clásico) y rechaza cualquier otro valor. `ent` sigue siendo la lista de apretar y soltar que recibió el núcleo, o sea la salida de la capa, incluido el evento automático de la bajada: el formato del llamado no cambia y `validarLlamado()` tampoco.

## 5. Señal y devolución

- **Señal** (`ui/senal.js`, elemento `#senal` dentro de `#tv`): verbo grande, aro fijo con un círculo que se cierra sobre él, la tecla dibujada (`ESPACIO`; en teléfono, `TOCÁ`) y el paso («2 de 3»). En horizontal va a la derecha del pesista, a media altura; en vertical, centrada al pie del escenario, nunca sobre la zona táctil. No se mueve con la barra.
- El círculo empieza con el toque anterior, se cierra **a ritmo parejo** (la misma velocidad antes y después del objetivo), llega al aro en el instante objetivo, se pone dorado dentro de la ventana perfecta y sigue achicándose hasta el límite. Mientras la ventana de la señal no abrió va gris y apagado (un toque ahí no cuenta). Sobre el aro, la **franja dorada** marca BIEN y una más clara, PERFECTO, en la misma escala que el círculo: el toque sale bien mientras su borde la cruza. Arriba de la tecla, una **cuenta 3-2-1** en tercios parejos del cierre. En los pasos libres (1 y 4) no hay círculo: late la tecla.
- **Palabra** después de cada toque, en el mismo lugar y con el verbo del toque que califica («¡EXPLOTÁ! PERFECTO»), para que no se lea como nota de la señal siguiente: PERFECTO y BIEN en blanco; TEMPRANO y TARDE en ámbar, porque el levantamiento sigue. El rojo queda para el fallo.
- **Línea de fallo** (`ui/mensajes.js`, `explicar(res, ctl)`, pura): debajo de «Intento fallado» o «Levantamiento nulo», en vez de la causa sola.

| Causa del núcleo | Texto en Fácil |
|---|---|
| `sin_altura`, sin toque | «No tocaste ¡EXPLOTÁ! Tocá ESPACIO cuando el círculo se cierra.» Si hubo un toque cuando ya era tarde: «Tocaste ¡EXPLOTÁ! tarde: el tiempo ya se había acabado. Tocá ESPACIO cuando el círculo se cierra, no después.» |
| `sin_altura`, con toque | «Tocaste ¡EXPLOTÁ! 300 ms tarde y la barra no subió. Tocá ESPACIO cuando el círculo se cierra.» |
| `anticipado` (tercer amague) | «Tocaste ¡EXPLOTÁ! antes de tiempo tres veces. Esperá a que el círculo se cierre sobre el aro.» |
| `adelante` | «Tocaste ¡EXPLOTÁ! 250 ms temprano y la barra se fue adelante. Esperá a que el círculo se cierre.» |
| `atras` | «Tocaste ¡EXPLOTÁ! 280 ms tarde y la barra se fue atrás. Tocá ESPACIO apenas se cierra el círculo.» |
| `fondo`, temprano | «Tocaste RECIBÍ antes de tiempo. Un toque por señal: esperá el círculo.» |
| `fondo`, tarde | «No recibiste la barra. Tocá ESPACIO cuando el círculo se cierra.» Si hubo un toque cuando ya era tarde: «Tocaste ¡RECIBÍ! tarde: la barra ya se había caído. Tocá ESPACIO cuando el círculo llega al aro, no después.» |
| `aplastado` o `codos`, menos de 3 toques en la subida | «La subida se trabó y no empujaste. Con ¡EMPUJÁ!, tocá ESPACIO rápido.» |
| `aplastado` o `codos`, con algún toque en TEMPRANO o TARDE | «Tocaste ¡EXPLOTÁ! 260 ms tarde y la barra quedó más pesada: no alcanzó el empuje. Tocá ESPACIO cuando el círculo se cierra.» (nombra el peor toque) |
| `aplastado` o `codos`, con todo en PERFECTO o BIEN | «Los toques venían bien: faltó empuje. En ¡EMPUJÁ!, tocá ESPACIO más rápido; si no alcanza, pedí menos kilos.» (en el tutorial, sin la última frase) |
| `codos_blandos` | «Tocaste ¡RECIBÍ! 180 ms tarde y los codos quedaron blandos. Tocá un poco antes: justo cuando el círculo llega al aro.» (o «temprano» y «un poco después») |
| `temblor`, `tiembla` | «Tocaste ¡EXPLOTÁ! 200 ms temprano: la barra llegó desviada y tembló. Tocá un poco después, justo en el cierre.» |
| `devuelve` | «Pasaron 8 segundos con la barra en los hombros. Apretá ESPACIO para flexionar.» |
| `reloj` | «Se acabó el reloj: corre desde que confirmás. Apretá ESPACIO apenas dice ¡TIRÁ!» En Clásico, si venció con el panel abierto: «Se acabó el reloj. Confirmá con ENTER y apretá ESPACIO antes del 0:00.» |

En Clásico, los mismos textos con el gesto que corresponde («soltá cuando la barra llega a la línea», «apretá al recibir»), más `anticipado`: «Soltaste antes de tiempo. Soltá cuando el círculo se cierra.», `antes`: «Soltaste antes de la chicharra. Dejá apretado hasta ¡ABAJO!» y `sin_apoyo`: «No dejaste apretado al quedar de pie. Mantené ESPACIO hasta ¡ABAJO!».

## 6. Tutorial

**Uno solo y corto** (12-nov; antes eran un panel, el guiado y dos prácticas: tres levantamientos antes de jugar). Corre la primera vez que se aprieta «Empezar» en Fácil; `tarima.tutorial` se guarda **al salir del inicio**, se haga o se saltee, así que recargar la página no lo repite. Después el inicio ofrece «Repetir tutorial». En Clásico quedan el metrónomo y las tres prácticas.

1. **Un arranque guiado, en cámara lenta y sin fallo posible**, sin panel previo (los tres pasos ya están en el inicio). Arriba, la etiqueta «Tutorial · el juego espera cada toque» y el botón «Saltear tutorial ESC» (Esc o toque). El reloj del intento lo lleva la presentación: avanza a la mitad de la velocidad y se detiene en cada objetivo hasta que llega el toque, que se registra en el instante exacto del objetivo (sale PERFECTO). Un toque con el reloj andando se descarta con «Todavía no». Va al 80 %, sin reloj, con exigencia guionada (`exiFija` del 93 %) para que la subida pida toques, fuera del registro. Paradas y textos:
   - «1 de 3 · ¡TIRÁ! Apretá ESPACIO para empezar el levantamiento.»
   - «2 de 3 · ¡EXPLOTÁ! El círculo se cerró: tocá ESPACIO ahora.»
   - «3 de 3 · ¡RECIBÍ! Otra vez: círculo cerrado, tocá ESPACIO.»
   - «¡EMPUJÁ! La subida se trabó. Tocá ESPACIO rápido hasta quedar de pie.» Acá el reloj solo avanza 250 ms después de cada toque (`GUIADO.porToque`): para el núcleo, hasta el jugador más lento empuja a 4 toques por segundo, que le alcanza a los tres pesistas (`tools/sim_test.mjs` lo verifica con toques de 100 ms a 3 s).
   - «AGUANTÁ. No toques nada: espera la chicharra y baja solo.» Sin parada.
   - Cierre: «Levantamiento válido · Así se hace. Ahora, la final». Si igual fallara, no se repite: sigue a la final.
2. **El dos tiempos se explica la primera vez que toca**, en la final y sobre la marcha (`tarima.dostiempos` vacío): el panel de ese llamado agrega «Dos tiempos: empieza igual que el arranque. Con la barra en los hombros el juego te espera: son tres toques más, ¡FLEXIONÁ!, ¡ARRIBA! y ¡RECIBÍ!», y en ese intento el reloj se detiene una vez, en los hombros (`EN_HOMBROS`), con la leyenda «4 de 6 · ¡FLEXIONÁ! Apretá ESPACIO. Enseguida ¡ARRIBA! cuando el círculo se cierra, y ¡RECIBÍ!». El resto del intento va a velocidad real y vale para la final (el registro guarda los instantes del reloj del intento, como siempre). La marca se guarda cuando el intento llegó a los hombros.

Medido en el pod con un jugador que toca 450 ms después de cada parada: 14 a 15 s de «Empezar» a la presentación (8 a 9 s de levantamiento). `tools/check_fluidez.mjs --tutorial` falla si pasa de un minuto, si hay más de un levantamiento antes de jugar o si vuelve a aparecer al recargar.

## 7. Pantalla de inicio

En lugar de la oración de hoy, tres pasos con la tecla dibujada y, debajo, el selector de controles:

- `1` `[ESPACIO]` «Apretá para empezar el levantamiento.»
- `2` `[ESPACIO]` «Tocá cuando el círculo se cierra: ¡EXPLOTÁ!, ¡RECIBÍ!»
- `3` `[ESPACIO] [ESPACIO] [ESPACIO]` «Si dice ¡EMPUJÁ!, tocá rápido.»
- Línea chica: «Menús: flechas y ENTER · H ayuda · ESC pausa». En teléfono, `[TOCÁ]` en vez de la tecla y sin esa línea.

## 8. Archivos y pruebas

| Archivo | Cambio |
|---|---|
| `web/js/sim/rules.js`, `attempt.js`, `match.js`, `replay.js` | Sección 4 |
| `web/js/game/controles.js` (nuevo) | `traducir`, `automaticos`, `abre` (desde cuándo vale el toque de la señal) y sus constantes (60 ms de rebote, 150 ms de bajada) |
| `web/js/game/input.js` | El mouse deja de ser contacto; teclado y táctil entregan toques con su instante; navegación de paneles, Esc, H |
| `web/js/game/main.js` | `correrIntento` pasa por la capa; reloj guiado del tutorial; inicio; selector de nivel; pausa; foco al abrir y al repintar un panel (hoy `capa.poner` hace `blur` y `bloquear` deshabilita los botones: el bloqueo de 400 ms pasa a ignorar la activación sin deshabilitar) |
| `web/js/game/sequence.js` | `m.tConf === undefined` |
| `web/js/game/ui/senal.js`, `ui/mensajes.js` (nuevos), `ui/ayudas.js` | Señal fija, líneas de fallo; en Fácil el medidor pasa a barra de avance |
| `web/juego.html`, `web/css/juego.css` | `#senal`, tecla dibujada, pausa, foco visible |
| `docs/JUEGO.md` 3.1 y `HANDOFF.md` | Remiten a este documento |

| Prueba | Qué verifica |
|---|---|
| `tools/play_human.mjs` (nuevo, sin navegador) | El criterio de la sección 9: 2000 intentos por casilla, por envión, sale con error si no se cumple. Desde el 12-nov, tarde: machacador, casual, flojo, distraído y no toca en aperturas, y machacador y casual al 100 % (antes, «a ciegas» era el peor de catorce maneras de tocar sin mirar y tenía que quedar debajo del 10 %). Además: con todos los toques en el borde de BIEN y uno cada 250 ms en ¡EMPUJÁ! se levanta siempre hasta el 100 %, y ninguna subida fallada pasa del tope. Cada intento se recalcula con `simular` y tiene que dar lo mismo |
| `tools/sim_test.mjs` | Referencias de hoy sin tocar; referencias nuevas en Fácil con un jugador que pasa por la capa (`tools/sim_ref_facil.json`); en vivo contra recalculado y avance en pasos irregulares con `ctl: 'f'`; `ctl` desconocido rechazado y registro sin `ctl` igual a clásico; `explicar()` devuelve texto para toda causa y no contradice a las palabras; los toques antes de la ventana no llegan al núcleo ni gastan la señal, vale el primero de adentro y los toques entre la recepción y el arranque de la subida cuentan (12-nov, tarde; antes: el tercer amague es fallo); sin empujar, la subida sube sola en los pesos de apertura (más lenta que tocando) y cerca del techo se corta entre 1,5 y 2,7 s; el arranque guiado sale válido con los tres pesistas tocando ¡EMPUJÁ! cada 100 ms a 3 s |
| `tools/check_game.mjs` | `launchOptions()` de `tools/browser.mjs`. Partida por teclado en Fácil con toques cortos y menús sin mouse (Tab, flechas, Enter); otra en Clásico; táctil en Fácil. Un clic en el escenario durante el intento no agrega entradas. Todo panel abre con foco en un botón. `JUEGO.estado()` expone la señal (verbo, paso, objetivo) y la prueba toca según ella. La barra sube también en el tutorial. Corrida «lento»: arranque guiado con Brenner y un toque cada 600 ms, válido a la primera; 40 s con el panel del llamado abierto no gastan reloj; sin tocar después de confirmar, la señal cuenta y sale el nulo por reloj con su línea |
| `tools/check_fluidez.mjs` (12-nov) | En tiempo real y con teclado real: juega la final con Brenner hasta el primer dos tiempos, sin estrangular y con el procesador a 1/4 y 1/6. Falla si en algún intento se dibuja menos del 95 % de los cuadros que ofrece el navegador, si un toque que llegó a la página no figura en `JUEGO.toques`, si un descarte no tiene motivo o acuse, o si la calidad cambia con un intento en curso. `--tutorial`: el tutorial es uno, dura menos de un minuto, se saltea con Esc y no vuelve al recargar. `--gobernador`: con un costo artificial por megapíxel (`?lastre=`), la calibración baja la calidad antes del primer intento y el gobernador solo la toca entre intentos. `--capturas=DIR`: una captura por señal, toque y panel |
| `tools/primera.mjs` | **Quedó atrás del tutorial nuevo (ver la nota al principio del archivo).** Capturas de jugador nuevo en Fácil: inicio, cada parada del tutorial, cada señal a velocidad real y una línea de fallo, en `out/primera/`. En escritorio sigue en la final: panel del llamado 33 s abierto, nulo por reloj, una subida perdida por tocar lento y el primer dos tiempos. Anota cuánto tarda cada círculo |

## 9. Medido y riesgos

**Entrada tolerante (12-nov, tarde).** `node tools/play_human.mjs --info`, sin navegador, sobre el código final. 2000 intentos por casilla, los tres pesistas; columnas: arranque y dos tiempos con cada envión (tijera, power, squat; el que no domina el envión carga su castigo). Los bots que miran tocan a `objetivo + atraso + error` con error de campana, y si un toque cae antes de que abra la ventana («TODAVÍA NO») vuelven a decidir cuándo tocar. El machacador no mira: toca cada 125 a 167 ms desde que confirma hasta que termina el intento.

| Bot (aperturas, 88 a 92 %) | Arranque | Tijera | Power | Squat | Meta |
|---|---|---|---|---|---|
| Machacador (6 a 8 toques por segundo, sin mirar) | 96,7 % | 99,8 % | 97,5 % | 98,1 % | 80 % o más |
| Casual (desvío 80 ms, atraso 40) | 100,0 % | 100,0 % | 100,0 % | 100,0 % | 95 % o más |
| Flojo (desvío 160 ms) | 94,0 % | 91,5 % | 91,5 % | 91,1 % | 80 % o más |
| Distraído (un toque por señal, 250 ± 30 ms tarde; en ¡EMPUJÁ! un solo toque) | 89,2 % | 94,3 % | 94,3 % | 83,0 % | 70 % o más |
| No toca | 0 % | 0 % | 0 % | 0 % | 0 % |
| Casual que toca 3 veces por segundo en ¡EMPUJÁ! | 100,0 % | 100,0 % | 100,0 % | 100,0 % | 95 % o más |

| Bot (100 % del techo) | Arranque | Tijera | Power | Squat | Meta |
|---|---|---|---|---|---|
| Machacador | 2,0 % | 0,0 % | 0,0 % | 0,0 % | 25 % o menos |
| Casual | 64,3 % | 52,3 % | 41,5 % | 53,4 % | 35 a 70 % |

Además (criterio): con todos los toques en el borde de BIEN y uno cada 250 ms en ¡EMPUJÁ! se levanta siempre del 88 al 100 % (360 de 360), y ninguna subida fallada pasa del tope de 6 s.

Fuera del criterio (mismas columnas):

| Qué | Arranque | Tijera | Power | Squat |
|---|---|---|---|---|
| Machacador al 95 · 97 · 103 % | 68,7 · 51,3 · 0 % | 94,5 · 28,3 · 0 % | 36,5 · 1,1 · 0 % | 55,1 · 10,6 · 0 % |
| Casual al 95 · 97 · 103 % | 99,7 · 96,0 · 40,5 % | 99,8 · 95,5 · 27,1 % | 98,5 · 83,9 · 24,8 % | 99,7 · 94,2 · 29,9 % |
| Flojo al 95 · 97 · 103 % | 77,8 · 56,1 · 10,3 % | 72,7 · 44,5 · 1,8 % | 60,8 · 31,4 · 1,5 % | 62,0 · 36,5 · 1,1 % |
| Distraído al 95, 97 y 103 % | 0 % | 0 % | 0 % | 0 % |
| Distraído que en ¡EMPUJÁ! toca 3 por segundo (aperturas) | 91,5 % | 95,0 % | 95,0 % | 86,0 % |
| Casual sin tocar en ¡EMPUJÁ!: aperturas · 95 % | 100 · 23,8 % | 100 · 25,9 % | 100 · 25,1 % | 100 · 17,5 % |
| Casual con un toque cada 250, 400 y 500 ms en ¡EMPUJÁ! | 100 % | 100 % | 100 % | 100 % |
| Casual y flojo que siguen tocando 0,3 a 2,5 s después de ¡EMPUJÁ! | 100 y 94 % | 99,5 a 100 y 91,6 a 95,8 % | 99,5 a 100 y 91,5 a 95,7 % | 99,1 a 100 y 91,0 a 93,8 % |
| A ciegas: Poisson de 250, 400 y 800 ms | 82,5 · 59,8 · 28,5 % | 73,5 · 41,3 · 8,6 % | 73,2 · 40,9 · 8,7 % | 69,2 · 38,5 · 7,8 % |
| A ciegas: metrónomo de 500 ms · de 1000 ms | 100 · 100 % | 100 · 0 % | 100 · 0 % | 100 · 0,2 % |
| Casual y flojo en Clásico, envión de la casa (sin cambios) | 22,6 y 26,4 % | 14,8 y 11,9 % (dos tiempos) | | |

**La subida.** Mediana de la subida ganada en aperturas: 1,3 a 1,4 s tocando (casual, machacador, 3 por segundo); 2,3 a 2,7 s sin tocar (sube sola); 2,5 a 3,1 s el distraído con un solo toque. Subidas falladas del casual y del flojo entre el 88 y el 103 %: mediana 1,6 s, percentil 90 2,5 s, máxima 5,5 s; 4 % venían con todas las palabras en PERFECTO o BIEN (en las aperturas, ninguna de 22).

Riesgos:

1. **Tocar a ciegas ahora levanta las aperturas, y era a propósito**: el pedido fue que machacar no castigue de entrada. Lo que separa al que mira del que machaca aparece del 95 % para arriba (machacador 37 a 95 % al 95 %, 1 a 51 % al 97 %, 0 a 2 % al 100 %; casual 98 a 100 %, 84 a 96 % y 42 a 64 %). El criterio viejo («a ciegas menos de 10 %») se quitó.
2. **El distraído con un solo toque en ¡EMPUJÁ! cae a 0 % ya en el 95 %**: la subida sola se apaga entre el 92 y el 96 %, y sus toques en TARDE suben la exigencia. Si toca 3 por segundo en ¡EMPUJÁ!, levanta 86 a 95 % en aperturas.
3. **Rivales.** Juegan siempre con las reglas de Clásico: `ctl` no entra en su contexto, así que sus resultados y `sim_ref.json` no cambian. La final contra rivales con las reglas nuevas no se midió.
4. **Registro.** Suma un campo opcional y no sube la versión, porque `VERSION` está atada a `sim.json` (`data.js`). Un núcleo viejo leería una partida Fácil como Clásico; hoy no hay registros guardados. Con servidor (etapa 5): subir versión con la temporada y separar la tabla por `ctl`.
5. **El registro guarda la salida de la capa, no las teclas.** Recalcula exacto, pero no prueba que la capa se usó (los toques TODAVÍA NO no quedan en el registro). Es el mismo límite de la sección 9.6 de `JUEGO.md`.
6. **Dibujo sin verificar con errores grandes.** Con la ventana tarde de 330 ms y más el tirón arrastrado avanza más allá de `Segundo tirón`. La flexión del envión en Fácil dura 0,6 s en vez de 0,36 a 0,42 s.
7. **Nada de esto se probó con personas, y la señal nueva no se vio en una placa**: la franja, el círculo gris y la cuenta solo pasaron por las capturas por software de Actions. Los bots son un modelo; el error humano no es una campana.

### Antes de la entrada tolerante (11-nov, para comparar)

Con amagues (dos por movimiento), piso de exigencia y ventanas al doble a todo peso: casual 100 y 100 %, flojo 87,6 y 91,2 %, a ciegas (peor de catorce) 3,6 y 3,8 %; casual al 100 % 95,3 y 93,9 %. El machacador no se medía (era una de las catorce maneras de tocar a ciegas, por debajo del 4 %).
