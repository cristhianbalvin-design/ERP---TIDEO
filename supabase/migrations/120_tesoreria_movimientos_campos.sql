-- Campos adicionales para movimientos de tesorería: categoría, manual, referencia
alter table public.movimientos_tesoreria
  add column if not exists categoria         text,
  add column if not exists es_manual         boolean not null default false,
  add column if not exists referencia        text,
  add column if not exists comprobante_url   text,
  add column if not exists estado            text not null default 'activo';

-- Umbral mínimo de liquidez en configuración de empresa
alter table public.empresas
  add column if not exists umbral_liquidez_minimo numeric(14,2) default 0;

comment on column public.movimientos_tesoreria.categoria is
  'Valores: cobro_factura, anticipo_cliente, otros_ingresos, pago_proveedor, planilla, cargas_sociales, cuota_financiamiento, caja_chica, gasto_operativo, otros_egresos, transferencia';
comment on column public.movimientos_tesoreria.es_manual is
  'true = registrado manualmente por usuario, false = generado automáticamente por el sistema';
