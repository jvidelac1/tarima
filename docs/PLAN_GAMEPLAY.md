# Plan de gameplay (24 de noviembre de 2026)

Pedido de Juan: el juego se siente fácil (hasta en Difícil), casi siempre se pelea el oro, hay caídas que no se ven
reales (el pesista levanta bien y arriba la tira), y faltan entrenamiento con animación, plan de entrenamiento,
minijuegos y competencia. Desde ahora se pueden tocar los gráficos.

## Lo que se midió (no son opiniones)

| Medición | Resultado | Fuente |
|---|---|---|
| Oro con rivales «tranquilos» (el nivel con el que arranca todo jugador nuevo) | **97–99 %** de las finales | `tools/pesistas_test.mjs`, 600 finales por caso |
| Oro con rivales «parejos» | 44–62 % siguiendo el panel | ídem |
| Barrita en Fácil, jugador **novato** (±120 ms de error) | 100 % de intentos válidos hasta el 92 % de su máximo | `tools/barra_bots.mjs` |
| Barrita en Fácil, jugador **medio** (±70 ms) | 99–100 % válidos hasta el 97 % | ídem |
| Ancho del verde en la apertura | Fácil ±200 ms (28 % de la barra) · Medio ±136 ms · Difícil ±92 ms: un jugador del montón (±70 ms) lo acierta casi siempre | `web/js/sim/rules.js` → `BARRA`, `NIVELES_B` |
| «Todo verde = la barra sube siempre» (`verdeSalva`) | Activo desde el 13-nov | `rules.js` → `BARRA.verdeSalva` |
| El campeonato semanal (el que cuenta para el ranking) | Se juega en barrita **Fácil** | `web/js/sim/semana.js` → `CAMPEONATO` |
| Dónde se caen las barras | Potente: 98 % en el tramo «arriba» (después de recibir); Largo: 90 % al pararse | `pesistas_test.mjs` |

Conclusiones:
1. **La dificultad está en el lugar equivocado.** Los rivales son lo que decide el oro, y arrancan tranquilos. La
   barrita casi no castiga: el verde es enorme y, si todo sale verde, la barra no se cae nunca.
2. **«Difícil» no es difícil**: el verde dura ±92 ms y un jugador del montón lo acierta casi siempre.
3. **La caída «arriba» se decide tarde**: el núcleo resuelve la energía tramo por tramo y el último tramo se cierra
   cuando el pesista ya recibió la barra. Por eso se ve bien y de golpe se cae, sin aviso.
4. El ranking existe pero está escondido: el botón «Ranking» de la bienvenida no aparece en la primera visita, y en
   el teléfono queda entre los botones secundarios.

## Qué hacen los juegos que retienen hace años (y qué tomamos)

| Juego | Qué funciona | Qué tomamos |
|---|---|---|
| **Golf Clash** / **Mario Golf** | Barra de timing cuyo «perfecto» se achica con la presión (viento, palo, distancia); la habilidad se nota | Verde chico que se achica con kilos, nervios y momento decisivo; «perfecto» de verdad raro |
| **Guitar Hero** / **Rhythm Heaven** | Escalones de dificultad con ventanas distintas; nota de cada intento | Ventanas reales por nivel + nota por intento (S/A/B) |
| **Punch-Out!!** | Se lee al rival antes de que pegue (avisos) | El fallo se anuncia: temblor, barra que se va, cara de esfuerzo; el jugador puede salvarla |
| **Retro Bowl** / **Football Manager** | Ciclo de temporada: entrenar → jugar → mejorar al equipo; las decisiones entre partidos importan | Plan de entrenamiento semanal que se nota en la competencia |
| **Duolingo** / **Clash Royale** | Ligas semanales con ascenso y descenso; trofeos que se pierden | Ligas de 30 personas por semana; subir o bajar de división |
| **Wordle** | Un desafío igual para todos por día; se comparte el resultado | Ya está el campeonato semanal; sumar el «levantamiento del día» |
| **Hades** / roguelites | Perder también hace avanzar | Fallar en entrenamiento suma algo; las finales perdidas dan experiencia |
| **Wii Fit** / **Ring Fit** | La animación del personaje haciendo el ejercicio es la recompensa | El pesista entrenando en un gimnasio, con la barra cargada que sube semana a semana |

Lo que **no** tomamos: ayudas invisibles para que el que va perdiendo alcance (el «rubber band» del Mario Kart). Se
nota y le saca valor al oro.

## Historias

Prioridad: **P1** primero (sin esto lo demás no engancha), después P2 y P3. Cada historia tiene criterio de
aceptación medible.

### Épica A · Dificultad que se siente (P1)

