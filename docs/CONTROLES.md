# Controles: Fácil y Clásico

Especificación del rediseño de controles de la etapa 1. Reemplaza la sección 3.1 de `docs/JUEGO.md` en teclas y gestos; el resto del diseño sigue igual. Los números de la sección 9 están medidos sobre el núcleo con un prototipo; todo lo que es pantalla está sin probar.

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
| Fuera del intento | H o ? | «Cómo se juega», tres viñetas |
| Esperas (luces, repetición, resumen) | Espacio o Enter | Saltea |

El nivel se elige en la pantalla de inicio («Controles: FÁCIL · CLÁSICO»), se guarda en `tarima.ctl` y queda fijo para toda la partida. Por defecto, Fácil.

## 2. Secuencia de toques

La señal está siempre en el mismo lugar (sección 5). Cada toque recibe su palabra: PERFECTO, BIEN, TEMPRANO o TARDE.

**Fácil, arranque**

| Paso | Señal | El círculo se cierra | El toque |
|---|---|---|---|
| — | PREPARATE | No hay círculo (1,2 s) | No se toca |
| 1 de 3 | **¡TIRÁ!** · «Apretá ESPACIO para empezar el levantamiento» | No hay círculo: cuando quieras, con el reloj corriendo | Arranca el tirón |
| 2 de 3 | **¡EXPLOTÁ!** | 0,72 a 0,88 s después del toque 1 (más tarde con más kilos) | Explosión |
| 3 de 3 | **¡RECIBÍ!** | 0,63 a 0,75 s después del toque 2 | Recepción |
| — | **¡EMPUJÁ!** · «tocá rápido» | Barra de avance en lugar del círculo | Cada toque empuja, hasta quedar de pie |
| — | AGUANTÁ, y con la chicharra ¡ABAJO! | — | Nada: fija y baja solo |

**Fácil, dos tiempos.** Pasos 1 a 3 iguales (dicen «de 6») y ¡EMPUJÁ! en la subida de la cargada. Con la barra en los hombros:

| Paso | Señal | El círculo se cierra | El toque |
|---|---|---|---|
| — | RESPIRÁ | No hay círculo (0,45 s) | No se toca |
| 4 de 6 | **¡FLEXIONÁ!** · «Apretá ESPACIO para el envión» | No hay círculo; hay 8 s | Empieza la flexión |
| 5 de 6 | **¡ARRIBA!** | 0,36 a 0,42 s después del toque 4 | Envión |
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

- **Pelea y traba de codos.** El toque sirve si `P < 1 y aguja < exigencia + 50` o si `no trabado y E < exigencia de traba + 150` (la misma regla que usan los rivales). Los que sobran no llegan al núcleo: no hacen temblar ni gastan Resto. Por eso «tocá rápido» es verdad. Sin esta regla el bot casual cae de 99 % a 17 % (temblor).
- **Fijación automática.** El contacto de la recepción sigue apoyado, así que el núcleo ve apoyo firme a los 300 ms de quedar de pie. `automaticos(m)` corre en cada cuadro y agrega `[tb + 150, 0]` cuando pasó la chicharra: instante fijo, no depende del cuadro. «Suelta antes» y «no fija» no pueden ocurrir.
- **Amague.** Toque 2 antes de la rodilla o antes del límite, y toque 5 antes del límite: el pesista devuelve la barra y la señal vuelve al paso 1 (o al 4). Sin costo y sin tope; el reloj sigue. Cartel: «AMAGUE · muy temprano».
- **Toque fuera de turno.** A menos de 60 ms del toque anterior aceptado: se descarta (rebote de tecla). En `acomodo`, en los 450 ms de RESPIRÁ, después de un amague mientras la barra baja, en `post` y en `fijacion`: se descarta sin castigo. En el vuelo antes de tiempo: fallo. Esa es la única regla dura que queda, y es la que deja al bot al azar por debajo del 10 % (si ese toque se descartara, llega a 22 % en arranque y 30 % en dos tiempos).
- **Soltar la tecla** y la repetición automática no generan nada.

## 4. Núcleo: qué cambia en Fácil

El contexto del intento lleva `ctl: 'f' | 'c'`. Sin el campo vale `'c'` y todo da exactamente lo de hoy.

