# Propuestas del 23-nov para lo que falta del backlog

Lo que necesita una decisión del dueño antes de construirse: textos de cara al jugador, reglas nuevas que cambian el
balance, compras o datos que hoy no están a mano. Cada punto dice qué propongo, qué hay ya hecho y qué falta para
arrancar. Lo hecho el 23-nov está en `CONTEXTO.md` («Cambios del 23 de noviembre»).

## Juego de estrategia

### LIF-35 · Scoreboard y modo competencia tipo «war games»
- **Ya está:** tablero con orden de salida y pedidos (LIF-3), cambios de kilos por intento (LIF-4), panel liviano (LIF-31) y
  la energía que se recupera mientras levantan los demás (el «Resto»): pedir más para mover el orden ya es «robar el reloj».
- **Propuesta:** un reloj visible solo en Medio y Difícil: 1:00 para empezar cuando te llaman y 2:00 si te seguís a vos
  mismo (la regla de la IWF), con la cuenta que hoy ya calcula el núcleo (`RELOJ`). La barrita no cambia. Sin reloj en Fácil.
- **Falta:** el OK al texto y que el reloj corra en Medio y Difícil (hoy `relojLibre` en la barrita).

### LIF-34 · Fase de planificación (repartir fuerza y ángulos)
- Choca con «Fácil de jugar ante todo» y «pocas decisiones por pantalla» (LIF-47). **Propuesta:** no hacer el reparto
  fino; dejar que el entrenador proponga el plan (LIF-5) y que el jugador elija entre 3 planes con una línea cada uno.
  Si se quiere probar, como opción de Difícil.

### LIF-5 · Plan de competencia antes de la final, con bonus por cumplirlo
- **Propuesta:** en la presentación, 3 planes del entrenador (Asegurar el total · Pelear el oro · Ir por el récord) que
  fijan apertura y saltos con `sugerencia()` (entrenador.js). Bonus: si el arranque sale como se planeó (3 válidos con
  los kilos del plan), el dos tiempos arranca con la energía llena. Va en el núcleo y en el registro (el servidor lo
  recalcula) y se ajusta con `tools/balance.mjs`.
- **Falta:** el OK a los nombres de los planes y al bonus (cambia el balance).

## Carrera y progresión

### LIF-15 y LIF-49 · Categorías de peso (subir o bajar)
- Necesitan pesistas nuevos en el núcleo (`sim.json`: techo, atributos y personalidad por categoría, con los estándares
  de la IWF que dice LIF-49) y sus cuerpos. Los cuerpos están en la pista visual (LIF-64 → LIF-67, con Gemini).
- **Propuesta:** arrancar cuando estén los 4 físicos base de LIF-64: 2 categorías de hombres al principio (la de hoy,
  ~89 kg, y una liviana, ~73 kg) con 3 pesistas cada una; cambiar de categoría entre finales, no a mitad.

### LIF-48 y LIF-16 · Mujeres y competir contra el mismo sexo
- Igual que categorías: hacen falta 3 pesistas mujeres por final (la persona y 2 rivales) con cuerpos terminados. Depende
  de LIF-64 (mujer liviana y mujer pesada).

### LIF-69 · Modo entrenamiento por escuela (y LIF-37, 40, 41, 42, 62)
- **Ya está:** la progresión del RM por oros (LIF-14), que es la base.
- **Propuesta** (alineada con LIF-47, sin manager): entre finales, una sola decisión por bloque de 4 semanas de juego
  (4 finales): «Escuela rusa» (+técnica), «búlgara» (+RM, más cansancio), «china» (+velocidad de la barrita),
  «latinoamericana» (+garra). Cada bloque suma poco y los efectos van en el registro como la progresión.
- **Falta:** el OK a los nombres y textos (los aprueba el dueño) y si «escuela» por país se entiende bien en inglés.
  LIF-37, 40, 41 y 42 (el lado manager) quedan cubiertos por esto o descartados, según LIF-47.

### LIF-17 · Pesistas desbloqueables · LIF-19 · Antidoping · LIF-18 · Sedes
- LIF-17: desbloquear Ilarraz y Kordan (hoy «(new)» para todos) con oros validados; espera la decisión de categorías.
- LIF-19: contenido nuevo de cara al jugador (un control al azar después del podio); necesita OK del tono.
- LIF-18: es visual (sedes nuevas): pista de gráficos.

## Competencia y comunidad

### LIF-13 · Multiplayer en vivo (salas de 3 por turnos)
- **Propuesta:** con Durable Objects (una sala por final, WebSocket), reusando el registro: cada uno juega su intento en su
  aparato y la sala reparte los resultados recalculados. Primero medir si el desafío asíncrono (LIF-12) engancha.

## Plataforma y crecimiento

- **LIF-20 · Dominio propio:** es una compra (Cloudflare Registrar, unos USD 10 por año según el nombre). Falta que el
  dueño elija el nombre y lo compre o dé el OK con el total.
- **LIF-21 · Mails de confirmación y novedades:** el código ya está en el Worker; falta el dominio (LIF-20) para
  `wrangler email sending enable`, SPF, DKIM y DMARC. Hay 88 anotados sin confirmar.
- **LIF-22 · Teléfonos reales:** hace falta un iPhone y un Android en la mano (o un servicio pago de aparatos).
- **LIF-24 · App móvil si la encuesta lo pide:** las respuestas de la encuesta están en PostHog (proyecto del juego), que
  no está en la cuenta abierta en el navegador del dueño. Con acceso de lectura, se mide y se decide.
- **LIF-44 · Cartel obligatorio:** lo superó LIF-53 (hecho y apagado por decisión del 17-nov). Datos de D1 del 12 al 23-nov:
  1.424 finales pedidas, 540 quedaron en el arranque (el muro), 715 de 815 dispositivos jugaron una sola vez.
  **Propuesta:** prender la regla de LIF-53 una semana (dos variables del Worker) y comparar con `tools/medir.sh`.
- **LIF-56 a LIF-60 y LIF-30:** textos listos en `docs/DIFUSION_TEXTOS.md`; publicarlos es del dueño (sus cuentas).
- **LIF-51 · CrossFit y Hyrox:** «más adelante», sin acción.

## Monetización

- **LIF-27 · Modelo:** con lo medido, la tracción todavía es chica (2 finales por día después del pico de Reddit). Propuesta:
  no cobrar aún; medir retención con campeonato y desafíos 2 semanas. Primer candidato cuando haya uso: pase de temporada
  cosmético (sin ventaja), compatible con el campeonato parejo.
- **LIF-28 · Términos para cuentas y pagos** y **LIF-29 · Prototipo de ingresos:** dependen de LIF-27.
