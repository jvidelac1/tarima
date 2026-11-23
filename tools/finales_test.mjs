// Finales validadas, ranking y campeonato semanal (LIF-10, LIF-9, LIF-8) con el Worker de verdad (worker/src/index.js) en
// Node sobre la D1 falsa de tools/servidor_local.mjs. Sin navegador ni red (unos segundos).
//  1. Una final jugada por el bot entra con su pase: el servidor la recalcula y guarda lo que da (no lo que diga el cliente).
//  2. El mismo pase no entra dos veces; un pase ajeno, vencido o de otro dispositivo, no entra.
//  3. Un registro adulterado (kilos, entradas, huella) se rechaza con 422 y no se guarda.
//  4. El campeonato: solo la semilla y las condiciones de la semana; el ranking semanal ordena por el mejor total de cada
//     dispositivo, muestra el apodo solo si la persona lo publicó y marca «yo».
//  5. El ranking global cuenta los campeonatos ganados de semanas cerradas.
import { d1Falsa, varsDelWorker } from './servidor_local.mjs';
import worker from '../worker/src/index.js';
import { finalBot } from './final_bot.mjs';
import { CAMPEONATO, semanaDe, semillaSemana } from '../web/js/sim/semana.js';
import { resumenFinal } from '../web/js/sim/final.js';

const ORIGEN = 'https://tarima.test', mal = [], ok = (c, m) => { if (!c) mal.push(m); };
const logReal = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('{"')) return; logReal(...a); };
const SECRETOS = { SECRETO_IP: 'ip'.repeat(16), SECRETO_DISPOSITIVO: 'dv'.repeat(16), SECRETO_PASE: 'pa'.repeat(16), SECRETO_BAJA: 'ba'.repeat(16) };
const db = d1Falsa(), env = { ...varsDelWorker(), GRATIS_ETAPA: 'final', GRATIS: '50', TOPE_IP: '500', ...SECRETOS, DB: db };
let nIp = 0;
async function api(ruta, cuerpo, { cookie = null, ip = `203.0.113.${(nIp++ % 200) + 1}` } = {}) {
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const r = await worker.fetch(new Request(ORIGEN + '/api/' + ruta, { method: 'POST', headers: { origin: ORIGEN, 'content-type': 'application/json', 'cf-connecting-ip': ip, 'x-tarima-pais': 'AR', ...(cookie ? { cookie: 'tdv=' + cookie } : {}) }, body: JSON.stringify(cuerpo) }), env, ctx);
  const txt = await r.text(); return { status: r.status, j: txt ? JSON.parse(txt) : null };
}
/** Un jugador: un dispositivo con su cookie; `jugar` pide un pase y manda la final del bot. */
function jugador() {
  const uuid = crypto.randomUUID();
  return {
    uuid,
    async pase() { const r = await api('partida', { dispositivo: uuid }, { cookie: uuid }); if (r.j.estado !== 'ok') throw new Error('sin pase: ' + JSON.stringify(r.j)); return r.j.pase; },
    async mandar(f, extra = {}) { const pase = extra.pase || await this.pase(); return api('final', { pase, registro: f.reg, ...extra }, { cookie: uuid }); },
    ranking(b = {}) { return api('ranking', b, { cookie: uuid }); },
  };
}

