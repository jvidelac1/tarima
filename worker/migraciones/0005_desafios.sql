-- Desafíos (LIF-12): una final validada se puede compartir; quien abre el link juega la misma final (semilla y condiciones)
-- y su resultado queda ligado a la final de origen. `rm` (bono de progresión de la final de origen) no se repite en el
-- desafío: se juega sin progresión.
ALTER TABLE finales ADD COLUMN desafio INTEGER REFERENCES finales (id);
ALTER TABLE finales ADD COLUMN orden TEXT NOT NULL DEFAULT 'rondas';
CREATE INDEX finales_desafio ON finales (desafio);
