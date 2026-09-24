-- Paso 6: completa la trazabilidad de la cuenta y constancia al depositar una detraccion.
-- Solo cambia la transicion de la obligacion; el resto de registrar_cobro_cxc_atomico
-- permanece en la version vigente.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_old_block text := $old$if v_es_detraccion then
    update public.detracciones
    set estado = 'depositada',
        actualizado_en = now()
    where id = v_detraccion.id;
  end if;$old$;
  v_new_block text := $new$if v_es_detraccion then
    update public.detracciones
    set estado = 'depositada',
        cuenta_destino_id = v_cuenta_bancaria_id,
        numero_constancia = nullif(btrim(p_cobro ->> 'numero_constancia'), ''),
        fecha_constancia = v_cobro.fecha_cobro,
        actualizado_en = now()
    where id = v_detraccion.id;
  end if;$new$;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_cobro_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb';

  if v_oid is null then
    raise exception 'SPOT_CONSTANCIA|funcion registrar_cobro_cxc_atomico no encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position(v_old_block in v_def) = 0 then
    raise exception 'SPOT_CONSTANCIA|bloque de transicion esperado no encontrado';
  end if;

  v_new := replace(v_def, v_old_block, v_new_block);
  if v_new = v_def then
    raise exception 'SPOT_CONSTANCIA|la funcion no fue modificada';
  end if;

  execute v_new;
  raise notice 'SPOT_CONSTANCIA|registrar_cobro_cxc_atomico actualizado|cuenta_constancia_fecha=true';
end;
$migration$;
