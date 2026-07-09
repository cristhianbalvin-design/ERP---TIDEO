-- TIDEO ERP - Consolidacion de Posiciones duplicadas para TODOS los tenants a la vez.
--
-- Envoltorio de public.consolidar_posiciones_duplicadas(empresa_id, dry_run) (305) que itera
-- sobre cada empresa_id de public.empresas y reutiliza esa funcion tal cual -- no reimplementa
-- la deteccion de duplicados, solo agrega la capa de "por cada tenant". No se excluye ningun
-- tenant por defecto (ni demo, ni suspendido, ni la plataforma): todos se evaluan.
--
-- Aislamiento de fallos POR TENANT, no por transacciones separadas: cada tenant se procesa
-- dentro de un bloque BEGIN/EXCEPTION propio, que PL/pgSQL implementa internamente con un
-- SAVEPOINT implicito. Se eligio esto en vez de "transacciones independientes por tenant" de
-- verdad porque:
--   - Una funcion SQL normal (a diferencia de un PROCEDURE invocado con CALL a nivel top-level)
--     no puede hacer COMMIT/ROLLBACK real a mitad de ejecucion en Postgres -- eso requeriria
--     convertir esto en un PROCEDURE con "autonomous transactions", lo cual complica bastante
--     la firma (CALL en vez de SELECT) y ya no podria devolver el reporte como una tabla comoda
--     de revisar en el mismo SQL editor.
--   - El bloque BEGIN/EXCEPTION por tenant logra el efecto que importa en la practica: si un
--     tenant explota a mitad de su consolidacion (ej. una fila rara que viola un constraint),
--     el SAVEPOINT deshace SOLO lo que ese tenant alcanzo a tocar (atomico por tenant: o se
--     consolida completo, o no se le toca nada), se registra como fila de error en el reporte,
--     y el loop sigue sin problema con el resto de tenants siguientes. Los tenants ya
--     consolidados antes en la misma llamada NO se deshacen por el fallo de uno posterior.
--   - La unica diferencia real frente a transacciones separadas de verdad: si la llamada entera
--     se interrumpe por algo externo a la funcion (ej. se corta la conexion al SQL editor a
--     mitad de la ejecucion), se pierde TODO el batch (nada llega a hacer commit, ya que sigue
--     siendo una sola transaccion de Postgres de punta a punta). Con dry_run=true esto no
--     importa (no hay nada que perder, es solo lectura). Con dry_run=false, si el SQL editor
--     corta la conexion a mitad de una corrida larga, simplemente no se aplico nada -- se puede
--     volver a correr sin riesgo de aplicar duplicado (el reporte en dry_run vuelve a mostrar lo
--     mismo si nada quedo a medias).
--
-- Tenants sin duplicados SI aparecen en el reporte (fila con accion='sin_duplicados'), para
-- confirmar que fueron evaluados y no que se saltearon.
--
-- Uso desde el SQL editor de Supabase:
--   1. Reporte / dry run de TODOS los tenants (no cambia nada):
--        select * from public.consolidar_posiciones_duplicadas_todos_tenants(true);
--   2. Revisar con Cristhian, tenant por tenant, cuantos grupos hay y cual sobrevive en cada uno.
--   3. Solo tras aprobar el reporte completo, aplicar de verdad (TODOS los tenants):
--        select * from public.consolidar_posiciones_duplicadas_todos_tenants(false);
--
-- Esta migracion NO ejecuta el modo real por si sola -- solo define la funcion. Ver tambien el
-- encabezado de 305_consolidar_posiciones_duplicadas.sql: correr esto solo despues de confirmar
-- que 303 (modo_gestion) y 304 (fix del trigger legado) ya estan desplegados, o los duplicados
-- vuelven a aparecer.

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
  historico_ocupaciones bigint
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
        return next;
      end if;

    exception when others then
      -- Deshace (via SAVEPOINT implicito de este bloque) cualquier cambio parcial que este
      -- tenant alcanzo a hacer antes de fallar, y sigue con el resto -- ver nota de cabecera.
      empresa_id := r_empresa.id;
      empresa_nombre := r_empresa.nombre;
      grupo := -1;
      unidad_nombre := null;
      cargo_nombre := null;
      posicion_id := null;
      accion := 'error: ' || sqlerrm;
      ocupantes_activos := null;
      historico_ocupaciones := null;
      return next;
    end;
  end loop;

  return;
end;
$$;

comment on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) is
  'Version multi-tenant de consolidar_posiciones_duplicadas: itera todas las empresas y reutiliza esa funcion por cada una (no reimplementa la deteccion). Aisla fallos por tenant via SAVEPOINT (bloque BEGIN/EXCEPTION), no transacciones separadas reales -- ver comentario de cabecera de la migracion 306. dry_run=true (default) = reporte, no cambia nada. dry_run=false = aplica de verdad en todos los tenants.';

-- Mismo criterio que 305: herramienta de mantenimiento para el SQL editor de Supabase (rol
-- postgres, bypassa RLS), no se expone via PostgREST/anon.
revoke execute on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) from public;

select pg_notify('pgrst', 'reload schema');
