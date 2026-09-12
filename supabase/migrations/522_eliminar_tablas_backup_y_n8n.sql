-- Limpieza confirmada: backups puntuales y datos de prueba sin consumidores.
-- Validado antes de aplicar: no existen vistas, funciones/RPC ni triggers activos
-- que referencien estas tablas. RESTRICT conserva la salvaguarda de dependencias.

drop table if exists public.centros_beneficio_backup_20260722 restrict;
drop table if exists public.centros_beneficio_backup_20260722_capex restrict;
drop table if exists public.centros_beneficio_backup_20260722_rename restrict;
drop table if exists public.centros_costo_backup_20260722 restrict;
drop table if exists public.n8n_chat_histories restrict;

do $postflight$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any (array[
        'centros_beneficio_backup_20260722',
        'centros_beneficio_backup_20260722_capex',
        'centros_beneficio_backup_20260722_rename',
        'centros_costo_backup_20260722',
        'n8n_chat_histories'
      ])
  ) then
    raise exception 'CLEANUP_POSTFLIGHT: una o más tablas objetivo continúan existiendo.';
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');
