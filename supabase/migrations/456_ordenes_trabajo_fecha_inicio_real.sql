-- 456 · Órdenes de trabajo: fecha real de inicio de ejecución.
--
-- fecha_inicio_real registra el instante efectivo de transición a ejecución.
-- Es timestamptz (no date) para conservar la hora enviada por
-- new Date().toISOString() desde las aplicaciones, consistente con
-- ordenes_trabajo.created_at y ordenes_trabajo.updated_at.
--
-- DRY RUN MANUAL — ejecutar este cuerpo completo dentro de BEGIN/ROLLBACK:
-- begin;
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'ordenes_trabajo'
--   and column_name = 'fecha_inicio_real';
--
-- Ejecutar el cuerpo de esta migración.
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'ordenes_trabajo'
--   and column_name = 'fecha_inicio_real';
--
-- rollback;
--
-- APLICACIÓN MANUAL — después de revisar el dry run:
-- begin;
-- Ejecutar el cuerpo de esta migración.
-- commit;
--
-- POST-COMMIT ESPERADO:
-- fecha_inicio_real | timestamp with time zone | YES | null

set local lock_timeout = '15s';
set local statement_timeout = '5min';

alter table public.ordenes_trabajo
  add column if not exists fecha_inicio_real timestamptz null;

-- Si la columna ya existiera con otra forma, no aceptar silenciosamente un
-- esquema incompatible con el inicio real enviado por el frontend.
do $verificar_fecha_inicio_real$
declare
  v_tipo text;
  v_nullable text;
begin
  select data_type, is_nullable
    into v_tipo, v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ordenes_trabajo'
    and column_name = 'fecha_inicio_real';

  if not found
     or v_tipo <> 'timestamp with time zone'
     or v_nullable <> 'YES' then
    raise exception
      'OT_FECHA_INICIO_REAL_POSTFLIGHT: se esperaba fecha_inicio_real timestamptz nullable; se obtuvo tipo=%, nullable=%',
      coalesce(v_tipo, 'ausente'), coalesce(v_nullable, 'ausente');
  end if;
end;
$verificar_fecha_inicio_real$;

select pg_notify('pgrst', 'reload schema');
