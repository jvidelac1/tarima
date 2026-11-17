// Plantel del juego (docs/JUEGO.md, secciones 6.1 y 7.1): lo que se dibuja de cada pesista. Las fichas deportivas viven en
// web/data/sim.json; las del visor (web/js/config.js) no se tocan. Los tres son ficticios. Los textos que ve el jugador
// (contextura, levantamiento, envión, etiquetas, guion) salen del diccionario del idioma actual (i18n/): acá son getters.
import { t } from './i18n/t.js';

export const PLANTEL = {
  // `aspecto`: parámetros de los materiales del pesista (athlete.js, ASPECTO): tono y sudor de la piel, color del pelo, tela.
  // Lo que no se pone queda en el valor por defecto. Sirve para que dos pesistas con el mismo modelo no sean idénticos.
  ventura: { modelo: 'ventura', corto: 'Ventura', color: '#e2622b', cara: true, aspecto: { piel: { tono: '#f4e2d2', variacion: .6 } },
    bandera: 'linear-gradient(115deg,#e2622b 0 38%,#0e1b3d 38% 62%,#e2622b 62%)' },
  // Novakia: en el juego la bandera lleva otra disposición que la del visor (franjas verticales), para que no se lea como la de un país real.
  // Su color de la interfaz es el violeta de la bandera: el turquesa es del jugador.
  brenner: { modelo: 'brenner', corto: 'Brenner', color: '#9a6fe0', cara: true,
    bandera: 'linear-gradient(90deg,#5a2a82 0 34%,#f4f1ea 34% 66%,#18a58f 66%)' },
  // Marangi usa el modelo de Brenner con la tela de un color plano (dorado, el de su bandera: no se confunde con el rojo de
  // Ventura, el gris de Brenner ni el turquesa del jugador); comparte la cara, así que no lleva primer plano de cara
  marangi: { modelo: 'brenner', corto: 'Marangi', color: '#d8b21c', cara: false, tela: '#b8900f', aspecto: { piel: { tono: '#c99a78', saturacion: .9, variacion: .35, sudor: .7 }, pelo: { color: '#5a4a40' } },
    bandera: 'linear-gradient(180deg,#0f4c81 0 50%,#d8b21c 50%)' },
};
/**
 * El pesista del jugador tiene identidad propia, sea cual sea el cuerpo que eligió: malla lisa turquesa (sin el nombre ni
 * la marca del modelo en la espalda), su color en la interfaz y su bandera. Ningún rival usa estos colores (Ventura rojo,
 * Brenner gris con violeta, Marangi dorado). Antes el jugador llevaba la malla, el nombre y los colores del modelo elegido,
 * y con Compacto iba de rojo como Marangi: parecía que manejaba a un rival.
 */
export const JUGADOR = { color: '#35e6d6', tela: '#0e9c90', cara: true,
  bandera: 'linear-gradient(115deg,#35e6d6 0 50%,#0a1a55 50%)' };
/**
 * Medidas del cuerpo de cada modelo, para que la elección se vea (pedido del dueño del 12-nov). Salen de los modelos
 * construidos (out/<nombre>/bones_all.json, la misma tabla de «Los dos biotipos» de HANDOFF.md): estatura, fémur (cadera a
 * rodilla) y brazo (hombro a muñeca) sobre la estatura. La movilidad no se mide en el modelo: es «alta» para quien domina
 * el envión en sentadilla (fichas de web/data/sim.json) y «media» para los demás; es una estimación.
 * Marangi usa el cuerpo de Brenner: el tercer cuerpo queda pendiente (necesita Blender), así que sus medidas son las mismas.
 */
export const CUERPO = {
  ventura: { estatura: 1.70, femur: .23, brazos: .31, movilidad: 'alta' },
  brenner: { estatura: 1.83, femur: .26, brazos: .33, movilidad: 'media' },
  marangi: { estatura: 1.83, femur: .26, brazos: .33, movilidad: 'media' },
};
/**
 * Lo que distingue a los pesistas aunque compartan cuerpo (Largo y Potente, mientras falta el tercer cuerpo): energía
 * (cuánto aguanta entre intentos: `fon` de web/data/sim.json) y margen (cuánto perdona un toque a destiempo: `tec`). Se
 * leen de las fichas al pintar la tarjeta; acá, solo cómo se dicen. Escala de 1 a 10.
 */
