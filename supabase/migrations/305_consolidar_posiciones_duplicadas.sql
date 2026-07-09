-- TIDEO ERP - Consolidacion de Posiciones duplicadas (paso 4 del plan "Modelo Mixto de
-- Posiciones"). Define la herramienta, pero NO borra nada por si sola -- esta migracion solo
-- crea la funcion. La consolidacion real la dispara Cristhian a mano desde el SQL editor de
-- Supabase, DESPUES de revisar el reporte y confirmar que las causas raiz (303/304) ya estan
-- desplegadas -- si se corre esto antes de esas correcciones, los duplicados vuelven a aparecer.
--
-- Uso:
--   1. Reporte / dry run (no cambia nada):
--        select * from public.consolidar_posiciones_duplicadas('<empresa_id>', true);
--   2. Revisar el resultado con Cristhian: cada 'grupo' muestra 1 fila 'sobrevive' y 1+ filas
--      'se_eliminaria', con unidad, cargo, ocupantes activos e historico de cada una.
--   3. Solo tras aprobar el reporte, aplicar de verdad:
--        select * from public.consolidar_posiciones_duplicadas('<empresa_id>', false);
--
-- Un "grupo duplicado" = 2+ filas de posiciones con la misma empresa_id + unidad_organizacional_id
-- + cargo_id (o ambos null) + reporta_a_posicion_id (o ambos null). La sobreviviente es la mas
-- antigua (created_at asc) del grupo. Al aplicar (p_dry_run = false):
--   - Todo el historico de posiciones_usuarios de cada clon (abierto y cerrado) se mueve a la
--     sobreviviente preservando fecha_inicio/fecha_fin -- solo cambia posicion_id.
--   - Si el mismo usuario tiene ocupacion ACTIVA tanto en el clon como en la sobreviviente (el
--     caso de alguien "repartido" entre clones), se cierra la del clon con fecha_fin = hoy antes
--     de moverla (para no violar el indice unico de ocupacion activa); el historico de que la
--     ocupo se preserva igual, solo con fecha_fin puesta.
--   - Las posiciones que reportaban al clon, y las unidades que lo tenian como responsable, se
--     reapuntan a la sobreviviente antes de eliminar el clon.
-- No toca personal_operativo ni personal_administrativo.

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
  historico_ocupaciones bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_grupo record;
  v_pos_id uuid;
  v_survivor uuid;
  v_grupo_seq int := 0;
begin
  if p_empresa_id is null then
    raise exception 'p_empresa_id es obligatorio';
  end if;

  for r_grupo in
    select
      unidad_organizacional_id, cargo_id, reporta_a_posicion_id,
      array_agg(id order by created_at asc, id asc) as posicion_ids
    from public.posiciones
    where empresa_id = p_empresa_id
    group by unidad_organizacional_id, cargo_id, reporta_a_posicion_id
    having count(*) > 1
  loop
    v_grupo_seq := v_grupo_seq + 1;
    v_survivor := r_grupo.posicion_ids[1];

    grupo := v_grupo_seq;
    unidad_nombre := (select nombre from public.unidades_organizacionales where id = r_grupo.unidad_organizacional_id);
    cargo_nombre := (select nombre from public.cargos_empresa where id = r_grupo.cargo_id);
    posicion_id := v_survivor;
    accion := 'sobrevive';
    ocupantes_activos := (select count(*) from public.posiciones_usuarios where posicion_id = v_survivor and fecha_fin is null);
    historico_ocupaciones := (select count(*) from public.posiciones_usuarios where posicion_id = v_survivor);
    return next;

    foreach v_pos_id in array r_grupo.posicion_ids[2 : array_length(r_grupo.posicion_ids, 1)]
    loop
      grupo := v_grupo_seq;
      unidad_nombre := (select nombre from public.unidades_organizacionales where id = r_grupo.unidad_organizacional_id);
      cargo_nombre := (select nombre from public.cargos_empresa where id = r_grupo.cargo_id);
      posicion_id := v_pos_id;
      accion := case when p_dry_run then 'se_eliminaria' else 'eliminada' end;
      ocupantes_activos := (select count(*) from public.posiciones_usuarios where posicion_id = v_pos_id and fecha_fin is null);
      historico_ocupaciones := (select count(*) from public.posiciones_usuarios where posicion_id = v_pos_id);
      return next;

      if not p_dry_run then
        -- Cierra ocupaciones activas del clon que colisionarian con una ocupacion activa del
        -- mismo usuario ya presente en la sobreviviente (antes de mover, para no violar el
        -- indice unico ux_posiciones_usuarios_activa).
        update public.posiciones_usuarios pu
        set fecha_fin = current_date, updated_at = now()
        where pu.posicion_id = v_pos_id
          and pu.fecha_fin is null
          and exists (
            select 1 from public.posiciones_usuarios s
            where s.posicion_id = v_survivor and s.user_id = pu.user_id and s.fecha_fin is null
          );

        -- Mueve TODO lo que quede en el clon (historico cerrado + lo que no colisiona) hacia la
        -- sobreviviente, preservando fecha_inicio/fecha_fin -- ya no puede haber conflicto.
        update public.posiciones_usuarios
        set posicion_id = v_survivor, updated_at = now()
        where posicion_id = v_pos_id;

        -- Reapunta subordinados y responsables de unidad que apuntaban al clon.
        update public.posiciones
        set reporta_a_posicion_id = v_survivor, updated_at = now()
        where reporta_a_posicion_id = v_pos_id;

        update public.unidades_organizacionales
        set responsable_posicion_id = v_survivor, updated_at = now()
        where responsable_posicion_id = v_pos_id;

        delete from public.posiciones where id = v_pos_id;
      end if;
    end loop;
  end loop;

  return;
end;
$$;

comment on function public.consolidar_posiciones_duplicadas(text, boolean) is
  'Reporta (p_dry_run=true, default) o aplica (p_dry_run=false) la fusion de Posiciones duplicadas (misma unidad+cargo+jefe) de un tenant. Ejecutar SOLO despues de confirmar que 303/304 (modo_gestion + fix del trigger legado) ya estan desplegados, y solo con aprobacion explicita del reporte -- ver cabecera del archivo de migracion.';

-- No se expone via PostgREST/anon: es una herramienta de mantenimiento que se ejecuta a mano
-- desde el SQL editor de Supabase (rol postgres, bypassa RLS), igual que el resto de funciones
-- de mantenimiento de 300/301.
revoke execute on function public.consolidar_posiciones_duplicadas(text, boolean) from public;

select pg_notify('pgrst', 'reload schema');
