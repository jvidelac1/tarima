-- Escuela de entrenamiento de cada sesión (LIF-69): rusa (la de siempre), búlgara o china.
ALTER TABLE entrenos ADD COLUMN escuela TEXT NOT NULL DEFAULT 'rusa';
