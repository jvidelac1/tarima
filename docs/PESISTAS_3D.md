# Pesistas 3D: instructivo para agentes

Para quien venga a trabajar sobre los pesistas (cuerpo, cara, ropa, animación) dentro del juego. Leé también `AGENTS.md`
(reglas del repo) y `HANDOFF.md` (el pipeline de Blender). Estado al 26 de noviembre de 2026.

## 1. Qué hay

Hay dos pesistas en el juego y los dos salen del mismo GLB (`web/models/<nombre>.glb`, MakeHuman armado por script en Blender):

| | El de siempre | El nuevo («humano») |
|---|---|---|
| Entra por | `Athlete.load` (`web/js/athlete.js`) | `createDigitalHuman` (`web/js/character.js`), que llama a `Athlete.load` y trabaja encima |
| Modelos | todos los del plantel | solo `ventura` y `brenner` (`HUMANOS`, en `web/js/game/stage.js`) |
| Se prende | `?humano=0` (queda recordado en el navegador) | por defecto (`PESISTA_NUEVO_PUBLICADO`, `web/js/game/main.js`); `?humano=1` lo vuelve a prender |
| Si falla al armarse | — | vuelve solo al de siempre (`Escena#cargar`), con un aviso en consola |

Marangi usa el modelo de Brenner: comparte cuerpo y cara.

## 2. Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `web/js/character.js` | Arma el pesista nuevo: carga cara, tela y pies, esculpe el cuerpo, corta la malla y las rodilleras, ajusta el cinturón, arma los niveles de detalle. Deja `athlete.body`, `suit`, `sleeves`, `belt`, `setKit(color)` y `msArmado` (ms por paso) |
| `web/js/physique.js` | `sculptAthlete`: músculos y formas de la cara como morph targets sobre el cuerpo (`pump`, `breath`, `brace`, `openJaw`, `relief`, `disappointment`, `scapulaL/R`, `armLevelL/R`, `elbowL/R`, `bladeSlide*`, `bladeTurn*`) |
| `web/js/singlet.js` | `tailorSinglet`: corta la malla (y las rodilleras) sobre el cuerpo en reposo, con sus propias formas (`drape`, `compression`, `settle`) y el sombreador de la tela. El color sale del uniform `kit` |
| `web/js/portrait.js` | Proyecta la foto de la cara (frente y perfil) sobre la cabeza y saca de ahí el tono y el poro de la piel |
| `web/js/belt.js`, `feet.js` | Cinturón sobre la malla terminada; pies descalzos bajo las rodilleras |
| `web/js/landmarks.js` | Puntos del cuerpo en reposo por modelo (hombro, cuello, cadera, rodilla, ojo, labio), en ejes de Blender. **Atados a la malla del GLB**: si cambia el cuerpo, hay que volver a exportarlos |
| `web/js/game/actuacion.js` | Anatomía por cuadro dentro del juego: `actuar(a, {t, esfuerzo, agitado, alivio, bronca, altura})` mueve las formas del cuerpo y las copia a la malla y al cinturón |
| `web/js/game/stage.js` | `Escena#cargar` (elige pesista), `mostrar` (aspecto y `setKit`), `posar` y `posarMezcla` (llaman a `actuar`) |
| `web/js/game/caida.js`, `effort.js` | Caídas, festejo, bronca y temblor. Son del juego, valen para los dos pesistas |
| `web/models/appearance/` | `<nombre>-face.webp` (cara: frente a la izquierda, perfil a la derecha, 2:1) y `stretch-*.webp` (tela, CC0 de Poly Haven) |
| `web/models/barefoot/` | `<nombre>.bin` (pies) y `<nombre>-skin.webp` |
| `blender/barefoot.py` | Exporta los pies a JSON desde `out/<nombre>/s3.blend`; después `node tools/pies_bin.mjs` los pasa a `.bin` |

El visor de anatomía donde nació el pesista nuevo (posturas A y T, secuencia sin barra, caídas propias: `performance.js`,
`study.js`, `attempt.js`) **no está en este repo**: quedó sin commitear en la copia de trabajo de Juan
(`~/Desktop/tarima`, rama `linux`). Si lo necesitás, pedíselo a Juan antes de reescribirlo.

## 3. Reglas que no se rompen

1. **Personajes ficticios.** Ninguna cara, nombre, tatuaje, bandera ni uniforme de una persona o un país reales. Las caras
   de hoy son provisorias (decisión de Juan del 26-nov) y se van a reemplazar. La malla no lleva banderas: toma el color
   del pesista con `setKit`.
