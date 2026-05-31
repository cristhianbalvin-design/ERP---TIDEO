-- Modulo Evaluaciones de Desempeno
-- 360 basico: autoevaluacion + jefe, competencias + objetivos.
-- Los resultados son solo informativos y no disparan nomina ni comisiones.

alter table public.empresa_config
  add column if not exists eval_peso_autoevaluacion numeric(5,2) not null default 30,
  add column if not exists eval_peso_jefe numeric(5,2) not null default 70,
  add column if not exists eval_peso_competencias numeric(5,2) not null default 50,
  add column if not exists eval_peso_objetivos numeric(5,2) not null default 50,
  add column if not exists eval_escala_min integer not null default 1,
  add column if not exists eval_escala_max integer not null default 5,
  add column if not exists eval_escala_labels jsonb not null default '{"1":"Insatisfactorio","2":"Por mejorar","3":"Satisfactorio","4":"Destacado","5":"Sobresaliente"}'::jsonb;

create table if not exists public.desempeno_plantillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  periodo text not null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'activa', 'cerrada')),
  peso_autoevaluacion numeric(5,2) not null default 30
    check (peso_autoevaluacion >= 0 and peso_autoevaluacion <= 100),
  peso_jefe numeric(5,2) not null default 70
    check (peso_jefe >= 0 and peso_jefe <= 100),
  peso_competencias numeric(5,2) not null default 50
    check (peso_competencias >= 0 and peso_competencias <= 100),
  peso_objetivos numeric(5,2) not null default 50
    check (peso_objetivos >= 0 and peso_objetivos <= 100),
  fecha_inicio date,
  fecha_limite_autoevaluacion date,
  fecha_limite_jefe date,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint desempeno_plantillas_peso_eval_check
    check (abs((peso_autoevaluacion + peso_jefe) - 100) < 0.001),
  constraint desempeno_plantillas_peso_dimension_check
    check (abs((peso_competencias + peso_objetivos) - 100) < 0.001)
);

create table if not exists public.desempeno_competencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  plantilla_id uuid not null references public.desempeno_plantillas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  escala_min integer not null default 1,
  escala_max integer not null default 5,
  orden integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint desempeno_competencias_escala_check check (escala_min < escala_max),
  constraint desempeno_competencias_orden_check check (orden between 1 and 10),
  unique (plantilla_id, orden)
);

create table if not exists public.desempeno_objetivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  plantilla_id uuid not null references public.desempeno_plantillas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  unidad_medida text not null default 'numero'
    check (unidad_medida in ('numero', 'porcentaje', 'soles', 'cantidad')),
  meta_numerica numeric(14,4) not null default 0,
  orden integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint desempeno_objetivos_meta_check check (meta_numerica >= 0),
  constraint desempeno_objetivos_orden_check check (orden between 1 and 10),
  unique (plantilla_id, orden)
);

create table if not exists public.desempeno_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  plantilla_id uuid not null references public.desempeno_plantillas(id) on delete cascade,
  evaluado_id text not null,
  evaluado_nombre text not null,
  evaluado_tipo text not null check (evaluado_tipo in ('operativo', 'administrativo')),
  jefe_id uuid references auth.users(id) on delete set null,
  jefe_nombre text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'autoevaluacion_completa', 'evaluacion_jefe_completa', 'completada', 'cancelada')),
  score_autoevaluacion numeric(5,2),
  score_jefe numeric(5,2),
  score_final numeric(5,2),
  comentario_final_jefe text,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plantilla_id, evaluado_id)
);

create table if not exists public.desempeno_respuestas_competencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  evaluacion_id uuid not null references public.desempeno_evaluaciones(id) on delete cascade,
  competencia_id uuid not null references public.desempeno_competencias(id) on delete cascade,
  tipo_evaluador text not null check (tipo_evaluador in ('autoevaluacion', 'jefe')),
  puntaje numeric(6,2) not null check (puntaje >= 0),
  comentario text,
  respondido_por uuid references auth.users(id) on delete set null,
  respondido_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluacion_id, competencia_id, tipo_evaluador)
);

create table if not exists public.desempeno_respuestas_objetivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  evaluacion_id uuid not null references public.desempeno_evaluaciones(id) on delete cascade,
  objetivo_id uuid not null references public.desempeno_objetivos(id) on delete cascade,
  tipo_evaluador text not null check (tipo_evaluador in ('autoevaluacion', 'jefe')),
  resultado_real numeric(14,4) not null default 0,
  porcentaje_cumplimiento numeric(8,2) not null default 0,
  comentario text,
  respondido_por uuid references auth.users(id) on delete set null,
  respondido_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluacion_id, objetivo_id, tipo_evaluador)
);

