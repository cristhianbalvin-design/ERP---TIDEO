-- 669: una sola CxC por factura.
-- Garantiza en base de datos la regla 1 factura = 1 CxC (cxc.factura_id ya es NOT NULL).
-- Aditiva: solo crea un índice único. Falla y se revierte si existieran duplicados.

do $$
declare
  v_dups integer;
begin
  select count(*) into v_dups
  from (select factura_id from public.cxc group by factura_id having count(*) > 1) d;
  if v_dups > 0 then
    raise exception 'No se puede crear el índice único: % facturas tienen más de una CxC.', v_dups;
  end if;
end $$;

create unique index if not exists cxc_factura_id_unico on public.cxc (factura_id);

comment on index public.cxc_factura_id_unico is
  'Una sola cuenta por cobrar por factura (regla 1 factura = 1 CxC).';

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'cxc' and indexname = 'cxc_factura_id_unico'
  ) then
    raise exception 'Comprobación fallida: el índice cxc_factura_id_unico no existe.';
  end if;
end $$;
