-- Campos para flujo de comisiones en recibos de honorarios.

alter table public.recibos_honorarios
  add column if not exists moneda text not null default 'PEN',
  add column if not exists personal_id text references public.personal_administrativo(id) on delete set null,
  add column if not exists motivo_retencion text;
