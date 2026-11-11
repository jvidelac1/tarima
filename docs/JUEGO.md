# Diseño del juego — Tarima

Redactado el 11 de noviembre de 2026. Este documento dice cómo se juega; [PLAN.md](PLAN.md) dice en qué etapa se hace cada cosa y [HANDOFF.md](../HANDOFF.md) dice qué existe hoy.

Es la síntesis de tres propuestas independientes (sensación de juego, competencia y producción), corregida después de dos críticas (una de diseño y una técnica). Donde las propuestas no coincidían se eligió una y el motivo está en el anexo A. Lo que cambió por las críticas, y lo que se descartó de ellas, está en el anexo B.

**Todo número de este documento es un valor inicial sin probar.** Nada de esto se jugó todavía. Los tiempos de cada fase salen de `web/data/poses.json` tal como está hoy; se dan para Ventura y, entre paréntesis, para Brenner. Las cifras de la pelea (sección 4) y de porcentaje de válidos (sección 9.7) salen de una cuenta chica hecha sobre estas mismas reglas con jugadores simulados: sirven para ver que las reglas cierran entre sí, no reemplazan al informe de balance ni a una partida real.

---

## 1. El juego en una pantalla

1. Es la final de un mundial ficticio de halterofilia, el **Mundial Tarima 2026**, con tres pesistas inventados en una sola categoría. El jugador elige a uno y juega para que gane el oro.
2. Cada pesista tiene tres intentos de arranque y tres de dos tiempos. Gana el mejor total (mejor arranque más mejor dos tiempos).
3. Todo el levantamiento se juega con **un solo botón**: la barra espaciadora, el clic o un dedo en la pantalla.
4. La frase que se aprende una vez y sirve para todo: **apretá para despegar, soltá para explotar, apretá para recibir, aguantá apretado y soltá cuando suene la chicharra.**
5. Si la barra se traba en la subida, **se pelea tocando repetido**. Pelear salva intentos, pero cansa al pesista para los que siguen, y tocar de más lo hace temblar.
6. Un intento puede salir válido, ser nulo (se completó, pero los jueces lo anulan) o fallar (la barra se cae). Cada error del jugador tiene su causa con nombre. En la etapa 1 esa diferencia se lee en el texto de la causa y en la repetición; cada fallo tiene su animación propia recién desde la etapa 4.
7. Antes de cada intento el jugador decide **cuántos kilos pedir** y **qué envión usar** (tijera, power o squat). El orden de salida por kilos convierte esa decisión en táctica.
8. Los dos rivales los maneja el juego con las mismas reglas y sin ayudas ocultas: también fallan, también se cansan y también especulan con los kilos.
9. La presentación es la de una transmisión de TV: cámaras, tablero, luces de jueces, repeticiones, festejos, ayudantes que cargan la barra y, al final, podio, medallas y foto de los tres.
10. Funciona igual en escritorio y en teléfono desde el primer día, y todo resultado se puede recalcular en un servidor a partir de lo que el jugador tocó.

---

## 2. Flujo de una partida

| Tramo | Duración estimada | Qué pasa | Qué decide el jugador |
|---|---|---|---|
| Inicio | 0:20 | Pantalla de título y elección de pesista. El menú responde antes de que carguen los modelos | A quién maneja |
| Calentamiento | 0:40 (se puede saltear desde la segunda partida) | Un metrónomo de 8 toques mide el atraso del dispositivo. Después, dos levantamientos livianos (60 %) enseñan la frase de control y uno **pesado guionado** (exigencia de 98 %, sin costo) enseña la pelea, la traba de codos y el paso a la chicharra. Muestra la forma del día («hoy el arranque sale liviano») | Aceptar o no la corrección de atraso |
| Presentación | 0:20 | Entran los tres en el tablero con país, dorsal y apertura. Se anuncia el guion de la final (sección 7.3) | Apertura de arranque (hay un valor sugerido) |
| Arranque | 2 a 4 min | Nueve intentos ordenados por kilos. Tres son del jugador | Kilos de cada intento, en el panel de su llamado |
| Intervalo | 0:25 | Clasificación parcial; los tres recuperan Resto | Apertura de dos tiempos |
| Dos tiempos | 2:30 a 5 min | Nueve intentos. El del jugador incluye cargada y envión | Kilos y tipo de envión |
| Cierre | 1:30 (0:25 en la etapa 1) | Clasificación final, podio, medallas, himno y foto | Guardar la foto, revancha o cambiar de pesista |

Hay dos ritmos, con las mismas reglas y el mismo resultado:

- **Final exprés** (5 a 6 minutos). Es el ritmo por defecto. Los intentos ajenos se resumen en 3 a 4 segundos de tablero, salvo los decisivos.
- **Final completa** (unos 11 minutos). Los intentos ajenos se muestran desde la posición de salida hasta las luces (unos 10 segundos); los que definen un puesto se ven enteros.

Todo tramo en que el jugador no hace nada se puede saltear con un toque. La **revancha** arranca en menos de 5 segundos: los modelos quedan en memoria y se saltean el inicio y el calentamiento.

Ciclo de cada intento propio (35 a 45 segundos):

1. **Llamado.** Placa con nombre, intento y kilos; arranca el reloj. Se abre el único panel de kilos (sección 6.3).
2. **Intento.** Se juega con el botón (sección 3).
3. **Decisión.** Las tres luces se encienden de a una.
4. **Reacción.** Festejo o lamento, y repetición lenta.

La declaración para el intento siguiente es automática (el plan del entrenador); el jugador la corrige en el panel de su próximo llamado.

Todo panel que aparece queda bloqueado 400 ms y los kilos se confirman con un botón **Confirmar**: así el toque de saltear nunca elige un peso por accidente.

---

## 3. El intento, fase por fase

### 3.1 Controles

Hay un solo botón lógico. Se usa con cuatro gestos: apretar, mantener, soltar y tocar repetido.

| | Botón | Notas |
|---|---|---|
| Teclado | Barra espaciadora (también Enter) | Se ignora la repetición automática de la tecla |
| Mouse | Clic izquierdo sobre el escenario | En el juego la cámara no se orbita con el mouse |
| Táctil, vertical | Cualquier punto del 40 % inferior de la pantalla, sin contar el área segura del sistema | El escenario ocupa el 60 % superior. En el panel táctil no hay información crítica: queda bajo el pulgar |
| Táctil, horizontal | Cualquier punto fuera de la franja de botones y del área segura | Sin menú contextual, sin zoom y sin desplazamiento de página |
| Pausa | Esc o un botón chico arriba | Solo fuera del intento. Dentro del intento no hay pausa |

- **Varios dedos o varias teclas.** Fuera de la pelea cuentan como el mismo botón: está apretado mientras haya al menos uno apoyado. En la pelea y en la traba de codos, **cada contacto nuevo es un toque**, aunque haya otro dedo apoyado: así se puede alternar pulgares, o Espacio y Enter, sin perder toques.
- **El instante de cada gesto** se toma del evento del navegador, en milisegundos, y no del cuadro dibujado. Así la precisión no depende de que el teléfono vaya a 30 cuadros por segundo.
- **Corrección de atraso.** 0 ms en teclado y 40 ms en táctil por defecto. El metrónomo del calentamiento (8 toques sobre un pulso visual y sonoro, se toma la mediana) propone un valor. El máximo es 100 ms. Queda **fija para toda la partida**; entre partidas, la mediana de los últimos 30 gestos con ventana propone un ajuste. Solo se resta al medir el error de un gesto con ventana; nunca cambia el instante registrado.
- **Interrupciones.** Si la página pierde visibilidad, entra una llamada o el sistema cancela el toque, no se toma como soltar. Antes de que la barra pase la rodilla es un amague sin costo y el reloj se pausa hasta volver. Después, en solitario el intento se repite desde el llamado (una vez por intento; la segunda es fallo); en el online hay una interrupción perdonada por partida, que queda en el registro, y las demás son fallo.
- **Sin sonido se juega igual.** Todo aviso sonoro tiene un gemelo visual (sección 8.3).
- Las ayudas visuales de sincronía van pegadas a la barra y nunca debajo del pulgar.

### 3.2 Cómo se siente el peso

La **intensidad** de un intento es el cociente entre los kilos pedidos y el **techo del momento** del pesista en ese levantamiento (sección 6.4). De la intensidad dependen cuatro cosas:

| Intensidad | Ventana perfecta | Ventana buena | Límite | Velocidad del tirón | Exigencia de la subida | Altura sobrante de la barra |
|---|---|---|---|---|---|---|
| 80 % | ±70 ms | ±155 ms | ±235 ms | 1,00 | 0,20 | +10 cm |
| 90 % | ±52 ms | ±115 ms | ±195 ms | 0,93 | 0,42 | +5,5 cm |
| 95 % | ±44 ms | ±96 ms | ±176 ms | 0,89 | 0,54 | +3,3 cm |
| 100 % | ±35 ms | ±77 ms | ±157 ms | 0,85 | 0,66 | +1 cm |
| 103 % | ±30 ms | ±66 ms | ±146 ms | 0,83 | 0,75 | −0,4 cm |
| 106 % | ±30 ms | ±66 ms | ±146 ms | 0,80 | 0,84 | −1,7 cm |

- Entre filas se interpola en línea recta. La ventana buena es 2,2 veces la perfecta y el límite suma 80 ms.
- Con más kilos el tirón se ve más lento y hay que esperar más para soltar: **el peso se siente como paciencia**.
- Fuera del límite no hay pelea posible: es fallo directo.
- **Multiplicadores de ventana**:
  - Movimiento: en el arranque la recepción es 15 % más angosta; en el envión todos los gestos son 20 % más angostos. Se aplica a las tres columnas.
  - Técnica del pesista y, en intentos con etiqueta, su Temple (sección 7.2). También a las tres columnas.
  - Primera partida: en el primer intento de cada levantamiento el límite, y solo el límite, es 30 % más ancho.
- **El piso se aplica al final.** Después de todos los multiplicadores, ninguna ventana queda por debajo de la fila del 103 % (±30, ±66 y ±146 ms): menos que eso no es justo en un teléfono. Lo que el piso recorta no se regala: por cada 10 % de ventana que el piso impidió achicar, la barra sale con 1 cm menos de altura sobrante.
- Por encima del 100 % la dificultad viene de la exigencia y de la altura, no de ventanas más finas.
- Ajuste de exigencia por movimiento: en el arranque la exigencia de la subida baja 0,08 (se gana con precisión); la cargada lleva la exigencia completa (se gana con piernas).
- El tipo de envión no toca las ventanas: cambia la altura que hace falta y el desvío tolerado (sección 3.6).

### 3.3 Arranque y cargada

Los nombres de fase son los de `poses.json`. El gesto es el mismo en teclado y en táctil; la tabla lo dice con las dos palabras.

| Momento (fases) | Teclado | Táctil | Tiempo objetivo | Qué decide |
|---|---|---|---|---|
| Llamado (`Parado`) | Confirmar en el panel, o un toque de Espacio | Confirmar | Antes de que el reloj llegue a cero | El pesista se agacha a la barra (1,2 s) |
| Tensión (`Salida`, quieto) | Apretar Espacio y no soltarlo | Apoyar el dedo y dejarlo | Cuando el anillo de tensión está lleno. El anillo respira cada 1,6 s (1,3 s al 100 %) | Tensión perfecta (a menos de 90 ms del máximo), buena (a menos de 220 ms) o floja. Nunca hace fallar por sí sola |
| Tirón (`Despegue`, `Primer tirón`, `Transición`) | Mantener | Mantener | — | Soltar antes de que la barra pase la rodilla (`Primer tirón`) es un **amague** (sección 5.4). El reloj se detiene cuando la barra pasa la rodilla |
| Explosión (`Segundo tirón`) | Soltar | Levantar el dedo | Cuando la barra llega a la **línea de potencia**, dibujada a la altura que tiene la barra en esa pose (muslo alto). Arranque: 726 ms (745) después de apretar. Cargada: 719 ms (739). Se divide por la velocidad del tirón | Altura y desvío de la barra |
| Vuelo (`Triple extensión`, `Tirón de brazos`, `Giro` o `Giro de codos`) | Nada | Nada | — | — |
| Recepción (`Recepción`) | Apretar | Tocar | Cuando la barra traba en el fondo: un anillo se cierra sobre la barra y suena el golpe de recepción. Arranque: 740 ms (749) después de soltar. Cargada: 631 ms (702). No depende del peso | Rebote, firmeza de los codos (arranque) y exigencia de la subida |
| Fondo (`Amortiguación`, solo cargada) | Nada | Nada | 126 ms (141) | — |
| Subida (`Recuperación` en arranque, `Subida` en cargada) | Tocar repetido si hace falta | Tocar repetido | La marca la pelea (sección 4) | De pie, aplastado o barra perdida |
| De pie | Dejar apretado | Dejar el dedo apoyado | La fijación empieza cuando el botón lleva 300 ms seguidos apretado (**apoyo firme**). Hay 2 s para lograrlo | Antes del apoyo firme, los toques que sobran de la pelea se ignoran. Después, soltar antes de la chicharra es nulo |
| Chicharra | Soltar | Levantar el dedo | Suena entre 0,7 y 1,5 s después del apoyo firme; más tarde si llegó temblando | El pesista baja la barra |

