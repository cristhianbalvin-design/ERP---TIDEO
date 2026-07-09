-- Reaplica el backfill de 195_fix_codigos_personal.sql para personal_administrativo.
-- El alta desde el frontend no enviaba `codigo`, por lo que colaboradores creados
-- después de la migración 195 quedaron con codigo = id (`per_<timestamp>`) en vez
-- de ADM-XXX. El bug del frontend ya fue corregido; esta migración normaliza
-- los registros existentes que quedaron con el formato incorrecto.

DO $$
DECLARE
  max_num INT;
  rec     RECORD;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN codigo ~ '^ADM-[0-9]+$'
         THEN CAST(substring(codigo FROM 5) AS INT)
         ELSE 0 END
  ), 0)
  INTO max_num
  FROM public.personal_administrativo;

  FOR rec IN
    SELECT id, codigo, empresa_id
    FROM public.personal_administrativo
    WHERE codigo IS NULL OR codigo !~ '^ADM-[0-9]+'
    ORDER BY created_at NULLS LAST
  LOOP
    max_num := max_num + 1;
    UPDATE public.personal_administrativo
    SET codigo = 'ADM-' || LPAD(max_num::TEXT, 3, '0')
    WHERE id = rec.id;
    RAISE NOTICE 'ADM: id=% codigo_anterior=% -> ADM-%', rec.id, rec.codigo, LPAD(max_num::TEXT, 3, '0');
  END LOOP;
END $$;
