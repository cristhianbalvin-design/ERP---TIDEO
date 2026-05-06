-- RPC para eliminar un tenant y todos sus datos relacionados en orden correcto.
-- Usa security definer para ejecutar con privilegios elevados.
create or replace function public.eliminar_tenant_completo(p_empresa_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo superadmin puede eliminar tenants.';
  end if;

  -- 1. Tablas que referencian cotizaciones u os_clientes (borrar antes que sus padres)
  delete from public.hojas_costeo      where empresa_id = p_empresa_id;
  delete from public.os_clientes       where empresa_id = p_empresa_id;
  delete from public.cotizaciones      where empresa_id = p_empresa_id;
  delete from public.actividades_comerciales where empresa_id = p_empresa_id;
  delete from public.agenda_comercial  where empresa_id = p_empresa_id;

  -- 2. Maestros y configuración del tenant
  delete from public.cargos_empresa         where empresa_id = p_empresa_id;
  delete from public.especialidades_tecnicas where empresa_id = p_empresa_id;
  delete from public.tipos_servicio_interno  where empresa_id = p_empresa_id;
  delete from public.sedes                   where empresa_id = p_empresa_id;
  delete from public.industrias              where empresa_id = p_empresa_id;
  -- cuadrilla_miembros tiene ON DELETE CASCADE en cuadrillas
  delete from public.cuadrillas              where empresa_id = p_empresa_id;

  -- 3. Usuarios y roles del tenant
  delete from public.usuarios_empresas where empresa_id = p_empresa_id;
  delete from public.usuarios          where empresa_id = p_empresa_id;
  delete from public.roles             where empresa_id = p_empresa_id;

  -- 4. Empresa
  delete from public.empresas where id = p_empresa_id;
end;
$$;

grant execute on function public.eliminar_tenant_completo(text) to authenticated;
