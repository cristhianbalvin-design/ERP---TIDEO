-- 478 · Catálogo de documentos y biblioteca versionada de condiciones generales.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

create table public.tipos_documento_electronico (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete restrict,
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  categoria_base text not null
    constraint tipos_documento_electronico_categoria_base_check
    check (categoria_base = 'cotizacion'),
  es_default_para_categoria boolean not null default false,
  activo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index tipos_documento_electronico_scope_codigo_global_key
  on public.tipos_documento_electronico (empresa_id, codigo)
  where sociedad_id is null;

create unique index tipos_documento_electronico_scope_codigo_sociedad_key
  on public.tipos_documento_electronico (empresa_id, sociedad_id, codigo)
  where sociedad_id is not null;

create unique index tipos_documento_electronico_default_global_key
  on public.tipos_documento_electronico (empresa_id, categoria_base)
  where sociedad_id is null
    and es_default_para_categoria;

create unique index tipos_documento_electronico_default_sociedad_key
  on public.tipos_documento_electronico (empresa_id, sociedad_id, categoria_base)
  where sociedad_id is not null
    and es_default_para_categoria;

create index tipos_documento_electronico_empresa_sociedad_idx
  on public.tipos_documento_electronico (empresa_id, sociedad_id);

create table public.biblioteca_condiciones_generales (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete restrict,
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  tipo_documento_id uuid not null
    references public.tipos_documento_electronico(id) on delete restrict,
  nombre_interno text not null,
  version integer not null
    constraint biblioteca_condiciones_generales_version_check
    check (version > 0),
  estado text not null default 'borrador'
    constraint biblioteca_condiciones_generales_estado_check
    check (estado in ('borrador', 'publicada', 'archivada')),
  vigente_desde date,
  vigente_hasta date,
  created_by uuid,
  created_at timestamptz not null default now(),
  publicada_at timestamptz,
  publicada_by uuid,
  constraint biblioteca_condiciones_generales_vigencia_check
    check (vigente_hasta is null or vigente_desde is null or vigente_hasta >= vigente_desde),
  constraint biblioteca_condiciones_generales_tipo_version_key
    unique (tipo_documento_id, version)
);

create index biblioteca_condiciones_generales_empresa_sociedad_idx
  on public.biblioteca_condiciones_generales (empresa_id, sociedad_id);

create table public.condiciones_generales_segmentos (
  id uuid primary key default gen_random_uuid(),
  condiciones_generales_id uuid not null
    references public.biblioteca_condiciones_generales(id) on delete restrict,
  titulo text not null,
  contenido_json jsonb not null,
  contenido_texto_plano text not null default '',
  orden integer not null
    constraint condiciones_generales_segmentos_orden_check
    check (orden > 0),
  activo boolean not null default true,
  constraint condiciones_generales_segmentos_biblioteca_orden_key
    unique (condiciones_generales_id, orden)
);

create index condiciones_generales_segmentos_biblioteca_idx
  on public.condiciones_generales_segmentos (condiciones_generales_id);

alter table public.cotizaciones
  add column if not exists tipo_documento_id uuid
    references public.tipos_documento_electronico(id),
  add column if not exists condiciones_generales_version_id uuid
    references public.biblioteca_condiciones_generales(id);

create index if not exists cotizaciones_tipo_documento_id_idx
  on public.cotizaciones (tipo_documento_id);

create index if not exists cotizaciones_condiciones_generales_version_id_idx
  on public.cotizaciones (condiciones_generales_version_id);

-- B3: únicamente las tablas padre con sociedad_id.
create trigger zz_validar_sociedad_obligatoria
before insert or update on public.tipos_documento_electronico
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

create trigger zz_validar_sociedad_obligatoria
before insert or update on public.biblioteca_condiciones_generales
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

alter table public.tipos_documento_electronico enable row level security;
alter table public.biblioteca_condiciones_generales enable row level security;
alter table public.condiciones_generales_segmentos enable row level security;

create policy tipos_documento_electronico_select
on public.tipos_documento_electronico
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'ver')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy tipos_documento_electronico_insert
on public.tipos_documento_electronico
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'crear')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy tipos_documento_electronico_update
on public.tipos_documento_electronico
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy biblioteca_condiciones_generales_select
on public.biblioteca_condiciones_generales
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'ver')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy biblioteca_condiciones_generales_insert
on public.biblioteca_condiciones_generales
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'crear')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy biblioteca_condiciones_generales_update
on public.biblioteca_condiciones_generales
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

-- Hijo sin empresa_id/sociedad_id: hereda la frontera desde la biblioteca padre.
create policy condiciones_generales_segmentos_select
on public.condiciones_generales_segmentos
for select
using (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, 'parametros', 'ver')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

