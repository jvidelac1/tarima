# Plan de producción — Tarima

Acordado el 11 de noviembre de 2026. El estado técnico y los pendientes están en [HANDOFF.md](../HANDOFF.md); este documento dice qué se hace, dónde y cuándo se da por terminado.

## Objetivo

Un juego web online de halterofilia de calidad de producción. Terminado cuando alguien que no conoce el juego abre el link en su teléfono, compite contra otra persona y ve el resultado en la tabla, sin errores y sin que nada de lo visual lo saque de la experiencia.

## Alcance del juego (definido por el usuario el 11-nov)

Una **final del mundo con tres pesistas**. El usuario juega para que su pesista gane.

- Tres levantadores ficticios (los dos actuales más uno nuevo), cada uno con su biotipo.
- Arranque y dos tiempos con cualquiera de los tres enviones (tijera, power, squat).
- Los intentos pueden salir bien, ser nulos o fallar, con animaciones propias de cada fallo.
- **Pelear el levantamiento:** el usuario aprieta una tecla (o toca) para que el pesista haga más esfuerzo y no falle; el resultado depende de eso y del timing.
- Festejos después de un intento válido.
- **Ayudantes que cargan la barra** entre intentos cuando cambia el peso.
- Cierre con **podio, entrega de medallas y foto de los tres juntos**.
- Los gráficos más reales que se puedan lograr en web.

Dirección de arte: **realismo estilizado**, no fotorrealismo. La referencia de nivel es un buen juego deportivo de consola de la generación anterior corriendo en el navegador.

## Dónde corre cada cosa

| Máquina | Para qué | Notas |
|---|---|---|
| Pod Linux con GPU NVIDIA por hora (RunPod) | Blender, personaje, poses, prueba del visor con GPU real, imagen a 3D con modelos abiertos, horneados de alta calidad | Desde el 11-nov el pipeline entero corre en Linux (rama `linux`, ver README). Scaleway no tenía stock de Mac ni de GPU. Se cobra por hora mientras el pod existe, y si se detiene puede no volver a conseguirse la placa |
| Sesión cloud de Claude | Gameplay, interfaz, online, backend | Rama propia; no necesita Blender |
| Mac del usuario | Nada pesado | Solo mirar resultados |

Una GPU más grande no mejora cómo se ve el juego para el jugador: eso lo dibuja el navegador de cada uno. Mejora los insumos (malla, mapas horneados, movimiento) y acorta cada iteración.

En el pod se puede paralelizar, pero midiendo: empezar con dos procesos de Blender y subir solo si los tiempos por paso no empeoran. En una máquina de 16 GB compartida, tres en paralelo multiplicaron cada paso por diez.

## Etapas y criterio de terminado

| # | Etapa | Dónde | Terminada cuando |
|---|---|---|---|
| 0 | Preparación | Pod con GPU y cloud | `tools/setup.sh` corre en el pod y `./build.sh` da 0 cuadros con superposición en los dos; la sesión cloud abre el repo |
| 1 | Juego mínimo jugable | Cloud | Una final de tres pesistas jugable de punta a punta con toques o teclado: orden de salida por kilos, tres intentos por levantamiento, elección de kilos, mecánica de timing y de «pelear el levantamiento», luces de jueces, válido o nulo, total y clasificación. Los dos rivales los maneja el juego. Escritorio y teléfono sin errores de consola. La prueba automática juega una partida completa |
| 2 | Dirección de arte | Pod con GPU | Imagen objetivo elegida por el usuario. Lista fija de planos capturados en el visor. Comparación de ventura con brazos arriba en tres versiones (malla actual, malla generada por imagen a 3D, variante de proporciones) contra el objetivo. **El usuario decide cuál sigue, o si se compra o encarga la malla** |
| 3 | Atletas definitivos | Pod con GPU | Los tres atletas (el tercero es nuevo y ficticio) con el look elegido pasan la lista de planos sin los defectos de hoy (pliegue de axila, rodillera, borde de barba, halo blanco). `./build.sh` en 0 para los tres. Cada GLB pesa 4 MB o menos. Dos ayudantes de pista con malla más simple. **El usuario aprueba las capturas** |
| 4 | Movimiento y fallos | Pod con GPU | Cada fase comparada contra su cuadro de video en `docs/ref/`; la tabla de HANDOFF pasa de «coherente» a «comparada». Reservas de ritmo corregidas (subidas, segundo tirón, dip). Fallos animados (barra adelante, barra atrás, envión que no bloquea, intento peleado que sale y que no sale), festejos y ayudantes cargando la barra, todos en 0 en el chequeo |
| 5 | Online | Cloud | Cuentas, competencia por turnos y tabla de posiciones en una URL pública. El servidor recalcula el resultado y rechaza uno falsificado. Dos personas en dispositivos distintos completan una competencia |
| 6 | Pulido y lanzamiento | Ambos | 60 fps en calidad media en una laptop común y 30 estables en un teléfono de gama media. Carga inicial de 10 MB o menos. Audio de público y locutor. Podio, entrega de medallas y foto de los tres |

