-- TIDEO ERP - Copiar maestros de emp_tideo → emp_20609996464
-- Tablas: cargos_empresa, areas_empresa, sedes
-- IDs nuevos generados con prefijo de empresa + hash del ID original para evitar colisiones.

-- ==============================================================================
-- 1. Cargos de la empresa
-- ==============================================================================
insert into public.cargos_empresa (id, empresa_id, codigo, nombre, tipo, detalle, estado, created_at, updated_at)
select
  'emp_20609996464_' || substr(md5(id), 1, 12),
  'emp_20609996464',
  codigo,
  nombre,
  tipo,
  detalle,
  estado,
  now(),
  now()
from public.cargos_empresa
where empresa_id = 'emp_tideo'
on conflict (id) do nothing;

-- ==============================================================================
-- 2. Areas de la empresa
-- ==============================================================================
insert into public.areas_empresa (id, empresa_id, codigo, nombre, tipo, responsable, detalle, estado, created_at, updated_at)
select
  'emp_20609996464_' || substr(md5(id), 1, 12),
  'emp_20609996464',
  codigo,
  nombre,
  tipo,
  responsable,
  detalle,
  estado,
  now(),
  now()
from public.areas_empresa
where empresa_id = 'emp_tideo'
on conflict (id) do nothing;

-- ==============================================================================
-- 3. Sedes y ubicaciones GPS
-- ==============================================================================
insert into public.sedes (id, empresa_id, codigo, nombre, direccion, gps, estado, created_at, updated_at)
select
  'emp_20609996464_' || substr(md5(id), 1, 12),
  'emp_20609996464',
  codigo,
  nombre,
  direccion,
  gps,
  estado,
  now(),
  now()
from public.sedes
where empresa_id = 'emp_tideo'
on conflict (id) do nothing;
