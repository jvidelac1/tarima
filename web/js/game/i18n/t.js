// Idioma del juego (docs/MVP.md, sección 4.1). Puro salvo fijarIdioma(), que toca <html lang> y <title> si hay DOM:
// lo usan el juego, los módulos de textos (mensajes, controles, señal) y las pruebas en Node.
//   t(clave, vars)       texto en el idioma actual, con {variables}. {A}, {T} y {t} salen solas según haya teclado o no.
//   tr(idioma, clave, vars)  lo mismo en un idioma dado (explicar() y las pruebas).
//   detectarIdioma({lang, guardado, navegador})  ?lang= primero, después lo guardado y por último el navegador.
import es from './es.js';
import en from './en.js';

export const DICCIONARIOS = { es, en };
export const IDIOMAS = ['es', 'en'];
let idioma = 'es', tactilAhora = false;
const oyentes = new Set();

/**
 * ?lang= primero, después lo elegido a mano en este dispositivo. Si no hay ninguno, el navegador: español si el español
 * aparece en CUALQUIER lugar de la lista de idiomas (decisión del dueño: su Chrome tiene el inglés primero y el español
 * después, y lo quiere en español); si no, inglés.
 */
export function detectarIdioma({ lang = null, guardado = null, navegador = [] } = {}) {
  for (const c of [lang, guardado]) if (c && IDIOMAS.includes(String(c).slice(0, 2).toLowerCase())) return String(c).slice(0, 2).toLowerCase();
  return (navegador || []).some(l => /^es\b/i.test(String(l || ''))) ? 'es' : 'en';
}
export const idiomaActual = () => idioma;
/** Cambia el idioma. Con DOM, actualiza <html lang> y <title>, y avisa a quien escuche (para repintar). */
export function fijarIdioma(l) {
  const nuevo = IDIOMAS.includes(l) ? l : 'en', de = idioma; idioma = nuevo;
  if (typeof document !== 'undefined') { document.documentElement.lang = nuevo; document.title = t('app.titulo'); }
  if (de !== nuevo) for (const f of oyentes) f(nuevo, de);
  return nuevo;
}
export const alCambiarIdioma = f => { oyentes.add(f); return () => oyentes.delete(f); };
/** Con o sin teclado: cambia lo que dicen {A}, {T} y {t}. */
export const fijarTactil = v => { tactilAhora = !!v; };
export const tactilActual = () => tactilAhora;

/** Textos de las teclas según haya teclado o no, en un idioma. */
export function teclasDe(l, tactil = tactilAhora) {
  const D = DICCIONARIOS[l] || en, k = tactil ? 'tactil' : 'teclado';
  return { A: D[`var.A.${k}`], T: D[`var.T.${k}`], t: D[`var.t.${k}`], mantene: D[`tecla.mantene.${k}`], no_sueltes: D[`tecla.no_sueltes.${k}`] };
}
/** Reemplaza {nombre} por vars.nombre. Lo que no está en vars queda como estaba (las pruebas buscan «{»). */
export const rellenar = (txt, vars) => txt.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
/** Texto de `clave` en el idioma `l`. Si falta, el de español; si tampoco está, la clave misma (se nota en pantalla). */
export function tr(l, clave, vars = {}) {
  const D = DICCIONARIOS[l] || en, txt = D[clave] ?? es[clave] ?? clave;
  return rellenar(txt, { ...teclasDe(l, vars.tactil ?? tactilAhora), ...vars });
}
export const t = (clave, vars) => tr(idioma, clave, vars);
/** ¿Existe la clave? (para textos opcionales) */
export const hay = clave => clave in (DICCIONARIOS[idioma] || en);
/** Escape para todo lo que entra en innerHTML y no es del diccionario (nombres, sobre todo). */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
