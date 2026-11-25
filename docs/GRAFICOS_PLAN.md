# Plan de gráficos (24 de noviembre de 2026)

Pedido de Juan: «todo lo que sea gráficos quiero que sea con Fable 5.2 … lo más real posible, humanos semi-reales,
movimientos, detalles, T pose, A pose, cambiar de skins, todo lo que eso conlleva». Este documento es el diagnóstico, el
camino de producción que recomiendo y las historias, cada una con una forma de medir si quedó.

Anula la decisión del 22-nov (LIF-64: el arte de los pesistas lo hacía Gemini). Lo gráfico pasa a esta línea de trabajo.
No toca el núcleo del juego (`web/js/sim/`): eso lo cambia la sesión de dificultad (`docs/PLAN_GAMEPLAY.md`).

## 1. Cómo están hechos hoy los pesistas

| Parte | Cómo es hoy | Dónde |
|---|---|---|
| Cuerpo | Humano de MakeHuman (MPFB, datos CC0) armado por script en Blender desde una ficha: género, categoría, estatura, masa, proporciones, cara. Encima, un relieve muscular por reglas («físico anatómico») | `blender/plantel.py`, `body.py`, `geo.py` |
| Malla | 108 a 137 mil triángulos por pesista (cuerpo 90 mil, pelo 2,5 a 31 mil, zapatillas 12 mil, cinturón 1 mil). Un segundo nivel simplificado se arma al cargar para los planos lejanos | `tools/presupuesto_modelos.mjs` (nuevo) |
| Esqueleto | 52 huesos con nombres Mixamo (incluye los 15 de cada mano) más `Bar`. Uno solo para todos | `HANDOFF.md`, «Contratos» |
| Texturas | Color, relieve y rugosidad/oclusión del cuerpo a 2048 px (1024 en el teléfono), pintadas por código (`tex.py`), no fotografiadas. Máscaras por texel: piel, tela, pelo, rodilleras, medias, vendas | `blender/tex.py`, `web/models/*_mask*.webp` |
| Materiales | Sombreadores propios en el visor: piel (dispersión barata, sudor en parches), tela (trama, arrugas, brillo satinado), pelo (capas o casco), ojos | `web/js/athlete.js` |
| Movimiento | No hay animación «grabada»: cada fase es una **pose resuelta por reglas** en Blender (manos en la barra, pies en el piso, barra que no atraviesa el cuerpo, `check()` con 0 cuadros malos). Arranque (11 fases), cargada (13) y tres enviones. 10 muestras por fase | `blender/poses.py`, `web/data/poses.json` |
| Deformación | 4 correctivos (brazo arriba y rodilla, por lado) que el visor prende según el ángulo | `geo.py`, `athlete.js` |
| Caídas y festejos | Por código en three.js: barra con gravedad y rebote, brazos que acompañan, pies plantados con IK de dos huesos, gestos | `web/js/game/caida.js`, `stage.js` |
| «Skins» | Parciales: tono de piel, color de pelo y tinte o color plano de la tela por parámetro (`Athlete.setAspecto`); el jugador puede elegir otro **modelo** para su plaza | `athlete.js`, `roster.js` |
| Entrenamiento | Solo una pantalla con la barrita: no se ve al pesista entrenar | `web/js/game/ui/entreno.js` |
| Publicación | Los modelos se construyen en GitHub Actions (`pesistas.yml`, 15 a 25 min cada uno), se comprimen (meshopt, WebP) y se suben al repo. La Mac de Juan no corre Blender ni navegador | `docs/PLANTEL.md`, `docs/VISOR.md` |

Peso medido hoy (`node tools/presupuesto_modelos.mjs`): 5,0 a 5,9 MB por pesista en computadora y 2,8 a 3,3 MB en el
teléfono; máscaras 0,2 MB. Los tres de una final suman unos 9 MB en el teléfono.

### Qué pruebas los cubren

