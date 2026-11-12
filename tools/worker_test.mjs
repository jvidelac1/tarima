// Prueba de la regla pura del Worker (docs/MVP.md 5.5 y 7), en Node y sin Cloudflare. Uso: node tools/worker_test.mjs
//  1. worker/src/reglas.js es puro: sin fetch, sin D1, sin reloj ni azar.
//  2. La regla de la cuenta sobre una base en memoria que cuenta igual que las consultas de worker/src/datos.js,
//     recorriendo la tabla «Qué tan fácil es saltearlo» de la sección 7.
//  3. Validaciones: IP y prefijo /64, mail, nombre, encuesta, banderas, CSV.
//  4. Tokens y pases (worker/src/cripto.js) con Web Crypto de Node.
// Las pruebas con D1, la API y el proxy corren en el runtime de Workers: cd worker && npm test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../worker/src/reglas.js';
import { leerPase, leerToken, pase, token } from '../worker/src/cripto.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fallas = []; let n = 0;
const ok = (c, msg) => { n++; if (!c) { fallas.push(msg); console.log('  MAL: ' + msg); } };
const igual = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// ---------- 1. pureza ----------
{
  const src = fs.readFileSync(path.join(ROOT, 'worker/src/reglas.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const re of [/\bfetch\b/, /\bDate\b/, /Math\.random/, /\bcrypto\b/, /\benv\.DB\b/, /\bprepare\(/, /\bimport\b/]) ok(!re.test(src), `reglas.js usa ${re.source}`);
}

// ---------- 2. la regla sobre una base en memoria ----------
class Base {
  constructor(env = {}) { this.env = env; this.disp = new Map(); this.partidas = []; this.encuestas = []; }
  dev(d, ahora) { if (!this.disp.has(d)) this.disp.set(d, { d, creado: ahora, lista_id: null, encuesta_en: null, flags: {} }); return this.disp.get(d); }
  // Igual que datos.js: contar()
  contar(d, i, ahora) {
    const desde = ahora - R.VENTANA_IP;
    return {
      usadas_d: this.partidas.filter(p => p.d === d && p.fuente !== 'lista').length,
      total_d: this.partidas.filter(p => p.d === d).length,
      usadas_i: this.partidas.filter(p => p.i === i && p.en > desde && !this.disp.get(p.d)?.lista_id).length,
      encuestas_i: this.encuestas.filter(e => e.i === i && e.en > desde).length,
    };
  }
  situacion(d, i, ahora) {
    const dev = this.dev(d, ahora), c = this.contar(d, i, ahora);
    return R.decidir({ anotado: !!dev.lista_id, encuesta: !!dev.encuesta_en, ...c, cfg: R.config(this.env, dev.flags) });
  }
  partida(d, i, ahora) {
    const r = this.situacion(d, i, ahora);
    if (r.puede) this.partidas.push({ d, i, en: ahora, fuente: r.fuente });
    return r;
  }
  // Igual que index.js: encuesta()
  encuesta(d, i, ahora) {
    const dev = this.dev(d, ahora), cfg = R.config(this.env, dev.flags);
    if (dev.encuesta_en) return 'ya_respondida';
    if (!dev.lista_id && this.contar(d, i, ahora).encuestas_i >= cfg.encuestas_por_ip) return 'ya_respondida';
    this.encuestas.push({ d, i: dev.lista_id ? null : i, en: ahora });
    dev.encuesta_en = ahora;
    return dev.lista_id ? 0 : cfg.bono;
  }
  anotar(d, ahora, id = 'L' + d) { this.dev(d, ahora).lista_id = id; }
  jugarHastaMuro(d, i, ahora, max = 50) { const fuentes = []; for (let k = 0; k < max; k++) { const r = this.partida(d, i, ahora); if (!r.puede) return { fuentes, muro: r }; fuentes.push(r.fuente); } return { fuentes, muro: null }; }
}

const T0 = 1_800_000_000, DIA = R.DIA;
{
  const b = new Base();
  // Jugador común: 2 finales y muro; recargar o volver otro día no cambia nada.
  let r = b.jugarHastaMuro('A', 'casa', T0);
  igual(r.fuentes, ['gratis', 'gratis'], 'dos gratis');
  igual([r.muro.motivo, r.muro.encuesta_disponible], ['dispositivo', true], 'muro por dispositivo con encuesta');
  igual(b.situacion('A', 'casa', T0 + 3 * DIA).puede, false, 'otro día sigue el muro');
  igual(b.situacion('A', 'casa', T0).quedan, 0, 'quedan 0 en el muro');
  // Borrar todo: dispositivo nuevo en la misma red. La IP frena a las 6.
  igual(b.jugarHastaMuro('A2', 'casa', T0).fuentes.length, 2, 'borrar datos 1: 2 más');
  r = b.jugarHastaMuro('A3', 'casa', T0);
  igual([r.fuentes.length, r.muro.motivo], [2, 'dispositivo'], 'borrar datos 2: 2 más (6 en la IP)');
  r = b.jugarHastaMuro('A4', 'casa', T0);
  igual([r.fuentes.length, r.muro.motivo], [0, 'ip'], 'borrar datos 3: muro por IP');
  igual(b.situacion('A4', 'casa', T0).quedan, 0, 'quedan 0 con la IP llena');
  // Cambiar de red y borrar: 2 más por red nueva.
  igual(b.jugarHastaMuro('A5', 'datos', T0).fuentes.length, 2, 'otra red: 2 más');
  // A los 30 días la IP se libera; el dispositivo no.
  igual(b.situacion('A4', 'casa', T0 + 31 * DIA).puede, true, 'la IP se libera a los 30 días');
  igual(b.situacion('A', 'casa', T0 + 31 * DIA).puede, false, 'el dispositivo no se libera a los 30 días');
}
{
  // Encuesta: +2 por dispositivo y +2 a la IP; una vez; después solo el mail.
  const b = new Base();
  b.jugarHastaMuro('A', 'casa', T0);
  igual(b.encuesta('A', 'casa', T0), 2, 'bono de la encuesta');
  igual(b.encuesta('A', 'casa', T0), 'ya_respondida', 'una sola vez por dispositivo');
  igual(b.situacion('A', 'casa', T0).quedan, 2, 'quedan 2 después de la encuesta');
  const r = b.jugarHastaMuro('A', 'casa', T0);
  igual(r.fuentes, ['encuesta', 'encuesta'], 'finales de la encuesta');
  igual([r.muro.motivo, r.muro.encuesta_disponible], ['dispositivo', false], 'vuelve el muro sin encuesta');
  // La encuesta suma 2 a la IP: 6 + 2 = 8 finales en la red.
  b.jugarHastaMuro('B', 'casa', T0); b.jugarHastaMuro('C', 'casa', T0);
  igual(b.contar('X', 'casa', T0).usadas_i, 8, '8 finales en la red');
  igual(b.situacion('D', 'casa', T0).motivo, 'ip', 'tope de la IP con una encuesta: 8');
  // Hasta 3 encuestas por IP en 30 días.
  igual(b.encuesta('B', 'casa', T0), 2, 'segunda encuesta de la IP');
  igual(b.encuesta('C', 'casa', T0), 2, 'tercera encuesta de la IP');
  igual(b.situacion('D', 'casa', T0).encuesta_disponible, false, 'sin encuesta para el cuarto dispositivo');
  igual(b.encuesta('D', 'casa', T0), 'ya_respondida', 'cuarta encuesta de la IP');
  igual(b.encuesta('D', 'otra', T0), 2, 'desde otra red sí');
}
{
  // Anotarse: juego libre y sus finales dejan de pesar sobre la red.
  const b = new Base();
  for (const d of ['A', 'B', 'C']) b.jugarHastaMuro(d, 'casa', T0);
  igual(b.situacion('D', 'casa', T0).motivo, 'ip', 'red llena');
  b.anotar('A', T0);
  const s = b.situacion('A', 'casa', T0);
  igual([s.puede, s.fuente, s.quedan], [true, 'lista', null], 'anotado juega libre');
  for (let k = 0; k < 10; k++) b.partida('A', 'casa', T0);
  igual(b.contar('X', 'casa', T0).usadas_i, 4, 'las del anotado no cuentan para la IP');
  igual(b.jugarHastaMuro('D', 'casa', T0).fuentes.length, 2, 'hay lugar para otro en la red');
  // Encuesta de un anotado: sin premio y sin tocar la IP.
  igual(b.encuesta('A', 'casa', T0), 0, 'encuesta de un anotado sin bono');
  igual(b.contar('X', 'casa', T0).encuestas_i, 0, 'la encuesta del anotado no suma a la IP');
}
{
  // Casa con dos jugadores, y bandera de 1 final gratis.
  const b = new Base();
  igual(b.jugarHastaMuro('A', 'casa', T0).fuentes.length + b.jugarHastaMuro('B', 'casa', T0).fuentes.length, 4, 'casa con dos jugadores: 2 y 2');
  const c = new Base({ GRATIS: '2' });
  c.dev('A', T0).flags = { 'muro-partidas-gratis': '1' };
  igual(c.jugarHastaMuro('A', 'casa', T0).fuentes, ['gratis'], 'bandera de 1 final');
  c.encuesta('A', 'casa', T0);
  igual(c.jugarHastaMuro('A', 'casa', T0).fuentes, ['encuesta', 'encuesta'], 'con 1 gratis, la encuesta igual da 2');
  // Variables del Worker.
  const e = new Base({ GRATIS: '3', TOPE_IP: '4', BONO_ENCUESTA: '1', ENCUESTAS_POR_IP: '1' });
  igual(e.jugarHastaMuro('A', 'casa', T0).fuentes.length, 3, 'GRATIS=3');
  igual(e.jugarHastaMuro('B', 'casa', T0).fuentes.length, 1, 'TOPE_IP=4');
  igual(e.encuesta('B', 'casa', T0), 1, 'BONO_ENCUESTA=1');
  igual(e.encuesta('A', 'casa', T0), 'ya_respondida', 'ENCUESTAS_POR_IP=1');
  igual(R.config({ GRATIS: 'x', TOPE_IP: '-3' }, { 'muro-partidas-gratis': 'z' }), { gratis: 2, tope_ip: 6, bono: 2, encuestas_por_ip: 3 }, 'valores inválidos: por defecto');
}
igual([0, 1, 2, 7, 8, 100].map(d => R.diasDesde(T0, T0 + d * DIA + 5)), ['0', '1', '2-7', '2-7', '8+', '8+'], 'dias');

// ---------- 3. validaciones ----------
igual(R.prefijoIp('203.0.113.9'), '203.0.113.9', 'IPv4 entera');
igual(R.prefijoIp('::ffff:203.0.113.9'), '203.0.113.9', 'IPv4 mapeada');
for (const v of ['2001:db8:aa:1::9', '2001:0db8:00aa:0001:ffff:0:0:1', '2001:DB8:AA:1:1:2:3:4']) igual(R.prefijoIp(v), '2001:db8:aa:1::/64', `prefijo /64 de ${v}`);
igual(R.prefijoIp('2001:db8::1'), '2001:db8:0:0::/64', 'prefijo con ::');
igual(R.prefijoIp('::1'), '0:0:0:0::/64', 'loopback');
igual(R.prefijoIp('fe80::1%eth0'), 'fe80:0:0:0::/64', 'con zona');
igual(R.prefijoIp(''), 'sin-ip', 'sin IP');

const mails = {
  '  Ana.Gomez+x@Ejemplo.COM ': 'ana.gomez+x@ejemplo.com',
  'a@b.co': 'a@b.co',
  'pepe@correo.españa.es': 'pepe@correo.xn--espaa-rta.es',
  'sin-arroba.com': null, 'a@b': null, 'a@@b.com': null, '.a@b.com': null, 'a..b@c.com': null, 'a b@c.com': null,
  'a@b.com/x': null, 'a@b.com:25': null, 'a@-b.com': null, 'a@b.c0m': null, 'a@b.c': null, [`${'x'.repeat(65)}@b.com`]: null, 'a@[1.2.3.4]': null,
};
for (const [e, v] of Object.entries(mails)) igual(R.normalizarEmail(e), v, `mail ${JSON.stringify(e)}`);
igual(R.normalizarEmail(42), null, 'mail no texto');
ok(R.esDescartable('x@mailinator.com', new Set(['mailinator.com'])), 'descartable');
ok(R.esDescartable('x@a.mailinator.com', new Set(['mailinator.com'])), 'descartable con subdominio');
ok(!R.esDescartable('x@mailinator.com.ar', new Set(['mailinator.com'])), 'no descartable');

const nombres = { '  Juana   Pérez ': 'Juana Pérez', "O'Neil": "O'Neil", 'Jean-Luc': 'Jean-Luc', 'Zoë': 'Zoë', '李小龍': '李小龍',
  'A': null, ['x'.repeat(15)]: null, '<img>': null, 'Ana1': null, '-Ana': null, 'Rookie': null, 'debutante': null };
for (const [e, v] of Object.entries(nombres)) igual(R.normalizarNombre(e), v, `nombre ${JSON.stringify(e)}`);

const base = { q1: ['sedes'], q2: ['nada'], q3: 'compu', q4: 'no' };
igual(R.validarEncuesta(base), { ok: true, r: base }, 'encuesta mínima');
igual(R.validarEncuesta({ ...base, q5: ' hola\u0007 <script>x</script> mundo ' }).r.q5, 'hola x mundo', 'q5 sin controles ni HTML');
igual(R.validarEncuesta({ ...base, q5: '   ' }).r.q5, undefined, 'q5 vacía no va');
igual(R.validarEncuesta({ ...base, q5: 'ñ'.repeat(280) }).ok, true, 'q5 de 280');
for (const [r, e] of [
  [null, 'incompleta'], [{}, 'incompleta'], [{ ...base, q4: undefined }, 'incompleta'], [{ ...base, q1: [] }, 'incompleta'],
  [{ ...base, q1: 'sedes' }, 'formato'], [{ ...base, q1: ['sedes', 'sedes'] }, 'formato'], [{ ...base, q1: ['a', 'b', 'c'] }, 'formato'],
  [{ ...base, q2: ['nada', 'largo'] }, 'formato'], [{ ...base, q3: ['compu'] }, 'formato'], [{ ...base, q4: 'toString' }, 'formato'],
  [{ ...base, q1: ['__proto__'] }, 'formato'], [{ ...base, q5: 'ñ'.repeat(281) }, 'formato'], [{ ...base, q5: 5 }, 'formato'], [{ ...base, extra: 1 }, 'formato'],
]) igual(R.validarEncuesta(r), { ok: false, error: e }, `encuesta inválida ${JSON.stringify(r)?.slice(0, 60)}`);
{
  const p = R.propsEncuesta({ r: { q1: ['realismo', 'sedes'], q2: ['largo'], q3: 'tablet', q4: 'unico' }, ids: { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'e' }, encuestaId: 'S', envio: 'u', idioma: 'en', pais: 'ES' });
  igual(p.$survey_response_a, ['Más realismo (técnica, jueces, control antidoping)', 'Finales en sedes distintas'], 'etiquetas q1');
  igual(p.$survey_response_c, 'En una tablet', 'etiqueta q3');
  ok(!('$survey_response_e' in p), 'q5 ausente no va');
  igual(p.$survey_questions.map(q => q.id), ['a', 'b', 'c', 'd', 'e'], 'preguntas');
  igual([p.$survey_id, p.$survey_completed, p.$process_person_profile, p.idioma, p.pais], ['S', true, false, 'en', 'ES'], 'propiedades fijas');
}

const def = R.banderasPorDefecto();
igual(R.combinarBanderas(null, null), def, 'banderas por defecto');
igual(R.combinarBanderas(null, { 'muro-partidas-gratis': { enabled: true, variant: '1' }, 'invitacion-podio1': { enabled: false }, grabacion: { enabled: true, variant: 'muestra' } }),
  { 'muro-partidas-gratis': '1', 'muro-texto': 'a', 'invitacion-podio1': 'off', grabacion: 'muestra' }, 'banderas de PostHog');
igual(R.combinarBanderas({ 'muro-partidas-gratis': '1', 'muro-texto': 'b', grabacion: 'muestra' }, { 'muro-partidas-gratis': { variant: '2' }, 'muro-texto': { variant: 'a' }, grabacion: { variant: 'off' } }),
  { 'muro-partidas-gratis': '1', 'muro-texto': 'b', 'invitacion-podio1': 'on', grabacion: 'off' }, 'pegajosas fijas, las demás se refrescan');
igual(R.combinarBanderas(null, { 'muro-texto': { variant: 'zzz' } })['muro-texto'], 'a', 'variante desconocida: por defecto');
igual(R.combinarBanderas({ grabacion: 'muestra' }, null).grabacion, 'muestra', 'sin respuesta: queda lo guardado');

igual(['=1+1', '+a', '-a', '@a', 'a,b', 'di"jo', null, 7].map(R.celdaCsv), ["'=1+1", "'+a", "'-a", "'@a", '"a,b"', '"di""jo"', '', '7'], 'CSV');
igual(R.escHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;', 'escape HTML');

// ---------- 4. tokens y pases ----------
{
  const env = { SECRETO_BAJA: 'b'.repeat(32), SECRETO_PASE: 'p'.repeat(32) };
  const id = 'ab'.repeat(16);
  const tb = await token(env, id, 'baja'), tc = await token(env, id, 'confirmar');
  ok(tb !== tc, 'tokens distintos para baja y confirmar');
  igual(await leerToken(env, tb, 'baja'), id, 'token de baja válido');
  igual(await leerToken(env, tc, 'baja'), null, 'el de confirmar no da de baja');
  igual(await leerToken(env, tb.replace(/.$/, c => (c === '0' ? '1' : '0')), 'baja'), null, 'token adulterado');
  igual(await leerToken({ SECRETO_BAJA: 'otro'.repeat(8) }, tb, 'baja'), null, 'otro secreto');
  const p = await pase(env, { d: 'f'.repeat(64), n: 2, f: 'gratis', ahora: T0 });
  igual(await leerPase(env, p, T0 + 100), { d: 'f'.repeat(12), n: 2, f: 'gratis', exp: T0 + 3 * 3600 }, 'pase válido');
  igual(await leerPase(env, p, T0 + 3 * 3600 + 1), null, 'pase vencido');
  igual(await leerPase({ SECRETO_PASE: 'x'.repeat(32) }, p, T0), null, 'pase con otra firma');
}

console.log(fallas.length ? `worker_test: ${fallas.length} de ${n} controles fallaron` : `worker_test: ${n} controles, todos bien`);
process.exit(fallas.length ? 1 : 0);
