-- 464 · Activos: jerarquía opcional padre-hijo para componentes.
--
-- Un activo hijo es un componente para trazabilidad de mantenimiento. Su
-- valorización queda en el activo padre por decisión de negocio; esta migración
-- solo modela la relación opcional, no cambia importes ni reportes financieros.
--
-- PRE-FLIGHT MANUAL (ejecutar por separado y finalizar con ROLLBACK):
-- begin;
-- set local app.activos_jerarquia_preflight = 'on';
--
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'activos'
--   and column_name = 'activo_padre_id';
--
-- Ejecutar el cuerpo completo de esta migración.
-- El self-test condicionado intenta asignar un activo como su propio padre y
-- debe ser rechazado por activos_activo_padre_no_autoreferencia_chk.
--
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'activos'
--   and column_name = 'activo_padre_id';
--
-- select conname, contype, pg_get_constraintdef(oid) as definicion
-- from pg_constraint
-- where conrelid = 'public.activos'::regclass
--   and conname in (
--     'activos_activo_padre_id_fkey',
--     'activos_activo_padre_no_autoreferencia_chk'
--   )
-- order by conname;
--
-- rollback;
--
-- APLICACIÓN MANUAL (solo tras revisar el pre-flight):
-- begin;
-- Ejecutar el cuerpo completo de esta migración, sin activar
-- app.activos_jerarquia_preflight.
-- commit;
--
-- POST-COMMIT ESPERADO:
-- - activo_padre_id es text nullable con FK a activos(id) ON DELETE SET NULL.
-- - Un activo no puede apuntarse a sí mismo.
-- - La jerarquía sigue siendo opcional para todos los activos.

set local lock_timeout = '15s';
set local statement_timeout = '5min';

alter table public.activos
  add column if not exists activo_padre_id text;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_activo_padre_id_fkey'
  ) then
    alter table public.activos
      add constraint activos_activo_padre_id_fkey
      foreign key (activo_padre_id)
      references public.activos(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_activo_padre_no_autoreferencia_chk'
  ) then
    alter table public.activos
      add constraint activos_activo_padre_no_autoreferencia_chk
      check (activo_padre_id is null or activo_padre_id <> id);
  end if;
end;
$constraints$;

create index if not exists idx_activos_activo_padre_id
  on public.activos (activo_padre_id)
  where activo_padre_id is not null;

-- Solo el pre-flight habilita este self-test. El bloque EXCEPTION abre una
-- subtransacción: incluso antes del ROLLBACK externo, el UPDATE inválido no
-- persiste.
do $preflight_activos_jerarquia$
declare
  v_activo_id text;
  v_constraint_name text;
  v_autoreferencia_rechazada boolean := false;
begin
  if current_setting('app.activos_jerarquia_preflight', true) is distinct from 'on' then
    return;
  end if;

  select id
    into v_activo_id
  from public.activos
  order by empresa_id, codigo, id
  limit 1;

  if not found then
    raise exception
      'PREFLIGHT_ACTIVOS_JERARQUIA: no existe un activo para probar la autoreferencia.';
  end if;

  begin
    update public.activos
       set activo_padre_id = id
     where id = v_activo_id;
  exception
    when check_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'activos_activo_padre_no_autoreferencia_chk' then
        raise;
      end if;
      v_autoreferencia_rechazada := true;
  end;

  if not v_autoreferencia_rechazada then
    raise exception
      'PREFLIGHT_ACTIVOS_JERARQUIA: el constraint no rechazó la autoreferencia.';
  end if;

  raise notice 'PREFLIGHT_ACTIVOS_JERARQUIA: autoreferencia rechazada correctamente.';
end;
$preflight_activos_jerarquia$;

do $postflight_activos_jerarquia$
declare
  v_tipo text;
  v_nullable text;
  v_fk_ok boolean;
  v_check_ok boolean;
begin
  select data_type, is_nullable
    into v_tipo, v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'activos'
    and column_name = 'activo_padre_id';

  if v_tipo is distinct from 'text' or v_nullable is distinct from 'YES' then
    raise exception
      'ACTIVOS_JERARQUIA_POSTFLIGHT: activo_padre_id incompatible (tipo=%, nullable=%).',
      coalesce(v_tipo, 'ausente'),
      coalesce(v_nullable, 'ausente');
  end if;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_activo_padre_id_fkey'
      and contype = 'f'
      and confrelid = 'public.activos'::regclass
      and confdeltype = 'n'
  ) into v_fk_ok;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_activo_padre_no_autoreferencia_chk'
      and contype = 'c'
  ) into v_check_ok;

  if not v_fk_ok or not v_check_ok then
    raise exception
      'ACTIVOS_JERARQUIA_POSTFLIGHT: falta o no coincide la FK (%) o el CHECK (%).',
      v_fk_ok, v_check_ok;
  end if;
end;
$postflight_activos_jerarquia$;

select pg_notify('pgrst', 'reload schema');
