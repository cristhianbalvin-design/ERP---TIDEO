-- Backfill de responsables CRM.
-- Mantiene `responsable` como snapshot textual y rellena `responsable_id`
-- cuando el nombre coincide de forma unica con un usuario del mismo tenant.

with usuarios_unicos as (
  select
    empresa_id,
    lower(trim(nombre)) as responsable_key,
    min(id)::uuid as user_id
  from public.usuarios
  where id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and nullif(trim(nombre), '') is not null
  group by empresa_id, lower(trim(nombre))
  having count(*) = 1
)
update public.leads l
set responsable_id = u.user_id
from usuarios_unicos u
where l.responsable_id is null
  and l.empresa_id = u.empresa_id
  and lower(trim(l.responsable)) = u.responsable_key;

with usuarios_unicos as (
  select
    empresa_id,
    lower(trim(nombre)) as responsable_key,
    min(id)::uuid as user_id
  from public.usuarios
  where id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and nullif(trim(nombre), '') is not null
  group by empresa_id, lower(trim(nombre))
  having count(*) = 1
)
update public.cuentas c
set responsable_id = u.user_id
from usuarios_unicos u
where c.responsable_id is null
  and c.empresa_id = u.empresa_id
  and lower(trim(c.responsable_comercial)) = u.responsable_key;

with usuarios_unicos as (
  select
    empresa_id,
    lower(trim(nombre)) as responsable_key,
    min(id)::uuid as user_id
  from public.usuarios
  where id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and nullif(trim(nombre), '') is not null
  group by empresa_id, lower(trim(nombre))
  having count(*) = 1
)
update public.oportunidades o
set responsable_id = u.user_id
from usuarios_unicos u
where o.responsable_id is null
  and o.empresa_id = u.empresa_id
  and lower(trim(o.responsable)) = u.responsable_key;
