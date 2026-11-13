// Ganchos del flujo (docs/MVP.md, secciones 2, 5.5, 6.3 y 7): donde se conectan el servidor (pase y muro) y las métricas.
// main.js los llama en su momento y no sabe qué hay detrás. Por defecto no hacen nada y el juego anda solo (servidor local
// de Python, pruebas). Quien integre reemplaza las funciones de `ganchos`, por ejemplo desde un módulo propio:
//
//   import { ganchos } from './ganchos.js';
//   ganchos.pedirPase = async info => { const r = await api('/api/partida', …); return r; };
//
// Todo lo que reciben es dato, nunca el nombre del jugador (el nombre no viaja en las métricas: sección 3).
export const ganchos = {
  /** true si quien reemplaza `ev` ya anota cada evento en window.JUEGO.eventos (main.js entonces no lo repite). */
  registra: false,

  /**
   * Evento de métricas (sección 6.3). main.js ya lo deja además en window.JUEGO.eventos para las pruebas.
   * @param {string} nombre  @param {object} props  sin nombre, mail, IP ni dispositivo
   */
  ev(nombre, props) { void nombre; void props; },

  /**
   * Estado para pintar la bienvenida (P1) sin esperar: {quedan?: number, anotado?: boolean} o null si no se sabe. Lo
   * correcto es devolver la copia local (tarima.quedan, tarima.muro) y corregirla con /api/estado.
   */
  estado() { return null; },

  /**
   * P4 · pedido del pase, antes de cada final (después de la práctica). Si devuelve 'muro', main.js llama a muro() y no
   * empieza la final. Si falla la red, quien integre decide (sección 2, P4: dos reintentos y después «sin servidor»).
   * @param {{n:number, pesista:string, ctl:string, nivel:string, ritmo:string}} info  n: número de final en este dispositivo
   * @returns {Promise<{estado:'ok', fuente?:string, quedan?:number, n?:number} | {estado:'muro', motivo?:string}>}
   */
  async pedirPase(info) { void info; return { estado: 'ok', fuente: 'local' }; },

  /**
   * P9 · el muro. Lo pinta quien integre (puede usar `info.capa`, el elemento #capa, y `info.t` para los textos) y resuelve
   * cuando la persona puede jugar otra final (true: se pide el pase de nuevo) o cuando vuelve a la bienvenida (false).
   * @param {{origen:'podio'|'bienvenida'|'carga', motivo?:string, nombre:string, capa:HTMLElement, t:Function}} info
   * @returns {Promise<boolean>}
   */
  async muro(info) { void info; return false; },

  /**
   * Intervalo, al terminar el arranque y antes de elegir el primer peso del dos tiempos. Con la regla del arranque gratis
   * (docs/MVP.md 5.5) quien integre sube ahí el muro: 'sigue' juega el dos tiempos; 'corta' termina la final (main.js
   * vuelve al inicio). `info.tabla()` es el HTML de la tabla del arranque y `info.visita(n)` marca la pantalla.
   * @param {{n:number, nombre:string, capa:HTMLElement, t:Function, tabla:()=>string, visita:(n:string)=>void}} info
   * @returns {Promise<'sigue'|'corta'>}
   */
  async intervalo(info) { void info; return 'sigue'; },

  /**
   * P8 · podio, a los 2,5 s, cuando aparecen los botones. `info.lugar` es un <div> vacío debajo de los botones para la
   * invitación suave (podio 1). Devolver 'muro' en el podio 2 hace que main.js llame a muro({origen:'podio'}) en lugar
   * de esperar los botones (P8b); cualquier otra cosa deja el podio como está.
   * @param {{n:number, puesto:number|null, total:number, medalla:string, lugar:HTMLElement, nombre:string, t:Function}} info
   * @returns {Promise<'muro'|null>|'muro'|null}
   */
  podio(info) { void info; return null; },

  /** Texto del botón «Jugar otra vez»: cuántas finales gratis quedan (null: no se sabe, no se dice nada; Infinity: anotado). */
  quedan() { return null; },
};
