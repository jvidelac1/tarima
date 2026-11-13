// Cuánto tapa la interfaz al pesista (pedido del dueño del 13-nov: «en mobile los carteles me tapan mucho al pesista»).
// Se mide en la página, con la caja del pesista proyectada desde three (stage.js → cajas(): huesos de la cabeza a los pies,
// el torso, y la barra con sus discos) y las cajas de la interfaz visible (getBoundingClientRect de los carteles de #tv, el
// panel abierto, el botón redondo, la pausa y el sonido, con opacidad efectiva > 0,5). Devuelve qué parte de cada caja queda
// debajo de alguna (muestreo de 48 × 48 puntos), qué elementos tapan y cuántos textos se ven en la pantalla.
// Lo usan tools/check_barra.mjs y tools/check_telefono.mjs.

/** Corre en la página. `JUEGO.escena.cajas()` tiene que existir (stage.js). */
export function medirEnPagina() {
  const cajas = window.JUEGO?.escena?.cajas?.();
  const vw = innerWidth, vh = innerHeight;
  const opacidad = e => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return 0; o *= +c.opacity; } return o; };
  const visible = e => e && !e.hidden && opacidad(e) > .5;
  const SEL = ['#tv > *', '#capa > .panel', '#zona', '#pausa', '#sonidob', '#saltar', '#sobre', '#instalar', '#sinfoco'];
  const ui = [];
  for (const e of document.querySelectorAll(SEL.join(','))) {
    if (!visible(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    ui.push({ id: e.id || e.className.split(' ')[0] || e.tagName.toLowerCase(), l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  const dentro = (x, y, r) => x >= r.l && x <= r.r && y >= r.t && y <= r.b;
  const parte = c => {
    const l = Math.max(0, c.l), r = Math.min(vw, c.r), t = Math.max(0, c.t), b = Math.min(vh, c.b), N = 48; if (r <= l || b <= t) return { pct: 0, quien: [] };
    let n = 0, tapados = 0; const quien = {};
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = l + (i + .5) * (r - l) / N, y = t + (j + .5) * (b - t) / N; n++;
      const u = ui.filter(q => dentro(x, y, q)); if (u.length) { tapados++; for (const q of u) quien[q.id] = (quien[q.id] || 0) + 1; }
    }
    return { pct: Math.round(tapados * 1000 / n) / 10, quien: Object.entries(quien).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v * 100 / n)}%`) };
  };
  // textos a la vista: elementos con texto propio, dentro de la pantalla y con opacidad efectiva > 0,5
  let textos = 0;
  const w = document.createTreeWalker(document.getElementById('app') || document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const e = n.parentElement; if (!e || vistos.has(e) || !n.textContent.trim()) continue; vistos.add(e);
    if (e.closest('[hidden]') || !visible(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    textos++;
  }
  if (!cajas) return { sinPesista: true, textos };
  const C = cajas.cuerpo, enPantalla = C.r > 0 && C.l < vw && C.b > 0 && C.t < vh;
  return { cuerpo: parte(cajas.cuerpo), torso: parte(cajas.torso), barra: parte(cajas.barra), textos, enPantalla, caja: { l: Math.round(C.l), t: Math.round(C.t), r: Math.round(C.r), b: Math.round(C.b) } };
}

/** Fila de la tabla: «momento: cuerpo 12 % (barrita 9%, zona 3%) · torso 0 % · barra 4 % · 7 textos». */
export const fila = (m, x) => (x && x.sinPesista ? `${m.padEnd(10)} sin pesista · ${x.textos} textos` : x ? `${m.padEnd(10)} cuerpo ${String(x.cuerpo.pct).padStart(5)} %${x.cuerpo.quien.length ? ` (${x.cuerpo.quien.join(', ')})` : ''} · torso ${x.torso.pct} % · barra ${x.barra.pct} % · ${x.textos} textos` : `${m.padEnd(10)} sin pesista`);

/**
 * Umbrales (porcentaje del cuerpo tapado): durante la barrita y el levantamiento ≤ 15 %; en el llamado, el torso ≤ 20 %
 * (el panel puede ocupar más, pero del lado opuesto a la cara y el torso). Devuelve el problema o null.
 */
export function revisar(momento, x) {
  if (!x || x.sinPesista) return null;
  if (['quieta', 'corre', 'pega', 'levanta'].includes(momento) && x.cuerpo.pct > 15) return `${momento}: la interfaz tapa el ${x.cuerpo.pct} % del pesista (meta ≤ 15 %): ${x.cuerpo.quien.join(', ')}`;
  if (momento === 'llamado' && x.torso.pct > 20) return `llamado: el panel tapa el ${x.torso.pct} % del torso y la cara del pesista (meta ≤ 20 %): ${x.torso.quien.join(', ')}`;
  return null;
}
