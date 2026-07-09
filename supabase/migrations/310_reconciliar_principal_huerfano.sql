-- TIDEO ERP - Reconcilia asignaciones PRINCIPALES que quedaron sin ninguna posicion vinculada.
--
-- Diagnostico (turno anterior): el Organigrama solo muestra a una persona si alguna de sus
-- posiciones tiene origen_asignacion_id apuntando a su fila de usuarios_asignaciones con
-- principal = true (ver esPosicionVisible en pages_admin.jsx:11048-11051 y
-- construirUsuariosConPosiciones en context.jsx:89). Se confirmo con el propio log del sistema
-- (_reporte_backfill_posiciones, filas #37/#38) que el backfill de la Fase 1c (296) dejo sin
-- resolver la asignacion principal de 2 personas en ZAHORY (Camilo, Karyme Arellano) porque cada
-- una tenia varias filas usuarios_asignaciones con la misma categoria y el emparejamiento
-- automatico no pudo desambiguar (2 candidatas). Se verifico contra los 7 tenants que son
-- exactamente esos 2 casos en toda la base -- no es exclusivo de ZAHORY por suposicion, es un
-- hecho verificado con la misma consulta que corre este script.
--
-- Esto es independiente de la duplicacion de posiciones y de consolidar_posiciones_duplicadas
-- (305/307/308/309): una persona con una sola posicion, si esa posicion nunca quedo vinculada a
-- su asignacion principal, seria invisible igual. No se toca esa funcion aqui -- este script solo
-- corrige datos (un UPDATE de una columna hoy en NULL), sin DELETE, sin fusionar nada.
--
-- Generico (no hardcodeado a Camilo/Karyme): para cada tenant, busca asignaciones
-- principal=true, activo=true sin ninguna posicion con origen_asignacion_id apuntandole, y le
-- asigna la posicion del MISMO usuario, del MISMO tenant, de cargo individual o sin cargo
-- (mismo universo que el caso 2 de consolidar_posiciones_duplicadas), actualmente activa y sin
-- origen_asignacion_id propio (para no robarle el vinculo a otra asignacion), eligiendo por el
-- mismo criterio de desempate que ya usa 309: mas historial en posiciones_usuarios, empate -> mas
-- antigua, empate -> id menor.
--
-- Efecto esperado para Camilo y Karyme: reconecta exactamente las posiciones que 309 ya elegiria
-- como sobrevivientes en su fusion futura (af811e4d... y 5108fb25... respectivamente) -- no
-- cambia cual posicion sobrevive, solo corrige el vinculo. Los hace visibles en el Organigrama de
-- inmediato, sin depender de que se corra la consolidacion real.
--
-- Deja rastro en _reporte_backfill_posiciones (misma tabla que uso el backfill original) para
-- auditoria: una fila 'resumen' por cada vinculo reconectado, o 'usuario_no_mapeado' si alguna
-- asignacion huerfana no tuvo ninguna posicion candidata disponible (no deberia haber ninguna hoy,
-- ya que Camilo y Karyme si tienen candidatas -- se deja el caso cubierto por si aparece en el
-- futuro un tenant con una asignacion principal huerfana sin ninguna posicion propia en absoluto).

do $$
declare
  r_asig record;
  v_candidata uuid;
begin
  for r_asig in
    select ua.id as asignacion_id, ua.user_id, ua.empresa_id
    from public.usuarios_asignaciones ua
    where ua.principal = true
      and ua.activo = true
      and not exists (select 1 from public.posiciones p where p.origen_asignacion_id = ua.id)
  loop
    select p.id into v_candidata
    from public.posiciones_usuarios pu
    join public.posiciones p on p.id = pu.posicion_id
    left join public.cargos_empresa c on c.id = p.cargo_id
    where p.empresa_id = r_asig.empresa_id
      and pu.user_id = r_asig.user_id
      and pu.fecha_fin is null
      and p.origen_asignacion_id is null
      and (p.cargo_id is null or c.modo_gestion = 'individual')
    order by
      (select count(*) from public.posiciones_usuarios pu2 where pu2.posicion_id = p.id) desc,
      p.created_at asc, p.id asc
    limit 1;

    if v_candidata is not null then
      update public.posiciones
      set origen_asignacion_id = r_asig.asignacion_id, updated_at = now()
      where id = v_candidata;

      insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
      values (
        r_asig.empresa_id, 'resumen',
        'Reconciliacion 310: asignacion principal ' || r_asig.asignacion_id || ' (usuario ' || r_asig.user_id ||
        ') vinculada a posicion existente ' || v_candidata || ' (antes sin origen_asignacion_id).'
      );
    else
      insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
      values (
        r_asig.empresa_id, 'usuario_no_mapeado',
        'Reconciliacion 310: asignacion principal ' || r_asig.asignacion_id || ' (usuario ' || r_asig.user_id ||
        ') sigue sin poder vincularse -- no hay ninguna posicion activa sin reclamar de cargo individual/sin cargo para este usuario.'
      );
    end if;
  end loop;
end;
$$;

-- Verificacion rapida en Supabase Studio (debe devolver 0 filas tras aplicar):
--   select ua.id, ua.empresa_id, ua.user_id from usuarios_asignaciones ua
--   where ua.principal = true and ua.activo = true
--     and not exists (select 1 from posiciones p where p.origen_asignacion_id = ua.id);
select pg_notify('pgrst', 'reload schema');
