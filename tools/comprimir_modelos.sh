#!/usr/bin/env bash
# Comprime los modelos de web/models (geometría con meshopt, texturas a 1024 en WebP/JPEG para el juego, máscaras en WebP).
# Hay que correrlo cada vez que tools/export_web.py escribe web/models (build.sh lo hace solo al final).
#   tools/comprimir_modelos.sh [ventura brenner] [--forzar]
# Las dependencias (sharp y meshoptimizer, versiones fijas) se instalan una vez en TARIMA_GLTF_MODULES (por defecto
# ~/.cache/tarima-comprimir), fuera del repo: no van en package.json porque las pruebas no las usan.
# Detalle de qué se comprime y qué no: el encabezado de tools/comprimir_modelos.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
DEPS="${TARIMA_GLTF_MODULES:-$HOME/.cache/tarima-comprimir}"
if [ ! -d "$DEPS/node_modules/sharp" ] || [ ! -d "$DEPS/node_modules/meshoptimizer" ]; then
  echo "instalando sharp y meshoptimizer en $DEPS"
  mkdir -p "$DEPS"; [ -f "$DEPS/package.json" ] || echo '{"private":true}' > "$DEPS/package.json"
  npm install --prefix "$DEPS" --no-audit --no-fund --loglevel=error sharp@0.35.5 meshoptimizer@1.2.0
fi
TARIMA_GLTF_MODULES="$DEPS/node_modules" exec node tools/comprimir_modelos.mjs "$@"
