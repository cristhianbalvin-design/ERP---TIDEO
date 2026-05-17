-- Migrar oportunidades en etapa Prospección → Calificación
-- La etapa Prospección se elimina del Pipeline; el flujo inicia en Calificación.
UPDATE oportunidades
SET etapa = 'calificacion'
WHERE etapa = 'prospeccion';
