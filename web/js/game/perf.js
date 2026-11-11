// Registrador de cuadros por segundo por tramo de la partida y escalón de calidad «móvil» (docs/JUEGO.md, sección 8.7).
import { QUALITY, detectQuality } from '../config.js';

/** Debajo de «baja»: pensado para un teléfono. Valores iniciales sin medir en un teléfono real. */
export const MOVIL = { label: 'Móvil', dpr: 1.5, maxPixels: 1280 * 720, msaa: 2, shadow: 512, shadowR: 4.5, shadow2: 0, ao: 0, aoScale: .5, dof: 0, dofSamples: 0, bloom: false, smaa: false, crowd: .3, beams: false, aniso: 2, tex: 1024 };
export function calidadInicial(pedida) {
  if (pedida === 'movil') return MOVIL; if (QUALITY[pedida]) return QUALITY[pedida];
  return matchMedia('(pointer:coarse)').matches ? MOVIL : QUALITY[detectQuality()];
}

export class Registrador {
  constructor() { this.tramos = {}; this.tramo = 'inicio'; }
  marcar(nombre) { this.tramo = nombre; }
  /** dt de un cuadro dibujado, en ms. */
  cuadro(ms) { if (ms <= 0 || ms > 1000) return; (this.tramos[this.tramo] ||= []).push(ms); if (this.tramos[this.tramo].length > 20000) this.tramos[this.tramo].splice(0, 10000); }
  /** Mínimo y mediana de cuadros por segundo por tramo. */
  resumen() { const o = {}; for (const [k, v] of Object.entries(this.tramos)) { const s = v.slice().sort((a, b) => a - b); o[k] = { n: s.length, mediana: Math.round(1000 / s[s.length >> 1]), minimo: Math.round(1000 / s[s.length - 1]) }; } return o; }
}
