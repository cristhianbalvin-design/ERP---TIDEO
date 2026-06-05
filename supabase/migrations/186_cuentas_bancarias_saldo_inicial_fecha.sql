alter table public.cuentas_bancarias
  add column if not exists saldo_inicial numeric(14,2) not null default 0,
  add column if not exists fecha_saldo_inicial date;

comment on column public.cuentas_bancarias.saldo_inicial is
  'Saldo preexistente de la cuenta bancaria al iniciar el uso del sistema.';

comment on column public.cuentas_bancarias.fecha_saldo_inicial is
  'Fecha de referencia desde la cual el saldo inicial configurado es valido.';
