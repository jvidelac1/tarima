# Controles: Fácil y Clásico

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
| PREPARATE, los 450 ms de RESPIRÁ, antes de que arranque ¡EMPUJÁ!, tutorial con el reloj andando | `espera` (ESPERÁ) | Todavía no hay nada que tocar. En PREPARATE y en el tutorial la señal dice además «TODAVÍA NO» |
| Menos de 60 ms después del toque anterior (`CAPA.reboteMs`) | `rebote` (REBOTE) | Rebote de tecla: sin esto, un doble contacto gastaría el toque siguiente |
| ¡EMPUJÁ! cuando ya alcanza, AGUANTÁ, ¡ABAJO!, ¡RECIBÍ! ya tocado | `sobra` (SOBRA) | No hace falta; en la subida evita gastar Resto |
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

| Paso | Señal | El círculo se cierra | El toque |
|---|---|---|---|
| — | PREPARATE | No hay círculo (1,2 s) | No se toca |
| 1 de 3 | **¡TIRÁ!** · «Apretá ESPACIO para empezar el levantamiento» | No hay círculo: cuando quieras, con el reloj corriendo | Arranca el tirón |
| 2 de 3 | **¡EXPLOTÁ!** | 0,72 a 0,88 s después del toque 1 (más tarde con más kilos) | Explosión |
| 3 de 3 | **¡RECIBÍ!** | 0,63 a 0,75 s después del toque 2 | Recepción |
| — | **¡EMPUJÁ!** · «tocá rápido: que no te alcance el rojo» | Barra de avance en lugar del círculo; un piso rojo la persigue | Cada toque empuja, hasta quedar de pie. Aparece siempre y pide unos 3 toques por segundo; dura 1,5 a 3 s |
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
| `tiron` | `[t,0]` | Dentro del límite: explosión. Antes: amague |
| `vuelo`, `empuje` | `[t,1]` (queda apoyado hasta la bajada) | Dentro del límite: recepción. Antes del límite temprano: fallo, «la pierde en el fondo» (regla de hoy) |
| `pelea`, `traba` | `[t,1],[t,0]` sobre el contacto apoyado, solo si el toque sirve | Un toque de pelea |
| `hombros` | `[t,0],[t,1]` | Levanta el contacto de la cargada (sin efecto) y empieza la flexión |
| `flexion` | `[t,0]` | Envión; antes del límite, amague |
| `llamado`, `acomodo`, `post`, `fijacion` | Nada | — |

- **Pelea y traba de codos.** El toque sirve si `P < 1 y aguja < exigencia + 200` o si `no trabado y E < exigencia de traba + 150`. Los que sobran no llegan al núcleo y no gastan Resto. En Fácil el núcleo no hace temblar por empujar de más (sección 4), así que el margen es ancho y «tocá rápido» es verdad sin letra chica.
- **Fijación automática.** El contacto de la recepción sigue apoyado, así que el núcleo ve apoyo firme a los 300 ms de quedar de pie. `automaticos(m)` corre en cada cuadro y agrega `[tb + 150, 0]` cuando pasó la chicharra: instante fijo, no depende del cuadro. «Suelta antes» y «no fija» no pueden ocurrir.
- **Amague.** Toque 2 antes de la rodilla o antes del límite, y toque 5 antes del límite: el pesista devuelve la barra y la señal vuelve al paso 1 (o al 4). Sin costo; el reloj sigue. **Dos por movimiento; el tercer toque anticipado es fallo** («Tocaste ¡EXPLOTÁ! antes de tiempo tres veces…»). Cartel: «AMAGUE · muy temprano · esperá el círculo» y, en el segundo, «otro más y es fallo». Con la rodilla a 165 a 235 ms del objetivo, la parte más temprana de la ventana de BIEN del tirón es amague y no BIEN.
- **Toque fuera de turno.** A menos de 60 ms del toque anterior aceptado: se descarta (rebote de tecla). En `acomodo`, en los 450 ms de RESPIRÁ, después de un amague mientras la barra baja, en `post` y en `fijacion`: se descarta sin castigo (en `acomodo` y después de un amague sale «TODAVÍA NO»; en RESPIRÁ no se dice nada, porque suele ser la cola de ¡EMPUJÁ!). En el vuelo antes de tiempo: fallo. Con el tope de amagues y el ritmo que pide la subida, es lo que deja a cualquier manera de tocar a ciegas por debajo del 4 % (sección 9).
- **Soltar la tecla** y la repetición automática no generan nada.

