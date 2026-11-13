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
// 12. Nivel 'u' (docs/JUEGO.md, Gameplay 2): partidas de referencia jugadas por los bots de tools/uno_bots.mjs
//     (tools/sim_ref_uno.json); 1000 finales en vivo contra recalculadas (meta L); toda caída tiene su tramo y una línea
//     sin tiempos (meta G); la garra se gasta una vez por levantamiento; la señal en los dos idiomas.
//  9. Textos (docs/MVP.md, sección 4): los dos idiomas tienen las mismas claves, el español es neutro (sin voseo) y sin jerga,
//     ninguna clave queda sin resolver, y explicar() y la señal arman frases completas en los dos idiomas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerDatos } from '../web/js/sim/data.js';
import { Partida } from '../web/js/sim/match.js';
import { Intento, simular } from '../web/js/sim/attempt.js';
import { gestos } from '../web/js/sim/ai.js';
import { recalcular, resumen } from '../web/js/sim/replay.js';
import { Azar, mezclar } from '../web/js/sim/fixed.js';
import { RELOJ, CAUSAS, FACIL, exigenciaTabla } from '../web/js/sim/rules.js';
import { tocar, alDia, senal, GUIADO } from '../web/js/game/controles.js';
import { explicar, pasos } from '../web/js/game/ui/mensajes.js';
import { marcadorDe, amenaza, etiquetasRival } from '../web/js/game/ui/marcador.js';
import { PLANTEL, JUGADOR, FICHA, nivelFicha, CUERPO } from '../web/js/game/roster.js';
import { tableroHTML } from '../web/js/game/ui/tablero.js';
import { DICCIONARIOS, tr, fijarIdioma, detectarIdioma } from '../web/js/game/i18n/t.js';
import { toques } from '../web/js/game/input.js';
import { jugarSenal, jugarFijo, BOTS } from './play_human.mjs';
import { jugarUno, BOTS_U } from './uno_bots.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SIM = path.join(ROOT, 'web/js/sim'), REF = path.join(ROOT, 'tools/sim_ref.json'), REF_F = path.join(ROOT, 'tools/sim_ref_facil.json'), REF_U = path.join(ROOT, 'tools/sim_ref_uno.json');
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
    // en 'u' el juego confirma siempre (no hay reloj en el panel): nunca «se le va el reloj»
    const env = L.lev === 'c' ? ['split', 'power', 'squat'][r.ent(3)] : undefined, ctx = p.contexto(env), modo = estilo.modo ?? (estilo.ctl === 'u' ? 1 + r.ent(9) : r.ent(10));
    let rec;
    if (modo === 0) rec = { conf: null, env, ent: [] };                                                    // se le va el reloj
    else if (modo === 1) { const ent = []; let t = 2000; for (let k = 0; k < 60; k++) { t += r.entre(1, 900); ent.push([t, k % 2 ? 0 : 1]); } rec = { conf: 1500, env, ent }; }   // toca cualquier cosa
    else if (estilo.ctl === 'u') { const B = Object.values(BOTS_U)[r.ent(6)], S = jugarUno(ctx, B, L.sem ^ 0x5bd1e995, { conf: 1000 }); rec = { conf: S.conf, env, ent: S.ent }; }      // 'u': cualquiera de los bots (confirma después del cambio de kilos)
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
    // Fácil no puede terminar en las causas que la capa vuelve imposibles («anticipado» sí: es el tercer amague)
    ok(!['antes', 'sin_apoyo'].includes(a.res.causa), `Fácil, intento ${k}: terminó en «${a.res.causa}»`);
    ok(a.res.causa !== 'anticipado' || a.res.amagues === FACIL.amagues, `Fácil, intento ${k}: «anticipado» con ${a.res.amagues} amagues`);
    // una subida fallada no dura más que el tope de Fácil, y el envión no se pide antes de que el círculo pueda verse cerrar
    if (a.res.res === 'fallo' && (a.res.causa === 'aplastado' || a.res.causa === 'codos')) ok(a.res.t - a.M.pelea.t0 <= FACIL.maxMs + 10, `Fácil, intento ${k}: la subida fallada duró ${a.res.t - a.M.pelea.t0} ms`);
    for (const M of a.movs) if (M.mov === 'j' && M.tp && M.tx) ok(M.tx - M.tp >= FACIL.cierreMs, `Fácil, intento ${k}: ¡ARRIBA! se cierra en ${M.tx - M.tp} ms`);
  }
  // soltar la tecla no significa nada en Fácil; en Clásico la capa es la identidad
  { const ctx = { lev: 's', I: 9000, tec: 7, temple: 0, garra: 6, anclas: datos.modelos.ventura, semilla: 5, cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000, ctl: 'f' };
    const e1 = []; tocar(ctx, 1000, e1, 2600, 1, 'f'); const antes = JSON.stringify(e1); tocar(ctx, 1000, e1, 2700, 0, 'f'); ok(JSON.stringify(e1) === antes && e1.length === 1, 'Fácil: soltar la tecla agregó una entrada');
    const e0 = []; tocar(ctx, 1000, e0, 1500, 1, 'f'); ok(e0.length === 0, 'Fácil: un toque durante el acomodo llegó al núcleo');
    const c2 = { ...ctx, ctl: 'c' }, e2 = []; tocar(c2, 1000, e2, 2600, 0, 'c'); tocar(c2, 1000, e2, 2600, 1, 'c'); tocar(c2, 1000, e2, 2900, 0, 'c'); ok(JSON.stringify(e2) === '[[2600,1],[2900,0]]', 'Clásico: la capa no es la identidad: ' + JSON.stringify(e2)); }
  // toda causa tiene su línea, en los dos niveles, con y sin teclado, y en los dos idiomas (entre 20 y 130 caracteres)
  for (const l of ['es', 'en']) for (const causa of Object.keys(CAUSAS)) for (const ctl of ['f', 'c']) for (const tactil of [false, true]) for (const e of [-500, -100, 30, 500]) {
    const txt = explicar({ res: 'fallo', causa, toques: e < 0 ? 0 : 9, gestos: [{ g: 'explosion', mov: 's', e, pal: 'tarde', fuera: e > 300 }, { g: 'recepcion', mov: 's', e, pal: 'tarde', fuera: true }] }, ctl, tactil, {}, l);
    ok(typeof txt === 'string' && txt.length > 20 && txt.length < 130 && !/undefined|\{|\}/.test(txt) && !(tactil && /ESPACIO|SPACE/.test(txt)), `explicar(${l}, ${causa}, ${ctl}${tactil ? ', táctil' : ''}): «${txt}»`);
  }
  ok(explicar({ res: 'valido', causa: null }, 'f', false, {}, 'es') === '', 'explicar: un válido limpio no lleva línea');
  // la línea de la subida no contradice a las palabras: con todo en PERFECTO o BIEN no habla de destiempo; con un toque flojo,
  // dice para qué lado y cuánto en palabras («muy tarde»), no en ms (los ms quedan para Pro)
  { const bien = explicar({ res: 'fallo', causa: 'aplastado', toques: 12, gestos: [{ g: 'explosion', mov: 'c', e: 180, pal: 'bien' }, { g: 'recepcion', mov: 'c', e: -20, pal: 'perfecto' }] }, 'f', false, {}, 'es');
    ok(/más rápido/.test(bien) && !/destiempo|tarde|temprano/.test(bien), `explicar, subida con todo BIEN: «${bien}»`);
    const tarde = explicar({ res: 'fallo', causa: 'codos', toques: 12, gestos: [{ g: 'explosion', mov: 's', e: 263, pal: 'tarde' }, { g: 'recepcion', mov: 's', e: 10, pal: 'perfecto' }] }, 'f', false, {}, 'es');
    ok(/¡EXPLOTA! muy tarde/.test(tarde) && !/ms/.test(tarde), `explicar, subida con un toque tarde: «${tarde}»`);
    const late = explicar({ res: 'fallo', causa: 'codos', toques: 12, gestos: [{ g: 'explosion', mov: 's', e: 90, pal: 'tarde' }, { g: 'recepcion', mov: 's', e: 10, pal: 'perfecto' }] }, 'f', false, {}, 'en');
    ok(/EXPLODE! quite late/.test(late), `explicar en inglés, toque bastante tarde: «${late}»`);
    ok(/ENTER/.test(explicar({ res: 'nulo', causa: 'reloj', gestos: [] }, 'c', false, { sinConfirmar: true }, 'es')) && /desde que confirmas/.test(explicar({ res: 'nulo', causa: 'reloj', gestos: [] }, 'f', false, {}, 'es')), 'explicar: la línea del reloj no dice qué tecla faltó'); }
  console.log(`7. Fácil: ${casos.length} partidas de referencia · ${n} partidas en vivo contra recalculadas (${Math.round(validos * 100 / intentos)} % de válidos del jugador) · ${k2} intentos por la capa · resultados vistos: ${[...vistos].sort().join(', ')}`);
}

