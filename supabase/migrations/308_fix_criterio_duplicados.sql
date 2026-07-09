-- TIDEO ERP - Corrige el CRITERIO de agrupamiento de consolidar_posiciones_duplicadas (305,
-- parchado por 307 solo para la ambiguedad de posicion_id).
--
-- Verificacion manual (cruzando el reporte de 307 contra la tabla posiciones) encontro que el
-- criterio anterior (misma unidad + mismo cargo + mismo reporta_a_posicion_id, sin mirar
-- ocupantes) es incorrecto en dos direcciones a la vez:
--   - Falsos positivos masivos: cuando cargo_id es null (muy comun -- todavia hay posiciones sin
--     cargo asignado), CUALQUIER par de personas DISTINTAS en la misma unidad con el mismo jefe
--     se reportaba como "duplicado", aunque son headcount real y nunca hubo un cargo marcado
--     'compartido' que lo justificara (no se puede marcar: cargo_id es null). Ejemplo real
--     verificado: DIFESMAQ grupo 1 uniia a PARADO MEZA, RUIZ ESCOBEDO YUDY y Karyme Arellano --
--     3 personas distintas, no un duplicado.
--   - Falsos negativos: los duplicados REALES (mismo user_id con 2+ posiciones activas, el
--     patron exacto que origino este trabajo) casi nunca comparten unidad Y jefe identicos entre
--     sus filas clon, porque el trigger legado (ya corregido en 304) las creaba con resoluciones
--     ligeramente distintas. Ejemplo real verificado: VARONA GIRON FRANCO RENZO en DIFESMAQ tiene
--     2 posiciones activas con reporta_a_posicion_id DISTINTO entre si -- el criterio anterior
--     jamas las agrupaba.
--
-- Nuevo criterio, en 3 casos mutuamente excluyentes segun cargos_empresa.modo_gestion:
--
--   1. Cargo 'compartido': duplicado = 2+ posiciones (activas o vacantes, no importa) con la
--      misma unidad + mismo cargo + mismo jefe. Se fusionan automaticamente en dry_run=false.
--      Sobrevive la que tenga mas historial de ocupacion (empate: la mas antigua).
--
--   2. Cargo 'individual' o sin cargo (cargo_id null), CON ocupante activo: duplicado = el mismo
--      user_id tiene 2+ posiciones activas simultaneas en el tenant, sin importar si difieren en
--      unidad o jefe (ese es justamente el patron del bug). Se fusionan automaticamente en
--      dry_run=false. Sobrevive la que tenga mas historial (empate: la mas antigua).
--
--   3. Cargo 'individual' o sin cargo, SIN ocupante (vacantes): duplicado potencial = 2+
--      posiciones vacantes con unidad + cargo + jefe identicos. NUNCA se fusionan por esta
--      funcion, ni siquiera en dry_run=false -- solo se listan (accion='revisar_manual_vacante')
--      con su fecha_creacion, para que Cristhian decida a mano si son clones accidentales o
--      vacantes reales creadas en momentos distintos.
--
-- Un grupo de personas DISTINTAS ocupando posiciones distintas (ni caso 1, ni caso 2, ni caso 3)
-- ya NO aparece en el reporte en absoluto -- no es un duplicado bajo ningun caso.
--
-- Se agrega la columna fecha_creacion (created_at de la posicion) a TODAS las filas del reporte,
-- no solo al caso 3, por consistencia.
--
-- El helper _consolidar_posiciones_mover() factoriza la logica de fusion (cerrar colision activa,
-- mover posiciones_usuarios preservando fechas, reapuntar reporta_a_posicion_id/
-- responsable_posicion_id, eliminar la posicion perdedora) para no duplicarla entre el caso 1 y
-- el caso 2 -- es la misma logica que ya tenia 305/307, ahora reutilizable.
--
-- No se toca consolidar_posiciones_duplicadas_todos_tenants (306): sigue haciendo
-- "select * from consolidar_posiciones_duplicadas(...)" y accede a las columnas por nombre, asi
-- que la columna nueva (fecha_creacion) no le afecta. Tampoco se toca el fix de ambiguedad (307)
-- -- esta migracion ya parte de esa version corregida.
--
-- CREATE OR REPLACE no permite cambiar la lista de columnas de salida de una funcion
-- RETURNS TABLE, asi que hace falta DROP + CREATE.

drop function if exists public.consolidar_posiciones_duplicadas(text, boolean);

