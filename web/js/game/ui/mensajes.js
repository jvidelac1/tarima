// Textos del control (docs/CONTROLES.md, secciones 5 a 7): la palabra de cada toque, la línea que explica un fallo y
// los pasos de «Cómo se juega». Puro, sin DOM: lo prueba tools/sim_test.mjs.

/** Palabra después de cada toque. `floja`: ámbar (el levantamiento sigue). */
export const PALABRAS = { perfecto: { txt: 'PERFECTO' }, bien: { txt: 'BIEN' }, temprano: { txt: 'TEMPRANO', floja: true }, tarde: { txt: 'TARDE', floja: true } };

/**
 * Qué pasó y qué hacer distinto, en una línea. `res` es el resultado del núcleo (causa, gestos, toques).
 * @param {object} res  @param {'c'|'f'} ctl  @param {boolean} tactil  sin teclado: no nombra la tecla
 * @returns {string} '' si no hay nada que explicar (válido con tres blancas)
 */
export function explicar(res, ctl = 'c', tactil = false) {
  if (!res || !res.causa) return '';
  const f = ctl === 'f', g = res.gestos || [], ex = [...g].reverse().find(x => x.g === 'explosion'), rc = [...g].reverse().find(x => x.g === 'recepcion'), j = (ex || rc)?.mov === 'j';
  const toca = tactil ? 'Tocá' : 'Tocá ESPACIO', apreta = tactil ? 'Tocá' : 'Apretá ESPACIO', manten = tactil ? 'Dejá el dedo apoyado' : 'Mantené ESPACIO';
  const EXP = f ? (j ? '¡ARRIBA!' : '¡EXPLOTÁ!') : 'la explosión', cuando = f ? 'cuando el círculo se cierra' : j ? 'en el fondo de la flexión' : 'cuando la barra llega a la línea';
  const hacer = f ? toca : 'Soltá', hiciste = f ? 'Tocaste' : 'Soltaste';
  switch (res.causa) {
    case 'sin_altura':
      if (ex && ex.fuera && ex.e > 0) return f ? `No tocaste ${EXP}. ${toca} ${cuando}.` : `No soltaste a tiempo. Soltá ${cuando}.`;
      return `${hiciste} ${EXP} muy ${ex && ex.e > 0 ? 'tarde' : 'temprano'} y la barra no subió. ${hacer} ${cuando}.`;
    case 'anticipado': return `Soltaste antes de tiempo. Soltá ${cuando}.`;
    case 'adelante': return `${hiciste} ${EXP} temprano y la barra se fue adelante. Esperá ${f ? 'a que el círculo se cierre' : 'a que la barra llegue a la línea'}.`;
    case 'atras': return `${hiciste} ${EXP} tarde y la barra se fue atrás. ${hacer} ${f ? 'apenas se cierra el círculo' : 'apenas la barra llega a la línea'}.`;
    case 'fondo':
      if (rc && rc.e < 0) return f ? 'Tocaste ¡RECIBÍ! antes de tiempo. Un toque por señal: esperá el círculo.' : 'Apretaste para recibir antes de tiempo. Esperá a que el anillo se cierre.';
      return f ? `No recibiste la barra. ${toca} cuando el círculo se cierra.` : `No recibiste la barra. ${apreta} cuando el anillo se cierra.`;
    case 'aplastado': case 'codos':
      if ((res.toques || 0) < 3) return f ? `La subida se trabó y no empujaste. Con ¡EMPUJÁ!, ${toca.toLowerCase()} rápido.` : `La subida se trabó y no empujaste. ${toca} repetido hasta la franja verde.`;
      return f ? 'No alcanzó el empuje: venías a destiempo. Cuanto más justo toques, menos hay que empujar.' : 'No alcanzó el empuje: venías a destiempo. Mantené la flecha en la franja verde.';
    case 'codos_blandos': return f ? 'Recibiste a destiempo y los codos quedaron blandos. Tocá ¡RECIBÍ! justo en el cierre.' : 'Recibiste a destiempo y los codos quedaron blandos. Apretá justo cuando el anillo se cierra.';
    case 'temblor': case 'tiembla': return f ? `La barra llegó desviada y tembló. Tocá ${EXP} más cerca del cierre.` : 'La barra tembló: llegó desviada o empujaste de más. Soltá más justo y no pases la franja verde.';
    case 'devuelve': return `Pasaron 8 segundos con la barra en los hombros. ${apreta} para ${f ? 'flexionar' : 'empezar el envión'}.`;
    case 'reloj': return `Se acabó el reloj. ${apreta} para empezar antes del 0:00.`;
    case 'antes': return `Soltaste antes de la chicharra. ${tactil ? 'No levantes el dedo' : 'Dejá apretado'} hasta ¡ABAJO!`;
    case 'sin_apoyo': return `No dejaste apretado al quedar de pie. ${manten} hasta ¡ABAJO!`;
    default: return '';
  }
}

/** Los tres pasos de «Cómo se juega» y de la pantalla de inicio: [cantidad de teclas dibujadas, texto]. */
export function pasos(ctl = 'f') {
  return ctl === 'f'
    ? [[1, 'Apretá para empezar el levantamiento.'], [1, 'Tocá cuando el círculo se cierra: ¡EXPLOTÁ!, ¡RECIBÍ!'], [3, 'Si dice ¡EMPUJÁ!, tocá rápido.']]
    : [[1, 'Apretá con el anillo lleno y mantené.'], [1, 'Soltá cuando la barra llega a la línea y apretá para recibir.'], [3, 'Si se traba, tocá repetido; de pie, dejá apretado hasta la chicharra.']];
}
/** Texto del tutorial guiado en cada parada (Fácil). */
export const GUIA = {
  tira: '¡TIRÁ! {A} para empezar el levantamiento.',
  explota: '¡EXPLOTÁ! El círculo se cerró: {t} ahora.',
  recibi: '¡RECIBÍ! Otra vez: círculo cerrado, {t}.',
  empuja: '¡EMPUJÁ! La subida se trabó. {T} rápido hasta quedar de pie.',
  aguanta: 'AGUANTÁ. No toques nada: espera la chicharra y baja solo.',
  flexiona: '¡FLEXIONÁ! {A}. Enseguida ¡ARRIBA! cuando el círculo se cierra, y ¡RECIBÍ!',
};
/** Reemplaza {A} «Apretá ESPACIO», {T} «Tocá ESPACIO» y {t} en minúscula, según haya teclado o no. */
export const conTecla = (txt, tactil) => txt.replace('{A}', tactil ? 'Tocá la pantalla' : 'Apretá ESPACIO').replace('{T}', tactil ? 'Tocá' : 'Tocá ESPACIO').replace('{t}', tactil ? 'tocá' : 'tocá ESPACIO');
