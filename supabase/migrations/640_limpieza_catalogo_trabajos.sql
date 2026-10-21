-- 640: limpieza del catálogo Trabajo › Actividad › Tarea (aprobada por Cristhian el 2026-10-21).
--  * PRUEBA: «Evaluación y diagnostico» (sin tilde) se une a «Evaluación y diagnóstico».
--  * WHYNCO: se unen 3 trabajos creados a mano con su equivalente del catálogo:
--      REPARACION DE CILINDROS  → Reparación de cilindros hidráulicos
--      fabricaciín de tapa      → Fabricación de tapas de cilindro
--      Fabricación de embolo    → Fabricación de pistones y émbolos
-- Aplicada en producción el 2026-10-21 (registrada como 20261021141544).
-- Unir = pasar todas las referencias al trabajo destino (también en documentos emitidos o
-- aprobados: es el mismo trabajo, solo cambia el id) y desactivar el duplicado.

BEGIN;

CREATE TEMP TABLE _union_trabajos(origen uuid PRIMARY KEY, destino uuid NOT NULL, empresa_id text NOT NULL) ON COMMIT DROP;
INSERT INTO _union_trabajos VALUES
  ('ce8c9290-8113-4922-b897-bf5745bea63b','21ed6f38-7e73-de42-54e1-6db32a0c62c2','emp_2000000000'),
  ('6128bb55-6472-4fbe-b2fa-c9619919ca13','a82573a4-237d-2829-d2a5-ee19473a587a','emp_20513453711'),
  ('35a0101a-e0d6-4002-b8a5-e5861659c1c2','17a66695-a151-a84d-11ce-52abb36f968b','emp_20513453711'),
  ('4961ebf7-3aee-4607-8293-2ca3ba9006aa','74110c2d-1d7f-bcbb-49cb-8db71ed36741','emp_20513453711');

DO $pre$
BEGIN
  ASSERT (SELECT count(*) FROM _union_trabajos u
            JOIN public.familia_trabajo o ON o.id=u.origen AND o.empresa_id=u.empresa_id
            JOIN public.familia_trabajo d ON d.id=u.destino AND d.empresa_id=u.empresa_id AND d.activo) = 4,
    'PRECONDITION_FAILED: trabajos de origen o destino no encontrados';
END
$pre$;

-- Los documentos emitidos o aprobados bloquean sus líneas; solo para este cambio de id.
ALTER TABLE public.diagnostico_tecnico_lineas DISABLE TRIGGER a_594_bloquear_linea_diagnostico_emitido;
ALTER TABLE public.diagnostico_tecnico_lineas DISABLE TRIGGER trg_bloquear_diagnostico_tecnico_linea_emitido;
-- La línea y su hallazgo cambian juntos al mismo trabajo.
ALTER TABLE public.diagnostico_tecnico_lineas DISABLE TRIGGER trg_bloquear_cambio_linea_vinculada;
ALTER TABLE public.diagnostico_tecnico_hallazgos DISABLE TRIGGER a_bloquear_hallazgo_emitido;
ALTER TABLE public.hoja_costeo_lineas_mano_obra DISABLE TRIGGER trg_bloquear_mo_aprobada;

UPDATE public.diagnostico_tecnico_lineas x SET familia_trabajo_id=u.destino FROM _union_trabajos u WHERE x.familia_trabajo_id=u.origen;
UPDATE public.diagnostico_tecnico_hallazgos x SET familia_trabajo_id=u.destino FROM _union_trabajos u WHERE x.familia_trabajo_id=u.origen;
UPDATE public.hoja_costeo_lineas_mano_obra x SET familia_trabajo_id=u.destino FROM _union_trabajos u WHERE x.familia_trabajo_id=u.origen;
UPDATE public.ot_tareas x SET familia_trabajo_id=u.destino FROM _union_trabajos u WHERE x.familia_trabajo_id=u.origen;
UPDATE public.tipos_servicio_interno x SET familia_trabajo_id=u.destino FROM _union_trabajos u WHERE x.familia_trabajo_id=u.origen;

ALTER TABLE public.diagnostico_tecnico_lineas ENABLE TRIGGER a_594_bloquear_linea_diagnostico_emitido;
ALTER TABLE public.diagnostico_tecnico_lineas ENABLE TRIGGER trg_bloquear_diagnostico_tecnico_linea_emitido;
ALTER TABLE public.diagnostico_tecnico_lineas ENABLE TRIGGER trg_bloquear_cambio_linea_vinculada;
ALTER TABLE public.diagnostico_tecnico_hallazgos ENABLE TRIGGER a_bloquear_hallazgo_emitido;
ALTER TABLE public.hoja_costeo_lineas_mano_obra ENABLE TRIGGER trg_bloquear_mo_aprobada;

UPDATE public.familia_trabajo f SET activo=false FROM _union_trabajos u WHERE f.id=u.origen;

DO $verify$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas x JOIN _union_trabajos u ON x.familia_trabajo_id=u.origen)
     AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos x JOIN _union_trabajos u ON x.familia_trabajo_id=u.origen)
     AND NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_mano_obra x JOIN _union_trabajos u ON x.familia_trabajo_id=u.origen)
     AND NOT EXISTS (SELECT 1 FROM public.ot_tareas x JOIN _union_trabajos u ON x.familia_trabajo_id=u.origen),
    'VERIFY_FAILED: quedan referencias a trabajos unidos';
  ASSERT (SELECT count(*) FROM public.familia_trabajo f JOIN _union_trabajos u ON f.id=u.origen WHERE f.activo) = 0,
    'VERIFY_FAILED: duplicados siguen activos';
END
$verify$;

COMMIT;
