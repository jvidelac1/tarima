# MVP de Tarima

Estado al 12 de noviembre de 2026. Esto es lo que se construye para la primera versión pública. Quien implemente toma de acá las reglas, los textos y el contrato del servidor. Las tres propuestas de partida (conversión, jugador nuevo y producto) quedaron resueltas en este documento. Donde chocaban, la elección está explicada en una línea en la sección 0.

## 0. Decisiones en una tabla

| Tema | Decisión |
|---|---|
| Promesa | «Halterofilia a un botón: ganá la final levantando más kilos que tus rivales.» |
| Finales gratis | 2 por dispositivo. El tutorial no cuenta. Bandera para probar 1 contra 2 cuando haya 1.000 visitas |
| Cuándo se gasta una final | Cuando el servidor entrega el pase, al empezar la final (después del tutorial). Si la página se recarga en medio de la final, el juego reanuda esa misma final una vez con el pase guardado en la pestaña, sin gastar otra (ver «Revisión») |
| Duración | Final rápida, de 5 a 6 minutos. Del link a la primera final hay menos de 1 minuto |
| Después de la final 1 | Podio, después «Jugar otra vez» como botón principal y una invitación suave a la lista que se puede cerrar |
| Después de la final 2 | El muro, con dos caminos: dejar el mail (juego libre hasta la próxima versión) o la encuesta (2 finales más, una sola vez) |
| Cuando se gastan las finales de la encuesta | Vuelve el muro, ahora solo con el mail |
| Quién lleva la cuenta | El Worker. Cuenta por dispositivo (2) y por IP con HMAC (6 en 30 días). El navegador solo guarda una copia para mostrar el muro al instante |
| Datos que se piden | Nombre o apodo (opcional, queda en el dispositivo). En el muro: el mail, la casilla de aviso (obligatoria) y la de novedades (opcional). Nada más |
| Métricas | PostHog, US Cloud (proyecto 606461), con proxy en el mismo Worker (`/qx/`). Sin cookies ni almacenamiento de medición. Sin mail ni IP |
| Idiomas | Español neutro, sin voseo (decisión del dueño del 12 de noviembre: los textos en voseo de 4.5 se reescriben con tuteo), e inglés llano. Se detecta el idioma del navegador; `?lang=` y el selector ES · EN lo cambian |
| Personalización | Tu nombre reemplaza al del pesista que elegís en el zócalo, la tabla y el podio |
| Nombre del evento | «Final Tarima · Pretemporada» / «Tarima Final · Preseason». Sale «Mundial Tarima 2026» |

**Choques entre propuestas y cómo los resolví**

- **Cuántas finales antes del muro.** Conversión proponía 1 final más un salto de una vez; jugador y producto, 2 con una invitación suave después de la primera. Elijo 2 con invitación: es lo mismo en cantidad, pero sin un «Ahora no» que entrena a saltear el pedido del mail.
- **Botón Revancha en el podio 1.** Conversión lo reemplazaba por «Anotarme y jugar la revancha». Lo mantengo: la final 2 está prometida como gratis, y tapar ese botón con un pedido se siente como trampa.
- **Quién es el jugador.** Conversión: «equipo de {nombre}». Jugador y producto: tu nombre en el pesista. Elijo el nombre en el pesista porque es lo que el dueño pidió («más personalizado»). El problema de un nombre de mujer sobre un cuerpo de hombre se acepta en el MVP y es justo el gancho de «pesistas mujeres».
- **Título de la elección.** «Elegí tu pesista» (jugador) en lugar de «Elegí tu cuerpo» (producto): no promete que el cuerpo sea el tuyo. Las tarjetas sí llevan la contextura (Compacto, Largo, Potente), que viene de producto.
- **Verbos de la señal.** ¡TIRÁ! se queda, porque ¡ARRANCÁ! se confunde con «Arranque» en el dos tiempos. ¡RECIBÍ! pasa a ¡AGARRALA!, que es lenguaje llano y entra en 12 caracteres. En inglés: PULL!, EXPLODE!, CATCH!, PUSH!, DIP!, UP!.
- **Milisegundos en Un toque.** Se dice «un poco», «bastante» o «muy» temprano o tarde (jugador), no «0,26 s» (producto): un número no le dice nada a quien empieza. Los ms quedan para Pro y para `?depura=1`.
- **Tope.** Pasa a «Máximo» (jugador), no a «Mejor marca» (producto): es lo que el pesista levanta en un buen día, no un récord.
- **Consentimiento.** Hay dos casillas: el aviso de lanzamiento (obligatoria) y las novedades (opcional), como proponía conversión. Producto juntaba todo en una. Con dos casillas, el precio de seguir jugando no incluye aceptar marketing (RGPD, art. 7.4).
- **Turnstile.** Ninguna propuesta lo dejaba afuera; yo lo postergo. Agrega un script y una mención más en la política de privacidad, y con el volumen del MVP alcanzan los límites por IP. Se prende con una variable si aparece abuso.
- **Número de fundador o dorsal.** Queda fuera. Un número bajo muestra un juego vacío, y prometer un dorsal para el lanzamiento compromete trabajo de arte. Al anotado le queda «Estás en la lista · juego libre».
- **Referidos con premio** (el cinturón dorado de producto). Quedan fuera: es una promesa sin fecha. Compartir sí entra, con un código por partida y no por persona.
- **Filtro de insultos en el nombre.** Queda fuera, como pedía jugador. El nombre solo lo ve quien lo escribe. Vuelve cuando haya resultados compartidos con nombre.
- **Opciones (controles, rivales, duración).** Quedan plegadas en «Opciones» desde la primera visita, cerradas por defecto. Así no hay que esperar a la segunda visita como en jugador, ni a la segunda final como en producto: el que las busca, las encuentra.

## 1. La promesa y qué cuenta como tracción

**Promesa.** «Halterofilia a un botón: entrás, ponés tu nombre y en un minuto estás peleando una final contra dos rivales».

La pregunta que tiene que contestar el MVP es si gente que no conoce el deporte termina una final, quiere otra y deja el mail para seguir. Si además cuenta qué quiere, mejor.

**Ventana de medición.** Tres semanas desde que se publica. Se necesitan al menos 300 personas que vieron el muro y que llegaron sin la red del dueño (lo que comparte el dueño lleva `?utm_source=amigos` y se excluye).

| # | Métrica | Cómo se mide en PostHog | Meta |
|---|---|---|---|
| 1 | Activación | `final_inicio` con `n=1` sobre `juego_abierto` (sesiones) | 60 % o más |
| 2 | Terminan la final 1 | `final_fin` con `n=1` sobre `final_inicio` con `n=1` | 60 % o más |
| 3 | Quieren otra | `final_inicio` con `n=2` sobre `final_fin` con `n=1` | 50 % o más |
| 4 | Convierte el muro | (`anotar_ok` + `encuesta_enviada`) sobre `muro_visto`, y aparte `anotar_ok` sobre `muro_visto` | 45 % o más / 25 % o más |
| 5 | Mails por visitante | `anotar_ok` con `estado=nuevo` sobre `juego_abierto` con `previas=0` | 8 % o más |
| 6 | Vuelven | Anotados que piden una final otro día, en los 7 días siguientes al alta (retención de PostHog sobre la cohorte identificada, verificada con D1) | 20 % o más |

**Hay tracción** si se cumplen 1, 4 y 5, y además 2 o 6. Si eso pasa, se pasa a la etapa siguiente (sección 8) y se escribe a la lista.

**Alarmas**, que se miran antes que la tracción:

- Si menos del 40 % termina la final 1, el problema es el juego y no el muro. Se mira el abandono por pantalla antes de tocar cualquier texto del muro.
- Si menos del 10 % de los que ven el muro deja el mail, falla la promesa o el formulario. Se prueba otro texto con la bandera `muro-texto`.
- Si más del 5 % de los muros se muestran por IP a un dispositivo que todavía no jugó ninguna final (`muro_visto` con `motivo=ip` y `previas=0`), el tope por IP está castigando a redes compartidas y se sube.

**Señal para el rumbo.** Si el 30 % o más de las respuestas de la encuesta pone la misma opción primera en «¿Qué agregamos primero?», esa opción encabeza la etapa siguiente. La pregunta de pago no decide un precio: dice si hay más votos para «pago único» o «cosas opcionales» que para «no pagaría».

Estas metas son mías, ordenadas con referencias públicas. CrazyGames considera bueno que el 80 % siga jugando después del primer minuto y que vuelva entre el 10 y el 15 % al día siguiente. Las listas de espera genéricas convierten entre el 2 y el 5 %. Son órdenes de magnitud, no benchmarks medidos para este juego.

## 2. El flujo, pantalla por pantalla

En todas las pantallas fuera del intento hay un pie con «Privacidad» y el selector ES · EN arriba a la derecha.

**P0 · Carga** (`#msg`). Se ve el logo y la línea «Levantá más kilos que tus rivales. Un solo botón.». En paralelo pasan tres cosas:
1. Se fija el idioma (sección 4.1).
2. Se pinta la pantalla que corresponde según la copia local (`tarima.muro`): la bienvenida o el muro.
3. Se pide `POST /api/estado` al Worker, y con la respuesta se corrige la pantalla si hace falta. Los modelos siguen bajando atrás. Excepción: si el servidor dice muro con `previas=0` (red compartida que ya gastó su tope), se pinta igual la bienvenida y la práctica, que no gastan nada, y el muro aparece recién en P4, con el camino de la encuesta arriba. Nadie ve un muro antes de saber qué es el juego.

Si el Worker no contesta en 4 s, vale la copia local.

**P1 · Bienvenida** (reemplaza `inicio()`). Muestra el título, la bajada de una línea y el campo «¿Cómo te llamás?» con el foco puesto. Más abajo están las tres tarjetas de «{nombre}, elegí tu pesista», con Compacto marcado, y el botón grande «Jugar». «Opciones» queda plegado.
- **Primera vez.** El nombre es opcional: vacío, se usa «Debutante» o «Rookie». Enter o «Jugar» avanza.
- **Cuando vuelve.** Se lee «Hola de nuevo, {nombre}» con un enlace «No soy yo», y debajo cuántas finales gratis le quedan.
- **Ya anotado.** Se lee «Estás en la lista · juego libre».
- **Llegó por un link compartido** (`?c=`). Arriba aparece «Te desafiaron a ganar la final. ¿Te animás?».

**P2 · Tarjeta del arranque**, solo antes de la primera práctica. Una línea («Arranque: la barra va del piso a arriba de la cabeza en un solo tirón. Vos marcás el momento; tu pesista pone la fuerza.») y el botón «Probar». Tarda menos de 5 s.

**P3 · Práctica**, el tutorial guiado que ya existe, con los textos nuevos. Se puede saltear y no gasta una final. Se ofrece una vez por dispositivo (`tarima.tutorial`). Termina con «¡Vale! Eso fue un arranque…».

**P4 · Pedido del pase.** Es invisible para el jugador: `POST /api/partida`.
- Si responde `ok`, sigue a P5.
- Si responde `muro`, va a P9.
- Si falla la red, se reintenta 2 veces en 3 s. Si sigue fallando y la copia local no dice muro, se juega igual con `fuente=sin_servidor`, una vez por carga de página.

**P5 · Cómo se gana** (reemplaza «Presentación»). En la primera final son tres líneas numeradas más «Tus rivales hoy» con dos tarjetas de una línea. Desde la segunda final queda solo la fila de rivales. El botón es «A la tarima».

**P6 · Primer peso** (reemplaza `elegirApertura`). «¿Con cuántos kilos empezás el arranque?», con el número sugerido ya elegido. El botón principal dice «Empezar con 152 kg» y los −/+ quedan al costado. Debajo, una línea: «Empezar más bajo es más seguro…».

**P7 · La final.** Es la final rápida de hoy con todos los textos nuevos. Cada concepto se explica una sola vez, la primera vez que aparece: el primer NO VALE, el primer dos tiempos, el primer llamado y el primer − bloqueado. Queda anotado en `tarima.visto.<clave>`. Nunca hay más de una línea de este tipo por pantalla.

**P8 · Podio de la final 1.** Durante 2,5 s se ve solo el resultado («¡Oro para {nombre}!»). Después aparecen los botones «Jugar otra vez · te queda 1 final gratis» (principal), «Cambiar de pesista» y «Compartir resultado». Debajo va la invitación suave: «¿Te avisamos cuando salga el juego completo?», con el botón «Anotarme» y una ✕ para cerrarla. Si se anota acá, pasa a juego libre y la final 2 no gasta nada.

**P8b · Podio de la final 2.** Igual que el anterior, pero después de los 2,5 s sube el muro (P9) en lugar de los botones. «Compartir resultado» sigue visible.

**P9 · Muro.** El título lleva el nombre y debajo va la promesa en dos líneas. Hay dos caminos:
- **Camino principal.** El campo del mail, la casilla de aviso, la de novedades, la línea legal y el botón «Anotarme y seguir jugando». Más abajo, «¿Ya te anotaste en otro dispositivo? Poné el mismo mail».
- **Camino secundario.** Un recuadro: «¿Sin mail? Contestá 4 preguntas y jugá 2 finales más», con el botón «Contestar (1 minuto)». Solo aparece si el servidor dice `encuesta_disponible`.

Abajo de todo, «Ahora no». No desbloquea nada: deja visibles la lista de lo que viene, el botón de compartir y el formulario.

**P10 · Encuesta**. Son 5 preguntas en una sola pantalla con scroll, y las 4 primeras son de toque. El botón es «Enviar y jugar».
- Si sale bien, se lee «¡Gracias! Sumaste 2 finales.» y se va directo a P4.
- Cuando se gastan esas dos finales, el muro vuelve sin el recuadro de la encuesta y con la línea «Ya usaste las finales de la encuesta. Para seguir, dejá tu mail.».

**P11 · Anotado.**
- Si el alta es nueva: «¡Adentro, {nombre}! Estás en la lista de acceso anticipado.» y debajo «Te mandamos un mail para confirmar. Mientras, jugá todo lo que quieras.».
- Si ya estaba: el servidor responde igual que con un alta nueva para no revelar quién está en la lista (sección 5.5), así que se ve lo mismo que arriba. «Ya estabas en la lista. ¡A jugar!» solo sale si este mismo dispositivo ya estaba anotado con ese mail.

Si todavía no contestó la encuesta, se le ofrece sin premio («¿Nos ayudás a decidir qué hacer primero? 4 preguntas, 1 minuto.»). El botón «Seguir jugando» lleva a la revancha directa.

**Recargar**

| Momento | Qué pasa |
|---|---|
| Antes de P4 (bienvenida, práctica) | No se gastó nada. Vuelve a la bienvenida |
| En medio de una final | El pase de esa final queda en `sessionStorage` (`tarima.pase`, con `n`, `exp` y si ya se reanudó). Al recargar en la misma pestaña, antes del podio y dentro de `exp`, el juego reanuda esa misma final desde el principio, sin pedir otro pase. Se reanuda una sola vez por pase; la segunda recarga la da por gastada y vuelve a la bienvenida con el contador al día o, si era la última, al muro |
| En el muro o en la encuesta sin enviar | Muro. El servidor responde muro aunque se haya borrado la copia local |
| Después de mandar la encuesta | Bienvenida, con «Te quedan 2 finales» |
| Anotado | Bienvenida y juego libre |

**Otros casos**

- **Volver otro día.** El estado vive en el servidor. El registro del dispositivo dura 180 días desde la última final, y el de la IP, 30 días. Quien vuelve después de 180 días tiene otra vez 2 finales gratis: es un reenganche a propósito.
- **Teléfono.** Funciona igual. El mail usa `type=email`, `inputmode=email` y `autocomplete=email`. El muro y la encuesta son una columna con scroll. La zona «Tocá acá» se esconde mientras haya un formulario abierto. Con el foco en un campo, `input.js` ignora Espacio y Enter: hoy el botón escucha Espacio en toda la página, y con eso un nombre con espacio dispararía toques.
- **Borrar los datos o abrir una ventana privada.** Hay un dispositivo nuevo, pero la cuenta por IP lo frena a las 6 finales en 30 días (sección 7).
- **No quiere dejar el mail.** Tiene la encuesta (2 finales, una vez) y después solo el mail. No hay otra puerta.
- **Dos pestañas.** Cada una pide su pase, y el servidor cuenta las dos. El «te queda 1 final» de una pestaña puede estar viejo si la otra ya jugó: lo corrige P4, que lleva al muro sin gastar nada.
- **Sin JavaScript.** El juego no anda. `juego.html` lleva un `<noscript>` de una línea en los dos idiomas («Tarima necesita JavaScript activado.» / «Tarima needs JavaScript turned on.»). No hay JavaScript de terceros: posthog-js va vendorizado y lo que pida después pasa por `/qx`.

