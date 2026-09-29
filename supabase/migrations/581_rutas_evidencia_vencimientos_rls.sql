-- Rutas/flota: evidencia real de entrega, vigencia vehicular y RLS por permiso.
--
-- CONTROL MANUAL:
--   1. Ejecutar el cuerpo dentro de SET ROLE postgres; BEGIN;.
--   2. Ejecutar el dry run de UPDATE/DELETE con usuarios autenticados de PRUEBA.
--   3. Verificar pg_policies y finalizar el dry run con ROLLBACK;.
--   4. Repetir el cuerpo y finalizar la aplicación con COMMIT;.
--
-- La migración no toca columnas existentes de rutas/ruta_paradas, no modifica
-- mantenimientos_flota y no agrega un RLS distinto para las columnas nuevas.

set role postgres;
begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

do $preflight$
declare
  v_rls_vehiculos boolean;
  v_rls_conductores boolean;
begin
  if to_regclass('public.ruta_paradas') is null then
    raise exception '581_PREFLIGHT: falta public.ruta_paradas';
  end if;

  if to_regclass('public.vehiculos_transporte') is null then
    raise exception '581_PREFLIGHT: falta public.vehiculos_transporte';
  end if;

  if to_regclass('public.conductores_transporte') is null then
    raise exception '581_PREFLIGHT: falta public.conductores_transporte';
  end if;

  if to_regprocedure('public.usuario_tiene_empresa(text)') is null then
    raise exception '581_PREFLIGHT: falta usuario_tiene_empresa(text)';
  end if;

  if to_regprocedure('public.usuario_puede(text,text,text)') is null then
    raise exception '581_PREFLIGHT: falta usuario_puede(text,text,text)';
  end if;

  select c.relrowsecurity
    into v_rls_vehiculos
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'vehiculos_transporte';

  select c.relrowsecurity
    into v_rls_conductores
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'conductores_transporte';

  if v_rls_vehiculos is distinct from true then
    raise exception '581_PREFLIGHT: vehiculos_transporte no tiene RLS habilitado';
  end if;

  if v_rls_conductores is distinct from true then
    raise exception '581_PREFLIGHT: conductores_transporte no tiene RLS habilitado';
  end if;
end
$preflight$;

alter table public.ruta_paradas
  add column if not exists foto_entrega_url text,
  add column if not exists firma_entrega_url text,
  add column if not exists latitud_entrega double precision,
  add column if not exists longitud_entrega double precision;

alter table public.vehiculos_transporte
  add column if not exists vigencia_certificado_habilitacion date;

alter table public.vehiculos_transporte enable row level security;
alter table public.conductores_transporte enable row level security;

drop policy if exists tenant_vehiculos on public.vehiculos_transporte;
drop policy if exists vehiculos_transporte_select on public.vehiculos_transporte;
drop policy if exists vehiculos_transporte_insert on public.vehiculos_transporte;
drop policy if exists vehiculos_transporte_update on public.vehiculos_transporte;
drop policy if exists vehiculos_transporte_delete on public.vehiculos_transporte;

create policy vehiculos_transporte_select
on public.vehiculos_transporte
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'ver')
);

create policy vehiculos_transporte_insert
on public.vehiculos_transporte
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'crear')
);

create policy vehiculos_transporte_update
on public.vehiculos_transporte
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
);

create policy vehiculos_transporte_delete
on public.vehiculos_transporte
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'anular')
);

drop policy if exists tenant_conductores on public.conductores_transporte;
drop policy if exists conductores_transporte_select on public.conductores_transporte;
drop policy if exists conductores_transporte_insert on public.conductores_transporte;
drop policy if exists conductores_transporte_update on public.conductores_transporte;
drop policy if exists conductores_transporte_delete on public.conductores_transporte;

create policy conductores_transporte_select
on public.conductores_transporte
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'ver')
);

create policy conductores_transporte_insert
on public.conductores_transporte
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'crear')
);

create policy conductores_transporte_update
on public.conductores_transporte
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
);

create policy conductores_transporte_delete
on public.conductores_transporte
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'anular')
);

do $postflight$
declare
  v_policy_count integer;
  v_column_count integer;
begin
  select count(*)
    into v_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'vehiculos_transporte';

  if v_policy_count <> 4 then
    raise exception
      '581_POSTFLIGHT: vehiculos_transporte debe tener 4 policies y tiene %',
      v_policy_count;
  end if;

  select count(*)
    into v_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'conductores_transporte';

  if v_policy_count <> 4 then
    raise exception
      '581_POSTFLIGHT: conductores_transporte debe tener 4 policies y tiene %',
      v_policy_count;
  end if;

  select count(*)
    into v_column_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ruta_paradas'
     and column_name in (
       'foto_entrega_url',
       'firma_entrega_url',
       'latitud_entrega',
       'longitud_entrega'
     );

  if v_column_count <> 4 then
    raise exception
      '581_POSTFLIGHT: ruta_paradas debe tener 4 columnas de evidencia y tiene %',
      v_column_count;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'vehiculos_transporte'
       and column_name = 'vigencia_certificado_habilitacion'
       and data_type = 'date'
  ) then
    raise exception
      '581_POSTFLIGHT: falta vehiculos_transporte.vigencia_certificado_habilitacion date';
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');

commit;