## 4. Núcleo: qué cambia en Fácil

El contexto del intento lleva `ctl: 'f' | 'c'`. Sin el campo vale `'c'` y todo da exactamente lo de hoy.

| Parámetro | Clásico | Fácil | Dónde |
|---|---|---|---|
| Ventanas (perfecta, buena y límite) | Tabla de hoy | × `FACIL.ancho` = 2: al 90 %, ±104, ±228 y ±388 ms (al 80 %: ±140, ±308, ±468; al 100 %: ±70, ±154, ±314). Se aplica al final, después de técnica, temple, piso y primera partida | `rules.js`: `ventanas()` acepta `o.ancho` y devuelve `k` |
| Desvío por error de explosión | 0,6 y 0,4 mm por ms fuera de la perfecta | El exceso se divide por `k`: la misma curva, estirada | `rules.js`: `desvioExplosion()` |
| Tirón anticipado (entre la rodilla y el límite) | Fallo | Amague; el tercero del movimiento es fallo (`FACIL.amagues` = 2) | `attempt.js`: `_suelta()` |
| Exigencia de la subida por errores | 3 por mm de altura perdida desde la perfecta; recepción desde el borde de la perfecta | **PERFECTO y BIEN piden el mismo empuje**: la altura perdida cuesta desde 80 mm (el borde de BIEN) a 4 por mm, y la recepción desde el borde de BIEN. TEMPRANO y TARDE sí cuestan | `attempt.js`: `_recibe()` · `FACIL.perdidaLibre`, `porMm` |
| Piso de exigencia | No hay | Esfuerzo propio + 175 (`FACIL.minEmpuje`): la subida siempre pide toques, unos 3 por segundo | `_recibe()` |
| Fin de la subida perdida | Hundido 0,4 s en el fondo, o 12 s | **Se corta sola**: pasados 1,5 s, el avance tiene que ir por delante de un piso que sube 25 % por segundo; si lo alcanza, fallo. Tope de 5,5 s (la traba, 6 s) | `_paso()` · `FACIL.plazoMs`, `ritmo`, `maxMs` |
| Temblor por empujar de más y zona de estancamiento | Sí | No | `_paso()` |
| Barra sin altura, adelante o atrás | Según altura y desvío | Solo con TEMPRANO o TARDE: un toque en PERFECTO o BIEN no pierde la barra en el vuelo | `_explota()` |
| Flexión del envión | Dura lo que la animación (0,36 a 0,42 s) | 0,6 s como mínimo (`FACIL.cierreMs`): el círculo de ¡ARRIBA! se llega a ver | `_aprieta()`; `sequence.js` reparte la flexión en ese tiempo |
| Tensión | Perfecta, buena o floja según el anillo | Siempre buena (0 mm): el toque 1 es libre | `attempt.js`: `_aprieta()` |
| Fijación, chicharra, pelea, jueces, Resto | — | Sin cambios: lo resuelve la capa | — |

Todo detrás de `c.ctl === 'f'`. No cambian `VERSION`, `sim.json`, `ai.js` ni `tools/sim_ref.json`: `tools/sim_test.mjs` pasa las referencias de Clásico sin `--update`. `tools/sim_ref_facil.json` se regeneró cuando cambiaron las reglas de la subida.

**Reloj del llamado.** En Clásico corre desde que aparece el panel (30 s, o 45 si el pesista sale dos veces seguidas) y si llega a cero con el panel abierto es nulo. **En Fácil el panel no gasta reloj**: arranca cuando el jugador confirma (el registro guarda `conf: 0` y los cambios de kilos van con instante 0), el panel lo dice («Sin apuro: el reloj (0:30) arranca cuando confirmás. ENTER confirma; después, ESPACIO en ¡TIRÁ!») y en los últimos 10 s la señal cuenta («¡Quedan 7 s! Apretá ESPACIO»). Es una regla de presentación (`llamadoPropio()` en `main.js`): el núcleo recibe un instante de confirmación como siempre.

