#!/usr/bin/env bash
# Tablero de errores del juego (LIF-26), leyendo D1 de producción. Solo lectura.
# Uso: bash tools/errores.sh [días]   (por defecto 7): errores por día contra finales pedidas, y los más repetidos.
# Necesita la sesión de wrangler iniciada en la cuenta de Cloudflare del juego. La alerta diaria la escribe el cron del
# Worker como registro «alerta_errores» (Workers Logs) y, con PostHog, como evento alerta_errores.
set -euo pipefail
cd "$(dirname "$0")/.."
DIAS="${1:-7}"
q() { npx --yes wrangler d1 execute tarima --remote --json --command "$1" 2>/dev/null | python3 -c 'import json,sys; t=sys.stdin.read(); print(json.dumps(json.loads(t[t.index("["):])[0]["results"]))'; }
POR_DIA=$(q "SELECT e.dia, SUM(e.n) AS errores, (SELECT COUNT(*) FROM partidas p WHERE date(p.en,'unixepoch') = e.dia) AS finales FROM errores e WHERE e.dia >= date('now','-$DIAS days') GROUP BY e.dia ORDER BY e.dia")
TOP=$(q "SELECT tipo, pantalla, mensaje, archivo, linea, SUM(n) AS n, MIN(dia) AS desde, MAX(dia) AS hasta FROM errores WHERE dia >= date('now','-$DIAS days') GROUP BY tipo, pantalla, mensaje ORDER BY n DESC LIMIT 15")
python3 - "$POR_DIA" "$TOP" <<'PY'
import json, sys
por, top = json.loads(sys.argv[1]), json.loads(sys.argv[2])
print("día          errores  finales  por 100 finales")
for r in por:
    f = r["finales"] or 0
    print(f'{r["dia"]}  {r["errores"]:7}  {f:7}  {round(r["errores"] * 100 / f) if f else "-":>6}' + ("  ← ALERTA" if r["errores"] > 20 and r["errores"] * 100 > max(1, f) * 50 else ""))
print("\nmás repetidos")
for r in top:
    print(f'{r["n"]:5}×  {r["tipo"]:<22} {r["pantalla"]:<12} {r["mensaje"][:70]}  ({r["archivo"] or "?"}:{r["linea"] or "?"}, {r["desde"]}→{r["hasta"]})')
PY