Tres aclaraciones:

- **Prioridad al soltar temprano.** Antes de la rodilla siempre es amague. Entre la rodilla y el borde temprano del límite es fallo (tirón anticipado). Esa franja solo existe con pesos altos: de la rodilla a la línea de potencia hay 218 ms en el arranque y 181 ms en la cargada (199 y 155), divididos por la velocidad del tirón. Al 80 % el límite es más ancho que eso y la franja no existe; al 90 % mide unos 40 ms en el arranque y nada en la cargada; al 100 %, unos 100 ms en el arranque y unos 55 ms en la cargada.
- **Soltar chico durante la fijación.** Una suelta de menos de 120 ms no cuenta. Si pasan 2 s de pie sin apoyo firme, el pesista baja la barra sin señal: nulo.
- **Dos tiempos.** Al quedar de pie con la barra en los hombros no hay chicharra: la entrada se ignora 450 ms (para que un toque de la pelea no arranque el envión), el pesista respira y vuelve el anillo de tensión.

El ancla de la recepción es la pose `Recepción`, no el golpe de los pies: `poses.json` no trae el instante del contacto y en la cargada los pies ya están abiertos una fase antes. El pisotón real como señal llega en la etapa 4, con el evento `paso` (sección 10.3).

### 3.4 Envión

| Momento (fases) | Teclado | Táctil | Tiempo objetivo | Qué decide |
|---|---|---|---|---|
| Barra en los hombros (`Recuperación`) | Apretar y no soltar | Apoyar el dedo y dejarlo | Con el anillo lleno. A los 8 s devuelve la barra | Tensión |
| Flexión (`Envión · Dip`) | Mantener | Mantener | — | Soltar antes del borde temprano del límite es un amague sin costo: el pesista se vuelve a estirar |
| Fondo de la flexión | Soltar | Levantar el dedo | Cuando los discos rebotan: 359 ms (354) después de apretar, dividido por la velocidad del tirón | Altura y desvío. Temprano: flexión corta y barra adelante. Tarde: pierde el rebote |
| Impulso y empuje | Nada | Nada | — | — |
| Recepción (`Envión · Tijera`, `Power jerk · Recepción` o `Squat jerk · Recepción`) | Apretar | Tocar | Cuando la barra traba arriba (anillo y golpe de recepción). Tijera: 553 ms (625) después de soltar. Power: 553 ms (588). Squat: 724 ms (810) | Codos trabados o blandos |
| Recuperación | Mantener; tocar repetido si quedó blando o si es squat | Igual | — | Válido, nulo por codos o fallo |
| De pie y chicharra | Apoyo firme y soltar con la chicharra | Igual | Igual que en el arranque | Soltar antes: nulo |

Con poco peso son tres gestos a ritmo parejo (unos 0,7 s entre uno y otro) y la subida sale sola.

### 3.5 El gesto siempre causa el movimiento

El jugador tiene que ver que su dedo dispara la explosión, no que acierta o erra a una película. Para eso el resultado y el dibujo se separan:

- **El núcleo fija el calendario.** La recepción cae siempre a una cantidad fija de milisegundos del soltar real (los de las tablas de arriba), sin importar el error.
- **La presentación absorbe la diferencia** cambiando el ritmo del clip de forma continua, entre 0,6 y 1,5 veces, entre el soltar y `Giro` (o `Giro de codos`; en el envión, hasta `Envión · Empuje`). El tramo final hacia la recepción va siempre a velocidad real: es la caída bajo la barra.
- **La barra nunca se congela en movimiento.** Si pasa el objetivo y el jugador no soltó, el tirón sigue a 0,6 veces: se ve un tirón arrastrado, que es lo que es. Si llega al límite sin soltar, es fallo por tirón sin altura.
- **Solo se espera en poses de reposo**, que son las de velocidad cero (`hold`). En la flexión del envión el clip espera en el fondo. En la recepción espera, hasta que cierre la ventana, en la primera pose de reposo que encuentra: la recepción misma en el arranque, la tijera y el power, y la amortiguación en la cargada. En el squat no hace falta: el fondo llega después de que cierra la ventana.

Con esos márgenes la presentación absorbe cualquier error dentro del límite: soltar 240 ms temprano en el arranque pide 1,5 veces y soltar 280 ms tarde pide 0,65.

### 3.6 Los tres enviones

El jugador elige el envión en el panel de kilos. Cada pesista **domina dos** (sección 7.1) y los usa sin castigo; el primero de los dos es el de la casa y viene elegido por defecto.

| | Altura que necesita | Desvío tolerado | Después de recibir | Costo de Resto | Para qué sirve |
|---|---|---|---|---|---|
| Tijera | Normal | ±8 cm | Recuperación sin pelea si la recepción fue buena | Normal | El más seguro |
| Power | 4 cm más | ±6 cm | Termina enseguida | 6 puntos menos | Aperturas y pesos hasta el 95 %, para llegar entero al final |
| Squat | 6 cm menos | ±4 cm | Pelea obligatoria desde `Squat jerk · Fondo`, sin rebote | 4 puntos más | Kilos máximos: mucho riesgo, mucho premio |

Con el envión que el pesista no domina, la barra sale con 2 cm menos de altura sobrante y el desvío tolerado es 1 cm menor.

---

## 4. Pelear el levantamiento

La pelea aparece en la subida del arranque, en la subida de la cargada, siempre en el squat y, con reglas propias, al trabar codos blandos (sección 4.1). El pesista sube solo hasta cierto punto; lo que falta lo pone el jugador tocando repetido.

Cuatro cantidades describen la pelea:

- **Avance**: de 0 (en el fondo) a 1 (de pie).
- **Esfuerzo**: de 0 a 1. Es el esfuerzo propio del pesista más el **aporte** de los toques.
- **Aguja**: el esfuerzo promediado en 0,2 s. Es lo que muestra el medidor y lo que se compara con las zonas.
- **Temblor**: de 0 a 1. Lo que se acumula por empujar de más.

| Regla | Valor inicial |
|---|---|
| Esfuerzo propio del pesista, sin tocar nada | 0,45 (cambia con la Garra, sección 7.2) |
| Cada toque | Suma 0,10 al aporte. El esfuerzo no pasa de 1 |
| Caída del aporte | En cada paso de 1/120 s pierde 1/120 de su valor: sin toques se va en cerca de un segundo. Un ritmo sostenido de 4 toques por segundo aporta 0,40 |
| Toques demasiado seguidos | A menos de 140 ms del anterior vale la mitad; a menos de 90 ms no vale. El máximo útil es 7 por segundo |
| La recepción es el primer toque | El toque de la recepción precarga el aporte: 0,08 más 0,12 por su calidad |
| Rebote | Los primeros 0,20 de avance (por la calidad de la recepción) se recorren solos, a la velocidad del clip. En los primeros 0,3 s el avance no retrocede |
| Subir | El avance crece 4 veces la diferencia entre esfuerzo y exigencia por segundo, con tope de 0,8 por segundo |
| Hundirse | Si el esfuerzo no alcanza, el avance retrocede 1,2 veces la diferencia por segundo |
| Punto de estancamiento | Entre 0,30 y 0,55 de avance la exigencia sube 0,10 |
| Franja verde | Va de la exigencia a la exigencia más 0,10, y sube con ella en el estancamiento. Es donde tiene que vivir la aguja |
| Empujar de más | Con la aguja por encima de la franja, el temblor sube 6 veces el exceso por segundo (0,10 de más: 0,6 por segundo) |
| Zona roja | Con la aguja por encima de 0,92, el temblor sube además 0,30 por segundo. Con mucho peso la franja verde queda dentro del rojo: cruzar el estancamiento cuesta temblor |
| Sin toques no hay temblor | El temblor por empuje solo corre si hubo un toque en los últimos 0,4 s. Si no, baja 0,25 por segundo |
| Desvío | Cada centímetro de desvío de la barra por encima de 2 suma 0,03 de temblor por segundo |
| Aguante | A los 4 s de pelea el esfuerzo propio empieza a caer 0,1 por segundo |
| Se pierde | Si el temblor llega a 1, o si el avance queda en 0 durante 0,4 s después de medio segundo de gracia |

La exigencia sale de la tabla de la sección 3.2 y empeora con los errores anteriores (sección 5.1). Si la exigencia con el estancamiento pasa de 1, la subida no se puede completar: el pesista se hunde.

En el núcleo todo esto se calcula en milésimas enteras, paso por paso; la tabla está en decimales para leerla.

Qué produce, según la cuenta con jugadores simulados (cargada, esfuerzo propio 0,45):

| Caso | Sin tocar | Con control (aguja en la franja) | Machacando (7 por segundo) | Ritmo fijo de 4 por segundo |
|---|---|---|---|---|
| Hasta 85 % limpio | Sale sola | Sale sola | Pierde la barra por temblor | Pierde la barra por temblor |
| 90 % limpio | Se hunde | 2 toques, 1,7 s | Pierde la barra | Pierde la barra |
| 95 % limpio | Se hunde | 5 toques, 2,0 s | De pie con temblor 0,94: dos rojas | Sale (temblor 0,45) |
| 100 % limpio | Se hunde | 9 toques, 2,4 s, sin temblor | De pie con temblor 0,80: dos rojas | Sale lento (3,1 s) |
| 100 % con errores (exigencia +0,14) | Se hunde | 20 toques, 4,0 s | Una roja (temblor 0,74) | Se hunde |
| 103 % limpio | Se hunde | 14 toques, 3,0 s | Una roja (temblor 0,71) | Se hunde |
| 103 % con errores (+0,14) | Se hunde | No sale | No sale | Se hunde |
| 106 % limpio | Se hunde | 21 toques, 4,0 s, temblor 0,45 | Dos rojas (temblor 0,80) | Se hunde |
| 106 % con cualquier error | Se hunde | No sale | No sale | Se hunde |

Lo que se lee ahí:

- **Machacar no sirve.** En un levantamiento limpio hasta el 100 % da pérdida o nulo. Cuando la exigencia es muy alta deja al pesista con una roja, al borde del nulo. El dedo más rápido no gana: el tope de 7 toques por segundo lo alcanza cualquiera.
- **Ningún ritmo fijo sirve para todo.** El que alcanza al 100 % hace temblar al 90 % y no alcanza con un error. La habilidad es leer la franja y acompañarla.
- **No todo se salva.** Al 103 % con un error serio y al 106 % con cualquier error, el estancamiento no se cruza.
- **El intento peleado que sale existe.** Al 106 % limpio son cuatro segundos, con la aguja en rojo durante el estancamiento y el pesista llegando con medio temblor.

**Pelear cuesta.** Cada toque que vale y cada segundo con la aguja fuera de la franja gastan Resto (sección 6.4), y eso baja el techo de los intentos siguientes. Abandonar a tiempo una subida perdida también es una decisión: ahorra ese Resto. La técnica limpia es la estrategia; la pelea es el recurso caro.

Lo que se ve y se oye:

- Un medidor vertical junto al pesista, con la franja verde marcada por dos topes y la aguja como una flecha. Por encima de la franja el fondo va rayado además de rojo, y por debajo va liso y gris: se lee por posición y por trama, no solo por color.
- Temblor del cuerpo y de la barra, y la barra que se frena en el estancamiento.
- El grito que crece con el esfuerzo y el público que crece con el avance.

Opción de accesibilidad, para una etapa posterior: «pelea a ritmo», en la que se toca siguiendo un pulso y cada toque a tiempo vale más, calibrada para dar el mismo resultado.

### 4.1 Trabar codos blandos

Una recepción fuera de la ventana buena en el arranque o en el envión deja los codos blandos. Se traban tocando repetido, con un medidor propio:

| Regla | Valor inicial |
|---|---|
| Traba inicial | 0,90 si la recepción quedó en el borde de la ventana buena; baja hasta 0,70 en el límite |
| Exigencia | La de la tabla menos 0,20, sin punto de estancamiento |
| Subir y hundirse | Como en la pelea, con el mismo esfuerzo y los mismos toques |
| Trabado | Cuando la traba llega a 1. Los jueces miran cuánto tardó (sección 5.3) |
| Se pierde | Si la traba baja de 0,30: ceden los codos y la barra cae |

- Apenas blando y con reacción inmediata (un toque en los primeros 150 ms) se traba en unos 200 ms: una roja, y el intento todavía puede valer. Más blando es nulo aunque se trabe; ahí los toques solo evitan que la barra caiga.
- En el arranque y en el squat los mismos toques sirven para las dos cosas: la traba y la subida corren a la vez con el mismo esfuerzo.

---

## 5. Resultados