create or replace function public._consolidar_posiciones_mover(p_origen uuid, p_destino uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cierra ocupaciones activas del origen que colisionarian con una ocupacion activa del mismo
  -- usuario ya presente en el destino (antes de mover, para no violar el indice unico
  -- ux_posiciones_usuarios_activa).
  update public.posiciones_usuarios pu
  set fecha_fin = current_date, updated_at = now()
  where pu.posicion_id = p_origen
    and pu.fecha_fin is null
    and exists (
      select 1 from public.posiciones_usuarios s
      where s.posicion_id = p_destino and s.user_id = pu.user_id and s.fecha_fin is null
    );

  -- Mueve TODO lo que quede en el origen (historico cerrado + lo que no colisiona) hacia el
  -- destino, preservando fecha_inicio/fecha_fin -- ya no puede haber conflicto.
  update public.posiciones_usuarios pu
  set posicion_id = p_destino, updated_at = now()
  where pu.posicion_id = p_origen;

  -- Reapunta subordinados y responsables de unidad que apuntaban al origen.
  update public.posiciones
  set reporta_a_posicion_id = p_destino, updated_at = now()
  where reporta_a_posicion_id = p_origen;

  update public.unidades_organizacionales
  set responsable_posicion_id = p_destino, updated_at = now()
  where responsable_posicion_id = p_origen;

  delete from public.posiciones where id = p_origen;
end;
$$;

revoke execute on function public._consolidar_posiciones_mover(uuid, uuid) from public;

create or replace function public.consolidar_posiciones_duplicadas(
  p_empresa_id text,
  p_dry_run boolean default true
)
returns table (
  grupo int,
  unidad_nombre text,
  cargo_nombre text,
  posicion_id uuid,
  accion text,
  ocupantes_activos bigint,
  historico_ocupaciones bigint,
  fecha_creacion timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_grupo record;
  r_usuario record;
  v_pos_id uuid;
  v_survivor uuid;
  v_grupo_seq int := 0;
  v_posicion_ids uuid[];
  v_ya_procesadas uuid[] := '{}';
begin
  if p_empresa_id is null then
    raise exception 'p_empresa_id es obligatorio';
  end if;

  -- ── Caso 1: cargo 'compartido' -- duplicado = misma unidad+cargo+jefe, ocupacion irrelevante ──

  for r_grupo in
    select
      p.unidad_organizacional_id, p.cargo_id, p.reporta_a_posicion_id,
      array_agg(p.id order by
        (select count(*) from public.posiciones_usuarios pu2 where pu2.posicion_id = p.id) desc,
        p.created_at asc, p.id asc
      ) as posicion_ids
    from public.posiciones p
    join public.cargos_empresa c on c.id = p.cargo_id
    where p.empresa_id = p_empresa_id
      and c.modo_gestion = 'compartido'
    group by p.unidad_organizacional_id, p.cargo_id, p.reporta_a_posicion_id
    having count(*) > 1
  loop
    v_grupo_seq := v_grupo_seq + 1;
    v_survivor := r_grupo.posicion_ids[1];

    grupo := v_grupo_seq;
    unidad_nombre := (select nombre from public.unidades_organizacionales where id = r_grupo.unidad_organizacional_id);
    cargo_nombre := (select nombre from public.cargos_empresa where id = r_grupo.cargo_id);
    posicion_id := v_survivor;
    accion := 'compartido_sobrevive';
    ocupantes_activos := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_survivor and pu.fecha_fin is null);
    historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_survivor);
    fecha_creacion := (select created_at from public.posiciones where id = v_survivor);
    return next;

    foreach v_pos_id in array r_grupo.posicion_ids[2 : array_length(r_grupo.posicion_ids, 1)]
    loop
      grupo := v_grupo_seq;
      unidad_nombre := (select nombre from public.unidades_organizacionales where id = r_grupo.unidad_organizacional_id);
      cargo_nombre := (select nombre from public.cargos_empresa where id = r_grupo.cargo_id);
      posicion_id := v_pos_id;
      accion := case when p_dry_run then 'compartido_se_fusionaria' else 'compartido_fusionada' end;
      ocupantes_activos := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id and pu.fecha_fin is null);
      historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id);
      fecha_creacion := (select created_at from public.posiciones where id = v_pos_id);
      return next;

      if not p_dry_run then
        perform public._consolidar_posiciones_mover(v_pos_id, v_survivor);
      end if;
    end loop;
  end loop;

  -- ── Caso 2: cargo individual/sin cargo, CON ocupante -- duplicado = mismo user_id con 2+ ──
  -- ── posiciones activas, sin importar si difieren en unidad o jefe.                        ──

  for r_usuario in
    select pu.user_id
    from public.posiciones_usuarios pu
    join public.posiciones p on p.id = pu.posicion_id
    left join public.cargos_empresa c on c.id = p.cargo_id
    where p.empresa_id = p_empresa_id
      and pu.fecha_fin is null
      and (p.cargo_id is null or c.modo_gestion = 'individual')
      and not (p.id = any(v_ya_procesadas))
    group by pu.user_id
    having count(distinct p.id) > 1
  loop
    -- Recalculado en frio (no reutiliza el listado de arriba): v_ya_procesadas puede haber
    -- crecido desde que se armo el candidato de este usuario, si alguna de sus posiciones ya fue
    -- consumida por el cluster de OTRO usuario (caso raro: una posicion individual con mas de un
    -- ocupante activo antes de esta limpieza).
    select array_agg(x.id order by x.historial desc, x.created_at asc, x.id asc)
    into v_posicion_ids
    from (
      select distinct p.id, p.created_at,
        (select count(*) from public.posiciones_usuarios pu2 where pu2.posicion_id = p.id) as historial
      from public.posiciones_usuarios pu
      join public.posiciones p on p.id = pu.posicion_id
      left join public.cargos_empresa c on c.id = p.cargo_id
      where p.empresa_id = p_empresa_id
        and pu.user_id = r_usuario.user_id
        and pu.fecha_fin is null
        and (p.cargo_id is null or c.modo_gestion = 'individual')
        and not (p.id = any(v_ya_procesadas))
    ) x;

    if v_posicion_ids is null or array_length(v_posicion_ids, 1) < 2 then
      continue;
    end if;

    v_grupo_seq := v_grupo_seq + 1;
    v_survivor := v_posicion_ids[1];

    grupo := v_grupo_seq;
    unidad_nombre := (select uo.nombre from public.posiciones p join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id where p.id = v_survivor);
    cargo_nombre := (select c.nombre from public.posiciones p join public.cargos_empresa c on c.id = p.cargo_id where p.id = v_survivor);
    posicion_id := v_survivor;
    accion := 'mismo_usuario_sobrevive';
    ocupantes_activos := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_survivor and pu.fecha_fin is null);
    historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_survivor);
    fecha_creacion := (select created_at from public.posiciones where id = v_survivor);
    return next;

    v_ya_procesadas := array_append(v_ya_procesadas, v_survivor);

    foreach v_pos_id in array v_posicion_ids[2 : array_length(v_posicion_ids, 1)]
    loop
      grupo := v_grupo_seq;
      unidad_nombre := (select uo.nombre from public.posiciones p join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id where p.id = v_pos_id);
      cargo_nombre := (select c.nombre from public.posiciones p join public.cargos_empresa c on c.id = p.cargo_id where p.id = v_pos_id);
      posicion_id := v_pos_id;
      accion := case when p_dry_run then 'mismo_usuario_se_fusionaria' else 'mismo_usuario_fusionada' end;
      ocupantes_activos := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id and pu.fecha_fin is null);
      historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id);
      fecha_creacion := (select created_at from public.posiciones where id = v_pos_id);
      return next;

      v_ya_procesadas := array_append(v_ya_procesadas, v_pos_id);

      if not p_dry_run then
        perform public._consolidar_posiciones_mover(v_pos_id, v_survivor);
      end if;
    end loop;
  end loop;

  -- ── Caso 3: cargo individual/sin cargo, SIN ocupante -- posible duplicado de vacantes,     ──
  -- ── se lista para revision manual, jamas se fusiona por esta funcion (ni con dry_run=false).──

  for r_grupo in
    select
      p.unidad_organizacional_id, p.cargo_id, p.reporta_a_posicion_id,
      array_agg(p.id order by p.created_at asc, p.id asc) as posicion_ids
    from public.posiciones p
    left join public.cargos_empresa c on c.id = p.cargo_id
    where p.empresa_id = p_empresa_id
      and (p.cargo_id is null or c.modo_gestion = 'individual')
      and not exists (
        select 1 from public.posiciones_usuarios pu where pu.posicion_id = p.id and pu.fecha_fin is null
      )
    group by p.unidad_organizacional_id, p.cargo_id, p.reporta_a_posicion_id
    having count(*) > 1
  loop
    v_grupo_seq := v_grupo_seq + 1;

    foreach v_pos_id in array r_grupo.posicion_ids
    loop
      grupo := v_grupo_seq;
      unidad_nombre := (select nombre from public.unidades_organizacionales where id = r_grupo.unidad_organizacional_id);
      cargo_nombre := (select nombre from public.cargos_empresa where id = r_grupo.cargo_id);
      posicion_id := v_pos_id;
      accion := 'revisar_manual_vacante';
      ocupantes_activos := 0;
      historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id);
      fecha_creacion := (select created_at from public.posiciones where id = v_pos_id);
      return next;
    end loop;
  end loop;

  return;
end;
$$;

comment on function public.consolidar_posiciones_duplicadas(text, boolean) is
  'Reporta (p_dry_run=true, default) o aplica (p_dry_run=false) la fusion de Posiciones duplicadas de un tenant, en 3 casos segun cargos_empresa.modo_gestion: compartido_* (misma unidad+cargo+jefe, se fusiona), mismo_usuario_* (mismo user_id en 2+ posiciones activas, se fusiona sin importar unidad/jefe), revisar_manual_vacante (vacantes con unidad+cargo+jefe identicos, JAMAS se fusiona automaticamente). Ver cabecera de 308_fix_criterio_duplicados.sql para el detalle y el porque del cambio de criterio frente a 305/307.';

-- Mismo criterio que 305/306/307: herramienta de mantenimiento para el SQL editor de Supabase
-- (rol postgres, bypassa RLS), no se expone via PostgREST/anon.
revoke execute on function public.consolidar_posiciones_duplicadas(text, boolean) from public;

select pg_notify('pgrst', 'reload schema');
