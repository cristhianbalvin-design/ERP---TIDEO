-- TIDEO ERP - Control de costos OT / OS Cliente.
-- Campos idempotentes para estimado propio de OT, overhead de OS y tareo admin por OS.

alter table public.ordenes_trabajo
  add column if not exists costo_estimado_ot numeric(14,2),
  add column if not exists estimado_detalle jsonb default null,
  add column if not exists estimado_congelado_en timestamptz;

alter table public.os_clientes
  add column if not exists presupuesto_estimado numeric(14,2),
  add column if not exists overhead_estimado_monto numeric(14,2),
  add column if not exists overhead_estimado_pct numeric(8,4),
  add column if not exists overhead_modo varchar(20) not null default 'monto';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.os_clientes'::regclass
      and conname = 'os_clientes_overhead_modo_chk'
  ) then
    alter table public.os_clientes
      add constraint os_clientes_overhead_modo_chk
      check (overhead_modo in ('monto', 'porcentaje'));
  end if;
end $$;

alter table public.tareos_admin
  add column if not exists os_id text references public.os_clientes(id) on delete set null;

-- Las pantallas de compras ya guardan ot_id en OC/OSI; estos campos permiten usar
-- esa relacion para comprometidos sin depender de datos JSON.
alter table public.ordenes_compra
  add column if not exists ot_id text references public.ordenes_trabajo(id) on delete set null;

alter table public.ordenes_servicio_interna
  add column if not exists ot_id text references public.ordenes_trabajo(id) on delete set null;

create index if not exists idx_ot_costo_estimado_ot
  on public.ordenes_trabajo(empresa_id, os_cliente_id)
  where costo_estimado_ot is not null;

create index if not exists idx_tareos_admin_os_overhead
  on public.tareos_admin(empresa_id, os_id, fecha desc)
  where os_id is not null and ot_id is null;

create index if not exists idx_oc_ot
  on public.ordenes_compra(empresa_id, ot_id, estado)
  where ot_id is not null;

create index if not exists idx_osi_ot
  on public.ordenes_servicio_interna(empresa_id, ot_id, estado)
  where ot_id is not null;

create index if not exists idx_compras_gastos_ot_vinc
  on public.compras_gastos(empresa_id, ot_vinc_id, estado)
  where ot_vinc_id is not null;

select pg_notify('pgrst', 'reload schema');
