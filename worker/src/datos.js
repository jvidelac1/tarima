// Consultas a D1. Todo lo que decide va en reglas.js; acá solo se lee, se escribe y se cuenta.
import { RETENCION, SIN_CONFIRMAR, VENTANA_IP } from './reglas.js';

/** Crea el dispositivo si no existe y lo devuelve. */
export async function asegurarDispositivo(db, d, ahora) {
  const [, sel] = await db.batch([
    db.prepare('INSERT INTO dispositivos (d, creado, ultimo) VALUES (?1, ?2, ?2) ON CONFLICT(d) DO NOTHING').bind(d, ahora),
    db.prepare('SELECT d, creado, ultimo, lista_id, encuesta_en, flags, flags_en FROM dispositivos WHERE d = ?1').bind(d),
  ]);
  return sel.results[0];
}

// Partidas de la IP en la ventana, sin contar las de dispositivos anotados (un dispositivo borrado cuenta como no anotado).
const USADAS_I = `SELECT COUNT(*) FROM partidas p WHERE p.i = ?2 AND p.en > ?3
  AND NOT EXISTS (SELECT 1 FROM dispositivos x WHERE x.d = p.d AND x.lista_id IS NOT NULL)`;
const USADAS_D = `SELECT COUNT(*) FROM partidas WHERE d = ?1 AND fuente != 'lista'`;

export async function contar(db, d, i, ahora) {
  return db.prepare(`SELECT (${USADAS_D}) AS usadas_d, (SELECT COUNT(*) FROM partidas WHERE d = ?1) AS total_d,
      (${USADAS_I}) AS usadas_i, (SELECT COUNT(*) FROM encuestas WHERE i = ?2 AND en > ?3) AS encuestas_i`)
    .bind(d, i, ahora - VENTANA_IP).first();
}

/**
 * Inserta la partida solo si las cuentas no cambiaron desde que se leyeron (dos pedidos a la vez no pasan el tope).
 * Devuelve el id de la partida, o null si no se insertó.
 */
export async function insertarPartida(db, { d, i, ahora, fuente, etapa = 'completa', usadas_d, usadas_i }) {
  const ins = fuente === 'lista'
    ? db.prepare('INSERT INTO partidas (d, i, en, fuente, etapa) VALUES (?1, ?2, ?4, ?5, ?6)').bind(d, i, ahora - VENTANA_IP, ahora, fuente, etapa)
    : db.prepare(`INSERT INTO partidas (d, i, en, fuente, etapa) SELECT ?1, ?2, ?4, ?5, ?8
        WHERE (${USADAS_D}) = ?6 AND (${USADAS_I}) = ?7`).bind(d, i, ahora - VENTANA_IP, ahora, fuente, usadas_d, usadas_i, etapa);
  const [r] = await db.batch([ins, db.prepare('UPDATE dispositivos SET ultimo = ?2 WHERE d = ?1').bind(d, ahora)]);
  return r.meta.changes === 1 ? Number(r.meta.last_row_id) : null;
}

/** La partida `id` de este dispositivo (null si no es suya), y si otra suya ya pasó al dos tiempos por la encuesta. */
export const partidaDe = (db, id, d) => db.prepare(`SELECT id, etapa, envion_por,
    EXISTS (SELECT 1 FROM partidas o WHERE o.d = ?2 AND o.envion_por = 'encuesta') AS encuesta_usada
    FROM partidas WHERE id = ?1 AND d = ?2`).bind(id, d).first();

/**
 * Pasa una partida de 'arranque' a 'completa' (permiso para el dos tiempos). Con la encuesta, solo si ninguna otra
 * partida del dispositivo lo usó (una vez por dispositivo, también con dos pedidos a la vez). true si cambió.
 */
export async function pasarAlEnvion(db, { id, d, via }) {
  const r = await db.prepare(`UPDATE partidas SET etapa = 'completa', envion_por = ?3
      WHERE id = ?1 AND d = ?2 AND etapa = 'arranque'
      AND (?3 = 'lista' OR NOT EXISTS (SELECT 1 FROM partidas o WHERE o.d = ?2 AND o.envion_por = 'encuesta'))`).bind(id, d, via).run();
  return r.meta.changes === 1;
}

/** Suma un pedido a la ventana fija de la regla. Devuelve true si todavía está dentro del límite. */
export async function dentroDelLimite(db, { regla, i, max, periodo, ahora }) {
  const ventana = Math.floor(ahora / periodo);
  const r = await db.prepare(`INSERT INTO limites (k, n, hasta) VALUES (?1, 1, ?2)
      ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n`).bind(`${regla}:${i}:${ventana}`, (ventana + 1) * periodo).first();
  return r.n <= max;
}

export const guardarBanderas = (db, d, flags, ahora) =>
  db.prepare('UPDATE dispositivos SET flags = ?2, flags_en = ?3 WHERE d = ?1').bind(d, JSON.stringify(flags), ahora).run();