## 3. Onboarding: del link a la primera final en menos de un minuto

| Paso | Tiempo esperado | Qué hace el jugador |
|---|---|---|
| Bienvenida | 10 s | Escribe su nombre (o no), toca una tarjeta y «Jugar» |
| Tarjeta del arranque | 5 s | Lee una línea y toca «Probar» |
| Práctica | 15 a 25 s | Hace un arranque guiado de 3 toques y empuja. El juego espera cada toque (medido hoy: 13 s) |
| Cómo se gana | 8 s | Lee tres líneas y toca «A la tarima» |
| Primer peso | 3 s | Toca «Empezar con 152 kg» |

**El nombre.**
- **Formato.** De 2 a 14 caracteres. Se recortan los bordes, se juntan los espacios repetidos y se aceptan letras Unicode, espacios, guion y apóstrofo. Se guarda en `tarima.nombre`.
- **Dónde no va.** No viaja en las métricas. Solo llega al servidor si la persona se anota, para el saludo del mail.
- **Escape.** Se escapa siempre con `esc()` o `textContent`: `capa.poner`, `tableroHTML`, el zócalo y el podio arman HTML con `innerHTML`, y sin escape un nombre como `<img onerror=…>` ejecuta código.

**Qué se personaliza con el nombre.**
- **El pesista.** El nombre reemplaza al del pesista elegido en el zócalo (en mayúsculas), en la tabla, en el resumen de los rivales, en los récords y en el podio. Lo resuelve una función `quien(a)` que devuelve el nombre del jugador cuando `a.i === E.yo` (`nombreDe` ya existe en perf.js).
- **Lo demás del pesista.** El código de país y los colores siguen siendo los del pesista elegido, y los rivales conservan su nombre.
- **Género.** Los textos con nombre lo evitan: «¡Oro para {nombre}!», nunca «¡{nombre} campeón!».

**Pesista.** Hay tres tarjetas de una línea: Compacto (el modelo de Ventura), Largo (Brenner) y Potente (Marangi). No muestran dorsal, país ni máximos. Los dos que no se eligen son los rivales, con su nombre de siempre.

**Valores por defecto de las primeras finales.** Controles Un toque, rivales Tranquilos (hoy «amistoso») y final Rápida. «Opciones» está plegado y no se muestra abierto a nadie sin que lo pida.

## 4. Textos

### 4.1 Idioma

- **Orden de prioridad.** Primero `?lang=es|en`, después `tarima.idioma` y por último `navigator.languages`. El primero que empieza con `es` da español; cualquier otro caso, inglés.
- **Cambio manual.** El selector ES · EN está en la bienvenida, la pausa, el muro y la encuesta. El cambio se aplica sin recargar: la pantalla actual se vuelve a pintar, y se actualizan `<html lang>` y `<title>`.
- **Dónde viven los textos.** En `web/js/game/i18n/es.js` y `en.js` (`export default { clave: 'texto' }`), con `t(clave, vars)` en `web/js/game/i18n/t.js`. Las variables van entre llaves.
- **mensajes.js.** `explicar()` y `pasos()` reciben el idioma como parámetro y arman la frase con plantillas por idioma: no alcanza con concatenar trozos traducidos, porque el orden cambia. El archivo sigue siendo puro.
- **Qué no se traduce.** Los nombres de pesistas y países ficticios.
- **CAUSAS.** La tabla `CAUSAS` de rules.js queda para registros y pruebas. La interfaz usa `causa.*`.
- **Pruebas.** Fijan `?lang=es` y comparan por clave cuando pueden (`data-clave` en los botones). `sim_test` aplica el mismo control de largo a los dos idiomas: entre 20 y 130 caracteres, sin `undefined` ni `{`.

### 4.2 Principios

1. **Palabras de la calle.** Ninguna palabra de federación sin su explicación de una línea la primera vez: arranque, dos tiempos, intento y total se explican. Tope, Resto, apertura, nulo, SM, chicharra y dorsal desaparecen de la interfaz de Un toque.
2. **Frases cortas.** Una idea por frase y, como mucho, 3 líneas por panel sin contar los números.
3. **Decir qué hacer, no qué salió mal.** Cada fallo termina con la acción para la próxima.
4. **El veredicto en dos palabras.** ¡VALE! / NO VALE / SE CAYÓ, y debajo una sola línea.
5. **Sin números técnicos en Un toque.** Nada de ms ni de porcentajes de energía.
6. **Una explicación nueva por pantalla, y una sola vez.**
7. **Sin género cuando hay nombre.** Y sin promesas con fecha.

### 4.3 Tono de marca

Es el de una transmisión deportiva entre amigos: cálida, con cancha y con humor seco. Celebra fuerte el ¡VALE! y nunca se burla del fallo. El español va en español neutro, con tuteo (decisión del dueño; las tablas de 4.5 todavía están en voseo y se reescriben sobre las mismas claves). El inglés es llano, con los verbos cortos del gimnasio y los nombres reales del deporte (Snatch, Clean & jerk), porque son los que la gente busca.

Por decisión del dueño (12 de noviembre) no hay ninguna promesa pública sobre pagos hasta que se defina la monetización: no va en el juego, la privacidad, los correos ni las páginas del Worker.

### 4.4 Glosario para el jugador

Vive en «Cómo se juega» (tecla H, o el botón «?» junto a la pausa en el teléfono). Tiene siete entradas, con las claves `glosario.*` de la tabla.

| Término | Español | Inglés |
|---|---|---|
| Arranque | La barra del piso a arriba de la cabeza en un solo movimiento. | Snatch: bar from floor to overhead in one move. |
| Dos tiempos | Primero a los hombros, después arriba de la cabeza. | Clean & jerk: first to the shoulders, then overhead. |
| Intento | Cada vez que salís a levantar. Tenés 3 de cada uno. | Attempt: each time you go up to lift. You get 3 of each. |
| Vale / No vale | Hay 3 jueces: con 2 luces blancas, vale. | Good lift / No lift: 3 judges; 2 white lights and it counts. |
| Total | Tu mejor arranque más tu mejor dos tiempos. Gana el más alto. | Total: best snatch plus best clean & jerk. Highest wins. |
| Energía | Cada intento cansa. Los fallos y los pesos altos cansan más. | Energy: every attempt tires you. Misses and heavy lifts tire you more. |
| Kilos | Más kilos, más difícil. La barra nunca baja: si fallás, repetís el peso o subís. | Weight: more kilos, harder lift. The bar never goes down: miss and you repeat it or go up. |

### 4.5 Tabla de textos

Variables comunes que resuelve `t()`:

| Variable | Español | Inglés |
|---|---|---|
| `{A}` | Teclado: «Apretá ESPACIO». Táctil: «Tocá la pantalla» | «Press SPACE» / «Tap the screen» |
| `{T}` | «Tocá ESPACIO» / «Tocá» | «Tap SPACE» / «Tap» |
| `{t}` | «tocá ESPACIO» / «tocá» | «tap SPACE» / «tap» |
| `{cuando}` | «cuando el círculo llega al aro» | «when the circle hits the ring» |
| `{cuanto}` | «un poco», «bastante» o «muy» más «temprano» o «tarde», con cortes en 60 y 150 ms | «a bit», «quite» or «way» plus «early» or «late» |
| `{ajuste}` | «antes» / «después» | «earlier» / «later» |
| `{pos}` | — (el español usa `{n}`) | «1st», «2nd» o «3rd» |

En inglés, la primera letra de `{T}` y de `{A}` va en mayúscula al empezar una frase. En español, el `{cuanto}` en Pro sigue siendo «180 ms tarde».

**General y carga**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `app.titulo` | «Tarima · Mundial Tarima 2026» (`<title>`) | Tarima · Halterofilia a un botón | Tarima · One-button weightlifting |
| `app.evento` | «Mundial Tarima 2026» (`#ev-titulo`, `EVENTO.titulo`) | Final Tarima · Pretemporada | Tarima Final · Preseason |
| `app.sesion` | «Final · 90 kg» (`#ev-sub`) | Categoría hasta 90 kg | Up to 90 kg class |
| `app.idioma` | nuevo | ES · EN | ES · EN |
| `app.privacidad` | nuevo (pie) | Privacidad | Privacy |
| `carga.msg` | «Cargando…» | Levantá más kilos que tus rivales. Un solo botón. | Lift more than your rivals. One button. |
| `carga.modelos` | «Cargando pesistas…» | Armando la tarima… | Setting up the platform… |
| `carga.error` | «El juego se detuvo por un error» | Algo falló y el juego se detuvo. Recargá la página. | Something broke and the game stopped. Reload the page. |
| `foco.perdido` | «El juego no está recibiendo el teclado · hacé clic acá» | El juego no recibe el teclado · hacé clic acá | The game lost the keyboard · click here |
| `zona.toca` | «Tocá acá» | Tocá acá | Tap here |
| `tecla.toca` | «TOCÁ» (tecla dibujada) | TOCÁ | TAP |
| `tecla.espacio` | «ESPACIO» | ESPACIO | SPACE |
| `menus.teclado` | «Menús: flechas y ENTER · H ayuda · ESC pausa» | Menús: flechas y ENTER · H ayuda · ESC pausa | Menus: arrows and ENTER · H help · ESC pause |

**Bienvenida, pesista y opciones**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `bienvenida.bajada` | «{sesión} · tres pesistas, tres intentos… Gana el mejor total.» | Halterofilia a un botón. Ganá la final levantando más kilos que tus rivales. | One-button weightlifting. Win the final by lifting more than your rivals. |
| `bienvenida.nombre` | nuevo | ¿Cómo te llamás? | What's your name? |
| `bienvenida.nombre_ph` | nuevo | Tu nombre o apodo | Your name or nickname |
| `bienvenida.nombre_nota` | nuevo | Sale en el tablero y en el podio. Queda solo en este dispositivo. | It goes on the scoreboard and the podium. It stays on this device. |
| `bienvenida.nombre_defecto` | nuevo | Debutante | Rookie |
| `bienvenida.vuelve` | nuevo | Hola de nuevo, {nombre}. | Welcome back, {nombre}. |
| `bienvenida.no_soy` | nuevo | No soy yo | Not me |
| `bienvenida.quedan` | nuevo | Te quedan {n} finales gratis | {n} free finals left |
| `bienvenida.quedan_1` | nuevo | Te queda 1 final gratis | 1 free final left |
| `bienvenida.anotado` | nuevo | Estás en la lista · juego libre | You're on the list · unlimited play |
| `bienvenida.desafio` | nuevo (`?c=`) | Te desafiaron a ganar la final. ¿Te animás? | You've been challenged to win the final. You in? |
| `bienvenida.jugar` | «Empezar» | Jugar | Play |
| `bienvenida.opciones` | nuevo (plegable) | Opciones | Options |
| `pesista.titulo` | «Elegí tu pesista» | {nombre}, elegí tu pesista | {nombre}, pick your lifter |
| `pesista.compacto` | «Compacto · 1,70 m», lema, «Perdona el ritmo…», Tope | Compacto · 1,70 m · Perdona si tocás un poco a destiempo. | Compact · 1.70 m · Forgives timing that's a bit off. |
| `pesista.largo` | «Largo · 1,83 m», lema, «Ritmo neutro…», Tope | Largo · 1,83 m · Se cansa poco y crece bajo presión. | Long · 1.83 m · Tires slowly, rises under pressure. |
| `pesista.potente` | «Potente · 1,76 m», lema, «Exige precisión…», Tope | Potente · 1,76 m · Muy fuerte, pero pide precisión y se cansa rápido. | Powerful · 1.76 m · Very strong, but needs precise timing and tires fast. |
| `opciones.controles` | «Controles» | Controles | Controls |
| `opciones.un_toque` | «Fácil» | Un toque | One tap |
| `opciones.pro` | «Clásico» | Pro (mantener y soltar) | Pro (hold and release) |
| `opciones.rivales` | «Rivales:» | Rivales | Rivals |
| `opciones.tranquilos` | «Amistoso» | Tranquilos | Relaxed |
| `opciones.parejos` | «Normal» | Parejos | Even |
| `opciones.duros` | «Difícil» | Duros | Tough |
| `opciones.final` | «Final:» | Final | Final |
| `opciones.rapida` | «Exprés» | Rápida (5 min) | Quick (5 min) |
| `opciones.completa` | «Completa» | Completa (11 min) | Full (11 min) |
| `opciones.repetir_practica` | «Repetir tutorial» | Repetir la práctica | Replay practice |
| `opciones.sin_calentar` | «Empezar sin calentamiento» (Pro) | Empezar sin calentamiento | Start without warm-up |
| `opciones.nota_practica` | «La primera vez: un levantamiento guiado…» | La primera vez hay una práctica guiada de menos de un minuto. | First time: a guided practice, under a minute. |

**Práctica (tutorial guiado)**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `practica.tarjeta` | nuevo | Arranque: la barra va del piso a arriba de la cabeza en un solo tirón. Vos marcás el momento; tu pesista pone la fuerza. | Snatch: the bar goes from the floor to overhead in one move. You call the timing; your lifter brings the strength. |
| `practica.probar` | nuevo | Probar | Try it |
| `practica.etiqueta` | «Tutorial · el juego espera cada toque» | Práctica · el juego te espera | Practice · the game waits for you |
| `practica.saltar` | «Saltear tutorial» | Saltear práctica | Skip practice |
| `practica.mira` | «Mirá el círculo: cuando se cierra sobre el aro, tocás.» | Mirá el círculo: cuando llega al aro, tocás. | Watch the circle: when it hits the ring, tap. |
| `practica.paso` | «{paso} de {de}» | {n} de {de} | {n} of {de} |
| `guia.tira` | «¡TIRÁ! {A} para empezar el levantamiento.» | ¡TIRÁ! {A} para levantar. | PULL! {A} to lift. |
| `guia.explota` | «¡EXPLOTÁ! El círculo se cerró: {t} ahora.» | ¡EXPLOTÁ! La barra pasa las rodillas: es el empujón fuerte. Círculo en el aro: {t} ahora. | EXPLODE! The bar passes the knees: big push now. Circle on the ring: {t} now. |
| `guia.recibi` | «¡RECIBÍ! Otra vez: círculo cerrado, {t}.» | ¡AGARRALA! Metete abajo de la barra con los brazos estirados. Círculo en el aro: {t}. | CATCH! Drop under the bar with straight arms. Circle on the ring: {t}. |
| `guia.empuja` | «¡EMPUJÁ! La subida se trabó…» | ¡EMPUJÁ! Está pesada: {T} rápido, muchas veces, hasta quedar de pie. | PUSH! It's heavy: {T} fast, again and again, until you stand up. |
| `guia.aguanta` | «AGUANTÁ. No toques nada: espera la chicharra…» | AGUANTÁ quieto: los jueces miran. Después baja solo. | HOLD still: the judges are watching. Then it comes down by itself. |
| `guia.flexiona` | «¡FLEXIONÁ! {A}. Enseguida ¡ARRIBA!…» | Barra en los hombros. ¡FLEXIONÁ! {A}; después ¡ARRIBA! y ¡AGARRALA! con el círculo. | Bar on your shoulders. DIP! {A}; then UP! and CATCH! with the circle. |
| `practica.fin` | «Así se hace. Ahora, la final» | ¡Vale! Eso fue un arranque. En la final hacés 3, después 3 de dos tiempos, contra 2 rivales. | Good lift! That was a snatch. In the final you get 3, then 3 clean & jerks, against 2 rivals. |

