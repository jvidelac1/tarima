// Cortes y carteles de una final (pedido del dueño del 13-nov: «hay muchos cortes cuando un pesista termina de tirar»).
// Dos fuentes:
//  - el juego anota cada corte a la vista en JUEGO.E.cortes (stage.js → _vigilar: la cámara salta de un cuadro al siguiente,
//    cambia el pesista sin fundido, o la barra o la cadera saltan) y cada fundido en JUEGO.E.fundidos;
//  - instalarEnPagina() mira en la página qué carteles y paneles aparecen y desaparecen (visibles de verdad: sin `hidden`,
//    sin display:none, opacidad efectiva > 0,5) y cuándo, con el reloj del juego. Un cartel que cambia de texto sin
//    esconderse cuenta como otro cartel (el veredicto que pasa a «Repetición», el cartel del rival que pasa a otro aviso).
// resumir() cuenta todo en el tramo de la final, y aparte en las ventanas «entre levantamientos» (sin intento en curso).
// Lo usa tools/check_recorrido.mjs. Sin navegador no corre.

/** Corre en la página (page.evaluate). Deja en window.__vista {ap: [{k, t0, t1, txt}], vivos}. */
export function instalarEnPagina() {
  if (window.__vista) return true;
  const SEL = { veredicto: '#veredicto', rival: '#rival', turno: '#turno', marcador: '#marcador', tablero: '#tablero', etiqueta: '#etiqueta', zocalo: '#zocalo', seguir: '#seguir', cartel: '#cartel', guia: '#guia', saltar: '#saltar-rival', panel: '#capa > .panel' };
  const SIN_TEXTO = new Set(['tablero', 'marcador', 'zocalo', 'saltar']);      // se actualizan en el lugar: solo cuenta que aparezcan
  const V = window.__vista = { ap: [], vivos: {} };
  const ahora = () => Math.round(window.JUEGO?.reloj?.ahora?.() ?? performance.now());
  const visible = e => {
    if (!e || e.closest('[hidden]')) return false;
    let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; o *= +c.opacity; }
    const r = e.getBoundingClientRect(); return o > .5 && r.width > 2 && r.height > 2;
  };
  const texto = (k, e) => (SIN_TEXTO.has(k) ? '' : k === 'panel' ? (e.querySelector('h1,h2')?.textContent || e.className).trim() : e.textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
  const revisar = () => {
    const t = ahora();
    for (const [k, sel] of Object.entries(SEL)) {
      const e = document.querySelector(sel), vis = visible(e), txt = vis ? texto(k, e) : '', v = V.vivos[k];
      if (v && (!vis || txt !== v.txt)) { V.ap.push({ k, t0: v.t0, t1: t, txt: v.txt }); delete V.vivos[k]; }
      if (vis && !V.vivos[k]) V.vivos[k] = { t0: t, txt };
    }
  };
  new MutationObserver(revisar).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'data-pantalla'], childList: true, characterData: true });
  V.revisar = revisar; revisar(); return true;
}

/** Corre en la página: cierra los carteles a la vista y devuelve lo anotado. */
export function leerEnPagina() {
  const V = window.__vista; if (!V) return null; V.revisar();
  const t = Math.round(window.JUEGO.reloj.ahora()), ap = V.ap.concat(Object.entries(V.vivos).map(([k, v]) => ({ k, t0: v.t0, t1: t, txt: v.txt })));
  return { ap, cortes: window.JUEGO.E.cortes || [], fundidos: window.JUEGO.E.fundidos || [] };
}

/**
 * Cuenta en [desde, hasta] (ms del reloj del juego). `entre`: ventanas [t0, t1] sin intento en curso (entre levantamientos).
 * @returns {{seg:number, cortes:number, porRazon:object, cortesMin:number, fundidos:number, apariciones:number, apMin:number,
 *   relampagos:number, porElemento:object, entre:{ventanas:number, seg:number, cortes:number, apariciones:number, relampagos:number}}}
 */
export function resumir(D, desde, hasta, entre = []) {
  const en = t => t >= desde && t <= hasta, dentro = t => entre.some(([a, b]) => t >= a && t <= b), min = Math.max(1e-9, (hasta - desde) / 60000);
  const cortes = D.cortes.filter(c => en(c.t)), ap = D.ap.filter(x => en(x.t0)), fund = D.fundidos.filter(f => en(f.t ?? f));
  const porRazon = {}; for (const c of cortes) for (const r of c.r.split('+')) porRazon[r] = (porRazon[r] || 0) + 1;
  const porElemento = {}; for (const x of ap) porElemento[x.k] = (porElemento[x.k] || 0) + 1;
  const rel = x => x.t1 - x.t0 < 1000, E = entre.filter(([a, b]) => b > desde && a < hasta);
  const r1 = x => Math.round(x * 10) / 10;
  return {
    seg: r1((hasta - desde) / 1000), cortes: cortes.length, porRazon, cortesMin: r1(cortes.length / min), fundidos: fund.length,
    apariciones: ap.length, apMin: r1(ap.length / min), relampagos: ap.filter(rel).length, porElemento,
    relampagosLista: ap.filter(rel).map(x => `${x.k}${x.txt ? ' «' + x.txt.slice(0, 40) + '»' : ''} ${x.t1 - x.t0} ms`),
    entre: { ventanas: E.length, seg: r1(E.reduce((s, [a, b]) => s + b - a, 0) / 1000), cortes: cortes.filter(c => dentro(c.t)).length, apariciones: ap.filter(x => dentro(x.t0)).length, relampagos: ap.filter(x => dentro(x.t0) && rel(x)).length },
  };
}

/** Las líneas del informe. */
export function informe(R) {
  const r = Object.entries(R.porRazon).map(([k, v]) => `${k} ${v}`).join(', ') || '—', e = Object.entries(R.porElemento).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  return [
    `final de ${R.seg} s (del primer llamado al podio)`,
    `cortes bruscos de imagen: ${R.cortes} (${r}) · ${R.cortesMin} por minuto · fundidos: ${R.fundidos}`,
    `carteles y paneles que aparecen: ${R.apariciones} · ${R.apMin} por minuto · de menos de 1 s: ${R.relampagos}`,
    `  por elemento: ${e}`,
    `entre levantamientos (${R.entre.ventanas} ventanas, ${R.entre.seg} s): cortes ${R.entre.cortes} (${(R.entre.cortes / Math.max(1, R.entre.ventanas)).toFixed(1)} por ventana) · carteles ${R.entre.apariciones} (${(R.entre.apariciones / Math.max(1, R.entre.ventanas)).toFixed(1)} por ventana) · de menos de 1 s: ${R.entre.relampagos}`,
    ...(R.relampagosLista.length ? [`  de menos de 1 s: ${R.relampagosLista.slice(0, 12).join(' · ')}`] : []),
  ];
}
