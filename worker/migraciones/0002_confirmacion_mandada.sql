-- Cuándo salió el primer correo de confirmación de un alta (decisión del dueño del 12 de noviembre: sin dominio propio
-- no hay correos, y ninguna alta se borra por no confirmar mientras no se le haya pedido confirmar). La limpieza diaria
-- borra solo las altas sin confirmar cuyo correo de confirmación salió hace más de 30 días.
ALTER TABLE lista ADD COLUMN confirmar_mandado_en INTEGER;
DROP INDEX IF EXISTS lista_sin_confirmar;
CREATE INDEX lista_sin_confirmar ON lista (confirmado_en, confirmar_mandado_en);
