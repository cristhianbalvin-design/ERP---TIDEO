-- El organigrama es la unica fuente de verdad para las jefaturas:
-- posiciones.reporta_a_posicion_id -> ocupante activo de la posicion padre.
-- jefe_user_id se mantiene solo como proyeccion de compatibilidad y se
-- reconstruye desde esa relacion, nunca al reves.

-- Correccion solicitada para ZAHORY. Se protege por tenant e IDs exactos para
-- que el historial de otros tenants/entornos no se vea afectado.
update public.posiciones hija
set reporta_a_posicion_id = padre.id,
    updated_at = now()
from public.posiciones padre
where hija.id = 'a1419ccd-62ea-4ab1-b4a8-bc0618befd87'::uuid
  and hija.empresa_id = 'emp_20541435833'
  and padre.id = '28ae2c4c-d403-4abf-a060-a16bb689b22f'::uuid
  and padre.empresa_id = hija.empresa_id
  and hija.reporta_a_posicion_id is distinct from padre.id;

-- Ninguna jefatura de compatibilidad puede conservar una relacion que no este
-- representada en una posicion activa. Primero se limpia y luego se proyecta
-- desde las asignaciones principales que originan cada posicion.
update public.usuarios_asignaciones
set jefe_user_id = null,
    updated_at = now()
where principal is true
  and activo is true
  and jefe_user_id is not null;

update public.usuarios_empresas
set jefe_user_id = null,
    updated_at = now()
where jefe_user_id is not null;

with jefaturas as (
  select
    ua.id as asignacion_id,
    ua.user_id,
    ua.empresa_id,
    public.resolver_jefe_desde_posicion(p.id, ua.user_id) as jefe_user_id
  from public.usuarios_asignaciones ua
  join public.posiciones p
    on p.origen_asignacion_id = ua.id
   and p.empresa_id = ua.empresa_id
   and p.activa is true
  where ua.principal is true
    and ua.activo is true
)
update public.usuarios_asignaciones ua
set jefe_user_id = j.jefe_user_id,
    updated_at = now()
from jefaturas j
where ua.id = j.asignacion_id;

with jefaturas as (
  select
    ua.user_id,
    ua.empresa_id,
    public.resolver_jefe_desde_posicion(p.id, ua.user_id) as jefe_user_id
  from public.usuarios_asignaciones ua
  join public.posiciones p
    on p.origen_asignacion_id = ua.id
   and p.empresa_id = ua.empresa_id
   and p.activa is true
  where ua.principal is true
    and ua.activo is true
)
update public.usuarios_empresas ue
set jefe_user_id = j.jefe_user_id,
    updated_at = now()
from jefaturas j
where ue.user_id = j.user_id
  and ue.empresa_id = j.empresa_id;

select pg_notify('pgrst', 'reload schema');