**Registro.** La cabecera suma `"ctl": "f"`. `Partida` lo recibe en `cfg.ctl`, lo guarda en `reg.ctl` y `contexto()` lo pasa **solo a la persona**: `ctl: persona ? cfg.ctl : 'c'`. `replay.js` acepta `'f'`, `'c'` o ausente (clásico) y rechaza cualquier otro valor. `ent` sigue siendo la lista de apretar y soltar que recibió el núcleo, o sea la salida de la capa, incluido el evento automático de la bajada: el formato del llamado no cambia y `validarLlamado()` tampoco.

## 5. Señal y devolución

- **Señal** (`ui/senal.js`, elemento `#senal` dentro de `#tv`): verbo grande, aro fijo con un círculo que se cierra sobre él, la tecla dibujada (`ESPACIO`; en teléfono, `TOCÁ`) y el paso («2 de 3»). En horizontal va a la derecha del pesista, a media altura; en vertical, centrada al pie del escenario, nunca sobre la zona táctil. No se mueve con la barra.
- El círculo empieza con el toque anterior, llega al aro en el instante objetivo, se pone dorado dentro de la ventana perfecta y sigue achicándose hasta el límite. En los pasos libres (1 y 4) no hay círculo: late la tecla.
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
| `web/js/game/controles.js` (nuevo) | `traducir`, `automaticos` y sus constantes (60 ms de rebote, 150 ms de bajada, márgenes 50 y 150) |
| `web/js/game/input.js` | El mouse deja de ser contacto; teclado y táctil entregan toques con su instante; navegación de paneles, Esc, H |
| `web/js/game/main.js` | `correrIntento` pasa por la capa; reloj guiado del tutorial; inicio; selector de nivel; pausa; foco al abrir y al repintar un panel (hoy `capa.poner` hace `blur` y `bloquear` deshabilita los botones: el bloqueo de 400 ms pasa a ignorar la activación sin deshabilitar) |
| `web/js/game/sequence.js` | `m.tConf === undefined` |
| `web/js/game/ui/senal.js`, `ui/mensajes.js` (nuevos), `ui/ayudas.js` | Señal fija, líneas de fallo; en Fácil el medidor pasa a barra de avance |
| `web/juego.html`, `web/css/juego.css` | `#senal`, tecla dibujada, pausa, foco visible |
| `docs/JUEGO.md` 3.1 y `HANDOFF.md` | Remiten a este documento |

