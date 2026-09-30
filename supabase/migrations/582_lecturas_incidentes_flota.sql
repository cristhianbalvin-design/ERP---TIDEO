-- Rutas/flota: historial de lecturas de odometro/horometro e incidentes.
--
-- CONTROL MANUAL:
--   1. Ejecutar el cuerpo dentro de SET ROLE postgres; BEGIN;.
--   2. Ejecutar el dry run de UPDATE/DELETE con usuarios autenticados de PRUEBA.
--   3. Verificar pg_policies y finalizar el dry run con ROLLBACK;.
--   4. Repetir el cuerpo y finalizar la aplicacion con COMMIT;.

set role postgres;
begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

do $preflight$
begin
  if to_regclass('public.rutas') is null then
    raise exception '582_PREFLIGHT: falta public.rutas';
  end if;

  if to_regclass('public.ruta_paradas') is null then
    raise exception '582_PREFLIGHT: falta public.ruta_paradas';
  end if;

  if to_regclass('public.vehiculos_transporte') is null then
    raise exception '582_PREFLIGHT: falta public.vehiculos_transporte';
  end if;

  if to_regclass('public.conductores_transporte') is null then
    raise exception '582_PREFLIGHT: falta public.conductores_transporte';
  end if;

  if to_regprocedure('public.usuario_tiene_empresa(text)') is null then
    raise exception '582_PREFLIGHT: falta usuario_tiene_empresa(text)';
  end if;

  if to_regprocedure('public.usuario_puede(text,text,text)') is null then
    raise exception '582_PREFLIGHT: falta usuario_puede(text,text,text)';
  end if;
end
$preflight$;

create table public.lecturas_flota (
  id text primary key default (
    'lec_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18)
  ),
  empresa_id text not null references public.empresas(id) on delete cascade,
  vehiculo_id text not null references public.vehiculos_transporte(id),
  ruta_id text references public.rutas(id) on delete set null,
  parada_id text references public.ruta_paradas(id) on delete set null,
  conductor_id text references public.conductores_transporte(id) on delete set null,
  tipo_lectura text not null check (tipo_lectura in ('odometro', 'horometro')),
  valor numeric not null check (valor >= 0),
  unidad text not null check (unidad in ('km', 'mi', 'h')),
  foto_url text,
  fecha timestamptz not null default now(),
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lecturas_flota_empresa_vehiculo_fecha_idx
  on public.lecturas_flota(empresa_id, vehiculo_id, fecha desc);

create index lecturas_flota_empresa_ruta_idx
  on public.lecturas_flota(empresa_id, ruta_id, fecha desc);

alter table public.lecturas_flota enable row level security;

drop policy if exists lecturas_flota_select on public.lecturas_flota;
drop policy if exists lecturas_flota_insert on public.lecturas_flota;
drop policy if exists lecturas_flota_update on public.lecturas_flota;
drop policy if exists lecturas_flota_delete on public.lecturas_flota;

create policy lecturas_flota_select
on public.lecturas_flota
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'ver')
);

create policy lecturas_flota_insert
on public.lecturas_flota
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'crear')
);

create policy lecturas_flota_update
on public.lecturas_flota
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
);

create policy lecturas_flota_delete
on public.lecturas_flota
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'anular')
);

revoke all on table public.lecturas_flota from anon;
grant select, insert, update, delete on table public.lecturas_flota to authenticated;

create table public.incidentes_flota (
  id text primary key default (
    'inc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18)
  ),
  empresa_id text not null references public.empresas(id) on delete cascade,
  ruta_id text references public.rutas(id) on delete set null,
  parada_id text references public.ruta_paradas(id) on delete set null,
  vehiculo_id text references public.vehiculos_transporte(id) on delete set null,
  conductor_id text references public.conductores_transporte(id) on delete set null,
  tipo text not null check (tipo in ('mecanico', 'accidente', 'retraso', 'otro')),
  severidad text not null check (severidad in ('baja', 'media', 'alta', 'critica')),
  descripcion text not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'en_seguimiento', 'cerrado')),
  foto_url text,
  latitud double precision,
  longitud double precision,
  -- Mismo patron que adjuntos.subido_por: UUID nullable sin FK local.
  reportado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index incidentes_flota_empresa_created_idx
  on public.incidentes_flota(empresa_id, created_at desc);