**A1 · Metas de dificultad escritas y medidas en las pruebas.**
Tabla meta por nivel, en `tools/barra_bots.mjs` y `tools/pesistas_test.mjs` (que fallen si no se cumple):
- Fácil: novato ≥ 90 % válidos en la apertura y ~50 % al 100 %.
- Medio: medio ≥ 85 % en la apertura y ~40 % al 100 %; novato ~25 % al 100 %.
- Difícil: bueno ~45 % al 100 %; medio ~20 %.
- Primera final del jugador nuevo: oro ~60 % (hoy 97 %). Con rivales parejos: oro 25–40 %.

**A2 · Verde más chico y que se achica con la presión.**
Verde base: Fácil 45 %, Medio 30 %, Difícil 18 % de la barra (a ajustar con A1). Se achica con la intensidad (kilos
cerca del máximo), en el último intento y cuando hay oro en juego. Velocidad del puntero que cambia entre intentos
(no siempre el mismo ritmo, para que no se aprenda de memoria).

**A3 · Zona «perfecto» dentro del verde.** Una franja chica (≈ 6 % de la barra) que da bonus (menos energía gastada,
nota S). El verde común ya no salva siempre: `verdeSalva` queda solo para la franja perfecta. Hay que cuidar el
pedido del 13-nov («tocás perfecto y se le cae»): con perfecto no se cae; con verde común puede caerse si los kilos
estaban por encima de lo que el pesista puede.

**A4 · Los rivales arrancan parejos.** El jugador nuevo hace la práctica con rivales tranquilos y la primera final
de verdad ya con parejos. Rivales «duros» con un rival estrella que va por récord. Los rivales se arriesgan cuando
el jugador va primero (piden más kilos para pasarlo), como en una final real.

**A5 · El campeonato semanal en Medio.** El que cuenta para el ranking no puede ser el nivel más fácil.

**A6 · Un selector de dificultad que se entienda.** Hoy hay dos (toque y rivales) y se confunden. Un solo nivel
(Principiante, Nacional, Mundial) que fija los dos, más «personalizado» en opciones.

**A7 · Nota por intento y por final.** S/A/B/C según la precisión de los toques; mejor nota por pesista en el
perfil. Da algo para mejorar aunque se gane.

### Épica B · Caídas reales (P1)

**B1 · Auditoría con video de cada caída.** Grabar las 6 causas (sin altura, atrás, adelante, codos, fondo,
aplastado) con los tres pesistas y anotar: qué ve el jugador, en qué momento lo decidió el núcleo, y si en la
halterofilia real se ve así. Entregable: tabla con video por causa.

**B2 · El fallo se decide antes de que se vea bien.** Si el tramo de arriba va a fallar, el pesista no llega a
quedar firme: recibe la barra ya desbalanceado (brazos que ceden, barra que se va atrás). Prohibido: pesista
quieto con la barra arriba y después la tira sin motivo. Prueba automática: en ningún fallo el pesista estuvo
«firme» más de 200 ms antes de soltar.

**B3 · Aviso de que se va.** Temblor, sonido y barra que se inclina medio segundo antes de caer, con un toque para
salvarla (la garra ya existe en el núcleo; hacerla visible).

**B4 · Bajar la barra después de las luces blancas.** En la halterofilia real se suelta desde arriba y es válido,
pero en el juego se lee como fallo. Que primero se vean las luces y «¡VÁLIDO!», y la barra baje acompañada.

### Épica C · Ranking a la vista (P1, chica)

**C1 · El ranking en la portada.** «Esta semana: puesto 14 de 230» en la bienvenida, desde la primera final
terminada; tocarlo abre el ranking. Tras cada final, el cambio de puesto («subiste 6»).

### Épica D · Entrenar y mejorar (P2, con gráficos)

**D1 · El gimnasio.** Escena nueva: el pesista entrena (sentadilla, tirón, técnica) con la barra cargada según su
nivel; las 3 pasadas de la barrita mueven la animación (verde = repetición limpia, rojo = repetición fea). Decisión
pendiente: animaciones hechas por Claude (Blender, como las del levantamiento) o por Gemini.

**D2 · Plan de entrenamiento semanal.** Elegís un plan (fuerza, técnica, pico para el campeonato); cada día hay una
sesión; descansar importa (si entrenás de más, llegás cansado a la final). Se ve en la competencia: «+3 kg de
sentadilla esta semana».

**D3 · Récords y progreso.** Gráfico de tus mejores kilos por semana y récords personales con festejo.

**D4 · Minijuegos de entrenamiento.** Dos nuevos además de la barrita: ritmo (tocar al compás para la técnica) y
equilibrio (mantener la barra centrada arriba). Cada uno mejora una parte distinta del pesista.

### Épica E · Competir con gente (P2–P3)

**E1 · Duelo por link.** Mandás un link; tu amigo juega la misma final (misma semilla) contra tu fantasma y ve tus
intentos. Es lo más viral del plan.

**E2 · Ligas semanales.** Grupos de 30 por división; los 5 primeros suben, los 5 últimos bajan. El ranking global
queda como histórico.