Para la clasificación hay dos resultados: **válido** o **nulo**. Para el jugador hay tres dramas distintos:

| Resultado | Qué es | Luces |
|---|---|---|
| Válido | Completó el levantamiento y al menos dos jueces dieron blanca | 3-0 o 2-1 |
| Nulo | Completó el movimiento, pero al menos dos jueces dieron roja; o se le acabó el reloj | 1-2 o 0-3 |
| Fallo | La barra se cayó. Cuenta como intento nulo | 0-3 |

No hay lesiones ni caídas truculentas. El tono es el de una transmisión deportiva: el fallo se lee en la barra y en el cuerpo. La cara suma recién cuando el modelo tenga expresiones (sección 10.3); hoy no las tiene.

### 5.1 Cómo se calcula

Cada gesto con tiempo da un error en milisegundos y una calidad entre 1 (dentro de la ventana perfecta) y 0 (en el límite). Con eso se arman dos medidas de la barra y la exigencia de la subida:

| Medida | Cómo se calcula |
|---|---|
| Altura sobrante (cm) | La de la tabla de la sección 3.2, más la explosión (perfecta +3, borde de buena −4, límite −10), más la tensión (perfecta +1, buena 0, floja −2), más los ajustes del envión elegido y del piso de ventanas |
| Desvío (cm, positivo hacia adelante) | Soltar temprano manda la barra adelante: 0,06 cm por milisegundo fuera de la ventana perfecta. Soltar tarde la manda atrás: 0,04 cm por milisegundo. Se suma una variación chica y sembrada de hasta ±1 cm al 100 % |
| Exigencia de la subida | La de la tabla, más 0,06 por cada centímetro de altura que el jugador perdió respecto de la ejecución perfecta (hasta 0,40), más 0,02 por cada centímetro de desvío por encima de 2, más hasta 0,25 por una recepción a destiempo |

Con todo perfecto no se falla nunca hasta el 100 %: la variación sembrada es mucho menor que los topes.

### 5.2 Fallos y qué los causa

| Error del jugador | Fallo | Lo que se ve (desde la etapa 4) |
|---|---|---|
| Soltar entre la rodilla y el borde temprano del límite (solo existe con pesos altos, sección 3.3) | Tirón anticipado | Tira de brazos antes de tiempo; la barra queda baja y adelante y no se mete |
| No soltar antes del límite, o altura sobrante menor a −6 cm | Tirón sin altura | La barra se queda en la cadera o en el pecho y vuelve a la tarima |
| Desvío hacia adelante mayor al tope | Barra adelante | Recibe y la barra se le va; salta hacia atrás |
| Desvío hacia atrás mayor al tope (arranque y envión) | Barra atrás | La barra pasa por detrás; sale caminando hacia adelante |
| No apretar en la recepción antes de que cierre el límite | La pierde en el fondo | Llega al fondo, no traba y la barra cae |
| Pelea perdida en la cargada | Aplastado | Se queda sentado y suelta la barra adelante |
| Pelea o traba perdida en el arranque o en el envión | Ceden los codos | La barra baja y la suelta adelante |
| Temblor al máximo | Pierde la barra arriba | Tiembla, se desarma y la suelta |
| Ocho segundos con la barra en los hombros sin hacer el envión | Devuelve la barra | La deja caer desde los hombros |

Topes de desvío: arranque 6 cm, cargada 8 cm, tijera 8 cm, power 6 cm, squat 4 cm.

En «la pierde en el fondo» el clip espera en la pose de reposo de la recepción (sección 3.5) hasta que cierra la ventana, y recién entonces se muestra el fallo.

### 5.3 Nulos y qué los causa

| Causa | Luces |
|---|---|
| Codos blandos que se traban en menos de 350 ms | Una roja |
| Codos blandos que se traban entre 350 y 700 ms | Dos rojas |
| Codos blandos que tardan más de 700 ms | Tres rojas |
| Temblor mayor a 0,5 al quedar de pie | Una roja más |
| Temblor mayor a 0,75 al quedar de pie | Dos rojas más |
| Soltar antes de la chicharra, después del apoyo firme | Tres rojas |
| Dos segundos de pie sin apoyo firme | Tres rojas |
| Reloj en cero antes de que la barra pase la rodilla | Tres rojas y chicharra larga |

Cada juez tiene su propio umbral, hasta 10 % más estricto o más permisivo, sembrado por partida. Por eso existen las decisiones 2 a 1.

### 5.4 El amague

No es fallo ni nulo, no gasta Resto y no cuenta como intento. Hay dos:

- **En el tirón.** Soltar antes de que la barra pase la rodilla: el pesista devuelve la barra al piso y puede volver a empezar si le queda reloj, que sigue corriendo. Copia el criterio del deporte, donde el intento empieza a contar cuando la barra llega a la rodilla.
- **En la flexión del envión.** Soltar antes del borde temprano del límite: el pesista se vuelve a estirar. Lo limitan los 8 segundos con la barra en los hombros.

Los dos protegen de un toque accidental en el teléfono.

---

## 6. La competencia

Las reglas siguen las del deporte real, adaptadas de memoria y sin cotejar contra un reglamento vigente. Se acortaron los relojes para que la partida entre en diez minutos.

### 6.1 Marco ficticio

| | Decisión |
|---|---|
| Evento | **Mundial Tarima 2026 · Final · categoría 90 kg** |
| Organizador | «Liga Mundial Tarima», sin sigla |
| Categoría | Una sola para los tres, fuera del cuadro vigente de categorías (a verificar antes de publicar). Sin categoría común no hay total comparable |
| Medallas | Las decide solo el total. Mejor arranque y mejor dos tiempos son menciones en la pantalla final |
| Récords ficticios de la categoría | Arranque 179, dos tiempos 214, total 388. Dan un segundo objetivo cuando el oro ya está resuelto |
| Países | Arxenia, Novakia y Pelagia |
| Códigos de país | Los de hoy (ARX y NVK, horneados en la textura de las mallas, y PLG) **se cambian antes de publicar**: de memoria, ARX coincide con una marca de máquinas de fuerza, NVK con una emisora de TV y PLG con una liga deportiva. Candidatos sin verificar: AXR, NKA y PEL. ARX y NVK siguen en la gráfica y en las mallas hasta el build de la etapa 3, donde se reemplazan juntos; Pelagia usa su código nuevo desde ya |
| Banderas | La de Novakia de `web/js/config.js` (triángulo al asta y dos franjas) se lee como la de un país real: en el juego lleva otra disposición |
| Verificación pendiente | Antes de publicar se buscan uno por uno los códigos, los nombres de país, el nombre del evento y los nombres completos de los tres pesistas |

### 6.2 Reglas

| Regla | Decisión |
|---|---|
| Intentos | Tres de arranque, intervalo, tres de dos tiempos |
| Orden de salida | Sale primero quien pidió menos kilos. A igual peso, quien tiene menor número de intento. Después, quien hizo antes su intento anterior. Después, el dorsal más bajo |
| La barra nunca baja | No se puede pedir menos de lo que ya está cargado |
| Progresión | Tras un válido, al menos 1 kg más. Tras un nulo, el mismo peso o más |
| Declaración | Automática al terminar cada intento: el plan del entrenador (sección 6.3) |
| Cambios | Dos por intento, hacia arriba o hacia abajo, nunca por debajo de la barra ni del mínimo propio. El jugador los hace en el panel de su llamado, hasta que su reloj baja de 0:15. Los rivales los hacen al cierre de cada intento ajeno. Si un cambio altera el orden, sale el otro; cuando vuelven a llamar al primero, su reloj arranca de nuevo |
| Reloj | 0:30 desde el llamado; 0:45 si el pesista se sigue a sí mismo. Aviso a 0:10. Se detiene cuando la barra pasa la rodilla. Si llega a cero antes, intento nulo |
| Jueces | Tres luces, mayoría simple. Sin revisión por video |
| Señal de abajo | Hay que sostener hasta la chicharra |
| Total | Mejor arranque más mejor dos tiempos |
| Desempate | A igual total gana quien lo completó primero |
| Sin marca | Tres nulos en un levantamiento: sin total, fuera de la clasificación y sin medalla. Sigue compitiendo por la mención del otro levantamiento. Si es el jugador, puede seguir o simular el resto de la final |
| Sin marca en el podio | El escalón queda vacío. El pesista aparece igual en la foto, sin medalla |

### 6.3 Elegir los kilos

Hay **un solo panel**, en el llamado propio. Se abre con el peso declarado ya elegido; si el jugador no toca nada hasta 0:15, queda ese.

- **El plan del entrenador** es la declaración automática: tras un válido, el salto planeado (+4 kg en el segundo intento, +3 en el tercero); tras un nulo, repetir.
- **Tres fichas** y un ajuste fino de a 1 kg: *Seguro* (hasta el 95 %), *Justo* (98 a 100 %) y *Jugado* (102 % o más). Se calculan sobre el **techo visible**: el techo de ficha corregido por el Resto. No usan la forma del día, que el jugador solo conoce por su signo.
- **El entrenador no da porcentajes.** Dice «sale caminando», «es para pelearla» o «es un tiro». Una probabilidad exacta mata la tensión.
- **La cuenta**, siempre visible: «Para el oro: 208 · Plata asegurada con 204». Ya incluye el desempate. En el teléfono nadie va a calcular totales.
- **Selector de envión**, con el de la casa por defecto.
- **Apertura** libre entre el 88 % y el 97 % del techo. El valor sugerido sale del error medido en el calentamiento: 93,5 % para un jugador preciso, hasta 88 % para uno que todavía no agarró el ritmo.

Tensiones que salen solas de las reglas:

1. Asegurar primero o ir directo por lo que hace falta.
2. Salto grande (los rivales levantan entre medio y el pesista recupera) contra salto chico.
3. Pasar a un rival por un kilo para salir después que él y saber qué hace falta.
4. Guardar un cambio para reaccionar en el llamado propio.
5. Apertura alta que ahorra un intento contra el riesgo de quedar sin marca.

### 6.4 Techo, forma del día y Resto

- **Techo del día**: lo máximo que el pesista puede levantar con ejecución limpia. Es su techo de ficha más la **forma del día**, entre −2 y +2 kg por levantamiento, sembrada por partida. El calentamiento muestra solo el signo. Evita que la partida sea una cuenta resuelta.
- **Resto**: un medidor de 0 a 100 por pesista, visible para los tres. Es el cansancio.
- **Techo del momento**: el techo del día menos 1 % por cada 20 puntos de Resto perdidos. Con este número se calcula la intensidad de cada intento. Diez puntos de Resto son cerca de 1 kg.

| Concepto | Valor inicial |
|---|---|
| Resto al empezar | 100 (el guion de la final puede bajarlo, sección 7.3) |
| Costo de un intento | 6 en arranque, 8 en dos tiempos |
| Intensidad alta | 1 punto más por cada punto de intensidad sobre el 95 % |
| Pelea | 0,5 por cada toque que vale y 3 por cada segundo con la aguja fuera de la franja, con tope de 15 |
| Intento nulo o fallado | 8 puntos más |
| Envión | Power 6 menos; squat 4 más |
| Recuperación | 5 puntos por cada intento ajeno entre dos propios; 1 si se sigue a sí mismo; 15 en el intervalo. Nunca pasa de 100 |
| Fondo del pesista | Multiplica todos los costos (sección 7.2) |

Un intento limpio con rivales levantando en el medio no cansa: lo que cansa son las peleas, los nulos, los pesos altos y seguirse a uno mismo. Un nulo peleado al 100 % cuesta unos 30 puntos, es decir unos 3 kg de techo para el intento siguiente si no hay nadie en el medio.

Amagar y esperar con la barra en los hombros no gastan Resto: ya los limitan el reloj y los 8 segundos.

### 6.5 Intentos con etiqueta

El juego calcula cuándo un intento es decisivo y lo trata distinto:

| Etiqueta | Cuándo | Tratamiento |
|---|---|---|
| Para pasar al frente | Un válido lo deja primero por ahora | Zócalo en el tablero |
| A todo o nada | Tercer intento sin marca en ese levantamiento | Público en silencio y primer plano |
| Para medalla / Para el oro | Último intento que define un puesto | Primer plano, respiración, público callado, luces lentas y repetición larga |
| Récord | Kilos por encima del récord ficticio | Cartel y distintivo en la tabla |

### 6.6 Cómo cierra una final (ejemplo)

El jugador maneja a Ventura. Tras el arranque van Brenner 171, Ventura 165 y Marangi 165. Las aperturas llevan la variación sembrada de la sección 7.3.

