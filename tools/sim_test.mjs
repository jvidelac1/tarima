// Prueba del núcleo del juego, sin navegador (docs/JUEGO.md, sección 9.7). Uso: node tools/sim_test.mjs [--n=1000] [--update]
//  1. El núcleo es puro: sin reloj, sin dependencias externas y sin funciones matemáticas inexactas.
//  2. Partidas de referencia con resultado guardado (tools/sim_ref.json; --update lo reescribe).
//  3. Jugar en vivo y recalcular el registro dan la misma tabla, con jugadores simulados que cambian kilos, amagan y tocan basura.
//  4. N partidas al azar: siempre terminan, respetan el orden de salida, nunca bajan la barra y el reglamento de progresión.
//  5. Un intento da lo mismo sin importar en cuántos pasos se lo avance (lo que se muestra en vivo no se contradice después).
//  6. Registros adulterados: se rechazan.
//  7. Nivel de control Fácil (docs/CONTROLES.md): la capa de traducción es pura; partidas de referencia jugadas a través
//     de la capa (tools/sim_ref_facil.json); en vivo, recalculado y avance en pasos irregulares dan lo mismo; un `ctl`
//     desconocido se rechaza y un registro sin `ctl` es Clásico; toda causa tiene su línea de explicación.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { Partida } from '../web/js/sim/match.js';
import { Intento, simular } from '../web/js/sim/attempt.js';
import { gestos } from '../web/js/sim/ai.js';
import { recalcular, resumen } from '../web/js/sim/replay.js';
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { RELOJ, CAUSAS } from '../web/js/sim/rules.js';
import { tocar, alDia, senal } from '../web/js/game/controles.js';
import { explicar } from '../web/js/game/ui/mensajes.js';
import { jugarSenal, BOTS } from './play_human.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SIM = path.join(ROOT, 'web/js/sim'), REF = path.join(ROOT, 'tools/sim_ref.json'), REF_F = path.join(ROOT, 'tools/sim_ref_facil.json');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const N = +(arg('n') || 1000), UPDATE = process.argv.includes('--update');
const datos = leerDatos(JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/sim.json'), 'utf8')));
const fallas = []; const ok = (c, msg) => { if (!c) { fallas.push(msg); if (fallas.length < 30) console.log('  MAL: ' + msg); } };
const t0 = Date.now();
const IDS = ['ventura', 'brenner', 'marangi'], NIV = ['amistoso', 'normal', 'dificil'];

// ---------- 1. pureza ----------
{
  const permitidas = new Set(['trunc', 'floor', 'abs', 'min', 'max', 'imul']);
  for (const f of fs.readdirSync(SIM).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(SIM, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of src.matchAll(/Math\.(\w+)/g)) ok(permitidas.has(m[1]), `${f}: usa Math.${m[1]}`);
    for (const re of [/\bDate\b/, /\bperformance\b/, /\bsetTimeout\b/, /\bdocument\b/, /\bwindow\b/, /\bfetch\b/, /\bparseFloat\b/, /toFixed/]) ok(!re.test(src), `${f}: usa ${re.source}`);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) ok(/^\.\/\w+\.js$/.test(m[1]), `${f}: importa ${m[1]}`);
  }
  console.log('1. núcleo puro: ' + fs.readdirSync(SIM).filter(f => f.endsWith('.js')).length + ' archivos');
}

