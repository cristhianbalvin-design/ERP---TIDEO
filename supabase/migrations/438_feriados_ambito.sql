-- 438 · Fase A: ámbito de calendario de feriados por empresa.
--
-- Alcance deliberadamente limitado a datos y esquema. La UI, esFeriado() y
-- el motor de nómina se implementarán en fases posteriores.

-- ── 1. Ámbito del calendario ───────────────────────────────────────────────

alter table public.feriados
  add column if not exists ambito text not null default 'nacional'
    check (ambito in ('nacional', 'regional', 'local'));

-- ── 2. Siembra nacional explícita ──────────────────────────────────────────

create or replace function public.sembrar_feriados_nacionales_peru(
  p_anio integer,
  p_empresa_id text default null
)
returns table(empresa_id text, feriados_insertados integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_empresa_id text;
  v_insertados integer;
begin
  for v_empresa_id in
    select e.id
    from public.empresas e
    where (p_empresa_id is null or e.id = p_empresa_id)
      and lower(coalesce(e.estado, 'activo')) in ('activo', 'activa')
      and e.id not in ('emp_2000000000', 'emp_tideo')
  loop
    insert into public.feriados (empresa_id, fecha, nombre, origen, ambito)
    select v_empresa_id, f.fecha, f.nombre, 'automatico', 'nacional'
    from public.catalogo_feriados_nacionales_peru(p_anio) f
    on conflict (empresa_id, fecha) do nothing;

    get diagnostics v_insertados = row_count;
    empresa_id := v_empresa_id;
    feriados_insertados := v_insertados;
    return next;
  end loop;
end;
$$;

revoke all on function public.sembrar_feriados_nacionales_peru(integer, text) from public, anon, authenticated;
grant execute on function public.sembrar_feriados_nacionales_peru(integer, text) to service_role;
