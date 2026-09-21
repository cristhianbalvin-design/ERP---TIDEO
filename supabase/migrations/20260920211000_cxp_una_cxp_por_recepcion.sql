-- Una recepcion puede tener como maximo una CxP vinculada.
-- Las recepciones sin factura conservan recepcion_id NULL en cxp.
create unique index if not exists uq_cxp_una_por_recepcion
  on public.cxp(recepcion_id)
  where recepcion_id is not null;
