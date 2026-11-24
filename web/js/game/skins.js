// Skins (docs/GRAFICOS_PLAN.md, G6): un skin es una lista de colores sobre el modelo que ya está cargado. No baja modelos
// ni texturas y no compila sombreadores: se resuelve a multiplicadores de color por material (Athlete.setSkin).
// Sin three ni DOM: lo prueba tools/skins_test.mjs.
//
// Campos de un skin (todos opcionales, '#rrggbb'):
//   piel, malla, capellada, cinturon   color OBJETIVO: se llega multiplicando por (objetivo / color con que se horneó el
//                                      modelo, que está en la ficha de data/plantel.json). La malla conserva su dibujo.
//   pelo                               color del pelo, la barba y las cejas (Athlete.setAspecto, `pelo.base`)
//   suela, taco, tira, cordon, hebilla tinte: multiplica el color que trae el material
// Límite conocido: la malla se tiñe entera (paneles, vivo, rodilleras y vendas van en la misma textura); pintar cada parte
// por separado es la historia G7.

export const CAMPOS = ['piel', 'pelo', 'malla', 'capellada', 'suela', 'taco', 'tira', 'cordon', 'cinturon', 'hebilla'];
/** Material del GLB que mueve cada campo y cómo: 'razon' (objetivo / base de la ficha) o 'tinte'. */
export const MATERIAL = { capellada: ['ShoeUpper', 'razon', 'zapatilla'], suela: ['ShoeSole', 'tinte'], taco: ['ShoeHeel', 'tinte'], tira: ['ShoeStrap', 'tinte'], cordon: ['ShoeLace', 'tinte'], cinturon: ['Belt', 'razon', 'cinturon'], hebilla: ['BeltMetal', 'tinte'] };
/** Tope del multiplicador y piso del color base: una base casi negra no se puede aclarar sin que se vea el ruido de la textura. */
export const TOPE = 6, PISO = .02;
const HEX = /^#[0-9a-f]{6}$/i;
export const esHex = c => typeof c === 'string' && HEX.test(c);
/** '#rrggbb' (sRGB) a [r, g, b] lineal. */
export function hexLineal(hex) {
  if (!esHex(hex)) throw new Error('color inválido: ' + hex);
  return [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
}
/** Luminancia relativa (0..1) de un color sRGB. */
export const luminancia = hex => { const [r, g, b] = hexLineal(hex); return .2126 * r + .7152 * g + .0722 * b; };
/** Contraste WCAG entre dos colores (1 a 21). */
export const contraste = (a, b) => { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const razon = (objetivo, base) => { const o = hexLineal(objetivo), b = hexLineal(base); return o.map((v, i) => Math.min(TOPE, Math.max(PISO, v) / Math.max(PISO, b[i]))); };      // el mismo piso arriba y abajo: pedir el color que ya tiene da 1

/**
 * Multiplicadores (RGB lineal) que llevan al modelo de `ficha` (colores con que se horneó: `piel`, `malla`, `zapatilla`,
 * `cinturon` de data/plantel.json) al skin. null en lo que el skin no toca o no se puede calcular (falta el color base).
 * @returns {{piel:number[]|null, malla:number[]|null, pelo:string|null, materiales:Object<string, number[]>}}
 */
export function resolverSkin(skin, ficha = {}) {
  const s = skin || {}, r = { piel: null, malla: null, pelo: esHex(s.pelo) ? s.pelo : null, materiales: {} };
  if (esHex(s.piel) && esHex(ficha.piel)) r.piel = razon(s.piel, ficha.piel);
  if (esHex(s.malla) && esHex(ficha.malla)) r.malla = razon(s.malla, ficha.malla);
  for (const [campo, [mat, modo, base]] of Object.entries(MATERIAL)) {
    if (!esHex(s[campo])) continue;
    if (modo === 'tinte') r.materiales[mat] = hexLineal(s[campo]);
    else if (esHex(ficha[base])) r.materiales[mat] = razon(s[campo], ficha[base]);
  }
  return r;
}
/** Problemas de un catálogo de skins ({v, skins: {id: skin}}); lista vacía si está bien. */
export function validarCatalogo(cat) {
  const mal = [], ids = Object.keys(cat?.skins || {});
  if (cat?.v !== 1) mal.push('versión desconocida');
  if (!ids.length) mal.push('catálogo vacío');
  const firma = s => CAMPOS.map(k => (s[k] || '').toLowerCase()).join('|'), vistas = new Map();
  for (const id of ids) {
    const s = cat.skins[id];
    if (!/^[a-z][a-z0-9_]{1,23}$/.test(id)) mal.push(`${id}: id inválido`);
    for (const k of Object.keys(s)) { if (!CAMPOS.includes(k)) mal.push(`${id}: campo desconocido «${k}»`); else if (!esHex(s[k])) mal.push(`${id}.${k}: color inválido`); }
    if (!CAMPOS.some(k => s[k])) mal.push(`${id}: no cambia nada`);
    const f = firma(s); if (vistas.has(f)) mal.push(`${id}: igual a ${vistas.get(f)}`); else vistas.set(f, id);
    // la tira y el cordón se tienen que distinguir de la capellada (si no, la zapatilla es una mancha)
    if (esHex(s.capellada) && esHex(s.tira) && contraste(s.capellada, s.tira) < 1.25) mal.push(`${id}: la tira no se distingue de la capellada`);
    // la malla nunca del color de la piel del mismo skin
    if (esHex(s.malla) && esHex(s.piel) && contraste(s.malla, s.piel) < 1.6) mal.push(`${id}: la malla se confunde con la piel`);
  }
  return mal;
}
