-- TIDEO ERP - Multisociedad, bloque 2B: CECO/CEBE y consulta de OT.
-- No modifica es_facturable ni trg_centros_beneficio_derivar_facturabilidad.

alter table public.centros_costo
  add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;
alter table public.centros_beneficio
  add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null;

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array['centros_costo','centros_beneficio'] loop
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

create index if not exists idx_centros_costo_empresa_sociedad
  on public.centros_costo(empresa_id, sociedad_id);
create index if not exists idx_centros_beneficio_empresa_sociedad
  on public.centros_beneficio(empresa_id, sociedad_id);

-- Función estrictamente de lectura: la OT no almacena ni escribe sociedad_id.
-- CECO tiene precedencia; CEBE es el fallback cuando la OT no tiene CECO.
create or replace function public.obtener_sociedad_de_ot(p_ot_id text)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(cc.sociedad_id, cb.sociedad_id)
  from public.ordenes_trabajo ot
  left join public.centros_costo cc
    on cc.id = ot.centro_costo_id and cc.empresa_id = ot.empresa_id
  left join public.centros_beneficio cb
    on cb.id = ot.centro_beneficio_id and cb.empresa_id = ot.empresa_id
  where ot.id = p_ot_id
    and public.usuario_tiene_empresa(ot.empresa_id)
  limit 1
$$;

grant execute on function public.obtener_sociedad_de_ot(text) to authenticated;
select pg_notify('pgrst', 'reload schema');
