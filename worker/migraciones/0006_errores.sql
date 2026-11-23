-- Errores del juego (LIF-26): los mismos `error_juego` que van a PostHog, contados por día, tipo, pantalla y mensaje
-- (recortado y sin mails ni parámetros de URL: web/js/game/analitica.js, detalleError). Sin dispositivo ni IP.
CREATE TABLE errores (
  dia TEXT NOT NULL,
  tipo TEXT NOT NULL,
  pantalla TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  archivo TEXT,
  linea INTEGER,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (dia, tipo, pantalla, mensaje)
);