| Parámetro | Clásico | Fácil | Dónde |
|---|---|---|---|
| Ventanas (perfecta, buena y límite) | Tabla de hoy | × `FACIL.ancho` = 2: al 90 %, ±104, ±228 y ±388 ms (al 80 %: ±140, ±308, ±468; al 100 %: ±70, ±154, ±314). Se aplica al final, después de técnica, temple, piso y primera partida | `rules.js`: `ventanas()` acepta `o.ancho` y devuelve `k` |
| Desvío por error de explosión | 0,6 y 0,4 mm por ms fuera de la perfecta | El exceso se divide por `k`: la misma curva, estirada | `rules.js`: `desvioExplosion()` |
| Tirón anticipado (entre la rodilla y el límite) | Fallo | Amague | `attempt.js`: `_suelta()` |
| Tensión | Perfecta, buena o floja según el anillo | Siempre buena (0 mm): el toque 1 es libre | `attempt.js`: `_aprieta()` |
| Fijación, chicharra, pelea, jueces, Resto | — | Sin cambios: lo resuelve la capa | — |

Son menos de diez líneas entre `rules.js` y `attempt.js`. No cambian `VERSION`, `sim.json`, `ai.js` ni `tools/sim_ref.json`. Medido: `tools/sim_test.mjs` pasa entero sobre una copia del núcleo con el cambio, sin `--update`.

**Registro.** La cabecera suma `"ctl": "f"`. `Partida` lo recibe en `cfg.ctl`, lo guarda en `reg.ctl` y `contexto()` lo pasa **solo a la persona**: `ctl: persona ? cfg.ctl : 'c'`. `replay.js` acepta `'f'`, `'c'` o ausente (clásico) y rechaza cualquier otro valor. `ent` sigue siendo la lista de apretar y soltar que recibió el núcleo, o sea la salida de la capa, incluido el evento automático de la bajada: el formato del llamado no cambia y `validarLlamado()` tampoco.

## 5. Señal y devolución

- **Señal** (`ui/senal.js`, elemento `#senal` dentro de `#tv`): verbo grande, aro fijo con un círculo que se cierra sobre él, la tecla dibujada (`ESPACIO`; en teléfono, `TOCÁ`) y el paso («2 de 3»). En horizontal va a la derecha del pesista, a media altura; en vertical, centrada al pie del escenario, nunca sobre la zona táctil. No se mueve con la barra.
- El círculo empieza con el toque anterior, llega al aro en el instante objetivo, se pone dorado dentro de la ventana perfecta y sigue achicándose hasta el límite. En los pasos libres (1 y 4) no hay círculo: late la tecla.
- **Palabra** después de cada toque, en el mismo lugar: PERFECTO y BIEN en blanco; TEMPRANO y TARDE en ámbar, porque el levantamiento sigue. El rojo queda para el fallo.
- **Línea de fallo** (`ui/mensajes.js`, `explicar(res, ctl)`, pura): debajo de «Intento fallado» o «Levantamiento nulo», en vez de la causa sola.

| Causa del núcleo | Texto en Fácil |
|---|---|
| `sin_altura`, sin toque | «No tocaste la explosión. Tocá ESPACIO cuando el círculo se cierra.» |
| `sin_altura`, con toque | «Explotaste muy temprano (o tarde) y la barra no subió. Tocá cuando el círculo se cierra.» |
| `adelante` | «Explotaste temprano y la barra se fue adelante. Esperá a que el círculo se cierre.» |
| `atras` | «Explotaste tarde y la barra se fue atrás. Tocá apenas se cierra el círculo.» |
| `fondo`, temprano | «Tocaste RECIBÍ antes de tiempo. Un toque por señal: esperá el círculo.» |
| `fondo`, tarde | «No recibiste la barra. Tocá ESPACIO cuando el círculo se cierra.» |
| `aplastado` o `codos`, menos de 3 toques en la subida | «La subida se trabó y no empujaste. Con ¡EMPUJÁ!, tocá ESPACIO rápido.» |
| `aplastado` o `codos`, con toques | «No alcanzó el empuje: venías a destiempo. Cuanto más justo toques, menos hay que empujar.» |
| `codos_blandos` | «Recibiste a destiempo y los codos quedaron blandos. Tocá RECIBÍ justo en el cierre.» |
| `temblor`, `tiembla` | «La barra llegó desviada y tembló. Tocá la explosión más cerca del cierre.» |
| `devuelve` | «Pasaron 8 segundos con la barra en los hombros. Apretá ESPACIO para flexionar.» |
| `reloj` | «Se acabó el reloj. Apretá ESPACIO para empezar antes del 0:00.» |

