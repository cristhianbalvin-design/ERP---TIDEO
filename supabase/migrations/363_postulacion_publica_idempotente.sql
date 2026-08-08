-- DESCARTADA EXPLICITAMENTE POR SEG-2b.
--
-- Esta migracion nunca fue aplicada al proyecto remoto y su enfoque ya no es
-- valido: seguia confiando en empresa_id/vacante_id enviados por el cliente y
-- sobrescribia el candidato maestro. La implementacion definitiva vive en la
-- migracion 410_cerrar_postulacion_publica.sql.
--
-- Se conserva el numero 363 como no-op para que el historial local de
-- migraciones siga siendo monotono y Supabase pueda marcar esta version sin
-- ejecutar la definicion insegura anterior.

select 1;
