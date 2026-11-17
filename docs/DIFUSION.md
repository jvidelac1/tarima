# Difusión fuera de Reddit (LIF-54)

Plan para llevar gente al juego desde canales que no son Reddit, con links etiquetados para medir cada canal por separado
en PostHog. Es un plan: no se publicó nada ni se creó ninguna cuenta. Todo lo que dice «verificar» no se pudo confirmar
desde la web y hay que mirarlo en el lugar antes de publicar.

Investigado el 15 de noviembre de 2026. Las fuentes están al lado de cada dato y al final.

## 1. Links listos para copiar (LIF-55)

Convención:

- `utm_source`: el canal, siempre uno de los de la tabla (minúscula, sin espacios).
- `utm_medium`: el tipo de lugar: `social` (perfil o post público), `grupo` (grupo o comunidad con moderación), `chat`
  (WhatsApp, Discord), `portal` (sitio de juegos), `video` (link que acompaña un clip).
- `utm_campaign`: `lif54-2026-11` para todo lo de este mes. Si hay otra tanda, `lif54-2026-12`.
- `utm_content`: dónde exactamente va el link (`bio`, `post`, `respuesta`, el nombre corto del grupo o del clip). Cambiarlo
  en cada lugar es lo que permite saber qué grupo o qué clip trajo gente. La tabla trae un valor por defecto.

Reglas que aplica el juego (docs/MVP.md 6.1): los valores se pasan a minúscula; espacios y `+` se vuelven `_`; solo quedan
`a-z 0-9 _ . -`; hasta 60 caracteres. Un valor con `@` o con 7 dígitos seguidos se descarta entero (no poner correos,
teléfonos ni fechas sin guiones en un UTM). Lo que el dueño comparte con su propia gente sigue yendo con
`?utm_source=amigos` y queda fuera de la medición de tracción (docs/MVP.md 1).

| Canal | Ticket | Link |
|---|---|---|
| Reddit | (LIF-54, referencia) | `https://liftinggame.pages.dev/?utm_source=reddit&utm_medium=social&utm_campaign=lif54-2026-11&utm_content=post` |
| X | LIF-59 | `https://liftinggame.pages.dev/?utm_source=x&utm_medium=social&utm_campaign=lif54-2026-11&utm_content=respuesta` |
| Instagram | LIF-57 | `https://liftinggame.pages.dev/?utm_source=instagram&utm_medium=video&utm_campaign=lif54-2026-11&utm_content=bio` |
| TikTok | LIF-57 | `https://liftinggame.pages.dev/?utm_source=tiktok&utm_medium=video&utm_campaign=lif54-2026-11&utm_content=bio` |
| Facebook | LIF-56 | `https://liftinggame.pages.dev/?utm_source=facebook&utm_medium=grupo&utm_campaign=lif54-2026-11&utm_content=grupo` |
| WhatsApp | LIF-56 | `https://liftinggame.pages.dev/?utm_source=whatsapp&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=grupo` |
| Discord | LIF-56 | `https://liftinggame.pages.dev/?utm_source=discord&utm_medium=chat&utm_campaign=lif54-2026-11&utm_content=servidor` |
| itch.io | LIF-58 | `https://liftinggame.pages.dev/?utm_source=itchio&utm_medium=portal&utm_campaign=lif54-2026-11&utm_content=pagina` |
| Newgrounds | LIF-58 | `https://liftinggame.pages.dev/?utm_source=newgrounds&utm_medium=portal&utm_campaign=lif54-2026-11&utm_content=pagina` |

Para la versión en español se agrega `&lang=es` al final. Ejemplo con contenido propio de un grupo:
`https://liftinggame.pages.dev/?utm_source=facebook&utm_medium=grupo&utm_campaign=lif54-2026-11&utm_content=halterofilia_ar&lang=es`.

### Qué se ve en PostHog

