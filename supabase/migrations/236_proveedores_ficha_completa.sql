-- Ficha extendida de proveedores usada por la pantalla de Compras.
-- Evita falsos guardados locales cuando el formulario envia campos de ficha
-- que no existian en la tabla base.

alter table public.proveedores
  add column if not exists codigo text,
  add column if not exists pais text default 'Peru',
  add column if not exists nombre_comercial text,
  add column if not exists categoria text,
  add column if not exists servicios text,
  add column if not exists contacto_nombre text,
  add column if not exists contacto_cargo text,
  add column if not exists web text,
  add column if not exists direccion text,
  add column if not exists responsable_compras text,
  add column if not exists notas text,
  add column if not exists total_evaluaciones integer default 0,
  add column if not exists moneda text default 'PEN',
  add column if not exists sujeto_retencion boolean default false,
  add column if not exists pct_retencion numeric(5,2) default 0,
  add column if not exists limite_gasto_mensual numeric(14,2) default 0,
  add column if not exists total_ocs integer default 0,
  add column if not exists monto_total_comprado numeric(14,2) default 0,
  add column if not exists fecha_ultima_oc date,
  add column if not exists fecha_homologacion date;

update public.proveedores
set
  codigo = coalesce(nullif(btrim(codigo), ''), upper(left(id, 3)) || '-' || right(id, 3)),
  pais = coalesce(nullif(btrim(pais), ''), 'Peru'),
  categoria = coalesce(nullif(btrim(categoria), ''), rubro),
  rubro = coalesce(nullif(btrim(rubro), ''), categoria),
  nombre_comercial = coalesce(nullif(btrim(nombre_comercial), ''), razon_social),
  fecha_homologacion = coalesce(fecha_homologacion, homologado_at::date)
where codigo is null
   or pais is null
   or categoria is null
   or rubro is null
   or nombre_comercial is null
   or fecha_homologacion is null;

create index if not exists idx_proveedores_empresa_codigo
  on public.proveedores(empresa_id, codigo);

notify pgrst, 'reload schema';