create index if not exists idx_desempeno_plantillas_empresa
  on public.desempeno_plantillas(empresa_id, estado, fecha_inicio desc);
create index if not exists idx_desempeno_competencias_plantilla
  on public.desempeno_competencias(plantilla_id, orden);
create index if not exists idx_desempeno_objetivos_plantilla
  on public.desempeno_objetivos(plantilla_id, orden);
create index if not exists idx_desempeno_evaluaciones_empresa_estado
  on public.desempeno_evaluaciones(empresa_id, estado, updated_at desc);
create index if not exists idx_desempeno_evaluaciones_jefe
  on public.desempeno_evaluaciones(empresa_id, jefe_id, estado);
create index if not exists idx_desempeno_evaluaciones_evaluado
  on public.desempeno_evaluaciones(empresa_id, evaluado_id);
create index if not exists idx_desempeno_resp_comp_eval
  on public.desempeno_respuestas_competencias(evaluacion_id, tipo_evaluador);
create index if not exists idx_desempeno_resp_obj_eval
  on public.desempeno_respuestas_objetivos(evaluacion_id, tipo_evaluador);

create or replace function public.trg_desempeno_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_desempeno_plantillas_updated_at on public.desempeno_plantillas;
create trigger trg_desempeno_plantillas_updated_at
before update on public.desempeno_plantillas
for each row execute function public.trg_desempeno_updated_at();

drop trigger if exists trg_desempeno_competencias_updated_at on public.desempeno_competencias;
create trigger trg_desempeno_competencias_updated_at
before update on public.desempeno_competencias
for each row execute function public.trg_desempeno_updated_at();

drop trigger if exists trg_desempeno_objetivos_updated_at on public.desempeno_objetivos;
create trigger trg_desempeno_objetivos_updated_at
before update on public.desempeno_objetivos
for each row execute function public.trg_desempeno_updated_at();

drop trigger if exists trg_desempeno_evaluaciones_updated_at on public.desempeno_evaluaciones;
create trigger trg_desempeno_evaluaciones_updated_at
before update on public.desempeno_evaluaciones
for each row execute function public.trg_desempeno_updated_at();

drop trigger if exists trg_desempeno_resp_comp_updated_at on public.desempeno_respuestas_competencias;
create trigger trg_desempeno_resp_comp_updated_at
before update on public.desempeno_respuestas_competencias
for each row execute function public.trg_desempeno_updated_at();

drop trigger if exists trg_desempeno_resp_obj_updated_at on public.desempeno_respuestas_objetivos;
create trigger trg_desempeno_resp_obj_updated_at
before update on public.desempeno_respuestas_objetivos
for each row execute function public.trg_desempeno_updated_at();

create or replace function public.desempeno_personal_auth_user(
  target_empresa_id text,
  target_personal_id text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select pa.auth_user_id
      from public.personal_administrativo pa
      where pa.empresa_id = target_empresa_id
        and pa.id = target_personal_id
      limit 1
    ),
    (
      select po.auth_user_id
      from public.personal_operativo po
      where po.empresa_id = target_empresa_id
        and po.id = target_personal_id
      limit 1
    )
  );
$$;

