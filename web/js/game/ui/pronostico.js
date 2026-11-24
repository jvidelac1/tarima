// Mientras levanta un rival (23-nov, pedido del dueño: «que no se pueda saltear a los pesistas, pero que no sea aburrido
// esperar los tiros»): la persona pronostica con un toque si la levanta o no, ve qué está en juego para ella («Si la
// levanta, te pasa») y puede subir sus kilos (ui/pedido.js). El pronóstico no cambia kilos, rivales ni ranking: solo suma una
// racha que queda en el dispositivo (perfil y tarjeta). Lo puro (qué está en juego, la racha) lo prueba tools/sim_test.mjs.
import { t, esc } from '../i18n/t.js';

/** Teclas del pronóstico (con teclado): ← falla, → la levanta. Espacio sigue sin hacer nada en el turno de un rival. */
export const TECLAS_PRONO = { si: 'ArrowRight', no: 'ArrowLeft' };

/**
 * Qué está en juego para `yo` en el llamado `L` de un rival, antes de resolverlo: 'oro' (si la levanta, te saca el oro),
 * 'pasa' (si la levanta, te pasa), 'gana' (si la levanta, se pone primero), o null si no cambia nada para la persona.
 * Usa solo consultas de la partida (puestoSi, _orden, _filas), que no cambian nada.
 */
export function tensionRival(p, yo, L) {
  if (!p || !L || L.a === yo || !p.at[yo]) return null;
  const lev = L.lev, val = f => (lev === 's' ? f.s : f.total);
  const pos = o => { const k = o.findIndex(f => f.a === yo); return val(o[k]) ? k + 1 : 4; };
  const antes = pos(p._orden(p._filas(), lev)), si = pos(p._orden(p._filas(L.a, lev, L.kg), lev));
  if (si > antes) return antes === 1 ? 'oro' : 'pasa';
  if (p.puestoSi(L.a, lev, L.kg) === 1 && p.puestoSi(L.a, lev, 0) !== 1) return 'gana';
  return null;
}

/** La racha guardada: {racha, mejor, ok, n}. `leer` devuelve el texto guardado o null. */
export function rachaDe(texto) {
  try { const r = JSON.parse(texto || 'null'); if (r && Number.isInteger(r.racha) && Number.isInteger(r.mejor) && Number.isInteger(r.ok) && Number.isInteger(r.n)) return r; } catch { /* vacío */ }
  return { racha: 0, mejor: 0, ok: 0, n: 0 };
}
/** La racha después de un pronóstico (`acierto`: true o false). */
export function anotar(r, acierto) {
  const racha = acierto ? r.racha + 1 : 0;
  return { racha, mejor: Math.max(r.mejor, racha), ok: r.ok + (acierto ? 1 : 0), n: r.n + 1 };
}

/**
 * HTML del recuadro. `S`: {fase: 'pide'|'elegido'|'listo', voto: 'si'|'no'|null, acierto, racha, tension, rival, tecla}.
 * 'pide': la pregunta y los dos botones; 'elegido': el voto marcado hasta el veredicto; 'listo': si acertó y la racha.
 */
export function pronosticoHTML(S) {
  if (!S) return '';
  const kbd = k => (S.tecla ? ` <kbd class="tecla">${k}</kbd>` : '');
  const ten = S.tension ? `<p class="pr-ten">${esc(t('prono.tension.' + S.tension, { rival: S.rival }))}</p>` : '';
  if (S.fase === 'listo') {
    if (!S.voto) return S.compacto ? '' : ten;      // teléfono parado: sin voto, durante el veredicto no queda nada
    const txt = S.acierto ? t(S.racha > 1 ? 'prono.acierto_racha' : 'prono.acierto', { n: S.racha }) : t('prono.fallo');
    return `<p class="pr-res ${S.acierto ? 'ok' : 'mal'}">${esc(txt)}</p>`;
  }
  const b = (q, txt, k) => `<button type="button" data-prono="${q}" class="${S.voto === q ? 'elegido' : ''}"${S.fase === 'elegido' ? ' disabled' : ''} aria-pressed="${S.voto === q}">${esc(txt)}${S.fase === 'pide' ? kbd(k) : ''}</button>`;
  return `${ten}<div class="pr-q" role="group" aria-label="${esc(t('prono.pregunta', { rival: S.rival }))}"><span>${esc(t('prono.pregunta', { rival: S.rival }))}</span>`
    + b('no', t('prono.no'), '←') + b('si', t('prono.si'), '→') + '</div>';
}
