-- TIDEO ERP - Auditoria de posiciones y unidades_organizacionales
-- Reutiliza el trigger generico audit_backend_minimo (definido en
-- 024_backend_minimos_deploy_beta.sql) que ya audita otras tablas del sistema, para
-- dejar rastro de cambios manuales (ej. reasignar la unidad_organizacional_id de una
-- posicion desde el frontend) igual que el resto de entidades.

drop trigger if exists audit_backend_minimo_posiciones on public.posiciones;
create trigger audit_backend_minimo_posiciones
after insert or update on public.posiciones
for each row execute function public.audit_backend_minimo();

drop trigger if exists audit_backend_minimo_unidades_organizacionales on public.unidades_organizacionales;
create trigger audit_backend_minimo_unidades_organizacionales
after insert or update on public.unidades_organizacionales
for each row execute function public.audit_backend_minimo();

select pg_notify('pgrst', 'reload schema');
