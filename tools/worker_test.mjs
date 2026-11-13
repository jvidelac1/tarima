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
    const premio = !dev.lista_id && cfg.bono > 0;
    if (premio && this.contar(d, i, ahora).encuestas_i >= cfg.encuestas_por_ip) return 'ya_respondida';
    this.encuestas.push({ d, i: premio ? i : null, en: ahora });
    dev.encuesta_en = ahora;
    return premio ? cfg.bono : 0;
  }
  anotar(d, ahora, id = 'L' + d) { this.dev(d, ahora).lista_id = id; }
  jugarHastaMuro(d, i, ahora, max = 50) { const fuentes = []; for (let k = 0; k < max; k++) { const r = this.partida(d, i, ahora); if (!r.puede) return { fuentes, muro: r }; fuentes.push(r.fuente); } return { fuentes, muro: null }; }
}

const T0 = 1_800_000_000, DIA = R.DIA;
// La maquinaria del bono de la encuesta (BONO_ENCUESTA > 0) se sigue probando con la regla vieja y bono 2; en producción
// el bono es 0 (decisión del dueño del 13 de noviembre: correo obligatorio), ver «2c».
const VIEJA = { BONO_ENCUESTA: '2' };
{
  const b = new Base(VIEJA);
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
  const b = new Base(VIEJA);
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
  const b = new Base(VIEJA);
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
  const b = new Base(VIEJA);
  igual(b.jugarHastaMuro('A', 'casa', T0).fuentes.length + b.jugarHastaMuro('B', 'casa', T0).fuentes.length, 4, 'casa con dos jugadores: 2 y 2');
  const c = new Base({ ...VIEJA, GRATIS: '2' });
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
  igual(R.config({ GRATIS: 'x', TOPE_IP: '-3' }, { 'muro-partidas-gratis': 'z' }), { etapa: 'final', gratis: 2, tope_ip: 6, bono: 0, encuestas_por_ip: 3 }, 'valores inválidos: por defecto (y la regla vieja, sin bono de encuesta)');
  igual(R.config({ BONO_ENCUESTA: 'x' }).bono, 0, 'BONO_ENCUESTA inválido o ausente: 0');
  igual(R.config({ GRATIS_ETAPA: 'cualquiera' }).etapa, 'final', 'GRATIS_ETAPA desconocida: la regla vieja');
}