| # | Barra | Pesista (intento) | Qué pasa | Total |
|---|---|---|---|---|
| 10 | 192 | Brenner (1) | Tijera segura. Su plan declara 197 | 363 |
| 11 | 196 | Marangi (1) | Power rápido. Declara 201 | 361 |
| 12 | 197 | Brenner (2) | Codo dudoso, 2 a 1. Declara 201 | 368 |
| 13 | 198 | Ventura (1) | Squat limpio. El plan declara 202; en su llamado siguiente el jugador lo sube a 204 para asegurar la plata | 363 |
| 14 | 201 | Marangi (2) | Sale antes que Brenner por tener menor número de intento. Válido. Declara 206 | 366 |
| 15 | 201 | Brenner (3) | Peleado, 2 a 1. Termina y lidera | 372 |
| 16 | 204 | Ventura (2) | Marangi cambió de 206 a 208. El jugador pelea la subida y la saca. El plan declara 207 | 369 |
| — | 207 | Ventura (3), llamado | La cuenta dice que el oro pide 208 y el jugador sube a 208. A igual peso sale antes Marangi, que hizo antes su segundo intento: el llamado de Ventura queda desplazado | |
| 17 | 208 | Marangi (3) | «Para el oro». Empuja el bloqueo: 1 a 2 | 366 |
| 18 | 208 | Ventura (3) | «Para el oro». Cargada con buen ritmo, pelea, squat al fondo, otra pelea, aguanta hasta la chicharra. Blanca, roja, blanca | **373** |

Oro por un kilo en el último intento de la noche. El orden por kilos dejó al mejor en dos tiempos para el final; asegurar 204 dio la plata antes de ir por el oro; y con 207 no alcanzaba, porque daba 372 y Brenner había llegado primero a ese total.

---

## 7. Los tres pesistas y sus rivales

### 7.1 Fichas

Los techos quedan a 2 kg entre sí y los atributos suman lo mismo (28) a propósito: la final se define por estrategia y ejecución, y ninguno es mejor que otro en todo. Los tres son inventados; ningún nombre, cara ni marca corresponde a una persona real.

| | Dario Ventura | Ilya Brenner | Teo Marangi (nuevo) |
|---|---|---|---|
| País | Arxenia | Novakia | Pelagia |
| Dorsal | 7 | 12 | 3 |
| Biotipo | Compacto, 1,70 m, fémur y brazos cortos | Largo, 1,83 m, fémur y brazos largos | Potente, 1,76 m, torso largo y hombros anchos (proporciones a definir en la etapa 3; hoy son una estimación) |
| Techo de arranque / dos tiempos | 169 / 211 (380) | 175 / 207 (382) | 172 / 209 (381) |
| Aperturas habituales | 158 / 197 | 165 / 195 | 160 / 194 |
| Enviones que domina (el primero es el de la casa) | Squat y tijera | Tijera y power | Power y tijera |
| Técnica / Temple / Garra / Fondo | 9 / 6 / 6 / 7 | 7 / 8 / 5 / 8 | 5 / 9 / 9 / 5 |
| Papel en la final | Queda atrás en el arranque y remonta en el dos tiempos | Sale puntero en el arranque y llega con lo justo al dos tiempos | Irregular; nunca está muerto |
| Personalidad | «El relojero»: sobrio, rutina idéntica, festeja con el puño apretado | «El calculador»: frío, casi no festeja, juega con los kilos | «El showman»: grita, pide aplausos, festeja todo |
| Cómo suele fallar | Se queda sentado en la cargada; pierde atrás en el squat | Pierde adelante en el arranque; codo blando en la tijera | Bloqueo empujado en el power |

Estas fichas son del juego y viven en `web/data/sim.json` y en `web/js/game/roster.js`. Las del visor (`web/js/config.js`: Ventura en 81 kg y Brenner en 96 kg, con otros kilos) no se tocan en la etapa 1.

### 7.2 Atributos

Van de 1 a 10 y valen igual para el jugador y para los rivales. Cada uno actúa en un solo lugar del cálculo.

| Atributo | Efecto | Ventura | Brenner | Marangi |
|---|---|---|---|---|
| Técnica | Las ventanas de tiempo se multiplican por 1 + 0,10 × (Técnica − 7) | 1,20 | 1,00 | 0,80 |
| Temple | En los intentos con etiqueta, las ventanas se multiplican además por 1 + 0,08 × (Temple − 7) | 0,92 | 1,08 | 1,16 |
| Garra | El esfuerzo propio en la pelea es 0,45 + 0,02 × (Garra − 6) | 0,45 | 0,43 | 0,51 |
| Fondo | Los costos de Resto se multiplican por 1,4 − 0,05 × Fondo | 1,05 | 1,00 | 1,15 |

Así cada pesista se juega distinto:

- **Ventura** perdona el ritmo, pero se achica un poco cuando el intento es decisivo.
- **Brenner** no regala ni castiga nada en el ritmo, crece bajo presión y es el que menos se cansa: gana eligiendo bien los kilos.
- **Marangi** exige precisión y se cansa rápido; a cambio pelea como nadie y en el intento decisivo es el mejor.

### 7.3 Cómo juegan los rivales

**No hay ayuda oculta.** Los rivales pasan por el mismo cálculo del intento que el jugador, con los mismos atributos aplicados una sola vez. La diferencia es que sus gestos los genera el juego a partir de la semilla:

| Gesto generado | Regla inicial |
|---|---|
| Error de tiempo en cada gesto | Al azar sembrado, con un desvío típico que depende solo del nivel de dificultad: 55 ms en Amistoso, 36 ms en Normal y 27 ms en Difícil. La Técnica y el Temple ya actúan por las ventanas, igual que para el jugador |
| Pelea | Apunta al centro de la franja verde con un error sembrado de 0,06 de esfuerzo (0,09 en Amistoso, 0,04 en Difícil). Puede tocar hasta 6 veces por segundo, como una persona. Entra al rojo solo si no cruza el estancamiento |
| Chicharra | Siempre espera. Sus nulos vienen de los codos y del temblor, no de soltar antes |

Por eso los rivales fallan con las mismas causas visibles que el jugador, y un servidor puede recalcular sus intentos.

**Deciden con lo que se ve.** Para elegir kilos usan los techos de ficha, el Resto y el signo de la forma del día: lo mismo que ve el jugador. Nunca usan el techo exacto de nadie, ni el propio.

| | Ventura | Brenner | Marangi |
|---|---|---|---|
| Apertura habitual | 93,5 % | 94 % | 93 % |
| Saltos planeados (arranque / dos tiempos) | +5, +3 / +6, +4 | +5, +5 / +5, +4 | +5, +5 / +5, +5 |
| Hasta cuánto pide por necesidad | 101 % del techo visible | 100,5 % | 103 % |
| Tras un nulo | Repite | Repite | Repite o sube 1 |
| Cambios | Casi nunca | Pasa al rival por un kilo para salir después; declara alto y baja | Sube por orgullo si lo pasan; nunca asegura |

**Cada final es distinta.** La semilla mueve la apertura de cada rival entre el 91 % y el 96 %, y cada salto en ±1 kg. Además elige un **guion**, que se anuncia en la presentación:

| Guion | Efecto, a la vista de todos |
|---|---|
| Sin novedades | Ninguno |
| Uno llega tocado | Ese pesista empieza con 85 de Resto |
| Uno llega en su mejor forma | Su forma del día es +2 en los dos levantamientos, y se sabe |

Tercer intento:

- Si lo que necesita para subir un puesto está dentro de su umbral, pide exactamente eso.
- Si no, pide lo máximo que mejora su total sin pasar del 99 %.
- Si va puntero, pide lo que obliga al perseguidor a pasar del 100 % de su techo visible, con tope en el 100 % propio.

Otras reglas:

- **El cuerpo avisa.** Con Resto alto, la rutina es completa y firme. Con Resto bajo, el rival tarda más en el magnesio, resopla y mira el piso. Le da información al jugador (necesita animaciones de la etapa 4; antes, se lee en el medidor de Resto).
- **La presión se ve.** Cada cambio de un rival aparece en el tablero con sonido y cartel («Novakia cambia a 203») y el locutor nombra la cuenta.

**Dificultad.** Se ajusta la calidad del rival, nunca las reglas.

| Nivel | Rivales |
|---|---|
| Amistoso | Errores de tiempo de 55 ms y pelea imprecisa. Es el nivel de la primera partida |
| Normal | Errores de 36 ms. Forma del día sembrada, como el jugador |
| Difícil | Errores de 27 ms y 1 kg más de forma |

Metas para ajustar esos números: en Normal, cada rival termina con 55 a 70 % de intentos válidos por final, y su total varía al menos 4 kg entre una final y otra. Si los rivales no fallan, la final la decide la forma del día y no el juego.

---

## 8. Presentación

### 8.1 Cámaras

Se usan las cámaras y los primeros planos que ya existen en `web/js/cameras.js`.

| Momento | Cámara | Notas |
|---|---|---|
| Llamado | Primer plano de la cara, después la cámara del intento | Con la placa del pesista |
| Tensión, tirón y recepción | 3/4 fija en horizontal; **lateral o casi lateral en vertical**, donde la 3/4 deja al pesista demasiado chico | **Nunca hay corte mientras una ventana de tiempo está abierta** |
| Pelea | La misma, cerrándose despacio | Sin corte; viñeta que se oscurece en el estancamiento |
| De pie | Plano de brazos y barra | Hasta la chicharra |
| Luces | Reversa, con el público de frente, o tablero | |
| Repetición | Lateral a un cuarto de velocidad, con la traza de la barra | Reproduce lo que se dibujó en el intento, no el clip fijo (sección 9.4). En un fallo marca el instante del error |
| Cambio de carga | Cenital | Los ayudantes y la barra |
| Podio | General de los tres; primer plano de uno por vez | |

El golpe de cámara en la recepción (2 píxeles) se apaga si el sistema pide reducir movimiento.

### 8.2 Gráfica de TV

- **Zócalo** del pesista: nombre, país, dorsal, intento y kilos. Ya existe.
- **Reloj** y **tres luces**. Ya existen, en pantalla y en el escenario. Las luces pasan a encenderse de a una: cada 0,4 s, o cada 0,8 s en los intentos con etiqueta.
- **Tablero de clasificación**: los tres, sus seis intentos, total y puesto. Cada cambio de kilos de un rival aparece ahí.
- **La cuenta**: una línea con lo que hace falta para cada medalla.
- **Medidores de Resto** de los tres.
- **Etiqueta** del intento, cuando corresponde.
- **Ayudas del intento**, pegadas a la barra: anillo de tensión, línea de potencia, anillo de recepción que se cierra sobre la barra, palabra de resultado del gesto («PERFECTO», «BIEN −40 ms», «TARDE»), medidor de pelea, «¡AGUANTÁ!» y «¡ABAJO!».
- **Recuadro del rival**: bandera, dorsal y una línea de texto con su reacción al intento del jugador, porque solo hay un pesista dibujado en 3D a la vez. El retrato con expresión llega con las expresiones de cara (sección 10.3).

### 8.3 Sonido, gemelo visual y vibración

Mucha gente juega sin sonido: ningún aviso depende solo del audio.

| Evento | Sonido | Gemelo visual | Vibración (donde el teléfono la permite) |
|---|---|---|---|
| Tensión | Respiración; el murmullo baja | Anillo de tensión | — |
| Despegue | Discos que despegan, gruñido corto | — | 10 ms |
| Explosión | Golpe de cadera, sacudida de discos | Destello en la línea de potencia | 20 ms si fue perfecta |
| Recepción | Golpe de recepción, en el instante del ancla | Anillo que se cierra sobre la barra | 30 ms |
| Pelea | Grito sostenido que sube; público que crece; latido en zona roja | Medidor de pelea | Un pulso por toque que vale |
| Estancamiento | El público contiene el aire | Viñeta y franja que sube | — |
| Chicharra | Chicharra | «¡ABAJO!» y destello del marco | 40 ms |
| Luces | Un clic por lámpara; ovación o lamento | Las lámparas | — |
| Fallo | Golpe de discos contra la tarima | Texto con la causa | 60 ms |
| Cambio de un rival | Aviso corto | Cartel en el tablero | — |

El golpe de recepción sincronizado es la mejor guía de ritmo que tiene el jugador: el sonido mínimo entra en la etapa 1 aunque el audio completo sea de la etapa 6.

### 8.4 Festejos y lamentos

Hay tres niveles de festejo, modulados por la personalidad con reglas y no con animaciones a medida por personaje:

| Nivel | Cuándo | Duración |
|---|---|---|
| Corto | Válido normal | 1,5 s |
| Medio | Pasa al frente o hace récord | 3 s |
| Largo | Gana el oro; entra el entrenador | 6 s |

- Durante el festejo el jugador puede tocar repetido: el público responde. Es solo presentación y no cambia ningún número.
- Lamentos: frustración contenida, quedarse mirando la barra, aplaudir al rival que lo dejó afuera.
- Un válido peleado tiene repetición más larga y festejo un nivel más alto.

### 8.5 Ayudantes

Dos ayudantes entran cuando cambia el peso, sacan los collarines, calzan o retiran discos y salen. Son el respiro dramático: en esos 4 segundos se ven La cuenta y la repetición del intento anterior. Usan una malla más simple que la de los pesistas y el mismo esqueleto.