const ahora = Math.floor(Date.now() / 1000), sem = semanaDe(ahora);
// 1. una final libre
const A = jugador(), f1 = finalBot(1, { perfil: 'bueno' }), r1 = await A.mandar(f1, { saltos: 3, duracion_s: 400 });
ok(r1.status === 200 && r1.j.estado === 'ok', '1: la final del bot no entró: ' + JSON.stringify(r1));
ok(r1.j.total === resumenFinal(f1.p).total, `1: el total guardado (${r1.j.total}) no es el recalculado (${resumenFinal(f1.p).total})`);
const g1 = await db.prepare('SELECT total, validos, caidas, barritas, verdes, todo_verde, saltos, apodo, pais, campeonato FROM finales').first();
ok(g1 && g1.saltos === 3 && g1.apodo === null && g1.pais === 'AR' && g1.campeonato === 0 && g1.barritas > 0, '1: lo guardado no es lo esperado: ' + JSON.stringify(g1));
// 2. el mismo pase, un pase de otro dispositivo, un pase inventado
const pase = await A.pase(), f2 = finalBot(2);
const r2a = await A.mandar(f2, { pase }), r2b = await A.mandar(f2, { pase });
ok(r2a.j.estado === 'ok' && r2b.j.estado === 'repetida', '2: el mismo pase entró dos veces: ' + r2b.j.estado);
const B = jugador(), r2c = await B.mandar(f2, { pase: await A.pase() });
ok(r2c.status === 400, '2: un pase de otro dispositivo entró: ' + r2c.status);
const r2d = await A.mandar(f2, { pase: 'v1.abc.def' });
ok(r2d.status === 400, '2: un pase inventado entró: ' + r2d.status);
// 3. registros adulterados
const adulterar = [
  ['kilos', g => { const L = g.llamados.find(c => c.ent); L.kg += 20; }],
  ['entradas', g => { const L = g.llamados.find(c => c.ent && c.ent.length); L.ent = [[5, 1], [3, 0]]; }],
  ['huella', g => { g.datos = 'ffffffff'; }],
  ['apertura', g => { g.aperturas[1].s += 5; }],
];
for (const [k, fn] of adulterar) {
  const g = JSON.parse(JSON.stringify(finalBot(5).reg)); fn(g);
  const n0 = (await db.prepare('SELECT COUNT(*) n FROM finales').first()).n, r = await A.mandar({ reg: g });
  const n1 = (await db.prepare('SELECT COUNT(*) n FROM finales').first()).n;
  ok(r.status === 422 && n1 === n0, `3: un registro con ${k} adulterado no se rechazó (${r.status})`);
}
// 4. campeonato de la semana
const camp = (k, o = {}) => finalBot(k, { semilla: semillaSemana(sem.clave), nivel: CAMPEONATO.nivel, dif: CAMPEONATO.dif, ...o });
const r4a = await A.mandar(finalBot(7), { campeonato: true });
ok(r4a.status === 422, '4: una final con otra semilla entró como campeonato');
const r4b = await A.mandar(camp(8, { nivel: 'amistoso' }), { campeonato: true });
ok(r4b.status === 422, '4: una final del campeonato con otras condiciones entró');
const jug = [A, B, jugador(), jugador()], tot = [];
for (let k = 0; k < jug.length; k++) for (let n = 0; n < 2; n++) {
  const f = camp(20 + k * 2 + n, { perfil: k % 2 ? 'medio' : 'bueno', yo: k % 3 }), r = await jug[k].mandar(f, { campeonato: true, apodo: k === 0 ? 'Nasar' : 'Pepe', publico: k === 0 });
  ok(r.j.estado === 'ok' && r.j.campeonato && r.j.ranking?.de >= 1, '4: una final del campeonato no entró: ' + JSON.stringify(r.j));
  (tot[k] ||= []).push(r.j.total);
}
const rs = await A.ranking({ alcance: 'semana' }), F = rs.j.filas;
ok(rs.j.semana === sem.clave && rs.j.campeonato.semilla === semillaSemana(sem.clave), '4: el ranking no dice la semana o la semilla');
ok(F.length === 4, '4: el ranking semanal tiene ' + F.length + ' filas (4 dispositivos)');
ok(F.every((f, k) => !k || F[k - 1].total >= f.total), '4: el ranking semanal no está ordenado por total');
const mejores = tot.map(x => Math.max(...x)).sort((a, b) => b - a);
ok(JSON.stringify(F.map(f => f.total)) === JSON.stringify(mejores), `4: el ranking no usa el mejor total de cada uno: ${F.map(f => f.total)} vs ${mejores}`);
const yo = F.find(f => f.yo);
ok(yo && yo.apodo === 'Nasar' && F.filter(f => f.apodo).length === 1, '4: el apodo sale sin haberlo publicado, o «yo» no está marcado: ' + JSON.stringify(F));
const rp = await A.ranking({ alcance: 'semana', pais: true });
ok(rp.j.pais === 'AR' && rp.j.filas.length === 4, '4: el filtro por país no anda');
// 5. ranking global: un campeonato ganado en una semana cerrada cuenta como título
await db.prepare("UPDATE finales SET semana = '2000-W01' WHERE campeonato = 1").run();
const rg = await A.ranking({ alcance: 'global' }), G = rg.j.filas;
ok(G.length === 4 && G[0].titulos === 1 && G.slice(1).every(f => f.titulos === 0), '5: el ranking global no cuenta el título: ' + JSON.stringify(G.map(f => f.titulos)));
// 6. progresión (LIF-14): el bono de RM tiene que estar respaldado por oros validados con ese pesista; el perfil lo dice
const C = jugador(); let oros = 0, k6 = 300;
const sinRespaldo = await C.mandar(finalBot(k6++, { yo: 0, rm: { s: 1, c: 1 } }));
ok(sinRespaldo.status === 422 && /respaldo/.test(sinRespaldo.j.motivo || ''), '6: un bono de RM sin oros entró: ' + JSON.stringify(sinRespaldo.j));
for (let n = 0; n < 40 && oros < 2; n++) { const r = await C.mandar(finalBot(k6++, { yo: 0, perfil: 'bueno', nivel: 'amistoso' })); if (r.j.puesto === 1) oros++; }
ok(oros === 2, '6: el bot no ganó 2 oros con Compacto en 40 finales');
const conRespaldo = await C.mandar(finalBot(k6++, { yo: 0, rm: { s: 2, c: 2 } })), orosYa = conRespaldo.j.perfil?.pesistas?.ventura?.oros ?? 99, demas = await C.mandar(finalBot(k6++, { yo: 0, rm: { s: orosYa + 1, c: 2 } }));
ok(conRespaldo.j.estado === 'ok', '6: un bono de RM respaldado por 2 oros no entró: ' + JSON.stringify(conRespaldo.j).slice(0, 200));
ok(demas.status === 422, '6: un bono de RM mayor que los oros entró');
const otroPesista = await C.mandar(finalBot(k6++, { yo: 1, rm: { s: 1, c: 1 } }));
ok(otroPesista.status === 422, '6: los oros de un pesista dieron bono a otro');
const campRm = await C.mandar(camp(k6++, { yo: 0, rm: { s: 1, c: 1 } }), { campeonato: true });
ok(campRm.status === 422, '6: el campeonato aceptó progresión');
const pf = (await api('perfil', {}, { cookie: C.uuid })).j.perfil, pv = pf?.pesistas?.ventura;
ok(pv && pv.rm.s >= 2 && pf.oros >= 2 && pf.finales >= 3 && pf.recientes.length >= 3, '6: el perfil no dice los oros, el bono o las recientes: ' + JSON.stringify(pf).slice(0, 300));
ok(conRespaldo.j.perfil && conRespaldo.j.perfil.finales >= 3 && conRespaldo.j.perfil.pesistas.ventura, '6: /api/final no devuelve el perfil al día');
logReal(`perfil: ${pf.finales} finales · ${pf.oros} oros · Compacto RM +${pv?.rm.s} · mejor total ${pf.mejor_total}`);
// 7. desafío (LIF-12): la final de origen se pide por id; quien acepta juega la misma final, sin progresión
const D1 = jugador(), fo = finalBot(500, { yo: 1, perfil: 'bueno' }), ro = await D1.mandar(fo, { apodo: 'Nasar', publico: true });
ok(Number.isSafeInteger(ro.j.id), '7: /api/final no devuelve el id para compartir');
const dd = await api('desafio', { id: ro.j.id });
ok(dd.j.estado === 'ok' && dd.j.semilla === fo.reg.semilla && dd.j.total === ro.j.total && dd.j.apodo === 'Nasar' && dd.j.d === undefined, '7: el desafío no dice la final de origen: ' + JSON.stringify(dd.j));
const D2 = jugador(), fa = finalBot(501, { yo: 0, semilla: dd.j.semilla, nivel: dd.j.nivel }), ra = await D2.mandar(fa, { desafio: ro.j.id });
ok(ra.j.estado === 'ok' && ra.j.desafio?.total === ro.j.total, '7: la final del desafío no entró: ' + JSON.stringify(ra.j).slice(0, 200));
const rOtra = await D2.mandar(finalBot(502, { yo: 0 }), { desafio: ro.j.id });
ok(rOtra.status === 422, '7: una final con otra semilla entró como desafío');
const rRm = await D2.mandar(finalBot(503, { yo: 0, semilla: dd.j.semilla, nivel: dd.j.nivel, rm: { s: 1, c: 1 } }), { desafio: ro.j.id });
ok(rRm.status === 422, '7: el desafío aceptó progresión');
const dd2 = await api('desafio', { id: ro.j.id });
ok(dd2.j.aceptados === 1, '7: el desafío no cuenta quién lo aceptó: ' + dd2.j.aceptados);
ok((await api('desafio', { id: 999999 })).status === 404, '7: un desafío inexistente no da 404');
// 8. errores (LIF-26): se cuentan por día sin datos del dispositivo; uno mal formado no entra
for (let k = 0; k < 3; k++) await api('error', { tipo: 'TypeError', pantalla: 'intento', mensaje: 'x is undefined, escribir a ana@correo.com', archivo: 'main.js', linea: 12 });
await api('error', { tipo: 'no vale <b>', mensaje: 'x' });
const er = await db.prepare('SELECT tipo, pantalla, mensaje, n FROM errores').all();
ok(er.results.length === 1 && er.results[0].n === 3 && !/@/.test(er.results[0].mensaje), '8: los errores no se cuentan bien: ' + JSON.stringify(er.results));
// 9. plan de competencia (LIF-5): entra en el registro y el servidor lo recalcula; uno inventado no entra
const P1 = jugador(), rp1 = await P1.mandar(finalBot(700, { plan: 'record' })), gp = JSON.parse(JSON.stringify(finalBot(701, { plan: 'seguro' }).reg)); gp.plan = 'trampa';
ok(rp1.j.estado === 'ok', '9: una final con plan no entró: ' + JSON.stringify(rp1.j).slice(0, 150));
ok((await P1.mandar({ reg: gp })).status === 422, '9: un plan inventado entró');
// 10. categorías (LIF-15): la final guarda su categoría y el histórico se filtra por ella; el campeonato es en 88
const K1 = jugador(), rk1 = await K1.mandar(finalBot(800, { categoria: 71 }));
ok(rk1.j.estado === 'ok', '10: una final en 71 no entró: ' + JSON.stringify(rk1.j).slice(0, 150));
const g71 = await api('ranking', { alcance: 'global', categoria: 71 }, { cookie: K1.uuid });
ok(g71.j.categoria === 71 && g71.j.filas.length === 1 && g71.j.filas[0].yo, '10: el histórico de 71 no tiene solo esa final: ' + JSON.stringify(g71.j.filas));
ok((await K1.mandar(camp(801, { categoria: 71 }), { campeonato: true })).status === 422, '10: el campeonato aceptó otra categoría');
const gc = JSON.parse(JSON.stringify(finalBot(802).reg)); gc.categoria = 90;
ok((await K1.mandar({ reg: gc })).status === 422, '10: una categoría inventada entró');
// 11. entrenamiento (LIF-62): energía por final validada, sesiones recalculadas, topes y el bono en la final
const T1 = jugador();
ok((await api('entreno', { pesista: 'ventura', ejercicio: 'tiron', toques: [700, 700, 700] }, { cookie: T1.uuid })).status === 409, '11: entrenó sin finales');
await T1.mandar(finalBot(900, { yo: 0 }));
const e1 = await api('entreno', { pesista: 'ventura', ejercicio: 'tiron', toques: [700, 700, 700] }, { cookie: T1.uuid });
ok(e1.j.estado === 'ok' && e1.j.suma.kg_s === 1 && e1.j.disponibles === 1, '11: la sesión de tirones no sumó 1 kg: ' + JSON.stringify(e1.j));
const e2 = await api('entreno', { pesista: 'ventura', ejercicio: 'tecnica', toques: [0, 0, 700] }, { cookie: T1.uuid });
ok(e2.j.estado === 'ok' && e2.j.suma.tecnica === 0 && e2.j.disponibles === 0, '11: una sesión con 1 verde sumó o no gastó energía: ' + JSON.stringify(e2.j));
ok((await api('entreno', { pesista: 'ventura', ejercicio: 'tiron', toques: [700, 700, 700] }, { cookie: T1.uuid })).status === 409, '11: entrenó sin energía');
const bono = finalBot(901, { yo: 0, rm: { s: 1, c: 0 } }); const rb = await T1.mandar(bono);
ok(rb.j.estado === 'ok', '11: la final con el kilo entrenado no entró: ' + JSON.stringify(rb.j).slice(0, 160));
const rt = await T1.mandar(finalBot(902, { yo: 0, tecnica: 20 }));
ok(rt.status === 422, '11: la final con técnica no entrenada entró');
const pt = (await api('perfil', {}, { cookie: T1.uuid })).j.perfil;
ok(pt.entreno && pt.entreno.entrenados.ventura.kg_s === 1, '11: el perfil no dice lo entrenado: ' + JSON.stringify(pt.entreno));
// 12. escuelas (LIF-69): la búlgara suma 2 kg con 3 en el verde y nada con 2; la china, más técnica
const S1 = jugador(); await S1.mandar(finalBot(950, { yo: 0 })); await S1.mandar(finalBot(951, { yo: 0 }));
const b3 = await api('entreno', { pesista: 'ventura', ejercicio: 'tiron', toques: [700, 700, 700], escuela: 'bulgara' }, { cookie: S1.uuid });
const b2 = await api('entreno', { pesista: 'ventura', ejercicio: 'sentadilla', toques: [700, 700, 0], escuela: 'bulgara' }, { cookie: S1.uuid });
const c1 = await api('entreno', { pesista: 'ventura', ejercicio: 'tecnica', toques: [700, 700, 0], escuela: 'china' }, { cookie: S1.uuid });
ok(b3.j.suma?.kg_s === 2 && b2.j.suma?.kg_c === 0 && c1.j.suma?.tecnica === 40, '12: las escuelas no suman lo de su perfil: ' + JSON.stringify([b3.j.suma, b2.j.suma, c1.j.suma]));
// métricas de LIF-2 desde la tabla
const m = await db.prepare('SELECT COUNT(*) finales, SUM(caidas) caidas, SUM(intentos) intentos, SUM(todo_verde) todo_verde, SUM(saltos) saltos FROM finales').first();
logReal(`finales guardadas: ${m.finales} · caídas ${m.caidas} de ${m.intentos} intentos · intentos todo verde ${m.todo_verde} · saltos ${m.saltos}`);
logReal(`ranking semanal: ${F.map(f => `${f.puesto}. ${f.apodo || 'anónimo'} ${f.total}${f.yo ? ' (yo)' : ''}`).join(' · ')}`);
logReal(mal.length ? `\nFALLÓ (${mal.length}):\n  ${mal.join('\n  ')}` : '\nOK: finales recalculadas en el servidor, pases de una vez, registros adulterados afuera, campeonato de la semana y ranking');
process.exit(mal.length ? 1 : 0);
