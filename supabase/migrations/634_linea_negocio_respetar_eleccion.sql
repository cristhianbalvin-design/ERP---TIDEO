-- 634: derivar_linea_negocio_desde_oportunidad pisaba linea_negocio con NULL cuando la oportunidad
-- no tenía línea, descartando la línea elegida al generar la cotización desde una Hoja de Costeo.
-- Ahora la oportunidad sigue mandando cuando tiene línea; si no tiene, se conserva el valor recibido.

CREATE OR REPLACE FUNCTION public.derivar_linea_negocio_desde_oportunidad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linea text;
begin
  if new.oportunidad_id is not null then
    select o.linea_negocio
      into v_linea
    from public.oportunidades o
    where o.id = new.oportunidad_id
      and o.empresa_id = new.empresa_id;
    new.linea_negocio := coalesce(v_linea, new.linea_negocio);
  end if;

  return new;
end;
$function$;
