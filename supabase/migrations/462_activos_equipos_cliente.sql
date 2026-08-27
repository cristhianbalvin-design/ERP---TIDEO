-- 462 · Activos: equipos de cliente dentro del maestro único.
--
-- PRE-FLIGHT MANUAL (ejecutar por separado y finalizar con ROLLBACK):
-- begin;
-- set local app.activos_cliente_preflight = 'on';
--
-- select
--   count(*) as activos_antes,
--   count(*) filter (where propietario_tipo = 'propio') as propios_antes,
--   count(*) filter (where propietario_tipo = 'cliente') as cliente_antes
-- from public.activos;
--
-- Ejecutar el cuerpo completo de esta migración.
-- El self-test condicionado prueba dentro de subtransacciones que se rechazan:
--   1) propietario_tipo = 'cliente' sin cliente_propietario_id;
--   2) propietario_tipo = 'propio' con cliente_propietario_id.
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'activos'
--   and column_name in ('propietario_tipo', 'cliente_propietario_id')
-- order by ordinal_position;
--
-- select conname, pg_get_constraintdef(oid) as definicion
-- from pg_constraint
-- where conrelid = 'public.activos'::regclass
--   and conname in (
--     'activos_propietario_tipo_chk',
--     'activos_propietario_cliente_consistencia_chk',
--     'activos_cliente_propietario_id_fkey'
--   )
-- order by conname;
--
-- rollback;
--
-- APLICACIÓN MANUAL (solo tras revisar el pre-flight):
-- begin;
-- Ejecutar el cuerpo completo de esta migración, sin activar
-- app.activos_cliente_preflight.
-- commit;
--
-- POST-COMMIT ESPERADO:
-- - Todo activo histórico queda como propietario_tipo = 'propio'.
-- - Ningún activo propio tiene cliente_propietario_id.
-- - Los equipos de cliente exigen una cuenta propietaria real.

set local lock_timeout = '15s';
set local statement_timeout = '5min';

alter table public.activos
  add column if not exists propietario_tipo text not null default 'propio';

