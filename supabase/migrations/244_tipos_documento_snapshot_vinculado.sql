-- 244 — Catálogo tipos de documento: captura_snapshot_laboral + documento_padre_tipo_id
-- Permite que RRHH configure desde la UI qué tipos capturan condiciones laborales
-- y qué tipos son documentos vinculados a otro tipo padre (ej: Adenda → Contrato).

-- ── 1. Nuevas columnas en tipos_documento_empresa ─────────────────────────────

alter table public.tipos_documento_empresa
  add column if not exists captura_snapshot_laboral boolean not null default false,
  add column if not exists documento_padre_tipo_id  text
    references public.tipos_documento_empresa(id) on delete set null;

-- ── 2. Backfill: Contrato → captura_snapshot_laboral = true ──────────────────

update public.tipos_documento_empresa
set captura_snapshot_laboral = true
where lower(nombre) like '%contrato%'
  and lower(nombre) not like '%adenda%';

-- ── 3. Backfill: Adenda → captura_snapshot_laboral = true + vincula al Contrato del tenant

update public.tipos_documento_empresa a
set captura_snapshot_laboral = true,
    documento_padre_tipo_id = (
      select c.id
      from public.tipos_documento_empresa c
      where c.empresa_id = a.empresa_id
        and lower(c.nombre) like '%contrato%'
        and lower(c.nombre) not like '%adenda%'
      order by c.orden asc, c.created_at asc
      limit 1
    )
where lower(a.nombre) like '%adenda%';

-- ── 4. Actualizar validar_documento_personal para usar captura_snapshot_laboral ─

create or replace function public.validar_documento_personal(
  p_documento_id   text,
  p_decision       text,
  p_motivo_rechazo text default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id       text;
  v_empresa_id       text;
  v_row              public.personal_documentos;
  v_tipo_texto       text;
  v_captura_snapshot boolean := false;
  v_es_vinculado     boolean := false;
  v_cond             jsonb;
  v_cambios          jsonb;
  v_patch            jsonb;
  v_aplicar          boolean;
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
    raise exception 'Decision invalida. Use aprobado o rechazado';
  end if;

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

  -- Resolver captura_snapshot y si es documento vinculado (tipo hijo) desde el catálogo
  if v_row.tipo_documento_id is not null then
    select
      coalesce(t.captura_snapshot_laboral, false),
      t.documento_padre_tipo_id is not null
    into v_captura_snapshot, v_es_vinculado
    from public.tipos_documento_empresa t
    where t.id = v_row.tipo_documento_id;
  end if;

  -- Fallback por nombre para tipos sin tipo_documento_id registrado
  if not v_captura_snapshot then
    v_tipo_texto := lower(coalesce(v_row.tipo_doc, ''));
    if v_tipo_texto like '%contrato%' or v_tipo_texto like '%adenda%' then
      v_captura_snapshot := true;
      v_es_vinculado := v_tipo_texto like '%adenda%';
    end if;
  end if;

  if p_decision = 'aprobado' and v_captura_snapshot then
    v_cond    := coalesce(v_row.condiciones_laborales, '{}'::jsonb);
    v_cambios := coalesce(v_row.adenda_cambios, '{}'::jsonb);
    v_aplicar := v_row.fecha_vigencia_cambio is null or v_row.fecha_vigencia_cambio <= current_date;

    if v_es_vinculado then
      -- Documento vinculado (adenda, modificación): aplicar solo los campos que cambiaron
      if not v_aplicar then
        return v_row;
      end if;
      v_patch := '{}'::jsonb;
      if coalesce((v_cambios ->> 'cargo')::boolean, false) then
        v_patch := v_patch || jsonb_build_object('cargo', v_cond ->> 'cargo', 'cargo_id', v_cond ->> 'cargo_id');
      end if;
      if coalesce((v_cambios ->> 'remuneracion')::boolean, false) then
        v_patch := v_patch || jsonb_build_object('remuneracion_base', v_cond ->> 'remuneracion_base');
      end if;
      if coalesce((v_cambios ->> 'modalidad')::boolean, false) then
        v_patch := v_patch || jsonb_build_object('modalidad', v_cond ->> 'modalidad');
      end if;
      if coalesce((v_cambios ->> 'sede')::boolean, false) then
        v_patch := v_patch || jsonb_build_object('sede', v_cond ->> 'sede', 'sede_id', v_cond ->> 'sede_id');
      end if;
      v_cond := v_patch;
    end if;

    if v_row.personal_tipo = 'operativo' then
      update public.personal_operativo
      set cargo         = coalesce(nullif(v_cond ->> 'cargo', ''), cargo),
          cargo_id      = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base   = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          monto_mensual = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato = coalesce(nullif(v_cond ->> 'tipo_contrato', ''), tipo_contrato),
          sede          = coalesce(nullif(v_cond ->> 'sede', ''), sede),
          sede_id       = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id)
      where id = v_row.personal_id and empresa_id = v_row.empresa_id;
    else
      update public.personal_administrativo
      set cargo         = coalesce(nullif(v_cond ->> 'cargo', ''), cargo),
          cargo_id      = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base   = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          remuneracion  = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, remuneracion),
          monto_mensual = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato = coalesce(nullif(v_cond ->> 'tipo_contrato', ''), tipo_contrato),
          modalidad     = coalesce(nullif(v_cond ->> 'modalidad', ''), modalidad),
          sede          = coalesce(nullif(v_cond ->> 'sede', ''), sede),
          sede_id       = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id)
      where id = v_row.personal_id and empresa_id = v_row.empresa_id;
    end if;
  end if;

  return v_row;
end;
$$;

select pg_notify('pgrst', 'reload schema');
