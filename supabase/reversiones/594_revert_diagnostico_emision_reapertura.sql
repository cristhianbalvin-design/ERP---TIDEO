-- Revierte 594 y restituye la policy de UPDATE tal como fue creada en fase2.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF to_regclass('public.diagnostico_tecnico_estado_historial') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: no está instalada la tabla de historial 594'; END IF;
  IF to_regclass('public.diagnostico_tecnico_transicion_rpc') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: no está instalada la tabla interna 594'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.diagnosticos_tecnicos'::regclass AND tgname='zzz_594_proteger_diagnostico_tecnico_estado' AND NOT tgisinternal) THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta el guardián 594'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.diagnosticos_tecnicos'::regclass AND polname='diagnosticos_tecnicos_update') THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta policy UPDATE actual'; END IF;
  -- Eliminar esta auditoría exige una decisión deliberada: exportar/conservar
  -- primero el historial y retirar explícitamente esta precondición en una
  -- reversión planificada. El revert normal nunca debe borrar eventos.
  IF EXISTS (SELECT 1 FROM public.diagnostico_tecnico_estado_historial) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: el historial 594 contiene filas; archívelas y autorice deliberadamente su eliminación antes del revert';
  END IF;
END
$pre$;

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

COMMIT;
