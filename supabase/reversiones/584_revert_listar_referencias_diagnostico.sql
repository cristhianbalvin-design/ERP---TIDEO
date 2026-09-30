-- Reversión de 584_listar_referencias_diagnostico.sql.
-- Ejecutar solo antes de liberar el frontend que dependa de esta función.
-- No contiene BEGIN, COMMIT ni ROLLBACK: el operador controla la transacción.

drop function if exists public.listar_referencias_diagnostico(text, text, text);
