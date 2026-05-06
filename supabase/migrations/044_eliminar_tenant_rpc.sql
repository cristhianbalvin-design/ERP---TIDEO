-- RPC para eliminar un tenant y todos sus datos relacionados.
-- Usa information_schema para encontrar todas las tablas con FK a empresas dinamicamente.
create or replace function public.eliminar_tenant_completo(p_empresa_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table  text;
  v_column text;
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo superadmin puede eliminar tenants.';
  end if;

  -- 1. Rompe referencia circular cotizaciones <-> hojas_costeo
  update public.cotizaciones set hoja_costeo_id = null where empresa_id = p_empresa_id;

  -- 2. Orden forzado para tablas que se referencian entre si
  delete from public.os_clientes  where empresa_id = p_empresa_id;
  delete from public.hojas_costeo where empresa_id = p_empresa_id;
  delete from public.cotizaciones where empresa_id = p_empresa_id;
  -- usuarios_empresas referencia roles, debe ir antes
  delete from public.usuarios_empresas where empresa_id = p_empresa_id;

  -- 3. Borra dinamicamente todas las demas tablas con FK a empresas
  for v_table, v_column in
    select kcu.table_name, kcu.column_name
    from information_schema.key_column_usage kcu
    join information_schema.referential_constraints rc
      on rc.constraint_name = kcu.constraint_name
    join information_schema.key_column_usage ccu
      on ccu.constraint_name = rc.unique_constraint_name
    where ccu.table_name = 'empresas'
      and ccu.column_name = 'id'
      and kcu.table_schema = 'public'
      and kcu.table_name not in (
        'os_clientes', 'hojas_costeo', 'cotizaciones',
        'usuarios_empresas', 'empresas'
      )
  loop
    execute format('delete from public.%I where %I = $1', v_table, v_column)
      using p_empresa_id;
  end loop;

  -- 4. Empresa
  delete from public.empresas where id = p_empresa_id;
end;
$$;

grant execute on function public.eliminar_tenant_completo(text) to authenticated;
