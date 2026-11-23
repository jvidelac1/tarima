# Textos de difusión listos para copiar (LIF-30 y LIF-54)

Textos para pegar en cada canal, en inglés y en español. **No se publicó nada.** El plan, los canales y las reglas de cada
lugar están en `docs/DIFUSION.md`; acá van solo las piezas. Preparado el 23 de noviembre de 2026 sobre lo publicado el
17-nov.

Reglas que siguen todas las piezas (de `CONTEXTO.md` y `docs/MVP.md` 4.3):

- Personajes, países y evento ficticios (Lifting Game Open, Ilarraz de Montelar, Kordan de Dravenia, rivales Ventura,
  Brenner y Marangi). Nada de atletas, marcas ni competencias reales asociadas al juego.
- Sin premios, precios, fechas ni promesas. Lo que todavía no está publicado (ranking global y campeonato semanal) aparece
  **solo** en las variantes marcadas «COMING SOON», sin fecha.
- Honestos con el muro: hoy el arranque se juega gratis y, para seguir con el dos tiempos, el juego pide un correo (regla
  de producción del 17-nov, `docs/MVP.md`). Las piezas largas lo dicen; si la regla cambia, hay que cambiar esa línea.
- Español: rioplatense sin modismos fuertes, con voseo, para comunidades. En un grupo de otro país conviene pasarlo a tú
  (cambian pocas palabras: «probalo» → «pruébalo», «decime» → «dime»). Los nombres de botones del juego van como los ve
  el jugador (Opciones, Fácil).
- Links: los de la tabla de `docs/DIFUSION.md` 1. Cambiar `utm_content` en cada lugar (subreddit, grupo, cuenta, clip).
  Para la versión en español, agregar `&lang=es` al final.

Qué hay de nuevo desde el 17-nov (base de todas las piezas, para no inventar):