// ---------- 2b. la regla del arranque gratis (GRATIS_ETAPA='arranque', decisión del dueño del 12 de noviembre) ----------
{
  // Igual que index.js: envion() con datos.js: partidaDe() y pasarAlEnvion().
  class BaseArranque extends Base {
    partida(d, i, ahora) {
      const r = this.situacion(d, i, ahora);
      if (r.puede) { this.partidas.push({ id: this.partidas.length + 1, d, i, en: ahora, fuente: r.fuente, etapa: r.etapa, envion_por: null }); r.id = this.partidas.length; }
      return r;
    }
    envion(d, i, id, ahora) {
      const p = this.partidas.find(x => x.id === id && x.d === d);
      if (!p) return 'pase';
      const dev = this.dev(d, ahora), sit = this.situacion(d, i, ahora);
      const cfg = R.config(this.env);
      const dec = R.decidirEnvion({ etapa: p.etapa, anotado: !!dev.lista_id, encuesta: !!dev.encuesta_en, encuesta_usada: this.partidas.some(x => x.d === d && x.envion_por === 'encuesta'), encuesta_disponible: sit.encuesta_disponible, regla: cfg.etapa, bono: cfg.bono });
      if (dec.puede && dec.via !== 'ya') { p.etapa = 'completa'; p.envion_por = dec.via; }
      return dec;
    }
  }
  const PROD = { GRATIS_ETAPA: 'arranque', GRATIS: '1', BONO_ENCUESTA: '0', TOPE_IP: '6', ENCUESTAS_POR_IP: '3' };
  // Con bono 1: la maquinaria del bono en el intervalo (no es producción).
  const BONO1 = { ...PROD, BONO_ENCUESTA: '1' };
  igual(R.config(PROD), { etapa: 'arranque', gratis: 1, tope_ip: 6, bono: 0, encuestas_por_ip: 3 }, 'config de producción');
  igual(R.config(PROD, { 'muro-partidas-gratis': '2' }).gratis, 1, 'con el arranque gratis la bandera muro-partidas-gratis no se usa');
  igual(R.config({ ...PROD, GRATIS_ETAPA: 'final', GRATIS: '2' }, { 'muro-partidas-gratis': '1' }).gratis, 1, 'con la regla vieja la bandera vuelve a valer');
  {
    // Jugador nuevo: una final con permiso solo para el arranque; el dos tiempos, negado; la próxima final, muro.
    const b = new BaseArranque(PROD);
    const r = b.partida('A', 'casa', T0);
    igual([r.puede, r.fuente, r.etapa, r.quedan], [true, 'gratis', 'arranque', 1], 'arranque gratis');
    const e = b.envion('A', 'casa', r.id, T0);
    igual([e.puede, e.motivo, e.encuesta_disponible], [false, 'envion', false], 'dos tiempos sin correo: muro, sin encuesta');
    igual([b.partida('A', 'casa', T0).puede, b.situacion('A', 'casa', T0).motivo], [false, 'dispositivo'], 'la final siguiente empieza con el muro');
    igual(b.envion('A', 'casa', 99, T0), 'pase', 'el dos tiempos de otra partida no existe');
    igual(b.envion('B', 'casa', r.id, T0), 'pase', 'ni el de la partida de otro dispositivo');
    // Se anota: el dos tiempos de esa final y juego libre, con todas las finales completas.
    b.anotar('A', T0);
    igual(b.envion('A', 'casa', r.id, T0), { puede: true, via: 'lista' }, 'anotado: dos tiempos');
    igual(b.envion('A', 'casa', r.id, T0), { puede: true, via: 'ya' }, 'pedirlo otra vez no cambia nada');
    const l = b.partida('A', 'casa', T0);
    igual([l.fuente, l.etapa, l.quedan], ['lista', 'completa', null], 'anotado: finales completas sin límite');
  }
  {
    // Con bono 1 (no es producción): la encuesta en el intervalo termina esa final y suma una completa; una vez.
    const b = new BaseArranque(BONO1);
    const r = b.partida('A', 'casa', T0);
    igual(b.encuesta('A', 'casa', T0), 1, 'la encuesta suma 1 (BONO_ENCUESTA)');
    igual(b.envion('A', 'casa', r.id, T0), { puede: true, via: 'encuesta' }, 'encuesta: dos tiempos de esa final');
    const x = b.partida('A', 'casa', T0);
    igual([x.puede, x.fuente, x.etapa, x.quedan], [true, 'encuesta', 'completa', 1], 'y una final completa más (quedan, antes de entregarla)');
    igual([b.partida('A', 'casa', T0).puede, b.situacion('A', 'casa', T0).encuesta_disponible], [false, false], 'después, muro sin encuesta');
    // Una segunda final en arranque del mismo dispositivo (con GRATIS=2) no recibe otro dos tiempos por la misma encuesta.
    const c = new BaseArranque({ ...BONO1, GRATIS: '2' });
    const p1 = c.partida('C', 'otra', T0);
    c.encuesta('C', 'otra', T0);
    igual(c.envion('C', 'otra', p1.id, T0).via, 'encuesta', 'GRATIS=2: la primera pasa con la encuesta');
    c.partidas.push({ id: 50, d: 'C', i: 'otra', en: T0, fuente: 'gratis', etapa: 'arranque', envion_por: null });
    igual(c.envion('C', 'otra', 50, T0).puede, false, 'la encuesta da el dos tiempos una sola vez por dispositivo');
  }
  {
    // Con bono 1: encuesta en el muro del principio (ya gastó el arranque y cerró): una final completa.
    const b = new BaseArranque(BONO1);
    b.partida('A', 'casa', T0);
    b.encuesta('A', 'casa', T0);
    const x = b.partida('A', 'casa', T0);
    igual([x.fuente, x.etapa, x.quedan, b.partida('A', 'casa', T0).puede], ['encuesta', 'completa', 1, false], 'encuesta en el muro del principio: una final completa (quedan antes de entregarla) y después muro');
  }
  {
    // Producción (bono 0, correo obligatorio): contestar la encuesta no da el dos tiempos, no cambia la etapa de la
    // próxima final, no da finales ni gasta los lugares de encuesta de la IP; el muro nunca ofrece la encuesta.
    const b = new BaseArranque(PROD);
    const r = b.partida('A', 'casa', T0);
    igual(b.situacion('A', 'casa', T0).encuesta_disponible, false, 'bono 0: sin encuesta en el muro');
    igual(b.encuesta('A', 'casa', T0), 0, 'bono 0: la encuesta no suma');
    igual(b.encuesta('A', 'casa', T0), 'ya_respondida', 'bono 0: una encuesta por dispositivo');
    igual(b.contar('X', 'casa', T0).encuestas_i, 0, 'bono 0: la encuesta no cuenta para la IP');
    igual(b.envion('A', 'casa', r.id, T0), { puede: false, motivo: 'envion', encuesta_disponible: false }, 'bono 0: la encuesta no da el dos tiempos');
    const s2 = b.situacion('A', 'casa', T0);
    igual([s2.puede, s2.motivo, s2.encuesta_disponible], [false, 'dispositivo', false], 'bono 0: después de la encuesta sigue el muro, sin encuesta');
    const n = b.partida('N', 'casa', T0); b.encuesta('N', 'casa', T0);
    igual([n.etapa, b.situacion('N2', 'casa', T0).etapa], ['arranque', 'arranque'], 'bono 0: las finales siguen saliendo con el arranque');
    b.anotar('A', T0);
    igual([b.envion('A', 'casa', r.id, T0).via, b.situacion('A', 'casa', T0).encuesta_disponible], ['lista', false], 'bono 0: con el correo, el dos tiempos');
    igual(R.decidirEnvion({ etapa: 'arranque', anotado: false, encuesta: true, encuesta_usada: false, encuesta_disponible: true, regla: 'arranque' }).puede, false, 'decidirEnvion sin bono: la encuesta no da el dos tiempos');
  }
  {
    // Borrar los datos (otro dispositivo, misma red): otro arranque gratis, nunca el dos tiempos; la IP frena a las 6.
    const b = new BaseArranque(PROD);
    const fuentes = [];
    for (let k = 0; k < 8; k++) { const r = b.partida('N' + k, 'casa', T0); fuentes.push(r.puede ? r.etapa : r.motivo); if (r.puede) ok(b.envion('N' + k, 'casa', r.id, T0).puede === false, `dispositivo ${k} sin dos tiempos`); }
    igual(fuentes, ['arranque', 'arranque', 'arranque', 'arranque', 'arranque', 'arranque', 'ip', 'ip'], 'misma IP: 6 arranques y después muro por IP');
  }
  {
    // La regla vieja por variable: finales completas y el dos tiempos sin pedir nada.
    const b = new BaseArranque({ GRATIS_ETAPA: 'final', GRATIS: '2' });
    const r = b.partida('A', 'casa', T0);
    igual([r.etapa, b.envion('A', 'casa', r.id, T0).via, b.partida('A', 'casa', T0).etapa, b.partida('A', 'casa', T0).puede], ['completa', 'ya', 'completa', false], 'GRATIS_ETAPA=final: 2 finales enteras y muro');
  }
  {
    // Se vuelve a la regla vieja con una final del arranque gratis en juego: su dos tiempos no pide nada.
    const b = new BaseArranque({ GRATIS_ETAPA: 'arranque', GRATIS: '1', BONO_ENCUESTA: '0' });
    const r = b.partida('A', 'casa', T0);
    igual(b.envion('A', 'casa', r.id, T0).puede, false, 'regla nueva: dos tiempos negado');
    b.env = { GRATIS_ETAPA: 'final', GRATIS: '2' };
    igual(b.envion('A', 'casa', r.id, T0), { puede: true, via: 'ya' }, 'de vuelta a la regla vieja: la final en juego termina gratis');
  }
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

// La encuesta opcional después de anotarse (docs/MVP.md 5.4): plataforma (una), features (varias de 3) y texto libre.
igual(R.validarEncuesta({ plataforma: 'app' }), { ok: true, r: { plataforma: 'app' } }, 'encuesta: solo la plataforma');
igual(R.validarEncuesta({ features: ['sedes_campeonatos', 'pesista_propio'] }), { ok: true, r: { features: ['pesista_propio', 'sedes_campeonatos'] } }, 'encuesta: solo features, en orden fijo');
igual(R.validarEncuesta({ plataforma: 'web', features: ['pesista_propio', 'mujeres_categorias', 'sedes_campeonatos'], otra: 'Más rivales' }), { ok: true, r: { plataforma: 'web', features: ['pesista_propio', 'mujeres_categorias', 'sedes_campeonatos'], otra: 'Más rivales' } }, 'encuesta completa');
igual(R.validarEncuesta({ plataforma: '', features: [], otra: '  ' }), { ok: false, error: 'incompleta' }, 'encuesta vacía: incompleta');
igual(R.validarEncuesta({ otra: ' hola\u0007 <script>x</script> mundo ' }).r.otra, 'hola x mundo', 'otra sin controles ni HTML');
igual(R.validarEncuesta({ otra: 'escribime a ana@correo.com o en https://x.io/a y www.algo.net, tarima.app ok' }).r.otra, 'escribime a … o en … y … … ok', 'otra sin @ ni direcciones web');
igual(R.validarEncuesta({ otra: '@ana' }), { ok: false, error: 'incompleta' }, 'otra que era solo un usuario: no queda nada');
igual([...R.validarEncuesta({ otra: 'ñ'.repeat(600) }).r.otra].length, 280, 'otra recortada a 280');
for (const [r, e] of [
  [null, 'incompleta'], [{}, 'incompleta'], [{ plataforma: 'consola' }, 'formato'], [{ plataforma: ['app'] }, 'formato'],
  [{ features: 'sedes_campeonatos' }, 'formato'], [{ features: ['sedes_campeonatos', 'sedes_campeonatos'] }, 'formato'], [{ features: ['realismo'] }, 'formato'],
  [{ features: ['__proto__'] }, 'formato'], [{ plataforma: 'toString' }, 'formato'], [{ otra: 5 }, 'formato'], [{ otra: 'x'.repeat(2001) }, 'formato'],
  [{ plataforma: 'app', extra: 1 }, 'formato'], [{ q1: ['sedes'] }, 'formato'],
]) igual(R.validarEncuesta(r), { ok: false, error: e }, `encuesta inválida ${JSON.stringify(r)?.slice(0, 60)}`);
{
  const p = R.propsRespuesta({ r: { plataforma: 'app', features: ['pesista_propio'], otra: 'Más rivales' }, idioma: 'en', pais: 'ES' });
  igual(p, { plataforma: 'app', features: ['pesista_propio'], otra: 'Más rivales', idioma: 'en', pais: 'ES', $process_person_profile: false }, 'propiedades de encuesta_respuesta');
  igual(R.propsRespuesta({ r: { otra: 'x' }, idioma: 'es' }), { plataforma: null, features: [], otra: 'x', idioma: 'es', pais: null, $process_person_profile: false }, 'encuesta_respuesta sin plataforma ni features');
  ok(!JSON.stringify(R.ENCUESTA).match(/pag|pay|precio|price|suscrip|subscri|consol|tablet/i), 'la encuesta no habla de precios, pagos, consolas ni tablets');
}

const def = R.banderasPorDefecto();
igual(R.combinarBanderas(null, null), def, 'banderas por defecto');
igual(R.combinarBanderas(null, { 'muro-partidas-gratis': { enabled: true, variant: '1' }, 'invitacion-podio1': { enabled: false }, grabacion: { enabled: true, variant: 'todas' } }),
  { 'muro-partidas-gratis': '1', 'muro-texto': 'a', 'invitacion-podio1': 'off', grabacion: 'todas' }, 'banderas de PostHog');
igual(R.combinarBanderas({ 'muro-partidas-gratis': '1', 'muro-texto': 'b', grabacion: 'todas' }, { 'muro-partidas-gratis': { variant: '2' }, 'muro-texto': { variant: 'a' }, grabacion: { variant: 'off' } }),
  { 'muro-partidas-gratis': '1', 'muro-texto': 'b', 'invitacion-podio1': 'on', grabacion: 'off' }, 'pegajosas fijas, las demás se refrescan');
igual(R.combinarBanderas(null, { 'muro-texto': { variant: 'zzz' } })['muro-texto'], 'a', 'variante desconocida: por defecto');
igual(R.combinarBanderas({ grabacion: 'todas' }, null).grabacion, 'todas', 'sin respuesta: queda lo guardado');
// grabacion (docs/MVP.md 6.6): un tercio por defecto; off o todas desde PostHog; una bandera booleana apagada es «off»;
// un valor viejo o desconocido vuelve al tercio.
igual(def.grabacion, 'tercio', 'grabacion: un tercio por defecto');
igual(['off', 'tercio', 'todas', 'muestra'].map(v => R.combinarBanderas(null, { grabacion: { enabled: true, variant: v } }).grabacion), ['off', 'tercio', 'todas', 'tercio'], 'grabacion: variantes');
igual(R.combinarBanderas(null, { grabacion: { enabled: false } }).grabacion, 'off', 'grabacion: bandera booleana apagada');
igual(R.combinarBanderas({ grabacion: 'muestra' }, null).grabacion, 'tercio', 'grabacion: lo guardado con un valor viejo no vale');
igual(R.banderasAsignadas(null, { 'muro-texto': { variant: 'b' } }), { 'muro-texto': 'b' }, 'solo se guarda lo que asignó PostHog, nunca un valor por defecto');
igual(R.combinarBanderas({}, null, { 'muro-partidas-gratis': '1' })['muro-partidas-gratis'], '1', 'el por defecto puede salir de GRATIS');
igual(R.config({ GRATIS: '1' }, R.banderasAsignadas(null, {})).gratis, 1, 'sin bandera asignada, GRATIS manda');

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
  const pa = await pase(env, { d: 'f'.repeat(64), n: 1, f: 'gratis', e: 'arranque', p: 7, ahora: T0 });
  igual(await leerPase(env, pa, T0), { d: 'f'.repeat(12), n: 1, f: 'gratis', e: 'arranque', p: 7, exp: T0 + 3 * 3600 }, 'el pase lleva la etapa y el id de la partida');
  igual(await leerPase(env, p, T0 + 3 * 3600 + 1), null, 'pase vencido');
  igual(await leerPase({ SECRETO_PASE: 'x'.repeat(32) }, p, T0), null, 'pase con otra firma');
}

console.log(fallas.length ? `worker_test: ${fallas.length} de ${n} controles fallaron` : `worker_test: ${n} controles, todos bien`);
process.exit(fallas.length ? 1 : 0);
