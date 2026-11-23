-- Entrenamiento entre competencias (LIF-62): cada sesión validada (el servidor la recalcula desde los toques) con lo que
-- sumó. La energía son ENTRENO.porFinal sesiones por final validada, hasta ENTRENO.guardaMax guardadas.
CREATE TABLE entrenos (
  id INTEGER PRIMARY KEY,
  d TEXT NOT NULL,
  en INTEGER NOT NULL,
  pesista TEXT NOT NULL,
  ejercicio TEXT NOT NULL,
  verdes INTEGER NOT NULL,
  kg_s INTEGER NOT NULL DEFAULT 0,
  kg_c INTEGER NOT NULL DEFAULT 0,
  tecnica INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX entrenos_d ON entrenos (d, pesista);
