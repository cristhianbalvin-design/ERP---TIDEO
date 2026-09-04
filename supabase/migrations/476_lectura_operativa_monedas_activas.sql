-- Los módulos operativos pueden poblar selectores de moneda sin habilitar
-- el módulo de Maestros. Impuestos y unidades permanecen protegidos por el
-- permiso maestros/ver, al igual que cualquier moneda inactiva.

drop policy if exists tenant_miu_select on public.monedas_impuestos_unidades;

create policy tenant_miu_select on public.monedas_impuestos_unidades
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'maestros', 'ver')
      or (tipo = 'moneda' and estado = 'activo')
    )
  );

select pg_notify('pgrst', 'reload schema');