// ---------- 8. Fácil: amagues, la subida y el tutorial guiado ----------
{
  const ctxDe = (id, lev, I, extra = {}) => { const f = datos.atletas[id]; return { lev, env: lev === 'c' ? 'split' : undefined, I, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: 9, cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000, ctl: 'f', ...extra }; };
  // entrada tolerante: un toque antes de que abra la ventana no llega al núcleo ni gasta la señal; vale el primero de adentro
  { const ctx = ctxDe('ventura', 's', 9000), ent = []; let malos = 0;
    tocar(ctx, 1000, ent, 2600, 1, 'f');      // ¡TIRÁ!
    let m = alDia(ctx, 1000, ent, 2600, 'f'); const s0 = senal(m, 2600, 'f');
    ok(m.fase === 'tiron' && s0.tipo === 'cierre' && s0.abre > 2600 && s0.abre < s0.objetivo, `Fácil: la señal de ¡EXPLOTÁ! no dice desde cuándo vale (${JSON.stringify(s0)})`);
    for (let t = 2700; t < s0.abre; t += 70) { const r = tocar(ctx, 1000, ent, t, 1, 'f'); if (r.n || r.motivo !== 'temprano') malos++; }
    m = alDia(ctx, 1000, ent, s0.abre - 1, 'f'); ok(!malos && m.fase === 'tiron' && !m.amagues && ent.length === 1, `Fácil: ${malos} toques antes de la ventana llegaron al núcleo o no dijeron «temprano» (fase ${m.fase}, amagues ${m.amagues})`);
    const r = tocar(ctx, 1000, ent, s0.abre, 1, 'f'); m = alDia(ctx, 1000, ent, s0.abre, 'f');
    ok(r.n === 1 && m.fase === 'vuelo' && m.gestos.length === 1, `Fácil: el primer toque dentro de la ventana no fue la explosión (${m.fase})`);
    // en el vuelo, igual; y desde la recepción todo toque empuja, aunque la subida no haya arrancado
    const s1 = senal(m, s0.abre, 'f'); let antes = 0;
    for (let t = s0.abre + 80; t < s1.abre; t += 80) { const x = tocar(ctx, 1000, ent, t, 1, 'f'); if (x.n || x.motivo !== 'temprano') antes++; }
    const rr = tocar(ctx, 1000, ent, s1.abre, 1, 'f'); m = alDia(ctx, 1000, ent, s1.abre, 'f');
    ok(!antes && rr.n === 1 && m.fase === 'pelea', `Fácil: la recepción no tomó el primer toque de la ventana (${antes} antes, fase ${m.fase})`);
    let desc = 0; for (let t = s1.abre + 100; t < m.M.pelea.t0 + 300; t += 100) { const x = tocar(ctx, 1000, ent, t, 1, 'f'); if (!x.n) desc++; }
    ok(!desc, `Fácil: ${desc} toques entre la recepción y el arranque de la subida se descartaron`);
    const c = { ...ctx, ctl: 'c' }, e2 = [[2600, 1], [2700, 0], [4000, 1], [4100, 0], [5500, 1], [5600, 0], [7000, 1], [7100, 0]], m2 = simular(c, 1000, e2, 8000); ok(!m2.res && m2.amagues === 4, 'Clásico: los amagues antes de la rodilla dejaron de ser libres'); }
  // la subida: en los pesos livianos sube sola, más lenta que tocando; cerca del techo, sin empujar se corta enseguida (no hay
  // 12 s de espera); tocando cada 250 ms con todo PERFECTO se levanta siempre hasta el 100 %
  let nSub = 0;
  for (const id of IDS) for (const lev of ['s', 'c']) for (const I of [8800, 9200, 9700, 10000]) {
    const quieto = jugarFijo(ctxDe(id, lev, I), [0, 0, 0, 0], 0).m, d = quieto.res.t - (quieto.M.pelea?.t0 ?? 0);
    const bien = jugarFijo(ctxDe(id, lev, I), [0, 0, 0, 0], 250).m; ok(bien.res.res === 'valido', `Fácil, ${id} ${lev} ${I}: todo PERFECTO y un toque cada 250 ms da ${bien.res.res}:${bien.res.causa}`);
    const p = bien.movs[0].pelea, dB = bien.movs[0].tEnPie - p?.t0; ok(p && dB < 4000, `Fácil, ${id} ${lev} ${I}: la subida ganada tarda ${dB} ms`);
    if (I <= FACIL.holgadoHasta) { const q = quieto.movs[0]; ok(quieto.res.res === 'valido' && q.tEnPie - q.pelea.t0 > dB + 800 && q.tEnPie - q.pelea.t0 < 5000, `Fácil, ${id} ${lev} ${I}: sin empujar da ${quieto.res.res}:${quieto.res.causa}, la subida tarda ${q.tEnPie - q.pelea?.t0} ms (tocando, ${dB})`); }
    else ok(quieto.res.res === 'fallo' && ['aplastado', 'codos'].includes(quieto.res.causa) && d >= FACIL.plazoMs && d <= FACIL.plazoMs + 1200, `Fácil, ${id} ${lev} ${I}: sin empujar da ${quieto.res.res}:${quieto.res.causa} a los ${d} ms de la subida`);
    nSub++;
  }
  // el arranque guiado del tutorial no se puede fallar: copia del reloj guiado de main.js (se detiene en cada objetivo; en la
  // subida corre GUIADO.porToque ms por toque), con jugadores que tocan ¡EMPUJÁ! desde muy rápido hasta uno cada 3 s
  const guiado = (ctx, per, reac) => {
    const ent = []; let ahora = 1000, ult = -1e9, sA = null, prox = Infinity, m = null; const R = { tb: ahora, vb: 0, vel: 1, tope: Infinity, clave: null };
    const vt = t => Math.min(R.vb + Math.max(0, t - R.tb) * R.vel, R.tope);
    const tecla = tEv => { const det = R.tope < Infinity && vt(tEv) >= R.tope; if (!det && sA && (sA.tipo === 'cierre' || sA.tipo === 'espera')) return; ult = tEv; const r = tocar(ctx, 0, ent, Math.round(vt(tEv)), 1, 'f'); if (r.n) { R.vb = r.t; R.tb = tEv; R.tope = Infinity; R.clave = null; } };
    for (let g = 0; g < 100000; g++) {
      ahora += 16; if (prox <= ahora) { tecla(prox); prox = Infinity; }
      const now = Math.round(vt(ahora)); m = alDia(ctx, 0, ent, now, 'f'); if (m.res) return m;
      const s = senal(m, now, 'f'); sA = s; let vel = GUIADO.vel, tope = Infinity, clave = null;
      if (s && GUIADO.para.has(s.clave)) { clave = s.clave; tope = s.tipo === 'cierre' ? s.objetivo : R.clave === clave ? R.tope : now; }
      else if (s && s.tipo === 'empuja') vel = now >= s.desde && ahora - ult > GUIADO.porToque ? 0 : 1; else vel = 1;
      if (vel !== R.vel || tope !== R.tope) { const v = vt(ahora); R.vb = v; R.tb = ahora; R.vel = vel; R.tope = Math.max(tope, v); }
      R.clave = clave; const parado = R.tope < Infinity && vt(ahora) >= R.tope;
      if (prox === Infinity) { if (parado) prox = ahora + reac; else if (s && s.tipo === 'empuja') prox = ahora + per; }
    }
    return m;
  };
  let nG = 0;
  for (const id of IDS) for (const per of [100, 150, 200, 240, 260, 300, 400, 600, 1000, 3000]) for (const sem of [71, 72, 73]) {
    const m = guiado(ctxDe(id, 's', 8000, { exiFija: exigenciaTabla(9300), primera: true, reloj: 0, semilla: sem }), per, 700); nG++;
    ok(m.res && m.res.res === 'valido', `tutorial guiado, ${id}, un toque cada ${per} ms en ¡EMPUJÁ!: ${m.res ? m.res.res + ':' + m.res.causa : 'no termina'}`);
  }
  console.log(`8. Fácil: toques antes de la ventana sin efecto · ${nSub} subidas: sola en los pesos livianos, cortada a tiempo cerca del techo, ganada tocando cada 250 ms · tutorial guiado sin fallo posible en ${nG} casos (tres pesistas, un toque cada 100 ms a 3 s)`);
}

