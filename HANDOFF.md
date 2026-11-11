# Relevo — Tarima

Estado al 9 de noviembre de 2026. Este documento es para retomar el trabajo en local, con o sin agente.

## Qué es

Juego web de halterofilia. La prioridad acordada es el equilibrio entre calidad visual y veracidad del movimiento.

**Definition of done de esta etapa:** un personaje que haga un arranque y un dos tiempos bien pulidos. Recién después se arma el juego online.

**Camino elegido:** 3D en tiempo real con assets (GLB) hechos in house, generados por script con Blender sin interfaz. No se usa likeness de atletas reales: los dos personajes son ficticios.

## Qué hay hoy

| Pieza | Dónde | Estado |
|---|---|---|
| Dos personajes riggeados (GLB) | `web/models/` | Funcionan. Calidad visual: floja (ver abajo) |
| Generador de cuerpo y rig | `blender/body.py`, `blender/make.py` | Estable |
| Texturas, ojos, zapatillas | `blender/finish.py` | Estable, calidad básica |
| Sistema de poses por reglas | `blender/poses.py` | Funciona; posiciones sin validar contra video |
| Visor | `web/index.html` | Funciona |

### Los dos biotipos

| | Ventura (compacto) | Brenner (largo) |
|---|---|---|
| Estatura | 1,70 m | 1,83 m |
| Fémur / estatura | 23% | 26% |
| Tibia / estatura | 24% | 25% |
| Brazo (hombro a muñeca) / estatura | 31% | 33% |
| Agarre de cargada | 0,53 m | 0,56 m |
| Agarre de arranque | 1,05 m | 1,13 m |

Referencias pedidas: Ventura sigue el biotipo de Yeison López y Tian Tao (fémur corto, brazos cortos); Brenner, el de Karlos Nasar (fémur largo, brazos algo más largos). Las estaturas salen de fichas públicas (Tian Tao 1,73 m, Nasar 1,83 m). Las proporciones de segmentos **no están publicadas**: son una estimación a partir de esa descripción.

### Secuencias que existen

- `clean`: parado, salida, primer tirón, segundo tirón, triple extensión, bajada, recepción, recuperación.
- `split`, `power`, `squat`: tres enviones que arrancan desde la recuperación (dip, empuje, recepción según estilo, final).
- `snatch`: las mismas ocho fases del arranque.

Entre fase y fase hay 6 cuadros intermedios resueltos, no interpolados a ciegas.

## Cómo funciona el sistema de poses

No hay rotaciones puestas a mano. Cada fase es una tarea (cadera, torso, manos, pies) que se resuelve sobre el esqueleto real de cada personaje, por eso el mismo set de reglas da posiciones distintas en cada biotipo.

Reglas duras que hoy se cumplen:

1. **Pies sobre la tarima.** El talón se levanta girando sobre el metatarso (`ankle_of`).
2. **La barra toca el cuerpo y no lo atraviesa.** En la salida se apoya en la tibia, en el primer tirón roza la rodilla, en el segundo tirón el muslo o la cadera (`bar_clear`, modos `floor` y `hang` de `solve`).
3. **Brazos rectos mientras la barra cuelga**, hasta la triple extensión.
4. **Brazos por fuera de las rodillas.** El agarre de cargada se ensancha lo mínimo necesario.
5. **Codos y rodillas doblan en su plano** (`twist_to`): el hueso gira sobre su eje hasta alinear la bisagra.
6. **Rack:** la barra se apoya sobre la malla real (hombros y garganta) por raycast (`rack_bar`), y se busca la muñeca y el codo dentro de límites articulares (`rack_arms`).

`check()` mide superposiciones con cápsulas en cada cuadro exportado: brazo contra pierna, barra contra cuerpo, pie contra tarima. La última corrida dio 0 cuadros malos en Brenner y 1 en Ventura (la tibia roza la barra 1 cm mientras baja a la salida).

### Dónde tocar cada cosa

- Proporciones y físico: `CFG` en `blender/body.py`.
- Colores, nombre, indumentaria: `STY` en `blender/finish.py`.
- Ángulos de cada fase: `clean_pull()` y `seqs()` en `blender/poses.py`.
- Renders de control: `WANT` y `VIEWS` en `blender/poses.py`. Salen en `out/<nombre>/diag.png`.
- Duración de cada fase en el visor: `DUR` en `web/index.html`.

## Qué está verificado y qué no

**Verificado**
- El pipeline corre de punta a punta y exporta los dos GLB.
- El visor carga, cambia de personaje, de levantamiento y de estilo de envión.
- Las superposiciones se miden por número, no a ojo.

**Sin verificar**
- **Nada se comparó contra video real.** El entorno donde se armó esto no tenía navegador ni acceso a YouTube. Los ángulos de cada fase salen de criterio general y de texto técnico (Catalyst Athletics), no de cuadros de referencia.
- El ritmo de la reproducción (`DUR`) es estimado y no se vio a velocidad real.
- El squat jerk y el power jerk se armaron con las mismas reglas, sin referencia visual.

## Problemas conocidos

Ordenados por cuánto se notan.

1. **Rack de la cargada con codos bajos.** Quedan unos 13 cm por debajo del hombro. Parece más un rack de envión que la recepción de una cargada de élite. Geométricamente, con la barra donde apoya la malla, subir el codo lo mete hacia el centro del pecho. Probablemente falta más protracción de hombro o tomar la barra con la punta de los dedos.
2. **Pulgar parado** en el rack y en el empuje.
3. **Hombros y axilas se deforman** con los brazos arriba. Es el skinning lineal de MPFB con pesos Mixamo; no se tocó.
4. **Calidad visual general.** Texturas de color plano sin mapas de relieve, iluminación básica, sin post-proceso. Las zapatillas son un volumen simple.
5. **Sin hook grip.** El agarre es un cierre genérico de dedos.
6. **Trayectoria de barra recta entre fases.** No hay curva en S ni velocidades reales.
7. **Bajada** (el pase por debajo de la barra) es una sola pose tipo "espantapájaros"; es la fase menos trabajada.
8. **La barra todavía no flexiona** en este visor. El whip estaba en el primer prototipo procedural, que no está en este repo.

## Próximos pasos sugeridos

1. **Conseguir referencia visual.** Dos o tres videos en cámara lenta, de costado y de frente, de buena calidad. Sacar un cuadro por fase y compararlo contra `out/<nombre>/diag.png`. Sin esto, cualquier ajuste de ángulos es estimación.
2. **Pasada visual.** Mapas de relieve y rugosidad para piel y tela, oclusión, entorno con reflejos, post-proceso (profundidad de campo, bloom, corrección de color). Actualizar three.js: el visor usa r128 por compatibilidad con el entorno anterior.
3. **Rack y manos.** Resolver el punto 1 y 2 de problemas conocidos con la referencia en mano.
4. **Curvas de movimiento.** Reemplazar la interpolación lineal por curvas con la velocidad real de cada fase y la trayectoria de la barra.
5. **Recién ahí, gameplay.** Input de timing, fallos, barra con whip.

## Decisiones tomadas en el camino

- Se descartó el personaje hecho con primitivas por código: el techo de calidad era bajo.
- Se descartó pre-renderizado (sin cámara libre ni pesos variables) y video generado por IA (sin consistencia de personaje ni de técnica).
- Mocap desde video quedó pendiente: en el entorno anterior no había GPU ni acceso a video.
- Esqueleto único con nombres Mixamo (52 huesos) más un hueso `Bar` para la barra, así nunca se desfasa de las manos.