create index incidentes_flota_empresa_ruta_idx
  on public.incidentes_flota(empresa_id, ruta_id, created_at desc);

create index incidentes_flota_empresa_vehiculo_idx
  on public.incidentes_flota(empresa_id, vehiculo_id, created_at desc);

alter table public.incidentes_flota enable row level security;

drop policy if exists incidentes_flota_select on public.incidentes_flota;
drop policy if exists incidentes_flota_insert on public.incidentes_flota;
drop policy if exists incidentes_flota_update on public.incidentes_flota;
drop policy if exists incidentes_flota_delete on public.incidentes_flota;

create policy incidentes_flota_select
on public.incidentes_flota
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'ver')
);

create policy incidentes_flota_insert
on public.incidentes_flota
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'crear')
);

create policy incidentes_flota_update
on public.incidentes_flota
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
);

create policy incidentes_flota_delete
on public.incidentes_flota
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'ordenes_compra', 'anular')
);

revoke all on table public.incidentes_flota from anon;
grant select, insert, update, delete on table public.incidentes_flota to authenticated;

do $postflight$
declare
  v_lecturas_policy_count integer;
  v_incidentes_policy_count integer;
  v_lecturas_column_count integer;
  v_incidentes_column_count integer;
  v_lecturas_rls boolean;
  v_incidentes_rls boolean;
begin
  if to_regclass('public.lecturas_flota') is null then
    raise exception '582_POSTFLIGHT: falta public.lecturas_flota';
  end if;

  if to_regclass('public.incidentes_flota') is null then
    raise exception '582_POSTFLIGHT: falta public.incidentes_flota';
  end if;

  select c.relrowsecurity
    into v_lecturas_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'lecturas_flota';

  if v_lecturas_rls is distinct from true then
    raise exception '582_POSTFLIGHT: lecturas_flota sin RLS';
  end if;

  select c.relrowsecurity
    into v_incidentes_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'incidentes_flota';

  if v_incidentes_rls is distinct from true then
    raise exception '582_POSTFLIGHT: incidentes_flota sin RLS';
  end if;

  select count(*)
    into v_lecturas_column_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'lecturas_flota'
     and column_name in (
       'id', 'empresa_id', 'vehiculo_id', 'ruta_id', 'parada_id',
       'conductor_id', 'tipo_lectura', 'valor', 'unidad', 'foto_url',
       'fecha', 'observaciones', 'created_at', 'updated_at'
     );

  if v_lecturas_column_count <> 14 then
    raise exception
      '582_POSTFLIGHT: lecturas_flota debe tener 14 columnas esperadas y tiene %',
      v_lecturas_column_count;
  end if;

  select count(*)
    into v_incidentes_column_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'incidentes_flota'
     and column_name in (
       'id', 'empresa_id', 'ruta_id', 'parada_id', 'vehiculo_id',
       'conductor_id', 'tipo', 'severidad', 'descripcion', 'estado',
       'foto_url', 'latitud', 'longitud', 'reportado_por', 'created_at',
       'updated_at'
     );

  if v_incidentes_column_count <> 16 then
    raise exception
      '582_POSTFLIGHT: incidentes_flota debe tener 16 columnas esperadas y tiene %',
      v_incidentes_column_count;
  end if;

  select count(*)
    into v_lecturas_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'lecturas_flota';

  if v_lecturas_policy_count <> 4 then
    raise exception
      '582_POSTFLIGHT: lecturas_flota debe tener 4 policies y tiene %',
      v_lecturas_policy_count;
  end if;

  select count(*)
    into v_incidentes_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'incidentes_flota';

  if v_incidentes_policy_count <> 4 then
    raise exception
      '582_POSTFLIGHT: incidentes_flota debe tener 4 policies y tiene %',
      v_incidentes_policy_count;
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');

commit;
