#!/usr/bin/env bash
# Instala ComfyUI v0.45.0 en /opt/comfy y baja los pesos de la etapa 2 (E5 y E6), en un entorno aparte del .venv de Blender.
# ESTE SCRIPT NO SE EJECUTÓ: está escrito y pasa `bash -n`. Bajar cosas al pod necesita el permiso del usuario.
# (El 11-nov-2026 el pod ya tenía una instalación equivalente en /opt/comfy, hecha con /opt/comfy/instalar.sh; las rutas dentro
# de cada repo, las carpetas de destino y los tamaños en bytes de la tabla de abajo se leyeron de esa instalación. Sobre un pod
# así, este script no vuelve a bajar nada: cada archivo con el tamaño esperado se saltea.)
#
# Uso (en el pod, como root; necesita uv, git y curl):
#   tools/arte_instalar.sh comfy          entorno Python 3.13, ComfyUI v0.45.0 (v0.44.0 si no existe la etiqueta) y PyTorch cu130   (unos 8 GB)
#   tools/arte_instalar.sh qwen           pesos de E5: Qwen-Image-Edit-2511 int8, codificador de texto y VAE                        (30,1 GB)
#   tools/arte_instalar.sh 3d             pesos de E6: Pixal3D de una vista y multivista, TRELLIS.2, VAE, DINOv3, MoGe y BiRefNet    (20,8 GB)
#   tools/arte_instalar.sh todo           las tres cosas, en ese orden
#   tools/arte_instalar.sh estado         qué hay instalado y bajado, con tamaños, y disco libre (no baja nada)
#   tools/arte_instalar.sh servidor       levanta ComfyUI en 127.0.0.1:8188 y espera a que responda (log en /opt/comfy/servidor.log)
#   tools/arte_instalar.sh parar          lo detiene
#   tools/arte_instalar.sh borrar-pesos   borra los .safetensors de /opt/comfy/ComfyUI/models (E9, antes de apagar el pod)
# Variables: COMFY_DIR (/opt/comfy) · COMFY_TAG (v0.45.0) · HF_TOKEN (opcional: los repos son públicos) · LICENCIAS (out/arte/licencias)
#
# Después: `node tools/comfy_run.mjs --sonda` comprueba nodos, plantillas y archivos de modelo.
# SUPUESTO: la etiqueta v0.45.0 y el índice cu130 de PyTorch siguen publicados; si la etiqueta no está se usa v0.44.0, como dice el plan.
# Licencias (resumen del plan): Qwen-Image-Edit-2511 Apache 2.0; Pixal3D y TRELLIS.2 MIT; DINOv3 con licencia propia de Meta (no
# redistribuir los pesos); MoGe y BiRefNet etiquetados MIT sin verificar en origen. Se guarda el README y el LICENSE de cada repo.
set -euo pipefail
DIR="${COMFY_DIR:-/opt/comfy}"; TAG="${COMFY_TAG:-v0.45.0}"; MOD="$DIR/ComfyUI/models"; URL="http://127.0.0.1:8188"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"; LIC="${LICENCIAS:-$RAIZ/out/arte/licencias}"

