# Monetización (LIF-27, LIF-28, LIF-29) y otras versiones (LIF-51)

Estado al 23-nov-2026. Lo publicado ese día (finales validadas, campeonato semanal, ranking, perfil, entrenamiento) está en
`CONTEXTO.md`. Este documento define el modelo con los datos que hay, deja el borrador de términos para cuando haya cuentas y
pagos, y el plan del primer prototipo de ingresos. Lo que necesita una decisión o una cuenta del dueño está marcado **[DUEÑO]**.

## Datos (D1 de producción, 12 al 23-nov)

| | |
|---|---|
| Finales pedidas | 1.424 en 815 dispositivos (pico 13 y 14-nov, Reddit) |
| Últimos 7 días | 253 finales en 83 dispositivos |
| Jugaron una sola vez | 715 de 815 (88 %) |
| Lista de espera | 88 altas, 33 aceptan novedades, 20 países (US 43, GB 8, CA 8, ES 4, AR 4, DE 3) |
| Encuestas respondidas | 62 (las respuestas están en PostHog: **[DUEÑO]** acceso de lectura para leer qué piden) |

Lectura: el público pagante probable es angloparlante y de halterofilia; la retención todavía es el problema (88 % de una sola
vez). Cobrar antes de retener empuja a los pocos que vuelven.

## LIF-27 · Modelo elegido

Sigue las fases que decidió el dueño el 15-nov (LIF-27): 1) retención y datos; 2) ranking y calendario sin pagar (hecho el 23-nov:
campeonato semanal, ranking, desafíos); 3) tienda cosmética; 4) pase de temporada y lifetime.

**Gratis para jugar; ingresos por una temporada cosmética opcional y por apoyo voluntario. Nada que dé ventaja en la tarima.**

1. **Nada pay-to-win.** El campeonato semanal y el ranking se juegan sin progresión ni entrenamiento (ya es así), y ningún
   pago cambia kilos, barrita ni rivales. Es lo que hace creíble el ranking validado en el servidor.
2. **Temporada (8 semanas) con un pase cosmético** (USD 4,99, la referencia del dueño del 15-nov en LIF-27; más adelante lifetime USD 24,99 y packs USD 1,99 / 4,99 / 9,99, siempre cosméticos): colores de malla y cinturón, marco del perfil, la
   bandera del jugador en el tablero, tarjeta para compartir con diseño de temporada, historial de campeonatos de la temporada.
   Lo cosmético depende de la pista visual (Gemini, LIF-65): el primer pase puede ser solo de 2D (tarjeta, marco, tablero).
3. **Apoyo voluntario** («Invitá un café al que hace el juego»), sin beneficios, desde la bienvenida y el podio.
4. **Sin publicidad** en el juego: rompe la tarima (que es lo que se comparte) y paga poco con este volumen.

Métricas para decidir si sigue: retención D7 ≥ 15 % y ≥ 30 jugadores por semana en el campeonato antes de abrir el pase
(`tools/medir.sh` y el ranking semanal). Por debajo, primero retención (desafíos, campeonato, entrenamiento).

## LIF-28 · Términos y privacidad para cuentas y pagos (borrador)

Hoy no hay cuentas ni pagos: el juego es anónimo por dispositivo y la privacidad (`web/privacidad.html`) ya cubre ranking,
finales validadas y errores. Cuando se abra el pase hace falta:

- **Procesador de pagos** que sea el vendedor (merchant of record: Paddle o Lemon Squeezy) para no manejar impuestos por país
  ni datos de tarjeta. **[DUEÑO]** abrir la cuenta y aceptar sus términos.
- **Cuenta** solo para quien compra: correo verificado (necesita el dominio de LIF-20) y el dispositivo ligado. Sin contraseña
  (enlace por correo).
- **Términos de uso** (borrador, en inglés y español, a revisar por el dueño antes de publicar):
  - El juego es gratis; el pase es un bien digital cosmético, sin ventaja en el juego, para la temporada que dice.
  - Reembolso según la política del procesador; si el juego deja de existir durante una temporada pagada, se reembolsa.
  - El ranking es público solo con el apodo que la persona eligió mostrar; se puede ocultar en cualquier momento.
  - Conducta: un registro manipulado no entra al ranking (el servidor recalcula cada final); se puede sacar del ranking a quien
    lo intente.
  - Personajes, sedes y eventos ficticios.
- **Privacidad**, agregar: qué guarda el procesador (no vemos la tarjeta), el correo de la cuenta y su borrado a pedido, y la
  base legal (ejecución del contrato).

## LIF-29 · Primer prototipo de ingresos

Lo que se puede construir sin cuenta de pagos, y lo que espera al dueño:

1. **Ahora (sin pagos):** botón «Apoyar el juego» con un enlace externo (Ko-fi o Buy Me a Coffee) que **[DUEÑO]** crea con su
   cuenta; el juego solo lo muestra si hay URL configurada en el Worker (variable `APOYO_URL`), así no se publica un enlace
   vacío. Mide clics con un evento `apoyo_click`.
2. **Con el procesador:** el pase de temporada como producto único por temporada; webhook del procesador → Worker (`/api/pago`)
   → D1 (`pases`: dispositivo o cuenta, temporada); el juego pinta los cosméticos si `/api/estado` dice que hay pase.
3. **Prueba antes de cobrar:** mostrar el pase como «próximamente» a una parte del tráfico (bandera de PostHog) y medir cuántos
   tocan «Quiero el pase» (intención de compra) antes de integrar el procesador.

## LIF-51 · Versiones de CrossFit y Hyrox (más adelante)

Qué se reusa y qué no, para cuando se decida:

- **Se reusa:** la barrita como control (un toque por movimiento), el núcleo puro y recalculable, el servidor de finales,
  campeonato semanal y ranking (la «misma final para todos» encaja con los WOD de la semana).
- **Cambia:** el modelo de cansancio (muchas repeticiones en vez de 6 intentos), el reloj (AMRAP, for time), y las animaciones
  y escenarios (pista visual).
- **Recomendación:** no antes de que la halterofilia retenga (métricas de LIF-27). Como primer experimento barato, un «WOD de
  halterofilia» dentro del mismo juego (por ejemplo, 3 arranques por tiempo) usando lo que ya existe.
