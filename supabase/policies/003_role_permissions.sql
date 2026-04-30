-- TIDEO ERP - Permisos por rol y accion.
-- Extiende la validacion de tenant con permisos funcionales por pantalla.

create or replace function public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and (r.es_admin_empresa = true or r.es_superadmin = true)
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

-- Las policies iniciales siguen cubriendo tenant. Estas policies agregan una
-- capa explicita de permisos para tablas financieras criticas.

drop policy if exists tenant_financiamientos on public.financiamientos;
create policy tenant_financiamientos_select on public.financiamientos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'ver')
  );
create policy tenant_financiamientos_insert on public.financiamientos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'crear')
  );
create policy tenant_financiamientos_update on public.financiamientos
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  );

drop policy if exists tenant_tabla_amortizacion on public.tabla_amortizacion;
create policy tenant_tabla_amortizacion_select on public.tabla_amortizacion
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'ver')
  );
create policy tenant_tabla_amortizacion_insert on public.tabla_amortizacion
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'crear')
  );
create policy tenant_tabla_amortizacion_update on public.tabla_amortizacion
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  );

drop policy if exists tenant_pagos_financiamiento on public.pagos_financiamiento;
create policy tenant_pagos_financiamiento_select on public.pagos_financiamiento
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'ver')
  );
create policy tenant_pagos_financiamiento_insert on public.pagos_financiamiento
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'crear')
  );

drop policy if exists tenant_compras_gastos on public.compras_gastos;
create policy tenant_compras_gastos_select on public.compras_gastos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'estado_resultados', 'ver_finanzas')
      or public.usuario_puede(empresa_id, 'tesoreria', 'ver_finanzas')
      or public.usuario_puede(empresa_id, 'financiamiento', 'ver_finanzas')
    )
  );
create policy tenant_compras_gastos_insert on public.compras_gastos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'estado_resultados', 'crear')
      or public.usuario_puede(empresa_id, 'financiamiento', 'crear')
    )
  );
create policy tenant_compras_gastos_update on public.compras_gastos
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'estado_resultados', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'estado_resultados', 'editar')
  );

drop policy if exists tenant_movimientos_tesoreria on public.movimientos_tesoreria;
create policy tenant_movimientos_tesoreria_select on public.movimientos_tesoreria
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'tesoreria', 'ver')
  );
create policy tenant_movimientos_tesoreria_insert on public.movimientos_tesoreria
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'tesoreria', 'crear')
      or public.usuario_puede(empresa_id, 'financiamiento', 'crear')
    )
  );
create policy tenant_movimientos_tesoreria_update on public.movimientos_tesoreria
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'tesoreria', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'tesoreria', 'editar')
  );
