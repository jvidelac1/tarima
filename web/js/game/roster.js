// Plantel del juego (docs/JUEGO.md, secciones 6.1 y 7.1): lo que se dibuja de cada pesista. Las fichas deportivas viven en
// web/data/sim.json; las del visor (web/js/config.js) no se tocan. Los tres son ficticios. Los textos que ve el jugador
// (contextura, levantamiento, envión, etiquetas, guion) salen del diccionario del idioma actual (i18n/): acá son getters.
import { t } from './i18n/t.js';

export const PLANTEL = {
  ventura: { modelo: 'ventura', corto: 'Ventura', color: '#e2622b', cara: true,
    bandera: 'linear-gradient(115deg,#e2622b 0 38%,#0e1b3d 38% 62%,#e2622b 62%)' },
  // Novakia: en el juego la bandera lleva otra disposición que la del visor (franjas verticales), para que no se lea como la de un país real
  brenner: { modelo: 'brenner', corto: 'Brenner', color: '#18a58f', cara: true,
    bandera: 'linear-gradient(90deg,#5a2a82 0 34%,#f4f1ea 34% 66%,#18a58f 66%)' },
  // Marangi usa el modelo de Brenner con la tela de un color plano; comparte la cara, así que no lleva primer plano de cara
  marangi: { modelo: 'brenner', corto: 'Marangi', color: '#d8b21c', cara: false, tela: '#7a1626',
    bandera: 'linear-gradient(180deg,#0f4c81 0 50%,#d8b21c 50%)' },
};
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
/** Fracción 0..1 de cada medida dentro del rango que se dibuja (barras de la tarjeta). */
export const BARRA = { estatura: [1.60, 1.90], femur: [.21, .28], brazos: [.29, .35], movilidad: null };
export const ENVIONES = { get split() { return t('envion.split'); }, get power() { return t('envion.power'); }, get squat() { return t('envion.squat'); } };
export const LEV = { get s() { return t('lev.s'); }, get c() { return t('lev.c'); } };
export const ETIQUETAS = { get record() { return t('etiqueta.record'); }, get todo_o_nada() { return t('etiqueta.todo_o_nada'); }, get oro() { return t('etiqueta.oro'); }, get medalla() { return t('etiqueta.medalla'); }, get frente() { return t('etiqueta.frente'); } };
export const GUIONES = { nada: () => t('guion.nada'), tocado: rival => t('guion.tocado', { rival }), forma: rival => t('guion.forma', { rival }) };