| Prueba | Qué verifica |
|---|---|
| `tools/play_human.mjs` (nuevo, sin navegador) | El criterio de la sección 9: 2000 intentos por casilla, sale con error si no se cumple. «A ciegas» es el peor de catorce maneras de tocar sin mirar. Además: con todos los toques en el borde de BIEN y uno cada 250 ms en ¡EMPUJÁ! se levanta siempre hasta el 100 %, y ninguna subida fallada pasa del tope. Cada intento se recalcula con `simular` y tiene que dar lo mismo |
| `tools/sim_test.mjs` | Referencias de hoy sin tocar; referencias nuevas en Fácil con un jugador que pasa por la capa (`tools/sim_ref_facil.json`); en vivo contra recalculado y avance en pasos irregulares con `ctl: 'f'`; `ctl` desconocido rechazado y registro sin `ctl` igual a clásico; `explicar()` devuelve texto para toda causa y no contradice a las palabras; el tercer amague es fallo; sin empujar la subida se corta entre 1,5 y 2,7 s; el arranque guiado sale válido con los tres pesistas tocando ¡EMPUJÁ! cada 100 ms a 3 s |
| `tools/check_game.mjs` | `launchOptions()` de `tools/browser.mjs`. Partida por teclado en Fácil con toques cortos y menús sin mouse (Tab, flechas, Enter); otra en Clásico; táctil en Fácil. Un clic en el escenario durante el intento no agrega entradas. Todo panel abre con foco en un botón. `JUEGO.estado()` expone la señal (verbo, paso, objetivo) y la prueba toca según ella. La barra sube también en el tutorial. Corrida «lento»: arranque guiado con Brenner y un toque cada 600 ms, válido a la primera; 40 s con el panel del llamado abierto no gastan reloj; sin tocar después de confirmar, la señal cuenta y sale el nulo por reloj con su línea |
| `tools/check_fluidez.mjs` (12-nov) | En tiempo real y con teclado real: juega la final con Brenner hasta el primer dos tiempos, sin estrangular y con el procesador a 1/4 y 1/6. Falla si en algún intento se dibuja menos del 95 % de los cuadros que ofrece el navegador, si un toque que llegó a la página no figura en `JUEGO.toques`, si un descarte no tiene motivo o acuse, o si la calidad cambia con un intento en curso. `--tutorial`: el tutorial es uno, dura menos de un minuto, se saltea con Esc y no vuelve al recargar. `--gobernador`: con un costo artificial por megapíxel (`?lastre=`), la calibración baja la calidad antes del primer intento y el gobernador solo la toca entre intentos. `--capturas=DIR`: una captura por señal, toque y panel |
| `tools/primera.mjs` | **Quedó atrás del tutorial nuevo (ver la nota al principio del archivo).** Capturas de jugador nuevo en Fácil: inicio, cada parada del tutorial, cada señal a velocidad real y una línea de fallo, en `out/primera/`. En escritorio sigue en la final: panel del llamado 33 s abierto, nulo por reloj, una subida perdida por tocar lento y el primer dos tiempos. Anota cuánto tarda cada círculo |

## 9. Medido y riesgos

`node tools/play_human.mjs --info`, sin navegador, sobre el código final. Aperturas al 88 a 92 %, los tres pesistas, 2000 intentos por casilla, envión de tijera. Los bots tocan a `objetivo + atraso + error`, con error de campana; en los pasos libres reaccionan en 0,35 a 0,8 s; en ¡EMPUJÁ! empiezan a los 300 ms (flojo: 450) y tocan cada 180 ± 35 ms (flojo: 230 ± 60).

| Bot | Arranque | Dos tiempos | Meta |
|---|---|---|---|
| Casual en Fácil (desvío 80 ms, atraso 40) | 100,0 % | 100,0 % | 85 % o más |
| Flojo en Fácil (desvío 160 ms, atraso 40) | 87,6 % | 91,2 % (82,8 % con el envión de la casa) | 50 % o más |
| A ciegas en Fácil: el peor de catorce (Poisson con cinco ritmos, uniforme 150–900, 300–900 y 600–900 ms, metrónomos de 500, 700, 750 y 1000 ms, campana 750 ± 80 ms, machacar cada 120–200 ms) | 3,6 % (Poisson de 400 ms) | 3,8 % (uniforme 150–900 ms) | Menos de 10 % |
| Todos los toques en el borde de BIEN y uno cada 250 ms en ¡EMPUJÁ!, 88 a 100 % | 360 de 360 válidos | | Todos |
| Los mismos bots en Clásico, casual y flojo (sin cambios) | 22,6 % y 26,4 % | 14,8 % y 11,9 % | — |

Fuera del criterio:

| Qué | Arranque | Dos tiempos |
|---|---|---|
| Casual al 95, 97, 100 y 103 % | 100 · 99,7 · 95,3 · 80,5 % | 100 · 99,7 · 93,9 · 73,1 % |
| Flojo al 95, 97, 100 y 103 % | 81,3 · 74,0 · 55,1 · 27,3 % | 79,8 · 68,2 · 42,8 · 15,2 % |
| Casual sin tocar en ¡EMPUJÁ! | 0 % | 0 % |
| Casual con un toque cada 250, 300, 350, 400, 450 y 500 ms en ¡EMPUJÁ! | 100 · 100 · 99,9 · 79,0 · 17,4 · 1,3 % | 100 · 100 · 99,8 · 80,5 · 21,4 · 1,6 % |
| Casual que reacciona a ¡EMPUJÁ! en 0,6 o 1,2 s | 100 % | 100 % |
| Casual con desvío de 120 ms, o con atraso de 120 ms | 97,5 % · 99,6 % | 98,8 % · 99,2 % |
| Casual que sigue tocando 0,5 a 1 s después de ¡EMPUJÁ! | 100 % | 95,3 % |
| Prácticas del tutorial, casual y flojo | 100 % · 95,9 % | 100 % · 99,5 % |