- Sin navegador: `caida_test` (escenas del final), `perf_test` (gobernador de calidad), `presupuesto_modelos` (nuevo).
- Con navegador, en Actions: `check_escenas` (holguras de la barra contra el cuerpo al caer), `check_game`,
  `check_telefono`, `check_pov`, `check_viewer*` (visor), `banco.mjs --fotos` (fotos por calidad: `graficos.yml`).
- En Blender: `check()` de `poses.py` (superposiciones cuadro a cuadro) y las hojas `sheet_*`.
- Lo que **no** hay: una nota objetiva de «se ve real». Las rondas de «director de arte a ciegas» dieron 5 a 6 sobre 10
  para el pesista (cara 4,5; pelo 4; manos 4; anatomía 5; piel 6; ropa 6,5). La meta de Juan era 7.

## 2. Diagnóstico: por qué todavía no se leen como personas

Mirando las fotos del juego (`~/tarima-datos/ver_visual/`) contra la imagen de referencia de Juan:

1. **Proporciones de muñeco.** Cabeza grande (el cuerpo mide 7,5 cabezas; un pesista adulto se lee mejor con 7,7 a 8),
   brazos que cuelgan abiertos como en la pose de armado, hombros que nacen del cuello sin trapecio, cintura y cadera
   que no cambian entre biotipos. La base de MakeHuman con `muscle` alto da un culturista genérico.
2. **Cara.** Es la parte peor puntuada. Ojos chicos y fijos, la misma boca en todos, cejas y barba pintadas con borde de
   serrucho. No hay expresión: el pesista hace fuerza con cara de foto carnet.
3. **Pelo.** Casco. Sin mechones ni silueta.
4. **Piel.** Pareja y pintada por código: le falta lo que da una foto (poro, venas, cambio de color en nudillos, codos y
   rodillas). Los difusos CC0 de MakeHuman nunca se integraron.
5. **Deformación.** Con 4 correctivos, el hombro, el codo y la cadera se pliegan como goma en la sentadilla profunda y
   con los brazos arriba; el glúteo y el muslo no se aplastan entre sí.
6. **Manos.** Dedos en abanico; el agarre no cierra el pulgar bajo los dedos (hook).
7. **Ropa.** La malla es piel pintada: no tiene espesor ni costura; las rodilleras y las vendas son color.
8. **Movimiento.** Las fases están bien resueltas una por una, pero entre fase y fase hay interpolación: falta lo que da
   la inercia (la barra que flexiona ya está; el cuerpo no «rebota» en la recepción, no respira antes de tirar, no
   acomoda las manos). Y **las caídas no se ven venir**: el pesista queda quieto con la barra arriba y de golpe la
   suelta (`caida.js`: la pose del fallo se sostiene 0,5 s con la barra ya cayendo).
9. **Entrenamiento.** No existe como escena.

Lo que sí está bien y no hay que rehacer: la sala, la tarima, la barra y los discos, la luz, el esqueleto único, el
sistema de poses por reglas con su chequeo, el armado por ficha y la compresión.

## 3. ¿Hay algo mejor que Blender? ¿Y «Saltline lo hicieron sin nada»?

**Lo de Saltline.** Lo que se aprendió de ahí ya está en el juego: texturas generadas al cargar, materiales escritos
como funciones por píxel, reflejos, partículas, cámara con «trauma» (`ambiente.js`, `materiales.js`, `look.js`). Sirve
muy bien para **cosas duras y repetitivas**: madera, goma, metal, luces, público lejano. Por eso la sala ya está en buen
nivel sin un solo archivo de arte.

No sirve igual para **una persona en primer plano**. Un cuerpo humano no es una fórmula: son miles de formas que el ojo
conoce de memoria. Acá ya se probó hacer el pesista solo con código y se descartó (`HANDOFF.md`, «Decisiones»; las
pruebas están en `~/tarima-datos/ver_visual/cuerpo_codigo/`): sale un maniquí. Hacer «sin nada» un humano creíble es
más trabajo que usar una herramienta, no menos.

**Blender.** No lo reemplazaría, pero lo usaría para menos cosas. Comparación honesta:

| Camino | A favor | En contra | Veredicto |
|---|---|---|---|
| **Blender por script** (lo de hoy) | Gratis, sin cuentas, corre en Actions, todo queda en el repo y se puede repetir; ya está hecho y probado | Cada vuelta tarda 20 min; no se mira en vivo | **Se queda** para cuerpo, esqueleto, pesos, texturas y poses base |
| **Todo por código en three.js** («como Saltline») | Vuelta de segundos, sin archivos | Para humanos da maniquíes (ya probado) | **Solo** para lo que ya hace bien: sala, público, materiales, y capas de movimiento encima de las poses |
| **Movimiento por código + IK en three.js** | Reacciona al juego (cada caída distinta, el fallo que se ve venir, respirar, temblar); no pesa en la descarga; vuelta rápida y se prueba sin navegador | No inventa una técnica de levantamiento creíble desde cero | **Sí**, encima de las poses de Blender: caídas, avisos del fallo, gestos, entrenamiento |
| **Captura de movimiento desde video** | Es la única fuente de movimiento humano de verdad (peso, ritmo, pequeños ajustes) | Hay que **bajar un modelo** de estimación de pose (necesita tu permiso), filmar o conseguir video con licencia, y limpiar el resultado (los pies patinan, la barra no coincide con las manos). No se puede copiar a un atleta real reconocible | **Sí, como referencia**: se usa para medir tiempos y ángulos y corregir las reglas, no se pega cruda |
| **Generadores de humanos comerciales** (Character Creator, MetaHuman, Daz) | Caras y piel de foto | Pagos o con cuenta, licencias que no dejan publicar la malla en una web abierta, 100 MB por personaje | **No**: choca con «sin compras ni cuentas» y con el teléfono |
| **Modelos por IA** (texto o imagen a 3D) | Rápido | Mallas sin esqueleto usable, manos y caras rotas, licencias dudosas | **No** para el pesista. Quizás para utilería del gimnasio, con tu permiso |
| **Escaneos y texturas CC0** (pieles de MakeHuman, telas y HDRI de Poly Haven / ambientCG) | Dan de una vez el detalle de foto que le falta a la piel y a la tela; licencia libre | Hay que bajarlos (te pido permiso con la lista) y pesan si no se comprimen | **Sí**, es el salto más barato en «se ve real» |

**Mi recomendación: una mezcla, cada cosa donde rinde.**

1. **Blender por script** sigue haciendo el cuerpo, el esqueleto, las texturas y las poses base, ahora partiendo de
   una **pose de referencia** (T y A) que se exporta y se puede revisar.
2. **Texturas de foto CC0** para piel, tela y cuero, con tu permiso de descarga (lista en la sección 6).
3. **three.js por código** para todo lo que tiene que reaccionar al juego: caídas, el aviso del fallo, gestos,
   respiración, entrenamiento, skins.
4. **Video** como regla de medir del movimiento (tiempos, ángulos, orden de los gestos), no como animación pegada.

## 4. Presupuesto (lo que no se puede romper)

| Qué | Tope | Hoy | Cómo se mide |
|---|---|---|---|
| Triángulos por pesista (nivel completo) | 190 mil | 108 a 137 mil | `presupuesto_modelos` |
| Triángulos del cuerpo | 100 mil | 90 mil | ídem |
| Descarga por pesista en el teléfono | 3,6 MB | 2,8 a 3,3 MB | ídem |
| Descarga por pesista en computadora | 6,4 MB | 5,0 a 5,9 MB | ídem |
| Textura más grande en el teléfono / computadora | 1024 / 4096 px | 1024 / 2048 | ídem |
| Huesos y correctivos | 80 / 6 por malla | 53 / 4 | ídem |
| Un skin nuevo | 0 MB de modelo: solo parámetros, o texturas de hasta 150 KB | — | ídem (cuando haya) |
| Costo de «Móvil» y «Baja» por cuadro | no más de +10 % contra `main` | — | `graficos.yml -f comparar=true` (A, B, A, B en la misma máquina) |
| Programas de sombreado | un skin no compila nada nuevo (son parámetros) | — | `check_game` (cuenta de programas) |
| Pruebas | `pruebas.yml`, `telefono.yml` y `graficos.yml` en verde | verde en `main` | Actions |

