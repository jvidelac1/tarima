#!/usr/bin/env bash
# Muestra la lista de espera (quién dejó el mail) leyendo D1 de producción. Solo lectura.
# Uso: bash tools/lista.sh            → tabla en la terminal
#      bash tools/lista.sh --csv      → CSV (para pegar en una planilla)
# Necesita la sesión de wrangler iniciada en la cuenta de Cloudflare del juego.
set -euo pipefail
cd "$(dirname "$0")/.."
SQL="SELECT nombre, email, pais, idioma, novedades, creado, confirmado_en FROM lista ORDER BY creado"
npx --yes wrangler d1 execute tarima --remote --json --command "$SQL" 2>/dev/null | python3 -c '
import json, sys, datetime
t = sys.stdin.read()
filas = json.loads(t[t.index("["):])[0]["results"]
csv = "--csv" in sys.argv
hora = lambda s: datetime.datetime.fromtimestamp(s).strftime("%d/%m/%Y %H:%M") if s else ""
if csv:
    print("nombre,email,pais,idioma,novedades,anotado,confirmado")
    for r in filas:
        print(",".join(str(x).replace(",", " ") for x in [r["nombre"] or "", r["email"], r["pais"] or "", r["idioma"] or "", "si" if r["novedades"] else "no", hora(r["creado"]), hora(r["confirmado_en"])]))
else:
    print(f"{len(filas)} anotados")
    for r in filas:
        print("  ".join([hora(r["creado"]), (r["nombre"] or "-").ljust(16), r["email"].ljust(34), (r["pais"] or "?").ljust(3), (r["idioma"] or "?").ljust(3), "novedades" if r["novedades"] else ""]))
' "$@"
