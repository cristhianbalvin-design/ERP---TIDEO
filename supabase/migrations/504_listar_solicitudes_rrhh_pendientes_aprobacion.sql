-- Bandeja móvil de aprobaciones RRHH.
-- Una sola RPC calcula la autorización con la misma regla que la escritura:
-- jefe efectivo O permiso solicitudes_rrhh/aprobar.
create or replace function public.listar_solicitudes_rrhh_pendientes_aprobacion(
  p_empresa_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_permiso_generico boolean := false;
  v_es_jefe_efectivo boolean := false;
  v_solicitudes jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'NO_AUTENTICADO: inicia sesion para consultar solicitudes RRHH.'
      using errcode = '42501';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'NO_AUTORIZADO: no perteneces a esta empresa.'
      using errcode = '42501';
  end if;

  v_permiso_generico := public.usuario_puede(
    p_empresa_id,
    'solicitudes_rrhh',
    'aprobar'
  );

  -- Se resuelve en base de datos, por lo que el supervisor no necesita una
  -- ficha cargada en la PWA para obtener su bandeja.
  select exists (
    select 1
    from (
      select po.id, 'operativo'::text as personal_tipo
      from public.personal_operativo po
      where po.empresa_id = p_empresa_id
      union all
      select pa.id, 'administrativo'::text as personal_tipo
      from public.personal_administrativo pa
      where pa.empresa_id = p_empresa_id
    ) personal
    where public.resolver_jefe_efectivo(
      p_empresa_id,
      personal.id,
      personal.personal_tipo
    ) = v_actor_id
  ) into v_es_jefe_efectivo;

  select coalesce(jsonb_agg(pendiente.payload order by pendiente.creado_en desc), '[]'::jsonb)
    into v_solicitudes
  from (
    select
      sr.creado_en,
      to_jsonb(sr) || jsonb_build_object(
        'puede_aprobar',
        v_permiso_generico
        or public.resolver_jefe_efectivo(
          p_empresa_id,
          sr.personal_id,
          sr.personal_tipo
        ) = v_actor_id
      ) as payload
    from public.solicitudes_rrhh sr
    where sr.empresa_id = p_empresa_id
      and sr.estado = 'enviada'
  ) pendiente
  where coalesce((pendiente.payload ->> 'puede_aprobar')::boolean, false);

  return jsonb_build_object(
    'puede_acceder', v_permiso_generico or v_es_jefe_efectivo,
    'permiso_generico', v_permiso_generico,
    'solicitudes', v_solicitudes
  );
end;
$$;

revoke all on function public.listar_solicitudes_rrhh_pendientes_aprobacion(text) from public, anon;
grant execute on function public.listar_solicitudes_rrhh_pendientes_aprobacion(text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
