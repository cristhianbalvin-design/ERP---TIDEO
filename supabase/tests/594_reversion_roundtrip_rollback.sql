-- Round-trip SQL del revert 594: captura objetos, ejecuta su inversa estructural,
-- comprueba la policy original de fase2 y revierte toda la prueba al finalizar.
BEGIN;
CREATE TEMP TABLE _594_before_triggers AS
SELECT tgrelid::regclass AS tabla,tgname,pg_get_triggerdef(oid) AS definicion
FROM pg_trigger WHERE tgname IN ('a_594_bloquear_linea_diagnostico_emitido',
 'a_594_bloquear_material_diagnostico_emitido','zzz_594_proteger_diagnostico_tecnico_estado',
 'diagnostico_tecnico_estado_historial_inmutable') AND NOT tgisinternal;
CREATE TEMP TABLE _594_before_functions AS
SELECT p.oid::regprocedure AS firma,pg_get_functiondef(p.oid) AS definicion,p.proacl::text AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('emitir_diagnostico_tecnico','reabrir_diagnostico_tecnico',
 'proteger_diagnostico_tecnico_estado','proteger_diagnostico_tecnico_historial',
 'bloquear_linea_diagnostico_emitido_594','bloquear_material_diagnostico_emitido_594');

DROP TRIGGER a_594_bloquear_linea_diagnostico_emitido ON public.diagnostico_tecnico_lineas;
DROP TRIGGER a_594_bloquear_material_diagnostico_emitido ON public.diagnostico_tecnico_linea_materiales;
DROP TRIGGER zzz_594_proteger_diagnostico_tecnico_estado ON public.diagnosticos_tecnicos;
DROP TRIGGER diagnostico_tecnico_estado_historial_inmutable ON public.diagnostico_tecnico_estado_historial;
DROP FUNCTION public.bloquear_linea_diagnostico_emitido_594();
DROP FUNCTION public.bloquear_material_diagnostico_emitido_594();
DROP FUNCTION public.proteger_diagnostico_tecnico_estado();
DROP FUNCTION public.proteger_diagnostico_tecnico_historial();
DROP FUNCTION public.emitir_diagnostico_tecnico(text);
DROP FUNCTION public.reabrir_diagnostico_tecnico(text,text);
DROP POLICY diagnostico_tecnico_estado_historial_select ON public.diagnostico_tecnico_estado_historial;
DROP TABLE public.diagnostico_tecnico_estado_historial;
DROP TABLE public.diagnostico_tecnico_transicion_rpc;
DROP POLICY diagnosticos_tecnicos_update ON public.diagnosticos_tecnicos;
CREATE POLICY diagnosticos_tecnicos_update ON public.diagnosticos_tecnicos FOR UPDATE TO authenticated
 USING (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) AND (public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar') OR (diagnosticos_tecnicos.estado='emitido' AND public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar'))))
 WITH CHECK (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) AND (public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar') OR (diagnosticos_tecnicos.estado='borrador' AND public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar'))));

CREATE TEMP TABLE _594_roundtrip (prueba text PRIMARY KEY,ok boolean NOT NULL,detalle text NOT NULL);
INSERT INTO _594_roundtrip
SELECT 'objetos 594 retirados',
       to_regclass('public.diagnostico_tecnico_estado_historial') IS NULL
       AND to_regclass('public.diagnostico_tecnico_transicion_rpc') IS NULL
       AND to_regprocedure('public.emitir_diagnostico_tecnico(text)') IS NULL
       AND to_regprocedure('public.reabrir_diagnostico_tecnico(text,text)') IS NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname LIKE '%_594_%' AND NOT tgisinternal),
       format('triggers_previos=%s funciones_previas=%s',(SELECT count(*) FROM _594_before_triggers),(SELECT count(*) FROM _594_before_functions));
INSERT INTO _594_roundtrip
SELECT 'policy original fase2 restituida', polcmd='w'
       AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]::oid[]
       AND position('usuario_tiene_empresa' IN pg_get_expr(polqual,polrelid))>0
       AND position('diagnostico_tecnico' IN pg_get_expr(polqual,polrelid))>0
       AND position('editar' IN pg_get_expr(polqual,polrelid))>0
       AND position('emitido' IN pg_get_expr(polqual,polrelid))>0
       AND position('aprobar' IN pg_get_expr(polqual,polrelid))>0
       AND position('usuario_tiene_empresa' IN pg_get_expr(polwithcheck,polrelid))>0
       AND position('editar' IN pg_get_expr(polwithcheck,polrelid))>0
       AND position('borrador' IN pg_get_expr(polwithcheck,polrelid))>0
       AND position('aprobar' IN pg_get_expr(polwithcheck,polrelid))>0,
       'Definición fuente: fase2, línea 173; policy UPDATE TO authenticated';
SELECT * FROM _594_roundtrip ORDER BY prueba;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM _594_roundtrip WHERE NOT ok), 'ROUNDTRIP_FAILED: revisar objetos y policy'; END $$;
-- ROLLBACK vuelve a instalar exactamente el estado previo a la prueba de revert.
ROLLBACK;
