// Errores del juego (LIF-26): conteo diario en D1 y alerta en la limpieza diaria (cron) si el día anterior tuvo muchos.
const corto = (v, n) => (typeof v === 'string' ? v.replace(/[^\s@]+@[^\s@]+/g, '[mail]').replace(/\s+/g, ' ').trim().slice(0, n) : '');
export const UMBRAL = { minimo: 20, porFinal: 50 };      // alerta: más de 20 errores y más de 1 cada 2 finales (50 por cada 100)

/** Suma un error al día. Devuelve false si el cuerpo no sirve. */
export async function anotarError(db, b, ahora) {
  const tipo = corto(b.tipo, 40), mensaje = corto(b.mensaje, 160);
  if (!tipo || !/^[A-Za-z_]{1,40}$/.test(tipo)) return false;
  const pantalla = /^[a-z_]{1,24}$/.test(b.pantalla || '') ? b.pantalla : '-';
  const archivo = /^[\w.-]{1,60}$/.test(b.archivo || '') ? b.archivo : null, linea = Number.isInteger(b.linea) && b.linea >= 0 && b.linea < 1e6 ? b.linea : null;
  const dia = new Date(ahora * 1000).toISOString().slice(0, 10);
  await db.prepare(`INSERT INTO errores (dia, tipo, pantalla, mensaje, archivo, linea) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT (dia, tipo, pantalla, mensaje) DO UPDATE SET n = n + 1`).bind(dia, tipo, pantalla, mensaje || '-', archivo, linea).run();
  return true;
}

/** Resumen del día `dia` (AAAA-MM-DD): errores, finales pedidas y los 5 errores más repetidos; `alerta` si pasa el umbral. */
export async function resumenDia(db, dia) {
  const e = await db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM errores WHERE dia = ?1').bind(dia).first();
  const p = await db.prepare("SELECT COUNT(*) AS n FROM partidas WHERE date(en, 'unixepoch') = ?1").bind(dia).first();
  const top = (await db.prepare('SELECT tipo, pantalla, mensaje, archivo, linea, n FROM errores WHERE dia = ?1 ORDER BY n DESC LIMIT 5').bind(dia).all()).results;
  const alerta = e.n > UMBRAL.minimo && e.n * 100 > Math.max(1, p.n) * UMBRAL.porFinal;
  return { dia, errores: e.n, finales: p.n, alerta, top };
}

export const limpiarErrores = (db, ahora) => db.prepare('DELETE FROM errores WHERE dia < ?1').bind(new Date((ahora - 90 * 86400) * 1000).toISOString().slice(0, 10));