**Cómo se gana (reemplaza «Presentación»)**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `gana.titulo` | «Presentación» | Cómo se gana | How to win |
| `gana.l1` | nuevo | Cada uno tiene 3 intentos de arranque y 3 de dos tiempos. | Everyone gets 3 snatch attempts and 3 clean & jerk attempts. |
| `gana.l2` | nuevo | Hay 3 jueces: con 2 luces blancas, el levantamiento vale. | 3 judges: 2 white lights and the lift counts. |
| `gana.l3` | nuevo | Tu total es tu mejor arranque más tu mejor dos tiempos. El total más alto gana el oro. | Your total is your best snatch plus your best clean & jerk. Highest total wins gold. |
| `gana.rivales` | «Guion de la final:» | Tus rivales hoy | Your rivals today |
| `gana.vos` | «· vos» | vos | you |
| `gana.abre` | «Abre con {s} y {c}» | Empieza con {s} y {c} kg | Opens at {s} and {c} kg |
| `gana.forma` | «Tu forma del día: arranque {x}, dos tiempos {y}…» | Cómo te sentís hoy: arranque {s}, dos tiempos {c}. | How you feel today: snatch {s}, clean & jerk {c}. |
| `forma.liviano` | «sale liviano» | mejor que nunca | better than ever |
| `forma.normal` | «normal» | normal | normal |
| `forma.pesado` | «viene pesado» | algo pesado | a bit heavy |
| `guion.nada` | «Sin novedades: los tres llegan enteros.» | Los tres llegan descansados. | All three arrive fresh. |
| `guion.tocado` | «{n} llega tocado: empieza con 85 de Resto.» | {rival} llega cansado: arranca con menos energía. | {rival} arrives tired: starts with less energy. |
| `guion.forma` | «{n} llega en su mejor forma (+2 kg…)» | {rival} está en su mejor día: levanta un poco más de lo normal. | {rival} is having a great day: a bit stronger than usual. |
| `gana.seguir` | botón de seguir | A la tarima | Let's go |

**Primer peso, intervalo y llamado**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `peso.titulo_s` | «Tu apertura (primer intento) de arranque» | ¿Con cuántos kilos empezás el arranque? | How much weight for your first snatch? |
| `peso.titulo_c` | ídem, dos tiempos | ¿Con cuántos kilos empezás el dos tiempos? | How much weight for your first clean & jerk? |
| `peso.boton` | «Confirmar» | Empezar con {kg} kg | Start with {kg} kg |
| `peso.rango` | «Entre {lo} y {hi} kg. Sugerida: {s} kg.» | Entre {lo} y {hi} kg. | Between {lo} and {hi} kg. |
| `peso.ayuda` | «Una apertura alta ahorra un intento; tres nulos te dejan sin marca.» | Empezar más bajo es más seguro. Si fallás los 3 intentos, te quedás sin total. | Starting lower is safer. Miss all 3 and you get no total. |
| `peso.teclas` | «← → cambian los kilos, ENTER confirma.» | ← → cambian los kilos, ENTER confirma. | ← → change the weight, ENTER confirms. |
| `intervalo.titulo` | «Intervalo» | Terminó el arranque | Snatch done |
| `intervalo.texto` | «Descanso: los tres recuperan energía (15 de Resto).» | Vas en el puesto {n}. Ahora el dos tiempos: la barra va primero a los hombros y después arriba de la cabeza. Los tres recuperan energía. | You're in {pos} place. Now the clean & jerk: bar to the shoulders first, then overhead. Everyone gets some energy back. |
| `lev.s` | «Arranque» (`LEV.s`) | Arranque | Snatch |
| `lev.c` | «Dos tiempos» (`LEV.c`) | Dos tiempos | Clean & jerk |
| `lev.t` | «total» | total | total |
| `llamado.titulo` | «{nombre} · Arranque · intento 2» | {quien} · {lev} · intento {n} de 3 | {quien} · {lev} · attempt {n} of 3 |
| `entrenador.facil` | «Entrenador: «Sale caminando.»» | Entrenador: «Este sale.» | Coach: “You've got this.” |
| `entrenador.pelea` | «Entrenador: «Es para pelearla.»» | Entrenador: «Se puede, pero hay que pelearlo.» | Coach: “Doable, but you'll have to fight for it.” |
| `entrenador.dificil` | «Entrenador: «Es un tiro.»» | Entrenador: «Es mucho: casi imposible.» | Coach: “That's a long shot.” |
| `llamado.mas_dificil` | «Más kilos, más difícil» | Más kilos, más difícil. | More weight, harder lift. |
| `cuenta.oro` | «Para el oro: {kg}» | Con {kg} kg ganás el oro. | Lift {kg} kg to win gold. |
| `cuenta.plata` | «Plata asegurada con {kg}» | Con {kg} kg te asegurás la plata. | {kg} kg locks in silver. |
| `cuenta.sin_arranque` | «El oro no depende de vos» | Sin un arranque válido no hay total: este va por el orgullo. | No good snatch means no total: this one's for pride. |
| `cuenta.liderar` | «Para liderar el arranque: {kg}» | Con {kg} kg pasás al frente en el arranque. | {kg} kg puts you in the lead on the snatch. |
| `ficha.titulo` | «Kilos:» | Kilos: | Weight: |
| `ficha.seguro` | «Seguro» | Seguro | Safe |
| `ficha.justo` | «Justo» | Justo | Tight |
| `ficha.arriesgado` | «Arriesgado» | Arriesgado | Risky |
| `llamado.sin_apuro` | «Sin apuro: el reloj ({seg}) arranca cuando confirmás. Después…» | Sin apuro: el reloj arranca cuando confirmás. Después, {t} en ¡TIRÁ! | No rush: the clock starts when you confirm. Then {t} on PULL! |
| `llamado.corre` | «El reloj ya corre. Confirmá y el pesista se prepara.» | El reloj ya corre. Confirmá y tu pesista se prepara. | The clock is running. Confirm and your lifter gets ready. |
| `llamado.confirmar` | «Confirmar» | Confirmar | Confirm |
| `llamado.barra_no_baja` | nuevo, la primera vez | La barra nunca baja: si fallás, repetís el mismo peso o subís. | The bar never goes down: miss and you repeat the weight or go up. |
| `llamado.dt_primera` | «Dos tiempos: empieza igual que el arranque…» | Dos tiempos: empieza igual que el arranque. Con la barra en los hombros el juego te espera: 3 toques más, ¡FLEXIONÁ!, ¡ARRIBA! y ¡AGARRALA! | Clean & jerk: starts like the snatch. With the bar on your shoulders the game waits: 3 more taps, DIP!, UP! and CATCH! |
| `llamado.cambio` | «Cambiaste los kilos (pedido: X). Se puede dos veces…» | Cambiaste los kilos (pedido: {kg}). Podés cambiar 2 veces. Ojo: el que pide menos kilos levanta primero. | You changed the weight (now {kg} kg). You can change it twice. Heads up: whoever asks for less weight lifts first. |
| `llamado.fijo` | «Los kilos ya no se pueden cambiar.» | Ya no se pueden cambiar los kilos. | The weight is locked now. |
| `llamado.no_baja` | nuevo (tooltip del − bloqueado) | No se puede bajar: la barra ya tiene {kg} kg. | Can't go lower: the bar already has {kg} kg. |
| `llamado.mas_opciones` | «Más opciones» | Más opciones | More options |
| `llamado.menos_opciones` | «Menos opciones» | Menos opciones | Fewer options |
| `llamado.pedido` | «Pedido: {kg} kg · mínimo {min} · cambios {c} de 2» | Pedido: {kg} kg · mínimo {min} · cambios {c} de 2 | Your weight: {kg} kg · minimum {min} · changes {c} of 2 |
| `llamado.declarado` | «Declarado: … (cerrados)» (Pro) | Pedido: {kg} kg · mínimo {min} · cambios {c} de 2 (cerrados) | Your weight: {kg} kg · minimum {min} · changes {c} of 2 (locked) |
| `llamado.cambio_pro` | «confirmar cuenta como cambio; si otro pidió menos, sale antes» | Confirmar cuenta como cambio; si otro pidió menos, levanta antes. | Confirming counts as a change; if someone asked for less, they lift first. |
| `envion.titulo` | «Envión:» | Envión: | Jerk: |
| `envion.split` | «Tijera» | Tijera | Split |
| `envion.power` | «Power» | Power | Power |
| `envion.squat` | «Squat» | Sentadilla | Squat |
| `envion.no_domina` | «* envión que no domina: menos altura y menos desvío tolerado» | * no es su estilo: menos altura y menos margen | * not their style: less height, less margin |
| `desplazado.titulo` | «{nombre} pasa a {kg} kg» | {quien} pasa a {kg} kg | {quien} moves to {kg} kg |
| `desplazado.texto` | «Otro pesista pidió menos: sale antes. Tu reloj vuelve a empezar.» | Otro pidió menos kilos y levanta antes. Tu reloj vuelve a empezar. | Someone asked for less and lifts first. Your clock restarts. |

**Señal (controles.js y senal.js)**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `senal.prep` | «PREPARATE» | PREPARATE | GET READY |
| `senal.respira` | «RESPIRÁ» | RESPIRÁ | BREATHE |
| `senal.amague` | «AMAGUE» | ¡MUY PRONTO! | TOO SOON! |
| `senal.amague_sub` | «muy temprano · esperá el círculo» | esperá el círculo | wait for the circle |
| `senal.amague_ultimo` | «muy temprano · otro más y es fallo» | otro más y es fallo | one more and it's a miss |
| `senal.amague_pro` | «muy temprano: de nuevo» | muy pronto: de nuevo | too soon: again |
| `senal.tira` | «¡TIRÁ!» | ¡TIRÁ! | PULL! |
| `senal.tira_sub` | «Apretá {T} para empezar el levantamiento» | {A} para levantar | {A} to lift |
| `senal.explota` | «¡EXPLOTÁ!» | ¡EXPLOTÁ! | EXPLODE! |
| `senal.recibi` | «¡RECIBÍ!» | ¡AGARRALA! | CATCH! |
| `senal.empuja` | «¡EMPUJÁ!» | ¡EMPUJÁ! | PUSH! |
| `senal.empuja_sub` | «tocá rápido: que no te alcance el rojo» | tocá rápido: que no te alcance el rojo | tap fast: stay ahead of the red |
| `senal.aguanta` | «AGUANTÁ» | AGUANTÁ | HOLD |
| `senal.aguanta_sub` | «no toques nada» | no toques nada | don't touch |
| `senal.abajo` | «¡ABAJO!» | ¡ABAJO! | DOWN! |
| `senal.abajo_sub` | «baja solo» | baja solo | it comes down by itself |
| `senal.flexiona` | «¡FLEXIONÁ!» | ¡FLEXIONÁ! | DIP! |
| `senal.flexiona_sub` | «Apretá {T} para el envión» | {A} para subirla | {A} to drive it up |
| `senal.arriba` | «¡ARRIBA!» | ¡ARRIBA! | UP! |
| `senal.quedan` | «¡Quedan {s} s! Apretá ESPACIO» | ¡Quedan {s} s! {A} | {s} s left! {A} |
| `senal.aprieta` | «APRETÁ Y MANTENÉ» (Pro) | APRETÁ Y MANTENÉ | PRESS AND HOLD |
| `senal.aprieta_sub` | «con el anillo lleno» | con el anillo lleno | when the ring is full |
| `senal.suelta` | «¡SOLTÁ!» (Pro) | ¡SOLTÁ! | RELEASE! |
| `senal.suelta_sub` | «cuando la barra llega a la línea» | cuando la barra llega a la línea | when the bar hits the line |
| `senal.suelta2_sub` | «en el fondo de la flexión» | en el fondo de la flexión | at the bottom of the dip |
| `senal.recibe_pro` | «¡APRETÁ!» | ¡APRETÁ! | PRESS! |
| `senal.recibe_pro_sub` | «para recibir» | para agarrarla | to catch it |
| `senal.empuja_pro_sub` | «tocá repetido, sin pasarte de la franja» | tocá repetido, sin pasarte de la franja | tap repeatedly, don't overshoot the band |
| `senal.deja` | «DEJÁ APRETADO» | DEJÁ APRETADO | KEEP HOLDING |
| `senal.deja_sub` | «hasta la chicharra» | hasta el pitido | until the buzzer |
| `senal.abajo_pro_sub` | «sonó la chicharra» | sonó el pitido | buzzer went |
| `palabra.perfecto` | «PERFECTO» | PERFECTO | PERFECT |
| `palabra.bien` | «BIEN» | BIEN | GOOD |
| `palabra.temprano` | «TEMPRANO» | TEMPRANO | EARLY |
| `palabra.tarde` | «TARDE» | TARDE | LATE |
| `palabra.muy_temprano` | «MUY TEMPRANO» | MUY PRONTO | TOO SOON |
| `palabra.todavia` | «TODAVÍA NO» | TODAVÍA NO | NOT YET |
| `acuse.espera` | «ESPERÁ» | ESPERÁ | WAIT |
| `acuse.temprano` | «TODAVÍA NO» | TODAVÍA NO | NOT YET |
| `acuse.rebote` | «REBOTE» | DOBLE TOQUE | DOUBLE TAP |
| `acuse.sobra` | «SOBRA» | NO HACE FALTA | NOT NEEDED |
| `acuse.tarde` | «TARDE» | TARDE | LATE |
| `acuse.termino` | «TERMINÓ» | YA TERMINÓ | ALL DONE |
| `acuse.pausa` | «PAUSA» | PAUSA | PAUSED |
| `acuse.mouse` | «TECLADO» | USÁ ESPACIO | USE SPACE |
| `tension.perfecta` | «TENSIÓN PERFECTA» (Pro) | TENSIÓN PERFECTA | PERFECT TENSION |
| `tension.buena` | «BUENA TENSIÓN» | BUENA TENSIÓN | GOOD TENSION |
| `tension.floja` | «TENSIÓN FLOJA» | TENSIÓN FLOJA | LOOSE TENSION |

**Veredicto, rivales y tabla**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `veredicto.vale` | «Levantamiento válido» / «Válido» | ¡VALE! | GOOD LIFT! |
| `veredicto.no_vale` | «Levantamiento nulo» / «Nulo» | NO VALE | NO LIFT |
| `veredicto.cayo` | «Intento fallado» / «Fallado» | SE CAYÓ | DROPPED |
| `veredicto.luces` | «jueces {b} a {r}» | {b} de 3 jueces dijeron que sí | {b} of 3 judges said yes |
| `veredicto.primer_no_vale` | nuevo, una vez | Para que valga, 2 de los 3 jueces tienen que poner luz blanca. | To count, 2 of the 3 judges must show a white light. |
| `veredicto.repeticion` | «Repetición» | Repetición | Replay |
| `veredicto.camara_lenta` | «cámara lenta» | cámara lenta | slow motion |
| `rival.resultado` | «{Válido} · {causa} · {b} a {r}» | {veredicto} · {causa} ({b} de 3) | {veredicto} · {causa} ({b} of 3) |
| `rival.aprieta` | «{rival} aprieta los dientes» | {rival} aprieta los dientes | {rival} grits their teeth |
| `rival.respira` | «{rival} respira» | {rival} respira | {rival} breathes out |
| `rival.cambia` | «{país} cambia a {kg}» | {rival} pide {kg} kg | {rival} asks for {kg} kg |
| `rival.cambia_sub` | «{nombre} · antes {de} kg» | antes: {de} kg | was {de} kg |
| `rival.seguir` | «{Tocá/ESPACIO} para seguir.» | {T} para seguir. | {T} to continue. |
| `carga.cambio` | «Cambio de carga · {kg} kg» | Cargan la barra: {kg} kg | Loading the bar: {kg} kg |
| `causa.anticipado` | «Tirón anticipado» | Tiró antes de tiempo | Pulled too early |
| `causa.sin_altura` | «Tirón sin altura» | No le dio la altura | Not enough height |
| `causa.adelante` | «Barra adelante» | Se le fue adelante | Lost it forward |
| `causa.atras` | «Barra atrás» | Se le fue atrás | Lost it behind |
| `causa.fondo` | «La pierde en el fondo» | No la agarró abajo | Missed the catch |
| `causa.aplastado` | «Aplastado» | No se pudo parar | Couldn't stand up |
| `causa.codos` | «Ceden los codos» | No aguantaron los brazos | Arms gave out |
| `causa.temblor` | «Pierde la barra arriba» | Se le cayó arriba | Lost it overhead |
| `causa.devuelve` | «Devuelve la barra» | La devolvió al piso | Put it back down |
| `causa.codos_blandos` | «Codos blandos» | Brazos flojos arriba | Soft arms overhead |
| `causa.tiembla` | «Llega temblando» | Tembló arriba | Wobbled overhead |
| `causa.antes` | «Suelta antes de la chicharra» | Bajó antes del pitido | Dropped before the buzzer |
| `causa.sin_apoyo` | «No fija la barra» | No la sostuvo quieta | Didn't hold it still |
| `causa.reloj` | «Se acabó el reloj» | Se acabó el reloj | Ran out of time |
| `tabla.arranque` | «Arranque» | Arranque | Snatch |
| `tabla.dos_tiempos` | «Dos tiempos» | Dos tiempos | Clean & jerk |
| `tabla.total` | «Total» | Total | Total |
| `tabla.energia` | «Resto» | Energía | Energy |
| `tabla.sin_total` | «SM» | — (con `title` «sin total») | — (with `title` «no total») |
| `etiqueta.record` | «Récord» | Récord del torneo | Competition record |
| `etiqueta.todo_o_nada` | «A todo o nada» | Último intento: todo o nada | Last try: all or nothing |
| `etiqueta.oro` | «Para el oro» | Para el oro | For gold |
| `etiqueta.medalla` | «Para medalla» | Para una medalla | For a medal |
| `etiqueta.frente` | «Para pasar al frente» | Para pasar al frente | To take the lead |

