"""Compara dos poses.json (p. ej. el de macOS que está en git contra el de un build en Linux).
Uso: python3 tools/compare_poses.py <referencia.json> <otro.json> [personaje ...]
     git show HEAD:web/data/poses.json > /tmp/ref.json && python3 tools/compare_poses.py /tmp/ref.json web/data/poses.json
Informa diferencias de estructura (fases, sub, largo de tt, start, grip, corr) y la diferencia numérica máxima de tt, lean, bz, hip,
h y seg, con el lugar donde ocurre. Sale con 1 si la estructura difiere; las diferencias numéricas solo se informan."""
import json, sys

def main():
    a, b = (json.load(open(p)) for p in sys.argv[1:3]); names = sys.argv[3:] or sorted(set(a) | set(b)); bad = 0
    for n in names:
        if n not in a or n not in b: print(f'{n}: falta en {"la referencia" if n not in a else "el otro"}'); bad = 1; continue
        A, B = a[n], b[n]; st = []; mx = {}
        def num(key, x, y, where):
            d = abs(x - y)
            if d > mx.get(key, (-1,))[0]: mx[key] = (d, where, x, y)
        for k in ('sub', 'corr', 'grip', 'mask'):
            if A.get(k) != B.get(k): st.append(f'{k}: {A.get(k)} != {B.get(k)}')
        num('h', A['h'], B['h'], 'h')
        for k in sorted(set(A['seg']) | set(B['seg'])):
            if k in A['seg'] and k in B['seg']: num('seg', A['seg'][k], B['seg'][k], k)
            else: st.append(f'seg.{k} falta en uno')
        if list(A['segs']) != list(B['segs']): st.append(f'segmentos: {list(A["segs"])} != {list(B["segs"])}')
        for s in A['segs']:
            if s not in B['segs']: continue
            SA, SB = A['segs'][s], B['segs'][s]
            if SA.get('start') != SB.get('start'): st.append(f'{s}.start: {SA.get("start")} != {SB.get("start")}')
            na, nb = [p['n'] for p in SA['poses']], [p['n'] for p in SB['poses']]
            if na != nb: st.append(f'{s}: fases distintas: {na} != {nb}')
            if len(SA['tt']) != len(SB['tt']): st.append(f'{s}: largo de tt {len(SA["tt"])} != {len(SB["tt"])}')
            for i, (x, y) in enumerate(zip(SA['tt'], SB['tt'])): num('tt', x, y, f'{s} muestra {i}')
            for pa, pb in zip(SA['poses'], SB['poses']):
                for k in ('lean', 'bz', 'hip'):
                    if (k in pa) != (k in pb): st.append(f'{s} {pa["n"]}: {k} falta en uno')
                    elif k in pa: num(k, pa[k], pb[k], f'{s} {pa["n"]}')
        nseg = len(A['segs']); nph = sum(len(v['poses']) for v in A['segs'].values()); ntt = sum(len(v['tt']) for v in A['segs'].values())
        print(f'{n}: {nseg} segmentos, {nph} fases, {ntt} muestras de tt, sub {A.get("sub")} · estructura {"IGUAL" if not st else "DISTINTA"}')
        for l in st: print('   ' + l)
        bad |= bool(st)
        for k in ('tt', 'lean', 'bz', 'hip', 'h', 'seg'):
            if k in mx: d, w, x, y = mx[k]; print(f'   dif. máx {k:<4} {d:.6g}' + (f'  ({w}: {x} vs {y})' if d else ''))
    return bad

if __name__ == '__main__': sys.exit(main())
