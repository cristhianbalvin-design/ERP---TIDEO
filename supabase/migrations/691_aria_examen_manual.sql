-- Examen de recuperación del manual de Aria: 90 preguntas de negocio (catalogo/examen-aria.json)
-- y una función que mide cuántas encuentran una ficha esperada entre las 5 primeras.
-- Aditiva e idempotente. Solo un administrador de la empresa (o superadmin) puede ejecutar el examen.

CREATE TABLE IF NOT EXISTS public.aria_examen_casos (
  id integer PRIMARY KEY,
  perfil text NOT NULL,
  pregunta text NOT NULL,
  fichas text[] NOT NULL
);
ALTER TABLE public.aria_examen_casos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aria_examen_casos FROM PUBLIC, anon, authenticated;

INSERT INTO public.aria_examen_casos (id, perfil, pregunta, fichas) VALUES
  (1, 'novato', '¿Qué es OPERA y para qué sirve cada aplicación?', ARRAY['concepto_que_es_opera']::text[]),
  (2, 'novato', '¿Por dónde empiezo si recién me dieron mi usuario?', ARRAY['concepto_que_es_opera', 'concepto_acceso_usuario']::text[]),
  (3, 'novato', '¿Cómo cambio mi contraseña?', ARRAY['concepto_acceso_usuario']::text[]),
  (4, 'novato', '¿Cómo cambio de sociedad?', ARRAY['concepto_acceso_usuario']::text[]),
  (5, 'novato', '¿Cómo uso a Aria y cuántas preguntas tengo?', ARRAY['como_usar_aria']::text[]),
  (6, 'novato', '¿Qué es un CECO y para qué lo pide el sistema?', ARRAY['concepto_ceco_cebe']::text[]),
  (7, 'novato', '¿Qué es una SOLPE?', ARRAY['concepto_documentos_compra', 'solpe', 'proceso_solpe_pago']::text[]),
  (8, 'novato', '¿Qué diferencia hay entre OS Cliente, OT y OF?', ARRAY['concepto_documentos_venta']::text[]),
  (9, 'novato', '¿Qué es una valorización?', ARRAY['concepto_documentos_venta', 'valorizacion']::text[]),
  (10, 'novato', '¿Qué es una detracción y cuándo aplica?', ARRAY['concepto_detraccion']::text[]),
  (11, 'novato', '¿Qué es una rendición de caja chica?', ARRAY['caja', 'proceso_caja_chica']::text[]),
  (12, 'novato', '¿Qué es la Hoja de Costeo?', ARRAY['concepto_costeo', 'hoja_costeo', 'hoja_costeo_lista']::text[]),
  (13, 'novato', '¿Qué es el kardex?', ARRAY['concepto_almacen', 'inventario_kardex']::text[]),
  (14, 'novato', '¿Qué diferencia hay entre Ventas y Facturación?', ARRAY['concepto_documentos_venta']::text[]),
  (15, 'novato', '¿Cómo registro un cliente nuevo?', ARRAY['cuentas', 'proceso_lead_cotizacion']::text[]),
  (16, 'novato', '¿Cómo hago una cotización?', ARRAY['cotizaciones', 'proceso_lead_cotizacion']::text[]),
  (17, 'novato', '¿Cómo registro un gasto?', ARRAY['compras_gastos', 'caja', 'concepto_documentos_compra']::text[]),
  (18, 'novato', '¿Cómo pido un material?', ARRAY['solpe', 'proceso_solpe_pago', 'concepto_documentos_compra']::text[]),
  (19, 'novato', '¿Cómo marco mi asistencia?', ARRAY['movil_asistencia', 'proceso_asistencia', 'concepto_personal_planilla']::text[]),
  (20, 'novato', '¿Dónde veo mi boleta de pago?', ARRAY['mi_portal', 'concepto_personal_planilla']::text[]),
  (21, 'novato', '¿Cómo pido vacaciones?', ARRAY['mi_portal', 'solicitudes_rrhh', 'proceso_asistencia']::text[]),
  (22, 'novato', 'Me equivoqué al registrar algo, ¿cómo lo corrijo?', ARRAY['problemas_corregir_registro']::text[]),
  (23, 'oficina', '¿Cómo convierto un lead en cliente y en oportunidad?', ARRAY['leads', 'proceso_lead_cotizacion']::text[]),
  (24, 'oficina', '¿Cómo pido una comisión especial para una venta?', ARRAY['pipeline', 'proceso_lead_cotizacion', 'movil_vendedor']::text[]),
  (25, 'oficina', '¿Cómo envío la cotización al cliente para que la apruebe?', ARRAY['cotizaciones', 'proceso_lead_cotizacion']::text[]),
  (26, 'oficina', '¿Cómo creo la orden de servicio de una cotización aprobada?', ARRAY['cotizaciones', 'proceso_cotizacion_cobro', 'os_cliente']::text[]),
  (27, 'oficina', '¿Cómo configuro un servicio que se cobra todos los meses?', ARRAY['os_cliente', 'proceso_cotizacion_cobro', 'concepto_documentos_venta', 'servicios']::text[]),
  (28, 'oficina', '¿Cómo facturo una valorización?', ARRAY['facturacion', 'valorizacion', 'proceso_cotizacion_cobro']::text[]),
  (29, 'oficina', '¿Por dónde subo masivamente las facturas de mis clientes?', ARRAY['facturacion', 'cxc']::text[]),
  (30, 'oficina', '¿Cómo emito una nota de crédito?', ARRAY['facturacion']::text[]),
  (31, 'oficina', '¿Cómo registro que el cliente me pagó?', ARRAY['cxc', 'facturacion', 'proceso_cotizacion_cobro']::text[]),
  (32, 'oficina', 'El cliente pagó con detracción, ¿cómo lo registro?', ARRAY['concepto_detraccion', 'cxc']::text[]),
  (33, 'oficina', '¿Cómo condono la mora de un cliente?', ARRAY['cxc']::text[]),
  (34, 'oficina', '¿Cómo concilio un cobro con el banco?', ARRAY['tesoreria', 'proceso_cotizacion_cobro', 'problemas_saldo_banco']::text[]),
  (35, 'oficina', '¿Cómo apruebo una SOLPE y la paso a orden de compra?', ARRAY['solpe', 'proceso_solpe_pago']::text[]),
  (36, 'oficina', '¿Cómo compro un mismo pedido a dos proveedores?', ARRAY['concepto_documentos_compra', 'proceso_solpe_pago', 'solpe']::text[]),
  (37, 'oficina', 'Llegó la mercadería pero no la factura, ¿qué hago?', ARRAY['recepciones', 'concepto_documentos_compra', 'proceso_solpe_pago']::text[]),
  (38, 'oficina', '¿Cómo registro un anticipo al proveedor?', ARRAY['ordenes_compra']::text[]),
  (39, 'oficina', '¿Cómo pago una factura con detracción?', ARRAY['cxp', 'concepto_detraccion']::text[]),
  (40, 'oficina', 'El proveedor no completó el pedido, ¿cómo libero lo que falta?', ARRAY['ordenes_compra', 'concepto_documentos_compra']::text[]),
  (41, 'oficina', '¿Cómo devuelvo mercadería a un proveedor?', ARRAY['recepciones']::text[]),
  (42, 'oficina', '¿Cómo importo el extracto del banco?', ARRAY['tesoreria', 'problemas_saldo_banco']::text[]),
  (43, 'oficina', '¿Cómo paso plata de una cuenta a otra?', ARRAY['tesoreria', 'problemas_saldo_banco']::text[]),
  (44, 'oficina', 'No me cuadra el saldo del banco con el sistema, ¿qué reviso?', ARRAY['problemas_saldo_banco']::text[]),
  (45, 'oficina', '¿Cómo abro un fondo de caja chica?', ARRAY['caja', 'proceso_caja_chica']::text[]),
  (46, 'oficina', '¿Por qué no puedo cerrar la caja chica?', ARRAY['caja', 'proceso_caja_chica']::text[]),
  (47, 'oficina', '¿Cómo corrijo un egreso de caja chica mal registrado?', ARRAY['caja', 'problemas_corregir_registro']::text[]),
  (48, 'oficina', '¿Cómo registro a un trabajador nuevo con su contrato?', ARRAY['rrhh_admin', 'rrhh_operativo', 'proceso_planilla', 'concepto_personal_planilla']::text[]),
  (49, 'oficina', '¿Cómo renuevo un contrato y lo mando a firmar?', ARRAY['rrhh_admin', 'rrhh_operativo']::text[]),
  (50, 'oficina', '¿Cómo corrijo una marcación de asistencia?', ARRAY['asistencia', 'proceso_asistencia', 'concepto_personal_planilla']::text[]),
  (51, 'oficina', '¿Cómo proceso la planilla del mes?', ARRAY['nomina', 'proceso_planilla', 'concepto_personal_planilla']::text[]),
  (52, 'oficina', '¿Por qué no puedo cerrar el período de nómina?', ARRAY['nomina', 'proceso_planilla']::text[]),
  (53, 'oficina', '¿Cómo registro un préstamo a un trabajador?', ARRAY['prestamos_personal']::text[]),
  (54, 'oficina', '¿Cómo calculo la liquidación de alguien que cesa?', ARRAY['liquidaciones_cese', 'proceso_planilla', 'concepto_personal_planilla']::text[]),
  (55, 'oficina', '¿Cómo apruebo vacaciones y las paso a la asistencia?', ARRAY['solicitudes_rrhh', 'proceso_asistencia', 'concepto_personal_planilla']::text[]),
  (56, 'taller', 'Llegó un equipo del cliente, ¿cómo lo ingreso?', ARRAY['recepcion_activos', 'proceso_recepcion_entrega']::text[]),
  (57, 'taller', '¿Cómo hago el diagnóstico y el informe para el cliente?', ARRAY['diagnostico_tecnico', 'proceso_recepcion_entrega']::text[]),
  (58, 'taller', '¿Cómo creo la OT de un equipo?', ARRAY['nueva_ot', 'proceso_recepcion_entrega']::text[]),
  (59, 'taller', '¿Por qué no puedo iniciar la OT?', ARRAY['bandeja_ots', 'proceso_recepcion_entrega']::text[]),
  (60, 'taller', '¿Cómo registro mi parte diario con fotos?', ARRAY['partes_taller', 'movil_tecnico', 'proceso_recepcion_entrega']::text[]),
  (61, 'taller', 'Me faltó un repuesto, ¿cómo lo pido desde el parte?', ARRAY['partes_taller', 'reserva_repuestos']::text[]),
  (62, 'taller', '¿Cómo apruebo los partes de mis técnicos?', ARRAY['partes', 'movil_supervisor', 'ot_admin', 'proceso_recepcion_entrega']::text[]),
  (63, 'taller', '¿Por qué no puedo cerrar la OT con el acta?', ARRAY['cierre_conformidad', 'proceso_recepcion_entrega']::text[]),
  (64, 'taller', 'El cliente no quiere firmar el acta, ¿qué hago?', ARRAY['cierre_conformidad']::text[]),
  (65, 'taller', '¿Cómo programo una OT en el planner?', ARRAY['planner_taller', 'planner']::text[]),
  (66, 'taller', '¿Cómo creo una orden de fabricación?', ARRAY['nueva_of', 'proceso_fabricacion_of', 'ordenes_fabricacion']::text[]),
  (67, 'taller', '¿Cómo armo la ruta y los materiales de una OF?', ARRAY['detalle_of', 'proceso_fabricacion_of']::text[]),
  (68, 'taller', 'Usé un material que no estaba previsto en la OF, ¿cómo lo registro?', ARRAY['detalle_of', 'proceso_fabricacion_of']::text[]),
  (69, 'taller', '¿Cómo recibo una compra en el almacén?', ARRAY['recepcion_oc_almacen', 'recepciones', 'proceso_almacen']::text[]),
  (70, 'taller', '¿Cómo despacho los repuestos de una OT?', ARRAY['reserva_repuestos', 'despachos_almacen', 'proceso_almacen']::text[]),
  (71, 'taller', '¿Cómo hago un conteo de inventario?', ARRAY['conteos_ciclicos', 'proceso_almacen', 'inventario_admin', 'concepto_almacen']::text[]),
  (72, 'taller', 'El conteo no cuadra, ¿quién aprueba el ajuste?', ARRAY['conteos_ciclicos', 'concepto_almacen', 'proceso_almacen']::text[]),
  (73, 'taller', '¿Cómo presto una herramienta?', ARRAY['prestamo_herramientas']::text[]),
  (74, 'taller', '¿Cómo registro mercadería de un tercero en custodia?', ARRAY['custodia_terceros']::text[]),
  (75, 'taller', '¿Qué materiales están bajo el mínimo y cómo los repongo?', ARRAY['stock_minimos', 'concepto_almacen', 'proceso_almacen']::text[]),
  (76, 'taller', '¿Cómo registro un contrato de alquiler?', ARRAY['contratos_rental', 'proceso_alquiler_flota']::text[]),
  (77, 'taller', '¿Cómo entrego un equipo alquilado con su acta?', ARRAY['actas_despachos', 'proceso_alquiler_flota', 'panel_flota']::text[]),
  (78, 'taller', '¿Cómo registro las horas del equipo cada día?', ARRAY['liquidacion_dmr', 'proceso_alquiler_flota']::text[]),
  (79, 'taller', '¿Cómo liquido el alquiler del mes?', ARRAY['liquidacion_dmr', 'proceso_alquiler_flota']::text[]),
  (80, 'taller', '¿Cómo programo un viaje y le asigno unidad?', ARRAY['orden_viaje', 'detalle_viaje', 'proceso_viaje_transporte', 'monitor_viajes', 'hoja_ruta']::text[]),
  (81, 'taller', 'Soy conductor, ¿cómo registro mi viaje en el celular?', ARRAY['movil_logistica', 'proceso_viaje_transporte']::text[]),
  (82, 'taller', 'Tuve un incidente en la ruta, ¿cómo lo reporto?', ARRAY['movil_logistica']::text[]),
  (83, 'jefe', '¿Cómo le doy acceso a alguien a una pantalla?', ARRAY['roles', 'usuarios', 'concepto_acceso_usuario', 'proceso_configuracion_inicial']::text[]),
  (84, 'jefe', '¿Cómo creo un rol nuevo copiando otro?', ARRAY['roles']::text[]),
  (85, 'jefe', '¿Cómo reasigno una OT a otro técnico?', ARRAY['ot_admin', 'planner', 'planner_taller']::text[]),
  (86, 'jefe', '¿Cómo corrijo un parte que ya aprobé?', ARRAY['partes', 'problemas_corregir_registro', 'ot_admin']::text[]),
  (87, 'jefe', '¿Cómo configuro los avisos automáticos por correo?', ARRAY['notificaciones_config']::text[]),
  (88, 'jefe', '¿Cómo armo la evaluación de desempeño de mi equipo?', ARRAY['evaluaciones_desempeno']::text[]),
  (89, 'jefe', '¿Cómo va la implementación del sistema en mi empresa?', ARRAY['salud_implementacion_tenant']::text[]),
  (90, 'jefe', '¿Cómo se calcula el precio de un trabajo y el margen?', ARRAY['concepto_costeo', 'hoja_costeo']::text[])
ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, pregunta = EXCLUDED.pregunta, fichas = EXCLUDED.fichas;

