-- Registro selectivo para historial remoto.
-- NO EJECUTADO. Revise y ejecute solamente después de aprobar esta conciliación.
-- No incluye versiones no aplicadas, parciales o indeterminables.

SET ROLE postgres;
BEGIN;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('319', 'vigencia_efectiva_contractual', NULL),
  ('340', 'ingresos_extraordinarios', NULL),
  ('350', 'renombrar_cargo_interno_empresa', NULL),
  ('351', 'agregar_cargo_capital_propio', NULL),
  ('360', 'facturas_centro_beneficio_ingresos', NULL),
  ('361', 'servicio_precios_cliente', NULL),
  ('396', 'coherencia_societaria_cadena_comercial', NULL),
  ('398', 'bloqueo_huecos_asignacion_jornada', NULL),
  ('402', 'extender_derivacion_societaria_ordenes_trabajo', NULL),
  ('404', 'frontera_rls_sociedad', NULL),
  ('406', 'validar_sociedad_importaciones_masivas', NULL),
  ('407', 'completar_identidad_sociedades', NULL),
  ('408', 'identidad_societaria_documentos_laborales', NULL),
  ('409', 'alcance_societario_configurable', NULL),
  ('410', 'cerrar_postulacion_publica', NULL),
  ('412', 'corregir_guards_y_privilegios_default', NULL),
  ('413', 'notificaciones_documentarias_diarias', NULL),
  ('414', 'corregir_rutas_sociedad_null', NULL),
  ('415', 'cerrar_escritura_documentos_laborales', NULL),
  ('416', 'invariante_sociedad_obligatoria', NULL)
ON CONFLICT (version) DO NOTHING;

COMMIT;
