-- Repara el vínculo inverso de cotizaciones creadas antes de que la creación
-- de OS actualizara también cotizaciones.os_cliente_id.
-- Solo actúa cuando una cotización es referencia primaria de una única OS;
-- los casos ambiguos se conservan para revisión manual.

with referencias_primarias_unicas as (
  select
    os.empresa_id,
    os.cotizacion_id,
    min(os.id) as os_cliente_id
  from public.os_clientes os
  where os.cotizacion_id is not null
  group by os.empresa_id, os.cotizacion_id
  having count(*) = 1
)
update public.cotizaciones c
set os_cliente_id = r.os_cliente_id,
    updated_at = now()
from referencias_primarias_unicas r
where c.id = r.cotizacion_id
  and c.empresa_id = r.empresa_id
  and c.os_cliente_id is null;

select pg_notify('pgrst', 'reload schema');
