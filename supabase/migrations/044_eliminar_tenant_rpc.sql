-- RPC para eliminar un tenant y todos sus datos.
-- Usa pg_attribute para encontrar TODAS las tablas con empresa_id (con o sin FK declarada).
-- Multi-pass resuelve el orden automaticamente.
create or replace function public.eliminar_tenant_completo(p_empresa_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table     text;
  v_column    text;
  v_ref_table text;
  v_pass      int;
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo superadmin puede eliminar tenants.';
  end if;

  -- Disable triggers and FK checks to avoid circular dependencies and cascade blocks
  execute 'set local session_replication_role = replica';

  -- 1. Nullea FK nullable entre tablas del tenant (rompe referencias circulares)
  for v_table, v_column in
    select child_cls.relname, child_att.attname
    from pg_constraint c
    join pg_class     child_cls  on child_cls.oid  = c.conrelid
    join pg_class     parent_cls on parent_cls.oid = c.confrelid
    join pg_namespace nsp        on nsp.oid = child_cls.relnamespace and nsp.nspname = 'public'
    join pg_attribute child_att  on child_att.attrelid = c.conrelid and child_att.attnum = c.conkey[1]
    join pg_attribute has_emp    on has_emp.attrelid = c.conrelid   and has_emp.attname = 'empresa_id' and not has_emp.attisdropped
    where c.contype = 'f'
      and not child_att.attnotnull
      and parent_cls.relname != 'empresas'
      and child_cls.relname  != parent_cls.relname
  loop
    execute format(
      'update public.%I set %I = null where empresa_id = $1',
      v_table, v_column
    ) using p_empresa_id;
  end loop;

  -- 2. usuarios_empresas antes que roles (FK NOT NULL)
  delete from public.usuarios_empresas where empresa_id = p_empresa_id;

  -- 3. Multi-pass (15 pasadas):
  --    a) Borra tablas SIN empresa_id que referencian tablas CON empresa_id
  --    b) Borra TODAS las tablas con columna empresa_id (con o sin FK a empresas)
  --    Si alguna falla por FK, la salta; en la siguiente pasada ya no tiene dependencias.
  for v_pass in 1..15 loop

    -- 3a. Tablas sin empresa_id que referencian una tabla que sí lo tiene
    for v_table, v_column, v_ref_table in
      select child_cls.relname, child_att.attname, parent_cls.relname
      from pg_constraint c
      join pg_class     child_cls  on child_cls.oid  = c.conrelid
      join pg_class     parent_cls on parent_cls.oid = c.confrelid
      join pg_namespace nsp        on nsp.oid = child_cls.relnamespace and nsp.nspname = 'public'
      join pg_attribute child_att  on child_att.attrelid = c.conrelid  and child_att.attnum = c.conkey[1]
      join pg_attribute has_emp    on has_emp.attrelid = c.confrelid   and has_emp.attname = 'empresa_id' and not has_emp.attisdropped
      where c.contype = 'f'
        and parent_cls.relname != 'empresas'
        and not exists (
          select 1 from pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'empresa_id' and a.attnum > 0 and not a.attisdropped
        )
    loop
      begin
        execute format(
          'delete from public.%I where %I in (select id from public.%I where empresa_id = $1)',
          v_table, v_column, v_ref_table
        ) using p_empresa_id;
      exception when foreign_key_violation then null;
      end;
    end loop;

    -- 3b. Todas las tablas con columna empresa_id (independientemente de si hay FK declarada)
    for v_table in
      select cls.relname
      from pg_class cls
      join pg_namespace nsp on nsp.oid = cls.relnamespace and nsp.nspname = 'public'
      join pg_attribute att on att.attrelid = cls.oid
                           and att.attname = 'empresa_id'
                           and att.attnum > 0
                           and not att.attisdropped
      where cls.relkind = 'r'
        and cls.relname not in ('empresas', 'usuarios_empresas')
    loop
      begin
        execute format(
          'delete from public.%I where empresa_id = $1',
          v_table
        ) using p_empresa_id;
      exception when foreign_key_violation then null;
      end;
    end loop;

  end loop; -- fin multi-pass

  -- 4. Empresa
  delete from public.empresas where id = p_empresa_id;

  -- Restore triggers and FK checks
  execute 'set local session_replication_role = default';
end;
$$;

grant execute on function public.eliminar_tenant_completo(text) to authenticated;
