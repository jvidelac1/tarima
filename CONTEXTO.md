# CONTEXTO.md — para empezar a trabajar en Tarima con otro agente

Este archivo es la puerta de entrada. Leelo entero antes de tocar nada; después seguí con `AGENTS.md` (reglas del repo),
`HANDOFF.md` (historia detallada y pendientes), `docs/JUEGO.md` (diseño del juego) y `docs/MVP.md` (muro, servidor y medición).

> El repo es **público**: acá no van claves, secretos, mails de jugadores ni datos personales. Todo eso vive fuera del repo,
> en `~/tarima-datos/` en la Mac del dueño.

## Qué es

**Tarima** es un juego web de halterofilia (three.js, módulos ES sin build) publicado en **https://liftinggame.pages.dev**.
Una final de 3 pesistas ficticios (el jugador y 2 rivales), arranque y dos tiempos, 3 intentos cada uno. Se juega con una
tecla (Espacio) o un toque. La meta del dueño es llevarlo a un **producto monetizable** en el corto plazo: primero retención y
comunidad, después monetización. Público real: la mayoría en inglés, 2 de cada 3 desde el celular.

## Estado al 13 de noviembre de 2026

Publicado (ramas `main` y `mvp`, commit `ed11f4a` más este archivo):
- **Barrita** como control por defecto: un puntero va y vuelve sin reloj; verde = perfecto, amarillo = regular, rojo = lejos.
  Una barrita en el arranque y dos en el dos tiempos. **Si todas las barritas de un levantamiento salen en verde, la barra
  sube siempre**; si no, decide la energía (kilos × cuerpo del pesista × suerte), y la caída nombra la barrita que falló.
- Energía y **cansancio** entre intentos; esfuerzo corto al pararse (pocos toques cómodos) solo en intentos exigentes.
- 3 pesistas (Compacto, Largo, Potente) con fase fuerte y débil; envión split (más fácil) < power < squat (más difícil).
- Rivales con personalidad y plan de kilos propio (Ventura «va a lo seguro», Brenner «hace cuentas», Marangi «arriesga»).
- Dificultad en Opciones: Fácil (por defecto), Medio, Difícil, Clásico.
- **Muro**: el arranque de una final es gratis; al terminarlo se pide el **mail (obligatorio)** para seguir jugando sin
  límite. Después de anotarse, una **encuesta opcional** de 2 preguntas (app móvil o juego web; qué features querés, con 3
  propuestas y texto libre). El conteo de lo gratis está en el servidor (dispositivo + HMAC de la IP).
- **Inglés por defecto**; español con el selector o `?lang=es`.
- Pantalla de carga liviana (barra de progreso real y frases) y modelos comprimidos (7,9 MB).

Publicado también (rama `tablero`, ya fusionada): tablero de competencia (orden de salida, pedido de kilos de cada pesista,
estrategia), el levantamiento completo del rival con botón **Skip** (tecla S; Espacio ya no saltea), RM y dificultad en el
panel de kilos («MEDIO · 92 % de tu RM (163 kg) · 8 de 10») y menos cortes de cámara (0 cortes bruscos por final).

## Backlog

En **Linear**, equipo **LIFTINGAME** (clave `LIF`, issues LIF-1 a LIF-29, en Backlog), 5 proyectos: Juego de estrategia, Competencia y comunidad,
Carrera y progresión, Plataforma y crecimiento, Monetización. Prioridad: Urgent = ya, High = próximas 2 semanas, Medium = el
mes siguiente, Low = después de validar. Lo urgente: LIF-2 (medir el gameplay nuevo con datos reales). Lo próximo en el juego: **orden por rondas** (LIF-3) (los 3 levantan una vez por ronda; dentro
de la ronda abre el que pidió menos kilos) y **cambios de último momento** (LIF-4); en comunidad: **campeonato semanal** con la misma
semilla para todos (LIF-8) y **leaderboard** validado en el servidor (LIF-9, LIF-10). La misma lista, con prioridades, está
en `~/tarima-datos/backlog_tarima.md` en la Mac del dueño.

## Cómo trabaja el dueño (respetalo)

- **Fácil de jugar ante todo.** Nada de coordinar toques con el movimiento del pesista ni carreras de toques. La dificultad
  sale de decisiones (pesista, kilos, riesgo), no de la precisión de los dedos. Lo difícil es un defecto.
