"""Comprueba que web/ corresponde al build de out/ (o TARIMA_OUT) y que los datos cumplen los contratos del visor.
  python tools/verify_build.py [--since=<epoch o archivo marcador>] [ventura brenner]
Mira, por personaje:
- fechas: s3.blend, s4.blend, <nombre>.glb y poses.json del build, y GLB, máscara y poses.json de web/, posteriores a --since;
  el GLB de web/ no es anterior al del build;
- web/data/poses.json igual al poses.json del build (h, seg, sub, grip, segs);
- el GLB de web/ lleva la misma animación que el del build (hash de los datos de todos los samplers) y es lo que da
  export_web.repack sobre el GLB del build (se rehace en una carpeta temporal y se compara byte a byte);
- contratos: 52 huesos mixamorig + Bar, una acción 'Poses', nodos 'Human' (con morphs corr_*) y 'Human_parts', materiales;
  duración del clip = 1 s por fase con 'sub' muestras por fase; tt con (fases-1)*sub+1 valores, estrictamente creciente, desde 0;
- unión: la muestra 0 de cada envión (split, power, squat) contra la última fase de clean, hueso por hueso y Bar
  (traslación local en mm, rotación local en grados), leída del GLB de web/. Tolerancia: 0,5 mm / 0,2° (la de check()).
Sale con código 1 si algo no cumple. Solo lee; no usa Blender."""
import hashlib, json, math, os, struct, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTR = os.environ.get('TARIMA_OUT') or os.path.join(ROOT, 'out')
WEB = os.environ.get('TARIMA_WEB') or os.path.join(ROOT, 'web')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
MATS = {'Body', 'Eyes', 'Hair', 'Lashes', 'ShoeUpper', 'ShoeSole', 'ShoeHeel', 'ShoeStrap', 'ShoeLace'}
TOL_MM, TOL_DEG = 0.5, 0.2
FPS = 30.0

def glb(path):
    d = open(path, 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + jl]); o = 20 + jl
    bl = struct.unpack('<I', d[o:o + 4])[0]; return J, d[o + 8:o + 8 + bl]
NC = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}
def acc(J, B, i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]; n = NC[a['type']]; assert a['componentType'] == 5126, a
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride') or 4 * n
    return [struct.unpack_from('<%df' % n, B, o + k * st) for k in range(a['count'])]
def anim_hash(J, B):
    h = hashlib.md5(); a = J['animations'][0]
    for c in a['channels']:
        s = a['samplers'][c['sampler']]; h.update((J['nodes'][c['target']['node']]['name'] + c['target']['path']).encode())
        for k in (s['input'], s['output']):
            A = J['accessors'][k]; v = J['bufferViews'][A['bufferView']]; o = v.get('byteOffset', 0) + A.get('byteOffset', 0)
            h.update(B[o:o + A['count'] * 4 * NC[A['type']]])
    return h.hexdigest()
def tracks(J, B):
    """{(nodo, path): (tiempos, valores)} de la animación."""
    a = J['animations'][0]; out = {}; cache = {}
    for c in a['channels']:
        if c['target']['path'] not in ('translation', 'rotation'): continue
        s = a['samplers'][c['sampler']]
        for k in (s['input'], s['output']):
            if k not in cache: cache[k] = acc(J, B, k)
        out[(J['nodes'][c['target']['node']]['name'], c['target']['path'])] = (cache[s['input']], cache[s['output']])
    return out
def at(tr, t):
    ts, vs = tr
    if len(ts) <= 2:      # pista que el exportador redujo a sus extremos (constante salvo ruido): interpolación lineal
        if len(ts) == 1 or ts[-1][0] == ts[0][0]: return vs[0]
        u = min(1.0, max(0.0, (t - ts[0][0]) / (ts[-1][0] - ts[0][0]))); return tuple(x + (y - x) * u for x, y in zip(vs[0], vs[-1]))
    k = min(range(len(ts)), key=lambda i: abs(ts[i][0] - t))
    if abs(ts[k][0] - t) > 1e-3: raise ValueError(f'no hay clave en t={t:.4f} (la más cercana {ts[k][0]:.4f})')
    return vs[k]
