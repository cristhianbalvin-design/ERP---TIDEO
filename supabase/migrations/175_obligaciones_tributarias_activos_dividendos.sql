-- Obligaciones tributarias, dividendos y kardex de activos fijos.

alter table public.cxp
  add column if not exists tributo_tipo text,
  add column if not exists tributo_periodo text,
  add column if not exists tributo_formulario text,
  add column if not exists socio_nombre text,
  add column if not exists socio_participacion_pct numeric(7,4),
  add column if not exists periodo_utilidades text,
  add column if not exists acta_referencia text;

create index if not exists idx_cxp_tributos
  on public.cxp(empresa_id, tributo_tipo, tributo_periodo)
  where tributo_tipo is not null or lower(coalesce(tipo_comprobante, '')) = 'tributo';

create index if not exists idx_cxp_dividendos
  on public.cxp(empresa_id, periodo_utilidades)
  where tipo_beneficiario = 'socio_accionista'
     or lower(coalesce(tipo_comprobante, '')) = 'distribucion_utilidades';

alter table public.compras_gastos
  add column if not exists activo_estado text,
  add column if not exists proveedor_referencia text,
  add column if not exists notas text,
  add column if not exists archivo_url text;

create index if not exists idx_compras_gastos_activos_estado
  on public.compras_gastos(empresa_id, activo_estado)
  where es_activo_fijo = true;
