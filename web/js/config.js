// Datos fijos del visor: atletas ficticios, discos reglamentarios, calidades y duraciones por defecto.

export const ATHLETES = {
  ventura: { name: 'Dario Ventura', country: 'ARX', countryName: 'Arxenia', category: '81 kg', bib: 7, flag: 'linear-gradient(115deg,#e2622b 0 38%,#0e1b3d 38% 62%,#e2622b 62%)', bio: '1,70 m · fémur corto · brazos cortos', kg: { s: 158, c: 194 } },
  brenner: { name: 'Ilya Brenner', country: 'NVK', countryName: 'Novakia', category: '96 kg', bib: 12, flag: 'conic-gradient(from 225deg at 0 50%,#f4f1ea 0 90deg,#0000 0),linear-gradient(180deg,#5a2a82 0 50%,#18a58f 50%)', bio: '1,83 m · fémur largo · brazos largos', kg: { s: 176, c: 213 } },
};

export const EVENT = { title: 'TARIMA OPEN', sub: 'Campeonato Internacional de Halterofilia', year: '2026', session: 'Final A' };

// Discos reglamentarios: kg, color, radio (m), espesor (m). Los de 10 kg o más son bumpers de 450 mm.
export const PLATES = [
  { kg: 25, color: '#c41f1b', r: .225, t: .064, ink: '#f4f1ea' },
  { kg: 20, color: '#1c46b0', r: .225, t: .054, ink: '#f4f1ea' },
  { kg: 15, color: '#e8b90f', r: .225, t: .042, ink: '#14161a' },
  { kg: 10, color: '#1f8a3b', r: .225, t: .034, ink: '#f4f1ea' },
  { kg: 5, color: '#ecebe6', r: .115, t: .0265, ink: '#14161a', change: true },
  { kg: 2.5, color: '#c41f1b', r: .105, t: .019, ink: '#f4f1ea', change: true },
  { kg: 2, color: '#1c46b0', r: .095, t: .019, ink: '#f4f1ea', change: true },
  { kg: 1.5, color: '#e8b90f', r: .0875, t: .018, ink: '#14161a', change: true },
  { kg: 1, color: '#1f8a3b', r: .08, t: .015, ink: '#f4f1ea', change: true },
  { kg: .5, color: '#ecebe6', r: .0675, t: .013, ink: '#14161a', change: true },
];
/** Radio del disco grande: altura del centro de la barra apoyada en la tarima (m). */
export const PLATE_R = .225;
export const BAR_KG = 20, COLLAR_KG = 2.5, MIN_KG = BAR_KG + 2 * COLLAR_KG, MAX_KG = 280;

/** Carga por lado: discos grandes adentro, collarín, y los discos de ajuste (2,5 kg o menos) por fuera. */
export function loadout(totalKg) {
  let rest = Math.max(0, Math.round(totalKg - MIN_KG) / 2);   // kg por lado; el total se redondea al kilo
  const inner = [], outer = [];
  for (const p of PLATES) {
    let n = 0;
    while (rest >= p.kg - 1e-9 && n < (p.kg === 25 ? 6 : 1)) { (p.kg <= 2.5 ? outer : inner).push(p); rest -= p.kg; n++; }
  }
  const total = MIN_KG + 2 * [...inner, ...outer].reduce((s, p) => s + p.kg, 0);
  return { inner, outer, total };
}

export const DUR = {
  'Salida': 1.2, 'Primer tirón': .55, 'Segundo tirón': .3, 'Triple extensión': .13, 'Bajada': .2, 'Recepción': .22, 'Recuperación': 1.3,
  'Envión · Dip': .35, 'Envión · Empuje': .16, 'Envión · Tijera': .2, 'Envión · Recuperación': .7, 'Envión · Final': .7,
  'Power jerk · Recepción': .2, 'Squat jerk · Recepción': .25, 'Squat jerk · Recuperación': .9,
};
export const DUR_DEFAULT = .5;
/** Pausa en el rack entre la cargada y el envión (s). */
export const RACK_HOLD = .9;

// mblur: muestras del desenfoque de movimiento de barra y discos (0 o ausente = apagado).
// dofSamples: muestras fijas del desenfoque (a media resolución). El DPR de alta queda en 1,5 hasta medir en más equipos.
// Nada de esto obliga a reconstruir geometría ni texturas: el entorno y la barra se arman una vez (main.js).
export const QUALITY = {
  alta: { label: 'Alta', dpr: 1.5, maxPixels: 2304 * 1296, msaa: 4, shadow: 1536, shadow2: 768, ao: 1, aoScale: .5, aoSamples: 12, dof: 1, dofSamples: 36, bloom: true, smaa: true, mblur: 12, crowd: 1, beams: true, aniso: 16, tex: 2048 },
  media: { label: 'Media', dpr: 1.25, maxPixels: 1920 * 1080, msaa: 4, shadow: 1024, shadow2: 0, ao: 1, aoScale: .5, dof: 1, dofSamples: 24, bloom: true, smaa: false, mblur: 8, crowd: .7, beams: true, aniso: 8, tex: 2048 },
  // baja: sin AO, DoF ni bloom, pero conserva lo barato del look: tone mapping, corrección de color y viñeta en el pase
  // final, niebla, haces, discos de bokeh dibujados como sprites y tribuna horneada ya desenfocada. MSAA y DPR hasta 2.
  baja: { label: 'Baja', dpr: 2, maxPixels: 1280 * 800, msaa: 4, shadow: 1024, shadow2: 0, ao: 0, aoScale: .5, dof: 0, dofSamples: 0, bloom: false, smaa: false, crowd: .4, beams: true, aniso: 4, tex: 1024 },
};

/** Calidad de arranque del modo auto: conservadora. El gobernador de main.js sube a alta solo si sobra margen. */
export function detectQuality() {
  const coarse = matchMedia('(pointer:coarse)').matches, small = Math.min(innerWidth, innerHeight) < 600;
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  if (coarse && (small || cores <= 6 || mem <= 4)) return 'baja';
  if (cores <= 4 || mem <= 4) return coarse ? 'baja' : 'media';
  return 'media';
}
