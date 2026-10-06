-- Verificación de precondiciones 594. Solo lectura; el rollback mantiene el estilo del lote.
BEGIN;
CREATE TEMP TABLE _594_preconditions (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);
INSERT INTO _594_preconditions
SELECT 'tablas base',
       to_regclass('public.diagnosticos_tecnicos') IS NOT NULL
       AND to_regclass('public.diagnostico_tecnico_lineas') IS NOT NULL
       AND to_regclass('public.diagnostico_tecnico_linea_materiales') IS NOT NULL,
       'Cabecera, líneas y materiales de fase2';
INSERT INTO _594_preconditions
SELECT 'funciones existentes sin reemplazo',
       to_regprocedure('public.validar_diagnostico_tecnico_referencias()') IS NOT NULL,
       'La función actual de cabecera permanece intacta; 594 no reemplaza funciones existentes';
INSERT INTO _594_preconditions
SELECT 'policy UPDATE de fase2', EXISTS (
         SELECT 1 FROM pg_policy WHERE polrelid='public.diagnosticos_tecnicos'::regclass
           AND polname='diagnosticos_tecnicos_update'),
       'Fuente: fase2 líneas 173; definición previa restaurada por el revert';
SELECT * FROM _594_preconditions ORDER BY prueba;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM _594_preconditions WHERE NOT ok), 'PRECONDITION_FAILED: revisar resultado 594';
END $$;
ROLLBACK;
