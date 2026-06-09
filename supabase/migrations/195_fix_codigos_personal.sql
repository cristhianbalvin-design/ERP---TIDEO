-- Corregir códigos de empleados que no siguen el formato autogenerado.
-- personal_administrativo → ADM-XXX (3 dígitos)
-- personal_operativo      → TEC-XXXX (4 dígitos)
-- Solo actualiza registros cuyo código no tenga el prefijo correcto.

DO $$
DECLARE
  max_num INT;
  rec     RECORD;
BEGIN
  -- ── Personal Administrativo ──
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
    RAISE NOTICE 'ADM: id=% codigo_anterior=% → ADM-%', rec.id, rec.codigo, LPAD(max_num::TEXT, 3, '0');
  END LOOP;
END $$;

DO $$
DECLARE
  max_num INT;
  rec     RECORD;
BEGIN
  -- ── Personal Operativo ──
  SELECT COALESCE(MAX(
    CASE WHEN codigo ~ '^TEC-[0-9]+$'
         THEN CAST(substring(codigo FROM 5) AS INT)
         ELSE 0 END
  ), 0)
  INTO max_num
  FROM public.personal_operativo;

  FOR rec IN
    SELECT id, codigo, empresa_id
    FROM public.personal_operativo
    WHERE codigo IS NULL OR codigo !~ '^TEC-[0-9]+'
    ORDER BY created_at NULLS LAST
  LOOP
    max_num := max_num + 1;
    UPDATE public.personal_operativo
    SET codigo = 'TEC-' || LPAD(max_num::TEXT, 4, '0')
    WHERE id = rec.id;
    RAISE NOTICE 'TEC: id=% codigo_anterior=% → TEC-%', rec.id, rec.codigo, LPAD(max_num::TEXT, 4, '0');
  END LOOP;
END $$;
