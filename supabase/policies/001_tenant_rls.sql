-- TIDEO ERP - Politicas RLS base por tenant.
-- Requiere que auth.uid() exista y que usuarios_empresas vincule usuario con empresa.

alter table public.cuentas enable row level security;
alter table public.leads enable row level security;
alter table public.contactos enable row level security;
alter table public.oportunidades enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.hojas_costeo enable row level security;
alter table public.os_clientes enable row level security;
alter table public.compras_gastos enable row level security;
alter table public.movimientos_tesoreria enable row level security;
alter table public.financiamientos enable row level security;
alter table public.tabla_amortizacion enable row level security;
alter table public.pagos_financiamiento enable row level security;

create policy tenant_cuentas on public.cuentas
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_leads on public.leads
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_contactos on public.contactos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_oportunidades on public.oportunidades
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_cotizaciones on public.cotizaciones
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_hojas_costeo on public.hojas_costeo
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_os_clientes on public.os_clientes
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_compras_gastos on public.compras_gastos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_movimientos_tesoreria on public.movimientos_tesoreria
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_financiamientos on public.financiamientos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_tabla_amortizacion on public.tabla_amortizacion
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_pagos_financiamiento on public.pagos_financiamiento
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
