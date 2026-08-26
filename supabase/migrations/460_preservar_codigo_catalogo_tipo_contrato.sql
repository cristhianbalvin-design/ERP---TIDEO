-- El tipo de contrato del maestro puede ser más granular que la clasificación
-- histórica de personal (p. ej. SUNAT 1001, 1002 y 1003 son "plazo_fijo").
-- Persistir ambos evita que al editar se pierda la selección original.
alter table public.personal_operativo
  add column if not exists tipo_contrato_catalogo_codigo text;

alter table public.personal_administrativo
  add column if not exists tipo_contrato_catalogo_codigo text;

-- Algunas cargas iniciales crearon el catálogo con nombre pero sin código. Un
-- select controlado no puede distinguir opciones cuyo value es ''. Se reparan
-- los códigos SUNAT conocidos y los tipos personalizados reciben un código
-- estable basado en su identificador.
update public.tipos_contrato
set codigo = case upper(btrim(nombre))
  when 'PLAZO INDETERMINADO' then '1000'
  when 'PLAZO FIJO - POR INICIO O INCREMENTO DE ACTIVIDAD' then '1001'
  when 'PLAZO FIJO - POR NECESIDAD DE MERCADO' then '1002'
  when 'PLAZO FIJO - POR SUPLENCIA' then '1003'
  when 'PLAZO FIJO - POR SERVICIO ESPECIFICO' then '1004'
  when 'TIEMPO PARCIAL' then '1005'
  else 'TCON-' || id
end
where nullif(btrim(codigo), '') is null;

comment on column public.personal_operativo.tipo_contrato_catalogo_codigo is
  'Código del maestro tipos_contrato seleccionado. tipo_contrato conserva la clasificación compatible con nómina.';
comment on column public.personal_administrativo.tipo_contrato_catalogo_codigo is
  'Código del maestro tipos_contrato seleccionado. tipo_contrato conserva la clasificación compatible con nómina.';

-- Backfill determinista para fichas históricas. Para los registros que solo
-- tenían la categoría previa se usa el primer código compatible del catálogo.
update public.personal_operativo p
set tipo_contrato_catalogo_codigo = (
  select tc.codigo
  from public.tipos_contrato tc
  where tc.empresa_id = p.empresa_id
    and tc.estado = 'activo'
    and (
      (p.tipo_contrato = 'indefinido' and tc.nombre ilike '%indeterminado%')
      or (p.tipo_contrato = 'plazo_fijo' and (tc.nombre ilike '%plazo fijo%' or tc.nombre ilike '%temporal%'))
      or (p.tipo_contrato = 'obra_determinada' and (tc.nombre ilike '%obra determinada%' or tc.nombre ilike '%obra o servicio%'))
      or (p.tipo_contrato = 'por_encargo' and tc.nombre ilike '%encargo%')
    )
  order by tc.codigo
  limit 1
)
where nullif(btrim(p.tipo_contrato_catalogo_codigo), '') is null;

update public.personal_administrativo p
set tipo_contrato_catalogo_codigo = (
  select tc.codigo
  from public.tipos_contrato tc
  where tc.empresa_id = p.empresa_id
    and tc.estado = 'activo'
    and (
      (p.tipo_contrato = 'indefinido' and tc.nombre ilike '%indeterminado%')
      or (p.tipo_contrato = 'plazo_fijo' and (tc.nombre ilike '%plazo fijo%' or tc.nombre ilike '%temporal%'))
      or (p.tipo_contrato = 'obra_determinada' and (tc.nombre ilike '%obra determinada%' or tc.nombre ilike '%obra o servicio%'))
      or (p.tipo_contrato = 'por_encargo' and tc.nombre ilike '%encargo%')
    )
  order by tc.codigo
  limit 1
)
where nullif(btrim(p.tipo_contrato_catalogo_codigo), '') is null;
