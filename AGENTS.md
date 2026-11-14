# AGENTS.md

Leé primero `CONTEXTO.md` (qué es, estado, backlog en Linear, cómo trabaja el dueño, infraestructura y comandos) y después `HANDOFF.md` (historia detallada y pendientes).

## Reglas de trabajo en este repo

- **No ajustar poses a ojo.** Todo cambio en `blender/poses.py` se valida con `check()` (cero cuadros `BAD`) y con las hojas de control `out/<nombre>/sheet_<seg>_side.png` y `sheet_<seg>_front.png`. No aflojar `check()` ni excluir muestras para llegar a cero. Agregá la vista que necesites en `WANT`.
- **Las poses son reglas, no rotaciones.** Si una fase se ve mal en un biotipo, corregí la regla o el parámetro de la fase; no hardcodees un valor por personaje.
- **Un solo esqueleto animado.** 52 huesos con nombres Mixamo más `Bar`; no cambiar sus nombres: el visor y las animaciones dependen de eso. Se permiten huesos auxiliares de deformación con prefijo `aux_` (hombro, axila, rodilla): no llevan claves de animación y los mueve el visor por cálculo.
- **Personajes ficticios.** Nada de nombres, caras ni marcas de atletas reales.
- **La referencia manda.** Si hay cuadros de video para una fase, la pose se compara contra ellos antes de darla por buena. Lo que no tenga referencia se anota como estimación en `HANDOFF.md`.

## Comandos

```bash
FAST=1 ./build.sh ventura      # un personaje, sin hojas de poses
./build.sh                     # los dos, con hojas de poses de costado y de frente
.venv/bin/python blender/pose_only.py ventura   # solo poses, sobre out/ventura/s3b.blend (iteración rápida)
node tools/check_viewer.mjs    # prueba del visor: consola, 404, fps y capturas en out/viewer/
node tools/sim_test.mjs        # núcleo del juego, sin navegador (pocos segundos)
node tools/check_game.mjs      # juega una partida completa en juego.html por teclado y por toques; no pide GPU
cd web && python3 -m http.server 8000   # visor en /index.html, juego en /juego.html
```

Líneas a mirar en la salida del build:

- `POSE ...` una por fase, con torso, barra, cadera y las tres holguras en cm.
- `rack ...` posición de barra, codo y muñeca que encontró la búsqueda del rack.
- `CHK ... cuadros con superposición: N` y debajo las líneas `BAD`.
- `TRAJ ...` una por segmento: amplitud de la S, velocidades y aceleraciones de la barra.

Un solo proceso de Blender a la vez: en paralelo la máquina se satura y cada paso tarda diez veces más.

## Reglas del juego (web/js/sim y web/js/game)

- **El resultado lo calcula el núcleo.** `web/js/sim/` es una función pura de lo que el jugador tocó: solo enteros, sin reloj, sin DOM y sin three.js. `tools/sim_test.mjs` rechaza cualquier otra cosa. La presentación (`web/js/game/`) nunca decide un resultado.
- **`web/data/sim.json` no se edita a mano**: lo escribe `tools/build_sim_data.mjs` y lleva huella. Cambiar reglas, balance o datos cambia la versión o la huella; si el cambio es intencional, `node tools/sim_test.mjs --update` reescribe las partidas de referencia.
- **Los números de balance se ajustan con `tools/balance.mjs`**, contra las metas de docs/JUEGO.md (sección 9.7), no a ojo.
- **El visor sigue siendo el visor.** Todo cambio en un archivo compartido de `web/js/` es una opción nueva que `index.html` no usa.

## Convenciones del código de Blender

- Ejes de Blender: X lateral (izquierda del personaje en +X), -Y es el frente, Z arriba.
- Unidades en metros. `K` escala las constantes pensadas para 1,69 m a la estatura del personaje.
- `poses.py` se ejecuta con `exec` dentro de `finish.py` y usa sus variables (`b`, `rig`, `K`, `NAME`, `STY`, `OUT`).