El tiempo por cuadro **en un teléfono real** no se puede medir desde Actions (dibuja por software). Lo que sí se
compara es el costo relativo contra `main` en la misma máquina, y queda pendiente una medición en tu teléfono con
`juego.html?banco=1` (te paso el paso a paso cuando haya algo que valga medir).

## 5. Historias

Cada una es chica, tiene una prueba y, si cambia lo que se ve, deja capturas de antes y después en `docs/img/graficos/`.
Estado: **hecha** (en esta rama), **en curso**, **pendiente** o **frenada** (espera una decisión o un permiso tuyo).

### Base y medición

**G0 · Presupuesto de modelos como prueba.** `tools/presupuesto_modelos.mjs`: triángulos, huesos, texturas y MB de cada
pesista, con topes; corre sin navegador y en `pruebas.yml`.
*Aceptación:* falla si un modelo pasa un tope de la sección 4; los seis de hoy pasan.

**G1 · Poses de referencia T y A.** El visor y el juego pueden poner a cualquier pesista en pose T (brazos
horizontales) y en pose A (brazos a 45°), con las piernas rectas y las palmas hacia abajo, calculadas sobre el esqueleto
(no dependen de cómo vino armado el modelo). Sirven para revisar proporciones, pesos y skins siempre desde la misma
pose, y son el punto de partida de cualquier rig o captura de movimiento que venga después.
`index.html?who=<id>&ref=T|A`, `Athlete.poseReferencia('T'|'A')`.
*Aceptación:* prueba sin navegador sobre los seis GLB: en T los brazos quedan a menos de 2° de la horizontal y en A a
45° ± 2°; simetría izquierda/derecha menor a 1 cm; pies a la altura del piso. Lámina de frente, costado y espalda de
cada pesista en T y en A (`graficos.yml`).

**G2 · Lámina de control del pesista.** Una sola imagen por pesista con: T de frente y de espalda, A de tres cuartos,
cara, manos en la barra, sentadilla profunda y brazos arriba. Es la «foto carnet» contra la que se compara cada cambio.
*Aceptación:* `banco.mjs --lamina` la genera en Actions; queda en `docs/img/graficos/` la de `main` como línea de base.

### Caídas y fallos que se ven venir (con la épica B del plan de gameplay)

**G3 · El fallo se anuncia en el cuerpo.** Antes de soltar, el pesista **pierde** la barra: según la causa, la barra se
va atrás y los brazos la siguen, o se va adelante y él la corre en puntas de pie, o los codos ceden y la barra baja
sobre la cabeza, o se hunde sentado. Nunca queda quieto con la barra arriba y después la tira.
*Aceptación (sin navegador, `caida_test`):* en toda caída desde arriba, la barra ya se movió más de 4 cm y el cuerpo ya
cambió antes de soltarla; el tiempo «firme» (barra y cuerpo quietos) antes de soltar es menor a 200 ms; el movimiento
previo va hacia el mismo lado al que después cae la barra. `check_escenas` sigue en 0 `BAD` (la barra no atraviesa el
cuerpo). Hoja de cuadros de antes y después por causa.

*Hecho en esta rama* para las barras perdidas **desde arriba** (arranque y envión: barra atrás, adelante, la pierde en
el fondo, ceden los codos, temblor): `PIERDE` en `caida.js`. La barra se le va 11 a 16 cm en 0,37 a 0,48 s, con las manos
en ella; a los 90 a 125 ms ya se nota. *Falta (G3b):* lo mismo para la cargada perdida sentado (los codos caen y la barra
rueda de los hombros) y para la barra devuelta de los hombros; ahí las manos están en el rack y hay que resolverlas con
otra regla, que quiero mirar cuadro a cuadro antes de darla por buena.

