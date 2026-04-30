-- TIDEO ERP - Tabla hojas_costeo
-- Documento interno entre Oportunidad y Cotización para calcular costos antes de cotizar.
-- Ejecutar en proyectos existentes con las tablas de cotizaciones y oportunidades ya creadas.

create table if not exists public.hojas_costeo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  numero text not null,
  oportunidad_id text references public.oportunidades(id),
  cuenta_id text references public.cuentas(id),
  cotizacion_id text references public.cotizaciones(id),
  version integer default 1,
  historial_versiones jsonb default '[]'::jsonb,
  estado text default 'borrador',               -- borrador | en_revision | aprobada
  responsable_costeo text,
  fecha date default current_date,
  margen_objetivo_pct numeric(5,2) default 35,
  notas text,

  -- Secciones de costo (arrays de ítems con descripcion, cantidad, unidad, costo_unitario)
  mano_obra jsonb default '[]'::jsonb,
  materiales jsonb default '[]'::jsonb,
  servicios_terceros jsonb default '[]'::jsonb,
  logistica jsonb default '[]'::jsonb,

  -- Totales calculados al guardar
  total_mano_obra numeric(14,2) default 0,
  total_materiales numeric(14,2) default 0,
  total_servicios_terceros numeric(14,2) default 0,
  total_logistica numeric(14,2) default 0,
  costo_total numeric(14,2) default 0,
  precio_sugerido_sin_igv numeric(14,2) default 0,
  precio_sugerido_total numeric(14,2) default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, numero)
);

create index if not exists idx_hojas_costeo_empresa on public.hojas_costeo(empresa_id);
create index if not exists idx_hojas_costeo_oportunidad on public.hojas_costeo(oportunidad_id);

alter table public.hojas_costeo enable row level security;

drop policy if exists tenant_hojas_costeo on public.hojas_costeo;
create policy tenant_hojas_costeo on public.hojas_costeo
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Agregar columna hoja_costeo_id a cotizaciones para trazabilidad inversa
alter table public.cotizaciones add column if not exists hoja_costeo_id text references public.hojas_costeo(id);
