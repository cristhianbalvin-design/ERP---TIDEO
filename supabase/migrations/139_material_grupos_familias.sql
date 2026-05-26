-- TIDEO ERP — Maestro de materiales (migración 139)
-- Tablas: material_grupos, material_familias, material_subfamilias
-- Nuevas columnas en materiales + función generador de código

-- ─── material_grupos ─────────────────────────────────────────────────────────
create table if not exists public.material_grupos (
  id          text primary key,
  empresa_id  text not null references public.empresas(id),
  codigo      text not null,
  nombre      text not null,
  estado      text default 'activo',
  created_at  timestamptz default now(),
  unique(empresa_id, codigo)
);

alter table public.material_grupos enable row level security;
drop policy if exists mat_grupos_iso on public.material_grupos;
create policy mat_grupos_iso on public.material_grupos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- ─── material_familias ────────────────────────────────────────────────────────
create table if not exists public.material_familias (
  id          text primary key,
  empresa_id  text not null references public.empresas(id),
  grupo_id    text not null references public.material_grupos(id) on delete cascade,
  codigo      text not null,
  nombre      text not null,
  estado      text default 'activo',
  created_at  timestamptz default now(),
  unique(empresa_id, grupo_id, codigo)
);

alter table public.material_familias enable row level security;
drop policy if exists mat_familias_iso on public.material_familias;
create policy mat_familias_iso on public.material_familias
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- ─── material_subfamilias ─────────────────────────────────────────────────────
create table if not exists public.material_subfamilias (
  id          text primary key,
  empresa_id  text not null references public.empresas(id),
  familia_id  text not null references public.material_familias(id) on delete cascade,
  codigo      text not null,
  nombre      text not null,
  estado      text default 'activo',
  created_at  timestamptz default now(),
  unique(empresa_id, familia_id, codigo)
);

alter table public.material_subfamilias enable row level security;
drop policy if exists mat_subfamilias_iso on public.material_subfamilias;
create policy mat_subfamilias_iso on public.material_subfamilias
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- ─── Índices ──────────────────────────────────────────────────────────────────
create index if not exists idx_mat_grupos_emp on public.material_grupos(empresa_id);
create index if not exists idx_mat_familias_grupo on public.material_familias(empresa_id, grupo_id);
create index if not exists idx_mat_subfamilias_fam on public.material_subfamilias(empresa_id, familia_id);

-- ─── Nuevas columnas en materiales ───────────────────────────────────────────
alter table public.materiales
  add column if not exists grupo_id          text references public.material_grupos(id),
  add column if not exists familia_id        text references public.material_familias(id),
  add column if not exists subfamilia_id     text references public.material_subfamilias(id),
  add column if not exists nro_parte         text,
  add column if not exists unidades_contenidas numeric(14,2) default 1,
  add column if not exists almacen_id        text references public.almacenes(id),
  add column if not exists ubicacion         text,
  add column if not exists observacion       text,
  add column if not exists precio_unitario   numeric(14,2) default 0;

-- ─── Función generadora de código ─────────────────────────────────────────────
-- Retorna codigo = cod_grupo(2) + cod_familia(2) + cod_subfamilia(2) + correlativo(4)
-- Ej: 01 + 10 + 01 + 0001 = 0110010001
create or replace function public.generar_codigo_material(
  p_subfamilia_id text,
  p_empresa_id    text
) returns text
language plpgsql
as $$
declare
  v_cod_grupo     text;
  v_cod_familia   text;
  v_cod_subfam    text;
  v_correlativo   int;
  v_prefix        text;
begin
  select lpad(mg.codigo, 2, '0'),
         lpad(mf.codigo, 2, '0'),
         lpad(ms.codigo, 2, '0')
    into v_cod_grupo, v_cod_familia, v_cod_subfam
    from public.material_subfamilias ms
    join public.material_familias    mf on mf.id = ms.familia_id
    join public.material_grupos      mg on mg.id = mf.grupo_id
   where ms.id = p_subfamilia_id;

  if v_cod_subfam is null then
    return null;
  end if;

  v_prefix := v_cod_grupo || v_cod_familia || v_cod_subfam;

  -- máximo correlativo existente para esta subfamilia
  select coalesce(max(
    cast(right(m.codigo, 4) as integer)
  ), 0) + 1
    into v_correlativo
    from public.materiales m
   where m.subfamilia_id = p_subfamilia_id
     and m.empresa_id    = p_empresa_id
     and length(m.codigo) = 10
     and m.codigo like (v_prefix || '%');

  return v_prefix || lpad(v_correlativo::text, 4, '0');
end;
$$;

select pg_notify('pgrst', 'reload schema');
