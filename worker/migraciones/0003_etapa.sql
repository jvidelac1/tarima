-- Muro en el medio de la final (decisión del dueño del 12 de noviembre, con las dos primeras horas publicadas a la vista;
-- docs/MVP.md 5.5 y 7): con GRATIS_ETAPA='arranque'
-- la final gratis da solo el arranque; el dos tiempos (envión) necesita permiso del servidor (POST /api/envion), que lo da
-- con la lista o con el bono de la encuesta.
--  etapa:      'arranque' = la final se entregó con permiso solo para el arranque; 'completa' = con las dos partes (todas
--              las finales anteriores a esta migración, las de la regla vieja, las de la lista y las de la encuesta).
--  envion_por: quién autorizó el dos tiempos de una final que empezó como 'arranque' ('lista' o 'encuesta'); NULL si no
--              pasó por /api/envion. El de la encuesta se da una sola vez por dispositivo.
ALTER TABLE partidas ADD COLUMN etapa TEXT NOT NULL DEFAULT 'completa' CHECK (etapa IN ('arranque', 'completa'));
ALTER TABLE partidas ADD COLUMN envion_por TEXT CHECK (envion_por IN ('lista', 'encuesta'));