**G4 · Aviso previo mientras todavía se puede salvar.** Cuando al pesista le queda poca energía para el tramo que
viene, se nota antes de que el núcleo decida: tiembla más, la barra se inclina, la cara aprieta.
*Depende del núcleo:* necesito un dato de solo lectura (ver sección 7). *Aceptación:* con el dato en 0 no cambia nada
(las capturas de las pruebas de hoy quedan iguales); con el dato en 1, la barra se mueve entre 1 y 3 cm y el temblor es
visible en la hoja de cuadros.

**G5 · Bajar la barra después de las luces.** Ya existe la bajada acompañada (`GUIA`); falta que se lea como «válido»:
primero las luces y el cartel, después la baja. *Aceptación:* en la hoja de cuadros de un válido, la barra no baja de
los hombros antes de que aparezcan las luces. (Tiempos del veredicto: coordinar con gameplay, B4.)

### Skins

**G6 · Skin como dato.** Un skin es una lista de parámetros sobre un modelo: tono de piel, pelo, color de malla,
paneles y vivo, rodilleras, medias, vendas, zapatillas (capellada, suela, tira, cordón) y cinturón. Sin modelos ni
texturas nuevas: usa las máscaras que ya se bajan. Catálogo en `web/data/skins.json`, `Athlete.setSkin()`.
*Aceptación:* cambiar de skin no baja archivos ni compila sombreadores; prueba sin navegador que valida el catálogo
(colores válidos, contraste mínimo entre malla y piel, ningún skin igual a otro); fotos de 4 skins sobre el mismo
pesista. En el juego queda detrás de `?skins=1` hasta que apruebes nombres y colores (no invento contenido de cara al
jugador sin tu OK).

**G7 · Skins con dibujo.** Diseños de malla por reglas (bandas, paneles, degradé, número y código) pintados en el
sombreador con las coordenadas del cuerpo, más el desgaste (magnesio). *Aceptación:* 6 diseños; costo de «Móvil» dentro
del +10 %; el código del país se sigue leyendo en el pecho.

**G8 · Cuerpos por categoría (LIF-67).** Hoy la categoría de peso no cambia el cuerpo. Dos correctivos nuevos («más
liviano», «más pesado») por pesista, hechos en Blender desde la misma ficha. *Aceptación:* 71 kg y 94 kg del mismo
pesista se distinguen en la lámina; +0,4 MB como máximo por modelo.

### Humanos semi-reales (Blender, en Actions)

**G9 · Proporciones y postura.** Reglas de `plantel.cfg()`: 7,7 a 8 cabezas, trapecio y cuello que conectan, brazos que
cuelgan cerca del cuerpo, cintura y cadera por biotipo; pose de armado en A real. *Aceptación:* medidas en `lineas.txt`
dentro de una tabla de rangos de pesistas (fuente: tablas antropométricas publicadas, anotadas en el doc); lámina G2
de antes y después; 0 `BAD` en `check()`.

**G10 · Piel, tela y cuero de foto.** Texturas CC0 mezcladas con las pintadas por código. **Frenada: necesita tu permiso
de descarga** (sección 6). *Aceptación:* lámina G2 de cara y antebrazo de cerca; peso dentro del presupuesto.

**G11 · Cara y expresión.** Ojos más grandes y vivos (parpadeo, mirada a la barra), 4 gestos por correctivo (apretar,
soplar, festejo, bronca), boca y nariz distintas por pesista, cejas y barba con borde de pelo. *Aceptación:* +2
correctivos por encima del tope actual (sube a 8, se actualiza el presupuesto); nota de cara ≥ 6 en una ronda a ciegas
con la misma escala de las anteriores.

**G12 · Pelo con mechones.** Tarjetas de pelo con alfa en vez de casco, 3 peinados. *Aceptación:* pelo ≤ 12 mil
triángulos; sin halo gris a contraluz (el defecto que ya se arregló una vez).

