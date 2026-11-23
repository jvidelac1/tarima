// Panel del ranking (LIF-9) y del campeonato semanal (LIF-8). Solo arma el HTML con lo que respondió el servidor
// (worker/src/finales.js → ranking): no decide nada. main.js lo pinta en #sobre y atiende los botones.

/**
 * @param {object} o
 * @param {'semana'|'global'} o.alcance
 * @param {boolean} o.pais        filtrar por el país del visitante
 * @param {null|'cargando'|'error'|object} o.datos  respuesta de /api/ranking
 * @param {boolean} o.publico     la persona eligió aparecer con su nombre
 * @param {string} o.nombre       su nombre (ya escapado)
 * @param {Function} o.t          textos
 * @param {Function} o.esc        escapar HTML
 * @param {Function} o.tipo       id del pesista → «Compacto», «Largo»…
 * @param {string} o.idioma       'es' | 'en' (para la fecha)
 */
export function rankingHTML({ alcance, pais, datos, publico, nombre, t, esc, tipo, idioma }) {
  const pest = (k, txt) => `<button class="rk-pest" data-rk="${k}" aria-pressed="${alcance === k}">${txt}</button>`;
  const filtro = (v, txt) => `<button class="rk-pais" data-rkpais="${v ? 1 : 0}" aria-pressed="${pais === v}">${txt}</button>`;
  let cuerpo;
  if (!datos || datos === 'cargando') cuerpo = `<p class="chica">${t('ranking.cargando')}</p>`;
  else if (datos === 'error' || datos.estado !== 'ok') cuerpo = `<p class="chica">${t('ranking.error')}</p>`;
  else if (!datos.filas.length) cuerpo = `<p class="chica">${t('ranking.vacio')}</p>`;
  else {
    const filas = datos.filas.map(f => `<tr${f.yo ? ' class="yo"' : ''}><td>${f.puesto}</td><td>${f.apodo ? esc(f.apodo) : `<i>${t('ranking.anonimo')}</i>`}${f.yo ? ` <small>(${t('ranking.yo')})</small>` : ''}</td><td>${f.pais ? esc(f.pais) : ''}</td><td>${esc(tipo(f.pesista))}</td>${alcance === 'global' ? `<td>${f.titulos || 0}</td>` : ''}<td><b>${f.total}</b> kg</td></tr>`).join('');
    cuerpo = `<table class="rk-tabla"><tbody>${filas}</tbody></table>`;
  }
  const cierra = datos && typeof datos === 'object' && datos.hasta ? new Date((datos.hasta - 1) * 1000).toLocaleDateString(idioma === 'es' ? 'es' : 'en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : null;
  const nota = alcance === 'semana' ? `${t('campeonato.nota')}${cierra ? ' ' + t('ranking.cierra', { fecha: esc(cierra) }) : ''}` : t('ranking.nota_global');
  return `<h2>${t('ranking.titulo')}</h2>
    <div class="fila rk-pests">${pest('semana', t('ranking.semana'))}${pest('global', t('ranking.global'))}</div>
    <div class="fila rk-filtro">${filtro(false, t('ranking.todos'))}${filtro(true, t('ranking.pais'))}</div>
    <p class="chica">${nota}</p>
    <div class="rk-lista">${cuerpo}</div>
    <label class="rk-publico"><input type="checkbox" id="rk-publico"${publico ? ' checked' : ''}> ${t('ranking.publico', { nombre })}</label>
    <div class="fila"><button class="ir" id="so-seguir">${t('ranking.cerrar')}</button></div>`;
}
