-- Match bancario como mecanismo de vinculacion de movimientos de tesoreria a cuentas bancarias.
-- En este esquema la tabla equivalente a flujo_caja es public.movimientos_tesoreria.

alter table public.movimientos_tesoreria
  add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id),
  add column if not exists tc_aplicado numeric(14,6),
  add column if not exists monto_en_moneda_cuenta numeric(14,2);

create index if not exists idx_movimientos_tesoreria_cuenta_bancaria
  on public.movimientos_tesoreria(empresa_id, cuenta_bancaria_id, fecha);

comment on column public.movimientos_tesoreria.cuenta_bancaria_id is
  'Cuenta bancaria real vinculada por match bancario. Null indica movimiento sin cuenta asignada.';
comment on column public.movimientos_tesoreria.tc_aplicado is
  'Tipo de cambio congelado al vincular el movimiento a una cuenta de moneda distinta.';
comment on column public.movimientos_tesoreria.monto_en_moneda_cuenta is
  'Monto equivalente en la moneda de la cuenta bancaria vinculada.';

alter table public.movimientos_banco
  add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id);

create index if not exists idx_movimientos_banco_cuenta_bancaria
  on public.movimientos_banco(empresa_id, cuenta_bancaria_id, fecha);
