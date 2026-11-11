-- Examen del manual de Aria: 10 casos nuevos (91-100) sobre las fichas profundas de almacén, RRHH, compras y taller.
-- Aditiva e idempotente.
INSERT INTO public.aria_examen_casos (id, perfil, pregunta, fichas) VALUES
  (91, 'oficina', '¿Cómo compro una misma SOLPE a varios proveedores?', ARRAY['sourcing_bandeja', 'proceso_solpe_pago']::text[]),
  (92, 'oficina', '¿Cómo renuevo un contrato con firma digital?', ARRAY['rrhh_operativo', 'rrhh_admin']::text[]),
  (93, 'oficina', '¿Cómo descuento un préstamo del trabajador en la planilla?', ARRAY['prestamos_personal']::text[]),
  (94, 'oficina', '¿Por qué no me llega el aviso de contratos por vencer?', ARRAY['notificaciones_config']::text[]),
  (95, 'taller', '¿Quién tiene prestada una herramienta y cuáles están vencidas?', ARRAY['prestamo_herramientas']::text[]),
  (96, 'taller', '¿Cómo se calcula la cantidad sugerida de reposición?', ARRAY['stock_minimos']::text[]),
  (97, 'oficina', '¿Cómo cobro el almacenaje de la mercadería de un cliente?', ARRAY['custodia_terceros']::text[]),
  (98, 'taller', '¿Cómo meto una OT urgente en el plan del taller?', ARRAY['planner_taller']::text[]),
  (99, 'taller', '¿Por qué no puedo editar la ruta de una OF aprobada?', ARRAY['detalle_of', 'proceso_fabricacion_of']::text[]),
  (100, 'jefe', '¿Cómo apruebo u observo un parte diario?', ARRAY['gestion_partes_taller', 'partes_taller', 'ot_admin']::text[])
ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, pregunta = EXCLUDED.pregunta, fichas = EXCLUDED.fichas;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.aria_examen_casos) < 100 THEN
    RAISE EXCEPTION 'aria_examen_casos incompleto';
  END IF;
END $$;
