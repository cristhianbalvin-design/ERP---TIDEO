-- TIDEO ERP - Corrige la regla de seleccion de "sobreviviente" en consolidar_posiciones_duplicadas
-- (305/307/308) para que no rompa la visibilidad en el Organigrama.
--
-- Diagnostico previo (turno anterior, solo lectura): el Organigrama solo renderiza una posicion
-- ocupada si al menos uno de sus ocupantes tiene esPosicionPrincipal = true, lo cual depende de
-- que posiciones.origen_asignacion_id apunte a la fila de usuarios_asignaciones con
-- principal = true de esa persona (ver construirUsuariosConPosiciones en context.jsx:89 y
-- esPosicionVisible en pages_admin.jsx:11048-11051).
--
-- La regla de sobreviviente de 308 (mas historial, empate -> mas antigua, empate -> id menor) no
-- tiene ninguna relacion con ese vinculo. Se verifico contra los 14 casos reales de "mismo_usuario"
-- detectados en produccion: 12 de las 14 personas SI tienen hoy una posicion con el vinculo
-- principal (por eso son visibles ahora), pero la regla vieja solo la habria conservado como
-- sobreviviente en 5 de esos 12 -- en los otros 7 (Karyme Arellano y RUIZ ESCOBEDO YUDY y VARONA
-- GIRON FRANCO RENZO en DIFESMAQ, Nestor Jose Loayza Mendieta en INGETEC, Carlos Gonzales y
-- Lucero Martinez en PRUEBA, Karyme Arellano en TIDEO SAC) la posicion con el vinculo habria sido
-- la ELIMINADA, dejando a esas 7 personas invisibles en su Organigrama justo por correr la
-- consolidacion que se supone iba a arreglar la causa raiz del problema.
--
-- Fix: agrega un criterio de orden NUEVO, de mayor prioridad que todos los anteriores, en el
-- array_agg(...) que arma el orden de sobreviviente/perdedoras tanto del caso 1 (compartido) como
-- del caso 2 (mismo_usuario): si una posicion candidata tiene origen_asignacion_id que apunta a
-- una fila de usuarios_asignaciones con principal = true, esa gana SIEMPRE como sobreviviente,
-- sin importar su historial ni su antiguedad. El criterio de principal replica exactamente el que
-- ya usa el frontend (construirUsuariosConPosiciones: Boolean(asignacionOrigen?.principal), sin
-- filtrar por activo) para que "seria sobreviviente" y "es visible en el Organigrama" coincidan
-- siempre que exista una candidata con ese vinculo.
--
-- Los casos donde NINGUNA candidata tiene el vinculo (Camilo y Karyme Arellano en ZAHORY: su
-- asignacion principal real nunca quedo enlazada a ninguna posicion, un problema de backfill
-- distinto y anterior a la duplicacion) NO se resuelven con este fix -- ahi no hay ninguna
-- candidata "correcta" entre la cual elegir. Siguen igual que antes: la consolidacion no los
-- arregla ni los empeora. Su reconciliacion (vincular origen_asignacion_id de la sobreviviente a
-- esa asignacion principal huerfana) queda fuera de este alcance, a definir aparte.
--
-- No se toca la firma de la funcion (mismos parametros, misma tabla de salida) -- solo cambia el
-- ORDER BY interno de los array_agg. No se toca el caso 3 (revisar_manual_vacante, sin concepto
-- de sobreviviente), ni el helper _consolidar_posiciones_mover, ni 306, ni 307.

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
  -- Orden de sobreviviente: 1) tiene vinculo principal, 2) mas historial, 3) mas antigua, 4) id.

  for r_grupo in
    select
      p.unidad_organizacional_id, p.cargo_id, p.reporta_a_posicion_id,
      array_agg(p.id order by
        exists (
          select 1 from public.usuarios_asignaciones ua
          where ua.id = p.origen_asignacion_id and ua.principal = true
        ) desc,
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

  -- ── Caso 2: cargo individual/sin cargo, CON ocupante -- duplicado = mismo user_id con 2+     ──
  -- ── posiciones activas, sin importar si difieren en unidad o jefe.                          ──
  -- Mismo orden de sobreviviente que el caso 1: vinculo principal primero.

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
    select array_agg(x.id order by x.es_principal desc, x.historial desc, x.created_at asc, x.id asc)
    into v_posicion_ids
    from (
      select distinct p.id, p.created_at,
        (select count(*) from public.posiciones_usuarios pu2 where pu2.posicion_id = p.id) as historial,
        exists (
          select 1 from public.usuarios_asignaciones ua
          where ua.id = p.origen_asignacion_id and ua.principal = true
        ) as es_principal
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
  -- Sin cambios frente a 308: no hay concepto de sobreviviente aqui.

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
  'Reporta (p_dry_run=true, default) o aplica (p_dry_run=false) la fusion de Posiciones duplicadas de un tenant, en 3 casos segun cargos_empresa.modo_gestion: compartido_* (misma unidad+cargo+jefe, se fusiona), mismo_usuario_* (mismo user_id en 2+ posiciones activas, se fusiona sin importar unidad/jefe), revisar_manual_vacante (vacantes con unidad+cargo+jefe identicos, JAMAS se fusiona automaticamente). Sobrevive siempre la candidata con vinculo origen_asignacion_id->principal=true si existe (309); si ninguna lo tiene, sobrevive la de mas historial (empate: la mas antigua) -- ver cabecera de 309_fix_sobreviviente_principal.sql para el detalle de por que.';

-- Mismo criterio que 305/306/307/308: herramienta de mantenimiento para el SQL editor de
-- Supabase (rol postgres, bypassa RLS), no se expone via PostgREST/anon.
revoke execute on function public.consolidar_posiciones_duplicadas(text, boolean) from public;

select pg_notify('pgrst', 'reload schema');
