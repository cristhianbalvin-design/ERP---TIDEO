-- Backfill de permisos_roles para las 18 pantallas que faltaban en el
-- catalogo pantallasPermisos (src/data.js). Activa puede_ver=true solo
-- para roles activos cuya categoria coincide con el modulo mapeado, y
-- para roles categoria='admin' o nivel_jerarquico='direccion' (acceso total).
-- Idempotente via ON CONFLICT (rol_id, pantalla).

insert into public.permisos_roles (rol_id, pantalla, puede_ver)
select r.id, m.pantalla, true
from public.roles r
cross join (values
  ('marketing', 'comercial'),
  ('ia_comercial', 'comercial'),
  ('ia_operativa', 'operaciones'),
  ('campo', 'operaciones'),
  ('facturacion', 'finanzas'),
  ('valorizacion', 'finanzas'),
  ('presupuestos', 'finanzas'),
  ('ia_financiera', 'finanzas'),
  ('cs_onboarding', 'customer_success'),
  ('cs_planes', 'customer_success'),
  ('cs_health', 'customer_success'),
  ('cs_renovaciones', 'customer_success'),
  ('cs_fidelizacion', 'customer_success'),
  ('bi_cs', 'customer_success'),
  ('api_keys', 'admin'),
  ('organigrama', 'admin'),
  ('servicios', 'admin'),
  ('tarifarios', 'admin')
) as m(pantalla, categoria)
where r.activo = true
  and (r.categoria = m.categoria or r.categoria = 'admin' or r.nivel_jerarquico = 'direccion')
on conflict (rol_id, pantalla) do update set puede_ver = true, updated_at = now();
