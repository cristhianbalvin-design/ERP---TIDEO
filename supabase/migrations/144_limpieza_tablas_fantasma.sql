-- TIDEO ERP - Limpieza de tablas fantasma.
-- Elimina tablas vacias que no son usadas por el frontend:
-- - public.tickets_soporte: residuo de la migracion 065.
-- - public.os_cliente: tabla huerfana; la tabla activa es public.os_clientes.

do $$
declare
  target_schema text;
  target_name text;
  target_oid oid;
  incoming_fk record;
  dropped_fks integer;
begin
  for target_schema, target_name in
    select schema_name, table_name
    from (
      values
        ('public', 'tickets_soporte'),
        ('public', 'os_cliente')
    ) as targets(schema_name, table_name)
  loop
    select to_regclass(format('%I.%I', target_schema, target_name))::oid
      into target_oid;

    if target_oid is null then
      raise notice 'Tabla %.% no existe; se omite.', target_schema, target_name;
      continue;
    end if;

    dropped_fks := 0;

    for incoming_fk in
      select
        con.conname as constraint_name,
        src_ns.nspname as source_schema,
        src_rel.relname as source_table
      from pg_constraint con
      join pg_class src_rel on src_rel.oid = con.conrelid
      join pg_namespace src_ns on src_ns.oid = src_rel.relnamespace
      where con.contype = 'f'
        and con.confrelid = target_oid
      order by src_ns.nspname, src_rel.relname, con.conname
    loop
      execute format(
        'alter table %I.%I drop constraint %I',
        incoming_fk.source_schema,
        incoming_fk.source_table,
        incoming_fk.constraint_name
      );

      dropped_fks := dropped_fks + 1;
      raise notice
        'FK entrante eliminada: %.% -> %.% (%)',
        incoming_fk.source_schema,
        incoming_fk.source_table,
        target_schema,
        target_name,
        incoming_fk.constraint_name;
    end loop;

    if dropped_fks = 0 then
      raise notice 'Sin FKs entrantes hacia %.%.', target_schema, target_name;
    end if;

    execute format('drop table if exists %I.%I', target_schema, target_name);
    raise notice 'Tabla %.% eliminada.', target_schema, target_name;
  end loop;
end $$;