- **Menos ruido visual.** El jugador entra y juega con un toque; una sola indicación principal por momento.
- **No inventes contenido** de cara al jugador (preguntas, promesas, precios, frecuencias de mail). Si hace falta, proponelo
  y esperá su OK.
- **Medí antes de decir que algo anda:** bots sin navegador y capturas en GitHub Actions; mirá las capturas.
- **Su Mac está ocupada:** nada pesado local (ni navegador ni Blender). Pruebas sin navegador de a una; lo demás en Actions.
- **Publicar en producción requiere su OK explícito** para cada publicación.
- Español rioplatense con él; los textos del juego en español neutro con tuteo (sim_test rechaza el voseo) e inglés.
- Personajes, sedes y eventos **ficticios**; nada de atletas, marcas ni competencias reales.

## Ramas y carpetas

- **`main`** — rama por defecto y **punto de partida**: es lo publicado (idéntica a `mvp`). Para trabajar: rama nueva desde
  `main`, pruebas en verde, y fusionar a `main` (y llevar `mvp` al mismo commit, que es de donde publica `tools/desplegar.sh`
  vía `~/tarima-trabajo/vista`).
- `mvp` — misma versión que `main` (nombre histórico de la rama publicada).
- `gameplay`, `carga`, `rivales`, `medicion`, `muro-medio`, `tablero` — ya fusionadas; no hace falta mirarlas.
- `linux`, `arte` — build de los personajes en Blender (no hace falta para el juego: los modelos ya están en `web/models`).
- En la Mac del dueño hay worktrees en `~/tarima-trabajo/<rama>` (fuera del Escritorio a propósito: el Escritorio se sube a
  iCloud). `~/tarima-trabajo/vista` es el worktree limpio desde el que se publica.

## Infraestructura

- **Cloudflare Pages** proyecto `liftinggame` (web/ + functions/) con service binding al **Worker `tarima`**, que no tiene
  dirección pública (todo pasa por `/api/*` y `/qx/*` de Pages). **D1** `tarima` (dispositivos, partidas, lista, encuestas,
  límites). Variables del Worker en `worker/wrangler.jsonc` (regla del muro: `GRATIS_ETAPA`, `GRATIS`, `TOPE_IP`,
  `BONO_ENCUESTA`).
- **Secretos** del Worker (no se regeneran nunca: hacerlo devuelve finales gratis a todos). Copias y claves en
  `~/tarima-datos/` (fuera del repo).
- **PostHog** (US): proyecto propio del juego; los eventos van por el proxy `/qx` sin la IP del jugador; el país llega en la
  propiedad `pais` y la persona en `jugador` (id seudónimo). El mail nunca va a PostHog. Grabación de sesiones en 1 de cada
  3 visitas, con campos y nombre tapados. **El dueño tiene otro proyecto de PostHog de otra app: no se toca ni se mezcla.**
  Reportes guardados: «Jugadores por día» y «Muro: quién lo vio y qué hizo». Encuesta: evento `encuesta_respuesta`.
- **Lista de mails**: `bash tools/lista.sh` (o `--csv`) lee D1. Solo se les escribe novedades a quienes las aceptaron.

## Comandos

```bash
node tools/sim_test.mjs          # núcleo del juego y textos (es/en) sin navegador
node tools/servidor_test.mjs     # Worker real en Node con D1 falsa + cliente del juego
node tools/barra_bots.mjs        # barrita: bots novato/medio/bueno por pesista, nivel y % de kilos
node tools/ritmo_test.mjs        # duración de la final y esperas
gh workflow run pruebas.yml -R jvidelac1/tarima --ref <rama>   # pruebas con navegador (4 grupos, ~15 min)
# también: telefono.yml, muro.yml, servidor.yml (corren con el push en varias ramas)
cd web && python3 -m http.server 8000                          # jugar local (sin servidor: final entera, sin muro)
#   http://localhost:8000/juego.html?muro=firme  simula el muro de producción (solo localhost)
bash tools/desplegar.sh --seco   # publicación en seco (desde un checkout limpio de main/mvp; en la Mac: ~/tarima-trabajo/vista)
bash tools/desplegar.sh --si     # publica Worker y después Pages (requiere OK del dueño)
```

Commits en español, chicos, terminados con la línea `Co-Authored-By:` del agente que los hizo.