/**
 * Vestuario (rama `plantel`): qué modelo del plantel dibuja a cada uno de los tres pesistas del juego. Las fichas deportivas
 * (web/data/sim.json: kilos, atributos, plan del rival) NO cambian, así que la partida, su huella y el servidor siguen
 * igual; cambia a quién se ve: el modelo (web/models/<id>.glb), el nombre y el país del rival, la bandera, el color de la
 * interfaz y las medidas de la tarjeta. La presentación ya acomoda el clip de cualquier modelo a los tiempos del núcleo
 * (sequence.js busca las fases por nombre en las poses del modelo dibujado).
 * @param {string[]} lista   hasta tres ids del plantel, en el orden Compacto, Largo, Potente (los huecos no se tocan)
 * @param {object} fichas    `pesistas` de web/data/plantel.json (tools/plantel_web.py, desde blender/plantel.py)
 * @param {object} poses     web/data/poses.json: solo se viste con modelos que ya están construidos
 * @returns {string[]} los ids del juego que cambiaron de modelo
 */
export function vestir(lista, fichas, poses) {
  const hechos = [], usados = new Set(), TELAS = ['#a3262a', '#3b4a8c', '#b8900f'];
  Object.keys(PLANTEL).forEach((id, k) => {
    const m = lista[k], f = fichas?.[m], P = poses?.[m]; if (!m || !f || !P) return;
    const repetido = usados.has(m); usados.add(m);
    // un modelo repetido comparte la cara: el segundo lleva la tela de otro color y no tiene primer plano (como Marangi con Brenner)
    Object.assign(PLANTEL[id], { modelo: m, corto: f.corto, nombre: f.nombre, pais: f.pais, codigo: f.codigo, genero: f.genero, categoria: f.categoria, vestido: true,
      // `aspecto` (rama look: Athlete.setAspecto): el del modelo nuevo si su ficha lo trae (`juego.aspecto` en blender/plantel.py); nunca el del modelo anterior
      aspecto: f.aspecto || undefined, pelo: f.pelo || undefined,      // `pelo`: color del pelo de la ficha (Athlete.setAspecto, `pelo.base`)
      cara: !repetido, tela: repetido ? TELAS[k] : undefined, color: (!repetido && f.color) || PLANTEL[id].color, bandera: (!repetido && f.bandera) || PLANTEL[id].bandera });
    CUERPO[id] = { estatura: P.h, femur: P.seg.femur / P.h, brazos: P.seg.arm / P.h, movilidad: CUERPO[id].movilidad };
    hechos.push(id);
  });
  return hechos;
}
/** Terna que se juega sin `?plantel=`: una de las `ternas` de web/data/plantel.json (tools/plantel_web.py). `clasico` = sin vestuario. */
export const PLANTEL_DEFECTO = 'hombres';
/** De `?plantel=` a la lista de tres: el nombre de una terna de plantel.json (`mujeres`, `hombres`...) o ids separados por coma. */
export const ternaDe = (q, plantel) => (!q ? [] : plantel?.ternas?.[q] || q.split(',').map(x => x.trim()));
export const FICHA = { energia: 'fon', margen: 'tec' };
export const nivelFicha = v => (v >= 8 ? 'alto' : v >= 6 ? 'medio' : 'bajo');
/** Fracción 0..1 de cada medida dentro del rango que se dibuja (barras de la tarjeta). */
export const BARRA = { estatura: [1.60, 1.90], femur: [.21, .28], brazos: [.29, .35], movilidad: null };
export const ENVIONES = { get split() { return t('envion.split'); }, get power() { return t('envion.power'); }, get squat() { return t('envion.squat'); } };
export const LEV = { get s() { return t('lev.s'); }, get c() { return t('lev.c'); } };
export const ETIQUETAS = { get record() { return t('etiqueta.record'); }, get todo_o_nada() { return t('etiqueta.todo_o_nada'); }, get oro() { return t('etiqueta.oro'); }, get medalla() { return t('etiqueta.medalla'); }, get frente() { return t('etiqueta.frente'); } };
export const GUIONES = { nada: () => t('guion.nada'), tocado: rival => t('guion.tocado', { rival }), forma: rival => t('guion.forma', { rival }) };