# repo | ruta dentro del repo | carpeta de models/ | bytes
PESOS_QWEN=(
  "Comfy-Org/Qwen-Image-Edit_ComfyUI|split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors|diffusion_models|20499083824"
  "Comfy-Org/Qwen-Image_ComfyUI|split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors|text_encoders|9384670680"
  "Comfy-Org/Qwen-Image_ComfyUI|split_files/vae/qwen_image_vae.safetensors|vae|253806246"
)
PESOS_3D=(
  "Comfy-Org/Pixal3D|diffusion_models/pixal3d_int8_convrot.safetensors|diffusion_models|5584555824"
  "Comfy-Org/Pixal3D|diffusion_models/pixal3d_multiview_int8_convrot.safetensors|diffusion_models|5584555824"
  "Comfy-Org/Pixal3D|vae/trellis_2_shape_vae_bf16.safetensors|vae|1095844024"
  "Comfy-Org/Pixal3D|vae/trellis_2_texture_vae_bf16.safetensors|vae|948461364"
  "Comfy-Org/Pixal3D|clip_vision/dino_v3_L_naf_fp32.safetensors|clip_vision|1215214176"
  "Comfy-Org/TRELLIS.2|diffusion_models/trellis_2_int8_convrot.safetensors|diffusion_models|5253048192"
  "Comfy-Org/MoGe|geometry_estimation/moge_2_vitl_normal_fp16.safetensors|geometry_estimation|661859924"
  "Comfy-Org/BiRefNet|background_removal/birefnet.safetensors|background_removal|444473596"
)

libre() { df -B1 --output=avail "$(dirname "$DIR")" | tail -1 | tr -d ' '; }
tam() { stat -c %s "$1" 2>/dev/null || echo 0; }
destino() { local repo ruta carpeta bytes; IFS='|' read -r repo ruta carpeta bytes <<< "$1"; echo "$MOD/$carpeta/$(basename "$ruta")"; }
# Bytes que faltan bajar de una lista, y corte si no entran en el disco con 3 GB de margen.
hay_lugar() {
  local falta=0 p bytes
  for p in "$@"; do bytes="${p##*|}"; [ "$(tam "$(destino "$p")")" = "$bytes" ] || falta=$((falta + bytes)); done
  local l; l=$(libre); echo "faltan $((falta / 1000000000)) GB por bajar · $((l / 1000000000)) GB libres en $(dirname "$DIR")"
  [ $((falta + 3000000000)) -le "$l" ] || { echo "ERROR no hay lugar: liberar disco o borrar pesos que ya no se usen (borrar-pesos)"; exit 1; }
}
bajar() {
  local repo ruta carpeta bytes; IFS='|' read -r repo ruta carpeta bytes <<< "$1"
  local dst; dst="$(destino "$1")"; local url="https://huggingface.co/$repo/resolve/main/$ruta"; local H=()
  [ -n "${HF_TOKEN:-}" ] && H=(-H "Authorization: Bearer $HF_TOKEN")
  mkdir -p "$(dirname "$dst")"
  if [ "$(tam "$dst")" = "$bytes" ]; then echo "ya está  $dst"; return 0; fi
  echo "bajando  $url"
  curl -fL --retry 5 --retry-delay 10 -C - ${H[@]+"${H[@]}"} -o "$dst.part" "$url" || { echo "ERROR al bajar $url"; return 1; }
  local n; n=$(tam "$dst.part")
  [ "$n" = "$bytes" ] || echo "AVISO $(basename "$dst"): $n bytes, se esperaban $bytes (¿cambió el archivo en el repo?)"
  mv "$dst.part" "$dst"; echo "ok       $dst ($((n / 1000000)) MB)"
}
licencias() {
  local p repo d f
  for p in "$@"; do
    repo="${p%%|*}"; d="$LIC/${repo//\//__}"; mkdir -p "$d"
    for f in README.md LICENSE LICENSE.md LICENSE.txt; do [ -s "$d/$f" ] || curl -fsSL -o "$d/$f" "https://huggingface.co/$repo/resolve/main/$f" 2>/dev/null || rm -f "$d/$f"; done
  done
  echo "licencias en $LIC"
}
pesos() { hay_lugar "$@"; local p mal=0; for p in "$@"; do bajar "$p" || mal=1; done; licencias "$@"; return $mal; }

