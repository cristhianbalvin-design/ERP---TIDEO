-- Fix: subir_documento_personal y validar_documento_personal usan
-- auth_user_id para resolver el usuario en public.usuarios, pero esa columna
-- no existe. El id de public.usuarios es el UUID de auth cast a text:
-- la consulta correcta es  where id = auth.uid()::text

-- ─── 1. subir_documento_personal ─────────────────────────────────────────────
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

  -- Resolver usuario actual usando la convención canónica del sistema
  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;
  -- Fallback: si no existe fila en usuarios (cuenta solo en auth), dejar null
  -- El INSERT acepta null en subido_por (on delete set null en la FK)

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

-- ─── 2. validar_documento_personal ───────────────────────────────────────────
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

  -- Resolver usuario actual usando la convención canónica del sistema
  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
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

select pg_notify('pgrst', 'reload schema');
