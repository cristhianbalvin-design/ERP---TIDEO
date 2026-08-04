-- TIDEO ERP - Multisociedad, bloque 2A: capa financiera y documentos fuente.
-- Todas las columnas son nullable para mantener intactos los tenants existentes.

alter table public.facturas add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.cotizaciones add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.cxc add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.cxp add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.ordenes_venta add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.financiamientos add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.correlativos_documentos add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;

-- Entidades que corresponden a los formularios expresamente incluidos en 2A.
alter table public.ordenes_compra add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.ordenes_servicio_interna add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.compras_gastos add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.caja_chica add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.cuentas_bancarias add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;

create unique index if not exists sociedades_empresa_id_id_key
  on public.sociedades(empresa_id, id);

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'facturas','cotizaciones','cxc','cxp','ordenes_venta','financiamientos',
    'correlativos_documentos','ordenes_compra','ordenes_servicio_interna',
    'compras_gastos','caja_chica','cuentas_bancarias'
  ] loop
    v_constraint := v_table || '_empresa_sociedad_fkey';
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', v_table)::regclass
        and conname = v_constraint
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (empresa_id, sociedad_id) references public.sociedades(empresa_id, id)',
        v_table,
        v_constraint
      );
    end if;
  end loop;
end $$;

create index if not exists idx_facturas_empresa_sociedad on public.facturas(empresa_id, sociedad_id);
create index if not exists idx_cotizaciones_empresa_sociedad on public.cotizaciones(empresa_id, sociedad_id);
create index if not exists idx_cxc_empresa_sociedad on public.cxc(empresa_id, sociedad_id);
create index if not exists idx_cxp_empresa_sociedad on public.cxp(empresa_id, sociedad_id);
create index if not exists idx_ordenes_venta_empresa_sociedad on public.ordenes_venta(empresa_id, sociedad_id);
create index if not exists idx_financiamientos_empresa_sociedad on public.financiamientos(empresa_id, sociedad_id);
create index if not exists idx_ordenes_compra_empresa_sociedad on public.ordenes_compra(empresa_id, sociedad_id);
create index if not exists idx_ordenes_servicio_empresa_sociedad on public.ordenes_servicio_interna(empresa_id, sociedad_id);
create index if not exists idx_compras_gastos_empresa_sociedad on public.compras_gastos(empresa_id, sociedad_id);
create index if not exists idx_caja_chica_empresa_sociedad on public.caja_chica(empresa_id, sociedad_id);
create index if not exists idx_cuentas_bancarias_empresa_sociedad on public.cuentas_bancarias(empresa_id, sociedad_id);

-- Nombre confirmado en producción antes de modificarlo. COALESCE mantiene la
-- unicidad legacy (sociedad NULL) y permite numeración independiente por sociedad.
alter table public.correlativos_documentos
  drop constraint if exists correlativos_documentos_empresa_id_tipo_documento_serie_key;
drop index if exists public.correlativos_documentos_empresa_id_tipo_documento_serie_key;
create unique index correlativos_documentos_empresa_id_tipo_documento_serie_key
  on public.correlativos_documentos(
    empresa_id,
    tipo_documento,
    serie,
    coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

select pg_notify('pgrst', 'reload schema');