comfy() {
  command -v uv >/dev/null || { echo "ERROR falta uv (lo instala tools/setup.sh)"; exit 1; }
  [ "$(libre)" -ge 10000000000 ] || { echo "ERROR hacen falta 10 GB libres para el entorno de ComfyUI"; exit 1; }
  mkdir -p "$DIR"; cd "$DIR"
  [ -d .venv ] || uv venv --python 3.13 .venv
  [ -d ComfyUI ] || git clone --depth 1 -b "$TAG" https://github.com/comfyanonymous/ComfyUI ComfyUI || git clone --depth 1 -b v0.44.0 https://github.com/comfyanonymous/ComfyUI ComfyUI
  uv pip install --python .venv/bin/python torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu130
  uv pip install --python .venv/bin/python -r ComfyUI/requirements.txt
  echo "ComfyUI $(git -C ComfyUI describe --tags 2>/dev/null || echo '?') en $DIR/ComfyUI"
  .venv/bin/python -c "import torch; print('torch', torch.__version__, '· CUDA', torch.cuda.is_available(), '·', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'sin GPU')"
}
estado() {
  echo "ComfyUI: $(git -C "$DIR/ComfyUI" describe --tags 2>/dev/null || echo 'no instalado') · entorno: $([ -x "$DIR/.venv/bin/python" ] && "$DIR/.venv/bin/python" -V 2>&1 || echo 'no hay')"
  local p d
  for p in "${PESOS_QWEN[@]}" "${PESOS_3D[@]}"; do d="$(destino "$p")"; if [ "$(tam "$d")" = "${p##*|}" ]; then echo "  ok     $d"; elif [ -f "$d" ]; then echo "  TAMAÑO $d ($(tam "$d") de ${p##*|} bytes)"; else echo "  FALTA  $d"; fi; done
  echo "disco libre: $(( $(libre) / 1000000000 )) GB · servidor: $(curl -fs -m 3 "$URL/system_stats" >/dev/null 2>&1 && echo "responde en $URL" || echo 'apagado')"
}
servidor() {
  if curl -fs -m 3 "$URL/system_stats" >/dev/null 2>&1; then echo "ComfyUI ya responde en $URL"; return 0; fi
  [ -x "$DIR/.venv/bin/python" ] || { echo "ERROR no está instalado: tools/arte_instalar.sh comfy"; exit 1; }
  ( cd "$DIR/ComfyUI" && exec setsid nohup ../.venv/bin/python main.py --listen 127.0.0.1 --port 8188 ) > "$DIR/servidor.log" 2>&1 < /dev/null &
  echo $! > "$DIR/servidor.pid"
  for _ in $(seq 1 90); do sleep 2; if curl -fs -m 3 "$URL/system_stats" >/dev/null 2>&1; then echo "ComfyUI responde en $URL (pid $(cat "$DIR/servidor.pid"), log $DIR/servidor.log)"; return 0; fi; done
  echo "ERROR ComfyUI no respondió en 3 minutos"; tail -20 "$DIR/servidor.log"; exit 1
}
parar() {
  local pids; pids="$( { cat "$DIR/servidor.pid" 2>/dev/null; pgrep -f 'main\.py --listen 127\.0\.0\.1 --port 8188' || true; } | sort -u | tr '\n' ' ')"
  # shellcheck disable=SC2086
  [ -n "${pids// /}" ] && kill $pids 2>/dev/null || true
  rm -f "$DIR/servidor.pid"; echo "ComfyUI detenido"
}
borrar_pesos() { find "$MOD" -name '*.safetensors' -type f -print -delete; echo "disco libre: $(( $(libre) / 1000000000 )) GB"; }

case "${1:-}" in
  comfy) comfy ;;
  qwen) pesos "${PESOS_QWEN[@]}" ;;
  3d) pesos "${PESOS_3D[@]}" ;;
  todo) comfy; pesos "${PESOS_QWEN[@]}"; pesos "${PESOS_3D[@]}" ;;
  estado) estado ;;
  servidor) servidor ;;
  parar) parar ;;
  borrar-pesos) borrar_pesos ;;
  *) sed -n '2,22p' "$0"; exit 1 ;;
esac
