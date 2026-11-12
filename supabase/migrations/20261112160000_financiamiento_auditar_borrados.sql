-- TIDEO ERP - Auditoría de borrados en Financiamiento y Deuda.
-- La auditoría existente (audit_backend_minimo) solo registra INSERT y UPDATE. Para saber quién elimina
-- un préstamo o un pago, se agrega un trigger AFTER DELETE propio (no se toca la función compartida).
-- Aprobado por Cristhian el 2026-11-12, tras el borrado no rastreable de un préstamo.

create or replace function public.audit_borrado_financiamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo)
  values (OLD.empresa_id, auth.uid(), 'financiamiento', TG_TABLE_NAME, OLD.id::text, 'delete', to_jsonb(OLD), null);
  return OLD;
end;
$$;

revoke execute on function public.audit_borrado_financiamiento() from public, anon, authenticated;

drop trigger if exists audit_borrado_financiamientos on public.financiamientos;
create trigger audit_borrado_financiamientos
  after delete on public.financiamientos
  for each row execute function public.audit_borrado_financiamiento();

drop trigger if exists audit_borrado_pagos_financiamiento on public.pagos_financiamiento;
create trigger audit_borrado_pagos_financiamiento
  after delete on public.pagos_financiamiento
  for each row execute function public.audit_borrado_financiamiento();

do $$
begin
  if (select count(*) from pg_trigger where tgname in ('audit_borrado_financiamientos', 'audit_borrado_pagos_financiamiento')) <> 2 then
    raise exception 'No se crearon los triggers de auditoría de borrados';
  end if;
end $$;
