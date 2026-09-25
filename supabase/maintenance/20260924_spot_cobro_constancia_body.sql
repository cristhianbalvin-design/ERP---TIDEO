\ir ../migrations/20260924180000_spot_cobro_constancia.sql

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_cobro_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb';

  if v_def is null then
    raise exception 'VALIDACION_ESTRUCTURAL|registrar_cobro_cxc_atomico=ausente';
  end if;
  if position('cuenta_destino_id = v_cuenta_bancaria_id' in v_def) = 0 then
    raise exception 'VALIDACION_ESTRUCTURAL|cuenta_destino_id=ausente';
  end if;
  if position('numero_constancia = nullif(btrim(p_cobro ->> ''numero_constancia''), '''')' in v_def) = 0 then
    raise exception 'VALIDACION_ESTRUCTURAL|numero_constancia=ausente';
  end if;
  if position('fecha_constancia = v_cobro.fecha_cobro' in v_def) = 0 then
    raise exception 'VALIDACION_ESTRUCTURAL|fecha_constancia=ausente';
  end if;
  if position('actualizado_en = now()' in v_def) = 0 then
    raise exception 'VALIDACION_ESTRUCTURAL|actualizado_en=ausente';
  end if;
  raise notice 'VALIDACION_ESTRUCTURAL|cuenta_destino=true|numero_constancia=true|fecha_constancia=true|actualizado_en=true';
end;
$$;