**Línea de qué corregir (`explicar()`): Un toque.** En estas plantillas, `{verbo}` es ¡EXPLOTÁ! o, en el envión, ¡ARRIBA! (en inglés, EXPLODE! o UP!).

| Clave | Español | Inglés |
|---|---|---|
| `explica.sin_altura.no_toco` | No tocaste {verbo}. {T} {cuando}. | You didn't tap {verbo}. {T} {cuando}. |
| `explica.sin_altura.tardio` | Tocaste {verbo} tarde: el momento ya había pasado. {T} {cuando}, no después. | You hit {verbo} late: the moment had passed. {T} {cuando}, not after. |
| `explica.sin_altura` | Tocaste {verbo} {cuanto} y la barra no subió. {T} {cuando}. | You hit {verbo} {cuanto} and the bar didn't rise. {T} {cuando}. |
| `explica.anticipado` | Tocaste {verbo} antes de tiempo tres veces. Esperá a que el círculo llegue al aro. | You hit {verbo} too soon three times. Wait for the circle to hit the ring. |
| `explica.adelante` | Tocaste {verbo} {cuanto} y la barra se fue adelante. Esperá a que el círculo llegue al aro. | You hit {verbo} {cuanto} and the bar drifted forward. Wait for the circle to hit the ring. |
| `explica.atras` | Tocaste {verbo} {cuanto} y la barra se fue atrás. {T} apenas el círculo llega al aro. | You hit {verbo} {cuanto} and the bar drifted back. {T} as soon as the circle hits the ring. |
| `explica.fondo.temprano` | Tocaste ¡AGARRALA! antes de tiempo. Un toque por señal: esperá el círculo. | You hit CATCH! too soon. One tap per signal: wait for the circle. |
| `explica.fondo.tardio` | Tocaste ¡AGARRALA! tarde: la barra ya se había caído. {T} {cuando}, no después. | You hit CATCH! late: the bar had already dropped. {T} {cuando}, not after. |
| `explica.fondo` | No agarraste la barra. {T} ¡AGARRALA! {cuando}. | You didn't catch the bar. {T} CATCH! {cuando}. |
| `explica.empuje.sin_toques` | Estaba pesada y no empujaste. En ¡EMPUJÁ!, {t} rápido muchas veces. | It was heavy and you didn't push. On PUSH!, {t} fast, many times. |
| `explica.empuje.destiempo` | Tocaste {verbo} {cuanto} y la barra quedó más pesada: no alcanzó el empuje. {T} {cuando}. | You hit {verbo} {cuanto} and the bar got heavier: not enough push. {T} {cuando}. |
| `explica.empuje.ritmo` | Los toques venían bien: faltó empuje. En ¡EMPUJÁ!, {t} más rápido. | Your taps were good: you needed more push. On PUSH!, {t} faster. |
| `explica.empuje.menos_kilos` | ; si no alcanza, pedí menos kilos | ; if that's not enough, ask for less weight |
| `explica.codos_blandos` | Tocaste ¡AGARRALA! {cuanto}: los brazos quedaron flojos y los jueces lo vieron. Tocá un poco {ajuste}. | You hit CATCH! {cuanto}: your arms were soft and the judges saw it. Tap a bit {ajuste}. |
| `explica.codos_blandos.gen` | Agarraste a destiempo y los brazos quedaron flojos. Tocá ¡AGARRALA! justo cuando el círculo llega al aro. | You caught it off time and your arms were soft. Hit CATCH! right as the circle hits the ring. |
| `explica.temblor` | Tocaste {verbo} {cuanto}: la barra llegó torcida y tembló. Tocá un poco {ajuste}. | You hit {verbo} {cuanto}: the bar arrived crooked and wobbled. Tap a bit {ajuste}. |
| `explica.temblor.gen` | La barra llegó torcida y tembló. Tocá {verbo} más cerca del aro. | The bar arrived crooked and wobbled. Time {verbo} closer to the ring. |
| `explica.devuelve` | Pasaron 8 segundos con la barra en los hombros. {A} para ¡FLEXIONÁ! | 8 seconds with the bar on your shoulders. {A} for DIP! |
| `explica.reloj.sin_confirmar` | Se acabó el reloj. Confirmá y {t} antes de que llegue a 0:00. | Time ran out. Confirm and {t} before 0:00. |
| `explica.reloj` | Se acabó el reloj: corre desde que confirmás. {A} apenas dice ¡TIRÁ! | Time ran out: it starts when you confirm. {A} as soon as it says PULL! |

**Línea de qué corregir: Pro.** Conserva los ms y la mecánica de mantener y soltar.

| Clave | Español | Inglés |
|---|---|---|
| `explica.pro.sin_altura.no_solto` | No soltaste a tiempo. Soltá cuando la barra llega a la línea. | You didn't release in time. Release when the bar hits the line. |
| `explica.pro.sin_altura` | Soltaste muy {temprano/tarde} y la barra no subió. Soltá cuando la barra llega a la línea. | You released way too {early/late} and the bar didn't rise. Release when the bar hits the line. |
| `explica.pro.anticipado` | Soltaste antes de tiempo. Soltá cuando la barra llega a la línea. | You released too soon. Release when the bar hits the line. |
| `explica.pro.adelante` | Soltaste temprano y la barra se fue adelante. Esperá a que llegue a la línea. | You released early and the bar drifted forward. Wait for it to hit the line. |
| `explica.pro.atras` | Soltaste tarde y la barra se fue atrás. Soltá apenas llega a la línea. | You released late and the bar drifted back. Release as soon as it hits the line. |
| `explica.pro.fondo.temprano` | Apretaste para agarrarla antes de tiempo. Esperá a que el anillo se cierre. | You pressed to catch too soon. Wait for the ring to close. |
| `explica.pro.fondo` | No agarraste la barra. {A} cuando el anillo se cierra. | You didn't catch the bar. {A} when the ring closes. |
| `explica.pro.empuje.sin_toques` | La subida se trabó y no empujaste. {T} repetido hasta la franja verde. | It stalled and you didn't push. {T} repeatedly up to the green band. |
| `explica.pro.empuje` | No alcanzó el empuje: venías a destiempo. Mantené la flecha en la franja verde. | Not enough push: your timing was off. Keep the arrow in the green band. |
| `explica.pro.codos_blandos` | Agarraste {temprano/tarde} y los brazos quedaron flojos. Apretá justo cuando el anillo se cierra. | You caught it {early/late} and your arms were soft. Press right as the ring closes. |
| `explica.pro.temblor` | La barra tembló: llegó torcida o empujaste de más. Soltá más justo y no pases la franja verde. | The bar wobbled: it arrived crooked or you pushed too much. Release more precisely and stay inside the green band. |
| `explica.pro.reloj.sin_confirmar` | Se acabó el reloj. Confirmá con ENTER y apretá ESPACIO antes de 0:00. | Time ran out. Confirm with ENTER and press SPACE before 0:00. |
| `explica.pro.reloj` | Se acabó el reloj. {A} para empezar antes de 0:00. | Time ran out. {A} to start before 0:00. |
| `explica.pro.antes` | Soltaste antes del pitido. Dejá apretado hasta ¡ABAJO! (táctil: «No levantes el dedo») | You let go before the buzzer. Keep holding until DOWN! (touch: «Keep your finger down») |
| `explica.pro.sin_apoyo` | No dejaste apretado al quedar de pie. {mantene} hasta ¡ABAJO! | You didn't hold once standing. {mantene} until DOWN! |
| `tecla.mantene` | Mantené ESPACIO / Dejá el dedo apoyado | Hold SPACE / Keep your finger down |

**Calentamiento de Pro**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `cal.titulo` | «Calentamiento · ritmo» | Calentamiento · ritmo | Warm-up · rhythm |
| `cal.texto` | «{Tocá} junto con cada pulso ({N} toques). Sirve para medir el atraso…» | {T} junto con cada pulso ({n} toques). Sirve para medir el atraso de tu dispositivo. | {T} with each beat ({n} taps). It measures your device's delay. |
| `cal.saltear` | «Saltear» | Saltear | Skip |
| `cal.medido` | «Atraso medido: {ms} ms» | Atraso medido: {ms} ms | Measured delay: {ms} ms |
| `cal.medido_texto` | «La corrección queda fija para toda la partida…» | La corrección queda fija toda la final. Solo se usa al medir tus gestos con ventana. | The correction stays fixed for the whole final. It's only used to time your windowed moves. |
| `cal.usar` | «Usar {ms} ms» | Usar {ms} ms | Use {ms} ms |
| `cal.dejar` | «Dejar {ms} ms» | Dejar {ms} ms | Keep {ms} ms |
| `cal.n` | «Calentamiento {k} de {n}» | Calentamiento {k} de {n} | Warm-up {k} of {n} |
| `cal.probar` | «Probar» | Probar | Try it |
| `cal.saltear_todo` | «Saltear calentamiento» | Saltear calentamiento | Skip warm-up |
| `cal.s_liviano` | «Arranque liviano: apretá con el anillo lleno…» | Arranque liviano: apretá con el anillo lleno y mantené, soltá cuando la barra llega a la línea, apretá cuando el círculo se cierra y dejá apretado hasta ¡ABAJO! | Light snatch: press when the ring is full and hold, release when the bar hits the line, press when the circle closes and hold until DOWN! |
| `cal.c_liviano` | «Dos tiempos liviano: lo mismo, y con la barra en los hombros…» | Dos tiempos liviano: lo mismo, y con la barra en los hombros otra vez apretar, soltar en el fondo de la flexión y apretar para agarrarla ({envion}). | Light clean & jerk: the same, then with the bar on your shoulders press again, release at the bottom of the dip and press to catch ({envion}). |
| `cal.s_pesado` | «Arranque pesado: la subida se traba…» | Arranque pesado: la subida se traba. Tocá repetido para llevar la flecha a la franja verde, sin pasarte: empujar de más hace temblar. | Heavy snatch: it stalls. Tap repeatedly to bring the arrow to the green band, no further: too much push makes it wobble. |

**Podio, compartir e invitación**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `podio.oro` | «¡Oro!» | ¡Oro para {nombre}! | Gold for {nombre}! |
| `podio.plata` | «Plata» | Plata para {nombre} | Silver for {nombre} |
| `podio.bronce` | «Bronce» | Bronce para {nombre} | Bronze for {nombre} |
| `podio.sin_total` | «Sin marca» | {nombre} se queda sin total | {nombre} gets no total |
| `medalla.oro` | «Oro» | Oro | Gold |
| `medalla.plata` | «Plata» | Plata | Silver |
| `medalla.bronce` | «Bronce» | Bronce | Bronze |
| `podio.vacio` | «vacío» | vacío | empty |
| `podio.mejores` | «Mejor arranque: … · Mejor dos tiempos: …» | Mejor arranque: {a} · Mejor dos tiempos: {c} | Best snatch: {a} · Best clean & jerk: {c} |
| `podio.record` | «{nombre}: récord de arranque ({kg})» | {quien}: récord del torneo en {lev} ({kg} kg) | {quien}: competition record in the {lev} ({kg} kg) |
| `podio.otra` | «Revancha» | Jugar otra vez | Play again |
| `podio.otra_quedan` | nuevo | Jugar otra vez · te queda 1 final gratis | Play again · 1 free final left |
| `podio.cambiar` | «Cambiar pesista» | Cambiar de pesista | Switch lifter |
| `podio.compartir` | nuevo | Compartir resultado | Share result |
| `compartir.texto` | nuevo (portapapeles y `navigator.share`) | Tarima · {medalla} · {total} kg↵Arranque {marcas_s}↵Dos tiempos {marcas_c}↵¿Me ganás? {link} | Tarima · {medalla} · {total} kg↵Snatch {marcas_s}↵Clean & jerk {marcas_c}↵Can you beat me? {link} |
| `compartir.copiado` | nuevo | Copiado. Pegalo donde quieras. | Copied. Paste it anywhere. |
| `invitacion.titulo` | nuevo (podio 1) | ¿Te avisamos cuando salga el juego completo? | Want a heads-up when the full game is out? |
| `invitacion.cuerpo` | nuevo | Anotate ahora y además jugás sin límite. | Join now and play with no limit, too. |
| `invitacion.boton` | nuevo | Anotarme | Join |
| `invitacion.cerrar` | nuevo (✕, `aria-label`) | Ahora no | Not now |

`{marcas_s}` y `{marcas_c}` son tres signos, ✅ por cada intento válido y ❌ por cada uno que no valió. No van nombre ni datos.

**Muro**

| Clave | Español | Inglés |
|---|---|---|
| `muro.titulo` | {nombre}, jugaste tus {n} finales gratis. | {nombre}, you've played your {n} free finals. |
| `muro.titulo_1` | {nombre}, jugaste tu final gratis. | {nombre}, you've played your free final. |
| `muro.titulo_ip` | Desde esta conexión ya se jugaron las finales gratis. | The free finals on this connection are used up. |
| `muro.promesa` | Estamos armando el juego completo: tu propio pesista, pesistas mujeres, categorías de peso y sedes nuevas. Vos nos ayudás a elegir qué llega primero. | We're building the full game: your own lifter, women lifters, weight classes and new venues. You help us pick what comes first. |
| `muro.camino_mail` | Dejá tu mail y seguí jugando sin límite. | Leave your email and keep playing, no limit. |
| `muro.camino_encuesta` | ¿Sin mail? Contestá 4 preguntas y jugá 2 finales más. | No email? Answer 4 questions and play 2 more finals. |
| `muro.encuesta_boton` | Contestar (1 minuto) | Answer (1 minute) |
| `muro.solo_mail` | Ya usaste las finales de la encuesta. Para seguir, dejá tu mail. | You've used your survey finals. To keep playing, leave your email. |
| `muro.otro_dispositivo` | ¿Ya te anotaste en otro dispositivo? Poné el mismo mail. | Already joined on another device? Use the same email. |
| `muro.ahora_no` | Ahora no | Not now |
| `muro.despues` | Cuando quieras, acá está. Mientras, podés compartir tu resultado. | Whenever you're ready, it's here. Meanwhile, share your result. |

Variantes de la bandera `muro-texto`: la `a` usa `muro.promesa` y `muro.camino_mail`; la `b`, estas dos claves.

| Clave | Español | Inglés |
|---|---|---|
| `muro.promesa_b` | Tarima recién empieza y lo estamos armando con los primeros que se anotan. | Tarima is just getting started, and we're building it with the first people who join. |
| `muro.camino_mail_b` | Anotate para seguir jugando gratis, sin límite. | Join to keep playing free, no limit. |

**Formulario de la lista**

