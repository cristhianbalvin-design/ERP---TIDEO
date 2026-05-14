-- Historial append-only de cambios de estado en leads.
-- Ningún registro puede modificarse ni eliminarse (via RLS + trigger).

-- ============================================================
-- Tabla
-- ============================================================

create table public.lead_historial_estados (
  id            text        primary key default gen_random_uuid()::text,
  empresa_id    text        not null references public.empresas(id) on delete cascade,
  lead_id       text        not null references public.leads(id) on delete cascade,
  estado_desde  text        not null,
  estado_hasta  text        not null,
  motivo        text,
  nota          text,
  creado_por    uuid        not null references auth.users(id),
  creado_en     timestamptz not null default now(),

  -- Motivo obligatorio al descartar o al reactivar (salir de descartado)
  constraint motivo_requerido check (
    case
      when estado_hasta = 'descartado' then motivo is not null and motivo <> ''
      when estado_desde = 'descartado' then motivo is not null and motivo <> ''
      else true
    end
  )
);

-- Índices de consulta habitual
create index on public.lead_historial_estados (lead_id, creado_en desc);
create index on public.lead_historial_estados (empresa_id, creado_en desc);

-- ============================================================
-- RLS
-- ============================================================

alter table public.lead_historial_estados enable row level security;

-- SELECT: miembro activo de la empresa
create policy lhe_select on public.lead_historial_estados
  for select
  using (public.usuario_tiene_empresa(empresa_id));

-- INSERT: permiso de editar leads
create policy lhe_insert on public.lead_historial_estados
  for insert
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'leads', 'editar')
  );

-- UPDATE y DELETE denegados explícitamente (tabla append-only)
create policy lhe_no_update on public.lead_historial_estados
  for update
  using (false);

create policy lhe_no_delete on public.lead_historial_estados
  for delete
  using (false);

-- ============================================================
-- Trigger que impide modificaciones incluso desde service_role
-- ============================================================

create or replace function public.lead_historial_estados_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'lead_historial_estados es append-only: no se permite UPDATE ni DELETE.';
end;
$$;

create trigger lhe_immutable_guard
  before update or delete on public.lead_historial_estados
  for each row execute function public.lead_historial_estados_immutable();
