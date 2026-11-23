-- Categoría de peso de cada final (LIF-15, LIF-49): el ranking va por categoría. 88 es la de siempre.
ALTER TABLE finales ADD COLUMN categoria INTEGER NOT NULL DEFAULT 88;
CREATE INDEX finales_categoria ON finales (categoria, campeonato, semana, total DESC);
