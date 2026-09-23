-- Migración ya aplicada en producción; registro histórico; UPDATE de datos ejecutado, verificado por coincidencia exacta de los 11 registros el 2026-09-23; el nombre del check fue ajustado al existente en producción.

-- Custodia física independiente del ciclo comercial de la recepción.

alter table public.recepciones_activos_cliente
  add column estado_custodia text not null default 'recibido',
  add column almacen_id text;

alter table public.recepciones_activos_cliente
  add constraint recepciones_activos_cliente_estado_custodia_check
  check (estado_custodia in ('recibido', 'en_diagnostico', 'en_reparacion', 'listo_entrega', 'entregado'));

alter table public.recepciones_activos_cliente
  add constraint recepciones_activos_cliente_almacen_id_fkey
  foreign key (almacen_id)
  references public.almacenes(id)
  on delete set null;

do $$
declare
  v_id text;
begin
  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0003';
  update public.recepciones_activos_cliente
  set estado_custodia = 'entregado'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0008';
  update public.recepciones_activos_cliente
  set estado_custodia = 'recibido'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_20513453711' and numero = 'RAC-2026-0002';
  update public.recepciones_activos_cliente
  set estado_custodia = 'recibido'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_20513453711' and numero = 'RAC-2026-0003';
  update public.recepciones_activos_cliente
  set estado_custodia = 'recibido'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_20541435833' and numero = 'RAC-2026-0001';
  update public.recepciones_activos_cliente
  set estado_custodia = 'recibido'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0001';
  update public.recepciones_activos_cliente
  set estado_custodia = 'en_diagnostico'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0002';
  update public.recepciones_activos_cliente
  set estado_custodia = 'en_diagnostico'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0005';
  update public.recepciones_activos_cliente
  set estado_custodia = 'en_diagnostico'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0006';
  update public.recepciones_activos_cliente
  set estado_custodia = 'en_diagnostico'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0004';
  update public.recepciones_activos_cliente
  set estado_custodia = 'en_reparacion'
  where id = v_id;

  select id into strict v_id
  from public.recepciones_activos_cliente
  where empresa_id = 'emp_2000000000' and numero = 'RAC-2026-0007';
  update public.recepciones_activos_cliente
  set estado_custodia = 'en_reparacion'
  where id = v_id;
end;
$$;
