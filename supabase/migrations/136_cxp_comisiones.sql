-- Campos para flujo de comisiones en cuentas por pagar.

alter table public.cxp
  add column if not exists tipo_beneficiario text check (tipo_beneficiario in ('proveedor', 'personal')),
  add column if not exists personal_id text references public.personal_administrativo(id) on delete set null,
  add column if not exists recibo_honorarios_id text references public.recibos_honorarios(id) on delete set null,
  add column if not exists concepto text;
