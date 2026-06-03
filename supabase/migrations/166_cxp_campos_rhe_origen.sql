-- TIDEO ERP — Migración 166: Campos RHE, origen y trazabilidad en cxp
-- Agrega columnas que el frontend envía y que no existían en la tabla,
-- causando rechazos silenciosos en Supabase.

alter table public.cxp
  add column if not exists tipo_comprobante      text,
  add column if not exists origen                text,
  add column if not exists motivo_cxp            text,
  add column if not exists monto_bruto           numeric(14,2),
  add column if not exists retencion_ir          numeric(14,2) default 0,
  add column if not exists ruc_emisor            text,
  add column if not exists nombre_emisor         text,
  add column if not exists archivo_factura_url   text,
  add column if not exists archivo_constancia_url text,
  add column if not exists tipo_cambio           numeric(10,4),
  add column if not exists moneda_original       text,
  add column if not exists monto_original        numeric(14,2),
  add column if not exists ot_vinc_id            text;

select pg_notify('pgrst', 'reload schema');
