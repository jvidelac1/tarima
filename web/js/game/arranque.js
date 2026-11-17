// Arranque del juego (LIF-33): juego.html carga este módulo, que no importa nada de entrada, y él trae main.js (con three
// y todo el juego). Si el módulo no llega (la red se cortó a mitad de la descarga de three: «Failed to fetch» en Android,
// «Load failed» en el iPhone), el juego ya no se queda colgado en la pantalla de carga:
//  - la página se recarga sola hasta 2 veces, con espera (1,5 s y 3 s; la cuenta va en sessionStorage, así que una
//    recarga a mano no la reinicia y una pestaña nueva empieza de cero). Recargar es lo único que sirve: un navegador no
//    vuelve a pedir un módulo que ya falló en la misma página;
//  - si sigue sin llegar, el aviso «No pudimos descargar el juego» con «Probar de nuevo» (que recarga);
//  - si el módulo llegó pero el navegador no lo entiende (SyntaxError: navegador viejo), el aviso de navegador viejo.
// En los dos casos manda `carga_fallida` (etapa 'modulo') con lo mínimo del error, pidiendo al Worker la clave de la medición
// como cualquier carga (servidor.js y analitica.js no dependen de three). Las fallas de los modelos y del 3D (WebGL, shader)
// las atiende main.js.
const CLAVE = 'tarima.reintento_modulo', ESPERAS = [1500, 3000];
const ses = {
  get() { try { return JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem(CLAVE, JSON.stringify(v)); return true; } catch { return false; } },
  del() { try { sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } },
};
const previas = ses.get()?.n || 0;
// Las pruebas leen window.JUEGO.listo apenas carga la página: hasta que main.js arma el suyo, este espera por él.
let soltar = null;
const listo = new Promise(r => { soltar = r; });
window.JUEGO = Object.assign(window.JUEGO || {}, { listo });
window.__tarimaReintentos = previas;      // main.js lo pone en juego_abierto (`reintentos_modulo`)

try {
  await import('./main.js');
  ses.del();
  soltar(window.JUEGO.listo);
} catch (e) {
  soltar(false);
  await fallo(e);
}

async function fallo(e) {
  const descarga = !(e instanceof SyntaxError);
  // otra vuelta sola, si la cuenta se puede guardar (sin sessionStorage no hay cómo cortar: va directo al aviso)
  if (descarga && previas < ESPERAS.length && ses.set({ n: previas + 1 }) && ses.get()?.n === previas + 1) {
    await new Promise(r => setTimeout(r, ESPERAS[previas]));
    location.reload();
    return;
  }
  ses.del();
  medir(e, previas + 1, descarga);      // sin esperar: el aviso sale ya
  let ui = null;
  try { ({ cargaUI: ui } = await import('./ui/carga.js')); } catch { ui = null; }
  if (ui) await ui.aviso(descarga ? 'descarga' : 'viejo');
  else {
    // no bajó ni la pantalla de carga: el texto fijo de juego.html
    const fijo = document.getElementById('sin-carga');
    if (fijo) { fijo.hidden = false; await new Promise(r => fijo.querySelector('button')?.addEventListener('click', r, { once: true })); }
  }
  location.reload();
}

/** `carga_fallida` con la etapa 'modulo': pide el estado al Worker (la clave de PostHog) y arranca la medición sola. */
async function medir(e, intentos, descarga) {
  try {
    const [{ servidor }, { analitica, detalleError, appNavegador }, { idiomaActual }] = await Promise.all([import('./servidor.js'), import('./analitica.js'), import('./i18n/t.js')]);
    const idioma = idiomaActual(), params = new URLSearchParams(location.search);
    analitica.ev('carga_fallida', { etapa: 'modulo', tipo: descarga ? 'descarga' : 'navegador', intentos, app: appNavegador(navigator.userAgent), ...detalleError(e) });
    const estado = await servidor.estado({ idioma }).catch(() => null);
    await analitica.iniciar({ estado: estado || {}, idioma, idioma_origen: params.get('lang') ? 'url' : 'defecto', version: 'arranque', pantalla: 'falla' });
  } catch { /* sin medición: el aviso igual sale */ }
}