| Clave | Español | Inglés |
|---|---|---|
| `lista.mail` | Tu mail | Your email |
| `lista.mail_ph` | nombre@ejemplo.com | name@example.com |
| `lista.aviso` | Quiero que Tarima me avise por mail cuando abra el acceso anticipado. | Email me when Tarima's early access opens. |
| `lista.novedades` | También quiero novedades del juego (como mucho 1 por mes). | Also send me game news (at most once a month). |
| `lista.legal` | Usamos tu mail solo para esto; no lo vendemos ni lo compartimos. Te das de baja con un clic desde cualquier mail. Tus partidas quedan ligadas a un número interno de la lista, nunca a tu mail. Solo mayores de 16. Privacidad | We use your email only for this; we never sell or share it. Unsubscribe in one click from any email. Your games are linked to an internal list number, never to your email. 16+ only. Privacy |
| `lista.boton` | Anotarme y seguir jugando | Join and keep playing |
| `lista.enviando` | Anotando… | Joining… |
| `lista.error_formato` | Ese mail no parece completo. ¿Lo revisás? | That email doesn't look right. Mind checking it? |
| `lista.sugerencia` | ¿Quisiste decir {sugerido}? | Did you mean {sugerido}? |
| `lista.error_dominio` | Ese dominio no recibe mails. Probá con otro. | That domain can't receive email. Try another one. |
| `lista.error_descartable` | Necesitamos un mail que vayas a leer: los temporales no sirven. | We need an email you'll actually read: temporary ones won't work. |
| `lista.error_aviso` | Marcá la casilla para que podamos avisarte. | Tick the box so we can let you know. |
| `lista.error_red` | No pudimos anotarte por un problema de conexión. Probá de nuevo. | We couldn't add you because of a connection problem. Try again. |
| `lista.error_limite` | Demasiados intentos. Probá en un rato. | Too many tries. Try again in a bit. |
| `lista.ok` | ¡Adentro, {nombre}! Estás en la lista de acceso anticipado. | You're in, {nombre}! You're on the early access list. |
| `lista.ok_ya` | Ya estabas en la lista. ¡A jugar! | You were already on the list. Let's play! |
| `lista.ok_confirmar` | Revisá tu mail. Mientras, jugá todo lo que quieras. | Check your inbox. Meanwhile, play as much as you like. |
| `lista.ok_encuesta` | ¿Nos ayudás a decidir qué hacer primero? 4 preguntas, 1 minuto. | Help us decide what to build first? 4 questions, 1 minute. |
| `lista.seguir` | Seguir jugando | Keep playing |

**Encuesta**

| Clave | Español | Inglés |
|---|---|---|
| `encuesta.titulo` | 4 preguntas rápidas | 4 quick questions |
| `encuesta.premio` | Al terminar, sumás 2 finales. | Finish and get 2 more finals. |
| `encuesta.q1` | ¿Qué te gustaría que agreguemos primero? Elegí hasta 2. | What should we add first? Pick up to 2. |
| `encuesta.q1.pesista_propio` | Crear mi propio pesista | Create my own lifter |
| `encuesta.q1.carrera` | Carrera y entrenamiento para mejorar a mi pesista | Career and training to improve my lifter |
| `encuesta.q1.sedes` | Finales en sedes distintas | Finals at different venues |
| `encuesta.q1.mujeres_categorias` | Pesistas mujeres y categorías de peso | Women lifters and weight classes |
| `encuesta.q1.amigos_online` | Jugar contra amigos u online | Play against friends or online |
| `encuesta.q1.realismo` | Más realismo (técnica, jueces, control antidoping) | More realism (technique, judges, doping control) |
| `encuesta.q2` | ¿Qué fue lo que menos te gustó? Elegí hasta 2. | What did you like least? Pick up to 2. |
| `encuesta.q2.no_entendi` | No entendí qué tenía que hacer | I didn't get what to do |
| `encuesta.q2.largo` | Las finales son largas | Finals take too long |
| `encuesta.q2.dificil` | Es difícil | It's too hard |
| `encuesta.q2.facil` | Es fácil o repetitivo | It's too easy or repetitive |
| `encuesta.q2.tecnico` | Se veía o andaba mal | It looked or ran badly |
| `encuesta.q2.nada` | Nada, me gustó | Nothing, I liked it |
| `encuesta.q3` | ¿Dónde jugarías más a Tarima? | Where would you play Tarima most? |
| `encuesta.q3.telefono` | En el teléfono | On my phone |
| `encuesta.q3.compu` | En la computadora | On a computer |
| `encuesta.q3.tablet` | En una tablet | On a tablet |
| `encuesta.q3.consola` | En una consola o la tele | On a console or TV |
| `encuesta.q4` | Si el juego completo tuviera un costo, ¿qué preferirías? | If the full game cost something, what would you prefer? |
| `encuesta.q4.unico` | Pagar una vez y tenerlo entero | Pay once and own it all |
| `encuesta.q4.cosmeticos` | Gratis, con cosas opcionales para tu pesista (ropa, cinturones) | Free, with optional gear for your lifter (outfits, belts) |
| `encuesta.q4.publicidad` | Gratis con publicidad | Free with ads |
| `encuesta.q4.suscripcion` | Una suscripción mensual | A monthly subscription |
| `encuesta.q4.no` | No pagaría | I wouldn't pay |
| `encuesta.q5` | ¿Qué te haría volver mañana? (opcional) | What would bring you back tomorrow? (optional) |
| `encuesta.q5_ph` | No pongas datos personales. | Please don't include personal details. |
| `encuesta.enviar` | Enviar y jugar | Send and play |
| `encuesta.enviar_anotado` | Enviar | Send |
| `encuesta.falta` | Contestá las 4 primeras para seguir. | Answer the first 4 to continue. |
| `encuesta.ok` | ¡Gracias! Sumaste 2 finales. | Thanks! You've got 2 more finals. |
| `encuesta.ok_anotado` | ¡Gracias! Esto nos ayuda a decidir qué hacer primero. | Thanks! This helps us decide what to build first. |
| `encuesta.ya` | Ya se contestó la encuesta desde este dispositivo o esta conexión. | The survey was already answered from this device or connection. |

**Pausa, ayuda y privacidad dentro del juego**

| Clave | Reemplaza | Español | Inglés |
|---|---|---|---|
| `pausa.titulo` | «Pausa» | Pausa | Paused |
| `pausa.texto` | «El reloj está detenido.» | El reloj está detenido. | The clock is stopped. |
| `pausa.seguir` | «Seguir» | Seguir | Resume |
| `pausa.ayuda` | «Cómo se juega» | Cómo se juega | How to play |
| `pausa.salir` | «Volver al inicio» | Volver al inicio | Back to start |
| `ayuda.titulo` | «Cómo se juega · controles {Fácil}» | Cómo se juega · {controles} | How to play · {controles} |
| `ayuda.un_toque` | «Un toque por señal: no hay que mantener ni soltar…» | Un toque por señal: no hay que mantener ni soltar. Después de cada toque sale PERFECTO, BIEN, TEMPRANO o TARDE. | One tap per signal: no holding or releasing. After each tap you'll see PERFECT, GOOD, EARLY or LATE. |
| `ayuda.pro` | «Mantener y soltar: apretar es agarrar la barra, soltar es explotar.» | Mantener y soltar: apretar es agarrar la barra; soltar es explotar. | Hold and release: press to grip the bar; release to explode. |
| `pasos.f1` | «{Apretá} para empezar el levantamiento.» | {A} para empezar el levantamiento. | {A} to start the lift. |
| `pasos.f2` | «Tocá cuando el círculo se cierra: ¡EXPLOTÁ!, ¡RECIBÍ!» | Tocá cuando el círculo llega al aro: ¡EXPLOTÁ!, ¡AGARRALA! | Tap when the circle hits the ring: EXPLODE!, CATCH! |
| `pasos.f3` | «Si dice ¡EMPUJÁ!, tocá rápido.» | Si dice ¡EMPUJÁ!, tocá rápido. | If it says PUSH!, tap fast. |
| `pasos.c1` | «Apretá con el anillo lleno y mantené.» | Apretá con el anillo lleno y mantené. | Press when the ring is full and hold. |
| `pasos.c2` | «Soltá cuando la barra llega a la línea y apretá para recibir.» | Soltá cuando la barra llega a la línea y apretá para agarrarla. | Release when the bar hits the line, then press to catch it. |
| `pasos.c3` | «Si se traba, tocá repetido; de pie, dejá apretado hasta la chicharra.» | Si se traba, tocá repetido; de pie, dejá apretado hasta el pitido. | If it stalls, tap repeatedly; once standing, hold until the buzzer. |
| `glosario.*` | «Tope: … Resto: …» | ver la sección 4.4 | see section 4.4 |
| `medicion.estado` | nuevo (página de privacidad) | Medición anónima: {activada/desactivada} | Anonymous measurement: {on/off} |
| `medicion.boton` | nuevo | Desactivar / Activar | Turn off / Turn on |

**Mails y páginas del Worker**

| Clave | Español | Inglés |
|---|---|---|
| `mail.confirmar.asunto` | Confirmá tu lugar en Tarima | Confirm your spot in Tarima |
| `mail.confirmar.cuerpo` | Hola, {nombre}. Toca el botón para confirmar tu lugar en la lista de acceso anticipado de Tarima. Si no fuiste tú, ignora este mail: si no se confirma, borramos tu dirección a los 30 días. | Hi {nombre}. Tap the button to confirm your spot on Tarima's early access list. If this wasn't you, just ignore this email: unconfirmed addresses are deleted after 30 days. |
| `mail.ya.asunto` | Ya estás en la lista de Tarima | You're already on the Tarima list |
| `mail.ya.cuerpo` | Alguien, probablemente tú, puso este mail en Tarima desde otro dispositivo. Ya estabas en la lista de acceso anticipado: ese dispositivo quedó con juego libre y no cambiamos nada más. Si no fuiste tú, no tienes que hacer nada. | Someone, probably you, entered this email in Tarima on another device. You were already on the early access list: that device now has unlimited play, and nothing else changed. If this wasn't you, there's nothing you need to do. |
| `mail.ya.boton` | Ir a Tarima | Go to Tarima |
| `confirmar.pregunta` | ¿Confirmas tu lugar en la lista de Tarima? | Confirm your spot on the Tarima list? |
| `confirmar.boton` | Sí, confirmar | Yes, confirm |
| `mail.confirmar.boton` | Confirmar | Confirm |
| `mail.pie` | Recibís este mail porque te anotaste en Tarima. Darte de baja: {link} | You're getting this because you joined Tarima. Unsubscribe: {link} |
| `confirmado.texto` | ¡Listo! Tu lugar está confirmado. | Done! Your spot is confirmed. |
| `confirmado.volver` | Volver al juego | Back to the game |
| `baja.pregunta` | ¿Te damos de baja de la lista de Tarima? | Remove you from the Tarima list? |
| `baja.boton` | Sí, darme de baja | Yes, unsubscribe me |
| `baja.ok` | Listo: te dimos de baja y borramos tu mail. Podés seguir jugando. | Done: you're unsubscribed and your email is deleted. You can keep playing. |
| `baja.form` | Escribí tu mail y te mandamos el link para darte de baja. | Enter your email and we'll send you the unsubscribe link. |
| `baja.form_ok` | Si ese mail está en la lista, te llega el link en unos minutos. | If that email is on the list, the link will arrive in a few minutes. |
| `baja.token_invalido` | Ese link ya no sirve. Pedí uno nuevo desde la página de privacidad. | That link no longer works. Request a new one from the privacy page. |

## 5. Lista de espera y encuesta

### 5.1 Qué se pide y qué se ofrece

- **Obligatorio en el camino del mail.** El mail y la casilla de aviso.
- **Opcional.** La casilla de novedades. El nombre viaja si es distinto de «Debutante» o «Rookie», solo para el saludo del mail.
- **Lo que pone el servidor.** El idioma y el país aproximado (`cf.country`), sin preguntarlos.
- **Lo que no se pide.** Edad, teléfono, sexo ni redes.

**Incentivo.** Juego libre en este dispositivo hasta la próxima versión. El texto dice «sin límite» y no promete nada más: ni fechas, ni funciones aseguradas, ni premios. Las funciones del muro se presentan como «estamos armando» y «nos ayudás a elegir», nunca como «vas a tener». Si alguien se da de baja, no pierde el juego libre.

**Confirmación (doble opt-in).** No frena el juego: el desbloqueo es inmediato. El mail confirmado es la cifra limpia de la lista y la prueba del consentimiento. Si el mail no se confirma en 30 días desde que salió el correo de confirmación, se borra; el dispositivo conserva el juego libre. Mientras no haya envío de correos (sin dominio propio), ninguna alta se borra por no confirmar (decisión del dueño del 12 de noviembre; columna `confirmar_mandado_en`).

### 5.2 Texto de privacidad (`web/privacidad.html`, con las dos versiones)

Los campos `{responsable}`, `{país}` y `{contacto}` los completa el dueño (decisión 2). La versión del texto (`2026-11-a`) se guarda con cada alta.

**Texto vigente:** `web/privacidad.html`, versión `2026-11-b`, en español neutro. Cambia respecto de lo de abajo: sin borrado por no confirmar mientras no haya correos, el HMAC de la IP y la cookie `tdv` explicados, marcadores visibles para responsable, país y contacto, y la baja desde el dispositivo que anotó el correo. El Worker acepta las dos versiones.

**Español**

> **Privacidad de Tarima** · versión 2026-11-a
>
> Responsable: {responsable}, {país}. Contacto: {contacto}.
>
> **Jugar.** No hace falta cuenta. Tu nombre o apodo queda solo en tu dispositivo.
>
> **Finales gratis.** Para contarlas guardamos un identificador al azar de tu navegador (en el almacenamiento del sitio y en una cookie técnica) y un código que sale de tu dirección IP pasada por una clave secreta. Nunca guardamos la IP. El código de la IP se borra a los 30 días y el del dispositivo, a los 180 días sin jugar. Lo hacemos por interés legítimo: que las finales gratis sean de verdad limitadas.
>
> **Lista de espera.** Si te anotás, guardamos tu mail, el nombre que pusiste, el idioma, el país aproximado (según tu conexión), la fecha y la versión de este texto. Los usamos para avisarte cuando abra el acceso anticipado y, si marcaste la otra casilla, para mandarte novedades, como mucho una por mes. La base es tu consentimiento. Guardamos los datos hasta que te des de baja; si no confirmás el mail, los borramos a los 30 días. La lista es solo para mayores de 16.
>
> **Medición.** Usamos PostHog (PostHog Inc., Estados Unidos) como encargado para medir cómo se juega: qué pantallas se ven, cuántas finales se terminan y dónde se abandona. No usamos cookies de medición ni guardamos nada en tu navegador para esto, y no le mandamos a PostHog tu nombre, tu mail ni tu IP. Si te anotás, tus partidas quedan ligadas a un número interno de la lista, nunca a tu mail. Los datos se alojan en la nube de PostHog en Estados Unidos. La transferencia desde Europa está cubierta por el acuerdo de tratamiento de datos de PostHog, con las cláusulas contractuales tipo de la Comisión Europea. Podés desactivar la medición acá: {interruptor}.
>
> **Encuesta.** Las respuestas van a PostHog sin tu nombre ni tu mail. No escribas datos personales en la respuesta libre.
>
> **Alojamiento.** El juego y el servidor corren en Cloudflare (encargado), que procesa tu IP para entregar la página y frenar abusos.
>
> No vendemos ni compartimos tus datos. No hay publicidad ni rastreadores de terceros.
>
> **Tus derechos.** Podés pedir acceso, corrección, borrado u oposición, o llevarte tus datos, escribiendo a {contacto}. Para darte de baja de la lista, usá el link de cualquier mail o este formulario: {formulario de baja}. También podés reclamar ante la autoridad de protección de datos de tu país.

**English**

