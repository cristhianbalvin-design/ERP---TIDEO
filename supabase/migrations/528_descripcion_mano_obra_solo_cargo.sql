-- 528 · Las nuevas cotizaciones de una Hoja de Costeo describen la mano de
-- obra por Cargo. No actualiza cotizaciones ni cotizaciones especiales ya creadas.
--
-- Las tres funciones se definieron originalmente en 518/521. Se toma su
-- definición vigente y se reemplaza exclusivamente el fragmento de Mano de Obra,
-- preservando todos los demás bloques y reglas de cada RPC.
do $$
declare
  v_firma regprocedure;
  v_definicion text;
  v_esperado text;
  v_reemplazo constant text := 'coalesce(nullif(ce.nombre, ''''), ''Mano de obra'')';
  v_coincidencias integer;
begin
  foreach v_firma in array array[
    'public._aprobar_hoja_costeo_y_crear_cotizacion_impl_414(text,text,text,text,text,text)'::regprocedure,
    'public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(text,uuid,text,text,text,text,text)'::regprocedure,
    'public.crear_cotizacion_especial(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer,date,boolean,jsonb,text,text)'::regprocedure
  ] loop
    v_esperado := case
      when v_firma::text = 'crear_cotizacion_especial(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer,date,boolean,jsonb,text,text)'
        then 'coalesce(nullif(concat_ws('' - '', ft.nombre, tsi.nombre, ce.nombre), ''''), ''Mano de obra'')'
      else 'coalesce(nullif(concat_ws(''' || ' ' || chr(194) || chr(183) || ' ' || ''', ft.nombre, tsi.nombre, ce.nombre), ''''), ''Mano de obra'')'
    end;

    select pg_get_functiondef(v_firma) into v_definicion;
    v_coincidencias := (length(v_definicion) - length(replace(v_definicion, v_esperado, ''))) / length(v_esperado);
    if v_coincidencias <> 1 then
      raise exception 'No se encontró exactamente una descripción de Mano de Obra esperada en % (encontradas: %).', v_firma, v_coincidencias;
    end if;

    execute replace(v_definicion, v_esperado, v_reemplazo);
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
