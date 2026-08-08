-- SEG-2a: restringe la ejecucion de las funciones internas restantes.
--
-- No modifica la logica de las funciones ni los privilegios por defecto. Las
-- seis RPC publicas permanecen fuera de esta migracion.

-- ---------------------------------------------------------------------------
-- Funciones disponibles para authenticated y service_role (63).
-- ---------------------------------------------------------------------------

revoke execute on function public.anular_lote_biometrico(text, text) from public;
revoke execute on function public.anular_lote_biometrico(text, text) from anon;
grant execute on function public.anular_lote_biometrico(text, text) to authenticated, service_role;

revoke execute on function public.aplicar_solicitud_rrhh_a_asistencia(text, uuid, boolean, boolean, text) from public;
revoke execute on function public.aplicar_solicitud_rrhh_a_asistencia(text, uuid, boolean, boolean, text) from anon;
grant execute on function public.aplicar_solicitud_rrhh_a_asistencia(text, uuid, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(text, uuid, text, text, text, text, text) from public;
revoke execute on function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(text, uuid, text, text, text, text, text) from anon;
grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(text, uuid, text, text, text, text, text) to authenticated, service_role;

revoke execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(text, text, text, text, text, text) from public;
revoke execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(text, text, text, text, text, text) from anon;
grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(text, text, text, text, text, text) to authenticated, service_role;

revoke execute on function public.calcular_habilitaciones_personal(text) from public;
revoke execute on function public.calcular_habilitaciones_personal(text) from anon;
grant execute on function public.calcular_habilitaciones_personal(text) to authenticated, service_role;

revoke execute on function public.codigo_regimen_desde_jornada(text, integer, integer) from public;
revoke execute on function public.codigo_regimen_desde_jornada(text, integer, integer) from anon;
grant execute on function public.codigo_regimen_desde_jornada(text, integer, integer) to authenticated, service_role;

revoke execute on function public.corregir_documento_personal(text, date, date, jsonb, text, text, text, boolean, text, boolean) from public;
revoke execute on function public.corregir_documento_personal(text, date, date, jsonb, text, text, text, boolean, text, boolean) from anon;
grant execute on function public.corregir_documento_personal(text, date, date, jsonb, text, text, text, boolean, text, boolean) to authenticated, service_role;

revoke execute on function public.crear_asignacion_jornada(text, text, text, text, date, text, integer, integer, date, text, text, boolean, text, date) from public;
revoke execute on function public.crear_asignacion_jornada(text, text, text, text, date, text, integer, integer, date, text, text, boolean, text, date) from anon;
grant execute on function public.crear_asignacion_jornada(text, text, text, text, date, text, integer, integer, date, text, text, boolean, text, date) to authenticated, service_role;

revoke execute on function public.crear_financiamiento(text, text, text, text, text, numeric, jsonb, text, text, text, text, text, numeric, text, integer, integer, integer, text, numeric, date, date, date, text, text, text, text, uuid) from public;
revoke execute on function public.crear_financiamiento(text, text, text, text, text, numeric, jsonb, text, text, text, text, text, numeric, text, integer, integer, integer, text, numeric, date, date, date, text, text, text, text, uuid) from anon;
grant execute on function public.crear_financiamiento(text, text, text, text, text, numeric, jsonb, text, text, text, text, text, numeric, text, integer, integer, integer, text, numeric, date, date, date, text, text, text, text, uuid) to authenticated, service_role;

revoke execute on function public.crear_hoja_costeo_sociedad(text, uuid, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
revoke execute on function public.crear_hoja_costeo_sociedad(text, uuid, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from anon;
grant execute on function public.crear_hoja_costeo_sociedad(text, uuid, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;

revoke execute on function public.crear_hoja_costeo(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
revoke execute on function public.crear_hoja_costeo(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from anon;
grant execute on function public.crear_hoja_costeo(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;

revoke execute on function public.crear_ot_desde_os_cliente(text, text, text, text, text, text, text, date, text, text, numeric, text, text) from public;
revoke execute on function public.crear_ot_desde_os_cliente(text, text, text, text, text, text, text, date, text, text, numeric, text, text) from anon;
grant execute on function public.crear_ot_desde_os_cliente(text, text, text, text, text, text, text, date, text, text, numeric, text, text) to authenticated, service_role;

revoke execute on function public.crear_solicitud_rrhh(text, text, text, text, text, text, text, date, date, text, text, text) from public;
revoke execute on function public.crear_solicitud_rrhh(text, text, text, text, text, text, text, date, date, text, text, text) from anon;
grant execute on function public.crear_solicitud_rrhh(text, text, text, text, text, text, text, date, date, text, text, text) to authenticated, service_role;

revoke execute on function public.desempeno_es_evaluado(text, text) from public;
revoke execute on function public.desempeno_es_evaluado(text, text) from anon;
grant execute on function public.desempeno_es_evaluado(text, text) to authenticated, service_role;

revoke execute on function public.desempeno_es_jefe_directo(text, uuid, text) from public;
revoke execute on function public.desempeno_es_jefe_directo(text, uuid, text) from anon;
grant execute on function public.desempeno_es_jefe_directo(text, uuid, text) to authenticated, service_role;

revoke execute on function public.desempeno_puede_gestionar(text) from public;
revoke execute on function public.desempeno_puede_gestionar(text) from anon;
grant execute on function public.desempeno_puede_gestionar(text) to authenticated, service_role;

revoke execute on function public.desempeno_puede_responder(uuid, text) from public;
revoke execute on function public.desempeno_puede_responder(uuid, text) from anon;
grant execute on function public.desempeno_puede_responder(uuid, text) to authenticated, service_role;

revoke execute on function public.desempeno_puede_ver_evaluacion(uuid) from public;
revoke execute on function public.desempeno_puede_ver_evaluacion(uuid) from anon;
grant execute on function public.desempeno_puede_ver_evaluacion(uuid) to authenticated, service_role;

revoke execute on function public.eliminar_lead_crm(text) from public;
revoke execute on function public.eliminar_lead_crm(text) from anon;
grant execute on function public.eliminar_lead_crm(text) to authenticated, service_role;

revoke execute on function public.es_mi_personal_rrhh(text, text) from public;
revoke execute on function public.es_mi_personal_rrhh(text, text) from anon;
grant execute on function public.es_mi_personal_rrhh(text, text) to authenticated, service_role;

revoke execute on function public.generar_codigo_material(text, text) from public;
revoke execute on function public.generar_codigo_material(text, text) from anon;
grant execute on function public.generar_codigo_material(text, text) to authenticated, service_role;

revoke execute on function public.get_mis_membresias() from public;
revoke execute on function public.get_mis_membresias() from anon;
grant execute on function public.get_mis_membresias() to authenticated, service_role;

revoke execute on function public.get_mis_membresias(uuid) from public;
revoke execute on function public.get_mis_membresias(uuid) from anon;
grant execute on function public.get_mis_membresias(uuid) to authenticated, service_role;

revoke execute on function public.get_salud_implementacion_conteos_local(text) from public;
revoke execute on function public.get_salud_implementacion_conteos_local(text) from anon;
grant execute on function public.get_salud_implementacion_conteos_local(text) to authenticated, service_role;

revoke execute on function public.get_salud_implementacion_conteos() from public;
revoke execute on function public.get_salud_implementacion_conteos() from anon;
grant execute on function public.get_salud_implementacion_conteos() to authenticated, service_role;

revoke execute on function public.get_salud_implementacion_conteos(text[]) from public;
revoke execute on function public.get_salud_implementacion_conteos(text[]) from anon;
grant execute on function public.get_salud_implementacion_conteos(text[]) to authenticated, service_role;

revoke execute on function public.get_salud_implementacion_usuarios(text) from public;
revoke execute on function public.get_salud_implementacion_usuarios(text) from anon;
grant execute on function public.get_salud_implementacion_usuarios(text) to authenticated, service_role;

revoke execute on function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb) from public;
revoke execute on function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb) from anon;
grant execute on function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb) to authenticated, service_role;

revoke execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb) from public;
revoke execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb) from anon;
grant execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb) to authenticated, service_role;

revoke execute on function public.guardar_salud_implementacion_estado(uuid, text, text, boolean) from public;
revoke execute on function public.guardar_salud_implementacion_estado(uuid, text, text, boolean) from anon;
grant execute on function public.guardar_salud_implementacion_estado(uuid, text, text, boolean) to authenticated, service_role;

revoke execute on function public.guardar_salud_implementacion_responsables(uuid, text, text, text) from public;
revoke execute on function public.guardar_salud_implementacion_responsables(uuid, text, text, text) from anon;
grant execute on function public.guardar_salud_implementacion_responsables(uuid, text, text, text) to authenticated, service_role;

revoke execute on function public.importar_cxc_masiva_fila(jsonb) from public;
revoke execute on function public.importar_cxc_masiva_fila(jsonb) from anon;
grant execute on function public.importar_cxc_masiva_fila(jsonb) to authenticated, service_role;

revoke execute on function public.importar_cxp_masiva_fila(jsonb) from public;
revoke execute on function public.importar_cxp_masiva_fila(jsonb) from anon;
grant execute on function public.importar_cxp_masiva_fila(jsonb) to authenticated, service_role;

revoke execute on function public.importar_plantilla_tipos_documento(text) from public;
revoke execute on function public.importar_plantilla_tipos_documento(text) from anon;
grant execute on function public.importar_plantilla_tipos_documento(text) to authenticated, service_role;

revoke execute on function public.liquidaciones_puede_gestionar(text) from public;
revoke execute on function public.liquidaciones_puede_gestionar(text) from anon;
grant execute on function public.liquidaciones_puede_gestionar(text) to authenticated, service_role;

revoke execute on function public.mover_candidatura_rrhh(text, text, text, text, text, text) from public;
revoke execute on function public.mover_candidatura_rrhh(text, text, text, text, text, text) from anon;
grant execute on function public.mover_candidatura_rrhh(text, text, text, text, text, text) to authenticated, service_role;

revoke execute on function public.nuevo_contrato_periodo_sociedad(text, uuid, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) from public;
revoke execute on function public.nuevo_contrato_periodo_sociedad(text, uuid, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) from anon;
grant execute on function public.nuevo_contrato_periodo_sociedad(text, uuid, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) from public;
revoke execute on function public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) from anon;
grant execute on function public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.personal_documentos_puede_forzar_retro(text, text) from public;
revoke execute on function public.personal_documentos_puede_forzar_retro(text, text) from anon;
grant execute on function public.personal_documentos_puede_forzar_retro(text, text) to authenticated, service_role;

