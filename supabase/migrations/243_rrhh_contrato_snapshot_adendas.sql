-- Modelo contractual trazable: snapshot laboral y adendas.
-- La ficha mantiene condiciones vigentes; personal_documentos conserva lo firmado.

alter table if exists public.personal_documentos
  add column if not exists condiciones_laborales jsonb not null default '{}'::jsonb,
  add column if not exists contrato_referencia_id text references public.personal_documentos(id) on delete set null,
  add column if not exists adenda_cambios jsonb not null default '{}'::jsonb,
  add column if not exists fecha_vigencia_cambio date,
  add column if not exists seccion_documental text not null default 'adicional'
    check (seccion_documental in ('requisito_cargo', 'adicional'));

create index if not exists idx_pdoc_contrato_referencia
  on public.personal_documentos(empresa_id, personal_id, contrato_referencia_id);

create index if not exists idx_pdoc_condiciones_gin
  on public.personal_documentos using gin (condiciones_laborales);

insert into public.tipos_documento_empresa (
  id, empresa_id, codigo, nombre, ambito, exige_vencimiento, dias_alerta,
  es_habilitante, requiere_validacion, estado, orden
)
select 'tdoc_adenda_' || e.id, e.id, 'ADENDA', 'Adenda contractual', 'Ambos',
       false, 0, false, true, 'activo', 31
from public.empresas e
on conflict (empresa_id, codigo) do update
set nombre = excluded.nombre,
    ambito = excluded.ambito,
    exige_vencimiento = excluded.exige_vencimiento,
    requiere_validacion = excluded.requiere_validacion,
    estado = 'activo';

drop function if exists public.subir_documento_personal(
  text, text, text, text, text, text, date, date, text, text, text
);

create function public.subir_documento_personal(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     default null,
  p_fecha_vencimiento       date     default null,
  p_notas                   text     default null,
  p_subido_desde            text     default 'backoffice',
  p_tipo_documento_id       text     default null,
  p_condiciones_laborales   jsonb    default '{}'::jsonb,
  p_contrato_referencia_id  text     default null,
  p_adenda_cambios          jsonb    default '{}'::jsonb,
  p_fecha_vigencia_cambio   date     default null,
  p_seccion_documental      text     default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id text;
  v_version integer;
  v_row public.personal_documentos;
  v_seccion text := coalesce(nullif(p_seccion_documental, ''), 'adicional');
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;

  update public.personal_documentos
  set activo = false
  where empresa_id = p_empresa_id
    and personal_id = p_personal_id
    and activo = true
    and (
      (p_tipo_documento_id is not null and tipo_documento_id = p_tipo_documento_id)
      or tipo_doc = p_tipo_doc
    );

  select coalesce(max(version), 0) + 1 into v_version
  from public.personal_documentos
  where empresa_id = p_empresa_id
    and personal_id = p_personal_id
    and (
      (p_tipo_documento_id is not null and tipo_documento_id = p_tipo_documento_id)
      or tipo_doc = p_tipo_doc
    );

  insert into public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales, contrato_referencia_id,
    adenda_cambios, fecha_vigencia_cambio, seccion_documental
  ) values (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    coalesce(p_condiciones_laborales, '{}'::jsonb), p_contrato_referencia_id,
    coalesce(p_adenda_cambios, '{}'::jsonb), p_fecha_vigencia_cambio, v_seccion
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text) from public;
grant execute on function public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text) to authenticated;

create or replace function public.validar_documento_personal(
  p_documento_id      text,
  p_decision          text,
  p_motivo_rechazo    text default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id text;
  v_empresa_id text;
  v_row public.personal_documentos;
  v_tipo text;
  v_cond jsonb;
  v_cambios jsonb;
  v_patch jsonb;
  v_aplicar boolean;
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
      motivo_rechazo = case when p_decision = 'rechazado' then p_motivo_rechazo else null end,
      revisado_por = v_usuario_id,
      revisado_en = now()
  where id = p_documento_id
  returning * into v_row;

  v_tipo := lower(coalesce(v_row.tipo_doc, '') || ' ' || coalesce(v_row.tipo_documento_id, ''));
  select lower(v_tipo || ' ' || coalesce(t.nombre, '') || ' ' || coalesce(t.codigo, ''))
    into v_tipo
  from public.tipos_documento_empresa t
  where t.id = v_row.tipo_documento_id;
  v_tipo := coalesce(v_tipo, lower(coalesce(v_row.tipo_doc, '') || ' ' || coalesce(v_row.tipo_documento_id, '')));

  if p_decision = 'aprobado' and (v_tipo like '%contrato%' or v_tipo like '%adenda%') then
    v_cond := coalesce(v_row.condiciones_laborales, '{}'::jsonb);
    v_cambios := coalesce(v_row.adenda_cambios, '{}'::jsonb);
    v_aplicar := v_row.fecha_vigencia_cambio is null or v_row.fecha_vigencia_cambio <= current_date;

    if v_tipo like '%adenda%' then
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
      set cargo = coalesce(nullif(v_cond ->> 'cargo', ''), cargo),
          cargo_id = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          monto_mensual = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato = coalesce(nullif(v_cond ->> 'tipo_contrato', ''), tipo_contrato),
          sede = coalesce(nullif(v_cond ->> 'sede', ''), sede),
          sede_id = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id)
      where id = v_row.personal_id and empresa_id = v_row.empresa_id;
    else
      update public.personal_administrativo
      set cargo = coalesce(nullif(v_cond ->> 'cargo', ''), cargo),
          cargo_id = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          remuneracion = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, remuneracion),
          monto_mensual = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato = coalesce(nullif(v_cond ->> 'tipo_contrato', ''), tipo_contrato),
          modalidad = coalesce(nullif(v_cond ->> 'modalidad', ''), modalidad),
          sede = coalesce(nullif(v_cond ->> 'sede', ''), sede),
          sede_id = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id)
      where id = v_row.personal_id and empresa_id = v_row.empresa_id;
    end if;
  end if;

  return v_row;
end;
$$;

select pg_notify('pgrst', 'reload schema');