- En cada evento: `fuente_trafico` (= `utm_source`), `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, y
  `referente` (solo el dominio). Sin UTM, `fuente_trafico` cae al click-id o al dominio del referente (`facebook`, `x`,
  `instagram`, `whatsapp`, `discord`…), así que un link pegado sin etiqueta igual se atribuye al canal, pero sin saber el
  grupo ni el clip.
- En la persona (solo anotados): `$initial_fuente_trafico` y `$initial_utm_*` de la primera carga en la que se anotó o
  volvió anotada.
- Por canal, el mismo embudo de docs/MVP.md 6.4, separado por `utm_source` y después por `utm_content`:
  `juego_abierto` → `final_inicio (n=1)` → `final_fin (n=1)` → `muro_visto` → `anotar_ok`. Lo que importa de cada canal no
  es cuánta gente abre el juego sino qué parte termina la primera final y se anota.
- Ojo con los números chicos: con pocas decenas de visitas por canal las diferencias de proporción no dicen nada. Antes de
  cortar o seguir un canal, juntar al menos las 300 personas que pide docs/MVP.md 1 en el total, y comparar canales recién
  cuando cada uno tenga del orden de 100 `juego_abierto`.

## 2. Comunidades: Facebook, WhatsApp y Discord (LIF-56)

### Discord

Verificados:

- **Discord oficial de r/weightlifting**, invitación `discord.gg/antbPKZhyN`. La invitación abre un servidor llamado
  «Olympic Weightlifting» ([discord.com/invite/antbPKZhyN](https://discord.com/invite/antbPKZhyN)). Varias copias públicas
  de la barra lateral de r/weightlifting la marcan como «Official Discord Channel»; no se pudo ver la barra en reddit.com
  (Reddit no deja leerla sin navegador), así que hay que confirmarla ahí. Es el servidor más específico de halterofilia
  que apareció.
- **Legacy Lifting Simulator**: servidor oficial de un juego de Roblox de levantar pesas, 5.159 miembros al 15/11
  ([discord.com/servers/legacy-lifting-simulator-1222569070302335110](https://discord.com/servers/legacy-lifting-simulator-1222569070302335110)).
  Público de juegos de pesas, no de halterofilia, y probablemente joven. Solo si tiene un canal de autopromoción; si no,
  no.
- Servidores de gimnasio en general (Iron Asylum, CONQUER, 10 Sets Of Failure) aparecen en el directorio de Discord, pero
  son de fuerza y musculación en general, no de halterofilia. Baja prioridad.

Reglas de autopromoción: las de cada servidor están en su canal de reglas y solo se ven al entrar. **Verificar antes de
publicar.** Lo habitual es un canal tipo `#self-promo` o `#share-your-stuff`; si no existe, preguntarle a un moderador por
mensaje directo antes de pegar el link.

Formato: un mensaje corto en el canal permitido, con una captura o un GIF de 5 a 10 segundos (el veredicto con las tres
luces, el podio) y una línea honesta: «Hice un juego web de halterofilia: una final de arranque y envión contra dos
rivales, se juega con una tecla. Busco opiniones de gente que levanta». Estar para responder en el hilo. Un servidor, una
vez; no repetir.

`utm_content`: `wl_oficial`, `legacy_lifting`.

### Facebook