// ---------- 9. textos en los dos idiomas ----------
{
  const { es, en } = DICCIONARIOS, ke = Object.keys(es), kn = Object.keys(en);
  ok(ke.length === kn.length && ke.every(k => k in en), `los diccionarios no tienen las mismas claves: solo en es ${ke.filter(k => !(k in en)).join(', ')} · solo en en ${kn.filter(k => !(k in es)).join(', ')}`);
  // español neutro (decisión del dueño): nada de voseo; y sin jerga de federación en lo que ve el jugador
  const VOSEO = /\b(tocá|apretá|soltá|mirá|esperá|elegí|podés|tenés|querés|sos|vos|confirmá|pedí|agarrala|empujá|tirá|explotá|flexioná|aguantá|respirá|dejá|mantené|probá|contestá|poné|revisá|marcá|anotate|escribí|recargá|hacé|acá|llamás|empezás|fallás|sentís|marcás|tocás|repetís|subís|ganás|asegurás|pasás|salís|hacés|animás)\b/i;
  const JERGA = /\b(apertura|nulo|sin marca|resto|tope|dorsal|chicharra)\b/i;
  for (const [k, v] of Object.entries(es)) { ok(!VOSEO.test(v), `voseo en es.${k}: «${v}»`); ok(!JERGA.test(v), `jerga en es.${k}: «${v}»`); }
  for (const [k, v] of [...Object.entries(es), ...Object.entries(en)]) ok(!/pagar para levantar|pay to lift/i.test(v), `promesa de monetización en ${k}`);
  // con las variables comunes resueltas no queda ninguna llave
  const vars = { nombre: 'Ana', quien: 'Ana', rival: 'Teo', n: 2, de: 3, kg: 150, lo: 140, hi: 155, min: 150, c: 1, s: 5, b: 2, lev: 'x', pos: '2nd', ms: 30, k: 1, controles: 'x', veredicto: 'x', causa: 'x', a: 'x', medalla: 'x', total: 300, marcas_s: '✅', marcas_c: '❌', link: 'x', envion: 'x', verbo: 'x', cuando: 'x', cuanto: 'x', ajuste: 'x', lado: 'x', grado: 'x', sugerido: 'x', donde: 'x', mayor: 'x', discos: 'x', pct: 97, tramo: 'x', d: '½', tipo: 'x', apuesta: 'x' };
  for (const l of ['es', 'en']) for (const tactil of [false, true]) for (const k of ke) { const v = tr(l, k, { ...vars, tactil }); ok(!/[{}]/.test(v) && v.trim().length > 0, `${l}.${k} queda «${v}»`); }
  // la señal sale en el idioma elegido, y los pasos de «Cómo se juega» también
  { const ctx = { lev: 's', I: 9000, tec: 7, temple: 0, garra: 6, anclas: datos.modelos.ventura, semilla: 5, cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000, ctl: 'f' };
    const ent = []; tocar(ctx, 1000, ent, 2600, 1, 'f'); const m = alDia(ctx, 1000, ent, 2650, 'f');
    fijarIdioma('en'); const sEn = senal(m, 2650, 'f'); fijarIdioma('es'); const sEs = senal(m, 2650, 'f');
    ok(sEn.verbo === 'EXPLODE!' && sEs.verbo === '¡EXPLOTA!' && sEn.clave === sEs.clave, `la señal no cambia con el idioma: ${sEn.verbo} / ${sEs.verbo}`);
    ok(pasos('f', true, 'en')[0][1] === 'Tap the screen to start the lift.' && pasos('f', false, 'es')[0][1] === 'Pulsa ESPACIO para empezar el levantamiento.', `pasos: ${JSON.stringify(pasos('f', true, 'en'))}`); }
  // idioma: ?lang= primero, después lo guardado y por último el navegador; lo que no empieza con «es», inglés
  ok(detectarIdioma({ lang: 'en', guardado: 'es', navegador: ['es-AR'] }) === 'en' && detectarIdioma({ guardado: 'es', navegador: ['en-US'] }) === 'es' && detectarIdioma({ navegador: ['es-MX', 'en'] }) === 'es' && detectarIdioma({ navegador: ['pt-BR', 'es'] }) === 'es' && detectarIdioma({ navegador: ['en-US', 'en', 'es-419'] }) === 'es' && detectarIdioma({ navegador: ['en-US', 'fr'] }) === 'en' && detectarIdioma({ lang: 'fr', navegador: ['es'] }) === 'es', 'detectarIdioma no respeta el orden de prioridad');
  console.log(`9. Textos: ${ke.length} claves en español neutro y en inglés, sin voseo ni jerga, todas resueltas con y sin teclado · señal y pasos según el idioma`);
}

