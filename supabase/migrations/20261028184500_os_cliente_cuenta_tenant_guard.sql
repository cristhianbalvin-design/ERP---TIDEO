-- Impide que una OS Cliente referencie una cuenta inexistente o de otro tenant.
-- El control vive en BD para proteger tambien integraciones y clientes antiguos.

create or replace function public.validar_os_cliente_cuenta_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cuenta_id is not null and not exists (
    select 1
    from public.cuentas cuenta
    where cuenta.id = new.cuenta_id
      and cuenta.empresa_id = new.empresa_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'La cuenta seleccionada no existe o no pertenece a la empresa de la OS Cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists aa_os_clientes_validar_cuenta_tenant on public.os_clientes;
create trigger aa_os_clientes_validar_cuenta_tenant
before insert or update of empresa_id, cuenta_id on public.os_clientes
for each row execute function public.validar_os_cliente_cuenta_tenant();

select pg_notify('pgrst', 'reload schema');
