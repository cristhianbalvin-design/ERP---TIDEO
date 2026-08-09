-- B1: impedir que la RPC legacy cree solicitudes sin identidad societaria.
-- Las rutas actuales resuelven la sociedad desde el contrato en el servicio.

create or replace function public.crear_solicitud_rrhh(
  p_empresa_id        text,
  p_personal_id       text,
  p_personal_nombre   text,
  p_personal_tipo     text,
  p_aprobador_id      text default null,
  p_aprobador_nombre  text default null,
  p_tipo              text default 'vacaciones',
  p_fecha_inicio      date default current_date,
  p_fecha_fin         date default current_date,
  p_motivo            text default '',
  p_documento_url     text default null,
  p_registrado_desde  text default 'backoffice'
)
returns public.solicitudes_rrhh
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias    integer;
  v_req_doc boolean;
  v_row     public.solicitudes_rrhh;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  -- Debe ocurrir antes de calcular o escribir cualquier dato. La firma legacy
  -- no recibe sociedad y no puede resolverla de forma segura por si sola.
  if exists (
    select 1
    from public.empresas e
    where e.id = p_empresa_id
      and e.multisociedad_habilitado = true
  ) then
    raise exception 'La RPC legacy crear_solicitud_rrhh no admite tenants multisociedad. Usa el flujo actualizado que deriva la sociedad del contrato vigente.';
  end if;

  v_dias := public.calcular_dias_habiles(p_fecha_inicio, p_fecha_fin);
  v_req_doc := p_tipo in ('licencia_medica', 'licencia_maternidad', 'licencia_paternidad');

  insert into public.solicitudes_rrhh (
    empresa_id, personal_id, personal_nombre, personal_tipo,
    aprobador_id, aprobador_nombre, tipo, fecha_inicio, fecha_fin,
    dias_habiles, motivo, documento_url, requiere_documento,
    estado, registrado_desde, creado_por
  ) values (
    p_empresa_id, p_personal_id, p_personal_nombre, p_personal_tipo,
    p_aprobador_id, p_aprobador_nombre, p_tipo, p_fecha_inicio, p_fecha_fin,
    v_dias, p_motivo, p_documento_url, v_req_doc,
    'enviada', p_registrado_desde, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

select pg_notify('pgrst', 'reload schema');
