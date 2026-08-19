-- 441: Mandatory DBS classification for work orders.
-- Proposal for human review: run only after the frontend and historical
-- work-order backfill have been completed.

alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_clasificacion_dbs_obligatoria_chk
    check (tipo_trabajo is not null and cargo_financiero is not null) not valid;

alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_raiz_costo_exactamente_una_chk
    check (num_nonnulls(os_cliente_id, contrato_alquiler_id, equipo_id) = 1) not valid;

select pg_notify('pgrst', 'reload schema');
