// Nombre real para anotarse en la lista (LIF-32, pedido del dueño del 13 de noviembre; desde el 15 de noviembre, mínimo 4): mínimo 4 caracteres, solo letras
// (de cualquier idioma) con espacios, apóstrofo o guion entre palabras; sin números ni símbolos, sin letras repetidas
// tipo «AAAA», sin tecleo al azar tipo «2394932fjdksAAA» y sin palabras de relleno («test», «asdf», «nombre»). Los
// nombres pueden repetirse entre personas. Lo usan el juego (web/js/game/conexion.js y el Worker simulado de
// servidor.js) y el Worker (worker/src/index.js), así la regla es una sola.

const SEPARADOR = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;
const LATINO = /^[\p{Script=Latin}\p{M} '’-]+$/u;
const VOCAL = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœ]/i;
const RELLENO = new Set(['test', 'tests', 'testing', 'tester', 'prueba', 'pruebas', 'probando', 'asdf', 'asdfg', 'asdfgh', 'qwert',
  'qwerty', 'zxcvb', 'hjkl', 'admin', 'nombre', 'name', 'names', 'user', 'usuario', 'player', 'jugador', 'jugadora', 'anonimo',
  'anonima', 'anonymous', 'anon', 'null', 'undefined', 'none', 'nobody', 'nadie', 'ninguno', 'nombre apellido', 'first name',
  'debutante', 'rookie', 'hello', 'hola', 'lorem', 'ipsum', 'example', 'ejemplo', 'fulano', 'mengano']);
const TECLADO = ['qwer', 'wert', 'erty', 'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'zxcv', 'xcvb', 'cvbn', 'vbnm', 'poiu', 'lkjh', 'mnbv'];

const sinAcentos = s => s.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * @returns {{ok: true, nombre: string} | {ok: false, motivo: 'vacio'|'largo'|'caracteres'|'repetido'|'raro'}}
 * `nombre` sale limpio: NFC, sin espacios de más.
 */
export function nombreReal(v) {
  if (typeof v !== 'string') return { ok: false, motivo: 'vacio' };
  const n = v.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!n) return { ok: false, motivo: 'vacio' };
  const largo = [...n].length;
  if (largo < 4 || largo > 40) return { ok: false, motivo: 'largo' };
  if (!SEPARADOR.test(n)) return { ok: false, motivo: 'caracteres' };
  const letras = [...n.replace(/[ '’-]/g, '')];
  if (letras.length < 4) return { ok: false, motivo: 'largo' };
  const bajo = sinAcentos(n.toLowerCase());
  if (/(\p{L})\1\1/u.test(bajo) || new Set(letras.map(c => sinAcentos(c.toLowerCase()))).size < 3) return { ok: false, motivo: 'repetido' };
  const junto = bajo.replace(/[ '’-]/g, '');
  if (RELLENO.has(bajo) || bajo.split(/[ '’-]/).every(p => RELLENO.has(p)) || TECLADO.some(k => junto.includes(k))) return { ok: false, motivo: 'raro' };
  if (LATINO.test(n)) {
    for (const palabra of bajo.split(/[ '’-]/)) {
      if (palabra.length >= 3 && !VOCAL.test(palabra)) return { ok: false, motivo: 'raro' };
      if (/[^aeiouy]{5,}/.test(palabra)) return { ok: false, motivo: 'raro' };
    }
  }
  return { ok: true, nombre: n };
}
