-- Las recepciones pertenecen a la misma sociedad que su OC u OS de origen.
-- La columna es nullable para preservar registros legacy sin documento societario.

alter table public.recepciones
  add column if not exists sociedad_id uuid default null
  references public.sociedades(id) on delete set null;

-- Recupera la sociedad de las recepciones ya registradas desde su documento origen.
update public.recepciones r
set sociedad_id = coalesce(
  (select oc.sociedad_id from public.ordenes_compra oc where oc.id = r.orden_compra_id),
  (select os.sociedad_id from public.ordenes_servicio_interna os where os.id = r.orden_servicio_id)
)
where r.sociedad_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.recepciones'::regclass
      and conname = 'recepciones_empresa_sociedad_fkey'
  ) then
    alter table public.recepciones
      add constraint recepciones_empresa_sociedad_fkey
      foreign key (empresa_id, sociedad_id)
      references public.sociedades(empresa_id, id);
  end if;
end $$;

create index if not exists idx_recepciones_empresa_sociedad
  on public.recepciones(empresa_id, sociedad_id);

select pg_notify('pgrst', 'reload schema');
