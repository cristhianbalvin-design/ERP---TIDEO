-- TIDEO ERP - Fix: "column reference posicion_id is ambiguous" en
-- consolidar_posiciones_duplicadas (305).
--
-- Causa raiz: RETURNS TABLE(..., posicion_id uuid, ...) hace que PL/pgSQL auto-declare
-- "posicion_id" como variable de salida de la funcion. public.posiciones_usuarios TAMBIEN tiene
-- una columna real llamada posicion_id. En los lugares donde el cuerpo de la funcion referencia
-- "posicion_id" SIN calificar con el alias de la tabla, Postgres no puede decidir si es la
-- variable de salida o la columna de la tabla, y aborta con "column reference is ambiguous".
--
-- Por eso el bug solo se manifestaba en tenants CON grupos duplicados: las 5 subconsultas/
-- updates afectadas viven dentro del loop "for r_grupo in ... having count(*) > 1", que en un
-- tenant sin duplicados nunca llega a ejecutarse (el reporte da 'sin_duplicados' sin pasar por
-- ahi). El aislamiento por SAVEPOINT de consolidar_posiciones_duplicadas_todos_tenants (306)
-- funciono como se esperaba: contuvo el error tenant por tenant sin tumbar el reporte completo.
--
-- Revision del resto de la funcion en busca del mismo riesgo (columnas que coincidan con algun
-- parametro de salida: grupo, unidad_nombre, cargo_nombre, posicion_id, accion,
-- ocupantes_activos, historico_ocupaciones):
--   - posiciones.reporta_a_posicion_id, unidades_organizacionales.responsable_posicion_id: no
--     coinciden con ningun nombre de salida -> sin riesgo, se dejan igual.
--   - unidades_organizacionales.nombre, cargos_empresa.nombre: se asignan a variables
--     unidad_nombre/cargo_nombre via ":=", no aparecen como columna bareword dentro de una
--     condicion SQL -> sin riesgo.
--   - empresa_id (parametro): ya estaba protegido por el prefijo p_ (p_empresa_id), que es
--     justamente la convencion que le falto a los parametros de RETURNS TABLE.
-- El unico nombre de salida que choca con una columna real usada en las consultas internas es
-- posicion_id, y aparecia sin calificar en 5 lugares (2 subconsultas de la sobreviviente, 2 del
-- clon, y el UPDATE que mueve el historico) -- los 5 se corrigen aqui con el alias "pu".
--
-- Sin cambios de comportamiento ni de firma: mismo texto, misma logica de agrupamiento
-- (unidad_organizacional_id + cargo_id + reporta_a_posicion_id), mismo dry_run por defecto.
-- No se toca consolidar_posiciones_duplicadas_todos_tenants (306): no tiene el mismo bug (ver
-- diagnostico arriba), y reutiliza esta funcion tal cual via "select * from
-- consolidar_posiciones_duplicadas(...)", asi que el fix se propaga solo con este CREATE OR
-- REPLACE.

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
    ocupantes_activos := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_survivor and pu.fecha_fin is null);
    historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_survivor);
    return next;

    foreach v_pos_id in array r_grupo.posicion_ids[2 : array_length(r_grupo.posicion_ids, 1)]
    loop
      grupo := v_grupo_seq;
      unidad_nombre := (select nombre from public.unidades_organizacionales where id = r_grupo.unidad_organizacional_id);
      cargo_nombre := (select nombre from public.cargos_empresa where id = r_grupo.cargo_id);
      posicion_id := v_pos_id;
      accion := case when p_dry_run then 'se_eliminaria' else 'eliminada' end;
      ocupantes_activos := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id and pu.fecha_fin is null);
      historico_ocupaciones := (select count(*) from public.posiciones_usuarios pu where pu.posicion_id = v_pos_id);
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
        update public.posiciones_usuarios pu
        set posicion_id = v_survivor, updated_at = now()
        where pu.posicion_id = v_pos_id;

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
  'Reporta (p_dry_run=true, default) o aplica (p_dry_run=false) la fusion de Posiciones duplicadas (misma unidad+cargo+jefe) de un tenant. Ejecutar SOLO despues de confirmar que 303/304 (modo_gestion + fix del trigger legado) ya estan desplegados, y solo con aprobacion explicita del reporte -- ver cabecera de 305. Fix de ambiguedad de posicion_id en 307.';

select pg_notify('pgrst', 'reload schema');
