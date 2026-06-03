-- TIDEO ERP – Migración 169: categoria_er y centro_costo_id en cxp
-- Permite clasificar CxPs manuales en el ER y asignarles CECO para filtrado.

alter table public.cxp
  add column if not exists categoria_er    text,
  add column if not exists centro_costo_id text;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'centros_costo') then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.cxp'::regclass
        and conname = 'cxp_centro_costo_id_fkey'
    ) then
      alter table public.cxp
        add constraint cxp_centro_costo_id_fkey
        foreign key (centro_costo_id) references public.centros_costo(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_cxp_centro_costo_id
  on public.cxp(centro_costo_id);

select pg_notify('pgrst', 'reload schema');
