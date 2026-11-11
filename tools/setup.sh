#!/usr/bin/env bash
# Prepara una máquina nueva para construir Tarima y probar el visor. Uso: tools/setup.sh
# Probado en macOS con Apple silicon y en Ubuntu 22.04 x86_64 sin pantalla ni GPU (pod alquilado, como root).
#   macOS: no instala paquetes del sistema; si falta algo, dice qué instalar y sale.
#   Linux: como root instala por apt las bibliotecas que necesita el módulo bpy sin pantalla, las tipografías, Node 22
#          (binario oficial de nodejs.org, con suma verificada), uv (instalador oficial) y Google Chrome (.deb oficial).
#          Sin root (o sin apt) no instala nada: dice qué falta y sale.
# Variables que respeta: CHROME_PATH (navegador de la prueba del visor) y TARIMA_FONT (.ttf en negrita para las texturas).
set -euo pipefail
cd "$(dirname "$0")/.."
OS="$(uname -s)"; ARCH="$(uname -m)"
ES_ROOT=0; [ "$(id -u)" = 0 ] && ES_ROOT=1
PUEDE_APT=0; [ "$OS" = Linux ] && [ "$ES_ROOT" = 1 ] && command -v apt-get >/dev/null && PUEDE_APT=1
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; }
chrome_path() {   # primer navegador que exista: CHROME_PATH, y después las rutas habituales de cada sistema
  local c
  for c in "${CHROME_PATH:-}" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}
font_path() {     # mismo orden que blender/finish.py
  local f
  for f in "${TARIMA_FONT:-}" "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf" "/System/Library/Fonts/Supplemental/Arial Bold.ttf" "/Library/Fonts/Arial Bold.ttf" "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"; do
    [ -n "$f" ] && [ -f "$f" ] && { echo "$f"; return 0; }
  done
  return 1
}

if [ "$OS" = Linux ]; then
  echo "== Paquetes del sistema (Linux $ARCH) =="
  # Lo que carga bpy 5.2 al importarse sin pantalla (ldd de bpy/__init__.so) más EGL y Xxf86vm, que abre al pedir un contexto
  # gráfico; tipografías para las texturas (Liberation Sans Bold tiene las mismas métricas que Arial Bold) y para las
  # hojas de poses (DejaVu); procps trae pgrep, que usa build.sh para no correr dos Blender a la vez.
  APT=(ca-certificates curl xz-utils git procps libgl1 libegl1 libx11-6 libxext6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libsm6 libice6 libxkbcommon0 fonts-dejavu-core fonts-liberation)
  if command -v dpkg-query >/dev/null; then
    FALTA_APT=()
    for p in "${APT[@]}"; do dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || FALTA_APT+=("$p"); done
    if [ ${#FALTA_APT[@]} -gt 0 ]; then
      if [ "$PUEDE_APT" = 1 ]; then
        echo "Instalo: ${FALTA_APT[*]}"
        apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${FALTA_APT[@]}"
      else
        echo "Faltan paquetes del sistema. Como root:"; echo "  apt-get update && apt-get install -y ${FALTA_APT[*]}"; exit 1
      fi
    else echo "ok (${#APT[@]} paquetes)"; fi
  else
    echo "AVISO: no es una distribución con apt. Hacen falta los equivalentes de: ${APT[*]}"
  fi
  if ! command -v uv >/dev/null && [ "$ES_ROOT" = 1 ]; then
    echo "== uv (instalador oficial, en /usr/local/bin) =="
    curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
  fi
  if ! node_ok && [ "$ES_ROOT" = 1 ]; then
    echo "== Node 22 (binario oficial de nodejs.org, en /usr/local) =="
    case "$ARCH" in x86_64) NA=x64 ;; aarch64|arm64) NA=arm64 ;; *) echo "No hay binario de Node previsto para $ARCH: instalá Node 20 o superior a mano."; exit 1 ;; esac
    TMP="$(mktemp -d)"
    curl -fsSL -o "$TMP/SHASUMS256.txt" https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
    TAR="$(awk -v a="linux-$NA.tar.xz" '$2 ~ a"$" {print $2}' "$TMP/SHASUMS256.txt" | head -1)"
    [ -n "$TAR" ] || { echo "No encuentro el binario de Node para linux-$NA en nodejs.org"; exit 1; }
    curl -fsSL -o "$TMP/$TAR" "https://nodejs.org/dist/latest-v22.x/$TAR"
    (cd "$TMP" && grep " $TAR\$" SHASUMS256.txt | sha256sum -c -)
    tar -xJf "$TMP/$TAR" -C /usr/local --strip-components=1 --no-same-owner
    rm -rf "$TMP"; hash -r
  fi
fi

faltan=()
command -v git >/dev/null || faltan+=("git")
command -v uv  >/dev/null || faltan+=("uv (macOS: brew install uv; Linux: curl -LsSf https://astral.sh/uv/install.sh | sh)")
node_ok                   || faltan+=("node 20 o superior (macOS: brew install node; Linux: binario de nodejs.org o NodeSource)")
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

if [ "$OS" = Linux ] && ! chrome_path >/dev/null; then
  if [ "$PUEDE_APT" = 1 ] && [ "$ARCH" = x86_64 ]; then
    echo "== Google Chrome (.deb oficial) =="
    TMP="$(mktemp -d)"
    curl -fsSL -o "$TMP/chrome.deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$TMP/chrome.deb"
    rm -rf "$TMP"
  fi
fi

echo "== Verificaciones =="
if CHROME="$(chrome_path)"; then echo "Chrome: $CHROME ($("$CHROME" --version 2>/dev/null || echo 'versión sin dato'))"
elif [ "$OS" = Darwin ]; then echo "AVISO: no encuentro Chrome. Instalalo (brew install --cask google-chrome) o definí CHROME_PATH."
else echo "AVISO: no encuentro Chrome ni Chromium. Instalá el .deb de Google (x86_64) o Chromium ('npx playwright-core install --with-deps chromium') y definí CHROME_PATH."; fi
if FONT="$(font_path)"; then echo "Tipografía: $FONT"
else echo "AVISO: definí TARIMA_FONT con la ruta a una .ttf en negrita (Linux: apt-get install fonts-liberation)."; fi
NCPU="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo '?')"
echo "CPU: $NCPU núcleos disponibles (build.sh usa hasta 6 hilos, o menos si hay menos núcleos; TARIMA_THREADS lo cambia)"

cat <<FIN

Listo. Siguiente:
  ./build.sh                    # los dos personajes (un solo build a la vez)
  node tools/check_viewer.mjs   # prueba del visor
  npm run serve                 # visor en http://localhost:8000
El build y la prueba encuentran solos estas rutas; para usar otras, exportá antes:
  export TARIMA_FONT="${FONT:-/ruta/a/una-negrita.ttf}"
  export CHROME_PATH="${CHROME:-/ruta/a/chrome}"
El estado del trabajo y los pendientes están en HANDOFF.md.
FIN
if [ "$OS" = Linux ]; then
  echo "En Linux sin GPU el build hornea y renderiza con Cycles en CPU, y la prueba del visor dibuja por software"
  echo "(SwiftShader): verifica lógica, consola, 404 y capturas, pero no mide fps. Ver la sección de Linux del README."
fi
