-- 445 · Eliminación segura de documentos personales sin uso
--
-- Un documento solo se puede eliminar si no tiene dependencias funcionales
-- ni fue utilizado para procesar nómina. Se devuelve JSONB para que la UI
-- pueda mostrar el motivo exacto del rechazo sin depender de errores genéricos.

create or replace function public.eliminar_documento_personal_seguro(
  p_documento_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_documento public.personal_documentos;
  v_periodo text;
  v_inicio date;
  v_fin date;
begin
  select * into v_documento
  from public.personal_documentos
  where id = p_documento_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'El documento ya no existe o no está disponible.');
  end if;

  if not public.usuario_tiene_empresa(v_documento.empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  if not (
    case v_documento.personal_tipo
      when 'operativo' then
        public.usuario_puede(v_documento.empresa_id, 'rrhh_operativo', 'editar')
        or public.usuario_puede(v_documento.empresa_id, 'personal_operativo', 'editar')
      when 'administrativo' then
        public.usuario_puede(v_documento.empresa_id, 'rrhh_admin', 'editar')
      else false
    end
  ) then
    raise exception 'No tiene permiso para eliminar documentos de este trabajador';
  end if;

  if exists (
    select 1
    from public.personal_documentos
    where contrato_referencia_id = v_documento.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'No se puede eliminar: existen adendas o documentos vinculados a este contrato. Archívalo en su lugar.');
  end if;

  if exists (
    select 1
    from public.personal_asignaciones_jornada
    where documento_origen_id = v_documento.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'No se puede eliminar: este documento es el origen de una asignación de jornada. Archívalo en su lugar.');
  end if;

  if coalesce(v_documento.estado_firma, '') not in ('', 'no_requiere', 'pendiente_no_enviado') then
    return jsonb_build_object('ok', false, 'error', 'No se puede eliminar: el documento tiene un proceso de firma iniciado. Archívalo en su lugar.');
  end if;

  if exists (
    select 1
    from public.personal_documentos
    where documento_enviado_a_firma_id = v_documento.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'No se puede eliminar: existe un documento firmado vinculado a este envío. Archívalo en su lugar.');
  end if;

  v_inicio := coalesce(v_documento.periodo_fecha_inicio, v_documento.fecha_emision);
  v_fin := case
    when v_documento.es_indefinido then null
    else coalesce(v_documento.periodo_fecha_fin, v_documento.fecha_vencimiento)
  end;

  select p.periodo into v_periodo
  from public.nomina_detalle d
  join public.periodos_nomina p on p.id = d.periodo_id
  where d.empresa_id = v_documento.empresa_id
    and d.trabajador_id = v_documento.personal_id
    and p.estado in ('en_proceso', 'cerrado', 'anulado')
    and (v_inicio is null or p.fecha_fin >= v_inicio)
    and (v_fin is null or p.fecha_inicio <= v_fin)
  order by p.anio desc, p.mes desc, p.quincena desc nulls last
  limit 1;

  if v_periodo is not null then
    return jsonb_build_object('ok', false, 'error', format('No se puede eliminar: el documento ya fue usado en la nómina procesada del período %s. Archívalo en su lugar.', v_periodo));
  end if;

  delete from public.personal_documentos
  where id = v_documento.id
    and empresa_id = v_documento.empresa_id;

  return jsonb_build_object('ok', true, 'archivo_url', v_documento.archivo_url);
end;
$$;

revoke all on function public.eliminar_documento_personal_seguro(text) from public;
revoke all on function public.eliminar_documento_personal_seguro(text) from anon;
grant execute on function public.eliminar_documento_personal_seguro(text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
