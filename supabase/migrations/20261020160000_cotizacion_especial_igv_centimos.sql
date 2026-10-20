-- Cotización Especial: IGV con céntimos (decisión del usuario 2026-10-20).
-- Hasta ahora el servidor redondeaba el IGV a soles enteros: round(subtotal * 0.18).
-- Ejemplo: COT-2026-9179, subtotal 3147.71 -> IGV 567.00 (exacto 566.59).
-- Se cambia solo esa línea en las dos funciones que calculan totales, partiendo de su
-- definición vigente (pg_get_functiondef), para no alterar nada más:
--   _crear_cotizacion_especial_impl_544  (crear)
--   actualizar_items_cotizacion_especial (guardar ítems en borrador)
-- Las cotizaciones ya creadas o emitidas no se recalculan (el documento emitido es un snapshot).

do $$
declare
  v_firma text;
  v_def text;
  v_viejo constant text := 'v_igv := round(v_subtotal * 0.18);';
  v_nuevo constant text := 'v_igv := round(v_subtotal * 0.18, 2);';
  v_apariciones int;
begin
  foreach v_firma in array array[
    'public._crear_cotizacion_especial_impl_544(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer,date,boolean,jsonb,text,text)',
    'public.actualizar_items_cotizacion_especial(uuid,jsonb)'
  ] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position(v_nuevo in v_def) > 0 then
      continue; -- ya aplicada
    end if;
    v_apariciones := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
    if v_apariciones <> 1 then
      raise exception '% : se esperaba 1 línea de IGV a reemplazar y hay %', v_firma, v_apariciones;
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end loop;
end $$;

-- Comprobación
do $$
declare
  v_firma text;
  v_def text;
begin
  foreach v_firma in array array[
    'public._crear_cotizacion_especial_impl_544(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer,date,boolean,jsonb,text,text)',
    'public.actualizar_items_cotizacion_especial(uuid,jsonb)'
  ] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position('v_igv := round(v_subtotal * 0.18, 2);' in v_def) = 0
       or position('v_igv := round(v_subtotal * 0.18);' in v_def) > 0 then
      raise exception '% no quedó con el IGV a céntimos', v_firma;
    end if;
  end loop;
  if round(3147.71 * 0.18, 2) <> 566.59 then
    raise exception 'round(3147.71 * 0.18, 2) no da 566.59';
  end if;
end $$;
