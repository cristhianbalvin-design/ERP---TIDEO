-- Archivar manualmente un documento personal sin eliminar su registro ni archivo.
-- A diferencia de eliminar_documento_personal_seguro, no bloquea por dependencias:
-- el documento se conserva como evidencia historica y deja de estar vigente.

create or replace function public.archivar_documento_personal_seguro(
  p_documento_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_documento public.personal_documentos;
begin
  select *
    into v_documento
  from public.personal_documentos
  where id = p_documento_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'El documento ya no existe o no esta disponible.'
    );
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
    raise exception 'No tiene permiso para archivar documentos de este trabajador';
  end if;

  if coalesce(v_documento.periodo_estado, 'vigente') = 'archivado' then
    return jsonb_build_object(
      'ok', false,
      'error', 'El documento ya se encuentra archivado.'
    );
  end if;

  update public.personal_documentos
     set periodo_estado = 'archivado',
         activo = false
   where id = v_documento.id
     and empresa_id = v_documento.empresa_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.archivar_documento_personal_seguro(text)
  from public, anon;

grant execute on function public.archivar_documento_personal_seguro(text)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
