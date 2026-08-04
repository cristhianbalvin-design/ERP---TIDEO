-- TIDEO ERP - Multisociedad, bloque 2C: stock por lote y movimientos reales (kardex).
-- Auditoría previa confirmó que kardex es la tabla real de movimientos.

alter table public.stock
  add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.inventario_conteos
  add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.kardex
  add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array['stock','inventario_conteos','kardex'] loop
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

create index if not exists idx_stock_empresa_sociedad on public.stock(empresa_id, sociedad_id);
create index if not exists idx_inventario_conteos_empresa_sociedad on public.inventario_conteos(empresa_id, sociedad_id);
create index if not exists idx_kardex_empresa_sociedad on public.kardex(empresa_id, sociedad_id);

-- Nombre confirmado en producción. La clave conserva la semántica legacy para
-- NULL y separa existencias del mismo lote/serie entre sociedades.
alter table public.stock drop constraint if exists stock_material_id_almacen_id_lote_serie_key;
drop index if exists public.stock_material_id_almacen_id_lote_serie_key;
create unique index stock_material_id_almacen_id_lote_serie_key
  on public.stock(
    material_id,
    almacen_id,
    coalesce(lote, ''),
    coalesce(serie, ''),
    coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.guias_remision
  add column if not exists sociedad_origen_id uuid default null references public.sociedades(id) on delete set null,
  add column if not exists sociedad_destino_id uuid default null references public.sociedades(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.guias_remision'::regclass and conname='guias_remision_empresa_sociedad_origen_fkey') then
    alter table public.guias_remision add constraint guias_remision_empresa_sociedad_origen_fkey
      foreign key (empresa_id, sociedad_origen_id) references public.sociedades(empresa_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.guias_remision'::regclass and conname='guias_remision_empresa_sociedad_destino_fkey') then
    alter table public.guias_remision add constraint guias_remision_empresa_sociedad_destino_fkey
      foreign key (empresa_id, sociedad_destino_id) references public.sociedades(empresa_id, id);
  end if;
end $$;

alter table public.guias_remision drop constraint if exists guias_remision_tipo_origen_check;
alter table public.guias_remision add constraint guias_remision_tipo_origen_check
  check (tipo_origen in (
    'despacho_venta',
    'traslado_interno',
    'despacho_servicio',
    'transferencia_intercompania'
  ));

alter table public.guias_remision drop constraint if exists guias_remision_intercompania_sociedades_check;
alter table public.guias_remision add constraint guias_remision_intercompania_sociedades_check
  check (
    tipo_origen <> 'transferencia_intercompania'
    or (
      sociedad_origen_id is not null
      and sociedad_destino_id is not null
      and sociedad_origen_id <> sociedad_destino_id
    )
  );

create index if not exists idx_guias_remision_sociedades
  on public.guias_remision(empresa_id, sociedad_origen_id, sociedad_destino_id);

select pg_notify('pgrst', 'reload schema');
