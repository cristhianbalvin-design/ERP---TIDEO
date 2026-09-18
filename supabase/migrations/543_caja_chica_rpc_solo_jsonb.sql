-- La aplicación invoca exclusivamente la firma JSONB de la RPC.
-- Retirar la sobrecarga escalar evita resoluciones ambiguas en PostgREST
-- y deja una única API pública para registrar egresos.

drop function if exists public.registrar_egreso_caja_chica_atomico(
  text,
  numeric,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

select pg_notify('pgrst', 'reload schema');
