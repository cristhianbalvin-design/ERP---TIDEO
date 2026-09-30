-- Reversión de 587_resolver_referencias_diagnostico.sql.
-- Ejecutar solo antes de liberar un frontend que dependa de esta función.
-- No contiene BEGIN, COMMIT ni ROLLBACK: el operador controla la transacción.

drop function if exists public.resolver_referencias_diagnostico(text, text, text[]);