### 8.6 Podio, medallas y foto

1. Clasificación final en la pantalla gigante (5 s).
2. Llamado al podio: bronce, plata y oro. Cada uno sube con su festejo (20 s).
3. Una autoridad ficticia cuelga las medallas (15 s).
4. Himno del país campeón: 12 a 15 segundos instrumentales y originales, con las tres banderas subiendo. Hay tres himnos, uno por país; ninguno puede parecerse a un himno real.
5. Foto: plata y bronce se acercan al oro, flash y cuadro congelado como foto oficial, con evento, total y fecha.
6. Pantalla final: totales, menciones, récords, posición en la tabla y botones de Guardar foto, Revancha y Cambiar pesista.

La foto se exporta como imagen. Es el recuerdo para compartir y no necesita servidor.

Versión base de la foto: los tres juntos sin tocarse. El abrazo en el escalón del oro es la versión cara (sección 12, pregunta 6).

### 8.7 Presupuesto de imagen

| Escena | Dibujado en 3D | Regla |
|---|---|---|
| Levantamiento | Un pesista, la barra, la arena y el público | Como hoy |
| Cambio de carga | Dos ayudantes (hasta 12 mil triángulos cada uno) | Entran sobre el plano cenital, con el pesista fuera de cuadro |
| Podio y foto | Tres pesistas en detalle bajo, con texturas de 1024 | Los tres juntos solo en plano general. Depende de la meta de 4 MB por modelo de la etapa 3; antes, el podio es 2D |

Presupuesto por cuadro en un teléfono de gama media. Son valores iniciales sin medir: la primera medición en un teléfono real los corrige.

| | Levantamiento | Podio |
|---|---|---|
| Llamadas de dibujo | Hasta 150 | Hasta 250 |
| Triángulos | Hasta 200 mil | Hasta 150 mil (tres pesistas a 30 mil más la arena) |
| Tiempo de GPU por cuadro | Hasta 12 ms | Hasta 25 ms |
| Memoria de GPU | Hasta 120 MB | Hasta 200 MB |

En el teléfono:

- **Escalón de calidad «móvil»**, debajo de «baja»: resolución de hasta 1,5 veces la de la pantalla, MSAA 2, sombra de 512 y texturas de 1024. La «baja» de hoy (resolución doble, MSAA 4 y sombra de 1024) no está pensada para un teléfono.
- **Durante el intento propio no se capa a 30 cuadros**: dos cuadros a 30 son la ventana perfecta entera. Ahí el objetivo es 60 y se baja la resolución antes que los cuadros. El tope de 30 vale en paneles, tableros e intentos ajenos, y detrás de los paneles la imagen queda congelada.
- **Los dos modelos quedan en memoria** con texturas de 1024, en vez de soltar y volver a subir texturas en cada cambio de pesista (hasta 17 veces por partida). Marangi comparte la instancia de Brenner.
- **Registrador de cuadros por segundo** integrado, que guarda mínimo y mediana por tramo de la partida.
- **Condición antes de ajustar ventanas**: una partida entera medida en el teléfono del usuario. Hoy no hay ninguna medición en teléfono, y en una laptop solo la calidad baja sostiene 60 cuadros.

Deuda conocida: los dos modelos pesan 21 MB de descarga contra la meta de 10 MB. Hasta la etapa 3, el menú responde antes de que carguen y el segundo modelo baja durante el calentamiento.

---

## 9. Técnica

### 9.1 Principios

1. **El resultado lo calcula un núcleo aparte**, sin three.js, sin página y sin animaciones. El mismo archivo corre en el navegador, en las pruebas y en el servidor.
2. **El cliente manda lo que el jugador tocó, nunca un resultado.** El servidor lo recalcula.
3. **El núcleo es una función pura de la lista de eventos**, y solo usa números enteros. Los eventos llevan su instante en milisegundos desde el llamado. La pelea se integra a 120 pasos por segundo. Las fórmulas de este documento están en decimales para leerlas; el núcleo las implementa en enteros, que dan exactamente lo mismo en todos los navegadores.
4. **El visor sigue pasando su prueba.** El juego entra por `web/juego.html`; `web/index.html` sigue siendo el visor con el que se evalúa el arte. Los archivos compartidos cambian (sección 9.5), pero cada cambio es una opción nueva que el visor no usa, y `tools/check_viewer.mjs` tiene que seguir en verde sin tocarla.
5. **La etapa 1 no pide ninguna animación ni ningún modelo nuevo**, y lo paga con cortes y con texto (sección 11.2). El juego busca cada segmento por nombre en `poses.json`; si no está, usa un corte de cámara. Cuando el arte entrega un segmento, el juego lo toma sin cambiar código.

### 9.2 Máquina de estados de la partida

```
INICIO → CALENTAMIENTO → PRESENTACIÓN → SESIÓN (arranque) → INTERVALO
       → SESIÓN (dos tiempos) → CLASIFICACIÓN → CEREMONIA (podio → medallas → foto) → FIN

SESIÓN, hasta que nadie tenga intentos:
  ORDEN → [CARGA si cambia el peso] → LLAMADO (panel y cambios) → INTENTO → REACCIÓN
        → DECLARACIÓN automática → cambios de los rivales
```

Carga, reacción y ceremonia no tienen lógica: el núcleo las resuelve al instante y la presentación las muestra. El núcleo no conoce la duración de un festejo ni de los ayudantes, así que el arte los cambia sin alterar ningún resultado.

### 9.3 Máquina de estados del intento

| Estado | Qué corre | Sale con |
|---|---|---|
| Llamado | Reloj; panel de kilos | Confirmar pasa a Acomodo. Un cambio que altera el orden cierra el llamado como desplazado. Reloj en cero: nulo |
| Acomodo | `Parado` a `Salida` (1,2 s) | Solo |
| Tensión | Quieto en `Salida`; anillo | Apretar y mantener pasa a Tirón |
| Tirón | De `Salida` hacia `Segundo tirón`, a la velocidad que da la intensidad; pasado el objetivo, a 0,6 veces | Soltar. Antes de la rodilla: amague, vuelve a Tensión. Entre la rodilla y el límite temprano, o sin soltar al límite tardío: fallo |
| Vuelo | Hasta `Recepción`, con el calendario fijado por el soltar | Apretar dentro del límite pasa a Pelea. Si la altura o el desvío no alcanzan, o cierra el límite sin toque: fallo |
| Pelea | Avance entre el fondo y la posición de pie; en el arranque, también la traba | De pie, o fallo |
| Hombros (solo dos tiempos) | Quieto; anillo. La entrada se ignora 450 ms | Apretar y mantener pasa a Flexión. A los 8 s: fallo |
| Flexión | De la barra en los hombros a `Envión · Dip`; espera en el fondo | Soltar. Antes del límite temprano: amague, vuelve a Hombros |
| Empuje | Hasta la recepción del envión elegido | Apretar; después Traba si quedó blando, o Pelea si es squat |
| Fijación | Quieto, de pie | Apoyo firme arma la espera. Soltar antes de la chicharra, o 2 s sin apoyo firme: nulo. Después: Bajada |
| Decisión | Luces | Válido o nulo |

**Causalidad.** Un evento puede llegar con fecha anterior a lo que ya se dibujó: hasta un cuadro, más la corrección de atraso. Por eso:

- El reloj del intento se ancla al reloj de alta resolución del navegador y nunca se recorta. El bucle del visor de hoy recorta cada cuadro a 50 ms; el juego no hereda ese recorte.
- La presentación demora toda ramificación irreversible (un fallo por falta de toque, el cierre de una ventana) lo que mide la corrección de atraso más un cuadro. Lo reversible se dibuja en el momento.
- El núcleo no decide nada en vivo que después pueda contradecir: recalcular la lista completa de eventos da siempre lo que se mostró.

### 9.4 Uso de `poses.json` y de los tiempos por muestra

- **Las ventanas se anclan por segmento y nombre de fase**, nunca por índice ni por nombre solo: `Recuperación` existe en la cargada, en el arranque y como primera pose de cada envión. Las anclas son `snatch/Salida`, `snatch/Primer tirón` (rodilla), `snatch/Segundo tirón`, `snatch/Recepción`, las mismas cuatro de `clean`, `split/Envión · Dip`, `split/Envión · Tijera`, `power/Power jerk · Recepción`, `squat/Squat jerk · Recepción` y `squat/Squat jerk · Fondo`.
- Una herramienta nueva, `tools/build_sim_data.mjs`, lee los tiempos por muestra (`tt`) de `poses.json`, los convierte a milisegundos enteros y escribe `web/data/sim.json` con su huella. Ahí van también los techos y atributos de los pesistas.
- **`sim.json` se versiona por temporada.** Dentro de una temporada no cambia: si el arte retoca un clip, la presentación lo acomoda a los tiempos publicados y el build avisa si se aleja más de 8 %. Entre temporadas sí cambia, y está previsto que cambie: al cerrar la etapa 3 (Marangi con cuerpo propio) y al cerrar la etapa 4 (ritmo corregido contra video, porque la referencia manda). Cada temporada tiene su tabla de posiciones, y el servidor guarda todos los `sim.json` publicados para poder recalcular partidas viejas.
- **La pelea** mueve la animación entre la pose del fondo y la de pie según el avance, hacia adelante o hacia atrás. Cuerpo y barra salen de la misma muestra, así que la barra nunca se separa de las manos. De paso tapa el único defecto de ritmo marcado «mal» en `HANDOFF.md` (la subida demasiado rápida), porque la velocidad la pone la pelea.
- **Los cambios a otra animación y las esperas ocurren solo en poses de reposo instantáneo**, donde el cuerpo pasa con velocidad cero (`hold` en `blender/poses.py`): la salida, la recepción del arranque, la amortiguación de la cargada, el fondo de la flexión, la tijera, la recepción del power y el fondo del squat. Fuera de esas poses el clip puede cambiar de ritmo, pero no detenerse (sección 3.5).
- **La flexión de la barra** deja de leer la aceleración de la línea de tiempo y la calcula con la posición que realmente se dibuja, porque el ritmo ahora es variable.
- **La repetición** tampoco puede salir de la línea de tiempo fija, como hoy: `sequence.js` graba la secuencia de muestras que se dibujó en el intento y la traza de la barra acepta esa lista de puntos.
- **Capas de esfuerzo** por código: temblor de cadera de hasta 4 mm (la barra recibe el mismo desplazamiento que las manos), vibración de la barra, cabeza y cuello, y sudor en la piel con los parámetros que ya tiene el material. Ninguna capa rota columna, hombros ni brazos mientras la barra está en las manos. Consecuencia: en la etapa 1 los codos blandos no se pueden dibujar (sección 11.2).

### 9.5 Módulos

Núcleo, en `web/js/sim/`. Una prueba rechaza cualquier función matemática que no sea exacta, cualquier lectura de reloj y cualquier dependencia externa.

| Archivo | Contenido |
|---|---|
| `fixed.js` | Enteros, generador sembrado, mezcla de semillas, huella |
| `rules.js` | Reglamento, tabla de anclas y ventanas, balance |
| `data.js` | Lectura de `sim.json` |
| `attempt.js` | Máquina del intento: salta de evento en evento y solo integra paso a paso dentro de la pelea |
| `ai.js` | Declaraciones, cambios y gestos generados de los rivales, en el mismo formato que los del jugador |
| `match.js` | Máquina de la partida: orden, llamados, declaraciones, clasificación, La cuenta |
| `replay.js` | Recalcula una partida entera desde su registro. Lo usan el servidor y las pruebas |

Presentación, en `web/js/game/`:

| Archivo | Contenido |
|---|---|
| `main.js` | Entrada de `juego.html`, carga y bucle sin recorte de tiempo |
| `roster.js` | Plantel del juego: nombre, país, bandera, dorsal y qué modelo usa cada uno. Marangi apunta al modelo de Brenner |
| `input.js` | Teclado, puntero y táctil convertidos en eventos con su instante; fuente de tiempo inyectable para las pruebas |
| `director.js` | Cola de tomas: clip, cámara, gráfica y condición de fin; corte de reemplazo cuando falta un segmento |
| `sequence.js` | Tramos de animación, ritmo variable, cambios de clip y grabación de lo dibujado para la repetición |
| `cast.js` | Qué personaje está descargado, en memoria o dibujado; precarga del siguiente |
| `effort.js` | Capas de esfuerzo |
| `loosebar.js` | Barra suelta una vez que tocó la tarima (rebote y rodadura) y carga animada de discos |
| `perf.js` | Registrador de cuadros por segundo y escalón de calidad «móvil» |
| `ui/` | Pantallas: inicio, kilos, medidores, botón táctil, clasificación y resultado |

Archivos de hoy que cambian. Cada cambio agrega una opción; el comportamiento por defecto, que es el del visor, queda igual.

