#!/usr/bin/env bash
# Prepara una máquina nueva para construir Tarima y probar el visor. Uso: tools/setup.sh
# Probado en macOS con Apple silicon. En Linux hace falta además TARIMA_FONT (una .ttf en negrita) y CHROME_PATH.
# No instala paquetes del sistema: si falta algo, dice qué instalar y sale.
set -euo pipefail
cd "$(dirname "$0")/.."

faltan=()
command -v git  >/dev/null || faltan+=("git")
command -v uv   >/dev/null || faltan+=("uv (macOS: brew install uv)")
command -v node >/dev/null || faltan+=("node 20 o superior (macOS: brew install node)")
if [ ${#faltan[@]} -gt 0 ]; then
  echo "Falta instalar:"; printf '  - %s\n' "${faltan[@]}"; exit 1
fi

echo "== Python 3.13 y bpy =="
[ -x .venv/bin/python ] || uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -c "import bpy; print('bpy', bpy.app.version_string)"

echo "== MPFB =="
[ -d vendor/mpfb2 ] || git clone --depth 1 https://github.com/makehumancommunity/mpfb2.git vendor/mpfb2

echo "== Dependencias de la prueba del visor =="
npm install --no-fund --no-audit

echo "== Verificaciones =="
CHROME="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ -x "$CHROME" ]; then echo "Chrome: ok"
else echo "AVISO: no encuentro Chrome en '$CHROME'. Instalalo (macOS: brew install --cask google-chrome) o definí CHROME_PATH."; fi
FONT_OK=0
for f in "${TARIMA_FONT:-}" "/System/Library/Fonts/Supplemental/Arial Bold.ttf" "/Library/Fonts/Arial Bold.ttf" "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"; do
  [ -n "$f" ] && [ -f "$f" ] && FONT_OK=1
done
[ "$FONT_OK" = 1 ] && echo "Tipografía: ok" || echo "AVISO: definí TARIMA_FONT con la ruta a una .ttf en negrita."

cat <<'FIN'

Listo. Siguiente:
  ./build.sh                    # los dos personajes (un solo build a la vez)
  node tools/check_viewer.mjs   # prueba del visor
  npm run serve                 # visor en http://localhost:8000
El estado del trabajo y los pendientes están en HANDOFF.md.
FIN
