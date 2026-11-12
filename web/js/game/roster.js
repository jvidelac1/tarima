// Plantel del juego (docs/JUEGO.md, secciones 6.1 y 7.1): lo que se dibuja de cada pesista. Las fichas deportivas viven en
// web/data/sim.json; las del visor (web/js/config.js) no se tocan. Los tres son ficticios. Los textos que ve el jugador
// (contextura, levantamiento, envión, etiquetas, guion) salen del diccionario del idioma actual (i18n/): acá son getters.
import { t } from './i18n/t.js';

export const PLANTEL = {
  ventura: { modelo: 'ventura', corto: 'Ventura', color: '#e2622b', cara: true,
    bandera: 'linear-gradient(115deg,#e2622b 0 38%,#0e1b3d 38% 62%,#e2622b 62%)' },
  // Novakia: en el juego la bandera lleva otra disposición que la del visor (franjas verticales), para que no se lea como la de un país real.
  // Su color de la interfaz es el violeta de la bandera: el turquesa es del jugador.
  brenner: { modelo: 'brenner', corto: 'Brenner', color: '#9a6fe0', cara: true,
    bandera: 'linear-gradient(90deg,#5a2a82 0 34%,#f4f1ea 34% 66%,#18a58f 66%)' },
  // Marangi usa el modelo de Brenner con la tela de un color plano (dorado, el de su bandera: no se confunde con el rojo de
  // Ventura, el gris de Brenner ni el turquesa del jugador); comparte la cara, así que no lleva primer plano de cara
  marangi: { modelo: 'brenner', corto: 'Marangi', color: '#d8b21c', cara: false, tela: '#b8900f',
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
export const FICHA = { energia: 'fon', margen: 'tec' };
export const nivelFicha = v => (v >= 8 ? 'alto' : v >= 6 ? 'medio' : 'bajo');
/** Fracción 0..1 de cada medida dentro del rango que se dibuja (barras de la tarjeta). */
export const BARRA = { estatura: [1.60, 1.90], femur: [.21, .28], brazos: [.29, .35], movilidad: null };
export const ENVIONES = { get split() { return t('envion.split'); }, get power() { return t('envion.power'); }, get squat() { return t('envion.squat'); } };
export const LEV = { get s() { return t('lev.s'); }, get c() { return t('lev.c'); } };
export const ETIQUETAS = { get record() { return t('etiqueta.record'); }, get todo_o_nada() { return t('etiqueta.todo_o_nada'); }, get oro() { return t('etiqueta.oro'); }, get medalla() { return t('etiqueta.medalla'); }, get frente() { return t('etiqueta.frente'); } };
export const GUIONES = { nada: () => t('guion.nada'), tocado: rival => t('guion.tocado', { rival }), forma: rival => t('guion.forma', { rival }) };