| Archivo | Cambio |
|---|---|
| `web/js/main.js` | Se extrae a `web/js/stage.js` el armado del escenario, para compartirlo con el juego. Conviene hacerlo primero, antes de abrir las ramas de juego y de arte |
| `web/js/timeline.js` | Construcción desde una lista de tramos; la versión de hoy queda como caso particular |
| `web/js/athlete.js` | Mezcla de dos poses ya mezcladas, punto de enganche para las capas de esfuerzo y color plano de tela sobre la máscara (para Marangi) |
| `web/js/barbell.js` | Carga animada por lado, aceleración desde la posición dibujada, barra suelta |
| `web/js/cameras.js` | Opción `interactive: false`: hoy la cámara registra arrastre y rueda sobre el mismo lienzo que en el juego es el botón, y mantener apretado la orbitaría |
| `web/js/trace.js` | La traza acepta una lista de puntos además de una línea de tiempo |
| `web/js/hud.js` | Se separa la gráfica de TV de la consola del visor. Decisión parcial: una luz en `null` queda apagada (hoy cualquier valor falso se pinta rojo) |
| `web/js/arena.js` | Tablero en modo clasificación, la misma decisión parcial para encender las luces de a una, y ánimo del público |

No se tocan en la etapa 1: `blender/`, `web/models/`, `web/data/poses.json`, `web/js/config.js` (el visor arma sus botones con la lista de atletas de ese archivo y su prueba los aprieta por nombre) y `tools/check_viewer.mjs`.

### 9.6 Registro de partida y validación en servidor

```jsonc
// Partida
{ "v": 2,
  "sim": "1.0",            // versión de reglas y balance
  "datos": "a1b2c3d4",     // huella de sim.json
  "temporada": 1,
  "semilla": 3735928559,   // solo en partidas locales; en el online nunca llega al cliente
  "cal": 40,               // corrección de atraso en ms (0 a 100), fija para toda la partida
  "nivel": "normal",
  "atletas": [ { "id": "ventura", "ctrl": "persona", "jugador": "u_123" },
               { "id": "brenner", "ctrl": "juego" },
               { "id": "marangi", "ctrl": "juego" } ],
  "aperturas": [ { "s": 158, "c": 197 }, { "s": 165, "c": 195 }, { "s": 160, "c": 194 } ],
  "llamados": [ /* en el orden en que ocurrieron */ ] }

// Llamado: una entrada cada vez que arranca el reloj de alguien
{ "a": 0, "lev": "s", "n": 2, "kg": 162,
  "cambios": [[8300, 163]],       // ms desde el llamado y kilos nuevos
  "fin": "intento",               // "intento", o "desplazado" si un cambio alteró el orden y salió otro
  "env": "squat",                 // solo en dos tiempos
  "ent": [[11020, 1], [11746, 0], [12486, 1]],  // ms desde el llamado; 1 = se apoya un contacto, 0 = se levanta
  "int": 0 }                      // interrupciones perdonadas en este llamado
```

- El registro es de **llamados**, no de intentos: así entra el llamado que terminó desplazado por un cambio, con sus cambios y sin gestos.
- Resultado, luces, causa del fallo y tabla **nunca viajan**: se recalculan.
- Los llamados de los rivales figuran solo con pesista, levantamiento y número. Sus kilos, sus cambios y sus gestos los genera el núcleo, y el recálculo verifica que el orden coincida.
- La declaración automática no se registra: sale del reglamento.

**Semillas.** De la semilla salen la forma del día, los umbrales de los jueces, el instante de la chicharra y los gestos de los rivales.

- En una partida local, la semilla de cada llamado se deriva de la de la partida con código público. Ahí no hay nada que proteger.
- En el online, la semilla de cada llamado es una firma hecha con un secreto del servidor (HMAC) y se entrega **recién al abrir ese llamado**, también para los rivales. La de la partida no llega nunca al cliente. Si no, un cliente modificado conocería por adelantado la forma del día, la chicharra y todos los intentos futuros de los rivales.
- Límite que queda: lo del llamado en curso sí lo conoce el cliente (por ejemplo, cuándo va a sonar la chicharra).

**Compromisos del online.**

- La corrección de atraso se fija antes de recibir la primera semilla. No se puede elegir después de jugar.
- Cada llamado se abre una sola vez. Tiene un plazo máximo (el reloj, más la duración del intento, más un margen); si no llega el envío, es nulo. Así no se puede abrir, ensayar el intento sin conexión y mandar el mejor.
- El servidor verifica versión, huella y temporada, que el llamado sea el que toca, que los kilos y los cambios sean válidos, que los instantes sean crecientes y de largo acotado, y que el tiempo real entre abrir y enviar no sea menor que el jugado. Recalcula y guarda lo que le da a él.
- En una final compartida entre personas, las aperturas quedan selladas en el servidor hasta que estén todas, y cada persona cambia kilos solo en su propio llamado. Es la misma regla que en solitario, así que el reglamento no cambia.

**Tabla de posiciones.** Con techos de unos 380 kg los totales posibles son pocos y se empatan arriba. La tabla ordena por:

1. Puesto en la final (oro, plata, bronce, sin marca).
2. Total como porcentaje del total de ficha del pesista, para que elegir pesista no decida.
3. Menor error medio, en milisegundos, de los gestos con ventana.
4. Quien lo registró primero.

En la final del día cuenta una sola partida por persona y por día; las demás son práctica. El guion y la forma del día son los mismos para todos, pero los gestos de los rivales se siembran por jugador: saber cómo le fue a otro no sirve.

Cambiar el balance o `sim.json` cambia la versión, la huella o la temporada; la tabla se separa por ese conjunto.

Límite conocido: recalcular prueba que el resultado es íntegro, no que jugó una persona. Se suma el tope de toques, el tiempo real mínimo y una marca de sospecha cuando el ritmo es demasiado regular. No hay solución completa.

### 9.7 Pruebas

- **`tools/sim_test.mjs`**, sin navegador y en pocos segundos: partidas de referencia con resultado guardado; igualdad entre jugar en vivo y recalcular; mil partidas al azar que siempre terminan, respetan el orden de salida y nunca bajan la barra; registros adulterados que se rechazan. Una corrida larga de diez mil partidas queda aparte, a pedido.
- **Informe de balance**: jugadores simulados y su porcentaje de válidos por intensidad. Es la herramienta para ajustar todos los números de este documento sin cargar ninguna máquina. **Las metas mandan**: si un valor inicial no las cumple, se cambia el valor.

Metas, con todo el intento (gestos y pelea):

| Intensidad | Experto (error típico de 25 ms) | Hábil (40 ms) | Casual (60 ms) |
|---|---|---|---|
| 90 % | 99 % de válidos | 97 % | 85 % |
| 95 % | 97 % | 90 % | 60 % |
| 100 % | 85 % | 60 % | 25 % |
| 103 % | 50 % | 30 % | 5 % |
| 106 % | 10 % | 3 % | Menos de 1 % |

Primera cuenta con los valores iniciales de este documento (solo arranque, 150 intentos por casilla, pelea con control simulado):

| Intensidad | Experto | Hábil | Casual |
|---|---|---|---|
| 90 % | 100 % | 99 % | 89 % |
| 95 % | 100 % | 95 % | 73 % |
| 100 % | 96 % | 78 % | 47 % |
| 103 % | 91 % | 64 % | 31 % |
| 106 % | 81 % | 41 % | 17 % |

Lo que dice esa cuenta: hasta el 95 % los valores están cerca; **del 100 % para arriba el arranque sale demasiado fácil**. El dos tiempos no está medido; tiene cuatro gestos con ventana en vez de dos y la exigencia completa, así que va a dar menos. Orden previsto de ajuste: primero la rebaja de 0,08 de exigencia del arranque, después lo que cada centímetro perdido suma a la exigencia, y recién al final las ventanas.

El informe incluye además dos jugadores que no deberían ganar:

| Jugador simulado | Meta |
|---|---|
| Machacador (7 toques por segundo siempre) | Menos de 30 % de válidos a cualquier intensidad hasta el 100 % |
| Metrónomo (un ritmo fijo, el mejor que encuentre) | Menos de 50 % de válidos promediando del 85 al 106 % con los errores de un jugador hábil |

- **`tools/check_game.mjs`**, con el mismo patrón que la prueba del visor:
  - Juega una partida completa por la vía real de entrada, con el reloj inyectado: la prueba adelanta el tiempo y la partida entra en menos de un minuto. Una vez con teclado y otra con toques en tamaño de teléfono.
  - Juega además un intento corto en tiempo real por cada vía, para probar el reloj verdadero.
  - Verifica que no haya errores de consola ni pedidos externos, que se visiten todos los estados, que la barra nunca quede bajo la tarima ni separada de las manos, y que el registro exportado dé la misma tabla al recalcularlo.
  - No mide cuadros por segundo: la sesión cloud dibuja por software. La prueba del visor pide hoy una GPU concreta al lanzar el navegador; la del juego no puede depender de eso.

### 9.8 Riesgos

| Riesgo | Qué se hace |
|---|---|
| El atraso de la pantalla táctil frente a ventanas de 30 ms | El ritmo lo inicia el jugador, los instantes se toman del evento, hay calibración por dispositivo y el piso de ventanas se aplica al final |
| No hay ninguna medición en teléfono | Registrador integrado y una partida medida en el teléfono del usuario antes de ajustar ventanas (sección 8.7) |
| El teléfono se calienta en una partida | Final exprés por defecto, tope de 30 cuadros fuera del intento propio, imagen congelada tras los paneles, cambios de calidad solo en los cortes |
| Los valores iniciales no cumplen las metas de dificultad | Ya se sabe que no (sección 9.7). El informe de balance se escribe antes que la presentación |
| Marangi provisional muestra la cara de Brenner | Se acepta hasta la etapa 3. Tela de color plano para tapar el nombre y el código horneados; sin primeros planos de su cara |
| Brazos libres, barra suelta y marcha no existen en el sistema de poses | Son el camino crítico de todas las animaciones nuevas: estimarlos antes de prometer fechas |
| Festejos y caminatas hechos por reglas pueden verse rígidos | El plan ya prevé captura de movimiento desde video; decidirlo antes de la segunda tanda de animaciones |
| Códigos de país que coinciden con marcas o entidades reales | Se cambian antes de publicar, con búsqueda uno por uno (sección 6.1) |

---

## 10. Animaciones nuevas para la pista de arte

Antes de cualquier segmento nuevo hace falta trabajo de sistema en `blender/poses.py`:

- **Brazos libres**: hoy los brazos salen siempre de la barra, salvo en `Parado`.
- **Codos sin trabar con la barra arriba**: hoy todo clip con la barra sobre la cabeza tiene los brazos trabados. Sin esto no se puede mostrar un nulo por codos.
- **Barra suelta**: caída calculada desde que las manos la dejan hasta el primer contacto con la tarima, con el chequeo de barra contra malla que ya existe.
- **Marcha**, sobre la regla de pasos que ya usan la tijera y la recuperación.
- **Chequeos nuevos** en `check()`: mano contra cuerpo sin barra, y corredor de caída de la barra. Una vista por segmento en `WANT`.
- **Dos poses de enlace**: `Parado atrás` (de pie un paso detrás de la barra, brazos libres; ahí terminan bajadas y fallos y empiezan festejos) y `Espera` (de pie fuera de la tarima).

Cada segmento se genera con reglas para los tres biotipos. Cada fallo y cada festejo necesita video en `docs/ref/` o se anota como estimación en `HANDOFF.md`.

Prioridades: **P0** es la primera entrega de la etapa 4 y reemplaza los cortes de la etapa 1. **P1** es el resto de la etapa 4. **P2** es ceremonia y pulido, etapa 6.

### 10.1 Pesistas