Las etapas 1 y 2 corren en paralelo. La 3 depende de la decisión de la 2. La 4 necesita los videos de referencia. La 5 solo necesita la 1.

## Qué se hace distinto respecto de la primera pasada

1. Se prueba la fuente de la malla antes de invertir en pulirla.
2. Todo se compara contra una imagen objetivo elegida, no contra la palabra «fotorrealista».
3. El arte se evalúa en el visor con una lista fija de planos, no en renders de Blender con otra luz.
4. Piel con subsuperficie, ojos con córnea y sombra de párpado, barba con tarjetas de pelo.
5. Huesos auxiliares para hombro, axila y rodilla, movidos por cálculo en el visor. **Aprobado por el usuario el 11-nov** («si aporta al realismo, mejor»); AGENTS.md ya lo refleja.
6. Punto de control con capturas antes de cada etapa cara.
7. Presupuesto de triángulos y de milisegundos por cuadro fijado desde el principio.
8. Video de referencia para el ritmo.

## Decisiones tomadas

- Plataforma: escritorio y teléfono desde el primer día.
- Online: competencia por turnos con tabla de posiciones, sin tiempo real.
- Backend propuesto: Cloudflare (Workers y D1) con el juego como sitio estático. Sin confirmar.
- Higgsfield: un mes de plan Plus para imágenes de concepto, texturas, fondos, video no interactivo y audio. No es motor ni genera el personaje jugable.
- Personajes siempre ficticios. El video de referencia se usa solo para ángulos y ritmo.

## Lo que depende del usuario

- Iniciar sesión y pagar en el proveedor de GPU (RunPod). La operación (crear la máquina, configurarla por SSH, correr los builds) la hace el agente desde la sesión local del usuario, que queda como orquestadora sin correr nada pesado.
- Autorizar GitHub en claude.ai/code para la sesión cloud.
- Subir dos o tres videos en cámara lenta a `docs/ref/`.
- Cuenta y login de Higgsfield.
- Elegir la imagen objetivo y aprobar las capturas de las etapas 2 y 3.

## Mensajes de arranque

Las sesiones nuevas no recuerdan la conversación anterior. Pegar esto al abrirlas.

**Pod con GPU (etapas 0 y 2):**

> Leé AGENTS.md, HANDOFF.md y docs/PLAN.md. Trabajá sobre la rama `pasada-visual` en una rama nueva `arte`. Primero la etapa 0: corré `tools/setup.sh`, después `./build.sh`, y confirmá 0 cuadros con superposición en los dos y que `node tools/check_viewer.mjs` consigue GPU. Después la etapa 2 de docs/PLAN.md. Esta máquina es dedicada: usala a fondo, pero medí antes de paralelizar Blender. Frená y mostrame capturas en el punto de decisión de la etapa 2.

**Sesión cloud (etapa 1):**

> Leé AGENTS.md, HANDOFF.md y docs/PLAN.md. Trabajá sobre la rama `pasada-visual` en una rama nueva `gameplay`. Hacé la etapa 1 de docs/PLAN.md. No toques `blender/` ni regeneres `web/models`; respetá los contratos de HANDOFF.md. No hay GPU: probá lógica y consola, no rendimiento ni look.