// ---------- jugador simulado ----------
/** Juega una partida entera. `persona`: índice del pesista manejado por un jugador simulado (o -1: los tres son rivales). Devuelve la partida y su bitácora. */
function jugar(semilla, nivel, persona, estilo = {}) {
  const r = new Azar(mezclar(semilla, 9)), cfg = { semilla, nivel, cal: estilo.cal || 0, primera: !!estilo.primera, ...(estilo.ctl ? { ctl: estilo.ctl } : {}), atletas: IDS.map((id, i) => ({ id, ctrl: i === persona ? 'persona' : 'juego' })) };
  const p = new Partida(datos, cfg), bit = [];
  const abrir = lev => { if (persona >= 0) { const [lo, hi] = p.rangoApertura(persona, lev); p.abrir(persona, lev, r.entre(lo, hi)); } p.empezar(); };
  abrir('s');
  for (let g = 0; p.fase !== 'fin'; g++) {
    if (g > 60) throw new Error('la partida no termina');
    if (p.fase === 'intervalo') { abrir('c'); continue; }
    const L = p.llamado, a = p.at[L.a], barra = p.barra;
    // orden de salida: nadie con intentos pendientes declaró menos
    for (const b of p.at) if (b[L.lev].length < 3) ok(b.decl[L.lev] >= L.kg, `semilla ${semilla}: sale ${a.id} con ${L.kg} y ${b.id} declaró ${b.decl[L.lev]}`);
    ok(L.kg >= barra, `semilla ${semilla}: la barra baja de ${barra} a ${L.kg}`);
    const u = a[L.lev][a[L.lev].length - 1]; if (u) ok(L.kg >= (u.res === 'valido' ? u.kg + 1 : u.kg), `semilla ${semilla}: progresión de ${a.id}`);
    if (a.ctrl === 'juego') { const x = p.resolverIA(); bit.push({ a: L.a, lev: L.lev, n: L.n, kg: L.kg, res: x.res.res }); continue; }
    // persona: a veces cambia kilos (y puede quedar desplazada), a veces deja correr el reloj, a veces toca cualquier cosa
    if (r.ent(4) === 0 && a.cambios < 2) { const kg = Math.max(p.minimo(L.a), L.kg + r.entre(-2, 4)); if (!p.cambioValido(800, kg)) { if (p.cambio(800, kg).desplazado) { bit.push({ a: L.a, lev: L.lev, n: L.n, kg: L.kg, res: 'desplazado' }); continue; } } }
    const env = L.lev === 'c' ? ['split', 'power', 'squat'][r.ent(3)] : undefined, ctx = p.contexto(env), modo = estilo.modo ?? r.ent(10);
    let rec;
    if (modo === 0) rec = { conf: null, env, ent: [] };                                                    // se le va el reloj
    else if (modo === 1) { const ent = []; let t = 2000; for (let k = 0; k < 60; k++) { t += r.entre(1, 900); ent.push([t, k % 2 ? 0 : 1]); } rec = { conf: 1500, env, ent }; }   // toca cualquier cosa
    else if (estilo.ctl === 'f') { const S = jugarSenal(ctx, { ...BOTS.casual, sd: estilo.sd ?? [30, 80, 160][r.ent(3)] }, L.sem ^ 0x5bd1e995); rec = { conf: S.conf, env, ent: S.ent }; }      // Fácil: un toque por señal, a través de la capa
    else { const g2 = gestos({ ...ctx }, { sd: estilo.sd ?? [20, 35, 60][r.ent(3)], pelea: 60 }, L.sem ^ 0x5bd1e995); rec = { conf: g2.conf, env, ent: g2.ent }; }
    const x = p.resolver(rec); bit.push({ a: L.a, lev: L.lev, n: L.n, kg: p.at[L.a][L.lev].slice(-1)[0].kg, res: x.res.res });
  }
  return { p, bit };
}

// ---------- 2. partidas de referencia ----------
{
  const casos = []; for (let k = 0; k < 12; k++) casos.push({ semilla: 1000003 * (k + 1), nivel: NIV[k % 3], persona: k % 4 - 1 });
  const hoy = casos.map(c => ({ ...c, tabla: resumen(jugar(c.semilla, c.nivel, c.persona).p.tabla()) }));
  if (UPDATE || !fs.existsSync(REF)) { fs.writeFileSync(REF, JSON.stringify({ datos: datos.huella, casos: hoy }, null, 1) + '\n'); console.log('2. referencia escrita en tools/sim_ref.json'); }
  else {
    const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
    ok(ref.datos === datos.huella, `la referencia es de otra huella de sim.json (${ref.datos}); si el cambio es intencional: --update`);
    ref.casos.forEach((c, i) => ok(c.tabla === hoy[i]?.tabla, `referencia ${i} (semilla ${c.semilla}): guardado «${c.tabla}», hoy «${hoy[i]?.tabla}»`));
    console.log(`2. ${ref.casos.length} partidas de referencia`);
  }
}

