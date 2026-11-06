-- Diagnóstico de fabricación · etapa 3 (parte 2): la emisión exige consumo por pieza y ficha congelada.
-- Se aplica AL FUSIONAR el PR de la etapa 3: la pantalla anterior emite con emitir_diagnostico_tecnico
-- directamente y quedaría bloqueada si esta regla entra antes del despliegue.

set lock_timeout = '10s';

-- Emisión: consumo obligatorio y fabricación solo con ficha --------------------------------------
do $$
declare v_def text := pg_get_functiondef('public.emitir_diagnostico_tecnico(text)'::regprocedure);
        v_old text; v_new text;
begin
  v_old := $q$WHERE p.diagnostico_id = v_d.id AND (p.material_id IS NULL OR p.plano_origen IS NULL);
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Falta material o plano en: %', v_falta USING ERRCODE='22023';
    END IF;$q$;
  v_new := $q$WHERE p.diagnostico_id = v_d.id AND (p.material_id IS NULL OR p.plano_origen IS NULL);
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Falta material o plano en: %', v_falta USING ERRCODE='22023';
    END IF;
    -- Etapa 3: consumo por pieza y ficha técnica congelada en la misma transacción.
    SELECT string_agg(p.nombre, ', ' ORDER BY p.orden) INTO v_falta
    FROM public.diagnostico_fabricacion_piezas p
    WHERE p.diagnostico_id = v_d.id AND p.consumo_material IS NULL;
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Falta el consumo de material en: %', v_falta USING ERRCODE='22023';
    END IF;
    IF current_setting('tideo.ficha_fabricacion', true) IS DISTINCT FROM v_d.id THEN
      RAISE EXCEPTION 'Emite el diagnóstico de fabricación desde su pantalla: se congela la ficha técnica.' USING ERRCODE='22023';
    END IF;$q$;
  v_old := replace(v_old, E'\n', E'\r\n');
  v_new := replace(v_new, E'\n', E'\r\n');
  if position(v_old in v_def) = 0 then raise exception 'emitir_diagnostico_tecnico: no se encontró el bloque 653 esperado'; end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- Comprobación
do $$
begin
  if position('tideo.ficha_fabricacion' in pg_get_functiondef('public.emitir_diagnostico_tecnico(text)'::regprocedure)) = 0 then
    raise exception 'VERIFY: emitir_diagnostico_tecnico sin la regla de ficha';
  end if;
end $$;
