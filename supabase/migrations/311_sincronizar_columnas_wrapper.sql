-- TIDEO ERP - Sincroniza las columnas de salida de consolidar_posiciones_duplicadas_todos_tenants
-- (306) con las de la funcion base consolidar_posiciones_duplicadas (308/309).
--
-- Causa exacta del reporte que motivo esta migracion: 306 define su propio RETURNS TABLE fijo,
-- copiado de la funcion base en el momento en que se escribio 306 (cuando la base todavia no
-- tenia fecha_creacion, agregada recien en 308). Como el wrapper mapea "select * from
-- consolidar_posiciones_duplicadas(...)" campo por campo a sus propias variables de salida
-- (r_fila.grupo, r_fila.unidad_nombre, etc.), la columna fecha_creacion de la base nunca daba
-- error -- simplemente nunca se copiaba a ningun lado, porque el wrapper no tiene una variable de
-- salida llamada fecha_creacion a la cual asignarla.
--
-- Verificado columna por columna con pg_get_function_result sobre ambas funciones antes de este
-- fix (no se asumio que la unica diferencia fuera fecha_creacion):
--   base:    TABLE(grupo, unidad_nombre, cargo_nombre, posicion_id, accion, ocupantes_activos,
--                  historico_ocupaciones, fecha_creacion)
--   wrapper: TABLE(empresa_id, empresa_nombre, grupo, unidad_nombre, cargo_nombre, posicion_id,
--                  accion, ocupantes_activos, historico_ocupaciones)
-- Unica diferencia real: fecha_creacion. El resto coincide exactamente (mas los 2 campos propios
-- del wrapper, empresa_id/empresa_nombre, que identifican el tenant de cada fila).
--
-- No se toca consolidar_posiciones_duplicadas (305/307/308/309) -- el problema estaba solo aqui.
-- Mismo mecanismo de aislamiento por tenant via SAVEPOINT que ya tenia 306, sin cambios.
--
-- CREATE OR REPLACE no permite cambiar la lista de columnas de salida de RETURNS TABLE, asi que
-- hace falta DROP + CREATE (mismo patron que uso 308 para la funcion base).

drop function if exists public.consolidar_posiciones_duplicadas_todos_tenants(boolean);

create or replace function public.consolidar_posiciones_duplicadas_todos_tenants(
  p_dry_run boolean default true
)
returns table (
  empresa_id text,
  empresa_nombre text,
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
  r_empresa record;
  r_fila record;
  v_filas int;
begin
  for r_empresa in
    select id, coalesce(nullif(trim(nombre_comercial), ''), razon_social) as nombre
    from public.empresas
    order by id
  loop
    v_filas := 0;

    begin
      for r_fila in
        select * from public.consolidar_posiciones_duplicadas(r_empresa.id, p_dry_run)
      loop
        v_filas := v_filas + 1;
        empresa_id := r_empresa.id;
        empresa_nombre := r_empresa.nombre;
        grupo := r_fila.grupo;
        unidad_nombre := r_fila.unidad_nombre;
        cargo_nombre := r_fila.cargo_nombre;
        posicion_id := r_fila.posicion_id;
        accion := r_fila.accion;
        ocupantes_activos := r_fila.ocupantes_activos;
        historico_ocupaciones := r_fila.historico_ocupaciones;
        fecha_creacion := r_fila.fecha_creacion;
        return next;
      end loop;

      -- Tenant evaluado y sin ningun grupo duplicado: fila explicita para que se note que SI se
      -- reviso (en vez de quedar ausente del reporte, que podria confundirse con un salteo).
      if v_filas = 0 then
        empresa_id := r_empresa.id;
        empresa_nombre := r_empresa.nombre;
        grupo := 0;
        unidad_nombre := null;
        cargo_nombre := null;
        posicion_id := null;
        accion := 'sin_duplicados';
        ocupantes_activos := 0;
        historico_ocupaciones := 0;
        fecha_creacion := null;
        return next;
      end if;

    exception when others then
      -- Deshace (via SAVEPOINT implicito de este bloque) cualquier cambio parcial que este
      -- tenant alcanzo a hacer antes de fallar, y sigue con el resto -- ver nota de cabecera de
      -- la migracion 306 original para el razonamiento completo de este mecanismo.
      empresa_id := r_empresa.id;
      empresa_nombre := r_empresa.nombre;
      grupo := -1;
      unidad_nombre := null;
      cargo_nombre := null;
      posicion_id := null;
      accion := 'error: ' || sqlerrm;
      ocupantes_activos := null;
      historico_ocupaciones := null;
      fecha_creacion := null;
      return next;
    end;
  end loop;

  return;
end;
$$;

comment on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) is
  'Version multi-tenant de consolidar_posiciones_duplicadas: itera todas las empresas y reutiliza esa funcion por cada una (no reimplementa la deteccion). Columnas de salida sincronizadas con la base, incluida fecha_creacion (311). Aisla fallos por tenant via SAVEPOINT (bloque BEGIN/EXCEPTION), no transacciones separadas reales -- ver comentario de cabecera de la migracion 306 original. dry_run=true (default) = reporte, no cambia nada. dry_run=false = aplica de verdad en todos los tenants.';

-- Mismo criterio que 305/306/307/308/309: herramienta de mantenimiento para el SQL editor de
-- Supabase (rol postgres, bypassa RLS), no se expone via PostgREST/anon.
revoke execute on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) from public;

select pg_notify('pgrst', 'reload schema');
