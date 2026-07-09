-- TIDEO ERP - Fase 2: activar la jerarquia real (basada en posiciones) en RLS
--
-- Reemplaza el recorrido recursivo sobre usuarios_asignaciones.jefe_user_id por un
-- recorrido del arbol de posiciones (via reporta_a_posicion_id) en las 3 funciones que
-- hoy resuelven jerarquia:
--   - usuario_puede_ver_usuario   (usada por hr_admin_read_hierarchy y, en cascada, por
--                                  usuario_puede_ver_registro: leads, oportunidades,
--                                  cotizaciones, cuentas, partes_diarios, hojas_costeo,
--                                  acuerdo_comision_historial)
--   - usuario_alcance_jerarquico  (hoy no la usa ninguna policy; se actualiza igual por
--                                  consistencia, sin riesgo)
--   - usuario_puede_aprobar_hoja_costeo (CTE paralelo propio, mismo cambio)
--
-- Ninguna policy RLS cambia de nombre ni de definicion: como las 3 funciones mantienen su
-- firma exacta, el CREATE OR REPLACE alcanza para que todas las policies que ya las llaman
-- adopten el nuevo comportamiento.
--
-- Incluye ademas el trigger de sincronizacion (sync completo) que mantiene posiciones al
-- dia mientras usuarios_asignaciones siga siendo el unico punto de edicion de jerarquia
-- (hasta que exista la UI de la Fase 3): altas nuevas crean posicion, cambios de jefe
-- actualizan reporta_a_posicion_id, bajas cierran la ocupacion.

-- ─── Helpers reutilizados por el trigger de sincronizacion ───────────────────