**G13 · Deformación.** Huesos auxiliares `aux_` (ya permitidos en `AGENTS.md`) para hombro, axila, codo, glúteo y
rodilla, movidos por cálculo; correctivo de sentadilla profunda. *Aceptación:* en la lámina, la sentadilla y los brazos
arriba no muestran pliegues de goma; volumen del muslo en sentadilla dentro de ±8 % del de pie (medido sobre la malla).

**G14 · Manos y agarre.** Hook de verdad (pulgar bajo índice y medio), muñeca que no se quiebra en el rack, dedos que se
abren al soltar. *Aceptación:* holgura dedo-barra menor a 4 mm en `check()`; primer plano de la mano antes y después.

### Movimiento

**G15 · Vida entre fases.** Capas por código sobre las poses: respiración y acomodo antes de tirar, rebote en la
recepción, cabeza que sigue la barra, pies que se reacomodan con IK. *Aceptación:* los pies no patinan más de 5 mm
mientras están apoyados (medido en `check_pov`, que ya mide el patinaje); ningún cuadro con la barra separada de las
manos más de 5 mm.

**G16 · Arranque y dos tiempos contra video.** Medir tiempos y ángulos en video de referencia y corregir las reglas de
`poses.py`. **Frenada: necesita permiso** para bajar un estimador de pose y definir qué video se usa (sección 6).
*Aceptación:* tabla fase por fase (ángulo de rodilla, cadera y tronco, y tiempo) con la diferencia contra la referencia
menor a 8° y 60 ms.

**G17 · Entrenamiento en el gimnasio (D1 del plan de gameplay).** Escena nueva hecha por código (jaula, plataforma,
discos, espejo, luz de galpón) y tres ejercicios armados con las poses que ya existen: **tirón** (de la salida a la
triple extensión y vuelve), **sentadilla** (de la recepción de la cargada a de pie, repetida) y **técnica** (el
levantamiento entero con barra liviana). Las pasadas de la barrita mueven la repetición: verde, limpia; rojo, se frena
o se le va. *Aceptación:* prueba sin navegador de los ciclos (la barra nunca atraviesa el piso, las manos no la
sueltan, vuelve a la pose de partida); costo de la escena menor o igual al de la sala en «Móvil»; fotos.
*Cómo lo haría (sin tocar el núcleo):* `ui/entreno.js` avisa qué ejercicio se eligió y la zona de cada pasada
(`alElegir`, `alToque`); `main.js` pone al pesista del jugador en la escena y mueve la repetición con
`escena.posar()` sobre las fases del clip; el panel de la barrita pasa a un costado (acostado) o abajo (parado) para
que el pesista se vea. Eso cambia la disposición de la pantalla en el teléfono, así que va con `check_telefono` y con
tu visto bueno del boceto antes de construir el gimnasio.

## 6. Lo que necesito que me autorices (no bajé nada)

| Qué | Fuente | Licencia | Tamaño | Para qué |
|---|---|---|---|---|
| Pieles de MakeHuman («makehuman system assets», difusos de piel joven y madura, varón y mujer) | github.com/makehumancommunity | CC0 | 280 MB el paquete; se usan 4 a 6 imágenes (unos 20 MB) y al juego llegan mezcladas dentro de la textura que ya existe | G10: poro y color de foto |
| Tela de punto, cuero y neoprene (color, relieve, rugosidad), 3 materiales a 1K | polyhaven.com o ambientcg.com | CC0 | unos 15 MB en total; al juego, 3 mosaicos de 256 px (menos de 150 KB) | G10: malla, cinturón, rodilleras |
| Un HDRI de interior a 1K | polyhaven.com | CC0 | 1,5 MB; al juego, 100 KB | Reflejos más creíbles en piel sudada y metal |
| Estimador de pose humana desde video (MediaPipe Pose o similar) | Google, vía pip | Apache 2.0 | 30 a 150 MB, solo en Actions (no va al juego ni a tu Mac) | G16 |
| Video de referencia de arranque y dos tiempos | A definir con vos: filmado por vos o alguien que te dé permiso, o material con licencia libre | — | — | G16. No uso videos de atletas reconocibles como molde de un personaje |

