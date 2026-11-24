// Tarjeta del resultado para compartir (LIF-23): una imagen 1080×1350 (vertical, la que aceptan Instagram, WhatsApp y X)
// dibujada con el 2D del navegador, con los colores y las letras del juego. Solo texto y formas: no toca la escena 3D.

const C = { fondo: '#03050c', panel: '#080d1e', linea: '#1b2548', tinta: '#f2f4ff', mute: '#93a0cc', teal: '#35e6d6', oro: '#ffd23f', plata: '#cfd6e6', bronce: '#d08a4c', rojo: '#e2231a', ok: '#39d98a' };
const DISPLAY = "'Saira Condensed','Arial Narrow',system-ui,sans-serif", BODY = "'Saira',system-ui,sans-serif";

/**
 * @param {object} d
 * @param {string} d.titulo   «¡Oro para Nasar!»
 * @param {'oro'|'plata'|'bronce'|'ninguna'} d.medalla
 * @param {number} d.total
 * @param {{kg:number, ok:boolean}[]} d.arranque  los tres intentos  @param {{kg:number, ok:boolean}[]} d.dosTiempos
 * @param {string} d.lineaArr  «Arranque»  @param {string} d.lineaDT  «Dos tiempos»
 * @param {string} d.pie       texto chico de abajo (el campeonato o la invitación)
 * @param {string} [d.prono] la mejor racha de pronósticos («Pronósticos: 5 seguidos»), o vacío
 * @param {string} d.url       sin protocolo
 * @returns {Promise<Blob|null>}
 */
export async function tarjetaPodio(d) {
  if (typeof document === 'undefined') return null;
  try { await document.fonts?.load?.(`800 80px ${DISPLAY}`); await document.fonts?.load?.(`400 40px ${BODY}`); } catch { /* sin fuentes: las del sistema */ }
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0a1430'); grad.addColorStop(1, C.fondo);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // la tarima: franjas claras abajo, en perspectiva simple
  g.fillStyle = 'rgba(255,255,255,.04)'; for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(W / 2 + (k - 4) * 40, 820); g.lineTo(W / 2 + (k - 4) * 260, H); g.lineTo(W / 2 + (k - 4) * 260 + 6, H); g.lineTo(W / 2 + (k - 4) * 40 + 2, 820); g.fill(); }
  g.fillStyle = C.teal; g.fillRect(80, 96, 10, 84);
  g.textBaseline = 'alphabetic'; g.fillStyle = C.tinta; g.font = `800 92px ${DISPLAY}`; g.fillText('LIFTING GAME', 112, 172);
  const col = { oro: C.oro, plata: C.plata, bronce: C.bronce, ninguna: C.mute }[d.medalla] || C.mute;
  // medalla
  if (d.medalla !== 'ninguna') { g.beginPath(); g.arc(W - 170, 150, 70, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke(); }
  g.fillStyle = col; g.font = `800 112px ${DISPLAY}`; ajustar(g, d.titulo.toUpperCase(), 80, 380, W - 160);
  g.fillStyle = C.mute; g.font = `600 44px ${BODY}`; g.fillText('TOTAL', 80, 500);
  g.fillStyle = C.tinta; g.font = `800 210px ${DISPLAY}`; g.fillText(`${d.total || 0}`, 72, 700);
  const wt = g.measureText(`${d.total || 0}`).width; g.fillStyle = C.mute; g.font = `700 70px ${DISPLAY}`; g.fillText('KG', 90 + wt, 700);
  const fila = (y, nombre, ints) => {
    g.fillStyle = C.panel; redondo(g, 80, y - 70, W - 160, 110, 18); g.fill();
    g.fillStyle = C.mute; g.font = `600 40px ${BODY}`; g.fillText(nombre, 112, y);
    ints.forEach((x, k) => { const cx = 560 + k * 150; g.fillStyle = x.ok ? C.ok : C.rojo; g.font = `800 56px ${DISPLAY}`; g.fillText(String(x.kg), cx, y + 4); if (!x.ok) { const w = g.measureText(String(x.kg)).width; g.fillRect(cx - 4, y - 18, w + 8, 6); } });
  };
  fila(860, d.lineaArr, d.arranque); fila(1000, d.lineaDT, d.dosTiempos);
  g.fillStyle = C.tinta; g.font = `400 40px ${BODY}`; ajustar(g, d.pie || '', 80, 1150, W - 160);
  if (d.prono) { g.fillStyle = C.oro; g.font = `600 36px ${BODY}`; ajustar(g, d.prono, 80, 1205, W - 160); }      // la mejor racha de pronósticos
  g.fillStyle = C.teal; g.font = `700 48px ${DISPLAY}`; g.fillText(d.url, 80, 1260);
  return new Promise(res => { try { cv.toBlob(b => res(b), 'image/png'); } catch { res(null); } });
}

function ajustar(g, txt, x, y, max) { let s = parseInt(g.font.match(/(\d+)px/)?.[1] || '40', 10); const base = g.font; while (s > 20 && g.measureText(txt).width > max) { s -= 4; g.font = base.replace(/\d+px/, s + 'px'); } g.fillText(txt, x, y); }
function redondo(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
