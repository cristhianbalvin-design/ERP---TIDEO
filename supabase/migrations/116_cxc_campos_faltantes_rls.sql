-- Campos que el flujo de facturación escribe en CxC al emitir y acreditar.
alter table public.cxc
  add column if not exists glosa          text,
  add column if not exists condicion_pago text,
  add column if not exists notas          text;

-- RLS update ampliado: roles normales necesitan actualizar CxC
-- al registrar cobros y al emitir notas de crédito/débito.
drop policy if exists cxc_update on public.cxc;
create policy cxc_update on public.cxc
  for update
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
