// Plantel del juego (docs/JUEGO.md, secciones 6.1 y 7.1): lo que se dibuja de cada pesista. Las fichas deportivas viven en
// web/data/sim.json; las del visor (web/js/config.js) no se tocan. Los tres son ficticios.
export const PLANTEL = {
  ventura: { modelo: 'ventura', corto: 'Ventura', lema: '«El relojero»', bio: 'Compacto · 1,70 m', color: '#e2622b', cara: true,
    bandera: 'linear-gradient(115deg,#e2622b 0 38%,#0e1b3d 38% 62%,#e2622b 62%)', juego: 'Perdona el ritmo; se achica un poco en el intento decisivo.' },
  // Novakia: en el juego la bandera lleva otra disposición que la del visor (franjas verticales), para que no se lea como la de un país real
  brenner: { modelo: 'brenner', corto: 'Brenner', lema: '«El calculador»', bio: 'Largo · 1,83 m', color: '#18a58f', cara: true,
    bandera: 'linear-gradient(90deg,#5a2a82 0 34%,#f4f1ea 34% 66%,#18a58f 66%)', juego: 'Ritmo neutro; crece bajo presión y es el que menos se cansa.' },
  // Marangi usa el modelo de Brenner con la tela de un color plano; comparte la cara, así que no lleva primer plano de cara
  marangi: { modelo: 'brenner', corto: 'Marangi', lema: '«El showman»', bio: 'Potente · 1,76 m', color: '#d8b21c', cara: false, tela: '#7a1626',
    bandera: 'linear-gradient(180deg,#0f4c81 0 50%,#d8b21c 50%)', juego: 'Exige precisión y se cansa rápido; pelea como nadie.' },
};
export const ENVIONES = { split: 'Tijera', power: 'Power', squat: 'Squat' };
export const LEV = { s: 'Arranque', c: 'Dos tiempos' };
export const ETIQUETAS = { record: 'Récord', todo_o_nada: 'A todo o nada', oro: 'Para el oro', medalla: 'Para medalla', frente: 'Para pasar al frente' };
export const GUIONES = { nada: () => 'Sin novedades: los tres llegan enteros.', tocado: n => `${n} llega tocado: empieza con 85 de Resto.`, forma: n => `${n} llega en su mejor forma (+2 kg en los dos levantamientos).` };
