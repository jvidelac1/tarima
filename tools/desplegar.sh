#!/usr/bin/env bash
# Publica Tarima en Cloudflare: primero el Worker «tarima» (migraciones de D1, código y secretos), después el sitio en
# Pages «liftinggame» (web/ + functions/, con la service binding TARIMA → tarima). Ver worker/README.md, «Publicar».
#
#   tools/desplegar.sh --seco         solo lo local: pruebas, Worker --dry-run y Functions; no toca la cuenta
#   tools/desplegar.sh                publica de verdad (pide confirmación antes de tocar la cuenta)
#   tools/desplegar.sh --si           publica sin preguntar
#   tools/desplegar.sh --sin-pruebas  saltea las pruebas (no recomendado)
#
# Variables opcionales:
#   TARIMA_DATOS     carpeta con posthog.json (por defecto ~/tarima-datos). La clave pública nunca se imprime.
#   RAMA_PRODUCCION  rama de producción del proyecto de Pages. Si no está, se le pregunta a la API de Cloudflare con la
#                    sesión de wrangler; si eso falla, se usa «main» con un aviso.
#   SITIO            dirección pública para la comprobación final (por defecto https://liftinggame.pages.dev).
#
# Secretos del Worker: SECRETO_IP, SECRETO_DISPOSITIVO, SECRETO_PASE y SECRETO_BAJA se generan con openssl SOLO si
# todavía no existen (cambiarlos después de abrir le devuelve las finales gratis a todos y rompe los enlaces de baja).
# Pasan por la entrada estándar de `wrangler secret put`: no quedan en la terminal, en el historial ni en el repo.
# EXPORTAR_CLAVE (para bajar la lista en CSV) se genera igual y se guarda en $TARIMA_DATOS/exportar.clave (modo 600).
# POSTHOG_KEY se lee de $TARIMA_DATOS/posthog.json y se vuelve a cargar en cada publicación.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="$RAIZ/worker/node_modules/.bin/wrangler"
DATOS="${TARIMA_DATOS:-$HOME/tarima-datos}"
SITIO="${SITIO:-https://liftinggame.pages.dev}"
PROYECTO=liftinggame
WORKER=tarima
SECO=0; SI=0; PRUEBAS=1
for a in "$@"; do
  case "$a" in
    --seco) SECO=1 ;;
    --si) SI=1 ;;
    --sin-pruebas) PRUEBAS=0 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $a" >&2; exit 2 ;;
  esac
done
export WRANGLER_SEND_METRICS=false

paso() { printf '\n== %s\n' "$*"; }
falla() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# ---------- 0. lo necesario ----------
paso "Comprobaciones locales"
command -v node >/dev/null || falla "falta node"
command -v openssl >/dev/null || falla "falta openssl"
command -v curl >/dev/null || falla "falta curl"
[ -x "$W" ] || { echo "Instalando las dependencias del Worker (npm ci)…"; (cd "$RAIZ/worker" && npm ci --no-audit --no-fund); }
[ -f "$DATOS/posthog.json" ] || falla "no está $DATOS/posthog.json"
node -e 'const k=require(process.argv[1]).posthog_project_key; if(!/^phc_[A-Za-z0-9]+$/.test(k||"")) process.exit(1)' "$DATOS/posthog.json" \
  || falla "posthog.json no tiene una posthog_project_key que empiece con phc_"
echo "wrangler $("$W" --version 2>/dev/null | tail -n1) · clave de PostHog presente (no se muestra)"
grep -q '"database_id": "9e2c28f3-67de-4cc6-a278-2d0e5f34e055"' "$RAIZ/worker/wrangler.jsonc" || falla "worker/wrangler.jsonc no apunta a la D1 «tarima»"
grep -q '"workers_dev": false' "$RAIZ/worker/wrangler.jsonc" || falla "el Worker tiene que tener workers_dev en false"
if [ -n "$(git -C "$RAIZ" status --porcelain -- worker functions web wrangler.jsonc 2>/dev/null)" ]; then
  echo "AVISO: hay cambios sin commit en worker/, functions/, web/ o wrangler.jsonc: se publica lo que está en disco."
fi

# ---------- 1. pruebas ----------
if [ "$PRUEBAS" = 1 ]; then
  paso "Pruebas"
  node "$RAIZ/tools/servidor_test.mjs"
  node "$RAIZ/tools/worker_test.mjs"
  (cd "$RAIZ/worker" && npm test --silent)
fi

# ---------- 2. empaquetado sin desplegar ----------
paso "Worker: empaquetado sin desplegar (--dry-run)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
(cd "$RAIZ/worker" && "$W" deploy --dry-run --outdir "$TMP/worker" | tail -n 20)
paso "Pages: Functions"
mkdir -p "$TMP/pages"
(cd "$RAIZ" && "$W" pages functions build --outdir "$TMP/pages/out" --output-routes-path "$TMP/pages/_routes.json" >/dev/null)
node -e 'const r=require(process.argv[1]); for (const x of ["/","/api/*","/qx/*","/baja","/confirmar"]) if(!r.include.includes(x)) { console.error("falta la ruta "+x); process.exit(1) } console.log("rutas de las Functions: "+r.include.join(" "))' "$TMP/pages/_routes.json"

if [ "$SECO" = 1 ]; then
  paso "Listo en seco: no se tocó la cuenta de Cloudflare."
  exit 0
fi