create or replace function public.desempeno_es_evaluado(
  target_empresa_id text,
  target_personal_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.desempeno_personal_auth_user(target_empresa_id, target_personal_id) = auth.uid();
$$;

create or replace function public.desempeno_es_jefe_directo(
  target_empresa_id text,
  target_jefe_id uuid,
  target_personal_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with evaluado as (
    select public.desempeno_personal_auth_user(target_empresa_id, target_personal_id) as user_id
  )
  select coalesce(target_jefe_id = auth.uid(), false)
    or exists (
      select 1
      from public.usuarios_empresas ue, evaluado e
      where ue.empresa_id = target_empresa_id
        and ue.user_id = e.user_id
        and ue.jefe_user_id = auth.uid()
        and ue.estado = 'activo'
    )
    or exists (
      select 1
      from public.usuarios_asignaciones ua, evaluado e
      where ua.empresa_id = target_empresa_id
        and ua.user_id = e.user_id
        and ua.jefe_user_id = auth.uid()
        and ua.activo = true
    );
$$;

create or replace function public.desempeno_puede_gestionar(target_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_tiene_empresa(target_empresa_id)
    and (
      public.usuario_es_admin_empresa(target_empresa_id)
      or public.usuario_puede(target_empresa_id, 'evaluaciones_desempeno', 'crear')
      or public.usuario_puede(target_empresa_id, 'evaluaciones_desempeno', 'editar')
      or public.usuario_puede(target_empresa_id, 'evaluaciones_desempeno', 'exportar')
      or exists (
        select 1
        from public.usuarios_empresas ue
        join public.roles r on r.id = ue.rol_id
        where ue.user_id = auth.uid()
          and ue.empresa_id = target_empresa_id
          and ue.estado = 'activo'
          and (
            lower(coalesce(r.categoria, '')) = 'admin'
            or lower(coalesce(r.nombre, '')) like '%rrhh%'
            or lower(coalesce(r.nombre, '')) like '%recursos humanos%'
          )
      )
    );
$$;

create or replace function public.desempeno_puede_ver_evaluacion(target_evaluacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.desempeno_evaluaciones e
    where e.id = target_evaluacion_id
      and public.usuario_tiene_empresa(e.empresa_id)
      and (
        public.desempeno_puede_gestionar(e.empresa_id)
        or public.desempeno_es_evaluado(e.empresa_id, e.evaluado_id)
        or public.desempeno_es_jefe_directo(e.empresa_id, e.jefe_id, e.evaluado_id)
      )
  );
$$;

create or replace function public.desempeno_puede_responder(
  target_evaluacion_id uuid,
  target_tipo text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.desempeno_evaluaciones e
    join public.desempeno_plantillas p on p.id = e.plantilla_id
    where e.id = target_evaluacion_id
      and p.estado <> 'cerrada'
      and e.estado <> 'cancelada'
      and public.usuario_tiene_empresa(e.empresa_id)
      and (
        public.desempeno_puede_gestionar(e.empresa_id)
        or (
          target_tipo = 'autoevaluacion'
          and e.estado = 'pendiente'
          and public.desempeno_es_evaluado(e.empresa_id, e.evaluado_id)
        )
        or (
          target_tipo = 'jefe'
          and e.estado in ('autoevaluacion_completa', 'evaluacion_jefe_completa')
          and public.desempeno_es_jefe_directo(e.empresa_id, e.jefe_id, e.evaluado_id)
        )
      )
  );
$$;

alter table public.desempeno_plantillas enable row level security;
alter table public.desempeno_competencias enable row level security;
alter table public.desempeno_objetivos enable row level security;
alter table public.desempeno_evaluaciones enable row level security;
alter table public.desempeno_respuestas_competencias enable row level security;
alter table public.desempeno_respuestas_objetivos enable row level security;

drop policy if exists desempeno_plantillas_select on public.desempeno_plantillas;
create policy desempeno_plantillas_select on public.desempeno_plantillas
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.desempeno_puede_gestionar(empresa_id)
      or exists (
        select 1
        from public.desempeno_evaluaciones e
        where e.plantilla_id = desempeno_plantillas.id
          and public.desempeno_puede_ver_evaluacion(e.id)
      )
    )
  );

drop policy if exists desempeno_plantillas_insert on public.desempeno_plantillas;
create policy desempeno_plantillas_insert on public.desempeno_plantillas
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.desempeno_puede_gestionar(empresa_id)
      or public.usuario_puede(empresa_id, 'evaluaciones_desempeno', 'crear')
    )
  );

drop policy if exists desempeno_plantillas_update on public.desempeno_plantillas;
create policy desempeno_plantillas_update on public.desempeno_plantillas
  for update using (public.desempeno_puede_gestionar(empresa_id))
  with check (public.desempeno_puede_gestionar(empresa_id));

drop policy if exists desempeno_plantillas_delete on public.desempeno_plantillas;
create policy desempeno_plantillas_delete on public.desempeno_plantillas
  for delete using (public.desempeno_puede_gestionar(empresa_id));

drop policy if exists desempeno_competencias_select on public.desempeno_competencias;
create policy desempeno_competencias_select on public.desempeno_competencias
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from public.desempeno_plantillas p
      where p.id = desempeno_competencias.plantilla_id
    )
  );

drop policy if exists desempeno_competencias_write on public.desempeno_competencias;
create policy desempeno_competencias_write on public.desempeno_competencias
  for all using (public.desempeno_puede_gestionar(empresa_id))
  with check (public.desempeno_puede_gestionar(empresa_id));

drop policy if exists desempeno_objetivos_select on public.desempeno_objetivos;
create policy desempeno_objetivos_select on public.desempeno_objetivos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from public.desempeno_plantillas p
      where p.id = desempeno_objetivos.plantilla_id
    )
  );

drop policy if exists desempeno_objetivos_write on public.desempeno_objetivos;
create policy desempeno_objetivos_write on public.desempeno_objetivos
  for all using (public.desempeno_puede_gestionar(empresa_id))
  with check (public.desempeno_puede_gestionar(empresa_id));

drop policy if exists desempeno_evaluaciones_select on public.desempeno_evaluaciones;
create policy desempeno_evaluaciones_select on public.desempeno_evaluaciones
  for select using (public.desempeno_puede_ver_evaluacion(id));

