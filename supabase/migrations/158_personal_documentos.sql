-- TIDEO ERP — Migración 158: Sistema documental real para personal
-- Reemplaza el JSONB docs/documentos con tabla real: archivos, fechas, versiones, validación

-- ─── 1. Tabla personal_documentos ────────────────────────────────────────────
create table if not exists public.personal_documentos (
  id                  text primary key default ('pdoc_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id          text not null references public.empresas(id) on delete cascade,
  personal_id         text not null,
  personal_tipo       text not null default 'operativo'
                        check (personal_tipo in ('operativo', 'administrativo')),

  -- Tipo de documento
  tipo_doc            text not null,
  -- Valores esperados: sctr, medico, epp, licencia_conducir, dni, contrato,
  --                    carnet_minero, certificado_altura, otro

  -- Archivo
  nombre_archivo      text,
  archivo_url         text,
  bucket              text not null default 'documentos-privados',

  -- Fechas
  fecha_emision       date,
  fecha_vencimiento   date,

  -- Versionado: version incremental por (personal_id, tipo_doc)
  version             integer not null default 1,
  activo              boolean not null default true,

  -- Flujo de validación
  estado_validacion   text not null default 'pendiente'
                        check (estado_validacion in ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo      text,
  notas               text,

  -- Trazabilidad
  subido_por          text references public.usuarios(id) on delete set null,
  subido_desde        text not null default 'backoffice'
                        check (subido_desde in ('backoffice', 'mobile')),
  revisado_por        text references public.usuarios(id) on delete set null,
  revisado_en         timestamptz,

  creado_en           timestamptz not null default now()
);

create index if not exists idx_pdoc_personal_activo
  on public.personal_documentos(empresa_id, personal_id, activo, tipo_doc);

create index if not exists idx_pdoc_validacion_pendiente
  on public.personal_documentos(empresa_id, estado_validacion)
  where estado_validacion = 'pendiente';

create index if not exists idx_pdoc_vencimiento
  on public.personal_documentos(empresa_id, fecha_vencimiento)
  where activo = true and fecha_vencimiento is not null;

-- ─── 2. Función: calcular estado de vencimiento ───────────────────────────────
-- Retorna: vigente | por_vencer (≤ 30 días) | vencido | sin_vencimiento
create or replace function public.estado_vencimiento_doc(p_fecha_vencimiento date)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_fecha_vencimiento is null then 'sin_vencimiento'
    when p_fecha_vencimiento < current_date then 'vencido'
    when p_fecha_vencimiento <= current_date + interval '30 days' then 'por_vencer'
    else 'vigente'
  end;
$$;

-- ─── 3. RPC: subir_documento_personal ────────────────────────────────────────
-- Crea una nueva versión del documento, archivando la anterior (activo=false).
-- Disponible desde backoffice y mobile (security definer para bypass RLS en versiones).
create or replace function public.subir_documento_personal(
  p_empresa_id        text,
  p_personal_id       text,
  p_personal_tipo     text,
  p_tipo_doc          text,
  p_nombre_archivo    text,
  p_archivo_url       text,
  p_fecha_emision     date     default null,
  p_fecha_vencimiento date     default null,
  p_notas             text     default null,
  p_subido_desde      text     default 'backoffice'
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id  text;
  v_version     integer;
  v_row         public.personal_documentos;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  -- Resolver usuario actual (puede ser auth.uid vinculado a usuarios)
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid()
  limit 1;

  -- Archivar versión activa anterior (si existe)
  update public.personal_documentos
  set activo = false
  where empresa_id = p_empresa_id
    and personal_id = p_personal_id
    and tipo_doc    = p_tipo_doc
    and activo      = true;

  -- Calcular siguiente número de versión
  select coalesce(max(version), 0) + 1 into v_version
  from public.personal_documentos
  where empresa_id  = p_empresa_id
    and personal_id = p_personal_id
    and tipo_doc    = p_tipo_doc;

  -- Insertar nuevo documento
  insert into public.personal_documentos (
    empresa_id, personal_id, personal_tipo, tipo_doc,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo,
    estado_validacion, notas,
    subido_por, subido_desde
  ) values (
    p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_doc,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true,
    'pendiente', p_notas,
    v_usuario_id, p_subido_desde
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── 4. RPC: validar_documento_personal ──────────────────────────────────────
-- RRHH aprueba o rechaza un documento. Solo modifica el estado de validación.
create or replace function public.validar_documento_personal(
  p_documento_id      text,
  p_decision          text,   -- 'aprobado' | 'rechazado'
  p_motivo_rechazo    text    default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id  text;
  v_empresa_id  text;
  v_row         public.personal_documentos;
begin
  -- Obtener empresa_id del documento para verificar acceso
  select empresa_id into v_empresa_id
  from public.personal_documentos
  where id = p_documento_id;

  if not found then
    raise exception 'Documento no encontrado';
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  if p_decision not in ('aprobado', 'rechazado') then
    raise exception 'Decisión inválida. Use aprobado o rechazado';
  end if;

  -- Resolver usuario
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid()
  limit 1;

  update public.personal_documentos
  set estado_validacion = p_decision,
      motivo_rechazo    = case when p_decision = 'rechazado' then p_motivo_rechazo else null end,
      revisado_por      = v_usuario_id,
      revisado_en       = now()
  where id = p_documento_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
alter table public.personal_documentos enable row level security;

drop policy if exists pdoc_select on public.personal_documentos;
drop policy if exists pdoc_insert on public.personal_documentos;
drop policy if exists pdoc_update on public.personal_documentos;

create policy pdoc_select on public.personal_documentos
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy pdoc_insert on public.personal_documentos
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy pdoc_update on public.personal_documentos
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- No DELETE policy: los documentos nunca se eliminan, solo se archivan (activo=false)

select pg_notify('pgrst', 'reload schema');
