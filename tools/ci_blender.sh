#!/usr/bin/env bash
# Prepara un runner de GitHub Actions (Ubuntu, sin pantalla ni placa) para correr blender/*.py con el módulo bpy.
# Lo llama .github/workflows/pesistas.yml después de actions/setup-python (3.13). No se usa en la Mac del dueño.
#   - bibliotecas que carga bpy sin pantalla y tipografías (las mismas que instala tools/setup.sh en un pod)
#   - .venv con requirements.txt (bpy, numpy, pillow)
#   - MPFB en vendor/mpfb2, fijo en MPFB_COMMIT si viene definido
set -euo pipefail
cd "$(dirname "$0")/.."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends libgl1 libegl1 libx11-6 libxext6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libsm6 libice6 libxkbcommon0 fonts-dejavu-core fonts-liberation procps
python3 --version
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -c "import bpy; print('bpy', bpy.app.version_string)"
if [ ! -d vendor/mpfb2 ]; then
  git clone -q https://github.com/makehumancommunity/mpfb2.git vendor/mpfb2
  [ -n "${MPFB_COMMIT:-}" ] && git -C vendor/mpfb2 checkout -q "$MPFB_COMMIT"
fi
echo "MPFB $(git -C vendor/mpfb2 log -1 --format='%H %cd')"
echo "CPU $(nproc) · RAM $(free -g | awk '/Mem/{print $2}') GB"
