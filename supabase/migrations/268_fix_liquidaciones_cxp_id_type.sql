-- Fix cxp_id type in liquidaciones_cese to match cxp.id type (text)
alter table public.liquidaciones_cese
  alter column cxp_id type text using cxp_id::text;

-- Agregando llave foránea opcional para integridad referencial si se desea, aunque la original no la tenía
-- add constraint si hace falta, pero no es estrictamente necesario si antes no estaba.

select pg_notify('pgrst', 'reload schema');