export const encuestasDeIp = async (db, i, ahora) =>
  (await db.prepare('SELECT COUNT(*) AS n FROM encuestas WHERE i = ?1 AND en > ?2').bind(i, ahora - VENTANA_IP).first()).n;

/** Registra el desbloqueo. i es null si el dispositivo está anotado. Devuelve false si ya existía. */
export async function registrarEncuesta(db, { d, i, ahora }) {
  const [r] = await db.batch([
    db.prepare('INSERT INTO encuestas (d, i, en) VALUES (?1, ?2, ?3) ON CONFLICT(d) DO NOTHING').bind(d, i, ahora),
    db.prepare('UPDATE dispositivos SET encuesta_en = COALESCE(encuesta_en, ?2) WHERE d = ?1').bind(d, ahora),
  ]);
  return r.meta.changes === 1;
}

export const buscarEmail = (db, email) => db.prepare('SELECT id, idioma, nombre, confirmado_en FROM lista WHERE email = ?1').bind(email).first();
export const buscarLista = (db, id) => db.prepare('SELECT id, idioma, nombre, confirmado_en FROM lista WHERE id = ?1').bind(id).first();
export const ligarDispositivo = (db, d, lista_id, ahora) =>
  db.prepare('UPDATE dispositivos SET lista_id = ?2, ultimo = MAX(ultimo, ?3) WHERE d = ?1').bind(d, lista_id, ahora).run();

export async function altaLista(db, f) {
  const r = await db.prepare(`INSERT INTO lista (id, email, nombre, idioma, pais, novedades, consentimiento_version, consentimiento_en, creado)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) ON CONFLICT(email) DO NOTHING`)
    .bind(f.id, f.email, f.nombre, f.idioma, f.pais, f.novedades ? 1 : 0, f.consentimiento, f.ahora).run();
  return r.meta.changes === 1;
}

export const confirmar = async (db, id, ahora) =>
  (await db.prepare('UPDATE lista SET confirmado_en = ?2 WHERE id = ?1 AND confirmado_en IS NULL').bind(id, ahora).run()).meta.changes === 1;

/** Anota cuándo salió el primer correo de confirmación (desde ahí corren los 30 días para confirmar). */
export const confirmacionMandada = (db, id, ahora) =>
  db.prepare('UPDATE lista SET confirmar_mandado_en = COALESCE(confirmar_mandado_en, ?2) WHERE id = ?1').bind(id, ahora).run();

/** Dispositivo sin crearlo (null si no existe). */
export const buscarDispositivo = (db, d) => db.prepare('SELECT d, lista_id FROM dispositivos WHERE d = ?1').bind(d).first();

export const borrarDeLista = async (db, id) => (await db.prepare('DELETE FROM lista WHERE id = ?1').bind(id).run()).meta.changes === 1;

export const exportarLista = async db => (await db.prepare(`SELECT id, email, nombre, idioma, pais, novedades, consentimiento_version,
    consentimiento_en, creado, confirmado_en FROM lista ORDER BY creado`).all()).results;

/** Limpieza diaria (Cron Trigger). Devuelve cuántas filas tocó cada paso. */
export async function limpiar(db, ahora) {
  const pasos = [
    ['ip_partidas', db.prepare('UPDATE partidas SET i = NULL WHERE i IS NOT NULL AND en <= ?1').bind(ahora - VENTANA_IP)],
    ['ip_encuestas', db.prepare('UPDATE encuestas SET i = NULL WHERE i IS NOT NULL AND en <= ?1').bind(ahora - VENTANA_IP)],
    ['partidas', db.prepare('DELETE FROM partidas WHERE en <= ?1').bind(ahora - RETENCION)],
    // Todos, también los ligados a la lista: la página de privacidad promete 180 días sin jugar. Quien vuelve después
    // pone el mismo mail y recupera el juego libre.
    ['dispositivos', db.prepare('DELETE FROM dispositivos WHERE ultimo <= ?1').bind(ahora - RETENCION)],
    ['encuestas', db.prepare('DELETE FROM encuestas WHERE d NOT IN (SELECT d FROM dispositivos)')],
    // Solo las altas a las que se les mandó el correo de confirmación hace más de 30 días: sin envío de correos
    // (sin dominio propio) ninguna alta se borra por no confirmar.
    ['sin_confirmar', db.prepare(`DELETE FROM lista WHERE confirmado_en IS NULL AND confirmar_mandado_en IS NOT NULL
      AND confirmar_mandado_en <= ?1`).bind(ahora - SIN_CONFIRMAR)],
    ['limites', db.prepare('DELETE FROM limites WHERE hasta <= ?1').bind(ahora)],
  ];
  const r = await db.batch(pasos.map(p => p[1]));
  return Object.fromEntries(pasos.map((p, k) => [p[0], r[k].meta.changes]));
}