alter table public.activos
  add column if not exists cliente_propietario_id text;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_propietario_tipo_chk'
  ) then
    alter table public.activos
      add constraint activos_propietario_tipo_chk
      check (propietario_tipo in ('propio', 'cliente'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_cliente_propietario_id_fkey'
  ) then
    alter table public.activos
      add constraint activos_cliente_propietario_id_fkey
      foreign key (cliente_propietario_id)
      references public.cuentas(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_propietario_cliente_consistencia_chk'
  ) then
    alter table public.activos
      add constraint activos_propietario_cliente_consistencia_chk
      check (
        (propietario_tipo = 'cliente' and cliente_propietario_id is not null)
        or (propietario_tipo = 'propio' and cliente_propietario_id is null)
      );
  end if;
end;
$constraints$;

create index if not exists idx_activos_cliente_propietario
  on public.activos (empresa_id, cliente_propietario_id, estado)
  where propietario_tipo = 'cliente';

-- El self-test solo corre cuando el pre-flight lo activa explícitamente. Cada
-- bloque EXCEPTION es una subtransacción, por lo que ningún activo de prueba
-- alcanza a persistirse incluso antes del ROLLBACK externo.
do $preflight_activos_cliente_constraints$
declare
  v_empresa_id text;
  v_cuenta_id text;
  v_constraint_name text;
  v_cliente_sin_id_rechazado boolean := false;
  v_propio_con_id_rechazado boolean := false;
begin
  if current_setting('app.activos_cliente_preflight', true) is distinct from 'on' then
    return;
  end if;

  select c.empresa_id, c.id
    into v_empresa_id, v_cuenta_id
  from public.cuentas c
  order by c.empresa_id, c.id
  limit 1;

  if not found then
    raise exception
      'PREFLIGHT_ACTIVOS_CLIENTE: no existe una cuenta para probar las restricciones de propietario.';
  end if;

  begin
    insert into public.activos (
      id, empresa_id, codigo, nombre, propietario_tipo, cliente_propietario_id
    ) values (
      '__preflight_activo_cliente_sin_id_' || replace(gen_random_uuid()::text, '-', ''),
      v_empresa_id,
      '__PREFLIGHT_CLIENTE_SIN_ID_' || replace(gen_random_uuid()::text, '-', ''),
      'Preflight: cliente sin cuenta',
      'cliente',
      null
    );
  exception
    when check_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'activos_propietario_cliente_consistencia_chk' then
        raise;
      end if;
      v_cliente_sin_id_rechazado := true;
  end;

  begin
    insert into public.activos (
      id, empresa_id, codigo, nombre, propietario_tipo, cliente_propietario_id
    ) values (
      '__preflight_activo_propio_con_id_' || replace(gen_random_uuid()::text, '-', ''),
      v_empresa_id,
      '__PREFLIGHT_PROPIO_CON_ID_' || replace(gen_random_uuid()::text, '-', ''),
      'Preflight: propio con cuenta',
      'propio',
      v_cuenta_id
    );
  exception
    when check_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'activos_propietario_cliente_consistencia_chk' then
        raise;
      end if;
      v_propio_con_id_rechazado := true;
  end;

  if not v_cliente_sin_id_rechazado or not v_propio_con_id_rechazado then
    raise exception
      'PREFLIGHT_ACTIVOS_CLIENTE: el constraint no rechazó ambas direcciones inválidas.';
  end if;

  raise notice 'PREFLIGHT_ACTIVOS_CLIENTE: cliente sin cuenta y propio con cuenta rechazados correctamente.';
end;
$preflight_activos_cliente_constraints$;

do $postflight_activos_cliente$
declare
  v_propietario_tipo_tipo text;
  v_propietario_tipo_nullable text;
  v_propietario_tipo_default text;
  v_cliente_propietario_tipo text;
  v_inconsistentes bigint;
begin
  select data_type, is_nullable, column_default
    into v_propietario_tipo_tipo, v_propietario_tipo_nullable, v_propietario_tipo_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'activos'
    and column_name = 'propietario_tipo';

  select data_type
    into v_cliente_propietario_tipo
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'activos'
    and column_name = 'cliente_propietario_id';

  if v_propietario_tipo_tipo is distinct from 'text'
     or v_propietario_tipo_nullable is distinct from 'NO'
     or v_propietario_tipo_default is distinct from '''propio''::text'
     or v_cliente_propietario_tipo is distinct from 'text' then
    raise exception
      'ACTIVOS_CLIENTE_POSTFLIGHT: columnas incompatibles: propietario_tipo(tipo=%, nullable=%, default=%), cliente_propietario_id(tipo=%).',
      coalesce(v_propietario_tipo_tipo, 'ausente'),
      coalesce(v_propietario_tipo_nullable, 'ausente'),
      coalesce(v_propietario_tipo_default, 'ausente'),
      coalesce(v_cliente_propietario_tipo, 'ausente');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_propietario_tipo_chk'
      and contype = 'c'
  )
  or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_propietario_cliente_consistencia_chk'
      and contype = 'c'
  )
  or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_cliente_propietario_id_fkey'
      and contype = 'f'
  ) then
    raise exception
      'ACTIVOS_CLIENTE_POSTFLIGHT: faltan constraints de tipo, consistencia o FK de cliente.';
  end if;

  select count(*)
    into v_inconsistentes
  from public.activos
  where (propietario_tipo = 'cliente' and cliente_propietario_id is null)
     or (propietario_tipo = 'propio' and cliente_propietario_id is not null)
     or propietario_tipo not in ('propio', 'cliente');

  if v_inconsistentes <> 0 then
    raise exception
      'ACTIVOS_CLIENTE_POSTFLIGHT: quedaron % activo(s) con propietario inconsistente.',
      v_inconsistentes;
  end if;
end;
$postflight_activos_cliente$;

select pg_notify('pgrst', 'reload schema');
