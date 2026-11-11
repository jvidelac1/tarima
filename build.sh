#!/usr/bin/env bash
# Punto de entrada único: reconstruye los personajes de punta a punta y los deja en web/.
#   ./build.sh [ventura brenner]
# Pasos, en serie y por personaje:
#   1. blender/make.py    cuerpo, rig y horneado de mapas (maps.npz, s3.blend)
#   2. blender/finish.py  texturas (blender/tex.py, dentro del mismo proceso), pelo, pestañas, zapatillas, cinturón,
#                         correctivos, poses (blender/poses.py), check() y GLB
#   3. tools/export_web.py  GLB reempaquetado, máscara y web/data/poses.json
# Variables:
#   FAST=1            saltea las hojas de poses de costado y de frente (los renders de control de WANT se hacen igual)
#   TARIMA_OUT=dir    carpeta de salida (por defecto out/)
#   TARIMA_THREADS=6  tope de hilos de CPU (Cycles y BLAS); por defecto 6, o la cantidad de núcleos si hay menos
#   TARIMA_GPU=0      renders de control en CPU (por defecto GPU si hay: Metal en Mac, OptiX/CUDA/HIP/oneAPI en Linux; sin GPU cae a CPU)
#   EXPORT_BAD=1      exporta a web/ aunque check() haya dado cuadros BAD (por defecto no pisa web/ y sale con error)
# La salida completa de cada paso queda en <salida>/<nombre>/make.log y finish.log; por pantalla van las líneas clave.
set -uo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"; [ -z "${PYTHON:-}" ] && [ -x .venv/bin/python ] && PY=.venv/bin/python
NAMES=("$@"); [ ${#NAMES[@]} -eq 0 ] && NAMES=(ventura brenner)
OUTR="${TARIMA_OUT:-out}"
# Con menos de 6 núcleos no se piden más hilos que núcleos. nproc cuenta los asignados al proceso (en un contenedor de 4 vCPU
# getconf y os.cpu_count() devuelven los del anfitrión); en macOS no está y se usa getconf.
NCPU="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 6)"
export TARIMA_THREADS="${TARIMA_THREADS:-$(( NCPU < 6 ? NCPU : 6 ))}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-$TARIMA_THREADS}" VECLIB_MAXIMUM_THREADS="${VECLIB_MAXIMUM_THREADS:-$TARIMA_THREADS}"
KEY='MEASURE|RADII|SKEL|GRIP|POSE|rack|TRAJ|UNION|PUSH|CHK|BAD|HAIR|LASH|GLB|CYCLES|BAKE dispositivo|MAPS|TEX |Error|ERROR|Traceback|^ +File "|Exception|SystemExit|No encuentro|Definí'

# Nunca más de un Blender a la vez: si hay otro proceso de blender/*.py, se espera.
while pgrep -f "blender/(make|finish|pose_only|ctl[0-9]*)\.py" >/dev/null 2>&1; do echo "== hay otro proceso de Blender corriendo: espero 30 s =="; sleep 30; done

step() {   # step <nombre> <log> <script> : corre un paso, guarda todo en el log y muestra las líneas clave
  local n="$1" log="$2" script="$3" t0=$SECONDS rc
  "$PY" "$script" "$n" 2>&1 | tee "$log" | grep --line-buffered -E "$KEY"
  rc=${PIPESTATUS[0]}
  echo "   ($script $n: $(( (SECONDS-t0)/60 )) min $(( (SECONDS-t0)%60 )) s, código $rc)"
  return "$rc"
}

FAIL=0; SUMMARY=()
for n in "${NAMES[@]}"; do
  mkdir -p "$OUTR/$n"
  echo "== $n: cuerpo, rig y mapas =="
  if ! step "$n" "$OUTR/$n/make.log" blender/make.py; then echo "ERROR $n: make.py falló (ver $OUTR/$n/make.log)"; FAIL=1; SUMMARY+=("CHK $n cuadros con superposición: sin dato (make.py falló)"); continue; fi
  echo "== $n: texturas, zapatillas, poses y GLB =="
  if ! step "$n" "$OUTR/$n/finish.log" blender/finish.py; then echo "ERROR $n: finish.py falló (ver $OUTR/$n/finish.log)"; FAIL=1; fi
  # La línea final de check(): 'CHK <nombre> cuadros con superposición: N'
  N=$(grep -aE "^CHK $n cuadros con superposición: [0-9]+" "$OUTR/$n/finish.log" | tail -1 | sed -E 's/^CHK [^ ]+ cuadros con superposición: ([0-9]+).*/\1/')
  if [ -z "$N" ]; then SUMMARY+=("CHK $n cuadros con superposición: sin dato (no se llegó a check())"); FAIL=1
  else SUMMARY+=("CHK $n cuadros con superposición: $N"); [ "$N" -ne 0 ] && FAIL=1; fi
  [ -s "$OUTR/$n/$n.glb" ] || { echo "ERROR $n: no se exportó $OUTR/$n/$n.glb"; FAIL=1; }
done

echo "== resumen =="
for l in "${SUMMARY[@]}"; do echo "$l"; done
if [ "$FAIL" -ne 0 ] && [ "${EXPORT_BAD:-}" != "1" ]; then
  echo "ERROR build con fallas o cuadros BAD: no se exporta a web/ (EXPORT_BAD=1 para exportar igual)"; exit 1
fi
echo "== export a web/ =="
"$PY" tools/export_web.py "${NAMES[@]}" || { echo "ERROR export_web.py falló"; exit 1; }
exit "$FAIL"