// ---------- 3 y 4. partidas al azar, en vivo contra recalculadas ----------
{
  let intentos = 0, validos = 0, desplazados = 0, sinMarca = 0; const registros = [];
  for (let k = 0; k < N; k++) {
    const semilla = mezclar(k, 77), persona = k % 4 - 1;
    const { p, bit } = jugar(semilla, NIV[k % 3], persona, { cal: k % 5 === 0 ? 40 : 0, primera: k % 7 === 0 });
    for (const b of bit) { if (b.res === 'desplazado') desplazados++; else { intentos++; if (b.res === 'valido') validos++; } }
    ok(bit.filter(b => b.res !== 'desplazado').length === 18, `semilla ${semilla}: ${bit.length} intentos`);
    for (const a of p.at) ok(a.s.length === 3 && a.c.length === 3 && a.resto >= 0 && a.resto <= 1000, `semilla ${semilla}: estado final de ${a.id}`);
    const t = p.tabla(); sinMarca += t.filter(f => !f.total).length;
    for (let i = 1; i < t.length; i++) ok(t[i - 1].total >= t[i].total, `semilla ${semilla}: tabla desordenada`);
    const reg = JSON.parse(JSON.stringify(p.reg)), rc = recalcular(reg, datos);
    ok(rc.ok && resumen(rc.tabla) === resumen(t), `semilla ${semilla}: recalcular da ${rc.ok ? resumen(rc.tabla) : rc.error} y en vivo ${resumen(t)}`);
    if (persona >= 0 && registros.length < 40) registros.push(reg);
  }
  console.log(`3-4. ${N} partidas: ${intentos} intentos, ${Math.round(validos * 100 / intentos)} % válidos, ${desplazados} llamados desplazados, ${(sinMarca * 100 / (3 * N)).toFixed(1)} % sin marca`);

  // ---------- 6. registros adulterados ----------
  const trampas = {
    'otra huella': g => { g.datos = 'deadbeef'; },
    'otra versión': g => { g.sim = '9.9'; },
    'apertura de un rival cambiada': g => { const i = g.atletas.findIndex(a => a.ctrl === 'juego'); g.aperturas[i].s -= 3; },
    'apertura propia fuera de rango': g => { const i = g.atletas.findIndex(a => a.ctrl === 'persona'); g.aperturas[i].s = 120; },
    'llamados en otro orden': g => { const a = g.llamados; for (let i = 0; i + 1 < a.length; i++) if (a[i].a !== a[i + 1].a) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; return; } },
    'falta un llamado': g => { g.llamados.splice(5, 1); },
    'sobra un llamado': g => { g.llamados.push({ ...g.llamados[g.llamados.length - 1] }); },
    'kilos declarados cambiados': g => { g.llamados.find(c => c.fin === 'intento').kg += 5; },
    'resultado pegado al llamado de un rival': g => { g.llamados.find(c => !c.fin).res = 'valido'; },
    'instantes fuera de orden': g => { const c = g.llamados.find(c => c.fin === 'intento' && c.ent.length > 3); if (!c) return false; c.ent[2][0] = c.ent[1][0] - 50; },
    'entrada mal formada': g => { g.llamados.find(c => c.fin === 'intento').ent.push([1e9, 2]); },
    'cambio por debajo de la barra': g => { const c = [...g.llamados].reverse().find(c => c.fin === 'intento'); c.cambios = [[500, 100]]; },
    'cambio con el reloj por debajo de 0:15': g => { const c = g.llamados.find(c => c.fin === 'intento'); c.cambios = [[RELOJ.normal, c.kg + 1]]; c.conf = RELOJ.normal; },
    'tres cambios': g => { const c = g.llamados.find(c => c.fin === 'intento'); c.cambios = [[100, c.kg + 1], [200, c.kg + 2], [300, c.kg + 3]]; },
    'semilla cambiada': g => { g.semilla = (g.semilla + 1) >>> 0; },
    'partida cortada': g => { g.llamados.length = 9; },
  };
  let probadas = 0;
  for (const [nombre, fn] of Object.entries(trampas)) {
    let rechazados = 0, casos = 0;
    for (const reg of registros) { const g = JSON.parse(JSON.stringify(reg)); if (fn(g) === false) continue; casos++; const rc = recalcular(g, datos); if (!rc.ok) rechazados++; }
    ok(casos > 0 && rechazados === casos, `adulterado «${nombre}»: ${rechazados} rechazados de ${casos}`); probadas++;
  }
  // cambiar lo que el jugador tocó no se rechaza: se recalcula, y el resultado es el del servidor
  { const g = JSON.parse(JSON.stringify(registros[0])), c = g.llamados.find(c => c.fin === 'intento'); c.ent = []; const rc = recalcular(g, datos); ok(rc.ok && rc.partida.at[c.a][c.lev][c.n - 1].res !== 'valido', 'un intento sin entradas no puede dar válido'); }
  console.log(`6. ${probadas} adulteraciones rechazadas sobre ${registros.length} registros`);
}

