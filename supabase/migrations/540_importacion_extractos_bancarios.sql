-- TIDEO ERP — Migración 540: trazabilidad y deduplicación de extractos bancarios

alter table public.movimientos_banco
  add column if not exists numero_operacion text,
  add column if not exists lote_importacion_id text;

create unique index if not exists idx_movimientos_banco_dedup_extracto
  on public.movimientos_banco(cuenta_bancaria_id, numero_operacion, fecha)
  where numero_operacion is not null;

create index if not exists idx_movimientos_banco_lote_importacion
  on public.movimientos_banco(empresa_id, lote_importacion_id);