# ---------- 3. cuenta ----------
paso "Cuenta de Cloudflare"
(cd "$RAIZ/worker" && "$W" whoami) || falla "wrangler no tiene sesión: correr «cd worker && npx wrangler login»"
if [ "$SI" != 1 ]; then
  printf '\nSe va a publicar el Worker «%s» (sin dirección pública), migrar la D1 «tarima» y publicar Pages «%s».\n¿Seguir? [s/N] ' "$WORKER" "$PROYECTO"
  read -r r; [ "$r" = s ] || [ "$r" = S ] || falla "cancelado"
fi

# ---------- 4. Worker ----------
paso "D1: migraciones"
(cd "$RAIZ/worker" && CI=1 "$W" d1 migrations apply tarima --remote)

paso "Worker: publicar"
(cd "$RAIZ/worker" && "$W" deploy)

paso "Worker: secretos"
EXISTENTES="$(cd "$RAIZ/worker" && "$W" secret list --format json 2>/dev/null | node -e '
  let t=""; process.stdin.on("data",d=>t+=d).on("end",()=>{ try { const i=t.indexOf("["); const a=JSON.parse(t.slice(i)); console.log(a.map(s=>s.name).join(" ")) } catch { console.log("") } })')"
umask 077
for s in SECRETO_IP SECRETO_DISPOSITIVO SECRETO_PASE SECRETO_BAJA; do
  if [[ " $EXISTENTES " == *" $s "* ]]; then
    echo "$s ya existe: no se toca"
  else
    openssl rand -hex 32 | (cd "$RAIZ/worker" && "$W" secret put "$s" >/dev/null) && echo "$s generado y cargado"
  fi
done
if [[ " $EXISTENTES " == *" EXPORTAR_CLAVE "* ]]; then
  echo "EXPORTAR_CLAVE ya existe: no se toca"
else
  mkdir -p "$DATOS"
  openssl rand -hex 24 > "$DATOS/exportar.clave"
  (cd "$RAIZ/worker" && "$W" secret put EXPORTAR_CLAVE >/dev/null < "$DATOS/exportar.clave") && echo "EXPORTAR_CLAVE generada y cargada (copia en $DATOS/exportar.clave)"
fi
node -e 'process.stdout.write(require(process.argv[1]).posthog_project_key)' "$DATOS/posthog.json" \
  | (cd "$RAIZ/worker" && "$W" secret put POSTHOG_KEY >/dev/null) && echo "POSTHOG_KEY cargada"

# ---------- 5. Pages ----------
paso "Pages: rama de producción"
RAMA="${RAMA_PRODUCCION:-}"
if [ -z "$RAMA" ]; then
  CUENTA="${CLOUDFLARE_ACCOUNT_ID:-$(cd "$RAIZ/worker" && "$W" whoami --json 2>/dev/null | node -e '
    let t=""; process.stdin.on("data",d=>t+=d).on("end",()=>{ try { const j=JSON.parse(t.slice(t.indexOf("{"))); const a=j.accounts||[]; if (a.length===1) console.log(a[0].id) } catch {} })')}"
  if [ -n "$CUENTA" ]; then
    RAMA="$( (cd "$RAIZ/worker" && "$W" auth token 2>/dev/null | tail -n1) | node -e '
      let t=""; process.stdin.on("data",d=>t+=d).on("end",async()=>{ try {
        const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.argv[1]}/pages/projects/${process.argv[2]}`,{headers:{authorization:"Bearer "+t.trim()}});
        const j=await r.json(); if (j.success && j.result?.production_branch) console.log(j.result.production_branch) } catch {} })' "$CUENTA" "$PROYECTO")"
  fi
  if [ -z "$RAMA" ]; then RAMA=main; echo "AVISO: no se pudo leer la rama de producción de «$PROYECTO»; se usa «main». Si el sitio no cambia, correr con RAMA_PRODUCCION=<rama>."; fi
fi
echo "rama de producción: $RAMA"

paso "Pages: publicar web/ y functions/"
(cd "$RAIZ" && "$W" pages deploy web --project-name "$PROYECTO" --branch "$RAMA" \
  --commit-hash "$(git -C "$RAIZ" rev-parse HEAD)" --commit-message "$(git -C "$RAIZ" log -1 --format=%s | cut -c1-200)" --commit-dirty=true)

# ---------- 6. comprobación ----------
paso "Comprobación en $SITIO"
sleep 5
curl -fsS "$SITIO/" | grep -qi '<html' && echo "/ responde con el juego" || echo "AVISO: / no devolvió HTML todavía (Pages puede tardar un minuto)"
EST="$(curl -sS -X POST "$SITIO/api/estado" -H "origin: $SITIO" -H 'content-type: application/json' --data '{"idioma":"es"}' || true)"
if printf '%s' "$EST" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const j=JSON.parse(t); if(typeof j.puede!=="boolean") process.exit(1); console.log("/api/estado: puede="+j.puede+" quedan="+j.quedan+" métricas="+(j.metricas?"sí":"no"))})' 2>/dev/null; then
  :
else
  echo "AVISO: /api/estado no respondió como se esperaba: $(printf '%s' "$EST" | head -c 200)"
fi
curl -fsS "$SITIO/privacidad.html" -o /dev/null -L && echo "/privacidad.html responde" || echo "AVISO: /privacidad.html no responde"
paso "Publicado. El Worker no tiene dirección pública; todo va por $SITIO."
