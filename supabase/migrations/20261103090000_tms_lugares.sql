-- TMS · Maestro de Lugares y datos de carga del viaje (aditivo)
-- 1. transporte_lugares: almacenes, plantas, obras y puntos de entrega (del cliente o generales)
-- 2. Rutas y paradas referencian el lugar (los textos se mantienen como copia)
-- 3. Datos nuevos del viaje: referencia y contacto del cliente, tipo de carga, bultos y requisitos

create table if not exists public.transporte_lugares (
  id text primary key default ('tlu_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete restrict,
  cuenta_id text references public.cuentas(id) on delete restrict,
  nombre text not null,
  tipo text not null default 'otro',
  direccion text,
  referencia text,
  ubigeo text,
  distrito text,
  provincia text,
  departamento text,
  latitud numeric,
  longitud numeric,
  contacto_nombre text,
  contacto_telefono text,
  horario_atencion text,
  requisitos_acceso text,
  restricciones text,
  estado text not null default 'activo',
  notas text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_lugares_empresa_id_id_key unique (empresa_id, id),
  constraint transporte_lugares_nombre_chk check (nullif(btrim(nombre), '') is not null),
  constraint transporte_lugares_tipo_check check (tipo in ('almacen','planta','obra','mina','puerto','cliente','otro')),
  constraint transporte_lugares_estado_check check (estado in ('activo','inactivo')),
  constraint transporte_lugares_latitud_chk check (latitud is null or (latitud >= -90 and latitud <= 90)),
  constraint transporte_lugares_longitud_chk check (longitud is null or (longitud >= -180 and longitud <= 180))
);

create unique index if not exists transporte_lugares_nombre_unico
  on public.transporte_lugares (empresa_id, coalesce(cuenta_id, ''), lower(btrim(nombre)))
  where estado = 'activo';
create index if not exists transporte_lugares_empresa_cuenta_idx on public.transporte_lugares (empresa_id, cuenta_id);

drop trigger if exists transporte_lugares_updated_at_trg on public.transporte_lugares;
create trigger transporte_lugares_updated_at_trg before update on public.transporte_lugares
  for each row execute function public.transporte_maestro_actualizar_updated_at();

alter table public.transporte_lugares enable row level security;

drop policy if exists transporte_lugares_select on public.transporte_lugares;
create policy transporte_lugares_select on public.transporte_lugares for select
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'transporte_comercial', 'ver'));
drop policy if exists transporte_lugares_insert on public.transporte_lugares;
create policy transporte_lugares_insert on public.transporte_lugares for insert
  with check (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'transporte_comercial', 'crear'));
drop policy if exists transporte_lugares_update on public.transporte_lugares;
create policy transporte_lugares_update on public.transporte_lugares for update
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'transporte_comercial', 'editar'))
  with check (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'transporte_comercial', 'editar'));
drop policy if exists transporte_lugares_delete on public.transporte_lugares;
create policy transporte_lugares_delete on public.transporte_lugares for delete
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'transporte_comercial', 'anular'));

revoke all on public.transporte_lugares from anon;
grant select, insert, update, delete on public.transporte_lugares to authenticated;

-- Rutas: origen y destino desde el maestro de lugares
alter table public.transporte_rutas
  add column if not exists origen_lugar_id text,
  add column if not exists destino_lugar_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_rutas_origen_lugar_fk') then
    alter table public.transporte_rutas add constraint transporte_rutas_origen_lugar_fk
      foreign key (empresa_id, origen_lugar_id) references public.transporte_lugares(empresa_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_rutas_destino_lugar_fk') then
    alter table public.transporte_rutas add constraint transporte_rutas_destino_lugar_fk
      foreign key (empresa_id, destino_lugar_id) references public.transporte_lugares(empresa_id, id) on delete restrict;
  end if;
end $$;

-- Paradas: lugar del maestro y ventana horaria
alter table public.transporte_viaje_paradas
  add column if not exists lugar_id text,
  add column if not exists ventana_inicio time,
  add column if not exists ventana_fin time;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_lugar_fk') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_lugar_fk
      foreign key (empresa_id, lugar_id) references public.transporte_lugares(empresa_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_ventana_chk') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_ventana_chk
      check (ventana_inicio is null or ventana_fin is null or ventana_fin > ventana_inicio);
  end if;
end $$;

-- Viaje: datos del paso 1 y del paso 3 del asistente
alter table public.transporte_viajes
  add column if not exists referencia_cliente text,
  add column if not exists contacto_id text references public.contactos(id) on delete restrict,
  add column if not exists tipo_carga text,
  add column if not exists carga_bultos numeric,
  add column if not exists carga_unidad_bultos text,
  add column if not exists requisitos text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_viajes_tipo_carga_check') then
    alter table public.transporte_viajes add constraint transporte_viajes_tipo_carga_check
      check (tipo_carga is null or tipo_carga in ('general','peligrosa','refrigerada','sobredimensionada','fragil'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viajes_carga_bultos_chk') then
    alter table public.transporte_viajes add constraint transporte_viajes_carga_bultos_chk
      check (carga_bultos is null or carga_bultos >= 0);
  end if;
end $$;

create index if not exists transporte_viaje_paradas_lugar_idx on public.transporte_viaje_paradas (empresa_id, lugar_id);
create index if not exists transporte_rutas_lugares_idx on public.transporte_rutas (empresa_id, origen_lugar_id, destino_lugar_id);

-- Comprobación: si algo no quedó, se revierte todo
do $$
declare v int;
begin
  select count(*) into v from pg_policies where tablename = 'transporte_lugares';
  if v <> 4 then raise exception 'transporte_lugares debería tener 4 políticas y tiene %', v; end if;
  select count(*) into v from information_schema.columns where table_schema='public'
    and ((table_name='transporte_rutas' and column_name in ('origen_lugar_id','destino_lugar_id'))
      or (table_name='transporte_viaje_paradas' and column_name in ('lugar_id','ventana_inicio','ventana_fin'))
      or (table_name='transporte_viajes' and column_name in ('referencia_cliente','contacto_id','tipo_carga','carga_bultos','carga_unidad_bultos','requisitos')));
  if v <> 11 then raise exception 'Faltan columnas nuevas: % de 11', v; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.transporte_lugares'::regclass) then
    raise exception 'RLS no quedó activo en transporte_lugares';
  end if;
end $$;
