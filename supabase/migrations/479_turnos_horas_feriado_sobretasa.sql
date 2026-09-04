-- 479 · Base de horas configurable para la sobretasa de feriado por turno.
--
-- Alcance deliberadamente limitado: agrega solo una columna opcional a turnos.
-- NULL preserva el fallback a horas_efectivas en el motor de nómina.

alter table public.turnos
  add column if not exists horas_feriado_sobretasa numeric(5,2);

select pg_notify('pgrst', 'reload schema');
