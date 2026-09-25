-- Paso 4 SPOT: exclusión mutua entre retención y detracción.

alter table public.facturas
  add constraint facturas_retencion_detraccion_exclusion_ck
  check (not (aplica_retencion and aplica_detraccion));
