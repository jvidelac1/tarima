-- Base D1 `tarima` (docs/MVP.md 5.5). Se aplica con: npx wrangler d1 migrations apply tarima --remote
-- Ninguna columna guarda una IP ni el id del navegador en claro: `d` e `i` son HMAC con secretos del Worker.

-- Un navegador. d = HMAC(SECRETO_DISPOSITIVO, uuid). Se borra a los 180 días sin finales si no está en la lista.
CREATE TABLE dispositivos (
  d TEXT PRIMARY KEY,
  creado INTEGER NOT NULL,
  ultimo INTEGER NOT NULL,          -- última final pedida (o el alta)
  lista_id TEXT,                    -- se conserva aunque la persona se dé de baja: el juego libre no se pierde
  encuesta_en INTEGER,
  flags TEXT,                       -- JSON con el valor de cada bandera para este dispositivo
  flags_en INTEGER
);

-- Una final entregada. i = HMAC(SECRETO_IP, IPv4 o prefijo /64)[0..32]; pasa a NULL a los 30 días.
CREATE TABLE partidas (
  id INTEGER PRIMARY KEY,
  d TEXT NOT NULL,
  i TEXT,
  en INTEGER NOT NULL,
  fuente TEXT NOT NULL CHECK (fuente IN ('gratis', 'encuesta', 'lista'))
);
CREATE INDEX partidas_d ON partidas (d);
CREATE INDEX partidas_i ON partidas (i, en);
CREATE INDEX partidas_en ON partidas (en);

-- Solo el desbloqueo de la encuesta; las respuestas van a PostHog. i es NULL si quien respondió ya estaba anotado
-- (esa encuesta no da premio, así que no suma al cupo de la IP ni gasta los lugares de encuesta de la IP).
CREATE TABLE encuestas (
  d TEXT PRIMARY KEY,
  i TEXT,
  en INTEGER NOT NULL
);
CREATE INDEX encuestas_i ON encuestas (i, en);

-- Lista de espera. id: 16 bytes al azar, sin relación con el mail.
CREATE TABLE lista (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT,
  idioma TEXT NOT NULL,
  pais TEXT,
  novedades INTEGER NOT NULL DEFAULT 0,
  consentimiento_version TEXT NOT NULL,
  consentimiento_en INTEGER NOT NULL,
  creado INTEGER NOT NULL,
  confirmado_en INTEGER
);
CREATE INDEX lista_sin_confirmar ON lista (confirmado_en, creado);

-- Límites de pedidos por ventana fija (las ventanas de 10 minutos y de 1 hora no entran en el límite de pedidos de
-- Workers, que solo admite 10 o 60 segundos). k = '<regla>:<i>:<ventana>'. Las filas vencidas se borran a diario.
CREATE TABLE limites (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  hasta INTEGER NOT NULL
);
CREATE INDEX limites_hasta ON limites (hasta);