No se pudieron verificar grupos concretos: Facebook no deja ver grupos sin sesión y los buscadores no los indexan
(búsquedas con `site:facebook.com/groups` sin resultados). Lo que sí está verificado es la página del Mundial de la IWF,
`@IWFWorldWeightliftingChampionships` (crédito de foto en
[legit.ng](https://www.legit.ng/sports/athletics/1734063-where-worlds-strongest-athletes-heading-weightlifting-world-championship-2026/)),
pero es una página, no un grupo, y no es para promocionar.

Cómo encontrarlos (lo hace el dueño con su cuenta, sin publicar todavía):

1. Buscar en Facebook «olympic weightlifting», «weightlifting», «halterofilia», «levantamiento olímpico», «haltérophilie»,
   filtro Grupos.
2. Quedarse con grupos públicos o privados con actividad en la última semana y reglas escritas. Anotar en
   `~/tarima-datos/` nombre, tamaño, idioma y si la regla permite «promoción», «links» o «apps».
3. Si la regla prohíbe autopromoción o no dice nada, escribirle a un admin antes. Muchos grupos tienen un día o un hilo de
   promoción.

Formato: un video corto subido directo a Facebook (el link va en el texto o en el primer comentario, según la regla del
grupo) con la misma frase honesta de arriba, en el idioma del grupo. Un grupo por día, como mucho, para poder responder.

`utm_content`: el nombre corto del grupo (`halterofilia_ar`, `oly_lifting_uk`…).

### WhatsApp

No hay grupos públicos de halterofilia que se puedan verificar desde la web: son de clubes y equipos, y se entra por
invitación. El canal real es de persona a persona:

- Clubes, entrenadores y compañeros del dueño: eso es red del dueño y va con `utm_source=amigos` (no cuenta para la
  tracción).
- Que un entrenador o un club lo pase a su grupo: ahí sí va el link de `whatsapp` de la tabla, con `utm_content` = el club.
  Pedirlo de a uno, con un mensaje listo para reenviar (una línea + link) y sin insistir.

Sin promesas de premios ni de novedades que no existan (CONTEXTO.md: no inventar contenido de cara al jugador).

### Qué medir en LIF-56

`juego_abierto`, `final_fin (n=1)` y `anotar_ok` por `utm_source` y `utm_content`. Un grupo que trae visitas que no terminan
la primera final es público equivocado; uno que trae pocas pero que terminan y se anotan vale más.

## 3. Clips cortos en Instagram y TikTok para republicar (LIF-57)

Idea: cuentas de halterofilia republican clips que les sirven; un clip del juego bien elegido puede circular sin que el
dueño tenga seguidores. Nada de esto está medido todavía.

Cuentas reales que aparecen como creadores de halterofilia en una nota de Weightlifting House del 19/3/2026
([Weightlifting Channels to Watch](https://row.weightliftinghouse.com/blogs/news/weightlifting-content-creators)):
@SomeSeriousWeight (noticias de la industria y atletas; YouTube, Instagram, Reddit), @VintageLifts y @BougieWeightlifting
(historia, Instagram), @SleepyLifts y @AdrenalineFederation (YouTube). La cuenta de Instagram de Weightlifting House es
`@weightlifting_house` (no `@weightliftinghouse`). No se encontró una lista verificada de cuentas de memes o «repost» de
halterofilia: hay que armarla mirando quién republica clips de competencia en Instagram y TikTok (verificar que publiquen
contenido de terceros y cómo lo acreditan).

Cómo:

1. Cuenta propia del juego en Instagram y TikTok (la crea el dueño). Link en la bio con el UTM de la tabla. En Instagram
   los posts no tienen link clicable: el link va en la bio y en historias con el sticker de link. En TikTok, verificar en
   la cuenta si el link en la bio está habilitado (depende del tipo de cuenta).
2. Clips verticales de 10 a 20 segundos, sin texto encima que dependa del idioma, que se entiendan sin sonido. Candidatos
   que ya existen en el juego: un tercer intento decisivo del rival seguido del propio, el veredicto de tres luces, la caída
   con la barrita que falló, el podio. Personajes ficticios: nada de atletas, marcas ni competencias reales en el clip.
3. Mandarles el clip por mensaje directo a 5 a 10 cuentas, con permiso explícito para republicar y el link con
   `utm_content` = la cuenta (`ig_vintagelifts`). Mejor el archivo sin marca de agua que el link al post.
4. En los posts propios, hashtags del deporte (#weightlifting, #olympicweightlifting, #snatch, #cleanandjerk,
   #halterofilia), sin llenar de etiquetas.

Qué medir: visitas y `final_fin (n=1)` por `utm_content` (cada cuenta que republica tiene el suyo). Las vistas del clip
están en la app; lo que importa acá es si las vistas se convierten en partidas. Un clip que se ve mucho y no trae
partidas no se repite.

## 4. X: #weightlifting y competencias en vivo (LIF-59)

Calendario cercano (las fechas son de las fuentes, verificar la transmisión de cada uno):

| Competencia | Fechas | Fuente |
|---|---|---|
| Mundial IWF 2026, Ningbo | 27/10 al 8/11/2026 (ya terminó) | [IWF](https://iwf.sport/?p=39337), [legit.ng](https://www.legit.ng/sports/athletics/1734063-where-worlds-strongest-athletes-heading-weightlifting-world-championship-2026/) |
| USA Weightlifting, Finals | 3 al 6/12/2026, Pleasanton (California) | [USA Weightlifting](https://www.usaweightlifting.org/news/2025/august/01/2026-usa-weightlifting-national-event-schedule) |
| English Championships (British Weightlifting) | 4 al 6/12/2026, NEC Birmingham | [British Weightlifting](https://britishweightlifting.org/article/bwl-reveals-2026-competition-calendar) |
| 1.º clasificatorio IWF para LA28, Doha | 7 al 16/12/2026 | [reglamento](https://ctwa.org.tw/uploads/1st-IWF-Qualifier-LA28_Doha-QAT_Regulations.pdf) |
| Europeo sénior 2027, Antalya | 11 al 18/4/2027 | [EWF](https://ewf.sport/?p=28240) |

No se encontró un hashtag oficial de la IWF para X en estas búsquedas. Verificar en la cuenta oficial de la IWF y de cada
federación qué etiqueta usan antes de cada competencia; #weightlifting es la genérica.

Formato:

- **Respuestas en vivo**, no posts sueltos: durante el clasificatorio de Doha, responder en hilos de la transmisión o de
  resultados con algo que aporte a la conversación (la decisión de kilos, el tercer intento) y solo a veces el clip del
  juego con el link. No responder solo con el link: una respuesta que es solo un link a un desconocido no aporta y se lee
  como spam.
- **Post propio fijado** con un clip y el link, para que quien entra al perfil lo encuentre.
- Personajes ficticios: el juego no menciona atletas reales; las respuestas pueden hablar de la competencia, el clip no.

Reglas: en X no hay reglas por comunidad como en Reddit; lo que aplica es la política de spam y manipulación de la
plataforma (help.x.com, «platform manipulation and spam»). No se pudo leer desde acá: verificarla antes de empezar,
sobre todo lo que diga de respuestas automáticas o repetidas con links.

Qué medir: `utm_source=x` con `utm_content` por competencia (`doha_lif`, `usaw_finals`). Visitas en las horas de la
competencia frente a las de días sin competencia.

## 5. itch.io y Newgrounds (LIF-58)

### itch.io

Requisitos verificados ([HTML5 en itch.io](https://itch.io/docs/creators/html5)):

- ZIP con `index.html` en la raíz, o un solo `.html`. Hasta 1.000 archivos, 500 MB descomprimido, 200 MB por archivo,
  240 caracteres de ruta. Rutas relativas (las absolutas que empiezan con `/` fallan).
- Pedidos a otros dominios solo por HTTPS.
- Opciones: incrustado con tamaño fijo y botón de pantalla completa, o «click to launch in fullscreen». Si se marca
  «mobile friendly», en el teléfono siempre abre en pantalla completa.
- Los juegos HTML solo aceptan donaciones (no se puede cobrar el acceso).

Pautas de calidad ([quality guidelines](https://itch.io/docs/creators/quality-guidelines)): se recomiendan capturas
también para juegos en el navegador; la portada es lo primero que se ve en las listas; las páginas que no cumplen salen
del índice de descubrimiento (siguen visibles por link). Desaconseja páginas que solo llevan a otra plataforma sin archivos
y pide no usar un registro «for the sake of collecting personal information about a player».

Dos caminos:

1. **Página con un `index.html` que incrusta el juego publicado** (un `<iframe>` a
   `https://liftinggame.pages.dev/?utm_source=itchio&utm_medium=portal&utm_campaign=lif54-2026-11&utm_content=embed`).
   Un empleado de itch.io respondió en 2016 que no veía nada en contra en los términos
   ([foro de itch.io](https://itch.io/t/28193/html-game-question-can-i-have-an-iframe-to-a-game-im-hosting-elsewhere)),
   pero es una respuesta vieja de foro, no una regla. Es lo único que funciona sin tocar código, porque el juego llama a
   `/api` y `/qx` en su propio dominio.
2. **Subir los archivos del juego** (hoy `web/` pesa 22 MB en 106 archivos: entra holgado). Hoy no funcionaría: `/api`
   y `/qx` son rutas del mismo sitio y en itch.io el juego se sirve desde otro dominio. Haría falta que el juego apunte al
   servidor con su dirección completa y que el Worker acepte ese origen (CORS). Es trabajo de otro ticket.

Riesgos del camino 1, para probar antes de publicar (no se probaron):

- Adentro de un iframe de otro sitio, la cookie `tdv` (`SameSite=Strict`) no viaja y Safari separa el almacenamiento: el
  conteo de partidas gratis se apoya en la IP y en lo que quede en el almacenamiento de esa página. Probar que el muro y
  el anotarse funcionen en Chrome, Safari y en el teléfono.
- El muro pide el correo para seguir jugando. Con la pauta de itch.io sobre registros para juntar datos personales, puede
  sacarla del índice de descubrimiento. **Decisión del dueño** (abajo).
- Sin el UTM en la dirección del iframe, `referente` sería el dominio de itch.io (`otro_sitio`). Con el UTM se atribuye
  bien.

Qué subir: portada, 3 a 5 capturas, descripción corta en inglés, etiquetas pocas y ciertas (sports, simulation, 3D,
one-button), y la declaración de IA que pide itch.io si corresponde.

### Newgrounds

Verificado en la wiki de Newgrounds (vía buscador; la página no se deja leer directo,
[games and movies](https://www.newgrounds.com/wiki/help-information/content-submission/games-and-movies)):

- Acepta juegos HTML5 en ZIP con `index.html` en la raíz; se cargan en un iframe en la página del juego.
- Los juegos se publican enseguida y pasan un período de juicio («Under Judgment») en el que la gente vota; si no llegan
  al puntaje, se borran («blam»). Aunque pasen, los moderadores los sacan si rompen las reglas del formulario.
- Las reglas de qué no se puede subir están en los «Terms of Use» de juegos y en el formulario de subida: **no se pudieron
  leer** (403 desde acá). Verificar ahí si se permite un juego alojado en otro sitio dentro de un iframe, si se permite
  pedir correo y si hay límite de tamaño (en foros se repite «250 MB», sin fuente oficial).

Plan: mismo `index.html` con iframe que en itch.io, con el link de `newgrounds` de la tabla y `utm_content=embed`, si las
reglas lo permiten. Si no, Newgrounds queda para cuando exista el camino 2. El público de Newgrounds vota y comenta
directo; el «blam» es un riesgo real para un juego que corta con un muro a los pocos minutos.

Qué medir en LIF-58: `utm_source=itchio` y `newgrounds` con el mismo embudo, más las vistas y jugadas que muestra cada
portal en su panel (son de ellos, no de PostHog, y cuentan distinto).

## 6. Decisiones del dueño

1. **Muro en portales.** ¿El juego incrustado en itch.io y Newgrounds pide el correo igual que en el sitio? Si sí, riesgo
   de salir del descubrimiento de itch.io o de un «blam» en Newgrounds. Si no, hace falta una variante sin muro (otro
   ticket, con bandera).
2. **Camino 1 o 2 para portales**: iframe ya (sin código) o subir los archivos (requiere CORS y direcciones completas).
3. **Cuentas propias** de Instagram, TikTok, X y portales: las crea el dueño. ¿Con qué nombre? (El juego se publica como
   Lifting Game; el repo se llama Tarima.)
4. **Clips**: elegir 3 momentos y aprobar que se graben (en Actions, no en la Mac).
5. **Quién publica y responde**: cada canal pide estar presente en los comentarios las primeras horas.

## Fuentes

- itch.io, HTML5: https://itch.io/docs/creators/html5
- itch.io, quality guidelines: https://itch.io/docs/creators/quality-guidelines
- itch.io, FAQ (límites de páginas por cuenta): https://itch.io/docs/creators/faq
- itch.io, foro, iframe a un juego alojado en otro lado (2016): https://itch.io/t/28193/html-game-question-can-i-have-an-iframe-to-a-game-im-hosting-elsewhere
- Newgrounds, wiki, games and movies: https://www.newgrounds.com/wiki/help-information/content-submission/games-and-movies
- Discord, invitación de r/weightlifting: https://discord.com/invite/antbPKZhyN
- Discord, Legacy Lifting Simulator: https://discord.com/servers/legacy-lifting-simulator-1222569070302335110
- Weightlifting House, creadores de contenido (19/3/2026): https://row.weightliftinghouse.com/blogs/news/weightlifting-content-creators
- IWF, Ningbo sede del Mundial 2026: https://iwf.sport/?p=39337
- legit.ng, Mundial 2026: https://www.legit.ng/sports/athletics/1734063-where-worlds-strongest-athletes-heading-weightlifting-world-championship-2026/
- USA Weightlifting, calendario 2026: https://www.usaweightlifting.org/news/2025/august/01/2026-usa-weightlifting-national-event-schedule
- British Weightlifting, calendario 2026: https://britishweightlifting.org/article/bwl-reveals-2026-competition-calendar
- Reglamento del 1.º clasificatorio para LA28 (Doha): https://ctwa.org.tw/uploads/1st-IWF-Qualifier-LA28_Doha-QAT_Regulations.pdf
- EWF, Europeo 2027 en Antalya: https://ewf.sport/?p=28240
