-- Aprobación interna de cotizaciones antes de enviar al cliente.
-- El jefe/admin aprueba y solo entonces el asesor puede hacer "Enviar a cliente".

alter table public.cotizaciones
  add column if not exists aprobada_interna_por text,       -- nombre del aprobador interno
  add column if not exists aprobada_interna_at  timestamptz; -- cuándo fue aprobada