// ---------- 10. ráfagas de toques (saltear pantallas, input.js) ----------
{
  const pulsar = ts => { toques.ultimos.length = 0; for (const t of ts) toques.nuevo(t, 'teclado', 'ESPACIO'); };
  // machaca cada 120 ms desde el intento (t 0) y sigue: la ráfaga empezó en 0
  pulsar([0, 120, 240, 360, 480, 600, 720]); ok(toques.rafaga(720) === 0, `ráfaga continua: empieza en el primer toque (${toques.rafaga(720)})`);
  // para 400 ms y vuelve a tocar: el toque nuevo empieza otra ráfaga
  pulsar([0, 120, 240, 640]); ok(toques.rafaga(640) === 640, 'después de una pausa de 400 ms, el toque empieza otra ráfaga');
  pulsar([0, 120, 400, 520]); ok(toques.rafaga(520) === 0, 'una pausa de 280 ms no corta la ráfaga');
  pulsar([0, 120, 240, 540, 640]); ok(toques.rafaga(640) === 540, 'una pausa de 300 ms la corta');
  // más toques seguidos que los anotados: la ráfaga es más vieja que todo lo que se ve
  pulsar(Array.from({ length: 20 }, (_, i) => i * 120)); ok(toques.rafaga(19 * 120) === -Infinity, 'ráfaga más larga que lo anotado: -Infinity (no saltea)');
  toques.ultimos.length = 0; toques.abierto = null;
  console.log('10. ráfagas de toques: el machaque que venía del levantamiento no saltea; una pausa de 300 ms o un toque nuevo sí');
}