**E3 · Torneos por categoría de peso y calendario** (nacional → continental → mundial), con premio de tarjeta y
logro.

### Épica F · Medir (transversal)

**F1 · Eventos para saber si funciona:** nota por intento, oro por nivel, abandono a mitad de final, días seguidos
jugando. Revisarlo en PostHog (falta el acceso de lectura, LIF-24).

## Decisiones de Juan (24-nov)

- Dificultad: **bastante más difícil** (primera final ~60 % de oro; después 25–40 % con rivales parejos).
- **Solo la franja perfecta salva**; el verde común puede fallar si los kilos son demasiados.
- Historias a Linear (equipo LIF) y arrancar con la semana 1.
- Gráficos (24-nov, noche): todo lo gráfico lo hace un agente con **Fable 5.2**, lo más real posible (humanos semi-reales,
  T pose y A pose, skins intercambiables, movimientos reales). Su plan va en `docs/GRAFICOS_PLAN.md`. Anula la decisión
  de LIF-64 (Gemini).

## Hecho (24-nov, rama gameplay-dificultad)

- **A1–A3 (LIF-70, 71, 72):** barrita 2.0. Verde más angosto (Fácil ×0,70; Difícil ×0,46), franja perfecta en el centro
  (la única que asegura la barra), «¡PERFECTO!» solo ahí y «¡BIEN!» en el resto del verde. Rivales tranquilos más
  firmes y parejos un poco más humanos. Metas en `tools/barra_bots.mjs`. Medido (150 finales por casilla):

  | Nivel · rivales · jugador | Oro antes | Oro ahora |
  |---|---|---|
  | Fácil · tranquilos · medio | 94 % | 61 % |
  | Fácil · tranquilos · bueno | 97 % | 68 % |
  | Fácil · parejos · medio | 23 % | 28 % |
  | Fácil · parejos · bueno | 32 % | 38 % |
  | Medio · tranquilos · medio | 79 % | 36 % |

- **C1 (LIF-81):** «Esta semana vas en el puesto X de Y» en la bienvenida; tocarlo abre el ranking.
- A4 quedó cubierto con los números de arriba (se arranca con tranquilos, pero ya no se gana siempre). A5 (campeonato
  en Medio) queda en Fácil por ahora: en Medio el oro con parejos baja a 8 % y el ranking se vaciaría.

- **B2, parte del núcleo (LIF-78, rama caidas-reales):** `Intento#aviso` de solo lectura (`riesgo` 0–1000, `tramo`, `causa`,
  `tFallo`), lo que pidió la sesión de gráficos (`docs/GRAFICOS_PLAN.md`, sección 7). No cambia resultados ni huellas.
  Medido (`tools/aviso_test.mjs`): 400 ms antes de cerrar «arriba», el 98 % de las caídas ya marca riesgo ≥ 500 (medio
  973) y los válidos marcan 229 de media. No hizo falta demorar el cierre: la «pérdida» de G3 ya empieza al cerrar,
  con la barra en las manos. Lo que queda firme es el arranque en Medio y Difícil mientras corre la barrita de atrapar;
  eso lo resuelve G4 (temblor con este riesgo) en la rama de gráficos.

## Orden propuesto

1. Semana 1: A1, A2, A3, B1, C1 (medir, endurecer la barrita, entender las caídas, ranking visible).
2. Semana 2: A4, A5, A6, A7, B2, B3, B4.
3. Semana 3–4: D1, D2, D3, E1.
4. Después, con datos: D4, E2, E3.

## Pesista nuevo en el juego (25-nov, rama pesista-nuevo)

El pesista del visor (físico esculpido, retrato, malla cortada sobre el cuerpo, tela de foto, pies) entra al juego por
`web/js/character.js`; `web/js/game/actuacion.js` mueve su anatomía por cuadro (hombro, axila, respiración, tela, sudor).
- **Apagado por defecto.** Se prende con `?humano=1` (queda recordado; `?humano=0` lo apaga). Solo Ventura y Brenner.
- **Las caras no están en el repo** (`web/models/appearance/*-face.jpg`, en `.gitignore`): las referencias con las que se
  hicieron piden el parecido de atletas reales, y la regla es personajes ficticios (AGENTS.md). Sin la cara, vuelve solo
  al pesista de siempre. La malla ya no lleva bandera: toma el color del pesista (`setKit`).
- **Costo medido:** armarlo tarda 3 a 5 s en una Mac y 10 a 15 s con el procesador a un cuarto; por eso con texturas de
  teléfono queda el de siempre. Un cuadro en Media: 12,6 ms a 1,47 MP en una M1 Pro.
- **Probado:** partida completa por teclado (`check_game --only=teclado`) con el nuevo y con el de siempre.
- **Defectos conocidos:** con los brazos arriba el brazo atraviesa la sisa izquierda; todos los rivales con el mismo
  modelo comparten cara; falta medir en un teléfono real.
