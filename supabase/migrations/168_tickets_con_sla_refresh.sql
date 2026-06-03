-- TIDEO ERP — Migración 168: Refrescar vista tickets_con_sla
-- La migración 149 agregó qc_estado, veces_reabierto y reabierto_en a la tabla tickets,
-- pero no recreó la vista. En PostgreSQL, t.* se expande al momento de CREATE VIEW,
-- por lo que la vista no incluía esas columnas → qc_estado llegaba undefined al frontend.

drop view if exists public.tickets_con_sla;

create view public.tickets_con_sla
with (security_invoker = true)
as
select
  t.*,
  public.ticket_sla_estado(t.creado_en, t.fecha_limite_sla, t.estado) as sla_estado
from public.tickets t;

select pg_notify('pgrst', 'reload schema');
