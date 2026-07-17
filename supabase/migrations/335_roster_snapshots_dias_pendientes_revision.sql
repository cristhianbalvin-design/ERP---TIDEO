-- ============================================================================
-- 335 · dias_pendientes_revision en roster_minero_snapshots
-- ============================================================================
-- calcularRosterPeriodo (rosterMineroService.js) ahora distingue, día por día,
-- entre "día en mina confirmado" y "día ambiguo que necesita revisión humana":
-- un registro real 'incompleto', o un día sin ningún registro que el ciclo
-- teórico (fecha_inicio_ciclo / dias_ciclo_trabajo) esperaba como trabajo, ya
-- no se cuenta silenciosamente como día en mina — se cuenta aparte, en esta
-- columna nueva, hasta que un administrador lo resuelva con un ajuste de
-- roster (roster_minero_ajustes) o con una falta explícita en Asistencia.
--
-- Columna aditiva: default 0, not null. No toca ninguna columna existente.

alter table public.roster_minero_snapshots
  add column if not exists dias_pendientes_revision integer not null default 0;

select pg_notify('pgrst', 'reload schema');