| Segmento | Parte de | Descripción | Prioridad |
|---|---|---|---|
| `lower_snatch` | Arranque, de pie | Tras la chicharra baja la barra guiada, la suelta y queda en `Parado atrás` | P0 |
| `lower_split`, `lower_power`, `lower_squat` | Final de cada envión | Lo mismo desde el envión: una regla, tres anchos de pies | P0 |
| `snatch_miss_front` | Recepción del arranque | La barra se va adelante, la suelta y sale hacia atrás | P0 |
| `clean_miss_front` | Amortiguación de la cargada | Caen los codos, suelta adelante y sale hacia atrás. Es el «aplastado» | P0 |
| `split_miss_front` | Tijera | Codos sin trabar, suelta adelante y da un paso atrás. Es el envión que no bloquea | P0 |
| `celebrate_fist` | `Parado atrás` | Puño apretado y grito; vuelve a `Parado atrás` | P0 |
| `lament_head` | `Parado atrás` | Manos a la cabeza, mira la barra | P0 |
| `power_miss_front`, `squat_miss_front` | Recepción del power; fondo del squat | Envión que no bloquea en los otros dos estilos | P1 |
| `snatch_press_out`, `split_press_out`, `power_press_out`, `squat_press_out` | Recepción de cada uno | Codos blandos que se traban empujando y terminan arriba: el nulo técnico, visible. El del power es el fallo típico de Marangi | P1 |
| `split_miss_back`, `power_miss_back`, `squat_miss_back` | Recepción de cada envión | La barra pasa por detrás; sale caminando adelante | P1 |
| `overhead_lose` | De pie, en arranque y en envión | Tiembla, se desarma y suelta la barra: la pérdida por temblor | P1 |
| `snatch_grind` | Recepción del arranque | Atasco, ajuste de pies y recuperación. Es el intento peleado; hacia atrás sirve para el que no sale | P1 |
| `clean_grind` | Amortiguación de la cargada | Rebote, atasco, paso del atasco y subida | P1 |
| `split_grind` | Tijera | Tijera inestable y recuperación con pasos cortos | P1 |
| `snatch_miss_back` | Recepción del arranque | La barra pasa por detrás; sale caminando adelante | P1 |
| `snatch_miss_pull`, `clean_miss_pull` | `Triple extensión` (en movimiento: necesita fundido) | Tirón sin altura: la barra vuelve a la tarima | P1 |
| `lower_rack` | Cargada, de pie | Devuelve la barra desde los hombros | P1 |
| `setup_pump_s`, `setup_pump_c` | `Salida` | Bombeo de cadera antes de despegar, en bucle. Da vida al anillo de tensión | P1 |
| `walk_in` | `Espera` | Cinco pasos hasta la barra; termina en `Parado` | P1 |
| `chalk` | `Espera` | Manos al magnesio, frota y palmada | P1 |
| `walk_out` | `Parado atrás` | Giro y salida de cuadro | P1 |
| `idle_wait` | `Espera` | Cambia el peso de pierna, en bucle. Con Resto bajo, resopla y mira el piso | P1 |
| `celebrate_arms`, `celebrate_chest` | `Parado atrás` | Brazos en alto; golpe en el pecho | P1 |
| `lament_knees`, `lament_judges` | `Parado atrás` | Manos a las rodillas; mira a los jueces | P1 |
| `power_grind`, `squat_grind` | Recepción de cada envión | Bloqueo peleado en power y en squat | P2 |
| `celebrate_gold` | `Parado atrás` | De rodillas, golpea la tarima y se levanta | P2 |
| `podium_up_1`, `_2`, `_3` | `Espera` | Camina y sube al cajón: una regla, tres alturas | P2 |
| `podium_wave`, `podium_bow`, `podium_show` | `Espera` en el cajón | Saluda; inclina la cabeza para la medalla; muestra la medalla | P2 |
| `podium_photo` | `Espera` en el cajón | Medalla en alto y mirada a cámara, sin contacto entre personajes | P2 |
| `podium_join` | `Espera` en el cajón | Plata y bronce suben al cajón del oro con el brazo al hombro. Riesgo alto: no hay chequeo de contacto entre personajes | P2 |

La primera entrega suma unas 40 fases por pesista; hoy hay 45.

### 10.2 Ayudantes y autoridad

Una malla simple con dos instancias (la segunda espejada, por eso la ropa va sin texto). En ellos el hueso `Bar` es el punto de agarre del disco o del collarín, que dibuja el visor. Así no se rompe la regla de un solo esqueleto. La medalla también es un objeto dibujado por código.

| Segmento | Parte de | Descripción | Prioridad |
|---|---|---|---|
| `ld_walk_in`, `ld_walk_out` | Fuera de cuadro | Cuatro pasos hasta el extremo de la barra y vuelta | P1 |
| `ld_collar_off` | De pie junto a la barra | Se agacha, afloja y saca el collarín. Al revés sirve para ponerlo | P1 |
| `ld_plate_on`, `ld_plate_off` | Agachado junto a la barra | Toma el disco, lo calza o lo saca, y lo apoya | P1 |
| `ld_idle` | De pie al costado | Espera, en bucle | P1 |
| `ld_wipe` | De pie junto a la barra | Cepilla la barra | P2 |
| `of_walk`, `of_medal` | Fuera de cuadro | La autoridad (misma malla, con traje) camina y cuelga la medalla | P2 |

### 10.3 Acuerdos nuevos entre Blender y el visor

Propuestos para sumar a la lista de `HANDOFF.md` cuando empiece la etapa 4 (el 15, en la etapa 3):

7. Los segmentos nuevos se agregan al final. Los cinco de hoy no se mueven ni se renombran.
8. Cada segmento dice de qué pose parte (`from`) y, si vuelve a un segmento base, a cuál (`to`). Su primera pose duplica la pose de partida, con el mismo chequeo de unión que ya usa el build entre cargada y envión.
9. Cada pose exporta si es de reposo instantáneo (`hold`). Hoy ese dato no viaja al JSON.
10. Eventos por segmento, en muestras: `suelta` (las manos dejan la barra), `piso` (la barra toca la tarima), `paso` (un pie toca la tarima; en las recepciones es el pisotón, que pasa a ser la señal sonora), `magnesio`, y `toma` y `deja` para los ayudantes.
11. Entre `suelta` y `piso`, el hueso `Bar` sigue la caída calculada y chequeada en Blender. Después de `piso` la mueve el visor.
12. Los segmentos sin barra lo declaran, y los bucles también.
13. Las caminatas van en coordenadas de tarima, con origen en su centro.
14. Desde la etapa 4 la animación viaja en paquetes por grupo (levantamientos, fallos y festejos, ceremonia) en vez de ir toda dentro del GLB, para respetar la meta de 4 MB por modelo.
15. **Expresiones de cara, con morphs y sin huesos nuevos.** Hoy el modelo solo trae los morphs correctivos y los 52 huesos del cuerpo: no puede gritar, fruncir el ceño ni cerrar los ojos. Se piden tres morphs con la malla definitiva de la etapa 3: `face_jaw` (boca abierta), `face_brow` (ceño) y `face_eyes` (ojos cerrados). Los mueve el visor por código según el esfuerzo y el resultado.

---

## 11. Alcance por etapa

Alineado con [PLAN.md](PLAN.md). La etapa 1 es el juego mínimo jugable **sin ninguna animación ni modelo nuevo**.

### 11.1 Etapa 1: qué entra

| Tema | Entra |
|---|---|
| Entrada | `web/juego.html`; teclado, mouse y táctil; calentamiento con metrónomo de atraso y levantamiento pesado guionado |
| Intento | El botón único completo: tensión, tirón, explosión, recepción, pelea, traba, apoyo firme, chicharra y amague. Los tres enviones |
| Resultados | Válido, nulo y todos los fallos de la sección 5, con su causa en texto. **Todos los fallos se ven con el mismo corte**: lo que los distingue en esta etapa es el texto y la repetición |
| Competencia | Orden por kilos, tres intentos por levantamiento, declaración automática, panel único con cambios, reloj, jueces de a una luz, total, desempate, sin marca, Resto, forma del día, guion, La cuenta, frases del entrenador, etiquetas |
| Pesistas | Los tres. Marangi usa el modelo de Brenner con tela de color plano y otro nombre en la gráfica |
| Rivales | Completos: gestos generados, elección de kilos y tres niveles |
| Presentación | Cámaras, zócalo, reloj, luces y tablero que ya existen; repetición de lo jugado; medidores nuevos; sonido mínimo generado por código, sin archivos, con su gemelo visual |
| Ritmos | Final exprés (por defecto) y Final completa |
| Rendimiento | Escalón «móvil» y registrador de cuadros por segundo |
| Pruebas | `tools/sim_test.mjs`, informe de balance y `tools/check_game.mjs`; la última juega una partida entera con el reloj inyectado |

### 11.2 Etapa 1: cómo se resuelve lo que todavía no está animado

| Necesidad | Solución con lo que hay |
|---|---|
| Caminar a la barra y magnesio | Corte: placa del pesista y tablero; aparece en `Parado` |
| Pelea de la subida | El mismo clip a velocidad variable, también hacia atrás, más las capas de esfuerzo |
| Amague | El clip corre al revés hasta `Salida`: la barra vuelve al piso en las manos |
| Tirón sin altura | Corte antes de `Triple extensión`, con el texto de la causa; vuelve con la barra en la tarima |
| Fallo en la recepción, en la subida o en la traba | El pesista se hunde hasta la pose del fondo, corte a las luces rojas con el golpe de discos y el texto de la causa, y al volver la barra está en la tarima y el pesista en `Parado` |
| Codos blandos y nulo técnico | No se pueden dibujar: los clips tienen los brazos trabados. Se muestran el medidor de traba, las luces y la causa en texto, con repetición lateral abierta. No se usa el plano de brazos y barra, que mostraría un bloqueo perfecto bajo el cartel de codos blandos |
| Bajar la barra tras un válido | Un segundo arriba con la barra oscilando, luces, corte; vuelve con la tarima vacía |
| Festejo y lamento | Plano del pesista, gráfica, público y repetición lateral con la traza. La cara no cambia de expresión |
| Marangi | Modelo de Brenner con la tela de un color plano aplicado sobre la máscara de tela: un tinte dejaría leer «BRENNER» y «NVK», que están horneados en la textura. Queda el relieve leve del texto; si se lee en la primera captura, Marangi se muestra solo en planos laterales y en el tablero. Comparte la cara de Brenner: no lleva primer plano de cara |
| Recuadro del rival y podio 2D | Bandera, dorsal y texto. Para el podio, un retrato neutro de cada modelo tomado en ejecución con el plano de cara que ya existe (no hay arte nuevo ni GPU en la sesión cloud); Marangi va con bandera y dorsal |
| Ayudantes | Plano cenital de la tarima con los discos deslizándose por la barra, o cambio de carga durante el tablero |
| Podio, medallas y foto | Clasificación final en pantalla, con los tres en un podio dibujado en 2D, y plano del ganador |

**En la etapa 1 nunca se muestra la barra cayendo junto al cuerpo.** Una barra suelta movida por una física simple atravesaría al pesista, y eso saca de la experiencia más que un corte.

### 11.3 Etapas posteriores

| Etapa del plan | Qué suma al juego |
|---|---|
| 2 y 3 · Arte y atletas definitivos | Marangi con cuerpo y cara propios; códigos de país nuevos en las mallas; expresiones de cara; dos ayudantes; temporada nueva de `sim.json` con sus tiempos |
| 4 · Movimiento y fallos | Trabajo de sistema de la sección 10; animaciones P0 primero y P1 después; pisotón como señal; cuerpo que avisa el cansancio; ayudantes en 3D; ritmo corregido contra video y otra temporada de `sim.json` |
| 5 · Online | Cuentas, final del día con tabla, final compartida por turnos y servidor que recalcula cada llamado |
| 6 · Pulido y lanzamiento | Ceremonia completa (P2), himnos, foto exportable, audio de público y locutor, pelea a ritmo, modo práctica con ayuda, metas de rendimiento |

Queda fuera de todas las etapas por ahora: recepción alta a elección (no hay animación), balance con dos botones (rompe la regla de una mano) y lesiones.

---

## 12. Preguntas abiertas para el usuario

Cada una tiene la opción que se toma si no hay respuesta.

1. **Online por turnos: ¿qué formato?** Hay dos, y el registro de partida sirve para los dos.
   - *Final del día*: cada persona juega la misma final contra los rivales del juego y la tabla compara resultados. No depende de que haya otra persona conectada.
   - *Final compartida*: dos o tres personas en la misma final, cada una con su pesista, un turno por intento propio. Con 24 horas por turno una final entre dos personas puede durar hasta 12 días, y los cambios de kilos solo se pueden hacer en el turno propio.
   - *Por defecto:* las dos, en ese orden. Primero la final del día con su tabla; después la final compartida, que es la que cumple «compite contra otra persona» del plan. El juego maneja a los pesistas que falten y juega el turno de quien no aparezca en 24 horas.
2. **Quedar sin marca: ¿regla real o red de seguridad?** *Por defecto:* regla real, con las protecciones de la primera partida (nivel Amistoso, apertura sugerida más baja y límites más anchos en el primer intento de cada levantamiento). Tres nulos en un levantamiento dejan sin medalla; el escalón queda vacío y el pesista aparece igual en la foto.
3. **¿Se aprueban la categoría, los kilos, los nombres y el cambio de códigos?** Implica fichas nuevas para el juego (las del visor, de 81 y 96 kg, quedan). Nombres a aprobar: «Mundial Tarima», «Liga Mundial Tarima», Teo Marangi y Pelagia. Códigos a reemplazar: ARX, NVK y PLG, por candidatos como AXR, NKA y PEL. *Por defecto:* los nombres se usan tal cual; los tres códigos y la bandera de Novakia se cambian antes de publicar, con búsqueda uno por uno; «Ilya» queda, con la misma búsqueda sobre el nombre completo.
4. **En el teléfono, ¿vertical u horizontal?** *Por defecto:* vertical como orientación principal (una mano; el escenario arriba y el pulgar abajo) y horizontal también soportada.
5. **La pelea, ¿premia el control o el dedo más rápido? ¿Y hay suerte?** *Por defecto:* control, con franja verde, tope de toques y temblor; y sin suerte dentro del intento, de modo que hasta el 100 % una ejecución perfecta nunca falla. La alternativa es tocar lo más rápido posible y algo de azar para que haya sorpresas.
6. **Ceremonia: ¿hasta dónde?** ¿Alcanza con los tres en sus cajones mostrando la medalla y juntándose sin tocarse para la foto, o tienen que abrazarse en el cajón del oro (lo más caro y riesgoso de animar)? *Por defecto:* versión sin contacto, con una autoridad que entrega las medallas.
7. **¿Cuánto dura la partida por defecto?** *Por defecto:* Final exprés (5 a 6 minutos) en todas las plataformas, con la Final completa (11 minutos) como opción.
8. **¿La primera partida arranca en nivel Amistoso?** *Por defecto:* sí, y pasa a Normal cuando el jugador gana una medalla.
9. **¿En qué teléfono se mide?** Hace falta una partida entera medida en un teléfono real antes de ajustar ventanas y calidad. *Por defecto:* el del usuario, en cuanto la etapa 1 tenga un link; hasta entonces todo lo de teléfono queda en valores iniciales.

