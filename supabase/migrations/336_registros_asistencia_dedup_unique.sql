-- ============================================================================
-- 336 · Dedup de registros_asistencia + constraint unico (empresa_id, trabajador_id, fecha)
-- ============================================================================
-- Diagnostico previo confirmo que registros_asistencia no tenia ningun
-- constraint que impidiera mas de una fila por (empresa_id, trabajador_id,
-- fecha). La importacion biometrica (confirmarImportacionBio en pages_ops.jsx)
-- consulta los registros existentes UNA sola vez al inicio del lote; cuando
-- esa misma importacion se disparo varias veces en rapida sucesion (rafagas
-- de milisegundos entre corridas, mismo usuario), cada corrida tomo su propia
-- "foto" de la base sin ver lo que la corrida anterior ya habia insertado,
-- generando hasta 49 filas para el mismo trabajador+fecha en un caso real.
-- Alcance verificado antes de aplicar: 717 pares (empresa_id, trabajador_id,
-- fecha) duplicados, 25,377 filas excedentes, 3 tenants afectados, 0 filas
-- con estado='anulado' hoy (ningun residuo de limpiezas previas).
--
-- 1) Limpieza quirurgica: por cada grupo duplicado, conserva activa la fila
--    de created_at mas reciente; el resto se anula siguiendo el mismo patron
--    ya usado por anular_lote_biometrico (migracion 234): estado='anulado' +
--    anulado_en + motivo_anulacion + updated_at. No se toca ningun grupo sin
--    duplicados (rn=1 siempre queda intacto) ni ninguna otra columna.
with duplicados as (
  select
    id,
    row_number() over (
      partition by empresa_id, trabajador_id, fecha
      order by created_at desc, id desc
    ) as rn
  from public.registros_asistencia
  where coalesce(estado, '') <> 'anulado'
)
update public.registros_asistencia r
set estado = 'anulado',
    anulado_en = now(),
    motivo_anulacion = 'Duplicado por reintento de importacion biometrica - limpieza dedup migracion 336',
    updated_at = now()
from duplicados d
where r.id = d.id
  and d.rn > 1;

-- 2) Constraint aditivo: rechaza a nivel de base cualquier intento futuro de
--    duplicar (empresa_id, trabajador_id, fecha), sin importar el proceso que
--    lo origine. Parcial (excluye estado='anulado') para no bloquear el
--    patron de anulacion + reemplazo ya usado en el resto del sistema.
create unique index if not exists registros_asistencia_empresa_trabajador_fecha_uq
  on public.registros_asistencia (empresa_id, trabajador_id, fecha)
  where coalesce(estado, '') <> 'anulado';

select pg_notify('pgrst', 'reload schema');