Si decís que no a alguno, la historia correspondiente sigue con lo pintado por código (queda mejor que hoy, pero no
llega a «foto»).

## 7. Lo que necesito del núcleo (pedido a la sesión de gameplay)

Para G3 y G4 hace falta saber **antes** que el intento va a fallar. Hoy la presentación se entera cuando el intento ya
cerró (`m.res`). Pedido, todo de solo lectura y sin cambiar resultados:

1. `m.aviso` (o un método `avisoEn(t)`): `{ riesgo: 0..1000, causa, tFallo }` desde que el núcleo lo sabe. `riesgo` es
   qué tan cerca está de no alcanzarle la energía para el tramo que viene; `tFallo`, el instante en que va a soltar si
   ya está decidido (hoy existe `M.tFallo` solo en los controles viejos).
2. Que el fallo de «arriba» se decida **al recibir** y no después (B2), con al menos 400 ms entre la decisión y el cierre,
   para que el cuerpo tenga tiempo de perder la barra.
3. En `res`, el tramo donde se cayó (`caida`, ya está en `U.caida`) expuesto en el resultado para elegir la escena.

Mientras eso no esté, G3 funciona igual: la «pérdida» ocurre en los primeros 0,35 a 0,6 s **después** del cierre, con la
barra todavía en las manos.

## 8. Orden

1. G0, G1, G3, G6 (no dependen de Blender ni de permisos; se prueban sin navegador y con una corrida de Actions).
2. G2, G4, G5, G7, G17 (three.js; G4 y G5 con la sesión de gameplay).
3. G9, G13, G14, G11, G12, G8 (Blender en Actions: una historia por corrida, con su lámina).
4. G10 y G16 cuando estén los permisos.

## 9. Estado (24-nov, rama `graficos-fable`, PR #9)

