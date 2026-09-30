-- Rutas/flota: paradas libres vinculables a Compras de Campo.
--
-- CONTROL MANUAL:
--   1. Ejecutar el cuerpo dentro de SET ROLE postgres; BEGIN;.
--   2. Ejecutar el dry run con usuarios autenticados de PRUEBA.
--   3. Verificar pg_policies, columnas y constraints; finalizar el dry run con ROLLBACK;.
--   4. Repetir el cuerpo y finalizar la aplicacion con COMMIT;.
--
-- La migracion aborta si el CHECK o los with_check de ruta_paradas no coinciden
-- literalmente con el estado confirmado en produccion durante el preflight.

set role postgres;
begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

do $preflight$
declare
  v_tipo_documento_constraint_count integer;
  v_tipo_documento_constraint_name text;
  v_policy_count integer;
  v_policy_cmd text;
  v_policy_with_check text;
  v_policy_with_check_md5 text;
  v_policy_with_check_length integer;
begin
  if to_regclass('public.ruta_paradas') is null then
    raise exception '583_PREFLIGHT: falta public.ruta_paradas';
  end if;

  if to_regclass('public.compras_gastos') is null then
    raise exception '583_PREFLIGHT: falta public.compras_gastos';
  end if;

  select count(*), min(c.conname)
    into v_tipo_documento_constraint_count, v_tipo_documento_constraint_name
    from pg_constraint c
   where c.conrelid = 'public.ruta_paradas'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%tipo_documento%';

  if v_tipo_documento_constraint_count <> 1 then
    raise exception
      '583_PREFLIGHT: se esperaba exactamente un CHECK de tipo_documento en ruta_paradas; encontrados=%',
      v_tipo_documento_constraint_count;
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.ruta_paradas'::regclass
       and c.conname = v_tipo_documento_constraint_name
       and pg_get_constraintdef(c.oid) =
         'CHECK ((tipo_documento = ANY (ARRAY[''orden_compra_transito''::text, ''guia_remision''::text])))'
  ) then
    raise exception
      '583_PREFLIGHT: CHECK de tipo_documento distinto al esperado; constraint=% definition=%',
      v_tipo_documento_constraint_name,
      (select pg_get_constraintdef(c.oid)
         from pg_constraint c
        where c.conrelid = 'public.ruta_paradas'::regclass
          and c.conname = v_tipo_documento_constraint_name);
  end if;

  select count(*)
    into v_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ruta_paradas'
     and policyname in ('ruta_paradas_insert', 'ruta_paradas_update');

  if v_policy_count <> 2 then
    raise exception
      '583_PREFLIGHT: se esperaban exactamente las policies ruta_paradas_insert/update; encontradas=%',
      v_policy_count;
  end if;

  select cmd, with_check, md5(with_check), length(with_check)
    into v_policy_cmd, v_policy_with_check, v_policy_with_check_md5, v_policy_with_check_length
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ruta_paradas'
     and policyname = 'ruta_paradas_insert';

  if v_policy_cmd <> 'INSERT'
     or v_policy_with_check_md5 <> 'c0333f075252a2aa520a36a3d23ab89f'
     or v_policy_with_check_length <> 621 then
    raise exception
      '583_PREFLIGHT: with_check literal drift en ruta_paradas_insert; cmd=% md5=% length=% actual=%',
      v_policy_cmd, v_policy_with_check_md5, v_policy_with_check_length, v_policy_with_check;
  end if;

  select cmd, with_check, md5(with_check), length(with_check)
    into v_policy_cmd, v_policy_with_check, v_policy_with_check_md5, v_policy_with_check_length
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ruta_paradas'
     and policyname = 'ruta_paradas_update';

  if v_policy_cmd <> 'UPDATE'
     or v_policy_with_check_md5 <> '82187bffe069e2b682bc5e1f8c7f440d'
     or v_policy_with_check_length <> 622 then
    raise exception
      '583_PREFLIGHT: with_check literal drift en ruta_paradas_update; cmd=% md5=% length=% actual=%',
      v_policy_cmd, v_policy_with_check_md5, v_policy_with_check_length, v_policy_with_check;
  end if;
end
$preflight$;

do $alter_ruta_paradas$
declare
  v_tipo_documento_constraint_name text;
begin
  select c.conname
    into v_tipo_documento_constraint_name
    from pg_constraint c
   where c.conrelid = 'public.ruta_paradas'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%tipo_documento%';

  execute format(
    'alter table public.ruta_paradas drop constraint %I',
    v_tipo_documento_constraint_name
  );

  execute format(
    'alter table public.ruta_paradas add constraint %I check (tipo_documento in (''orden_compra_transito'', ''guia_remision'', ''libre''))',
    v_tipo_documento_constraint_name
  );
end
$alter_ruta_paradas$;

alter table public.ruta_paradas
  alter column documento_id drop not null;

alter table public.ruta_paradas
  add column descripcion_libre text,
  add column direccion_parada text,
  add column latitud_parada double precision,
  add column longitud_parada double precision,
  add column gasto_campo_id text references public.compras_gastos(id) on delete set null;