---

## Anexo A: dónde no coincidían las propuestas y qué se eligió

| Tema | Opciones | Elegido | Por qué |
|---|---|---|---|
| Momento de soltar | En la posición de potencia («soltar es explotar») o en la triple extensión («soltar es meterse abajo») | Posición de potencia | La barra llegando a la línea de potencia es una señal visible que llega antes de la explosión, y el jugador ve que su gesto la dispara |
| Segundo gesto en la recepción | Con toque o sin toque | Con toque | Coincide con una pose marcada con anillo y sonido, y agrega un segundo eje de habilidad (codos y rebote) |
| Señal de abajo | Mantener y soltar, o no tocar y después tocar | Mantener y soltar | Soltar el botón es soltar la barra: es el gesto más fácil de entender. El apoyo firme absorbe los toques de la pelea |
| Soltar muy temprano | Fallo siempre, o amague si la barra no pasó la rodilla | Amague antes de la rodilla | Protege de toques accidentales en el teléfono y copia el criterio del deporte |
| Modelo del resultado | Medidas físicas de la barra, o un margen en kilos | Medidas físicas | Cada error tiene una causa distinta. El margen en kilos queda como lectura para el entrenador y La cuenta |
| Cómo juegan los rivales | Un cálculo aparte en kilos, o el mismo intento con gestos generados | Gestos generados | Un solo camino de código: fallan como el jugador y el servidor los recalcula igual |
| Cansancio | «Energía» interna, o «Resto» de 0 a 100 a la vista | Resto | Es el recurso que el jugador administra; los costos de la pelea se pasaron a esa escala |
| Azar | Ninguno, o forma del día más variación por intento | Forma del día y jueces sembrados; variación mínima en el intento | La forma del día evita la cuenta resuelta sin quitarle al jugador el control de su intento |
| Reloj | 30 y 45 segundos, o 60 y 120 | 30 y 45 | Conserva la presión sin estirar la partida |
| Cambios de kilos | Hacia arriba y hacia abajo, o solo hacia arriba | Los dos sentidos | Permite declarar alto y bajar, que es parte de la táctica |
| Efecto de cada envión | Altura y desvío, o kilos de techo | Altura y desvío | Es coherente con el modelo físico elegido |
| Envión fuera de repertorio | Ventanas más angostas, o menos altura y menos desvío | Menos altura y menos desvío, con dos enviones dominados por pesista | Los multiplicadores de ventana apilados chocaban con el piso de 30 ms |
| Castigo por tocar de más | Zona roja fija cerca de 5 toques por segundo, o saturación en 7 | Franja verde que acompaña a la exigencia, más zona roja en 0,92 | Con la zona fija sola, machacar ganaba todo hasta el 103 % |
| Luces | Cada 0,25 s, o cada 0,4 s y 0,8 s en los decisivos | 0,4 y 0,8 s | Es el mejor suspenso por el menor costo |
| Fallos en la etapa 1 | Barra suelta con física simple, o corte de cámara | Corte | La barra suelta atravesaría el cuerpo |
| Organización del código | Un archivo `intento.js`, o carpetas `sim/` y `game/` con página propia | Carpetas y `juego.html` | Separa lo que valida el servidor de lo que se dibuja; el visor sigue pasando su prueba |
| Datos deportivos | En `config.js`, o en `sim.json` | `sim.json` | Lleva huella y lo lee el servidor; `config.js` queda para el visor |
| Festejo con efecto en el juego | Tocar para festejar suma energía, o es solo presentación | Solo presentación | El núcleo no conoce los festejos; así el arte los cambia sin alterar resultados |
| Intentos de los rivales | Enteros, resumidos o salteables | Resumidos y salteables; enteros los decisivos | Mantiene la partida corta sin perder los momentos que importan |

---

## Anexo B: qué cambió por las críticas

Dos críticos independientes revisaron la versión anterior. Cada objeción se verificó contra el documento, `web/js/`, `web/data/poses.json`, `blender/poses.py` y `blender/tex.py`.

### Cambios aplicados

| Tema | Qué se objetó | Qué se cambió |
|---|---|---|
| Pelea | Machacar ganaba todo hasta el 103 %; la aguja serruchaba; al 106 % se perdía antes de poder tocar; la caída del esfuerzo estaba mal definida | Sección 4 reescrita: toque de 0,10 con caída más lenta, aguja promediada, franja verde que acompaña a la exigencia, precarga por la recepción, rebote que no retrocede, y tabla de lo que produce |
| Codos blandos | Los umbrales de 250 y 600 ms eran inalcanzables con la pelea general | Sección 4.1: traba con medidor propio; umbrales de 350 y 700 ms |
| Paso a la chicharra | Un toque de más al terminar la pelea era nulo | Apoyo firme de 300 ms antes de armar el nulo; sueltas de menos de 120 ms no cuentan |
| Paso de la cargada al envión | Un toque residual arrancaba el envión | Entrada ignorada 450 ms; amague sin costo en la flexión |
| Piso de 30 ms | Los multiplicadores lo dejaban en 17 a 28 ms | El piso va al final; el envión elegido ya no toca ventanas |
| Squat | Al 106 % pedía más esfuerzo del que existe | Sin recargo de exigencia; pelea desde el fondo y sin rebote |
| Señal de la recepción | El pisotón no está en los datos ni coincide con el ancla | Ancla en la pose, con anillo y golpe de recepción; el pisotón llega con el evento `paso` |
| Soltar tarde | La espera de 120 ms congelaba la barra a 2 m/s; tres reglas del vuelo no cerraban juntas | Sección 3.5: calendario fijo desde el soltar, ritmo entre 0,6 y 1,5, esperas solo en poses de reposo |
| Soltar temprano | La ventana se pisaba con el amague | Prioridad explícita y ancho real de la franja de tirón anticipado |
| Reloj | Se detenía al despegar, pero el amague decía que seguía | Se detiene al pasar la rodilla |
| Causalidad | Un evento con fecha vieja podía contradecir lo ya mostrado; el bucle recorta el tiempo | Reloj sin recorte, núcleo puro sobre la lista de eventos, demora de las ramificaciones irreversibles, instantes en milisegundos |
| Varios dedos | Alternar pulgares perdía toques | En la pelea cada contacto nuevo es un toque |
| Interrupciones | Sin política para pestaña oculta, llamada o gesto del sistema | Política en la sección 3.1; área segura fuera de la zona táctil |
| Resto | Casi todo valía menos de 1 kg | Costos nuevos: base más baja, pelea y nulo más caros, recuperación 5 contra 1, sin costos de 1 punto |
| Kilos | Dos decisiones por intento; valor por defecto sin definir; las fichas revelaban la forma del día | Declaración automática, panel único en el llamado, fichas sobre el techo visible |
| Pesistas | Brenner era peor en todo; Técnica y Temple casi no se notaban | Atributos que suman 28, efectos más grandes, techos de dos tiempos más cerca, dos enviones dominados por pesista |
| Rivales | El tope de toques les impedía completar; Técnica y Temple contaban doble; usaban el techo exacto del jugador; siempre pedían lo mismo | Mismos toques que una persona con error de control; error por nivel; deciden con datos visibles; aperturas y saltos variables; guion |
| Dificultad | Los valores iniciales no cumplían las metas; no había nivel fácil; la primera partida podía terminar sin marca en cuatro minutos | Nivel Amistoso, metas para los rivales, apertura sugerida, límites más anchos en la primera partida, metas con tres perfiles y primera cuenta publicada |
| Duración | Once minutos con un minuto de entrada real | Exprés por defecto; revancha en 5 segundos |
| Calentamiento | No enseñaba la pelea ni la chicharra; la calibración era ruidosa | Tercer levantamiento pesado guionado; metrónomo de 8 toques con mediana |
| Teléfono | Zona táctil sobre la barra; tope de 30 cuadros durante el intento; toque de saltear sobre los kilos; avisos solo sonoros; sin mediciones ni presupuesto | Escenario arriba y pulgar abajo, cámara lateral en vertical, bloqueo de paneles y Confirmar, gemelos visuales, escalón «móvil», presupuesto numérico, registrador y prueba en teléfono real |
| Etapa 1 | Marangi mostraba «BRENNER» y «NVK»; no hay expresiones de cara; el nulo por codos no se puede dibujar; los retratos eran arte nuevo; todos los fallos se ven igual | Secciones 11.1 y 11.2 lo dicen tal cual es y cómo se resuelve; se piden morphs de cara y los `press_out` suben a P1 |
| Visor | «No se toca» contradecía la lista de archivos | Principio corregido; plantel en `roster.js`; cámara no interactiva; decisión parcial |
| Anclas | `Recuperación` se repite en tres segmentos | Anclas por segmento y nombre |
| `sim.json` | «Congelado» chocaba con las etapas 3 y 4 | Versionado por temporada |
| Repetición y línea de potencia | La repetición salía del clip fijo; la «línea de la cadera» queda 11 cm arriba de la barra | Repetición grabada; línea a la altura de la barra |
| Servidor | Semillas derivables; abrir un turno no comprometía nada; la corrección de atraso se podía elegir después; el registro no representaba un llamado desplazado; la tabla no tenía criterio | Sección 9.6: firma del servidor por llamado, apertura única con plazo, corrección fija, registro de llamados, orden de la tabla |
| Online | La final compartida no cerraba con relojes de 30 segundos ni con cambios reactivos | Reglas iguales en solitario y en compartida (cambios en el llamado propio, aperturas selladas); la final del día pasa a ser lo primero |
| Pruebas | Partida de once minutos en tiempo real; diez mil partidas en un segundo | Reloj inyectado; núcleo por eventos; mil partidas |
| Nombres | Códigos que coinciden con marcas o entidades; bandera parecida a una real; categoría que no es inventada | Sección 6.1 |
| Detalles | «Barra de Resto»; medidor solo por color; apertura de Marangi mal calculada; 1.6 prometía fallos distintos | «Medidor de Resto»; posición y trama; 194; texto corregido |

### Objeciones descartadas, o tomadas a medias

| Objeción | Por qué no |
|---|---|
| Una reserva de segundos de zona roja para toda la final | Duplica el Resto y suma un cuarto medidor en el teléfono. La decisión que buscaba (cuándo gastar) la da el Resto con la pelea más cara |
| Squat con 2 % más de techo efectivo | Contradice el modelo de altura y desvío del anexo A. Los 6 cm que ya da valen más que eso |
| Que el metrónomo de 4 toques por segundo saque menos de 30 % entre 95 y 100 % | Un ritmo parejo de 4 es lo que hace un jugador con control en un 100 % limpio. La meta se cambió por una que le exige fracasar en el promedio de todo el rango |
| Sacar Técnica y Temple | Se tomó la otra salida que ofrecía la crítica: efectos más grandes |
| Final del día como único formato por defecto | El plan pide que dos personas compitan entre sí. Quedan las dos, con la final del día primero (pregunta 1) |
| Medir el pisotón leyendo el modelo desde una herramienta | Para la etapa 1 alcanza con anclar a la pose. El pisotón llega con el evento `paso`, que exporta Blender |
| Un modelo derivado de Marangi sin texto | Es arte y toca `web/models/`, fuera de la etapa 1. Se resuelve con tela de color plano y planos elegidos |
| Final exprés obligatoria en teléfono | Exprés es el defecto en todas las plataformas; la completa sigue disponible |
| Meta de 60 % de válidos al 100 % para un error típico de 25 ms | Ese jugador acierta la ventana perfecta en 84 % de los gestos: pedirle 60 % obligaría a que todo gesto no perfecto falle, y entonces la pelea no salvaría nada. La meta de 60 % pasó al perfil de 40 ms |
| Sacar el tirón anticipado de la tabla de fallos | Existe con pesos altos. Se dejó, con su franja real |
| Cambiar «Pelagia» e «Ilya» | Riesgo bajo. Quedan, dentro de la búsqueda previa a publicar |