> **Tarima privacy** · version 2026-11-a
>
> Controller: {responsable}, {país}. Contact: {contacto}.
>
> **Playing.** No account needed. Your name or nickname stays on your device.
>
> **Free finals.** To count them we store a random ID for your browser (in site storage and a technical cookie) and a code derived from your IP address with a secret key. We never store the IP itself. The IP code is deleted after 30 days, the device code after 180 days without play. Legal basis: our legitimate interest in keeping free finals actually limited.
>
> **Waitlist.** If you join, we store your email, the name you entered, language, approximate country (from your connection), the date and the version of this text. We use them to tell you when early access opens and, if you ticked the other box, to send you news, at most once a month. Legal basis: your consent. We keep it until you unsubscribe; if you don't confirm your email, we delete it after 30 days. The list is for people 16 and older.
>
> **Measurement.** We use PostHog (PostHog Inc., United States) as a processor to measure how the game is played: which screens are seen, how many finals are finished and where people drop off. We use no measurement cookies and store nothing in your browser for this, and we never send PostHog your name, email or IP. If you join the list, your games are linked to an internal list number, never to your email. Data is hosted in PostHog's US cloud. Transfers from Europe are covered by PostHog's data processing agreement, which includes the European Commission's standard contractual clauses. You can turn measurement off here: {interruptor}.
>
> **Survey.** Answers go to PostHog without your name or email. Please don't write personal details in the free-text answer.
>
> **Hosting.** The game and server run on Cloudflare (processor), which handles your IP to serve the page and stop abuse.
>
> We never sell or share your data. No ads, no third-party trackers.
>
> **Your rights.** You can ask for access, correction, deletion or objection, or take your data with you, by writing to {contacto}. To leave the list, use the link in any email or this form: {formulario de baja}. You can also complain to your country's data protection authority.

### 5.3 Baja

