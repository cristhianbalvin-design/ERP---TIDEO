-- TIDEO ERP - Reconcilia asignaciones con multiples filas principal = true para el mismo
-- usuario/tenant.
--
-- Causa raiz (bug de codigo, corregido en el mismo cambio que esta migracion): en
-- actualizar-usuario-acceso/index.ts, saveFunctionalAssignments buscaba la asignacion principal
-- existente filtrando "principal = true AND activo = true". Si el usuario estaba inactivo en ese
-- momento (su fila principal ya tenia activo = false por el trigger
-- trg_usuarios_empresas_sync_asignacion_principal), la busqueda no la encontraba y el flujo de
-- posicion (posicion_guardar_asignacion_principal) creaba una fila NUEVA en vez de reutilizar la
-- existente -- dejando la vieja huerfana con principal = true, activo = false para siempre.
-- crear-usuario-acceso/index.ts nunca tuvo este bug (su misma busqueda no filtra por activo).
--
-- Efecto: si esas filas huerfanas se acumulan y luego alguien reactiva al usuario (estado =
-- 'activo' en usuarios_empresas, sin pasar por el flujo de posicion), el trigger de sincronizacion
-- intenta poner activo = true en TODAS las filas con principal = true del usuario a la vez,
-- violando el indice unico parcial ux_usuarios_asignaciones_principal_activa (empresa_id, user_id)
-- en pleno UPDATE.
--
-- Correccion: para cada (empresa_id, user_id) con mas de una fila principal = true, nos quedamos
-- con UNA sola sobreviviente (la activa si existe, si no la de fecha_fin mas reciente / creada mas
-- reciente) y degradamos el resto a principal = false. No se borra ni se reactiva nada.

do $$
declare
  r_dup record;
  v_sobreviviente uuid;
begin
  for r_dup in
    select empresa_id, user_id
    from public.usuarios_asignaciones
    where principal = true
    group by empresa_id, user_id
    having count(*) > 1
  loop
    select id into v_sobreviviente
    from public.usuarios_asignaciones
    where empresa_id = r_dup.empresa_id
      and user_id = r_dup.user_id
      and principal = true
    order by activo desc, fecha_fin desc nulls first, created_at desc
    limit 1;

    update public.usuarios_asignaciones
    set principal = false, updated_at = now()
    where empresa_id = r_dup.empresa_id
      and user_id = r_dup.user_id
      and principal = true
      and id <> v_sobreviviente;
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