En Clásico, los mismos textos con el gesto que corresponde («soltá cuando la barra llega a la línea», «apretá al recibir»), más `anticipado`: «Soltaste antes de tiempo. Soltá cuando el círculo se cierra.», `antes`: «Soltaste antes de la chicharra. Dejá apretado hasta ¡ABAJO!» y `sin_apoyo`: «No dejaste apretado al quedar de pie. Mantené ESPACIO hasta ¡ABAJO!».

## 6. Tutorial

Corre la primera vez (`tarima.tutorial` vacío) en Fácil; después el inicio ofrece «Repetir tutorial». Reemplaza al metrónomo y a las tres prácticas, que quedan solo para Clásico: en Fácil la corrección de atraso es 0 ms en teclado y 40 ms en táctil. Los tres intentos van al 80 %, sin reloj (`reloj: 0`), con `primera: true` y fuera del registro.

1. **Panel.** «CÓMO SE JUEGA» · «Un toque de ESPACIO por señal. No hay que mantener ni soltar.» · «Tocá cuando el círculo se cierra sobre el aro.» · «Si dice ¡EMPUJÁ!, tocá rápido hasta quedar de pie.» Botones: «Empezar» y «Saltear tutorial».
2. **Arranque guiado, en cámara lenta y sin fallo posible.** El reloj del intento lo lleva la presentación: avanza a la mitad de la velocidad y se detiene en cada objetivo hasta que llega el toque, que se registra en el instante exacto del objetivo (sale PERFECTO). Un toque con el reloj andando se descarta con «Todavía no». Exigencia guionada (`exiFija` del 93 %) para que la subida pida toques. Paradas y textos:
   - «1 de 3 · ¡TIRÁ! Apretá ESPACIO para empezar el levantamiento.»
   - «2 de 3 · ¡EXPLOTÁ! El círculo se cerró: tocá ESPACIO ahora.»
   - «3 de 3 · ¡RECIBÍ! Otra vez: círculo cerrado, tocá ESPACIO.»
   - «¡EMPUJÁ! La subida se trabó. Tocá ESPACIO rápido hasta quedar de pie.» Acá el reloj solo avanza si hubo un toque en los últimos 400 ms.
   - «AGUANTÁ. No toques nada: espera la chicharra y baja solo.» Sin parada.
   - Cierre: «Levantamiento válido · Así se hace».
3. **Práctica 1 de 2, arranque a velocidad real.** Panel: «Ahora a velocidad real. Tres toques: ¡TIRÁ!, ¡EXPLOTÁ!, ¡RECIBÍ!. Si se traba, ¡EMPUJÁ!» Si falla, muestra la línea de fallo y ofrece «Reintentar» (con foco) y «Seguir».
4. **Práctica 2 de 2, dos tiempos a velocidad real.** Panel: «Dos tiempos: lo mismo, y con la barra en los hombros tres toques más.» Una sola parada, en los hombros: «4 de 6 · ¡FLEXIONÁ! con ESPACIO. Enseguida ¡ARRIBA! cuando el círculo se cierra, y ¡RECIBÍ!». Mismo reintento.
5. **Cierre.** «Listo. Jugás con controles FÁCIL; en el inicio podés pasar a CLÁSICO. H repasa cómo se juega.»

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
| `tools/play_human.mjs` (nuevo, sin navegador) | El criterio de la sección 9: 2000 intentos por casilla, sale con error si no se cumple. Cada intento se recalcula con `simular` y tiene que dar lo mismo |
| `tools/sim_test.mjs` | Referencias de hoy sin tocar; referencias nuevas en Fácil con un jugador que pasa por la capa (`tools/sim_ref_facil.json`); en vivo contra recalculado y avance en pasos irregulares con `ctl: 'f'`; `ctl` desconocido rechazado y registro sin `ctl` igual a clásico; `explicar()` devuelve texto para toda causa |
| `tools/check_game.mjs` | `launchOptions()` de `tools/browser.mjs`. Partida por teclado en Fácil con toques cortos y menús sin mouse (Tab, flechas, Enter); otra en Clásico; táctil en Fácil. Un clic en el escenario durante el intento no agrega entradas. Todo panel abre con foco en un botón. `JUEGO.estado()` expone la señal (verbo, paso, objetivo) y la prueba toca según ella. La barra sube también en el tutorial (hoy no se mide) |
| `tools/primera.mjs` (versionar `_primera.mjs`) | Capturas de jugador nuevo en Fácil: inicio, cada parada del tutorial, cada señal a velocidad real y una línea de fallo, en `out/primera/` |