drop policy if exists desempeno_evaluaciones_insert on public.desempeno_evaluaciones;
create policy desempeno_evaluaciones_insert on public.desempeno_evaluaciones
  for insert with check (public.desempeno_puede_gestionar(empresa_id));

drop policy if exists desempeno_evaluaciones_update on public.desempeno_evaluaciones;
create policy desempeno_evaluaciones_update on public.desempeno_evaluaciones
  for update using (
    public.desempeno_puede_gestionar(empresa_id)
    or (
      estado = 'pendiente'
      and public.desempeno_es_evaluado(empresa_id, evaluado_id)
    )
    or (
      estado = 'autoevaluacion_completa'
      and public.desempeno_es_jefe_directo(empresa_id, jefe_id, evaluado_id)
    )
  )
  with check (
    public.desempeno_puede_gestionar(empresa_id)
    or (
      estado in ('pendiente', 'autoevaluacion_completa')
      and public.desempeno_es_evaluado(empresa_id, evaluado_id)
    )
    or (
      estado in ('autoevaluacion_completa', 'evaluacion_jefe_completa', 'completada')
      and public.desempeno_es_jefe_directo(empresa_id, jefe_id, evaluado_id)
    )
  );

drop policy if exists desempeno_respuestas_comp_select on public.desempeno_respuestas_competencias;
create policy desempeno_respuestas_comp_select on public.desempeno_respuestas_competencias
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from public.desempeno_evaluaciones e
      join public.desempeno_plantillas p on p.id = e.plantilla_id
      where e.id = desempeno_respuestas_competencias.evaluacion_id
        and (
          public.desempeno_puede_gestionar(e.empresa_id)
          or public.desempeno_es_jefe_directo(e.empresa_id, e.jefe_id, e.evaluado_id)
          or (
            public.desempeno_es_evaluado(e.empresa_id, e.evaluado_id)
            and (
              desempeno_respuestas_competencias.tipo_evaluador = 'autoevaluacion'
              or p.estado = 'cerrada'
            )
          )
        )
    )
  );

drop policy if exists desempeno_respuestas_comp_write on public.desempeno_respuestas_competencias;
create policy desempeno_respuestas_comp_write on public.desempeno_respuestas_competencias
  for all using (public.desempeno_puede_responder(evaluacion_id, tipo_evaluador))
  with check (public.desempeno_puede_responder(evaluacion_id, tipo_evaluador));

drop policy if exists desempeno_respuestas_obj_select on public.desempeno_respuestas_objetivos;
create policy desempeno_respuestas_obj_select on public.desempeno_respuestas_objetivos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from public.desempeno_evaluaciones e
      join public.desempeno_plantillas p on p.id = e.plantilla_id
      where e.id = desempeno_respuestas_objetivos.evaluacion_id
        and (
          public.desempeno_puede_gestionar(e.empresa_id)
          or public.desempeno_es_jefe_directo(e.empresa_id, e.jefe_id, e.evaluado_id)
          or (
            public.desempeno_es_evaluado(e.empresa_id, e.evaluado_id)
            and (
              desempeno_respuestas_objetivos.tipo_evaluador = 'autoevaluacion'
              or p.estado = 'cerrada'
            )
          )
        )
    )
  );

drop policy if exists desempeno_respuestas_obj_write on public.desempeno_respuestas_objetivos;
create policy desempeno_respuestas_obj_write on public.desempeno_respuestas_objetivos
  for all using (public.desempeno_puede_responder(evaluacion_id, tipo_evaluador))
  with check (public.desempeno_puede_responder(evaluacion_id, tipo_evaluador));

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select
  r.id,
  'evaluaciones_desempeno',
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false
from public.roles r
where r.activo = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true;

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select
  r.id,
  'evaluaciones_desempeno',
  true,
  true,
  true,
  false,
  true,
  true,
  false,
  false
from public.roles r
where r.es_admin_empresa = true
  or r.es_superadmin = true
  or lower(coalesce(r.categoria, '')) = 'admin'
  or lower(coalesce(r.nombre, '')) like '%rrhh%'
  or lower(coalesce(r.nombre, '')) like '%recursos humanos%'
on conflict (rol_id, pantalla) do update set
  puede_ver = excluded.puede_ver,
  puede_crear = excluded.puede_crear,
  puede_editar = excluded.puede_editar,
  puede_anular = excluded.puede_anular,
  puede_aprobar = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar,
  puede_ver_costos = excluded.puede_ver_costos,
  puede_ver_finanzas = excluded.puede_ver_finanzas;

select pg_notify('pgrst', 'reload schema');
