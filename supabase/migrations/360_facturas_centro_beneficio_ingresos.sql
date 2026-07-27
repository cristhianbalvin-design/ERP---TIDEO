-- Clasificación de ingresos por CEBE.
-- Se mantiene nullable para conservar las facturas históricas sin backfill.

alter table public.facturas
  add column if not exists centro_beneficio_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facturas'::regclass
      and conname = 'facturas_centro_beneficio_id_fkey'
  ) then
    alter table public.facturas
      add constraint facturas_centro_beneficio_id_fkey
      foreign key (centro_beneficio_id)
      references public.centros_beneficio(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_facturas_empresa_cebe_fecha_emision
  on public.facturas (empresa_id, centro_beneficio_id, fecha_emision)
  where centro_beneficio_id is not null;

select pg_notify('pgrst', 'reload schema');
