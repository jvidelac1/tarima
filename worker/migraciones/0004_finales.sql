-- Finales validadas en el servidor (LIF-10): el Worker recalcula cada final desde su registro con el mismo núcleo del juego
-- (web/js/sim/replay.js) y guarda el resultado. Base del ranking (LIF-9), del campeonato semanal (LIF-8) y de las métricas
-- de juego (LIF-2). `p` es la partida del pase (una final por pase); `apodo` solo si la persona eligió aparecer con él.
CREATE TABLE finales (
  id INTEGER PRIMARY KEY,
  p INTEGER NOT NULL UNIQUE,
  d TEXT NOT NULL,
  en INTEGER NOT NULL,
  semana TEXT NOT NULL,
  campeonato INTEGER NOT NULL DEFAULT 0,
  semilla INTEGER NOT NULL,
  ctl TEXT NOT NULL,
  dif TEXT NOT NULL,
  nivel TEXT NOT NULL,
  pesista TEXT NOT NULL,
  s INTEGER NOT NULL,
  c INTEGER NOT NULL,
  total INTEGER NOT NULL,
  puesto INTEGER,
  intentos INTEGER NOT NULL,
  validos INTEGER NOT NULL,
  nulos INTEGER NOT NULL,
  caidas INTEGER NOT NULL,
  barritas INTEGER NOT NULL,
  verdes INTEGER NOT NULL,
  todo_verde INTEGER NOT NULL,
  saltos INTEGER,
  duracion_s INTEGER,
  apodo TEXT,
  pais TEXT
);
CREATE INDEX finales_semana ON finales (campeonato, semana, total DESC, en);
CREATE INDEX finales_total ON finales (total DESC, en);
CREATE INDEX finales_d ON finales (d);
CREATE INDEX finales_en ON finales (en);

-- El campeón de cada semana: el mejor total del campeonato (empata quien llegó antes). La semana en curso se excluye al
-- contar títulos (worker/src/finales.js).
CREATE VIEW campeones AS
  SELECT semana, d FROM (SELECT semana, d, ROW_NUMBER() OVER (PARTITION BY semana ORDER BY total DESC, en) AS k
    FROM finales WHERE campeonato = 1 AND d != '') WHERE k = 1;
