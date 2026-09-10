-- Identificacion fiscal de cuentas clientes.
-- Los registros historicos permanecen como RUC por defecto.
alter table public.cuentas
  add column if not exists tipo_documento text not null default 'RUC';

alter table public.cuentas
  drop constraint if exists cuentas_tipo_documento_check;

alter table public.cuentas
  add constraint cuentas_tipo_documento_check
  check (tipo_documento in ('RUC', 'TAX_ID_EXTRANJERO'));

comment on column public.cuentas.tipo_documento is
  'Tipo de identificacion fiscal de la cuenta: RUC o TAX_ID_EXTRANJERO.';
