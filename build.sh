#!/usr/bin/env bash
# Reconstruye los personajes: ./build.sh [ventura brenner]
# FAST=1 saltea la hoja de poses de costado (los renders de control de WANT se hacen igual).
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
NAMES=("$@"); [ ${#NAMES[@]} -eq 0 ] && NAMES=(ventura brenner)
for n in "${NAMES[@]}"; do
  echo "== $n: cuerpo, rig y mapas =="
  "$PY" blender/make.py "$n" 2>&1 | grep -E "MEASURE|Error|Traceback|line " || true
  echo "== $n: texturas, zapatillas, poses y GLB =="
  "$PY" blender/finish.py "$n" 2>&1 | grep -E "RADII|SKEL|GRIP|POSE|rack|CHK|BAD|GLB|Error|Traceback|line " || true
done
"$PY" tools/export_web.py "${NAMES[@]}"