| En el juego | EN | ES |
|---|---|---|
| Primera persona por defecto, con un recuadro de la vista de afuera; la cámara se cambia en la partida | First-person view by default (from the lifter's eyes), with a small outside-view inset | Primera persona por defecto (desde los ojos del pesista), con un recuadro de la vista de afuera |
| Sala nueva | New venue | Sala nueva |
| Final sin giros de cámara | No more camera spins during the final | La final sin giros de cámara |
| Vertical en el celular | Works in portrait on your phone | Se juega con el celular parado |
| Fácil más amigable | Easy mode is friendlier | El nivel Fácil es más amigable |
| Selección de pesista en 3D, con Ilarraz y Kordan nuevos | 3D lifter select, two new lifters: Ilarraz and Kordan | Elección de pesista en 3D, con dos nuevos: Ilarraz y Kordan |
| Opciones más a la vista | Options are easier to find | Opciones más a la vista |
| **Sin publicar:** ranking global y campeonato semanal con la misma final para todos | Coming soon (variante marcada) | Próximamente (variante marcada) |

---

## LIF-30 · Updates del juego para Reddit y X

### Reddit: antes de publicar

- **Leer las reglas de cada subreddit** (barra lateral y wiki) el mismo día que se publica. Muchos piden una proporción de
  autopromoción (la pauta general de Reddit es no hacer de la cuenta solo un canal de links), hilos semanales específicos,
  o flair obligatorio. Si la regla pide usar un hilo semanal, el post va ahí y no suelto.
- Un subreddit por día, como mucho; estar en los comentarios las primeras horas.
- Link con `utm_source=reddit` y `utm_content` = el subreddit (`r_weightlifting`, `r_webgames`…).
- No repetir el mismo texto en todos: cambia el título y el primer párrafo según el ángulo.

| Subreddit | Ángulo | Notas (verificar) |
|---|---|---|
| r/weightlifting | Gente que levanta: «¿se siente como una competencia de verdad?». Pedir opinión sobre la elección de kilos, los 3 intentos y el veredicto de los jueces | Es el más específico y el más estricto. Ver si permite autopromoción o solo en un hilo (tipo «Weekly» / «Off-topic»). Si hay dudas, escribirles a los mods antes |
| r/WebGames | Se juega en el navegador sin instalar, un toque o Espacio, en el celular parado | Suelen pedir link directo al juego y que no haya registro obligatorio antes de jugar: el arranque se juega sin nada, pero el muro de correo existe; decirlo en el post |
| r/playmygame | Pedido de feedback de un hobbyista: qué se entiende, dónde se trabó | Pide formato de post propio (a veces un formulario o flair); leerlo |
| r/IndieGaming | El proceso: un deporte de nicho a un botón, qué cambió en la versión nueva | Suelen preferir imagen o video con el post; usar el clip 1 de LIF-57 |
| r/threejs | Lo técnico: primera persona con recuadro, sala nueva, juego en vertical, three.js sin build | Les interesa el cómo; mostrar una captura y contar una decisión técnica. Ver si piden «Showcase» como flair |

### Reddit · EN · post de actualización (genérico)

**Title:** I made a free one-button weightlifting game for the browser — just updated it with a first-person view

**Body:**

```
Hi! I'm a hobbyist building Lifting Game, a small browser game about Olympic weightlifting. You play a final against two fictional rivals: snatch and clean & jerk, 3 attempts each, best total wins. One button (tap or Space); the hard part is choosing your weights, not your reflexes.

What's new in this update:
- First-person view by default: you see the bar from the lifter's eyes, with a small inset of the outside view
- A new venue
- No more camera spins during the final
- Works in portrait on your phone
- Easy mode is friendlier
- 3D lifter select, with two new lifters (Ilarraz and Kordan)
- Options are easier to find

It runs in the browser, no install, in English and Spanish. The snatch is free to play right away; to keep going with the clean & jerk it asks for an email.

I'd really like to know what's confusing or where you got stuck. Thanks for trying it.

https://liftinggame.pages.dev/?utm_source=reddit&utm_medium=social&utm_campaign=lif54-2026-11&utm_content=r_SUBREDDIT
```

### Reddit · ES · post de actualización (para subreddits en español, p. ej. r/halterofilia si existe y está activo; verificar)

**Título:** Hice un juego web de halterofilia a un botón y le acabo de sumar la primera persona

**Cuerpo:**

```
¡Hola! Estoy armando como hobby Lifting Game, un juego chico de halterofilia para el navegador. Jugás una final contra dos rivales ficticios: arranque y dos tiempos, 3 intentos de cada uno, gana el mejor total. Un solo botón (toque o Espacio); lo difícil es elegir los kilos, no los reflejos.

Lo nuevo de esta versión:
- Primera persona por defecto: ves la barra desde los ojos del pesista, con un recuadro de la vista de afuera
- Sala nueva
- La final ya no tiene giros de cámara
- Se juega con el celular parado
- El nivel Fácil es más amigable
- Elección de pesista en 3D, con dos nuevos (Ilarraz y Kordan)
- Opciones más a la vista

Anda en el navegador, sin instalar, en español y en inglés. El arranque se juega directo; para seguir con el dos tiempos pide un correo.

Me sirve mucho saber qué no se entiende o dónde te trabaste. ¡Gracias por probarlo!

https://liftinggame.pages.dev/?utm_source=reddit&utm_medium=social&utm_campaign=lif54-2026-11&utm_content=r_SUBREDDIT&lang=es
```

### Reddit · primeros párrafos por ángulo (reemplazan el primer párrafo del genérico)

**r/weightlifting · EN**

```
Lifters, I'd love your eyes on this. I'm a hobbyist making a browser game where you play a weightlifting final: you pick your openers, decide your jumps after seeing what your rivals ask for, and get 3 attempts at snatch and clean & jerk. Judges give white or red lights. Everyone in it is fictional. I'm trying to make it feel like a real meet for people who lift, and simple enough for people who don't. What feels off?
```

**r/weightlifting · ES**

```
A los que levantan: me gustaría su opinión. Estoy haciendo como hobby un juego web donde jugás una final de halterofilia: elegís la apertura, decidís cuánto subir después de ver lo que piden los rivales, y tenés 3 intentos de arranque y de dos tiempos. Los jueces dan luces blancas o rojas. Todos los personajes son ficticios. Quiero que se sienta como una competencia de verdad para quien levanta y que sea simple para quien no. ¿Qué les hace ruido?
```

**r/threejs · EN**

```
Made with three.js, plain ES modules, no build step. This update switched the default camera to first person (from the lifter's eyes) with a small inset that renders the outside view, added a new venue, and made the whole thing playable in portrait on phones. Happy to answer questions about how any of it works.
```

**r/threejs · ES**

```
Hecho con three.js, módulos ES sin build. En esta versión la cámara por defecto pasó a primera persona (desde los ojos del pesista) con un recuadro que dibuja la vista de afuera, hay una sala nueva y todo se juega con el celular parado. Si quieren saber cómo está hecho algo, pregunten.
```

### Reddit · variante COMING SOON (solo si se decide contarlo; agregar al final del post, antes del link)

> ⚠️ Variante marcada: menciona cosas **todavía no publicadas**. Sin fecha. Usarla solo con OK del dueño.

**EN**

```
Coming soon (no date yet): a global leaderboard and a weekly championship where everyone plays the same final.
```

**ES**

```
Próximamente (todavía sin fecha): ranking global y un campeonato semanal en el que todos juegan la misma final.
```

### Reddit · respuestas tipo para los comentarios

| Situación | EN | ES |
|---|---|---|
| «¿Por qué pide mail?» | Fair question. The snatch is free for everyone; the email is how I'm finding out if people want to keep playing. It's only used for game news if you opt in, details in the Privacy link at the bottom. | Pregunta justa. El arranque es gratis para todos; el correo es mi forma de saber si a la gente le interesa seguir jugando. Solo se usa para novedades del juego si lo aceptás; el detalle está en «Privacidad», abajo de todo. |
| «Se trabó / no anda en mi teléfono» | Thanks for telling me. What phone and browser? Did it stop at the loading screen or during a lift? | ¡Gracias por avisar! ¿Qué teléfono y navegador? ¿Se quedó en la carga o en medio de un levantamiento? |
| «¿Son atletas reales?» | No, everyone in the game is fictional: names, countries and the event. | No, todo es ficticio: nombres, países y el evento. |
| Crítica | Thanks, that's useful. I'll look at it. | Gracias, me sirve. Lo voy a mirar. |

Antes de pegar la del correo: confirmar que lo que dice coincide con `web/privacidad.html` publicado ese día.

### X · posts de actualización

Link: `https://liftinggame.pages.dev/?utm_source=x&utm_medium=social&utm_campaign=lif54-2026-11&utm_content=update`
(en X un link cuenta 23 caracteres; los textos de abajo entran en 280 con el link). Adjuntar el clip 1 o una captura de la
primera persona.

**Post 1 · EN**

```
Lifting Game update: you now lift from the lifter's eyes. First-person view by default, a new venue, no camera spins in the final, and it works in portrait on your phone.

Free in the browser, one button. #weightlifting #indiegame

[link]
```

**Post 1 · ES**

```
Actualicé Lifting Game: ahora levantás desde los ojos del pesista. Primera persona por defecto, sala nueva, la final sin giros de cámara y se juega con el celular parado.

Gratis en el navegador, un solo botón. #halterofilia #weightlifting

[link]&lang=es
```

**Post 2 · EN** (para un segundo día, con captura de la elección de pesista)

```
Two new lifters in Lifting Game: Ilarraz and Kordan, in a new 3D lifter select you can spin around. Easy mode is friendlier too, and Options are easier to find.

All characters are fictional. #weightlifting #webgame

[link]
```

**Post 2 · ES**

```
Dos pesistas nuevos en Lifting Game: Ilarraz y Kordan, en una elección de pesista en 3D que podés girar. El Fácil es más amigable y Opciones está más a la vista.

Todos los personajes son ficticios. #halterofilia #weightlifting

[link]&lang=es
```

**Hilo corto (opcional) · EN**

```
1/ I'm a hobbyist making a one-button weightlifting game for the browser. Just shipped a big visual update. 🧵
2/ First person by default: you see the bar from the lifter's eyes, with a small inset of the outside view.
3/ New venue, no camera spins in the final, portrait mode on phones.
4/ 3D lifter select with two new (fictional) lifters, and a friendlier Easy mode.
5/ Try it and tell me where you got stuck: [link]
```

**Hilo corto (opcional) · ES**

```
1/ Hago como hobby un juego web de halterofilia a un botón. Acabo de publicar una actualización grande. 🧵
2/ Primera persona por defecto: ves la barra desde los ojos del pesista, con un recuadro de la vista de afuera.
3/ Sala nueva, la final sin giros de cámara y se juega con el celular parado.
4/ Elección de pesista en 3D con dos pesistas nuevos (ficticios) y un Fácil más amigable.
5/ Probalo y contame dónde te trabaste: [link]&lang=es
```

**Variante COMING SOON · X** (⚠️ todavía no publicado; sin fecha; solo con OK del dueño)

EN:

```
Working on what's next for Lifting Game: a global leaderboard and a weekly championship where everyone plays the same final. Not out yet — I'll post when it is.

Meanwhile, the first-person update is live: [link] #weightlifting
```

ES:

```
Lo que sigue en Lifting Game: ranking global y un campeonato semanal donde todos juegan la misma final. Todavía no está; aviso cuando salga.

Mientras, ya está la actualización en primera persona: [link]&lang=es #halterofilia
```

---

## LIF-56 · Comunidades de halterofilia: Facebook, WhatsApp y Discord

Lugares y reglas: `docs/DIFUSION.md` 2. Siempre: pedir permiso al admin antes si la regla no permite promoción o no dice
nada; un grupo por día; estar para responder. `utm_content` = el nombre corto del grupo o servidor.

### Mensaje al admin para pedir permiso

**EN**

```
Hi! I'm a hobbyist and I made a free browser game about Olympic weightlifting (snatch and clean & jerk, fictional athletes, one button). I'd like to share it once in the group to get feedback from people who lift. Is that OK, or is there a day or thread for this? No problem if not. Thanks!
```

**ES**

```
¡Hola! Hago juegos como hobby y armé un juego web gratis de halterofilia (arranque y dos tiempos, pesistas ficticios, un solo botón). Me gustaría compartirlo una vez en el grupo para recibir opiniones de gente que levanta. ¿Se puede, o hay un día o un hilo para esto? Si no, no hay problema. ¡Gracias!
```

### Post para Facebook (grupo)

Subir el clip directo a Facebook. El link va en el texto o en el primer comentario, según la regla del grupo.

**EN**

```
I made a small browser game about weightlifting and I'd love feedback from people who actually lift.

You play a final against two fictional rivals: 3 attempts at snatch and 3 at clean & jerk, best total wins. You choose your weights after seeing what the others ask for, and the judges give the lights. One button, works on your phone (even in portrait) and on a computer.

Just updated it: you now lift in first person, from the lifter's eyes.

The snatch is free to play right away; to continue with the clean & jerk it asks for an email.

What feels like a real meet and what doesn't?

https://liftinggame.pages.dev/?utm_source=facebook&utm_medium=grupo&utm_campaign=lif54-2026-11&utm_content=GRUPO
```

**ES**

```
Hice un juego web chico de halterofilia y me encantaría la opinión de gente que levanta.

Jugás una final contra dos rivales ficticios: 3 intentos de arranque y 3 de dos tiempos, gana el mejor total. Elegís los kilos después de ver lo que piden los otros, y los jueces dan las luces. Un solo botón; anda en el celular (también parado) y en la compu.

Lo acabo de actualizar: ahora levantás en primera persona, desde los ojos del pesista.

El arranque se juega directo; para seguir con el dos tiempos pide un correo.

¿Qué se siente como una competencia de verdad y qué no?

https://liftinggame.pages.dev/?utm_source=facebook&utm_medium=grupo&utm_campaign=lif54-2026-11&utm_content=GRUPO&lang=es
```

### Mensaje para Discord (canal de autopromoción o el que indique un mod)

Con una captura o un GIF de 5 a 10 s (el veredicto con las tres luces o la primera persona).

**EN**

```
I made a browser weightlifting game: a snatch and clean & jerk final against two fictional rivals, one button. Just added a first-person view. Looking for opinions from people who lift — what feels off?
https://liftinggame.pages.dev/?utm_source=discord&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=SERVIDOR
```

**ES**

```
Hice un juego web de halterofilia: una final de arranque y dos tiempos contra dos rivales ficticios, un solo botón. Le acabo de sumar la primera persona. Busco opiniones de gente que levanta: ¿qué les hace ruido?
https://liftinggame.pages.dev/?utm_source=discord&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=SERVIDOR&lang=es
```

### Mensaje para WhatsApp (grupo de club, siempre con permiso de quien lo administra)

Para reenviar tal cual. Para el pedido a coaches, ver LIF-60.

**EN**

```
I made a free weightlifting game for the phone: a snatch and clean & jerk final against two rivals, one button. If you try it, tell me what you think 🙏
https://liftinggame.pages.dev/?utm_source=whatsapp&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=GRUPO
```

**ES**

```
Hice un juego gratis de halterofilia para el celular: una final de arranque y dos tiempos contra dos rivales, un solo botón. Si lo probás, contame qué te pareció 🙏
https://liftinggame.pages.dev/?utm_source=whatsapp&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=GRUPO&lang=es
```

---

## LIF-57 · Clips cortos para Instagram y TikTok (10 a 20 s)

Formato: vertical (9:16), grabado con el juego parado (el modo vertical del 17-nov), sin depender del sonido. Personajes
ficticios: nada de atletas, marcas ni competencias reales en el clip. Se graban en Actions, no en la Mac (decisión 4 de
`docs/DIFUSION.md` 6: el dueño elige y aprueba los momentos).

Texto en pantalla: dos versiones por clip (EN y ES), o ninguna si el clip se entiende solo (lo que `docs/DIFUSION.md` 3
recomienda para que cualquier cuenta lo republique). Letra grande, arriba, fuera del recuadro de la vista de afuera.

Link: en la bio (`utm_source=instagram` o `tiktok`, `utm_medium=video`, `utm_content=bio`); para cuentas que republican,
`utm_content` = la cuenta (`ig_NOMBRE`).

Hashtags base (4 a 6, no más): `#weightlifting #olympicweightlifting #snatch #cleanandjerk #indiegame` y, en español,
`#halterofilia #levantamientoolimpico #weightlifting #snatch #juegoindie`.

### Clip 1 · «Desde los ojos del pesista» (15 s)

| Segundo | Qué se ve | Texto en pantalla EN / ES |
|---|---|---|
| 0–3 | Primera persona: la barra en el piso, las manos, la sala; el recuadro de afuera en la esquina | POV: it's your 3rd attempt / POV: es tu tercer intento |
| 3–10 | El arranque entero en primera persona (el toque se ve en la barrita en verde) | (sin texto) |
| 10–13 | Tres luces blancas | GOOD LIFT / ¡VALE! |
| 13–15 | Logo o nombre + «play free in your browser» | Lifting Game · free in the browser / Lifting Game · gratis en el navegador |

Caption EN: `One button. Now in first person. Link in bio. #weightlifting #olympicweightlifting #snatch #indiegame`
Caption ES: `Un solo botón. Ahora en primera persona. Link en la bio. #halterofilia #weightlifting #snatch #juegoindie`

### Clip 2 · «El tercer intento decide» (18 s)

| Segundo | Qué se ve | Texto en pantalla EN / ES |
|---|---|---|
| 0–4 | El tablero: el rival pidió más kilos | Rival asks for +3 kg / El rival pide 3 kg más |
| 4–9 | El rival levanta (vista de afuera), luces | (sin texto) |
| 9–15 | Tu turno, en primera persona, el dos tiempos | Your turn. / Te toca. |
| 15–18 | Veredicto y podio | Gold or nothing / Oro o nada |

Caption EN: `Every kilo is a decision. #weightlifting #cleanandjerk #olympicweightlifting #indiegame`
Caption ES: `Cada kilo es una decisión. #halterofilia #weightlifting #cleanandjerk #juegoindie`

Nota: el «+3 kg» es un ejemplo; poner lo que diga el tablero en la toma grabada.

### Clip 3 · «Se cayó» (12 s)

| Segundo | Qué se ve | Texto en pantalla EN / ES |
|---|---|---|
| 0–6 | Un levantamiento con una barrita en rojo; la barra se cae | (sin texto) |
| 6–9 | Luces rojas y la línea que nombra la barrita que falló | We've all been there / A todos nos pasó |
| 9–12 | Repetición o el siguiente intento que sale | Again. / Otra vez. |

Caption EN: `Missed it. Went again. #weightlifting #snatch #liftinggame`
Caption ES: `Se cayó. Fui de nuevo. #halterofilia #weightlifting #snatch`

### Clip 4 · «Elegí tu pesista» (10 s)

| Segundo | Qué se ve | Texto en pantalla EN / ES |
|---|---|---|
| 0–7 | La elección de pesista en 3D, girando; pasan Ilarraz y Kordan | Pick your lifter / Elige tu pesista |
| 7–10 | Toque en Jugar, entra a la sala | (nombre del juego) |

Caption EN: `Two new lifters: Ilarraz and Kordan. Fictional, but they train hard. #weightlifting #indiegame #gamedev`
Caption ES: `Dos pesistas nuevos: Ilarraz y Kordan. Ficticios, pero entrenan en serio. #halterofilia #juegoindie #gamedev`

### Mensaje directo a cuentas que republican (pidiendo permiso)

**EN**

```
Hi! I'm a hobbyist making a free browser weightlifting game (fictional athletes). Here's a 15-second clip in case it fits your page. You're free to repost it, with or without credit; if you link it, this link lets me know it came from you: [link con utm_content=ig_CUENTA]. No problem if it's not your thing. Thanks!
```

**ES**

```
¡Hola! Hago como hobby un juego web gratis de halterofilia (pesistas ficticios). Te paso un clip de 15 segundos por si le sirve a tu página. Lo podés republicar, con o sin crédito; si ponés el link, con este sé que vino de tu cuenta: [link con utm_content=ig_CUENTA]. Si no va con tu página, no hay problema. ¡Gracias!
```

---

## LIF-58 · Ficha para itch.io y Newgrounds

Antes de subir: las decisiones 1 y 2 de `docs/DIFUSION.md` 6 (muro en portales; iframe o archivos) siguen abiertas.
La ficha de abajo dice la verdad de la regla de hoy (el correo para seguir); si se publica una variante sin muro, borrar
esa línea. Newgrounds: verificar en el formulario si acepta un juego en iframe y si permite pedir correo.

| Campo | EN | ES |
|---|---|---|
| Título | Lifting Game | Lifting Game |
| Tagline (itch.io, hasta ~100 caracteres) | One-button Olympic weightlifting. Win the final by lifting more than your rivals. | Halterofilia a un botón. Gana la final levantando más kilos que tus rivales. |
| Género | Sports (itch.io: «Sports»; Newgrounds: elegir la categoría de deportes que ofrezca el formulario) | Deportes |
| Tags (itch.io) | sports, weightlifting, simulation, one-button, 3D, casual, singleplayer, browser | (los tags van en inglés) |
| Plataforma | HTML5, desktop and mobile (portrait and landscape) | HTML5, compu y celular (parado y acostado) |
| Idiomas | English, Spanish | Inglés, español |
| Precio | Free (itch.io HTML: solo donaciones; no activarlas sin decisión del dueño) | Gratis |

Nota sobre el tuteo: la ficha en español está con tú, como los textos del juego.

### Descripción corta

**EN**

```
A weightlifting final in your browser: snatch and clean & jerk, 3 attempts each, against two fictional rivals. One button — the challenge is picking your weights.
```

**ES**

```
Una final de halterofilia en el navegador: arranque y dos tiempos, 3 intentos de cada uno, contra dos rivales ficticios. Un solo botón; el desafío es elegir los kilos.
```

### Descripción larga

**EN**

```
Lifting Game is a small one-button game about Olympic weightlifting, made by a hobbyist.

You step onto the platform at the Lifting Game Open for a final against two rivals. Snatch first, then clean & jerk, 3 attempts each. Best snatch plus best clean & jerk is your total, and the highest total wins.

How it plays
- One button (tap or Space): a pointer moves along a bar; tap when it hits green. One bar in the snatch, two in the clean & jerk. All green and the bar always goes up.
- The real game is the weights: pick your opener, then decide how much to jump after you see what your rivals ask for.
- Every attempt tires you. Misses and heavy lifts tire you more.
- Three judges: two white lights and it counts.

What's in it
- First-person view by default, from the lifter's eyes, with a small inset of the outside view. Other cameras in Options.
- Pick your lifter in 3D: Compact, Long or Powerful build, each with strong and weak phases. Two new lifters: Ilarraz and Kordan.
- Rivals with their own style: one plays it safe, one does the math, one takes risks.
- Difficulty: Easy (default), Medium, Hard and Classic.
- Plays on phones (portrait or landscape) and computers. English and Spanish.

Every athlete, country and event in the game is fictional.

The snatch is free to play right away. To continue with the clean & jerk, the game asks for an email (used only for game news if you opt in; see Privacy in the game).

Feedback is very welcome in the comments.
```

**ES**

```
Lifting Game es un juego chico de halterofilia a un botón, hecho por un aficionado.

Subes a la tarima del Lifting Game Open para una final contra dos rivales. Primero el arranque, después el dos tiempos, 3 intentos de cada uno. Tu mejor arranque más tu mejor dos tiempos es tu total, y gana el total más alto.

Cómo se juega
- Un solo botón (toque o Espacio): un puntero va y viene en una barrita; toca cuando está en el verde. Una barrita en el arranque y dos en el dos tiempos. Si todas salen en verde, la barra sube siempre.
- El juego de verdad son los kilos: eliges la apertura y decides cuánto subir después de ver lo que piden tus rivales.
- Cada intento cansa. Los fallos y los pesos altos cansan más.
- Tres jueces: con dos luces blancas, vale.

Qué tiene
- Primera persona por defecto, desde los ojos del pesista, con un recuadro de la vista de afuera. Otras cámaras en Opciones.
- Elección de pesista en 3D: Compacto, Largo o Potente, cada uno con sus fases fuertes y débiles. Dos pesistas nuevos: Ilarraz y Kordan.
- Rivales con estilo propio: uno va a lo seguro, otro hace cuentas, otro arriesga.
- Dificultad: Fácil (por defecto), Medio, Difícil y Clásico.
- Se juega en el celular (parado o acostado) y en la computadora. En español y en inglés.

Todos los pesistas, países y eventos del juego son ficticios.

El arranque se juega directo. Para seguir con el dos tiempos, el juego pide un correo (solo se usa para novedades del juego si lo aceptas; ver Privacidad en el juego).

Cualquier comentario es bienvenido.
```

### Controles

| | EN | ES |
|---|---|---|
| Levantar | Space or tap the screen | Espacio o tocar la pantalla |
| Menús | Arrow keys and Enter | Flechas y Enter |
| Saltear el levantamiento del rival | S | S |
| Ayuda (cómo se juega) | H, or the «?» button on phones | H, o el botón «?» en el celular |
| Pausa | Esc | Esc |

### Capturas sugeridas (3 a 5, más la portada)

1. **Portada (630 × 500 en itch.io):** primera persona con la barra arriba y el recuadro de afuera; el nombre del juego
   grande. Sin texto chico.
2. Veredicto con las tres luces blancas.
3. Elección de pesista en 3D con Ilarraz o Kordan.
4. El tablero con los kilos que pide cada pesista (muestra que el juego es de decisiones).
5. El podio.
6. Una captura con el teléfono parado (muestra que anda en vertical).

Todas en inglés para itch.io y Newgrounds (el público es mayoría en inglés). Sacarlas en Actions, no en la Mac.

---

## LIF-59 · X: respuestas en competencias en vivo y posts con #weightlifting

Reglas para quien responde:

- Aportar a la conversación, no al juego. **Como mucho 1 de cada 5 respuestas lleva el link o el clip**, y nunca una
  respuesta que sea solo el link.
- No etiquetar atletas reales ni hablar del juego en hilos de un atleta. No usar el nombre de un atleta en un post propio
  junto al juego. No responder a cuentas de atletas con el link.
- No pegar la misma respuesta en varios hilos (X lo trata como spam; revisar la política de spam de la plataforma antes de
  empezar, `docs/DIFUSION.md` 4).
- Pocas respuestas por competencia (del orden de 5 a 10 en total), en hilos de transmisión o de resultados de cuentas de
  federaciones o de noticias.
- `utm_content` por competencia (`doha_lif`, `usaw_finals`, `english_champs`).
- Las respuestas de abajo son moldes: completar con lo que de verdad pasó y nunca inventar un dato del resultado.

### Respuestas sin link (la mayoría)

| Momento | EN | ES |
|---|---|---|
| Tercer intento que sale | What a way to finish. Making a lift with everything on the line never gets old. | Qué manera de cerrar. Un intento que sale con todo en juego nunca aburre. |
| Salto de kilos grande | Bold jump. Those are the calls that decide a session. | Salto valiente. Esas son las decisiones que definen una competencia. |
| Intento fallado | Tough miss, but that attempt was the right call. | Duro fallo, pero ese intento estaba bien elegido. |
| Decisión de jueces ajustada | Close one for the judges. Always tense waiting for those lights. | Ajustada para los jueces. Siempre tensa la espera de las luces. |
| Fin de una sesión | Great session to watch. Thanks for streaming it. | Linda sesión para ver. ¡Gracias por transmitirla! |

### Respuesta con link (solo cuando el hilo habla de la estrategia o de juegos, y 1 de cada 5 como mucho)

**EN**

```
Watching sessions like this is why I made a little browser game about picking attempts: snatch and C&J against two fictional rivals, one button. If anyone's curious: [link]
```

**ES**

```
Ver competencias así es lo que me llevó a hacer un juego web chico sobre elegir intentos: arranque y dos tiempos contra dos rivales ficticios, un solo botón. Por si a alguien le interesa: [link]&lang=es
```

### Posts propios con #weightlifting (para el perfil y uno fijado)

**Fijado · EN**

```
Lifting Game: a free one-button weightlifting game in your browser. Snatch and clean & jerk, 3 attempts each, two fictional rivals. Now in first person. Made by a hobbyist; feedback welcome.

#weightlifting [link] [clip 1]
```

**Fijado · ES**

```
Lifting Game: un juego gratis de halterofilia a un botón en el navegador. Arranque y dos tiempos, 3 intentos de cada uno, dos rivales ficticios. Ahora en primera persona. Lo hago como hobby; se agradecen comentarios.

#halterofilia #weightlifting [link]&lang=es [clip 1]
```

**Días de competencia · EN** (sin nombrar atletas; nombrar la competencia solo como contexto, nunca como si estuviera asociada al juego)

```
Weightlifting on today? Between sessions, you can try your own final: pick your attempts and go for the total. #weightlifting [link]
```

**Días de competencia · ES**

```
¿Hay halterofilia hoy? Entre sesión y sesión podés jugar tu propia final: elegí tus intentos y andá por el total. #halterofilia #weightlifting [link]&lang=es
```

**Pregunta para la comunidad · EN**

```
Lifters: when you plan a meet, do you open safe and push on the third, or open closer to your max? Trying to get the rival AI in my weightlifting game to think like real lifters. #weightlifting
```

**Pregunta para la comunidad · ES**

```
A los que compiten: ¿abren seguros y empujan en el tercero, o abren cerca de su máximo? Quiero que los rivales de mi juego de halterofilia piensen como pesistas de verdad. #halterofilia #weightlifting
```

---

## LIF-60 · Mensaje para coaches y boxes

Para mandar de a uno, por mensaje directo o mail, a coaches y boxes que el dueño conozca o que tengan contacto público. Sin
insistir si no responden. `utm_source=whatsapp` (o el canal que corresponda), `utm_content` = el club o box. Si es gente
de la red del dueño, usar `utm_source=amigos` (no cuenta para la tracción, `docs/DIFUSION.md` 1).

### Pedido al coach

**EN**

```
Hi [name]! I'm a hobbyist and I made a free browser game about weightlifting: a snatch and clean & jerk final with 3 attempts each, against two fictional rivals. One button; the game is mostly about choosing your weights. I thought your lifters might enjoy it between sessions. If you think it fits, would you mind sharing it with your group? Here's a message ready to forward. No pressure at all, and any feedback is welcome.
```

**ES**

```
¡Hola [nombre]! Hago juegos como hobby y armé un juego web gratis de halterofilia: una final de arranque y dos tiempos con 3 intentos de cada uno, contra dos rivales ficticios. Un solo botón; el juego pasa más que nada por elegir los kilos. Pensé que a tus alumnos les podía gustar entre entrenamientos. Si te parece que va, ¿lo podrías pasar a tu grupo? Te dejo abajo un mensaje listo para reenviar. Sin ningún compromiso, y cualquier comentario me sirve.
```

### Mensaje para reenviar al grupo de alumnos

**EN**

```
A free weightlifting game for your phone 🏋️ Play a snatch and clean & jerk final against two rivals: pick your attempts and play with one button. Who gets the best total?
https://liftinggame.pages.dev/?utm_source=whatsapp&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=CLUB
```

**ES**

```
Un juego gratis de halterofilia para el celular 🏋️ Jugás una final de arranque y dos tiempos contra dos rivales: elegís tus intentos y jugás con un solo botón. ¿Quién hace el mejor total?
https://liftinggame.pages.dev/?utm_source=whatsapp&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=CLUB&lang=es
```

Nota: «¿Quién hace el mejor total?» invita a comparar entre ellos, pero hoy no hay ranking: cada uno ve su propio
resultado. No sumar «ranking» ni «premio» al mensaje hasta que exista.

---

## Dudas para el dueño

1. **Muro en los textos.** Las piezas largas (Reddit, Facebook, itch.io, Newgrounds) dicen que el dos tiempos pide correo.
   ¿Lo dejamos así (más honesto, menos quejas en los comentarios) o lo sacamos de los posts cortos? Hoy no aparece en los
   textos de X, Discord, WhatsApp ni en los clips.
2. **Variante COMING SOON.** ¿Se cuenta el ranking global y el campeonato semanal antes de que salgan? Si no, no usar esas
   dos variantes.
3. **Nombre de las cuentas** (decisión 3 de `docs/DIFUSION.md` 6): los textos usan «Lifting Game».
4. **¿Reddit ya tuvo un primer post?** El de LIF-30 está escrito como actualización pero se entiende solo; si ya hubo un
   post en un subreddit, conviene esperar y no repetir en el mismo lugar en pocos días.
5. **Respuesta sobre el correo:** dice «solo para novedades si lo aceptás». Confirmar contra `web/privacidad.html` publicado
   antes de usarla.
