// Recuadro de depuración (juego.html?depura=1): cuadros que ofrece el navegador y cuadros dibujados en el último segundo,
// tiempo por cuadro, calidad en uso y los últimos toques con su destino (aceptado, o descartado y por qué). Solo lee.
const MOTIVO = { espera: 'esperá: todavía no', rebote: 'rebote', sobra: 'sobra: no hacía falta', tarde: 'tarde: ya se perdió', termino: 'el intento ya terminó', pausa: 'pausa', mouse: 'el clic no es un gesto', boton: 'botón del panel', sigue: 'seguir', gesto: 'gesto' };
export class Depura {
  /** @param {HTMLElement} el  @param {() => {perf:object, calidad:object, toques:object, pantalla:string}} fuente */
  constructor(el, fuente) { this.el = el; this.fuente = fuente; this.t = 0; el.hidden = false; }
  /** Una vez por cuadro del navegador; repinta cuatro veces por segundo. */
  cuadro(now) { if (now - this.t >= 250) { this.t = now; this.pintar(); } }
  pintar() {
    const { perf: p, calidad: c, toques: k, pantalla } = this.fuente();
    const l = [`pantalla ${c.hz} Hz · meta ${c.meta ?? '—'} · ${pantalla}`,
      `cuadros/s  ofrece ${p.ofrecidos} · dibuja ${p.dibujados}`,
      `ms/cuadro  ${p.ms.toFixed(1)} · peor ${p.max.toFixed(0)}`,
      `calidad    ${c.nombre}${c.auto ? ' (auto)' : ' (fija)'} · ${c.megapixeles} MP · bajó ${c.cambios.length}`,
      `toques ${k.total} · ok ${k.aceptados} · descartados ${k.descartados}`];
    for (const T of k.ultimos.slice(-7).reverse()) l.push(`${String(T.n).padStart(3)} ${T.ok === null ? '…' : T.ok ? '✓' : '✗'} ${T.tecla.padEnd(7)} ${T.ok === false ? MOTIVO[T.motivo] || T.motivo : T.nota || MOTIVO[T.motivo] || ''} · ${T.donde}`);
    const txt = l.join('\n'); if (txt !== this.txt) { this.txt = txt; this.el.textContent = txt; }
  }
}