create policy condiciones_generales_segmentos_insert
on public.condiciones_generales_segmentos
for insert
with check (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, 'parametros', 'crear')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

create policy condiciones_generales_segmentos_update
on public.condiciones_generales_segmentos
for update
using (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, 'parametros', 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
)
with check (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, 'parametros', 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

grant select, insert, update on public.tipos_documento_electronico to authenticated;
grant select, insert, update on public.biblioteca_condiciones_generales to authenticated;
grant select, insert, update on public.condiciones_generales_segmentos to authenticated;

-- Sin privilegio ni política DELETE: la preservación se expresa con activo/estado.

with alcances as (
  select
    ec.empresa_id,
    null::uuid as sociedad_id
  from public.empresa_config ec
  join public.empresas e on e.id = ec.empresa_id
  where e.multisociedad_habilitado = false

  union all

  select
    ec.empresa_id,
    s.id as sociedad_id
  from public.empresa_config ec
  join public.empresas e on e.id = ec.empresa_id
  join public.sociedades s
    on s.empresa_id = ec.empresa_id
   and s.activa = true
  where e.multisociedad_habilitado = true
),
tipos_insertados as (
  insert into public.tipos_documento_electronico (
    empresa_id,
    sociedad_id,
    codigo,
    nombre,
    categoria_base,
    es_default_para_categoria,
    activo
  )
  select
    empresa_id,
    sociedad_id,
    'COTIZACION_ESTANDAR',
    'Cotización Estándar',
    'cotizacion',
    true,
    true
  from alcances
  returning id, empresa_id, sociedad_id
),
bibliotecas_insertadas as (
  insert into public.biblioteca_condiciones_generales (
    empresa_id,
    sociedad_id,
    tipo_documento_id,
    nombre_interno,
    version,
    estado,
    publicada_at
  )
  select
    empresa_id,
    sociedad_id,
    id,
    'Condiciones Comerciales por Defecto',
    1,
    'publicada',
    now()
  from tipos_insertados
  returning id, tipo_documento_id
),
segmentos_insertados as (
  insert into public.condiciones_generales_segmentos (
    condiciones_generales_id,
    titulo,
    contenido_json,
    contenido_texto_plano,
    orden,
    activo
  )
  select
    biblioteca.id,
    segmento.titulo,
    jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content',
          case
            when segmento.contenido = '' then '[]'::jsonb
            else jsonb_build_array(
              jsonb_build_object(
                'type', 'text',
                'text', segmento.contenido
              )
            )
          end
        )
      )
    ),
    segmento.contenido,
    segmento.orden,
    true
  from bibliotecas_insertadas biblioteca
  join tipos_insertados tipo
    on tipo.id = biblioteca.tipo_documento_id
  join public.empresa_config ec
    on ec.empresa_id = tipo.empresa_id
  cross join lateral (
    values
      (1, 'Forma de Pago y Datos Bancarios', coalesce(ec.cond_forma_pago, '')),
      (2, 'Validez de la Oferta', coalesce(ec.cond_validez, '')),
      (3, 'Penalidad por Mora', coalesce(ec.cond_penalidad, '')),
      (4, 'Inicio del Proyecto', coalesce(ec.cond_inicio_proyecto, '')),
      (5, 'Alcance y Exclusiones', coalesce(ec.cond_alcance, '')),
      (6, 'Integraciones Externas', coalesce(ec.cond_integraciones, '')),
      (7, 'Confidencialidad', coalesce(ec.cond_confidencialidad, ''))
  ) as segmento(orden, titulo, contenido)
  returning id
)
select
  (select count(*) from alcances) as alcances_creados,
  (select count(*) from tipos_insertados) as tipos_creados,
  (select count(*) from bibliotecas_insertadas) as bibliotecas_creadas,
  (select count(*) from segmentos_insertados) as segmentos_creados;

with cotizaciones_actualizadas as (
  update public.cotizaciones cotizacion
  set tipo_documento_id = tipo.id
  from public.empresas empresa
  join public.tipos_documento_electronico tipo
    on tipo.empresa_id = empresa.id
   and tipo.codigo = 'COTIZACION_ESTANDAR'
   and tipo.categoria_base = 'cotizacion'
   and tipo.es_default_para_categoria = true
  where cotizacion.empresa_id = empresa.id
    and tipo.sociedad_id is not distinct from (
      case
        when empresa.multisociedad_habilitado then cotizacion.sociedad_id
        else null::uuid
      end
    )
    and cotizacion.tipo_documento_id is distinct from tipo.id
  returning cotizacion.id
)
select count(*) as cotizaciones_actualizadas
from cotizaciones_actualizadas;

select pg_notify('pgrst', 'reload schema');
