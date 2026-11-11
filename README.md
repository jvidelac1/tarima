# Tarima

Prototipo de un juego web de halterofilia: dos levantadores ficticios generados por script en Blender, con arranque y dos tiempos resueltos fase por fase sobre cada esqueleto.

El estado del trabajo, lo que está verificado y lo que falta está en [HANDOFF.md](HANDOFF.md).

## Ver el visor

Los modelos ya están exportados en `web/models/`, no hace falta Blender para mirar.

```bash
cd web
python3 -m http.server 8000
# abrir http://localhost:8000
```

Tiene que ser por servidor local: abriendo `index.html` directo, el navegador bloquea la carga de los GLB.

## Reconstruir los personajes

1. Dependencias de Python (3.13, que es la versión del módulo `bpy` 5.2):

   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. MPFB, el generador de humanos de MakeHuman:

   ```bash
   git clone --depth 1 https://github.com/makehumancommunity/mpfb2.git vendor/mpfb2
   ```

   Si lo tenés en otro lado, apuntá `MPFB_SRC` a la carpeta `src/mpfb`.

3. Build:

   ```bash
   ./build.sh                 # los dos personajes
   ./build.sh ventura         # uno solo
   FAST=1 ./build.sh ventura  # sin la hoja de poses de costado
   ```

   Cada personaje tarda unos minutos en CPU. Deja todo en `out/<nombre>/` y copia el GLB y los datos a `web/`.

Si el script de texturas no encuentra una tipografía en negrita, definí `TARIMA_FONT` con la ruta a un `.ttf`.

## Estructura

```
blender/
  common.py   arranque de Blender + MPFB, render de control
  body.py     proporciones y físico de cada personaje (CFG)
  make.py     cuerpo, rig y horneado de mapas de apoyo
  finish.py   texturas, ojos, zapatillas; llama a poses.py y exporta el GLB
  poses.py    sistema de poses por reglas y chequeo de superposiciones
tools/
  export_web.py   copia GLB y datos de poses al visor
web/
  index.html      visor (three.js)
  models/         GLB exportados
  data/poses.json fases y medidas que muestra el visor
docs/img/         renders de control de la última corrida
```

## Licencias de terceros

- MPFB: código GPL-3.0, assets CC0. No está incluido en el repo, se clona aparte.
- Los personajes generados con los assets CC0 de MakeHuman no arrastran restricciones.
