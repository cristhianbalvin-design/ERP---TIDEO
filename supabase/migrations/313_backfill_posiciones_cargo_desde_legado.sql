-- TIDEO ERP - Backfill aditivo: posiciones.cargo_id <- cargo_id de la ficha legada del ocupante.
--
-- Origen: auditoria de turno anterior confirmo que posiciones.cargo_id esta vacio en 61 de 62
-- posiciones activas con "desajuste" contra personal_operativo/personal_administrativo.cargo_id
-- (98%) -- no por conflicto real, sino porque el backfill automatico de Fase 1c (296) nunca lo
-- resolvio para casi nadie (comentario propio de 293_posiciones.sql: "el backfill automatico de
-- la fase 1c no siempre tiene senal confiable para resolverlo"). Solo 1 caso real de cargo
-- DISTINTO (no null) existe hoy: Lucero Martinez, tenant PRUEBA (emp_20609996464), posicion con
-- cargo_id ya poblado a "Jefe de Logistica" contra su ficha "Coordinador Administrativo y
-- Financiero" -- esa NO se toca aqui, es decision manual pendiente.
--
-- Puramente aditivo: solo escribe donde posiciones.cargo_id IS NULL. Nunca sobreescribe un valor
-- existente (protege automaticamente el caso Lucero y cualquier otro similar, sin necesidad de
-- excluirlo por nombre). No se sincroniza en la direccion contraria -- personal_operativo /
-- personal_administrativo quedan intactos. No se implementa aqui el trigger de sincronizacion
-- continua ni la unificacion de Ficha Administrativa (turnos aparte).
--
-- Solo resuelve una posicion cuando TODOS sus ocupantes activos (posiciones_usuarios.fecha_fin is
-- null) coinciden en el mismo cargo_id legado -- si una posicion "compartida" tuviera ocupantes
-- con cargos legados distintos, o si el ocupante no tiene cargo_id legado, queda sin tocar y
-- reportada, para revision manual en vez de una eleccion automatica arbitraria.

do $$
declare
  v_antes_null int;
  v_pobladas int;
  v_despues_null int;
  v_lucero record;
begin
  select count(*) into v_antes_null from public.posiciones where cargo_id is null;
  raise notice 'Antes del backfill: % posiciones con cargo_id null.', v_antes_null;

  with ocupante_cargo as (
    select
      pu.posicion_id,
      coalesce(po.cargo_id, pa.cargo_id) as cargo_legado
    from public.posiciones_usuarios pu
    left join public.personal_operativo po
           on po.auth_user_id = pu.user_id and po.empresa_id = pu.empresa_id
    left join public.personal_administrativo pa
           on pa.auth_user_id = pu.user_id and pa.empresa_id = pu.empresa_id
    where pu.fecha_fin is null
  ),
  candidata as (
    select distinct posicion_id, cargo_legado
    from ocupante_cargo
    where cargo_legado is not null
  ),
  resuelta as (
    -- count(*) = 1 exige que todos los ocupantes activos de la posicion coincidan en el mismo
    -- cargo_id legado; si hay 2+ valores distintos, la posicion queda excluida (ambigua).
    select posicion_id, min(cargo_legado) as cargo_legado
    from candidata
    group by posicion_id
    having count(*) = 1
  )
  update public.posiciones p
  set cargo_id = r.cargo_legado, updated_at = now()
  from resuelta r
  where p.id = r.posicion_id
    and p.cargo_id is null;

  get diagnostics v_pobladas = row_count;

  raise notice 'Backfill 313: % posiciones pobladas desde la ficha legada de su ocupante.', v_pobladas;

  select count(*) into v_despues_null from public.posiciones where cargo_id is null;
  raise notice 'Despues del backfill: % posiciones con cargo_id null (vacantes sin ocupante + ocupadas sin cargo legado o ambiguas -- ver consultas de verificacion al final del archivo).', v_despues_null;

  -- Confirmacion explicita: la posicion de Lucero Martinez (unico caso real de cargo YA
  -- poblado y distinto al legado) no debe figurar entre las recien pobladas -- su cargo_id ya
  -- era NOT NULL desde antes, asi que el UPDATE de arriba nunca la selecciona.
  select p.id as posicion_id, p.cargo_id, ce.nombre as cargo_actual
  into v_lucero
  from public.personal_administrativo pa
  join public.posiciones_usuarios pu on pu.user_id = pa.auth_user_id and pu.fecha_fin is null
  join public.posiciones p on p.id = pu.posicion_id
  left join public.cargos_empresa ce on ce.id = p.cargo_id
  where pa.empresa_id = 'emp_20609996464'
    and lower(trim(pa.nombre)) = lower(trim('Lucero Martínez'));

  if v_lucero.posicion_id is not null then
    raise notice 'Verificacion Lucero Martinez: posicion % sigue con cargo_id=% (%) -- NO fue tocada por este backfill (ya tenia valor antes).',
      v_lucero.posicion_id, v_lucero.cargo_id, coalesce(v_lucero.cargo_actual, '(sin nombre resuelto)');
  else
    raise notice 'Verificacion Lucero Martinez: no se encontro su posicion activa con los mismos criterios del turno anterior -- revisar manualmente.';
  end if;
end;
$$;

-- ── Verificacion / reporte para pegar en Supabase Studio despues de correr la migracion ──────

-- 1. Cuantas posiciones quedan sin cargo_id, desglosadas por motivo:
--    select
--      count(*) filter (where not exists (
--        select 1 from posiciones_usuarios pu where pu.posicion_id = p.id and pu.fecha_fin is null
--      )) as vacantes_sin_cambios,
--      count(*) filter (where exists (
--        select 1 from posiciones_usuarios pu where pu.posicion_id = p.id and pu.fecha_fin is null
--      )) as ocupadas_sin_cargo_legado_o_ambiguas
--    from posiciones p
--    where p.cargo_id is null;

-- 2. Detalle de las que quedaron ocupadas pero sin resolver (para decidir manualmente: sin cargo
--    legado en ninguno de sus ocupantes, o cargos legados distintos entre ocupantes de la misma
--    posicion "compartida"):
--    select p.id as posicion_id, p.empresa_id, pu.user_id,
--      coalesce(po.cargo_id, pa.cargo_id) as cargo_legado_ocupante
--    from posiciones p
--    join posiciones_usuarios pu on pu.posicion_id = p.id and pu.fecha_fin is null
--    left join personal_operativo po on po.auth_user_id = pu.user_id and po.empresa_id = p.empresa_id
--    left join personal_administrativo pa on pa.auth_user_id = pu.user_id and pa.empresa_id = p.empresa_id
--    where p.cargo_id is null
--    order by p.empresa_id, p.id;

-- 3. Confirma que Lucero Martinez sigue con su cargo_id previo (no null, no sobreescrito):
--    select p.id, p.cargo_id, ce.nombre
--    from personal_administrativo pa
--    join posiciones_usuarios pu on pu.user_id = pa.auth_user_id and pu.fecha_fin is null
--    join posiciones p on p.id = pu.posicion_id
--    left join cargos_empresa ce on ce.id = p.cargo_id
--    where pa.empresa_id = 'emp_20609996464' and lower(trim(pa.nombre)) = lower(trim('Lucero Martínez'));

select pg_notify('pgrst', 'reload schema');