revoke execute on function public.portal_campo_datos_permitido(text, text) from public;
revoke execute on function public.portal_campo_datos_permitido(text, text) from anon;
grant execute on function public.portal_campo_datos_permitido(text, text) to authenticated, service_role;

revoke execute on function public.recalcular_snapshot_roster_dirigido(text, text, integer, integer, text, jsonb, text, boolean, text) from public;
revoke execute on function public.recalcular_snapshot_roster_dirigido(text, text, integer, integer, text, jsonb, text, boolean, text) from anon;
grant execute on function public.recalcular_snapshot_roster_dirigido(text, text, integer, integer, text, jsonb, text, boolean, text) to authenticated, service_role;

revoke execute on function public.registrar_pago_financiamiento(text, text, numeric, text, integer, numeric, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.registrar_pago_financiamiento(text, text, numeric, text, integer, numeric, jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.registrar_pago_financiamiento(text, text, numeric, text, integer, numeric, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

revoke execute on function public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text) from public;
revoke execute on function public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text) from anon;
grant execute on function public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text) to authenticated, service_role;

revoke execute on function public.resolver_mi_personal_rrhh() from public;
revoke execute on function public.resolver_mi_personal_rrhh() from anon;
grant execute on function public.resolver_mi_personal_rrhh() to authenticated, service_role;

