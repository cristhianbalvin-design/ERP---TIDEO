-- Una ficha de personal y la asignación principal del usuario representan la
-- misma posición cuando la ficha está vinculada a una cuenta. Hasta ahora la
-- ficha sólo escribía personal_*.posicion_id y el navegador intentaba, en una
-- segunda llamada, mover posiciones_usuarios. Ese segundo paso podía omitirse
-- o fallar, dejando Usuarios y Organigrama en la posición anterior.

create or replace function public.sincronizar_posicion_ficha_usuario(
  p_empresa_id text,
  p_user_id uuid,
  p_posicion_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asignacion_id uuid;
  v_rol_id text;
  v_categoria text;
  v_nivel text;
  v_posicion_anterior_id uuid;
begin
  if p_empresa_id is null or p_user_id is null then
    return;
  end if;

  -- Sólo las cuentas activas del tenant se proyectan al módulo Usuarios y al
  -- organigrama. Una ficha sin acceso al ERP conserva su posición laboral.
  if not exists (
    select 1
    from public.usuarios_empresas ue
    where ue.empresa_id = p_empresa_id
      and ue.user_id = p_user_id
      and ue.estado = 'activo'
  ) then
    return;
  end if;

  select ua.id
    into v_asignacion_id
  from public.usuarios_asignaciones ua
  where ua.empresa_id = p_empresa_id
    and ua.user_id = p_user_id
    and ua.principal = true
  order by ua.activo desc, ua.updated_at desc nulls last, ua.id
  limit 1;

  -- Dejar la ficha sin posición libera únicamente la posición principal;
  -- no altera asignaciones matriciales adicionales.
  if p_posicion_id is null then
    if v_asignacion_id is not null then
      select p.id
        into v_posicion_anterior_id
      from public.posiciones p
      where p.empresa_id = p_empresa_id
        and p.origen_asignacion_id = v_asignacion_id;

      if v_posicion_anterior_id is not null then
        update public.posiciones
        set origen_asignacion_id = null,
            updated_at = now()
        where id = v_posicion_anterior_id;

        update public.posiciones_usuarios
        set fecha_fin = current_date,
            updated_at = now()
        where empresa_id = p_empresa_id
          and posicion_id = v_posicion_anterior_id
          and user_id = p_user_id
          and fecha_fin is null;
      end if;
    end if;
    return;
  end if;

  -- La posición debe pertenecer al tenant y tener la configuración V2 que
  -- determina el rol de acceso. No se guarda una ficha que no pueda reflejarse
  -- de forma consistente en Usuarios.
  select cc.rol_id, r.categoria, r.nivel_jerarquico
    into v_rol_id, v_categoria, v_nivel
  from public.posiciones p
  join public.cargo_colocaciones cc
    on cc.id = p.cargo_colocacion_id
   and cc.empresa_id = p.empresa_id
  join public.roles r
    on r.id = cc.rol_id
   and r.empresa_id = p.empresa_id
   and r.activo = true
  where p.id = p_posicion_id
    and p.empresa_id = p_empresa_id;

  if v_rol_id is null then
    raise exception 'La posición % no tiene una configuración V2 activa para el tenant %.',
      p_posicion_id, p_empresa_id;
  end if;

  -- Esta RPC serializa el cambio, conserva el alcance societario existente,
  -- cierra la ocupación anterior y abre la nueva en la misma transacción.
  perform public.posicion_guardar_asignacion_principal(
    v_asignacion_id,
    p_empresa_id,
    p_user_id,
    v_rol_id,
    coalesce(v_categoria, 'otro'),
    coalesce(v_nivel, 'operativo'),
    p_posicion_id,
    null,
    null
  );
end;
$$;

revoke all on function public.sincronizar_posicion_ficha_usuario(text, uuid, uuid) from public;
revoke all on function public.sincronizar_posicion_ficha_usuario(text, uuid, uuid) from anon;
revoke all on function public.sincronizar_posicion_ficha_usuario(text, uuid, uuid) from authenticated;

create or replace function public.trg_fn_sincronizar_posicion_ficha_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE'
     and NEW.posicion_id is not distinct from OLD.posicion_id
     and NEW.auth_user_id is not distinct from OLD.auth_user_id then
    return null;
  end if;

  perform public.sincronizar_posicion_ficha_usuario(
    NEW.empresa_id,
    NEW.auth_user_id,
    NEW.posicion_id
  );

  return null;
end;
$$;

drop trigger if exists trg_personal_operativo_sincronizar_usuario_posicion on public.personal_operativo;
create trigger trg_personal_operativo_sincronizar_usuario_posicion
after insert or update of posicion_id, auth_user_id
on public.personal_operativo
for each row execute function public.trg_fn_sincronizar_posicion_ficha_usuario();

drop trigger if exists trg_personal_administrativo_sincronizar_usuario_posicion on public.personal_administrativo;
create trigger trg_personal_administrativo_sincronizar_usuario_posicion
after insert or update of posicion_id, auth_user_id
on public.personal_administrativo
for each row execute function public.trg_fn_sincronizar_posicion_ficha_usuario();

-- Reconciliación explícita para fichas guardadas antes de este trigger. No toca
-- fichas sin acceso activo ni asignaciones matriciales.
create or replace function public.reconciliar_posiciones_fichas_usuario(p_empresa_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ficha record;
  v_total integer := 0;
begin
  for v_ficha in
    select x.auth_user_id, x.posicion_id
    from (
      select po.auth_user_id, po.posicion_id
      from public.personal_operativo po
      where po.empresa_id = p_empresa_id
        and po.auth_user_id is not null
        and po.posicion_id is not null
        and public.personal_posicion_esta_activa(po.estado, po.estado_laboral)
      union
      select pa.auth_user_id, pa.posicion_id
      from public.personal_administrativo pa
      where pa.empresa_id = p_empresa_id
        and pa.auth_user_id is not null
        and pa.posicion_id is not null
        and public.personal_posicion_esta_activa(pa.estado, pa.estado_laboral)
    ) x
    where exists (
      select 1
      from public.usuarios_empresas ue
      where ue.empresa_id = p_empresa_id
        and ue.user_id = x.auth_user_id
        and ue.estado = 'activo'
    )
      and not exists (
        select 1
        from public.usuarios_asignaciones ua
        join public.posiciones p on p.origen_asignacion_id = ua.id
        where ua.empresa_id = p_empresa_id
          and ua.user_id = x.auth_user_id
          and ua.principal = true
          and ua.activo = true
          and p.id = x.posicion_id
      )
  loop
    perform public.sincronizar_posicion_ficha_usuario(
      p_empresa_id,
      v_ficha.auth_user_id,
      v_ficha.posicion_id
    );
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.reconciliar_posiciones_fichas_usuario(text) from public;
revoke all on function public.reconciliar_posiciones_fichas_usuario(text) from anon;
revoke all on function public.reconciliar_posiciones_fichas_usuario(text) from authenticated;
grant execute on function public.reconciliar_posiciones_fichas_usuario(text) to service_role;

select pg_notify('pgrst', 'reload schema');
