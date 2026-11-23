#!/usr/bin/env bash
# Métricas de juego de LIF-2 desde D1 de producción (las finales que el Worker validó: tabla finales). Solo lectura.
# Uso: bash tools/medir.sh [días]   (por defecto 7)
#  - % de caídas por intento y % de intentos con todas las barritas en verde
#  - finales terminadas: finales validadas sobre partidas pedidas (el resto quedó en el muro o se abandonó)
#  - rivales salteados por final, campeonato y desafíos
set -euo pipefail
cd "$(dirname "$0")/.."
DIAS="${1:-7}"
q() { npx --yes wrangler d1 execute tarima --remote --json --command "$1" 2>/dev/null | python3 -c 'import json,sys; t=sys.stdin.read(); print(json.dumps(json.loads(t[t.index("["):])[0]["results"]))'; }
F=$(q "SELECT date(en,'unixepoch') dia, COUNT(*) finales, SUM(intentos) intentos, SUM(caidas) caidas, SUM(nulos) nulos, SUM(todo_verde) todo_verde, SUM(validos) validos, AVG(saltos) saltos, SUM(campeonato) camp, SUM(desafio IS NOT NULL) desafios, SUM(puesto = 1) oros FROM finales WHERE en >= strftime('%s','now','-$DIAS days') GROUP BY dia ORDER BY dia")
P=$(q "SELECT date(en,'unixepoch') dia, COUNT(*) partidas, SUM(etapa='arranque') solo_arranque FROM partidas WHERE en >= strftime('%s','now','-$DIAS days') GROUP BY dia ORDER BY dia")
python3 - "$F" "$P" <<'PY'
import json, sys
F = {r["dia"]: r for r in json.loads(sys.argv[1])}; P = {r["dia"]: r for r in json.loads(sys.argv[2])}
pc = lambda a, b: f'{round(a * 100 / b)} %' if b else '-'
print("día          partidas  finales  terminadas  caídas/int  nulos/int  todo verde/int  saltos/final  oros  camp  desafíos")
for d in sorted(set(F) | set(P)):
    f, p = F.get(d, {}), P.get(d, {})
    i = f.get("intentos") or 0
    print(f'{d}  {p.get("partidas", 0):8}  {f.get("finales", 0):7}  {pc(f.get("finales", 0), p.get("partidas", 0)):>10}  {pc(f.get("caidas") or 0, i):>10}  {pc(f.get("nulos") or 0, i):>9}  {pc(f.get("todo_verde") or 0, i):>14}  {round(f["saltos"], 1) if f.get("saltos") is not None else "-":>12}  {f.get("oros") or 0:4}  {f.get("camp") or 0:4}  {f.get("desafios") or 0:8}')
PY