| Historia | Estado | Qué quedó | Dónde mirarlo |
|---|---|---|---|
| G0 Presupuesto | hecha | `tools/presupuesto_modelos.mjs`, en `pruebas.yml`. Los seis modelos pasan | salida de la prueba |
| G1 Poses T y A | hecha | `web/js/pose_ref.js`, `Athlete.poseReferencia`, visor `?ref=T` y `?ref=A`, `tools/pose_ref_test.mjs` (6 pesistas: brazos a 0,0° y 45,0°, asimetría de 2,5 a 9,3 mm) | `docs/img/graficos/g1_referencia_T_A.jpg` |
| G2 Lámina de control | a medias | Están las tomas `referencia` del banco de fotos (`graficos.yml -f tomas=referencia`); falta sumar cara, manos y sentadilla en una sola hoja | ídem |
| G3 El fallo se ve venir | hecha para las barras perdidas desde arriba | `PIERDE` en `caida.js`; `caida_test` (firme 90 a 125 ms, tope 200) y `check_escenas` con 0 `BAD` | `docs/img/graficos/g3_caidas_antes_despues.jpg` |
| G3b Cargada perdida y barra devuelta | pendiente | | |
| G4 Aviso previo | pendiente | el dato ya existe en `main` (PR #11): `Intento#aviso`; falta traerlo a la rama | |
| G6 Skins como dato | hecha (primera versión) | `web/data/skins.json` (6 equipos), `web/js/game/skins.js`, `Athlete.setSkin`, `juego.html?skin=<id>`, `tools/skins_test.mjs`. Cambia zapatillas, cinturón, pelo y tiñe la malla entera | `docs/img/graficos/g6_skins.jpg` |
| G5, G7 a G17 | pendientes | G10 y G16 frenadas por permisos (sección 6) | |

### Lo que mostraron las poses de referencia (sirve para G9 y G13)

Con los brazos en T se ve lo que en las poses del levantamiento queda disimulado:

- El reposo con el que se arman hoy los modelos **no es ni T ni A**: brazos a 42° con el codo doblado 46° y las piernas
  abiertas 6° a 8° (`pose_ref_test --tabla`). Por eso de pie los brazos cuelgan abiertos, como de muñeco.
- El hombro se afina y se hunde al subir el brazo a la horizontal (los pesos de piel del deltoides y la axila), y la
  cabeza se ve grande contra el ancho de hombros. Son los dos primeros arreglos de G9 y G13.
- Cadera y muslo quedan más anchos que el tórax en los tres: lee a figura de reloj de arena, no a pesista.

### Prueba: una piel de MakeHuman sobre un pesista (25-nov)

Autorizaste bajar **una** piel. Bajé `mindfront_aksel_skin` del paquete «Skins 02» (varón, CC0 según el manifiesto del
paquete, `packs/skins02.json`): el difuso y el mapa de normales, 9,1 MB leídos por rangos del zip de 72 MB (el resto no se
bajó). Al juego entra solo el difuso, a 1024 px en WebP: `web/models/piel_mh_aksel.webp`, 67 KB. Se arma con
`tools/piel_makehuman.py` (el original trae un ojo morado pintado; se tapa con el otro ojo espejado).

- **Calza sin trabajo de UV.** El cuerpo de todos los pesistas es la malla base de MakeHuman (MPFB) y conserva su UV, así
  que cualquier piel de MakeHuman cae en su lugar: cara, manos, ombligo, todo. No hace falta rehacer nada en Blender.
- **Cómo está puesto.** Skin `mh_aksel` (`juego.html?skin=mh_aksel`), campo nuevo `pielTex` + `pielBase` en
  `data/skins.json`. El sombreador cambia el color de la piel por la textura donde la máscara dice piel, conserva el
  sombreado pintado del horneado (relieve, pliegues) y lleva la textura al tono de la ficha de cada pesista. Es el único
  skin que baja un archivo, y solo si se pide. Mismo programa de sombreado (un muestreo más, apagado sin el skin).
- **Cómo se ve** (`docs/img/graficos/prueba_piel_makehuman.jpg`, antes a la izquierda). En el plano del juego casi no se
  nota: cambia el tono (menos naranja, más rosado y pálido). De cerca la cara gana (labios, lunares, variación de color)
  pero pierde la barba de dos días y parte de las cejas que pinta nuestro horneado, y el cuerpo queda más liso: esta
  piel es un difuso suave, su detalle (vello, poro) está en el mapa de normales y en el de brillo, que no se usaron.
- **Qué falta para que valga la pena** (es G10): mezclar la piel en el horneado de Blender en vez de en el navegador
  (cejas, barba y vello nuestros por encima; nada de costo en el teléfono), sumar su mapa de normales al nuestro, y elegir
  2 o 3 pieles por tono (una clara, una media, una oscura) en vez de teñir una clara: multiplicarla hasta el tono de
  Ilarraz la apaga.

### Dato del núcleo para G4

En `main` (PR #11, sin mergear al escribir esto) el núcleo expone `Intento#aviso` → `{ riesgo 0..1000, tramo, causa,
tFallo }`, de solo lectura. Es lo que pedía la sección 7: G4 se arma sobre ese dato cuando esté en la rama.

### Límites conocidos de lo hecho

- **Skins:** la malla se tiñe entera (multiplica el color horneado): el vivo amarillo de Ilarraz con el skin `noche` se
  va al naranja y las vendas de muñeca se oscurecen. Pintar cada parte con su color es G7. Los nombres de los skins son
  ids internos: los que vea el jugador, y si se regalan, se ganan o se venden, lo decidís vos.
- **Caídas:** la pérdida ocurre después de que el núcleo cierra el intento (suma 0,37 a 0,48 s a esos finales). Para que
  empiece antes hace falta el dato de la sección 7.
- **Rendimiento:** nada de lo hecho suma texturas, sombreadores ni triángulos (salvo el skin de prueba `mh_aksel`: 67 KB, solo si se pide). No medí milisegundos por cuadro en un
  teléfono real (Actions dibuja por software).
