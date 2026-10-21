-- Cotización Especial: montos de hitos de pago con céntimos (decisión del usuario 2026-10-21).
-- Hasta ahora cada hito se redondeaba a soles enteros: round(p_total * v_porcentaje / 100),
-- y la diferencia se cargaba en un solo hito (ajuste_redondeo).
-- Ejemplo: total 3714.30 al 50/50 -> 1857 y 1857.30 (exacto 1857.15 y 1857.15).
-- Se cambia solo esa línea, partiendo de la definición vigente (pg_get_functiondef).
-- El ajuste de redondeo se mantiene para absorber diferencias de céntimos (p. ej. 3 hitos de 33.33%).
-- Las cotizaciones ya creadas o emitidas no se recalculan.

do $$
declare
  v_firma constant text := 'public.normalizar_hitos_cotizacion_especial(boolean,jsonb,numeric)';
  v_def text;
  v_viejo constant text := 'v_monto := round(p_total * v_porcentaje / 100);';
  v_nuevo constant text := 'v_monto := round(p_total * v_porcentaje / 100, 2);';
  v_apariciones int;
begin
  v_def := pg_get_functiondef(v_firma::regprocedure);
  if position(v_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_apariciones := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_apariciones <> 1 then
    raise exception '% : se esperaba 1 línea de monto a reemplazar y hay %', v_firma, v_apariciones;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- Comprobación
do $$
declare
  v_def text;
  v_hitos jsonb;
begin
  v_def := pg_get_functiondef('public.normalizar_hitos_cotizacion_especial(boolean,jsonb,numeric)'::regprocedure);
  if position('v_monto := round(p_total * v_porcentaje / 100, 2);' in v_def) = 0
     or position('v_monto := round(p_total * v_porcentaje / 100);' in v_def) > 0 then
    raise exception 'normalizar_hitos_cotizacion_especial no quedó con montos a céntimos';
  end if;

  v_hitos := public.normalizar_hitos_cotizacion_especial(true,
    '[{"concepto":"Adelanto","porcentaje":50,"condicion":"A la firma"},{"concepto":"Saldo","porcentaje":50,"condicion":"A la entrega"}]'::jsonb,
    3714.30);
  if (v_hitos -> 0 ->> 'monto')::numeric <> 1857.15 or (v_hitos -> 1 ->> 'monto')::numeric <> 1857.15
     or v_hitos -> 0 ? 'ajuste_redondeo' or v_hitos -> 1 ? 'ajuste_redondeo' then
    raise exception '50/50 de 3714.30 no da 1857.15 + 1857.15 sin ajuste: %', v_hitos;
  end if;

  v_hitos := public.normalizar_hitos_cotizacion_especial(true,
    '[{"concepto":"A","porcentaje":33.33,"condicion":"x"},{"concepto":"B","porcentaje":33.33,"condicion":"x"},{"concepto":"C","porcentaje":33.34,"condicion":"x"}]'::jsonb,
    100);
  if (select sum((h ->> 'monto')::numeric) from jsonb_array_elements(v_hitos) h) <> 100 then
    raise exception 'Los hitos 33.33/33.33/33.34 de 100 no suman 100: %', v_hitos;
  end if;
end $$;
