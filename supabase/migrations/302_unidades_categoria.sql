-- TIDEO ERP - Fase 5 Parte B: unidades_organizacionales.categoria
--
-- getUserCategory (JS) debe devolver uno de 9 valores de un enum fijo (ROLE_CATEGORIES:
-- admin/comercial/operaciones/finanzas/rrhh/compras/logistica/customer_success/otro), porque
-- varios chequeos de permiso comparan contra esos strings exactos. Pero unidades_organizacionales
-- es texto libre por tenant, sin ningun mapeo a ese enum. Esta columna cierra ese hueco, con el
-- mismo patron exacto que roles.categoria (071_roles_categoria.sql): texto libre sin CHECK
-- constraint en BD, el enum se respeta solo en la UI.

alter table public.unidades_organizacionales
  add column if not exists categoria text default 'otro';

comment on column public.unidades_organizacionales.categoria is
  'Clasificacion de departamento para permisos (mismo enum que roles.categoria: admin, comercial, operaciones, finanzas, rrhh, compras, logistica, customer_success, otro). Sin CHECK constraint, igual que roles.categoria -- se respeta solo en la UI. Editable en Maestros -> Unidades Organizacionales.';

-- Backfill por coincidencia exacta de nombre (mismo criterio que ya usa
-- resolver_unidad_organizacional en 297_jerarquia_posiciones_rls.sql para las unidades
-- sinteticas que crea el trigger legado). Todo lo demas queda en 'otro' por default, a la
-- espera de que un admin las etiquete manualmente.
update public.unidades_organizacionales
set categoria = lower(trim(nombre))
where lower(trim(nombre)) in (
  'admin', 'comercial', 'operaciones', 'finanzas', 'rrhh',
  'compras', 'logistica', 'customer_success'
);

select pg_notify('pgrst', 'reload schema');
