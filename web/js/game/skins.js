// Skins (docs/GRAFICOS_PLAN.md, G6): un skin es una lista de colores sobre el modelo que ya está cargado. No baja modelos
// ni texturas y no compila sombreadores: se resuelve a multiplicadores de color por material (Athlete.setSkin).
// Sin three ni DOM: lo prueba tools/skins_test.mjs.
//
// Campos de un skin (todos opcionales, '#rrggbb'):
//   piel, malla, capellada, cinturon   color OBJETIVO: se llega multiplicando por (objetivo / color con que se horneó el
//                                      modelo, que está en la ficha de data/plantel.json). La malla conserva su dibujo.
//   pelo                               color del pelo, la barba y las cejas (Athlete.setAspecto, `pelo.base`)
//   suela, taco, tira, cordon, hebilla tinte: multiplica el color que trae el material
//   pielTex + pielBase                 PRUEBA (no es contenido aprobado): textura de piel de foto sobre el UV del cuerpo, que es
//                                      el de MakeHuman en todos los pesistas. `pielTex` es la ruta ('models/<nombre>.webp') y
//                                      `pielBase` el color medio de esa textura; el tono de cada pesista se conserva
//                                      multiplicando por (piel de la ficha / pielBase). Es el único campo que baja un archivo.
// Límite conocido: la malla se tiñe entera (paneles, vivo, rodilleras y vendas van en la misma textura); pintar cada parte
// por separado es la historia G7.

export const CAMPOS = ['piel', 'pelo', 'malla', 'capellada', 'suela', 'taco', 'tira', 'cordon', 'cinturon', 'hebilla'];
/** Material del GLB que mueve cada campo y cómo: 'razon' (objetivo / base de la ficha) o 'tinte'. */
export const MATERIAL = { capellada: ['ShoeUpper', 'razon', 'zapatilla'], suela: ['ShoeSole', 'tinte'], taco: ['ShoeHeel', 'tinte'], tira: ['ShoeStrap', 'tinte'], cordon: ['ShoeLace', 'tinte'], cinturon: ['Belt', 'razon', 'cinturon'], hebilla: ['BeltMetal', 'tinte'] };
/** Tope del multiplicador y piso del color base: una base casi negra no se puede aclarar sin que se vea el ruido de la textura. */
export const TOPE = 6, PISO = .02;
const HEX = /^#[0-9a-f]{6}$/i, TEX = /^models\/[a-z0-9_]{2,40}\.webp$/;
/** Campos de la textura de piel (no son colores del catálogo de equipos). */
export const CAMPOS_TEX = ['pielTex', 'pielBase'];
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
 * @returns {{piel:number[]|null, malla:number[]|null, pelo:string|null, materiales:Object<string, number[]>, pielTex:{url:string, k:number[], base:number[]}|null}}
 */
export function resolverSkin(skin, ficha = {}) {
  const s = skin || {}, r = { piel: null, malla: null, pelo: esHex(s.pelo) ? s.pelo : null, materiales: {}, pielTex: null };
  // textura de piel: sin tono en la ficha va como viene
  if (typeof s.pielTex === 'string' && TEX.test(s.pielTex) && esHex(s.pielBase)) r.pielTex = { url: s.pielTex, k: esHex(ficha.piel) ? razon(esHex(s.piel) ? s.piel : ficha.piel, s.pielBase) : [1, 1, 1], base: hexLineal(esHex(ficha.piel) ? ficha.piel : s.pielBase) };
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
    for (const k of Object.keys(s)) { if (k === 'pielTex') { if (!TEX.test(String(s[k]))) mal.push(`${id}.pielTex: ruta inválida`); } else if (![...CAMPOS, 'pielBase'].includes(k)) mal.push(`${id}: campo desconocido «${k}»`); else if (!esHex(s[k])) mal.push(`${id}.${k}: color inválido`); }
    if (!s.pielTex !== !s.pielBase) mal.push(`${id}: pielTex y pielBase van juntos`);
    if (!CAMPOS.some(k => s[k]) && !s.pielTex) mal.push(`${id}: no cambia nada`);
    const f = firma(s) + '|' + (s.pielTex || ''); if (vistas.has(f)) mal.push(`${id}: igual a ${vistas.get(f)}`); else vistas.set(f, id);
    // la tira y el cordón se tienen que distinguir de la capellada (si no, la zapatilla es una mancha)
    if (esHex(s.capellada) && esHex(s.tira) && contraste(s.capellada, s.tira) < 1.25) mal.push(`${id}: la tira no se distingue de la capellada`);
    // la malla nunca del color de la piel del mismo skin
    if (esHex(s.malla) && esHex(s.piel) && contraste(s.malla, s.piel) < 1.6) mal.push(`${id}: la malla se confunde con la piel`);
  }
  return mal;
}