1. **Un solo esqueleto:** 52 huesos con nombres Mixamo más `Bar`. No se renombran.
2. **Nada de descargas, compras ni cuentas sin permiso de Juan.** Las texturas tienen que ser CC0 y anotarse acá.
3. **El núcleo no se toca desde gráficos** (`web/js/sim/`): el servidor rehace cada final con ese código. Lo que necesites
   del núcleo se lee (por ejemplo `Intento#aviso`: riesgo de caída, de solo lectura).
4. **El de siempre tiene que seguir andando**: es el respaldo si lo nuevo falla.
5. **Merge y publicación solo con el OK de Juan**, por PR.

## 4. Cómo se trabaja

```bash
cd web && python3 -m http.server 8060          # el juego en http://127.0.0.1:8060/juego.html
# fotos de control dentro del juego (17 tomas: parado, 3/4, cara, torso, arriba, jurado…)
node tools/banco.mjs --fotos=/tmp/fotos --niveles=alta --pesista=ventura
# una final completa con el pesista nuevo, dibujando (teclado o toques)
node tools/check_game.mjs --only=teclado --dibujo
node tools/check_game.mjs --only=tactil --dibujo
# las escenas del final (caídas y bajadas) cuadro por cuadro
node tools/check_escenas.mjs
```

- El final de un intento se puede posar a mano: `JUEGO.test.final({id, lev, seg, fase, mov, res, camara})` y
  `JUEGO.test.finalEn(t, true)` (ver `tools/check_escenas.mjs`). Sirve para fotografiar festejo, bronca y caídas.
- `JUEGO.msPesista` dice cuánto tardó cada paso del armado. `JUEGO.E.msModelos`, cuándo quedaron listos los pesistas.
- Mirá siempre el resultado en una captura antes de darlo por bueno, con la cámara del juego y de cerca.

## 5. Presupuesto

| Qué | Hoy | No pasar de |
|---|---|---|
| Armado del pesista nuevo (encima de cargar el GLB), en una M1 Pro | ~1 s por pesista (esculpir 0,5 s, malla 0,2 s) | 1,5 s |
| Descarga propia del pesista nuevo (los dos) | 1,8 MB | 2,5 MB |
| Un cuadro en Media, M1 Pro a 1,47 MP | 12,6 ms | 16,6 ms |

Falta medir en un teléfono real. Con el procesador a un cuarto, los pesistas quedan listos a los 6,2 s (4,2 s con el de
siempre). El menú tarda 3,2 s en responder con cualquiera de los dos, porque antes se arma la escena (`new Escena`).

## 6. Trampas ya pisadas

- **El índice de cada malla trae dos niveles seguidos** (completo y simplificado; `buildLod`). Quien recorra triángulos
  tiene que parar en `geometry.userData.lod.full[1]`, y toda malla nueva tiene que fijar su `setDrawRange`, o se dibujan
  los dos niveles a la vez.
- **Las prendas se simplifican con el borde trabado** (`buildLod(malla, false, true)`), o el escote y la sisa se comen.
- **El banco de fotos fuerza el nivel simplificado** (`escena.lodFijo`): un defecto que solo se ve ahí puede ser del
  nivel de detalle y no de la malla.
- **Las formas del cuerpo hay que copiarlas a la malla y al cinturón en cada cuadro** (`actuar`), o la piel atraviesa la tela.
- **La malla fina va de una sola capa.** La pared de grosor del borde (solo queda en las rodilleras) se veía como dientes
  de sierra oscuros bajo la sisa con el brazo arriba: no era la geometría (en color plano cubría perfecto) sino esos
  triángulos de canto, estirados. Para diagnosticar algo así: `JUEGO.test.escena.activo.suit.material = new
  MeshBasicMaterial(...)` y mirar si el defecto sigue.
- **`fitBelt` busca por rayos**: los triángulos de la cintura van repartidos por sector de ángulo (`waistSurface`). Sin
  eso tardaba un segundo por pesista.
- **`?pesista=` ya existe** (elige el pesista en el banco): por eso el interruptor se llama `?humano=`.
- **Los colores de three se dan en sRGB** (`color.set('#rrggbb')` ya convierte); no convertir dos veces.

## 7. Defectos conocidos y lo que sigue

2. Todos los pesistas que comparten modelo comparten cara: falta una cara por pesista (y caras definitivas, ficticias).
3. Solo Ventura y Brenner tienen pesista nuevo: los demás modelos del plantel necesitan sus `landmarks`, cara y pies.
4. Manos: cuelgan rígidas en reposo (el visor tenía una pose de mano relajada en `performance.js`, sin portar).
5. Medir carga y cuadros en un teléfono real.
6. Pendiente de gráficos, en el PR #9 (`docs/GRAFICOS_PLAN.md`): la barra que «se le va» en las manos antes de caer,
   pieles como datos, poses de referencia T y A.