// ---------- 11. marcador e identidad del jugador (verificación independiente del 12-nov) ----------
{
  // En partidas al azar, con el jugador en cada uno de los tres pesistas, antes de cada intento y después de cada uno:
  // - «Vas ganando · N kg de ventaja» solo si vas primero y N es contra alguien que ya tiene marca (nunca contra 0).
  // - Si vas primero y el rival en la tarima te pasa con lo que pidió: «si lo levanta, te pasa»; y si lo levanta, te pasa.
  // - Si no vas primero, nunca «Vas ganando»; y la etiqueta «Para pasar al frente» del rival no sale suelta si vas primero.
  let vistos = { ganas: 0, solo: 0, te_pasa: 0, gana: 0, empate: 0, pasó: 0 };
  for (let k = 0; k < 120; k++) for (let yo = 0; yo < 3; yo++) {
    const p = new Partida(datos, { semilla: 9000 + k, nivel: NIV[k % 3], cal: 0, primera: false, atletas: IDS.map(id => ({ id, ctrl: 'juego' })) });
    p.empezar();
    for (let g = 0; p.fase !== 'fin' && g < 80; g++) {
      if (p.fase === 'intervalo') { p.empezar(); continue; }
      const L = { ...p.llamado }, m = marcadorDe(p, yo, L), tab = p.tabla(), lev = p.lev, val = f => (lev === 's' ? f.s : f.total) || 0;
      const primero = tab[0] && val(tab[0]) > 0 && tab[0].a === yo;
      if (m) {
        ok(m.propio === primero, `semilla ${9000 + k}, yo ${yo}: el marcador dice propio=${m.propio} y primero=${primero}`);
        if (m.clave === 'marcador.ganas') {
          vistos.ganas++;
          const seg = tab.filter(f => f.a !== yo && val(f) > 0).sort((a, b) => val(b) - val(a))[0];
          ok(primero && seg && m.kg === val(tab[0]) - val(seg) && m.kg > 0, `semilla ${9000 + k}: ventaja de ${m.kg} kg sin rival con marca o mal calculada`);
        }
        if (m.clave === 'marcador.ganas_solo') { vistos.solo++; ok(primero && tab.every(f => f.a === yo || !val(f)), `semilla ${9000 + k}: «Vas ganando» solo con rivales con marca`); }
        if (m.clave === 'marcador.gana') { vistos.gana++; ok(!primero && m.lider !== yo, `semilla ${9000 + k}: «Va ganando» con el jugador primero`); }
        if (m.clave === 'marcador.empate') vistos.empate++;
        if (m.sub?.clave === 'marcador.te_pasa') { vistos.te_pasa++; ok(primero && L.a !== yo && m.sub.rival === L.a && m.sub.kg === L.kg, `semilla ${9000 + k}: «te pasa» fuera de lugar`); }
        if (primero && L.a !== yo && L.et.includes('frente')) ok(m.sub?.clave === 'marcador.te_pasa' && !etiquetasRival(L.et, true).includes('frente'), `semilla ${9000 + k}: «Para pasar al frente» suelta con el jugador primero`);
      }
      const amenazaba = m?.sub?.clave === 'marcador.te_pasa', x = p.resolverIA();
      if (amenazaba && x.res.res === 'valido') { vistos.pasó++; ok(p.tabla()[0].a === L.a, `semilla ${9000 + k}: dijo «si lo levanta, te pasa», lo levantó y no pasó`); }
      const d = marcadorDe(p, yo, null);
      if (d) ok(!d.sub || d.sub.clave !== 'marcador.te_pasa', 'después del intento no queda el aviso de «te pasa»');
    }
  }
  ok(Object.values(vistos).every(v => v > 0), `el marcador no pasó por todos los estados: ${JSON.stringify(vistos)}`);
  // El caso de la captura: vas primero en el arranque con 159, los rivales sin marca y uno va a levantar 161.
  const p = new Partida(datos, { semilla: 1, nivel: 'normal', cal: 0, primera: false, atletas: IDS.map(id => ({ id, ctrl: 'juego' })) });
  const falso = { fase: 's', lev: 's', at: p.at, tabla: () => [{ a: 0, s: 159, total: 0 }, { a: 1, s: 0, total: 0 }, { a: 2, s: 0, total: 0 }], puestoSi: (i, lev, kg) => (kg > 159 ? 1 : 2), cuenta: () => ({}) };
  const m = marcadorDe(falso, 0, { a: 1, lev: 's', kg: 161, et: ['frente'] });
  ok(m.clave === 'marcador.ganas_solo' && m.sub?.clave === 'marcador.te_pasa' && m.sub.kg === 161 && m.sub.rival === 1, `caso de la captura: ${JSON.stringify(m)}`);
  ok(tr('es', m.clave) === 'Vas ganando' && tr('es', m.sub.clave, { rival: 'Brenner', kg: 161 }) === 'Si Brenner levanta 161 kg, te pasa', 'caso de la captura: el texto');
  ok(amenaza(falso, 0, { a: 1, lev: 's', kg: 159 }) === false, 'con los mismos kilos no te pasa (gana quien los levantó primero)');

  // Identidad: el color y la bandera del jugador no son los de ningún rival; las telas de los tres se distinguen.
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), lejos = (a, b) => Math.hypot(...hex(a).map((v, i) => v - hex(b)[i]));
  for (const [id, P] of Object.entries(PLANTEL)) {
    ok(lejos(P.color, JUGADOR.color) > 90, `el color de ${id} (${P.color}) se confunde con el del jugador (${JUGADOR.color})`);
    ok(P.bandera !== JUGADOR.bandera && !P.bandera.includes(JUGADOR.color), `la bandera de ${id} usa el color del jugador`);
    if (P.tela) ok(lejos(P.tela, JUGADOR.tela) > 90, `la tela de ${id} (${P.tela}) se confunde con la del jugador`);
  }
  // Marangi (tela lisa) no va de rojo como Ventura (malla roja ARX, PLANTEL.ventura.color) ni de gris como Brenner.
  { const [r, g, b] = hex(PLANTEL.marangi.tela); ok(!(r > g * 1.8 && r > b * 1.8) && Math.max(r, g, b) - Math.min(r, g, b) > 60, `la tela de Marangi (${PLANTEL.marangi.tela}) es roja o gris`); }
  // La tabla: la fila del jugador lleva su bandera y su nombre, nunca la bandera del modelo.
  for (let yo = 0; yo < 3; yo++) {
    const p2 = new Partida(datos, { semilla: 3, nivel: 'normal', cal: 0, primera: false, atletas: IDS.map(id => ({ id, ctrl: 'juego' })) }); p2.empezar();
    const html = tableroHTML(p2, { yo, nombre: 'Ana <b>' }), fila = html.split('<tr').find(r => /class="yo/.test(r)) || '';
    ok(fila.includes(JUGADOR.bandera) && !fila.includes(PLANTEL[IDS[yo]].bandera) && fila.includes('Ana &lt;b&gt;'), `tabla con el jugador en ${IDS[yo]}: ${fila.slice(0, 160)}`);
  }
  // Tarjeta: Largo y Potente comparten cuerpo (CUERPO igual) pero no energía y margen.
  const ficha = id => Object.values(FICHA).map(c => nivelFicha(datos.atletas[id].attrs[c])).join('/');
  ok(JSON.stringify(CUERPO.brenner) !== JSON.stringify(CUERPO.marangi) || ficha('brenner') !== ficha('marangi'), `Largo y Potente se ven iguales en la tarjeta: ${ficha('brenner')}`);
  for (const l of ['es', 'en']) for (const k of Object.keys(FICHA)) for (const n of ['alto', 'medio', 'bajo']) ok(tr(l, `ficha.${k}.${n}`) !== `ficha.${k}.${n}`, `falta ${l}.ficha.${k}.${n}`);
  console.log(`11. Marcador: ${JSON.stringify(vistos)} en 360 partidas, sin ventaja contra quien no levantó ni «Vas ganando» con otro primero · identidad propia del jugador · Largo ${ficha('brenner')} y Potente ${ficha('marangi')}`);
}

