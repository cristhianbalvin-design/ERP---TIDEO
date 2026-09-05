-- 486 · Constructor de documentos de Nivel 3: plantillas y bloques versionados.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

alter table public.tipos_documento_electronico
  add column if not exists motor_contenido text
    not null default 'condiciones_generales'
    constraint tipos_documento_electronico_motor_contenido_check
    check (motor_contenido in ('condiciones_generales', 'constructor_bloques'));

create table public.plantillas_documento_bloques (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete restrict,
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  tipo_documento_id uuid not null
    references public.tipos_documento_electronico(id) on delete restrict,
  nombre_interno text not null,
  version integer not null check (version > 0),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'publicada', 'archivada')),
  vigente_desde date,
  vigente_hasta date,
  created_by uuid,
  created_at timestamptz not null default now(),
  publicada_at timestamptz,
  publicada_by uuid,
  constraint plantillas_documento_bloques_tipo_version_key
    unique (tipo_documento_id, version)
);

create index plantillas_documento_bloques_empresa_sociedad_idx
  on public.plantillas_documento_bloques (empresa_id, sociedad_id);

create table public.documento_bloques (
  id uuid primary key default gen_random_uuid(),
  plantilla_documento_id uuid not null
    references public.plantillas_documento_bloques(id) on delete restrict,
  -- Los hijos no son válidos fuera de su grupo repetible; se eliminan con él.
  bloque_padre_id uuid references public.documento_bloques(id) on delete cascade,
  tipo_bloque text not null
    check (tipo_bloque in ('texto_rico', 'tabla', 'grupo_repetible')),
  titulo text,
  contenido_json jsonb not null,
  contenido_texto_plano text not null default '',
  orden integer not null check (orden > 0),
  activo boolean not null default true,
  constraint documento_bloques_plantilla_padre_orden_key
    unique nulls not distinct (plantilla_documento_id, bloque_padre_id, orden)
);

create index documento_bloques_plantilla_idx
  on public.documento_bloques (plantilla_documento_id);

create index documento_bloques_padre_idx
  on public.documento_bloques (bloque_padre_id);

-- B3: sólo la tabla padre lleva sociedad_id.
create trigger zz_validar_sociedad_obligatoria
before insert or update on public.plantillas_documento_bloques
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

alter table public.plantillas_documento_bloques enable row level security;
alter table public.documento_bloques enable row level security;

create policy plantillas_documento_bloques_select
on public.plantillas_documento_bloques
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'ver')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'ver')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy plantillas_documento_bloques_insert
on public.plantillas_documento_bloques
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'crear')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'crear')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy plantillas_documento_bloques_update
on public.plantillas_documento_bloques
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'editar')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'editar')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

-- Hijo sin frontera propia: la autorización se hereda de su plantilla directa.
create policy documento_bloques_select
on public.documento_bloques
for select
using (
  exists (
    select 1
    from public.plantillas_documento_bloques plantilla
    join public.tipos_documento_electronico tipo
      on tipo.id = plantilla.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'ver')) as permiso(modulo)
    where plantilla.id = plantilla_documento_id
      and public.usuario_tiene_empresa(plantilla.empresa_id)
      and public.usuario_puede(plantilla.empresa_id, permiso.modulo, 'ver')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(plantilla.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or plantilla.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

create policy documento_bloques_insert
on public.documento_bloques
for insert
with check (
  exists (
    select 1
    from public.plantillas_documento_bloques plantilla
    join public.tipos_documento_electronico tipo
      on tipo.id = plantilla.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'crear')) as permiso(modulo)
    where plantilla.id = plantilla_documento_id
      and public.usuario_tiene_empresa(plantilla.empresa_id)
      and public.usuario_puede(plantilla.empresa_id, permiso.modulo, 'crear')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(plantilla.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or plantilla.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

create policy documento_bloques_update
on public.documento_bloques
for update
using (
  exists (
    select 1
    from public.plantillas_documento_bloques plantilla
    join public.tipos_documento_electronico tipo
      on tipo.id = plantilla.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where plantilla.id = plantilla_documento_id
      and public.usuario_tiene_empresa(plantilla.empresa_id)
      and public.usuario_puede(plantilla.empresa_id, permiso.modulo, 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(plantilla.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or plantilla.sociedad_id = any(alcance_usuario.alcance)
      )
  )
)
with check (
  exists (
    select 1
    from public.plantillas_documento_bloques plantilla
    join public.tipos_documento_electronico tipo
      on tipo.id = plantilla.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where plantilla.id = plantilla_documento_id
      and public.usuario_tiene_empresa(plantilla.empresa_id)
      and public.usuario_puede(plantilla.empresa_id, permiso.modulo, 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(plantilla.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or plantilla.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

grant select, insert, update on public.plantillas_documento_bloques to authenticated;
grant select, insert, update on public.documento_bloques to authenticated;

-- Sin privilegio ni política DELETE: la preservación se expresa mediante estado/activo.
select pg_notify('pgrst', 'reload schema');
