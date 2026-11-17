#!/bin/bash
# Vista previa en la pose y las vistas de la lámina, y la comparación figura contra figura (tools/cuerpo/igual.py).
#   tools/cuerpo/igual.sh [calidad] [salida.jpg] [tabla.txt]
set -e; cd "$(dirname "$0")/../.."; D="${TMPDIR_CUERPO:-$HOME/tarima-datos/tmp/cuerpo}"; mkdir -p "$D"
node tools/cuerpo/vista.mjs --ficha=lamina --poses=lamina --calidad="${1:-media}" --vistas=28,208 --alto=1000 --fondo=.84,.83,.855 --out="$D/lam.png" | head -1
python3 tools/cuerpo/igual.py "$HOME/tarima-datos/ver_visual/ref_dueno/opcion-web-realismo-simplificado.webp" "$D/lam.png" "${2:-$D/igual.jpg}" ${3:+"$3"}