**La subida.** Subidas falladas del casual y del flojo entre el 88 y el 103 % (1906 casos): mediana 2,0 s, percentil 90 5,0 s, máxima 5,5 s; antes, 12,0 s de mediana y unos 65 toques. Hasta el 100 % ninguna subida fallada de esos bots venía con todas las palabras en PERFECTO o BIEN (3000 intentos por casilla), y con todo en el borde de BIEN se levanta siempre tocando cada 300 ms o más rápido. **Por encima del techo ya no**: al 103 %, 20 a 22 % de las subidas falladas del flojo venían con buenas palabras, y con todo en BIEN hace falta tocar cada 180 ms (Marangi ni así); la línea dice que toque más rápido o pida menos kilos. Un toque en PERFECTO o BIEN tampoco pierde la barra en el vuelo (`sin_altura`, `adelante` y `atras` quedan para TEMPRANO y TARDE). El que toca más lento que uno cada 400 ms pierde la subida con buenas palabras, y tarda unos 5 s en perderla porque venía avanzando; la línea se lo dice.

**La final entera** con las opciones que vienen puestas (apertura al 90 %, plan +4 y +3, tijera, rivales amistosos; 250 partidas por pesista, medidor de la verificación): el casual levanta 99,8 a 100 % y gana el oro 28 a 42 % de las veces; el flojo levanta 86 a 93 %, oro 24 a 28 %, y queda sin marca 0 a 0,4 % (antes, 54 a 69 % de válidos y 3,6 a 9,6 % sin marca).

Riesgos:

1. **El ritmo que pide la subida está elegido con bots.** El umbral queda entre un toque cada 350 ms (pasa) y uno cada 450 ms (no pasa). Es lo que separa al que mira del que toca a ciegas con ritmo lento (uniforme 600–900 ms y metrónomos: 0 %). No se midió a qué ritmo toca una persona real cuando lee «tocá rápido»; si resulta lento, se baja `FACIL.minEmpuje` (con 150, el de 450 ms pasa 88 % y el uniforme 150–900 sube a 12 a 17 %).
2. **Rivales.** Juegan siempre con las reglas de Clásico: `ctl` no entra en su contexto, así que sus resultados y `sim_ref.json` no cambian. En Fácil el jugador tiene ventanas más anchas y una subida más simple que ellos; la dificultad se regula con el nivel de rivales y con los kilos que pide.
3. **Registro.** Suma un campo opcional y no sube la versión, porque `VERSION` está atada a `sim.json` (`data.js`). Un núcleo viejo leería una partida Fácil como Clásico; hoy no hay registros guardados. Con servidor (etapa 5): subir versión con la temporada y separar la tabla por `ctl`.
4. **El registro guarda la salida de la capa, no las teclas.** Recalcula exacto, pero no prueba que la capa se usó. Es el mismo límite de la sección 9.6 de `JUEGO.md`.
5. **En las aperturas, TEMPRANO y TARDE casi no cuestan** (el piso de exigencia tapa el costo): se levanta igual. Cuestan del 95 % para arriba. La palabra en ámbar avisa, pero en pesos bajos no enseña con consecuencias.
6. **Dibujo sin verificar con errores grandes.** Con límites de ±390 a ±470 ms el tirón arrastrado avanza hasta 0,28 s de clip más allá de `Segundo tirón`. La flexión del envión en Fácil dura 0,6 s en vez de 0,36 a 0,42 s: se ve más lenta que en Clásico.
7. **Nada de esto se probó con personas.** En navegador se probó por script (`tools/check_game.mjs`) y se miraron las capturas de `tools/primera.mjs`; en teléfono, solo emulación. Los bots son un modelo; el error humano no es una campana. La prueba real es que el usuario complete el tutorial y una final.
