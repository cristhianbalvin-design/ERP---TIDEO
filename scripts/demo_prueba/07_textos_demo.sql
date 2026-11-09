-- Demo PRUEBA · 07 Reemplaza los textos heredados del molde por textos de la empresa demo.
create or replace function demo_seed.textos(p_tabla text, p_col text, p_txt text[]) returns int language plpgsql as $$
declare n int; begin
  execute format($f$
    with r as (select ctid c, row_number() over (order by ctid) rn from public.%1$I where empresa_id='emp_2000000000')
    update public.%1$I t set %2$I = ($1)[1 + (r.rn-1) %% array_length($1,1)] from r where t.ctid=r.c$f$, p_tabla, p_col) using p_txt;
  get diagnostics n = row_count; return n;
end $$;

do $$ begin
set local session_replication_role = replica;
-- Mesa de ayuda (tickets de clientes)
perform demo_seed.textos('tickets','titulo',array['Excavadora EX-01 pierde potencia en pendiente','Solicitud de reprogramación de mantenimiento 500 h','Fuga de aceite en cilindro de levante 966H','Consulta por valorización de octubre','Alarma de temperatura en motor del tractor D8T','Repuesto de bomba hidráulica con demora','Solicitud de operador de reemplazo en turno noche','Ruido anormal en reductor de faja transportadora','Pedido de informe técnico del overhaul','Equipo detenido por falla eléctrica en tablero','Revisión de horómetro mal registrado','Consulta de garantía de reparación de transmisión']);
perform demo_seed.textos('tickets','descripcion',array['El cliente reporta la falla desde el turno de la mañana; solicita visita técnica en 24 h.','Se coordina con el supervisor de mina la ventana de parada.','Se requiere diagnóstico en campo y cotización de repuestos.','Se envía el detalle de horas y la conformidad firmada.']);
perform demo_seed.textos('tickets','cuenta_nombre',array['Minera Huaytapallana','Consorcio Vial Los Andes','Cementos Altiplano','Hidroandina del Centro','Agregados Lima Norte','Minera Santa Lucía']);
perform demo_seed.textos('tickets','responsable_nombre',array['Andrea Molina','Gian Cardenas','Katherine Arellano']);
perform demo_seed.textos('ticket_comentarios','contenido',array['Técnico asignado, sale a campo mañana 06:00.','Se reemplazó el sello y se probó a plena carga, sin fugas.','Cliente confirma operación normal. Se cierra el caso.','Repuesto llega el jueves; se mantiene equipo en stand by.']);
perform demo_seed.textos('ticket_comentarios','usuario_nombre',array['Andrea Molina','Gian Cardenas','Soporte Andes']);
-- Proyectos y presupuestos
perform demo_seed.textos('proyectos','nombre',array['Contrato marco mantenimiento flota Huaytapallana 2026','Rehabilitación de equipos – Obra vial Huánuco','Remanufactura de componentes mayores','Programa de confiabilidad Cementos Altiplano']);
perform demo_seed.textos('presupuestos','nombre',array['Presupuesto operativo 2026 – Taller Ate','Presupuesto operativo 2026 – Campamento Cerro de Pasco']);
perform demo_seed.textos('presupuesto_partidas','descripcion',array['Repuestos y consumibles de taller','Combustible de flota','Servicios de terceros','EPP y seguridad','Mano de obra contratada','Alquiler de local y servicios','Transporte de equipos']);
-- Sedes y minas
perform demo_seed.textos('sedes','nombre',array['Oficina principal – Ate','Taller de maestranza – Ate','Campamento Cerro de Pasco','Almacén Puente Piedra','Base operativa Huánuco','Oficina comercial Arequipa','Patio de equipos Lurín']);
perform demo_seed.textos('minas','nombre',array['Unidad Minera Huaytapallana']);
-- RRHH reclutamiento
perform demo_seed.textos('rrhh_candidatos','nombre',array['Luis Alberto Ramos Quispe','Jhon Carlos Huamán Torres','María Fernanda Salas Rojas','Edgar Paúl Condori Mamani','Ricardo Inga Palomino']);
perform demo_seed.textos('rrhh_candidaturas','postulante_nombre',array['Luis Alberto Ramos Quispe','Jhon Carlos Huamán Torres','María Fernanda Salas Rojas','Edgar Paúl Condori Mamani','Ricardo Inga Palomino']);
perform demo_seed.textos('rrhh_vacantes','cargo',array['Técnico Mecánico de Equipo Pesado','Electricista Industrial','Supervisor de Mantenimiento','Operador de Excavadora']);
perform demo_seed.textos('rrhh_vacantes','descripcion',array['Experiencia mínima de 3 años en equipos CAT o Komatsu; disponibilidad para régimen 14x7.','Mantenimiento de sistemas eléctricos de maquinaria pesada y tableros industriales.']);
-- Transporte comercial
perform demo_seed.textos('transporte_rutas','nombre',array['Lima (Ate) → Cerro de Pasco','Cerro de Pasco → Lima (Ate)','Lima (Ate) → Huánuco']);
perform demo_seed.textos('transporte_rutas','origen_nombre',array['Taller Ate','Campamento Cerro de Pasco','Taller Ate']);
perform demo_seed.textos('transporte_rutas','destino_nombre',array['Campamento Cerro de Pasco','Taller Ate','Base operativa Huánuco']);
perform demo_seed.textos('transporte_lugares','nombre',array['Taller Ate – Andes Industrial','Campamento Cerro de Pasco']);
perform demo_seed.textos('transporte_viajes','carga_descripcion',array['Traslado de excavadora CAT 336 en cama baja']);
perform demo_seed.textos('transporte_viajes','origen_nombre',array['Taller Ate']);
perform demo_seed.textos('transporte_viajes','destino_nombre',array['Campamento Cerro de Pasco']);
perform demo_seed.textos('transportistas','razon_social',array['Transportes Cama Baja Sur S.A.C.']);
perform demo_seed.textos('conductores_transporte','nombre',array['Wilber Ccahuana Poma']);
perform demo_seed.textos('vehiculos_transporte','placa',array['D4K-872']);
perform demo_seed.textos('rutas','observaciones',array['Recojo de repuestos en proveedores de Lima','Envío de componentes reparados a campamento']);
-- Comercial
perform demo_seed.textos('campanas','nombre',array['Feria Perumin – contactos de minería']);
perform demo_seed.textos('campanas','descripcion',array['Seguimiento a contactos captados en la feria para servicios de mantenimiento y alquiler de flota.']);
perform demo_seed.textos('actividades_comerciales','descripcion',array['Visita técnica a mina para levantar alcance del contrato marco','Reunión de presentación de servicios de overhaul','Llamada de seguimiento a cotización enviada']);
perform demo_seed.textos('agenda_comercial','titulo',array['Visita a Minera Huaytapallana','Reunión con Cementos Altiplano','Demo de servicios a Petroquímica del Sur','Seguimiento cotización Consorcio Vial','Almuerzo con Hidroandina del Centro','Revisión de contrato con Agregados Lima Norte']);
perform demo_seed.textos('gestion_cobranza','notas',array['Cliente indica que la factura está en revisión de su área de contabilidad; promete pago la próxima semana.']);
-- Operaciones
perform demo_seed.textos('diagnosticos_tecnicos','resumen_diagnostico',array['Desgaste severo en bomba hidráulica principal; presión 18 % por debajo de especificación.','Juego excesivo en pines y bocinas del brazo; requiere reconstrucción.','Fisuras en soldadura de la tolva en zona de impacto.','Motor con alto consumo de aceite y blow-by elevado; se recomienda overhaul.','Rodamientos del reductor con daño por contaminación.']);
perform demo_seed.textos('diagnosticos_tecnicos','motivo',array['Pérdida de potencia reportada por el operador','Mantenimiento correctivo programado','Inspección por fin de campaña']);
perform demo_seed.textos('diagnostico_tecnico_hallazgos','componente_parte',array['Bomba hidráulica principal','Cilindro de brazo','Pines y bocinas de pluma','Tolva – placa de desgaste','Reductor de mando final','Mangueras de alta presión','Turbocompresor']);
perform demo_seed.textos('diagnostico_tecnico_hallazgos','observacion',array['Se evidencia contaminación del aceite.','Daño atribuible a operación fuera de parámetros.','Desgaste normal por horas de servicio.']);
perform demo_seed.textos('diagnostico_informes','emisor_nombre',array['Andrea Molina']);
perform demo_seed.textos('diagnostico_informes','emisor_cargo',array['Jefa de Mantenimiento']);
perform demo_seed.textos('cierres_tecnicos','descripcion_trabajo',array['Se reemplazó la bomba hidráulica y se calibró el sistema a presión nominal.','Se reconstruyó el tren de rodamiento y se torqueó según manual.','Se cambió el kit de sellos del cilindro de brazo y se probó a plena carga.']);
perform demo_seed.textos('cierres_tecnicos','conformidad_nombre',array['Ing. Mariela Quispe','Ing. Patricia Rojas','Ing. Luis Paredes']);
perform demo_seed.textos('partes_diarios','actividad',array['Desmontaje de bomba hidráulica','Cambio de filtros y lubricación','Prueba de presión del sistema hidráulico','Soldadura de recargue en cucharón','Inspección de tren de rodamiento']);
perform demo_seed.textos('incidentes_flota','descripcion',array['Rotura de manguera hidráulica durante operación; sin lesionados.','Sobrecalentamiento de motor por radiador obstruido.']);
perform demo_seed.textos('backlog','descripcion',array['Cambio de cuchillas de cucharón en próxima parada']);
perform demo_seed.textos('ordenes_fabricacion','descripcion',array['Fabricación de cucharón reforzado 3.5 m³ para excavadora 336']);
perform demo_seed.textos('cuadrillas','nombre',array['Cuadrilla Hidráulica','Cuadrilla Eléctrica','Cuadrilla de Soldadura']);
perform demo_seed.textos('planner_bahias','nombre',array['Bahía 1 – Equipo pesado','Bahía 2 – Equipo pesado','Bahía 3 – Componentes','Bahía 4 – Soldadura','Bahía 5 – Lavado','Bahía 6 – Pruebas']);
perform demo_seed.textos('planner_maquinas_taller','nombre',array['Torno paralelo 3 m','Fresadora universal','Prensa hidráulica 100 t','Máquina de soldar MIG','Puente grúa 10 t','Banco de pruebas hidráulicas']);
perform demo_seed.textos('recepciones_activos_cliente','observaciones',array['Equipo ingresa con fuga visible en cilindro de levante.','Componente recibido en caja de madera, sin daños aparentes.','Ingresa para overhaul programado; se adjunta checklist de recepción.']);
perform demo_seed.textos('solpe_interna','descripcion',array['Repuestos para mantenimiento 500 h de excavadoras','Consumibles de soldadura para taller','EPP para cuadrilla de campo','Kit de sellos para cilindros 336']);
perform demo_seed.textos('solpe_interna','solicitante',array['Andrea Molina','Gian Cardenas','Katherine Arellano']);
perform demo_seed.textos('servicios','descripcion',array['Mantenimiento preventivo de equipo pesado','Overhaul de motor diésel']);
perform demo_seed.textos('financiamientos','entidad',array['BCP – Leasing de maquinaria']);
perform demo_seed.textos('financiamientos','proposito',array['Adquisición de excavadora CAT 336D2 (EX-02)']);
perform demo_seed.textos('fabricantes','nombre',array['Caterpillar']);
perform demo_seed.textos('ventas','cliente_nombre_snapshot',array['Agregados Lima Norte','Metalmecánica Chavín','Inca Ingenieros']);
perform demo_seed.textos('ventas','concepto',array['Venta de kit de filtros','Venta de dientes de cucharón','Venta de mangueras hidráulicas']);
end $$;