alter table public.ruta_paradas
  add constraint ruta_paradas_documento_id_tipo_check
  check (
    (tipo_documento = 'libre' and documento_id is null)
    or (tipo_documento <> 'libre' and documento_id is not null)
  ),
  add constraint ruta_paradas_gasto_campo_tipo_check
  check (gasto_campo_id is null or tipo_documento = 'libre');

drop policy if exists ruta_paradas_insert on public.ruta_paradas;
drop policy if exists ruta_paradas_update on public.ruta_paradas;

create policy ruta_paradas_insert on public.ruta_paradas
for insert to authenticated
with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','crear') and exists(select 1 from public.rutas r where r.id=ruta_paradas.ruta_id and r.empresa_id=ruta_paradas.empresa_id) and ((tipo_documento='orden_compra_transito' and exists(select 1 from public.orden_compra_transitos t where t.id=ruta_paradas.documento_id and t.empresa_id=ruta_paradas.empresa_id)) or (tipo_documento='guia_remision' and exists(select 1 from public.guias_remision g where g.id=ruta_paradas.documento_id and g.empresa_id=ruta_paradas.empresa_id)) or (tipo_documento='libre' and (gasto_campo_id is null or exists(select 1 from public.compras_gastos cg where cg.id=ruta_paradas.gasto_campo_id and cg.empresa_id=ruta_paradas.empresa_id)))));

create policy ruta_paradas_update on public.ruta_paradas
for update to authenticated
using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar'))
with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar') and exists(select 1 from public.rutas r where r.id=ruta_paradas.ruta_id and r.empresa_id=ruta_paradas.empresa_id) and ((tipo_documento='orden_compra_transito' and exists(select 1 from public.orden_compra_transitos t where t.id=ruta_paradas.documento_id and t.empresa_id=ruta_paradas.empresa_id)) or (tipo_documento='guia_remision' and exists(select 1 from public.guias_remision g where g.id=ruta_paradas.documento_id and g.empresa_id=ruta_paradas.empresa_id)) or (tipo_documento='libre' and (gasto_campo_id is null or exists(select 1 from public.compras_gastos cg where cg.id=ruta_paradas.gasto_campo_id and cg.empresa_id=ruta_paradas.empresa_id)))));

do $postflight$
declare
  v_tipo_documento_constraint_count integer;
  v_policy_count integer;
  v_policy_with_check text;
  v_column_count integer;
begin
  select count(*)
    into v_tipo_documento_constraint_count
    from pg_constraint c
   where c.conrelid = 'public.ruta_paradas'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%tipo_documento%'
     and pg_get_constraintdef(c.oid) ilike '%libre%'
     and pg_get_constraintdef(c.oid) ilike '%ANY (ARRAY%';

  if v_tipo_documento_constraint_count <> 1 then
    raise exception
      '583_POSTFLIGHT: CHECK de tipo_documento no contiene libre exactamente una vez; encontrados=%',
      v_tipo_documento_constraint_count;
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'ruta_paradas'
       and column_name = 'documento_id'
       and is_nullable <> 'YES'
  ) then
    raise exception '583_POSTFLIGHT: ruta_paradas.documento_id sigue siendo NOT NULL';
  end if;

  select count(*)
    into v_column_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ruta_paradas'
     and (
       (column_name = 'descripcion_libre' and data_type = 'text')
       or (column_name = 'direccion_parada' and data_type = 'text')
       or (column_name = 'latitud_parada' and data_type = 'double precision')
       or (column_name = 'longitud_parada' and data_type = 'double precision')
       or (column_name = 'gasto_campo_id' and data_type = 'text')
     );

  if v_column_count <> 5 then
    raise exception
      '583_POSTFLIGHT: columnas nuevas de ruta_paradas incompletas; encontradas=%',
      v_column_count;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ruta_paradas'::regclass
       and conname = 'ruta_paradas_documento_id_tipo_check'
  ) then
    raise exception '583_POSTFLIGHT: falta ruta_paradas_documento_id_tipo_check';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ruta_paradas'::regclass
       and conname = 'ruta_paradas_gasto_campo_tipo_check'
  ) then
    raise exception '583_POSTFLIGHT: falta ruta_paradas_gasto_campo_tipo_check';
  end if;

  select count(*)
    into v_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ruta_paradas'
     and policyname in ('ruta_paradas_insert', 'ruta_paradas_update');

  if v_policy_count <> 2 then
    raise exception '583_POSTFLIGHT: faltan policies insert/update de ruta_paradas';
  end if;

  select with_check
    into v_policy_with_check
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ruta_paradas'
     and policyname = 'ruta_paradas_insert';

  if v_policy_with_check not like '%tipo_documento = ''libre''%'
     or v_policy_with_check not like '%FROM compras_gastos cg%'
     or v_policy_with_check not like '%gasto_campo_id%'
  then
    raise exception '583_POSTFLIGHT: ruta_paradas_insert no tiene la tercera rama libre';
  end if;

  select with_check
    into v_policy_with_check
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ruta_paradas'
     and policyname = 'ruta_paradas_update';

  if v_policy_with_check not like '%tipo_documento = ''libre''%'
     or v_policy_with_check not like '%FROM compras_gastos cg%'
     or v_policy_with_check not like '%gasto_campo_id%'
  then
    raise exception '583_POSTFLIGHT: ruta_paradas_update no tiene la tercera rama libre';
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');

commit;
