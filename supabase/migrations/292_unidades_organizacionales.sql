-- TIDEO ERP - Unidades organizacionales (Fase 1 del modelo Unidad -> Posicion -> Persona)
-- Reemplaza gradualmente a areas_empresa con un catalogo jerarquico real.
-- areas_empresa NO se elimina en esta migracion: queda marcada como obsoleta y se
-- retira en una migracion futura separada, una vez confirmado que ningun modulo la lee.

create table if not exists public.unidades_organizacionales (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  unidad_padre_id text references public.unidades_organizacionales(id) on delete set null,
  ceco_id text references public.centros_costo(id) on delete set null,
  responsable_legado text,
  estado text not null default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unidades_organizacionales_no_self_padre check (unidad_padre_id is null or unidad_padre_id <> id),
  unique (empresa_id, codigo),
  unique (empresa_id, nombre)
);

create index if not exists idx_unidades_organizacionales_padre
  on public.unidades_organizacionales(empresa_id, unidad_padre_id);

create index if not exists idx_unidades_organizacionales_estado
  on public.unidades_organizacionales(empresa_id, estado, nombre);

create index if not exists idx_unidades_organizacionales_ceco
  on public.unidades_organizacionales(empresa_id, ceco_id);

comment on table public.unidades_organizacionales is
  'Catalogo jerarquico de unidades organizacionales. Reemplaza a areas_empresa (ver comentario en esa tabla).';

comment on column public.unidades_organizacionales.responsable_legado is
  'Valor de areas_empresa.responsable (texto libre) preservado temporalmente. Se resuelve contra responsable_posicion_id en el backfill de la fase 1c; candidato a eliminarse en una limpieza futura.';

comment on table public.areas_empresa is
  'OBSOLETA: reemplazada por unidades_organizacionales. No eliminar todavia; pendiente confirmar que ningun modulo la sigue leyendo antes de una migracion de limpieza futura.';

-- Prevencion de ciclos en la jerarquia (recorre la cadena de padres antes de aceptar el cambio)
create or replace function public.validar_ciclo_unidad_organizacional()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actual text;
begin
  if new.unidad_padre_id is null then
    return new;
  end if;

  v_actual := new.unidad_padre_id;

  while v_actual is not null loop
    if v_actual = new.id then
      raise exception 'La unidad organizacional % generaria un ciclo en la jerarquia', new.id;
    end if;

    select unidad_padre_id into v_actual
    from public.unidades_organizacionales
    where id = v_actual;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_unidades_organizacionales_ciclo on public.unidades_organizacionales;
create trigger trg_unidades_organizacionales_ciclo
before insert or update of unidad_padre_id
on public.unidades_organizacionales
for each row execute function public.validar_ciclo_unidad_organizacional();

alter table public.unidades_organizacionales enable row level security;

drop policy if exists mst_unidades_organizacionales_select on public.unidades_organizacionales;
create policy mst_unidades_organizacionales_select on public.unidades_organizacionales
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'ver')
  );

drop policy if exists mst_unidades_organizacionales_insert on public.unidades_organizacionales;
create policy mst_unidades_organizacionales_insert on public.unidades_organizacionales
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'crear')
  );

drop policy if exists mst_unidades_organizacionales_update on public.unidades_organizacionales;
create policy mst_unidades_organizacionales_update on public.unidades_organizacionales
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_unidades_organizacionales_delete on public.unidades_organizacionales;
create policy mst_unidades_organizacionales_delete on public.unidades_organizacionales
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

-- Migracion 1:1 desde areas_empresa (mismo id, unidad_padre_id null: el negocio la organiza despues)
insert into public.unidades_organizacionales (
  id, empresa_id, codigo, nombre, unidad_padre_id, responsable_legado, estado, created_at, updated_at
)
select
  a.id, a.empresa_id, a.codigo, a.nombre, null, a.responsable, a.estado, a.created_at, a.updated_at
from public.areas_empresa a
where not exists (
  select 1 from public.unidades_organizacionales u where u.id = a.id
);

select pg_notify('pgrst', 'reload schema');
