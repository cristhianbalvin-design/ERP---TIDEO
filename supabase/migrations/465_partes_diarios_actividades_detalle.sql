-- 465 · Partes diarios: detalle estructurado de actividades.
--
-- Conserva partes_diarios.actividad como texto legado. actividades_detalle
-- permite persistir por separado el detalle estructurado de cada actividad y
-- sus fotos, sin alterar lectores existentes de actividad ni evidencias.
--
-- DRY RUN MANUAL — ejecutar por separado y finalizar con ROLLBACK:
-- begin;
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'partes_diarios'
--   and column_name = 'actividades_detalle';
--
-- select
--   count(*) as total_partes,
--   count(*) filter (where actividades_detalle is null) as detalles_null,
--   count(*) filter (where actividades_detalle <> '[]'::jsonb) as detalles_no_vacios
-- from public.partes_diarios;
--
-- Ejecutar el cuerpo completo de esta migración.
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'partes_diarios'
--   and column_name = 'actividades_detalle';
--
-- select
--   count(*) as total_partes,
--   count(*) filter (where actividades_detalle is null) as detalles_null,
--   count(*) filter (where actividades_detalle <> '[]'::jsonb) as detalles_no_vacios
-- from public.partes_diarios;
--
-- rollback;
--
-- APLICACIÓN MANUAL — solo después de revisar el dry run:
-- begin;
-- Ejecutar el cuerpo completo de esta migración.
-- commit;
--
-- POST-COMMIT ESPERADO:
-- - actividades_detalle | jsonb | NO | '[]'::jsonb
-- - Todas las filas históricas de partes_diarios tienen actividades_detalle = [].

set local lock_timeout = '15s';
set local statement_timeout = '5min';

alter table public.partes_diarios
  add column if not exists actividades_detalle jsonb not null default '[]'::jsonb;

do $verificar_actividades_detalle$
declare
  v_tipo text;
  v_nullable text;
  v_default text;
  v_null_count bigint;
  v_nonempty_count bigint;
begin
  select
    c.data_type,
    c.is_nullable,
    pg_get_expr(d.adbin, d.adrelid)
  into v_tipo, v_nullable, v_default
  from information_schema.columns c
  left join pg_catalog.pg_attribute a
    on a.attrelid = 'public.partes_diarios'::regclass
   and a.attname = c.column_name
   and not a.attisdropped
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where c.table_schema = 'public'
    and c.table_name = 'partes_diarios'
    and c.column_name = 'actividades_detalle';

  if v_tipo is distinct from 'jsonb'
     or v_nullable is distinct from 'NO'
     or v_default is distinct from '''[]''::jsonb' then
    raise exception
      'PARTES_ACTIVIDADES_DETALLE_POSTFLIGHT: esquema incompatible (tipo=%, nullable=%, default=%).',
      coalesce(v_tipo, 'ausente'),
      coalesce(v_nullable, 'ausente'),
      coalesce(v_default, 'ausente');
  end if;

  select
    count(*) filter (where actividades_detalle is null),
    count(*) filter (where actividades_detalle <> '[]'::jsonb)
  into v_null_count, v_nonempty_count
  from public.partes_diarios;

  if v_null_count <> 0 or v_nonempty_count <> 0 then
    raise exception
      'PARTES_ACTIVIDADES_DETALLE_POSTFLIGHT: filas históricas incompatibles (null=%, no_vacias=%).',
      v_null_count, v_nonempty_count;
  end if;
end;
$verificar_actividades_detalle$;

select pg_notify('pgrst', 'reload schema');
