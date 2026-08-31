-- TIDEO ERP - Aseguramiento server-side de transiciones de solicitudes RRHH.
-- Las transiciones de estado dejan de aceptar UPDATE directo desde el cliente.

begin;

alter table public.solicitudes_rrhh_historial
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists actor_nombre text,
  add column if not exists via_autorizacion text,
  add column if not exists jefe_efectivo_user_id uuid references auth.users(id) on delete set null,
  add column if not exists jefe_efectivo_nombre text;

alter table public.solicitudes_rrhh_historial
  drop constraint if exists solicitudes_rrhh_historial_via_autorizacion_check;

alter table public.solicitudes_rrhh_historial
  add constraint solicitudes_rrhh_historial_via_autorizacion_check
  check (
    via_autorizacion is null
    or via_autorizacion in ('jefe_efectivo', 'permiso_aprobar', 'solicitante', 'creacion', 'sistema')
  );

-- Devuelve el auth user id del jefe vigente. En organigrama v2 no mezcla
-- jerarquia legacy: una posicion V2 sin jefe ocupante devuelve NULL.
create or replace function public.resolver_jefe_efectivo(
  p_empresa_id text,
  p_personal_id text,
  p_personal_tipo text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_auth_user_id uuid;
  v_supervisor_id text;
  v_v2_habilitado boolean := false;
  v_tiene_posicion_v2 boolean := false;
  v_jefe_v2_id uuid;
  v_supervisor_auth_id uuid;
begin
  if p_personal_tipo not in ('operativo', 'administrativo') then
    raise exception 'PERSONAL_TIPO_INVALIDO: personal_tipo debe ser operativo o administrativo.';
  end if;

  if p_personal_tipo = 'operativo' then
    select po.auth_user_id, po.supervisor_id::text
      into v_auth_user_id, v_supervisor_id
      from public.personal_operativo po
     where po.empresa_id = p_empresa_id and po.id = p_personal_id;
  else
    select pa.auth_user_id, pa.supervisor_id::text
      into v_auth_user_id, v_supervisor_id
      from public.personal_administrativo pa
     where pa.empresa_id = p_empresa_id and pa.id = p_personal_id;
  end if;

  if not found then
    raise exception 'PERSONAL_HUERFANO: no existe la ficha % (%) en esta empresa.', p_personal_id, p_personal_tipo;
  end if;

  select coalesce(e.organigrama_v2_habilitado, false)
    into v_v2_habilitado
    from public.empresas e
   where e.id = p_empresa_id;

  if not found then
    raise exception 'EMPRESA_NO_ENCONTRADA: empresa % no existe.', p_empresa_id;
  end if;

  if v_v2_habilitado and v_auth_user_id is not null then
    select exists (
      select 1
        from public.usuarios_asignaciones ua
        join public.posiciones p on p.origen_asignacion_id = ua.id
        join public.posiciones_usuarios pu
          on pu.posicion_id = p.id
         and pu.user_id = v_auth_user_id
         and pu.fecha_fin is null
       where ua.empresa_id = p_empresa_id
         and ua.user_id = v_auth_user_id
         and ua.principal = true
         and ua.activo = true
         and p.empresa_id = p_empresa_id
         and p.cargo_colocacion_id is not null
    ) into v_tiene_posicion_v2;

    if v_tiene_posicion_v2 then
      select ua.jefe_user_id
        into v_jefe_v2_id
        from public.usuarios_asignaciones ua
       where ua.empresa_id = p_empresa_id
         and ua.user_id = v_auth_user_id
         and ua.principal = true
         and ua.activo = true
       limit 1;
      return v_jefe_v2_id;
    end if;
  end if;

  if v_supervisor_id is not null then
    select p.auth_user_id
      into v_supervisor_auth_id
      from (
        select id, empresa_id, auth_user_id from public.personal_operativo
        union all
        select id, empresa_id, auth_user_id from public.personal_administrativo
      ) p
     where p.empresa_id = p_empresa_id
       and p.id::text = v_supervisor_id
       and p.auth_user_id is not null
     limit 1;

    if v_supervisor_auth_id is not null then
      return v_supervisor_auth_id;
    end if;
  end if;

  return null;
end;
$$;

-- El trigger conserva el historial append-only y toma metadatos fijados por
-- la RPC dentro de la misma transaccion. No son datos aceptados del cliente.
create or replace function public.trg_solicitudes_rrhh_historial()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_actor_user_id uuid;
  v_actor_nombre text;
  v_via text;
  v_jefe_user_id uuid;
  v_jefe_nombre text;
  v_comentario text;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.estado is distinct from new.estado) then
    begin
      v_actor_user_id := nullif(current_setting('app.solicitudes_rrhh_actor_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_actor_user_id := null;
    end;
    begin
      v_jefe_user_id := nullif(current_setting('app.solicitudes_rrhh_jefe_efectivo_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_jefe_user_id := null;
    end;

    v_actor_nombre := nullif(current_setting('app.solicitudes_rrhh_actor_nombre', true), '');
    v_via := nullif(current_setting('app.solicitudes_rrhh_via_autorizacion', true), '');
    v_jefe_nombre := nullif(current_setting('app.solicitudes_rrhh_jefe_efectivo_nombre', true), '');
    v_comentario := nullif(current_setting('app.solicitudes_rrhh_comentario', true), '');

    insert into public.solicitudes_rrhh_historial (
      solicitud_id, empresa_id, estado_desde, estado_hasta, comentario,
      usuario, actor_user_id, actor_nombre, via_autorizacion,
      jefe_efectivo_user_id, jefe_efectivo_nombre, creado_en
    ) values (
      new.id, new.empresa_id,
      case when tg_op = 'UPDATE' then old.estado else null end,
      new.estado, v_comentario,
      coalesce(v_actor_nombre, v_actor_user_id::text),
      v_actor_user_id, v_actor_nombre, v_via,
      v_jefe_user_id, v_jefe_nombre, now()
    );
  end if;
  return new;
end;
$$;

create or replace function public.aprobar_solicitud_rrhh(
  p_solicitud_id uuid,
  p_empresa_id text,
  p_accion text,
  p_comentario text default null
)
returns public.solicitudes_rrhh
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_solicitud public.solicitudes_rrhh%rowtype;
  v_resultado public.solicitudes_rrhh%rowtype;
  v_estado_esperado text;
  v_jefe_efectivo_id uuid;
  v_jefe_efectivo_nombre text;
  v_actor_nombre text;
  v_tiene_permiso boolean := false;
  v_es_solicitante boolean := false;
  v_via_autorizacion text;
  v_multisociedad boolean := false;
  v_sociedad_id uuid;
  v_dias_licencia_empresa integer := 20;
  v_impacto_nomina text := 'sin_impacto';
  v_dias_a_descontar integer := 0;
  v_numero_correlativo text;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if v_actor_id is null then
    raise exception 'NO_AUTENTICADO: inicia sesion para procesar solicitudes RRHH.';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'NO_AUTORIZADO: no perteneces a esta empresa.';
  end if;

  if p_accion not in ('aprobar_jefe', 'confirmar_rrhh', 'rechazar_jefe', 'rechazar_rrhh', 'anular') then
    raise exception 'ACCION_INVALIDA: accion no permitida.';
  end if;

  select *
    into v_solicitud
    from public.solicitudes_rrhh sr
   where sr.id = p_solicitud_id
     and sr.empresa_id = p_empresa_id
   for update;

  if not found then
    raise exception 'SOLICITUD_NO_ENCONTRADA: la solicitud no existe en esta empresa.';
  end if;

  v_estado_esperado := case p_accion
    when 'aprobar_jefe' then 'enviada'
    when 'rechazar_jefe' then 'enviada'
    when 'confirmar_rrhh' then 'aprobada_jefe'
    when 'rechazar_rrhh' then 'aprobada_jefe'
    else null
  end;

  if p_accion = 'anular' then
    if v_solicitud.estado = 'anulada' then
      raise exception 'SOLICITUD_ESTADO_INVALIDO: la solicitud ya esta anulada.';
    end if;
  elsif v_solicitud.estado is distinct from v_estado_esperado then
    raise exception 'SOLICITUD_ESTADO_INVALIDO: % requiere estado %, estado actual %.',
      p_accion, v_estado_esperado, v_solicitud.estado;
  end if;

  v_jefe_efectivo_id := public.resolver_jefe_efectivo(
    p_empresa_id,
    v_solicitud.personal_id,
    v_solicitud.personal_tipo
  );
  v_tiene_permiso := public.usuario_puede(p_empresa_id, 'solicitudes_rrhh', 'aprobar');
  v_es_solicitante := v_solicitud.creado_por = v_actor_id
    or exists (
      select 1 from public.personal_operativo po
       where po.empresa_id = p_empresa_id
         and po.id = v_solicitud.personal_id
         and po.auth_user_id = v_actor_id
      union all
      select 1 from public.personal_administrativo pa
       where pa.empresa_id = p_empresa_id
         and pa.id = v_solicitud.personal_id
         and pa.auth_user_id = v_actor_id
    );

  if v_actor_id = v_jefe_efectivo_id then
    v_via_autorizacion := 'jefe_efectivo';
  elsif v_tiene_permiso then
    v_via_autorizacion := 'permiso_aprobar';
  elsif p_accion = 'anular' and v_es_solicitante then
    v_via_autorizacion := 'solicitante';
  else
    select p.nombre
      into v_jefe_efectivo_nombre
      from (
        select empresa_id, auth_user_id, nombre from public.personal_operativo
        union all
        select empresa_id, auth_user_id, nombre from public.personal_administrativo
      ) p
     where p.empresa_id = p_empresa_id and p.auth_user_id = v_jefe_efectivo_id
     limit 1;
    raise exception 'NO_AUTORIZADO: solo el jefe efectivo % o un usuario con permiso de aprobacion puede procesar esta solicitud.',
      coalesce(v_jefe_efectivo_nombre, 'asignado');
  end if;

  select coalesce(po.nombre, pa.nombre, au.email, v_actor_id::text)
    into v_actor_nombre
    from auth.users au
    left join public.personal_operativo po
      on po.empresa_id = p_empresa_id and po.auth_user_id = v_actor_id
    left join public.personal_administrativo pa
      on pa.empresa_id = p_empresa_id and pa.auth_user_id = v_actor_id
   where au.id = v_actor_id
   limit 1;

  select p.nombre
    into v_jefe_efectivo_nombre
    from (
      select empresa_id, auth_user_id, nombre from public.personal_operativo
      union all
      select empresa_id, auth_user_id, nombre from public.personal_administrativo
    ) p
   where p.empresa_id = p_empresa_id and p.auth_user_id = v_jefe_efectivo_id
   limit 1;

  perform set_config('app.solicitudes_rrhh_actor_id', v_actor_id::text, true);
  perform set_config('app.solicitudes_rrhh_actor_nombre', coalesce(v_actor_nombre, v_actor_id::text), true);
  perform set_config('app.solicitudes_rrhh_via_autorizacion', v_via_autorizacion, true);
  perform set_config('app.solicitudes_rrhh_jefe_efectivo_id', coalesce(v_jefe_efectivo_id::text, ''), true);
  perform set_config('app.solicitudes_rrhh_jefe_efectivo_nombre', coalesce(v_jefe_efectivo_nombre, ''), true);
  perform set_config('app.solicitudes_rrhh_comentario', coalesce(v_comentario, ''), true);

  if p_accion in ('rechazar_jefe', 'rechazar_rrhh', 'anular') and v_comentario is null then
    raise exception 'COMENTARIO_OBLIGATORIO: indica el motivo de la accion.';
  end if;

  if p_accion = 'aprobar_jefe' then
    update public.solicitudes_rrhh
       set estado = 'aprobada_jefe',
           comentario_jefe = v_comentario,
           fecha_aprobacion_jefe = now()
     where id = v_solicitud.id
     returning * into v_resultado;

  elsif p_accion = 'rechazar_jefe' then
    update public.solicitudes_rrhh
       set estado = 'rechazada_jefe',
           comentario_jefe = v_comentario
     where id = v_solicitud.id
     returning * into v_resultado;

  elsif p_accion = 'confirmar_rrhh' then
    select coalesce(e.multisociedad_habilitado, false)
      into v_multisociedad
      from public.empresas e
     where e.id = p_empresa_id;

    if v_multisociedad then
      if v_solicitud.sociedad_id is null then
        raise exception 'SOCIEDAD_REQUERIDA: la solicitud no tiene sociedad persistida.';
      end if;
      if not exists (
        select 1 from public.sociedades s
         where s.id = v_solicitud.sociedad_id
           and s.empresa_id = p_empresa_id
           and s.activa = true
      ) then
        raise exception 'SOCIEDAD_INVALIDA: la sociedad de la solicitud no esta activa en este tenant.';
      end if;
      v_sociedad_id := v_solicitud.sociedad_id;
    end if;

    select coalesce((
      select c.dias_licencia_empresa
        from public.rrhh_config_ausencias c
       where c.empresa_id = p_empresa_id
    ), 20) into v_dias_licencia_empresa;

    if v_solicitud.clasificacion_pago = 'no_remunerado' then
      v_impacto_nomina := 'descuento_total';
      v_dias_a_descontar := coalesce(v_solicitud.dias_habiles, 0);
    elsif v_solicitud.clasificacion_pago = 'remunerado' then
      v_impacto_nomina := 'sin_descuento';
      v_dias_a_descontar := 0;
    elsif v_solicitud.tipo in ('vacaciones', 'permiso_con_goce', 'comision_trabajo') then
      v_impacto_nomina := 'sin_descuento';
      v_dias_a_descontar := 0;
    elsif v_solicitud.tipo = 'permiso_sin_goce' then
      v_impacto_nomina := 'descuento_total';
      v_dias_a_descontar := coalesce(v_solicitud.dias_habiles, 0);
    elsif v_solicitud.tipo = 'licencia_medica' then
      v_impacto_nomina := 'descuento_parcial';
      v_dias_a_descontar := greatest(0, coalesce(v_solicitud.dias_habiles, 0) - v_dias_licencia_empresa);
    elsif v_solicitud.tipo = 'bajada' then
      v_impacto_nomina := 'sin_impacto';
      v_dias_a_descontar := 0;
    else
      v_impacto_nomina := 'sin_impacto';
      v_dias_a_descontar := 0;
    end if;

    v_numero_correlativo := coalesce(
      v_solicitud.numero_correlativo,
      public.siguiente_correlativo_papeleta_movimiento(p_empresa_id, v_sociedad_id)
    );

    update public.solicitudes_rrhh
       set estado = 'confirmada_rrhh',
           comentario_rrhh = v_comentario,
           fecha_confirmacion = now(),
           confirmado_por = v_actor_id::text,
           impacto_nomina = v_impacto_nomina,
           dias_a_descontar = v_dias_a_descontar,
           numero_correlativo = v_numero_correlativo
     where id = v_solicitud.id
     returning * into v_resultado;

  elsif p_accion = 'rechazar_rrhh' then
    update public.solicitudes_rrhh
       set estado = 'rechazada_rrhh',
           comentario_rrhh = v_comentario
     where id = v_solicitud.id
     returning * into v_resultado;

  else
    update public.solicitudes_rrhh
       set estado = 'anulada',
           motivo_anulacion = v_comentario
     where id = v_solicitud.id
     returning * into v_resultado;
  end if;

  return v_resultado;
end;
$$;

-- No queda via de UPDATE directo para alterar estados desde PostgREST.
drop policy if exists sol_rrhh_update on public.solicitudes_rrhh;
create policy sol_rrhh_update on public.solicitudes_rrhh
  for update using (false) with check (false);

revoke all on function public.resolver_jefe_efectivo(text, text, text) from public, anon;
revoke all on function public.aprobar_solicitud_rrhh(uuid, text, text, text) from public, anon;
grant execute on function public.resolver_jefe_efectivo(text, text, text) to authenticated, service_role;
grant execute on function public.aprobar_solicitud_rrhh(uuid, text, text, text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