revoke execute on function public.resolver_precio_servicio_cliente(text, text, text, date) from public;
revoke execute on function public.resolver_precio_servicio_cliente(text, text, text, date) from anon;
grant execute on function public.resolver_precio_servicio_cliente(text, text, text, date) to authenticated, service_role;

revoke execute on function public.roster_ajuste_periodo_procesado(text, text, text, date) from public;
revoke execute on function public.roster_ajuste_periodo_procesado(text, text, text, date) from anon;
grant execute on function public.roster_ajuste_periodo_procesado(text, text, text, date) to authenticated, service_role;

revoke execute on function public.siguiente_numero_cotizacion(text) from public;
revoke execute on function public.siguiente_numero_cotizacion(text) from anon;
grant execute on function public.siguiente_numero_cotizacion(text) to authenticated, service_role;

revoke execute on function public.siguiente_numero_parte_diario(text) from public;
revoke execute on function public.siguiente_numero_parte_diario(text) from anon;
grant execute on function public.siguiente_numero_parte_diario(text) to authenticated, service_role;

revoke execute on function public.subir_documento_personal_sociedad(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public;
revoke execute on function public.subir_documento_personal_sociedad(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from anon;
grant execute on function public.subir_documento_personal_sociedad(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public;
revoke execute on function public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from anon;
grant execute on function public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public;
revoke execute on function public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from anon;
grant execute on function public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.ticket_sla_estado(timestamp with time zone, timestamp with time zone, text) from public;
revoke execute on function public.ticket_sla_estado(timestamp with time zone, timestamp with time zone, text) from anon;
grant execute on function public.ticket_sla_estado(timestamp with time zone, timestamp with time zone, text) to authenticated, service_role;

revoke execute on function public.tideo_salud_personal_tideo_tiene_acceso(text) from public;
revoke execute on function public.tideo_salud_personal_tideo_tiene_acceso(text) from anon;
grant execute on function public.tideo_salud_personal_tideo_tiene_acceso(text) to authenticated, service_role;

revoke execute on function public.usuario_es_admin_empresa(text) from public;
revoke execute on function public.usuario_es_admin_empresa(text) from anon;
grant execute on function public.usuario_es_admin_empresa(text) to authenticated, service_role;

revoke execute on function public.usuario_es_superadmin_plataforma() from public;
revoke execute on function public.usuario_es_superadmin_plataforma() from anon;
grant execute on function public.usuario_es_superadmin_plataforma() to authenticated, service_role;

revoke execute on function public.usuario_puede_aprobar_hoja_costeo(text, uuid) from public;
revoke execute on function public.usuario_puede_aprobar_hoja_costeo(text, uuid) from anon;
grant execute on function public.usuario_puede_aprobar_hoja_costeo(text, uuid) to authenticated, service_role;

revoke execute on function public.usuario_puede_ver_registro(text, uuid, text, text, text) from public;
revoke execute on function public.usuario_puede_ver_registro(text, uuid, text, text, text) from anon;
grant execute on function public.usuario_puede_ver_registro(text, uuid, text, text, text) to authenticated, service_role;

revoke execute on function public.usuario_puede_ver_usuario(text, uuid) from public;
revoke execute on function public.usuario_puede_ver_usuario(text, uuid) from anon;
grant execute on function public.usuario_puede_ver_usuario(text, uuid) to authenticated, service_role;

revoke execute on function public.usuario_puede(text, text, text) from public;
revoke execute on function public.usuario_puede(text, text, text) from anon;
grant execute on function public.usuario_puede(text, text, text) to authenticated, service_role;

revoke execute on function public.usuario_responsable_fondo_caja(text) from public;
revoke execute on function public.usuario_responsable_fondo_caja(text) from anon;
grant execute on function public.usuario_responsable_fondo_caja(text) to authenticated, service_role;

revoke execute on function public.usuario_tiene_empresa(text) from public;
revoke execute on function public.usuario_tiene_empresa(text) from anon;
grant execute on function public.usuario_tiene_empresa(text) to authenticated, service_role;

revoke execute on function public.validar_documento_personal_multisoc(text, text, text) from public;
revoke execute on function public.validar_documento_personal_multisoc(text, text, text) from anon;
grant execute on function public.validar_documento_personal_multisoc(text, text, text) to authenticated, service_role;

revoke execute on function public.vigencia_efectiva(text, date, text, text) from public;
revoke execute on function public.vigencia_efectiva(text, date, text, text) from anon;
grant execute on function public.vigencia_efectiva(text, date, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Funciones internas disponibles solo para service_role (27).
-- ---------------------------------------------------------------------------

revoke execute on function public.calcular_dias_habiles(date, date) from public;
revoke execute on function public.calcular_dias_habiles(date, date) from anon;
revoke execute on function public.calcular_dias_habiles(date, date) from authenticated;
grant execute on function public.calcular_dias_habiles(date, date) to service_role;

revoke execute on function public.desempeno_personal_auth_user(text, text) from public;
revoke execute on function public.desempeno_personal_auth_user(text, text) from anon;
revoke execute on function public.desempeno_personal_auth_user(text, text) from authenticated;
grant execute on function public.desempeno_personal_auth_user(text, text) to service_role;

revoke execute on function public.estado_vencimiento_doc(date) from public;
revoke execute on function public.estado_vencimiento_doc(date) from anon;
revoke execute on function public.estado_vencimiento_doc(date) from authenticated;
grant execute on function public.estado_vencimiento_doc(date) to service_role;

revoke execute on function public.generar_codigo_sociedad_unico(text, text) from public;
revoke execute on function public.generar_codigo_sociedad_unico(text, text) from anon;
revoke execute on function public.generar_codigo_sociedad_unico(text, text) from authenticated;
grant execute on function public.generar_codigo_sociedad_unico(text, text) to service_role;

revoke execute on function public.generar_codigo_tenant(text) from public;
revoke execute on function public.generar_codigo_tenant(text) from anon;
revoke execute on function public.generar_codigo_tenant(text) from authenticated;
grant execute on function public.generar_codigo_tenant(text) to service_role;

revoke execute on function public.geo_distancia_m(double precision, double precision, double precision, double precision) from public;
revoke execute on function public.geo_distancia_m(double precision, double precision, double precision, double precision) from anon;
revoke execute on function public.geo_distancia_m(double precision, double precision, double precision, double precision) from authenticated;
grant execute on function public.geo_distancia_m(double precision, double precision, double precision, double precision) to service_role;

revoke execute on function public.normalizar_slug_tideo(text, integer, boolean) from public;
revoke execute on function public.normalizar_slug_tideo(text, integer, boolean) from anon;
revoke execute on function public.normalizar_slug_tideo(text, integer, boolean) from authenticated;
grant execute on function public.normalizar_slug_tideo(text, integer, boolean) to service_role;

revoke execute on function public.obtener_sociedad_de_ot(text) from public;
revoke execute on function public.obtener_sociedad_de_ot(text) from anon;
revoke execute on function public.obtener_sociedad_de_ot(text) from authenticated;
grant execute on function public.obtener_sociedad_de_ot(text) to service_role;

revoke execute on function public.personal_posicion_esta_activa(text, text) from public;
revoke execute on function public.personal_posicion_esta_activa(text, text) from anon;
revoke execute on function public.personal_posicion_esta_activa(text, text) from authenticated;
grant execute on function public.personal_posicion_esta_activa(text, text) to service_role;

revoke execute on function public.punto_en_poligono(double precision, double precision, jsonb) from public;
revoke execute on function public.punto_en_poligono(double precision, double precision, jsonb) from anon;
revoke execute on function public.punto_en_poligono(double precision, double precision, jsonb) from authenticated;
grant execute on function public.punto_en_poligono(double precision, double precision, jsonb) to service_role;

revoke execute on function public.recalcular_dias_sin_actividad_lead(text) from public;
revoke execute on function public.recalcular_dias_sin_actividad_lead(text) from anon;
revoke execute on function public.recalcular_dias_sin_actividad_lead(text) from authenticated;
grant execute on function public.recalcular_dias_sin_actividad_lead(text) to service_role;

revoke execute on function public.recalcular_dias_sin_actividad_leads_empresa(text) from public;
revoke execute on function public.recalcular_dias_sin_actividad_leads_empresa(text) from anon;
revoke execute on function public.recalcular_dias_sin_actividad_leads_empresa(text) from authenticated;
grant execute on function public.recalcular_dias_sin_actividad_leads_empresa(text) to service_role;

revoke execute on function public.resolver_jefe_desde_posicion(uuid, uuid) from public;
revoke execute on function public.resolver_jefe_desde_posicion(uuid, uuid) from anon;
revoke execute on function public.resolver_jefe_desde_posicion(uuid, uuid) from authenticated;
grant execute on function public.resolver_jefe_desde_posicion(uuid, uuid) to service_role;

revoke execute on function public.resolver_posicion_principal_jefe(text, uuid) from public;
revoke execute on function public.resolver_posicion_principal_jefe(text, uuid) from anon;
revoke execute on function public.resolver_posicion_principal_jefe(text, uuid) from authenticated;
grant execute on function public.resolver_posicion_principal_jefe(text, uuid) to service_role;

revoke execute on function public.responsable_solpe_reorden(text, uuid) from public;
revoke execute on function public.responsable_solpe_reorden(text, uuid) from anon;
revoke execute on function public.responsable_solpe_reorden(text, uuid) from authenticated;
grant execute on function public.responsable_solpe_reorden(text, uuid) to service_role;

revoke execute on function public.siguiente_numero_ticket(text) from public;
revoke execute on function public.siguiente_numero_ticket(text) from anon;
revoke execute on function public.siguiente_numero_ticket(text) from authenticated;
grant execute on function public.siguiente_numero_ticket(text) to service_role;

revoke execute on function public.ticket_fecha_limite_sla(text, timestamp with time zone) from public;
revoke execute on function public.ticket_fecha_limite_sla(text, timestamp with time zone) from anon;
revoke execute on function public.ticket_fecha_limite_sla(text, timestamp with time zone) from authenticated;
grant execute on function public.ticket_fecha_limite_sla(text, timestamp with time zone) to service_role;

revoke execute on function public.tideo_salud_contar_configuracion(text, text, text, text, text, text) from public;
revoke execute on function public.tideo_salud_contar_configuracion(text, text, text, text, text, text) from anon;
revoke execute on function public.tideo_salud_contar_configuracion(text, text, text, text, text, text) from authenticated;
grant execute on function public.tideo_salud_contar_configuracion(text, text, text, text, text, text) to service_role;

revoke execute on function public.tideo_salud_usuario_actual_es_personal_tideo() from public;
revoke execute on function public.tideo_salud_usuario_actual_es_personal_tideo() from anon;
revoke execute on function public.tideo_salud_usuario_actual_es_personal_tideo() from authenticated;
grant execute on function public.tideo_salud_usuario_actual_es_personal_tideo() to service_role;

revoke execute on function public.tideo_salud_usuario_es_responsable_tideo(text, text) from public;
revoke execute on function public.tideo_salud_usuario_es_responsable_tideo(text, text) from anon;
revoke execute on function public.tideo_salud_usuario_es_responsable_tideo(text, text) from authenticated;
grant execute on function public.tideo_salud_usuario_es_responsable_tideo(text, text) to service_role;

revoke execute on function public.tideo_salud_usuario_pertenece_tenant(text, text) from public;
revoke execute on function public.tideo_salud_usuario_pertenece_tenant(text, text) from anon;
revoke execute on function public.tideo_salud_usuario_pertenece_tenant(text, text) from authenticated;
grant execute on function public.tideo_salud_usuario_pertenece_tenant(text, text) to service_role;

revoke execute on function public.usuario_alcance_jerarquico(text) from public;
revoke execute on function public.usuario_alcance_jerarquico(text) from anon;
revoke execute on function public.usuario_alcance_jerarquico(text) from authenticated;
grant execute on function public.usuario_alcance_jerarquico(text) to service_role;

revoke execute on function public.validar_api_key(text, text) from public;
revoke execute on function public.validar_api_key(text, text) from anon;
revoke execute on function public.validar_api_key(text, text) from authenticated;
grant execute on function public.validar_api_key(text, text) to service_role;

revoke execute on function public.validar_documento_personal(text, text, text) from public;
revoke execute on function public.validar_documento_personal(text, text, text) from anon;
revoke execute on function public.validar_documento_personal(text, text, text) from authenticated;
grant execute on function public.validar_documento_personal(text, text, text) to service_role;

revoke execute on function public.validar_geofence_asistencia(text, text, text, text, double precision, double precision, numeric, text, date) from public;
revoke execute on function public.validar_geofence_asistencia(text, text, text, text, double precision, double precision, numeric, text, date) from anon;
revoke execute on function public.validar_geofence_asistencia(text, text, text, text, double precision, double precision, numeric, text, date) from authenticated;
grant execute on function public.validar_geofence_asistencia(text, text, text, text, double precision, double precision, numeric, text, date) to service_role;

revoke execute on function public.vigencia_efectiva_core(text, date, text, text) from public;
revoke execute on function public.vigencia_efectiva_core(text, date, text, text) from anon;
revoke execute on function public.vigencia_efectiva_core(text, date, text, text) from authenticated;
grant execute on function public.vigencia_efectiva_core(text, date, text, text) to service_role;

revoke execute on function public.whatsapp_tipo_alerta_desde_notificacion(text, jsonb) from public;
revoke execute on function public.whatsapp_tipo_alerta_desde_notificacion(text, jsonb) from anon;
revoke execute on function public.whatsapp_tipo_alerta_desde_notificacion(text, jsonb) from authenticated;
grant execute on function public.whatsapp_tipo_alerta_desde_notificacion(text, jsonb) to service_role;
