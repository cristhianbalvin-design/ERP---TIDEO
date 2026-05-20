-- Vincula CxC a su OS Cliente para poder filtrar y calcular saldo por OS.
alter table public.cxc
  add column if not exists os_cliente_id text references public.os_clientes(id);