create or replace function public.resolver_unidad_organizacional(p_empresa_id text, p_categoria text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uo_id text;
  v_seq int;
begin
  select id into v_uo_id
  from public.unidades_organizacionales
  where empresa_id = p_empresa_id
    and lower(trim(nombre)) = lower(trim(p_categoria));

  if v_uo_id is not null then
    return v_uo_id;
  end if;

  select coalesce(max(
    case when codigo ~ '^UO-[0-9]+$'
    then (regexp_match(codigo, '([0-9]+)$'))[1]::int
    else 0 end
  ), 0) + 1 into v_seq
  from public.unidades_organizacionales
  where empresa_id = p_empresa_id;

  v_uo_id := 'uo_' || left(replace(gen_random_uuid()::text, '-', ''), 18);

  insert into public.unidades_organizacionales(id, empresa_id, codigo, nombre, estado)
  values (v_uo_id, p_empresa_id, 'UO-' || lpad(v_seq::text, 3, '0'), p_categoria, 'activo');

  return v_uo_id;
end;
$$;

create or replace function public.resolver_posicion_principal_jefe(p_empresa_id text, p_jefe_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.usuarios_asignaciones jefe_ua
  join public.posiciones p on p.origen_asignacion_id = jefe_ua.id
  where jefe_ua.user_id = p_jefe_user_id
    and jefe_ua.empresa_id = p_empresa_id
    and jefe_ua.principal = true
    and jefe_ua.activo = true
  limit 1;
$$;

-- ─── Trigger de sincronizacion: usuarios_asignaciones -> posiciones ──────────

create or replace function public.sincronizar_posicion_desde_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uo_id text;
  v_jefe_pos_id uuid;
  v_pos_id uuid;
begin
  if new.activo = false then
    update public.posiciones_usuarios pu
    set fecha_fin = current_date, updated_at = now()
    from public.posiciones p
    where p.id = pu.posicion_id
      and p.origen_asignacion_id = new.id
      and pu.fecha_fin is null;
    return new;
  end if;

  select id into v_pos_id from public.posiciones where origen_asignacion_id = new.id;
  v_uo_id := public.resolver_unidad_organizacional(new.empresa_id, new.categoria);
  v_jefe_pos_id := case when new.jefe_user_id is not null
    then public.resolver_posicion_principal_jefe(new.empresa_id, new.jefe_user_id)
    else null end;

  if v_pos_id is not null then
    update public.posiciones
    set unidad_organizacional_id = v_uo_id,
        reporta_a_posicion_id = v_jefe_pos_id,
        updated_at = now()
    where id = v_pos_id
      and (
        unidad_organizacional_id is distinct from v_uo_id
        or reporta_a_posicion_id is distinct from v_jefe_pos_id
      );

    if not exists (
      select 1 from public.posiciones_usuarios
      where posicion_id = v_pos_id and user_id = new.user_id and fecha_fin is null
    ) then
      insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
      values (new.empresa_id, v_pos_id, new.user_id, current_date);
    end if;

    return new;
  end if;

  insert into public.posiciones(empresa_id, unidad_organizacional_id, reporta_a_posicion_id, origen_asignacion_id)
  values (new.empresa_id, v_uo_id, v_jefe_pos_id, new.id)
  returning id into v_pos_id;

  insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
  values (new.empresa_id, v_pos_id, new.user_id, current_date);

  return new;
end;
$$;

drop trigger if exists trg_usuarios_asignaciones_sync_posicion on public.usuarios_asignaciones;
create trigger trg_usuarios_asignaciones_sync_posicion
after insert or update of activo, jefe_user_id, categoria
on public.usuarios_asignaciones
for each row execute function public.sincronizar_posicion_desde_asignacion();

-- ─── usuario_puede_ver_usuario: recorre posiciones en vez de jefe_user_id ────

create or replace function public.usuario_puede_ver_usuario(
  target_empresa_id text,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive posiciones_raiz as (
    select p.id
    from public.posiciones p
    join public.posiciones_usuarios pu on pu.posicion_id = p.id
    where pu.user_id = auth.uid()
      and pu.fecha_fin is null
      and p.empresa_id = target_empresa_id
  ),
  arbol as (
    select id from posiciones_raiz
    union
    select p.id
    from public.posiciones p
    join arbol a on p.reporta_a_posicion_id = a.id
    where p.empresa_id = target_empresa_id
  )
  select public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_asignaciones caller
      join public.roles r on r.id = caller.rol_id
      where caller.user_id = auth.uid()
        and caller.empresa_id = target_empresa_id
        and caller.activo = true
        and (
          r.es_superadmin = true
          or r.es_admin_empresa = true
          or caller.nivel_jerarquico = 'direccion'
          or target_user_id = auth.uid()
          or (
            caller.nivel_jerarquico in ('jefatura', 'supervisor')
            and exists (
              select 1
              from public.posiciones_usuarios pu
              where pu.posicion_id in (select id from arbol)
                and pu.fecha_fin is null
                and pu.user_id = target_user_id
            )
          )
        )
    );
$$;

-- ─── usuario_alcance_jerarquico: 'equipo' pasa a significar "tiene subordinados
--     reales en el arbol de posiciones", no solo un rol con nivel_jerarquico alto ───

create or replace function public.usuario_alcance_jerarquico(target_empresa_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.usuarios_asignaciones ua
      join public.roles r on r.id = ua.rol_id
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and (r.es_superadmin = true or r.es_admin_empresa = true or ua.nivel_jerarquico = 'direccion')
    ) then 'tenant'
    when exists (
      select 1
      from public.posiciones_usuarios mi_pu
      join public.posiciones mi_p on mi_p.id = mi_pu.posicion_id
      join public.posiciones sub_p on sub_p.reporta_a_posicion_id = mi_p.id
      join public.posiciones_usuarios sub_pu on sub_pu.posicion_id = sub_p.id and sub_pu.fecha_fin is null
      where mi_pu.user_id = auth.uid()
        and mi_pu.fecha_fin is null
        and mi_p.empresa_id = target_empresa_id
    ) then 'equipo'
    else 'propio'
  end;
$$;

-- ─── usuario_puede_aprobar_hoja_costeo: mismo cambio de arbol ────────────────

create or replace function public.usuario_puede_aprobar_hoja_costeo(
  target_empresa_id text,
  target_owner_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive posiciones_raiz as (
    select p.id
    from public.posiciones p
    join public.posiciones_usuarios pu on pu.posicion_id = p.id
    where pu.user_id = auth.uid()
      and pu.fecha_fin is null
      and p.empresa_id = target_empresa_id
  ),
  arbol as (
    select id from posiciones_raiz
    union
    select p.id
    from public.posiciones p
    join arbol a on p.reporta_a_posicion_id = a.id
    where p.empresa_id = target_empresa_id
  )
  select public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_empresas ue
      join public.roles r on r.id = ue.rol_id
      where ue.user_id = auth.uid()
        and ue.empresa_id = target_empresa_id
        and ue.estado = 'activo'
        and (r.es_superadmin = true or r.es_admin_empresa = true)
    )
    or exists (
      select 1
      from public.usuarios_asignaciones ua
      join public.roles r on r.id = ua.rol_id
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and public.usuario_puede(target_empresa_id, 'hoja_costeo', 'aprobar')
        and (
          r.es_superadmin = true
          or r.es_admin_empresa = true
          or ua.nivel_jerarquico = 'direccion'
          or (
            target_owner_user_id is not null
            and target_owner_user_id <> auth.uid()
            and ua.nivel_jerarquico in ('jefatura', 'supervisor')
            and exists (
              select 1
              from public.posiciones_usuarios pu
              where pu.posicion_id in (select id from arbol)
                and pu.fecha_fin is null
                and pu.user_id = target_owner_user_id
            )
          )
        )
    );
$$;

select pg_notify('pgrst', 'reload schema');
