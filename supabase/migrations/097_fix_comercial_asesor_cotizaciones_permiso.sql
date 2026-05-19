-- Fix: asegurar que todos los roles comerciales pueden crear cotizaciones.
-- Se usa categoria = 'comercial' (migration 071) para cubrir tanto roles predefinidos
-- como roles personalizados que el tenant haya marcado como comercial.
-- Ambos tipos (jefe y asesor) deben tener este permiso segun asignar_permisos_default_a_rol.

-- Actualizar filas existentes
update public.permisos_roles
set puede_crear = true,
    puede_ver   = true
where pantalla = 'cotizaciones'
  and rol_id in (
    select id from public.roles where categoria = 'comercial'
  );

-- Insertar fila para roles comerciales que no tienen ningún registro para 'cotizaciones'
insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar)
select r.id, 'cotizaciones', true, true, true
from public.roles r
where r.categoria = 'comercial'
  and not exists (
    select 1 from public.permisos_roles pr
    where pr.rol_id = r.id and pr.pantalla = 'cotizaciones'
  );