// ---------- 5. el intento no depende de cómo se avance el tiempo ----------
{
  let n = 0; const causas = {};
  for (let k = 0; k < 600; k++) {
    const r = new Azar(mezclar(k, 5)), lev = k % 2 ? 'c' : 's', env = ['split', 'power', 'squat'][k % 3];
    const ctx = { lev, env: lev === 'c' ? env : undefined, I: 8500 + r.ent(2200), tec: 5 + r.ent(5), temple: k % 4 ? 0 : 8, garra: 5 + r.ent(5), anclas: datos.modelos[k % 2 ? 'ventura' : 'brenner'], semilla: k * 31, cal: k % 3 ? 0 : 40, primera: k % 5 === 0, domina: k % 4 !== 1, jueces: [900 + r.ent(201), 900 + r.ent(201), 900 + r.ent(201)], reloj: 30000 };
    const g = gestos(ctx, { sd: 15 + r.ent(60), pelea: 60 }, k * 17), a = simular(ctx, g.conf, g.ent);
    ok(JSON.stringify(a.res) === JSON.stringify(g.res), `intento ${k}: simular no da lo mismo que generar`);
    // avance en pasos irregulares, como los cuadros de un navegador, con las entradas intercaladas
    const m = new Intento(ctx); let i = 0, t = 0, conf = false;
    while (!m.res && t < 200000) {
      t += 1 + r.ent(40);
      if (!conf && g.conf <= t) { m.confirmar(g.conf); conf = true; }
      while (i < g.ent.length && g.ent[i][0] <= t) { m.entrada(g.ent[i][0], g.ent[i][1]); i++; }
      m.avanzar(t);
    }
    ok(JSON.stringify(m.res) === JSON.stringify(a.res), `intento ${k}: avanzar de a pasos da otro resultado`);
    // lo que se ve en un instante intermedio es prefijo de lo final: si a mitad de camino ya terminó, terminó igual
    const mitad = simular(ctx, g.conf, g.ent, (a.res.t >> 1)); ok(!mitad.res, `intento ${k}: termina antes de tiempo`);
    causas[a.res.res + (a.res.causa ? ':' + a.res.causa : '')] = (causas[a.res.res + (a.res.causa ? ':' + a.res.causa : '')] || 0) + 1; n++;
  }
  console.log(`5. ${n} intentos en vivo contra recalculados · resultados vistos: ${Object.keys(causas).sort().join(', ')}`);
}