CREATE OR REPLACE FUNCTION public.aria_examen_manual(p_empresa_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_es_superadmin_plataforma() AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue JOIN public.roles r ON r.id = ue.rol_id
     WHERE ue.user_id = auth.uid() AND ue.empresa_id = p_empresa_id AND ue.estado = 'activo' AND r.es_admin_empresa) THEN
    RAISE EXCEPTION 'Solo un administrador puede ejecutar el examen';
  END IF;
  WITH res AS (
    SELECT c.id, c.perfil, c.pregunta, c.fichas,
      (SELECT coalesce(array_agg(f->>'clave'), '{}') FROM jsonb_array_elements(public.asistente_consultar_manual(p_empresa_id, c.pregunta, NULL, 5)->'fichas') f) AS halladas
    FROM public.aria_examen_casos c
  ), nota AS (SELECT r.*, r.fichas && r.halladas AS acierto FROM res r)
  SELECT jsonb_build_object('total', count(*), 'aciertos', count(*) FILTER (WHERE acierto),
    'por_perfil', (SELECT jsonb_object_agg(x.perfil, x.valor) FROM (SELECT n2.perfil, count(*) FILTER (WHERE n2.acierto) || '/' || count(*) AS valor FROM nota n2 GROUP BY 1) x),
    'fallan', coalesce(jsonb_agg(jsonb_build_object('id', id, 'pregunta', pregunta, 'halladas', to_jsonb(halladas)) ORDER BY id) FILTER (WHERE NOT acierto), '[]'::jsonb))
  INTO v_res FROM nota;
  RETURN v_res;
END; $function$;

REVOKE ALL ON FUNCTION public.aria_examen_manual(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_examen_manual(text) TO authenticated, service_role;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.aria_examen_casos) < 90 THEN
    RAISE EXCEPTION 'aria_examen_casos incompleto';
  END IF;
END $$;