## 9. Medido y riesgos

Prototipo de la capa y del bot sobre una copia del núcleo, sin navegador. Aperturas al 88 a 92 %, los tres pesistas, 2000 intentos por casilla. Los bots tocan a `objetivo + atraso + error`, con error de campana; en los pasos libres reaccionan en 0,35 a 0,8 s; en ¡EMPUJÁ! empiezan a los 300 ms (flojo: 450) y tocan cada 180 ± 35 ms (flojo: 230 ± 60).

| Bot | Arranque | Dos tiempos (tijera) | Meta |
|---|---|---|---|
| Casual en Fácil (desvío 80 ms, atraso 40) | 99 % | 100 % | 85 % o más |
| Flojo en Fácil (desvío 160 ms, atraso 40) | 69 % | 74 % (63 % si Ventura usa su squat) | 50 % o más |
| Al azar en Fácil: instantes de Poisson (mínimo 100 ms entre toques), el peor de cinco ritmos medios entre 250 y 1200 ms | 6 % | 4 % | Menos de 10 % |
| Los mismos bots en Clásico, casual y flojo | 23 % y 27 % | 14 % y 12 % | — |

Sensibilidad del casual en Fácil (600 intentos): reacción de 1,2 s en la subida, 97 %; un toque cada 350 ms, 90 %; desvío de 120 ms, 93 %; atraso de 120 ms, 89 %; **sin tocar en la subida, 6 %**.

Riesgos:

1. **«Al azar» depende de la definición y el margen es chico.** Con instantes de Poisson da 6 %; con el rebote en 120 ms en vez de 60, el más rápido sube a 8 % en arranque y 12 % en dos tiempos. Un bot que toca a ciegas con ritmo parejo no es azar y acierta: intervalos uniformes de 150 a 900 ms, 27 %; un metrónomo exacto de 750 ms, 68 % en arranque y 26 % en dos tiempos. Es consecuencia de que el toque 1 sea libre y de que el levantamiento tenga ritmo fijo. Probé ventanas más angostas (× 1,4) y un tope de dos amagues: el de 150 a 900 ms queda en 13 % y el flojo cae a 46 %. No encontré una regla que separe a los dos.
2. **Rivales.** Juegan siempre con las ventanas de Clásico: `ctl` no entra en su contexto, así que sus resultados y `sim_ref.json` no cambian. Si `ctl` se filtrara a `resolverIA()`, acertarían casi todo. Consecuencia aceptada: en Fácil el jugador tiene el doble de ventana que ellos; la dificultad se regula con el nivel de rivales.
3. **Registro.** Suma un campo opcional y no sube la versión, porque `VERSION` está atada a `sim.json` (`data.js`): subirla obliga a regenerarlo, cambia la huella y fuerza `--update` de las referencias. Un núcleo viejo leería una partida Fácil como Clásico; hoy no hay registros guardados. Con servidor (etapa 5): subir versión con la temporada y separar la tabla por `ctl`.
4. **El registro guarda la salida de la capa, no las teclas.** Recalcula exacto, pero no prueba que la capa se usó: un cliente modificado puede mandar con `ctl: 'f'` entradas hechas a mano. Es el mismo límite de la sección 9.6 de `JUEGO.md`.
5. **La subida es obligatoria ya en las aperturas** (sin tocar, 6 %). Toda la jugabilidad de Fácil cuelga de que ¡EMPUJÁ! se entienda; por eso tiene parada propia en el tutorial.
6. **Fácil con pesos altos no está ajustado.** Casual: 90 % al 95 % y 36 a 39 % al 100 %. Un experto (desvío 25 ms): 14 % al 103 %. Casi todos los fallos son en la subida. Queda para el informe de balance.
7. **Dibujo sin verificar.** Con límites de ±390 a ±470 ms el tirón arrastrado avanza hasta 0,28 s de clip más allá de `Segundo tirón`, y el cambio de ritmo del vuelo puede salir del rango 0,6 a 1,5 de `JUEGO.md` 3.5. Hay que mirarlo en capturas.
8. **Nada de esto se probó con personas ni en navegador.** Los bots son un modelo; el error humano no es una campana. La prueba real es que el usuario complete el tutorial.