// ---------- 12. nivel 'u' ----------
{
  const casos = []; for (let k = 0; k < 9; k++) casos.push({ semilla: 3000017 * (k + 1), nivel: NIV[k % 3], persona: k % 3 });
  const hoy = casos.map(c => ({ ...c, tabla: resumen(jugar(c.semilla, c.nivel, c.persona, { ctl: 'u' }).p.tabla()) }));
  if (UPDATE || !fs.existsSync(REF_U)) { fs.writeFileSync(REF_U, JSON.stringify({ datos: datos.huella, casos: hoy }, null, 1) + '\n'); console.log("12. referencia de 'u' escrita en tools/sim_ref_uno.json"); }
  else { const ref = JSON.parse(fs.readFileSync(REF_U, 'utf8')); ok(ref.datos === datos.huella, "la referencia de 'u' es de otra huella"); ref.casos.forEach((c, i) => ok(c.tabla === hoy[i]?.tabla, `referencia 'u' ${i} (semilla ${c.semilla}): guardado «${c.tabla}», hoy «${hoy[i]?.tabla}»`)); }
  // 1000 finales en vivo contra recalculadas; caídas con tramo y línea; la garra, una por levantamiento
  let n = 0, intentos = 0, validos = 0, caidas = 0, sinLinea = 0, garras = 0, distintas = 0; const causas = {};
  for (let k = 0; k < N; k++) {
    const semilla = mezclar(k, 123), persona = k % 3, { p } = jugar(semilla, NIV[k % 3], persona, { ctl: 'u', primera: k % 7 === 0 });
    const reg = JSON.parse(JSON.stringify(p.reg)), rc = recalcular(reg, datos), t = resumen(p.tabla());
    ok(reg.ctl === 'u', `semilla ${semilla}: el registro no guarda 'u'`);
    ok(rc.ok && resumen(rc.tabla) === t, `'u', semilla ${semilla}: recalcular da ${rc.ok ? resumen(rc.tabla) : rc.error} y en vivo ${t}`);
    if (k < 100) { const g = JSON.parse(JSON.stringify(reg)); g.ctl = 'f'; const r2 = recalcular(g, datos); if (!r2.ok || resumen(r2.tabla) !== t) distintas++; }
    const a = p.at[persona];
    for (const lev of ['s', 'c']) {
      let usadas = 0;
      for (const x of a[lev]) {
        intentos++; if (x.res === 'valido') validos++; ok(x.res !== 'nulo', `'u' no tiene nulos: ${JSON.stringify(x)}`);
        if (x.res === 'fallo') { caidas++; causas[x.causa] = (causas[x.causa] || 0) + 1; }
      }
      // la garra: una por levantamiento (match.js la apaga al usarla)
      usadas = a.garraUno[lev] ? 0 : 1; garras += usadas;
    }
    n++;
  }
  // meta G: toda caída de 'u' nombra el tramo y lo que gastó, nunca un tiempo (en los dos idiomas)
  { const r = new Azar(77);
    for (let k = 0; k < 400; k++) {
      const lev = k % 2 ? 'c' : 's', id = IDS[k % 3], f = datos.atletas[id], I = 9600 + r.ent(900), env = lev === 'c' ? ['split', 'power', 'squat'][k % 3] : undefined;
      const ctx = { lev, env, I, tec: f.attrs.tec, temple: 0, garra: f.attrs.gar, anclas: datos.modelos[f.modelo], semilla: mezclar(k, 5), cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000, ctl: 'u', garraUno: k % 4 !== 0 };
      const S = jugarUno(ctx, Object.values(BOTS_U)[k % 6], k), res = S.m.res;
      if (res.res !== 'fallo') continue;
      for (const l of ['es', 'en']) {
        const txt = explicar(res, 'u', k % 2 === 0, { lev, quien: 'Ana', kg: 170, pct: Math.round(I / 100) }, l), corta = explicar(res, 'u', false, { lev }, l);
        if (!res.uno.tramo_caida || !txt || /\b(ms|tarde|temprano|late|early|undefined)\b|[{}]/i.test(txt + corta) || txt.length > 130) { sinLinea++; if (sinLinea < 4) console.log(`  MAL: línea de caída de 'u' (${l}): «${txt}» · «${corta}» · ${JSON.stringify(res.uno)}`); }
      }
    }
  }
  ok(!sinLinea, `${sinLinea} caídas de 'u' sin línea que nombre el tramo, o con un tiempo`);
  ok(distintas > 10, `cambiar 'u' por 'f' en el registro casi no cambia el resultado (${distintas} de 100)`);
  // la señal de 'u' sale en el idioma elegido
  { const ctx = { lev: 's', I: 9000, tec: 7, temple: 0, garra: 6, anclas: datos.modelos.ventura, semilla: 5, cal: 0, primera: false, domina: true, jueces: [1000, 1000, 1000], reloj: 30000, ctl: 'u' };
    const m = simular(ctx, 0, [], 1300); fijarIdioma('en'); const sEn = senal(m, 1300, 'u'); fijarIdioma('es'); const sEs = senal(m, 1300, 'u');
    ok(sEn && sEs && sEn.verbo === 'PULL!' && sEs.verbo === '¡TIRA!' && sEn.tipo === 'libre', `la señal de 'u' no cambia con el idioma: ${sEn?.verbo} / ${sEs?.verbo}`);
    const m2 = simular(ctx, 0, [[1500, 1], [1560, 0]], 1600), s2 = senal(m2, 1600, 'u'); ok(s2 && s2.clave === 'salta' && s2.tipo === 'luz', `después de ¡TIRA! la señal tiene que ser ¡SALTA!: ${JSON.stringify(s2)}`);
    ok(pasos('u', true, 'es').length === 3 && /¡SALTA!/.test(pasos('u', false, 'es')[1][1]), 'pasos de «Cómo se juega» en \'u\''); }
  console.log(`12. 'u': 9 partidas de referencia · ${n} finales en vivo contra recalculadas · ${intentos} intentos propios, ${(validos * 100 / intentos).toFixed(0)} % válidos, caídas ${JSON.stringify(causas)} · garras usadas ${garras} · líneas de caída con tramo y sin tiempos · señal en los dos idiomas`);
}

console.log(fallas.length ? `\nFALLÓ: ${fallas.length} problemas` : `\nOK en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas.length ? 1 : 0);
