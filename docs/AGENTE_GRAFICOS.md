# Encargo para el agente de gráficos

Encargo de Juan (26 de noviembre de 2026) para el agente que trabaje sobre los pesistas. El mapa técnico, el presupuesto
y las trampas ya pisadas están en `docs/PESISTAS_3D.md`: este archivo dice **qué hay que lograr**; aquel, **cómo está hecho**.

Sos el responsable de gráficos y animación de los pesistas de Lifting Game (juego web de halterofilia en three.js).
Objetivo: que cada pesista se vea y se mueva lo más parecido posible a una persona real, en cada momento del juego, sin
romper la carga ni el celular. Cada expresión corporal y cada textura tiene que estar trabajada: cuando hace fuerza,
cuando está relajado, cuando falla un tiro, cuando entra y sale de la tarima. Por más micro que sea la animación.

## Antes de tocar nada, leé en este orden

1. `AGENTS.md` y `CONTEXTO.md` (reglas del repo y cómo trabaja el dueño).
2. `docs/PESISTAS_3D.md` (mapa de archivos del pesista, presupuesto, trampas y defectos conocidos).
3. `docs/PLAN_GAMEPLAY.md` (y `docs/GRAFICOS_PLAN.md` cuando esté en main: hoy vive en el PR #9).

Trabajá desde `main` actualizado, en una rama por tema, con PR chicos.

## Dónde se trabaja

- Todo va **dentro del juego** (`web/juego.html`), no solo en el visor. El pesista entra por `web/js/character.js` y se
  mueve por cuadro en `web/js/game/actuacion.js`; poses, caídas y gestos están en `web/js/game/stage.js`, `caida.js` y
  `effort.js`.
- El visor de anatomía donde nació el pesista nuevo (`performance.js`, `study.js`, `attempt.js`: posturas A y T,
  secuencia sin barra, caída con apoyo de manos) **no está en el repo**: quedó sin commitear en la rama `linux` de la
  copia de trabajo de Juan. Primer trabajo: subirlo en un PR y portar al juego lo que sirva (mano relajada, caída hacia
  atrás, salida con dos apoyos).

## Qué tiene que quedar perfecto

1. **Relajado, esperando el llamado:** respira, cambia el peso de pierna, manos colgando con dedos naturales, mirada
   que se mueve, parpadeo.
2. **Entra a la tarima:** camina desde afuera, se pone magnesio, se para frente a la barra, se acomoda, se agacha y
   toma el agarre. Hoy no existe.
3. **Hace fuerza:** cara que aprieta, mandíbula, cuello y trapecios que se marcan, venas, piel que enrojece y suda,
   tela que se pega, temblor proporcional al esfuerzo. Leé el riesgo de caída del núcleo (`Intento#aviso`, solo
   lectura) para que el fallo se vea venir.
4. **Recibe y sostiene arriba:** hombros y escápulas correctos, codos trabados, sin que el brazo atraviese la malla
   (hoy atraviesa la sisa izquierda).
5. **Falla el tiro:** la barra se le va en las manos antes de soltarla, según la causa (atrás, adelante, codos, fondo,
   aplastado). Puede perder el equilibrio y **caerse**: hacia atrás con apoyo de manos y asiento, o salir con dos
   pasos. Después se incorpora. Cara de bronca o decepción.
6. **Vale el intento:** baja la barra acompañada después de las luces, festeja (tres variantes como mínimo), cara de
   alivio, mira al público.
7. **Sale de la tarima:** se da vuelta y se va caminando. Hoy no existe.
8. **Texturas:** piel con poro y variación real por zona, manos con magnesio, tela con trama y costuras, cuero del
   cinturón, rodilleras, zapatillas. Pelo y barba que no parezcan un bloque.
9. **Una cara por pesista**, y pesista nuevo para todos los modelos del plantel (hoy solo Ventura y Brenner; el resto
   necesita `landmarks`, cara y pies).

## Reglas que no se rompen

- **Personajes ficticios.** Las caras actuales son provisorias: generá caras nuevas sin usar como referencia a ninguna
  persona real, sin la instrucción de conservar el parecido de nadie, y sin banderas ni uniformes de países. Formato:
  frente a la izquierda y perfil a la derecha, 2:1, WebP, en `web/models/appearance/<nombre>-face.webp`.
- **No toques `web/js/sim/`** (el núcleo): el servidor rehace cada final con ese código. Lo que necesites de ahí se lee.
- **Un solo esqueleto:** 52 huesos Mixamo más `Bar`. No se renombran.
- **No ajustes poses a ojo:** las poses son reglas y se validan con `check()`.
- **Nada de descargas, compras ni cuentas sin permiso de Juan.** Texturas solo CC0, anotadas en `docs/PESISTAS_3D.md`.
- **El pesista de siempre tiene que seguir andando:** es el respaldo si lo nuevo falla.
- **Merge y publicación solo con el OK de Juan.**

## Presupuesto (medilo, no lo estimes)

- Armado del pesista nuevo: 1,5 s como máximo por pesista en una M1 Pro (`JUEGO.msPesista` dice cuánto tarda cada paso).
- Descarga propia de los pesistas nuevos: 2,5 MB como máximo (hoy 1,8).
- Un cuadro en calidad Media: menos de 16,6 ms.
- Probalo con el procesador frenado a un cuarto y en vertical de teléfono.

## Cómo se da algo por terminado

```bash
node tools/check_game.mjs --only=teclado --dibujo     # una final completa, con caídas
node tools/check_game.mjs --only=tactil --dibujo
node tools/check_escenas.mjs                          # 0 BAD: la barra no atraviesa el cuerpo
node tools/banco.mjs --fotos=<carpeta> --niveles=alta --pesista=<id>   # capturas de antes y después
```

- Para posar un final a mano: `JUEGO.test.final(...)` y `JUEGO.test.finalEn(t, true)`.
- Cada PR dice qué mediste, qué no pudiste verificar y qué defecto queda, con capturas de la cámara del juego y de cerca.
- Actualizá `docs/PESISTAS_3D.md` con lo que aprendas.

## Orden sugerido

1. Subir el visor al repo.
2. Caras ficticias, una por pesista.
3. Sisa y hombros con los brazos arriba.
4. Manos y reposo.
5. Esfuerzo (cara, cuello, piel).
6. Fallos y caídas del cuerpo.
7. Entrada y salida de la tarima.
8. Resto del plantel.