def qang(a, b):
    d = abs(sum(x * y for x, y in zip(a, b))) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(x * x for x in b)))
    return math.degrees(2 * math.acos(min(1.0, d)))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; names = args or ['ventura', 'brenner']
    since = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--since=')), None)
    if since: since = os.path.getmtime(since) if os.path.exists(since) else float(since)
    bad = []; err = lambda n, m: (bad.append(f'{n}: {m}'), print(f'  FALLA {m}'))
    wp = os.path.join(WEB, 'data', 'poses.json'); WJ = json.load(open(wp, encoding='utf-8'))
    import time; fmt = lambda t: time.strftime('%m-%d %H:%M:%S', time.localtime(t))
    if since: print(f'build iniciado {fmt(since)}')
    import export_web
    for n in names:
        print(f'== {n} ==')
        o = os.path.join(OUTR, n); files = {k: os.path.join(o, k) for k in ('s3.blend', 'maps.npz', 's3b.blend', 's4.blend', n + '.glb', 'poses.json', 'body_color.png', 'body_mask.png')}
        files.update({'web glb': os.path.join(WEB, 'models', n + '.glb'), 'web mask': os.path.join(WEB, 'models', n + '_mask.png'), 'web poses.json': wp})
        for k, p in files.items():
            if not os.path.exists(p): err(n, f'falta {p}'); continue
            m = os.path.getmtime(p)
            if since and m < since: err(n, f'{k} es anterior al build ({fmt(m)})')
        print('  fechas: ' + ' · '.join(f'{k} {fmt(os.path.getmtime(p))}' for k, p in files.items() if os.path.exists(p)))
        if os.path.getmtime(files['web glb']) < os.path.getmtime(files[n + '.glb']): err(n, 'el GLB de web/ es anterior al del build')
        # poses.json
        pj = json.load(open(files['poses.json'], encoding='utf-8')); w = WJ.get(n) or {}
        for k in ('h', 'seg', 'sub', 'grip', 'segs'):
            if w.get(k) != pj.get(k): err(n, f'web/data/poses.json difiere del build en {k!r}')
        sub = pj['sub']; segs = pj['segs']; exp = 0.0
        for s, S in segs.items():
            nph = len(S['poses']); tt = S['tt']
            if abs(S['start'] - exp) > 1e-9: err(n, f'{s}: start {S["start"]} y se esperaba {exp} (1 s por fase)')
            exp += nph
            if len(tt) != (nph - 1) * sub + 1: err(n, f'{s}: tt tiene {len(tt)} valores y se esperaban {(nph - 1) * sub + 1}')
            if tt[0] != 0 or any(b <= a for a, b in zip(tt, tt[1:])): err(n, f'{s}: tt no es estrictamente creciente desde 0')
            print(f'  {s}: {nph} fases, start {S["start"]:g}, {len(tt)} muestras, tt 0 → {tt[-1]:.2f} s, paso mín {min(b - a for a, b in zip(tt, tt[1:])) * 1000:.1f} ms · ' + ', '.join(p['n'] for p in S['poses']))
        print(f'  sub {sub} · h {pj["h"]} · agarre {pj["grip"]}')
        # GLB
        J0, B0 = glb(files[n + '.glb']); J, B = glb(files['web glb'])
        h0, h1 = anim_hash(J0, B0), anim_hash(J, B)
        if h0 != h1: err(n, f'la animación del GLB de web/ ({h1}) no es la del build ({h0})')
        with tempfile.TemporaryDirectory() as td:
            export_web.repack(files[n + '.glb'], os.path.join(td, 'x.glb'), o)
            same = open(os.path.join(td, 'x.glb'), 'rb').read() == open(files['web glb'], 'rb').read()
        if not same: err(n, 'el GLB de web/ no es el reempaquetado del GLB del build')
        bones = [x['name'] for x in J['nodes'] if x['name'].startswith('mixamorig')]; names_ = [x['name'] for x in J['nodes']]
        meshes = [x['name'] for x in J['nodes'] if 'mesh' in x]; mats = [m['name'] for m in J['materials']]
        morphs = sorted({t for me in J['meshes'] for t in me.get('extras', {}).get('targetNames', [])})
        if len(bones) != 52 or 'Bar' not in names_: err(n, f'esqueleto: {len(bones)} huesos mixamorig, Bar {"Bar" in names_}')
        if [a.get('name') for a in J['animations']] != ['Poses']: err(n, f'acciones {[a.get("name") for a in J["animations"]]}')
        if meshes != ['Human', 'Human_parts']: err(n, f'nodos de malla {meshes}')
        if not MATS <= set(mats): err(n, f'faltan materiales {MATS - set(mats)}')
        if not morphs or any(not m.startswith('corr_') for m in morphs): err(n, f'morphs {morphs}')
        T = tracks(J, B); tmax = max(ts[-1][0] for ts, _ in T.values()); nkeys = max(len(ts) for ts, _ in T.values())
        total = sum(len(S['poses']) for S in segs.values()); dur = tmax - 1 / FPS
        if abs(dur - (total - 1)) > 1e-3: err(n, f'clip de {dur:.3f} s y se esperaban {total - 1} (1 s por fase, {total} fases)')
        print(f'  GLB web {os.path.getsize(files["web glb"]) / 1e6:.2f} MB (build {os.path.getsize(files[n + ".glb"]) / 1e6:.2f} MB) · animación md5 {h1[:12]} igual a la del build: {h0 == h1} · reempaquetado idéntico: {same}')
        print(f'  {len(bones)} huesos + Bar · mallas {meshes} · materiales {mats} · morphs {morphs} · clip {dur:.2f} s, {nkeys} claves ({total} fases x {sub} muestras)')
        # cada muestra de poses.json tiene clave en el GLB
        miss = 0
        for s, S in segs.items():
            for k in range((len(S['poses']) - 1) * sub + 1):
                try: at(T[('Bar', 'translation')], S['start'] + k / sub + 1 / FPS)
                except ValueError: miss += 1
        if miss: err(n, f'{miss} muestras de poses.json sin clave en el GLB')
        # unión cargada → envión
        tc = segs['clean']['start'] + (len(segs['clean']['poses']) - 1) + 1 / FPS
        for s in ('split', 'power', 'squat'):
            if s not in segs: continue
            t0 = segs[s]['start'] + 1 / FPS; dm = da = 0.0; wm = wa = ''
            for (node, path), tr in T.items():
                a, b = at(tr, tc), at(tr, t0)
                if path == 'translation':
                    d = math.dist(a, b) * 1000
                    if d > dm: dm, wm = d, node
                else:
                    d = qang(a, b)
                    if d > da: da, wa = d, node
            bar = math.dist(at(T[('Bar', 'translation')], tc), at(T[('Bar', 'translation')], t0)) * 1000
            pm = segs['clean']['poses'][-1]; p0 = segs[s]['poses'][0]; meta = all(abs(pm[k] - p0[k]) < 1e-9 for k in ('lean', 'bz', 'hip'))
            print(f'  unión clean "{pm["n"]}" → {s} "{p0["n"]}": traslación máx {dm:.3f} mm ({wm or "-"}), rotación máx {da:.3f}° ({wa or "-"}), Bar {bar:.3f} mm · lean/bz/hip iguales: {meta}')
            if dm > TOL_MM or da > TOL_DEG or not meta: err(n, f'unión clean→{s} fuera de tolerancia ({dm:.2f} mm, {da:.2f}°)')
    print('VERIFY ' + ('OK' if not bad else f'{len(bad)} FALLAS'))
    for x in bad: print('  ' + x)
    sys.exit(1 if bad else 0)
if __name__ == '__main__': main()
