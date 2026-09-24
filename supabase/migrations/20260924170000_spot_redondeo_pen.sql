-- Paso SPOT: redondeo de detracciones PEN en emisión y NC/ND.
-- No modifica obligaciones existentes: solo reemplaza las funciones para
-- aplicar la regla a nuevas emisiones y a recálculos posteriores.
-- La migración no contiene COMMIT; las envolturas operativas controlan la
-- transacción y los dry runs terminan siempre en ROLLBACK.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$
        v_monto_detraccion_origen := round(v_total * v_spot.porcentaje / 100, 2);
$old$;
  v_new text := $new$
        if v_moneda = 'PEN' then
          v_monto_detraccion_origen := round(v_total * v_spot.porcentaje / 100, 0);
        else
          v_monto_detraccion_origen := round(v_total * v_spot.porcentaje / 100, 2);
        end if;
$new$;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'emitir_factura_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_oid is null then
    raise exception 'SPOT_REDONDEO|no se encontro emitir_factura_cxc_atomico(jsonb)';
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'SPOT_REDONDEO|marcador de emision no encontrado';
  end if;

  execute replace(v_def, v_old, v_new);
  raise notice 'SPOT_REDONDEO|emitir_factura_cxc_atomico actualizado';
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$
      v_monto_origen := round(v_total_operacion * v_porcentaje / 100, 2);
$old$;
  v_new text := $new$
      if v_moneda = 'PEN' then
        v_monto_origen := round(v_total_operacion * v_porcentaje / 100, 0);
      else
        v_monto_origen := round(v_total_operacion * v_porcentaje / 100, 2);
      end if;
$new$;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'emitir_nota_cxc_atomica'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_oid is null then
    raise exception 'SPOT_REDONDEO|no se encontro emitir_nota_cxc_atomica(jsonb)';
  end if;
  if length(v_def) - length(replace(v_def, v_old, '')) = 0 then
    raise exception 'SPOT_REDONDEO|marcador de notas no encontrado';
  end if;

  execute replace(v_def, v_old, v_new);
  raise notice 'SPOT_REDONDEO|emitir_nota_cxc_atomica actualizado';
end;
$migration$;