- **Desde un mail.** Cada mail lleva `List-Unsubscribe` y `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) con un link a `/baja?t=<token>`. Con GET, la página muestra un botón; con POST, da de baja. Así un escáner de links no da de baja a nadie.
- **Desde la privacidad.** La página tiene un formulario: `POST /api/baja` con el mail. Siempre responde lo mismo, para no revelar quién está en la lista. Si el mail existe, le manda el link.
- **Qué borra.** La fila completa de `lista`: mail, nombre y país. El dispositivo conserva `lista_id` y su juego libre hasta que pasen 180 días sin jugar, como cualquier dispositivo. En PostHog se manda el evento `baja`, sin persona.

### 5.4 La encuesta

- **Preguntas.** Son 5: las 4 primeras se tocan y son obligatorias para el premio, y la 5.ª es abierta y opcional (sección 4.5, `encuesta.*`). En la 1 y la 2 se eligen hasta 2 opciones; «Nada, me gustó» es exclusiva. En la 3 y la 4, una sola.
- **En PostHog.** Se crea una encuesta de tipo API con las mismas 5 preguntas. Las opciones se cargan con el texto en español, que es la etiqueta canónica. El Worker traduce los códigos del juego a esas etiquetas y agrega `idioma` como propiedad. El id de la encuesta y los ids de las preguntas viven en la configuración del Worker.
- **Quién la manda a PostHog.** El Worker, no el navegador. Así cada respuesta queda atada a un desbloqueo, no se duplica y llega aunque haya un bloqueador.
- **Cuántas veces.** Una por dispositivo y hasta 3 por IP en 30 días. El orquestador había pedido una por IP; la cambio porque una casa con dos jugadores dejaría a uno sin encuesta.
- **Si ya está anotado.** Se ofrece sin premio, también una sola vez.
- **Sin servidor.** Si el Worker no responde, la encuesta no se puede mandar: no hay premio sin registro.

### 5.5 Contrato del servidor

**Cambio del 12 de noviembre (decisión del dueño):** el sitio lo sirve Cloudflare Pages («liftinggame», https://liftinggame.pages.dev) y le pasa `/api/*`, `/qx/*`, `/baja` y `/confirmar` al Worker «tarima», sin dirección pública, por una service binding (`functions/` y `wrangler.jsonc` de la raíz; ver `worker/README.md`). Lo que sigue sobre assets y `run_worker_first` describe el diseño anterior.

Es un solo Worker de Cloudflare con assets estáticos, D1 y el límite de pedidos de Workers (`ratelimit`). Va en `worker/` (`wrangler.jsonc`, `src/index.js`, `src/reglas.js`, `schema.sql`) y sirve `web/` como sitio. `/` reescribe a `juego.html`, y el visor no se enlaza. `run_worker_first` se aplica a `/api/*`, `/qx/*`, `/baja` y `/confirmar`. Las reglas de la cuenta van puras en `src/reglas.js`, sin `fetch` ni D1, para probarlas en Node con una base en memoria (`tools/worker_test.mjs`).

**Configuración**

| Nombre | Tipo | Valor |
|---|---|---|
| `POSTHOG_KEY` | variable, fuera del repo (`wrangler secret put` o el panel) | Clave pública del proyecto, que se toma de `tarima-datos/posthog.json`. Sin ella, todo el envío a PostHog es no-op |
| `POSTHOG_HOST` | variable | `us.i.posthog.com` |
| `POSTHOG_ASSETS` | variable | `us-assets.i.posthog.com` |
| `SECRETO_IP`, `SECRETO_DISPOSITIVO`, `SECRETO_PASE`, `SECRETO_BAJA` | secretos | 32 bytes al azar cada uno |
| `GRATIS` | variable | `2`. La bandera `muro-partidas-gratis` lo pisa |
| `TOPE_IP` | variable | `6` |
| `BONO_ENCUESTA` | variable | `2` |
| `ENCUESTAS_POR_IP` | variable | `3` |
| `ENCUESTA_ID`, `ENCUESTA_PREGUNTAS` | variables | Id de la encuesta y JSON `{q1:'<id>', …}` con las opciones canónicas |
| `MAIL_DESDE` | variable | Remitente del dominio, por ejemplo `hola@<dominio>` |
| `TURNSTILE` | variable | `0`. En `1`, exige el token en `/api/anotar` y `/api/encuesta` |
| `DB` | D1 | `tarima` |
| `EMAIL` | Email Sending | Opcional al salir. Sin él, el alta queda `confirmado_en = null` y la confirmación se manda antes del primer mail |

**Identificadores**

- **`dispositivo`.** Un UUID v4 que genera el navegador y guarda en `tarima.dispositivo`. El Worker lo repite en una cookie `tdv` (HttpOnly, Secure, SameSite=Strict, Path=/api, 180 días).
  - Si llega la cookie, gana la cookie.
  - La respuesta devuelve `dispositivo`, para que el navegador vuelva a guardarlo.
  - En la base solo se guarda `d = HMAC(SECRETO_DISPOSITIVO, dispositivo)`, como hex.
- **IP.** Se toma `CF-Connecting-IP`. En IPv4 se usa la dirección entera; en IPv6, el prefijo /64. En la base solo se guarda `i = HMAC(SECRETO_IP, prefijo)`, los primeros 32 caracteres hex. La IP nunca se escribe ni sale en registros.
- **`sesion`.** El id anónimo de PostHog de esa página (`posthog.get_distinct_id()`). Solo se usa para mandar la encuesta a PostHog con el mismo id que el embudo.

**Tablas (D1)**

```sql
CREATE TABLE dispositivos (d TEXT PRIMARY KEY, creado INTEGER, ultimo INTEGER, lista_id TEXT, encuesta_en INTEGER, flags TEXT, flags_en INTEGER);
CREATE TABLE partidas (id INTEGER PRIMARY KEY, d TEXT, i TEXT, en INTEGER, fuente TEXT);       -- fuente: gratis | encuesta | lista
CREATE INDEX partidas_d ON partidas (d); CREATE INDEX partidas_i ON partidas (i, en);
CREATE TABLE encuestas (d TEXT PRIMARY KEY, i TEXT, en INTEGER);                                -- solo el desbloqueo; las respuestas van a PostHog
CREATE TABLE lista (id TEXT PRIMARY KEY, email TEXT UNIQUE, nombre TEXT, idioma TEXT, pais TEXT, novedades INTEGER,
  consentimiento_version TEXT, consentimiento_en INTEGER, creado INTEGER, confirmado_en INTEGER);
```

**Limpieza diaria** (Cron Trigger):
- `partidas.i` y `encuestas.i` pasan a NULL a los 30 días.
- Se borran las `partidas` de más de 180 días.
- Se borran los `dispositivos` con `ultimo` de hace más de 180 días, estén o no en la lista (es lo que dice la página de privacidad). Anotarse también actualiza `ultimo`.
- Se borran las filas de `lista` sin confirmar cuyo correo de confirmación salió hace más de 30 días (sin envío de correos, ninguna).

**La regla** (`reglas.js`), con `ahora` y la ventana de 30 días:

```
si dispositivo.lista_id → ok, fuente 'lista' (no cuenta para la IP)
usadas_d = partidas de d con fuente ≠ 'lista'
cupo_d   = GRATIS + (dispositivo.encuesta_en ? BONO_ENCUESTA : 0)
usadas_i = partidas con i en 30 días, de dispositivos SIN lista_id
cupo_i   = TOPE_IP + BONO_ENCUESTA × (encuestas con i en 30 días)
si usadas_d < cupo_d y usadas_i < cupo_i → ok; se inserta la partida;
   fuente = usadas_d < GRATIS ? 'gratis' : 'encuesta'
si no → muro; motivo = usadas_d ≥ cupo_d ? 'dispositivo' : 'ip'
encuesta_disponible = !dispositivo.encuesta_en y (encuestas con i en 30 días) < ENCUESTAS_POR_IP
```

La cuenta por IP excluye a los dispositivos anotados. Por eso, cuando alguien se anota, sus finales dejan de pesar sobre su red: así se cumple «anotarse desbloquea por dispositivo y por IP».

**Endpoints.** Todos los `POST` piden JSON de hasta 4 KB, un `Origin` igual al del sitio (si no, 403) y `Content-Type: application/json`. Responden JSON con `Cache-Control: no-store`.

| Endpoint | Pide | Responde | Límite por `i` |
|---|---|---|---|
| `POST /api/estado` | `{dispositivo, idioma}` | `{dispositivo, puede, quedan, lista, lista_id?, motivo?, encuesta_disponible, flags, contexto, metricas}`. No cuenta nada | 60 cada 10 min |
| `POST /api/partida` | `{dispositivo, idioma}` | `{estado:'ok', pase, fuente, quedan, n, flags, contexto}` o `{estado:'muro', motivo, encuesta_disponible, contexto}` | 20 cada 10 min |
| `POST /api/anotar` | `{dispositivo, sesion, email, nombre?, idioma, aviso:true, novedades:bool, consentimiento:'2026-11-b', turnstile?}` | `{estado:'nuevo' o 'ya_estaba', lista_id, confirmar:bool}`; 400 `{error}` | 5 por hora |
| `POST /api/encuesta` | `{dispositivo, sesion, idioma, r:{q1:[…], q2:[…], q3:'…', q4:'…', q5?:'…'}, turnstile?}` | `{estado:'ok', bono:2 o 0}`; 409 `{error:'ya_respondida'}`; 400 `{error:'incompleta'}` | 3 por hora |
| `POST /api/baja` | `{email}` | 202 `{}` siempre | 3 por hora |
| `GET /baja?t=` y `POST /baja` | token | página bilingüe (`baja.*`) | 10 tokens inválidos por hora; los válidos no tienen límite |
| `GET /confirmar?t=` y `POST /confirmar` | token | GET: página con el botón «Sí, confirmar» (`confirmar.*`), sin confirmar nada. POST: confirma, página `confirmado.*` y evento `mail_confirmado` | 10 tokens inválidos por hora; los válidos no tienen límite |
| `/qx/*` | proxy a PostHog (sección 6.2) | tal cual | sin límite propio |

Los límites devuelven 429 `{error:'limite'}`.

**Campos de las respuestas**

- **`contexto`.** `{pais: cf.country, previas: usadas_d, dias: '0' | '1' | '2-7' | '8+'}`. `dias` cuenta desde `dispositivos.creado`.
- **`metricas`.** `{clave: POSTHOG_KEY, host: '/qx', ui: 'https://us.posthog.com', encuesta: ENCUESTA_ID}`, o `null` si no hay clave.
- **`flags`.** El valor de cada bandera para este dispositivo (sección 6.5).
- **`pase`.** `v1.<base64url(JSON{d: d[0..12], n, f: fuente, exp: ahora + 3 h})>.<HMAC(SECRETO_PASE)>`. En el MVP el juego solo lo guarda en memoria. Es el gancho para validar resultados más adelante (JUEGO.md 9.6), no un candado.

**Validaciones de `/api/anotar`**

- **Normalización.** `email` se recorta y pasa a minúsculas, con un máximo de 254 caracteres y la forma `local@dominio.tld`.
- **Rechazos.**
  - `aviso !== true`: `error:'aviso'`.
  - Dominio en la lista corta de descartables, embebida en el Worker: `error:'descartable'`.
  - El dominio no tiene registro MX ni A, consultado por DNS sobre HTTPS a `cloudflare-dns.com` con un caché de 1 día: `error:'dominio'`.
  - Formato inválido: `error:'formato'`.
- **Nombre.** Se valida igual que en el juego. Si no cumple, se descarta sin error.
- **Si el mail ya existe.** Se liga el dispositivo a ese `lista_id` y no se modifica nada de lo guardado: ni el consentimiento ni `novedades` (en el MVP no se verifica la propiedad del mail, así que un tercero no puede anotar a nadie en las novedades). Para no revelar quién está en la lista, la respuesta es la misma que la de un alta nueva (`estado:'nuevo'`, el mismo `confirmar`), y se manda un mail, como mucho uno por día por dirección: otra vez la confirmación si no estaba confirmado, o el aviso `mail.ya.*` si ya lo estaba. `ya_estaba` solo vuelve cuando este mismo dispositivo ya estaba ligado a ese mail.
- **Alta nueva.** `id` son 16 bytes al azar en hex, sin relación con el mail. Se manda el mail de confirmación con `/confirmar?t=HMAC(SECRETO_BAJA, id + 'c')`, y el token de baja es `HMAC(SECRETO_BAJA, id)`.
- **En PostHog.** No se manda nada desde el Worker: el juego hace `identify(lista_id)` y captura `anotar_ok`.

**Validaciones de `/api/encuesta`**

- **Respuestas.** `q1` y `q2` son arreglos de 1 o 2 códigos válidos («nada» va sola). `q3` y `q4` son un código válido cada una. `q5` es opcional, hasta 280 caracteres, sin controles ni HTML.
- **Si ya tiene `encuesta_en`.** Responde 409.
- **Si la IP llegó a `ENCUESTAS_POR_IP`.** Responde 409 `{error:'ya_respondida'}`.
- **Si todo está bien.**
  - Se inserta la fila en `encuestas` y se marca `dispositivos.encuesta_en`. El `bono` es 2 si no estaba anotado y 0 si lo estaba.
  - Se manda a PostHog, con `ctx.waitUntil`, un `POST https://us.i.posthog.com/i/v0/e/` con `{api_key, event:'survey sent', distinct_id: sesion, properties:{$survey_id, $survey_completed:true, $survey_submission_id: uuid, $survey_questions:[{id, question}], $survey_response_<id>: …, idioma, pais, $process_person_profile:false}}`.
  - En las preguntas de opción múltiple la respuesta va como arreglo de etiquetas, y en las de una sola opción, como texto.
  - Si el envío a PostHog falla, se reintenta una vez; el desbloqueo no depende del envío.

**Seguridad**

- Ningún registro (`console.log`) incluye el mail, la IP ni el dispositivo.
- Los errores de D1 devuelven 503 `{error:'servidor'}`.
- El juego trata cualquier 5xx como falta de red (sección 2, P4).

## 6. Métricas con PostHog

### 6.1 El cliente

- **Archivo.** `posthog-js` va vendorizado en `web/vendor/posthog/`: el build ESM de una versión fija, anotada en `web/vendor/posthog/VERSION`, como three. Sin CDN y sin paso de build.
- **Envoltorio.** Lo carga `web/js/game/metricas.js`, que exporta `ev(nombre, props)`, `identificar(lista_id)` y `apagar()`.
- **Cuándo queda en no-op.** Sin `metricas.clave` en la respuesta de `/api/estado` (por ejemplo, con el servidor local de Python), con `?metricas=0`, o con la medición desactivada en la página de privacidad (`tarima.medicion = 0`, preferencia funcional).
- **Para las pruebas.** Cada evento queda además en `window.JUEGO.eventos`, con PostHog o sin él, para que `check_game` pueda afirmar el embudo.

```js
posthog.init(m.clave, {
  api_host: location.origin + '/qx', ui_host: 'https://us.posthog.com',
  persistence: 'memory',                 // nada en cookies ni en almacenamiento: no hace falta aviso de cookies
  person_profiles: 'identified_only',    // solo los anotados tienen perfil
  autocapture: false, capture_pageview: false, capture_pageleave: true,
  disable_session_recording: true, disable_surveys: true,
  advanced_disable_flags: true,          // las banderas vienen del Worker (bootstrap); el nombre de la opción depende de la versión
  bootstrap: { featureFlags: estado.flags },
  mask_all_text: true, mask_all_element_attributes: true,
});
posthog.register({ idioma, idioma_origen, tactil, version, pais, previas, dias, fuente_trafico, ...propsDeBanderas });
```

- **Banderas como propiedades.** `propsDeBanderas` es `{'$feature/muro-partidas-gratis': '2', …}`, para separar por variante en cualquier gráfico.
- **Pantalla actual.** `visita()` actualiza la súper propiedad `pantalla`, así `$pageleave` dice dónde se fue la gente.
- **Prueba de humo.** `check_game` verifica que después de una final no quede ninguna cookie, clave de `localStorage` ni de `sessionStorage` que contenga `ph_` (posthog-js usa también nombres como `__ph_opt_in_out_<clave>`).

**Sin cookies.** Como no se guarda nada en el navegador para medir, no hace falta aviso de cookies en la UE. Lo que se guarda es funcional (`tarima.dispositivo`, la cookie `tdv`, el idioma y el nombre) y está dicho en la página de privacidad.

**Lo que se pierde.** El id de PostHog cambia en cada carga de página, así que un embudo que cruza una recarga no se une por persona. Se compensa de tres maneras:
- Casi todo el embudo pasa en una sola carga.
- `previas` y `dias` vienen del servidor como súper propiedades.
- Los anotados se identifican con `lista_id` en cada visita (`/api/estado` lo devuelve), así que su retención sí se mide por persona. Está dicho en la línea legal del formulario y en la página de privacidad.

**IP.** El dueño activa «Discard client IP data» en el proyecto de PostHog. El proxy, además, no reenvía `X-Forwarded-For`. El país llega como propiedad (`pais`) desde el Worker.

### 6.2 Proxy en el Worker

Sigue la guía oficial de PostHog para Cloudflare Workers: https://posthog.com/docs/advanced/proxy/cloudflare.

- **Ruta.** Todo bajo `/qx/`, una ruta propia y poco obvia: la guía desaconseja `/analytics`, `/tracking`, `/telemetry` y `/posthog`.
- **Destinos.** Lo que empieza con `/qx/static/` o `/qx/array/` va, sin el prefijo, a `POSTHOG_ASSETS` (`us-assets.i.posthog.com`), con caché en `caches.default` mediante `ctx.waitUntil(caches.default.put(…))`. Lo demás va a `POSTHOG_HOST` (`us.i.posthog.com`).
- **Cuerpo y encabezados.** El cuerpo se pasa con `await request.arrayBuffer()`. Se sacan las cookies. `Authorization` solo pasa si es una clave `phc_`.
- **Diferencia con la guía.** No se agrega `X-Forwarded-For`, para que PostHog no reciba la IP.
- **Dominio.** El sitio va en un dominio propio, nunca en `*.workers.dev`, que los bloqueadores reconocen.

### 6.3 Eventos

Todos van en minúscula y en español. Ninguno lleva nombre, mail, IP ni dispositivo. Las súper propiedades de 6.1 van en todos.

| Evento | Cuándo | Propiedades propias |
|---|---|---|
| `juego_abierto` | Primera pintura de P0 | `carga_ms`, `pantalla_inicial` (`bienvenida`, `muro`) |
| `carga_lista` | Modelos listos | `ms`, `calidad` |
| `idioma_cambiado` | Selector ES · EN | `de`, `a`, `pantalla` |
| `nombre_puesto` | Sale de la bienvenida | `vacio`, `vuelve` (bool), `cambio` (bool, usó «No soy yo») |
| `pesista_elegido` | Ídem | `pesista` (`compacto`, `largo`, `potente`), `por_defecto` |
| `opciones_abiertas` | Despliega «Opciones» | — |
| `tutorial_inicio` / `tutorial_fin` / `tutorial_salteado` | Práctica | `valido`, `s`, `paso` |
| `partida_pedida` | Respuesta de `/api/partida` | `resultado` (`ok`, `muro`, `sin_servidor`), `fuente`, `motivo` |
| `final_inicio` | Primer llamado propio | `n`, `fuente`, `pesista`, `nivel`, `ritmo`, `ctl` |
| `intento_propio` | Veredicto propio | `final_n`, `lev`, `intento`, `kg`, `resultado` (`vale`, `no_vale`, `cayo`), `causa` (clave), `perfecto`, `bien`, `temprano`, `tarde`, `todavia_no` |
| `final_fin` | Podio | `n`, `puesto` (1 a 3 o null), `total`, `duracion_s` |
| `compartir` | Botón compartir | `via` (`nativo`, `copiar`), `medalla`, `pantalla` |
| `invitacion_vista` / `invitacion_abierta` / `invitacion_cerrada` | Podio 1 | — |
| `muro_visto` | P9 | `motivo`, `caminos` (`mail+encuesta`, `mail`), `origen` (`podio`, `carga`, `bienvenida`), `variante_texto` |
| `muro_ahora_no` | «Ahora no» | — |
| `mail_foco` | Primer foco en el campo | `pantalla` (`muro`, `invitacion`) |
| `anotar_envio` | Envío | `novedades`, `sugerencia_usada`, `pantalla` |
| `anotar_ok` | 200 de `/api/anotar`, después de `identify(lista_id)` | `estado` (`nuevo`, `ya_estaba`), `pantalla`, `finales_previas` |
| `anotar_error` | Error | `motivo` (`formato`, `dominio`, `descartable`, `aviso`, `red`, `limite`) |
| `survey shown` | Abre la encuesta | `$survey_id`, `con_premio` |
| `encuesta_enviada` | 200 de `/api/encuesta` | `con_premio` |
| `survey dismissed` | Sale sin mandar | `$survey_id` |
| `survey sent` | Lo manda el Worker (5.5) | Respuestas de la encuesta |
| `privacidad_abierta` | Link del pie | `pantalla` |
| `medicion_desactivada` | Interruptor, antes de apagar. No se llama a `opt_out_capturing()`, que guarda su propia marca en el navegador: con `tarima.medicion = 0` posthog-js no se inicia y la página se recarga | — |
| `error_juego` | `E.errores` o `window.onerror` | `tipo` (clave corta, sin texto libre), `pantalla` |
| `mail_confirmado` | Lo manda el Worker al confirmar (`distinct_id = lista_id`) | — |
| `baja` | Lo manda el Worker (sin persona) | `via` (`mail`, `formulario`) |
| `$pageleave` | Automático | `pantalla` (súper propiedad) |

`fuente_trafico` vale `utm_source` si viene en la URL, `compartido` si llega con `?c=` y `directo` en otro caso. El código `c` es al azar por cada vez que se comparte y no identifica a nadie.

### 6.4 Embudos, cohortes y paneles

**Embudos**
1. **Activación:** `juego_abierto` → `nombre_puesto` → `tutorial_fin` o `tutorial_salteado` → `final_inicio (n=1)` → `intento_propio (intento=1)` → `final_fin (n=1)`.
2. **Hasta el muro:** `final_fin (n=1)` → `final_inicio (n=2)` → `final_fin (n=2)` → `muro_visto`.
3. **Muro:** `muro_visto` → `mail_foco` → `anotar_envio` → `anotar_ok`, separado por `variante_texto`, `idioma` y `tactil`.
4. **Encuesta y después mail:** `encuesta_enviada (con_premio)` → `final_inicio (fuente=encuesta)` → `muro_visto (caminos=mail)` → `anotar_ok`.
5. **Compartir:** `final_fin` → `compartir`, y aparte `juego_abierto (fuente_trafico=compartido)` → `final_fin`.

**Cohortes:** anotados (personas identificadas), anotados confirmados, respondieron la encuesta, llegaron por un link compartido, tráfico de amigos (para excluirlo), y por `idioma`, `pais` y `tactil`.

**Paneles**
- **«MVP · embudo».** Los embudos 1 a 3, `anotar_ok` por día, mails por visitante y la tabla de tracción de la sección 1 como números grandes.
- **«MVP · abandono».** `$pageleave` por `pantalla`, `intento_propio` por `causa` en la final 1, y TODAVÍA NO por intento en la final 1 contra la 2.
- **«MVP · salud».** `error_juego` por tipo, `carga_ms` y `ms` (mediana y p90) por `tactil`, y `calidad`.
- **«MVP · encuesta».** La vista nativa de resultados de la encuesta, más la pregunta 1 cruzada por `idioma` y `pais`.
- **«MVP · experimentos».** El embudo 3 por `$feature/…`. Se usan gráficos con separación por propiedad y no el producto Experiments, porque sin un id persistente sus estadísticas por persona no valen.

### 6.5 Banderas

El Worker las evalúa en el endpoint de banderas de PostHog (`/flags?v=2`), con `distinct_id = 'd_' + d[0..16]`. Las guarda en `dispositivos.flags` y las devuelve en `/api/estado` y `/api/partida`.

- **Pegajosas.** Las de experimento (`muro-*`) no se vuelven a evaluar una vez asignadas.
- **Las demás.** Se refrescan cada 24 h.
- **Si PostHog no responde.** Valen los valores por defecto.

El hash de `d` no es dato personal directo, pero es seudónimo. Está cubierto por «interés legítimo» en el mismo párrafo de la página de privacidad.

| Bandera | Valores | Por defecto | Para qué |
|---|---|---|---|
| `muro-partidas-gratis` | `1`, `2` | `2` | Cuántas finales antes del muro. Recién se prueba con 1.000 visitas |
| `muro-texto` | `a`, `b` | `a` | El texto del muro (claves `_b`) |
| `invitacion-podio1` | `on`, `off` | `on` | Si la invitación suave del podio 1 suma o le resta al muro |
| `grabacion` | `off`, `tercio`, `todas` | `tercio` | Qué parte de las cargas se graba. Ver 6.6 |

### 6.6 Grabación de sesión

Decisión del dueño del 12 de noviembre (noche): prendida en una parte de las cargas, solo la página. Reemplaza la propuesta anterior (apagada; 10 % con una pregunta en la pausa).

- **Qué se graba.** El DOM: paneles, botones, textos y toques. Nunca el lienzo 3D (`captureCanvas.recordCanvas: false`, y además los `canvas` van bloqueados): grabarlo le quitaría fluidez al juego y no hace falta para ver dónde se traba la gente.
- **En qué parte.** La bandera `grabacion` dice la proporción: `off` (nada), `tercio` (por defecto) o `todas`. Se sortea una vez por carga de la página, que con `persistence: 'memory'` es una sesión de PostHog. Se cambia en PostHog sin publicar (6.5); los dispositivos que ya tienen banderas del día la ven al refrescarlas (hasta 24 h).
- **Enmascarado.** `maskAllInputs` (nombre, correo, respuesta libre). Todo texto pasa por `maskTextFn`: se tapa si tiene una «@» o el nombre del jugador (el guardado en `tarima.nombre` o el que está escribiendo en `#nombre` o `#editor-campo`, de 2 letras o más). Los atributos pasan por `maskAttributeFn`: `value` siempre tapado (con el campo vacío rrweb guardaría el `value` del HTML, que en la bienvenida es el nombre) y el resto (`data-v` de la sugerencia de correo, `title`, `aria-*`) con la misma regla que el texto; clase, estilo y CSS en claro. El resto del texto de la interfaz se lee.
- **Fuera de la grabación** (`BLOQUEO_GRABACION`, se ven como cajas vacías): `canvas`, `#senal` (escala, opacidad y anillos en cada cuadro del intento), `#acuse` y `#depura`.
- **Consentimiento.** Va con la medición: sin clave, con `?metricas=0` o con la medición desactivada en la privacidad no se carga PostHog ni el grabador; la privacidad se abre en otra pestaña, así que el juego escucha el evento `storage` y, si ahí se desactiva la medición, deja de medir y corta la grabación. No hay pregunta aparte. Riesgo aceptado: en la UE una grabación de sesión suele pedir consentimiento previo (ver pendientes en HANDOFF).
- **Cómo se arma sin pedir nada a PostHog.** El grabador de posthog-js (`dist/lazy-recorder.js`, 215 KB, 67 KB con gzip) va vendorizado en `web/vendor/posthog/` y se carga con un `<script>` solo en las cargas sorteadas, antes de `posthog.init`. Como el SDK no pide la configuración del proyecto (`advanced_disable_flags`), `analitica.js` la pone en `window._POSTHOG_REMOTE_CONFIG` (grabación a `/s/`, sin lienzo, consola ni red). Las grabaciones van por `/qx/s/`. Lo del cliente gana sobre lo que diga el proyecto de PostHog.
- **Costo medido** (`tools/check_analitica.mjs`, sección 6, juego con `?dibujo=0` en Actions): durante el primer intento propio el DOM tiene unas 130 mutaciones por segundo (casi todas `#guia` `hidden` puesto igual en cada cuadro, que el grabador descarta, y `#senal`, bloqueada) y al grabador llegan unas 9 por segundo (la clase y el texto de `#zona`, `#reloj` y `#rival`: cambian por señal o por toque, no por cuadro). Cuadros y tareas largas iguales con y sin grabación; una instantánea completa de la página cuesta 2 a 5 ms. La prueba falla si pasan de 20 por segundo, si la instantánea pasa de 50 ms o si el nombre aparece en la grabación.

## 7. El bloqueo después de las finales gratis

- **Dónde vive.** En el servidor: las tablas `dispositivos`, `partidas` y `encuestas` de D1, con la regla de 5.5. El navegador guarda una copia (`tarima.muro`, `tarima.quedan`) solo para pintar el muro al instante, antes de que conteste el Worker.
- **Cómo resiste recargar.** Al cargar, siempre se pregunta a `/api/estado`. La copia local pinta lo mismo mientras tanto. Recargar no cambia nada porque la cuenta no está en la página.

**Qué tan fácil es saltearlo**

| Qué hace el jugador | Resultado |
|---|---|
| Recarga, cierra o vuelve otro día | Muro |
| Borra solo `localStorage` | La cookie `tdv` lo reconoce. Muro |
| Borra todos los datos del sitio o abre una ventana privada | Dispositivo nuevo, pero la misma IP: juega hasta completar 6 finales de esa red en 30 días. Después, muro |
| Cambia de red (pasa de wifi a datos, usa una VPN) y además borra los datos | Juega 2 más por cada red nueva. Es lo que sigue abierto |
| Pone el mail de otra persona | Se desbloquea. En el MVP no se verifica la propiedad del mail. El costo es bajo: no hay nada canjeable |
| Bloquea `/api/*` con una regla del bloqueador | El juego entra en «sin servidor» y lo deja jugar una final por carga de página. Requiere saber qué bloquear |
| Edita el JavaScript, que es estático | Juega sin límite. Ningún bloqueo del lado del cliente lo evita |

El objetivo del MVP es el jugador común, que recarga o vuelve al día siguiente, no el que hace trampa. Al que hace trampa se le pone un costo, sin pedirle más datos a nadie.

**Endurecer sin fricción, en orden de costo**
1. **Sin servidor solo con historia limpia.** Si `tarima.dispositivo` ya existe, el modo «sin servidor» se niega. Cuesta 5 líneas y cierra la regla del bloqueador para quien ya jugó en ese navegador.
2. **Tope por IP más fino.** Contar dispositivos nuevos por IP por día y, si una red crea más de 3 por día, bajar su tope. No toca a nadie que juegue normal.
3. **Turnstile invisible.** Solo en `/api/partida` para dispositivos sin historia, y en los formularios. Frena bots y scripts, no a personas.
4. **Semillas firmadas por el servidor** (JUEGO.md 9.6). Cada llamado necesita una semilla que entrega el Worker con el pase. Sin pase no hay final, ni siquiera editando el código. Es el único bloqueo real, y llega gratis con la validación de resultados de la etapa siguiente.

Sin huella digital del navegador: es invasiva y en la UE pide consentimiento.

## 8. Qué queda fuera del MVP y qué sigue

**Fuera**
- Cuentas con contraseña o login social.
- Tabla global de resultados (hasta que el servidor recalcule los registros).
- Anuncios, precios y tienda.
- Número de fundador o dorsal.
- Referidos con premio.
- Notificaciones push.
- Grabación de sesión prendida.
- Imagen del podio para compartir (va solo el texto).
- Filtro de insultos.
- Verificar la propiedad del mail en el desbloqueo.
- Pro y la final completa como camino por defecto.

**Lo que sigue.** Las ideas del dueño son el gancho de la lista. El orden de 2 a 6 lo decide la pregunta 1 de la encuesta; el de abajo es el orden por defecto si no hay una señal clara.

1. **Resultados validados y desafío asincrónico.** Usan semillas firmadas. Cierran el bloqueo y abren «jugá la misma final que tu amigo».
2. **Crear tu pesista.** Contextura, piel, pelo, malla y nombre propio, con la cara elegida entre caras ficticias.
3. **Pesistas mujeres y categorías de peso.** Arregla el límite conocido de «tu nombre sobre un cuerpo de hombre».
4. **Carrera y entrenamiento.** Entrenar las falencias que mostró la final (las causas de `intento_propio`), con progreso guardado en el servidor.
5. **Sedes.** Finales en sedes inspiradas en eventos reales, con nombres parecidos y siempre ficticios: sin anillos, sin «Olímpico», sin «ciudad + año», sin emblemas.
6. **Jugar contra amigos u online.** Primero asincrónico (el punto 1) y después en vivo.
7. **Más realismo.** Ayudantes que cargan la barra, fallos visibles con el pesista soltando la barra, y control antidoping como momento de relato, nunca como mecánica de castigo.
8. **Monetización.** Según la pregunta 4: cosméticos o un pago único por el juego completo, nunca kilos.

## 9. Riesgos y decisiones del dueño

**Riesgos**

- **Largo hasta el muro.** Entre la práctica y dos finales rápidas hay 12 a 13 minutos. Cada minuto pierde gente que nunca ve el mail.
  - Mitigación: la invitación suave del podio 1, y el abandono por pantalla medido desde el primer día.
  - Si la final 1 la termina menos del 40 %, la próxima palanca es una primera final de solo arranque. Es una decisión de juego, no de texto.
- **Tope por IP en redes compartidas.** Con CGNAT de celulares en IPv4 o en universidades, el tope puede bloquear a alguien que no jugó nunca. Se mide con la alarma de la sección 1 y se sube `TOPE_IP` sin tocar código. El texto `muro.titulo_ip` lo explica sin acusar.
- **Legal.**
  - El consentimiento está separado en dos casillas, pero el juego libre sigue condicionado a dejar el mail. Conviene que lo mire alguien de legales antes de abrir a la UE.
  - La transferencia a PostHog US se cubre con el DPA y las cláusulas tipo (https://posthog.com/dpa), y hay que aceptar ese DPA en la cuenta.
  - Si el responsable está en Argentina, la Ley 25.326 puede pedir inscribir la base ante la AAIP.
  - Si más adelante se quiere residencia de datos en la UE, hay que crear otro proyecto en EU Cloud: PostHog no mueve datos entre regiones.
- **Re-identificar a los anotados en cada visita.** Es lo que permite medir su retención, pero liga sus partidas a un seudónimo. Está dicho y se puede apagar. Si legales lo objeta, se identifica solo en la visita del alta y la retención de anotados se mide desde D1.
- **Entregabilidad.** Un dominio nuevo que manda confirmaciones cae en spam si faltan SPF, DKIM y DMARC. Hay que configurarlos antes de abrir el muro y medir confirmados sobre anotados (meta: 60 % o más).
- **Pruebas atadas al texto.** `check_game.mjs` busca `/intento 2/` y lee `#btn-otro` e `#inicio`. `sim_test.mjs` busca `/desde que confirmás/` y `/ENTER/` en `explicar()`. Hay que pasarlas a claves (`data-clave`) o fijar `?lang=es`. El muro se prueba con la regla pura (`worker_test.mjs`) y con `?muro=firme`, que solo vale en `localhost`.
- **Largo en inglés en el teléfono.** EXPLODE! y las líneas de `explicar()` hay que verlas a 390 px. Si no entran, se usa POP!.
- **Malla con relieve «BRENNER».** Puede leerse sobre un pesista que lleva el nombre del jugador. Se tapa o se cambia la tela del modelo Largo cuando lo elige el jugador.
- **Nombre del juego.** No apareció ningún juego llamado «Tarima», pero sí «Tarim» (2017). Antes de publicar hay que buscar uno por uno «Tarima», los nombres de los pesistas y los códigos de país (JUEGO.md 6.1).

**Pasos del dueño** (no son decisiones; los hace él o el orquestador con su permiso)

1. **PostHog** (proyecto 606461, US Cloud):
   - Activar «Discard client IP data».
   - Aceptar el DPA.
   - Crear la encuesta de tipo API con las 5 preguntas de 4.5 y pasar su id y los ids de las preguntas.
   - Crear las banderas `muro-partidas-gratis` (`2` al 100 %), `muro-texto` (`a` al 100 %), `invitacion-podio1` (`on`) y `grabacion` (multivariante `off`, `tercio`, `todas`; sin crearla vale `tercio`).
   - Prender «Session replay» en el proyecto (6.6).
   - Fijar la retención de eventos en 12 meses.
2. **Cloudflare:**
   - Dominio propio.
   - Base D1 `tarima`.
   - Los cuatro secretos.
   - `POSTHOG_KEY`, tomada de `tarima-datos/posthog.json` y fuera del repo.
   - Email Sending con SPF, DKIM y DMARC.
   - Los límites de pedidos.
3. Completar `{responsable}`, `{país}` y `{contacto}` en la página de privacidad.
4. Dar permiso explícito para desplegar.

**Decisiones del dueño**

1. **¿Qué gana quien deja el mail?** Recomiendo juego libre en ese dispositivo hasta la próxima versión. El valor del mail es la lista, no el bloqueo. Dar «5 finales más» obliga a un segundo muro sin nada nuevo que ofrecer.
2. **¿Con qué dominio, qué mail de contacto y quién figura como responsable?** Recomiendo un dominio propio corto y la casilla `hola@` de ese dominio. Como responsable, el dueño como persona física hasta que haya empresa, con revisión legal antes de abrir a la UE.
3. **¿Edad mínima?** Recomiendo 16 años para la lista. El juego no pide edad. Con 16 se cubre el umbral más alto del RGPD sin agregar una pantalla.
4. **¿Voseo o español neutro?** Recomiendo voseo en el MVP: es la voz de la marca y ya está escrito. Se mide el uso por `pais` y, si menos del 30 % del español viene del Río de la Plata, se agrega un español neutro sobre las mismas claves.
5. **¿Cuántas finales gratis al salir?** Recomiendo 2 fijas y probar 1 contra 2 con la bandera recién con 1.000 visitas. Antes, la diferencia no se ve y se pierde la lectura de la final 2.

## Fuentes

- PostHog, proxy con Cloudflare Workers: https://posthog.com/docs/advanced/proxy/cloudflare
- PostHog, encuestas con interfaz propia (modo API): https://posthog.com/docs/surveys/implementing-custom-surveys
- PostHog, configuración de posthog-js: https://posthog.com/docs/libraries/js/config
- PostHog, persistencia (`memory`): https://posthog.com/docs/libraries/js/persistence
- PostHog, acuerdo de tratamiento de datos (cláusulas tipo, Decisión 2021/914, módulo 2): https://posthog.com/dpa
- RGPD, art. 7 (7.4, consentimiento condicionado): https://gdpr-info.eu/art-7-gdpr/
- RFC 8058, baja con un clic: https://www.rfc-editor.org/rfc/rfc8058
- CrazyGames, métricas de lanzamiento: https://docs.crazygames.com/resources/basic-launch-metrics/
- Conversión de listas de espera (2 a 5 %): https://medium.com/@soyzamudio/maximizing-waitlist-conversion-rates-data-driven-strategies-6856cb91f83b
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Código leído: `web/js/game/main.js`, `web/js/game/ui/mensajes.js`, `web/js/game/controles.js`, `web/js/game/roster.js`, `web/js/game/ui/senal.js`, `web/js/game/ui/tablero.js`, `web/js/sim/rules.js`, `web/juego.html`, `HANDOFF.md`, `docs/JUEGO.md`.

## Decisiones del dueño (12 de noviembre de 2026)

- **Quien deja el mail juega libre** en ese dispositivo hasta la próxima versión (recomendación aceptada).
- **Español neutro desde el inicio**, sin voseo: se reescriben las claves en español de la tabla 4.5 con tuteo o sin tratamiento («toca», «gana», «tu pesista»). El inglés no cambia. Esto reemplaza la decisión de voseo de este documento.
- **Edad mínima para la lista de espera: 16 años**, dicha en la línea legal y en la página de privacidad; el juego no pide edad.
- Finales gratis antes del muro (1 o 2): pendiente de respuesta del dueño; mientras tanto se implementa con 2, configurable.
- Dominio, mail de contacto y responsable de los datos: pendientes.

## Revisión (12 de noviembre de 2026)

Revisión independiente de este documento y de `worker/`, en la rama `mvp`. Las pruebas quedaron así: `cd worker && npm test` da 36 bien y `node tools/worker_test.mjs` da 127 controles bien. Las 8 pruebas nuevas o cambiadas fallan contra el código anterior.

### Arreglado en el servidor, con prueba

1. **La lista se podía enumerar desde `/api/anotar`.** Respondía `ya_estaba` para cualquier mail que ya estuviera en la lista. Eso anulaba el cuidado de `/api/baja`, que siempre responde lo mismo. Ahora un dispositivo que no estaba ligado a ese mail recibe la misma respuesta que un alta nueva, y sale un mail en los dos casos, como mucho uno por día por dirección: otra vez la confirmación si no estaba confirmado, o el aviso nuevo `mail.ya.*` si ya lo estaba. `ya_estaba` solo vuelve cuando el mismo dispositivo repite su propio mail.
2. **Un tercero podía anotar a cualquiera en las novedades.** Con un mail que ya existía y `novedades: true`, la fila se actualizaba sin verificar el mail y sin registrar un consentimiento nuevo. Con eso se salteaba el doble opt-in y se perdía la prueba de consentimiento. Ahora un mail existente no cambia nada de lo guardado.
3. **La confirmación se hacía con un GET.** Los escáneres de links de los correos de empresa abren cada link, así que un mail anotado por otra persona quedaba confirmado solo. Ahora `/confirmar` funciona como `/baja`: el GET muestra un botón y el POST confirma.
4. **El límite por IP de `/baja` y `/confirmar` frenaba la baja de un clic.** Gmail y Yahoo mandan el POST del RFC 8058 desde pocas IP compartidas, así que con 10 por hora por IP las bajas empezaban a fallar con 429. Ahora el límite cuenta solo los tokens inválidos, y un token válido nunca lo toca. Adivinar un token es imposible: tiene 128 bits de id y 160 de firma.
5. **La variable `GRATIS` no tenía efecto.** `combinarBanderas` siempre devolvía `muro-partidas-gratis = '2'` por defecto, y `config` lo leía como si fuera la bandera. Además, si PostHog respondía sin esa bandera (por ejemplo, antes de crearla), el `'2'` por defecto se guardaba en D1 y quedaba pegado al dispositivo. Era justo la decisión pendiente del dueño, 1 o 2 finales, «configurable». Ahora en D1 solo se guarda lo que asignó PostHog, y mientras no haya asignación manda `GRATIS`.
6. **Los dispositivos anotados no se borraban nunca, ni siquiera después de la baja.** La página de privacidad dice «el del dispositivo, a los 180 días sin jugar». Ahora la limpieza borra todo dispositivo con 180 días sin jugar, y anotarse cuenta como actividad. Quien vuelve después pone el mismo mail y recupera el juego libre.
7. **El proxy `/qx` dejaba pasar `Authorization` con claves `phs_` y `phx_`.** Eso lo convertía en un pasaje a la API privada de PostHog. Ahora deja pasar solo `phc_`, como dice 6.2.
8. **El mail de confirmación prometía «no te vamos a escribir más».** Con el punto 1 eso puede no cumplirse. Ahora dice que, si no se confirma, la dirección se borra a los 30 días.

### Cambiado en el diseño

- **Recargar en medio de una final** (sección 0 y tabla «Recargar»). La final se reanuda una vez con el pase guardado en la pestaña. Con solo 2 finales gratis, perder una por una recarga, por una llamada en el teléfono (iOS descarta las pestañas WebGL que quedan en segundo plano) o por un cuelgue es la manera más segura de que alguien se vaya enojado antes de ver el muro. Esto no abre ningún hueco nuevo: el servidor ya contó esa final, y quien edita el JavaScript ya juega sin límite.
- **Muro por IP para quien nunca jugó** (P0). Antes, quien entraba desde una red compartida que ya había gastado su tope veía el muro al cargar, sin saber todavía qué era el juego. Ahora juega primero la bienvenida y la práctica, y el muro aparece en P4 con la encuesta arriba.
- **Idioma.** La tabla de la sección 0 y la 4.3 ya dicen español neutro, y «Español neutro» sale de lo que queda fuera (sección 8). Las tablas de 4.5 siguen en voseo y hay que reescribirlas, como dice «Decisiones del dueño».
- **Textos en inglés que sonaban a traducción o a jerga.** «How much do you open with» pasa a «How much weight for your first…». «You're in place {n}» pasa a «You're in {pos} place», con la variable nueva `{pos}`. «Asked:» pasa a «Your weight:». «Meet record» pasa a «Competition record». «lower weight lifts first» pasa a «whoever asks for less weight lifts first». Y el inglés usa comillas “ ” en lugar de « ».
- **P11 y `lista.ok_confirmar`.** Ahora dicen «Revisá tu mail» y no «te mandamos un mail para confirmar», porque al que ya estaba confirmado le llega el aviso y no una confirmación.
- **Medición apagada** (6.1 y 6.3). No se llama a `opt_out_capturing()`, que guarda una marca propia en el navegador. La prueba de humo busca `ph_` en cualquier parte del nombre.
- **Otros casos** (sección 2). Se agregan las dos pestañas y el `<noscript>`.

### Queda abierto

- **Faltan 12 a 13 minutos hasta el muro.** Es el riesgo más grande para la meta de mails. Con la invitación del podio 1 y la reanudación hay menos pérdida, pero si menos del 50 % empieza la final 2, la palanca que sigue es `muro-partidas-gratis=1` o una primera final de solo arranque, y no un cambio de texto.
- **Tope de 5 altas por hora por IP.** En una oficina, una universidad o detrás del CGNAT de un celular con IPv4, el sexto que se anota en esa hora ve «Demasiados intentos» y ese mail se pierde. Hay que mirar `anotar_error` con `motivo=limite` y, si aparece, subir a 20 por IP y sumar un tope de 5 por dispositivo. El tope está bajo a propósito, porque cada alta manda un mail y protege la reputación del dominio.
- **`lista_id` con un mail ajeno.** Quien escribe el mail de otra persona recibe su `lista_id`, y desde ese momento sus eventos se juntan en PostHog con el perfil de esa persona. Eso ensucia las métricas, pero no deja leer nada, porque la clave `phc_` solo sirve para escribir. Si molesta, se identifica en PostHog solo después de confirmar el mail.
- **La casilla de aviso obligatoria agrega fricción.** Si el botón dice con claridad para qué es el mail («Anotarme: avisame por mail cuando abra»), apretarlo ya es un consentimiento explícito, y bastaría con la casilla opcional de novedades. Conviene que lo decida alguien de legales. El servidor no cambia: el juego manda `aviso: true` al tocar el botón.
- **429 y 503 en `/api/partida` pasan a «sin servidor».** Con eso, una red que llegó a 20 pedidos cada 10 minutos juega una final por carga sin que nadie la cuente. Hay que aplicar el endurecimiento 1 de la sección 7 desde el principio.
- **Promesa sobre pagos.** Resuelto el 12 de noviembre: el dueño la saca de todo hasta definir la monetización (juego, páginas del Worker, correos y estos documentos).
- **En español neutro, «mail» suena rioplatense.** Al reescribir las tablas conviene usar «correo» o «email». Los textos del Worker usan «mail» hasta que se decida.
