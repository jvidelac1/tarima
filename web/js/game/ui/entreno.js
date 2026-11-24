// Entrenamiento entre competencias (LIF-62): elegir un ejercicio y 3 pasadas de una barrita, con un botón grande (Espacio,
// Enter o un toque). La zona de cada toque y lo que suma lo decide el núcleo (web/js/sim/entreno.js) y lo confirma el servidor.
import { ENTRENO, posBarra, reglasB } from '../../sim/rules.js';
import { EJERCICIOS, zonaEntreno } from '../../sim/entreno.js';

const R = { ...reglasB('facil'), pasada: ENTRENO.pasada };

/**
 * @param {object} o
 * @param {HTMLElement} o.capa       #capa
 * @param {Function} o.t  @param {Function} o.esc
 * @param {() => number} o.ahora     reloj del juego (ms)
 * @param {string} o.pesista         texto «Compacto»…
 * @param {{kg_s:number, kg_c:number, tecnica:number}} o.entrenado
 * @param {number} o.disponibles
 * @param {(ej:string, toques:number[]) => Promise<object>} o.mandar   el servidor (ganchos.entrenar)
 * @param {(n:string, p:object) => void} o.ev
 * @returns {Promise<{hechas:number}>}
 */
export async function entrenar(o) {
  const { capa, t, esc } = o; let disp = o.disponibles, ent = { ...o.entrenado }, hechas = 0, escuela = o.escuela || 'rusa';
  const panel = html => { capa.innerHTML = `<div class="panel entreno">${html}</div>`; return capa.firstElementChild; };
  const clic = (pn, sel) => new Promise(res => pn.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => res(b))));
  for (;;) {
    const prog = { tiron: `${ent.kg_s}/${ENTRENO.topeKg} kg`, sentadilla: `${ent.kg_c}/${ENTRENO.topeKg} kg`, tecnica: `${Math.round(ent.tecnica / 10)}/${ENTRENO.topeTecnica / 10} %` };
    const pn = panel(`<h2>${t('entreno.titulo', { pesista: esc(o.pesista) })}</h2><p>${t('entreno.intro', { n: disp })}</p>
      ${o.conEscuelas ? `<div class="fila escuelas"><span>${t('entreno.escuela')}</span>${['rusa', 'bulgara', 'china'].map(k => `<button data-esc="${k}" aria-pressed="${k === escuela}">${t('escuela.' + k)}</button>`).join('')}</div><p class="chica">${t('escuela.' + escuela + '_nota')}</p>` : ''}
      <div class="ejercicios">${EJERCICIOS.map(k => `<button class="ejercicio" data-ej="${k}"${disp < 1 ? ' disabled' : ''}><b>${t('entreno.' + k)}</b><small>${t('entreno.' + k + '_nota')}</small><em>${prog[k]}</em></button>`).join('')}</div>
      <div class="fila"><button class="ir" id="en-salir">${t('entreno.listo')}</button></div>`);
    (pn.querySelector('.ejercicio:not([disabled])') || pn.querySelector('#en-salir')).focus();
    const b = await clic(pn, '.ejercicio,#en-salir,[data-esc]');
    if (b.dataset.esc) { escuela = b.dataset.esc; o.alElegirEscuela?.(escuela); continue; }
    if (b.id === 'en-salir') { capa.innerHTML = ''; return { hechas }; }
    const ej = b.dataset.ej, toques = await pasadas(o, ej);
    let r = null; try { r = await o.mandar(ej, toques, o.conEscuelas ? escuela : 'rusa'); } catch { r = null; }
    const zonas = toques.map(zonaEntreno), verdes = zonas.filter(z => z === 'verde').length;
    let msg;
    if (r && r.estado === 'ok') { disp = r.disponibles; ent = r.entrenado; hechas++; const s = r.suma; msg = s.kg_s ? t('entreno.suma_s', { kg: s.kg_s }) : s.kg_c ? t('entreno.suma_c', { kg: s.kg_c }) : s.tecnica ? t('entreno.suma_tecnica') : verdes >= ENTRENO.verdesParaSumar ? t('entreno.tope') : t('entreno.no_suma'); }
    else msg = t(r && r.estado === 'sin_energia' ? 'entreno.sin_energia' : 'entreno.sin_servidor');
    o.ev?.('entreno_hecho', { ejercicio: ej, verdes, ok: !!(r && r.estado === 'ok') });
    const pr = panel(`<h2>${t('entreno.' + ej)}</h2><p class="zonas">${zonas.map(z => `<i class="z-${z}"></i>`).join('')}</p><p>${t('entreno.verdes', { n: verdes })} ${msg}</p><div class="fila"><button class="ir" id="en-ok">${t('entreno.seguir')}</button></div>`);
    pr.querySelector('#en-ok').focus(); await clic(pr, '#en-ok');
  }
}

/** Las 3 pasadas: el puntero va y vuelve; el botón grande lo frena. Devuelve los ms desde el arranque de cada pasada. */
function pasadas(o, ej) {
  const { capa, t } = o, out = [];
  return new Promise(res => {
    let k = 0, t0 = 0, raf = 0;
    const pinta = () => {
      capa.innerHTML = `<div class="panel entreno"><h2>${t('entreno.' + ej)} · ${k + 1}/${ENTRENO.pasadas}</h2>
        <div class="en-barra"><i class="en-am" style="left:${ENTRENO.amarillo[0] / 10}%;width:${(ENTRENO.amarillo[1] - ENTRENO.amarillo[0]) / 10}%"></i><i class="en-ve" style="left:${ENTRENO.verde[0] / 10}%;width:${(ENTRENO.verde[1] - ENTRENO.verde[0]) / 10}%"></i><b class="en-punt"></b></div>
        <div class="fila"><button class="ir grande" id="en-toca">${t('entreno.toca')}</button></div></div>`;
      const pn = capa.firstElementChild, punt = pn.querySelector('.en-punt'), btn = pn.querySelector('#en-toca');
      t0 = o.ahora();
      const anima = () => { const x = posBarra(Math.round(o.ahora() - t0), R); punt.style.left = (x / 10) + '%'; raf = requestAnimationFrame(anima); };
      anima(); btn.focus();
      btn.addEventListener('click', () => {
        cancelAnimationFrame(raf); out.push(Math.max(0, Math.round(o.ahora() - t0))); k++;
        if (k < ENTRENO.pasadas) setTimeout(pinta, 350); else res(out);
      }, { once: true });
    };
    pinta();
  });
}