// ---------- 7. nivel de control Fácil ----------
{
  // la capa y los textos son puros: sin DOM ni reloj
  for (const f of ['web/js/game/controles.js', 'web/js/game/ui/mensajes.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const re of [/\bDate\b/, /\bperformance\b/, /\bsetTimeout\b/, /\bdocument\b/, /\bwindow\b/, /\bfetch\b/, /Math\.random/]) ok(!re.test(src), `${f}: usa ${re.source}`);
  }
  // partidas de referencia en Fácil
  const casos = []; for (let k = 0; k < 9; k++) casos.push({ semilla: 2000003 * (k + 1), nivel: NIV[k % 3], persona: k % 3 });
  const hoy = casos.map(c => ({ ...c, tabla: resumen(jugar(c.semilla, c.nivel, c.persona, { ctl: 'f' }).p.tabla()) }));
  if (UPDATE || !fs.existsSync(REF_F)) { fs.writeFileSync(REF_F, JSON.stringify({ datos: datos.huella, casos: hoy }, null, 1) + '\n'); console.log('7. referencia de Fácil escrita en tools/sim_ref_facil.json'); }
  else { const ref = JSON.parse(fs.readFileSync(REF_F, 'utf8')); ok(ref.datos === datos.huella, 'la referencia de Fácil es de otra huella'); ref.casos.forEach((c, i) => ok(c.tabla === hoy[i]?.tabla, `referencia Fácil ${i} (semilla ${c.semilla}): guardado «${c.tabla}», hoy «${hoy[i]?.tabla}»`)); }
  // partidas en Fácil: en vivo contra recalculadas; el nivel queda en el registro y cambia el resultado si se lo adultera
  let n = 0, validos = 0, intentos = 0, distintas = 0; const M2 = Math.max(60, N / 5 | 0);
  for (let k = 0; k < M2; k++) {
    const semilla = mezclar(k, 91), persona = k % 3, { p, bit } = jugar(semilla, NIV[k % 3], persona, { ctl: 'f', cal: k % 5 === 0 ? 40 : 0, primera: k % 7 === 0 });
    const reg = JSON.parse(JSON.stringify(p.reg)), rc = recalcular(reg, datos), t = resumen(p.tabla());
    ok(reg.ctl === 'f', `semilla ${semilla}: el registro no guarda el nivel de control`);
    ok(rc.ok && resumen(rc.tabla) === t, `Fácil, semilla ${semilla}: recalcular da ${rc.ok ? resumen(rc.tabla) : rc.error} y en vivo ${t}`);
    for (const b of bit) if (b.a === persona && b.res !== 'desplazado') { intentos++; if (b.res === 'valido') validos++; }
    for (const c of reg.llamados) if (c.fin === 'intento') for (const e of c.ent) ok(Number.isInteger(e[0]) && (e[1] === 0 || e[1] === 1), `semilla ${semilla}: entrada mal formada en Fácil`);
    { const g = JSON.parse(JSON.stringify(reg)); g.ctl = 'x'; ok(!recalcular(g, datos).ok, `semilla ${semilla}: se aceptó un nivel de control desconocido`); }
    { const g = JSON.parse(JSON.stringify(reg)); g.ctl = 'c'; const r2 = recalcular(g, datos); if (!r2.ok || resumen(r2.tabla) !== t) distintas++; }
    n++;
  }
  ok(distintas > M2 / 2, `cambiar el nivel de control del registro casi no cambia el resultado (${distintas} de ${M2})`);
  // un registro sin `ctl` es Clásico: las partidas de siempre recalculan igual con el campo y sin él
  for (let k = 0; k < 30; k++) {
    const { p } = jugar(mezclar(k, 77), NIV[k % 3], k % 3), reg = JSON.parse(JSON.stringify(p.reg)); ok(reg.ctl === 'c', 'una partida sin nivel de control no queda como Clásico');
    delete reg.ctl; const rc = recalcular(reg, datos); ok(rc.ok && resumen(rc.tabla) === resumen(p.tabla()), `registro sin ctl, partida ${k}: ${rc.ok ? 'otra tabla' : rc.error}`);
  }
  try { new Partida(datos, { semilla: 1, nivel: 'normal', cal: 0, primera: false, ctl: 'z', atletas: IDS.map(id => ({ id, ctrl: 'juego' })) }); ok(false, 'Partida aceptó un nivel de control desconocido'); } catch { /* bien */ }
  // intentos sueltos: el bot incremental, tocar() sobre la lista (lo que hace el juego en cada tecla) y el avance a pasos irregulares dan lo mismo
  let k2 = 0; const vistos = new Set();
  for (let k = 0; k < 400; k++) {
    const r = new Azar(mezclar(k, 6)), lev = k % 2 ? 'c' : 's', env = ['split', 'power', 'squat'][k % 3];
    const ctx = { lev, env: lev === 'c' ? env : undefined, I: 8500 + r.ent(2000), tec: 5 + r.ent(5), temple: k % 4 ? 0 : 8, garra: 5 + r.ent(5), anclas: datos.modelos[k % 2 ? 'ventura' : 'brenner'], semilla: k * 37, cal: k % 3 ? 0 : 40, primera: k % 5 === 0, domina: k % 4 !== 1, jueces: [900 + r.ent(201), 900 + r.ent(201), 900 + r.ent(201)], reloj: 30000, ctl: 'f' };
    const S = jugarSenal(ctx, { ...BOTS.casual, sd: 20 + r.ent(200) }, k * 19), a = simular(ctx, S.conf, S.ent);
    ok(JSON.stringify(a.res) === JSON.stringify(S.m.res), `Fácil, intento ${k}: simular no da lo mismo que jugar`);
    // las mismas teclas, por la vía del juego: cada una recalcula desde cero y pasa por la capa. Las teclas son los instantes de los eventos no automáticos.
    const teclas = []; { const m = new Intento(ctx); m.confirmar(S.conf); for (const [t, v] of S.ent) { m.avanzar(t); const auto = m.fase === 'fijacion' && v === 0; if (!auto && teclas[teclas.length - 1] !== t) teclas.push(t); m.entrada(t, v); } }
    const ent = []; for (const t of teclas) tocar(ctx, S.conf, ent, t, 1, 'f'); const b = alDia(ctx, S.conf, ent, a.res.t + 2000, 'f');
    ok(b.res && JSON.stringify(b.res) === JSON.stringify(a.res) && JSON.stringify(ent) === JSON.stringify(S.ent), `Fácil, intento ${k}: tocar() tecla por tecla no reproduce el intento`);
    const m = new Intento(ctx); let i = 0, t = 0, conf = false;
    while (!m.res && t < 200000) { t += 1 + r.ent(40); if (!conf && S.conf <= t) { m.confirmar(S.conf); conf = true; } while (i < S.ent.length && S.ent[i][0] <= t) { m.entrada(S.ent[i][0], S.ent[i][1]); i++; } m.avanzar(t); ok(m.res || senal(m, t, 'f') !== undefined, 'senal'); }
    ok(JSON.stringify(m.res) === JSON.stringify(a.res), `Fácil, intento ${k}: avanzar de a pasos da otro resultado`);
    vistos.add(a.res.res + (a.res.causa ? ':' + a.res.causa : '')); k2++;
    // Fácil no puede terminar en las causas que la capa vuelve imposibles
    ok(!['anticipado', 'antes', 'sin_apoyo'].includes(a.res.causa), `Fácil, intento ${k}: terminó en «${a.res.causa}»`);
  }
  // soltar la tecla no significa nada en Fácil; en Clásico la capa es la identidad
  { const ctx = { lev: 's', I: 9000, tec: 7, temple: 0, garra: 6, anclas: datos.modelos.ventura, semilla: 5, cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000, ctl: 'f' };
    const e1 = []; tocar(ctx, 1000, e1, 2600, 1, 'f'); const antes = JSON.stringify(e1); tocar(ctx, 1000, e1, 2700, 0, 'f'); ok(JSON.stringify(e1) === antes && e1.length === 1, 'Fácil: soltar la tecla agregó una entrada');
    const e0 = []; tocar(ctx, 1000, e0, 1500, 1, 'f'); ok(e0.length === 0, 'Fácil: un toque durante el acomodo llegó al núcleo');
    const c2 = { ...ctx, ctl: 'c' }, e2 = []; tocar(c2, 1000, e2, 2600, 0, 'c'); tocar(c2, 1000, e2, 2600, 1, 'c'); tocar(c2, 1000, e2, 2900, 0, 'c'); ok(JSON.stringify(e2) === '[[2600,1],[2900,0]]', 'Clásico: la capa no es la identidad: ' + JSON.stringify(e2)); }
  // toda causa tiene su línea, en los dos niveles y con y sin teclado
  for (const causa of Object.keys(CAUSAS)) for (const ctl of ['f', 'c']) for (const tactil of [false, true]) for (const e of [-500, 500]) {
    const txt = explicar({ res: 'fallo', causa, toques: e < 0 ? 0 : 9, gestos: [{ g: 'explosion', mov: 's', e, pal: 'tarde', fuera: e > 0 }, { g: 'recepcion', mov: 's', e, pal: 'tarde', fuera: true }] }, ctl, tactil);
    ok(typeof txt === 'string' && txt.length > 20 && txt.length < 130 && !/undefined|\{/.test(txt) && !(tactil && /ESPACIO/.test(txt)), `explicar(${causa}, ${ctl}${tactil ? ', táctil' : ''}): «${txt}»`);
  }
  ok(explicar({ res: 'valido', causa: null }, 'f') === '', 'explicar: un válido limpio no lleva línea');
  console.log(`7. Fácil: ${casos.length} partidas de referencia · ${n} partidas en vivo contra recalculadas (${Math.round(validos * 100 / intentos)} % de válidos del jugador) · ${k2} intentos por la capa · resultados vistos: ${[...vistos].sort().join(', ')}`);
}

console.log(fallas.length ? `\nFALLÓ: ${fallas.length} problemas` : `\nOK en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas.length ? 1 : 0);
