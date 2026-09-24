-- Paso 9: marcado explícito de las dos cuentas BN autorizadas.
-- No usa heurísticas por nombre, banco, empresa ni sociedad.

do $$
declare v_afectadas integer; v_marcadas integer;
begin
  with actualizadas as (
    update public.cuentas_bancarias
    set es_cuenta_detracciones = true
    where id in ('cb_451769','cb_802101')
    returning id
  )
  select count(*) into v_afectadas from actualizadas;
  if v_afectadas <> 2 then
    raise exception 'VALIDACION_PASO9|filas_afectadas=%|esperadas=2', v_afectadas;
  end if;
  select count(*) into v_marcadas
  from public.cuentas_bancarias
  where es_cuenta_detracciones = true;
  if v_marcadas <> 2 then
    raise exception 'VALIDACION_PASO9|cuentas_marcadas=%|esperadas=2', v_marcadas;
  end if;
  raise notice 'VALIDACION_PASO9|filas_afectadas=%|cuentas_marcadas=%',v_afectadas,v_marcadas;
end;
$$;
